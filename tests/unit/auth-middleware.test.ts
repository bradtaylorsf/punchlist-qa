import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TokenAuthAdapter } from '../../src/adapters/auth/token.js';
import { SqliteAdapter } from '../../src/adapters/storage/sqlite-adapter.js';
import {
  parseCookie,
  buildSetCookie,
  buildClearCookie,
  handleLogin,
  handleLogout,
  authenticateRequest,
} from '../../src/adapters/auth/middleware.js';

const secret = 'a-very-long-secret-for-testing-purposes-minimum-16-chars';
let storage: SqliteAdapter;
let auth: TokenAuthAdapter;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'punchlist-mw-test-'));
  storage = new SqliteAdapter({ dbPath: join(tmpDir, 'test.db') });
  await storage.initialize();
  auth = new TokenAuthAdapter({ secret, storage });
});

afterEach(async () => {
  await storage.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('parseCookie', () => {
  it('extracts named cookie from header', () => {
    expect(parseCookie('foo=bar; punchlist_session=abc123; baz=qux', 'punchlist_session')).toBe('abc123');
  });

  it('returns undefined for missing cookie', () => {
    expect(parseCookie('foo=bar', 'punchlist_session')).toBeUndefined();
  });

  it('returns undefined for undefined header', () => {
    expect(parseCookie(undefined, 'punchlist_session')).toBeUndefined();
  });

  it('handles cookie with = in value', () => {
    expect(parseCookie('token=abc=def', 'token')).toBe('abc=def');
  });

  it('handles empty header', () => {
    expect(parseCookie('', 'punchlist_session')).toBeUndefined();
  });
});

describe('buildSetCookie', () => {
  it('builds correct Set-Cookie header', () => {
    const cookie = buildSetCookie('punchlist_session', 'sid123', { secure: false });
    expect(cookie).toContain('punchlist_session=sid123');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=');
    expect(cookie).not.toContain('Secure');
  });

  it('includes Secure flag when specified', () => {
    const cookie = buildSetCookie('punchlist_session', 'sid123', { secure: true });
    expect(cookie).toContain('Secure');
  });
});

describe('buildClearCookie', () => {
  it('builds clear cookie with Max-Age=0', () => {
    const cookie = buildClearCookie('punchlist_session', { secure: false });
    expect(cookie).toContain('punchlist_session=');
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('HttpOnly');
  });
});

describe('handleLogin', () => {
  it('creates session and returns cookie for valid token', async () => {
    await auth.createInvite('alice@example.com', 'Alice', 'admin@example.com');
    const token = auth.generateToken('alice@example.com');

    // We need to associate the token with the user — the invite already created a user,
    // but the login token needs to match a valid user. Since createInvite already
    // created the user, and validateToken just validates HMAC, createSession looks up by email.
    const result = await handleLogin(auth, token, { secure: false });

    expect('sessionId' in result).toBe(true);
    if ('sessionId' in result) {
      expect(result.sessionId).toBeTruthy();
      expect(result.cookie).toContain('punchlist_session=');
    }
  });

  it('returns error for invalid token', async () => {
    const result = await handleLogin(auth, 'invalid-token', { secure: false });

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.status).toBe(401);
    }
  });

  it('returns error for revoked user', async () => {
    await auth.createInvite('alice@example.com', 'Alice', 'admin@example.com');
    await auth.revokeAccess('alice@example.com');
    const token = auth.generateToken('alice@example.com');

    const result = await handleLogin(auth, token, { secure: false });

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.status).toBe(403);
    }
  });
});

describe('handleLogout', () => {
  it('clears session and returns clear-cookie', async () => {
    await auth.createInvite('alice@example.com', 'Alice', 'admin@example.com');
    const sessionId = await auth.createSession('alice@example.com');

    const result = await handleLogout(auth, sessionId, { secure: false });

    expect(result.cookie).toContain('Max-Age=0');

    // Session should be destroyed
    const user = await auth.validateSession(sessionId);
    expect(user).toBeNull();
  });
});

describe('authenticateRequest', () => {
  it('returns user for valid session cookie', async () => {
    await auth.createInvite('alice@example.com', 'Alice', 'admin@example.com');
    const sessionId = await auth.createSession('alice@example.com');
    const cookieHeader = `punchlist_session=${sessionId}`;

    const user = await authenticateRequest(auth, cookieHeader);
    expect(user).not.toBeNull();
    expect(user!.email).toBe('alice@example.com');
  });

  it('returns null for expired session', async () => {
    const shortAuth = new TokenAuthAdapter({ secret, storage, sessionTtlMs: 1 });
    await shortAuth.createInvite('alice@example.com', 'Alice', 'admin@example.com');
    const sessionId = await shortAuth.createSession('alice@example.com');

    await new Promise(resolve => setTimeout(resolve, 10));

    const cookieHeader = `punchlist_session=${sessionId}`;
    const user = await authenticateRequest(shortAuth, cookieHeader);
    expect(user).toBeNull();
  });

  it('returns null for revoked user', async () => {
    await auth.createInvite('alice@example.com', 'Alice', 'admin@example.com');
    const sessionId = await auth.createSession('alice@example.com');
    await auth.revokeAccess('alice@example.com');

    const cookieHeader = `punchlist_session=${sessionId}`;
    const user = await authenticateRequest(auth, cookieHeader);
    expect(user).toBeNull();
  });

  it('returns null when no cookie header', async () => {
    const user = await authenticateRequest(auth, undefined);
    expect(user).toBeNull();
  });

  it('returns null when session cookie missing from header', async () => {
    const user = await authenticateRequest(auth, 'other_cookie=value');
    expect(user).toBeNull();
  });
});

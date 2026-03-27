/**
 * Tests for the invite token functions that replaced TokenAuthAdapter.
 * These cover generateToken, validateToken, hashToken, buildInviteUrl, and
 * the full invite + login via token flow using SqliteAdapter.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteAdapter } from '../../src/adapters/storage/sqlite-adapter.js';
import {
  generateToken,
  validateToken,
  hashToken,
  buildInviteUrl,
} from '../../src/server/auth/invite.js';
import { InvalidTokenError, UnrecognizedTokenError, RevokedUserError } from '../../src/adapters/auth/errors.js';

const secret = 'a-very-long-secret-for-testing-purposes-minimum-16-chars';
let storage: SqliteAdapter;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'punchlist-auth-test-'));
  storage = new SqliteAdapter({ dbPath: join(tmpDir, 'test.db') });
  await storage.initialize();
});

afterEach(async () => {
  await storage.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('generateToken', () => {
  it('generates a non-empty token', () => {
    const token = generateToken(secret, 'user@example.com');
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('generates different tokens for the same email (nonce randomness)', () => {
    const t1 = generateToken(secret, 'user@example.com');
    const t2 = generateToken(secret, 'user@example.com');
    expect(t1).not.toBe(t2);
  });

  it('generates base64url-safe tokens (no +, /, or =)', () => {
    const token = generateToken(secret, 'user@example.com');
    expect(token).not.toMatch(/[+/=]/);
  });
});

describe('validateToken', () => {
  it('validates a token it generated', () => {
    const token = generateToken(secret, 'user@example.com');
    const result = validateToken(secret, token);
    expect(result.valid).toBe(true);
    expect(result.email).toBe('user@example.com');
  });

  it('rejects a tampered token', () => {
    const token = generateToken(secret, 'user@example.com');
    const tampered = token.slice(0, -2) + 'XX';
    expect(validateToken(secret, tampered).valid).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    const token = generateToken(secret, 'user@example.com');
    expect(validateToken('different-secret-also-long-enough', token).valid).toBe(false);
  });

  it('rejects garbage input', () => {
    expect(validateToken(secret, '').valid).toBe(false);
    expect(validateToken(secret, 'not-a-token').valid).toBe(false);
    expect(validateToken(secret, 'YWJj').valid).toBe(false);
  });

  it('handles emails with special characters', () => {
    const token = generateToken(secret, 'user+tag@example.com');
    const result = validateToken(secret, token);
    expect(result.valid).toBe(true);
    expect(result.email).toBe('user+tag@example.com');
  });
});

describe('invite flow (generateToken + storage)', () => {
  it('creates user with hashed token and returns invite URL', async () => {
    const token = generateToken(secret, 'alice@example.com');
    const tokenHash = hashToken(token);

    const user = await storage.createUser({
      email: 'alice@example.com',
      name: 'Alice',
      tokenHash,
      role: 'tester',
      invitedBy: 'admin@example.com',
    });

    expect(user.email).toBe('alice@example.com');
    expect(user.name).toBe('Alice');
    expect(user.role).toBe('tester');
    expect(user.revoked).toBe(false);
    expect(user.tokenHash).toBe(tokenHash);
    expect(user.tokenHash).not.toBe(token); // stored as hash, not raw

    const inviteUrl = buildInviteUrl('https://app.test', token);
    expect(inviteUrl).toMatch(/^https:\/\/app\.test\/join\?token=/);

    // Verify user is retrievable by token hash
    const stored = await storage.getUserByTokenHash(tokenHash);
    expect(stored).not.toBeNull();
    expect(stored!.email).toBe('alice@example.com');
  });

  it('uses custom role when specified', async () => {
    const token = generateToken(secret, 'admin@example.com');
    const user = await storage.createUser({
      email: 'admin@example.com',
      name: 'Admin',
      tokenHash: hashToken(token),
      role: 'admin',
      invitedBy: 'root@example.com',
    });
    expect(user.role).toBe('admin');
  });

  it('URL-encodes the token in invite URL', async () => {
    const token = generateToken(secret, 'alice@example.com');
    const inviteUrl = buildInviteUrl('https://app.test', token);
    const url = new URL(inviteUrl);
    expect(url.searchParams.get('token')).toBe(token);
  });

  it('throws on duplicate email', async () => {
    const t1 = generateToken(secret, 'alice@example.com');
    const t2 = generateToken(secret, 'alice@example.com');
    await storage.createUser({ email: 'alice@example.com', name: 'Alice', tokenHash: hashToken(t1), role: 'tester', invitedBy: 'admin@example.com' });
    await expect(
      storage.createUser({ email: 'alice@example.com', name: 'Alice2', tokenHash: hashToken(t2), role: 'tester', invitedBy: 'admin@example.com' }),
    ).rejects.toThrow();
  });
});

describe('revocation', () => {
  it('delegates to storage.revokeUser', async () => {
    const token = generateToken(secret, 'alice@example.com');
    await storage.createUser({ email: 'alice@example.com', name: 'Alice', tokenHash: hashToken(token), role: 'tester', invitedBy: 'admin@example.com' });
    await storage.revokeUser('alice@example.com');

    const user = await storage.getUserByEmail('alice@example.com');
    expect(user!.revoked).toBe(true);
  });

  it('is a no-op for non-existent user', async () => {
    await expect(storage.revokeUser('nobody@example.com')).resolves.toBeUndefined();
  });
});

describe('listUsers', () => {
  it('returns all users from storage', async () => {
    await storage.createUser({ email: 'alice@example.com', name: 'Alice', tokenHash: hashToken(generateToken(secret, 'alice@example.com')), role: 'tester', invitedBy: 'admin@example.com' });
    await storage.createUser({ email: 'bob@example.com', name: 'Bob', tokenHash: hashToken(generateToken(secret, 'bob@example.com')), role: 'tester', invitedBy: 'admin@example.com' });

    const users = await storage.listUsers();
    expect(users).toHaveLength(2);
  });
});

describe('token-based login flow', () => {
  it('looks up user by token hash for a valid token', async () => {
    const token = generateToken(secret, 'alice@example.com');
    const tokenHash = hashToken(token);
    await storage.createUser({ email: 'alice@example.com', name: 'Alice', tokenHash, role: 'tester', invitedBy: 'admin@example.com' });

    // Simulate what the auth route does: validate + hash + getUserByTokenHash
    const validation = validateToken(secret, token);
    expect(validation.valid).toBe(true);

    const hash = hashToken(token);
    const user = await storage.getUserByTokenHash(hash);
    expect(user).not.toBeNull();
    expect(user!.email).toBe('alice@example.com');
  });

  it('rejects a valid HMAC token whose hash is not in storage', async () => {
    await storage.createUser({ email: 'alice@example.com', name: 'Alice', tokenHash: hashToken(generateToken(secret, 'alice@example.com')), role: 'tester', invitedBy: 'admin@example.com' });

    // Generate a fresh token — valid HMAC but different nonce → different hash
    const freshToken = generateToken(secret, 'alice@example.com');
    const validation = validateToken(secret, freshToken);
    expect(validation.valid).toBe(true);

    const user = await storage.getUserByTokenHash(hashToken(freshToken));
    expect(user).toBeNull();

    // Simulate route throwing UnrecognizedTokenError
    if (!user) {
      expect(() => { throw new UnrecognizedTokenError(); }).toThrow('Token not recognized');
    }
  });

  it('detects revoked user', async () => {
    const token = generateToken(secret, 'alice@example.com');
    const tokenHash = hashToken(token);
    await storage.createUser({ email: 'alice@example.com', name: 'Alice', tokenHash, role: 'tester', invitedBy: 'admin@example.com' });
    await storage.revokeUser('alice@example.com');

    const user = await storage.getUserByTokenHash(tokenHash);
    expect(user).not.toBeNull();
    expect(user!.revoked).toBe(true);

    if (user!.revoked) {
      expect(() => { throw new RevokedUserError(); }).toThrow('revoked');
    }
  });

  it('rejects invalid token', () => {
    const validation = validateToken(secret, 'garbage-token');
    expect(validation.valid).toBe(false);

    if (!validation.valid) {
      expect(() => { throw new InvalidTokenError(); }).toThrow('Invalid');
    }
  });
});

describe('countUsers', () => {
  it('returns 0 when no users', async () => {
    expect(await storage.countUsers()).toBe(0);
  });

  it('returns the correct count after creating users', async () => {
    await storage.createUser({ email: 'alice@example.com', name: 'Alice', tokenHash: hashToken(generateToken(secret, 'alice@example.com')), role: 'tester', invitedBy: 'admin@example.com' });
    expect(await storage.countUsers()).toBe(1);
    await storage.createUser({ email: 'bob@example.com', name: 'Bob', tokenHash: hashToken(generateToken(secret, 'bob@example.com')), role: 'tester', invitedBy: 'admin@example.com' });
    expect(await storage.countUsers()).toBe(2);
  });
});

describe('updateUserPasswordHash / getUserPasswordHash', () => {
  it('stores and retrieves a password hash', async () => {
    const token = generateToken(secret, 'alice@example.com');
    await storage.createUser({ email: 'alice@example.com', name: 'Alice', tokenHash: hashToken(token), role: 'tester', invitedBy: 'admin@example.com' });

    expect(await storage.getUserPasswordHash('alice@example.com')).toBeNull();

    await storage.updateUserPasswordHash('alice@example.com', 'hashed-password-value');
    expect(await storage.getUserPasswordHash('alice@example.com')).toBe('hashed-password-value');
  });

  it('returns null for non-existent user', async () => {
    expect(await storage.getUserPasswordHash('nobody@example.com')).toBeNull();
  });
});

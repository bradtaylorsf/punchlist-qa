import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TokenAuthAdapter } from '../../src/adapters/auth/token.js';
import { SqliteAdapter } from '../../src/adapters/storage/sqlite-adapter.js';

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

describe('TokenAuthAdapter', () => {
  describe('constructor', () => {
    it('should create an adapter with a valid secret', () => {
      expect(() => new TokenAuthAdapter({ secret, storage })).not.toThrow();
    });

    it('should throw with a short secret', () => {
      expect(() => new TokenAuthAdapter({ secret: 'short', storage })).toThrow('at least 16 characters');
    });

    it('should throw with an empty secret', () => {
      expect(() => new TokenAuthAdapter({ secret: '', storage })).toThrow();
    });
  });

  describe('generateToken', () => {
    it('should generate a non-empty token', () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      const token = auth.generateToken('user@example.com');
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should generate different tokens for the same email (due to nonce)', () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      const token1 = auth.generateToken('user@example.com');
      const token2 = auth.generateToken('user@example.com');
      expect(token1).not.toBe(token2);
    });

    it('should generate base64url-safe tokens', () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      const token = auth.generateToken('user@example.com');
      expect(token).not.toMatch(/[+/=]/);
    });
  });

  describe('validateToken', () => {
    it('should validate a token it generated', () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      const token = auth.generateToken('user@example.com');
      const result = auth.validateToken(token);
      expect(result.valid).toBe(true);
      expect(result.email).toBe('user@example.com');
    });

    it('should reject a tampered token', () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      const token = auth.generateToken('user@example.com');
      const tampered = token.slice(0, -2) + 'XX';
      const result = auth.validateToken(tampered);
      expect(result.valid).toBe(false);
    });

    it('should reject a token signed with a different secret', () => {
      const auth1 = new TokenAuthAdapter({ secret, storage });
      const auth2 = new TokenAuthAdapter({ secret: 'different-secret-also-long-enough', storage });
      const token = auth1.generateToken('user@example.com');
      const result = auth2.validateToken(token);
      expect(result.valid).toBe(false);
    });

    it('should reject garbage input', () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      expect(auth.validateToken('').valid).toBe(false);
      expect(auth.validateToken('not-a-token').valid).toBe(false);
      expect(auth.validateToken('YWJj').valid).toBe(false);
    });

    it('should handle emails with special characters', () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      const token = auth.generateToken('user+tag@example.com');
      const result = auth.validateToken(token);
      expect(result.valid).toBe(true);
      expect(result.email).toBe('user+tag@example.com');
    });
  });

  describe('invite flow', () => {
    it('creates user in storage with hashed token and returns invite URL', async () => {
      const auth = new TokenAuthAdapter({ secret, storage, baseUrl: 'https://app.test' });
      const result = await auth.createInvite('alice@example.com', 'Alice', 'admin@example.com');

      expect(result.user.email).toBe('alice@example.com');
      expect(result.user.name).toBe('Alice');
      expect(result.user.role).toBe('tester');
      expect(result.user.revoked).toBe(false);
      expect(result.token).toBeTruthy();
      expect(result.inviteUrl).toMatch(/^https:\/\/app\.test\/join\?token=/);

      // Verify user is stored
      const stored = await storage.getUserByEmail('alice@example.com');
      expect(stored).not.toBeNull();
      expect(stored!.tokenHash).not.toBe(result.token); // stored as hash, not raw
    });

    it('uses custom role when specified', async () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      const result = await auth.createInvite('admin@example.com', 'Admin', 'root@example.com', { role: 'admin' });

      expect(result.user.role).toBe('admin');
    });

    it('uses custom baseUrl when specified in options', async () => {
      const auth = new TokenAuthAdapter({ secret, storage, baseUrl: 'https://default.test' });
      const result = await auth.createInvite('alice@example.com', 'Alice', 'admin@example.com', {
        baseUrl: 'https://custom.test',
      });

      expect(result.inviteUrl).toMatch(/^https:\/\/custom\.test\/join\?token=/);
    });

    it('throws on duplicate email', async () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      await auth.createInvite('alice@example.com', 'Alice', 'admin@example.com');
      await expect(
        auth.createInvite('alice@example.com', 'Alice2', 'admin@example.com'),
      ).rejects.toThrow();
    });
  });

  describe('revocation', () => {
    it('delegates to storage.revokeUser', async () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      await auth.createInvite('alice@example.com', 'Alice', 'admin@example.com');

      await auth.revokeAccess('alice@example.com');

      const user = await storage.getUserByEmail('alice@example.com');
      expect(user!.revoked).toBe(true);
    });

    it('throws when revoking non-existent user', async () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      await expect(auth.revokeAccess('nobody@example.com')).rejects.toThrow('User not found');
    });
  });

  describe('listUsers', () => {
    it('returns all users from storage', async () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      await auth.createInvite('alice@example.com', 'Alice', 'admin@example.com');
      await auth.createInvite('bob@example.com', 'Bob', 'admin@example.com');

      const users = await auth.listUsers();
      expect(users).toHaveLength(2);
    });
  });

  describe('sessions', () => {
    it('creates and validates a session round-trip', async () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      await auth.createInvite('alice@example.com', 'Alice', 'admin@example.com');

      const sessionId = await auth.createSession('alice@example.com');
      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe('string');

      const user = await auth.validateSession(sessionId);
      expect(user).not.toBeNull();
      expect(user!.email).toBe('alice@example.com');
    });

    it('returns null for non-existent session', async () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      const user = await auth.validateSession('non-existent-session-id');
      expect(user).toBeNull();
    });

    it('destroySession removes the session', async () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      await auth.createInvite('alice@example.com', 'Alice', 'admin@example.com');

      const sessionId = await auth.createSession('alice@example.com');
      await auth.destroySession(sessionId);

      const user = await auth.validateSession(sessionId);
      expect(user).toBeNull();
    });

    it('throws when creating session for non-existent user', async () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      await expect(auth.createSession('nobody@example.com')).rejects.toThrow('User not found');
    });

    it('throws when creating session for revoked user', async () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      await auth.createInvite('alice@example.com', 'Alice', 'admin@example.com');
      await auth.revokeAccess('alice@example.com');

      await expect(auth.createSession('alice@example.com')).rejects.toThrow('revoked');
    });

    it('returns null for revoked user session', async () => {
      const auth = new TokenAuthAdapter({ secret, storage });
      await auth.createInvite('alice@example.com', 'Alice', 'admin@example.com');
      const sessionId = await auth.createSession('alice@example.com');

      await auth.revokeAccess('alice@example.com');

      const user = await auth.validateSession(sessionId);
      expect(user).toBeNull();
    });

    it('returns null for expired session', async () => {
      const auth = new TokenAuthAdapter({ secret, storage, sessionTtlMs: 1 });
      await auth.createInvite('alice@example.com', 'Alice', 'admin@example.com');
      const sessionId = await auth.createSession('alice@example.com');

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 10));

      const user = await auth.validateSession(sessionId);
      expect(user).toBeNull();
    });
  });
});

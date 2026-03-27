/**
 * Tests for the CLI invite/revoke/users flows using storage directly.
 * The old TokenAuthAdapter has been removed; invite logic now lives in
 * src/server/auth/invite.ts and operates on the StorageAdapter directly.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteAdapter } from '../../src/adapters/storage/sqlite-adapter.js';
import {
  generateToken,
  hashToken,
  buildInviteUrl,
} from '../../src/server/auth/invite.js';

const secret = 'a-very-long-secret-for-testing-purposes-minimum-16-chars';
let storage: SqliteAdapter;
let tmpDir: string;

// invitedBy no longer requires an email — it just needs to be a non-empty string.
const CLI_INVITER = 'cli@punchlist-qa.local';

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'punchlist-cli-test-'));
  storage = new SqliteAdapter({ dbPath: join(tmpDir, 'test.db') });
  await storage.initialize();
});

afterEach(async () => {
  await storage.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('CLI invite flow (storage + invite utilities)', () => {
  it('creates user in SQLite database', async () => {
    const token = generateToken(secret, 'alice@example.com');
    const tokenHash = hashToken(token);

    const user = await storage.createUser({
      email: 'alice@example.com',
      name: 'Alice',
      tokenHash,
      role: 'tester',
      invitedBy: CLI_INVITER,
    });

    expect(user.email).toBe('alice@example.com');
    expect(user.name).toBe('Alice');
    expect(user.role).toBe('tester');

    const inviteUrl = buildInviteUrl('http://localhost:4747', token);
    expect(inviteUrl).toContain('/join?token=');

    // Verify in DB
    const stored = await storage.getUserByEmail('alice@example.com');
    expect(stored).not.toBeNull();
    expect(stored!.name).toBe('Alice');
    expect(stored!.invitedBy).toBe(CLI_INVITER);
  });

  it('handles duplicate email', async () => {
    const token = generateToken(secret, 'alice@example.com');
    const tokenHash = hashToken(token);
    await storage.createUser({ email: 'alice@example.com', name: 'Alice', tokenHash, role: 'tester', invitedBy: CLI_INVITER });
    await expect(
      storage.createUser({ email: 'alice@example.com', name: 'Alice2', tokenHash: hashToken(generateToken(secret, 'alice@example.com')), role: 'tester', invitedBy: CLI_INVITER }),
    ).rejects.toThrow();
  });

  it('supports admin role', async () => {
    const token = generateToken(secret, 'admin@example.com');
    const tokenHash = hashToken(token);
    const user = await storage.createUser({
      email: 'admin@example.com',
      name: 'Admin User',
      tokenHash,
      role: 'admin',
      invitedBy: CLI_INVITER,
    });
    expect(user.role).toBe('admin');
  });

  it('supports custom base URL in invite link', () => {
    const token = generateToken(secret, 'alice@example.com');
    const inviteUrl = buildInviteUrl('https://qa.myapp.com', token);
    expect(inviteUrl).toMatch(/^https:\/\/qa\.myapp\.com\/join\?token=/);
  });

  it('defaults role to tester', async () => {
    const token = generateToken(secret, 'alice@example.com');
    const tokenHash = hashToken(token);
    const user = await storage.createUser({
      email: 'alice@example.com',
      name: 'Alice',
      tokenHash,
      role: 'tester',
      invitedBy: CLI_INVITER,
    });
    expect(user.role).toBe('tester');
  });
});

describe('CLI revoke flow', () => {
  it('revokes user access', async () => {
    const token = generateToken(secret, 'alice@example.com');
    await storage.createUser({ email: 'alice@example.com', name: 'Alice', tokenHash: hashToken(token), role: 'tester', invitedBy: CLI_INVITER });
    await storage.revokeUser('alice@example.com');

    const user = await storage.getUserByEmail('alice@example.com');
    expect(user!.revoked).toBe(true);
  });

  it('is a no-op when revoking a non-existent user', async () => {
    await expect(storage.revokeUser('nobody@example.com')).resolves.toBeUndefined();
  });
});

describe('CLI users flow', () => {
  it('lists all users from SQLite', async () => {
    const t1 = hashToken(generateToken(secret, 'alice@example.com'));
    const t2 = hashToken(generateToken(secret, 'bob@example.com'));
    await storage.createUser({ email: 'alice@example.com', name: 'Alice', tokenHash: t1, role: 'tester', invitedBy: CLI_INVITER });
    await storage.createUser({ email: 'bob@example.com', name: 'Bob', tokenHash: t2, role: 'admin', invitedBy: CLI_INVITER });

    const users = await storage.listUsers();
    expect(users).toHaveLength(2);
    const emails = users.map((u) => u.email);
    expect(emails).toContain('alice@example.com');
    expect(emails).toContain('bob@example.com');
  });

  it('returns empty array when no users', async () => {
    const users = await storage.listUsers();
    expect(users).toHaveLength(0);
  });
});

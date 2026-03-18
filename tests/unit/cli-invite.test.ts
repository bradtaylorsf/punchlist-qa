import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteAdapter } from '../../src/adapters/storage/sqlite-adapter.js';
import { TokenAuthAdapter } from '../../src/adapters/auth/token.js';

const secret = 'a-very-long-secret-for-testing-purposes-minimum-16-chars';
let storage: SqliteAdapter;
let auth: TokenAuthAdapter;
let tmpDir: string;

// userSchema validates invitedBy as an email address — use a valid email here.
const CLI_INVITER = 'cli@punchlist-qa.local';

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'punchlist-cli-test-'));
  storage = new SqliteAdapter({ dbPath: join(tmpDir, 'test.db') });
  await storage.initialize();
  auth = new TokenAuthAdapter({ secret, storage, baseUrl: 'http://localhost:4747' });
});

afterEach(async () => {
  await storage.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('CLI invite flow (via auth adapter)', () => {
  it('creates user in SQLite database', async () => {
    const result = await auth.createInvite('alice@example.com', 'Alice', CLI_INVITER);

    expect(result.user.email).toBe('alice@example.com');
    expect(result.user.name).toBe('Alice');
    expect(result.user.role).toBe('tester');
    expect(result.inviteUrl).toContain('/join?token=');

    // Verify in DB
    const stored = await storage.getUserByEmail('alice@example.com');
    expect(stored).not.toBeNull();
    expect(stored!.name).toBe('Alice');
    expect(stored!.invitedBy).toBe(CLI_INVITER);
  });

  it('handles duplicate email', async () => {
    await auth.createInvite('alice@example.com', 'Alice', CLI_INVITER);
    await expect(auth.createInvite('alice@example.com', 'Alice2', CLI_INVITER)).rejects.toThrow();
  });

  it('supports --role flag via options', async () => {
    const result = await auth.createInvite('admin@example.com', 'Admin User', CLI_INVITER, {
      role: 'admin',
    });
    expect(result.user.role).toBe('admin');
  });

  it('supports --base-url flag via options', async () => {
    const result = await auth.createInvite('alice@example.com', 'Alice', CLI_INVITER, {
      baseUrl: 'https://qa.myapp.com',
    });
    expect(result.inviteUrl).toMatch(/^https:\/\/qa\.myapp\.com\/join\?token=/);
  });

  it('defaults role to tester', async () => {
    const result = await auth.createInvite('alice@example.com', 'Alice', CLI_INVITER);
    expect(result.user.role).toBe('tester');
  });
});

describe('CLI revoke flow (via auth adapter)', () => {
  it('revokes user access', async () => {
    await auth.createInvite('alice@example.com', 'Alice', CLI_INVITER);
    await auth.revokeAccess('alice@example.com');

    const user = await storage.getUserByEmail('alice@example.com');
    expect(user!.revoked).toBe(true);
  });

  it('is a no-op when revoking a non-existent user', async () => {
    // revokeUser is idempotent — missing users are silently ignored at the storage layer.
    await expect(auth.revokeAccess('nobody@example.com')).resolves.toBeUndefined();
  });
});

describe('CLI users flow (via auth adapter)', () => {
  it('lists all users from SQLite', async () => {
    await auth.createInvite('alice@example.com', 'Alice', CLI_INVITER);
    await auth.createInvite('bob@example.com', 'Bob', CLI_INVITER, { role: 'admin' });

    const users = await auth.listUsers();
    expect(users).toHaveLength(2);
    const emails = users.map((u) => u.email);
    expect(emails).toContain('alice@example.com');
    expect(emails).toContain('bob@example.com');
  });

  it('returns empty array when no users', async () => {
    const users = await auth.listUsers();
    expect(users).toHaveLength(0);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteAdapter } from '../../src/adapters/storage/sqlite-adapter.js';

let adapter: SqliteAdapter;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'punchlist-test-'));
  adapter = new SqliteAdapter({ dbPath: join(tmpDir, 'test.db') });
  await adapter.initialize();
});

afterEach(async () => {
  await adapter.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// --- Initialization ---

describe('initialization', () => {
  it('creates the database file', async () => {
    const { existsSync } = await import('node:fs');
    expect(existsSync(join(tmpDir, 'test.db'))).toBe(true);
  });

  it('is idempotent', async () => {
    const adapter2 = new SqliteAdapter({ dbPath: join(tmpDir, 'test.db') });
    await expect(adapter2.initialize()).resolves.toBeUndefined();
    await adapter2.close();
  });
});

// --- Rounds ---

describe('rounds', () => {
  it('creates and retrieves a round', async () => {
    const round = await adapter.createRound({
      name: 'Sprint 1',
      description: 'First sprint',
      createdByEmail: 'alice@example.com',
      createdByName: 'Alice',
    });

    expect(round.name).toBe('Sprint 1');
    expect(round.description).toBe('First sprint');
    expect(round.status).toBe('active');
    expect(round.createdByEmail).toBe('alice@example.com');
    expect(round.completedAt).toBeNull();
    expect(round.id).toMatch(/^[0-9a-f-]{36}$/);

    const fetched = await adapter.getRound(round.id);
    expect(fetched).toEqual(round);
  });

  it('lists rounds ordered by creation date descending', async () => {
    await adapter.createRound({ name: 'First', createdByEmail: 'a@b.com', createdByName: 'A' });
    await adapter.createRound({ name: 'Second', createdByEmail: 'a@b.com', createdByName: 'A' });

    const rounds = await adapter.listRounds();
    expect(rounds).toHaveLength(2);
    expect(rounds[0].name).toBe('Second');
    expect(rounds[1].name).toBe('First');
  });

  it('returns null for non-existent round', async () => {
    const result = await adapter.getRound('00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });

  it('updates a round with partial fields', async () => {
    const round = await adapter.createRound({
      name: 'R1',
      createdByEmail: 'a@b.com',
      createdByName: 'A',
    });

    const updated = await adapter.updateRound(round.id, { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
    expect(updated.status).toBe('active'); // unchanged

    const completed = await adapter.updateRound(round.id, {
      status: 'completed',
      completedAt: '2026-01-15T00:00:00.000Z',
    });
    expect(completed.status).toBe('completed');
    expect(completed.completedAt).toBe('2026-01-15T00:00:00.000Z');
  });

  it('returns unchanged round when updating with empty object', async () => {
    const round = await adapter.createRound({
      name: 'R1',
      createdByEmail: 'a@b.com',
      createdByName: 'A',
    });
    const updated = await adapter.updateRound(round.id, {});
    expect(updated).toEqual(round);
  });

  it('throws when updating non-existent round', async () => {
    await expect(
      adapter.updateRound('00000000-0000-0000-0000-000000000000', { name: 'X' }),
    ).rejects.toThrow('Round not found');
  });

  it('throws when updating non-existent round with empty object', async () => {
    await expect(adapter.updateRound('00000000-0000-0000-0000-000000000000', {})).rejects.toThrow(
      'Round not found',
    );
  });
});

// --- Results ---

describe('results', () => {
  let roundId: string;

  beforeEach(async () => {
    const round = await adapter.createRound({
      name: 'R1',
      createdByEmail: 'a@b.com',
      createdByName: 'A',
    });
    roundId = round.id;
  });

  it('submits and lists results', async () => {
    const result = await adapter.submitResult(roundId, {
      testId: 'auth-001',
      status: 'pass',
      testerName: 'Bob',
      testerEmail: 'bob@b.com',
    });

    expect(result.roundId).toBe(roundId);
    expect(result.testId).toBe('auth-001');
    expect(result.status).toBe('pass');
    expect(result.description).toBeNull();
    expect(result.severity).toBeNull();

    const results = await adapter.listResults(roundId);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(result);
  });

  it('replaces result on duplicate round+test', async () => {
    const first = await adapter.submitResult(roundId, {
      testId: 'auth-001',
      status: 'fail',
      testerName: 'Bob',
      testerEmail: 'bob@b.com',
      severity: 'blocker',
    });

    const second = await adapter.submitResult(roundId, {
      testId: 'auth-001',
      status: 'pass',
      testerName: 'Bob',
      testerEmail: 'bob@b.com',
    });

    expect(second.id).toBe(first.id); // same ID preserved
    expect(second.status).toBe('pass');
    expect(second.severity).toBeNull(); // replaced, not merged

    const results = await adapter.listResults(roundId);
    expect(results).toHaveLength(1);
  });

  it('preserves issue link when re-submitting result', async () => {
    const result = await adapter.submitResult(roundId, {
      testId: 'auth-001',
      status: 'fail',
      testerName: 'Bob',
      testerEmail: 'bob@b.com',
    });

    await adapter.updateResultIssue(result.id, 'https://github.com/org/repo/issues/5', 5);

    const resubmitted = await adapter.submitResult(roundId, {
      testId: 'auth-001',
      status: 'pass',
      testerName: 'Bob',
      testerEmail: 'bob@b.com',
    });

    expect(resubmitted.id).toBe(result.id);
    expect(resubmitted.status).toBe('pass');
    expect(resubmitted.issueUrl).toBe('https://github.com/org/repo/issues/5');
    expect(resubmitted.issueNumber).toBe(5);
  });

  it('deletes a result by ID', async () => {
    const result = await adapter.submitResult(roundId, {
      testId: 'auth-001',
      status: 'pass',
      testerName: 'Bob',
      testerEmail: 'bob@b.com',
    });

    await adapter.deleteResult(result.id);
    const results = await adapter.listResults(roundId);
    expect(results).toHaveLength(0);
  });

  it('deletes results by test IDs and returns count', async () => {
    await adapter.submitResult(roundId, {
      testId: 'auth-001',
      status: 'pass',
      testerName: 'B',
      testerEmail: 'b@b.com',
    });
    await adapter.submitResult(roundId, {
      testId: 'auth-002',
      status: 'pass',
      testerName: 'B',
      testerEmail: 'b@b.com',
    });
    await adapter.submitResult(roundId, {
      testId: 'auth-003',
      status: 'pass',
      testerName: 'B',
      testerEmail: 'b@b.com',
    });

    const deleted = await adapter.deleteResultsByTestIds(roundId, ['auth-001', 'auth-003']);
    expect(deleted).toBe(2);

    const results = await adapter.listResults(roundId);
    expect(results).toHaveLength(1);
    expect(results[0].testId).toBe('auth-002');
  });

  it('handles deleteResultsByTestIds with empty array and returns 0', async () => {
    await adapter.submitResult(roundId, {
      testId: 'auth-001',
      status: 'pass',
      testerName: 'B',
      testerEmail: 'b@b.com',
    });

    const deleted = await adapter.deleteResultsByTestIds(roundId, []);
    expect(deleted).toBe(0);

    const results = await adapter.listResults(roundId);
    expect(results).toHaveLength(1);
  });

  it('updates result issue link', async () => {
    const result = await adapter.submitResult(roundId, {
      testId: 'auth-001',
      status: 'fail',
      testerName: 'Bob',
      testerEmail: 'bob@b.com',
    });

    const updated = await adapter.updateResultIssue(
      result.id,
      'https://github.com/org/repo/issues/42',
      42,
    );
    expect(updated.issueUrl).toBe('https://github.com/org/repo/issues/42');
    expect(updated.issueNumber).toBe(42);
  });

  it('enforces foreign key on round_id', async () => {
    await expect(
      adapter.submitResult('00000000-0000-0000-0000-000000000000', {
        testId: 'auth-001',
        status: 'pass',
        testerName: 'B',
        testerEmail: 'b@b.com',
      }),
    ).rejects.toThrow();
  });
});

// --- Users ---

describe('users', () => {
  it('creates and lists users', async () => {
    const user = await adapter.createUser({
      email: 'alice@example.com',
      name: 'Alice',
      tokenHash: 'hash123',
      role: 'tester',
      invitedBy: 'admin@example.com',
    });

    expect(user.email).toBe('alice@example.com');
    expect(user.role).toBe('tester');
    expect(user.revoked).toBe(false);
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);

    const users = await adapter.listUsers();
    expect(users).toHaveLength(1);
    expect(users[0]).toEqual(user);
  });

  it('finds user by email', async () => {
    await adapter.createUser({
      email: 'alice@a.com',
      name: 'Alice',
      tokenHash: 'h1',
      role: 'tester',
      invitedBy: 'admin@a.com',
    });

    const found = await adapter.getUserByEmail('alice@a.com');
    expect(found?.email).toBe('alice@a.com');

    const notFound = await adapter.getUserByEmail('nobody@a.com');
    expect(notFound).toBeNull();
  });

  it('finds user by token hash', async () => {
    await adapter.createUser({
      email: 'alice@a.com',
      name: 'Alice',
      tokenHash: 'secret-hash',
      role: 'tester',
      invitedBy: 'admin@a.com',
    });

    const found = await adapter.getUserByTokenHash('secret-hash');
    expect(found?.email).toBe('alice@a.com');

    const notFound = await adapter.getUserByTokenHash('wrong-hash');
    expect(notFound).toBeNull();
  });

  it('revokes a user', async () => {
    await adapter.createUser({
      email: 'alice@a.com',
      name: 'Alice',
      tokenHash: 'h1',
      role: 'tester',
      invitedBy: 'admin@a.com',
    });

    await adapter.revokeUser('alice@a.com');

    const user = await adapter.getUserByEmail('alice@a.com');
    expect(user?.revoked).toBe(true);
  });

  it('is a no-op when revoking a non-existent user', async () => {
    // All deletes/revokes are idempotent — missing records are silently ignored.
    await expect(adapter.revokeUser('nobody@a.com')).resolves.toBeUndefined();
  });

  it('enforces unique email constraint', async () => {
    await adapter.createUser({
      email: 'alice@a.com',
      name: 'Alice',
      tokenHash: 'h1',
      role: 'tester',
      invitedBy: 'admin@a.com',
    });

    await expect(
      adapter.createUser({
        email: 'alice@a.com',
        name: 'Alice2',
        tokenHash: 'h2',
        role: 'tester',
        invitedBy: 'admin@a.com',
      }),
    ).rejects.toThrow();
  });
});

// --- Sessions ---

describe('sessions', () => {
  const futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
  const pastExpiry = new Date(Date.now() - 60 * 60 * 1000).toISOString();   // 1 hour ago

  describe('createSession', () => {
    it('should create a session and return a Session object', async () => {
      const user = await adapter.createUser({
        email: 'alice@example.com',
        name: 'Alice',
        tokenHash: 'hash123',
        role: 'tester',
        invitedBy: 'admin@example.com',
      });

      const session = await adapter.createSession(user.email, futureExpiry);

      expect(session.userEmail).toBe('alice@example.com');
      expect(session.expiresAt).toBe(futureExpiry);
      expect(session.id).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes as hex
      expect(session.createdAt).toBeDefined();
    });

    it('should generate a unique session ID for each call', async () => {
      const user = await adapter.createUser({
        email: 'bob@example.com',
        name: 'Bob',
        tokenHash: 'hash456',
        role: 'tester',
        invitedBy: 'admin@example.com',
      });

      const session1 = await adapter.createSession(user.email, futureExpiry);
      const session2 = await adapter.createSession(user.email, futureExpiry);

      expect(session1.id).not.toBe(session2.id);
    });

    it('should throw when creating a session for a non-existent user (FK constraint)', async () => {
      await expect(
        adapter.createSession('nonexistent@example.com', futureExpiry),
      ).rejects.toThrow();
    });
  });

  describe('getSession', () => {
    it('should retrieve an existing session by ID', async () => {
      const user = await adapter.createUser({
        email: 'alice@example.com',
        name: 'Alice',
        tokenHash: 'hash123',
        role: 'tester',
        invitedBy: 'admin@example.com',
      });

      const created = await adapter.createSession(user.email, futureExpiry);
      const fetched = await adapter.getSession(created.id);

      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.userEmail).toBe('alice@example.com');
      expect(fetched!.expiresAt).toBe(futureExpiry);
    });

    it('should return null for a non-existent session ID', async () => {
      const result = await adapter.getSession('nonexistentsessionid');
      expect(result).toBeNull();
    });

    it('should return an expired session (expiry is not checked by getSession)', async () => {
      const user = await adapter.createUser({
        email: 'alice@example.com',
        name: 'Alice',
        tokenHash: 'hash123',
        role: 'tester',
        invitedBy: 'admin@example.com',
      });

      const session = await adapter.createSession(user.email, pastExpiry);
      const fetched = await adapter.getSession(session.id);

      // getSession does not filter by expiry — callers must check expiresAt
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(session.id);
      expect(fetched!.expiresAt).toBe(pastExpiry);
    });
  });

  describe('getSessionWithUser', () => {
    it('should return session and full user data via JOIN', async () => {
      const user = await adapter.createUser({
        email: 'alice@example.com',
        name: 'Alice',
        tokenHash: 'hash123',
        role: 'tester',
        invitedBy: 'admin@example.com',
      });

      const created = await adapter.createSession(user.email, futureExpiry);
      const result = await adapter.getSessionWithUser(created.id);

      expect(result).not.toBeNull();
      expect(result!.session.id).toBe(created.id);
      expect(result!.session.userEmail).toBe('alice@example.com');
      expect(result!.session.expiresAt).toBe(futureExpiry);

      expect(result!.user.id).toBe(user.id);
      expect(result!.user.email).toBe('alice@example.com');
      expect(result!.user.name).toBe('Alice');
      expect(result!.user.tokenHash).toBe('hash123');
      expect(result!.user.role).toBe('tester');
      expect(result!.user.invitedBy).toBe('admin@example.com');
      expect(result!.user.revoked).toBe(false);
      expect(result!.user.createdAt).toBeDefined();
    });

    it('should return null for a non-existent session ID', async () => {
      const result = await adapter.getSessionWithUser('nonexistentsessionid');
      expect(result).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('should delete an existing session', async () => {
      const user = await adapter.createUser({
        email: 'alice@example.com',
        name: 'Alice',
        tokenHash: 'hash123',
        role: 'tester',
        invitedBy: 'admin@example.com',
      });

      const session = await adapter.createSession(user.email, futureExpiry);
      await adapter.deleteSession(session.id);

      const fetched = await adapter.getSession(session.id);
      expect(fetched).toBeNull();
    });

    it('should be idempotent when deleting a non-existent session', async () => {
      await expect(adapter.deleteSession('nonexistentsessionid')).resolves.toBeUndefined();
    });
  });

  describe('deleteExpiredSessions', () => {
    it('should delete only expired sessions and leave valid ones intact', async () => {
      const user = await adapter.createUser({
        email: 'alice@example.com',
        name: 'Alice',
        tokenHash: 'hash123',
        role: 'tester',
        invitedBy: 'admin@example.com',
      });

      const validSession = await adapter.createSession(user.email, futureExpiry);
      const expiredSession = await adapter.createSession(user.email, pastExpiry);

      await adapter.deleteExpiredSessions();

      const validFetched = await adapter.getSession(validSession.id);
      expect(validFetched).not.toBeNull();
      expect(validFetched!.id).toBe(validSession.id);

      const expiredFetched = await adapter.getSession(expiredSession.id);
      expect(expiredFetched).toBeNull();
    });

    it('should be a no-op when there are no expired sessions', async () => {
      const user = await adapter.createUser({
        email: 'alice@example.com',
        name: 'Alice',
        tokenHash: 'hash123',
        role: 'tester',
        invitedBy: 'admin@example.com',
      });

      const session = await adapter.createSession(user.email, futureExpiry);
      await expect(adapter.deleteExpiredSessions()).resolves.toBeUndefined();

      const fetched = await adapter.getSession(session.id);
      expect(fetched).not.toBeNull();
    });

    it('should delete all sessions when all are expired', async () => {
      const user = await adapter.createUser({
        email: 'alice@example.com',
        name: 'Alice',
        tokenHash: 'hash123',
        role: 'tester',
        invitedBy: 'admin@example.com',
      });

      const exp1 = await adapter.createSession(user.email, pastExpiry);
      const exp2 = await adapter.createSession(
        user.email,
        new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      );

      await adapter.deleteExpiredSessions();

      expect(await adapter.getSession(exp1.id)).toBeNull();
      expect(await adapter.getSession(exp2.id)).toBeNull();
    });
  });
});

// --- Config ---

describe('config', () => {
  it('returns null for unset key', async () => {
    expect(await adapter.getConfig('missing')).toBeNull();
  });

  it('sets and gets a config value', async () => {
    await adapter.setConfig('theme', 'dark');
    expect(await adapter.getConfig('theme')).toBe('dark');
  });

  it('overwrites existing config value', async () => {
    await adapter.setConfig('theme', 'dark');
    await adapter.setConfig('theme', 'light');
    expect(await adapter.getConfig('theme')).toBe('light');
  });
});

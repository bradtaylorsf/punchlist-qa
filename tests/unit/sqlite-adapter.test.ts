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
    const round = await adapter.createRound({ name: 'R1', createdByEmail: 'a@b.com', createdByName: 'A' });

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

  it('throws when updating non-existent round', async () => {
    await expect(
      adapter.updateRound('00000000-0000-0000-0000-000000000000', { name: 'X' }),
    ).rejects.toThrow('Round not found');
  });
});

// --- Results ---

describe('results', () => {
  let roundId: string;

  beforeEach(async () => {
    const round = await adapter.createRound({ name: 'R1', createdByEmail: 'a@b.com', createdByName: 'A' });
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

  it('deletes results by test IDs', async () => {
    await adapter.submitResult(roundId, { testId: 'auth-001', status: 'pass', testerName: 'B', testerEmail: 'b@b.com' });
    await adapter.submitResult(roundId, { testId: 'auth-002', status: 'pass', testerName: 'B', testerEmail: 'b@b.com' });
    await adapter.submitResult(roundId, { testId: 'auth-003', status: 'pass', testerName: 'B', testerEmail: 'b@b.com' });

    await adapter.deleteResultsByTestIds(roundId, ['auth-001', 'auth-003']);

    const results = await adapter.listResults(roundId);
    expect(results).toHaveLength(1);
    expect(results[0].testId).toBe('auth-002');
  });

  it('updates result issue link', async () => {
    const result = await adapter.submitResult(roundId, {
      testId: 'auth-001',
      status: 'fail',
      testerName: 'Bob',
      testerEmail: 'bob@b.com',
    });

    const updated = await adapter.updateResultIssue(result.id, 'https://github.com/org/repo/issues/42', 42);
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
    await adapter.createUser({ email: 'alice@a.com', name: 'Alice', tokenHash: 'h1', role: 'tester', invitedBy: 'admin@a.com' });

    const found = await adapter.getUserByEmail('alice@a.com');
    expect(found?.email).toBe('alice@a.com');

    const notFound = await adapter.getUserByEmail('nobody@a.com');
    expect(notFound).toBeNull();
  });

  it('finds user by token hash', async () => {
    await adapter.createUser({ email: 'alice@a.com', name: 'Alice', tokenHash: 'secret-hash', role: 'tester', invitedBy: 'admin@a.com' });

    const found = await adapter.getUserByTokenHash('secret-hash');
    expect(found?.email).toBe('alice@a.com');

    const notFound = await adapter.getUserByTokenHash('wrong-hash');
    expect(notFound).toBeNull();
  });

  it('revokes a user', async () => {
    await adapter.createUser({ email: 'alice@a.com', name: 'Alice', tokenHash: 'h1', role: 'tester', invitedBy: 'admin@a.com' });

    await adapter.revokeUser('alice@a.com');

    const user = await adapter.getUserByEmail('alice@a.com');
    expect(user?.revoked).toBe(true);
  });

  it('enforces unique email constraint', async () => {
    await adapter.createUser({ email: 'alice@a.com', name: 'Alice', tokenHash: 'h1', role: 'tester', invitedBy: 'admin@a.com' });

    await expect(
      adapter.createUser({ email: 'alice@a.com', name: 'Alice2', tokenHash: 'h2', role: 'tester', invitedBy: 'admin@a.com' }),
    ).rejects.toThrow();
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

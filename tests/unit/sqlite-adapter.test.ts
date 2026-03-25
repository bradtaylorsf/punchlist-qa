import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteAdapter } from '../../src/adapters/storage/sqlite-adapter.js';

const ENCRYPTION_SECRET = 'test-encryption-secret-for-sqlite-adapter';

let adapter: SqliteAdapter;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'punchlist-test-'));
  adapter = new SqliteAdapter({
    dbPath: join(tmpDir, 'test.db'),
    encryptionSecret: ENCRYPTION_SECRET,
  });
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
  let futureExpiry: string;
  let pastExpiry: string;

  beforeEach(() => {
    futureExpiry = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
    pastExpiry = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
  });

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

// --- Projects ---

describe('projects', () => {
  it('creates and retrieves a project', async () => {
    const project = await adapter.createProject({
      repoSlug: 'owner/repo',
      name: 'My Project',
    });

    expect(project.repoSlug).toBe('owner/repo');
    expect(project.name).toBe('My Project');
    expect(project.githubTokenEncrypted).toBeNull();
    expect(project.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(project.createdAt).toBeDefined();
    expect(project.updatedAt).toBeDefined();

    const fetched = await adapter.getProject(project.id);
    expect(fetched).toEqual(project);
  });

  it('creates project with encrypted GitHub token', async () => {
    const project = await adapter.createProject({
      repoSlug: 'owner/repo',
      name: 'My Project',
      githubToken: 'ghp_abc123',
    });

    expect(project.githubTokenEncrypted).not.toBeNull();
    expect(project.githubTokenEncrypted).not.toBe('ghp_abc123');
    // The encrypted token should be in iv:authTag:ciphertext format
    expect(project.githubTokenEncrypted!.split(':')).toHaveLength(4);
  });

  it('enforces unique repo_slug', async () => {
    await adapter.createProject({ repoSlug: 'owner/repo', name: 'P1' });
    await expect(
      adapter.createProject({ repoSlug: 'owner/repo', name: 'P2' }),
    ).rejects.toThrow();
  });

  it('lists projects ordered by creation date descending', async () => {
    await adapter.createProject({ repoSlug: 'owner/first', name: 'First' });
    await adapter.createProject({ repoSlug: 'owner/second', name: 'Second' });

    const projects = await adapter.listProjects();
    expect(projects).toHaveLength(2);
    expect(projects[0].name).toBe('Second');
    expect(projects[1].name).toBe('First');
  });

  it('returns null for non-existent project', async () => {
    expect(await adapter.getProject('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('finds project by repo slug', async () => {
    await adapter.createProject({ repoSlug: 'owner/repo', name: 'P1' });

    const found = await adapter.getProjectByRepoSlug('owner/repo');
    expect(found?.name).toBe('P1');

    const notFound = await adapter.getProjectByRepoSlug('owner/nonexistent');
    expect(notFound).toBeNull();
  });

  it('updates project name', async () => {
    const project = await adapter.createProject({ repoSlug: 'owner/repo', name: 'Original' });

    const updated = await adapter.updateProject(project.id, { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
    expect(updated.repoSlug).toBe('owner/repo');
  });

  it('updates project GitHub token', async () => {
    const project = await adapter.createProject({ repoSlug: 'owner/repo', name: 'P1' });
    expect(project.githubTokenEncrypted).toBeNull();

    const updated = await adapter.updateProject(project.id, { githubToken: 'ghp_new' });
    expect(updated.githubTokenEncrypted).not.toBeNull();
    expect(updated.githubTokenEncrypted!.split(':')).toHaveLength(4);
  });

  it('clears project GitHub token with null', async () => {
    const project = await adapter.createProject({
      repoSlug: 'owner/repo',
      name: 'P1',
      githubToken: 'ghp_abc',
    });
    expect(project.githubTokenEncrypted).not.toBeNull();

    const updated = await adapter.updateProject(project.id, { githubToken: null });
    expect(updated.githubTokenEncrypted).toBeNull();
  });

  it('throws when updating non-existent project', async () => {
    await expect(
      adapter.updateProject('00000000-0000-0000-0000-000000000000', { name: 'X' }),
    ).rejects.toThrow('Project not found');
  });

  it('throws when updating non-existent project with empty object', async () => {
    await expect(
      adapter.updateProject('00000000-0000-0000-0000-000000000000', {}),
    ).rejects.toThrow('Project not found');
  });

  it('deletes a project (idempotent)', async () => {
    const project = await adapter.createProject({ repoSlug: 'owner/repo', name: 'P1' });

    await adapter.deleteProject(project.id);
    expect(await adapter.getProject(project.id)).toBeNull();

    // Idempotent — no error on second delete
    await expect(adapter.deleteProject(project.id)).resolves.toBeUndefined();
  });
});

// --- Project Users ---

describe('project users', () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await adapter.createProject({ repoSlug: 'owner/repo', name: 'P1' });
    projectId = project.id;
    await adapter.createUser({
      email: 'alice@a.com',
      name: 'Alice',
      tokenHash: 'h1',
      role: 'tester',
      invitedBy: 'admin@a.com',
    });
    await adapter.createUser({
      email: 'bob@b.com',
      name: 'Bob',
      tokenHash: 'h2',
      role: 'admin',
      invitedBy: 'admin@a.com',
    });
  });

  it('adds a user to a project', async () => {
    const pu = await adapter.addUserToProject(projectId, 'alice@a.com', 'tester');
    expect(pu.projectId).toBe(projectId);
    expect(pu.userEmail).toBe('alice@a.com');
    expect(pu.role).toBe('tester');
  });

  it('defaults role to tester', async () => {
    const pu = await adapter.addUserToProject(projectId, 'alice@a.com');
    expect(pu.role).toBe('tester');
  });

  it('removes a user from a project (idempotent)', async () => {
    await adapter.addUserToProject(projectId, 'alice@a.com');
    await adapter.removeUserFromProject(projectId, 'alice@a.com');

    const users = await adapter.listProjectUsers(projectId);
    expect(users).toHaveLength(0);

    // Idempotent
    await expect(
      adapter.removeUserFromProject(projectId, 'alice@a.com'),
    ).resolves.toBeUndefined();
  });

  it('lists project users', async () => {
    await adapter.addUserToProject(projectId, 'alice@a.com', 'tester');
    await adapter.addUserToProject(projectId, 'bob@b.com', 'admin');

    const users = await adapter.listProjectUsers(projectId);
    expect(users).toHaveLength(2);
    expect(users.map((u) => u.userEmail).sort()).toEqual(['alice@a.com', 'bob@b.com']);
  });

  it('lists user projects via JOIN', async () => {
    const project2 = await adapter.createProject({ repoSlug: 'owner/repo2', name: 'P2' });
    await adapter.addUserToProject(projectId, 'alice@a.com');
    await adapter.addUserToProject(project2.id, 'alice@a.com');

    const projects = await adapter.listUserProjects('alice@a.com');
    expect(projects).toHaveLength(2);
  });

  it('prevents duplicate membership', async () => {
    await adapter.addUserToProject(projectId, 'alice@a.com');
    await expect(
      adapter.addUserToProject(projectId, 'alice@a.com'),
    ).rejects.toThrow();
  });

  it('cascade deletes memberships when project is deleted', async () => {
    await adapter.addUserToProject(projectId, 'alice@a.com');
    await adapter.addUserToProject(projectId, 'bob@b.com');

    await adapter.deleteProject(projectId);

    // Verify memberships are gone
    const users = await adapter.listProjectUsers(projectId);
    expect(users).toHaveLength(0);
  });
});

// --- Project-scoped rounds ---

describe('project-scoped rounds', () => {
  let projectAId: string;
  let projectBId: string;

  beforeEach(async () => {
    const a = await adapter.createProject({ repoSlug: 'owner/a', name: 'A' });
    const b = await adapter.createProject({ repoSlug: 'owner/b', name: 'B' });
    projectAId = a.id;
    projectBId = b.id;
  });

  it('creates round with projectId', async () => {
    const round = await adapter.createRound(
      { name: 'R1', createdByEmail: 'a@b.com', createdByName: 'A' },
      projectAId,
    );
    expect(round.projectId).toBe(projectAId);
  });

  it('creates round without projectId (backward compat)', async () => {
    const round = await adapter.createRound({
      name: 'R1',
      createdByEmail: 'a@b.com',
      createdByName: 'A',
    });
    expect(round.projectId).toBeNull();
  });

  it('filters rounds by projectId', async () => {
    await adapter.createRound(
      { name: 'A1', createdByEmail: 'a@b.com', createdByName: 'A' },
      projectAId,
    );
    await adapter.createRound(
      { name: 'B1', createdByEmail: 'a@b.com', createdByName: 'A' },
      projectBId,
    );
    await adapter.createRound({ name: 'NoProject', createdByEmail: 'a@b.com', createdByName: 'A' });

    const projectARounds = await adapter.listRounds(projectAId);
    expect(projectARounds).toHaveLength(1);
    expect(projectARounds[0].name).toBe('A1');

    const projectBRounds = await adapter.listRounds(projectBId);
    expect(projectBRounds).toHaveLength(1);
    expect(projectBRounds[0].name).toBe('B1');
  });

  it('returns all rounds when no projectId specified', async () => {
    await adapter.createRound(
      { name: 'A1', createdByEmail: 'a@b.com', createdByName: 'A' },
      projectAId,
    );
    await adapter.createRound(
      { name: 'B1', createdByEmail: 'a@b.com', createdByName: 'A' },
      projectBId,
    );
    await adapter.createRound({ name: 'NoProject', createdByEmail: 'a@b.com', createdByName: 'A' });

    const allRounds = await adapter.listRounds();
    expect(allRounds).toHaveLength(3);
  });
});

// --- Project-scoped results ---

describe('project-scoped results', () => {
  let projectId: string;
  let roundId: string;

  beforeEach(async () => {
    const project = await adapter.createProject({ repoSlug: 'owner/repo', name: 'P1' });
    projectId = project.id;
    const round = await adapter.createRound(
      { name: 'R1', createdByEmail: 'a@b.com', createdByName: 'A' },
      projectId,
    );
    roundId = round.id;
  });

  it('stores projectId on result', async () => {
    const result = await adapter.submitResult(
      roundId,
      { testId: 'auth-001', status: 'pass', testerName: 'B', testerEmail: 'b@b.com' },
      projectId,
    );
    expect(result.projectId).toBe(projectId);
  });

  it('stores null projectId when not provided', async () => {
    const result = await adapter.submitResult(roundId, {
      testId: 'auth-001',
      status: 'pass',
      testerName: 'B',
      testerEmail: 'b@b.com',
    });
    expect(result.projectId).toBeNull();
  });
});

// --- Project-scoped access requests ---

describe('project-scoped access requests', () => {
  let projectId: string;

  beforeEach(async () => {
    const project = await adapter.createProject({ repoSlug: 'owner/repo', name: 'P1' });
    projectId = project.id;
  });

  it('creates access request with projectId', async () => {
    const req = await adapter.createAccessRequest(
      { email: 'user@a.com', name: 'User' },
      projectId,
    );
    expect(req.projectId).toBe(projectId);
  });

  it('filters access requests by projectId', async () => {
    await adapter.createAccessRequest({ email: 'a@a.com', name: 'A' }, projectId);
    await adapter.createAccessRequest({ email: 'b@b.com', name: 'B' });

    const projectRequests = await adapter.listAccessRequests(undefined, projectId);
    expect(projectRequests).toHaveLength(1);
    expect(projectRequests[0].email).toBe('a@a.com');

    const allRequests = await adapter.listAccessRequests();
    expect(allRequests).toHaveLength(2);
  });

  it('filters access requests by both status and projectId', async () => {
    await adapter.createAccessRequest({ email: 'a@a.com', name: 'A' }, projectId);
    await adapter.createAccessRequest({ email: 'b@b.com', name: 'B' }, projectId);

    // Approve the first one (a@a.com) by looking it up directly
    const requests = await adapter.listAccessRequests(undefined, projectId);
    const aRequest = requests.find((r) => r.email === 'a@a.com')!;
    await adapter.updateAccessRequestStatus(aRequest.id, 'approved', 'admin@a.com');

    const pending = await adapter.listAccessRequests('pending', projectId);
    expect(pending).toHaveLength(1);
    expect(pending[0].email).toBe('b@b.com');
  });
});

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { StorageAdapter } from './types.js';
import { runMigrations } from './migrations.js';
import type {
  Round,
  Result,
  User,
  AccessRequest,
  Project,
  ProjectUser,
  CreateRoundInput,
  UpdateRoundInput,
  SubmitResultInput,
  CreateUserInput,
  CreateAccessRequestInput,
  CreateProjectInput,
  UpdateProjectInput,
  GitHubToken,
} from '../../shared/types.js';
import {
  rowToProject,
  rowToProjectUser,
  rowToRound,
  rowToResult,
  rowToUser,
  rowToAccessRequest,
  rowToGitHubToken,
} from './row-converters.js';
import type {
  ProjectRow,
  ProjectUserRow,
  RoundRow,
  ResultRow,
  UserRow,
  AccessRequestRow,
  GitHubTokenRow,
} from './row-converters.js';

interface SqliteAdapterOptions {
  dbPath?: string;
  encryptionSecret?: string;
}

export class SqliteAdapter implements StorageAdapter {
  private db: Database.Database | null = null;
  private readonly dbPath: string;
  private readonly encryptionSecret?: string;

  constructor(options: SqliteAdapterOptions = {}) {
    this.dbPath = options.dbPath ?? '.punchlist/punchlist.db';
    this.encryptionSecret = options.encryptionSecret;
  }

  async initialize(): Promise<void> {
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    runMigrations(this.db);
  }

  async close(): Promise<void> {
    this.getDb().close();
    this.db = null;
  }

  // --- Projects ---

  async createProject(input: CreateProjectInput): Promise<Project> {
    const db = this.getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    const name = input.name ?? input.repoSlug.split('/').pop() ?? input.repoSlug;
    db.prepare(
      `INSERT INTO projects (id, repo_slug, name, github_token_encrypted, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?)`,
    ).run(id, input.repoSlug, name, now, now);
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow;
    return rowToProject(row);
  }

  async getProject(id: string): Promise<Project | null> {
    const row = this.getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as
      | ProjectRow
      | undefined;
    return row ? rowToProject(row) : null;
  }

  async getProjectByRepoSlug(repoSlug: string): Promise<Project | null> {
    const row = this.getDb().prepare('SELECT * FROM projects WHERE repo_slug = ?').get(repoSlug) as
      | ProjectRow
      | undefined;
    return row ? rowToProject(row) : null;
  }

  async listProjects(): Promise<Project[]> {
    const rows = this.getDb()
      .prepare('SELECT * FROM projects ORDER BY rowid DESC')
      .all() as ProjectRow[];
    return rows.map(rowToProject);
  }

  async updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
    const db = this.getDb();
    const sets: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
      sets.push('name = ?');
      values.push(input.name);
    }

    if (sets.length > 0) {
      sets.push('updated_at = ?');
      values.push(new Date().toISOString());
      values.push(id);
      const result = db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      if (result.changes === 0) throw new Error('Project not found');
    } else {
      const existing = await this.getProject(id);
      if (!existing) throw new Error('Project not found');
    }

    return (await this.getProject(id))!;
  }

  async deleteProject(id: string): Promise<void> {
    this.getDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  // --- Project Users ---

  async addUserToProject(projectId: string, userEmail: string, role?: string): Promise<ProjectUser> {
    const db = this.getDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO project_users (project_id, user_email, role, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(projectId, userEmail, role ?? 'tester', now);
    const row = db
      .prepare('SELECT * FROM project_users WHERE project_id = ? AND user_email = ?')
      .get(projectId, userEmail) as ProjectUserRow;
    return rowToProjectUser(row);
  }

  async removeUserFromProject(projectId: string, userEmail: string): Promise<void> {
    this.getDb()
      .prepare('DELETE FROM project_users WHERE project_id = ? AND user_email = ?')
      .run(projectId, userEmail);
  }

  async listProjectUsers(projectId: string): Promise<ProjectUser[]> {
    const rows = this.getDb()
      .prepare('SELECT * FROM project_users WHERE project_id = ? ORDER BY created_at ASC')
      .all(projectId) as ProjectUserRow[];
    return rows.map(rowToProjectUser);
  }

  async listUserProjects(userEmail: string): Promise<Project[]> {
    const rows = this.getDb()
      .prepare(
        `SELECT p.* FROM projects p
         JOIN project_users pu ON p.id = pu.project_id
         WHERE pu.user_email = ?
         ORDER BY p.created_at DESC`,
      )
      .all(userEmail) as ProjectRow[];
    return rows.map(rowToProject);
  }

  // --- Rounds ---

  async createRound(input: CreateRoundInput, projectId?: string): Promise<Round> {
    const db = this.getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO rounds (id, name, description, status, created_by_email, created_by_name, created_at, completed_at, project_id)
       VALUES (?, ?, ?, 'active', ?, ?, ?, NULL, ?)`,
    ).run(
      id,
      input.name,
      input.description ?? null,
      input.createdByEmail,
      input.createdByName,
      now,
      projectId ?? null,
    );
    return (await this.getRound(id))!;
  }

  async listRounds(projectId?: string): Promise<Round[]> {
    const db = this.getDb();
    if (projectId !== undefined) {
      const rows = db
        .prepare('SELECT * FROM rounds WHERE project_id = ? ORDER BY rowid DESC')
        .all(projectId) as RoundRow[];
      return rows.map(rowToRound);
    }
    const rows = db
      .prepare('SELECT * FROM rounds ORDER BY rowid DESC')
      .all() as RoundRow[];
    return rows.map(rowToRound);
  }

  async getRound(id: string): Promise<Round | null> {
    const row = this.getDb().prepare('SELECT * FROM rounds WHERE id = ?').get(id) as
      | RoundRow
      | undefined;
    return row ? rowToRound(row) : null;
  }

  async updateRound(id: string, input: UpdateRoundInput): Promise<Round> {
    const db = this.getDb();
    const sets: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) {
      sets.push('name = ?');
      values.push(input.name);
    }
    if (input.description !== undefined) {
      sets.push('description = ?');
      values.push(input.description);
    }
    if (input.status !== undefined) {
      sets.push('status = ?');
      values.push(input.status);
    }
    if (input.completedAt !== undefined) {
      sets.push('completed_at = ?');
      values.push(input.completedAt);
    }

    if (sets.length > 0) {
      values.push(id);
      const result = db.prepare(`UPDATE rounds SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      if (result.changes === 0) throw new Error('Round not found');
    } else {
      const existing = await this.getRound(id);
      if (!existing) throw new Error('Round not found');
    }

    return (await this.getRound(id))!;
  }

  // --- Results ---

  async submitResult(roundId: string, input: SubmitResultInput, projectId?: string): Promise<Result> {
    const db = this.getDb();
    const now = new Date().toISOString();

    // Check for existing result to preserve ID, created_at, and issue link on replace
    const existing = db
      .prepare(
        'SELECT id, created_at, issue_url, issue_number FROM results WHERE round_id = ? AND test_id = ?',
      )
      .get(roundId, input.testId) as
      | {
          id: string;
          created_at: string;
          issue_url: string | null;
          issue_number: number | null;
        }
      | undefined;

    const id = existing?.id ?? randomUUID();
    const createdAt = existing?.created_at ?? now;

    db.prepare(
      `INSERT OR REPLACE INTO results (id, round_id, test_id, status, tester_name, tester_email, description, severity, commit_hash, issue_url, issue_number, created_at, updated_at, project_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      roundId,
      input.testId,
      input.status,
      input.testerName,
      input.testerEmail,
      input.description ?? null,
      input.severity ?? null,
      input.commitHash ?? null,
      existing?.issue_url ?? null,
      existing?.issue_number ?? null,
      createdAt,
      now,
      projectId ?? null,
    );

    const row = db.prepare('SELECT * FROM results WHERE id = ?').get(id) as ResultRow;
    return rowToResult(row);
  }

  async listResults(roundId: string, projectId?: string): Promise<Result[]> {
    const db = this.getDb();
    if (projectId !== undefined) {
      const rows = db
        .prepare('SELECT * FROM results WHERE round_id = ? AND project_id = ? ORDER BY rowid DESC')
        .all(roundId, projectId) as ResultRow[];
      return rows.map(rowToResult);
    }
    const rows = db
      .prepare('SELECT * FROM results WHERE round_id = ? ORDER BY rowid DESC')
      .all(roundId) as ResultRow[];
    return rows.map(rowToResult);
  }

  async deleteResult(id: string): Promise<void> {
    this.getDb().prepare('DELETE FROM results WHERE id = ?').run(id);
  }

  async deleteResultsByTestIds(roundId: string, testIds: string[]): Promise<number> {
    if (testIds.length === 0) return 0;
    const db = this.getDb();
    // SQLite default SQLITE_MAX_VARIABLE_NUMBER is 999. Use 900 as a safe batch size
    // to leave room for the roundId parameter and avoid hitting the limit.
    // Wrap in a transaction so partial failures don't leave inconsistent state.
    const BATCH_SIZE = 900;
    let totalDeleted = 0;
    const deleteBatched = db.transaction(() => {
      for (let i = 0; i < testIds.length; i += BATCH_SIZE) {
        const batch = testIds.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(', ');
        const result = db
          .prepare(`DELETE FROM results WHERE round_id = ? AND test_id IN (${placeholders})`)
          .run(roundId, ...batch);
        totalDeleted += result.changes;
      }
    });
    deleteBatched();
    return totalDeleted;
  }

  async updateResultIssue(id: string, issueUrl: string, issueNumber: number): Promise<Result> {
    const db = this.getDb();
    const now = new Date().toISOString();
    const result = db
      .prepare('UPDATE results SET issue_url = ?, issue_number = ?, updated_at = ? WHERE id = ?')
      .run(issueUrl, issueNumber, now, id);
    if (result.changes === 0) throw new Error('Result not found');
    const row = db.prepare('SELECT * FROM results WHERE id = ?').get(id) as ResultRow;
    return rowToResult(row);
  }

  // --- Users ---

  async createUser(input: CreateUserInput): Promise<User> {
    const db = this.getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, email, name, token_hash, role, invited_by, revoked, created_at, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    ).run(
      id,
      input.email,
      input.name,
      input.tokenHash,
      input.role,
      input.invitedBy,
      now,
      input.passwordHash ?? null,
    );
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow;
    return rowToUser(row);
  }

  async listUsers(): Promise<User[]> {
    const rows = this.getDb().prepare('SELECT * FROM users ORDER BY rowid DESC').all() as UserRow[];
    return rows.map(rowToUser);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const row = this.getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as
      | UserRow
      | undefined;
    return row ? rowToUser(row) : null;
  }

  async getUserByTokenHash(tokenHash: string): Promise<User | null> {
    const row = this.getDb().prepare('SELECT * FROM users WHERE token_hash = ?').get(tokenHash) as
      | UserRow
      | undefined;
    return row ? rowToUser(row) : null;
  }

  async revokeUser(email: string): Promise<void> {
    // Convention: all deletes/revokes are idempotent — silently no-op when the record
    // does not exist. Callers that need to distinguish "not found" from "already revoked"
    // should query first. This matches the behavior of deleteResult and deleteSession.
    this.getDb().prepare('UPDATE users SET revoked = 1 WHERE email = ?').run(email);
  }

  async updateUserTokenHash(email: string, newTokenHash: string): Promise<void> {
    this.getDb().prepare('UPDATE users SET token_hash = ? WHERE email = ?').run(newTokenHash, email);
  }

  async updateUserPasswordHash(email: string, passwordHash: string): Promise<void> {
    this.getDb()
      .prepare('UPDATE users SET password_hash = ? WHERE email = ?')
      .run(passwordHash, email);
  }

  async getUserPasswordHash(email: string): Promise<string | null> {
    const row = this.getDb()
      .prepare('SELECT password_hash FROM users WHERE email = ?')
      .get(email) as { password_hash: string | null } | undefined;
    return row?.password_hash ?? null;
  }

  async countUsers(): Promise<number> {
    const row = this.getDb().prepare('SELECT COUNT(*) as count FROM users').get() as {
      count: number;
    };
    return row.count;
  }

  // --- Config ---

  async getConfig(key: string): Promise<string | null> {
    const row = this.getDb().prepare('SELECT value FROM config WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  async setConfig(key: string, value: string): Promise<void> {
    this.getDb()
      .prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)')
      .run(key, value);
  }

  // --- Access Requests ---

  async createAccessRequest(input: CreateAccessRequestInput, projectId?: string): Promise<AccessRequest> {
    const db = this.getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO access_requests (id, email, name, status, message, created_at, project_id)
       VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
    ).run(id, input.email, input.name, input.message ?? null, now, projectId ?? null);
    const row = db.prepare('SELECT * FROM access_requests WHERE id = ?').get(id) as AccessRequestRow;
    return rowToAccessRequest(row);
  }

  async listAccessRequests(status?: string, projectId?: string): Promise<AccessRequest[]> {
    const db = this.getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (status !== undefined) {
      conditions.push('status = ?');
      params.push(status);
    }
    if (projectId !== undefined) {
      conditions.push('project_id = ?');
      params.push(projectId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = db
      .prepare(`SELECT * FROM access_requests ${where} ORDER BY created_at DESC`)
      .all(...params) as AccessRequestRow[];
    return rows.map(rowToAccessRequest);
  }

  async getAccessRequest(id: string): Promise<AccessRequest | null> {
    const row = this.getDb().prepare('SELECT * FROM access_requests WHERE id = ?').get(id) as AccessRequestRow | undefined;
    return row ? rowToAccessRequest(row) : null;
  }

  async getAccessRequestByEmail(email: string): Promise<AccessRequest | null> {
    const row = this.getDb().prepare('SELECT * FROM access_requests WHERE email = ?').get(email) as AccessRequestRow | undefined;
    return row ? rowToAccessRequest(row) : null;
  }

  async updateAccessRequestStatus(id: string, status: string, reviewedBy: string): Promise<AccessRequest> {
    const db = this.getDb();
    const now = new Date().toISOString();
    db.prepare('UPDATE access_requests SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?').run(status, reviewedBy, now, id);
    const row = db.prepare('SELECT * FROM access_requests WHERE id = ?').get(id) as AccessRequestRow;
    return rowToAccessRequest(row);
  }

  // --- GitHub Tokens ---

  async createOrUpdateGitHubToken(owner: string, tokenEncrypted: string): Promise<GitHubToken> {
    const db = this.getDb();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO github_tokens (owner, token_encrypted, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(owner) DO UPDATE SET token_encrypted = ?, updated_at = ?`,
    ).run(owner, tokenEncrypted, now, now, tokenEncrypted, now);
    const row = db.prepare('SELECT * FROM github_tokens WHERE owner = ?').get(owner) as GitHubTokenRow;
    return rowToGitHubToken(row);
  }

  async getGitHubToken(owner: string): Promise<GitHubToken | null> {
    const row = this.getDb().prepare('SELECT * FROM github_tokens WHERE owner = ?').get(owner) as
      | GitHubTokenRow
      | undefined;
    return row ? rowToGitHubToken(row) : null;
  }

  async getGitHubTokenEncrypted(owner: string): Promise<string | null> {
    const row = this.getDb()
      .prepare('SELECT token_encrypted FROM github_tokens WHERE owner = ?')
      .get(owner) as { token_encrypted: string } | undefined;
    return row?.token_encrypted ?? null;
  }

  async listGitHubTokens(): Promise<GitHubToken[]> {
    const rows = this.getDb()
      .prepare('SELECT * FROM github_tokens ORDER BY owner ASC')
      .all() as GitHubTokenRow[];
    return rows.map(rowToGitHubToken);
  }

  async deleteGitHubToken(owner: string): Promise<void> {
    this.getDb().prepare('DELETE FROM github_tokens WHERE owner = ?').run(owner);
  }

  // --- Internal ---

  private getDb(): Database.Database {
    if (!this.db) throw new Error('SqliteAdapter not initialized. Call initialize() first.');
    return this.db;
  }

}

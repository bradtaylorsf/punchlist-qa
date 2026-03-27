import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import type { StorageAdapter } from './types.js';
import { runPgMigrations } from './pg-migrations.js';
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

interface PostgresAdapterOptions {
  connectionString: string;
  encryptionSecret?: string;
}

export class PostgresAdapter implements StorageAdapter {
  private pool: Pool | null = null;
  private readonly connectionString: string;
  private readonly encryptionSecret?: string;

  constructor(options: PostgresAdapterOptions) {
    this.connectionString = options.connectionString;
    this.encryptionSecret = options.encryptionSecret;
  }

  async initialize(): Promise<void> {
    this.pool = new Pool({ connectionString: this.connectionString });
    await runPgMigrations(this.pool);
  }

  async close(): Promise<void> {
    await this.getPool().end();
    this.pool = null;
  }

  // --- Projects ---

  async createProject(input: CreateProjectInput): Promise<Project> {
    const pool = this.getPool();
    const id = randomUUID();
    const now = new Date().toISOString();
    const name = input.name ?? input.repoSlug.split('/').pop() ?? input.repoSlug;
    await pool.query(
      `INSERT INTO projects (id, repo_slug, name, github_token_encrypted, created_at, updated_at)
       VALUES ($1, $2, $3, NULL, $4, $5)`,
      [id, input.repoSlug, name, now, now],
    );
    const { rows } = await pool.query<ProjectRow>('SELECT * FROM projects WHERE id = $1', [id]);
    return rowToProject(rows[0]);
  }

  async getProject(id: string): Promise<Project | null> {
    const { rows } = await this.getPool().query<ProjectRow>(
      'SELECT * FROM projects WHERE id = $1',
      [id],
    );
    return rows[0] ? rowToProject(rows[0]) : null;
  }

  async getProjectByRepoSlug(repoSlug: string): Promise<Project | null> {
    const { rows } = await this.getPool().query<ProjectRow>(
      'SELECT * FROM projects WHERE repo_slug = $1',
      [repoSlug],
    );
    return rows[0] ? rowToProject(rows[0]) : null;
  }

  async listProjects(): Promise<Project[]> {
    const { rows } = await this.getPool().query<ProjectRow>(
      'SELECT * FROM projects ORDER BY created_at DESC',
    );
    return rows.map(rowToProject);
  }

  async updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
    const pool = this.getPool();
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      sets.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }

    if (sets.length > 0) {
      sets.push(`updated_at = $${paramIndex++}`);
      values.push(new Date().toISOString());
      values.push(id);
      const result = await pool.query(
        `UPDATE projects SET ${sets.join(', ')} WHERE id = $${paramIndex}`,
        values,
      );
      if (result.rowCount === 0) throw new Error('Project not found');
    } else {
      const existing = await this.getProject(id);
      if (!existing) throw new Error('Project not found');
    }

    return (await this.getProject(id))!;
  }

  async deleteProject(id: string): Promise<void> {
    await this.getPool().query('DELETE FROM projects WHERE id = $1', [id]);
  }

  // --- Project Users ---

  async addUserToProject(projectId: string, userEmail: string, role?: string): Promise<ProjectUser> {
    const pool = this.getPool();
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO project_users (project_id, user_email, role, created_at)
       VALUES ($1, $2, $3, $4)`,
      [projectId, userEmail, role ?? 'tester', now],
    );
    const { rows } = await pool.query<ProjectUserRow>(
      'SELECT * FROM project_users WHERE project_id = $1 AND user_email = $2',
      [projectId, userEmail],
    );
    return rowToProjectUser(rows[0]);
  }

  async removeUserFromProject(projectId: string, userEmail: string): Promise<void> {
    await this.getPool().query(
      'DELETE FROM project_users WHERE project_id = $1 AND user_email = $2',
      [projectId, userEmail],
    );
  }

  async listProjectUsers(projectId: string): Promise<ProjectUser[]> {
    const { rows } = await this.getPool().query<ProjectUserRow>(
      'SELECT * FROM project_users WHERE project_id = $1 ORDER BY created_at ASC',
      [projectId],
    );
    return rows.map(rowToProjectUser);
  }

  async listUserProjects(userEmail: string): Promise<Project[]> {
    const { rows } = await this.getPool().query<ProjectRow>(
      `SELECT p.* FROM projects p
       JOIN project_users pu ON p.id = pu.project_id
       WHERE pu.user_email = $1
       ORDER BY p.created_at DESC`,
      [userEmail],
    );
    return rows.map(rowToProject);
  }

  // --- Rounds ---

  async createRound(input: CreateRoundInput, projectId?: string): Promise<Round> {
    const pool = this.getPool();
    const id = randomUUID();
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO rounds (id, name, description, status, created_by_email, created_by_name, created_at, completed_at, project_id)
       VALUES ($1, $2, $3, 'active', $4, $5, $6, NULL, $7)`,
      [
        id,
        input.name,
        input.description ?? null,
        input.createdByEmail,
        input.createdByName,
        now,
        projectId ?? null,
      ],
    );
    return (await this.getRound(id))!;
  }

  async listRounds(projectId?: string): Promise<Round[]> {
    if (projectId !== undefined) {
      const { rows } = await this.getPool().query<RoundRow>(
        'SELECT * FROM rounds WHERE project_id = $1 ORDER BY created_at DESC',
        [projectId],
      );
      return rows.map(rowToRound);
    }
    const { rows } = await this.getPool().query<RoundRow>(
      'SELECT * FROM rounds ORDER BY created_at DESC',
    );
    return rows.map(rowToRound);
  }

  async getRound(id: string): Promise<Round | null> {
    const { rows } = await this.getPool().query<RoundRow>(
      'SELECT * FROM rounds WHERE id = $1',
      [id],
    );
    return rows[0] ? rowToRound(rows[0]) : null;
  }

  async updateRound(id: string, input: UpdateRoundInput): Promise<Round> {
    const pool = this.getPool();
    const sets: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      sets.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.description !== undefined) {
      sets.push(`description = $${paramIndex++}`);
      values.push(input.description);
    }
    if (input.status !== undefined) {
      sets.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }
    if (input.completedAt !== undefined) {
      sets.push(`completed_at = $${paramIndex++}`);
      values.push(input.completedAt);
    }

    if (sets.length > 0) {
      values.push(id);
      const result = await pool.query(
        `UPDATE rounds SET ${sets.join(', ')} WHERE id = $${paramIndex}`,
        values,
      );
      if (result.rowCount === 0) throw new Error('Round not found');
    } else {
      const existing = await this.getRound(id);
      if (!existing) throw new Error('Round not found');
    }

    return (await this.getRound(id))!;
  }

  // --- Results ---

  async submitResult(roundId: string, input: SubmitResultInput, projectId?: string): Promise<Result> {
    const pool = this.getPool();
    const now = new Date().toISOString();

    // Check for existing result to preserve ID, created_at, and issue link on upsert
    const { rows: existingRows } = await pool.query<{
      id: string;
      created_at: Date;
      issue_url: string | null;
      issue_number: number | null;
    }>(
      'SELECT id, created_at, issue_url, issue_number FROM results WHERE round_id = $1 AND test_id = $2',
      [roundId, input.testId],
    );
    const existing = existingRows[0];

    const id = existing?.id ?? randomUUID();
    const createdAt =
      existing?.created_at instanceof Date
        ? existing.created_at.toISOString()
        : (existing?.created_at ?? now);

    await pool.query(
      `INSERT INTO results (id, round_id, test_id, status, tester_name, tester_email, description, severity, commit_hash, issue_url, issue_number, created_at, updated_at, project_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (round_id, test_id) DO UPDATE SET
         id = EXCLUDED.id,
         status = EXCLUDED.status,
         tester_name = EXCLUDED.tester_name,
         tester_email = EXCLUDED.tester_email,
         description = EXCLUDED.description,
         severity = EXCLUDED.severity,
         commit_hash = EXCLUDED.commit_hash,
         updated_at = EXCLUDED.updated_at,
         project_id = EXCLUDED.project_id`,
      [
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
      ],
    );

    const { rows } = await pool.query<ResultRow>('SELECT * FROM results WHERE id = $1', [id]);
    return rowToResult(rows[0]);
  }

  async listResults(roundId: string, projectId?: string): Promise<Result[]> {
    if (projectId !== undefined) {
      const { rows } = await this.getPool().query<ResultRow>(
        'SELECT * FROM results WHERE round_id = $1 AND project_id = $2 ORDER BY created_at DESC',
        [roundId, projectId],
      );
      return rows.map(rowToResult);
    }
    const { rows } = await this.getPool().query<ResultRow>(
      'SELECT * FROM results WHERE round_id = $1 ORDER BY created_at DESC',
      [roundId],
    );
    return rows.map(rowToResult);
  }

  async deleteResult(id: string): Promise<void> {
    await this.getPool().query('DELETE FROM results WHERE id = $1', [id]);
  }

  async deleteResultsByTestIds(roundId: string, testIds: string[]): Promise<number> {
    if (testIds.length === 0) return 0;
    // PostgreSQL supports ANY($2::text[]) — no batch size limit needed here since
    // pg sends the array as a single parameter, avoiding the SQLite variable limit.
    const result = await this.getPool().query(
      'DELETE FROM results WHERE round_id = $1 AND test_id = ANY($2::text[])',
      [roundId, testIds],
    );
    return result.rowCount ?? 0;
  }

  async updateResultIssue(id: string, issueUrl: string, issueNumber: number): Promise<Result> {
    const pool = this.getPool();
    const now = new Date().toISOString();
    const result = await pool.query(
      'UPDATE results SET issue_url = $1, issue_number = $2, updated_at = $3 WHERE id = $4',
      [issueUrl, issueNumber, now, id],
    );
    if (result.rowCount === 0) throw new Error('Result not found');
    const { rows } = await pool.query<ResultRow>('SELECT * FROM results WHERE id = $1', [id]);
    return rowToResult(rows[0]);
  }

  // --- Users ---

  async createUser(input: CreateUserInput): Promise<User> {
    const pool = this.getPool();
    const id = randomUUID();
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO users (id, email, name, token_hash, role, invited_by, revoked, created_at, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, $8)`,
      [
        id,
        input.email,
        input.name,
        input.tokenHash,
        input.role,
        input.invitedBy,
        now,
        input.passwordHash ?? null,
      ],
    );
    const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return rowToUser(rows[0]);
  }

  async listUsers(): Promise<User[]> {
    const { rows } = await this.getPool().query<UserRow>(
      'SELECT * FROM users ORDER BY created_at DESC',
    );
    return rows.map(rowToUser);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const { rows } = await this.getPool().query<UserRow>(
      'SELECT * FROM users WHERE email = $1',
      [email],
    );
    return rows[0] ? rowToUser(rows[0]) : null;
  }

  async getUserByTokenHash(tokenHash: string): Promise<User | null> {
    const { rows } = await this.getPool().query<UserRow>(
      'SELECT * FROM users WHERE token_hash = $1',
      [tokenHash],
    );
    return rows[0] ? rowToUser(rows[0]) : null;
  }

  async revokeUser(email: string): Promise<void> {
    // Idempotent — silently no-ops if user does not exist
    await this.getPool().query('UPDATE users SET revoked = TRUE WHERE email = $1', [email]);
  }

  async updateUserTokenHash(email: string, newTokenHash: string): Promise<void> {
    await this.getPool().query('UPDATE users SET token_hash = $1 WHERE email = $2', [
      newTokenHash,
      email,
    ]);
  }

  async updateUserPasswordHash(email: string, passwordHash: string): Promise<void> {
    await this.getPool().query('UPDATE users SET password_hash = $1 WHERE email = $2', [
      passwordHash,
      email,
    ]);
  }

  async getUserPasswordHash(email: string): Promise<string | null> {
    const { rows } = await this.getPool().query<{ password_hash: string | null }>(
      'SELECT password_hash FROM users WHERE email = $1',
      [email],
    );
    return rows[0]?.password_hash ?? null;
  }

  async countUsers(): Promise<number> {
    const { rows } = await this.getPool().query<{ count: string }>(
      'SELECT COUNT(*) as count FROM users',
    );
    return parseInt(rows[0]?.count ?? '0', 10);
  }

  // --- Config ---

  async getConfig(key: string): Promise<string | null> {
    const { rows } = await this.getPool().query<{ value: string }>(
      'SELECT value FROM config WHERE key = $1',
      [key],
    );
    return rows[0]?.value ?? null;
  }

  async setConfig(key: string, value: string): Promise<void> {
    await this.getPool().query(
      `INSERT INTO config (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value],
    );
  }

  // --- Access Requests ---

  async createAccessRequest(
    input: CreateAccessRequestInput,
    projectId?: string,
  ): Promise<AccessRequest> {
    const pool = this.getPool();
    const id = randomUUID();
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO access_requests (id, email, name, status, message, created_at, project_id)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6)`,
      [id, input.email, input.name, input.message ?? null, now, projectId ?? null],
    );
    const { rows } = await pool.query<AccessRequestRow>(
      'SELECT * FROM access_requests WHERE id = $1',
      [id],
    );
    return rowToAccessRequest(rows[0]);
  }

  async listAccessRequests(status?: string, projectId?: string): Promise<AccessRequest[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status !== undefined) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (projectId !== undefined) {
      conditions.push(`project_id = $${paramIndex}`);
      params.push(projectId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await this.getPool().query<AccessRequestRow>(
      `SELECT * FROM access_requests ${where} ORDER BY created_at DESC`,
      params,
    );
    return rows.map(rowToAccessRequest);
  }

  async getAccessRequest(id: string): Promise<AccessRequest | null> {
    const { rows } = await this.getPool().query<AccessRequestRow>(
      'SELECT * FROM access_requests WHERE id = $1',
      [id],
    );
    return rows[0] ? rowToAccessRequest(rows[0]) : null;
  }

  async getAccessRequestByEmail(email: string): Promise<AccessRequest | null> {
    const { rows } = await this.getPool().query<AccessRequestRow>(
      'SELECT * FROM access_requests WHERE email = $1',
      [email],
    );
    return rows[0] ? rowToAccessRequest(rows[0]) : null;
  }

  async updateAccessRequestStatus(
    id: string,
    status: string,
    reviewedBy: string,
  ): Promise<AccessRequest> {
    const pool = this.getPool();
    const now = new Date().toISOString();
    await pool.query(
      'UPDATE access_requests SET status = $1, reviewed_by = $2, reviewed_at = $3 WHERE id = $4',
      [status, reviewedBy, now, id],
    );
    const { rows } = await pool.query<AccessRequestRow>(
      'SELECT * FROM access_requests WHERE id = $1',
      [id],
    );
    return rowToAccessRequest(rows[0]);
  }

  // --- GitHub Tokens ---

  async createOrUpdateGitHubToken(owner: string, tokenEncrypted: string): Promise<GitHubToken> {
    const pool = this.getPool();
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO github_tokens (owner, token_encrypted, created_at, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(owner) DO UPDATE SET token_encrypted = $2, updated_at = $4`,
      [owner, tokenEncrypted, now, now],
    );
    const { rows } = await pool.query<GitHubTokenRow>(
      'SELECT * FROM github_tokens WHERE owner = $1',
      [owner],
    );
    return rowToGitHubToken(rows[0]);
  }

  async getGitHubToken(owner: string): Promise<GitHubToken | null> {
    const pool = this.getPool();
    const { rows } = await pool.query<GitHubTokenRow>(
      'SELECT * FROM github_tokens WHERE owner = $1',
      [owner],
    );
    return rows[0] ? rowToGitHubToken(rows[0]) : null;
  }

  async getGitHubTokenEncrypted(owner: string): Promise<string | null> {
    const pool = this.getPool();
    const { rows } = await pool.query<{ token_encrypted: string }>(
      'SELECT token_encrypted FROM github_tokens WHERE owner = $1',
      [owner],
    );
    return rows[0]?.token_encrypted ?? null;
  }

  async listGitHubTokens(): Promise<GitHubToken[]> {
    const pool = this.getPool();
    const { rows } = await pool.query<GitHubTokenRow>(
      'SELECT * FROM github_tokens ORDER BY owner ASC',
    );
    return rows.map(rowToGitHubToken);
  }

  async deleteGitHubToken(owner: string): Promise<void> {
    const pool = this.getPool();
    await pool.query('DELETE FROM github_tokens WHERE owner = $1', [owner]);
  }

  // --- Internal ---

  private getPool(): Pool {
    if (!this.pool) throw new Error('PostgresAdapter not initialized. Call initialize() first.');
    return this.pool;
  }

}

import { Pool } from 'pg';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import type { StorageAdapter } from './types.js';
import { runPgMigrations } from './pg-migrations.js';
import {
  roundSchema,
  resultSchema,
  userSchema,
  sessionSchema,
  accessRequestSchema,
  projectSchema,
  projectUserSchema,
} from '../../shared/schemas.js';
import type {
  Round,
  Result,
  User,
  Session,
  AccessRequest,
  AccessRequestStatus,
  Project,
  ProjectUser,
  CreateRoundInput,
  UpdateRoundInput,
  SubmitResultInput,
  CreateUserInput,
  CreateAccessRequestInput,
  CreateProjectInput,
  UpdateProjectInput,
} from '../../shared/types.js';
import { encrypt } from '../../shared/encryption.js';

interface PostgresAdapterOptions {
  connectionString: string;
  encryptionSecret?: string;
}

// Row types (snake_case from pg driver — plain objects, timestamps are Date objects)

interface ProjectRow {
  id: string;
  repo_slug: string;
  name: string;
  github_token_encrypted: string | null;
  created_at: Date;
  updated_at: Date;
}

interface ProjectUserRow {
  project_id: string;
  user_email: string;
  role: string;
  created_at: Date;
}

interface RoundRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_by_email: string;
  created_by_name: string;
  created_at: Date;
  completed_at: Date | null;
  project_id: string | null;
}

interface ResultRow {
  id: string;
  round_id: string;
  test_id: string;
  status: string;
  tester_name: string;
  tester_email: string;
  description: string | null;
  severity: string | null;
  commit_hash: string | null;
  issue_url: string | null;
  issue_number: number | null;
  created_at: Date;
  updated_at: Date;
  project_id: string | null;
}

interface SessionRow {
  id: string;
  user_email: string;
  expires_at: Date;
  created_at: Date;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  token_hash: string;
  role: string;
  invited_by: string;
  revoked: boolean;
  created_at: Date;
}

interface AccessRequestRow {
  id: string;
  email: string;
  name: string;
  status: string;
  message: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  project_id: string | null;
}

// --- Row conversion helpers ---
// pg returns native Date objects for TIMESTAMPTZ columns; convert with .toISOString()
// pg returns native booleans for BOOLEAN columns (no === 1 conversion needed)

function rowToProject(row: ProjectRow): Project {
  return projectSchema.parse({
    id: row.id,
    repoSlug: row.repo_slug,
    name: row.name,
    githubTokenEncrypted: row.github_token_encrypted,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  });
}

function rowToProjectUser(row: ProjectUserRow): ProjectUser {
  return projectUserSchema.parse({
    projectId: row.project_id,
    userEmail: row.user_email,
    role: row.role,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  });
}

function rowToRound(row: RoundRow): Round {
  return roundSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    createdByEmail: row.created_by_email,
    createdByName: row.created_by_name,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    completedAt:
      row.completed_at instanceof Date
        ? row.completed_at.toISOString()
        : row.completed_at ?? null,
    projectId: row.project_id,
  });
}

function rowToResult(row: ResultRow): Result {
  return resultSchema.parse({
    id: row.id,
    roundId: row.round_id,
    testId: row.test_id,
    status: row.status,
    testerName: row.tester_name,
    testerEmail: row.tester_email,
    description: row.description,
    severity: row.severity,
    commitHash: row.commit_hash,
    issueUrl: row.issue_url,
    issueNumber: row.issue_number,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    projectId: row.project_id,
  });
}

function rowToSession(row: SessionRow): Session {
  return sessionSchema.parse({
    id: row.id,
    userEmail: row.user_email,
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  });
}

function rowToUser(row: UserRow): User {
  return userSchema.parse({
    id: row.id,
    email: row.email,
    name: row.name,
    tokenHash: row.token_hash,
    role: row.role,
    invitedBy: row.invited_by,
    // pg returns native booleans — no === 1 coercion needed
    revoked: row.revoked,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  });
}

function rowToAccessRequest(row: AccessRequestRow): AccessRequest {
  return accessRequestSchema.parse({
    id: row.id,
    email: row.email,
    name: row.name,
    status: row.status as AccessRequestStatus,
    message: row.message,
    reviewedBy: row.reviewed_by,
    reviewedAt:
      row.reviewed_at instanceof Date
        ? row.reviewed_at.toISOString()
        : row.reviewed_at ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    projectId: row.project_id,
  });
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
    const encryptedToken = input.githubToken
      ? encrypt(input.githubToken, this.requireEncryptionSecret())
      : null;
    await pool.query(
      `INSERT INTO projects (id, repo_slug, name, github_token_encrypted, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, input.repoSlug, input.name, encryptedToken, now, now],
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
    if (input.githubToken !== undefined) {
      sets.push(`github_token_encrypted = $${paramIndex++}`);
      values.push(
        input.githubToken !== null
          ? encrypt(input.githubToken, this.requireEncryptionSecret())
          : null,
      );
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
      `INSERT INTO users (id, email, name, token_hash, role, invited_by, revoked, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7)`,
      [id, input.email, input.name, input.tokenHash, input.role, input.invitedBy, now],
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

  // --- Sessions ---

  async createSession(userEmail: string, expiresAt: string): Promise<Session> {
    const pool = this.getPool();
    const rawId = randomBytes(32).toString('hex');
    // Store a SHA-256 hash of the session ID — if the DB leaks,
    // an attacker cannot directly impersonate sessions.
    const id = createHash('sha256').update(rawId).digest('hex');
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO sessions (id, user_email, expires_at, created_at)
       VALUES ($1, $2, $3, $4)`,
      [id, userEmail, expiresAt, now],
    );
    const { rows } = await pool.query<SessionRow>('SELECT * FROM sessions WHERE id = $1', [id]);
    // Return the raw ID to the caller (for cookie storage); the DB stores the hash.
    const session = rowToSession(rows[0]);
    return { ...session, id: rawId };
  }

  async getSession(id: string): Promise<Session | null> {
    const hashedId = createHash('sha256').update(id).digest('hex');
    const { rows } = await this.getPool().query<SessionRow>(
      'SELECT * FROM sessions WHERE id = $1',
      [hashedId],
    );
    if (!rows[0]) return null;
    // Return the raw ID the caller provided, not the hash stored in the DB.
    const session = rowToSession(rows[0]);
    return { ...session, id };
  }

  async getSessionWithUser(id: string): Promise<{ session: Session; user: User } | null> {
    const hashedId = createHash('sha256').update(id).digest('hex');
    const { rows } = await this.getPool().query<{
      s_id: string;
      s_user_email: string;
      s_expires_at: Date;
      s_created_at: Date;
      u_id: string;
      u_email: string;
      u_name: string;
      u_token_hash: string;
      u_role: string;
      u_invited_by: string;
      u_revoked: boolean;
      u_created_at: Date;
    }>(
      `SELECT
        s.id AS s_id, s.user_email AS s_user_email, s.expires_at AS s_expires_at, s.created_at AS s_created_at,
        u.id AS u_id, u.email AS u_email, u.name AS u_name, u.token_hash AS u_token_hash,
        u.role AS u_role, u.invited_by AS u_invited_by, u.revoked AS u_revoked, u.created_at AS u_created_at
       FROM sessions s
       JOIN users u ON s.user_email = u.email
       WHERE s.id = $1`,
      [hashedId],
    );
    if (!rows[0]) return null;
    const row = rows[0];
    // Return the raw ID the caller provided, not the hash stored in the DB.
    const session = rowToSession({
      id: row.s_id,
      user_email: row.s_user_email,
      expires_at: row.s_expires_at,
      created_at: row.s_created_at,
    });
    return {
      session: { ...session, id },
      user: rowToUser({
        id: row.u_id,
        email: row.u_email,
        name: row.u_name,
        token_hash: row.u_token_hash,
        role: row.u_role,
        invited_by: row.u_invited_by,
        revoked: row.u_revoked,
        created_at: row.u_created_at,
      }),
    };
  }

  async deleteSession(id: string): Promise<void> {
    const hashedId = createHash('sha256').update(id).digest('hex');
    await this.getPool().query('DELETE FROM sessions WHERE id = $1', [hashedId]);
  }

  async deleteExpiredSessions(): Promise<void> {
    await this.getPool().query('DELETE FROM sessions WHERE expires_at < $1', [
      new Date().toISOString(),
    ]);
  }

  /**
   * Start a background interval to delete expired sessions.
   * The interval is unref'd so it won't prevent Node.js from exiting.
   * Returns a stop function that clears the interval.
   */
  startSessionCleanup(intervalMs: number = 60 * 60 * 1000): () => void {
    const timer = setInterval(() => {
      this.deleteExpiredSessions().catch((err) => {
        console.warn('[punchlist] Session cleanup failed:', err);
      });
    }, intervalMs);
    timer.unref();
    return () => clearInterval(timer);
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

  // --- Internal ---

  private getPool(): Pool {
    if (!this.pool) throw new Error('PostgresAdapter not initialized. Call initialize() first.');
    return this.pool;
  }

  private requireEncryptionSecret(): string {
    if (!this.encryptionSecret) {
      throw new Error(
        'Encryption secret is required for token operations. Set PUNCHLIST_AUTH_SECRET or pass encryptionSecret to PostgresAdapter.',
      );
    }
    return this.encryptionSecret;
  }
}

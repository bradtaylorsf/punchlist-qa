import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import type { StorageAdapter } from './types.js';
import { runMigrations } from './migrations.js';
import type {
  Round,
  Result,
  User,
  Session,
  CreateRoundInput,
  UpdateRoundInput,
  SubmitResultInput,
  CreateUserInput,
} from '../../shared/types.js';

interface SqliteAdapterOptions {
  dbPath?: string;
}

// Row types (snake_case from SQLite)
interface RoundRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  created_by_email: string;
  created_by_name: string;
  created_at: string;
  completed_at: string | null;
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
  created_at: string;
  updated_at: string;
}

interface SessionRow {
  id: string;
  user_email: string;
  expires_at: string;
  created_at: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  token_hash: string;
  role: string;
  invited_by: string;
  revoked: number;
  created_at: string;
}

function rowToRound(row: RoundRow): Round {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status as Round['status'],
    createdByEmail: row.created_by_email,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function rowToResult(row: ResultRow): Result {
  return {
    id: row.id,
    roundId: row.round_id,
    testId: row.test_id,
    status: row.status as Result['status'],
    testerName: row.tester_name,
    testerEmail: row.tester_email,
    description: row.description,
    severity: row.severity as Result['severity'],
    commitHash: row.commit_hash,
    issueUrl: row.issue_url,
    issueNumber: row.issue_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    userEmail: row.user_email,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    tokenHash: row.token_hash,
    role: row.role as User['role'],
    invitedBy: row.invited_by,
    revoked: row.revoked === 1,
    createdAt: row.created_at,
  };
}

export class SqliteAdapter implements StorageAdapter {
  private db: Database.Database | null = null;
  private readonly dbPath: string;

  constructor(options: SqliteAdapterOptions = {}) {
    this.dbPath = options.dbPath ?? '.punchlist/punchlist.db';
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

  // --- Rounds ---

  async createRound(input: CreateRoundInput): Promise<Round> {
    const db = this.getDb();
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO rounds (id, name, description, status, created_by_email, created_by_name, created_at, completed_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?, NULL)`,
    ).run(id, input.name, input.description ?? null, input.createdByEmail, input.createdByName, now);
    return (await this.getRound(id))!;
  }

  async listRounds(): Promise<Round[]> {
    const rows = this.getDb().prepare('SELECT * FROM rounds ORDER BY rowid DESC').all() as RoundRow[];
    return rows.map(rowToRound);
  }

  async getRound(id: string): Promise<Round | null> {
    const row = this.getDb().prepare('SELECT * FROM rounds WHERE id = ?').get(id) as RoundRow | undefined;
    return row ? rowToRound(row) : null;
  }

  async updateRound(id: string, input: UpdateRoundInput): Promise<Round> {
    const db = this.getDb();
    const sets: string[] = [];
    const values: unknown[] = [];

    if (input.name !== undefined) { sets.push('name = ?'); values.push(input.name); }
    if (input.description !== undefined) { sets.push('description = ?'); values.push(input.description); }
    if (input.status !== undefined) { sets.push('status = ?'); values.push(input.status); }
    if (input.completedAt !== undefined) { sets.push('completed_at = ?'); values.push(input.completedAt); }

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

  async submitResult(roundId: string, input: SubmitResultInput): Promise<Result> {
    const db = this.getDb();
    const now = new Date().toISOString();

    // Check for existing result to preserve ID, created_at, and issue link on replace
    const existing = db.prepare(
      'SELECT id, created_at, issue_url, issue_number FROM results WHERE round_id = ? AND test_id = ?',
    ).get(roundId, input.testId) as {
      id: string; created_at: string; issue_url: string | null; issue_number: number | null;
    } | undefined;

    const id = existing?.id ?? randomUUID();
    const createdAt = existing?.created_at ?? now;

    db.prepare(
      `INSERT OR REPLACE INTO results (id, round_id, test_id, status, tester_name, tester_email, description, severity, commit_hash, issue_url, issue_number, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, roundId, input.testId, input.status,
      input.testerName, input.testerEmail,
      input.description ?? null, input.severity ?? null,
      input.commitHash ?? null,
      existing?.issue_url ?? null, existing?.issue_number ?? null,
      createdAt, now,
    );

    const row = db.prepare('SELECT * FROM results WHERE id = ?').get(id) as ResultRow;
    return rowToResult(row);
  }

  async listResults(roundId: string): Promise<Result[]> {
    const rows = this.getDb().prepare('SELECT * FROM results WHERE round_id = ? ORDER BY rowid DESC').all(roundId) as ResultRow[];
    return rows.map(rowToResult);
  }

  async deleteResult(id: string): Promise<void> {
    this.getDb().prepare('DELETE FROM results WHERE id = ?').run(id);
  }

  async deleteResultsByTestIds(roundId: string, testIds: string[]): Promise<void> {
    if (testIds.length === 0) return;
    const placeholders = testIds.map(() => '?').join(', ');
    this.getDb().prepare(
      `DELETE FROM results WHERE round_id = ? AND test_id IN (${placeholders})`,
    ).run(roundId, ...testIds);
  }

  async updateResultIssue(id: string, issueUrl: string, issueNumber: number): Promise<Result> {
    const db = this.getDb();
    const now = new Date().toISOString();
    const result = db.prepare(
      'UPDATE results SET issue_url = ?, issue_number = ?, updated_at = ? WHERE id = ?',
    ).run(issueUrl, issueNumber, now, id);
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
      `INSERT INTO users (id, email, name, token_hash, role, invited_by, revoked, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    ).run(id, input.email, input.name, input.tokenHash, input.role, input.invitedBy, now);
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow;
    return rowToUser(row);
  }

  async listUsers(): Promise<User[]> {
    const rows = this.getDb().prepare('SELECT * FROM users ORDER BY rowid DESC').all() as UserRow[];
    return rows.map(rowToUser);
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const row = this.getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
    return row ? rowToUser(row) : null;
  }

  async getUserByTokenHash(tokenHash: string): Promise<User | null> {
    const row = this.getDb().prepare('SELECT * FROM users WHERE token_hash = ?').get(tokenHash) as UserRow | undefined;
    return row ? rowToUser(row) : null;
  }

  async revokeUser(email: string): Promise<void> {
    const result = this.getDb().prepare('UPDATE users SET revoked = 1 WHERE email = ?').run(email);
    if (result.changes === 0) throw new Error('User not found');
  }

  // --- Config ---

  async getConfig(key: string): Promise<string | null> {
    const row = this.getDb().prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  async setConfig(key: string, value: string): Promise<void> {
    this.getDb().prepare(
      'INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
    ).run(key, value);
  }

  // --- Sessions ---

  async createSession(userEmail: string, expiresAt: string): Promise<Session> {
    const db = this.getDb();
    const id = randomBytes(32).toString('hex');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO sessions (id, user_email, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(id, userEmail, expiresAt, now);
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow;
    return rowToSession(row);
  }

  async getSession(id: string): Promise<Session | null> {
    const row = this.getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
    return row ? rowToSession(row) : null;
  }

  async getSessionWithUser(id: string): Promise<{ session: Session; user: User } | null> {
    const row = this.getDb().prepare(
      `SELECT
        s.id AS s_id, s.user_email AS s_user_email, s.expires_at AS s_expires_at, s.created_at AS s_created_at,
        u.id AS u_id, u.email AS u_email, u.name AS u_name, u.token_hash AS u_token_hash,
        u.role AS u_role, u.invited_by AS u_invited_by, u.revoked AS u_revoked, u.created_at AS u_created_at
       FROM sessions s
       JOIN users u ON s.user_email = u.email
       WHERE s.id = ?`,
    ).get(id) as {
      s_id: string; s_user_email: string; s_expires_at: string; s_created_at: string;
      u_id: string; u_email: string; u_name: string; u_token_hash: string;
      u_role: string; u_invited_by: string; u_revoked: number; u_created_at: string;
    } | undefined;
    if (!row) return null;
    return {
      session: { id: row.s_id, userEmail: row.s_user_email, expiresAt: row.s_expires_at, createdAt: row.s_created_at },
      user: rowToUser({
        id: row.u_id, email: row.u_email, name: row.u_name, token_hash: row.u_token_hash,
        role: row.u_role, invited_by: row.u_invited_by, revoked: row.u_revoked, created_at: row.u_created_at,
      }),
    };
  }

  async deleteSession(id: string): Promise<void> {
    this.getDb().prepare('DELETE FROM sessions WHERE id = ?').run(id);
  }

  async deleteExpiredSessions(): Promise<void> {
    this.getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  }

  // --- Internal ---

  private getDb(): Database.Database {
    if (!this.db) throw new Error('SqliteAdapter not initialized. Call initialize() first.');
    return this.db;
  }
}

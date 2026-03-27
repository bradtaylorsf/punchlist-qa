import type { Pool } from 'pg';

export interface PgMigration {
  version: number;
  description: string;
  up: string;
}

export const pgMigrations: PgMigration[] = [
  {
    version: 1,
    description: 'Create all tables',
    up: `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'tester',
        invited_by TEXT NOT NULL,
        revoked BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_users_token_hash ON users(token_hash);

      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY,
        repo_slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        github_token_encrypted TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_projects_repo_slug ON projects(repo_slug);

      CREATE TABLE IF NOT EXISTS project_users (
        project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_email TEXT NOT NULL REFERENCES users(email),
        role TEXT NOT NULL DEFAULT 'tester',
        created_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (project_id, user_email)
      );

      CREATE INDEX IF NOT EXISTS idx_project_users_user_email ON project_users(user_email);

      CREATE TABLE IF NOT EXISTS rounds (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_by_email TEXT NOT NULL,
        created_by_name TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ,
        project_id UUID REFERENCES projects(id)
      );

      CREATE INDEX IF NOT EXISTS idx_rounds_project_id ON rounds(project_id);

      CREATE TABLE IF NOT EXISTS results (
        id UUID PRIMARY KEY,
        round_id UUID NOT NULL REFERENCES rounds(id),
        test_id TEXT NOT NULL,
        status TEXT NOT NULL,
        tester_name TEXT NOT NULL,
        tester_email TEXT NOT NULL,
        description TEXT,
        severity TEXT,
        commit_hash TEXT,
        issue_url TEXT,
        issue_number INTEGER,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        project_id UUID REFERENCES projects(id),
        UNIQUE(round_id, test_id)
      );

      CREATE INDEX IF NOT EXISTS idx_results_round_id ON results(round_id);
      CREATE INDEX IF NOT EXISTS idx_results_project_id ON results(project_id);

      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_email TEXT NOT NULL REFERENCES users(email),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user_email ON sessions(user_email);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS access_requests (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        message TEXT,
        reviewed_by TEXT,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        project_id UUID REFERENCES projects(id)
      );

      CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
      CREATE INDEX IF NOT EXISTS idx_access_requests_project_id ON access_requests(project_id);
    `,
  },
  {
    version: 2,
    description: 'Add password_hash column to users table',
    up: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
    `,
  },
];

export async function runPgMigrations(pool: Pool): Promise<void> {
  // Use an advisory lock (key = 1234567890) to prevent concurrent migration runs
  // across multiple server instances hitting the same DB simultaneously.
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(1234567890)');
    try {
      // Ensure migrations tracking table exists
      await client.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          version INTEGER PRIMARY KEY,
          description TEXT NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL
        )
      `);

      // Determine which migrations have already been applied
      const { rows } = await client.query<{ version: number }>(
        'SELECT version FROM _migrations',
      );
      const applied = new Set(rows.map((r) => r.version));
      const pending = pgMigrations.filter((m) => !applied.has(m.version));

      if (pending.length === 0) return;

      // Apply each pending migration inside a single transaction
      await client.query('BEGIN');
      try {
        for (const migration of pending) {
          await client.query(migration.up);
          await client.query(
            'INSERT INTO _migrations (version, description, applied_at) VALUES ($1, $2, $3)',
            [migration.version, migration.description, new Date().toISOString()],
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(1234567890)');
    }
  } finally {
    client.release();
  }
}

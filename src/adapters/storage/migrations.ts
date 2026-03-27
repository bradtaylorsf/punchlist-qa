import type Database from 'better-sqlite3';
import { z } from 'zod';

const migrationVersionRow = z.object({ version: z.number() });

export interface Migration {
  version: number;
  description: string;
  up: string;
}

export const migrations: Migration[] = [
  {
    version: 1,
    description: 'Create rounds, results, users, and config tables',
    up: `
      CREATE TABLE rounds (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_by_email TEXT NOT NULL,
        created_by_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE results (
        id TEXT PRIMARY KEY,
        round_id TEXT NOT NULL REFERENCES rounds(id),
        test_id TEXT NOT NULL,
        status TEXT NOT NULL,
        tester_name TEXT NOT NULL,
        tester_email TEXT NOT NULL,
        description TEXT,
        severity TEXT,
        commit_hash TEXT,
        issue_url TEXT,
        issue_number INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(round_id, test_id)
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'tester',
        invited_by TEXT NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX idx_results_round_id ON results(round_id);
      CREATE INDEX idx_users_token_hash ON users(token_hash);
    `,
  },
  {
    version: 2,
    description: 'Create sessions table',
    up: `
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_email TEXT NOT NULL REFERENCES users(email),
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_sessions_user_email ON sessions(user_email);
      CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
    `,
  },
  {
    version: 3,
    description: 'Create access_requests table',
    up: `
      CREATE TABLE IF NOT EXISTS access_requests (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        message TEXT,
        reviewed_by TEXT,
        reviewed_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
    `,
  },
  {
    version: 4,
    description: 'Create projects and project_users tables, add project_id to scoped tables',
    up: `
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        repo_slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        github_token_encrypted TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_projects_repo_slug ON projects(repo_slug);

      CREATE TABLE project_users (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_email TEXT NOT NULL REFERENCES users(email),
        role TEXT NOT NULL DEFAULT 'tester',
        created_at TEXT NOT NULL,
        PRIMARY KEY (project_id, user_email)
      );

      CREATE INDEX idx_project_users_user_email ON project_users(user_email);

      ALTER TABLE rounds ADD COLUMN project_id TEXT REFERENCES projects(id);
      ALTER TABLE results ADD COLUMN project_id TEXT REFERENCES projects(id);
      ALTER TABLE access_requests ADD COLUMN project_id TEXT REFERENCES projects(id);

      CREATE INDEX idx_rounds_project_id ON rounds(project_id);
      CREATE INDEX idx_results_project_id ON results(project_id);
      CREATE INDEX idx_access_requests_project_id ON access_requests(project_id);
    `,
  },
  {
    version: 5,
    description: 'Add password_hash column to users table',
    up: `
      ALTER TABLE users ADD COLUMN password_hash TEXT;
    `,
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    db
      .prepare('SELECT version FROM migrations')
      .all()
      .map((r) => migrationVersionRow.parse(r).version),
  );

  const pending = migrations.filter((m) => !applied.has(m.version));
  if (pending.length === 0) return;

  const insert = db.prepare(
    'INSERT INTO migrations (version, description, applied_at) VALUES (?, ?, ?)',
  );

  const applyAll = db.transaction(() => {
    for (const m of pending) {
      db.exec(m.up);
      insert.run(m.version, m.description, new Date().toISOString());
    }
  });

  applyAll();
}

import type Database from 'better-sqlite3';

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
    db.prepare('SELECT version FROM migrations').all().map((r) => (r as { version: number }).version),
  );

  const pending = migrations.filter((m) => !applied.has(m.version));
  if (pending.length === 0) return;

  const insert = db.prepare('INSERT INTO migrations (version, description, applied_at) VALUES (?, ?, ?)');

  const applyAll = db.transaction(() => {
    for (const m of pending) {
      db.exec(m.up);
      insert.run(m.version, m.description, new Date().toISOString());
    }
  });

  applyAll();
}

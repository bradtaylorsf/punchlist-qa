import { SqliteAdapter } from './sqlite-adapter.js';
import { PostgresAdapter } from './postgres-adapter.js';
import type { StorageAdapter } from './types.js';

export function createStorageAdapter(options: {
  type?: string;
  dbPath?: string;
  databaseUrl?: string;
  encryptionSecret?: string;
}): StorageAdapter {
  // If DATABASE_URL env var is present or databaseUrl provided, use Postgres
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (databaseUrl || options.type === 'postgres') {
    if (!databaseUrl) throw new Error('DATABASE_URL is required for postgres adapter');
    return new PostgresAdapter({
      connectionString: databaseUrl,
      encryptionSecret: options.encryptionSecret,
    });
  }
  return new SqliteAdapter({ dbPath: options.dbPath, encryptionSecret: options.encryptionSecret });
}

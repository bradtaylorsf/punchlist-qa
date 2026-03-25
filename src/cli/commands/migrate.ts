import { createStorageAdapter } from '../../adapters/storage/factory.js';

/**
 * Standalone migration command for CI/CD pipelines.
 * Runs database migrations and exits.
 *
 * Usage: node bin/punchlist.mjs migrate
 *
 * Requires DATABASE_URL environment variable for PostgreSQL.
 * For SQLite, runs migrations on the configured DB path.
 */
export async function migrateCommand(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('\n  DATABASE_URL is required for the migrate command.\n');
    process.exit(1);
  }

  console.log('  Running database migrations...');

  const storage = createStorageAdapter({
    type: 'postgres',
    databaseUrl,
    encryptionSecret: process.env.PUNCHLIST_AUTH_SECRET,
  });

  try {
    await storage.initialize();
    console.log('  ✅ Migrations completed successfully.');
  } finally {
    await storage.close();
  }
}

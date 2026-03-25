import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../shared/config.js';
import type { ResolvedConfig } from '../shared/config.js';
import { CONFIG_FILENAME } from '../shared/constants.js';
import { createStorageAdapter } from '../adapters/storage/factory.js';
import type { StorageAdapter } from '../adapters/storage/types.js';
import { TokenAuthAdapter } from '../adapters/auth/token.js';

export async function initAdapters(cwd?: string): Promise<{
  config: ResolvedConfig;
  storage: StorageAdapter;
  auth: TokenAuthAdapter;
}> {
  const dir = cwd ?? process.cwd();
  const configPath = join(dir, CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    console.error(`\n  No ${CONFIG_FILENAME} found. Run "punchlist-qa init" first.\n`);
    process.exit(1);
  }

  const config = loadConfig(dir);

  if (!config.secrets.authSecret) {
    console.error('\n  PUNCHLIST_AUTH_SECRET not set. Add it to .env or environment.\n');
    process.exit(1);
  }

  const dataDir = process.env.PUNCHLIST_DATA_DIR;
  const dbPath = dataDir ? join(dataDir, 'punchlist.db') : join(dir, config.storage.path);
  const storage = createStorageAdapter({
    type: config.storage.type,
    dbPath,
    encryptionSecret: config.secrets.authSecret,
  });
  await storage.initialize();

  const auth = new TokenAuthAdapter({
    secret: config.secrets.authSecret,
    storage,
  });

  return { config, storage, auth };
}

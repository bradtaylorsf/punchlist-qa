import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../../shared/config.js';
import { DEFAULT_PORT, CONFIG_FILENAME } from '../../shared/constants.js';

export async function serveCommand(): Promise<void> {
  const cwd = process.cwd();
  const configPath = join(cwd, CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    console.error(`\n  No ${CONFIG_FILENAME} found.`);
    console.error('  Run "punchlist-qa init" first.\n');
    process.exit(1);
  }

  const config = loadConfig(cwd);
  console.log(`\n  🚀 Punchlist QA Server`);
  console.log(`  Project: ${config.projectName}`);
  console.log(`  Port: ${DEFAULT_PORT}`);
  console.log(`\n  ⚠ Server implementation coming in Epic 3.`);
  console.log('  For now, this validates your config is correct.\n');
}

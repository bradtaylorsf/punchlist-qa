import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, writeConfig } from '../../shared/config.js';
import { CONFIG_FILENAME } from '../../shared/constants.js';

export async function revokeCommand(email: string): Promise<void> {
  const cwd = process.cwd();
  const configPath = join(cwd, CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    console.error(`\n  No ${CONFIG_FILENAME} found. Run "punchlist-qa init" first.\n`);
    process.exit(1);
  }

  const resolved = loadConfig(cwd);

  const tester = resolved.testers.find(t => t.email === email && !t.revokedAt);
  if (!tester) {
    console.error(`\n  No active tester found with email: ${email}\n`);
    process.exit(1);
  }

  tester.revokedAt = new Date().toISOString();
  const { secrets: _, ...config } = resolved;
  writeConfig(config, cwd);

  console.log(`\n  ✅ Revoked access for ${email}\n`);
}

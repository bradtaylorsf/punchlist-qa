import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../../shared/config.js';
import { CONFIG_FILENAME } from '../../shared/constants.js';

export async function usersCommand(): Promise<void> {
  const cwd = process.cwd();
  const configPath = join(cwd, CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    console.error(`\n  No ${CONFIG_FILENAME} found. Run "punchlist-qa init" first.\n`);
    process.exit(1);
  }

  const config = loadConfig(cwd);

  if (config.testers.length === 0) {
    console.log('\n  No testers yet. Run "punchlist-qa invite <email>" to add one.\n');
    return;
  }

  console.log('');
  const emailWidth = Math.max(6, ...config.testers.map(t => t.email.length));
  const header = `  ${'Email'.padEnd(emailWidth)}  ${'Status'.padEnd(8)}  Created`;
  console.log(header);
  console.log('  ' + '-'.repeat(header.length - 2));

  for (const tester of config.testers) {
    const status = tester.revokedAt ? 'revoked' : 'active';
    const created = new Date(tester.createdAt).toLocaleDateString();
    console.log(`  ${tester.email.padEnd(emailWidth)}  ${status.padEnd(8)}  ${created}`);
  }
  console.log('');
}

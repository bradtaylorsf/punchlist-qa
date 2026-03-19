import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../../shared/config.js';
import { copySkills } from './init.js';

export async function updateSkillsCommand(): Promise<void> {
  const cwd = process.cwd();

  let config;
  try {
    config = loadConfig(cwd);
  } catch {
    console.error('  No punchlist.config.json found. Run `punchlist-qa init` first.');
    process.exit(1);
  }

  const { aiTool } = config;

  if (aiTool === 'none') {
    console.log('  AI tool is set to "none" in config. No skills to update.');
    return;
  }

  console.log('\n  Updating AI skills...\n');

  const platforms: Array<'claude-code' | 'codex'> =
    aiTool === 'both' ? ['claude-code', 'codex'] : [aiTool as 'claude-code' | 'codex'];

  for (const platform of platforms) {
    copySkills(platform, cwd);
  }

  // Count total files copied
  let totalFiles = 0;
  for (const platform of platforms) {
    const targetDir =
      platform === 'claude-code'
        ? join(cwd, '.claude', 'skills')
        : join(cwd, '.codex', 'skills');
    try {
      totalFiles += readdirSync(targetDir).length;
    } catch {
      // Directory may not exist if no skills were found
    }
  }

  console.log(`\n  Done. ${totalFiles} skill file(s) updated.\n`);
}

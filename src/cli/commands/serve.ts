import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../../shared/config.js';
import { DEFAULT_PORT, CONFIG_FILENAME } from '../../shared/constants.js';
import { GitHubIssueAdapter } from '../../adapters/issues/index.js';
import { createApp } from '../../server/app.js';

export async function serveCommand(): Promise<void> {
  const cwd = process.cwd();
  const configPath = join(cwd, CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    console.error(`\n  No ${CONFIG_FILENAME} found.`);
    console.error('  Run "punchlist-qa init" first.\n');
    process.exit(1);
  }

  const config = loadConfig(cwd);

  if (!config.secrets.githubToken) {
    console.error('\n  Missing PUNCHLIST_GITHUB_TOKEN. Set it in .env or environment.\n');
    process.exit(1);
  }

  const issueAdapter = new GitHubIssueAdapter(
    config.issueTracker.repo,
    config.secrets.githubToken,
  );

  const app = createApp({
    issueAdapter,
    corsDomains: config.widget.corsDomains,
  });

  app.listen(DEFAULT_PORT, () => {
    console.log(`\n  Punchlist QA Server`);
    console.log(`  Project: ${config.projectName}`);
    console.log(`  Port: ${DEFAULT_PORT}`);
    console.log(`  CORS: ${config.widget.corsDomains.join(', ')}`);
    console.log(`\n  Widget: http://localhost:${DEFAULT_PORT}/widget.js`);
    console.log(`  API:    http://localhost:${DEFAULT_PORT}/api/support/ticket\n`);
  });
}

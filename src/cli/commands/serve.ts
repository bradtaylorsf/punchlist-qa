import { DEFAULT_PORT } from '../../shared/constants.js';
import { GitHubIssueAdapter } from '../../adapters/issues/index.js';
import { createApp } from '../../server/app.js';
import { initAdapters } from '../helpers.js';

export async function serveCommand(): Promise<void> {
  const { config, storage, auth } = await initAdapters();

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
    storageAdapter: storage,
    authAdapter: auth,
    config,
    corsDomains: config.widget.corsDomains,
  });

  app.listen(DEFAULT_PORT, () => {
    console.log(`\n  Punchlist QA Server`);
    console.log(`  Project: ${config.projectName}`);
    console.log(`  Port: ${DEFAULT_PORT}`);
    console.log(`  CORS: ${config.widget.corsDomains.join(', ')}`);
    console.log(`\n  Dashboard: http://localhost:${DEFAULT_PORT}/`);
    console.log(`  Widget:    http://localhost:${DEFAULT_PORT}/widget.js`);
    console.log(`  API:       http://localhost:${DEFAULT_PORT}/api/\n`);
  });
}

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

  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const host = process.env.HOST || '127.0.0.1';

  const server = app.listen(port, host, () => {
    console.log(`\n  Punchlist QA Server`);
    console.log(`  Project: ${config.projectName}`);
    console.log(`  Port: ${port}`);
    console.log(`  Host: ${host}`);
    console.log(`  CORS: ${config.widget.corsDomains.join(', ')}`);
    console.log(`\n  Dashboard: http://${host}:${port}/`);
    console.log(`  Widget:    http://${host}:${port}/widget.js`);
    console.log(`  API:       http://${host}:${port}/api/\n`);
  });

  function shutdown(signal: string) {
    console.log(`\n  Received ${signal}. Shutting down...`);
    server.close(async () => {
      await storage.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

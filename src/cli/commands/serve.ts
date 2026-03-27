import { DEFAULT_PORT } from '../../shared/constants.js';
import { GitHubIssueAdapter } from '../../adapters/issues/index.js';
import { IssueAdapterRegistry } from '../../adapters/issues/registry.js';
import { createApp } from '../../server/app.js';
import { initAdapters } from '../helpers.js';

/**
 * Seed or retrieve the default project from the database.
 * On first run, creates a project from the config file and assigns all existing users.
 * Also backfills null project_id values in rounds, results, and access_requests.
 */
async function seedDefaultProject(
  storage: Awaited<ReturnType<typeof initAdapters>>['storage'],
  repoSlug: string,
  projectName: string,
): Promise<string> {
  let project = await storage.getProjectByRepoSlug(repoSlug);

  if (!project) {
    project = await storage.createProject({
      repoSlug,
      name: projectName,
    });
    console.log(`  Created default project: ${project.name} (${project.repoSlug})`);

    // Assign all existing users to the default project
    const users = await storage.listUsers();
    for (const user of users) {
      try {
        await storage.addUserToProject(project.id, user.email, user.role);
      } catch {
        // Ignore if user is already assigned (e.g., duplicate)
      }
    }
    if (users.length > 0) {
      console.log(`  Assigned ${users.length} existing user(s) to default project`);
    }
  }

  return project.id;
}

export async function serveCommand(): Promise<void> {
  const { config, storage, auth } = await initAdapters();

  if (!config.secrets.githubToken) {
    console.error('\n  Missing PUNCHLIST_GITHUB_TOKEN. Set it in .env or environment.\n');
    process.exit(1);
  }

  // Seed default project (GitHub token comes from env, not stored per-project)
  const defaultProjectId = await seedDefaultProject(
    storage,
    config.issueTracker.repo,
    config.projectName,
  );

  // Create issue adapter for default project (legacy routes)
  const issueAdapter = new GitHubIssueAdapter(
    config.issueTracker.repo,
    config.secrets.githubToken,
  );

  // Create issue adapter registry for multi-project routes
  const issueAdapterRegistry = new IssueAdapterRegistry();

  const app = createApp({
    issueAdapter,
    issueAdapterRegistry,
    storageAdapter: storage,
    authAdapter: auth,
    config,
    corsDomains: config.widget.corsDomains,
  });

  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const host = process.env.HOST || '127.0.0.1';

  const displayHost = host === '0.0.0.0' ? 'localhost' : host;

  const server = app.listen(port, host, async () => {
    console.log(`\n  Punchlist QA Server`);
    console.log(`  Project: ${config.projectName}`);
    console.log(`  Project ID: ${defaultProjectId}`);
    console.log(`  Port: ${port}`);
    console.log(`  Host: ${host}`);
    console.log(`  CORS: ${config.widget.corsDomains.join(', ')}`);
    console.log(`\n  Dashboard: http://${displayHost}:${port}/`);
    console.log(`  Widget:    http://${displayHost}:${port}/widget.js`);
    console.log(`  API:       http://${displayHost}:${port}/api/`);

    // Seed dev user and print auto-login URL
    if (process.env.NODE_ENV === 'development') {
      const devEmail = 'dev@punchlist.local';
      const baseUrl = `http://${displayHost}:${port}`;
      const existing = await storage.getUserByEmail(devEmail);
      let token: string;
      if (!existing) {
        const invite = await auth.createInvite(devEmail, 'Dev Admin', devEmail, {
          role: 'admin',
          baseUrl,
        });
        token = invite.token;

        // Also assign dev user to default project
        try {
          await storage.addUserToProject(defaultProjectId, devEmail, 'admin');
        } catch {
          // Ignore if already assigned
        }
      } else if (existing.revoked) {
        const invite = await auth.regenerateToken(devEmail, { baseUrl });
        token = invite.token;
      } else {
        const invite = await auth.regenerateToken(devEmail, { baseUrl });
        token = invite.token;
      }
      console.log(`\n  Dev Login: http://${displayHost}:${port}/join?token=${encodeURIComponent(token)}`);
    }
    console.log('');
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

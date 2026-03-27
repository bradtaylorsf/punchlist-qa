import { DEFAULT_PORT } from '../../shared/constants.js';
import { GitHubIssueAdapter } from '../../adapters/issues/index.js';
import { IssueAdapterRegistry } from '../../adapters/issues/registry.js';
import { createStorageAdapter } from '../../adapters/storage/factory.js';
import { createApp } from '../../server/app.js';
import { initAdapters } from '../helpers.js';
import { generateToken, hashToken, buildInviteUrl } from '../../server/auth/invite.js';
import type { StorageAdapter } from '../../adapters/storage/types.js';

export interface ServeOptions {
  hosted?: boolean;
}

/**
 * Seed or retrieve the default project from the database.
 * On first run, creates a project from the config file and assigns all existing users.
 */
async function seedDefaultProject(
  storage: StorageAdapter,
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

    const users = await storage.listUsers();
    for (const user of users) {
      try {
        await storage.addUserToProject(project.id, user.email, user.role);
      } catch {
        // Ignore if user is already assigned
      }
    }
    if (users.length > 0) {
      console.log(`  Assigned ${users.length} existing user(s) to default project`);
    }
  }

  return project.id;
}

/**
 * Hosted serve mode — boots from environment variables only, no config file needed.
 * Used for cloud deployments (Render, ECS, etc.) where projects are managed via API.
 */
async function serveHosted(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('\n  DATABASE_URL is required for hosted mode.\n');
    process.exit(1);
  }

  const authSecret = process.env.PUNCHLIST_AUTH_SECRET;
  if (!authSecret) {
    console.error('\n  PUNCHLIST_AUTH_SECRET is required for hosted mode.\n');
    process.exit(1);
  }

  const githubToken = process.env.PUNCHLIST_GITHUB_TOKEN;
  if (!githubToken) {
    console.error('\n  PUNCHLIST_GITHUB_TOKEN is required for hosted mode.\n');
    process.exit(1);
  }

  const corsDomains = process.env.CORS_DOMAINS
    ? process.env.CORS_DOMAINS.split(',').map((d) => d.trim()).filter(Boolean)
    : ['*'];

  // Create storage adapter (always Postgres in hosted mode)
  const storage = createStorageAdapter({
    type: 'postgres',
    databaseUrl,
    encryptionSecret: authSecret,
  });
  await storage.initialize();

  // Create a placeholder issue adapter (projects use the global token)
  const issueAdapter = new GitHubIssueAdapter('placeholder/repo', githubToken);
  const issueAdapterRegistry = new IssueAdapterRegistry();

  const app = createApp({
    issueAdapter,
    issueAdapterRegistry,
    storageAdapter: storage,
    sessionSecret: authSecret,
    databaseUrl,
    config: undefined,
    corsDomains,
  });

  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const host = process.env.HOST || '0.0.0.0';
  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  const baseUrl = `http://${displayHost}:${port}`;

  const server = app.listen(port, host, async () => {
    console.log(`\n  Punchlist QA Server (hosted mode)`);
    console.log(`  Port: ${port}`);
    console.log(`  Host: ${host}`);
    console.log(`  Database: PostgreSQL`);
    console.log(`  CORS: ${corsDomains.join(', ')}`);
    console.log(`\n  Dashboard: ${baseUrl}/`);
    console.log(`  Widget:    ${baseUrl}/widget.js`);
    console.log(`  API:       ${baseUrl}/api/`);
    console.log(`  Health:    ${baseUrl}/health`);

    // Show setup URL in hosted mode if no users exist yet
    const userCount = await storage.countUsers();
    if (userCount === 0) {
      console.log(`\n  First-run: No users yet.`);
      console.log(`  Open the dashboard to complete setup: ${baseUrl}/`);
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

/**
 * Local serve mode — boots from punchlist.config.json + .env (original behavior).
 */
async function serveLocal(): Promise<void> {
  const { config, storage } = await initAdapters();

  if (!config.secrets.githubToken) {
    console.error('\n  Missing PUNCHLIST_GITHUB_TOKEN. Set it in .env or environment.\n');
    process.exit(1);
  }

  if (!config.secrets.authSecret) {
    console.error('\n  PUNCHLIST_AUTH_SECRET not set. Add it to .env or environment.\n');
    process.exit(1);
  }

  const sessionSecret = config.secrets.authSecret;

  // Seed default project (GitHub token comes from env, not stored per-project)
  const defaultProjectId = await seedDefaultProject(
    storage,
    config.issueTracker.repo,
    config.projectName,
  );

  const issueAdapter = new GitHubIssueAdapter(
    config.issueTracker.repo,
    config.secrets.githubToken,
  );
  const issueAdapterRegistry = new IssueAdapterRegistry();

  const app = createApp({
    issueAdapter,
    issueAdapterRegistry,
    storageAdapter: storage,
    sessionSecret,
    config,
    corsDomains: config.widget.corsDomains,
  });

  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const host = process.env.HOST || '127.0.0.1';
  const displayHost = host === '0.0.0.0' ? 'localhost' : host;
  const baseUrl = `http://${displayHost}:${port}`;

  const server = app.listen(port, host, async () => {
    console.log(`\n  Punchlist QA Server`);
    console.log(`  Project: ${config.projectName}`);
    console.log(`  Project ID: ${defaultProjectId}`);
    console.log(`  Port: ${port}`);
    console.log(`  Host: ${host}`);
    console.log(`  CORS: ${config.widget.corsDomains.join(', ')}`);
    console.log(`\n  Dashboard: ${baseUrl}/`);
    console.log(`  Widget:    ${baseUrl}/widget.js`);
    console.log(`  API:       ${baseUrl}/api/`);

    if (process.env.NODE_ENV === 'development') {
      const devEmail = 'dev@punchlist.local';
      const existing = await storage.getUserByEmail(devEmail);

      let token: string;
      if (!existing) {
        // Create dev admin user using invite utilities directly
        const newToken = generateToken(sessionSecret, devEmail);
        const tokenHash = hashToken(newToken);
        await storage.createUser({
          email: devEmail,
          name: 'Dev Admin',
          tokenHash,
          role: 'admin',
          invitedBy: devEmail,
        });
        token = newToken;
        try {
          await storage.addUserToProject(defaultProjectId, devEmail, 'admin');
        } catch {
          // Ignore if already assigned
        }
      } else {
        // Regenerate token for existing dev user
        const newToken = generateToken(sessionSecret, devEmail);
        const tokenHash = hashToken(newToken);
        await storage.updateUserTokenHash(devEmail, tokenHash);
        token = newToken;
      }

      console.log(`\n  Dev Login: ${buildInviteUrl(baseUrl, token)}`);
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

export async function serveCommand(options: ServeOptions = {}): Promise<void> {
  const isHosted = options.hosted || process.env.PUNCHLIST_HOSTED === 'true';

  if (isHosted) {
    await serveHosted();
  } else {
    await serveLocal();
  }
}

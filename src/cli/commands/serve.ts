import { randomBytes } from 'node:crypto';
import { DEFAULT_PORT } from '../../shared/constants.js';
import { GitHubIssueAdapter } from '../../adapters/issues/index.js';
import { IssueAdapterRegistry } from '../../adapters/issues/registry.js';
import { createStorageAdapter } from '../../adapters/storage/factory.js';
import { TokenAuthAdapter } from '../../adapters/auth/token.js';
import { createApp } from '../../server/app.js';
import { initAdapters } from '../helpers.js';
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

  // Create auth adapter
  const auth = new TokenAuthAdapter({ secret: authSecret, storage });

  // Create a placeholder issue adapter (projects use the global token)
  const issueAdapter = new GitHubIssueAdapter('placeholder/repo', githubToken);
  const issueAdapterRegistry = new IssueAdapterRegistry();

  const app = createApp({
    issueAdapter,
    issueAdapterRegistry,
    storageAdapter: storage,
    authAdapter: auth,
    config: undefined,
    corsDomains,
  });

  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const host = process.env.HOST || '0.0.0.0';
  const displayHost = host === '0.0.0.0' ? 'localhost' : host;

  const server = app.listen(port, host, async () => {
    console.log(`\n  Punchlist QA Server (hosted mode)`);
    console.log(`  Port: ${port}`);
    console.log(`  Host: ${host}`);
    console.log(`  Database: PostgreSQL`);
    console.log(`  CORS: ${corsDomains.join(', ')}`);
    console.log(`\n  Dashboard: http://${displayHost}:${port}/`);
    console.log(`  Widget:    http://${displayHost}:${port}/widget.js`);
    console.log(`  API:       http://${displayHost}:${port}/api/`);
    console.log(`  Health:    http://${displayHost}:${port}/health`);

    // Seed an admin user in hosted mode if none exists
    const users = await storage.listUsers();
    if (users.length === 0) {
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@punchlist.local';
      const token = randomBytes(32).toString('hex');
      const { createHash } = await import('node:crypto');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      await storage.createUser({
        email: adminEmail,
        name: 'Admin',
        tokenHash,
        role: 'admin',
        invitedBy: adminEmail,
      });
      console.log(`\n  First-run: created admin user (${adminEmail})`);
      console.log(`  Login:     http://${displayHost}:${port}/join?token=${encodeURIComponent(token)}`);
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

  const issueAdapter = new GitHubIssueAdapter(
    config.issueTracker.repo,
    config.secrets.githubToken,
  );
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

export async function serveCommand(options: ServeOptions = {}): Promise<void> {
  const isHosted = options.hosted || process.env.PUNCHLIST_HOSTED === 'true';

  if (isHosted) {
    await serveHosted();
  } else {
    await serveLocal();
  }
}

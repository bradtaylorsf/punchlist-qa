import express from 'express';
import passport from 'passport';
import type { Express } from 'express';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error-handler.js';
import { requireAuth } from './middleware/auth.js';
import { requireProjectContext, defaultProjectContext } from './middleware/project-context.js';
import { supportRouter } from './routes/support.js';
import { widgetServeRouter } from './routes/widget-serve.js';
import { authRouter } from './routes/auth.js';
import { roundsRouter } from './routes/rounds.js';
import { resultsRouter } from './routes/results.js';
import { configRouter } from './routes/config.js';
import { syncRouter } from './routes/sync.js';
import { issuesRouter } from './routes/issues-api.js';
import { commitRouter } from './routes/commit.js';
import { usersRouter } from './routes/users-api.js';
import { projectsRouter } from './routes/projects.js';
import {
  publicAccessRequestRouter,
  adminAccessRequestRouter,
} from './routes/access-requests.js';
import { dashboardRouter } from './routes/dashboard.js';
import { createSessionMiddleware } from './auth/session-config.js';
import { configurePassport } from './auth/passport-config.js';
import type { IssueAdapter } from '../adapters/issues/types.js';
import type { IssueAdapterRegistry } from '../adapters/issues/registry.js';
import type { StorageAdapter } from '../adapters/storage/types.js';
import type { PunchlistConfig } from '../shared/types.js';

export interface AppDependencies {
  /** Legacy single-project issue adapter (used by default project routes) */
  issueAdapter: IssueAdapter;
  /** Multi-project issue adapter registry (optional, for project-scoped routes) */
  issueAdapterRegistry?: IssueAdapterRegistry;
  storageAdapter?: StorageAdapter;
  sessionSecret?: string;
  databaseUrl?: string;
  config?: PunchlistConfig;
  corsDomains: string[];
  /** GitHub token for fetching config from repos (used by sync route) */
  githubToken?: string;
}

/**
 * Factory: creates a configured Express app without calling `.listen()`.
 * Accepts injected dependencies for testability.
 */
export function createApp(deps: AppDependencies): Express {
  const app = express();
  if (!deps.sessionSecret) {
    throw new Error('sessionSecret is required. Set PUNCHLIST_AUTH_SECRET in .env or environment.');
  }
  const sessionSecret = deps.sessionSecret;

  // Trust reverse proxy (Render, ECS ALB, etc.) so secure cookies work behind TLS termination
  app.set('trust proxy', 1);

  // Health check — no auth, no CORS, no body parsing
  app.get('/health', async (_req, res) => {
    try {
      if (deps.storageAdapter) {
        await deps.storageAdapter.getConfig('_health');
      }
      res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'unhealthy', database: 'disconnected', timestamp: new Date().toISOString() });
    }
  });

  // Parse JSON bodies (explicit limit to document intent)
  app.use(express.json({ limit: '100kb' }));

  // Session middleware — must come before passport
  app.use(
    createSessionMiddleware({
      secret: sessionSecret,
      databaseUrl: deps.databaseUrl,
    }),
  );

  // Passport session-based auth
  if (deps.storageAdapter) {
    configurePassport(deps.storageAdapter);
  }
  app.use(passport.initialize());
  app.use(passport.session());

  // CORS middleware on API routes only
  app.use('/api/support', corsMiddleware(deps.corsDomains));

  // Public routes (no auth required)
  app.use('/api/support', supportRouter(deps.issueAdapter));

  if (deps.storageAdapter) {
    app.use('/api/auth', authRouter(deps.storageAdapter, sessionSecret));
    app.use('/api/access-requests', publicAccessRequestRouter(deps.storageAdapter));
  }

  // Protected routes (require valid session)
  if (deps.storageAdapter) {
    const storage = deps.storageAdapter;
    const defaultProject = defaultProjectContext(storage);

    // --- Project CRUD routes ---
    app.use('/api/projects', requireAuth, projectsRouter(storage));

    // --- Project-scoped data routes ---
    const projectScope = requireProjectContext(storage);
    app.use('/api/projects/:projectId/rounds', requireAuth, projectScope, roundsRouter(storage));
    app.use('/api/projects/:projectId/rounds', requireAuth, projectScope, resultsRouter(storage));
    app.use('/api/projects/:projectId/issues', requireAuth, projectScope, issuesRouter(deps.issueAdapter));
    app.use(
      '/api/projects/:projectId/access-requests',
      requireAuth,
      projectScope,
      adminAccessRequestRouter(storage, sessionSecret),
    );
    app.use(
      '/api/projects/:projectId/config',
      requireAuth,
      projectScope,
      configRouter({ config: deps.config, storageAdapter: storage }),
    );
    if (deps.githubToken) {
      app.use(
        '/api/projects/:projectId/sync',
        requireAuth,
        projectScope,
        syncRouter(storage, deps.githubToken),
      );
    }

    // --- Legacy unscoped routes (backward compat via default project) ---
    app.use('/api/rounds', requireAuth, defaultProject, roundsRouter(storage));
    app.use('/api/rounds', requireAuth, defaultProject, resultsRouter(storage));
    app.use('/api/config', requireAuth, defaultProject, configRouter({ config: deps.config, storageAdapter: storage }));
    app.use('/api/issues', requireAuth, defaultProject, issuesRouter(deps.issueAdapter));
    app.use('/api/commit', requireAuth, commitRouter());
    app.use('/api/users', requireAuth, usersRouter(storage, sessionSecret));
    app.use(
      '/api/access-requests',
      requireAuth,
      defaultProject,
      adminAccessRequestRouter(storage, sessionSecret),
    );
  }

  // Static file serving
  app.use('/', widgetServeRouter());
  app.use('/', dashboardRouter());

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

import express from 'express';
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
import { issuesRouter } from './routes/issues-api.js';
import { commitRouter } from './routes/commit.js';
import { usersRouter } from './routes/users-api.js';
import { projectsRouter } from './routes/projects.js';
import {
  publicAccessRequestRouter,
  adminAccessRequestRouter,
} from './routes/access-requests.js';
import { dashboardRouter } from './routes/dashboard.js';
import type { IssueAdapter } from '../adapters/issues/types.js';
import type { IssueAdapterRegistry } from '../adapters/issues/registry.js';
import type { StorageAdapter } from '../adapters/storage/types.js';
import type { AuthAdapter } from '../adapters/auth/types.js';
import type { PunchlistConfig } from '../shared/types.js';

export interface AppDependencies {
  /** Legacy single-project issue adapter (used by default project routes) */
  issueAdapter: IssueAdapter;
  /** Multi-project issue adapter registry (optional, for project-scoped routes) */
  issueAdapterRegistry?: IssueAdapterRegistry;
  storageAdapter?: StorageAdapter;
  authAdapter?: AuthAdapter;
  config?: PunchlistConfig;
  corsDomains: string[];
}

/**
 * Factory: creates a configured Express app without calling `.listen()`.
 * Accepts injected dependencies for testability.
 */
export function createApp(deps: AppDependencies): Express {
  const app = express();

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

  // CORS middleware on API routes only
  app.use('/api/support', corsMiddleware(deps.corsDomains));

  // Public routes (no auth required)
  app.use('/api/support', supportRouter(deps.issueAdapter));
  app.use('/api/auth', authRouter(deps.authAdapter ?? createNoopAuthAdapter()));
  if (deps.storageAdapter) {
    app.use('/api/access-requests', publicAccessRequestRouter(deps.storageAdapter));
  }

  // Protected routes (require valid session)
  if (deps.storageAdapter && deps.authAdapter && deps.config) {
    const auth = requireAuth(deps.authAdapter);
    const storage = deps.storageAdapter;
    const defaultProject = defaultProjectContext(storage);

    // --- Project CRUD routes ---
    app.use('/api/projects', auth, projectsRouter(storage));

    // --- Project-scoped data routes ---
    const projectScope = requireProjectContext(storage);
    app.use('/api/projects/:projectId/rounds', auth, projectScope, roundsRouter(storage));
    app.use('/api/projects/:projectId/rounds', auth, projectScope, resultsRouter(storage));
    app.use('/api/projects/:projectId/issues', auth, projectScope, issuesRouter(deps.issueAdapter));
    app.use('/api/projects/:projectId/access-requests', auth, projectScope, adminAccessRequestRouter(storage, deps.authAdapter));

    // --- Legacy unscoped routes (backward compat via default project) ---
    app.use('/api/rounds', auth, defaultProject, roundsRouter(storage));
    app.use('/api/rounds', auth, defaultProject, resultsRouter(storage));
    app.use('/api/config', auth, configRouter(deps.config));
    app.use('/api/issues', auth, defaultProject, issuesRouter(deps.issueAdapter));
    app.use('/api/commit', auth, commitRouter());
    app.use('/api/users', auth, usersRouter(deps.authAdapter));
    app.use('/api/access-requests', auth, defaultProject, adminAccessRequestRouter(storage, deps.authAdapter));
  }

  // Static file serving
  app.use('/', widgetServeRouter());
  app.use('/', dashboardRouter());

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

function createNoopAuthAdapter(): AuthAdapter {
  const fail = (msg: string) => {
    throw new Error(msg);
  };
  const asyncFail = (msg: string) => Promise.reject(new Error(msg));
  return {
    generateToken: () => fail('Auth not configured'),
    validateToken: () => fail('Auth not configured'),
    createInvite: () => asyncFail('Auth not configured'),
    revokeAccess: () => asyncFail('Auth not configured'),
    regenerateToken: () => asyncFail('Auth not configured'),
    listUsers: () => asyncFail('Auth not configured'),
    loginWithToken: () => asyncFail('Auth not configured'),
    createSession: () => asyncFail('Auth not configured'),
    validateSession: () => asyncFail('Auth not configured'),
    destroySession: () => asyncFail('Auth not configured'),
  };
}

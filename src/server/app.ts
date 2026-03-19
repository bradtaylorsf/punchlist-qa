import express from 'express';
import type { Express } from 'express';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error-handler.js';
import { requireAuth } from './middleware/auth.js';
import { supportRouter } from './routes/support.js';
import { widgetServeRouter } from './routes/widget-serve.js';
import { authRouter } from './routes/auth.js';
import { roundsRouter } from './routes/rounds.js';
import { resultsRouter } from './routes/results.js';
import { configRouter } from './routes/config.js';
import { issuesRouter } from './routes/issues-api.js';
import { commitRouter } from './routes/commit.js';
import { usersRouter } from './routes/users-api.js';
import { dashboardRouter } from './routes/dashboard.js';
import type { IssueAdapter } from '../adapters/issues/types.js';
import type { StorageAdapter } from '../adapters/storage/types.js';
import type { AuthAdapter } from '../adapters/auth/types.js';
import type { PunchlistConfig } from '../shared/types.js';

export interface AppDependencies {
  issueAdapter: IssueAdapter;
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
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Parse JSON bodies (explicit limit to document intent)
  app.use(express.json({ limit: '100kb' }));

  // CORS middleware on API routes only
  app.use('/api/support', corsMiddleware(deps.corsDomains));

  // Public routes (no auth required)
  app.use('/api/support', supportRouter(deps.issueAdapter));
  app.use('/api/auth', authRouter(deps.authAdapter ?? createNoopAuthAdapter()));

  // Protected routes (require valid session)
  if (deps.storageAdapter && deps.authAdapter && deps.config) {
    const auth = requireAuth(deps.authAdapter);

    app.use('/api/rounds', auth, roundsRouter(deps.storageAdapter));
    app.use('/api/rounds', auth, resultsRouter(deps.storageAdapter));
    app.use('/api/config', auth, configRouter(deps.config));
    app.use('/api/issues', auth, issuesRouter(deps.issueAdapter));
    app.use('/api/commit', auth, commitRouter());
    app.use('/api/users', auth, usersRouter(deps.authAdapter));
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

import express from 'express';
import type { Express } from 'express';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error-handler.js';
import { supportRouter } from './routes/support.js';
import { widgetServeRouter } from './routes/widget-serve.js';
import type { IssueAdapter } from '../adapters/issues/types.js';

export interface AppDependencies {
  issueAdapter: IssueAdapter;
  corsDomains: string[];
}

/**
 * Factory: creates a configured Express app without calling `.listen()`.
 * Accepts injected dependencies for testability.
 */
export function createApp(deps: AppDependencies): Express {
  const app = express();

  // Parse JSON bodies (explicit limit to document intent)
  app.use(express.json({ limit: '100kb' }));

  // CORS middleware on API routes only
  app.use('/api/support', corsMiddleware(deps.corsDomains));

  // Routes
  app.use('/api/support', supportRouter(deps.issueAdapter));
  app.use('/', widgetServeRouter());

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

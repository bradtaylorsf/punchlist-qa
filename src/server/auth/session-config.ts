import { createRequire } from 'node:module';
import session from 'express-session';
import type { RequestHandler } from 'express';

const require = createRequire(import.meta.url);

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionConfigOptions {
  secret: string;
  databaseUrl?: string;
}

/**
 * Create and return the express-session middleware.
 * If databaseUrl is provided, uses connect-pg-simple for Postgres-backed sessions.
 * Otherwise falls back to memorystore with a 24-hour prune cycle.
 */
export function createSessionMiddleware(options: SessionConfigOptions): RequestHandler {
  const { secret, databaseUrl } = options;
  const isProduction = process.env.NODE_ENV === 'production';

  const cookieOptions: session.CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: SEVEN_DAYS_MS,
  };

  if (databaseUrl) {
    const PgSessionStore = require('connect-pg-simple')(session) as new (opts: object) => session.Store;
    const store = new PgSessionStore({
      conString: databaseUrl,
      createTableIfMissing: true,
      // Prune expired sessions every hour
      pruneSessionInterval: 60 * 60,
    });

    return session({
      store,
      secret,
      resave: false,
      saveUninitialized: false,
      cookie: cookieOptions,
    });
  }

  // Memory store for SQLite / local mode
  const MemoryStore = require('memorystore')(session) as new (opts: object) => session.Store;
  const store = new MemoryStore({
    checkPeriod: 24 * 60 * 60 * 1000, // prune expired entries every 24h
  });

  return session({
    store,
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: cookieOptions,
  });
}

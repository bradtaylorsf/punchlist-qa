/**
 * Tests for the requireAuth middleware.
 * The middleware now relies on Passport.js session authentication.
 * We simulate Passport's behavior by attaching req.isAuthenticated directly.
 */
import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../../src/server/middleware/auth.js';

function makeRequest(
  server: http.Server,
  method: string,
  path: string,
  headers?: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: headers ?? {},
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode!, body: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode!, body: { raw: body } });
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * Inject Passport-like session state so requireAuth can check req.isAuthenticated().
 */
function injectPassportState(authenticated: boolean, user?: object) {
  return (req: Request, _res: Response, next: NextFunction) => {
    // Passport adds req.isAuthenticated as a method — simulate it
    (req as Request & { isAuthenticated: () => boolean }).isAuthenticated = () => authenticated;
    if (authenticated && user) {
      req.user = user as Express.User;
    }
    next();
  };
}

describe('requireAuth middleware', () => {
  let server: http.Server;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('returns 401 when not authenticated', async () => {
    const app = express();
    app.use(injectPassportState(false));
    app.use(requireAuth);
    app.get('/test', (_req, res) => res.json({ ok: true }));
    server = app.listen(0);

    const res = await makeRequest(server, 'GET', '/test');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
    expect(res.body.success).toBe(false);
  });

  it('passes through when authenticated and sets req.user', async () => {
    const mockUser = {
      id: 'u1',
      email: 'tester@example.com',
      name: 'Tester',
      tokenHash: 'hash',
      role: 'tester' as const,
      invitedBy: 'admin@example.com',
      revoked: false,
      createdAt: new Date().toISOString(),
    };

    const app = express();
    app.use(injectPassportState(true, mockUser));
    app.use(requireAuth);
    app.get('/test', (req, res) => {
      res.json({ ok: true, user: req.user });
    });
    server = app.listen(0);

    const res = await makeRequest(server, 'GET', '/test');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect((res.body.user as Record<string, unknown>).email).toBe('tester@example.com');
  });

  it('returns 401 when isAuthenticated returns false (no user)', async () => {
    const app = express();
    app.use(injectPassportState(false));
    app.use(requireAuth);
    app.get('/test', (_req, res) => res.json({ ok: true }));
    server = app.listen(0);

    const res = await makeRequest(server, 'GET', '/test');
    expect(res.status).toBe(401);
  });
});

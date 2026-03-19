import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../../../src/server/middleware/require-admin.js';

function makeRequest(
  server: http.Server,
  method: string,
  path: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method },
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

describe('requireAdmin middleware', () => {
  let server: http.Server;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('passes for admin role', async () => {
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = {
        id: 'u1', email: 'admin@example.com', name: 'Admin',
        tokenHash: 'h', role: 'admin', invitedBy: 'root@example.com',
        revoked: false, createdAt: '2024-01-01T00:00:00Z',
      };
      next();
    });
    app.use(requireAdmin);
    app.get('/test', (_req, res) => res.json({ ok: true }));
    server = app.listen(0);

    const res = await makeRequest(server, 'GET', '/test');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 403 for tester role', async () => {
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = {
        id: 'u2', email: 'tester@example.com', name: 'Tester',
        tokenHash: 'h', role: 'tester', invitedBy: 'admin@example.com',
        revoked: false, createdAt: '2024-01-01T00:00:00Z',
      };
      next();
    });
    app.use(requireAdmin);
    app.get('/test', (_req, res) => res.json({ ok: true }));
    server = app.listen(0);

    const res = await makeRequest(server, 'GET', '/test');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Admin access required');
  });

  it('returns 403 when no user on request', async () => {
    const app = express();
    app.use(requireAdmin);
    app.get('/test', (_req, res) => res.json({ ok: true }));
    server = app.listen(0);

    const res = await makeRequest(server, 'GET', '/test');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Admin access required');
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { Request, Response, NextFunction } from 'express';
import { usersRouter } from '../../../src/server/routes/users-api.js';

const mockUser = {
  id: 'u1',
  email: 'tester@example.com',
  name: 'Tester',
  tokenHash: 'secret-hash-should-not-leak',
  role: 'tester' as const,
  invitedBy: 'admin@example.com',
  revoked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
};

function injectUser(req: Request, _res: Response, next: NextFunction) {
  req.user = mockUser;
  next();
}

function makeRequest(
  server: http.Server,
  path: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'GET' },
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

describe('users routes', () => {
  let server: http.Server;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('GET /api/users/me returns user info without tokenHash', async () => {
    const app = express();
    app.use(injectUser);
    app.use('/api/users', usersRouter());
    server = app.listen(0);

    const res = await makeRequest(server, '/api/users/me');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Record<string, unknown>;
    expect(data.email).toBe('tester@example.com');
    expect(data.name).toBe('Tester');
    expect(data.role).toBe('tester');
    expect(data.id).toBe('u1');
    // Security: tokenHash must NOT be exposed
    expect(data.tokenHash).toBeUndefined();
    expect(data.invitedBy).toBeUndefined();
    expect(data.revoked).toBeUndefined();
  });
});

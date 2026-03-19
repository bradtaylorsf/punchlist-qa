import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { Request, Response, NextFunction } from 'express';
import type { AuthAdapter } from '../../../src/adapters/auth/types.js';
import { usersRouter } from '../../../src/server/routes/users-api.js';
import { errorHandler } from '../../../src/server/middleware/error-handler.js';

const mockAdmin = {
  id: 'u1',
  email: 'admin@example.com',
  name: 'Admin',
  tokenHash: 'secret-hash',
  role: 'admin' as const,
  invitedBy: 'root@example.com',
  revoked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockTester = {
  id: 'u2',
  email: 'tester@example.com',
  name: 'Tester',
  tokenHash: 'secret-hash-should-not-leak',
  role: 'tester' as const,
  invitedBy: 'admin@example.com',
  revoked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
};

function createMockAuthAdapter(overrides: Partial<AuthAdapter> = {}): AuthAdapter {
  return {
    generateToken: vi.fn(),
    validateToken: vi.fn(),
    createInvite: vi.fn(),
    revokeAccess: vi.fn(),
    listUsers: vi.fn().mockResolvedValue([mockAdmin, mockTester]),
    loginWithToken: vi.fn(),
    createSession: vi.fn(),
    validateSession: vi.fn(),
    destroySession: vi.fn(),
    ...overrides,
  } as AuthAdapter;
}

function injectUser(user: typeof mockAdmin) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.user = user;
    next();
  };
}

function makeRequest(
  server: http.Server,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: data
          ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(data)) }
          : {},
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode!, body: JSON.parse(resBody) });
          } catch {
            resolve({ status: res.statusCode!, body: { raw: resBody } });
          }
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
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

  function createServer(user: typeof mockAdmin, authAdapter?: AuthAdapter) {
    const app = express();
    app.use(express.json());
    app.use(injectUser(user));
    app.use('/api/users', usersRouter(authAdapter));
    app.use(errorHandler);
    server = app.listen(0);
    return server;
  }

  it('GET /api/users/me returns user info without tokenHash', async () => {
    createServer(mockTester);

    const res = await makeRequest(server, 'GET', '/api/users/me');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Record<string, unknown>;
    expect(data.email).toBe('tester@example.com');
    expect(data.name).toBe('Tester');
    expect(data.role).toBe('tester');
    expect(data.id).toBe('u2');
    expect(data.tokenHash).toBeUndefined();
    expect(data.invitedBy).toBeUndefined();
    expect(data.revoked).toBeUndefined();
  });

  it('GET /api/users returns user list for admin, strips tokenHash', async () => {
    const auth = createMockAuthAdapter();
    createServer(mockAdmin, auth);

    const res = await makeRequest(server, 'GET', '/api/users');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(2);
    for (const u of data) {
      expect(u.tokenHash).toBeUndefined();
    }
  });

  it('GET /api/users returns 403 for tester role', async () => {
    const auth = createMockAuthAdapter();
    createServer(mockTester, auth);

    const res = await makeRequest(server, 'GET', '/api/users');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Admin access required');
  });

  it('POST /api/users/invite creates invite for admin', async () => {
    const auth = createMockAuthAdapter({
      createInvite: vi.fn().mockResolvedValue({
        user: { ...mockTester, email: 'new@example.com' },
        token: 'tok123',
        inviteUrl: 'http://localhost:4747?token=tok123',
      }),
    });
    createServer(mockAdmin, auth);

    const res = await makeRequest(server, 'POST', '/api/users/invite', {
      email: 'new@example.com',
      name: 'New User',
      role: 'tester',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Record<string, unknown>;
    expect(data.inviteUrl).toBe('http://localhost:4747?token=tok123');
    expect((data.user as Record<string, unknown>).tokenHash).toBeUndefined();
  });

  it('POST /api/users/invite returns 400 for invalid body', async () => {
    const auth = createMockAuthAdapter();
    createServer(mockAdmin, auth);

    const res = await makeRequest(server, 'POST', '/api/users/invite', {
      email: 'not-an-email',
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/users/invite returns 403 for tester', async () => {
    const auth = createMockAuthAdapter();
    createServer(mockTester, auth);

    const res = await makeRequest(server, 'POST', '/api/users/invite', {
      email: 'new@example.com',
      name: 'New User',
    });
    expect(res.status).toBe(403);
  });

  it('POST /api/users/revoke revokes user for admin', async () => {
    const auth = createMockAuthAdapter({
      revokeAccess: vi.fn().mockResolvedValue(undefined),
    });
    createServer(mockAdmin, auth);

    const res = await makeRequest(server, 'POST', '/api/users/revoke', {
      email: 'tester@example.com',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(auth.revokeAccess).toHaveBeenCalledWith('tester@example.com');
  });

  it('POST /api/users/revoke returns 403 for tester', async () => {
    const auth = createMockAuthAdapter();
    createServer(mockTester, auth);

    const res = await makeRequest(server, 'POST', '/api/users/revoke', {
      email: 'admin@example.com',
    });
    expect(res.status).toBe(403);
  });

  it('GET /api/users/me still works for tester (regression)', async () => {
    const auth = createMockAuthAdapter();
    createServer(mockTester, auth);

    const res = await makeRequest(server, 'GET', '/api/users/me');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect((res.body.data as Record<string, unknown>).role).toBe('tester');
  });
});

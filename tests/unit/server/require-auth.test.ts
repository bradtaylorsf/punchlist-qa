import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AuthAdapter } from '../../../src/adapters/auth/types.js';
import { requireAuth } from '../../../src/server/middleware/auth.js';

function createMockAuthAdapter(overrides: Partial<AuthAdapter> = {}): AuthAdapter {
  return {
    generateToken: vi.fn(),
    validateToken: vi.fn(),
    createInvite: vi.fn(),
    revokeAccess: vi.fn(),
    listUsers: vi.fn(),
    loginWithToken: vi.fn(),
    createSession: vi.fn(),
    validateSession: vi.fn().mockResolvedValue(null),
    destroySession: vi.fn(),
    ...overrides,
  } as AuthAdapter;
}

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

describe('requireAuth middleware', () => {
  let server: http.Server;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('returns 401 when no cookie is present', async () => {
    const auth = createMockAuthAdapter();
    const app = express();
    app.use(requireAuth(auth));
    app.get('/test', (_req, res) => res.json({ ok: true }));
    server = app.listen(0);

    const res = await makeRequest(server, 'GET', '/test');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('returns 401 when session is invalid', async () => {
    const auth = createMockAuthAdapter({
      validateSession: vi.fn().mockResolvedValue(null),
    });
    const app = express();
    app.use(requireAuth(auth));
    app.get('/test', (_req, res) => res.json({ ok: true }));
    server = app.listen(0);

    const res = await makeRequest(server, 'GET', '/test', {
      Cookie: 'punchlist_session=invalid-session-id',
    });
    expect(res.status).toBe(401);
  });

  it('passes through and sets req.user with valid session', async () => {
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

    const auth = createMockAuthAdapter({
      validateSession: vi.fn().mockResolvedValue(mockUser),
    });

    const app = express();
    app.use(requireAuth(auth));
    app.get('/test', (req, res) => {
      res.json({ ok: true, user: req.user });
    });
    server = app.listen(0);

    const res = await makeRequest(server, 'GET', '/test', {
      Cookie: 'punchlist_session=valid-session-id',
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect((res.body.user as Record<string, unknown>).email).toBe('tester@example.com');
  });

  it('returns 401 when validateSession throws', async () => {
    const auth = createMockAuthAdapter({
      validateSession: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    const app = express();
    app.use(requireAuth(auth));
    app.get('/test', (_req, res) => res.json({ ok: true }));
    server = app.listen(0);

    const res = await makeRequest(server, 'GET', '/test', {
      Cookie: 'punchlist_session=some-id',
    });
    expect(res.status).toBe(401);
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AuthAdapter } from '../../../src/adapters/auth/types.js';
import { authRouter } from '../../../src/server/routes/auth.js';
import { errorHandler } from '../../../src/server/middleware/error-handler.js';
import { RevokedUserError } from '../../../src/adapters/auth/errors.js';

function createMockAuthAdapter(overrides: Partial<AuthAdapter> = {}): AuthAdapter {
  return {
    generateToken: vi.fn(),
    validateToken: vi.fn(),
    createInvite: vi.fn(),
    revokeAccess: vi.fn(),
    listUsers: vi.fn(),
    loginWithToken: vi.fn().mockResolvedValue('session-123'),
    createSession: vi.fn(),
    validateSession: vi.fn(),
    destroySession: vi.fn(),
    ...overrides,
  } as AuthAdapter;
}

function makeRequest(
  server: http.Server,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Record<string, unknown> }> {
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
        headers: {
          ...(data
            ? {
                'Content-Type': 'application/json',
                'Content-Length': String(Buffer.byteLength(data)),
              }
            : {}),
          ...headers,
        },
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode!,
              headers: res.headers,
              body: JSON.parse(resBody),
            });
          } catch {
            resolve({
              status: res.statusCode!,
              headers: res.headers,
              body: { raw: resBody },
            });
          }
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

describe('auth routes', () => {
  let server: http.Server;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  function createServer(adapter: AuthAdapter) {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter(adapter));
    app.use(errorHandler);
    server = app.listen(0);
    return server;
  }

  describe('POST /api/auth/login', () => {
    it('returns 200 with Set-Cookie on valid token', async () => {
      const adapter = createMockAuthAdapter();
      createServer(adapter);

      const res = await makeRequest(server, 'POST', '/api/auth/login', {
        token: 'valid-token',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const setCookie = res.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expect(String(setCookie)).toContain('punchlist_session=session-123');
    });

    it('returns 400 for missing token', async () => {
      const adapter = createMockAuthAdapter();
      createServer(adapter);

      const res = await makeRequest(server, 'POST', '/api/auth/login', {});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('returns 401 for invalid token', async () => {
      const adapter = createMockAuthAdapter({
        loginWithToken: vi.fn().mockRejectedValue(new Error('Invalid token')),
      });
      createServer(adapter);

      const res = await makeRequest(server, 'POST', '/api/auth/login', {
        token: 'bad-token',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Invalid token');
    });

    it('returns 403 for revoked user', async () => {
      const adapter = createMockAuthAdapter({
        loginWithToken: vi
          .fn()
          .mockRejectedValue(new RevokedUserError('revoked@example.com')),
      });
      createServer(adapter);

      const res = await makeRequest(server, 'POST', '/api/auth/login', {
        token: 'revoked-token',
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears session cookie', async () => {
      const adapter = createMockAuthAdapter();
      createServer(adapter);

      const res = await makeRequest(server, 'POST', '/api/auth/logout', undefined, {
        Cookie: 'punchlist_session=session-123',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const setCookie = String(res.headers['set-cookie']);
      expect(setCookie).toContain('Max-Age=0');
      expect(adapter.destroySession).toHaveBeenCalledWith('session-123');
    });

    it('returns 200 even without cookie', async () => {
      const adapter = createMockAuthAdapter();
      createServer(adapter);

      const res = await makeRequest(server, 'POST', '/api/auth/logout');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});

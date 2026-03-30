/**
 * Tests for the new Passport-based auth routes.
 * The authRouter now accepts StorageAdapter + sessionSecret.
 * These tests use a mock storage adapter and simulate Passport session state.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import passport from 'passport';
import session from 'express-session';
import http from 'node:http';
import type { StorageAdapter } from '../../../src/adapters/storage/types.js';
import { authRouter } from '../../../src/server/routes/auth.js';
import { errorHandler } from '../../../src/server/middleware/error-handler.js';
import { configurePassport } from '../../../src/server/auth/passport-config.js';
import { generateToken, hashToken } from '../../../src/server/auth/invite.js';

const SESSION_SECRET = 'test-secret-at-least-16-characters-long';

const mockUser = {
  id: 'u1',
  email: 'admin@example.com',
  name: 'Admin',
  tokenHash: 'hash-123',
  role: 'admin' as const,
  invitedBy: 'self-setup',
  revoked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
};

function createMockStorage(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    initialize: vi.fn(),
    close: vi.fn(),
    createRound: vi.fn(),
    listRounds: vi.fn(),
    getRound: vi.fn(),
    updateRound: vi.fn(),
    submitResult: vi.fn(),
    listResults: vi.fn(),
    deleteResult: vi.fn(),
    deleteResultsByTestIds: vi.fn(),
    updateResultIssue: vi.fn(),
    createUser: vi.fn().mockResolvedValue(mockUser),
    listUsers: vi.fn().mockResolvedValue([mockUser]),
    getUserByEmail: vi.fn().mockResolvedValue(mockUser),
    getUserByTokenHash: vi.fn().mockResolvedValue(mockUser),
    revokeUser: vi.fn(),
    updateUserTokenHash: vi.fn().mockResolvedValue(undefined),
    updateUserPasswordHash: vi.fn().mockResolvedValue(undefined),
    getUserPasswordHash: vi.fn().mockResolvedValue('$2a$12$hashed-password'),
    countUsers: vi.fn().mockResolvedValue(1),
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    createAccessRequest: vi.fn(),
    listAccessRequests: vi.fn(),
    getAccessRequest: vi.fn(),
    getAccessRequestByEmail: vi.fn(),
    updateAccessRequestStatus: vi.fn(),
    createProject: vi.fn(),
    getProject: vi.fn(),
    getProjectByRepoSlug: vi.fn(),
    getProjectByName: vi.fn(),
    listProjects: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    addUserToProject: vi.fn(),
    removeUserFromProject: vi.fn(),
    listProjectUsers: vi.fn(),
    listUserProjects: vi.fn(),
    ...overrides,
  } as unknown as StorageAdapter;
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
            resolve({ status: res.statusCode!, headers: res.headers, body: JSON.parse(resBody) });
          } catch {
            resolve({ status: res.statusCode!, headers: res.headers, body: { raw: resBody } });
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

  function createServer(storage: StorageAdapter) {
    configurePassport(storage);

    const app = express();
    app.use(express.json());
    app.use(
      session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, sameSite: 'lax' },
      }),
    );
    app.use(passport.initialize());
    app.use(passport.session());
    app.use('/api/auth', authRouter(storage, SESSION_SECRET));
    app.use(errorHandler);
    server = app.listen(0);
    return server;
  }

  describe('GET /api/auth/status', () => {
    it('returns setupRequired: true when no users exist', async () => {
      const storage = createMockStorage({ countUsers: vi.fn().mockResolvedValue(0) });
      createServer(storage);

      const res = await makeRequest(server, 'GET', '/api/auth/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data as Record<string, unknown>;
      expect(data.setupRequired).toBe(true);
      expect(data.user).toBeNull();
    });

    it('returns setupRequired: false when users exist', async () => {
      const storage = createMockStorage({ countUsers: vi.fn().mockResolvedValue(1) });
      createServer(storage);

      const res = await makeRequest(server, 'GET', '/api/auth/status');
      expect(res.status).toBe(200);
      const data = res.body.data as Record<string, unknown>;
      expect(data.setupRequired).toBe(false);
      expect(data.user).toBeNull();
    });
  });

  describe('POST /api/auth/setup', () => {
    it('returns 409 when users already exist', async () => {
      const storage = createMockStorage({ countUsers: vi.fn().mockResolvedValue(1) });
      createServer(storage);

      const res = await makeRequest(server, 'POST', '/api/auth/setup', {
        email: 'admin@example.com',
        name: 'Admin',
        password: 'secure-password-123',
      });
      expect(res.status).toBe(409);
    });

    it('returns 400 for short password', async () => {
      const storage = createMockStorage({ countUsers: vi.fn().mockResolvedValue(0) });
      createServer(storage);

      const res = await makeRequest(server, 'POST', '/api/auth/setup', {
        email: 'admin@example.com',
        name: 'Admin',
        password: 'short',
      });
      expect(res.status).toBe(400);
    });

    it('creates admin user with password and logs in when no users exist', async () => {
      const storage = createMockStorage({
        countUsers: vi.fn().mockResolvedValue(0),
        createUser: vi.fn().mockResolvedValue({
          ...mockUser,
          invitedBy: 'self-setup',
        }),
      });
      createServer(storage);

      const res = await makeRequest(server, 'POST', '/api/auth/setup', {
        email: 'admin@example.com',
        name: 'Admin',
        password: 'secure-password-123',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(storage.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'admin@example.com',
          name: 'Admin',
          role: 'admin',
          invitedBy: 'self-setup',
        }),
      );
    });
  });

  describe('POST /api/auth/login (token)', () => {
    it('returns 200 with user info for valid invite token', async () => {
      // Generate a real signed token so validateToken passes
      const token = generateToken(SESSION_SECRET, 'admin@example.com');
      const tokenHash = hashToken(token);

      const storage = createMockStorage({
        getUserByTokenHash: vi.fn().mockResolvedValue({ ...mockUser, tokenHash }),
        getUserByEmail: vi.fn().mockResolvedValue({ ...mockUser, tokenHash }),
      });
      createServer(storage);

      const res = await makeRequest(server, 'POST', '/api/auth/login', { token });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data as Record<string, unknown>;
      expect(data.email).toBe('admin@example.com');
      expect(data.tokenHash).toBeUndefined(); // stripped from response
    });

    it('returns 401 for invalid token signature', async () => {
      const storage = createMockStorage();
      createServer(storage);

      const res = await makeRequest(server, 'POST', '/api/auth/login', { token: 'invalid-token' });
      expect(res.status).toBe(401);
    });

    it('returns 401 for valid HMAC token not found in storage', async () => {
      const token = generateToken(SESSION_SECRET, 'admin@example.com');
      const storage = createMockStorage({
        getUserByTokenHash: vi.fn().mockResolvedValue(null),
      });
      createServer(storage);

      const res = await makeRequest(server, 'POST', '/api/auth/login', { token });
      expect(res.status).toBe(401);
    });

    it('returns 403 for revoked user', async () => {
      const token = generateToken(SESSION_SECRET, 'admin@example.com');
      const tokenHash = hashToken(token);

      const storage = createMockStorage({
        getUserByTokenHash: vi.fn().mockResolvedValue({ ...mockUser, tokenHash, revoked: true }),
      });
      createServer(storage);

      const res = await makeRequest(server, 'POST', '/api/auth/login', { token });
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('returns 200 even without an active session', async () => {
      const storage = createMockStorage();
      createServer(storage);

      const res = await makeRequest(server, 'POST', '/api/auth/logout');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/auth/set-password', () => {
    it('returns 401 for invalid token', async () => {
      const storage = createMockStorage();
      createServer(storage);

      const res = await makeRequest(server, 'POST', '/api/auth/set-password', {
        token: 'garbage',
        password: 'newpassword123',
      });
      expect(res.status).toBe(401);
    });

    it('returns 400 for short password', async () => {
      const token = generateToken(SESSION_SECRET, 'admin@example.com');
      const storage = createMockStorage();
      createServer(storage);

      const res = await makeRequest(server, 'POST', '/api/auth/set-password', {
        token,
        password: 'short',
      });
      expect(res.status).toBe(400);
    });

    it('returns 401 when token hash not found in storage', async () => {
      const token = generateToken(SESSION_SECRET, 'admin@example.com');
      const storage = createMockStorage({
        getUserByTokenHash: vi.fn().mockResolvedValue(null),
      });
      createServer(storage);

      const res = await makeRequest(server, 'POST', '/api/auth/set-password', {
        token,
        password: 'newpassword123',
      });
      expect(res.status).toBe(401);
    });
  });
});

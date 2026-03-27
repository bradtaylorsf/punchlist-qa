import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { Request, Response, NextFunction } from 'express';
import type { StorageAdapter } from '../../../src/adapters/storage/types.js';
import { usersRouter } from '../../../src/server/routes/users-api.js';
import { errorHandler } from '../../../src/server/middleware/error-handler.js';

const SESSION_SECRET = 'test-secret-at-least-16-characters-long';

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
    createUser: vi.fn().mockResolvedValue({ ...mockTester, email: 'new@example.com' }),
    listUsers: vi.fn().mockResolvedValue([mockAdmin, mockTester]),
    getUserByEmail: vi.fn().mockResolvedValue(mockTester),
    getUserByTokenHash: vi.fn(),
    revokeUser: vi.fn().mockResolvedValue(undefined),
    updateUserTokenHash: vi.fn().mockResolvedValue(undefined),
    updateUserPasswordHash: vi.fn().mockResolvedValue(undefined),
    getUserPasswordHash: vi.fn().mockResolvedValue(null),
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

  function createServer(user: typeof mockAdmin, storage?: StorageAdapter) {
    const mockStorage = storage ?? createMockStorage();
    const app = express();
    app.use(express.json());
    app.use(injectUser(user));
    app.use('/api/users', usersRouter(mockStorage, SESSION_SECRET));
    app.use(errorHandler);
    server = app.listen(0);
    return { server, storage: mockStorage };
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
    const { storage } = createServer(mockAdmin);

    const res = await makeRequest(server, 'GET', '/api/users');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Array<Record<string, unknown>>;
    expect(data).toHaveLength(2);
    for (const u of data) {
      expect(u.tokenHash).toBeUndefined();
    }
    expect(storage.listUsers).toHaveBeenCalled();
  });

  it('GET /api/users returns 403 for tester role', async () => {
    createServer(mockTester);

    const res = await makeRequest(server, 'GET', '/api/users');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Admin access required');
  });

  it('POST /api/users/invite creates invite for admin', async () => {
    const newUser = { ...mockTester, email: 'new@example.com', tokenHash: 'some-hash' };
    const { storage } = createServer(mockAdmin, createMockStorage({
      createUser: vi.fn().mockResolvedValue(newUser),
    }));

    const res = await makeRequest(server, 'POST', '/api/users/invite', {
      email: 'new@example.com',
      name: 'New User',
      role: 'tester',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Record<string, unknown>;
    expect(typeof data.inviteUrl).toBe('string');
    expect(data.inviteUrl as string).toContain('/join?token=');
    expect((data.user as Record<string, unknown>).tokenHash).toBeUndefined();
    expect(storage.createUser).toHaveBeenCalled();
  });

  it('POST /api/users/invite returns 400 for invalid body', async () => {
    createServer(mockAdmin);

    const res = await makeRequest(server, 'POST', '/api/users/invite', {
      email: 'not-an-email',
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/users/invite returns 403 for tester', async () => {
    createServer(mockTester);

    const res = await makeRequest(server, 'POST', '/api/users/invite', {
      email: 'new@example.com',
      name: 'New User',
    });
    expect(res.status).toBe(403);
  });

  it('POST /api/users/revoke revokes user for admin', async () => {
    const { storage } = createServer(mockAdmin);

    const res = await makeRequest(server, 'POST', '/api/users/revoke', {
      email: 'tester@example.com',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(storage.revokeUser).toHaveBeenCalledWith('tester@example.com');
  });

  it('POST /api/users/revoke returns 403 for tester', async () => {
    createServer(mockTester);

    const res = await makeRequest(server, 'POST', '/api/users/revoke', {
      email: 'admin@example.com',
    });
    expect(res.status).toBe(403);
  });

  it('POST /api/users/regenerate returns new invite URL for admin', async () => {
    const { storage } = createServer(mockAdmin, createMockStorage({
      getUserByEmail: vi.fn().mockResolvedValue(mockTester),
      updateUserTokenHash: vi.fn().mockResolvedValue(undefined),
    }));

    const res = await makeRequest(server, 'POST', '/api/users/regenerate', {
      email: 'tester@example.com',
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Record<string, unknown>;
    expect(typeof data.inviteUrl).toBe('string');
    expect(data.inviteUrl as string).toContain('/join?token=');
    expect((data.user as Record<string, unknown>).tokenHash).toBeUndefined();
    expect(storage.updateUserTokenHash).toHaveBeenCalled();
  });

  it('POST /api/users/regenerate returns 403 for tester', async () => {
    createServer(mockTester);

    const res = await makeRequest(server, 'POST', '/api/users/regenerate', {
      email: 'someone@example.com',
    });
    expect(res.status).toBe(403);
  });

  it('GET /api/users/me still works for tester (regression)', async () => {
    createServer(mockTester);

    const res = await makeRequest(server, 'GET', '/api/users/me');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect((res.body.data as Record<string, unknown>).role).toBe('tester');
  });
});

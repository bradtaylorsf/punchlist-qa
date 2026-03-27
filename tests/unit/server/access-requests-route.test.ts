import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { Request, Response, NextFunction } from 'express';
import type { StorageAdapter } from '../../../src/adapters/storage/types.js';
import {
  publicAccessRequestRouter,
  adminAccessRequestRouter,
} from '../../../src/server/routes/access-requests.js';
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
  tokenHash: 'secret-hash-2',
  role: 'tester' as const,
  invitedBy: 'admin@example.com',
  revoked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockAccessRequest = {
  id: 'ar-1',
  email: 'requester@example.com',
  name: 'New User',
  status: 'pending' as const,
  message: 'I would like access',
  reviewedBy: null,
  reviewedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  projectId: null,
};

const mockCreatedUser = {
  id: 'u3',
  email: 'requester@example.com',
  name: 'New User',
  tokenHash: 'tok-hash-123',
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
    createUser: vi.fn().mockResolvedValue(mockCreatedUser),
    listUsers: vi.fn(),
    getUserByEmail: vi.fn().mockResolvedValue(null),
    getUserByTokenHash: vi.fn(),
    revokeUser: vi.fn(),
    updateUserTokenHash: vi.fn(),
    updateUserPasswordHash: vi.fn(),
    getUserPasswordHash: vi.fn(),
    countUsers: vi.fn(),
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    createAccessRequest: vi.fn().mockResolvedValue(mockAccessRequest),
    listAccessRequests: vi.fn().mockResolvedValue([mockAccessRequest]),
    getAccessRequest: vi.fn().mockResolvedValue(mockAccessRequest),
    getAccessRequestByEmail: vi.fn().mockResolvedValue(null),
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

describe('access-requests routes', () => {
  let server: http.Server;
  let storage: StorageAdapter;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  function createServer(user?: typeof mockAdmin, storageOverride?: StorageAdapter) {
    storage = storageOverride ?? createMockStorage();
    const app = express();
    app.use(express.json());

    // Public route
    app.use('/api/access-requests', publicAccessRequestRouter(storage));

    // Admin routes (with auth)
    if (user) {
      app.use(injectUser(user));
      app.use('/api/access-requests', adminAccessRequestRouter(storage, SESSION_SECRET));
    }

    app.use(errorHandler);
    server = app.listen(0);
    return server;
  }

  // --- Public POST ---

  it('POST /api/access-requests creates a pending request', async () => {
    createServer();

    const res = await makeRequest(server, 'POST', '/api/access-requests', {
      email: 'new@example.com',
      name: 'New Person',
      message: 'Please let me in',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(storage.createAccessRequest).toHaveBeenCalledWith({
      email: 'new@example.com',
      name: 'New Person',
      message: 'Please let me in',
    }, undefined);
  });

  it('POST /api/access-requests returns 409 for duplicate pending request', async () => {
    storage = createMockStorage({
      getAccessRequestByEmail: vi.fn().mockResolvedValue(mockAccessRequest),
    });
    const app = express();
    app.use(express.json());
    app.use('/api/access-requests', publicAccessRequestRouter(storage));
    app.use(errorHandler);
    server = app.listen(0);

    const res = await makeRequest(server, 'POST', '/api/access-requests', {
      email: 'requester@example.com',
      name: 'Existing',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('A request for this email is already pending');
  });

  it('POST /api/access-requests returns 409 for existing user', async () => {
    storage = createMockStorage({
      getUserByEmail: vi.fn().mockResolvedValue(mockAdmin),
    });
    const app = express();
    app.use(express.json());
    app.use('/api/access-requests', publicAccessRequestRouter(storage));
    app.use(errorHandler);
    server = app.listen(0);

    const res = await makeRequest(server, 'POST', '/api/access-requests', {
      email: 'admin@example.com',
      name: 'Admin',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('An account with this email already exists');
  });

  it('POST /api/access-requests returns 400 for invalid body', async () => {
    createServer();

    const res = await makeRequest(server, 'POST', '/api/access-requests', {
      email: 'not-an-email',
    });
    expect(res.status).toBe(400);
  });

  // --- Admin GET ---

  it('GET /api/access-requests returns list for admin', async () => {
    createServer(mockAdmin);

    const res = await makeRequest(server, 'GET', '/api/access-requests');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/access-requests returns 403 for tester', async () => {
    createServer(mockTester);

    const res = await makeRequest(server, 'GET', '/api/access-requests');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Admin access required');
  });

  // --- Admin approve ---

  it('POST /api/access-requests/:id/approve creates invite and marks approved', async () => {
    const updatedRequest = { ...mockAccessRequest, status: 'approved', reviewedBy: 'admin@example.com' };
    storage = createMockStorage({
      getAccessRequest: vi.fn().mockResolvedValue(mockAccessRequest),
      createUser: vi.fn().mockResolvedValue(mockCreatedUser),
      updateAccessRequestStatus: vi.fn().mockResolvedValue(updatedRequest),
    });

    const app = express();
    app.use(express.json());
    app.use('/api/access-requests', publicAccessRequestRouter(storage));
    app.use(injectUser(mockAdmin));
    app.use('/api/access-requests', adminAccessRequestRouter(storage, SESSION_SECRET));
    app.use(errorHandler);
    server = app.listen(0);

    const res = await makeRequest(server, 'POST', '/api/access-requests/ar-1/approve');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Record<string, unknown>;
    // inviteUrl is generated from token — just check it's present and is a string
    expect(typeof data.inviteUrl).toBe('string');
    expect(data.inviteUrl as string).toContain('/join?token=');
    expect(storage.createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'requester@example.com',
      name: 'New User',
      invitedBy: 'admin@example.com',
      role: 'tester',
    }));
    expect(storage.updateAccessRequestStatus).toHaveBeenCalledWith('ar-1', 'approved', 'admin@example.com');
  });

  // --- Admin reject ---

  it('POST /api/access-requests/:id/reject marks rejected', async () => {
    const rejectedRequest = { ...mockAccessRequest, status: 'rejected', reviewedBy: 'admin@example.com' };
    storage = createMockStorage({
      getAccessRequest: vi.fn().mockResolvedValue(mockAccessRequest),
      updateAccessRequestStatus: vi.fn().mockResolvedValue(rejectedRequest),
    });

    const app = express();
    app.use(express.json());
    app.use('/api/access-requests', publicAccessRequestRouter(storage));
    app.use(injectUser(mockAdmin));
    app.use('/api/access-requests', adminAccessRequestRouter(storage, SESSION_SECRET));
    app.use(errorHandler);
    server = app.listen(0);

    const res = await makeRequest(server, 'POST', '/api/access-requests/ar-1/reject');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(storage.updateAccessRequestStatus).toHaveBeenCalledWith('ar-1', 'rejected', 'admin@example.com');
  });
});

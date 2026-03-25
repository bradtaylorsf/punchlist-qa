import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { Request, Response, NextFunction } from 'express';
import type { StorageAdapter } from '../../../src/adapters/storage/types.js';
import { roundsRouter } from '../../../src/server/routes/rounds.js';
import { errorHandler } from '../../../src/server/middleware/error-handler.js';

const mockUser = {
  id: 'u1',
  email: 'admin@example.com',
  name: 'Admin',
  tokenHash: 'hash',
  role: 'admin' as const,
  invitedBy: 'system@example.com',
  revoked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockRound = {
  id: 'round-1',
  name: 'Sprint 1',
  description: null,
  status: 'active' as const,
  createdByEmail: 'admin@example.com',
  createdByName: 'Admin',
  createdAt: '2024-01-01T00:00:00.000Z',
  completedAt: null,
  projectId: null,
};

function createMockStorage(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    initialize: vi.fn(),
    close: vi.fn(),
    createRound: vi.fn().mockResolvedValue(mockRound),
    listRounds: vi.fn().mockResolvedValue([mockRound]),
    getRound: vi.fn().mockResolvedValue(mockRound),
    updateRound: vi.fn().mockResolvedValue({ ...mockRound, name: 'Updated' }),
    submitResult: vi.fn(),
    listResults: vi.fn(),
    deleteResult: vi.fn(),
    deleteResultsByTestIds: vi.fn(),
    updateResultIssue: vi.fn(),
    createUser: vi.fn(),
    listUsers: vi.fn(),
    getUserByEmail: vi.fn(),
    getUserByTokenHash: vi.fn(),
    revokeUser: vi.fn(),
    updateUserTokenHash: vi.fn(),
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    createSession: vi.fn(),
    getSession: vi.fn(),
    getSessionWithUser: vi.fn(),
    deleteSession: vi.fn(),
    deleteExpiredSessions: vi.fn(),
    createAccessRequest: vi.fn(),
    listAccessRequests: vi.fn().mockResolvedValue([]),
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
  };
}

function injectUser(req: Request, _res: Response, next: NextFunction) {
  req.user = mockUser;
  next();
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
          ? {
              'Content-Type': 'application/json',
              'Content-Length': String(Buffer.byteLength(data)),
            }
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

describe('rounds routes', () => {
  let server: http.Server;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  function createServer(storage: StorageAdapter) {
    const app = express();
    app.use(express.json());
    app.use(injectUser);
    app.use('/api/rounds', roundsRouter(storage));
    app.use(errorHandler);
    server = app.listen(0);
    return server;
  }

  it('GET /api/rounds returns list of rounds', async () => {
    const storage = createMockStorage();
    createServer(storage);

    const res = await makeRequest(server, 'GET', '/api/rounds');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /api/rounds creates a round with identity from session', async () => {
    const storage = createMockStorage();
    createServer(storage);

    const res = await makeRequest(server, 'POST', '/api/rounds', {
      name: 'Sprint 1',
      createdByEmail: 'ignored@example.com',
      createdByName: 'Ignored',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // Verify session identity is used, not body values
    expect(storage.createRound).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Sprint 1',
        createdByEmail: 'admin@example.com',
        createdByName: 'Admin',
      }),
    );
  });

  it('POST /api/rounds returns 400 for invalid input', async () => {
    const storage = createMockStorage();
    createServer(storage);

    const res = await makeRequest(server, 'POST', '/api/rounds', {});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('PUT /api/rounds/:id updates a round', async () => {
    const storage = createMockStorage();
    createServer(storage);

    const res = await makeRequest(server, 'PUT', '/api/rounds/round-1', {
      name: 'Updated',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(storage.updateRound).toHaveBeenCalledWith('round-1', { name: 'Updated' });
  });
});

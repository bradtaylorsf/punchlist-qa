import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { Request, Response, NextFunction } from 'express';
import type { StorageAdapter } from '../../../src/adapters/storage/types.js';
import { resultsRouter } from '../../../src/server/routes/results.js';
import { errorHandler } from '../../../src/server/middleware/error-handler.js';

const mockUser = {
  id: 'u1',
  email: 'tester@example.com',
  name: 'Tester',
  tokenHash: 'hash',
  role: 'tester' as const,
  invitedBy: 'admin@example.com',
  revoked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockResult = {
  id: 'result-1',
  roundId: 'round-1',
  testId: 'auth-001',
  status: 'pass' as const,
  testerName: 'Tester',
  testerEmail: 'tester@example.com',
  description: null,
  severity: null,
  commitHash: 'abc123',
  issueUrl: null,
  issueNumber: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  projectId: null,
};

function createMockStorage(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    initialize: vi.fn(),
    close: vi.fn(),
    createRound: vi.fn(),
    listRounds: vi.fn(),
    getRound: vi.fn(),
    updateRound: vi.fn(),
    submitResult: vi.fn().mockResolvedValue(mockResult),
    listResults: vi.fn().mockResolvedValue([mockResult]),
    deleteResult: vi.fn(),
    deleteResultsByTestIds: vi.fn().mockResolvedValue(1),
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

describe('results routes', () => {
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
    app.use('/api/rounds', resultsRouter(storage));
    app.use(errorHandler);
    server = app.listen(0);
    return server;
  }

  it('GET /api/rounds/:roundId/results returns results', async () => {
    const storage = createMockStorage();
    createServer(storage);

    const res = await makeRequest(server, 'GET', '/api/rounds/round-1/results');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(storage.listResults).toHaveBeenCalledWith('round-1', undefined);
  });

  it('POST /api/rounds/:roundId/results submits with session identity', async () => {
    const storage = createMockStorage();
    createServer(storage);

    const res = await makeRequest(server, 'POST', '/api/rounds/round-1/results', {
      testId: 'auth-001',
      status: 'pass',
      testerName: 'Ignored',
      testerEmail: 'ignored@example.com',
      commitHash: 'abc123',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // Verify session identity is used, not body values
    expect(storage.submitResult).toHaveBeenCalledWith(
      'round-1',
      expect.objectContaining({
        testId: 'auth-001',
        testerName: 'Tester',
        testerEmail: 'tester@example.com',
      }),
      undefined,
    );
  });

  it('POST /api/rounds/:roundId/results returns 400 for invalid input', async () => {
    const storage = createMockStorage();
    createServer(storage);

    const res = await makeRequest(server, 'POST', '/api/rounds/round-1/results', {});
    expect(res.status).toBe(400);
  });

  it('DELETE /api/rounds/:roundId/results/:testId deletes result', async () => {
    const storage = createMockStorage();
    createServer(storage);

    const res = await makeRequest(server, 'DELETE', '/api/rounds/round-1/results/auth-001');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.deleted).toBe(1);
    expect(storage.deleteResultsByTestIds).toHaveBeenCalledWith('round-1', ['auth-001']);
  });

  it('PATCH /api/rounds/:roundId/results/:resultId/issue links issue to result', async () => {
    const updatedResult = { ...mockResult, issueUrl: 'https://github.com/org/repo/issues/42', issueNumber: 42 };
    const storage = createMockStorage({
      updateResultIssue: vi.fn().mockResolvedValue(updatedResult),
    });
    createServer(storage);

    const res = await makeRequest(server, 'PATCH', '/api/rounds/round-1/results/result-1/issue', {
      issueUrl: 'https://github.com/org/repo/issues/42',
      issueNumber: 42,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(storage.updateResultIssue).toHaveBeenCalledWith(
      'result-1',
      'https://github.com/org/repo/issues/42',
      42,
    );
  });

  it('PATCH /api/rounds/:roundId/results/:resultId/issue returns 400 for invalid body', async () => {
    const storage = createMockStorage();
    createServer(storage);

    const res = await makeRequest(server, 'PATCH', '/api/rounds/round-1/results/result-1/issue', {
      issueUrl: 'not-a-url',
    });
    expect(res.status).toBe(400);
  });
});

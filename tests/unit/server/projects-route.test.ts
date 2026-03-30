import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { Request, Response, NextFunction } from 'express';
import type { StorageAdapter } from '../../../src/adapters/storage/types.js';
import { projectsRouter } from '../../../src/server/routes/projects.js';
import { errorHandler } from '../../../src/server/middleware/error-handler.js';

const mockAdminUser = {
  id: 'u1',
  email: 'admin@example.com',
  name: 'Admin',
  tokenHash: 'hash',
  role: 'admin' as const,
  invitedBy: 'system@example.com',
  revoked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockTesterUser = {
  id: 'u2',
  email: 'tester@example.com',
  name: 'Tester',
  tokenHash: 'hash2',
  role: 'tester' as const,
  invitedBy: 'admin@example.com',
  revoked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
};

const mockProject = {
  id: 'project-1',
  repoSlug: 'org/repo',
  name: 'Test Project',
  githubTokenEncrypted: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockProjectUser = {
  projectId: 'project-1',
  userEmail: 'tester@example.com',
  role: 'tester' as const,
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
    createProject: vi.fn().mockResolvedValue(mockProject),
    getProject: vi.fn().mockResolvedValue(mockProject),
    getProjectByRepoSlug: vi.fn().mockResolvedValue(mockProject),
    getProjectByName: vi.fn().mockResolvedValue(mockProject),
    listProjects: vi.fn().mockResolvedValue([mockProject]),
    updateProject: vi.fn().mockResolvedValue(mockProject),
    deleteProject: vi.fn().mockResolvedValue(undefined),
    addUserToProject: vi.fn().mockResolvedValue(mockProjectUser),
    removeUserFromProject: vi.fn().mockResolvedValue(undefined),
    listProjectUsers: vi.fn().mockResolvedValue([mockProjectUser]),
    listUserProjects: vi.fn().mockResolvedValue([mockProject]),
    ...overrides,
  };
}

function injectUser(user: typeof mockAdminUser | typeof mockTesterUser) {
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

describe('projects routes', () => {
  let server: http.Server;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  function createServer(
    storage: StorageAdapter,
    user: typeof mockAdminUser | typeof mockTesterUser = mockAdminUser,
  ) {
    const app = express();
    app.use(express.json());
    app.use(injectUser(user));
    app.use('/api/projects', projectsRouter(storage, 'test-secret'));
    app.use(errorHandler);
    server = app.listen(0);
    return server;
  }

  describe('GET /api/projects', () => {
    it('should return all projects via listProjects for admin users', async () => {
      const storage = createMockStorage();
      createServer(storage, mockAdminUser);

      const res = await makeRequest(server, 'GET', '/api/projects');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(storage.listProjects).toHaveBeenCalled();
      expect(storage.listUserProjects).not.toHaveBeenCalled();
    });

    it('should return only user projects via listUserProjects for tester users', async () => {
      const storage = createMockStorage();
      createServer(storage, mockTesterUser);

      const res = await makeRequest(server, 'GET', '/api/projects');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(storage.listUserProjects).toHaveBeenCalledWith(mockTesterUser.email);
      expect(storage.listProjects).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/projects', () => {
    it('should create a project and auto-add the admin user as a member', async () => {
      const storage = createMockStorage();
      createServer(storage, mockAdminUser);

      const res = await makeRequest(server, 'POST', '/api/projects', {
        repoSlug: 'org/repo',
        name: 'Test Project',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(storage.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ repoSlug: 'org/repo', name: 'Test Project' }),
      );
      expect(storage.addUserToProject).toHaveBeenCalledWith(
        mockProject.id,
        mockAdminUser.email,
        'admin',
      );
    });

    it('should return 403 for tester users', async () => {
      const storage = createMockStorage();
      createServer(storage, mockTesterUser);

      const res = await makeRequest(server, 'POST', '/api/projects', {
        repoSlug: 'org/repo',
        name: 'Test Project',
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(storage.createProject).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid input missing required fields', async () => {
      const storage = createMockStorage();
      createServer(storage, mockAdminUser);

      const res = await makeRequest(server, 'POST', '/api/projects', {});

      expect(res.status).toBe(400);
      expect(storage.createProject).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/projects/:projectId', () => {
    it('should update a project for admin users', async () => {
      const updatedProject = { ...mockProject, name: 'Updated Name' };
      const storage = createMockStorage({
        updateProject: vi.fn().mockResolvedValue(updatedProject),
      });
      createServer(storage, mockAdminUser);

      const res = await makeRequest(server, 'PUT', '/api/projects/project-1', {
        name: 'Updated Name',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(storage.updateProject).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({ name: 'Updated Name' }),
      );
    });

    it('should return 403 for tester users', async () => {
      const storage = createMockStorage();
      createServer(storage, mockTesterUser);

      const res = await makeRequest(server, 'PUT', '/api/projects/project-1', {
        name: 'Updated Name',
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(storage.updateProject).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/projects/:projectId', () => {
    it('should delete a project for admin users', async () => {
      const storage = createMockStorage();
      createServer(storage, mockAdminUser);

      const res = await makeRequest(server, 'DELETE', '/api/projects/project-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(storage.deleteProject).toHaveBeenCalledWith('project-1');
    });

    it('should return 403 for tester users', async () => {
      const storage = createMockStorage();
      createServer(storage, mockTesterUser);

      const res = await makeRequest(server, 'DELETE', '/api/projects/project-1');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(storage.deleteProject).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/projects/:projectId/users', () => {
    it('should add an existing user to a project for admin users', async () => {
      const storage = createMockStorage({
        getUserByEmail: vi.fn().mockResolvedValue(mockTesterUser),
      });
      createServer(storage, mockAdminUser);

      const res = await makeRequest(server, 'POST', '/api/projects/project-1/users', {
        email: 'tester@example.com',
        role: 'tester',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.inviteUrl).toBeUndefined();
      expect(storage.createUser).not.toHaveBeenCalled();
      expect(storage.addUserToProject).toHaveBeenCalledWith(
        'project-1',
        'tester@example.com',
        'tester',
      );
    });

    it('should auto-invite a new user and return invite URL', async () => {
      const storage = createMockStorage({
        getUserByEmail: vi.fn().mockResolvedValue(null),
        createUser: vi.fn().mockResolvedValue(mockTesterUser),
      });
      createServer(storage, mockAdminUser);

      const res = await makeRequest(server, 'POST', '/api/projects/project-1/users', {
        email: 'newuser@example.com',
        name: 'New User',
        role: 'tester',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.inviteUrl).toBeDefined();
      expect(typeof res.body.inviteUrl).toBe('string');
      expect(storage.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'newuser@example.com',
          name: 'New User',
          role: 'tester',
          invitedBy: 'admin@example.com',
        }),
      );
      expect(storage.addUserToProject).toHaveBeenCalledWith(
        'project-1',
        'newuser@example.com',
        'tester',
      );
    });

    it('should return 400 when email is missing', async () => {
      const storage = createMockStorage();
      createServer(storage, mockAdminUser);

      const res = await makeRequest(server, 'POST', '/api/projects/project-1/users', {
        role: 'tester',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(storage.addUserToProject).not.toHaveBeenCalled();
    });

    it('should return 403 for tester users', async () => {
      const storage = createMockStorage();
      createServer(storage, mockTesterUser);

      const res = await makeRequest(server, 'POST', '/api/projects/project-1/users', {
        email: 'another@example.com',
        role: 'tester',
      });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(storage.addUserToProject).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/projects/:projectId/users/:email', () => {
    it('should remove a user from a project for admin users', async () => {
      const storage = createMockStorage();
      createServer(storage, mockAdminUser);

      const res = await makeRequest(
        server,
        'DELETE',
        '/api/projects/project-1/users/tester@example.com',
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(storage.removeUserFromProject).toHaveBeenCalledWith(
        'project-1',
        'tester@example.com',
      );
    });

    it('should return 403 for tester users', async () => {
      const storage = createMockStorage();
      createServer(storage, mockTesterUser);

      const res = await makeRequest(
        server,
        'DELETE',
        '/api/projects/project-1/users/another@example.com',
      );

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(storage.removeUserFromProject).not.toHaveBeenCalled();
    });
  });
});

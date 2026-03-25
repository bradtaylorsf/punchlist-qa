import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { StorageAdapter } from '../../../src/adapters/storage/types.js';
import {
  requireProjectContext,
  defaultProjectContext,
} from '../../../src/server/middleware/project-context.js';

const mockProject = {
  id: 'project-1',
  repoSlug: 'org/repo',
  name: 'Test Project',
  githubTokenEncrypted: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

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
    listAccessRequests: vi.fn(),
    getAccessRequest: vi.fn(),
    getAccessRequestByEmail: vi.fn(),
    updateAccessRequestStatus: vi.fn(),
    createProject: vi.fn(),
    getProject: vi.fn().mockResolvedValue(mockProject),
    getProjectByRepoSlug: vi.fn(),
    listProjects: vi.fn().mockResolvedValue([mockProject]),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
    addUserToProject: vi.fn(),
    removeUserFromProject: vi.fn(),
    listProjectUsers: vi.fn(),
    listUserProjects: vi.fn().mockResolvedValue([mockProject]),
    ...overrides,
  };
}

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    user: mockAdminUser,
    project: undefined,
    ...overrides,
  } as unknown as Request;
}

function createMockRes(): { res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> } {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;
  return { res, status, json };
}

describe('requireProjectContext', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('should return 400 if no projectId in params', async () => {
    const storage = createMockStorage();
    const middleware = requireProjectContext(storage);
    const req = createMockReq({ params: {} });
    const { res, status } = createMockRes();

    await middleware(req, res, next);

    expect(status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 404 if project is not found', async () => {
    const storage = createMockStorage({
      getProject: vi.fn().mockResolvedValue(null),
    });
    const middleware = requireProjectContext(storage);
    const req = createMockReq({ params: { projectId: 'project-1' } });
    const { res, status } = createMockRes();

    await middleware(req, res, next);

    expect(status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 if a non-admin user does not have access to the project', async () => {
    const storage = createMockStorage({
      listUserProjects: vi.fn().mockResolvedValue([]),
    });
    const middleware = requireProjectContext(storage);
    const req = createMockReq({
      params: { projectId: 'project-1' },
      user: mockTesterUser,
    });
    const { res, status } = createMockRes();

    await middleware(req, res, next);

    expect(status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('should set req.project and call next() for admin users without checking user projects', async () => {
    const storage = createMockStorage();
    const middleware = requireProjectContext(storage);
    const req = createMockReq({
      params: { projectId: 'project-1' },
      user: mockAdminUser,
    });
    const { res } = createMockRes();

    await middleware(req, res, next);

    expect(req.project).toBe(mockProject);
    expect(storage.listUserProjects).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it('should set req.project and call next() for tester users who have access', async () => {
    const storage = createMockStorage({
      listUserProjects: vi.fn().mockResolvedValue([mockProject]),
    });
    const middleware = requireProjectContext(storage);
    const req = createMockReq({
      params: { projectId: 'project-1' },
      user: mockTesterUser,
    });
    const { res } = createMockRes();

    await middleware(req, res, next);

    expect(req.project).toBe(mockProject);
    expect(storage.listUserProjects).toHaveBeenCalledWith(mockTesterUser.email);
    expect(next).toHaveBeenCalledWith();
  });

  it('should call next(err) when storage throws', async () => {
    const error = new Error('DB failure');
    const storage = createMockStorage({
      getProject: vi.fn().mockRejectedValue(error),
    });
    const middleware = requireProjectContext(storage);
    const req = createMockReq({ params: { projectId: 'project-1' } });
    const { res } = createMockRes();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

describe('defaultProjectContext', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('should skip and call next() without modifying req.project when req.project is already set', async () => {
    const storage = createMockStorage();
    const middleware = defaultProjectContext(storage);
    const req = createMockReq({ project: mockProject });
    const { res } = createMockRes();

    await middleware(req, res, next);

    expect(storage.listProjects).not.toHaveBeenCalled();
    expect(req.project).toBe(mockProject);
    expect(next).toHaveBeenCalledWith();
  });

  it('should call next() without setting req.project when no projects exist', async () => {
    const storage = createMockStorage({
      listProjects: vi.fn().mockResolvedValue([]),
    });
    const middleware = defaultProjectContext(storage);
    const req = createMockReq({ project: undefined });
    const { res } = createMockRes();

    await middleware(req, res, next);

    expect(req.project).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('should set req.project to the first project when projects exist', async () => {
    const secondProject = { ...mockProject, id: 'project-2', name: 'Second Project' };
    const storage = createMockStorage({
      listProjects: vi.fn().mockResolvedValue([mockProject, secondProject]),
    });
    const middleware = defaultProjectContext(storage);
    const req = createMockReq({ project: undefined });
    const { res } = createMockRes();

    await middleware(req, res, next);

    expect(req.project).toBe(mockProject);
    expect(next).toHaveBeenCalledWith();
  });

  it('should call next(err) when storage throws', async () => {
    const error = new Error('DB failure');
    const storage = createMockStorage({
      listProjects: vi.fn().mockRejectedValue(error),
    });
    const middleware = defaultProjectContext(storage);
    const req = createMockReq({ project: undefined });
    const { res } = createMockRes();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});

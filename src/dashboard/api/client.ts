const BASE = '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isRetriableError(error: unknown): boolean {
  // Network failures (TypeError from fetch) are retriable
  if (error instanceof TypeError) return true;
  // 5xx server errors are retriable
  if (error instanceof ApiError && error.status >= 500) return true;
  return false;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 401) {
    throw new ApiError('UNAUTHENTICATED', 401);
  }

  let json: Record<string, unknown>;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(`Request failed: ${res.status} (non-JSON response)`, res.status);
  }

  if (!res.ok) {
    throw new ApiError(
      (json.error as string) || `Request failed: ${res.status}`,
      res.status,
    );
  }

  return json as T;
}

// Project scope management
let activeProjectId: string | null = null;

export function setActiveProject(projectId: string | null) {
  activeProjectId = projectId;
}

export function getActiveProjectId(): string | null {
  return activeProjectId;
}

// Helper to build project-scoped path (falls back to legacy path when no project)
function projectPath(path: string): string {
  if (activeProjectId) {
    return `/projects/${activeProjectId}${path}`;
  }
  return path;
}

// Auth
export function getAuthStatus() {
  return request<{
    success: boolean;
    data: { setupRequired: boolean; user: { email: string; name: string; role: string } | null };
  }>('/auth/status');
}

export function login(token: string) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function loginWithPassword(email: string, password: string) {
  return request<{ success: boolean; data: Record<string, unknown> }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function setup(input: { email: string; name: string; password: string }) {
  return request<{ success: boolean; data: Record<string, unknown> }>('/auth/setup', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function setPassword(token: string, password: string) {
  return request<{ success: boolean; data: Record<string, unknown> }>('/auth/set-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return request<{ success: boolean }>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function resetPassword(email: string) {
  return request<{ success: boolean; data: { inviteUrl: string } }>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function logout() {
  return request('/auth/logout', { method: 'POST' });
}

// Users
export function getMe() {
  return request<{ success: boolean; data: { email: string; name: string; role: string } }>(
    '/users/me',
  );
}

export function listUsers() {
  return request<{ success: boolean; data: Array<Record<string, unknown>> }>('/users');
}

export function inviteUser(input: { email: string; name: string; role: string }) {
  return request<{
    success: boolean;
    data: { user: Record<string, unknown>; inviteUrl: string };
  }>('/users/invite', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function revokeUser(email: string) {
  return request<{ success: boolean }>('/users/revoke', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function regenerateToken(email: string) {
  return request<{
    success: boolean;
    data: { user: Record<string, unknown>; inviteUrl: string };
  }>('/users/regenerate', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

// Config
export function getConfig() {
  return request<{
    success: boolean;
    data: {
      projectName: string;
      testCases: Array<{
        id: string;
        title: string;
        category: string;
        priority: string;
        instructions: string;
        expectedResult: string;
      }>;
      categories: Array<{ id: string; label: string; description?: string }>;
    };
  }>(projectPath('/config'));
}

// Config Sync
export interface SyncDiff<T> {
  added: T[];
  updated: T[];
  removed: T[];
}

export interface SyncResultData {
  categories: SyncDiff<{ id: string; label: string; description?: string }>;
  testCases: SyncDiff<{
    id: string;
    title: string;
    category: string;
    priority: string;
    instructions: string;
    expectedResult: string;
  }>;
  syncedAt: string | null;
  isFirstSync: boolean;
}

export function getSyncStatus(projectId: string) {
  return request<{
    success: boolean;
    data: { syncedAt: string | null; categoriesCount: number; testCasesCount: number };
  }>(`/projects/${projectId}/sync`);
}

export function syncProjectConfig(projectId: string, preview = false) {
  return request<{ success: boolean; data: SyncResultData }>(
    `/projects/${projectId}/sync?preview=${preview}`,
    { method: 'POST' },
  );
}

// Rounds
export function listRounds() {
  return request<{ success: boolean; data: Array<Record<string, unknown>> }>(projectPath('/rounds'));
}

export function createRound(input: { name: string; description?: string }) {
  return request<{ success: boolean; data: Record<string, unknown> }>(projectPath('/rounds'), {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateRound(id: string, input: Record<string, unknown>) {
  return request<{ success: boolean; data: Record<string, unknown> }>(projectPath(`/rounds/${id}`), {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

// Results
export function listResults(roundId: string) {
  return request<{ success: boolean; data: Array<Record<string, unknown>> }>(
    projectPath(`/rounds/${roundId}/results`),
  );
}

export function submitResult(
  roundId: string,
  input: {
    testId: string;
    status: string;
    description?: string;
    severity?: string;
    commitHash?: string;
  },
) {
  return request<{ success: boolean; data: Record<string, unknown> }>(
    projectPath(`/rounds/${roundId}/results`),
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function deleteResult(roundId: string, testId: string) {
  return request<{ success: boolean; deleted: number }>(projectPath(`/rounds/${roundId}/results/${testId}`), {
    method: 'DELETE',
  });
}

export function linkResultIssue(roundId: string, resultId: string, issueUrl: string, issueNumber: number) {
  return request<{ success: boolean; data: Record<string, unknown> }>(
    projectPath(`/rounds/${roundId}/results/${resultId}/issue`),
    { method: 'PATCH', body: JSON.stringify({ issueUrl, issueNumber }) },
  );
}

// Issues
export function createIssue(opts: Record<string, unknown>) {
  return request<{
    success: boolean;
    data: { url: string; id: string; number: number };
  }>(projectPath('/issues'), {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function getOpenIssue(testId: string) {
  return request<{
    success: boolean;
    data: { url: string; number: number; title: string } | null;
  }>(projectPath(`/issues/open/${testId}`));
}

// Projects
export function listProjects() {
  return request<{
    success: boolean;
    data: Array<{
      id: string;
      repoSlug: string;
      name: string;
      githubTokenEncrypted: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
  }>('/projects');
}

export function createProject(input: { repoSlug: string; name?: string }) {
  return request<{ success: boolean; data: Record<string, unknown> }>('/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateProject(id: string, input: { name?: string }) {
  return request<{ success: boolean; data: Record<string, unknown> }>(`/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteProject(id: string) {
  return request<{ success: boolean }>(`/projects/${id}`, { method: 'DELETE' });
}

export function listProjectUsers(projectId: string) {
  return request<{
    success: boolean;
    data: Array<{ projectId: string; userEmail: string; role: string; createdAt: string }>;
  }>(`/projects/${projectId}/users`);
}

export function addProjectUser(projectId: string, email: string, role?: string) {
  return request<{ success: boolean; data: Record<string, unknown> }>(
    `/projects/${projectId}/users`,
    {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    },
  );
}

export function removeProjectUser(projectId: string, email: string) {
  return request<{ success: boolean }>(
    `/projects/${projectId}/users/${encodeURIComponent(email)}`,
    { method: 'DELETE' },
  );
}

// Access Requests
export function requestAccess(input: { email: string; name: string; message?: string }) {
  return request<{ success: boolean; data: Record<string, unknown> }>('/access-requests', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listAccessRequests(status?: string) {
  const qs = status ? `?status=${status}` : '';
  return request<{ success: boolean; data: Array<Record<string, unknown>> }>(
    `/access-requests${qs}`,
  );
}

export function approveAccessRequest(id: string) {
  return request<{
    success: boolean;
    data: { request: Record<string, unknown>; user: Record<string, unknown>; inviteUrl: string };
  }>(`/access-requests/${id}/approve`, { method: 'POST' });
}

export function rejectAccessRequest(id: string) {
  return request<{ success: boolean; data: Record<string, unknown> }>(
    `/access-requests/${id}/reject`,
    { method: 'POST' },
  );
}

// Commit
export function getCommitSha() {
  return request<{ success: boolean; data: { sha: string } }>('/commit');
}

// GitHub Tokens
export function listGitHubTokens() {
  return request<{
    success: boolean;
    data: Array<{ id: number; owner: string; createdAt: string; updatedAt: string }>;
  }>('/github-tokens');
}

export function createGitHubToken(input: { owner: string; token: string }) {
  return request<{
    success: boolean;
    data: { id: number; owner: string; createdAt: string; updatedAt: string };
  }>('/github-tokens', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function deleteGitHubToken(owner: string) {
  return request<{ success: boolean }>(`/github-tokens/${encodeURIComponent(owner)}`, {
    method: 'DELETE',
  });
}

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

// Auth
export function login(token: string) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ token }),
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
  }>('/config');
}

// Rounds
export function listRounds() {
  return request<{ success: boolean; data: Array<Record<string, unknown>> }>('/rounds');
}

export function createRound(input: { name: string; description?: string }) {
  return request<{ success: boolean; data: Record<string, unknown> }>('/rounds', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateRound(id: string, input: Record<string, unknown>) {
  return request<{ success: boolean; data: Record<string, unknown> }>(`/rounds/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

// Results
export function listResults(roundId: string) {
  return request<{ success: boolean; data: Array<Record<string, unknown>> }>(
    `/rounds/${roundId}/results`,
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
    `/rounds/${roundId}/results`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function deleteResult(roundId: string, testId: string) {
  return request<{ success: boolean; deleted: number }>(`/rounds/${roundId}/results/${testId}`, {
    method: 'DELETE',
  });
}

export function linkResultIssue(roundId: string, resultId: string, issueUrl: string, issueNumber: number) {
  return request<{ success: boolean; data: Record<string, unknown> }>(
    `/rounds/${roundId}/results/${resultId}/issue`,
    { method: 'PATCH', body: JSON.stringify({ issueUrl, issueNumber }) },
  );
}

// Issues
export function createIssue(opts: Record<string, unknown>) {
  return request<{
    success: boolean;
    data: { url: string; id: string; number: number };
  }>('/issues', {
    method: 'POST',
    body: JSON.stringify(opts),
  });
}

export function getOpenIssue(testId: string) {
  return request<{
    success: boolean;
    data: { url: string; number: number; title: string } | null;
  }>(`/issues/open/${testId}`);
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

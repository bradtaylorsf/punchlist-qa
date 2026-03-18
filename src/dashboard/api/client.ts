const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (res.status === 401) {
    throw new Error('UNAUTHENTICATED');
  }

  const json = await res.json();

  if (!res.ok) {
    throw new Error(json.error || `Request failed: ${res.status}`);
  }

  return json;
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

// Commit
export function getCommitSha() {
  return request<{ success: boolean; data: { sha: string } }>('/commit');
}

import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import { configRouter } from '../../../src/server/routes/config.js';
import type { PunchlistConfig } from '../../../src/shared/types.js';

const mockConfig: PunchlistConfig = {
  projectName: 'Test Project',
  issueTracker: { type: 'github', repo: 'owner/repo' },
  storage: { type: 'sqlite', path: 'data/punchlist.db' },
  auth: { type: 'token' },
  widget: {
    position: 'bottom-right',
    theme: 'light',
    corsDomains: [],
    categories: [],
  },
  aiTool: 'none',
  categories: [{ id: 'auth', label: 'Authentication' }],
  testCases: [
    {
      id: 'auth-001',
      title: 'Login works',
      category: 'auth',
      priority: 'high',
      instructions: 'Try to login',
      expectedResult: 'Login succeeds',
    },
  ],
  testers: [],
};

function makeRequest(
  server: http.Server,
  path: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode!, body: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode!, body: { raw: body } });
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('config route', () => {
  let server: http.Server;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('GET /api/config returns project config', async () => {
    const app = express();
    app.use('/api/config', configRouter(mockConfig));
    server = app.listen(0);

    const res = await makeRequest(server, '/api/config');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Record<string, unknown>;
    expect(data.projectName).toBe('Test Project');
    expect(Array.isArray(data.testCases)).toBe(true);
    expect(Array.isArray(data.categories)).toBe(true);
  });
});

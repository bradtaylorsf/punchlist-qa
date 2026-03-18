import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import { commitRouter } from '../../../src/server/routes/commit.js';

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

describe('commit route', () => {
  let server: http.Server;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('GET /api/commit returns a commit SHA', async () => {
    vi.useRealTimers(); // execSync needs real timers
    const app = express();
    app.use('/api/commit', commitRouter());
    server = app.listen(0);

    const res = await makeRequest(server, '/api/commit');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Record<string, unknown>;
    expect(typeof data.sha).toBe('string');
    expect((data.sha as string).length).toBeGreaterThan(0);
  });
});

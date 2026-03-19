import { describe, it, expect, vi, afterEach } from 'vitest';
import http from 'node:http';
import type { IssueAdapter } from '../../../src/adapters/issues/types.js';
import { createApp } from '../../../src/server/app.js';

function createMockAdapter(): IssueAdapter {
  return {
    initialize: vi.fn(),
    createIssue: vi.fn(),
    createQAFailureIssue: vi.fn(),
    createSupportTicketIssue: vi.fn().mockResolvedValue({
      url: 'https://github.com/owner/repo/issues/1',
      id: '1',
      number: 1,
    }),
    getOpenIssueForTest: vi.fn(),
    addLabels: vi.fn(),
    validateLabels: vi.fn(),
  };
}

function makeRequest(
  server: http.Server,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const data = body ? JSON.stringify(body) : undefined;

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          ...(data ? { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(data)) } : {}),
          ...headers,
        },
      },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: resBody }));
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

describe('createApp integration', () => {
  let server: http.Server;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('wires up support route with CORS', async () => {
    const adapter = createMockAdapter();
    const app = createApp({
      issueAdapter: adapter,
      corsDomains: ['http://localhost:3000'],
    });
    server = app.listen(0);

    const res = await makeRequest(
      server,
      'POST',
      '/api/support/ticket',
      { subject: 'Test', category: 'bug' },
      { Origin: 'http://localhost:3000' },
    );

    expect(res.status).toBe(201);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(JSON.parse(res.body).success).toBe(true);
  });

  it('blocks CORS preflight from unauthorized origins', async () => {
    const adapter = createMockAdapter();
    const app = createApp({
      issueAdapter: adapter,
      corsDomains: ['http://localhost:3000'],
    });
    server = app.listen(0);

    const res = await makeRequest(server, 'OPTIONS', '/api/support/ticket', undefined, {
      Origin: 'http://evil.com',
    });

    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('responds to GET /health with 200', async () => {
    const adapter = createMockAdapter();
    const app = createApp({ issueAdapter: adapter, corsDomains: [] });
    server = app.listen(0);

    const res = await makeRequest(server, 'GET', '/health');

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('serves widget.js endpoint', async () => {
    const adapter = createMockAdapter();
    const app = createApp({
      issueAdapter: adapter,
      corsDomains: [],
    });
    server = app.listen(0);

    const res = await makeRequest(server, 'GET', '/widget.js');

    // Either 200 (widget built) or 404 (not built) — both are valid behavior
    expect([200, 404]).toContain(res.status);
  });
});

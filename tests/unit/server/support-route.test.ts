import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { IssueAdapter } from '../../../src/adapters/issues/types.js';
import { supportRouter } from '../../../src/server/routes/support.js';
import { errorHandler } from '../../../src/server/middleware/error-handler.js';

function createMockAdapter(overrides: Partial<IssueAdapter> = {}): IssueAdapter {
  return {
    initialize: vi.fn(),
    createIssue: vi.fn(),
    createQAFailureIssue: vi.fn(),
    createSupportTicketIssue: vi.fn().mockResolvedValue({
      url: 'https://github.com/owner/repo/issues/42',
      id: '12345',
      number: 42,
    }),
    getOpenIssueForTest: vi.fn(),
    addLabels: vi.fn(),
    validateLabels: vi.fn(),
    ...overrides,
  };
}

function makeRequest(
  server: http.Server,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/support/ticket',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
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
    req.write(data);
    req.end();
  });
}

describe('POST /api/support/ticket', () => {
  let server: http.Server;
  let mockAdapter: IssueAdapter;

  beforeEach(() => {
    mockAdapter = createMockAdapter();
    const app = express();
    app.use(express.json());
    app.use('/api/support', supportRouter({ issueAdapter: mockAdapter }));
    app.use(errorHandler);
    server = app.listen(0);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('creates a support ticket with valid payload', async () => {
    const res = await makeRequest(server, {
      subject: 'Login broken',
      category: 'bug',
      description: 'Cannot login with valid credentials',
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      issueUrl: 'https://github.com/owner/repo/issues/42',
      issueNumber: 42,
    });

    expect(mockAdapter.createSupportTicketIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'Login broken',
        category: 'bug',
        description: 'Cannot login with valid credentials',
      }),
    );
  });

  it('returns 400 for missing required fields', async () => {
    const res = await makeRequest(server, { description: 'no subject or category' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Validation error');
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('returns 500 when adapter throws', async () => {
    const failAdapter = createMockAdapter({
      createSupportTicketIssue: vi.fn().mockRejectedValue(new Error('GitHub API down')),
    });

    const app = express();
    app.use(express.json());
    app.use('/api/support', supportRouter({ issueAdapter: failAdapter }));
    app.use(errorHandler);
    const failServer = app.listen(0);

    try {
      const res = await makeRequest(failServer, {
        subject: 'Test',
        category: 'bug',
      });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('GitHub API down');
    } finally {
      await new Promise<void>((resolve) => failServer.close(() => resolve()));
    }
  });

  it('maps nested context to flat adapter opts', async () => {
    await makeRequest(server, {
      subject: 'UI glitch',
      category: 'bug',
      context: {
        userAgent: 'TestBrowser/1.0',
        pageUrl: 'https://example.com/dashboard',
        screenSize: '1920x1080',
        consoleErrors: ['TypeError: null is not an object'],
        customContext: { sessionId: 'abc123' },
      },
    });

    expect(mockAdapter.createSupportTicketIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: 'UI glitch',
        category: 'bug',
        userAgent: 'TestBrowser/1.0',
        pageUrl: 'https://example.com/dashboard',
        screenSize: '1920x1080',
        consoleErrors: 'TypeError: null is not an object',
        customContext: { sessionId: 'abc123' },
      }),
    );
  });
});

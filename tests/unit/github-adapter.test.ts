import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubIssueAdapter } from '../../src/adapters/issues/github.js';
import { DEFAULT_LABELS } from '../../src/shared/constants.js';

function mockResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(headers),
  } as Response;
}

describe('GitHubIssueAdapter', () => {
  describe('constructor', () => {
    it('should accept a valid owner/repo format', () => {
      expect(() => new GitHubIssueAdapter('owner/repo', 'token')).not.toThrow();
    });

    it('should reject invalid repo format', () => {
      expect(() => new GitHubIssueAdapter('invalid', 'token')).toThrow('Invalid repo format');
    });

    it('should reject empty repo', () => {
      expect(() => new GitHubIssueAdapter('', 'token')).toThrow();
    });

    it('should reject repo with only slash', () => {
      expect(() => new GitHubIssueAdapter('/', 'token')).toThrow();
    });
  });

  describe('with mocked fetch', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('initialize', () => {
      it('should validate credentials and call addLabels on success', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse(200, { full_name: 'owner/repo' }));
        for (const _label of DEFAULT_LABELS) {
          fetchMock.mockResolvedValueOnce(mockResponse(201));
        }

        const adapter = new GitHubIssueAdapter('owner/repo', 'ghp_test');
        await adapter.initialize();

        expect(fetchMock).toHaveBeenCalledTimes(1 + DEFAULT_LABELS.length);
        expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/owner/repo');
      });

      it('should throw on 401 with clear message', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse(401));

        const adapter = new GitHubIssueAdapter('owner/repo', 'bad-token');
        await expect(adapter.initialize()).rejects.toThrow('GitHub token is invalid');
      });

      it('should throw on 403 with clear message', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse(403));

        const adapter = new GitHubIssueAdapter('owner/repo', 'scoped-token');
        await expect(adapter.initialize()).rejects.toThrow(
          'GitHub token lacks required permissions',
        );
      });

      it('should throw on other non-ok status', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse(404));

        const adapter = new GitHubIssueAdapter('owner/repo', 'token');
        await expect(adapter.initialize()).rejects.toThrow('Failed to reach GitHub repo: 404');
      });
    });

    describe('validateLabels', () => {
      it('should return missing label names', async () => {
        fetchMock.mockResolvedValueOnce(
          mockResponse(200, [{ name: 'punchlist' }, { name: 'support' }]),
        );

        const adapter = new GitHubIssueAdapter('owner/repo', 'token');
        const missing = await adapter.validateLabels([
          { name: 'punchlist', color: '6f42c1', description: 'Tracked' },
          { name: 'qa:fail', color: 'e11d48', description: 'QA failure' },
          { name: 'support', color: '3b82f6', description: 'Support' },
        ]);

        expect(missing).toEqual(['qa:fail']);
      });

      it('should return empty array when all labels exist', async () => {
        fetchMock.mockResolvedValueOnce(
          mockResponse(200, [{ name: 'punchlist' }, { name: 'qa:fail' }]),
        );

        const adapter = new GitHubIssueAdapter('owner/repo', 'token');
        const missing = await adapter.validateLabels([
          { name: 'punchlist', color: '6f42c1', description: 'Tracked' },
          { name: 'qa:fail', color: 'e11d48', description: 'QA failure' },
        ]);

        expect(missing).toEqual([]);
      });
    });

    describe('addLabels', () => {
      it('should create labels via POST', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse(201));

        const adapter = new GitHubIssueAdapter('owner/repo', 'token');
        await adapter.addLabels([{ name: 'punchlist', color: '6f42c1', description: 'Tracked' }]);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, opts] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.github.com/repos/owner/repo/labels');
        expect(opts.method).toBe('POST');
        expect(JSON.parse(opts.body)).toEqual({
          name: 'punchlist',
          color: '6f42c1',
          description: 'Tracked',
        });
      });

      it('should handle 422 by PATCHing the existing label', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse(422));
        fetchMock.mockResolvedValueOnce(mockResponse(200));

        const adapter = new GitHubIssueAdapter('owner/repo', 'token');
        await adapter.addLabels([{ name: 'qa:fail', color: 'e11d48', description: 'QA failure' }]);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        const [patchUrl, patchOpts] = fetchMock.mock.calls[1];
        expect(patchUrl).toBe('https://api.github.com/repos/owner/repo/labels/qa%3Afail');
        expect(patchOpts.method).toBe('PATCH');
      });
    });

    describe('createQAFailureIssue', () => {
      it('should build correct title/body/labels and call createIssue', async () => {
        fetchMock.mockResolvedValueOnce(
          mockResponse(201, { html_url: 'https://github.com/o/r/issues/1', id: 1, number: 1 }),
        );

        const adapter = new GitHubIssueAdapter('owner/repo', 'token');
        const result = await adapter.createQAFailureIssue({
          testId: 'billing-001',
          testTitle: 'Subscribe to Pro plan',
          category: 'Billing',
          severity: 'broken',
          description: 'Payment form crashes.',
          testerName: 'Brad',
          testerEmail: 'brad@example.com',
        });

        expect(result.url).toBe('https://github.com/o/r/issues/1');
        expect(result.number).toBe(1);

        const [, opts] = fetchMock.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.title).toBe('[QA Failure] Subscribe to Pro plan (billing-001)');
        expect(body.labels).toEqual(['punchlist', 'qa:fail', 'broken']);
        expect(body.body).toContain('<!-- punchlist:testId=billing-001 -->');
        expect(body.body).toContain('Payment form crashes.');
      });
    });

    describe('createSupportTicketIssue', () => {
      it('should build correct title/body/labels', async () => {
        fetchMock.mockResolvedValueOnce(
          mockResponse(201, { html_url: 'https://github.com/o/r/issues/2', id: 2, number: 2 }),
        );

        const adapter = new GitHubIssueAdapter('owner/repo', 'token');
        const result = await adapter.createSupportTicketIssue({
          subject: 'Cannot log in',
          description: 'Getting 500 error.',
          category: 'bug',
        });

        expect(result.number).toBe(2);
        const [, opts] = fetchMock.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.title).toBe('[Support] Cannot log in');
        expect(body.labels).toEqual(['punchlist', 'support', 'bug']);
      });

      it('should omit category label when not provided', async () => {
        fetchMock.mockResolvedValueOnce(
          mockResponse(201, { html_url: 'https://github.com/o/r/issues/3', id: 3, number: 3 }),
        );

        const adapter = new GitHubIssueAdapter('owner/repo', 'token');
        await adapter.createSupportTicketIssue({
          subject: 'Question',
          description: 'How do I reset my password?',
        });

        const [, opts] = fetchMock.mock.calls[0];
        const body = JSON.parse(opts.body);
        expect(body.labels).toEqual(['punchlist', 'support']);
      });
    });

    describe('getOpenIssueForTest', () => {
      it('should return issue when found', async () => {
        fetchMock.mockResolvedValueOnce(
          mockResponse(200, {
            items: [
              {
                html_url: 'https://github.com/o/r/issues/5',
                number: 5,
                title: '[QA Failure] Login (auth-001)',
              },
            ],
          }),
        );

        const adapter = new GitHubIssueAdapter('owner/repo', 'token');
        const result = await adapter.getOpenIssueForTest('auth-001');

        expect(result).toEqual({
          url: 'https://github.com/o/r/issues/5',
          number: 5,
          title: '[QA Failure] Login (auth-001)',
        });

        // Verify the search query includes the test ID marker
        const url = fetchMock.mock.calls[0][0] as string;
        expect(url).toContain('punchlist%3AtestId%3Dauth-001');
      });

      it('should return null when no results', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse(200, { items: [] }));

        const adapter = new GitHubIssueAdapter('owner/repo', 'token');
        const result = await adapter.getOpenIssueForTest('missing-001');

        expect(result).toBeNull();
      });

      it('should return null on API error', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse(500));

        const adapter = new GitHubIssueAdapter('owner/repo', 'token');
        const result = await adapter.getOpenIssueForTest('test-001');

        expect(result).toBeNull();
      });

      it('should use cache on second call (fetch called only once)', async () => {
        fetchMock.mockResolvedValueOnce(
          mockResponse(200, {
            items: [
              {
                html_url: 'https://github.com/o/r/issues/5',
                number: 5,
                title: '[QA Failure] Login (auth-001)',
              },
            ],
          }),
        );

        const adapter = new GitHubIssueAdapter('owner/repo', 'token');
        const first = await adapter.getOpenIssueForTest('auth-001');
        const second = await adapter.getOpenIssueForTest('auth-001');

        expect(first).toEqual(second);
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });

      it('should cache null results too', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse(200, { items: [] }));

        const adapter = new GitHubIssueAdapter('owner/repo', 'token');
        const first = await adapter.getOpenIssueForTest('missing-001');
        const second = await adapter.getOpenIssueForTest('missing-001');

        expect(first).toBeNull();
        expect(second).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
    });

    describe('cache invalidation', () => {
      it('createQAFailureIssue should invalidate cache for that testId', async () => {
        // First: cache a search result
        fetchMock.mockResolvedValueOnce(mockResponse(200, { items: [] }));

        const adapter = new GitHubIssueAdapter('owner/repo', 'token');
        await adapter.getOpenIssueForTest('billing-001');
        expect(fetchMock).toHaveBeenCalledTimes(1);

        // Create QA failure issue — this should invalidate the cache
        fetchMock.mockResolvedValueOnce(
          mockResponse(201, { html_url: 'https://github.com/o/r/issues/10', id: 10, number: 10 }),
        );
        await adapter.createQAFailureIssue({
          testId: 'billing-001',
          testTitle: 'Subscribe',
          category: 'Billing',
          severity: 'broken',
          description: 'Fails.',
          testerName: 'Brad',
          testerEmail: 'brad@example.com',
        });

        // Now search again — should hit API, not cache
        fetchMock.mockResolvedValueOnce(
          mockResponse(200, {
            items: [
              {
                html_url: 'https://github.com/o/r/issues/10',
                number: 10,
                title: '[QA Failure] Subscribe (billing-001)',
              },
            ],
          }),
        );
        const result = await adapter.getOpenIssueForTest('billing-001');

        expect(result).not.toBeNull();
        expect(result!.number).toBe(10);
        // 1 (first search) + 1 (create issue) + 1 (second search) = 3
        expect(fetchMock).toHaveBeenCalledTimes(3);
      });
    });

    describe('auth error handling', () => {
      it('should throw on 401 for any request', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse(401));

        const adapter = new GitHubIssueAdapter('owner/repo', 'token');
        await expect(
          adapter.createIssue({ title: 'test', body: 'test', labels: [] }),
        ).rejects.toThrow('GitHub token is invalid');
      });

      it('should throw on 403 non-rate-limit for any request', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse(403));

        const adapter = new GitHubIssueAdapter('owner/repo', 'token');
        await expect(
          adapter.createIssue({ title: 'test', body: 'test', labels: [] }),
        ).rejects.toThrow('GitHub token lacks required permissions');
      });
    });

    describe('rate limit retry', () => {
      it('should retry on rate limit 403 then succeed', async () => {
        vi.useFakeTimers();
        try {
          const rateLimitRes = mockResponse(403, null, {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 1),
          });
          const successRes = mockResponse(201, {
            html_url: 'https://github.com/o/r/issues/1',
            id: 1,
            number: 1,
          });

          fetchMock.mockResolvedValueOnce(rateLimitRes);
          fetchMock.mockResolvedValueOnce(successRes);

          const adapter = new GitHubIssueAdapter('owner/repo', 'token');
          const promise = adapter.createIssue({ title: 'test', body: 'body', labels: [] });

          await vi.advanceTimersByTimeAsync(5000);
          const result = await promise;

          expect(result.number).toBe(1);
          expect(fetchMock).toHaveBeenCalledTimes(2);
        } finally {
          vi.useRealTimers();
        }
      });
    });
  });
});

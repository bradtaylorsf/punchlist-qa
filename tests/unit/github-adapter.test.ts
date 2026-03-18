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

  describe('initialize', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should validate credentials and call addLabels on success', async () => {
      // First call: repo metadata check
      fetchMock.mockResolvedValueOnce(mockResponse(200, { full_name: 'owner/repo' }));
      // Subsequent calls: addLabels creates labels (one per DEFAULT_LABELS)
      for (const _label of DEFAULT_LABELS) {
        fetchMock.mockResolvedValueOnce(mockResponse(201));
      }

      const adapter = new GitHubIssueAdapter('owner/repo', 'ghp_test');
      await adapter.initialize();

      // First call is the repo check
      expect(fetchMock).toHaveBeenCalledTimes(1 + DEFAULT_LABELS.length);
      expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/repos/owner/repo');
    });

    it('should throw on 401 with clear message', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(401));

      const adapter = new GitHubIssueAdapter('owner/repo', 'bad-token');
      await expect(adapter.initialize()).rejects.toThrow(
        'GitHub authentication failed (401)'
      );
    });

    it('should throw on 403 with clear message', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(403));

      const adapter = new GitHubIssueAdapter('owner/repo', 'scoped-token');
      await expect(adapter.initialize()).rejects.toThrow(
        'GitHub authentication failed (403)'
      );
    });

    it('should throw on other non-ok status', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(404));

      const adapter = new GitHubIssueAdapter('owner/repo', 'token');
      await expect(adapter.initialize()).rejects.toThrow('Failed to reach GitHub repo: 404');
    });
  });

  describe('validateLabels', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return missing label names', async () => {
      fetchMock.mockResolvedValueOnce(
        mockResponse(200, [{ name: 'punchlist' }, { name: 'support' }])
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
        mockResponse(200, [{ name: 'punchlist' }, { name: 'qa:fail' }])
      );

      const adapter = new GitHubIssueAdapter('owner/repo', 'token');
      const missing = await adapter.validateLabels([
        { name: 'punchlist', color: '6f42c1', description: 'Tracked' },
        { name: 'qa:fail', color: 'e11d48', description: 'QA failure' },
      ]);

      expect(missing).toEqual([]);
    });

    it('should throw on non-ok response', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(500));

      const adapter = new GitHubIssueAdapter('owner/repo', 'token');
      await expect(adapter.validateLabels([])).rejects.toThrow('Failed to fetch labels: 500');
    });
  });

  describe('addLabels', () => {
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should create labels via POST', async () => {
      fetchMock.mockResolvedValueOnce(mockResponse(201));

      const adapter = new GitHubIssueAdapter('owner/repo', 'token');
      await adapter.addLabels([
        { name: 'punchlist', color: '6f42c1', description: 'Tracked' },
      ]);

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
      // First POST returns 422 (label exists)
      fetchMock.mockResolvedValueOnce(mockResponse(422));
      // Then PATCH to update
      fetchMock.mockResolvedValueOnce(mockResponse(200));

      const adapter = new GitHubIssueAdapter('owner/repo', 'token');
      await adapter.addLabels([
        { name: 'qa:fail', color: 'e11d48', description: 'QA failure' },
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [patchUrl, patchOpts] = fetchMock.mock.calls[1];
      expect(patchUrl).toBe('https://api.github.com/repos/owner/repo/labels/qa%3Afail');
      expect(patchOpts.method).toBe('PATCH');
    });
  });
});

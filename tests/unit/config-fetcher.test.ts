import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConfigFetcher, ConfigFetcherError } from '../../src/shared/config-fetcher.js';

const validConfig = {
  projectName: 'test-project',
  issueTracker: { type: 'github', repo: 'owner/repo' },
  storage: { type: 'sqlite', path: './punchlist.db' },
  auth: { type: 'token' },
  widget: { position: 'bottom-right', theme: 'light', corsDomains: ['http://localhost:3000'] },
  aiTool: 'claude-code',
  categories: [],
  testCases: [],
  testers: [],
};

function encodeConfig(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64');
}

function mockFetchResponse(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
    json: () => Promise.resolve(body),
    headers: new Headers(headers),
  } as Response;
}

describe('ConfigFetcher', () => {
  const opts = { owner: 'test-owner', repo: 'test-repo', token: 'ghp_test123', ttlMs: 1000 };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('should fetch and parse a valid config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockFetchResponse(200, { content: encodeConfig(validConfig) })),
    );

    const fetcher = new ConfigFetcher(opts);
    const config = await fetcher.fetch();
    expect(config.projectName).toBe('test-project');
    expect(config.categories).toEqual([]);
  });

  it('should return cached config within TTL', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, { content: encodeConfig(validConfig) }));
    vi.stubGlobal('fetch', mockFetch);

    const fetcher = new ConfigFetcher(opts);
    await fetcher.fetch();
    await fetcher.fetch();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should refetch after TTL expires', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, { content: encodeConfig(validConfig) }));
    vi.stubGlobal('fetch', mockFetch);

    const fetcher = new ConfigFetcher(opts);
    await fetcher.fetch();
    vi.advanceTimersByTime(1001);
    await fetcher.fetch();
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should bypass cache with force=true', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(200, { content: encodeConfig(validConfig) }));
    vi.stubGlobal('fetch', mockFetch);

    const fetcher = new ConfigFetcher(opts);
    await fetcher.fetch();
    await fetcher.fetch(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should throw NOT_FOUND for 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse(404)));

    const fetcher = new ConfigFetcher(opts);
    await expect(fetcher.fetch()).rejects.toThrow(ConfigFetcherError);
    await expect(fetcher.fetch()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('should throw ACCESS_DENIED for 403 without rate-limit header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse(403)));

    const fetcher = new ConfigFetcher(opts);
    await expect(fetcher.fetch()).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });

  it('should throw RATE_LIMITED for 403 with x-ratelimit-remaining: 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(mockFetchResponse(403, undefined, { 'x-ratelimit-remaining': '0' })),
    );

    const fetcher = new ConfigFetcher(opts);
    await expect(fetcher.fetch()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('should throw RATE_LIMITED for 429', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse(429)));

    const fetcher = new ConfigFetcher(opts);
    await expect(fetcher.fetch()).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('should throw NETWORK_ERROR on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    const fetcher = new ConfigFetcher(opts);
    await expect(fetcher.fetch()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('should throw INVALID_CONFIG for invalid JSON response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.reject(new Error('bad json')),
      } as unknown as Response),
    );

    const fetcher = new ConfigFetcher(opts);
    await expect(fetcher.fetch()).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  });

  it('should throw INVALID_CONFIG when schema validation fails', async () => {
    const badConfig = { projectName: '' }; // Missing required fields
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockFetchResponse(200, { content: encodeConfig(badConfig) })),
    );

    const fetcher = new ConfigFetcher(opts);
    await expect(fetcher.fetch()).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  });

  it('should throw INVALID_CONFIG when content is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse(200, {})));

    const fetcher = new ConfigFetcher(opts);
    await expect(fetcher.fetch()).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
  });

  describe('getCached', () => {
    it('should return null when no cache exists', () => {
      const fetcher = new ConfigFetcher(opts);
      expect(fetcher.getCached()).toBeNull();
    });

    it('should return cached config within TTL', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(mockFetchResponse(200, { content: encodeConfig(validConfig) })),
      );

      const fetcher = new ConfigFetcher(opts);
      await fetcher.fetch();
      expect(fetcher.getCached()).not.toBeNull();
      expect(fetcher.getCached()!.projectName).toBe('test-project');
    });

    it('should return null after TTL expires', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(mockFetchResponse(200, { content: encodeConfig(validConfig) })),
      );

      const fetcher = new ConfigFetcher(opts);
      await fetcher.fetch();
      vi.advanceTimersByTime(1001);
      expect(fetcher.getCached()).toBeNull();
    });
  });

  describe('invalidate', () => {
    it('should clear the cache', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(mockFetchResponse(200, { content: encodeConfig(validConfig) })),
      );

      const fetcher = new ConfigFetcher(opts);
      await fetcher.fetch();
      expect(fetcher.getCached()).not.toBeNull();
      fetcher.invalidate();
      expect(fetcher.getCached()).toBeNull();
    });
  });
});

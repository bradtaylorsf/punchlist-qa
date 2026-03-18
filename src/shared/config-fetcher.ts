import { punchlistConfigSchema } from './schemas.js';
import type { PunchlistConfig } from './schemas.js';

export type ConfigFetcherErrorCode = 'NOT_FOUND' | 'RATE_LIMITED' | 'INVALID_CONFIG' | 'NETWORK_ERROR';

export class ConfigFetcherError extends Error {
  readonly code: ConfigFetcherErrorCode;

  constructor(message: string, code: ConfigFetcherErrorCode) {
    super(message);
    this.name = 'ConfigFetcherError';
    this.code = code;
  }
}

export interface ConfigFetcherOpts {
  owner: string;
  repo: string;
  token: string;
  branch?: string;
  ttlMs?: number;
}

interface CacheEntry {
  config: PunchlistConfig;
  fetchedAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class ConfigFetcher {
  private readonly owner: string;
  private readonly repo: string;
  private readonly token: string;
  private readonly branch: string;
  private readonly ttlMs: number;
  private cache: CacheEntry | null = null;

  constructor(opts: ConfigFetcherOpts) {
    this.owner = opts.owner;
    this.repo = opts.repo;
    this.token = opts.token;
    this.branch = opts.branch ?? 'main';
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  }

  async fetch(force = false): Promise<PunchlistConfig> {
    if (!force && this.cache) {
      const age = Date.now() - this.cache.fetchedAt;
      if (age < this.ttlMs) {
        return this.cache.config;
      }
    }

    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/punchlist.config.json?ref=${encodeURIComponent(this.branch)}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
    } catch (err) {
      throw new ConfigFetcherError(
        `Network error fetching config: ${err instanceof Error ? err.message : String(err)}`,
        'NETWORK_ERROR',
      );
    }

    if (res.status === 404) {
      throw new ConfigFetcherError(
        `Config not found: ${this.owner}/${this.repo}@${this.branch}`,
        'NOT_FOUND',
      );
    }

    // Note: 403 can also indicate insufficient token permissions, but we treat
    // it as rate-limited since that's the most common 403 cause with the GitHub API.
    // Callers can inspect the error message for more context.
    if (res.status === 403 || res.status === 429) {
      throw new ConfigFetcherError(
        `GitHub API rate limit or access denied (${res.status})`,
        'RATE_LIMITED',
      );
    }

    if (!res.ok) {
      throw new ConfigFetcherError(
        `GitHub API error: ${res.status} ${res.statusText}`,
        'NETWORK_ERROR',
      );
    }

    let body: { content?: string };
    try {
      body = await res.json() as { content?: string };
    } catch {
      throw new ConfigFetcherError('Invalid JSON response from GitHub API', 'INVALID_CONFIG');
    }

    if (!body.content) {
      throw new ConfigFetcherError('No content in GitHub API response', 'INVALID_CONFIG');
    }

    let rawConfig: unknown;
    try {
      const decoded = Buffer.from(body.content, 'base64').toString('utf-8');
      rawConfig = JSON.parse(decoded);
    } catch {
      throw new ConfigFetcherError('Failed to decode or parse config content', 'INVALID_CONFIG');
    }

    const result = punchlistConfigSchema.safeParse(rawConfig);
    if (!result.success) {
      const errors = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
      throw new ConfigFetcherError(`Invalid config: ${errors}`, 'INVALID_CONFIG');
    }

    this.cache = { config: result.data, fetchedAt: Date.now() };
    return result.data;
  }

  getCached(): PunchlistConfig | null {
    if (!this.cache) return null;
    const age = Date.now() - this.cache.fetchedAt;
    if (age >= this.ttlMs) return null;
    return this.cache.config;
  }

  invalidate(): void {
    this.cache = null;
  }
}

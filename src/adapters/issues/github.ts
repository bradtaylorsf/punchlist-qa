import type {
  IssueAdapter,
  CreateIssueOpts,
  CreatedIssue,
  OpenIssue,
  CreateQAFailureOpts,
  CreateSupportTicketOpts,
} from './types.js';
import { DEFAULT_LABELS } from '../../shared/constants.js';
import type { LabelDef } from '../../shared/constants.js';
import {
  formatQAFailureTitle,
  formatQAFailureBody,
  formatSupportTicketTitle,
  formatSupportTicketBody,
} from './format.js';
import { withRetry, isRateLimitError, getRetryAfterMs } from './retry.js';
import { TTLCache } from './cache.js';
import {
  createIssueResponseSchema,
  searchIssuesResponseSchema,
  labelResponseSchema,
} from './schemas.js';

export class RateLimitError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(`Rate limited. Retry after ${retryAfterMs}ms`);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class GitHubIssueAdapter implements IssueAdapter {
  private owner: string;
  private repo: string;
  private token: string;
  private issueCache = new TTLCache<OpenIssue | null>(5 * 60 * 1000);

  constructor(repoSlug: string, token: string) {
    const [owner, repo] = repoSlug.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repo format: ${repoSlug}. Expected "owner/repo".`);
    }
    this.owner = owner;
    this.repo = repo;
    this.token = token;
  }

  private async request(path: string, method: string, body?: unknown): Promise<Response> {
    const url = `https://api.github.com${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (res.status === 401) {
      throw new Error('GitHub token is invalid');
    }
    if (res.status === 403) {
      if (isRateLimitError(res)) {
        throw new RateLimitError(getRetryAfterMs(res));
      }
      throw new Error('GitHub token lacks required permissions');
    }

    return res;
  }

  private async requestWithRetry(path: string, method: string, body?: unknown): Promise<Response> {
    return withRetry(
      () => this.request(path, method, body),
      (error) => error instanceof RateLimitError,
      { maxRetries: 3, baseDelayMs: 1000 },
    );
  }

  async initialize(): Promise<void> {
    const res = await this.requestWithRetry(`/repos/${this.owner}/${this.repo}`, 'GET');
    if (!res.ok) {
      throw new Error(`Failed to reach GitHub repo: ${res.status}`);
    }
    await this.addLabels(DEFAULT_LABELS);
  }

  async createIssue(opts: CreateIssueOpts): Promise<CreatedIssue> {
    const res = await this.requestWithRetry(`/repos/${this.owner}/${this.repo}/issues`, 'POST', {
      title: opts.title,
      body: opts.body,
      labels: opts.labels,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to create issue: ${res.status} ${text}`);
    }

    const data = createIssueResponseSchema.parse(await res.json());
    return { url: data.html_url, id: String(data.id), number: data.number };
  }

  async createQAFailureIssue(opts: CreateQAFailureOpts): Promise<CreatedIssue> {
    const title = formatQAFailureTitle(opts.testId, opts.testTitle);
    const body = formatQAFailureBody(opts);
    const labels = ['punchlist', 'qa:fail', opts.severity];
    const result = await this.createIssue({ title, body, labels });
    this.issueCache.invalidate(opts.testId);
    return result;
  }

  async createSupportTicketIssue(opts: CreateSupportTicketOpts): Promise<CreatedIssue> {
    const title = formatSupportTicketTitle(opts.subject);
    const body = formatSupportTicketBody(opts);
    const labels = ['punchlist', 'support'];
    if (opts.category) labels.push(opts.category);
    return this.createIssue({ title, body, labels });
  }

  async getOpenIssueForTest(testId: string): Promise<OpenIssue | null> {
    const cached = this.issueCache.get(testId);
    if (cached !== undefined) return cached;

    const query = `repo:${this.owner}/${this.repo} is:issue is:open "punchlist:testId=${testId}" in:body`;
    const res = await this.requestWithRetry(
      `/search/issues?q=${encodeURIComponent(query)}&per_page=1`,
      'GET',
    );
    // Don't cache API errors — only cache successful lookups
    if (!res.ok) {
      console.warn(
        `[punchlist] getOpenIssueForTest: GitHub API returned ${res.status} for testId="${testId}". Check token permissions or rate limits.`,
      );
      return null;
    }
    const data = searchIssuesResponseSchema.parse(await res.json());
    const result =
      data.items.length === 0
        ? null
        : { url: data.items[0].html_url, number: data.items[0].number, title: data.items[0].title };
    this.issueCache.set(testId, result);
    return result;
  }

  async validateLabels(labels: LabelDef[]): Promise<string[]> {
    const perPage = 100;
    const existingNames = new Set<string>();
    let page = 1;

    const MAX_PAGES = 100;
    while (page <= MAX_PAGES) {
      const res = await this.requestWithRetry(
        `/repos/${this.owner}/${this.repo}/labels?per_page=${perPage}&page=${page}`,
        'GET',
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch labels: ${res.status}`);
      }
      const batch = labelResponseSchema.parse(await res.json());
      for (const label of batch) {
        existingNames.add(label.name);
      }
      // If the batch is smaller than perPage, we've reached the last page.
      if (batch.length < perPage) {
        break;
      }
      page++;
    }

    return labels.filter((l) => !existingNames.has(l.name)).map((l) => l.name);
  }

  async addLabels(labels: LabelDef[]): Promise<void> {
    for (const label of labels) {
      const res = await this.requestWithRetry(`/repos/${this.owner}/${this.repo}/labels`, 'POST', {
        name: label.name,
        color: label.color,
        description: label.description,
      });

      if (!res.ok) {
        const status = res.status;
        if (status === 422) {
          await this.requestWithRetry(
            `/repos/${this.owner}/${this.repo}/labels/${encodeURIComponent(label.name)}`,
            'PATCH',
            { color: label.color, description: label.description },
          );
        } else {
          const text = await res.text();
          console.warn(`Warning: Failed to create label "${label.name}": ${status} ${text}`);
        }
      }
    }
  }
}

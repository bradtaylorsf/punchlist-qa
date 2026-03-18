---
name: external-api-integration
description: API response validation, pagination, rate limiting, error classification, and cache invalidation
metadata:
  short-description: External API integration patterns
---

# External API Integration

Use this skill when integrating with external APIs (GitHub, Stripe, etc.).

## Use When

- "Validate this API response"
- "Handle pagination from an external API"
- "Implement rate limiting / backoff"
- "Classify errors from an external service"
- "Cache external API results"

## Response Validation

Always define Zod schemas for expected API response shapes. Parse responses through schemas at the boundary — never use `as` casts on untrusted data:

```typescript
import { z } from 'zod';

const GitHubIssueSchema = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  state: z.enum(['open', 'closed']),
  labels: z.array(z.object({ name: z.string() })),
});

type GitHubIssue = z.infer<typeof GitHubIssueSchema>;

// GOOD — parse at the boundary
const issue = GitHubIssueSchema.parse(responseBody);

// BAD — trusting external data
const issue = responseBody as GitHubIssue;
```

Handle parse failures distinctly from network/HTTP errors:

```typescript
try {
  const data = ResponseSchema.parse(body);
} catch (err) {
  if (err instanceof z.ZodError) {
    throw new ExternalApiError('Unexpected response shape', { cause: err });
  }
  throw err;
}
```

## Pagination

Never assume single-page results from list endpoints. Follow `Link` headers or compare count to `per_page`:

```typescript
async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ data: T[]; hasMore: boolean }>
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetchPage(page);
    results.push(...response.data);
    hasMore = response.hasMore;
    page++;
  }

  return results;
}

// GitHub-style Link header parsing
function hasNextPage(linkHeader: string | null): boolean {
  if (!linkHeader) return false;
  return linkHeader.includes('rel="next"');
}
```

## Rate Limiting

Read `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers. Implement exponential backoff with jitter:

```typescript
interface RateLimitInfo {
  remaining: number;
  resetAt: Date;
}

function parseRateLimitHeaders(headers: Headers): RateLimitInfo {
  return {
    remaining: Number(headers.get('X-RateLimit-Remaining') ?? Infinity),
    resetAt: new Date(Number(headers.get('X-RateLimit-Reset') ?? 0) * 1000),
  };
}

async function withBackoff<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; maxDelayMs?: number } = {}
): Promise<T> {
  const { maxRetries = 3, maxDelayMs = 30_000 } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      if (!(err instanceof RateLimitError)) throw err;

      const baseDelay = Math.min(1000 * 2 ** attempt, maxDelayMs);
      const jitter = baseDelay * (0.75 + Math.random() * 0.5); // 0.75-1.25 multiplier
      await new Promise((resolve) => setTimeout(resolve, jitter));
    }
  }

  throw new Error('Unreachable');
}
```

Distinguish 403-rate-limit from 403-access-denied using headers:

```typescript
function classifyForbidden(status: number, headers: Headers): Error {
  if (status === 403) {
    const remaining = Number(headers.get('X-RateLimit-Remaining') ?? -1);
    if (remaining === 0) {
      const resetMs = Number(headers.get('X-RateLimit-Reset') ?? 0) * 1000 - Date.now();
      return new RateLimitError('Rate limit exceeded', { retryAfterMs: Math.max(resetMs, 0) });
    }
    return new AccessDeniedError('Access denied');
  }
  throw new Error(`Expected 403 status, got ${status}`);
}
```

## Error Classification

Use typed error classes — never classify errors by string matching:

```typescript
export class ExternalApiError extends Error {
  constructor(
    message: string,
    public metadata: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'ExternalApiError';
  }
}

export class RateLimitError extends ExternalApiError {
  public retryAfterMs: number;
  constructor(message: string, opts: { retryAfterMs: number }) {
    super(message, { retryAfterMs: opts.retryAfterMs });
    this.retryAfterMs = opts.retryAfterMs;
  }
}

export class AccessDeniedError extends ExternalApiError {
  constructor(message = 'Access denied') {
    super(message);
    this.name = 'AccessDeniedError';
  }
}

export class NotFoundError extends ExternalApiError {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}
```

Carry metadata on errors (e.g., `retryAfterMs`) so callers can make informed retry decisions.

## Cache Invalidation

Invalidate relevant cache entries after mutations. Use bounded caches (maxSize) for long-running servers. TTL + maxSize prevents both stale data and memory leaks:

```typescript
interface CacheOptions {
  ttlMs: number;
  maxSize: number;
}

class BoundedCache<T> {
  private entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(private options: CacheOptions) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    // Evict oldest if at capacity
    if (this.entries.size >= this.options.maxSize) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + this.options.ttlMs });
  }

  invalidate(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
```

## Guardrails

- Never use `as` type assertions on external API responses — always parse with Zod
- Never assume single-page results from list endpoints
- Never classify errors by string matching — use typed error classes
- Always implement exponential backoff with jitter for retryable errors
- Always cap max backoff delay (30s default) to avoid unbounded waits
- Always invalidate cache after mutations
- Always use bounded caches with TTL + maxSize for long-running servers
- Never log sensitive tokens or API keys in error metadata

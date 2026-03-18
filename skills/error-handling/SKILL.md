---
name: error-handling
description: Custom error classes, middleware error handling, and structured logging
metadata:
  short-description: Error handling and logging patterns
---

# Error Handling & Logging

Use this skill when implementing error handling or adding logging.

## Use When

- "How should I handle this error?"
- "Add logging to this service"
- "Create a custom error class"
- "Why is this returning 500?"

## Custom Error Classes

Define in `src/utils/errors.ts`. Use them — don't create ad-hoc error responses:

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}
```

The global error handler middleware maps these to HTTP responses automatically.

## Controller Error Handling

Don't catch errors in controllers. Let the middleware handle them:

```typescript
// GOOD — throw and let middleware handle
export async function getTestCase(req: Request, res: Response) {
  const testCase = testCaseService.findById(req.params.id);
  if (!testCase) throw new NotFoundError(`Test case ${req.params.id} not found`);
  res.json({ data: testCase });
}

// BAD — manual catch blocks in every controller
try { ... } catch (error) { res.status(500).json({ error: 'Something went wrong' }); }
```

## Error Handler Middleware

```typescript
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, statusCode: err.statusCode }
    });
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.issues }
    });
  }

  // Unexpected errors
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error', statusCode: 500 }
  });
}
```

## Structured Logging

Use a structured logger (pino or winston), never `console.log` in production code:

```typescript
import { createLogger } from '../utils/logger';
const logger = createLogger('TestRoundService');

// GOOD — structured data
logger.info('Test round created', { roundId: round.id, testCaseCount: cases.length });

// BAD — string interpolation
logger.info(`Test round ${round.id} created with ${cases.length} cases`);
```

## Log Levels

- `error` — requires immediate attention (unhandled errors, data corruption)
- `warn` — potential problem (deprecated usage, retry needed)
- `info` — normal operations (round created, issue filed)
- `debug` — detailed debugging (query results, token validation)

## Use Typed Error Classes

Create specific error classes for distinct failure modes. Never use string matching to determine error handling behavior:

```typescript
// BAD — fragile string matching
try {
  await validateToken(token);
} catch (err) {
  if (err.message.includes('expired')) { ... }
  if (err.message.includes('revoked')) { ... }
}

// GOOD — typed error classes with instanceof
export class InvalidTokenError extends AppError {
  constructor(message = 'Invalid token') {
    super(message, 401, 'INVALID_TOKEN');
  }
}

export class RevokedUserError extends AppError {
  constructor(public readonly userId: string) {
    super('User has been revoked', 403, 'USER_REVOKED');
  }
}

export class RateLimitError extends AppError {
  constructor(public readonly retryAfterMs: number) {
    super('Rate limit exceeded', 429, 'RATE_LIMIT');
    this.retryAfterMs = retryAfterMs;
  }
}
```

Use `instanceof` checks in error handlers:

```typescript
try {
  await validateToken(token);
} catch (err) {
  if (err instanceof InvalidTokenError) {
    return res.status(401).json({ error: { code: 'INVALID_TOKEN' } });
  }
  if (err instanceof RevokedUserError) {
    logger.warn('Revoked user attempted access', { userId: err.userId });
    return res.status(403).json({ error: { code: 'USER_REVOKED' } });
  }
  if (err instanceof RateLimitError) {
    res.set('Retry-After', String(Math.ceil(err.retryAfterMs / 1000)));
    return res.status(429).json({ error: { code: 'RATE_LIMIT' } });
  }
  throw err; // Re-throw unexpected errors
}
```

Key points:
- Include relevant metadata on error classes (e.g., `retryAfterMs`, `userId`)
- Use `instanceof` checks — never `message.includes(...)` or string matching
- Each failure mode gets its own class for clear, type-safe handling

## Validate External API Responses

Treat API responses as untrusted system boundaries. Create Zod schemas for expected shapes and parse responses through them:

```typescript
import { z } from 'zod';

const GitHubIssueResponseSchema = z.object({
  id: z.number(),
  number: z.number(),
  html_url: z.string().url(),
  state: z.enum(['open', 'closed']),
  title: z.string(),
});

type GitHubIssueResponse = z.infer<typeof GitHubIssueResponseSchema>;

async function createGitHubIssue(data: IssueInput): Promise<GitHubIssueResponse> {
  const response = await fetch('https://api.github.com/repos/owner/repo/issues', {
    method: 'POST',
    body: JSON.stringify(data),
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new ExternalApiError(`GitHub API returned ${response.status}`);
  }

  const body = await response.json();

  // Parse at the boundary — don't trust the shape
  const result = GitHubIssueResponseSchema.safeParse(body);
  if (!result.success) {
    throw new ExternalApiError('Unexpected GitHub API response shape', {
      cause: result.error,
    });
  }

  return result.data;
}
```

Key points:
- An unexpected response shape is a different error than a network failure — handle them separately
- Use `.safeParse()` so you can log the Zod error details before throwing
- Never use `as` type assertions on API responses — they skip runtime validation
- Define small, focused schemas for each API response you consume

## Guardrails

- Never use `console.log` in production code — use structured logger
- Never catch errors in controllers — let middleware handle them
- Always log structured data, not string templates
- Never log sensitive data (tokens, passwords, secrets)
- Use existing error classes from `src/utils/errors.ts`
- Never use string matching on error messages — use typed error classes with `instanceof`
- Always validate external API responses with Zod — never use `as` casts

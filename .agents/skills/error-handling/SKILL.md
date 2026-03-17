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

## Guardrails

- Never use `console.log` in production code — use structured logger
- Never catch errors in controllers — let middleware handle them
- Always log structured data, not string templates
- Never log sensitive data (tokens, passwords, secrets)
- Use existing error classes from `src/utils/errors.ts`

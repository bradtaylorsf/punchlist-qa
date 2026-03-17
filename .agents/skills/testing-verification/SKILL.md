---
name: testing-verification
description: Test-before-done workflow, verification checklist, and testing patterns with Vitest
metadata:
  short-description: Testing and verification workflow
---

# Testing & Verification

Use this skill before marking any task as complete.

## Use When

- "Is this ready to merge?"
- "Write tests for this feature"
- "Verify this change works"
- "Run the test suite"

## Verification Checklist

Before marking any task done:

1. **Tests pass:** `pnpm test` — all existing tests still pass
2. **Type check:** `pnpm type-check` — no TypeScript errors
3. **Lint:** `pnpm lint` — no new lint errors
4. **New tests written:** cover the happy path and key error cases
5. **Manual verification:** confirm the feature works as expected
6. **Diff review:** review your own diff before creating the PR

## Testing Commands

```bash
pnpm test                     # Run all tests
pnpm test:unit                # Run unit tests with coverage
pnpm test:integration         # Run integration tests
pnpm test -- --run            # Run once (no watch)
pnpm test -- path/to/file     # Run specific test file
```

## Test File Conventions

- Unit tests: `tests/unit/<module>.test.ts`
- Integration tests: `tests/integration/<feature>.test.ts`
- Widget tests: `tests/widget/`
- CLI tests: `tests/cli/`
- Test setup: `tests/setup.ts`
- Test fixtures: `tests/fixtures/`

## Writing Tests

Use Vitest with `describe`/`it`/`expect`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('TestRoundService', () => {
  it('should create a test round with cases', () => {
    // Arrange, Act, Assert
  });

  it('should reject invalid test case IDs', () => {
    // Test error cases too
  });
});
```

## What to Test

- Happy path for new features
- Key error cases (invalid input, not found, unauthorized)
- Edge cases: empty arrays, missing optional fields, boundary values
- SQLite queries return expected results
- Auth middleware correctly validates/rejects tokens
- Widget message passing and event handling
- CLI config generation and validation
- Zod schemas validate and reject expected inputs correctly

## Integration Test Patterns

For API endpoints, test the full request/response cycle:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('POST /api/test-rounds', () => {
  it('should create a test round', async () => {
    const app = createApp({ db: testDb });
    const res = await request(app)
      .post('/api/test-rounds')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ name: 'Sprint 12 QA', testCaseIds: ['tc-1', 'tc-2'] });
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
  });
});
```

## Guardrails

- Never mark a task complete without running `pnpm test`
- Never skip tests to save time
- If tests are flaky, fix them — don't ignore them
- Comment on the GitHub issue if tests reveal unexpected behavior
- Always use `pnpm` to run tests — never `npm`

---
name: api-patterns
description: Express REST conventions, response format, Zod validation, HTTP status codes, controller patterns
metadata:
  short-description: API design and validation patterns
---

# API Patterns

Use this skill when creating or modifying API endpoints, controllers, or routes.

## Use When

- "Add a new endpoint"
- "What response format should I use?"
- "How should I validate this input?"
- "Create a controller for..."

## RESTful Naming

```
GET    /api/test-cases              # List test cases
GET    /api/test-cases/:id          # Get one test case
POST   /api/test-cases              # Create test case
PATCH  /api/test-cases/:id          # Update test case
DELETE /api/test-cases/:id          # Delete test case
GET    /api/test-rounds             # List test rounds
POST   /api/test-rounds             # Create test round
POST   /api/test-rounds/:id/results # Submit test result
GET    /api/issues                  # List filed issues
POST   /api/issues                  # File a new issue
POST   /api/widget/tickets          # Widget support ticket submission
POST   /api/auth/invite             # Generate invite link
POST   /api/auth/verify             # Verify invite token
```

Don't use verbs in URLs (`/getTestCases`). Don't add redundant suffixes (`/test-cases/list`).

## Response Format

Success:
```json
{
  "data": [],
  "meta": { "nextCursor": "...", "hasMore": true }
}
```

Error:
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Test case not found",
    "statusCode": 404
  }
}
```

## HTTP Status Codes

- `200` — Successful GET, PATCH
- `201` — Successful POST (created)
- `204` — Successful DELETE
- `400` — Validation error
- `401` — Not authenticated
- `403` — Authenticated but not authorized
- `404` — Resource not found
- `409` — Conflict / duplicate
- `422` — Semantic validation error
- `500` — Unexpected server error

## Zod Validation

Always validate request bodies with Zod:

```typescript
import { z } from 'zod';

const CreateTestCaseSchema = z.object({
  title: z.string().min(1).max(255),
  steps: z.array(z.string()).min(1),
  expectedResult: z.string().min(1),
  category: z.string().optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
});

// In controller
const validated = CreateTestCaseSchema.parse(req.body);
```

## Controller Pattern

Controllers handle HTTP concerns only. Don't catch errors — let middleware handle them:

```typescript
export async function createTestCase(req: Request, res: Response) {
  const data = CreateTestCaseSchema.parse(req.body);
  const result = await testCaseService.create(data);
  res.status(201).json({ data: result });
}
```

## Service Pattern

Services contain business logic:

```typescript
export class TestCaseService {
  constructor(private db: Database) {}

  async create(data: TestCaseInput): Promise<TestCase> {
    return await this.db.testCases.insert(data);
  }
}
```

## Guardrails

- Always validate input with Zod before processing
- Never catch errors in controllers — use errorHandler middleware
- Use cursor-based pagination for list endpoints
- Always return consistent response format (`data` + `meta`)
- Widget endpoints must validate CORS origin against allowlist

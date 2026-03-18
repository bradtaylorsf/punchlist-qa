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

## Validate External API Responses with Zod

Treat external API responses as untrusted system boundaries. Define small Zod schemas for expected response shapes and use `.parse()` instead of `as` type assertions:

```typescript
import { z } from 'zod';

// Define the expected shape
const GitHubIssueSchema = z.object({
  id: z.number(),
  number: z.number(),
  html_url: z.string().url(),
  state: z.enum(['open', 'closed']),
  title: z.string(),
});

// Parse at the boundary
async function fetchIssue(owner: string, repo: string, issueNumber: number) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    throw new ExternalApiError(`GitHub API returned ${response.status}`);
  }

  const body = await response.json();

  // GOOD — validates the shape at runtime
  return GitHubIssueSchema.parse(body);

  // BAD — silently accepts any shape
  // return body as GitHubIssue;
}
```

Key points:
- External APIs can change without notice — runtime validation catches shape mismatches early
- Use `.safeParse()` when you want to handle unexpected shapes gracefully instead of throwing
- Keep schemas small and focused on the fields you actually use

## Paginate List Endpoints

Never assume a single page of results from external APIs. Always check for additional pages and loop until all results are fetched:

```typescript
async function fetchAllOpenIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
  const allIssues: GitHubIssue[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=${perPage}&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      throw new ExternalApiError(`GitHub API returned ${response.status}`);
    }

    const issues = z.array(GitHubIssueSchema).parse(await response.json());
    allIssues.push(...issues);

    // Stop when we get fewer results than requested
    if (issues.length < perPage) break;

    // Alternative: check the Link header for a "next" rel
    const linkHeader = response.headers.get('Link');
    if (!linkHeader?.includes('rel="next"')) break;

    page++;
  }

  return allIssues;
}
```

Key points:
- Check `Link` headers or compare result count to `per_page` to detect more pages
- Set a reasonable `per_page` (e.g., 100) to minimize round-trips
- Validate each page of results through Zod before accumulating
- Consider adding a maximum page limit as a safety guard against infinite loops

## Guardrails

- Always validate input with Zod before processing
- Never catch errors in controllers — use errorHandler middleware
- Use cursor-based pagination for list endpoints
- Always return consistent response format (`data` + `meta`)
- Widget endpoints must validate CORS origin against allowlist
- Always validate external API responses with Zod — never use `as` casts
- Always paginate when consuming list endpoints from external APIs

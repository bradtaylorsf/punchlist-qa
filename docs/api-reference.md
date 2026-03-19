# API Reference

Base URL: `http://localhost:4747` (configurable via `PORT` and `HOST` env vars)

All responses use the format `{ success: boolean, data?: T, error?: string }`.

## Authentication

Protected endpoints require a valid session cookie (`punchlist_session`). Sessions are created via `POST /api/auth/login` with an invite token.

**Cookie attributes:** `HttpOnly`, `SameSite=Lax`, `Secure` (production), `Path=/`, 7-day TTL.

Unauthenticated requests to protected endpoints receive:

```json
{ "success": false, "error": "Authentication required" }
```

**Status:** `401 Unauthorized`

---

## Public Endpoints

### GET /health

Health check. No auth, no CORS.

**Response (200):**

```json
{ "status": "ok", "timestamp": "2026-03-18T12:00:00.000Z" }
```

```bash
curl http://localhost:4747/health
```

---

### POST /api/auth/login

Authenticate with an invite token and create a session.

**Request:**

```json
{ "token": "string (required)" }
```

**Response (200):**

```json
{ "success": true }
```

Sets `punchlist_session` cookie.

**Errors:** `401` invalid token, `403` user revoked.

```bash
curl -X POST http://localhost:4747/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"token":"your-invite-token"}' \
  -c cookies.txt
```

---

### POST /api/auth/logout

Destroy session and clear cookie. Idempotent — works with or without a valid session.

**Response (200):**

```json
{ "success": true }
```

```bash
curl -X POST http://localhost:4747/api/auth/logout -b cookies.txt
```

---

### POST /api/support/ticket

Create a support ticket from the widget. Subject to CORS validation.

**Request:**

```json
{
  "subject": "string (required, max 200)",
  "category": "string (required)",
  "description": "string (optional, max 5000)",
  "userName": "string (optional, max 100)",
  "userEmail": "string (optional, valid email)",
  "context": {
    "userAgent": "string (optional)",
    "pageUrl": "string (optional)",
    "screenSize": "string (optional)",
    "viewportSize": "string (optional)",
    "consoleErrors": ["string[] (optional, max 10)"],
    "lastError": "string (optional)",
    "timestamp": "string (optional)",
    "timezone": "string (optional)",
    "customContext": { "key": "value" }
  }
}
```

**Response (201):**

```json
{
  "success": true,
  "issueUrl": "https://github.com/owner/repo/issues/42",
  "issueNumber": 42
}
```

**Errors:** `400` validation error, `500` issue creation failed.

```bash
curl -X POST http://localhost:4747/api/support/ticket \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:3000' \
  -d '{"subject":"Login broken","category":"bug","description":"Cannot log in"}'
```

---

### GET /widget.js

Serve the bundled widget JavaScript. Returns `application/javascript` with `Access-Control-Allow-Origin: *`.

```bash
curl http://localhost:4747/widget.js
```

---

## Protected Endpoints

All endpoints below require a valid `punchlist_session` cookie.

### GET /api/users/me

Get the current user's profile.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "alice@example.com",
    "name": "Alice Smith",
    "role": "tester"
  }
}
```

```bash
curl http://localhost:4747/api/users/me -b cookies.txt
```

---

### GET /api/config

Get project configuration (test cases and categories).

**Response (200):**

```json
{
  "success": true,
  "data": {
    "projectName": "my-project",
    "testCases": [
      {
        "id": "auth-001",
        "title": "User can log in",
        "category": "auth",
        "priority": "high",
        "instructions": "...",
        "expectedResult": "..."
      }
    ],
    "categories": [
      { "id": "auth", "label": "Authentication" }
    ]
  }
}
```

```bash
curl http://localhost:4747/api/config -b cookies.txt
```

---

### GET /api/commit

Get the current git commit SHA. Cached for 30 seconds.

**Response (200):**

```json
{
  "success": true,
  "data": { "sha": "abc123def456..." }
}
```

```bash
curl http://localhost:4747/api/commit -b cookies.txt
```

---

### GET /api/rounds

List all test rounds.

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Sprint 1 QA",
      "description": "End of sprint testing",
      "status": "active",
      "createdByEmail": "bob@example.com",
      "createdByName": "Bob Admin",
      "createdAt": "2026-03-18T12:00:00.000Z",
      "completedAt": null
    }
  ]
}
```

```bash
curl http://localhost:4747/api/rounds -b cookies.txt
```

---

### POST /api/rounds

Create a new test round.

**Request:**

```json
{
  "name": "string (required)",
  "description": "string (optional)"
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Sprint 2 QA",
    "description": null,
    "status": "active",
    "createdByEmail": "bob@example.com",
    "createdByName": "Bob Admin",
    "createdAt": "2026-03-18T12:00:00.000Z",
    "completedAt": null
  }
}
```

```bash
curl -X POST http://localhost:4747/api/rounds \
  -H 'Content-Type: application/json' \
  -b cookies.txt \
  -d '{"name":"Sprint 2 QA","description":"Release candidate testing"}'
```

---

### PUT /api/rounds/:id

Update a test round. Partial update — only provided fields are changed.

**Request:**

```json
{
  "name": "string (optional)",
  "description": "string | null (optional)",
  "status": "active | completed | archived (optional)",
  "completedAt": "ISO 8601 string | null (optional)"
}
```

**Response (200):** Updated round object (same shape as POST response).

```bash
curl -X PUT http://localhost:4747/api/rounds/round-uuid \
  -H 'Content-Type: application/json' \
  -b cookies.txt \
  -d '{"status":"completed","completedAt":"2026-03-18T18:00:00.000Z"}'
```

---

### GET /api/rounds/:roundId/results

List test results for a round.

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "roundId": "uuid",
      "testId": "auth-001",
      "status": "fail",
      "testerName": "Alice Smith",
      "testerEmail": "alice@example.com",
      "description": "Login button unresponsive",
      "severity": "blocker",
      "commitHash": "abc123",
      "issueUrl": "https://github.com/owner/repo/issues/42",
      "issueNumber": 42,
      "createdAt": "2026-03-18T14:00:00.000Z",
      "updatedAt": "2026-03-18T14:00:00.000Z"
    }
  ]
}
```

```bash
curl http://localhost:4747/api/rounds/round-uuid/results -b cookies.txt
```

---

### POST /api/rounds/:roundId/results

Submit a test result. Tester info is auto-populated from the session.

**Request:**

```json
{
  "testId": "string (required, e.g. auth-001)",
  "status": "pass | fail | skip | blocked (required)",
  "description": "string (optional)",
  "severity": "minor | broken | blocker (optional)",
  "commitHash": "string (optional)"
}
```

**Response (201):** Created result object.

```bash
curl -X POST http://localhost:4747/api/rounds/round-uuid/results \
  -H 'Content-Type: application/json' \
  -b cookies.txt \
  -d '{"testId":"auth-001","status":"fail","description":"Button unresponsive","severity":"blocker"}'
```

---

### DELETE /api/rounds/:roundId/results/:testId

Delete a test result. Idempotent — returns `deleted: 0` if not found.

**Response (200):**

```json
{ "success": true, "deleted": 1 }
```

```bash
curl -X DELETE http://localhost:4747/api/rounds/round-uuid/results/auth-001 -b cookies.txt
```

---

### POST /api/issues

Create a QA failure issue in the issue tracker.

**Request:**

```json
{
  "testId": "string (required, e.g. auth-001)",
  "testTitle": "string (required)",
  "category": "string (required)",
  "severity": "minor | broken | blocker (required)",
  "description": "string (required)",
  "testerName": "string (required)",
  "testerEmail": "string (required, valid email)",
  "commitHash": "string (optional)",
  "roundName": "string (optional)"
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "url": "https://github.com/owner/repo/issues/43",
    "number": 43,
    "title": "[QA FAIL] auth-001: User can log in"
  }
}
```

```bash
curl -X POST http://localhost:4747/api/issues \
  -H 'Content-Type: application/json' \
  -b cookies.txt \
  -d '{"testId":"auth-001","testTitle":"User can log in","category":"auth","severity":"blocker","description":"Button unresponsive","testerName":"Alice","testerEmail":"alice@example.com"}'
```

---

### GET /api/issues/open/:testId

Get the open issue for a test case, if any.

**Response (200):**

```json
{
  "success": true,
  "data": {
    "url": "https://github.com/owner/repo/issues/43",
    "number": 43,
    "title": "[QA FAIL] auth-001: User can log in"
  }
}
```

Returns `"data": null` if no open issue exists.

```bash
curl http://localhost:4747/api/issues/open/auth-001 -b cookies.txt
```

---

## Error Responses

### Validation Error (400)

```json
{
  "success": false,
  "error": "Validation error",
  "details": [
    { "path": "subject", "message": "Required" },
    { "path": "category", "message": "String must contain at least 1 character(s)" }
  ]
}
```

### Server Error (500)

```json
{
  "success": false,
  "error": "Error description"
}
```

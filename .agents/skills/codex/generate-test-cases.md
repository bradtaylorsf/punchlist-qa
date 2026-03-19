<!-- punchlist-skill-version: 1.0.0 -->

# Generate Test Cases for Punchlist QA

## Purpose

Analyze the project codebase and generate structured QA test cases for the Punchlist QA testing framework. Test cases are written to `punchlist.config.json` and must conform to the exact schema defined below.

## Config Format

### Category

```json
{
  "id": "auth",
  "label": "Authentication",
  "description": "Login, logout, and session management"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Short kebab-case identifier (e.g. `auth`, `billing`, `user-settings`) |
| `label` | string | yes | Human-readable name |
| `description` | string | no | Brief description of what this category covers |

### Test Case

```json
{
  "id": "auth-001",
  "title": "Login with valid credentials",
  "category": "auth",
  "priority": "high",
  "instructions": "Open the login page. Enter a valid email and password. Click the Sign In button.",
  "expectedResult": "User is redirected to the dashboard and their name appears in the top-right corner."
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Must match regex `^[a-z][a-z0-9-]*-\d{3}$` (e.g. `auth-001`, `user-settings-012`) |
| `title` | string | yes | Short description of what is being tested |
| `category` | string | yes | Must reference a valid category `id` |
| `priority` | enum | yes | `high`, `medium`, or `low` |
| `instructions` | string | yes | Step-by-step instructions for the tester |
| `expectedResult` | string | yes | What the tester should observe when the test passes |

### ID Rules

- Pattern: `^[a-z][a-z0-9-]*-\d{3}$`
- The prefix (everything before the final `-NNN`) **must** match the `category` field
- Examples: `auth-001` (category: `auth`), `user-settings-003` (category: `user-settings`)
- IDs must be unique across all test cases
- Number sequentially within each category: `auth-001`, `auth-002`, `auth-003`

## What to Look For

Explore the codebase and identify features in these areas:

- **Routes and pages** — each route is likely a testable feature
- **Forms** — submission, validation, error states
- **Authentication flows** — login, logout, signup, password reset, session expiry
- **CRUD operations** — create, read, update, delete for each entity
- **Payment/billing flows** — checkout, subscription management, invoices
- **Settings and preferences** — user profile, notification settings, theme
- **Error states** — 404 pages, network failures, invalid input handling
- **Permissions and roles** — what different user types can and cannot do

## Validation Rules

Before writing to the config, verify:

1. No duplicate category IDs
2. No duplicate test case IDs
3. Every test case `category` references an existing category `id`
4. Every test case `id` prefix matches its `category` field
5. Every `priority` is one of: `high`, `medium`, `low`

## Priority Guidance

| Priority | When to use |
|----------|-------------|
| `high` | Authentication, payments, data loss scenarios, security-sensitive features |
| `medium` | Core feature CRUD, main user workflows, navigation |
| `low` | Nice-to-have features, cosmetic behavior, edge cases unlikely to affect users |

## Workflow

1. **Read the project** — examine `punchlist.config.json` for existing categories and test cases, then explore the codebase
2. **Identify features** — list all user-facing features grouped by area
3. **Create categories** — one category per feature area (don't over-segment)
4. **Generate test cases** — write test cases for each category, starting with high-priority items
5. **Validate** — run all validation rules above
6. **Present for review** — show the generated categories and test cases to the user before writing
7. **Write to config** — add to the `categories` and `testCases` arrays in `punchlist.config.json`

## Guardrails

- **Instructions must be non-technical.** Write for a QA tester who does not read code. Say "Click the Sign In button" not "POST to /api/auth/login".
- **Expected results must be specific and verifiable.** Say "User sees a green success banner with the text 'Profile updated'" not "It works".
- **One behavior per test case.** If you're testing login AND redirect, split into two test cases.
- **Don't test implementation details.** Test what the user sees and does, not internal state or database values.
- **Keep instructions reproducible.** Include setup steps if the test requires specific preconditions.

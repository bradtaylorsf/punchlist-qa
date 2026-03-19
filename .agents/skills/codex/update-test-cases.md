<!-- punchlist-skill-version: 1.0.0 -->

# Update Test Cases for Punchlist QA

## Purpose

Detect new or changed features in the codebase and propose test case additions to `punchlist.config.json`. This skill appends new test cases — it never modifies or removes existing ones.

---

## CRITICAL RULE

> **NEVER change existing test case IDs.**
>
> Changing an ID orphans all historical test results in the database. There is no migration path — the link between the old ID and its results is permanently broken. Treat existing IDs as immutable.

---

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
| `id` | string | yes | Short kebab-case identifier |
| `label` | string | yes | Human-readable name |
| `description` | string | no | Brief description of what this category covers |

### Test Case

```json
{
  "id": "auth-004",
  "title": "Login rate limiting after failed attempts",
  "category": "auth",
  "priority": "high",
  "instructions": "Open the login page. Enter an incorrect password five times in a row.",
  "expectedResult": "After the fifth attempt, user sees a message: 'Too many attempts. Try again in 5 minutes.'"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | string | yes | Must match regex `^[a-z][a-z0-9-]*-\d{3}$` |
| `title` | string | yes | Short description of what is being tested |
| `category` | string | yes | Must reference a valid category `id` |
| `priority` | enum | yes | `high`, `medium`, or `low` |
| `instructions` | string | yes | Step-by-step instructions for the tester |
| `expectedResult` | string | yes | What the tester should observe when the test passes |

### ID Rules

- Pattern: `^[a-z][a-z0-9-]*-\d{3}$`
- The prefix (everything before the final `-NNN`) **must** match the `category` field
- **New IDs use the next number after the highest existing ID in that category.** If `auth-003` exists, the next is `auth-004`.
- IDs must be unique across all test cases

## Workflow

1. **Read current config** — load `punchlist.config.json` and catalog all existing categories and test cases
2. **Detect changes** — run `git log --oneline -20` and `git diff main...HEAD` (or relevant comparison) to identify recent code changes
3. **Identify uncovered features** — compare changed/new code against existing test cases to find gaps
4. **Propose new test cases** — write test cases for uncovered features, following the ID incrementing rules
5. **Validate** — ensure no ID collisions, all category references are valid, all ID prefixes match their category
6. **Present diff** — show the user exactly what will be added (new categories and test cases) before writing
7. **Write on approval** — append to the `categories` and `testCases` arrays in `punchlist.config.json`

## Trigger Scenarios

- After a feature branch is merged to main
- Before starting a new QA round
- On-demand when a user asks to update test coverage

## Guardrails

- **Append-only for IDs** — never rename, renumber, or remove existing test case IDs
- **Preserve all existing tests** — even if a feature was removed, keep the test case (it may be re-added or is needed for historical tracking)
- **Add new categories only for genuinely new feature areas** — don't create a category for one test case if it fits an existing category
- **Instructions must be non-technical** — write for a QA tester, not a developer
- **Expected results must be specific and verifiable** — describe what the tester will see
- **One behavior per test case** — split complex scenarios into multiple test cases

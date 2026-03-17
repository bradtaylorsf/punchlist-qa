---
name: database-patterns
description: SQLite queries, migrations, parameterized SQL, and better-sqlite3 patterns
metadata:
  short-description: SQLite database patterns
---

# Database Patterns

Use this skill when writing database queries, creating migrations, or working with the storage layer.

## Use When

- "Write a query for test rounds"
- "Add a new migration"
- "How should I store test results?"
- "Add a new column to test_cases"

## SQLite with better-sqlite3

This project uses SQLite via `better-sqlite3` for zero-infrastructure storage. The database lives at `.punchlist/punchlist.db`.

```typescript
import Database from 'better-sqlite3';

const db = new Database('.punchlist/punchlist.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
```

## Parameterized Queries (Mandatory)

Never use string interpolation in SQL:

```typescript
// NEVER — SQL injection
const stmt = db.prepare(`SELECT * FROM test_cases WHERE id = '${id}'`);

// ALWAYS — parameterized
const stmt = db.prepare('SELECT * FROM test_cases WHERE id = ?');
const row = stmt.get(id);
```

## Named Parameters

Use named parameters for readability in complex queries:

```typescript
const stmt = db.prepare(`
  INSERT INTO test_results (id, test_round_id, test_case_id, tester_id, status, notes)
  VALUES (@id, @testRoundId, @testCaseId, @testerId, @status, @notes)
`);
stmt.run({ id, testRoundId, testCaseId, testerId, status, notes });
```

## Transactions

Use for multi-step operations:

```typescript
const insertResults = db.transaction((results: TestResult[]) => {
  const stmt = db.prepare(`
    INSERT INTO test_results (id, test_round_id, test_case_id, status, notes)
    VALUES (@id, @testRoundId, @testCaseId, @status, @notes)
  `);
  for (const result of results) {
    stmt.run(result);
  }
});

insertResults(results); // Atomic — all or nothing
```

## Migrations

Migrations live in `src/db/migrations/` and run sequentially:

```
src/db/migrations/
  001_create_test_cases.sql
  002_create_test_rounds.sql
  003_create_test_results.sql
  004_create_testers.sql
  005_create_issues.sql
```

Migration runner applies them in order and tracks which have been applied in a `_migrations` table.

## Core Tables

```sql
-- Test cases defined in config or via API
test_cases (id, title, steps, expected_result, category, priority, created_at)

-- A test round groups test cases for a session
test_rounds (id, name, commit_sha, created_by, created_at, completed_at)

-- Individual test results within a round
test_results (id, test_round_id, test_case_id, tester_id, status, notes, created_at)

-- Invited testers
testers (id, name, email, role, invite_token, created_at)

-- Filed issues (linked to GitHub Issues)
issues (id, test_result_id, external_id, external_url, title, body, status, created_at)
```

## Query Patterns

List with pagination:
```typescript
const stmt = db.prepare(`
  SELECT * FROM test_cases
  WHERE created_at < ?
  ORDER BY created_at DESC
  LIMIT ?
`);
const rows = stmt.all(cursor, limit + 1);
const hasMore = rows.length > limit;
const data = hasMore ? rows.slice(0, -1) : rows;
```

## Guardrails

- Never use string concatenation for SQL — always parameterized
- Always use transactions for multi-step writes
- Always enable WAL mode and foreign keys
- Use cursor-based pagination, never OFFSET
- Store the database in `.punchlist/` directory
- Run migrations on startup automatically

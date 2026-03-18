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

## Validate Rows at the Boundary

Database results are a system boundary — treat them like external input. Never use `as` type casts on query results; validate with Zod instead:

```typescript
// BAD — bypasses runtime validation
const round = stmt.get(id) as TestRound;

// GOOD — validates at the boundary
const row = stmt.get(id);
if (!row) throw new NotFoundError(`Round ${id} not found`);
const round = roundSchema.parse({ id: row.id, status: row.status, createdAt: row.created_at });
```

Create row mapper functions that parse through domain schemas:

```typescript
function toTestRound(row: unknown): TestRound {
  return roundSchema.parse(row);
}

const rounds = stmt.all(projectId).map(toTestRound);
```

Use `.safeParse()` when you want to handle invalid rows without throwing:

```typescript
const result = roundSchema.safeParse(row);
if (!result.success) {
  logger.warn('Invalid row in test_rounds', { rowId: row.id, errors: result.error.issues });
  return null;
}
return result.data;
```

## Batch Large IN Clauses

SQLite has a default `SQLITE_MAX_VARIABLE_NUMBER` limit (typically 999). When building `IN (?)` clauses with user-provided arrays, chunk them into batches:

```typescript
const BATCH_SIZE = 900; // Stay under the 999 limit

function batchDelete(db: Database, ids: string[]): number {
  let totalChanges = 0;

  const deleteBatch = db.transaction((batch: string[]) => {
    const placeholders = batch.map(() => '?').join(', ');
    const stmt = db.prepare(`DELETE FROM test_cases WHERE id IN (${placeholders})`);
    const result = stmt.run(...batch);
    totalChanges += result.changes;
  });

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    deleteBatch(batch);
  }

  return totalChanges;
}
```

Key points:
- Chunk arrays into batches of ~900 to stay under the 999 variable limit
- Sum `result.changes` across batches when returning affected row counts
- Wrap each batch in a transaction for atomicity
- This applies to any `IN (?)` clause — selects, updates, and deletes

## Guardrails

- Never use string concatenation for SQL — always parameterized
- Always use transactions for multi-step writes
- Always enable WAL mode and foreign keys
- Use cursor-based pagination, never OFFSET
- Store the database in `.punchlist/` directory
- Run migrations on startup automatically
- Always validate database rows through Zod schemas — never use `as` casts
- Batch large `IN` clauses to stay under SQLite's variable limit

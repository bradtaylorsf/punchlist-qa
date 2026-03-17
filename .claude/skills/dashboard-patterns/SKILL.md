---
name: dashboard-patterns
description: QA dashboard — Express + React + Tailwind, test rounds, tester management, issue filing
metadata:
  short-description: QA dashboard development patterns
---

# QA Dashboard Patterns

Use this skill when building or modifying the QA dashboard application.

## Use When

- "Add a page to the dashboard"
- "How do test rounds work?"
- "Create a component for test results"
- "How does the dashboard file GitHub Issues?"

## Architecture

The QA dashboard is a standalone **Express + React** application deployed to its own subdomain (e.g., `qa.yourapp.com`). It owns the full page — no embedding concerns.

- **Server:** Express with API routes + serves the React SPA
- **Client:** React with Tailwind CSS
- **Storage:** SQLite via better-sqlite3
- **Auth:** Token-based JWT invite links

## Directory Structure

```
src/
  server/
    routes/          # Express route handlers
    middleware/       # Auth, error handling, CORS
    services/        # Business logic
    db/              # SQLite connection, migrations
  client/
    pages/           # Route-level React components
    components/      # Reusable UI components
    hooks/           # Custom React hooks
    lib/             # Client utilities
  shared/
    types.ts         # Shared TypeScript types
    schemas.ts       # Shared Zod schemas
```

## Core Features

### Test Rounds
A test round groups test cases for a testing session. Testers work through each case and record pass/fail/skip:

```typescript
interface TestRound {
  id: string;
  name: string;
  commitSha: string;         // Git commit being tested
  createdBy: string;         // Tester who created the round
  createdAt: string;
  completedAt: string | null;
}
```

### Test Results
Each result records a tester's verdict on a single test case within a round:

```typescript
interface TestResult {
  id: string;
  testRoundId: string;
  testCaseId: string;
  testerId: string;
  status: 'pass' | 'fail' | 'skip';
  notes: string;
  createdAt: string;
}
```

### Auto-File Issues
When a test fails, the dashboard can auto-file a GitHub Issue with:
- Test case title and steps
- Tester notes
- Commit SHA being tested
- Link back to the dashboard test round

## Tailwind Conventions

- Use Tailwind utility classes directly in JSX
- Don't create custom CSS files unless absolutely necessary
- Use `cn()` (clsx + tailwind-merge) for conditional classes
- Follow a consistent color scheme via Tailwind config

## Component Patterns

```tsx
// Page component
export function TestRoundsPage() {
  const { data: rounds } = useTestRounds();
  return (
    <PageLayout title="Test Rounds">
      <TestRoundList rounds={rounds} />
    </PageLayout>
  );
}

// Reusable component
interface TestResultBadgeProps {
  status: 'pass' | 'fail' | 'skip';
}
export function TestResultBadge({ status }: TestResultBadgeProps) {
  const colors = {
    pass: 'bg-green-100 text-green-800',
    fail: 'bg-red-100 text-red-800',
    skip: 'bg-gray-100 text-gray-800',
  };
  return <span className={cn('px-2 py-1 rounded text-sm font-medium', colors[status])}>{status}</span>;
}
```

## Guardrails

- Always use Tailwind for styling — no custom CSS unless necessary
- Always validate API responses on the client
- Always handle loading and error states in components
- Use TypeScript strict mode for all client code
- Keep components small and focused — one responsibility per component
- Test round data must include the commit SHA for traceability

# AGENTS.md

This file is the operational guide for AI coding agents working in `punchlist-qa`.
It is focused on workflow and behavior, not codebase specifics — explore the code to learn those.

## North Star

GitHub Issue #1 is the North Star for this project. It defines the full vision, architecture decisions, and all epics.
Before starting any work, read Issue #1 to understand the big picture. Every task should trace back to one of the epics defined there.

## Single Source of Truth

- Canonical agent doc: `AGENTS.md`
- Canonical skills directory: `skills/`
- Mirrored targets:
  - `CLAUDE.md`
  - `.agents/skills/` (Codex repo skills path)
  - `.claude/skills/` (Claude project skills path)

Sync command: `scripts/sync-agent-assets.sh`
Check-only: `scripts/sync-agent-assets.sh --check`

**Rule:** Always edit `AGENTS.md` and `skills/`. Never directly edit mirrors — they are generated.

---

## GitHub Issue Workflow

**Every task must be tracked in a GitHub issue.** This is non-negotiable.

### Issue Lifecycle

1. **Start with an issue.** Before writing code, ensure a GitHub issue exists. Create one if none exists.
2. **Trace to an epic.** Every issue should reference which epic from Issue #1 it belongs to.
3. **Explore first.** Read the current codebase state before planning. Code may have changed since the issue was created.
4. **Post your plan.** Comment on the issue with your approach before coding.
5. **Update as you go.** Comment on the issue with status changes, blockers, and approach pivots.
6. **Log learnings.** After any correction or surprise, comment on the issue so future agents can learn.
7. **Link commits.** Every commit must reference the issue: `fix: description (#123)` or `closes #123`.
8. **Close when verified.** Only close the issue when the change is tested and working.

### Branch Convention

- Feature: `feat/GH-<number>-short-description`
- Bug fix: `fix/GH-<number>-short-description`
- Chore: `chore/GH-<number>-short-description`

### Commit Convention

```
<type>: <description> (#<issue-number>)
```

Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`

### PR Workflow

- Always create a PR to `main` — never push directly.
- PR title follows the same commit convention.
- PR body must reference the GitHub issue.
- Run tests before marking ready for review.

---

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, STOP and re-plan immediately — don't keep pushing.
- Use plan mode for verification steps, not just building.
- Write detailed specs upfront to reduce ambiguity.

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- For complex problems, throw more compute at it via subagents.
- One task per subagent for focused execution.

### 3. Self-Improvement via GitHub Issues

- After ANY correction from the user: comment on the active GitHub issue with a "Lesson Learned" section.
- Write the pattern that prevents the same mistake.
- Future agents can find these by reviewing prior issue comments and linked commits.
- Review closed issues for relevant context before starting related work.

### 4. Verification Before Done

- Never mark a task complete without proving it works.
- Always write tests — unit tests for logic, integration tests for API endpoints.
- Run the full test suite before creating a PR.
- Ask yourself: "Would a staff engineer approve this?"

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know, implement the elegant solution."
- Skip this for simple, obvious fixes — don't over-engineer.

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding.
- Point at logs, errors, failing tests — then resolve them.
- Zero context switching required from the user.

### 7. Explore Before Assuming

- Always read existing code before writing new code.
- Grep for similar implementations and follow established patterns.
- The codebase may have changed since the issue was created — verify current state.
- Update the GitHub issue if you discover the landscape has shifted.

---

## Package Manager

**Always use `pnpm`.** Never use `npm` or `yarn`.

```bash
pnpm install              # Install dependencies
pnpm add <pkg>            # Add a dependency
pnpm add -D <pkg>         # Add a dev dependency
pnpm run <script>         # Run a script
```

---

## Development Commands

```bash
pnpm install              # Install dependencies
pnpm dev                  # Start dev server (watch mode)
pnpm build                # Build for production
pnpm start                # Start production server
pnpm test                 # Run tests
pnpm type-check           # TypeScript type checking
pnpm lint                 # Lint
pnpm lint:fix             # Lint and auto-fix
```

---

## Core Principles

- **Simplicity First:** Make every change as simple as possible. Impact minimal code.
- **Zero Dependencies in Consumer:** The widget is a script tag. No npm install, no framework, no style conflicts.
- **No Laziness:** Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact:** Changes should only touch what's necessary. Avoid introducing bugs.
- **Security Always:** Parameterized queries, input validation, signed tokens, no secrets in logs.
- **Type Safety:** TypeScript strict mode. Zod for runtime validation at system boundaries. No `any`.

---

## Non-Negotiables

- Never commit directly to `main`. All changes go through feature branches and PRs.
- Never expose secrets in logs, commits, or responses.
- Always use parameterized queries — never string concatenation for SQL.
- Always write tests before marking a task complete.
- Always use `pnpm` — never `npm` or `yarn`.
- Prefer existing patterns and utilities over creating new ones.
- Always define validated types as Zod schemas in `src/shared/schemas.ts`. Derive TypeScript types with `z.infer<>`. Never manually duplicate type definitions.

---

## Installed Skills

Skills provide detailed patterns for specific domains. They live in `skills/` and are auto-synced.

| Skill | Focus |
|-------|-------|
| `github-workflow` | Issue lifecycle, branch naming, commit linking, PR workflow |
| `testing-verification` | Test-before-done workflow, verification checklist, test patterns |
| `api-patterns` | Express REST conventions, response format, Zod validation |
| `database-patterns` | SQLite queries, migrations, parameterized SQL |
| `error-handling` | Custom error classes, middleware error handling, structured logging |
| `widget-patterns` | Support widget: vanilla JS, scoped styles, CORS proxy, zero deps |
| `dashboard-patterns` | QA dashboard: Express + React + Tailwind, test rounds, tester management |
| `cli-patterns` | Init CLI: `npx punchlist-qa init`, config scaffolding, AI skill generation |
| `auth-patterns` | Token-based JWT auth, signed invite links, middleware patterns |

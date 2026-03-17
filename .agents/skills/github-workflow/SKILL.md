---
name: github-workflow
description: GitHub issue lifecycle, branch naming, commit linking, and PR workflow conventions
metadata:
  short-description: GitHub issue and PR workflow
---

# GitHub Workflow

Use this skill when creating issues, branches, commits, or pull requests.

## Use When

- "Create a GitHub issue for this bug"
- "Start working on issue #42"
- "Create a PR for this feature"
- "What branch should I use?"

## North Star Reference

Issue #1 defines all epics. Every new issue should reference which epic it belongs to:

- Epic 1: Core Architecture & Init CLI
- Epic 2: Test Case Configuration
- Epic 3: Storage Layer — SQLite
- Epic 4: Token Auth
- Epic 5: GitHub Issues Adapter
- Epic 6: Support Widget
- Epic 7: QA Dashboard
- Epic 8: AI Agent Skills
- Epic 9: Deployment & Documentation

When creating issues, include `Epic N:` in the title or body to trace lineage.

## Branch Naming

```
feat/GH-<number>-short-description
fix/GH-<number>-short-description
chore/GH-<number>-short-description
```

Always create from latest `main`:
```bash
git checkout main && git pull
git checkout -b feat/GH-42-add-test-rounds
```

## Commit Convention

```
<type>: <description> (#<issue-number>)
```

Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`

Examples:
```
feat: add SQLite storage layer (#12)
fix: widget CORS proxy allowlist (#18)
test: add integration tests for auth middleware (#15)
```

For multi-commit work, reference the issue in every commit. Use `closes #N` in the final commit or PR body.

## PR Workflow

1. Push branch with `-u`: `git push -u origin feat/GH-42-add-test-rounds`
2. Create PR targeting `main`
3. PR title follows commit convention: `feat: add SQLite storage layer (#12)`
4. PR body must include:
   - `## Summary` — what and why
   - `## Test plan` — how to verify
   - `Closes #12` — auto-close the issue on merge

## Issue Lifecycle

1. **Create** — clear title, description, acceptance criteria, epic reference
2. **Comment with plan** — before coding, post your approach
3. **Update status** — comment when starting, blocked, or pivoting
4. **Log learnings** — comment with lessons after corrections or surprises
5. **Link commits** — all commits reference the issue number
6. **Close** — only when verified working and PR merged

## Guardrails

- Never push directly to `main`
- Never close an issue without verification
- Always check for existing issues before creating duplicates
- Update the issue if codebase has changed since it was created
- Always trace issues back to an epic in Issue #1

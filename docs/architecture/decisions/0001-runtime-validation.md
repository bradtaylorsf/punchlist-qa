# ADR-001: Use Zod for Runtime Validation

## Status
Accepted

## Date
2026-03-17

## Context
Punchlist QA needs runtime validation at multiple system boundaries:

1. **Config file parsing** (`punchlist.config.json`) — loaded from disk by the CLI and server
2. **API request bodies** — Express endpoints in the QA dashboard (Epic 7)
3. **Widget message payloads** — untrusted input from the embeddable support widget (Epic 6)
4. **Test round submissions** — tester-submitted results with pass/fail/skip status
5. **Webhook payloads** — from GitHub (and future Jira/Linear adapters)

Today we have ~87 lines of hand-rolled validation in `src/shared/validation.ts` covering only the config schema. This approach has served the initial scaffolding phase but raises concerns as the project grows:

- **Type drift** — the `PunchlistConfig` interface and the validation logic are defined separately and can diverge silently.
- **Repetitive boilerplate** — each new validated type requires manual `typeof` / `Array.isArray` / `includes` chains.
- **Inconsistent error messages** — hand-rolled validators tend to produce ad-hoc error formats that differ across modules.
- **No composability** — shared sub-schemas (e.g., `IssueTrackerConfig` reused in both config and API payloads) require copy-paste.

### Constraint: Zero Dependencies in the Consuming Project
The North Star (issue #1) mandates "zero dependencies in the consuming project." This applies to the **widget script tag** served to end users — not to the QA dashboard server itself, which is a standalone Express + React + SQLite application that will have its own dependency tree (Express, better-sqlite3, React, Tailwind, etc.).

Zod (~57KB minified) is a server/CLI dependency, never shipped to the consuming project's bundle.

## Decision
Adopt **Zod** as the runtime validation library for all system-boundary validation in the CLI and server.

Specifically:
- Define Zod schemas in `src/shared/schemas.ts` as the single source of truth
- Derive TypeScript types from schemas using `z.infer<>` (eliminating manual type definitions that can drift)
- Keep `src/shared/types.ts` for non-validated types (enums, utility types, adapter interfaces)
- Use Zod's `.safeParse()` at all trust boundaries (config loading, API handlers, widget proxy)
- The widget itself (`src/widget/`) remains zero-dependency vanilla JS — Zod is never imported there

## Consequences

### Positive
- **Single source of truth** — Zod schema defines both the runtime check and the TypeScript type, eliminating drift
- **Composable schemas** — sub-schemas like `issueTrackerSchema` are defined once and reused in config, API, and adapter validation
- **Consistent error format** — `z.ZodError` provides structured, path-aware error messages suitable for both CLI output and API responses
- **Reduced boilerplate** — new validated types require ~5 lines of schema instead of ~20 lines of manual checks
- **Transform support** — Zod can coerce/default values during parse (e.g., `z.string().default("sqlite")`) which simplifies config loading
- **Ecosystem standard** — widely adopted in the TypeScript/Express ecosystem, reducing onboarding friction

### Negative
- **One new runtime dependency** (~57KB) — small but non-zero
- **Learning curve** — developers unfamiliar with Zod need to learn the schema DSL (mitigated by excellent docs and widespread adoption)
- **Migration effort** — existing hand-rolled validation needs to be replaced (one-time cost, ~1 hour)

### Risks
- Zod major version changes could require schema updates
  - Mitigation: pin to `^3.x`, Zod has a stable API and good semver discipline
- Over-reliance on Zod for things that don't need validation (internal function arguments, etc.)
  - Mitigation: only use at system boundaries — never for internal function calls between trusted modules

## Alternatives Considered

### Option A: Continue Hand-Rolled Validation
- Pros: Zero dependencies, full control, already working for config
- Cons: Scales poorly (5+ schemas coming in future epics), type drift risk, inconsistent error messages, significant boilerplate per schema, no type inference

### Option B: Joi
- Pros: Mature, feature-rich, well-documented
- Cons: Heavier (~150KB), no TypeScript type inference from schemas, less idiomatic in modern TS projects, CommonJS-first

### Option C: Ajv (JSON Schema)
- Pros: Industry standard schema format, reusable outside TypeScript
- Cons: Verbose JSON Schema syntax, separate type definitions required, heavier bundle, overkill for this use case

### Option D: Valibot
- Pros: Smaller bundle (~5KB), similar API to Zod
- Cons: Smaller community, less ecosystem support, fewer examples, still maturing

## References
- [Zod Documentation](https://zod.dev)
- [North Star — Issue #1](https://github.com/bradtaylorsf/punchlist-qa/issues/1): "Zero dependencies in the consuming project" constraint
- `src/shared/validation.ts` — current hand-rolled implementation to be replaced

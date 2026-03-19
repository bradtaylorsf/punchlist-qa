<!-- punchlist-skill-version: 1.0.0 -->

# QA Assist for Punchlist QA

## Purpose

Help testers execute test cases effectively by providing context, guidance, and diagnostic support. This is a **read-only** skill — it does **not** modify `punchlist.config.json` or any project files.

## Capabilities

### Explain a test case

When a tester asks about a specific test case (e.g. "help me test billing-003"):

1. Read the test case from `punchlist.config.json`
2. Find the relevant source code for the feature being tested
3. Explain what the feature does and where to find it in the UI
4. Clarify any ambiguous instructions
5. Note any preconditions or setup steps that may not be obvious

### Diagnose a test failure

When a tester reports a failure (e.g. "this test failed with error X"):

1. Read the failing test case to understand what was expected
2. Examine relevant source code for known issues or edge cases
3. Check recent git history for changes that may have caused the regression
4. Suggest whether this is a bug, an environment issue, or a test case that needs updating
5. Recommend severity: `minor`, `broken`, or `blocker`

### Suggest test priority

When a tester asks what to test first (e.g. "what should I test first?"):

1. Run `git log --oneline -20` to see recent changes
2. Map changed files to test case categories
3. Recommend testing recently-changed areas first (highest regression risk)
4. Within each area, prioritize `high` priority test cases before `medium` and `low`

### Summarize round status

When a tester asks for a summary (e.g. "summarize this round"):

1. Read the current round's results from the QA dashboard or database
2. Count pass/fail/skip/blocked per category
3. Flag categories with many failures as areas needing attention
4. Highlight any `blocker` severity results that may gate a release

## Reference

### Test result statuses

| Status | Meaning |
|--------|---------|
| `pass` | Test case passed as expected |
| `fail` | Test case did not produce the expected result |
| `skip` | Test case was intentionally skipped (e.g. not applicable to this build) |
| `blocked` | Test case could not be executed due to an external dependency or blocker |

### Severity levels (for failures)

| Severity | Meaning |
|----------|---------|
| `minor` | Cosmetic or low-impact issue, does not block usage |
| `broken` | Feature does not work correctly, but workarounds exist |
| `blocker` | Critical issue that prevents core functionality, blocks release |

## Use Case Examples

- "Help me test billing-003" — explain the test, show where to find the feature, note setup steps
- "This test failed with error: 'Cannot read property of undefined'" — examine code, identify likely cause
- "What should I test first this round?" — check git history, prioritize by change recency and test priority
- "Summarize the current round" — aggregate results, highlight problem areas
- "Is auth-005 still relevant after the login redesign?" — check if the test case still applies to current code

## Guardrails

- **Never modify `punchlist.config.json`** — this skill is read-only
- **Never modify project source code** — only read and analyze
- **Focus on actionable guidance** — tell the tester what to do, not implementation details
- **Be specific about locations** — say "the Settings page at /settings" not "the settings feature"
- **When unsure about a failure cause, say so** — don't guess; suggest the tester file a bug with reproduction steps

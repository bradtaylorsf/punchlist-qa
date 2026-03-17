# Generate Test Cases for Punchlist QA

## Purpose
Analyze the project codebase and generate structured QA test cases for the Punchlist QA testing framework.

## Instructions

1. Read the project's `punchlist.config.json` to understand the project context.
2. Explore the codebase to identify user-facing features, API endpoints, and critical workflows.
3. For each feature, generate test cases in the following JSON format:

```json
{
  "id": "tc-<module>-<number>",
  "title": "Short description of what is being tested",
  "module": "Feature module name",
  "steps": [
    "Step 1: Navigate to or set up the test condition",
    "Step 2: Perform the action being tested",
    "Step 3: Observe the result"
  ],
  "expectedResult": "What should happen when the test passes"
}
```

4. Add the generated test cases to the `testCases` array in `punchlist.config.json`.

## Guidelines
- Focus on user-facing behavior, not internal implementation
- Each test case should test one specific thing
- Steps should be concrete and reproducible
- Group test cases by module/feature area
- Include both happy path and edge cases
- Prioritize critical user flows first

---
name: cli-patterns
description: Init CLI — npx punchlist-qa init, config scaffolding, AI skill generation
metadata:
  short-description: CLI init command patterns
---

# CLI Patterns

Use this skill when building or modifying the `punchlist-qa` CLI.

## Use When

- "How does the init command work?"
- "Add a CLI subcommand"
- "Scaffold config for a new project"
- "Generate AI skills for the consuming project"

## Architecture

The CLI is invoked via `npx punchlist-qa init` in a consuming project. It scaffolds configuration and optionally installs Claude Code / Codex skills for AI-native test case generation.

Entry point: `bin/punchlist.mjs`

## Init Flow

```
npx punchlist-qa init
  → Detect project type (package.json, framework, etc.)
  → Prompt for QA dashboard URL
  → Prompt for GitHub repo (for issue filing)
  → Generate punchlist.config.json
  → Optionally generate .claude/skills/punchlist-qa/ (AI skills)
  → Optionally add widget script tag snippet
  → Print next steps
```

## Config File

The init command generates `punchlist.config.json` in the consuming project:

```json
{
  "dashboardUrl": "https://qa.myapp.com",
  "github": {
    "owner": "myorg",
    "repo": "myapp"
  },
  "widget": {
    "enabled": true,
    "allowedOrigins": ["http://localhost:3000", "https://myapp.com"]
  },
  "testCases": {
    "source": "punchlist.tests.yaml",
    "autoSync": true
  }
}
```

## CLI Command Structure

```bash
punchlist-qa init              # Interactive setup
punchlist-qa sync              # Sync test cases to dashboard
punchlist-qa status            # Check dashboard connectivity
punchlist-qa generate          # AI-generate test cases from codebase
```

## Argument Parsing

Use a lightweight argument parser — no heavy CLI frameworks:

```typescript
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'init':
    await runInit(args.slice(1));
    break;
  case 'sync':
    await runSync(args.slice(1));
    break;
  default:
    printUsage();
}
```

## AI Skill Generation

The init command can generate Claude Code skills in the consuming project:

```
.claude/skills/punchlist-qa/
  SKILL.md    # Teaches Claude how to write test cases for this project
```

The generated skill teaches AI agents how to:
- Read the project's codebase and identify testable features
- Generate test cases in the `punchlist.tests.yaml` format
- Run `punchlist-qa sync` to push test cases to the dashboard

## Interactive Prompts

Use `readline` for interactive prompts — no external dependencies:

```typescript
import { createInterface } from 'readline';

async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
```

## Guardrails

- Keep CLI dependencies minimal — it runs via `npx` in any project
- Never modify the consuming project's source code — only add config files
- Always validate the dashboard URL is reachable during init
- Use `readline` for prompts — no external prompt libraries
- Generated files should include comments explaining what they do
- Always use `pnpm` in documentation and examples within this project

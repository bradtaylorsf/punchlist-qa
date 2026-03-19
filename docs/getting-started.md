# Getting Started

This guide walks you through setting up Punchlist QA from scratch — creating a project config, inviting testers, running the server, and completing your first QA round.

## Prerequisites

- **Node.js 18+** — [download](https://nodejs.org/)
- **A GitHub repository** — Punchlist QA files issues here when testers find bugs
- **A GitHub Personal Access Token** — with `repo` scope ([create one](https://github.com/settings/tokens/new?scopes=repo))

## 1. Initialize the project

In your project directory:

```bash
npx punchlist-qa init
```

This creates two files:

- `punchlist.config.json` — project name, test cases, widget config, CORS domains
- `.env` — secrets (GitHub token, auth secret)

Open `.env` and fill in:

```bash
PUNCHLIST_GITHUB_TOKEN=ghp_your_token_here
PUNCHLIST_AUTH_SECRET=$(openssl rand -hex 32)
```

## 2. Define test cases

Edit `punchlist.config.json` and add test cases:

```json
{
  "testCases": [
    {
      "id": "auth-001",
      "title": "User can log in with valid credentials",
      "category": "auth",
      "priority": "high",
      "instructions": "Navigate to /login, enter valid credentials, click Submit",
      "expectedResult": "User is redirected to dashboard"
    },
    {
      "id": "auth-002",
      "title": "User sees error for invalid credentials",
      "category": "auth",
      "priority": "high",
      "instructions": "Navigate to /login, enter wrong password, click Submit",
      "expectedResult": "Error message displayed, no redirect"
    }
  ]
}
```

Test case IDs must match the pattern `prefix-NNN` (e.g., `auth-001`, `checkout-003`).

## 3. Invite testers

Generate invite links for your team:

```bash
npx punchlist-qa invite --name "Alice Smith" --email alice@example.com --role tester
```

This prints a one-time login URL. Share it with the tester — they'll use it to authenticate with the dashboard.

For admin access:

```bash
npx punchlist-qa invite --name "Bob Admin" --email bob@example.com --role admin
```

## 4. Start the server

```bash
npx punchlist-qa serve
```

Output:

```
  Punchlist QA Server
  Project: my-project
  Port: 4747
  Host: 127.0.0.1

  Dashboard: http://127.0.0.1:4747/
  Widget:    http://127.0.0.1:4747/widget.js
  API:       http://127.0.0.1:4747/api/
```

Open the dashboard URL in your browser.

## 5. Run your first QA round

1. **Log in** — Use the invite link from step 3
2. **Create a round** — Click "New Round", give it a name (e.g., "Sprint 1 QA")
3. **Execute test cases** — Work through each test case, marking results as pass/fail/skip/blocked
4. **File issues** — When a test fails, add a description and severity. Punchlist QA automatically creates a GitHub issue with full context
5. **Complete the round** — When all tests are done, mark the round as completed

## 6. Add the support widget (optional)

Add the widget script tag to your application to let users report bugs directly:

```html
<script
  src="http://localhost:4747/widget.js"
  data-server="http://localhost:4747"
></script>
```

See the [Widget Integration Guide](./widget-integration.md) for framework-specific examples and configuration options.

## Next steps

- [Widget Integration Guide](./widget-integration.md) — embed the bug reporter widget in your app
- [API Reference](./api-reference.md) — all endpoints with schemas and examples
- [Configuration Reference](./configuration.md) — environment variables and config options
- Deployment guides: [Render](./deployment/render.md) | [Railway](./deployment/railway.md) | [AWS](./deployment/aws.md)

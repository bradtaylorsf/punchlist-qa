# Configuration Reference

Punchlist QA is configured via a combination of `punchlist.config.json` (project settings) and environment variables (secrets and runtime overrides).

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PUNCHLIST_GITHUB_TOKEN` | Yes | — | GitHub Personal Access Token with `repo` scope. Used to create issues and read repository data. |
| `PUNCHLIST_AUTH_SECRET` | Yes | — | Secret key for signing JWT tokens and session cookies. Generate with `openssl rand -hex 32`. |
| `PORT` | No | `4747` | Port the server listens on. |
| `HOST` | No | `127.0.0.1` | Host/interface the server binds to. Set to `0.0.0.0` in Docker or to accept remote connections. |
| `PUNCHLIST_DATA_DIR` | No | `.punchlist/` (relative to config) | Directory for the SQLite database. When set, the database is stored at `<PUNCHLIST_DATA_DIR>/punchlist.db`. Useful in Docker to point at a mounted volume. |
| `NODE_ENV` | No | — | Set to `production` for production deployments. |

## Setting Environment Variables

### Local development

Create a `.env` file in your project root (next to `punchlist.config.json`):

```bash
PUNCHLIST_GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
PUNCHLIST_AUTH_SECRET=your-secret-here
```

### Docker

Use the `env_file` directive in `docker-compose.yml` or pass variables directly:

```bash
docker run -e PUNCHLIST_GITHUB_TOKEN=ghp_xxx -e PUNCHLIST_AUTH_SECRET=xxx punchlist-qa
```

### Cloud platforms

Set environment variables through your platform's dashboard or CLI (Render, Railway, AWS, etc.). See the deployment guides in `docs/deployment/` for platform-specific instructions.

## Config File Reference

The `punchlist.config.json` file is created by `npx punchlist-qa init`. See the generated `punchlist.config.example.json` for the full schema.

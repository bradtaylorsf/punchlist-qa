# Deploy to Railway

This guide covers deploying Punchlist QA to [Railway](https://railway.app) with a persistent volume for SQLite storage.

## Prerequisites

- A Railway account
- Your Punchlist QA repository pushed to GitHub
- A `punchlist.config.json` in the repo root
- A GitHub PAT with `repo` scope

## Step 1: Create a New Project

1. Go to [Railway Dashboard](https://railway.app/dashboard) > **New Project**
2. Select **Deploy from GitHub repo**
3. Connect and select your repository

Railway auto-detects the Dockerfile and starts building.

## Step 2: Add a Volume

SQLite requires persistent storage. Railway volumes persist data across deploys.

1. In your project, click the service
2. Go to **Settings** > **Volumes**
3. Add a volume:
   - **Mount Path:** `/data/.punchlist`
   - **Size:** 1 GB

## Step 3: Set Environment Variables

In the **Variables** tab, add:

| Variable | Value |
|----------|-------|
| `PUNCHLIST_GITHUB_TOKEN` | Your GitHub PAT |
| `PUNCHLIST_AUTH_SECRET` | Output of `openssl rand -hex 32` |
| `PORT` | `4747` |
| `HOST` | `0.0.0.0` |
| `PUNCHLIST_DATA_DIR` | `/data/.punchlist` |
| `NODE_ENV` | `production` |

## Step 4: Configure Networking

1. Go to **Settings** > **Networking**
2. Click **Generate Domain** to get a `*.railway.app` URL
3. Or add a custom domain

## Step 5: Deploy

Railway deploys automatically on push to your configured branch. You can also trigger a manual deploy from the dashboard.

## Step 6: Verify

```bash
curl https://your-app.railway.app/health
```

Expected:

```json
{ "status": "ok", "timestamp": "..." }
```

## Step 7: Update CORS

Add your Railway domain (and any custom domains) to `punchlist.config.json`:

```json
{
  "widget": {
    "corsDomains": [
      "https://myapp.com",
      "https://your-app.railway.app"
    ]
  }
}
```

## Notes

- Railway charges based on resource usage. Monitor your usage in the dashboard.
- The Dockerfile handles the full build — no additional Railway configuration needed.
- Railway volumes persist across deploys and restarts.
- For custom domains, Railway automatically provisions SSL.

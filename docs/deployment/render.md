# Deploy to Render

This guide covers deploying Punchlist QA to [Render](https://render.com) as a Docker web service with persistent storage.

## Prerequisites

- A Render account
- Your Punchlist QA repository pushed to GitHub
- A `punchlist.config.json` in the repo root
- A GitHub PAT with `repo` scope

## Step 1: Create a Web Service

1. Go to [Render Dashboard](https://dashboard.render.com) > **New** > **Web Service**
2. Connect your GitHub repository
3. Configure:
   - **Name:** `punchlist-qa`
   - **Region:** Choose closest to your team
   - **Runtime:** **Docker**
   - **Instance Type:** Starter ($7/mo) or higher
   - **Branch:** `main`

## Step 2: Add a Persistent Disk

Punchlist QA uses SQLite, which requires persistent storage.

1. In your web service settings, go to **Disks**
2. Add a disk:
   - **Name:** `punchlist-data`
   - **Mount Path:** `/data/.punchlist`
   - **Size:** 1 GB (sufficient for most projects)

## Step 3: Set Environment Variables

In the **Environment** tab, add:

| Variable | Value |
|----------|-------|
| `PUNCHLIST_GITHUB_TOKEN` | Your GitHub PAT |
| `PUNCHLIST_AUTH_SECRET` | Output of `openssl rand -hex 32` |
| `PORT` | `4747` |
| `HOST` | `0.0.0.0` |
| `PUNCHLIST_DATA_DIR` | `/data/.punchlist` |
| `NODE_ENV` | `production` |

## Step 4: Deploy

Click **Deploy**. Render will build the Docker image and start the service.

## Step 5: Verify

Once deployed, check the health endpoint:

```bash
curl https://punchlist-qa-xxxx.onrender.com/health
```

Expected response:

```json
{ "status": "ok", "timestamp": "..." }
```

## Step 6: Custom Domain (Optional)

1. Go to **Settings** > **Custom Domains**
2. Add your domain (e.g., `qa.myapp.com`)
3. Add the CNAME record Render provides to your DNS
4. Render automatically provisions an SSL certificate

## Step 7: Update CORS

Update `punchlist.config.json` to include your production domain:

```json
{
  "widget": {
    "corsDomains": [
      "https://myapp.com",
      "https://staging.myapp.com"
    ]
  }
}
```

Commit and push — Render will auto-deploy.

## Notes

- Render free tier services spin down after inactivity. Use a paid instance for reliable uptime.
- The health check (`GET /health`) is automatically used by Render for service health monitoring.
- SQLite on Render works well with a persistent disk. For multi-instance scaling, you'd need to switch to a shared database.

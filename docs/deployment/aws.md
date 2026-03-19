# Deploy to AWS (EC2 + Docker)

This guide covers deploying Punchlist QA on an EC2 instance using Docker, with Caddy as a reverse proxy for automatic SSL.

## Prerequisites

- An AWS account
- A domain name with DNS access
- A GitHub PAT with `repo` scope
- SSH key pair for EC2 access

## Step 1: Launch an EC2 Instance

1. Go to **EC2** > **Launch Instance**
2. Configure:
   - **AMI:** Amazon Linux 2023 or Ubuntu 22.04
   - **Instance type:** `t3.micro` (sufficient for small teams) or `t3.small`
   - **Storage:** 8 GB root volume
   - **Security group:** See Step 2

## Step 2: Configure Security Groups

Create or update the security group with these inbound rules:

| Type | Port | Source | Purpose |
|------|------|--------|---------|
| SSH | 22 | Your IP | SSH access |
| HTTP | 80 | 0.0.0.0/0 | Caddy redirect to HTTPS |
| HTTPS | 443 | 0.0.0.0/0 | Application traffic |

Do **not** expose port 4747 directly — Caddy handles TLS termination and proxies to the app.

## Step 3: Add an EBS Volume for Data

1. Go to **EC2** > **Volumes** > **Create Volume**
2. Configure:
   - **Size:** 1 GB
   - **Type:** gp3
   - **Availability Zone:** Same as your instance
3. Attach the volume to your instance (e.g., `/dev/xvdf`)

SSH into your instance and format/mount the volume:

```bash
sudo mkfs -t ext4 /dev/xvdf
sudo mkdir -p /data
sudo mount /dev/xvdf /data
sudo chown 1001:1001 /data  # Match the punchlist container user

# Persist across reboots
echo '/dev/xvdf /data ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
```

## Step 4: Install Docker

```bash
# Amazon Linux 2023
sudo dnf install docker -y
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user

# Install Docker Compose plugin
sudo mkdir -p /usr/local/lib/docker/cli-plugins
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
```

Log out and back in for the group change to take effect.

## Step 5: Deploy Punchlist QA

Clone your repository and set up the environment:

```bash
git clone https://github.com/your-org/your-repo.git /opt/punchlist-qa
cd /opt/punchlist-qa
```

Create `.env`:

```bash
PUNCHLIST_GITHUB_TOKEN=ghp_your_token
PUNCHLIST_AUTH_SECRET=$(openssl rand -hex 32)
PORT=4747
HOST=0.0.0.0
PUNCHLIST_DATA_DIR=/data/.punchlist
NODE_ENV=production
```

Create a `docker-compose.override.yml` to mount the EBS volume:

```yaml
services:
  punchlist:
    volumes:
      - /data/.punchlist:/data/.punchlist
      - ./punchlist.config.json:/app/punchlist.config.json:ro
```

Start the application:

```bash
docker compose up -d
```

Verify it's running:

```bash
curl http://localhost:4747/health
```

## Step 6: Install Caddy (Reverse Proxy + SSL)

Caddy automatically provisions and renews Let's Encrypt SSL certificates.

```bash
# Amazon Linux 2023
sudo dnf install -y 'dnf-command(copr)'
sudo dnf copr enable @caddy/caddy -y
sudo dnf install caddy -y
```

Create `/etc/caddy/Caddyfile`:

```
qa.yourdomain.com {
    reverse_proxy localhost:4747
}
```

Start Caddy:

```bash
sudo systemctl start caddy
sudo systemctl enable caddy
```

## Step 7: Point DNS

Add an A record for your domain pointing to your EC2 instance's public IP:

```
qa.yourdomain.com → A → <your-ec2-public-ip>
```

Caddy will automatically provision an SSL certificate once DNS propagates.

## Step 8: Verify

```bash
curl https://qa.yourdomain.com/health
```

Expected:

```json
{ "status": "ok", "timestamp": "..." }
```

## Step 9: Update CORS

Update `punchlist.config.json`:

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

Restart the container after config changes:

```bash
docker compose restart
```

## Updating

To deploy a new version:

```bash
cd /opt/punchlist-qa
git pull
docker compose build
docker compose up -d
```

## Notes

- **EBS snapshots:** Set up regular EBS snapshots for backup. The SQLite database is the only stateful data.
- **Elastic IP:** Assign an Elastic IP to your instance so the IP doesn't change on restart.
- **Instance recovery:** Enable CloudWatch alarms for automatic instance recovery.
- **Logs:** View container logs with `docker compose logs -f`.
- **Graceful shutdown:** The application handles SIGTERM for zero-downtime restarts.

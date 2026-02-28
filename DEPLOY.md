# Deployment Guide — fplgeek.xyz

This app runs as two Docker containers behind an nginx reverse proxy with automatic SSL via Let's Encrypt. The stack:

- **web** — Vite/React frontend served by nginx
- **server** — Node.js/Express backend (AI & data API)
- **nginx-proxy** — Reverse proxy that routes `fplgeek.xyz` traffic and terminates SSL

---

## Prerequisites

- A VPS (Ubuntu 22.04 or later recommended)
- Docker and Docker Compose installed
- Domain `fplgeek.xyz` pointed to your server's IP via DNS A records
- Port **80** and **443** open in your firewall

---

## 1. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
```

Install Docker Compose v2 plugin (included with Docker >= 24, or install manually):

```bash
# Verify
docker compose version
```

---

## 2. Create the shared nginx-proxy network

This network connects the reverse proxy to your app containers. **Must be created once per host.**

```bash
docker network create nginx-proxy
```

---

## 3. Start the nginx-proxy + Let's Encrypt companion

This handles automatic SSL certificate provisioning for any container that exposes `VIRTUAL_HOST` and `LETSENCRYPT_HOST`.

Create `/root/nginx-proxy/docker-compose.yml`:

```yaml
services:
  nginx-proxy:
    image: nginxproxy/nginx-proxy:latest
    container_name: nginx-proxy
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/tmp/docker.sock:ro
      - nginx-certs:/etc/nginx/certs
      - nginx-vhost:/etc/nginx/vhost.d
      - nginx-html:/usr/share/nginx/html
    networks:
      - nginx-proxy

  acme-companion:
    image: nginxproxy/acme-companion:latest
    container_name: acme-companion
    restart: always
    environment:
      - DEFAULT_EMAIL=your@email.com
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - nginx-certs:/etc/nginx/certs
      - nginx-vhost:/etc/nginx/vhost.d
      - nginx-html:/usr/share/nginx/html
      - acme:/etc/acme.sh
    depends_on:
      - nginx-proxy
    networks:
      - nginx-proxy

volumes:
  nginx-certs:
  nginx-vhost:
  nginx-html:
  acme:

networks:
  nginx-proxy:
    external: true
```

Start it:

```bash
cd /root/nginx-proxy
docker compose up -d
```

---

## 4. Configure DNS

In your domain registrar's DNS settings for `fplgeek.xyz`, add:

| Type | Name | Value           | TTL |
|------|------|-----------------|-----|
| A    | @    | `<your-vps-ip>` | 300 |
| A    | www  | `<your-vps-ip>` | 300 |

Wait for propagation (usually a few minutes to an hour). You can check with:

```bash
dig fplgeek.xyz +short
```

---

## 5. Clone the repository

```bash
cd /root
git clone https://github.com/<your-username>/fplgeek.git
cd fplgeek
```

---

## 6. Create the `.env` file

Copy the example and fill in your real values:

```bash
cp .env.example .env
nano .env
```

Required values:

```env
# Firebase
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id

# AI / API keys
VITE_GOOGLE_API_KEY=your_google_api_key
GOOGLE_API_KEY=your_google_api_key
VITE_OPENROUTER_API_KEY=your_openrouter_api_key

# App config
VITE_USE_EMULATORS=false
VITE_USE_LOCAL_DB=true
```

> **Never commit `.env` to git.** It is already in `.gitignore`.

---

## 7. Build and start the app

```bash
cd /root/fplgeek
docker compose up -d --build
```

This builds both containers:
- `web` — React frontend (Vite build → nginx)
- `server` — Node.js backend on port 3000

The `nginx-proxy` container will automatically detect the new `web` container via `VIRTUAL_HOST=fplgeek.xyz,www.fplgeek.xyz` and route traffic to it. SSL will be provisioned within ~30–60 seconds from Let's Encrypt.

---

## 8. Verify

```bash
# Check containers are running
docker compose ps

# Check logs
docker compose logs -f web
docker compose logs -f server

# Test HTTPS
curl -I https://fplgeek.xyz
```

---

## Updating the app

Pull the latest code and rebuild:

```bash
cd /root/fplgeek
git pull
docker compose up -d --build
```

Old containers are replaced with zero-downtime by Docker Compose.

---

## Data & Models

The backend server mounts `./public/data` as a Docker volume:

```yaml
volumes:
  - ./public/data:/app/public/data
```

The SQLite database and AI prediction files persist across redeploys. The ML model files (`.joblib`) are tracked in git and are copied into the container on build.

To run a manual data update:

```bash
# Inside the server container
docker compose exec server npm run ingest
```

Or via the weekly cron script:

```bash
bash scripts/weekly_update.sh
```

---

## Directory Structure (key files)

```
fplgeek/
├── Dockerfile              # Frontend build (Vite → nginx)
├── nginx.conf              # nginx config inside the web container
├── docker-compose.yml      # App services definition
├── functions/
│   ├── Dockerfile          # Backend Node.js server build
│   └── server.ts           # Express entry point
├── public/
│   ├── data/               # SQLite DB, AI predictions (volume-mounted)
│   └── models/             # ML models served statically
└── src/                    # React frontend source
```

---

## Firewall Setup (UFW)

```bash
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw enable
```

---

## Troubleshooting

**SSL certificate not issuing:**
- Confirm DNS A record points to the correct VPS IP
- Make sure ports 80 and 443 are open
- Check `acme-companion` logs: `docker logs acme-companion`

**`nginx-proxy` network not found:**
- Run `docker network create nginx-proxy` before starting the proxy or app containers

**Frontend serves stale build:**
- Force a rebuild: `docker compose build --no-cache web && docker compose up -d`

**Backend API errors:**
- Check `.env` has all required API keys
- `docker compose logs server` for runtime errors

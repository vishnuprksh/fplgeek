# FPL Geek

FPL Geek is an advanced Fantasy Premier League analytics tool that helps you optimize your squad using data-driven insights. It features historical analysis, price change predictions, and AI-powered squad recommendations.

## Features
- **Pitch View**: Visualise your team with live data.
- **AI History**: Analyze past performance vs predicted points (xP).
- **Transfer Recommendations**: Smart value analysis for potential transfers.
- **Price Predictions**: Monitor potential price rises and falls.

## 🚀 Local Development

### Prerequisites
- Node.js (v18+)
- npm or yarn

### Installation
1.  Clone the repository:
    ```bash
    git clone https://github.com/yourusername/fplgeek.git
    cd fplgeek
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the development server:
    ```bash
    npm run dev
    ```
    The app will be available at `http://localhost:5173`.

---

## ☁️ Self-Hosting Guide

You can easily host this application on any VPS (Virtual Private Server) like DigitalOcean, Linode, Hetzner, or AWS.

### 1. VPS Requirements
- Ubuntu 20.04 or higher.
- Docker & Docker Compose installed.
- A domain name (e.g., `fplgeek.xyz`) pointed to your VPS IP.

### 2. Quick Deployment (Automated)

We have included a deployment script `deploy_vps.py` that handles everything for you (uploading code, building Docker images, and starting containers).

1.  **Edit `docker-compose.yml`** (locally) to set your domain:
    ```yaml
    environment:
      - VIRTUAL_HOST=your-domain.com,www.your-domain.com
      - LETSENCRYPT_HOST=your-domain.com,www.your-domain.com
    ```
2.  **Run the deployment script**:
    ```bash
    # Usage: python3 deploy_vps.py
    # You might need to edit the script to set your VPS IP and User first.
    python3 deploy_vps.py
    ```

### 3. Manual Deployment (Docker)

If you prefer to set it up manually on the server:

1.  **SSH into your VPS**:
    ```bash
    ssh root@your-vps-ip
    ```
2.  **Clone/Copy your project** to `/root/fplgeek`.
3.  **Start the application**:
    ```bash
    cd /root/fplgeek
    docker compose up -d --build
    ```

### 4. Reverse Proxy Setup (Standard)
This application handles SSL automatically if you referernce it via an `nginx-proxy` container.
*   The `docker-compose.yml` is configured to join the `nginx-proxy` network.
*   Ensure you have an `nginx-proxy` container running on the same network.

### 5. DNS Configuration
Point your domain to your VPS IP Address using **A Records**:
*   `@` -> `31.97.232.229` (Your VPS IP)
*   `www` -> `31.97.232.229`

Once deployed, access your site at `https://your-domain.com`.

# Deploying to Render

This guide explains how to deploy the FPL Geek application to [Render](https://render.com).

## Overview

The application is deployed as two separate services on Render:
1.  **fplgeek-backend**: A Node.js web service that serves the SQLite database and provides data endpoints.
2.  **fplgeek-frontend**: A static site that hosts the React application.

## Prerequisites

-   A Render account.
-   Your project pushed to a GitHub or GitLab repository.

## Deployment Steps

### 1. Connect Repository

1.  In your Render dashboard, click **New** > **Blueprint**.
2.  Connect your GitHub/GitLab repository.
3.  Render will automatically detect the `render.yaml` file in the root directory.

### 2. Initial Configuration

1.  Render will prompt you to confirm the services defined in `render.yaml`.
2.  **Important**: The `render.yaml` file includes a persistent disk for the backend to store the SQLite database.

### 3. Update Environment Variables

The `render.yaml` file pre-configures most variables. However, you should ensure the following:

-   **fplgeek-backend**:
    -   `ServerPort`: `3000` (default)
    -   `DATA_DIR`: `/opt/render/project/src/data` (persistent disk mount point)

-   **fplgeek-frontend**:
    -   `VITE_API_URL`: Set this to the URL of your deployed backend (e.g., `https://fplgeek-backend.onrender.com`).

### 4. Database Initialization

Since the backend uses a local SQLite database, the initial deployment will have an empty database. 

1.  Once the backend is deployed, use the Render Shell (in the service dashboard) to run your ingestion scripts if needed, or upload a pre-existing `fpl.sqlite` to the persistent disk at `/opt/render/project/src/data`.
2.  Alternatively, you can modify the backend `startCommand` or add a post-deployment script to download/initialize the database from a source.

## Notes on the Free Plan

-   The **Free Plan** for Render Web Services (backend) will spin down after 15 minutes of inactivity. This will cause a delay when the first user visits the site.
-   The **Persistent Disk** used for the SQLite database requires a paid plan (starting at $5/month at the time of writing). If you stay on the Free Plan, the database will be reset every time the service restarts.
-   If you want to stay strictly on the Free Plan, consider moving the SQLite database to a cloud-hosted database (like Neon or Supabase) or using a cloud storage service to fetch/save the SQLite file on startup.

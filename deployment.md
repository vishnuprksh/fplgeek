# FPL Geek: Vercel Deployment Guide

This guide deploys the FPL Geek React/Vite dashboard and its server-side API functions to Vercel. The frontend uses same-origin `/api/*` requests, while Databricks credentials remain server-side.

## 1. Prerequisites

Before deploying, confirm that you have:

- A GitHub repository containing the project.
- A Vercel account connected to GitHub.
- A Databricks workspace with a running or available SQL Warehouse.
- Permission to query the required `workspace.fplgeek` tables.
- Node.js 18 or later for local verification.

From the repository root, install dependencies and run the checks:

```bash
npm install
npm run lint
npm run build
```

Resolve all lint and build errors before creating the Vercel project.

## 2. Verify the repository configuration

The repository is configured as a Vite application with Vercel functions in the root-level `api/` directory.

The root `vercel.json` contains the important deployment settings:

- Framework: Vite
- Build command: `cd frontend && npm run build`
- Output directory: `frontend/dist`
- SPA fallback for non-API routes
- API routes excluded from the SPA fallback

When importing the repository into Vercel, use the repository root as the project root. Do not set the project root to `frontend/`, because the API functions and `lib/` directory are at the repository root.

Before committing, verify that local secrets are not tracked:

```bash
git status --short
git ls-files .env .env.example
```

`.env` must not be committed. `.env.example` may be committed and should contain variable names only, never real credentials.

## 3. Configure the Databricks SQL Warehouse

In Databricks:

1. Open **SQL Warehouses**.
2. Create or select a small warehouse, such as `2X-Small`.
3. Configure auto-stop, for example after 10 minutes.
4. Wait for the warehouse to become available.
5. Open **Connection Details**.
6. Copy the server hostname and HTTP path.
7. Copy the warehouse ID from the warehouse URL or configuration.
8. Generate an access token for this application.
9. Confirm that the token can use the warehouse and read the required tables.

The API reads these values server-side:

```text
DATABRICKS_HOST
DATABRICKS_TOKEN
DATABRICKS_HTTP_PATH
DATABRICKS_WAREHOUSE_ID
DATABRICKS_CATALOG
DATABRICKS_SCHEMA
```

The default catalog and schema are:

```text
DATABRICKS_CATALOG=workspace
DATABRICKS_SCHEMA=fplgeek
```

Do not prefix these variables with `VITE_`. Do not place the token in frontend source code.

## 4. Push the deployment branch

Commit the deployment changes and push the branch to GitHub:

```bash
git add api frontend lib vercel.json package.json package-lock.json .env.example deployment.md
git commit -m "Prepare Vercel deployment"
git push origin databricks
```

Do not commit any of the following:

- `.env`
- Databricks tokens
- `node_modules/`
- `frontend/dist/`
- Local databases
- Python virtual environments

## 5. Create the Vercel project

1. Sign in to [Vercel](https://vercel.com/).
2. Select **Add New → Project**.
3. Import `vishnuprksh/fplgeek`.
4. Select the `databricks` branch for the initial Preview deployment.
5. Set the project root to the repository root.
6. Confirm or enter these settings:

   | Setting | Value |
   |---|---|
   | Framework Preset | Vite |
   | Build Command | `cd frontend && npm run build` |
   | Output Directory | `frontend/dist` |
   | Install Command | `npm install` |

7. Create the project and start the Preview deployment.

The committed `vercel.json` should supply the build configuration automatically. Check the Vercel settings if the detected values differ.

## 6. Add environment variables

Open **Project Settings → Environment Variables** and add the following variables:

| Variable | Value | Required |
|---|---|---|
| `DATABRICKS_HOST` | Databricks server hostname | Yes |
| `DATABRICKS_TOKEN` | Databricks access token | Yes |
| `DATABRICKS_HTTP_PATH` | SQL Warehouse HTTP path | Yes |
| `DATABRICKS_WAREHOUSE_ID` | SQL Warehouse ID | Yes |
| `DATABRICKS_CATALOG` | `workspace` | Yes |
| `DATABRICKS_SCHEMA` | `fplgeek` | Yes |

Configure the variables for **Preview** and **Production**. Configure **Development** only if you use Vercel's development environment.

Prefer separate Databricks tokens for Preview and Production. Keep token values hidden and never expose them in build logs.

`UPDATE_ADMIN_SECRET` is not required for normal operation. The current update endpoint intentionally reports that refreshes are managed by a scheduled Databricks Job. If this variable is configured later, it must be treated as a secret and must not be exposed to the browser.

## 7. Validate the Preview deployment

After the Preview deployment completes, open its URL and test:

1. Initial dashboard load.
2. Team ID lookup.
3. Team picks.
4. Transfer history.
5. Fixtures.
6. Player analysis.
7. Player detail modal.
8. Predictions.
9. Gameweek context.
10. League analysis.
11. Refreshing the page on nested routes.

Expected same-origin API paths include:

```text
/api/fpl/bootstrap-static
/api/fpl/fixtures
/api/fpl/entry/<teamId>
/api/fpl/entry/<teamId>/event/<eventId>/picks
/api/fpl/entry/<teamId>/transfers
/api/fpl/element-summary/<elementId>
/api/data/predictions
/api/data/gameweek-context
/api/data/league-analysis
```

The browser must not request:

```text
http://localhost:3000
/ai-api
```

It must also never call Databricks directly.

## 8. Test validation and error handling

Test valid and invalid route parameters. Confirm that:

- Valid team and player IDs return data.
- Invalid IDs return a controlled `400` response.
- Unsupported HTTP methods return `405`.
- Databricks failures return a generic user-facing error.
- Server logs do not contain access tokens or sensitive configuration.
- Optional analytics failures do not prevent core FPL data from loading.

Use the Vercel function logs while loading the data endpoints. Pay particular attention to SQL Warehouse startup time after auto-stop.

## 9. Promote to Production

After Preview testing succeeds:

1. Merge `databricks` into `main`, or deploy the verified commit to Production.
2. Confirm Production environment variables are configured.
3. Trigger the Production deployment.
4. Open the Production URL.
5. Repeat the core dashboard and API smoke tests.
6. Add a custom domain under **Project Settings → Domains**, if required.
7. Configure DNS using the records provided by Vercel.

## 10. Handle data refreshes outside Vercel

Do not expose an unrestricted public data-refresh endpoint.

Continue refreshing data using one of these approaches:

- Manual execution of the existing data pipeline.
- A scheduled Databricks Job.
- A private external scheduler.

After a refresh, verify that the Databricks tables contain the new data and that the dashboard displays the updated results.

## 11. Monitor the deployment

For the first deployments, monitor:

- Vercel deployment logs.
- Vercel Function Logs.
- Function duration and failures.
- Databricks query failures.
- SQL Warehouse startup latency.
- Browser network errors.
- Vercel usage limits.

Rotate the Databricks token before it expires. If the token is ever exposed, revoke it immediately and create a replacement.

## 12. Final checklist

- [ ] `npm run lint` passes locally.
- [ ] `npm run build` passes locally.
- [ ] `vercel.json` is at the repository root.
- [ ] Vercel project root is the repository root.
- [ ] Build output is `frontend/dist`.
- [ ] Preview environment variables are configured.
- [ ] Production environment variables are configured.
- [ ] `.env` is not committed.
- [ ] Databricks token is server-side only.
- [ ] Frontend requests use same-origin `/api/*` paths.
- [ ] No request uses `localhost:3000` or `/ai-api`.
- [ ] FPL API routes work in Preview.
- [ ] Databricks analytics routes work in Preview.
- [ ] Invalid route parameters return controlled errors.
- [ ] Nested SPA routes refresh correctly.
- [ ] Data refresh is handled outside the public Vercel request path.
- [ ] Production smoke tests pass.

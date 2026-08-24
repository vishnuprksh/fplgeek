# FPL Geek: Small Hobby Project Plan

## Goal

Deploy the existing React/Vite FPL dashboard on Vercel with a small, reliable feature set. Keep Databricks server-side and avoid building production-scale infrastructure until the project needs it.

## Target architecture

```text
Browser (Vercel-hosted React SPA)
        |
        | same-origin /api/* requests
        v
Vercel serverless API functions
        |\
        | \-- Official FPL API proxy
        |
        \---- Databricks SQL Warehouse
                 ^
                 |
          Occasional/manual data refresh
```

## Scope and decisions

- Keep the existing Vite + React frontend; do not migrate to Next.js initially.
- Keep only the API routes needed by the dashboard.
- Replace browser-side SQLite/SQL.js loading with HTTP APIs.
- Use a manual or simple scheduled refresh; do not build an admin workflow yet.
- Remove the Render keep-alive behavior when Vercel is the deployment target.

## Phase 1: Deploy the existing app

- Configure the Vercel project root and build settings for `frontend/`.
- Build with `npm run build` and serve the generated `dist` directory.
- Add only the SPA fallback required for client-side navigation.
- Add an `.env.example` file and keep real environment files out of git.

## Phase 2: Add a minimal API layer

Keep the existing server-side routes and implement only the endpoints currently used by the UI:

```text
api/
  fpl/
    bootstrap-static.ts
    fixtures.ts
    entry/[teamId].ts
    entry/[teamId]/event/[eventId]/picks.ts
    entry/[teamId]/transfers.ts
    element-summary/[elementId].ts
  data/
    predictions.ts
    league-analysis.ts
    gameweek-context.ts
  update-status.ts
  update-data.ts
lib/
  databricks.ts
  fpl-api.ts
  validation.ts
```

The Databricks client should:

- Read credentials only from server-side environment variables.
- Execute a small number of predefined, parameterized queries.
- Handle the normal asynchronous query response and a reasonable timeout.
- Return simple frontend-facing data structures.
- Avoid exposing credentials, raw SQL, or internal errors.

Required environment variables:

```text
DATABRICKS_HOST
DATABRICKS_TOKEN
DATABRICKS_HTTP_PATH
DATABRICKS_WAREHOUSE_ID
DATABRICKS_CATALOG=workspace
DATABRICKS_SCHEMA=fplgeek
```

## Phase 3: Define only the necessary contracts

Use stable JSON contracts instead of returning raw table rows.

### Read-only endpoints

```text
GET /api/data/predictions
GET /api/data/league-analysis
GET /api/data/gameweek-context
GET /api/fpl/bootstrap-static
GET /api/fpl/fixtures
GET /api/fpl/entry/:teamId
GET /api/fpl/entry/:teamId/event/:eventId/picks
GET /api/fpl/entry/:teamId/transfers
GET /api/fpl/element-summary/:elementId
```

Response contracts should include:

- A predictable `data` property where appropriate.
- A simple `generatedAt` value for cached analytics.
- Consistent error responses such as `{ error: string }`.
- No sensitive fields or internal storage details.

Defer feature-importance, training-data exploration, complex pagination, and advanced league tools until there is a clear hobby-project use case.

## Phase 4: Simplify frontend data access

Add or keep a small shared client service:

```text
frontend/src/services/apiClient.ts
frontend/src/services/dataApi.ts
frontend/src/services/fpl.ts
```

Then update:

- `frontend/src/hooks/useFPLData.ts`: use `dataApi` methods instead of direct legacy calls.
- `frontend/src/services/fpl.ts`: use `/api/fpl/*` routes rather than the Vite proxy assumption.
- `frontend/src/services/dataFactory.ts`: use the HTTP provider as the default.
- `frontend/src/services/sqliteService.ts`: remove from the production path, then remove `sql.js` only after confirming it is unused.
- `frontend/src/components/DataView.tsx`: replace the hard-coded `http://localhost:3000` URL with the shared API service.
- `frontend/src/components/LeagueAnalysis.tsx`: keep a basic loading and error state.
- `frontend/src/components/UpdateButton.tsx`: remove it for now, or make it a simple link/informational status.
- `frontend/src/hooks/useKeepAlive.ts`: remove from `App.tsx` and delete the hook when Render is no longer used.

No frontend request should use:

```text
http://localhost:3000
/ai-api
```

## Phase 5: Keep data refreshes simple

- Refresh the data manually from the existing pipeline or run a basic Databricks schedule.
- Display the last successful refresh time if it is already available.
- Do not expose a public update endpoint or wait for jobs from the browser.
- Revisit automated updates only when manual refresh becomes inconvenient.

## Phase 6: Add basic safeguards

- Validate the team ID, player ID, and other route parameters used by the current UI.
- Cap obvious oversized requests.
- Add modest cache headers for read-only analytics data.
- Show a user-friendly error when Databricks or the FPL API is unavailable.
- Keep the core dashboard usable if optional predictions fail.

## Phase 7: Security basics

- Never expose `DATABRICKS_TOKEN` to client-side code.
- Do not prefix Databricks secrets with `VITE_`.
- Do not accept arbitrary SQL from query parameters.
- Do not return raw database JSON blobs unless required by a typed contract.
- Configure the required Vercel environment variables without exposing them to the browser.
- Do not add an unauthenticated update or administrative endpoint.
- Keep requests same-origin; no permissive CORS configuration is needed.

## Phase 8: Verification

### Local checks

- Run `npm run lint`.
- Run `npm run build`.
- Test the dashboard and the small set of API endpoints with valid and invalid IDs.
- Confirm no browser bundle contains Databricks credentials.

### Functional checks

- Initial dashboard load.
- Team ID lookup.
- Team picks and transfer history.
- Fixtures view.
- Player analysis and player detail modal.
- Predictions and gameweek context when available.
- Basic league analysis when available.
- Refresh on nested SPA routes.
- Optional analytics unavailable while core data remains usable.

### Vercel Preview checks

- Confirm the required functions are deployed.
- Confirm environment variables are present.
- Confirm browser network requests contain no `localhost` or `/ai-api` URLs.
- Confirm API routes are not rewritten to `index.html`.
- Confirm cold-start and warehouse latency are acceptable for personal use.
- Confirm update behavior is intentionally disabled or handled outside Vercel.

## Implementation order

1. Add Vercel configuration and environment template.
2. Keep or add the small shared API client and contracts.
3. Implement only the Databricks and FPL routes used by the dashboard.
4. Refactor frontend services away from `/ai-api`, `localhost`, and SQLite.
5. Remove keep-alive, the public update button, and unused SQLite dependencies.
6. Add basic validation, caching, and error handling.
7. Run lint/build and validate a Vercel Preview deployment.

## Completion criteria

- The frontend runs on Vercel without a separate proxy server.
- All browser API calls are same-origin `/api/*` requests.
- Databricks credentials are server-only.
- The core dashboard, fixtures, predictions, and FPL team data load through documented APIs.
- SQLite is no longer downloaded or queried in the browser.
- Data refreshes are handled manually or by a simple external schedule.
- SPA navigation and refresh work on all routes.
- Lint, build, basic endpoint, security, and Preview checks pass.

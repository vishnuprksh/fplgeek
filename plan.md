# FPL Geek: Vercel + Databricks Frontend Migration Plan

## Goal

Deploy the React/Vite frontend on Vercel while using Databricks SQL Warehouse as the analytics data source. The browser must communicate only with same-origin API endpoints; Databricks credentials must remain server-side.

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
          Scheduled Databricks pipeline/jobs
```

## Scope and decisions

- Keep the existing Vite + React frontend; do not migrate to Next.js initially.
- Add server-side Vercel API functions for Databricks and official FPL API access.
- Replace browser-side SQLite/SQL.js loading with HTTP APIs.
- Use scheduled Databricks Jobs for data refreshes where possible.
- Treat the public update button as a separate decision: secure it behind authentication or replace it with scheduled refresh status.
- Remove the Render keep-alive behavior when Vercel is the deployment target.

## Phase 1: Establish Vercel project configuration

- Configure the Vercel project root and build settings.
- Build command: `npm run build` from `frontend/`.
- Output directory: `frontend/dist` or `dist` when `frontend/` is the project root.
- Add SPA fallback routing to `index.html` without intercepting `/api/*`.
- Add `.env.example` and ensure `.env*` files are ignored except `.env.example`.

## Phase 2: Implement server-side API infrastructure

Create a server-only API layer, for example:

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
    feature-importance.ts
    gameweek-context.ts
    training-data.ts
  update-status.ts
  update-data.ts
lib/
  databricks.ts
  fpl-api.ts
  validation.ts
```

The Databricks client must:

- Read credentials only from server-side environment variables.
- Execute predefined, parameterized queries.
- Poll asynchronous SQL statements until completion.
- Apply timeouts and result limits.
- Normalize rows into frontend-facing DTOs.
- Avoid exposing raw SQL or internal Databricks errors.

Required environment variables:

```text
DATABRICKS_HOST
DATABRICKS_TOKEN
DATABRICKS_HTTP_PATH
DATABRICKS_WAREHOUSE_ID
DATABRICKS_CATALOG=workspace
DATABRICKS_SCHEMA=fplgeek
```

## Phase 3: Define API contracts

Use stable JSON contracts instead of returning raw table rows.

### Read-only endpoints

```text
GET /api/data/predictions
GET /api/data/league-analysis
GET /api/data/feature-importance
GET /api/data/gameweek-context
GET /api/data/training-data?position=MID&page=1&pageSize=50&search=name
GET /api/fpl/bootstrap-static
GET /api/fpl/fixtures
GET /api/fpl/entry/:teamId
GET /api/fpl/entry/:teamId/event/:eventId/picks
GET /api/fpl/entry/:teamId/transfers
GET /api/fpl/element-summary/:elementId
```

Response contracts should include:

- A predictable `data` property where appropriate.
- Metadata such as `generatedAt`, pagination totals, or gameweek context.
- Consistent error responses such as `{ error: string }`.
- No sensitive fields or internal storage details.

## Phase 4: Refactor frontend data access

Add shared client services:

```text
frontend/src/services/apiClient.ts
frontend/src/services/dataApi.ts
frontend/src/services/fpl.ts
```

Then update:

- `frontend/src/hooks/useFPLData.ts`: replace direct `/ai-api` calls with `dataApi` methods and validate responses.
- `frontend/src/services/fpl.ts`: use `/api/fpl/*` routes rather than the Vite proxy assumption.
- `frontend/src/services/dataFactory.ts`: replace the SQLite-first provider with an HTTP provider.
- `frontend/src/services/sqliteService.ts`: remove from the production path; delete `sql.js` dependencies after confirming no remaining usage.
- `frontend/src/components/DataView.tsx`: replace the hard-coded `http://localhost:3000` URL with the shared API service.
- `frontend/src/components/LeagueAnalysis.tsx`: use typed API responses and shared error handling.
- `frontend/src/components/UpdateButton.tsx`: connect only to the final secured update/status contract.
- `frontend/src/hooks/useKeepAlive.ts`: remove from `App.tsx` and delete the hook when Render is no longer used.

No frontend request should use:

```text
http://localhost:3000
/ai-api
```

## Phase 5: Handle data refreshes

The current FastAPI update flow launches a local shell process and is not suitable for a Vercel serverless function.

Choose one implementation:

1. **Preferred:** schedule the pipeline with Databricks Jobs and expose read-only update status.
2. Trigger a Databricks Job from a protected Vercel endpoint.
3. Keep update execution on a persistent backend and call it through a configured server URL.
4. Remove the public update button and display the last successful pipeline timestamp.

If an update endpoint remains public-facing:

- Require authentication or an admin secret handled server-side.
- Add rate limiting.
- Prevent concurrent runs.
- Return a job identifier rather than waiting for completion.
- Poll job status from the UI with a bounded timeout.

## Phase 6: Add validation, caching, and resilience

- Validate team, player, fixture, position, page, page size, and limit parameters.
- Whitelist sortable fields and filter values.
- Cap page sizes and query result counts.
- Use cache headers for read-only analytics data.
- Suggested cache duration: 5–15 minutes for bootstrap/predictions and 15–60 minutes for training and league analysis.
- Do not cache user-specific team picks.
- Handle warehouse startup latency and asynchronous query timeouts.
- Preserve core dashboard data when optional prediction or league endpoints fail.
- Show user-friendly errors while logging detailed server-side diagnostics.

## Phase 7: Security requirements

- Never expose `DATABRICKS_TOKEN` to client-side code.
- Do not prefix Databricks secrets with `VITE_`.
- Do not accept arbitrary SQL from query parameters.
- Do not return raw database JSON blobs unless required by a typed contract.
- Configure Vercel environment variables separately for Development, Preview, and Production.
- Rotate the Databricks token regularly.
- Restrict update operations and administrative endpoints.
- Configure CORS only if a separate backend is retained; same-origin Vercel functions do not require permissive CORS.

## Phase 8: Verification

### Local checks

- Run `npm run lint`.
- Run `npm run build`.
- Test every API endpoint with valid, invalid, empty, and oversized parameters.
- Confirm Databricks async polling and timeout behavior.
- Confirm no browser bundle contains Databricks credentials.

### Functional checks

- Initial dashboard load.
- Team ID lookup.
- Team picks and transfer history.
- Fixtures view.
- Player analysis and player detail modal.
- Predictions and gameweek context.
- League analysis.
- Training data pagination and search.
- Refresh on nested SPA routes.
- Optional analytics unavailable while core data remains usable.

### Vercel Preview checks

- Confirm all functions are deployed.
- Confirm Preview and Production environment variables are present.
- Confirm browser network requests contain no `localhost` or `/ai-api` URLs.
- Confirm API routes are not rewritten to `index.html`.
- Confirm cold-start and stopped-warehouse latency are acceptable.
- Confirm update behavior is secured, scheduled, or intentionally disabled.

## Implementation order

1. Add Vercel configuration and environment template.
2. Add typed API contracts and shared frontend API client.
3. Implement Databricks server-side client.
4. Implement read-only Databricks API routes.
5. Implement server-side FPL proxy routes.
6. Refactor frontend services and hooks away from `/ai-api`, `localhost`, and SQLite.
7. Decide and implement the data-refresh strategy.
8. Remove keep-alive and unused SQLite dependencies.
9. Add validation, caching, and security controls.
10. Run lint/build and validate a Vercel Preview deployment.

## Completion criteria

- The frontend runs on Vercel without a separate proxy server.
- All browser API calls are same-origin `/api/*` requests.
- Databricks credentials are server-only.
- Predictions, league analysis, training data, fixtures, and FPL team data load through documented APIs.
- SQLite is no longer downloaded or queried in the browser.
- Data refreshes are handled by Databricks Jobs or a secured persistent backend.
- SPA navigation and refresh work on all routes.
- Lint, build, endpoint, security, and Preview checks pass.

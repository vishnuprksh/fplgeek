# Strategic Memories
### 2026-04-22 - Debugging Database Fetch Error
- **Context:** The frontend is reporting a 500 Internal Server Error when trying to fetch `/data/fpl.sqlite` via `sqliteService.ts`.
- **Decision:** Initializing investigation into the static file serving and Vite configuration.
- **Reasoning:** 500 error usually suggests a server-side issue or a misconfiguration in how the dev server (Vite) handles the request.

### 2026-04-22 - Resolution of 500 Error
- **Context:** The 500 error was caused by the Vite proxy failing to connect to the backend server (ECONNREFUSED).
- **Decision:** Started the backend server (`npm run dev` in `backend/`).
- **Reasoning:** The Vite configuration proxies `/data` to `localhost:3000`. If the backend is not running, Vite returns a 500 (standard behavior for proxy connection failure in some versions/configs).
- **Result:** Static database fetch now succeeds.

### 2026-04-22 - Removed Top Haul Candidates
- **Context:** User requested removal of the "Top Haul Candidates" section.
- **Decision:** Removed the summary section from [frontend/src/components/PlayerAnalysis.tsx](frontend/src/components/PlayerAnalysis.tsx).
- **Reasoning:** Simplifying the UI as per user request.

# Project Overview: FPL Geek
**North Star:** Provide the most accurate FPL haul predictions and squad optimizations through ML.
**Core Architecture:** React (Frontend) + Python/FastAPI (Backend) + SQLite/Postgres (Database).
**Guiding Principles:** 
- Visual excellence with premium dark mode aesthetics.
- Data-driven decision making using Random Forest models.
- "One-click" data refresh pipelines.
**Constraints:** Local development environment with optional cloud deployment.
- **Data Layer:** Backend `/data/` folder as single source of truth, served via `/api/data/*` endpoints
- **Database:** SQLite (script-generated, queried by backend, consumed by frontend via SQL.js)
- **AI/ML:** Unified Random Forest model (Scikit-learn) with position as input feature
- **Feature Vector:** 19 dimensions (9 context + 9 rolling-6 + 1 position encoding)
- Seamless integration between AI predictions and squad optimization.
- Local-first approach for database access in the frontend where possible.
- **Single source of truth:** Backend `/data/` folder, served via API (no manual sync)
**Constraints:** 
- Relies on FPL API for real-time data.
- Frontend uses SQL.js to query a local SQLite file (served via backend API).
- Data updates require backend script execution (fetch_league_data.py, update_fixtures.py, model_manager_unified.py).

# Project Overview: FPL Geek
**North Star:** Provide a comprehensive tool for Fantasy Premier League (FPL) players to analyze data, predict player performance using AI, and optimize their squads.
**Core Architecture:** 
- **Frontend:** React (Vite, TypeScript) + SQL.js for local database
- **Backend:** Node.js (Express, TypeScript) with unified data API
- **Data Layer:** Backend `/data/` folder as single source of truth, served via `/api/data/*` endpoints
- **Database:** SQLite (script-generated, queried by backend, consumed by frontend via SQL.js)
- **AI/ML:** Unified Random Forest model (Scikit-learn) with position as input feature
- **Feature Vector:** 19 dimensions (9 context + 9 rolling-6 + 1 position encoding)
**Guiding Principles:** 
- Data-driven decision making.
- Seamless integration between AI predictions and squad optimization.
- Local-first approach for database access in the frontend where possible.
- **Single source of truth:** Backend `/data/` folder, served via API (no manual sync)
**Constraints:** 
- Relies on FPL API for real-time data.
- Frontend uses SQL.js to query a local SQLite file (served via backend API).
- Data updates require backend script execution (fetch_league_data.py, update_fixtures.py, model_manager_unified.py).

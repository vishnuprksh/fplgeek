# Strategic Memories
### 2026-04-22 - Repository Cleanup (Throwaway & Obsolete Files)
- **Context:** User requested removal of all throwaway and obsolete files from the repository.
- **Decision:** Executed targeted cleanup removing 10 files/directories totaling ~142MB:
  - **Code:** `backend/backtest.ts` (unused prototype solver)
  - **Docs:** `AI_MODEL_ANALYSIS.md` (obsolete 4/10-game analysis), `DEPLOY.md`, `RENDER_DEPLOY.md` (old deployment guides)
  - **Config:** `frontend/.env.production` (old Render service config)
  - **Cache/Build:** `.mypy_cache/` (41M), `dist/` (55M), `frontend/dist/` (46M), `.tmp` files
  - **Logs:** `update_data.log` (transient)
- **Reasoning:** Keeps repo focused on active code, removes stale documentation, frees storage, reduces Git bloat. Caches are regenerated on demand.
- **Result:** Repository now contains only essential, current artifacts. Core structure preserved.

### 2026-04-22 - GW 33 Data Update Pipeline Complete
- **Context:** User requested update with latest GW data (2026, 33gw), retrain models, make predictions, update UI.
- **Decision:** Executed full pipeline: data fetch → preprocessing → model retraining → prediction generation → UI sync.
- **Results:**
  - **Data:** 33,988 new records ingested (56,331 total in DB)
  - **Datasets:** 63,550 samples generated (GKP: 7,262 | DEF: 20,796 | MID: 29,034 | FWD: 6,458)
  - **Models:** All 4 retrained (GKP: 77.91%/74.45% | DEF: 63.04%/58.86% | MID: 61.61%/58.91% | FWD: 66.07%/59.28%)
  - **Predictions:** 820 players with multi-gameweek projections (932KB JSON)
  - **Status:** Backend (3000) & Frontend (5173) running, data synced to `/frontend/public/data/`

### 2026-04-22 - Reduced Input Features to Rolling-6
- **Context:** User requested simplifying the model by replacing the 4/10-game dual window with a single 6-game window.
- **Decision:** Decreased feature complexity to 18 total features per sample (9 context + 9 rolling).
- **Reasoning:** Streamlining input features can sometimes improve generalization and simplifies the UI for the user. Rolling 6 is a common metric in FPL (short-medium term form).

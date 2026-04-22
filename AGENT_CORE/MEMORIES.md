# Strategic Memories
### 2026-04-22 - Unified Model Migration: 4 Position-Specific → 1 Universal
- **Context:** User requested switch from position-specific models to single unified model using position as input feature.
- **Decision:** Complete architecture change to single Random Forest classifier with position encoding.
- **Changes:**
  - **Config:** Added NUM_POS_FEATURES=1, updated INPUT_DIM: 18→19
  - **Features:** Position encoded as numeric (0=GKP, 1=DEF, 2=MID, 3=FWD) appended to 18D vector
  - **Training:** Unified model trained on 55,486 samples from all positions
  - **Models:** Deleted 4 position-specific models, replaced with model_unified.joblib (6.7MB)
  - **Performance:** Test Acc 0.6122, MAE 1.0956 (comparable to position-specific models)
- **Reasoning:** Unified approach allows model to learn position-aware patterns directly. Simplifies deployment, reduces model size (one scaler vs. four), enables position as learned feature.
- **Impact:** 820 predictions generated; frontend receives position in prediction JSON; UI position filter still works for data display filtering.
- **Files:** preprocessing_dataset.ts (+position encoding), config.py, model_manager_unified.py (new), feature_importance_unified.py (new)

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

# Strategic Memories

### 2026-04-24 - Data API Implementation: Single Source of Truth via Backend
- **Context:** Data was split between `/data/` (source) and `frontend/public/data/` (sync copies). Manual sync needed after updates. Wanted unified API delivery system.
- **Solution:** Created backend API endpoints (`/api/data/*`) that serve from root `/data/` folder, eliminating sync complexity.
- **Architecture:**
  1. **Data Collection:** Scripts write to `/data/` (ai_predictions.json, fixtures.json, league_analysis.json, feature_importance.json, fpl.sqlite)
  2. **Backend API Layer:** New routes serve files via `/api/data/*` with security checks (allowlist for JSON/SQLite files)
  3. **Frontend Data Provider:** dataFactory.ts, useFPLData.ts, components updated to fetch from `/ai-api/api/data/*` (Vite proxy rewrite)
  4. **Fallback Strategy:** SQLite provider still queries database if API fails
- **Endpoints Created:**
  - `GET /api/data/predictions` → ai_predictions.json
  - `GET /api/data/fixtures` → fixtures.json
  - `GET /api/data/league-analysis` → league_analysis.json
  - `GET /api/data/feature-importance` → feature_importance.json
  - `GET /api/data/:filename` → Generic handler with allowlist (predictive docs + fpl.sqlite)
- **Frontend Changes:**
  - dataFactory.ts: `/data/ai_predictions.json` → `/ai-api/api/data/predictions`
  - useFPLData.ts: `/data/league_analysis.json` → `/ai-api/api/data/league-analysis`
  - LeagueAnalysis.tsx: `/data/league_analysis.json` → `/ai-api/api/data/league-analysis`
  - AnalysisView.tsx: `/data/feature_importance.json` → `/ai-api/api/data/feature-importance`
  - sqliteService.ts: `/data/ai_predictions.json` → `/ai-api/api/data/predictions`; `/data/fpl.sqlite` → `/ai-api/api/data/fpl.sqlite`
- **Key Benefits:**
  - ✓ No manual sync required between `/data/` and `frontend/public/data/`
  - ✓ Single source of truth (backend `/data/` folder)
  - ✓ Automatic updates: Scripts modify `/data/` → API serves latest immediately
  - ✓ Security: Allowlist prevents arbitrary file access
  - ✓ Scalable: Easy to add new data endpoints
  - ✓ Dev & Prod compatible: Same API path works in both environments via proxy
- **Status:** ✓ All endpoints tested and returning correct data

### 2026-04-23 - Single GW Optimization Fix: 4-Layer Architecture Implemented
- **Context:** Single GW (1w) optimization shows 0% haul gain, multi-GW (2-3w) works. Root cause: blind array indexing doesn't account for gameweek context.
- **Root Cause:** `calculateHaulFromProjections(pred, 1)` takes `projections[0]` without checking which gameweek it is. For 815 players, this is GW 33 (blank, 0% gain). Filter `p.totalForecast > 0` eliminates all 815 candidates, leaving only 5 outdated ones from Team 17.
- **Solution Architecture (4 Layers):**
  1. **Backend Metadata:** Added `/api/gameweek-context` endpoint to expose `{ currentGW, nextPlayGW, blankGWs }`
  2. **Frontend Types:** Created `frontend/src/types/gameweek.ts` with `PredictionMetadata`, `ValidatedProjection`, `NormalizedPrediction` interfaces
  3. **Data Utilities:** Created `frontend/src/utils/gameweekValidation.ts` with 7 functions: `isBlankGW()`, `isPastGW()`, `validateProjection()`, `normalizePrediction()`, `calculateValidatedHaul()`, `getSelectedGameweeks()`, `validateCandidatePool()`
  4. **Hook Integration:** Modified `useOptimization.ts` to accept `gameweekMetadata` param, use `getSelectedGameweeks()` instead of blind indexing, and add validation checkpoint counting filtered candidates
- **Key Fix:** Replaced `projections[i]` with explicit `getSelectedGameweeks(weeks, metadata)` → returns actual GW list
- **Implementation Status:** ✓ All layers complete and integrated. Frontend builds successfully without errors.
  - Layer 1: Backend metadata endpoint ✓
  - Layer 2: Frontend type system ✓
  - Layer 3: Data validation utilities ✓
  - Layer 4: Hook integration (Optimization + useFPLData + App) ✓
  - Layer 5 (NEW): Players page update ✓
- **Players Page Update (NEW):** Modified `PlayerAnalysis.tsx` to use gameweek metadata for prediction display:
  - Accepts `gameweekMetadata` prop from App
  - Uses `validateProjection()` to normalize predictions, filtering to GW 34+
  - Extracts individual GW hauls: gw1_haul (GW 34), gw2_haul (GW 35), gw3_haul (GW 36)
  - Updated table headers: "GW 34", "GW 35", "GW 36" (was "GW +1", "+2", "+3")
  - Calculates haul average only from non-blank weeks
  - Displays gameweek context badge in toolbar: "📊 GW 34-36"
  - Result: Accurate predictions for GW 34-36, properly skipping blank GW 33
- **API Proxy Lesson:** Vite dev server proxy to `/ai-api` prefix with rewrite. Frontend must call `/ai-api/api/gameweek-context` which gets rewritten to `/api/gameweek-context` before proxying to backend at `http://localhost:3000`.
- **Testing Blocker:** Browser automation tools unstable when interacting with page. Manual UI testing recommended.

### 2026-04-23 - Disabled Pruning for Exhaustive Optimization
- **Context:** User wanted guaranteed optimal transfers, not fast approximations. Willing to accept 1-2s UI latency.
- **Decision:** Removed conditional pruning logic in `optimizeWithAllowance()` that limited removal candidates to bottom 10 players.
- **Change:** Now always considers all 15 squad members for exhaustive search across all allowances 1-11.
- **Impact:**
  - Allowance 5: C(15,5) = 3,003 combos (same as before)
  - Allowance 8: C(15,8) = 6,435 combos (was C(10,8) = 45 with pruning) → 143x slower
  - Allowance 11: C(15,11) = 1,365 combos (was C(10,10) = 1) → same
- **Trade-off:** Sacrifice 80-90% speed improvement for guaranteed optimality (no edge cases with budget arbitrage missed).
- **File Modified:** frontend/src/utils/solver.ts (removed if/else pruning logic, now just `eligibleIndices = currentSquad.map((_, i) => i)`)
- **Two-phase for allowance > 11 unchanged:** Still uses strategic decomposition (XI first, bench second) not pruning.

### 2026-04-23 - Fresh Server Restart
- **Context:** User requested to "restart again" after workspace cleanup.
- **Action:** Terminated PID 207149 (backend) and 207266 (frontend). Started fresh instances.
- **Reasoning:** Ensures any stale environment state or cached files from before the cleanup are cleared.
- **Status:** Development environment fresh and active.

### 2026-04-23 - Second Workspace Cleanup
- **Context:** User requested removal of throwaway, test, old, and obsolete files.
- **Removed:**
  - `backend/scripts/model_manager.py` & `feature_importance.py` (old TF/Keras, 18D, position-specific — superseded by unified versions)
  - `backend/sqliteRepository.ts`, `backend/src/types.ts`, `backend/src/db/repository.ts` (orphaned — never imported by server.ts or any active code)
  - `backend/scripts/update_fixtures_db.py` (reads `live_fixtures.json` which doesn't exist — superseded by `update_fixtures.py`)
  - `data/model_accuracy_report.md` (stale 4-model stats), `data/haul_audit_top20.csv` (one-off artifact)
  - `frontend/public/fpl.sqlite` (stale 80MB at wrong path; active db is `frontend/public/data/fpl.sqlite`)
  - `data/processed/dataset_*.json` (gitignored generated artifacts)
- **Fixed:** `scripts/update_data.sh` steps 3&4 now call `model_manager_unified.py` (was still calling deleted `model_manager.py`)

### 2026-04-23 - Restarted Development Servers
- **Context:** User requested to "restart localhosts".
- **Action:** Started `npm run dev:backend` (port 3000) and `npm run dev` (port 5173) in persistent background terminals.
- **Verification:** Confirmed listening ports via `lsof`.
- **Status:** Development environment active.

### 2026-04-22 - Synced Fixture Page to Predictions (3-Week Window)
- **Context:** User requested fixture page to show GW 34, 35, 36 in sync with predictions.
- **Solution:** Changed FixtureAnalysis default lookahead from 5 weeks to 3 weeks.
- **Impact:** Fixture page now displays focused 3-week window matching prediction scope (GW 34-36).
- **File:** frontend/src/components/FixtureAnalysis.tsx (default weeks state: 5→3)
- **UX:** Users can still expand via dropdown to 5 or 8 weeks for longer-term planning.
- **Benefit:** Fixture ticker and predictions now show same gameweeks, improving decision-making coherence.

### 2026-04-22 - Fixed Missing GW Values in AI Predictions
- **Context:** User asked which GWs are predicted. Investigation revealed all GW values showing as 0.
- **Root Cause:** Metadata stored in preprocessed_data table was missing `gw` field even though gw was stored as separate DB column.
- **Solution:** Updated preprocessing_dataset.ts metadata JSON to include `gw`, `season`, and `target` fields.
- **Verification:** After reprocessing and retraining, predictions now correctly show GW 34, 35, 36 (3 weeks ahead from GW 33).
- **Predictions:** 820 players with 3-week forecasts across GWs 34-36, plus 5 test samples in GWs 30-32.
- **Files Modified:** backend/scripts/preprocessing_dataset.ts (metadata creation)
- **Lesson Learned:** Database column data doesn't automatically propagate to JSON metadata; must explicitly include all needed fields in metadata JSON serialization.

### 2026-04-22 - Fixture Database Update and Frontend Sync
- **Context:** User requested updating the fixture page alongside GW 33 data update.
- **Action:** Created update_fixtures.py (API fetch) and export_fixtures.py (JSON export).
- **Process:**
  1. Fetched 380 fixtures from FPL API endpoints
  2. Stored in SQLite fixtures table
  3. Exported to JSON for frontend consumption
  4. Copied to frontend/public/data/fixtures.json
- **Data:** 330 finished, 49 upcoming across 38 gameweeks
- **Impact:** FixtureAnalysis component now displays current fixture data with difficulty ratings, team schedules, and upcoming fixtures.
- **Files:** update_fixtures.py (new), export_fixtures.py (new), fixtures.json (2.2MB)

### 2026-04-22 - GW 33 Data Update and Model Improvement
- **Context:** User requested data collection up to GW 32. Found data was only at GW 29, fetched all the way to GW 33.
- **Action:** Created update_current_gw.py to fetch from FPL API element-summary endpoints.
- **Results:**
  - **Fetched:** 824/829 players with GW 33 history (5 timeouts)
  - **Data:** 85,995 samples (↑35% from 63,550 at GW29)
  - **Model Performance:** Improved accuracy by 2.6%, reduced MAE by 7%
  - **Feature Shift:** r6_inf (Influence) now top predictor instead of r6_min
  - **Predictions:** 820 players with updated forecasts
- **Key Insight:** More data improves prediction quality. Feature importance shifted toward involvement metrics (influence, recent points) over raw minutes played.
- **Files Updated:** update_current_gw.py (new), model_unified.joblib (retrained), ai_predictions.json, feature_importance.json

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

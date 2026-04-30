# Strategic Memories

### 2026-04-30 - Cleanup of Legacy TypeScript Components
- **Context:** Following the backend migration to Python, several TypeScript files and processed JSON datasets became redundant.
- **Decision:** Removed `backend/lib/database.ts`, `backend/lib/ingestData.ts`, JSON files in `data/processed/`, and finally `backend/scripts/preprocessing_dataset.ts`. Updated `update_data.sh` to use the Python version.
- **Reasoning:** Streamlining the project structure reduces maintenance overhead and prevents confusion about the source of truth for processed data. Using SQLite exclusively for intermediate storage is more efficient and reliable than maintaining multiple JSON files. Verified that the Python script produces correct feature vectors for the model training pipeline.

### 2025-06-XX - Full Backend Simplification Rewrite
- **Context:** Backend had grown to 10+ scripts, Postgres dependency, redundant abstractions, and dead lib/ code.
- **Decision:** Removed Postgres entirely; consolidated 10 scripts into 3; deleted database.py, ingest.py, lib/; rewrote main.py to 145 lines.
- **Reasoning:** Simplicity wins. SQLite is sole DB. JSON files in `data/` are API source of truth. Pipeline is now: `fetch_data.py` → `preprocess.py` → `train_predict.py`. Backend venv at `backend/venv/`; requires ML packages (installed).

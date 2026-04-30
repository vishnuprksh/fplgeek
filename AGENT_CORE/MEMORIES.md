# Strategic Memories

### 2026-04-30 - Cleanup of Legacy TypeScript Components
- **Context:** Following the backend migration to Python, several TypeScript files and processed JSON datasets became redundant.
- **Decision:** Removed `backend/lib/database.ts`, `backend/lib/ingestData.ts`, JSON files in `data/processed/`, and finally `backend/scripts/preprocessing_dataset.ts`. Updated `update_data.sh` to use the Python version.
- **Reasoning:** Streamlining the project structure reduces maintenance overhead and prevents confusion about the source of truth for processed data. Using SQLite exclusively for intermediate storage is more efficient and reliable than maintaining multiple JSON files. Verified that the Python script produces correct feature vectors for the model training pipeline.

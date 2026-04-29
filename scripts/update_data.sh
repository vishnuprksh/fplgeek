#!/bin/bash

# Exit on any error
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "--------------------------------------------------"
echo "🚀 Starting Full Data Update Pipeline"
echo "--------------------------------------------------"

# Support --docker flag to run inside the running server container
if [[ "$1" == "--docker" ]]; then
    echo "🐳 Running pipeline inside Docker container..."

    echo "📥 Step 1: Ingesting latest data..."
    docker compose -f "$REPO_ROOT/docker-compose.yml" exec server python3 backend/scripts/ingest_historical_gw.py

    echo "📊 Step 2: Generating datasets..."
    docker compose -f "$REPO_ROOT/docker-compose.yml" exec server npx tsx scripts/preprocessing_dataset.ts

    echo "⚠️  Step 3 & 4 (AI training/prediction) must be run locally — Python/venv not available in the server container."
    echo "   Run: bash scripts/update_data.sh (without --docker) to train and generate predictions locally."
    exit 0
fi

# --- Local execution ---

cd "$REPO_ROOT/backend"

# 0. Update fixtures to get current GW state
echo "🗓️ Step 0: Updating fixtures..."
python3 scripts/update_fixtures.py
python3 scripts/export_fixtures.py

# 1a. Fetch current season GW data from FPL API (mark GW34 as played)
echo "📥 Step 1a: Updating current season GW data..."
python3 scripts/update_current_gw.py

# 1. Ingest latest data from FPL API (using Python scripts)
echo "📥 Step 1: Ingesting latest data..."
python3 scripts/ingest_historical_gw.py

# 2. Generate ML datasets
echo "📊 Step 2: Generating datasets..."
npx tsx scripts/preprocessing_dataset.ts

# 3. Retrain AI Models
echo "🧠 Step 3: Retraining AI models..."
source "$REPO_ROOT/venv/bin/activate"
export PYTHONPATH="$REPO_ROOT/backend/scripts"
python3 scripts/model_manager_unified.py

# 4. Generate Predictions
echo "🔮 Step 4: Generating future predictions..."
python3 scripts/model_manager_unified.py --predict

# 5. Refresh league ownership data
echo "🏆 Step 5: Refreshing league ownership data..."
python3 scripts/fetch_league_data.py

deactivate

echo "--------------------------------------------------"
echo "✅ Data Update Pipeline Completed Successfully!"
echo "--------------------------------------------------"

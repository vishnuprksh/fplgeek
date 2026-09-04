#!/bin/bash
set -e

# Usage: ./scripts/update_data.sh [--no-fetch]
#   --no-fetch : skip fetching FPL data and retrain/predict from existing DB data
SKIP_FETCH=false
if [ "$1" == "--no-fetch" ]; then
  SKIP_FETCH=true
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/backend"

source "$REPO_ROOT/backend/venv/bin/activate"

if [ "$SKIP_FETCH" = true ]; then
  echo "--- Skipping fetch (using existing DB data) ---"
else
  echo "--- Step 1: Fetching FPL data ---"
  python3 scripts/fetch_data.py
fi

echo "--- Step 2: Preprocessing ---"
python3 scripts/preprocess.py

echo "--- Step 3: Training & Predicting ---"
python3 scripts/train_predict.py

deactivate
echo "--- Done ---"

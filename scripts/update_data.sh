#!/bin/bash
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/backend"

source "$REPO_ROOT/backend/venv/bin/activate"

echo "--- Step 1: Fetching FPL data ---"
python3 scripts/fetch_data.py

echo "--- Step 2: Preprocessing ---"
python3 scripts/preprocess.py

echo "--- Step 3: Training & Predicting ---"
python3 scripts/train_predict.py

deactivate
echo "--- Done ---"

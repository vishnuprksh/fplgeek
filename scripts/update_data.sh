#!/bin/bash

# Exit on any error
set -e

echo "--------------------------------------------------"
echo "🚀 Starting Full Data Update Pipeline"
echo "--------------------------------------------------"

# 1. Ingest latest data from FPL API
echo "📥 Step 1: Ingesting latest data..."
npm run ingest:local

# 2. Generate datasets for AI training
echo "📊 Step 2: Generating datasets..."
npx tsx src/scripts/generate_dataset.ts

# 3. Retrain AI Models
echo "🧠 Step 3: Retraining AI models..."
source venv/bin/activate
export PYTHONPATH=$PYTHONPATH:.
python3 src/scripts/ai_manager.py

# 4. Generate Predictions
echo "🔮 Step 4: Generating future predictions..."
python3 src/scripts/ai_manager.py --predict

echo "--------------------------------------------------"
echo "✅ Data Update Pipeline Completed Successfully!"
echo "--------------------------------------------------"

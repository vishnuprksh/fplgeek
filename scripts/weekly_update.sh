#!/bin/bash

# ==============================================================================
# FPL Geek Weekly Update Script
# Automates: Ingestion -> Dataset Generation -> Training -> Prediction
# ==============================================================================

# Exit on any error
set -e

# Configuration
LOG_FILE="weekly_update.log"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

echo "----------------------------------------------------------------" | tee -a $LOG_FILE
echo "🚀 Weekly Update Started at $TIMESTAMP" | tee -a $LOG_FILE
echo "----------------------------------------------------------------" | tee -a $LOG_FILE

# 1. Ingest Latest Data from FPL API
echo "📥 [1/4] Ingesting latest FPL data..." | tee -a $LOG_FILE
npm run ingest:local >> $LOG_FILE 2>&1

# 2. Generate Feature-Engineered Datasets
echo "📊 [2/4] Generating processed datasets..." | tee -a $LOG_FILE
npx tsx src/scripts/generate_dataset.ts >> $LOG_FILE 2>&1

# 3. Train AI Models (Random Forest)
echo "🧠 [3/4] Retraining AI models..." | tee -a $LOG_FILE
python3 src/scripts/ai_manager.py >> $LOG_FILE 2>&1

# 4. Generate AI Predictions for Players Page
echo "🔮 [4/4] Generating future predictions..." | tee -a $LOG_FILE
python3 src/scripts/ai_manager.py --predict >> $LOG_FILE 2>&1

echo "----------------------------------------------------------------" | tee -a $LOG_FILE
echo "✅ Weekly Update Completed Successfully at $(date "+%Y-%m-%d %H:%M:%S")" | tee -a $LOG_FILE
echo "----------------------------------------------------------------" | tee -a $LOG_FILE

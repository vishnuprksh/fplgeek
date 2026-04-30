import time
from datetime import datetime
from database import (
    ingest_predictions,
    ingest_fixtures,
    ingest_league_analysis,
    ingest_feature_importance
)

async def handle_ingest_data(data: dict):
    """
    Handle data ingestion logic.
    Expects a dictionary with optional fields: predictions, fixtures, league_analysis, feature_importance
    """
    predictions = data.get('predictions')
    fixtures = data.get('fixtures')
    league_analysis = data.get('league_analysis')
    feature_importance = data.get('feature_importance')

    if not any([predictions, fixtures, league_analysis, feature_importance]):
        raise ValueError("At least one data field must be provided")

    start_time = time.time()
    results = []

    if predictions and isinstance(predictions, list):
        ingest_predictions(predictions)
        results.append(f"Ingested {len(predictions)} predictions")

    if fixtures and isinstance(fixtures, list):
        ingest_fixtures(fixtures)
        results.append(f"Ingested {len(fixtures)} fixtures")

    if league_analysis:
        ingest_league_analysis(league_analysis)
        results.append("Ingested league analysis")

    if feature_importance:
        ingest_feature_importance(feature_importance)
        results.append("Ingested feature importance")

    duration = int((time.time() - start_time) * 1000)

    return {
        "success": True,
        "message": "Data ingestion completed successfully",
        "results": results,
        "duration_ms": duration,
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    import os
    import json
    import asyncio
    from database import DATA_DIR
    
    async def main():
        print(f"Starting local ingestion from {DATA_DIR}...")
        data = {}
        
        # Load predictions
        pred_path = os.path.join(DATA_DIR, 'ai_predictions.json')
        if os.path.exists(pred_path):
            with open(pred_path, 'r') as f:
                data['predictions'] = json.load(f)
        
        # Load fixtures
        fix_path = os.path.join(DATA_DIR, 'fixtures.json')
        if os.path.exists(fix_path):
            with open(fix_path, 'r') as f:
                data['fixtures'] = json.load(f)
                
        # Load league analysis
        league_path = os.path.join(DATA_DIR, 'league_analysis.json')
        if os.path.exists(league_path):
            with open(league_path, 'r') as f:
                data['league_analysis'] = json.load(f)
                
        # Load feature importance
        feat_path = os.path.join(DATA_DIR, 'feature_importance.json')
        if os.path.exists(feat_path):
            with open(feat_path, 'r') as f:
                data['feature_importance'] = json.load(f)
                
        if not data:
            print("No data files found to ingest.")
            return

        try:
            result = await handle_ingest_data(data)
            print(f"Ingestion complete: {result['message']}")
            for r in result['results']:
                print(f" - {r}")
        except Exception as e:
            print(f"Ingestion failed: {e}")

    asyncio.run(main())

import os
import json
import asyncio
import subprocess
from datetime import datetime
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Request, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from database import (
    DATA_DIR, DB_PATH, DATABASE_URL,
    initialize_database, seed_initial_data, get_sqlite_connection,
    get_predictions, get_fixtures, get_league_analysis, get_feature_importance
)
from ingest import handle_ingest_data

app = FastAPI(title="FPL Geek API", version="1.0.0")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global status tracking
update_in_progress = False
last_update_time = datetime.fromtimestamp(0)

# Pydantic models for ingestion
class IngestData(BaseModel):
    predictions: Optional[List[dict]] = None
    fixtures: Optional[List[dict]] = None
    league_analysis: Optional[dict] = None
    feature_importance: Optional[dict] = None

@app.on_event("startup")
async def startup_event():
    if DATABASE_URL:
        try:
            initialize_database()
            seed_initial_data()
            print("✓ Postgres database initialized and seeded")
        except Exception as e:
            print(f"Warning: Failed to initialize Postgres database: {e}")
            print("Continuing with file-based fallback...")
    else:
        print("ℹ DATABASE_URL not configured. Using file-based data (local development).")

@app.get("/health")
def health_check():
    return {"status": "ok", "version": "1.0.0", "timestamp": datetime.now().isoformat()}

@app.get("/api/training-data")
def get_training_data(
    position: str = "MID",
    page: int = 1,
    pageSize: int = 50,
    search: str = ""
):
    pos = position.upper()
    query = search.lower()

    try:
        conn = get_sqlite_connection()
        cur = conn.cursor()
        
        sql = "SELECT gw, season, metadata, target_class FROM preprocessed_data WHERE position = ?"
        params = [pos]

        if query:
            sql += " AND metadata LIKE ?"
            params.append(f"%{query}%")

        cur.execute(sql, params)
        all_rows = cur.fetchall()
        conn.close()

        data = []
        for row in all_rows:
            meta = json.loads(row['metadata'])
            data.append({
                **meta,
                "gw": row['gw'],
                "season": row['season'],
                "target": row['target_class'],
                "is_future": meta.get('is_future', False)
            })

        start = (page - 1) * pageSize
        end = start + pageSize
        paginated_data = data[start:end]

        return {
            "data": paginated_data,
            "total": len(data),
            "page": page,
            "pageSize": pageSize,
            "totalPages": (len(data) + pageSize - 1) // pageSize
        }
    except Exception as e:
        print(f"Error serving training data: {e}")
        raise HTTPException(status_code=500, detail="Failed to load training data")

@app.get("/api/gameweek-context")
def get_gameweek_context():
    fixtures_path = os.path.join(DATA_DIR, 'fixtures.json')
    if not os.path.exists(fixtures_path):
        raise HTTPException(status_code=404, detail="Fixtures data not found")

    try:
        with open(fixtures_path, 'r') as f:
            fixtures = json.load(f)
        
        gw_stats = {}
        for fixture in fixtures:
            gw = fixture.get('event')
            if gw is None: continue
            
            if gw not in gw_stats:
                gw_stats[gw] = {"finished": 0, "total": 0}
            
            gw_stats[gw]["total"] += 1
            if fixture.get('finished'):
                gw_stats[gw]["finished"] += 1

        sorted_gws = sorted(gw_stats.items())
        blank_gws = [gw for gw, stats in sorted_gws if stats["total"] < 10]
        
        current_gw = 1
        for gw, stats in reversed(sorted_gws):
            if stats["finished"] > 0:
                current_gw = gw
                break
        
        next_play_gw = current_gw + 1
        for gw, stats in sorted_gws:
            if gw > current_gw and stats["finished"] == 0 and stats["total"] > 0:
                next_play_gw = gw
                break
        
        return {
            "currentGW": current_gw,
            "nextPlayGW": next_play_gw,
            "blankGWs": sorted(blank_gws),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        print(f"Error computing gameweek context: {e}")
        raise HTTPException(status_code=500, detail="Failed to compute gameweek context")

@app.get("/api/data/predictions")
def api_get_predictions():
    if DATABASE_URL:
        data = get_predictions()
        if data: return data
    
    path = os.path.join(DATA_DIR, 'ai_predictions.json')
    if os.path.exists(path):
        with open(path, 'r') as f:
            return json.load(f)
    raise HTTPException(status_code=404, detail="Predictions data not found")

@app.get("/api/data/fixtures")
def api_get_fixtures():
    if DATABASE_URL:
        data = get_fixtures()
        if data: return data
    
    path = os.path.join(DATA_DIR, 'fixtures.json')
    if os.path.exists(path):
        with open(path, 'r') as f:
            return json.load(f)
    raise HTTPException(status_code=404, detail="Fixtures data not found")

@app.get("/api/data/league-analysis")
def api_get_league_analysis():
    if DATABASE_URL:
        data = get_league_analysis()
        if data: return data
    
    path = os.path.join(DATA_DIR, 'league_analysis.json')
    if os.path.exists(path):
        with open(path, 'r') as f:
            return json.load(f)
    raise HTTPException(status_code=404, detail="League analysis data not found")

@app.get("/api/data/feature-importance")
def api_get_feature_importance():
    if DATABASE_URL:
        data = get_feature_importance()
        if data: return data
    
    path = os.path.join(DATA_DIR, 'feature_importance.json')
    if os.path.exists(path):
        with open(path, 'r') as f:
            return json.load(f)
    raise HTTPException(status_code=404, detail="Feature importance data not found")

@app.get("/api/data/{filename}")
def get_data_file(filename: str):
    allowed_files = ['ai_predictions.json', 'fixtures.json', 'league_analysis.json', 'feature_importance.json', 'fpl.sqlite']
    if filename not in allowed_files:
        raise HTTPException(status_code=403, detail="File not allowed")
    
    file_path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    if filename.endswith('.json'):
        with open(file_path, 'r') as f:
            return json.load(f)
    return FileResponse(file_path)

@app.post("/api/ingest-data")
async def ingest_data(data: IngestData):
    try:
        result = await handle_ingest_data(data.dict(exclude_none=True))
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Ingestion failed: {e}")
        raise HTTPException(status_code=500, detail="Data ingestion failed")

def run_update_script(repo_root: str):
    global update_in_progress, last_update_time
    try:
        update_script = os.path.join(repo_root, 'scripts', 'update_data.sh')
        print(f"🚀 Starting update pipeline: {update_script}")
        
        # Use subprocess.run for simplicity in background task
        result = subprocess.run(['bash', update_script], cwd=repo_root, capture_output=True, text=True)
        
        if result.returncode == 0:
            last_update_time = datetime.now()
            print("✅ Update pipeline completed successfully!")
        else:
            print(f"❌ Update pipeline failed with code {result.returncode}")
            print(f"stderr: {result.stderr}")
    except Exception as e:
        print(f"❌ Error during update pipeline: {e}")
    finally:
        update_in_progress = False

@app.post("/api/update-data")
async def trigger_update(background_tasks: BackgroundTasks):
    global update_in_progress
    if update_in_progress:
        raise HTTPException(status_code=400, detail="Update already in progress")
    
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    update_script = os.path.join(repo_root, 'scripts', 'update_data.sh')
    
    if not os.path.exists(update_script):
        raise HTTPException(status_code=404, detail="Update script not found")
    
    update_in_progress = True
    background_tasks.add_task(run_update_script, repo_root)
    
    return {
        "status": "started",
        "message": "Data update pipeline initiated. This may take 5-15 minutes.",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/api/update-status")
def get_update_status():
    predictions_path = os.path.join(DATA_DIR, 'ai_predictions.json')
    fixtures_path = os.path.join(DATA_DIR, 'fixtures.json')
    
    all_files_exist = os.path.exists(predictions_path) and os.path.exists(fixtures_path)
    
    pred_mtime = os.path.getmtime(predictions_path) if os.path.exists(predictions_path) else 0
    fixt_mtime = os.path.getmtime(fixtures_path) if os.path.exists(fixtures_path) else 0
    
    most_recent = max(pred_mtime, fixt_mtime)
    
    return {
        "isUpdating": update_in_progress,
        "status": "updating" if update_in_progress else "idle",
        "lastUpdateTime": datetime.fromtimestamp(most_recent).isoformat() if most_recent > 0 else datetime.fromtimestamp(0).isoformat(),
        "dataExists": all_files_exist,
        "predictionsUpdated": datetime.fromtimestamp(pred_mtime).isoformat() if pred_mtime > 0 else None,
        "fixturesUpdated": datetime.fromtimestamp(fixt_mtime).isoformat() if fixt_mtime > 0 else None
    }

# Serve the shared data directory
app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")

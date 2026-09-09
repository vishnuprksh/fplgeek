import os
import json
import sqlite3
import subprocess
from datetime import datetime
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

DATA_DIR = os.getenv('FPL_DATA_DIR', os.path.abspath(os.path.join(os.path.dirname(__file__), '../data')))
DB_PATH = os.path.join(DATA_DIR, 'fpl.sqlite')

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

update_in_progress = False

ALLOWED_FILES = ['fpl.sqlite']

def load_fixtures():
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.execute("SELECT data FROM fixtures")
        return [json.loads(row[0]) for row in cur.fetchall()]
    except sqlite3.OperationalError:
        raise HTTPException(404, "fixtures not found")
    finally:
        conn.close()

def load_app_data(key):
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.execute("SELECT value FROM app_data WHERE key = ?", (key,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, f"{key} not found")
        return json.loads(row[0])
    except sqlite3.OperationalError:
        raise HTTPException(404, f"{key} not found")
    finally:
        conn.close()

@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.get("/api/data/predictions")
def predictions():
    return load_app_data('ai_predictions')

@app.get("/api/data/fixtures")
def fixtures():
    return load_fixtures()

@app.get("/api/data/league-analysis")
def league_analysis():
    return load_app_data('league_analysis')

@app.get("/api/data/feature-importance")
def feature_importance():
    return load_app_data('feature_importance')

@app.get("/api/model-report")
def model_report():
    return load_app_data('model_report')

@app.get("/api/data/{filename}")
def data_file(filename: str):
    if filename not in ALLOWED_FILES:
        raise HTTPException(403, "File not allowed")
    path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(404, "File not found")
    return FileResponse(path)

@app.get("/api/gameweek-context")
def gameweek_context():
    fixtures = load_fixtures()
    gw_stats = {}
    for f in fixtures:
        gw = f.get('event')
        if gw is None:
            continue
        if gw not in gw_stats:
            gw_stats[gw] = {"finished": 0, "total": 0}
        gw_stats[gw]["total"] += 1
        if f.get('finished'):
            gw_stats[gw]["finished"] += 1

    sorted_gws = sorted(gw_stats.items())
    blank_gws = [gw for gw, s in sorted_gws if s["total"] < 10]

    current_gw = 1
    for gw, s in reversed(sorted_gws):
        if s["finished"] > 0:
            current_gw = gw
            break

    next_play_gw = current_gw + 1
    for gw, s in sorted_gws:
        if gw > current_gw and s["finished"] == 0 and s["total"] > 0:
            next_play_gw = gw
            break

    return {"currentGW": current_gw, "nextPlayGW": next_play_gw, "blankGWs": sorted(blank_gws)}

@app.get("/api/training-data")
def training_data(position: str = "MID", page: int = 1, pageSize: int = 50, search: str = ""):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    sql = "SELECT gw, season, metadata, target_class FROM preprocessed_data WHERE position = ?"
    params = [position.upper()]
    if search:
        sql += " AND metadata LIKE ?"
        params.append(f"%{search}%")
    cur.execute(sql, params)
    rows = cur.fetchall()
    conn.close()

    data = [{**json.loads(r['metadata']), "gw": r['gw'], "season": r['season'], "target": r['target_class']} for r in rows]
    start = (page - 1) * pageSize
    return {
        "data": data[start:start + pageSize],
        "total": len(data),
        "page": page,
        "pageSize": pageSize,
        "totalPages": (len(data) + pageSize - 1) // pageSize
    }

def run_update(repo_root):
    global update_in_progress
    try:
        script = os.path.join(repo_root, 'scripts', 'update_data.sh')
        subprocess.run(['bash', script], cwd=repo_root)
    finally:
        update_in_progress = False

@app.post("/api/update-data")
def trigger_update(background_tasks: BackgroundTasks):
    global update_in_progress
    if update_in_progress:
        raise HTTPException(400, "Update already in progress")
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    update_in_progress = True
    background_tasks.add_task(run_update, repo_root)
    return {"status": "started", "timestamp": datetime.now().isoformat()}

@app.get("/api/update-status")
def update_status():
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.execute("SELECT updated_at FROM app_data WHERE key = 'ai_predictions'")
        row = cur.fetchone()
        last_update = row[0] if row else None
        has_predictions = row is not None
        count = conn.execute("SELECT COUNT(*) FROM fixtures").fetchone()[0]
        has_fixtures = count > 0
    except sqlite3.OperationalError:
        last_update = None
        has_predictions = False
        has_fixtures = False
    finally:
        conn.close()
    return {
        "isUpdating": update_in_progress,
        "status": "updating" if update_in_progress else "idle",
        "lastUpdateTime": last_update,
        "dataExists": has_predictions and has_fixtures
    }

app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")

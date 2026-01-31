import json
import numpy as np
import pandas as pd
import tensorflow as tf
import sqlite3
import os

# Configuration
DATA_DIR = "public/data/processed"
MODELS_DIR = "public/models"
DB_PATH = "public/data/fpl.sqlite"
OUTPUT_FILE = "public/data/backtest_results.json"
POSITIONS = ["GKP", "DEF", "MID", "FWD"]

# Load Models (Global)
models = {}

def load_json(path):
    with open(path, "r") as f:
        return json.load(f)

def clean_and_scale(X_seq, X_ctx):
    # Same scaling as training
    X_seq = np.nan_to_num(X_seq, nan=0.0, posinf=0.0, neginf=0.0)
    X_ctx = np.nan_to_num(X_ctx, nan=0.0, posinf=0.0, neginf=0.0)
    
    scales_seq = np.array([90, 2.0, 1.0, 100, 100, 100, 5, 5, 15, 100, 15, 1, 20], dtype=np.float32)
    X_seq = X_seq / scales_seq.reshape(1, 1, -1)
    
    scales_ctx = np.array([1, 5, 15, 200], dtype=np.float32)
    X_ctx = X_ctx / scales_ctx.reshape(1, -1)
    
    return X_seq, X_ctx

def get_best_squad(predictions, budget=1000):
    # predictions: list of {id, name, team, type, cost, xp, actual}
    # Simple Greedy approach for now:
    # 1. Sort by XP
    # 2. Pick top: 1 GKP, 3 DEF, 3 MID, 1 FWD (Base 8)
    # 3. Fill remaining 3 slots with highest XP players from valid positions to make valid formation
    # Formation rules: 1 GKP, 3-5 DEF, 2-5 MID, 1-3 FWD.
    # Total 11 players.
    
    # Group by pos
    gkps = sorted([p for p in predictions if p['type'] == 1], key=lambda x: x['xp'], reverse=True)
    defs = sorted([p for p in predictions if p['type'] == 2], key=lambda x: x['xp'], reverse=True)
    mids = sorted([p for p in predictions if p['type'] == 3], key=lambda x: x['xp'], reverse=True)
    fwds = sorted([p for p in predictions if p['type'] == 4], key=lambda x: x['xp'], reverse=True)

    squad = []
    cost = 0

    # Force 1 GKP
    if gkps: squad.append(gkps.pop(0))
    
    # Force 3 DEF
    for _ in range(3): 
        if defs: squad.append(defs.pop(0))
        
    # Force 2 MID
    for _ in range(2): 
        if mids: squad.append(mids.pop(0))
        
    # Force 1 FWD
    for _ in range(1): 
        if fwds: squad.append(fwds.pop(0))
        
    # Fill remaining 4 spots with best available
    remaining = sorted(defs + mids + fwds, key=lambda x: x['xp'], reverse=True)
    
    # Naive fill (doesn't check strict formation max limits, but usually ok)
    # DEF max 5, MID max 5, FWD max 3
    def_count = 3
    mid_count = 2
    fwd_count = 1
    
    for p in remaining:
        if len(squad) >= 11: break
        
        if p['type'] == 2 and def_count < 5:
            squad.append(p)
            def_count += 1
        elif p['type'] == 3 and mid_count < 5:
            squad.append(p)
            mid_count += 1
        elif p['type'] == 4 and fwd_count < 3:
            squad.append(p)
            fwd_count += 1
            
    return squad

def main():
    print("Starting Backtest...")
    
    # Load Models
    for pos in POSITIONS:
        path = os.path.join(MODELS_DIR, f"model_{pos}.keras")
        if os.path.exists(path):
            models[pos] = tf.keras.models.load_model(path)
            print(f"Loaded {pos} model")

    # Load All Processed Data
    all_data = {} # pos -> list of samples
    for pos in POSITIONS:
        all_data[pos] = load_json(os.path.join(DATA_DIR, f"dataset_{pos}.json"))

    # Load Fixtures & Players from DB
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT data FROM fixtures")
    fixtures = [json.loads(r['data']) for r in cursor.fetchall()]
    
    cursor.execute("SELECT data FROM players")
    players = [json.loads(r['data']) for r in cursor.fetchall()]
    players_map = {p['id']: p for p in players}
    
    cursor.execute("SELECT data FROM events WHERE id='events'")
    events_row = cursor.fetchone()
    if events_row:
        events = json.loads(events_row['data'])
    else:
        events = []
    
    current_gw_obj = next((e for e in events if e['is_current']), None)
    if not current_gw_obj: current_gw = 23
    else: current_gw = current_gw_obj['id']
    
    conn.close()

    results = []
    
    # Backtest Loop: GW 11 to Current
    for gw in range(11, current_gw + 1):
        print(f"Analyzing GW {gw}...")
        
        # 1. Identify Fixtures for this GW
        gw_fixtures = [f for f in fixtures if f['event'] == gw]
        if not gw_fixtures: continue
        
        # 2. Predict Points for all players
        predictions = []
        
        for pos in POSITIONS:
            if pos not in models: continue
            model = models[pos]
            samples = all_data[pos]
            
            # Prepare Batch
            X_seq_list = []
            X_ctx_list = []
            X_opp_list = []
            meta_list = []
            
            for s in samples:
                # We need the sample RELEVANT to this GW.
                # In dataset.json, samples are history + target(GW).
                # So if sample['gw'] == gw, it means the target is THIS gw.
                # And sample['history_sequence'] is data BEFORE this gw.
                # This is exactly what we want for prediction test.
                # Note: Season must match. Assuming 25/26 (current).
                if s.get('season') == '25/26' and s['gw'] == gw:
                    # Construct Context
                    # dataset has 'ctx_*' fields for the target match already!
                    # So we can just use them directly.
                    
                    # BUT wait... does dataset.json store ONE sample per player per GW?
                    # Yes, generate_dataset creates one sample per fixture.
                    # So we just find the sample where gw == current_gw.
                    
                    p_meta = players_map.get(s['id'])
                    if not p_meta: continue
                    
                    X_seq_list.append(s['history_sequence'])
                    X_ctx_list.append([
                        s['ctx_was_home'],
                        s['ctx_difficulty'],
                        s['ctx_price'],
                        s['ctx_hours_rest']
                    ])
                    X_opp_list.append(s['ctx_opponent'])
                    meta_list.append({
                        'id': s['id'],
                        'name': s['name'],
                        'team': p_meta['team'],
                        'type': p_meta['element_type'],
                        'cost': p_meta['now_cost'], # Approx
                        'actual': s['target'] # The actual points gained
                    })
            
            if not X_seq_list: continue
            
            # Predict Batch
            X_seq = np.array(X_seq_list, dtype=np.float32)
            X_ctx = np.array(X_ctx_list, dtype=np.float32)
            X_opp = np.array(X_opp_list, dtype=np.float32)
            
            X_seq, X_ctx = clean_and_scale(X_seq, X_ctx)
            
            preds = model.predict([X_seq, X_ctx, X_opp], verbose=0).flatten()
            
            for i, p in enumerate(meta_list):
                p['xp'] = float(preds[i])
                predictions.append(p)
                
        # 3. Form Squad
        best_squad = get_best_squad(predictions)
        
        if not best_squad: continue
        
        # 4. Calculate Totals
        ai_points = sum([p['actual'] for p in best_squad])
        xp_total = sum([p['xp'] for p in best_squad])
        
        results.append({
            'gw': gw,
            'ai_points': float(ai_points),
            'xp': float(xp_total),
            'squad': best_squad
        })
        
        print(f"GW {gw}: Predicted {xp_total:.1f}, Actual {ai_points}")

    # Save Results
    results.reverse() # Newest first
    with open(OUTPUT_FILE, "w") as f:
        json.dump(results, f)
    print(f"Saved results to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()

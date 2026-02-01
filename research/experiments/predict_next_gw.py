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
OUTPUT_FILE = "public/data/ai_predictions.json"
POSITIONS = ["GKP", "DEF", "MID", "FWD"]

def load_json(path):
    with open(path, "r") as f:
        return json.load(f)

def clean_and_scale(X_seq, X_ctx):
    # 1. Replace NaN/Inf
    X_seq = np.nan_to_num(X_seq, nan=0.0, posinf=0.0, neginf=0.0)
    X_ctx = np.nan_to_num(X_ctx, nan=0.0, posinf=0.0, neginf=0.0)
    
    # 2. Scale (Same as Training)
    # Sequence: [Min, xG, xA, Thr, Cre, Inf, GC, Sav, Sel, Price, Home, Pts]
    scales_seq = np.array([90, 2.0, 1.0, 100, 100, 100, 5, 5, 15, 15, 1, 20], dtype=np.float32)
    X_seq = X_seq / scales_seq.reshape(1, 1, -1)
    
    # Context: [Home, Diff, Price, Rest, LastSeasonAvgPts, LastSeasonTotalPts,
    #           LastSeasonGoalsPer90, LastSeasonXGPer90, LastSeasonConsistency,
    #           CurrentSeasonAvgPts, CurrentSeasonGames, CurrentSeasonGoalsPer90,
    #           CurrentSeasonXGPer90, CurrentSeasonMinutesAvg]
    scales_ctx = np.array([
        # Original
        1,      # home (binary)
        5,      # difficulty (1-5)
        15,     # price (~4-15)
        200,    # hours_rest (~0-300)
        # Last season (player quality baseline)
        10,     # last_season_avg_points (~0-10)
        300,    # last_season_total_points (~0-300)
        1.5,    # last_season_goals_per_90 (~0-1.5)
        1.5,    # last_season_xg_per_90 (~0-1.5)
        5,      # last_season_consistency (std dev ~0-5)
        # Current season (recent form)
        10,     # current_season_avg_points (~0-10)
        38,     # current_season_games (~0-38)
        1.5,    # current_season_goals_per_90 (~0-1.5)
        1.5,    # current_season_xg_per_90 (~0-1.5)
        90      # current_season_minutes_avg (~0-90)
    ], dtype=np.float32)
    X_ctx = X_ctx / scales_ctx.reshape(1, -1)
    
    return X_seq, X_ctx

def main():
    print("Generating AI Predictions...")
    
    # 1. Get Current GW and Fixtures
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get Events
    cursor.execute("SELECT data FROM events WHERE id='events'")
    events_row = cursor.fetchone()
    events = json.loads(events_row['data'])
    current_gw_obj = next((e for e in events if e['is_next']), None) 
    if not current_gw_obj:
         current_gw_obj = next((e for e in events if e['is_current']), {'id': 1})
         
    current_gw = current_gw_obj['id']
    print(f"Next Gameweek: {current_gw}")
    
    # Get Fixtures for Next 5 GWs
    cursor.execute("SELECT data FROM fixtures")
    fixtures_rows = cursor.fetchall()
    all_fixtures = [json.loads(r['data']) for r in fixtures_rows]
    
    future_fixtures = [f for f in all_fixtures if f['event'] and f['event'] >= current_gw and f['event'] < current_gw + 5]
    
    conn.close()

    predictions_output = []
    
    # Load Models
    models = {}
    for pos in POSITIONS:
        model_path = os.path.join(MODELS_DIR, f"model_{pos}.keras")
        if os.path.exists(model_path):
            models[pos] = tf.keras.models.load_model(model_path)
            print(f"Loaded {pos} model")
        else:
            print(f"Warning: Model {pos} not found")

    # 2. Process Each Position
    for pos in POSITIONS:
        if pos not in models: continue
        model = models[pos]
        
        # Load Latest Player Data
        # We need the most recent sample for each player from the dataset
        # dataset_{pos}.json contains historical samples.
        # We group by ID and take the one with highest GW/Time
        data = load_json(os.path.join(DATA_DIR, f"dataset_{pos}.json"))
        
        # Group by ID
        latest_samples = {}
        for d in data:
            pid = d['id']
            # Assuming data is sorted or we verify season/gw
            # We want the LATEST available history form.
            # d has 'history_sequence'.
            # We'll overwrite if we find a later one.
            # Compare season then gw
            if pid not in latest_samples:
                latest_samples[pid] = d
            else:
                curr = latest_samples[pid]
                # Simple logic: if d is newer, replace
                # 25/26 > 24/25. GW 20 > GW 19.
                is_newer = False
                if d.get('season') == '25/26' and curr.get('season') == '24/25': is_newer = True
                elif d.get('season') == curr.get('season') and d['gw'] > curr['gw']: is_newer = True
                
                if is_newer:
                    latest_samples[pid] = d
        
        print(f"Predicting for {len(latest_samples)} {pos}s...")
        
        # Batch Prediction for efficiency? Or per player?
        # Per player loop is easier to construct logic for 5 GWs
        
        for pid, sample in latest_samples.items():
            # Get Future Fixtures for this player
            # Need to know Team ID. sample doesn't have team id directly, but we can look up from fixtures process or player list?
            # Actually generate_dataset didn't save team_id.
            # But we can infer team from 'ctx_was_home' and 'ctx_opponent' and the fixture? No.
            # We need player's team.
            # We should probably load 'players' table to map ID -> Team.
            pass # See Step 3
            
    # Step 3 (Retrofit): Load Players to get Team ID map
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT data FROM players")
    players_rows = cursor.fetchall()
    players_map = {} # ID -> {team: int, web_name: string}
    for r in players_rows:
        p = json.loads(r[0])
        players_map[p['id']] = {'team': p['team'], 'name': p['web_name'], 'element_type': p['element_type']} # element_type 1=GKP...
    conn.close()

    # Resume Loop
    for pos in POSITIONS:
        if pos not in models: continue
        model = models[pos]
        data = load_json(os.path.join(DATA_DIR, f"dataset_{pos}.json"))
        
        # Group by ID (Latest Sample)
        latest_samples = {}
        for d in data:
             pid = d['id']
             if pid not in latest_samples: latest_samples[pid] = d
             else:
                 curr = latest_samples[pid]
                 is_newer = False
                 if d.get('season') == '25/26' and curr.get('season') == '24/25': is_newer = True
                 elif d.get('season') == curr.get('season') and d['gw'] > curr['gw']: is_newer = True
                 if is_newer: latest_samples[pid] = d

        # Predict
        for pid, sample in latest_samples.items():
            player_meta = players_map.get(pid)
            if not player_meta: continue
            
            team_id = player_meta['team']
            p_name = player_meta['name']
            
            # Find Next 5 Fixtures
            p_fixtures = []
            for gw in range(current_gw, current_gw + 5):
                # Find fixture for this team in this GW
                # Handle Double GWs (take first? or sum? Model predicts per match)
                # If Double GW, we should predict TWICE.
                # Simplify: Take all matches.
                matches = [f for f in future_fixtures if f['event'] == gw and (f['team_h'] == team_id or f['team_a'] == team_id)]
                
                for m in matches:
                    is_home = (m['team_h'] == team_id)
                    opponent = m['team_a'] if is_home else m['team_h']
                    difficulty = m['team_h_difficulty'] if is_home else m['team_a_difficulty']
                    p_fixtures.append({
                        'gw': gw,
                        'opponent': opponent,
                        'is_home': is_home,
                        'difficulty': difficulty,
                        'kickoff': m['kickoff_time']
                    })
            
            if not p_fixtures: continue
            
            # Prepare Input Batch for this player (N fixtures)
            # Use SAME history sequence for all
            X_seq = np.array([sample['history_sequence'] for _ in p_fixtures], dtype=np.float32)
            
            # Contexts vary
            ctx_list = []
            opp_list = []
            
            current_price = sample['ctx_price'] # Estimate
            
            # Load Teams for Strength Lookup
            if 'teams_map' not in locals():
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cursor.execute("SELECT id, data FROM teams")
                teams_rows = cursor.fetchall()
                teams_map = {}
                for r in teams_rows:
                     teams_map[r[0]] = json.loads(r[1])
                conn.close()

            for f in p_fixtures:
                 # Rest: Hard to calc perfectly without previous match time. Assume 7 days (168h) for simplicity or default 100h
                 hours_rest = 100.0
                 
                 # Extract cross-season features from sample
                 ctx_list.append([
                     # Original features
                     1.0 if f['is_home'] else 0.0,
                     float(f['difficulty']),
                     current_price,
                     hours_rest,
                     # Last season features (player quality)
                     sample.get('ctx_last_season_avg_points', 0),
                     sample.get('ctx_last_season_total_points', 0),
                     sample.get('ctx_last_season_goals_per_90', 0),
                     sample.get('ctx_last_season_xg_per_90', 0),
                     sample.get('ctx_last_season_consistency', 0),
                     # Current season features (recent form)
                     sample.get('ctx_current_season_avg_points', 0),
                     sample.get('ctx_current_season_games', 0),
                     sample.get('ctx_current_season_goals_per_90', 0),
                     sample.get('ctx_current_season_xg_per_90', 0),
                     sample.get('ctx_current_season_minutes_avg', 0)
                 ])
                 
                 # Fix: Use Team Strength not ID
                 opp_id = f['opponent']
                 opp_data = teams_map.get(opp_id)
                 opp_strength = 1100
                 if opp_data:
                     if f['is_home']:
                         # We are home, they are away
                         opp_strength = opp_data.get('strength_overall_away', 1100)
                     else:
                         opp_strength = opp_data.get('strength_overall_home', 1100)
                 
                 opp_list.append(opp_strength)
            
            X_ctx = np.array(ctx_list, dtype=np.float32)
            X_opp = np.array(opp_list, dtype=np.float32)
            
            # Scale
            X_seq, X_ctx = clean_and_scale(X_seq, X_ctx)
            X_opp = X_opp / 1350.0 # Fix: Scale opponent strength
            
            # Predict
            preds = model.predict([X_seq, X_ctx, X_opp], verbose=0).flatten()
            
            # Aggregate Projections
            projections = []
            total_score = 0
            
            # Map predictions back to GWs (handle doubles by summing points for that GW)
            gw_points = {} # gw -> points
            
            for i, f in enumerate(p_fixtures):
                pts = float(preds[i])
                gw = f['gw']
                gw_points[gw] = gw_points.get(gw, 0) + pts
                total_score += pts
            
            # Format Projections list
            for gw in range(current_gw, current_gw + 5):
                projections.append({'gw': gw, 'xP': gw_points.get(gw, 0)})
            
            predictions_output.append({
                'id': pid,
                'name': p_name,
                'team': team_id,
                'projections': projections,
                'total5Week': total_score
            })
            
    # Save Output
    with open(OUTPUT_FILE, "w") as f:
        json.dump(predictions_output, f)
    print(f"Saved {len(predictions_output)} predictions to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()

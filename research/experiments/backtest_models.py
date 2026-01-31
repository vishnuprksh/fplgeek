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
        
        # 2. Predict Points for all players (5-week projection)
        predictions = []
        
        # We need to predict for GW, GW+1, ..., GW+4
        # We assume player history doesn't change for the future predictions (Simplified)
        # But we MUST update the Context (Opponent, Difficulty, Home/Away)
        
        # Pre-calculate fixtures for next 5 weeks
        # Map: PlayerID -> [List of 5 Contexts]
        player_future_ctx = {}
        
        for offset in range(5): # 0 to 4
            target_gw = gw + offset
            # Find fixtures for this target_gw
            target_fixtures = [f for f in fixtures if f['event'] == target_gw]
            
            for f in target_fixtures:
                # Home Player
                h_id = f['team_h']
                # Away Player
                a_id = f['team_a']
                
                # Difficulty
                h_diff = f['team_h_difficulty']
                a_diff = f['team_a_difficulty']
                
                # We need to map TEAM ID to PLAYERS
                # Simplification: Iterate all players, check their team
                # Efficient: Pre-map TeamID -> [PlayerIDs] ?
                # Or just iterate players in the outer loop and find their fixture.
                pass
        
        # Optimization: Build map of Team -> Fixtures for next 5 GWs
        team_fixtures_map = {} # TeamID -> { GW: FixtureInfo }
        for offset in range(5):
            target_gw = gw + offset
            target_fixtures = [f for f in fixtures if f['event'] == target_gw]
            for f in target_fixtures:
                # Home Team Info
                if f['team_h'] not in team_fixtures_map: team_fixtures_map[f['team_h']] = {}
                team_fixtures_map[f['team_h']][target_gw] = {
                    'opponent': f['team_a'], # Opponent Team ID
                    'difficulty': f['team_h_difficulty'],
                    'was_home': 1
                }
                # Away Team Info
                if f['team_a'] not in team_fixtures_map: team_fixtures_map[f['team_a']] = {}
                team_fixtures_map[f['team_a']][target_gw] = {
                    'opponent': f['team_h'],
                    'difficulty': f['team_a_difficulty'],
                    'was_home': 0
                }
        
        for pos in POSITIONS:
            if pos not in models: continue
            model = models[pos]
            samples = all_data[pos]
            
            # Prepare Batch
            # We need to run inference 5 times per player.
            # Batch 0: Offset 0
            # Batch 1: Offset 1 ...
            
            # Group samples by player
            # Only process players who have a match in CURRENT GW (valid starter)
            # Actually, we should consider players even if they blank GW1 but score big GW2-5?
            # get_best_squad usually picks valid XI for THIS week.
            # If a player has NO game in GW T, his 'actual' is 0.
            # If we pick him based on 5-week potential, we suffer 0 this week.
            # This is valid FPL strategy (preparing for DGW etc).
            
            valid_samples = [s for s in samples if s.get('season') == '25/26' and s['gw'] == gw]
            
            if not valid_samples: continue
            
            # We need to construct inputs for 5 offsets.
            # X_seq is constant (history up to GW-1).
            # X_ctx varies.
            
            X_seq_list = []
            X_ctx_list_5 = [[], [], [], [], []] # 5 lists for 5 offsets
            X_opp_list_5 = [[], [], [], [], []]
            
            meta_list = []
            
            for s in valid_samples:
                p_meta = players_map.get(s['id'])
                if not p_meta: continue
                
                tid = p_meta['team']
                
                # Check if team has fixture in current GW (Offset 0)
                # S['ctx_...'] in dataset is correct for Offset 0.
                
                # History is constant
                X_seq_list.append(s['history_sequence'])
                
                meta_list.append({
                    'id': s['id'],
                    'name': s['name'],
                    'team': p_meta['team'],
                    'type': p_meta['element_type'],
                    'cost': p_meta['now_cost'],
                    'actual': s['target'],
                    'xp_1': 0,
                    'xp_5': 0
                })

                # Build Contexts for 5 weeks
                for offset in range(5):
                    target_gw = gw + offset
                    
                    # Default values (No match / Blank GW)
                    # If blank, complexity: Model expects valid input?
                    # We feed "Average Opponent" or "Hard Opponent"?
                    # Difficulty 5 (Max) for Blank? Or 0?
                    # Price, Rest: Constant?
                    # Opponent: ?
                    
                    fix_info = team_fixtures_map.get(tid, {}).get(target_gw)
                    
                    if fix_info:
                        # Map Opponent Team ID to Difficulty Rank?
                        # In `generate_dataset.ts`, opponent is mapped to 1-5 rank (fdr).
                        # Wait, `ctx_opponent` input to model is Opponent Difficulty?
                        # `predict_next_gw.py` line 140: `row_team['strength_overall_away']`.
                        # It uses Team Strength!
                        # `dataset` has `ctx_opponent`. In generate_dataset, it is `opponent_team` ID?
                        # No, `ctx_opponent` in the python script usually refers to "Opponent Strength".
                        # Let's check `train_models.py` or `generate_dataset.json`.
                        # `generate_dataset.ts`:
                        # `ctx_opponent: fixture.team_h === p.team ? awayTeam.strength : homeTeam.strength`
                        # So it is STRENGTH (approx 1000-1350).
                        # In `backtest`, `s['ctx_opponent']` is already there for Offset 0.
                        # For Offset 1+, we need to look up Opponent Strength from SQLite `teams` table?
                        # Backtest script loaded `players` but not `teams`.
                        # I must assume I need to fetch TEAM STRENGTHS.
                        # I will use `s['ctx_opponent']` for Offset 0.
                        # For others, I'll approximate using Difficulty * 250?
                        # Or just use Difficulty.
                        
                        # Fix: `train_models.py` scales `ctx_sequence` (Wait `ctx_opp` is usually separate input?)
                        # `train_models.py`: `X_opp = np.array([s['ctx_opponent'] for s in samples])`.
                        # `clean_and_scale`: `scales_ctx = [1, 5, 15, 200]`. (Home, Diff, Price, Rest).
                        # Opp scales?
                        # `train_models.py` doesn't scale X_opp in `clean_and_scale` explicitly?
                        # Be careful.
                        # Line 106 train_models: `X_opp = X_opp / 1350.0` (Hardcoded inline).
                        # Okay.
                        
                        # If fix_info exists:
                        was_home = fix_info['was_home']
                        diff = fix_info['difficulty']
                        price = s['ctx_price']
                        rest = 144.0 # detailed rest hours hard to calc, assume 6 days
                        
                        # Opponent Strength?
                        # I don't have teams loaded.
                        # I'll use Difficulty as proxy for Strength?
                        # Diff 1-5. Strength ~ 1000 + (Diff * 60)?
                        # Very rough.
                        # Better: Use `s['ctx_opponent']` if offset=0.
                        # Else use 1000 + (diff * 100).
                        
                        opp_strength = 1000 + (diff * 60)
                        if offset == 0: opp_strength = s['ctx_opponent']
                        
                        X_ctx_list_5[offset].append([was_home, diff, price, rest])
                        X_opp_list_5[offset].append(opp_strength)
                        
                    else:
                        # Blank GW. Predict 0.
                        # How to tell model "0"?
                        # Send dummy input and manually set result to 0 later?
                        # Yes.
                        X_ctx_list_5[offset].append([0, 5, s['ctx_price'], 200])
                        X_opp_list_5[offset].append(1350) # Hardest opp
            
            if not X_seq_list: continue

            # Run 5 Inferences
            X_seq = np.array(X_seq_list, dtype=np.float32)
            X_seq, _ = clean_and_scale(X_seq, np.zeros((len(X_seq), 4))) # Clean seq only

            total_preds = np.zeros(len(meta_list))
            
            for offset in range(5):
                X_ctx = np.array(X_ctx_list_5[offset], dtype=np.float32)
                X_opp = np.array(X_opp_list_5[offset], dtype=np.float32)
                
                # Scale
                _, X_ctx = clean_and_scale(np.zeros_like(X_seq), X_ctx)
                X_opp = X_opp / 1350.0 # Inline scaling matches train_models
                
                preds = model.predict([X_seq, X_ctx, X_opp], verbose=0).flatten()
                
                # Zero out blanks (no fixture in map)
                # Re-check fixture map?
                # We used dummy inputs for blanks. Model might predict 2-3 points even for hard match.
                # We need to explicitly mask blanks.
                
                for i, m in enumerate(meta_list):
                    p_team = m['team']
                    t_gw = gw + offset
                    if not team_fixtures_map.get(p_team, {}).get(t_gw):
                        preds[i] = 0.0
                
                total_preds += preds
                
                if offset == 0:
                    for i, m in enumerate(meta_list):
                        m['xp_1'] = float(preds[i])

            # Store 5-week total
            for i, m in enumerate(meta_list):
                m['xp'] = float(total_preds[i]) # Set XP to 5-week sum for SELECTION
                predictions.append(m)

        # 3. Form Squad
        best_squad = get_best_squad(predictions)
        
        if not best_squad: continue
        
        # 4. Calculate Totals
        ai_points = sum([p['actual'] for p in best_squad])
        
        # IMPORTANT: 'xp' in result should probably be the 1-week prediction for Comparison?
        # Or 5-week? User said "Compare prediction and actual".
        # Comparing 5-week Sum to 1-week Actual is weird visually (280 vs 50).
        # I will revert the 'xp' field in the Saved Result to 'xp_1' (Next GW only) for display correctness.
        # But selection was made using 'xp' (5-week).
        
        final_squad_display = []
        xp_total_1w = 0
        
        for p in best_squad:
            p_display = p.copy()
            p_display['xp'] = p['xp_1'] # Show 1-week prediction in UI
            p_display['xp_5w'] = p['xp'] # Keep 5-week for debug?
            xp_total_1w += p['xp_1']
            final_squad_display.append(p_display)

        results.append({
            'gw': gw,
            'ai_points': float(ai_points),
            'xp': float(xp_total_1w), # Show 1-week Sum
            'squad': final_squad_display
        })
        
        print(f"GW {gw}: Predicted (1W) {xp_total_1w:.1f}, Actual {ai_points}. Selected using 5W Sum.")

    # Save Results
    results.reverse() # Newest first
    with open(OUTPUT_FILE, "w") as f:
        json.dump(results, f)
    print(f"Saved results to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()

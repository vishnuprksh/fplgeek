import json
import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.models import Model
from tensorflow.keras.layers import Input, LSTM, Dense, Concatenate, Dropout, Embedding, Flatten
from tensorflow.keras.optimizers import Adam
import sqlite3
import os

# Configuration
DATA_DIR = "public/data/processed"
MODELS_DIR = "public/models/backtest" # Separate dir for backtest models
DB_PATH = "public/data/fpl.sqlite"
OUTPUT_FILE = "public/data/backtest_results.json"
POSITIONS = ["GKP", "DEF", "MID", "FWD"]

# Feature Params
SEQ_LEN = 5
NUM_FEATURES = 13

# --- Helper Functions ---

def load_json(path):
    with open(path, "r") as f:
        return json.load(f)

def clean_and_scale(X_seq, X_ctx):
    # 1. Replace NaN/Inf
    X_seq = np.nan_to_num(X_seq, nan=0.0, posinf=0.0, neginf=0.0)
    X_ctx = np.nan_to_num(X_ctx, nan=0.0, posinf=0.0, neginf=0.0)
    
    # 2. Scale (Simple Global Scaling)
    scales_seq = np.array([90, 2.0, 1.0, 100, 100, 100, 5, 5, 15, 100, 15, 1, 20], dtype=np.float32)
    X_seq = X_seq / scales_seq.reshape(1, 1, -1)
    
    scales_ctx = np.array([1, 5, 15, 200], dtype=np.float32)
    X_ctx = X_ctx / scales_ctx.reshape(1, -1)
    
    return X_seq, X_ctx

def build_model():
    # 1. Sequence Input (LSTM)
    seq_input = Input(shape=(SEQ_LEN, NUM_FEATURES), name="seq_input")
    x = LSTM(32, return_sequences=False)(seq_input)
    x = Dropout(0.2)(x)
    
    # 2. Context Input (Dense)
    ctx_input = Input(shape=(4,), name="ctx_input")
    
    # 3. Opponent Embedding
    opp_input = Input(shape=(1,), name="opp_input")
    opp_embed = Embedding(input_dim=21, output_dim=4)(opp_input) # 20 teams + 1 buffer
    opp_flat = Flatten()(opp_embed)
    
    # Concatenate
    concat = Concatenate()([x, ctx_input, opp_flat])
    
    # Dense Layers
    dense = Dense(32, activation='relu')(concat)
    dense = Dense(16, activation='relu')(dense)
    output = Dense(1, activation='linear')(dense) # Regression
    
    model = Model(inputs=[seq_input, ctx_input, opp_input], outputs=output)
    model.compile(optimizer=Adam(learning_rate=0.001), loss='mse', metrics=['mae'])
    return model

def get_best_squad(predictions, budget=1000):
    # Sort by XP (5-week sum)
    gkps = sorted([p for p in predictions if p['type'] == 1], key=lambda x: x['xp'], reverse=True)
    defs = sorted([p for p in predictions if p['type'] == 2], key=lambda x: x['xp'], reverse=True)
    mids = sorted([p for p in predictions if p['type'] == 3], key=lambda x: x['xp'], reverse=True)
    fwds = sorted([p for p in predictions if p['type'] == 4], key=lambda x: x['xp'], reverse=True)

    squad = []
    
    # 1. Core Structure (1 GKP, 3 DEF, 2 MID, 1 FWD) - Minimal valid set to build on
    if gkps: squad.append(gkps.pop(0))
    for _ in range(3): 
        if defs: squad.append(defs.pop(0))
    for _ in range(2): 
        if mids: squad.append(mids.pop(0))
    for _ in range(1): 
        if fwds: squad.append(fwds.pop(0))
        
    # 2. Fill remaining 4 spots with best points (respecting max constraints)
    remaining = sorted(defs + mids + fwds, key=lambda x: x['xp'], reverse=True) # GKP usually only 1 needed
    
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

# --- Main Logic ---

def main():
    print("Starting Realtime Simulation Backtest...")
    os.makedirs(MODELS_DIR, exist_ok=True)
    
    # 1. Load Data
    all_data = {}
    for pos in POSITIONS:
        all_data[pos] = load_json(os.path.join(DATA_DIR, f"dataset_{pos}.json"))
        
    # 2. Load Fixtures/Players Metadata
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT data FROM fixtures")
    fixtures = [json.loads(r['data']) for r in cursor.fetchall()]
    
    cursor.execute("SELECT data FROM players")
    players = [json.loads(r['data']) for r in cursor.fetchall()]
    players_map = {p['id']: p for p in players}
    
    # Find active simulation GWs (Season 25/26)
    # We simulate from GW 1 to Current
    sim_gws = sorted(list(set([d['gw'] for p in POSITIONS for d in all_data[p] if d.get('season') == '25/26'])))
    if not sim_gws:
        print("No simulation data found for 25/26. Using 24/25?")
        # Fallback logic if needed, but we saw 25/26 in file.
        sim_gws = range(1, 24)
    else:
        # Limit to contiguous range starting 1
        sim_gws = [g for g in sim_gws if g >= 1]
    
    print(f"Simulating GWs: {sim_gws}")

    # 3. Initial Training (Season 24/25)
    models = {}
    print("Initializing Models (Training on Season 24/25)...")
    
    for pos in POSITIONS:
        raw_data = all_data[pos]
        # Filter Train Data
        train_samples = [d for d in raw_data if d.get('season') == '24/25']
        
        if not train_samples:
            print(f"Warning: No training data for {pos} in 24/25. Model will be random.")
            models[pos] = build_model()
            continue
            
        X_seq = np.array([d['history_sequence'] for d in train_samples], dtype=np.float32)
        X_ctx = np.array([[d['ctx_was_home'], d['ctx_difficulty'], d['ctx_price'], d['ctx_hours_rest']] for d in train_samples], dtype=np.float32)
        X_opp = np.array([d['ctx_opponent'] for d in train_samples], dtype=np.float32)
        y = np.array([d['target'] for d in train_samples], dtype=np.float32)
        
        X_seq, X_ctx = clean_and_scale(X_seq, X_ctx)
        X_opp = X_opp / 1350.0
        
        model = build_model()
        model.fit([X_seq, X_ctx, X_opp], y, epochs=10, batch_size=32, verbose=0)
        models[pos] = model
        print(f"Trained {pos} base model ({len(train_samples)} samples)")

    # 4. Simulation Loop
    results = []
    
    # Pre-build Team Fixtures Maps for efficiency
    # TeamID -> GW -> Info
    team_fixtures_map = {}
    for f in fixtures:
        h = f['team_h']
        a = f['team_a']
        gw = f['event']
        if not gw: continue
        
        if h not in team_fixtures_map: team_fixtures_map[h] = {}
        team_fixtures_map[h][gw] = { 'opponent': a, 'difficulty': f['team_h_difficulty'], 'was_home': 1 }
        
        if a not in team_fixtures_map: team_fixtures_map[a] = {}
        team_fixtures_map[a][gw] = { 'opponent': h, 'difficulty': f['team_a_difficulty'], 'was_home': 0 }

    for gw in sim_gws:
        print(f"--- Simulating GW {gw} ---")
        
        # A. Predict & Selection (5-week)
        # Note: We can only use current model state.
        
        predictions = [] # meta + xp
        
        for pos in POSITIONS:
            # Get Candidates for Current GW (from dataset for convenience, as it holds seq)
            # We use '25/26' rows for this GW.
            # In reality, we would construct this from raw data, but using dataset row is fine
            # as long as we haven't trained on it yet.
            
            samples = [d for d in all_data[pos] if d.get('season') == '25/26' and d['gw'] == gw]
            if not samples: continue
            
            # For each candidate, we need 5-week sequence inputs.
            # GW + 0: Use sample's own inputs.
            # GW + 1..4: Construct inputs using updated Context (Opponent etc).
            # Sequence (History)? Fixed to current (Simplification).
            
            X_seq_dim = np.array([s['history_sequence'] for s in samples], dtype=np.float32)
            X_seq_dim, _ = clean_and_scale(X_seq_dim, np.zeros((len(samples), 4)))
            
            total_preds = np.zeros(len(samples))
            xp_1w = np.zeros(len(samples))
            
            for offset in range(5):
                target_gw = gw + offset
                
                # Build Context for Batch
                ctx_list = []
                opp_list = []
                
                for s in samples:
                    # Find fixture
                    # We need Team ID
                    meta = players_map.get(s['id'])
                    if not meta: 
                        ctx_list.append([0, 5, 0, 0]) # Dummy
                        opp_list.append(1350)
                        continue
                        
                    tid = meta['team']
                    fix = team_fixtures_map.get(tid, {}).get(target_gw)
                    
                    if fix:
                        # Context: [Home, Diff, Price, Rest]
                        # Price: assume constant s['ctx_price']
                        # Rest: assume 6 days (144hrs)
                        # Opponent: Strength approx 1000 + diff*60
                        
                        opp_strength = 1000 + (fix['difficulty'] * 60)
                        if offset == 0: opp_strength = s['ctx_opponent'] # Use exact if available
                        
                        ctx_list.append([fix['was_home'], fix['difficulty'], s['ctx_price'], 144.0])
                        opp_list.append(opp_strength)
                    else:
                        # Blank
                        ctx_list.append([0, 5, s['ctx_price'], 200]) # Diff 5 for blank (suppression)
                        opp_list.append(1350)
                
                X_ctx = np.array(ctx_list, dtype=np.float32)
                X_opp = np.array(opp_list, dtype=np.float32)
                
                # Scale
                _, X_ctx = clean_and_scale(np.zeros_like(X_seq_dim), X_ctx)
                X_opp = X_opp / 1350.0
                
                # Predict
                preds = models[pos].predict([X_seq_dim, X_ctx, X_opp], verbose=0).flatten()
                
                # Mask Blanks (Manual check)
                for i, s in enumerate(samples):
                    meta = players_map.get(s['id'])
                    if meta:
                        tid = meta['team']
                        if not team_fixtures_map.get(tid, {}).get(target_gw):
                            preds[i] = 0.0
                            
                total_preds += preds
                if offset == 0: yp_1w = preds # Logic for display
                
                if offset == 0:
                    xp_1w = preds

            # Merge results
            for i, s in enumerate(samples):
                predictions.append({
                    'id': s['id'],
                    'name': s['name'],
                    'type': players_map[s['id']]['element_type'],
                    'team': players_map[s['id']]['team'],
                    'cost': s['ctx_price'],
                    'xp': float(total_preds[i]), # 5-Week Sum
                    'xp_1': float(xp_1w[i]),       # 1-Week
                    'actual': s['target']
                })
        
        # Select best squad (11 players)
        squad = get_best_squad(predictions)
        
        # Identify Captain (Highest XP)
        # We use 1-week XP for captaincy as it's more tactical
        captain = max(squad, key=lambda x: x['xp_1'])
        
        # Calculate actual points (Double Captain points)
        ai_points = sum([p['actual'] for p in squad]) + captain['actual']
        
        # Record result
        record = {
            'gw': gw,
            'ai_points': float(ai_points),
            'xp': float(sum([p['xp_1'] for p in squad])), # Total squad 1w xP
            'captain_id': captain['id'],
            'squad': [{
                'id': p['id'],
                'name': p['name'],
                'type': p['type'],
                'team': p['team'],
                'cost': p['cost'],
                'xp': p['xp_1'], # 1-week prediction for display
                'xp_5w': p['xp'],
                'actual': p['actual'],
                'is_captain': p['id'] == captain['id']
            } for p in squad]
        }
        results.append(record)
        
        print(f"GW {gw}: Pred {record['xp']:.1f} | Actual {ai_points} (CPT: {captain['name']} {captain['actual']}pts)")
        
        # B. Online Training (Update Models)
        # Train on the data from THIS GW (gw)
        # We simulate that the GW has finished, so we have the labels (actual points).
        
        print(f"Updating models with GW {gw} data...")
        for pos in POSITIONS:
            # Extract samples for this GW
            # Re-read to be clean
            samples = [d for d in all_data[pos] if d.get('season') == '25/26' and d['gw'] == gw]
            if not samples: continue
            
            X_seq = np.array([d['history_sequence'] for d in samples], dtype=np.float32)
            X_ctx = np.array([[d['ctx_was_home'], d['ctx_difficulty'], d['ctx_price'], d['ctx_hours_rest']] for d in samples], dtype=np.float32)
            X_opp = np.array([d['ctx_opponent'] for d in samples], dtype=np.float32)
            y = np.array([d['target'] for d in samples], dtype=np.float32)
            
            X_seq, X_ctx = clean_and_scale(X_seq, X_ctx)
            X_opp = X_opp / 1350.0
            
            # Incremental Fit
            # Small learning rate to avoid destroying existing knowledge?
            # Or just standard fit. 
            # Epochs=5 usually enough for fine-tuning.
            
            models[pos].fit([X_seq, X_ctx, X_opp], y, epochs=5, batch_size=32, verbose=0)

    # Save Results
    results.reverse()
    with open(OUTPUT_FILE, "w") as f:
        json.dump(results, f)
    print(f"Sim done. Results saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()

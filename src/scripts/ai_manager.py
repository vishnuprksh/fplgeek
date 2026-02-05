import json
import numpy as np
import tensorflow as tf
import sqlite3
import os

# Import Refactored Modules
# Adjust import path if running from root using `python3 -m research.experiments.ai_manager`
# or set PYTHONPATH. Assuming running from root as `python3 research/experiments/ai_manager.py` with slight path hack if needed or better, user runs as module.
# To allow execution as script from inside folder or root, we use relative imports if module, or sys.path append.
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from src.scripts.lib.config import *
from src.scripts.lib.utils import load_json
from src.scripts.lib.models import build_model, clean_and_scale
from src.scripts.lib.fpl_manager import FPLManager, get_best_starting_squad, calculate_selling_price, calc_team_prob_gt_target

def run_simulation(prob_thresholds=[6, 10], team_score_target=60.0, captaincy_ownership_threshold=50.0, objective='xp', end_gw=24, explosive_threshold=5.0):
    print(f"🚀 Starting AI Manager Simulation (Thresholds={prob_thresholds}, Target={team_score_target}, CapOwn={captaincy_ownership_threshold})...")
    os.makedirs(MODELS_DIR, exist_ok=True)
    
    # Derby Keys
    bench_boost_metric = f'prob_gt_{prob_thresholds[0]}'
    triple_captain_metric = f'prob_gt_{prob_thresholds[1]}'

    # 1. Load Data
    all_data = {}
    for pos in POSITIONS:
        try:
            all_data[pos] = load_json(os.path.join(DATA_DIR, f"dataset_{pos}.json"))
        except FileNotFoundError:
            print(f"❌ Data for {pos} not found. Run analysis/generate_dataset first.")
            return 0, []
        
    # 2. Load Metadata
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT data FROM fixtures")
    fixtures = [json.loads(r['data']) for r in cursor.fetchall()]
    
    cursor.execute("SELECT data FROM players")
    players = [json.loads(r['data']) for r in cursor.fetchall()]
    players_map = {p['id']: p for p in players}
    
    # 3. Build Price History Lookup (Scaled to 0.1m units)
    # print("💰 Building price history...")
    price_history = {}  # {player_id: {gw: price}}
    for pos in POSITIONS:
        for record in all_data[pos]:
            pid = record['id']
            gw = record['gw']
            # Scale price: 5.6 -> 56
            price = int(record['ctx_price'] * 10)
            
            if pid not in price_history:
                price_history[pid] = {}
            price_history[pid][gw] = price
    
    # 4. Simulation Range (25/26 Season)
    sim_gws = sorted(list(set([d['gw'] for p in POSITIONS for d in all_data[p] if d.get('season') == '25/26'])))
    if not sim_gws:
        print("Error: No 25/26 data found.")
        return 0, []
    
    # Filter GWs up to end_gw
    sim_gws = [g for g in sim_gws if g >= 1 and g <= end_gw]
    
    # print(f"📅 Simulating GWs: {sim_gws}")
    
    # 4. Initialize Manager
    manager = FPLManager(players_map, 
                         min_captain_ownership=captaincy_ownership_threshold, 
                         team_score_target=team_score_target,
                         bench_boost_metric=bench_boost_metric,
                         triple_captain_metric=triple_captain_metric)
    models = {}
    
    # Initial Training
    # print("🧠 Training Base Models (Pre-25/26)...")
    for pos in POSITIONS:
        raw_data = all_data[pos]
        train_samples = [d for d in raw_data if d.get('season') != '25/26'] 
        
        if not train_samples:
            # print(f"⚠️ No historical data for {pos}. Model will start random.")
            models[pos] = build_model()
            continue
            
        X_seq = np.array([d['history_sequence'] for d in train_samples], dtype=np.float32)
        X_ctx = np.array([[d['ctx_was_home'], d['ctx_difficulty'], d['ctx_price'], d['ctx_hours_rest'],
                           d['ctx_all_time_avg_points'], d['ctx_all_time_total_points'],
                           d['ctx_all_time_goals_per_90'], d['ctx_all_time_xg_per_90'], d['ctx_all_time_games_played'],
                           d['ctx_form'], d['ctx_ownership']]  # NEW: Added form and ownership
                          for d in train_samples], dtype=np.float32)
        X_opp = np.array([d['ctx_opponent'] for d in train_samples], dtype=np.float32)
        y = np.array([d['target'] for d in train_samples], dtype=np.float32)
        
        X_seq, X_ctx = clean_and_scale(X_seq, X_ctx)
        X_opp = X_opp / 1350.0
        
        # --- Categorical Model Training ---
        
        # 1. Convert targets to One-Hot Encoding (Classes 0 to 15+)
        y_clipped = np.clip(y, 0, 15).astype(int)
        y_categorical = tf.keras.utils.to_categorical(y_clipped, num_classes=16)
        
        model = build_model()
        # If models already exist, we can skip training to speed up simulation
        # but for now, let's keep it to ensure fresh training or add a flag
        model_path = os.path.join(MODELS_DIR, f"model_{pos}.keras")
        if os.path.exists(model_path):
            # print(f"Skipping training for {pos}, model exists. Loading from {model_path}")
            models[pos] = tf.keras.models.load_model(model_path)
            continue

        history = model.fit(
            [X_seq, X_ctx, X_opp], 
            y_categorical, # Corrected from y_cat
            epochs=3, # Reduced epochs for speed in this demo
            batch_size=32,
            validation_split=0.1,
            verbose=0
        )
        print(f"✅ Trained {pos} Probabilistic Model")
        model.save(model_path) # Corrected from config.MODELS_DIR
            
        models[pos] = model

    # 5. Gameweek Loop
    results_history = []
    
    from src.scripts.sim_utils import predict_gw

    for gw in sim_gws:
        # print(f"--- GW {gw} ---")
        if gw == sim_gws[0]:
            print(f"📊 Initializing Squad...")
            
        # A. PREDICTION PHASE (Current + Long Term)
        # 1. Current GW Predictions
        current_preds_map = predict_gw(gw, frozen_gw=None, all_data=all_data, models=models, prob_thresholds=prob_thresholds)
        
        # 2. Long Term Predictions (Avg next 5 GWs)
        long_term_xp_map = {}
        long_term_prob_map = {} 
        count_map = {}
        
        # Look ahead up to 5 GWs (including current)
        for offset in range(5): 
            target_gw = gw + offset
            # Use FROZEN form from current GW to prevent data leak
            future_preds = predict_gw(target_gw, frozen_gw=gw, all_data=all_data, models=models, prob_thresholds=prob_thresholds)
            for pid, p_data in future_preds.items():
                if pid not in long_term_xp_map: # Initialize if not present (e.g., new player appears)
                    long_term_xp_map[pid] = 0.0
                    long_term_prob_map[pid] = 0.0
                    count_map[pid] = 0
                long_term_xp_map[pid] += p_data['xp']
                # Accumulate Prob > 6
                if 'prob_gt_6' in p_data:
                    long_term_prob_map[pid] += p_data['prob_gt_6']
                count_map[pid] += 1
                    
        # A. BUILD CANDIDATES
        gw_candidates = []
        # Create a map for current GW's player data for quick lookup
        current_gw_player_data = {}
        for pos in POSITIONS:
            for record in all_data[pos]:
                if record['gw'] == gw and record.get('season') == '25/26':
                    current_gw_player_data[record['id']] = record

        for s_player_meta in players: # Renamed 's' to 's_player_meta' for clarity
             pid = s_player_meta['id']
             # Ensure player has current GW data and predictions
             if pid in current_gw_player_data and pid in current_preds_map and pid in long_term_xp_map:
                s_gw_data = current_gw_player_data[pid] # Get GW-specific data for this player
                
                real_xp = current_preds_map[pid]
                total_5gw_xp = long_term_xp_map[pid]
                avg_xp = total_5gw_xp / max(1, count_map[pid])
                
                sum_prob_6 = long_term_prob_map.get(pid, 0.0)

                cand = {
                    'id': pid,
                    'name': s_player_meta['web_name'], # Use web_name from player metadata
                    'type': s_player_meta['element_type'],
                    'team': s_player_meta['team'],
                    'cost': int(s_gw_data['ctx_price'] * 10), # Use ctx_price from GW-specific data
                    'xp': real_xp['xp'],
                    'sigma': real_xp['sigma'],
                    # Dynamically add all probability keys
                    'xp_long_term': avg_xp,
                    'total_xp_5gw': total_5gw_xp,
                    'sum_prob_6_5gw': sum_prob_6,
                    'actual': s_gw_data['target'], # Use target from GW-specific data
                    'selected_by_percent': float(s_player_meta.get('selected_by_percent', 0)),
                    'status': s_player_meta.get('status', 'a'),
                    'chance_of_playing_this_round': s_player_meta.get('chance_of_playing_this_round')
                }
                
                for key, val in real_xp.items():
                    if key.startswith('prob_gt_'):
                        cand[key] = val
                        
                gw_candidates.append(cand)
        
        # B. MANAGER DECISIONS
        if objective == 'prob_6':
            # Use Sum Prob > 6 (scaled by 10) for Transfers/Init
            candidates_for_transfers = [{**c, 'xp': c['sum_prob_6_5gw'] * 10} for c in gw_candidates]
        else:
            # Use Standard Long-Term XP
            candidates_for_transfers = [{**c, 'xp': c['xp_long_term']} for c in gw_candidates]

        if gw == sim_gws[0]:
            init_squad, cost, lp_starters, lp_bench, lp_captain = get_best_starting_squad(candidates_for_transfers)
            
            # Build initial prices for purchase tracking
            initial_prices = {p['id']: price_history[p['id']][gw] for p in init_squad if p['id'] in price_history and gw in price_history[p['id']]}
            
            manager.initialize_squad(init_squad, cost, initial_prices)
            transfers = []
            active_chip_used = None
            
            # Build price lookup for current GW (needed for history)
            price_lookup = {pid: price_history[pid][gw] for pid in price_history if gw in price_history[pid]}
        else:
            manager.free_transfers = min(manager.free_transfers + 1, 5)
            
            # Build price lookup for current GW
            price_lookup = {pid: price_history[pid][gw] for pid in price_history if gw in price_history[pid]}
            
            # --- NEW RULE: Prioritize Underperforming Players (GW 3+) ---
            priority_pid = None
            if gw >= 3 and len(results_history) >= 2:
                 # Check last 3 weeks (or available history)
                 history_window = results_history[-3:] 
                 
                 # Calculate underperformance for ALL players (not just current squad)
                 underperf_map = {}  # {pid: total_diff}
                 
                 for h in history_window:
                     for p_detail in h['squad']:
                         pid = p_detail['id']
                         diff = p_detail['xp'] - p_detail['points']
                         underperf_map[pid] = underperf_map.get(pid, 0) + diff
                         
                 # Find priority sell candidate (from current squad only)
                 current_squad_set = set(manager.squad)
                 squad_underperf = [(pid, diff) for pid, diff in underperf_map.items() if pid in current_squad_set]
                 squad_underperf.sort(key=lambda x: x[1], reverse=True)
                 
                 if squad_underperf:
                    best_candidate = squad_underperf[0]
                    # Only prioritize if they are actually underperforming significantly
                    if best_candidate[1] > 2.0: 
                        priority_pid = best_candidate[0]
                        p_name = players_map[priority_pid]['web_name']

            # --- Calculate Recent Form (Avg Points last 3 Matches) ---
            recent_form_map = {}
            if gw >= 4:
                # Map element_type to position string
                type_to_pos = {1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD'}
                for pid_key, p_data_list in all_data.items(): # Iterate through positions, then players
                    for p_record in p_data_list:
                        pid = p_record['id']
                        if p_record['season'] == '25/26':
                            # Get last 3 GWs
                            pos_key = type_to_pos.get(players_map[pid]['element_type'], 'GKP') 
                            # Wait, p_data_list IS all_data[pid_key]. So we can just use p_data_list if we iterate properly.
                            # But the outer loop iterates `all_data.items()`. So `p_data_list` IS the list of records for that position.
                            # The problem is `past_matches` line was trying to look up `all_data` again using `players_map`.
                            
                            # Optimized approach:
                            # We are already iterating through `p_data_list` which contains the data we need?
                            # No, `p_data_list` contains one record per gameweek per player.
                            pass

                # Re-do the loop cleanly
                for pos, data_list in all_data.items():
                    # Group by player id first to avoid O(N^2)
                     # Actually we just want to look up past matches for the current player.
                     # Let's build a quick index if needed, or just filter carefully.
                     pass
                
                # Let's fix the specific line based on the traceback, but doing it more efficiently
                type_to_pos = {1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD'}
                
                # Pre-calculate recent form for all players in map
                for pid, p_info in players_map.items():
                    pos_str = type_to_pos.get(p_info['element_type'])
                    if not pos_str or pos_str not in all_data: continue
                    
                    # Get all samples for this player
                    player_samples = [d for d in all_data[pos_str] if d['id'] == pid and d['season'] == '25/26']
                    
                    # Filter for last 3 GWs
                    past_matches = [d for d in player_samples if gw - 3 <= d['gw'] < gw]
                    
                    if past_matches:
                        avg_points = sum(d['target'] for d in past_matches) / len(past_matches)
                        recent_form_map[pid] = avg_points
                    else:
                        recent_form_map[pid] = 0.0

            # Pass underperformance data AND recent form to make_transfers
            transfers, active_chip_used = manager.make_transfers(
                candidates_for_transfers, 
                candidates_for_transfers, 
                gw, 
                price_lookup, 
                priority_transfer_out_id=priority_pid,
                underperformance_map=underperf_map if gw > 3 else {},
                recent_form_map=recent_form_map
            )

        # Selection (Use REAL current XP)
        if gw == sim_gws[0]:
            # For GW1, use the LP-optimized lineup directly (constraints enforced)
            starters = lp_starters
            bench = lp_bench
            captain_id = lp_captain
            # Vice-captain: next highest xP starter after captain
            starters_sorted = sorted(starters, key=lambda x: x['xp'], reverse=True)
            vice_candidates = [p for p in starters_sorted if p['id'] != captain_id]
            vice_captain_id = vice_candidates[0]['id'] if vice_candidates else captain_id
        else:
            # For other GWs, use optimize_lineup (greedy selection)
            starters, bench, captain_id, vice_captain_id = manager.optimize_lineup(gw_candidates, active_chip_used)
        
        # --- CHANCE CONSTRAINED OPTIMIZATION (Refinement) ---
        # Try to maximize P(Team Score > target)
        
        # Calculate initial probability
        current_prob = calc_team_prob_gt_target(starters, captain_id, target=team_score_target)
        
        # Store for history
        manager.current_gw_prob_gt_target = current_prob
        
        # Optimize Captain for Probability > target
        best_cap_id = captain_id
        best_prob = current_prob
        
        # Only consider starters with >= X ownership as candidates (consistency)
        candidates_cap = [p for p in starters if float(p.get('selected_by_percent', 0)) >= captaincy_ownership_threshold]
        
        for cand in candidates_cap:
             prob = calc_team_prob_gt_target(starters, cand['id'], target=team_score_target)
             if prob > best_prob:
                 best_prob = prob
                 best_cap_id = cand['id']
                 
        # Update captain if better probability found
        if best_cap_id != captain_id:
            captain_id = best_cap_id
            manager.current_gw_prob_gt_target = best_prob
            
            # Update VC if needed
            if vice_captain_id == best_cap_id:
                 vice_captain_id = [p['id'] for p in starters if p['id'] != best_cap_id][0] # Fallback

        # Score calculation and History Recording
        playing_squad = starters
        if active_chip_used == "bench_boost":
            playing_squad = starters + bench
            
        gw_points = 0
        gw_xp = 0
        squad_details = []
        
        for p in playing_squad:
            pts = p['actual']
            xp = p['xp']
            xp_5gw = p.get('total_xp_5gw', p['xp'] * 5)
            sum_prob = p.get('sum_prob_6_5gw', 0.0)

            is_cap = (p['id'] == captain_id)
            is_vice = (p['id'] == vice_captain_id)
            
            if is_cap:
                pts *= 2; xp *= 2
                if active_chip_used == "triple_captain": pts += p['actual']; xp += p['xp']
            
            gw_points += pts
            gw_xp += xp
            
            # Get purchase price and calculate selling price
            purchase_price = manager.purchase_prices.get(p['id'], p['cost'])
            current_price = price_lookup.get(p['id'], p['cost'])
            selling_price = calculate_selling_price(purchase_price, current_price)
            
            detail = {
                'id': p['id'], 
                'name': p['name'], 
                'points': p['actual'], 
                'xp': p['xp'], 
                'xp_5gw': xp_5gw,
                'sum_prob_6_5gw': sum_prob,
                'selected_by_percent': p.get('selected_by_percent', '0.0'), 
                'role': 'C' if is_cap else ('V' if is_vice else 'S'),
                'purchase_price': purchase_price / 10.0,
                'current_price': current_price / 10.0,
                'selling_price': selling_price / 10.0,
                'status': p.get('status', 'a'),
                'injury_chance': p.get('chance_of_playing_this_round')
            }
            # Add dynamic probs
            for key, val in p.items():
                if key.startswith('prob_gt_'):
                    detail[key] = val
                    
            squad_details.append(detail)

        bench_players_visual = bench if active_chip_used != "bench_boost" else []
        for p in bench_players_visual:
            xp_5gw = p.get('total_xp_5gw', p['xp'] * 5) # Fallback
            sum_prob = p.get('sum_prob_6_5gw', 0.0)

            purchase_price = manager.purchase_prices.get(p['id'], p['cost'])
            current_price = price_lookup.get(p['id'], p['cost'])
            selling_price = calculate_selling_price(purchase_price, current_price)
            
            detail = {
                'id': p['id'], 
                'name': p['name'], 
                'points': p['actual'], 
                'xp': p['xp'], 
                'xp_5gw': xp_5gw,
                'sum_prob_6_5gw': sum_prob,
                'selected_by_percent': p.get('selected_by_percent', '0.0'), 
                'role': 'B',
                'purchase_price': purchase_price / 10.0,
                'current_price': current_price / 10.0,
                'selling_price': selling_price / 10.0,
                'status': p.get('status', 'a'),
                'injury_chance': p.get('chance_of_playing_this_round')
            }
            # Add dynamic probs
            for key, val in p.items():
                if key.startswith('prob_gt_'):
                    detail[key] = val
            squad_details.append(detail)
            
        hits_cost = 0  
        if active_chip_used in ["wildcard", "freehit"]: hits_cost = 0
        net_score = gw_points - hits_cost
        
        history_entry = {
            'gw': gw, 'points': gw_points, 'total_xp': gw_xp, 'net_points': net_score,
            'transfer_cost': hits_cost, 'active_chip': active_chip_used,
            'transfers': transfers, 
            'squad': squad_details, 'bank': manager.bank / 10.0,
            'free_transfers': manager.free_transfers,
            'team_prob_gt_target': getattr(manager, 'current_gw_prob_gt_target', 0.0)
        }
        results_history.append(history_entry)
        
        print(f"GW {gw}: {net_score} pts (xP: {gw_xp:.1f}) | {active_chip_used or 'No Chip'}")
        
        if active_chip_used == "freehit" and hasattr(manager, 'original_squad'):
            manager.squad = manager.original_squad
            manager.bank = manager.original_bank
            manager.purchase_prices = manager.original_purchase_prices  # Restore prices
            del manager.original_squad
            del manager.original_bank
            del manager.original_purchase_prices
            
        # D. TRAINING PHASE
        # ... (Same as before) ...
        # print(f"📈 Updating models...")
        for pos in POSITIONS:
            samples = [d for d in all_data[pos] if d.get('season') == '25/26' and d['gw'] == gw]
            if not samples: continue
            
            X_seq = np.array([d['history_sequence'] for d in samples], dtype=np.float32)
            X_ctx = np.array([[d['ctx_was_home'], d['ctx_difficulty'], d['ctx_price'], d['ctx_hours_rest'],
                               d['ctx_all_time_avg_points'], d['ctx_all_time_total_points'],
                               d['ctx_all_time_goals_per_90'], d['ctx_all_time_xg_per_90'], d['ctx_all_time_games_played'],
                               d['ctx_form'], d['ctx_ownership']]  # NEW: Added form and ownership
                              for d in samples], dtype=np.float32)
            X_opp = np.array([d['ctx_opponent'] for d in samples], dtype=np.float32)
            y = np.array([d['target'] for d in samples], dtype=np.float32)
            
            X_seq, X_ctx = clean_and_scale(X_seq, X_ctx)
            X_opp = X_opp / 1350.0
            
            # --- Retrain Categorical Model ---
            model = models[pos]
            
            y_clipped = np.clip(y, 0, 15).astype(int)
            y_categorical = tf.keras.utils.to_categorical(y_clipped, num_classes=16)
            
            model.fit([X_seq, X_ctx, X_opp], y_categorical, epochs=3, batch_size=32, verbose=0)

    # Save
    results_history.reverse()
    # Save
    results_history.reverse()
    try:
        with open(OUTPUT_FILE, "w") as f:
            json.dump(results_history, f)
        # print(f"✅ Simulation saved to {OUTPUT_FILE}")
    except Exception as e:
        print(f"❌ Failed to save output: {e}")

    # Export Predictions for Frontend
    try:
        # We export predictions for the *next* gameweek after the simulation ends
        # Or if we want to show predictions for the LAST simulated GW (if we are simulating past)
        # Assuming we want adjacent future predictions starting from end_gw (or current real world GW)
        # For simplicity, let's export predictions for the last simulated GW + 1 (future)
        # Wait, if we run backtest, last GW is current.
        
        last_simulated_gw = sim_gws[-1] if sim_gws else 1
        export_gw = last_simulated_gw  # Or +1? Usually we want next GW. 
        # But if we simulated GW 24, we already have results for it. The predictions for it were made BEFORE it.
        # The frontend usually wants predictions for UPCOMING games.
        # If sim_gws ends at 24, and 24 is 'finished', we want preds for 25.
        # But our dataset might not have '25' data if it's strictly historical?
        # Let's trust predict_gw handles it if data exists.
        
        # NOTE: For this specific request, we export the LAST simulated gameweek's predictions if we treat it as "current"
        # Or we loop current -> +5.
        
        # Let's take the last simulated GW as the 'current' reference point.
        last_simulated_gw = sim_gws[-1] if sim_gws else 1
        ref_gw = last_simulated_gw 
        
        predictions_export = []
        
        # 1. Get predictions for ref_gw (including probabilities)
        current_preds = predict_gw(ref_gw, all_data=all_data, models=models, prob_thresholds=prob_thresholds)
        
        # 2. Get projections for next 5 GWs (ref_gw to ref_gw+4)
        # We need to loop. Be careful about efficiency.
        
        long_term_preds = {} # {pid: [xp1, xp2, ...]}
        for offset in range(5):
            target = ref_gw + offset
            # Just predict xP for efficiency, or predict_gw if fast enough. 
            # predict_gw calculates probabilities too, which is expensive but we want it for the first week at least.
            if offset == 0:
                # We already have current_preds
                for pid, p in current_preds.items():
                    if pid not in long_term_preds: long_term_preds[pid] = []
                    long_term_preds[pid].append(p['xp'])
            else:
                 # Future GWs
                 future_preds = predict_gw(target, frozen_gw=ref_gw, all_data=all_data, models=models, prob_thresholds=[]) # Empty list to skip prob calc if not needed?
                 # Actually predict_gw might fail if we pass empty list but models expect something?
                 # Let's pass prob_thresholds but ignore output
                 for pid, p in future_preds.items():
                     if pid not in long_term_preds: long_term_preds[pid] = []
                     long_term_preds[pid].append(p['xp'])
        
        # 3. Assemble
        for pid, p_data in current_preds.items():
            if pid not in players_map: continue
            
            # Basic info
            entry = {
                "id": pid,
                "name": players_map[pid]['web_name'],
                "team": players_map[pid]['team'],
                "total5Week": sum(long_term_preds.get(pid, [])),
                "projections": [{"gw": ref_gw + i, "xP": xp} for i, xp in enumerate(long_term_preds.get(pid, []))],
            }
            
            # Add probabilities dynamically
            for t in prob_thresholds:
                entry[f"prob_gt_{t}"] = p_data.get(f"prob_gt_{t}", 0)

            predictions_export.append(entry)
            
        with open("public/data/ai_predictions.json", "w") as f:
            json.dump(predictions_export, f)
        print("✅ Exported ai_predictions.json with probabilities")

    except Exception as e:
        print(f"❌ Failed to export predictions: {e}")

    total_net_points = sum(h['net_points'] for h in results_history)
    print(f"🏁 DONE ({objective}, Thresholds={prob_thresholds}, Target={team_score_target}): Total Net Points = {total_net_points}")
    
    return total_net_points

if __name__ == "__main__":
    # Settings
    PROB_THRESHOLDS = [6, 10] # Calc Prob > 6 and Prob > 10
    TEAM_SCORE_TARGET = 60.0 # Aim for 60 pts/week for crisis checks
    
    # Run
    run_simulation(objective='xp', prob_thresholds=PROB_THRESHOLDS, team_score_target=TEAM_SCORE_TARGET, captaincy_ownership_threshold=50.0)

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
from src.scripts.lib.fpl_manager import FPLManager, get_best_starting_squad, calculate_selling_price, calc_team_prob_gt_60

def run_simulation(explosive_threshold=5.0):
    print(f"🚀 Starting AI Manager Simulation (Threshold={explosive_threshold})...")
    os.makedirs(MODELS_DIR, exist_ok=True)
    
    # 1. Load Data
    all_data = {}
    for pos in POSITIONS:
        try:
            all_data[pos] = load_json(os.path.join(DATA_DIR, f"dataset_{pos}.json"))
        except FileNotFoundError:
            print(f"❌ Data for {pos} not found. Run analysis/generate_dataset first.")
            return 0
        
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
        return 0
    sim_gws = [g for g in sim_gws if g >= 1]
    
    # print(f"📅 Simulating GWs: {sim_gws}")
    
    # 4. Initialize Manager
    manager = FPLManager(players_map)
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
                           d['ctx_all_time_goals_per_90'], d['ctx_all_time_xg_per_90'], d['ctx_all_time_games_played']]
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
            print(f"Skipping training for {pos}, model exists. Loading from {model_path}")
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
        
        # A. PREDICTION PHASE (Current + Long Term)
        # 1. Current GW Predictions
        current_preds_map = predict_gw(gw, all_data=all_data, models=models)
        
        # 2. Long Term Predictions (Avg next 5 GWs)
        long_term_xp_map = {pid: 0.0 for pid in current_preds_map}
        count_map = {pid: 0 for pid in current_preds_map}
        
        # Look ahead up to 5 GWs (including current)
        for offset in range(5): 
            target_gw = gw + offset
            # Use FROZEN form from current GW to prevent data leak
            future_preds = predict_gw(target_gw, frozen_gw=gw, all_data=all_data, models=models)
            for pid, p_data in future_preds.items():
                if pid in long_term_xp_map:
                    long_term_xp_map[pid] += p_data['xp']
                    count_map[pid] += 1
        
        gw_candidates = []
        for pos in POSITIONS:
            samples = [d for d in all_data[pos] if d.get('season') == '25/26' and d['gw'] == gw]
            for s in samples:
                pid = s['id']
                if pid not in current_preds_map: continue
                
                real_xp = current_preds_map[pid]
                avg_xp = long_term_xp_map[pid] / max(1, count_map[pid])

                gw_candidates.append({
                    'id': pid,
                    'name': s['name'],
                    'type': players_map[pid]['element_type'],
                    'team': players_map[pid]['team'],
                    'cost': int(s['ctx_price'] * 10), # Scale to 0.1m units
                    'xp': real_xp['xp'],
                    'xp': real_xp['xp'],
                    'sigma': real_xp['sigma'],
                    'prob_gt_10': real_xp['prob_gt_10'],
                    'prob_gt_6': real_xp['prob_gt_6'],
                    'xp_long_term': avg_xp,
                    'actual': s['target'],
                    'selected_by_percent': float(players_map[pid].get('selected_by_percent', 0)),
                    'status': players_map[pid].get('status', 'a'),
                    'chance_of_playing_this_round': players_map[pid].get('chance_of_playing_this_round')
                })
        
        # B. MANAGER DECISIONS
        # Use Long-Term XP for Transfers/Init
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
            if gw >= 3:
                 # Check last 3 weeks (or available history)
                 # results_history has [GW1, GW2...] 
                 # If gw=3, results_history has 2 entries (GW1, GW2).
                 history_window = results_history[-3:] 
                 
                 # Calculate underperformance for ALL players (not just current squad)
                 # This will help us avoid bringing in underperforming players
                 underperf_map = {}  # {pid: total_diff}
                 
                 for h in history_window:
                     for p_detail in h['squad']:
                         pid = p_detail['id']
                         # Underperformance = Predicted - Actual
                         # e.g. Pred 10 - Actual 2 = 8 (High Underperformance)
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
                        print(f"📉 GW {gw}: Priority Sell Candidate {p_name} (Underperf: {best_candidate[1]:.1f})")

            # Pass underperformance data to make_transfers
            transfers, active_chip_used = manager.make_transfers(
                candidates_for_transfers, 
                candidates_for_transfers, 
                gw, 
                price_lookup, 
                priority_transfer_out_id=priority_pid,
                underperformance_map=underperf_map if gw > 3 else {}
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
        # Try to maximize P(Team Score > 60)
        # We start with the high-xP squad and try to swap players to improve probability
        # This is a greedy hill-climbing approach
        


        # Calculate initial probability
        current_prob = calc_team_prob_gt_60(starters, captain_id)
        # print(f"📊 Initial Team Prob > 60: {current_prob:.2%}")
        
        # Store for history
        manager.current_gw_prob_gt_60 = current_prob
        
        # Optimize Captain for Probability > 60
        # Check if changing captain improves generic probability
        best_cap_id = captain_id
        best_prob = current_prob
        
        # Only consider starters with >= 30% ownership as candidates (consistency)
        # or just the Vice Captain
        candidates_cap = [p for p in starters if float(p.get('selected_by_percent', 0)) >= 30.0]
        
        for cand in candidates_cap:
             prob = calc_team_prob_gt_60(starters, cand['id'])
             if prob > best_prob:
                 best_prob = prob
                 best_cap_id = cand['id']
                 
        # Update captain if better probability found
        if best_cap_id != captain_id:
            # print(f"💡 Switched Captain {captain_id} -> {best_cap_id} (Prob: {current_prob:.2%} -> {best_prob:.2%})")
            captain_id = best_cap_id
            manager.current_gw_prob_gt_60 = best_prob
            
            # Update VC if needed (if VC was the new Cap)
            if vice_captain_id == best_cap_id:
                # Pick new VC (old Cap)
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
            
            squad_details.append({
                'id': p['id'], 
                'name': p['name'], 
                'points': p['actual'], 
                'xp': p['xp'], 
                'prob_gt_10': p.get('prob_gt_10', 0.0),
                'prob_gt_6': p.get('prob_gt_6', 0.0),
                'selected_by_percent': p.get('selected_by_percent', '0.0'), 
                'role': 'C' if is_cap else ('V' if is_vice else 'S'),
                'purchase_price': purchase_price / 10.0,
                'current_price': current_price / 10.0,
                'selling_price': selling_price / 10.0,
                'status': p.get('status', 'a')
            })

        bench_players_visual = bench if active_chip_used != "bench_boost" else []
        for p in bench_players_visual:
            # Get purchase price and calculate selling price
            purchase_price = manager.purchase_prices.get(p['id'], p['cost'])
            current_price = price_lookup.get(p['id'], p['cost'])
            selling_price = calculate_selling_price(purchase_price, current_price)
            
            squad_details.append({
                'id': p['id'], 
                'name': p['name'], 
                'points': p['actual'], 
                'xp': p['xp'], 
                'prob_gt_10': p.get('prob_gt_10', 0.0),
                'prob_gt_6': p.get('prob_gt_6', 0.0),
                'selected_by_percent': p.get('selected_by_percent', '0.0'), 
                'role': 'B',
                'purchase_price': purchase_price / 10.0,
                'current_price': current_price / 10.0,
                'selling_price': selling_price / 10.0,
                'status': p.get('status', 'a')
            })
            
        # Hits cost is already handled by the manager's free_transfers logic
        # transfers is now a list of strings, not dicts
        hits_cost = 0  # Manager already deducts from free_transfers
        if active_chip_used in ["wildcard", "freehit"]: hits_cost = 0
        net_score = gw_points - hits_cost
        
        history_entry = {
            'gw': gw, 'points': gw_points, 'total_xp': gw_xp, 'net_points': net_score,
            'transfer_cost': hits_cost, 'active_chip': active_chip_used,
            'transfers': transfers,  # Now a list of strings like "Out: Player1 (5.2), In: Player2 (6.1)"
            'squad': squad_details, 'bank': manager.bank / 10.0,
            'free_transfers': manager.free_transfers,
            'team_prob_gt_60': getattr(manager, 'current_gw_prob_gt_60', 0.0)
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
        # print(f"📈 Updating models...")
        for pos in POSITIONS:
            samples = [d for d in all_data[pos] if d.get('season') == '25/26' and d['gw'] == gw]
            if not samples: continue
            
            X_seq = np.array([d['history_sequence'] for d in samples], dtype=np.float32)
            X_ctx = np.array([[d['ctx_was_home'], d['ctx_difficulty'], d['ctx_price'], d['ctx_hours_rest'],
                               d['ctx_all_time_avg_points'], d['ctx_all_time_total_points'],
                               d['ctx_all_time_goals_per_90'], d['ctx_all_time_xg_per_90'], d['ctx_all_time_games_played']]
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
    try:
        with open(OUTPUT_FILE, "w") as f:
            json.dump(results_history, f)
        print(f"✅ Simulation saved to {OUTPUT_FILE}")
    except Exception as e:
        print(f"❌ Failed to save output: {e}")
        
    total_net_points = sum(h['net_points'] for h in results_history)
    print(f"🏁 DONE (Threshold={explosive_threshold}): Total Net Points = {total_net_points}")
    return total_net_points

if __name__ == "__main__":
    run_simulation(5.0)

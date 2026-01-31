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

from research.lib.config import *
from research.lib.utils import load_json
from research.lib.models import build_model, clean_and_scale
from research.lib.fpl_manager import FPLManager, get_best_starting_squad, calculate_selling_price

def main():
    print("🚀 Starting AI Manager Simulation (Refactored)...")
    os.makedirs(MODELS_DIR, exist_ok=True)
    
    # 1. Load Data
    all_data = {}
    for pos in POSITIONS:
        try:
            all_data[pos] = load_json(os.path.join(DATA_DIR, f"dataset_{pos}.json"))
        except FileNotFoundError:
            print(f"❌ Data for {pos} not found. Run analysis/generate_dataset first.")
            return
        
    # 2. Load Metadata
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    cursor.execute("SELECT data FROM fixtures")
    fixtures = [json.loads(r['data']) for r in cursor.fetchall()]
    
    cursor.execute("SELECT data FROM players")
    players = [json.loads(r['data']) for r in cursor.fetchall()]
    players_map = {p['id']: p for p in players}
    
    # 3. Build Price History Lookup
    print("💰 Building price history...")
    price_history = {}  # {player_id: {gw: price}}
    for pos in POSITIONS:
        for record in all_data[pos]:
            pid = record['id']
            gw = record['gw']
            price = record['ctx_price']
            
            if pid not in price_history:
                price_history[pid] = {}
            price_history[pid][gw] = price
    
    # 4. Simulation Range (25/26 Season)
    sim_gws = sorted(list(set([d['gw'] for p in POSITIONS for d in all_data[p] if d.get('season') == '25/26'])))
    if not sim_gws:
        print("Error: No 25/26 data found.")
        return
    sim_gws = [g for g in sim_gws if g >= 1]
    
    print(f"📅 Simulating GWs: {sim_gws}")
    
    # 4. Initialize Manager
    manager = FPLManager(players_map)
    models = {}
    
    # Initial Training
    print("🧠 Training Base Models (Pre-25/26)...")
    for pos in POSITIONS:
        raw_data = all_data[pos]
        train_samples = [d for d in raw_data if d.get('season') != '25/26'] 
        
        if not train_samples:
            print(f"⚠️ No historical data for {pos}. Model will start random.")
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
        print(f"✅ Trained {pos} ({len(train_samples)} samples)")

    # 5. Gameweek Loop
    results_history = []
    
    # Helper for 5-GW Lookahead
    def predict_gw(target_gw, frozen_gw=None):
        preds_map = {}
        for pos in POSITIONS:
            # 1. Get Samples for TARGET gw (for Context: Opponent, Difficulty, etc.)
            target_samples = [d for d in all_data[pos] if d.get('season') == '25/26' and d['gw'] == target_gw]
            if not target_samples: continue

            # 2. Get Form Data (History Sequence)
            if frozen_gw:
                # Lookahead Case: Use Form from FROZEN GW
                frozen_samples_map = {d['id']: d['history_sequence'] for d in all_data[pos] if d.get('season') == '25/26' and d['gw'] == frozen_gw}
                
                final_samples = []
                final_seqs = []
                
                for s in target_samples:
                    if s['id'] in frozen_samples_map:
                        final_samples.append(s)
                        final_seqs.append(frozen_samples_map[s['id']])
                
                if not final_samples: continue
                
                X_seq = np.array(final_seqs, dtype=np.float32)
                # Use Target Context
                X_ctx = np.array([[d['ctx_was_home'], d['ctx_difficulty'], d['ctx_price'], d['ctx_hours_rest']] for d in final_samples], dtype=np.float32)
                X_opp = np.array([d['ctx_opponent'] for d in final_samples], dtype=np.float32)
                predict_samples = final_samples
            
            else:
                # Standard Case
                X_seq = np.array([d['history_sequence'] for d in target_samples], dtype=np.float32)
                X_ctx = np.array([[d['ctx_was_home'], d['ctx_difficulty'], d['ctx_price'], d['ctx_hours_rest']] for d in target_samples], dtype=np.float32)
                X_opp = np.array([d['ctx_opponent'] for d in target_samples], dtype=np.float32)
                predict_samples = target_samples

            X_seq, X_ctx = clean_and_scale(X_seq, X_ctx)
            X_opp = X_opp / 1350.0
            
            p_vals = models[pos].predict([X_seq, X_ctx, X_opp], verbose=0).flatten()
            for i, s in enumerate(predict_samples):
                preds_map[s['id']] = float(p_vals[i])
        return preds_map

    for gw in sim_gws:
        print(f"--- GW {gw} ---")
        
        # A. PREDICTION PHASE (Current + Long Term)
        # 1. Current GW Predictions
        current_preds_map = predict_gw(gw)
        
        # 2. Long Term Predictions (Avg next 5 GWs)
        long_term_xp_map = {pid: 0.0 for pid in current_preds_map}
        count_map = {pid: 0 for pid in current_preds_map}
        
        # Look ahead up to 5 GWs (including current)
        for offset in range(5): 
            target_gw = gw + offset
            # Use FROZEN form from current GW to prevent data leak
            future_preds = predict_gw(target_gw, frozen_gw=gw)
            for pid, xp in future_preds.items():
                if pid in long_term_xp_map:
                    long_term_xp_map[pid] += xp
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
                    'cost': s['ctx_price'],
                    'xp': real_xp,
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
            init_squad, cost = get_best_starting_squad(candidates_for_transfers)
            
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
            
            transfers, active_chip_used = manager.make_transfers(candidates_for_transfers, candidates_for_transfers, gw, price_lookup)
            
        # Selection (Use REAL current XP)
        starters, bench, captain_id, vice_captain_id = manager.optimize_lineup(gw_candidates, active_chip_used)
        
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
                'selected_by_percent': p.get('selected_by_percent', '0.0'), 
                'role': 'C' if is_cap else ('V' if is_vice else 'S'),
                'purchase_price': purchase_price,
                'current_price': current_price,
                'selling_price': selling_price,
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
                'selected_by_percent': p.get('selected_by_percent', '0.0'), 
                'role': 'B',
                'purchase_price': purchase_price,
                'current_price': current_price,
                'selling_price': selling_price,
                'status': p.get('status', 'a')
            })
            
        hits_cost = sum(t['cost'] for t in transfers)
        if active_chip_used in ["wildcard", "freehit"]: hits_cost = 0
        net_score = gw_points - hits_cost
        
        history_entry = {
            'gw': gw, 'points': gw_points, 'total_xp': gw_xp, 'net_points': net_score,
            'transfer_cost': hits_cost, 'active_chip': active_chip_used,
            'transfers': [{'in': t['in']['name'], 'out': t['out']['name']} for t in transfers],
            'squad': squad_details, 'bank': manager.bank
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
        print(f"📈 Updating models...")
        for pos in POSITIONS:
            samples = [d for d in all_data[pos] if d.get('season') == '25/26' and d['gw'] == gw]
            if not samples: continue
            
            X_seq = np.array([d['history_sequence'] for d in samples], dtype=np.float32)
            X_ctx = np.array([[d['ctx_was_home'], d['ctx_difficulty'], d['ctx_price'], d['ctx_hours_rest']] for d in samples], dtype=np.float32)
            X_opp = np.array([d['ctx_opponent'] for d in samples], dtype=np.float32)
            y = np.array([d['target'] for d in samples], dtype=np.float32)
            
            X_seq, X_ctx = clean_and_scale(X_seq, X_ctx)
            X_opp = X_opp / 1350.0
            models[pos].fit([X_seq, X_ctx, X_opp], y, epochs=3, batch_size=32, verbose=0)

    # Save
    results_history.reverse()
    try:
        with open(OUTPUT_FILE, "w") as f:
            json.dump(results_history, f)
        print(f"✅ Simulation saved to {OUTPUT_FILE}")
    except Exception as e:
        print(f"❌ Failed to save output: {e}")

if __name__ == "__main__":
    main()

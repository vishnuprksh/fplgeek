import json
import os
from typing import Dict, List, Any, Optional, cast

import numpy as np  # type: ignore[import]
import joblib  # type: ignore[import]
import tensorflow as tf  # type: ignore[import]
from src.scripts.lib.config import DATA_DIR, POSITIONS, INPUT_DIM, MODELS_DIR, EPOCHS, BATCH_SIZE, NUM_CTX_FEATURES  # type: ignore[import]
from src.scripts.lib.models import build_model, clean_and_scale, fit_scaler, load_scaler  # type: ignore[import]
from sklearn.model_selection import train_test_split  # type: ignore[import]
from sklearn.metrics import accuracy_score, mean_absolute_error, log_loss  # type: ignore[import]

# Feature Indices in history_sequence (based on generate_dataset.ts)
# 0: Min, 1: xG, 2: xA, 3: Thr, 4: Cre, 5: Inf, 6: GC, 7: Saves, 8: Sel, 9: Price, 10: Home, 11: Pts, 12: Form
IDX_MIN = 0
IDX_PTS = 11
IDX_XG = 1
IDX_XA = 2
IDX_INF = 5
IDX_CRE = 4
IDX_THR = 3
IDX_GC = 6
IDX_SAVES = 7

AGG_INDICES = [IDX_MIN, IDX_PTS, IDX_XG, IDX_XA, IDX_INF, IDX_CRE, IDX_THR, IDX_GC, IDX_SAVES]
AGG_NAMES = ["min", "pts", "xG", "xA", "inf", "cre", "thr", "gc", "saves"]
AGG_WINDOWS = [4, 10]  # Dual rolling windows: short-term form + medium-term trend

def load_and_process_data(position):
    """
    Load data for a position and engineer static features.
    """
    file_path = os.path.join(DATA_DIR, f"dataset_{position}.json")
    if not os.path.exists(file_path):
        print(f"Warning: No data found for {position}")
        return np.array([]), np.array([]), []

    with open(file_path, "r") as f:
        data = json.load(f)

    X_list = []
    y_list = []
    meta_list = []

    for sample in data:
        # 1. Target
        # Classify points into 0-15+
        target = max(0, min(int(sample["target"]), 15))
        y_list.append(target)

        # 2. Context Features (7 features — no all-time career stats)
        # [was_home, diff, price, rest, own, opp, chance_of_playing]
        ctx = [
            sample["ctx_was_home"],
            sample["ctx_difficulty"],
            sample["ctx_price"],
            sample["ctx_hours_rest"],
            sample["ctx_ownership"],
            sample["ctx_opponent"],
            sample.get("ctx_chance_of_playing", 100)
        ]
        
        # 3. Dual Rolling-Window Aggregated Features (9 × 2 = 18 features)
        history = sample["history_sequence"]  # List of lists
        # history[0] is most recent match (due to unshift in generate_dataset.ts)
        
        hist_arr = np.array(history)  # Shape (10, 13) with LOOKBACK=10
        if len(hist_arr) == 0:
            aggs = np.zeros(len(AGG_INDICES) * len(AGG_WINDOWS))
        else:
            def get_agg(n: int) -> np.ndarray:
                available = min(n, len(hist_arr))
                if available == 0:
                    return np.zeros(len(AGG_INDICES))
                sub = hist_arr[:available]
                subset_vals = sub[:, AGG_INDICES]
                total = np.sum(subset_vals, axis=0)
                return total / n

            agg_parts = [get_agg(w) for w in AGG_WINDOWS]
            aggs = np.concatenate(agg_parts)  # 9 + 9 = 18 features

        # Combine: 7 ctx + 18 agg = 25
        full_vec = np.concatenate([ctx, aggs])
        X_list.append(full_vec)
        meta_list.append(sample)

    return np.array(X_list), np.array(y_list), meta_list

def train_position_model(pos):
    print(f"\nTraining Model for {pos}...")
    X, y, meta = load_and_process_data(pos)
    
    if len(X) == 0:
        print(f"No data for {pos}")
        return None

    # Clean NaN/Inf first (no scaling yet)
    X = clean_and_scale(X)
    
    # Split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    X_train, X_val, y_train, y_val = train_test_split(X_train, y_train, test_size=0.2, random_state=42)
    
    # Fit StandardScaler on training data only
    scaler = fit_scaler(X_train, pos)
    X_train = scaler.transform(X_train)
    X_val = scaler.transform(X_val)
    X_test = scaler.transform(X_test)
    
    print(f"Train: {X_train.shape}, Val: {X_val.shape}, Test: {X_test.shape}")
    
    # Build
    clf = build_model()
    
    # Train
    clf.fit(X_train, y_train)
    
    # Training Metrics
    train_preds = clf.predict(X_train)
    train_acc = accuracy_score(y_train, train_preds)
    train_mae = mean_absolute_error(y_train, train_preds)
    
    # Validation Metrics
    val_preds = clf.predict(X_val)
    val_probs = clf.predict_proba(X_val)
    
    # Handle probas shape for log_loss
    full_val_probs = np.zeros((len(X_val), 16))
    for i, cls in enumerate(clf.classes_):
        if cls < 16: full_val_probs[:, int(cls)] = val_probs[:, i]
        
    acc = accuracy_score(y_val, val_preds)
    mae = mean_absolute_error(y_val, val_preds)
    loss = log_loss(y_val, full_val_probs, labels=list(range(16)))
    
    print(f"Train Acc: {train_acc:.4f} | Val Acc: {acc:.4f} | Val MAE: {mae:.4f}")
    
    # Save model
    joblib.dump(clf, os.path.join(MODELS_DIR, f"model_{pos}.joblib"))
    
    return {
        "pos": pos,
        "model": clf,
        "accuracy": acc,
        "mae": mae,
        "loss": loss,
        "train_accuracy": train_acc,
        "train_mae": train_mae,
        "X": X,
        "y": y,
        "meta": meta
    }

class Backtester:
    def __init__(self, target_season="25/26"):
        self.target_season = target_season
        self.squad = [] 
        self.bank = 1000.0 
        self.history = []
        self.data_store = {}
        self.transfers = []
        self.current_preds = {}

    def run(self):
        print(f"Starting Backtest for {self.target_season}...")
        
        # 1. Load All Data
        for pos in POSITIONS:
            print(f"Loading {pos}...")  
            X, y, meta = load_and_process_data(pos)
            self.data_store[pos] = {
                "X": X, "y": y, "meta": meta
            }

        # 2. Identify Gameweeks in Target Season
        gws = set()
        for m in self.data_store['GKP']['meta']:
            if m['season'] == self.target_season:
                gws.add(m['gw'])
        
        sorted_gws = sorted(list(gws))
        print(f"Simulating GWs: {sorted_gws}")
        
        # 3. Simulation Loop
        models: Dict[str, Any] = {} 
        
        for gw in sorted_gws:
            print(f"--- Simulating GW {gw} ---")
            
            # A. Train/Update Models
            for pos in POSITIONS:
                print(f"Updating {pos} model...", end="", flush=True)
                X = self.data_store[pos]["X"]
                y = self.data_store[pos]["y"]
                meta = self.data_store[pos]["meta"]
                
                # Split logic
                train_mask = []
                predict_mask = []
                for m in meta:
                    is_target_season = (m['season'] == self.target_season)
                    if is_target_season and m['gw'] == gw:
                        train_mask.append(False)
                        predict_mask.append(True)
                    elif is_target_season and m['gw'] > gw:
                        train_mask.append(False)
                        predict_mask.append(False)
                    else:
                        train_mask.append(True)
                        predict_mask.append(False)
                
                train_idx = np.where(train_mask)[0]
                pred_idx = np.where(predict_mask)[0]
                
                if len(pred_idx) == 0:
                    continue
                    
                X_train_raw = clean_and_scale(X[train_idx])
                y_train = y[train_idx] # Keep as integers
                
                # Check if we have enough data
                if len(set(y_train)) < 1:
                    continue

                if pos not in models:
                    models[pos] = build_model()
                
                # Fit scaler on training data for this GW
                from sklearn.preprocessing import StandardScaler  # type: ignore[import]
                scaler = StandardScaler()
                X_train_scaled = scaler.fit_transform(X_train_raw)
                    
                # Retrain RF from scratch each GW
                cast(Any, models[pos]).fit(X_train_scaled, y_train)
                
                # Predict
                X_pred_raw = clean_and_scale(X[pred_idx])
                X_pred_scaled = scaler.transform(X_pred_raw)
                
                # We need Probabilities for expected value
                raw_probs = cast(Any, models[pos]).predict_proba(X_pred_scaled)
                
                # Map to 16 classes
                preds = np.zeros((len(X_pred_scaled), 16), dtype=np.float32)
                for i, cls in enumerate(cast(Any, models[pos]).classes_):
                    if cls < 16: preds[:, int(cls)] = raw_probs[:, i]
                
                self.store_predictions(pos, meta, pred_idx, preds)
                print(f" Done.")

            # B. Pick Squad
            self.manage_squad(gw)
            # C. Score
            self.score_gw(gw)
            
            # Incremental Save
            self.save_history()
        
        # 4. Save
        self.save_history()

    def store_predictions(self, pos, meta, indices, preds):
        player_indices = {}
        for i, idx in enumerate(indices):
            pid = meta[idx]['id']
            if pid not in player_indices: player_indices[pid] = []
            player_indices[pid].append(i)
            
        classes = np.arange(16, dtype=np.float32)

        for pid, p_idxs in player_indices.items():
            first_idx = indices[p_idxs[0]]
            m = meta[first_idx]
            dists: List[np.ndarray] = [preds[i] for i in p_idxs]
            
            if len(dists) == 1:
                final_dist = dists[0]
                xp = np.sum(final_dist * classes)
            else:
                combined = dists[0]
                for d in cast(List[np.ndarray], dists)[1:]:  # type: ignore
                    combined = np.convolve(combined, d)
                c_classes = np.arange(len(combined), dtype=np.float32)
                xp = np.sum(combined * c_classes)
                final_dist = combined

            actual_points = sum(float(meta[indices[i]]['target']) for i in p_idxs)
            
            if 7 < len(final_dist):
                prob_gt_6 = np.sum(final_dist[7:])
            else:
                prob_gt_6 = 0.0
            if 11 < len(final_dist):
                prob_gt_10 = np.sum(final_dist[11:])
            else:
                prob_gt_10 = 0.0
            
            self.current_preds[pid] = {
                "id": pid,
                "name": m.get('web_name', str(pid)),
                "xp": float(xp),
                "prob_gt_6": float(prob_gt_6),
                "prob_gt_10": float(prob_gt_10),
                "pos": pos,
                "price": float(m['ctx_price']),
                "actual_points": float(actual_points),
                "element_type": 1 if pos=="GKP" else 2 if pos=="DEF" else 3 if pos=="MID" else 4
            }

    def manage_squad(self, gw):
        preds = list(self.current_preds.values())
        preds.sort(key=lambda x: x['prob_gt_6'], reverse=True)
        
        if not self.squad:
            # Initial squad selection based on prob_gt_6
            gkps = [p for p in preds if p['pos']=="GKP"]
            defs = [p for p in preds if p['pos']=="DEF"]
            mids = [p for p in preds if p['pos']=="MID"]
            fwds = [p for p in preds if p['pos']=="FWD"]
            
            # Sort each position by prob_gt_6
            gkps.sort(key=lambda x: x['prob_gt_6'], reverse=True)
            defs.sort(key=lambda x: x['prob_gt_6'], reverse=True)
            mids.sort(key=lambda x: x['prob_gt_6'], reverse=True)
            fwds.sort(key=lambda x: x['prob_gt_6'], reverse=True)
            
            # Build squad: 2 GKP, 5 DEF, 5 MID, 3 FWD
            # type: ignore[operator]
            self.squad = cast(List[Dict[str, Any]], gkps)[:2] + cast(List[Dict[str, Any]], defs)[:5] + cast(List[Dict[str, Any]], mids)[:5] + cast(List[Dict[str, Any]], fwds)[:3]
            
            # Adjust for budget constraints
            cost = sum(p['price'] for p in self.squad)
            while cost > self.bank:
                self.squad.sort(key=lambda x: x['price'], reverse=True)
                expensive = self.squad[0]
                self.squad.remove(expensive)
                candidates = [p for p in preds if p['pos'] == expensive['pos'] and p not in self.squad]
                candidates.sort(key=lambda x: x['price'])
                if candidates:
                    self.squad.append(candidates[0])
                cost = sum(p['price'] for p in self.squad)
            self.transfers = []
        else:
            self.transfers = []
            self.squad.sort(key=lambda x: x['prob_gt_6'])
            worst = self.squad[0]
            
            # Refresh squad data with new preds (prob_gt_6 changes)
            new_squad = []
            for p in self.squad:
                # Find current pred for this player
                # BETTER: Match by ID if available, else name
                cp = None
                if 'id' in p:
                     cp = next((x for x in preds if x['id'] == p['id']), None)
                if not cp:
                     cp = next((x for x in preds if x['name'] == p['name']), None)
                
                if cp:
                    new_squad.append(cp)
                else:
                    new_squad.append(p) # Keep old if missing (shouldn't happen)
            self.squad = new_squad
            self.squad.sort(key=lambda x: x['prob_gt_6'])
            worst = self.squad[0]
            
            market = [p for p in preds if p not in self.squad]
            market.sort(key=lambda x: x['prob_gt_6'], reverse=True)
            best = next((p for p in market if p['pos'] == worst['pos']), None)
            
            # Transfer if best player has significantly higher probability
            if best and best['prob_gt_6'] > worst['prob_gt_6'] + 0.15:  # 15% higher probability
                current_cost = sum(float(p['price']) for p in self.squad)
                if current_cost - float(worst['price']) + float(best['price']) <= float(self.bank):
                    self.transfers.append({"in": best['name'], "out": worst['name']})
                    self.squad.remove(worst)
                    self.squad.append(best)

    def score_gw(self, gw):
        gw_points = 0
        squad_details = []
        
        # Sort by prob_gt_6 for captain/vice selection
        self.squad.sort(key=lambda x: x['prob_gt_6'], reverse=True)
        captain = self.squad[0]
        vice = self.squad[1] if len(self.squad) > 1 else self.squad[0]
        
        # Select starting 11 with valid formation
        # Sort players by position and prob_gt_6
        gkps = [p for p in self.squad if p['pos']=="GKP"]
        defs = [p for p in self.squad if p['pos']=="DEF"]
        mids = [p for p in self.squad if p['pos']=="MID"]
        fwds = [p for p in self.squad if p['pos']=="FWD"]
        
        gkps.sort(key=lambda x: x['prob_gt_6'], reverse=True)
        defs.sort(key=lambda x: x['prob_gt_6'], reverse=True)
        mids.sort(key=lambda x: x['prob_gt_6'], reverse=True)
        fwds.sort(key=lambda x: x['prob_gt_6'], reverse=True)
        
        # Starting 11: 1 GKP, 3-5 DEF, 2-5 MID, 1-3 FWD
        # Strategy: Pick best players while maintaining valid formation
        # Use 1 GKP, top 4 DEF, top 4 MID, top 2 FWD (4-4-2 formation)
        # type: ignore[operator]
        starting: List[Dict[str, Any]] = cast(List[Dict[str, Any]], gkps)[:1] + cast(List[Dict[str, Any]], defs)[:4] + cast(List[Dict[str, Any]], mids)[:4] + cast(List[Dict[str, Any]], fwds)[:2]
        bench = [p for p in self.squad if p not in starting]
        
        # Assign roles
        for p in self.squad:
            if p in starting:
                points = p['actual_points']
                if p == captain:
                    role = 'C'
                    points *= 2
                elif p == vice:
                    role = 'V'
                else:
                    role = 'S'
                gw_points += points
            else:
                role = 'B'
                points = p['actual_points']
                
            squad_details.append({
                "id": p.get('id', 0), "name": p['name'], "points": int(p['actual_points']),
                "xp": p['xp'], "role": role, "selling_price": p['price'] / 10.0,
                "prob_gt_6": p['prob_gt_6'], "prob_gt_10": p['prob_gt_10'], "form": 5.0
            })
            
        res = {
            "gw": gw, "points": int(gw_points), "net_points": int(gw_points),
            "transfers": self.transfers, "squad": squad_details,
            "season": self.target_season,
            "bank": (self.bank - sum(p['price'] for p in self.squad))/10.0, "free_transfers": 1
        }
        self.history.append(res)
        
    def save_history(self):
        out_path = "public/data/ai_manager_history.json"
        os.makedirs("public/data", exist_ok=True)
        with open(out_path, "w") as f:
            json.dump(self.history, f, indent=2)
        print(f"History saved to {out_path}")

def main():
    import sys
    if "--backtest" in sys.argv:
        bt = Backtester()
        bt.run()
    else:
        # Standard Training
        os.makedirs(MODELS_DIR, exist_ok=True)
        results = []
        
        for pos in POSITIONS:
            # train_position_model returns dict
            res = train_position_model(pos)
            if res:
                # remove heavy objects before report
                # Just keep metrics
                res_clean = {k:v for k,v in res.items() if k in ['pos', 'accuracy', 'mae', 'loss', 'train_accuracy', 'train_mae']}
                results.append(res_clean)
                
        # Generate Report
        report_path = "model_accuracy_report.md"
        with open(report_path, "w") as f:
            f.write("# Model Accuracy Report (Random Forest)\n\n")
            f.write("| Position | Train Acc | Val Acc | Train MAE | Val MAE | Log Loss |\n")
            f.write("| :--- | :--- | :--- | :--- | :--- | :--- |\n")
            for r in results:
                f.write(f"| **{r['pos']}** | {r['train_accuracy']:.4f} | {r['accuracy']:.4f} | {r['train_mae']:.4f} | {r['mae']:.4f} | {r['loss']:.4f} |\n")
            
            f.write("\n## Details\n")
            f.write("- **Model**: Random Forest Classifier (n_estimators=100, max_depth=8)\n")
            f.write("- **Input**: 21 Features (12 Context + 9 Aggregated, single 4-match window)\n")
            f.write("- **Scaling**: StandardScaler (per-position, fitted on training data only)\n")
            f.write("- **Training**: Full Retrain, 80/20 Split.\n")

if __name__ == "__main__":
    main()

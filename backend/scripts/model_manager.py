import json
import os
from typing import Dict, List, Any, Optional, cast

import numpy as np  # type: ignore[import]
import joblib  # type: ignore[import]
import tensorflow as tf  # type: ignore[import]
from lib.config import DATA_DIR, POSITIONS, INPUT_DIM, MODELS_DIR, EPOCHS, BATCH_SIZE, NUM_CTX_FEATURES, PREDICTIONS_FILE, REPORT_FILE  # type: ignore[import]
from lib.models import build_model, clean_and_scale, fit_scaler, load_scaler  # type: ignore[import]
from sklearn.model_selection import train_test_split  # type: ignore[import]
from sklearn.metrics import accuracy_score, mean_absolute_error, log_loss  # type: ignore[import]

# Context Features in output vector (based on preprocessing_dataset.ts + model_manager.py ctx list):
# 0: was_home, 1: difficulty, 2: price, 3: hours_rest, 4: ownership,
# 5: opponent_strength, 6: chance_of_playing,
# 7: fixture_attack, 8: fixture_defense (normalized [0,1])
#
# Feature Indices in history_sequence:
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

        # 2. Context Features (9 features):
        # [was_home, diff, price, rest, own, opp, chance_of_playing,
        #  fixture_attack, fixture_defense]
        ctx = [
            sample["ctx_was_home"],
            sample["ctx_difficulty"],
            sample["ctx_price"],
            sample["ctx_hours_rest"],
            sample["ctx_ownership"],
            sample["ctx_opponent"],
            sample.get("ctx_chance_of_playing", 100),
            sample.get("ctx_fixture_attack", 0),
            sample.get("ctx_fixture_defense", 0),
        ]
        
        # 3. Dual Rolling-Window Aggregated Features (9 × 2 = 18 features)
        history = sample["history_sequence"]  # List of lists
        # history[0] is most recent match (due to unshift in preprocessing_dataset.ts)
        
        hist_arr = np.array(history)  # Shape (20, 13) with LOOKBACK=20
        if len(hist_arr) == 0:
            aggs = np.zeros(len(AGG_INDICES) * len(AGG_WINDOWS))
        else:
            # Filter to only games where the player actually played (minutes > 0)
            played_mask = hist_arr[:, IDX_MIN] > 0
            played_arr = hist_arr[played_mask]

            def get_agg(n: int) -> np.ndarray:
                available = min(n, len(played_arr))
                if available == 0:
                    return np.zeros(len(AGG_INDICES))
                # history_sequence is oldest-first, so the most recent games are at the end
                sub = played_arr[-available:]
                subset_vals = sub[:, AGG_INDICES]
                means = np.mean(subset_vals, axis=0)
                stds = np.std(subset_vals, axis=0)
                # Calculate consistency-adjusted value: mean * (1 - std_dev / mean)
                # Avoid division by zero
                cv = np.divide(stds, means, out=np.zeros_like(stds), where=means != 0)
                adjusted = means * (1 - cv)
                return adjusted

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

def predict_future():
    """
    Load trained models & scalers, process future fixture samples (target == 0),
    and output ai_predictions.json for the frontend Players page.
    """
    from sklearn.preprocessing import StandardScaler  # type: ignore[import]
    
    print("=== Generating Future Predictions ===")
    
    all_predictions: Dict[int, Dict[str, Any]] = {}  # player_id -> prediction
    
    for pos in POSITIONS:
        model_path = os.path.join(MODELS_DIR, f"model_{pos}.joblib")
        if not os.path.exists(model_path):
            print(f"Warning: No model found for {pos}, skipping")
            continue
            
        clf = joblib.load(model_path)
        
        # Load dataset and split into train (for scaler fitting) and future samples
        X, y, meta = load_and_process_data(pos)
        if len(X) == 0:
            continue
            
        # Separate: training data vs future samples
        train_mask = []
        future_mask = []
        for i, m in enumerate(meta):
            if 'is_future' in m:
                is_future = bool(m['is_future'])
            else:
                is_future = (int(m.get('target', 0)) == 0 and m.get('season') == '25/26')
            if is_future:
                train_mask.append(False)
                future_mask.append(True)
            else:
                train_mask.append(True)
                future_mask.append(False)
        
        train_idx = np.where(train_mask)[0]
        future_idx = np.where(future_mask)[0]
        
        if len(future_idx) == 0:
            print(f"{pos}: No future samples found, skipping")
            continue
            
        print(f"{pos}: {len(train_idx)} train, {len(future_idx)} future samples")
        
        # Fit scaler on training data
        X_train = clean_and_scale(X[train_idx])
        scaler = StandardScaler()
        scaler.fit(X_train)
        
        # Process future samples
        X_future = clean_and_scale(X[future_idx])
        X_future_scaled = scaler.transform(X_future)
        
        raw_probs = clf.predict_proba(X_future_scaled)
        
        # Map to 16 classes
        preds_proba = np.zeros((len(X_future_scaled), 16), dtype=np.float32)
        for i, cls in enumerate(clf.classes_):
            if cls < 16:
                preds_proba[:, int(cls)] = raw_probs[:, i]
        
        classes = np.arange(16, dtype=np.float32)
        
        for i, fidx in enumerate(future_idx):
            m = meta[fidx]
            pid = m['id']
            gw = m['gw']
            dist = preds_proba[i]
            xp = float(np.sum(dist * classes))
            
            prob_gt_6 = float(np.sum(dist[7:])) if len(dist) > 7 else 0.0
            prob_gt_10 = float(np.sum(dist[11:])) if len(dist) > 11 else 0.0
            
            # Extract r10 features from original X
            # Feature vector is 27-dim: 9 ctx + 9 (r4) + 9 (r10)
            # r10 window starts at index: 9 + 9 = 18
            original_x = X[fidx]
            r10_min = float(original_x[18]) if len(original_x) == 27 else 0.0
            r10_pts = float(original_x[19]) if len(original_x) == 27 else 0.0
            r10_inf = float(original_x[22]) if len(original_x) >= 27 else 0.0
            r10_thr = float(original_x[24]) if len(original_x) >= 27 else 0.0
            r10_xg = float(original_x[20]) if len(original_x) >= 27 else 0.0

            # Extract Fixture Features (Indices 7-8 in ctx block)
            f_atk = float(original_x[7]) if len(original_x) >= 27 else 0.0
            f_def = float(original_x[8]) if len(original_x) >= 27 else 0.0
            
            if pid not in all_predictions:
                all_predictions[pid] = {
                    "id": pid,
                    "name": m.get('name', str(pid)),
                    "team": m.get('team', 0),
                    "total3Week": 0.0,
                    "projections": [],
                    "prob_gt_6": 0.0,
                    "prob_gt_10": 0.0,
                    "prob_gt_6_next": 0.0,
                    "prob_gt_10_next": 0.0,
                    "r10_min": r10_min,
                    "r10_pts": r10_pts,
                    "r10_inf": r10_inf,
                    "r10_thr": r10_thr,
                    "r10_xg": r10_xg,
                    "f_atk_next": f_atk,
                    "f_def_next": f_def,
                }
            
            # Always update R10 to use the latest (highest GW) sample's values
            entry_ref = all_predictions[pid]  # type: ignore
            entry_ref["r10_min"] = r10_min
            entry_ref["r10_pts"] = r10_pts
            entry_ref["r10_inf"] = r10_inf
            entry_ref["r10_thr"] = r10_thr
            entry_ref["r10_xg"] = r10_xg
            
            entry = all_predictions[pid]  # type: ignore
            entry["projections"].append({
                "gw": gw, 
                "xP": xp,
                "prob_gt_6": prob_gt_6,
                "prob_gt_10": prob_gt_10,
                "f_atk": f_atk,
                "f_def": f_def
            })
            
            # Store 'next' probabilities for the first projection
            if len(entry["projections"]) == 1:
                entry["prob_gt_6_next"] = prob_gt_6
                entry["prob_gt_10_next"] = prob_gt_10
                entry["f_atk_next"] = f_atk
                entry["f_def_next"] = f_def
    
    # Finalize: compute total3Week, trim to 3 projections
    results: List[Dict[str, Any]] = []
    for pid, entry in all_predictions.items():
        projs: List[Dict[str, Any]] = entry["projections"]
        projs.sort(key=lambda x: x["gw"])
        entry["projections"] = projs[:3]
        entry["total3Week"] = sum(p["xP"] for p in entry["projections"])
        
        if len(entry["projections"]) > 0:
            entry["prob_gt_6"] = sum(p["prob_gt_6"] for p in entry["projections"]) / len(entry["projections"])
            entry["prob_gt_10"] = sum(p["prob_gt_10"] for p in entry["projections"]) / len(entry["projections"])
        else:
            entry["prob_gt_6"] = 0.0
            entry["prob_gt_10"] = 0.0
            
        results.append(entry)
    
    results.sort(key=lambda x: x["total3Week"], reverse=True)
    
    out_path = PREDICTIONS_FILE
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    
    print(f"\nSaved {len(results)} player predictions to {out_path}")

def main():
    import sys
    if "--predict" in sys.argv:
        predict_future()
    else:
        # Standard Training
        os.makedirs(MODELS_DIR, exist_ok=True)
        results = []
        
        for pos in POSITIONS:
            res = train_position_model(pos)
            if res:
                res_clean = {k:v for k,v in res.items() if k in ['pos', 'accuracy', 'mae', 'loss', 'train_accuracy', 'train_mae']}
                results.append(res_clean)
                
        # Generate Report
        report_path = REPORT_FILE
        os.makedirs(os.path.dirname(report_path), exist_ok=True)
        with open(report_path, "w") as f:
            f.write("# Model Accuracy Report (Random Forest)\n\n")
            f.write("| Position | Train Acc | Val Acc | Train MAE | Val MAE | Log Loss |\n")
            f.write("| :--- | :--- | :--- | :--- | :--- | :--- |\n")
            for r in results:
                f.write(f"| **{r['pos']}** | {r['train_accuracy']:.4f} | {r['accuracy']:.4f} | {r['train_mae']:.4f} | {r['mae']:.4f} | {r['loss']:.4f} |\n")

if __name__ == "__main__":
    main()


if __name__ == "__main__":
    main()

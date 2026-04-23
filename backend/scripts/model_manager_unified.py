import json
import os
import sqlite3
from typing import Dict, List, Any, Tuple
import numpy as np  # type: ignore[import]
import joblib  # type: ignore[import]
from lib.config import DATA_DIR, POSITIONS, INPUT_DIM, MODELS_DIR, EPOCHS, BATCH_SIZE, NUM_CTX_FEATURES, PREDICTIONS_FILE, REPORT_FILE, DB_PATH  # type: ignore[import]
from lib.models import build_model, clean_and_scale, fit_scaler, load_scaler  # type: ignore[import]
from sklearn.model_selection import train_test_split  # type: ignore[import]
from sklearn.metrics import accuracy_score, mean_absolute_error, log_loss  # type: ignore[import]

# Feature Vector Structure (19 dimensions):
# 0-8: Context Features (9): [was_home, difficulty, price, hours_rest, ownership, opponent, chance_of_playing, fixture_attack, fixture_defense]
# 9-17: Rolling-6 Features (9): [min, pts, xG, xA, inf, cre, thr, gc, saves]
# 18: Position (1): [0=GKP, 1=DEF, 2=MID, 3=FWD]
# Total: 19 features

def position_to_encoding(position: str) -> int:
    """Map position string to numeric encoding."""
    pos_map = {'GKP': 0, 'DEF': 1, 'MID': 2, 'FWD': 3}
    return pos_map.get(position, 0)

def load_all_data() -> Tuple[np.ndarray, np.ndarray, List[Dict[str, Any]]]:
    """
    Load data from ALL positions from preprocessed_data table.
    Returns X, y, metadata (already includes position as last feature).
    """
    if not os.path.exists(DB_PATH):
        print(f"Warning: DB not found at {DB_PATH}")
        return np.array([]), np.array([]), []

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Load ALL data (all positions)
    query = "SELECT feature_vector, target_class, metadata, is_future, position FROM preprocessed_data"
    cursor.execute(query)
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        print("Warning: No preprocessed data found")
        return np.array([]), np.array([]), []

    X_list = []
    y_list = []
    meta_list = []

    for row in rows:
        feat_blob, target_class, meta_json, is_future, position = row
        
        # Convert blob back to float32 numpy array (18 features without position)
        feat_vec = np.frombuffer(feat_blob, dtype=np.float32)
        
        # Add position encoding as 19th feature
        pos_encoding = float(position_to_encoding(position))
        feat_vec = np.append(feat_vec, pos_encoding)
        
        # Metadata
        meta = json.loads(meta_json)
        meta['is_future'] = bool(is_future)
        meta['position'] = position
        
        X_list.append(feat_vec)
        y_list.append(target_class)
        meta_list.append(meta)

    return np.array(X_list), np.array(y_list), meta_list

def train_unified_model() -> Dict[str, Any]:
    """
    Train a single model on all positions combined.
    """
    print("\n=== Training Unified Model on All Positions ===")
    X, y, meta = load_all_data()
    
    if len(X) == 0:
        print("No data available for training")
        return {}
        
    print(f"Total samples loaded: {len(X)}")
    
    # Filter out future items (which are strictly for prediction)
    train_mask = []
    for m in meta:
        if 'is_future' in m:
            is_future = bool(m['is_future'])
        else:
            is_future = (int(m.get('target', 0)) == 0 and m.get('season') == '25/26')
        train_mask.append(not is_future)
        
    train_idx = np.where(train_mask)[0]
    if len(train_idx) == 0:
        print("No valid training data")
        return {}
        
    X_filt = X[train_idx]
    y_filt = y[train_idx]
    
    print(f"Training samples (after filtering future): {len(X_filt)}")

    # Clean NaN/Inf first (no scaling yet)
    X_filt = clean_and_scale(X_filt)
    
    # Split
    X_train, X_test, y_train, y_test = train_test_split(X_filt, y_filt, test_size=0.2, random_state=42)
    
    # Fit StandardScaler on training data only
    scaler = fit_scaler(X_train, "global")
    X_train = scaler.transform(X_train)
    X_test = scaler.transform(X_test)
    
    print(f"Train: {X_train.shape}, Test: {X_test.shape}")
    
    # Build model
    clf = build_model()
    
    # Train
    print("Training model...")
    clf.fit(X_train, y_train)
    
    # Training Metrics
    train_preds = clf.predict(X_train)
    train_acc = accuracy_score(y_train, train_preds)
    train_mae = mean_absolute_error(y_train, train_preds)
    
    # Test Metrics
    test_preds = clf.predict(X_test)
    test_probs = clf.predict_proba(X_test)
    
    # Handle probas shape for log_loss
    full_test_probs = np.zeros((len(X_test), 16))
    for i, cls in enumerate(clf.classes_):
        if cls < 16: full_test_probs[:, int(cls)] = test_probs[:, i]
        
    acc = accuracy_score(y_test, test_preds)
    mae = mean_absolute_error(y_test, test_preds)
    loss = log_loss(y_test, full_test_probs, labels=list(range(16)))
    
    print(f"Train Acc: {train_acc:.4f} | Test Acc: {acc:.4f} | Test MAE: {mae:.4f} | Test Loss: {loss:.4f}")
    
    # Save model
    model_path = os.path.join(MODELS_DIR, "model_unified.joblib")
    joblib.dump(clf, model_path)
    print(f"Model saved to {model_path}")
    
    return {
        "model": clf,
        "accuracy": acc,
        "mae": mae,
        "loss": loss,
        "train_accuracy": train_acc,
        "train_mae": train_mae,
        "X": X_filt,
        "y": y_filt,
    }

def get_future_gameweeks() -> List[int]:
    """
    Query fixtures table to determine upcoming gameweeks.
    Returns list of next 3 (or available) gameweeks in ascending order.
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Get unique future event numbers from fixtures JSON data, ordered
        cursor.execute("""
            SELECT DISTINCT CAST(json_extract(data, '$.event') AS INTEGER) as event 
            FROM fixtures 
            WHERE json_extract(data, '$.finished') = 0 
            ORDER BY event ASC 
            LIMIT 10
        """)
        rows = cursor.fetchall()
        future_gws = [int(row[0]) for row in rows if row[0] is not None]
        conn.close()
        return future_gws[:3] if future_gws else []
    except Exception as e:
        print(f"Warning: Could not fetch future gameweeks: {e}")
        conn.close()
        return []

def predict_future() -> None:
    """
    Load trained unified model & global scaler, process future fixture samples (target == 0),
    and output ai_predictions.json for the frontend Players page.
    
    Includes explicit blank week handling: if a player has no match in a future GW,
    a projection with 0% haul is added to ensure consistent 3-week coverage.
    """
    from sklearn.preprocessing import StandardScaler  # type: ignore[import]
    
    print("=== Generating Future Predictions with Unified Model ===")
    
    model_path = os.path.join(MODELS_DIR, "model_unified.joblib")
    if not os.path.exists(model_path):
        print(f"Error: No unified model found at {model_path}")
        return
        
    clf = joblib.load(model_path)
    
    # Load dataset
    X, y, meta = load_all_data()
    if len(X) == 0:
        print("No data available")
        return
        
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
        print("No future samples found")
        return
        
    print(f"Train: {len(train_idx)} samples, Future: {len(future_idx)} samples")
    
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
    
    all_predictions: Dict[int, Dict[str, Any]] = {}
    
    for i, fidx in enumerate(future_idx):
        m = meta[fidx]
        pid = m['id']
        gw = m.get('gw', m.get('event', 0))
        dist = preds_proba[i]
        xp = float(np.sum(dist * classes))
        
        prob_gt_6 = float(np.sum(dist[7:])) if len(dist) > 7 else 0.0
        prob_gt_10 = float(np.sum(dist[11:])) if len(dist) > 11 else 0.0
        
        # Extract r6 features from original X (indices 9-17 in 19-dim vector)
        original_x = X[fidx]
        r6_min = float(original_x[9]) if len(original_x) >= 10 else 0.0
        r6_pts = float(original_x[10]) if len(original_x) >= 11 else 0.0
        r6_inf = float(original_x[13]) if len(original_x) >= 14 else 0.0
        r6_thr = float(original_x[15]) if len(original_x) >= 16 else 0.0
        r6_xg = float(original_x[11]) if len(original_x) >= 12 else 0.0

        # Extract Fixture Features (Indices 7-8 in ctx block)
        f_atk = float(original_x[7]) if len(original_x) >= 8 else 0.0
        f_def = float(original_x[8]) if len(original_x) >= 9 else 0.0
        
        if pid not in all_predictions:
            all_predictions[pid] = {
                "id": pid,
                "name": m.get('name', str(pid)),
                "team": m.get('team', 0),
                "position": m.get('position', 'MID'),
                "total3Week": 0.0,
                "projections": [],
                "prob_gt_6": 0.0,
                "prob_gt_10": 0.0,
                "prob_gt_6_next": 0.0,
                "prob_gt_10_next": 0.0,
                "r6_min": r6_min,
                "r6_pts": r6_pts,
                "r6_inf": r6_inf,
                "r6_thr": r6_thr,
                "r6_xg": r6_xg,
                "f_atk_next": f_atk,
                "f_def_next": f_def,
            }
        
        # Always update R6 to use the latest (highest GW) sample's values
        entry_ref = all_predictions[pid]
        entry_ref["r6_min"] = r6_min
        entry_ref["r6_pts"] = r6_pts
        entry_ref["r6_inf"] = r6_inf
        entry_ref["r6_thr"] = r6_thr
        entry_ref["r6_xg"] = r6_xg
        
        entry = all_predictions[pid]
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
    
    # Get list of future gameweeks for blank week handling
    future_gws = get_future_gameweeks()
    print(f"Future gameweeks identified: {future_gws}")
    
    # Finalize: inject blank weeks, sort, and compute aggregates
    results: List[Dict[str, Any]] = []
    for pid, entry in all_predictions.items():
        projs: List[Dict[str, Any]] = entry["projections"]
        
        # If we have future gameweeks, inject blank weeks for missing GWs
        if future_gws:
            projected_gws = {p["gw"] for p in projs}
            
            # For each future GW not in projections, add a blank week entry (0% haul)
            for gw in future_gws:
                if gw not in projected_gws:
                    projs.append({
                        "gw": gw,
                        "xP": 0.0,
                        "prob_gt_6": 0.0,
                        "prob_gt_10": 0.0,
                        "f_atk": 0.0,
                        "f_def": 0.0
                    })
        
        # Sort by gameweek ascending
        projs.sort(key=lambda x: x["gw"])
        entry["projections"] = projs[:3]  # Keep only first 3 GWs
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
    
    print(f"Predictions written to {out_path}")
    print(f"Total predictions: {len(results)}")

def main():
    """Main entry point: train model and generate predictions."""
    print("=== FPL Geek Unified Model Manager ===")
    
    # Train unified model
    result = train_unified_model()
    if not result:
        print("Failed to train model")
        return
    
    # Generate predictions
    predict_future()
    
    print("\n=== Complete ===")

if __name__ == "__main__":
    main()

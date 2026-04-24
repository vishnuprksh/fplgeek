import numpy as np
import os
import json
import sqlite3
from typing import Tuple, List, Dict, Any
from sklearn.ensemble import RandomForestClassifier

from lib.config import DATA_DIR, POSITIONS, INPUT_DIM, DB_PATH  # type: ignore[import]

DATA_OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "../../data/feature_importance.json")

# The 19-dimensional feature vector names (must match unified model)
feature_names = [
    # 9 Context
    "ctx_was_home", "ctx_difficulty", "ctx_price", "ctx_hours_rest",
    "ctx_ownership", "ctx_opponent", "ctx_chance_of_playing",
    "ctx_fixture_attack", "ctx_fixture_defense",

    # 9 Rolling-6
    "r6_min", "r6_pts", "r6_xG", "r6_xA", "r6_inf",
    "r6_cre", "r6_thr", "r6_gc", "r6_saves",
    
    # 1 Position
    "position"
]

MIN_RELIABLE_SAMPLES = 300  # Warn below this

def position_to_encoding(position: str) -> int:
    """Map position string to numeric encoding."""
    pos_map = {'GKP': 0, 'DEF': 1, 'MID': 2, 'FWD': 3}
    return pos_map.get(position, 0)

def load_all_data() -> Tuple[np.ndarray, np.ndarray, List[Dict[str, Any]]]:
    """
    Load data from ALL positions from preprocessed_data table.
    Returns X, y, metadata (includes position as last feature).
    """
    if not os.path.exists(DB_PATH):
        print(f"Warning: DB not found at {DB_PATH}")
        return np.array([]), np.array([]), []

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Load ALL data
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

def analyze_unified_model():
    """Analyze unified model feature importance."""
    print("=== UNIFIED MODEL FEATURE IMPORTANCE ANALYSIS (>6 POINTS) ===")
    
    X, y, meta = load_all_data()
    if len(X) == 0:
        print("No data available")
        return
    
    # Filter out future items
    train_mask = []
    y_binary = []
    for i, m in enumerate(meta):
        if 'is_future' in m:
            is_future = bool(m['is_future'])
        else:
            is_future = (int(m.get('target', 0)) == 0 and m.get('season') == '25/26')
        train_mask.append(not is_future)
        # Binarize target to >6
        y_binary.append(1 if y[i] > 6 else 0)

    train_idx = np.where(train_mask)[0]
    X_filt = X[train_idx]
    y_filt = np.array(y_binary)[train_idx]

    n_total = len(y_filt)
    n_hauls = int(y_filt.sum())
    haul_rate = n_hauls / n_total * 100 if n_total > 0 else 0

    print(f"\n## UNIFIED MODEL — samples: {n_total} | hauls: {n_hauls} ({haul_rate:.1f}%)", end="")
    if n_total < MIN_RELIABLE_SAMPLES:
        print(f"  ⚠️  LOW SAMPLE COUNT — results may be unreliable", end="")
    print()

    # Train Random Forest with balanced class weights to handle haul imbalance
    clf = RandomForestClassifier(
        n_estimators=200,
        max_depth=8,
        min_samples_split=10,
        min_samples_leaf=5,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1
    )
    clf.fit(X_filt, y_filt)

    importances = clf.feature_importances_
    indices = np.argsort(importances)[::-1]

    # Compute per-feature mean for haul vs non-haul to validate significance
    X_haul = X_filt[y_filt == 1]
    X_non  = X_filt[y_filt == 0]

    pos_results = []
    print(f"{'Rank':<5} {'Feature':<30} {'Importance':>10}  {'Haul mean':>10}  {'Non-haul mean':>13}")
    print("-" * 75)
    for rank in range(min(19, len(importances))):  # Up to 19 features
        idx = indices[rank]
        
        feat_name = feature_names[idx] if idx < len(feature_names) else f"unknown_{idx}"
        importance = importances[idx]
        
        haul_mean = np.mean(X_haul[:, idx]) if len(X_haul) > 0 else 0.0
        non_mean = np.mean(X_non[:, idx]) if len(X_non) > 0 else 0.0
        
        pos_results.append({
            "rank": rank + 1,
            "feature": feat_name,
            "importance": float(importance),
            "haul_mean": float(haul_mean),
            "non_haul_mean": float(non_mean)
        })
        
        print(f"{rank+1:<5} {feat_name:<30} {importance:>10.4f}  {haul_mean:>10.4f}  {non_mean:>13.4f}")

    # Structure output
    output = {
        "UNIFIED": {
            "samples": n_total,
            "hauls": n_hauls,
            "haul_rate": float(haul_rate),
            "features": pos_results
        }
    }

    # Save to JSON
    os.makedirs(os.path.dirname(DATA_OUTPUT_PATH), exist_ok=True)
    with open(DATA_OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)
    
    print(f"\nFeature importance saved to {DATA_OUTPUT_PATH}")

if __name__ == "__main__":
    analyze_unified_model()

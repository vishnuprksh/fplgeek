import numpy as np
import os
import json
from sklearn.ensemble import RandomForestClassifier
from model_manager import load_and_process_data

POSITIONS = ["GKP", "DEF", "MID", "FWD"]
DATA_OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "../../data/feature_importance.json")

# The 27-dimensional feature vector names (must match model_manager.py feature engineering)
feature_names = [
    # 9 Context
    "ctx_was_home", "ctx_difficulty", "ctx_price", "ctx_hours_rest",
    "ctx_ownership", "ctx_opponent", "ctx_chance_of_playing",
    "ctx_fixture_attack", "ctx_fixture_defense",

    # 9 Rolling-4
    "r4_min", "r4_pts", "r4_xG", "r4_xA", "r4_inf",
    "r4_cre", "r4_thr", "r4_gc", "r4_saves",

    # 9 Rolling-10
    "r10_min", "r10_pts", "r10_xG", "r10_xA", "r10_inf",
    "r10_cre", "r10_thr", "r10_gc", "r10_saves"
]

MIN_RELIABLE_SAMPLES = 300  # Warn below this

print("=== HAUL FEATURE IMPORTANCE ANALYSIS (>6 POINTS) ===")
results = {}

for pos in POSITIONS:
    X, y, meta = load_and_process_data(pos)
    if len(X) == 0:
        continue

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

    print(f"\n## {pos} — samples: {n_total} | hauls: {n_hauls} ({haul_rate:.1f}%)", end="")
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
    for rank in range(10):
        idx = indices[rank]
        feat_name = feature_names[idx]
        imp_val = float(importances[idx])
        haul_m = float(X_haul[:, idx].mean()) if len(X_haul) else 0.0
        non_m  = float(X_non[:, idx].mean())  if len(X_non)  else 0.0
        
        if rank < 5:
            pos_results.append({
                "rank": rank + 1,
                "feature": feat_name,
                "importance": imp_val,
                "haul_mean": haul_m,
                "non_haul_mean": non_m
            })
            
        print(f"{rank+1:<5} {feat_name:<30} {imp_val:>10.4f}  {haul_m:>10.3f}  {non_m:>13.3f}")
    
    results[pos] = {
        "samples": n_total,
        "hauls": n_hauls,
        "haul_rate": haul_rate,
        "features": pos_results
    }

# Save results to JSON
os.makedirs(os.path.dirname(DATA_OUTPUT_PATH), exist_ok=True)
with open(DATA_OUTPUT_PATH, 'w') as f:
    json.dump(results, f, indent=4)
print(f"\n✅ Results saved to {DATA_OUTPUT_PATH}")


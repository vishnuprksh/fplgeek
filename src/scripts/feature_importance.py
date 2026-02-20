import numpy as np
import json
import os
from sklearn.ensemble import RandomForestClassifier

DATA_DIR = "public/data/processed"
POSITIONS = ["GKP", "DEF", "MID", "FWD"]

# The 25-dimensional feature vector names
feature_names = [
    # 7 Context
    "ctx_was_home", "ctx_difficulty", "ctx_price", "ctx_hours_rest", 
    "ctx_ownership", "ctx_opponent", "ctx_chance_of_playing",
    
    # 9 Rolling-4
    "r4_min", "r4_pts", "r4_xG", "r4_xA", "r4_inf", 
    "r4_cre", "r4_thr", "r4_gc", "r4_saves",
    
    # 9 Rolling-10
    "r10_min", "r10_pts", "r10_xG", "r10_xA", "r10_inf", 
    "r10_cre", "r10_thr", "r10_gc", "r10_saves"
]

AGG_INDICES = [0, 11, 1, 2, 5, 4, 3, 6, 7] # min, pts, xG, xA, inf, cre, thr, gc, saves
AGG_WINDOWS = [4, 10]

print("=== HAUL FEATURE IMPORTANCE ANALYSIS (>6 POINTS) ===")
for pos in POSITIONS:
    file_path = os.path.join(DATA_DIR, f"dataset_{pos}.json")
    if not os.path.exists(file_path):
        continue

    with open(file_path, "r") as f:
        data = json.load(f)

    X_list = []
    y_list = []

    for sample in data:
        # Target: 1 if points > 6, else 0
        target = 1 if int(sample["target"]) > 6 else 0
        y_list.append(target)

        ctx = [
            sample["ctx_was_home"], sample["ctx_difficulty"], sample["ctx_price"],
            sample["ctx_hours_rest"], sample["ctx_ownership"], sample["ctx_opponent"],
            sample.get("ctx_chance_of_playing", 100)
        ]
        
        history = sample["history_sequence"]
        hist_arr = np.array(history)
        if len(hist_arr) == 0:
            aggs = np.zeros(len(AGG_INDICES) * len(AGG_WINDOWS))
        else:
            def get_agg(n: int) -> np.ndarray:
                available = min(n, len(hist_arr))
                if available == 0:
                    return np.zeros(len(AGG_INDICES))
                sub = hist_arr[:available]
                subset_vals = sub[:, AGG_INDICES]
                return np.sum(subset_vals, axis=0) / n

            agg_parts = [get_agg(w) for w in AGG_WINDOWS]
            aggs = np.concatenate(agg_parts)

        X_list.append(np.concatenate([ctx, aggs]))

    X = np.array(X_list)
    y = np.array(y_list)

    # Train a quick binary Random Forest focused entirely on >6 points
    clf = RandomForestClassifier(n_estimators=100, max_depth=8, random_state=42, n_jobs=-1)
    clf.fit(X, y)
    
    importances = clf.feature_importances_
    indices = np.argsort(importances)[::-1]
    
    print(f"\n## Top 5 Haul Drivers for {pos}")
    for f in range(5):
        idx = indices[f]
        print(f"{f+1}. `{feature_names[idx]}` ({importances[idx]:.4f})")

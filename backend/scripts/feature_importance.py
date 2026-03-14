import numpy as np
import json
import os
from sklearn.ensemble import RandomForestClassifier

import os
DATA_DIR = os.environ.get('FPL_DATA_DIR', os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../data')))
DATA_DIR = os.path.join(DATA_DIR, 'processed')
POSITIONS = ["GKP", "DEF", "MID", "FWD"]

# The 29-dimensional feature vector names (must match model_manager.py feature engineering)
feature_names = [
    # 11 Context
    "ctx_was_home", "ctx_difficulty", "ctx_price", "ctx_hours_rest",
    "ctx_ownership", "ctx_opponent", "ctx_chance_of_playing",
    "ctx_fixture_attack", "ctx_fixture_defense", "ctx_fixture_attack_scaled", "ctx_fixture_defense_scaled",

    # 9 Rolling-4
    "r4_min", "r4_pts", "r4_xG", "r4_xA", "r4_inf",
    "r4_cre", "r4_thr", "r4_gc", "r4_saves",

    # 9 Rolling-10
    "r10_min", "r10_pts", "r10_xG", "r10_xA", "r10_inf",
    "r10_cre", "r10_thr", "r10_gc", "r10_saves"
]

# History sequence indices (from preprocessing_dataset.ts):
# 0: Min, 1: xG, 2: xA, 3: Thr, 4: Cre, 5: Inf, 6: GC, 7: Saves, 8: Sel, 9: Price, 10: Home, 11: Pts, 12: Form
AGG_INDICES = [0, 11, 1, 2, 5, 4, 3, 6, 7]  # min, pts, xG, xA, inf, cre, thr, gc, saves
AGG_WINDOWS = [4, 10]

MIN_RELIABLE_SAMPLES = 300  # Warn below this

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
        # Skip future prediction samples (target=0 artificially)
        is_future = sample.get("is_future", False) or (
            int(sample.get("target", 0)) == 0 and str(sample.get("season", "")) == "25/26"
        )
        if is_future:
            continue

        # Target: 1 if points > 6, else 0
        target = 1 if int(sample["target"]) > 6 else 0
        y_list.append(target)

        ctx = [
            sample["ctx_was_home"], sample["ctx_difficulty"], sample["ctx_price"],
            sample["ctx_hours_rest"], sample["ctx_ownership"], sample["ctx_opponent"],
            sample.get("ctx_chance_of_playing", 100),
            sample.get("ctx_fixture_attack", 0),
            sample.get("ctx_fixture_defense", 0),
            sample.get("ctx_fixture_attack_scaled", 0),
            sample.get("ctx_fixture_defense_scaled", 0)
        ]

        history = sample["history_sequence"]
        hist_arr = np.array(history)
        if len(hist_arr) == 0:
            aggs = np.zeros(len(AGG_INDICES) * len(AGG_WINDOWS))
        else:
            played_mask = hist_arr[:, 0] > 0  # 0 is IDX_MIN
            played_arr = hist_arr[played_mask]

            def get_agg(n: int) -> np.ndarray:
                available = min(n, len(played_arr))
                if available == 0:
                    return np.zeros(len(AGG_INDICES))
                sub = played_arr[-available:]
                subset_vals = sub[:, AGG_INDICES]
                return np.sum(subset_vals, axis=0) / available

            agg_parts = [get_agg(w) for w in AGG_WINDOWS]
            aggs = np.concatenate(agg_parts)

        X_list.append(np.concatenate([ctx, aggs]))

    X = np.array(X_list)
    y = np.array(y_list)

    n_total = len(y)
    n_hauls = int(y.sum())
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
    clf.fit(X, y)

    importances = clf.feature_importances_
    indices = np.argsort(importances)[::-1]

    # Compute per-feature mean for haul vs non-haul to validate significance
    X_haul = X[y == 1]
    X_non  = X[y == 0]

    print(f"{'Rank':<5} {'Feature':<30} {'Importance':>10}  {'Haul mean':>10}  {'Non-haul mean':>13}")
    print("-" * 75)
    for rank in range(10):
        idx = indices[rank]
        haul_m = X_haul[:, idx].mean() if len(X_haul) else 0
        non_m  = X_non[:, idx].mean()  if len(X_non)  else 0
        print(f"{rank+1:<5} {feature_names[idx]:<30} {importances[idx]:>10.4f}  {haul_m:>10.3f}  {non_m:>13.3f}")


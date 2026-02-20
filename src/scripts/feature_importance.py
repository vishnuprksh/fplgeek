import joblib
import numpy as np

MODELS_DIR = "public/models/ai_manager_mlp"
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

print("=== FEATURE IMPORTANCE ANALYSIS ===")
for pos in POSITIONS:
    model_path = f"{MODELS_DIR}/model_{pos}.joblib"
    try:
        clf = joblib.load(model_path)
        importances = clf.feature_importances_
        indices = np.argsort(importances)[::-1]
        
        print(f"\n## Top 5 Features for {pos}")
        for f in range(5):
            idx = indices[f]
            print(f"{f+1}. `{feature_names[idx]}` ({importances[idx]:.4f})")
    except Exception as e:
        print(f"Error loading {pos}: {e}")

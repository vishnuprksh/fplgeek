import json
import numpy as np
import os
import joblib
from sklearn.model_selection import train_test_split

DATA_DIR = "/home/vishnuprakash/local_projects/fplgeek/public/data/processed"
MODELS_DIR = "/home/vishnuprakash/local_projects/fplgeek/public/models/ai_manager_mlp"
POSITIONS = ["GKP", "DEF", "MID", "FWD"]

def main():
    print("Analyzing prob_gt_6 vs Actual Points...\n")
    
    all_probs = []
    all_actuals = []
    
    for pos in POSITIONS:
        data_path = os.path.join(DATA_DIR, f"dataset_{pos}.json")
        model_path = os.path.join(MODELS_DIR, f"model_{pos}.joblib")
        scaler_path = os.path.join(MODELS_DIR, f"scaler_{pos}.joblib")
        
        if not (os.path.exists(data_path) and os.path.exists(model_path) and os.path.exists(scaler_path)):
            continue
            
        with open(data_path, 'r') as f:
            data = json.load(f)
            
        if len(data) == 0: continue
        
        clf = joblib.load(model_path)
        scaler = joblib.load(scaler_path)
        
        X_list = []
        y_list = []
        
        for sample in data:
            target = max(0, min(int(sample["target"]), 15))
            y_list.append(target)
            
            ctx = [
                sample["ctx_was_home"],
                sample["ctx_difficulty"],
                sample["ctx_price"],
                sample["ctx_hours_rest"],
                sample["ctx_all_time_avg_points"],
                sample["ctx_all_time_goals_per_90"],
                sample["ctx_all_time_xg_per_90"],
                sample["ctx_all_time_games_played"],
                sample["ctx_ownership"],
                sample["ctx_opponent"],
                sample.get("ctx_chance_of_playing", 100)
            ]
            hist = sample["history_sequence"]
            hist_arr = np.array(hist)
            aggs = np.zeros(9)
            if len(hist_arr) > 0:
                available = min(4, len(hist_arr))
                sub = hist_arr[:available]
                subset_vals = sub[:, [0, 11, 1, 2, 5, 4, 3, 6, 7]] # min, pts, xg, xa, inf, cre, thr, gc, saves
                total = np.sum(subset_vals, axis=0)
                aggs = total
            
            full_vec = np.concatenate([ctx, aggs])
            X_list.append(full_vec)
            
        X = np.array(X_list)
        y = np.array(y_list)
        X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
        
        # We only want to evaluate on Test set to avoid overfitting bias
        # Using the exact same seed (42) as training ensures identical split
        X_train_tmp, X_test, y_train_tmp, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        X_test_scaled = scaler.transform(X_test)
        probs = clf.predict_proba(X_test_scaled)
        
        # Calculate prob_gt_6
        # Need to handle classes correctly. Classes might not include all 0-15
        classes = clf.classes_
        print(f"Position: {pos} | Total: {len(X)} | Test: {len(X_test)} | Classes: {classes}")
        for i in range(len(X_test_scaled)):
            p_dist = np.zeros(16)
            for j, cls in enumerate(classes):
                if cls < 16: p_dist[int(cls)] = probs[i, j]
                
            prob_gt_6 = np.sum(p_dist[7:])
            all_probs.append(prob_gt_6)
            all_actuals.append(y_test[i])
            
    all_probs = np.array(all_probs)
    all_actuals = np.array(all_actuals)
    
    # Bucket into deciles (0-10%, 10-20%, 20-30%, etc)
    # Actually, hauls are rare, so prob_gt_6 will be mostly low. 
    # Let's use custom bins: 0-5%, 5-10%, 10-20%, 20-30%, 30-40%, 40%+
    bins = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 1.0]
    
    print("prob_gt_6 | N | Avg Actual Pts | True Haul Rate (Actual > 6)")
    print("-" * 65)
    
    for i in range(len(bins)-1):
        low = bins[i]
        high = bins[i+1]
        
        mask = (all_probs >= low) & (all_probs < high)
        subset_actuals = all_actuals[mask]
        
        if len(subset_actuals) == 0:
            continue
            
        avg_pts = np.mean(subset_actuals)
        true_haul_rate = np.mean(subset_actuals > 6)
        
        lbl = f"{int(low*100):2d}% - {int(high*100):2d}%"
        if high == 1.0: lbl = f"{int(low*100):2d}%+      "
        
        print(f"{lbl} | {len(subset_actuals):5d} | {avg_pts:10.2f} pts | {true_haul_rate*100:10.1f}%")

if __name__ == "__main__":
    main()

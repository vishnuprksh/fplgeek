import json
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import load_model, Model
import os
import sys

# Add root to path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

# Configuration
DATA_DIR = "public/data/processed"
MODELS_DIR = "public/models"
POSITIONS = ["GKP", "DEF", "MID", "FWD"]
OUTPUT_FILE = "feature_importance.md"

# Feature Names (Mapping from generate_dataset.ts)
SEQ_FEATURE_NAMES = [
    "Minutes", "xG", "xA", "Threat", "Creativity", "Influence", 
    "Goals Conceded", "Saves", "Log(Selected)", 
    "Price", "Was Home", "Points"
]
CTX_FEATURE_NAMES = ["Home Adv", "Difficulty", "Price", "Rest"]
OPP_FEATURE_NAMES = ["Opponent Strength"]

def load_data(pos):
    filepath = os.path.join(DATA_DIR, f"dataset_{pos}.json")
    try:
        with open(filepath, "r") as f:
            data = json.load(f)
        return data
    except FileNotFoundError:
        print(f"❌ Data for {pos} not found.")
        return []

def clean_and_scale(X_seq, X_ctx, X_opp):
    # 1. Replace NaN/Inf
    X_seq = np.nan_to_num(X_seq, nan=0.0, posinf=0.0, neginf=0.0)
    X_ctx = np.nan_to_num(X_ctx, nan=0.0, posinf=0.0, neginf=0.0)
    X_opp = np.nan_to_num(X_opp, nan=1100.0, posinf=1350.0, neginf=1000.0)
    
    # 2. Scale (Same as train_models.py)
    scales_seq = np.array([90, 2.0, 1.0, 100, 100, 100, 5, 5, 15, 15, 1, 20], dtype=np.float32)
    X_seq = X_seq / scales_seq.reshape(1, 1, -1)
    
    scales_ctx = np.array([1, 5, 15, 200], dtype=np.float32)
    X_ctx = X_ctx / scales_ctx.reshape(1, -1)
    
    X_opp = X_opp / 1350.0
    
    return X_seq, X_ctx, X_opp

def get_test_data(data):
    # Test Split Idea: GW >= 11 of Season 25/26
    test_data = []
    for d in data:
        season = d.get('season', '25/26')
        gw = d['gw']
        if season == '25/26' and gw > 10:
            test_data.append(d)
    
    if not test_data:
        print("⚠️ No test data found (Season 25/26 GW > 10). Using random 20% sample.")
        np.random.shuffle(data)
        test_data = data[:int(len(data)*0.2)]
        
    X_seq = np.array([d['history_sequence'] for d in test_data], dtype=np.float32)
    X_ctx = np.array([[d['ctx_was_home'], d['ctx_difficulty'], d['ctx_price'], d['ctx_hours_rest']] for d in test_data], dtype=np.float32)
    X_opp = np.array([d['ctx_opponent'] for d in test_data], dtype=np.float32)
    y = np.array([d['target'] for d in test_data], dtype=np.float32)
    
    return X_seq, X_ctx, X_opp, y

def compute_permutation_importance(model, X_seq, X_ctx, X_opp, y):
    # Baseline
    y_pred = model.predict([X_seq, X_ctx, X_opp], verbose=0).flatten()
    baseline_mae = np.mean(np.abs(y - y_pred))
    
    importances = {}
    
    # 1. Sequence Features
    # Input shape: (N, Time, Features) -> We shuffle one feature across all timesteps and samples
    for i, name in enumerate(SEQ_FEATURE_NAMES):
        X_seq_shuffled = X_seq.copy()
        # Shuffle feature i along axis 0 (samples)
        np.random.shuffle(X_seq_shuffled[:, :, i]) 
        
        y_pred_shuff = model.predict([X_seq_shuffled, X_ctx, X_opp], verbose=0).flatten()
        mae_shuff = np.mean(np.abs(y - y_pred_shuff))
        importances[name] = mae_shuff - baseline_mae

    # 2. Context Features
    for i, name in enumerate(CTX_FEATURE_NAMES):
        X_ctx_shuffled = X_ctx.copy()
        np.random.shuffle(X_ctx_shuffled[:, i])
        
        y_pred_shuff = model.predict([X_seq, X_ctx_shuffled, X_opp], verbose=0).flatten()
        mae_shuff = np.mean(np.abs(y - y_pred_shuff))
        importances[name] = mae_shuff - baseline_mae

    # 3. Opponent
    X_opp_shuffled = X_opp.copy()
    np.random.shuffle(X_opp_shuffled[:])
    y_pred_shuff = model.predict([X_seq, X_ctx, X_opp_shuffled], verbose=0).flatten()
    mae_shuff = np.mean(np.abs(y - y_pred_shuff))
    importances["Opponent Strength"] = mae_shuff - baseline_mae
    
    return baseline_mae, importances

def main():
    report = "# AI Model Feature Influence Analysis\n\n"
    report += "Analysis using **Permutation Importance** on Test Data (GW 11+).\n"
    report += "Metric: **Increase in MAE** when feature is corrupted (Higher is more important).\n\n"
    
    for pos in POSITIONS:
        print(f"\n--- Analyzing {pos} ---")
        
        # Load Model
        model_path = os.path.join(MODELS_DIR, f"model_{pos}.keras")
        if not os.path.exists(model_path):
            print(f"Skipping {pos}: Model not found at {model_path}")
            continue
            
        try:
            model = load_model(model_path)
        except Exception as e:
            print(f"Failed to load model {pos}: {e}")
            continue

        # Load Data
        data = load_data(pos)
        if not data: continue
        
        X_seq, X_ctx, X_opp, y = get_test_data(data)
        X_seq, X_ctx, X_opp = clean_and_scale(X_seq, X_ctx, X_opp)
        
        if len(y) < 10:
            print("Not enough test data.")
            continue
            
        baseline_mae, importances = compute_permutation_importance(model, X_seq, X_ctx, X_opp, y)
        
        print(f"Baseline MAE: {baseline_mae:.4f}")
        
        # Sort
        sorted_feats = sorted(importances.items(), key=lambda x: x[1], reverse=True)
        
        report += f"## {pos} (Baseline MAE: {baseline_mae:.4f})\n\n"
        report += "| Feature | Impact (+MAE) | Normalized |\n"
        report += "| :--- | :--- | :--- |\n"
        
        max_imp = max(abs(v) for v in importances.values()) if importances else 1.0
        
        for name, imp in sorted_feats:
            norm = imp / max_imp
            bar = "█" * int(norm * 10)
            report += f"| **{name}** | +{imp:.4f} | `{bar}` |\n"
            print(f"{name}: +{imp:.4f}")
        report += "\n"

    with open(OUTPUT_FILE, "w") as f:
        f.write(report)
    print(f"\n✅ Analysis saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()

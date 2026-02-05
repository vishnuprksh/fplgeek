import json
import numpy as np
import tensorflow as tf
import os
import sys

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from src.scripts.lib.config import *
from src.scripts.lib.models import clean_and_scale

POSITIONS = ["GKP", "DEF", "MID", "FWD"]

SEQ_FEATURES = [
    "minutes", "expected_goals", "expected_assists", "threat", "creativity", "influence",
    "goals_conceded", "saves", "log_selected", "price", "was_home", "total_points"
]

CTX_FEATURES = [
    "ctx_was_home", "ctx_difficulty", "ctx_price", "ctx_hours_rest",
    "all_time_avg_pts", "all_time_total_pts", "all_time_goals_per_90", 
    "all_time_xg_per_90", "all_time_games_played"
]

OPP_FEATURES = ["opponent_strength"]

def load_data(pos):
    filepath = os.path.join(DATA_DIR, f"dataset_{pos}.json")
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return None
    with open(filepath, 'r') as f:
        return json.load(f)

def prepare_data(data):
    X_seq = np.array([d['history_sequence'] for d in data], dtype=np.float32)
    X_ctx = np.array([[d['ctx_was_home'], d['ctx_difficulty'], d['ctx_price'], d['ctx_hours_rest'],
                       d['ctx_all_time_avg_points'], d['ctx_all_time_total_points'],
                       d['ctx_all_time_goals_per_90'], d['ctx_all_time_xg_per_90'], d['ctx_all_time_games_played']]
                      for d in data], dtype=np.float32)
    X_opp = np.array([d['ctx_opponent'] for d in data], dtype=np.float32)
    y = np.array([d['target'] for d in data], dtype=np.float32)

    # Clean and Scale
    X_seq_scaled, X_ctx_scaled = clean_and_scale(X_seq, X_ctx)
    X_opp_scaled = X_opp / 1350.0 # Same scaling as in ai_manager.py
    
    # Categorical Y
    y_clipped = np.clip(y, 0, 15).astype(int)
    y_cat = tf.keras.utils.to_categorical(y_clipped, num_classes=16)

    return [X_seq_scaled, X_ctx_scaled, X_opp_scaled], y_cat

def get_accuracy(model, inputs, y_true):
    loss, acc = model.evaluate(inputs, y_true, verbose=0, batch_size=2048)
    return acc

def analyze_position(pos):
    print(f"\nAnalyzing {pos}...")
    data = load_data(pos)
    if not data: return

    # Use only validation-like data (e.g. 24/25 season) for analysis if possible, 
    # but using full dataset provides more stable importance stats for this purpose
    # Filter out 25/26 to avoid training data if model trained on all, but usually we split.
    # For robust analysis, let's use all data that isn't '25/26' (training data)
    # Wait, ai_manager trained on NOT 25/26. So 25/26 is unseen. Let's use 25/26 for validation importance!
    train_samples = [d for d in data if d.get('season') != '25/26']
    val_samples = [d for d in data if d.get('season') == '25/26'] 
    
    if len(val_samples) < 100:
        print("Not enough validation samples, falling back to training data subset.")
        analysis_samples = train_samples[-2000:] # Last 2000 samples
    else:
        analysis_samples = val_samples

    inputs, y_true = prepare_data(analysis_samples)
    
    model_path = os.path.join(MODELS_DIR, f"model_{pos}.keras")
    if not os.path.exists(model_path):
        print(f"Model not found: {model_path}")
        return

    model = tf.keras.models.load_model(model_path)
    
    baseline_acc = get_accuracy(model, inputs, y_true)
    print(f"Baseline Accuracy: {baseline_acc:.4f}")
    
    importances = {}
    
    # helper for permutation
    def permute_and_eval(input_idx, col_idx, feat_name):
        X_perm = [x.copy() for x in inputs]
        
        # Shuffle
        if input_idx == 0: # Sequence (shuffle feature across all samples)
             # Shape (N, SEQ_LEN, Feats). We want to shuffle column `col_idx` 
             # preserving SEQ_LEN structure? No, simply shuffling the vector of values across samples.
             # Actually, we should shuffle the (N) values for that feature.
             # Since it is a sequence, we shuffle the slice X[:, :, col_idx]
             shuffled_col = X_perm[0][:, :, col_idx].copy()
             np.random.shuffle(shuffled_col)
             X_perm[0][:, :, col_idx] = shuffled_col
             
        elif input_idx == 1: # Context
            np.random.shuffle(X_perm[1][:, col_idx])
            
        elif input_idx == 2: # Opponent
            np.random.shuffle(X_perm[2]) # Shape (N,)
            
        acc = get_accuracy(model, X_perm, y_true)
        drop = baseline_acc - acc
        importances[feat_name] = drop
        print(f"   {feat_name}: {baseline_acc:.4f} -> {acc:.4f} (Drop: {drop:.4f})")

    # 1. Sequence Features
    for i, name in enumerate(SEQ_FEATURES):
        permute_and_eval(0, i, f"SEQ_{name}")
        
    # 2. Context Features
    for i, name in enumerate(CTX_FEATURES):
        permute_and_eval(1, i, f"CTX_{name}")
        
    # 3. Opponent
    permute_and_eval(2, 0, "OPP_strength")
    
    return importances

def main():
    final_report = "# Feature Importance Analysis\n\n"
    final_report += "Method: Permutation Importance (Accuracy Drop on Validation Data)\n\n"
    
    for pos in POSITIONS:
        imps = analyze_position(pos)
        if imps:
            sorted_imps = sorted(imps.items(), key=lambda x: x[1], reverse=True)
            
            final_report += f"## {pos} Feature Importance\n"
            final_report += "| Rank | Feature | Importance (Acc Drop) |\n"
            final_report += "|---|---|---|\n"
            for i, (name, val) in enumerate(sorted_imps):
                final_report += f"| {i+1} | {name} | {val:.4f} |\n"
            final_report += "\n"
            
    with open('feature_importance_report.md', 'w') as f:
        f.write(final_report)
    print("\nReport saved to feature_importance_report.md")

if __name__ == "__main__":
    main()

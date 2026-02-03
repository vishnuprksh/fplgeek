import json
import numpy as np
import os
import matplotlib.pyplot as plt
import sys

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from research.lib.config import *
from research.lib.utils import load_json
from research.lib.models import build_model, clean_and_scale

OUTPUT_IMAGE = "predicted_points_distribution.png"

def run_analysis():
    print("🚀 Starting Prediction Distribution Analysis...")
    
    # 1. Load Data
    all_data = {}
    for pos in POSITIONS:
        try:
            all_data[pos] = load_json(os.path.join(DATA_DIR, f"dataset_{pos}.json"))
        except FileNotFoundError:
            print(f"❌ Data for {pos} not found.")
            return

    all_preds = []

    # 2. Train and Predict per Position
    for pos in POSITIONS:
        print(f"Processing {pos}...")
        raw_data = all_data[pos]
        
        # Use ALL data for this analysis to see general distribution
        samples = raw_data
        
        if not samples: continue

        X_seq = np.array([d['history_sequence'] for d in samples], dtype=np.float32)
        X_ctx = np.array([[d['ctx_was_home'], d['ctx_difficulty'], d['ctx_price'], d['ctx_hours_rest'],
                           d['ctx_all_time_avg_points'], d['ctx_all_time_total_points'],
                           d['ctx_all_time_goals_per_90'], d['ctx_all_time_xg_per_90'], d['ctx_all_time_games_played']]
                          for d in samples], dtype=np.float32)
        X_opp = np.array([d['ctx_opponent'] for d in samples], dtype=np.float32)
        y = np.array([d['target'] for d in samples], dtype=np.float32)
        
        X_seq, X_ctx = clean_and_scale(X_seq, X_ctx)
        X_opp = X_opp / 1350.0
        
        # --- Train Two-Stage Model ---
        
        # 1. Binary Classification (Will player score >= 6?)
        y_clf = (y >= 6.0).astype(np.float32)
        clf_model = build_model(output_activation='sigmoid', loss='binary_crossentropy', metrics=['accuracy'])
        clf_model.fit([X_seq, X_ctx, X_opp], y_clf, epochs=5, batch_size=32, verbose=0)
        
        # 2. Low Regressor (Points < 6)
        mask_low = y < 6.0
        if np.sum(mask_low) > 0:
            reg_low_model = build_model(output_activation='linear', loss='mse', metrics=['mae'])
            reg_low_model.fit(
                [X_seq[mask_low], X_ctx[mask_low], X_opp[mask_low]], 
                y[mask_low], 
                epochs=5, batch_size=32, verbose=0
            )
        else:
            reg_low_model = None
            
        # 3. High Regressor (Points >= 6)
        mask_high = y >= 6.0
        if np.sum(mask_high) > 10:
            reg_high_model = build_model(output_activation='linear', loss='mse', metrics=['mae'])
            reg_high_model.fit(
                [X_seq[mask_high], X_ctx[mask_high], X_opp[mask_high]], 
                y[mask_high], 
                epochs=5, batch_size=32, verbose=0
            )
        else:
            reg_high_model = None
            
        # --- Generate Predictions ---
        
        clf_probs = clf_model.predict([X_seq, X_ctx, X_opp], verbose=0).flatten()
        
        if reg_low_model:
            pred_low = reg_low_model.predict([X_seq, X_ctx, X_opp], verbose=0).flatten()
        else:
            pred_low = np.full_like(clf_probs, 2.0)
            
        if reg_high_model:
            pred_high = reg_high_model.predict([X_seq, X_ctx, X_opp], verbose=0).flatten()
        else:
            pred_high = np.full_like(clf_probs, 6.0)
            
        # Mixture prediction
        preds = (clf_probs * pred_high) + ((1.0 - clf_probs) * pred_low)
        
        # Apply Logic Multipliers (Replicating ai_manager.py logic)
        for i, idx in enumerate(range(len(preds))): # simple iter
            xp = float(preds[i])
            s = samples[i]
            
            all_time_avg = s.get('ctx_all_time_avg_points', 0)
            games_played = s.get('ctx_all_time_games_played', 0)
            
            if all_time_avg > 5.0 and games_played > 50:
                xp *= 1.5 
            elif all_time_avg > 4.5 and games_played > 38:
                xp *= 1.3 
            elif all_time_avg > 4.0 and games_played > 38:
                xp *= 1.15
            
            all_preds.append(xp)

    # 3. Plot Distribution
    print(f"Total Predictions: {len(all_preds)}")
    
    # Round to nearest integer for histogram binning like actual points
    rounded_preds = [round(p) for p in all_preds]
    
    # Filter/Clip for visualization (0 to 20)
    rounded_preds = [min(max(p, 0), 20) for p in rounded_preds]
    
    points = np.array(rounded_preds)
    unique, counts = np.unique(points, return_counts=True)
    
    plt.figure(figsize=(12, 6))
    bars = plt.bar(unique, counts, color='lightgreen', edgecolor='black')
    
    for bar in bars:
        height = bar.get_height()
        plt.text(bar.get_x() + bar.get_width()/2., height,
                 f'{int(height)}',
                 ha='center', va='bottom', fontsize=9, rotation=0)

    plt.xlabel('Predicted Points (Rounded)')
    plt.ylabel('Frequency')
    plt.title('Predicted Points Distribution (Two-Stage Model)')
    plt.xticks(range(21))
    plt.grid(axis='y', linestyle='--', alpha=0.7)
    
    plt.tight_layout()
    plt.savefig(OUTPUT_IMAGE)
    print(f"Graph saved to {OUTPUT_IMAGE}")

if __name__ == "__main__":
    run_analysis()

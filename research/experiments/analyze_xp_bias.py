import json
import numpy as np
import os

DATA_DIR = "public/data/processed"
POSITIONS = ["GKP", "DEF", "MID", "FWD"]

def load_data():
    all_targets = []
    print("Loading data...")
    for pos in POSITIONS:
        file_path = os.path.join(DATA_DIR, f"dataset_{pos}.json")
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                targets = [d['target'] for d in data]
                all_targets.extend(targets)
        except FileNotFoundError:
            pass
    return np.array(all_targets)

def calculate_weighted_bias(y):
    # Weights formula from ai_manager.py
    # y < 6: Weight = 0.1 + (y/6.0)*0.9
    # y >= 6: Weight = 1.0 (Flat)
    
    weights = np.where(y < 6.0, 0.1 + (y/6.0)*0.9, 1.0)
    
    actual_mean = np.mean(y)
    weighted_mean = np.average(y, weights=weights)
    
    print(f"Total Samples: {len(y)}")
    print(f"Actual Mean Points: {actual_mean:.2f}")
    print(f"Weighted Mean (Learned Target): {weighted_mean:.2f}")
    print(f"Inflation Factor: {weighted_mean / actual_mean:.2f}x")
    
    # Analyze specific cases
    print("\n--- Scenarios ---")
    scenarios = [
        ("Blank (2 pts)", 2),
        ("Return (6 pts)", 6),
        ("Haul (15 pts)", 15)
    ]
    
    for label, val in scenarios:
        w = 0.1 + (val/6.0)*0.9 if val < 6.0 else 1.0 + (val - 6.0) * 0.5
        print(f"{label}: Weight = {w:.2f}")

if __name__ == "__main__":
    y = load_data()
    if len(y) > 0:
        calculate_weighted_bias(y)
    else:
        print("No data found.")

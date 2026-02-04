import sys
import os
import json
import numpy as np
from unittest.mock import MagicMock

# Add src to path
sys.path.append(os.getcwd())

from src.scripts.sim_utils import predict_gw
from src.scripts.lib.config import POSITIONS

# Load Data
DATA_DIR = "public/data/processed"
all_data = {}
for pos in POSITIONS:
    try:
        with open(os.path.join(DATA_DIR, f"dataset_{pos}.json")) as f:
            all_data[pos] = json.load(f)
    except FileNotFoundError:
        print(f"File not found for {pos}")

# Mock Model
class MockModel:
    def predict(self, inputs, verbose=0):
        # inputs is list [X_seq, X_ctx, X_opp]
        n_samples = len(inputs[0])
        # Return random probabilities (N, 16)
        return np.random.rand(n_samples, 16)

models = {pos: MockModel() for pos in POSITIONS}

# Test Logic
def test_predict_function(gw, target_gw):
    print(f"\n--- Testing predict_gw: Frozen {gw} -> Target {target_gw} ---")
    
    preds = predict_gw(target_gw, frozen_gw=gw, all_data=all_data, models=models)
    
    print(f"Predictions Count: {len(preds)}")
    if len(preds) > 0:
        first_id = list(preds.keys())[0]
        print(f"Sample Pred ID {first_id}: {preds[first_id]}")
        
    return len(preds)

# Run Tests
c1 = test_predict_function(24, 25)
c2 = test_predict_function(24, 26)

if c1 > 0 and c2 > 0:
    print("\nSUCCESS: Predictions generated for future gameweeks.")
else:
    print("\nFAILURE: No predictions generated.")

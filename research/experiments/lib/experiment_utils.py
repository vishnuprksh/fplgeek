import json
import numpy as np
import os
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from research.lib.config import DATA_DIR

def load_data(pos):
    """Load dataset for a position"""
    filepath = os.path.join(DATA_DIR, f"dataset_{pos}.json")
    with open(filepath, "r") as f:
        return json.load(f)

def split_data(data):
    """
    Split data into train/val/test with NO LEAKAGE
    
    Returns:
        train_data: Season 24/25 (all GWs)
        val_data: Season 25/26 (GW 1-10)
        test_data: Season 25/26 (GW 11+)
    """
    train_data = []
    val_data = []
    test_data = []
    
    for d in data:
        season = d.get('season', '25/26')
        gw = d['gw']
        
        if season == '24/25':
            train_data.append(d)
        elif season == '25/26':
            if gw <= 10:
                val_data.append(d)
            else:
                test_data.append(d)
        else:
            # Unknown season - put in train
            train_data.append(d)
    
    return train_data, val_data, test_data

def prepare_arrays(batch):
    """Convert batch to numpy arrays"""
    if not batch:
        return None, None, None, None
    
    X_seq = np.array([d['history_sequence'] for d in batch], dtype=np.float32)
    X_ctx = np.array([
        [d['ctx_was_home'], d['ctx_difficulty'], d['ctx_price'], d['ctx_hours_rest']] 
        for d in batch
    ], dtype=np.float32)
    X_opp = np.array([d['ctx_opponent'] for d in batch], dtype=np.float32)
    y = np.array([d['target'] for d in batch], dtype=np.float32)
    
    return X_seq, X_ctx, X_opp, y

def clean_and_scale(X_seq, X_ctx, X_opp):
    """Clean and normalize inputs"""
    # Replace NaN/Inf
    X_seq = np.nan_to_num(X_seq, nan=0.0, posinf=0.0, neginf=0.0)
    X_ctx = np.nan_to_num(X_ctx, nan=0.0, posinf=0.0, neginf=0.0)
    X_opp = np.nan_to_num(X_opp, nan=1100.0, posinf=1350.0, neginf=1000.0)
    
    # Scale sequence features
    # [Minutes, xG, xA, Threat, Creativity, Influence, GC, Saves, log(Selected), Price, WasHome, Points]
    scales_seq = np.array([90, 2.0, 1.0, 100, 100, 100, 5, 5, 15, 15, 1, 20], dtype=np.float32)
    X_seq = X_seq / scales_seq.reshape(1, 1, -1)
    
    # Scale context: [Home, Difficulty, Price, Rest]
    scales_ctx = np.array([1, 5, 15, 200], dtype=np.float32)
    X_ctx = X_ctx / scales_ctx.reshape(1, -1)
    
    # Scale opponent strength
    X_opp = X_opp / 1350.0
    
    return X_seq, X_ctx, X_opp

def calculate_metrics(y_true, y_pred):
    """Calculate comprehensive metrics"""
    mae = mean_absolute_error(y_true, y_pred)
    mse = mean_squared_error(y_true, y_pred)
    rmse = np.sqrt(mse)
    r2 = r2_score(y_true, y_pred)
    
    # Additional metrics
    mape = np.mean(np.abs((y_true - y_pred) / (y_true + 1e-8))) * 100  # +1e-8 to avoid div by 0
    
    # Convert to native Python types for JSON serialization
    return {
        'mae': float(mae),
        'mse': float(mse),
        'rmse': float(rmse),
        'r2': float(r2),
        'mape': float(mape)
    }

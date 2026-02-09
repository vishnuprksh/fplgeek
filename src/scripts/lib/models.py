import numpy as np
from sklearn.ensemble import RandomForestClassifier
from .config import INPUT_DIM

def clean_and_scale(X):
    """
    Clean NaN/Inf and scale features.
    X shape: (N, INPUT_DIM)
    """
    if len(X) == 0:
        return X

    # 1. Replace NaN/Inf
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)
    
    # 2. Scale (Simple Global Scaling)
    # We ideally should scaler per feature column, but for simplicity/robustness:
    # Context features (Indices 0-11):
    # [was_home(1), diff(5), price(150), rest(200), avg_pts(10), total_pts(400), 
    #  g_p90(1), xg_p90(1), games(50), form(10), own(100), opp(1)]
    
    # Aggregated features (Indices 12-29):
    # 9 features x 2 windows. 
    # [min(90), pts(15), xg(1), xa(1), inf(50), cre(50), thr(50), gc(5), saves(10)]
    
    # Let's create a scaling vector
    scales = np.ones(INPUT_DIM, dtype=np.float32)
    
    # Context
    scales[0:12] = [1, 5, 150, 200, 10, 400, 1.0, 1.0, 50, 10, 100, 1350] # Opponent strength usually ~1000-1350
    
    # Aggregated (Repeated 2 times)
    agg_scales = [90, 15, 1.0, 1.0, 50, 50, 50, 5, 10]
    scales[12:21] = agg_scales # Last 5
    scales[21:30] = agg_scales # Last 3
    
    X = X / scales.reshape(1, -1)
    
    return X

def build_model():
    """
    Build Random Forest Classifier
    """
    clf = RandomForestClassifier(
        n_estimators=100,
        max_depth=8,
        min_samples_split=20,
        min_samples_leaf=10,
        random_state=42,
        n_jobs=-1
    )
    return clf

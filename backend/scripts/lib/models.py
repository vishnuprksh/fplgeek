"""
Model utility functions for the FPL Geek unified prediction model.
Uses a single Random Forest classifier trained on all positions.
"""
import os
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler

from lib.config import MODELS_DIR  # type: ignore[import]


def build_model() -> RandomForestClassifier:
    """Build and return an untrained Random Forest Classifier."""
    return RandomForestClassifier(
        n_estimators=200,
        max_depth=12,
        min_samples_leaf=5,
        class_weight='balanced',
        random_state=42,
        n_jobs=-1,
    )


def clean_and_scale(X: np.ndarray) -> np.ndarray:
    """Replace NaN/Inf with 0 to clean the feature matrix (no scaling)."""
    return np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)


def fit_scaler(X: np.ndarray, name: str) -> StandardScaler:
    """Fit a StandardScaler on X, save to disk, and return it."""
    scaler = StandardScaler()
    scaler.fit(X)
    os.makedirs(MODELS_DIR, exist_ok=True)
    scaler_path = os.path.join(MODELS_DIR, f"scaler_{name}.joblib")
    joblib.dump(scaler, scaler_path)
    print(f"Scaler saved to {scaler_path}")
    return scaler


def load_scaler(name: str) -> StandardScaler:
    """Load a previously fitted scaler from disk."""
    scaler_path = os.path.join(MODELS_DIR, f"scaler_{name}.joblib")
    if not os.path.exists(scaler_path):
        raise FileNotFoundError(f"Scaler not found at {scaler_path}")
    return joblib.load(scaler_path)

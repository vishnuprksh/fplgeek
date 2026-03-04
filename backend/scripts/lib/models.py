import numpy as np  # type: ignore[import]
import joblib  # type: ignore[import]
import os
from sklearn.ensemble import RandomForestClassifier  # type: ignore[import]
from sklearn.preprocessing import StandardScaler  # type: ignore[import]
from lib.config import INPUT_DIM, MODELS_DIR  # type: ignore[import]


def get_scaler_path(pos: str) -> str:
    """Return the path for a position-specific scaler."""
    return os.path.join(MODELS_DIR, f"scaler_{pos}.joblib")


def fit_scaler(X_train, pos: str):
    """
    Fit a StandardScaler on training data and save it.
    Returns the fitted scaler.
    """
    scaler = StandardScaler()
    scaler.fit(X_train)
    joblib.dump(scaler, get_scaler_path(pos))
    return scaler


def load_scaler(pos: str):
    """Load a previously fitted scaler for a position."""
    path = get_scaler_path(pos)
    if os.path.exists(path):
        return joblib.load(path)
    return None


def clean_and_scale(X, scaler=None):
    """
    Clean NaN/Inf. If a scaler is provided, transform with it.
    Otherwise return cleaned-only data (caller must handle scaling).
    X shape: (N, INPUT_DIM)
    """
    if len(X) == 0:
        return X

    # 1. Replace NaN/Inf
    X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)

    # 2. Scale with StandardScaler if provided
    if scaler is not None:
        X = scaler.transform(X)

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

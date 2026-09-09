import json
import os
import sqlite3
import numpy as np
import joblib
from datetime import datetime, timezone
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, mean_absolute_error, log_loss
from sklearn.preprocessing import StandardScaler

DATA_DIR = os.environ.get('FPL_DATA_DIR', os.path.normpath(os.path.join(os.path.dirname(__file__), '../../data')))
DB_PATH = os.path.join(DATA_DIR, 'fpl.sqlite')
MODELS_DIR = os.path.join(DATA_DIR, 'models/model_manager_mlp')

FEATURE_NAMES = [
    "ctx_was_home", "ctx_difficulty", "ctx_price", "ctx_hours_rest",
    "ctx_ownership", "ctx_opponent", "ctx_chance_of_playing",
    "ctx_fixture_attack", "ctx_fixture_defense",
    "r6_min", "r6_pts", "r6_xG", "r6_xA", "r6_inf",
    "r6_cre", "r6_thr", "r6_gc", "r6_saves"
]

POSITIONS = ['GKP', 'DEF', 'MID', 'FWD']
MIN_TRAIN_SAMPLES = 200  # skip training a per-position model below this

RF_PARAMS = {
    'n_estimators': 200, 'max_depth': 12, 'min_samples_leaf': 5,
    'class_weight': 'balanced', 'random_state': 42, 'n_jobs': -1
}


def load_data():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT feature_vector, target_class, metadata, is_future, position FROM preprocessed_data")
    rows = cur.fetchall()
    conn.close()

    X, y, meta = [], [], []
    for feat_blob, target, meta_json, is_future, position in rows:
        vec = np.frombuffer(feat_blob, dtype=np.float32)
        m = json.loads(meta_json)
        m['is_future'] = bool(is_future)
        m['position'] = position
        X.append(vec)
        y.append(target)
        meta.append(m)

    return np.array(X), np.array(y), meta


def clean(X):
    return np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)


def split_future(X, y, meta):
    future_mask = np.array([bool(m['is_future']) for m in meta])
    train_idx = np.where(~future_mask)[0]
    future_idx = np.where(future_mask)[0]
    return train_idx, future_idx


def get_future_gws():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT CAST(json_extract(data, '$.event') AS INTEGER) as event,
                   COUNT(*) as total,
                   SUM(CASE WHEN json_extract(data, '$.started') = 0 AND json_extract(data, '$.finished') = 0 THEN 1 ELSE 0 END) as unstarted
            FROM fixtures WHERE CAST(json_extract(data, '$.event') AS INTEGER) > 0
            GROUP BY event HAVING unstarted = total ORDER BY event ASC LIMIT 10
        """)
        gws = [int(row[0]) for row in cur.fetchall() if row[0] is not None]
        return gws[:3]
    finally:
        conn.close()


def train_one(X_pos, y_pos):
    """Train scaler + RandomForest for one position. Returns (clf, scaler, report) or None."""
    if len(X_pos) < MIN_TRAIN_SAMPLES:
        print(f"  Skipped: only {len(X_pos)} samples (< {MIN_TRAIN_SAMPLES})")
        return None

    X_tr, X_te, y_tr, y_te = train_test_split(X_pos, y_pos, test_size=0.2, random_state=42)
    scaler = StandardScaler()
    X_tr = scaler.fit_transform(X_tr)
    X_te = scaler.transform(X_te)

    clf = RandomForestClassifier(**RF_PARAMS)
    clf.fit(X_tr, y_tr)

    test_preds = clf.predict(X_te)
    test_probs = clf.predict_proba(X_te)
    full_probs = np.zeros((len(X_te), 16))
    for i, cls in enumerate(clf.classes_):
        if cls < 16:
            full_probs[:, int(cls)] = test_probs[:, i]

    acc = accuracy_score(y_te, test_preds)
    mae = mean_absolute_error(y_te, test_preds)
    loss = log_loss(y_te, full_probs, labels=list(range(16)))
    print(f"  Test Acc: {acc:.4f} | MAE: {mae:.4f} | Loss: {loss:.4f}")

    report = {
        "model": {
            "type": "RandomForestClassifier",
            "params": {**RF_PARAMS},
            "n_features": int(X_pos.shape[1]),
            "n_classes": int(clf.n_classes_)
        },
        "training": {
            "samples": int(len(X_pos)),
            "train_samples": int(len(X_tr)),
            "test_samples": int(len(X_te)),
            "test_size": 0.2,
            "random_state": 42
        },
        "metrics": {"test_accuracy": float(acc), "test_mae": float(mae), "test_log_loss": float(loss)}
    }
    return clf, scaler, report


def train(X, y, meta):
    print("=== Training Per-Position Models ===")
    train_idx, _ = split_future(X, y, meta)

    os.makedirs(MODELS_DIR, exist_ok=True)
    models = {}   # pos -> (clf, scaler)
    report = {}   # pos -> report dict

    for pos in POSITIONS:
        pos_idx = [i for i in train_idx if meta[i].get('position') == pos]
        X_pos = clean(X[pos_idx])
        y_pos = y[pos_idx]
        print(f"[{pos}] training on {len(pos_idx)} samples")
        result = train_one(X_pos, y_pos)
        if result is None:
            continue
        clf, scaler, pos_report = result
        joblib.dump(clf, os.path.join(MODELS_DIR, f"model_{pos.lower()}.joblib"))
        joblib.dump(scaler, os.path.join(MODELS_DIR, f"scaler_{pos.lower()}.joblib"))
        models[pos] = (clf, scaler)
        report[pos] = pos_report

    if not models:
        print("No per-position models trained")
        return models, X, meta

    print(f"Models saved to {MODELS_DIR}: {list(models.keys())}")

    # Persist model report (per-position metrics) for the Model Info page
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS app_data (
            key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
        )
    """)
    conn.execute(
        "INSERT OR REPLACE INTO app_data (key, value, updated_at) VALUES (?, ?, ?)",
        ('model_report', json.dumps(report), datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S'))
    )
    conn.commit()
    conn.close()
    print("Model report saved → SQLite")

    return models, X, meta


def predict(models, X, meta):
    print("=== Generating Predictions ===")
    train_idx, future_idx = split_future(X, None, meta)
    if len(future_idx) == 0:
        print("No future samples"); return

    classes = np.arange(16, dtype=np.float32)
    all_predictions = {}

    for pos in POSITIONS:
        if pos not in models:
            continue
        clf, scaler = models[pos]
        pos_future_idx = [i for i in future_idx if meta[i].get('position') == pos]
        if not pos_future_idx:
            continue

        X_future = scaler.transform(clean(X[pos_future_idx]))
        raw_probs = clf.predict_proba(X_future)
        preds_proba = np.zeros((len(X_future), 16), dtype=np.float32)
        for i, cls in enumerate(clf.classes_):
            if cls < 16:
                preds_proba[:, int(cls)] = raw_probs[:, i]

        for i, fidx in enumerate(pos_future_idx):
            m = meta[fidx]
            pid = m['id']
            gw = m.get('gw', 0)
            dist = preds_proba[i]
            xp = float(np.sum(dist * classes))
            prob_gt_6 = float(np.sum(dist[7:])) if len(dist) > 7 else 0.0
            prob_gt_10 = float(np.sum(dist[11:])) if len(dist) > 11 else 0.0

            orig = X[fidx]
            r6 = {
                'r6_min': float(orig[9]), 'r6_pts': float(orig[10]),
                'r6_xg': float(orig[11]), 'r6_xA': float(orig[12]),
                'r6_inf': float(orig[13]), 'r6_cre': float(orig[14]),
                'r6_thr': float(orig[15]), 'r6_gc': float(orig[16]),
                'r6_saves': float(orig[17])
            }
            f_atk = float(orig[7])
            f_def = float(orig[8])

            if pid not in all_predictions:
                all_predictions[pid] = {
                    "id": pid, "name": m.get('name', str(pid)),
                    "team": m.get('team', 0), "position": m.get('position', 'MID'),
                    "total3Week": 0.0, "projections": [],
                    "prob_gt_6": 0.0, "prob_gt_10": 0.0,
                    "prob_gt_6_next": 0.0, "prob_gt_10_next": 0.0,
                    "f_atk_next": f_atk, "f_def_next": f_def,
                    **r6
                }
            else:
                all_predictions[pid].update(r6)

            all_predictions[pid]["projections"].append({
                "gw": gw, "xP": xp,
                "prob_gt_6": prob_gt_6, "prob_gt_10": prob_gt_10,
                "f_atk": f_atk, "f_def": f_def
            })

    future_gws = get_future_gws()
    print(f"Future GWs: {future_gws}")

    results = []
    for pid, entry in all_predictions.items():
        gw_agg = {}
        for p in entry["projections"]:
            gw = p["gw"]
            if gw not in gw_agg:
                gw_agg[gw] = {"gw": gw, "xP": 0.0, "prob_gt_6": 0.0, "prob_gt_10": 0.0,
                               "f_atk": p["f_atk"], "f_def": p["f_def"], "fixtures_in_gw": 0}
            cur = gw_agg[gw]
            cur["prob_gt_6"] = 1 - (1 - cur["prob_gt_6"]) * (1 - p["prob_gt_6"])
            cur["prob_gt_10"] = 1 - (1 - cur["prob_gt_10"]) * (1 - p["prob_gt_10"])
            cur["xP"] += p["xP"]
            cur["fixtures_in_gw"] += 1
            if cur["fixtures_in_gw"] > 1:
                n = cur["fixtures_in_gw"]
                cur["f_atk"] = (cur["f_atk"] * (n - 1) + p["f_atk"]) / n
                cur["f_def"] = (cur["f_def"] * (n - 1) + p["f_def"]) / n

        projs = list(gw_agg.values())
        if future_gws:
            projected = {p["gw"] for p in projs}
            for gw in future_gws:
                if gw not in projected:
                    projs.append({"gw": gw, "xP": 0.0, "prob_gt_6": 0.0, "prob_gt_10": 0.0,
                                  "f_atk": 0.0, "f_def": 0.0, "fixtures_in_gw": 0})

        projs.sort(key=lambda x: x["gw"])
        entry["projections"] = projs[:3]

        if entry["projections"]:
            first = entry["projections"][0]
            entry["prob_gt_6_next"] = first["prob_gt_6"]
            entry["prob_gt_10_next"] = first["prob_gt_10"]
            entry["f_atk_next"] = first["f_atk"]
            entry["f_def_next"] = first["f_def"]

        entry["total3Week"] = sum(p["xP"] for p in entry["projections"])
        n = len(entry["projections"])
        entry["prob_gt_6"] = sum(p["prob_gt_6"] for p in entry["projections"]) / n if n else 0.0
        entry["prob_gt_10"] = sum(p["prob_gt_10"] for p in entry["projections"]) / n if n else 0.0
        results.append(entry)

    results.sort(key=lambda x: x["total3Week"], reverse=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS app_data (
            key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
        )
    """)
    conn.execute(
        "INSERT OR REPLACE INTO app_data (key, value, updated_at) VALUES (?, ?, ?)",
        ('ai_predictions', json.dumps(results), datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S'))
    )
    conn.commit()
    conn.close()
    print(f"Predictions saved: {len(results)} players → SQLite")


def analyze_feature_importance(X, y, meta):
    print("=== Analyzing Feature Importance (per position) ===")
    train_idx, _ = split_future(X, y, meta)

    output = {}
    for pos in POSITIONS:
        pos_idx = [i for i in train_idx if meta[i].get('position') == pos]
        if len(pos_idx) < MIN_TRAIN_SAMPLES:
            print(f"[{pos}] skipped: only {len(pos_idx)} samples")
            continue

        X_filt = clean(X[pos_idx])
        y_bin = np.array([1 if y[i] > 6 else 0 for i in pos_idx])

        n = len(y_bin)
        hauls = int(y_bin.sum())
        if hauls == 0:
            print(f"[{pos}] skipped: no hauls")
            continue
        print(f"[{pos}] Samples: {n}, hauls: {hauls} ({hauls/n*100:.1f}%)")

        clf = RandomForestClassifier(
            n_estimators=200, max_depth=8, min_samples_split=10, min_samples_leaf=5,
            class_weight="balanced", random_state=42, n_jobs=-1
        )
        clf.fit(X_filt, y_bin)

        importances = clf.feature_importances_
        indices = np.argsort(importances)[::-1]
        X_haul = X_filt[y_bin == 1]
        X_non = X_filt[y_bin == 0]

        features = []
        for rank, idx in enumerate(indices[:len(FEATURE_NAMES)]):
            name = FEATURE_NAMES[idx] if idx < len(FEATURE_NAMES) else f"feat_{idx}"
            features.append({
                "rank": rank + 1, "feature": name,
                "importance": float(importances[idx]),
                "haul_mean": float(np.mean(X_haul[:, idx])) if len(X_haul) else 0.0,
                "non_haul_mean": float(np.mean(X_non[:, idx])) if len(X_non) else 0.0
            })

        output[pos] = {"samples": n, "hauls": hauls, "haul_rate": float(hauls / n * 100), "features": features}

    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS app_data (
            key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
        )
    """)
    conn.execute(
        "INSERT OR REPLACE INTO app_data (key, value, updated_at) VALUES (?, ?, ?)",
        ('feature_importance', json.dumps(output), datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S'))
    )
    conn.commit()
    conn.close()
    print(f"Feature importance saved → SQLite ({list(output.keys())})")


def main():
    print("=== FPL Geek: Train & Predict (per-position models) ===")
    X, y, meta = load_data()
    if len(X) == 0:
        print("No data available"); return

    models, X, meta = train(X, y, meta)
    if not models:
        return

    predict(models, X, meta)
    analyze_feature_importance(X, y, meta)
    print("=== Complete ===")


if __name__ == "__main__":
    main()

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
    "goals_conceded", "saves", "log_selected", "price", "was_home", "total_points", "form"  # NEW: Added form
]

CTX_FEATURES = [
    "ctx_was_home", "ctx_difficulty", "ctx_price", "ctx_hours_rest",
    "all_time_avg_pts", "all_time_total_pts", "all_time_goals_per_90", 
    "all_time_xg_per_90", "all_time_games_played", "form", "ownership"  # NEW: Added form and ownership
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
    print("=" * 80)
    print("COMPREHENSIVE FEATURE IMPORTANCE ANALYSIS")
    print("=" * 80)
    print("\nMethod: Permutation Importance (Accuracy Drop on Validation Data)")
    print("Metric: Classification Accuracy (16-class categorical model)")
    print("\n" + "=" * 80 + "\n")
    
    final_report = "# Comprehensive Feature Importance Analysis\n\n"
    final_report += "## Methodology\n\n"
    final_report += "- **Method**: Permutation Importance\n"
    final_report += "- **Metric**: Classification Accuracy Drop\n"
    final_report += "- **Model**: 16-class Categorical (0-15+ points)\n"
    final_report += "- **Validation Data**: 25/26 Season (unseen during training)\n\n"
    final_report += "### How to Interpret\n\n"
    final_report += "- **Positive values**: Feature is important (accuracy drops when shuffled)\n"
    final_report += "- **Negative values**: Feature may be adding noise or redundancy\n"
    final_report += "- **Zero values**: Feature has minimal impact\n\n"
    final_report += "---\n\n"
    
    all_position_data = {}
    
    for pos in POSITIONS:
        imps = analyze_position(pos)
        if imps:
            all_position_data[pos] = imps
            sorted_imps = sorted(imps.items(), key=lambda x: x[1], reverse=True)
            
            final_report += f"## {pos} (Goalkeeper/Defender/Midfielder/Forward)\n\n"
            
            # Summary statistics
            baseline_acc = sorted_imps[0][1] + 0.6335 if pos == "GKP" else (
                sorted_imps[0][1] + 0.6677 if pos == "DEF" else (
                sorted_imps[0][1] + 0.6335 if pos == "MID" else sorted_imps[0][1] + 0.6638
            ))
            
            final_report += f"**Baseline Accuracy**: See individual position output\n\n"
            
            # Top 5 Most Important
            final_report += "### Top 5 Most Important Features\n\n"
            final_report += "| Rank | Feature | Importance | Description |\n"
            final_report += "|------|---------|------------|-------------|\n"
            for i, (name, val) in enumerate(sorted_imps[:5]):
                desc = get_feature_description(name)
                final_report += f"| {i+1} | `{name}` | {val:.4f} | {desc} |\n"
            final_report += "\n"
            
            # Complete Feature Rankings
            final_report += "### Complete Feature Rankings\n\n"
            final_report += "| Rank | Feature | Importance (Acc Drop) | Category |\n"
            final_report += "|------|---------|----------------------|----------|\n"
            for i, (name, val) in enumerate(sorted_imps):
                category = get_feature_category(name)
                final_report += f"| {i+1} | `{name}` | {val:.4f} | {category} |\n"
            final_report += "\n"
            
            # Category Summary
            final_report += "### Feature Category Summary\n\n"
            seq_features = [(n, v) for n, v in sorted_imps if n.startswith("SEQ_")]
            ctx_features = [(n, v) for n, v in sorted_imps if n.startswith("CTX_")]
            opp_features = [(n, v) for n, v in sorted_imps if n.startswith("OPP_")]
            
            avg_seq = sum(v for _, v in seq_features) / len(seq_features) if seq_features else 0
            avg_ctx = sum(v for _, v in ctx_features) / len(ctx_features) if ctx_features else 0
            avg_opp = sum(v for _, v in opp_features) / len(opp_features) if opp_features else 0
            
            final_report += f"- **Sequence Features (12)**: Avg Importance = {avg_seq:.4f}\n"
            final_report += f"- **Context Features (9)**: Avg Importance = {avg_ctx:.4f}\n"
            final_report += f"- **Opponent Features (1)**: Avg Importance = {avg_opp:.4f}\n\n"
            
            final_report += "---\n\n"
    
    # Cross-Position Insights
    final_report += "## Cross-Position Insights\n\n"
    final_report += "### Minutes Played Dominance\n\n"
    for pos in POSITIONS:
        if pos in all_position_data and "SEQ_minutes" in all_position_data[pos]:
            final_report += f"- **{pos}**: {all_position_data[pos]['SEQ_minutes']:.4f}\n"
    final_report += "\n"
    
    final_report += "### All-Time Stats Impact\n\n"
    final_report += "Average importance of all-time statistical features across positions:\n\n"
    all_time_features = ["CTX_all_time_avg_pts", "CTX_all_time_total_pts", 
                         "CTX_all_time_goals_per_90", "CTX_all_time_xg_per_90", 
                         "CTX_all_time_games_played"]
    
    for feat in all_time_features:
        avg_imp = sum(all_position_data[pos].get(feat, 0) for pos in POSITIONS) / len(POSITIONS)
        final_report += f"- `{feat}`: {avg_imp:.4f}\n"
    
    final_report += "\n---\n\n"
    final_report += "## Input Feature Reference\n\n"
    final_report += "### Sequence Features (Historical 5-match window)\n\n"
    for feat in SEQ_FEATURES:
        final_report += f"- `SEQ_{feat}`: {get_feature_description(f'SEQ_{feat}')}\n"
    
    final_report += "\n### Context Features (Current match context)\n\n"
    for feat in CTX_FEATURES:
        final_report += f"- `CTX_{feat}`: {get_feature_description(f'CTX_{feat}')}\n"
    
    final_report += "\n### Opponent Features\n\n"
    final_report += f"- `OPP_strength`: {get_feature_description('OPP_strength')}\n"
    
    with open('feature_importance_report.md', 'w') as f:
        f.write(final_report)
    
    print("\n" + "=" * 80)
    print("✅ ANALYSIS COMPLETE")
    print("=" * 80)
    print(f"\n📄 Report saved to: feature_importance_report.md")
    print("\n")

def get_feature_description(name):
    descriptions = {
        "SEQ_minutes": "Minutes played in recent matches",
        "SEQ_expected_goals": "Expected goals (xG) from recent matches",
        "SEQ_expected_assists": "Expected assists (xA) from recent matches",
        "SEQ_threat": "Threat index (attacking threat metric)",
        "SEQ_creativity": "Creativity index (chance creation metric)",
        "SEQ_influence": "Influence index (overall game impact)",
        "SEQ_goals_conceded": "Goals conceded in recent matches",
        "SEQ_saves": "Saves made (GKP-specific)",
        "SEQ_log_selected": "Log of team selections (popularity)",
        "SEQ_price": "Player price in recent matches",
        "SEQ_was_home": "Home/away status in recent matches",
        "SEQ_total_points": "Total points scored in recent matches",
        "CTX_ctx_was_home": "Current match home/away status",
        "CTX_ctx_difficulty": "Current opponent difficulty (1-5)",
        "CTX_ctx_price": "Current player price",
        "CTX_ctx_hours_rest": "Hours since last match",
        "CTX_all_time_avg_pts": "Career average points per game",
        "CTX_all_time_total_pts": "Career total points",
        "CTX_all_time_goals_per_90": "Career goals per 90 minutes",
        "CTX_all_time_xg_per_90": "Career xG per 90 minutes",
        "CTX_all_time_games_played": "Total career games played",
        "OPP_strength": "Opponent team strength rating"
    }
    return descriptions.get(name, "Unknown feature")

def get_feature_category(name):
    if name.startswith("SEQ_"):
        return "Sequence (Recent Form)"
    elif name.startswith("CTX_all_time"):
        return "Context (Career Stats)"
    elif name.startswith("CTX_"):
        return "Context (Match Context)"
    elif name.startswith("OPP_"):
        return "Opponent"
    return "Unknown"

if __name__ == "__main__":
    main()

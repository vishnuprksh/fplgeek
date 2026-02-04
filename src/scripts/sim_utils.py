import numpy as np
import tensorflow as tf
from src.scripts.lib.models import clean_and_scale
from src.scripts.lib.config import POSITIONS

def predict_gw(target_gw, frozen_gw=None, all_data=None, models=None, prob_thresholds=[7, 11]):
    """
    Predict points for a specific gameweek.
    If frozen_gw is provided, uses form data from that GW (for lookahead).
    """
    preds_map = {}
    for pos in POSITIONS:
        # 1. Get Samples for TARGET gw (for Context: Opponent, Difficulty, etc.)
        target_samples = [d for d in all_data[pos] if d.get('season') == '25/26' and d['gw'] == target_gw]
        if not target_samples: continue

        # 2. Get Form Data (History Sequence)
        if frozen_gw:
            # Lookahead Case: Use Form from FROZEN GW
            frozen_samples_map = {d['id']: d['history_sequence'] for d in all_data[pos] if d.get('season') == '25/26' and d['gw'] == frozen_gw}
            
            final_samples = []
            final_seqs = []
            
            for s in target_samples:
                if s['id'] in frozen_samples_map:
                    final_samples.append(s)
                    final_seqs.append(frozen_samples_map[s['id']])
            
            if not final_samples: continue
            
            X_seq = np.array(final_seqs, dtype=np.float32)
            # Use Target Context
            X_ctx = np.array([[d['ctx_was_home'], d['ctx_difficulty'], d['ctx_price'], d['ctx_hours_rest'],
                               d['ctx_all_time_avg_points'], d['ctx_all_time_total_points'],
                               d['ctx_all_time_goals_per_90'], d['ctx_all_time_xg_per_90'], d['ctx_all_time_games_played']]
                              for d in final_samples], dtype=np.float32)
            X_opp = np.array([d['ctx_opponent'] for d in final_samples], dtype=np.float32)
            predict_samples = final_samples
        
        else:
            # Standard Case
            X_seq = np.array([d['history_sequence'] for d in target_samples], dtype=np.float32)
            X_ctx = np.array([[d['ctx_was_home'], d['ctx_difficulty'], d['ctx_price'], d['ctx_hours_rest'],
                               d['ctx_all_time_avg_points'], d['ctx_all_time_total_points'],
                               d['ctx_all_time_goals_per_90'], d['ctx_all_time_xg_per_90'], d['ctx_all_time_games_played']]
                              for d in target_samples], dtype=np.float32)
            X_opp = np.array([d['ctx_opponent'] for d in target_samples], dtype=np.float32)
            predict_samples = target_samples

        X_seq, X_ctx = clean_and_scale(X_seq, X_ctx)
        X_opp = X_opp / 1350.0
        
        # Predict Distribution (N, 16)
        model = models.get(pos)
        if not model: continue
        
        # Predict Probabilities
        probs_dist = model.predict([X_seq, X_ctx, X_opp], verbose=0) # Shape (N, 16)
        
        # 1. Expected Points (Mean) -> Sum(i * p_i)
        # Create classes array [0, 1, ..., 15]
        classes = np.arange(16, dtype=np.float32)
        xp_values = np.sum(probs_dist * classes, axis=1) # (N,)
        
        # 2. Sigma (Std Dev) -> Sqrt(Sum(p_i * (i - mean)^2))
        variance = np.sum(probs_dist * (classes - xp_values[:, np.newaxis])**2, axis=1)
        sigma_values = np.sqrt(variance)
        
        # Calculate probabilities for requested thresholds
        # prob_thresholds is a list of integers, e.g. [6, 10]
        prob_values_map = {}
        for t in prob_thresholds:
            # Indices t..15 -> Points t, t+1, ..., 15+
            if t < 16:
                prob_values_map[t] = np.sum(probs_dist[:, t:], axis=1)
            else:
                prob_values_map[t] = np.zeros(len(probs_dist))

        for i, s in enumerate(predict_samples):
            xp = float(xp_values[i])
            sigma = float(sigma_values[i])
            
            # Apply multipliers based on historical performance (Elite Player Bias)
            all_time_avg = s.get('ctx_all_time_avg_points', 0)
            games_played = s.get('ctx_all_time_games_played', 0)
            
            multiplier = 1.0
            if all_time_avg > 5.0 and games_played > 50:
                multiplier = 1.5
            elif all_time_avg > 4.5 and games_played > 38:
                multiplier = 1.3
            elif all_time_avg > 4.0 and games_played > 38:
                multiplier = 1.15
            
            # Apply multiplier to Mean and Scale (Sigma scales linearly)
            xp *= multiplier
            sigma *= multiplier 
            
            entry = {
                'xp': xp,
                'sigma': sigma,
                'distribution': probs_dist[i].tolist()
            }
            
            # Heuristic update for Probabilities and populate entry
            for t, val_array in prob_values_map.items():
                prob_val = float(val_array[i])
                if multiplier > 1.0:
                    prob_val = min(0.99, prob_val * multiplier)
                
                entry[f'prob_gt_{t}'] = prob_val

            preds_map[s['id']] = entry
    return preds_map

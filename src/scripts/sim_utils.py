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
                               d['ctx_all_time_goals_per_90'], d['ctx_all_time_xg_per_90'], d['ctx_all_time_games_played'],
                               d['ctx_form'], d['ctx_ownership']]  # NEW: Added form and ownership
                              for d in final_samples], dtype=np.float32)
            X_opp = np.array([d['ctx_opponent'] for d in final_samples], dtype=np.float32)
            predict_samples = final_samples
        
        else:
            # Standard Case
            X_seq = np.array([d['history_sequence'] for d in target_samples], dtype=np.float32)
            X_ctx = np.array([[d['ctx_was_home'], d['ctx_difficulty'], d['ctx_price'], d['ctx_hours_rest'],
                               d['ctx_all_time_avg_points'], d['ctx_all_time_total_points'],
                               d['ctx_all_time_goals_per_90'], d['ctx_all_time_xg_per_90'], d['ctx_all_time_games_played'],
                               d['ctx_form'], d['ctx_ownership']]  # NEW: Added form and ownership
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
        
        # Group by Player ID to handle DGW
        player_indices = {}
        for i, s in enumerate(predict_samples):
            pid = s['id']
            if pid not in player_indices: player_indices[pid] = []
            player_indices[pid].append(i)
            
        classes = np.arange(16, dtype=np.float32)

        for pid, indices in player_indices.items():
            # If Single Game
            if len(indices) == 1:
                i = indices[0]
                dist = probs_dist[i]
                
                xp = np.sum(dist * classes)
                variance = np.sum(dist * (classes - xp)**2)
                sigma = np.sqrt(variance)
                
                final_dist = dist
                
            else:
                # Double Gameweek (or Triple?)
                # Convolute distributions
                dists = [probs_dist[i] for i in indices]
                
                # Start with first
                combined_dist = dists[0]
                
                for next_dist in dists[1:]:
                    # Full convolution (size N+M-1)
                    conv = np.convolve(combined_dist, next_dist)
                    combined_dist = conv
                    
                # Calculate metrics on combined distribution
                # The combined distribution indices represent scores 0, 1, 2...
                # Length will be 16 + 15 * (num_games - 1)
                
                combined_classes = np.arange(len(combined_dist), dtype=np.float32)
                xp = np.sum(combined_dist * combined_classes)
                variance = np.sum(combined_dist * (combined_classes - xp)**2)
                sigma = np.sqrt(variance)
                
                final_dist = combined_dist

            # Apply Multiplier (Elite Bias) based on first sample (static stats same)
            s = predict_samples[indices[0]]
            all_time_avg = s.get('ctx_all_time_avg_points', 0)
            games_played = s.get('ctx_all_time_games_played', 0)
            
            multiplier = 1.0
            if all_time_avg > 5.0 and games_played > 50:
                multiplier = 1.5
            elif all_time_avg > 4.5 and games_played > 38:
                multiplier = 1.3
            elif all_time_avg > 4.0 and games_played > 38:
                multiplier = 1.15
            
            xp *= multiplier
            sigma *= multiplier
            
            # Populate Entry
            entry = {
                'xp': float(xp),
                'sigma': float(sigma),
                # Store distribution truncated or full? Frontend might not use it directly but useful.
                # Let's keep it simple or truncated if huge.
                'distribution': final_dist.tolist() 
            }
            
            # Calculate Probabilities > Threshold
            for t in prob_thresholds:
                if t < len(final_dist):
                    prob_val = np.sum(final_dist[t:])
                else:
                    prob_val = 0.0
                
                if multiplier > 1.0:
                    prob_val = min(0.99, prob_val * multiplier)
                    
                entry[f'prob_gt_{t}'] = float(prob_val)
                
            preds_map[pid] = entry

    return preds_map

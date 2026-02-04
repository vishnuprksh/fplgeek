import numpy as np
from scipy.stats import norm

def is_differential(player):
    """
    Check if a player is a differential (ownership < 10%)
    """
    return float(player.get('selected_by_percent', 0)) < 10.0

def calc_team_prob_gt_target(starters, captain_id, target=60.0):
    """
    Calculate Probability that Team Score > target.
    Using Central Limit Theorem approximation.
    """
    mu_total = 0.0
    var_total = 0.0
    
    for p in starters:
        mu = p.get('xp', 0)
        sigma = p.get('sigma', 0)
        
        if p['id'] == captain_id:
            mu_total += 2 * mu
            var_total += 4 * (sigma**2)
        else:
            mu_total += mu
            var_total += sigma**2
    
    sigma_total = np.sqrt(var_total)
    
    if sigma_total == 0: return 0.0
    # Survival Function: P(X > target)
    z_score = (float(target) - mu_total) / sigma_total
    return norm.sf(z_score)

def should_bench_player(player):
    """
    Check if a player should be benched due to injury/fitness concerns.
    Auto-bench if not fully fit (status != 'a' or any injury concern).
    """
    status = player.get('status', 'a')
    chance = player.get('chance_of_playing_this_round')
    
    # Bench if not available (injured, unavailable, suspended, doubtful)
    if status != 'a':
        return True
    
    # Bench if chance of playing is < 100 (if specified)
    if chance is not None and chance < 100:
        return True
    
    return False

def calculate_selling_price(purchase_price, current_price):
    """
    FPL Selling Price Logic:
    - If price increased: sell_price = purchase + (profit / 2)
    - If price decreased: sell_price = current (full loss)
    
    Prices are in 0.1m units (e.g., 55 = 5.5m)
    """
    if current_price > purchase_price:
        profit = current_price - purchase_price
        return purchase_price + (profit / 2.0)  # Half profit
    else:
        return current_price  # Full loss

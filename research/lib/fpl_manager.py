from .config import STARTING_BUDGET

def is_differential(player):
    """
    Check if a player is a differential (ownership < 10%)
    """
    return float(player.get('selected_by_percent', 0)) < 10.0

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

def get_best_starting_squad(predictions):
    """
    Global optimization for initial squad selection using Linear Programming.
    Maximizes total predicted points subject to FPL constraints.
    Enforces max 2 differential players (<10% ownership)
    Excludes injured/unavailable players
    """
    from pulp import LpMaximize, LpProblem, LpVariable, lpSum, LpBinary, PULP_CBC_CMD
    
    # Filter valid players (ownership > 5%, not injured)
    valid_predictions = [
        p for p in predictions 
        if float(p.get('selected_by_percent', 0)) > 5.0
        and not should_bench_player(p)
    ]
    
    if len(valid_predictions) < 15:
        # Fallback: not enough players
        print(f"⚠️ Only {len(valid_predictions)} valid players available (need 15)")
        return [], 0
    
    # Create optimization problem
    prob = LpProblem("FPL_Squad_Selection", LpMaximize)
    
    # Decision variables: binary (0 or 1) for each player
    player_vars = {p['id']: LpVariable(f"player_{p['id']}", cat=LpBinary) 
                   for p in valid_predictions}

    # Decision variables: Captaincy (binary)
    captain_vars = {p['id']: LpVariable(f"captain_{p['id']}", cat=LpBinary) 
                    for p in valid_predictions}
    
    # Objective: Maximize total predicted points + Captain points (Doubled)
    # Total = Sum(xp * player) + Sum(xp * captain)  => Effectively 2*xp for captain, 1*xp for others
    prob += lpSum([p['xp'] * player_vars[p['id']] for p in valid_predictions]) + \
            lpSum([p['xp'] * captain_vars[p['id']] for p in valid_predictions])
    
    # Constraint: Exactly 1 Captain
    prob += lpSum([captain_vars[p['id']] for p in valid_predictions]) == 1
    
    # Constraint: Captain must be selected in the squad
    for p in valid_predictions:
        prob += captain_vars[p['id']] <= player_vars[p['id']]
    
    # Constraint 1: Budget (£100m = 1000 in 0.1m units)
    prob += lpSum([p['cost'] * player_vars[p['id']] for p in valid_predictions]) <= 1000
    
    # Constraint 2: Exactly 15 players
    prob += lpSum([player_vars[p['id']] for p in valid_predictions]) == 15
    
    # Constraint 3: Position requirements
    gkps = [p for p in valid_predictions if p['type'] == 1]
    defs = [p for p in valid_predictions if p['type'] == 2]
    mids = [p for p in valid_predictions if p['type'] == 3]
    fwds = [p for p in valid_predictions if p['type'] == 4]
    
    prob += lpSum([player_vars[p['id']] for p in gkps]) == 2
    prob += lpSum([player_vars[p['id']] for p in defs]) == 5
    prob += lpSum([player_vars[p['id']] for p in mids]) == 5
    prob += lpSum([player_vars[p['id']] for p in fwds]) == 3
    
    # Constraint 4: Max 3 players per team
    teams = set(p['team'] for p in valid_predictions)
    for team_id in teams:
        team_players = [p for p in valid_predictions if p['team'] == team_id]
        prob += lpSum([player_vars[p['id']] for p in team_players]) <= 3
    
    # Constraint 5: Max 2 differential players (< 10% ownership)
    differentials = [p for p in valid_predictions if is_differential(p)]
    prob += lpSum([player_vars[p['id']] for p in differentials]) <= 2
    
    # Solve (suppress output)
    prob.solve(PULP_CBC_CMD(msg=0))
    
    # Extract selected players
    selected_squad = []
    total_cost = 0
    
    for p in valid_predictions:
        if player_vars[p['id']].varValue == 1:
            selected_squad.append(p)
            total_cost += p['cost']
    
    return selected_squad, total_cost

class FPLManager:
    def __init__(self, players_map):
        self.players_map = players_map
        self.squad = [] # List of player IDs
        self.bank = STARTING_BUDGET
        self.free_transfers = 1
        
        # Purchase Price Tracking (FPL Mechanics)
        self.purchase_prices = {}  # {player_id: purchase_price}
        
        # Chip State
        # "they are recharged after week 19" -> 2 sets.
        self.chips_available = {
            "wildcard": 1,
            "freehit": 1,
            "bench_boost": 1,
            "triple_captain": 1
        }
        self.wildcard_2_awarded = False
        self.active_chip = None
    
    def initialize_squad(self, best_starting_squad, cost, initial_prices):
        """
        Initialize squad with purchase price tracking
        initial_prices: {player_id: price}
        """
        self.squad = [p['id'] for p in best_starting_squad]
        self.bank = STARTING_BUDGET - cost
        self.free_transfers = 0
        
        # Track purchase prices
        for p in best_starting_squad:
            self.purchase_prices[p['id']] = initial_prices.get(p['id'], p['cost'])

    def optimize_lineup(self, current_gw_preds, active_chip=None):
        """
        Selects Starting XI (1 GKP, 3+ DEF, 1+ FWD) and Captain.
        Captain must have 30%+ ownership.
        """
        squad_preds = [p for p in current_gw_preds if p['id'] in self.squad]
        squad_preds.sort(key=lambda x: (x['xp'], x.get('selected_by_percent', 0)), reverse=True)
        
        if not squad_preds:
             return [], [], None, None

        # 1. Select Starting XI first (prioritize fit players)
        starters = []
        bench = []
        
        # Separate fit and injured players
        fit_players = [p for p in squad_preds if not should_bench_player(p)]
        injured_players = [p for p in squad_preds if should_bench_player(p)]
        
        # Use only fit players for lineup selection
        gkps = [p for p in fit_players if p['type'] == 1]
        defs = [p for p in fit_players if p['type'] == 2]
        mids = [p for p in fit_players if p['type'] == 3]
        fwds = [p for p in fit_players if p['type'] == 4]
        
        if gkps: starters.append(gkps.pop(0))
        for _ in range(3): 
            if defs: starters.append(defs.pop(0))
        for _ in range(1):
            if fwds: starters.append(fwds.pop(0))
            
        remaining = sorted(gkps + defs + mids + fwds, key=lambda x: (x['xp'], x.get('selected_by_percent', 0)), reverse=True)
        
        ct_def = 3
        ct_mid = 0
        ct_fwd = 1
        
        for p in remaining:
            if len(starters) == 11:
                bench.append(p)
                continue
            
            added = False
            if p['type'] == 2 and ct_def < 5:
                starters.append(p)
                ct_def += 1
                added = True
            elif p['type'] == 3 and ct_mid < 5:
                starters.append(p)
                ct_mid += 1
                added = True
            elif p['type'] == 4 and ct_fwd < 3:
                starters.append(p)
                ct_fwd += 1
                added = True
                
            if not added:
                bench.append(p)
        
        # Add injured/unfit players to the bench (at the end)
        bench.extend(injured_players)
        
        bench.sort(key=lambda x: (x['xp'], x.get('selected_by_percent', 0)), reverse=True)

        # 2. Select Captain from Starters (using ownership constraint)
        starters_sorted = sorted(starters, key=lambda x: (x['xp'], x.get('selected_by_percent', 0)), reverse=True)
        
        # Try to find high ownership captain (safe pick)
        captain_candidates = [p for p in starters_sorted if float(p.get('selected_by_percent', 0)) >= 10.0]
        
        captain_id = None
        if captain_candidates:
            captain_id = captain_candidates[0]['id']
        elif starters_sorted:
             # Fallback: pick highest xP player derived from starters_sorted order (already sorted by xP)
             # Previous bug: we were re-sorting by ownership only, which was 0 for all in GW1
             captain_id = starters_sorted[0]['id']

        # Vice-captain
        vice_captain_candidates = [p for p in starters_sorted if p['id'] != captain_id and float(p.get('selected_by_percent', 0)) >= 10.0]
        
        vice_captain_id = None
        if vice_captain_candidates:
            vice_captain_id = vice_captain_candidates[0]['id']
        elif len(starters_sorted) > 1:
            # Fallback: next best xP
            remaining_starters = [p for p in starters_sorted if p['id'] != captain_id]
            vice_captain_id = remaining_starters[0]['id']
        else:
            vice_captain_id = captain_id

        return starters, bench, captain_id, vice_captain_id

    def decide_chip(self, current_gw_preds, gw):
        """
        Decide if we should play a chip this week.
        """
        self.active_chip = None
        
        # 1. Seasonality Check
        is_first_half = gw <= 19
        
        # Check Expiry Pressure
        weeks_left_in_half = 19 - gw
        
        # Calculate Potential for Chips
        starters, bench, captain_id, _ = self.optimize_lineup(current_gw_preds)
        
        if not starters: return None

        team_predicted_score = sum([p['xp'] for p in starters])
        captain_xp = next((p['xp'] for p in starters if p['id'] == captain_id), 0)
        team_predicted_score += captain_xp
        
        top_scorer_xp = captain_xp
        bench_xp = sum([p['xp'] for p in bench])
        
        # --- Decision Tree ---
        
        # --- Decision Tree ---
        
        # 0. FORCED USAGE (Must use all chips by GW 19)
        if gw <= 19:
            weeks_left = 19 - gw + 1
            chips_left = sum(self.chips_available.values())
            
            if chips_left >= weeks_left:
                # We MUST play a chip this week to clear the backlog
                # Priority of forced play:
                # 1. Triple Captain (Safest/Easiest to burn)
                # 2. Bench Boost (If bench is somewhat decent)
                # 3. Free Hit (If team needs it)
                # 4. Wildcard (Last resort)
                
                if self.chips_available['triple_captain']:
                    return "triple_captain"
                elif self.chips_available['bench_boost']:
                    return "bench_boost"
                elif self.chips_available['freehit']:
                    return "freehit"
                elif self.chips_available['wildcard']:
                    return "wildcard"

        # 1. Wildcard (Panic Button or Refresh)
        # WC1 Expiry: Must use by GW 19 if available (Handled by forced usage above essentially, but kept for logic)
        if self.chips_available['wildcard'] > 0:
            if gw == 19 and not self.wildcard_2_awarded:
                 return "wildcard" # Should be caught by force above, but safety net
            if team_predicted_score < 40:
                return "wildcard"
        
        # 2. Bench Boost
        if self.chips_available['bench_boost'] > 0:
            if bench_xp > 15:
                return "bench_boost"
                
        # 3. Triple Captain
        if self.chips_available['triple_captain'] > 0:
            if top_scorer_xp > 10:
                return "triple_captain"
        
        # 4. Free Hit
        if self.chips_available['freehit'] > 0:
            zeros = [p for p in starters if p['xp'] < 0.5]
            if len(zeros) >= 3:
                return "freehit"

        return None

    def make_transfers(self, current_gw_preds, all_candidates, gw, price_lookup=None, priority_transfer_out_id=None):
        """
        Handle Transfers AND Chips (Wildcard/FreeHit)
        price_lookup: {player_id: current_price} for this GW
        priority_transfer_out_id: Player ID to prioritize selling (e.g., underperformer)
        """
        # CHECK FOR CHIP RENEWAL AT GW 20
        # "all the four chips must be used before gw 19... after it renews"
        if gw == 20:
            print(f"🔄 GW {gw}: All Chips Renewed for Second Half!")
            self.chips_available = {
                "wildcard": 1,
                "freehit": 1,
                "bench_boost": 1,
                "triple_captain": 1
            }
            # We treat the second WC as just "wildcard" in the available slots
            self.wildcard_2_awarded = True

        active_chip = self.decide_chip(current_gw_preds, gw)
        self.active_chip = active_chip
        
        if active_chip == "wildcard" or active_chip == "freehit":
            if active_chip == "wildcard":
                self.chips_available['wildcard'] -= 1
                best_squad, _ = get_best_starting_squad(all_candidates) 
                self.squad = [p['id'] for p in best_squad]
                self.bank = 0 
                cost = sum([p['cost'] for p in best_squad])
                self.bank = 1000 - cost
                
                # Reset purchase prices to current prices
                self.purchase_prices = {}
                for p in best_squad:
                    current_price = price_lookup.get(p['id'], p['cost']) if price_lookup else p['cost']
                    self.purchase_prices[p['id']] = current_price
                
                return [], active_chip
                
            elif active_chip == "freehit":
                self.chips_available['freehit'] -= 1
                self.original_squad = list(self.squad)
                self.original_bank = self.bank
                self.original_purchase_prices = self.purchase_prices.copy()  # Preserve prices
                
                best_squad, _ = get_best_starting_squad(all_candidates)
                self.squad = [p['id'] for p in best_squad]
                self.bank = 0
                cost = sum([p['cost'] for p in best_squad])
                self.bank = 1000 - cost
                return [], active_chip

        # Non-transfer chips
        if active_chip == "bench_boost":
            self.chips_available['bench_boost'] -= 1
        elif active_chip == "triple_captain":
            self.chips_available['triple_captain'] -= 1
            
        # Standard Transfers Logic (Greedy) with Selling Price Mechanics
        squad_ids = set(self.squad)
        team_counts = {}
        for pid in self.squad:
            if pid not in self.players_map: continue # Safety
            t = self.players_map[pid]['team']
            team_counts[t] = team_counts.get(t, 0) + 1
            
        transfers_log = []
        max_transfers_this_turn = 2 
        transfers_done = 0
        current_bank = self.bank
        current_squad_ids = list(self.squad)
        current_team_counts = team_counts.copy()
        current_purchase_prices = self.purchase_prices.copy()
        
        while transfers_done < max_transfers_this_turn:
            best_move = None
            best_gain = 0
            
            mock_squad_xp = [p for p in current_gw_preds if p['id'] in current_squad_ids]
            
            # Sort by: 
            # 0. Injured/Unfit (Highest Priority)
            # 0.5. Priority Target (Underperformer)
            # 1. Available (Lowest Priority)
            # Then by Low XP
            def get_out_priority(p):
                is_injured = p.get('status', 'a') != 'a' or (p.get('chance_of_playing_this_round') is not None and p.get('chance_of_playing_this_round') < 100)
                
                if is_injured:
                    return (0, p['xp'])
                
                if priority_transfer_out_id and p['id'] == priority_transfer_out_id:
                    return (0.5, p['xp'])
                    
                return (1, p['xp'])
                
            mock_squad_xp.sort(key=get_out_priority)
            # Ensure we have players to sell
            if not mock_squad_xp: break

            candidates_out = mock_squad_xp[:5]
            
            for p_out in candidates_out:
                # Calculate selling price using FPL mechanics
                current_price = price_lookup.get(p_out['id'], p_out['cost']) if price_lookup else p_out['cost']
                purchase_price = current_purchase_prices.get(p_out['id'], current_price)
                selling_price = calculate_selling_price(purchase_price, current_price)
                
                budget = current_bank + selling_price  # Use selling price, not current
                pos_candidates = [c for c in all_candidates 
                                  if c['type'] == p_out['type'] 
                                  and c['cost'] <= budget
                                  and c['id'] not in current_squad_ids
                                  and float(c.get('selected_by_percent', 0)) > 5.0] # Constraint ownership
                
                top_targets = sorted(pos_candidates, key=lambda x: (x['xp'], x.get('selected_by_percent', 0)), reverse=True)[:5]
                
                for p_in in top_targets:
                    team_id = p_in['team']
                    if current_team_counts.get(team_id, 0) >= 3:
                        if self.players_map[p_out['id']]['team'] != team_id:
                             continue
                    
                    # Check differential limit (max 2 players with <10% ownership)
                    # Count current differentials in squad
                    current_differential_count = sum(1 for pid in current_squad_ids 
                                                    if pid in self.players_map 
                                                    and float(self.players_map[pid].get('selected_by_percent', 0)) < 10.0)
                    
                    # If bringing in a differential and we already have 2, skip
                    # Unless we're also selling a differential (net zero change)
                    if is_differential(p_in):
                        if current_differential_count >= 2 and not is_differential(p_out):
                            continue
                    
                    cost_pts = 4 if self.free_transfers <= 0 else 0
                    gain = (p_in['xp'] - p_out['xp']) - cost_pts
                    
                    # Boost gain for priority target to ensure they are selected
                    if p_out['id'] == priority_transfer_out_id:
                        gain += 1000.0
                        
                    if gain > best_gain:
                        best_gain = gain
                        best_move = (p_out, p_in, cost_pts, selling_price)
            
            
            # Accept transfer if:
            # 1. Gain > 1.0 (normal case)
            # 2. Selling injured player and gain > 0 (any improvement)
            # 3. Selling priority target (Force sell, has boosted gain)
            if best_move:
                p_out, p_in, cost_pts, selling_price = best_move
                is_injured = p_out.get('status', 'a') != 'a' or (p_out.get('chance_of_playing_this_round') is not None and p_out.get('chance_of_playing_this_round') < 100)
                is_priority = (priority_transfer_out_id and p_out['id'] == priority_transfer_out_id)
                
                threshold = 1.0
                if is_injured: 
                    threshold = 0.0
                if is_priority:
                     threshold = 500.0 # Expecting boosted gain > 900
                
                if p_out['id'] == priority_transfer_out_id:
                    if best_move:
                         pass

                if best_gain > threshold:
                    current_squad_ids.remove(p_out['id'])
                    current_squad_ids.append(p_in['id'])
                    
                    # Update bank using selling price
                    current_bank = current_bank + selling_price - p_in['cost']
                    
                    # Update purchase prices
                    del current_purchase_prices[p_out['id']]
                    purchase_price_in = price_lookup.get(p_in['id'], p_in['cost']) if price_lookup else p_in['cost']
                    current_purchase_prices[p_in['id']] = purchase_price_in
                    
                    current_team_counts[self.players_map[p_out['id']]['team']] -= 1
                    current_team_counts[p_in['team']] = current_team_counts.get(p_in['team'], 0) + 1
                    self.free_transfers -= 1
                    transfers_done += 1
                    transfers_log.append({
                        "in": p_in,
                        "out": p_out,
                        "cost": cost_pts
                    })
                else:
                    break
            else:
                break
        
        self.squad = current_squad_ids
        self.bank = current_bank
        self.purchase_prices = current_purchase_prices
        return transfers_log, active_chip

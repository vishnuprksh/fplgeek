from .config import STARTING_BUDGET

def is_differential(player):
    """
    Check if a player is a differential (ownership < 10%)
    """
    return float(player.get('selected_by_percent', 0)) < 10.0

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
    Initial squad selection - Greedy Algorithm
    Enforces max 2 differential players (<10% ownership)
    """
    squad = []
    # Ownership Constraint: Only consider players suitable for "template" teams (> 5% ownership)
    valid_predictions = [p for p in predictions if float(p.get('selected_by_percent', 0)) > 5.0]
    
    gkps = sorted([p for p in valid_predictions if p['type'] == 1], key=lambda x: (x['xp'], x.get('selected_by_percent', 0)), reverse=True)
    defs = sorted([p for p in valid_predictions if p['type'] == 2], key=lambda x: (x['xp'], x.get('selected_by_percent', 0)), reverse=True)
    mids = sorted([p for p in valid_predictions if p['type'] == 3], key=lambda x: (x['xp'], x.get('selected_by_percent', 0)), reverse=True)
    fwds = sorted([p for p in valid_predictions if p['type'] == 4], key=lambda x: (x['xp'], x.get('selected_by_percent', 0)), reverse=True)

    final_squad = []
    total_cost = 0
    team_counts = {}
    differential_count = 0  # Track differential players
    
    def add_player(p):
        nonlocal total_cost, differential_count
        if total_cost + p['cost'] > 1000: return False
        if team_counts.get(p['team'], 0) >= 3: return False
        
        # Check differential limit (max 2 players with <10% ownership)
        if is_differential(p) and differential_count >= 2:
            return False
        
        final_squad.append(p)
        total_cost += p['cost']
        team_counts[p['team']] = team_counts.get(p['team'], 0) + 1
        if is_differential(p):
            differential_count += 1
        return True

    if gkps: add_player(gkps[0])
    if len(gkps) > 1: add_player(gkps[-1])
    
    for p in defs: 
        if len([x for x in final_squad if x['type']==2]) >= 5: break
        add_player(p)
    for p in mids:
        if len([x for x in final_squad if x['type']==3]) >= 5: break
        add_player(p)
    for p in fwds:
        if len([x for x in final_squad if x['type']==4]) >= 3: break
        add_player(p)
        
    return final_squad, total_cost

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
            "wildcard": 2,
            "freehit": 2,
            "bench_boost": 2,
            "triple_captain": 2
        }
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
        """
        squad_preds = [p for p in current_gw_preds if p['id'] in self.squad]
        squad_preds.sort(key=lambda x: (x['xp'], x.get('selected_by_percent', 0)), reverse=True)
        
        if not squad_preds:
             return [], [], None, None

        # Captaincy
        captain_id = squad_preds[0]['id']
        vice_captain_id = squad_preds[1]['id'] if len(squad_preds) > 1 else squad_preds[0]['id']
        
        # Triple Captain Logic override is handled by scoring engine, here we just select C

        # Bench Boost: All 15 play. Lineup distinction still exists for formation rules but points count for all.
        
        starters = []
        bench = []
        
        gkps = [p for p in squad_preds if p['type'] == 1]
        defs = [p for p in squad_preds if p['type'] == 2]
        mids = [p for p in squad_preds if p['type'] == 3]
        fwds = [p for p in squad_preds if p['type'] == 4]
        
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
        
        bench.sort(key=lambda x: (x['xp'], x.get('selected_by_percent', 0)), reverse=True)
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
        
        # 1. Wildcard (Panic Button or Refresh)
        if self.chips_available['wildcard'] > 0:
            must_use = (self.chips_available['wildcard'] == 2 and gw == 19)
            if must_use or team_predicted_score < 40:
                return "wildcard"
        
        # 2. Bench Boost
        if self.chips_available['bench_boost'] > 0:
            must_use = (self.chips_available['bench_boost'] == 2 and gw == 19)
            if must_use or bench_xp > 15:
                return "bench_boost"
                
        # 3. Triple Captain
        if self.chips_available['triple_captain'] > 0:
            must_use = (self.chips_available['triple_captain'] == 2 and gw == 19)
            if must_use or top_scorer_xp > 10:
                return "triple_captain"
        
        # 4. Free Hit
        if self.chips_available['freehit'] > 0:
            must_use = (self.chips_available['freehit'] == 2 and gw == 19)
            if must_use:
                return "freehit"
            zeros = [p for p in starters if p['xp'] < 0.5]
            if len(zeros) >= 3:
                return "freehit"

        # 5. Pressure Usage
        chips_to_burn = 0
        if is_first_half:
            if self.chips_available['wildcard'] == 2: chips_to_burn += 1
            if self.chips_available['freehit'] == 2: chips_to_burn += 1
            if self.chips_available['bench_boost'] == 2: chips_to_burn += 1
            if self.chips_available['triple_captain'] == 2: chips_to_burn += 1
            
            if chips_to_burn > weeks_left_in_half:
                if self.chips_available['triple_captain'] == 2: return "triple_captain"
                if self.chips_available['bench_boost'] == 2: return "bench_boost"
                if self.chips_available['freehit'] == 2: return "freehit"
                if self.chips_available['wildcard'] == 2: return "wildcard"
        
        return None

    def make_transfers(self, current_gw_preds, all_candidates, gw, price_lookup=None):
        """
        Handle Transfers AND Chips (Wildcard/FreeHit)
        price_lookup: {player_id: current_price} for this GW
        """
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
            mock_squad_xp.sort(key=lambda x: x['xp'])
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
                    if gain > best_gain:
                        best_gain = gain
                        best_move = (p_out, p_in, cost_pts, selling_price)
            
            if best_move and best_gain > 0.5:
                p_out, p_in, cost_pts, selling_price = best_move
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
        
        self.squad = current_squad_ids
        self.bank = current_bank
        self.purchase_prices = current_purchase_prices
        return transfers_log, active_chip

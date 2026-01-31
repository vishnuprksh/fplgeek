from .config import STARTING_BUDGET

def get_best_starting_squad(predictions):
    """
    Initial squad selection - Greedy Algorithm
    """
    squad = []
    gkps = sorted([p for p in predictions if p['type'] == 1], key=lambda x: x['xp'], reverse=True)
    defs = sorted([p for p in predictions if p['type'] == 2], key=lambda x: x['xp'], reverse=True)
    mids = sorted([p for p in predictions if p['type'] == 3], key=lambda x: x['xp'], reverse=True)
    fwds = sorted([p for p in predictions if p['type'] == 4], key=lambda x: x['xp'], reverse=True)

    final_squad = []
    total_cost = 0
    team_counts = {}
    
    def add_player(p):
        nonlocal total_cost
        if total_cost + p['cost'] > 1000: return False
        if team_counts.get(p['team'], 0) >= 3: return False
        
        final_squad.append(p)
        total_cost += p['cost']
        team_counts[p['team']] = team_counts.get(p['team'], 0) + 1
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
        
        # Chip State
        # "they are recharged after week 19" -> 2 sets.
        self.chips_available = {
            "wildcard": 2,
            "freehit": 2,
            "bench_boost": 2,
            "triple_captain": 2
        }
        self.active_chip = None
    
    def initialize_squad(self, best_starting_squad, cost):
        self.squad = [p['id'] for p in best_starting_squad]
        self.bank = STARTING_BUDGET - cost
        self.free_transfers = 0

    def optimize_lineup(self, current_gw_preds, active_chip=None):
        """
        Selects Starting XI (1 GKP, 3+ DEF, 1+ FWD) and Captain.
        """
        squad_preds = [p for p in current_gw_preds if p['id'] in self.squad]
        squad_preds.sort(key=lambda x: x['xp'], reverse=True)
        
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
            
        remaining = sorted(gkps + defs + mids + fwds, key=lambda x: x['xp'], reverse=True)
        
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
        
        bench.sort(key=lambda x: x['xp'], reverse=True)
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

    def make_transfers(self, current_gw_preds, all_candidates, gw):
        """
        Handle Transfers AND Chips (Wildcard/FreeHit)
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
                return [], active_chip
                
            elif active_chip == "freehit":
                self.chips_available['freehit'] -= 1
                self.original_squad = list(self.squad)
                self.original_bank = self.bank
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
            
        # Standard Transfers Logic (Greedy)
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
        
        while transfers_done < max_transfers_this_turn:
            best_move = None
            best_gain = 0
            
            mock_squad_xp = [p for p in current_gw_preds if p['id'] in current_squad_ids]
            mock_squad_xp.sort(key=lambda x: x['xp'])
            # Ensure we have players to sell
            if not mock_squad_xp: break

            candidates_out = mock_squad_xp[:5]
            
            for p_out in candidates_out:
                budget = current_bank + p_out['cost']
                pos_candidates = [c for c in all_candidates 
                                  if c['type'] == p_out['type'] 
                                  and c['cost'] <= budget
                                  and c['id'] not in current_squad_ids]
                
                top_targets = sorted(pos_candidates, key=lambda x: x['xp'], reverse=True)[:5]
                
                for p_in in top_targets:
                    team_id = p_in['team']
                    if current_team_counts.get(team_id, 0) >= 3:
                        if self.players_map[p_out['id']]['team'] != team_id:
                             continue
                    cost_pts = 4 if self.free_transfers <= 0 else 0
                    gain = (p_in['xp'] - p_out['xp']) - cost_pts
                    if gain > best_gain:
                        best_gain = gain
                        best_move = (p_out, p_in, cost_pts)
            
            if best_move and best_gain > 0.5:
                p_out, p_in, cost_pts = best_move
                current_squad_ids.remove(p_out['id'])
                current_squad_ids.append(p_in['id'])
                current_bank = current_bank + p_out['cost'] - p_in['cost']
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
        return transfers_log, active_chip

from .config import STARTING_BUDGET
from .fpl_utils import (
    is_differential, 
    calc_team_prob_gt_60, 
    should_bench_player, 
    calculate_selling_price
)
from .squad_optimizer import get_best_starting_squad

    


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

        # 1. Select Starting XI first (prioritize fit players AND template players)
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
        
        # Sort all position lists by xP, prioritizing template players
        for pos_list in [gkps, defs, mids, fwds]:
            pos_list.sort(key=lambda x: (
                float(x.get('selected_by_percent', 0)) >= 30.0,  # Template players first
                x['xp']
            ), reverse=True)

        # Mandatory positions
        if gkps: starters.append(gkps.pop(0))
        for _ in range(3): 
            if defs: starters.append(defs.pop(0))
        for _ in range(1):
            if fwds: starters.append(fwds.pop(0))
            
        # Combine remaining players and sort them, prioritizing template players
        remaining = sorted(gkps + defs + mids + fwds, key=lambda x: (
            float(x.get('selected_by_percent', 0)) >= 30.0,  # Template players first
            x['xp']
        ), reverse=True)
        
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
        
        # Captain must have 30%+ ownership (safe, template pick)
        captain_candidates = [p for p in starters_sorted if float(p.get('selected_by_percent', 0)) >= 30.0]
        
        captain_id = None
        if captain_candidates:
            captain_id = captain_candidates[0]['id']
        else:
            # CRITICAL: No template players in starting XI - this should not happen with proper constraints
            print(f"⚠️ WARNING: No 30%+ ownership players in starting XI for captain selection!")
            # Emergency fallback: pick highest xP (but this indicates a constraint violation)
            if starters_sorted:
                captain_id = starters_sorted[0]['id']
                print(f"   Emergency captain: {starters_sorted[0]['name']} ({starters_sorted[0].get('selected_by_percent', 0):.1f}%)")

        # Vice-captain (also prefer 30%+ ownership)
        vice_captain_candidates = [p for p in starters_sorted if p['id'] != captain_id and float(p.get('selected_by_percent', 0)) >= 30.0]
        
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

    def decide_pre_transfer_chip(self, current_gw_preds, gw):
        """
        Decide if we should play a TRANSFER chip (Wildcard/FreeHit) this week.
        Returns: (chip_name, None) or (None, None)
        """
        
        # Calculate Team Potential for Metrics
        starters, bench, captain_id, _ = self.optimize_lineup(current_gw_preds)
        if not starters: return None, None

        # 1. Calc Team Prob > 60 (Crisis Metric)
        team_prob_60 = calc_team_prob_gt_60(starters, captain_id)

        # --- Decision Tree ---
        
        # 0. FORCED USAGE (WC/FH Only) - Must use by GW 19
        if gw <= 19:
            weeks_left = 19 - gw + 1
            chips_left = sum(self.chips_available.values())
            
            if chips_left >= weeks_left:
                # Priority: FreeHit > Wildcard (if forced and available)
                # But typically we prefer TC/BB for forced play, so only force if we HAVE to clear these two.
                # Actually, if we are FORCED, we might implement a specialized "force any chip" logic in make_transfers.
                # For now, let's keep the specific logic:
                if self.chips_available['freehit'] and not self.chips_available['triple_captain'] and not self.chips_available['bench_boost']:
                     return "freehit", None
                if self.chips_available['wildcard'] and not self.chips_available['triple_captain'] and not self.chips_available['bench_boost'] and not self.chips_available['freehit']:
                     return "wildcard", None

        # 1. Crisis Management (Wildcard / Free Hit)
        if team_prob_60 < 0.25:
            if self.chips_available['freehit'] > 0:
                print(f"🚨 GW {gw}: CRISIS! Team Prob > 60 is {team_prob_60:.2%}. Triggering FREE HIT.")
                return "freehit", None
            
            if self.chips_available['wildcard'] > 0:
                print(f"🚨 GW {gw}: CRISIS! Team Prob > 60 is {team_prob_60:.2%}. Triggering WILDCARD.")
                return "wildcard", None

        return None, None

    def decide_post_transfer_chip(self, current_gw_preds, gw):
        """
        Decide if we should play an ENHANCEMENT chip (TC/BB) AFTER transfers.
        Returns: (chip_name, trigger_player_id) or (None, None)
        """
        starters, bench, captain_id, _ = self.optimize_lineup(current_gw_preds)
        if not starters: return None, None
        
        captain_stats = next((p for p in starters if p['id'] == captain_id), None)
        tc_prob = captain_stats.get('prob_gt_10', 0) if captain_stats else 0
        
        bench_probs = [p.get('prob_gt_6', 0) for p in bench]
        bb_avg_prob = sum(bench_probs) / len(bench_probs) if bench_probs else 0
        
        # 0. FORCED USAGE (TC/BB Priority)
        if gw <= 19:
            weeks_left = 19 - gw + 1
            chips_left = sum(self.chips_available.values())
            
            if chips_left >= weeks_left:
                 if self.chips_available['triple_captain']: return "triple_captain", captain_id
                 elif self.chips_available['bench_boost']: return "bench_boost", None
        
        # 1. Triple Captain
        if self.chips_available['triple_captain'] > 0:
            if tc_prob > 0.20:
                print(f"⚡ GW {gw}: TRIPLE CAPTAIN Triggered! {captain_stats['name']} Prob>=10 is {tc_prob:.1%}")
                return "triple_captain", captain_id
        
        # 2. Bench Boost
        if self.chips_available['bench_boost'] > 0:
            if bb_avg_prob > 0.25:
                print(f"🚀 GW {gw}: BENCH BOOST Triggered! Avg Bench Prob>=6 is {bb_avg_prob:.1%}")
                return "bench_boost", None
                
        return None, None

    def make_transfers(self, current_gw_preds, all_candidates, gw, price_lookup=None, priority_transfer_out_id=None, underperformance_map=None):
        """
        Handle Transfers AND Chips (Wildcard/FreeHit)
        """
        # CHECK FOR CHIP RENEWAL AT GW 20
        if gw == 20:
            print(f"🔄 GW {gw}: All Chips Renewed for Second Half!")
            self.chips_available = {
                "wildcard": 1,
                "freehit": 1,
                "bench_boost": 1,
                "triple_captain": 1
            }
            self.wildcard_2_awarded = True

        # 1. PRE-TRANSFER CHIPS (Wildcard / Free Hit)
        active_chip, _ = self.decide_pre_transfer_chip(current_gw_preds, gw)
        self.active_chip = active_chip # Will be "wildcard", "freehit", or None
        
        if active_chip == "wildcard" or active_chip == "freehit":
            if active_chip == "wildcard":
                self.chips_available['wildcard'] -= 1
                best_squad, _, _, _, _ = get_best_starting_squad(all_candidates) 
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
                
                best_squad, _, _, _, _ = get_best_starting_squad(all_candidates)
                self.squad = [p['id'] for p in best_squad]
                self.bank = 0
                cost = sum([p['cost'] for p in best_squad])
                self.bank = 1000 - cost
                return [], active_chip

        # 2. STANDARD TRANSFERS (Greedy)
        # Execute transfers first (selling underperformers, buying new assets)
        squad_ids = set(self.squad)
        team_counts = {}
        for pid in self.squad:
            if pid not in self.players_map: continue
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
            # 2. Template Player (Protected if count <= 3)
            
            # Count current template players (30%+ ownership)
            template_count = sum(1 for pid in current_squad_ids 
                                if pid in self.players_map 
                                and float(self.players_map[pid].get('selected_by_percent', 0)) >= 30.0)
            
            def get_out_priority(p):
                is_injured = p.get('status', 'a') != 'a' or (p.get('chance_of_playing_this_round') is not None and p.get('chance_of_playing_this_round') < 100)
                is_template = float(p.get('selected_by_percent', 0)) >= 30.0
                
                # PROTECTED: Template player when at or below minimum
                if is_template and template_count <= 3:
                    return (2, p['xp'])  # Lowest priority (protected)
                
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
                
                # Filter candidates by position, budget, ownership, and NOT in current squad
                pos_candidates = [c for c in all_candidates 
                                  if c['type'] == p_out['type'] 
                                  and c['cost'] <= budget
                                  and c['id'] not in current_squad_ids
                                  and float(c.get('selected_by_percent', 0)) > 5.0]  # Constraint ownership
                
                # EXCLUDE UNDERPERFORMING PLAYERS
                # Filter out players who are underperforming (actual < predicted by significant margin)
                # Use underperformance_map from ai_manager (last 3 GWs of data)
                filtered_candidates = []
                for c in pos_candidates:
                    # Check if player is underperforming based on recent history
                    if underperformance_map and c['id'] in underperformance_map:
                        underperf_score = underperformance_map[c['id']]
                        # Exclude if underperforming by more than 3 points over last 3 GWs
                        if underperf_score > 3.0:
                            continue  # Skip this underperforming player
                    
                    filtered_candidates.append(c)
                
                top_targets = sorted(filtered_candidates, key=lambda x: (x['xp'], x.get('selected_by_percent', 0)), reverse=True)[:5]
                
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
                    
                    gain = p_in['xp'] - p_out['xp']
                    
                    # Applying Hit Penalty
                    if self.free_transfers == 0:
                        gain -= 4.0 # Hit cost
                    
                    if gain > best_gain and gain > 0.5: # Threshold to trade
                         best_gain = gain
                         best_move = (p_out, p_in, selling_price)

            if best_move:
                p_out, p_in, sell_price = best_move
                
                current_squad_ids.remove(p_out['id'])
                current_squad_ids.append(p_in['id'])
                
                current_team_counts[self.players_map[p_out['id']]['team']] -= 1
                current_team_counts[p_in['team']] = current_team_counts.get(p_in['team'], 0) + 1
                
                current_bank += sell_price
                current_bank -= p_in['cost']
                
                # Update Purchase Price for new player
                current_purchase_prices.pop(p_out['id'], None)
                current_purchase_prices[p_in['id']] = p_in['cost']
                
                if self.free_transfers > 0:
                     self.free_transfers -= 1
                
                transfers_done += 1
                transfers_log.append({
                    "out": p_out['name'],
                    "in": p_in['name']
                })
            else:
                break
        
        # Commit Transfers
        self.squad = current_squad_ids
        self.bank = current_bank
        self.purchase_prices = current_purchase_prices
        
        if transfers_done == 0 and self.free_transfers < 5:
             self.free_transfers += 1
             
        # 3. POST-TRANSFER CHIPS (Triple Captain / Bench Boost)
        # Now that the squad is final, check if we should apply an enhancement chip
        # But only if we haven't already used one (WC/FH)
        if not self.active_chip:
            post_chip, _ = self.decide_post_transfer_chip(current_gw_preds, gw)
            if post_chip:
                self.active_chip = post_chip
                if post_chip == "triple_captain":
                    self.chips_available['triple_captain'] -= 1
                elif post_chip == "bench_boost":
                    self.chips_available['bench_boost'] -= 1
             
        return transfers_log, self.active_chip

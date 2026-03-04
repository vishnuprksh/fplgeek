from pulp import LpMaximize, LpProblem, LpVariable, lpSum, LpBinary, PULP_CBC_CMD, LpStatus  # type: ignore[import-untyped]
from .fpl_utils import is_differential, should_bench_player

def get_best_starting_squad(predictions):
    """
    Global optimization for initial squad selection using Linear Programming.
    Maximizes total predicted points subject to FPL constraints.
    Enforces graduated ownership constraints for squad selection and captaincy.
    Excludes injured/unavailable players
    """
    
    # Filter valid players (ownership > 10%, not injured)
    valid_predictions = [
        p for p in predictions 
        if float(p.get('selected_by_percent', 0)) > 10.0 # All 15 players must be >10% ownership
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

    # Decision variables: Starting XI (binary)
    starter_vars = {p['id']: LpVariable(f"starter_{p['id']}", cat=LpBinary) 
                    for p in valid_predictions}

    # Decision variables: Captaincy (binary)
    captain_vars = {p['id']: LpVariable(f"captain_{p['id']}", cat=LpBinary) 
                    for p in valid_predictions}
    
    # Objective: Maximize Starting XI points (weighted heavily) + Captain bonus + Bench points (small weight)
    # Priority: Starting XI >> Captain >> Bench
    # Weight starting XI at 100x, bench at 1x to ensure starting XI is optimized first
    prob += lpSum([p['xp'] * starter_vars[p['id']] * 100 for p in valid_predictions]) + \
            lpSum([p['xp'] * captain_vars[p['id']] * 100 for p in valid_predictions]) + \
            lpSum([p['xp'] * player_vars[p['id']] for p in valid_predictions])
    
    # Constraint: Exactly 11 starters
    prob += lpSum([starter_vars[p['id']] for p in valid_predictions]) == 11
    
    # Constraint: Starters must be in squad
    for p in valid_predictions:
        prob += starter_vars[p['id']] <= player_vars[p['id']]
    
    # Constraint: Exactly 1 Captain
    prob += lpSum([captain_vars[p['id']] for p in valid_predictions]) == 1
    
    # Constraint: Captain must be a starter
    for p in valid_predictions:
        prob += captain_vars[p['id']] <= starter_vars[p['id']]
    
    # -------------------------------------------------------
    # OWNERSHIP CONSTRAINTS (per-GW values — no data leakage)
    # -------------------------------------------------------
    
    # Constraint A: Captain must have >60% ownership (guard: only add if feasible)
    players_over_60_percent = [p for p in valid_predictions if float(p.get('selected_by_percent', 0)) > 60.0]
    if players_over_60_percent:
        prob += lpSum([captain_vars[p['id']] for p in players_over_60_percent]) >= 1
    else:
        print("⚠️ No players >60% ownership for captaincy — constraint relaxed to best available.")

    # Constraint B: At least 8 players with >40% ownership in squad
    players_over_40_percent = [p for p in valid_predictions if float(p.get('selected_by_percent', 0)) > 40.0]
    if len(players_over_40_percent) >= 8:
        prob += lpSum([player_vars[p['id']] for p in players_over_40_percent]) >= 8
    elif players_over_40_percent:
        # Relax: require all available >40% players to be included
        prob += lpSum([player_vars[p['id']] for p in players_over_40_percent]) >= len(players_over_40_percent)
        print(f"⚠️ Only {len(players_over_40_percent)} players >40% ownership — relaxed constraint applied.")

    # Constraint C: At least 12 players with >20% ownership in squad
    players_over_20_percent = [p for p in valid_predictions if float(p.get('selected_by_percent', 0)) > 20.0]
    if len(players_over_20_percent) >= 12:
        prob += lpSum([player_vars[p['id']] for p in players_over_20_percent]) >= 12
    elif players_over_20_percent:
        # Relax: require all available >20% players to be included
        prob += lpSum([player_vars[p['id']] for p in players_over_20_percent]) >= len(players_over_20_percent)
        print(f"⚠️ Only {len(players_over_20_percent)} players >20% ownership — relaxed constraint applied.")
    
    # -------------------------------------------------------
    
    # Constraint 1: Budget (£100m = 1000 in 0.1m units)
    prob += lpSum([p['cost'] * player_vars[p['id']] for p in valid_predictions]) <= 1000
    
    # Constraint 2: Exactly 15 players
    prob += lpSum([player_vars[p['id']] for p in valid_predictions]) == 15
    
    # Constraint 3: Position requirements for SQUAD (15 players)
    gkps = [p for p in valid_predictions if p['type'] == 1]
    defs = [p for p in valid_predictions if p['type'] == 2]
    mids = [p for p in valid_predictions if p['type'] == 3]
    fwds = [p for p in valid_predictions if p['type'] == 4]
    
    prob += lpSum([player_vars[p['id']] for p in gkps]) == 2
    prob += lpSum([player_vars[p['id']] for p in defs]) == 5
    prob += lpSum([player_vars[p['id']] for p in mids]) == 5
    prob += lpSum([player_vars[p['id']] for p in fwds]) == 3
    
    # Constraint 3b: Position requirements for STARTING XI (11 players)
    # Valid formations: 1 GKP, 3-5 DEF, 2-5 MID, 1-3 FWD
    prob += lpSum([starter_vars[p['id']] for p in gkps]) == 1  # Exactly 1 GKP
    prob += lpSum([starter_vars[p['id']] for p in defs]) >= 3  # Min 3 DEF
    prob += lpSum([starter_vars[p['id']] for p in defs]) <= 5  # Max 5 DEF
    prob += lpSum([starter_vars[p['id']] for p in mids]) >= 2  # Min 2 MID
    prob += lpSum([starter_vars[p['id']] for p in mids]) <= 5  # Max 5 MID
    prob += lpSum([starter_vars[p['id']] for p in fwds]) >= 1  # Min 1 FWD
    prob += lpSum([starter_vars[p['id']] for p in fwds]) <= 3  # Max 3 FWD
    
    # Constraint 4: Max 3 players per team
    teams = set(p['team'] for p in valid_predictions)
    for team_id in teams:
        team_players = [p for p in valid_predictions if p['team'] == team_id]
        prob += lpSum([player_vars[p['id']] for p in team_players]) <= 3
    
    # Solve (suppress output)
    status = prob.solve(PULP_CBC_CMD(msg=0))
    
    # Check solver status
    if LpStatus[status] != 'Optimal':
        print(f"⚠️ LP Solver Warning: Status = {LpStatus[status]}")
        print(f"   Players >20% ownership available: {len(players_over_20_percent)}")
        print(f"   Players >40% ownership available: {len(players_over_40_percent)}")
        print(f"   Players >60% ownership available for captain: {len(players_over_60_percent)}")
    
    # Extract selected players, starters, bench, and captain
    selected_squad = []
    starters = []
    bench = []
    captain_id = None
    total_cost = 0
    
    for p in valid_predictions:
        if player_vars[p['id']].varValue == 1:
            selected_squad.append(p)
            total_cost += p['cost']
            
            # Check if this player is a starter
            if starter_vars[p['id']].varValue == 1:
                starters.append(p)
            else:
                # Player is in squad but not a starter, so they're on the bench
                bench.append(p)
            
            # Check if this player is the captain
            if captain_vars[p['id']].varValue == 1:
                captain_id = p['id']
    
    return selected_squad, total_cost, starters, bench, captain_id

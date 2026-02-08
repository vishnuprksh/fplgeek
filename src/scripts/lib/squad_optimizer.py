from pulp import LpMaximize, LpProblem, LpVariable, lpSum, LpBinary, PULP_CBC_CMD, LpStatus
from .fpl_utils import is_differential, should_bench_player

def get_best_starting_squad(predictions):
    """
    Global optimization for initial squad selection using Linear Programming.
    Maximizes total predicted points subject to FPL constraints.
    Enforces max 2 differential players (<10% ownership)
    Excludes injured/unavailable players
    """
    
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
    
    # Constraint: Captain must have 30%+ ownership
    template_captains = [p for p in valid_predictions if float(p.get('selected_by_percent', 0)) >= 30.0]
    prob += lpSum([captain_vars[p['id']] for p in template_captains]) >= 1
    
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
    
    # Constraint 5: Max 2 differential players (< 10% ownership) in squad
    differentials = [p for p in valid_predictions if is_differential(p)]
    prob += lpSum([player_vars[p['id']] for p in differentials]) <= 2
    
    # Constraint 6: Min 3 template players (>= 30% ownership) in STARTING XI
    template_players = [p for p in valid_predictions if float(p.get('selected_by_percent', 0)) >= 30.0]
    prob += lpSum([starter_vars[p['id']] for p in template_players]) >= 3
    
    # Solve (suppress output)
    status = prob.solve(PULP_CBC_CMD(msg=0))
    
    # Check solver status
    if LpStatus[status] != 'Optimal':
        print(f"⚠️ LP Solver Warning: Status = {LpStatus[status]}")
        print(f"   Template players available: {len(template_players)}")
        print(f"   Template captains available: {len(template_captains)}")
    
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

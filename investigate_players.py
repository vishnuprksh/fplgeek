
import json
import os

def load_json(path):
    with open(path, 'r') as f:
        return json.load(f)

def find_player(data, part_name):
    matches = []
    for p in data:
        name = p.get('name', '') or p.get('web_name', '')
        if part_name.lower() in name.lower():
            matches.append(p)
    return matches

def main():
    base_path = "public/data/processed"
    files = ["dataset_MID.json", "dataset_FWD.json"]
    
    players_of_interest = ["Gakpo", "Bruno G"]
    
    found_players = {}

    for f in files:
        path = os.path.join(base_path, f)
        if not os.path.exists(path):
            continue
            
        data = load_json(path)
        for search_term in players_of_interest:
            matches = find_player(data, search_term)
            # Filter for season 25/26 and highest GW
            season_matches = [m for m in matches if m.get('season') == '25/26']
            if season_matches:
                 # Sort by GW descending
                season_matches.sort(key=lambda x: x['gw'], reverse=True)
                latest = season_matches[0]
                
                # Store
                key = f"{search_term}_{latest['id']}"
                if key not in found_players:
                    found_players[key] = latest

    print("--- Player Data (Latest GW) ---")
    for key, p in found_players.items():
        print(f"Name: {p['name']}")
        print(f"ID: {p['id']}")
        print(f"GW: {p['gw']}")
        print(f"Season: {p['season']}")
        print(f"Opponent Strength (ctx_opponent): {p.get('ctx_opponent')}")
        print(f"Difficulty (ctx_difficulty): {p.get('ctx_difficulty')}")
        print(f"Price (ctx_price): {p.get('ctx_price')}")
        print(f"Was Home (ctx_was_home): {p.get('ctx_was_home')}")
        print(f"History Sequence (Last 5 Form):")
        # History sequence is likely a list of lists or list of dicts. 
        # ai_manager.py: X_seq = np.array([d['history_sequence'] for d in samples]
        # It seems to be raw numbers or vectors.
        seq = p.get('history_sequence')
        print(json.dumps(seq, indent=2))
        print("-" * 20)

    # Predictions
    pred_path = "public/data/ai_predictions.json"
    if os.path.exists(pred_path):
        preds = load_json(pred_path)
        # Convert list to dict for lookup
        if isinstance(preds, list):
            preds_map = {str(p['id']): p for p in preds}
        else:
            preds_map = preds
            
        print("\n--- Predictions ---")
        for key, p in found_players.items():
            pid = str(p['id'])
            if pid in preds_map:
                print(f"Player: {p['name']} (ID: {pid})")
                print(json.dumps(preds_map[pid], indent=2))
            else:
                print(f"No predictions for {p['name']} (ID: {pid})")

if __name__ == "__main__":
    main()

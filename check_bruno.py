import json

with open('public/data/processed/dataset_MID.json') as f:
    mid_data = json.load(f)

bruno_samples = [s for s in mid_data if 'B.Fernandes' == s['name'] and s['is_future']]

if len(bruno_samples) > 0:
    first_future = bruno_samples[0]
    hist = first_future['history_sequence']
    print(f"Found {len(hist)} historical games for {first_future['name']} in the sequence:")
    valid_games = [g for g in hist if g[0] > 0] # g[0] is minutes
    print(f"Found {len(valid_games)} valid games (minutes > 0)")
    
    # We want the L10 average. Since hist is oldest-to-newest, the most recent are at the END.
    l10_games = valid_games[-10:] # L10 should be the LAST 10 valid games!
    print("\nL10 Valid Games (Oldest to newest inside the L10 window):")
    total_pts = 0
    for i, g in enumerate(l10_games):
        mins = g[0]
        pts = g[11] # g[11] is total_points
        total_pts += pts
        print(f"Game {i+1}: Mins={mins}, Pts={pts}")
        
    print(f"\nTotal Points in L10: {total_pts}")
    print(f"Average: {total_pts} / {len(l10_games)} = {total_pts / len(l10_games):.2f}")
else:
    print("No B.Fernandes found")

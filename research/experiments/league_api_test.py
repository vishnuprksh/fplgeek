import requests
import json
import time

def get_league_standings(league_id, page=1):
    url = f"https://fantasy.premierleague.com/api/leagues-classic/{league_id}/standings/?page_standings={page}"
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    else:
        print(f"Error fetching league {league_id} page {page}: {response.status_code}")
        return None

def get_team_picks(entry_id, gw):
    url = f"https://fantasy.premierleague.com/api/entry/{entry_id}/event/{gw}/picks/"
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    else:
        print(f"Error fetching picks for team {entry_id} GW {gw}: {response.status_code}")
        return None

def test_api():
    # Test with a sample public league ID (e.g., a large general league or a small random one)
    # 314 is often a generic league, or we can try a few.
    # Let's try 314 (Overall). It might be too big, but let's see the structure.
    # Actually, let's use a smaller ID that might be valid, or just prompt.
    # For automated test, let's try to fetch a known public league.
    # League 1 is usually "Overall"
    league_id = 314 
    
    print(f"Fetching standings for League {league_id}...")
    standings = get_league_standings(league_id)
    
    if standings:
        print("League Name:", standings['league']['name'])
        results = standings['standings']['results']
        print(f"Found {len(results)} teams on page 1")
        
        if results:
            first_team = results[0]
            entry_id = first_team['entry']
            entry_name = first_team['entry_name']
            player_name = first_team['player_name']
            
            print(f"\nFirst Team: {entry_name} ({player_name}), ID: {entry_id}")
            
            # Fetch picks for GW 1
            print(f"Fetching picks for GW 1 for team {entry_id}...")
            picks = get_team_picks(entry_id, 1)
            if picks:
                print("Picks data found:")
                for pick in picks['picks'][:3]: # Show first 3 picks
                    print(f"- Player ID: {pick['element']}, Multiplier: {pick['multiplier']}")
            
            # Fetch picks for Current GW (let's assume 20 for now, or fetch from bootstrap)
            # We won't fetch bootstrap here to keep it simple, just try GW 1.

if __name__ == "__main__":
    test_api()

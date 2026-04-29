import requests
import json
import time
import os
import concurrent.futures
from typing import Any, Dict, List, Optional

LEAGUE_ID = 314
_DATA_ROOT = os.environ.get('FPL_DATA_DIR', os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../data')))
DATA_FILE = os.path.join(_DATA_ROOT, 'league_analysis.json')

def fetch_data(url: str) -> Optional[Dict[str, Any]]:
    headers = {
        'User-Agent': 'Mozilla/5.0'
    }
    for _ in range(3):
        try:
            response = requests.get(url, headers=headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error fetching {url}: {e}")
            time.sleep(1)
    return None

def fetch_picks(entry_id: int, gw: int) -> Optional[Dict[str, Any]]:
    picks_url = f"https://fantasy.premierleague.com/api/entry/{entry_id}/event/{gw}/picks/"
    return fetch_data(picks_url)

def main():
    print("Fetching bootstrap-static data...")
    bootstrap = fetch_data("https://fantasy.premierleague.com/api/bootstrap-static/")
    if not bootstrap:
        print("Failed to fetch bootstrap data.")
        return

    elements = {el['id']: f"{el['web_name']} ({next((t['short_name'] for t in bootstrap['teams'] if t['id'] == el['team']), '')})" for el in bootstrap['elements']}
    
    current_gw: int = 1
    for event in bootstrap['events']:
        if event['is_current']:
            current_gw = int(event['id'])
            break
        if event['is_next']:
            current_gw = int(event['id']) - 1
            break
            
    print(f"Current GW identified as: {current_gw}")

    print(f"Fetching standings for League {LEAGUE_ID}...")
    standings_url = f"https://fantasy.premierleague.com/api/leagues-classic/{LEAGUE_ID}/standings/"
    standings_data = fetch_data(standings_url)
    
    if not standings_data or 'standings' not in standings_data:
        print("Failed to fetch standings data.")
        return
        
    entries: List[int] = []
    page: int = 1
    while isinstance(standings_data, dict) and 'standings' in standings_data:
        results = standings_data['standings'].get('results', [])
        entries.extend([int(result['entry']) for result in results])
        if len(entries) >= 100 or not standings_data['standings'].get('has_next', False):
            break
        page = int(str(page)) + 1
        standings_data = fetch_data(f"https://fantasy.premierleague.com/api/leagues-classic/{LEAGUE_ID}/standings/?page_new_entries=1&page_standings={page}")
        
    unique_entries = list(set(entries))
    top_entries: List[int] = []
    for i, e in enumerate(unique_entries):
        if i >= 100:
            break
        top_entries.append(e)
    total_managers = len(top_entries)
    print(f"Found {total_managers} managers in the top.")

    history: List[Dict[str, Any]] = []

    for gw in range(1, int(current_gw) + 1):
        print(f"Processing GW {gw}...")
        player_stats: Dict[int, Dict[str, int]] = {} # element_id -> {'count': int, 'eo_sum': int}
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
            future_to_entry: Dict[concurrent.futures.Future, int] = {
                executor.submit(fetch_picks, entry_id, gw): entry_id  # type: ignore
                for entry_id in top_entries
            }
            
            completed = 0
            for future in concurrent.futures.as_completed(future_to_entry):
                picks_data = future.result()
                completed += 1
                
                if completed % 25 == 0:
                    print(f"  ...fetched {completed}/{total_managers} teams for GW {gw}")
                    
                if not isinstance(picks_data, dict) or 'picks' not in picks_data:
                    continue
                    
                picks_list = picks_data.get('picks', [])
                for pick in picks_list:
                    if not isinstance(pick, dict):
                        continue
                    element_id = int(pick.get('element', 0))
                    multiplier = int(pick.get('multiplier', 0))
                    
                    stats = player_stats.get(element_id, {'count': 0, 'eo_sum': 0})
                    stats['count'] += 1
                    stats['eo_sum'] += multiplier
                    player_stats[element_id] = stats
                
        # Transform and sort
        top_owned = []
        for element_id, stats in player_stats.items():
            if stats['count'] > 0:
                top_owned.append({
                    "id": element_id,
                    "name": elements.get(element_id, "Unknown"),
                    "count": stats['count'],
                    "percent": (stats['count'] / total_managers) * 100,
                    "effective_ownership": (stats['eo_sum'] / total_managers) * 100
                })
                
        # Sort by effective ownership desc, then count desc
        top_owned.sort(key=lambda x: (x['effective_ownership'], x['count']), reverse=True)
        
        history.append({
            "gw": gw,
            "top_owned": top_owned
        })

    output = {
        "league_id": LEAGUE_ID,
        "total_teams_analyzed": total_managers,
        "history": history
    }
    
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, 'w') as f:
        json.dump(output, f, indent=2)
        
    print(f"Saved data to {DATA_FILE}")

if __name__ == "__main__":
    main()

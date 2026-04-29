"""
Update current season (2025/26) player gameweek data from FPL API.

This script:
1. Fetches bootstrap-static to get all players and current GW
2. For each player, fetches their element-summary (history)
3. Filters to only 2025/26 season data (fixture_id > 0)
4. Updates player_history table with latest GW data
5. Updates players table with latest stats

Run from project root:
    python3 backend/scripts/update_current_gw.py
"""

import sqlite3
import json
import requests
import os
import sys
import time
from typing import Dict, List, Any, Optional

_DATA_ROOT = os.environ.get(
    'FPL_DATA_DIR',
    os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../data'))
)
DB_PATH = os.path.join(_DATA_ROOT, 'fpl.sqlite')

API_BASE = "https://fantasy.premierleague.com/api"
BOOTSTRAP_URL = f"{API_BASE}/bootstrap-static/"
ELEMENT_SUMMARY_URL = f"{API_BASE}/element-summary"

HEADERS = {'User-Agent': 'Mozilla/5.0'}
MAX_RETRIES = 3
RETRY_DELAY = 2


def fetch_json(url: str) -> Optional[Dict[str, Any]]:
    """Fetch JSON from URL with retry logic."""
    for attempt in range(MAX_RETRIES):
        try:
            response = requests.get(url, headers=HEADERS, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            if attempt < MAX_RETRIES - 1:
                print(f"  ⚠️  Attempt {attempt + 1} failed: {e}. Retrying in {RETRY_DELAY}s...")
                time.sleep(RETRY_DELAY)
            else:
                print(f"  ❌ Failed after {MAX_RETRIES} attempts: {e}")
                return None
    return None


def get_current_gw(bootstrap: Dict[str, Any]) -> int:
    """Identify the current gameweek."""
    for event in bootstrap.get('events', []):
        if event.get('is_current'):
            return int(event['id'])
        if event.get('is_next'):
            return int(event['id']) - 1
    return 1


def update_current_season():
    """Fetch and update current season (2025/26) player data."""
    print("=== Updating Current Season (2025/26) Player Data ===\n")

    # 1. Fetch bootstrap to get players and current GW
    print("📥 Fetching bootstrap-static...")
    bootstrap = fetch_json(BOOTSTRAP_URL)
    if not bootstrap:
        print("❌ Failed to fetch bootstrap data")
        return False

    current_gw = get_current_gw(bootstrap)
    print(f"✓ Current GW: {current_gw}")

    elements = bootstrap.get('elements', [])
    teams = {t['id']: t['short_name'] for t in bootstrap.get('teams', [])}
    
    print(f"✓ Total players: {len(elements)}")

    # 2. Connect to DB
    if not os.path.exists(DB_PATH):
        print(f"❌ Database not found at {DB_PATH}")
        return False

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 3. Fetch and update each player's data
    print(f"\n📊 Fetching gameweek data for all players...")
    updated_count = 0
    failed_count = 0
    skipped_count = 0

    for idx, player in enumerate(elements):
        player_id = int(player['id'])
        
        if (idx + 1) % 50 == 0:
            print(f"  Progress: {idx + 1}/{len(elements)} ({(idx + 1) / len(elements) * 100:.1f}%)")
        
        # Fetch player's history
        summary_url = f"{ELEMENT_SUMMARY_URL}/{player_id}/"
        summary = fetch_json(summary_url)
        
        if not summary:
            failed_count += 1
            continue
        
        # Extract fixtures (current season only - fixture_id > 0)
        fixtures = summary.get('history', [])
        if not fixtures:
            skipped_count += 1
            continue
        
        # Filter to current season only (fixture_id > 0 means 2025/26)
        current_season_fixtures = [f for f in fixtures if f.get('fixture') and int(f['fixture']) > 0]
        
        if not current_season_fixtures:
            skipped_count += 1
            continue
        
        # Insert each fixture into player_history
        insert_count = 0
        for fixture in current_season_fixtures:
            fixture_id = int(fixture['fixture'])
            gw = int(fixture.get('round', 0))
            
            # Build fixture data
            fixture_data = {
                'round': gw,
                'total_points': int(fixture.get('total_points', 0)),
                'minutes': int(fixture.get('minutes', 0)),
                'goals_scored': int(fixture.get('goals_scored', 0)),
                'assists': int(fixture.get('assists', 0)),
                'clean_sheets': int(fixture.get('clean_sheets', 0)),
                'goals_conceded': int(fixture.get('goals_conceded', 0)),
                'own_goals': int(fixture.get('own_goals', 0)),
                'penalties_saved': int(fixture.get('penalties_saved', 0)),
                'penalties_missed': int(fixture.get('penalties_missed', 0)),
                'yellow_cards': int(fixture.get('yellow_cards', 0)),
                'red_cards': int(fixture.get('red_cards', 0)),
                'saves': int(fixture.get('saves', 0)),
                'bonus': int(fixture.get('bonus', 0)),
                'bps': int(fixture.get('bps', 0)),
                'was_home': bool(fixture.get('was_home', False)),
                'opponent_team': int(fixture.get('opponent_team', 0)),
                'value': float(fixture.get('value', 0)) / 10.0,
                'expected_goals': str(fixture.get('expected_goals', 0)),
                'expected_assists': str(fixture.get('expected_assists', 0)),
                'expected_goal_involvements': str(fixture.get('expected_goal_involvements', 0)),
                'expected_goals_conceded': str(fixture.get('expected_goals_conceded', 0)),
                'influence': str(fixture.get('influence', 0)),
                'creativity': str(fixture.get('creativity', 0)),
                'threat': str(fixture.get('threat', 0)),
                'ict_index': str(fixture.get('ict_index', 0)),
                'starts': int(fixture.get('starts', 0)),
                'team_h_score': fixture.get('team_h_score'),
                'team_a_score': fixture.get('team_a_score'),
                'selected': int(fixture.get('selected', 0)),
                'selected_by_percent': str(fixture.get('selected_by_percent', '0')),
                'transfers_in': int(fixture.get('transfers_in', 0)),
                'transfers_out': int(fixture.get('transfers_out', 0)),
                'kickoff_time': fixture.get('kickoff_time', ''),
            }
            
            # Insert/update player_history
            cur.execute(
                "INSERT OR REPLACE INTO player_history (player_id, fixture_id, data) VALUES (?, ?, ?)",
                (player_id, fixture_id, json.dumps(fixture_data))
            )
            insert_count += 1
        
        if insert_count > 0:
            updated_count += 1
    
    # 4. Update players table with latest stats
    print(f"\n📝 Updating players table...")
    update_count = 0
    
    for idx, player in enumerate(elements):
        player_id = int(player['id'])
        
        if (idx + 1) % 50 == 0:
            print(f"  Progress: {idx + 1}/{len(elements)}")
        
        # Get current player data from DB
        cur.execute("SELECT data FROM players WHERE id = ?", (player_id,))
        result = cur.fetchone()
        
        if not result:
            continue
        
        player_data = json.loads(result[0])
        
        # Update with latest API data
        player_data.update({
            'first_name': player.get('first_name', ''),
            'second_name': player.get('second_name', ''),
            'web_name': player.get('web_name', ''),
            'status': player.get('status', ''),
            'news': player.get('news', ''),
            'chance_of_playing_this_round': player.get('chance_of_playing_this_round'),
            'chance_of_playing_next_round': player.get('chance_of_playing_next_round'),
            'value_form': float(player.get('value_form', 0)),
            'selected_by_percent': str(player.get('selected_by_percent', 0)),
            'event_points': int(player.get('event_points', 0)),
            'season_points': int(player.get('season_points', 0)),
            'total_points': int(player.get('total_points', 0)),
            'minutes': int(player.get('minutes', 0)),
            'goals_scored': int(player.get('goals_scored', 0)),
            'assists': int(player.get('assists', 0)),
            'clean_sheets': int(player.get('clean_sheets', 0)),
            'goals_conceded': int(player.get('goals_conceded', 0)),
            'own_goals': int(player.get('own_goals', 0)),
            'penalties_saved': int(player.get('penalties_saved', 0)),
            'penalties_missed': int(player.get('penalties_missed', 0)),
            'yellow_cards': int(player.get('yellow_cards', 0)),
            'red_cards': int(player.get('red_cards', 0)),
            'saves': int(player.get('saves', 0)),
            'influence': str(player.get('influence', 0)),
            'creativity': str(player.get('creativity', 0)),
            'threat': str(player.get('threat', 0)),
            'bonus': int(player.get('bonus', 0)),
            'bps': int(player.get('bps', 0)),
        })
        
        cur.execute(
            "UPDATE players SET data = ? WHERE id = ?",
            (json.dumps(player_data), player_id)
        )
        update_count += 1
    
    # 4b. Refresh events, teams, element_types from latest bootstrap
    print(f"\n📝 Refreshing events, teams, element_types...")
    events = bootstrap.get('events', [])
    teams_list = bootstrap.get('teams', [])
    element_types_list = bootstrap.get('element_types', [])

    cur.execute("INSERT OR REPLACE INTO events (id, data) VALUES ('events', ?)", (json.dumps(events),))
    cur.execute("INSERT OR REPLACE INTO teams (id, data) VALUES ('teams', ?)", (json.dumps(teams_list),))
    cur.execute("INSERT OR REPLACE INTO element_types (id, data) VALUES ('element_types', ?)", (json.dumps(element_types_list),))
    print(f"✓ Events, teams, element_types refreshed")

    conn.commit()
    conn.close()

    # 5. Summary
    print(f"\n=== Update Complete ===")
    print(f"✓ Players updated: {updated_count}")
    print(f"✓ Players data refreshed: {update_count}")
    print(f"⚠️  Failed to fetch: {failed_count}")
    print(f"⚠️  Skipped (no current season data): {skipped_count}")
    print(f"\n✓ Data now current through GW {current_gw}")
    
    return True


if __name__ == "__main__":
    success = update_current_season()
    sys.exit(0 if success else 1)

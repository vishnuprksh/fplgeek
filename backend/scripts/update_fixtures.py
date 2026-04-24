"""
Update fixtures database with latest FPL API data.

This script:
1. Fetches bootstrap-static to get all fixtures
2. Fetches each fixture's details to get live scores
3. Updates fixtures table in SQLite

Run from project root:
    python3 backend/scripts/update_fixtures.py

Or with environment variable:
    FPL_DATA_DIR=/path/to/data python3 backend/scripts/update_fixtures.py
"""

import sqlite3
import json
import requests
import os
import sys
from typing import Dict, List, Any, Optional

_DATA_ROOT = os.environ.get(
    'FPL_DATA_DIR',
    os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../data'))
)
DB_PATH = os.path.join(_DATA_ROOT, 'fpl.sqlite')

API_BASE = "https://fantasy.premierleague.com/api"
BOOTSTRAP_URL = f"{API_BASE}/bootstrap-static/"
FIXTURE_URL = f"{API_BASE}/fixtures/"

HEADERS = {'User-Agent': 'Mozilla/5.0'}


def fetch_json(url: str) -> Optional[Dict[str, Any]]:
    """Fetch JSON from URL."""
    try:
        response = requests.get(url, headers=HEADERS, timeout=30)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"  ❌ Error fetching {url}: {e}")
        return None


def update_fixtures():
    """Fetch and update fixtures from FPL API."""
    print("=== Updating Fixtures Database ===\n")

    # 1. Fetch bootstrap to get fixture list
    print("📥 Fetching fixtures from API...")
    fixtures_data = fetch_json(FIXTURE_URL)
    
    if not fixtures_data:
        print("❌ Failed to fetch fixtures")
        return False

    if isinstance(fixtures_data, list):
        fixtures = fixtures_data
    else:
        fixtures = fixtures_data.get('fixtures', [])
    
    print(f"✓ Fetched {len(fixtures)} fixtures")

    # 2. Connect to DB
    if not os.path.exists(DB_PATH):
        print(f"❌ Database not found at {DB_PATH}")
        return False

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 3. Ensure fixtures table exists
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fixtures (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL
        )
    """)

    # 4. Clear and update fixtures table
    print(f"\n📝 Updating fixtures table...")
    cur.execute("DELETE FROM fixtures")

    fixture_count = 0
    for idx, fixture in enumerate(fixtures):
        if (idx + 1) % 100 == 0:
            print(f"  Progress: {idx + 1}/{len(fixtures)}")

        fixture_id = int(fixture['id'])
        fixture_data = {
            'id': fixture_id,
            'event': fixture.get('event'),
            'team_h': fixture.get('team_h'),
            'team_a': fixture.get('team_a'),
            'team_h_score': fixture.get('team_h_score'),
            'team_a_score': fixture.get('team_a_score'),
            'finished': fixture.get('finished'),
            'started': fixture.get('started'),
            'kickoff_time': fixture.get('kickoff_time'),
            'team_h_difficulty': fixture.get('team_h_difficulty'),
            'team_a_difficulty': fixture.get('team_a_difficulty'),
            'pulse_id': fixture.get('pulse_id'),
            'provisional_start_time': fixture.get('provisional_start_time'),
            'minutes': fixture.get('minutes'),
            'code': fixture.get('code'),
            'stats': fixture.get('stats', []),
        }

        cur.execute(
            "INSERT INTO fixtures (id, data) VALUES (?, ?)",
            (fixture_id, json.dumps(fixture_data))
        )
        fixture_count += 1

    conn.commit()
    conn.close()

    # 5. Summary
    print(f"\n✓ Updated {fixture_count} fixtures")
    print("\n=== Complete ===")
    
    return True


if __name__ == "__main__":
    success = update_fixtures()
    sys.exit(0 if success else 1)

"""
Export fixtures from SQLite database to JSON format for frontend.

Run from project root:
    python3 backend/scripts/export_fixtures.py
"""

import sqlite3
import json
import os
import sys
from typing import List, Dict, Any

_DATA_ROOT = os.environ.get(
    'FPL_DATA_DIR',
    os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../data'))
)
DB_PATH = os.path.join(_DATA_ROOT, 'fpl.sqlite')
OUTPUT_FILE = os.path.join(_DATA_ROOT, 'fixtures.json')


def export_fixtures():
    """Export fixtures from SQLite to JSON."""
    print("=== Exporting Fixtures to JSON ===\n")

    if not os.path.exists(DB_PATH):
        print(f"❌ Database not found at {DB_PATH}")
        return False

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Query all fixtures
    print("📥 Querying fixtures from database...")
    cur.execute("SELECT data FROM fixtures ORDER BY id")
    rows = cur.fetchall()
    conn.close()

    if not rows:
        print("⚠️  No fixtures found in database")
        return False

    # Parse JSON data
    fixtures: List[Dict[str, Any]] = []
    for row in rows:
        fixture = json.loads(row[0])
        fixtures.append(fixture)

    # Save to JSON
    print(f"📝 Saving {len(fixtures)} fixtures...")
    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(fixtures, f, indent=2)

    print(f"✓ Fixtures exported to {OUTPUT_FILE}")
    
    # Summary
    finished = sum(1 for f in fixtures if f.get('finished'))
    upcoming = sum(1 for f in fixtures if not f.get('finished') and f.get('kickoff_time'))
    
    print(f"\n📊 Fixture Summary:")
    print(f"  Total: {len(fixtures)}")
    print(f"  Finished: {finished}")
    print(f"  Upcoming: {upcoming}")
    
    return True


if __name__ == "__main__":
    success = export_fixtures()
    sys.exit(0 if success else 1)

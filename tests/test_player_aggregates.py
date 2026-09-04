"""
Test script: verify that each player's aggregated per-gameweek history
(stored in data/fpl.sqlite `player_history`) matches the season totals
from the FPL official API (stored in the `players` table via
/bootstrap-static/).

Offline only — reads entirely from the local SQLite database.

Usage:
    python3 tests/test_player_aggregates.py              # check all players
    python3 tests/test_player_aggregates.py --verbose    # print every player
    python3 tests/test_player_aggregates.py --player 233 # check one player

Also runnable under pytest:
    pytest tests/
"""

import argparse
import json
import os
import sqlite3
import sys

# Resolve the data dir the same way backend/scripts/fetch_data.py does.
DATA_DIR = os.environ.get(
    'FPL_DATA_DIR',
    os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'data')),
)
DB_PATH = os.path.join(DATA_DIR, 'fpl.sqlite')

# Fields compared: summed per-GW history vs bootstrap season totals.
CHECKED_FIELDS = ['total_points', 'minutes']


def dedup_current_season_history(rows):
    """Filter and deduplicate player_history rows to current-season matches.

    Replicates frontend/src/services/sqliteService.ts merge logic:
    - Historical seasons are stored with negative fixture_id and carry a
      `season_name` key in the JSON — exclude them.
    - Current-season matches can exist twice (positive fixture_id from the
      FPL API fetch and negative fixture_id from historical ingestion), so
      dedup by kickoff_time, keeping one row per match.
    """
    seen = set()
    deduped = []
    for data in rows:
        item = json.loads(data)
        if 'season_name' in item:
            continue
        key = item.get('kickoff_time') or str(item.get('fixture_id'))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def load_season_totals(conn, player_id=None):
    """Return {player_id: {'name': str, 'totals': {field: int}}}."""
    query = "SELECT id, data FROM players"
    params = ()
    if player_id is not None:
        query += " WHERE id = ?"
        params = (player_id,)
    totals = {}
    for pid, data in conn.execute(query, params):
        d = json.loads(data)
        totals[pid] = {
            'name': d.get('web_name', str(pid)),
            'totals': {f: int(d.get(f, 0) or 0) for f in CHECKED_FIELDS},
        }
    return totals


def load_history_by_player(conn, player_id=None):
    """Return {player_id: [deduped current-season history dicts]}."""
    query = "SELECT player_id, data FROM player_history"
    params = ()
    if player_id is not None:
        query += " WHERE player_id = ?"
        params = (player_id,)
    grouped = {}
    for pid, data in conn.execute(query, params):
        grouped.setdefault(pid, []).append(data)
    return {pid: dedup_current_season_history(rows) for pid, rows in grouped.items()}


def check_player_aggregates(db_path=DB_PATH, player_id=None, verbose=False):
    """Compare summed history to season totals. Returns list of mismatch dicts."""
    if not os.path.exists(db_path):
        raise FileNotFoundError(
            f"Database not found at {db_path}. "
            "Set FPL_DATA_DIR or run 'npm run update:data' first."
        )

    conn = sqlite3.connect(db_path)
    try:
        totals = load_season_totals(conn, player_id)
        history = load_history_by_player(conn, player_id)
    finally:
        conn.close()

    mismatches = []
    for pid in sorted(totals):
        info = totals[pid]
        rows = history.get(pid, [])
        aggregates = {f: sum(int(r.get(f, 0) or 0) for r in rows) for f in CHECKED_FIELDS}

        if verbose or player_id is not None:
            print(f"  [{pid}] {info['name']}: {aggregates} vs {info['totals']} "
                  f"({len(rows)} GW rows)")

        for field in CHECKED_FIELDS:
            if aggregates[field] != info['totals'][field]:
                mismatches.append({
                    'player_id': pid,
                    'name': info['name'],
                    'field': field,
                    'aggregate': aggregates[field],
                    'season_total': info['totals'][field],
                })

    return mismatches


def print_report(mismatches, total_checked):
    print(f"\nChecked {total_checked} players against season totals.")
    if not mismatches:
        print("PASS: all player aggregates match season totals.")
        return 0

    print(f"FAIL: {len(mismatches)} mismatch(es) found:")
    for m in mismatches:
        print(f"  [{m['player_id']}] {m['name']}: {m['field']} "
              f"aggregate={m['aggregate']} vs season total={m['season_total']} "
              f"(diff={m['aggregate'] - m['season_total']})")
    print("\nHint: run 'npm run update:data' to refresh the local database, "
          "then re-run this test.")
    return 1


def main():
    parser = argparse.ArgumentParser(
        description="Verify player aggregate history matches FPL season totals."
    )
    parser.add_argument('--player', type=int, default=None,
                        help='Check a single player by FPL element id')
    parser.add_argument('--verbose', action='store_true',
                        help='Print every player, not just mismatches')
    args = parser.parse_args()

    mismatches = check_player_aggregates(player_id=args.player, verbose=args.verbose)
    checked = 1 if args.player is not None else None
    if checked is None:
        conn = sqlite3.connect(DB_PATH)
        try:
            checked = conn.execute("SELECT COUNT(*) FROM players").fetchone()[0]
        finally:
            conn.close()
    sys.exit(print_report(mismatches, checked))


# pytest entry point
def test_player_aggregates_match_season_totals():
    mismatches = check_player_aggregates()
    assert not mismatches, (
        "Player aggregates do not match season totals:\n"
        + "\n".join(
            f"  [{m['player_id']}] {m['name']}: {m['field']} "
            f"aggregate={m['aggregate']} vs season total={m['season_total']}"
            for m in mismatches
        )
    )


if __name__ == '__main__':
    main()

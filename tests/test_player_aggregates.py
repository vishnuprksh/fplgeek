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
import time
import urllib.request

# Resolve the data dir the same way backend/scripts/fetch_data.py does.
DATA_DIR = os.environ.get(
    'FPL_DATA_DIR',
    os.path.normpath(os.path.join(os.path.dirname(__file__), '..', 'data')),
)
DB_PATH = os.path.join(DATA_DIR, 'fpl.sqlite')

FPL_API = "https://fantasy.premierleague.com/api"
FPL_HEADERS = {'User-Agent': 'Mozilla/5.0'}

# Fields compared: summed per-GW history vs season totals.
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


def fetch_json(url, retries=3):
    """Minimal GET-json helper for the opt-in live API checks."""
    for _ in range(retries):
        try:
            with urllib.request.urlopen(
                urllib.request.Request(url, headers=FPL_HEADERS), timeout=30
            ) as r:
                return json.loads(r.read().decode('utf-8'))
        except Exception as e:
            print(f"  retry {url}: {e}")
            time.sleep(1)
    return None


def check_historic_seasons(db_path=DB_PATH, player_id=None, sample=None,
                           verbose=False):
    """Compare summed historic per-GW history to the FPL API `history_past`
    season totals. Requires live API access (historic totals are not stored
    locally). Rate-limited with a small sleep between requests."""
    if not os.path.exists(db_path):
        raise FileNotFoundError(
            f"Database not found at {db_path}. "
            "Set FPL_DATA_DIR or run 'npm run update:data' first."
        )

    conn = sqlite3.connect(db_path)
    try:
        # Player id -> element code, needed to match CSV-derived historic rows.
        # Historic rows are keyed by element_code in the ingestion CSVs, but
        # our player_history rows were already mapped to player ids by
        # fetch_data.py, so we only need player ids here.
        ids = []
        for pid, data in conn.execute("SELECT id, data FROM players"):
            d = json.loads(data)
            ids.append((pid, d.get('web_name', str(pid))))
    finally:
        conn.close()

    if player_id is not None:
        ids = [(pid, name) for pid, name in ids if pid == player_id]
    else:
        # Only players that actually have historic rows in the DB.
        conn = sqlite3.connect(db_path)
        try:
            with_hist = {r[0] for r in conn.execute(
                "SELECT DISTINCT player_id FROM player_history WHERE fixture_id < 0")}
        finally:
            conn.close()
        ids = [(pid, name) for pid, name in ids if pid in with_hist]
        if sample is not None:
            ids = ids[:sample]

    mismatches = []
    checked = 0
    for i, (pid, name) in enumerate(ids):
        if (i + 1) % 50 == 0:
            print(f"  {i + 1}/{len(ids)}")
        summary = fetch_json(f"{FPL_API}/element-summary/{pid}/")
        if not summary:
            print(f"  [WARN] could not fetch element-summary for {pid} ({name})")
            continue
        time.sleep(0.1)  # be gentle with the API

        conn = sqlite3.connect(db_path)
        try:
            rows = [json.loads(r[0]) for r in conn.execute(
                "SELECT data FROM player_history WHERE player_id=? AND fixture_id < 0",
                (pid,))]
        finally:
            conn.close()
        if not rows:
            continue

        # Group DB rows by season, dedup by (season, kickoff_time).
        db_seasons = {}
        seen = set()
        for item in rows:
            season = item.get('season_name')
            if not season:
                continue
            key = (season, item.get('kickoff_time'))
            if key in seen:
                continue
            seen.add(key)
            db_seasons.setdefault(season, []).append(item)

        # API history_past: map season_name -> totals. Only compare seasons
        # present in both sources.
        api_seasons = {s['season_name']: s for s in summary.get('history_past', [])}
        for season, gw_rows in sorted(db_seasons.items()):
            api = api_seasons.get(season)
            if api is None:
                if verbose:
                    print(f"  [{pid}] {name}: {season} not in API history_past, skipped")
                continue
            checked += 1
            aggregates = {f: sum(int(r.get(f, 0) or 0) for r in gw_rows)
                          for f in CHECKED_FIELDS}
            if verbose or player_id is not None:
                print(f"  [{pid}] {name} {season}: {aggregates} vs "
                      f"{dict(api_seasons[season]) and {f: int(api[f]) for f in CHECKED_FIELDS}} "
                      f"({len(gw_rows)} GW rows)")
            for field in CHECKED_FIELDS:
                if aggregates[field] != int(api[field]):
                    mismatches.append({
                        'player_id': pid,
                        'name': name,
                        'season': season,
                        'field': field,
                        'aggregate': aggregates[field],
                        'season_total': int(api[field]),
                    })

    return mismatches, checked, len(ids)


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
    parser.add_argument('--historic', action='store_true',
                        help='Also check historic seasons (2023/24, 2024/25) '
                             'against the live FPL API history_past totals '
                             '(network required, ~0.1s/request)')
    parser.add_argument('--sample', type=int, default=None,
                        help='With --historic: only check the first N players')
    args = parser.parse_args()

    mismatches = check_player_aggregates(player_id=args.player, verbose=args.verbose)
    checked = 1 if args.player is not None else None
    if checked is None:
        conn = sqlite3.connect(DB_PATH)
        try:
            checked = conn.execute("SELECT COUNT(*) FROM players").fetchone()[0]
        finally:
            conn.close()
    code = print_report(mismatches, checked)

    if args.historic:
        print("\n--- Historic seasons (live API history_past) ---")
        h_mismatches, h_checked, h_players = check_historic_seasons(
            player_id=args.player, sample=args.sample, verbose=args.verbose)
        print(f"\nChecked {h_checked} season comparisons across {h_players} players.")
        if not h_mismatches:
            print("PASS: all historic season aggregates match history_past totals.")
        else:
            code = 1
            print(f"FAIL: {len(h_mismatches)} historic mismatch(es):")
            for m in h_mismatches:
                print(f"  [{m['player_id']}] {m['name']} {m['season']}: {m['field']} "
                      f"aggregate={m['aggregate']} vs history_past={m['season_total']} "
                      f"(diff={m['aggregate'] - m['season_total']})")

    sys.exit(code)


# pytest entry point (offline only — historic check requires --historic CLI flag)
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

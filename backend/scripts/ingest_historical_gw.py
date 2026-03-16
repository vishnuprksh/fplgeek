"""
Historical per-game ingestion for 2023/24 and 2024/25 seasons.

Strategy:
  - For each season, fetch players_raw.csv to get element_id -> permanent code mapping.
  - Fetch merged_gw.csv for per-game rows (has kickoff_time).
  - Match to DB players via the permanent `code` field (stable across seasons).
  - Insert into player_history with negative fixture_id to avoid collisions.
    fixture_id = -(season_start_year * 100000 + csv_fixture_id)

Run from project root:
    python3 backend/scripts/ingest_historical_gw.py

Or using update_data.sh:
    bash scripts/update_data.sh
"""

import sqlite3
import json
import csv
import io
import urllib.request
import os
import sys

import os as _os
_DATA_ROOT = _os.environ.get('FPL_DATA_DIR', _os.path.normpath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), '../../data')))
DB_PATH = _os.path.join(_DATA_ROOT, 'fpl.sqlite')

SEASONS = [
    {
        "name": "2023/24",
        "year": 2023,
        "gw_url": "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2023-24/gws/merged_gw.csv",
        "players_url": "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2023-24/players_raw.csv",
    },
    {
        "name": "2024/25",
        "year": 2024,
        "gw_url": "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2024-25/gws/merged_gw.csv",
        "players_url": "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2024-25/players_raw.csv",
    },
]


def fetch_csv(url: str) -> list[dict]:
    print(f"  Fetching: {url}")
    with urllib.request.urlopen(url, timeout=30) as r:
        content = r.read().decode("utf-8")
    reader = csv.DictReader(io.StringIO(content))
    return list(reader)


def main():
    if not os.path.exists(DB_PATH):
        print(f"ERROR: DB not found at {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Build permanent_code -> db_player_id map from current DB
    print("Building code -> player_id map from DB...")
    cur.execute("SELECT id, data FROM players")
    code_to_db_id: dict[int, int] = {}
    for row in cur.fetchall():
        d = json.loads(row[1])
        code = d.get("code")
        if code is not None:
            code_to_db_id[int(code)] = row[0]
    print(f"  {len(code_to_db_id)} players mapped by code.")

    insert_q = "INSERT OR REPLACE INTO player_history (player_id, fixture_id, data) VALUES (?, ?, ?)"

    total_inserted = 0
    total_missed = 0

    for season in SEASONS:
        print(f"\n=== Season: {season['name']} ===")

        # Step 1: fetch players_raw -> season element_id -> permanent code
        print("  Loading players_raw.csv...")
        players_raw = fetch_csv(season["players_url"])
        element_to_code: dict[int, int] = {}
        for p in players_raw:
            try:
                element_to_code[int(p["id"])] = int(p["code"])
            except (ValueError, KeyError):
                pass
        print(f"  {len(element_to_code)} element->code mappings built.")

        # Step 2: delete any existing rows for this season to avoid duplicates
        print(f"  Clearing existing rows for {season['name']}...")
        cur.execute(
            "DELETE FROM player_history WHERE json_extract(data, '$.season_name') = ?",
            (season["name"],),
        )
        deleted = cur.rowcount
        conn.commit()
        print(f"  Deleted {deleted} old rows.")

        # Step 3: fetch per-game CSV
        print("  Loading merged_gw.csv...")
        gw_rows = fetch_csv(season["gw_url"])
        print(f"  {len(gw_rows)} game rows fetched.")

        # Step 4: insert
        inserted = 0
        missed = 0
        missed_elements: set[int] = set()

        rows_to_insert = []
        for row in gw_rows:
            try:
                element_id = int(row["element"])
            except (ValueError, KeyError):
                missed += 1
                continue

            perm_code = element_to_code.get(element_id)
            if perm_code is None:
                missed += 1
                missed_elements.add(element_id)
                continue

            db_player_id = code_to_db_id.get(perm_code)
            if db_player_id is None:
                # Player not in current season DB (left PL / retired) — skip
                missed += 1
                continue

            try:
                fixture_id = -(season["year"] * 100000 + int(row["fixture"]))
            except (ValueError, KeyError):
                missed += 1
                continue

            data = {
                "season_name": season["name"],
                "element_code": perm_code,
                # Per-game fields
                "kickoff_time": row.get("kickoff_time", ""),
                "round": int(row.get("GW") or row.get("round", 0)),
                "was_home": row.get("was_home", "False") in ("True", "true", "1"),
                "opponent_team": int(row.get("opponent_team", 0)),
                "total_points": int(row.get("total_points", 0)),
                "minutes": int(row.get("minutes", 0)),
                "goals_scored": int(row.get("goals_scored", 0)),
                "assists": int(row.get("assists", 0)),
                "clean_sheets": int(row.get("clean_sheets", 0)),
                "goals_conceded": int(row.get("goals_conceded", 0)),
                "own_goals": int(row.get("own_goals", 0)),
                "penalties_saved": int(row.get("penalties_saved", 0)),
                "penalties_missed": int(row.get("penalties_missed", 0)),
                "yellow_cards": int(row.get("yellow_cards", 0)),
                "red_cards": int(row.get("red_cards", 0)),
                "saves": int(row.get("saves", 0)),
                "bonus": int(row.get("bonus", 0)),
                "bps": int(row.get("bps", 0)),
                "influence": row.get("influence", "0"),
                "creativity": row.get("creativity", "0"),
                "threat": row.get("threat", "0"),
                "ict_index": row.get("ict_index", "0"),
                "expected_goals": row.get("expected_goals", "0"),
                "expected_assists": row.get("expected_assists", "0"),
                "expected_goal_involvements": row.get("expected_goal_involvements", "0"),
                "expected_goals_conceded": row.get("expected_goals_conceded", "0"),
                "value": int(row.get("value", 0)),
                "selected": int(row.get("selected", 0)),
                "transfers_in": int(row.get("transfers_in", 0)),
                "transfers_out": int(row.get("transfers_out", 0)),
                "starts": int(row.get("starts", 0)) if row.get("starts") else 0,
                "team_h_score": int(row.get("team_h_score", 0)) if row.get("team_h_score") else None,
                "team_a_score": int(row.get("team_a_score", 0)) if row.get("team_a_score") else None,
            }

            rows_to_insert.append((db_player_id, fixture_id, json.dumps(data)))
            inserted += 1

        # Bulk insert
        cur.executemany(insert_q, rows_to_insert)
        conn.commit()

        print(f"  Inserted: {inserted}  |  Missed (no DB match): {missed}")
        total_inserted += inserted
        total_missed += missed

    print(f"\n=== INGESTION COMPLETE ===")
    print(f"Total inserted: {total_inserted}")
    print(f"Total missed:   {total_missed}")

    # ── Verification: Haaland season totals ──────────────────────────────────
    print("\n=== VERIFICATION: Haaland season totals ===")
    haaland_id = code_to_db_id.get(223094)
    if haaland_id is None:
        print("Haaland not found in DB (code 223094)")
    else:
        cur.execute(
            "SELECT data FROM player_history WHERE player_id = ? AND fixture_id < 0",
            (haaland_id,),
        )
        rows = cur.fetchall()
        season_totals: dict = {}
        for r in rows:
            d = json.loads(r[0])
            s = d.get("season_name", "?")
            if s not in season_totals:
                season_totals[s] = {"pts": 0, "goals": 0, "assists": 0, "minutes": 0, "gws": 0}
            t = season_totals[s]
            t["pts"] += d.get("total_points", 0)
            t["goals"] += d.get("goals_scored", 0)
            t["assists"] += d.get("assists", 0)
            t["minutes"] += d.get("minutes", 0)
            t["gws"] += 1

        print(f"{'Season':<10} {'GWs':>5} {'Min':>6} {'Goals':>6} {'Assists':>8} {'Pts':>5}")
        print("-" * 45)
        for s, t in sorted(season_totals.items()):
            print(f"{s:<10} {t['gws']:>5} {t['minutes']:>6} {t['goals']:>6} {t['assists']:>8} {t['pts']:>5}")

    # ── Final DB size ─────────────────────────────────────────────────────────
    print("\n=== DATABASE SIZE ===")
    cur.execute("SELECT COUNT(*) FROM player_history")
    total_ph = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM player_history WHERE fixture_id < 0")
    historical = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM player_history WHERE fixture_id > 0")
    current = cur.fetchone()[0]

    db_size_mb = os.path.getsize(DB_PATH) / (1024 * 1024)
    print(f"player_history total rows : {total_ph:,}")
    print(f"  historical (per-game)   : {historical:,}")
    print(f"  current season          : {current:,}")
    print(f"DB file size              : {db_size_mb:.2f} MB")

    conn.close()


if __name__ == "__main__":
    main()

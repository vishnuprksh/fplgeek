import sqlite3
import json
import requests
import csv
import io
import os
import time
import urllib.request
import concurrent.futures

DATA_DIR = os.environ.get('FPL_DATA_DIR', os.path.normpath(os.path.join(os.path.dirname(__file__), '../../data')))
DB_PATH = os.path.join(DATA_DIR, 'fpl.sqlite')

API = "https://fantasy.premierleague.com/api"
HEADERS = {'User-Agent': 'Mozilla/5.0'}
LEAGUE_ID = 314

HISTORICAL_SEASONS = [
    {
        "name": "2023/24", "year": 2023,
        "gw_url": "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2023-24/gws/merged_gw.csv",
        "players_url": "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2023-24/players_raw.csv",
    },
    {
        "name": "2024/25", "year": 2024,
        "gw_url": "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2024-25/gws/merged_gw.csv",
        "players_url": "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data/2024-25/players_raw.csv",
    },
]


def fetch(url, retries=3):
    for _ in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            print(f"  retry {url}: {e}")
            time.sleep(1)
    return None


def fetch_csv(url):
    print(f"  Fetching: {url}")
    with urllib.request.urlopen(url, timeout=30) as r:
        return list(csv.DictReader(io.StringIO(r.read().decode('utf-8'))))


def init_db(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS players (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS fixtures (id INTEGER PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS player_history (
            player_id INTEGER, fixture_id INTEGER, data TEXT NOT NULL,
            PRIMARY KEY (player_id, fixture_id)
        );
        CREATE TABLE IF NOT EXISTS app_data (
            key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
        );
    """)
    conn.commit()


def seed_bootstrap(conn, bootstrap):
    conn.executemany("INSERT OR REPLACE INTO players VALUES (?, ?)",
                     [(p['id'], json.dumps(p)) for p in bootstrap['elements']])
    conn.executemany("INSERT OR REPLACE INTO teams VALUES (?, ?)",
                     [(t['id'], json.dumps(t)) for t in bootstrap['teams']])
    conn.commit()
    print(f"  {len(bootstrap['elements'])} players, {len(bootstrap['teams'])} teams seeded")


def fetch_and_store_fixtures(conn):
    print("Fetching fixtures...")
    data = fetch(f"{API}/fixtures/")
    if not data:
        print("  Failed to fetch fixtures")
        return

    rows = []
    for f in data:
        rows.append((f['id'], json.dumps({
            'id': f['id'], 'event': f.get('event'),
            'team_h': f.get('team_h'), 'team_a': f.get('team_a'),
            'team_h_score': f.get('team_h_score'), 'team_a_score': f.get('team_a_score'),
            'finished': f.get('finished'), 'started': f.get('started'),
            'kickoff_time': f.get('kickoff_time'),
            'team_h_difficulty': f.get('team_h_difficulty'),
            'team_a_difficulty': f.get('team_a_difficulty'),
            'stats': f.get('stats', []),
        })))

    conn.execute("DELETE FROM fixtures")
    conn.executemany("INSERT INTO fixtures VALUES (?, ?)", rows)
    conn.commit()
    print(f"  {len(rows)} fixtures saved to SQLite")


def build_history_row(h):
    return {
        'round': int(h.get('round', 0)),
        'total_points': int(h.get('total_points', 0)),
        'minutes': int(h.get('minutes', 0)),
        'goals_scored': int(h.get('goals_scored', 0)),
        'assists': int(h.get('assists', 0)),
        'clean_sheets': int(h.get('clean_sheets', 0)),
        'goals_conceded': int(h.get('goals_conceded', 0)),
        'own_goals': int(h.get('own_goals', 0)),
        'penalties_saved': int(h.get('penalties_saved', 0)),
        'penalties_missed': int(h.get('penalties_missed', 0)),
        'yellow_cards': int(h.get('yellow_cards', 0)),
        'red_cards': int(h.get('red_cards', 0)),
        'saves': int(h.get('saves', 0)),
        'bonus': int(h.get('bonus', 0)),
        'bps': int(h.get('bps', 0)),
        'was_home': bool(h.get('was_home', False)),
        'opponent_team': int(h.get('opponent_team', 0)),
        'value': float(h.get('value', 0)) / 10.0,
        'expected_goals': str(h.get('expected_goals', 0)),
        'expected_assists': str(h.get('expected_assists', 0)),
        'expected_goal_involvements': str(h.get('expected_goal_involvements', 0)),
        'expected_goals_conceded': str(h.get('expected_goals_conceded', 0)),
        'influence': str(h.get('influence', 0)),
        'creativity': str(h.get('creativity', 0)),
        'threat': str(h.get('threat', 0)),
        'ict_index': str(h.get('ict_index', 0)),
        'starts': int(h.get('starts', 0)),
        'team_h_score': h.get('team_h_score'),
        'team_a_score': h.get('team_a_score'),
        'selected': int(h.get('selected', 0)),
        'selected_by_percent': str(h.get('selected_by_percent', '0')),
        'transfers_in': int(h.get('transfers_in', 0)),
        'transfers_out': int(h.get('transfers_out', 0)),
        'kickoff_time': h.get('kickoff_time', ''),
    }


def fetch_current_gw_history(conn, bootstrap):
    print("Fetching current season player history...")
    elements = bootstrap['elements']
    total = len(elements)
    updated = 0

    for i, player in enumerate(elements):
        pid = player['id']
        if (i + 1) % 100 == 0:
            print(f"  {i + 1}/{total}")
        summary = fetch(f"{API}/element-summary/{pid}/")
        if not summary:
            continue
        rows = []
        for h in summary.get('history', []):
            if not h.get('fixture') or int(h['fixture']) <= 0:
                continue
            rows.append((pid, int(h['fixture']), json.dumps(build_history_row(h))))
        if rows:
            conn.executemany("INSERT OR REPLACE INTO player_history VALUES (?, ?, ?)", rows)
            updated += 1

    conn.commit()
    print(f"  {updated} players updated with current season history")


def fetch_historical_seasons(conn):
    print("Fetching historical season data...")
    cur = conn.execute("SELECT id, data FROM players")
    code_to_id = {}
    for row in cur.fetchall():
        d = json.loads(row[1])
        if d.get('code'):
            code_to_id[int(d['code'])] = row[0]
    print(f"  {len(code_to_id)} players mapped by code")

    for season in HISTORICAL_SEASONS:
        print(f"  Season {season['name']}...")
        players_raw = fetch_csv(season['players_url'])
        el_to_code = {}
        for p in players_raw:
            try:
                el_to_code[int(p['id'])] = int(p['code'])
            except (ValueError, KeyError):
                pass

        conn.execute(
            "DELETE FROM player_history WHERE json_extract(data, '$.season_name') = ?",
            (season['name'],)
        )
        conn.commit()

        gw_rows = fetch_csv(season['gw_url'])
        rows = []
        missed = 0
        for row in gw_rows:
            try:
                eid = int(row.get('element', 0))
            except (ValueError, TypeError):
                missed += 1
                continue
            code = el_to_code.get(eid)
            db_id = code_to_id.get(code) if code else None
            if not db_id:
                missed += 1
                continue
            try:
                fid = -(season['year'] * 100000 + int(row['fixture']))
            except (ValueError, KeyError):
                missed += 1
                continue

            data = {
                'season_name': season['name'],
                'element_code': code,
                'kickoff_time': row.get('kickoff_time', ''),
                'round': int(row.get('GW') or row.get('round', 0)),
                'was_home': row.get('was_home', 'False') in ('True', 'true', '1'),
                'opponent_team': int(row.get('opponent_team', 0)),
                'total_points': int(row.get('total_points', 0)),
                'minutes': int(row.get('minutes', 0)),
                'goals_scored': int(row.get('goals_scored', 0)),
                'assists': int(row.get('assists', 0)),
                'clean_sheets': int(row.get('clean_sheets', 0)),
                'goals_conceded': int(row.get('goals_conceded', 0)),
                'own_goals': int(row.get('own_goals', 0)),
                'penalties_saved': int(row.get('penalties_saved', 0)),
                'penalties_missed': int(row.get('penalties_missed', 0)),
                'yellow_cards': int(row.get('yellow_cards', 0)),
                'red_cards': int(row.get('red_cards', 0)),
                'saves': int(row.get('saves', 0)),
                'bonus': int(row.get('bonus', 0)),
                'bps': int(row.get('bps', 0)),
                'influence': row.get('influence', '0'),
                'creativity': row.get('creativity', '0'),
                'threat': row.get('threat', '0'),
                'ict_index': row.get('ict_index', '0'),
                'expected_goals': row.get('expected_goals', '0'),
                'expected_assists': row.get('expected_assists', '0'),
                'expected_goal_involvements': row.get('expected_goal_involvements', '0'),
                'expected_goals_conceded': row.get('expected_goals_conceded', '0'),
                'value': int(row.get('value', 0)),
                'selected': int(row.get('selected', 0)),
                'transfers_in': int(row.get('transfers_in', 0)),
                'transfers_out': int(row.get('transfers_out', 0)),
                'starts': int(row.get('starts', 0)) if row.get('starts') else 0,
                'team_h_score': int(row['team_h_score']) if row.get('team_h_score') else None,
                'team_a_score': int(row['team_a_score']) if row.get('team_a_score') else None,
            }
            rows.append((db_id, fid, json.dumps(data)))

        conn.executemany("INSERT OR REPLACE INTO player_history VALUES (?, ?, ?)", rows)
        conn.commit()
        print(f"    {len(rows)} rows inserted, {missed} missed")


def fetch_league_analysis(conn, bootstrap):
    print("Fetching league analysis...")
    elements = {
        el['id']: f"{el['web_name']} ({next((t['short_name'] for t in bootstrap['teams'] if t['id'] == el['team']), '')})"
        for el in bootstrap['elements']
    }
    current_gw = 1
    for event in bootstrap['events']:
        if event.get('is_current'):
            current_gw = event['id']
            break
        if event.get('is_next'):
            current_gw = event['id'] - 1
            break

    standings_data = fetch(f"{API}/leagues-classic/{LEAGUE_ID}/standings/")
    if not standings_data:
        print("  Failed to fetch standings")
        return

    entries = [int(r['entry']) for r in standings_data['standings'].get('results', [])][:100]
    total = len(entries)
    print(f"  {total} managers in league")

    history = []
    for gw in range(1, current_gw + 1):
        print(f"  GW {gw}...")
        player_stats = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as ex:
            futures = {
                ex.submit(fetch, f"{API}/entry/{eid}/event/{gw}/picks/"): eid
                for eid in entries
            }
            for future in concurrent.futures.as_completed(futures):
                picks_data = future.result()
                if not picks_data or 'picks' not in picks_data:
                    continue
                for pick in picks_data['picks']:
                    eid = int(pick.get('element', 0))
                    mult = int(pick.get('multiplier', 0))
                    if eid not in player_stats:
                        player_stats[eid] = {'count': 0, 'eo_sum': 0}
                    player_stats[eid]['count'] += 1
                    player_stats[eid]['eo_sum'] += mult

        top_owned = sorted([
            {
                'id': eid, 'name': elements.get(eid, 'Unknown'),
                'count': s['count'],
                'percent': s['count'] / total * 100,
                'effective_ownership': s['eo_sum'] / total * 100
            }
            for eid, s in player_stats.items() if s['count'] > 0
        ], key=lambda x: x['effective_ownership'], reverse=True)
        history.append({'gw': gw, 'top_owned': top_owned})

    out = {'league_id': LEAGUE_ID, 'total_teams_analyzed': total, 'history': history}
    conn.execute(
        "INSERT OR REPLACE INTO app_data (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%S', 'now'))",
        ('league_analysis', json.dumps(out))
    )
    conn.commit()
    print(f"  league_analysis saved to SQLite")


def main():
    print("=== Fetching FPL Data ===")
    os.makedirs(DATA_DIR, exist_ok=True)

    bootstrap = fetch(f"{API}/bootstrap-static/")
    if not bootstrap:
        print("Failed to fetch bootstrap")
        return

    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    print("Seeding players and teams...")
    seed_bootstrap(conn, bootstrap)

    fetch_and_store_fixtures(conn)
    fetch_current_gw_history(conn, bootstrap)
    fetch_historical_seasons(conn)
    fetch_league_analysis(conn, bootstrap)

    conn.close()
    print("=== Done ===")


if __name__ == "__main__":
    main()

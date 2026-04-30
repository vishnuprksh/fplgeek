import sqlite3
import os
import json
import numpy as np
from datetime import datetime, timezone

DATA_DIR = os.environ.get('FPL_DATA_DIR', os.path.normpath(os.path.join(os.path.dirname(__file__), '../../data')))
DB_PATH = os.path.join(DATA_DIR, 'fpl.sqlite')

LOOKBACK = 10
AGG_WINDOW = 6
# Indices into seq row: [min, xG, xA, thr, cre, inf, gc, saves, sel, price, home, pts, form]
AGG_INDICES = [0, 11, 1, 2, 5, 4, 3, 6, 7]
POS_MAP = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}
POS_ENCODING = {'GKP': 0, 'DEF': 1, 'MID': 2, 'FWD': 3}


def safe_float(val):
    try:
        f = float(val)
        return 0.0 if (f != f or f == float('inf') or f == float('-inf')) else f
    except (ValueError, TypeError):
        return 0.0


def build_venue_table(finished_fixtures):
    table = {}
    for f in finished_fixtures:
        for tid in [f['team_h'], f['team_a']]:
            if tid not in table:
                table[tid] = {'gs': 0, 'gc': 0, 'played': 0}

    for team_id in list(table.keys()):
        matches = [f for f in finished_fixtures if f['team_h'] == team_id or f['team_a'] == team_id]
        matches.sort(key=lambda x: x['kickoff_time'])
        for f in matches[-10:]:
            is_home = f['team_h'] == team_id
            h, a = f.get('team_h_score') or 0, f.get('team_a_score') or 0
            table[team_id]['gs'] += h if is_home else a
            table[team_id]['gc'] += a if is_home else h
            table[team_id]['played'] += 1
    return table


def fixture_scores(team_id, opp_id, venue_table):
    t, o = venue_table.get(team_id), venue_table.get(opp_id)
    if not t or not o:
        return 0.0, 0.0
    return float(t['gs'] + o['gc']), float(o['gs'] + t['gc'])


def rolling_agg(seq, window):
    if not seq:
        return [0.0] * len(AGG_INDICES)
    sub = seq[-min(window, len(seq)):]
    factor = len(sub) / window
    return [((sum(h[i] for h in sub) / len(sub) + float(np.median([h[i] for h in sub]))) / 2.0) * factor
            for i in AGG_INDICES]


def make_seq_row(m):
    form = 0.0
    return [
        safe_float(m['minutes']), safe_float(m['expected_goals']),
        safe_float(m['expected_assists']), safe_float(m['threat']),
        safe_float(m['creativity']), safe_float(m['influence']),
        safe_float(m['goals_conceded']), safe_float(m['saves']),
        np.log1p(safe_float(m['selected'])), safe_float(m['value']) / 10.0,
        1.0 if m['was_home'] else 0.0, safe_float(m['total_points']), form
    ]


def opp_strength(opp_id, is_home, teams_map):
    opp = teams_map.get(opp_id)
    if not opp:
        return 1100
    key = 'strength_overall_away' if is_home else 'strength_overall_home'
    s = opp.get(key) or opp.get('strength') or 1100
    return 1000 + (s - 3) * 100 if s < 100 else s


def vectorize(sample, pos):
    ctx = [
        sample['ctx_was_home'], sample['ctx_difficulty'], sample['ctx_price'],
        sample['ctx_hours_rest'], sample['ctx_ownership'], sample['ctx_opponent'],
        sample['ctx_chance_of_playing'], sample['ctx_fixture_attack'], sample['ctx_fixture_defense']
    ]
    vec = ctx + sample['agg_r6'] + [POS_ENCODING.get(pos, 0)]
    return [0.0 if (v != v or v == float('inf') or v == float('-inf')) else float(v) for v in vec]


def get_season(dt):
    y, m = dt.year, dt.month
    if (y == 2023 and m >= 8) or (y == 2024 and m < 8): return "23/24"
    if (y == 2024 and m >= 8) or (y == 2025 and m < 8): return "24/25"
    if (y == 2025 and m >= 8) or (y == 2026 and m < 8): return "25/26"
    return "Unknown"


def main():
    print(f"Starting preprocessing... DB: {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS preprocessed_data (
            player_id INTEGER, gw INTEGER, season TEXT, position TEXT,
            is_future INTEGER, target_class INTEGER, feature_vector BLOB, metadata TEXT,
            PRIMARY KEY (player_id, gw, season)
        )
    """)

    cur.execute("SELECT id, data FROM players")
    players = [dict({'id': r[0]}, **json.loads(r[1])) for r in cur.fetchall()]

    cur.execute("SELECT player_id, data FROM player_history")
    history_by_player = {}
    for row in cur.fetchall():
        history_by_player.setdefault(row[0], []).append(json.loads(row[1]))

    cur.execute("SELECT id, data FROM teams")
    teams_map = {row[0]: json.loads(row[1]) for row in cur.fetchall()}

    cur.execute("SELECT data FROM fixtures")
    fixtures_raw = [json.loads(row[0]) for row in cur.fetchall()]

    finished = [f for f in fixtures_raw if f.get('finished')]
    venue_table = build_venue_table(finished)

    team_fixtures = {}
    for f in fixtures_raw:
        team_fixtures.setdefault(f['team_h'], []).append(f)
        team_fixtures.setdefault(f['team_a'], []).append(f)

    partials = {pos: [] for pos in POS_MAP.values()}
    total = 0

    for player in players:
        p_id = player['id']
        pos = POS_MAP.get(player.get('element_type'), "MID")
        history_raw = history_by_player.get(p_id, [])
        history = sorted(
            [m for m in history_raw if m.get('kickoff_time') and m.get('kickoff_time') != 'None'],
            key=lambda x: x['kickoff_time']
        )

        last_date = datetime(2000, 1, 1, tzinfo=timezone.utc)

        # Historical matches
        for i, match in enumerate(history):
            try:
                gw = int(match['round'])
            except (ValueError, TypeError):
                continue

            dt = datetime.fromisoformat(match['kickoff_time'].replace('Z', '+00:00'))
            if dt > last_date:
                last_date = dt
            season = get_season(dt)

            p_team = player['team']
            opp_id = match['opponent_team']
            difficulty = 3
            fixture = next((
                f for f in fixtures_raw
                if f.get('event') == gw and (
                    (f['team_h'] == p_team and f['team_a'] == opp_id) or
                    (f['team_a'] == p_team and f['team_h'] == opp_id)
                )
            ), None)
            if fixture:
                difficulty = fixture['team_h_difficulty'] if fixture['team_h'] == p_team else fixture['team_a_difficulty']

            hours_rest = 168.0
            if i > 0:
                prev_dt = datetime.fromisoformat(history[i - 1]['kickoff_time'].replace('Z', '+00:00'))
                hours_rest = (dt.timestamp() - prev_dt.timestamp()) / 3600.0

            seq = []
            for k in range(LOOKBACK, 0, -1):
                if i - k < 0:
                    seq.append([0.0] * 13)
                else:
                    seq.append(make_seq_row(history[i - k]))

            atk, dfn = fixture_scores(p_team, opp_id, venue_table)
            agg = rolling_agg(seq, AGG_WINDOW)

            partials[pos].append({
                'name': player['web_name'], 'id': p_id, 'team': p_team,
                'gw': gw, 'season': season, 'is_future': False,
                'target': match['total_points'],
                'target_class': max(0, min(int(match['total_points']), 15)),
                'selected_by_percent': safe_float(player.get('selected_by_percent', 0)),
                'ctx_was_home': 1.0 if match['was_home'] else 0.0,
                'ctx_opponent': float(opp_strength(opp_id, match['was_home'], teams_map)),
                'ctx_difficulty': float(difficulty),
                'ctx_price': match['value'] / 10.0,
                'ctx_hours_rest': min(hours_rest, 300.0),
                'ctx_ownership': safe_float(player.get('selected_by_percent', 0)),
                'ctx_chance_of_playing': 100.0,
                'ctx_fixture_attack': 0.0, 'ctx_fixture_defense': 0.0,
                'agg_r6': agg, '_atk': atk, '_dfn': dfn
            })
            total += 1

        if not history:
            continue

        # Future fixtures
        placeholder_seq = []
        for k in range(LOOKBACK, 0, -1):
            idx = len(history) - k
            placeholder_seq.append(make_seq_row(history[idx]) if idx >= 0 else [0.0] * 13)

        last_val = safe_float(history[-1]['value']) / 10.0
        last_ts = last_date.timestamp()
        p_team = player['team']

        future_fixtures = sorted(
            [f for f in team_fixtures.get(p_team, [])
             if f.get('kickoff_time') and
             datetime.fromisoformat(f['kickoff_time'].replace('Z', '+00:00')) > last_date],
            key=lambda x: x['kickoff_time']
        )

        for f in future_fixtures:
            gw = f.get('event')
            if not gw:
                continue
            is_home = f['team_h'] == p_team
            opp_id = f['team_a'] if is_home else f['team_h']
            difficulty = f['team_h_difficulty'] if is_home else f['team_a_difficulty']
            curr_ts = datetime.fromisoformat(f['kickoff_time'].replace('Z', '+00:00')).timestamp()
            hours_rest = (curr_ts - last_ts) / 3600.0
            last_ts = curr_ts
            atk, dfn = fixture_scores(p_team, opp_id, venue_table)
            agg = rolling_agg(placeholder_seq, AGG_WINDOW)

            partials[pos].append({
                'name': player['web_name'], 'id': p_id, 'team': p_team,
                'gw': gw, 'season': "25/26", 'is_future': True,
                'target': 0, 'target_class': 0,
                'selected_by_percent': safe_float(player.get('selected_by_percent', 0)),
                'ctx_was_home': 1.0 if is_home else 0.0,
                'ctx_opponent': float(opp_strength(opp_id, is_home, teams_map)),
                'ctx_difficulty': float(difficulty),
                'ctx_price': last_val,
                'ctx_hours_rest': min(hours_rest, 300.0),
                'ctx_ownership': safe_float(player.get('selected_by_percent', 0)),
                'ctx_chance_of_playing': float(player.get('chance_of_playing_next_round') or 100.0),
                'ctx_fixture_attack': 0.0, 'ctx_fixture_defense': 0.0,
                'agg_r6': agg, '_atk': atk, '_dfn': dfn
            })
            total += 1

    print(f"Processed {total} samples total")

    # Scale fixture attack/defense per position
    insert_data = []
    for pos, samples in partials.items():
        if not samples:
            continue
        atks = [s['_atk'] for s in samples]
        dfns = [s['_dfn'] for s in samples]
        min_a, max_a = min(atks), max(atks)
        min_d, max_d = min(dfns), max(dfns)
        ra = (max_a - min_a) or 1.0
        rd = (max_d - min_d) or 1.0

        for s in samples:
            s['ctx_fixture_attack'] = round((s['_atk'] - min_a) / ra, 4)
            s['ctx_fixture_defense'] = round((max_d - s['_dfn']) / rd, 4)
            feat = vectorize(s, pos)
            meta = {
                'name': s['name'], 'id': s['id'], 'team': s['team'],
                'gw': s['gw'], 'season': s['season'], 'target': s['target'],
                'selected_by_percent': s['selected_by_percent'],
                'ctx_was_home': s['ctx_was_home'], 'ctx_opponent': s['ctx_opponent'],
                'ctx_difficulty': s['ctx_difficulty'], 'ctx_price': s['ctx_price'],
                'ctx_hours_rest': s['ctx_hours_rest'], 'ctx_ownership': s['ctx_ownership'],
                'ctx_chance_of_playing': s['ctx_chance_of_playing'],
                'ctx_fixture_attack': s['ctx_fixture_attack'],
                'ctx_fixture_defense': s['ctx_fixture_defense'],
                'agg_r6': s['agg_r6']
            }
            insert_data.append((
                s['id'], s['gw'], s['season'], pos,
                1 if s['is_future'] else 0,
                s['target_class'],
                np.array(feat, dtype=np.float32).tobytes(),
                json.dumps(meta)
            ))
        print(f"  {pos}: {len(samples)} samples")

    cur.execute("DELETE FROM preprocessed_data")
    cur.executemany("""
        INSERT OR REPLACE INTO preprocessed_data
        (player_id, gw, season, position, is_future, target_class, feature_vector, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, insert_data)
    conn.commit()
    conn.close()
    print(f"Stored {len(insert_data)} samples in preprocessed_data")


if __name__ == "__main__":
    main()

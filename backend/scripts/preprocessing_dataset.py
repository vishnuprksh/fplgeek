import sqlite3
import os
import json
import numpy as np
import sys
from datetime import datetime, timezone
from typing import Dict, List, Any, Tuple

# Add the script's directory to the path so we can import from lib
sys.path.append(os.path.join(os.path.dirname(__file__)))
from lib.config import DB_PATH, POSITIONS

LOOKBACK = 10
AGG_WINDOW = 6
# Indices into history sequence: [min, xG, xA, thr, cre, inf, gc, saves, sel, price, home, pts, form]
# We want: [min, pts, xG, xA, inf, cre, thr, gc, saves]
AGG_INDICES = [0, 11, 1, 2, 5, 4, 3, 6, 7]

def parse_float_safe(val: Any) -> float:
    try:
        f = float(val)
        return 0.0 if np.isnan(f) or np.isinf(f) else f
    except (ValueError, TypeError):
        return 0.0

def build_team_venue_table(finished_fixtures: List[Dict[str, Any]]) -> Dict[int, Dict[str, Any]]:
    table = {}
    team_ids = set()
    for f in finished_fixtures:
        team_ids.add(f['team_h'])
        team_ids.add(f['team_a'])

    for team_id in team_ids:
        table[team_id] = {
            'goalsScored': 0, 'goalsConceded': 0,
            'homeGoalsScored': 0, 'homeGoalsConceded': 0,
            'awayGoalsScored': 0, 'awayGoalsConceded': 0,
            'played': 0
        }

    # Sort chronologically
    sorted_fixtures = sorted(finished_fixtures, key=lambda x: x['kickoff_time'])

    for team_id in team_ids:
        team_matches = [f for f in sorted_fixtures if f['team_h'] == team_id or f['team_a'] == team_id]
        last_10 = team_matches[-10:]

        for f in last_10:
            is_home = f['team_h'] == team_id
            h_score = f.get('team_h_score', 0) or 0
            a_score = f.get('team_a_score', 0) or 0

            table[team_id]['played'] += 1
            if is_home:
                table[team_id]['goalsScored'] += h_score
                table[team_id]['goalsConceded'] += a_score
                table[team_id]['homeGoalsScored'] += h_score
                table[team_id]['homeGoalsConceded'] += a_score
            else:
                table[team_id]['goalsScored'] += a_score
                table[team_id]['goalsConceded'] += h_score
                table[team_id]['awayGoalsScored'] += a_score
                table[team_id]['awayGoalsConceded'] += h_score

    return table

def compute_fixture_scores(team_id: int, opponent_id: int, venue_table: Dict[int, Any]) -> Tuple[float, float]:
    team = venue_table.get(team_id)
    opp = venue_table.get(opponent_id)

    if not team or not opp:
        return 0.0, 0.0

    # Attack: our offensive output + opponent's defensive weakness (Total)
    attack_raw = team['goalsScored'] + opp['goalsConceded']
    # Defense: opponent's offensive threat + our defensive weakness (Total)
    defense_raw = opp['goalsScored'] + team['goalsConceded']

    return float(attack_raw), float(defense_raw)

def compute_rolling_agg(history_seq: List[List[float]], window: int) -> List[float]:
    if not history_seq:
        return [0.0] * len(AGG_INDICES)
    
    available = min(window, len(history_seq))
    if available == 0:
        return [0.0] * len(AGG_INDICES)
    
    sub = history_seq[-available:]
    penalty_factor = available / window
    
    results = []
    for idx in AGG_INDICES:
        vals = [h[idx] for h in sub]
        mean = sum(vals) / len(vals)
        median = float(np.median(vals))
        results.append(((mean + median) / 2.0) * penalty_factor)
    
    return results

def classify_target(points: float) -> int:
    return int(max(0, min(int(points), 15)))

def position_to_encoding(position: str) -> int:
    pos_map = {'GKP': 0, 'DEF': 1, 'MID': 2, 'FWD': 3}
    return pos_map.get(position, 0)

def clean_and_vectorize(sample: Dict[str, Any], position: str) -> List[float]:
    ctx = [
        sample['ctx_was_home'],
        sample['ctx_difficulty'],
        sample['ctx_price'],
        sample['ctx_hours_rest'],
        sample['ctx_ownership'],
        sample['ctx_opponent'],
        sample['ctx_chance_of_playing'],
        sample['ctx_fixture_attack'],
        sample['ctx_fixture_defense']
    ]
    pos_encoding = position_to_encoding(position)
    vec = ctx + sample['agg_r6'] + [pos_encoding]
    return [0.0 if np.isnan(v) or np.isinf(v) else float(v) for v in vec]

def main():
    print(f"Starting Feature Engineering...")
    print(f"DB: {DB_PATH}")

    if not os.path.exists(DB_PATH):
        print(f"Error: Database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Ensure preprocessed_data table exists
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS preprocessed_data (
            player_id INTEGER,
            gw INTEGER,
            season TEXT,
            position TEXT,
            is_future INTEGER,
            target_class INTEGER,
            feature_vector BLOB,
            metadata TEXT,
            PRIMARY KEY (player_id, gw, season)
        );
    """)

    # 1. Fetch Raw Data
    cursor.execute("SELECT id, data FROM players")
    players = []
    for row in cursor.fetchall():
        p_data = json.loads(row[1])
        p_data['id'] = row[0]
        players.append(p_data)

    cursor.execute("SELECT player_id, data FROM player_history")
    history_by_player = {}
    for row in cursor.fetchall():
        p_id = row[0]
        if p_id not in history_by_player:
            history_by_player[p_id] = []
        history_by_player[p_id].append(json.loads(row[1]))

    cursor.execute("SELECT id, data FROM teams")
    teams_map = {}
    for row in cursor.fetchall():
        teams_map[row[0]] = json.loads(row[1])

    cursor.execute("SELECT data FROM fixtures")
    fixtures_raw = [json.loads(row[0]) for row in cursor.fetchall()]

    # 3. Build venue-based team stats table from finished fixtures
    finished_fixtures = [f for f in fixtures_raw if f.get('finished') == True or f.get('finished') == 1]
    venue_table = build_team_venue_table(finished_fixtures)

    # 4. Processing
    total_samples = 0
    partial_datasets = {"GKP": [], "DEF": [], "MID": [], "FWD": []}

    # Create a map of team fixtures
    team_fixtures_map = {}
    for f in fixtures_raw:
        h, a = f['team_h'], f['team_a']
        if h not in team_fixtures_map: team_fixtures_map[h] = []
        if a not in team_fixtures_map: team_fixtures_map[a] = []
        team_fixtures_map[h].append(f)
        team_fixtures_map[a].append(f)

    # Position string map for element_type
    pos_type_map = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}

    for player in players:
        p_id = player['id']
        history_raw = history_by_player.get(p_id, [])
        history = [m for m in history_raw if m.get('kickoff_time') and m.get('kickoff_time') != "None"]
        history.sort(key=lambda x: x['kickoff_time'])

        last_match_date = datetime(2000, 1, 1, tzinfo=timezone.utc)

        if history:
            for i, target_match in enumerate(history):
                try:
                    gw = int(target_match['round'])
                except (ValueError, TypeError):
                    continue

                m_date = datetime.fromisoformat(target_match['kickoff_time'].replace('Z', '+00:00'))
                if m_date > last_match_date:
                    last_match_date = m_date

                year = m_date.year
                month = m_date.month
                season = "Unknown"
                if (year == 2023 and month >= 8) or (year == 2024 and month < 8):
                    season = "23/24"
                elif (year == 2024 and month >= 8) or (year == 2025 and month < 8):
                    season = "24/25"
                elif (year == 2025 and month >= 8) or (year == 2026 and month < 8):
                    season = "25/26"

                p_team = player['team']
                difficulty = 3
                fixture = next((f for f in fixtures_raw if f.get('event') == gw and 
                               ((f['team_h'] == p_team and f['team_a'] == target_match['opponent_team']) or 
                                (f['team_a'] == p_team and f['team_h'] == target_match['opponent_team']))), None)
                
                if fixture:
                    difficulty = fixture['team_h_difficulty'] if fixture['team_h'] == p_team else fixture['team_a_difficulty']

                hours_rest = 168.0
                if i > 0:
                    prev_match = history[i-1]
                    curr_time = datetime.fromisoformat(target_match['kickoff_time'].replace('Z', '+00:00')).timestamp()
                    prev_time = datetime.fromisoformat(prev_match['kickoff_time'].replace('Z', '+00:00')).timestamp()
                    hours_rest = (curr_time - prev_time) / 3600.0

                opp_id = target_match['opponent_team']
                opponent = teams_map.get(opp_id)
                opp_strength = 1100
                if opponent:
                    if target_match['was_home']:
                        opp_strength = opponent.get('strength_overall_away') or opponent.get('strength') or 1100
                    else:
                        opp_strength = opponent.get('strength_overall_home') or opponent.get('strength') or 1100
                    if opp_strength < 100:
                        opp_strength = 1000 + (opp_strength - 3) * 100

                seq_data = []
                for k in range(LOOKBACK, 0, -1):
                    if i - k < 0:
                        seq_data.append([0.0] * 13)
                        continue
                    past = history[i-k]
                    past_form = 0.0
                    if i - k >= 4:
                        form_matches = history[max(0, i-k-4):i-k]
                        form_sum = sum(m['total_points'] for m in form_matches)
                        past_form = form_sum / len(form_matches) if form_matches else 0.0
                    
                    seq_data.append([
                        parse_float_safe(past['minutes']),
                        parse_float_safe(past['expected_goals']),
                        parse_float_safe(past['expected_assists']),
                        parse_float_safe(past['threat']),
                        parse_float_safe(past['creativity']),
                        parse_float_safe(past['influence']),
                        parse_float_safe(past['goals_conceded']),
                        parse_float_safe(past['saves']),
                        np.log1p(parse_float_safe(past['selected'])),
                        parse_float_safe(past['value']) / 10.0,
                        1.0 if past['was_home'] else 0.0,
                        parse_float_safe(past['total_points']),
                        past_form
                    ])

                agg_r6 = compute_rolling_agg(seq_data, AGG_WINDOW)
                atk_raw, def_raw = compute_fixture_scores(p_team, opp_id, venue_table)

                sample = {
                    'name': player['web_name'],
                    'id': p_id,
                    'team': p_team,
                    'gw': gw,
                    'season': season,
                    'target': target_match['total_points'],
                    'target_class': classify_target(target_match['total_points']),
                    'is_future': False,
                    'selected_by_percent': parse_float_safe(player['selected_by_percent']),
                    'ctx_was_home': 1.0 if target_match['was_home'] else 0.0,
                    'ctx_opponent': float(opp_strength),
                    'ctx_difficulty': float(difficulty),
                    'ctx_price': target_match['value'] / 10.0,
                    'ctx_hours_rest': min(hours_rest, 300.0),
                    'ctx_ownership': parse_float_safe(player['selected_by_percent']),
                    'ctx_chance_of_playing': 100.0,
                    'ctx_fixture_attack': 0.0,
                    'ctx_fixture_defense': 0.0,
                    'history_sequence': seq_data,
                    'agg_r6': agg_r6,
                    '_attackRaw': atk_raw,
                    '_defenseRaw': def_raw
                }
                
                pos_str = pos_type_map.get(player['element_type'], "MID")
                partial_datasets[pos_str].append(sample)
                total_samples += 1

        # Part B: Future Fixtures
        my_team_fixtures = team_fixtures_map.get(player['team'], [])
        future_fixtures = [f for f in my_team_fixtures if datetime.fromisoformat(f['kickoff_time'].replace('Z', '+00:00')) > last_match_date]
        future_fixtures.sort(key=lambda x: x['kickoff_time'])

        if not history: continue

        placeholder_seq = []
        for k in range(LOOKBACK, 0, -1):
            if len(history) - k < 0:
                placeholder_seq.append([0.0] * 13)
                continue
            past = history[len(history)-k]
            past_form = 0.0
            if len(history) - k >= 4:
                form_matches = history[max(0, len(history)-k-4):len(history)-k]
                form_sum = sum(m['total_points'] for m in form_matches)
                past_form = form_sum / len(form_matches) if form_matches else 0.0
            
            placeholder_seq.append([
                parse_float_safe(past['minutes']),
                parse_float_safe(past['expected_goals']),
                parse_float_safe(past['expected_assists']),
                parse_float_safe(past['threat']),
                parse_float_safe(past['creativity']),
                parse_float_safe(past['influence']),
                parse_float_safe(past['goals_conceded']),
                parse_float_safe(past['saves']),
                np.log1p(parse_float_safe(past['selected'])),
                parse_float_safe(past['value']) / 10.0,
                1.0 if past['was_home'] else 0.0,
                parse_float_safe(past['total_points']),
                past_form
            ])

        last_val = parse_float_safe(history[-1]['value']) / 10.0 if history else 5.0
        last_fix_time = last_match_date.timestamp()

        for f in future_fixtures:
            gw = f.get('event')
            if not gw: continue

            is_home = f['team_h'] == player['team']
            opp_id = f['team_a'] if is_home else f['team_h']
            difficulty = f['team_h_difficulty'] if is_home else f['team_a_difficulty']

            opponent = teams_map.get(opp_id)
            opp_strength = 1100
            if opponent:
                if is_home:
                    opp_strength = opponent.get('strength_overall_away') or opponent.get('strength') or 1100
                else:
                    opp_strength = opponent.get('strength_overall_home') or opponent.get('strength') or 1100
                if opp_strength < 100:
                    opp_strength = 1000 + (opp_strength - 3) * 100

            curr_time = datetime.fromisoformat(f['kickoff_time'].replace('Z', '+00:00')).timestamp()
            hours_rest = (curr_time - last_fix_time) / 3600.0
            last_fix_time = curr_time

            atk_raw, def_raw = compute_fixture_scores(player['team'], opp_id, venue_table)
            agg_r6 = compute_rolling_agg(placeholder_seq, AGG_WINDOW)

            sample = {
                'name': player['web_name'],
                'id': p_id,
                'team': player['team'],
                'gw': gw,
                'season': "25/26",
                'target': 0,
                'target_class': 0,
                'is_future': True,
                'selected_by_percent': parse_float_safe(player['selected_by_percent']),
                'ctx_was_home': 1.0 if is_home else 0.0,
                'ctx_opponent': float(opp_strength),
                'ctx_difficulty': float(difficulty),
                'ctx_price': last_val,
                'ctx_hours_rest': min(hours_rest, 300.0),
                'ctx_ownership': parse_float_safe(player['selected_by_percent']),
                'ctx_chance_of_playing': float(player.get('chance_of_playing_next_round') or 100.0),
                'ctx_fixture_attack': 0.0,
                'ctx_fixture_defense': 0.0,
                'history_sequence': placeholder_seq,
                'agg_r6': agg_r6,
                '_attackRaw': atk_raw,
                '_defenseRaw': def_raw
            }
            
            pos_str = pos_type_map.get(player['element_type'], "MID")
            partial_datasets[pos_str].append(sample)
            total_samples += 1

    print(f"\nProcessing Complete. Total Samples: {total_samples}")

    # Second Pass: Scaling
    final_datasets = {}
    for pos, partials in partial_datasets.items():
        if not partials:
            final_datasets[pos] = []
            continue
        
        all_atk = [s['_attackRaw'] for s in partials]
        all_def = [s['_defenseRaw'] for s in partials]

        min_atk, max_atk = min(all_atk), max(all_atk)
        range_atk = (max_atk - min_atk) or 1.0
        min_def, max_def = min(all_def), max(all_def)
        range_def = (max_def - min_def) or 1.0

        for s in partials:
            atk_scaled = (s['_attackRaw'] - min_atk) / range_atk
            def_scaled = (max_def - s['_defenseRaw']) / range_def
            s['ctx_fixture_attack'] = round(float(atk_scaled), 4)
            s['ctx_fixture_defense'] = round(float(def_scaled), 4)
            s['feature_vector'] = clean_and_vectorize(s, pos)
            
        final_datasets[pos] = partials
        print(f"Processed {pos}: {len(partials)} samples")

    # Third Pass: Store
    print(f"\nStoring preprocessed data in SQLite...")
    cursor.execute("DELETE FROM preprocessed_data")
    
    insert_data = []
    for pos, data in final_datasets.items():
        for s in data:
            feat_vec = np.array(s['feature_vector'], dtype=np.float32)
            feat_blob = feat_vec.tobytes()
            
            metadata = {
                'name': s['name'],
                'id': s['id'],
                'team': s['team'],
                'gw': s['gw'],
                'season': s['season'],
                'target': s.get('target', 0),
                'selected_by_percent': s['selected_by_percent'],
                'ctx_was_home': s['ctx_was_home'],
                'ctx_opponent': s['ctx_opponent'],
                'ctx_difficulty': s['ctx_difficulty'],
                'ctx_price': s['ctx_price'],
                'ctx_hours_rest': s['ctx_hours_rest'],
                'ctx_ownership': s['ctx_ownership'],
                'ctx_chance_of_playing': s['ctx_chance_of_playing'],
                'ctx_fixture_attack': s['ctx_fixture_attack'],
                'ctx_fixture_defense': s['ctx_fixture_defense'],
                'agg_r6': s['agg_r6']
            }
            
            insert_data.append((
                s['id'], s['gw'], s['season'], pos, 
                1 if s['is_future'] else 0,
                s['target_class'], feat_blob, json.dumps(metadata)
            ))

    cursor.executemany("""
        INSERT OR REPLACE INTO preprocessed_data 
        (player_id, gw, season, position, is_future, target_class, feature_vector, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, insert_data)

    conn.commit()
    conn.close()
    print(f"Successfully stored all samples in SQLite.")

if __name__ == "__main__":
    main()

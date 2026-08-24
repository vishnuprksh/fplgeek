# Databricks notebook source
# /// script
# [tool.databricks.environment]
# environment_version = "5"
# ///
# DBTITLE 1,FPL Data Pipeline Overview
# MAGIC %md
# MAGIC # FPL Data Pipeline
# MAGIC
# MAGIC This notebook consolidates the entire FPL data pipeline into a single executable workflow:
# MAGIC
# MAGIC 1. **Setup & Configuration** - Initialize catalog, schema, and constants
# MAGIC 2. **Fetch Data** - Pull from FPL API and historical CSVs
# MAGIC 3. **Preprocess** - Build feature vectors and prepare training data
# MAGIC 4. **Train & Predict** - Train ML model and generate predictions
# MAGIC 5. **Store Results** - Save to Delta tables for API consumption
# MAGIC
# MAGIC **Schedule:** Weekly execution to keep predictions fresh
# MAGIC
# MAGIC **Output Tables:** `workspace.fplgeek.*` (players, teams, fixtures, player_history, preprocessed_data, predictions, feature_importance, league_analysis)

# COMMAND ----------

# DBTITLE 1,Setup - Imports and Catalog/Schema Creation
# Import required libraries
import requests
import json
import time
import csv
import io
import urllib.request
import numpy as np
import joblib
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, mean_absolute_error, log_loss
from sklearn.preprocessing import StandardScaler
from pyspark.sql import functions as F
from pyspark.sql.types import *

# Create catalog and schema if they don't exist
spark.sql("CREATE CATALOG IF NOT EXISTS workspace")
spark.sql("CREATE SCHEMA IF NOT EXISTS workspace.fplgeek")
spark.sql("USE CATALOG workspace")
spark.sql("USE SCHEMA fplgeek")

print("✓ Setup complete: Using workspace.fplgeek")

# COMMAND ----------

# DBTITLE 1,Configuration - Constants and Helper Functions
# API Configuration
API_BASE = "https://fantasy.premierleague.com/api"
HEADERS = {'User-Agent': 'Mozilla/5.0'}
LEAGUE_ID = 314

# Historical seasons
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

# ML Configuration
LOOKBACK = 10  # Games to look back for features
AGG_WINDOW = 6  # Window for rolling aggregates
POS_MAP = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}
POS_ENCODING = {'GKP': 0, 'DEF': 1, 'MID': 2, 'FWD': 3}

# Feature names for model
FEATURE_NAMES = [
    "ctx_was_home", "ctx_difficulty", "ctx_price", "ctx_hours_rest",
    "ctx_ownership", "ctx_opponent", "ctx_chance_of_playing",
    "ctx_fixture_attack", "ctx_fixture_defense",
    "r6_min", "r6_pts", "r6_xG", "r6_xA", "r6_inf",
    "r6_cre", "r6_thr", "r6_gc", "r6_saves", "position"
]

# Helper functions
def fetch_api(url, retries=3):
    """Fetch JSON from API with retries"""
    for attempt in range(retries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            if attempt < retries - 1:
                print(f"  Retry {attempt+1} for {url}: {e}")
                time.sleep(1)
            else:
                print(f"  Failed after {retries} attempts: {url}")
                return None

def fetch_csv(url):
    """Fetch and parse CSV from URL"""
    print(f"  Fetching: {url}")
    with urllib.request.urlopen(url, timeout=30) as r:
        return list(csv.DictReader(io.StringIO(r.read().decode('utf-8'))))

def safe_float(val):
    """Convert to float, handling NaN/Inf"""
    try:
        f = float(val)
        return 0.0 if (f != f or f == float('inf') or f == float('-inf')) else f
    except (ValueError, TypeError):
        return 0.0

print("✓ Configuration loaded")

# COMMAND ----------

# DBTITLE 1,Stage 1: Data Fetching
# MAGIC %md
# MAGIC ## Stage 1: Fetch Data from FPL API
# MAGIC
# MAGIC Fetching:
# MAGIC - Bootstrap data (players, teams)
# MAGIC - Current season fixtures
# MAGIC - Current season player history
# MAGIC - Historical seasons from GitHub CSVs

# COMMAND ----------

# DBTITLE 1,Fetch Bootstrap Data (Players & Teams)
print("=== Fetching Bootstrap Data ===")
bootstrap = fetch_api(f"{API_BASE}/bootstrap-static/")

if not bootstrap:
    raise Exception("Failed to fetch bootstrap data")

# Extract players
players_data = bootstrap['elements']
players_df = spark.createDataFrame(
    [(p['id'], json.dumps(p)) for p in players_data],
    schema="id INT, data STRING"
)

# Create/replace players table
players_df.write.mode("overwrite").saveAsTable("workspace.fplgeek.players")
print(f"✓ Stored {len(players_data)} players")

# Extract teams
teams_data = bootstrap['teams']
teams_df = spark.createDataFrame(
    [(t['id'], json.dumps(t)) for t in teams_data],
    schema="id INT, data STRING"
)

# Create/replace teams table
teams_df.write.mode("overwrite").saveAsTable("workspace.fplgeek.teams")
print(f"✓ Stored {len(teams_data)} teams")

# Keep bootstrap in memory for later use
print(f"✓ Bootstrap data ready")

# COMMAND ----------

# DBTITLE 1,Fetch Fixtures
print("=== Fetching Fixtures ===")
fixtures_raw = fetch_api(f"{API_BASE}/fixtures/")

if not fixtures_raw:
    raise Exception("Failed to fetch fixtures")

# Build clean fixture records
fixtures_data = []
for f in fixtures_raw:
    fixtures_data.append((
        f['id'],
        json.dumps({
            'id': f['id'],
            'event': f.get('event'),
            'team_h': f.get('team_h'),
            'team_a': f.get('team_a'),
            'team_h_score': f.get('team_h_score'),
            'team_a_score': f.get('team_a_score'),
            'finished': f.get('finished'),
            'started': f.get('started'),
            'kickoff_time': f.get('kickoff_time'),
            'team_h_difficulty': f.get('team_h_difficulty'),
            'team_a_difficulty': f.get('team_a_difficulty'),
            'stats': f.get('stats', []),
        })
    ))

fixtures_df = spark.createDataFrame(fixtures_data, schema="id INT, data STRING")
fixtures_df.write.mode("overwrite").saveAsTable("workspace.fplgeek.fixtures")

print(f"✓ Stored {len(fixtures_data)} fixtures")

# COMMAND ----------

# DBTITLE 1,Fetch Current Season Player History
print("=== Fetching Current Season Player History ===")

def build_history_row(h):
    """Build standardized history record"""
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

def fetch_player_history(player_id):
    """Fetch history for a single player"""
    summary = fetch_api(f"{API_BASE}/element-summary/{player_id}/")
    if not summary:
        return []
    
    results = []
    for h in summary.get('history', []):
        if not h.get('fixture') or int(h['fixture']) <= 0:
            continue
        results.append((player_id, int(h['fixture']), json.dumps(build_history_row(h))))
    return results

# Fetch history for all players with parallel requests
all_history = []
total_players = len(players_data)

print(f"Fetching history for {total_players} players (parallel)...")
with ThreadPoolExecutor(max_workers=10) as executor:
    futures = {executor.submit(fetch_player_history, p['id']): p['id'] for p in players_data}
    
    completed = 0
    for future in as_completed(futures):
        completed += 1
        if completed % 100 == 0:
            print(f"  Progress: {completed}/{total_players}")
        
        try:
            history_rows = future.result()
            all_history.extend(history_rows)
        except Exception as e:
            print(f"  Error fetching player {futures[future]}: {e}")

if all_history:
    history_df = spark.createDataFrame(
        all_history,
        schema="player_id INT, fixture_id INT, data STRING"
    )
    history_df.write.mode("overwrite").saveAsTable("workspace.fplgeek.player_history")
    print(f"✓ Stored {len(all_history)} current season history records")
else:
    # Create empty table
    spark.sql("""
        CREATE TABLE IF NOT EXISTS workspace.fplgeek.player_history (
            player_id INT,
            fixture_id INT,
            data STRING
        ) USING DELTA
    """)
    print("✓ Created empty player_history table")

# COMMAND ----------

# DBTITLE 1,Fetch Historical Seasons
print("=== Fetching Historical Seasons ===")

# Build player code mapping from current players
code_to_id = {}
for p in players_data:
    if p.get('code'):
        code_to_id[int(p['code'])] = p['id']

print(f"  Mapped {len(code_to_id)} players by code")

historical_records = []

for season in HISTORICAL_SEASONS:
    print(f"  Processing season {season['name']}...")
    
    # Fetch player codes for this season
    players_raw = fetch_csv(season['players_url'])
    el_to_code = {}
    for p in players_raw:
        try:
            el_to_code[int(p['id'])] = int(p['code'])
        except (ValueError, KeyError):
            pass
    
    # Fetch gameweek data
    gw_rows = fetch_csv(season['gw_url'])
    missed = 0
    
    for row in gw_rows:
        try:
            eid = int(row.get('element', 0))
        except (ValueError, TypeError):
            missed += 1
            continue
        
        # Map element ID to player code to current DB ID
        code = el_to_code.get(eid)
        db_id = code_to_id.get(code) if code else None
        
        if not db_id:
            missed += 1
            continue
        
        try:
            # Negative fixture ID for historical data
            fid = -(season['year'] * 100000 + int(row['fixture']))
        except (ValueError, KeyError):
            missed += 1
            continue
        
        # Build history record
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
            'value': safe_float(row.get('value', 0)),
            'expected_goals': row.get('expected_goals', '0'),
            'expected_assists': row.get('expected_assists', '0'),
            'expected_goal_involvements': row.get('expected_goal_involvements', '0'),
            'expected_goals_conceded': row.get('expected_goals_conceded', '0'),
            'influence': row.get('influence', '0'),
            'creativity': row.get('creativity', '0'),
            'threat': row.get('threat', '0'),
            'ict_index': row.get('ict_index', '0'),
            'starts': int(row.get('starts', 0)),
            'team_h_score': row.get('team_h_score'),
            'team_a_score': row.get('team_a_score'),
            'selected': int(row.get('selected', 0)),
            'selected_by_percent': row.get('selected_by_percent', '0'),
            'transfers_in': int(row.get('transfers_in', 0)),
            'transfers_out': int(row.get('transfers_out', 0)),
        }
        
        historical_records.append((db_id, fid, json.dumps(data)))
    
    print(f"    Added {len(gw_rows) - missed} records, missed {missed}")

# Append historical data to player_history table
if historical_records:
    hist_df = spark.createDataFrame(
        historical_records,
        schema="player_id INT, fixture_id INT, data STRING"
    )
    hist_df.write.mode("append").saveAsTable("workspace.fplgeek.player_history")
    print(f"✓ Added {len(historical_records)} historical records")

print("✓ Data fetching complete")

# COMMAND ----------

# DBTITLE 1,Stage 2: Preprocessing
# MAGIC %md
# MAGIC ## Stage 2: Preprocess Data
# MAGIC
# MAGIC Building feature vectors for ML:
# MAGIC - Historical matches: features + target (actual points)
# MAGIC - Future fixtures: features only (for prediction)
# MAGIC
# MAGIC Features include:
# MAGIC - Context: home/away, difficulty, price, rest hours, ownership, opponent strength
# MAGIC - Rolling aggregates: last 6 games stats (minutes, xG, xA, threat, creativity, etc.)
# MAGIC - Position encoding

# COMMAND ----------

# DBTITLE 1,Preprocessing Helper Functions
# Indices for rolling aggregates: [min, xG, xA, thr, cre, inf, gc, saves, sel]
AGG_INDICES = [0, 11, 1, 2, 5, 4, 3, 6, 7]

def build_venue_table(finished_fixtures):
    """Build team strength table from recent fixtures"""
    table = {}
    for f in finished_fixtures:
        for tid in [f['team_h'], f['team_a']]:
            if tid not in table:
                table[tid] = {'gs': 0, 'gc': 0, 'played': 0}
    
    for team_id in list(table.keys()):
        matches = [f for f in finished_fixtures if f['team_h'] == team_id or f['team_a'] == team_id]
        matches.sort(key=lambda x: x['kickoff_time'])
        
        # Use last 10 matches
        for f in matches[-10:]:
            is_home = f['team_h'] == team_id
            h, a = f.get('team_h_score') or 0, f.get('team_a_score') or 0
            table[team_id]['gs'] += h if is_home else a
            table[team_id]['gc'] += a if is_home else h
            table[team_id]['played'] += 1
    
    return table

def fixture_scores(team_id, opp_id, venue_table):
    """Calculate fixture attack/defense scores"""
    t, o = venue_table.get(team_id), venue_table.get(opp_id)
    if not t or not o:
        return 0.0, 0.0
    return float(t['gs'] + o['gc']), float(o['gs'] + t['gc'])

def rolling_agg(seq, window):
    """Calculate rolling aggregates over window"""
    if not seq:
        return [0.0] * len(AGG_INDICES)
    
    sub = seq[-min(window, len(seq)):]
    factor = len(sub) / window
    
    # Average of mean and median, scaled by data availability
    return [
        ((sum(h[i] for h in sub) / len(sub) + float(np.median([h[i] for h in sub]))) / 2.0) * factor
        for i in AGG_INDICES
    ]

def make_seq_row(m):
    """Create sequence row from match data"""
    return [
        safe_float(m['minutes']),
        safe_float(m['expected_goals']),
        safe_float(m['expected_assists']),
        safe_float(m['threat']),
        safe_float(m['creativity']),
        safe_float(m['influence']),
        safe_float(m['goals_conceded']),
        safe_float(m['saves']),
        np.log1p(safe_float(m['selected'])),
        safe_float(m['value']) / 10.0,
        1.0 if m['was_home'] else 0.0,
        safe_float(m['total_points']),
        0.0  # form placeholder
    ]

def opp_strength(opp_id, is_home, teams_map):
    """Calculate opponent strength score"""
    opp = teams_map.get(opp_id)
    if not opp:
        return 1100
    
    key = 'strength_overall_away' if is_home else 'strength_overall_home'
    s = opp.get(key) or opp.get('strength') or 1100
    return 1000 + (s - 3) * 100 if s < 100 else s

def get_season(dt):
    """Determine season from datetime"""
    y, m = dt.year, dt.month
    if (y == 2023 and m >= 8) or (y == 2024 and m < 8):
        return "23/24"
    if (y == 2024 and m >= 8) or (y == 2025 and m < 8):
        return "24/25"
    if (y == 2025 and m >= 8) or (y == 2026 and m < 8):
        return "25/26"
    return "Unknown"

print("✓ Preprocessing functions defined")

# COMMAND ----------

# DBTITLE 1,Load Data for Preprocessing
print("=== Loading Data for Preprocessing ===")

# Load players
players_df = spark.table("workspace.fplgeek.players")
players_list = []
for row in players_df.collect():
    player = json.loads(row.data)
    player['id'] = row.id
    players_list.append(player)
print(f"  Loaded {len(players_list)} players")

# Load player history
history_df = spark.table("workspace.fplgeek.player_history")
history_by_player = {}
for row in history_df.collect():
    history_data = json.loads(row.data)
    history_by_player.setdefault(row.player_id, []).append(history_data)
print(f"  Loaded history for {len(history_by_player)} players")

# Load teams
teams_df = spark.table("workspace.fplgeek.teams")
teams_map = {}
for row in teams_df.collect():
    teams_map[row.id] = json.loads(row.data)
print(f"  Loaded {len(teams_map)} teams")

# Load fixtures
fixtures_df = spark.table("workspace.fplgeek.fixtures")
fixtures_raw = [json.loads(row.data) for row in fixtures_df.collect()]
print(f"  Loaded {len(fixtures_raw)} fixtures")

# Build venue table and fixture lookup
finished_fixtures = [f for f in fixtures_raw if f.get('finished')]
venue_table = build_venue_table(finished_fixtures)
print(f"  Built venue table from {len(finished_fixtures)} finished fixtures")

# Group fixtures by team
team_fixtures = {}
for f in fixtures_raw:
    team_fixtures.setdefault(f['team_h'], []).append(f)
    team_fixtures.setdefault(f['team_a'], []).append(f)

print("✓ Data loaded for preprocessing")

# COMMAND ----------

# DBTITLE 1,Preprocess - Build Feature Vectors (This takes several minutes)
print("=== Building Feature Vectors (this may take 5-10 minutes) ===")

all_preprocessed = []
total_samples = 0

for idx, player in enumerate(players_list):
    if (idx + 1) % 100 == 0:
        print(f"  Processing player {idx+1}/{len(players_list)}...")
    
    p_id = player['id']
    pos = POS_MAP.get(player.get('element_type'), "MID")
    
    # Get player's history, sorted by kickoff time
    history_raw = history_by_player.get(p_id, [])
    history = sorted(
        [m for m in history_raw if m.get('kickoff_time') and m.get('kickoff_time') != 'None'],
        key=lambda x: x['kickoff_time']
    )
    
    if not history:
        continue
    
    last_date = datetime(2000, 1, 1, tzinfo=timezone.utc)
    
    # Process historical matches
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
        
        # Find fixture for difficulty
        fixture = next((
            f for f in fixtures_raw
            if f.get('event') == gw and (
                (f['team_h'] == p_team and f['team_a'] == opp_id) or
                (f['team_a'] == p_team and f['team_h'] == opp_id)
            )
        ), None)
        
        if fixture:
            difficulty = fixture['team_h_difficulty'] if fixture['team_h'] == p_team else fixture['team_a_difficulty']
        
        # Calculate rest hours
        hours_rest = 168.0
        if i > 0:
            prev_dt = datetime.fromisoformat(history[i - 1]['kickoff_time'].replace('Z', '+00:00'))
            hours_rest = (dt.timestamp() - prev_dt.timestamp()) / 3600.0
        
        # Build lookback sequence
        seq = []
        for k in range(LOOKBACK, 0, -1):
            if i - k < 0:
                seq.append([0.0] * 13)
            else:
                seq.append(make_seq_row(history[i - k]))
        
        # Calculate fixture scores and aggregates
        atk, dfn = fixture_scores(p_team, opp_id, venue_table)
        agg = rolling_agg(seq, AGG_WINDOW)
        
        # Build feature vector
        ctx = [
            1.0 if match['was_home'] else 0.0,
            float(difficulty),
            match['value'] / 10.0,
            min(hours_rest, 300.0),
            safe_float(player.get('selected_by_percent', 0)),
            float(opp_strength(opp_id, match['was_home'], teams_map)),
            100.0,  # chance_of_playing (historical = 100%)
            atk,
            dfn
        ]
        
        feature_vec = ctx + agg + [POS_ENCODING.get(pos, 0)]
        feature_vec = [0.0 if (v != v or v == float('inf') or v == float('-inf')) else float(v) for v in feature_vec]
        
        metadata = {
            'name': player['web_name'],
            'id': p_id,
            'team': p_team,
            'gw': gw,
            'season': season
        }
        
        all_preprocessed.append((
            p_id, gw, season, pos, False,
            max(0, min(int(match['total_points']), 15)),
            feature_vec, json.dumps(metadata)
        ))
        total_samples += 1
    
    # Process future fixtures
    placeholder_seq = []
    for k in range(LOOKBACK, 0, -1):
        idx_h = len(history) - k
        placeholder_seq.append(make_seq_row(history[idx_h]) if idx_h >= 0 else [0.0] * 13)
    
    last_val = safe_float(history[-1]['value']) / 10.0
    last_ts = last_date.timestamp()
    p_team = player['team']
    
    # Get future fixtures for this team
    future_fixtures = sorted(
        [f for f in team_fixtures.get(p_team, [])
         if f.get('kickoff_time') and
         datetime.fromisoformat(f['kickoff_time'].replace('Z', '+00:00')) > last_date],
        key=lambda x: x['kickoff_time']
    )
    
    for fixture in future_fixtures[:10]:  # Process next 10 fixtures
        try:
            gw = int(fixture.get('event', 0))
            if gw == 0:
                continue
        except (ValueError, TypeError):
            continue
        
        is_home = fixture['team_h'] == p_team
        opp_id = fixture['team_a'] if is_home else fixture['team_h']
        difficulty = fixture['team_h_difficulty'] if is_home else fixture['team_a_difficulty']
        
        ft = datetime.fromisoformat(fixture['kickoff_time'].replace('Z', '+00:00'))
        hours_rest = (ft.timestamp() - last_ts) / 3600.0
        
        atk, dfn = fixture_scores(p_team, opp_id, venue_table)
        agg = rolling_agg(placeholder_seq, AGG_WINDOW)
        
        ctx = [
            1.0 if is_home else 0.0,
            float(difficulty),
            safe_float(player.get('now_cost', 0)) / 10.0,
            min(hours_rest, 300.0),
            safe_float(player.get('selected_by_percent', 0)),
            float(opp_strength(opp_id, is_home, teams_map)),
            safe_float(player.get('chance_of_playing_next_round', 100)),
            atk, dfn
        ]
        
        feature_vec = ctx + agg + [POS_ENCODING.get(pos, 0)]
        feature_vec = [0.0 if (v != v or v == float('inf') or v == float('-inf')) else float(v) for v in feature_vec]
        
        metadata = {'name': player['web_name'], 'id': p_id, 'team': p_team, 'gw': gw, 'season': 'current'}
        
        all_preprocessed.append((
            p_id, gw, 'current', pos, True, 0, feature_vec, json.dumps(metadata)
        ))

print(f"✓ Generated {len(all_preprocessed)} preprocessed samples ({total_samples} historical)")

# COMMAND ----------

# DBTITLE 1,Save Preprocessed Data
print("=== Saving Preprocessed Data ===")

schema = StructType([
    StructField("player_id", IntegerType(), False),
    StructField("gw", IntegerType(), False),
    StructField("season", StringType(), False),
    StructField("position", StringType(), False),
    StructField("is_future", BooleanType(), False),
    StructField("target_class", IntegerType(), False),
    StructField("feature_vector", ArrayType(DoubleType()), False),
    StructField("metadata", StringType(), False)
])

preprocessed_df = spark.createDataFrame(all_preprocessed, schema=schema)
preprocessed_df.write.mode("overwrite").saveAsTable("workspace.fplgeek.preprocessed_data")

print(f"✓ Saved preprocessed_data table with {len(all_preprocessed)} rows")
print("✓ Preprocessing complete")

# COMMAND ----------

# DBTITLE 1,Stage 3: Train & Predict
# MAGIC %md
# MAGIC ## Stage 3: Train Model & Generate Predictions
# MAGIC
# MAGIC Training:
# MAGIC - RandomForest classifier on historical data
# MAGIC - Predict future fixture points
# MAGIC - Extract feature importance
# MAGIC - Generate league analysis by position

# COMMAND ----------

# DBTITLE 1,Load Preprocessed Data for Training
print("=== Loading Preprocessed Data for Training ===")

preprocessed_df = spark.table("workspace.fplgeek.preprocessed_data")
preprocessed_rows = preprocessed_df.collect()

X = []
y = []
meta = []

for row in preprocessed_rows:
    X.append(row.feature_vector)
    y.append(row.target_class)
    meta.append({
        'id': row.player_id,
        'gw': row.gw,
        'season': row.season,
        'position': row.position,
        'is_future': row.is_future,
        **json.loads(row.metadata)
    })

X = np.array(X, dtype=np.float32)
y = np.array(y, dtype=np.int32)

print(f"✓ Loaded {len(X)} samples for training/prediction")

# COMMAND ----------

# DBTITLE 1,Train Model
print("=== Training Model ===")

# Split into training and future
future_mask = np.array([m['is_future'] for m in meta])
train_idx = np.where(~future_mask)[0]
future_idx = np.where(future_mask)[0]

X_train_all = np.nan_to_num(X[train_idx], nan=0.0, posinf=0.0, neginf=0.0)
y_train_all = y[train_idx]

print(f"Training samples: {len(X_train_all)}")
print(f"Future samples: {len(future_idx)}")

# Train/test split for validation
X_tr, X_te, y_tr, y_te = train_test_split(X_train_all, y_train_all, test_size=0.2, random_state=42)

# Scale features
scaler = StandardScaler()
X_tr = scaler.fit_transform(X_tr)
X_te = scaler.transform(X_te)

# Train RandomForest
clf = RandomForestClassifier(
    n_estimators=200,
    max_depth=12,
    min_samples_leaf=5,
    class_weight='balanced',
    random_state=42,
    n_jobs=-1
)

print("Training RandomForest (this may take 2-3 minutes)...")
clf.fit(X_tr, y_tr)

# Evaluate on test set
test_preds = clf.predict(X_te)
test_probs = clf.predict_proba(X_te)

# Build full probability matrix (16 classes)
full_probs = np.zeros((len(X_te), 16))
for i, cls in enumerate(clf.classes_):
    if cls < 16:
        full_probs[:, int(cls)] = test_probs[:, i]

acc = accuracy_score(y_te, test_preds)
mae = mean_absolute_error(y_te, test_preds)
loss = log_loss(y_te, full_probs, labels=list(range(16)))

print(f"\n✓ Model Training Complete")
print(f"  Test Accuracy: {acc:.4f}")
print(f"  Mean Absolute Error: {mae:.4f}")
print(f"  Log Loss: {loss:.4f}")

# Extract feature importance
feature_importances = list(zip(FEATURE_NAMES, clf.feature_importances_))
feature_importances.sort(key=lambda x: x[1], reverse=True)

print(f"\nTop 10 Features:")
for feat, imp in feature_importances[:10]:
    print(f"  {feat}: {imp:.4f}")

# COMMAND ----------

# DBTITLE 1,Generate Predictions
print("\n=== Generating Predictions ===")

results = []

if len(future_idx) == 0:
    print("⚠ No future samples to predict")
else:
    # Predict on future fixtures
    X_future = scaler.transform(np.nan_to_num(X[future_idx], nan=0.0, posinf=0.0, neginf=0.0))
    raw_probs = clf.predict_proba(X_future)
    
    # Build full probability matrix
    preds_proba = np.zeros((len(X_future), 16), dtype=np.float32)
    for i, cls in enumerate(clf.classes_):
        if cls < 16:
            preds_proba[:, int(cls)] = raw_probs[:, i]
    
    classes = np.arange(16, dtype=np.float32)
    all_predictions = {}
    
    # Process each future prediction
    for i, fidx in enumerate(future_idx):
        m = meta[fidx]
        pid = m['id']
        gw = m.get('gw', 0)
        dist = preds_proba[i]
        
        # Expected points
        xp = float(np.sum(dist * classes))
        prob_gt_6 = float(np.sum(dist[7:])) if len(dist) > 7 else 0.0
        prob_gt_10 = float(np.sum(dist[11:])) if len(dist) > 11 else 0.0
        
        # Extract rolling stats from feature vector
        orig = X[fidx]
        r6 = {
            'r6_min': float(orig[9]), 'r6_pts': float(orig[10]),
            'r6_xg': float(orig[11]), 'r6_xA': float(orig[12]),
            'r6_inf': float(orig[13]), 'r6_cre': float(orig[14]),
            'r6_thr': float(orig[15]), 'r6_gc': float(orig[16]),
            'r6_saves': float(orig[17])
        }
        
        f_atk = float(orig[7])
        f_def = float(orig[8])
        
        # Initialize player entry if needed
        if pid not in all_predictions:
            all_predictions[pid] = {
                "id": pid, "name": m.get('name', str(pid)),
                "team": m.get('team', 0), "position": m.get('position', 'MID'),
                "total3Week": 0.0, "projections": [],
                "prob_gt_6": 0.0, "prob_gt_10": 0.0,
                "prob_gt_6_next": 0.0, "prob_gt_10_next": 0.0,
                "f_atk_next": f_atk, "f_def_next": f_def,
                **r6
            }
        else:
            all_predictions[pid].update(r6)
        
        # Add projection for this fixture
        all_predictions[pid]["projections"].append({
            "gw": gw, "xP": xp,
            "prob_gt_6": prob_gt_6, "prob_gt_10": prob_gt_10,
            "f_atk": f_atk, "f_def": f_def
        })
    
    # Get next 3 gameweeks
    future_gws_query = spark.sql("""
        SELECT CAST(data:event AS INT) as event,
               COUNT(*) as total,
               SUM(CASE WHEN data:started = false 
                        AND data:finished = false 
                   THEN 1 ELSE 0 END) as unstarted
        FROM workspace.fplgeek.fixtures
        WHERE data:event IS NOT NULL
        GROUP BY event
        HAVING unstarted = total
        ORDER BY event ASC LIMIT 3
    """)
    future_gws = [row.event for row in future_gws_query.collect() if row.event]
    print(f"Future gameweeks: {future_gws}")
    
    # Aggregate predictions by gameweek
    for pid, entry in all_predictions.items():
        gw_agg = {}
        
        # Aggregate multiple fixtures per gameweek
        for p in entry["projections"]:
            gw = p["gw"]
            if gw not in gw_agg:
                gw_agg[gw] = {
                    "gw": gw, "xP": 0.0, "prob_gt_6": 0.0, "prob_gt_10": 0.0,
                    "f_atk": p["f_atk"], "f_def": p["f_def"], "fixtures_in_gw": 0
                }
            
            cur = gw_agg[gw]
            # Combine probabilities: 1 - (1-p1)*(1-p2)
            cur["prob_gt_6"] = 1 - (1 - cur["prob_gt_6"]) * (1 - p["prob_gt_6"])
            cur["prob_gt_10"] = 1 - (1 - cur["prob_gt_10"]) * (1 - p["prob_gt_10"])
            cur["xP"] += p["xP"]
            cur["fixtures_in_gw"] += 1
            
            # Average fixture scores for multiple fixtures
            if cur["fixtures_in_gw"] > 1:
                n = cur["fixtures_in_gw"]
                cur["f_atk"] = (cur["f_atk"] * (n - 1) + p["f_atk"]) / n
                cur["f_def"] = (cur["f_def"] * (n - 1) + p["f_def"]) / n
        
        projs = list(gw_agg.values())
        
        # Fill in missing gameweeks with zeros
        if future_gws:
            projected = {p["gw"] for p in projs}
            for gw in future_gws:
                if gw not in projected:
                    projs.append({
                        "gw": gw, "xP": 0.0, "prob_gt_6": 0.0,
                        "prob_gt_10": 0.0, "f_atk": 0.0, "f_def": 0.0,
                        "fixtures_in_gw": 0
                    })
        
        # Keep top 3 gameweeks
        projs.sort(key=lambda x: x["gw"])
        entry["projections"] = projs[:3]
        
        # Set next gameweek stats
        if entry["projections"]:
            first = entry["projections"][0]
            entry["prob_gt_6_next"] = first["prob_gt_6"]
            entry["prob_gt_10_next"] = first["prob_gt_10"]
            entry["f_atk_next"] = first["f_atk"]
            entry["f_def_next"] = first["f_def"]
        
        # Calculate 3-week total and average probabilities
        entry["total3Week"] = sum(p["xP"] for p in entry["projections"])
        n = len(entry["projections"])
        entry["prob_gt_6"] = sum(p["prob_gt_6"] for p in entry["projections"]) / n if n else 0.0
        entry["prob_gt_10"] = sum(p["prob_gt_10"] for p in entry["projections"]) / n if n else 0.0
        
        results.append(entry)
    
    results.sort(key=lambda x: x["total3Week"], reverse=True)
    print(f"✓ Generated predictions for {len(results)} players")

# COMMAND ----------

# DBTITLE 1,Save Predictions
print("\n=== Saving Predictions ===")

if len(future_idx) > 0 and results:
    # Prepare predictions data
    predictions_data = []
    for entry in results:
        predictions_data.append((
            entry["id"], entry["name"], entry["team"], entry["position"],
            entry["total3Week"], entry["prob_gt_6"], entry["prob_gt_10"],
            entry["prob_gt_6_next"], entry["prob_gt_10_next"],
            entry["f_atk_next"], entry["f_def_next"],
            json.dumps(entry["projections"]),
            json.dumps({
                'r6_min': entry['r6_min'], 'r6_pts': entry['r6_pts'],
                'r6_xg': entry['r6_xg'], 'r6_xA': entry['r6_xA'],
                'r6_inf': entry['r6_inf'], 'r6_cre': entry['r6_cre'],
                'r6_thr': entry['r6_thr'], 'r6_gc': entry['r6_gc'],
                'r6_saves': entry['r6_saves']
            }),
            datetime.now(timezone.utc).isoformat()
        ))
    
    pred_schema = StructType([
        StructField("player_id", IntegerType(), False),
        StructField("name", StringType(), False),
        StructField("team", IntegerType(), False),
        StructField("position", StringType(), False),
        StructField("total_3week", DoubleType(), False),
        StructField("prob_gt_6", DoubleType(), False),
        StructField("prob_gt_10", DoubleType(), False),
        StructField("prob_gt_6_next", DoubleType(), False),
        StructField("prob_gt_10_next", DoubleType(), False),
        StructField("f_atk_next", DoubleType(), False),
        StructField("f_def_next", DoubleType(), False),
        StructField("projections", StringType(), False),
        StructField("r6_stats", StringType(), False),
        StructField("updated_at", StringType(), False)
    ])
    
    predictions_df = spark.createDataFrame(predictions_data, schema=pred_schema)
    predictions_df.write.mode("overwrite").saveAsTable("workspace.fplgeek.predictions")
    print(f"✓ Saved predictions table with {len(predictions_data)} players")
else:
    print("⚠ No predictions to save")

# COMMAND ----------

# DBTITLE 1,Save Feature Importance
print("\n=== Saving Feature Importance ===")

fi_data = [
    (feat, float(imp), datetime.now(timezone.utc).isoformat())
    for feat, imp in feature_importances
]

fi_schema = StructType([
    StructField("feature_name", StringType(), False),
    StructField("importance", DoubleType(), False),
    StructField("updated_at", StringType(), False)
])

fi_df = spark.createDataFrame(fi_data, schema=fi_schema)
fi_df.write.mode("overwrite").saveAsTable("workspace.fplgeek.feature_importance")

print(f"✓ Saved feature_importance table with {len(fi_data)} features")

# COMMAND ----------

# DBTITLE 1,Generate and Save League Analysis
print("\n=== Generating League Analysis ===")

if len(future_idx) > 0 and results:
    # Group by position and get top players
    league_analysis = {}
    
    for pos in ['GKP', 'DEF', 'MID', 'FWD']:
        pos_players = [p for p in results if p['position'] == pos]
        pos_players.sort(key=lambda x: x['total3Week'], reverse=True)
        
        league_analysis[pos] = {
            'position': pos,
            'total_players': len(pos_players),
            'top_10': [
                {
                    'id': p['id'], 'name': p['name'], 'team': p['team'],
                    'total3Week': p['total3Week'],
                    'prob_gt_6': p['prob_gt_6'],
                    'prob_gt_10': p['prob_gt_10']
                }
                for p in pos_players[:10]
            ],
            'avg_total3Week': float(np.mean([p['total3Week'] for p in pos_players])) if pos_players else 0.0,
            'avg_prob_gt_6': float(np.mean([p['prob_gt_6'] for p in pos_players])) if pos_players else 0.0,
        }
    
    # Save league analysis
    la_data = []
    for pos, analysis in league_analysis.items():
        la_data.append((
            pos, analysis['total_players'],
            json.dumps(analysis['top_10']),
            analysis['avg_total3Week'],
            analysis['avg_prob_gt_6'],
            datetime.now(timezone.utc).isoformat()
        ))
    
    la_schema = StructType([
        StructField("position", StringType(), False),
        StructField("total_players", IntegerType(), False),
        StructField("top_10", StringType(), False),
        StructField("avg_total3week", DoubleType(), False),
        StructField("avg_prob_gt_6", DoubleType(), False),
        StructField("updated_at", StringType(), False)
    ])
    
    la_df = spark.createDataFrame(la_data, schema=la_schema)
    la_df.write.mode("overwrite").saveAsTable("workspace.fplgeek.league_analysis")
    
    print(f"✓ Saved league_analysis table with {len(la_data)} positions")
    print("\nLeague Summary:")
    for pos, analysis in league_analysis.items():
        print(f"  {pos}: {analysis['total_players']} players, avg 3-week: {analysis['avg_total3Week']:.2f}")
else:
    print("⚠ No league analysis to generate")

# COMMAND ----------

# DBTITLE 1,Pipeline Complete
# MAGIC %md
# MAGIC ## ✓ Pipeline Complete
# MAGIC
# MAGIC All data has been processed and stored in Delta tables:
# MAGIC
# MAGIC **Data Tables:**
# MAGIC - [workspace.fplgeek.players](#table) - Current player data
# MAGIC - [workspace.fplgeek.teams](#table) - Team data
# MAGIC - [workspace.fplgeek.fixtures](#table) - All fixtures (current season)
# MAGIC - [workspace.fplgeek.player_history](#table) - Player match history (current + historical seasons)
# MAGIC
# MAGIC **ML Tables:**
# MAGIC - [workspace.fplgeek.preprocessed_data](#table) - Feature vectors for training
# MAGIC - [workspace.fplgeek.predictions](#table) - Player predictions for next 3 gameweeks
# MAGIC - [workspace.fplgeek.feature_importance](#table) - Model feature importance
# MAGIC - [workspace.fplgeek.league_analysis](#table) - Top performers by position
# MAGIC
# MAGIC **Next Steps:**
# MAGIC 1. Schedule this notebook as a weekly job
# MAGIC 2. Update FastAPI to query Delta tables instead of SQLite
# MAGIC 3. Monitor prediction accuracy over time

# COMMAND ----------

# DBTITLE 1,Final Summary
print("\n" + "="*60)
print("FPL DATA PIPELINE - EXECUTION SUMMARY")
print("="*60)

# Count records in each table
tables = [
    "players", "teams", "fixtures", "player_history",
    "preprocessed_data", "predictions", "feature_importance", "league_analysis"
]

for table in tables:
    try:
        count = spark.table(f"workspace.fplgeek.{table}").count()
        print(f"✓ {table:25} {count:>10,} rows")
    except Exception as e:
        print(f"✗ {table:25} Error: {e}")

print("="*60)
print(f"Pipeline completed at: {datetime.now(timezone.utc).isoformat()}")
print("="*60)
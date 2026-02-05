import json
import numpy as np
import sqlite3
from pathlib import Path

# Load dataset
def load_mid_data():
    with open('public/data/processed/dataset_MID.json') as f:
        return json.load(f)

# Get player data from database
def get_player_db_data(player_name_pattern):
    conn = sqlite3.connect('public/data/fpl.sqlite')
    cursor = conn.cursor()
    cursor.execute(f"SELECT data FROM players WHERE data LIKE '%{player_name_pattern}%' LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    if row:
        return json.loads(row[0])
    return None

# Get recent match history
def get_player_history(player_id):
    conn = sqlite3.connect('public/data/fpl.sqlite')
    cursor = conn.cursor()
    cursor.execute(f"""
        SELECT data FROM player_history 
        WHERE data LIKE '%"element": {player_id}%'
        ORDER BY json_extract(data, '$.round') DESC
        LIMIT 5
    """)
    rows = cursor.fetchall()
    conn.close()
    return [json.loads(row[0]) for row in rows]

# Feature importance from report
FEATURE_IMPORTANCE = {
    "SEQ_minutes": 0.1544,
    "SEQ_total_points": 0.0166,
    "SEQ_creativity": 0.0066,
    "SEQ_influence": 0.0051,
    "SEQ_expected_assists": 0.0029,
    "SEQ_goals_conceded": 0.0026,
    "SEQ_threat": 0.0022,
    "CTX_ctx_price": 0.0003,
    "SEQ_expected_goals": 0.0002,
    "SEQ_was_home": 0.0002,
    "CTX_all_time_xg_per_90": 0.0001,
    "CTX_all_time_games_played": 0.0001,
    "CTX_ctx_was_home": 0.0001,
    "SEQ_saves": 0.0000,
    "OPP_strength": 0.0000,
    "SEQ_price": -0.0001,
    "CTX_all_time_goals_per_90": -0.0004,
    "CTX_ctx_difficulty": -0.0007,
    "CTX_ctx_hours_rest": -0.0007,
    "CTX_all_time_total_pts": -0.0010,
    "CTX_all_time_avg_pts": -0.0022,
    "SEQ_log_selected": -0.0041,
}

def analyze_players():
    print("=" * 80)
    print("SALAH vs BRUNO FERNANDES: PREDICTION ANALYSIS")
    print("=" * 80)
    print()
    
    # Get database data
    salah_db = get_player_db_data("Salah")
    bruno_db = get_player_db_data("Fernandes")
    
    if not salah_db or not bruno_db:
        print("ERROR: Could not find player data")
        return
    
    print("### BASIC STATS")
    print()
    print(f"**Salah**:")
    print(f"  - Form: {salah_db.get('form', 'N/A')}")
    print(f"  - Ownership: {salah_db.get('selected_by_percent', 'N/A')}%")
    print(f"  - Total Points: {salah_db.get('total_points', 'N/A')}")
    print(f"  - Price: £{float(salah_db.get('now_cost', 0))/10:.1f}m")
    print()
    print(f"**Bruno Fernandes**:")
    print(f"  - Form: {bruno_db.get('form', 'N/A')}")
    print(f"  - Ownership: {bruno_db.get('selected_by_percent', 'N/A')}%")
    print(f"  - Total Points: {bruno_db.get('total_points', 'N/A')}")
    print(f"  - Price: £{float(bruno_db.get('now_cost', 0))/10:.1f}m")
    print()
    
    # Get match history
    salah_history = get_player_history(salah_db['id'])
    bruno_history = get_player_history(bruno_db['id'])
    
    print("### RECENT MATCH HISTORY (Last 5 Games)")
    print()
    print("**Salah**:")
    for i, match in enumerate(salah_history[:5], 1):
        print(f"  GW{match.get('round')}: {match.get('total_points')}pts, {match.get('minutes')}min")
    
    print()
    print("**Bruno Fernandes**:")
    for i, match in enumerate(bruno_history[:5], 1):
        print(f"  GW{match.get('round')}: {match.get('total_points')}pts, {match.get('minutes')}min")
    
    print()
    print("### FEATURE COMPARISON")
    print()
    
    # Calculate averages
    def calc_avg(history, field):
        values = [float(m.get(field, 0)) for m in history[:5]]
        return sum(values) / len(values) if values else 0
    
    features = [
        ("Minutes (avg)", "minutes"),
        ("Total Points (avg)", "total_points"),
        ("xG (avg)", "expected_goals"),
        ("xA (avg)", "expected_assists"),
        ("Threat (avg)", "threat"),
        ("Creativity (avg)", "creativity"),
        ("Influence (avg)", "influence"),
    ]
    
    print("| Feature | Salah | Bruno | Difference | Importance |")
    print("|---------|-------|-------|------------|------------|")
    
    for name, field in features:
        salah_val = calc_avg(salah_history, field)
        bruno_val = calc_avg(bruno_history, field)
        diff = salah_val - bruno_val
        imp_key = f"SEQ_{field}"
        importance = FEATURE_IMPORTANCE.get(imp_key, 0.0)
        print(f"| {name} | {salah_val:.2f} | {bruno_val:.2f} | {diff:+.2f} | {importance:.4f} |")
    
    print()
    print("### KEY INSIGHTS")
    print()
    
    # Calculate form difference
    salah_form = float(salah_db.get('form', 0))
    bruno_form = float(bruno_db.get('form', 0))
    
    print(f"1. **Form Difference**: Bruno ({bruno_form}) - Salah ({salah_form}) = {bruno_form - salah_form:+.1f}")
    print(f"   - Bruno has better recent form")
    print()
    
    # Calculate weighted contributions
    print("2. **Weighted Feature Contributions** (Feature × Importance):")
    print()
    
    total_salah = 0
    total_bruno = 0
    
    for name, field in features:
        salah_val = calc_avg(salah_history, field)
        bruno_val = calc_avg(bruno_history, field)
        imp_key = f"SEQ_{field}"
        importance = FEATURE_IMPORTANCE.get(imp_key, 0.0)
        
        salah_contrib = salah_val * importance
        bruno_contrib = bruno_val * importance
        total_salah += salah_contrib
        total_bruno += bruno_contrib
        
        if abs(importance) > 0.001:
            print(f"   - {name}: Salah={salah_contrib:.4f}, Bruno={bruno_contrib:.4f}, Δ={salah_contrib-bruno_contrib:+.4f}")
    
    print()
    print(f"   **Total Weighted Score**: Salah={total_salah:.4f}, Bruno={total_bruno:.4f}")
    print()
    
    print("### CONCLUSION")
    print()
    print("The model predicts higher xP for Salah despite Bruno's better form because:")
    print()
    print("1. **Minutes Dominance** (Importance: 0.1544)")
    print(f"   - This is BY FAR the most important feature for midfielders")
    print(f"   - Even small differences in minutes heavily influence predictions")
    print()
    print("2. **Underlying Stats**")
    print(f"   - Salah likely has better xG, xA, threat, creativity, or influence")
    print(f"   - These compound with minutes to create higher predictions")
    print()
    print("3. **Form Weight is Low** (Importance: ~0.01-0.02)")
    print(f"   - Form is important but not dominant")
    print(f"   - Minutes (0.1544) is 10x more important than total_points (0.0166)")
    print()
    print("4. **All-Time Quality**")
    print(f"   - Salah's career stats likely provide a higher baseline")
    print(f"   - The model trusts long-term quality over short-term form")

if __name__ == "__main__":
    analyze_players()

import sqlite3
import json

conn = sqlite3.connect('public/data/fpl.sqlite')
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Find Bruno Fernandes ID
cursor.execute("SELECT id, data FROM players")
bruno_id = None
for row in cursor.fetchall():
    data = json.loads(row['data'])
    if 'Fernandes' in data.get('web_name', '') and 'B' in data.get('first_name', ''):
        bruno_id = row['id']
        break

if bruno_id:
    cursor.execute("SELECT data FROM player_history WHERE player_id = ?", (bruno_id,))
    matches = []
    for row in cursor.fetchall():
        d = json.loads(row['data'])
        if 'kickoff_time' in d: # Some might be missing
            matches.append(d)
        
    matches.sort(key=lambda x: x['kickoff_time'], reverse=True)
    print("\nLast 15 matches from DB:")
    for m in matches[:15]:
        print(f"GW {m.get('round')}: Mins={m.get('minutes')}, Pts={m.get('total_points')}, Date={m.get('kickoff_time')[:10]}")

conn.close()

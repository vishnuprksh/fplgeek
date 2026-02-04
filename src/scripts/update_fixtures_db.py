import sqlite3
import json
import os

DB_PATH = 'public/data/fpl.sqlite'
FIXTURES_JSON = 'live_fixtures.json'

def update_db():
    if not os.path.exists(FIXTURES_JSON):
        print(f"Error: {FIXTURES_JSON} not found.")
        return

    print(f"Reading {FIXTURES_JSON}...")
    with open(FIXTURES_JSON, 'r') as f:
        fixtures = json.load(f)
    
    print(f"Found {len(fixtures)} fixtures.")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("Clearing 'fixtures' table...")
    cursor.execute("DELETE FROM fixtures")
    
    print("Inserting new fixtures...")
    count = 0
    for fix in fixtures:
        fid = fix['id']
        data = json.dumps(fix)
        cursor.execute("INSERT INTO fixtures (id, data) VALUES (?, ?)", (fid, data))
        count += 1
    
    conn.commit()
    conn.close()
    print(f"Successfully updated {count} fixtures in DB.")

if __name__ == "__main__":
    update_db()

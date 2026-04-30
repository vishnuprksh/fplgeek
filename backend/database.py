import os
import sqlite3
import json
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))

DATABASE_URL = os.getenv('DATABASE_URL')
DATA_DIR = os.getenv('DATA_DIR', os.path.abspath(os.path.join(os.path.dirname(__file__), '../data')))
DB_PATH = os.path.join(DATA_DIR, 'fpl.sqlite')

def get_db_connection():
    """Get a connection to the Postgres database if configured, otherwise returns None."""
    if not DATABASE_URL:
        return None
    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        print(f"Error connecting to Postgres: {e}")
        return None

def get_sqlite_connection():
    """Get a connection to the local SQLite database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def initialize_database():
    """Initialize database schema in Postgres."""
    conn = get_db_connection()
    if not conn:
        return

    try:
        with conn.cursor() as cur:
            print("Initializing database schema...")
            
            # Create predictions table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS predictions (
                    id SERIAL PRIMARY KEY,
                    player_id INTEGER NOT NULL UNIQUE,
                    player_name VARCHAR(255) NOT NULL,
                    team VARCHAR(255),
                    position VARCHAR(10),
                    data JSONB NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # Create fixtures table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS fixtures (
                    id SERIAL PRIMARY KEY,
                    fixture_id INTEGER UNIQUE,
                    event INTEGER,
                    home_team VARCHAR(255),
                    away_team VARCHAR(255),
                    data JSONB NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # Create league_analysis table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS league_analysis (
                    id SERIAL PRIMARY KEY,
                    data JSONB NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # Create feature_importance table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS feature_importance (
                    id SERIAL PRIMARY KEY,
                    data JSONB NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)

            # Create indices
            cur.execute("CREATE INDEX IF NOT EXISTS idx_predictions_player_id ON predictions(player_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_fixtures_event ON fixtures(event);")
            
            conn.commit()
            print("✓ Database schema initialized successfully")
    except Exception as e:
        print(f"Failed to initialize database schema: {e}")
        conn.rollback()
    finally:
        conn.close()

def seed_initial_data():
    """Seed initial data from JSON files into Postgres."""
    conn = get_db_connection()
    if not conn:
        return

    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM predictions")
            count = cur.fetchone()[0]

            if count > 0:
                print(f"✓ Database already has {count} predictions, skipping seed")
                return

            print("Seeding initial data from JSON files...")

            # Seed predictions
            predictions_path = os.path.join(DATA_DIR, 'ai_predictions.json')
            if os.path.exists(predictions_path):
                with open(predictions_path, 'r') as f:
                    predictions = json.load(f)
                    for pred in predictions:
                        cur.execute(
                            """INSERT INTO predictions (player_id, player_name, team, position, data) 
                               VALUES (%s, %s, %s, %s, %s)
                               ON CONFLICT (player_id) DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP""",
                            (pred['player_id'], pred['player_name'], pred.get('team'), pred.get('position'), json.dumps(pred))
                        )
                print(f"✓ Seeded {len(predictions)} predictions")

            # Seed fixtures
            fixtures_path = os.path.join(DATA_DIR, 'fixtures.json')
            if os.path.exists(fixtures_path):
                with open(fixtures_path, 'r') as f:
                    fixtures = json.load(f)
                    for fixture in fixtures:
                        cur.execute(
                            """INSERT INTO fixtures (fixture_id, event, home_team, away_team, data) 
                               VALUES (%s, %s, %s, %s, %s)
                               ON CONFLICT (fixture_id) DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP""",
                            (fixture['id'], fixture.get('event'), fixture.get('home_team'), fixture.get('away_team'), json.dumps(fixture))
                        )
                print(f"✓ Seeded {len(fixtures)} fixtures")

            # Seed league_analysis
            league_path = os.path.join(DATA_DIR, 'league_analysis.json')
            if os.path.exists(league_path):
                with open(league_path, 'r') as f:
                    data = json.load(f)
                    cur.execute("INSERT INTO league_analysis (data) VALUES (%s)", (json.dumps(data),))
                print("✓ Seeded league analysis")

            # Seed feature_importance
            feat_path = os.path.join(DATA_DIR, 'feature_importance.json')
            if os.path.exists(feat_path):
                with open(feat_path, 'r') as f:
                    data = json.load(f)
                    cur.execute("INSERT INTO feature_importance (data) VALUES (%s)", (json.dumps(data),))
                print("✓ Seeded feature importance")

            conn.commit()
    except Exception as e:
        print(f"Failed to seed initial data: {e}")
        conn.rollback()
    finally:
        conn.close()

def get_predictions():
    conn = get_db_connection()
    if not conn: return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT data FROM predictions ORDER BY id")
            return [row['data'] for row in cur.fetchall()]
    finally:
        conn.close()

def get_fixtures():
    conn = get_db_connection()
    if not conn: return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT data FROM fixtures ORDER BY event, id")
            return [row['data'] for row in cur.fetchall()]
    finally:
        conn.close()

def get_league_analysis():
    conn = get_db_connection()
    if not conn: return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT data FROM league_analysis ORDER BY updated_at DESC LIMIT 1")
            row = cur.fetchone()
            return row['data'] if row else None
    finally:
        conn.close()

def get_feature_importance():
    conn = get_db_connection()
    if not conn: return None
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT data FROM feature_importance ORDER BY updated_at DESC LIMIT 1")
            row = cur.fetchone()
            return row['data'] if row else None
    finally:
        conn.close()

def ingest_predictions(predictions):
    conn = get_db_connection()
    if not conn: return
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM predictions")
            for pred in predictions:
                cur.execute(
                    "INSERT INTO predictions (player_id, player_name, team, position, data) VALUES (%s, %s, %s, %s, %s)",
                    (pred['player_id'], pred['player_name'], pred.get('team'), pred.get('position'), json.dumps(pred))
                )
            conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def ingest_fixtures(fixtures):
    conn = get_db_connection()
    if not conn: return
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM fixtures")
            for fixture in fixtures:
                cur.execute(
                    "INSERT INTO fixtures (fixture_id, event, home_team, away_team, data) VALUES (%s, %s, %s, %s, %s)",
                    (fixture['id'], fixture.get('event'), fixture.get('home_team'), fixture.get('away_team'), json.dumps(fixture))
                )
            conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def ingest_league_analysis(data):
    conn = get_db_connection()
    if not conn: return
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM league_analysis")
            cur.execute("INSERT INTO league_analysis (data) VALUES (%s)", (json.dumps(data),))
            conn.commit()
    finally:
        conn.close()

def ingest_feature_importance(data):
    conn = get_db_connection()
    if not conn: return
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM feature_importance")
            cur.execute("INSERT INTO feature_importance (data) VALUES (%s)", (json.dumps(data),))
            conn.commit()
    finally:
        conn.close()

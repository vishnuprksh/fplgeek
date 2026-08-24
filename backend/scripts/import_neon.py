"""Publish the completed SQLite staging database to Neon PostgreSQL.

The importer writes one staged data version, upserts every supported source table,
validates the staged rows, and activates the version only after validation succeeds.
The active version is never deleted during an import, so a failed run leaves the
previous production dataset available.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

try:
    import psycopg
    from psycopg import sql
    from psycopg.types.json import Jsonb
except ModuleNotFoundError:  # Dry-run mode only needs SQLite.
    psycopg = None  # type: ignore[assignment]
    sql = None  # type: ignore[assignment]
    Jsonb = None  # type: ignore[assignment, misc]


TABLES = (
    "players",
    "teams",
    "fixtures",
    "player_history",
    "preprocessed_data",
    "app_data",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="SQLite staging database path")
    parser.add_argument("--version-key", help="Stable identifier for this publication")
    parser.add_argument(
        "--database-url",
        default=os.getenv("NEON_DATABASE_URL") or os.getenv("DATABASE_URL"),
        help="Neon PostgreSQL URL (defaults to NEON_DATABASE_URL or DATABASE_URL)",
    )
    parser.add_argument(
        "--batch-size", type=int, default=500, help="Rows per PostgreSQL batch"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Validate SQLite and print counts without writing"
    )
    args = parser.parse_args()
    if args.batch_size < 1:
        parser.error("--batch-size must be greater than zero")
    return args


def source_path(value: Path | None) -> Path:
    if value:
        return value
    data_dir = Path(os.getenv("FPL_DATA_DIR", Path(__file__).parents[2] / "data"))
    return data_dir / "fpl.sqlite"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def as_int(value: Any) -> int | None:
    if value in (None, "", "None"):
        return None
    return int(value)


def as_float(value: Any) -> float | None:
    if value in (None, "", "None"):
        return None
    return float(value)


def as_json(value: Any, default: Any) -> Any:
    if value in (None, ""):
        return default
    if isinstance(value, (dict, list)):
        return value
    return json.loads(value)


def read_sqlite_counts(conn: sqlite3.Connection) -> dict[str, int]:
    counts: dict[str, int] = {}
    for table in TABLES:
        exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)
        ).fetchone()
        counts[table] = (
            conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] if exists else 0
        )
    return counts


def batches(rows: Iterable[tuple[Any, ...]], size: int) -> Iterable[list[tuple[Any, ...]]]:
    batch: list[tuple[Any, ...]] = []
    for row in rows:
        batch.append(row)
        if len(batch) == size:
            yield batch
            batch = []
    if batch:
        yield batch


def executemany_batched(
    cur: psycopg.Cursor[Any], statement: str, rows: list[tuple[Any, ...]], size: int
) -> None:
    for batch in batches(rows, size):
        cur.executemany(statement, batch)


def load_json_rows(conn: sqlite3.Connection, table: str) -> Iterable[tuple[int, dict[str, Any]]]:
    for row in conn.execute(f"SELECT id, data FROM {table}"):
        yield int(row[0]), json.loads(row[1])


def version_id(cur: psycopg.Cursor[Any], version_key: str) -> uuid.UUID:
    cur.execute(
        """
        INSERT INTO data_versions (version_key, status, metadata)
        VALUES (%s, 'staged', %s)
        ON CONFLICT (version_key) DO UPDATE SET
            status = 'staged', activated_at = NULL, metadata = EXCLUDED.metadata
        RETURNING id
        """,
        (version_key, Jsonb({"publisher": "import_neon.py"})),
    )
    return cur.fetchone()[0]


def import_teams(cur: psycopg.Cursor[Any], conn: sqlite3.Connection, vid: uuid.UUID, size: int) -> None:
    rows = []
    for team_id, data in load_json_rows(conn, "teams"):
        rows.append((
            team_id, data.get("name") or str(team_id),
            data.get("short_name"), as_int(data.get("code")), as_int(data.get("strength")),
            as_int(data.get("strength_overall_home")), as_int(data.get("strength_overall_away")),
            as_int(data.get("strength_attack_home")), as_int(data.get("strength_attack_away")),
            as_int(data.get("strength_defence_home")), as_int(data.get("strength_defence_away")),
            Jsonb(data), vid,
        ))
    executemany_batched(cur, """INSERT INTO teams
        (id, name, short_name, code, strength, strength_overall_home, strength_overall_away,
         strength_attack_home, strength_attack_away, strength_defence_home, strength_defence_away,
         payload, data_version_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, short_name=EXCLUDED.short_name,
        code=EXCLUDED.code, strength=EXCLUDED.strength, strength_overall_home=EXCLUDED.strength_overall_home,
        strength_overall_away=EXCLUDED.strength_overall_away, strength_attack_home=EXCLUDED.strength_attack_home,
        strength_attack_away=EXCLUDED.strength_attack_away, strength_defence_home=EXCLUDED.strength_defence_home,
        strength_defence_away=EXCLUDED.strength_defence_away, payload=EXCLUDED.payload,
        data_version_id=EXCLUDED.data_version_id, updated_at=now()""", rows, size)


def import_players(cur: psycopg.Cursor[Any], conn: sqlite3.Connection, vid: uuid.UUID, size: int) -> None:
    rows = []
    for player_id, data in load_json_rows(conn, "players"):
        rows.append((player_id, as_int(data.get("code")), data.get("web_name") or str(player_id),
            data.get("first_name"), data.get("second_name"), as_int(data.get("element_type")),
            as_int(data.get("team")), as_float(data.get("now_cost")), as_int(data.get("total_points")),
            as_int(data.get("event_points")), as_float(data.get("selected_by_percent")),
            as_float(data.get("form")), data.get("status"), as_int(data.get("chance_of_playing_next_round")),
            as_int(data.get("chance_of_playing_this_round")), as_int(data.get("minutes")),
            as_int(data.get("saves")), Jsonb(data), vid))
    executemany_batched(cur, """INSERT INTO players
        (id,code,web_name,first_name,second_name,element_type,team_id,now_cost,total_points,event_points,
         selected_by_percent,form,status,chance_of_playing_next_round,chance_of_playing_this_round,
         minutes,saves,payload,data_version_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (id) DO UPDATE SET code=EXCLUDED.code,web_name=EXCLUDED.web_name,
        first_name=EXCLUDED.first_name,second_name=EXCLUDED.second_name,element_type=EXCLUDED.element_type,
        team_id=EXCLUDED.team_id,now_cost=EXCLUDED.now_cost,total_points=EXCLUDED.total_points,
        event_points=EXCLUDED.event_points,selected_by_percent=EXCLUDED.selected_by_percent,form=EXCLUDED.form,
        status=EXCLUDED.status,chance_of_playing_next_round=EXCLUDED.chance_of_playing_next_round,
        chance_of_playing_this_round=EXCLUDED.chance_of_playing_this_round,minutes=EXCLUDED.minutes,
        saves=EXCLUDED.saves,payload=EXCLUDED.payload,data_version_id=EXCLUDED.data_version_id,updated_at=now()""", rows, size)


def import_fixtures(cur: psycopg.Cursor[Any], conn: sqlite3.Connection, vid: uuid.UUID, size: int) -> None:
    rows = []
    for fixture_id, data in load_json_rows(conn, "fixtures"):
        rows.append((fixture_id, as_int(data.get("event")), as_int(data.get("team_h")), as_int(data.get("team_a")),
            as_int(data.get("team_h_score")), as_int(data.get("team_a_score")), bool(data.get("finished")),
            bool(data.get("started")), data.get("kickoff_time") or None, as_int(data.get("team_h_difficulty")),
            as_int(data.get("team_a_difficulty")), Jsonb(as_json(data.get("stats"), [])), Jsonb(data), vid))
    executemany_batched(cur, """INSERT INTO fixtures
        (id,event_id,home_team_id,away_team_id,home_score,away_score,finished,started,kickoff_time,
         home_difficulty,away_difficulty,stats,payload,data_version_id) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (id) DO UPDATE SET event_id=EXCLUDED.event_id,home_team_id=EXCLUDED.home_team_id,
        away_team_id=EXCLUDED.away_team_id,home_score=EXCLUDED.home_score,away_score=EXCLUDED.away_score,
        finished=EXCLUDED.finished,started=EXCLUDED.started,kickoff_time=EXCLUDED.kickoff_time,
        home_difficulty=EXCLUDED.home_difficulty,away_difficulty=EXCLUDED.away_difficulty,stats=EXCLUDED.stats,
        payload=EXCLUDED.payload,data_version_id=EXCLUDED.data_version_id,updated_at=now()""", rows, size)


def import_history(cur: psycopg.Cursor[Any], conn: sqlite3.Connection, vid: uuid.UUID, size: int) -> None:
    rows = []
    for player_id, fixture_id, raw in conn.execute("SELECT player_id, fixture_id, data FROM player_history"):
        d = json.loads(raw)
        rows.append((player_id, fixture_id, d.get("season_name", "current"), as_int(d.get("round")), d.get("kickoff_time") or None,
            as_int(d.get("opponent_team")), d.get("was_home"), as_int(d.get("total_points")) or 0, as_int(d.get("minutes")) or 0,
            as_int(d.get("goals_scored")) or 0, as_int(d.get("assists")) or 0, as_int(d.get("clean_sheets")) or 0,
            as_int(d.get("goals_conceded")) or 0, as_int(d.get("own_goals")) or 0, as_int(d.get("penalties_saved")) or 0,
            as_int(d.get("penalties_missed")) or 0, as_int(d.get("yellow_cards")) or 0, as_int(d.get("red_cards")) or 0,
            as_int(d.get("saves")) or 0, as_int(d.get("bonus")) or 0, as_int(d.get("bps")) or 0, as_float(d.get("value")),
            as_int(d.get("selected")), as_float(d.get("selected_by_percent")), as_int(d.get("transfers_in")),
            as_int(d.get("transfers_out")), as_int(d.get("starts")), as_float(d.get("expected_goals")),
            as_float(d.get("expected_assists")), as_float(d.get("expected_goal_involvements")), as_float(d.get("expected_goals_conceded")),
            as_float(d.get("influence")), as_float(d.get("creativity")), as_float(d.get("threat")), as_float(d.get("ict_index")),
            as_int(d.get("team_h_score")), as_int(d.get("team_a_score")), Jsonb(d), vid))
    executemany_batched(cur, """INSERT INTO player_history
    (player_id,fixture_id,season_name,gameweek,kickoff_time,opponent_team_id,was_home,total_points,minutes,goals_scored,assists,
     clean_sheets,goals_conceded,own_goals,penalties_saved,penalties_missed,yellow_cards,red_cards,saves,bonus,bps,value,selected,
     selected_by_percent,transfers_in,transfers_out,starts,expected_goals,expected_assists,expected_goal_involvements,
     expected_goals_conceded,influence,creativity,threat,ict_index,home_score,away_score,payload,data_version_id)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
    ON CONFLICT (player_id,fixture_id) DO UPDATE SET season_name=EXCLUDED.season_name,gameweek=EXCLUDED.gameweek,
    kickoff_time=EXCLUDED.kickoff_time,opponent_team_id=EXCLUDED.opponent_team_id,was_home=EXCLUDED.was_home,
    total_points=EXCLUDED.total_points,minutes=EXCLUDED.minutes,payload=EXCLUDED.payload,data_version_id=EXCLUDED.data_version_id""", rows, size)


def import_training(cur: psycopg.Cursor[Any], conn: sqlite3.Connection, vid: uuid.UUID, size: int) -> None:
    rows = []
    for r in conn.execute("SELECT player_id,gw,season,position,is_future,target_class,feature_vector,metadata FROM preprocessed_data"):
        import numpy as np
        vector = list(np.frombuffer(r[6], dtype=np.float32))
        rows.append((r[0], r[1], r[2], r[3], bool(r[4]), r[5], vector, Jsonb(json.loads(r[7])), vid))
    executemany_batched(cur, """INSERT INTO training_data
    (player_id,gameweek,season,position,is_future,target_class,feature_vector,metadata,data_version_id)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
    ON CONFLICT (player_id,gameweek,season) DO UPDATE SET position=EXCLUDED.position,is_future=EXCLUDED.is_future,
    target_class=EXCLUDED.target_class,feature_vector=EXCLUDED.feature_vector,metadata=EXCLUDED.metadata,data_version_id=EXCLUDED.data_version_id""", rows, size)


def import_app_data(cur: psycopg.Cursor[Any], conn: sqlite3.Connection, vid: uuid.UUID) -> None:
    for key, raw in conn.execute("SELECT key,value FROM app_data"):
        payload = json.loads(raw)
        if key == "ai_predictions" and isinstance(payload, list):
            for p in payload:
                cur.execute("""INSERT INTO predictions
                (player_id,position,total_three_week,probability_gt_six,probability_gt_ten,next_gameweek,projections,payload,data_version_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (player_id) DO UPDATE SET position=EXCLUDED.position,total_three_week=EXCLUDED.total_three_week,
                probability_gt_six=EXCLUDED.probability_gt_six,probability_gt_ten=EXCLUDED.probability_gt_ten,
                next_gameweek=EXCLUDED.next_gameweek,projections=EXCLUDED.projections,payload=EXCLUDED.payload,
                data_version_id=EXCLUDED.data_version_id,updated_at=now()""",
                    (p.get("id"), p.get("position"), p.get("total3Week"), p.get("prob_gt_6"), p.get("prob_gt_10"),
                     (p.get("projections") or [{}])[0].get("gw"), Jsonb(p.get("projections") or []), Jsonb(p), vid))
        elif key != "ai_predictions":
            cur.execute("""INSERT INTO analysis_results (result_type,payload,data_version_id)
            VALUES (%s,%s,%s) ON CONFLICT (result_type) DO UPDATE SET payload=EXCLUDED.payload,
            data_version_id=EXCLUDED.data_version_id,updated_at=now()""", (key, Jsonb(payload), vid))


def validate(cur: psycopg.Cursor[Any], counts: dict[str, int], vid: uuid.UUID) -> None:
    checks = {"players": "players", "teams": "teams", "fixtures": "fixtures", "player_history": "player_history",
              "preprocessed_data": "training_data"}
    for source, target in checks.items():
        cur.execute(sql.SQL("SELECT COUNT(*) FROM {} WHERE data_version_id = %s").format(sql.Identifier(target)), (vid,))
        actual = cur.fetchone()[0]
        if actual != counts[source]:
            raise RuntimeError(f"{target}: expected {counts[source]} rows, found {actual}")
    cur.execute("SELECT COUNT(*) FROM predictions WHERE data_version_id = %s", (vid,))
    if counts["app_data"] and cur.fetchone()[0] == 0:
        raise RuntimeError("app_data exists but no predictions were imported")


def publish(source: Path, database_url: str, key: str, batch_size: int, dry_run: bool) -> None:
    if not source.exists():
        raise FileNotFoundError(source)
    with closing(sqlite3.connect(source)) as sqlite_conn:
        counts = read_sqlite_counts(sqlite_conn)
        print("SQLite source counts:", ", ".join(f"{k}={v}" for k, v in counts.items()))
        if dry_run:
            return
        if not database_url:
            raise ValueError("DATABASE_URL or NEON_DATABASE_URL is required")
        if psycopg is None:
            raise RuntimeError("Install backend requirements before a Neon import")
        try:
            with psycopg.connect(database_url) as pg_conn:
                with pg_conn.cursor() as cur:
                    vid = version_id(cur, key)
                    import_teams(cur, sqlite_conn, vid, batch_size)
                    import_players(cur, sqlite_conn, vid, batch_size)
                    import_fixtures(cur, sqlite_conn, vid, batch_size)
                    import_history(cur, sqlite_conn, vid, batch_size)
                    import_training(cur, sqlite_conn, vid, batch_size)
                    import_app_data(cur, sqlite_conn, vid)
                    validate(cur, counts, vid)
                    cur.execute("UPDATE data_versions SET status='superseded' WHERE status='active'")
                    cur.execute("UPDATE data_versions SET status='active', activated_at=now() WHERE id=%s", (vid,))
                pg_conn.commit()
        except Exception:
            with psycopg.connect(database_url) as failed_conn:
                failed_conn.execute("UPDATE data_versions SET status='failed' WHERE version_key=%s", (key,))
                failed_conn.commit()
            raise
        print(f"Published and activated Neon version {key}")


def main() -> int:
    args = parse_args()
    key = args.version_key or utc_now().strftime("%Y%m%dT%H%M%SZ")
    try:
        publish(source_path(args.source), args.database_url, key, args.batch_size, args.dry_run)
    except Exception as exc:
        print(f"Neon import failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

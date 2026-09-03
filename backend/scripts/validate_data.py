"""Validate the SQLite staging database before Neon publication."""
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

REQUIRED_TABLES = {
    "players", "teams", "events", "element_types", "fixtures", "player_history",
    "preprocessed_data", "app_data",
}


def validate(path: Path) -> dict[str, int]:
    if not path.exists():
        raise FileNotFoundError(path)
    with sqlite3.connect(path) as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        missing = REQUIRED_TABLES - tables
        if missing:
            raise ValueError(f"Missing staging tables: {', '.join(sorted(missing))}")
        counts = {
            table: int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
            for table in REQUIRED_TABLES
        }
        if counts["players"] == 0 or counts["teams"] == 0:
            raise ValueError("Staging database has no players or teams")
        if counts["events"] == 0 or counts["element_types"] == 0:
            raise ValueError("Bootstrap events and element types are required")
        duplicate_history = conn.execute(
            "SELECT 1 FROM player_history GROUP BY player_id, fixture_id HAVING COUNT(*) > 1 LIMIT 1"
        ).fetchone()
        if duplicate_history:
            raise ValueError("Duplicate player history logical key detected")
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    counts = validate(args.source)
    print("Validated staging database:", ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

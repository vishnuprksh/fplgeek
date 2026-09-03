# Phase 1 data model

## Measurement result

No production SQLite file is committed or present in the workspace, so local file size and production row counts cannot be measured from this checkout. The source schema is created by `backend/scripts/fetch_data.py` and `backend/scripts/preprocess.py`.

The migration should be run against a copy of the production database before import. The importer should record source row counts for every table and compare them with Neon after each batch.

## Source tables

| SQLite source | Purpose | PostgreSQL target |
| --- | --- | --- |
| `players` | One JSON FPL bootstrap player per ID | `players` |
| `teams` | One JSON FPL bootstrap team per ID | `teams` |
| `fixtures` | One JSON fixture per ID | `fixtures` |
| `player_history` | Player/fixture history, keyed by `(player_id, fixture_id)` | `player_history` |
| `app_data` | Generated JSON results (`ai_predictions`, `league_analysis`, `feature_importance`) | `predictions`, `analysis_results` |
| `preprocessed_data` | Historical and future model features keyed by `(player_id, gw, season)` | `training_data` |

The frontend also expects `events` and `element_types` in the bootstrap shape. These are not created by the current `fetch_data.py` source schema, so the migration includes dedicated tables for them; the future pipeline must populate them from `bootstrap-static`.

## Query-oriented fields and indexes


Flexible upstream payloads remain in `jsonb`, while values used for joins, filtering, sorting, and pagination are typed columns. `player_history` retains the existing composite primary key and supports the current negative fixture-ID convention for historical seasons.

## Publication model

`data_versions` supports staged weekly loads. A publisher should create a staged version, write all rows using that version ID, validate counts and representative records, then mark it `active` only after successful completion. The partial unique index permits at most one active version.

## Phase 2 SQLite import

`backend/scripts/import_neon.py` publishes the completed local SQLite staging
database to Neon. It reads `FPL_DATA_DIR/fpl.sqlite` by default and accepts a
different file with `--source`. The connection URL is read from
`NEON_DATABASE_URL`, then `DATABASE_URL`.

The importer is idempotent: rerunning the same `--version-key` resets that
version to `staged` and upserts the source rows. It imports players, teams,
fixtures, player history, preprocessed training data, predictions, and analysis
results in bounded batches. It validates that every staged row has the expected
source count before activation. A transaction activates the new version only
after validation; failures mark the staged version `failed` and leave the
previous active version untouched.

Examples:

```text
python backend/scripts/import_neon.py --dry-run
python backend/scripts/import_neon.py --source data/fpl.sqlite --version-key 2026-08-24
```

Run the migration in `neon/migrations/20260824000000_create_fpl_data_model.sql`
against the Neon database before the first publish. The source database is
never modified by the importer. `element_types` and `events` are reserved for
the bootstrap-aware pipeline and are not inferable from the current SQLite
staging schema.

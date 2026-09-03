# Neon Migration and Publication Steps

This document describes the safe order for setting up Neon, applying the schema, publishing a staged FPL dataset, and validating the Vercel deployment.

## 1. Prepare credentials

1. Rotate the Neon password if the connection string was previously shared outside a secure secret store.
2. Add the replacement connection string to:
   - local `.env` as `NEON_DATABASE_URL=...` (never commit `.env`),
   - GitHub Actions secret `NEON_DATABASE_URL`,
   - Vercel Preview environment variable `DATABASE_URL`.
3. Do not use a `VITE_` prefix. The Neon URL must never be included in the browser bundle.
4. Confirm `.gitignore` excludes `.env`, SQLite files, and generated staging data.

## 2. Apply the migrations

Run both migrations in filename order against the target Neon database:

1. `supabase/migrations/20260824000000_create_fpl_data_model.sql`
2. `supabase/migrations/20260903000000_make_publication_rows_immutable.sql`

Using `psql`:

```bash
set -a
source .env
set +a
psql "$NEON_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260824000000_create_fpl_data_model.sql
psql "$NEON_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260903000000_make_publication_rows_immutable.sql
```

The second migration preserves any rows created by the first migration by assigning them to `legacy-pre-versioning`. Future imports write a separate version and activate it only after validation.

## 3. Verify the schema

Run these read-only checks:

```sql
select version_key, status, created_at, activated_at
from data_versions
order by created_at;

select table_name, constraint_name
from information_schema.table_constraints
where table_schema = 'public'
  and table_name in (
    'teams', 'element_types', 'events', 'players', 'fixtures',
    'player_history', 'training_data', 'predictions', 'analysis_results'
  )
  and constraint_type = 'PRIMARY KEY'
order by table_name;

select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'teams', 'element_types', 'events', 'players', 'fixtures',
    'player_history', 'training_data', 'predictions', 'analysis_results'
  )
  and column_name = 'data_version_id'
order by table_name;
```

Expected result: every publication table has `data_version_id`; publication-table primary keys begin with `data_version_id`; and at most one `data_versions` row has status `active`.

## 4. Create and validate local staging data

The pipeline uses SQLite only as temporary staging. From the repository root:

```bash
python3 -m venv .venv-fpl
. .venv-fpl/bin/activate
python -m pip install -r backend/requirements.txt
export FPL_DATA_DIR="$PWD/backend/data"
mkdir -p "$FPL_DATA_DIR"
python backend/scripts/fetch_data.py
python backend/scripts/preprocess.py
python backend/scripts/train_predict.py
python backend/scripts/validate_data.py "$FPL_DATA_DIR/fpl.sqlite"
python backend/scripts/import_neon.py \
  --source "$FPL_DATA_DIR/fpl.sqlite" \
  --version-key "local-$(date -u +%Y%m%dT%H%M%SZ)"
```

For a dry run that does not write to Neon:

```bash
python backend/scripts/import_neon.py \
  --source "$FPL_DATA_DIR/fpl.sqlite" \
  --dry-run
```

The fetch step calls upstream FPL and historical-data endpoints and may take several minutes. Keep the generated SQLite file out of Git.

## 5. Validate publication safety

After a successful import:

```sql
select version_key, status, activated_at
from data_versions
order by created_at desc;

select v.version_key, count(*)
from players p
join data_versions v on v.id = p.data_version_id
where v.status = 'active'
group by v.version_key;
```

A failed import must create or mark its version as `failed` without changing the previously active version. Do not delete the previous active version until the new version has been verified.

## 6. Configure and run GitHub Actions

1. Open **Actions → Weekly FPL data update** in GitHub.
2. Choose **Run workflow** on branch `vercel`.
3. Monitor the fetch, preprocessing, training, validation, and Neon publication steps.
4. If the job fails, download the `fpl-staging-failure-*` artifact before retrying.
5. Retry only after correcting the reported failure; the importer is intended to be safe to rerun with a new version key.

The scheduled job runs weekly and uses the repository secret `NEON_DATABASE_URL`.

## 7. Configure and verify Vercel Preview

1. Ensure Preview has `DATABASE_URL` configured and redeploy the `vercel` branch.
2. Check these endpoints without exposing credentials:
   - `/api/health`
   - `/api/data-version`
   - `/api/data/bootstrap-static`
   - `/api/data/fixtures`
   - `/api/data/predictions`
   - `/api/data/league-analysis`
   - `/api/data/training-data`
   - `/api/fpl/bootstrap-static`
3. Open a non-root SPA route directly to verify the Vite fallback.
4. Confirm the browser network panel shows API calls only to the Vercel origin and no Neon URL.

Do not merge `vercel` into `main` until the migration, workflow dispatch, active-version API checks, and browser smoke test all pass.

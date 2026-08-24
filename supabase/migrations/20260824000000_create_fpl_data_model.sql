-- FPL Geek Phase 1: Neon/PostgreSQL data model.
--
-- The raw FPL payloads are retained in jsonb so a future pipeline update does
-- not require a migration for every upstream API field. Fields used by API
-- filters, joins, and ordering are duplicated as typed columns.

create extension if not exists pgcrypto;

create table if not exists data_versions (
    id uuid primary key default gen_random_uuid(),
    version_key text not null unique,
    status text not null default 'staged'
        check (status in ('staged', 'active', 'failed', 'superseded')),
    source_season text,
    current_gameweek integer check (current_gameweek is null or current_gameweek > 0),
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    activated_at timestamptz,
    check (status <> 'active' or activated_at is not null)
);

create unique index if not exists data_versions_one_active_idx
    on data_versions (status) where status = 'active';

create table if not exists teams (
    id integer primary key,
    name text not null,
    short_name text,
    code integer,
    strength integer,
    strength_overall_home integer,
    strength_overall_away integer,
    strength_attack_home integer,
    strength_attack_away integer,
    strength_defence_home integer,
    strength_defence_away integer,
    payload jsonb not null default '{}'::jsonb,
    data_version_id uuid references data_versions(id) on delete set null,
    updated_at timestamptz not null default now()
);

create table if not exists element_types (
    id integer primary key,
    plural_name text,
    singular_name text,
    singular_name_short text,
    plural_name_short text,
    squad_select integer,
    squad_min integer,
    squad_max integer,
    ui_shirt_specific boolean,
    payload jsonb not null default '{}'::jsonb,
    data_version_id uuid references data_versions(id) on delete set null,
    updated_at timestamptz not null default now()
);

create table if not exists events (
    id integer primary key,
    name text,
    deadline_time timestamptz,
    is_previous boolean not null default false,
    is_current boolean not null default false,
    is_next boolean not null default false,
    finished boolean not null default false,
    data_version_id uuid references data_versions(id) on delete set null,
    payload jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

create table if not exists players (
    id integer primary key,
    code integer,
    web_name text not null,
    first_name text,
    second_name text,
    element_type integer references element_types(id) on delete set null,
    team_id integer references teams(id) on delete set null,
    now_cost numeric(8,1),
    total_points integer,
    event_points integer,
    selected_by_percent numeric(8,3),
    form numeric(8,3),
    status text,
    chance_of_playing_next_round integer,
    chance_of_playing_this_round integer,
    minutes integer,
    saves integer,
    payload jsonb not null default '{}'::jsonb,
    data_version_id uuid references data_versions(id) on delete set null,
    updated_at timestamptz not null default now()
);

create index if not exists players_team_idx on players (team_id);
create index if not exists players_position_idx on players (element_type);
create index if not exists players_name_idx on players using gin (to_tsvector('simple', web_name));

create table if not exists fixtures (
    id integer primary key,
    event_id integer references events(id) on delete set null,
    home_team_id integer references teams(id) on delete set null,
    away_team_id integer references teams(id) on delete set null,
    home_score integer,
    away_score integer,
    finished boolean not null default false,
    started boolean not null default false,
    kickoff_time timestamptz,
    home_difficulty integer,
    away_difficulty integer,
    stats jsonb not null default '[]'::jsonb,
    payload jsonb not null default '{}'::jsonb,
    data_version_id uuid references data_versions(id) on delete set null,
    updated_at timestamptz not null default now()
);

create index if not exists fixtures_event_idx on fixtures (event_id);
create index if not exists fixtures_home_team_idx on fixtures (home_team_id);
create index if not exists fixtures_away_team_idx on fixtures (away_team_id);
create index if not exists fixtures_kickoff_idx on fixtures (kickoff_time);
create index if not exists fixtures_unfinished_idx on fixtures (event_id) where not finished;

create table if not exists player_history (
    player_id integer not null references players(id) on delete cascade,
    fixture_id integer not null,
    season_name text not null default 'current',
    gameweek integer,
    kickoff_time timestamptz,
    opponent_team_id integer,
    was_home boolean,
    total_points integer not null default 0,
    minutes integer not null default 0,
    goals_scored integer not null default 0,
    assists integer not null default 0,
    clean_sheets integer not null default 0,
    goals_conceded integer not null default 0,
    own_goals integer not null default 0,
    penalties_saved integer not null default 0,
    penalties_missed integer not null default 0,
    yellow_cards integer not null default 0,
    red_cards integer not null default 0,
    saves integer not null default 0,
    bonus integer not null default 0,
    bps integer not null default 0,
    value numeric(8,2),
    selected integer,
    selected_by_percent numeric(8,3),
    transfers_in integer,
    transfers_out integer,
    starts integer,
    expected_goals numeric,
    expected_assists numeric,
    expected_goal_involvements numeric,
    expected_goals_conceded numeric,
    influence numeric,
    creativity numeric,
    threat numeric,
    ict_index numeric,
    home_score integer,
    away_score integer,
    payload jsonb not null default '{}'::jsonb,
    data_version_id uuid references data_versions(id) on delete set null,
    primary key (player_id, fixture_id)
);

create index if not exists player_history_player_idx on player_history (player_id);
create index if not exists player_history_season_gw_idx on player_history (season_name, gameweek);
create index if not exists player_history_gameweek_idx on player_history (gameweek);
create index if not exists player_history_kickoff_idx on player_history (kickoff_time);

create table if not exists training_data (
    player_id integer not null references players(id) on delete cascade,
    gameweek integer not null,
    season text not null,
    position text not null check (position in ('GKP', 'DEF', 'MID', 'FWD')),
    is_future boolean not null default false,
    target_class integer not null default 0 check (target_class between 0 and 15),
    feature_vector real[] not null,
    metadata jsonb not null default '{}'::jsonb,
    data_version_id uuid references data_versions(id) on delete set null,
    created_at timestamptz not null default now(),
    primary key (player_id, gameweek, season)
);

create index if not exists training_data_position_idx on training_data (position);
create index if not exists training_data_season_gw_idx on training_data (season, gameweek);
create index if not exists training_data_future_idx on training_data (is_future);
create index if not exists training_data_version_idx on training_data (data_version_id);
create index if not exists training_data_metadata_idx on training_data using gin (metadata);

create table if not exists predictions (
    player_id integer primary key references players(id) on delete cascade,
    position text,
    total_three_week numeric,
    probability_gt_six numeric,
    probability_gt_ten numeric,
    next_gameweek integer,
    projections jsonb not null default '[]'::jsonb,
    payload jsonb not null default '{}'::jsonb,
    data_version_id uuid references data_versions(id) on delete set null,
    updated_at timestamptz not null default now()
);

create index if not exists predictions_total_idx on predictions (total_three_week desc);
create index if not exists predictions_version_idx on predictions (data_version_id);

create table if not exists analysis_results (
    result_type text primary key,
    payload jsonb not null,
    data_version_id uuid references data_versions(id) on delete set null,
    updated_at timestamptz not null default now()
);

create index if not exists analysis_results_version_idx on analysis_results (data_version_id);

comment on table training_data is 'Full historical and future feature rows; query with server-side filtering and pagination.';
comment on table data_versions is 'Atomic publication marker for weekly pipeline output.';
comment on column player_history.fixture_id is 'Preserves the existing composite key; historical fixtures use the pipeline negative-id convention.';
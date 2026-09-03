-- Make every published row immutable across weekly data versions.
-- Run after 20260824000000_create_fpl_data_model.sql.

-- Existing foreign keys target globally keyed rows. They must be removed before
-- replacing global primary keys with version-scoped keys; API queries enforce
-- same-version joins explicitly.
alter table if exists players drop constraint if exists players_element_type_fkey;
alter table if exists players drop constraint if exists players_team_id_fkey;
alter table if exists fixtures drop constraint if exists fixtures_event_id_fkey;
alter table if exists fixtures drop constraint if exists fixtures_home_team_id_fkey;
alter table if exists fixtures drop constraint if exists fixtures_away_team_id_fkey;
alter table if exists player_history drop constraint if exists player_history_player_id_fkey;
alter table if exists training_data drop constraint if exists training_data_player_id_fkey;
alter table if exists predictions drop constraint if exists predictions_player_id_fkey;

-- Preserve any rows created by the first migration by attaching them to a
-- legacy version before making publication ownership mandatory.
insert into data_versions (version_key, status, metadata)
values ('legacy-pre-versioning', 'staged', '{"migration": "20260903000000"}'::jsonb)
on conflict (version_key) do nothing;

update data_versions
set status = 'active', activated_at = now()
where version_key = 'legacy-pre-versioning'
	and not exists (select 1 from data_versions where status = 'active');

update teams set data_version_id = (select id from data_versions where version_key = 'legacy-pre-versioning')
where data_version_id is null;
update element_types set data_version_id = (select id from data_versions where version_key = 'legacy-pre-versioning')
where data_version_id is null;
update events set data_version_id = (select id from data_versions where version_key = 'legacy-pre-versioning')
where data_version_id is null;
update players set data_version_id = (select id from data_versions where version_key = 'legacy-pre-versioning')
where data_version_id is null;
update fixtures set data_version_id = (select id from data_versions where version_key = 'legacy-pre-versioning')
where data_version_id is null;
update player_history set data_version_id = (select id from data_versions where version_key = 'legacy-pre-versioning')
where data_version_id is null;
update training_data set data_version_id = (select id from data_versions where version_key = 'legacy-pre-versioning')
where data_version_id is null;
update predictions set data_version_id = (select id from data_versions where version_key = 'legacy-pre-versioning')
where data_version_id is null;
update analysis_results set data_version_id = (select id from data_versions where version_key = 'legacy-pre-versioning')
where data_version_id is null;

-- A legacy active marker is only a migration fallback. Future imports replace
-- it atomically after the staged version has passed validation.
alter table if exists teams alter column data_version_id set not null;
alter table if exists element_types alter column data_version_id set not null;
alter table if exists events alter column data_version_id set not null;
alter table if exists players alter column data_version_id set not null;
alter table if exists fixtures alter column data_version_id set not null;
alter table if exists player_history alter column data_version_id set not null;
alter table if exists training_data alter column data_version_id set not null;
alter table if exists predictions alter column data_version_id set not null;
alter table if exists analysis_results alter column data_version_id set not null;

alter table if exists teams drop constraint if exists teams_pkey;
alter table if exists element_types drop constraint if exists element_types_pkey;
alter table if exists events drop constraint if exists events_pkey;
alter table if exists players drop constraint if exists players_pkey;
alter table if exists fixtures drop constraint if exists fixtures_pkey;
alter table if exists player_history drop constraint if exists player_history_pkey;
alter table if exists training_data drop constraint if exists training_data_pkey;
alter table if exists predictions drop constraint if exists predictions_pkey;
alter table if exists analysis_results drop constraint if exists analysis_results_pkey;

alter table if exists teams add primary key (data_version_id, id);
alter table if exists element_types add primary key (data_version_id, id);
alter table if exists events add primary key (data_version_id, id);
alter table if exists players add primary key (data_version_id, id);
alter table if exists fixtures add primary key (data_version_id, id);
alter table if exists player_history add primary key (data_version_id, player_id, fixture_id);
alter table if exists training_data add primary key (data_version_id, player_id, gameweek, season);
alter table if exists predictions add primary key (data_version_id, player_id);
alter table if exists analysis_results add primary key (data_version_id, result_type);

create index if not exists teams_version_id_idx on teams (data_version_id);
create index if not exists element_types_version_id_idx on element_types (data_version_id);
create index if not exists events_version_id_idx on events (data_version_id);
create index if not exists players_version_team_idx on players (data_version_id, team_id);
create index if not exists fixtures_version_event_idx on fixtures (data_version_id, event_id);
create index if not exists player_history_version_player_idx on player_history (data_version_id, player_id);
create index if not exists training_data_version_position_idx on training_data (data_version_id, position);

create or replace view active_predictions as
select p.*
from predictions p
join data_versions v on v.id = p.data_version_id
where v.status = 'active';

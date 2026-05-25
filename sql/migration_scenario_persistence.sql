-- Sprint 6 Phase 3 — Scenario Persistence & Portfolio Lab Foundation
-- ---------------------------------------------------------------
-- Adds three additive tables to back the Scenario Builder workspace:
--
--   sf_scenario_records         one row per persisted scenario (top-level)
--   sf_scenario_record_versions one row per Save (immutable version history)
--   sf_scenario_snapshots       one row per Snapshot (engine output + assumptions)
--
-- All financial data (sf_snapshot, sf_properties, sf_stocks, sf_crypto, …)
-- is intentionally untouched. The existing `sf_scenarios` table is left in
-- place — Sprint 6 Phase 3 lives in a parallel namespace so legacy callers
-- keep working until they're migrated.
--
-- Notes:
--   • All payloads / metric arrays live in JSONB. Validation happens in
--     application code (see client/src/lib/scenarioPersistence.ts).
--   • `tags` is a text array constrained by application-side whitelist.
--   • `archived_at` enables soft-delete; no rows are ever hard-deleted by
--     application code.
--   • `is_baseline` is a per-record flag (multiple baselines are illegal at
--     the app layer; here we allow the flag and surface a partial unique
--     index so Supabase can enforce single-baseline-per-record).

create table if not exists sf_scenario_records (
  record_id          text primary key,
  scenario_id        text not null,
  label              text not null,
  description        text default '',
  seed_scenario_id   text,
  is_seed            boolean default false,
  is_baseline        boolean default false,
  tags               jsonb default '[]'::jsonb,
  notes              text default '',
  current_version    integer default 0,
  archived_at        timestamptz,
  archived_reason    text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index if not exists sf_scenario_records_scenario_id_idx on sf_scenario_records (scenario_id);
create index if not exists sf_scenario_records_archived_idx    on sf_scenario_records (archived_at);
create unique index if not exists sf_scenario_records_baseline_uniq
  on sf_scenario_records ((1)) where is_baseline and archived_at is null;

create table if not exists sf_scenario_record_versions (
  version_id          text primary key,
  scenario_record_id  text not null references sf_scenario_records(record_id) on delete cascade,
  version_number      integer not null,
  payload             jsonb not null,
  comment             text,
  created_at          timestamptz default now()
);

create index if not exists sf_scenario_record_versions_record_idx on sf_scenario_record_versions (scenario_record_id);
create unique index if not exists sf_scenario_record_versions_uniq
  on sf_scenario_record_versions (scenario_record_id, version_number);

create table if not exists sf_scenario_snapshots (
  snapshot_id         text primary key,
  scenario_record_id  text not null references sf_scenario_records(record_id) on delete cascade,
  version_number      integer,
  label               text not null,
  comment             text,
  payload             jsonb not null,
  metrics             jsonb not null,
  assumptions         jsonb default '[]'::jsonb,
  engine_limited      boolean default false,
  created_at          timestamptz default now()
);

create index if not exists sf_scenario_snapshots_record_idx on sf_scenario_snapshots (scenario_record_id);

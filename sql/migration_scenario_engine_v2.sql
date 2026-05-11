-- ─── Scenario Engine V2 Migration ───────────────────────────────────────────
-- Adds 6 new tables for the V2 engine. Strictly additive.
--
-- INVARIANTS:
--   * No ALTER on sf_snapshot or any existing V1 table.
--   * All tables use IF NOT EXISTS — safe to re-run.
--   * RLS enabled on every new table, mirroring sf_snapshot's pattern.
--   * Cascade deletes flow down: group → scenarios → deltas/results.
--
-- THIS FILE IS NOT AUTO-EXECUTED. It is to be applied manually in
-- Supabase dev (Phase 2). Production runs only after Phase 17 cutover.
--
-- Rollback: see migration_scenario_engine_v2_rollback.sql
-- ────────────────────────────────────────────────────────────────────────────

-- ─── 1. Base plans ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sf_base_plans (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        TEXT         NOT NULL,
  name            TEXT         NOT NULL,
  snapshot_hash   TEXT         NOT NULL,
  assumptions     JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sf_base_plans_owner ON sf_base_plans(owner_id);

-- ─── 2. Scenario groups (a comparison set, e.g. "AUD 50k 4-way") ────────────
CREATE TABLE IF NOT EXISTS sf_scenario_groups (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        TEXT         NOT NULL,
  base_plan_id    UUID         NOT NULL REFERENCES sf_base_plans(id) ON DELETE CASCADE,
  name            TEXT         NOT NULL,
  horizon_years   INT          NOT NULL DEFAULT 10 CHECK (horizon_years BETWEEN 1 AND 40),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sf_scenario_groups_owner ON sf_scenario_groups(owner_id);
CREATE INDEX IF NOT EXISTS idx_sf_scenario_groups_base  ON sf_scenario_groups(base_plan_id);

-- ─── 3. Scenarios V2 ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sf_scenarios_v2 (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID         NOT NULL REFERENCES sf_scenario_groups(id) ON DELETE CASCADE,
  name            TEXT         NOT NULL,
  ordinal         INT          NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sf_scenarios_v2_group ON sf_scenarios_v2(group_id);

-- ─── 4. Scenario deltas (the 17 action types) ───────────────────────────────
CREATE TABLE IF NOT EXISTS sf_scenario_deltas (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id        UUID         NOT NULL REFERENCES sf_scenarios_v2(id) ON DELETE CASCADE,
  delta_type         TEXT         NOT NULL CHECK (delta_type IN (
    'property_deposit_boost','crypto_lump_sum','etf_lump_sum','etf_dca',
    'offset_deposit','cash_hold','extra_mortgage_repayment','refinance',
    'buy_property','sell_property','rentvest','early_retire',
    'salary_change','career_break','child_expense',
    'market_crash_stress','interest_rate_spike'
  )),
  activation_month   TEXT         NOT NULL, -- YYYY-MM
  priority           INT          NOT NULL DEFAULT 500,
  params             JSONB        NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key    TEXT         NOT NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (scenario_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_sf_scenario_deltas_scenario ON sf_scenario_deltas(scenario_id);
CREATE INDEX IF NOT EXISTS idx_sf_scenario_deltas_month    ON sf_scenario_deltas(activation_month);

-- ─── 5. Scenario results (one row per run, immutable) ───────────────────────
CREATE TABLE IF NOT EXISTS sf_scenario_results_v2 (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id     UUID         NOT NULL REFERENCES sf_scenarios_v2(id) ON DELETE CASCADE,
  snapshot_hash   TEXT         NOT NULL,
  run_timestamp   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  seed            BIGINT       NOT NULL,
  result          JSONB        NOT NULL DEFAULT '{}'::jsonb,   -- P10/P50/P90, risk, attribution
  confidence      JSONB        NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_sf_scenario_results_v2_scenario ON sf_scenario_results_v2(scenario_id);
CREATE INDEX IF NOT EXISTS idx_sf_scenario_results_v2_hash     ON sf_scenario_results_v2(snapshot_hash);

-- ─── 6. Scenario reports (PDF outputs) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS sf_scenario_reports (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID         NOT NULL REFERENCES sf_scenario_groups(id) ON DELETE CASCADE,
  pdf_url         TEXT,
  commentary      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  generated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sf_scenario_reports_group ON sf_scenario_reports(group_id);

-- ─── Row Level Security ─────────────────────────────────────────────────────
-- All V2 tables use the same owner_id == auth-context pattern as sf_snapshot.
-- Adjust JWT claim path here if your sf_snapshot RLS differs.

ALTER TABLE sf_base_plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_scenario_groups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_scenarios_v2        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_scenario_deltas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_scenario_results_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_scenario_reports    ENABLE ROW LEVEL SECURITY;

-- Helper: scenarios/deltas/results inherit owner via join, so policies
-- traverse to sf_scenario_groups → sf_base_plans → owner_id.

DROP POLICY IF EXISTS sf_base_plans_owner ON sf_base_plans;
CREATE POLICY sf_base_plans_owner ON sf_base_plans
  USING (owner_id = current_setting('request.jwt.claim.sub', true))
  WITH CHECK (owner_id = current_setting('request.jwt.claim.sub', true));

DROP POLICY IF EXISTS sf_scenario_groups_owner ON sf_scenario_groups;
CREATE POLICY sf_scenario_groups_owner ON sf_scenario_groups
  USING (owner_id = current_setting('request.jwt.claim.sub', true))
  WITH CHECK (owner_id = current_setting('request.jwt.claim.sub', true));

DROP POLICY IF EXISTS sf_scenarios_v2_owner ON sf_scenarios_v2;
CREATE POLICY sf_scenarios_v2_owner ON sf_scenarios_v2
  USING (group_id IN (SELECT id FROM sf_scenario_groups
                       WHERE owner_id = current_setting('request.jwt.claim.sub', true)))
  WITH CHECK (group_id IN (SELECT id FROM sf_scenario_groups
                            WHERE owner_id = current_setting('request.jwt.claim.sub', true)));

DROP POLICY IF EXISTS sf_scenario_deltas_owner ON sf_scenario_deltas;
CREATE POLICY sf_scenario_deltas_owner ON sf_scenario_deltas
  USING (scenario_id IN (SELECT s.id FROM sf_scenarios_v2 s
                          JOIN sf_scenario_groups g ON g.id = s.group_id
                          WHERE g.owner_id = current_setting('request.jwt.claim.sub', true)))
  WITH CHECK (scenario_id IN (SELECT s.id FROM sf_scenarios_v2 s
                               JOIN sf_scenario_groups g ON g.id = s.group_id
                               WHERE g.owner_id = current_setting('request.jwt.claim.sub', true)));

DROP POLICY IF EXISTS sf_scenario_results_v2_owner ON sf_scenario_results_v2;
CREATE POLICY sf_scenario_results_v2_owner ON sf_scenario_results_v2
  USING (scenario_id IN (SELECT s.id FROM sf_scenarios_v2 s
                          JOIN sf_scenario_groups g ON g.id = s.group_id
                          WHERE g.owner_id = current_setting('request.jwt.claim.sub', true)));

DROP POLICY IF EXISTS sf_scenario_reports_owner ON sf_scenario_reports;
CREATE POLICY sf_scenario_reports_owner ON sf_scenario_reports
  USING (group_id IN (SELECT id FROM sf_scenario_groups
                       WHERE owner_id = current_setting('request.jwt.claim.sub', true)));

-- ─── Verify ─────────────────────────────────────────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'sf_base_plans','sf_scenario_groups','sf_scenarios_v2',
    'sf_scenario_deltas','sf_scenario_results_v2','sf_scenario_reports'
  )
ORDER BY table_name;

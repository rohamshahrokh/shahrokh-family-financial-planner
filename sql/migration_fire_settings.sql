-- ─── FIRE Engine Settings Migration ──────────────────────────────────────────
-- Creates 3 tables for the fully editable FIRE Engine.
-- Run once in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. sf_fire_settings ──────────────────────────────────────────────────────
-- Single row per family (fixed id = 'shahrokh-family-main')
-- Stores all user-editable FIRE assumptions

CREATE TABLE IF NOT EXISTS sf_fire_settings (
  id                         TEXT PRIMARY KEY DEFAULT 'shahrokh-family-main',

  -- ── User profile ──────────────────────────────────────────────────────────
  roham_age                  INT,
  fara_age                   INT,
  desired_fire_age           INT,
  desired_partner_fire_age   INT,

  -- ── FIRE target ──────────────────────────────────────────────────────────
  desired_monthly_passive    NUMERIC,          -- $/month target passive income
  safe_withdrawal_rate       NUMERIC DEFAULT 4.0,   -- %
  include_super_in_fire      BOOLEAN DEFAULT TRUE,
  include_ppor_equity        BOOLEAN DEFAULT FALSE,
  include_ip_equity          BOOLEAN DEFAULT TRUE,
  include_crypto             BOOLEAN DEFAULT TRUE,
  include_stocks             BOOLEAN DEFAULT TRUE,

  -- ── Mortgage / property ──────────────────────────────────────────────────
  mortgage_rate              NUMERIC DEFAULT 6.5,
  mortgage_term_remaining    INT     DEFAULT 25,    -- years
  property_cagr              NUMERIC DEFAULT 5.0,   -- %
  rent_growth_pct            NUMERIC DEFAULT 3.0,
  vacancy_pct                NUMERIC DEFAULT 4.0,
  property_holding_cost_pct  NUMERIC DEFAULT 1.5,

  -- ── Investment return assumptions ────────────────────────────────────────
  etf_return_pct             NUMERIC DEFAULT 8.5,
  crypto_return_pct          NUMERIC DEFAULT 15.0,
  cash_hisa_return_pct       NUMERIC DEFAULT 5.0,
  stock_return_pct           NUMERIC DEFAULT 9.0,

  -- ── Super assumptions ────────────────────────────────────────────────────
  roham_sgc_pct              NUMERIC DEFAULT 11.5,
  roham_super_return_pct     NUMERIC DEFAULT 8.0,
  roham_salary_sacrifice_mo  NUMERIC DEFAULT 0,     -- $/month pre-tax
  fara_sgc_pct               NUMERIC DEFAULT 11.5,
  fara_super_return_pct      NUMERIC DEFAULT 8.0,
  fara_salary_sacrifice_mo   NUMERIC DEFAULT 0,

  -- ── Macro assumptions ────────────────────────────────────────────────────
  income_growth_pct          NUMERIC DEFAULT 3.0,
  expense_inflation_pct      NUMERIC DEFAULT 3.0,
  general_inflation_pct      NUMERIC DEFAULT 2.8,
  tax_rate_estimate_pct      NUMERIC DEFAULT 32.5,

  -- ── Income mode ──────────────────────────────────────────────────────────
  use_manual_income          BOOLEAN DEFAULT FALSE,
  manual_monthly_income      NUMERIC,
  manual_monthly_expenses    NUMERIC,
  manual_monthly_surplus     NUMERIC,
  fara_monthly_income        NUMERIC DEFAULT 0,
  has_dependants             BOOLEAN DEFAULT FALSE,

  -- ── Timestamps ───────────────────────────────────────────────────────────
  created_at                 TIMESTAMPTZ DEFAULT now(),
  updated_at                 TIMESTAMPTZ DEFAULT now()
);

-- Seed default row
INSERT INTO sf_fire_settings (id)
VALUES ('shahrokh-family-main')
ON CONFLICT (id) DO NOTHING;

-- ── 2. sf_fire_scenario_config ───────────────────────────────────────────────
-- One row per scenario (4 rows: property, etf, mixed, aggressive)
-- Stores user-editable allocation percentages and per-scenario overrides

CREATE TABLE IF NOT EXISTS sf_fire_scenario_config (
  id                   SERIAL PRIMARY KEY,
  scenario_id          TEXT NOT NULL,
  record_owner         TEXT DEFAULT 'shahrokh-family-main',

  -- ── Surplus allocation (must total 100) ──────────────────────────────────
  pct_to_property      NUMERIC DEFAULT 0,
  pct_to_etf           NUMERIC DEFAULT 0,
  pct_to_crypto        NUMERIC DEFAULT 0,
  pct_to_super         NUMERIC DEFAULT 0,
  pct_to_offset        NUMERIC DEFAULT 0,
  pct_to_cash          NUMERIC DEFAULT 0,

  -- ── Per-scenario overrides ────────────────────────────────────────────────
  custom_return_pct    NUMERIC,              -- NULL = use global rate from sf_fire_settings
  leverage_allowed     BOOLEAN DEFAULT FALSE,

  -- ── Property-specific ────────────────────────────────────────────────────
  num_planned_ips      INT     DEFAULT 0,
  ip_target_year       INT,
  ip_deposit_pct       NUMERIC DEFAULT 20,
  ip_expected_yield    NUMERIC DEFAULT 4.0,

  updated_at           TIMESTAMPTZ DEFAULT now(),

  UNIQUE (scenario_id, record_owner)
);

-- Seed 4 default scenario rows with canonical allocations
INSERT INTO sf_fire_scenario_config (scenario_id, record_owner, pct_to_property, pct_to_etf, pct_to_crypto, pct_to_super, pct_to_offset, pct_to_cash, custom_return_pct, leverage_allowed, ip_expected_yield)
VALUES
  ('property',   'shahrokh-family-main', 0,  30, 0,  0, 55, 15, 5.5,  FALSE, 4.0),
  ('etf',        'shahrokh-family-main', 0,  80, 0,  0,  0, 20, 8.5,  FALSE, 4.0),
  ('mixed',      'shahrokh-family-main', 15, 40, 0, 10, 25, 10, 7.2,  FALSE, 4.0),
  ('aggressive', 'shahrokh-family-main', 0,  55, 15, 0,  0, 20, 11.0, TRUE,  4.0)
ON CONFLICT (scenario_id, record_owner) DO NOTHING;

-- ── 3. sf_fire_year_assumptions ──────────────────────────────────────────────
-- Optional year-by-year override table (2026–2035)
-- Any row overrides the global defaults for that year

CREATE TABLE IF NOT EXISTS sf_fire_year_assumptions (
  id                  SERIAL PRIMARY KEY,
  record_owner        TEXT DEFAULT 'shahrokh-family-main',
  assumption_year     INT NOT NULL,
  property_pct        NUMERIC,
  stocks_pct          NUMERIC,
  crypto_pct          NUMERIC,
  super_pct           NUMERIC,
  cash_pct            NUMERIC,
  inflation_pct       NUMERIC,
  income_growth_pct   NUMERIC,
  expense_growth_pct  NUMERIC,
  interest_rate_pct   NUMERIC,

  UNIQUE (assumption_year, record_owner)
);

-- Seed years 2026–2035 with NULLs (means: use global defaults)
DO $$
DECLARE yr INT;
BEGIN
  FOR yr IN 2026..2035 LOOP
    INSERT INTO sf_fire_year_assumptions (record_owner, assumption_year)
    VALUES ('shahrokh-family-main', yr)
    ON CONFLICT (assumption_year, record_owner) DO NOTHING;
  END LOOP;
END $$;

-- ── Enable RLS (row-level security) — allow anon read/write for now ──────────
ALTER TABLE sf_fire_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_fire_scenario_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sf_fire_year_assumptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_fire_settings"     ON sf_fire_settings;
DROP POLICY IF EXISTS "allow_all_fire_scenario"     ON sf_fire_scenario_config;
DROP POLICY IF EXISTS "allow_all_fire_year"         ON sf_fire_year_assumptions;

CREATE POLICY "allow_all_fire_settings"     ON sf_fire_settings         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_fire_scenario"     ON sf_fire_scenario_config  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_fire_year"         ON sf_fire_year_assumptions FOR ALL USING (true) WITH CHECK (true);

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT 'sf_fire_settings rows:'         AS table_name, count(*) FROM sf_fire_settings
UNION ALL
SELECT 'sf_fire_scenario_config rows:', count(*) FROM sf_fire_scenario_config
UNION ALL
SELECT 'sf_fire_year_assumptions rows:', count(*) FROM sf_fire_year_assumptions;

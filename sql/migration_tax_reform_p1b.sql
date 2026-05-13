-- ─── Tax Reform P1b Migration ───────────────────────────────────────────────
-- #FWL_P1B_UI_Finalisation_TaxReform
--
-- Adds the new property + regime columns required by the P1b UI surfaces
-- (PropertyTaxFieldsCard, regime selector persistence, auto-detect).
-- Strictly additive — no ALTER on existing typed columns, every column
-- includes IF NOT EXISTS, and safe defaults preserve current-rules
-- behaviour for every existing row.
--
-- INVARIANTS:
--   * NEVER auto-applied. Apply manually via Supabase SQL editor in dev
--     first; production cutover is a separate decision.
--   * All ADD COLUMNs use IF NOT EXISTS — safe to re-run.
--   * No data loss possible — only new columns with NULL or safe defaults.
--   * Existing engine code reads each column defensively (?? fallback).
--   * RLS unchanged — relies on each parent table's existing policies.
--
-- Rollback: see migration_tax_reform_p1b_rollback.sql
-- ────────────────────────────────────────────────────────────────────────────

-- ─── 1. Properties table: tax-policy metadata ───────────────────────────────
-- These columns drive the AUTO_DETECT resolver. Every column nullable so
-- legacy rows continue to function (auto-detect treats them as UNKNOWN +
-- defaults to current rules, matching pre-P1b behaviour byte-for-byte).

ALTER TABLE IF EXISTS sf_properties
  ADD COLUMN IF NOT EXISTS property_type       TEXT,
  ADD COLUMN IF NOT EXISTS contract_date       DATE,
  ADD COLUMN IF NOT EXISTS purchase_date       DATE,
  ADD COLUMN IF NOT EXISTS settlement_date     DATE,
  ADD COLUMN IF NOT EXISTS planned_sale_date   DATE,
  ADD COLUMN IF NOT EXISTS is_grandfathered    BOOLEAN;

-- Constrain property_type to the enum used by the engine. NULL allowed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sf_properties_property_type_check'
  ) THEN
    ALTER TABLE IF EXISTS sf_properties
      ADD CONSTRAINT sf_properties_property_type_check
      CHECK (
        property_type IS NULL OR property_type IN (
          'ESTABLISHED',
          'NEW_BUILD',
          'BUILD_TO_RENT',
          'AFFORDABLE_HOUSING',
          'UNKNOWN'
        )
      );
  END IF;
END $$;

-- ─── 2. User preference: active tax-policy regime selection ─────────────────
-- One row per user. Selector and (optional) custom regime kind. We don't
-- persist the full custom-regime object server-side — only the selector
-- kind. The customRegime override remains client-side / scenario-level.

CREATE TABLE IF NOT EXISTS sf_user_tax_regime_pref (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            TEXT         NOT NULL UNIQUE,
  tax_policy_regime   TEXT         NOT NULL DEFAULT 'AUTO_DETECT',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT sf_user_tax_regime_pref_kind_check CHECK (
    tax_policy_regime IN (
      'AUTO_DETECT',
      'CURRENT_RULES',
      'PROPOSED_2027_REFORM',
      'CUSTOM_STRESS_TEST'
    )
  )
);

-- Match RLS pattern used by sf_snapshot and other per-user tables.
ALTER TABLE sf_user_tax_regime_pref ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sf_user_tax_regime_pref'
      AND policyname = 'sf_user_tax_regime_pref_owner_rw'
  ) THEN
    CREATE POLICY sf_user_tax_regime_pref_owner_rw
      ON sf_user_tax_regime_pref
      FOR ALL
      USING (owner_id = auth.uid()::text)
      WITH CHECK (owner_id = auth.uid()::text);
  END IF;
END $$;

-- ─── 3. Scenario-level overrides (optional, future-proofing) ────────────────
-- Lets a scenario pin its own regime independently of the user's
-- preference. NULL = inherit the user pref. Engine code defaults to NULL.

ALTER TABLE IF EXISTS sf_scenarios_v2
  ADD COLUMN IF NOT EXISTS tax_policy_regime TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sf_scenarios_v2_tax_policy_regime_check'
  ) THEN
    ALTER TABLE IF EXISTS sf_scenarios_v2
      ADD CONSTRAINT sf_scenarios_v2_tax_policy_regime_check
      CHECK (
        tax_policy_regime IS NULL OR tax_policy_regime IN (
          'AUTO_DETECT',
          'CURRENT_RULES',
          'PROPOSED_2027_REFORM',
          'CUSTOM_STRESS_TEST'
        )
      );
  END IF;
END $$;

-- ─── 4. Verification ────────────────────────────────────────────────────────
-- After applying, run:
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'sf_properties'
--     AND column_name IN ('property_type', 'contract_date', 'purchase_date',
--                         'settlement_date', 'planned_sale_date', 'is_grandfathered');
--
-- Expected: 6 rows, all is_nullable = 'YES'.
--
--   SELECT count(*) FROM sf_user_tax_regime_pref;
--
-- Expected: 0 (or matches previously-set preferences).

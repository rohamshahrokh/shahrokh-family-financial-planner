-- ─── Sprint 20 PR-F2 — Advanced FIRE settings columns ──────────────────────
-- Adds the three F1 advanced canonical-FIRE fields as first-class columns on
-- mc_fire_settings. PR-F1 round-tripped these inside the action_checklist
-- JSON column under the __advanced_fire sub-key; this migration moves them
-- to dedicated, indexable columns so server-side queries (and audit tools)
-- can read them without JSON traversal.
--
-- Columns (all nullable; null means "use engine default"):
--   target_net_worth                NUMERIC      explicit asset-base override
--                                                (skips SWR-based derivation)
--   min_liquidity_buffer_months     NUMERIC      months of cash + offset
--                                                buffer to maintain
--   max_risk_tolerance              TEXT         CHECK constraint: one of
--                                                'conservative', 'balanced',
--                                                'growth'  (the legacy F1
--                                                 vocabulary used in
--                                                 CanonicalFireRiskTolerance)
--
-- Compatibility & rollout:
--   - Migration is forward-only and idempotent (ADD COLUMN IF NOT EXISTS).
--   - The read hook (`useFireSettingsRow`) prefers the column when present,
--     falling back to the existing action_checklist.__advanced_fire JSON for
--     households that have not yet been backfilled.
--   - The backfill helper at
--     `client/src/lib/migration/backfillAdvancedFireFields.ts` copies the
--     existing JSON values into the new columns once per row.
--
-- APPLY INSTRUCTIONS (NOT auto-applied):
--   Run via your usual Supabase CLI flow, e.g.:
--     supabase db push
--   OR  paste this file into the Supabase SQL editor and execute.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.mc_fire_settings
  ADD COLUMN IF NOT EXISTS target_net_worth NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS min_liquidity_buffer_months NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS max_risk_tolerance TEXT NULL;

-- CHECK constraint on max_risk_tolerance — added separately so it can be
-- skipped if it already exists. The CHECK only fires on non-null values.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'mc_fire_settings_max_risk_tolerance_check'
  ) THEN
    ALTER TABLE public.mc_fire_settings
      ADD CONSTRAINT mc_fire_settings_max_risk_tolerance_check
        CHECK (
          max_risk_tolerance IS NULL
          OR max_risk_tolerance IN ('conservative', 'balanced', 'growth')
        );
  END IF;
END$$;

COMMENT ON COLUMN public.mc_fire_settings.target_net_worth IS
  'Sprint 20 PR-F2 — Advanced: explicit asset-base override (AUD). Null means engine derives via SWR.';
COMMENT ON COLUMN public.mc_fire_settings.min_liquidity_buffer_months IS
  'Sprint 20 PR-F2 — Advanced: months of cash+offset buffer the user wants to maintain. Null means engine default (6 months).';
COMMENT ON COLUMN public.mc_fire_settings.max_risk_tolerance IS
  'Sprint 20 PR-F2 — Advanced: cap on engine-recommended risk band. One of conservative / balanced / growth. Null means engine default (balanced).';

-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- The migration is additive and idempotent. To roll back, execute the SQL
-- below (commented to keep this file forward-only by default):
--
--   ALTER TABLE public.mc_fire_settings
--     DROP CONSTRAINT IF EXISTS mc_fire_settings_max_risk_tolerance_check,
--     DROP COLUMN IF EXISTS target_net_worth,
--     DROP COLUMN IF EXISTS min_liquidity_buffer_months,
--     DROP COLUMN IF EXISTS max_risk_tolerance;
--
-- After rollback, the F1 JSON round-trip path (action_checklist.__advanced_fire)
-- remains intact; advanced-field UX is unaffected.
-- ─────────────────────────────────────────────────────────────────────────────

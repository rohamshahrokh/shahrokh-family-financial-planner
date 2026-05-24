-- ─── Property Lifecycle Status Migration — v2 Full Five-Status Model ─────
-- #FWL_Property_Lifecycle_FiveStatus
--
-- Sprint 3B C-1 follow-up. The original migration constrained
-- lifecycle_status to 3 values ('planned', 'under_contract', 'settled').
-- The product / audit display, dashboard selectors, tests, and Sprint 3A
-- audit pack require the full 5-status model ('planned', 'under_contract',
-- 'settled', 'sold', 'archived'). This migration relaxes the CHECK so the
-- production UI can persist sold / archived without PGRST violations.
--
-- INVARIANTS:
--   * Strictly additive — every existing value remains valid.
--   * Idempotent — safe to re-run after either v1 or this v2 migration.
--   * Never overwrites existing lifecycle_status values.
--   * RLS unchanged.
-- ────────────────────────────────────────────────────────────────────────────

-- Make sure the base column exists first (no-op if v1 already applied).
ALTER TABLE IF EXISTS sf_properties
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'planned';

-- Drop the old 3-value constraint (if present) and replace with a 5-value
-- constraint covering planned / under_contract / settled / sold / archived.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sf_properties_lifecycle_status_check'
  ) THEN
    ALTER TABLE sf_properties DROP CONSTRAINT sf_properties_lifecycle_status_check;
  END IF;

  ALTER TABLE IF EXISTS sf_properties
    ADD CONSTRAINT sf_properties_lifecycle_status_check
    CHECK (
      lifecycle_status IS NULL OR lifecycle_status IN (
        'planned',
        'under_contract',
        'settled',
        'sold',
        'archived'
      )
    );
END $$;

NOTIFY pgrst, 'reload schema';

-- ─── Property Lifecycle Status Migration ───────────────────────────────────
-- #FWL_Property_Lifecycle_Persistence_Fix
--
-- Adds the `lifecycle_status` column required by the Property Lifecycle UI
-- (Planned / Under Contract / Settled) so an explicit user selection
-- persists in Supabase across save / refresh / logout / login.
--
-- INVARIANTS:
--   * Strictly additive — safe to re-run (uses IF NOT EXISTS).
--   * Legacy rows default to 'settled' so the existing forecast pipeline
--     (which expects all current rows to be active) keeps including them
--     unchanged. New rows created via the UI explicitly persist 'planned'.
--   * RLS unchanged — relies on each parent table's existing policies.
--   * Until this migration is applied, the client falls back to a per-
--     property lifecycle override stored in localStorage (see
--     client/src/lib/localStore.ts → KEYS.propertyLifecycle). The override
--     is auto-cleared once the DB row carries a matching value, so applying
--     this migration is the durable cutover.
--
-- Apply via Supabase SQL editor. No rollback required (column is additive).
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS sf_properties
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'settled';

-- Constrain to the enum used by the UI / engine. NULL allowed for legacy
-- rows; the application code treats NULL as 'settled' on read.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sf_properties_lifecycle_status_check'
  ) THEN
    ALTER TABLE IF EXISTS sf_properties
      ADD CONSTRAINT sf_properties_lifecycle_status_check
      CHECK (
        lifecycle_status IS NULL OR lifecycle_status IN (
          'planned',
          'under_contract',
          'settled'
        )
      );
  END IF;
END $$;

-- Reload the PostgREST schema cache so the new column is immediately
-- visible to the REST API (otherwise PATCH/INSERT will still 204 until
-- the cache refresh interval elapses).
NOTIFY pgrst, 'reload schema';

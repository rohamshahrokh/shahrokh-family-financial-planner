-- ─── Property Lifecycle Status Migration ───────────────────────────────────
-- #FWL_Property_Lifecycle_Persistence_Fix
--
-- Adds the `lifecycle_status` column required by the Property Lifecycle UI
-- (Planned / Under Contract / Settled) so an explicit user selection
-- persists in Supabase across save / refresh / logout / login.
--
-- ─── Default policy ────────────────────────────────────────────────────────
--   * Column DEFAULT is 'planned'. Every NEW row inserted via the UI or
--     REST API without an explicit lifecycle_status will land as 'planned'.
--     This matches the product requirement: a property is only Settled
--     once the user explicitly selects Settled and saves.
--
-- ─── Legacy-row backfill (one-shot, limited in scope) ──────────────────────
--   * Rows that existed BEFORE this migration ran have lifecycle_status =
--     NULL immediately after ADD COLUMN (because the column default only
--     applies to subsequent INSERTs, not retroactively to pre-existing
--     rows).
--   * The existing forecast / debt / rental / expense pipeline currently
--     aggregates every row from sf_properties as if it were active. To
--     preserve byte-for-byte behaviour for users who already have data,
--     we backfill NULL values with 'settled' EXACTLY ONCE at migration
--     time. The WHERE clause limits this to rows that were already in the
--     table and are currently treated as active by the engine — it never
--     overwrites an explicit value the user has chosen, and it never runs
--     against rows inserted after the migration (they always carry the
--     'planned' default).
--   * If you would prefer a more conservative backfill (e.g. only stamp
--     'settled' on rows whose purchase_date is non-null and in the past),
--     replace the WHERE clause below with the commented-out variant. The
--     default heuristic is intentionally simple because every legacy row
--     has been "active" in every forecast surface up to now.
--
-- INVARIANTS:
--   * Strictly additive — safe to re-run (uses IF NOT EXISTS, and the
--     backfill is a no-op once every row has a non-NULL value).
--   * Never overwrites an explicit lifecycle_status the user has set.
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
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'planned';

-- Constrain to the enum used by the UI / engine. NULL allowed only as a
-- transient state immediately after ADD COLUMN; the backfill below clears
-- it for any pre-existing row.
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

-- One-shot legacy-row backfill. Only touches rows where lifecycle_status
-- IS NULL — i.e. rows that existed in sf_properties before this migration
-- and therefore never had a value. Explicit user selections (any non-NULL
-- value) are preserved untouched. Rows inserted after the migration get
-- the column DEFAULT ('planned') and never enter this path.
--
-- Alternative, narrower heuristic (uncomment to use):
--   UPDATE sf_properties
--      SET lifecycle_status = 'settled'
--    WHERE lifecycle_status IS NULL
--      AND purchase_date IS NOT NULL
--      AND purchase_date <= CURRENT_DATE;
UPDATE sf_properties
   SET lifecycle_status = 'settled'
 WHERE lifecycle_status IS NULL;

-- Reload the PostgREST schema cache so the new column is immediately
-- visible to the REST API (otherwise PATCH/INSERT will still 204 until
-- the cache refresh interval elapses).
NOTIFY pgrst, 'reload schema';

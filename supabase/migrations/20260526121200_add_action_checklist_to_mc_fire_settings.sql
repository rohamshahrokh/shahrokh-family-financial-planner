-- ─── FWL Sprint 14.1-A — Action Checklist persistence ──────────────────────
-- Adds a JSONB column to `mc_fire_settings` for persisting the Action Centre
-- checklist (formerly localStorage-only at key `fwl.action_centre.checklist.v1`).
--
-- Shape:
--   { "<action-id>": { "checked": boolean, "checked_at": timestamptz | null } }
--
-- No new table is introduced. No existing column is mutated. Defaults to an
-- empty object so existing rows remain valid without backfill.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.mc_fire_settings
  ADD COLUMN IF NOT EXISTS action_checklist JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.mc_fire_settings.action_checklist IS
  'Action Centre checklist state. Object keyed by action id -> { checked: boolean, checked_at: timestamptz | null }. Default ''{}''::jsonb. Written by client/src/pages/action-plan.tsx with a 400ms debounce; localStorage (fwl.action_centre.checklist.v1) is kept only as an emergency fallback when the Supabase write fails.';

-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- The migration is additive and idempotent. To roll back, execute:
--
--   ALTER TABLE public.mc_fire_settings DROP COLUMN IF EXISTS action_checklist;
--
-- Rolling back drops only the checklist state. No FIRE / Monte Carlo /
-- canonical-goal data is affected.
-- ─────────────────────────────────────────────────────────────────────────────

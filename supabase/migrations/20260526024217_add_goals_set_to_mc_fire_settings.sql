-- ─── FWL Remediation Phase A-1 ──────────────────────────────────────────────
-- Adds explicit goal-set flag + timestamp to mc_fire_settings so the UI can
-- distinguish "user has saved their FIRE goal" from "row exists with defaults".
--
-- Source-of-truth shift:
--   Old: SWR / FIRE target read from scattered places (sf_app_settings,
--        sf_scenarios.swr, hardcoded 4%, sf_snapshot.fire_target_*).
--   New: mc_fire_settings is the single canonical row. goals_set=TRUE means
--        the UI may show derived targets; FALSE means show "Goal not set".
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.mc_fire_settings
  ADD COLUMN IF NOT EXISTS goals_set BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS goal_set_timestamp TIMESTAMPTZ NULL;

-- Backfill existing rows where the user has clearly set non-default values.
-- Forensic finding: production mc_fire_settings has swr_pct=7 (non-default).
-- Conservative rule:
--   goals_set := TRUE  WHEN (swr_pct ≠ 4)
--                       OR (target_fire_age ≠ 55)
--                       OR (target_passive_monthly ≠ 20000)
--   else FALSE (so the UI shows "Goal not set" rather than inventing defaults).
UPDATE public.mc_fire_settings
SET goals_set = TRUE,
    goal_set_timestamp = COALESCE(updated_at, NOW())
WHERE (swr_pct IS NOT NULL AND swr_pct <> 4)
   OR (target_fire_age IS NOT NULL AND target_fire_age <> 55)
   OR (target_passive_monthly IS NOT NULL AND target_passive_monthly <> 20000);

COMMENT ON COLUMN public.mc_fire_settings.goals_set IS 'Explicit flag: TRUE when user has saved their FIRE goal. FALSE means UI must show "Goal not set" and not derive targets from defaults.';
COMMENT ON COLUMN public.mc_fire_settings.goal_set_timestamp IS 'When goals_set was last flipped to TRUE.';

-- ─── ROLLBACK ────────────────────────────────────────────────────────────────
-- The migration is additive and idempotent. To roll back, execute the SQL
-- below (commented to keep this file forward-only by default):
--
--   ALTER TABLE public.mc_fire_settings
--     DROP COLUMN IF EXISTS goals_set,
--     DROP COLUMN IF EXISTS goal_set_timestamp;
--
-- Rolling back loses the user's "goal explicitly set" signal — the UI will
-- revert to inferring goals from non-null target_fire_age / target_passive_monthly,
-- which is the pre-Phase-A behaviour. No data outside these two columns is
-- affected. See PR #88 review item #6.
-- ─────────────────────────────────────────────────────────────────────────────

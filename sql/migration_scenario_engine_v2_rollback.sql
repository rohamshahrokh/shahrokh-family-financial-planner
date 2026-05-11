-- ─── Scenario Engine V2 Rollback ────────────────────────────────────────────
-- Drops all V2 tables created by migration_scenario_engine_v2.sql.
-- Safe to run only if V2 tables hold no data the user wants to keep.
--
-- Order is important: drop children before parents (cascade handles deltas/results).
-- ────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS sf_scenario_reports     CASCADE;
DROP TABLE IF EXISTS sf_scenario_results_v2  CASCADE;
DROP TABLE IF EXISTS sf_scenario_deltas      CASCADE;
DROP TABLE IF EXISTS sf_scenarios_v2         CASCADE;
DROP TABLE IF EXISTS sf_scenario_groups      CASCADE;
DROP TABLE IF EXISTS sf_base_plans           CASCADE;

-- Verify all V2 tables are gone
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'sf_base_plans','sf_scenario_groups','sf_scenarios_v2',
    'sf_scenario_deltas','sf_scenario_results_v2','sf_scenario_reports'
  );
-- Expected: 0 rows

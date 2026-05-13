-- ─── Tax Reform P1b Rollback ────────────────────────────────────────────────
-- #FWL_P1B_UI_Finalisation_TaxReform
--
-- Reverses migration_tax_reform_p1b.sql. Use only if the P1b columns/table
-- need to be removed. Existing client code falls back to current-rules
-- behaviour when these columns are absent.
--
-- WARNING: DROP COLUMN destroys any captured contract/purchase dates.
-- Take a backup of sf_properties before running.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS sf_scenarios_v2
  DROP CONSTRAINT IF EXISTS sf_scenarios_v2_tax_policy_regime_check;
ALTER TABLE IF EXISTS sf_scenarios_v2
  DROP COLUMN IF EXISTS tax_policy_regime;

DROP POLICY IF EXISTS sf_user_tax_regime_pref_owner_rw ON sf_user_tax_regime_pref;
DROP TABLE IF EXISTS sf_user_tax_regime_pref;

ALTER TABLE IF EXISTS sf_properties
  DROP CONSTRAINT IF EXISTS sf_properties_property_type_check;
ALTER TABLE IF EXISTS sf_properties
  DROP COLUMN IF EXISTS property_type,
  DROP COLUMN IF EXISTS contract_date,
  DROP COLUMN IF EXISTS purchase_date,
  DROP COLUMN IF EXISTS settlement_date,
  DROP COLUMN IF EXISTS planned_sale_date,
  DROP COLUMN IF EXISTS is_grandfathered;

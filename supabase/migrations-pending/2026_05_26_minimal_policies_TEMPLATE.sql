-- Minimal policy template for FWL single-household setup.
-- REVIEW EACH POLICY before applying. The patterns below are STARTING POINTS, not production-ready.
-- Replace `USING (true)` with proper tenancy / auth.uid() / owner_id checks as needed.
--
-- After review:
--   1. Apply 01_enable_rls_migration.sql AND this file in the same migration.
--   2. Test in a Supabase branch first (`create_branch` → apply → smoke test → `merge_branch`).
--
-- Pattern 1: tables with explicit `owner_id` column
-- (sf_scenarios, sf_forecast_settings, sf_v2_scenarios, sf_planned_investments)
--   CREATE POLICY tenant_isolation ON public.<table>
--     FOR ALL TO authenticated
--     USING (owner_id = current_setting('app.owner_id', true))
--     WITH CHECK (owner_id = current_setting('app.owner_id', true));
--
-- Pattern 2: single-row config tables keyed by `id = 'shahrokh-family-main'`
-- (sf_snapshot, sf_app_settings, mc_fire_settings, mc_fire_results)
--   CREATE POLICY tenant_isolation ON public.<table>
--     FOR ALL TO authenticated
--     USING (id = current_setting('app.tenant_id', true))
--     WITH CHECK (id = current_setting('app.tenant_id', true));
--
-- Pattern 3: untenanted tables (no obvious tenant key)
-- For now require authenticated user; revisit when multi-tenant arrives.
--   CREATE POLICY require_auth ON public.<table>
--     FOR ALL TO authenticated
--     USING (auth.uid() IS NOT NULL)
--     WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- EXAMPLE: minimal "require auth" policy for ALL 23 tables.
-- This is intentionally PERMISSIVE — locks out anon, allows any authenticated user.
-- Production deployment requires tightening per-table.
-- ============================================================

CREATE POLICY allow_authenticated ON public.sf_snapshot FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_properties FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_stocks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_crypto FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_timeline FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_stock_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_crypto_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_income FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_recurring_bills FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_monthly_budgets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_telegram_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_stock_dca FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_crypto_dca FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_planned_investments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_users FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_cfo_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_cfo_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_bill_occurrences FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_bill_notification_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_daily_digest_log FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated ON public.sf_snapshot_change_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

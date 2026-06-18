# RLS Security Advisory — FWL Production

**Severity:** HIGH (CRITICAL per Supabase advisory)
**Project:** uoraduyyxhtzixcsaidg (shahrokh-financial-planner)
**Detected:** 2026-05-26 during Phase 0 production reconciliation
**Tracked separately from data remediation per user decision (parallel workstream).**

## Risk
23 public tables have Row Level Security DISABLED. Anyone holding the project's anon key can read or modify every row in every table below.

## Affected tables (23)
- sf_snapshot
- sf_expenses
- sf_properties
- sf_stocks
- sf_crypto
- sf_timeline
- sf_stock_transactions
- sf_crypto_transactions
- sf_income
- sf_recurring_bills
- sf_monthly_budgets
- sf_telegram_settings
- sf_app_settings
- sf_stock_dca
- sf_crypto_dca
- sf_planned_investments
- sf_users
- sf_cfo_reports
- sf_cfo_settings
- sf_bill_occurrences
- sf_bill_notification_log
- sf_daily_digest_log
- sf_snapshot_change_log

## Remediation plan
1. **Do NOT auto-apply the ENABLE RLS SQL** — enabling RLS without policies will block all reads/writes from the app (Supabase client uses anon/authenticated roles which will then have zero access).
2. For each table, design appropriate SELECT/INSERT/UPDATE/DELETE policies.
3. Current FWL appears to be single-household (`owner_id = 'shahrokh-family-main'` is hardcoded across rows) — policies could initially be `USING (true)` to maintain current behaviour while RLS is enabled, OR `USING (auth.uid() IS NOT NULL)` to require auth.
4. Test in a Supabase branch first (`create_branch` then `apply_migration` then `merge_branch`).
5. Audit anon key usage — replace with publishable key (`sb_publishable_...`) where possible.

## Why this is filed separately
Per user decision: "Treat RLS as a parallel high-severity workstream. Do not block the data remediation unless required."

## Deliverables in this folder
- `README.md` (this file)
- `01_enable_rls_migration.sql` — raw ENABLE statements, DO NOT APPLY without policies
- `02_minimal_policies_template.sql` — starter SELECT/INSERT/UPDATE/DELETE policies; needs review

## Doc reference
https://supabase.com/docs/guides/database/postgres/row-level-security

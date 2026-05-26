-- ⚠️ DO NOT APPLY THIS FILE STANDALONE.
-- Enabling RLS without policies will block all reads/writes from the app.
-- Apply only AFTER 02_minimal_policies_template.sql is reviewed and adapted.

ALTER TABLE public.sf_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_crypto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_crypto_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_income ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_recurring_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_monthly_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_telegram_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_stock_dca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_crypto_dca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_planned_investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_cfo_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_cfo_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_bill_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_bill_notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_daily_digest_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sf_snapshot_change_log ENABLE ROW LEVEL SECURITY;

-- Sprint 31E — Income save failure fix
-- Adds income classification columns to sf_income to match the payload sent
-- by the Expenses → Income form (income_type / behaviour / forecast_treatment).
-- Without these columns, INSERTs failed with:
--   "Could not find the 'behaviour' column of 'sf_income' in the schema cache."
--
-- Backwards compatibility:
--   * All three columns NOT NULL with safe defaults so legacy clients that
--     omit them still produce valid rows.
--   * Existing 136 rows backfilled from `source` using the same mapping as
--     client/src/pages/expenses.tsx TYPE_DEFAULTS.

ALTER TABLE public.sf_income
  ADD COLUMN IF NOT EXISTS income_type        text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS behaviour          text NOT NULL DEFAULT 'recurring',
  ADD COLUMN IF NOT EXISTS forecast_treatment text NOT NULL DEFAULT 'include';

UPDATE public.sf_income
SET income_type = CASE
    WHEN lower(source) = 'salary'        THEN 'employment_salary'
    WHEN lower(source) = 'bonus'         THEN 'employment_bonus'
    WHEN lower(source) = 'rental income' THEN 'rental_income'
    WHEN lower(source) = 'dividends'     THEN 'dividend_income'
    WHEN lower(source) = 'interest'      THEN 'interest_income'
    WHEN lower(source) = 'tax refund'    THEN 'tax_refund'
    WHEN lower(source) = 'side income'   THEN 'business_income'
    ELSE 'other'
  END
WHERE income_type = 'other';

ALTER TABLE public.sf_income
  DROP CONSTRAINT IF EXISTS sf_income_behaviour_chk,
  DROP CONSTRAINT IF EXISTS sf_income_forecast_treatment_chk;

ALTER TABLE public.sf_income
  ADD CONSTRAINT sf_income_behaviour_chk
    CHECK (behaviour IN ('recurring','one_off')),
  ADD CONSTRAINT sf_income_forecast_treatment_chk
    CHECK (forecast_treatment IN ('include','exclude'));

COMMENT ON COLUMN public.sf_income.income_type        IS 'Canonical income classification (e.g. employment_salary, rental_income). Used by income engine and forecast.';
COMMENT ON COLUMN public.sf_income.behaviour          IS 'Recurring vs one-off. Drives forecast inclusion.';
COMMENT ON COLUMN public.sf_income.forecast_treatment IS 'include / exclude from forecast & Monte Carlo.';

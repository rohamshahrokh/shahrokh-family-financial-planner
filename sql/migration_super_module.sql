-- ─── Super Module Migration ────────────────────────────────────────────────────
-- Adds per-person super fields to sf_snapshot.
-- Super is tracked SEPARATELY from cash — never mixed in.
--
-- Run once in Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE sf_snapshot
  -- Roham super
  ADD COLUMN IF NOT EXISTS roham_super_balance       NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS roham_super_salary        NUMERIC DEFAULT 0,   -- annual gross salary
  ADD COLUMN IF NOT EXISTS roham_employer_contrib    NUMERIC DEFAULT 11.5, -- % (2024-25 SG rate)
  ADD COLUMN IF NOT EXISTS roham_salary_sacrifice    NUMERIC DEFAULT 0,   -- extra $/year pre-tax
  ADD COLUMN IF NOT EXISTS roham_super_growth_rate   NUMERIC DEFAULT 8.0, -- % p.a. (High Growth default)
  ADD COLUMN IF NOT EXISTS roham_super_fee_pct       NUMERIC DEFAULT 0.5, -- % p.a. total fees
  ADD COLUMN IF NOT EXISTS roham_super_insurance_pa  NUMERIC DEFAULT 0,   -- $ p.a. insurance premiums

  -- Fara super
  ADD COLUMN IF NOT EXISTS fara_super_balance        NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fara_super_salary         NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fara_employer_contrib     NUMERIC DEFAULT 11.5,
  ADD COLUMN IF NOT EXISTS fara_salary_sacrifice     NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fara_super_growth_rate    NUMERIC DEFAULT 8.0,
  ADD COLUMN IF NOT EXISTS fara_super_fee_pct        NUMERIC DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS fara_super_insurance_pa   NUMERIC DEFAULT 0;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'sf_snapshot'
  AND column_name LIKE '%super%'
ORDER BY column_name;

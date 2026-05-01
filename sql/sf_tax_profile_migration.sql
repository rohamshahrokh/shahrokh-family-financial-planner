-- ─── sf_tax_profile migration ─────────────────────────────────────────────────
-- Persists the Shahrokh family tax calculator state so inputs survive refresh.
-- 2025-05-01 — Phase 3E

CREATE TABLE IF NOT EXISTS sf_tax_profile (
  id                      BIGSERIAL PRIMARY KEY,
  owner_id                TEXT        NOT NULL DEFAULT 'shahrokh-family-main',
  -- Roham
  roham_salary            NUMERIC     DEFAULT 0,
  roham_tax_year          TEXT        DEFAULT '2025-26',
  roham_super_rate        NUMERIC     DEFAULT 12,
  roham_salary_sacrifice  NUMERIC     DEFAULT 0,
  roham_has_private_health BOOLEAN    DEFAULT FALSE,
  roham_has_help_debt     BOOLEAN     DEFAULT FALSE,
  -- Fara
  fara_salary             NUMERIC     DEFAULT 0,
  fara_tax_year           TEXT        DEFAULT '2025-26',
  fara_super_rate         NUMERIC     DEFAULT 12,
  fara_salary_sacrifice   NUMERIC     DEFAULT 0,
  fara_has_private_health  BOOLEAN    DEFAULT FALSE,
  fara_has_help_debt      BOOLEAN     DEFAULT FALSE,
  -- Meta
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id)
);

-- Enable RLS
ALTER TABLE sf_tax_profile ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access
CREATE POLICY "Allow all authenticated" ON sf_tax_profile
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow anon read/write for app (uses anon key)
CREATE POLICY "Allow anon read write" ON sf_tax_profile
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

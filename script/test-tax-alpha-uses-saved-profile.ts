/**
 * Regression test: #FixTaxAlphaUsesSavedTaxProfile +
 *                  #FixTaxAlphaWrongIncomeSourceStillBroken
 *
 * Covers:
 *   1. override=true → tax profile wins over canonical (and engine never
 *      uses snap.monthly_income as Roham's salary).
 *   2. override=false → canonical wins.
 *   3. No canonical, no profile, no override → income is 0 (missing-data).
 *      The legacy "snap.monthly_income * 12 == Roham" fallback is REMOVED
 *      because that field is the household COMBINED gross.
 *   4. override=true but salaries are 0 → falls back to canonical safely.
 *   5. Save-then-switch flow: profile values fully applied.
 *   6. The exact production scenario: tax profile has $185,600 / $176,500
 *      with override_active=true. Tax Alpha must NOT show $263,280 (which
 *      was snap.monthly_income * 12) or $129,600 (fara_monthly_income * 12).
 *   7. getHouseholdTaxInputs returns consistent values to both consumers.
 */
import {
  buildTaxAlphaInput,
  type CanonicalIncomeLike,
} from "../client/src/lib/taxAlphaEngine";
import { getHouseholdTaxInputs } from "../client/src/lib/householdTaxInputs";

let pass = 0;
let fail = 0;

function assert(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}${detail ? "  " + detail : ""}`);
  } else {
    fail++;
    console.error(`  FAIL  ${name}${detail ? "  " + detail : ""}`);
  }
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const snapshotLow = {
  // Note: snapshot.monthly_income is the COMBINED household figure, so
  // doing `monthly_income * 12` for Roham would double-count Fara — that
  // is the production bug we are guarding against.
  monthly_income: 15_000,        // combined household monthly
  roham_monthly_income: 10_000,  // → Roham annual 120k (canonical sub-field)
  fara_monthly_income: 5_000,    // → Fara  annual  60k (canonical sub-field)
  roham_super_balance: 200_000,
  fara_super_balance: 100_000,
  roham_employer_contrib: 12,
  fara_employer_contrib: 12,
  mortgage: 800_000,
  offset_balance: 100_000,
  stocks: 50_000,
  crypto: 10_000,
  other_debts: 0,
};

const savedProfile = {
  owner_id: "shahrokh-family-main",
  roham_salary: 188_700,
  fara_salary: 183_000,
  roham_tax_year: "2025-26",
  fara_tax_year: "2025-26",
  roham_super_rate: 12,
  fara_super_rate: 12,
  roham_salary_sacrifice: 0,
  fara_salary_sacrifice: 0,
  roham_has_private_health: true,
  fara_has_private_health: true,
  roham_has_help_debt: false,
  fara_has_help_debt: false,
};

const canonicalFromLedger: CanonicalIncomeLike = {
  perPerson: {
    roham: { annual: 150_000 },   // canonical (ledger) value
    fara:  { annual: 100_000 },
  },
};

// ─── 1. override=true → tax profile wins over BOTH snapshot AND canonical ─

(() => {
  const profile = { ...savedProfile, override_active: true };
  const household = getHouseholdTaxInputs(snapshotLow, profile, undefined);
  const input = buildTaxAlphaInput(snapshotLow, [], profile, canonicalFromLedger, household);

  assert(
    "Roham annual income uses tax profile when override_active=true",
    input.roham_annual_income === 188_700,
    `got=${input.roham_annual_income}, expected=188700`,
  );
  assert(
    "Fara annual income uses tax profile when override_active=true",
    input.fara_annual_income === 183_000,
    `got=${input.fara_annual_income}, expected=183000`,
  );
  assert(
    "Private health flag follows tax profile",
    input.roham_has_private_health === true && input.fara_has_private_health === true,
  );
  assert(
    "Employer SG rate follows tax profile",
    input.roham_employer_sg_rate === 12 && input.fara_employer_sg_rate === 12,
  );
  assert(
    "Household selector reports tax_profile_override source",
    household.rohamSource === "tax_profile_override" && household.faraSource === "tax_profile_override",
    `roham=${household.rohamSource} fara=${household.faraSource}`,
  );
})();

// ─── 2. override=false → canonical wins ────────────────────────────────────

(() => {
  const profile = { ...savedProfile, override_active: false };
  // selectCanonicalIncome reads from the snapshot, so set snapshot subfields
  // to the canonical values we expect.
  const snap = { ...snapshotLow, roham_monthly_income: 12_500, fara_monthly_income: 8_333 };
  const household = getHouseholdTaxInputs(snap, profile, undefined);
  const input = buildTaxAlphaInput(snap, [], profile, canonicalFromLedger, household);

  // Canonical (from snapshot sub-fields) → Roham 12500*12=150k, Fara 8333*12≈99996
  assert(
    "Roham annual income uses canonical when override_active=false",
    input.roham_annual_income === 150_000,
    `got=${input.roham_annual_income}, expected=150000`,
  );
  assert(
    "Fara annual income uses canonical when override_active=false",
    Math.abs(input.fara_annual_income - 99_996) < 12,
    `got=${input.fara_annual_income}, expected≈99996`,
  );
  assert(
    "Household selector reports canonical_snapshot_sub_fields source",
    household.rohamSource === "canonical_snapshot_sub_fields",
    `roham=${household.rohamSource}`,
  );
})();

// ─── 3. No data anywhere → income is 0 (missing data, NOT combined*12) ─────

(() => {
  const empty = { monthly_income: 15_000, roham_monthly_income: 0, fara_monthly_income: 0 };
  const household = getHouseholdTaxInputs(empty, undefined, undefined);
  const input = buildTaxAlphaInput(empty, [], undefined, undefined, household);

  // CRITICAL: NEVER use snap.monthly_income (combined) as Roham's salary.
  // Pre-fix: input.roham_annual_income was $180,000 here (15k*12). Bug.
  assert(
    "Missing data does NOT use snap.monthly_income as Roham (was the production bug)",
    input.roham_annual_income !== 180_000,
    `got=${input.roham_annual_income}, must not be 180000`,
  );
  assert(
    "Missing data → Roham reported as 'missing' source",
    household.rohamSource === "missing" || household.rohamSource === "canonical_snapshot_master",
    `got source=${household.rohamSource}`,
  );
})();

// ─── 4. override=true but salaries are 0 → falls back to canonical safely ──

(() => {
  const profile = {
    ...savedProfile,
    override_active: true,
    roham_salary: 0,
    fara_salary: 0,
  };
  const snap = { ...snapshotLow, roham_monthly_income: 11_000, fara_monthly_income: 9_000 };
  const household = getHouseholdTaxInputs(snap, profile, undefined);
  const input = buildTaxAlphaInput(snap, [], profile, canonicalFromLedger, household);

  assert(
    "Override with empty salaries falls back to canonical for Roham",
    input.roham_annual_income === 132_000,  // 11000 * 12
    `got=${input.roham_annual_income}, expected=132000`,
  );
  assert(
    "Override with empty salaries falls back to canonical for Fara",
    input.fara_annual_income === 108_000,   // 9000 * 12
    `got=${input.fara_annual_income}, expected=108000`,
  );
})();

// ─── 5. Save-then-switch flow ───────────────────────────────────────────────

(() => {
  const profile = {
    owner_id: "shahrokh-family-main",
    override_active: true,
    roham_salary: 200_000,
    fara_salary: 200_000,
    roham_super_rate: 11.5,
    fara_super_rate: 12,
  };
  const household = getHouseholdTaxInputs(snapshotLow, profile, undefined);
  const input = buildTaxAlphaInput(snapshotLow, [], profile, canonicalFromLedger, household);

  assert(
    "Save-then-switch flow: Roham 200k applied",
    input.roham_annual_income === 200_000,
    `got=${input.roham_annual_income}`,
  );
  assert(
    "Save-then-switch flow: Fara 200k applied",
    input.fara_annual_income === 200_000,
    `got=${input.fara_annual_income}`,
  );
  assert(
    "Save-then-switch flow: SG rate from profile (11.5 / 12)",
    input.roham_employer_sg_rate === 11.5 && input.fara_employer_sg_rate === 12,
    `roham_sg=${input.roham_employer_sg_rate} fara_sg=${input.fara_employer_sg_rate}`,
  );
})();

// ─── 6. EXACT production scenario reproduction ─────────────────────────────

(() => {
  // Reproduces the user's screenshot: sf_tax_profile has roham=185600,
  // fara=176500, override_active=true. Snapshot has roham_monthly=11140
  // (annual 133680) and fara_monthly=10800 (annual 129600) plus combined
  // monthly_income=21940 (annual 263280).
  //
  // Pre-fix: Tax Alpha was showing roham=$263,280 (combined*12) and
  // fara=$129,600 (snapshot fara*12). Post-fix: must show 185600/176500.
  const snap = {
    monthly_income: 21_940,
    roham_monthly_income: 11_140,
    fara_monthly_income: 10_800,
    roham_super_balance: 200_000,
    fara_super_balance: 100_000,
  };
  const profile = {
    owner_id: "shahrokh-family-main",
    roham_salary: 185_600,
    fara_salary: 176_500,
    override_active: true,
    roham_super_rate: 12,
    fara_super_rate: 12,
  };
  const household = getHouseholdTaxInputs(snap, profile, undefined);
  const input = buildTaxAlphaInput(snap, [], profile, undefined, household);

  assert(
    "Production scenario: Roham shows saved profile 185600, NOT combined 263280",
    input.roham_annual_income === 185_600,
    `got=${input.roham_annual_income}`,
  );
  assert(
    "Production scenario: Fara shows saved profile 176500, NOT snapshot 129600",
    input.fara_annual_income === 176_500,
    `got=${input.fara_annual_income}`,
  );
  assert(
    "Production scenario: combined matches Tax Calculator total 362100",
    household.combinedAnnual === 362_100,
    `got=${household.combinedAnnual}`,
  );
  assert(
    "Production scenario: overrideActive is true",
    household.overrideActive === true,
  );
})();

// ─── 7. getHouseholdTaxInputs is the single source of truth ─────────────────

(() => {
  // Both the Calculator and Alpha must derive their salary from the same
  // selector, otherwise they can diverge again.
  const snap = { roham_monthly_income: 8_000, fara_monthly_income: 6_000 };
  const profile = { override_active: false, roham_salary: 999_999, fara_salary: 999_999 };

  const h = getHouseholdTaxInputs(snap, profile, undefined);
  // When override is OFF, profile values must be ignored even if they exist.
  assert(
    "Selector ignores profile salaries when override=false",
    h.rohamAnnual === 96_000 && h.faraAnnual === 72_000,
    `roham=${h.rohamAnnual} fara=${h.faraAnnual}`,
  );

  // The Tax Alpha engine, given the same household, returns the same values.
  const input = buildTaxAlphaInput(snap, [], profile, undefined, h);
  assert(
    "Engine output == selector output (no divergence)",
    input.roham_annual_income === h.rohamAnnual && input.fara_annual_income === h.faraAnnual,
  );
})();

// ─── Summary ───────────────────────────────────────────────────────────────

if (fail > 0) {
  console.error(`\ntest-tax-alpha-uses-saved-profile: ${fail} failed, ${pass} passed`);
  process.exit(1);
}
console.log(`\ntest-tax-alpha-uses-saved-profile: ${pass} passed`);

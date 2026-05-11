/**
 * Regression test: #FixTaxAlphaUsesSavedTaxProfile
 *
 * Confirms that when sf_tax_profile.override_active is true and the saved
 * roham_salary / fara_salary are set, `buildTaxAlphaInput` uses those values
 * for `roham_annual_income` / `fara_annual_income` instead of the snapshot's
 * monthly_income * 12. Also confirms the override flag toggles the source.
 */
import {
  buildTaxAlphaInput,
  type CanonicalIncomeLike,
} from "../client/src/lib/taxAlphaEngine";

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
  // The user's "wrong" snapshot scenario — snapshot shows lower income than
  // what was saved on the tax profile. Without the fix Tax Alpha used these.
  monthly_income: 10_000,        // Roham annual = 120k from snapshot
  fara_monthly_income: 5_000,    // Fara  annual =  60k from snapshot
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
  const input = buildTaxAlphaInput(snapshotLow, [], profile, canonicalFromLedger);

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
})();

// ─── 2. override=false → canonical wins over snapshot ──────────────────────

(() => {
  const profile = { ...savedProfile, override_active: false };
  const input = buildTaxAlphaInput(snapshotLow, [], profile, canonicalFromLedger);

  assert(
    "Roham annual income uses canonical (ledger) when override_active=false",
    input.roham_annual_income === 150_000,
    `got=${input.roham_annual_income}, expected=150000`,
  );
  assert(
    "Fara annual income uses canonical (ledger) when override_active=false",
    input.fara_annual_income === 100_000,
    `got=${input.fara_annual_income}, expected=100000`,
  );
})();

// ─── 3. No canonical, no profile → falls back to snapshot ──────────────────

(() => {
  const input = buildTaxAlphaInput(snapshotLow, [], undefined, undefined);

  assert(
    "Roham annual income falls back to snapshot when no profile/canonical",
    input.roham_annual_income === 120_000,
    `got=${input.roham_annual_income}, expected=120000`,
  );
  assert(
    "Fara annual income falls back to snapshot when no profile/canonical",
    input.fara_annual_income === 60_000,
    `got=${input.fara_annual_income}, expected=60000`,
  );
})();

// ─── 4. override=true but profile salaries are 0 → falls back to canonical ─

(() => {
  const profile = {
    ...savedProfile,
    override_active: true,
    roham_salary: 0,
    fara_salary: 0,
  };
  const input = buildTaxAlphaInput(snapshotLow, [], profile, canonicalFromLedger);

  assert(
    "Override with empty salaries falls back gracefully (Roham)",
    input.roham_annual_income === 120_000 || input.roham_annual_income === 150_000,
    `got=${input.roham_annual_income}, must not be 0`,
  );
})();

// ─── 5. Save-then-switch flow (the user's scenario): override on, fresh values ─

(() => {
  // Simulates: user enters 200k/200k in Tax Calculator, hits Save, toggles
  // override on, switches to Tax Alpha. Tax Alpha must show 200k/200k.
  const profile = {
    owner_id: "shahrokh-family-main",
    override_active: true,
    roham_salary: 200_000,
    fara_salary: 200_000,
    roham_super_rate: 11.5,
    fara_super_rate: 12,
  };
  const input = buildTaxAlphaInput(snapshotLow, [], profile, canonicalFromLedger);

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

// ─── Summary ───────────────────────────────────────────────────────────────

if (fail > 0) {
  console.error(`\ntest-tax-alpha-uses-saved-profile: ${fail} failed, ${pass} passed`);
  process.exit(1);
}
console.log(`\ntest-tax-alpha-uses-saved-profile: ${pass} passed`);

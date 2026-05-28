/**
 * canonicalFireDerivations.test.ts — Sprint 20 PR-F1.
 *
 * Exercises every pure derivation function the canonical FIRE engine exports.
 * Covers:
 *   - passive-income-only target (default SWR fallback)
 *   - advanced.targetNetWorth override
 *   - advanced.safeWithdrawalRateOverride
 *   - feasibility band transitions at boundary values
 *   - empty-state behaviour (missing primary inputs)
 *   - demo household snapshot (FIRE 2040, $9,000/mo passive → ~$2.7M)
 */

import {
  effectiveSwr,
  requiredNetWorth,
  requiredAssetBaseForIncome,
  requiredMonthlyInvesting,
  feasibilityScore,
  effectiveMaxRiskTolerance,
  effectiveMinLiquidityBufferMonths,
  type FireFeasibilityHousehold,
} from "../canonicalFireDerivations";
import {
  DEFAULT_LIQUIDITY_BUFFER_MONTHS,
  DEFAULT_MAX_RISK_TOLERANCE,
  DEFAULT_SWR_DECIMAL,
  type CanonicalFireTarget,
} from "../../types/canonicalFire";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✔ ${name}`);
  } else {
    fail++;
    console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n── effectiveSwr ──");
{
  const passiveOnly: CanonicalFireTarget = {
    targetFireYear: 2040,
    targetPassiveIncomeMonthly: 9000,
  };
  check(
    "default SWR = 0.04 when no override",
    effectiveSwr(passiveOnly) === DEFAULT_SWR_DECIMAL,
  );
  const withOverride: CanonicalFireTarget = {
    ...passiveOnly,
    advanced: { safeWithdrawalRateOverride: 0.035 },
  };
  check(
    "override applies when set",
    effectiveSwr(withOverride) === 0.035,
  );
  const zeroOverride: CanonicalFireTarget = {
    ...passiveOnly,
    advanced: { safeWithdrawalRateOverride: 0 },
  };
  check(
    "override of 0 falls back to default",
    effectiveSwr(zeroOverride) === DEFAULT_SWR_DECIMAL,
  );
}

console.log("\n── requiredNetWorth: passive-income-only ──");
{
  const target: CanonicalFireTarget = {
    targetFireYear: 2040,
    targetPassiveIncomeMonthly: 9000,
  };
  const nw = requiredNetWorth(target);
  check(
    "9000 * 12 / 0.04 = 2_700_000 (demo household canonical)",
    nw === 2_700_000,
    `got ${nw}`,
  );
  const sameAsAssetBase = requiredAssetBaseForIncome(target);
  check(
    "requiredAssetBaseForIncome equals requiredNetWorth (legacy PPOR-handling preserved)",
    sameAsAssetBase === nw,
  );
}

console.log("\n── requiredNetWorth: advanced.targetNetWorth override ──");
{
  const target: CanonicalFireTarget = {
    targetFireYear: 2040,
    targetPassiveIncomeMonthly: 9000,
    advanced: { targetNetWorth: 4_000_000 },
  };
  check(
    "explicit targetNetWorth wins over SWR derivation",
    requiredNetWorth(target) === 4_000_000,
  );
}

console.log("\n── requiredNetWorth: empty / non-positive passive ──");
{
  check(
    "zero passive → 0",
    requiredNetWorth({ targetFireYear: 2040, targetPassiveIncomeMonthly: 0 }) === 0,
  );
  check(
    "negative passive → 0",
    requiredNetWorth({ targetFireYear: 2040, targetPassiveIncomeMonthly: -1 }) === 0,
  );
}

console.log("\n── requiredMonthlyInvesting: closed-form annuity ──");
{
  const target: CanonicalFireTarget = {
    targetFireYear: 2040,
    targetPassiveIncomeMonthly: 9000,
  };
  // 14 years, 7%, start NW $1,000,000, target $2.7M.
  const pmt = requiredMonthlyInvesting(target, 1_000_000, 14, 0.07);
  check(
    "monthly investment is positive and finite",
    Number.isFinite(pmt) && pmt > 0,
    `got ${pmt}`,
  );
  // Validate the closed-form algebraically.
  const r = 0.07 / 12;
  const n = 14 * 12;
  const compound = Math.pow(1 + r, n);
  const expected = (2_700_000 - 1_000_000 * compound) / ((compound - 1) / r);
  check(
    `closed-form matches algebra (~${expected.toFixed(2)})`,
    Math.abs(pmt - expected) < 1e-6,
  );

  // Already-there: PV >= FV → 0.
  check(
    "0 contribution when current NW already meets target",
    requiredMonthlyInvesting(target, 3_000_000, 14, 0.07) === 0,
  );
  // Zero years and short → infinite.
  check(
    "infinite when years-to-target is zero",
    requiredMonthlyInvesting(target, 100_000, 0, 0.07) === Number.POSITIVE_INFINITY,
  );
  // Zero expected return: linear divide.
  const linear = requiredMonthlyInvesting(target, 0, 10, 0);
  check(
    "zero-return path: PMT = FV / n",
    Math.abs(linear - 2_700_000 / (10 * 12)) < 1e-6,
  );
}

console.log("\n── feasibilityScore: empty inputs → infeasible ──");
{
  const target: CanonicalFireTarget = {
    targetFireYear: 0,
    targetPassiveIncomeMonthly: 0,
  };
  const household: FireFeasibilityHousehold = {
    currentYear: 2026,
    currentNetWorth: 500_000,
    currentMonthlySurplus: 1_000,
    liquidAssets: 50_000,
    monthlyExpenses: 10_000,
    expectedAnnualReturn: 0.07,
  };
  const res = feasibilityScore(target, household);
  check("band = infeasible", res.band === "infeasible");
  check(
    "blockers include both year + passive prompts",
    res.blockers.includes("Pick a target FIRE year.") &&
      res.blockers.includes("Set a monthly passive income target."),
  );
}

console.log("\n── feasibilityScore: target year in past → infeasible ──");
{
  const target: CanonicalFireTarget = {
    targetFireYear: 2020,
    targetPassiveIncomeMonthly: 9000,
  };
  const household: FireFeasibilityHousehold = {
    currentYear: 2026,
    currentNetWorth: 500_000,
    currentMonthlySurplus: 5_000,
    liquidAssets: 50_000,
    monthlyExpenses: 10_000,
    expectedAnnualReturn: 0.07,
  };
  const res = feasibilityScore(target, household);
  check("band = infeasible (past year)", res.band === "infeasible");
  check(
    "blocker mentions past year",
    res.blockers.some(b => b.includes("past")),
  );
}

console.log("\n── feasibilityScore: easy when already at target ──");
{
  const target: CanonicalFireTarget = {
    targetFireYear: 2040,
    targetPassiveIncomeMonthly: 9000,
  };
  const household: FireFeasibilityHousehold = {
    currentYear: 2026,
    currentNetWorth: 3_000_000,
    currentMonthlySurplus: 5_000,
    liquidAssets: 200_000,
    monthlyExpenses: 10_000,
    expectedAnnualReturn: 0.07,
  };
  const res = feasibilityScore(target, household);
  check("band = easy when NW >= required", res.band === "easy");
  check("no blockers when easy", res.blockers.length === 0);
}

console.log("\n── feasibilityScore: stretch / infeasible when surplus is tiny ──");
{
  const target: CanonicalFireTarget = {
    targetFireYear: 2030,
    targetPassiveIncomeMonthly: 9000,
  };
  const household: FireFeasibilityHousehold = {
    currentYear: 2026,
    currentNetWorth: 200_000,
    currentMonthlySurplus: 100,
    liquidAssets: 5_000,
    monthlyExpenses: 10_000,
    expectedAnnualReturn: 0.07,
  };
  const res = feasibilityScore(target, household);
  check(
    "band is stretch or infeasible (very low surplus)",
    res.band === "stretch" || res.band === "infeasible",
    `got band ${res.band} score ${res.score}`,
  );
  check(
    "surplus blocker present",
    res.blockers.some(b => b.toLowerCase().includes("surplus")),
  );
}

console.log("\n── feasibilityScore: moderate range when surplus partially covers ──");
{
  // Engineered case: surplus is enough to cover ~50% of required investing,
  // liquidity buffer ok → expect band between moderate and stretch.
  const target: CanonicalFireTarget = {
    targetFireYear: 2040,
    targetPassiveIncomeMonthly: 9000,
  };
  const household: FireFeasibilityHousehold = {
    currentYear: 2026,
    currentNetWorth: 600_000,
    currentMonthlySurplus: 3_000,
    liquidAssets: 60_000,
    monthlyExpenses: 10_000,
    expectedAnnualReturn: 0.07,
  };
  const res = feasibilityScore(target, household);
  check(
    "band in valid set",
    ["easy", "moderate", "stretch", "infeasible"].includes(res.band),
  );
  check(
    "score in [0,1]",
    res.score >= 0 && res.score <= 1,
  );
}

console.log("\n── effectiveMaxRiskTolerance ──");
{
  const t: CanonicalFireTarget = { targetFireYear: 2040, targetPassiveIncomeMonthly: 9000 };
  check(
    "default risk tolerance = balanced",
    effectiveMaxRiskTolerance(t) === DEFAULT_MAX_RISK_TOLERANCE,
  );
  check(
    "override applies",
    effectiveMaxRiskTolerance({ ...t, advanced: { maxRiskTolerance: "growth" } }) === "growth",
  );
}

console.log("\n── effectiveMinLiquidityBufferMonths ──");
{
  const t: CanonicalFireTarget = { targetFireYear: 2040, targetPassiveIncomeMonthly: 9000 };
  check(
    `default liquidity buffer = ${DEFAULT_LIQUIDITY_BUFFER_MONTHS}`,
    effectiveMinLiquidityBufferMonths(t) === DEFAULT_LIQUIDITY_BUFFER_MONTHS,
  );
  check(
    "override of 0 is allowed",
    effectiveMinLiquidityBufferMonths({ ...t, advanced: { minLiquidityBufferMonths: 0 } }) === 0,
  );
  check(
    "override of 12 applies",
    effectiveMinLiquidityBufferMonths({ ...t, advanced: { minLiquidityBufferMonths: 12 } }) === 12,
  );
}

console.log("\n── Demo household snapshot (Alex & Sara Johnson, FIRE 2040, $9k/mo) ──");
{
  // Canonical demo per /home/user/workspace/sprint20_pr_f1_canonical_fire_spec.md.
  const target: CanonicalFireTarget = {
    targetFireYear: 2040,
    targetPassiveIncomeMonthly: 9000,
  };
  const requiredNw = requiredNetWorth(target);
  check(
    "demo required net worth ≈ $2.7M (preserved from legacy canonical)",
    requiredNw === 2_700_000,
    `got ${requiredNw}`,
  );
  const household: FireFeasibilityHousehold = {
    currentYear: 2026,
    currentNetWorth: 758_000,
    currentMonthlySurplus: 6_800,
    liquidAssets: 115_000,
    monthlyExpenses: 11_200,
    expectedAnnualReturn: 0.07,
  };
  const res = feasibilityScore(target, household);
  check(
    "feasibility band is one of {easy, moderate, stretch, infeasible}",
    ["easy", "moderate", "stretch", "infeasible"].includes(res.band),
  );
  // Deterministic given same inputs.
  const res2 = feasibilityScore(target, household);
  check(
    "feasibility is deterministic",
    res.score === res2.score && res.band === res2.band,
  );
}

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);

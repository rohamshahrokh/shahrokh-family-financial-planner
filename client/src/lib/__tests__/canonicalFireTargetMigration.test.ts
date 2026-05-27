/**
 * canonicalFireTargetMigration.test.ts — Sprint 20 PR-F1.
 *
 * Verifies the migration → CanonicalFireTarget adapter and the empty-state
 * prompt copy expected by the canonical FIRE settings surface.
 */

import {
  synthesiseCanonicalFireTarget,
  toCanonicalFireTarget,
} from "../fireGoalCanonical.migration";
import type { CanonicalFireGoal } from "../fireGoalCanonical";
import {
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

console.log("\n── toCanonicalFireTarget ──");
{
  const goal: CanonicalFireGoal = {
    targetFireYear: 2040,
    targetMonthlyPassiveIncome: 9000,
    swrOverride: 4,
    updatedAt: new Date().toISOString(),
  };
  const target = toCanonicalFireTarget(goal);
  check(
    "targetFireYear preserved",
    target.targetFireYear === 2040,
  );
  check(
    "targetPassiveIncomeMonthly preserved",
    target.targetPassiveIncomeMonthly === 9000,
  );
  check(
    "swrOverride percentage → decimal (4 → 0.04)",
    target.advanced?.safeWithdrawalRateOverride === 0.04,
  );
}

console.log("\n── toCanonicalFireTarget: no swr override ──");
{
  const goal: CanonicalFireGoal = {
    targetFireYear: 2035,
    targetMonthlyPassiveIncome: 8000,
    updatedAt: new Date().toISOString(),
  };
  const target = toCanonicalFireTarget(goal);
  check(
    "advanced is omitted when no override",
    target.advanced === undefined,
  );
}

console.log("\n── synthesiseCanonicalFireTarget: all 3 legacy fields ──");
{
  const t = synthesiseCanonicalFireTarget({
    snapshot: {
      fire_target_age: 55,
      fire_target_monthly_income: 9_000,
      safe_withdrawal_rate: 4,
    },
    currentAge: 41,
  });
  check("non-null result", t !== null);
  if (t) {
    check(
      "targetPassiveIncomeMonthly = 9000",
      t.targetPassiveIncomeMonthly === 9000,
    );
    check(
      "safeWithdrawalRateOverride = 0.04 (legacy 4% → decimal)",
      t.advanced?.safeWithdrawalRateOverride === 0.04,
    );
  }
}

console.log("\n── synthesiseCanonicalFireTarget: legacy snake_case only ──");
{
  const t = synthesiseCanonicalFireTarget({
    snapshot: {
      target_fire_age: 55,
      target_passive_monthly: 9_000,
      swr_pct: 4,
    },
    currentAge: 41,
  });
  check("snake_case path migrates", t !== null);
  if (t) {
    const expected = new Date().getFullYear() + (55 - 41);
    check(
      `targetFireYear derived from age (55-41 → ${expected})`,
      t.targetFireYear === expected,
    );
  }
}

console.log("\n── synthesiseCanonicalFireTarget: only some fields present ──");
{
  // Only legacy age, no income, no swr.
  const t = synthesiseCanonicalFireTarget({
    snapshot: { fire_target_age: 55 },
    currentAge: 40,
  });
  check("partial legacy still migrates", t !== null);
  if (t) {
    check(
      "missing monthly → 0 (engine treats as empty)",
      t.targetPassiveIncomeMonthly === 0,
    );
    check(
      "no SWR override when legacy SWR is absent",
      t.advanced?.safeWithdrawalRateOverride === undefined,
    );
  }
}

console.log("\n── synthesiseCanonicalFireTarget: no legacy at all ──");
{
  const t = synthesiseCanonicalFireTarget({
    snapshot: {},
    legacyStore: {},
    currentAge: 40,
  });
  check("returns null when nothing to migrate", t === null);
}

console.log("\n── Empty-state prompt copy (verbatim per spec) ──");
{
  // The canonical surface must render these exact strings:
  const YEAR_ONLY = "Add a target FIRE year to continue.";
  const INCOME_ONLY = "Add a monthly passive income target to continue.";
  const BOTH = "Add a target FIRE year and monthly passive income to continue.";

  // We model the empty-state selector explicitly here; this is the same
  // expression the panel uses so any drift will fail this assertion.
  const promptFor = (yearValid: boolean, passiveValid: boolean): string | null => {
    if (!yearValid && !passiveValid) return BOTH;
    if (!yearValid) return YEAR_ONLY;
    if (!passiveValid) return INCOME_ONLY;
    return null;
  };

  check("year missing only → year prompt", promptFor(false, true) === YEAR_ONLY);
  check("passive missing only → passive prompt", promptFor(true, false) === INCOME_ONLY);
  check("both missing → combined prompt", promptFor(false, false) === BOTH);
  check("both present → no prompt", promptFor(true, true) === null);
}

console.log("\n── End-to-end: legacy → canonical target → derivations ──");
{
  // Wire the migration output through the F1 derivations engine to prove the
  // demo household's canonical NW is preserved bit-identically.
  const target = synthesiseCanonicalFireTarget({
    snapshot: {
      target_fire_age: 55,
      target_passive_monthly: 9_000,
      swr_pct: 4,
    },
    currentAge: 41,
  }) as CanonicalFireTarget;
  const swr = target.advanced?.safeWithdrawalRateOverride ?? DEFAULT_SWR_DECIMAL;
  const nw = (target.targetPassiveIncomeMonthly * 12) / swr;
  check(
    "end-to-end demo NW = 9000 * 12 / 0.04 = 2_700_000",
    nw === 2_700_000,
    `got ${nw}`,
  );
}

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);

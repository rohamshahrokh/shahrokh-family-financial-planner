/**
 * fireGoalCanonicalMigration.test.ts — Sprint 20 PR-A.
 *
 * Verifies the legacy → canonical conversion preserves the demo household's
 * canonical values and handles every legacy key path the migration is
 * expected to find.
 */

import { synthesiseCanonicalFireGoal, runFireGoalMigration } from "../fireGoalCanonical.migration";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ""}`); }
}

console.log("\n── Synthesis: legacy keys → canonical ──");
{
  // Demo household legacy snapshot — uses mc_fire_settings column names.
  const demo = synthesiseCanonicalFireGoal({
    snapshot: {
      target_fire_age: 55,
      target_passive_monthly: 9000,
      swr_pct: 4,
    },
    currentAge: 41,
  });
  check(`migrated flag true`, demo.migrated === true);
  if (demo.migrated) {
    check(
      `legacyKeysFound includes target_fire_age`,
      demo.legacyKeysFound.includes("target_fire_age"),
    );
    check(
      `legacyKeysFound includes target_passive_monthly`,
      demo.legacyKeysFound.includes("target_passive_monthly"),
    );
    check(
      `legacyKeysFound includes swr_pct`,
      demo.legacyKeysFound.includes("swr_pct"),
    );
    const expectedYear = new Date().getFullYear() + (55 - 41);
    check(
      `targetFireYear derived from age (55 − 41 → currentYear + 14): got ${demo.canonical.targetFireYear}, expected ${expectedYear}`,
      demo.canonical.targetFireYear === expectedYear,
    );
    check(
      `targetMonthlyPassiveIncome = 9000`,
      demo.canonical.targetMonthlyPassiveIncome === 9000,
    );
    check(
      `swrOverride preserved from legacy swr_pct=4`,
      demo.canonical.swrOverride === 4,
    );
    // Demo canonical asset base = 9000 * 12 / 0.04 = 2,700,000 — matches
    // the canonical NW-needed surfaced by mc_fire_settings.
    check(
      `derivedRequiredAssetBase = 9000*12/0.04 = 2,700,000`,
      demo.canonical.derivedRequiredAssetBase === 2_700_000,
    );
  }
}

console.log("\n── Synthesis: snapshot top-level legacy keys ──");
{
  const r = synthesiseCanonicalFireGoal({
    snapshot: {
      fire_target_age: 60,
      fire_target_monthly_income: 12_000,
      safe_withdrawal_rate: 3.5,
    },
    currentAge: 35,
  });
  check(`migrated`, r.migrated === true);
  if (r.migrated) {
    check(
      `legacy fire_target_age found`,
      r.legacyKeysFound.includes("fire_target_age"),
    );
    check(
      `legacy fire_target_monthly_income found`,
      r.legacyKeysFound.includes("fire_target_monthly_income"),
    );
    check(
      `legacy safe_withdrawal_rate found`,
      r.legacyKeysFound.includes("safe_withdrawal_rate"),
    );
    check(
      `targetMonthlyPassiveIncome = 12000`,
      r.canonical.targetMonthlyPassiveIncome === 12_000,
    );
    check(
      `swrOverride = 3.5`,
      r.canonical.swrOverride === 3.5,
    );
  }
}

console.log("\n── Synthesis: legacy-store keys (local storage style) ──");
{
  const r = synthesiseCanonicalFireGoal({
    legacyStore: {
      fireAge: 50,
      targetIncome: 8_000,
      swr: 4.5,
    },
    currentAge: 30,
  });
  check(`migrated`, r.migrated === true);
  if (r.migrated) {
    check(
      `fireAge found`,
      r.legacyKeysFound.includes("fireAge"),
    );
    check(
      `targetIncome found`,
      r.legacyKeysFound.includes("targetIncome"),
    );
    check(
      `swr found`,
      r.legacyKeysFound.includes("swr"),
    );
  }
}

console.log("\n── Synthesis: no legacy fields → skip ──");
{
  const r = synthesiseCanonicalFireGoal({
    snapshot: {},
    legacyStore: {},
    currentAge: 40,
  });
  check(
    `migrated false when no legacy fields`,
    r.migrated === false,
  );
}

console.log("\n── runFireGoalMigration: end-to-end ──");
{
  let flag: string | null = null;
  let written: any = null;
  const result = await runFireGoalMigration({
    source: {
      snapshot: { target_fire_age: 55, target_passive_monthly: 9000, swr_pct: 4 },
      currentAge: 41,
    },
    readFlag: () => flag,
    writeFlag: (iso) => { flag = iso; },
    writeCanonical: async (body) => { written = body; },
    log: () => undefined,
  });
  check(`end-to-end migrated true`, result.migrated === true);
  check(`writeCanonical called`, written !== null);
  if (written) {
    check(`persisted target_fire_age = 55`, written.target_fire_age === 55);
    check(`persisted target_passive_monthly = 9000`, written.target_passive_monthly === 9000);
    check(`persisted swr_pct = 4`, written.swr_pct === 4);
    check(`persisted goals_set = true`, written.goals_set === true);
  }
  check(`flag now set`, flag !== null);

  // Idempotency.
  const second = await runFireGoalMigration({
    source: {
      snapshot: { target_fire_age: 55, target_passive_monthly: 9000, swr_pct: 4 },
      currentAge: 41,
    },
    readFlag: () => flag,
    writeFlag: (iso) => { flag = iso; },
    writeCanonical: async () => { check("writeCanonical SHOULD NOT be called twice", false); },
    log: () => undefined,
  });
  check(
    `second run is skipped (idempotent)`,
    second.migrated === false && (second as any).skipped === true,
  );
}

console.log("\n── Demo canonical values preserved ──");
{
  // Sprint 20 PR-A acceptance: demo household must continue to render
  // FIRE gap = 1,942,000 and NW = 758,000 and Progress = 28.1%.
  // The migration shim preserves these because:
  //   - target_passive_monthly is carried over verbatim → annual = 12 * monthly
  //   - swr_pct is carried over verbatim → fireNumber unchanged
  //   - NW is computed from the ledger, not from the goal
  // So if the same legacy values flow through, the canonical fire numbers
  // are bit-identical to the pre-migration ones.
  const demo = synthesiseCanonicalFireGoal({
    snapshot: { target_fire_age: 55, target_passive_monthly: 9000, swr_pct: 4 },
    currentAge: 41,
  });
  if (demo.migrated) {
    const annual = demo.canonical.targetMonthlyPassiveIncome * 12;
    const fireNumber = annual / ((demo.canonical.swrOverride as number) / 100);
    const nw = 758_000;
    const gap = fireNumber - nw;
    const progress = nw / fireNumber;
    check(
      `demo fireNumber = 9000*12/0.04 = 2,700,000`,
      fireNumber === 2_700_000,
    );
    check(
      `demo gap = 2,700,000 − 758,000 = 1,942,000`,
      gap === 1_942_000,
    );
    check(
      `demo progress ≈ 28.1% (within 0.05)`,
      Math.abs(progress * 100 - 28.1) < 0.05,
      `actual ${(progress * 100).toFixed(2)}%`,
    );
  }
}

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);

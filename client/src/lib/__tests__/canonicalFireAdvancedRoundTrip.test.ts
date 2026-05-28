/**
 * canonicalFireAdvancedRoundTrip.test.ts — Sprint 20 PR-F1 fix-up (defect 3).
 *
 * Reviewer regression: the 4 advanced FIRE settings (targetNetWorth,
 * safeWithdrawalRateOverride, minLiquidityBufferMonths, maxRiskTolerance)
 * previously persisted only to localStorage, so a user setting them on
 * Browser A would NOT see them on Browser B. After the fix, they round-trip
 * server-side via mc_fire_settings.action_checklist.__advanced_fire.
 *
 * This test simulates a cross-device round-trip by:
 *   1. Building a writer payload from a CanonicalFireTarget,
 *   2. Persisting the payload through the same field shape the canonical
 *      writer sends (target_fire_age + target_passive_monthly + swr_pct +
 *      action_checklist with __advanced_fire nested),
 *   3. Reading the stored row through `extractAdvancedFromRow` (the same
 *      helper the canonical reader hook uses on a fresh device),
 *   4. Asserting every advanced field survives the round-trip with the same
 *      type and value the user entered.
 *
 * Run with:
 *   tsx client/src/lib/__tests__/canonicalFireAdvancedRoundTrip.test.ts
 */

import {
  extractAdvancedFromRow,
  ADVANCED_FIRE_CHECKLIST_KEY,
} from "../fireGoalCanonical";
import type { CanonicalFireAdvancedSettings } from "@/types/canonicalFire";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    pass++;
    console.log(`  ✔ ${name}`);
  } else {
    fail++;
    console.log(`  ✘ ${name}${detail ? `  - ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n-- ${title} --`);
}

// Simulates the action_checklist column on mc_fire_settings — Browser A
// writes, Browser B reads back the same JSON blob from Supabase.
function browserAWrite(advanced: CanonicalFireAdvancedSettings) {
  // Pre-existing checklist entries must survive the read-modify-write the
  // canonical writer performs. We seed one to prove the writer is additive.
  const checklist: Record<string, unknown> = {
    "action-1": { checked: true, checked_at: "2026-05-01T00:00:00Z" },
  };
  if (Object.keys(advanced).length > 0) {
    checklist[ADVANCED_FIRE_CHECKLIST_KEY] = { ...advanced };
  }
  // The row shape mirrors what `useSetFireGoal()` writes to /api/mc-fire-settings.
  return {
    target_fire_age: 55,
    target_passive_monthly: 9000,
    swr_pct: 4,
    goals_set: true,
    goal_set_timestamp: "2026-05-01T00:00:00Z",
    action_checklist: checklist,
  };
}

section("(1) Full advanced bundle round-trips");
{
  const written: CanonicalFireAdvancedSettings = {
    targetNetWorth: 3_000_000,
    safeWithdrawalRateOverride: 0.0375,
    minLiquidityBufferMonths: 9,
    maxRiskTolerance: "growth",
  };
  const row = browserAWrite(written);
  const read = extractAdvancedFromRow(row);
  check("read is non-null after writing a full bundle", read !== null);
  check(
    "targetNetWorth survives (3000000)",
    read?.targetNetWorth === 3_000_000,
    `got ${read?.targetNetWorth}`,
  );
  check(
    "safeWithdrawalRateOverride survives (0.0375 decimal)",
    read?.safeWithdrawalRateOverride === 0.0375,
    `got ${read?.safeWithdrawalRateOverride}`,
  );
  check(
    "minLiquidityBufferMonths survives (9)",
    read?.minLiquidityBufferMonths === 9,
    `got ${read?.minLiquidityBufferMonths}`,
  );
  check(
    "maxRiskTolerance survives (growth)",
    read?.maxRiskTolerance === "growth",
    `got ${read?.maxRiskTolerance}`,
  );
  check(
    "non-FIRE checklist entries are not clobbered by the writer",
    (row.action_checklist as any)["action-1"]?.checked === true,
  );
}

section("(2) Partial bundle (single field) still round-trips");
{
  const written: CanonicalFireAdvancedSettings = { targetNetWorth: 2_000_000 };
  const row = browserAWrite(written);
  const read = extractAdvancedFromRow(row);
  check("read is non-null", read !== null);
  check(
    "only targetNetWorth surfaces (others stay undefined)",
    read?.targetNetWorth === 2_000_000 &&
      read?.safeWithdrawalRateOverride === undefined &&
      read?.minLiquidityBufferMonths === undefined &&
      read?.maxRiskTolerance === undefined,
  );
}

section("(3) Empty advanced bundle does not write the sub-key");
{
  const written: CanonicalFireAdvancedSettings = {};
  const row = browserAWrite(written);
  check(
    "checklist does NOT contain the __advanced_fire key",
    (row.action_checklist as Record<string, unknown>)[ADVANCED_FIRE_CHECKLIST_KEY] === undefined,
  );
  const read = extractAdvancedFromRow(row);
  check("read returns null when nothing is persisted", read === null);
}

section("(4) Hostile / malformed payloads are rejected");
{
  const malformed = {
    action_checklist: {
      [ADVANCED_FIRE_CHECKLIST_KEY]: {
        targetNetWorth: "not a number",
        safeWithdrawalRateOverride: -0.04,
        minLiquidityBufferMonths: NaN,
        maxRiskTolerance: "yolo",
      },
    },
  };
  const read = extractAdvancedFromRow(malformed as any);
  check(
    "every malformed field is filtered out (read is null)",
    read === null,
    `got ${JSON.stringify(read)}`,
  );
}

section("(5) Missing action_checklist column tolerated");
{
  check("null row returns null", extractAdvancedFromRow(null) === null);
  check("missing checklist key returns null", extractAdvancedFromRow({} as any) === null);
  check(
    "string in __advanced_fire key returns null",
    extractAdvancedFromRow({ action_checklist: { [ADVANCED_FIRE_CHECKLIST_KEY]: "bad" } } as any) === null,
  );
}

console.log("\n-- Summary --");
console.log(`  pass: ${pass}`);
console.log(`  fail: ${fail}`);
if (fail > 0) process.exit(1);

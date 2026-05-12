/**
 * test-active-regime-store.ts — Active regime store tests (P1, headless).
 *
 * Run: npx tsx script/test-active-regime-store.ts
 */

import {
  getActiveRegime,
  getActiveRegimeEngineArgs,
  getActiveReformRegime,
  getActiveCustomRegime,
  setActiveRegime,
  subscribeActiveRegime,
  resetActiveRegime,
} from "../client/src/lib/activeRegimeStore";
import {
  PROPOSED_2027_REFORM_REGIME,
  REGIMES_BY_KIND,
} from "../client/src/lib/taxPolicyEngine";

const TESTS: Array<{ name: string; assert: () => void }> = [];
function test(n: string, fn: () => void) { TESTS.push({ name: n, assert: fn }); }
function eq(a: any, b: any, m: string) {
  if (a !== b) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

// ─── Test 1: Defaults ───────────────────────────────────────────────────────

test("Default state = AUTO_DETECT, no overrides", () => {
  resetActiveRegime();
  const s = getActiveRegime();
  eq(s.selector, "AUTO_DETECT", "default selector");
  eq(s.customRegime, undefined, "default customRegime");
  eq(s.reformRegime, undefined, "default reformRegime");

  // Convenience accessors fall back to spec defaults.
  eq(getActiveReformRegime(), PROPOSED_2027_REFORM_REGIME, "active reform fallback");
  eq(getActiveCustomRegime(), REGIMES_BY_KIND.CUSTOM_STRESS_TEST, "active custom fallback");
});

// ─── Test 2: setActiveRegime updates state ──────────────────────────────────

test("setActiveRegime replaces selector + fires subscribers", () => {
  resetActiveRegime();
  let fireCount = 0;
  const unsubscribe = subscribeActiveRegime(() => { fireCount++; });

  setActiveRegime({ selector: "PROPOSED_2027_REFORM" });
  eq(getActiveRegime().selector, "PROPOSED_2027_REFORM", "selector after set");
  eq(fireCount, 1, "fired once");

  setActiveRegime({ selector: "CURRENT_RULES" });
  eq(getActiveRegime().selector, "CURRENT_RULES", "selector after second set");
  eq(fireCount, 2, "fired twice");

  unsubscribe();
  setActiveRegime({ selector: "AUTO_DETECT" });
  eq(fireCount, 2, "no fires after unsubscribe");
});

// ─── Test 3: Engine args convenience ─────────────────────────────────────────

test("getActiveRegimeEngineArgs returns composite args", () => {
  resetActiveRegime();
  setActiveRegime({ selector: "PROPOSED_2027_REFORM" });
  const args = getActiveRegimeEngineArgs();
  eq(args.regimeSelector, "PROPOSED_2027_REFORM", "args.selector");
  eq(args.customRegime, undefined, "args.customRegime");
  eq(args.reformRegime, undefined, "args.reformRegime");
});

// ─── Test 4: Custom regime override ─────────────────────────────────────────

test("Custom regime override propagates to getActiveCustomRegime", () => {
  resetActiveRegime();
  const customRegime = {
    ...REGIMES_BY_KIND.CUSTOM_STRESS_TEST,
    label: "Stress: NG abolished + CGT 100%",
    defaultNegativeGearing: "ABOLISH" as const,
    defaultCGTDiscountPct: 0,
  };
  setActiveRegime({ selector: "CUSTOM_STRESS_TEST", customRegime });
  eq(getActiveCustomRegime().label, "Stress: NG abolished + CGT 100%", "custom propagated");
  eq(getActiveCustomRegime().defaultNegativeGearing, "ABOLISH", "custom NG");
});

// ─── Test 5: Reset clears overrides ─────────────────────────────────────────

test("resetActiveRegime restores defaults + fires subscribers", () => {
  setActiveRegime({ selector: "PROPOSED_2027_REFORM" });
  let fired = false;
  const unsubscribe = subscribeActiveRegime(() => { fired = true; });
  resetActiveRegime();
  eq(getActiveRegime().selector, "AUTO_DETECT", "selector reset");
  eq(fired, true, "subscriber fired on reset");
  unsubscribe();
});

// ─── Test 6: Partial set preserves untouched fields ─────────────────────────

test("Partial setActiveRegime preserves untouched fields", () => {
  resetActiveRegime();
  setActiveRegime({ selector: "PROPOSED_2027_REFORM" });
  setActiveRegime({}); // no-op for everything
  eq(getActiveRegime().selector, "PROPOSED_2027_REFORM", "selector preserved");
});

// ─── Runner ──────────────────────────────────────────────────────────────────

let pass = 0, fail = 0;
for (const t of TESTS) {
  try {
    t.assert();
    console.log(`✓ ${t.name}`);
    pass++;
  } catch (e: any) {
    console.error(`✗ ${t.name}: ${e?.message ?? e}`);
    fail++;
  }
}
console.log(`\n${pass}/${TESTS.length} passed`);
if (fail > 0) process.exit(1);

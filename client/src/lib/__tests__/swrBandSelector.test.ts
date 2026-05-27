/**
 * swrBandSelector.test.ts — Sprint 20 PR-A unit tests.
 *
 * Verifies the deterministic band selection across three canonical profiles
 * (conservative, balanced, aggressive) plus the override resolver.
 */

import { selectSwrBand, resolveEffectiveSwr, type SwrInputs } from "../recommendationEngine/swrBandSelector";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const baseProfile: SwrInputs = {
  retirementHorizonYears: 25,
  equityShare: 0.6,
  propertyShare: 0.3,
  leverageRatio: 0.3,
  currentAge: 40,
  liquidityMonths: 6,
  incomeReliability: "medium",
};

console.log("\n── Band selection ──");
{
  const conservative = selectSwrBand({
    ...baseProfile,
    retirementHorizonYears: 40,
    propertyShare: 0.7,
    leverageRatio: 0.6,
    liquidityMonths: 2,
    incomeReliability: "low",
    currentAge: 60,
  });
  check(
    `long horizon + high leverage + property → conservative`,
    conservative.band === "conservative",
    `got ${conservative.band} (${conservative.rationale})`,
  );
  check(
    `conservative rate is in [3.0, 3.5]`,
    conservative.rate >= 3.0 && conservative.rate <= 3.5,
    `rate ${conservative.rate}`,
  );

  const aggressive = selectSwrBand({
    ...baseProfile,
    retirementHorizonYears: 10,
    leverageRatio: 0.1,
    liquidityMonths: 18,
    incomeReliability: "high",
    currentAge: 30,
  });
  check(
    `short horizon + low leverage + high liquidity → aggressive`,
    aggressive.band === "aggressive",
    `got ${aggressive.band} (${aggressive.rationale})`,
  );
  check(
    `aggressive rate is in [4.0, 4.5]`,
    aggressive.rate >= 4.0 && aggressive.rate <= 4.5,
    `rate ${aggressive.rate}`,
  );

  const balanced = selectSwrBand(baseProfile);
  check(
    `default 25y horizon profile → balanced`,
    balanced.band === "balanced",
    `got ${balanced.band} (${balanced.rationale})`,
  );
  check(
    `balanced rate is in [3.5, 4.0]`,
    balanced.rate >= 3.5 && balanced.rate <= 4.0,
    `rate ${balanced.rate}`,
  );
}

console.log("\n── Override resolution ──");
{
  const engineResult = selectSwrBand(baseProfile);
  const noOverride = resolveEffectiveSwr(engineResult, undefined);
  check(
    `no override → engine rate used`,
    noOverride.effectiveSwrPct === engineResult.rate && !noOverride.isOverridden,
  );
  check(
    `no override → no notice surfaced`,
    noOverride.overrideNotice === null,
  );
  const overridden = resolveEffectiveSwr(engineResult, 3.5);
  check(
    `override 3.5 → effective is 3.5`,
    overridden.effectiveSwrPct === 3.5 && overridden.isOverridden,
  );
  check(
    `override emits an info notice`,
    typeof overridden.overrideNotice === "string" && overridden.overrideNotice!.includes("3.50%"),
    `notice: ${overridden.overrideNotice}`,
  );
  const zeroOverride = resolveEffectiveSwr(engineResult, 0);
  check(
    `zero override is ignored`,
    !zeroOverride.isOverridden,
  );
}

console.log("\n── Robust to bad inputs ──");
{
  const r = selectSwrBand({
    retirementHorizonYears: Number.NaN as unknown as number,
    equityShare: 2 as unknown as number,
    propertyShare: -0.5 as unknown as number,
    leverageRatio: Number.NaN as unknown as number,
    currentAge: 200 as unknown as number,
    liquidityMonths: Number.NaN as unknown as number,
    incomeReliability: "medium",
  });
  check(
    `NaN / out-of-range inputs do not produce NaN rate`,
    Number.isFinite(r.rate),
    `rate ${r.rate}`,
  );
}

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);

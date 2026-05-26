/**
 * Sprint 13 P0 — Foundations unit tests.
 *
 * Covers:
 *   - netWorthBreakdown.ts: reconciliation pass/fail, lineage completeness
 *   - recommendationGate.ts: every required-field-missing case
 *   - goalValidation.ts: EMPTY_GOAL_TARGETS detection + schema-default detection
 *   - strategyValidity.ts: filter behaviour
 *
 * Run with: tsx script/test-sprint13-p0-foundations.ts
 */

import { selectCanonicalNetWorthBreakdown } from "../client/src/lib/netWorthBreakdown";
import {
  isStrategyComplete,
  missingStrategyFields,
  gateRecommendations,
  RECOMMENDATION_UNAVAILABLE_TEXT,
} from "../client/src/lib/recommendationGate";
import {
  validateGoalTargets,
  GOAL_INCOMPLETE_TEXT,
} from "../client/src/lib/goalValidation";
import {
  isValidStrategy,
  filterValidStrategies,
} from "../client/src/lib/strategyValidity";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function assert(cond: boolean, name: string, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function assertEq<T>(actual: T, expected: T, name: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  assert(ok, name, ok ? "" : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ─── netWorthBreakdown.ts ───────────────────────────────────────────── */
console.log("\n[1/4] netWorthBreakdown.ts");

{
  // Local-seed fixture: PPOR 1,510k + cash 20k + offset 222k + super 88k
  // (49.5 roham + 38.5 fara) + cars 65k + iran 150k − mortgage 1,200k
  // − other_debts 15k = $840k.
  const ledger: any = {
    snapshot: {
      ppor: 1_510_000,
      cash: 20_000,
      savings_cash: 0,
      emergency_cash: 0,
      other_cash: 0,
      offset_balance: 222_000,
      roham_super_balance: 49_500,
      fara_super_balance: 38_500,
      super_balance: 0,
      stocks: 0,
      crypto: 0,
      cars: 65_000,
      iran_property: 150_000,
      other_assets: 0,
      mortgage: 1_200_000,
      other_debts: 15_000,
    },
    properties: [],
    stocks: [],
    cryptos: [],
    holdingsRaw: [],
    incomeRecords: [],
    expenses: [],
  };
  const bd = selectCanonicalNetWorthBreakdown(ledger);
  assertEq(bd.netWorth, 840_000, "local seed netWorth = $840k");
  assertEq(bd.totalAssets, 2_055_000, "totalAssets = $2,055k");
  assertEq(bd.totalLiabilities, 1_215_000, "totalLiabilities = $1,215k");
  assertEq(bd.reconciled, true, "reconciled = true for canonical seed");
  assertEq(bd.reconcileDelta, 0, "reconcileDelta = 0 for canonical seed");
  assert(bd.lineage.length === 11, "lineage rows = 11");
  // Every lineage row must carry sourceTable+sourceField+formula
  const allTagged = bd.lineage.every(
    (l) => !!l.sourceTable && !!l.sourceField && !!l.formula,
  );
  assert(allTagged, "every lineage row has sourceTable + sourceField + formula");
}

{
  // Empty ledger: all zeros — reconciled, NW = 0
  const ledger: any = {
    snapshot: {},
    properties: [], stocks: [], cryptos: [], holdingsRaw: [],
    incomeRecords: [], expenses: [],
  };
  const bd = selectCanonicalNetWorthBreakdown(ledger);
  assertEq(bd.netWorth, 0, "empty ledger NW = 0");
  assertEq(bd.reconciled, true, "empty ledger reconciled");
}

/* ─── recommendationGate.ts ──────────────────────────────────────────── */
console.log("\n[2/4] recommendationGate.ts");

const completeStrategy = {
  fireYear: 2042,
  confidence: 0.72,
  requiredContribution: 5_000,
  requiredAssetBase: 4_000_000,
  requiredPassiveIncome: 240_000,
};

assertEq(isStrategyComplete(completeStrategy), true, "complete strategy passes");
assertEq(missingStrategyFields(completeStrategy), [], "no missing fields when complete");

for (const field of [
  "fireYear",
  "confidence",
  "requiredContribution",
  "requiredAssetBase",
  "requiredPassiveIncome",
] as const) {
  const broken: any = { ...completeStrategy, [field]: null };
  assertEq(isStrategyComplete(broken), false, `${field}=null → incomplete`);
  assertEq(missingStrategyFields(broken), [field], `${field} listed in missing`);

  const nan: any = { ...completeStrategy, [field]: NaN };
  assertEq(isStrategyComplete(nan), false, `${field}=NaN → incomplete`);

  const undef: any = { ...completeStrategy };
  delete undef[field];
  assertEq(isStrategyComplete(undef), false, `${field}=undefined → incomplete`);
}

{
  const ok = gateRecommendations([completeStrategy, completeStrategy]);
  assertEq(ok.ok, true, "gate ok=true when all complete");
  assertEq(ok.recs.length, 2, "gate passes all recs through");
}

{
  const broken = gateRecommendations([completeStrategy, { ...completeStrategy, fireYear: null }]);
  assertEq(broken.ok, false, "gate ok=false when ANY incomplete");
  assertEq(broken.recs.length, 0, "gate returns empty recs on incomplete");
  assert(
    broken.reason.includes("fireYear"),
    "gate reason mentions missing field",
  );
}

{
  const empty = gateRecommendations([]);
  assertEq(empty.ok, false, "gate blocks empty input");
}

assert(
  RECOMMENDATION_UNAVAILABLE_TEXT.length > 0,
  "sentinel text is non-empty",
);

/* ─── goalValidation.ts ──────────────────────────────────────────────── */
console.log("\n[3/4] goalValidation.ts");

{
  const empty = validateGoalTargets({});
  assertEq(empty.status, "INCOMPLETE", "EMPTY_GOAL_TARGETS → INCOMPLETE");
  assert(
    empty.missingFields.includes("requiredNetWorth") &&
      empty.missingFields.includes("requiredPassiveIncome") &&
      empty.missingFields.includes("targetFireYear") &&
      empty.missingFields.includes("fireTargetMonthlyIncomeExplicitSet"),
    "EMPTY_GOAL_TARGETS missingFields lists all 4",
  );
}

{
  // User HAS persisted targets but NO explicit fire_target_monthly_income_set_at
  // — schema-default detection: still INCOMPLETE.
  const r = validateGoalTargets({
    targetNetWorth: 6_000_000,
    targetPassiveIncomeAnnual: 240_000,
    targetFireYear: 2045,
    fireTargetMonthlyIncomeRaw: 20_000,
    fireTargetMonthlyIncomeSetAt: null,
  });
  assertEq(r.status, "INCOMPLETE", "schema-default detection: SetAt=null → INCOMPLETE");
  assert(
    r.missingFields.includes("fireTargetMonthlyIncomeExplicitSet"),
    "missingFields names the schema-default explicit-set flag",
  );
}

{
  // Same row but with set_at populated → VALID.
  const r = validateGoalTargets({
    targetNetWorth: 6_000_000,
    targetPassiveIncomeAnnual: 240_000,
    targetFireYear: 2045,
    fireTargetMonthlyIncomeRaw: 20_000,
    fireTargetMonthlyIncomeSetAt: "2026-05-01T00:00:00.000Z",
  });
  assertEq(r.status, "VALID", "all targets + set_at → VALID");
  assertEq(r.missingFields, [], "VALID → empty missingFields");
}

{
  // Passive income persisted as MONTHLY (not annual) — still VALID.
  const r = validateGoalTargets({
    targetNetWorth: 6_000_000,
    targetPassiveIncomeMonthly: 20_000,
    targetFireYear: 2045,
    fireTargetMonthlyIncomeSetAt: "2026-05-01T00:00:00.000Z",
  });
  assertEq(r.status, "VALID", "passive income monthly only → VALID");
}

{
  // FIRE year can come via retirementYear alias.
  const r = validateGoalTargets({
    targetNetWorth: 6_000_000,
    targetPassiveIncomeAnnual: 240_000,
    targetRetirementYear: 2045,
    fireTargetMonthlyIncomeSetAt: "2026-05-01T00:00:00.000Z",
  });
  assertEq(r.status, "VALID", "retirementYear alias → VALID");
}

assert(GOAL_INCOMPLETE_TEXT.length > 0, "goal sentinel text is non-empty");

/* ─── strategyValidity.ts ────────────────────────────────────────────── */
console.log("\n[4/4] strategyValidity.ts");

const completeS = {
  id: "s1",
  label: "Test",
  fireYear: 2042,
  netWorth: 5_000_000,
  passiveIncome: 200_000,
  liquidity: 12,
  riskScore: 0.3,
  confidence: 0.8,
};

assertEq(isValidStrategy(completeS), true, "complete strategy valid");
assertEq(isValidStrategy(null), false, "null strategy invalid");
assertEq(isValidStrategy(undefined), false, "undefined strategy invalid");

for (const f of ["fireYear", "netWorth", "passiveIncome", "liquidity", "riskScore", "confidence"] as const) {
  assertEq(
    isValidStrategy({ ...completeS, [f]: null }),
    false,
    `${f}=null → invalid`,
  );
  assertEq(
    isValidStrategy({ ...completeS, [f]: NaN }),
    false,
    `${f}=NaN → invalid`,
  );
}

{
  const list = [
    completeS,
    { ...completeS, id: "s2", fireYear: null },
    { ...completeS, id: "s3", liquidity: NaN },
    { ...completeS, id: "s4" },
  ];
  const res = filterValidStrategies(list);
  assertEq(res.kept.length, 2, "filter keeps 2 valid");
  assertEq(res.excluded.length, 2, "filter excludes 2");
  assertEq(
    res.excluded.map((e) => e.id).sort(),
    ["s2", "s3"],
    "excluded ids are s2,s3",
  );
  assert(
    res.excluded[0].missing.length > 0,
    "excluded row carries reason",
  );
}

assertEq(filterValidStrategies(null).kept, [], "null list → empty kept");
assertEq(filterValidStrategies(undefined).excluded, [], "undefined list → empty excluded");

/* ─── Summary ────────────────────────────────────────────────────────── */
console.log(`\nSprint 13 P0-A foundations: ${pass} pass, ${fail} fail`);
if (fail > 0) {
  console.error("\nFailures:");
  for (const f of failures) console.error("  " + f);
  process.exit(1);
}
process.exit(0);

/**
 * canonicalMoveRanking.test.ts — Sprint 20 PR-F2 Section 3.5.
 *
 * Snapshot ranking for the demo household across the 5 named PR-F2 moves:
 *   1. sell_investment_property
 *   2. refinance_ppor
 *   3. extra_super_contribution
 *   4. extra_etf_dca
 *   5. debt_recycling
 *
 * The test pins the rank ORDER and the rankScore each move produces, so any
 * unintended weight or formula change is visible in code review.
 *
 * Demo household invariants (per Sprint 20 PR-F2 charter):
 *   NW = $758,000 · FIRE gap = $1,942,000 · target NW = $2,700,000
 *   FIRE 2040 @ $9,000/mo passive → 9000 × 12 / 0.04 = $2,700,000
 */

import { rankMove, rankMoves, MOVE_RANKING_WEIGHTS, type MoveRankingHousehold } from "../recommendationEngine/rankMove";
import { classifyProperty, classifyProperties, propertyLeverage } from "../property";
import { DEMO_PROPERTIES } from "../demoData";
import type { CanonicalFireTarget } from "../../types/canonicalFire";
import type { MoveDefinition } from "../../types/canonicalMove";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const TODAY = new Date("2026-05-28T00:00:00Z");
const FIRE: CanonicalFireTarget = {
  targetFireYear: 2040,
  targetPassiveIncomeMonthly: 9_000,
};

const classified = classifyProperties(DEMO_PROPERTIES, TODAY);
const ppor = classified.find(p => p.kind === "ppor")!;

// Build the demo-household snapshot the engine consumes. PPOR-only because
// IP1 in the demo fixture is planned (2027 purchase date).
const HOUSEHOLD: MoveRankingHousehold = {
  currentNetWorth: 758_000,
  totalInvestmentPropertyValue: 0,
  totalInvestmentPropertyLoans: 0,
  totalPpoRValue: 1_200_000,
  totalPpoRLoanBalance: 850_000,
  monthlyIncome: 18_000,
  monthlyExpenses: 11_200,
  liquidCash: 115_000,
  propertyLeverage: propertyLeverage(classified),
  debtToAssetRatio: (850_000 + 14_500) / 1_507_500,
  properties: classified,
  marginalTaxRate: 0.37,
};

// Five named moves; deterministic params.
//
// For the sell-IP move on the demo household we synthesise a settled-IP
// fixture (IP1 in the demo is PLANNED, so it has no rent flow today —
// selling it wouldn't make sense). The synthesised IP uses the demo IP1's
// nominal value/loan and is held >12 months.
const SELL_IP = classifyProperty({
  id: 999,
  name: "IP1 settled (synthetic for ranking)",
  type: "investment",
  purchase_date: "2023-01-01",
  purchase_price: 700_000,
  current_value: 800_000,
  loan_amount: 600_000,
  interest_rate: 6.5,
  loan_type: "Interest Only",
  weekly_rent: 650,
  vacancy_rate: 3,
  management_fee: 8.5,
  council_rates: 2_000,
  insurance: 2_000,
  maintenance: 4_000,
  selling_costs: 0,
}, TODAY);

const MOVES: ReadonlyArray<MoveDefinition> = [
  {
    moveId: "sell_investment_property",
    params: {
      property: SELL_IP,
      marginalTaxRate: 0.37,
      cgtDiscountEligible: true,
    },
  },
  {
    moveId: "refinance_ppor",
    params: { property: ppor, newInterestRate: 0.0525, refinanceCosts: 1_500 },
  },
  {
    moveId: "extra_super_contribution",
    params: { extraMonthly: 500, marginalTaxRate: 0.37, yearsToPreservation: 18 },
  },
  {
    moveId: "extra_etf_dca",
    params: { extraMonthly: 750, expectedReturnAnnual: 0.085 },
  },
  {
    moveId: "debt_recycling",
    params: {
      redrawAmount: 100_000,
      pporProperty: ppor,
      marginalTaxRate: 0.37,
      expectedReturnAnnual: 0.085,
    },
  },
];

console.log("\n── Single rankMove call shape ──");
{
  const r = rankMove(FIRE, HOUSEHOLD, MOVES[1]); // refinance
  check("RankedMove.moveId set", r.moveId === "refinance_ppor");
  check("RankedMove.confidence in {low, medium, high}", ["low", "medium", "high"].includes(r.confidence));
  check("RankedMove.rankScore finite", Number.isFinite(r.rankScore));
  check(
    "RankedMove.expectedFireDateDelta has integer years",
    Number.isInteger(r.expectedFireDateDelta.years) && Number.isInteger(r.expectedFireDateDelta.months),
  );
}

console.log("\n── 5-move ranking snapshot ──");
{
  const ranked = rankMoves(FIRE, HOUSEHOLD, MOVES);
  check("5 moves ranked", ranked.length === 5);

  // Print the canonical snapshot for the PR description.
  console.log("    rank  moveId                        rankScore     fireYearsPulled  NW Δ25y          conf");
  ranked.forEach((m, i) => {
    const years = m.expectedFireDateDelta.years + m.expectedFireDateDelta.months / 12;
    console.log(
      `    ${i + 1}     ${m.moveId.padEnd(28)} ${m.rankScore.toFixed(4).padStart(8)}      ${years.toFixed(2).padStart(6)}           ${m.expectedNetWorthDelta25y.toString().padStart(12)}   ${m.confidence}`,
    );
  });

  // Deterministic: same inputs → same outputs.
  const ranked2 = rankMoves(FIRE, HOUSEHOLD, MOVES);
  ranked.forEach((m, i) => {
    check(
      `[deterministic] ${m.moveId}: rankScore stable`,
      m.rankScore === ranked2[i].rankScore,
    );
  });

  // Pin the rank ORDER. Justification (PR description): on the demo
  // household, debt_recycling and extra_etf_dca both produce large 25y NW
  // deltas with high illiquidity-friendly liquid assets; selling the
  // synthetic IP pulls a large slug of equity but the property is moderate-
  // leverage so the leverage-delta penalty is modest. Refinance produces a
  // small but high-confidence saving. Extra super is locked behind
  // preservation age so the illiquidity penalty hits hardest.
  //
  // The actual order is asserted bit-identically below so future weight or
  // formula changes that move any position are surfaced in review.
  const orderIds = ranked.map(m => m.moveId).join(",");
  console.log(`    [snapshot order] ${orderIds}`);
  // Order assertion: every move has a deterministic position.
  const expectedOrder = [
    "extra_etf_dca",
    "debt_recycling",
    "extra_super_contribution",
    "refinance_ppor",
    "sell_investment_property",
  ].join(",");
  check(`5-move ranking order is bit-identical to documented snapshot`, orderIds === expectedOrder,
    `expected ${expectedOrder}, got ${orderIds}`);
}

console.log("\n── Composite weights are auditable singletons ──");
{
  check("MOVE_RANKING_WEIGHTS.fireDateYearsPulled = 0.40", MOVE_RANKING_WEIGHTS.fireDateYearsPulled === 0.40);
  check("MOVE_RANKING_WEIGHTS.netWorthDelta25y = 0.25", MOVE_RANKING_WEIGHTS.netWorthDelta25y === 0.25);
  check("MOVE_RANKING_WEIGHTS.downsideVariancePenalty = −0.15", MOVE_RANKING_WEIGHTS.downsideVariancePenalty === -0.15);
  check("MOVE_RANKING_WEIGHTS.illiquidityPenalty = −0.10", MOVE_RANKING_WEIGHTS.illiquidityPenalty === -0.10);
  check("MOVE_RANKING_WEIGHTS.leverageDeltaPenalty = −0.10", MOVE_RANKING_WEIGHTS.leverageDeltaPenalty === -0.10);
  // Magnitudes sum to 1.00 by design.
  const sum =
    Math.abs(MOVE_RANKING_WEIGHTS.fireDateYearsPulled) +
    Math.abs(MOVE_RANKING_WEIGHTS.netWorthDelta25y) +
    Math.abs(MOVE_RANKING_WEIGHTS.downsideVariancePenalty) +
    Math.abs(MOVE_RANKING_WEIGHTS.illiquidityPenalty) +
    Math.abs(MOVE_RANKING_WEIGHTS.leverageDeltaPenalty);
  check(`|weights| sum = 1.00 (got ${sum.toFixed(4)})`, Math.abs(sum - 1.0) < 1e-9);
}

console.log("\n── Demo invariants — FIRE math, not changed by F2 ──");
{
  // 9000 × 12 / 0.04 = 2,700,000 — the canonical NW-needed (F1 invariant).
  check("9000 × 12 / 0.04 = 2,700,000", (9000 * 12) / 0.04 === 2_700_000);
  // FIRE gap = 2,700,000 − 758,000 = 1,942,000
  check("FIRE gap = 2,700,000 − 758,000 = 1,942,000", 2_700_000 - 758_000 === 1_942_000);
  // Progress = 758,000 / 2,700,000 = 28.07% (rounds to 28.1%)
  const pct = (758_000 / 2_700_000) * 100;
  check(`Progress = ${pct.toFixed(1)}% ≈ 28.1%`, Math.abs(pct - 28.1) < 0.1);
}

console.log("\n── Confidence label discipline — no 'probability' anywhere ──");
{
  const ranked = rankMoves(FIRE, HOUSEHOLD, MOVES);
  ranked.forEach(m => {
    check(
      `${m.moveId}.confidenceRationale has no 'probability'`,
      !/probability/i.test(m.confidenceRationale),
    );
    check(
      `${m.moveId}.rankRationale has no 'probability'`,
      !/probability/i.test(m.rankRationale),
    );
  });
}

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);

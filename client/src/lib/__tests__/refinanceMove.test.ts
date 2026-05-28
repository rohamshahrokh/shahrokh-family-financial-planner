/**
 * refinanceMove.test.ts — Sprint 20 PR-F2 Section 4.5.
 *
 * Tests the refinance-PPOR rank move: interest delta produces the
 * monthly cashflow benefit, refinance costs are deducted from the 25-year
 * NW delta, and the move surfaces with high confidence on the demo.
 */

import { rankMove } from "../recommendationEngine/rankMove";
import { classifyProperty } from "../property";
import type { CanonicalFireTarget } from "../../types/canonicalFire";
import type { MoveRankingHousehold } from "../recommendationEngine/rankMove";
import { REFINANCE_DEFAULT_COSTS } from "../recommendationEngine/moves/refinancePpor";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const TODAY = new Date("2026-05-28T00:00:00Z");

// Demo PPOR fixture.
const PPOR = classifyProperty({
  id: 1,
  name: "PPOR — Brookfield Ave",
  type: "ppor",
  purchase_date: "2019-06-15",
  current_value: 1_200_000,
  loan_amount: 850_000,
  interest_rate: 5.82,
  loan_type: "Principal & Interest",
  council_rates: 2_200,
  insurance: 2_400,
  maintenance: 3_000,
}, TODAY);

const FIRE: CanonicalFireTarget = {
  targetFireYear: 2040,
  targetPassiveIncomeMonthly: 9_000,
};

const HOUSEHOLD: MoveRankingHousehold = {
  currentNetWorth: 758_000,
  totalInvestmentPropertyValue: 0,
  totalInvestmentPropertyLoans: 0,
  totalPpoRValue: 1_200_000,
  totalPpoRLoanBalance: 850_000,
  monthlyIncome: 18_000,
  monthlyExpenses: 11_200,
  liquidCash: 115_000,
  propertyLeverage: 850_000 / 1_200_000,
  debtToAssetRatio: 0.43,
  properties: [PPOR],
  marginalTaxRate: 0.37,
};

console.log("\n── Refinance PPOR from 5.82% to 5.25% ──");
{
  const ranked = rankMove(FIRE, HOUSEHOLD, {
    moveId: "refinance_ppor",
    params: {
      property: PPOR,
      newInterestRate: 0.0525,
      refinanceCosts: REFINANCE_DEFAULT_COSTS,
    },
  });
  check("moveId is refinance_ppor", ranked.moveId === "refinance_ppor");
  // Old interest: 850,000 × 5.82% = 49,470/yr
  // New interest: 850,000 × 5.25% = 44,625/yr
  // Annual delta: 4,845; monthly benefit: 4,845 / 12 = 403.75 ≈ 404
  check(
    `monthly cashflow benefit ≈ $404 (got $${ranked.cashFlowImpactMonthly})`,
    ranked.cashFlowImpactMonthly === 404,
  );
  // 25y net = 4,845 × 25 − 1,500 = 119,625
  check(
    `expectedNetWorthDelta25y ≈ $119,625 (got $${ranked.expectedNetWorthDelta25y})`,
    ranked.expectedNetWorthDelta25y === 119_625,
  );
  check("leverageDelta === 0 (refi doesn't change loans or value)", ranked.leverageDelta === 0);
  check("downsideRisk.variancePercentile5 < 0.05 (refi is low-risk)", ranked.downsideRisk.variancePercentile5 < 0.05);
  check("confidence is 'high' (stable assumptions, tiny variance)", ranked.confidence === "high");
  check(
    "rankRationale mentions the rate swing",
    /5\.82|5\.25/.test(ranked.rankRationale),
  );
}

console.log("\n── Refinance from 5.82% to 5.82% (no rate change) ──");
{
  const ranked = rankMove(FIRE, HOUSEHOLD, {
    moveId: "refinance_ppor",
    params: { property: PPOR, newInterestRate: 0.0582, refinanceCosts: REFINANCE_DEFAULT_COSTS },
  });
  check("monthly benefit = 0 when no rate change", ranked.cashFlowImpactMonthly === 0);
  // 25y NW delta = 0 − 1,500 (costs) = −1,500
  check("25y NW delta = −$1,500 (just the refi costs)", ranked.expectedNetWorthDelta25y === -1_500);
  check("rankScore ≤ 0 (no rate improvement)", ranked.rankScore <= 0);
}

console.log("\n── Non-PPOR rejection — returns zero-impact result ──");
{
  const ip = classifyProperty({
    id: 9, type: "investment", purchase_date: "2020-01-01",
    current_value: 800_000, loan_amount: 600_000, interest_rate: 6.5,
  }, TODAY);
  const ranked = rankMove(FIRE, HOUSEHOLD, {
    moveId: "refinance_ppor",
    params: { property: ip, newInterestRate: 0.055, refinanceCosts: 1500 },
  });
  check("non-PPOR move ranks to zero impact", ranked.expectedNetWorthDelta25y === 0);
  check("non-PPOR move cashflow = 0", ranked.cashFlowImpactMonthly === 0);
}

console.log("\n── Refinance — confidence label never uses 'probability' ──");
{
  const r = rankMove(FIRE, HOUSEHOLD, {
    moveId: "refinance_ppor",
    params: { property: PPOR, newInterestRate: 0.0525, refinanceCosts: REFINANCE_DEFAULT_COSTS },
  });
  check("confidenceRationale never contains 'probability'", !/probability/i.test(r.confidenceRationale));
  check("rankRationale never contains 'probability'", !/probability/i.test(r.rankRationale));
}

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);

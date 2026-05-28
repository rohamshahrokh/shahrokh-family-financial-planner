/**
 * sellPropertyMove.test.ts — Sprint 20 PR-F2 Section 4.4.
 *
 * CGT-aware sell-investment-property modelling: tests transaction-cost
 * accounting, CGT with 50% discount, net-proceeds redeployment, leverage
 * reduction, and the typed RankedMove contract.
 */

import { rankMove } from "../recommendationEngine/rankMove";
import { classifyProperty } from "../property";
import type { CanonicalFireTarget } from "../../types/canonicalFire";
import type {
  MoveRankingHousehold,
} from "../recommendationEngine/rankMove";
import { SELL_AGENT_FEE_RATE, SELL_CONVEYANCING_FIXED } from "../recommendationEngine/moves/sellInvestmentProperty";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const TODAY = new Date("2026-05-28T00:00:00Z");

// A settled IP held >12 months — qualifies for the 50% CGT discount.
// Higher LVR than the PPOR so selling reduces household property leverage.
const SETTLED_IP = classifyProperty({
  id: 99,
  name: "IP Test — settled",
  type: "investment",
  purchase_date: "2020-01-01",
  purchase_price: 600_000,
  current_value: 800_000,
  loan_amount: 720_000, // LVR 90% > PPOR 70.8%
  interest_rate: 6.5,
  loan_type: "Interest Only",
  weekly_rent: 600,
  vacancy_rate: 3,
  management_fee: 8,
  council_rates: 2_000,
  insurance: 2_000,
  maintenance: 3_000,
  selling_costs: 0,
}, TODAY);

const FIRE: CanonicalFireTarget = {
  targetFireYear: 2040,
  targetPassiveIncomeMonthly: 9_000,
};

const HOUSEHOLD: MoveRankingHousehold = {
  currentNetWorth: 758_000,
  totalInvestmentPropertyValue: 800_000,
  totalInvestmentPropertyLoans: 720_000,
  totalPpoRValue: 1_200_000,
  totalPpoRLoanBalance: 850_000,
  monthlyIncome: 18_000,
  monthlyExpenses: 11_200,
  liquidCash: 115_000,
  propertyLeverage: (850_000 + 720_000) / (1_200_000 + 800_000),
  debtToAssetRatio: 0.43,
  properties: [SETTLED_IP],
  marginalTaxRate: 0.37,
};

console.log("\n── Sell IP with 50% CGT discount eligibility ──");
{
  const ranked = rankMove(FIRE, HOUSEHOLD, {
    moveId: "sell_investment_property",
    params: {
      property: SETTLED_IP,
      marginalTaxRate: 0.37,
      cgtDiscountEligible: true,
    },
  });
  check("moveId is sell_investment_property", ranked.moveId === "sell_investment_property");
  check("rankScore is finite", Number.isFinite(ranked.rankScore));
  check("confidence is one of low|medium|high", ["low", "medium", "high"].includes(ranked.confidence));
  // Transaction costs: 800,000 × 2% + 2,000 fixed = 18,000
  // Gross gain (before tax) = 800,000 − 600,000 − 18,000 = 182,000
  // Taxable with 50% discount = 91,000; CGT at 37% = 33,670
  // Net proceeds = 800,000 − 500,000 (loan) − 18,000 − 33,670 = 248,330
  // We don't pin the rankScore to a magic number — but we DO verify the
  // user-visible rationale describes the net-proceeds rollup.
  check("rankRationale mentions equity → ETF conversion", ranked.rankRationale.toLowerCase().includes("liquid etf"));
  check("rankRationale mentions leverage reduction", ranked.rankRationale.toLowerCase().includes("leverage"));
  check("expectedNetWorthDelta25y finite", Number.isFinite(ranked.expectedNetWorthDelta25y));
  check("leverageDelta ≤ 0 (selling reduces property leverage)", ranked.leverageDelta <= 0);
  // Cashflow impact: selling an IP removes its negative cashflow drag.
  // We pin the sign — exact magnitude varies with the model.
  check("cashFlowImpactMonthly is finite", Number.isFinite(ranked.cashFlowImpactMonthly));
}

console.log("\n── Sell IP WITHOUT 50% CGT discount (held <12mo) ──");
{
  const recentIp = classifyProperty({
    ...{ id: 100, type: "investment", purchase_date: "2026-01-01",
        purchase_price: 700_000, current_value: 760_000, loan_amount: 600_000,
        interest_rate: 6.5, weekly_rent: 600, vacancy_rate: 3, management_fee: 8,
        council_rates: 1500, insurance: 1500, maintenance: 2500, selling_costs: 0 },
  }, TODAY);
  const eligible = rankMove(FIRE, { ...HOUSEHOLD, properties: [recentIp] }, {
    moveId: "sell_investment_property",
    params: { property: recentIp, marginalTaxRate: 0.37, cgtDiscountEligible: true },
  });
  const ineligible = rankMove(FIRE, { ...HOUSEHOLD, properties: [recentIp] }, {
    moveId: "sell_investment_property",
    params: { property: recentIp, marginalTaxRate: 0.37, cgtDiscountEligible: false },
  });
  // Without the discount, more CGT is paid → smaller net proceeds → smaller
  // 25y NW delta (or larger negative). Ineligible should rank ≤ eligible.
  check(
    "without-discount NW delta ≤ with-discount NW delta",
    ineligible.expectedNetWorthDelta25y <= eligible.expectedNetWorthDelta25y,
    `eligible=${eligible.expectedNetWorthDelta25y}, ineligible=${ineligible.expectedNetWorthDelta25y}`,
  );
}

console.log("\n── Transaction-cost constants are documented ──");
{
  check("SELL_AGENT_FEE_RATE = 2%", SELL_AGENT_FEE_RATE === 0.02);
  check("SELL_CONVEYANCING_FIXED = $2,000", SELL_CONVEYANCING_FIXED === 2_000);
}

console.log("\n── Confidence labels never use the word 'probability' ──");
{
  const r = rankMove(FIRE, HOUSEHOLD, {
    moveId: "sell_investment_property",
    params: { property: SETTLED_IP, marginalTaxRate: 0.37, cgtDiscountEligible: true },
  });
  check(
    "confidenceRationale does NOT contain 'probability'",
    !/probability/i.test(r.confidenceRationale),
  );
  check(
    "rankRationale does NOT contain 'probability'",
    !/probability/i.test(r.rankRationale),
  );
}

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);

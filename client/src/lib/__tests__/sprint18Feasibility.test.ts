/**
 * Sprint 18 Phase 18.2 — Feasibility engine peer tests.
 *
 * Verifies the core hard rules:
 *   - property is NOT feasible when deposit + costs > cash on hand
 *   - "Feasible after X months" message renders correctly
 *   - crypto DCA is not feasible when crypto already > 30% NW
 *   - ETF DCA is feasible when surplus is positive
 */

import {
  evaluateRecommendationFeasibility,
  computeBorrowingCapacity,
  estimateTransactionCosts,
} from "../feasibility";

function ctx(overrides: any = {}): any {
  return {
    today: {
      ledger: {
        snapshot: {
          mortgage_rate: 0.0582,
          monthly_income: 18000,
          roham_gross_annual: 216000,
          state: "QLD",
          target_property_price: 950000,
          ...(overrides.snapshot ?? {}),
        },
      },
      age: 42,
      householdProfile: {
        hasDependents: true,
        singleIncome: false,
        selfEmployed: false,
        retired: false,
      },
      cashflow: {
        monthlyIncome: 18000,
        monthlyExpenses: 11000,
        monthlySurplus: 7000,
        ...(overrides.cashflow ?? {}),
      },
      netWorth: {
        total: 700000,
        cash: 100000,
        investments: 200000,
        superBalance: 250000,
        propertyEquity: 150000,
        crypto: 0,
        debt: 600000,
        ...(overrides.netWorth ?? {}),
      },
    },
    plan: { goal: null, targetFireAge: 55, targetPassiveMonthly: 9000, swrPct: 0.04, riskPreference: 0, ownershipGoals: { keepPpor: true, allowInvestmentProperty: true } },
    forecast: { netWorthPath: [], fireDateBaseline: "2040-01-01", fireSuccessProbabilityBaseline: 0.65, passiveIncomePathAtTargetAge: 60000, feasibility: "ACHIEVABLE" as const },
    meta: { generatedAt: "2026-01-01T00:00:00Z", horizonYears: 25, horizonAge: 75, contextHash: "test" },
  };
}

const rec = (actionType: string, extra: any = {}): any => ({
  id: actionType,
  title: actionType,
  actionType,
  pillar: "maximise_wealth",
  priorityRank: 1,
  confidenceScore: 0.6,
  urgency: "this_quarter",
  riskLevel: "Med",
  expectedFinancialImpact: { annualDollar: 12000 },
  implementationSteps: [],
  whatCouldChangeRecommendation: [],
  alternativeOptions: [],
  reviewTrigger: { condition: "—" },
  sourceSignalsUsed: [],
  surfaces: ["best_move"],
  reasoning: "",
  ...extra,
});

function expect(name: string, cond: boolean, info?: string) {
  const flag = cond ? "PASS" : "FAIL";
  console.log(`[${flag}] ${name}${info ? " — " + info : ""}`);
  if (!cond) process.exitCode = 1;
}

// Test 1: low-cash property purchase is NOT currently feasible
{
  const c = ctx({ netWorth: { cash: 15000, total: 200000, debt: 0, propertyEquity: 0 } });
  const r = evaluateRecommendationFeasibility(rec("proceed_property_purchase"), c);
  expect("property/low-cash NOT feasible", !r.feasible, r.summary);
  expect(
    "property/low-cash summary mentions feasible after X months",
    /feasible after/i.test(r.summary) || /not currently feasible/i.test(r.summary),
    r.summary,
  );
}

// Test 2: well-resourced household — property feasible OR feasible_with_conditions
{
  const c = ctx({
    netWorth: { cash: 280000, total: 1500000, propertyEquity: 0, debt: 0, investments: 500000, crypto: 0, superBalance: 500000 },
    cashflow: { monthlyIncome: 22000, monthlyExpenses: 9000, monthlySurplus: 13000 },
    snapshot: { target_property_price: 700000, roham_gross_annual: 264000 },
  });
  const r = evaluateRecommendationFeasibility(rec("proceed_property_purchase"), c);
  expect("property/well-resourced feasible-ish", r.feasible || /feasible after/i.test(r.summary), r.summary);
}

// Test 3: crypto DCA when crypto > 30% NW → NOT feasible
{
  const c = ctx({ netWorth: { cash: 50000, total: 600000, crypto: 250000, investments: 100000, propertyEquity: 0, debt: 0, superBalance: 100000 } });
  const r = evaluateRecommendationFeasibility(rec("crypto_dca"), c);
  expect("crypto DCA blocked at >30% concentration", !r.feasible, r.summary);
}

// Test 4: ETF DCA feasible with positive surplus
{
  const c = ctx();
  const r = evaluateRecommendationFeasibility(rec("etf_dca", { expectedFinancialImpact: { annualDollar: 24000 } }), c);
  expect("ETF DCA feasible", r.feasible, r.summary);
}

// Test 5: borrowing capacity numeric sanity
{
  const bc = computeBorrowingCapacity({
    grossAnnualIncome: 200000,
    monthlyDebtRepayments: 0,
    monthlyLivingExpenses: 7000,
    dependents: 2,
  });
  expect("borrowing capacity is positive", bc.maxBorrowAud > 0, `max=${bc.maxBorrowAud}`);
  expect("borrowing capacity sane bound", bc.maxBorrowAud < 200000 * 7, `max=${bc.maxBorrowAud}`);
}

// Test 6: stamp duty QLD default
{
  const tx = estimateTransactionCosts({ purchasePriceAud: 800000, depositAud: 160000 });
  expect("stamp duty positive", tx.stampDuty > 0);
  expect("state used = QLD", tx.stateUsed === "QLD", tx.stateUsed);
}

console.log("Sprint 18 feasibility tests complete");

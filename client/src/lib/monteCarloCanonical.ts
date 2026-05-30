/**
 * monteCarloCanonical.ts — Canonical Source-of-Truth Mapper for Monte Carlo
 * =========================================================================
 *
 * Why this file exists
 * --------------------
 * Before this module, the Monte Carlo engine in `monteCarloEngine.ts` took a
 * hand-rolled `snapshot` shape built directly off raw `sf_snapshot` fields:
 *
 *     {
 *       ppor:             snap.ppor,
 *       cash:             snap.cash,                  // <— missed offset, savings, emergency
 *       super_balance:    snap.super_balance,         // <— missed roham + fara split
 *       stocks:           snap.stocks,                // <— missed live holdings ledger
 *       crypto:           snap.crypto,                // <— missed live holdings ledger
 *       monthly_income:   snap.monthly_income,        // <— missed ledger 6mo avg
 *       monthly_expenses: snap.monthly_expenses,      // <— missed ledger 6mo avg
 *       ...
 *     }
 *
 * That meant the MC starting net worth could silently diverge from the
 * Dashboard / Net Worth / Decision Engine numbers (which all flow through
 * `selectCanonicalNetWorth` in `dashboardDataContract.ts`).
 *
 * This module is the bridge:
 *   - it takes the same `DashboardInputs` payload the dashboard uses, plus the
 *     planned-event arrays the MC engine needs;
 *   - it routes every starting balance through the canonical selectors
 *     (`selectCanonicalNetWorth`, `selectCanonicalIncome`,
 *     `selectMonthlyExpensesLedger`, etc.);
 *   - it returns the flat MC snapshot shape the existing engine expects,
 *     PLUS a reconciliation diagnostic so the UI can prove the starting NW
 *     matches the dashboard headline figure to the dollar.
 *
 * Rule: any future caller of `runMonteCarlo` MUST build its input through
 * `buildCanonicalMonteCarloInput()`. Reading from `/api/snapshot` directly
 * inside a forecast surface is the bug class this module exists to prevent.
 */

import {
  selectCanonicalNetWorth,
  selectCanonicalIncome,
  selectMonthlyExpensesLedger,
  selectMonthlyDebtService,
  selectExpensesIncludesDebt,
  selectStocksTotal,
  selectCryptoTotal,
  type DashboardInputs,
  type CanonicalNetWorth,
} from "./dashboardDataContract";
import type { MCInput } from "./monteCarloEngine";
import type { YearAssumptions, MCVolatilityParams, ExpectedReturns } from "./forecastStore";

/**
 * Inputs that the canonical mapper needs in addition to the standard
 * `DashboardInputs` payload. Anything that influences month-by-month MC
 * cashflow (DCA, planned buys, bills) belongs here.
 */
export interface CanonicalMCExtras {
  yearlyAssumptions: YearAssumptions[];
  volatilityParams?: Partial<MCVolatilityParams>;
  /** User-controlled expected (mean) returns. When provided, the canonical mapper
   *  overrides the per-year means in `yearlyAssumptions` so the MC engine uses
   *  the chosen scenario means (Property/Stocks/Crypto/Super). Volatility comes
   *  from `volatilityParams` and is independent. */
  expectedReturns?: Partial<ExpectedReturns>;
  stockTransactions?: any[];
  cryptoTransactions?: any[];
  stockDCASchedules?: any[];
  cryptoDCASchedules?: any[];
  plannedStockOrders?: any[];
  plannedCryptoOrders?: any[];
  bills?: any[];
  ngAnnualBenefit?: number;
  ngRefundMode?: "lump-sum" | "payg";
  simulations?: number;
  /** FIRE target (annual passive income). Falls back to $120k. */
  financialFreedomThreshold?: number;
  targetNetWorthMilestones?: number[];
  startYear?: number;
  endYear?: number;
}

/**
 * Diagnostic surface: every component the MC engine starts from, plus the
 * canonical totals it must reconcile against. The Forecast Engine UI renders
 * this as the "Assumptions Used → Starting position" block so users can see
 * exactly what data the simulation is built on.
 */
export interface CanonicalMCReconciliation {
  /** Canonical NW figure from `selectCanonicalNetWorth` (what Dashboard renders). */
  dashboardNetWorth: number;
  /** Starting NW the MC engine actually uses (sum of its `snapshot` fields). */
  engineStartingNetWorth: number;
  /** `dashboardNetWorth - engineStartingNetWorth`. Should reconcile to <= $1. */
  diff: number;
  status: "PASS" | "FAIL";
  /** Components feeding the engine snapshot — for transparency UI. */
  components: {
    ppor: number;
    cash: number;
    super_balance: number;
    stocks: number;
    crypto: number;
    cars: number;
    iran_property: number;
    other_assets: number;
    mortgage: number;
    other_debts: number;
    monthly_income: number;
    monthly_expenses: number;
  };
  /** Original canonical struct, for callers that want the full breakdown. */
  canonical: CanonicalNetWorth;
  /** Source resolution for income/expenses — useful in the assumptions panel. */
  incomeSource: "ledger" | "snapshot_sub_fields" | "snapshot_master" | "empty";
  expensesIncludesDebt: boolean;
}

const safe = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Build the MC engine input from the same canonical ledger the Dashboard /
 * Net Worth surfaces use. Returns the MC input PLUS a reconciliation
 * diagnostic the UI can render to prove parity with Dashboard.
 */
export function buildCanonicalMonteCarloInput(
  ledger: DashboardInputs,
  extras: CanonicalMCExtras,
): { input: MCInput; reconciliation: CanonicalMCReconciliation } {
  const canonical = selectCanonicalNetWorth(ledger);
  const income = selectCanonicalIncome(ledger);
  const monthlyExpenses = selectMonthlyExpensesLedger(ledger);
  const debtService = selectMonthlyDebtService(ledger);
  const expensesIncludeDebt = selectExpensesIncludesDebt(ledger);

  // The engine treats `monthly_expenses` as the household's TOTAL outflow ex
  // mortgage/IP repayments (those are computed separately from `mortgage` and
  // per-property loan_amount). So if the ledger already includes debt rows we
  // must SUBTRACT them out for the engine's expenses input — otherwise the
  // engine would double-count debt (its own amortisation + ledger debt rows).
  const monthlyExpensesForEngine = expensesIncludeDebt
    ? Math.max(0, Math.round(monthlyExpenses - debtService))
    : Math.round(monthlyExpenses);

  const stocks = selectStocksTotal(ledger);
  const crypto = selectCryptoTotal(ledger);
  const snap: any = ledger.snapshot ?? {};

  // Engine's flat snapshot — every number routed through canonical selectors.
  // The engine (see scenarioV2/basePlan.ts:202-220 + scenarioV2/tick.ts:842-855)
  // sums (ppor + cash + super + stocks + crypto + cars + iran + other_assets)
  // and subtracts (mortgage + other_debts) PLUS each settled IP value/loan
  // (passed via the `properties` array). Sprint 30A.3: cars are now held at
  // 100% by the engine (the historical 0.8 haircut was removed in audit fix
  // P1.1) and `other_assets` is seeded from snapshot. The reconciliation below
  // therefore matches canonical.netWorth to the dollar.
  const engineSnapshot = {
    ppor:             canonical.assets.ppor,
    cash:             canonical.assets.cashOffset, // includes offset + all cash buckets
    super_balance:    canonical.assets.super,
    stocks,
    crypto,
    cars:             canonical.assets.cars,
    iran_property:    canonical.assets.iranProperty,
    other_assets:     canonical.assets.otherAssets,
    mortgage:         canonical.liabilities.ppoMortgage,
    other_debts:      canonical.liabilities.otherDebts,
    monthly_income:   income.monthlyGross,
    monthly_expenses: monthlyExpensesForEngine,
  };

  // The MC engine starts each sim with the canonical net worth, component by
  // component (cars at 100%, other_assets included). Settled IP values/loans
  // flow through canonical.settledIpValue / canonical.settledIpLoans and the
  // engine's `properties` array contributes the same numbers, so the sum here
  // equals canonical.netWorth to the dollar.
  const settledIpValue = canonical.assets.settledIpValue;
  const settledIpLoans = canonical.liabilities.settledIpLoans;

  const engineStartingNetWorth =
    engineSnapshot.ppor +
    engineSnapshot.cash +
    engineSnapshot.super_balance +
    engineSnapshot.stocks +
    engineSnapshot.crypto +
    engineSnapshot.cars +
    engineSnapshot.iran_property +
    engineSnapshot.other_assets +
    settledIpValue -
    engineSnapshot.mortgage -
    engineSnapshot.other_debts -
    settledIpLoans;

  // Sprint 30A.3 reconciliation contract: engineStartingNetWorth should equal
  // canonical.netWorth to within $1 (rounding). No haircut allowance — the
  // engine no longer applies one. The previous diagnostic falsely reported a
  // $11k cars haircut + $12k other_assets gap; both have been corrected here.
  const expectedDiff = 0;
  const actualDiff = canonical.netWorth - engineStartingNetWorth;
  const reconcileOk = Math.abs(actualDiff - expectedDiff) <= 1;

  const reconciliation: CanonicalMCReconciliation = {
    dashboardNetWorth: Math.round(canonical.netWorth),
    engineStartingNetWorth: Math.round(engineStartingNetWorth),
    diff: Math.round(actualDiff),
    status: reconcileOk ? "PASS" : "FAIL",
    components: engineSnapshot,
    canonical,
    incomeSource: income.source,
    expensesIncludesDebt: expensesIncludeDebt,
  };

  // Properties — feed every property row through to MC. The engine itself
  // now applies the Sprint 4B canonical lifecycle filter (isInvestmentProperty
  // && !isPropertyHistorical), so we just need to PRESERVE the lifecycle and
  // disposal fields on the row. Previously these were dropped during the
  // map() and the MC engine saw every sold IP as a still-active asset.
  const properties = (ledger.properties ?? []).map((p: any) => ({
    id: safe(p.id),
    type: String(p.type ?? "investment"),
    // Lifecycle / disposal fields preserved verbatim so downstream predicates
    // (isPropertyOwnedAt / wasPropertySoldBy / isPropertyHistorical) can see
    // the canonical values.
    lifecycle_status: p.lifecycle_status,
    sale_date: p.sale_date,
    sold_date: p.sold_date,
    disposal_date: p.disposal_date,
    purchase_date: p.purchase_date,
    settlement_date: p.settlement_date,
    rental_start_date: p.rental_start_date,
    loan_amount: safe(p.loan_amount),
    interest_rate: safe(p.interest_rate) || safe((ledger.snapshot ?? {}).mortgage_rate) || 6.5,
    loan_term: safe(p.loan_term) || 30,
    weekly_rent: safe(p.weekly_rent),
    rental_growth: safe(p.rental_growth) || 3,
    vacancy_rate: safe(p.vacancy_rate) || 3,
    management_fee: safe(p.management_fee) || 0,
    capital_growth: safe(p.capital_growth) || 6,
    deposit: safe(p.deposit),
    stamp_duty: safe(p.stamp_duty),
    legal_fees: safe(p.legal_fees),
    renovation_costs: safe(p.renovation_costs),
    current_value: safe(p.current_value ?? p.purchase_price),
    purchase_price: safe(p.purchase_price),
  }));

  // Apply user-controlled expected (mean) returns over the per-year assumptions.
  // Volatility is left untouched — Mean and Std-Dev are independent parameters.
  // Only fields the user explicitly set are overridden; missing keys fall back
  // to the existing per-year means in `yearlyAssumptions`.
  const er = extras.expectedReturns;
  const yearlyWithExpectedReturns: YearAssumptions[] = er
    ? extras.yearlyAssumptions.map((row) => ({
        ...row,
        property_growth: er.property ?? row.property_growth,
        stocks_return:   er.stocks   ?? row.stocks_return,
        crypto_return:   er.crypto   ?? row.crypto_return,
        super_return:    er.super    ?? row.super_return,
      }))
    : extras.yearlyAssumptions;

  const input: MCInput = {
    snapshot: engineSnapshot,
    properties,
    stocks: (ledger.stocks ?? []).map((s: any) => ({
      current_holding: safe(s.current_holding),
      current_price:   safe(s.current_price),
      expected_return: safe(s.expected_return),
    })),
    cryptos: (ledger.cryptos ?? []).map((c: any) => ({
      current_holding: safe(c.current_holding),
      current_price:   safe(c.current_price),
      expected_return: safe(c.expected_return),
    })),
    stockTransactions:    extras.stockTransactions  ?? [],
    cryptoTransactions:   extras.cryptoTransactions ?? [],
    stockDCASchedules:    extras.stockDCASchedules  ?? [],
    cryptoDCASchedules:   extras.cryptoDCASchedules ?? [],
    plannedStockOrders:   extras.plannedStockOrders  ?? [],
    plannedCryptoOrders:  extras.plannedCryptoOrders ?? [],
    bills:                extras.bills ?? [],
    yearlyAssumptions:    yearlyWithExpectedReturns,
    volatilityParams:     extras.volatilityParams,
    ngAnnualBenefit:      extras.ngAnnualBenefit,
    ngRefundMode:         extras.ngRefundMode,
    simulations:          extras.simulations,
    financialFreedomThreshold: extras.financialFreedomThreshold,
    targetNetWorthMilestones:  extras.targetNetWorthMilestones,
    startYear:            extras.startYear,
    endYear:              extras.endYear,
  };

  return { input, reconciliation };
}

/**
 * Convenience helper for inline UI cards: returns just the headline
 * reconciliation row.
 */
export function summariseMCReconciliation(r: CanonicalMCReconciliation): string {
  if (r.status === "PASS") {
    return `Monte Carlo starting Net Worth matches Dashboard to the dollar (${r.dashboardNetWorth.toLocaleString("en-AU")}).`;
  }
  return `Monte Carlo starting Net Worth diverges from Dashboard by $${Math.abs(r.diff).toLocaleString("en-AU")} — investigate before relying on the simulation.`;
}

/**
 * canonicalHeadlineMetrics.ts — Sprint 4D visible-UI single source of truth.
 *
 * Why this file exists
 * --------------------
 * Sprint 4C closed the canonical math (ledger / FIRE / debt service / tax) but
 * Dashboard / Reports / Financial Plan / Wealth Strategy / Timeline / Risk
 * still rendered subtly different headline numbers because each page wired
 * `computeCanonicalHeadlineFigures` with a different `DashboardInputs` shape
 * (some pages passed live `stocks/cryptos/holdingsRaw`, others passed `[]`;
 * Financial Plan rendered a `draftCanonical` instead of the canonical figures
 * altogether). Result: production showed ~$758k on Dashboard/Reports and
 * ~$746k on Financial Plan / Wealth Strategy for the same household.
 *
 * This module is the ONE entry point every visible surface MUST call for the
 * nine canonical headline metrics. Internally it delegates to the existing
 * Sprint 4C primitives — `selectCanonicalNetWorth`, `computeCanonicalFire`,
 * `computeCanonicalDebtService`, `selectPassiveIncome`, etc. — so there is no
 * competing math. The contribution is to (a) normalise the input wiring so
 * every page hands the same payload to the canonical layer, and (b) expose a
 * tightly-shaped contract that cannot drift on accident (a void'd
 * `canonicalHead` cannot replace a rendered headline by mistake — every page
 * pulls the same nine keys).
 */

import {
  type DashboardInputs,
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectMonthlySurplus,
  selectMonthlyDebtService,
  selectPassiveIncome,
  selectCanonicalNetWorth,
} from "./dashboardDataContract";
import {
  computeCanonicalFire,
  resolveFireTargetFromSnapshot,
  type CanonicalFireInputs,
} from "./canonicalFire";

/**
 * The nine visible headline metrics every consuming surface MUST render
 * consistently. If a page wants a different definition (e.g. "Accessible Net
 * Worth excluding super") it must label the figure explicitly — this contract
 * is reserved for the canonical visible totals.
 */
export interface CanonicalHeadlineMetrics {
  /** Total Net Worth (assets − liabilities, includes super). */
  netWorth: number;
  /** Total Assets (PPOR + cash/offset + super + IPs + stocks + crypto + cars + other). */
  assets: number;
  /** Total Liabilities (PPOR mortgage + settled-IP loans + other debts). */
  liabilities: number;
  /** Annual passive income (settled IP rent + manual passive + dividend heuristic). */
  passiveIncome: number;
  /** Recurring monthly household income from the ledger. */
  monthlyIncome: number;
  /** Monthly household expenses from the ledger. */
  monthlyExpenses: number;
  /** Monthly surplus (income − expenses), identity-checked by canonicalCashflow. */
  monthlySurplus: number;
  /** Aggregate monthly debt service (PPOR + IP + other-debt minimums). */
  debtService: number;
  /** FIRE number at canonical SWR (default 4%) and target monthly income. */
  fireNumber: number;
}

/**
 * Sanitise a DashboardInputs payload so two callers that pass slightly
 * different shapes (undefined vs [] vs missing keys) produce the same
 * canonical figures. The selectors below already coerce these defensively,
 * but normalising once at the boundary lets us reason about parity in tests
 * and audit traces.
 */
function normaliseInputs(inputs: DashboardInputs): DashboardInputs {
  return {
    snapshot:       inputs.snapshot ?? null,
    properties:     inputs.properties     ?? [],
    stocks:         inputs.stocks         ?? [],
    cryptos:        inputs.cryptos        ?? [],
    holdingsRaw:    inputs.holdingsRaw    ?? [],
    incomeRecords:  inputs.incomeRecords  ?? [],
    expenses:       inputs.expenses       ?? [],
    todayIso:       inputs.todayIso,
  };
}

/**
 * Compute the canonical headline metrics for a single household ledger.
 *
 * Every visible surface (Dashboard / Reports / Financial Plan / Wealth
 * Strategy / Timeline / Risk) MUST call this for its headline KPI strip and
 * MUST NOT compute net worth, assets, liabilities, surplus, debt service,
 * passive income, or FIRE number locally for those headline cards.
 *
 * Optional `fireInputs` lets a caller override SWR / target monthly income;
 * when omitted the canonical defaults (4% SWR, snapshot-resolved target) are
 * used so the same household yields the same FIRE number on every page.
 */
export function computeCanonicalHeadlineMetrics(
  inputs: DashboardInputs,
  fireInputs?: CanonicalFireInputs,
): CanonicalHeadlineMetrics {
  const i = normaliseInputs(inputs);
  const nw = selectCanonicalNetWorth(i);
  const monthlyIncome   = selectMonthlyIncome(i);
  const monthlyExpenses = selectMonthlyExpensesLedger(i);
  const monthlySurplus  = selectMonthlySurplus(i);
  const debtService     = selectMonthlyDebtService(i);
  const passiveIncome   = selectPassiveIncome(i);
  const fire = computeCanonicalFire(i, {
    targetMonthlyIncome:
      fireInputs?.targetMonthlyIncome ?? resolveFireTargetFromSnapshot(i),
    swrPct: fireInputs?.swrPct,
  });
  return {
    netWorth:        nw.netWorth,
    assets:          nw.totalAssets,
    liabilities:     nw.totalLiabilities,
    passiveIncome,
    monthlyIncome,
    monthlyExpenses,
    monthlySurplus,
    debtService,
    fireNumber:      fire.fireNumber,
  };
}

/**
 * Reconciliation helper for the Sprint 4D regression suite. Given an array of
 * per-page metric snapshots, compares each against the canonical figure and
 * fails when any drift exceeds `tolerance` (default $1).
 */
export interface HeadlinePageSnapshot {
  page: string;
  metrics: CanonicalHeadlineMetrics;
}

export interface HeadlineDrift {
  page: string;
  metric: keyof CanonicalHeadlineMetrics;
  pageValue: number;
  canonicalValue: number;
  diff: number;
}

export function reconcileHeadlineSnapshots(
  canonical: CanonicalHeadlineMetrics,
  snapshots: HeadlinePageSnapshot[],
  tolerance = 1,
): { status: "PASS" | "FAIL"; drifts: HeadlineDrift[] } {
  const keys = Object.keys(canonical) as (keyof CanonicalHeadlineMetrics)[];
  const drifts: HeadlineDrift[] = [];
  for (const snap of snapshots) {
    for (const key of keys) {
      const pageValue = snap.metrics[key];
      const canonicalValue = canonical[key];
      const diff = pageValue - canonicalValue;
      if (Math.abs(diff) > tolerance) {
        drifts.push({
          page: snap.page,
          metric: key,
          pageValue,
          canonicalValue,
          diff,
        });
      }
    }
  }
  return { status: drifts.length === 0 ? "PASS" : "FAIL", drifts };
}

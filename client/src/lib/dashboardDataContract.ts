/**
 * Dashboard Data Contract
 * =======================
 * Authoritative source-of-truth bindings for every numeric value rendered
 * on the live dashboard. Paired with `docs/DASHBOARD_DATA_CONTRACT.md`.
 *
 * Why this file exists
 * --------------------
 * In May 2026 the dashboard rendered "intact" but every KPI card was bound
 * to the wrong column on `sf_snapshot` or summed a non-existent field on
 * `sf_stocks`. Cards showed numbers that did not reflect the user's real
 * data. This module locks down the bindings so a future refactor cannot
 * silently break the same way.
 *
 * Two responsibilities:
 *   1. Declarative `KPI_DATA_CONTRACT` — read by the regression check
 *      (`script/test-dashboard-contract.ts`).
 *   2. Pure selector functions used directly by `dashboard.tsx` so the
 *      logic lives next to its documentation, not buried inline.
 *
 * Rules
 * -----
 *  • ACTUAL values flow into card headline figures.
 *  • PLANNED / FORECAST values appear ONLY in card sub-text.
 *  • A selector that returns 0 is legitimate when the source is genuinely
 *    empty — call sites are responsible for surfacing helper text in that
 *    case (see `evaluateDataAvailability` below).
 */

export type ContractTier = "actual" | "planned" | "forecast";

export interface BindingSource {
  /** Supabase table name (or "(derived)" / "(api)") */
  table: string;
  /** Column or expression read from that table */
  column: string;
  /** Plain-English description of what this contributes */
  note?: string;
}

export interface CardContract {
  /** Human-readable card label as rendered on the dashboard. */
  label: string;
  /** Whether the headline figure represents an ACTUAL or projected value. */
  tier: ContractTier;
  /** Plain-English calculation formula. */
  formula: string;
  /** Ordered list of data sources, primary first. */
  sources: BindingSource[];
  /** Behavior when every source is empty. */
  fallback: string;
  /** Tables explicitly NOT used by this card. */
  forbidden?: string[];
}

/**
 * Authoritative binding for each dashboard card.
 *
 * Keys are stable identifiers used by the regression check; do NOT rename
 * without updating `script/test-dashboard-contract.ts` and the markdown.
 */
export const KPI_DATA_CONTRACT: Record<string, CardContract> = {
  monthly_surplus: {
    label: "MONTHLY SURPLUS",
    tier: "actual",
    formula: "monthly_income - monthly_expenses",
    sources: [
      { table: "sf_snapshot", column: "monthly_income",          note: "primary master" },
      { table: "sf_snapshot", column: "roham_monthly_income",    note: "fallback sub-field" },
      { table: "sf_snapshot", column: "fara_monthly_income",     note: "fallback sub-field" },
      { table: "sf_snapshot", column: "rental_income_total",     note: "fallback sub-field" },
      { table: "sf_snapshot", column: "other_income",            note: "fallback sub-field" },
      { table: "sf_income",   column: "amount",                  note: "trailing 6mo avg fallback" },
      { table: "sf_snapshot", column: "monthly_expenses",        note: "expenses primary" },
      { table: "sf_expenses", column: "amount",                  note: "trailing 6mo avg fallback" },
    ],
    fallback: "Returns 0 if every income and expense source is empty.",
  },

  total_investments: {
    label: "TOTAL INVESTMENTS",
    tier: "actual",
    formula: "stocksTotal + cryptoTotal + ipCurrentValueSettled",
    sources: [
      { table: "(api)",         column: "/api/holdings.current_value",       note: "unified holdings (primary)" },
      { table: "sf_stocks",     column: "current_price * current_holding",   note: "per-ticker market value" },
      { table: "sf_crypto",     column: "current_price * current_holding",   note: "per-coin market value" },
      { table: "sf_snapshot",   column: "stocks",                            note: "manual aggregate" },
      { table: "sf_snapshot",   column: "crypto",                            note: "manual aggregate" },
      { table: "sf_properties", column: "current_value",                     note: "settled IPs only" },
    ],
    fallback: "0 with sub-text showing planned IP / DCA values.",
    forbidden: ["sf_planned_investments", "sf_stock_dca", "sf_crypto_dca", "sf_scenario_stock_plans", "sf_scenario_crypto_plans"],
  },

  property_equity: {
    label: "PROPERTY EQUITY",
    tier: "actual",
    formula: "(ppor - mortgage) + (ipCurrentValueSettled - ipLoanBalanceSettled)",
    sources: [
      { table: "sf_snapshot",   column: "ppor",            note: "PPOR market value" },
      { table: "sf_snapshot",   column: "mortgage",        note: "PPOR loan balance" },
      { table: "sf_properties", column: "current_value",   note: "settled IPs" },
      { table: "sf_properties", column: "loan_amount",     note: "settled IPs" },
      { table: "sf_properties", column: "settlement_date", note: "settled vs planned filter" },
    ],
    fallback: "0 with sub-text showing planned IP value.",
    forbidden: ["sf_scenario_properties"],
  },

  debt_balance: {
    label: "DEBT BALANCE",
    tier: "actual",
    formula: "mortgage + other_debts + ipLoanBalanceSettled",
    sources: [
      { table: "sf_snapshot",   column: "mortgage",    note: "PPOR loan balance" },
      { table: "sf_snapshot",   column: "other_debts", note: "all non-property debt" },
      { table: "sf_properties", column: "loan_amount", note: "settled IP loans" },
    ],
    fallback: "0 with sub-text showing planned IP loan total.",
    forbidden: ["sf_scenario_properties", "financial_snapshots"],
  },

  passive_income: {
    label: "PASSIVE INCOME",
    tier: "actual",
    formula: "MAX(rentalFromIPs, rentalManual) + otherPassive + dividends",
    sources: [
      { table: "sf_properties", column: "weekly_rent",         note: "settled IPs" },
      { table: "sf_properties", column: "vacancy_rate",        note: "settled IPs" },
      { table: "sf_properties", column: "management_fee",      note: "settled IPs" },
      { table: "sf_snapshot",   column: "rental_income_total", note: "manual rental override (monthly)" },
      { table: "sf_snapshot",   column: "other_income",        note: "manual passive override (monthly)" },
      { table: "(derived)",     column: "stocksTotal*0.02",    note: "dividend heuristic" },
      { table: "(derived)",     column: "cryptoTotal*0.01",    note: "yield heuristic" },
    ],
    fallback: "0 with sub-text projecting post-settlement annual rental.",
  },

  super_combined: {
    label: "SUPER (COMBINED)",
    tier: "actual",
    formula: "roham_super_balance + fara_super_balance",
    sources: [
      { table: "sf_snapshot", column: "roham_super_balance", note: "primary" },
      { table: "sf_snapshot", column: "fara_super_balance",  note: "primary" },
      { table: "sf_snapshot", column: "super_balance",       note: "aggregate fallback" },
    ],
    fallback: "0 if all three columns are 0.",
  },

  cash_today: {
    label: "CASH TODAY",
    tier: "actual",
    formula: "cash + savings_cash + emergency_cash + safeOtherCash + offset_balance",
    sources: [
      { table: "sf_snapshot", column: "cash" },
      { table: "sf_snapshot", column: "savings_cash" },
      { table: "sf_snapshot", column: "emergency_cash" },
      { table: "sf_snapshot", column: "other_cash" },
      { table: "sf_snapshot", column: "offset_balance" },
    ],
    fallback: "0 if every cash bucket is empty.",
  },

  net_worth: {
    label: "TOTAL NET WORTH",
    tier: "actual",
    formula: "totalAssets - totalLiab",
    sources: [
      { table: "(derived)",     column: "totalAssets",  note: "ppor + cash + super + stocks + crypto + cars + iran_property + other_assets + ipValueSettled" },
      { table: "(derived)",     column: "totalLiab",    note: "mortgage + other_debts + ipLoanSettled" },
      { table: "sf_snapshot",   column: "other_assets", note: "must flow through totalAssets" },
    ],
    fallback: "Falls through to subtotals; cannot be silently zeroed.",
  },
} as const;

/**
 * Inputs every selector accepts. Keep this minimal; selectors must be
 * pure and deterministic so the regression check can replay them.
 */
export interface DashboardInputs {
  snapshot: any | null | undefined;
  /** sf_properties rows */
  properties: any[] | undefined;
  /** sf_stocks catalog rows */
  stocks: any[] | undefined;
  /** sf_crypto catalog rows */
  cryptos: any[] | undefined;
  /** Unified /api/holdings rows (asset_type + current_value) */
  holdingsRaw: any[] | undefined;
  /** sf_income rows */
  incomeRecords: any[] | undefined;
  /** sf_expenses rows */
  expenses: any[] | undefined;
  /** ISO date string YYYY-MM-DD; defaults to today */
  todayIso?: string;
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

const todayIsoFor = (i: DashboardInputs) =>
  i.todayIso ?? new Date().toISOString().split("T")[0];

const isInvestmentProp = (p: any) =>
  p && p.type !== "ppor" && p.type !== "owner_occupied";

const isSettled = (p: any, today: string) =>
  !p?.settlement_date || (p.settlement_date as string) <= today;

// ────────────────────────────────────────────────────────────────────────────
// Selectors
// Every public selector below maps 1:1 to a key in `KPI_DATA_CONTRACT` and
// MUST only read fields that appear in that card's `sources` list. The
// regression test enforces this.
// ────────────────────────────────────────────────────────────────────────────

export function selectSettledIPs(i: DashboardInputs) {
  const today = todayIsoFor(i);
  return (i.properties ?? []).filter(p => isInvestmentProp(p) && isSettled(p, today));
}

export function selectPlannedIPs(i: DashboardInputs) {
  const today = todayIsoFor(i);
  return (i.properties ?? []).filter(p => isInvestmentProp(p) && !isSettled(p, today));
}

export function selectIpCurrentValueSettled(i: DashboardInputs): number {
  return selectSettledIPs(i).reduce(
    (s, p) => s + num(p.current_value ?? p.purchase_price), 0
  );
}

export function selectIpLoanBalanceSettled(i: DashboardInputs): number {
  return selectSettledIPs(i).reduce((s, p) => s + num(p.loan_amount), 0);
}

export function selectIpCurrentValuePlanned(i: DashboardInputs): number {
  return selectPlannedIPs(i).reduce(
    (s, p) => s + num(p.current_value ?? p.purchase_price), 0
  );
}

export function selectIpLoanBalancePlanned(i: DashboardInputs): number {
  return selectPlannedIPs(i).reduce((s, p) => s + num(p.loan_amount), 0);
}

export function selectStocksTotal(i: DashboardInputs): number {
  // SOURCE-OF-TRUTH: see KPI_DATA_CONTRACT.total_investments.
  // Three sources, take the highest available so manual entries never get
  // silently overridden by an empty live feed.
  const liveStocks = (i.holdingsRaw ?? [])
    .filter((h: any) => h.asset_type === "stock")
    .reduce((s: number, h: any) => s + num(h.current_value), 0);
  // sf_stocks has NO current_value column — compute current_price * current_holding.
  const tickerValue = (i.stocks ?? []).reduce(
    (s: number, x: any) => s + num(x.current_value ?? num(x.current_price) * num(x.current_holding)),
    0
  );
  const manual = num(i.snapshot?.stocks);
  return Math.max(liveStocks, tickerValue, manual);
}

export function selectCryptoTotal(i: DashboardInputs): number {
  // SOURCE-OF-TRUTH: see KPI_DATA_CONTRACT.total_investments.
  const liveCrypto = (i.holdingsRaw ?? [])
    .filter((h: any) => h.asset_type === "crypto")
    .reduce((s: number, h: any) => s + num(h.current_value), 0);
  const tickerValue = (i.cryptos ?? []).reduce(
    (s: number, x: any) => s + num(x.current_value ?? num(x.current_price) * num(x.current_holding)),
    0
  );
  const manual = num(i.snapshot?.crypto);
  return Math.max(liveCrypto, tickerValue, manual);
}

export function selectTotalInvestments(i: DashboardInputs): number {
  return selectStocksTotal(i) + selectCryptoTotal(i) + selectIpCurrentValueSettled(i);
}

export function selectPropertyEquity(i: DashboardInputs): number {
  // SOURCE-OF-TRUTH: see KPI_DATA_CONTRACT.property_equity.
  const ppor = num(i.snapshot?.ppor);
  const mortgage = num(i.snapshot?.mortgage);
  return (ppor - mortgage) + (selectIpCurrentValueSettled(i) - selectIpLoanBalanceSettled(i));
}

export function selectDebtBalance(i: DashboardInputs): number {
  // SOURCE-OF-TRUTH: see KPI_DATA_CONTRACT.debt_balance.
  return num(i.snapshot?.mortgage) + num(i.snapshot?.other_debts) + selectIpLoanBalanceSettled(i);
}

export function selectPassiveIncome(i: DashboardInputs): number {
  // SOURCE-OF-TRUTH: see KPI_DATA_CONTRACT.passive_income.
  const settledIPs = selectSettledIPs(i);
  const annualRentalFromIPs = settledIPs.reduce((sum: number, p: any) => {
    const w = num(p.weekly_rent);
    const v = num(p.vacancy_rate);
    const m = num(p.management_fee);
    return sum + w * 52 * (1 - v / 100) * (1 - m / 100);
  }, 0);
  const annualRentalManual = num(i.snapshot?.rental_income_total) * 12;
  const annualRental = Math.max(annualRentalFromIPs, annualRentalManual);
  const annualOtherPassive = num(i.snapshot?.other_income) * 12;
  const annualDividends = selectStocksTotal(i) * 0.02 + selectCryptoTotal(i) * 0.01;
  return Math.round(annualRental + annualOtherPassive + annualDividends);
}

export function selectSuperCombined(i: DashboardInputs): number {
  // SOURCE-OF-TRUTH: see KPI_DATA_CONTRACT.super_combined.
  const roham = num(i.snapshot?.roham_super_balance ?? i.snapshot?.super_roham);
  const fara  = num(i.snapshot?.fara_super_balance  ?? i.snapshot?.super_fara);
  const master = num(i.snapshot?.super_balance);
  return roham + fara > 0 ? roham + fara : master;
}

export function selectCashToday(i: DashboardInputs): number {
  // SOURCE-OF-TRUTH: see KPI_DATA_CONTRACT.cash_today.
  const s = i.snapshot ?? {};
  const cash = num(s.cash);
  const savings = num(s.savings_cash);
  const emergency = num(s.emergency_cash);
  const offset = num(s.offset_balance);
  // Dedup guard for legacy data where other_cash duplicated offset_balance.
  const otherRaw = num(s.other_cash);
  const other = otherRaw > 0 && otherRaw === offset ? 0 : otherRaw;
  return cash + savings + emergency + other + offset;
}

// ────────────────────────────────────────────────────────────────────────────
// Data-availability heuristic — drives the "actual balances missing" banner.
// ────────────────────────────────────────────────────────────────────────────

export interface DataAvailability {
  /** True when none of the actual-balance sources hold any value. */
  allActualEmpty: boolean;
  /** Per-section flags for fine-grained UX messaging. */
  hasStocks: boolean;
  hasCrypto: boolean;
  hasPpor: boolean;
  hasMortgage: boolean;
  hasOtherDebts: boolean;
  hasSettledIPs: boolean;
  hasManualSnapshot: boolean;
  /** Plain-English list of empty sections suitable for a banner. */
  emptySections: string[];
}

export function evaluateDataAvailability(i: DashboardInputs): DataAvailability {
  const s = i.snapshot ?? {};
  const hasStocks   = selectStocksTotal(i) > 0;
  const hasCrypto   = selectCryptoTotal(i) > 0;
  const hasPpor     = num(s.ppor) > 0;
  const hasMortgage = num(s.mortgage) > 0;
  const hasOtherDebts = num(s.other_debts) > 0;
  const hasSettledIPs = selectSettledIPs(i).length > 0;
  // "Manual snapshot" = at least one user-entered actual figure beyond cash/super.
  const hasManualSnapshot =
    hasStocks || hasCrypto || hasPpor || hasMortgage || hasOtherDebts ||
    num(s.cars) > 0 || num(s.iran_property) > 0 || num(s.other_assets) > 0;

  const emptySections: string[] = [];
  if (!hasStocks)     emptySections.push("Stocks");
  if (!hasCrypto)     emptySections.push("Crypto");
  if (!hasPpor)       emptySections.push("PPOR (family home)");
  if (!hasMortgage && !hasOtherDebts) emptySections.push("Debts");
  if (!hasSettledIPs) emptySections.push("Settled investment properties");

  const allActualEmpty = !hasStocks && !hasCrypto && !hasPpor &&
    !hasMortgage && !hasOtherDebts && !hasSettledIPs;

  return {
    allActualEmpty, hasStocks, hasCrypto, hasPpor, hasMortgage,
    hasOtherDebts, hasSettledIPs, hasManualSnapshot, emptySections,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Convenience: enumerate every column referenced by the contract. Used by
// the regression check to verify that selectors don't introduce columns
// that aren't documented.
// ────────────────────────────────────────────────────────────────────────────

export const ALL_CONTRACT_KEYS = Object.keys(KPI_DATA_CONTRACT) as (keyof typeof KPI_DATA_CONTRACT)[];

export function bindingsFor(card: keyof typeof KPI_DATA_CONTRACT): BindingSource[] {
  return KPI_DATA_CONTRACT[card].sources;
}

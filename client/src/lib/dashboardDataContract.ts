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
    formula:
      "income - expenses [- debt if NOT already in expenses] (selectExpensesIncludesDebt gates the debt subtraction; default true)",
    sources: [
      // Income (SoT: sf_income ledger → sub-fields → master)
      { table: "sf_income",   column: "amount",                  note: "trailing 6mo average — PRIMARY when populated" },
      { table: "sf_snapshot", column: "roham_monthly_income",    note: "sub-field fallback" },
      { table: "sf_snapshot", column: "fara_monthly_income",     note: "sub-field fallback" },
      { table: "sf_snapshot", column: "rental_income_total",     note: "sub-field fallback" },
      { table: "sf_snapshot", column: "other_income",            note: "sub-field fallback" },
      { table: "sf_snapshot", column: "monthly_income",          note: "manual master override (last)" },
      // Expenses (SoT: sf_expenses ledger)
      { table: "sf_expenses", column: "amount",                  note: "trailing 6mo average — PRIMARY" },
      { table: "sf_snapshot", column: "monthly_expenses",        note: "manual override only when ledger empty" },
      // Debt service (SoT: debt module amortisation)
      { table: "sf_snapshot", column: "mortgage",                note: "PPOR principal — drives PMT" },
      { table: "sf_snapshot", column: "mortgage_rate",           note: "annual % for PMT" },
      { table: "sf_snapshot", column: "mortgage_term_years",     note: "remaining term for PMT" },
      { table: "sf_snapshot", column: "other_debts",             note: "non-property debt balance — 0.15/12 minimum payment heuristic" },
      { table: "sf_properties", column: "loan_amount",           note: "settled IPs amortised separately" },
    ],
    fallback: "Returns 0 if every income/expense/debt source is empty.",
    forbidden: [
      "sf_planned_investments",  // planning data, not actuals
      "sf_scenario_*",           // scenarios are forecasts only
      "financial_snapshots",     // legacy/unused
    ],
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
 * Source-of-Truth map for every value that can be edited from more than one
 * surface (Settings, Financial Plan, Dashboard summary, Budget page).
 *
 * RULE: a value is OWNED by exactly one source. Other surfaces may DISPLAY it
 * read-only, with the "editIn" label shown next to the field. The Financial
 * Plan page MUST gate manual edits behind an explicit `override = true` flag
 * on the snapshot row.
 *
 * Adding a new shared field? Add it here AND update the regression script.
 */
export const SOURCE_OF_TRUTH: Record<string, {
  ownedBy: "settings" | "budget" | "debt_module" | "ledger" | "derived";
  editIn: string;          // UI label, e.g. "Edit in Settings"
  storedAs: string;        // dot-path on snapshot row OR formula
  duplicates?: string[];   // fields that USED to be edited elsewhere
}> = {
  monthly_income:     { ownedBy: "ledger",      editIn: "Edit in Income (ledger)",   storedAs: "derived: 6mo avg of sf_income.amount, then sf_snapshot.{roham|fara}_monthly_income" },
  monthly_expenses:   { ownedBy: "budget",      editIn: "Edit in Monthly Budget",     storedAs: "derived: 6mo avg of sf_expenses.amount", duplicates: ["sf_snapshot.monthly_expenses (now override-only)"] },
  mortgage_balance:   { ownedBy: "debt_module", editIn: "Edit in Debt Module",        storedAs: "sf_snapshot.mortgage" },
  mortgage_repayment: { ownedBy: "derived",     editIn: "Auto from Debt Module",      storedAs: "calcMonthlyRepayment(mortgage, mortgage_rate, mortgage_term_years)" },
  other_debts:        { ownedBy: "debt_module", editIn: "Edit in Debt Module",        storedAs: "sf_snapshot.other_debts" },
  cash_transaction:   { ownedBy: "settings",    editIn: "Edit in Settings → Cash",     storedAs: "sf_snapshot.cash" },
  cash_savings:       { ownedBy: "settings",    editIn: "Edit in Settings → Cash",     storedAs: "sf_snapshot.savings_cash" },
  cash_emergency:     { ownedBy: "settings",    editIn: "Edit in Settings → Cash",     storedAs: "sf_snapshot.emergency_cash" },
  cash_other:         { ownedBy: "settings",    editIn: "Edit in Settings → Cash",     storedAs: "sf_snapshot.other_cash" },
  offset_balance:     { ownedBy: "settings",    editIn: "Edit in Settings → Cash",     storedAs: "sf_snapshot.offset_balance" },
  roham_super:        { ownedBy: "settings",    editIn: "Edit in Settings → Super",    storedAs: "sf_snapshot.roham_super_balance" },
  fara_super:         { ownedBy: "settings",    editIn: "Edit in Settings → Super",    storedAs: "sf_snapshot.fara_super_balance" },
  super_combined:     { ownedBy: "derived",     editIn: "Auto from Settings",         storedAs: "roham_super + fara_super", duplicates: ["sf_snapshot.super_balance (now display-only fallback)"] },
  ppor_value:         { ownedBy: "settings",    editIn: "Edit in Settings → Property", storedAs: "sf_snapshot.ppor" },
};

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

// ─── Income / Expenses / Debt service (single source of truth) ─────────────

/**
 * Average a list of dated amount records over the last `monthsBack` months.
 * Returns 0 when the list is empty or every row is out of window.
 */
function trailingMonthlyAverage(
  rows: any[] | undefined,
  todayIso: string,
  monthsBack = 6,
): number {
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  const today = new Date(todayIso);
  const cutoff = new Date(today);
  cutoff.setMonth(cutoff.getMonth() - monthsBack);
  const cutoffIso = cutoff.toISOString().split("T")[0];
  let total = 0;
  for (const r of rows) {
    const d = (r?.date ?? "") as string;
    if (d >= cutoffIso) total += num(r.amount);
  }
  return total > 0 ? total / monthsBack : 0;
}

/**
 * Monthly income (single source of truth).
 * Order of precedence:
 *   1. Trailing 6mo average of sf_income.amount  (ledger — PRIMARY)
 *   2. Sum of sf_snapshot.{roham,fara}_monthly_income + rental + other
 *   3. sf_snapshot.monthly_income (manual master override — LAST resort)
 */
export function selectMonthlyIncome(i: DashboardInputs): number {
  const today = todayIsoFor(i);
  const ledger = trailingMonthlyAverage(i.incomeRecords, today);
  if (ledger > 0) return Math.round(ledger);
  const s = i.snapshot ?? {};
  const subFields =
    num(s.roham_monthly_income) +
    num(s.fara_monthly_income) +
    num(s.rental_income_total) +
    num(s.other_income);
  if (subFields > 0) return subFields;
  return num(s.monthly_income);
}

/**
 * Monthly expenses (single source of truth).
 * Order of precedence:
 *   1. Trailing 6mo average of sf_expenses.amount  (ledger — PRIMARY)
 *   2. sf_snapshot.monthly_expenses (manual override — fallback only)
 *
 * This is the field that produced the "$17K surplus" regression: the manual
 * snapshot override of \$4,500 was silently winning over the ledger truth of
 * ~\$15K/mo. Ledger now wins whenever it has data.
 */
export function selectMonthlyExpensesLedger(i: DashboardInputs): number {
  const today = todayIsoFor(i);
  const ledger = trailingMonthlyAverage(i.expenses, today);
  if (ledger > 0) return Math.round(ledger);
  return num(i.snapshot?.monthly_expenses);
}

/**
 * Monthly mortgage repayment (P&I) for the PPOR, derived from the debt module.
 * Uses the standard amortisation formula:
 *   PMT = P r (1+r)^n / ((1+r)^n - 1)   where r = annualRate/12, n = term×12
 *
 * Pulls principal/rate/term from sf_snapshot — the debt module stores them
 * there as it is the single source of truth for these fields.
 */
export function selectMortgageRepayment(i: DashboardInputs): number {
  const s = i.snapshot ?? {};
  const principal = num(s.mortgage);
  if (principal <= 0) return 0;
  const annualRate = num(s.mortgage_rate) || 6.5;
  const termYears = num(s.mortgage_term_years) || 30;
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/**
 * Estimated monthly minimum payment on non-property debt (cards, personal
 * loans). 0.15 annual / 12 is the same heuristic used elsewhere in the app
 * (dashboard "hiddenMonthly" calc) so behaviour stays consistent.
 */
export function selectOtherDebtRepayment(i: DashboardInputs): number {
  const otherDebt = num(i.snapshot?.other_debts);
  if (otherDebt <= 0) return 0;
  return (otherDebt * 0.15) / 12;
}

/**
 * Monthly debt service for settled investment properties. Each property's
 * loan is amortised at the snapshot mortgage_rate over the remaining term.
 * Planned IPs (settlement_date > today) are excluded.
 */
export function selectSettledIpDebtService(i: DashboardInputs): number {
  const s = i.snapshot ?? {};
  const annualRate = num(s.mortgage_rate) || 6.5;
  const termYears = num(s.mortgage_term_years) || 30;
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  return selectSettledIPs(i).reduce((sum: number, p: any) => {
    const principal = num(p.loan_amount);
    if (principal <= 0) return sum;
    if (r === 0) return sum + principal / n;
    return sum + (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }, 0);
}

/**
 * Aggregate monthly debt service from the debt module:
 *   PPOR mortgage P&I + other debt minimum + settled IP P&I
 * This is the ONE figure to subtract from surplus when expenses are net of debt.
 */
export function selectMonthlyDebtService(i: DashboardInputs): number {
  return (
    selectMortgageRepayment(i)
      + selectOtherDebtRepayment(i)
      + selectSettledIpDebtService(i)
  );
}

/**
 * Category keywords that indicate a ledger row is a debt repayment, not a
 * living expense. Case-insensitive substring match. Keep this list narrow so
 * we don't accidentally flag general living expenses.
 */
const DEBT_CATEGORY_KEYWORDS = [
  "mortgage",
  "home loan",
  "housing / mortgage",
  "debt repayment",
  "loan repayment",
  "car loan",
  "personal loan",
  "credit card",
  "investment loan",
  "ip loan",
];

function looksLikeDebtCategory(cat: unknown): boolean {
  if (typeof cat !== "string") return false;
  const c = cat.toLowerCase();
  return DEBT_CATEGORY_KEYWORDS.some(k => c.includes(k));
}

/**
 * Does the expense source already include mortgage / debt repayments?
 *
 * Priority:
 *   1. Explicit override on snapshot.expenses_includes_debt (true/false)
 *   2. Auto-detect: scan recent sf_expenses rows for debt-flavoured categories.
 *      If ANY exist, the ledger is treated as already-inclusive.
 *   3. Fallback when ledger empty: assume snapshot.monthly_expenses is a
 *      household total that INCLUDES debt (this is how most users enter it,
 *      and is the safer default — under-subtraction is safer than the
 *      $17K phantom-surplus over-subtraction we just fixed).
 */
export function selectExpensesIncludesDebt(i: DashboardInputs): boolean {
  const s: any = i.snapshot ?? {};
  if (typeof s.expenses_includes_debt === "boolean") {
    return s.expenses_includes_debt;
  }
  if (typeof s.debt_already_included_in_expenses === "boolean") {
    return s.debt_already_included_in_expenses;
  }
  const rows = Array.isArray(i.expenses) ? i.expenses : [];
  if (rows.length > 0) {
    return rows.some((r: any) => looksLikeDebtCategory(r?.category));
  }
  return true; // snapshot-only mode: treat manual total as inclusive
}

/**
 * MONTHLY SURPLUS — the headline KPI.
 *
 * Two modes, gated by `selectExpensesIncludesDebt`:
 *
 *   A) expensesIncludesDebt = true   (DEFAULT — ledger has Mortgage/Loan rows,
 *                                     OR snapshot-only fallback)
 *      surplus = monthlyIncome − monthlyExpensesLedger
 *      (debt is already baked into expenses; do NOT subtract it again)
 *
 *   B) expensesIncludesDebt = false  (ledger is core-living-only, debt tracked
 *                                     separately in debt module)
 *      surplus = monthlyIncome − monthlyExpensesLedger
 *                              − mortgageRepayment
 *                              − otherDebtRepayment
 *                              − settledIpDebtService
 *
 * History (regressions this selector now pins):
 *   • Original bug: `income − expenses` with `monthlyMortgageRepay = 0` and
 *     `monthly_expenses = $4,500` snapshot override winning over ledger ⇒
 *     phantom \$17K surplus.
 *   • SoT-v1 fix over-corrected: it ALWAYS subtracted mortgage + other_debt,
 *     which double-counted because ledger rows already included "Housing /
 *     Mortgage" \$3,750/mo + "Debt Repayment" \$1,460/mo + "Car Loan" rows.
 *   • SoT-v2 (this version): debt-aware, with override + auto-detect.
 */
export function selectMonthlySurplus(i: DashboardInputs): number {
  const income = selectMonthlyIncome(i);
  const expenses = selectMonthlyExpensesLedger(i);
  if (selectExpensesIncludesDebt(i)) {
    return Math.round(income - expenses);
  }
  return Math.round(income - expenses - selectMonthlyDebtService(i));
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

// ────────────────────────────────────────────────────────────────────────────
// Canonical Net Worth selector (audit fix P1.1)
// ────────────────────────────────────────────────────────────────────────────
//
// Why this exists: NW-1 audit defect proved the dashboard and the engine were
// computing NW from DIFFERENT scopes — dashboard included `cars`,
// `iran_property`, and `other_debts`; the engine excluded them. The result
// was a silent $196k gap on the real user's household. This selector becomes
// the single source of truth: dashboard renders from here, engine reconciles
// against here, and a runtime guard throws when they drift.

export interface CanonicalNetWorth {
  assets: {
    /** PPOR market value (sf_snapshot.ppor). */
    ppor: number;
    /** Combined liquid cash including offset. */
    cashOffset: number;
    /** Combined super (Roham + Fara). */
    super: number;
    stocks: number;
    crypto: number;
    /** Settled IP market value (planned IPs excluded). */
    settledIpValue: number;
    /** Vehicles — non-investable but in NW. */
    cars: number;
    /** Overseas property held by the household. */
    iranProperty: number;
    /** Other miscellaneous assets from snapshot. */
    otherAssets: number;
  };
  liabilities: {
    ppoMortgage: number;
    settledIpLoans: number;
    otherDebts: number;
  };
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  /** Sum of all PLANNED-but-not-yet-settled IP equity (excluded from current NW). */
  plannedIpEquity: number;
}

/**
 * Build the canonical net worth breakdown from a DashboardInputs payload.
 *
 * Rule: every NW figure on the dashboard, every NW figure in the engine, and
 * every NW figure on the PDF must agree with this selector to within $1.
 */
export function selectCanonicalNetWorth(i: DashboardInputs): CanonicalNetWorth {
  const s = i.snapshot ?? {};
  const ppor = num(s.ppor);
  const cashOffset = selectCashToday(i);
  const superCombined = selectSuperCombined(i);
  const stocks = selectStocksTotal(i);
  const crypto = selectCryptoTotal(i);
  const settledIpValue = selectIpCurrentValueSettled(i);
  const settledIpLoans = selectIpLoanBalanceSettled(i);
  const cars = num(s.cars);
  const iranProperty = num(s.iran_property);
  const otherAssets = num(s.other_assets);
  const ppoMortgage = num(s.mortgage);
  const otherDebts = num(s.other_debts);

  const totalAssets =
    ppor + cashOffset + superCombined + stocks + crypto +
    settledIpValue + cars + iranProperty + otherAssets;
  const totalLiabilities = ppoMortgage + settledIpLoans + otherDebts;
  const netWorth = totalAssets - totalLiabilities;

  const plannedIpValue = selectIpCurrentValuePlanned(i);
  const plannedIpLoans = selectIpLoanBalancePlanned(i);
  const plannedIpEquity = plannedIpValue - plannedIpLoans;

  return {
    assets: {
      ppor,
      cashOffset,
      super: superCombined,
      stocks,
      crypto,
      settledIpValue,
      cars,
      iranProperty,
      otherAssets,
    },
    liabilities: {
      ppoMortgage,
      settledIpLoans,
      otherDebts,
    },
    totalAssets,
    totalLiabilities,
    netWorth,
    plannedIpEquity,
  };
}

export interface NwReconciliation {
  dashboard: number;
  engine: number;
  diff: number;
  status: "PASS" | "FAIL";
  /** Items that contributed to the diff if FAIL, with their amounts. */
  excludedItems: { label: string; amount: number }[];
}

/**
 * Cross-check the canonical NW against an engine-reported NW. The reconciliation
 * threshold is $1 (rounding tolerance); any larger drift is treated as a real
 * scope mismatch and surfaces the missing buckets so users can see WHY.
 */
export function reconcileNetWorth(
  canonical: CanonicalNetWorth,
  engineNW: number,
): NwReconciliation {
  const diff = Math.round(canonical.netWorth - engineNW);
  const pass = Math.abs(diff) <= 1;
  const excludedItems: { label: string; amount: number }[] = [];
  if (!pass) {
    if (canonical.assets.cars > 0) {
      excludedItems.push({ label: "Cars", amount: canonical.assets.cars });
    }
    if (canonical.assets.iranProperty > 0) {
      excludedItems.push({ label: "Iran property", amount: canonical.assets.iranProperty });
    }
    if (canonical.assets.otherAssets > 0) {
      excludedItems.push({ label: "Other assets", amount: canonical.assets.otherAssets });
    }
    if (canonical.liabilities.otherDebts > 0) {
      excludedItems.push({ label: "Other debts (liability)", amount: -canonical.liabilities.otherDebts });
    }
  }
  return {
    dashboard: Math.round(canonical.netWorth),
    engine: Math.round(engineNW),
    diff,
    status: pass ? "PASS" : "FAIL",
    excludedItems,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Canonical Income selector (audit fix P1.2)
// ────────────────────────────────────────────────────────────────────────────
//
// Why this exists: TX-1 audit defect proved salary lives in two stores that
// can diverge — sf_snapshot.{roham,fara}_monthly_income vs
// sf_tax_profile.{roham,fara}_salary. The tax page reads tax_profile; super
// math and the decision engine read snapshot. This selector centralises the
// precedence rule and reports variance so the UI can flag drift.

export interface CanonicalIncome {
  /** Monthly gross household income (combined). */
  monthlyGross: number;
  /** Annualised — monthlyGross * 12. */
  annualGross: number;
  perPerson: {
    roham: { monthly: number; annual: number };
    fara:  { monthly: number; annual: number };
  };
  /** Rental + other passive income (monthly). */
  passiveMonthly: number;
  /** Source precedence used. */
  source: "ledger" | "snapshot_sub_fields" | "snapshot_master" | "empty";
  /** True when user has manually overridden taxable income on sf_tax_profile. */
  taxableOverrideActive: boolean;
  /** Variance vs sf_tax_profile.{roham,fara}_salary, if material. */
  taxProfileVariance: { roham: number; fara: number; pct: number } | null;
}

/**
 * Selector precedence (matches selectMonthlyIncome):
 *   1. sf_income trailing 6mo avg (ledger)  — split 60/40 if total only
 *   2. sf_snapshot.{roham,fara}_monthly_income + rental + other
 *   3. sf_snapshot.monthly_income (master)
 *
 * `taxProfileVariance` is populated when the per-person snapshot annualised
 * differs from the tax profile by more than 2%.
 */
export function selectCanonicalIncome(
  i: DashboardInputs,
  taxProfile?: any,
): CanonicalIncome {
  const s = i.snapshot ?? {};
  const today = todayIsoFor(i);
  const ledger = trailingMonthlyAverage(i.incomeRecords, today);
  const rohamMonthly = num(s.roham_monthly_income);
  const faraMonthly = num(s.fara_monthly_income);
  const passive = num(s.rental_income_total) + num(s.other_income);
  let monthlyGross = 0;
  let source: CanonicalIncome["source"] = "empty";
  let rohamM = 0, faraM = 0;
  if (ledger > 0) {
    monthlyGross = Math.round(ledger);
    source = "ledger";
    // When the ledger gives one combined number, lean on snapshot split if
    // populated; otherwise default to 60/40 (Roham primary earner).
    if (rohamMonthly > 0 || faraMonthly > 0) {
      const sumSnap = rohamMonthly + faraMonthly;
      rohamM = sumSnap > 0 ? Math.round(monthlyGross * (rohamMonthly / sumSnap)) : monthlyGross * 0.6;
      faraM = monthlyGross - rohamM;
    } else {
      rohamM = Math.round(monthlyGross * 0.6);
      faraM = monthlyGross - rohamM;
    }
  } else if (rohamMonthly + faraMonthly + passive > 0) {
    monthlyGross = rohamMonthly + faraMonthly + passive;
    source = "snapshot_sub_fields";
    rohamM = rohamMonthly;
    faraM = faraMonthly;
  } else if (num(s.monthly_income) > 0) {
    monthlyGross = num(s.monthly_income);
    source = "snapshot_master";
    rohamM = monthlyGross * 0.6;
    faraM = monthlyGross - rohamM;
  }

  const overrideActive = Boolean(
    taxProfile && (taxProfile.override_active === true || taxProfile.taxable_override === true)
  );

  let taxProfileVariance: CanonicalIncome["taxProfileVariance"] = null;
  if (taxProfile && !overrideActive) {
    const rohamProfile = num(taxProfile.roham_salary);
    const faraProfile = num(taxProfile.fara_salary);
    const rohamAnnualSnap = rohamM * 12;
    const faraAnnualSnap = faraM * 12;
    const rohamDiff = rohamProfile - rohamAnnualSnap;
    const faraDiff = faraProfile - faraAnnualSnap;
    const totalSnap = rohamAnnualSnap + faraAnnualSnap;
    const pct = totalSnap > 0 ? Math.abs((rohamDiff + faraDiff) / totalSnap) : 0;
    if (pct > 0.02 && (rohamProfile > 0 || faraProfile > 0)) {
      taxProfileVariance = { roham: rohamDiff, fara: faraDiff, pct };
    }
  }

  return {
    monthlyGross,
    annualGross: monthlyGross * 12,
    perPerson: {
      roham: { monthly: rohamM, annual: rohamM * 12 },
      fara:  { monthly: faraM,  annual: faraM  * 12 },
    },
    passiveMonthly: passive,
    source,
    taxableOverrideActive: overrideActive,
    taxProfileVariance,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Holdings reconciliation selector (audit fix P1.5)
// ────────────────────────────────────────────────────────────────────────────
//
// Why this exists: DH-1 audit defect proved the dashboard renders stocks/crypto
// totals without explaining when they're $0 because nothing is tracked, vs $0
// because the live feed is broken. This reconciler compares "what the pages
// show" against "what the engine sees" so a real divergence (manual snapshot
// shows $50k but no holding rows exist) is surfaced as FAIL.

export interface HoldingsReconciliation {
  stocks: { pagesTotal: number; engineTotal: number; diff: number; status: "PASS" | "FAIL"; rationale: string };
  crypto: { pagesTotal: number; engineTotal: number; diff: number; status: "PASS" | "FAIL"; rationale: string };
}

export function reconcileHoldings(
  i: DashboardInputs,
  engine: { etfBalance: number; cryptoBalance: number },
): HoldingsReconciliation {
  const stocksPages = selectStocksTotal(i);
  const cryptoPages = selectCryptoTotal(i);
  const stocksDiff = Math.round(stocksPages - engine.etfBalance);
  const cryptoDiff = Math.round(cryptoPages - engine.cryptoBalance);

  const stocksStatus: "PASS" | "FAIL" = Math.abs(stocksDiff) <= 1 ? "PASS" : "FAIL";
  const cryptoStatus: "PASS" | "FAIL" = Math.abs(cryptoDiff) <= 1 ? "PASS" : "FAIL";

  const stocksRationale = stocksStatus === "PASS"
    ? `Stocks pages and engine agree at $${stocksPages.toLocaleString("en-AU")}.`
    : `Manual snapshot $${stocksPages.toLocaleString("en-AU")} but live holdings $${engine.etfBalance.toLocaleString("en-AU")}. Connect purchase history or remove manual override.`;
  const cryptoRationale = cryptoStatus === "PASS"
    ? `Crypto pages and engine agree at $${cryptoPages.toLocaleString("en-AU")}.`
    : `Manual snapshot $${cryptoPages.toLocaleString("en-AU")} but live holdings $${engine.cryptoBalance.toLocaleString("en-AU")}. Connect purchase history or remove manual override.`;

  return {
    stocks: { pagesTotal: stocksPages, engineTotal: engine.etfBalance, diff: stocksDiff, status: stocksStatus, rationale: stocksRationale },
    crypto: { pagesTotal: cryptoPages, engineTotal: engine.cryptoBalance, diff: cryptoDiff, status: cryptoStatus, rationale: cryptoRationale },
  };
}

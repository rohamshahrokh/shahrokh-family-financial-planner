/**
 * Dashboard Data Contract — regression guard.
 *
 * Run with:  npm run test:dashboard-contract
 *
 * Why this exists
 * ────────────────
 * In May 2026 the live dashboard silently rendered $0 for Total Investments,
 * Property Equity, Debt Balance and Passive Income because the React selectors
 * read columns that did not exist (`sf_stocks.current_value`) and ignored the
 * `sf_snapshot.stocks/crypto/ppor/mortgage` columns that actually held the
 * user's balances. There was no test that pinned the source-of-truth, so the
 * regression shipped to production unnoticed.
 *
 * This script enforces:
 *   1. Every KPI card key documented in `docs/DASHBOARD_DATA_CONTRACT.md`
 *      exists in `KPI_DATA_CONTRACT` exactly once.
 *   2. Each card's `sources` array still contains the table/column pairs
 *      that the live app must read. Removing or renaming any of them
 *      requires updating both the contract and this script in the same PR.
 *   3. Each card's `forbidden` list still bans the planned/forecast tables
 *      that produced the original bug.
 *   4. Selector outputs match hand-computed values for a known fixture
 *      (settled IP equity, stocks Math.max behaviour, super fallback chain,
 *      cash bucket sum, planned IPs not counted in actuals).
 *
 * Exit code: 0 = all assertions pass, 1 = any failure.
 */

import {
  KPI_DATA_CONTRACT,
  ALL_CONTRACT_KEYS,
  SOURCE_OF_TRUTH,
  selectStocksTotal,
  selectCryptoTotal,
  selectIpCurrentValueSettled,
  selectIpLoanBalanceSettled,
  selectIpCurrentValuePlanned,
  selectIpLoanBalancePlanned,
  selectSettledIPs,
  selectPlannedIPs,
  selectTotalInvestments,
  selectPropertyEquity,
  selectDebtBalance,
  selectPassiveIncome,
  selectSuperCombined,
  selectCashToday,
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectMortgageRepayment,
  selectOtherDebtRepayment,
  selectSettledIpDebtService,
  selectMonthlyDebtService,
  selectExpensesIncludesDebt,
  selectMonthlySurplus,
  evaluateDataAvailability,
  type DashboardInputs,
} from "../client/src/lib/dashboardDataContract";

// ─────────────────────────────────────────────────────────────────────────────
// Tiny assertion helpers (we deliberately avoid pulling in Vitest/Jest so
// this stays a zero-dependency script that runs anywhere `tsx` runs.)
// ─────────────────────────────────────────────────────────────────────────────

let failures = 0;
const failed: string[] = [];

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    process.stdout.write(`  \u2713 ${label}\n`);
  } else {
    failures++;
    failed.push(label);
    process.stdout.write(`  \u2717 ${label}${detail ? `\n      ${detail}` : ""}\n`);
  }
}

function approx(a: number, b: number, eps = 0.5) {
  return Math.abs(a - b) <= eps;
}

function hasSource(card: keyof typeof KPI_DATA_CONTRACT, table: string, columnContains: string) {
  return KPI_DATA_CONTRACT[card].sources.some(
    s => s.table === table && s.column.includes(columnContains)
  );
}

function hasForbidden(card: keyof typeof KPI_DATA_CONTRACT, table: string) {
  return (KPI_DATA_CONTRACT[card].forbidden ?? []).includes(table);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Card-shape invariants
// ─────────────────────────────────────────────────────────────────────────────

process.stdout.write("\n[1/4] Contract shape\n");

const REQUIRED_KEYS = [
  "monthly_surplus", "total_investments", "property_equity", "debt_balance",
  "passive_income", "super_combined", "cash_today", "net_worth",
] as const;

for (const k of REQUIRED_KEYS) {
  check(`card key '${k}' exists`, k in KPI_DATA_CONTRACT);
}
check(
  `no extra/unknown card keys`,
  ALL_CONTRACT_KEYS.every(k => (REQUIRED_KEYS as readonly string[]).includes(k as string)),
  `found: ${ALL_CONTRACT_KEYS.join(", ")}`,
);

for (const k of REQUIRED_KEYS) {
  const card = KPI_DATA_CONTRACT[k];
  check(`'${k}'.label is non-empty`, typeof card?.label === "string" && card.label.length > 0);
  check(`'${k}'.tier is 'actual'`, card?.tier === "actual",
    `found tier='${card?.tier}' — every headline card must report ACTUAL data, not forecast`);
  check(`'${k}'.formula is non-empty`, typeof card?.formula === "string" && card.formula.length > 0);
  check(`'${k}'.sources is a non-empty array`,
    Array.isArray(card?.sources) && card.sources.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Source-of-truth bindings — these are the ones that broke in production.
// ─────────────────────────────────────────────────────────────────────────────

process.stdout.write("\n[2/4] Source-of-truth bindings\n");

// total_investments
check("total_investments reads /api/holdings.current_value",
  hasSource("total_investments", "(api)", "/api/holdings"));
check("total_investments reads sf_stocks.current_price * current_holding",
  hasSource("total_investments", "sf_stocks", "current_price"));
check("total_investments reads sf_crypto.current_price * current_holding",
  hasSource("total_investments", "sf_crypto", "current_price"));
check("total_investments reads sf_snapshot.stocks (manual aggregate)",
  hasSource("total_investments", "sf_snapshot", "stocks"));
check("total_investments reads sf_snapshot.crypto (manual aggregate)",
  hasSource("total_investments", "sf_snapshot", "crypto"));
check("total_investments reads sf_properties.current_value (settled IPs)",
  hasSource("total_investments", "sf_properties", "current_value"));
check("total_investments forbids sf_planned_investments",
  hasForbidden("total_investments", "sf_planned_investments"));
check("total_investments forbids sf_stock_dca",
  hasForbidden("total_investments", "sf_stock_dca"));
check("total_investments forbids sf_crypto_dca",
  hasForbidden("total_investments", "sf_crypto_dca"));

// property_equity
check("property_equity reads sf_snapshot.ppor",
  hasSource("property_equity", "sf_snapshot", "ppor"));
check("property_equity reads sf_snapshot.mortgage",
  hasSource("property_equity", "sf_snapshot", "mortgage"));
check("property_equity reads sf_properties.current_value",
  hasSource("property_equity", "sf_properties", "current_value"));
check("property_equity reads sf_properties.loan_amount",
  hasSource("property_equity", "sf_properties", "loan_amount"));
check("property_equity uses sf_properties.settlement_date as filter",
  hasSource("property_equity", "sf_properties", "settlement_date"));

// debt_balance
check("debt_balance reads sf_snapshot.mortgage",
  hasSource("debt_balance", "sf_snapshot", "mortgage"));
check("debt_balance reads sf_snapshot.other_debts",
  hasSource("debt_balance", "sf_snapshot", "other_debts"));
check("debt_balance reads sf_properties.loan_amount (settled IPs)",
  hasSource("debt_balance", "sf_properties", "loan_amount"));
check("debt_balance forbids financial_snapshots",
  hasForbidden("debt_balance", "financial_snapshots"));

// passive_income
check("passive_income reads sf_properties.weekly_rent",
  hasSource("passive_income", "sf_properties", "weekly_rent"));
check("passive_income reads sf_snapshot.rental_income_total",
  hasSource("passive_income", "sf_snapshot", "rental_income_total"));
check("passive_income reads sf_snapshot.other_income",
  hasSource("passive_income", "sf_snapshot", "other_income"));

// super_combined
check("super_combined reads sf_snapshot.roham_super_balance",
  hasSource("super_combined", "sf_snapshot", "roham_super_balance"));
check("super_combined reads sf_snapshot.fara_super_balance",
  hasSource("super_combined", "sf_snapshot", "fara_super_balance"));
check("super_combined falls back to sf_snapshot.super_balance",
  hasSource("super_combined", "sf_snapshot", "super_balance"));

// cash_today
for (const col of ["cash", "savings_cash", "emergency_cash", "other_cash", "offset_balance"]) {
  check(`cash_today reads sf_snapshot.${col}`,
    hasSource("cash_today", "sf_snapshot", col));
}

// monthly_surplus — sources cover income, expenses, AND debt service
check("monthly_surplus reads sf_snapshot.monthly_income",
  hasSource("monthly_surplus", "sf_snapshot", "monthly_income"));
check("monthly_surplus reads sf_snapshot.monthly_expenses",
  hasSource("monthly_surplus", "sf_snapshot", "monthly_expenses"));
check("monthly_surplus reads sf_income.amount (ledger primary)",
  hasSource("monthly_surplus", "sf_income", "amount"));
check("monthly_surplus reads sf_expenses.amount (ledger primary)",
  hasSource("monthly_surplus", "sf_expenses", "amount"));
check("monthly_surplus reads sf_snapshot.mortgage (PMT principal)",
  hasSource("monthly_surplus", "sf_snapshot", "mortgage"));
check("monthly_surplus reads sf_snapshot.mortgage_rate (PMT rate)",
  hasSource("monthly_surplus", "sf_snapshot", "mortgage_rate"));
check("monthly_surplus reads sf_snapshot.mortgage_term_years (PMT term)",
  hasSource("monthly_surplus", "sf_snapshot", "mortgage_term_years"));
check("monthly_surplus reads sf_snapshot.other_debts (debt service)",
  hasSource("monthly_surplus", "sf_snapshot", "other_debts"));
check("monthly_surplus reads sf_properties.loan_amount (settled IP debt service)",
  hasSource("monthly_surplus", "sf_properties", "loan_amount"));
check("monthly_surplus FORBIDS sf_planned_investments",
  hasForbidden("monthly_surplus", "sf_planned_investments"));
check("monthly_surplus FORBIDS sf_scenario_* (planning data)",
  hasForbidden("monthly_surplus", "sf_scenario_*"));
check("monthly_surplus FORBIDS financial_snapshots (legacy)",
  hasForbidden("monthly_surplus", "financial_snapshots"));

// ─────────────────────────────────────────────────────────────────────────────
// 3. Selector behaviour — fixture-driven sanity checks.
// ─────────────────────────────────────────────────────────────────────────────

process.stdout.write("\n[3/4] Selector behaviour\n");

const fixedToday = "2026-05-10";

const fxBaseline: DashboardInputs = {
  todayIso: fixedToday,
  snapshot: {
    cash: 5_000, savings_cash: 10_000, emergency_cash: 0,
    other_cash: 222_000, offset_balance: 222_000, // duplicate guard should zero other_cash
    ppor: 800_000, mortgage: 500_000, other_debts: 12_000,
    stocks: 30_000, crypto: 1_500,
    roham_super_balance: 49_500, fara_super_balance: 38_500, super_balance: 999_999,
    rental_income_total: 0, other_income: 200,
    monthly_income: 21_940, monthly_expenses: 15_150,
  },
  properties: [
    // settled IP — counts as actual
    { id: 1, type: "investment", current_value: 750_000, loan_amount: 600_000,
      settlement_date: "2025-01-01", weekly_rent: 600, vacancy_rate: 5, management_fee: 8 },
    // planned IP — must NOT contribute to actuals
    { id: 2, type: "investment", current_value: 750_000, loan_amount: 800_000,
      settlement_date: "2028-03-28", weekly_rent: 650, vacancy_rate: 5, management_fee: 8 },
    // PPOR — never an investment property
    { id: 3, type: "ppor", current_value: 800_000, loan_amount: 500_000,
      settlement_date: "2020-01-01" },
  ],
  stocks: [
    { ticker: "AAPL", current_price: 200, current_holding: 100 },  // 20_000
    { ticker: "MSFT", current_price: 300, current_holding: 50 },   // 15_000
  ],
  cryptos: [
    { symbol: "BTC", current_price: 100_000, current_holding: 0.05 }, // 5_000
  ],
  holdingsRaw: [
    { asset_type: "stock", current_value: 1_000 },  // less than tickerValue (35_000) — Math.max picks 35_000
    { asset_type: "crypto", current_value: 500 },   // less than tickerValue (5_000)
  ],
  incomeRecords: [],
  expenses: [],
};

// Settled vs planned partition
check("selectSettledIPs returns 1 settled IP (today=2026-05-10)",
  selectSettledIPs(fxBaseline).length === 1);
check("selectPlannedIPs returns 1 planned IP (settles 2028-03-28)",
  selectPlannedIPs(fxBaseline).length === 1);
check("selectIpCurrentValueSettled = 750k",
  approx(selectIpCurrentValueSettled(fxBaseline), 750_000));
check("selectIpLoanBalanceSettled = 600k",
  approx(selectIpLoanBalanceSettled(fxBaseline), 600_000));
check("selectIpCurrentValuePlanned = 750k",
  approx(selectIpCurrentValuePlanned(fxBaseline), 750_000));
check("selectIpLoanBalancePlanned = 800k",
  approx(selectIpLoanBalancePlanned(fxBaseline), 800_000));

// Stocks/crypto: Math.max picks highest source
check("selectStocksTotal picks tickerValue over liveStocks/manual (35k)",
  approx(selectStocksTotal(fxBaseline), 35_000));
check("selectCryptoTotal picks tickerValue over liveCrypto/manual (5k)",
  approx(selectCryptoTotal(fxBaseline), 5_000));

// Manual-aggregate fallback when ticker rows are empty
const fxOnlyManual: DashboardInputs = {
  ...fxBaseline,
  stocks: [], cryptos: [], holdingsRaw: [],
};
check("selectStocksTotal falls back to snapshot.stocks (30k)",
  approx(selectStocksTotal(fxOnlyManual), 30_000));
check("selectCryptoTotal falls back to snapshot.crypto (1.5k)",
  approx(selectCryptoTotal(fxOnlyManual), 1_500));

// Total investments = stocks + crypto + settledIP value (planned excluded)
check("selectTotalInvestments excludes planned IP (35k+5k+750k = 790k)",
  approx(selectTotalInvestments(fxBaseline), 790_000));

// Property equity = (PPOR equity) + (settled IP equity)
// (800k-500k) + (750k-600k) = 300k + 150k = 450k
check("selectPropertyEquity excludes planned IP (450k)",
  approx(selectPropertyEquity(fxBaseline), 450_000));

// Debt balance = mortgage + other_debts + settled IP loan
// 500k + 12k + 600k = 1_112_000
check("selectDebtBalance excludes planned IP loan (1.112M)",
  approx(selectDebtBalance(fxBaseline), 1_112_000));

// Super: roham+fara wins when both > 0; super_balance is fallback only
check("selectSuperCombined sums roham+fara when both > 0 (88k)",
  approx(selectSuperCombined(fxBaseline), 88_000));

const fxNoBreakdown: DashboardInputs = {
  ...fxBaseline,
  snapshot: { ...fxBaseline.snapshot, roham_super_balance: 0, fara_super_balance: 0 },
};
check("selectSuperCombined falls back to super_balance when breakdown empty",
  approx(selectSuperCombined(fxNoBreakdown), 999_999));

// Cash dedup guard: other_cash === offset_balance ⇒ zero other_cash
// Sum = 5_000 + 10_000 + 0 + 0 + 222_000 = 237_000
check("selectCashToday dedups other_cash when equal to offset_balance (237k)",
  approx(selectCashToday(fxBaseline), 237_000));

// Passive income — settled IP rental beats manual override (zero), plus dividends
// rental = 600 * 52 * 0.95 * 0.92 = 27,268.80
// otherPassive = 200 * 12 = 2_400
// dividends = 35_000 * 0.02 + 5_000 * 0.01 = 700 + 50 = 750
// total ≈ 30,418.80 → rounded 30_419
check("selectPassiveIncome ≈ 30,419 (settled rental + heuristics)",
  approx(selectPassiveIncome(fxBaseline), 30_419, 2));

// ─────────────────────────────────────────────────────────────────────────────
// 4. Data availability heuristic — banner trigger
// ─────────────────────────────────────────────────────────────────────────────

process.stdout.write("\n[4/4] Data availability heuristic\n");

const fxEmpty: DashboardInputs = {
  todayIso: fixedToday,
  snapshot: {
    cash: 0, savings_cash: 0, emergency_cash: 0, other_cash: 0, offset_balance: 0,
    ppor: 0, mortgage: 0, other_debts: 0, stocks: 0, crypto: 0,
    roham_super_balance: 0, fara_super_balance: 0, super_balance: 0,
  },
  properties: [], stocks: [], cryptos: [], holdingsRaw: [],
  incomeRecords: [], expenses: [],
};
const aEmpty = evaluateDataAvailability(fxEmpty);
check("evaluateDataAvailability flags allActualEmpty=true on empty fixture",
  aEmpty.allActualEmpty === true);
check("evaluateDataAvailability lists Stocks/Crypto/PPOR/Debts/Settled IPs as empty",
  aEmpty.emptySections.includes("Stocks") &&
  aEmpty.emptySections.includes("Crypto") &&
  aEmpty.emptySections.includes("PPOR (family home)") &&
  aEmpty.emptySections.includes("Debts") &&
  aEmpty.emptySections.includes("Settled investment properties"));

const aFull = evaluateDataAvailability(fxBaseline);
check("evaluateDataAvailability flags allActualEmpty=false when data present",
  aFull.allActualEmpty === false);

// ─────────────────────────────────────────────────────────────────────────────
// 5. Source-of-truth map & SoT-aware selectors
//    These invariants pin the architectural rule:
//      ledger > sub-fields > master override for income/expenses
//      mortgage_repayment is DERIVED via PMT, never a free field
//      surplus subtracts mortgage + other_debt + IP debt service
// ─────────────────────────────────────────────────────────────────────────────

process.stdout.write("\n[5/5] Source-of-truth selectors\n");

// SOURCE_OF_TRUTH map shape
check("SOURCE_OF_TRUTH map exposes monthly_income owned by ledger",
  SOURCE_OF_TRUTH.monthly_income?.ownedBy === "ledger");
check("SOURCE_OF_TRUTH map exposes monthly_expenses owned by budget",
  SOURCE_OF_TRUTH.monthly_expenses?.ownedBy === "budget");
check("SOURCE_OF_TRUTH map exposes mortgage_balance owned by debt_module",
  SOURCE_OF_TRUTH.mortgage_balance?.ownedBy === "debt_module");
check("SOURCE_OF_TRUTH map exposes mortgage_repayment owned by derived",
  SOURCE_OF_TRUTH.mortgage_repayment?.ownedBy === "derived");
check("SOURCE_OF_TRUTH map exposes super_combined owned by derived",
  SOURCE_OF_TRUTH.super_combined?.ownedBy === "derived");
check("SOURCE_OF_TRUTH map exposes cash_savings owned by settings",
  SOURCE_OF_TRUTH.cash_savings?.ownedBy === "settings");
check("SOURCE_OF_TRUTH map flags monthly_expenses duplicate",
  Array.isArray(SOURCE_OF_TRUTH.monthly_expenses?.duplicates) &&
  SOURCE_OF_TRUTH.monthly_expenses!.duplicates!.length > 0);

// Mortgage PMT fixture: $1.2M @ 6.5% / 30y ≈ $7,584/mo
const fxMortgage: DashboardInputs = {
  ...fxBaseline,
  snapshot: {
    ...fxBaseline.snapshot,
    mortgage: 1_200_000, mortgage_rate: 6.5, mortgage_term_years: 30,
  },
};
check("selectMortgageRepayment($1.2M, 6.5%, 30y) ≈ $7,584/mo",
  approx(selectMortgageRepayment(fxMortgage), 7_584, 2),
  `got ${selectMortgageRepayment(fxMortgage).toFixed(2)}`);

// Defaults: when rate/term missing, fall back to 6.5% / 30y
const fxMortgageDefaults: DashboardInputs = {
  ...fxBaseline,
  snapshot: { ...fxBaseline.snapshot, mortgage: 500_000, mortgage_rate: 0, mortgage_term_years: 0 },
};
check("selectMortgageRepayment defaults to 6.5%/30y when fields missing ($500k ≈ $3,160)",
  approx(selectMortgageRepayment(fxMortgageDefaults), 3_160, 5),
  `got ${selectMortgageRepayment(fxMortgageDefaults).toFixed(2)}`);

// Zero principal => zero repayment
const fxNoMortgage: DashboardInputs = {
  ...fxBaseline, snapshot: { ...fxBaseline.snapshot, mortgage: 0 },
};
check("selectMortgageRepayment returns 0 when principal=0",
  selectMortgageRepayment(fxNoMortgage) === 0);

// Other-debt heuristic: $19k * 0.15 / 12 = $237.50
const fxOtherDebt: DashboardInputs = {
  ...fxBaseline, snapshot: { ...fxBaseline.snapshot, other_debts: 19_000 },
};
check("selectOtherDebtRepayment($19k) ≈ $237.50",
  approx(selectOtherDebtRepayment(fxOtherDebt), 237.5, 0.5),
  `got ${selectOtherDebtRepayment(fxOtherDebt).toFixed(2)}`);

// selectMonthlyExpensesLedger — ledger wins over manual override
const fxExpensesLedger: DashboardInputs = {
  ...fxBaseline,
  snapshot: { ...fxBaseline.snapshot, monthly_expenses: 4_500 }, // the bug value
  expenses: [
    { date: "2026-05-01", amount: 15_000 },
    { date: "2026-04-01", amount: 15_000 },
    { date: "2026-03-01", amount: 15_000 },
    { date: "2026-02-01", amount: 15_000 },
    { date: "2026-01-01", amount: 15_000 },
    { date: "2025-12-01", amount: 15_000 },
  ],
};
check("selectMonthlyExpensesLedger uses ledger ($15k avg), NOT manual $4,500",
  approx(selectMonthlyExpensesLedger(fxExpensesLedger), 15_000, 1),
  `got ${selectMonthlyExpensesLedger(fxExpensesLedger)}`);

// And when ledger is empty, falls back to snapshot.monthly_expenses
const fxExpensesFallback: DashboardInputs = {
  ...fxBaseline,
  snapshot: { ...fxBaseline.snapshot, monthly_expenses: 4_500 },
  expenses: [],
};
check("selectMonthlyExpensesLedger falls back to snapshot.monthly_expenses when ledger empty",
  selectMonthlyExpensesLedger(fxExpensesFallback) === 4_500);

// selectMonthlyIncome — ledger > sub-fields > master
const fxIncomeLedger: DashboardInputs = {
  ...fxBaseline,
  snapshot: { ...fxBaseline.snapshot, monthly_income: 99_999, // master should be ignored
              roham_monthly_income: 0, fara_monthly_income: 0 },
  incomeRecords: [
    { date: "2026-05-01", amount: 22_000 },
    { date: "2026-04-01", amount: 22_000 },
    { date: "2026-03-01", amount: 22_000 },
    { date: "2026-02-01", amount: 22_000 },
    { date: "2026-01-01", amount: 22_000 },
    { date: "2025-12-01", amount: 22_000 },
  ],
};
check("selectMonthlyIncome prefers ledger over master override",
  approx(selectMonthlyIncome(fxIncomeLedger), 22_000, 1),
  `got ${selectMonthlyIncome(fxIncomeLedger)}`);

const fxIncomeSubfields: DashboardInputs = {
  ...fxBaseline,
  snapshot: { ...fxBaseline.snapshot,
              roham_monthly_income: 11_140, fara_monthly_income: 10_800,
              rental_income_total: 0, other_income: 0,
              monthly_income: 99_999 },
  incomeRecords: [],
};
check("selectMonthlyIncome prefers sub-fields ($21,940) over master ($99,999) when ledger empty",
  approx(selectMonthlyIncome(fxIncomeSubfields), 21_940, 1),
  `got ${selectMonthlyIncome(fxIncomeSubfields)}`);

const fxIncomeMaster: DashboardInputs = {
  ...fxBaseline,
  snapshot: { ...fxBaseline.snapshot,
              roham_monthly_income: 0, fara_monthly_income: 0,
              rental_income_total: 0, other_income: 0,
              monthly_income: 12_500 },
  incomeRecords: [],
};
check("selectMonthlyIncome uses master only when ledger and sub-fields are empty",
  selectMonthlyIncome(fxIncomeMaster) === 12_500);

// selectMonthlySurplus — debt-aware regression fixtures
// =====================================================
// We must verify BOTH modes produce the same answer when the underlying
// economic reality is identical — i.e. whether the user logs
//   $15K "all-in" expenses including mortgage, OR
//   $7K "core" expenses + $8K debt service tracked separately
// the surplus must be the SAME number, never double-subtracted.

const SHARED_INCOME = 22_000;
const SHARED_DEBT_SVC = 8_000; // mortgage P&I + other debt + IP P&I, combined
const SHARED_CORE_EXP = 7_000; // core living only, no debt
const SHARED_TOTAL_EXP = SHARED_CORE_EXP + SHARED_DEBT_SVC; // 15_000

// To produce ~$8,000/mo of debt service we use a mortgage ~$1.265M @ 6.5%/30y
// (≈ $7,994) + $19k other debts (≈ $237.50). Close enough to $8k for the test.
const SURPLUS_FX_BASE = {
  todayIso: fixedToday,
  snapshot: {
    cash: 0, savings_cash: 0, emergency_cash: 0, other_cash: 0, offset_balance: 0,
    ppor: 0,
    mortgage: 1_265_000, mortgage_rate: 6.5, mortgage_term_years: 30, // ≈ $7,994/mo
    other_debts: 0, // keep the debt service clean at ≈ $7,994 for arithmetic
    roham_super_balance: 0, fara_super_balance: 0,
  },
  properties: [], stocks: [], cryptos: [], holdingsRaw: [],
} as const;

function monthsOf(amount: number, category?: string) {
  return [
    { date: "2026-05-01", amount, category },
    { date: "2026-04-01", amount, category },
    { date: "2026-03-01", amount, category },
    { date: "2026-02-01", amount, category },
    { date: "2026-01-01", amount, category },
    { date: "2025-12-01", amount, category },
  ];
}
function incomeMonths(amount: number) {
  return monthsOf(amount).map(r => ({ date: r.date, amount: r.amount }));
}

// Compute the actual debt-service for the shared fixture so the equality
// assertion below is exact rather than approximate (the contract changes the
// PMT result; we measure it once and reuse).
const probeDebt: DashboardInputs = {
  ...SURPLUS_FX_BASE,
  incomeRecords: [], expenses: [],
};
const DEBT_SVC_ACTUAL = selectMonthlyDebtService(probeDebt);
const CORE_EXP_FOR_PARITY = Math.round(SHARED_TOTAL_EXP - DEBT_SVC_ACTUAL);

// MODE A — expenses include mortgage/debt (auto-detect via category)
// Ledger rows have "Housing / Mortgage" + "Debt Repayment" categories.
// Expected: surplus = income - expenses, NO debt subtraction.
const fxInclDebt: DashboardInputs = {
  ...SURPLUS_FX_BASE,
  incomeRecords: incomeMonths(SHARED_INCOME),
  expenses: [
    // Total $15,000/mo: $7k living + $8k debt-flavoured, debt rows are tagged
    ...monthsOf(SHARED_CORE_EXP, "Groceries"),
    ...monthsOf(SHARED_DEBT_SVC, "Housing / Mortgage"),
  ],
};
const surplusInclDebt = selectMonthlySurplus(fxInclDebt);
check("MODE A: auto-detects expensesIncludesDebt=true via category keyword",
  selectExpensesIncludesDebt(fxInclDebt) === true);
check(`MODE A: income $22K - expenses $15K (debt inside) = surplus ≈ $7K (got ${surplusInclDebt})`,
  approx(surplusInclDebt, 7_000, 1));
check("MODE A: surplus does NOT subtract debt twice",
  surplusInclDebt > SHARED_INCOME - SHARED_TOTAL_EXP - 100,
  `surplus=${surplusInclDebt} — must NOT be reduced by another \$8k of debt service`);

// MODE B — expenses EXCLUDE mortgage/debt (core-living only)
// Ledger rows are tagged "Groceries" / "Utilities" only — auto-detect=false.
// Expected: surplus = income - expenses - debt service.
const fxExclDebt: DashboardInputs = {
  ...SURPLUS_FX_BASE,
  incomeRecords: incomeMonths(SHARED_INCOME),
  expenses: monthsOf(CORE_EXP_FOR_PARITY, "Groceries"),
};
const surplusExclDebt = selectMonthlySurplus(fxExclDebt);
check("MODE B: auto-detects expensesIncludesDebt=false (no debt-flavoured rows)",
  selectExpensesIncludesDebt(fxExclDebt) === false);
check(`MODE B: income $22K - core $${CORE_EXP_FOR_PARITY} - debt service ≈ surplus $7K (got ${surplusExclDebt})`,
  approx(surplusExclDebt, 7_000, 1));

// PARITY — the headline invariant: same economic reality => same surplus,
// regardless of how the user splits expenses vs debt service.
check("PARITY: MODE A surplus === MODE B surplus (no double-count, no missing-count)",
  Math.abs(surplusInclDebt - surplusExclDebt) <= 1,
  `inclDebt=${surplusInclDebt}  exclDebt=${surplusExclDebt}`);

// EXPLICIT OVERRIDE — snapshot.expenses_includes_debt forces the mode
const fxExplicitInclude: DashboardInputs = {
  ...SURPLUS_FX_BASE,
  snapshot: { ...SURPLUS_FX_BASE.snapshot, expenses_includes_debt: true },
  incomeRecords: incomeMonths(SHARED_INCOME),
  // No category tags — auto-detect would say false, but the explicit override wins.
  expenses: monthsOf(SHARED_TOTAL_EXP),
};
check("OVERRIDE: snapshot.expenses_includes_debt=true forces include-mode",
  selectExpensesIncludesDebt(fxExplicitInclude) === true &&
    approx(selectMonthlySurplus(fxExplicitInclude), 7_000, 1));

const fxExplicitExclude: DashboardInputs = {
  ...SURPLUS_FX_BASE,
  snapshot: { ...SURPLUS_FX_BASE.snapshot, expenses_includes_debt: false },
  incomeRecords: incomeMonths(SHARED_INCOME),
  // Debt-flavoured rows present, but explicit override forces exclude-mode.
  expenses: monthsOf(CORE_EXP_FOR_PARITY, "Housing / Mortgage"),
};
check("OVERRIDE: snapshot.expenses_includes_debt=false forces exclude-mode",
  selectExpensesIncludesDebt(fxExplicitExclude) === false &&
    approx(selectMonthlySurplus(fxExplicitExclude), 7_000, 1));

// SNAPSHOT-ONLY FALLBACK — no ledger; manual master is treated as inclusive
const fxSnapshotOnly: DashboardInputs = {
  ...SURPLUS_FX_BASE,
  snapshot: { ...SURPLUS_FX_BASE.snapshot, monthly_income: SHARED_INCOME, monthly_expenses: SHARED_TOTAL_EXP },
  incomeRecords: [], expenses: [],
};
check("FALLBACK: snapshot-only mode defaults expensesIncludesDebt=true (no debt re-subtracted)",
  selectExpensesIncludesDebt(fxSnapshotOnly) === true &&
    approx(selectMonthlySurplus(fxSnapshotOnly), 7_000, 1));

// $17K phantom-surplus regression (the original bug from #FixSingleSourceOfTruth)
// Snapshot override $4,500, ledger $15K, income $21,940 — ledger must win,
// and we must never see $17,440 again.
const fxPhantom17k: DashboardInputs = {
  todayIso: fixedToday,
  snapshot: {
    cash: 0, savings_cash: 40_000, emergency_cash: 0, other_cash: 0, offset_balance: 222_000,
    ppor: 0, mortgage: 1_200_000, mortgage_rate: 6.5, mortgage_term_years: 30,
    other_debts: 19_000,
    monthly_income: 21_940, monthly_expenses: 4_500,
  },
  properties: [
    { id: 1, type: "investment", current_value: 750_000, loan_amount: 600_000,
      settlement_date: "2024-01-01", weekly_rent: 600, vacancy_rate: 5, management_fee: 8 },
  ],
  stocks: [], cryptos: [], holdingsRaw: [],
  incomeRecords: incomeMonths(21_940),
  expenses: [
    ...monthsOf(11_400, "Groceries"),
    ...monthsOf(3_750, "Housing / Mortgage"),
  ],
};
const surplusPhantom = selectMonthlySurplus(fxPhantom17k);
check("REGRESSION: surplus never re-equals the $17,440 phantom",
  Math.abs(surplusPhantom - 17_440) > 5_000,
  `surplus=${surplusPhantom}`);
check("REGRESSION: surplus uses ledger ($15,150 total), not $4,500 snapshot override",
  surplusPhantom < 21_940 - 4_500 - 1_000,
  `surplus=${surplusPhantom}— ledger total $15,150 must win over snapshot $4,500`);

// ─────────────────────────────────────────────────────────────────────────────
// Result
// ─────────────────────────────────────────────────────────────────────────────

process.stdout.write("\n");
if (failures === 0) {
  process.stdout.write("\u2713 Dashboard data contract regression: all checks passed.\n");
  process.exit(0);
} else {
  process.stdout.write(`\u2717 Dashboard data contract regression: ${failures} failure(s)\n`);
  for (const f of failed) process.stdout.write(`    - ${f}\n`);
  process.exit(1);
}

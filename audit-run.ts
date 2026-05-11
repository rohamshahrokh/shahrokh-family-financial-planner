/**
 * Audit harness — recompute dashboard contract numbers against the real
 * Supabase snapshot. Writes a JSON file with the computed values + variance
 * against an analytical recomputation we do here independently.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import {
  selectSettledIPs,
  selectPlannedIPs,
  selectIpCurrentValueSettled,
  selectIpLoanBalanceSettled,
  selectIpCurrentValuePlanned,
  selectIpLoanBalancePlanned,
  selectStocksTotal,
  selectCryptoTotal,
  selectTotalInvestments,
  selectPropertyEquity,
  selectDebtBalance,
  selectPassiveIncome,
  selectSuperCombined,
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectMortgageRepayment,
  selectOtherDebtRepayment,
  selectSettledIpDebtService,
  selectMonthlyDebtService,
  selectExpensesIncludesDebt,
  selectMonthlySurplus,
  selectCashToday,
  evaluateDataAvailability,
  type DashboardInputs,
} from "./client/src/lib/dashboardDataContract";

const RAW = "/home/user/workspace/audit/raw_data";
const OUT = "/home/user/workspace/audit/calculation-checks.json";

const j = (p: string) => JSON.parse(fs.readFileSync(path.join(RAW, p), "utf8"));

const snapshot = j("sf_snapshot_full.json")[0];
const properties = j("sf_properties.json");
const stocks = j("sf_stocks.json");
const cryptos = j("sf_crypto.json");
const incomeRecords = j("sf_income.json");
const expenses = j("sf_expenses.json");
const tax = j("sf_tax_profile.json")[0];
const recurring = j("sf_recurring_bills.json");

// Properties from sf_properties don't have a settlement_date column in the raw
// dump — they have purchase_date. The selector code reads p.settlement_date,
// so any property without that field is treated as "settled". Add a normalized
// settlement_date so the engine sees realistic state.
const normalisedProperties = properties.map((p: any) => ({
  ...p,
  settlement_date: p.settlement_date ?? p.purchase_date ?? null,
}));

const inputs: DashboardInputs = {
  snapshot,
  properties: normalisedProperties,
  stocks,
  cryptos,
  holdingsRaw: [],
  incomeRecords,
  expenses,
  todayIso: "2026-05-11", // freeze "today" to match capture time
};

const out: any = {
  meta: {
    todayIso: "2026-05-11",
    snapshot_id: snapshot.id,
    raw_data_dir: RAW,
  },
  raw_inputs_summary: {
    properties_count: properties.length,
    stocks_count: stocks.length,
    crypto_count: cryptos.length,
    income_rows: incomeRecords.length,
    expense_rows: expenses.length,
    recurring_bills_count: recurring.length,
  },
  selectors: {} as Record<string, any>,
};

// Run every selector
out.selectors.settledIPs_count = selectSettledIPs(inputs).length;
out.selectors.plannedIPs_count = selectPlannedIPs(inputs).length;
out.selectors.ipCurrentValueSettled_aud = selectIpCurrentValueSettled(inputs);
out.selectors.ipLoanBalanceSettled_aud = selectIpLoanBalanceSettled(inputs);
out.selectors.ipCurrentValuePlanned_aud = selectIpCurrentValuePlanned(inputs);
out.selectors.ipLoanBalancePlanned_aud = selectIpLoanBalancePlanned(inputs);
out.selectors.stocksTotal_aud = selectStocksTotal(inputs);
out.selectors.cryptoTotal_aud = selectCryptoTotal(inputs);
out.selectors.totalInvestments_aud = selectTotalInvestments(inputs);
out.selectors.propertyEquity_aud = selectPropertyEquity(inputs);
out.selectors.debtBalance_aud = selectDebtBalance(inputs);
out.selectors.passiveIncome_annual_aud = selectPassiveIncome(inputs);
out.selectors.superCombined_aud = selectSuperCombined(inputs);
out.selectors.monthlyIncome_aud = selectMonthlyIncome(inputs);
out.selectors.monthlyExpensesLedger_aud = selectMonthlyExpensesLedger(inputs);
out.selectors.mortgageRepayment_monthly_aud = selectMortgageRepayment(inputs);
out.selectors.otherDebtRepayment_monthly_aud = selectOtherDebtRepayment(inputs);
out.selectors.settledIpDebtService_monthly_aud = selectSettledIpDebtService(inputs);
out.selectors.monthlyDebtService_aud = selectMonthlyDebtService(inputs);
out.selectors.expensesIncludesDebt = selectExpensesIncludesDebt(inputs);
out.selectors.monthlySurplus_aud = selectMonthlySurplus(inputs);
out.selectors.cashToday_aud = selectCashToday(inputs);
out.selectors.dataAvailability = evaluateDataAvailability(inputs);

// Independent recomputation
const num = (v: any) => Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0;

const recompute: any = {};
recompute.totalAssets =
  num(snapshot.ppor) +
  normalisedProperties.reduce((s: number, p: any) => s + num(p.current_value), 0) +
  num(snapshot.cash) + num(snapshot.savings_cash) + num(snapshot.emergency_cash) +
  num(snapshot.offset_balance) + num(snapshot.super_balance) +
  num(snapshot.stocks) + num(snapshot.crypto) +
  num(snapshot.cars) + num(snapshot.iran_property) + num(snapshot.other_assets);

recompute.totalLiabilities =
  num(snapshot.mortgage) + num(snapshot.other_debts) +
  normalisedProperties.reduce((s: number, p: any) => s + num(p.loan_amount), 0);

recompute.netWorth = recompute.totalAssets - recompute.totalLiabilities;

// Monthly income subfield sum
recompute.monthlyIncome_subfields =
  num(snapshot.roham_monthly_income) + num(snapshot.fara_monthly_income) +
  num(snapshot.rental_income_total) + num(snapshot.other_income);

// 6mo trailing expenses average
const today6 = new Date("2026-05-11");
const cutoff6 = new Date(today6); cutoff6.setMonth(cutoff6.getMonth() - 6);
const cutoff6Iso = cutoff6.toISOString().split("T")[0];
let exp6Sum = 0;
for (const r of expenses) if ((r.date ?? "") >= cutoff6Iso) exp6Sum += num(r.amount);
recompute.monthlyExpenses_6m_avg = exp6Sum / 6;

// 6mo trailing income average
let inc6Sum = 0;
for (const r of incomeRecords) if ((r.date ?? "") >= cutoff6Iso) inc6Sum += num(r.amount);
recompute.monthlyIncome_6m_avg = inc6Sum / 6;

// Recurring bills monthly equivalent
const billMonthly = (b: any) => {
  const a = num(b.amount); const f = (b.frequency ?? "").toLowerCase();
  if (f.includes("week")) return a * 52 / 12;
  if (f.includes("fortnight") || f.includes("biweek")) return a * 26 / 12;
  if (f.includes("month")) return a;
  if (f.includes("quarter")) return a / 3;
  if (f.includes("annual") || f.includes("year")) return a / 12;
  return a;
};
recompute.recurring_bills_monthly_equiv = recurring.filter((b: any) => b.active).reduce((s: number, b: any) => s + billMonthly(b), 0);

// LVR
recompute.ppor_lvr_pct = 100 * num(snapshot.mortgage) / num(snapshot.ppor);
recompute.ppor_net_lvr_pct = 100 * Math.max(0, num(snapshot.mortgage) - num(snapshot.offset_balance)) / num(snapshot.ppor);

// Tax: Roham
function auTax(salary: number, year: "2025-26" = "2025-26"): number {
  // AU 2025-26 brackets (resident, excludes Medicare levy)
  let tax = 0;
  if (salary <= 18200) tax = 0;
  else if (salary <= 45000) tax = (salary - 18200) * 0.16;
  else if (salary <= 135000) tax = 4288 + (salary - 45000) * 0.30;
  else if (salary <= 190000) tax = 31288 + (salary - 135000) * 0.37;
  else tax = 51638 + (salary - 190000) * 0.45;
  // Medicare levy 2%
  const medicare = salary > 27222 ? salary * 0.02 : 0;
  return tax + medicare;
}
recompute.tax_roham_annual_2025_26 = auTax(num(tax?.roham_salary ?? snapshot.roham_super_salary));
recompute.tax_fara_annual_2025_26  = auTax(num(tax?.fara_salary  ?? snapshot.fara_super_salary));
recompute.tax_combined_annual_2025_26 = recompute.tax_roham_annual_2025_26 + recompute.tax_fara_annual_2025_26;

// Super employer contributions for one year
recompute.roham_super_annual_contrib =
  num(snapshot.roham_super_salary) * num(snapshot.roham_employer_contrib) / 100;
recompute.fara_super_annual_contrib =
  num(snapshot.fara_super_salary) * num(snapshot.fara_employer_contrib) / 100;

// Mortgage P&I (independent)
{
  const P = num(snapshot.mortgage);
  const r = 6.5 / 100 / 12;
  const n = 30 * 12;
  recompute.mortgage_pi_independent = (P * r * Math.pow(1+r,n)) / (Math.pow(1+r,n) - 1);
}

out.independent_recompute = recompute;

// Variances
out.variances = {
  monthly_income__selector_vs_subfields:
    out.selectors.monthlyIncome_aud - recompute.monthlyIncome_subfields,
  monthly_income__selector_vs_6m_ledger:
    out.selectors.monthlyIncome_aud - recompute.monthlyIncome_6m_avg,
  monthly_expenses__selector_vs_6m_ledger:
    out.selectors.monthlyExpensesLedger_aud - recompute.monthlyExpenses_6m_avg,
  mortgage_pi__selector_vs_independent:
    out.selectors.mortgageRepayment_monthly_aud - recompute.mortgage_pi_independent,
  // Tax profile vs super salary
  roham_salary_mismatch:
    (tax?.roham_salary ?? 0) - num(snapshot.roham_super_salary),
  fara_salary_mismatch:
    (tax?.fara_salary ?? 0) - num(snapshot.fara_super_salary),
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`Wrote ${OUT}`);
console.log(JSON.stringify(out.selectors, null, 2));
console.log("Variances:", JSON.stringify(out.variances, null, 2));

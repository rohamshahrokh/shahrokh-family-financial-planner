/**
 * test-income-classification.ts — Income engine refactor regression suite.
 *
 * Covers:
 *   1. Default classification by type (salary recurring, bonus one-off, etc.)
 *   2. Explicit override of behaviour / forecast_treatment wins.
 *   3. Legacy "source" strings map onto the canonical IncomeType.
 *   4. aggregateIncome — recurringMonthlyIncome excludes one-off events.
 *   5. The CRITICAL invariant: a one-off $80k asset sale increases
 *      oneOffIncomeLast12Months but leaves recurringMonthlyIncome UNCHANGED.
 *   6. selectMonthlyIncome routes through the classifier (Forecast / MC input).
 *   7. selectCanonicalIncome.source still resolves to "ledger" when recurring
 *      ledger income is present, and falls back to snapshot when only one-off
 *      records exist.
 *   8. Audit trace surfaces Included / Excluded record lists.
 */

import {
  classifyIncomeRecord,
  aggregateIncome,
} from "../client/src/lib/incomeClassificationEngine";
import {
  selectMonthlyIncome,
  selectCanonicalIncome,
  selectIncomeAggregate,
  type DashboardInputs,
} from "../client/src/lib/dashboardDataContract";
import { buildIncomeClassificationTrace } from "../client/src/lib/auditMode/engineTraces/incomeClassificationTraces";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const TODAY = "2026-05-23";

function emptyInputs(): DashboardInputs {
  return {
    snapshot: {
      monthly_income: 0,
      roham_monthly_income: 0,
      fara_monthly_income: 0,
      rental_income_total: 0,
      other_income: 0,
    },
    properties: [],
    stocks: [],
    cryptos: [],
    holdingsRaw: [],
    incomeRecords: [],
    expenses: [],
    todayIso: TODAY,
  };
}

// ─── 1. Default classification by type ────────────────────────────────────────
console.log("\n[1] Default classification by income type");
{
  const cases: Array<[any, string, "recurring" | "one_off", "include" | "exclude"]> = [
    [{ income_type: "employment_salary",  amount: 15000, frequency: "Monthly" }, "salary",       "recurring", "include"],
    [{ income_type: "employment_bonus",   amount: 20000, frequency: "One-off" }, "bonus",        "one_off",   "exclude"],
    [{ income_type: "rental_income",      amount: 3000,  frequency: "Monthly" }, "rental",       "recurring", "include"],
    [{ income_type: "dividend_income",    amount: 1500,  frequency: "Quarterly" }, "dividend",   "recurring", "include"],
    [{ income_type: "interest_income",    amount: 200,   frequency: "Monthly" }, "interest",     "recurring", "include"],
    [{ income_type: "tax_refund",         amount: 5000,  frequency: "One-off" }, "tax refund",   "one_off",   "exclude"],
    [{ income_type: "business_income",    amount: 4000,  frequency: "Monthly" }, "business",     "recurring", "include"],
    [{ income_type: "asset_sale",         amount: 80000, frequency: "One-off" }, "asset sale",   "one_off",   "exclude"],
    [{ income_type: "gift_inheritance",   amount: 50000, frequency: "One-off" }, "gift",         "one_off",   "exclude"],
    [{ income_type: "other",              amount: 1000,  frequency: "Monthly" }, "other default", "one_off",  "exclude"],
  ];
  for (const [rec, name, behaviour, treatment] of cases) {
    const c = classifyIncomeRecord(rec);
    check(`${name} → behaviour=${behaviour}`, c.behaviour === behaviour, `got ${c.behaviour}`);
    check(`${name} → treatment=${treatment}`, c.forecastTreatment === treatment, `got ${c.forecastTreatment}`);
  }
}

// ─── 2. Explicit overrides ────────────────────────────────────────────────────
console.log("\n[2] Explicit override wins");
{
  const c1 = classifyIncomeRecord({ income_type: "other", behaviour: "recurring", amount: 500, frequency: "Monthly" });
  check("other + behaviour=recurring → recurring", c1.behaviour === "recurring");
  check("other + behaviour=recurring → include",   c1.forecastTreatment === "include");

  const c2 = classifyIncomeRecord({ income_type: "employment_salary", forecast_treatment: "exclude", amount: 8000, frequency: "Monthly" });
  check("salary + forecast_treatment=exclude → exclude", c2.forecastTreatment === "exclude");
}

// ─── 3. Legacy source string mapping ──────────────────────────────────────────
console.log("\n[3] Legacy 'source' strings map to canonical IncomeType");
{
  const c1 = classifyIncomeRecord({ source: "Salary",       amount: 10000, frequency: "Monthly" });
  check("'Salary' → employment_salary", c1.incomeType === "employment_salary");
  const c2 = classifyIncomeRecord({ source: "Bonus",        amount: 5000,  frequency: "One-off" });
  check("'Bonus' → employment_bonus",   c2.incomeType === "employment_bonus");
  const c3 = classifyIncomeRecord({ source: "Side Income",  amount: 1000,  frequency: "Monthly" });
  check("'Side Income' → other",        c3.incomeType === "other");
  const c4 = classifyIncomeRecord({ source: "Dividends",    amount: 800,   frequency: "Quarterly" });
  check("'Dividends' → dividend_income", c4.incomeType === "dividend_income");
}

// ─── 4. aggregateIncome respects classification ──────────────────────────────
console.log("\n[4] aggregateIncome — recurring vs one-off");
{
  const records = [
    { date: "2026-05-01", amount: 15000, income_type: "employment_salary", frequency: "Monthly" },
    { date: "2026-04-01", amount: 15000, income_type: "employment_salary", frequency: "Monthly" },
    { date: "2026-03-01", amount: 15000, income_type: "employment_salary", frequency: "Monthly" },
    { date: "2026-02-15", amount: 80000, income_type: "asset_sale",         frequency: "One-off" },
    { date: "2026-04-20", amount: 5000,  income_type: "tax_refund",         frequency: "One-off" },
  ];
  const agg = aggregateIncome(records, TODAY);
  check("recurringMonthlyIncome = 15000", agg.recurringMonthlyIncome === 15000, `got ${agg.recurringMonthlyIncome}`);
  check("oneOffIncomeLast12Months = 85000", agg.oneOffIncomeLast12Months === 85000, `got ${agg.oneOffIncomeLast12Months}`);
  check("totalHistoricalIncome = 130000", agg.totalHistoricalIncome === 130000, `got ${agg.totalHistoricalIncome}`);
  check("recurringRecords count = 3", agg.recurringRecords.length === 3);
  check("excludedOneOffEvents count = 2", agg.excludedOneOffEvents.length === 2);
  check("engineInputs.forecastIncomeUsed = 15000",       agg.engineInputs.forecastIncomeUsed === 15000);
  check("engineInputs.monteCarloIncomeUsed = 15000",     agg.engineInputs.monteCarloIncomeUsed === 15000);
  check("engineInputs.serviceabilityIncomeUsed = 15000", agg.engineInputs.serviceabilityIncomeUsed === 15000);
}

// ─── 5. CRITICAL — $80k asset sale invariant ──────────────────────────────────
console.log("\n[5] CRITICAL: $80k one-off asset sale does NOT inflate recurring income");
{
  const baseline = aggregateIncome(
    [
      { date: "2026-05-01", amount: 15000, income_type: "employment_salary", frequency: "Monthly" },
      { date: "2026-04-01", amount: 15000, income_type: "employment_salary", frequency: "Monthly" },
      { date: "2026-03-01", amount: 15000, income_type: "employment_salary", frequency: "Monthly" },
    ],
    TODAY,
  );

  const withCryptoSale = aggregateIncome(
    [
      { date: "2026-05-01", amount: 15000, income_type: "employment_salary", frequency: "Monthly" },
      { date: "2026-04-01", amount: 15000, income_type: "employment_salary", frequency: "Monthly" },
      { date: "2026-03-01", amount: 15000, income_type: "employment_salary", frequency: "Monthly" },
      // The bug: previously this $80k crypto sale would have added ~$13,333/mo
      // to monthly income via the trailing-6mo average.
      { date: "2026-02-15", amount: 80000, income_type: "asset_sale",         frequency: "One-off" },
    ],
    TODAY,
  );

  check("baseline recurring = $15,000/mo",
    baseline.recurringMonthlyIncome === 15000,
    `got ${baseline.recurringMonthlyIncome}`);
  check("after $80k sale, recurring STILL = $15,000/mo (unchanged)",
    withCryptoSale.recurringMonthlyIncome === baseline.recurringMonthlyIncome,
    `got ${withCryptoSale.recurringMonthlyIncome}`);
  check("$80k sale is reflected in oneOffIncomeLast12Months",
    withCryptoSale.oneOffIncomeLast12Months === 80000,
    `got ${withCryptoSale.oneOffIncomeLast12Months}`);
  check("forecastIncomeUsed unchanged after $80k sale",
    withCryptoSale.engineInputs.forecastIncomeUsed === baseline.engineInputs.forecastIncomeUsed);
  check("monteCarloIncomeUsed unchanged after $80k sale",
    withCryptoSale.engineInputs.monteCarloIncomeUsed === baseline.engineInputs.monteCarloIncomeUsed);
  check("serviceabilityIncomeUsed unchanged after $80k sale",
    withCryptoSale.engineInputs.serviceabilityIncomeUsed === baseline.engineInputs.serviceabilityIncomeUsed);
}

// ─── 6. selectMonthlyIncome routes through the classifier ─────────────────────
console.log("\n[6] selectMonthlyIncome — Dashboard / Forecast / MC input source");
{
  const inputs = emptyInputs();
  inputs.incomeRecords = [
    { date: "2026-05-01", amount: 15000, income_type: "employment_salary", frequency: "Monthly" },
    { date: "2026-04-01", amount: 15000, income_type: "employment_salary", frequency: "Monthly" },
    { date: "2026-03-01", amount: 15000, income_type: "employment_salary", frequency: "Monthly" },
    { date: "2026-02-15", amount: 80000, income_type: "asset_sale",         frequency: "One-off" },
  ];
  const monthly = selectMonthlyIncome(inputs);
  check("selectMonthlyIncome ignores $80k asset sale", monthly === 15000, `got ${monthly}`);

  const canonical = selectCanonicalIncome(inputs);
  check("selectCanonicalIncome.source = 'ledger'", canonical.source === "ledger", `got ${canonical.source}`);
  check("selectCanonicalIncome.monthlyGross = 15000", canonical.monthlyGross === 15000, `got ${canonical.monthlyGross}`);

  const agg = selectIncomeAggregate(inputs);
  check("selectIncomeAggregate.recurringMonthlyIncome = 15000",   agg.recurringMonthlyIncome === 15000);
  check("selectIncomeAggregate.oneOffIncomeLast12Months = 80000", agg.oneOffIncomeLast12Months === 80000);
}

// ─── 7. Snapshot fallback when only one-off records present ───────────────────
console.log("\n[7] One-off-only ledger → fallback to snapshot sub-fields");
{
  const inputs = emptyInputs();
  inputs.snapshot.roham_monthly_income = 12000;
  inputs.snapshot.fara_monthly_income  = 8000;
  inputs.incomeRecords = [
    { date: "2026-02-15", amount: 80000, income_type: "asset_sale", frequency: "One-off" },
  ];
  const canonical = selectCanonicalIncome(inputs);
  check("source = snapshot_sub_fields when only one-off in ledger",
    canonical.source === "snapshot_sub_fields", `got ${canonical.source}`);
  check("monthlyGross = 20000 from sub-fields",
    canonical.monthlyGross === 20000, `got ${canonical.monthlyGross}`);
}

// ─── 8. Audit trace surfaces included / excluded records ──────────────────────
console.log("\n[8] Audit trace — included / excluded record lists");
{
  const agg = aggregateIncome(
    [
      { date: "2026-05-01", amount: 15000, income_type: "employment_salary", frequency: "Monthly", member: "Roham" },
      { date: "2026-02-15", amount: 80000, income_type: "asset_sale",         frequency: "One-off", member: "Family" },
    ],
    TODAY,
  );
  const trace = buildIncomeClassificationTrace({ aggregate: agg, asOf: TODAY });
  check("trace.id = 'dashboard:income-engine'", trace.id === "dashboard:income-engine");
  check("trace.finalValue is the recurring monthly value", String(trace.finalValue).includes("15,000"));
  check("included list has recurring records",  trace.included.some(r => /Employment Salary/i.test(r.label)));
  check("excluded list has one-off asset sale", trace.excluded.some(r => /Asset Sale/i.test(r.label)));
  check("trace lists forecastIncomeUsed = $15,000",
    trace.inputs.some(i => i.label === "Forecast Income Used" && String(i.value).includes("15,000")));
  check("trace lists monteCarloIncomeUsed = $15,000",
    trace.inputs.some(i => i.label === "Monte Carlo Income Used" && String(i.value).includes("15,000")));
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\ntest-income-classification: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

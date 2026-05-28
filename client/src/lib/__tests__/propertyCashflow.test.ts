/**
 * propertyCashflow.test.ts — Sprint 20 PR-F2.
 *
 * Verifies the investment-property cashflow components — rent, interest,
 * management fee, maintenance, council/insurance — and the PPOR cashflow.
 */

import {
  classifyProperty,
  investmentCashflow,
  pporCashflow,
  MAINTENANCE_RATE_OF_VALUE,
  WEEKS_PER_YEAR,
} from "../property";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const TODAY = new Date("2026-05-28T00:00:00Z");

console.log("\n── Investment cashflow components — settled IP ──");
{
  // A settled investment property modelled after the demo IP1 fixture.
  const ip = classifyProperty({
    id: 99,
    type: "investment",
    purchase_date: "2024-01-01", // past so it's settled
    current_value: 750_000,
    purchase_price: 750_000,
    loan_amount: 600_000,
    interest_rate: 6.5,
    loan_type: "Interest Only",
    weekly_rent: 650,
    vacancy_rate: 3,
    management_fee: 8.5,
    council_rates: 2_000,
    insurance: 2_000,
    maintenance: 4_000,
  }, TODAY);

  const cf = investmentCashflow(ip);
  const grossExpected = 650 * WEEKS_PER_YEAR; // 33,800
  check(
    `grossRentAnnual = 650 × ${WEEKS_PER_YEAR} = ${grossExpected}`,
    cf.grossRentAnnual === grossExpected,
  );
  // 3% vacancy → effective = 33,800 × 0.97 = 32,786
  const effExpected = grossExpected * 0.97;
  check(
    `effectiveRentAnnual after 3% vacancy = ${effExpected.toFixed(2)}`,
    Math.abs(cf.effectiveRentAnnual - effExpected) < 1e-6,
  );
  // Interest = 600,000 × 0.065 = 39,000
  check(
    `interestAnnual = 600,000 × 6.5% = 39,000`,
    cf.interestAnnual === 39_000,
  );
  // Management fee = effective × 8.5% = 2,786.81
  const mgmtExpected = effExpected * 0.085;
  check(
    `managementFeeAnnual = effective × 8.5% = ${mgmtExpected.toFixed(2)}`,
    Math.abs(cf.managementFeeAnnual - mgmtExpected) < 1e-6,
  );
  // Maintenance = 750,000 × 1% = 7,500
  check(
    `maintenanceAnnual = 750,000 × 1% = 7,500`,
    cf.maintenanceAnnual === 750_000 * MAINTENANCE_RATE_OF_VALUE,
  );
  // Council + insurance + maintenance fixed = 2,000 + 2,000 + 4,000 = 8,000
  check(
    `councilInsuranceAnnual fixed = 8,000`,
    cf.councilInsuranceAnnual === 8_000,
  );
  // Net = effective − interest − mgmt − maintRate − fixed
  const netExpected = effExpected - 39_000 - mgmtExpected - 7_500 - 8_000;
  check(
    `netCashflowAnnual deterministic (got ${cf.netCashflowAnnual.toFixed(2)}, expected ${netExpected.toFixed(2)})`,
    Math.abs(cf.netCashflowAnnual - netExpected) < 1e-6,
  );
  check(
    `netCashflowMonthly = annual / 12`,
    Math.abs(cf.netCashflowMonthly - netExpected / 12) < 1e-6,
  );
  check(
    `negativelyGeared flag matches sign`,
    cf.negativelyGeared === (netExpected < 0),
  );
}

console.log("\n── PPOR cashflow (no rent) ──");
{
  const ppor = classifyProperty({
    id: 1,
    type: "ppor",
    purchase_date: "2019-06-15",
    current_value: 1_200_000,
    loan_amount: 850_000,
    interest_rate: 5.82,
    council_rates: 2_200,
    insurance: 2_400,
    maintenance: 3_000,
  }, TODAY);

  const cf = pporCashflow(ppor);
  check("PPOR interestAnnual = 850,000 × 5.82%", Math.abs(cf.interestAnnual - 850_000 * 0.0582) < 1e-6);
  check("PPOR maintenanceAnnual = 1% of 1,200,000 = 12,000", cf.maintenanceAnnual === 12_000);
  check("PPOR councilInsurance fixed = 7,600", cf.councilInsuranceAnnual === 2_200 + 2_400 + 3_000);
  check("PPOR holding cost total positive", cf.totalHoldingCostAnnual > 0);
  check("PPOR monthly = annual / 12", Math.abs(cf.totalHoldingCostMonthly - cf.totalHoldingCostAnnual / 12) < 1e-6);
}

console.log("\n── Investment cashflow on a PPOR returns zeros ──");
{
  const ppor = classifyProperty({ id: 1, type: "ppor", weekly_rent: 1000 }, TODAY);
  const cf = investmentCashflow(ppor);
  check("PPOR.investmentCashflow.grossRentAnnual = 0", cf.grossRentAnnual === 0);
  check("PPOR.investmentCashflow.netCashflowAnnual = 0", cf.netCashflowAnnual === 0);
}

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);

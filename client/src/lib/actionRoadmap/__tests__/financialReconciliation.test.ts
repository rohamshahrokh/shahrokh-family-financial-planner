/**
 * financialReconciliation.test.ts — Sprint 29 §3.5.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/financialReconciliation.test.ts
 */
import type { PortfolioState, PropertyState } from "../../scenarioV2/types";
import { reconcileTerminalNetWorth } from "../financialReconciliation";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function prop(id: string, marketValue: number, loanBalance: number, offsetBalance = 0, inLedger?: boolean): PropertyState {
  return {
    id,
    marketValue,
    loanBalance,
    rate: 0.06,
    monthlyRepayment: 0,
    monthlyRent: 0,
    monthlyCosts: 0,
    offsetBalance,
    ...(inLedger != null ? { inLedger } : {}),
  };
}

function makeState(over: Partial<PortfolioState> = {}): PortfolioState {
  return {
    month: "2031-01",
    cash: 0,
    etfBalance: 0,
    cryptoBalance: 0,
    superRoham: 0,
    superFara: 0,
    properties: [],
    cars: 0,
    iranProperty: 0,
    otherAssets: 0,
    otherDebts: 0,
    fyTaxPaid: 0,
    ttmIncome: 0,
    ttmExpenses: 0,
    ...over,
  };
}

console.log("\nfinancialReconciliation — gate behaviour");

// 1. INSUFFICIENT_DATA on null finalState
const rNullState = reconcileTerminalNetWorth({ finalState: null, fanP50AtHorizon: 2_000_000 });
check("null finalState → INSUFFICIENT_DATA", rNullState.status === "INSUFFICIENT_DATA");
check("null finalState → message set", rNullState.message === "No engine final state available.");
check("null finalState → tolerance still echoed", rNullState.tolerancePct === 0.005);

// 2. INSUFFICIENT_DATA on null fan
const rNullFan = reconcileTerminalNetWorth({ finalState: makeState(), fanP50AtHorizon: null });
check("null fan → INSUFFICIENT_DATA", rNullFan.status === "INSUFFICIENT_DATA");
check("null fan → message set", rNullFan.message === "No MC P50 terminal value available.");

// 3. PASS within 0.5% tolerance
const state3 = makeState({
  properties: [
    prop("ppor", 1_200_000, 400_000, 50_000, true),   // 850k ppor
    prop("ip-1", 600_000, 450_000, 0, false),         // 150k ip
  ],
  etfBalance: 200_000,
  superRoham: 250_000,
  superFara: 200_000,
  cash: 75_000,
  cars: 30_000,
  iranProperty: 100_000,
  otherAssets: 0,
  otherDebts: 20_000,
});
// Sum = 850 + 150 + 200 + 450 + 75 + 0 + 130 - 20 = 1,835,000
const r3 = reconcileTerminalNetWorth({ finalState: state3, fanP50AtHorizon: 1_835_000 });
check("matched within 0.5% → PASS", r3.status === "PASS");
check("componentsSum computed", r3.componentsSum === 1_835_000);
check("breakdown.ppor = 850000", r3.breakdown.ppor === 850_000);
check("breakdown.investmentProperty = 150000", r3.breakdown.investmentProperty === 150_000);
check("breakdown.super = roham + fara", r3.breakdown.super === 450_000);
check("breakdown.otherAssets = cars + iran", r3.breakdown.otherAssets === 130_000);
check("breakdown.otherDebts subtracted in sum", r3.componentsSum === r3.breakdown.ppor + r3.breakdown.investmentProperty + r3.breakdown.etf + r3.breakdown.super + r3.breakdown.cash + r3.breakdown.crypto + r3.breakdown.otherAssets - r3.breakdown.otherDebts);

const r3b = reconcileTerminalNetWorth({ finalState: state3, fanP50AtHorizon: 1_835_000 * 1.004 });
check("0.4% drift → PASS", r3b.status === "PASS");

// 4. FAIL beyond 0.5% tolerance
const r4 = reconcileTerminalNetWorth({ finalState: state3, fanP50AtHorizon: 1_835_000 * 1.05 });
check("5% drift → FAIL", r4.status === "FAIL");
check("FAIL → message populated", r4.message != null && r4.message.length > 0);
check("FAIL → deltaPct reflects drift", r4.deltaPct > 0.04 && r4.deltaPct < 0.06);

// 5. PPOR vs IP classification by inLedger flag
const stateMulti = makeState({
  properties: [
    prop("p-a", 800_000, 200_000, 0, true),    // PPOR (inLedger true)
    prop("p-b", 500_000, 100_000, 0, false),   // IP
    prop("p-c", 700_000, 300_000, 0, false),   // IP
  ],
});
const rMulti = reconcileTerminalNetWorth({ finalState: stateMulti, fanP50AtHorizon: 1_400_000 });
check("multi-IP classification: single PPOR", rMulti.breakdown.ppor === 600_000);
check("multi-IP classification: IP equity summed", rMulti.breakdown.investmentProperty === (400_000 + 400_000));

// 6. Property with no inLedger flag treated as IP (engine-faithful default)
const stateNoFlag = makeState({
  properties: [
    prop("p-x", 500_000, 100_000, 0), // no inLedger → IP
  ],
});
const rNoFlag = reconcileTerminalNetWorth({ finalState: stateNoFlag, fanP50AtHorizon: 400_000 });
check("property with no inLedger → IP bucket", rNoFlag.breakdown.investmentProperty === 400_000);
check("property with no inLedger → ppor bucket empty", rNoFlag.breakdown.ppor === 0);

// 7. otherDebts subtracted from componentsSum
const stateDebt = makeState({ cash: 500_000, otherDebts: 100_000 });
const rDebt = reconcileTerminalNetWorth({ finalState: stateDebt, fanP50AtHorizon: 400_000 });
check("otherDebts subtracted from componentsSum", rDebt.componentsSum === 400_000);

// 8. Breakdown completeness — every category present in result
const rComplete = reconcileTerminalNetWorth({ finalState: state3, fanP50AtHorizon: 1_835_000 });
const breakdownKeys = Object.keys(rComplete.breakdown).sort();
const expectedKeys = ["ppor", "investmentProperty", "etf", "super", "cash", "crypto", "otherAssets", "otherDebts"].sort();
check("breakdown has all 8 categories", JSON.stringify(breakdownKeys) === JSON.stringify(expectedKeys));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

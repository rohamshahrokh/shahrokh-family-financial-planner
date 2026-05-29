/**
 * netWorthAttribution.test.ts — Sprint 28B.
 *
 * Honesty + reconciliation tests for `selectNetWorthAttribution`. The
 * selector must:
 *   1. Return null when finalState is null.
 *   2. Sum PPOR equity (id === "ppor") and IP equity (all other properties)
 *      separately, applying offset balance the same way the dashboard does.
 *   3. Merge cars + Iran property + other assets net of other debts into
 *      a single "Other" row; render crypto only when > 0.
 *   4. Compute shares that sum to ~1.0 (when total != 0).
 *   5. Mark withinTolerance true when |sum - p50| / |p50| ≤ 1%.
 *   6. Mark withinTolerance false when the engine sum drifts from the fan p50.
 *   7. Echo source = "scenarioV2.medianFinalState" for audit.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/netWorthAttribution.test.ts
 */
import type { PortfolioState, PropertyState } from "../../scenarioV2/types";
import { selectNetWorthAttribution } from "../netWorthAttribution";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function prop(id: string, marketValue: number, loanBalance: number, offsetBalance = 0): PropertyState {
  return {
    id,
    marketValue,
    loanBalance,
    rate: 0.06,
    monthlyRepayment: 0,
    monthlyRent: 0,
    monthlyCosts: 0,
    offsetBalance,
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

console.log("\nnetWorthAttribution — sums and reconciliation");

// 1. Null finalState → null result
const nullResult = selectNetWorthAttribution({ finalState: null, fanP50AtHorizon: 2_000_000 });
check("null finalState → null result", nullResult === null);

// 2. Single PPOR + IP + ETF + Super + Cash split correctly
const s2 = makeState({
  properties: [
    // Sprint 30A.3: offsetBalance no longer added to equity (engine alignment).
    prop("ppor", 1_200_000, 400_000, 50_000),     // ppor equity = 800k (mv-loan)
    prop("ip-1", 600_000, 450_000, 0),             // ip equity = 150k
    prop("ip-2", 700_000, 500_000, 25_000),        // ip equity = 200k (mv-loan)
  ],
  etfBalance: 200_000,
  superRoham: 250_000,
  superFara: 200_000,
  cash: 75_000,
  cryptoBalance: 0,
  cars: 30_000,
  iranProperty: 100_000,
  otherAssets: 0,
  otherDebts: 20_000,
});
const r2 = selectNetWorthAttribution({ finalState: s2, fanP50AtHorizon: 2_060_000 });
check("ppor equity = marketValue - loan (no offset)", r2!.components.find(c => c.category === "ppor")?.value === 800_000);
check("ip equity sums both IPs (no offset)", r2!.components.find(c => c.category === "investment_property")?.value === 350_000);
check("etf component", r2!.components.find(c => c.category === "etf")?.value === 200_000);
check("super sums roham + fara", r2!.components.find(c => c.category === "super")?.value === 450_000);
check("cash component", r2!.components.find(c => c.category === "cash")?.value === 75_000);
check("other = cars + iran + otherAssets - otherDebts", r2!.components.find(c => c.category === "other")?.value === 110_000);

// 3. Crypto > 0 → its own row; crypto = 0 → no row
check("crypto = 0 → no crypto row", !r2!.components.some(c => c.category === "crypto"));
const sCrypto = makeState({ cryptoBalance: 50_000, cash: 10_000 });
const rCrypto = selectNetWorthAttribution({ finalState: sCrypto, fanP50AtHorizon: 60_000 });
check("crypto > 0 → crypto row present", rCrypto!.components.some(c => c.category === "crypto" && c.value === 50_000));

// 4. Shares sum to ~1.0 when total != 0
const sharesSum = r2!.components.reduce((s, c) => s + c.share, 0);
check("shares sum to ~1.0", Math.abs(sharesSum - 1) < 1e-9, `sum=${sharesSum}`);

// 5. Reconciliation passes when sum matches p50 within 1%
const total2 = r2!.total;
const r2Pass = selectNetWorthAttribution({ finalState: s2, fanP50AtHorizon: total2 * 1.005 });
check("0.5% drift → within tolerance", r2Pass!.reconciliation.withinTolerance === true);

// 6. Reconciliation fails when sum drifts > 1% from p50
const r2Fail = selectNetWorthAttribution({ finalState: s2, fanP50AtHorizon: total2 * 1.05 });
check("5% drift → NOT within tolerance", r2Fail!.reconciliation.withinTolerance === false);
check("reconciliation reports diffPct > 0.01 on drift", r2Fail!.reconciliation.diffPct > 0.01);

// 7. Null fan p50 → still returns attribution, reconciliation is trivially in-tolerance
const rNoFan = selectNetWorthAttribution({ finalState: s2, fanP50AtHorizon: null });
check("null fan p50 → p50FromFan null", rNoFan!.reconciliation.p50FromFan === null);
check("null fan p50 → withinTolerance true (nothing to reconcile against)", rNoFan!.reconciliation.withinTolerance === true);

// 8. Source is always set for audit
check("source tag set", r2!.source === "scenarioV2.medianFinalState");

// 9. Empty state → empty components + zero total
const sEmpty = makeState({});
const rEmpty = selectNetWorthAttribution({ finalState: sEmpty, fanP50AtHorizon: 0 });
check("empty state → empty components", rEmpty!.components.length === 0);
check("empty state → total 0", rEmpty!.total === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

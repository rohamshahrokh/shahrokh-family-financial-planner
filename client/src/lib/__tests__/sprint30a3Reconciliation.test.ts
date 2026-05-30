/**
 * sprint30a3Reconciliation.test.ts — Sprint 30A.3.
 *
 * Locks down two reconciliation invariants the consistency audit
 * (SPRINT30A2_CONSISTENCY_AUDIT.md) flagged as gate failures:
 *
 *   1. CURRENT Net Worth: `monteCarloCanonical.buildCanonicalMonteCarloInput`
 *      reports `engineStartingNetWorth === canonical.netWorth` to the dollar,
 *      and `reconciliation.status === "PASS"` with `diff === 0`. Previously
 *      the diagnostic falsely subtracted a 20% cars haircut and excluded
 *      `other_assets` — both of which the real engine (scenarioV2/basePlan
 *      + scenarioV2/tick.ts:netWorth) does NOT do (audit fix P1.1).
 *
 *   2. TERMINAL Net Worth: the breakdown produced by
 *      `actionRoadmap/financialReconciliation.reconcileTerminalNetWorth`
 *      sums (PPOR + IP + ETF + super + cash + crypto + cars + iran +
 *      otherAssets - otherDebts) using `propertyEquity = marketValue -
 *      loanBalance` — exactly matching `scenarioV2/tick.ts:netWorth`.
 *      Previously the diagnostic added `offsetBalance` to property equity,
 *      which the engine does not, drifting the recon ~1% above MC P50.
 *
 * No engine math is modified — the diagnostics are realigned to the
 * existing engine behaviour. This file proves both invariants hold for
 * the demo persona AND for the synthetic case that drove the prior
 * failure.
 */

import { DEMO_SNAPSHOT, getDemoDataset } from "../demoData";
import { buildCanonicalMonteCarloInput } from "../monteCarloCanonical";
import { reconcileTerminalNetWorth } from "../actionRoadmap/financialReconciliation";
import { selectCanonicalNetWorth } from "../dashboardDataContract";
import { netWorth } from "../scenarioV2/tick";
import type { PortfolioState, PropertyState } from "../scenarioV2/types";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  }
}

console.log("\nsprint30a3Reconciliation — current + terminal NW invariants");

// ─── Block 1: Current NW reconciliation (Blocker 1) ──────────────────────────

const demo = getDemoDataset();
const ledger = {
  snapshot: demo.snapshot,
  properties: demo.properties,
  stocks: demo.stocks,
  cryptos: demo.cryptos,
};

const canonical = selectCanonicalNetWorth(ledger as any);
const { reconciliation } = buildCanonicalMonteCarloInput(ledger, {
  yearlyAssumptions: [],
});

check(
  "Block1: canonical NW matches Python-verified demo total ($758,000)",
  canonical.netWorth === 758_000,
  `got ${canonical.netWorth}`,
);

check(
  "Block1: engineStartingNetWorth === canonical.netWorth (to the dollar)",
  reconciliation.engineStartingNetWorth === reconciliation.dashboardNetWorth,
  `engine=${reconciliation.engineStartingNetWorth} dashboard=${reconciliation.dashboardNetWorth}`,
);

check(
  "Block1: reconciliation.diff === 0",
  reconciliation.diff === 0,
  `diff=${reconciliation.diff}`,
);

check(
  "Block1: reconciliation.status === \"PASS\"",
  reconciliation.status === "PASS",
  `status=${reconciliation.status}`,
);

check(
  "Block1: components.cars at 100% (no 20% haircut)",
  reconciliation.components.cars === DEMO_SNAPSHOT.cars,
  `components.cars=${reconciliation.components.cars} snapshot.cars=${DEMO_SNAPSHOT.cars}`,
);

check(
  "Block1: components.other_assets included (not silently dropped)",
  reconciliation.components.other_assets === DEMO_SNAPSHOT.other_assets,
  `components.other_assets=${reconciliation.components.other_assets} snapshot.other_assets=${DEMO_SNAPSHOT.other_assets}`,
);

// Variance proof: with the fix in place, variance is exactly 0.00%.
const currentVariancePct =
  Math.abs(reconciliation.engineStartingNetWorth - reconciliation.dashboardNetWorth) /
  Math.max(reconciliation.dashboardNetWorth, 1);
check(
  "Block1: current NW variance is <= 0.5% (gate)",
  currentVariancePct <= 0.005,
  `variance=${(currentVariancePct * 100).toFixed(4)}%`,
);

// ─── Block 2: Terminal NW reconciliation (Blocker 2) ─────────────────────────

// Build a synthetic terminal `PortfolioState` that exercises offset balances
// (the previously-drifting field) plus the full asset/liability spread the
// reconciliation evaluates. Then confirm that reconcileTerminalNetWorth +
// scenarioV2/tick.netWorth agree to the dollar, and that a fan P50 equal to
// netWorth(state) yields status === "PASS".
function prop(
  id: string,
  marketValue: number,
  loanBalance: number,
  offsetBalance: number,
  inLedger: boolean,
): PropertyState {
  return {
    id,
    marketValue,
    loanBalance,
    offsetBalance,
    inLedger,
    monthlyRepayment: 0,
    monthlyInterest: 0,
    weeklyRent: 0,
    rentalGrowth: 0,
    vacancyRate: 0,
    managementFee: 0,
    capitalGrowth: 0,
    interestRate: 0,
    loanTermMonths: 0,
  } as unknown as PropertyState;
}

const terminalState: PortfolioState = {
  month: "2046-05",
  cash: 250_000,
  etfBalance: 3_500_000,
  cryptoBalance: 0,
  superRoham: 1_400_000,
  superFara: 900_000,
  properties: [
    // PPOR with a fat offset balance — this was the dominant source of the
    // prior ~1% drift. After Sprint 30A.3 the recon uses (mv - loan) only.
    prop("ppor", 2_400_000, 250_000, 180_000, true),
    prop("ip-1", 1_500_000, 750_000, 0, false),
    prop("ip-2", 1_800_000, 900_000, 0, false),
  ],
  cars: 55_000,
  iranProperty: 0,
  otherAssets: 12_000,
  otherDebts: 5_000,
  fyTaxPaid: 0,
  ttmIncome: 0,
  ttmExpenses: 0,
} as unknown as PortfolioState;

const engineNW = netWorth(terminalState);
// engineNW =  cash + etf + crypto + superR + superF + (sum mv-loan)
//          + cars + iran + otherA - otherD
//          = 250 + 3500 + 0 + 1400 + 900
//          + (2400-250 + 1500-750 + 1800-900)
//          + 55 + 0 + 12 - 5
//          = 6050 + 3800 + 62 = 9_912_000
check(
  "Block2: engine netWorth(state) matches hand-computed total",
  engineNW === 9_912_000,
  `got ${engineNW}`,
);

const reconAtP50 = reconcileTerminalNetWorth({
  finalState: terminalState,
  fanP50AtHorizon: engineNW,
});

check(
  "Block2: reconciliation status === \"PASS\" when fanP50 === engineNW",
  reconAtP50.status === "PASS",
  `status=${reconAtP50.status} message=${reconAtP50.message}`,
);

check(
  "Block2: componentsSum === engine netWorth(state) (to the dollar)",
  reconAtP50.componentsSum === engineNW,
  `componentsSum=${reconAtP50.componentsSum} engineNW=${engineNW}`,
);

check(
  "Block2: deltaPct === 0 when fan P50 matches engine NW",
  reconAtP50.deltaPct === 0,
  `deltaPct=${reconAtP50.deltaPct}`,
);

check(
  "Block2: ppor breakdown excludes offsetBalance (engine-aligned)",
  reconAtP50.breakdown.ppor === 2_400_000 - 250_000,
  `ppor=${reconAtP50.breakdown.ppor} expected=${2_400_000 - 250_000}`,
);

check(
  "Block2: blockedFields is empty on PASS",
  reconAtP50.blockedFields.length === 0,
  `blockedFields=${JSON.stringify(reconAtP50.blockedFields)}`,
);

// Simulate the real MC behaviour: fan P50 lands close to but not exactly equal
// to the medianFinalState's NW, because pctI() linearly interpolates between
// adjacent ranks while medianFinalState is the single closest sim. We assert
// the recon still passes when the gap is well under 0.5% (typical MC noise).
const noisyP50 = engineNW * 1.002; // 0.20% drift, well inside the 0.5% gate
const reconNoisy = reconcileTerminalNetWorth({
  finalState: terminalState,
  fanP50AtHorizon: noisyP50,
});
check(
  "Block2: 0.2% noise between componentsSum and fan P50 still PASSes",
  reconNoisy.status === "PASS",
  `deltaPct=${reconNoisy.deltaPct.toFixed(5)}`,
);

// Confirm the previous failure mode (offset-included drift) would have
// crossed the 0.5% gate on this state. The previous (broken) componentsSum
// would have been engineNW + 180_000 = 10_092_000; that 1.82% drift vs a
// fanP50 of engineNW would have failed. We do this as a forensic anchor.
const previouslyBrokenSum = engineNW + 180_000; // what offset-included math returned
const previouslyBrokenDriftPct =
  Math.abs(previouslyBrokenSum - engineNW) / engineNW;
check(
  "Block2 forensic: the old offset-included sum would have drifted > 0.5%",
  previouslyBrokenDriftPct > 0.005,
  `previousDriftPct=${(previouslyBrokenDriftPct * 100).toFixed(3)}%`,
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

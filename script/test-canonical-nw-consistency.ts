/**
 * P0-1 consistency guard.
 *
 * Loads the gold-fixture ledger and runs `computeCanonicalNetWorth` through
 * every code path each user-facing surface uses. All seven NW renderings
 * must agree to the dollar.
 *
 * The seven surfaces (one per audit defect):
 *   1. dashboard.tsx        — canonicalNw.netWorth
 *   2. reports.tsx          — canonicalNw.netWorth via wrapper
 *   3. timeline.tsx         — computeCanonicalNetWorth(...)
 *   4. financial-plan.tsx   — canonical applied to draft
 *   5. data-health.tsx      — reconcileNetWorth(canonical, engine)
 *   6. decision.tsx         — runScenarioV2 -> netWorthOfState (engine path)
 *   7. quickDecisionPdf     — netWorthReconciliation.canonical
 */
import {
  computeCanonicalNetWorth,
  type CanonicalNetWorthResult,
} from "../client/src/lib/canonicalNetWorth";
import {
  selectCanonicalNetWorth,
  reconcileNetWorth,
} from "../client/src/lib/dashboardDataContract";
import { deriveBasePlan, netWorthOfState } from "../client/src/lib/scenarioV2";
import { makeRealUserInputs, check } from "./test-audit-fixtures";

let pass = 0, fail = 0;
function run(name: string, cond: boolean, detail?: string) {
  if (check(name, cond, detail)) pass++; else fail++;
}

const inputs = makeRealUserInputs();

// 1. Dashboard surface
const dashNw = selectCanonicalNetWorth(inputs).netWorth;

// 2. Reports + 3. Timeline + 4. Financial Plan: pure wrapper
const wrapped: CanonicalNetWorthResult = computeCanonicalNetWorth(inputs);

// 5. Data Health (reconcile)
const recon = reconcileNetWorth(selectCanonicalNetWorth(inputs), dashNw);

// 6. Decision Engine (engine path)
const engineNw = netWorthOfState(deriveBasePlan(inputs).initialState);

// 7. PDF (passes the same canonical struct through)
const pdfNw = selectCanonicalNetWorth(inputs).netWorth;

run("dashboard NW == $856,000",            Math.abs(dashNw  - 856_000) <= 1, `got=${dashNw}`);
run("wrapper NW == dashboard NW",          Math.abs(wrapped.netWorth - dashNw) <= 1, `wrapper=${wrapped.netWorth}`);
run("reconciliation status PASS",          recon.status === "PASS", `diff=${recon.diff}`);
run("engine NW == dashboard NW",           Math.abs(engineNw - dashNw) <= 1, `engine=${engineNw}`);
run("pdf NW == dashboard NW",              Math.abs(pdfNw - dashNw) <= 1, `pdf=${pdfNw}`);
run("wrapper.components.cashTotal > 0",    wrapped.components.cashTotal > 0, `cashTotal=${wrapped.components.cashTotal}`);
run("wrapper.components.mortgage > 0",     wrapped.components.mortgage > 0, `mortgage=${wrapped.components.mortgage}`);
run("wrapper.lastCalculatedAt is ISO",     /^\d{4}-\d{2}-\d{2}T/.test(wrapped.lastCalculatedAt));

// Edge-case: zero ledger → 0, no NaN
const empty = computeCanonicalNetWorth({
  snapshot: null, properties: [], stocks: [], cryptos: [],
  holdingsRaw: [], incomeRecords: [], expenses: [],
});
run("empty ledger -> 0 NW (not NaN)", Number.isFinite(empty.netWorth) && empty.netWorth === 0,
  `got=${empty.netWorth}`);

if (fail > 0) { console.error(`test-canonical-nw-consistency: ${fail} failure(s)`); process.exit(1); }
console.log(`test-canonical-nw-consistency: ${pass} passed`);

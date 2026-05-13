/**
 * Audit P1.1 — dashboard NW must equal engine NW within $1.
 * Real user gold figure: $856,000.
 */
import {
  selectCanonicalNetWorth,
  reconcileNetWorth,
} from "../client/src/lib/dashboardDataContract";
import { deriveBasePlan, netWorthOfState } from "../client/src/lib/scenarioV2";
import { makeRealUserInputs, check } from "./test-audit-fixtures";

let pass = 0, fail = 0;
function run(name: string, fn: () => boolean) { fn() ? pass++ : fail++; }

run("Real user dashboard NW == engine NW", () => {
  const inputs = makeRealUserInputs();
  const canonical = selectCanonicalNetWorth(inputs);
  const derived = deriveBasePlan(inputs);
  const engineNw = netWorthOfState(derived.initialState);
  const recon = reconcileNetWorth(canonical, engineNw);
  const ok = recon.status === "PASS";
  return check("dashboard $856k == engine $856k", ok,
    `dashboard=${recon.dashboard} engine=${recon.engine} diff=${recon.diff}`);
});

run("Dashboard NW == $856,000", () => {
  const inputs = makeRealUserInputs();
  const c = selectCanonicalNetWorth(inputs);
  const ok = Math.abs(c.netWorth - 856_000) <= 1;
  return check("canonical NW = $856,000", ok, `got=${c.netWorth}`);
});

run("Snapshot with cars=0 reconciles", () => {
  const inputs = makeRealUserInputs({ cars: 0 });
  const c = selectCanonicalNetWorth(inputs);
  const derived = deriveBasePlan(inputs);
  const recon = reconcileNetWorth(c, netWorthOfState(derived.initialState));
  return check("cars=0 PASS", recon.status === "PASS", `diff=${recon.diff}`);
});

run("Snapshot with iran=0 reconciles", () => {
  const inputs = makeRealUserInputs({ iran_property: 0 });
  const c = selectCanonicalNetWorth(inputs);
  const derived = deriveBasePlan(inputs);
  const recon = reconcileNetWorth(c, netWorthOfState(derived.initialState));
  return check("iran=0 PASS", recon.status === "PASS", `diff=${recon.diff}`);
});

run("Snapshot with other_debts=0 reconciles", () => {
  const inputs = makeRealUserInputs({ other_debts: 0 });
  const c = selectCanonicalNetWorth(inputs);
  const derived = deriveBasePlan(inputs);
  const recon = reconcileNetWorth(c, netWorthOfState(derived.initialState));
  return check("other_debts=0 PASS", recon.status === "PASS", `diff=${recon.diff}`);
});

run("Planned IPs not in current NW", () => {
  const inputs = makeRealUserInputs();
  const c = selectCanonicalNetWorth(inputs);
  // Settled IP value should be 0 (the two IPs are post-today).
  return check("settledIpValue == 0", c.assets.settledIpValue === 0,
    `settledIpValue=${c.assets.settledIpValue}`);
});

if (fail > 0) { console.error(`test-nw-reconciliation: ${fail} failure(s)`); process.exit(1); }
console.log(`test-nw-reconciliation: ${pass} passed`);

/**
 * Audit P1.1 — toggling `iran_property` on/off must move engine NW by that amount.
 */
import { deriveBasePlan, netWorthOfState } from "../client/src/lib/scenarioV2";
import { makeRealUserInputs, check } from "./test-audit-fixtures";

let pass = 0, fail = 0;

const withIran = deriveBasePlan(makeRealUserInputs({ iran_property: 150_000 }));
const noIran   = deriveBasePlan(makeRealUserInputs({ iran_property: 0 }));

const delta = netWorthOfState(withIran.initialState) - netWorthOfState(noIran.initialState);
if (check("Removing $150k iran_property drops engine NW by $150k",
  Math.abs(delta - 150_000) <= 1, `delta=${delta}`)) pass++;
else fail++;

if (fail > 0) { console.error(`test-overseas-included: ${fail} failure(s)`); process.exit(1); }
console.log(`test-overseas-included: ${pass} passed`);

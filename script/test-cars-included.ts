/**
 * Audit P1.1 — toggling `cars` on/off must move engine NW by exactly that amount.
 */
import { deriveBasePlan, netWorthOfState } from "../client/src/lib/scenarioV2";
import { makeRealUserInputs, check } from "./test-audit-fixtures";

let pass = 0, fail = 0;

const withCars = deriveBasePlan(makeRealUserInputs({ cars: 65_000 }));
const noCars   = deriveBasePlan(makeRealUserInputs({ cars: 0 }));

const delta = netWorthOfState(withCars.initialState) - netWorthOfState(noCars.initialState);
if (check("Removing $65k cars drops engine NW by $65k", Math.abs(delta - 65_000) <= 1, `delta=${delta}`)) pass++;
else fail++;

if (fail > 0) { console.error(`test-cars-included: ${fail} failure(s)`); process.exit(1); }
console.log(`test-cars-included: ${pass} passed`);

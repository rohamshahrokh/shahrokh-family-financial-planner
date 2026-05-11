/**
 * Audit P1.1 — toggling `other_debts` must move engine NW by exactly the negation.
 */
import { deriveBasePlan, netWorthOfState } from "../client/src/lib/scenarioV2";
import { makeRealUserInputs, check } from "./test-audit-fixtures";

let pass = 0, fail = 0;

const withDebt = deriveBasePlan(makeRealUserInputs({ other_debts: 19_000 }));
const noDebt   = deriveBasePlan(makeRealUserInputs({ other_debts: 0 }));

const delta = netWorthOfState(withDebt.initialState) - netWorthOfState(noDebt.initialState);
if (check("Removing $19k other_debts raises engine NW by $19k",
  Math.abs(delta + 19_000) <= 1, `delta=${delta}`)) pass++;
else fail++;

if (fail > 0) { console.error(`test-other-debts-included: ${fail} failure(s)`); process.exit(1); }
console.log(`test-other-debts-included: ${pass} passed`);

/**
 * Audit P1.1 — planned IPs (settlement_date in the future) must live in
 * plannedIpEquity, NOT in assets.settledIpValue.
 */
import { selectCanonicalNetWorth } from "../client/src/lib/dashboardDataContract";
import { makeRealUserInputs, check } from "./test-audit-fixtures";

let pass = 0, fail = 0;

(function () {
  const inputs = makeRealUserInputs();
  const c = selectCanonicalNetWorth(inputs);
  if (check("settledIpValue == 0 (both IPs planned)",
    c.assets.settledIpValue === 0, `settled=${c.assets.settledIpValue}`)) pass++; else fail++;
  if (check("plannedIpEquity reflects 750k + 1M minus loans",
    c.plannedIpEquity > 0,
    `planned=${c.plannedIpEquity}`)) pass++; else fail++;
})();

if (fail > 0) { console.error(`test-planned-not-current: ${fail} failure(s)`); process.exit(1); }
console.log(`test-planned-not-current: ${pass} passed`);

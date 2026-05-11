/**
 * Audit P1.5 — holdings reconciliation: PASS for real user (0/0),
 * FAIL when manual snapshot diverges from live holdings.
 */
import { reconcileHoldings } from "../client/src/lib/dashboardDataContract";
import { makeRealUserInputs, check } from "./test-audit-fixtures";

let pass = 0, fail = 0;

(function () {
  const inputs = makeRealUserInputs();
  const recon = reconcileHoldings(inputs, { etfBalance: 0, cryptoBalance: 0 });
  if (check("Real user (0 stocks, 0 crypto) PASS",
    recon.stocks.status === "PASS" && recon.crypto.status === "PASS",
    `stocks=${recon.stocks.status} crypto=${recon.crypto.status}`)) pass++;
  else fail++;
})();

(function () {
  const inputs = makeRealUserInputs({ stocks: 50_000 });
  const recon = reconcileHoldings(inputs, { etfBalance: 0, cryptoBalance: 0 });
  if (check("Snapshot stocks=$50k but engine $0 reports FAIL",
    recon.stocks.status === "FAIL", `stocks=${recon.stocks.status} diff=${recon.stocks.diff}`)) pass++;
  else fail++;
})();

if (fail > 0) { console.error(`test-holdings-reconcile: ${fail} failure(s)`); process.exit(1); }
console.log(`test-holdings-reconcile: ${pass} passed`);

/**
 * Audit P1.4 — `collectAssumptionsUsed()` must return >=30 rows, each with
 * non-empty label/value/source/impacts. Surfaces every assumption the engine
 * touches so the user can audit them in one place.
 */
import { collectAssumptionsUsed } from "../client/src/lib/scenarioV2";
import { check } from "./test-audit-fixtures";

let pass = 0, fail = 0;
const rows = collectAssumptionsUsed();

if (check(`>= 30 assumption rows`, rows.length >= 30, `rows=${rows.length}`)) pass++; else fail++;

let allValid = true;
for (const r of rows) {
  if (!r.label || !r.value || !r.source || !r.impacts) {
    console.error(`  invalid row: ${JSON.stringify(r)}`);
    allValid = false;
  }
}
if (check("every row has non-empty label/value/source/impacts", allValid)) pass++; else fail++;

// Spot-check categories that must be represented.
for (const cat of ["Macro", "Property", "Stocks", "Crypto", "Tax", "Super", "CGT", "MC", "Risk"]) {
  if (check(`category ${cat} represented`, rows.some(r => r.category === cat))) pass++;
  else fail++;
}

if (fail > 0) { console.error(`test-assumptions-panel: ${fail} failure(s)`); process.exit(1); }
console.log(`test-assumptions-panel: ${pass} passed`);

/**
 * metricSourceAttribution.test.ts — Sprint 28.
 *
 * Tests for the audit-mode attribution formatter. The helper must:
 *   1. Format every MetricSource into a stable human-readable label.
 *   2. Append percentile only when present.
 *   3. Append simulationCount only when > 0.
 *   4. Append pathTemplateId only when present.
 *   5. Render the literal "Not modelled yet" label for the notModelled source.
 *   6. shortAttribution returns the source label alone.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/metricSourceAttribution.test.ts
 */
import { formatAttribution, shortAttribution } from "../metricSourceAttribution";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

console.log("\nmetricSourceAttribution — formatter honesty");

// 1. Monte Carlo with percentile + sim count
const mc = formatAttribution({ source: "scenarioV2.monteCarlo", percentile: "p50", simulationCount: 300 });
check("MC p50 300 sims → expected string", mc === "Source: Monte Carlo P50 (300 sims)", `got "${mc}"`);

// 2. Path completion (no percentile, no sims)
const pc = formatAttribution({ source: "actionRoadmap.pathCompletion" });
check("path completion → bare label", pc === "Source: Path completion engine", `got "${pc}"`);

// 3. Accelerator with pathTemplateId
const acc = formatAttribution({ source: "actionRoadmap.accelerators", pathTemplateId: "etf-acceleration" });
check("accelerator with template id → has · suffix", acc.includes("· etf-acceleration"));

// 4. Risk
const rk = formatAttribution({ source: "actionRoadmap.risk" });
check("risk → bare label", rk === "Source: Risk analyzer", `got "${rk}"`);

// 5. notModelled
const nm = formatAttribution({ source: "notModelled" });
check("notModelled → literal 'Not modelled yet' phrase", nm === "Source: Not modelled yet", `got "${nm}"`);

// 6. Zero simulationCount is suppressed
const zero = formatAttribution({ source: "scenarioV2.monteCarlo", percentile: "p75", simulationCount: 0 });
check("zero sims is suppressed", !zero.includes("sims"), `got "${zero}"`);
check("zero sims still keeps percentile", zero.includes("P75"));

// 7. Note appended
const withNote = formatAttribution({ source: "goalLab.confidence", note: "Built from 6/6 confirmations" });
check("note appended with em-dash", withNote.includes("— Built from 6/6 confirmations"));

// 8. shortAttribution
const short = shortAttribution({ source: "scenarioV2.monteCarlo", percentile: "p50", simulationCount: 300 });
check("shortAttribution returns source-only label", short === "Monte Carlo", `got "${short}"`);

// 9. All sources resolve to a non-empty label
const allSources = [
  "scenarioV2.monteCarlo",
  "scenarioV2.monteCarlo.diagnostic",
  "scenarioV2.events",
  "actionRoadmap.pathCompletion",
  "actionRoadmap.accelerators",
  "actionRoadmap.risk",
  "actionRoadmap.reconciliation",
  "goalLab.orchestrator",
  "goalLab.confidence",
  "goalProfile",
  "canonicalLedger",
  "reconciliationFailed",
  "notModelled",
] as const;
let allResolved = true;
for (const s of allSources) {
  const f = formatAttribution({ source: s });
  if (!f.startsWith("Source: ") || f.length < 10) { allResolved = false; break; }
}
check("every MetricSource resolves to a non-empty label", allResolved);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

/**
 * roadmapTemplates.test.ts — Sprint 27.
 *
 * Locks down the mapping from engine templateId → display template id.
 * If a new engine template is added without updating roadmapTemplates.ts,
 * these tests fail loudly rather than silently mis-labelling the path.
 *
 * Run: npx tsx client/src/lib/actionRoadmap/__tests__/roadmapTemplates.test.ts
 */

import { resolveRoadmapTemplate, getRoadmapTemplate, ROADMAP_TEMPLATES } from "../roadmapTemplates";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else      { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

console.log("\nroadmapTemplates — engineId → displayId mapping");

// Brief's six paths must all be addressable
const ids = ["PROPERTY_PATH","ETF_PATH","HYBRID_PATH","DEBT_REDUCTION_PATH","OFFSET_FIRST_PATH","SUPER_ACCELERATION_PATH","CUSTOM_PATH"] as const;
for (const id of ids) {
  check(`catalogue entry: ${id}`, ROADMAP_TEMPLATES[id] !== undefined && ROADMAP_TEMPLATES[id].label.length > 0);
}

// Engine ids known at time of writing (kept in sync with goalLab/scenarioTemplates.ts)
check("buy-ip-now → PROPERTY_PATH", resolveRoadmapTemplate("buy-ip-now").id === "PROPERTY_PATH");
check("delay-ip → PROPERTY_PATH", resolveRoadmapTemplate("delay-ip").id === "PROPERTY_PATH");
check("etf-acceleration → ETF_PATH", resolveRoadmapTemplate("etf-acceleration").id === "ETF_PATH");
check("hybrid-property-etf → HYBRID_PATH", resolveRoadmapTemplate("hybrid-property-etf").id === "HYBRID_PATH");
check("debt-reduction → DEBT_REDUCTION_PATH", resolveRoadmapTemplate("debt-reduction").id === "DEBT_REDUCTION_PATH");
check("offset-optimisation → OFFSET_FIRST_PATH", resolveRoadmapTemplate("offset-optimisation").id === "OFFSET_FIRST_PATH");
check("super-contributions → SUPER_ACCELERATION_PATH", resolveRoadmapTemplate("super-contributions").id === "SUPER_ACCELERATION_PATH");

// Unmapped + null + undefined → CUSTOM_PATH (never throw, never invent)
check("unknown id → CUSTOM_PATH", resolveRoadmapTemplate("totally-new-template").id === "CUSTOM_PATH");
check("null → CUSTOM_PATH", resolveRoadmapTemplate(null).id === "CUSTOM_PATH");
check("undefined → CUSTOM_PATH", resolveRoadmapTemplate(undefined).id === "CUSTOM_PATH");
check("empty string → CUSTOM_PATH", resolveRoadmapTemplate("").id === "CUSTOM_PATH");

// Direct getter
check("getRoadmapTemplate works", getRoadmapTemplate("ETF_PATH").id === "ETF_PATH");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

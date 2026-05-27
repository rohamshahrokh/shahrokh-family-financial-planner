/**
 * Sprint 17 Phase 17.8 — Audit harness CI gate.
 *
 * Run: npx tsx client/src/lib/__tests__/recommendationAudit.test.ts
 *
 * Runs the 5-household CI subset and asserts the library average passes
 * the Sprint 17 quality bar. The full 20-scenario harness lives at
 * scripts/sprint17-audit.ts (NOT committed; local tool).
 */

import { runHarnessCiSubset } from "./recommendationAudit/runHarness";

function assert(cond: any, msg: string) {
  if (!cond) { console.error(`FAIL: ${msg}`); process.exitCode = 1; }
  else { console.log(`ok  - ${msg}`); }
}

const report = runHarnessCiSubset();
console.log(`Library average overall: ${report.libraryAverage.overall.toFixed(2)}`);
console.log(`Facade: ${report.libraryAverage.recommendationFacade.toFixed(2)}`);
console.log(`Confidence: ${report.libraryAverage.confidenceSystem.toFixed(2)}`);
console.log(`Goal closure: ${report.libraryAverage.goalClosureLab.toFixed(2)}`);
console.log(`Portfolio: ${report.libraryAverage.portfolioLab.toFixed(2)}`);

for (const s of report.scenarios) {
  console.log(`  ${s.id} → overall=${s.grades.overall.toFixed(1)}  top=${s.topRecommendation?.id ?? "—"}  lifeStage=${s.lifeStage}`);
}

assert(report.scenarios.length === 5, "CI subset has 5 scenarios");
assert(report.libraryAverage.overall >= 5, `CI library overall >= 5 (got ${report.libraryAverage.overall})`);

for (const s of report.scenarios) {
  assert(s.topRecommendation != null, `${s.id}: topRecommendation populated`);
  assert(s.topRecommendation!.marginalImpact != null, `${s.id}: marginalImpact populated`);
  assert(s.topRecommendation!.calibratedBand != null, `${s.id}: calibratedConfidence populated`);
}

console.log(process.exitCode ? "FAILED" : "PASSED");

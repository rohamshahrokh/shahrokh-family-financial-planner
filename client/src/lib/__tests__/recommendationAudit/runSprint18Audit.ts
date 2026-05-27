/**
 * Sprint 18 Phase 18.7 / 18.8 — Audit runner.
 *
 * Run via: npm run test:audit:sprint18
 *
 * Produces:
 *   - sprint18_validation/scenarios/<id>.md (one per scenario)
 *   - sprint18_validation/before_after.md
 *   - sprint18_validation/audit_evidence.json
 *   - sprint18_validation/failure_cases.md
 *   - sprint18_validation/remaining_weaknesses.md
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { runSprint18Audit, writeScenarioReports } from "./sprint18Harness";

const OUT_BASE = "/home/user/workspace/sprint18_validation";

function loadSprint17Evidence(): any | null {
  const p = "/home/user/workspace/sprint17_validation/audit_evidence.json";
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function renderBeforeAfter(report: ReturnType<typeof runSprint18Audit>, sprint17: any): string {
  const lines: string[] = [];
  lines.push("# Sprint 18 — Before / After Audit Comparison");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Per-engine Library Averages");
  lines.push("");
  lines.push("| Engine | Sprint 17 | Sprint 18 | Δ |");
  lines.push("|---|---|---|---|");
  const s17 = sprint17?.libraryAverage ?? null;
  const s18 = report.libraryAverage;
  const row = (label: string, key: keyof typeof s18) => {
    const before = s17?.[key] ?? "—";
    const after = s18[key];
    const delta = typeof before === "number" ? (after - before).toFixed(2) : "—";
    lines.push(`| ${label} | ${before} | ${after} | ${delta} |`);
  };
  row("Recommendation Facade", "recommendationFacade");
  row("Goal Closure Lab", "goalClosureLab");
  row("Portfolio Lab", "portfolioLab");
  row("Confidence System", "confidenceSystem");
  row("Library Average (overall)", "overall");
  lines.push("");
  lines.push("> _Note: the auto-score is one input. The orchestrator will run an independent reviewer subagent to grade 8 scenarios qualitatively. The auto-score is necessary but NOT sufficient for sprint acceptance._");
  lines.push("");

  // 8 worked examples
  lines.push("## Eight Worked Household Examples");
  lines.push("");
  const wantedIds = [
    "25_property_feasible_etf_best",
    "24_property_infeasible",
    "07_crypto_concentrated",
    "04_pre_retiree_ahead",
    "12_at_target_optimising",
    "19_retired_longevity_risk",
    "05_highly_leveraged",
    "14_target_unreachable",
  ];
  for (const id of wantedIds) {
    const s = report.scenarios.find((x) => x.id === id);
    if (!s) continue;
    const top = s.topRecommendation;
    const ae = top?.advisorExplanation;
    lines.push(`### ${id} — ${s.profile}`);
    lines.push(`- **Life stage:** ${s.lifeStage ?? "—"}`);
    lines.push(`- **Top:** ${top?.title ?? "—"} (\`${top?.actionType}\`, pillar \`${top?.pillar}\`)`);
    lines.push(`- **Confidence:** ${top?.calibratedConfidence?.displayLabel ?? "—"}`);
    lines.push(`- **Feasibility:** ${ae?.feasibilityStatus ?? "—"}`);
    lines.push(`- **Stress test:** ${ae?.stressTestResult ?? "—"}`);
    lines.push(`- **Behavioural note:** ${ae?.behaviouralNote ?? "—"}`);
    lines.push(`- **Next practical step:** ${ae?.nextPracticalStep ?? "—"}`);
    lines.push(`- **Best path:** ${s.bestPath?.title ?? "—"} (${s.bestPath?.score ?? "—"}/100)`);
    lines.push(`- **Auto-grade overall:** ${s.grades.overall}/10`);
    lines.push("");
  }

  // Per-scenario summary table
  lines.push("## Per-Scenario Auto-Grades");
  lines.push("");
  lines.push("| ID | Profile | Overall | Facade | GCL | Portfolio | Confidence | Hard fails |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const s of report.scenarios) {
    const fails = s.hardAssertions.filter((a) => !a.passed).length;
    lines.push(`| ${s.id} | ${s.profile} | ${s.grades.overall} | ${s.grades.recommendationFacade} | ${s.grades.goalClosureLab} | ${s.grades.portfolioLab} | ${s.grades.confidenceSystem} | ${fails} |`);
  }
  return lines.join("\n");
}

function renderFailureCases(report: ReturnType<typeof runSprint18Audit>): string {
  if (report.hardAssertionFailures.length === 0) {
    return `# Sprint 18 — Hard-Assertion Failure Cases\n\n_No hard-assertion failures across ${report.scenarios.length} scenarios. ✅_\n\nGenerated: ${report.generatedAt}\n`;
  }
  const lines = [
    "# Sprint 18 — Hard-Assertion Failure Cases",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `**Failures: ${report.hardAssertionFailures.length}**`,
    "",
    "| Scenario | Assertion ID | Description | Reason |",
    "|---|---|---|---|",
  ];
  for (const f of report.hardAssertionFailures) {
    lines.push(`| ${f.scenarioId} | ${f.assertion.id} | ${f.assertion.description} | ${f.assertion.reason} |`);
  }
  return lines.join("\n");
}

function renderRemainingWeaknesses(report: ReturnType<typeof runSprint18Audit>): string {
  const lines = ["# Sprint 18 — Remaining Weaknesses (honest list)", "", `Generated: ${report.generatedAt}`, ""];
  const weak = report.scenarios.filter((s) => s.grades.overall < 8);
  if (weak.length === 0) {
    lines.push("- All scenarios meet the 8/10 auto-grade floor.");
  } else {
    lines.push("## Scenarios below the 8/10 floor");
    lines.push("");
    for (const s of weak) {
      lines.push(`- **${s.id}** — overall ${s.grades.overall}/10 (facade ${s.grades.recommendationFacade}, GCL ${s.grades.goalClosureLab}, portfolio ${s.grades.portfolioLab}, confidence ${s.grades.confidenceSystem}). Top: \`${s.topRecommendation?.actionType}\``);
    }
  }
  lines.push("");
  lines.push("## Known limitations honestly logged");
  lines.push("");
  lines.push("- **Borrowing capacity is deterministic-AU model.** It does not call a live bank API; figures are conservative midpoints. The explanation layer echoes every input assumption.");
  lines.push("- **Stamp duty is state-aware but mid-2025 representative.** Real-time ATO rates would be more accurate.");
  lines.push("- **MC re-runs are not performed for path scoring.** Path success probability uses a heuristic bump per archetype, not full Monte Carlo. This is documented in the path scoring code.");
  lines.push("- **Behavioural fit uses 11 deterministic warnings, not ML.** This is intentional — explainable beats opaque.");
  lines.push("- **Confidence is not labelled 'probability' unless MC drives it.** Per user §7 hard rule.");
  lines.push("- **The auto-grader is a heuristic.** The orchestrator's independent reviewer subagent is the final word on Sprint 18 quality.");
  return lines.join("\n");
}

function main() {
  console.log("Sprint 18 audit harness — running 25 scenarios...");
  const report = runSprint18Audit();
  mkdirSync(OUT_BASE, { recursive: true });
  mkdirSync(join(OUT_BASE, "scenarios"), { recursive: true });
  writeScenarioReports(report, join(OUT_BASE, "scenarios"));

  const sprint17 = loadSprint17Evidence();
  writeFileSync(join(OUT_BASE, "before_after.md"), renderBeforeAfter(report, sprint17), "utf8");
  writeFileSync(join(OUT_BASE, "audit_evidence.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(join(OUT_BASE, "failure_cases.md"), renderFailureCases(report), "utf8");
  writeFileSync(join(OUT_BASE, "remaining_weaknesses.md"), renderRemainingWeaknesses(report), "utf8");

  console.log("");
  console.log("Library average:");
  console.log(`  Recommendation Facade: ${report.libraryAverage.recommendationFacade}/10`);
  console.log(`  Goal Closure Lab:      ${report.libraryAverage.goalClosureLab}/10`);
  console.log(`  Portfolio Lab:         ${report.libraryAverage.portfolioLab}/10`);
  console.log(`  Confidence System:     ${report.libraryAverage.confidenceSystem}/10`);
  console.log(`  Overall:               ${report.libraryAverage.overall}/10`);
  console.log("");
  console.log(`Hard-assertion failures: ${report.hardAssertionFailures.length}`);
  for (const f of report.hardAssertionFailures) {
    console.log(`  ✗ ${f.scenarioId} → ${f.assertion.id} (${f.assertion.reason})`);
  }
  console.log("");
  console.log(`Passed: ${report.passed}`);
  console.log(`Outputs written under ${OUT_BASE}/`);
  if (!report.passed) process.exitCode = 1;
}

main();

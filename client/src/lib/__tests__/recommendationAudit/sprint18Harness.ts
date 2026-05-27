/**
 * Sprint 18 Phase 18.7 / 18.8 — Audit harness.
 *
 * Walks all 25 scenarios:
 *   1. Build RecommendationContext
 *   2. Run computeUnifiedRecommendations (with all Sprint 18 wiring)
 *   3. Apply hard assertions
 *   4. Auto-score the four sub-engines using a Sprint-18 aware rubric
 *   5. Emit one markdown per scenario at sprint18_validation/scenarios/<id>.md
 *
 * Aggregated outputs (written by runSprint18Audit.ts):
 *   - sprint18_validation/before_after.md
 *   - sprint18_validation/audit_evidence.json
 *   - sprint18_validation/failure_cases.md
 *   - sprint18_validation/remaining_weaknesses.md
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { buildRecommendationContext } from "../../recommendationContext/buildContext";
import { detectConcentration } from "../../concentration/detector";
import { computeUnifiedRecommendations } from "../../recommendationEngine/engine";
import {
  fromContext,
  fromConcentration,
  mergeSignals,
} from "../../recommendationEngine/adapters";
import { __resetFatigueHistoryForTests } from "../../recommendationEngine/fatiguePenalty";
import { __resetMarginalImpactCacheForTests } from "../../recommendationEngine/marginalImpact";
import {
  loadAllHouseholds,
  goalFromScenario,
  ledgerFromScenario,
  type HouseholdScenario,
} from "./households";
import { runHardAssertions, type HardAssertion } from "./sprint18Assertions";

export interface Sprint18ScenarioReport {
  id: string;
  profile: string;
  age: number;
  lifeStage: string | undefined;
  feasibility: string;
  baselineFireDate: string | null;
  baselineSuccess: number;
  topRecommendation: any;
  top3: Array<{ id: string; title: string; qualityScore: number | null; pillar: string }>;
  bestPath: any;
  candidatePaths: Array<{ archetype: string; score: number; feasible: boolean; archetypeTitle: string }>;
  hardAssertions: HardAssertion[];
  grades: {
    recommendationFacade: number;
    goalClosureLab: number;
    portfolioLab: number;
    confidenceSystem: number;
    overall: number;
  };
}

export interface Sprint18Report {
  generatedAt: string;
  scenarios: Sprint18ScenarioReport[];
  libraryAverage: {
    recommendationFacade: number;
    goalClosureLab: number;
    portfolioLab: number;
    confidenceSystem: number;
    overall: number;
  };
  hardAssertionFailures: Array<{ scenarioId: string; assertion: HardAssertion }>;
  passed: boolean;
}

const TARGETS = {
  recommendationFacade: 8,
  goalClosureLab: 8,
  portfolioLab: 8,
  confidenceSystem: 8,
  libraryAverage: 8,
};

function gradeFacade(top: any, ctx: any): number {
  if (!top) return 0;
  let score = 0;
  if (top.calibratedConfidence) score += 2;
  if (top.marginalImpact) score += 1.5;
  if (top.feasibility) score += 1.5;
  if (top.behaviouralRisk) score += 1;
  if (top.stressTest) score += 1;
  if (top.advisorExplanation) score += 2;
  // Pillar appropriateness
  const lifeStage = ctx?.lifeStage;
  if (lifeStage === "STATE_E_DECUMULATION" || lifeStage === "STATE_D_FIRE_ACHIEVED") {
    if (top.pillar === "decumulate_safely" || top.pillar === "protect_liquidity") score += 1;
  } else {
    score += 1;
  }
  return Math.min(10, score);
}

function gradeGoalClosure(top: any, ctx: any, result: any): number {
  let score = 0;
  if (ctx?.forecast?.feasibility) score += 1.5;
  if (top?.marginalImpact?.deltaFireDateMonths != null) score += 1.5;
  if (top?.marginalImpact?.deltaSuccessProbability != null) score += 1.5;
  if (top?.advisorExplanation?.baselineComparison) score += 1.5;
  if (top?.alternativeOptions?.length > 0) score += 1;
  if (result.bestPath) score += 1.5;
  if (result.candidatePaths && result.candidatePaths.length >= 3) score += 1.5;
  return Math.min(10, score);
}

function gradePortfolioLab(top: any, _ctx: any, signals: any, result: any): number {
  let score = 4;
  const flags = signals.concentrationFlags ?? [];
  if (flags.length > 0) score += 2;
  else score += 1;
  if (top?.actionType === "rebalance_concentration" || top?.actionType === "glidepath_shift") {
    score += 2;
  } else if (top?.pillar === "stabilise_leverage" || top?.pillar === "decumulate_safely") {
    score += 1;
  }
  if (result.bestPath?.scoreComponents?.riskAdjustedReturnScore != null) score += 2;
  return Math.min(10, score);
}

function gradeConfidence(top: any): number {
  if (!top) return 0;
  let score = 2;
  const cc = top.calibratedConfidence;
  if (cc) {
    score += 3;
    if (cc.mcDriven && cc.displayLabel?.toLowerCase().includes("probability")) score += 2;
    else if (!cc.mcDriven && !cc.displayLabel?.toLowerCase().includes("probability")) score += 2;
    if (cc.components && (cc.components.mcSuccessProb == null || cc.value <= cc.components.mcSuccessProb + 0.11)) {
      score += 2;
    }
    if (cc.rationale && cc.rationale.length > 20) score += 1;
  }
  return Math.min(10, score);
}

function runOneScenario(scenario: HouseholdScenario): Sprint18ScenarioReport {
  __resetFatigueHistoryForTests();
  __resetMarginalImpactCacheForTests();
  const ledger = ledgerFromScenario(scenario);
  const goal = goalFromScenario(scenario.goal);
  const ctx = buildRecommendationContext(ledger, goal);
  const concentrations = detectConcentration(ctx);

  const signals = mergeSignals(
    scenario.signals as any,
    fromContext(ctx),
    fromConcentration(concentrations),
  );

  const result = computeUnifiedRecommendations(signals);
  const top = result.bestMove;

  const facadeGrade = gradeFacade(top, ctx);
  const closureGrade = gradeGoalClosure(top, ctx, result);
  const portfolioGrade = gradePortfolioLab(top, ctx, signals, result);
  const confidenceGrade = gradeConfidence(top);
  const overall = (facadeGrade + closureGrade + portfolioGrade + confidenceGrade) / 4;

  const hardAssertions = runHardAssertions({
    scenarioId: scenario.meta.id,
    top,
    top3: result.topPriorities,
    ctx,
    signals,
    result,
  });

  return {
    id: scenario.meta.id,
    profile: scenario.meta.profile,
    age: scenario.meta.age,
    lifeStage: ctx.lifeStage,
    feasibility: ctx.forecast.feasibility,
    baselineFireDate: ctx.forecast.fireDateBaseline,
    baselineSuccess: Number(ctx.forecast.fireSuccessProbabilityBaseline.toFixed(3)),
    topRecommendation: top ? {
      id: top.id,
      title: top.title,
      pillar: top.pillar,
      actionType: top.actionType,
      confidence: top.confidenceScore,
      calibratedConfidence: top.calibratedConfidence,
      qualityScore: top.qualityScore ?? null,
      marginalImpact: top.marginalImpact ?? null,
      feasibility: top.feasibility ?? null,
      behaviouralRisk: top.behaviouralRisk ?? null,
      stressTest: top.stressTest ?? null,
      advisorExplanation: top.advisorExplanation ?? null,
    } : null,
    top3: result.topPriorities.map((r) => ({
      id: r.id,
      title: r.title,
      pillar: r.pillar,
      qualityScore: r.qualityScore ?? null,
    })),
    bestPath: result.bestPath ?? null,
    candidatePaths: (result.candidatePaths ?? []).map((p: any) => ({
      archetype: p.archetype,
      archetypeTitle: p.title,
      score: p.score,
      feasible: p.feasibility?.feasible ?? true,
    })),
    hardAssertions,
    grades: {
      recommendationFacade: Number(facadeGrade.toFixed(2)),
      goalClosureLab: Number(closureGrade.toFixed(2)),
      portfolioLab: Number(portfolioGrade.toFixed(2)),
      confidenceSystem: Number(confidenceGrade.toFixed(2)),
      overall: Number(overall.toFixed(2)),
    },
  };
}

export function runSprint18Audit(): Sprint18Report {
  const households = loadAllHouseholds();
  const scenarios = households.map(runOneScenario);

  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const libraryAverage = {
    recommendationFacade: Number(avg(scenarios.map((s) => s.grades.recommendationFacade)).toFixed(2)),
    goalClosureLab: Number(avg(scenarios.map((s) => s.grades.goalClosureLab)).toFixed(2)),
    portfolioLab: Number(avg(scenarios.map((s) => s.grades.portfolioLab)).toFixed(2)),
    confidenceSystem: Number(avg(scenarios.map((s) => s.grades.confidenceSystem)).toFixed(2)),
    overall: Number(avg(scenarios.map((s) => s.grades.overall)).toFixed(2)),
  };

  const hardAssertionFailures: Array<{ scenarioId: string; assertion: HardAssertion }> = [];
  for (const s of scenarios) {
    for (const a of s.hardAssertions) {
      if (!a.passed) hardAssertionFailures.push({ scenarioId: s.id, assertion: a });
    }
  }

  const passed =
    hardAssertionFailures.length === 0 &&
    libraryAverage.recommendationFacade >= TARGETS.recommendationFacade &&
    libraryAverage.goalClosureLab >= TARGETS.goalClosureLab &&
    libraryAverage.portfolioLab >= TARGETS.portfolioLab &&
    libraryAverage.confidenceSystem >= TARGETS.confidenceSystem &&
    libraryAverage.overall >= TARGETS.libraryAverage;

  return {
    generatedAt: new Date().toISOString(),
    scenarios,
    libraryAverage,
    hardAssertionFailures,
    passed,
  };
}

function renderScenarioMarkdown(s: Sprint18ScenarioReport): string {
  const top = s.topRecommendation;
  const ae = top?.advisorExplanation;
  const cp = s.candidatePaths;
  const bp = s.bestPath;

  return `# Scenario ${s.id}

**Profile:** ${s.profile}
**Age:** ${s.age} · **Life stage:** ${s.lifeStage ?? "—"}
**Baseline feasibility:** ${s.feasibility} · **Baseline FIRE date:** ${s.baselineFireDate ?? "—"} · **Baseline success:** ${(s.baselineSuccess * 100).toFixed(1)}%

## Grades (auto)
| Engine | Score |
|---|---|
| Recommendation Facade | ${s.grades.recommendationFacade}/10 |
| Goal Closure Lab | ${s.grades.goalClosureLab}/10 |
| Portfolio Lab | ${s.grades.portfolioLab}/10 |
| Confidence System | ${s.grades.confidenceSystem}/10 |
| **Overall** | **${s.grades.overall}/10** |

## Top Recommendation
${top ? `
- **Title:** ${top.title}
- **Action:** \`${top.actionType}\`
- **Pillar:** ${top.pillar}
- **Confidence:** ${top.calibratedConfidence?.displayLabel ?? top.confidence}
- **Quality score:** ${top.qualityScore?.toFixed(1) ?? "—"}/100
` : "_No recommendation produced_"}

## Advisor Explanation (11 fields)
${ae ? `
1. **Recommended action.** ${ae.recommendedAction}
2. **Why this action.** ${ae.whyThisAction}
3. **Why not alternatives.** ${ae.whyNotAlternatives}
4. **Baseline comparison.** ${ae.baselineComparison}
5. **Expected improvement.** ${ae.expectedImprovement}
6. **Feasibility status.** ${ae.feasibilityStatus}
7. **Key risk.** ${ae.keyRisk}
8. **Stress test result.** ${ae.stressTestResult}
9. **Behavioural note.** ${ae.behaviouralNote}
10. **Confidence explanation.** ${ae.confidenceExplanation}
11. **Next practical step.** ${ae.nextPracticalStep}
` : "_No advisor explanation generated_"}

## Best Path
${bp ? `
- **Archetype:** ${bp.archetype}
- **Title:** ${bp.title}
- **Score:** ${bp.score}/100
- **Steps:** ${bp.steps?.length ?? 0}
- **Feasibility:** ${bp.feasibility?.feasible ? "feasible" : "NOT feasible"}
- **Behavioural note:** ${bp.behaviouralNote}
- **Stress test:** ${bp.stressTest ? `${bp.stressTest.scenariosSurvived}/${bp.stressTest.scenariosTested} survives` : "—"}
` : "_No best path_"}

## Candidate Paths
| Archetype | Title | Score | Feasible |
|---|---|---|---|
${cp.map((p) => `| ${p.archetype} | ${p.archetypeTitle} | ${p.score} | ${p.feasible ? "✅" : "❌"} |`).join("\n")}

## Top 3 Recommendations
${s.top3.map((r, i) => `${i + 1}. **${r.title}** — pillar \`${r.pillar}\`, qualityScore ${r.qualityScore?.toFixed(1) ?? "—"}`).join("\n")}

## Hard Assertions
${s.hardAssertions.map((a) => `- ${a.passed ? "✅" : "❌"} **${a.id}** — ${a.description}${a.reason ? ` _(${a.reason})_` : ""}`).join("\n")}
`;
}

export function writeScenarioReports(report: Sprint18Report, outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  for (const s of report.scenarios) {
    writeFileSync(join(outDir, `${s.id}.md`), renderScenarioMarkdown(s), "utf8");
  }
}

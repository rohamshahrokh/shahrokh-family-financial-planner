/**
 * Family Wealth Lab — Cumulative Decision Engine Regression Test
 *
 * Run with:  npm run test:decision-engine-cumulative
 *
 * Purpose
 * -------
 * This suite is the guard-rail against the kind of regression we hit while
 * shipping Phases 1 / 2 / 3 of the Decision Engine: branches were created in
 * parallel from a common ancestor, and merging the latest phase silently
 * dropped earlier-phase UX, narrative, and intelligence layers.
 *
 * The cumulative system must always carry **all five** layers together:
 *
 *   Layer 1 — Core deterministic financial engine
 *   Layer 2 — Scenario + Monte Carlo + forecasting
 *   Layer 3 — Advisor-grade narrative + behavioural modelling   (Phase 1)
 *   Layer 4 — Financial intelligence + fragility analysis        (Phase 2)
 *   Layer 5 — Autonomous monitoring + evolving recommendations   (Phase 3)
 *
 * Each test below asserts the presence of the public surface produced by one
 * of the phases. If a future merge drops Phase 1 components (the original
 * incident), or Phase 2 intelligence, or Phase 3 autonomous OS, the
 * corresponding section here turns red — before it reaches production.
 *
 * No engine math is exercised here (that's covered by the per-phase suites);
 * this file is intentionally a *structural* and *integration* test.
 *
 * Exit 0 on all pass, 1 on any failure.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

let failures = 0;
let passes = 0;
const repo = resolve(import.meta.dirname, "..");

function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passes += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function fileExists(rel: string): boolean {
  return existsSync(resolve(repo, rel));
}

function fileContains(rel: string, needle: string | RegExp): boolean {
  const p = resolve(repo, rel);
  if (!existsSync(p)) return false;
  const src = readFileSync(p, "utf8");
  return typeof needle === "string" ? src.includes(needle) : needle.test(src);
}

function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 1 — Advisor-grade narrative + behavioural modelling
// ───────────────────────────────────────────────────────────────────────────
section("Phase 1 — Advisor-grade narrative + behavioural modelling");

check(
  "QuestionFramework component is present",
  fileExists("client/src/components/decisionEngine/QuestionFramework.tsx"),
);
check(
  "BehaviouralPrioritiesPanel component is present",
  fileExists("client/src/components/decisionEngine/BehaviouralPrioritiesPanel.tsx"),
);
check(
  "AdvancedAssumptionCapture component is present",
  fileExists("client/src/components/decisionEngine/AdvancedAssumptionCapture.tsx"),
);
check(
  "RiskFieldExplainer component is present",
  fileExists("client/src/components/decisionEngine/RiskFieldExplainer.tsx"),
);
check(
  "behaviouralPriorities registry is present",
  fileExists("client/src/lib/scenarioV2/registry/behaviouralPriorities.ts"),
);
check(
  "riskExplainability metadata module is present",
  fileExists("client/src/lib/scenarioV2/riskExplainability.ts"),
);

check(
  "registry exports DEFAULT_PRIORITIES + BehaviouralPriorities",
  fileContains("client/src/lib/scenarioV2/registry/index.ts", "DEFAULT_PRIORITIES") &&
    fileContains("client/src/lib/scenarioV2/registry/index.ts", "BehaviouralPriorities"),
);

check(
  "narrativeLayer exposes the V3 ten-section order",
  fileContains("client/src/lib/scenarioV2/decisionEngine/narrativeLayer.ts", "V3_SECTION_ORDER"),
);
check(
  "narrative section: whyThisPathWon",
  fileContains("client/src/lib/scenarioV2/decisionEngine/narrativeLayer.ts", "whyThisPathWon"),
);
check(
  "narrative section: whyAlternativesLost",
  fileContains("client/src/lib/scenarioV2/decisionEngine/narrativeLayer.ts", "whyAlternativesLost"),
);
check(
  "narrative section: whatChangesTheAnswer",
  fileContains("client/src/lib/scenarioV2/decisionEngine/narrativeLayer.ts", "whatChangesTheAnswer"),
);
check(
  "narrative section: behaviouralRiskCommentary",
  fileContains(
    "client/src/lib/scenarioV2/decisionEngine/narrativeLayer.ts",
    "behaviouralRiskCommentary",
  ),
);
check(
  "narrative section: sensitivityAnalysis",
  fileContains("client/src/lib/scenarioV2/decisionEngine/narrativeLayer.ts", "sensitivityAnalysis"),
);
check(
  "narrative section: stressTestCommentary",
  fileContains(
    "client/src/lib/scenarioV2/decisionEngine/narrativeLayer.ts",
    "stressTestCommentary",
  ),
);
check(
  "narrative section: keyAssumptionsDrivingOutcome",
  fileContains(
    "client/src/lib/scenarioV2/decisionEngine/narrativeLayer.ts",
    "keyAssumptionsDrivingOutcome",
  ),
);
check(
  "narrative section: tacticalNextActions",
  fileContains("client/src/lib/scenarioV2/decisionEngine/narrativeLayer.ts", "tacticalNextActions"),
);

check(
  "narrative supports simple / advisor / quant modes",
  fileContains("client/src/lib/scenarioV2/decisionEngine/narrativeLayer.ts", /NarrativeMode/),
);

// ───────────────────────────────────────────────────────────────────────────
// Phase 2 — Financial Intelligence Layer
// ───────────────────────────────────────────────────────────────────────────
section("Phase 2 — Financial Intelligence Layer");

check(
  "intelligence module index is present",
  fileExists("client/src/lib/scenarioV2/intelligence/index.ts"),
);
check(
  "fragility scanner is present",
  fileExists("client/src/lib/scenarioV2/intelligence/fragility.ts"),
);
check(
  "turning-point detector is present",
  fileExists("client/src/lib/scenarioV2/intelligence/turningPoints.ts"),
);
check(
  "weakest-link analyser is present",
  fileExists("client/src/lib/scenarioV2/intelligence/weakPoint.ts"),
);
check(
  "assumption-dependency ranker is present",
  fileExists("client/src/lib/scenarioV2/intelligence/assumptionDependency.ts"),
);
check(
  "regime dependency module is present",
  fileExists("client/src/lib/scenarioV2/intelligence/regime.ts"),
);
check(
  "behavioural survivability module is present",
  fileExists("client/src/lib/scenarioV2/intelligence/behavioural.ts"),
);
check(
  "path robustness scorer is present",
  fileExists("client/src/lib/scenarioV2/intelligence/pathRobustness.ts"),
);
check(
  "drift detection / adaptive recommendation module is present",
  fileExists("client/src/lib/scenarioV2/intelligence/adaptiveRecommendation.ts"),
);
check(
  "explainability memo builder is present",
  fileExists("client/src/lib/scenarioV2/intelligence/explainability.ts"),
);
check(
  "strategic intelligence cards module is present",
  fileExists("client/src/lib/scenarioV2/intelligence/insightCards.ts"),
);

check(
  "InsightCard UI primitive is present",
  fileExists("client/src/components/decisionEngine/intelligence/InsightCard.tsx"),
);
check(
  "IntelligenceSection container is present",
  fileExists("client/src/components/decisionEngine/intelligence/IntelligenceSection.tsx"),
);

check(
  "scenarioV2 barrel re-exports buildFinancialIntelligence",
  fileContains("client/src/lib/scenarioV2/index.ts", "buildFinancialIntelligence"),
);

// ───────────────────────────────────────────────────────────────────────────
// Phase 3 — Autonomous Financial OS
// ───────────────────────────────────────────────────────────────────────────
section("Phase 3 — Autonomous Financial OS");

check(
  "autonomous module index is present",
  fileExists("client/src/lib/scenarioV2/autonomous/index.ts"),
);
check(
  "monitoring signals module is present",
  fileExists("client/src/lib/scenarioV2/autonomous/monitoring.ts"),
);
check(
  "recommendation evolution module is present",
  fileExists("client/src/lib/scenarioV2/autonomous/recommendationEvolution.ts"),
);
check(
  "trajectory drift module is present",
  fileExists("client/src/lib/scenarioV2/autonomous/drift.ts"),
);
check(
  "opportunity detection module is present",
  fileExists("client/src/lib/scenarioV2/autonomous/opportunity.ts"),
);
check(
  "dynamic priorities module is present",
  fileExists("client/src/lib/scenarioV2/autonomous/priorities.ts"),
);
check(
  "autonomous alerts module is present",
  fileExists("client/src/lib/scenarioV2/autonomous/alerts.ts"),
);
check(
  "rebalancing module is present",
  fileExists("client/src/lib/scenarioV2/autonomous/rebalancing.ts"),
);
check(
  "life-events module is present",
  fileExists("client/src/lib/scenarioV2/autonomous/lifeEvents.ts"),
);
check(
  "longitudinal comparison module is present",
  fileExists("client/src/lib/scenarioV2/autonomous/longitudinal.ts"),
);
check(
  "autonomous roadmap module is present",
  fileExists("client/src/lib/scenarioV2/autonomous/roadmap.ts"),
);
check(
  "strategic memory module is present",
  fileExists("client/src/lib/scenarioV2/autonomous/strategicMemory.ts"),
);
check(
  "regime classifier module is present",
  fileExists("client/src/lib/scenarioV2/autonomous/regime.ts"),
);
check(
  "AutonomousSection container is present",
  fileExists("client/src/components/decisionEngine/autonomous/AutonomousSection.tsx"),
);

check(
  "scenarioV2 barrel re-exports buildAutonomousReport",
  fileContains("client/src/lib/scenarioV2/index.ts", "buildAutonomousReport"),
);

// Safe storage rule — Phase 3's fix must hold: no browser storage in OS.
// Match actual call sites, not the comment that documents the rule.
check(
  "autonomousMemoryStore does not call localStorage.*",
  !fileContains("client/src/lib/autonomousMemoryStore.ts", /\blocalStorage\s*\./),
);
check(
  "autonomousMemoryStore does not call sessionStorage.*",
  !fileContains("client/src/lib/autonomousMemoryStore.ts", /\bsessionStorage\s*\./),
);
check(
  "autonomousMemoryStore does not call indexedDB.*",
  !fileContains("client/src/lib/autonomousMemoryStore.ts", /\bindexedDB\s*\./),
);

// ───────────────────────────────────────────────────────────────────────────
// Decision page integration — the entire cumulative stack is wired
// ───────────────────────────────────────────────────────────────────────────
section("Decision page — cumulative wiring");

const decisionPage = "client/src/pages/decision.tsx";

// Phase 1 wiring
check("decision.tsx imports QuestionFramework", fileContains(decisionPage, "QuestionFramework"));
check(
  "decision.tsx imports BehaviouralPrioritiesPanel",
  fileContains(decisionPage, "BehaviouralPrioritiesPanel"),
);
check(
  "decision.tsx imports AdvancedAssumptionCapture",
  fileContains(decisionPage, "AdvancedAssumptionCapture"),
);
check("decision.tsx imports RiskFieldExplainer", fileContains(decisionPage, "RiskFieldExplainer"));
check(
  "decision.tsx renders <QuestionFramework",
  fileContains(decisionPage, /<QuestionFramework[\s\S]{0,200}onChange/),
);
check(
  "decision.tsx renders <BehaviouralPrioritiesPanel",
  fileContains(decisionPage, /<BehaviouralPrioritiesPanel/),
);
check(
  "decision.tsx renders <AdvancedAssumptionCapture",
  fileContains(decisionPage, /<AdvancedAssumptionCapture/),
);

// Phase 2 wiring
check(
  "decision.tsx imports IntelligenceSection",
  fileContains(decisionPage, "IntelligenceSection"),
);
check(
  "decision.tsx renders <IntelligenceSection",
  fileContains(decisionPage, /<IntelligenceSection[\s\S]{0,200}output=/),
);

// Phase 3 wiring
check("decision.tsx imports AutonomousSection", fileContains(decisionPage, "AutonomousSection"));
check(
  "decision.tsx renders <AutonomousSection",
  fileContains(decisionPage, /<AutonomousSection/),
);

// Layering: Intelligence and Autonomous must EXTEND the narrative report,
// not replace it. NarrativeReport must still be the headline surface.
check(
  "decision.tsx still imports NarrativeReport (Phase 1 advisor narrative remains primary)",
  fileContains(decisionPage, "NarrativeReport"),
);

// Progressive disclosure rule — Phase 3 sits BELOW Phase 2 which sits BELOW
// the narrative. A simple proxy: AutonomousSection must appear after
// IntelligenceSection in the file.
function findIndex(src: string, needle: string): number {
  return src.indexOf(needle);
}
const decisionSrc = readFileSync(resolve(repo, decisionPage), "utf8");
const narrativeIdx = findIndex(decisionSrc, "NarrativeReport");
const intelligenceIdx = findIndex(decisionSrc, "<IntelligenceSection");
const autonomousIdx = findIndex(decisionSrc, "<AutonomousSection");
check(
  "narrative report renders before IntelligenceSection",
  narrativeIdx > 0 && intelligenceIdx > 0 && narrativeIdx < intelligenceIdx,
);
check(
  "IntelligenceSection renders before AutonomousSection (progressive disclosure)",
  intelligenceIdx > 0 && autonomousIdx > 0 && intelligenceIdx < autonomousIdx,
);

// ───────────────────────────────────────────────────────────────────────────
// Summary
// ───────────────────────────────────────────────────────────────────────────
console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) {
  console.log(
    "Cumulative regression detected. The Decision Engine must always carry " +
      "Phase 1 (advisor narrative + behavioural) + Phase 2 (intelligence) + " +
      "Phase 3 (autonomous OS) together, not as replacements.",
  );
  process.exit(1);
}
process.exit(0);

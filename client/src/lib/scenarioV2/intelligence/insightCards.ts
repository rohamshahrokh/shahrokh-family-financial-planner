/**
 * Reusable Insight Cards aggregator — converts intelligence-module
 * findings into a uniform InsightCard[] surface for the UI.
 *
 * Cards available (PART 11 taxonomy):
 *   - Fragility Alert
 *   - Regime Dependency
 *   - Leverage Pressure
 *   - FIRE Delay Risk
 *   - Behavioural Risk
 *   - Liquidity Compression
 *   - Opportunity Window
 *   - Assumption Dependency
 *   - Turning Point Warning
 *   - Strategy Drift
 *   - Sequence Risk
 *   - Refinance Risk
 *   - Inflation Exposure
 *   - Concentration Risk
 *   - Cashflow Compression
 *
 * Each card carries severity / kind / category / drivers — the UI sorts
 * and groups uniformly.
 */

import type { RankedCandidate } from "../decisionEngine/candidateGenerator";
import type { ExtendedScenarioResult } from "../runScenario";
import type {
  AssumptionImpact,
  BehaviouralFinding,
  DriftFinding,
  FragilityFinding,
  InsightCard,
  InsightSeverity,
  PathRobustness,
  RecommendationDelta,
  RegimeDependency,
  TurningPoint,
  WeakestLink,
} from "./types";

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  critical: 3,
  warn: 2,
  watch: 1,
  info: 0,
};

interface BuildCardsInput {
  winner: RankedCandidate;
  baseline: ExtendedScenarioResult;
  turningPoints: TurningPoint[];
  fragility: FragilityFinding[];
  assumptions: AssumptionImpact[];
  weakestLink: WeakestLink;
  regime: RegimeDependency[];
  behavioural: BehaviouralFinding[];
  robustness: PathRobustness;
  recommendationDelta: RecommendationDelta;
  drift: DriftFinding[];
}

export function buildInsightCards(input: BuildCardsInput): InsightCard[] {
  const cards: InsightCard[] = [];

  // Turning points → Turning Point Warning / FIRE Delay / Liquidity Compression / Leverage Pressure / Refinance Risk
  for (const tp of input.turningPoints) {
    const kind = mapTurningPointKind(tp);
    cards.push({
      id: `card.${tp.id}`,
      kind: kind.kind,
      category: kind.category,
      severity: tp.severity,
      title: kind.title,
      body: tp.description,
      threshold: tp.threshold,
      drivers: tp.drivers,
      tags: ["turning-point"],
    });
  }

  // Fragility findings → Fragility Alert / Concentration / Inflation / Sequence
  for (const f of input.fragility) {
    const mapped = mapFragility(f);
    cards.push({
      id: `card.${f.id}`,
      kind: mapped.kind,
      category: mapped.category,
      severity: f.severity,
      title: mapped.title,
      body: f.description,
      drivers: f.drivers,
      tags: ["fragility"],
    });
  }

  // Behavioural findings → Behavioural Risk cards
  for (const b of input.behavioural) {
    if (b.risk < 0.3) continue;
    cards.push({
      id: `card.behavioural.${b.axis}`,
      kind: "behavioural-risk",
      category: "behavioural",
      severity: b.severity,
      title: `Behavioural risk: ${b.axis.replace(/-/g, " ")}`,
      body: b.description,
      drivers: ["riskMetrics", "candidate.allocation"],
      tags: ["behavioural"],
    });
  }

  // Top regime dependency: surface strongest fragile + strongest "strong" as cards
  const fragileRegimes = input.regime.filter((r) => r.performance === "fragile");
  if (fragileRegimes.length > 0) {
    const top = fragileRegimes[0];
    cards.push({
      id: `card.regime.${top.regime}`,
      kind: "regime-dependency",
      category: "regime",
      severity: "warn",
      title: `Regime dependency: ${top.label}`,
      body: top.rationale,
      drivers: ["candidate.allocation", "leverage"],
      tags: ["regime", "fragile"],
    });
  }
  const opportunityRegimes = input.regime.filter((r) => r.performance === "strong");
  if (opportunityRegimes.length > 0) {
    const top = opportunityRegimes[0];
    cards.push({
      id: `card.opportunity.${top.regime}`,
      kind: "opportunity-window",
      category: "opportunity",
      severity: "info",
      title: `Opportunity window: ${top.label}`,
      body: top.rationale,
      drivers: ["candidate.allocation"],
      tags: ["regime", "opportunity"],
    });
  }

  // Top assumption dependency card
  if (input.assumptions.length > 0) {
    const top = input.assumptions[0];
    cards.push({
      id: `card.assumption.${top.key}`,
      kind: "assumption-dependency",
      category: "assumption",
      severity: top.impactBand === "high" ? "warn" : top.impactBand === "medium" ? "watch" : "info",
      title: `Critical assumption: ${top.label.toLowerCase()}`,
      body: top.impactDescription,
      threshold: top.quant
        ? { label: top.quant.label, value: top.quant.value, unit: top.quant.unit, confidence: "medium" }
        : undefined,
      drivers: ["assumptions.registry"],
      tags: ["assumption"],
    });
  }

  // Strategy drift / recommendation change card
  if (input.recommendationDelta.changed) {
    cards.push({
      id: "card.strategy-drift.recommendation-change",
      kind: "recommendation-change",
      category: "drift",
      severity: "watch",
      title: "Recommendation changed since the last run",
      body: input.recommendationDelta.reason,
      details: input.recommendationDelta.diffs,
      drivers: ["priorContext.previousWinner"],
      tags: ["drift"],
    });
  }

  // Drift findings cards
  for (const d of input.drift) {
    const kindMap: Record<DriftFinding["kind"], { kind: InsightCard["kind"]; title: string; category: InsightCard["category"] }> = {
      "spending-creep": { kind: "strategy-drift", title: "Spending creep detected", category: "drift" },
      "savings-rate-decline": { kind: "strategy-drift", title: "Savings rate is declining", category: "drift" },
      "leverage-increase": { kind: "leverage-pressure", title: "Leverage is increasing", category: "leverage" },
      "fire-delay": { kind: "fire-delay-risk", title: "FIRE date is drifting later", category: "drift" },
      "liquidity-deterioration": { kind: "liquidity-compression", title: "Liquidity buffer is compressing", category: "liquidity" },
      "cashflow-weakening": { kind: "cashflow-compression", title: "Cashflow is weakening", category: "drift" },
    };
    const mapped = kindMap[d.kind];
    cards.push({
      id: `card.drift.${d.kind}`,
      kind: mapped.kind,
      category: mapped.category,
      severity: d.severity,
      title: mapped.title + (d.needsHistory ? " — needs history" : ""),
      body: d.description,
      drivers: ["dashboardInputs.history"],
      tags: ["drift", d.needsHistory ? "needs-history" : "history-driven"],
    });
  }

  // Robustness summary card (always emitted)
  cards.push({
    id: "card.robustness.summary",
    kind: "robustness-summary",
    category: "robustness",
    severity: input.robustness.classification === "high-return-fragile" ? "watch" : "info",
    title: `Path robustness: ${humaniseRobustness(input.robustness.classification)}`,
    body: input.robustness.tradeoff,
    details: input.robustness.rationale,
    drivers: ["robustnessScore", "returnScore"],
    tags: ["robustness"],
  });

  // Weakest link card (always emitted)
  cards.push({
    id: "card.weakest-link",
    kind: "weakest-link",
    category: "weak-point",
    severity: "watch",
    title: "Strategic weakest link",
    body: input.weakestLink.primary,
    details: [
      `Bottleneck: ${input.weakestLink.bottleneck}`,
      `Dominant risk: ${input.weakestLink.dominantRisk}`,
      ...(input.weakestLink.fireBlocker ? [`FIRE blocker: ${input.weakestLink.fireBlocker}`] : []),
    ],
    drivers: ["fragility", "riskMetrics"],
    tags: ["weak-point"],
  });

  // De-dupe by id (defensive) + sort by severity desc then by kind for determinism
  const seen = new Set<string>();
  return cards
    .filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .sort((a, b) => {
      const d = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (d !== 0) return d;
      return a.kind.localeCompare(b.kind);
    });
}

export function selectCriticalFindings(cards: InsightCard[], n = 5): InsightCard[] {
  return cards
    .filter((c) => c.severity === "critical" || c.severity === "warn")
    .slice(0, n);
}

function mapTurningPointKind(tp: TurningPoint): {
  kind: InsightCard["kind"];
  title: string;
  category: InsightCard["category"];
} {
  switch (tp.kind) {
    case "recommendation-flip":
      return { kind: "turning-point-warning", title: "Recommendation flip threshold", category: "turning-point" };
    case "risk-acceleration":
      return { kind: "turning-point-warning", title: "Risk acceleration threshold", category: "turning-point" };
    case "leverage-unsafe":
      return { kind: "leverage-pressure", title: "Leverage pressure threshold", category: "leverage" };
    case "fire-collapse":
      return { kind: "fire-delay-risk", title: "FIRE trajectory breakpoint", category: "turning-point" };
    case "liquidity-stress":
      return { kind: "liquidity-compression", title: "Liquidity stress threshold", category: "liquidity" };
    case "debt-dominant":
      return { kind: "leverage-pressure", title: "Debt-service dominance", category: "leverage" };
    case "serviceability-weak":
      return { kind: "refinance-risk", title: "Refinance pressure threshold", category: "leverage" };
    case "volatility-intolerance":
      return { kind: "behavioural-risk", title: "Volatility tolerance breach", category: "behavioural" };
  }
}

function mapFragility(f: FragilityFinding): {
  kind: InsightCard["kind"];
  title: string;
  category: InsightCard["category"];
} {
  switch (f.kind) {
    case "concentration":
      return { kind: "concentration-risk", title: "Concentration risk", category: "concentration" };
    case "inflation-sensitivity":
      return { kind: "inflation-exposure", title: "Inflation exposure", category: "fragility" };
    case "sequence-risk":
      return { kind: "sequence-risk", title: "Sequence-of-returns risk", category: "fragility" };
    case "refinancing-dependency":
      return { kind: "refinance-risk", title: "Refinance dependency", category: "leverage" };
    case "leverage-dependence":
      return { kind: "leverage-pressure", title: "Leverage dependence", category: "leverage" };
    case "liquidity-illusion":
      return { kind: "liquidity-compression", title: "Liquidity illusion", category: "liquidity" };
    default:
      return { kind: "fragility-alert", title: humaniseFragility(f.kind), category: "fragility" };
  }
}

function humaniseFragility(k: FragilityFinding["kind"]): string {
  return k.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function humaniseRobustness(k: PathRobustness["classification"]): string {
  switch (k) {
    case "high-return-robust": return "high-return, robust";
    case "high-return-acceptable": return "high-return, acceptable robustness";
    case "lower-return-robust": return "lower-return, robust";
    case "high-return-fragile": return "high-return, fragile";
    case "balanced": return "balanced";
    case "moderate": return "moderate";
  }
}

/**
 * Autonomous Financial OS — public entrypoint.
 *
 * Composes Parts 1–15 into a single deterministic AutonomousReport that
 * sits on top of the Decision Engine + Financial Intelligence layer.
 *
 *   QuickDecisionOutput  +  FinancialIntelligenceReport  +  history?  +  memory?
 *      │
 *      ▼ buildMonitoringSignals()
 *      ▼ buildRecommendationEvolution()
 *      ▼ classifyRegime()
 *      ▼ detectOpportunities()
 *      ▼ detectTrajectoryDrift()
 *      ▼ buildPriorities()
 *      ▼ detectRebalancing()
 *      ▼ simulateLifeEvents()
 *      ▼ buildAutonomousAlerts()
 *      ▼ buildLongitudinal()
 *      ▼ buildRoadmap()
 *      ▼ summariseStrategicMemory()
 *      ▼ buildVisualisations()
 *
 *   AutonomousReport
 */

import type { QuickDecisionOutput } from "../decisionEngine/candidateGenerator";
import type { FinancialIntelligenceReport } from "../intelligence/types";
import type { BasePlanAssumptions } from "../types";
import type {
  AutonomousReport,
  LedgerSnapshot,
  MacroRegimeSignals,
  StrategicMemoryInput,
} from "./types";
import { buildMonitoringSignals } from "./monitoring";
import { buildRecommendationEvolution } from "./recommendationEvolution";
import { classifyRegime } from "./regime";
import { detectOpportunities } from "./opportunity";
import { detectTrajectoryDrift } from "./drift";
import { buildPriorities } from "./priorities";
import { detectRebalancing } from "./rebalancing";
import { simulateLifeEvents } from "./lifeEvents";
import { buildAutonomousAlerts } from "./alerts";
import { buildLongitudinal } from "./longitudinal";
import { buildRoadmap } from "./roadmap";
import { summariseStrategicMemory } from "./strategicMemory";
import { buildVisualisations } from "./visualisations";

export interface BuildAutonomousInput {
  output: QuickDecisionOutput;
  intelligence: FinancialIntelligenceReport;
  assumptions: BasePlanAssumptions;
  history?: LedgerSnapshot[];
  memory?: StrategicMemoryInput | null;
  regimeSignals?: MacroRegimeSignals;
  liquidityFloorMonths?: number;
  preferredMaxLvr?: number;
  /** Stable date stamp for deterministic IDs / output meta. Defaults to constant. */
  generatedAt?: string;
}

export function buildAutonomousReport(input: BuildAutonomousInput): AutonomousReport {
  const {
    output,
    intelligence,
    assumptions,
    history = [],
    memory = null,
    regimeSignals,
    liquidityFloorMonths = 6,
    preferredMaxLvr = 0.80,
    generatedAt = "1970-01-01",
  } = input;

  const winner = output.ranked[0] ?? null;
  const baseline = output.baseScenarioResult;

  if (!winner || !baseline) {
    return emptyReport(generatedAt, output.baseScenarioResult?.scenarioId ?? "unknown");
  }

  const monitoring = buildMonitoringSignals({
    winner,
    baseline,
    history,
    liquidityFloorMonths,
    preferredMaxLvr,
  });

  const regime = classifyRegime({ signals: regimeSignals, assumptions });

  const recommendationChange = buildRecommendationEvolution({
    winner,
    baseline,
    memory,
    history,
  });

  const opportunities = detectOpportunities({
    winner,
    baseline,
    regime,
    history,
    liquidityFloorMonths,
  });

  const drift = detectTrajectoryDrift({ baseline, history });

  const rebalancing = detectRebalancing({ baseline, history, memory });

  const lifeEvents = simulateLifeEvents({ baseline, history, memory });

  const alerts = buildAutonomousAlerts({
    baseline,
    monitoring,
    drift,
    opportunities,
    regime,
    history,
    liquidityFloorMonths,
  });

  const priorities = buildPriorities({
    winner,
    monitoring,
    opportunities,
    drift,
    alerts,
  });

  const longitudinal = buildLongitudinal({ history });
  const roadmap = buildRoadmap({ monitoring, drift, opportunities, alerts, regime });
  const strategicMemoryEcho = summariseStrategicMemory(memory);

  const visuals = buildVisualisations({
    baseline,
    monitoring,
    drift,
    priorities,
    regime,
    fragility: intelligence.fragility,
    assumptions: intelligence.assumptions,
    regimes: intelligence.regime,
    history,
  });

  // Critical findings — top-of-page hero list (deterministic, capped at 5)
  const critical: AutonomousReport["criticalFindings"] = [];
  for (const a of alerts) {
    if (a.severity !== "critical" && a.severity !== "warn") continue;
    critical.push({ id: a.id, title: a.title, body: a.body, severity: a.severity, source: "alert" });
    if (critical.length >= 3) break;
  }
  for (const p of priorities) {
    if (critical.length >= 5) break;
    if (p.urgency === "immediate" || p.urgency === "near-term") {
      critical.push({ id: p.id, title: p.title, body: p.rationale, severity: p.urgency === "immediate" ? "critical" : "warn", source: "priority" });
    }
  }
  for (const m of monitoring) {
    if (critical.length >= 5) break;
    if (m.severity === "critical") {
      critical.push({ id: m.id, title: m.label, body: m.summary, severity: m.severity, source: "monitoring" });
    }
  }

  return {
    generatedAt,
    scenarioId: baseline.scenarioId,
    monitoring,
    recommendationChange,
    regime,
    opportunities,
    drift,
    priorities,
    rebalancing,
    lifeEvents,
    alerts,
    longitudinal,
    roadmap,
    strategicMemory: strategicMemoryEcho,
    visuals,
    criticalFindings: critical,
    meta: {
      hasHistory: history.length >= 2,
      isBaselineRecommendation: !memory?.lastWinnerId,
      regimeNote: regime.label,
      memoryActive: strategicMemoryEcho.hasMemory,
    },
  };
}

function emptyReport(generatedAt: string, scenarioId: string): AutonomousReport {
  return {
    generatedAt,
    scenarioId,
    monitoring: [],
    recommendationChange: {
      changed: false,
      reason: "No winning recommendation available — engine produced no ranked candidates.",
      factors: [],
      previousLabel: null,
      currentLabel: "(none)",
    },
    regime: {
      regime: "neutral",
      label: "Neutral / mixed regime",
      confidence: 0.3,
      rationale: "No engine output to classify.",
      implications: [],
      drivers: [],
    },
    opportunities: [],
    drift: [],
    priorities: [],
    rebalancing: [],
    lifeEvents: [],
    alerts: [],
    longitudinal: { window: "vs 6 months ago", hasHistory: false, summary: [], deltas: [] },
    roadmap: [],
    strategicMemory: { hasMemory: false, summary: [], activeConstraints: [] },
    visuals: {
      trajectoryDrift: { id: "vis-trajectory-drift", label: "FIRE trajectory drift", description: "(empty)", hasHistory: false, data: [], unit: "years" },
      fragilityMap: [],
      dependencyMap: [],
      priorityEvolution: { id: "vis-priority-evolution", label: "Priority stack evolution", description: "(empty)", hasHistory: false, data: [], unit: "rank" },
      recommendationEvolution: { id: "vis-recommendation-evolution", label: "Recommendation evolution", description: "(empty)", hasHistory: false, data: [], unit: "label" },
      regimeMap: [],
      allocationDrift: { id: "vis-allocation-drift", label: "Top-holding share over time", description: "(empty)", hasHistory: false, data: [], unit: "%" },
      survivabilityTrend: { id: "vis-survivability", label: "Survivability trend", description: "(empty)", hasHistory: false, data: [], unit: "months" },
    },
    criticalFindings: [],
    meta: { hasHistory: false, isBaselineRecommendation: true, regimeNote: "Neutral", memoryActive: false },
  };
}

// Re-exports
export type {
  AutonomousReport,
  AlertChannel,
  AllocationSnapshot,
  AutonomousAlert,
  ChangeNarrative,
  ChartSeries,
  ChartSeriesPoint,
  DriftKind,
  IsoDate,
  LedgerSnapshot,
  LifeEventImpact,
  LifeEventKind,
  LongitudinalComparison,
  MacroRegime,
  MacroRegimeSignals,
  MonitoringDimension,
  MonitoringDirection,
  MonitoringSignal,
  OpportunityKind,
  OpportunityWindow,
  PriorityItem,
  PriorityUrgency,
  RebalanceKind,
  RebalanceSignal,
  RegimeClassification,
  RoadmapHorizon,
  RoadmapHorizonPlan,
  StrategicMemoryInput,
  TrajectoryDrift,
  VisualisationsBundle,
} from "./types";

export { buildMonitoringSignals } from "./monitoring";
export { buildRecommendationEvolution } from "./recommendationEvolution";
export { classifyRegime } from "./regime";
export { detectOpportunities } from "./opportunity";
export { detectTrajectoryDrift } from "./drift";
export { buildPriorities } from "./priorities";
export { detectRebalancing } from "./rebalancing";
export { simulateLifeEvents } from "./lifeEvents";
export { buildAutonomousAlerts } from "./alerts";
export { buildLongitudinal } from "./longitudinal";
export { buildRoadmap } from "./roadmap";
export { summariseStrategicMemory } from "./strategicMemory";
export { buildVisualisations } from "./visualisations";

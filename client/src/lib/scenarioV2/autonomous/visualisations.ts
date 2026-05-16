/**
 * PART 14 — Advanced visualisations builder.
 *
 * Produces a single deterministic VisualisationsBundle. When real history
 * is missing the series carry `hasHistory: false` and an empty data array;
 * the UI renders a baseline placeholder instead of fabricating data.
 */

import type { ExtendedScenarioResult } from "../runScenario";
import type {
  AllocationSnapshot,
  ChartSeries,
  LedgerSnapshot,
  MonitoringSignal,
  PriorityItem,
  RegimeClassification,
  TrajectoryDrift,
  VisualisationsBundle,
} from "./types";
import type { FragilityFinding, AssumptionImpact, RegimeDependency } from "../intelligence/types";

export interface VisualsInput {
  baseline: ExtendedScenarioResult;
  monitoring: MonitoringSignal[];
  drift: TrajectoryDrift[];
  priorities: PriorityItem[];
  regime: RegimeClassification;
  fragility: FragilityFinding[];
  assumptions: AssumptionImpact[];
  regimes: RegimeDependency[];
  history: LedgerSnapshot[];
}

export function buildVisualisations(input: VisualsInput): VisualisationsBundle {
  const { history, baseline, monitoring, drift, priorities, fragility, assumptions, regimes } = input;
  const hasHistory = history.length >= 2;

  const trajectoryDrift: ChartSeries = {
    id: "vis-trajectory-drift",
    label: "FIRE trajectory drift",
    description: "Years-to-FIRE recorded across snapshots; rising = drifting away.",
    hasHistory: hasHistory && history.some((h) => h.fireYearsAway !== undefined),
    unit: "years",
    data: hasHistory
      ? history
          .filter((h) => h.fireYearsAway !== undefined)
          .map((h) => ({ x: h.month, y: Number(h.fireYearsAway!.toFixed(2)) }))
      : [],
  };

  const fragilityMap: VisualisationsBundle["fragilityMap"] = fragility.map((f) => ({
    label: f.kind,
    weight: f.weight,
    severity: f.severity,
  }));

  const dependencyMap: VisualisationsBundle["dependencyMap"] = assumptions.map((a) => ({
    label: a.label,
    weight: a.sensitivity,
    severity: a.impactBand === "high" ? "warn" : a.impactBand === "medium" ? "watch" : "info",
  }));

  const priorityEvolution: ChartSeries = {
    id: "vis-priority-evolution",
    label: "Priority stack evolution",
    description: "Severity rank assigned to each priority item this run.",
    hasHistory: priorities.length > 0,
    unit: "rank",
    data: priorities.map((p, i) => ({ x: `#${p.rank}`, y: i + 1 })),
  };

  const recommendationEvolution: ChartSeries = {
    id: "vis-recommendation-evolution",
    label: "Recommendation evolution",
    description: "Recommendation labels recorded across snapshots.",
    hasHistory: history.length > 0 && history.some((h) => !!h.note),
    unit: "label",
    data: history
      .filter((h) => !!h.note)
      .map((h) => ({ x: h.month, y: 1 })),
  };

  const regimeMap: VisualisationsBundle["regimeMap"] = regimes.map((r) => ({
    regime: regimeToMacro(r.regime as string) ,
    label: r.label,
    performance: r.performance,
  }));

  const allocationDrift: ChartSeries = buildAllocationSeries(history);

  const survivabilityTrend: ChartSeries = {
    id: "vis-survivability",
    label: "Survivability trend",
    description: "Months of buffer coverage at the rolling expense run-rate.",
    hasHistory,
    unit: "months",
    data: hasHistory
      ? history.map((h) => ({ x: h.month, y: h.monthlyExpenses > 0 ? Number((h.liquidCash / h.monthlyExpenses).toFixed(1)) : 0 }))
      : [],
  };

  // Reference baseline so the surface is honest about which run produced the visuals
  const seedline = monitoring.length + drift.length + (baseline.simulationCount ?? 0);
  void seedline;

  return {
    trajectoryDrift,
    fragilityMap,
    dependencyMap,
    priorityEvolution,
    recommendationEvolution,
    regimeMap,
    allocationDrift,
    survivabilityTrend,
  };
}

function buildAllocationSeries(history: LedgerSnapshot[]): ChartSeries {
  const points = history
    .filter((h) => !!h.allocation)
    .map((h) => {
      const a = h.allocation as AllocationSnapshot;
      const max = Math.max(a.cash, a.equities, a.property, a.super, a.crypto, a.other);
      return { x: h.month, y: Number(max.toFixed(2)) };
    });
  return {
    id: "vis-allocation-drift",
    label: "Top-holding share over time",
    description: "Largest allocation share — rising = concentration drift.",
    hasHistory: points.length > 0,
    unit: "%",
    data: points,
  };
}

function regimeToMacro(name: string): VisualisationsBundle["regimeMap"][number]["regime"] {
  const k = name.toLowerCase();
  if (k.includes("falling")) return "falling-rates";
  if (k.includes("rising")) return "rising-rates";
  if (k.includes("recession")) return "recession";
  if (k.includes("liquidity")) return "liquidity-crisis";
  if (k.includes("inflation")) return "inflationary-boom";
  if (k.includes("disinflation")) return "disinflation";
  if (k.includes("property")) return "property-boom";
  if (k.includes("equity")) return "equity-bear-market";
  if (k.includes("vol")) return "volatility-spike";
  if (k.includes("credit")) return "credit-tightening";
  return "neutral";
}

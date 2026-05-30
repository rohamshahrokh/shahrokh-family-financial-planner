/**
 * actionRoadmap/metricSourceAttribution.ts — Sprint 28.
 *
 * Helper that tags every visible Action Roadmap metric with the engine module
 * that produced it. The "Audit Mode" toggle on the Action Roadmap page reads
 * the attribution + renders the full human-readable string under each metric.
 *
 * THIS MODULE PERFORMS NO MATH. It is a pure mapping/formatter. The values
 * themselves continue to come from the engine selectors (`pathCompletionEngine`,
 * `montecarloProjection`, `roadmapRiskAnalyzer`, `roadmapAccelerators`,
 * `goalLabConfidence`, …).
 *
 * Honesty rule: if a metric has no engine source, use `source: "notModelled"`
 * and `formatAttribution` returns the literal "Source: Not modelled yet".
 */

export type MetricSource =
  | "scenarioV2.monteCarlo"
  | "scenarioV2.monteCarlo.diagnostic"
  | "scenarioV2.events"
  | "actionRoadmap.pathCompletion"
  | "actionRoadmap.accelerators"
  | "actionRoadmap.risk"
  | "actionRoadmap.reconciliation"
  | "goalLab.orchestrator"
  | "goalLab.confidence"
  | "goalProfile"
  | "canonicalLedger"
  | "reconciliationFailed"
  | "notModelled";

export interface MetricAttribution {
  source: MetricSource;
  percentile?: "p25" | "p50" | "p75";
  simulationCount?: number;
  pathTemplateId?: string;
  note?: string;
}

function sourceLabel(source: MetricSource): string {
  switch (source) {
    case "scenarioV2.monteCarlo":             return "Monte Carlo";
    case "scenarioV2.monteCarlo.diagnostic":  return "MC variance diagnostic";
    case "scenarioV2.events":                 return "Engine event timeline";
    case "actionRoadmap.pathCompletion":      return "Path completion engine";
    case "actionRoadmap.accelerators":        return "Accelerator ranking";
    case "actionRoadmap.risk":                return "Risk analyzer";
    case "actionRoadmap.reconciliation":      return "Financial reconciliation";
    case "goalLab.orchestrator":              return "Goal Lab orchestrator";
    case "goalLab.confidence":                return "Goal Lab confidence";
    case "goalProfile":                       return "Goal profile";
    case "canonicalLedger":                   return "Canonical ledger";
    case "reconciliationFailed":              return "Reconciliation failed";
    case "notModelled":                       return "Not modelled yet";
  }
}

/**
 * Format an attribution into a single human-readable line for the audit chip.
 *
 * Examples:
 *   "Source: Monte Carlo P50 (300 sims)"
 *   "Source: Path completion engine"
 *   "Source: Accelerator ranking · etf-acceleration"
 *   "Source: Not modelled yet"
 */
export function formatAttribution(attr: MetricAttribution): string {
  const parts: string[] = [];
  parts.push(`Source: ${sourceLabel(attr.source)}`);
  if (attr.percentile) parts.push(attr.percentile.toUpperCase());
  if (attr.simulationCount != null && attr.simulationCount > 0) {
    parts.push(`(${attr.simulationCount} sims)`);
  }
  if (attr.pathTemplateId) parts.push(`· ${attr.pathTemplateId}`);
  if (attr.note) parts.push(`— ${attr.note}`);
  return parts.join(" ");
}

/**
 * Compact label used when the audit toggle is OFF. We render a small icon
 * + the source short-name only (no percentile, no sim count).
 */
export function shortAttribution(attr: MetricAttribution): string {
  return sourceLabel(attr.source);
}

/**
 * actionRoadmap/roadmapRiskAnalyzer.ts — Sprint 27.
 *
 * Classifier that turns engine probability/serviceability signals into the
 * brief's five risk axes: Liquidity, Leverage, Cashflow, Concentration,
 * Execution. **NO NEW RISK CALCULATION.** Every band comes from a field the
 * engine already computed (or from the engine's `softWarnings` list).
 *
 * Thresholds are deterministic and documented inline. When a driver field is
 * null/undefined, the axis band is `"unknown"` — the UI must render that as
 * "Not modelled yet", not as "low". An axis is ONLY ever low/medium/high when
 * its driver field has a real engine value.
 *
 * Overall band = max(known axes). If every axis is unknown → overall is
 * `"unknown"` and the UI surfaces the missing-data state honestly.
 */

import type { GoalLabRankedScenario } from "../goalLab/orchestrator";
import type {
  RiskBand,
  RoadmapRiskAxis,
  RoadmapRiskSummary,
} from "./types";

// ─── Public API ────────────────────────────────────────────────────────────

export function analyzeRoadmapRisk(
  scenario: GoalLabRankedScenario | null,
): RoadmapRiskSummary {
  // No scenario → every axis unknown.
  if (!scenario || !scenario.winner) {
    return {
      axes: ALL_AXES.map((a) => ({ ...a, band: "unknown" as RiskBand, driver: "no engine output", detail: "Not modelled yet." })),
      overall: "unknown",
      warnings: [],
    };
  }

  const winner = scenario.winner;
  const result = winner.result;

  // Engine fields — every one of these may be missing on edge-case scenarios.
  const liquidityExhaustionProbability = numberOr(result?.liquidityExhaustionProbability);
  const liquidityStressProbability     = numberOr(result?.liquidityStressProbability);
  const defaultProbability             = numberOr(result?.defaultProbability);
  const negativeEquityProbability      = numberOr(result?.negativeEquityProbability);
  const refinancePressureProbability   = numberOr(result?.refinancePressureProbability);
  const nsr                            = numberOr((result as unknown as { serviceability?: { nsr?: number } } | undefined)?.serviceability?.nsr);

  const softWarnings = winner.softWarnings ?? [];
  const events = winner.events ?? [];

  // ── Liquidity: driver = liquidityExhaustionProbability ────────────────
  const liquidity: RoadmapRiskAxis = (() => {
    if (liquidityExhaustionProbability == null) {
      return baseAxis("liquidity", "Liquidity", "unknown", "no liquidity probability available", "Not modelled yet.");
    }
    const band: RiskBand = liquidityExhaustionProbability >= 0.20
      ? "high"
      : liquidityExhaustionProbability >= 0.05 ? "medium" : "low";
    return baseAxis(
      "liquidity",
      "Liquidity",
      band,
      "liquidityExhaustionProbability",
      `Engine estimates ${(liquidityExhaustionProbability * 100).toFixed(1)}% probability of cash dropping to ≤0 in any month.`,
    );
  })();

  // ── Leverage: driver = nsr (serviceability) OR negativeEquityProbability ─
  const leverage: RoadmapRiskAxis = (() => {
    if (nsr == null && negativeEquityProbability == null) {
      return baseAxis("leverage", "Leverage", "unknown", "no serviceability or negative-equity signal", "Not modelled yet.");
    }
    // NSR < 1.0 → high. NSR < 1.10 → medium. Otherwise low — and overlay
    // negative-equity probability as a high-band trigger.
    let band: RiskBand = "low";
    let driver = "serviceability.nsr";
    let detail = nsr != null
      ? `Net-service ratio at buffered rate is ${nsr.toFixed(2)} (≥1.10 passes, <1.0 fails).`
      : "Engine could not compute net-service ratio for this path.";
    if (nsr != null && nsr < 1.0) band = "high";
    else if (nsr != null && nsr < 1.10) band = "medium";

    if (negativeEquityProbability != null && negativeEquityProbability >= 0.20) {
      band = "high";
      driver = "negativeEquityProbability";
      detail = `Engine estimates ${(negativeEquityProbability * 100).toFixed(1)}% probability of negative equity within the horizon.`;
    } else if (negativeEquityProbability != null && negativeEquityProbability >= 0.05 && band !== "high") {
      band = band === "low" ? "medium" : band;
    }
    return baseAxis("leverage", "Leverage", band, driver, detail);
  })();

  // ── Cashflow: driver = defaultProbability ─────────────────────────────
  const cashflow: RoadmapRiskAxis = (() => {
    if (defaultProbability == null) {
      return baseAxis("cashflow", "Cashflow", "unknown", "no default probability available", "Not modelled yet.");
    }
    const band: RiskBand = defaultProbability >= 0.15
      ? "high"
      : defaultProbability >= 0.05 ? "medium" : "low";
    let detail = `Engine estimates ${(defaultProbability * 100).toFixed(1)}% probability of household insolvency within the horizon.`;
    if (liquidityStressProbability != null && liquidityStressProbability >= 0.10 && band === "low") {
      detail += ` Liquidity-stress probability is ${(liquidityStressProbability * 100).toFixed(1)}%.`;
    }
    return baseAxis("cashflow", "Cashflow", band, "defaultProbability", detail);
  })();

  // ── Concentration: driver = softWarnings with concentration ids ───────
  const concentration: RoadmapRiskAxis = (() => {
    const concentrationWarnings = softWarnings.filter((w) =>
      ["crypto-exposure", "downside-tail"].includes(w.id),
    );
    if (concentrationWarnings.length === 0) {
      // No engine signal in this dimension — UNKNOWN, not low. We never invent
      // a "low" classification without an underlying engine signal.
      return baseAxis("concentration", "Concentration", "unknown", "no concentration signal from engine", "Not modelled yet.");
    }
    const hasCritical = concentrationWarnings.some((w) => w.severity === "critical");
    const hasWarn = concentrationWarnings.some((w) => w.severity === "warn");
    const band: RiskBand = hasCritical ? "high" : hasWarn ? "medium" : "low";
    const detail = concentrationWarnings.map((w) => w.label).join("; ");
    return baseAxis("concentration", "Concentration", band, "softWarnings", detail);
  })();

  // ── Execution: driver = number of events + refinance pressure ────────
  const execution: RoadmapRiskAxis = (() => {
    const eventCount = events.length;
    const refiSignal = refinancePressureProbability;
    if (eventCount === 0 && refiSignal == null) {
      return baseAxis("execution", "Execution", "unknown", "no events and no refi signal", "Not modelled yet.");
    }
    // High when many discrete actions are required AND refi pressure is non-trivial.
    let band: RiskBand = "low";
    let detail = `${eventCount} engine-modelled milestone${eventCount === 1 ? "" : "s"} to execute.`;
    if (eventCount >= 4) {
      band = "medium";
      detail += " Multiple coordinated actions increase execution risk.";
    }
    if (refiSignal != null && refiSignal >= 0.20) {
      band = "high";
      detail += ` Engine estimates ${(refiSignal * 100).toFixed(1)}% refinance-pressure probability.`;
    } else if (refiSignal != null && refiSignal >= 0.05 && band === "low") {
      band = "medium";
      detail += ` Refinance-pressure probability is ${(refiSignal * 100).toFixed(1)}%.`;
    }
    return baseAxis("execution", "Execution", band, eventCount >= 4 || refiSignal != null ? "events + refinancePressureProbability" : "events", detail);
  })();

  const axes: RoadmapRiskAxis[] = [liquidity, leverage, cashflow, concentration, execution];

  // Overall = worst known band. If every axis is unknown → overall unknown.
  const known = axes.filter((a) => a.band !== "unknown");
  const overall: RiskBand = known.length === 0
    ? "unknown"
    : known.some((a) => a.band === "high")
      ? "high"
      : known.some((a) => a.band === "medium") ? "medium" : "low";

  const warnings = softWarnings.filter((w) => w.severity !== "info").map((w) => w.label);

  return { axes, overall, warnings };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const ALL_AXES: { axis: RoadmapRiskAxis["axis"]; label: string }[] = [
  { axis: "liquidity",     label: "Liquidity" },
  { axis: "leverage",      label: "Leverage" },
  { axis: "cashflow",      label: "Cashflow" },
  { axis: "concentration", label: "Concentration" },
  { axis: "execution",     label: "Execution" },
];

function baseAxis(
  axis: RoadmapRiskAxis["axis"],
  label: string,
  band: RiskBand,
  driver: string,
  detail: string,
): RoadmapRiskAxis {
  return { axis, label, band, driver, detail };
}

function numberOr(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

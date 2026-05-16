/**
 * PART 9 — Autonomous Alert System.
 *
 * Composes deterministic alerts from monitoring, drift, opportunities, and
 * regime classification. Alerts route into one of five channels:
 *   • warning            — current state breach
 *   • opportunity        — actionable upside
 *   • structural         — multi-quarter shape of plan
 *   • risk               — fragility / sequence risk
 *   • execution-reminder — action sequencing
 */

import type { ExtendedScenarioResult } from "../runScenario";
import type {
  AutonomousAlert,
  LedgerSnapshot,
  MonitoringSignal,
  OpportunityWindow,
  RegimeClassification,
  TrajectoryDrift,
} from "./types";
import type { InsightSeverity } from "../intelligence/types";

export interface AlertInput {
  baseline: ExtendedScenarioResult;
  monitoring: MonitoringSignal[];
  drift: TrajectoryDrift[];
  opportunities: OpportunityWindow[];
  regime: RegimeClassification;
  history?: LedgerSnapshot[];
  /** Refinance breakpoint surface (rate the strategy becomes fragile at). */
  refinanceBreakpointPct?: number;
  /** User's preferred liquidity floor (months). */
  liquidityFloorMonths?: number;
}

const SEV_RANK: Record<InsightSeverity, number> = { critical: 3, warn: 2, watch: 1, info: 0 };

function alert(
  id: string,
  channel: AutonomousAlert["channel"],
  title: string,
  body: string,
  severity: InsightSeverity,
  drivers: string[],
  suggestedAction?: string,
  threshold?: AutonomousAlert["threshold"],
): AutonomousAlert {
  return { id, channel, title, body, severity, drivers, suggestedAction, threshold };
}

export function buildAutonomousAlerts(input: AlertInput): AutonomousAlert[] {
  const out: AutonomousAlert[] = [];
  const lastSnap = input.history?.[input.history.length - 1] ?? null;
  const liquidityFloorMonths = input.liquidityFloorMonths ?? 6;

  // From monitoring deteriorations
  for (const m of input.monitoring) {
    if (m.direction !== "deteriorating") continue;
    out.push(
      alert(
        `alert-${m.id}`,
        m.dimension === "liquidity" || m.dimension === "leverage" ? "warning" : "risk",
        `${m.label} breach`,
        m.summary,
        m.severity,
        m.drivers,
        suggestedActionFor(m),
      ),
    );
  }

  // Refinance fragility breakpoint
  const refiBp = input.refinanceBreakpointPct ?? deriveRefiBreakpoint(input.baseline);
  if (refiBp !== null) {
    out.push(
      alert(
        "alert-refi-breakpoint",
        "structural",
        "Refinance fragility breakpoint",
        `Your current debt structure becomes fragile above ${refiBp.toFixed(2)}% mortgage rates under the winning path.`,
        (input.baseline.refinancePressureProbability ?? 0) > 0.30 ? "warn" : "watch",
        ["baseline.refinancePressureProbability", "baseline.serviceability"],
        "Stress-test serviceability at +1pp; consider part-fix or term extension.",
        { label: "Mortgage-rate breakpoint", value: Number(refiBp.toFixed(2)), unit: "%" },
      ),
    );
  }

  // Liquidity threshold
  if (lastSnap) {
    const monthlyExpenses = lastSnap.monthlyExpenses;
    const floor$ = monthlyExpenses * liquidityFloorMonths;
    if (lastSnap.liquidCash < floor$) {
      out.push(
        alert(
          "alert-offset-low",
          "warning",
          "Offset / liquidity below preferred floor",
          `Your offset / liquid balance of $${Math.round(lastSnap.liquidCash).toLocaleString("en-AU")} is below your preferred ${liquidityFloorMonths}-month floor (~$${Math.round(floor$).toLocaleString("en-AU")}).`,
          "warn",
          ["history.liquidCash", "history.monthlyExpenses"],
          "Pause discretionary purchases until the liquidity floor is restored.",
          { label: "Liquidity floor", value: Math.round(floor$), unit: "$" },
        ),
      );
    }
  }

  // Opportunities promoted to alerts (high-value only)
  for (const o of input.opportunities) {
    if (o.kind === "idle-liquidity" || o.kind === "refinance-window" || o.kind === "super-contribution") {
      out.push(
        alert(
          `alert-opp-${o.kind}`,
          "opportunity",
          o.title,
          o.body,
          o.severity,
          o.drivers,
          o.suggestedAction,
        ),
      );
    }
  }

  // Drift → execution reminders
  for (const d of input.drift) {
    if (d.needsHistory) continue;
    out.push(
      alert(
        `alert-drift-${d.kind}`,
        d.kind === "spending-creep" || d.kind === "savings-rate-deterioration" ? "execution-reminder" : "risk",
        d.description.split(".")[0] + ".",
        d.description,
        d.severity,
        d.drivers,
        "Re-baseline the relevant control before drift compounds.",
      ),
    );
  }

  // Regime-driven structural alert
  if (input.regime.regime !== "neutral") {
    out.push(
      alert(
        "alert-regime",
        "structural",
        `Regime: ${input.regime.label}`,
        input.regime.rationale,
        "watch",
        input.regime.drivers,
        input.regime.implications[0] ?? "Adapt allocation and tempo to the prevailing regime.",
      ),
    );
  }

  // Dedupe by id and sort by severity
  const seen = new Set<string>();
  return out.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  }).sort((a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity]);
}

function suggestedActionFor(m: MonitoringSignal): string {
  switch (m.dimension) {
    case "liquidity": return "Rebuild buffer to your preferred floor before adding new commitments.";
    case "leverage": return "Reduce non-productive debt or refinance on better terms.";
    case "debt-serviceability": return "Stress-test serviceability and consider part-fix or term extension.";
    case "fire-trajectory": return "Tighten expenses or accelerate contributions to recover the timeline.";
    case "asset-concentration": return "Plan a phased rebalance to reduce single-asset weight.";
    case "behaviour-drift": return "Audit recent discretionary categories absorbing income growth.";
    case "cashflow": return "Re-baseline the budget to restore monthly surplus.";
    default: return "Investigate the underlying driver before taking new action.";
  }
}

function deriveRefiBreakpoint(baseline: ExtendedScenarioResult): number | null {
  // Heuristic: surface a structural number consistent with serviceability.
  // We use the engine's bufferedRate when available; else null.
  const svc = baseline.serviceability as { bufferedRate?: number } | null;
  if (svc && typeof svc.bufferedRate === "number") return svc.bufferedRate * 100;
  return null;
}

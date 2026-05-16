/**
 * PART 11 — Rolling Strategic Roadmap.
 *
 * Builds 3-month / 12-month / 3-year / 10-year action sets from current
 * monitoring + drift + opportunity surfaces. The roadmap is deterministic
 * and refreshes every run — there is no hard-coded calendar.
 */

import type {
  AutonomousAlert,
  MonitoringSignal,
  OpportunityWindow,
  RegimeClassification,
  RoadmapHorizonPlan,
  TrajectoryDrift,
} from "./types";

export interface RoadmapInput {
  monitoring: MonitoringSignal[];
  drift: TrajectoryDrift[];
  opportunities: OpportunityWindow[];
  alerts: AutonomousAlert[];
  regime: RegimeClassification;
}

export function buildRoadmap(input: RoadmapInput): RoadmapHorizonPlan[] {
  const { monitoring, drift, opportunities, alerts, regime } = input;
  const liquidityWeak = monitoring.some((m) => m.dimension === "liquidity" && m.direction === "deteriorating");
  const leverageHot = monitoring.some((m) => m.dimension === "leverage" && m.direction === "deteriorating");
  const fireDrift = drift.find((d) => d.kind === "fire-delay" && !d.needsHistory);
  const idleCash = opportunities.some((o) => o.kind === "idle-liquidity");
  const refiOpen = opportunities.some((o) => o.kind === "refinance-window");
  const concentration = monitoring.some((m) => m.dimension === "asset-concentration" && m.direction === "deteriorating");
  const criticalAlerts = alerts.filter((a) => a.severity === "critical").length;
  const warnAlerts = alerts.filter((a) => a.severity === "warn").length;

  const next3m: string[] = [];
  if (liquidityWeak) next3m.push("Rebuild liquidity buffer to your preferred floor before adding new commitments.");
  if (criticalAlerts) next3m.push("Resolve critical alerts (warnings + serviceability) before strategic moves.");
  if (idleCash) next3m.push("Deploy excess idle cash into productive assets consistent with your philosophy.");
  if (!liquidityWeak && !idleCash) next3m.push("Maintain disciplined DCA into your accumulation path.");
  if (regime.regime === "rising-rates" || regime.regime === "credit-tightening") next3m.push("Avoid new leverage while rate cycle remains restrictive.");
  if (!leverageHot && !liquidityWeak) next3m.push("Keep emergency buffer at the preferred floor; do not over-fund cash.");

  const next12m: string[] = [];
  if (refiOpen) next12m.push("Prepare refinance flexibility — gather statements, reduce non-essential debt.");
  if (warnAlerts) next12m.push("Close out warning-level alerts within the year.");
  if (concentration) next12m.push("Plan a phased rebalance to reduce concentration drift.");
  if (fireDrift && fireDrift.magnitude && fireDrift.magnitude.value > 0.5) next12m.push("Restore the FIRE timeline through expense discipline or contribution acceleration.");
  next12m.push("Optimise tax structure ahead of EOFY (deductions, super, CGT timing).");
  if (regime.regime === "falling-rates") next12m.push("Review borrowing capacity — falling-rate windows historically open opportunistic property paths.");

  const year3: string[] = [];
  year3.push("Sequence the next major capital moves around regime conditions, not calendar dates.");
  if (regime.regime === "falling-rates" || regime.regime === "neutral") year3.push("Leverage expansion becomes viable if surplus and liquidity persist.");
  if (concentration) year3.push("Bring concentration index below 0.55 across two FYs to reduce sequence risk.");
  year3.push("Re-baseline strategic memory annually — leverage tolerance, philosophy, liquidity preference.");

  const year10: string[] = [];
  year10.push("Maintain a rolling target allocation aligned to your investment philosophy.");
  year10.push("Plan for retirement-transition sequence risk — duration assets and drawdown tempo.");
  year10.push("Keep dependency surface diversified — income, asset class, regime exposure.");

  return [
    {
      horizon: "3m",
      label: "Next 3 months",
      theme: liquidityWeak ? "Stabilise" : idleCash ? "Deploy" : "Maintain",
      actions: dedupe(next3m),
      conditions: liquidityWeak ? ["Restore liquidity buffer before any new commitments."] : undefined,
    },
    {
      horizon: "12m",
      label: "Next 12 months",
      theme: refiOpen ? "Optimise structure" : "Strengthen plan",
      actions: dedupe(next12m),
    },
    {
      horizon: "3y",
      label: "3 year outlook",
      theme: "Compounding & flexibility",
      actions: dedupe(year3),
    },
    {
      horizon: "10y",
      label: "10 year trajectory",
      theme: "Strategic continuity",
      actions: dedupe(year10),
    },
  ];
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((s) => {
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

/**
 * PART 6 — Dynamic Priority Stack.
 *
 * Composes a ranked priority list from monitoring signals, opportunities,
 * drift findings, and alerts. Sort is severity-first, then urgency.
 * Includes rationale, suggested action, and deep links into the app.
 */

import type { RankedCandidate } from "../decisionEngine/candidateGenerator";
import type {
  AutonomousAlert,
  MonitoringSignal,
  OpportunityWindow,
  PriorityItem,
  PriorityUrgency,
  TrajectoryDrift,
} from "./types";
import type { InsightSeverity } from "../intelligence/types";

const SEV_RANK: Record<InsightSeverity, number> = { critical: 3, warn: 2, watch: 1, info: 0 };
const URG_RANK: Record<PriorityUrgency, number> = { immediate: 3, "near-term": 2, ongoing: 1, "long-term": 0 };

export interface PriorityInput {
  winner: RankedCandidate;
  monitoring: MonitoringSignal[];
  opportunities: OpportunityWindow[];
  drift: TrajectoryDrift[];
  alerts: AutonomousAlert[];
}

function urgencyFromSeverity(s: InsightSeverity): PriorityUrgency {
  if (s === "critical") return "immediate";
  if (s === "warn") return "near-term";
  if (s === "watch") return "ongoing";
  return "long-term";
}

function priority(
  id: string,
  title: string,
  rationale: string,
  severity: InsightSeverity,
  suggestedAction: string,
  drivers: string[],
  deepLink?: string,
): Omit<PriorityItem, "rank"> & { _sev: InsightSeverity } {
  return {
    _sev: severity,
    id,
    title,
    rationale,
    urgency: urgencyFromSeverity(severity),
    suggestedAction,
    drivers,
    deepLink,
  };
}

export function buildPriorities(input: PriorityInput): PriorityItem[] {
  const cands: Array<ReturnType<typeof priority>> = [];

  // From monitoring deteriorations
  for (const m of input.monitoring) {
    if (m.direction !== "deteriorating") continue;
    let action = "Review the underlying driver and tighten the relevant constraint.";
    let link: string | undefined;
    switch (m.dimension) {
      case "liquidity":
        action = "Rebuild liquidity buffer back above your preferred floor before adding new leverage or new investments.";
        link = "/wealth-strategy";
        break;
      case "leverage":
        action = "Reduce non-productive debt or refinance on better terms before expanding exposure.";
        link = "/debt-strategy";
        break;
      case "debt-serviceability":
        action = "Review debt structure (term, fix portion, IO/PI split) to reduce serviceability strain.";
        link = "/debt-strategy";
        break;
      case "fire-trajectory":
        action = "Tighten expenses or accelerate contributions to restore the original FIRE timeline.";
        link = "/fire-path";
        break;
      case "asset-concentration":
        action = "Plan a phased rebalance toward your preferred allocation.";
        link = "/wealth-strategy";
        break;
      case "behaviour-drift":
        action = "Audit recent discretionary spending and reset the savings-rate target.";
        link = "/budget";
        break;
      case "cashflow":
        action = "Re-baseline the budget to restore monthly surplus capacity.";
        link = "/budget";
        break;
      case "risk-drift":
      case "market-sensitivity":
        action = "Reduce concentrated exposures and verify hedges align with current regime.";
        link = "/risk-radar";
        break;
      default:
        break;
    }
    cands.push(priority(`pri-mon-${m.dimension}`, m.label + " under pressure", m.summary, m.severity, action, m.drivers, link));
  }

  // From drift
  for (const d of input.drift) {
    if (d.kind === "fire-delay" && d.needsHistory) continue;
    cands.push(
      priority(
        `pri-drift-${d.kind}`,
        labelForDrift(d.kind),
        d.description,
        d.severity,
        actionForDrift(d.kind),
        d.drivers,
        deepLinkForDrift(d.kind),
      ),
    );
  }

  // From alerts (warnings + risk + structural)
  for (const a of input.alerts) {
    if (a.channel === "opportunity") continue;
    cands.push(
      priority(`pri-alert-${a.id}`, a.title, a.body, a.severity, a.suggestedAction ?? "Review and act before drift intensifies.", a.drivers),
    );
  }

  // From opportunities — surface only watch-level or info-level as ongoing priorities
  for (const o of input.opportunities) {
    cands.push(
      priority(
        `pri-opp-${o.kind}`,
        o.title,
        o.body,
        o.severity,
        o.suggestedAction,
        o.drivers,
        deepLinkForOpportunity(o.kind),
      ),
    );
  }

  // Dedupe by id and sort
  const seen = new Set<string>();
  const unique = cands.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  unique.sort((a, b) => {
    const dSev = SEV_RANK[b._sev] - SEV_RANK[a._sev];
    if (dSev !== 0) return dSev;
    return URG_RANK[b.urgency] - URG_RANK[a.urgency];
  });

  return unique.slice(0, 7).map(({ _sev: _, ...p }, i) => ({ ...p, rank: i + 1 }));
}

function labelForDrift(kind: TrajectoryDrift["kind"]): string {
  switch (kind) {
    case "fire-delay": return "Restore FIRE trajectory";
    case "savings-rate-deterioration": return "Restore savings rate";
    case "spending-creep": return "Contain lifestyle inflation";
    case "leverage-acceleration": return "Slow leverage expansion";
    case "liquidity-compression": return "Rebuild liquidity";
    case "dependency-risk": return "Reduce concentrated dependency";
    case "survivability-deterioration": return "Restore survivability";
  }
}
function actionForDrift(kind: TrajectoryDrift["kind"]): string {
  switch (kind) {
    case "fire-delay": return "Increase contribution tempo or extend horizon expectations.";
    case "savings-rate-deterioration": return "Re-baseline budget to restore savings rate to baseline.";
    case "spending-creep": return "Cap discretionary categories absorbing income growth.";
    case "leverage-acceleration": return "Pause new debt; redirect surplus to principal reduction.";
    case "liquidity-compression": return "Rebuild liquidity to your preferred floor before any new commitments.";
    case "dependency-risk": return "Diversify income / asset dependencies.";
    case "survivability-deterioration": return "Tighten serviceability and rebuild buffers immediately.";
  }
}
function deepLinkForDrift(kind: TrajectoryDrift["kind"]): string | undefined {
  switch (kind) {
    case "fire-delay": return "/fire-path";
    case "leverage-acceleration": return "/debt-strategy";
    case "savings-rate-deterioration":
    case "spending-creep": return "/budget";
    case "liquidity-compression":
    case "survivability-deterioration":
    case "dependency-risk": return "/risk-radar";
  }
}
function deepLinkForOpportunity(kind: OpportunityWindow["kind"]): string | undefined {
  switch (kind) {
    case "idle-liquidity": return "/wealth-strategy";
    case "refinance-window":
    case "debt-restructure": return "/debt-strategy";
    case "attractive-entry": return "/decision";
    case "rebalance-window": return "/wealth-strategy";
    case "super-contribution": return "/tax";
    case "tax-optimisation": return "/tax-alpha";
  }
}

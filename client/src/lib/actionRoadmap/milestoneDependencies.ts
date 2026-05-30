/**
 * actionRoadmap/milestoneDependencies.ts — Sprint 30A §P1 (hybrid chain).
 *
 * Computes dependency edges between roadmap milestones via two passes:
 *
 *   1. Engine pass — for each milestone with a non-null `sourceDeltaId`,
 *      look for predecessor milestones whose event chain links into the
 *      same delta. Add an `engine` edge.
 *   2. Heuristic pass — for unconnected pairs, apply five cross-lane rules
 *      within their temporal window.
 *
 * NO NEW MATH. Edges are dedup'd. Engine edges take precedence.
 */
import type { LaneEvent, Lane } from "./engineEventLanes";

export type DependencyEdgeSource = "engine" | "heuristic";

export interface DependencyEdge {
  fromMilestoneId: string;
  toMilestoneId: string;
  source: DependencyEdgeSource;
  rationale: string;
}

export interface DependencyInput {
  /** Roadmap-ordered lane events (output of `selectEngineEventLanes`). */
  events: LaneEvent[];
}

interface HeuristicRule {
  fromLane: Lane;
  toLane: Lane;
  windowMonths: number;
  rationale: string;
}

const HEURISTIC_RULES: HeuristicRule[] = [
  { fromLane: "debt_reduction",     toLane: "borrowing_capacity", windowMonths: 6,
    rationale: "Debt reduction frees serviceability; the lender re-test must follow within 6 months." },
  { fromLane: "borrowing_capacity", toLane: "acquisition",        windowMonths: 12,
    rationale: "Once borrowing capacity is re-confirmed, the next acquisition window opens within 12 months." },
  { fromLane: "acquisition",        toLane: "debt_reduction",     windowMonths: 24,
    rationale: "Post-acquisition, the offset/repayment cycle resumes within 24 months to compress interest." },
  { fromLane: "debt_reduction",     toLane: "equity_release",     windowMonths: 36,
    rationale: "Sustained debt-down builds LVR headroom; equity-release becomes viable within 36 months." },
  // `* → exit` rule handled separately in the closing pass.
];

function monthsBetween(a: string, b: string): number {
  const pa = a.split("-").map((n) => parseInt(n, 10));
  const pb = b.split("-").map((n) => parseInt(n, 10));
  if (pa.length < 2 || pb.length < 2 || !pa.every(Number.isFinite) || !pb.every(Number.isFinite)) return -1;
  return (pb[0] - pa[0]) * 12 + (pb[1] - pa[1]);
}

function edgeKey(from: string, to: string): string {
  return `${from}::${to}`;
}

export function buildDependencyChain(input: DependencyInput): DependencyEdge[] {
  const events = Array.isArray(input.events) ? [...input.events] : [];
  if (events.length < 2) return [];

  // Ensure stable temporal order (the lanes module already sorts, but defend).
  events.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

  const edges: DependencyEdge[] = [];
  const seen = new Set<string>();

  // ── Pass 1: engine edges via shared sourceDeltaId chain ────────────────
  for (let i = 0; i < events.length; i++) {
    const from = events[i];
    if (!from.sourceDeltaId) continue;
    for (let j = i + 1; j < events.length; j++) {
      const to = events[j];
      if (to.sourceDeltaId !== from.sourceDeltaId) continue;
      const k = edgeKey(from.id, to.id);
      if (seen.has(k)) continue;
      seen.add(k);
      edges.push({
        fromMilestoneId: from.id,
        toMilestoneId: to.id,
        source: "engine",
        rationale: `Engine linked these milestones via sourceDeltaId=${from.sourceDeltaId}.`,
      });
    }
  }

  // ── Pass 2: heuristic edges (5 cross-lane rules) ───────────────────────
  for (let i = 0; i < events.length; i++) {
    const from = events[i];
    for (let j = i + 1; j < events.length; j++) {
      const to = events[j];
      // Skip if engine edge already exists.
      if (seen.has(edgeKey(from.id, to.id))) continue;
      // Apply each rule.
      for (const rule of HEURISTIC_RULES) {
        if (from.lane !== rule.fromLane) continue;
        if (to.lane !== rule.toLane) continue;
        const dt = monthsBetween(from.month, to.month);
        if (dt < 0 || dt > rule.windowMonths) continue;
        const k = edgeKey(from.id, to.id);
        if (seen.has(k)) continue;
        seen.add(k);
        edges.push({
          fromMilestoneId: from.id,
          toMilestoneId: to.id,
          source: "heuristic",
          rationale: rule.rationale,
        });
        break; // first matching rule per pair
      }
    }
  }

  // ── Pass 3: closing rule — every milestone → exit (always last) ─────────
  const exitEvents = events.filter((e) => e.lane === "exit");
  if (exitEvents.length > 0) {
    // Edge from the LAST exit-tagged-as-exit's nearest predecessor; we link
    // every non-exit milestone to the (chronologically first) exit event
    // they precede. The contract says: "any milestone → exit (always last)
    // ⇒ edge if exit exists".
    for (const exit of exitEvents) {
      for (const m of events) {
        if (m.id === exit.id) continue;
        if (m.month > exit.month) continue;
        const k = edgeKey(m.id, exit.id);
        if (seen.has(k)) continue;
        seen.add(k);
        edges.push({
          fromMilestoneId: m.id,
          toMilestoneId: exit.id,
          source: "heuristic",
          rationale: "Exit (FIRE crossing) is the terminal milestone; every prior milestone leads to it.",
        });
      }
    }
  }

  return edges;
}

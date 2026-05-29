/**
 * actionRoadmap/eventTraceability.ts — Sprint 30A addendum A2.
 *
 * User instruction (verbatim):
 *   "Every event shown in Roadmap and Timeline must be traceable back to a
 *    real engine source or a documented derived-event formula."
 *   "No placeholder events. No duplicated events. No empty timeline lanes."
 *
 * Validator rules:
 *   - no_source   : event.source === "engine" but no sourceDeltaId AND no rawEventType
 *   - no_formula  : event.source === "derived" but missing/empty derivationFormula
 *   - duplicate   : two events share (lane, month, action); the duplicate is flagged
 *   - placeholder : action text is empty or matches a placeholder regex
 *
 * Empty lanes are NOT failures (an honest "the engine modelled zero events
 * in this lane" outcome). The Timeline UI may hide empty lanes outside
 * Audit Mode; the validator only reports per-event problems.
 */
import type { Lane, LaneEvent } from "./engineEventLanes";

export type TraceabilityFailureReason = "no_source" | "no_formula" | "duplicate" | "placeholder";

export interface TraceabilityFailure {
  eventId: string;
  reason: TraceabilityFailureReason;
  detail: string;
}

export interface TraceabilityStats {
  totalEvents: number;
  engineEvents: number;
  derivedEvents: number;
  lanesRendered: number;
  lanesHidden: number;
}

export interface TraceabilityResult {
  status: "pass" | "fail";
  failures: TraceabilityFailure[];
  stats: TraceabilityStats;
}

const ALL_LANES: Lane[] = ["acquisition", "equity_release", "debt_reduction", "borrowing_capacity", "exit"];

const PLACEHOLDER_RE = /\b(TBD|placeholder|Lorem|not\s+modelled\s+yet)\b/i;

/**
 * Lightweight "milestone" shape so this validator can run independently of
 * the broader roadmap milestone type. We only need an id + month + label.
 * In practice the Action Roadmap page passes its `enrichedMilestones` slice.
 */
export interface ValidatorMilestoneLike {
  id: string;
  month?: string;
  label?: string;
}

export function validateTraceability(
  _milestones: ValidatorMilestoneLike[] | null | undefined,
  laneEvents: LaneEvent[] | null | undefined,
): TraceabilityResult {
  const events = Array.isArray(laneEvents) ? laneEvents : [];
  const failures: TraceabilityFailure[] = [];

  // Dedup-detection sets keyed on the (lane, month, action) triplet.
  const seenTriplet = new Map<string, string>(); // key → first event id

  for (const e of events) {
    // 1. placeholder
    const action = (e.action ?? "").trim();
    if (action.length === 0 || PLACEHOLDER_RE.test(action)) {
      failures.push({
        eventId: e.id,
        reason: "placeholder",
        detail: action.length === 0
          ? `Event ${e.id} has an empty action label.`
          : `Event ${e.id} action "${action}" matches placeholder regex.`,
      });
    }

    // 2. no_source — engine events must trace to either a sourceDeltaId
    //    OR a rawEventType. Anything else is unsourced and must fail.
    if (e.source === "engine") {
      const hasDelta = typeof e.sourceDeltaId === "string" && e.sourceDeltaId.length > 0;
      const hasRaw = typeof e.rawEventType === "string" && (e.rawEventType as string).length > 0;
      if (!hasDelta && !hasRaw) {
        failures.push({
          eventId: e.id,
          reason: "no_source",
          detail: `Engine event ${e.id} has neither sourceDeltaId nor rawEventType.`,
        });
      }
    }

    // 3. no_formula — derived events must carry a non-empty derivationFormula.
    if (e.source === "derived") {
      const f = (e.derivationFormula ?? "").trim();
      if (f.length === 0) {
        failures.push({
          eventId: e.id,
          reason: "no_formula",
          detail: `Derived event ${e.id} is missing its derivationFormula.`,
        });
      }
    }

    // 4. duplicate
    const key = `${e.lane}::${e.month}::${action}`;
    const firstId = seenTriplet.get(key);
    if (firstId && firstId !== e.id) {
      failures.push({
        eventId: e.id,
        reason: "duplicate",
        detail: `Event ${e.id} duplicates (lane=${e.lane}, month=${e.month}, action="${action}") of ${firstId}.`,
      });
    } else if (!firstId) {
      seenTriplet.set(key, e.id);
    }
  }

  // Stats — lane occupancy is computed from the raw events, regardless of
  // whether the UI later hides empty lanes outside Audit Mode.
  const eventsByLane = new Map<Lane, number>();
  for (const lane of ALL_LANES) eventsByLane.set(lane, 0);
  for (const e of events) eventsByLane.set(e.lane, (eventsByLane.get(e.lane) ?? 0) + 1);

  let lanesRendered = 0;
  let lanesHidden = 0;
  for (const lane of ALL_LANES) {
    if ((eventsByLane.get(lane) ?? 0) > 0) lanesRendered++;
    else lanesHidden++;
  }

  const engineEvents = events.filter((e) => e.source === "engine").length;
  const derivedEvents = events.filter((e) => e.source === "derived").length;

  return {
    status: failures.length === 0 ? "pass" : "fail",
    failures,
    stats: {
      totalEvents: events.length,
      engineEvents,
      derivedEvents,
      lanesRendered,
      lanesHidden,
    },
  };
}

/**
 * Helper for the Timeline UI — given the lane event list, return the set of
 * lanes that have at least one event. Outside Audit Mode the component
 * filters its lane card list through this.
 */
export function nonEmptyLanes(laneEvents: LaneEvent[]): Set<Lane> {
  const s = new Set<Lane>();
  for (const e of laneEvents) s.add(e.lane);
  return s;
}

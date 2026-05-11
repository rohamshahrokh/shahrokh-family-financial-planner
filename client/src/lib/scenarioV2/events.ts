/**
 * Scenario Engine V2 — Event Store
 *
 * Unified timeline of every event that can mutate PortfolioState. Built once
 * from BasePlan + Delta[], then consumed by `tick`. All events are sorted
 * deterministically by (month, priority, id) — replay is byte-identical.
 *
 * Event flow:
 *   BasePlan + Delta[]  →  buildEventStore()  →  ScenarioEvent[]
 *                                                       │
 *                                                       ▼
 *                                          groupByMonth() → tick(state, monthEvents, rails)
 */

import type {
  BasePlan,
  ScenarioDelta,
  ScenarioEvent,
  MonthKey,
} from "./types";
import { addMonths } from "./basePlan";
import { translateDelta } from "./deltas";

// ─── Building ───────────────────────────────────────────────────────────────

export interface BuildEventStoreOptions {
  startMonth: MonthKey;
  endMonth: MonthKey;
}

/**
 * Materialise the full event timeline for one scenario.
 *
 * - Base-plan recurring events (income, expenses, mortgage payments) are emitted
 *   inside `tick` directly because they fire EVERY month and the marginal cost
 *   of storing 360+ events per stream is wasteful. Only one-off and
 *   conditional events go in the store.
 * - Delta-driven events (lump sums, holds, refinances) are materialised here.
 */
export function buildEventStore(
  _plan: BasePlan,
  deltas: ScenarioDelta[],
  opts: BuildEventStoreOptions,
): ScenarioEvent[] {
  const events: ScenarioEvent[] = [];
  for (const d of deltas) {
    if (d.activationMonth < opts.startMonth || d.activationMonth > opts.endMonth) continue;
    events.push(...translateDelta(d));
  }
  return sortEvents(events);
}

/**
 * Stable sort by (month, priority, id). Two scenarios with the same deltas
 * produce identical event order regardless of input order.
 */
export function sortEvents(events: ScenarioEvent[]): ScenarioEvent[] {
  return [...events].sort((a, b) => {
    if (a.month !== b.month) return a.month < b.month ? -1 : 1;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Group already-sorted events by month for tick consumption. Months with
 * no events are NOT in the map — tick handles them via base-plan recurrences.
 */
export function groupByMonth(events: ScenarioEvent[]): Map<MonthKey, ScenarioEvent[]> {
  const m = new Map<MonthKey, ScenarioEvent[]>();
  for (const e of events) {
    const list = m.get(e.month);
    if (list) list.push(e);
    else m.set(e.month, [e]);
  }
  return m;
}

// ─── Convenience: month iterator ─────────────────────────────────────────────
/** Iterator over months from start to end inclusive. */
export function* monthsBetween(start: MonthKey, end: MonthKey): Generator<MonthKey> {
  let cur = start;
  let safety = 0;
  while (cur <= end && safety++ < 600) {
    yield cur;
    cur = addMonths(cur, 1);
  }
}

/**
 * auditRegistry.ts — Global registry that holds calculation traces keyed by id.
 *
 * Engines (or trace-factory modules adjacent to engines) call `registerTrace`
 * with a CalculationTrace whenever a canonical output is calculated. The UI
 * (`AuditableMetric`, `CalculationTracePanel`) looks the trace up by id when
 * the user clicks the metric in Audit Mode.
 *
 * Lazy & lightweight:
 *   - The registry is a module-level Map (no React state) — engines may run
 *     on the server too.
 *   - It supports lazy *factories*: callers can pre-register a `() => trace`
 *     thunk and the trace is only built when the user actually clicks. This
 *     keeps render-time cost at zero for screens with hundreds of metrics.
 *   - Calling `registerTrace` with an existing id REPLACES the prior entry,
 *     so re-runs of an engine cleanly overwrite stale traces.
 *
 * The registry intentionally has NO awareness of audit-mode on/off; that lives
 * in `AuditModeContext` and gates the UI. The registry just answers "do you
 * have a trace for id X?".
 */

import type { CalculationTrace } from './calculationTrace';

type TraceFactory = () => CalculationTrace;
type RegistryEntry = CalculationTrace | TraceFactory;

const registry = new Map<string, RegistryEntry>();
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach(fn => {
    try {
      fn();
    } catch {
      /* swallow — subscriber bugs must not break the registry */
    }
  });
}

/** Register a fully-built trace. Overwrites any previous entry for the id. */
export function registerTrace(trace: CalculationTrace): void {
  registry.set(trace.id, trace);
  notify();
}

/** Register a lazy factory that produces the trace on demand. */
export function registerTraceFactory(id: string, factory: TraceFactory): void {
  registry.set(id, factory);
  notify();
}

/** Resolve a trace by id, building it via the factory if necessary. */
export function resolveTrace(id: string): CalculationTrace | null {
  const entry = registry.get(id);
  if (!entry) return null;
  if (typeof entry === 'function') {
    try {
      return entry();
    } catch {
      return null;
    }
  }
  return entry;
}

/** True if any entry (built or factory) exists for the id. */
export function hasTrace(id: string): boolean {
  return registry.has(id);
}

/** List every registered id — used by tests and the panel directory. */
export function listTraceIds(): string[] {
  return Array.from(registry.keys()).sort();
}

/** Remove a single trace from the registry (mainly used in tests). */
export function unregisterTrace(id: string): void {
  if (registry.delete(id)) notify();
}

/** Subscribe to add/remove events. Returns an unsubscribe handle. */
export function subscribeRegistry(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/** Reset the registry — tests only. Never call in app code. */
export function __resetTraceRegistry(): void {
  registry.clear();
  notify();
}

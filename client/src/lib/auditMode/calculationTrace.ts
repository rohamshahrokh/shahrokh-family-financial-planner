/**
 * calculationTrace.ts — Canonical CalculationTrace data model.
 *
 * Why this file exists
 * --------------------
 * The "Audit Mode / Calculation Trace" feature lets a user click any key
 * metric on the platform and see WHERE the number came from: the engine, the
 * formula, the actual values used, the assumptions, what's included, what's
 * excluded. We want one shape that every engine can emit so the trace panel
 * never has to special-case the metric.
 *
 * The trace is intentionally a plain serialisable record (no React state, no
 * closures, no DOM). Engines build trace metadata adjacent to their canonical
 * output, register it with the audit registry, and the UI looks it up by id.
 */

/** Free-form numeric or string value rendered in the trace panel. */
export type TraceDisplayValue = string | number | null;

/**
 * A single named input that contributed to the metric. The trace panel renders
 * these as a `dl` of label → value rows so the user can match each input to
 * the corresponding term in the expanded calculation.
 */
export interface TraceInput {
  /** Short label — e.g. "Total Assets", "Annual Expenses". */
  label: string;
  /** Display value — formatted by the engine, used verbatim by the UI. */
  value: TraceDisplayValue;
  /** Where this input came from (engine field, snapshot column, regime). */
  source?: string;
  /** Optional one-line note — e.g. "incl. offset_balance, excl. cars". */
  note?: string;
}

/** A single assumption pinned at the time of calculation. */
export interface TraceAssumption {
  label: string;
  /** Display value — when omitted, only label + source render. */
  value?: TraceDisplayValue;
  /** Where this assumption is configured (path / module / regime). */
  source?: string;
}

export interface TraceIncludedExcluded {
  label: string;
  /** Optional dollar / percentage / unit value tied to the line. */
  value?: TraceDisplayValue;
  /** Optional one-line reason — useful for `excluded`. */
  reason?: string;
}

/**
 * CalculationTrace — the universal trace record. Every engine output that the
 * user can click on must emit one of these.
 *
 * Field guide:
 *  - id            stable identifier the UI looks up via the registry
 *  - label         user-facing title shown in the trace panel header
 *  - finalValue    the same formatted value the metric renders
 *  - plainEnglish  one-paragraph human explanation, free of math
 *  - formula       the canonical formula (string, math notation)
 *  - expanded      the formula with ACTUAL values substituted in
 *  - inputs        the raw inputs used, in the order they appear in the formula
 *  - assumptions   the pinned assumptions (rates, SWR, regime, etc.)
 *  - dataSource    one-line description of where data originated
 *  - sourceEngine  the engine / module that produced the canonical value
 *  - included      itemised list of contributors INCLUDED in the calculation
 *  - excluded      itemised list of items intentionally EXCLUDED + reason
 *  - calculatedAt  wall-clock ISO timestamp the trace was built
 *  - scenarioId    e.g. "current_law" | "proposed_reform" | "custom" when known
 *  - assumptionVersion semver / hash of the assumption-set that drove inputs
 *  - inputHash     short stable hash of `inputs` for repro / scenario compare
 *  - relatedIds    siblings the trace panel can link to (e.g. NW → Assets)
 *  - notes         optional caveats / footnotes
 */
export interface CalculationTrace {
  id: string;
  label: string;
  finalValue: TraceDisplayValue;
  plainEnglish: string;
  formula: string;
  expanded: string;
  inputs: TraceInput[];
  assumptions: TraceAssumption[];
  dataSource: string;
  sourceEngine: string;
  included: TraceIncludedExcluded[];
  excluded: TraceIncludedExcluded[];
  calculatedAt: string;
  scenarioId?: string;
  assumptionVersion?: string;
  inputHash?: string;
  relatedIds?: string[];
  notes?: string[];
}

/**
 * Helper for engines: stable short hash of an inputs array. Not crypto — just
 * a tiny deterministic fingerprint so the trace panel can flag when the same
 * metric was last calculated against the same inputs.
 */
export function hashTraceInputs(inputs: TraceInput[]): string {
  const s = inputs
    .map(i => `${i.label}=${i.value}`)
    .join('|');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

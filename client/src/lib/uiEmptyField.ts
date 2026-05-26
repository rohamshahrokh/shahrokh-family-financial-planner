/**
 * uiEmptyField.ts — Sprint 12 empty-field rule helpers.
 *
 * The P0 rule for Sprint 12: never render "—", "Incomplete", "Missing Data",
 * "N/A", "NaN" or empty placeholders in the default UI. If a value is empty,
 * hide the slot OR collapse the whole section. These two helpers gate every
 * Sprint 12 surface.
 */

const EMPTY_STRINGS = new Set([
  "",
  "—",
  "-",
  "N/A",
  "n/a",
  "NA",
  "NaN",
  "Incomplete",
  "incomplete",
  "Missing Data",
  "missing data",
  "Missing",
  "Unknown",
  "unknown",
  "null",
  "undefined",
]);

export function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "number") return !Number.isFinite(v);
  if (typeof v === "string") {
    const t = v.trim();
    if (t.length === 0) return true;
    if (EMPTY_STRINGS.has(t)) return true;
    // REMEDIATION C-2: a real zero is a meaningful value (ledger NW $0,
    // 0% probability, etc.) and must render. Only undefined/null/NaN/""
    // and the explicit placeholder strings above are "empty". Previously
    // "0", "$0", "0%", "0.0" were treated as empty — that hid legitimate
    // zero readings behind CTAs/dashes.
    return false;
  }
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * Returns `v` if it is non-empty, otherwise undefined. Use with optional
 * rendering: `{hideOrCollapse(x) && <Slot value={x} />}`.
 */
export function hideOrCollapse<T>(v: T | null | undefined): T | undefined {
  return isEmptyValue(v) ? undefined : (v as T);
}

/**
 * Coerce many empty representations to undefined so DecisionFrame slots can
 * be uniformly hidden via the empty-field rule.
 */
export function nullIfEmpty<T>(v: T | null | undefined): T | undefined {
  return hideOrCollapse(v);
}

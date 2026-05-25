/**
 * Sprint 13 — small helpers used to enforce the P0 "hide, don't placeholder"
 * rule. We never want users to see "—", "N/A", "Incomplete", or "Missing Data".
 * Sections call `isEmptyValue()` to decide whether to render at all.
 */

export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "number") return !Number.isFinite(v);
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    return t === "" || t === "—" || t === "-" || t === "n/a" || t === "na" || t === "incomplete" || t === "missing" || t === "missing data";
  }
  return false;
}

/**
 * Return the first non-empty value (`v`) or `undefined` so callers can opt to
 * hide the surrounding element rather than render a placeholder.
 */
export function hideOrCollapse<T>(v: T | null | undefined): T | undefined {
  return isEmptyValue(v) ? undefined : (v as T);
}

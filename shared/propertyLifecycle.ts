/**
 * Shared Property Lifecycle Predicates (Sprint 3B C-1)
 *
 * Single source of truth for which lifecycle statuses are valid, and how each
 * one affects current vs forecast inclusion. Every engine that filters
 * properties (dashboard selectors, FIRE engine, forecast engine, Monte Carlo,
 * cashflow, equity timeline, risk surface) must use these helpers — otherwise
 * the engines drift apart and the audit cycle keeps finding the same defects.
 *
 * The five-status model (Sprint 3A audit recommendation):
 *
 *   planned         — Future acquisition. Excluded from current NW / debt /
 *                     income / expenses. Included in forecast (settles at
 *                     settlement_date).
 *   under_contract  — Same as planned for current state; reflects deal in
 *                     progress.
 *   settled         — Active investment property. Included in current AND
 *                     forecast.
 *   sold            — Historical disposition. Excluded from current AND
 *                     forecast (retained only for CGT / historical reports).
 *   archived        — Hidden from active portfolio. Excluded from current AND
 *                     forecast.
 *
 * Legacy rows with NULL / empty lifecycle_status fall back to a date-driven
 * rule for backward compatibility with snapshots that pre-date the lifecycle
 * column.
 */

export type LifecycleStatus =
  | "planned"
  | "under_contract"
  | "settled"
  | "sold"
  | "archived";

export const LIFECYCLE_STATUSES: readonly LifecycleStatus[] = [
  "planned",
  "under_contract",
  "settled",
  "sold",
  "archived",
] as const;

export const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  planned: "Planned",
  under_contract: "Under Contract",
  settled: "Settled (Active)",
  sold: "Sold",
  archived: "Archived",
};

export function isLifecycleStatus(v: unknown): v is LifecycleStatus {
  return typeof v === "string" && (LIFECYCLE_STATUSES as readonly string[]).includes(v);
}

/**
 * Normalise a raw lifecycle_status field to a canonical LifecycleStatus, or
 * `undefined` when the value is missing/empty/unknown. The caller decides
 * whether to apply the legacy date-driven fallback.
 */
export function normaliseLifecycleStatus(v: unknown): LifecycleStatus | undefined {
  if (v == null) return undefined;
  const s = String(v).trim().toLowerCase();
  if (s === "") return undefined;
  // Forgiving aliases for historical typos / older fixtures
  if (s === "active") return "settled";
  if (s === "complete" || s === "completed") return "settled";
  if (s === "disposed") return "sold";
  if (s === "hidden") return "archived";
  return isLifecycleStatus(s) ? s : undefined;
}

interface LifecyclePropertyLike {
  lifecycle_status?: string | null;
  settlement_date?: string | null;
  purchase_date?: string | null;
  type?: string | null;
}

/**
 * Is this property "settled" right now? Settled means it contributes to
 * current net worth, debt, income, and expenses.
 *
 * Precedence:
 *   1. Explicit lifecycle_status takes priority.
 *   2. Legacy rows (status missing) fall back to settlement_date <= today.
 *   3. Historical states (sold, archived) are NEVER settled.
 *   4. Planned / under_contract are NEVER settled, even if dates suggest
 *      otherwise.
 */
export function isPropertySettledToday(
  p: LifecyclePropertyLike,
  todayIso: string,
): boolean {
  const status = normaliseLifecycleStatus(p?.lifecycle_status);
  if (status === "settled") return true;
  if (status === "planned" || status === "under_contract") return false;
  if (status === "sold" || status === "archived") return false;
  // Legacy fallback — date-driven.
  const settle = (p?.settlement_date || p?.purchase_date || "").trim();
  if (!settle) return true; // Pre-lifecycle rows were always treated as active.
  return settle <= todayIso;
}

/** Planned/under-contract (future acquisitions): contribute to forecast but not current state. */
export function isPropertyPlannedForFuture(
  p: LifecyclePropertyLike,
  todayIso: string,
): boolean {
  const status = normaliseLifecycleStatus(p?.lifecycle_status);
  if (status === "planned" || status === "under_contract") return true;
  if (status === "settled" || status === "sold" || status === "archived") return false;
  // Legacy fallback — future settlement date means "planned".
  const settle = (p?.settlement_date || p?.purchase_date || "").trim();
  if (!settle) return false;
  return settle > todayIso;
}

/** Historical disposition / hidden — excluded from current AND forecast. */
export function isPropertyHistorical(p: LifecyclePropertyLike): boolean {
  const status = normaliseLifecycleStatus(p?.lifecycle_status);
  return status === "sold" || status === "archived";
}

/**
 * Should this property contribute to the future forecast? True for any
 * lifecycle that is either currently active (settled) or expected to become
 * active (planned, under_contract). False for historical/hidden states.
 */
export function isPropertyInForecast(
  p: LifecyclePropertyLike,
  _todayIso: string,
): boolean {
  return !isPropertyHistorical(p);
}

/**
 * Defensive narrowing — most callers operate on investment properties only,
 * not the PPOR (which is handled as its own line item). Use this in tandem
 * with the predicates above.
 */
export function isInvestmentProperty(p: LifecyclePropertyLike | undefined | null): boolean {
  if (!p) return false;
  const t = (p.type ?? "").toLowerCase();
  return t !== "ppor" && t !== "owner_occupied";
}

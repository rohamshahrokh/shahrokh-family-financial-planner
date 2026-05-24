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
  // Sprint 4B — optional disposal date. When the property is in 'sold'
  // status the engines need a canonical disposal anchor so the buy → hold →
  // sell timeline can be reconstructed. Any of the alias columns below is
  // accepted; the resolver below picks the first non-empty.
  sale_date?: string | null;
  sold_date?: string | null;
  disposal_date?: string | null;
}

/**
 * Sprint 4B — Resolve the canonical "sale date" for a property, falling back
 * across the alias columns. Returns an empty string when no disposal date is
 * recorded (callers must then treat the property as "indeterminate disposal
 * timing" — usually meaning "sold but date unknown", which we conservatively
 * treat as already-sold).
 */
export function resolveSaleDate(p: LifecyclePropertyLike | undefined | null): string {
  if (!p) return "";
  const candidates = [p.sale_date, p.sold_date, p.disposal_date];
  for (const c of candidates) {
    const s = (c ?? "").toString().trim();
    if (s) return s;
  }
  return "";
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

/* ─── Sprint 4B — canonical ownership-period predicates ─────────────────────
 *
 * The Buy → Hold → Sell lifecycle needs a single helper that every engine
 * (Forecast, Risk, Goal Solver, Monte Carlo, Dashboard, Reports, Timeline,
 * Wealth Strategy, Financial Plan) can call to answer "does this property
 * exist on the balance sheet at date X?".
 *
 *   isPropertyOwnedAt(p, isoDate)
 *     true  → property exists, contributes to value / debt / rent / cashflow
 *     false → property either hasn't been acquired yet, or has been sold
 *             before isoDate (or is archived for other reasons).
 *
 * Date precedence:
 *   acquisition_at = settlement_date ?? purchase_date
 *   disposal_at    = sale_date / sold_date / disposal_date (canonical)
 *
 * Status precedence sits on top so explicit user actions always win over
 * date heuristics — a property the user has marked `archived` is excluded
 * regardless of what the dates say.
 * ----------------------------------------------------------------------- */

export function resolveAcquisitionDate(
  p: LifecyclePropertyLike | undefined | null,
): string {
  if (!p) return "";
  const settle = (p.settlement_date ?? "").toString().trim();
  if (settle) return settle;
  return (p.purchase_date ?? "").toString().trim();
}

/**
 * Returns true when the property exists on the balance sheet at the supplied
 * ISO date. False when the property is planned but not yet settled, or has
 * been disposed (sold/archived) before isoDate. The single canonical helper
 * for any engine that needs to roll up an ownership snapshot at a point in
 * time (current-day balance sheet, year-N forecast, Monte Carlo step, etc.).
 */
export function isPropertyOwnedAt(
  p: LifecyclePropertyLike | undefined | null,
  isoDate: string,
): boolean {
  if (!p) return false;
  const status = normaliseLifecycleStatus(p.lifecycle_status);
  // Archived = excluded irrespective of dates.
  if (status === "archived") return false;
  const acquired = resolveAcquisitionDate(p);
  // Acquisition gate: planned / under_contract excluded; legacy rows w/o a
  // status fall back to "owned if settlement date already passed".
  if (status === "planned" || status === "under_contract") {
    if (!acquired) return false;
    if (acquired > isoDate) return false;
    // Defensive: a planned row whose settlement date is in the past is treated
    // as not-yet-owned — the user still has to flip status to 'settled'. This
    // matches the dashboard inclusion rules so the two surfaces never drift.
    return false;
  }
  // Sold: excluded after sale date; legacy 'sold' rows without a date are
  // assumed already-disposed (conservative).
  if (status === "sold") {
    const sale = resolveSaleDate(p);
    if (!sale) return false;
    return sale > isoDate;
  }
  // Settled / unknown: gate on acquisition date.
  if (acquired && acquired > isoDate) return false;
  return true;
}

/** Did the property ever sit on the balance sheet at or before isoDate? */
export function wasPropertyAcquiredBy(
  p: LifecyclePropertyLike | undefined | null,
  isoDate: string,
): boolean {
  if (!p) return false;
  const status = normaliseLifecycleStatus(p.lifecycle_status);
  if (status === "archived") return false;
  if (status === "planned" || status === "under_contract") {
    const acquired = resolveAcquisitionDate(p);
    if (!acquired) return false;
    return acquired <= isoDate;
  }
  const acquired = resolveAcquisitionDate(p);
  if (acquired) return acquired <= isoDate;
  return true; // Legacy / no date → presumed long-held.
}

/** Has the property been disposed (sold) by isoDate? */
export function wasPropertySoldBy(
  p: LifecyclePropertyLike | undefined | null,
  isoDate: string,
): boolean {
  if (!p) return false;
  const status = normaliseLifecycleStatus(p.lifecycle_status);
  if (status !== "sold") return false;
  const sale = resolveSaleDate(p);
  if (!sale) return true; // No date but status = sold ⇒ already disposed.
  return sale <= isoDate;
}

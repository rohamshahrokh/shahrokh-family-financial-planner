/**
 * property/classify.ts — Sprint 20 PR-F2.
 *
 * Convert a raw property row (mc_property column shape or demo fixture)
 * into a typed `CanonicalProperty` with an explicit `kind` discriminator.
 *
 * PPOR vs investment is decided by the raw `type` field. Lifecycle (settled
 * vs planned vs historical) is decided by `purchase_date` relative to
 * today: a future purchase date is "planned"; past dates are "settled"; a
 * deleted/sold row would be "historical" (we surface it for completeness
 * but downstream selectors filter it out).
 */

import type {
  CanonicalProperty,
  PropertyKind,
  PropertyLifecycle,
  RawPropertyLike,
} from "./types";

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function decimalOrZero(v: unknown): number {
  const n = num(v);
  if (n > 1) return n / 100;
  return Math.max(0, n);
}

/** Decide PPOR vs investment from the raw `type` field. */
export function classifyKind(rawType?: string): PropertyKind {
  if (!rawType) return "investment";
  const t = String(rawType).trim().toLowerCase();
  if (t === "ppor" || t === "home" || t === "primary") return "ppor";
  return "investment";
}

function lifecycleFromDate(purchaseDate?: string, today: Date = new Date()): PropertyLifecycle {
  if (!purchaseDate) return "settled";
  const pd = new Date(purchaseDate);
  if (Number.isNaN(pd.getTime())) return "settled";
  return pd.getTime() > today.getTime() ? "planned" : "settled";
}

/**
 * Map a raw row to a `CanonicalProperty`. Defensive on every field — the
 * raw rows can be partial or missing fields entirely.
 */
export function classifyProperty(
  raw: RawPropertyLike,
  today: Date = new Date(),
): CanonicalProperty {
  const currentValue = num(raw.current_value || raw.purchase_price);
  const loanBalance = num(raw.loan_amount);
  const kind = classifyKind(raw.type);
  const lifecycle = lifecycleFromDate(raw.purchase_date, today);
  const interestRate = decimalOrZero(raw.interest_rate);
  const interestOnly = String(raw.loan_type ?? "").toLowerCase().includes("interest only");
  return {
    id: raw.id ?? "",
    name: raw.name ?? "",
    kind,
    lifecycle,
    currentValue,
    loanBalance,
    equity: Math.max(0, currentValue - loanBalance),
    interestRate,
    interestOnly,
    weeklyRent: num(raw.weekly_rent),
    vacancyRate: decimalOrZero(raw.vacancy_rate),
    managementFeeRate: decimalOrZero(raw.management_fee),
    councilRates: num(raw.council_rates),
    insurance: num(raw.insurance),
    maintenance: num(raw.maintenance),
    purchaseDate: raw.purchase_date ?? "",
    purchasePrice: num(raw.purchase_price),
    sellingCosts: num(raw.selling_costs),
  };
}

/**
 * Convenience: classify a list of raw rows and return the canonical list.
 */
export function classifyProperties(
  raws: ReadonlyArray<RawPropertyLike>,
  today: Date = new Date(),
): CanonicalProperty[] {
  return raws.map(r => classifyProperty(r, today));
}

/**
 * Borrowing Capacity Adapter — Sprint 2A Phase 3 (D-007).
 *
 * Single authoritative borrowing-capacity helper. Every surface that surfaces
 * "how much can you borrow?" MUST route through here so the Action Plan card
 * and the Serviceability panel never report different numbers.
 *
 * Why an adapter (vs collapsing everything into computeServiceability)?
 *   The scenarioV2 `computeServiceability` helper consumes a full
 *   `PortfolioState`; callers like `actionPlanEngine` only hold a thin
 *   `UnifiedSignals` snapshot. Wiring them directly would create a heavy
 *   import-graph edge. This adapter does the minimum reshape: take the
 *   numbers a recommendation surface has, fabricate a minimal property
 *   bag, and call `computeServiceability` so the underlying NSR-derived
 *   annuity solve is the source of truth.
 *
 * Methodology:
 *   - Input: monthly gross income, monthly living expenses, mortgage rate,
 *     existing other debts ($).
 *   - Build a transient `PortfolioState` with an empty property array and
 *     `state.otherDebts` populated.
 *   - Call `computeServiceability` and return `maxBorrowCapacity`.
 *
 * Backward-compatibility guard:
 *   When inputs are sparse (e.g. only `grossAnnual` provided, no expenses),
 *   we fall back to a published heuristic (`grossAnnual × 5.5`) but flag the
 *   `source` field so the UI can render "approx — fill expense data" copy
 *   instead of pretending it's the rigorous APRA-style figure.
 */

import { computeServiceability, type ServiceabilityInput } from "./scenarioV2/borrowing";
import type { PortfolioState } from "./scenarioV2/types";

export interface BorrowingCapacityInput {
  /** Monthly gross income for both partners (pre-tax). */
  monthlyGrossIncome?: number;
  /** Monthly living expenses (excluding debt service). */
  monthlyLivingExpenses?: number;
  /** Existing non-property debt ($ balance). */
  otherDebts?: number;
  /** Mortgage rate (decimal, e.g. 0.065). */
  mortgageRate?: number;
  /** APRA serviceability buffer added to the rate (default +0.03). */
  apraBufferPct?: number;
  /** Loan term (default 30). */
  termYears?: number;
  /** Average tax rate (default 0.28). */
  averageTaxRate?: number;
  /**
   * Optional gross annual fallback — used only when monthlyGrossIncome and
   * monthlyLivingExpenses are unavailable (legacy callers).
   */
  grossAnnualFallback?: number;
}

export interface BorrowingCapacityResult {
  /** Max additional borrow ($) before NSR drops to 1.0 at the buffered rate. */
  maxBorrowCapacity: number;
  /**
   * Provenance of the figure:
   *   - "serviceability": derived from `computeServiceability().maxBorrowCapacity`
   *   - "approx_5x_gross": legacy 5× gross fallback (sparse inputs)
   *   - "approx_6x_gross": legacy 6× gross fallback (sparse inputs, AU conservative)
   */
  source: "serviceability" | "approx_5x_gross" | "approx_6x_gross";
  /** APRA buffered rate actually used. */
  bufferedRate?: number;
  /** Headroom monthly cash available before maxing buffered debt service. */
  headroomMonthly?: number;
  /** Diagnostic note for the UI when fallbacks were used. */
  note?: string;
}

export function computeBorrowingCapacity(
  input: BorrowingCapacityInput,
): BorrowingCapacityResult {
  const monthlyGross = input.monthlyGrossIncome;
  const monthlyExp = input.monthlyLivingExpenses;
  const rate = input.mortgageRate;

  // Rigorous path: enough inputs to do the NSR-derived solve.
  if (monthlyGross != null && monthlyGross > 0 && monthlyExp != null && rate != null) {
    const state: PortfolioState = {
      // Minimum required fields for serviceability (empty portfolio). The
      // serviceability solve only inspects `properties` and `otherDebts`,
      // so the other fields are stub-zero for shape compliance.
      month: "1970-01" as PortfolioState["month"],
      properties: [],
      cash: 0,
      etfBalance: 0,
      cryptoBalance: 0,
      superRoham: 0,
      superFara: 0,
      cars: 0,
      iranProperty: 0,
      otherAssets: 0,
      otherDebts: Math.max(0, input.otherDebts ?? 0),
      fyTaxPaid: 0,
      ttmIncome: monthlyGross * 12,
      ttmExpenses: monthlyExp * 12,
    };

    const sInput: ServiceabilityInput = {
      state,
      monthlyGrossIncome: monthlyGross,
      monthlyLivingExpenses: monthlyExp,
      mortgageRate: rate,
      apraBufferPct: input.apraBufferPct,
      termYears: input.termYears,
      averageTaxRate: input.averageTaxRate,
    };
    const out = computeServiceability(sInput);
    return {
      maxBorrowCapacity: Math.max(0, Math.round(out.maxBorrowCapacity)),
      source: "serviceability",
      bufferedRate: out.bufferedRate,
    };
  }

  // Sparse fallback. We keep two ladder rungs so caller UI copy can
  // tell the user which one was applied. 5× is the legacy actionPlanEngine
  // shortcut; 6× is the more common AU bank quick-eyeball figure for dual-
  // income households. We always prefer 5× when we genuinely don't know
  // expenses (conservative).
  if (input.grossAnnualFallback != null && input.grossAnnualFallback > 0) {
    return {
      maxBorrowCapacity: Math.round(input.grossAnnualFallback * 5.5),
      source: "approx_5x_gross",
      note: "Approximate (5.5× gross). Provide monthly expenses and mortgage rate for an APRA-buffered estimate.",
    };
  }

  return {
    maxBorrowCapacity: 0,
    source: "approx_5x_gross",
    note: "Insufficient inputs to estimate borrowing capacity.",
  };
}

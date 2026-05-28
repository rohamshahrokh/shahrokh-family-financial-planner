/**
 * canonicalFire.ts — Sprint 20 PR-F1 canonical FIRE target type.
 *
 * Single TypeScript interface every FIRE-aware surface uses going forward.
 *
 * Two primary user inputs are visible by default:
 *   - targetFireYear              calendar year, e.g. 2040
 *   - targetPassiveIncomeMonthly  AUD/month, e.g. 9000
 *
 * Four optional advanced fields sit behind an "Advanced settings" expander
 * on the canonical surface; when omitted the derivation engine applies safe
 * defaults (see canonicalFireDerivations.ts).
 *
 * Storage path: this in-memory shape is mapped to the existing mc_fire_settings
 * columns at the persistence boundary (see fireGoalCanonical.ts setFireGoal
 * writer and fireGoalCanonical.migration.ts shim). We do NOT introduce a new
 * Supabase column set in this PR.
 */

export type CanonicalFireRiskTolerance = "conservative" | "balanced" | "growth";

/**
 * Optional advanced overrides. When omitted, the engine defaults apply:
 *   - safeWithdrawalRateOverride → 0.04 (4%)
 *   - minLiquidityBufferMonths   → 6
 *   - maxRiskTolerance           → "balanced"
 *   - targetNetWorth             → derived: (monthly * 12) / effectiveSwr
 */
export interface CanonicalFireAdvancedSettings {
  /** AUD; explicit asset-base override. Skips the SWR-based derivation. */
  targetNetWorth?: number;
  /** Decimal e.g. 0.04 = 4%. */
  safeWithdrawalRateOverride?: number;
  /** Months of expenses kept in cash + offset. */
  minLiquidityBufferMonths?: number;
  /** Cap on the engine's recommended risk band. */
  maxRiskTolerance?: CanonicalFireRiskTolerance;
}

/**
 * The single canonical FIRE target type — every downstream PR (F2 ranking,
 * F3 retirement transition + goal solver, F4 Monte Carlo + narrative) must
 * source FIRE-target inputs from this shape, not from legacy columns.
 */
export interface CanonicalFireTarget {
  /** PRIMARY user input — calendar year, e.g. 2035. */
  targetFireYear: number;
  /** PRIMARY user input — AUD/month passive-income target. */
  targetPassiveIncomeMonthly: number;
  /** Optional. When undefined, engine defaults apply. */
  advanced?: CanonicalFireAdvancedSettings;
}

/** Default applied when advanced.safeWithdrawalRateOverride is undefined. */
export const DEFAULT_SWR_DECIMAL = 0.04;
/** Default applied when advanced.minLiquidityBufferMonths is undefined. */
export const DEFAULT_LIQUIDITY_BUFFER_MONTHS = 6;
/** Default applied when advanced.maxRiskTolerance is undefined. */
export const DEFAULT_MAX_RISK_TOLERANCE: CanonicalFireRiskTolerance = "balanced";

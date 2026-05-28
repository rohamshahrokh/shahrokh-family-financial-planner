/**
 * canonicalMove.ts — Sprint 20 PR-F2 canonical move ranking type.
 *
 * The single shape produced by `rankMove(canonicalFire, household, moveDef)`.
 *
 * Confidence rule (HARD): `confidence` is strictly one of `low | medium |
 * high`. The word "probability" MUST NOT appear in the confidence rationale
 * or any user-facing label associated with this confidence — confidence is
 * a heuristic engine-fit label, NOT a Monte Carlo probability.
 *
 * `rankRationale` is a user-facing 1-2 sentence explanation produced by
 * the engine; it must explain WHY this move ranks where it does so the
 * downstream UI can render the same string the engine produced (no UI-side
 * paraphrasing that drifts from the engine's actual computation).
 */

import type { CanonicalProperty } from "@/lib/property/types";

/** Allowed confidence values. NO other strings — UI must rely on this. */
export type CanonicalMoveConfidence = "low" | "medium" | "high";

/** Stable identifier for each named move surfaced by the engine. */
export type CanonicalMoveId =
  | "sell_investment_property"
  | "refinance_ppor"
  | "extra_super_contribution"
  | "extra_etf_dca"
  | "debt_recycling";

/** FIRE-date delta is split into years + months so the UI can format both. */
export interface FireDateDelta {
  /** Whole years pulled earlier (positive = sooner) or later (negative). */
  years: number;
  /** Residual months (0..11). Sign matches `years`. */
  months: number;
}

/**
 * Downside risk profile — variance at the 5th percentile and time-to-
 * recovery in years. Both are heuristic — the engine documents the
 * assumption inline. NOT a Monte Carlo distribution.
 */
export interface MoveDownsideRisk {
  /** Estimated drawdown at the 5th percentile (0..1, e.g. 0.3 = 30%). */
  variancePercentile5: number;
  /** Years to recover from that drawdown under base-case growth. */
  recoveryYears: number;
}

/**
 * Output of `rankMove` — the typed canonical ranking record.
 */
export interface RankedMove {
  moveId: CanonicalMoveId;
  /** Negative years = pulls FIRE later (e.g. sell IP shifts FIRE later). */
  expectedFireDateDelta: FireDateDelta;
  /** AUD; net delta to household NW over a 25-year horizon. */
  expectedNetWorthDelta25y: number;
  /** AUD/month; positive = improves monthly surplus. */
  cashFlowImpactMonthly: number;
  /** Downside-risk heuristic; see `MoveDownsideRisk`. */
  downsideRisk: MoveDownsideRisk;
  /** Change in household debt-to-asset ratio (positive = adds leverage). */
  leverageDelta: number;
  /** 0..100, higher = more illiquid (longer to convert to cash). */
  illiquidityScore: number;
  /** HEURISTIC label — STRICTLY one of low|medium|high. */
  confidence: CanonicalMoveConfidence;
  /**
   * Why the confidence label is what it is. Must mention at least one of:
   * assumption stability, data freshness, scenario count, downside variance.
   */
  confidenceRationale: string;
  /** Composite score; see MOVE_RANKING_WEIGHTS for the formula. */
  rankScore: number;
  /** User-facing 1-2 sentence rationale for the rank. */
  rankRationale: string;
}

/**
 * A move definition — the input describing WHAT we are ranking. Pages
 * supply this; the engine fills in `rankMove(...)` -> RankedMove.
 *
 * Each move's domain-specific parameters live under `params` — the typed
 * union below pins the shape per move id.
 */
export type MoveDefinition =
  | SellInvestmentPropertyDef
  | RefinancePporDef
  | ExtraSuperContributionDef
  | ExtraEtfDcaDef
  | DebtRecyclingDef;

export interface SellInvestmentPropertyDef {
  moveId: "sell_investment_property";
  params: {
    /** Which property to sell — must be `kind === "investment"`. */
    property: CanonicalProperty;
    /** Marginal tax rate as a decimal (0.37 = 37%). */
    marginalTaxRate: number;
    /** Whether the 50% CGT discount applies (held >12 months). */
    cgtDiscountEligible: boolean;
  };
}

export interface RefinancePporDef {
  moveId: "refinance_ppor";
  params: {
    /** PPOR property currently being refinanced. */
    property: CanonicalProperty;
    /** New interest rate (decimal, e.g. 0.0525 = 5.25%). */
    newInterestRate: number;
    /** Fixed refinance costs (~$1,500 default). */
    refinanceCosts: number;
  };
}

export interface ExtraSuperContributionDef {
  moveId: "extra_super_contribution";
  params: {
    /** Additional pre-tax contribution (AUD/month). */
    extraMonthly: number;
    /** Marginal tax rate (decimal). */
    marginalTaxRate: number;
    /** Years until preservation age. */
    yearsToPreservation: number;
  };
}

export interface ExtraEtfDcaDef {
  moveId: "extra_etf_dca";
  params: {
    /** Additional DCA contribution (AUD/month). */
    extraMonthly: number;
    /** Expected return (decimal, e.g. 0.085 = 8.5%). */
    expectedReturnAnnual: number;
  };
}

export interface DebtRecyclingDef {
  moveId: "debt_recycling";
  params: {
    /** Portion of PPOR loan to convert to deductible debt (AUD). */
    redrawAmount: number;
    /** PPOR property providing the redraw. */
    pporProperty: CanonicalProperty;
    /** Marginal tax rate (decimal). */
    marginalTaxRate: number;
    /** Expected ETF return (decimal). */
    expectedReturnAnnual: number;
  };
}

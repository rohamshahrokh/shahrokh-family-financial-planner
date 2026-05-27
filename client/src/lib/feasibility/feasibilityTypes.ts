/**
 * Sprint 18 Phase 18.2 — Feasibility types.
 *
 * Every recommendation that touches property, debt, or major capital
 * deployment runs through the feasibility engine. Output is attached as
 * Recommendation.feasibility (optional, additive).
 */

export type FeasibilityVerdict =
  | "feasible"
  | "feasible_with_conditions"
  | "not_currently_feasible"
  | "feasible_after_saving";

export interface FeasibilityBlocker {
  id: string;
  reason: string;
  severity: "critical" | "warning";
  /** Months of work to remove blocker, when calculable. */
  estimatedMonthsToResolve?: number;
}

export interface FeasibilityResult {
  feasible: boolean;
  verdict: FeasibilityVerdict;
  /** 0..1 — overall feasibility confidence. */
  feasibilityScore: number;
  blockers: FeasibilityBlocker[];
  requiredConditions: string[];
  /** "Feasible after X months of saving", null when not applicable. */
  estimatedMonthsUntilFeasible: number | null;
  /** Monthly surplus impact if proceeded today (negative = drains). */
  monthlySurplusImpact: number;
  /** Liquidity buffer impact (months of runway lost). */
  liquidityBufferImpact: number;
  /** Plain-English summary the UI / explanation layer can show verbatim. */
  summary: string;
  /** Source data echoed back for transparency. */
  assumptions: Record<string, number | string | boolean>;
}

export interface BorrowingCapacityResult {
  maxBorrowAud: number;
  effectiveAnnualIncome: number;
  monthlyCommitments: number;
  bufferReserved: number;
  termYears: number;
  stressRatePct: number;
  inputAssumptions: Record<string, number>;
}

export interface DebtServiceabilityResult {
  monthlyRepayment: number;
  monthlyRepaymentStressed: number; // at +2% rate
  surplusAfterRepayment: number;
  surplusAfterStress: number;
  passes: boolean;
  failureReason: string | null;
}

export interface LiquidityBufferResult {
  preBufferCash: number;
  postBufferCash: number;
  monthsRunwayBefore: number;
  monthsRunwayAfter: number;
  bufferTarget: number;
  meetsMinimum: boolean; // >= 3 months
}

export interface TransactionCostsResult {
  stampDuty: number;
  conveyancing: number;
  inspections: number;
  lendersMortgageInsurance: number;
  other: number;
  total: number;
  stateUsed: string;
}

export interface TaxFrictionResult {
  cgtOnSale: number;            // estimated CGT if asset sold
  marginalTaxRate: number;
  superCapRemaining: number;
  divisionRules: string[];      // human-readable applicable rules
}

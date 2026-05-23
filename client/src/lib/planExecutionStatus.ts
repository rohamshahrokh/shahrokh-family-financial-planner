/**
 * planExecutionStatus.ts — Dual-status Plan Execution derivation.
 *
 * Sits on top of the canonical `PlanFeasibilityResult` (Funding side) and
 * the canonical cash bridge / annual cashflow row (Liquidity side) to
 * produce TWO independent, never-conflated statuses:
 *
 *   1. FUNDING STATUS    — passthrough from `PlanFeasibilityResult.status`.
 *                          Answers: "Can I fund all planned acquisitions
 *                          and investments?"
 *
 *   2. LIQUIDITY STATUS  — derived from year-end (closing) cash on the
 *                          existing cash bridge using fixed UX thresholds.
 *                          Answers: "What is my remaining cash after
 *                          executing the plan?"
 *
 * IMPORTANT — this module is UX/derived-status only. It does NOT recompute
 * any financial value. All Funding values are passed through verbatim from
 * `computePlanFeasibility(...)`. All Liquidity values are passed through
 * verbatim from the existing cash bridge (`projection[i].cashBridge`) or
 * `cashFlowAnnual` row produced by `aggregateCashFlowToAnnual(...)`.
 *
 * #FWL_Plan_Execution_Dual_Status
 */

import type { PlanFeasibilityResult, PlanFeasibilityStatus } from "./planFeasibility";

export type LiquidityStatus = "healthy" | "tight" | "stress";

/**
 * Year-end Liquidity inputs — sourced from the existing cash bridge.
 * Each field is a passthrough; this module never computes them.
 *
 * Field mapping from canonical cashBridge (see finance.ts):
 *   openingCash                  ← cashBridge.startCash
 *   operatingCashflow            ← cashBridge.income + rentalIncome + taxRefundOrPayment
 *                                  − livingExpenses − pporRepayments
 *                                  − investmentRepayments
 *   investmentAllocations        ← plannedStockBuys + plannedCryptoBuys + dcaOutflows
 *   propertyAcquisitionCashUsed  ← propertyDeposits + buyingCosts
 *   closingCash                  ← cashBridge.endCash
 */
export interface LiquidityInputs {
  openingCash: number;
  operatingCashflow: number;
  investmentAllocations: number;
  propertyAcquisitionCashUsed: number;
  closingCash: number;
}

export interface FundingStatusSurface {
  /** Canonical status from PlanFeasibilityResult — never re-derived. */
  status: PlanFeasibilityStatus;        // "fully-funded" | "tight-liquidity" | "funding-gap"
  /** Canonical user-facing label — passthrough. */
  label: string;                         // "Fully Funded" | "Tight Liquidity" | "Funding Gap"
  /** UX icon for the dual-status summary line. */
  icon: "✓" | "~" | "⚠";
  /** True when feasibility.fundingGap < 0 — same trigger as the existing
   *  Funding Gap Resolution Advisor. Liquidity stress never sets this. */
  hasFundingGap: boolean;
  /** Passthrough values from PlanFeasibilityResult. */
  availableLiquidity: number;
  requiredLiquidity:  number;
  fundingGap:         number;
}

export interface LiquiditySurface {
  status: LiquidityStatus;
  label: string;                         // "Healthy Liquidity" | "Tight Liquidity" | "Liquidity Stress"
  icon: "✓" | "~" | "⚠";
  openingCash:                 number;
  operatingCashflow:           number;
  investmentAllocations:       number;
  propertyAcquisitionCashUsed: number;
  closingCash:                 number;
}

export interface PlanExecutionStatusResult {
  funding:   FundingStatusSurface;
  liquidity: LiquiditySurface;
  /** True when funding is fully-funded but year-end cash is negative. */
  showContextualExplanation: boolean;
  /** Contextual explanation copy for the Fully Funded + Liquidity Stress case. */
  contextualExplanation: string | null;
}

// ─── Liquidity thresholds (UX rules only — no financial recomputation) ──────
//
// Per the dual-status spec:
//   Closing Cash >  $50,000  → ✓ Healthy Liquidity
//   Closing Cash $0–$50,000  → ~ Tight Liquidity
//   Closing Cash <       $0  → ⚠ Liquidity Stress
//
export const LIQUIDITY_HEALTHY_FLOOR = 50_000;
export const LIQUIDITY_TIGHT_FLOOR   = 0;

export const FULLY_FUNDED_STRESS_EXPLANATION =
  "This plan is fully fundable based on available liquidity and deposit " +
  "power. However, after executing all planned acquisitions and investments, " +
  "year-end cash becomes negative. Consider reducing lump-sum investments, " +
  "delaying purchases, or adding an alternative funding source.";

// ─── Funding surface — passthrough from PlanFeasibilityResult ────────────────

const FUNDING_ICON: Record<PlanFeasibilityStatus, "✓" | "~" | "⚠"> = {
  "fully-funded":    "✓",
  "tight-liquidity": "~",
  "funding-gap":     "⚠",
};

export function fundingSurfaceFromFeasibility(
  feasibility: PlanFeasibilityResult,
): FundingStatusSurface {
  return {
    status:             feasibility.status,
    label:              feasibility.statusLabel,
    icon:               FUNDING_ICON[feasibility.status],
    hasFundingGap:      feasibility.hasFundingGap,
    availableLiquidity: feasibility.availableLiquidity,
    requiredLiquidity:  feasibility.requiredLiquidity,
    fundingGap:         feasibility.fundingGap,
  };
}

// ─── Liquidity surface — derived from year-end closing cash ──────────────────

export function deriveLiquidityStatus(inputs: LiquidityInputs): LiquiditySurface {
  const c = inputs.closingCash;
  let status: LiquidityStatus;
  let label: string;
  let icon: "✓" | "~" | "⚠";
  if (c < LIQUIDITY_TIGHT_FLOOR) {
    status = "stress";
    label  = "Liquidity Stress";
    icon   = "⚠";
  } else if (c <= LIQUIDITY_HEALTHY_FLOOR) {
    status = "tight";
    label  = "Tight Liquidity";
    icon   = "~";
  } else {
    status = "healthy";
    label  = "Healthy Liquidity";
    icon   = "✓";
  }
  return {
    status, label, icon,
    openingCash:                 inputs.openingCash,
    operatingCashflow:           inputs.operatingCashflow,
    investmentAllocations:       inputs.investmentAllocations,
    propertyAcquisitionCashUsed: inputs.propertyAcquisitionCashUsed,
    closingCash:                 inputs.closingCash,
  };
}

// ─── Combined dual-status derivation ────────────────────────────────────────

export function derivePlanExecutionStatus(
  feasibility: PlanFeasibilityResult,
  liquidity:   LiquidityInputs,
): PlanExecutionStatusResult {
  const funding = fundingSurfaceFromFeasibility(feasibility);
  const liq     = deriveLiquidityStatus(liquidity);
  // Contextual explanation surfaces ONLY in the surprising case:
  // funding canonically says "fully-funded" but year-end cash is negative.
  // Tight funding + stress should not silence the explanation either —
  // it's still the case the user needs to see when both surfaces point
  // toward a fundable plan with negative cash, so use status === "funding-gap"
  // as the exclusion (gap UX is already covered by the Funding Gap
  // Resolution Advisor).
  const showContextualExplanation =
    funding.status !== "funding-gap" && liq.status === "stress";
  return {
    funding,
    liquidity: liq,
    showContextualExplanation,
    contextualExplanation: showContextualExplanation
      ? FULLY_FUNDED_STRESS_EXPLANATION
      : null,
  };
}

// ─── Cash-bridge adapter ─────────────────────────────────────────────────────
//
// Maps a canonical cashBridge row (from finance.ts ForecastYear.cashBridge,
// or an equivalent CashFlowYear row from aggregateCashFlowToAnnual) into
// LiquidityInputs. This is pure passthrough — no recomputation.
export interface CashBridgeLike {
  startCash?:           number;
  income?:              number;
  rentalIncome?:        number;
  taxRefundOrPayment?:  number;
  livingExpenses?:      number;
  pporRepayments?:      number;
  investmentRepayments?: number;
  propertyDeposits?:    number;
  buyingCosts?:         number;
  plannedStockBuys?:    number;
  plannedCryptoBuys?:   number;
  dcaOutflows?:         number;
  endCash?:             number;
}

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function liquidityInputsFromCashBridge(cb: CashBridgeLike): LiquidityInputs {
  return {
    openingCash:                 n(cb.startCash),
    operatingCashflow:
        n(cb.income)
      + n(cb.rentalIncome)
      + n(cb.taxRefundOrPayment)
      - n(cb.livingExpenses)
      - n(cb.pporRepayments)
      - n(cb.investmentRepayments),
    investmentAllocations:
        n(cb.plannedStockBuys) + n(cb.plannedCryptoBuys) + n(cb.dcaOutflows),
    propertyAcquisitionCashUsed:
        n(cb.propertyDeposits) + n(cb.buyingCosts),
    closingCash:                 n(cb.endCash),
  };
}

// CashFlowYear adapter — maps the canonical annual row produced by
// `aggregateCashFlowToAnnual` directly into LiquidityInputs. Opening cash is
// passed in separately because CashFlowYear stores `endingBalance` (closing)
// but the dashboard already tracks the running opening balance for the
// existing Cashflow Reconciliation trace (#FWL_Cashflow_Reconciliation_Trace).
export interface CashFlowYearLike {
  income?:                  number;
  rentalIncome?:            number;
  ngTaxBenefit?:            number;
  ngBenefitSpread?:         number;
  totalExpenses?:           number;
  mortgageRepayment?:       number;
  investmentLoanRepayment?: number;
  plannedStockBuy?:         number;
  plannedCryptoBuy?:        number;
  stockDCAOutflow?:         number;
  cryptoDCAOutflow?:        number;
  propertyDeposit?:         number;
  propertyBuyingCosts?:     number;
  propertyPurchaseCashUsed?: number;
  endingBalance?:           number;
}

export function liquidityInputsFromCashFlowYear(
  row: CashFlowYearLike,
  openingCash: number,
): LiquidityInputs {
  // Property acquisition cash used: prefer the explicit per-row decomposition
  // (`propertyPurchaseCashUsed` already excludes equity-release portions);
  // fall back to deposit + buying costs when the row predates that field.
  const propertyAcquisitionCashUsed =
    row.propertyPurchaseCashUsed !== undefined
      ? n(row.propertyPurchaseCashUsed) + n(row.propertyBuyingCosts)
      : n(row.propertyDeposit) + n(row.propertyBuyingCosts);
  return {
    openingCash:                 n(openingCash),
    operatingCashflow:
        n(row.income)
      + n(row.rentalIncome)
      + n(row.ngTaxBenefit)
      + n(row.ngBenefitSpread)
      - n(row.totalExpenses)
      - n(row.mortgageRepayment)
      - n(row.investmentLoanRepayment),
    investmentAllocations:
        n(row.plannedStockBuy) + n(row.plannedCryptoBuy)
      + n(row.stockDCAOutflow) + n(row.cryptoDCAOutflow),
    propertyAcquisitionCashUsed,
    closingCash:                 n(row.endingBalance),
  };
}

// ─── Audit-mode trace helper ─────────────────────────────────────────────────
//
// Emits the canonical two-question audit trace. Used by Audit Mode / Plan
// Feasibility / Funding Resolution surfaces so the trace text and the
// PlanExecution UI never drift.
export interface PlanExecutionAuditTrace {
  title: string;
  fundingStatus:   PlanFeasibilityStatus;
  liquidityStatus: LiquidityStatus;
  questions: Array<{ q: string; a: string; values: Record<string, number | string> }>;
}

export function buildPlanExecutionAuditTrace(
  result: PlanExecutionStatusResult,
): PlanExecutionAuditTrace {
  return {
    title: "PLAN EXECUTION",
    fundingStatus:   result.funding.status,
    liquidityStatus: result.liquidity.status,
    questions: [
      {
        q: "Can I fund all planned acquisitions and investments?",
        a: `Funding Status: ${result.funding.icon} ${result.funding.label}`,
        values: {
          availableLiquidity: result.funding.availableLiquidity,
          requiredLiquidity:  result.funding.requiredLiquidity,
          fundingGap:         result.funding.fundingGap,
        },
      },
      {
        q: "What is my remaining cash after executing the plan?",
        a: `Liquidity Status: ${result.liquidity.icon} ${result.liquidity.label}`,
        values: {
          openingCash:                 result.liquidity.openingCash,
          operatingCashflow:           result.liquidity.operatingCashflow,
          investmentAllocations:       result.liquidity.investmentAllocations,
          propertyAcquisitionCashUsed: result.liquidity.propertyAcquisitionCashUsed,
          closingCash:                 result.liquidity.closingCash,
        },
      },
    ],
  };
}

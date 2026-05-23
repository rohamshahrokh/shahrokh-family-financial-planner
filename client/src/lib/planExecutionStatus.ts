/**
 * planExecutionStatus.ts
 *
 * Pure, deterministic dual-status derivation for the PLAN EXECUTION card.
 *
 * Two questions, two surfaces — NEVER conflated:
 *
 *   1. FUNDING STATUS    — "Can I fund all planned acquisitions and investments?"
 *                          Driven by funding capacity vs required cash.
 *
 *   2. LIQUIDITY STATUS  — "What is my remaining cash after executing the plan?"
 *                          Driven by year-end (closing) cash from the cash bridge.
 *
 * IMPORTANT — this module is UX/derived-status only. It does NOT recompute
 * any financial value. All inputs come from existing engines:
 *   • Funding inputs  → existing depositPower / planFeasibility engine.
 *   • Liquidity inputs → existing cashEngine / ledgerBuilder annual values.
 */

export type FundingStatus = 'fully_funded' | 'funding_gap';
export type LiquidityStatus = 'healthy' | 'tight' | 'stress';

/** Funding side — sourced from existing planFeasibility / depositPower values. */
export interface FundingInputs {
  /** Funding capacity (a.k.a. available liquidity / total deposit power). */
  fundingCapacity: number;
  /** Required funding (a.k.a. required liquidity / next-purchase requirement). */
  fundingRequired: number;
}

/** Liquidity side — sourced from existing cash-bridge / ledger annual values. */
export interface LiquidityInputs {
  /** Opening cash at start of year. */
  openingCash: number;
  /** Operating cashflow for the year (income - living/holding costs). */
  operatingCashflow: number;
  /** DCA + planned investment outflows for the year. */
  investmentAllocations: number;
  /** Property purchase / acquisition cash used for the year. */
  propertyAcquisitionCashUsed: number;
  /** Closing cash at year end (computed by cashEngine — pass through). */
  closingCash: number;
}

export interface FundingResult {
  status: FundingStatus;
  label: string;                   // "Fully Funded" | "Funding Gap"
  icon: '✓' | '⚠';
  surplus: number;                 // capacity − required (signed)
  capacity: number;
  required: number;
}

export interface LiquidityResult {
  status: LiquidityStatus;
  label: string;                   // "Healthy Liquidity" | "Tight Liquidity" | "Liquidity Stress"
  icon: '✓' | '~' | '⚠';
  openingCash: number;
  operatingCashflow: number;
  investmentAllocations: number;
  propertyAcquisitionCashUsed: number;
  closingCash: number;
}

export interface PlanExecutionStatus {
  funding: FundingResult;
  liquidity: LiquidityResult;
  /** True when plan is fundable on paper but year-end cash is negative. */
  showContextualExplanation: boolean;
  /** Contextual explanation text for the Fully Funded + Liquidity Stress case. */
  contextualExplanation: string | null;
}

// ─── Liquidity thresholds — UX rules only ─────────────────────────────────────
//
// Closing Cash > $50k          → Healthy Liquidity
// Closing Cash $0–$50k         → Tight Liquidity
// Closing Cash < $0            → Liquidity Stress
//
export const LIQUIDITY_HEALTHY_FLOOR = 50_000;
export const LIQUIDITY_TIGHT_FLOOR   = 0;

export function deriveFundingStatus(inputs: FundingInputs): FundingResult {
  const surplus = inputs.fundingCapacity - inputs.fundingRequired;
  const fullyFunded = surplus >= 0;
  return {
    status:    fullyFunded ? 'fully_funded' : 'funding_gap',
    label:     fullyFunded ? 'Fully Funded' : 'Funding Gap',
    icon:      fullyFunded ? '✓' : '⚠',
    surplus,
    capacity:  inputs.fundingCapacity,
    required:  inputs.fundingRequired,
  };
}

export function deriveLiquidityStatus(inputs: LiquidityInputs): LiquidityResult {
  const c = inputs.closingCash;
  let status: LiquidityStatus;
  let label: string;
  let icon: '✓' | '~' | '⚠';
  if (c < LIQUIDITY_TIGHT_FLOOR) {
    status = 'stress';
    label  = 'Liquidity Stress';
    icon   = '⚠';
  } else if (c <= LIQUIDITY_HEALTHY_FLOOR) {
    status = 'tight';
    label  = 'Tight Liquidity';
    icon   = '~';
  } else {
    status = 'healthy';
    label  = 'Healthy Liquidity';
    icon   = '✓';
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

const FULLY_FUNDED_STRESS_EXPLANATION =
  'This plan is fully fundable based on available liquidity and deposit power. ' +
  'However, after executing all planned acquisitions and investments, year-end cash ' +
  'becomes negative. Consider reducing lump-sum investments, delaying purchases, or ' +
  'adding an alternative funding source.';

export function derivePlanExecutionStatus(
  funding: FundingInputs,
  liquidity: LiquidityInputs,
): PlanExecutionStatus {
  const f = deriveFundingStatus(funding);
  const l = deriveLiquidityStatus(liquidity);

  // Contextual explanation is shown ONLY in the surprising case:
  // fully funded yet year-end cash negative.
  const showContextualExplanation =
    f.status === 'fully_funded' && l.status === 'stress';

  return {
    funding: f,
    liquidity: l,
    showContextualExplanation,
    contextualExplanation: showContextualExplanation
      ? FULLY_FUNDED_STRESS_EXPLANATION
      : null,
  };
}

// ─── Audit trace helper ───────────────────────────────────────────────────────
//
// Returns the canonical two-question audit trace. Used by Audit Mode / Plan
// Feasibility / Funding Resolution traces so the trace mirrors the UI's
// dual-status model exactly.
export interface PlanExecutionAuditTrace {
  title: string;
  questions: Array<{ q: string; a: string; values: Record<string, number | string> }>;
  fundingStatus: FundingStatus;
  liquidityStatus: LiquidityStatus;
}

export function buildPlanExecutionAuditTrace(
  result: PlanExecutionStatus,
): PlanExecutionAuditTrace {
  return {
    title: 'PLAN EXECUTION',
    fundingStatus: result.funding.status,
    liquidityStatus: result.liquidity.status,
    questions: [
      {
        q: 'Can I fund all planned acquisitions and investments?',
        a: `Funding Status: ${result.funding.icon} ${result.funding.label}`,
        values: {
          fundingCapacity: result.funding.capacity,
          fundingRequired: result.funding.required,
          fundingSurplus:  result.funding.surplus,
        },
      },
      {
        q: 'What is my remaining cash after executing the plan?',
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

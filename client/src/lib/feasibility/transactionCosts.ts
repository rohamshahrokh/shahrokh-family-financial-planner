/**
 * Sprint 18 Phase 18.2 — Transaction costs.
 *
 * AU state-aware stamp duty + conveyancing + inspections + LMI estimate.
 * Default state is QLD when state is unspecified. Figures are
 * representative-of-AU-mid-2025, NOT live ATO lookups — explanation layer
 * must surface "estimated" wording.
 */

import type { TransactionCostsResult } from "./feasibilityTypes";

const STAMP_DUTY_PCT_BY_STATE: Record<string, number> = {
  QLD: 0.04,
  NSW: 0.045,
  VIC: 0.055,
  WA: 0.05,
  SA: 0.05,
  TAS: 0.04,
  ACT: 0.04,
  NT: 0.05,
};

interface TxCostInputs {
  purchasePriceAud: number;
  depositAud: number;
  state?: string;
  /** Default true; first home buyers in some states pay less. */
  firstHomeBuyer?: boolean;
}

const CONVEYANCING_FLAT = 2_500;
const INSPECTIONS_FLAT = 1_200;

function lmiPct(lvr: number): number {
  if (lvr <= 0.80) return 0;
  if (lvr <= 0.85) return 0.013;
  if (lvr <= 0.90) return 0.024;
  if (lvr <= 0.95) return 0.040;
  return 0.055;
}

export function estimateTransactionCosts(inputs: TxCostInputs): TransactionCostsResult {
  const state = (inputs.state ?? "QLD").toUpperCase();
  const stampPct = STAMP_DUTY_PCT_BY_STATE[state] ?? STAMP_DUTY_PCT_BY_STATE.QLD;
  let stampDuty = inputs.purchasePriceAud * stampPct;
  if (inputs.firstHomeBuyer && inputs.purchasePriceAud < 700_000) {
    stampDuty *= 0.4; // Approximate first-home-buyer concession
  }

  const lvr = inputs.depositAud > 0
    ? Math.max(0, (inputs.purchasePriceAud - inputs.depositAud)) / inputs.purchasePriceAud
    : 1;
  const lmi = inputs.purchasePriceAud * lmiPct(lvr);

  const total = stampDuty + CONVEYANCING_FLAT + INSPECTIONS_FLAT + lmi;
  return {
    stampDuty: Math.round(stampDuty),
    conveyancing: CONVEYANCING_FLAT,
    inspections: INSPECTIONS_FLAT,
    lendersMortgageInsurance: Math.round(lmi),
    other: 0,
    total: Math.round(total),
    stateUsed: state,
  };
}

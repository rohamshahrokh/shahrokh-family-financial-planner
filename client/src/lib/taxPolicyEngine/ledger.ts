/**
 * Tax Policy Engine — Carried-Forward Loss Ledger
 *
 * When NG is quarantined (post-reform established properties), losses
 * cannot offset wage income same FY. They accumulate in a ledger and:
 *   - cashflow engine: NEVER reduces this-year wage tax
 *   - same-property positive years: applied first against future rental profit
 *   - on disposal: applied against capital gain via CGT engine
 *   - net worth: surfaces as "deferred tax value" (not cash)
 *
 * Spec: #FWL_FULL_TAX_REFORM_REBUILD_ENGINE_WIDE §7, §11.
 */

import type { PropertyTaxLedger, PropertyTaxLedgerEntry } from "./types";

// ─── Apply one FY's tax result to the ledger ─────────────────────────────────

export interface ApplyFyToLedgerInput {
  propertyId: string;
  fyEndMonth: string; // "YYYY-06"
  /**
   * Same-property taxable net property income for the FY. Negative = loss,
   * positive = profit (rare but possible: positively geared property).
   *
   * IMPORTANT: this is the property-isolated number, NOT wage-offset.
   */
  taxableNetPropertyIncome: number;
}

/**
 * Returns the updated ledger after applying one property's FY result.
 * Pure function — does not mutate the input ledger.
 *
 * Algorithm:
 *   prior balance B
 *   if loss this FY (taxableNetPropertyIncome < 0):
 *     lossGenerated = |taxableNetPropertyIncome|
 *     lossApplied = 0
 *     newBalance = B + lossGenerated
 *   if profit this FY (taxableNetPropertyIncome > 0):
 *     lossGenerated = 0
 *     lossApplied = min(B, profit)   // burn down carry-forward first
 *     newBalance = B − lossApplied
 *   zero result: no-op entry for the FY (keeps audit trail).
 */
export function applyFyToLedger(
  ledger: PropertyTaxLedger,
  input: ApplyFyToLedgerInput,
): PropertyTaxLedger {
  const prior = ledger[input.propertyId] ?? [];
  const priorBalance = prior.length > 0
    ? prior[prior.length - 1]!.carryForwardBalance
    : 0;

  const result = input.taxableNetPropertyIncome;
  let lossGenerated = 0;
  let lossApplied = 0;
  let newBalance = priorBalance;

  if (result < 0) {
    lossGenerated = -result;
    newBalance = priorBalance + lossGenerated;
  } else if (result > 0) {
    lossApplied = Math.min(priorBalance, result);
    newBalance = priorBalance - lossApplied;
  }

  const entry: PropertyTaxLedgerEntry = {
    propertyId: input.propertyId,
    fyEndMonth: input.fyEndMonth,
    lossGenerated,
    lossApplied,
    carryForwardBalance: newBalance,
  };

  return {
    ...ledger,
    [input.propertyId]: [...prior, entry],
  };
}

/** Get the current carry-forward balance for a property (0 if none). */
export function getCarryForwardBalance(
  ledger: PropertyTaxLedger,
  propertyId: string,
): number {
  const entries = ledger[propertyId];
  if (!entries || entries.length === 0) return 0;
  return entries[entries.length - 1]!.carryForwardBalance;
}

/**
 * On disposal, the carry-forward balance is applied against the capital
 * gain (after the discount, before tax). Returns the consumed amount and
 * the residual carry-forward (always 0 in practice, since CGT engine takes
 * the full balance available — but returned explicitly for audit).
 */
export interface ConsumeOnDisposalResult {
  consumed: number;
  residual: number;
}

export function consumeLossesOnDisposal(
  ledger: PropertyTaxLedger,
  propertyId: string,
  discountedGain: number,
): ConsumeOnDisposalResult {
  if (discountedGain <= 0) return { consumed: 0, residual: getCarryForwardBalance(ledger, propertyId) };
  const balance = getCarryForwardBalance(ledger, propertyId);
  const consumed = Math.min(balance, discountedGain);
  return { consumed, residual: balance - consumed };
}

/** Empty ledger constructor. */
export function emptyLedger(): PropertyTaxLedger {
  return {};
}

/**
 * Deferred tax value surfaced in Net Worth UI. Spec §11:
 *   deferred tax value = totalCarryForward × marginalRate
 * Always shown separately from cash — not added to liquid net worth.
 */
export function deferredTaxValue(
  ledger: PropertyTaxLedger,
  marginalRate: number,
): number {
  let total = 0;
  for (const entries of Object.values(ledger)) {
    if (entries.length === 0) continue;
    total += entries[entries.length - 1]!.carryForwardBalance;
  }
  return Math.max(0, total * marginalRate);
}

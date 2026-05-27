/**
 * Sprint 18 Phase 18.2 — Tax friction.
 *
 * Lightweight: surfaces marginal-tax-rate context, remaining concessional
 * super cap, and a CGT estimate when sale is implied. Phase 18.5 explanation
 * builder echoes these to the user.
 */

import type { TaxFrictionResult } from "./feasibilityTypes";

interface TaxFrictionInputs {
  marginalTaxRate: number;
  superCapRemaining?: number;
  /** Set when the action implies selling an asset with gains. */
  unrealisedGainsAud?: number;
  heldOver12Months?: boolean;
}

export function estimateTaxFriction(inputs: TaxFrictionInputs): TaxFrictionResult {
  let cgt = 0;
  if (inputs.unrealisedGainsAud && inputs.unrealisedGainsAud > 0) {
    const discount = inputs.heldOver12Months ? 0.5 : 1.0;
    cgt = inputs.unrealisedGainsAud * discount * inputs.marginalTaxRate;
  }
  const rules: string[] = [];
  if (inputs.superCapRemaining && inputs.superCapRemaining > 0) {
    rules.push(`Concessional super cap headroom: ~$${Math.round(inputs.superCapRemaining)}/yr available`);
  }
  if (cgt > 0) {
    rules.push(
      `Capital gains tax ~$${Math.round(cgt)} at MTR ${(inputs.marginalTaxRate * 100).toFixed(1)}% (${inputs.heldOver12Months ? "50% discount applied" : "no discount"}).`,
    );
  }
  return {
    cgtOnSale: Math.round(cgt),
    marginalTaxRate: inputs.marginalTaxRate,
    superCapRemaining: inputs.superCapRemaining ?? 0,
    divisionRules: rules,
  };
}

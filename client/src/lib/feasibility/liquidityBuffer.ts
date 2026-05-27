/**
 * Sprint 18 Phase 18.2 — Liquidity buffer check.
 *
 * After a capital deployment, does the household still have a sane cash
 * runway? Minimum threshold is 3 months of expenses; preferred is 6.
 */

import type { LiquidityBufferResult } from "./feasibilityTypes";

interface LiquidityInputs {
  cashAud: number;
  outflowAud: number;
  monthlyExpenses: number;
}

const MIN_MONTHS = 3;
const TARGET_MONTHS = 6;

export function assessLiquidityBuffer(inputs: LiquidityInputs): LiquidityBufferResult {
  const post = Math.max(0, inputs.cashAud - inputs.outflowAud);
  const before = inputs.monthlyExpenses > 0 ? inputs.cashAud / inputs.monthlyExpenses : Infinity;
  const after = inputs.monthlyExpenses > 0 ? post / inputs.monthlyExpenses : Infinity;
  const target = TARGET_MONTHS * inputs.monthlyExpenses;
  return {
    preBufferCash: Math.round(inputs.cashAud),
    postBufferCash: Math.round(post),
    monthsRunwayBefore: Number(before.toFixed(1)),
    monthsRunwayAfter: Number(after.toFixed(1)),
    bufferTarget: Math.round(target),
    meetsMinimum: after >= MIN_MONTHS,
  };
}

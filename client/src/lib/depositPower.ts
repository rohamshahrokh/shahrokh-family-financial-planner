/**
 * depositPower.ts — Deposit-power / usable-equity calculator.
 *
 * The core question: "How much can we put down on the next property?"
 *
 * The previous logic looked only at liquid cash. This is materially wrong for
 * Australian property investors because owned property equity can be released
 * via a top-up loan / line of credit and used as deposit. The bank lets you
 * borrow up to a certain LVR (Loan-to-Value Ratio) against existing properties.
 *
 * Per property:
 *   Usable Equity = (Current Value × Max LVR) − Current Loan Balance
 *
 * Aggregate "Next Deposit Capacity":
 *   Cash + Offset
 *   + Σ Usable Equity (PPOR + every IP)
 *   − stamp duty (estimated for the target purchase price)
 *   − cash buffer (emergency reserve, not to be raided)
 *
 * Notes:
 *   - Properties only store `loan_amount` (the original loan) — current
 *     balance is amortised from `purchase_date` using calcLoanBalance.
 *   - Max LVR defaults to 80% (above this triggers LMI). User can override.
 *   - Stamp duty is QLD-default; caller can pass state.
 *
 * This module is pure — no Supabase / network. Inputs come from the caller.
 */

import { safeNum, calcLoanBalance } from './finance';
import { calcStampDuty } from './propertyBuyEngine';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StateCode = 'QLD' | 'NSW' | 'VIC' | 'SA' | 'WA' | 'TAS' | 'NT' | 'ACT';

export interface PropertyEquityRow {
  id:                 string | number;
  name:               string;       // human label, e.g. "PPOR — Aspley"
  type:               string;       // 'ppor' | 'investment' | etc
  current_value:      number;
  current_loan:       number;       // amortised current balance (today)
  max_lvr_pct:        number;       // % used (e.g. 80)
  borrowable:         number;       // current_value × max_lvr / 100
  usable_equity:      number;       // max(0, borrowable − current_loan)
  lvr_today_pct:      number;       // current_loan / current_value × 100
  headroom_pct:       number;       // max_lvr − lvr_today
}

export interface DepositPowerInput {
  cash:              number;
  offset:            number;
  properties:        any[];          // raw property rows from sf_properties
  /** Max LVR used for ALL properties (e.g. 80). Caller can pre-compute
   *  per-property if it ever varies (we read prop.max_lvr_pct first). */
  default_max_lvr:   number;
  /** Target purchase price for stamp-duty estimate. Default $750k. */
  target_price:      number;
  /** Australian state for stamp duty. Default QLD. */
  state:             StateCode;
  /** Cash buffer (emergency fund) NOT counted as deposit. Default $30k. */
  buffer:            number;
  /** Other one-off acquisition costs (legals, building inspection,
   *  application fees). Default 1.5% of price. */
  other_costs_pct?:  number;
  /** Override "today" — used in tests. */
  asOf?:             Date;
}

export interface DepositPowerResult {
  /** Per-property breakdown */
  rows:                  PropertyEquityRow[];
  /** Total usable equity across all properties */
  total_usable_equity:   number;
  /** Cash + offset (raw liquid) */
  total_liquid:          number;
  /** Cash + offset − buffer (cash actually deployable) */
  deployable_cash:       number;
  /** Estimated stamp duty for target purchase */
  est_stamp_duty:        number;
  /** Estimated other acquisition costs */
  est_other_costs:       number;
  /** FINAL DEPOSIT POWER:  liquid + equity − stamp duty − other costs − buffer */
  next_deposit_capacity: number;
  /** What deposit % a 750k buy would represent */
  deposit_pct_of_target: number;
  /** Inputs echoed for display */
  inputs: {
    target_price:    number;
    default_max_lvr: number;
    state:           StateCode;
    buffer:          number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Compute current (amortised) loan balance from origination details. */
export function currentLoanBalance(prop: any, asOf: Date = new Date()): number {
  const origLoan = safeNum(prop.loan_amount);
  if (origLoan <= 0) return 0;
  const rate = safeNum(prop.interest_rate) || 6.5;
  const term = safeNum(prop.loan_term) || 30;

  const settleStr = prop.settlement_date || prop.purchase_date;
  if (!settleStr) return origLoan;

  const settle = new Date(settleStr);
  if (isNaN(settle.getTime())) return origLoan;

  const monthsPaid = Math.max(
    0,
    (asOf.getFullYear() - settle.getFullYear()) * 12 +
      (asOf.getMonth() - settle.getMonth())
  );
  if (monthsPaid === 0) return origLoan;

  // Honour interest-only periods (no principal paid in IO window).
  const ioStart = prop.io_period_start ? new Date(prop.io_period_start) : null;
  const ioEnd   = prop.io_period_end   ? new Date(prop.io_period_end)   : null;
  if (ioStart && ioEnd && asOf >= ioStart && asOf <= ioEnd) return origLoan;

  return Math.max(0, calcLoanBalance(origLoan, rate, term, monthsPaid));
}

/** Build a labelled property row for display. */
function rowLabel(prop: any, idx: number, ipIdx: number): string {
  const base = prop.name || prop.address || (prop.type === 'ppor' ? 'PPOR' : `IP${ipIdx}`);
  if (prop.type === 'ppor') return base.toLowerCase().includes('ppor') ? base : `PPOR — ${base}`;
  return base.toLowerCase().includes('ip') ? base : `IP${ipIdx} — ${base}`;
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export function computeDepositPower(input: DepositPowerInput): DepositPowerResult {
  const asOf       = input.asOf ?? new Date();
  const cash       = safeNum(input.cash);
  const offset     = safeNum(input.offset);
  const buffer     = safeNum(input.buffer);
  const defaultLvr = clamp(safeNum(input.default_max_lvr) || 80, 0, 95);
  const target     = Math.max(0, safeNum(input.target_price) || 750_000);
  const state      = input.state || 'QLD';
  const otherPct   = input.other_costs_pct ?? 1.5;

  // Sort: PPOR first, then IPs in order. Numbering only for IPs.
  const sorted = [...input.properties].sort((a: any, b: any) => {
    if (a.type === 'ppor' && b.type !== 'ppor') return -1;
    if (b.type === 'ppor' && a.type !== 'ppor') return 1;
    return 0;
  });

  const rows: PropertyEquityRow[] = [];
  let ipCounter = 0;
  sorted.forEach((p: any, i: number) => {
    if (p.type !== 'ppor') ipCounter += 1;
    const value      = safeNum(p.current_value) || safeNum(p.purchase_price);
    const loan       = currentLoanBalance(p, asOf);
    const lvrPct     = safeNum(p.max_lvr_pct) || defaultLvr;
    const borrowable = value * (lvrPct / 100);
    const usable     = Math.max(0, borrowable - loan);
    const lvrToday   = value > 0 ? (loan / value) * 100 : 0;
    rows.push({
      id:            p.id ?? i,
      name:          rowLabel(p, i, ipCounter),
      type:          p.type ?? 'investment',
      current_value: Math.round(value),
      current_loan:  Math.round(loan),
      max_lvr_pct:   Math.round(lvrPct * 100) / 100,
      borrowable:    Math.round(borrowable),
      usable_equity: Math.round(usable),
      lvr_today_pct: Math.round(lvrToday * 100) / 100,
      headroom_pct:  Math.round((lvrPct - lvrToday) * 100) / 100,
    });
  });

  const total_usable_equity = rows.reduce((s, r) => s + r.usable_equity, 0);
  const total_liquid        = cash + offset;
  const deployable_cash     = Math.max(0, total_liquid - buffer);
  const est_stamp_duty      = Math.round(calcStampDuty(target, state));
  const est_other_costs     = Math.round(target * (otherPct / 100));

  const next_deposit_capacity = Math.max(
    0,
    deployable_cash + total_usable_equity - est_stamp_duty - est_other_costs
  );

  const deposit_pct_of_target = target > 0
    ? Math.round((next_deposit_capacity / target) * 1000) / 10  // one decimal
    : 0;

  return {
    rows,
    total_usable_equity:    Math.round(total_usable_equity),
    total_liquid:           Math.round(total_liquid),
    deployable_cash:        Math.round(deployable_cash),
    est_stamp_duty,
    est_other_costs,
    next_deposit_capacity:  Math.round(next_deposit_capacity),
    deposit_pct_of_target,
    inputs: {
      target_price:    target,
      default_max_lvr: defaultLvr,
      state,
      buffer,
    },
  };
}

// ─── small util ───────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

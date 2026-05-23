/**
 * Debt classification engine.
 *
 * Maps every debt line (mortgage, personal loan, credit card, 0% finance, etc.)
 * to an explicit class so downstream surfaces (Best Move, Action Queue, Daily
 * Briefing, Executive Overview, Financial OS Centre, Monte Carlo overlays)
 * never treat interest-free or strategic debt as urgent high-APR consumer debt.
 *
 * Design intent:
 *   - APR of 0 is preserved literally — never coerced to a high-rate default.
 *   - Unknown / blank APR is represented as `null` (NOT treated as high APR).
 *   - Mortgage and tax-deductible debts are evaluated strategically.
 *   - 0%/promotional debt approaching expiry generates a timed warning rather
 *     than an aggressive payoff recommendation.
 */
export type DebtType =
  | 'mortgage'
  | 'investment_loan'        // tax-deductible margin / IP loan
  | 'heloc'                  // home equity line of credit
  | 'personal_loan'
  | 'credit_card'
  | 'bnpl'                   // buy-now-pay-later (often 0% promo)
  | 'promo_zero'             // explicit 0% promotional finance
  | 'auto'
  | 'student'
  | 'family'                 // interest-free family loan
  | 'other';

export type DebtClass =
  | 'high_apr_consumer_debt'      // ≥ 10% APR, non-deductible
  | 'medium_apr_debt'             // 5%–10% APR, non-deductible, non-mortgage
  | 'low_apr_debt'                // > 0% but < 5%
  | 'interest_free_debt'          // 0% / unknown-but-explicitly-flagged-as-0
  | 'tax_deductible_debt'         // investment loans, deductible interest
  | 'mortgage_debt'               // PPOR mortgage
  | 'strategic_leverage_debt'     // HELOC / margin used for wealth-building
  | 'unknown_apr_debt';           // blank/unknown — needs review, NOT high APR

export interface DebtRecord {
  /** Stable identifier. */
  id: string;
  /** Human label e.g. "Credit Card", "Promo Couch Finance". */
  name: string;
  /** Outstanding balance ($). */
  balance: number;
  /**
   * Annual percentage rate. Numeric in PERCENT units (e.g. 17 for 17%).
   * - 0  → preserved as interest-free.
   * - null/undefined → unknown — caller must not treat as high APR.
   */
  ratePct: number | null | undefined;
  /** Minimum monthly payment ($/mo). */
  minPaymentMonthly?: number;
  /** Optional debt type — drives classification. */
  type?: DebtType;
  /**
   * Optional promotional/cliff expiry. Used only for 0%/promo debts to flag
   * upcoming rate-step risk. ISO date string.
   */
  expiryDateISO?: string;
  /** Mark the debt's interest as tax-deductible. */
  taxDeductible?: boolean;
  /**
   * TRUE when this debt represents a PLANNED/FUTURE liability (e.g. a loan for
   * an IP that has not yet settled, or a roadmap leverage event). Planned debt
   * MUST be excluded from "current debt", "Best Move" strategic monitoring,
   * and any Executive Overview / Today snapshot surface. It belongs only to
   * Events / Forecast Engine / Scenario Lab surfaces, clearly labelled.
   */
  planned?: boolean;
  /** Optional ISO date — when supplied and > today, the debt is treated as planned. */
  settlementDateISO?: string;
}

export interface ClassifiedDebt extends DebtRecord {
  /** Computed classification — never undefined. */
  debtClass: DebtClass;
  /** Effective APR as a decimal (0.17 = 17%). Undefined if user didn't supply. */
  effectiveAprDecimal: number | null;
  /** Annual interest cost at the effective APR (0 for interest-free/unknown). */
  annualInterestCost: number;
  /** Days until promo expiry (for promo_zero / bnpl / interest_free_debt). */
  daysToExpiry?: number;
}

/**
 * Numeric coercion that preserves an explicit 0 and treats only
 * undefined/null/non-numeric/empty-string as "unknown".
 *
 * IMPORTANT: This is *not* the same as `parseFloat || fallback` — that
 * pattern silently rewrites a real 0 into the fallback, which is exactly
 * the bug we are fixing here.
 */
function readRatePct(rate: number | null | undefined | string): number | null {
  if (rate === null || rate === undefined) return null;
  if (typeof rate === 'string') {
    const trimmed = rate.trim();
    if (trimmed === '') return null;
    const n = parseFloat(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return Number.isFinite(rate) ? (rate as number) : null;
}

function daysBetween(fromISO: string | undefined): number | undefined {
  if (!fromISO) return undefined;
  const target = new Date(fromISO).getTime();
  if (!Number.isFinite(target)) return undefined;
  const now = Date.now();
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

/**
 * Classify a single debt record. The contract:
 *  - 0% APR with any type → interest_free_debt (or promo_zero → still interest_free with expiry watch).
 *  - Unknown APR (null/undefined/blank) → unknown_apr_debt — caller must not treat as high APR.
 *  - taxDeductible flag or investment_loan type → tax_deductible_debt.
 *  - mortgage type → mortgage_debt regardless of rate.
 *  - heloc used strategically → strategic_leverage_debt.
 *  - Otherwise band by APR: <5% low, 5–10% medium, ≥10% high.
 */
export function classifyDebt(input: DebtRecord): ClassifiedDebt {
  const rawRate = readRatePct(input.ratePct);
  const effectiveAprDecimal = rawRate === null ? null : rawRate / 100;
  const annualInterestCost = effectiveAprDecimal === null ? 0 : Math.max(0, input.balance) * effectiveAprDecimal;
  const daysToExpiry = daysBetween(input.expiryDateISO);

  let debtClass: DebtClass;
  if (input.type === 'mortgage') {
    debtClass = 'mortgage_debt';
  } else if (input.taxDeductible || input.type === 'investment_loan') {
    debtClass = 'tax_deductible_debt';
  } else if (input.type === 'heloc') {
    debtClass = 'strategic_leverage_debt';
  } else if (rawRate === null) {
    debtClass = 'unknown_apr_debt';
  } else if (rawRate === 0) {
    debtClass = 'interest_free_debt';
  } else if (rawRate < 5) {
    debtClass = 'low_apr_debt';
  } else if (rawRate < 10) {
    debtClass = 'medium_apr_debt';
  } else {
    debtClass = 'high_apr_consumer_debt';
  }

  return {
    ...input,
    debtClass,
    effectiveAprDecimal,
    annualInterestCost,
    daysToExpiry,
  };
}

export interface DebtPortfolioSummary {
  debts: ClassifiedDebt[];
  /** Sum of balances by class. */
  balanceByClass: Record<DebtClass, number>;
  /** Sum of balances of all non-mortgage / non-deductible debts (the "otherDebts" surface). */
  otherDebtBalance: number;
  /** Sum of balances classified as high_apr_consumer_debt. */
  highAprBalance: number;
  /** Sum of balances at 0% (incl. promo). */
  interestFreeBalance: number;
  /** Weighted average APR (decimal) across the high-APR class. Null if no high-APR debt. */
  highAprWeightedRate: number | null;
  /** Weighted average APR (decimal) across non-mortgage, non-deductible debt. Null if none. */
  consumerWeightedRate: number | null;
  /**
   * Debts that are interest-free with a cliff inside the next 90 days. These
   * generate a TIMED warning — not an aggressive payoff rec.
   */
  promosWithUpcomingCliff: ClassifiedDebt[];
  /** True if at least one high_apr_consumer_debt exists with balance > $1k. */
  hasUrgentHighAprDebt: boolean;
}

/**
 * Detect whether a debt record represents a PLANNED/FUTURE liability rather
 * than a current real one. We treat the following as planned:
 *   - explicit `planned: true` flag
 *   - `settlementDateISO` strictly in the future
 *   - `id` / `name` containing "planned" (case-insensitive) — defensive guard
 *     for legacy seed data that doesn't carry the flag yet.
 *
 * IMPORTANT: This is the single canonical separator between
 * CURRENT_DEBT, PLANNED_DEBT and FORECAST_DEBT. Callers that want to surface
 * "today" must use `partitionCurrentVsPlanned()` or `classifyCurrentDebtPortfolio()`.
 */
export function isPlannedDebt(d: DebtRecord, todayIso?: string): boolean {
  if (d.planned === true) return true;
  if (d.settlementDateISO) {
    const today = todayIso ?? new Date().toISOString().slice(0, 10);
    if (d.settlementDateISO > today) return true;
  }
  const tag = `${d.id ?? ''} ${d.name ?? ''}`.toLowerCase();
  if (tag.includes('planned')) return true;
  if (tag.includes('forecast')) return true;
  return false;
}

/**
 * Split a debt list into the CURRENT vs PLANNED partitions. Pure — does not
 * mutate inputs. The Best Move / Today / Executive Overview surfaces consume
 * `current`; Events / Forecast Engine consume `planned`.
 */
export function partitionCurrentVsPlanned(
  input: DebtRecord[],
  todayIso?: string,
): { current: DebtRecord[]; planned: DebtRecord[] } {
  const current: DebtRecord[] = [];
  const planned: DebtRecord[] = [];
  for (const d of input) {
    if (isPlannedDebt(d, todayIso)) planned.push(d);
    else current.push(d);
  }
  return { current, planned };
}

/**
 * Convenience: classify ONLY the current (real, today) debt records. Use this
 * for Best Move and any surface that must not include planned/forecast debt.
 */
export function classifyCurrentDebtPortfolio(
  input: DebtRecord[],
  todayIso?: string,
): DebtPortfolioSummary {
  return classifyDebtPortfolio(partitionCurrentVsPlanned(input, todayIso).current);
}

export function classifyDebtPortfolio(input: DebtRecord[]): DebtPortfolioSummary {
  const debts = input.map(classifyDebt);
  const zero = (): Record<DebtClass, number> => ({
    high_apr_consumer_debt: 0,
    medium_apr_debt: 0,
    low_apr_debt: 0,
    interest_free_debt: 0,
    tax_deductible_debt: 0,
    mortgage_debt: 0,
    strategic_leverage_debt: 0,
    unknown_apr_debt: 0,
  });
  const balanceByClass = zero();
  for (const d of debts) balanceByClass[d.debtClass] += Math.max(0, d.balance);

  const otherDebtBalance = debts
    .filter(d => d.debtClass !== 'mortgage_debt' && d.debtClass !== 'tax_deductible_debt')
    .reduce((s, d) => s + Math.max(0, d.balance), 0);

  const highAprDebts = debts.filter(d => d.debtClass === 'high_apr_consumer_debt');
  const highAprBalance = highAprDebts.reduce((s, d) => s + Math.max(0, d.balance), 0);
  const highAprWeightedRate = highAprBalance > 0
    ? highAprDebts.reduce((s, d) => s + Math.max(0, d.balance) * (d.effectiveAprDecimal ?? 0), 0) / highAprBalance
    : null;

  const consumerDebts = debts.filter(d =>
    d.debtClass === 'high_apr_consumer_debt' ||
    d.debtClass === 'medium_apr_debt' ||
    d.debtClass === 'low_apr_debt' ||
    d.debtClass === 'interest_free_debt');
  const consumerBalance = consumerDebts.reduce((s, d) => s + Math.max(0, d.balance), 0);
  const consumerWeightedRate = consumerBalance > 0
    ? consumerDebts.reduce((s, d) => s + Math.max(0, d.balance) * (d.effectiveAprDecimal ?? 0), 0) / consumerBalance
    : null;

  const interestFreeBalance = balanceByClass.interest_free_debt;

  const promosWithUpcomingCliff = debts.filter(d =>
    d.debtClass === 'interest_free_debt' &&
    typeof d.daysToExpiry === 'number' &&
    d.daysToExpiry <= 90 &&
    d.daysToExpiry >= 0);

  const hasUrgentHighAprDebt = highAprDebts.some(d => d.balance > 1_000);

  return {
    debts,
    balanceByClass,
    otherDebtBalance,
    highAprBalance,
    interestFreeBalance,
    highAprWeightedRate,
    consumerWeightedRate,
    promosWithUpcomingCliff,
    hasUrgentHighAprDebt,
  };
}

/** Convenience label used in narrative copy and tooltips. */
export function debtClassLabel(c: DebtClass): string {
  switch (c) {
    case 'high_apr_consumer_debt':  return 'High-APR consumer debt';
    case 'medium_apr_debt':         return 'Medium-APR debt';
    case 'low_apr_debt':            return 'Low-APR debt';
    case 'interest_free_debt':      return 'Interest-free debt';
    case 'tax_deductible_debt':     return 'Tax-deductible debt';
    case 'mortgage_debt':           return 'Mortgage';
    case 'strategic_leverage_debt': return 'Strategic leverage';
    case 'unknown_apr_debt':        return 'Unknown-APR debt';
  }
}

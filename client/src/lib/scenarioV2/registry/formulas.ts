/**
 * Family Wealth Lab — Formula Registry (Layer 1 catalog)
 *
 * Every deterministic financial formula the engine uses is indexed here.
 * Entries are EITHER re-exports of existing scenarioV2 functions OR thin
 * pure helpers added to fill specific gaps named in the spec.
 *
 * Rules:
 *   1. Pure. No I/O, no randomness, no globals.
 *   2. Deterministic. Same input → same output, forever.
 *   3. Documented. `description`, `formula`, `unit`, `references` mandatory.
 *   4. Tested. Every entry has a unit test in formulas.test.ts.
 *
 * AI is NEVER allowed to bypass this registry to compute a number.
 */

import {
  computeServiceability,
  computeWageTax,
  computeCgt,
  propertyAnnualTax,
  annualDepreciation,
  stampDutyByState,
  estimateLMI,
  netWorth,
  monthlySurplusOf,
  sequenceRiskMetric,
  type ServiceabilityInput,
  type ServiceabilityResult,
  type WageTaxInput,
  type WageTaxOutput,
  type CgtInput,
  type CgtOutput,
  type PortfolioState,
} from "../index";

// ─────────────────────────────────────────────────────────────────────────────
// Section A — Net-new pure helpers (formally missing from engine surface)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Closed-form monthly P&I payment.
 *
 *   pay = P · r · (1+r)^n / ((1+r)^n − 1),  r = annualRate/12, n = years·12
 *
 * Edge cases: rate=0 → P/n; principal≤0 → 0.
 */
export function amortizationPayment(p: {
  principal: number;
  annualRate: number;
  termYears: number;
}): number {
  if (p.principal <= 0) return 0;
  const n = Math.max(1, Math.round(p.termYears * 12));
  const r = p.annualRate / 12;
  if (r === 0) return p.principal / n;
  const pow = Math.pow(1 + r, n);
  return (p.principal * r * pow) / (pow - 1);
}

/**
 * Full amortization schedule (month-by-month). Used for refinance analysis,
 * interest-deduction calc, debt-recycling planning.
 */
export interface AmortizationRow {
  month: number;
  payment: number;
  interest: number;
  principal: number;
  balance: number;
}
export function amortizationSchedule(p: {
  principal: number;
  annualRate: number;
  termYears: number;
}): AmortizationRow[] {
  const rows: AmortizationRow[] = [];
  if (p.principal <= 0) return rows;
  const n = Math.max(1, Math.round(p.termYears * 12));
  const r = p.annualRate / 12;
  const pay = amortizationPayment(p);
  let bal = p.principal;
  for (let m = 1; m <= n; m++) {
    const interest = bal * r;
    const principal = Math.min(bal, pay - interest);
    bal = Math.max(0, bal - principal);
    rows.push({ month: m, payment: pay, interest, principal, balance: bal });
    if (bal <= 0) break;
  }
  return rows;
}

/** Interest-only payment per month. */
export function interestOnlyPayment(p: {
  principal: number;
  annualRate: number;
}): number {
  if (p.principal <= 0) return 0;
  return (p.principal * p.annualRate) / 12;
}

/**
 * After-tax effective return of $1 sitting in an offset account.
 *
 *   r_eff = mortgageRate × (1 − marginalRate_on_avoided_interest_deduction)
 *
 * For an OWNER-OCCUPIED mortgage, interest is NOT deductible so the offset
 * benefit is the FULL pre-tax mortgage rate — equivalent to an after-tax
 * risk-free return of `mortgageRate / (1 − marginalRate)` when compared
 * against taxable alternatives. We return both views.
 */
export function offsetEffectiveRate(p: {
  mortgageRate: number;
  marginalTaxRate: number;
  /** true if the offset reduces deductible (investment-loan) interest. */
  isInvestmentLoan: boolean;
}): { preTaxEquivalent: number; afterTaxYield: number } {
  const m = Math.max(0, p.mortgageRate);
  const t = Math.min(0.5, Math.max(0, p.marginalTaxRate));
  if (p.isInvestmentLoan) {
    // Interest saved is interest that WOULD have been deductible. So the
    // net benefit is m × (1 − t). The equivalent pre-tax yield is just m.
    return { preTaxEquivalent: m, afterTaxYield: m * (1 - t) };
  }
  // PPOR offset: interest saved is non-deductible. Full m is after-tax.
  // To compare against a taxable investment we gross it up: m / (1 − t).
  return { preTaxEquivalent: m / (1 - t || 1), afterTaxYield: m };
}

/**
 * Net rental yield on an investment property.
 *
 *   netYield = (annualRent − vacancy − holdingCosts − interest) / marketValue
 *
 * `interest` is the cash interest cost (not amortising principal).
 */
export function netRentalYield(p: {
  marketValue: number;
  annualRent: number;
  vacancyRate: number;          // 0..1
  annualHoldingCosts: number;   // rates, insurance, PM fees, maintenance
  annualInterest: number;
}): number {
  if (p.marketValue <= 0) return 0;
  const effRent = p.annualRent * (1 - Math.min(1, Math.max(0, p.vacancyRate)));
  return (effRent - p.annualHoldingCosts - p.annualInterest) / p.marketValue;
}

/**
 * Total property return for a single year.
 *
 *   total = capitalGrowth + netRentalYield − taxDrag
 *
 * Returned as a decimal (e.g. 0.072 = 7.2%).
 */
export function propertyTotalReturn(p: {
  capitalGrowthRate: number;
  netRentalYield: number;
  /** Annual tax drag as a fraction of marketValue (e.g. 0.005 = 0.5% of value). */
  taxDragOnValue: number;
}): number {
  return p.capitalGrowthRate + p.netRentalYield - p.taxDragOnValue;
}

/**
 * Liquidity ratio — months of expenses covered by liquid assets.
 *
 * Liquid assets = cash + offset + ETFs (haircut 5%). Crypto NOT counted
 * (too volatile for survival-buffer math).
 */
export function liquidityRatio(p: {
  cash: number;
  offsetBalance: number;
  etfValue: number;
  monthlyExpenses: number;
  etfHaircut?: number;          // default 0.05
}): number {
  if (p.monthlyExpenses <= 0) return Number.POSITIVE_INFINITY;
  const haircut = p.etfHaircut ?? 0.05;
  const liquid = Math.max(0, p.cash) + Math.max(0, p.offsetBalance) +
    Math.max(0, p.etfValue) * (1 - haircut);
  return liquid / p.monthlyExpenses;
}

/**
 * Dynamic liquidity floor per spec §5.0a. Returns required months and dollars.
 *
 * Base 3mo + dependants + income volatility + leverage + illiquidity +
 * upcoming-event surcharges. Clamped [3, 24] months.
 */
export interface DynamicLiquidityCtx {
  monthlyExpenses: number;
  dependants: number;
  incomeVolatility: number;        // 0..1
  totalLvr: number;                // 0..1
  illiquidAssetShare: number;      // 0..1
  upcomingEvents12mo: { type: string }[];
}
export interface DynamicLiquidityResult {
  floorMonths: number;
  floorDollars: number;
  rationale: string[];
}
export function dynamicLiquidityFloor(ctx: DynamicLiquidityCtx): DynamicLiquidityResult {
  const r: string[] = [];
  let m = 3;
  r.push("base floor 3.0mo");

  const dep = 0.5 * Math.max(0, ctx.dependants);
  if (dep) { m += dep; r.push(`+${dep.toFixed(1)}mo for ${ctx.dependants} dependant(s)`); }

  const vol = 24 * Math.min(1, Math.max(0, ctx.incomeVolatility));
  if (vol) { m += vol; r.push(`+${vol.toFixed(1)}mo for income volatility ${(ctx.incomeVolatility * 100).toFixed(0)}%`); }

  const lev = 6 * Math.max(0, ctx.totalLvr - 0.50);
  if (lev > 0) { m += lev; r.push(`+${lev.toFixed(1)}mo for LVR ${(ctx.totalLvr * 100).toFixed(0)}% > 50%`); }

  const illiq = 4 * Math.min(1, ctx.illiquidAssetShare / 0.80);
  if (illiq > 0) { m += illiq; r.push(`+${illiq.toFixed(1)}mo for illiquid share ${(ctx.illiquidAssetShare * 100).toFixed(0)}%`); }

  if (ctx.upcomingEvents12mo.some(e => e.type === "refinance")) {
    m += 3; r.push("+3.0mo for refinance in 12mo");
  }
  if (ctx.upcomingEvents12mo.some(e => e.type === "buy_property")) {
    m += 6; r.push("+6.0mo for property purchase in 12mo");
  }
  if (ctx.upcomingEvents12mo.some(e => e.type === "retirement")) {
    m += 6; r.push("+6.0mo for retirement transition in 12mo");
  }

  m = Math.max(3, Math.min(24, m));
  return {
    floorMonths: m,
    floorDollars: m * Math.max(0, ctx.monthlyExpenses),
    rationale: r,
  };
}

/** DSR band per spec §5.0. */
export type DsrBand = "healthy" | "watchlist" | "stressed" | "critical";
export function dsrBand(dsr: number): DsrBand {
  if (!Number.isFinite(dsr) || dsr < 0) return "critical";
  if (dsr < 0.30) return "healthy";
  if (dsr < 0.40) return "watchlist";
  if (dsr < 0.55) return "stressed";
  return "critical";
}

/** Refinance pressure band per spec §5.0b. */
export type RefinancePressureBand = "none" | "mild" | "elevated" | "severe";
export function refinancePressureBand(p: {
  nsrBuffered: number;
  rateHeadroomBps: number;
  monthsToNextRefinance: number | null;
}): RefinancePressureBand {
  if (p.nsrBuffered < 1.0) return "severe";
  if (p.monthsToNextRefinance !== null && p.monthsToNextRefinance < 6 && p.nsrBuffered < 1.15) {
    return "severe";
  }
  if (p.nsrBuffered < 1.10 || p.rateHeadroomBps < 100) return "elevated";
  if (p.nsrBuffered < 1.30) return "mild";
  return "none";
}

/**
 * Downside metric.  1 − P10/P50, clamped to [0, 1]. A negative P10 produces
 * downside ≥ 1 (capped at 1). 0 = no downside, 1 = catastrophic.
 */
export function downside(p10: number, p50: number): number {
  if (!Number.isFinite(p50) || p50 === 0) return 1;
  const raw = 1 - p10 / p50;
  if (!Number.isFinite(raw)) return 1;
  return Math.max(0, Math.min(1, raw));
}

/**
 * Survival probability from MC default counts.
 *
 *   survival = 1 − (defaulted_paths + forced_sale_paths × 0.5) / total_paths
 *
 * Forced sales are weighted as half-failures (recoverable but damaging).
 */
export function survivalProbability(p: {
  totalPaths: number;
  defaultedPaths: number;
  forcedSalePaths: number;
}): number {
  if (p.totalPaths <= 0) return 1;
  const fails = p.defaultedPaths + 0.5 * p.forcedSalePaths;
  return Math.max(0, Math.min(1, 1 - fails / p.totalPaths));
}

/**
 * FIRE coverage = passive income / required expenses.
 *
 * Passive income = SWR × invested liquid + net rental yield × property value.
 */
export function fireCoverage(p: {
  investedLiquid: number;        // ETF + super (drawdown-eligible)
  propertyEquity: number;        // unencumbered equity
  netRentalIncome: number;       // annual
  swr: number;                   // safe withdrawal rate, e.g. 0.04
  annualExpenses: number;
}): number {
  if (p.annualExpenses <= 0) return Number.POSITIVE_INFINITY;
  const fromInvested = Math.max(0, p.investedLiquid) * Math.max(0, p.swr);
  const passive = fromInvested + Math.max(0, p.netRentalIncome);
  return passive / p.annualExpenses;
}

/** SWR-sustainable annual spend given a portfolio value. */
export function swrSustainableSpend(p: { portfolio: number; swr: number }): number {
  return Math.max(0, p.portfolio) * Math.max(0, p.swr);
}

// ─────────────────────────────────────────────────────────────────────────────
// Section B — Super & tax constants (FY26)
// ─────────────────────────────────────────────────────────────────────────────

export const SUPER_CONSTANTS_FY26 = {
  concessionalCap: 30_000,
  nonConcessionalCap: 120_000,
  // Carry-forward: unused concessional cap from prior 5 FYs if total super balance < $500k
  carryForwardEligibilityBalanceCap: 500_000,
  carryForwardLookbackYears: 5,
  // Div 293 high-income extra tax on concessional contributions
  div293ThresholdIncome: 250_000,
  div293Rate: 0.15,           // additional on top of 15% contributions tax
  // Super guarantee rate FY26
  sgRate: 0.115,
  // Bring-forward NCC rule
  bringForwardNcc3yrCap: 360_000,
} as const;

export function concessionalSuperCap(p: {
  fy: "2025-26";
  totalSuperBalanceJune30: number;
  carryForwardAvailable: number; // sum of unused caps prior 5y (caller computes)
}): { effectiveCap: number; carryForwardUsable: boolean } {
  const base = SUPER_CONSTANTS_FY26.concessionalCap;
  const eligible = p.totalSuperBalanceJune30 <
    SUPER_CONSTANTS_FY26.carryForwardEligibilityBalanceCap;
  if (eligible) {
    return { effectiveCap: base + Math.max(0, p.carryForwardAvailable), carryForwardUsable: true };
  }
  return { effectiveCap: base, carryForwardUsable: false };
}

export function divisionTwoNinetyThreeTax(p: {
  income: number;
  concessionalContributionsThisYear: number;
}): { liable: boolean; extraTax: number } {
  const threshold = SUPER_CONSTANTS_FY26.div293ThresholdIncome;
  const combined = p.income + p.concessionalContributionsThisYear;
  if (combined <= threshold) return { liable: false, extraTax: 0 };
  const taxableContribs = Math.min(
    p.concessionalContributionsThisYear,
    combined - threshold,
  );
  return { liable: true, extraTax: taxableContribs * SUPER_CONSTANTS_FY26.div293Rate };
}

export function superGuaranteeRate(_fy: "2025-26"): number {
  return SUPER_CONSTANTS_FY26.sgRate;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section C — Risk-adjusted score helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Risk-adjusted return — penalises downside and rewards consistency.
 *
 *   adj = expectedReturn × (1 − 0.5·downside) × min(1, 1 − sequenceRisk)
 *
 * Clamped to [-0.5, 0.5] as decimal return.
 */
export function riskAdjustedReturn(p: {
  expectedReturnCagr: number;
  downside: number;            // 0..1
  sequenceRisk: number;        // 0..1
}): number {
  const downsidePenalty = 1 - 0.5 * Math.min(1, Math.max(0, p.downside));
  const seqPenalty = 1 - Math.min(1, Math.max(0, p.sequenceRisk));
  const raw = p.expectedReturnCagr * downsidePenalty * seqPenalty;
  return Math.max(-0.5, Math.min(0.5, raw));
}

/**
 * Phase 2.5 — deflate a nominal cashflow / amount to real dollars at month t.
 *
 *   real = nominal / (1 + monthlyInflation)^t
 *
 * `inflationAnnual` is annual CPI (e.g. 0.03). Caller passes month-index t.
 * Monotone, deterministic, no clamping (real values may be negative).
 */
export function realDollars(p: {
  nominal: number;
  monthIndex: number;
  inflationAnnual: number;
}): number {
  const m = (1 + p.inflationAnnual) ** (1 / 12);
  return p.nominal / m ** Math.max(0, p.monthIndex);
}

/**
 * Phase 2.5 — convert a nominal CAGR to a real CAGR via Fisher equation.
 *
 *   realCagr = (1 + nominal) / (1 + inflation) − 1
 */
export function realCagr(p: { nominalCagr: number; inflationAnnual: number }): number {
  return (1 + p.nominalCagr) / (1 + p.inflationAnnual) - 1;
}

/**
 * Phase 2.5 — Sortino ratio over a per-sim terminal NW sample. Unlike the
 * Sharpe ratio, only DOWNSIDE deviation (squared semideviation below the
 * minimum acceptable return) enters the denominator. Inputs are samples of
 * terminal NW (or any equivalent return-like sample); the function annualises
 * via the horizon length in months.
 *
 *   excess  = mean(samples) − MAR
 *   downstd = sqrt( mean( min(samples − MAR, 0)^2 ) )
 *   sortino = excess / max(downstd, eps)
 *
 * Returns 0 when downstd is zero (degenerate, no dispersion).
 */
export function sortinoRatio(p: {
  samples: number[];
  minAcceptableReturn: number;
  /** Optional: epsilon to avoid divide-by-zero. */
  eps?: number;
}): number {
  const eps = p.eps ?? 1e-9;
  if (!p.samples || p.samples.length === 0) return 0;
  const n = p.samples.length;
  const mean = p.samples.reduce((a, b) => a + b, 0) / n;
  const excess = mean - p.minAcceptableReturn;
  let downSq = 0;
  let downCount = 0;
  for (const s of p.samples) {
    const d = s - p.minAcceptableReturn;
    if (d < 0) { downSq += d * d; downCount++; }
  }
  if (downCount === 0) {
    // Float-safe: treat |excess| ≤ eps as "no excess" → 0; otherwise sign-aware infinity.
    if (Math.abs(excess) <= eps) return 0;
    return excess > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }
  const downStd = Math.sqrt(downSq / n);  // population semideviation
  if (downStd <= eps) return 0;
  return excess / downStd;
}

/**
 * Phase 2.5 — APRA-related buffer constants exported for the registry.
 * Centralised here so the engine + tests + UI all reference one source.
 * (Existing apraBufferPct default of 0.03 in borrowing.ts unchanged.)
 */
export const APRA_CONSTANTS = {
  /** APG 223 §39 — add to assessment rate when computing NSR. */
  serviceabilityBufferPct: 0.03,
  /** APRA scrutiny line for DTI (debt-to-income). */
  dtiScrutinyLine: 6.0,
  /** APRA cap-zone DTI — banks must justify exceptions. */
  dtiCapZone: 8.0,
  /** APRA-aligned floor rate banks generally adopt internally. */
  floorAssessmentRate: 0.0825,
  /** Reference: APG 223 — Residential Mortgage Lending (Dec 2014, updated 2022). */
  reference: "APRA APG 223 §39 (residential mortgage serviceability buffer)",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Section D — Formula Registry index
// ─────────────────────────────────────────────────────────────────────────────

export type FormulaCategory =
  | "borrowing" | "tax" | "cashflow" | "risk" | "fire" | "return" | "score";

export interface FormulaSpec {
  id: string;
  description: string;
  formula: string;
  unit: string;
  category: FormulaCategory;
  inputs: Record<string, string>;
  output: string;
  references: string[];
  /** Untyped on purpose — registry is an index, not a call site. Type-safe wrappers above. */
  compute: (input: unknown) => unknown;
}

export const FORMULA_REGISTRY: Record<string, FormulaSpec> = {
  // ── Borrowing ───────────────────────────────────────────────────────────
  amortizationPayment: {
    id: "amortizationPayment",
    description: "Closed-form monthly P&I payment for a fixed-term loan.",
    formula: "pay = P·r·(1+r)^n / ((1+r)^n − 1), r = annualRate/12, n = years·12",
    unit: "AUD/month",
    category: "borrowing",
    inputs: { principal: "AUD", annualRate: "decimal", termYears: "years" },
    output: "monthly payment AUD",
    references: ["scenarioV2/registry/formulas.ts", "standard mortgage amortisation"],
    compute: (i) => amortizationPayment(i as any),
  },
  amortizationSchedule: {
    id: "amortizationSchedule",
    description: "Period-by-period amortisation: interest, principal, balance.",
    formula: "iterative P&I split per month",
    unit: "rows[]",
    category: "borrowing",
    inputs: { principal: "AUD", annualRate: "decimal", termYears: "years" },
    output: "AmortizationRow[]",
    references: ["scenarioV2/registry/formulas.ts"],
    compute: (i) => amortizationSchedule(i as any),
  },
  interestOnlyPayment: {
    id: "interestOnlyPayment",
    description: "Monthly interest-only payment on a loan.",
    formula: "pay = P × annualRate / 12",
    unit: "AUD/month",
    category: "borrowing",
    inputs: { principal: "AUD", annualRate: "decimal" },
    output: "monthly interest AUD",
    references: ["scenarioV2/registry/formulas.ts"],
    compute: (i) => interestOnlyPayment(i as any),
  },
  offsetEffectiveRate: {
    id: "offsetEffectiveRate",
    description: "After-tax effective return of $1 in an offset account.",
    formula: "PPOR: after-tax = m, pre-tax-equiv = m/(1−t). IP: after-tax = m(1−t).",
    unit: "decimal",
    category: "return",
    inputs: { mortgageRate: "decimal", marginalTaxRate: "decimal", isInvestmentLoan: "bool" },
    output: "{ preTaxEquivalent, afterTaxYield }",
    references: ["scenarioV2/registry/formulas.ts", "ATO Div 35 negative gearing"],
    compute: (i) => offsetEffectiveRate(i as any),
  },
  dsr: {
    id: "dsr",
    description: "Debt Service Ratio = monthly debt service / monthly gross income.",
    formula: "DSR = monthlyDebtService / monthlyGrossIncome",
    unit: "ratio",
    category: "borrowing",
    inputs: { ...({} as Record<string, string>) },
    output: "ServiceabilityResult.dsr",
    references: ["APRA APG 223", "scenarioV2/borrowing.ts"],
    compute: (i) => computeServiceability(i as ServiceabilityInput).dsr,
  },
  dsrBand: {
    id: "dsrBand",
    description: "Banded DSR: healthy/watchlist/stressed/critical (per spec §5.0).",
    formula: "see dsrBand()",
    unit: "band",
    category: "borrowing",
    inputs: { dsr: "ratio" },
    output: "DsrBand",
    references: ["scenarioV2/registry/formulas.ts"],
    compute: (i) => dsrBand((i as { dsr: number }).dsr),
  },
  dti: {
    id: "dti",
    description: "Debt-to-Income = total debt balance / annual gross income.",
    formula: "DTI = totalDebt / annualGrossIncome",
    unit: "multiplier",
    category: "borrowing",
    inputs: {},
    output: "ServiceabilityResult.dti",
    references: ["APRA APG 223"],
    compute: (i) => computeServiceability(i as ServiceabilityInput).dti,
  },
  lvr: {
    id: "lvr",
    description: "Loan-to-Value = total loans / total property market value.",
    formula: "LVR = totalLoans / totalPropertyValue",
    unit: "ratio",
    category: "borrowing",
    inputs: {},
    output: "ServiceabilityResult.lvr",
    references: ["scenarioV2/borrowing.ts"],
    compute: (i) => computeServiceability(i as ServiceabilityInput).lvr,
  },
  nsr: {
    id: "nsr",
    description: "Net Surplus Ratio at buffered rate (APRA stress test).",
    formula: "(serviceableIncome − expenses) / bufferedDebtService",
    unit: "ratio",
    category: "borrowing",
    inputs: {},
    output: "ServiceabilityResult.nsr",
    references: ["APRA APG 223 §39-42"],
    compute: (i) => computeServiceability(i as ServiceabilityInput).nsr,
  },
  maxBorrowCapacity: {
    id: "maxBorrowCapacity",
    description: "Max additional borrow at the buffered rate.",
    formula: "P = headroomMonthly × annuityFactor(bufferedRate, term)",
    unit: "AUD",
    category: "borrowing",
    inputs: {},
    output: "ServiceabilityResult.maxBorrowCapacity",
    references: ["scenarioV2/borrowing.ts"],
    compute: (i) => computeServiceability(i as ServiceabilityInput).maxBorrowCapacity,
  },
  apraBufferedRate: {
    id: "apraBufferedRate",
    description: "Rate + APRA serviceability buffer (default +3%).",
    formula: "bufferedRate = rate + buffer",
    unit: "decimal",
    category: "borrowing",
    inputs: {},
    output: "ServiceabilityResult.bufferedRate",
    references: ["APRA APG 223 §39"],
    compute: (i) => computeServiceability(i as ServiceabilityInput).bufferedRate,
  },
  refinancePressureBand: {
    id: "refinancePressureBand",
    description: "Categorical refinance-pressure band (none/mild/elevated/severe).",
    formula: "see refinancePressureBand()",
    unit: "band",
    category: "risk",
    inputs: { nsrBuffered: "ratio", rateHeadroomBps: "bps", monthsToNextRefinance: "months|null" },
    output: "RefinancePressureBand",
    references: ["scenarioV2/registry/formulas.ts"],
    compute: (i) => refinancePressureBand(i as any),
  },

  // ── Tax ─────────────────────────────────────────────────────────────────
  wageTax: {
    id: "wageTax",
    description: "Annual wage + rental tax with negative-gearing offset.",
    formula: "taxable = max(0, gross + rentalProfit − rentalLoss); ATO brackets + LITO + Medicare",
    unit: "AUD/year",
    category: "tax",
    inputs: {},
    output: "WageTaxOutput",
    references: ["ATO FY2025-26 brackets", "scenarioV2/auTax.ts"],
    compute: (i) => computeWageTax(i as WageTaxInput),
  },
  cgt: {
    id: "cgt",
    description: "Capital gains tax with 50% discount for assets held >12mo.",
    formula: "discountedGain = gain × (1 − 0.5·heldMoreThan12mo); tax at marginal rate",
    unit: "AUD",
    category: "tax",
    inputs: {},
    output: "CgtOutput",
    references: ["ATO CGT", "scenarioV2/auTax.ts"],
    compute: (i) => computeCgt(i as CgtInput),
  },
  propertyAnnualTax: {
    id: "propertyAnnualTax",
    description: "Annual property tax effect (net of rental income, costs, depreciation).",
    formula: "see scenarioV2/auTax.ts",
    unit: "AUD/year",
    category: "tax",
    inputs: {},
    output: "PropertyTaxEffect",
    references: ["scenarioV2/auTax.ts"],
    compute: (i) => propertyAnnualTax(i as any),
  },
  depreciation: {
    id: "depreciation",
    description: "Div 40 + Div 43 annual depreciation for IP.",
    formula: "Div40 5%·plant + Div43 2.5%·capWorks",
    unit: "AUD/year",
    category: "tax",
    inputs: {},
    output: "AUD",
    references: ["ATO Div 40, Div 43"],
    compute: (i) => annualDepreciation(i as any),
  },
  stampDuty: {
    id: "stampDuty",
    description: "State-specific stamp duty on property purchase.",
    formula: "tiered by state",
    unit: "AUD",
    category: "tax",
    inputs: { price: "AUD", state: "AuState" },
    output: "AUD",
    references: ["State revenue offices"],
    compute: (i) => stampDutyByState((i as any).price, (i as any).state),
  },
  lmi: {
    id: "lmi",
    description: "Lenders Mortgage Insurance estimate for LVR > 80%.",
    formula: "tiered by LVR band",
    unit: "AUD",
    category: "tax",
    inputs: { loan: "AUD", value: "AUD" },
    output: "AUD",
    references: ["scenarioV2/auTax.ts"],
    compute: (i) => estimateLMI((i as any).loan, (i as any).value),
  },
  concessionalSuperCap: {
    id: "concessionalSuperCap",
    description: "Effective FY concessional cap including carry-forward eligibility.",
    formula: "cap = $30k + carryForward (if TSB < $500k)",
    unit: "AUD",
    category: "tax",
    inputs: { fy: "2025-26", totalSuperBalanceJune30: "AUD", carryForwardAvailable: "AUD" },
    output: "{ effectiveCap, carryForwardUsable }",
    references: ["ATO Concessional contributions", "FY26 cap = $30k"],
    compute: (i) => concessionalSuperCap(i as any),
  },
  divisionTwoNinetyThreeTax: {
    id: "divisionTwoNinetyThreeTax",
    description: "Div 293 extra 15% tax on concessional contributions for high-income earners.",
    formula: "extra = 15% × min(contribs, (income+contribs) − $250k)",
    unit: "AUD",
    category: "tax",
    inputs: { income: "AUD", concessionalContributionsThisYear: "AUD" },
    output: "{ liable, extraTax }",
    references: ["ATO Div 293"],
    compute: (i) => divisionTwoNinetyThreeTax(i as any),
  },
  superGuaranteeRate: {
    id: "superGuaranteeRate",
    description: "FY-specific super guarantee rate (FY26 = 11.5%).",
    formula: "lookup table",
    unit: "decimal",
    category: "tax",
    inputs: { fy: "2025-26" },
    output: "decimal",
    references: ["ATO SG rate schedule"],
    compute: (i) => superGuaranteeRate((i as any).fy),
  },

  // ── Return ──────────────────────────────────────────────────────────────
  netRentalYield: {
    id: "netRentalYield",
    description: "Net rental yield after vacancy, holding costs, interest.",
    formula: "(rent·(1−vac) − holdingCosts − interest) / marketValue",
    unit: "decimal",
    category: "return",
    inputs: { marketValue: "AUD", annualRent: "AUD", vacancyRate: "decimal", annualHoldingCosts: "AUD", annualInterest: "AUD" },
    output: "decimal",
    references: ["scenarioV2/registry/formulas.ts"],
    compute: (i) => netRentalYield(i as any),
  },
  propertyTotalReturn: {
    id: "propertyTotalReturn",
    description: "Total property return = growth + net yield − tax drag.",
    formula: "growth + netYield − taxDragOnValue",
    unit: "decimal",
    category: "return",
    inputs: { capitalGrowthRate: "decimal", netRentalYield: "decimal", taxDragOnValue: "decimal" },
    output: "decimal",
    references: ["scenarioV2/registry/formulas.ts"],
    compute: (i) => propertyTotalReturn(i as any),
  },

  // ── Cashflow / NW ───────────────────────────────────────────────────────
  netWorth: {
    id: "netWorth",
    description: "Sum of assets minus liabilities.",
    formula: "cash + offset + ETF + crypto + super + Σ propertyValue − Σ loanBalance",
    unit: "AUD",
    category: "cashflow",
    inputs: { state: "PortfolioState" },
    output: "AUD",
    references: ["scenarioV2/tick.ts"],
    compute: (i) => netWorth((i as { state: PortfolioState }).state),
  },
  monthlySurplus: {
    id: "monthlySurplus",
    description: "Income − expenses − debt service (debt-aware, no double count).",
    formula: "see scenarioV2/tick.ts",
    unit: "AUD/month",
    category: "cashflow",
    inputs: {},
    output: "AUD",
    references: ["scenarioV2/tick.ts"],
    compute: (i) => monthlySurplusOf(i as any),
  },
  liquidityRatio: {
    id: "liquidityRatio",
    description: "Months of expenses covered by liquid assets (cash + offset + ETF haircut).",
    formula: "(cash + offset + 0.95·ETF) / monthlyExpenses",
    unit: "months",
    category: "cashflow",
    inputs: { cash: "AUD", offsetBalance: "AUD", etfValue: "AUD", monthlyExpenses: "AUD" },
    output: "months",
    references: ["scenarioV2/registry/formulas.ts"],
    compute: (i) => liquidityRatio(i as any),
  },
  dynamicLiquidityFloor: {
    id: "dynamicLiquidityFloor",
    description: "Per-candidate liquidity floor (3-24mo) accounting for dependants, income vol, leverage, illiquidity, upcoming events.",
    formula: "see dynamicLiquidityFloor()",
    unit: "months + AUD",
    category: "cashflow",
    inputs: { ctx: "DynamicLiquidityCtx" },
    output: "DynamicLiquidityResult",
    references: ["unified_decision_engine_spec.md §5.0a"],
    compute: (i) => dynamicLiquidityFloor(i as DynamicLiquidityCtx),
  },

  // ── Risk ────────────────────────────────────────────────────────────────
  downside: {
    id: "downside",
    description: "Downside metric: 1 − P10/P50, clamped [0,1].",
    formula: "max(0, min(1, 1 − P10/P50))",
    unit: "ratio",
    category: "risk",
    inputs: { p10: "AUD", p50: "AUD" },
    output: "ratio",
    references: ["unified_decision_engine_spec.md"],
    compute: (i) => downside((i as any).p10, (i as any).p50),
  },
  sequenceRisk: {
    id: "sequenceRisk",
    description: "Sequence-of-returns risk metric over an MC fan.",
    formula: "see scenarioV2/stochastic.ts",
    unit: "ratio",
    category: "risk",
    inputs: {},
    output: "ratio",
    references: ["scenarioV2/stochastic.ts"],
    compute: (i) => sequenceRiskMetric(i as any),
  },
  survivalProbability: {
    id: "survivalProbability",
    description: "1 − (defaulted + 0.5·forced_sale) / total MC paths.",
    formula: "see survivalProbability()",
    unit: "probability",
    category: "risk",
    inputs: { totalPaths: "int", defaultedPaths: "int", forcedSalePaths: "int" },
    output: "probability",
    references: ["unified_decision_engine_spec.md"],
    compute: (i) => survivalProbability(i as any),
  },

  // ── FIRE ────────────────────────────────────────────────────────────────
  fireCoverage: {
    id: "fireCoverage",
    description: "Passive income coverage of expenses = (SWR·invested + net rent) / expenses.",
    formula: "(swr·investedLiquid + netRent) / expenses",
    unit: "ratio",
    category: "fire",
    inputs: { investedLiquid: "AUD", propertyEquity: "AUD", netRentalIncome: "AUD", swr: "decimal", annualExpenses: "AUD" },
    output: "ratio",
    references: ["unified_decision_engine_spec.md"],
    compute: (i) => fireCoverage(i as any),
  },
  swrSustainableSpend: {
    id: "swrSustainableSpend",
    description: "Annual spend sustainable at given SWR for a portfolio value.",
    formula: "portfolio · swr",
    unit: "AUD/year",
    category: "fire",
    inputs: { portfolio: "AUD", swr: "decimal" },
    output: "AUD/year",
    references: ["Trinity Study / Bengen 4% rule"],
    compute: (i) => swrSustainableSpend(i as any),
  },

  // ── Score ───────────────────────────────────────────────────────────────
  riskAdjustedReturn: {
    id: "riskAdjustedReturn",
    description: "Expected CAGR adjusted for downside and sequence risk.",
    formula: "cagr × (1 − 0.5·downside) × (1 − sequenceRisk)",
    unit: "decimal",
    category: "score",
    inputs: { expectedReturnCagr: "decimal", downside: "ratio", sequenceRisk: "ratio" },
    output: "decimal",
    references: ["unified_decision_engine_spec.md §5.3"],
    compute: (i) => riskAdjustedReturn(i as any),
  },
  // Phase 2.5 — inflation, Sortino
  realDollars: {
    id: "realDollars",
    description: "Deflate a nominal dollar amount at month-index t to today's purchasing power.",
    formula: "real = nominal / (1 + inflation)^(t/12)",
    unit: "AUD (real, t0)",
    category: "return",
    inputs: { nominal: "AUD (nominal)", monthIndex: "months", inflationAnnual: "decimal" },
    output: "AUD (real)",
    references: ["ABS CPI series; standard real-vs-nominal deflator"],
    compute: (i) => realDollars(i as any),
  },
  realCagr: {
    id: "realCagr",
    description: "Fisher equation — convert nominal CAGR to real CAGR given an inflation rate.",
    formula: "(1 + nominal) / (1 + inflation) − 1",
    unit: "decimal",
    category: "return",
    inputs: { nominalCagr: "decimal", inflationAnnual: "decimal" },
    output: "decimal",
    references: ["Fisher (1930) The Theory of Interest, ch. II"],
    compute: (i) => realCagr(i as any),
  },
  sortinoRatio: {
    id: "sortinoRatio",
    description: "Excess return divided by downside semideviation; rewards upside, penalises downside only.",
    formula: "sortino = (mean(samples) − MAR) / sqrt(mean(min(samples−MAR, 0)^2))",
    unit: "ratio (dimensionless if samples are returns)",
    category: "risk",
    inputs: { samples: "number[]", minAcceptableReturn: "same units as samples" },
    output: "ratio",
    references: ["Sortino & van der Meer (1991), Journal of Risk Management"],
    compute: (i) => sortinoRatio(i as any),
  },
};

/** Look up a formula spec by id. Throws if unknown — guards against typos. */
export function getFormula(id: string): FormulaSpec {
  const f = FORMULA_REGISTRY[id];
  if (!f) throw new Error(`Formula '${id}' not in registry`);
  return f;
}

/** All registered formula IDs. Stable order = insertion order. */
export function listFormulas(category?: FormulaCategory): string[] {
  const keys = Object.keys(FORMULA_REGISTRY);
  if (!category) return keys;
  return keys.filter((k) => FORMULA_REGISTRY[k].category === category);
}

// Re-export helper types for callers that want strong typing
export type {
  ServiceabilityInput,
  ServiceabilityResult,
  WageTaxInput,
  WageTaxOutput,
  CgtInput,
  CgtOutput,
};

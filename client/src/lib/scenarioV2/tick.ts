/**
 * Scenario Engine V2 — Monthly Tick (Pure Function, Production Build)
 *
 *   tick(state, events, rails, ctx, draws?) → state'
 *
 * Pure: same inputs always produce same outputs. No I/O, no Date, no
 * Math.random. Stochastic returns are passed in via `draws` (the MC driver
 * computes a CORRELATED draw set per month and feeds it here).
 *
 * Order of operations within a month:
 *   1. Apply explicit events (delta-driven asset/contrib/macro changes)
 *   2. Wage income (gross, before tax)
 *   3. Living expenses
 *   4. Property cashflows:
 *        - rent received (IPs only)
 *        - holding costs
 *        - mortgage P&I (interest tracked for FY deductibility)
 *   5. Asset growth (cash, ETF, crypto, super, property — correlated shocks)
 *   6. FY-end tax true-up (July rollover): apply PAYG net,
 *      negative gearing offset, CGT (if pending), refund/owing
 *   7. Roll month
 */

import type {
  BasePlanAssumptions,
  PortfolioState,
  ScenarioEvent,
  MonthKey,
  PropertyState,
} from "./types";
import { addMonths } from "./basePlan";
import {
  computeWageTax,
  propertyAnnualTax,
  annualDepreciation,
  type PropertyAnnualTaxRow,
} from "./auTax";
import { calcIncomeTax } from "../australianTax";
import { partitionRentalLossesByRegime } from "./regimeFyRollup";

// ─── Tick context ────────────────────────────────────────────────────────────

export interface TickContext {
  /** Monthly wage income at month 0 (pre-tax, both partners). */
  baseMonthlyIncome: number;
  /** Monthly living expenses at month 0 (excluding debt service). */
  baseMonthlyExpenses: number;
  /** True if the ledger expense figure already includes debt service. */
  expensesIncludeDebt: boolean;
  /** Months elapsed since plan start (used for growth compounding). */
  monthsElapsed: number;
  /** Current calendar month (1-12). Computed once by the MC driver. */
  calendarMonth: number;
  /** True if HELP/HECS debt is currently being repaid. */
  hasHelpDebt?: boolean;
  /** True if the household has private hospital cover (waives MLS). */
  hasPrivateHospitalCover?: boolean;
  /**
   * Active tax-policy regime selector (Sprint 2A D-004 wiring).
   *
   * When omitted or `CURRENT_RULES` the FY rollup is byte-for-byte identical
   * to the pre-Sprint-2A behaviour. When `PROPOSED_2027_REFORM`,
   * `CUSTOM_STRESS_TEST` or `AUTO_DETECT`, the rollup partitions per-IP
   * rental losses via `regimeFyRollup.partitionRentalLossesByRegime` and
   * passes the regime-adjusted `rentalLoss` into `computeWageTax`. The
   * default (when caller does not opt in) is `CURRENT_RULES`, preserving
   * existing fixtures and tests verbatim.
   */
  taxRegimeSelector?: "CURRENT_RULES" | "PROPOSED_2027_REFORM" | "AUTO_DETECT" | "CUSTOM_STRESS_TEST";
  /**
   * Per-property metadata used for regime resolution. Optional — when
   * absent, the engine falls back to the legacy CURRENT_RULES path even if
   * `taxRegimeSelector` is set, so an absent sidecar never silently changes
   * tax numbers (defence in depth against the "exists-but-not-wired" trap).
   */
  propertyTaxMetadata?: Record<string, {
    propertyType?: import("../taxPolicyEngine").PropertyType;
    contractDate?: string;
    purchaseDate?: string;
  }>;
}

/** Per-month random draws (already correlated by Cholesky). */
export interface TickDraws {
  /** Property growth shock (correlated normal/student-t). */
  propertyShock: number;
  /** Equity (ETF) shock. */
  equityShock: number;
  /** Crypto shock (before jump diffusion). */
  cryptoShock: number;
  /** Multiplicative jump factor for crypto this month (1.0 = no jump). */
  cryptoJump: number;
  /** Short-rate shock (drives mortgage rate drift via Vasicek). */
  rateShock: number;
  /** Super shock (independent of correlation matrix — broadly diversified). */
  superShock: number;
  /** Inflation rate this month (annualised). */
  inflationAnnualised: number;
  /** Current short rate (annualised). Mortgage/cash float over this. */
  shortRate: number;
  /** Stochastic vacancy multiplier in [0,1]: 1.0 = fully let, 0 = vacant month. */
  vacancyFactor: number;
}

// ─── Annual accumulators (live on PortfolioState extension) ──────────────────

/**
 * We extend PortfolioState with FY-trailing fields the tick mutates. To keep
 * types.ts untouched (back-compat), we cast through this interface internally.
 */
export interface InternalAccumulators {
  /** Wage gross accumulated this FY. */
  fyWageGross: number;
  /**
   * Total interest paid on IP loans this FY (deductible).
   *
   * Retained as the FY scalar for backward compatibility; the source-of-truth
   * for the FY tax rollup is now `fyIpInterestPaidById` (Sprint 2A D-003).
   * Legacy callers reading the scalar see the same number they always did.
   */
  fyIpInterestPaid: number;
  /**
   * Per-IP interest paid this FY (Sprint 2A D-003).
   *
   * Replaces the old `fyIpInterestPaid * loanShare` heuristic at FY rollup,
   * which mis-allocated deductible interest in mixed-rate portfolios. Keyed
   * by property id, matching the existing per-IP rent/costs/depreciation
   * accumulators.
   */
  fyIpInterestPaidById: Record<string, number>;
  /** Total interest paid on PPOR (NOT deductible — tracked for clarity). */
  fyPporInterestPaid: number;
  /** Per-IP rent received this FY. */
  fyIpRentReceived: Record<string, number>;
  /** Per-IP costs this FY. */
  fyIpHoldingCosts: Record<string, number>;
  /** Per-IP depreciation accrual this FY. */
  fyIpDepreciation: Record<string, number>;
  /** Per-IP purchase price + years held (for depreciation calc). */
  ipMeta: Record<string, { purchasePrice: number; monthsHeld: number }>;
  /** Pending CGT events to apply at FY end. */
  pendingCgt: number;
  /**
   * Per-property pending CGT context (Sprint 2A D-002).
   *
   * Keyed by property id, captures the discounted gain so the FY rollup can
   * run a bracket-incremental CGT calc (tax(wage + gain) − tax(wage)) instead
   * of the flat-marginal `pendingCgt * marginalRate` shortcut.
   */
  pendingCgtById: Record<string, { discountedGain: number }>;
  /** Last applied FY (4-digit year of the fiscal year ending June). */
  lastFyApplied: number;
}

export type ExtendedPortfolioState = PortfolioState & {
  __acc?: InternalAccumulators;
};

function ensureAcc(state: ExtendedPortfolioState): InternalAccumulators {
  if (!state.__acc) {
    state.__acc = {
      fyWageGross: 0,
      fyIpInterestPaid: 0,
      fyIpInterestPaidById: {},
      fyPporInterestPaid: 0,
      fyIpRentReceived: {},
      fyIpHoldingCosts: {},
      fyIpDepreciation: {},
      ipMeta: {},
      pendingCgt: 0,
      pendingCgtById: {},
      lastFyApplied: 0,
    };
  }
  if (!state.__acc.fyIpInterestPaidById) state.__acc.fyIpInterestPaidById = {};
  if (!state.__acc.pendingCgtById) state.__acc.pendingCgtById = {};
  return state.__acc;
}

// ─── tick ────────────────────────────────────────────────────────────────────

export function tick(
  state: ExtendedPortfolioState,
  events: ScenarioEvent[],
  rails: BasePlanAssumptions,
  ctx: TickContext,
  draws: TickDraws | null = null,
): ExtendedPortfolioState {
  // Working copy (deep-ish — properties + accumulators)
  const next: ExtendedPortfolioState = {
    ...state,
    properties: state.properties.map((p) => ({ ...p })),
    __acc: state.__acc
      ? {
          ...state.__acc,
          fyIpRentReceived: { ...state.__acc.fyIpRentReceived },
          fyIpHoldingCosts: { ...state.__acc.fyIpHoldingCosts },
          fyIpDepreciation: { ...state.__acc.fyIpDepreciation },
          fyIpInterestPaidById: { ...(state.__acc.fyIpInterestPaidById ?? {}) },
          pendingCgtById: { ...(state.__acc.pendingCgtById ?? {}) },
          ipMeta: { ...state.__acc.ipMeta },
        }
      : undefined,
  };
  const acc = ensureAcc(next);

  // ─── 1. Process explicit events ────────────────────────────────────────────
  for (const e of events) {
    applyEvent(next, e, acc, ctx);
  }

  // ─── 2. Wage income (gross — tax paid at FY end) ──────────────────────────
  const yearsElapsed = ctx.monthsElapsed / 12;
  const inflationFactor = Math.pow(1 + rails.incomeGrowth, yearsElapsed);
  const monthlyGross = ctx.baseMonthlyIncome * inflationFactor;
  next.cash += monthlyGross;
  acc.fyWageGross += monthlyGross;
  next.ttmIncome = monthlyGross * 12;

  // ─── 3. Living expenses ────────────────────────────────────────────────────
  // Expense growth includes the stochastic inflation (when supplied).
  const effInflation = draws?.inflationAnnualised ?? rails.expenseGrowth;
  const expenseFactor = Math.pow(1 + effInflation, 1 / 12); // monthly compounding-equivalent
  // We grow expenses by the cumulative inflation since start, using the
  // arithmetic-mean approach for stability under random inflation:
  const baseExp = ctx.baseMonthlyExpenses
    * Math.pow(1 + rails.expenseGrowth, yearsElapsed)
    * (1 + (effInflation - rails.expenseGrowth) / 12); // small monthly perturbation
  next.cash -= baseExp;
  next.ttmExpenses = baseExp * 12;
  // Suppress unused: monthly compounding factor reserved for explicit per-month
  void expenseFactor;

  // ─── 4. Property cashflows ────────────────────────────────────────────────
  // The mortgage rate floats with the short rate when the property is on a
  // variable rate — implemented as p.rate gravitating slowly toward
  // (shortRate + spread). For the slice we keep p.rate fixed unless a refinance
  // event explicitly resets it.
  for (const p of next.properties) {
    const isInvestment = p.monthlyRent > 0;

    // Rent income (stochastic vacancy applied)
    if (isInvestment) {
      const vacancy = draws?.vacancyFactor ?? 1.0;
      const inflated = p.monthlyRent
        * Math.pow(1 + effInflation, yearsElapsed)
        * vacancy;
      next.cash += inflated;
      acc.fyIpRentReceived[p.id] = (acc.fyIpRentReceived[p.id] ?? 0) + inflated;
      // Holding costs grow with inflation
      const cost = p.monthlyCosts * Math.pow(1 + effInflation, yearsElapsed);
      next.cash -= cost;
      acc.fyIpHoldingCosts[p.id] = (acc.fyIpHoldingCosts[p.id] ?? 0) + cost;
      // Depreciation accrual (paper deduction, no cash impact)
      const meta = acc.ipMeta[p.id];
      if (meta) {
        const yearsHeld = meta.monthsHeld / 12;
        const annualDepn = annualDepreciation({
          purchasePrice: meta.purchasePrice,
          yearsSincePurchase: yearsHeld,
        });
        acc.fyIpDepreciation[p.id] = (acc.fyIpDepreciation[p.id] ?? 0) + annualDepn / 12;
        meta.monthsHeld += 1;
      }
    }

    // Mortgage P&I — split interest vs principal
    // CRITICAL: when the property's repayment is already represented in the
    // household ledger (baseMonthlyExpenses), DO NOT deduct cash here — we
    // would be double-counting. Still accrue principal/interest for the
    // amortisation + tax deduction tracking.
    if (p.loanBalance > 0 && p.monthlyRepayment > 0) {
      // Mortgage rate floats vs short rate when stochastic rate is supplied.
      // Smooth gravitation toward (shortRate + 1.5% spread) to avoid step
      // changes. Disabled when draws are null (deterministic path).
      if (draws && typeof draws.shortRate === "number" && draws.shortRate >= 0) {
        const targetRate = Math.max(0.03, draws.shortRate + 0.015);
        const adj = 0.05; // 5% gravitation per month
        p.rate = p.rate * (1 - adj) + targetRate * adj;
      }
      const monthlyRate = p.rate / 12;
      // Interest accrues on (loan - offset) net balance
      const netLoanForInterest = Math.max(0, p.loanBalance - (p.offsetBalance ?? 0));
      const interest = netLoanForInterest * monthlyRate;
      let principal = Math.max(0, p.monthlyRepayment - interest);
      if (principal > p.loanBalance) principal = p.loanBalance;
      // Track interest by property type (always — needed for tax).
      // Sprint 2A D-003: also accumulate per-IP so the FY rollup can deduct
      // the correct deductible interest for each property without resorting
      // to the loan-balance-share heuristic.
      if (isInvestment) {
        acc.fyIpInterestPaid += interest;
        acc.fyIpInterestPaidById[p.id] = (acc.fyIpInterestPaidById[p.id] ?? 0) + interest;
      } else {
        acc.fyPporInterestPaid += interest;
      }
      // Only deduct from cash when NOT already in the household ledger.
      if (!p.inLedger) {
        const totalPay = interest + principal;
        next.cash -= totalPay;
      }
      // Principal still amortises regardless of inLedger — the loan balance
      // tracks the amortisation schedule whether or not cash moves through
      // this branch.
      p.loanBalance = Math.max(0, p.loanBalance - principal);
    }

    // Property market value growth (with stochastic shock)
    const muM = Math.pow(1 + rails.propertyGrowth, 1 / 12) - 1;
    const sigmaM = rails.propertyVol / Math.sqrt(12);
    const shock = draws ? draws.propertyShock * sigmaM : 0;
    p.marketValue *= 1 + muM + shock;
    p.marketValue = Math.max(0, p.marketValue);
  }

  // ─── 5. Insolvency / liquidation cascade ─────────────────────────────────
  // If cash has gone negative this month, draw on liquid reserves in a
  // realistic order: ETF → crypto → forced property sale. If everything
  // is exhausted, mark the household as DEFAULTED and freeze further
  // compounding (no recursive negative-debt explosion).
  if (next.cash < 0) {
    applyLiquidationCascade(next);
  }

  // ─── 6. Other asset growth ───────────────────────────────────────────────
  // Cash earns the short rate (or rails.cashApr fallback) when POSITIVE.
  // When negative, accrue overdraft/margin interest at a penalty spread
  // (cashApr + 6%) — this is realistic for unsecured overdrafts and
  // prevents the previous bug where negative cash was getting multiplied
  // by a positive (1+r) factor, making it more negative each month.
  if (next.cash >= 0) {
    const effCashApr = draws?.shortRate ?? rails.cashApr;
    next.cash *= 1 + (Math.pow(1 + effCashApr, 1 / 12) - 1);
  } else {
    const overdraftApr = (draws?.shortRate ?? rails.cashApr) + 0.06;
    const monthlyOverdraft = Math.pow(1 + overdraftApr, 1 / 12) - 1;
    const accrued = -next.cash * monthlyOverdraft; // positive number
    next.cash -= accrued;
    next.marginInterestAccrued = (next.marginInterestAccrued ?? 0) + accrued;
  }

  next.etfBalance *= 1 + growthMonth(
    rails.stockReturn,
    rails.stockVol,
    draws?.equityShock ?? null,
  );

  // Crypto: shock × jump diffusion
  const cryptoBase = 1 + growthMonth(
    rails.cryptoReturn,
    rails.cryptoVol,
    draws?.cryptoShock ?? null,
  );
  const jump = draws?.cryptoJump ?? 1.0;
  next.cryptoBalance *= cryptoBase * jump;
  next.cryptoBalance = Math.max(0, next.cryptoBalance);

  // Super (independent shock)
  next.superRoham *= 1 + growthMonth(
    rails.superReturn,
    rails.superVol,
    draws?.superShock ?? null,
  );
  next.superFara *= 1 + growthMonth(
    rails.superReturn,
    rails.superVol,
    draws?.superShock ?? null,
  );

  // Non-investable buckets (audit fix P1.1) — kept in NW for reconciliation
  // with the dashboard. Cars/otherAssets are held flat (no stochastic model);
  // iran_property grows at half the AU property rate (FX + non-correlation
  // haircut); otherDebts amortises at 15% APR / 12 from cash to mirror the
  // dashboard's heuristic.
  if (next.cars == null) next.cars = 0;
  if (next.iranProperty == null) next.iranProperty = 0;
  if (next.otherAssets == null) next.otherAssets = 0;
  if (next.otherDebts == null) next.otherDebts = 0;

  if (next.iranProperty > 0) {
    const iranMu = Math.pow(1 + rails.propertyGrowth * 0.5, 1 / 12) - 1;
    next.iranProperty *= 1 + iranMu;
  }

  if (next.otherDebts > 0) {
    // Same heuristic as dashboardDataContract.selectOtherDebtRepayment so the
    // engine and dashboard agree on amortisation pace.
    const payment = Math.min(next.otherDebts, (next.otherDebts * 0.15) / 12);
    if (payment > 0) {
      next.cash -= payment;
      next.otherDebts = Math.max(0, next.otherDebts - payment);
    }
  }

  // ─── 7. FY tax true-up at end of June ────────────────────────────────────
  if (ctx.calendarMonth === 6) {
    applyFyTax(next, acc, rails, ctx);
    // Tax true-up can push cash negative — re-run cascade if needed.
    if (next.cash < 0) applyLiquidationCascade(next);
  }

  // ─── 8. Roll month ───────────────────────────────────────────────────────
  next.month = addMonths(state.month, 1);

  return next;
}

// ─── Event reducers ──────────────────────────────────────────────────────────

function applyEvent(
  state: ExtendedPortfolioState,
  e: ScenarioEvent,
  acc: InternalAccumulators,
  _ctx: TickContext,
): void {
  const p = e.payload as Record<string, unknown>;
  const n = (k: string, fallback = 0) => {
    const v = p?.[k];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  };
  const s = (k: string, fallback = "") => {
    const v = p?.[k];
    return typeof v === "string" ? v : fallback;
  };

  switch (e.type) {
    case "contribution.crypto_lump": {
      const desired = n("amount", 0);
      const moved = Math.min(desired, Math.max(0, state.cash));
      state.cash -= moved;
      state.cryptoBalance += moved;
      return;
    }
    case "contribution.etf_lump": {
      const desired = n("amount", 0);
      const moved = Math.min(desired, Math.max(0, state.cash));
      state.cash -= moved;
      state.etfBalance += moved;
      return;
    }
    case "contribution.etf_dca": {
      // Recurring monthly contribution — payload.amount is per month
      const amt = Math.min(n("amount", 0), Math.max(0, state.cash));
      state.cash -= amt;
      state.etfBalance += amt;
      return;
    }
    case "contribution.offset_deposit": {
      // Move cash → first PPOR offset account (reduces interest accrual base)
      const desired = n("amount", 0);
      const moved = Math.min(desired, Math.max(0, state.cash));
      state.cash -= moved;
      const ppor = state.properties.find((pp) => pp.monthlyRent === 0);
      if (ppor) ppor.offsetBalance += moved;
      else state.cash += moved; // rollback if no PPOR
      return;
    }
    case "asset.cash_hold":
      return; // no-op (attribution-only)
    case "debt.extra_repayment": {
      const amt = n("amount", 0);
      const tgt = s("targetPropertyId");
      const moved = Math.min(amt, Math.max(0, state.cash));
      state.cash -= moved;
      let remaining = moved;
      for (const prop of state.properties) {
        if (remaining <= 0) break;
        if (tgt && prop.id !== tgt) continue;
        const apply = Math.min(remaining, prop.loanBalance);
        prop.loanBalance -= apply;
        remaining -= apply;
      }
      // Any unallocated cash goes back to cash (e.g., no debt to pay)
      state.cash += remaining;
      return;
    }
    case "debt.refinance": {
      // Reset rate (+ optional term) on target property
      const tgt = s("targetPropertyId");
      const newRate = n("newRate", -1);
      const newTerm = n("newTermYears", -1);
      for (const prop of state.properties) {
        if (tgt && prop.id !== tgt) continue;
        if (newRate >= 0) prop.rate = newRate;
        const term = newTerm > 0 ? newTerm : 30;
        const r = prop.rate / 12;
        const nMonths = term * 12;
        prop.monthlyRepayment = prop.loanBalance > 0 && r > 0
          ? (prop.loanBalance * r * Math.pow(1 + r, nMonths)) / (Math.pow(1 + r, nMonths) - 1)
          : prop.loanBalance / nMonths;
      }
      return;
    }
    case "asset.buy_property": {
      const outflow = n("cashOutflow", 0);
      const moved = Math.min(outflow, Math.max(0, state.cash));
      state.cash -= moved;
      const purchasePrice = n("purchasePrice", n("marketValue", 0));
      // FWL-078 defensive normaliser (mirrors deltas.ts translateBuyProperty):
      // amortisation expects decimal rate. If a caller passes percent (rate > 1)
      // we coerce to decimal to prevent 650% APR amortisation regressions.
      const rateRaw = n("rate", 0.065);
      const rateDecimal = rateRaw > 1 ? rateRaw / 100 : rateRaw;
      const newProp: PropertyState = {
        id: `ip-${state.properties.length + 1}-${e.sourceDeltaId ?? "x"}`,
        marketValue: n("marketValue", purchasePrice),
        loanBalance: n("loanBalance", 0),
        rate: rateDecimal,
        monthlyRepayment: amort(n("loanBalance", 0), rateDecimal, n("termYears", 30)),
        monthlyRent: weeklyToMonthlyRent(
          n("weeklyRent", 0),
          n("vacancyRate", 0.04),
          n("managementFee", 0.08),
        ),
        monthlyCosts: n("annualHoldingCosts", 0) / 12,
        offsetBalance: 0,
      };
      // New IPs from buy_property events are NOT in the household ledger.
      newProp.inLedger = false;
      state.properties = [...state.properties, newProp];
      acc.ipMeta[newProp.id] = {
        purchasePrice,
        monthsHeld: 0,
      };
      return;
    }
    case "asset.sell_property": {
      const tgt = s("targetPropertyId");
      const idx = state.properties.findIndex((pp) => pp.id === tgt);
      if (idx < 0) return;
      const prop = state.properties[idx];
      const salePrice = n("salePrice", prop.marketValue);
      const costBase = n("costBase", salePrice * 0.85); // fallback
      // Pay off loan; receive net proceeds
      const sellingCosts = salePrice * (n("sellingCostsPct", 0.025));
      const netSale = salePrice - sellingCosts;
      const debtPaid = Math.min(prop.loanBalance, netSale);
      state.cash += netSale - debtPaid;
      // CGT pending for FY-end (50% discount if held > 12 months)
      const meta = acc.ipMeta[prop.id];
      const heldGt12 = !meta || meta.monthsHeld > 12;
      const rawGain = salePrice - costBase - sellingCosts;
      if (rawGain > 0) {
        const discounted = heldGt12 ? rawGain * 0.5 : rawGain;
        // Stash discounted gain — applied at FY end. The scalar
        // `pendingCgt` is kept for back-compat; per-property is tracked in
        // `pendingCgtById` so FY rollup can do a bracket-incremental tax
        // calc rather than (gain × marginal). Sprint 2A D-002.
        acc.pendingCgt += discounted;
        const prev = acc.pendingCgtById[prop.id]?.discountedGain ?? 0;
        acc.pendingCgtById[prop.id] = { discountedGain: prev + discounted };
      }
      // Remove property
      state.properties = state.properties.filter((_, i) => i !== idx);
      delete acc.ipMeta[prop.id];
      delete acc.fyIpRentReceived[prop.id];
      delete acc.fyIpHoldingCosts[prop.id];
      delete acc.fyIpDepreciation[prop.id];
      delete acc.fyIpInterestPaidById[prop.id];
      return;
    }
    case "macro.rate_spike": {
      // Bump every variable-rate loan by `bumpPct` percentage points
      const bump = n("bumpPct", 0) / 100;
      for (const prop of state.properties) {
        prop.rate = Math.max(0, prop.rate + bump);
        // Recompute repayment
        const r = prop.rate / 12;
        const n2 = 30 * 12;
        prop.monthlyRepayment = prop.loanBalance > 0 && r > 0
          ? (prop.loanBalance * r * Math.pow(1 + r, n2)) / (Math.pow(1 + r, n2) - 1)
          : 0;
      }
      return;
    }
    case "macro.regime_shift": {
      // Apply a market shock multiplier (e.g., -0.30 = -30% crash)
      const equityShock = n("equityShock", 0);
      const cryptoShock = n("cryptoShock", 0);
      const propertyShock = n("propertyShock", 0);
      state.etfBalance = Math.max(0, state.etfBalance * (1 + equityShock));
      state.cryptoBalance = Math.max(0, state.cryptoBalance * (1 + cryptoShock));
      for (const prop of state.properties) {
        prop.marketValue = Math.max(0, prop.marketValue * (1 + propertyShock));
      }
      return;
    }
    case "income.salary_change": {
      // Permanent change to base income — handled by adjusting ttm income
      const newAnnualGross = n("newAnnualGross", 0);
      if (newAnnualGross > 0) state.ttmIncome = newAnnualGross;
      return;
    }
    case "income.career_break": {
      // Temporary: zero income for `months` months. Implemented by adding a
      // negative cash event equal to current monthly income.
      const months = n("months", 0);
      const reducePct = n("incomeReductionPct", 1.0);
      const monthlyIncome = state.ttmIncome / 12;
      // Apply as a one-shot lump-sum hit equal to the missing income for the
      // whole break (simplified — full implementation would emit recurring
      // income.career_break events at translation time).
      state.cash -= monthlyIncome * months * reducePct;
      return;
    }
    case "expense.child_cost": {
      // Add a per-month child cost from now until horizon (simplified one-shot)
      const monthlyCost = n("monthlyCost", 0);
      const months = n("months", 12);
      state.cash -= monthlyCost * months;
      return;
    }
    case "expense.recurring": {
      // Generic; not auto-fired by base plan (already tracked in TickContext)
      return;
    }
    default:
      return;
  }
}

// ─── FY tax application ──────────────────────────────────────────────────────

function applyFyTax(
  state: ExtendedPortfolioState,
  acc: InternalAccumulators,
  _rails: BasePlanAssumptions,
  ctx: TickContext,
): void {
  // Sum IP-level annual tax rows.
  //
  // Sprint 2A D-003: deductible interest is now read PER-PROPERTY from
  // `fyIpInterestPaidById` instead of split from the scalar `fyIpInterestPaid`
  // by current loan-balance share. When the per-IP record is empty (legacy
  // state or no IP loans), the old loan-share heuristic is used as a safety
  // fallback.
  let totalRentalProfit = 0;
  let totalRentalLoss = 0;
  const perPropertyTaxable: Array<{ id: string; taxable: number }> = [];
  for (const p of state.properties) {
    if (p.monthlyRent === 0) continue;
    const rent = acc.fyIpRentReceived[p.id] ?? 0;
    const costs = acc.fyIpHoldingCosts[p.id] ?? 0;
    const depn = acc.fyIpDepreciation[p.id] ?? 0;
    let interest = acc.fyIpInterestPaidById?.[p.id];
    if (interest == null) {
      // Fallback (only triggers when per-IP record wasn't populated, e.g.
      // legacy persisted state). Keeps numerical parity with pre-D-003 behaviour.
      const totalLoan = state.properties.reduce((s, pp) => s + (pp.monthlyRent > 0 ? pp.loanBalance : 0), 0);
      const loanShare = totalLoan > 0 ? p.loanBalance / totalLoan : 0;
      interest = acc.fyIpInterestPaid * loanShare;
    }
    const taxable = rent - costs - interest - depn;
    perPropertyTaxable.push({ id: p.id, taxable });
    if (taxable >= 0) totalRentalProfit += taxable;
    else totalRentalLoss += -taxable;
  }

  // Sprint 2A D-004: regime-aware rental loss partitioning.
  //
  // When the caller opts into a non-CURRENT_RULES regime AND provides per-
  // property metadata, route the per-IP taxable rows through
  // `regimeFyRollup.partitionRentalLossesByRegime` and use its returned
  // `deductibleAgainstWage` value as the rental loss going into the
  // counter-factual NG calc. Quarantined / abolished losses are dropped from
  // the deduction (and could be ledger-persisted in a future patch). When
  // the caller doesn't opt in or metadata is absent, the legacy total is
  // used — no behavioural change for existing fixtures / tests.
  let effectiveRentalLoss = totalRentalLoss;
  const wantsRegime = ctx.taxRegimeSelector && ctx.taxRegimeSelector !== "CURRENT_RULES";
  if (wantsRegime && ctx.propertyTaxMetadata) {
    const rows = perPropertyTaxable.map((r) => {
      const meta = ctx.propertyTaxMetadata?.[r.id];
      return {
        propertyId: r.id,
        taxableNetIncome: r.taxable,
        propertyType: meta?.propertyType,
        contractDate: meta?.contractDate,
        purchaseDate: meta?.purchaseDate,
      };
    });
    const fyEndMonth = `${1970 + acc.lastFyApplied}-06`;
    const result = partitionRentalLossesByRegime({
      rows,
      fyEndMonth,
      regimeSelector: ctx.taxRegimeSelector,
    });
    effectiveRentalLoss = result.deductibleAgainstWage;
  }

  // Compute wage tax with NG offset
  const wage = computeWageTax({
    annualGross: acc.fyWageGross,
    rentalLoss: effectiveRentalLoss,
    rentalProfit: totalRentalProfit,
    hasHelpDebt: ctx.hasHelpDebt,
    hasPrivateHospitalCover: ctx.hasPrivateHospitalCover,
  });

  // Sprint 2A D-002: bracket-incremental CGT.
  //
  // The pre-Sprint-2A path was `pendingCgt * marginalRate`, which overstates
  // CGT when the gain pushes the household out of one bracket into a higher
  // one (the marginal rate at the post-NG taxable income is higher than the
  // average rate across the bracket span the gain straddles). The
  // bracket-incremental approach matches `auTax.computeCgt`'s legacy path
  // (taxWithGain − taxOnWage). We compute it on the post-NG wage base — the
  // counterfactual reflects the actual tax position the household sits in
  // when the gain lands.
  let cgt = 0;
  if (acc.pendingCgt > 0.005) {
    // taxableIncome already accounts for negative gearing offset
    const baseTaxable = wage.taxableIncome;
    const taxWithGain = calcIncomeTax(baseTaxable + acc.pendingCgt);
    const taxOnBase = calcIncomeTax(baseTaxable);
    cgt = Math.max(0, taxWithGain - taxOnBase);
  }

  // Apply: deduct total tax from cash
  const totalTaxDue = wage.totalAnnualTax + cgt;
  state.cash -= totalTaxDue;
  state.fyTaxPaid = totalTaxDue;

  // Reset FY accumulators
  acc.fyWageGross = 0;
  acc.fyIpInterestPaid = 0;
  acc.fyIpInterestPaidById = {};
  acc.fyPporInterestPaid = 0;
  acc.fyIpRentReceived = {};
  acc.fyIpHoldingCosts = {};
  acc.fyIpDepreciation = {};
  acc.pendingCgt = 0;
  acc.pendingCgtById = {};
  acc.lastFyApplied += 1;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// ─── Insolvency / Liquidation cascade ───────────────────────────────────────

/**
 * Realistic distressed-deleveraging cascade. When monthly cash goes
 * negative the household draws on assets in this order:
 *   1. Offset balances (PPOR offset is essentially redraw cash)
 *   2. Liquid investments: ETF, then crypto (with slippage costs)
 *   3. Forced property sale (with 5% distressed-sale haircut + 2.5% costs)
 *   4. Super CANNOT be touched pre-preservation age — left alone
 *   5. If still negative, mark DEFAULTED and floor the overdraft.
 */
function applyLiquidationCascade(state: ExtendedPortfolioState): void {
  if (state.cash >= 0) return;
  if (state.defaulted) {
    const floor = -Math.max(50_000, state.ttmIncome * 5);
    if (state.cash < floor) state.cash = floor;
    return;
  }

  for (const p of state.properties) {
    if (state.cash >= 0) break;
    if (p.monthlyRent > 0) continue;
    const offset = p.offsetBalance ?? 0;
    if (offset <= 0) continue;
    const take = Math.min(-state.cash, offset);
    p.offsetBalance = offset - take;
    state.cash += take;
  }

  if (state.cash < 0 && state.etfBalance > 0) {
    const grossNeeded = Math.min(state.etfBalance, -state.cash / 0.95);
    state.etfBalance -= grossNeeded;
    state.cash += grossNeeded * 0.95;
  }

  if (state.cash < 0 && state.cryptoBalance > 0) {
    const grossNeeded = Math.min(state.cryptoBalance, -state.cash / 0.93);
    state.cryptoBalance -= grossNeeded;
    state.cash += grossNeeded * 0.93;
  }

  if (state.cash < 0 && state.properties.length > 0) {
    const ranked = state.properties
      .map((p, idx) => ({
        p,
        idx,
        equity: p.marketValue - p.loanBalance,
        isIp: p.monthlyRent > 0,
      }))
      .sort((a, b) => {
        if (a.isIp !== b.isIp) return a.isIp ? -1 : 1;
        return a.equity - b.equity;
      });
    const toRemove = new Set<number>();
    for (const r of ranked) {
      if (state.cash >= 0) break;
      const distressedPrice = r.p.marketValue * 0.95;
      const sellingCosts = distressedPrice * 0.025;
      const netSale = distressedPrice - sellingCosts;
      const debtPaid = Math.min(r.p.loanBalance, netSale);
      const proceeds = netSale - debtPaid;
      if (proceeds > 0) {
        state.cash += proceeds;
        state.forcedSales = (state.forcedSales ?? 0) + proceeds;
      }
      toRemove.add(r.idx);
    }
    if (toRemove.size > 0) {
      state.properties = state.properties.filter((_, i) => !toRemove.has(i));
    }
  }

  if (state.cash < 0) {
    state.defaulted = true;
    state.defaultMonth = state.month;
    const floor = -Math.max(50_000, state.ttmIncome * 5);
    if (state.cash < floor) state.cash = floor;
  }
}

function growthMonth(
  annualMean: number,
  annualVol: number,
  shock: number | null,
): number {
  const muM = Math.pow(1 + annualMean, 1 / 12) - 1;
  if (shock === null || annualVol === 0) return muM;
  const sigmaM = annualVol / Math.sqrt(12);
  return muM + shock * sigmaM;
}

function amort(principal: number, annualRate: number, termYears: number): number {
  if (principal <= 0) return 0;
  const r = annualRate / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return (principal * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
}

function weeklyToMonthlyRent(weekly: number, vacancyRate: number, mgmtFee: number): number {
  return ((weekly * 52) / 12) * (1 - vacancyRate) * (1 - mgmtFee);
}

/**
 * Compute terminal net worth of a state. Includes the non-investable buckets
 * (cars / iran_property / other_assets) and subtracts other_debts — see audit
 * fix P1.1. Without these the engine NW silently diverged from the dashboard.
 */
export function netWorth(s: PortfolioState): number {
  const propsNet = s.properties.reduce(
    (acc, p) => acc + (p.marketValue - p.loanBalance),
    0,
  );
  const cars = s.cars ?? 0;
  const iran = s.iranProperty ?? 0;
  const otherA = s.otherAssets ?? 0;
  const otherD = s.otherDebts ?? 0;
  return (
    s.cash + s.etfBalance + s.cryptoBalance +
    s.superRoham + s.superFara + propsNet +
    cars + iran + otherA - otherD
  );
}

/** Monthly surplus implied by current ttm fields. */
export function monthlySurplusOf(s: PortfolioState): number {
  return (s.ttmIncome - s.ttmExpenses) / 12;
}

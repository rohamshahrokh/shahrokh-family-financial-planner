/**
 * Scenario Engine V2 — Monthly Tick (Pure Function)
 *
 *   tick(state, events, rails, rng?, ctx) → state'
 *
 * Pure: same inputs always produce same outputs. No I/O, no Date, no
 * Math.random. Stochastic returns are drawn from `rng` if provided; if not,
 * the tick uses mean rails (deterministic baseline used by Base-only runs
 * and reconciliation tests).
 *
 * Order of operations within a month:
 *   1. Apply macro/asset/contribution events (priority 100→600)
 *   2. Wage income (always)
 *   3. Living expenses (always)
 *   4. Property cashflows (rent in, holding costs out, mortgage PI out)
 *   5. Asset growth (cash APR, ETF, crypto, super, property MV)
 *   6. Tax events at FY end
 *   7. Roll month
 */

import type {
  BasePlan,
  BasePlanAssumptions,
  PortfolioState,
  PropertyState,
  ScenarioEvent,
  MonthKey,
} from "./types";
import { addMonths } from "./basePlan";
import type { SeededRng } from "./determinism";

/** Per-tick scaffolding data that doesn't live on PortfolioState. */
export interface TickContext {
  /** Monthly wage income at month 0 (pre-tax, both partners). */
  baseMonthlyIncome: number;
  /** Monthly living expenses at month 0 (excluding debt service). */
  baseMonthlyExpenses: number;
  /** True if the ledger expense figure already includes debt service. */
  expensesIncludeDebt: boolean;
  /** Months elapsed since plan start (used for growth compounding). */
  monthsElapsed: number;
}

/** Return a NEW PortfolioState — never mutates `state`. */
export function tick(
  state: PortfolioState,
  events: ScenarioEvent[],
  rails: BasePlanAssumptions,
  ctx: TickContext,
  rng: SeededRng | null = null,
): PortfolioState {
  // Working copy
  const next: PortfolioState = {
    ...state,
    properties: state.properties.map((p) => ({ ...p })),
  };

  // ─── 1. Process explicit events ──────────────────────────────────────────
  for (const e of events) {
    applyEvent(next, e);
  }

  // ─── 2. Wage income (grown by incomeGrowth^monthsElapsed) ────────────────
  const yearsElapsed = ctx.monthsElapsed / 12;
  const grossIncome = ctx.baseMonthlyIncome * Math.pow(1 + rails.incomeGrowth, yearsElapsed);
  // Simple effective tax rate based on AU bracketing (good enough for slice;
  // full tax via calcAustralianTax is wired in Phase 8 MC integration).
  const effectiveTax = effTaxRate(grossIncome * 12);
  const netIncome = grossIncome * (1 - effectiveTax);
  next.cash += netIncome;
  next.ttmIncome = grossIncome * 12;

  // ─── 3. Living expenses (grown by expenseGrowth) ────────────────────────
  // baseMonthlyExpenses excludes debt service; we add debt service back
  // when properties exist OR (when ledger already includes debt) we use
  // the ledger figure as-is.
  const baseExp = ctx.baseMonthlyExpenses * Math.pow(1 + rails.expenseGrowth, yearsElapsed);
  next.cash -= baseExp;
  next.ttmExpenses = baseExp * 12;

  // ─── 4. Property cashflows ──────────────────────────────────────────────
  for (const p of next.properties) {
    // Rent received (only if monthlyRent > 0 — PPOR has 0)
    if (p.monthlyRent > 0) {
      // Rent grows by inflation
      const grownRent = p.monthlyRent * Math.pow(1 + rails.inflation, yearsElapsed);
      next.cash += grownRent;
      next.cash -= p.monthlyCosts * Math.pow(1 + rails.inflation, yearsElapsed);
    }
    // Mortgage P&I — paid out of cash. We split it: interest portion does
    // NOT reduce loanBalance, principal portion does.
    if (p.loanBalance > 0 && p.monthlyRepayment > 0) {
      const monthlyRate = p.rate / 12;
      const interest = p.loanBalance * monthlyRate;
      // Cap the principal payment to remaining loan balance so we don't go negative
      let principal = Math.max(0, p.monthlyRepayment - interest);
      if (principal > p.loanBalance) principal = p.loanBalance;
      const totalPay = interest + principal;
      next.cash -= totalPay;
      p.loanBalance = Math.max(0, p.loanBalance - principal);
    }
    // Property market value grows
    const muM = Math.pow(1 + rails.propertyGrowth, 1 / 12) - 1;
    const sigmaM = rails.propertyVol / Math.sqrt(12);
    const shock = rng ? rng.normal() * sigmaM : 0;
    p.marketValue *= 1 + muM + shock;
  }

  // ─── 5. Other asset growth ──────────────────────────────────────────────
  next.cash *= 1 + Math.pow(1 + rails.cashApr, 1 / 12) - 1;
  next.etfBalance *= 1 + growthMonth(rails.stockReturn, rails.stockVol, rng);
  next.cryptoBalance *= 1 + growthMonth(rails.cryptoReturn, rails.cryptoVol, rng);
  next.superRoham *= 1 + growthMonth(rails.superReturn, rails.superVol, rng);
  next.superFara *= 1 + growthMonth(rails.superReturn, rails.superVol, rng);

  // ─── 6. Roll month ──────────────────────────────────────────────────────
  next.month = addMonths(state.month, 1);

  return next;
}

// ─── Event reducers ─────────────────────────────────────────────────────────

function applyEvent(state: PortfolioState, e: ScenarioEvent): void {
  const p = e.payload as Record<string, unknown>;
  const n = (k: string, fallback = 0) => {
    const v = p?.[k];
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  };

  switch (e.type) {
    case "contribution.crypto_lump": {
      // Move cash → crypto, clamped to available cash.
      const desired = n("amount", 0);
      const moved = Math.min(desired, Math.max(0, state.cash));
      state.cash -= moved;
      state.cryptoBalance += moved;
      return;
    }
    case "asset.cash_hold": {
      // No-op for state — recorded for attribution.
      return;
    }
    case "asset.buy_property": {
      const outflow = n("cashOutflow", 0);
      const moved = Math.min(outflow, Math.max(0, state.cash));
      state.cash -= moved;
      const newProp: PropertyState = {
        id: `ip-${state.properties.length + 1}-${e.sourceDeltaId ?? "x"}`,
        marketValue: n("marketValue", 0),
        loanBalance: n("loanBalance", 0),
        rate: n("rate", 0.065),
        monthlyRepayment: amort(n("loanBalance", 0), n("rate", 0.065), n("termYears", 30)),
        monthlyRent: weeklyToMonthlyRent(
          n("weeklyRent", 0),
          n("vacancyRate", 0.04),
          n("managementFee", 0.08),
        ),
        monthlyCosts: n("annualHoldingCosts", 0) / 12,
        offsetBalance: 0,
      };
      state.properties = [...state.properties, newProp];
      return;
    }
    default:
      // Unknown / noop — phase 6+ will handle the rest.
      return;
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

function growthMonth(annualMean: number, annualVol: number, rng: SeededRng | null): number {
  const muM = Math.pow(1 + annualMean, 1 / 12) - 1;
  if (!rng || annualVol === 0) return muM;
  const sigmaM = annualVol / Math.sqrt(12);
  return muM + rng.normal() * sigmaM;
}

function amort(principal: number, annualRate: number, termYears: number): number {
  if (principal <= 0) return 0;
  const r = annualRate / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return (principal * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
}

function weeklyToMonthlyRent(weekly: number, vacancyRate: number, mgmtFee: number): number {
  return (weekly * 52 / 12) * (1 - vacancyRate) * (1 - mgmtFee);
}

/**
 * Simple AU effective income tax rate (2024-25 bracket midpoints, no LITO
 * or Medicare). Good enough for the vertical slice — Phase 8 wires in
 * `calcAustralianTax` from australianTax.ts which is bracket-accurate.
 */
function effTaxRate(annualGross: number): number {
  if (annualGross <= 18200) return 0;
  if (annualGross <= 45000) return 0.10;
  if (annualGross <= 135000) return 0.24;
  if (annualGross <= 190000) return 0.32;
  return 0.38;
}

/** Compute the terminal net worth of a state. Used by the result builder. */
export function netWorth(s: PortfolioState): number {
  const propsNet = s.properties.reduce(
    (acc, p) => acc + (p.marketValue - p.loanBalance),
    0,
  );
  return (
    s.cash + s.etfBalance + s.cryptoBalance +
    s.superRoham + s.superFara + propsNet
  );
}

/** Monthly surplus implied by current ttm fields. */
export function monthlySurplusOf(s: PortfolioState): number {
  return (s.ttmIncome - s.ttmExpenses) / 12;
}

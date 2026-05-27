/**
 * decisionCandidates.ts — Sprint 5 Phase 2, Candidate Generator V1.
 *
 * Why this file exists
 * --------------------
 * Sprint 5 Phase 1 introduced `goalSolver.ts` — a single-target solver that
 * answers "how much more do I need / how much must I invest each month / am I
 * on track". Sprint 5 Phase 2 layers a *candidate generator* on top of that:
 * given the same canonical ledger and engine outputs, generate the realistic
 * set of next-action candidates the household could plausibly take and stamp
 * each one with the canonical financial dimensions used to rank it.
 *
 * The module is a **consumer** of canonical services — it never duplicates
 * the underlying financial math:
 *   - Net worth, surplus, debt service, passive income, FIRE number
 *       → `canonicalHeadlineMetrics.computeCanonicalHeadlineMetrics`
 *   - Debt service detail / capacity
 *       → `canonicalDebtService.computeCanonicalDebtService`
 *   - FIRE / SWR
 *       → `canonicalFire.computeCanonicalFire`
 *   - Goal gap / required contribution / feasibility verdict
 *       → `goalSolver.solveGoalGap`
 *   - Forecast NW trajectory
 *       → `forecastEngine.buildForecast` (consumed via injected output)
 *   - Risk score / liquidity runway
 *       → `riskEngine.runRiskRadar` (consumed via injected output)
 *   - Monte Carlo confidence
 *       → forecastStore.MonteCarloResult (consumed via injected output)
 *
 * The generator is deterministic: same inputs → byte-identical outputs.
 * No Date.now, no Math.random, no I/O. Candidates that cannot be supported
 * by the data the household actually has are NOT fabricated — instead the
 * generator returns the `hold-current-path` candidate plus whichever data-
 * supported moves are available. There is no hardcoded household fallback.
 */

import type { DashboardInputs } from "./dashboardDataContract";
import {
  computeCanonicalHeadlineMetrics,
  type CanonicalHeadlineMetrics,
} from "./canonicalHeadlineMetrics";
import {
  computeCanonicalFire,
  resolveFireTargetFromSnapshot,
  selectCanonicalFire,
  type CanonicalFire,
} from "./canonicalFire";
import type { CanonicalGoal } from "./useCanonicalGoal";
import {
  computeCanonicalDebtService,
  type CanonicalDebtServiceFigures,
} from "./canonicalDebtService";
import { solveGoalGap, type GoalSolverInputs, type GoalSolverOutputs } from "./goalSolver";
import type { ForecastOutput } from "./forecastEngine";
import type { RiskRadarResult } from "./riskEngine";
import type { MonteCarloResult } from "./forecastStore";

/* ─── Public types ──────────────────────────────────────────────────────── */

/**
 * The eight canonical candidate kinds. New kinds can be added later, but each
 * one MUST come with (a) a data-availability check that decides whether the
 * candidate is generated at all and (b) a deterministic projection of how the
 * candidate moves the household's canonical metrics.
 *
 * The "hold-current-path" candidate is ALWAYS generated — it represents the
 * household doing nothing, and is the baseline every other candidate is
 * compared against.
 */
export type CandidateKind =
  | "buy-investment-property"
  | "delay-purchase"
  | "debt-reduction"
  | "offset-contribution"
  | "etf-investment"
  | "cash-reserve-increase"
  | "hold-current-path";

/**
 * Per-candidate projection — the canonical financial dimensions used by the
 * Sprint 5 ranking engine. Each dimension carries the *delta* vs the current
 * canonical figure (positive = candidate improves that dimension). All values
 * are deterministic and derived from canonical services — no page-specific
 * formulas are introduced here.
 *
 * The projection horizon is 12 months unless stated otherwise. A 12-month
 * window is short enough that the canonical growth assumption (7% nominal,
 * see `goalSolver.CANONICAL_DEFAULT_GROWTH_PCT`) dominates over compounding
 * detail, and long enough that the dimensional comparison is meaningful.
 */
export interface CandidateProjection {
  /** Δ net worth ($) at projection horizon vs hold-current-path baseline. */
  deltaNetWorth: number;
  /** Δ annual passive income ($/yr) at projection horizon. */
  deltaPassiveIncome: number;
  /** Δ monthly cash surplus ($/mo) — how the candidate moves cashflow. */
  deltaMonthlySurplus: number;
  /** Δ monthly debt service ($/mo) — negative means lower debt service. */
  deltaMonthlyDebtService: number;
  /** Δ liquidity runway in months (cash+offset / monthly outflow). */
  deltaLiquidityMonths: number;
  /**
   * Δ FIRE-progress fraction (0..1). Positive means the candidate moves the
   * household closer to its canonical FIRE number.
   */
  deltaFireProgress: number;
  /**
   * Δ goal-shortfall ($). Negative means the candidate reduces the binding
   * goal-solver shortfall. Null when the goal-solver does not produce a
   * shortfall (no targets supplied).
   */
  deltaGoalShortfall: number | null;
}

/**
 * Estimated risk and confidence weights for a candidate. These are *not*
 * monetary deltas — they are unitless scores the ranking engine penalises
 * against the deltas above. Each is bounded to a clear range so the ranking
 * formula is testable.
 */
export interface CandidateRiskProfile {
  /**
   * Execution-risk score in [0, 100]. 0 = trivial (e.g. hold path), 100 =
   * extreme (e.g. leveraged property purchase with thin cash buffer). Derived
   * from the household's canonical risk surface and the candidate's
   * structural change (added leverage, cash drawdown, etc.).
   */
  executionRisk: number;
  /**
   * Liquidity-risk score in [0, 100]. 0 = candidate leaves the household
   * with healthy runway, 100 = candidate exhausts the buffer. Derived from
   * `deltaLiquidityMonths` and the canonical liquidity-runway thresholds
   * shared with `canonicalRiskSurface` (≥6 months = healthy, <3 = fragile).
   */
  liquidityRisk: number;
  /**
   * Monte Carlo confidence band in [0, 1] — pass-through of the canonical
   * `prob_ff/100` from the supplied MC result, adjusted for whether the
   * candidate increases or decreases leverage / contributions. null when no
   * MC output is supplied.
   */
  mcConfidence: number | null;
}

/**
 * The full candidate record. Each candidate is self-describing: it carries
 * its kind, headline label, plain-English rationale, the canonical
 * projection, and the risk profile used by the ranking engine.
 */
export interface DecisionCandidate {
  /** Stable identifier — same household + same canonical inputs => same id. */
  id: string;
  kind: CandidateKind;
  /** Short plain-English label suitable for UI surfaces. */
  label: string;
  /** Plain-English rationale string — no markdown, no page-specific copy. */
  rationale: string;
  /** True when this candidate is the do-nothing baseline. */
  isBaseline: boolean;
  /** Dollar magnitude of the structural change (e.g. property price, monthly
   *  contribution × 12) used for the rationale and the scale-normalised
   *  ranking. Always positive; 0 for the hold-current-path baseline. */
  magnitude: number;
  projection: CandidateProjection;
  risk: CandidateRiskProfile;
  /** True when one or more inputs supporting this candidate are missing —
   *  the candidate is still returned but flagged so the ranking engine can
   *  decide whether to suppress it. */
  incomplete: boolean;
}

/* ─── Generator inputs ──────────────────────────────────────────────────── */

export interface CandidateGeneratorInputs {
  /** The single canonical ledger (DashboardInputs) — REQUIRED. */
  canonicalLedger: DashboardInputs;
  /** Optional pre-computed canonical headline metrics. Generator recomputes
   *  when omitted. */
  canonicalHead?: CanonicalHeadlineMetrics;
  /** Optional pre-computed canonical fire facade. */
  canonicalFire?: CanonicalFire;
  /** Optional pre-computed canonical debt service facade. */
  canonicalDebtService?: CanonicalDebtServiceFigures;
  /** Optional pre-computed goal-solver output. Generator runs solveGoalGap
   *  with no targets when omitted (so trace.incomplete will be true). */
  goalSolverOutputs?: GoalSolverOutputs;
  /** Optional user-supplied goal-solver inputs. Forwarded to solveGoalGap
   *  when goalSolverOutputs is omitted. */
  goalSolverInputs?: Omit<GoalSolverInputs, "canonicalLedger">;
  /** Forecast outputs (from forecastEngine.buildForecast). */
  forecastOutputs?: ForecastOutput | null;
  /** Risk radar output for execution-risk weighting. */
  riskOutputs?: RiskRadarResult | null;
  /** Monte Carlo result for confidence weighting. */
  monteCarloOutputs?: MonteCarloResult | null;

  /** Optional override: monthly ETF / share contribution ($). Defaults to
   *  half of the household's canonical monthly surplus when surplus > 0. */
  proposedEtfContributionMonthly?: number;
  /** Optional override: target investment property purchase price ($). When
   *  omitted the generator infers a candidate around 4× annual household
   *  income (canonical lending heuristic, see CANONICAL_IP_LTV_MULTIPLIER). */
  proposedIpPurchasePrice?: number;
  /** Optional override: cash reserve target ($). Defaults to 6× monthly
   *  expenses (canonical emergency-buffer rule shared with riskEngine). */
  proposedCashReserveTarget?: number;
  /**
   * Sprint 15 Phase 2 — canonical FIRE goal. When provided AND `canonicalFire`
   * is omitted, the generator routes through `selectCanonicalFire` so the
   * computed FIRE pipeline honours mc_fire_settings (not the snapshot 20k
   * default). Optional for back-compat — omitting it preserves legacy
   * `computeCanonicalFire` + snapshot precedence.
   */
  canonicalGoal?: CanonicalGoal | null;
}

export interface CandidateGeneratorOutputs {
  candidates: DecisionCandidate[];
  /** True when the canonical ledger is missing or unusable. Mirrors the
   *  goalSolver's "incomplete" surface. */
  incomplete: boolean;
  /** Aggregate trace for diagnostics / tests. */
  trace: {
    /** Canonical baseline metrics used as the comparison point. */
    baseline: CanonicalHeadlineMetrics;
    /** Liquidity runway in months for the hold path (cash / monthly outflow). */
    baselineLiquidityMonths: number;
    /** Investible base derived from canonical NW (excludes PPOR/cars/etc). */
    investibleBase: number;
    /** Default candidate horizon in months. */
    horizonMonths: number;
    /** Growth assumption used (decimal). */
    growthAssumption: number;
    /** SWR used (decimal). */
    swrUsed: number;
  };
}

/* ─── Engine-side constants ─────────────────────────────────────────────── */
//
// All constants here are *policy* shared with other Sprint 5 engines, not
// household-specific values. Adjusting any of them is a deliberate change
// reviewed by the test suite (see test-sprint5-decision-ranking.ts).

/** 12-month default horizon. Long enough to dominate noise, short enough that
 *  canonical default growth is a sensible approximation. */
const CANONICAL_HORIZON_MONTHS = 12;

/** Canonical nominal growth used when the forecast does not expose a per-
 *  household assumption. Same constant as goalSolver. */
const CANONICAL_DEFAULT_GROWTH_PCT = 0.07;

/** Canonical loan-to-value multiplier used to *propose* a feasible IP price
 *  when the caller doesn't pass one — 4× gross annual household income, the
 *  conservative end of Australian retail lender DTI gates. */
const CANONICAL_IP_LTV_MULTIPLIER = 4;

/** Canonical emergency-buffer target in months of expenses. Matches the
 *  riskEngine and canonicalRiskSurface buffer-band thresholds. */
const CANONICAL_EMERGENCY_BUFFER_MONTHS = 6;

/** Hard floor under monthly surplus when the household has none — used so
 *  the generator does not divide by zero. The candidate is still flagged
 *  `incomplete: true` when surplus ≤ 0. */
const SURPLUS_FLOOR = 1;

/* ─── Public API ────────────────────────────────────────────────────────── */

/**
 * Generate the realistic set of next-action candidates for a household.
 *
 * Pure / deterministic. Consumes only canonical services. Never fabricates
 * household values — when an input that supports a candidate is missing the
 * candidate is either skipped (data unavailable) or returned with
 * `incomplete: true` (data partial).
 */
export function generateDecisionCandidates(
  inputs: CandidateGeneratorInputs,
): CandidateGeneratorOutputs {
  if (!inputs || !inputs.canonicalLedger) {
    return emptyOutputs();
  }
  const ledger = inputs.canonicalLedger;
  const head: CanonicalHeadlineMetrics =
    inputs.canonicalHead ?? computeCanonicalHeadlineMetrics(ledger);
  // Sprint 15 Phase 2: when a canonical FIRE was not pre-computed, prefer
  // selectCanonicalFire (wired with the canonical goal) over the legacy
  // computeCanonicalFire(+resolveFireTargetFromSnapshot) precedence. Falls
  // back to legacy when no goal is provided so existing pipelines do not
  // regress.
  const fire: CanonicalFire =
    inputs.canonicalFire ??
    (inputs.canonicalGoal
      ? selectCanonicalFire(ledger, inputs.canonicalGoal)
      : computeCanonicalFire(ledger, {
          targetMonthlyIncome: resolveFireTargetFromSnapshot(ledger),
        }));
  const debt: CanonicalDebtServiceFigures =
    inputs.canonicalDebtService ?? computeCanonicalDebtService(ledger);
  const goal: GoalSolverOutputs =
    inputs.goalSolverOutputs ??
    solveGoalGap({
      canonicalLedger: ledger,
      forecastOutputs: inputs.forecastOutputs,
      riskOutputs: inputs.riskOutputs,
      monteCarloOutputs: inputs.monteCarloOutputs,
      canonicalDebtService: debt,
      ...(inputs.goalSolverInputs ?? {}),
    });

  const swrDecimal = fire.swrPct > 0 ? fire.swrPct / 100 : 0.04;
  const growth = clamp(goal.trace.growthAssumptionUsed ?? CANONICAL_DEFAULT_GROWTH_PCT, 0.02, 0.15);

  // Derive baseline liquidity runway (cash+offset / monthly outflow). The
  // monthly outflow uses expenses + (debt service when not already in
  // expenses) — same identity used by canonicalCashflow.
  const cash = sumCash(ledger);
  const monthlyOutflow = Math.max(1, head.monthlyExpenses);
  const baselineLiquidityMonths = monthlyOutflow > 0 ? cash / monthlyOutflow : 0;

  // Investible base — excludes PPOR equity, cars, iran property and other
  // non-financial assets (same derivation as goalSolver to keep them aligned).
  const investibleBase = deriveInvestibleBase(ledger, head);

  const ctx: GenerationContext = {
    ledger,
    head,
    fire,
    debt,
    goal,
    forecast: inputs.forecastOutputs ?? null,
    risk: inputs.riskOutputs ?? null,
    mc: inputs.monteCarloOutputs ?? null,
    cash,
    baselineLiquidityMonths,
    investibleBase,
    growth,
    swrDecimal,
    horizonMonths: CANONICAL_HORIZON_MONTHS,
  };

  const candidates: DecisionCandidate[] = [];
  // Order is stable and deterministic. We always include the hold-current-
  // path candidate last so the ranking engine has an unambiguous baseline.
  pushIf(candidates, buildBuyInvestmentProperty(ctx, inputs.proposedIpPurchasePrice));
  pushIf(candidates, buildDelayPurchase(ctx, inputs.proposedIpPurchasePrice));
  pushIf(candidates, buildDebtReduction(ctx));
  pushIf(candidates, buildOffsetContribution(ctx));
  pushIf(candidates, buildEtfInvestment(ctx, inputs.proposedEtfContributionMonthly));
  pushIf(candidates, buildCashReserveIncrease(ctx, inputs.proposedCashReserveTarget));
  candidates.push(buildHoldCurrentPath(ctx));

  return {
    candidates,
    incomplete: false,
    trace: {
      baseline: head,
      baselineLiquidityMonths: Number(baselineLiquidityMonths.toFixed(2)),
      investibleBase: Math.round(investibleBase),
      horizonMonths: CANONICAL_HORIZON_MONTHS,
      growthAssumption: Number(growth.toFixed(4)),
      swrUsed: Number(swrDecimal.toFixed(4)),
    },
  };
}

/* ─── Generation context (internal, deterministic) ──────────────────────── */

interface GenerationContext {
  ledger: DashboardInputs;
  head: CanonicalHeadlineMetrics;
  fire: CanonicalFire;
  debt: CanonicalDebtServiceFigures;
  goal: GoalSolverOutputs;
  forecast: ForecastOutput | null;
  risk: RiskRadarResult | null;
  mc: MonteCarloResult | null;
  cash: number;
  baselineLiquidityMonths: number;
  investibleBase: number;
  growth: number;
  swrDecimal: number;
  horizonMonths: number;
}

/* ─── Candidate builders ────────────────────────────────────────────────── */

function buildBuyInvestmentProperty(
  ctx: GenerationContext,
  proposedPrice: number | undefined,
): DecisionCandidate | null {
  const annualIncome = ctx.head.monthlyIncome * 12;
  const inferredPrice =
    proposedPrice && proposedPrice > 0
      ? proposedPrice
      : annualIncome > 0
        ? annualIncome * CANONICAL_IP_LTV_MULTIPLIER
        : 0;
  // Data availability — we never fabricate a property price out of nothing.
  if (inferredPrice <= 0) return null;
  const incomplete =
    ctx.cash < inferredPrice * 0.1 || ctx.head.monthlySurplus < SURPLUS_FLOOR;

  // Canonical AU stamp + costs ~ 5% of price (matches monteCarloV5 default).
  const transactionCosts = inferredPrice * 0.05;
  const deposit = inferredPrice * 0.2; // 80% LVR — canonical lender gate.
  const newLoan = inferredPrice - deposit;
  // Use canonical SWR / rental yield — 4% gross yield is the canonical
  // long-run assumption shared with monteCarlo (prop_default_yield_pct).
  const grossRentalYield = 0.04;
  const annualRent = inferredPrice * grossRentalYield;
  // Net rent ~ 70% of gross (vacancy + mgmt + maintenance — same band the
  // riskEngine uses when computing IP holding cost).
  const netAnnualPassive = annualRent * 0.7;
  // New monthly debt service — same canonical PI calc as canonicalDebtService
  // (we approximate as principal / 30 years / 12 at 6.15% for the projection).
  const monthlyRate = 0.0615 / 12;
  const months = 30 * 12;
  const newDebtService =
    newLoan > 0 && monthlyRate > 0
      ? (newLoan * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
      : 0;
  // Property grows at canonical ppor_growth (matches forecastEngine default
  // 6%). 12-month NW delta = price growth - transaction costs - 1y net debt
  // amortisation + 1y net rent - deposit drawdown.
  const oneYearGrowth = inferredPrice * 0.06;
  const oneYearNetRent = netAnnualPassive;
  const deltaNetWorth =
    oneYearGrowth + oneYearNetRent - transactionCosts /* one-off */;
  const deltaPassive = netAnnualPassive;
  const deltaMonthlySurplus = oneYearNetRent / 12 - newDebtService;
  const deltaMonthlyDebt = newDebtService;
  // Liquidity hit — deposit + costs come from cash, lowering the runway.
  const cashAfter = Math.max(0, ctx.cash - deposit - transactionCosts);
  const newLiqMonths =
    ctx.head.monthlyExpenses > 0 ? cashAfter / ctx.head.monthlyExpenses : 0;
  const deltaLiq = newLiqMonths - ctx.baselineLiquidityMonths;
  const deltaFire =
    ctx.fire.fireNumber > 0
      ? clamp((deltaNetWorth) / ctx.fire.fireNumber, -1, 1)
      : 0;
  const deltaShort =
    ctx.goal.shortfallAmount > 0 ? -Math.min(deltaNetWorth, ctx.goal.shortfallAmount) : null;

  return {
    id: "candidate-buy-investment-property",
    kind: "buy-investment-property",
    label: "Buy investment property",
    rationale:
      `Acquire a ~$${roundK(inferredPrice)} investment property at canonical 80% LVR. ` +
      `Adds ~$${roundK(deltaPassive)}/yr net rent and ~$${roundK(oneYearGrowth)} of 12-month growth ` +
      `but draws ~$${roundK(deposit + transactionCosts)} from cash and adds ~$${Math.round(newDebtService)}/mo debt service.`,
    isBaseline: false,
    magnitude: Math.round(inferredPrice),
    projection: {
      deltaNetWorth: Math.round(deltaNetWorth),
      deltaPassiveIncome: Math.round(deltaPassive),
      deltaMonthlySurplus: Math.round(deltaMonthlySurplus),
      deltaMonthlyDebtService: Math.round(deltaMonthlyDebt),
      deltaLiquidityMonths: Number(deltaLiq.toFixed(2)),
      deltaFireProgress: Number(deltaFire.toFixed(4)),
      deltaGoalShortfall: deltaShort == null ? null : Math.round(deltaShort),
    },
    risk: {
      executionRisk: clamp(60 + (incomplete ? 20 : 0), 0, 100),
      liquidityRisk: liquidityRiskFromRunway(newLiqMonths),
      mcConfidence: adjustMcConfidence(ctx.mc, -0.05),
    },
    incomplete,
  };
}

function buildDelayPurchase(
  ctx: GenerationContext,
  proposedPrice: number | undefined,
): DecisionCandidate | null {
  // Delay only makes sense when a buy-IP candidate would have been generated.
  const annualIncome = ctx.head.monthlyIncome * 12;
  const inferredPrice =
    proposedPrice && proposedPrice > 0
      ? proposedPrice
      : annualIncome > 0
        ? annualIncome * CANONICAL_IP_LTV_MULTIPLIER
        : 0;
  if (inferredPrice <= 0) return null;
  // REMEDIATION B-5: this is a closed-form "investibleBase × growth" estimate,
  // NOT a real forecast. Marked incomplete=true so downstream UI can render it
  // as "Estimate only — run a forecast for precise projection". A proper wire
  // through pathSimulationEngine for the delay scenario is tracked but out of
  // scope for this phase; the estimate is still directionally useful as a
  // ranking signal.
  const growthOnBase = ctx.investibleBase * ctx.growth;
  return {
    id: "candidate-delay-purchase",
    kind: "delay-purchase",
    label: "Delay property purchase by 12 months",
    rationale:
      `Estimate only (closed-form): defer the ~$${roundK(inferredPrice)} IP purchase by 12 months. ` +
      `Preserves the cash buffer, keeps debt service flat, and grows the current investible base by ` +
      `~$${roundK(growthOnBase)} at the canonical ${(ctx.growth * 100).toFixed(1)}% nominal growth ` +
      `assumption. Run a forecast for a real path projection.`,
    isBaseline: false,
    magnitude: Math.round(inferredPrice),
    projection: {
      deltaNetWorth: Math.round(growthOnBase),
      deltaPassiveIncome: 0,
      deltaMonthlySurplus: 0,
      deltaMonthlyDebtService: 0,
      deltaLiquidityMonths: 0,
      deltaFireProgress:
        ctx.fire.fireNumber > 0
          ? Number((growthOnBase / ctx.fire.fireNumber).toFixed(4))
          : 0,
      deltaGoalShortfall:
        ctx.goal.shortfallAmount > 0
          ? -Math.round(Math.min(growthOnBase, ctx.goal.shortfallAmount))
          : null,
    },
    risk: {
      executionRisk: 10,
      liquidityRisk: liquidityRiskFromRunway(ctx.baselineLiquidityMonths),
      mcConfidence: adjustMcConfidence(ctx.mc, 0),
    },
    incomplete: true,
  };
}

function buildDebtReduction(ctx: GenerationContext): DecisionCandidate | null {
  // Requires non-trivial debt service AND a positive surplus to redirect.
  const totalDebtMonthly = ctx.debt.totalMonthly;
  const surplus = ctx.head.monthlySurplus;
  if (totalDebtMonthly <= 0) return null;
  // Use up to half of surplus to accelerate principal repayment. When
  // surplus ≤ 0 we still propose the candidate but flag it incomplete.
  const extraPayment = Math.max(0, Math.min(surplus * 0.5, totalDebtMonthly));
  const incomplete = surplus <= 0;
  const annualPrincipalCut = extraPayment * 12;
  // Mortgage rate proxy — pull from snapshot when available; else canonical
  // 6% (matches forecast/MC default mortgage_rate band).
  const rate = numericField(ctx.ledger.snapshot?.mortgage_rate) || 6;
  const interestSavedYr = annualPrincipalCut * (rate / 100);
  // Net worth Δ ≈ principal repaid + interest saved (1y).
  const deltaNetWorth = annualPrincipalCut + interestSavedYr;
  return {
    id: "candidate-debt-reduction",
    kind: "debt-reduction",
    label: "Accelerate debt reduction",
    rationale:
      `Redirect $${Math.round(extraPayment)}/mo of surplus to extra principal repayment on the ` +
      `household's $${roundK(ctx.debt.balances.total)} of total debt. Saves ~$${Math.round(interestSavedYr)} ` +
      `of interest over 12 months at the current ${rate.toFixed(2)}% rate.`,
    isBaseline: false,
    magnitude: Math.round(annualPrincipalCut),
    projection: {
      deltaNetWorth: Math.round(deltaNetWorth),
      deltaPassiveIncome: 0,
      deltaMonthlySurplus: -Math.round(extraPayment),
      deltaMonthlyDebtService: 0, // minimums unchanged; principal paid down faster
      deltaLiquidityMonths: 0,
      deltaFireProgress:
        ctx.fire.fireNumber > 0
          ? Number((deltaNetWorth / ctx.fire.fireNumber).toFixed(4))
          : 0,
      deltaGoalShortfall:
        ctx.goal.shortfallAmount > 0
          ? -Math.round(Math.min(deltaNetWorth, ctx.goal.shortfallAmount))
          : null,
    },
    risk: {
      executionRisk: 20,
      liquidityRisk: liquidityRiskFromRunway(ctx.baselineLiquidityMonths),
      mcConfidence: adjustMcConfidence(ctx.mc, +0.02),
    },
    incomplete,
  };
}

function buildOffsetContribution(ctx: GenerationContext): DecisionCandidate | null {
  // Offset only makes sense when there's a PPOR mortgage AND positive surplus.
  const offset = numericField(ctx.ledger.snapshot?.offset_balance);
  const mortgage = numericField(ctx.ledger.snapshot?.mortgage);
  if (mortgage <= 0) return null;
  const surplus = ctx.head.monthlySurplus;
  const monthlyContribution = Math.max(0, surplus * 0.4);
  const incomplete = surplus <= 0;
  const annualContribution = monthlyContribution * 12;
  const rate = numericField(ctx.ledger.snapshot?.mortgage_rate) || 6;
  // Interest saved = avg offset balance over the year × rate. Average ≈
  // starting + half the year's contribution.
  const avgOffset = offset + annualContribution / 2;
  const interestSavedYr = avgOffset * (rate / 100) - offset * (rate / 100);
  // NW Δ = contribution (cash moves into offset, still an asset) + interest saved.
  const deltaNetWorth = interestSavedYr;
  // Liquidity Δ — offset is still liquid, so neutral.
  return {
    id: "candidate-offset-contribution",
    kind: "offset-contribution",
    label: "Boost offset account contribution",
    rationale:
      `Direct $${Math.round(monthlyContribution)}/mo of surplus into the offset. Cuts effective ` +
      `interest at ${rate.toFixed(2)}% across a $${roundK(mortgage)} mortgage — saving ~$${Math.round(
        interestSavedYr,
      )} in interest over 12 months while preserving liquidity.`,
    isBaseline: false,
    magnitude: Math.round(annualContribution),
    projection: {
      deltaNetWorth: Math.round(deltaNetWorth),
      deltaPassiveIncome: 0,
      deltaMonthlySurplus: -Math.round(monthlyContribution),
      deltaMonthlyDebtService: 0,
      deltaLiquidityMonths: 0,
      deltaFireProgress:
        ctx.fire.fireNumber > 0
          ? Number((deltaNetWorth / ctx.fire.fireNumber).toFixed(4))
          : 0,
      deltaGoalShortfall:
        ctx.goal.shortfallAmount > 0
          ? -Math.round(Math.min(deltaNetWorth, ctx.goal.shortfallAmount))
          : null,
    },
    risk: {
      executionRisk: 5,
      liquidityRisk: liquidityRiskFromRunway(ctx.baselineLiquidityMonths),
      mcConfidence: adjustMcConfidence(ctx.mc, +0.02),
    },
    incomplete,
  };
}

function buildEtfInvestment(
  ctx: GenerationContext,
  proposed: number | undefined,
): DecisionCandidate | null {
  const surplus = ctx.head.monthlySurplus;
  // ETF candidate requires either a proposed contribution OR a positive surplus.
  const monthlyContribution =
    proposed && proposed > 0
      ? proposed
      : surplus > 0
        ? surplus * 0.5
        : 0;
  if (monthlyContribution <= 0) return null;
  const annual = monthlyContribution * 12;
  // 1y FV of a monthly annuity at canonical growth.
  const r = ctx.growth / 12;
  const fvAnnuity =
    r === 0 ? annual : monthlyContribution * ((Math.pow(1 + r, 12) - 1) / r);
  // 1y growth on contribution = fvAnnuity - principal contributed.
  const growthGain = fvAnnuity - annual;
  // Δ NW = principal contributed + growth gain (the principal isn't lost —
  // it just moves into invested ETFs, which already sit inside canonical NW).
  const deltaNetWorth = growthGain; // principal is wealth-neutral within NW
  // Passive income proxy — canonical dividend yield ~ 2% (matches the
  // selectPassiveIncome dividend heuristic in dashboardDataContract).
  const deltaPassive = (annual + growthGain / 2) * 0.02;
  return {
    id: "candidate-etf-investment",
    kind: "etf-investment",
    label: "Increase ETF / share contributions",
    rationale:
      `Allocate $${Math.round(monthlyContribution)}/mo from surplus to diversified ETFs. ` +
      `At the canonical ${(ctx.growth * 100).toFixed(1)}% nominal return assumption that adds ` +
      `~$${Math.round(growthGain)} of 12-month growth on $${Math.round(annual)} contributed.`,
    isBaseline: false,
    magnitude: Math.round(annual),
    projection: {
      deltaNetWorth: Math.round(deltaNetWorth),
      deltaPassiveIncome: Math.round(deltaPassive),
      deltaMonthlySurplus: -Math.round(monthlyContribution),
      deltaMonthlyDebtService: 0,
      deltaLiquidityMonths: 0,
      deltaFireProgress:
        ctx.fire.fireNumber > 0
          ? Number(((deltaNetWorth + annual) / ctx.fire.fireNumber).toFixed(4))
          : 0,
      deltaGoalShortfall:
        ctx.goal.shortfallAmount > 0
          ? -Math.round(Math.min(deltaNetWorth + annual, ctx.goal.shortfallAmount))
          : null,
    },
    risk: {
      executionRisk: 25,
      liquidityRisk: liquidityRiskFromRunway(ctx.baselineLiquidityMonths),
      mcConfidence: adjustMcConfidence(ctx.mc, +0.01),
    },
    incomplete: surplus <= 0,
  };
}

function buildCashReserveIncrease(
  ctx: GenerationContext,
  proposedTarget: number | undefined,
): DecisionCandidate | null {
  // Useful when the household has less than canonical 6 months of buffer.
  const target =
    proposedTarget && proposedTarget > 0
      ? proposedTarget
      : ctx.head.monthlyExpenses * CANONICAL_EMERGENCY_BUFFER_MONTHS;
  const gap = Math.max(0, target - ctx.cash);
  if (gap <= 0) return null; // already meets the buffer rule
  const surplus = ctx.head.monthlySurplus;
  if (surplus <= 0) {
    // Surface as incomplete — gap exists but no surplus to close it.
    return {
      id: "candidate-cash-reserve-increase",
      kind: "cash-reserve-increase",
      label: "Increase cash reserve",
      rationale:
        `Current cash buffer is ~${ctx.baselineLiquidityMonths.toFixed(1)} months — below the canonical ` +
        `${CANONICAL_EMERGENCY_BUFFER_MONTHS}-month emergency target. No monthly surplus is available ` +
        `to close the ~$${roundK(gap)} gap, so this candidate is flagged incomplete.`,
      isBaseline: false,
      magnitude: Math.round(gap),
      projection: zeroProjection(),
      risk: {
        executionRisk: 10,
        liquidityRisk: liquidityRiskFromRunway(ctx.baselineLiquidityMonths),
        mcConfidence: adjustMcConfidence(ctx.mc, 0),
      },
      incomplete: true,
    };
  }
  const monthlySweep = Math.min(surplus * 0.5, gap / 12);
  const oneYearSwept = monthlySweep * 12;
  // Liquidity Δ — sweep directly improves the runway.
  const newCash = ctx.cash + oneYearSwept;
  const newLiqMonths =
    ctx.head.monthlyExpenses > 0 ? newCash / ctx.head.monthlyExpenses : 0;
  const deltaLiq = newLiqMonths - ctx.baselineLiquidityMonths;
  // Net-worth Δ = 0 (cash → cash); FIRE Δ ≈ 0.
  return {
    id: "candidate-cash-reserve-increase",
    kind: "cash-reserve-increase",
    label: "Increase cash reserve",
    rationale:
      `Sweep $${Math.round(monthlySweep)}/mo into the cash reserve to close the ` +
      `~$${roundK(gap)} gap toward the canonical ${CANONICAL_EMERGENCY_BUFFER_MONTHS}-month ` +
      `buffer. Lifts runway from ${ctx.baselineLiquidityMonths.toFixed(1)} to ` +
      `${newLiqMonths.toFixed(1)} months.`,
    isBaseline: false,
    magnitude: Math.round(oneYearSwept),
    projection: {
      deltaNetWorth: 0,
      deltaPassiveIncome: 0,
      deltaMonthlySurplus: -Math.round(monthlySweep),
      deltaMonthlyDebtService: 0,
      deltaLiquidityMonths: Number(deltaLiq.toFixed(2)),
      deltaFireProgress: 0,
      deltaGoalShortfall: ctx.goal.shortfallAmount > 0 ? 0 : null,
    },
    risk: {
      executionRisk: 5,
      liquidityRisk: liquidityRiskFromRunway(newLiqMonths),
      mcConfidence: adjustMcConfidence(ctx.mc, +0.03),
    },
    incomplete: false,
  };
}

function buildHoldCurrentPath(ctx: GenerationContext): DecisionCandidate {
  // Baseline — by definition all deltas are zero.
  return {
    id: "candidate-hold-current-path",
    kind: "hold-current-path",
    label: "Hold current path",
    rationale:
      `Maintain the current allocation and contribution rhythm. 12-month projection inherits ` +
      `the canonical baseline: net worth $${roundK(ctx.head.netWorth)}, monthly surplus ` +
      `$${Math.round(ctx.head.monthlySurplus)}, ${ctx.baselineLiquidityMonths.toFixed(1)} months of cash buffer.`,
    isBaseline: true,
    magnitude: 0,
    projection: zeroProjection(),
    risk: {
      executionRisk: 0,
      liquidityRisk: liquidityRiskFromRunway(ctx.baselineLiquidityMonths),
      mcConfidence: adjustMcConfidence(ctx.mc, 0),
    },
    incomplete: false,
  };
}

/* ─── Helpers (pure, no I/O) ─────────────────────────────────────────────── */

function emptyOutputs(): CandidateGeneratorOutputs {
  return {
    candidates: [],
    incomplete: true,
    trace: {
      baseline: {
        netWorth: 0,
        assets: 0,
        liabilities: 0,
        passiveIncome: 0,
        monthlyIncome: 0,
        monthlyExpenses: 0,
        monthlySurplus: 0,
        debtService: 0,
        fireNumber: 0,
      },
      baselineLiquidityMonths: 0,
      investibleBase: 0,
      horizonMonths: CANONICAL_HORIZON_MONTHS,
      growthAssumption: CANONICAL_DEFAULT_GROWTH_PCT,
      swrUsed: 0.04,
    },
  };
}

function pushIf(arr: DecisionCandidate[], c: DecisionCandidate | null): void {
  if (c) arr.push(c);
}

function zeroProjection(): CandidateProjection {
  return {
    deltaNetWorth: 0,
    deltaPassiveIncome: 0,
    deltaMonthlySurplus: 0,
    deltaMonthlyDebtService: 0,
    deltaLiquidityMonths: 0,
    deltaFireProgress: 0,
    deltaGoalShortfall: null,
  };
}

function numericField(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? (n as number) : 0;
}

function sumCash(ledger: DashboardInputs): number {
  // Canonical cash = cash + savings + emergency + offset (matches
  // selectCashToday). We avoid importing the selector to keep this module
  // self-contained for tests.
  const s = ledger.snapshot ?? {};
  const offset = numericField(s.offset_balance);
  const otherRaw = numericField(s.other_cash);
  const other = otherRaw > 0 && otherRaw === offset ? 0 : otherRaw;
  return (
    numericField(s.cash) +
    numericField(s.savings_cash) +
    numericField(s.emergency_cash) +
    other +
    offset
  );
}

function deriveInvestibleBase(
  ledger: DashboardInputs,
  head: CanonicalHeadlineMetrics,
): number {
  const snap = ledger.snapshot ?? {};
  const pporValue = numericField(snap?.ppor);
  const pporMortgage = numericField(snap?.mortgage);
  const pporEquity = Math.max(0, pporValue - pporMortgage);
  const cars = numericField(snap?.cars);
  const iranProperty = numericField(snap?.iran_property);
  const otherAssets = numericField(snap?.other_assets);
  return Math.max(0, head.netWorth - pporEquity - cars - iranProperty - otherAssets);
}

function liquidityRiskFromRunway(runwayMonths: number): number {
  // Canonical buffer thresholds: ≥6 mo healthy, 3–6 amber, <3 fragile.
  // Map runway → liquidity risk score linearly:
  //   runway 0  → 100
  //   runway 3  → 60
  //   runway 6  → 30
  //   runway 12 → 0
  if (runwayMonths <= 0) return 100;
  if (runwayMonths >= 12) return 0;
  if (runwayMonths >= 6) return Math.round(30 - ((runwayMonths - 6) / 6) * 30);
  if (runwayMonths >= 3) return Math.round(60 - ((runwayMonths - 3) / 3) * 30);
  return Math.round(100 - (runwayMonths / 3) * 40);
}

function adjustMcConfidence(
  mc: MonteCarloResult | null,
  delta: number,
): number | null {
  if (!mc || !Number.isFinite(mc.prob_ff)) return null;
  return clamp(mc.prob_ff / 100 + delta, 0, 1);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function roundK(n: number): string {
  // 1234567 → "1,234k". Used in rationale strings.
  const k = Math.round(n / 1000);
  return k.toLocaleString();
}

/**
 * Scenario Engine V2 — Goal Solver v1 (Sprint 2B).
 *
 * First true optimisation layer over the V2 engine. Engine-level only;
 * no UI in Sprint 2B.
 *
 * Inputs:
 *   • Target FIRE age (optional)
 *   • Target passive income at FIRE (optional)
 *   • Target net worth at FIRE (optional)
 *   • Target property count (optional)
 *   • Target portfolio value (optional, deferred to Sprint 2C)
 *
 * The solver evaluates an explicit set of *strategy paths* — each one a
 * deterministic, named recipe of allocation assumptions. Paths are scored
 * by:
 *
 *   • Success probability: P(meets goal at horizon end)
 *   • Expected net worth at horizon
 *   • Expected FIRE year (the earliest year the path could sustain target
 *     passive income from passive yield alone)
 *   • Expected passive income (at horizon, on a 4% SWR proxy)
 *   • Risk score: a 0-100 composite of (path volatility + leverage +
 *     dispersion). Higher = riskier.
 *
 * The solver is *self-contained*. It does NOT call `runScenarioV2` — that
 * would balloon runtime and make the optimiser non-tractable. Instead it
 * uses a closed-form rollout for each path with seeded stochastic shocks
 * (deterministic given parentSeed). This preserves the determinism
 * architecture: same input → byte-identical output.
 */

import { makeRng, deriveSeed } from "./determinism";

export type StrategyKind =
  | "property_heavy"
  | "etf_heavy"
  | "hybrid"
  | "debt_reduction"
  | "cash_preservation"
  | "aggressive_leverage"
  | "balanced";

export interface StrategyDescriptor {
  kind: StrategyKind;
  label: string;
  /** Fraction of monthly surplus deployed into ETFs. */
  etfShare: number;
  /** Fraction of monthly surplus deployed into property deposits. */
  propertyShare: number;
  /** Fraction of monthly surplus deployed into extra mortgage repayment. */
  debtReductionShare: number;
  /** Fraction of monthly surplus left in cash. */
  cashShare: number;
  /** Annual expected return for the deployed portion (composite mean). */
  expectedReturnAnnual: number;
  /** Annual volatility for the deployed portion. */
  expectedVolAnnual: number;
  /** Effective leverage multiplier (1 = no leverage, 2 = 50% LVR). */
  leverage: number;
}

export const STRATEGY_REGISTRY: StrategyDescriptor[] = [
  {
    kind: "property_heavy",
    label: "Property Heavy",
    etfShare: 0.10, propertyShare: 0.70, debtReductionShare: 0.10, cashShare: 0.10,
    expectedReturnAnnual: 0.075, expectedVolAnnual: 0.13,
    leverage: 1.8,
  },
  {
    kind: "etf_heavy",
    label: "ETF Heavy",
    etfShare: 0.75, propertyShare: 0.05, debtReductionShare: 0.10, cashShare: 0.10,
    expectedReturnAnnual: 0.085, expectedVolAnnual: 0.17,
    leverage: 1.0,
  },
  {
    kind: "hybrid",
    label: "Hybrid",
    etfShare: 0.40, propertyShare: 0.35, debtReductionShare: 0.15, cashShare: 0.10,
    expectedReturnAnnual: 0.078, expectedVolAnnual: 0.14,
    leverage: 1.35,
  },
  {
    kind: "debt_reduction",
    label: "Debt Reduction",
    etfShare: 0.10, propertyShare: 0.05, debtReductionShare: 0.70, cashShare: 0.15,
    expectedReturnAnnual: 0.065, expectedVolAnnual: 0.05,
    leverage: 1.0,
  },
  {
    kind: "cash_preservation",
    label: "Cash Preservation",
    etfShare: 0.10, propertyShare: 0.00, debtReductionShare: 0.20, cashShare: 0.70,
    expectedReturnAnnual: 0.045, expectedVolAnnual: 0.02,
    leverage: 1.0,
  },
  {
    kind: "aggressive_leverage",
    label: "Aggressive Leverage",
    etfShare: 0.20, propertyShare: 0.65, debtReductionShare: 0.05, cashShare: 0.10,
    expectedReturnAnnual: 0.090, expectedVolAnnual: 0.20,
    leverage: 2.3,
  },
  {
    kind: "balanced",
    label: "Balanced",
    etfShare: 0.35, propertyShare: 0.25, debtReductionShare: 0.20, cashShare: 0.20,
    expectedReturnAnnual: 0.072, expectedVolAnnual: 0.12,
    leverage: 1.25,
  },
];

export interface GoalSolverInput {
  initialNetWorth: number;
  /** Monthly surplus available for deployment (post-tax, post-expenses). */
  monthlySurplus: number;
  /** Number of months in the optimisation horizon (e.g. 360 = 30y). */
  horizonMonths: number;
  /** Number of stochastic rollouts per path. Default 256 — cheap, deterministic. */
  rolloutCount?: number;
  /** Deterministic seed; same seed → same result. */
  seed?: number;
  /** Current household age (for FIRE-age targets). */
  currentAgeYears?: number;
  /** Targets (any subset). */
  targets: {
    fireAgeYears?: number;
    passiveIncomeAnnual?: number;
    netWorth?: number;
    propertyCount?: number;
    portfolioValue?: number;
  };
  /** Override default property growth assumption (used by property-heavy / aggressive paths). */
  propertyGrowthAnnual?: number;
  /** Safe withdrawal rate used to convert NW into "passive income at FIRE". */
  swr?: number;
}

export interface GoalSolverPathResult {
  kind: StrategyKind;
  label: string;
  /** Composite 0..1 — fraction of rollouts meeting the supplied targets. */
  successProbability: number;
  /** Mean terminal net worth across rollouts. */
  expectedNetWorth: number;
  /** Median year (calendar offset from start) at which FIRE income is sustainable. */
  expectedFireYear: number | null;
  /** Annual passive income at horizon under the SWR proxy. */
  expectedPassiveIncome: number;
  /** Risk score 0..100 (higher = more risk). */
  riskScore: number;
  /** Per-rollout terminal NW samples sorted ascending. */
  terminalSamplesSorted: number[];
  explanation: string;
}

export interface GoalSolverResult {
  winner: GoalSolverPathResult;
  runnerUps: GoalSolverPathResult[];
  allPaths: GoalSolverPathResult[];
  rolloutCount: number;
  seed: number;
  notes: string[];
}

/**
 * Run the goal solver. Pure / deterministic — no I/O, no Date.now, no
 * Math.random. The output ranking is stable across runs given identical
 * input (including the `seed`).
 */
export function runGoalSolver(input: GoalSolverInput): GoalSolverResult {
  const rolloutCount = Math.max(8, input.rolloutCount ?? 256);
  const seed = input.seed ?? 1_731_405_001;
  const swr = input.swr ?? 0.04;
  const horizon = Math.max(12, input.horizonMonths);
  const monthlySurplus = Math.max(0, input.monthlySurplus);
  const initial = Math.max(0, input.initialNetWorth);

  const propertyGrowth = input.propertyGrowthAnnual ?? 0.06;

  const evaluated: GoalSolverPathResult[] = STRATEGY_REGISTRY.map((strat) => {
    return evaluatePath(strat, {
      initial,
      monthlySurplus,
      horizon,
      rolloutCount,
      seed,
      swr,
      propertyGrowth,
      targets: input.targets,
      currentAgeYears: input.currentAgeYears,
    });
  });

  // Score for ranking: weight = successProbability primary, expected NW
  // secondary, risk score as a small tie-breaker (lower preferred).
  const ranked = [...evaluated].sort((a, b) => {
    if (Math.abs(a.successProbability - b.successProbability) > 0.005) {
      return b.successProbability - a.successProbability;
    }
    if (Math.abs(a.expectedNetWorth - b.expectedNetWorth) > 1) {
      return b.expectedNetWorth - a.expectedNetWorth;
    }
    return a.riskScore - b.riskScore;
  });

  const winner = ranked[0];
  const runnerUps = ranked.slice(1, 4);

  const notes: string[] = [];
  notes.push(
    `Goal Solver v1 — ${rolloutCount} rollouts × ${STRATEGY_REGISTRY.length} paths, ` +
      `horizon=${(horizon / 12).toFixed(1)}y, seed=${seed}.`,
  );
  if (winner.successProbability < 0.5) {
    notes.push(
      `Best path achieves only ${(winner.successProbability * 100).toFixed(0)}% success ` +
        `— targets may be unrealistic at this monthly surplus.`,
    );
  }

  return {
    winner,
    runnerUps,
    allPaths: ranked,
    rolloutCount,
    seed,
    notes,
  };
}

function evaluatePath(
  strat: StrategyDescriptor,
  ctx: {
    initial: number;
    monthlySurplus: number;
    horizon: number;
    rolloutCount: number;
    seed: number;
    swr: number;
    propertyGrowth: number;
    targets: GoalSolverInput["targets"];
    currentAgeYears?: number;
  },
): GoalSolverPathResult {
  const terminal: number[] = new Array(ctx.rolloutCount);
  const fireYears: number[] = [];
  const monthlyMean = Math.pow(1 + strat.expectedReturnAnnual, 1 / 12) - 1;
  const monthlyVol = strat.expectedVolAnnual / Math.sqrt(12);

  // Sprint 3B C-4 — leverage must NOT multiply the household's entire
  // starting net worth. That fabricates investable equity (e.g. cash, super,
  // PPOR equity) and structurally biases the solver toward leveraged
  // property strategies. Leverage now applies only to the *financed
  // property exposure*: contributions to the property bucket are amplified
  // by the leverage multiplier, but the resulting debt drags monthly
  // returns by an approximate mortgage-rate carry cost. The starting NW
  // is preserved at face value.
  //
  // This is an MVP repair, not a full property-equity model:
  //   - financedPrincipal = cumulative leveraged property contributions
  //   - monthly debt service drag ≈ financedPrincipal * (mortgageRate/12)
  //   - terminal NW = unleveraged growth + leveraged property growth net of
  //     the cumulative debt service
  // It removes the structural NW inflation; downstream MC (V4/V5) still
  // models full property mechanics when the user opens those engines.
  const leverageMultiplier = Math.max(1, strat.leverage);
  const financedShare = Math.max(0, leverageMultiplier - 1); // 0 for un-leveraged paths
  // Carry cost — proxy for mortgage interest on the leveraged sleeve.
  const mortgageRateAnnual = 0.065;
  const monthlyCarry = mortgageRateAnnual / 12;

  let successes = 0;

  for (let r = 0; r < ctx.rolloutCount; r++) {
    const rng = makeRng(deriveSeed(ctx.seed, `${strat.kind}:${r}`));
    let nw = ctx.initial; // starting equity is NOT inflated
    let financedPrincipal = 0; // cumulative leveraged property debt
    let achievedFireMonth: number | null = null;
    for (let i = 0; i < ctx.horizon; i++) {
      const shock = rng.normal();
      const growth = monthlyMean + shock * monthlyVol;
      // Apply growth on NW (un-leveraged base)
      nw = nw * (1 + growth);
      // Contribution: monthly surplus split across the four buckets.
      const deployed = ctx.monthlySurplus * (
        strat.etfShare + strat.propertyShare + strat.debtReductionShare
      );
      const cashContrib = ctx.monthlySurplus * strat.cashShare;
      nw += deployed * (1 + growth * 0.5) + cashContrib;

      // Leveraged property sleeve — only the property-allocated portion is
      // amplified, the corresponding debt is tracked and incurs a monthly
      // carry cost that drags NW.
      if (financedShare > 0 && strat.propertyShare > 0) {
        const newFinancedThisMonth =
          ctx.monthlySurplus * strat.propertyShare * financedShare;
        financedPrincipal += newFinancedThisMonth;
        // Property capital gain on the leveraged exposure (uses the
        // shared property growth assumption, not the path's blended mean).
        const monthlyPropGrowth = ctx.propertyGrowth / 12;
        nw += newFinancedThisMonth * monthlyPropGrowth +
              financedPrincipal * monthlyPropGrowth -
              financedPrincipal * monthlyCarry;
      }

      // Detect first FIRE month: 4% of NW sustains the target passive income
      if (
        achievedFireMonth == null &&
        ctx.targets.passiveIncomeAnnual &&
        nw * ctx.swr >= ctx.targets.passiveIncomeAnnual
      ) {
        achievedFireMonth = i;
      }
    }
    terminal[r] = nw;
    if (achievedFireMonth != null) fireYears.push(achievedFireMonth / 12);

    if (meetsTargets(nw, achievedFireMonth, ctx)) successes++;
  }

  terminal.sort((a, b) => a - b);
  const mean = terminal.reduce((s, v) => s + v, 0) / terminal.length;
  const median = terminal[Math.floor(terminal.length / 2)];

  let expectedFireYear: number | null = null;
  if (fireYears.length > 0) {
    const sorted = [...fireYears].sort((a, b) => a - b);
    expectedFireYear = sorted[Math.floor(sorted.length / 2)];
  }

  // Risk score — clamp into 0..100
  const baseRisk = Math.min(
    100,
    Math.round(
      strat.expectedVolAnnual * 250 +
        Math.max(0, strat.leverage - 1) * 25 +
        (1 - successes / ctx.rolloutCount) * 20,
    ),
  );

  return {
    kind: strat.kind,
    label: strat.label,
    successProbability: successes / ctx.rolloutCount,
    expectedNetWorth: mean,
    expectedFireYear,
    expectedPassiveIncome: median * ctx.swr,
    riskScore: baseRisk,
    terminalSamplesSorted: terminal,
    explanation: buildExplanation(strat, successes / ctx.rolloutCount, mean, expectedFireYear),
  };
}

function meetsTargets(
  nw: number,
  fireMonth: number | null,
  ctx: {
    swr: number;
    targets: GoalSolverInput["targets"];
    horizon: number;
    currentAgeYears?: number;
  },
): boolean {
  const t = ctx.targets;
  if (t.netWorth != null && nw < t.netWorth) return false;
  if (t.passiveIncomeAnnual != null && nw * ctx.swr < t.passiveIncomeAnnual) return false;
  if (t.fireAgeYears != null && ctx.currentAgeYears != null) {
    if (fireMonth == null) return false;
    const ageAtFire = ctx.currentAgeYears + fireMonth / 12;
    if (ageAtFire > t.fireAgeYears) return false;
  }
  // Property count and portfolio value targets are deferred to Sprint 2C
  // (requires per-path property modelling); they neither pass nor fail here.
  return true;
}

function buildExplanation(
  strat: StrategyDescriptor,
  successProb: number,
  expectedNw: number,
  expectedFireYear: number | null,
): string {
  const fireBlurb = expectedFireYear == null
    ? "no FIRE month observed within horizon"
    : `median FIRE in year ${expectedFireYear.toFixed(1)}`;
  return (
    `${strat.label}: ` +
    `etf=${(strat.etfShare * 100).toFixed(0)}% / ` +
    `prop=${(strat.propertyShare * 100).toFixed(0)}% / ` +
    `debt=${(strat.debtReductionShare * 100).toFixed(0)}% / ` +
    `cash=${(strat.cashShare * 100).toFixed(0)}%; ` +
    `leverage=${strat.leverage.toFixed(2)}x; ` +
    `mean NW ≈ $${Math.round(expectedNw).toLocaleString("en-AU")}; ` +
    `${fireBlurb}; success=${(successProb * 100).toFixed(0)}%.`
  );
}

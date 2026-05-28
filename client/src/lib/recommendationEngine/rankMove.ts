/**
 * recommendationEngine/rankMove.ts — Sprint 20 PR-F2.
 *
 * Single ranking entrypoint. Every candidate move passes through THIS
 * function with the SAME contract:
 *
 *     rankMove(canonicalFire, household, moveDef): RankedMove
 *
 * The composite `rankScore` is computed from the formula documented in the
 * `MOVE_RANKING_WEIGHTS` named export below. Surfaces MUST read
 * `MOVE_RANKING_WEIGHTS` rather than redeclaring the weights locally — that
 * keeps the formula auditable and survives weight tuning in future PRs.
 *
 * The PR-F2 charter (Section 3.2) starting weights and justification:
 *
 *   0.40 * normalize(fireDateYearsPulled, 0..10)
 *       — "fire date pulled earlier" is the dominant outcome a FIRE user
 *         cares about. 40% weight reflects that the engine is named FIRE
 *         path, not "best return optimiser". Cap at 10 years pulled
 *         earlier because beyond that, model error dominates the answer.
 *   +0.25 * normalize(netWorthDelta25y, 0..2_000_000)
 *       — secondary NW outcome over a meaningful horizon. 25% gives NW
 *         optimisation a real seat at the table but cannot dominate the
 *         FIRE-date axis. Cap at $2M, the realistic ceiling for a single-
 *         move impact at this household size.
 *   −0.15 * normalize(downside variance @ p5, 0..0.5)
 *       — downside-risk penalty. A move that adds 30% drawdown variance
 *         loses meaningful score even if the headline outcome is good.
 *         Cap at 0.5 (a 50% drawdown is catastrophic enough that beyond
 *         that point the engine should be refusing to recommend).
 *   −0.10 * normalize(illiquidity, 0..100)
 *       — illiquid moves (sell IP, extra super behind preservation age)
 *         pay a moderate penalty so the engine doesn't keep recommending
 *         locking the household into illiquid wrappers.
 *   −0.10 * normalize(max(0, leverageDelta − 0.05), 0..0.30)
 *       — moves that materially increase leverage pay a penalty. The 0.05
 *         dead-band avoids penalising tiny increases caused by rounding.
 *
 * Weights sum to 1.00 by design (0.40 + 0.25 + 0.15 + 0.10 + 0.10 = 1.00)
 * so `rankScore` is bounded in [-0.35, 0.65] before the dead-band rounding.
 * The engine clamps the output to [-1, 1] for display.
 */

import type {
  CanonicalFireTarget,
  CanonicalFireAdvancedSettings,
} from "@/types/canonicalFire";
import type {
  CanonicalMoveConfidence,
  MoveDefinition,
  RankedMove,
} from "@/types/canonicalMove";
import type { CanonicalProperty } from "@/lib/property/types";

import { rankSellInvestmentProperty } from "./moves/sellInvestmentProperty";
import { rankRefinancePpor } from "./moves/refinancePpor";
import { rankExtraSuperContribution } from "./moves/extraSuperContribution";
import { rankExtraEtfDca } from "./moves/extraEtfDca";
import { rankDebtRecycling } from "./moves/debtRecycling";

/**
 * Named export of the composite weights. Auditable single source.
 *
 * Tuning rule: changing any weight here is a deliberate engine change.
 * The companion regression test pins the demo-household ranking order so
 * weight changes that flip the order are surfaced explicitly in code review.
 */
export const MOVE_RANKING_WEIGHTS = {
  fireDateYearsPulled: 0.4,
  netWorthDelta25y: 0.25,
  downsideVariancePenalty: -0.15,
  illiquidityPenalty: -0.1,
  leverageDeltaPenalty: -0.1,
} as const;

/**
 * Normalisation caps used in the composite. Pinned constants so the
 * formula is reproducible from inputs alone — no hidden engine state.
 */
export const MOVE_RANKING_CAPS = {
  fireDateYearsPulledMax: 10,
  netWorthDelta25yMax: 2_000_000,
  downsideVariancePercentile5Max: 0.5,
  illiquidityMax: 100,
  leverageDeltaDeadBand: 0.05,
  leverageDeltaMax: 0.3,
} as const;

/** Household-snapshot contract consumed by every move model. */
export interface MoveRankingHousehold {
  /** AUD; current net worth. */
  currentNetWorth: number;
  /** AUD; total investment-property value (settled only). */
  totalInvestmentPropertyValue: number;
  /** AUD; total investment-property loan balance (settled only). */
  totalInvestmentPropertyLoans: number;
  /** AUD; total PPOR value. */
  totalPpoRValue: number;
  /** AUD; total PPOR loan balance. */
  totalPpoRLoanBalance: number;
  /** AUD/month; total monthly income across the household. */
  monthlyIncome: number;
  /** AUD/month; total monthly expenses. */
  monthlyExpenses: number;
  /** AUD; liquid cash + offset. */
  liquidCash: number;
  /** Decimal; current property leverage = loans/value. */
  propertyLeverage: number;
  /** Decimal; current household debt-to-asset ratio. */
  debtToAssetRatio: number;
  /** Properties list (already classified). */
  properties: ReadonlyArray<CanonicalProperty>;
  /** Household marginal tax rate (decimal). */
  marginalTaxRate: number;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function normalize(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  if (!Number.isFinite(value)) return 0;
  const v = (value - min) / (max - min);
  return clamp01(v);
}

/**
 * Compose the rankScore from a `RankedMove`'s outcome components, applying
 * the weights and caps documented above. Pure function — no hidden state.
 */
export function composeRankScore(input: {
  fireDateYearsPulled: number;
  netWorthDelta25y: number;
  downsideVariancePercentile5: number;
  illiquidityScore: number;
  leverageDelta: number;
}): number {
  const fireTerm =
    MOVE_RANKING_WEIGHTS.fireDateYearsPulled *
    normalize(input.fireDateYearsPulled, 0, MOVE_RANKING_CAPS.fireDateYearsPulledMax);
  const nwTerm =
    MOVE_RANKING_WEIGHTS.netWorthDelta25y *
    normalize(input.netWorthDelta25y, 0, MOVE_RANKING_CAPS.netWorthDelta25yMax);
  const downsideTerm =
    MOVE_RANKING_WEIGHTS.downsideVariancePenalty *
    normalize(
      input.downsideVariancePercentile5,
      0,
      MOVE_RANKING_CAPS.downsideVariancePercentile5Max,
    );
  const illiquidityTerm =
    MOVE_RANKING_WEIGHTS.illiquidityPenalty *
    normalize(input.illiquidityScore, 0, MOVE_RANKING_CAPS.illiquidityMax);
  const leverageExcess = Math.max(
    0,
    input.leverageDelta - MOVE_RANKING_CAPS.leverageDeltaDeadBand,
  );
  const leverageTerm =
    MOVE_RANKING_WEIGHTS.leverageDeltaPenalty *
    normalize(leverageExcess, 0, MOVE_RANKING_CAPS.leverageDeltaMax);
  const score = fireTerm + nwTerm + downsideTerm + illiquidityTerm + leverageTerm;
  // Clamp to [-1, 1] for display sanity; the formula naturally stays in
  // [-0.35, 0.65] given the caps and dead-band.
  if (score > 1) return 1;
  if (score < -1) return -1;
  return score;
}

/**
 * Convert a calendar-year FIRE-date delta into the `FireDateDelta` shape.
 * Positive years = pulled earlier; the residual months carry the same sign.
 */
export function fireDateDeltaFromYears(yearsDelta: number): {
  years: number;
  months: number;
} {
  const sign = yearsDelta >= 0 ? 1 : -1;
  const abs = Math.abs(yearsDelta);
  const wholeYears = Math.floor(abs);
  const residualMonths = Math.round((abs - wholeYears) * 12);
  return { years: sign * wholeYears, months: sign * residualMonths };
}

/**
 * Determine confidence band from the underlying variance + assumption
 * stability. Strictly returns one of low|medium|high — UI MUST NOT label
 * this as a probability anywhere.
 */
export function deriveConfidence(input: {
  variancePercentile5: number;
  assumptionStability: "stable" | "moderate" | "volatile";
}): { label: CanonicalMoveConfidence; rationale: string } {
  const v = input.variancePercentile5;
  if (input.assumptionStability === "volatile" || v >= 0.3) {
    return {
      label: "low",
      rationale:
        v >= 0.3
          ? `Heuristic confidence: LOW. Downside variance at the 5th percentile is ${(v * 100).toFixed(0)}%, above the 30% threshold.`
          : `Heuristic confidence: LOW. Underlying assumptions (rates, returns) are flagged volatile in current data.`,
    };
  }
  if (input.assumptionStability === "moderate" || v >= 0.15) {
    return {
      label: "medium",
      rationale: `Heuristic confidence: MEDIUM. Downside variance at the 5th percentile is ${(v * 100).toFixed(0)}%, with assumptions in the moderate-stability band.`,
    };
  }
  return {
    label: "high",
    rationale: `Heuristic confidence: HIGH. Downside variance at the 5th percentile is ${(v * 100).toFixed(0)}%, and core assumptions (current rate, current rent) are directly observable.`,
  };
}

/**
 * SWR / target-NW from the canonical FIRE goal. Mirrors
 * canonicalFireDerivations.ts but is duplicated here as a tiny pure helper
 * so this module has no runtime dependency on derivations.
 */
function deriveTargetNetWorth(
  fire: CanonicalFireTarget,
): { targetNetWorth: number; effectiveSwr: number } {
  const adv: CanonicalFireAdvancedSettings = fire.advanced ?? {};
  const explicit = adv.targetNetWorth;
  const swr =
    adv.safeWithdrawalRateOverride && adv.safeWithdrawalRateOverride > 0
      ? adv.safeWithdrawalRateOverride
      : 0.04;
  if (typeof explicit === "number" && Number.isFinite(explicit) && explicit > 0) {
    return { targetNetWorth: explicit, effectiveSwr: swr };
  }
  const monthly = fire.targetPassiveIncomeMonthly;
  const annual = (Number.isFinite(monthly) ? monthly : 0) * 12;
  return { targetNetWorth: annual / swr, effectiveSwr: swr };
}

/**
 * Single ranking entrypoint. Dispatches to the per-move model and assembles
 * the canonical `RankedMove`. Pure function — no React, no hooks, no I/O.
 */
export function rankMove(
  fire: CanonicalFireTarget,
  household: MoveRankingHousehold,
  moveDef: MoveDefinition,
): RankedMove {
  const ctx = {
    fire,
    household,
    targetNetWorth: deriveTargetNetWorth(fire).targetNetWorth,
  };
  switch (moveDef.moveId) {
    case "sell_investment_property":
      return rankSellInvestmentProperty(ctx, moveDef.params);
    case "refinance_ppor":
      return rankRefinancePpor(ctx, moveDef.params);
    case "extra_super_contribution":
      return rankExtraSuperContribution(ctx, moveDef.params);
    case "extra_etf_dca":
      return rankExtraEtfDca(ctx, moveDef.params);
    case "debt_recycling":
      return rankDebtRecycling(ctx, moveDef.params);
  }
}

/**
 * Convenience: rank multiple moves in one go and return them sorted by
 * rankScore descending. Stable sort tie-breaks by moveId for determinism.
 */
export function rankMoves(
  fire: CanonicalFireTarget,
  household: MoveRankingHousehold,
  moves: ReadonlyArray<MoveDefinition>,
): RankedMove[] {
  const ranked = moves.map(m => rankMove(fire, household, m));
  return ranked.slice().sort((a, b) => {
    if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
    return a.moveId.localeCompare(b.moveId);
  });
}

/** Shared ranking-context shape consumed by every per-move model. */
export interface MoveRankingContext {
  fire: CanonicalFireTarget;
  household: MoveRankingHousehold;
  /** Derived from `fire` — household's target NW for FIRE. */
  targetNetWorth: number;
}

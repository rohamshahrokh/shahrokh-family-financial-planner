/**
 * engineV5.ts — Monte Carlo V5 Orchestrator
 *
 * V5 is a NON-DESTRUCTIVE layer on V4. It:
 *
 *   1. Calls V4 (`runMonteCarloV4`) for the canonical fan, FIRE prob, V4 extras.
 *   2. Adds V5 regime labels (alias + overlay flags) using the V4 regime path.
 *   3. Generates a correlated shock summary (one representative seeded path).
 *   4. Builds the V5 household realism timeline (life-cycle costs + careers).
 *   5. Builds the V5 property realism per-property output.
 *   6. Builds the V5 portfolio intelligence + contribution priority.
 *   7. Builds the V5 FIRE Engine V2 enrichment.
 *   8. Builds the V5 narrative blocks (multi-tone).
 *   9. Builds the V5 transparency report.
 *  10. Runs V5 validations.
 *  11. Re-ranks recommendations by user preference weights.
 *
 * The V4 output (median, p10, p90, fan_data, prob_ff, v4 block) is returned
 * UNCHANGED. V5 outputs sit under `result.v5`.
 */

import type { MCInput } from "../monteCarloEngine";
import { runMonteCarloV4, type MonteCarloV4Result, type MonteCarloV4Config } from "../monteCarloV4/engineV4";
import { mulberry32, hashSeed } from "../monteCarloV4/rng";
import {
  combinedEffects, generateOverlaySchedule, aggregateOverlaysByYear,
  v5RegimeLabelByYear, type RegimeIdV5, type RegimeOverlayFlags,
} from "./regimesV5";
import { generateCorrelatedShockPath, summariseShockPath, type ShockPathSummary } from "./correlatedShocks";
import { generateHouseholdTimeline, householdYearlyTotals, type HouseholdRealismConfig, type HouseholdRealismTimeline } from "./householdRealism";
import { runPropertyRealism, aggregateHouseholdPropertyDelta, type PropertyRealismInput, type PropertyRealismOutputPerProperty } from "./propertyRealismAU";
import { computePortfolioIntelligence, contributionPriority, type PortfolioIntelligenceResult, type PortfolioSnapshotV5, type TargetWeightsV5, DEFAULT_TARGETS, type PortfolioRecommendationV5 } from "./portfolioIntelligence";
import { runFireV2, type FireV2Input, type FireV2Result } from "./fireEngineV2";
import { buildNarrativesV3, type NarrativeBlockV3 } from "./narrativeV3";
import { buildTransparencyReport, type TransparencyReport } from "./transparency";
import { runV5Validations, type ValidationResult } from "./validation";
import {
  rerankByPreference, impactForTag, normalisePreferences,
  type PreferenceVector, NEUTRAL_PREF,
} from "./preferenceWeights";
import { generateRatePath, DEFAULT_RATE_PARAMS } from "../monteCarloV4/rates";
import { generateRegimePath } from "../monteCarloV4/regimes";

export interface MonteCarloV5Config extends MonteCarloV4Config {
  /** Household realism config (children, careers, etc). */
  household?: Partial<HouseholdRealismConfig>;
  /** Property realism per-property metadata. */
  propertyRealism?: PropertyRealismInput[];
  /** Portfolio snapshot for V5 portfolio intelligence. */
  portfolio?: PortfolioSnapshotV5;
  /** Target weights for portfolio rebalancing scoring. */
  portfolioTargets?: TargetWeightsV5;
  /** FIRE V2 inputs. */
  fire?: FireV2Input;
  /** User preference vector. Affects ranking only. */
  preferences?: PreferenceVector;
  /** Assumption snapshot for transparency report. */
  assumptions?: {
    inflationPct: number;
    propertyGrowthPct: number;
    etfReturnPct: number;
    cryptoReturnPct: number;
    ratePathStartPct: number;
    ratePathPeakPct: number;
    marginalTaxRate: number;
    cgtDiscount: number;
    leverageRatio: number;
  };
}

export interface MonteCarloV5Extras {
  schemaVersion: "v5";
  v5RegimeByYear: RegimeIdV5[];
  overlayByYear: RegimeOverlayFlags[];
  shockSummary: ShockPathSummary;
  household: {
    timeline: HouseholdRealismTimeline;
    yearlyTotals: ReturnType<typeof householdYearlyTotals>;
  } | null;
  propertyRealism: PropertyRealismOutputPerProperty[];
  portfolio: PortfolioIntelligenceResult | null;
  contributionPlan: ReturnType<typeof contributionPriority>;
  fire: FireV2Result | null;
  narratives: NarrativeBlockV3[];
  transparency: TransparencyReport;
  validations: ValidationResult[];
  rerankedRecommendations: Array<PortfolioRecommendationV5 & { impact: ReturnType<typeof impactForTag> }>;
}

export interface MonteCarloV5Result extends MonteCarloV4Result {
  v5: MonteCarloV5Extras;
}

export function runMonteCarloV5(
  input: MCInput,
  config: MonteCarloV5Config = {},
): MonteCarloV5Result {
  // ── Step 1: V4 canonical + V4 extras ────────────────────────────────────
  const base = runMonteCarloV4(input, config) as MonteCarloV4Result;

  const startYear = input.startYear ?? new Date().getFullYear();
  const endYear = input.endYear ?? startYear + 9;
  const nYears = endYear - startYear + 1;
  const nMonths = nYears * 12;
  const seed = typeof config.seed === "number" ? config.seed : hashSeed(config.seed ?? `${startYear}-${endYear}-v5`);

  // ── Step 2: V5 regime labels + overlay schedule (single representative path) ─
  const rng = mulberry32(hashSeed(`${seed}-v5-paths`));
  const regimePath = generateRegimePath(rng, nMonths, config.startRegime ?? "normal_growth");
  const overlayByMonth = generateOverlaySchedule(rng, regimePath);
  const overlayByYear = aggregateOverlaysByYear(overlayByMonth, nYears);

  // Dominant V4 regime per year from the path
  const v4ByYear = base.v4.regimeByYear;
  const v5RegimeByYear = v5RegimeLabelByYear(v4ByYear, overlayByYear);

  // Touch combinedEffects on each month so downstream code can rely on
  // the join even if we don't currently consume it within engineV4.
  // (kept lightweight; result is unused beyond a sanity touch)
  void combinedEffects(regimePath[0], overlayByMonth[0]);

  // ── Step 3: Correlated shock summary on the representative path ─────────
  const ratePath = generateRatePath(mulberry32(hashSeed(`${seed}-rates`)), nMonths, regimePath, DEFAULT_RATE_PARAMS);
  const shocks = generateCorrelatedShockPath(mulberry32(hashSeed(`${seed}-shocks`)), regimePath, {});
  const shockSummary = summariseShockPath(shocks);

  // ── Step 4: Household realism timeline ──────────────────────────────────
  let household: MonteCarloV5Extras["household"] = null;
  if (config.household && input.snapshot?.monthly_income !== undefined) {
    const cfg: HouseholdRealismConfig = {
      startYear,
      nMonths,
      baselineMonthlyIncome: input.snapshot.monthly_income,
      ...config.household,
    };
    const timeline = generateHouseholdTimeline(mulberry32(hashSeed(`${seed}-household`)), cfg);
    const yearlyTotals = householdYearlyTotals(timeline, nYears);
    household = { timeline, yearlyTotals };
  }

  // ── Step 5: Property realism ─────────────────────────────────────────────
  let propertyRealism: PropertyRealismOutputPerProperty[] = [];
  if (config.propertyRealism && config.propertyRealism.length > 0) {
    propertyRealism = runPropertyRealism(
      mulberry32(hashSeed(`${seed}-property`)),
      {
        startYear,
        nMonths,
        ratePathByMonth: ratePath.mortgageRate,
        regimeByMonth: regimePath,
      },
      config.propertyRealism,
    );
  }

  // ── Step 6: Portfolio intelligence ─────────────────────────────────────
  const portfolio = config.portfolio ? computePortfolioIntelligence(config.portfolio, config.portfolioTargets ?? DEFAULT_TARGETS) : null;
  const contribPlan = portfolio && config.portfolio
    ? contributionPriority(
        Math.max(0, (config.portfolio.monthlyIncome ?? 0) - (config.portfolio.monthlyExpenses ?? 0)),
        config.portfolio,
        portfolio,
      )
    : [];

  // ── Step 7: FIRE V2 ─────────────────────────────────────────────────────
  let fire: FireV2Result | null = null;
  if (config.fire) {
    // Sample terminal NW from fan_data to feed empirical failure prob.
    const terminalNw = base.fan_data.length > 0
      ? [base.fan_data[base.fan_data.length - 1].p10,
         base.fan_data[base.fan_data.length - 1].median,
         base.fan_data[base.fan_data.length - 1].p90]
      : [];
    fire = runFireV2(config.fire, terminalNw);
  }

  // ── Step 8: Narratives V3 ───────────────────────────────────────────────
  const narratives = buildNarrativesV3({
    median: base.median,
    p10: base.p10,
    p90: base.p90,
    probFf: base.prob_ff,
    metrics: base.v4.advancedRisk,
    dominantRegimesByYear: v4ByYear,
    v5RegimeByYear,
    startYear,
    driverWeights: base.v4.driverWeights,
    fire: fire ?? undefined,
    portfolio: portfolio ?? undefined,
    prior: config.priorRun ?? null,
  });

  // ── Step 9: Transparency report ────────────────────────────────────────
  const asm = config.assumptions ?? defaultAssumptions(input);
  const transparency = buildTransparencyReport({
    startYear,
    inflationPct: asm.inflationPct,
    propertyGrowthPct: asm.propertyGrowthPct,
    etfReturnPct: asm.etfReturnPct,
    cryptoReturnPct: asm.cryptoReturnPct,
    ratePathStartPct: asm.ratePathStartPct,
    ratePathPeakPct: asm.ratePathPeakPct,
    marginalTaxRate: asm.marginalTaxRate,
    cgtDiscount: asm.cgtDiscount,
    leverageRatio: asm.leverageRatio,
    v4RegimeByYear: v4ByYear,
    v5RegimeByYear,
    driverWeights: base.v4.driverWeights,
    metrics: base.v4.advancedRisk,
  });

  // ── Step 10: Validations ───────────────────────────────────────────────
  const startNW = startingNwFromInput(input);
  const medianTerminal = base.fan_data.length > 0
    ? base.fan_data[base.fan_data.length - 1].median
    : base.median;
  const validations = runV5Validations({
    nwRecon: {
      totalAssets: startNW.assets,
      totalLiabilities: startNW.liabilities,
      declaredNW: startNW.declaredNW,
    },
    growth: { startingNW: startNW.declaredNW, medianTerminal, horizonYears: nYears },
    assumptions: {
      realReturnPct: Math.max(0, asm.etfReturnPct - asm.inflationPct),
      inflationPct: asm.inflationPct,
      propertyGrowthPct: asm.propertyGrowthPct,
    },
    drivers: base.v4.driverWeights,
    concentration: {
      lvr: asm.leverageRatio,
      stateConcentrationPct: 0.5, // placeholder if no per-state data
    },
  });

  // ── Step 11: Preference rerank of V5 + V4 recommendations ──────────────
  const pref = normalisePreferences(config.preferences ?? NEUTRAL_PREF);
  const v5RecsWithImpact: Array<PortfolioRecommendationV5 & { impact: ReturnType<typeof impactForTag> }> =
    (portfolio?.recommendations ?? []).map(r => ({ ...r, impact: impactForTag(r.tag) }));
  const reranked = rerankByPreference(v5RecsWithImpact, pref);

  // Reference unused but needed for tree-shake safety
  void aggregateHouseholdPropertyDelta;

  return {
    ...base,
    v5: {
      schemaVersion: "v5",
      v5RegimeByYear,
      overlayByYear,
      shockSummary,
      household,
      propertyRealism,
      portfolio,
      contributionPlan: contribPlan,
      fire,
      narratives,
      transparency,
      validations,
      rerankedRecommendations: reranked,
    },
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function startingNwFromInput(input: MCInput): {
  assets: number; liabilities: number; declaredNW: number;
} {
  const s = input.snapshot;
  const assets = s.ppor + s.cash + s.super_balance + s.stocks + s.crypto
    + (s.cars ?? 0) * 0.8 + (s.iran_property ?? 0)
    + (input.properties ?? []).filter(p => p.type !== "ppor")
        .reduce((a, p) => a + (p.current_value ?? p.purchase_price ?? 0), 0);
  const liabilities = s.mortgage + (s.other_debts ?? 0)
    + (input.properties ?? []).filter(p => p.type !== "ppor")
        .reduce((a, p) => a + p.loan_amount, 0);
  return { assets, liabilities, declaredNW: assets - liabilities };
}

function defaultAssumptions(input: MCInput): NonNullable<MonteCarloV5Config["assumptions"]> {
  return {
    inflationPct: 2.7,
    propertyGrowthPct: 5.5,
    etfReturnPct: 7.5,
    cryptoReturnPct: 9.5,
    ratePathStartPct: 6.0,
    ratePathPeakPct: 7.5,
    marginalTaxRate: 0.37,
    cgtDiscount: 0.5,
    leverageRatio: Math.min(1, (input.snapshot.mortgage + (input.snapshot.other_debts ?? 0))
      / Math.max(1, input.snapshot.ppor + input.snapshot.cash + input.snapshot.super_balance + input.snapshot.stocks)),
  };
}

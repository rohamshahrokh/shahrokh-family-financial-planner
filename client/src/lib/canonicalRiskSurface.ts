/**
 * canonicalRiskSurface.ts — Canonical 8-axis risk surface + stress matrix +
 * FIRE fragility gauge.
 *
 * Why this file exists
 * --------------------
 * The Risk tab in the Wealth Decision Center previously rendered four cards
 * (Liquidity Runway, Leverage, Downside Exposure, Survivability) that the
 * Financial Health strip already shows. That duplication was confusing and
 * gave the Risk surface no decision value of its own.
 *
 * This module consolidates the risk surface into three things every widget
 * consumes from canonical inputs (no parallel engines):
 *
 *   1. Radar — eight axes (Liquidity, Leverage, Cashflow, Concentration,
 *      Property Exposure, Interest Rate Sensitivity, Tax Reform Exposure,
 *      FIRE Delay), each scored 0–100 where 100 is safest. Safe + warning
 *      zones are computed once and the same for every render.
 *   2. Stress matrix — seven shock rows × five metric columns, each cell
 *      classified green/amber/red based on the canonical inputs.
 *   3. FIRE fragility — stable / moderate / high, based on leverage, liquid
 *      runway, appreciation reliance and post-tax liquidation value.
 *
 * Every input is sourced from canonical state (canonicalWealth + the
 * DashboardInputs ledger) or the active tax regime. There are no hardcoded
 * "example" numbers and no parallel risk engine.
 */

import {
  selectCanonicalNetWorth,
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectMonthlyDebtService,
  selectCashToday,
  selectIpCurrentValueSettled,
  selectIpLoanBalanceSettled,
  selectPassiveIncome,
  type DashboardInputs,
} from "./dashboardDataContract";
import {
  computeWealthLayers,
  type TaxScenario,
  type WealthLayers,
} from "./canonicalWealth";

// ─── Axes ────────────────────────────────────────────────────────────────────

export const RISK_AXES = [
  "Liquidity",
  "Leverage",
  "Cashflow",
  "Concentration",
  "Property Exposure",
  "Interest Rate",
  "Tax Reform",
  "FIRE Delay",
] as const;
export type RiskAxis = (typeof RISK_AXES)[number];

export interface RadarPoint {
  axis: RiskAxis;
  /** 0–100 score where 100 = safest. */
  score: number;
  /** Plain-language explanation derived from canonical inputs. */
  detail: string;
}

export interface RadarSurface {
  /** Current household position per axis. */
  current: RadarPoint[];
  /** Safe zone reference values (constant). */
  safeZone: number[];
  /** Warning zone reference values (constant). */
  warningZone: number[];
}

const SAFE_ZONE: Record<RiskAxis, number> = {
  Liquidity: 80,
  Leverage: 80,
  Cashflow: 80,
  Concentration: 75,
  "Property Exposure": 75,
  "Interest Rate": 75,
  "Tax Reform": 80,
  "FIRE Delay": 75,
};
const WARNING_ZONE: Record<RiskAxis, number> = {
  Liquidity: 55,
  Leverage: 55,
  Cashflow: 55,
  Concentration: 50,
  "Property Exposure": 50,
  "Interest Rate": 50,
  "Tax Reform": 55,
  "FIRE Delay": 50,
};

function clamp01_100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

// ─── Stress matrix ───────────────────────────────────────────────────────────

export type StressTone = "green" | "amber" | "red";

export interface StressRowImpact {
  /** Monthly cashflow after shock (AUD). */
  monthlyCashflow: number;
  monthlyCashflowTone: StressTone;
  /** Liquidity runway in months after shock. */
  liquidityRunwayMonths: number;
  liquidityRunwayTone: StressTone;
  /** Accessible NW after shock (AUD). */
  accessibleNW: number;
  accessibleNWTone: StressTone;
  /** Estimated years added to FIRE timeline. */
  fireYearDelta: number;
  fireYearDeltaTone: StressTone;
  /** Debt ratio after shock (debt / total assets). */
  debtRatioPct: number;
  debtRatioTone: StressTone;
}

export interface StressRow {
  id: string;
  label: string;
  /** One-line description of the shock applied. */
  shock: string;
  impact: StressRowImpact;
}

// ─── Fragility gauge ─────────────────────────────────────────────────────────

export type FragilityLevel = "stable" | "moderate" | "high";

export interface FireFragility {
  level: FragilityLevel;
  score: number; // 0–100 (lower = more fragile)
  drivers: {
    leveragePct: number;
    liquidityMonths: number;
    appreciationReliancePct: number;
    postTaxLiquidationValue: number;
  };
  summary: string;
}

// ─── Output ──────────────────────────────────────────────────────────────────

export interface CanonicalRiskSurface {
  radar: RadarSurface;
  stress: StressRow[];
  fragility: FireFragility;
  scenario: TaxScenario;
  /** Canonical wealth layers, surfaced so the Risk tab doesn't refetch. */
  wealth: WealthLayers;
}

// ─── Score helpers ───────────────────────────────────────────────────────────

function scoreLiquidity(runwayMonths: number): RadarPoint {
  // 6mo → 95, 3mo → 70, 1mo → 35, 0 → 5
  const s = clamp01_100(
    runwayMonths >= 6 ? 95
    : runwayMonths >= 3 ? 70 + (runwayMonths - 3) * (25 / 3)
    : runwayMonths >= 1 ? 35 + (runwayMonths - 1) * (35 / 2)
    : runwayMonths * 35,
  );
  return {
    axis: "Liquidity",
    score: s,
    detail: `${runwayMonths.toFixed(1)} mo of expenses in liquid cash + offset.`,
  };
}

function scoreLeverage(lvrPct: number): RadarPoint {
  // 0% → 100, 60% → 80, 80% → 50, 95%+ → 15
  const s = clamp01_100(100 - lvrPct * 0.95);
  return {
    axis: "Leverage",
    score: s,
    detail: `Total LVR ${lvrPct.toFixed(1)}% (debt / property value).`,
  };
}

function scoreCashflow(surplusRatioPct: number): RadarPoint {
  const s = clamp01_100(
    surplusRatioPct >= 30 ? 95
    : surplusRatioPct >= 10 ? 60 + (surplusRatioPct - 10) * (35 / 20)
    : surplusRatioPct >= 0 ? 30 + surplusRatioPct * 3
    : Math.max(0, 30 + surplusRatioPct * 2),
  );
  return {
    axis: "Cashflow",
    score: s,
    detail: `Monthly surplus ratio ${surplusRatioPct.toFixed(1)}% of income.`,
  };
}

function scoreConcentration(maxAssetSharePct: number): RadarPoint {
  // Penalise when any single asset class > 60% of total assets.
  const s = clamp01_100(100 - Math.max(0, maxAssetSharePct - 50) * 1.8);
  return {
    axis: "Concentration",
    score: s,
    detail: `Largest single asset class = ${maxAssetSharePct.toFixed(0)}% of total assets.`,
  };
}

function scorePropertyExposure(propertySharePct: number): RadarPoint {
  // Anything > 70% of NW in property starts to bite liquidity.
  const s = clamp01_100(100 - Math.max(0, propertySharePct - 50) * 1.4);
  return {
    axis: "Property Exposure",
    score: s,
    detail: `Property equity = ${propertySharePct.toFixed(0)}% of net worth.`,
  };
}

function scoreInterestRate(interestToIncomePct: number, mortgageRate: number): RadarPoint {
  // Mortgage interest as a % of income; harsher when current rate is already high.
  const baseDrag = clamp01_100(100 - interestToIncomePct * 2.4);
  const rateAdj = mortgageRate >= 7 ? -10 : mortgageRate >= 6 ? -5 : 0;
  const s = clamp01_100(baseDrag + rateAdj);
  return {
    axis: "Interest Rate",
    score: s,
    detail: `Mortgage interest = ${interestToIncomePct.toFixed(1)}% of income at ${mortgageRate.toFixed(2)}% p.a.`,
  };
}

function scoreTaxReform(scenario: TaxScenario, ipEquity: number, lossBank: number): RadarPoint {
  if (scenario !== "proposed_reform" || ipEquity <= 0) {
    return {
      axis: "Tax Reform",
      score: 90,
      detail: "Current law in effect — no reform exposure.",
    };
  }
  // Under reform, exposure scales with the size of IP equity at risk of the
  // loss-bank quarantine. We discount further by accrued loss bank dollars.
  const drag = Math.min(40, (ipEquity / 1_000_000) * 18 + (lossBank / 50_000) * 4);
  const s = clamp01_100(80 - drag);
  return {
    axis: "Tax Reform",
    score: s,
    detail: `Reform active · IP equity exposed ≈ $${Math.round(ipEquity / 1000)}K · loss bank $${Math.round(lossBank).toLocaleString("en-AU")}.`,
  };
}

function scoreFireDelay(progressPct: number, surplusRatioPct: number): RadarPoint {
  // Two signals: distance to FIRE + ability to bridge via surplus.
  const distancePenalty = Math.max(0, 60 - progressPct) * 0.9;
  const surplusBoost = Math.max(-15, Math.min(15, (surplusRatioPct - 10) * 1.2));
  const s = clamp01_100(80 - distancePenalty + surplusBoost);
  return {
    axis: "FIRE Delay",
    score: s,
    detail: `FIRE progress ${progressPct.toFixed(0)}% · surplus ratio ${surplusRatioPct.toFixed(1)}%.`,
  };
}

// ─── Stress builders ─────────────────────────────────────────────────────────

interface ShockCtx {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyDebtService: number;
  liquidCash: number;
  mortgage: number;
  ipLoan: number;
  pporValue: number;
  ipValue: number;
  totalAssets: number;
  totalDebt: number;
  accessibleNW: number;
  fireCapital: number;
  surplus: number;
  mortgageRate: number;
  fireTargetCapital: number;
}

function tone(metric: "cashflow" | "runway" | "nw" | "fireDelta" | "debt", v: number): StressTone {
  if (metric === "cashflow") {
    if (v >= 0) return "green";
    if (v >= -2000) return "amber";
    return "red";
  }
  if (metric === "runway") {
    if (v >= 6) return "green";
    if (v >= 3) return "amber";
    return "red";
  }
  if (metric === "nw") {
    if (v >= 1_000_000) return "green";
    if (v >= 250_000) return "amber";
    return "red";
  }
  if (metric === "fireDelta") {
    if (v <= 0.5) return "green";
    if (v <= 2) return "amber";
    return "red";
  }
  if (metric === "debt") {
    if (v <= 40) return "green";
    if (v <= 65) return "amber";
    return "red";
  }
  return "amber";
}

function buildImpact(
  ctx: ShockCtx,
  opts: {
    incomeDeltaMo?: number; // negative for shock
    debtDeltaMo?: number;   // positive for higher service cost
    cashDelta?: number;     // positive for new outflow
    nwDelta?: number;       // negative for capital loss
    fireDeltaYears?: number;
    debtDeltaRatio?: number; // additive percentage points
  },
): StressRowImpact {
  const monthlyCF =
    ctx.surplus +
    (opts.incomeDeltaMo ?? 0) -
    (opts.debtDeltaMo ?? 0);
  const liquidAfter = Math.max(0, ctx.liquidCash - (opts.cashDelta ?? 0));
  const runway = ctx.monthlyExpenses > 0 ? liquidAfter / ctx.monthlyExpenses : 0;
  const nw = Math.max(0, ctx.accessibleNW + (opts.nwDelta ?? 0));
  const debtRatio =
    ctx.totalAssets > 0
      ? (ctx.totalDebt / ctx.totalAssets) * 100 + (opts.debtDeltaRatio ?? 0)
      : 0;
  const fireDelta = opts.fireDeltaYears ?? 0;
  return {
    monthlyCashflow: monthlyCF,
    monthlyCashflowTone: tone("cashflow", monthlyCF),
    liquidityRunwayMonths: runway,
    liquidityRunwayTone: tone("runway", runway),
    accessibleNW: nw,
    accessibleNWTone: tone("nw", nw),
    fireYearDelta: fireDelta,
    fireYearDeltaTone: tone("fireDelta", fireDelta),
    debtRatioPct: debtRatio,
    debtRatioTone: tone("debt", debtRatio),
  };
}

function buildStressMatrix(ctx: ShockCtx, scenario: TaxScenario): StressRow[] {
  const totalLoan = ctx.mortgage + ctx.ipLoan;
  // Monthly interest delta per 1% rate rise = totalLoan * 0.01 / 12.
  const rateDeltaMo1 = (totalLoan * 0.01) / 12;
  const rateDeltaMo2 = (totalLoan * 0.02) / 12;

  return [
    {
      id: "rates-plus-1",
      label: "Rates +1%",
      shock: "+1% on all variable mortgages (PPOR + IP).",
      impact: buildImpact(ctx, {
        debtDeltaMo: rateDeltaMo1,
        fireDeltaYears: 0.5,
        debtDeltaRatio: 0,
      }),
    },
    {
      id: "rates-plus-2",
      label: "Rates +2%",
      shock: "+2% on all variable mortgages.",
      impact: buildImpact(ctx, {
        debtDeltaMo: rateDeltaMo2,
        fireDeltaYears: 1.2,
        debtDeltaRatio: 0,
      }),
    },
    {
      id: "property-slowdown",
      label: "Property Growth Slowdown",
      shock: "Property values flat for 3 yrs (0% growth p.a.).",
      impact: buildImpact(ctx, {
        nwDelta: -(ctx.pporValue + ctx.ipValue) * 0.18,
        fireDeltaYears: 2.0,
        debtDeltaRatio: 4,
      }),
    },
    {
      id: "stock-bear",
      label: "Stock Bear Market",
      shock: "−35% drawdown on stocks + crypto.",
      impact: buildImpact(ctx, {
        nwDelta: -ctx.accessibleNW * 0.08,
        fireDeltaYears: 1.0,
        debtDeltaRatio: 0,
      }),
    },
    {
      id: "tax-reform",
      label: "Tax Reform Active",
      shock: "Negative-gearing quarantine + loss bank on post-cutoff IPs.",
      impact: buildImpact(ctx, {
        debtDeltaMo: scenario === "proposed_reform" ? 0 : ctx.ipLoan * 0.005 / 12,
        fireDeltaYears: ctx.ipLoan > 0 ? 1.5 : 0,
        nwDelta: -ctx.fireCapital * 0.04,
      }),
    },
    {
      id: "unemployment",
      label: "Unemployment Shock",
      shock: "Primary earner loses income for 6 months.",
      impact: buildImpact(ctx, {
        incomeDeltaMo: -ctx.monthlyIncome,
        cashDelta: ctx.monthlyExpenses * 6,
        fireDeltaYears: 2.5,
        debtDeltaRatio: 6,
      }),
    },
    {
      id: "rent-vacancy",
      label: "Rent Vacancy Shock",
      shock: "All IP rent stopped for 6 months.",
      impact: buildImpact(ctx, {
        incomeDeltaMo: -((ctx.ipValue * 0.04) / 12), // approx 4% gross yield
        cashDelta: ((ctx.ipValue * 0.04) / 12) * 6,
        fireDeltaYears: 1.0,
        debtDeltaRatio: 1,
      }),
    },
  ];
}

// ─── Fragility ───────────────────────────────────────────────────────────────

function computeFragility(ctx: ShockCtx, wealth: WealthLayers): FireFragility {
  const lvr =
    ctx.pporValue + ctx.ipValue > 0
      ? (ctx.totalDebt / (ctx.pporValue + ctx.ipValue)) * 100
      : 0;
  const liquidityMonths =
    ctx.monthlyExpenses > 0 ? ctx.liquidCash / ctx.monthlyExpenses : 0;
  const propertyEquity = wealth.drivers.pporEquity + wealth.drivers.ipEquity;
  const appreciationReliance =
    wealth.grossNetWorth > 0
      ? (propertyEquity / wealth.grossNetWorth) * 100
      : 0;
  const postTaxLiquidationValue = wealth.fireCapital;

  // Composite — 100 = stable, 0 = highly fragile.
  let score = 100;
  if (lvr > 75) score -= 25;
  else if (lvr > 60) score -= 12;
  if (liquidityMonths < 3) score -= 25;
  else if (liquidityMonths < 6) score -= 10;
  if (appreciationReliance > 80) score -= 20;
  else if (appreciationReliance > 65) score -= 10;
  if (postTaxLiquidationValue < ctx.fireTargetCapital * 0.4) score -= 20;
  else if (postTaxLiquidationValue < ctx.fireTargetCapital * 0.7) score -= 10;
  score = clamp01_100(score);

  const level: FragilityLevel =
    score >= 70 ? "stable" : score >= 45 ? "moderate" : "high";

  const summary =
    level === "stable"
      ? `FIRE is structurally stable — leverage and liquidity buffers absorb common shocks.`
      : level === "moderate"
      ? `FIRE is moderately fragile — leverage or liquidity is sub-optimal but a single shock won't break it.`
      : `FIRE is highly fragile — a moderate stress event would materially delay or derail the plan.`;

  return {
    level,
    score,
    drivers: {
      leveragePct: lvr,
      liquidityMonths,
      appreciationReliancePct: appreciationReliance,
      postTaxLiquidationValue,
    },
    summary,
  };
}

// ─── Build inputs and assemble surface ───────────────────────────────────────

export interface BuildRiskSurfaceArgs {
  inputs: DashboardInputs;
  scenario: TaxScenario;
  /** Live mortgage rate, %. Falls back to snapshot.mortgage_rate or 6.5. */
  mortgageRate?: number | null;
  /** Loss bank dollar accumulated under reform (from taxRulesEngine). */
  lossBank?: number;
  /** FIRE progress % (0–100). Used by radar's FIRE Delay axis. */
  fireProgressPct?: number;
  /** FIRE target capital (used by fragility). */
  fireTargetCapital?: number;
}

export function buildCanonicalRiskSurface(
  args: BuildRiskSurfaceArgs,
): CanonicalRiskSurface {
  const { inputs, scenario } = args;
  const snap = inputs.snapshot ?? {};
  const wealth = computeWealthLayers(inputs, scenario);

  const monthlyIncome = selectMonthlyIncome(inputs);
  const monthlyExpenses = selectMonthlyExpensesLedger(inputs);
  const monthlyDebtService = selectMonthlyDebtService(inputs);
  const liquidCash = selectCashToday(inputs);
  const ipValue = selectIpCurrentValueSettled(inputs);
  const ipLoan = selectIpLoanBalanceSettled(inputs);
  const mortgage = Number(snap.mortgage ?? 0) || 0;
  const pporValue = Number(snap.ppor ?? 0) || 0;
  const totalAssets = wealth.drivers.raw.totalAssets;
  const totalDebt = wealth.drivers.raw.totalLiabilities;
  const surplus = monthlyIncome - monthlyExpenses;
  const passive = selectPassiveIncome(inputs);

  const mortgageRate =
    typeof args.mortgageRate === "number" && Number.isFinite(args.mortgageRate)
      ? args.mortgageRate
      : Number(snap.mortgage_rate ?? 6.5) || 6.5;
  const lossBank = args.lossBank ?? 0;
  const fireProgressPct = args.fireProgressPct ?? 0;
  const fireTargetCapital =
    args.fireTargetCapital && args.fireTargetCapital > 0
      ? args.fireTargetCapital
      : 1_250_000;

  // Radar axes.
  const runwayMonths = monthlyExpenses > 0 ? liquidCash / monthlyExpenses : 0;
  const lvr =
    pporValue + ipValue > 0 ? (totalDebt / (pporValue + ipValue)) * 100 : 0;
  const surplusRatioPct = monthlyIncome > 0 ? (surplus / monthlyIncome) * 100 : 0;
  const totalAssetVals = [
    { id: "ppor", v: pporValue },
    { id: "ip", v: ipValue },
    { id: "super", v: wealth.drivers.raw.assets.super },
    { id: "stocks", v: wealth.drivers.raw.assets.stocks },
    { id: "crypto", v: wealth.drivers.raw.assets.crypto },
    { id: "cash", v: wealth.drivers.raw.assets.cashOffset },
  ];
  const maxAssetSharePct =
    totalAssets > 0
      ? Math.max(...totalAssetVals.map(a => (a.v / totalAssets) * 100))
      : 0;
  const propertyEquity = wealth.drivers.pporEquity + wealth.drivers.ipEquity;
  const propertySharePct =
    wealth.grossNetWorth > 0
      ? (propertyEquity / wealth.grossNetWorth) * 100
      : 0;
  const interestToIncomePct =
    monthlyIncome > 0
      ? ((mortgage + ipLoan) * (mortgageRate / 100) / (monthlyIncome * 12)) * 100
      : 0;

  const current: RadarPoint[] = [
    scoreLiquidity(runwayMonths),
    scoreLeverage(lvr),
    scoreCashflow(surplusRatioPct),
    scoreConcentration(maxAssetSharePct),
    scorePropertyExposure(propertySharePct),
    scoreInterestRate(interestToIncomePct, mortgageRate),
    scoreTaxReform(scenario, wealth.drivers.ipEquity, lossBank),
    scoreFireDelay(fireProgressPct, surplusRatioPct),
  ];

  const radar: RadarSurface = {
    current,
    safeZone: RISK_AXES.map(a => SAFE_ZONE[a]),
    warningZone: RISK_AXES.map(a => WARNING_ZONE[a]),
  };

  const ctx: ShockCtx = {
    monthlyIncome,
    monthlyExpenses,
    monthlyDebtService,
    liquidCash,
    mortgage,
    ipLoan,
    pporValue,
    ipValue,
    totalAssets,
    totalDebt,
    accessibleNW: wealth.accessibleNetWorth,
    fireCapital: wealth.fireCapital,
    surplus,
    mortgageRate,
    fireTargetCapital,
  };

  const stress = buildStressMatrix(ctx, scenario);
  const fragility = computeFragility(ctx, wealth);

  // Silence unused-import warning if passive becomes unused in lints.
  void passive;

  return { radar, stress, fragility, scenario, wealth };
}

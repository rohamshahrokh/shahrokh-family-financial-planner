/**
 * goalLab/inferences.ts — lightweight, grounded inference helpers for Goal Lab.
 *
 * Scope: UI-foundation phase. These helpers exist ONLY to give the Goal Lab
 * cards an honest, defensible first answer to show the user. They are NOT a
 * recommendation engine, NOT an agent, and NOT an autonomous planner.
 *
 * Each function:
 *   • reads from already-canonical selectors (canonicalHeadlineMetrics,
 *     canonicalDebtService, dashboardDataContract);
 *   • returns a small, transparent shape with the inputs that drove the
 *     result so the UI can show "why we suggested this";
 *   • produces a stable answer for the same inputs (pure function);
 *   • returns `null` rather than inventing data when inputs are missing.
 *
 * Everything heavier (forecasts, MC, scenario re-rank, recommendationEngine)
 * stays out. When the engine integration phase begins these helpers either
 * stay as-is or are replaced by their canonical counterparts; nothing else
 * changes.
 */

import type { DashboardInputs } from "@/lib/dashboardDataContract";
import {
  selectMonthlySurplus,
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectMonthlyDebtService,
  selectCanonicalNetWorth,
  selectPropertyEquity,
  selectStocksTotal,
  selectCryptoTotal,
  selectCashToday,
  selectIpLoanBalanceSettled,
  selectIpCurrentValueSettled,
} from "@/lib/dashboardDataContract";

/* ────────────────────────────────────────────────────────────────────────── */
/* Q3 — Capital structure snapshot                                            */
/* ────────────────────────────────────────────────────────────────────────── */

export interface CapitalStructureSnapshot {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  liquidity: number;
  /** LVR across settled IPs (loan / value), 0 if no IPs. */
  leverage: number;
  leverageBand: "conservative" | "moderate" | "elevated" | "high" | "n/a";
  source: "dashboard_data_contract";
}

export function buildCapitalStructureSnapshot(
  inputs: DashboardInputs,
): CapitalStructureSnapshot | null {
  if (!inputs.snapshot) return null;
  const nw = selectCanonicalNetWorth(inputs);
  const liquidity = selectCashToday(inputs);
  const ipValue = selectIpCurrentValueSettled(inputs);
  const ipLoan = selectIpLoanBalanceSettled(inputs);
  const lvr = ipValue > 0 ? ipLoan / ipValue : 0;
  const band: CapitalStructureSnapshot["leverageBand"] =
    ipValue === 0 ? "n/a" :
    lvr < 0.3 ? "conservative" :
    lvr < 0.5 ? "moderate" :
    lvr < 0.7 ? "elevated" :
    "high";
  return {
    netWorth: nw.netWorth,
    totalAssets: nw.totalAssets,
    totalLiabilities: nw.totalLiabilities,
    liquidity,
    leverage: lvr,
    leverageBand: band,
    source: "dashboard_data_contract",
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Q4 — Wealth-engine mix (where the growth is coming from)                   */
/* ────────────────────────────────────────────────────────────────────────── */

export interface WealthEngineMix {
  /** % of net worth from active income surplus, capitalised over a 12m view. */
  salaryAndBonusesPct: number;
  /** % of net worth held as property equity. */
  propertyPct: number;
  /** % of net worth held as listed investments (stocks + crypto + super). */
  investmentsPct: number;
  label: "hybrid" | "income-led" | "property-led" | "investment-led" | "balanced";
  convictionTag: "low" | "medium" | "high";
  source: "dashboard_data_contract";
}

export function buildWealthEngineMix(
  inputs: DashboardInputs,
): WealthEngineMix | null {
  if (!inputs.snapshot) return null;
  const nw = selectCanonicalNetWorth(inputs);
  if (nw.netWorth <= 0) return null;

  const propertyEquity = selectPropertyEquity(inputs);
  const stocks = selectStocksTotal(inputs);
  const crypto = selectCryptoTotal(inputs);
  const superCombined =
    (inputs.snapshot.super_roham ?? 0) + (inputs.snapshot.super_fara ?? 0);
  const investments = stocks + crypto + superCombined;

  // Capitalise 12m of surplus into a comparable "income-engine" base.
  const surplus12m = selectMonthlySurplus(inputs) * 12;
  const base = Math.max(propertyEquity + investments + Math.max(surplus12m, 0), 1);

  const propertyPct = (propertyEquity / base) * 100;
  const investmentsPct = (investments / base) * 100;
  const salaryAndBonusesPct = 100 - propertyPct - investmentsPct;

  const top = Math.max(propertyPct, investmentsPct, salaryAndBonusesPct);
  const label: WealthEngineMix["label"] =
    top < 45 ? "balanced" :
    top === salaryAndBonusesPct ? "income-led" :
    top === propertyPct ? "property-led" :
    top === investmentsPct ? "investment-led" :
    "hybrid";

  // Conviction = how concentrated the top engine is. >=60% → high.
  const conviction: WealthEngineMix["convictionTag"] =
    top >= 60 ? "high" : top >= 45 ? "medium" : "low";

  return {
    salaryAndBonusesPct: Math.max(0, salaryAndBonusesPct),
    propertyPct,
    investmentsPct,
    label,
    convictionTag: conviction,
    source: "dashboard_data_contract",
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Q5 — Risk capacity (NOT tolerance — how much the plan can absorb)          */
/* ────────────────────────────────────────────────────────────────────────── */

export interface RiskCapacityInference {
  drawdownToleranceP: number;
  incomeLossEnduranceMonths: number;
  band: "low" | "medium_low" | "medium" | "medium_high" | "high";
  leverageComfort: "conservative" | "moderate" | "aggressive";
  source: "derived_from_ledger";
}

export function inferRiskCapacity(
  inputs: DashboardInputs,
): RiskCapacityInference | null {
  if (!inputs.snapshot) return null;

  const monthlyIncome = selectMonthlyIncome(inputs);
  const monthlyExpenses = selectMonthlyExpensesLedger(inputs);
  const debtService = selectMonthlyDebtService(inputs);
  const liquidity = selectCashToday(inputs);
  const nw = selectCanonicalNetWorth(inputs);
  if (nw.netWorth <= 0 || monthlyExpenses <= 0) return null;

  // Drawdown plan can absorb: liquid buffer relative to invested base.
  // Sprint 31D: use canonical NW (nw.assets.ppor) instead of the stale
  // `snapshot.ppor_value` field which does not exist in sf_snapshot.
  // The previous misspelled key caused PPOR equity to be counted as invested,
  // collapsing drawdownP and pinning risk capacity to "low" on real households.
  const invested = Math.max(
    nw.totalAssets - liquidity - nw.assets.ppor,
    1,
  );
  const drawdownP = Math.min(0.6, Math.max(0.1, liquidity / invested));

  // Months of expenses + debt service liquidity covers if income stopped.
  const monthlyBurn = monthlyExpenses + debtService;
  const runway = monthlyBurn > 0 ? liquidity / monthlyBurn : 0;
  const monthsEndurable = Math.round(runway);

  // Band from the weaker of the two.
  const band: RiskCapacityInference["band"] =
    runway < 3 || drawdownP < 0.15 ? "low" :
    runway < 6 || drawdownP < 0.25 ? "medium_low" :
    runway < 12 || drawdownP < 0.35 ? "medium" :
    runway < 24 || drawdownP < 0.45 ? "medium_high" :
    "high";

  const dsRatio = monthlyIncome > 0 ? debtService / monthlyIncome : 1;
  const leverageComfort: RiskCapacityInference["leverageComfort"] =
    dsRatio < 0.2 ? "aggressive" :
    dsRatio < 0.35 ? "moderate" :
    "conservative";

  return {
    drawdownToleranceP: drawdownP,
    incomeLossEnduranceMonths: monthsEndurable,
    band,
    leverageComfort,
    source: "derived_from_ledger",
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Q6 — Preference vector (the hybrid card; signals → speed/safety/flex/life) */
/* ────────────────────────────────────────────────────────────────────────── */

export interface PreferenceVectorInference {
  speed: number;
  safety: number;
  flexibility: number;
  lifestyle: number;
  /** Single English summary the card surfaces above the radar. */
  primaryDriver:
    | "savings_rate_and_cashflow"
    | "liquidity_buffer"
    | "leverage_headroom"
    | "lifestyle_protection"
    | "balanced";
  signals: {
    liquidityStressBand: "green" | "amber" | "red" | null;
    leveragePressureBand: "green" | "amber" | "red" | null;
    savingsConsistencyBand: "low" | "medium" | "high" | null;
    /** Inferred from ratio of risk assets to net worth. */
    inferredVolatilityTolerance: "low" | "medium" | "high" | null;
    /** Behavioural blocker hook is left null for now — wired later. */
    behaviouralBlocker: null;
  };
  source: "system_inferred";
}

/**
 * Tiny, grounded preference-vector inference. Five signals, deterministic
 * scoring, normalised to sum to 1.0. No engine calls.
 */
export function inferPreferenceVector(
  inputs: DashboardInputs,
): PreferenceVectorInference | null {
  if (!inputs.snapshot) return null;

  const monthlyIncome = selectMonthlyIncome(inputs);
  const monthlyExpenses = selectMonthlyExpensesLedger(inputs);
  const monthlySurplus = selectMonthlySurplus(inputs);
  const debtService = selectMonthlyDebtService(inputs);
  const liquidity = selectCashToday(inputs);
  const nw = selectCanonicalNetWorth(inputs);
  const ipValue = selectIpCurrentValueSettled(inputs);
  const ipLoan = selectIpLoanBalanceSettled(inputs);

  if (nw.netWorth <= 0 || monthlyExpenses <= 0) return null;

  // Signal 1 — liquidity stress (months of runway).
  const runway = (monthlyExpenses + debtService) > 0
    ? liquidity / (monthlyExpenses + debtService)
    : 0;
  const liquidityStressBand: "green" | "amber" | "red" =
    runway < 3 ? "red" : runway < 6 ? "amber" : "green";

  // Signal 2 — leverage pressure (DSR + LVR).
  const dsr = monthlyIncome > 0 ? debtService / monthlyIncome : 0;
  const lvr = ipValue > 0 ? ipLoan / ipValue : 0;
  const leveragePressureBand: "green" | "amber" | "red" =
    dsr > 0.45 || lvr > 0.7 ? "red" :
    dsr > 0.3 || lvr > 0.55 ? "amber" : "green";

  // Signal 3 — savings consistency (savings rate proxy from current month).
  const savingsRate = monthlyIncome > 0 ? monthlySurplus / monthlyIncome : 0;
  const savingsConsistencyBand: "low" | "medium" | "high" =
    savingsRate < 0.1 ? "low" : savingsRate < 0.25 ? "medium" : "high";

  // Signal 4 — inferred volatility tolerance from current risk-asset mix.
  const stocks = selectStocksTotal(inputs);
  const crypto = selectCryptoTotal(inputs);
  const riskAssetPct = nw.totalAssets > 0
    ? (stocks + crypto) / nw.totalAssets
    : 0;
  const inferredVolatilityTolerance: "low" | "medium" | "high" =
    riskAssetPct < 0.1 ? "low" : riskAssetPct < 0.3 ? "medium" : "high";

  // Start from a balanced base, push by signals.
  let speed = 0.25, safety = 0.25, flexibility = 0.25, lifestyle = 0.25;

  if (liquidityStressBand === "red")    { safety += 0.20; lifestyle -= 0.10; }
  else if (liquidityStressBand === "amber") { safety += 0.08; flexibility += 0.04; }
  else                                  { flexibility += 0.04; }

  if (leveragePressureBand === "red")   { safety += 0.15; speed -= 0.10; }
  else if (leveragePressureBand === "amber") { safety += 0.06; }
  else                                  { speed += 0.04; }

  if (savingsConsistencyBand === "high")   { speed += 0.12; }
  else if (savingsConsistencyBand === "low") { lifestyle += 0.08; safety += 0.04; }

  if (inferredVolatilityTolerance === "high")     { speed += 0.06; }
  else if (inferredVolatilityTolerance === "low") { safety += 0.06; }

  // Floor everything at 0.05, then normalise.
  const raw = { speed, safety, flexibility, lifestyle };
  const floored = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Math.max(0.05, v)]),
  ) as typeof raw;
  const sum = floored.speed + floored.safety + floored.flexibility + floored.lifestyle;
  const norm = (x: number) => Math.round((x / sum) * 100) / 100;

  const vector = {
    speed: norm(floored.speed),
    safety: norm(floored.safety),
    flexibility: norm(floored.flexibility),
    lifestyle: norm(floored.lifestyle),
  };

  // English primary driver (used in the inferred-summary chip above the radar).
  const dominant = (Object.entries(vector) as Array<[keyof typeof vector, number]>)
    .sort((a, b) => b[1] - a[1])[0][0];
  const primaryDriver: PreferenceVectorInference["primaryDriver"] =
    leveragePressureBand === "red" ? "leverage_headroom" :
    liquidityStressBand === "red"  ? "liquidity_buffer" :
    dominant === "speed"           ? "savings_rate_and_cashflow" :
    dominant === "lifestyle"       ? "lifestyle_protection" :
    "balanced";

  return {
    ...vector,
    primaryDriver,
    signals: {
      liquidityStressBand,
      leveragePressureBand,
      savingsConsistencyBand,
      inferredVolatilityTolerance,
      behaviouralBlocker: null,
    },
    source: "system_inferred",
  };
}

export function primaryDriverCopy(
  d: PreferenceVectorInference["primaryDriver"],
): string {
  switch (d) {
    case "savings_rate_and_cashflow":
      return "Savings rate & cashflow";
    case "liquidity_buffer":
      return "Liquidity buffer";
    case "leverage_headroom":
      return "Leverage headroom";
    case "lifestyle_protection":
      return "Lifestyle protection";
    case "balanced":
      return "Balanced across goals";
  }
}

/**
 * actionRoadmap/stressFailureAnalysis.ts — Sprint 28B.
 *
 * Wraps engine stress probabilities into the UI-ready failure-points list
 * surfaced by Action Roadmap §S6. THIS MODULE PERFORMS NO MC. It reads
 * probabilities the engine already produced and bands them by severity.
 *
 * Severity bands (deterministic, documented):
 *   prob < 0.05   → low
 *   prob < 0.20   → medium
 *   prob ≥ 0.20   → high
 *   prob null     → unknown    (UI renders "Not modelled yet")
 *
 * Honesty rules:
 *   - When the engine did NOT produce a probability, severity is "unknown"
 *     and probability stays null — never 0.
 *   - Rate shock / income reduction / property under-performance / ETF
 *     under-performance rows exist only when a matching softWarning is
 *     present. Otherwise the row carries null + "Not modelled yet".
 */
import type { ExtendedScenarioResult } from "../scenarioV2/runScenario";
import type { SoftWarning } from "../scenarioV2/decisionEngine/candidateGenerator";

export type FailurePointId =
  | "default_insolvency"
  | "liquidity_stress"
  | "negative_equity"
  | "refinance_pressure"
  | "forced_sales"
  | "rate_shock"
  | "income_reduction"
  | "property_underperformance"
  | "etf_underperformance";

export type Severity = "low" | "medium" | "high" | "unknown";

export interface FailurePoint {
  id: FailurePointId;
  label: string;
  probability: number | null;
  severity: Severity;
  detail: string;
  driver: string;
}

export interface StressFailureInput {
  result: ExtendedScenarioResult | null;
  softWarnings?: SoftWarning[];
}

function bandFor(prob: number | null): Severity {
  if (prob == null || !Number.isFinite(prob)) return "unknown";
  if (prob < 0.05) return "low";
  if (prob < 0.20) return "medium";
  return "high";
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function findWarning(softWarnings: SoftWarning[] | undefined, idMatch: RegExp, driverMatch?: RegExp): SoftWarning | null {
  if (!softWarnings || softWarnings.length === 0) return null;
  for (const w of softWarnings) {
    if (idMatch.test(w.id ?? "")) return w;
    if (driverMatch && driverMatch.test(w.driver ?? "")) return w;
    if (driverMatch && driverMatch.test(w.label ?? "")) return w;
  }
  return null;
}

function notModelled(id: FailurePointId, label: string, driver: string): FailurePoint {
  return { id, label, probability: null, severity: "unknown", detail: "Not modelled yet", driver };
}

export function selectFailureAnalysis(input: StressFailureInput): FailurePoint[] {
  const { result, softWarnings } = input;
  if (!result) {
    return [
      notModelled("default_insolvency", "Default / insolvency", "engine"),
      notModelled("liquidity_stress",   "Liquidity stress", "engine"),
      notModelled("negative_equity",    "Negative equity", "engine"),
      notModelled("refinance_pressure", "Refinance pressure", "engine"),
      notModelled("forced_sales",       "Forced asset sales", "engine"),
      notModelled("rate_shock",         "Rate shock", "softWarnings"),
      notModelled("income_reduction",   "Income reduction", "softWarnings"),
      notModelled("property_underperformance", "Property under-performance", "softWarnings"),
      notModelled("etf_underperformance",      "ETF under-performance", "softWarnings"),
    ];
  }

  const out: FailurePoint[] = [];

  // 1. Default / insolvency
  const defaultProb = num(result.defaultProbability);
  out.push({
    id: "default_insolvency",
    label: "Default / insolvency",
    probability: defaultProb,
    severity: bandFor(defaultProb),
    detail: defaultProb != null
      ? result.medianDefaultMonth != null
        ? `Engine modelled ${(defaultProb * 100).toFixed(1)}% chance of insolvency; median onset around month ${result.medianDefaultMonth}.`
        : `Engine modelled ${(defaultProb * 100).toFixed(1)}% chance of insolvency over the horizon.`
      : "Not modelled yet",
    driver: "result.defaultProbability",
  });

  // 2. Liquidity stress
  const liquidityProb = num(result.liquidityExhaustionProbability);
  out.push({
    id: "liquidity_stress",
    label: "Liquidity stress",
    probability: liquidityProb,
    severity: bandFor(liquidityProb),
    detail: liquidityProb != null
      ? result.medianLiquidityFirstMonth != null
        ? `Cash exhausted in ${(liquidityProb * 100).toFixed(1)}% of sims; median onset month ${result.medianLiquidityFirstMonth}.`
        : `Cash exhausted in ${(liquidityProb * 100).toFixed(1)}% of sims.`
      : "Not modelled yet",
    driver: "result.liquidityExhaustionProbability",
  });

  // 3. Negative equity
  const negEqProb = num(result.negativeEquityProbability);
  out.push({
    id: "negative_equity",
    label: "Negative equity",
    probability: negEqProb,
    severity: bandFor(negEqProb),
    detail: negEqProb != null
      ? result.medianNegEquityFirstMonth != null
        ? `Property loan exceeded value in ${(negEqProb * 100).toFixed(1)}% of sims; median onset month ${result.medianNegEquityFirstMonth}.`
        : `Property loan exceeded value in ${(negEqProb * 100).toFixed(1)}% of sims.`
      : "Not modelled yet",
    driver: "result.negativeEquityProbability",
  });

  // 4. Refinance pressure
  const refiProb = num(result.refinancePressureProbability);
  out.push({
    id: "refinance_pressure",
    label: "Refinance pressure",
    probability: refiProb,
    severity: bandFor(refiProb),
    detail: refiProb != null
      ? `Serviceability fell below safe refinance margins in ${(refiProb * 100).toFixed(1)}% of sims.`
      : "Not modelled yet",
    driver: "result.refinancePressureProbability",
  });

  // 5. Forced sales
  const forced = result.forcedSaleReport;
  const forcedProb = forced ? num(forced.triggerProbability) : null;
  out.push({
    id: "forced_sales",
    label: "Forced asset sales",
    probability: forcedProb,
    severity: bandFor(forcedProb),
    detail: forcedProb != null && forced
      ? `Asset sale forced in ${(forcedProb * 100).toFixed(1)}% of sims; median proceeds $${Math.round(forced.medianForcedSaleProceeds).toLocaleString("en-AU")}.`
      : "Not modelled yet",
    driver: "result.forcedSaleReport",
  });

  // 6. Rate shock — softWarning-driven
  const rateWarn = findWarning(softWarnings, /(rate|interest|repricing)/i, /(rate|interest)/i);
  out.push(
    rateWarn
      ? {
          id: "rate_shock",
          label: "Rate shock",
          probability: null,
          severity: rateWarn.severity === "critical" ? "high" : rateWarn.severity === "warn" ? "medium" : "low",
          detail: rateWarn.detail ?? rateWarn.label ?? "Rate-related soft warning fired.",
          driver: `softWarnings.${rateWarn.id ?? rateWarn.driver}`,
        }
      : notModelled("rate_shock", "Rate shock", "softWarnings"),
  );

  // 7. Income reduction — softWarning-driven
  const incomeWarn = findWarning(softWarnings, /(income|wage|salary|career)/i, /(income|wage)/i);
  out.push(
    incomeWarn
      ? {
          id: "income_reduction",
          label: "Income reduction",
          probability: null,
          severity: incomeWarn.severity === "critical" ? "high" : incomeWarn.severity === "warn" ? "medium" : "low",
          detail: incomeWarn.detail ?? incomeWarn.label ?? "Income-related soft warning fired.",
          driver: `softWarnings.${incomeWarn.id ?? incomeWarn.driver}`,
        }
      : notModelled("income_reduction", "Income reduction", "softWarnings"),
  );

  // 8. Property under-performance — softWarning-driven
  const propWarn = findWarning(softWarnings, /(property|prop-)/i, /(property|growth)/i);
  out.push(
    propWarn
      ? {
          id: "property_underperformance",
          label: "Property under-performance",
          probability: null,
          severity: propWarn.severity === "critical" ? "high" : propWarn.severity === "warn" ? "medium" : "low",
          detail: propWarn.detail ?? propWarn.label ?? "Property-related soft warning fired.",
          driver: `softWarnings.${propWarn.id ?? propWarn.driver}`,
        }
      : notModelled("property_underperformance", "Property under-performance", "softWarnings"),
  );

  // 9. ETF under-performance — softWarning-driven
  const etfWarn = findWarning(softWarnings, /(etf|equity|stock|market)/i, /(etf|equity|return)/i);
  out.push(
    etfWarn
      ? {
          id: "etf_underperformance",
          label: "ETF under-performance",
          probability: null,
          severity: etfWarn.severity === "critical" ? "high" : etfWarn.severity === "warn" ? "medium" : "low",
          detail: etfWarn.detail ?? etfWarn.label ?? "ETF-related soft warning fired.",
          driver: `softWarnings.${etfWarn.id ?? etfWarn.driver}`,
        }
      : notModelled("etf_underperformance", "ETF under-performance", "softWarnings"),
  );

  return out;
}

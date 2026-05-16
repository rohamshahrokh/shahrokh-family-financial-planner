/**
 * PART 3 — Macro Regime Awareness Engine.
 *
 * Deterministic classifier over caller-supplied macro signals. When signals
 * are not provided we fall back to the engine's BasePlan assumptions
 * (mortgageRate, inflation) and surface a "neutral" classification with
 * lower confidence — never invents external data.
 */

import type { BasePlanAssumptions } from "../types";
import type { MacroRegime, MacroRegimeSignals, RegimeClassification } from "./types";

const REGIME_LABELS: Record<MacroRegime, string> = {
  "falling-rates": "Falling-rates regime",
  "rising-rates": "Rising-rates regime",
  recession: "Recession",
  "liquidity-crisis": "Liquidity crisis",
  "inflationary-boom": "Inflationary boom",
  disinflation: "Disinflation",
  "property-boom": "Property boom",
  "equity-bear-market": "Equity bear market",
  "volatility-spike": "Volatility spike",
  "credit-tightening": "Credit tightening",
  neutral: "Neutral / mixed regime",
};

export interface ClassifyRegimeInput {
  signals?: MacroRegimeSignals;
  /** Falls back to BasePlan rails when signals are absent. */
  assumptions: BasePlanAssumptions;
}

export function classifyRegime(input: ClassifyRegimeInput): RegimeClassification {
  const { signals, assumptions } = input;
  const policyRate = signals?.policyRate ?? Math.max(0, assumptions.mortgageRate - 0.02);
  const inflation = signals?.inflation ?? assumptions.inflation;
  const mortgageRate = signals?.mortgageRate ?? assumptions.mortgageRate;
  const equityDrawdown = signals?.equityDrawdown ?? 0;
  const propertyYoy = signals?.propertyYoy ?? 0;
  const rateDirection = signals?.rateDirection ?? 0;
  const vix = signals?.vix ?? 0;

  const drivers: string[] = [];
  let regime: MacroRegime = "neutral";
  let rationale = "Macro signals do not point clearly to any single regime; deterministic baseline applied.";
  const implications: string[] = [];

  if (equityDrawdown >= 0.20) {
    regime = "equity-bear-market";
    rationale = `Equities are ${(equityDrawdown * 100).toFixed(0)}% off their recent peak — a confirmed bear-market drawdown.`;
    drivers.push("signals.equityDrawdown");
    implications.push("DCA efficiency tends to improve in extended drawdowns.");
    implications.push("Avoid forced sales of equities; defensive paths preferred while volatility persists.");
  } else if (vix >= 0.35) {
    regime = "volatility-spike";
    rationale = `Implied volatility proxy at ${(vix * 100).toFixed(0)}% suggests a near-term volatility shock.`;
    drivers.push("signals.vix");
    implications.push("Liquidity preservation outranks leverage expansion until volatility normalises.");
  } else if (rateDirection > 0 && inflation >= 0.04) {
    regime = "inflationary-boom";
    rationale = `Rates rising into persistent ${(inflation * 100).toFixed(1)}% inflation — classic inflationary-boom signature.`;
    drivers.push("signals.rateDirection", "signals.inflation");
    implications.push("Long-duration FIRE assumptions weaken under sticky inflation.");
    implications.push("Floating-rate debt becomes materially more expensive — favour fixed terms when available.");
  } else if (rateDirection > 0) {
    regime = "rising-rates";
    rationale = `Policy rate cycle is in a rising phase at ${(policyRate * 100).toFixed(1)}% with mortgage rate ${(mortgageRate * 100).toFixed(1)}%.`;
    drivers.push("signals.rateDirection", "assumptions.mortgageRate");
    implications.push("Rising-rate environments compress refinance windows.");
    implications.push("Avoid maximising leverage in early rising-rate phases.");
  } else if (rateDirection < 0) {
    regime = "falling-rates";
    rationale = `Rates moving lower from ${(policyRate * 100).toFixed(1)}% — falling-rate regime supportive of leveraged property and duration assets.`;
    drivers.push("signals.rateDirection");
    implications.push("Falling-rate environments historically improve leveraged property outcomes.");
    implications.push("Refinance windows tend to open as the cycle progresses.");
  } else if (inflation <= 0.02 && rateDirection !== 1) {
    regime = "disinflation";
    rationale = `Inflation at ${(inflation * 100).toFixed(1)}% with rates flat / easing — disinflationary backdrop.`;
    drivers.push("signals.inflation");
    implications.push("Real returns on cash improve; FIRE coverage benefits modestly.");
  } else if (propertyYoy >= 0.07) {
    regime = "property-boom";
    rationale = `Property up ${(propertyYoy * 100).toFixed(0)}% YoY — property boom conditions.`;
    drivers.push("signals.propertyYoy");
    implications.push("Increased sequence risk on new leverage; verify entry conditions versus historical norms.");
  } else if (mortgageRate >= 0.075 && inflation < 0.025) {
    regime = "credit-tightening";
    rationale = `Mortgage rate ${(mortgageRate * 100).toFixed(1)}% well above neutral while inflation cooling — credit-tightening conditions.`;
    drivers.push("assumptions.mortgageRate");
    implications.push("Borrowing windows are scarce; opportunistic, not strategic.");
  } else if (inflation < 0 || (equityDrawdown >= 0.10 && rateDirection < 0)) {
    regime = "recession";
    rationale = "Macro signals consistent with recessionary conditions.";
    drivers.push("signals.inflation", "signals.equityDrawdown");
    implications.push("Liquidity buffers materially outvalue marginal leverage in this regime.");
  } else {
    drivers.push("assumptions.mortgageRate", "assumptions.inflation");
    implications.push("Current settings favour balanced execution — no single regime dominates.");
  }

  const confidence = signals && Object.keys(signals).length >= 3 ? 0.75 : 0.45;

  return {
    regime,
    label: REGIME_LABELS[regime],
    confidence,
    rationale,
    implications,
    drivers,
  };
}

export const __REGIME_LABELS = REGIME_LABELS;

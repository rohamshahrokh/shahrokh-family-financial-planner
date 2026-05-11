/**
 * Family Wealth Lab — Assumption Registry (Layer 1 catalog)
 *
 * Single source of truth for every economic / regulatory / behavioural
 * assumption the engine consumes. Versioned, with provenance.
 *
 * Rules:
 *   1. Every assumption has an id, default, sanity-bounds, source, review date.
 *   2. `assertAssumptionsConsistent` runs at engine boot — flags any user
 *      override outside its registered range. We do NOT silently clamp:
 *      a nonsense assumption should fail loud, not produce garbage MC runs.
 *   3. Defaults align with `DEFAULT_ASSUMPTIONS` in basePlan.ts. If the two
 *      diverge, the test suite fails.
 */

import { DEFAULT_ASSUMPTIONS } from "../basePlan";
import type { BasePlanAssumptions } from "../types";

export type AssumptionCategory =
  | "macro" | "asset" | "tax" | "regulatory" | "behavioural";

export interface AssumptionSpec<T = number> {
  id: string;
  description: string;
  unit: string;
  defaultValue: T;
  range: { min: T; max: T };
  source: string;
  lastReviewed: string;        // ISO YYYY-MM-DD
  category: AssumptionCategory;
}

// Helpers for declaring entries
const A = (
  id: string,
  category: AssumptionCategory,
  description: string,
  unit: string,
  defaultValue: number,
  min: number,
  max: number,
  source: string,
  lastReviewed = "2026-05-11",
): AssumptionSpec<number> => ({
  id, category, description, unit, defaultValue,
  range: { min, max }, source, lastReviewed,
});

// ─────────────────────────────────────────────────────────────────────────────
// Macro
// ─────────────────────────────────────────────────────────────────────────────
export const MACRO_ASSUMPTIONS: Record<string, AssumptionSpec> = {
  "inflation.cpi.au": A(
    "inflation.cpi.au", "macro",
    "Australian CPI long-run inflation rate.",
    "decimal", DEFAULT_ASSUMPTIONS.inflation, 0.005, 0.10,
    "RBA target band midpoint + 10y trimmed mean",
  ),
  "incomeGrowth.au": A(
    "incomeGrowth.au", "macro",
    "Long-run wage growth (nominal).",
    "decimal", DEFAULT_ASSUMPTIONS.incomeGrowth, 0.00, 0.10,
    "ABS Wage Price Index 2014–2024",
  ),
  "expenseGrowth.au": A(
    "expenseGrowth.au", "macro",
    "Household expense growth (approximates CPI but may diverge).",
    "decimal", DEFAULT_ASSUMPTIONS.expenseGrowth, 0.00, 0.10,
    "ABS CPI selected expenditure groups",
  ),
  "cashApr.au": A(
    "cashApr.au", "macro",
    "Risk-free cash / HISA rate.",
    "decimal", DEFAULT_ASSUMPTIONS.cashApr, 0.00, 0.15,
    "RBA cash rate + retail margin",
  ),
  "mortgageRate.au": A(
    "mortgageRate.au", "macro",
    "Standard variable owner-occupier mortgage rate.",
    "decimal", DEFAULT_ASSUMPTIONS.mortgageRate, 0.02, 0.18,
    "Major bank SVR avg",
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Asset returns + volatility
// ─────────────────────────────────────────────────────────────────────────────
export const ASSET_ASSUMPTIONS: Record<string, AssumptionSpec> = {
  "stocks.return.expected": A(
    "stocks.return.expected", "asset",
    "Expected long-run equity return (ASX/MSCI blend).",
    "decimal", DEFAULT_ASSUMPTIONS.stockReturn, 0.02, 0.18,
    "ASX 30y total return + Morningstar global blend",
  ),
  "stocks.volatility": A(
    "stocks.volatility", "asset",
    "Equity annualised volatility.",
    "decimal", DEFAULT_ASSUMPTIONS.stockVol, 0.05, 0.50,
    "ASX/MSCI 30y stdev",
  ),
  "crypto.return.expected": A(
    "crypto.return.expected", "asset",
    "Expected crypto return — large speculative premium.",
    "decimal", DEFAULT_ASSUMPTIONS.cryptoReturn, -0.10, 0.50,
    "BTC/ETH 10y blended; treated as speculative",
  ),
  "crypto.volatility": A(
    "crypto.volatility", "asset",
    "Crypto annualised volatility (fat-tailed in MC).",
    "decimal", DEFAULT_ASSUMPTIONS.cryptoVol, 0.20, 1.50,
    "BTC/ETH 10y stdev",
  ),
  "property.growth.expected": A(
    "property.growth.expected", "asset",
    "Long-run residential capital growth (national blend).",
    "decimal", DEFAULT_ASSUMPTIONS.propertyGrowth, 0.00, 0.12,
    "CoreLogic Home Value Index 30y",
  ),
  "property.volatility": A(
    "property.volatility", "asset",
    "Residential property annualised volatility.",
    "decimal", DEFAULT_ASSUMPTIONS.propertyVol, 0.01, 0.20,
    "CoreLogic capital city dispersion",
  ),
  "super.return.expected": A(
    "super.return.expected", "asset",
    "Expected long-run balanced super fund return.",
    "decimal", DEFAULT_ASSUMPTIONS.superReturn, 0.02, 0.15,
    "Chant West 30y growth fund median",
  ),
  "super.volatility": A(
    "super.volatility", "asset",
    "Balanced super fund volatility.",
    "decimal", DEFAULT_ASSUMPTIONS.superVol, 0.02, 0.20,
    "Chant West stdev",
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Tax (FY26)
// ─────────────────────────────────────────────────────────────────────────────
export const TAX_ASSUMPTIONS: Record<string, AssumptionSpec> = {
  "tax.cgt.discount": A(
    "tax.cgt.discount", "tax",
    "CGT discount for assets held > 12 months.",
    "decimal", 0.50, 0.50, 0.50,
    "ATO Division 115 — fixed",
  ),
  "tax.super.concessionalCap": A(
    "tax.super.concessionalCap", "tax",
    "Annual concessional contributions cap (FY26).",
    "AUD", 30_000, 30_000, 30_000,
    "ATO FY26 — fixed",
  ),
  "tax.super.nonConcessionalCap": A(
    "tax.super.nonConcessionalCap", "tax",
    "Annual non-concessional contributions cap (FY26).",
    "AUD", 120_000, 120_000, 120_000,
    "ATO FY26 — fixed",
  ),
  "tax.super.div293Threshold": A(
    "tax.super.div293Threshold", "tax",
    "Div 293 high-income threshold.",
    "AUD", 250_000, 250_000, 250_000,
    "ATO Div 293 — fixed",
  ),
  "tax.super.guaranteeRate": A(
    "tax.super.guaranteeRate", "tax",
    "Super Guarantee rate (FY26 = 11.5%, FY27 = 12%).",
    "decimal", 0.115, 0.115, 0.12,
    "ATO SG schedule",
  ),
  "tax.super.contributionsTax": A(
    "tax.super.contributionsTax", "tax",
    "Tax on concessional contributions in super fund.",
    "decimal", 0.15, 0.15, 0.15,
    "ATO — fixed",
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Regulatory (APRA + LMI)
// ─────────────────────────────────────────────────────────────────────────────
export const REGULATORY_ASSUMPTIONS: Record<string, AssumptionSpec> = {
  "apra.serviceabilityBuffer": A(
    "apra.serviceabilityBuffer", "regulatory",
    "APRA serviceability buffer added to assessment rate.",
    "decimal", 0.03, 0.025, 0.05,
    "APRA APG 223 §39 (current 3.0%)",
  ),
  "apra.rentalShading": A(
    "apra.rentalShading", "regulatory",
    "Rental income shading factor (banks discount gross rent).",
    "decimal", 0.80, 0.70, 0.90,
    "APRA APG 223 — typical 75-80%",
  ),
  "apra.dtiHighScrutiny": A(
    "apra.dtiHighScrutiny", "regulatory",
    "DTI multiplier beyond which banks scrutinise heavily.",
    "multiplier", 6.0, 5.0, 8.0,
    "APRA prudential expectations",
  ),
  "apra.dtiCap": A(
    "apra.dtiCap", "regulatory",
    "DTI multiplier beyond which banks usually refuse.",
    "multiplier", 8.0, 7.0, 9.0,
    "APRA macroprudential limits",
  ),
  "lmi.lvrThreshold": A(
    "lmi.lvrThreshold", "regulatory",
    "LVR above which LMI is required.",
    "ratio", 0.80, 0.80, 0.80,
    "Standard AU LMI rules — fixed",
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Behavioural (used by candidate generator)
// ─────────────────────────────────────────────────────────────────────────────
export const BEHAVIOURAL_ASSUMPTIONS: Record<string, AssumptionSpec> = {
  "behaviour.maxCryptoSharePct": A(
    "behaviour.maxCryptoSharePct", "behavioural",
    "Max crypto share of total portfolio (clipped above).",
    "decimal", 0.10, 0.00, 0.30,
    "Risk-management heuristic; user-adjustable",
  ),
  "behaviour.maxLvrAbsolute": A(
    "behaviour.maxLvrAbsolute", "behavioural",
    "Absolute LVR ceiling — scenarios above this are discarded.",
    "ratio", 0.85, 0.70, 0.90,
    "Spec §5.0 — refined per user direction 2026-05-11",
  ),
  "behaviour.minNsrBuffered": A(
    "behaviour.minNsrBuffered", "behavioural",
    "Minimum buffered NSR — below this is discarded.",
    "ratio", 0.85, 0.70, 1.20,
    "Spec §5.0",
  ),
  "behaviour.swr": A(
    "behaviour.swr", "behavioural",
    "Safe Withdrawal Rate for FIRE coverage calc.",
    "decimal", DEFAULT_ASSUMPTIONS.swr, 0.025, 0.06,
    "Trinity Study + Bengen extensions",
  ),
  "behaviour.dependants.bufferMonthsEach": A(
    "behaviour.dependants.bufferMonthsEach", "behavioural",
    "Additional liquidity-floor months per dependant.",
    "months", 0.5, 0.0, 2.0,
    "Spec §5.0a",
  ),
  "behaviour.incomeVolatility.paygDefault": A(
    "behaviour.incomeVolatility.paygDefault", "behavioural",
    "Default income volatility for PAYG households.",
    "decimal", 0.05, 0.00, 0.20,
    "Heuristic",
  ),
  "behaviour.incomeVolatility.selfEmployedDefault": A(
    "behaviour.incomeVolatility.selfEmployedDefault", "behavioural",
    "Default income volatility for self-employed households.",
    "decimal", 0.40, 0.10, 0.80,
    "Heuristic",
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Unified index + lookup helpers
// ─────────────────────────────────────────────────────────────────────────────

export const ASSUMPTION_REGISTRY: Record<string, AssumptionSpec> = {
  ...MACRO_ASSUMPTIONS,
  ...ASSET_ASSUMPTIONS,
  ...TAX_ASSUMPTIONS,
  ...REGULATORY_ASSUMPTIONS,
  ...BEHAVIOURAL_ASSUMPTIONS,
};

export const REGISTRY_VERSION = "1.0.0";
export const REGISTRY_LAST_REVIEWED = "2026-05-11";

export function getAssumption<T = number>(id: string): AssumptionSpec<T> {
  const a = ASSUMPTION_REGISTRY[id];
  if (!a) throw new Error(`Assumption '${id}' not in registry`);
  return a as AssumptionSpec<T>;
}

export function listAssumptions(category?: AssumptionCategory): string[] {
  const keys = Object.keys(ASSUMPTION_REGISTRY);
  return category ? keys.filter(k => ASSUMPTION_REGISTRY[k].category === category) : keys;
}

// Map BasePlanAssumptions field → registry id (for runtime consistency check)
const BASE_PLAN_FIELD_TO_REGISTRY_ID: Record<keyof BasePlanAssumptions, string> = {
  inflation:      "inflation.cpi.au",
  incomeGrowth:   "incomeGrowth.au",
  expenseGrowth:  "expenseGrowth.au",
  stockReturn:    "stocks.return.expected",
  stockVol:       "stocks.volatility",
  cryptoReturn:   "crypto.return.expected",
  cryptoVol:      "crypto.volatility",
  propertyGrowth: "property.growth.expected",
  propertyVol:    "property.volatility",
  superReturn:    "super.return.expected",
  superVol:       "super.volatility",
  cashApr:        "cashApr.au",
  mortgageRate:   "mortgageRate.au",
  swr:            "behaviour.swr",
};

export interface ConsistencyViolation {
  field: keyof BasePlanAssumptions;
  id: string;
  value: number;
  min: number;
  max: number;
  reason: string;
}

/**
 * Runtime check: every BasePlanAssumptions value must lie within its
 * registered range. Returns a list of violations (empty if all clean).
 *
 * Caller decides what to do with violations. Recommended:
 *   - log + clamp on UI-driven overrides
 *   - throw on programmatic engine calls
 */
export function assertAssumptionsConsistent(
  a: BasePlanAssumptions,
): ConsistencyViolation[] {
  const out: ConsistencyViolation[] = [];
  for (const [field, id] of Object.entries(BASE_PLAN_FIELD_TO_REGISTRY_ID) as [keyof BasePlanAssumptions, string][]) {
    const spec = ASSUMPTION_REGISTRY[id];
    if (!spec) continue;
    const value = a[field];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      out.push({
        field, id, value: Number(value),
        min: spec.range.min as number, max: spec.range.max as number,
        reason: "non-finite or non-numeric",
      });
      continue;
    }
    if (value < (spec.range.min as number) || value > (spec.range.max as number)) {
      out.push({
        field, id, value,
        min: spec.range.min as number, max: spec.range.max as number,
        reason: `out of registered range [${spec.range.min}, ${spec.range.max}]`,
      });
    }
  }
  return out;
}

/** Default BasePlanAssumptions derived from registry. Must equal DEFAULT_ASSUMPTIONS. */
export function defaultBasePlanAssumptionsFromRegistry(): BasePlanAssumptions {
  return {
    inflation:      MACRO_ASSUMPTIONS["inflation.cpi.au"].defaultValue,
    incomeGrowth:   MACRO_ASSUMPTIONS["incomeGrowth.au"].defaultValue,
    expenseGrowth:  MACRO_ASSUMPTIONS["expenseGrowth.au"].defaultValue,
    stockReturn:    ASSET_ASSUMPTIONS["stocks.return.expected"].defaultValue,
    stockVol:       ASSET_ASSUMPTIONS["stocks.volatility"].defaultValue,
    cryptoReturn:   ASSET_ASSUMPTIONS["crypto.return.expected"].defaultValue,
    cryptoVol:      ASSET_ASSUMPTIONS["crypto.volatility"].defaultValue,
    propertyGrowth: ASSET_ASSUMPTIONS["property.growth.expected"].defaultValue,
    propertyVol:    ASSET_ASSUMPTIONS["property.volatility"].defaultValue,
    superReturn:    ASSET_ASSUMPTIONS["super.return.expected"].defaultValue,
    superVol:       ASSET_ASSUMPTIONS["super.volatility"].defaultValue,
    cashApr:        MACRO_ASSUMPTIONS["cashApr.au"].defaultValue,
    mortgageRate:   MACRO_ASSUMPTIONS["mortgageRate.au"].defaultValue,
    swr:            BEHAVIOURAL_ASSUMPTIONS["behaviour.swr"].defaultValue,
  };
}

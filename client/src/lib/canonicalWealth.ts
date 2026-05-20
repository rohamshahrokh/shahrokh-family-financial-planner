/**
 * canonicalWealth.ts — Four canonical wealth layers.
 *
 * Why this file exists
 * --------------------
 * The dashboard, projection, risk surface and FIRE tools all need to talk
 * about "wealth" in different ways: total NW (raw assets − debt), accessible
 * NW (excludes locked equity), liquidatable wealth (post-selling-cost), and
 * FIRE capital (post-tax / post-CGT / deployable). Prior to this module, each
 * surface rolled its own subtraction logic, producing the well-known "seven
 * different net worths" problem (see `canonicalNetWorth.ts`) one layer up.
 *
 * This module sits ON TOP of `canonicalNetWorth.ts` and produces the four
 * explicit layers from the SAME inputs. It does not duplicate selector logic;
 * it reuses `selectCanonicalNetWorth` plus a small, transparent set of
 * regime-aware adjustments (CGT, selling cost, super lock).
 *
 * Definitions (the labels every widget must use):
 *   1. Gross Net Worth      = raw assets − debt (= canonicalNetWorth.netWorth).
 *   2. Accessible Net Worth = Gross NW − super − Iran property − cars.
 *      (Liquid + investable + Australian property equity only.)
 *   3. Liquidatable Wealth  = Accessible NW − property selling costs (~3.5%
 *      of property value: agent + legal + minor reno).
 *   4. FIRE Capital         = Liquidatable Wealth − estimated CGT on IPs −
 *      regime adjustment (under reform: deductions/loss bank applied where
 *      `taxPolicyEngine` exposes them).
 *
 * The CGT / selling-cost / regime numbers here are TRANSPARENT approximations
 * derived from the canonical inputs. They are clearly labelled "reconciliation
 * drivers" in the UI and explicitly NOT raw engine outputs.
 */

import {
  selectCanonicalNetWorth,
  selectIpCurrentValueSettled,
  selectIpLoanBalanceSettled,
  type DashboardInputs,
  type CanonicalNetWorth,
} from "./dashboardDataContract";

export type TaxScenario = "current_law" | "proposed_reform" | "custom";

/** Transparent assumptions surfaced in the UI alongside the values. */
export const WEALTH_ASSUMPTIONS = {
  /** Property selling cost: agent + legal + minor reno + marketing. */
  propertySellingCostPct: 0.035,
  /** CGT discount on settled IP gain (held >12mo, individual). */
  cgtDiscountPct: 0.5,
  /** Estimated household marginal rate for CGT modelling. */
  marginalRatePct: 0.39,
  /** Crude embedded IP gain assumption when no per-property cost base is known. */
  embeddedIpGainPctOfValue: 0.18,
  /**
   * Under proposed reform, an additional drag on FIRE capital from the
   * loss-bank quarantine on post-cutoff established IPs. Drag is expressed
   * as a small reduction of liquidatable IP equity (no NG refund flows in to
   * lift it; the loss bank is locked until disposal).
   */
  reformLiquidationDragPct: 0.025,
} as const;

export interface WealthLayers {
  /** Gross NW (assets − debt) — same as canonicalNetWorth.netWorth. */
  grossNetWorth: number;
  /** Excludes super, Iran property, cars (locked / not realistically deployable). */
  accessibleNetWorth: number;
  /** Accessible NW − selling costs on PPOR + settled IPs. */
  liquidatableWealth: number;
  /** Liquidatable wealth − CGT on IP gains − regime drag. */
  fireCapital: number;
  /** Components used to derive the layers — surfaced in tooltips and reconciliation. */
  drivers: WealthDrivers;
}

export interface WealthDrivers {
  /** PPOR equity (value − mortgage). */
  pporEquity: number;
  /** Settled IP equity (value − loan). */
  ipEquity: number;
  /** Locked equity excluded from Accessible NW (super + Iran property + cars). */
  lockedEquity: number;
  /** Property selling-cost dollar amount. */
  sellingCost: number;
  /** Estimated embedded gain on IPs used to model CGT. */
  ipEmbeddedGain: number;
  /** Estimated CGT dollar amount on IP gain. */
  cgtOnIp: number;
  /** Reform regime drag on liquidatable IP equity (loss bank quarantine). */
  reformDrag: number;
  /** Raw canonical NW reference. */
  raw: CanonicalNetWorth;
}

/**
 * Pure: compute the four canonical wealth layers from canonical inputs.
 * Engines, components and tests all consume this same function.
 */
export function computeWealthLayers(
  ledger: DashboardInputs,
  scenario: TaxScenario = "current_law",
): WealthLayers {
  const raw = selectCanonicalNetWorth(ledger);
  const a = raw.assets;
  const l = raw.liabilities;

  const pporEquity = Math.max(0, a.ppor - l.ppoMortgage);
  const ipValue = selectIpCurrentValueSettled(ledger);
  const ipLoan = selectIpLoanBalanceSettled(ledger);
  const ipEquity = Math.max(0, ipValue - ipLoan);

  // Locked equity excluded from "Accessible NW".
  const lockedEquity = a.super + a.iranProperty + a.cars;
  const grossNetWorth = raw.netWorth;
  const accessibleNetWorth = grossNetWorth - lockedEquity;

  // Selling cost is applied to PPOR + settled IPs (assets that could be
  // realised). We don't apply it to stocks/crypto where the post-selling-cost
  // estimate is already implicit (no agent commission).
  const sellingCost =
    (a.ppor + ipValue) * WEALTH_ASSUMPTIONS.propertySellingCostPct;
  const liquidatableWealth = accessibleNetWorth - sellingCost;

  // CGT modelling on IP embedded gain. Held > 12mo → 50% discount → marginal.
  const ipEmbeddedGain =
    ipValue * WEALTH_ASSUMPTIONS.embeddedIpGainPctOfValue;
  const cgtOnIp =
    ipEmbeddedGain *
    (1 - WEALTH_ASSUMPTIONS.cgtDiscountPct) *
    WEALTH_ASSUMPTIONS.marginalRatePct;

  const reformDrag =
    scenario === "proposed_reform"
      ? ipEquity * WEALTH_ASSUMPTIONS.reformLiquidationDragPct
      : 0;

  const fireCapital = liquidatableWealth - cgtOnIp - reformDrag;

  return {
    grossNetWorth,
    accessibleNetWorth,
    liquidatableWealth,
    fireCapital,
    drivers: {
      pporEquity,
      ipEquity,
      lockedEquity,
      sellingCost,
      ipEmbeddedGain,
      cgtOnIp,
      reformDrag,
      raw,
    },
  };
}

/** Convenience: array form for UI rendering. */
export interface WealthLayerRow {
  id: "gross" | "accessible" | "liquidatable" | "fire";
  label: string;
  value: number;
  blurb: string;
}

export function wealthLayerRows(layers: WealthLayers): WealthLayerRow[] {
  return [
    {
      id: "gross",
      label: "Gross Net Worth",
      value: layers.grossNetWorth,
      blurb: "Raw assets minus debt — every asset class included.",
    },
    {
      id: "accessible",
      label: "Accessible Net Worth",
      value: layers.accessibleNetWorth,
      blurb: "Excludes locked equity (super, Iran property, cars).",
    },
    {
      id: "liquidatable",
      label: "Liquidatable Wealth",
      value: layers.liquidatableWealth,
      blurb: "Accessible NW minus property selling costs (~3.5%).",
    },
    {
      id: "fire",
      label: "FIRE Capital",
      value: layers.fireCapital,
      blurb: "Post-CGT, post-regime — deployable passive-income capital.",
    },
  ];
}

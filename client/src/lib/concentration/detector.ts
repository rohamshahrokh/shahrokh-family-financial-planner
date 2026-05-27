/**
 * Sprint 17 Phase 17.5 — Concentration detector.
 *
 * Pure function over RecommendationContext. Returns 0..N flags. Thresholds
 * come from the user's brief (NOT the architecture's draft numbers):
 *   - single asset class > 70%
 *   - property > 80%
 *   - crypto > 30%
 *   - cash too low relative to expenses (< 3 months coverage)
 *   - debt too high relative to assets / income
 *
 * Each flag carries a severity, observed vs threshold, and remediation copy
 * so the explanation layer (Phase 17.6) can quote it verbatim.
 */

import type { ConcentrationFlag } from "./types";
import type { RecommendationContext } from "../recommendationContext/types";

const TH = {
  SINGLE_ASSET_PCT: 70,
  PROPERTY_PCT: 80,
  CRYPTO_PCT: 30,
  CASH_MONTHS: 3,
  DEBT_TO_INCOME: 5, // debt > 5x annual income → critical
  DEBT_TO_ASSETS: 0.7, // debt > 70% of assets → critical
} as const;

function pct(v: number, total: number): number {
  if (!Number.isFinite(v) || !Number.isFinite(total) || total <= 0) return 0;
  return (v / total) * 100;
}

export function detectConcentration(ctx: RecommendationContext): ConcentrationFlag[] {
  const flags: ConcentrationFlag[] = [];
  const { netWorth, cashflow } = ctx.today;
  const assetTotal =
    Math.max(0, netWorth.cash) +
    Math.max(0, netWorth.investments) +
    Math.max(0, netWorth.superBalance) +
    Math.max(0, netWorth.propertyEquity) +
    Math.max(0, netWorth.crypto);
  if (assetTotal <= 0) return flags;

  // Property concentration
  const propertyPct = pct(netWorth.propertyEquity, assetTotal);
  if (propertyPct > TH.PROPERTY_PCT) {
    flags.push({
      kind: "property_over_80",
      severity: propertyPct > 90 ? "critical" : "warning",
      observedPct: Number(propertyPct.toFixed(1)),
      thresholdPct: TH.PROPERTY_PCT,
      affectedAssets: ["PPOR / investment property"],
      remediation: `Property is ${propertyPct.toFixed(1)}% of assets (target ≤ ${TH.PROPERTY_PCT}%). Rebalance toward liquid assets over the next 12–24 months.`,
    });
  }

  // Crypto concentration
  const cryptoPct = pct(netWorth.crypto, assetTotal);
  if (cryptoPct > TH.CRYPTO_PCT) {
    flags.push({
      kind: "crypto_over_30",
      severity: cryptoPct > 50 ? "critical" : "warning",
      observedPct: Number(cryptoPct.toFixed(1)),
      thresholdPct: TH.CRYPTO_PCT,
      affectedAssets: ["crypto holdings"],
      remediation: `Crypto is ${cryptoPct.toFixed(1)}% of assets (target ≤ ${TH.CRYPTO_PCT}%). Trim toward ${TH.CRYPTO_PCT}% via DCA-out over the next 12–18 months.`,
    });
  }

  // Single asset class > 70%
  const slices: Array<{ name: string; value: number }> = [
    { name: "cash", value: netWorth.cash },
    { name: "investments", value: netWorth.investments },
    { name: "super", value: netWorth.superBalance },
    { name: "property", value: netWorth.propertyEquity },
    { name: "crypto", value: netWorth.crypto },
  ];
  for (const s of slices) {
    const p = pct(s.value, assetTotal);
    if (p > TH.SINGLE_ASSET_PCT && s.name !== "property" && s.name !== "crypto") {
      // Property and crypto already handled with their own thresholds
      flags.push({
        kind: "single_asset_over_70",
        severity: p > 85 ? "critical" : "warning",
        observedPct: Number(p.toFixed(1)),
        thresholdPct: TH.SINGLE_ASSET_PCT,
        affectedAssets: [s.name],
        remediation: `${s.name} is ${p.toFixed(1)}% of assets — diversify across asset classes.`,
      });
    }
  }

  // Cash too low relative to expenses
  if (cashflow.monthlyExpenses > 0) {
    const months = netWorth.cash / cashflow.monthlyExpenses;
    if (months < TH.CASH_MONTHS) {
      flags.push({
        kind: "cash_too_low",
        severity: months < 1 ? "critical" : "warning",
        observedPct: Number((months * 10).toFixed(1)), // months scaled as pct-of-3
        thresholdPct: TH.CASH_MONTHS * 10,
        affectedAssets: ["liquid cash buffer"],
        remediation: `Cash covers only ${months.toFixed(1)} months of expenses (target ≥ ${TH.CASH_MONTHS} months). Build emergency buffer before risk-on actions.`,
      });
    }
  }

  // Debt too high
  const annualIncome = cashflow.monthlyIncome * 12;
  const debt = netWorth.debt;
  if (debt > 0) {
    if (annualIncome > 0) {
      const ratio = debt / annualIncome;
      if (ratio > TH.DEBT_TO_INCOME) {
        flags.push({
          kind: "debt_too_high",
          severity: ratio > 8 ? "critical" : "warning",
          observedPct: Number((ratio * 100).toFixed(1)),
          thresholdPct: TH.DEBT_TO_INCOME * 100,
          affectedAssets: ["total debt"],
          remediation: `Debt is ${ratio.toFixed(1)}× annual income (target ≤ ${TH.DEBT_TO_INCOME}×). Prioritise leverage reduction before new wealth-max actions.`,
        });
      }
    }
    if (assetTotal > 0) {
      const ratio = debt / assetTotal;
      if (ratio > TH.DEBT_TO_ASSETS) {
        flags.push({
          kind: "debt_too_high",
          severity: ratio > 0.9 ? "critical" : "warning",
          observedPct: Number((ratio * 100).toFixed(1)),
          thresholdPct: TH.DEBT_TO_ASSETS * 100,
          affectedAssets: ["debt / asset ratio"],
          remediation: `Debt is ${(ratio * 100).toFixed(0)}% of assets (target ≤ ${TH.DEBT_TO_ASSETS * 100}%). Sequence-of-returns vulnerability is high.`,
        });
      }
    }
  }

  return flags;
}

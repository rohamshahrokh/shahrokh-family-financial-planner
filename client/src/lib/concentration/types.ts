/**
 * Sprint 17 Phase 17.5 — Concentration detector contract.
 */

export type ConcentrationKind =
  | "single_asset_over_70"
  | "property_over_80"
  | "crypto_over_30"
  | "cash_too_low"
  | "debt_too_high";

export interface ConcentrationFlag {
  kind: ConcentrationKind;
  severity: "warning" | "critical";
  observedPct: number;
  thresholdPct: number;
  affectedAssets: string[];
  remediation: string;
}

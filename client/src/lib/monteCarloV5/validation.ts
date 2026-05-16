/**
 * validation.ts — Phase 11: V5 Validation + Reconciliation Layers
 *
 * Continuous, lightweight validators that V5 panels can call to confirm:
 *
 *   - Dashboard NW reconciles (assets - liabilities = NW)
 *   - Future planned assets are not counted today
 *   - Offset balances reconcile
 *   - Debt schedules reconcile
 *   - Contribution schedules reconcile
 *
 * Also emits warnings for:
 *   - Simulation sanity (e.g. terminal NW exploding > 20× starting)
 *   - Unrealistic assumptions (real return > 12%, inflation < 0% sustained)
 *   - Overfitting (driver weight concentration > 0.8 in one variable)
 *   - Leverage concentration (LVR > 85% AND single-state exposure > 70%)
 *
 * Each validator returns a `ValidationResult` with a severity tag — V5 UI
 * can render coloured chips and gate destructive actions behind warnings.
 */

export type Severity = "info" | "warn" | "error";

export interface ValidationResult {
  id: string;
  severity: Severity;
  label: string;
  detail: string;
  passed: boolean;
}

export interface NetWorthReconInput {
  totalAssets: number;
  totalLiabilities: number;
  declaredNW: number;
  /** Tolerance in AUD (default $50). */
  tolerance?: number;
}

export function checkNetWorthReconciliation(inp: NetWorthReconInput): ValidationResult {
  const tol = inp.tolerance ?? 50;
  const computed = inp.totalAssets - inp.totalLiabilities;
  const diff = Math.abs(computed - inp.declaredNW);
  const passed = diff <= tol;
  return {
    id: "nw_reconciliation",
    severity: passed ? "info" : "error",
    label: "Assets − Liabilities = Net Worth",
    detail: passed
      ? `Reconciled: computed $${Math.round(computed).toLocaleString()} matches declared.`
      : `Drift of $${Math.round(diff).toLocaleString()}: computed $${Math.round(computed).toLocaleString()} vs declared $${Math.round(inp.declaredNW).toLocaleString()}.`,
    passed,
  };
}

export interface PlannedNotCurrentInput {
  /** Properties with future settlement/purchase dates that should NOT be in today's NW. */
  futurePlannedAssetValue: number;
  declaredNW: number;
  declaredAssetsBreakdown?: { current: number; planned: number };
}

export function checkPlannedNotCurrent(inp: PlannedNotCurrentInput): ValidationResult {
  if (!inp.declaredAssetsBreakdown) {
    const looksLeaked = inp.futurePlannedAssetValue > 0 && inp.declaredNW < 1;
    return {
      id: "planned_not_current",
      severity: "info",
      label: "Planned assets excluded from today's NW",
      detail: "No breakdown available; trusting upstream selector.",
      passed: !looksLeaked,
    };
  }
  const passed = inp.declaredAssetsBreakdown.planned >= inp.futurePlannedAssetValue - 1;
  return {
    id: "planned_not_current",
    severity: passed ? "info" : "warn",
    label: "Planned assets excluded from today's NW",
    detail: passed
      ? `Planned $${Math.round(inp.declaredAssetsBreakdown.planned).toLocaleString()} sits in the planned bucket — not today's NW.`
      : `Possible leakage: $${Math.round(inp.futurePlannedAssetValue - inp.declaredAssetsBreakdown.planned).toLocaleString()} of planned assets may be in today's totals.`,
    passed,
  };
}

export interface OffsetReconInput {
  offsetBalanceDeclared: number;
  offsetBalanceComputed: number;
  tolerance?: number;
}

export function checkOffsetReconciliation(inp: OffsetReconInput): ValidationResult {
  const tol = inp.tolerance ?? 25;
  const diff = Math.abs(inp.offsetBalanceDeclared - inp.offsetBalanceComputed);
  const passed = diff <= tol;
  return {
    id: "offset_recon",
    severity: passed ? "info" : "warn",
    label: "Offset balance reconciliation",
    detail: passed
      ? `Offset matches within $${tol}.`
      : `Offset drift $${Math.round(diff).toLocaleString()} — verify source-of-truth wiring.`,
    passed,
  };
}

export interface DebtScheduleReconInput {
  /** Sum of all monthly mortgage + IP payments declared. */
  declaredMonthlyDebtService: number;
  /** Computed from V4 amortisation. */
  computedMonthlyDebtService: number;
  tolerance?: number;
}

export function checkDebtScheduleReconciliation(inp: DebtScheduleReconInput): ValidationResult {
  const tol = inp.tolerance ?? 25;
  const diff = Math.abs(inp.declaredMonthlyDebtService - inp.computedMonthlyDebtService);
  const passed = diff <= tol;
  return {
    id: "debt_schedule",
    severity: passed ? "info" : "warn",
    label: "Debt schedule reconciliation",
    detail: passed
      ? `Monthly debt service reconciles within $${tol}.`
      : `Drift $${Math.round(diff).toLocaleString()} — declared $${Math.round(inp.declaredMonthlyDebtService).toLocaleString()} vs computed.`,
    passed,
  };
}

export interface ContributionReconInput {
  declaredAnnualContribution: number;
  computedAnnualContribution: number;
  tolerance?: number;
}

export function checkContributionReconciliation(inp: ContributionReconInput): ValidationResult {
  const tol = inp.tolerance ?? 100;
  const diff = Math.abs(inp.declaredAnnualContribution - inp.computedAnnualContribution);
  const passed = diff <= tol;
  return {
    id: "contribution_recon",
    severity: passed ? "info" : "warn",
    label: "Contribution schedule reconciliation",
    detail: passed
      ? `Annual contributions reconcile within $${tol}.`
      : `Drift $${Math.round(diff).toLocaleString()} — declared $${Math.round(inp.declaredAnnualContribution).toLocaleString()}.`,
    passed,
  };
}

// ── Simulation sanity warnings ──────────────────────────────────────────

export function sanityCheckTerminalGrowth(
  startingNW: number,
  medianTerminalNW: number,
  horizonYears: number,
): ValidationResult {
  if (startingNW <= 0) {
    return {
      id: "sanity_growth",
      severity: "info",
      label: "Terminal growth sanity",
      detail: "Starting NW non-positive — growth check skipped.",
      passed: true,
    };
  }
  const cagr = Math.pow(medianTerminalNW / startingNW, 1 / Math.max(1, horizonYears)) - 1;
  const ok = cagr < 0.20 && cagr > -0.05;
  return {
    id: "sanity_growth",
    severity: ok ? "info" : "warn",
    label: "Median CAGR realism",
    detail: ok
      ? `Median CAGR ${(cagr * 100).toFixed(1)}% looks reasonable.`
      : `Median CAGR ${(cagr * 100).toFixed(1)}% looks ${cagr >= 0.20 ? "implausibly high" : "implausibly negative"}.`,
    passed: ok,
  };
}

export function unrealisticAssumptionCheck(
  realReturnPct: number,
  inflationPct: number,
  propertyGrowthPct: number,
): ValidationResult[] {
  const out: ValidationResult[] = [];
  if (realReturnPct > 12) out.push({
    id: "asm_real_return", severity: "warn", label: "Real return assumption",
    detail: `Real return ${realReturnPct}% is above the 9-10% upper historical band.`, passed: false,
  });
  if (inflationPct < 0) out.push({
    id: "asm_inflation", severity: "warn", label: "Inflation assumption",
    detail: `Sustained negative inflation (${inflationPct}%) is rare; consider deflationary_shock regime instead.`, passed: false,
  });
  if (propertyGrowthPct > 12) out.push({
    id: "asm_prop_growth", severity: "warn", label: "Property growth assumption",
    detail: `Property growth ${propertyGrowthPct}%/yr is above the AU long-run upper band.`, passed: false,
  });
  if (out.length === 0) out.push({
    id: "asm_summary", severity: "info", label: "Assumptions check",
    detail: "All key assumptions within historical bands.", passed: true,
  });
  return out;
}

export function overfittingCheck(
  driverWeights: Array<{ name: string; weight: number }>,
): ValidationResult {
  if (driverWeights.length === 0) {
    return { id: "overfit", severity: "info", label: "Driver concentration", detail: "No drivers measured.", passed: true };
  }
  const top = Math.max(...driverWeights.map(d => d.weight));
  const ok = top < 0.8;
  return {
    id: "overfit",
    severity: ok ? "info" : "warn",
    label: "Driver concentration / overfitting",
    detail: ok
      ? `Top driver weighted ${(top * 100).toFixed(0)}% — balanced.`
      : `Top driver weighted ${(top * 100).toFixed(0)}% — model may be over-fit to one variable.`,
    passed: ok,
  };
}

export function leverageConcentrationCheck(
  lvr: number,
  stateConcentrationPct: number,
): ValidationResult {
  const ok = !(lvr > 0.85 && stateConcentrationPct > 0.70);
  return {
    id: "lev_conc",
    severity: ok ? "info" : "error",
    label: "Leverage + state concentration",
    detail: ok
      ? `LVR ${(lvr * 100).toFixed(0)}% and state concentration ${(stateConcentrationPct * 100).toFixed(0)}% within safe bands.`
      : `High LVR (${(lvr * 100).toFixed(0)}%) combined with single-state exposure ${(stateConcentrationPct * 100).toFixed(0)}% — material concentration risk.`,
    passed: ok,
  };
}

/** Aggregate all validators for a single V5 reconciliation panel. */
export function runV5Validations(input: {
  nwRecon?: NetWorthReconInput;
  planned?: PlannedNotCurrentInput;
  offset?: OffsetReconInput;
  debt?: DebtScheduleReconInput;
  contributions?: ContributionReconInput;
  growth?: { startingNW: number; medianTerminal: number; horizonYears: number };
  assumptions?: { realReturnPct: number; inflationPct: number; propertyGrowthPct: number };
  drivers?: Array<{ name: string; weight: number }>;
  concentration?: { lvr: number; stateConcentrationPct: number };
}): ValidationResult[] {
  const out: ValidationResult[] = [];
  if (input.nwRecon)        out.push(checkNetWorthReconciliation(input.nwRecon));
  if (input.planned)        out.push(checkPlannedNotCurrent(input.planned));
  if (input.offset)         out.push(checkOffsetReconciliation(input.offset));
  if (input.debt)           out.push(checkDebtScheduleReconciliation(input.debt));
  if (input.contributions)  out.push(checkContributionReconciliation(input.contributions));
  if (input.growth)         out.push(sanityCheckTerminalGrowth(input.growth.startingNW, input.growth.medianTerminal, input.growth.horizonYears));
  if (input.assumptions)    out.push(...unrealisticAssumptionCheck(input.assumptions.realReturnPct, input.assumptions.inflationPct, input.assumptions.propertyGrowthPct));
  if (input.drivers)        out.push(overfittingCheck(input.drivers));
  if (input.concentration)  out.push(leverageConcentrationCheck(input.concentration.lvr, input.concentration.stateConcentrationPct));
  return out;
}

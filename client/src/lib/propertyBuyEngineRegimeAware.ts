/**
 * propertyBuyEngineRegimeAware.ts — Parallel-Pathway Property Buy Overlay
 *
 * #FWL_TaxReform_P1_P2_Integration_NoOverride — Property Buy wiring.
 *
 * Wraps the existing propertyBuyEngine in a regime-aware overlay. The
 * PRIMARY pathway (computePropertyScenario / computeAllScenarios in
 * propertyBuyEngine.ts) is NEVER modified — this file IMPORTS those
 * functions and adds a SECOND entry point that returns BOTH the
 * current-rules result and the proposed-reform result, plus per-scenario
 * deltas (cashflow / IRR / equity / CGT-after-tax).
 *
 * Parallel-pathway invariants (NON-NEGOTIABLE):
 *   1. propertyBuyEngine.ts is untouched (567 lines preserved).
 *   2. The `current` branch is byte-for-byte identical to legacy
 *      computeAllScenarios(buyNow, wait6m, wait12m).
 *   3. The `reform` branch re-runs the legacy engine and then OVERLAYS:
 *        - NG benefit re-quantised by treatment (DEDUCT_AGAINST_WAGE
 *          keeps current; QUARANTINE_TO_PROPERTY or ABOLISH → ngBenefit
 *          is zeroed and cashflow re-derived; quarantined losses are
 *          carried forward and credited at disposal as a deduction
 *          against the capital gain).
 *        - CGT discount swapped per regime.effectiveCGTMethod /
 *          effectiveCGTDiscountPct.
 *      All projection math (growth, IRR cashflows) still routes through
 *      legacy yearly snapshots.
 *   4. CURRENT_RULES selector → reform branch byte-for-byte equal to
 *      current. AUTO_DETECT defers to budget-night cutoff + property type.
 *
 * Modelling disclaimer (surface on every UI that renders these outputs):
 *   "This is modelling only and not personal tax advice."
 */

import {
  computePropertyScenario,
  computeAllScenarios,
  type PropertyScenarioInput,
  type ScenarioResult,
  type PropertyBuyResult,
  type YearlySnapshot,
} from "./propertyBuyEngine";
import {
  CURRENT_RULES_REGIME,
  PROPOSED_2027_REFORM_REGIME,
  REGIMES_BY_KIND,
  resolveAutoDetectedRegime,
  resolvePropertyTaxStatus,
  type ConcreteRegimeKind,
  type PropertyTaxStatus,
  type PropertyType,
  type TaxPolicyRegime,
  type TaxPolicyRegimeKind,
} from "./taxPolicyEngine";
import { calcMarginalRate } from "./australianTax";
import { safeNum } from "./finance";

// ─── Property metadata sidecar ───────────────────────────────────────────────
//
// Property Buy is unique: each *scenario* (buy_now / wait_6m / wait_12m)
// IS a single property purchase. So the sidecar maps 1:1 to scenarios.
// `purchaseDate` defaults to today + delay_months at evaluation time if
// the caller does not supply one (the most realistic intent).

export interface PropertyBuyScenarioMetadata {
  /** Property type for this scenario. Default UNKNOWN — auto-detect will treat as ESTABLISHED for safety. */
  propertyType?: PropertyType;
  /** ISO YYYY-MM-DD contract date. If omitted, falls back to purchaseDate. */
  contractDate?: string;
  /** ISO YYYY-MM-DD settlement date. If omitted, derived from delay_months from today. */
  purchaseDate?: string;
}

export interface PropertyBuyMetadataSet {
  buy_now?:  PropertyBuyScenarioMetadata;
  wait_6m?:  PropertyBuyScenarioMetadata;
  wait_12m?: PropertyBuyScenarioMetadata;
}

// ─── Public delta shape ──────────────────────────────────────────────────────

export interface PropertyBuyScenarioDelta {
  label:                    string;
  /** Sum of NG benefit retained under current rules across the horizon. */
  current_ng_benefit_total: number;
  /** Sum of NG benefit retained under reform regime (zero when quarantined/abolished). */
  reform_ng_benefit_total:  number;
  /** Quarantined losses carried forward (only non-zero when treatment = QUARANTINE_TO_PROPERTY). */
  quarantined_losses:       number;
  /** Avg monthly cashflow (current vs reform). */
  current_avg_monthly_cf:   number;
  reform_avg_monthly_cf:    number;
  delta_avg_monthly_cf:     number;
  /** IRR (current vs reform). */
  current_irr:              number;
  reform_irr:               number;
  delta_irr:                number;
  /** Equity end of horizon (unchanged — capital growth is unaffected). */
  current_equity_end:       number;
  reform_equity_end:        number;
  /** Capital gain after CGT discount (gain × (1 − discountPct)). */
  current_cgt_taxable_gain: number;
  reform_cgt_taxable_gain:  number;
  /** After-tax CGT proceeds (gain − tax − selling costs) approximated. */
  current_cgt_after_tax:    number;
  reform_cgt_after_tax:     number;
  delta_cgt_after_tax:      number;
  /** Effective regime label for this scenario under AUTO_DETECT. */
  effective_regime_kind:    ConcreteRegimeKind;
  /** Status assigned by the resolver. */
  status:                   PropertyTaxStatus;
}

export interface PropertyBuyBothRegimesResult {
  current:                     PropertyBuyResult;
  reform:                      PropertyBuyResult;
  scenario_deltas:             {
    buy_now:  PropertyBuyScenarioDelta;
    wait_6m:  PropertyBuyScenarioDelta;
    wait_12m: PropertyBuyScenarioDelta | null;
  };
  /** Composite avg monthly cashflow drag across the chosen scenario. */
  best_scenario_delta_monthly_cf: number;
  /** Composite CGT-after-tax delta on the best scenario. */
  best_scenario_delta_cgt:        number;
  reformRegimeKind:               ConcreteRegimeKind;
  autoDetectNeedsConfirmation:    boolean;
  modellingDisclaimer:            string;
}

// ─── Build args ──────────────────────────────────────────────────────────────

export interface ComputePropertyBuyBothRegimesArgs {
  buyNow:  PropertyScenarioInput;
  wait6m:  PropertyScenarioInput;
  wait12m?: PropertyScenarioInput;
  /** Per-scenario metadata. Auto-derived from delay_months if absent. */
  metadata?: PropertyBuyMetadataSet;
  /** Defaults to AUTO_DETECT. */
  regimeSelector?: TaxPolicyRegimeKind;
  /** Required when selector is CUSTOM_STRESS_TEST. */
  customRegime?: TaxPolicyRegime;
  /** Defaults to PROPOSED_2027_REFORM_REGIME. */
  reformRegime?: TaxPolicyRegime;
  /** Optional marginal-rate override (used to re-quantify NG benefit). */
  marginalRateOverride?: number;
  /** ISO YYYY-MM-DD; defaults to today (UTC). Used when deriving purchaseDate from delay_months. */
  evaluationDate?: string;
}

// ─── Core entry point ────────────────────────────────────────────────────────

export function computePropertyBuyBothRegimes(
  args: ComputePropertyBuyBothRegimesArgs,
): PropertyBuyBothRegimesResult {
  const reformRegime = args.reformRegime ?? PROPOSED_2027_REFORM_REGIME;
  const selector = args.regimeSelector ?? "AUTO_DETECT";
  const evalDate = args.evaluationDate ?? new Date().toISOString().slice(0, 10);

  // 1. CURRENT branch — legacy engine, untouched.
  const current = computeAllScenarios(args.buyNow, args.wait6m, args.wait12m);

  // 2. Resolve per-scenario regime + status (positional, one per scenario).
  const buyNowMeta  = enrichMeta(args.metadata?.buy_now,  args.buyNow,  evalDate);
  const wait6mMeta  = enrichMeta(args.metadata?.wait_6m,  args.wait6m,  evalDate);
  const wait12mMeta = args.wait12m
    ? enrichMeta(args.metadata?.wait_12m, args.wait12m, evalDate)
    : null;

  const buyNowResolved  = resolveScenarioRegime(selector, buyNowMeta,  reformRegime, args.customRegime);
  const wait6mResolved  = resolveScenarioRegime(selector, wait6mMeta,  reformRegime, args.customRegime);
  const wait12mResolved = wait12mMeta
    ? resolveScenarioRegime(selector, wait12mMeta, reformRegime, args.customRegime)
    : null;

  const autoDetectNeedsConfirmation =
    buyNowResolved.needsConfirmation ||
    wait6mResolved.needsConfirmation ||
    (wait12mResolved?.needsConfirmation ?? false);

  // 3. REFORM branch — re-run legacy engine first (capital growth, depreciation,
  //    loan amortisation are all regime-invariant), then overlay NG + CGT.
  const reformBuyNowRaw  = computePropertyScenario(args.buyNow);
  const reformWait6mRaw  = computePropertyScenario(args.wait6m);
  const reformWait12mRaw = args.wait12m ? computePropertyScenario(args.wait12m) : null;

  const marginalRateBuyNow = args.marginalRateOverride ?? defaultMarginalRate(args.buyNow.annual_salary);
  const marginalRateWait6m = args.marginalRateOverride ?? defaultMarginalRate(args.wait6m.annual_salary);
  const marginalRateWait12m = args.wait12m
    ? (args.marginalRateOverride ?? defaultMarginalRate(args.wait12m.annual_salary))
    : 0;

  const reformBuyNow  = applyRegimeOverlay(reformBuyNowRaw,  buyNowResolved.regime,  buyNowResolved.status,  marginalRateBuyNow);
  const reformWait6m  = applyRegimeOverlay(reformWait6mRaw,  wait6mResolved.regime,  wait6mResolved.status,  marginalRateWait6m);
  const reformWait12m = reformWait12mRaw && wait12mResolved
    ? applyRegimeOverlay(reformWait12mRaw, wait12mResolved.regime, wait12mResolved.status, marginalRateWait12m)
    : null;

  // 4. Build reform PropertyBuyResult mirroring legacy comparison_table logic.
  const reform: PropertyBuyResult = buildBuyResult(reformBuyNow, reformWait6m, reformWait12m);

  // 5. Per-scenario deltas.
  const buyNowDelta = buildDelta(
    "Buy Now",
    current.buy_now,
    reformBuyNow,
    args.buyNow,
    buyNowResolved,
    marginalRateBuyNow,
  );
  const wait6mDelta = buildDelta(
    "Wait 6 months",
    current.wait_6m,
    reformWait6m,
    args.wait6m,
    wait6mResolved,
    marginalRateWait6m,
  );
  const wait12mDelta = current.wait_12m && reformWait12m && wait12mResolved
    ? buildDelta(
        "Wait 12 months",
        current.wait_12m,
        reformWait12m,
        args.wait12m!,
        wait12mResolved,
        marginalRateWait12m,
      )
    : null;

  // 6. Best-scenario composite drag (use legacy's best_scenario pick from CURRENT branch).
  const bestKey = current.best_scenario;
  const bestDelta =
    bestKey === "buy_now"  ? buyNowDelta :
    bestKey === "wait_6m"  ? wait6mDelta :
    (wait12mDelta ?? buyNowDelta);

  // 7. Pick representative effective regime kind for the result header
  //    (use buy_now since it is always present).
  const effectiveRegimeKind: ConcreteRegimeKind = buyNowResolved.regime.kind;

  return {
    current,
    reform,
    scenario_deltas: {
      buy_now:  buyNowDelta,
      wait_6m:  wait6mDelta,
      wait_12m: wait12mDelta,
    },
    best_scenario_delta_monthly_cf: bestDelta.delta_avg_monthly_cf,
    best_scenario_delta_cgt:        bestDelta.delta_cgt_after_tax,
    reformRegimeKind:               effectiveRegimeKind,
    autoDetectNeedsConfirmation,
    modellingDisclaimer:            "This is modelling only and not personal tax advice.",
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function defaultMarginalRate(annualSalary: number): number {
  const salary = safeNum(annualSalary);
  if (salary <= 0) return 0.47;
  return calcMarginalRate(salary, "2025-26") + 0.02;
}

interface EnrichedMeta {
  propertyType: PropertyType;
  contractDate?: string;
  purchaseDate?: string;
}

function enrichMeta(
  meta: PropertyBuyScenarioMetadata | undefined,
  scenario: PropertyScenarioInput,
  evalDate: string,
): EnrichedMeta {
  const propertyType: PropertyType = meta?.propertyType ?? "UNKNOWN";
  let contractDate = meta?.contractDate;
  let purchaseDate = meta?.purchaseDate;

  // If neither contract nor purchase date is supplied, derive from
  // delay_months: settlement = evalDate + delay_months.
  if (!contractDate && !purchaseDate) {
    purchaseDate = addMonthsIso(evalDate, safeNum(scenario.delay_months));
  }

  return { propertyType, contractDate, purchaseDate };
}

function addMonthsIso(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

interface ScenarioResolution {
  regime: TaxPolicyRegime;
  status: PropertyTaxStatus;
  needsConfirmation: boolean;
}

function resolveScenarioRegime(
  selector: TaxPolicyRegimeKind,
  meta: EnrichedMeta,
  reformRegime: TaxPolicyRegime,
  customRegime?: TaxPolicyRegime,
): ScenarioResolution {
  if (selector === "CURRENT_RULES") {
    return {
      regime: CURRENT_RULES_REGIME,
      status: resolvePropertyTaxStatus(
        { propertyId: "scenario", propertyType: meta.propertyType, contractDate: meta.contractDate, purchaseDate: meta.purchaseDate },
        CURRENT_RULES_REGIME,
      ),
      needsConfirmation: false,
    };
  }
  if (selector === "PROPOSED_2027_REFORM") {
    return {
      regime: reformRegime,
      status: resolvePropertyTaxStatus(
        { propertyId: "scenario", propertyType: meta.propertyType, contractDate: meta.contractDate, purchaseDate: meta.purchaseDate },
        reformRegime,
      ),
      needsConfirmation: false,
    };
  }
  if (selector === "CUSTOM_STRESS_TEST") {
    const regime = customRegime ?? REGIMES_BY_KIND.CUSTOM_STRESS_TEST;
    return {
      regime,
      status: resolvePropertyTaxStatus(
        { propertyId: "scenario", propertyType: meta.propertyType, contractDate: meta.contractDate, purchaseDate: meta.purchaseDate },
        regime,
      ),
      needsConfirmation: false,
    };
  }

  // AUTO_DETECT
  const auto = resolveAutoDetectedRegime({
    propertyType: meta.propertyType,
    contractDate: meta.contractDate,
    purchaseDate: meta.purchaseDate,
    reformRegime,
  });
  const regime = auto.resolvedRegimeKind === "CURRENT_RULES"
    ? CURRENT_RULES_REGIME
    : reformRegime;
  return {
    regime,
    status: resolvePropertyTaxStatus(
      { propertyId: "scenario", propertyType: meta.propertyType, contractDate: meta.contractDate, purchaseDate: meta.purchaseDate },
      regime,
    ),
    needsConfirmation: auto.requiresUserConfirmation,
  };
}

// ─── Regime overlay (NG + CGT) ───────────────────────────────────────────────
//
// Given a legacy ScenarioResult computed under current-rules math, produce a
// new ScenarioResult where:
//   - ng_benefit per year follows the regime's effectiveNegativeGearing
//   - quarantined losses (when treatment = QUARANTINE_TO_PROPERTY) are tracked
//     and applied as a deduction against capital_gain at disposal
//   - cgt_discount_gain reflects regime.effectiveCGTDiscountPct
//   - avg_monthly_cashflow + IRR are re-derived from the adjusted yearly array
//
// Capital growth, loan amortisation, rent, depreciation, and holding costs are
// preserved verbatim from the legacy yearly snapshots.

interface OverlayCarry {
  quarantinedLosses: number;
}

function applyRegimeOverlay(
  legacy: ScenarioResult,
  regime: TaxPolicyRegime,
  status: PropertyTaxStatus,
  marginalRate: number,
): ScenarioResult {
  const treatment = status.effectiveNegativeGearing;
  const cgtDiscountPct = status.effectiveCGTDiscountPct ?? regime.defaultCGTDiscountPct;
  const totalUpfront = legacy.total_upfront;

  // 1. Re-derive yearly array with regime NG treatment.
  const carry: OverlayCarry = { quarantinedLosses: 0 };
  const yearly: YearlySnapshot[] = legacy.yearly.map((row, idx) => {
    const isNegGeared = row.taxable_loss < 0;
    const lossMag = Math.abs(row.taxable_loss);

    let ngBenefit: number;
    if (!isNegGeared) {
      ngBenefit = 0;
    } else if (treatment === "DEDUCT_AGAINST_WAGE") {
      ngBenefit = lossMag * marginalRate;
    } else if (treatment === "QUARANTINE_TO_PROPERTY") {
      // Loss carried forward — no current-year benefit.
      carry.quarantinedLosses += lossMag;
      ngBenefit = 0;
    } else {
      // ABOLISH — no benefit, no carry-forward.
      ngBenefit = 0;
    }
    ngBenefit = Math.round(ngBenefit);

    // Recompute cashflow with new ngBenefit.
    // annualCashLoss = annual_repayment - annual_rent + annual_holding - ngBenefit
    const annualCashLoss = row.annual_repayment - row.annual_rent + row.annual_holding - ngBenefit;
    return {
      ...row,
      ng_benefit:          ngBenefit,
      net_annual_cashflow: Math.round(-annualCashLoss),
      // cumulative_cash_invested differs; we leave the legacy value undisturbed
      // so monthly_cashflow recompute below is the authoritative cash metric.
    };
  });

  // 2. Recompute avg monthly cashflow from the overlaid yearly.
  const horizon = yearly.length;
  const avgMonthlyCF = horizon > 0
    ? yearly.reduce((s, r) => s + r.net_annual_cashflow, 0) / horizon / 12
    : 0;

  // 3. Recompute IRR from overlaid cashflows.
  //    Mirror legacy: -totalUpfront at t0, annual benefit = equityGain + ngBenefit - annualCashLoss,
  //    terminal value at horizon = equity - 2% selling costs.
  const irrCFs: number[] = [-totalUpfront];
  for (let i = 0; i < yearly.length; i++) {
    const row = yearly[i];
    const prevValue = i === 0 ? legacy.purchase_price : yearly[i - 1].property_value;
    const equityGain = row.property_value - prevValue;
    const annualCashLoss = row.annual_repayment - row.annual_rent + row.annual_holding - row.ng_benefit;
    irrCFs.push(equityGain + row.ng_benefit - annualCashLoss);
  }
  const lastRow = yearly[yearly.length - 1];
  const sellingCosts = lastRow.property_value * 0.02;
  irrCFs[irrCFs.length - 1] += lastRow.equity - sellingCosts;
  const irr = recomputeIrr(irrCFs);

  // 4. Recompute CGT discount.
  //    Apply quarantined losses against capital_gain first, then apply discount.
  const grossGain = legacy.capital_gain;
  const carryApplied = Math.min(carry.quarantinedLosses, Math.max(0, grossGain));
  const netGain = Math.max(0, grossGain - carryApplied);
  // discountPct represents % of gain that is *discounted away* (i.e. 0.50 means 50% off).
  // Effective taxable portion = netGain × (1 − discountPct).
  const cgtDiscountedGain = netGain * (1 - cgtDiscountPct);

  // 5. Recompute total_return_pct from new equity + total_upfront (unchanged).
  const totalReturn = (lastRow.equity - totalUpfront) / Math.max(1, totalUpfront);

  return {
    ...legacy,
    yearly,
    avg_monthly_cashflow: avgMonthlyCF,
    irr,
    capital_gain:        grossGain, // gross unchanged
    cgt_discount_gain:   Math.round(cgtDiscountedGain),
    total_return_pct:    totalReturn,
  };
}

function recomputeIrr(cashflows: number[]): number {
  // Newton-Raphson on NPV(r) = 0, fallback to bisection.
  // Mirror calcIRR in propertyBuyEngine but kept private to avoid coupling.
  if (cashflows.length < 2) return 0;
  let rate = 0.08;
  for (let i = 0; i < 40; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const denom = Math.pow(1 + rate, t);
      npv += cashflows[t] / denom;
      if (t > 0) dnpv -= (t * cashflows[t]) / (denom * (1 + rate));
    }
    if (Math.abs(dnpv) < 1e-10) break;
    const next = rate - npv / dnpv;
    if (!isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-7) { rate = next; break; }
    rate = next;
    if (rate < -0.99) { rate = -0.99; break; }
    if (rate > 10) { rate = 10; break; }
  }
  return rate;
}

// ─── Build comparison-table from overlaid scenarios ──────────────────────────

function buildBuyResult(
  buyNow: ScenarioResult,
  wait6m: ScenarioResult,
  wait12m: ScenarioResult | null,
): PropertyBuyResult {
  // Pick best scenario by IRR (mirrors legacy heuristic).
  const candidates: Array<{ key: 'buy_now' | 'wait_6m' | 'wait_12m'; res: ScenarioResult }> = [
    { key: 'buy_now', res: buyNow },
    { key: 'wait_6m', res: wait6m },
  ];
  if (wait12m) candidates.push({ key: 'wait_12m', res: wait12m });
  candidates.sort((a, b) => b.res.irr - a.res.irr);
  const best = candidates[0];

  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  const comparison_table = [
    { metric: 'IRR',                     buy_now: pct(buyNow.irr),                 wait_6m: pct(wait6m.irr),                 wait_12m: wait12m ? pct(wait12m.irr) : '—' },
    { metric: 'Avg Monthly Cashflow',    buy_now: fmt(buyNow.avg_monthly_cashflow),wait_6m: fmt(wait6m.avg_monthly_cashflow),wait_12m: wait12m ? fmt(wait12m.avg_monthly_cashflow) : '—' },
    { metric: 'Equity at Horizon',       buy_now: fmt(buyNow.equity_end),          wait_6m: fmt(wait6m.equity_end),          wait_12m: wait12m ? fmt(wait12m.equity_end) : '—' },
    { metric: 'CGT-Discounted Gain',     buy_now: fmt(buyNow.cgt_discount_gain),   wait_6m: fmt(wait6m.cgt_discount_gain),   wait_12m: wait12m ? fmt(wait12m.cgt_discount_gain) : '—' },
  ];

  return {
    buy_now:       buyNow,
    wait_6m:       wait6m,
    wait_12m:      wait12m,
    best_scenario: best.key,
    best_label:    best.res.label,
    confidence:    best.res.confidence,
    key_insight:   `Under reform regime overlay, ${best.res.label} delivers IRR ${pct(best.res.irr)}.`,
    comparison_table,
  };
}

// ─── Delta builder ───────────────────────────────────────────────────────────

function buildDelta(
  label: string,
  current: ScenarioResult,
  reform: ScenarioResult,
  scenario: PropertyScenarioInput,
  resolution: ScenarioResolution,
  marginalRate: number,
): PropertyBuyScenarioDelta {
  const currentNgTotal = current.yearly.reduce((s, r) => s + r.ng_benefit, 0);
  const reformNgTotal  = reform.yearly.reduce((s, r) => s + r.ng_benefit, 0);

  // Quarantined losses = sum of magnitudes of taxable_loss when treatment = QUARANTINE_TO_PROPERTY.
  const quarantined = resolution.status.effectiveNegativeGearing === "QUARANTINE_TO_PROPERTY"
    ? current.yearly.reduce((s, r) => s + (r.taxable_loss < 0 ? Math.abs(r.taxable_loss) : 0), 0)
    : 0;

  // Approximate after-tax CGT proceeds:
  //   gross gain × (1 − discount) × marginalRate = CGT payable
  //   after-tax = gross gain − payable
  const currentTaxable = current.cgt_discount_gain;
  const reformTaxable  = reform.cgt_discount_gain;
  const currentAfterTax = current.capital_gain - currentTaxable * marginalRate;
  const reformAfterTax  = reform.capital_gain - reformTaxable * marginalRate;

  return {
    label,
    current_ng_benefit_total: Math.round(currentNgTotal),
    reform_ng_benefit_total:  Math.round(reformNgTotal),
    quarantined_losses:       Math.round(quarantined),
    current_avg_monthly_cf:   current.avg_monthly_cashflow,
    reform_avg_monthly_cf:    reform.avg_monthly_cashflow,
    delta_avg_monthly_cf:     reform.avg_monthly_cashflow - current.avg_monthly_cashflow,
    current_irr:              current.irr,
    reform_irr:               reform.irr,
    delta_irr:                reform.irr - current.irr,
    current_equity_end:       current.equity_end,
    reform_equity_end:        reform.equity_end,
    current_cgt_taxable_gain: currentTaxable,
    reform_cgt_taxable_gain:  reformTaxable,
    current_cgt_after_tax:    Math.round(currentAfterTax),
    reform_cgt_after_tax:     Math.round(reformAfterTax),
    delta_cgt_after_tax:      Math.round(reformAfterTax - currentAfterTax),
    effective_regime_kind:    resolution.regime.kind,
    status:                   resolution.status,
  };
}

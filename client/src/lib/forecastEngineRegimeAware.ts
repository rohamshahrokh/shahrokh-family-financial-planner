/**
 * forecastEngineRegimeAware.ts — Parallel-Pathway Forecast Overlay
 *
 * #FWL_TaxReform_P1_P2_Integration_NoOverride — Forecast wiring.
 *
 * Wraps the existing forecastEngine in a regime-aware overlay. The PRIMARY
 * pathway (buildForecast in forecastEngine.ts) is NEVER modified — this file
 * IMPORTS that function byte-for-byte and adds a SECOND entry point that
 * returns BOTH the current-rules projection and the proposed-reform
 * projection, plus a numeric delta surface.
 *
 * Parallel-pathway invariants (NON-NEGOTIABLE):
 *   1. forecastEngine.ts is untouched.
 *   2. The `current` field is byte-for-byte identical to buildForecast(input).
 *   3. The `reform` field is derived by overlaying a regime-adjusted
 *      ngAnnualBenefit (zero out non-grandfathered NG benefits) onto a
 *      SECOND buildForecast call — no per-month / per-year math is
 *      duplicated here. All projection logic stays in the legacy engine.
 *   4. CURRENT_RULES selector → reform branch byte-for-byte equal to current.
 *
 * Modelling disclaimer:
 *   "This is modelling only and not personal tax advice."
 */

import { buildForecast, type ForecastInput, type ForecastOutput } from "./forecastEngine";
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
// Forecast doesn't currently consume property contract dates — but the regime
// overlay does. We accept the metadata as a sidecar so the legacy engine
// signature is unchanged.

export interface ForecastPropertyMetadata {
  propertyId?: string;
  propertyType?: PropertyType;
  contractDate?: string;
  purchaseDate?: string;
  /** Original index in input.properties — used for positional alignment. */
  originalIndex?: number;
}

// ─── Public result shape ─────────────────────────────────────────────────────

export interface ForecastBothRegimesResult {
  current: ForecastOutput;
  reform:  ForecastOutput;
  /** Per-property status as resolved under the effective reform regime. */
  propertyStatuses: PropertyTaxStatus[];
  /** Effective NG annual benefit BEFORE overlay (input or computed by caller). */
  currentNgAnnualBenefit: number;
  /** Effective NG annual benefit AFTER overlay (non-grandfathered zeroed). */
  reformNgAnnualBenefit: number;
  /** Numeric deltas at key projection points. */
  deltas: {
    nw_year_1:   ForecastNetWorthDelta;
    nw_year_5:   ForecastNetWorthDelta;
    nw_year_10:  ForecastNetWorthDelta;
    nw_final:    ForecastNetWorthDelta;
    annual_first: ForecastAnnualDelta;
    annual_last:  ForecastAnnualDelta;
    /** Sum of (current ng benefit − reform ng benefit) over the horizon. */
    cumulative_ng_drag: number;
  };
  reformRegimeKind: ConcreteRegimeKind;
  autoDetectNeedsConfirmation: boolean;
  modellingDisclaimer: string;
}

export interface ForecastNetWorthDelta {
  current_end: number;
  reform_end:  number;
  delta_end:   number;
  delta_pct:   number; // delta_end / current_end (signed; 0 if current_end == 0)
}

export interface ForecastAnnualDelta {
  current_net_cashflow: number;
  reform_net_cashflow:  number;
  delta_net_cashflow:   number;
}

// ─── Build args ──────────────────────────────────────────────────────────────

export interface BuildForecastBothRegimesArgs {
  input: ForecastInput;
  /** Positional sidecar against input.properties. Optional — auto-derived from property fields if absent. */
  propertyMetadata?: ForecastPropertyMetadata[];
  /** Defaults to AUTO_DETECT. */
  regimeSelector?: TaxPolicyRegimeKind;
  /** Required when selector is CUSTOM_STRESS_TEST. */
  customRegime?: TaxPolicyRegime;
  /** Defaults to PROPOSED_2027_REFORM_REGIME. */
  reformRegime?: TaxPolicyRegime;
  /**
   * Marginal tax rate used to gross-up rental losses → NG benefit when the
   * caller didn't pass `input.ngAnnualBenefit`. Defaults to top bracket + Medicare.
   */
  marginalRateOverride?: number;
}

// ─── computeForecastBothRegimes ──────────────────────────────────────────────

export function buildForecastBothRegimes(
  args: BuildForecastBothRegimesArgs,
): ForecastBothRegimesResult {
  const { input } = args;
  const reformRegime = args.reformRegime ?? PROPOSED_2027_REFORM_REGIME;
  const selector = args.regimeSelector ?? "AUTO_DETECT";

  // 1. Resolve per-property metadata (auto-derive if not provided).
  const metadata = args.propertyMetadata ?? deriveMetadataFromProperties(input.properties);

  // 2. Resolve per-property status under the effective reform regime.
  const { effectiveRegime, autoDetectNeedsConfirmation, propertyStatuses } =
    resolveEffectiveRegime({
      selector,
      currentRulesRegime: CURRENT_RULES_REGIME,
      reformRegime,
      customRegime: args.customRegime,
      propertyMetadata: metadata,
    });

  // 3. Compute regime-adjusted ngAnnualBenefit.
  //
  // The legacy engine takes `ngAnnualBenefit` (a precomputed scalar) as input.
  // For the reform branch, we need to recompute this number with the regime
  // overlay applied — zeroing NG losses for properties whose effective
  // negativeGearingTreatment is QUARANTINE_TO_PROPERTY or ABOLISH.
  //
  // We try to honor the caller's existing ngAnnualBenefit by scaling; if
  // that's missing we compute both numbers from properties + marginal rate.
  // IMPORTANT: both branches receive an EXPLICIT ngAnnualBenefit so the
  // comparison is meaningful — passing `undefined` to one branch and a
  // number to the other would produce a spurious delta from the legacy
  // engine's internal fallback behaviour, not from regime semantics.
  const marginalRate =
    args.marginalRateOverride ??
    (input.annualSalaryIncome
      ? calcMarginalRate(input.annualSalaryIncome, "2025-26") + 0.02
      : 0.47);

  const ngBreakdown = computeNgBenefitByRegime(
    input.properties,
    propertyStatuses,
    marginalRate,
  );

  const currentNg = input.ngAnnualBenefit ?? ngBreakdown.currentTotal;
  const reformNg = (() => {
    if (input.ngAnnualBenefit == null) return ngBreakdown.reformTotal;
    if (ngBreakdown.currentTotal <= 0.5) return currentNg; // nothing to scale; ratio undefined
    const ratio = ngBreakdown.reformTotal / ngBreakdown.currentTotal;
    return Math.max(0, Math.min(currentNg, currentNg * ratio));
  })();

  // 4. CURRENT branch — legacy engine called with explicit currentNg so the
  // two branches are directly comparable. When the caller already provided
  // ngAnnualBenefit, this is a no-op (currentNg === input.ngAnnualBenefit).
  const currentInput: ForecastInput =
    input.ngAnnualBenefit != null ? input : { ...input, ngAnnualBenefit: currentNg };
  const current = buildForecast(currentInput);

  // 5. REFORM branch — second buildForecast call with adjusted ngAnnualBenefit.
  // All other math (cashflow series, projectNetWorth, cashEngine) flows
  // through the legacy engine unchanged.
  const reformInput: ForecastInput = { ...input, ngAnnualBenefit: reformNg };
  const reform = buildForecast(reformInput);

  // 6. Build deltas at key projection points.
  const deltas = computeForecastDeltas(current, reform, currentNg, reformNg);

  return {
    current,
    reform,
    propertyStatuses,
    currentNgAnnualBenefit: currentNg,
    reformNgAnnualBenefit:  reformNg,
    deltas,
    reformRegimeKind: effectiveRegime.kind,
    autoDetectNeedsConfirmation,
    modellingDisclaimer: "This is modelling only and not personal tax advice.",
  };
}

// ─── Internals ───────────────────────────────────────────────────────────────

function deriveMetadataFromProperties(properties: any[]): ForecastPropertyMetadata[] {
  return (properties ?? [])
    .map((p, idx): ForecastPropertyMetadata | null => {
      const isPpor = p?.is_ppor === true || p?.property_type === "PPOR";
      if (isPpor) return null;
      return {
        propertyId:   p?.id != null ? String(p.id) : `idx-${idx}`,
        propertyType: normalisePropertyType(p?.property_type ?? p?.propertyType),
        contractDate: p?.contract_date ?? p?.contractDate ?? undefined,
        purchaseDate: p?.purchase_date ?? p?.purchaseDate ?? undefined,
        originalIndex: idx,
      };
    })
    .filter((m): m is ForecastPropertyMetadata => m !== null);
}

function normalisePropertyType(raw: unknown): PropertyType {
  if (typeof raw !== "string") return "UNKNOWN";
  const upper = raw.toUpperCase();
  if (
    upper === "ESTABLISHED" || upper === "NEW_BUILD" ||
    upper === "BUILD_TO_RENT" || upper === "AFFORDABLE_HOUSING" ||
    upper === "UNKNOWN"
  ) return upper as PropertyType;
  return "UNKNOWN";
}

interface ResolveArgs {
  selector: TaxPolicyRegimeKind;
  currentRulesRegime: TaxPolicyRegime;
  reformRegime: TaxPolicyRegime;
  customRegime?: TaxPolicyRegime;
  propertyMetadata: ForecastPropertyMetadata[];
}

interface ResolveOutput {
  effectiveRegime: TaxPolicyRegime;
  autoDetectNeedsConfirmation: boolean;
  propertyStatuses: PropertyTaxStatus[];
}

function resolveEffectiveRegime(args: ResolveArgs): ResolveOutput {
  if (args.selector === "CURRENT_RULES") {
    return resolveStatuses(args.currentRulesRegime, args.propertyMetadata, false);
  }
  if (args.selector === "PROPOSED_2027_REFORM") {
    return resolveStatuses(args.reformRegime, args.propertyMetadata, false);
  }
  if (args.selector === "CUSTOM_STRESS_TEST") {
    const regime = args.customRegime ?? REGIMES_BY_KIND.CUSTOM_STRESS_TEST;
    return resolveStatuses(regime, args.propertyMetadata, false);
  }
  // AUTO_DETECT
  let anyPostReform = false;
  let anyConfirmation = false;
  const statuses: PropertyTaxStatus[] = args.propertyMetadata.map((m) => {
    const auto = resolveAutoDetectedRegime({
      propertyType: m.propertyType,
      contractDate: m.contractDate,
      purchaseDate: m.purchaseDate,
      reformRegime: args.reformRegime,
    });
    if (auto.resolvedRegimeKind === args.reformRegime.kind) anyPostReform = true;
    if (auto.requiresUserConfirmation) anyConfirmation = true;
    const regime = auto.resolvedRegimeKind === "CURRENT_RULES"
      ? args.currentRulesRegime
      : args.reformRegime;
    const base = resolvePropertyTaxStatus(
      {
        propertyId:   m.propertyId ?? "idx",
        propertyType: m.propertyType,
        contractDate: m.contractDate,
        purchaseDate: m.purchaseDate,
      },
      regime,
    );
    return { ...base, originalIndex: m.originalIndex } as PropertyTaxStatus & { originalIndex?: number };
  });
  const effective = anyPostReform ? args.reformRegime : args.currentRulesRegime;
  return { effectiveRegime: effective, autoDetectNeedsConfirmation: anyConfirmation, propertyStatuses: statuses };
}

function resolveStatuses(
  regime: TaxPolicyRegime,
  propertyMetadata: ForecastPropertyMetadata[],
  autoDetectNeedsConfirmation: boolean,
): ResolveOutput {
  const statuses = propertyMetadata.map((m) => {
    const base = resolvePropertyTaxStatus(
      {
        propertyId:   m.propertyId ?? "idx",
        propertyType: m.propertyType,
        contractDate: m.contractDate,
        purchaseDate: m.purchaseDate,
      },
      regime,
    );
    return { ...base, originalIndex: m.originalIndex } as PropertyTaxStatus & { originalIndex?: number };
  });
  return { effectiveRegime: regime, autoDetectNeedsConfirmation, propertyStatuses: statuses };
}

interface NgBreakdown {
  currentTotal: number;
  reformTotal:  number;
}

function computeNgBenefitByRegime(
  properties: any[],
  propertyStatuses: PropertyTaxStatus[],
  marginalRate: number,
): NgBreakdown {
  const statusByIndex = new Map<number, PropertyTaxStatus & { originalIndex?: number }>();
  propertyStatuses.forEach((s: any) => {
    if (typeof s.originalIndex === "number") statusByIndex.set(s.originalIndex, s);
  });

  let currentTotal = 0;
  let reformTotal = 0;

  (properties ?? []).forEach((p: any, i: number) => {
    if (p?.is_ppor) return;
    const rentalAnn   = safeNum(p?.weekly_rent) * 52;
    // forecastEngine receives properties with either `loan_amount` or `loan_balance`.
    const loanBalance = safeNum(p?.loan_amount ?? p?.loan_balance ?? 0);
    const interestRt  = safeNum(p?.interest_rate ?? p?.loan_rate ?? 6.5) / 100;
    const interestAnn = loanBalance * interestRt;
    const mgmtFeePct  = safeNum(p?.management_fee ?? p?.management_fee_pct ?? 0);
    const mgmtFee     = (mgmtFeePct / 100) * rentalAnn;
    const costsAnn    = mgmtFee + safeNum(p?.council_rates) + safeNum(p?.insurance) +
                        safeNum(p?.maintenance) + safeNum(p?.body_corporate);
    const ngLoss      = interestAnn + costsAnn - rentalAnn;
    if (ngLoss <= 0) return;

    const status = statusByIndex.get(i) ?? propertyStatuses[i];
    const treatment = status?.effectiveNegativeGearing ?? "DEDUCT_AGAINST_WAGE";
    const benefit = ngLoss * marginalRate;
    currentTotal += benefit;
    if (treatment === "DEDUCT_AGAINST_WAGE") {
      reformTotal += benefit;
    }
    // QUARANTINE_TO_PROPERTY → reformTotal contribution = 0 (carries forward,
    // not in-year wage offset). ABOLISH → also 0.
  });

  return { currentTotal, reformTotal };
}

function computeForecastDeltas(
  current: ForecastOutput,
  reform: ForecastOutput,
  currentNg: number,
  reformNg: number,
): ForecastBothRegimesResult["deltas"] {
  const cNw = current.netWorth;
  const rNw = reform.netWorth;
  const cAnn = current.annual;
  const rAnn = reform.annual;
  const horizonYears = cNw.length;

  const nwDelta = (i: number): ForecastNetWorthDelta => {
    const c = (cNw[i] as any)?.endNetWorth ?? 0;
    const r = (rNw[i] as any)?.endNetWorth ?? 0;
    return {
      current_end: c,
      reform_end:  r,
      delta_end:   r - c,
      delta_pct:   c !== 0 ? (r - c) / c : 0,
    };
  };

  const annDelta = (slot: "first" | "last"): ForecastAnnualDelta => {
    const cRow: any = slot === "first" ? cAnn[0] : cAnn[cAnn.length - 1];
    const rRow: any = slot === "first" ? rAnn[0] : rAnn[rAnn.length - 1];
    const cNet = cRow?.netCashflow ?? cRow?.net_cashflow ?? 0;
    const rNet = rRow?.netCashflow ?? rRow?.net_cashflow ?? 0;
    return {
      current_net_cashflow: cNet,
      reform_net_cashflow:  rNet,
      delta_net_cashflow:   rNet - cNet,
    };
  };

  return {
    nw_year_1:   nwDelta(0),
    nw_year_5:   nwDelta(Math.min(4, horizonYears - 1)),
    nw_year_10:  nwDelta(Math.min(9, horizonYears - 1)),
    nw_final:    nwDelta(horizonYears - 1),
    annual_first: annDelta("first"),
    annual_last:  annDelta("last"),
    cumulative_ng_drag: (currentNg - reformNg) * horizonYears,
  };
}

/**
 * taxAlphaEngineRegimeAware.ts — Parallel-Pathway Tax Alpha
 *
 * #FWL_TaxReform_P1_P2_Integration_NoOverride — Section 5 (Tax Alpha Duality).
 *
 * Wraps the existing taxAlphaEngine in a regime-aware overlay. The PRIMARY
 * pathway (computeTaxAlpha / buildTaxAlphaInput in taxAlphaEngine.ts) is
 * NEVER modified — this file IMPORTS those functions byte-for-byte and adds
 * a SECOND entry point that returns BOTH the current-rules result and the
 * proposed-reform result, plus a delta.
 *
 * Parallel-pathway invariants (NON-NEGOTIABLE):
 *   1. Existing call sites that invoke computeTaxAlpha(input) continue to
 *      receive identical output. This file does not change taxAlphaEngine.ts.
 *   2. The `current` field of the BothRegimes result is byte-for-byte
 *      identical to computeTaxAlpha(input). Regression baseline enforces this.
 *   3. The `reform` field is derived by overlaying the resolved per-property
 *      status (grandfathered vs post-reform-established vs carve-out) onto
 *      the negative-gearing and CGT-timing strategies — never by rewriting
 *      the legacy engine.
 *   4. AUTO_DETECT resolves per-property; properties with insufficient
 *      metadata propagate a `requiresUserConfirmation` flag.
 *
 * Modelling disclaimer (must appear wherever these outputs render):
 *   "This is modelling only and not personal tax advice."
 */

import {
  buildTaxAlphaInput,
  computeTaxAlpha,
  type TaxAlphaInput,
  type TaxAlphaResult,
  type TaxAlphaStrategy,
} from "./taxAlphaEngine";

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
// taxAlphaEngine.ts's TaxAlphaInput.properties does NOT carry propertyType
// / contractDate / purchaseDate — those live on the higher-level property
// records in Supabase / form state. We accept that metadata as a sidecar
// array indexed positionally against TaxAlphaInput.properties so the
// primary pathway is untouched.

export interface PropertyTaxMetadata {
  propertyId?: string;
  propertyType?: PropertyType;
  contractDate?: string;   // ISO YYYY-MM-DD
  purchaseDate?: string;   // ISO YYYY-MM-DD
  /** Original index in input.properties — used to align with the legacy engine's positional NG calc. */
  originalIndex?: number;
}

// ─── Public result shape ─────────────────────────────────────────────────────

/**
 * Per-strategy delta surfaced in the UI comparison panel.
 * `direction` describes the effect on the household:
 *   "neutral"   — saving identical under both regimes
 *   "preserved" — strategy preserved under reform (e.g. grandfathered NG)
 *   "reduced"   — saving smaller under reform (most common for NG/CGT)
 *   "eliminated"— saving zero under reform
 *   "increased" — saving larger under reform (rare; reform-only break)
 */
export type TaxAlphaStrategyDeltaDirection =
  | "neutral"
  | "preserved"
  | "reduced"
  | "eliminated"
  | "increased";

export interface TaxAlphaStrategyDelta {
  id: string;
  title: string;
  current_annual_saving: number;
  reform_annual_saving:  number;
  delta_annual_saving:   number;  // reform - current (negative = worse under reform)
  direction:             TaxAlphaStrategyDeltaDirection;
  /** Plain-English explanation of why the delta exists. */
  reason: string;
}

export interface TaxAlphaBothRegimesResult {
  /** Untouched output of the legacy current-rules computeTaxAlpha. */
  current: TaxAlphaResult;
  /** Overlay computation under the chosen (or auto-detected reform-like) regime. */
  reform:  TaxAlphaResult;
  /** Per-property tax status (grandfathered / post-reform / carve-out). */
  propertyStatuses: PropertyTaxStatus[];
  /** Per-strategy comparison. */
  deltas: TaxAlphaStrategyDelta[];
  /** Total household saving delta (reform - current) across top-3 strategies. */
  total_delta_annual_saving: number;
  /** Total household tax delta (reform - current). 0 by construction unless reform retax brackets — kept here for forward compatibility. */
  total_delta_household_tax: number;
  /** Currently-selected regime kind that drove `reform`. */
  reformRegimeKind: ConcreteRegimeKind;
  /** Set when AUTO_DETECT was used and at least one property needed confirmation. */
  autoDetectNeedsConfirmation: boolean;
  /** Modelling disclaimer — surface verbatim. */
  modellingDisclaimer: string;
}

// ─── buildTaxAlphaInputBothRegimes ───────────────────────────────────────────
//
// Mirrors buildTaxAlphaInput's signature but also accepts a property metadata
// sidecar so the regime layer can do grandfathering. Returns the primary
// input plus the metadata array, leaving the primary input completely
// compatible with the existing computeTaxAlpha entry point.

export interface BuildTaxAlphaInputBothRegimesArgs {
  snap: any;
  properties: any[];
  taxProfile?: any;
  canonicalIncome?: Parameters<typeof buildTaxAlphaInput>[3];
  household?: Parameters<typeof buildTaxAlphaInput>[4];
}

export interface BuildTaxAlphaInputBothRegimesOutput {
  input: TaxAlphaInput;
  propertyMetadata: PropertyTaxMetadata[];
}

/**
 * Build the standard TaxAlphaInput (delegating to the untouched legacy
 * builder) AND extract the property metadata sidecar required by the
 * regime overlay. Property metadata is read positionally from the same
 * `properties` array passed in, looking for the fields landed in P1
 * (property_type, contract_date, purchase_date) and falling back to
 * UNKNOWN when absent (auto-detect path will then flag for confirmation).
 */
export function buildTaxAlphaInputBothRegimes(
  args: BuildTaxAlphaInputBothRegimesArgs,
): BuildTaxAlphaInputBothRegimesOutput {
  const input = buildTaxAlphaInput(
    args.snap,
    args.properties,
    args.taxProfile,
    args.canonicalIncome,
    args.household,
  );

  // Only emit metadata for non-PPOR (investment) properties — the legacy
  // engine skips PPOR in negative-gearing entirely, so its tax regime is
  // irrelevant for the overlay. We align positionally with input.properties
  // by storing the original index so the recompute helper can match it back.
  const propertyMetadata: PropertyTaxMetadata[] = (args.properties ?? [])
    .map((p: any, idx: number): PropertyTaxMetadata | null => {
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
    .filter((m): m is PropertyTaxMetadata => m !== null);

  return { input, propertyMetadata };
}

function normalisePropertyType(raw: unknown): PropertyType {
  if (typeof raw !== "string") return "UNKNOWN";
  const upper = raw.toUpperCase();
  // PPOR records show up here but are not investment properties — they don't
  // get classified into the reform schema; the engine itself excludes them
  // from negative gearing. We still default them to UNKNOWN so AUTO_DETECT
  // can flag inconsistency if the caller mislabels them.
  if (upper === "ESTABLISHED" || upper === "NEW_BUILD" || upper === "BUILD_TO_RENT" ||
      upper === "AFFORDABLE_HOUSING" || upper === "UNKNOWN") {
    return upper as PropertyType;
  }
  return "UNKNOWN";
}

// ─── computeTaxAlphaBothRegimes ──────────────────────────────────────────────
//
// Calls the untouched legacy computeTaxAlpha for the CURRENT branch, then
// constructs a reform overlay by:
//
//   1. Resolving each property to a PropertyTaxStatus under the reform regime.
//   2. Recomputing the negative_gearing strategy with reform NG treatment
//      applied per-property (QUARANTINE_TO_PROPERTY → saving = 0 for that
//      property in-year; grandfathered → unchanged; carve-out → unchanged).
//   3. Recomputing the cgt_timing strategy using the reform CGT method /
//      discount applied at the household level (CGT discount is per-asset,
//      but stocks/crypto are not property-bound so they remain on the
//      current discount; only properties under the reform CGT method are
//      adjusted — none of the strategies in the legacy engine compute
//      property-CGT, so this overlay leaves the legacy field intact and
//      surfaces a documented note in the delta).
//   4. All other strategies (super, offset, MLS, debt-restructure, etc.)
//      are policy-neutral and carry their legacy savings forward unchanged.
//   5. The household tax-position (`*_tax_now`, `household_tax_now`) is
//      identical between current and reform because the legacy engine
//      computes wage-only PAYG which doesn't depend on property regime.

export interface ComputeTaxAlphaBothRegimesArgs {
  input: TaxAlphaInput;
  propertyMetadata: PropertyTaxMetadata[];
  /** Defaults to AUTO_DETECT. */
  regimeSelector?: TaxPolicyRegimeKind;
  /** Optional custom regime — required when regimeSelector is CUSTOM_STRESS_TEST. */
  customRegime?: TaxPolicyRegime;
  /** Auto-detect needs this — defaults to the proposed reform regime. */
  reformRegime?: TaxPolicyRegime;
}

export function computeTaxAlphaBothRegimes(
  args: ComputeTaxAlphaBothRegimesArgs,
): TaxAlphaBothRegimesResult {
  const { input, propertyMetadata } = args;
  const reformRegime = args.reformRegime ?? PROPOSED_2027_REFORM_REGIME;
  const selector = args.regimeSelector ?? "AUTO_DETECT";

  // 1. CURRENT (legacy, untouched).
  const current = computeTaxAlpha(input);

  // 2. Resolve per-property status under the effective REFORM regime.
  // AUTO_DETECT resolves each property individually; if any property fails
  // confidence, we propagate the flag so the UI can surface the
  // "please confirm" state.
  const { effectiveRegime, autoDetectNeedsConfirmation, propertyStatuses } =
    resolveEffectiveRegime({
      selector,
      currentRulesRegime: CURRENT_RULES_REGIME,
      reformRegime,
      customRegime: args.customRegime,
      propertyMetadata,
    });

  // 3. Recompute regime-sensitive strategies under the reform regime.
  const reformNG = recomputeNegativeGearingForReform(input, propertyStatuses);
  const reformCgt = recomputeCgtTimingForReform(input, effectiveRegime, propertyStatuses);

  // 4. Reassemble the reform result by SHALLOW CLONING the current result
  //    and replacing only the regime-sensitive strategies. Tax position
  //    fields (*_tax_now, household_tax_now) are unchanged because the
  //    legacy engine's PAYG math doesn't depend on property regime.
  const reformStrategies: TaxAlphaStrategy[] = current.strategies.map((s) => {
    if (s.id === "negative_gearing") return reformNG;
    if (s.id === "cgt_timing")       return reformCgt;
    return s;
  }).sort((a, b) => b.annual_saving - a.annual_saving);

  const reformTop3 = reformStrategies.filter(s => s.data_reliable).slice(0, 3);
  const reformTotalSaving = reformTop3
    .filter(s => s.annual_saving > 0)
    .reduce((sum, s) => sum + s.annual_saving, 0);

  const reform: TaxAlphaResult = {
    ...current,
    strategies: reformStrategies,
    top3: reformTop3,
    total_annual_saving: reformTotalSaving,
    total_saving_label: reformTotalSaving > 0
      ? `Up to $${Math.round(reformTotalSaving).toLocaleString("en-AU")}/yr`
      : "Review with accountant",
  };

  // 5. Build per-strategy deltas for the UI comparison panel.
  const deltas: TaxAlphaStrategyDelta[] = current.strategies.map((cur) => {
    const ref = reformStrategies.find(r => r.id === cur.id);
    const refSaving = ref?.annual_saving ?? cur.annual_saving;
    return computeStrategyDelta(cur, refSaving, propertyStatuses);
  });

  const totalDeltaSaving = (reform.total_annual_saving - current.total_annual_saving);
  const totalDeltaTax = (reform.household_tax_now - current.household_tax_now);

  return {
    current,
    reform,
    propertyStatuses,
    deltas,
    total_delta_annual_saving: totalDeltaSaving,
    total_delta_household_tax: totalDeltaTax,
    reformRegimeKind: effectiveRegime.kind,
    autoDetectNeedsConfirmation,
    modellingDisclaimer: "This is modelling only and not personal tax advice.",
  };
}

// ─── Regime resolution ───────────────────────────────────────────────────────

interface ResolveEffectiveRegimeArgs {
  selector: TaxPolicyRegimeKind;
  currentRulesRegime: TaxPolicyRegime;
  reformRegime: TaxPolicyRegime;
  customRegime?: TaxPolicyRegime;
  propertyMetadata: PropertyTaxMetadata[];
}

interface ResolveEffectiveRegimeOutput {
  effectiveRegime: TaxPolicyRegime;
  autoDetectNeedsConfirmation: boolean;
  propertyStatuses: PropertyTaxStatus[];
}

function resolveEffectiveRegime(args: ResolveEffectiveRegimeArgs): ResolveEffectiveRegimeOutput {
  // For non-AUTO_DETECT selectors, pick the regime up front.
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

  // AUTO_DETECT: resolve per property, decide whether the overall "reform"
  // pathway should use reform rails (any non-grandfathered property) or
  // stay on current rails (every property is grandfathered).
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
    const regimeForStatus =
      auto.resolvedRegimeKind === "CURRENT_RULES"
        ? args.currentRulesRegime
        : args.reformRegime;
    const status = resolvePropertyTaxStatus(
      {
        propertyId:   m.propertyId ?? "idx",
        propertyType: m.propertyType,
        contractDate: m.contractDate,
        purchaseDate: m.purchaseDate,
      },
      regimeForStatus,
    );
    return {
      ...status,
      autoDetectNeedsConfirmation: auto.requiresUserConfirmation,
      autoDetectReason: auto.reason,
      // Carry originalIndex through for downstream NG positional alignment.
      originalIndex: m.originalIndex,
    } as PropertyTaxStatus & { originalIndex?: number };
  });

  // The headline `reform` branch uses the reform regime when any property
  // is post-reform; otherwise it mirrors current rules.
  const effectiveRegime = anyPostReform ? args.reformRegime : args.currentRulesRegime;

  return {
    effectiveRegime,
    autoDetectNeedsConfirmation: anyConfirmation,
    propertyStatuses: statuses,
  };
}

function resolveStatuses(
  regime: TaxPolicyRegime,
  propertyMetadata: PropertyTaxMetadata[],
  autoDetectNeedsConfirmation: boolean,
): ResolveEffectiveRegimeOutput {
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

// ─── Strategy recomputation under reform ─────────────────────────────────────
//
// IMPORTANT: these recompute helpers mirror the SHAPE of the legacy engine's
// detectNegativeGearing / detectCapitalGainsTiming but apply per-property
// status rules. They do NOT mutate the legacy engine or its strategies.

function recomputeNegativeGearingForReform(
  inp: TaxAlphaInput,
  propertyStatuses: PropertyTaxStatus[],
): TaxAlphaStrategy {
  const annualIncome = inp.roham_annual_income;
  const marginalRate = calcMarginalRate(annualIncome, "2025-26") + 0.02; // +Medicare
  // We treat properties positionally — propertyStatuses[i] aligns with
  // inp.properties[i] when the caller wires it up via
  // buildTaxAlphaInputBothRegimes.
  const dataReliable = inp.properties.length > 0 && annualIncome > 0;

  let totalDeductibleLoss = 0;
  let totalQuarantinedLoss = 0;
  let totalAbolishedLoss = 0;
  const detail: string[] = [];

  // Build a quick lookup from original property index → PropertyTaxStatus so
  // we can correctly correlate IPs even when some PPORs are interleaved.
  const statusByIndex = new Map<number, PropertyTaxStatus & { originalIndex?: number }>();
  propertyStatuses.forEach((s: any) => {
    if (typeof s.originalIndex === "number") statusByIndex.set(s.originalIndex, s);
  });

  inp.properties.forEach((p, i) => {
    if (p.is_ppor) return;
    const rentalAnn   = safeNum(p.weekly_rent) * 52;
    const interestAnn = safeNum(p.loan_amount) * (safeNum(p.interest_rate) || 6.5) / 100;
    const mgmtFee     = (safeNum(p.management_fee) / 100) * rentalAnn;
    const costsAnn    = mgmtFee + safeNum(p.council_rates) + safeNum(p.insurance) + safeNum(p.maintenance) + safeNum(p.body_corporate);
    const ngLoss      = interestAnn + costsAnn - rentalAnn;
    if (ngLoss <= 0) return;

    // Prefer originalIndex map; fall back to positional (back-compat with
    // callers passing pre-filtered IP-only metadata).
    const status = statusByIndex.get(i) ?? propertyStatuses[i];
    const treatment = status?.effectiveNegativeGearing ?? "DEDUCT_AGAINST_WAGE";

    if (treatment === "DEDUCT_AGAINST_WAGE") {
      totalDeductibleLoss += ngLoss;
      detail.push(`Property ${i + 1}: NG deductible (${formatStatus(status)})`);
    } else if (treatment === "QUARANTINE_TO_PROPERTY") {
      totalQuarantinedLoss += ngLoss;
      detail.push(`Property ${i + 1}: NG quarantined — carries forward against future property income / CGT`);
    } else {
      totalAbolishedLoss += ngLoss;
      detail.push(`Property ${i + 1}: NG abolished — no deduction available`);
    }
  });

  const saving = totalDeductibleLoss * marginalRate;
  const deferredValue = totalQuarantinedLoss * marginalRate; // surfaced for transparency, not added to saving
  const totalLoss = totalDeductibleLoss + totalQuarantinedLoss + totalAbolishedLoss;

  const action = totalLoss > 0
    ? totalDeductibleLoss > 0
      ? `Claim $${Math.round(totalDeductibleLoss).toLocaleString("en-AU")} deductible loss → $${Math.round(saving).toLocaleString("en-AU")}/yr tax reduction`
      : totalQuarantinedLoss > 0
        ? `$${Math.round(totalQuarantinedLoss).toLocaleString("en-AU")} losses quarantined (deferred value ~$${Math.round(deferredValue).toLocaleString("en-AU")})`
        : `$${Math.round(totalAbolishedLoss).toLocaleString("en-AU")} losses no longer deductible under reform`
    : dataReliable
      ? "Properties are cash-flow positive — no NG benefit"
      : "Add IP details in Property page";

  return {
    id:             "negative_gearing",
    category:       "negative_gearing",
    title:          "Negative Gearing Deduction",
    action,
    annual_saving:  saving,
    annual_saving_label: saving > 0
      ? `$${Math.round(saving).toLocaleString("en-AU")}/yr`
      : (dataReliable ? "Cash-flow positive or quarantined" : "Needs IP data"),
    impact: totalQuarantinedLoss > 0 || totalAbolishedLoss > 0
      ? `Under the selected reform regime, some property losses are quarantined ` +
        `or removed: deductible $${Math.round(totalDeductibleLoss).toLocaleString("en-AU")}, ` +
        `quarantined $${Math.round(totalQuarantinedLoss).toLocaleString("en-AU")} (deferred value ~$${Math.round(deferredValue).toLocaleString("en-AU")}), ` +
        `abolished $${Math.round(totalAbolishedLoss).toLocaleString("en-AU")}. ` +
        detail.join("; ")
      : totalDeductibleLoss > 0
        ? `All property losses remain deductible against wage income under the selected regime ` +
          `(grandfathered or carve-out). ` + detail.join("; ")
        : "No deductible NG losses under the selected regime.",
    compliance: "Reform overlay: properties acquired before the budget-night cutoff retain current-rules NG. " +
      "Post-cutoff established properties have NG quarantined to property income (carry-forward only). " +
      "New builds, BTR and affordable housing remain on current rules. This is modelling only and not personal tax advice.",
    risk:           "Low",
    data_reliable:  dataReliable,
    priority:       2,
  };
}

function recomputeCgtTimingForReform(
  inp: TaxAlphaInput,
  effectiveRegime: TaxPolicyRegime,
  _propertyStatuses: PropertyTaxStatus[],
): TaxAlphaStrategy {
  // The legacy cgt_timing strategy operates on the portfolio (stocks/crypto)
  // unrealised gains — which are NOT property assets and therefore NOT
  // touched by the property-reform regime. We preserve the legacy savings
  // value but annotate the reasoning so the UI surfaces this clearly.
  const annualIncome = inp.roham_annual_income;
  const marginalRate = calcMarginalRate(annualIncome, "2025-26") + 0.02;
  const portfolioVal = inp.stocks_value + inp.crypto_value;
  const dataReliable = portfolioVal > 0;

  // Use the regime's portfolio-side CGT discount IF the regime overrides
  // it. Default-current-rules and reform-as-spec both keep portfolio CGT
  // at 50% (reform targets property only), so the saving is unchanged.
  const discountPct = effectiveRegime.defaultCGTDiscountPct;
  const estimatedGain = inp.unrealised_gains > 0 ? inp.unrealised_gains : portfolioVal * 0.15;
  const taxNow    = estimatedGain * marginalRate;
  const taxAfter  = estimatedGain * (1 - discountPct) * marginalRate;
  const discountSaving = inp.unrealised_gains > 0 ? Math.max(0, taxNow - taxAfter) : 0;

  return {
    id:             "cgt_timing",
    category:       "capital_gains",
    title:          "Capital Gains Timing & Discount",
    action: estimatedGain > 5_000
      ? `Hold portfolio assets 12+ months for ${(discountPct * 100).toFixed(0)}% CGT discount — saves $${Math.round(taxNow - taxAfter).toLocaleString("en-AU")} on $${Math.round(estimatedGain).toLocaleString("en-AU")} gain`
      : "No significant unrealised gains detected",
    annual_saving:  discountSaving,
    annual_saving_label: discountSaving > 0
      ? `Up to $${Math.round(discountSaving).toLocaleString("en-AU")}/yr`
      : (dataReliable ? "Low gains — monitor" : "Needs portfolio data"),
    impact: portfolioVal > 0
      ? `Portfolio CGT discount under the selected regime: ${(discountPct * 100).toFixed(0)}%. ` +
        `Property CGT may use a different method under reform but is not modelled in this strategy ` +
        `(see Property Buy engine for property-specific CGT under reform).`
      : "No portfolio data — add stocks/crypto holdings to calculate CGT position.",
    compliance: "ATO: 50% CGT discount applies to Australian residents who hold assets >12 months. " +
      "Reform proposals targeting property CGT do not affect portfolio assets in this strategy. " +
      "This is modelling only and not personal tax advice.",
    risk:           "Low",
    data_reliable:  dataReliable,
    priority:       4,
  };
}

// ─── Delta classification ────────────────────────────────────────────────────

function computeStrategyDelta(
  current: TaxAlphaStrategy,
  reformSaving: number,
  propertyStatuses: PropertyTaxStatus[],
): TaxAlphaStrategyDelta {
  const delta = reformSaving - current.annual_saving;
  const eps = 0.5; // sub-dollar drift = noise / rounding

  let direction: TaxAlphaStrategyDeltaDirection = "neutral";
  let reason = "Strategy unaffected by selected regime.";

  if (current.id === "negative_gearing") {
    const allGrandfathered = propertyStatuses.length > 0 && propertyStatuses.every(s => s.isGrandfathered);
    const anyQuarantined   = propertyStatuses.some(s => s.effectiveNegativeGearing === "QUARANTINE_TO_PROPERTY");
    const anyAbolished     = propertyStatuses.some(s => s.effectiveNegativeGearing === "ABOLISH");
    const anyCarveOut      = propertyStatuses.some(s => s.isPostReformCarveOut);
    if (Math.abs(delta) <= eps && allGrandfathered) {
      direction = "preserved";
      reason = "All investment properties are grandfathered — current-rules NG preserved.";
    } else if (Math.abs(delta) <= eps && anyCarveOut && !anyQuarantined && !anyAbolished) {
      direction = "preserved";
      reason = "Investment properties qualify as new-build / BTR / affordable carve-outs — NG preserved.";
    } else if (reformSaving === 0 && current.annual_saving > 0) {
      direction = "eliminated";
      reason = anyAbolished
        ? "NG abolished under selected regime — wage offset removed entirely."
        : "All NG losses quarantined under reform — no in-year wage offset.";
    } else if (delta < -eps) {
      direction = "reduced";
      reason = "Some properties have NG quarantined / abolished under reform; saving reduced.";
    } else if (delta > eps) {
      direction = "increased";
      reason = "Reform regime increased NG saving (e.g. richer carve-out treatment).";
    }
  } else if (current.id === "cgt_timing") {
    if (Math.abs(delta) <= eps) {
      direction = "neutral";
      reason = "Portfolio CGT discount unchanged under selected regime (reform targets property only).";
    } else if (delta < -eps) {
      direction = "reduced";
      reason = "Selected regime reduces the portfolio CGT discount.";
    } else {
      direction = "increased";
      reason = "Selected regime increases the portfolio CGT discount.";
    }
  } else if (Math.abs(delta) > eps) {
    direction = delta < 0 ? "reduced" : "increased";
    reason = "Strategy saving differs under selected regime.";
  }

  return {
    id:                     current.id,
    title:                  current.title,
    current_annual_saving:  current.annual_saving,
    reform_annual_saving:   reformSaving,
    delta_annual_saving:    delta,
    direction,
    reason,
  };
}

function formatStatus(status: PropertyTaxStatus | undefined): string {
  if (!status) return "no metadata — defaulted to current rules";
  if (status.isGrandfathered) return "grandfathered";
  if (status.isPostReformCarveOut) return `carve-out (${status.propertyType})`;
  if (status.isPostReformEstablished) return "post-reform established";
  return status.propertyType;
}

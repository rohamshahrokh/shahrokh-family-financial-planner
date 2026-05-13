/**
 * firePathEngineRegimeAware.ts — Parallel-Pathway FIRE Overlay
 *
 * #FWL_TaxReform_P1_P2_Integration_NoOverride — FIRE wiring.
 *
 * Wraps the existing firePathEngine in a regime-aware overlay. The PRIMARY
 * pathway (computeFirePath / buildFirePathInput in firePathEngine.ts) is
 * NEVER modified — this file IMPORTS those functions and adds a SECOND
 * entry point that returns BOTH the current-rules FIRE result and the
 * proposed-reform FIRE result, plus a year-delta surface.
 *
 * Parallel-pathway invariants (NON-NEGOTIABLE):
 *   1. firePathEngine.ts is untouched.
 *   2. The `current` branch is byte-for-byte identical to legacy
 *      computeFirePath(buildFirePathInput(...)).
 *   3. The `reform` branch is derived by reducing the user's monthly
 *      surplus by the regime's monthly NG drag (currentNg − reformNg) / 12
 *      and re-running the legacy engine with the adjusted snapshot.
 *      All simulation math stays in the legacy engine.
 *   4. CURRENT_RULES selector → reform branch byte-for-byte equal to current.
 *
 * Modelling disclaimer:
 *   "This is modelling only and not personal tax advice."
 */

import {
  buildFirePathInput,
  computeFirePath,
  type FIREPathInput,
  type FIREPathResult,
  type FIRESettings,
} from "./firePathEngine";
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

export interface FirePropertyMetadata {
  propertyId?: string;
  propertyType?: PropertyType;
  contractDate?: string;
  purchaseDate?: string;
  originalIndex?: number;
}

// ─── Public result shape ─────────────────────────────────────────────────────

export interface FireFireYearDelta {
  current_fire_year: number;
  reform_fire_year:  number;
  delta_years:       number; // reform - current (positive = reform pushes FIRE later)
}

export interface FireScenarioDelta {
  id: string;
  label: string;
  current_fire_year:        number;
  reform_fire_year:         number;
  delta_years:              number;
  current_terminal_nw:      number;
  reform_terminal_nw:       number;
  delta_terminal_nw:        number;
}

export interface FireBothRegimesResult {
  current: FIREPathResult;
  reform:  FIREPathResult;
  propertyStatuses: PropertyTaxStatus[];
  /** Annual NG benefit retained under current rules (input to overlay). */
  currentNgAnnualBenefit: number;
  /** Annual NG benefit retained under the resolved reform regime. */
  reformNgAnnualBenefit:  number;
  /** Monthly surplus drag = (currentNg - reformNg) / 12. */
  monthly_surplus_drag:   number;
  /** Best-scenario FIRE year delta. */
  best_scenario_delta:    FireFireYearDelta;
  /** Per-scenario deltas (4 scenarios: property, etf, mixed, aggressive). */
  scenario_deltas:        FireScenarioDelta[];
  /** Composite progress delta at end of horizon. */
  total_nw_delta:         number;
  reformRegimeKind: ConcreteRegimeKind;
  autoDetectNeedsConfirmation: boolean;
  modellingDisclaimer: string;
}

// ─── Build args ──────────────────────────────────────────────────────────────

export interface ComputeFireBothRegimesArgs {
  /** Pre-built FIRE input (legacy buildFirePathInput output). */
  input: FIREPathInput;
  /** Original raw settings (passed through to computeFirePath). */
  rawSettings: FIRESettings | null;
  /** Property records (used to derive regime metadata + compute NG benefits). */
  properties: any[];
  /** Optional positional metadata sidecar — auto-derived if absent. */
  propertyMetadata?: FirePropertyMetadata[];
  /** Defaults to AUTO_DETECT. */
  regimeSelector?: TaxPolicyRegimeKind;
  /** Required when selector is CUSTOM_STRESS_TEST. */
  customRegime?: TaxPolicyRegime;
  /** Defaults to PROPOSED_2027_REFORM_REGIME. */
  reformRegime?: TaxPolicyRegime;
  /** Marginal rate override; defaults to top bracket + Medicare. */
  marginalRateOverride?: number;
  /** Annual salary income for marginal-rate computation. */
  annualSalaryIncome?: number;
}

// ─── computeFireBothRegimes ──────────────────────────────────────────────────

export function computeFireBothRegimes(args: ComputeFireBothRegimesArgs): FireBothRegimesResult {
  const { input, rawSettings, properties } = args;
  const reformRegime = args.reformRegime ?? PROPOSED_2027_REFORM_REGIME;
  const selector = args.regimeSelector ?? "AUTO_DETECT";

  // 1. Property metadata + regime resolution.
  const metadata = args.propertyMetadata ?? deriveMetadataFromProperties(properties);
  const { effectiveRegime, autoDetectNeedsConfirmation, propertyStatuses } =
    resolveEffectiveRegime({
      selector,
      currentRulesRegime: CURRENT_RULES_REGIME,
      reformRegime,
      customRegime: args.customRegime,
      propertyMetadata: metadata,
    });

  // 2. CURRENT branch — legacy engine, untouched.
  const current = computeFirePath(input, rawSettings);

  // 3. Compute NG drag per regime.
  const marginalRate =
    args.marginalRateOverride ??
    (args.annualSalaryIncome
      ? calcMarginalRate(args.annualSalaryIncome, "2025-26") + 0.02
      : 0.47);

  const ngBreakdown = computeNgBenefitByRegime(properties, propertyStatuses, marginalRate);
  const monthlyDrag = Math.max(0, (ngBreakdown.currentTotal - ngBreakdown.reformTotal) / 12);

  // 4. REFORM branch — re-run legacy engine with reduced monthly surplus.
  //
  // monthly_surplus is computed inside buildFirePathInput from snap.income/expenses.
  // To avoid rebuilding the entire snapshot, we mutate the prebuilt input by
  // reducing monthly_surplus and (when settings.use_manual_income) the manual
  // override. The legacy engine consumes input.monthly_surplus directly.
  const reformInput: FIREPathInput = {
    ...input,
    monthly_surplus: Math.max(0, input.monthly_surplus - monthlyDrag),
    settings: {
      ...input.settings,
      manual_monthly_surplus: input.settings.manual_monthly_surplus != null
        ? Math.max(0, input.settings.manual_monthly_surplus - monthlyDrag)
        : input.settings.manual_monthly_surplus,
    },
  };
  const reform = computeFirePath(reformInput, rawSettings);

  // 5. Build deltas.
  const bestDelta: FireFireYearDelta = {
    current_fire_year: current.best_fire_year,
    reform_fire_year:  reform.best_fire_year,
    delta_years:       reform.best_fire_year - current.best_fire_year,
  };

  const scenarioDeltas: FireScenarioDelta[] = current.scenarios.map((cur) => {
    const ref = reform.scenarios.find(r => r.id === cur.id);
    const curTerminal = cur.timeline[cur.timeline.length - 1]?.net_worth ?? 0;
    const refTerminal = ref?.timeline[ref.timeline.length - 1]?.net_worth ?? 0;
    return {
      id:                  cur.id,
      label:               cur.label,
      current_fire_year:   cur.fire_year,
      reform_fire_year:    ref?.fire_year ?? cur.fire_year,
      delta_years:         (ref?.fire_year ?? cur.fire_year) - cur.fire_year,
      current_terminal_nw: curTerminal,
      reform_terminal_nw:  refTerminal,
      delta_terminal_nw:   refTerminal - curTerminal,
    };
  });

  const totalNwDelta = scenarioDeltas.reduce((s, d) => s + d.delta_terminal_nw, 0) / Math.max(1, scenarioDeltas.length);

  return {
    current,
    reform,
    propertyStatuses,
    currentNgAnnualBenefit: ngBreakdown.currentTotal,
    reformNgAnnualBenefit:  ngBreakdown.reformTotal,
    monthly_surplus_drag:   monthlyDrag,
    best_scenario_delta:    bestDelta,
    scenario_deltas:        scenarioDeltas,
    total_nw_delta:         totalNwDelta,
    reformRegimeKind:       effectiveRegime.kind,
    autoDetectNeedsConfirmation,
    modellingDisclaimer:    "This is modelling only and not personal tax advice.",
  };
}

// ─── Convenience wrapper that also builds the input ──────────────────────────

export interface BuildAndComputeFireBothRegimesArgs {
  snap: any;
  bills: any[];
  rawSettings: FIRESettings | null;
  rawScenarios: any[];
  rawYearAssumptions: any[];
  properties: any[];
  propertyMetadata?: FirePropertyMetadata[];
  regimeSelector?: TaxPolicyRegimeKind;
  customRegime?: TaxPolicyRegime;
  reformRegime?: TaxPolicyRegime;
  marginalRateOverride?: number;
  annualSalaryIncome?: number;
}

export function buildAndComputeFireBothRegimes(
  args: BuildAndComputeFireBothRegimesArgs,
): FireBothRegimesResult {
  const input = buildFirePathInput(
    args.snap,
    args.bills,
    args.rawSettings,
    args.rawScenarios,
    args.rawYearAssumptions,
  );
  return computeFireBothRegimes({
    input,
    rawSettings: args.rawSettings,
    properties:  args.properties,
    propertyMetadata: args.propertyMetadata,
    regimeSelector:   args.regimeSelector,
    customRegime:     args.customRegime,
    reformRegime:     args.reformRegime,
    marginalRateOverride: args.marginalRateOverride,
    annualSalaryIncome:   args.annualSalaryIncome,
  });
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function deriveMetadataFromProperties(properties: any[]): FirePropertyMetadata[] {
  return (properties ?? [])
    .map((p, idx): FirePropertyMetadata | null => {
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
    .filter((m): m is FirePropertyMetadata => m !== null);
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
  propertyMetadata: FirePropertyMetadata[];
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
  propertyMetadata: FirePropertyMetadata[],
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

interface NgBreakdown { currentTotal: number; reformTotal: number; }

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
  });

  return { currentTotal, reformTotal };
}

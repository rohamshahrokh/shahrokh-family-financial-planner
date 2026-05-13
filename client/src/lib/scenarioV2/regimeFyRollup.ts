/**
 * regimeFyRollup.ts — ScenarioV2 Regime-Aware FY Rollup Helper (P1)
 *
 * #FWL_TaxReform_P1_P2_Integration_NoOverride — scenarioV2 tick wiring.
 *
 * Pure, additive helper. The legacy scenarioV2/tick.ts is UNTOUCHED.
 * This module exposes one function — `partitionRentalLossesByRegime` —
 * that an opt-in wrapper can invoke at FY rollup time to:
 *
 *   1. Resolve each property's PropertyTaxStatus against the active regime
 *   2. Split per-property rental losses into:
 *        - deductibleAgainstWage  (legacy current-rules behaviour)
 *        - quarantinedToProperty  (carry-forward, no wage offset)
 *        - abolished              (lost; not carried forward)
 *   3. Update the PropertyTaxLedger with new carry-forward entries
 *   4. Return regime-adjusted (rentalLoss, rentalProfit) totals that can
 *      be passed directly into the legacy computeWageTax helper without
 *      any change to tick.ts internals.
 *
 * Why a helper (not a tick.ts patch)?
 *   The non-negotiable rule: legacy current-rules pipeline always remains.
 *   The opt-in wrapper (added in P1b) will:
 *     a. call legacy tick.ts → current-rules result
 *     b. for each FY boundary, call THIS helper to derive a regime-aware
 *        re-projection of wage tax, then re-aggregate into a reform-branch
 *        result. Both branches surface side by side.
 *
 * Modelling disclaimer (must surface on any UI that renders these outputs):
 *   "This is modelling only and not personal tax advice."
 */

import {
  CURRENT_RULES_REGIME,
  PROPOSED_2027_REFORM_REGIME,
  REGIMES_BY_KIND,
  applyFyToLedger,
  emptyLedger,
  resolveAutoDetectedRegime,
  resolvePropertyTaxStatus,
  type ConcreteRegimeKind,
  type PropertyTaxLedger,
  type PropertyTaxStatus,
  type PropertyType,
  type TaxPolicyRegime,
  type TaxPolicyRegimeKind,
} from "../taxPolicyEngine";

// ─── Inputs ──────────────────────────────────────────────────────────────────

/** One row per property after the tick.ts FY accumulators are resolved. */
export interface PerPropertyFyRow {
  propertyId: string;
  /** Taxable net income for the FY. Positive = rental profit; negative = NG loss. */
  taxableNetIncome: number;
  /** Property classification — UNKNOWN if not yet captured on the PropertyState. */
  propertyType?: PropertyType;
  /** ISO YYYY-MM-DD contract date (preferred for grandfathering). */
  contractDate?: string;
  /** ISO YYYY-MM-DD settlement date (fallback when contractDate absent). */
  purchaseDate?: string;
}

export interface PartitionRentalLossesArgs {
  /** Per-property FY tax rows (caller derives from tick.ts accumulators). */
  rows: PerPropertyFyRow[];
  /** FY end month (e.g. "2028-06") — used as the key for ledger entries. */
  fyEndMonth: string;
  /** Regime selector. Defaults to AUTO_DETECT. */
  regimeSelector?: TaxPolicyRegimeKind;
  /** Required when selector = CUSTOM_STRESS_TEST. */
  customRegime?: TaxPolicyRegime;
  /** Defaults to PROPOSED_2027_REFORM_REGIME. */
  reformRegime?: TaxPolicyRegime;
  /** Existing ledger to extend (defaults to empty). Pure — the input is not mutated. */
  ledger?: PropertyTaxLedger;
}

// ─── Output ──────────────────────────────────────────────────────────────────

export interface PartitionRentalLossesResult {
  /**
   * Rental loss that REMAINS deductible against wage income under the
   * resolved regime. This is what the opt-in wrapper passes into
   * computeWageTax.rentalLoss for the reform branch.
   */
  deductibleAgainstWage: number;
  /**
   * Rental loss that has been quarantined to the property (carry-forward
   * applied). Not deductible against wage.
   */
  quarantinedToProperty: number;
  /**
   * Rental loss that has been abolished (no current-year benefit AND
   * no carry-forward).
   */
  abolished: number;
  /**
   * Total taxable rental profit (positive rental income). Unaffected by
   * regime — always taxable.
   */
  rentalProfit: number;
  /** Updated ledger (existing entries + this FY's carry-forwards). */
  ledger: PropertyTaxLedger;
  /** Per-property resolved status for downstream reporting. */
  statuses: Record<string, PropertyTaxStatus>;
  /** Effective regime kind (composite — see resolveCompositeRegime). */
  effectiveRegimeKind: ConcreteRegimeKind;
  /** True when AUTO_DETECT lacked metadata for at least one property. */
  autoDetectNeedsConfirmation: boolean;
  /** Modelling disclaimer string — surface verbatim on every UI that renders these outputs. */
  modellingDisclaimer: string;
}

// ─── Core helper ─────────────────────────────────────────────────────────────

/**
 * Partition per-property FY rental losses into deductible / quarantined /
 * abolished buckets, applying the active regime to each property's NG
 * treatment. The PropertyTaxLedger is extended (immutably) with new
 * carry-forward entries for quarantined losses.
 *
 * Pure — does not mutate `args.ledger`. Returns a new ledger.
 */
export function partitionRentalLossesByRegime(
  args: PartitionRentalLossesArgs,
): PartitionRentalLossesResult {
  const reformRegime = args.reformRegime ?? PROPOSED_2027_REFORM_REGIME;
  const selector = args.regimeSelector ?? "AUTO_DETECT";
  const inputLedger = args.ledger ?? emptyLedger();

  // 1. Resolve per-property status under the requested selector.
  let autoDetectNeedsConfirmation = false;
  let anyPostReform = false;
  const statuses: Record<string, PropertyTaxStatus> = {};

  for (const row of args.rows) {
    let status: PropertyTaxStatus;
    if (selector === "CURRENT_RULES") {
      status = resolvePropertyTaxStatus(
        { propertyId: row.propertyId, propertyType: row.propertyType, contractDate: row.contractDate, purchaseDate: row.purchaseDate },
        CURRENT_RULES_REGIME,
      );
    } else if (selector === "PROPOSED_2027_REFORM") {
      status = resolvePropertyTaxStatus(
        { propertyId: row.propertyId, propertyType: row.propertyType, contractDate: row.contractDate, purchaseDate: row.purchaseDate },
        reformRegime,
      );
      anyPostReform = true;
    } else if (selector === "CUSTOM_STRESS_TEST") {
      const regime = args.customRegime ?? REGIMES_BY_KIND.CUSTOM_STRESS_TEST;
      status = resolvePropertyTaxStatus(
        { propertyId: row.propertyId, propertyType: row.propertyType, contractDate: row.contractDate, purchaseDate: row.purchaseDate },
        regime,
      );
      anyPostReform = true;
    } else {
      // AUTO_DETECT — pick regime per property.
      const auto = resolveAutoDetectedRegime({
        propertyType: row.propertyType,
        contractDate: row.contractDate,
        purchaseDate: row.purchaseDate,
        reformRegime,
      });
      const regime = auto.resolvedRegimeKind === "CURRENT_RULES"
        ? CURRENT_RULES_REGIME
        : reformRegime;
      if (auto.requiresUserConfirmation) autoDetectNeedsConfirmation = true;
      if (auto.resolvedRegimeKind === reformRegime.kind) anyPostReform = true;
      status = resolvePropertyTaxStatus(
        { propertyId: row.propertyId, propertyType: row.propertyType, contractDate: row.contractDate, purchaseDate: row.purchaseDate },
        regime,
      );
    }
    statuses[row.propertyId] = status;
  }

  // 2. Partition losses + update ledger.
  let deductibleAgainstWage = 0;
  let quarantinedToProperty = 0;
  let abolished = 0;
  let rentalProfit = 0;
  let ledger = inputLedger;

  for (const row of args.rows) {
    const status = statuses[row.propertyId];
    if (row.taxableNetIncome > 0) {
      rentalProfit += row.taxableNetIncome;
      continue;
    }
    if (row.taxableNetIncome === 0) continue;
    const loss = -row.taxableNetIncome; // positive magnitude

    switch (status.effectiveNegativeGearing) {
      case "DEDUCT_AGAINST_WAGE":
        deductibleAgainstWage += loss;
        break;
      case "QUARANTINE_TO_PROPERTY":
        quarantinedToProperty += loss;
        ledger = applyFyToLedger(ledger, {
          propertyId: row.propertyId,
          fyEndMonth: args.fyEndMonth,
          // Property-isolated taxable result: negative = loss.
          taxableNetPropertyIncome: row.taxableNetIncome,
        });
        break;
      case "ABOLISH":
        abolished += loss;
        break;
    }
  }

  // 3. Composite effective regime kind:
  //    - if every property is grandfathered/current-rules → CURRENT_RULES
  //    - if any property resolved to reform → reform kind
  //    - CURRENT_RULES selector pins to CURRENT_RULES regardless.
  let effectiveRegimeKind: ConcreteRegimeKind;
  if (selector === "CURRENT_RULES") {
    effectiveRegimeKind = "CURRENT_RULES";
  } else if (selector === "PROPOSED_2027_REFORM") {
    effectiveRegimeKind = reformRegime.kind;
  } else if (selector === "CUSTOM_STRESS_TEST") {
    effectiveRegimeKind = (args.customRegime ?? REGIMES_BY_KIND.CUSTOM_STRESS_TEST).kind;
  } else {
    effectiveRegimeKind = anyPostReform ? reformRegime.kind : "CURRENT_RULES";
  }

  return {
    deductibleAgainstWage,
    quarantinedToProperty,
    abolished,
    rentalProfit,
    ledger,
    statuses,
    effectiveRegimeKind,
    autoDetectNeedsConfirmation,
    modellingDisclaimer: "This is modelling only and not personal tax advice.",
  };
}

/**
 * householdTaxInputs.ts — Single source of truth for tax inputs
 *
 * Why this exists (fixes #FixTaxAlphaWrongIncomeSourceStillBroken):
 *   The Tax Calculator and Tax Alpha tabs were computing per-person salary
 *   independently. Tax Calculator read sf_tax_profile via state and seeded
 *   from canonicalIncome, while Tax Alpha did its own three-way precedence
 *   inside buildTaxAlphaInput AND had a legacy fallback that mistakenly
 *   used `snap.monthly_income * 12` (the COMBINED household figure) as
 *   Roham's annual salary, double-counting Fara.
 *
 *   Result on production: Tax Calculator showed Roham $185,600 / Fara
 *   $176,500 (saved profile), Tax Alpha showed Roham $263,280 / Fara
 *   $129,600 (combined monthly × 12, snapshot fara × 12).
 *
 * This selector is now THE one place that decides:
 *   • Roham gross annual
 *   • Fara gross annual
 *   • Household combined
 *   • Which source we trust
 *   • What advisory to surface
 *
 * Precedence (in order):
 *   A. sf_tax_profile when override_active = true AND a salary is set.
 *      We prefer the saved value per-person: if Roham's salary is set on
 *      the profile, use it; if Fara's is set, use it. If only one is set,
 *      we fall back to canonical for the other (so a user who only
 *      overrides Roham doesn't blow away Fara's ledger figure).
 *   B. Canonical income (ledger > snapshot sub-fields > snapshot master)
 *      via selectCanonicalIncome. This is the existing P1.2 audit selector
 *      and is the default when override is OFF.
 *   C. Missing-data: neither override nor canonical produced a value.
 *      The UI should surface a setup CTA rather than silently using zero.
 *
 * The "Some data is missing (Fara income...)" warning in Tax Alpha used to
 * trigger whenever data_coverage !== 'full'. We now suppress the Fara part
 * when Fara IS present in sf_tax_profile (req #5).
 */

import { selectCanonicalIncome, type CanonicalIncome } from './dashboardDataContract';
import { safeNum } from './finance';

export type HouseholdTaxSource =
  | 'tax_profile_override'
  | 'canonical_ledger'
  | 'canonical_snapshot_sub_fields'
  | 'canonical_snapshot_master'
  | 'missing';

export interface HouseholdTaxInputs {
  /** Roham annual gross salary. */
  rohamAnnual:    number;
  /** Fara annual gross salary (0 if Fara not set up). */
  faraAnnual:     number;
  /** Combined household annual gross. */
  combinedAnnual: number;
  /** Origin of each person's salary — useful for debug + UI. */
  rohamSource:    HouseholdTaxSource;
  faraSource:     HouseholdTaxSource;
  /** True when the result is anchored on sf_tax_profile.override_active. */
  overrideActive: boolean;
  /** True when both Roham and Fara have a positive salary AND we have a
   *  reliable source for each. Used to decide whether to show the
   *  "missing data" banner for Fara. */
  faraReliable:   boolean;
  rohamReliable:  boolean;
  /** Variance between sf_tax_profile and canonical, when both exist and
   *  override is OFF. Pct of household gross. Used for the advisory chip. */
  taxProfileVariance: { roham: number; fara: number; pct: number } | null;
  /** The full canonical income object — exposed so callers don't have to
   *  call selectCanonicalIncome a second time. */
  canonicalIncome: CanonicalIncome;
}

/** Minimal shape we read off the saved tax profile. */
export interface TaxProfileLike {
  roham_salary?:   number | string | null;
  fara_salary?:    number | string | null;
  override_active?: boolean | null;
  taxable_override?: boolean | null;
}

/** Minimal snapshot shape used by selectCanonicalIncome. */
export interface SnapshotLike {
  monthly_income?:        number | string | null;
  roham_monthly_income?:  number | string | null;
  fara_monthly_income?:   number | string | null;
  rental_income_total?:   number | string | null;
  other_income?:          number | string | null;
}

/**
 * Single source of truth for the salary side of both Tax Calculator and
 * Tax Alpha. Pure function — no React, no side effects.
 */
export function getHouseholdTaxInputs(
  snapshot: SnapshotLike | null | undefined,
  taxProfile?: TaxProfileLike | null,
  incomeRecords?: any[] | undefined,
): HouseholdTaxInputs {
  // Compute canonical income once via the audit-fix selector.
  const canonicalIncome = selectCanonicalIncome(
    {
      snapshot: snapshot ?? undefined,
      properties: undefined,
      stocks: undefined,
      cryptos: undefined,
      holdingsRaw: undefined,
      incomeRecords,
      expenses: undefined,
    },
    taxProfile ?? undefined,
  );

  const overrideActive = Boolean(
    taxProfile &&
    (taxProfile.override_active === true || taxProfile.taxable_override === true),
  );

  const profileRoham = safeNum(taxProfile?.roham_salary);
  const profileFara  = safeNum(taxProfile?.fara_salary);
  const canonRoham   = safeNum(canonicalIncome.perPerson.roham.annual);
  const canonFara    = safeNum(canonicalIncome.perPerson.fara.annual);

  // Per-person source decision.
  let rohamAnnual:  number;
  let faraAnnual:   number;
  let rohamSource:  HouseholdTaxSource;
  let faraSource:   HouseholdTaxSource;

  const sourceFromCanonical: HouseholdTaxSource =
    canonicalIncome.source === 'ledger'                ? 'canonical_ledger' :
    canonicalIncome.source === 'snapshot_sub_fields'   ? 'canonical_snapshot_sub_fields' :
    canonicalIncome.source === 'snapshot_master'       ? 'canonical_snapshot_master' :
    'missing';

  if (overrideActive && profileRoham > 0) {
    rohamAnnual = profileRoham;
    rohamSource = 'tax_profile_override';
  } else if (canonRoham > 0) {
    rohamAnnual = canonRoham;
    rohamSource = sourceFromCanonical;
  } else {
    rohamAnnual = 0;
    rohamSource = 'missing';
  }

  if (overrideActive && profileFara > 0) {
    faraAnnual = profileFara;
    faraSource = 'tax_profile_override';
  } else if (canonFara > 0) {
    faraAnnual = canonFara;
    faraSource = sourceFromCanonical;
  } else {
    faraAnnual = 0;
    faraSource = 'missing';
  }

  const rohamReliable = rohamSource !== 'missing' && rohamAnnual > 0;
  // Fara is "reliable" if we have ANY source. Profile-only-override counts
  // even if Fara isn't in the snapshot — that's the user-saved truth.
  const faraReliable  = faraSource  !== 'missing' && faraAnnual  > 0;

  return {
    rohamAnnual,
    faraAnnual,
    combinedAnnual: rohamAnnual + faraAnnual,
    rohamSource,
    faraSource,
    overrideActive,
    rohamReliable,
    faraReliable,
    taxProfileVariance: canonicalIncome.taxProfileVariance,
    canonicalIncome,
  };
}

/** Human-readable label for the source, used by the banner + debug panel. */
export function describeHouseholdTaxSource(s: HouseholdTaxSource): string {
  switch (s) {
    case 'tax_profile_override':           return 'Saved tax profile (override)';
    case 'canonical_ledger':               return 'Income ledger (6-month avg)';
    case 'canonical_snapshot_sub_fields':  return 'Settings → per-person monthly';
    case 'canonical_snapshot_master':      return 'Settings → combined monthly';
    case 'missing':                        return 'Not configured';
  }
}

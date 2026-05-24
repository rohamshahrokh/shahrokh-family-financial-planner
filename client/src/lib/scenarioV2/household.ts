/**
 * Scenario Engine V2 — Household Composition & HEM Integration (Sprint 2B).
 *
 * Two responsibilities live here, kept together so a serviceability call can
 * resolve "how many adults / children" and "what expense floor applies" in a
 * single audited step:
 *
 *   1. Household composition (Single, Couple, Couple + 1/2/3+ Children).
 *      All fields are *optional* in the engine API — if a caller does not
 *      supply a composition, every legacy code path remains byte-identical.
 *
 *   2. Transparent HEM (Household Expenditure Measure) integration. We do
 *      NOT fetch external data. The table below is a stylised, internally
 *      documented HEM proxy (mid-2026 calibration; provenance noted under
 *      `HEM_PROVENANCE`). Every value the engine applies is emitted in the
 *      audit output so a reviewer can see exactly which floor was used and
 *      why.
 *
 * Expense modes:
 *   • ACTUAL          — declared monthly living expenses only (legacy default)
 *   • HEM_MINIMUM     — the HEM floor for the resolved composition
 *   • HIGHER_OF       — max(declared, HEM floor)
 *
 * The chosen mode is reported alongside the selected floor and the actual,
 * so commercial users can defend their serviceability number end-to-end.
 */

export type HouseholdCompositionKind =
  | "single"
  | "couple"
  | "couple_1_child"
  | "couple_2_children"
  | "couple_3_plus_children";

export interface HouseholdComposition {
  kind: HouseholdCompositionKind;
  /** Number of adults inferred from kind (1 or 2). Exposed for audit. */
  adults: number;
  /** Number of dependents inferred from kind (0, 1, 2, or 3). */
  children: number;
}

export type HemExpenseMode = "ACTUAL" | "HEM_MINIMUM" | "HIGHER_OF";

/**
 * HEM proxy table (monthly AUD, mid-2026 reference frame).
 *
 * Provenance — these are *internal* assumptions, not fetched. They are
 * calibrated against publicly available ranges for the Melbourne Institute
 * HEM index (the figures Australian lenders use, conservatively rounded).
 * Sprint 2C is expected to make these user-overridable via assumptions; for
 * Sprint 2B the values are stable, deterministic, and traceable.
 */
export const HEM_TABLE_MONTHLY: Record<HouseholdCompositionKind, number> = {
  single:                 2_750,
  couple:                 4_400,
  couple_1_child:         5_300,
  couple_2_children:      6_050,
  couple_3_plus_children: 6_700,
};

export const HEM_PROVENANCE: string =
  "Sprint 2B internal HEM proxy (Melbourne Institute HEM-style calibration, " +
  "mid-2026 AUD, conservative rounding). Sprint 2C will expose overrides.";

/** Resolve adults/children from a kind. Pure / deterministic. */
export function deriveHousehold(kind: HouseholdCompositionKind): HouseholdComposition {
  switch (kind) {
    case "single":                 return { kind, adults: 1, children: 0 };
    case "couple":                 return { kind, adults: 2, children: 0 };
    case "couple_1_child":         return { kind, adults: 2, children: 1 };
    case "couple_2_children":      return { kind, adults: 2, children: 2 };
    case "couple_3_plus_children": return { kind, adults: 2, children: 3 };
  }
}

/**
 * Audit record produced every time the serviceability layer resolves an
 * expense floor. Consumers can render or persist this verbatim.
 */
export interface HemAudit {
  mode: HemExpenseMode;
  composition: HouseholdComposition | null;
  /** The HEM table lookup that was applied (null when no composition was supplied). */
  hemFloorMonthly: number | null;
  /** The household's declared monthly living expenses. */
  actualMonthly: number;
  /** The expenses figure ultimately fed into serviceability calcs. */
  appliedMonthly: number;
  provenance: string;
  notes: string[];
}

export interface HemResolveInput {
  monthlyLivingExpenses: number;
  mode?: HemExpenseMode;
  composition?: HouseholdComposition | HouseholdCompositionKind | null;
}

/**
 * Resolve the serviceability expense floor + an audit trail in one call.
 *
 * If `composition` is omitted and mode is anything other than ACTUAL, we
 * conservatively fall back to ACTUAL with a note explaining why — this
 * preserves backward compatibility for callers that don't yet emit a
 * household composition.
 */
export function resolveHemExpenses(input: HemResolveInput): HemAudit {
  const mode = input.mode ?? "ACTUAL";
  const actualMonthly = Math.max(0, input.monthlyLivingExpenses);
  const composition: HouseholdComposition | null = (() => {
    const c = input.composition;
    if (!c) return null;
    if (typeof c === "string") return deriveHousehold(c);
    return c;
  })();

  const notes: string[] = [];
  const hemFloorMonthly = composition ? HEM_TABLE_MONTHLY[composition.kind] : null;

  let appliedMonthly = actualMonthly;
  if (mode === "ACTUAL") {
    notes.push("Mode ACTUAL — declared monthly expenses applied verbatim.");
  } else if (!composition) {
    notes.push(
      `Mode ${mode} requested but no household composition supplied; ` +
        "falling back to ACTUAL (deterministic / backwards compatible).",
    );
  } else if (mode === "HEM_MINIMUM") {
    appliedMonthly = hemFloorMonthly ?? actualMonthly;
    notes.push(
      `Mode HEM_MINIMUM — applied HEM floor $${(hemFloorMonthly ?? 0).toFixed(0)} ` +
        `for ${composition.kind} (adults=${composition.adults}, ` +
        `children=${composition.children}).`,
    );
  } else if (mode === "HIGHER_OF") {
    const floor = hemFloorMonthly ?? 0;
    appliedMonthly = Math.max(actualMonthly, floor);
    const which = actualMonthly >= floor ? "ACTUAL" : "HEM";
    notes.push(
      `Mode HIGHER_OF — chose ${which} ($${appliedMonthly.toFixed(0)}) ` +
        `over the alternative ($${Math.min(actualMonthly, floor).toFixed(0)}).`,
    );
  }

  return {
    mode,
    composition,
    hemFloorMonthly,
    actualMonthly,
    appliedMonthly,
    provenance: HEM_PROVENANCE,
    notes,
  };
}

/**
 * Lightweight helper for downstream UIs / reports: a one-line summary of an
 * audit row. Deterministic, no formatting locale leak.
 */
export function summariseHemAudit(audit: HemAudit): string {
  const comp = audit.composition?.kind ?? "unspecified";
  return (
    `HEM ${audit.mode} | comp=${comp} | ` +
    `actual=$${audit.actualMonthly.toFixed(0)} | ` +
    `floor=${audit.hemFloorMonthly == null ? "n/a" : `$${audit.hemFloorMonthly.toFixed(0)}`} | ` +
    `applied=$${audit.appliedMonthly.toFixed(0)}`
  );
}

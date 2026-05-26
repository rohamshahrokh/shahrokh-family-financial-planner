/**
 * strategyValidity.ts — Sprint 13 P0-5.
 *
 * Pre-ranking filter. Any strategy that is missing ANY of the required
 * outputs (fireYear, netWorth, passiveIncome, liquidity, riskScore,
 * confidence) is excluded from ranking entirely — no greyed row, no chip.
 *
 * Filtered strategies are recorded with reasons for the audit panel so
 * engineers can see exactly which scenarios were dropped and why.
 */

export interface ValidatableStrategy {
  /** Stable id used for audit logging. */
  id?: string | null;
  /** Human label for the audit panel. */
  label?: string | null;
  /** Engine outputs that must all be present for ranking. */
  fireYear?: number | null;
  netWorth?: number | null;
  passiveIncome?: number | null;
  liquidity?: number | null;
  riskScore?: number | null;
  confidence?: number | null;
}

export type StrategyValidityField =
  | "fireYear"
  | "netWorth"
  | "passiveIncome"
  | "liquidity"
  | "riskScore"
  | "confidence";

const REQUIRED: StrategyValidityField[] = [
  "fireYear",
  "netWorth",
  "passiveIncome",
  "liquidity",
  "riskScore",
  "confidence",
];

const isMissing = (v: unknown): boolean => {
  if (v === null || v === undefined) return true;
  if (typeof v === "number") return !Number.isFinite(v);
  return false;
};

export function isValidStrategy(s: ValidatableStrategy | null | undefined): boolean {
  if (s == null) return false;
  return REQUIRED.every((f) => !isMissing(s[f]));
}

export function missingValidityFields(
  s: ValidatableStrategy | null | undefined,
): StrategyValidityField[] {
  if (s == null) return [...REQUIRED];
  return REQUIRED.filter((f) => isMissing(s[f]));
}

export interface ExcludedStrategy {
  id: string | null;
  label: string | null;
  missing: StrategyValidityField[];
  reason: string;
}

export interface ValidityFilterResult<T> {
  kept: T[];
  excluded: ExcludedStrategy[];
}

export function filterValidStrategies<T extends ValidatableStrategy>(
  list: T[] | null | undefined,
): ValidityFilterResult<T> {
  const arr = Array.isArray(list) ? list : [];
  const kept: T[] = [];
  const excluded: ExcludedStrategy[] = [];
  for (const s of arr) {
    const missing = missingValidityFields(s);
    if (missing.length === 0) {
      kept.push(s);
    } else {
      excluded.push({
        id: s?.id ?? null,
        label: s?.label ?? null,
        missing,
        reason: `Excluded — missing ${missing.join(", ")}`,
      });
    }
  }
  return { kept, excluded };
}

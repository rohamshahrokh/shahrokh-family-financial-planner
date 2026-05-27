/**
 * confidenceLabels.ts — Sprint 15 Phase 3.
 *
 * Single source of truth for how confidence values are presented to the user.
 *
 * Why this file exists
 * --------------------
 * The audit (see /home/user/workspace/remediation_plan_final.md §3.3 and §4.3)
 * found nine surfaces displaying confidence as raw "XX% confident" when the
 * underlying value was actually one of five different things:
 *   - rule       : a per-rule literal (e.g. engine.ts:128 default 0.6)
 *   - heuristic  : binary 0.85/0.6 from bestMoveBridge.ts
 *   - mc         : a real Monte Carlo probability
 *   - composite  : Sprint 5 blended MC + scoring margin + coverage
 *   - absent     : no orchestrator data — we must not invent a number
 *
 * Showing "60% confident" when the value is a rule literal misleads the user.
 * This helper enforces banded labels everywhere except real Monte Carlo
 * results, where the percent is meaningful and we annotate it explicitly.
 */

/**
 * Discriminator for the kind of confidence source. See classifier in
 * canonicalRecommendation.ts (`CanonicalConfidenceSource`).
 */
export type ConfidenceKind =
  | "rule"
  | "heuristic"
  | "mc"
  | "composite"
  | "absent";

/** Unified band — same thresholds across every surface. */
export type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW" | "ABSENT";

/** Optional MC annotations (path count, ranAt). */
export interface FormatConfidenceOpts {
  /** Monte Carlo path count, if known. */
  paths?: number | null;
  /** ISO timestamp the MC was produced. */
  ranAt?: string | null;
}

export interface FormatConfidenceInput {
  kind: ConfidenceKind;
  value?: number | null;
  opts?: FormatConfidenceOpts;
}

export interface FormatConfidenceResult {
  /** Human label for the primary UI (no raw percent except for real MC). */
  label: string;
  /** Unified band — used for chip colour / sort. */
  band: ConfidenceBand;
  /**
   * Audit chip — always populated. Format `"<kind> · <raw value or n/a> · <band>"`.
   * Visible in Audit Mode so engineers can trace lineage.
   */
  audit: string;
}

/**
 * Bands are unified across every consumer:
 *   value >= 0.75 → HIGH
 *           >= 0.5  → MEDIUM
 *           >= 0    → LOW
 *   null/undefined/NaN → ABSENT
 */
export function bandFor(value: number | null | undefined): ConfidenceBand {
  if (value == null || !Number.isFinite(value)) return "ABSENT";
  if (value >= 0.75) return "HIGH";
  if (value >= 0.5) return "MEDIUM";
  if (value >= 0) return "LOW";
  return "ABSENT";
}

function rawString(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(2);
}

function pctString(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Format confidence for display + audit.
 *
 * Rules:
 *   - rule       : `"<Band> (rule-based)"` — no percent shown
 *   - heuristic  : `"<Band>"`              — no percent
 *   - mc         : `"<Band> (<pct> Monte Carlo)"` — percent allowed, MC explicit
 *   - composite  : `"<Band>"`
 *   - absent     : `"Monte Carlo not yet run"`
 *
 * The audit chip is always populated regardless of kind/value so audit-mode UI
 * never goes blank.
 */
export function formatConfidence(
  input: FormatConfidenceInput,
): FormatConfidenceResult {
  const { kind, value, opts } = input;
  const band = bandFor(value);
  const raw = rawString(value);
  const audit = `${kind} · ${raw} · ${band}`;

  let label: string;
  switch (kind) {
    case "absent":
      label = "Monte Carlo not yet run";
      break;
    case "rule":
      label = band === "ABSENT" ? "Confidence unavailable" : `${band} (rule-based)`;
      break;
    case "heuristic":
      label = band === "ABSENT" ? "Confidence unavailable" : band;
      break;
    case "composite":
      label = band === "ABSENT" ? "Confidence unavailable" : band;
      break;
    case "mc": {
      if (band === "ABSENT" || value == null || !Number.isFinite(value)) {
        label = "Monte Carlo not yet run";
      } else {
        const parts: string[] = [`${pctString(value)} Monte Carlo`];
        if (opts?.paths != null && Number.isFinite(opts.paths)) {
          parts.push(`${opts.paths} paths`);
        }
        if (opts?.ranAt) {
          parts.push(`ran ${opts.ranAt}`);
        }
        label = `${band} (${parts.join(" · ")})`;
      }
      break;
    }
    default: {
      // Exhaustiveness fallback — never reached under the type.
      const _exhaustive: never = kind;
      label = "Confidence unavailable";
      void _exhaustive;
    }
  }

  return { label, band, audit };
}

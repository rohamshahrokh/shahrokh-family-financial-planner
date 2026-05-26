/**
 * SourceTag — FWL Remediation Phase C-1.
 *
 * Per locked decision #7: every promoted number in the primary UI must show
 * its source. This compact chip renders next to / below a number to declare
 * which canonical layer produced it.
 *
 * Variants:
 *   - "ledger"   : Current Ledger (blue)         — ledger reads (NW, cash, super)
 *   - "fire"     : FIRE Settings (purple)        — SWR, target age, target passive
 *   - "forecast" : Forecast Engine (green)       — projected NW, FIRE year
 *   - "mc"       : Monte Carlo Run (orange)      — prob FIRE, MC outputs
 *   - "scenario" : Scenario Result (gray)        — strategy rankings, what-ifs
 *
 * Pass `runDate` to surface a "ran YYYY-MM-DD" hint (Monte Carlo runs and
 * stale-flag indication). Pass `transient` for scenario-only badges.
 */

import * as React from "react";

export type SourceVariant = "ledger" | "fire" | "forecast" | "mc" | "scenario";

interface Props {
  variant: SourceVariant;
  /** Optional ISO date or display string — surfaced as "· {runDate}". */
  runDate?: string | null;
  /** Flag a scenario-result chip as "Transient — not saved". */
  transient?: boolean;
  /** Mark forecast/MC chip as stale (visually emphasised). */
  stale?: boolean;
  className?: string;
  /** Override the default test id. */
  testid?: string;
}

const VARIANT_LABEL: Record<SourceVariant, string> = {
  ledger: "Current Ledger",
  fire: "FIRE Settings",
  forecast: "Forecast Engine",
  mc: "Monte Carlo Run",
  scenario: "Scenario Result",
};

const VARIANT_TONE: Record<SourceVariant, string> = {
  ledger: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30",
  fire: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30",
  forecast: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  mc: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30",
  scenario: "bg-gray-500/10 text-gray-700 dark:text-gray-300 border-gray-500/30",
};

function formatRunDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  // Accept either YYYY-MM-DD or full ISO. Trim to YYYY-MM-DD for compactness.
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

export function SourceTag({
  variant,
  runDate,
  transient,
  stale,
  className,
  testid,
}: Props) {
  const dateStr = formatRunDate(runDate);
  const id = testid ?? `source-tag-${variant}`;
  const tone = VARIANT_TONE[variant];
  const label = VARIANT_LABEL[variant];

  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5",
        "text-[9px] font-medium uppercase tracking-wider whitespace-nowrap",
        tone,
        stale ? "ring-1 ring-amber-500/40" : "",
        className ?? "",
      ].filter(Boolean).join(" ")}
      data-testid={id}
      data-variant={variant}
      data-transient={transient ? "true" : undefined}
      data-stale={stale ? "true" : undefined}
      title={
        [
          label,
          dateStr ? `ran ${dateStr}` : null,
          stale ? "stale" : null,
          transient ? "transient — not saved" : null,
        ]
          .filter(Boolean)
          .join(" · ")
      }
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-60" />
      <span>{label}</span>
      {dateStr ? <span className="opacity-70">· {dateStr}</span> : null}
      {transient ? <span className="opacity-90">· transient</span> : null}
      {stale ? <span className="opacity-90">· stale</span> : null}
    </span>
  );
}

export default SourceTag;

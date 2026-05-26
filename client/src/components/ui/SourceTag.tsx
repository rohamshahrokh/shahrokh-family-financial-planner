/**
 * SourceTag — Sprint 13 source attribution chip.
 *
 * Tiny "Source: {label}" chip rendered under hero tiles to make every
 * number's provenance visible without taking visual weight. Default
 * shows the human-readable label only; when the page is loaded with
 * `?audit=1` the chip extends to include the engine-internal scenario
 * or detail string supplied by the caller.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export type SourceLabel =
  | "Dashboard Goal"
  | "Forecast Engine"
  | "Forecast Engine (baseline)"
  | "Scenario Engine"
  | "Goal Solver"
  | "Monte Carlo"
  | "Path Simulation"
  | "Canonical Ledger";

export interface SourceTagProps {
  label: SourceLabel | string;
  /** Optional engine-internal detail (scenario id, strategy id, etc.) rendered only when audit=1. */
  detail?: string | null;
  className?: string;
  "data-testid"?: string;
}

function isAuditMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("audit") === "1";
  } catch {
    return false;
  }
}

export function SourceTag({
  label,
  detail,
  className,
  "data-testid": testId = "source-tag",
}: SourceTagProps) {
  const audit = isAuditMode();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-muted/60 px-1.5 py-0.5",
        "text-[10px] font-medium text-muted-foreground/90",
        className,
      )}
      data-testid={testId}
    >
      <span className="opacity-60">Source:</span>
      <span>{label}</span>
      {audit && detail ? (
        <span className="opacity-70" data-testid={`${testId}-detail`}>· {detail}</span>
      ) : null}
    </span>
  );
}

/**
 * Sprint 13 Section 3 — Biggest Blockers.
 *
 * Three ranked rows, single-line on desktop with overflow truncation.
 * Zero-blockers hides the section entirely (P0: never show "No blockers —
 * incomplete data").
 */
import React from "react";
import SourceTag from "@/components/ui/SourceTag";
import type { RankedBlocker } from "@/lib/goalSolverView";

export interface BiggestBlockersRowProps {
  blockers: RankedBlocker[];
  testidPrefix?: string;
  title?: string;
  className?: string;
}

function impactDots(score: number): string {
  const filled = "●".repeat(Math.max(0, Math.min(5, score)));
  const empty = "○".repeat(Math.max(0, 5 - Math.min(5, score)));
  return filled + empty;
}

export function BiggestBlockersRow({
  blockers,
  testidPrefix = "blockers",
  title = "Biggest Blockers",
  className = "",
}: BiggestBlockersRowProps) {
  if (!blockers || blockers.length === 0) return null;
  return (
    <section className={className} data-testid={testidPrefix}>
      <header className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      </header>
      <div className="flex flex-col gap-1.5">
        {blockers.slice(0, 3).map((b) => {
          const rowId = `${testidPrefix}-row-${b.rank}`;
          return (
            <div
              key={rowId}
              className="rounded-lg border border-rose-500/20 bg-card px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:gap-3"
              data-testid={rowId}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-xs font-bold text-rose-600 dark:text-rose-300 tabular-nums">
                  #{b.rank}
                </span>
                <span
                  className="text-sm font-medium text-foreground truncate"
                  data-testid={`${rowId}-label`}
                  title={b.label}
                >
                  {b.label}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] mt-1 sm:mt-0 sm:flex-shrink-0">
                <span
                  className="font-mono text-rose-500"
                  data-testid={`${rowId}-impact`}
                  aria-label={`Impact ${b.impactScore} of 5`}
                >
                  {impactDots(b.impactScore)}
                </span>
                <span
                  className="text-muted-foreground truncate max-w-[16rem]"
                  data-testid={`${rowId}-required`}
                  title={b.required}
                >
                  {b.required}
                </span>
                <span
                  className="text-emerald-700 dark:text-emerald-300 truncate max-w-[14rem]"
                  data-testid={`${rowId}-benefit`}
                  title={b.expectedBenefit}
                >
                  {b.expectedBenefit}
                </span>
                <SourceTag
                  label={b.sourceLabel}
                  internalRef={b.internalRef}
                  testid={`${rowId}-source`}
                  className="mt-0"
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default BiggestBlockersRow;

/**
 * Sprint 13 Section 2 — Top 3 Actions.
 *
 * Three compact cards in a row. Each card states the concrete WHAT,
 * the WHEN, the WHY, and a quantified EXPECTED RESULT. Source-tagged.
 *
 * Zero-actions hides the section and shows a single inline reassurance line.
 */
import React from "react";
import { formatCurrency } from "@/lib/finance";
import SourceTag from "@/components/ui/SourceTag";
import type { UserFacingAction } from "@/lib/goalSolverView";

export interface Top3ActionsRowProps {
  actions: UserFacingAction[];
  testidPrefix?: string;
  title?: string;
  className?: string;
}

function fmtDelta(n: number | undefined, suffix = ""): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  const sign = n >= 0 ? "+" : "−";
  return `${sign}${formatCurrency(Math.abs(n), true)}${suffix}`;
}

function fmtPct(n: number | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  const pct = Math.round(n * 100);
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct}%`;
}

export function Top3ActionsRow({
  actions,
  testidPrefix = "top3",
  title = "Top 3 Actions",
  className = "",
}: Top3ActionsRowProps) {
  if (!actions || actions.length === 0) {
    return (
      <section className={`${className}`} data-testid={`${testidPrefix}-empty`}>
        <p className="text-xs text-muted-foreground">
          All current paths meet feasibility — no actions needed.
        </p>
      </section>
    );
  }

  return (
    <section className={className} data-testid={testidPrefix}>
      <header className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      </header>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        {actions.slice(0, 3).map((a, idx) => {
          const cardId = `${testidPrefix}-card-${idx + 1}`;
          const nwDelta = fmtDelta(a.expected.netWorth, " NW");
          const piDelta = fmtDelta(a.expected.passiveIncome, " PI");
          const probDelta = fmtPct(a.expected.probability);
          const expectedParts = [nwDelta, piDelta, probDelta].filter(Boolean);
          return (
            <div
              key={cardId}
              className="rounded-lg border border-emerald-500/25 bg-card p-3 flex flex-col gap-2"
              data-testid={cardId}
            >
              <div>
                <div
                  className="text-sm font-medium text-foreground leading-snug"
                  data-testid={`${cardId}-what`}
                >
                  {a.what}
                </div>
                <div
                  className="text-[11px] text-muted-foreground mt-0.5"
                  data-testid={`${cardId}-when`}
                >
                  {a.when}
                </div>
              </div>
              <div
                className="text-xs text-muted-foreground leading-snug border-t border-border/60 pt-2"
                data-testid={`${cardId}-why`}
              >
                {a.why}
              </div>
              {expectedParts.length > 0 ? (
                <div
                  className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300 tabular-nums border-t border-border/60 pt-2"
                  data-testid={`${cardId}-expected`}
                >
                  {expectedParts.join(" · ")}
                </div>
              ) : null}
              <SourceTag
                label={a.sourceLabel}
                internalRef={a.internalRef}
                testid={`${cardId}-source`}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default Top3ActionsRow;

/**
 * BlockerAnalysisBlock — Sprint 12 ranked-blockers list for /decision.
 *
 * Reads selectRankedBlockers(). Hides entirely when no blockers.
 */

import * as React from "react";
import { Card } from "@/components/ui/card";
import { isEmptyValue } from "@/lib/uiEmptyField";
import type { RankedBlocker } from "@/lib/goalSolverView.types";

interface Props {
  blockers: RankedBlocker[];
}

export function BlockerAnalysisBlock({ blockers }: Props) {
  if (blockers.length === 0) return null;

  return (
    <Card className="p-4 sm:p-5" data-testid="decision-blockers">
      <header className="mb-3">
        <h3 className="text-base font-semibold text-foreground">What's blocking your goal?</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ranked by estimated impact on probability of FIRE. Hide when none.
        </p>
      </header>
      <ol className="space-y-3">
        {blockers.map((b) => {
          const tid = `decision-blocker-${b.rank}`;
          const impactProbPct = b.estimatedImpactProbability != null
            ? `+ ${Math.round(b.estimatedImpactProbability * 100)}% probability`
            : null;
          return (
            <li key={tid} className="rounded-md border border-border bg-card/60 p-3" data-testid={tid}>
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-sm font-semibold text-foreground" data-testid={`${tid}-label`}>
                  {b.rank}. {b.label}
                </div>
              </div>
              {!isEmptyValue(b.currentValue) ? (
                <div className="text-xs text-muted-foreground mt-1" data-testid={`${tid}-current`}>
                  Current: {b.currentValue}
                </div>
              ) : null}
              {!isEmptyValue(b.requiredChange) ? (
                <div className="text-xs text-foreground mt-1" data-testid={`${tid}-required-change`}>
                  → Required change: {b.requiredChange}
                </div>
              ) : null}
              {!isEmptyValue(impactProbPct) ? (
                <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-1" data-testid={`${tid}-impact`}>
                  → Estimated impact: {impactProbPct}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export default BlockerAnalysisBlock;

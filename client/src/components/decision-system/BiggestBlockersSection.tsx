/**
 * BiggestBlockersSection — Sprint 13 ranked blockers.
 *
 * 3 rows ranked by Goal Solver impact. Each row shows label · impact ·
 * required improvement · expected benefit. Sourced from the canonical
 * Sprint 10 constraint solver + gap-shortfall projections — no new
 * calculations.
 */

import * as React from "react";
import { Card } from "@/components/ui/card";
import { SourceTag } from "@/components/ui/SourceTag";
import { isEmptyValue } from "@/lib/uiEmptyField";
import type { RankedBlockerDetail } from "@/lib/goalSolverView.types";

interface Props {
  blockers: RankedBlockerDetail[];
  testidPrefix?: string;
}

function BlockerRow({ blocker, testid }: { blocker: RankedBlockerDetail; testid: string }) {
  return (
    <Card className="p-3 flex flex-col gap-1.5 border-amber-500/30 bg-amber-500/5" data-testid={testid}>
      <div className="flex items-start gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
          {blocker.rank}
        </span>
        <span className="text-sm font-semibold text-foreground leading-tight" data-testid={`${testid}-label`}>
          {blocker.label}
        </span>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        {!isEmptyValue(blocker.impact) ? (
          <div data-testid={`${testid}-impact`}>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Impact</dt>
            <dd className="text-foreground">{blocker.impact}</dd>
          </div>
        ) : null}
        {!isEmptyValue(blocker.requiredImprovement) ? (
          <div data-testid={`${testid}-required`}>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Required Improvement</dt>
            <dd className="text-foreground">{blocker.requiredImprovement}</dd>
          </div>
        ) : null}
        {!isEmptyValue(blocker.expectedBenefit) ? (
          <div data-testid={`${testid}-benefit`}>
            <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Expected Benefit</dt>
            <dd className="text-foreground">{blocker.expectedBenefit}</dd>
          </div>
        ) : null}
      </dl>

      <SourceTag label={blocker.sourceLabel} detail={blocker.sourceDetail} data-testid={`${testid}-source`} />
    </Card>
  );
}

export function BiggestBlockersSection({ blockers, testidPrefix = "s13-biggest-blockers" }: Props) {
  if (blockers.length === 0) {
    return (
      <section data-testid={testidPrefix}>
        <header className="mb-2">
          <h3 className="text-base font-semibold text-foreground">Biggest Blockers</h3>
        </header>
        <Card className="p-4 border-emerald-500/30 bg-emerald-500/5" data-testid={`${testidPrefix}-empty`}>
          <div className="text-sm font-medium text-foreground">
            No active blockers — the constraint solver found no hard limits binding your best path.
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section data-testid={testidPrefix}>
      <header className="mb-2">
        <h3 className="text-base font-semibold text-foreground">Biggest Blockers</h3>
        <p className="text-xs text-muted-foreground">Ranked by probability impact. Source: Goal Solver constraint + gap analysis.</p>
      </header>
      <div className="flex flex-col gap-2">
        {blockers.slice(0, 3).map((b, i) => (
          <BlockerRow key={`${b.label}-${i}`} blocker={b} testid={`${testidPrefix}-row-${i + 1}`} />
        ))}
      </div>
    </section>
  );
}

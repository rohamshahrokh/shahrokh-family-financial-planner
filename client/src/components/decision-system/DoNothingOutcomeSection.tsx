/**
 * DoNothingOutcomeSection — Sprint 13 baseline outcome.
 *
 * 4 lines: NW · PI · Probability · Expected FIRE Date. Pure projection
 * over the existing selectDoNothingOutcome selector — no new computation.
 * Empty values collapse per the S11 uiEmptyField rule.
 */

import * as React from "react";
import { Card } from "@/components/ui/card";
import { SourceTag } from "@/components/ui/SourceTag";
import { formatCurrency } from "@/lib/finance";
import { isEmptyValue } from "@/lib/uiEmptyField";
import type { DoNothingOutcome } from "@/lib/goalSolverView.types";

interface Props {
  outcome: DoNothingOutcome;
  testidPrefix?: string;
}

function Line({ label, value, testid }: { label: string; value: string | null; testid: string }) {
  if (isEmptyValue(value)) return null;
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5 border-b border-muted/60 last:border-b-0" data-testid={testid}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground" data-testid={`${testid}-value`}>{value}</span>
    </li>
  );
}

export function DoNothingOutcomeSection({ outcome, testidPrefix = "s13-do-nothing-outcome" }: Props) {
  const nw = outcome.netWorth != null && Number.isFinite(outcome.netWorth)
    ? formatCurrency(outcome.netWorth, true)
    : null;
  const pi = outcome.passiveIncome != null && Number.isFinite(outcome.passiveIncome)
    ? `${formatCurrency(outcome.passiveIncome, true)}/yr`
    : null;
  const prob = outcome.probability != null && Number.isFinite(outcome.probability)
    ? `${Math.round((outcome.probability as number) * 100)}%`
    : null;
  const fireYear = outcome.expectedFireYear != null && Number.isFinite(outcome.expectedFireYear)
    ? String(outcome.expectedFireYear)
    : null;

  const anyValue = !isEmptyValue(nw) || !isEmptyValue(pi) || !isEmptyValue(prob) || !isEmptyValue(fireYear);
  if (!anyValue) {
    return (
      <section data-testid={testidPrefix}>
        <header className="mb-2">
          <h3 className="text-base font-semibold text-foreground">Do Nothing Outcome</h3>
        </header>
        <Card className="p-4 border-muted bg-muted/30" data-testid={`${testidPrefix}-empty`}>
          <div className="text-sm text-muted-foreground">
            No baseline projection available — add a FIRE target to surface the do-nothing scenario.
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section data-testid={testidPrefix}>
      <header className="mb-2">
        <h3 className="text-base font-semibold text-foreground">Do Nothing Outcome</h3>
        <p className="text-xs text-muted-foreground">If you make no further changes, the engine projects:</p>
      </header>
      <Card className="p-3 border-rose-500/20 bg-rose-500/5">
        <ul className="flex flex-col">
          <Line label="Net Worth" value={nw} testid={`${testidPrefix}-nw`} />
          <Line label="Passive Income" value={pi} testid={`${testidPrefix}-pi`} />
          <Line label="FIRE Probability" value={prob} testid={`${testidPrefix}-prob`} />
          <Line label="Expected FIRE Date" value={fireYear} testid={`${testidPrefix}-fire-year`} />
        </ul>
        <div className="mt-2">
          <SourceTag label={outcome.source.label} detail={outcome.source.detail} data-testid={`${testidPrefix}-source`} />
        </div>
      </Card>
    </section>
  );
}

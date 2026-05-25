/**
 * Top3ActionsSection — Sprint 13 user-facing actions.
 *
 * 3 cards each rendering: WHAT (rewritten user-facing label) · WHEN ·
 * WHY · EXPECTED RESULT. All raw engine action strings have already been
 * passed through actionLabelMap in the selector; internal checkpoints are
 * filtered out upstream. Empty cards collapse per S11 uiEmptyField rule.
 */

import * as React from "react";
import { Card } from "@/components/ui/card";
import { SourceTag } from "@/components/ui/SourceTag";
import { formatCurrency } from "@/lib/finance";
import { isEmptyValue } from "@/lib/uiEmptyField";
import type { Top3ActionDetail } from "@/lib/goalSolverView.types";

interface Props {
  actions: Top3ActionDetail[];
  testidPrefix?: string;
}

function deltaCurrency(v: number | null): string | null {
  if (v == null || !Number.isFinite(v) || v === 0) return null;
  return `${v > 0 ? "+" : "−"} ${formatCurrency(Math.abs(v), true)}`;
}

function deltaPct(v: number | null): string | null {
  if (v == null || !Number.isFinite(v) || v === 0) return null;
  return `${v > 0 ? "+" : "−"} ${Math.round(Math.abs(v) * 100)}%`;
}

function ActionCard({ action, index, testid }: { action: Top3ActionDetail; index: number; testid: string }) {
  const nwDelta = deltaCurrency(action.expectedNetWorthDelta);
  const piDelta = deltaCurrency(action.expectedPassiveIncomeDelta);
  const probDelta = deltaPct(action.expectedProbabilityDelta);
  const whenLabel = action.when != null ? String(action.when) : null;

  return (
    <Card className="p-4 border-emerald-500/20 bg-card flex flex-col gap-3" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Action {index + 1}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">What</div>
        <div className="text-sm font-semibold text-foreground leading-snug" data-testid={`${testid}-what`}>
          {action.what}
        </div>
      </div>

      {!isEmptyValue(whenLabel) ? (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">When</div>
          <div className="text-sm text-foreground" data-testid={`${testid}-when`}>{whenLabel}</div>
        </div>
      ) : null}

      {!isEmptyValue(action.why) ? (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Why</div>
          <div className="text-xs text-muted-foreground leading-snug" data-testid={`${testid}-why`}>
            {action.why}
          </div>
        </div>
      ) : null}

      {(nwDelta || piDelta || probDelta) ? (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Expected Result</div>
          <ul className="text-xs space-y-1" data-testid={`${testid}-expected`}>
            {nwDelta ? (
              <li className="flex justify-between" data-testid={`${testid}-expected-nw`}>
                <span className="text-muted-foreground">Net Worth</span>
                <span className="font-semibold tabular-nums">{nwDelta}</span>
              </li>
            ) : null}
            {piDelta ? (
              <li className="flex justify-between" data-testid={`${testid}-expected-pi`}>
                <span className="text-muted-foreground">Passive Income</span>
                <span className="font-semibold tabular-nums">{piDelta}</span>
              </li>
            ) : null}
            {probDelta ? (
              <li className="flex justify-between" data-testid={`${testid}-expected-prob`}>
                <span className="text-muted-foreground">FIRE Probability</span>
                <span className="font-semibold tabular-nums">{probDelta}</span>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <SourceTag
        label="Goal Solver"
        detail={action.sourceStrategyId ? `strategy=${action.sourceStrategyId} · type=${action.engineType}` : action.engineType}
        data-testid={`${testid}-source`}
      />
    </Card>
  );
}

export function Top3ActionsSection({ actions, testidPrefix = "s13-top3-actions" }: Props) {
  if (actions.length === 0) {
    return (
      <section data-testid={testidPrefix}>
        <header className="mb-2">
          <h3 className="text-base font-semibold text-foreground">Top 3 Actions</h3>
        </header>
        <Card className="p-4 border-emerald-500/30 bg-emerald-500/5" data-testid={`${testidPrefix}-empty`}>
          <div className="text-sm font-medium text-foreground">
            No outstanding actions — your current trajectory meets the FIRE feasibility bar.
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section data-testid={testidPrefix}>
      <header className="mb-2">
        <h3 className="text-base font-semibold text-foreground">Top 3 Actions</h3>
        <p className="text-xs text-muted-foreground">Ranked by Goal Solver impact on net worth, passive income, and FIRE probability.</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {actions.slice(0, 3).map((a, i) => (
          <ActionCard
            key={`${a.what}-${i}`}
            action={a}
            index={i}
            testid={`${testidPrefix}-card-${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}

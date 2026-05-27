/**
 * Top3ActionsBlock — Sprint 12 Portfolio Lab top-3 actions.
 *
 * Three cards in a row. Each shows: action label, expected NW/PI/probability
 * deltas (computed from existing Sprint 10 candidate scores — not recomputed),
 * a "Why this works" link to /decision.
 *
 * Empty-field rule: if there are fewer than 3 actions, render only what
 * exists; if zero actions, show a positive empty-state message.
 */

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/finance";
import { isEmptyValue } from "@/lib/uiEmptyField";
import type { Top3Action } from "@/lib/goalSolverView.types";

interface Props {
  actions: Top3Action[];
}

function deltaCurrency(v: number | null | undefined): string | null {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return null;
  const sign = v > 0 ? "+ " : "− ";
  return `${sign}${formatCurrency(Math.abs(v), true)}`;
}

function deltaPct(v: number | null | undefined): string | null {
  if (v === null || v === undefined || !Number.isFinite(v) || v === 0) return null;
  const sign = v > 0 ? "+ " : "− ";
  return `${sign}${Math.round(Math.abs(v) * 100)}%`;
}

function ActionCard({ action, index }: { action: Top3Action; index: number }) {
  const testid = `pl-top3-action-${index + 1}`;
  const nwDelta = deltaCurrency(action.netWorthDelta);
  const piDelta = deltaCurrency(action.passiveIncomeDelta);
  const probDelta = deltaPct(action.probabilityDelta);
  return (
    <Card className="p-4 border-emerald-500/20 bg-card" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        Action {index + 1}
        {action.dueYear ? ` · ${action.dueYear}` : ""}
      </div>
      <div className="text-sm font-semibold text-foreground leading-snug mb-3" data-testid={`${testid}-label`}>
        {action.label}
      </div>
      <ul className="text-xs text-foreground space-y-1.5 mb-3">
        {!isEmptyValue(nwDelta) ? (
          <li className="flex justify-between" data-testid={`${testid}-nw-delta`}>
            <span className="text-muted-foreground">Net Worth</span>
            <span className="font-semibold tabular-nums">{nwDelta}</span>
          </li>
        ) : null}
        {!isEmptyValue(piDelta) ? (
          <li className="flex justify-between" data-testid={`${testid}-pi-delta`}>
            <span className="text-muted-foreground">Passive Income</span>
            <span className="font-semibold tabular-nums">{piDelta}</span>
          </li>
        ) : null}
        {!isEmptyValue(probDelta) ? (
          <li className="flex justify-between" data-testid={`${testid}-prob-delta`}>
            <span className="text-muted-foreground">Monte Carlo Success Probability</span>
            <span className="font-semibold tabular-nums">{probDelta}</span>
          </li>
        ) : null}
      </ul>
      <a href="/decision" data-testid={`${testid}-why`}>
        <Button variant="ghost" size="sm" className="gap-1 p-0 h-auto text-xs">
          Why this works
          <ArrowRight className="h-3 w-3" />
        </Button>
      </a>
    </Card>
  );
}

export function Top3ActionsBlock({ actions }: Props) {
  if (actions.length === 0) {
    return (
      <Card className="p-4 border-emerald-500/30 bg-emerald-500/5" data-testid="pl-top3-actions-empty">
        <div className="text-sm font-medium text-foreground">
          All current paths meet feasibility — no actions needed.
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Your current trajectory already crosses the success threshold. Keep the engine in view to spot drift early.
        </p>
      </Card>
    );
  }

  return (
    <section data-testid="pl-top3-actions">
      <header className="mb-3">
        <h3 className="text-base font-semibold text-foreground">Top 3 actions to close your gap</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ranked by impact on net worth, passive income, and probability of FIRE.
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {actions.slice(0, 3).map((a, i) => (
          <ActionCard key={`${a.label}-${i}`} action={a} index={i} />
        ))}
      </div>
    </section>
  );
}

export default Top3ActionsBlock;

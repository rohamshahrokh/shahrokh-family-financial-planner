/**
 * RetirementTransitionPanel — Sprint 20 PR-B P1-1 wiring.
 *
 * Renders the TransitionNarrative (headline + body + milestones + assumptions)
 * inside existing panels: Sprint5DecisionPanel, GoalClosureLab,
 * RecommendedActionsPanel. Collapsed by default for STATE A/B; expanded by
 * default for STATE C/D/E (caller passes defaultOpen).
 */

import * as React from "react";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { TransitionNarrative } from "@/lib/retirementTransition/types";

export interface RetirementTransitionPanelProps {
  narrative: TransitionNarrative;
  surface?: string;
  defaultOpen?: boolean;
}

function dollars(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export function RetirementTransitionPanel({
  narrative,
  surface,
  defaultOpen = false,
}: RetirementTransitionPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const dataTestid = surface
    ? `retirement-transition-${surface}`
    : "retirement-transition-panel";
  return (
    <Card data-testid={dataTestid} className="border-amber-500/30 bg-amber-500/5">
      <CardContent className="p-3 sm:p-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left"
          aria-expanded={open}
          data-testid={`${dataTestid}-toggle`}
        >
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300 font-medium">
              Retirement transition
            </div>
            <div className="text-sm sm:text-base font-semibold text-foreground line-clamp-3" data-testid={`${dataTestid}-headline`}>
              {narrative.headline}
            </div>
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="mt-3 flex flex-col gap-3 text-[12px] sm:text-[13px]">
            <div className="flex flex-col gap-1.5">
              {narrative.bodyParagraphs.map((p, i) => (
                <p key={i} className="text-foreground/85" data-testid={`${dataTestid}-body-${i}`}>{p}</p>
              ))}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Milestones</div>
              <ul className="ml-3 text-foreground/85" data-testid={`${dataTestid}-milestones`}>
                {narrative.milestones.map((m, i) => (
                  <li key={i} className="border-l-2 border-amber-500/40 pl-2 mb-1">
                    <span className="font-semibold tabular-nums">{m.year}</span> — <span className="font-medium">{m.label}</span>: <span className="text-muted-foreground">{m.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <Tile label="Projected monthly (gross)" value={dollars(narrative.primaryConversion.projectedMonthlyIncome)} />
              <Tile label="After-tax monthly" value={dollars(narrative.primaryConversion.taxAdjustedMonthlyIncome)} />
              <Tile label="Sustainability" value={`${(narrative.projection.sustainabilityScore * 100).toFixed(0)}%`} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Assumptions</div>
              <ul className="ml-3 list-disc text-muted-foreground" data-testid={`${dataTestid}-assumptions`}>
                {narrative.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default RetirementTransitionPanel;

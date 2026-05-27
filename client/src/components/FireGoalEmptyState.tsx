/**
 * FireGoalEmptyState — Sprint 15.2 unified empty-state CTA.
 *
 * Single CTA component rendered by every surface that conditionally shows
 * FIRE numerics (dashboard, decision-lab, goal-closure-lab, portfolio-lab,
 * action-plan, /decision) when `isFireGoalExplicitlySet(goal)` returns
 * false. Replaces the surface-specific "Set a FIRE goal …" / "Pick your
 * FIRE goal" / "Probability of FIRE —" placeholders so the message and
 * call-to-action are consistent.
 *
 * The component is intentionally lightweight — it does NOT compute any
 * numeric fields. Surfaces continue to render ledger-derived figures
 * (current NW, monthly passive) where appropriate; only goal-dependent
 * numerics (gap, progress, FIRE year, timeline) must be suppressed.
 */

import * as React from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Target } from "lucide-react";

export interface FireGoalEmptyStateProps {
  /** Surface key for analytics / data-testid. */
  surface:
    | "dashboard"
    | "decision-lab"
    | "goal-closure-lab"
    | "portfolio-lab"
    | "action-plan"
    | "decision";
  /** Optional surface-specific subtitle. Defaults to the canonical copy. */
  subtitle?: string;
  /** Optional compact mode (chip-sized, no card chrome). */
  compact?: boolean;
}

const DEFAULT_SUBTITLE =
  "Pick a target year and monthly passive income so every surface can size projections, gaps and recommendations to your goal.";

const GOAL_HREF = "/financial-plan#fire-goal";

export function FireGoalEmptyState({
  surface,
  subtitle = DEFAULT_SUBTITLE,
  compact = false,
}: FireGoalEmptyStateProps): JSX.Element {
  const testId = `fire-goal-empty-${surface}`;
  if (compact) {
    return (
      <div
        data-testid={testId}
        className="inline-flex items-center gap-2 rounded border border-dashed border-muted-foreground/40 bg-muted/20 px-3 py-2 text-xs"
      >
        <Target className="h-3 w-3 text-muted-foreground" aria-hidden />
        <span className="font-medium text-foreground">Set your FIRE goal</span>
        <Link href={GOAL_HREF}>
          <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-xs">
            Configure
            <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </div>
    );
  }
  return (
    <Card
      data-testid={testId}
      className="p-4 sm:p-5 border-dashed border-muted-foreground/40 bg-muted/20"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1">
          <h3 className="text-base font-semibold text-foreground">
            Set your FIRE goal
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            {subtitle}
          </p>
        </div>
        <Link href={GOAL_HREF}>
          <Button variant="default" className="gap-1" data-testid={`${testId}-cta`}>
            <Target className="h-3 w-3" />
            Set FIRE goal
            <ArrowRight className="h-3 w-3" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}

export default FireGoalEmptyState;

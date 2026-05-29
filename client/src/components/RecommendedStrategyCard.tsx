/**
 * RecommendedStrategyCard — Sprint 28B (post-Run-Plan handoff).
 *
 * Per SPRINT28B_EXECUTION_ROADMAP.md §2, after Run Plan the Goal Lab post-run
 * surface shows ONLY this card. No bullets, no metrics, no probability —
 * those all live on `/action-roadmap`. This card is a pure handoff.
 *
 * Required body copy is verbatim and intentionally generic — the Action
 * Roadmap is where the user goes for any per-path detail.
 */
import * as React from "react";
import { Link } from "wouter";
import { ArrowRight, Map as MapIcon } from "lucide-react";

import type { GoalLabRankedScenario } from "@/lib/goalLab/orchestrator";

export interface RecommendedStrategyCardProps {
  pick: GoalLabRankedScenario | null;
  /** Kept on the prop API for backward compatibility; intentionally unused. */
  rationale?: string | null;
}

const BODY_COPY =
  "This path currently provides the strongest probability-adjusted route toward your FIRE target.";

export function RecommendedStrategyCard({ pick }: RecommendedStrategyCardProps) {
  if (!pick) {
    return (
      <section
        data-testid="recommended-strategy-card-empty"
        className="rounded-2xl border border-dashed border-violet-400/60 bg-violet-50/40 p-5 dark:border-violet-400/40 dark:bg-violet-950/30"
      >
        <div className="flex items-start gap-2">
          <MapIcon className="mt-0.5 h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-violet-800 dark:text-violet-200">
              Recommended path
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Run a plan from Decision Lab to surface the recommended path here.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="recommended-strategy-card"
      aria-labelledby="recommended-strategy-heading"
      className="rounded-2xl border border-violet-500/60 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm dark:border-violet-400/50 dark:from-violet-950/40 dark:to-card"
    >
      <div
        id="recommended-strategy-heading"
        className="text-[10px] font-semibold uppercase tracking-wider text-violet-800 dark:text-violet-200"
      >
        Recommended path
      </div>
      <div className="mt-2 text-xl font-semibold text-foreground">{pick.templateLabel}</div>
      <p className="mt-2 text-sm text-muted-foreground">{BODY_COPY}</p>
      <Link
        href="/action-roadmap"
        data-testid="recommended-strategy-cta"
        className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400"
      >
        Open Action Roadmap
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </section>
  );
}

export default RecommendedStrategyCard;

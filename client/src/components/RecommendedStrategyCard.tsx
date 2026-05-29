/**
 * RecommendedStrategyCard — Sprint 28.
 *
 * Single Goal-Lab card surfaced after Run Plan. Pure handoff to Action
 * Roadmap — strategy name + up to 3 "why" bullets + CTA. No numbers, no
 * probability, no charts (those live on `/action-roadmap`).
 *
 * Honesty: when the recommendation rationale is missing, we render the
 * literal phrase "Not modelled yet" — never a fabricated bullet.
 */
import * as React from "react";
import { Link } from "wouter";
import { ArrowRight, Star, Map as MapIcon } from "lucide-react";

import type { GoalLabRankedScenario } from "@/lib/goalLab/orchestrator";

export interface RecommendedStrategyCardProps {
  pick: GoalLabRankedScenario | null;
  rationale: string | null;
}

/**
 * Pick exactly 3 short "why" lines from the engine winner's `rationale`
 * array. We do NOT invent bullets — when the engine produced fewer than 3,
 * we surface what we have. When the engine produced none, we surface the
 * orchestrator rationale (if any) and otherwise "Not modelled yet".
 */
function pickWhyBullets(pick: GoalLabRankedScenario, rationale: string | null): string[] {
  const fromWinner: string[] = Array.isArray(pick.winner?.rationale)
    ? (pick.winner!.rationale as string[]).filter((s) => typeof s === "string" && s.trim().length > 0)
    : [];
  if (fromWinner.length > 0) return fromWinner.slice(0, 3);
  if (rationale && rationale.trim().length > 0) return [rationale];
  return ["Not modelled yet"];
}

export function RecommendedStrategyCard({ pick, rationale }: RecommendedStrategyCardProps) {
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
              Recommended strategy
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Run a plan from Decision Lab to surface the recommended strategy here.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const bullets = pickWhyBullets(pick, rationale);

  return (
    <section
      data-testid="recommended-strategy-card"
      aria-labelledby="recommended-strategy-heading"
      className="rounded-2xl border border-violet-500/60 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm dark:border-violet-400/50 dark:from-violet-950/40 dark:to-card"
    >
      <div className="flex items-center gap-2">
        <Star className="h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden />
        <div
          id="recommended-strategy-heading"
          className="text-[10px] font-semibold uppercase tracking-wider text-violet-800 dark:text-violet-200"
        >
          Recommended strategy
        </div>
      </div>
      <div className="mt-2 text-lg font-semibold text-foreground">{pick.templateLabel}</div>
      {pick.promise ? (
        <div className="mt-0.5 text-sm text-muted-foreground">{pick.promise}</div>
      ) : null}

      <div className="mt-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-800 dark:text-violet-200">
          Why this strategy
        </div>
        <ul className="mt-1.5 space-y-1.5">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-foreground">
              <span aria-hidden className="mt-1.5 inline-block h-1 w-1 flex-none rounded-full bg-violet-500/70" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

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

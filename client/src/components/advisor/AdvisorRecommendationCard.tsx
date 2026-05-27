/**
 * AdvisorRecommendationCard — Sprint 20 PR-B P2-1 / P2-2.
 *
 * Renders an AdvisorRecommendation with:
 *   - top 3 lines: WHAT + WHEN + ΔIMPROVES (advisor-summary-first)
 *   - confidence chip (green/amber/red, tooltip = confidence.basis)
 *   - sensitivity line (top-1 surface only)
 *   - assumptions footer disclosure (collapsed by default)
 *   - risks / alternatives / do-nothing collapse on mobile
 *
 * Used on Recommended Actions, Decision Lab, Goal Closure Lab, Portfolio Lab.
 */

import * as React from "react";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AdvisorRecommendation } from "@/lib/advisorNarrativeEngine";

function formatDollars(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function confidenceClass(band: AdvisorRecommendation["confidence"]["band"]): string {
  switch (band) {
    case "high":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40";
    case "medium":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40";
    case "low":
      return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40";
  }
}

export interface AdvisorRecommendationCardProps {
  rec: AdvisorRecommendation;
  isTopOnSurface?: boolean;
  surface?: string;
  index?: number;
}

export function AdvisorRecommendationCard({
  rec,
  isTopOnSurface = false,
  surface,
  index = 0,
}: AdvisorRecommendationCardProps) {
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [showRisksAlts, setShowRisksAlts] = useState(false);
  const improvesParts: string[] = [];
  if (rec.improves.fireYearDelta != null && rec.improves.fireYearDelta !== 0) {
    const d = rec.improves.fireYearDelta;
    improvesParts.push(`${d < 0 ? "−" : "+"}${Math.abs(d).toFixed(1)}y FIRE`);
  }
  if (rec.improves.nwDelta != null && rec.improves.nwDelta !== 0) {
    improvesParts.push(`NW ${rec.improves.nwDelta > 0 ? "+" : "−"}${formatDollars(Math.abs(rec.improves.nwDelta))}`);
  }
  if (rec.improves.monthlyPassiveDelta != null && rec.improves.monthlyPassiveDelta !== 0) {
    improvesParts.push(`+${formatDollars(rec.improves.monthlyPassiveDelta)}/mo passive`);
  }
  if (rec.improves.successDelta != null && rec.improves.successDelta !== 0) {
    improvesParts.push(`success ${rec.improves.successDelta > 0 ? "+" : ""}${(rec.improves.successDelta * 100).toFixed(0)}pp`);
  }
  const dataTestid = surface
    ? `advisor-rec-${surface}-${index}`
    : `advisor-rec-${index}`;

  return (
    <Card data-testid={dataTestid} className="overflow-hidden">
      <CardContent className="p-3 sm:p-4 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm sm:text-base font-semibold text-foreground" data-testid={`${dataTestid}-what`}>
              {rec.what.action}
            </div>
            <div className="text-[12px] sm:text-[13px] text-muted-foreground" data-testid={`${dataTestid}-when`}>
              {`When: ${rec.when.year}${rec.when.quarter ? ` Q${rec.when.quarter}` : ""} — ${rec.when.reason}`}
            </div>
            {improvesParts.length > 0 && (
              <div className="text-[12px] sm:text-[13px] text-foreground font-medium mt-0.5" data-testid={`${dataTestid}-improves`}>
                {`Improves: ${improvesParts.join(", ")}`}
              </div>
            )}
          </div>
          <span
            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap ${confidenceClass(rec.confidence.band)}`}
            title={rec.confidence.basis}
            data-testid={`${dataTestid}-confidence-chip`}
          >
            {rec.confidence.band}
          </span>
        </div>

        <div className="text-[12px] sm:text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">Why:</span>{" "}
          <span data-testid={`${dataTestid}-why`}>{rec.why}</span>
        </div>

        <div className="text-[12px] sm:text-[13px] text-muted-foreground">
          <span className="font-medium text-foreground">Details:</span>{" "}
          {rec.what.concreteDetails}
        </div>

        {isTopOnSurface && rec.sensitivity && (
          <div className="text-[12px] text-amber-700 dark:text-amber-300 border-l-2 border-amber-500/50 pl-2" data-testid={`${dataTestid}-sensitivity`}>
            <span className="font-medium">What changes the outcome?</span> {rec.sensitivity.line}
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowRisksAlts((v) => !v)}
          className="flex items-center gap-1 text-[12px] text-foreground/80 hover:text-foreground self-start"
          data-testid={`${dataTestid}-toggle-detail`}
          aria-expanded={showRisksAlts}
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${showRisksAlts ? "rotate-180" : ""}`} />
          {showRisksAlts ? "Hide" : "Show"} risks, alternatives & do-nothing
        </button>
        {showRisksAlts && (
          <div className="flex flex-col gap-2 text-[12px]">
            <div>
              <div className="font-medium text-foreground">Risks ({rec.risks.length})</div>
              <ul className="ml-4 list-disc text-muted-foreground" data-testid={`${dataTestid}-risks`}>
                {rec.risks.map((r, i) => (
                  <li key={i}>
                    <span className="font-medium text-foreground">[{r.severity}]</span> {r.label} — <span className="italic">{r.mitigation}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-medium text-foreground">Alternatives</div>
              <ul className="ml-4 list-disc text-muted-foreground" data-testid={`${dataTestid}-alternatives`}>
                {rec.alternatives.map((a, i) => (
                  <li key={i}>
                    <span className="font-medium text-foreground">{a.label}</span> — {a.tradeoff}
                    {a.estimatedImprovement ? ` (${a.estimatedImprovement})` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="font-medium text-foreground">If you do nothing</div>
              <div className="text-muted-foreground" data-testid={`${dataTestid}-do-nothing`}>
                Projected FIRE year {rec.doNothing.projectedFireYear}; projected monthly passive {formatDollars(rec.doNothing.projectedMonthlyIncome)}; gap vs target {formatDollars(rec.doNothing.gapVsTarget)}.
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowAssumptions((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground self-start mt-1"
          data-testid={`${dataTestid}-toggle-assumptions`}
          aria-expanded={showAssumptions}
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${showAssumptions ? "rotate-180" : ""}`} />
          {showAssumptions ? "Hide" : "Show"} assumptions
        </button>
        {showAssumptions && (
          <ul className="ml-4 list-disc text-[11px] text-muted-foreground" data-testid={`${dataTestid}-assumptions`}>
            {rec.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default AdvisorRecommendationCard;

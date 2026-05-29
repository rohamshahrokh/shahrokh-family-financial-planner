/**
 * FireJourneyRoadmap — Action Roadmap S2 (Sprint 28B).
 *
 * Vertical stacked-cards roadmap on ALL viewports. Replaces the old SVG
 * timeline. Renders one card per enriched milestone:
 *
 *   TODAY → milestone 1 → milestone 2 → ... → FIRE
 *
 * Each non-FIRE card shows year, label, effect, expected outcome, and the
 * per-milestone FIRE-progress impact (e.g. "27% → 39%"). Connector lines
 * between cards are pure CSS (border-l) — no chart deps.
 *
 * Honesty: when `progressImpact` is null we render "Not modelled yet" for
 * the percentage step.
 */
import * as React from "react";
import { CheckCircle2, Circle, Flag, MapPin } from "lucide-react";
import { SourceChip } from "@/components/SourceChip";
import type { FireJourneyMilestone } from "@/lib/actionRoadmap/fireJourneyMilestones";
import type { RoadmapSectionProps } from "./roadmapContext";
import type { RoadmapMilestone } from "@/lib/actionRoadmap/types";

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "Not modelled yet";
  return `${n.toFixed(0)}%`;
}

function statusIcon(status: RoadmapMilestone["status"]) {
  if (status === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />;
  if (status === "fire")      return <Flag className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />;
  if (status === "next")      return <Circle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />;
  return <Circle className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />;
}

function statusBadge(status: RoadmapMilestone["status"]): { label: string; tone: string } {
  switch (status) {
    case "completed": return { label: "Completed", tone: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25" };
    case "next":      return { label: "Next",      tone: "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25" };
    case "upcoming":  return { label: "Upcoming",  tone: "bg-blue-100 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/25" };
    case "fire":      return { label: "FIRE",      tone: "bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/25" };
  }
}

export function FireJourneyRoadmap(props: RoadmapSectionProps) {
  const { enrichedMilestones, mcProjection, auditMode } = props;

  return (
    <section
      data-testid="ar-s2-fire-journey-roadmap"
      aria-labelledby="ar-s2-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">FIRE journey roadmap</div>
        <h2 id="ar-s2-heading" className="text-base font-semibold text-foreground">Milestone-by-milestone path</h2>
      </div>

      {enrichedMilestones.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="ar-s2-empty">
          No milestones from the recommended path yet.
        </p>
      ) : (
        <ol className="mt-4 space-y-3" data-testid="ar-s2-list">
          {/* TODAY marker */}
          <li className="relative pl-6">
            <span className="absolute left-0 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-white"><MapPin className="h-2.5 w-2.5" aria-hidden /></span>
            <span className="absolute left-[7px] top-5 h-full w-px bg-border/60" aria-hidden />
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">Today</span>
              <span className="text-sm font-medium text-foreground">Starting point</span>
            </div>
          </li>

          {enrichedMilestones.map((m, i) => (
            <MilestoneCard key={m.id} milestone={m} isLast={i === enrichedMilestones.length - 1} mc={mcProjection} auditMode={auditMode} />
          ))}
        </ol>
      )}
    </section>
  );
}

function MilestoneCard({
  milestone, isLast, mc, auditMode,
}: {
  milestone: FireJourneyMilestone;
  isLast: boolean;
  mc: RoadmapSectionProps["mcProjection"];
  auditMode: boolean;
}) {
  const badge = statusBadge(milestone.status);
  const isFire = milestone.status === "fire";
  const progress = milestone.progressImpact;
  const progressText =
    progress != null
      ? `${fmtPct(progress.before)} → ${fmtPct(progress.after)}`
      : "Not modelled yet";

  return (
    <li className="relative pl-6" data-testid={`ar-s2-card-${milestone.id}`}>
      <span className="absolute left-0 top-1">{statusIcon(milestone.status)}</span>
      {!isLast && <span className="absolute left-[7px] top-5 h-full w-px bg-border/60" aria-hidden />}
      <div className={"rounded-lg border p-3 " + (isFire ? "border-violet-400/60 bg-violet-50/40 dark:border-violet-400/30 dark:bg-violet-950/20" : "border-border/60 bg-background/60")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border">{milestone.year}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${badge.tone}`}>{badge.label}</span>
          <span className="text-sm font-semibold text-foreground">{milestone.label}</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{milestone.effect}</div>
        <div className="mt-1 text-xs text-foreground/90">{milestone.expectedOutcome}</div>

        {!isFire ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">FIRE progress</span>
            <span className="text-sm font-medium text-foreground">{progressText}</span>
            <SourceChip
              attribution={{
                source: progress == null ? "notModelled" : "scenarioV2.monteCarlo",
                percentile: "p50",
                simulationCount: mc.simulationCount,
                note: "% of FIRE number at milestone month",
              }}
              auditMode={auditMode}
            />
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Projected NW at FIRE (P50)</div>
              <div className="text-sm font-semibold text-foreground">
                {mc.netWorthAtFire.p50 != null ? `$${Math.round(mc.netWorthAtFire.p50).toLocaleString("en-AU")}` : "Not modelled yet"}
              </div>
              <SourceChip
                attribution={{ source: mc.netWorthAtFire.p50 == null ? "notModelled" : "scenarioV2.monteCarlo", percentile: "p50", simulationCount: mc.simulationCount }}
                auditMode={auditMode}
              />
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Passive income (P50)</div>
              <div className="text-sm font-semibold text-foreground">
                {mc.passiveIncomeAtFire.p50 != null ? `$${Math.round(mc.passiveIncomeAtFire.p50).toLocaleString("en-AU")}` : "Not modelled yet"}
              </div>
              <SourceChip
                attribution={{ source: mc.passiveIncomeAtFire.p50 == null ? "notModelled" : "scenarioV2.monteCarlo", percentile: "p50", simulationCount: mc.simulationCount }}
                auditMode={auditMode}
              />
            </div>
          </div>
        )}
      </div>
    </li>
  );
}

export default FireJourneyRoadmap;

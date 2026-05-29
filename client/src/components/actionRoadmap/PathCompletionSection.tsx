/**
 * PathCompletionSection — Action Roadmap S4 (Sprint 28).
 *
 * Reads the output of `computePathCompletion()` (already-engine-derived) and
 * surfaces: status badge, current NW vs FIRE number, gap remaining, years
 * remaining. Each numeric value wears a SourceChip.
 */
import * as React from "react";
import { Target } from "lucide-react";
import type { PathCompletion } from "@/lib/actionRoadmap/types";
import { SourceChip } from "@/components/SourceChip";

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "Not modelled yet";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}

function statusBadge(status: PathCompletion["status"]): { label: string; tone: string } {
  switch (status) {
    case "ON_TRACK":
      return { label: "On track", tone: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25" };
    case "ON_TARGET_LATE":
      return { label: "On target — late", tone: "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25" };
    case "GAP_REMAINING":
      return { label: "Gap remaining", tone: "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25" };
    case "NOT_MODELLED":
      return { label: "Not modelled yet", tone: "bg-muted text-muted-foreground ring-border" };
  }
}

export interface PathCompletionSectionProps {
  completion: PathCompletion;
  currentNetWorth: number | null;
  fireNumber: number | null;
  auditMode: boolean;
}

export function PathCompletionSection({ completion, currentNetWorth, fireNumber, auditMode }: PathCompletionSectionProps) {
  const badge = statusBadge(completion.status);
  const progressPct =
    completion.goalAchievementFraction != null
      ? Math.round(completion.goalAchievementFraction * 100)
      : null;
  const earlyLate = completion.yearsEarlyOrLate;

  return (
    <section
      data-testid="ar-section-path-completion"
      aria-labelledby="ar-s4-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Target className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Path completion</div>
            <h2 id="ar-s4-heading" className="text-base font-semibold text-foreground">Where you stand vs your FIRE number</h2>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${badge.tone}`} data-testid="ar-s4-status">
          {badge.label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Tile label="Current net worth" value={fmtMoney(currentNetWorth)} source={currentNetWorth == null ? "notModelled" : "canonicalLedger"} auditMode={auditMode} testId="ar-s4-current-nw" />
        <Tile label="FIRE number" value={fmtMoney(fireNumber)} source={fireNumber == null ? "notModelled" : "goalProfile"} auditMode={auditMode} testId="ar-s4-fire-number" />
        <Tile label="Gap remaining" value={fmtMoney(completion.gapRemaining)} source={completion.gapRemaining == null ? "notModelled" : "actionRoadmap.pathCompletion"} auditMode={auditMode} testId="ar-s4-gap" />
        <Tile
          label="Years early / late"
          value={earlyLate == null ? "Not modelled yet" : earlyLate > 0 ? `+${earlyLate} years` : earlyLate < 0 ? `${earlyLate} years` : "On target"}
          source={earlyLate == null ? "notModelled" : "actionRoadmap.pathCompletion"}
          auditMode={auditMode}
          testId="ar-s4-early-late"
        />
      </div>

      {progressPct != null && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Goal coverage</div>
            <div className="text-sm font-semibold text-foreground" data-testid="ar-s4-progress-pct">{progressPct}%</div>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-emerald-500 dark:bg-emerald-400"
              style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
              aria-label={`Goal coverage ${progressPct}%`}
            />
          </div>
          <div className="mt-1">
            <SourceChip attribution={{ source: "actionRoadmap.pathCompletion" }} auditMode={auditMode} />
          </div>
        </div>
      )}

    </section>
  );
}

function Tile({
  label, value, source, auditMode, testId,
}: {
  label: string;
  value: string;
  source: import("@/lib/actionRoadmap/metricSourceAttribution").MetricSource;
  auditMode: boolean;
  testId: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3" data-testid={testId}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold text-foreground">{value}</div>
      <div className="mt-1.5"><SourceChip attribution={{ source }} auditMode={auditMode} /></div>
    </div>
  );
}

export default PathCompletionSection;

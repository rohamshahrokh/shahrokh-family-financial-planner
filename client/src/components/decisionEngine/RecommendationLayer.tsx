/**
 * RecommendationLayer.tsx — Phase 2.4 recommendation quality UI
 *
 * Two components that surface the engine's deterministic phased execution
 * plan and conditional (event-driven) recommendations:
 *
 *  • <ExecutionPlanTimeline /> — vertical phased timeline with start/end month
 *                                ranges and each action's engine-generated effect.
 *  • <ConditionalRecsList />   — trigger / action / rationale grouped by severity.
 *
 * No mock data, no AI text — everything comes from QuickDecisionOutput
 * (executionPlan, conditionalRecommendations) computed deterministically by
 * the engine in candidateGenerator.ts.
 */

import { CalendarClock, Clock, ChevronRight, AlertOctagon, AlertTriangle, Info, ListTodo } from "lucide-react";
import type { ReactNode } from "react";

import type {
  ExecutionPlanPhase,
  ConditionalRecommendation,
} from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import type { MaskFmt } from "@/components/decisionEngine/RiskVisualizations";

// ─── ExecutionPlanTimeline ───────────────────────────────────────────────────

export interface ExecutionPlanTimelineProps {
  phases: ExecutionPlanPhase[];
  fmt: MaskFmt;
}

export function ExecutionPlanTimeline({ phases, fmt }: ExecutionPlanTimelineProps) {
  if (!phases || phases.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
        No actions required — base plan recommended as-is.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
        <span className="text-xs uppercase tracking-wide font-semibold text-foreground">
          Phased execution plan
        </span>
        <span className="text-[10px] text-muted-foreground">
          {phases.length} {phases.length === 1 ? "phase" : "phases"} · grouped by 3-month windows
        </span>
      </div>

      <ol className="relative border-l-2 border-indigo-200 dark:border-indigo-900 ml-2 space-y-3 pl-4 pt-1">
        {phases.map((phase, idx) => (
          <li key={phase.index} className="relative">
            {/* Marker dot */}
            <span
              className="absolute -left-[1.45rem] top-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-indigo-500 dark:bg-indigo-400 text-[9px] text-white font-bold tabular-nums"
              aria-hidden="true"
            >
              {idx + 1}
            </span>
            <div className="rounded-md border border-border bg-card p-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs font-semibold text-foreground">{phase.label}</div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" />
                  <span className="tabular-nums">{phase.startMonth}</span>
                  {phase.startMonth !== phase.endMonth && (
                    <>
                      <ChevronRight className="h-2.5 w-2.5" />
                      <span className="tabular-nums">{phase.endMonth}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                {phase.rationale}
              </div>

              <ul className="mt-1.5 space-y-1">
                {phase.actions.map((action, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11px]">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500 mt-1.5 shrink-0" />
                    <div className="min-w-0">
                      <span className="font-medium text-foreground capitalize">
                        {action.event.replace(/_/g, " ")}
                      </span>
                      <span className="text-muted-foreground"> — {fmt.sentence(action.effect)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── ConditionalRecsList ─────────────────────────────────────────────────────

export interface ConditionalRecsListProps {
  recommendations: ConditionalRecommendation[];
  fmt: MaskFmt;
}

export function ConditionalRecsList({ recommendations, fmt }: ConditionalRecsListProps) {
  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  // Stable severity ordering: critical → warn → info.
  const order: Record<ConditionalRecommendation["severity"], number> = {
    critical: 0, warn: 1, info: 2,
  };
  const sorted = [...recommendations].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ListTodo className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        <span className="text-xs uppercase tracking-wide font-semibold text-foreground">
          Conditional recommendations
        </span>
        <span className="text-[10px] text-muted-foreground">
          {sorted.length} trigger → action mappings
        </span>
      </div>

      <div className="space-y-2">
        {sorted.map(rec => (
          <RecTile key={rec.id} rec={rec} fmt={fmt} />
        ))}
      </div>
    </div>
  );
}

function RecTile({ rec, fmt }: { rec: ConditionalRecommendation; fmt: MaskFmt }) {
  const tone = {
    critical: "border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20",
    warn: "border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20",
    info: "border-sky-200 dark:border-sky-900 bg-sky-50/50 dark:bg-sky-950/20",
  }[rec.severity];

  const icon: ReactNode = {
    critical: <AlertOctagon className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />,
    warn: <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />,
    info: <Info className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />,
  }[rec.severity];

  const sevBadge = {
    critical: "bg-rose-600 text-white",
    warn: "bg-amber-600 text-white",
    info: "bg-sky-600 text-white",
  }[rec.severity];

  return (
    <div className={`rounded-md border ${tone} p-2.5`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {icon}
          <span className="text-xs font-semibold text-foreground truncate">
            {prettifyRecId(rec.id)}
          </span>
        </div>
        <span className={`text-[9px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded ${sevBadge}`}>
          {rec.severity}
        </span>
      </div>

      <div className="space-y-1 text-[11px]">
        <div>
          <span className="text-[9px] uppercase tracking-wide font-semibold text-muted-foreground">If</span>
          <div className="text-foreground leading-snug">{fmt.sentence(rec.trigger)}</div>
        </div>
        <div>
          <span className="text-[9px] uppercase tracking-wide font-semibold text-muted-foreground">Then</span>
          <div className="text-foreground leading-snug">{fmt.sentence(rec.action)}</div>
        </div>
        <div className="pt-1 mt-1 border-t border-border/60">
          <span className="text-[9px] uppercase tracking-wide font-semibold text-muted-foreground">Why</span>
          <div className="text-muted-foreground leading-snug">{fmt.sentence(rec.rationale)}</div>
        </div>
      </div>
    </div>
  );
}

function prettifyRecId(id: string): string {
  return id
    .split("-")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * actionRoadmap/ActionRoadmapPanel.tsx — Sprint 27 Batch 2.
 *
 * UI surface for the Action Roadmap. Reads the latest persisted Goal Lab plan
 * (no engine re-run, no MC, no Supabase write), then orchestrates the four
 * already-built selectors to produce a single Goal Lab right-rail card.
 *
 * Inputs are PURE engine outputs:
 *   • plan.picks.recommended      → builder + completion + risk + narrative
 *   • plan.picks + rankedScenarios → accelerator ranking
 *
 * Honesty: every numeric field surfaced here came from the engine. When the
 * cache is empty OR the engine returned an empty fan, this card renders
 * "Not modelled yet" with a link to /decision-lab.
 */

import * as React from "react";
import { Link } from "wouter";
import {
  Map as MapIcon, CheckCircle2, Circle, Flag, Target,
  AlertTriangle, Zap, Compass, ArrowRight,
} from "lucide-react";

import type { CanonicalFire } from "@/lib/canonicalFire";
import type { CanonicalGoal } from "@/lib/useCanonicalGoal";
import { readLatestGoalLabPlan } from "@/lib/goalLab/orchestrator";

import { buildActionRoadmap } from "./actionRoadmapBuilder";
import { computePathCompletion } from "./pathCompletionEngine";
import { analyzeRoadmapRisk } from "./roadmapRiskAnalyzer";
import { buildAcceleratorRanking } from "./roadmapAccelerators";
import { buildRoadmapNarrative } from "./roadmapNarrative";
import type {
  ActionRoadmap, PathCompletion, RoadmapMilestone, RoadmapRiskAxis, RoadmapRiskSummary, RiskBand,
} from "./types";

// ─── Props ──────────────────────────────────────────────────────────────────

export interface ActionRoadmapPanelProps {
  goal: CanonicalGoal | null;
  fire: CanonicalFire | null;
  currentAge: number | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}

function statusToneClasses(status: RoadmapMilestone["status"]): string {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25";
    case "next":
      return "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25";
    case "upcoming":
      return "bg-blue-100 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/25";
    case "fire":
      return "bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/25";
  }
}

function statusLabel(status: RoadmapMilestone["status"]): string {
  switch (status) {
    case "completed": return "Completed";
    case "next":      return "Next";
    case "upcoming":  return "Upcoming";
    case "fire":      return "FIRE";
  }
}

function statusIcon(status: RoadmapMilestone["status"]) {
  switch (status) {
    case "completed": return <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />;
    case "next":      return <Circle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />;
    case "upcoming":  return <Circle className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />;
    case "fire":      return <Flag className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />;
  }
}

function bandToneClasses(band: RiskBand): string {
  switch (band) {
    case "low":
      return "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25";
    case "medium":
      return "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25";
    case "high":
      return "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25";
    case "unknown":
      return "bg-muted text-muted-foreground ring-border dark:bg-muted/40";
  }
}

function bandShortLabel(band: RiskBand): string {
  if (band === "unknown") return "Not modelled";
  return band.charAt(0).toUpperCase() + band.slice(1);
}

function completionStatusLabel(status: PathCompletion["status"]): { label: string; toneClasses: string } {
  switch (status) {
    case "ON_TRACK":
      return { label: "On track", toneClasses: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25" };
    case "ON_TARGET_LATE":
      return { label: "On target — late", toneClasses: "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25" };
    case "GAP_REMAINING":
      return { label: "Gap remaining", toneClasses: "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25" };
    case "NOT_MODELLED":
      return { label: "Not modelled yet", toneClasses: "bg-muted text-muted-foreground ring-border dark:bg-muted/40" };
  }
}

// ─── Sub-sections ───────────────────────────────────────────────────────────

function HeaderSection(props: {
  templateLabel: string;
  templatePromise: string;
  headline: string;
  bullets: string[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <MapIcon className="mt-0.5 h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden />
        <div className="space-y-0.5">
          <div className="text-base font-semibold text-foreground">Action roadmap</div>
          <div className="text-sm text-muted-foreground">{props.templateLabel} · {props.templatePromise}</div>
        </div>
      </div>
      <div className="text-sm font-medium text-foreground">{props.headline}</div>
      {props.bullets.length > 0 && (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {props.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 inline-block h-1 w-1 flex-none rounded-full bg-muted-foreground/60" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MilestonesSection(props: { roadmap: ActionRoadmap | null }) {
  const roadmap = props.roadmap;
  if (!roadmap || roadmap.milestones.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
        No engine milestones on this path yet.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Milestones</div>
      <ol className="space-y-2">
        {roadmap.milestones.map((m) => (
          <li
            key={m.id}
            className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/60 p-3"
          >
            <div className="mt-0.5">{statusIcon(m.status)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{m.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${statusToneClasses(m.status)}`}>
                  {statusLabel(m.status)}
                </span>
                <span className="text-xs text-muted-foreground">{m.month}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{m.effect}</div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PathCompletionSection(props: { completion: PathCompletion }) {
  const c = props.completion;
  const status = completionStatusLabel(c.status);
  const isModelled = c.status !== "NOT_MODELLED";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Path completion</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${status.toneClasses}`}>{status.label}</span>
      </div>

      {!isModelled ? (
        <div className="rounded-lg border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
          Not modelled yet. Run a plan from <Link href="/decision-lab" className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-300">Decision Lab</Link> to populate this section.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg border border-border/60 bg-background/60 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Expected FIRE age</div>
            <div className="text-base font-semibold text-foreground">
              {c.expectedFireAge != null ? c.expectedFireAge : <span className="text-muted-foreground">Not modelled yet</span>}
            </div>
            {c.targetFireAge != null && (
              <div className="text-[11px] text-muted-foreground">Target: {c.targetFireAge}</div>
            )}
          </div>
          <div className="rounded-lg border border-border/60 bg-background/60 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Median net worth</div>
            <div className="text-base font-semibold text-foreground">{fmtMoney(c.expectedNetWorth)}</div>
            {c.expectedNetWorthRange && (
              <div className="text-[11px] text-muted-foreground">P25–P75: {fmtMoney(c.expectedNetWorthRange.p25)}–{fmtMoney(c.expectedNetWorthRange.p75)}</div>
            )}
          </div>
          <div className="rounded-lg border border-border/60 bg-background/60 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Monthly passive income</div>
            <div className="text-base font-semibold text-foreground">{fmtMoney(c.expectedMonthlyPassiveIncome)}</div>
            {c.audit.swrPctUsed != null && (
              <div className="text-[11px] text-muted-foreground">at {c.audit.swrPctUsed}% SWR</div>
            )}
          </div>
          <div className="rounded-lg border border-border/60 bg-background/60 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Years early / late</div>
            <div className="text-base font-semibold text-foreground">
              {c.yearsEarlyOrLate == null
                ? <span className="text-muted-foreground">Not modelled yet</span>
                : c.yearsEarlyOrLate > 0
                  ? `+${c.yearsEarlyOrLate}`
                  : c.yearsEarlyOrLate < 0
                    ? `${c.yearsEarlyOrLate}`
                    : "On target"}
            </div>
            {c.gapRemaining != null && c.gapRemaining > 0 && (
              <div className="text-[11px] text-muted-foreground">Gap: {fmtMoney(c.gapRemaining)}</div>
            )}
          </div>
        </div>
      )}

      {isModelled && c.why.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {c.why.slice(0, 3).map((w, i) => (
            <li key={i} className="flex items-start gap-2">
              <span aria-hidden className="mt-1.5 inline-block h-1 w-1 flex-none rounded-full bg-muted-foreground/60" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RiskSection(props: { risk: RoadmapRiskSummary }) {
  const risk = props.risk;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risk axes</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${bandToneClasses(risk.overall)}`}>
          Overall: {bandShortLabel(risk.overall)}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {risk.axes.map((a: RoadmapRiskAxis) => (
          <div key={a.axis} className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/60 p-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">{a.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${bandToneClasses(a.band)}`}>
                  {bandShortLabel(a.band)}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{a.detail}</div>
            </div>
          </div>
        ))}
      </div>
      {risk.warnings.length > 0 && (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {risk.warnings.slice(0, 3).map((w, i) => (
            <li key={i} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none text-amber-600 dark:text-amber-400" aria-hidden />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AcceleratorsSection(props: {
  ranking: ReturnType<typeof buildAcceleratorRanking>;
}) {
  const r = props.ranking;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top accelerators</div>
      </div>
      {r.topAccelerators.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 p-3 text-xs text-muted-foreground">
          No engine-modelled accelerator outperforms the recommended path right now.
        </div>
      ) : (
        <ul className="space-y-2">
          {r.topAccelerators.map((a) => (
            <li key={a.id} className="rounded-lg border border-border/60 bg-background/60 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{a.label}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25">
                  +{fmtMoney(a.terminalNwDelta)} NW
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{a.template.label} · {a.oneLine}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AlternativePathsSection(props: {
  ranking: ReturnType<typeof buildAcceleratorRanking>;
}) {
  const items = props.ranking.underperformers;
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Compass className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alternative paths</div>
      </div>
      <ul className="space-y-2">
        {items.map((a) => (
          <li key={a.id} className="rounded-lg border border-border/60 bg-background/60 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">{a.label}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border">
                {fmtMoney(a.terminalNwDelta)} NW
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{a.template.label} · {a.oneLine}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Main panel ─────────────────────────────────────────────────────────────

export function ActionRoadmapPanel({ goal, fire, currentAge }: ActionRoadmapPanelProps) {
  const plan = React.useMemo(() => readLatestGoalLabPlan(), []);

  // No plan cached → empty-state card with link to Decision Lab.
  if (!plan || !plan.picks?.recommended) {
    return (
      <section
        aria-labelledby="action-roadmap-empty-heading"
        className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
      >
        <div className="flex items-start gap-2">
          <MapIcon className="mt-0.5 h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden />
          <div className="space-y-1">
            <h3 id="action-roadmap-empty-heading" className="text-base font-semibold text-foreground">Action roadmap</h3>
            <p className="text-sm text-muted-foreground">Not modelled yet.</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Run a plan from{" "}
          <Link href="/decision-lab" className="font-medium text-violet-600 underline-offset-2 hover:underline dark:text-violet-300">
            Decision Lab
          </Link>{" "}
          to generate your roadmap, completion read-out, and risk analysis.
        </p>
        <Link
          href="/decision-lab"
          className="mt-3 inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400"
        >
          Open Decision Lab <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </section>
    );
  }

  const recommended = plan.picks.recommended;
  const targetFireAge = goal && goal.status === "SET" ? goal.targetFireAge : null;

  // All four engine-derived selectors (pure — no MC).
  const roadmap   = buildActionRoadmap(recommended, { targetFireAge }, currentAge);
  const completion = computePathCompletion(recommended, fire, { targetFireAge }, currentAge);
  const risk       = analyzeRoadmapRisk(recommended);
  const ranking    = buildAcceleratorRanking(plan.picks, plan.rankedScenarios);
  const narrative  = buildRoadmapNarrative(recommended, roadmap, completion, risk);

  const templateLabel = roadmap?.template.label ?? "Custom path";
  const templatePromise = roadmap?.template.promise ?? "Engine-ranked recommended path.";

  return (
    <section
      aria-labelledby="action-roadmap-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <h3 id="action-roadmap-heading" className="sr-only">Action roadmap</h3>
      <div className="space-y-5">
        <HeaderSection
          templateLabel={templateLabel}
          templatePromise={templatePromise}
          headline={narrative.headline}
          bullets={narrative.bullets}
        />

        <MilestonesSection roadmap={roadmap} />

        <PathCompletionSection completion={completion} />

        <RiskSection risk={risk} />

        <AcceleratorsSection ranking={ranking} />

        <AlternativePathsSection ranking={ranking} />

        {narrative.whyThisPath.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden />
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why this path</div>
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {narrative.whyThisPath.slice(0, 4).map((w, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span aria-hidden className="mt-1.5 inline-block h-1 w-1 flex-none rounded-full bg-muted-foreground/60" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {narrative.whatCouldInvalidate.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What could invalidate this</div>
            </div>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {narrative.whatCouldInvalidate.slice(0, 4).map((w, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span aria-hidden className="mt-1.5 inline-block h-1 w-1 flex-none rounded-full bg-muted-foreground/60" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

export default ActionRoadmapPanel;

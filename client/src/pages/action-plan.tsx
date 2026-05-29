/**
 * action-plan.tsx — Action Centre refinement.
 *
 * Decision command centre. One page, plain language, mobile-first. Sections:
 *   A. Current Position        — NW, FIRE %, passive coverage, forecast freshness
 *   B. FIRE Goal               — canonical goal (or CTA when not set)
 *   C. Recommended Next Move   — unified engine bestMove, plain-language
 *   D. Top Actions             — up to 3 from unified topPriorities/all
 *   E. Blockers                — placeholder ("No hard blockers detected …")
 *   F. Do-Nothing Outcome      — recommended gap vs status-quo, text comparison
 *   G. Checklist               — persists to mc_fire_settings.action_checklist
 *                                (JSONB), with localStorage as emergency fallback
 *
 * NO new financial engine. Every number routes through an EXISTING canonical
 * selector (computeCanonicalHeadlineMetrics, computeCanonicalFire,
 * computeUnifiedBestMove, useCanonicalGoal, evaluateFreshness).
 *
 * ── Audit-gate pattern (READ THIS BEFORE EDITING) ──────────────────────────
 * Every card on this page uses the SAME gate:
 *   const { auditMode } = useAuditMode();
 *   ...
 *   {auditMode && <SourceChip>...selector/formula...</SourceChip>}
 *
 * Rules for contributors:
 *   1. Plain-English copy and canonical numbers ALWAYS render — they are not
 *      audit-only. The audit gate ONLY hides formulas, lineage chips, raw
 *      selector names, and engine-trace IDs.
 *   2. Never call `useAuditMode()` at the page root and prop-drill the flag —
 *      call it inside each card that needs it. This keeps unrelated cards from
 *      re-rendering when the toggle flips and makes the gate auditable per
 *      component (grep for `auditMode &&`).
 *   3. Never write "if (auditMode) { compute X }" — compute the canonical
 *      number unconditionally and only gate its DISPLAY.
 *   4. New cards must follow the same pattern (see CurrentPositionSection,
 *      FireGoalSection, RecommendedNextMoveSection for examples).
 * ────────────────────────────────────────────────────────────────────────────
 */

import * as React from "react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import {
  selectPropertyEquity,
  selectStocksTotal,
  selectCryptoTotal,
  selectCashToday,
  selectSuperCombined,
} from "@/lib/dashboardDataContract";
import { computeCanonicalHeadlineMetrics } from "@/lib/canonicalHeadlineMetrics";
import { selectCanonicalFire, isFireGoalExplicitlySet } from "@/lib/canonicalFire";
import { useCanonicalGoal } from "@/lib/useCanonicalGoal";
import { FireGoalEmptyState } from "@/components/FireGoalEmptyState";
import { readLatestQuickDecisionGeneratedAt, type UnifiedBestMoveResult } from "@/lib/recommendationEngine/bestMoveBridge";
import type { Recommendation } from "@/lib/recommendationEngine/types";
import { formatConfidence } from "@/lib/confidenceLabels";
import { useCanonicalRecommendation } from "@/hooks/useCanonicalRecommendation";
import { evaluateFreshness } from "@shared/forecastFreshness";
import { formatCurrency } from "@/lib/finance";
import { useAuditMode } from "@/lib/auditMode/AuditModeContext";
import { Button } from "@/components/ui/button";
import {
  readLatestGoalLabPlan,
  readLatestGoalLabPlanGeneratedAt,
} from "@/lib/goalLab/orchestrator";

/* ────────────────────────────────────────────────────────────────────────── */
/* Plain-language label dictionary                                            */
/* Engine titles are generally plain English already (see                     */
/* recommendationEngine/engine.ts ~L176+), but a few canonical engine labels  */
/* and substrings are mapped here so the page never leaks jargon.             */
/* TODO: extend if new engine label slips through (fallback logs a warning).  */
/* ────────────────────────────────────────────────────────────────────────── */
const LABEL_MAP: Array<[RegExp, string | ((m: RegExpMatchArray) => string)]> = [
  [/median net worth checkpoint/i, "Reach next net-worth checkpoint"],
  [/^buy ip(?:\s+(\d{4}))?$/i, m => m[1] ? `Buy an investment property in ${m[1]}` : "Buy an investment property"],
  [/(?:delay ip|delay (?:the )?investment property)/i, "Delay the next investment property purchase"],
  [/^(?:no ip\s*\/\s*hold cash|hold cash)$/i, "Hold current position and preserve cash"],
];
function labelize(engineLabel: string | undefined | null): string {
  if (!engineLabel) return "—";
  for (const [re, repl] of LABEL_MAP) {
    const m = engineLabel.match(re);
    if (m) return typeof repl === "function" ? repl(m) : repl;
  }
  // Fallback: keep as-is with first letter capitalised. Log TODO so we can
  // extend the dictionary later.
  // eslint-disable-next-line no-console
  if (typeof console !== "undefined") console.debug("[action-plan/labelize] no mapping for:", engineLabel);
  return engineLabel.charAt(0).toUpperCase() + engineLabel.slice(1);
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */
function SourceChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] text-muted-foreground/80 leading-none">
      {children}
    </span>
  );
}

function Card({ children, testId, className }: { children: React.ReactNode; testId?: string; className?: string }) {
  return (
    <div
      data-testid={testId}
      className={`rounded-lg border bg-card p-3 sm:p-4 ${className ?? ""}`}
      style={{ borderColor: "hsl(var(--border))" }}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Verdict line (Sprint 14.2-A)                                               */
/* One-line plain-English call. Reads bestMove + confidence from the engine   */
/* output the page already loads — no new computation.                        */
/* ────────────────────────────────────────────────────────────────────────── */
function VerdictLine({ unified }: { unified: UnifiedBestMoveResult | null }) {
  const { auditMode } = useAuditMode();
  const rec = unified?.unified?.bestMove ?? null;

  if (!rec) {
    return (
      <div
        data-testid="ac-verdict-line"
        className="text-sm sm:text-base font-medium text-muted-foreground"
      >
        Run a forecast to get your next move.
      </div>
    );
  }

  const plain = labelize(rec.title);
  // Sprint 15 Phase 3 — verdict parenthetical removed. The headline confidence
  // value here was a per-rule literal (e.g. 0.6 from engine.ts:128) being shown
  // as "60% confidence" which misleads the user. Band-only chips below carry
  // the calibrated lineage via formatConfidence().
  const confAudit = formatConfidence({ kind: "rule", value: rec.confidenceScore }).audit;

  return (
    <div
      data-testid="ac-verdict-line"
      className="text-sm sm:text-base font-semibold leading-snug"
    >
      <span className="text-foreground">{plain}</span>
      {auditMode && (
        <span className="ml-2 text-[10px] text-muted-foreground/80 font-normal">
          engine: "{rec.title}" · {confAudit}
        </span>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Section A — Current Position                                               */
/* ────────────────────────────────────────────────────────────────────────── */
function CurrentPositionSection(props: {
  ledger: DashboardInputs | null;
  goalTargetNetWorth: number | null;
  unified: UnifiedBestMoveResult | null;
}) {
  const { ledger, goalTargetNetWorth, unified } = props;
  const { auditMode } = useAuditMode();
  // Sprint 15 Phase 2: route through selectCanonicalFire so the user's saved
  // mc_fire_settings overrides snapshot.fire_target_monthly_income (the SQLite
  // 20k default hazard).
  const { data: goal } = useCanonicalGoal();

  const head = ledger ? computeCanonicalHeadlineMetrics(ledger) : null;
  const fire = ledger ? selectCanonicalFire(ledger, goal) : null;

  const goalSet = isFireGoalExplicitlySet(goal);
  const nw = head?.netWorth ?? null;
  // Sprint 15.2: when the FIRE goal is not explicitly set, suppress all
  // goal-derived numerics (FIRE %, passive coverage). Ledger-only figures
  // such as net worth continue to render.
  const targetNW = goalSet
    ? (goalTargetNetWorth ?? (fire?.fireNumber && fire.fireNumber > 0 ? fire.fireNumber : null))
    : null;
  const fireProgressPct = nw !== null && targetNW && targetNW > 0
    ? Math.max(0, Math.min(100, (nw / targetNW) * 100))
    : null;

  const passiveCoveragePct = goalSet && fire?.passiveCoverage != null
    ? Math.round(fire.passiveCoverage * 100)
    : null;

  // Forecast freshness — re-uses shared/forecastFreshness.ts. Source date is
  // the snapshot.updated_at (canonical "household data last changed") and the
  // last forecast run is the session-store quick-decision timestamp.
  const decisionAt = readLatestQuickDecisionGeneratedAt();
  const snapshotUpdatedAt = (ledger?.snapshot as any)?.updated_at ?? null;
  const fresh = evaluateFreshness(
    decisionAt ? new Date(decisionAt) : null,
    snapshotUpdatedAt ? new Date(snapshotUpdatedAt) : null,
  );

  const forecastFresh = fresh.status === "FRESH";
  const forecastRunDate = decisionAt ? new Date(decisionAt) : null;
  const forecastRunLabel =
    forecastFresh && forecastRunDate
      ? forecastRunDate.toLocaleDateString(undefined, { day: "numeric", month: "short" })
      : null;
  const forecastChipLabel =
    fresh.status === "STALE" ? "Out of date" :
    fresh.status === "FRESH" ? "Up to date" :
    "Not run";
  const forecastChipBg =
    fresh.status === "FRESH" ? "hsl(var(--success) / 0.12)" :
    fresh.status === "STALE" ? "hsl(var(--gold) / 0.15)" :
    "hsl(var(--danger) / 0.12)";
  const forecastChipFg =
    fresh.status === "FRESH" ? "hsl(var(--success))" :
    fresh.status === "STALE" ? "hsl(var(--gold))" :
    "hsl(var(--danger))";

  return (
    <section data-testid="action-centre-current-position" className="space-y-2">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base sm:text-lg font-semibold">Where you are today</h2>
        {auditMode && <SourceChip>computeCanonicalHeadlineMetrics · selectCanonicalFire</SourceChip>}
      </header>

      {/* Verdict-first hero — single line above the tile grid. */}
      <Card testId="ac-verdict-card" className="border-l-4" >
        <VerdictLine unified={unified} />
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <Card testId="ac-tile-nw">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">NET WORTH</div>
          <div className="text-base sm:text-lg font-bold num-display mt-1">
            {nw !== null ? formatCurrency(nw) : "—"}
          </div>
          {auditMode && <SourceChip>canonicalHeadlineMetrics.netWorth</SourceChip>}
        </Card>

        <Card testId="ac-tile-fire-progress">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">FIRE %</div>
          <div className="text-base sm:text-lg font-bold num-display mt-1">
            {fireProgressPct !== null ? `${fireProgressPct.toFixed(1)}%` : "—"}
          </div>
          {auditMode && <SourceChip>NW ÷ required NW × 100</SourceChip>}
        </Card>

        <Card testId="ac-tile-passive-coverage">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">PASSIVE COVER</div>
          <div className="text-base sm:text-lg font-bold num-display mt-1">
            {passiveCoveragePct !== null ? `${passiveCoveragePct}%` : "—"}
          </div>
          {auditMode && <SourceChip>canonicalFire.passiveCoverage</SourceChip>}
        </Card>

        <Card testId="ac-tile-forecast">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">FORECAST</div>
          {forecastFresh ? (
            <div className="text-sm sm:text-base font-semibold mt-1">
              {forecastRunLabel ?? "Up to date"}
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2 flex-wrap">
              <span
                data-testid="ac-tile-forecast-chip"
                className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded"
                style={{
                  background: forecastChipBg,
                  color: forecastChipFg,
                  border: `1px solid ${forecastChipFg}`,
                }}
              >
                {forecastChipLabel}
              </span>
              <Link href="/wealth-strategy">
                <button
                  type="button"
                  className="text-[11px] underline text-muted-foreground hover:text-foreground"
                  data-testid="ac-tile-forecast-run-now"
                >
                  Run now →
                </button>
              </Link>
            </div>
          )}
          {auditMode && <SourceChip>{fresh.reason}</SourceChip>}
        </Card>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Section B — FIRE Goal                                                      */
/* When NOT_SET: dismissible nudge card (session-only, sessionStorage).       */
/* When SET:     single-line summary chip with an "Edit ↗" link.              */
/* ────────────────────────────────────────────────────────────────────────── */
const GOAL_CARD_DISMISSED_KEY = "fwl.action_centre.goal_card_dismissed.v1";

function FireGoalSection() {
  const { auditMode } = useAuditMode();
  const { data: goal, isLoading } = useCanonicalGoal();
  // Read current_age off mc_fire_settings so the "by 2035" chip uses the
  // household's real reference age rather than a hardcoded default.
  const { data: mcSettings } = useQuery<any>({
    queryKey: ["/api/mc-fire-settings"],
    queryFn: () => apiRequest("GET", "/api/mc-fire-settings").then(r => r.json()),
  });
  const currentAge = Number.isFinite((mcSettings as any)?.current_age)
    ? Number((mcSettings as any).current_age)
    : 40;

  // Per-session dismissal of the "Goal not set" nudge. Reappears on a new
  // browser session. Only consulted in the NOT_SET branch.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(GOAL_CARD_DISMISSED_KEY) === "1";
    } catch { return false; }
  });

  if (isLoading) {
    return (
      <section data-testid="action-centre-fire-goal">
        <Card><div className="text-sm text-muted-foreground">Loading FIRE goal…</div></Card>
      </section>
    );
  }

  if (!goal || goal.status === "NOT_SET") {
    if (dismissed) return null;
    const dismiss = () => {
      setDismissed(true);
      if (typeof window === "undefined") return;
      try { window.sessionStorage.setItem(GOAL_CARD_DISMISSED_KEY, "1"); } catch { /* ignore */ }
    };
    return (
      <section data-testid="action-centre-fire-goal">
        <Card testId="ac-goal-not-set" className="relative flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex-1 pr-6">
            <div className="text-sm font-semibold">Pick your FIRE goal</div>
            <div className="text-xs text-muted-foreground mt-1">
              Pick a target year and monthly passive income so the Action
              Centre can size recommendations to your goal.
            </div>
          </div>
          <Link href="/financial-plan#fire-goal">
            <Button data-testid="ac-goal-cta">Set your FIRE goal</Button>
          </Link>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            data-testid="ac-goal-not-set-dismiss"
            className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60"
          >
            <span aria-hidden className="text-base leading-none">×</span>
          </button>
        </Card>
      </section>
    );
  }

  // goal.status === "SET" — single-line summary chip.
  return (
    <section data-testid="action-centre-fire-goal">
      <Card testId="ac-goal-set" className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs sm:text-sm">
          <span className="font-semibold">FIRE goal:</span>{" "}
          <span className="num-display font-medium">
            {formatCurrency(goal.targetPassiveMonthly)}
          </span>
          <span className="text-muted-foreground">/mo passive by </span>
          <span className="font-medium">
            {new Date().getFullYear() + Math.max(0, goal.targetFireAge - currentAge)}
          </span>
          <span className="text-muted-foreground">.</span>
        </span>
        <Link href="/financial-plan#fire-goal">
          <button
            type="button"
            data-testid="ac-goal-edit"
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            Edit ↗
          </button>
        </Link>
        {auditMode && (
          <SourceChip>
            mc_fire_settings · NW needed = {formatCurrency(goal.targetNetWorth)} (= passive × 12 ÷ {goal.swrPct}% SWR)
          </SourceChip>
        )}
      </Card>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Section C — Recommended Next Move                                          */
/* ────────────────────────────────────────────────────────────────────────── */
// Truncate a sentence to its first full stop (or N chars). Returns
// { head, tail } so callers can hide the tail behind a disclosure.
function splitReasoning(text: string | null | undefined): { head: string; tail: string } {
  if (!text) return { head: "", tail: "" };
  const trimmed = text.trim();
  const firstStop = trimmed.search(/[.!?](\s|$)/);
  if (firstStop > 0 && firstStop < trimmed.length - 1) {
    return {
      head: trimmed.slice(0, firstStop + 1),
      tail: trimmed.slice(firstStop + 1).trim(),
    };
  }
  // No early sentence break: hide nothing.
  return { head: trimmed, tail: "" };
}

/* ──────────────────────────────────────────────────────────────────── */
/* Section — Goal Lab plan banner (Sprint 23)                                 */
/*                                                                            */
/* Surfaces the Goal-Lab orchestrator's recommended pick WHEN one has been    */
/* computed this session. Does NOT auto-run the orchestrator (that costs ~N   */
/* engine runs). When no plan has been computed, points the user at          */
/* /decision-lab where the Run-plan button lives. Cohabits with the existing  */
/* RecommendedNextMoveSection without contradiction: Goal Lab is the          */
/* explicit profile-driven recommendation; computeUnifiedBestMove is the     */
/* passive ambient recommendation that runs without orchestration.            */
/* ──────────────────────────────────────────────────────────────────── */
/* ──────────────────────────────────────────────────────────────────── */
/* Sprint 26 P4: Dual-card landing surface.                              */
/*                                                                       */
/* The MOVE landing now shows TWO clearly-distinct routes into the engines:*/
/*   • Goal Lab        → "Tell me what to do" (one recommended path)     */
/*   • Decision Engine → "Compare multiple strategies" (ranked alternates)*/
/*                                                                       */
/* The Goal Lab side reuses the existing in-memory plan cache (passive    */
/* read) so we don't trigger an orchestration on render. The Decision     */
/* Engine side links to /decision-lab where the Run-plan button lives.    */
/* ──────────────────────────────────────────────────────────────────── */
function GoalLabBannerSection() {
  const { auditMode } = useAuditMode();
  // Read straight from the in-memory cache. No hook subscription needed:
  // the cache is set once per orchestration run, and we want this to be a
  // passive read (no React re-renders driven by store deltas here).
  const plan         = readLatestGoalLabPlan();
  const generatedAt  = readLatestGoalLabPlanGeneratedAt();
  const recommended  = plan?.picks.recommended ?? null;
  const rankedCount  = plan?.rankedScenarios?.length ?? 0;

  return (
    <section
      data-testid="ac-move-landing-cards"
      className="grid grid-cols-1 md:grid-cols-2 gap-3"
    >
      {/* ── Goal Lab card — "Tell me what to do" ─────────────────────── */}
      <div
        data-testid="ac-goal-lab-banner"
        className="rounded-lg border bg-card p-3 sm:p-4 space-y-2 flex flex-col"
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Goal Lab</p>
          <p className="text-sm sm:text-base font-semibold leading-snug mt-0.5" data-testid="ac-goal-lab-card-tagline">
            Tell me what to do
          </p>

          {!plan && (
            <p
              data-testid="ac-goal-lab-banner-empty"
              className="text-xs text-muted-foreground mt-2"
            >
              Run a plan in <Link href="/decision-lab"><span className="underline text-foreground">Decision Engine</span></Link>{" "}
              to see your profile-driven recommended path here.
            </p>
          )}

          {plan && !recommended && (
            <p
              data-testid="ac-goal-lab-banner-infeasible"
              className="text-xs sm:text-sm text-amber-700 dark:text-amber-300 mt-2"
            >
              Goal Lab evaluated {plan.templatesEvaluatedIds.length} scenarios but found no path that
              survived safety ceilings. Revisit risk or FIRE targets in{" "}
              <Link href="/goal-lab"><span className="underline text-foreground">Goal Lab</span></Link>.
            </p>
          )}

          {plan && recommended && (
            <>
              <p className="text-xs text-muted-foreground mt-2">Recommended path</p>
              <p className="text-sm font-medium leading-snug mt-0.5">
                {recommended.templateLabel}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{recommended.promise}</p>
              <p
                data-testid="ac-goal-lab-banner-prob"
                className="text-xs text-muted-foreground mt-0.5"
              >
                {recommended.probabilityP50 != null
                  ? <>Survivability {(recommended.probabilityP50 * 100).toFixed(0)}% · score {recommended.scoreP50?.toFixed(0)}</>
                  : <span data-testid="ac-goal-lab-banner-prob-null">Scenario confidence not yet available</span>}
              </p>
              {auditMode && (
                <p className="text-[10px] text-muted-foreground/80 mt-1">
                  engine: {plan.enginesUsed.candidateGenerator} · {plan.enginesUsed.monteCarlo}
                  {generatedAt ? ` · generated ${new Date(generatedAt).toLocaleString()}` : ""}
                </p>
              )}
            </>
          )}
        </div>
        <div className="pt-2">
          <Link href="/goal-lab">
            <Button size="sm" variant="default" data-testid="ac-goal-lab-card-cta">
              Open Goal Lab
            </Button>
          </Link>
        </div>
      </div>

      {/* ── Decision Engine card — "Compare multiple strategies" ─────── */}
      <div
        data-testid="ac-decision-engine-card"
        className="rounded-lg border bg-card p-3 sm:p-4 space-y-2 flex flex-col"
        style={{ borderColor: "hsl(var(--border))" }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Decision Engine</p>
          <p className="text-sm sm:text-base font-semibold leading-snug mt-0.5" data-testid="ac-decision-engine-card-tagline">
            Compare multiple strategies
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Side-by-side ranked alternatives — safest, fastest, highest probability, best
            cashflow, and best hybrid — each with survivability and scoring.
          </p>
          {plan && rankedCount > 0 && (
            <p
              className="text-xs text-muted-foreground mt-2"
              data-testid="ac-decision-engine-card-count"
            >
              {rankedCount} ranked scenario{rankedCount === 1 ? "" : "s"} ready from your last run.
            </p>
          )}
          {!plan && (
            <p className="text-xs text-muted-foreground mt-2">
              No plan computed yet — hit <span className="text-foreground font-medium">Run plan</span> inside Decision Engine.
            </p>
          )}
        </div>
        <div className="pt-2">
          <Link href="/decision-lab">
            <Button size="sm" variant="outline" data-testid="ac-decision-engine-card-cta">
              Open Decision Engine
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function RecommendedNextMoveSection({ unified }: { unified: UnifiedBestMoveResult | null }) {
  const { auditMode } = useAuditMode();
  const rec = unified?.unified?.bestMove ?? null;
  const [showMore, setShowMore] = useState(false);

  if (!rec) {
    return (
      <section data-testid="action-centre-next-move">
        <h2 className="text-base sm:text-lg font-semibold mb-2">Your next move</h2>
        <Card><div className="text-sm text-muted-foreground">No recommendation yet.</div></Card>
      </section>
    );
  }

  const plain = labelize(rec.title);
  const dollarImpact = rec.expectedFinancialImpact?.annualDollar ?? rec.netWorthImpact?.delta;
  const impactLabel =
    typeof dollarImpact === "number" && Number.isFinite(dollarImpact)
      ? `${formatCurrency(dollarImpact)} expected`
      : rec.benefitLabel ?? null;
  const whenLabel = (() => {
    switch (rec.urgency) {
      case "immediate": return "This week";
      case "this_quarter": return "This quarter";
      case "this_year": return "This year";
      case "monitor": return "Monitor";
      default: return null;
    }
  })();
  // Sprint 15 Phase 3 — band-only confidence chip. Rule-class lineage is now
  // surfaced as `MEDIUM (rule-based)` etc., not as a raw percent.
  const confInfo =
    typeof rec.confidenceScore === "number" && Number.isFinite(rec.confidenceScore)
      ? formatConfidence({ kind: "rule", value: rec.confidenceScore })
      : null;
  const { head: whyHead, tail: whyTail } = splitReasoning(rec.reasoning);

  // Single chip-row separators rendered between non-null chips.
  const chipPieces: React.ReactNode[] = [];
  if (whenLabel) chipPieces.push(<span key="when">{whenLabel}</span>);
  if (rec.riskLevel) chipPieces.push(<span key="risk" className="capitalize">{rec.riskLevel} risk</span>);
  if (confInfo) chipPieces.push(<span key="conf">{confInfo.label}</span>);
  if (impactLabel) chipPieces.push(<span key="impact" className="num-display">{impactLabel}</span>);

  return (
    <section data-testid="action-centre-next-move">
      <h2 className="text-base sm:text-lg font-semibold mb-2">Your next move</h2>
      <Card testId="ac-next-move-card">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
            style={{ background: "hsl(var(--gold-surface))", color: "hsl(var(--gold))", border: "1px solid hsl(var(--gold-dim) / 0.4)" }}>
            1
          </div>
          <div className="min-w-0 flex-1">
            {/* Plain-English verb line first; technical engine label is now a small subtitle. */}
            <p className="text-sm sm:text-base font-semibold leading-snug">{plain}</p>
            {rec.title && rec.title.trim() !== plain && (
              <p
                className="text-[11px] text-muted-foreground mt-0.5 leading-snug"
                data-testid="ac-next-move-subtitle"
              >
                {rec.title}
              </p>
            )}
            {auditMode && (
              <p className="text-[10px] text-muted-foreground/80 mt-0.5">engine: "{rec.title}"</p>
            )}

            {/* Single chip row replaces the 4-cell WHEN/IMPACT/RISK/CONF grid. */}
            {chipPieces.length > 0 && (
              <div
                className="mt-2 text-xs text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1"
                data-testid="ac-next-move-chips"
              >
                {chipPieces.map((piece, i) => (
                  <React.Fragment key={i}>
                    {piece}
                    {i < chipPieces.length - 1 && <span aria-hidden className="text-muted-foreground/50">·</span>}
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* Why: truncated to first sentence; rest hides behind a disclosure. */}
            {whyHead && (
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                <span className="font-semibold text-foreground">Why: </span>
                {whyHead}
                {whyTail && !showMore && " "}
                {whyTail && !showMore && (
                  <button
                    type="button"
                    onClick={() => setShowMore(true)}
                    className="underline text-muted-foreground hover:text-foreground"
                    data-testid="ac-next-move-more-detail"
                  >
                    More detail
                  </button>
                )}
                {whyTail && showMore && (
                  <>
                    {" "}{whyTail}{" "}
                    <button
                      type="button"
                      onClick={() => setShowMore(false)}
                      className="underline text-muted-foreground hover:text-foreground"
                      data-testid="ac-next-move-less-detail"
                    >
                      Show less
                    </button>
                  </>
                )}
              </p>
            )}

            {rec.cta && (
              <div className="mt-3">
                <Link href={rec.cta.route}>
                  <Button size="sm" data-testid="ac-next-move-cta">{rec.cta.label}</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Section D — Top Actions                                                    */
/* ────────────────────────────────────────────────────────────────────────── */
function TopActionsSection({ unified }: { unified: UnifiedBestMoveResult | null }) {
  const { auditMode } = useAuditMode();
  // Engine already ranks; skip bestMove (Section C) and take up to 3 from
  // topPriorities, falling back to `all` to fill out the list.
  const bestId = unified?.unified?.bestMove?.id;
  const pool = (unified?.unified?.topPriorities ?? []).filter(r => r.id !== bestId);
  const filler = (unified?.unified?.all ?? []).filter(r => r.id !== bestId && !pool.find(p => p.id === r.id));
  const items = [...pool, ...filler].slice(0, 3);

  if (items.length === 0) {
    return null;
  }

  return (
    <section data-testid="action-centre-top-actions">
      <h2 className="text-base sm:text-lg font-semibold mb-2">Then consider these</h2>
      <ol className="space-y-2">
        {items.map((rec, idx) => {
          const plain = labelize(rec.title);
          // Same field the recommended-action card uses for its impact label.
          const dollars = rec.expectedFinancialImpact?.annualDollar ?? rec.netWorthImpact?.delta;
          const impactLead =
            typeof dollars === "number" && Number.isFinite(dollars)
              ? `${formatCurrency(dollars)}/yr`
              : (rec.benefitLabel ?? null);
          // Sprint 15 Phase 3 — band-only label for top action confidence.
          const confInfo =
            typeof rec.confidenceScore === "number" && Number.isFinite(rec.confidenceScore)
              ? formatConfidence({ kind: "rule", value: rec.confidenceScore })
              : null;
          const riskLabel = rec.riskLevel
            ? `${rec.riskLevel.charAt(0).toUpperCase()}${rec.riskLevel.slice(1)} risk`
            : null;
          return (
            <li key={rec.id}>
              <Card testId={`ac-top-action-${idx}`} className="flex items-start gap-3">
                <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                  style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}>
                  {idx + 2}
                </div>
                <div className="min-w-0 flex-1">
                  {/* Plain-English sentence: lead with the dollar benefit, then action. */}
                  <p className="text-sm leading-snug" data-testid={`ac-top-action-${idx}-sentence`}>
                    {impactLead && (
                      <>
                        <span className="font-semibold num-display">{impactLead}</span>
                        <span className="text-muted-foreground"> — </span>
                      </>
                    )}
                    <span className="font-medium">{plain}.</span>
                  </p>
                  {(riskLabel || confInfo) && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5">
                      {riskLabel && <span>{riskLabel}</span>}
                      {riskLabel && confInfo && <span aria-hidden className="text-muted-foreground/50">·</span>}
                      {confInfo && <span>{confInfo.label}</span>}
                    </p>
                  )}
                  {auditMode && (
                    <p className="text-[10px] text-muted-foreground/80 mt-1">
                      engine: "{rec.title}"
                    </p>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Section E — Blockers                                                       */
/* The unified engine does not currently expose a structured "blockers"       */
/* field. Sprint 14.2-F: hide the entire section (heading + card) whenever    */
/* the only thing it would render is the no-blockers fallback string. If a    */
/* future engine extension surfaces real blockers, this function should be    */
/* extended to read them and re-enable the section automatically.             */
/* ────────────────────────────────────────────────────────────────────────── */
function BlockersSection({ unified }: { unified: UnifiedBestMoveResult | null }) {
  const blockers = (unified as any)?.unified?.blockers ?? null;
  const hasRealBlockers = Array.isArray(blockers) && blockers.length > 0;
  if (!hasRealBlockers) return null;
  return (
    <section data-testid="action-centre-blockers">
      <h2 className="text-base sm:text-lg font-semibold mb-2">Blockers</h2>
      <Card testId="ac-blockers-list">
        <ul className="text-sm space-y-1">
          {blockers.map((b: any, i: number) => (
            <li key={i} className="text-foreground">{typeof b === "string" ? b : (b?.label ?? JSON.stringify(b))}</li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Section F — Do-Nothing Outcome                                             */
/* ────────────────────────────────────────────────────────────────────────── */
function DoNothingSection(props: {
  unified: UnifiedBestMoveResult | null;
  ledger: DashboardInputs | null;
}) {
  const { unified, ledger } = props;
  const { auditMode } = useAuditMode();

  const head = ledger ? computeCanonicalHeadlineMetrics(ledger) : null;
  const rec = unified?.unified?.bestMove ?? null;
  const delta = rec?.netWorthImpact?.delta ?? rec?.expectedFinancialImpact?.annualDollar ?? null;
  const horizon = rec?.netWorthImpact?.horizonYears;

  const today = head?.netWorth ?? null;
  const ifAct = today !== null && typeof delta === "number" && Number.isFinite(delta)
    ? today + delta
    : null;

  // Sprint 14.2-E: when the impact data is empty (the predicate the section
  // previously used to render its "Run the forecast…" fallback line), hide
  // the entire section — heading and card — rather than showing an empty
  // placeholder that always wins the user's first scroll.
  if (today === null || ifAct === null) return null;

  const actingText = `${formatCurrency(ifAct)} ${horizon ? `over ${horizon} year${horizon === 1 ? "" : "s"}` : "with this action"}`;
  const doingNothingText = `${formatCurrency(today)} (status quo, today)`;

  return (
    <section data-testid="action-centre-do-nothing">
      <h2 className="text-base sm:text-lg font-semibold mb-2">If you act vs. do nothing</h2>
      <Card testId="ac-do-nothing-card">
        <ul className="space-y-1.5 text-sm">
          <li data-testid="ac-do-nothing-acting">
            <span className="font-semibold text-foreground">Acting today: </span>
            <span className="num-display" style={{ color: "hsl(var(--success))" }}>{actingText}</span>
          </li>
          <li data-testid="ac-do-nothing-status-quo">
            <span className="font-semibold text-foreground">Doing nothing: </span>
            <span className="num-display text-muted-foreground">{doingNothingText}</span>
          </li>
        </ul>
        {auditMode && (
          <p className="text-[10px] text-muted-foreground/80 mt-3">
            today: canonicalHeadlineMetrics.netWorth · delta: bestMove.netWorthImpact.delta ?? expectedFinancialImpact.annualDollar
          </p>
        )}
      </Card>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Lab Summary Cards (Sprint 14.1-C)                                          */
/* Lightweight links to Goal Closure Lab + Portfolio Lab. Numbers come from   */
/* existing canonical selectors only — no new engine. Rendered inside the     */
/* "View supporting analysis" disclosure so the Action Centre keeps to its    */
/* 2–3 mobile-scroll target.                                                  */
/* ────────────────────────────────────────────────────────────────────────── */
function LabSummaryCards({ ledger }: { ledger: DashboardInputs | null }) {
  const { auditMode } = useAuditMode();
  // Sprint 26 P3: Goal Closure card removed from the MOVE landing surface.
  // The /goal-closure-lab route + page remain alive in App.tsx — its FIRE-gap
  // / progress / target-year / years-remaining values now live as a "Current
  // Position" panel inside Goal Lab instead. Portfolio Lab is untouched.

  // Portfolio Lab: 4-bucket snapshot from existing selectors. We don't
  // recompute allocation here — only sum the canonical bucket values and let
  // the page render them as currency.
  const buckets = ledger
    ? [
        { label: "Property",   value: selectPropertyEquity(ledger) },
        { label: "Stocks",     value: selectStocksTotal(ledger) + selectCryptoTotal(ledger) },
        { label: "Cash",       value: selectCashToday(ledger) },
        { label: "Super",      value: selectSuperCombined(ledger) },
      ]
    : null;
  const bucketTotal = buckets ? buckets.reduce((a, b) => a + b.value, 0) : 0;

  return (
    <div className="space-y-2" data-testid="ac-lab-summary-cards">
      <Card testId="ac-lab-summary-portfolio">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Portfolio Lab</div>
            <div className="text-xs text-muted-foreground mt-1 mb-2">
              Where your wealth sits today.
            </div>
            {buckets && bucketTotal > 0 ? (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                {buckets.map(b => {
                  const pct = bucketTotal > 0 ? Math.round((Math.max(b.value, 0) / bucketTotal) * 100) : 0;
                  return (
                    <li key={b.label} className="flex items-baseline justify-between gap-2">
                      <span className="text-muted-foreground">{b.label}</span>
                      <span className="font-medium num-display">{pct}%</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="text-sm text-muted-foreground">Not available</div>
            )}
            {auditMode && (
              <SourceChip>
                selectPropertyEquity · selectStocksTotal+selectCryptoTotal · selectCashToday · selectSuperCombined
              </SourceChip>
            )}
          </div>
          <Link href="/portfolio-lab">
            <Button size="sm" variant="outline" data-testid="ac-lab-summary-portfolio-cta">
              Open Portfolio Lab
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Section G — Checklist                                                      */
/* Persists to mc_fire_settings.action_checklist (JSONB). localStorage is     */
/* used ONLY as an emergency fallback when the Supabase write fails or the    */
/* row is unreachable.                                                        */
/* ────────────────────────────────────────────────────────────────────────── */
const CHECKLIST_STORAGE_KEY = "fwl.action_centre.checklist.v1";
const CHECKLIST_DEBOUNCE_MS = 400;

type ChecklistEntry = { checked: boolean; checked_at: string | null };
type ChecklistMap = Record<string, ChecklistEntry>;

function normalizeChecklist(raw: unknown): ChecklistMap {
  if (!raw || typeof raw !== "object") return {};
  const out: ChecklistMap = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (val && typeof val === "object" && "checked" in (val as any)) {
      const v = val as any;
      out[key] = {
        checked: !!v.checked,
        checked_at: typeof v.checked_at === "string" ? v.checked_at : null,
      };
    } else if (typeof val === "boolean") {
      // Tolerate the old localStorage shape ({ [id]: boolean }) so we can
      // recover any in-flight ticks from before the migration.
      out[key] = { checked: val, checked_at: null };
    }
  }
  return out;
}

function ChecklistSection({ unified }: { unified: UnifiedBestMoveResult | null }) {
  // Derive 3–5 items from bestMove + top actions.
  const items = useMemo(() => {
    const bm = unified?.unified?.bestMove;
    const others = (unified?.unified?.topPriorities ?? []).filter(r => r.id !== bm?.id);
    const merged = [bm, ...others].filter(Boolean) as Recommendation[];
    return merged.slice(0, 5).map(r => ({
      id: r.id,
      label: labelize(r.title),
      sub: r.benefitLabel ?? (typeof r.expectedFinancialImpact?.annualDollar === "number"
        ? `${formatCurrency(r.expectedFinancialImpact!.annualDollar!)}/yr expected`
        : null),
    }));
  }, [unified]);

  // Canonical source: mc_fire_settings.action_checklist. The same Supabase
  // shim every other settings panel uses (sbMCFireSettings via
  // /api/mc-fire-settings — see client/src/lib/queryClient.ts:753).
  const { data: mcSettings, refetch: refetchSettings } = useQuery<any>({
    queryKey: ["/api/mc-fire-settings"],
    queryFn: () => apiRequest("GET", "/api/mc-fire-settings").then(r => r.json()),
  });

  const [checked, setChecked] = useState<ChecklistMap>({});
  const hydratedFromRemote = useRef(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from Supabase first; localStorage is only an emergency fallback
  // when the canonical row is unavailable.
  useEffect(() => {
    if (hydratedFromRemote.current) return;
    if (mcSettings && typeof mcSettings === "object") {
      const remote = (mcSettings as any).action_checklist;
      if (remote && typeof remote === "object" && Object.keys(remote).length > 0) {
        setChecked(normalizeChecklist(remote));
        hydratedFromRemote.current = true;
        return;
      }
      // Row exists but no checklist saved yet — try local fallback ONCE so we
      // don't lose pre-migration ticks. After this, remote is authoritative.
      hydratedFromRemote.current = true;
      if (typeof window === "undefined") return;
      try {
        const raw = window.localStorage.getItem(CHECKLIST_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const normalized = normalizeChecklist(parsed);
          if (Object.keys(normalized).length > 0) setChecked(normalized);
        }
      } catch { /* ignore */ }
    }
  }, [mcSettings]);

  // Persist on change. Debounced UPSERT through the canonical settings path;
  // localStorage is mirrored so a network failure does not lose user state.
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(checked));
      } catch { /* ignore — localStorage full / disabled */ }
    }
    if (!hydratedFromRemote.current) return; // don't write back during hydrate
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      apiRequest("PUT", "/api/mc-fire-settings", { action_checklist: checked })
        .then(() => { refetchSettings().catch(() => { /* ignore */ }); })
        .catch(() => {
          // Swallow: we already mirrored to localStorage, the user keeps state
          // locally until the next successful save. No new toast — matches the
          // page's existing silent-fallback pattern for canonical settings.
        });
    }, CHECKLIST_DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [checked, refetchSettings]);

  if (items.length === 0) return null;

  const toggle = (id: string) => setChecked(prev => {
    const next = { ...prev };
    const wasChecked = !!next[id]?.checked;
    next[id] = wasChecked
      ? { checked: false, checked_at: null }
      : { checked: true, checked_at: new Date().toISOString() };
    return next;
  });

  return (
    <section data-testid="action-centre-checklist">
      <h2 className="text-base sm:text-lg font-semibold mb-2">Your action checklist</h2>
      <Card testId="ac-checklist-card">
        <p className="text-xs text-muted-foreground mb-2">Tick what you've done. Saved to this browser.</p>
        <ul className="space-y-1.5">
          {items.map(item => {
            const isChecked = !!checked[item.id]?.checked;
            return (
              <li
                key={item.id}
                className="flex items-start gap-3 py-1.5"
                data-testid={`ac-checklist-item-${item.id}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(item.id)}
                  aria-label={item.label}
                  className="w-4 h-4 mt-0.5 shrink-0 accent-amber-500"
                  data-testid={`ac-checklist-checkbox-${item.id}`}
                />
                <div className="min-w-0 flex-1">
                  <div className={`text-sm ${isChecked ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {item.label}
                  </div>
                  {item.sub && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">{item.sub}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Page shell                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */
export default function ActionPlanPage() {
  /* Canonical ledger queries — same pattern as goal-closure-lab. */
  const { data: snapshot } = useQuery<any>({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot").then(r => r.json()),
  });
  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ["/api/properties"],
    queryFn: () => apiRequest("GET", "/api/properties").then(r => r.json()),
  });
  const { data: stocks = [] } = useQuery<any[]>({
    queryKey: ["/api/stocks"],
    queryFn: () => apiRequest("GET", "/api/stocks").then(r => r.json()),
  });
  const { data: cryptos = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto"],
    queryFn: () => apiRequest("GET", "/api/crypto").then(r => r.json()),
  });
  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ["/api/expenses"],
    queryFn: () => apiRequest("GET", "/api/expenses").then(r => r.json()),
  });
  const { data: incomeRecords = [] } = useQuery<any[]>({
    queryKey: ["/api/income"],
    queryFn: () => apiRequest("GET", "/api/income").then(r => r.json()),
  });
  const { data: holdingsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/holdings"],
    queryFn: () => apiRequest("GET", "/api/holdings").then(r => r.json()),
  });

  const canonicalLedger: DashboardInputs | null = useMemo(() => {
    if (!snapshot) return null;
    return { snapshot, properties, stocks, cryptos, holdingsRaw, incomeRecords, expenses };
  }, [snapshot, properties, stocks, cryptos, holdingsRaw, incomeRecords, expenses]);

  /* Sprint 15 Phase 3 — flipped to RecommendationFacade via
     useCanonicalRecommendation. The facade wraps the same orchestrator under
     a unified contract, so this page reads from the same React Query cache
     as Decision Lab, /decision, Goal Closure Lab, and the dashboard widgets.
     The downstream components still consume the legacy `UnifiedBestMoveResult`
     shape, so we synthesise it from the canonical result. */
  const { data: canonical } = useCanonicalRecommendation();
  const unified: UnifiedBestMoveResult | null = useMemo(() => {
    if (!canonical) return null;
    return {
      /* `legacy` and `unified` are downstream-facing facets. The page only
         reads from `unified.{bestMove, topPriorities, all, blockers}`, so we
         project the canonical shape into that slot. */
      legacy: undefined as unknown as UnifiedBestMoveResult["legacy"],
      unified: {
        bestMove: canonical.bestMove,
        topPriorities: canonical.top3,
        all: canonical.all,
        riskBeingReduced: canonical.riskBeingReduced,
        generatedAt: canonical.generatedAt,
      } as unknown as UnifiedBestMoveResult["unified"],
      changes: [] as unknown as UnifiedBestMoveResult["changes"],
    };
  }, [canonical]);

  /* Goal-derived target NW (so Section A and B agree). */
  const { data: goal } = useCanonicalGoal();
  const goalTargetNW = goal && goal.status === "SET" ? goal.targetNetWorth : null;

  /* Supporting-analysis disclosure. */
  const [showSupport, setShowSupport] = useState(false);
  const { auditMode } = useAuditMode();

  return (
    <div
      className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 max-w-3xl space-y-5 sm:space-y-6"
      data-testid="action-plan-page"
    >
      <header>
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground" data-testid="action-plan-title">
          Action Centre
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          What to do next, in plain English. Powered by the engines you already trust.
        </p>
      </header>

      <CurrentPositionSection ledger={canonicalLedger} goalTargetNetWorth={goalTargetNW} unified={unified} />
      <FireGoalSection />
      <GoalLabBannerSection />
      <RecommendedNextMoveSection unified={unified} />
      <TopActionsSection unified={unified} />
      <BlockersSection unified={unified} />
      <DoNothingSection unified={unified} ledger={canonicalLedger} />
      <ChecklistSection unified={unified} />

      <div>
        <button
          type="button"
          onClick={() => setShowSupport(s => !s)}
          className="text-xs underline text-muted-foreground hover:text-foreground"
          data-testid="ac-supporting-toggle"
        >
          {showSupport ? "Hide supporting analysis" : "View supporting analysis"}
        </button>
        {showSupport && (
          <div className="mt-3 text-xs text-muted-foreground space-y-3" data-testid="ac-supporting-content">
            <LabSummaryCards ledger={canonicalLedger} />
            <p>
              All numbers above come from the same trusted sources the rest of
              the app uses. Net worth and progress come from the household ledger,
              your FIRE goal comes from your saved settings, and the next move
              and top actions come from the same recommendation engine the
              dashboard uses.
            </p>
            {auditMode ? (
              <p>
                Engine lineage: <code>canonicalHeadlineMetrics</code> +{" "}
                <code>canonicalFire</code> for headline figures;{" "}
                <code>mc_fire_settings</code> via <code>/api/canonical-goal</code>{" "}
                for the FIRE goal; <code>computeUnifiedBestMove</code> for the
                next-move and top-actions list.
              </p>
            ) : (
              <p>
                Want formulas, source lineage, and engine trace details? Turn on{" "}
                <strong>Audit Mode</strong> in the header.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

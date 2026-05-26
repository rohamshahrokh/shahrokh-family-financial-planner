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
import { computeCanonicalFire } from "@/lib/canonicalFire";
import { useCanonicalGoal } from "@/lib/useCanonicalGoal";
import { computeUnifiedBestMove, readLatestQuickDecisionGeneratedAt, type UnifiedBestMoveResult } from "@/lib/recommendationEngine/bestMoveBridge";
import type { Recommendation } from "@/lib/recommendationEngine/types";
import { evaluateFreshness } from "@shared/forecastFreshness";
import { formatCurrency } from "@/lib/finance";
import { useAuditMode } from "@/lib/auditMode/AuditModeContext";
import { Button } from "@/components/ui/button";

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

function ConfidenceChip({ value }: { value: number | null | undefined }) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }
  const pct = Math.round(value * 100);
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {pct}% confidence
    </span>
  );
}

function RiskChip({ level }: { level?: string | null }) {
  if (!level) return null;
  const cssVar =
    level === "high" ? "--danger" :
    level === "medium" ? "--gold" :
    "--success";
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded shrink-0"
      style={{
        background: `hsl(var(${cssVar}) / 0.12)`,
        color: `hsl(var(${cssVar}))`,
        border: `1px solid hsl(var(${cssVar}) / 0.3)`,
      }}
    >
      {level} risk
    </span>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Section A — Current Position                                               */
/* ────────────────────────────────────────────────────────────────────────── */
function CurrentPositionSection(props: {
  ledger: DashboardInputs | null;
  goalTargetNetWorth: number | null;
}) {
  const { ledger, goalTargetNetWorth } = props;
  const { auditMode } = useAuditMode();

  const head = ledger ? computeCanonicalHeadlineMetrics(ledger) : null;
  const fire = ledger ? computeCanonicalFire(ledger) : null;

  const nw = head?.netWorth ?? null;
  // Prefer the goal-derived target NW when the user has set a goal;
  // otherwise fall back to the canonical FIRE number.
  const targetNW = goalTargetNetWorth ?? (fire?.fireNumber && fire.fireNumber > 0 ? fire.fireNumber : null);
  const fireProgressPct = nw !== null && targetNW && targetNW > 0
    ? Math.max(0, Math.min(100, (nw / targetNW) * 100))
    : null;

  const passiveCoveragePct = fire?.passiveCoverage != null
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

  const freshTone =
    fresh.status === "FRESH" ? "hsl(var(--success))" :
    fresh.status === "STALE" ? "hsl(var(--gold))" :
    "hsl(var(--danger))";

  return (
    <section data-testid="action-centre-current-position" className="space-y-2">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base sm:text-lg font-semibold">Where you are today</h2>
        {auditMode && <SourceChip>computeCanonicalHeadlineMetrics · computeCanonicalFire</SourceChip>}
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <Card testId="ac-tile-nw">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Net worth today</div>
          <div className="text-base sm:text-lg font-bold num-display mt-1">
            {nw !== null ? formatCurrency(nw) : "—"}
          </div>
          {auditMode && <SourceChip>canonicalHeadlineMetrics.netWorth</SourceChip>}
        </Card>

        <Card testId="ac-tile-fire-progress">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Progress to FIRE</div>
          <div className="text-base sm:text-lg font-bold num-display mt-1">
            {fireProgressPct !== null ? `${fireProgressPct.toFixed(1)}%` : "—"}
          </div>
          {auditMode && <SourceChip>NW ÷ required NW × 100</SourceChip>}
        </Card>

        <Card testId="ac-tile-passive-coverage">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Passive covers</div>
          <div className="text-base sm:text-lg font-bold num-display mt-1">
            {passiveCoveragePct !== null ? `${passiveCoveragePct}% of expenses` : "—"}
          </div>
          {auditMode && <SourceChip>canonicalFire.passiveCoverage</SourceChip>}
        </Card>

        <Card testId="ac-tile-forecast">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Forecast</div>
          <div className="text-base sm:text-lg font-bold num-display mt-1" style={{ color: freshTone }}>
            {fresh.status === "FRESH" ? "Up to date" : fresh.status === "STALE" ? "Out of date" : "Not run"}
          </div>
          {auditMode && <SourceChip>{fresh.reason}</SourceChip>}
        </Card>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Section B — FIRE Goal                                                      */
/* ────────────────────────────────────────────────────────────────────────── */
function FireGoalSection() {
  const { auditMode } = useAuditMode();
  const { data: goal, isLoading } = useCanonicalGoal();

  if (isLoading) {
    return (
      <section data-testid="action-centre-fire-goal">
        <Card><div className="text-sm text-muted-foreground">Loading FIRE goal…</div></Card>
      </section>
    );
  }

  if (!goal || goal.status === "NOT_SET") {
    return (
      <section data-testid="action-centre-fire-goal">
        <Card testId="ac-goal-not-set" className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex-1">
            <div className="text-sm font-semibold">Goal not set</div>
            <div className="text-xs text-muted-foreground mt-1">
              Tell us when you want to retire and how much income you want, and we'll plan from there.
            </div>
          </div>
          <Link href="/financial-plan#fire-goal">
            <Button data-testid="ac-goal-cta">Set your FIRE goal in Family Plan</Button>
          </Link>
        </Card>
      </section>
    );
  }

  // goal.status === "SET"
  return (
    <section data-testid="action-centre-fire-goal">
      <Card testId="ac-goal-set">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base sm:text-lg font-semibold">Your FIRE goal</h2>
          {auditMode && <SourceChip>From Family Plan / FIRE settings</SourceChip>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mt-2">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Retire by age</div>
            <div className="text-base sm:text-lg font-bold num-display">{goal.targetFireAge}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Passive income / mo</div>
            <div className="text-base sm:text-lg font-bold num-display">{formatCurrency(goal.targetPassiveMonthly)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Net worth needed</div>
            <div className="text-base sm:text-lg font-bold num-display">{formatCurrency(goal.targetNetWorth)}</div>
            {auditMode && (
              <SourceChip>= passive × 12 ÷ ({goal.swrPct}% SWR)</SourceChip>
            )}
          </div>
        </div>
        <div className="mt-3">
          <Link href="/financial-plan#fire-goal">
            <button className="text-xs underline text-muted-foreground hover:text-foreground" data-testid="ac-goal-edit">
              Edit in Family Plan →
            </button>
          </Link>
        </div>
      </Card>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Section C — Recommended Next Move                                          */
/* ────────────────────────────────────────────────────────────────────────── */
function RecommendedNextMoveSection({ unified }: { unified: UnifiedBestMoveResult | null }) {
  const { auditMode } = useAuditMode();
  const rec = unified?.unified?.bestMove ?? null;

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
  const whenLabel = (() => {
    switch (rec.urgency) {
      case "immediate": return "This week";
      case "this_quarter": return "This quarter";
      case "this_year": return "This year";
      case "monitor": return "Monitor";
      default: return "—";
    }
  })();

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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sm sm:text-base font-semibold">{plain}</p>
              {auditMode && <SourceChip>engine: "{rec.title}"</SourceChip>}
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-2 mt-3 text-xs">
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">When</dt>
                <dd className="font-medium">{whenLabel}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Expected impact</dt>
                <dd className="font-medium num-display">
                  {typeof dollarImpact === "number" && Number.isFinite(dollarImpact)
                    ? formatCurrency(dollarImpact)
                    : (rec.benefitLabel ?? "—")}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Risk</dt>
                <dd className="font-medium capitalize">{rec.riskLevel ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-muted-foreground">Confidence</dt>
                <dd className="font-medium"><ConfidenceChip value={rec.confidenceScore} /></dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
              <span className="font-semibold text-foreground">Why: </span>{rec.reasoning}
            </p>
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
          const dollars = rec.expectedFinancialImpact?.annualDollar ?? rec.netWorthImpact?.delta;
          return (
            <li key={rec.id}>
              <Card testId={`ac-top-action-${idx}`} className="flex items-start gap-3">
                <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                  style={{ background: "hsl(var(--muted))", color: "hsl(var(--foreground))" }}>
                  {idx + 2}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <p className="text-sm font-semibold">{plain}</p>
                    <span className="text-xs font-semibold num-display">
                      {typeof dollars === "number" && Number.isFinite(dollars)
                        ? formatCurrency(dollars)
                        : (rec.benefitLabel ?? "—")}
                    </span>
                    <RiskChip level={rec.riskLevel} />
                    <ConfidenceChip value={rec.confidenceScore} />
                  </div>
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
/* The unified engine does not expose a structured "blockers" field, so per   */
/* spec we surface the no-blocker fallback message.                           */
/* ────────────────────────────────────────────────────────────────────────── */
function BlockersSection() {
  return (
    <section data-testid="action-centre-blockers">
      <h2 className="text-base sm:text-lg font-semibold mb-2">Blockers</h2>
      <Card testId="ac-blockers-none">
        <div className="text-sm text-muted-foreground">
          No hard blockers detected based on current assumptions.
        </div>
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

  return (
    <section data-testid="action-centre-do-nothing">
      <h2 className="text-base sm:text-lg font-semibold mb-2">If you act vs. do nothing</h2>
      <Card testId="ac-do-nothing-card">
        {today === null || ifAct === null ? (
          <div className="text-sm text-muted-foreground">
            Run the forecast to see a side-by-side comparison.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-6">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Do nothing</div>
              <div className="text-base sm:text-xl font-bold num-display mt-1">{formatCurrency(today)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Status quo, today</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Recommended path</div>
              <div className="text-base sm:text-xl font-bold num-display mt-1" style={{ color: "hsl(var(--success))" }}>
                {formatCurrency(ifAct)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {horizon ? `over ${horizon} year${horizon === 1 ? "" : "s"}` : "with this action"}
              </div>
            </div>
          </div>
        )}
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
  const head = ledger ? computeCanonicalHeadlineMetrics(ledger) : null;
  const fire = ledger ? computeCanonicalFire(ledger) : null;

  // Goal Closure: gap-to-goal headline from the canonical FIRE selector.
  const gap = fire?.gap ?? null;

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
      <Card testId="ac-lab-summary-goal-closure">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Goal Closure Lab</div>
            <div className="text-base sm:text-lg font-bold num-display mt-1">
              {gap !== null
                ? gap > 0
                  ? `${formatCurrency(gap)} to go`
                  : "On target"
                : "Not available"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              How far you are from your FIRE number, and what closes the gap.
            </div>
            {auditMode && <SourceChip>canonicalFire.gap = fireNumber − netWorth</SourceChip>}
          </div>
          <Link href="/goal-closure-lab">
            <Button size="sm" variant="outline" data-testid="ac-lab-summary-goal-closure-cta">
              Open Goal Closure Lab
            </Button>
          </Link>
        </div>
      </Card>

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

  /* Unified engine — same orchestrator as Dashboard's BestMoveCard. */
  const [unified, setUnified] = useState<UnifiedBestMoveResult | null>(null);
  const refreshKey = snapshot?.id ?? "no-snapshot";
  useEffect(() => {
    let cancelled = false;
    computeUnifiedBestMove().then(r => { if (!cancelled) setUnified(r); }).catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [refreshKey]);

  /* Goal-derived target NW (so Section A and B agree). */
  const { data: goal } = useCanonicalGoal();
  const goalTargetNW = goal && goal.status === "SET" ? goal.targetNetWorth : null;

  /* Supporting-analysis disclosure. */
  const [showSupport, setShowSupport] = useState(false);

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

      <CurrentPositionSection ledger={canonicalLedger} goalTargetNetWorth={goalTargetNW} />
      <FireGoalSection />
      <RecommendedNextMoveSection unified={unified} />
      <TopActionsSection unified={unified} />
      <BlockersSection />
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
              All numbers above come from existing canonical selectors. Net worth and
              progress come from <code>canonicalHeadlineMetrics</code> and{" "}
              <code>canonicalFire</code>. Goal fields come from{" "}
              <code>mc_fire_settings</code> via <code>/api/canonical-goal</code>.
              The next move and top actions come from <code>computeUnifiedBestMove</code>{" "}
              — the same orchestrator the dashboard uses.
            </p>
            <p>
              Want formulas, source lineage, and engine trace details? Turn on{" "}
              <strong>Audit Mode</strong> in the header.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

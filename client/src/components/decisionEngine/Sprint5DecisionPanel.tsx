/**
 * Sprint5DecisionPanel.tsx — Sprint 5 Phase 5: Decision UI Integration.
 *
 * Visible UI surface for the Sprint 5 Goal Solver / Candidate / Ranking /
 * Best Move / CFO Advisor engines. This component is presentation-only:
 *
 *   - It does NOT recompute any headline metrics (those come from the
 *     Sprint 4D canonical headline metrics service via DashboardInputs).
 *   - It does NOT introduce financial formulas. Every number it shows is
 *     pass-through from one of the existing Sprint 5 engines.
 *   - It does NOT fabricate household values. When the engines mark their
 *     outputs incomplete the panel renders an explicit graceful state.
 *
 * Six sub-sections, mapped 1:1 to the Phase 5 brief:
 *
 *   1. Goal Solver Results Panel          → solveGoalGap()
 *   2. Best Move Card                     → computeBestMoveSprint5()
 *   3. Top 3 Ranked Options               → rankDecisionCandidates()
 *   4. Scenario Comparison Section        → candidate projection deltas
 *   5. CFO Advisor Insights Panel         → generateCFOInsights()
 *   6. Watch Items / Bottlenecks / Risks  → CFO advisor categories
 */

import * as React from "react";
import { useMemo } from "react";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import {
  solveGoalGap,
  type GoalSolverInputs,
  type GoalSolverOutputs,
} from "@/lib/goalSolver";
import {
  generateDecisionCandidates,
  type CandidateGeneratorOutputs,
} from "@/lib/decisionCandidates";
import {
  rankDecisionCandidates,
  type RankingOutput,
  type ScoreComponent,
} from "@/lib/decisionRanking";
import {
  computeBestMoveSprint5,
  type BestMoveResult,
} from "@/lib/bestMoveEngineSprint5";
import {
  generateCFOInsights,
  type CFOAdvisorResult,
  type CFOInsight,
} from "@/lib/cfoAdvisor";
import type { RiskRadarResult } from "@/lib/riskEngine";
import type { MonteCarloResult } from "@/lib/forecastStore";
import { formatConfidence } from "@/lib/confidenceLabels";
import { AdvisorRecommendationCard } from "@/components/advisor/AdvisorRecommendationCard";
import { RetirementTransitionPanel } from "@/components/retirementTransition/RetirementTransitionPanel";
import type { AdvisorRecommendation } from "@/lib/advisorNarrativeEngine";
import type { TransitionNarrative } from "@/lib/retirementTransition/types";

/* ─── Props ─────────────────────────────────────────────────────────────── */

export interface Sprint5DecisionPanelProps {
  /** Canonical ledger from the page. REQUIRED — used by every engine. */
  canonicalLedger: DashboardInputs | null | undefined;
  /** Optional user-supplied goal targets (FIRE date, net worth, etc). */
  goalSolverInputs?: Omit<GoalSolverInputs, "canonicalLedger">;
  /** Optional Risk Radar output, threaded through to engines. */
  riskOutputs?: RiskRadarResult | null;
  /** Optional Monte Carlo output, threaded through to engines. */
  monteCarloOutputs?: MonteCarloResult | null;
  /** Optional className passthrough for the root container. */
  className?: string;
  /** Sprint 20 PR-B P1-2 — advisor recommendations from advisorNarrativeEngine. */
  advisorRecommendations?: AdvisorRecommendation[];
  /** Sprint 20 PR-B P1-1 — retirement transition narrative. */
  retirementTransition?: TransitionNarrative | null;
  /** Sprint 20 PR-B P1-1 — expand transition by default (STATE_C/D/E). */
  retirementTransitionDefaultOpen?: boolean;
}

/* ─── Engine bundle ─────────────────────────────────────────────────────── */

interface EngineBundle {
  goal: GoalSolverOutputs;
  candidates: CandidateGeneratorOutputs;
  ranking: RankingOutput;
  bestMove: BestMoveResult;
  cfo: CFOAdvisorResult;
}

function buildBundle(props: Sprint5DecisionPanelProps): EngineBundle | null {
  if (!props.canonicalLedger || !props.canonicalLedger.snapshot) return null;
  const ledger = props.canonicalLedger;
  const goal = solveGoalGap({
    canonicalLedger: ledger,
    riskOutputs: props.riskOutputs ?? null,
    monteCarloOutputs: props.monteCarloOutputs ?? null,
    ...(props.goalSolverInputs ?? {}),
  });
  const candidates = generateDecisionCandidates({
    canonicalLedger: ledger,
    goalSolverOutputs: goal,
    riskOutputs: props.riskOutputs ?? null,
    monteCarloOutputs: props.monteCarloOutputs ?? null,
  });
  const ranking = rankDecisionCandidates({ candidateOutputs: candidates });
  const bestMove = computeBestMoveSprint5({
    rankingOutputs: ranking,
    goalSolverOutputs: goal,
    riskOutputs: props.riskOutputs ?? null,
    monteCarloOutputs: props.monteCarloOutputs ?? null,
  });
  const cfo = generateCFOInsights({
    canonicalLedger: ledger,
    goalSolverOutputs: goal,
    candidateOutputs: candidates,
    rankingOutputs: ranking,
    bestMoveOutputs: bestMove,
    riskOutputs: props.riskOutputs ?? null,
    monteCarloOutputs: props.monteCarloOutputs ?? null,
  });
  return { goal, candidates, ranking, bestMove, cfo };
}

/* ─── Formatting helpers (presentation only, no household values) ───────── */

function fmt$(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  return `${sign}$${Math.round(abs)}`;
}

function fmtSigned$(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  return n > 0 ? `+${fmt$(n)}` : `−${fmt$(Math.abs(n))}`;
}

function fmtMonths(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(1)} mo`;
}

function fmtSignedMonths(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "0 mo";
  return n > 0 ? `+${n.toFixed(1)} mo` : `${n.toFixed(1)} mo`;
}

function fmtPct(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function feasibilityTone(f: GoalSolverOutputs["fireFeasibility"]): string {
  switch (f) {
    case "ON_TRACK":     return "text-emerald-500";
    case "STRETCH":      return "text-amber-500";
    case "UNREALISTIC":  return "text-orange-500";
    case "IMPOSSIBLE":   return "text-red-500";
    default:             return "text-foreground";
  }
}

function feasibilityLabel(f: GoalSolverOutputs["fireFeasibility"]): string {
  switch (f) {
    case "ON_TRACK":     return "On track";
    case "STRETCH":      return "Stretch";
    case "UNREALISTIC":  return "Unrealistic";
    case "IMPOSSIBLE":   return "Impossible";
    default:             return "—";
  }
}

function severityTone(s: CFOInsight["severity"]): string {
  switch (s) {
    case "critical": return "text-red-500";
    case "high":     return "text-orange-500";
    case "moderate": return "text-amber-500";
    case "low":      return "text-sky-500";
    default:         return "text-foreground/65";
  }
}

function dimensionLabel(d: ScoreComponent["dimension"]): string {
  switch (d) {
    case "netWorth":        return "Net worth";
    case "passiveIncome":   return "Passive income";
    case "monthlySurplus":  return "Monthly surplus";
    case "fireProgress":    return "FIRE progress";
    case "goalShortfall":   return "Goal shortfall";
    case "executionRisk":   return "Execution risk";
    case "liquidityRisk":   return "Liquidity risk";
    case "mcConfidence":    return "Confidence";
    default:                return String(d);
  }
}

/* ─── Sub-components ────────────────────────────────────────────────────── */

interface SubsectionProps {
  title: string;
  description?: string;
  testid: string;
  children: React.ReactNode;
}

function Subsection(props: SubsectionProps) {
  return (
    <section
      data-testid={props.testid}
      className="rounded-xl border border-border/60 bg-card/40 p-4 sm:p-5"
    >
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-foreground" data-testid={`${props.testid}-title`}>
          {props.title}
        </h3>
        {props.description ? (
          <p className="text-xs text-foreground/60 mt-0.5">{props.description}</p>
        ) : null}
      </header>
      <div className="space-y-2">{props.children}</div>
    </section>
  );
}

function MetricRow({
  label,
  value,
  tone,
  testid,
  hint,
}: {
  label: string;
  value: string;
  tone?: string;
  testid: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <div className="flex-1 min-w-0">
        <div className="text-xs text-foreground/65 truncate">{label}</div>
        {hint ? <div className="text-[10px] text-foreground/45 mt-0.5">{hint}</div> : null}
      </div>
      <div
        data-testid={testid}
        className={`text-sm font-semibold tabular-nums ${tone ?? "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

function IncompleteNotice({ message, testid }: { message: string; testid: string }) {
  return (
    <p
      data-testid={testid}
      className="text-xs text-foreground/60 italic border border-border/40 rounded-md px-3 py-2 bg-muted/30"
    >
      {message}
    </p>
  );
}

/* ─── 1. Goal Solver Results Panel ──────────────────────────────────────── */

function GoalSolverResultsPanel({ goal }: { goal: GoalSolverOutputs }) {
  const incomplete = goal.trace.incomplete;
  return (
    <Subsection
      testid="sprint5-goal-solver-panel"
      title="Goal solver results"
      description="How far from the binding household target, and what it takes to close the gap."
    >
      <MetricRow
        testid="sprint5-goal-required-asset-base"
        label="Required asset base"
        value={fmt$(goal.requiredAssetBase)}
      />
      <MetricRow
        testid="sprint5-goal-shortfall"
        label="Shortfall vs target"
        value={fmt$(goal.shortfallAmount)}
        tone={goal.shortfallAmount > 0 ? "text-orange-500" : "text-emerald-500"}
      />
      <MetricRow
        testid="sprint5-goal-passive-income-gap"
        label="Passive income gap (annual)"
        value={fmt$(goal.requiredPassiveIncomeGap)}
      />
      <MetricRow
        testid="sprint5-goal-required-monthly-contribution"
        label="Required monthly contribution"
        value={fmt$(goal.requiredMonthlyContribution)}
      />
      <MetricRow
        testid="sprint5-goal-feasibility"
        label="Feasibility"
        value={feasibilityLabel(goal.fireFeasibility)}
        tone={feasibilityTone(goal.fireFeasibility)}
        hint={goal.trace.reasoning}
      />
      <MetricRow
        testid="sprint5-goal-years-ahead-or-behind"
        label="Years ahead / behind target"
        value={
          goal.yearsAheadOrBehind == null
            ? "—"
            : goal.yearsAheadOrBehind === 0
              ? "On time"
              : goal.yearsAheadOrBehind > 0
                ? `${goal.yearsAheadOrBehind.toFixed(1)} yrs ahead`
                : `${Math.abs(goal.yearsAheadOrBehind).toFixed(1)} yrs behind`
        }
      />
      {incomplete ? (
        <IncompleteNotice
          testid="sprint5-goal-incomplete-notice"
          message="No explicit household target supplied — solver reports the gap against the canonical FIRE figure. Set a target FIRE date, net worth or passive income to refine the result."
        />
      ) : null}
    </Subsection>
  );
}

/* ─── 2. Best Move Card ─────────────────────────────────────────────────── */

function BestMoveSprint5Card({ bestMove }: { bestMove: BestMoveResult }) {
  const {
    bestNextAction,
    expectedImpact,
    riskImpact,
    liquidityImpact,
    confidenceScore,
    whyThisBeatsAlternatives,
  } = bestMove;
  return (
    <Subsection
      testid="sprint5-best-move-card"
      title="Best next move"
      description="The rank-1 action from the Sprint 5 ranking engine, with its full impact profile."
    >
      <div className="mb-3">
        <div
          data-testid="sprint5-best-move-label"
          className="text-base font-semibold text-foreground"
        >
          {bestNextAction.label}
        </div>
        <p
          data-testid="sprint5-best-move-rationale"
          className="text-xs text-foreground/65 mt-1"
        >
          {bestNextAction.rationale}
        </p>
      </div>

      <MetricRow
        testid="sprint5-best-move-expected-impact-nw"
        label="Δ net worth (12 mo)"
        value={fmtSigned$(expectedImpact.deltaNetWorth)}
      />
      <MetricRow
        testid="sprint5-best-move-expected-impact-passive"
        label="Δ passive income"
        value={fmtSigned$(expectedImpact.deltaPassiveIncome)}
        hint="$/year vs holding the current path"
      />
      <MetricRow
        testid="sprint5-best-move-expected-impact-surplus"
        label="Δ monthly cash surplus"
        value={fmtSigned$(expectedImpact.deltaMonthlySurplus)}
      />
      <MetricRow
        testid="sprint5-best-move-expected-impact-goal-shortfall"
        label="Δ goal shortfall"
        value={expectedImpact.deltaGoalShortfall == null ? "—" : fmtSigned$(expectedImpact.deltaGoalShortfall)}
      />

      <div className="h-px bg-border/40 my-2" />

      <MetricRow
        testid="sprint5-best-move-liquidity-baseline"
        label="Liquidity runway today"
        value={fmtMonths(liquidityImpact.baselineRunwayMonths)}
      />
      <MetricRow
        testid="sprint5-best-move-liquidity-delta"
        label="Δ liquidity runway"
        value={fmtSignedMonths(liquidityImpact.deltaRunwayMonths)}
        tone={liquidityImpact.deltaRunwayMonths < 0 ? "text-orange-500" : "text-emerald-500"}
      />
      <MetricRow
        testid="sprint5-best-move-liquidity-post"
        label="Liquidity runway after move"
        value={fmtMonths(liquidityImpact.postMoveRunwayMonths)}
      />

      <div className="h-px bg-border/40 my-2" />

      <MetricRow
        testid="sprint5-best-move-execution-risk"
        label="Execution risk"
        value={`${Math.round(riskImpact.executionRisk)} / 100`}
      />
      <MetricRow
        testid="sprint5-best-move-liquidity-risk"
        label="Liquidity risk"
        value={`${Math.round(riskImpact.liquidityRisk)} / 100`}
      />
      {/* Sprint 15 Phase 3 — Sprint5 confidence value is a heuristic blend
          (margin × coverage × MC partial), not a calibrated probability.
          Render band-only via formatConfidence(kind:"heuristic"). */}
      <MetricRow
        testid="sprint5-best-move-confidence"
        label="Confidence"
        value={formatConfidence({ kind: "heuristic", value: confidenceScore.value }).label}
        hint={whyThisBeatsAlternatives.confidenceSource}
      />

      <div className="h-px bg-border/40 my-2" />

      <div data-testid="sprint5-best-move-why-narrative" className="text-xs text-foreground/75">
        <span className="font-semibold text-foreground">Why this beats alternatives — </span>
        {whyThisBeatsAlternatives.narrative}
      </div>
    </Subsection>
  );
}

/* ─── 3. Top 3 Ranked Options ───────────────────────────────────────────── */

function Top3RankedOptions({ ranking }: { ranking: RankingOutput }) {
  const top3 = ranking.ranked.slice(0, 3);
  return (
    <Subsection
      testid="sprint5-top3-ranked-options"
      title="Top 3 ranked options"
      description="Side-by-side score breakdown for the three best moves from the candidate set."
    >
      {top3.length === 0 ? (
        <IncompleteNotice
          testid="sprint5-top3-empty-notice"
          message="No candidates available — the canonical ledger is missing or has no actionable surplus / liquidity to deploy."
        />
      ) : (
        <ol className="space-y-3">
          {top3.map((r) => (
            <li
              key={r.candidate.id}
              data-testid={`sprint5-top3-row-${r.rank}`}
              className="rounded-md border border-border/40 bg-background/40 px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-foreground/55">#{r.rank}</div>
                  <div
                    data-testid={`sprint5-top3-row-${r.rank}-label`}
                    className="text-sm font-semibold text-foreground"
                  >
                    {r.candidate.label}
                  </div>
                </div>
                <div
                  data-testid={`sprint5-top3-row-${r.rank}-score`}
                  className="text-sm font-semibold tabular-nums text-foreground"
                >
                  {r.score.toFixed(3)}
                </div>
              </div>
              <p className="text-[11px] text-foreground/60 mt-1">{r.reasoning}</p>
              <div
                data-testid={`sprint5-top3-row-${r.rank}-breakdown`}
                className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]"
              >
                {r.breakdown.map((b) => (
                  <div
                    key={`${r.candidate.id}-${b.dimension}`}
                    className="flex justify-between gap-2 tabular-nums"
                  >
                    <span className="text-foreground/55 truncate">{dimensionLabel(b.dimension)}</span>
                    <span className="text-foreground/80">{b.contribution.toFixed(3)}</span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ol>
      )}
      {ranking.incomplete ? (
        <IncompleteNotice
          testid="sprint5-top3-incomplete-notice"
          message="One or more candidates were flagged with incomplete inputs (e.g. surplus, target). Results remain ranked but should be interpreted as directional."
        />
      ) : null}
    </Subsection>
  );
}

/* ─── 4. Scenario Comparison Section ────────────────────────────────────── */

function ScenarioComparisonSection({ candidates }: { candidates: CandidateGeneratorOutputs }) {
  const rows = candidates.candidates;
  return (
    <Subsection
      testid="sprint5-scenario-comparison"
      title="Scenario comparison"
      description="All candidate moves with their net-worth, passive-income, cashflow and liquidity deltas vs the hold path."
    >
      {rows.length === 0 ? (
        <IncompleteNotice
          testid="sprint5-scenario-comparison-empty"
          message="Candidate generator returned no rows — the canonical ledger is unusable."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]" data-testid="sprint5-scenario-comparison-table">
            <thead>
              <tr className="text-foreground/55">
                <th className="text-left font-medium py-1.5 pr-2">Scenario</th>
                <th className="text-right font-medium py-1.5 px-1.5">Δ NW</th>
                <th className="text-right font-medium py-1.5 px-1.5">Δ passive</th>
                <th className="text-right font-medium py-1.5 px-1.5">Δ surplus</th>
                <th className="text-right font-medium py-1.5 px-1.5">Δ runway</th>
                <th className="text-right font-medium py-1.5 pl-1.5">Exec risk</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  data-testid={`sprint5-scenario-row-${c.kind}`}
                  className="border-t border-border/30 align-baseline"
                >
                  <td className="py-1.5 pr-2">
                    <div className="font-medium text-foreground">{c.label}</div>
                    {c.incomplete ? (
                      <div className="text-[10px] text-amber-500 italic">incomplete inputs</div>
                    ) : null}
                  </td>
                  <td className="text-right tabular-nums py-1.5 px-1.5 text-foreground/85">
                    {fmtSigned$(c.projection.deltaNetWorth)}
                  </td>
                  <td className="text-right tabular-nums py-1.5 px-1.5 text-foreground/85">
                    {fmtSigned$(c.projection.deltaPassiveIncome)}
                  </td>
                  <td className="text-right tabular-nums py-1.5 px-1.5 text-foreground/85">
                    {fmtSigned$(c.projection.deltaMonthlySurplus)}
                  </td>
                  <td className="text-right tabular-nums py-1.5 px-1.5 text-foreground/85">
                    {fmtSignedMonths(c.projection.deltaLiquidityMonths)}
                  </td>
                  <td className="text-right tabular-nums py-1.5 pl-1.5 text-foreground/85">
                    {Math.round(c.risk.executionRisk)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Subsection>
  );
}

/* ─── 5. CFO Advisor Insights Panel ─────────────────────────────────────── */

function InsightList({
  insights,
  testid,
  emptyMessage,
}: {
  insights: CFOInsight[];
  testid: string;
  emptyMessage: string;
}) {
  if (insights.length === 0) {
    return <IncompleteNotice testid={`${testid}-empty`} message={emptyMessage} />;
  }
  return (
    <ul className="space-y-2" data-testid={testid}>
      {insights.map((i) => (
        <li
          key={i.id}
          data-testid={`${testid}-item-${i.id}`}
          className="rounded-md border border-border/40 bg-background/40 px-3 py-2"
        >
          <div className="flex items-baseline gap-2">
            <span
              data-testid={`${testid}-item-${i.id}-severity`}
              className={`text-[10px] uppercase tracking-wide font-semibold ${severityTone(i.severity)}`}
            >
              {i.severity}
            </span>
            <span className="text-sm font-semibold text-foreground">{i.headline}</span>
          </div>
          <p className="text-xs text-foreground/65 mt-1">{i.body}</p>
        </li>
      ))}
    </ul>
  );
}

function CFOAdvisorInsightsPanel({ cfo }: { cfo: CFOAdvisorResult }) {
  return (
    <Subsection
      testid="sprint5-cfo-insights-panel"
      title="CFO advisor insights"
      description="Plain-English advisory commentary derived from every Sprint 5 engine output."
    >
      <div>
        <h4 className="text-xs font-semibold text-foreground/70 mb-1.5">Recommended next actions</h4>
        <InsightList
          insights={cfo.recommendedNextActions}
          testid="sprint5-cfo-recommendations"
          emptyMessage="No recommended next action — the engine considers the current path optimal or could not isolate a dominant move."
        />
      </div>
      <div className="mt-3">
        <h4 className="text-xs font-semibold text-foreground/70 mb-1.5">Opportunities</h4>
        <InsightList
          insights={cfo.opportunities}
          testid="sprint5-cfo-opportunities"
          emptyMessage="No opportunities flagged."
        />
      </div>
      <div className="mt-3">
        <h4 className="text-xs font-semibold text-foreground/70 mb-1.5">Contradictions</h4>
        <InsightList
          insights={cfo.contradictions}
          testid="sprint5-cfo-contradictions"
          emptyMessage="No engine contradictions detected."
        />
      </div>
    </Subsection>
  );
}

/* ─── 6. Watch Items / Bottlenecks / Risks ──────────────────────────────── */

function WatchItemsPanel({ cfo }: { cfo: CFOAdvisorResult }) {
  return (
    <Subsection
      testid="sprint5-watchitems-panel"
      title="Watch items, bottlenecks & risks"
      description="Things to monitor — derived from the CFO advisor's risk / bottleneck / watch-item categories."
    >
      <div>
        <h4 className="text-xs font-semibold text-foreground/70 mb-1.5">Risks</h4>
        <InsightList
          insights={cfo.risks}
          testid="sprint5-cfo-risks"
          emptyMessage="No fragility or downside risks flagged by the advisor."
        />
      </div>
      <div className="mt-3">
        <h4 className="text-xs font-semibold text-foreground/70 mb-1.5">Bottlenecks</h4>
        <InsightList
          insights={cfo.bottlenecks}
          testid="sprint5-cfo-bottlenecks"
          emptyMessage="No structural bottlenecks flagged."
        />
      </div>
      <div className="mt-3">
        <h4 className="text-xs font-semibold text-foreground/70 mb-1.5">Watch items</h4>
        <InsightList
          insights={cfo.watchItems}
          testid="sprint5-cfo-watchitems"
          emptyMessage="No watch items — all required engine inputs are available."
        />
      </div>
    </Subsection>
  );
}

/* ─── Root export ───────────────────────────────────────────────────────── */

export function Sprint5DecisionPanel(props: Sprint5DecisionPanelProps) {
  const bundle = useMemo(() => buildBundle(props), [
    props.canonicalLedger,
    props.goalSolverInputs,
    props.riskOutputs,
    props.monteCarloOutputs,
  ]);

  if (!bundle) {
    return (
      <div
        data-testid="sprint5-decision-panel-empty"
        className={`rounded-xl border border-border/40 bg-card/30 p-4 text-xs text-foreground/60 italic ${props.className ?? ""}`}
      >
        Canonical ledger not yet available — Sprint 5 decision engines need a household snapshot
        to produce results. Connect your data source or wait for the ledger to load.
      </div>
    );
  }

  const advisorRecs = props.advisorRecommendations ?? [];
  const retirement = props.retirementTransition ?? null;

  return (
    <div className={`flex flex-col gap-4 ${props.className ?? ""}`}>
      {(advisorRecs.length > 0 || retirement) && (
        <div className="flex flex-col gap-3" data-testid="sprint5-decision-advisor-block">
          {advisorRecs.length > 0 && (
            <div className="flex flex-col gap-2">
              {advisorRecs.map((rec, i) => (
                <AdvisorRecommendationCard
                  key={i}
                  rec={rec}
                  isTopOnSurface={i === 0}
                  surface="decision-lab"
                  index={i}
                />
              ))}
            </div>
          )}
          {retirement && (
            <RetirementTransitionPanel
              narrative={retirement}
              surface="decision-lab"
              defaultOpen={props.retirementTransitionDefaultOpen}
            />
          )}
        </div>
      )}
      <div
        data-testid="sprint5-decision-panel"
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        <GoalSolverResultsPanel goal={bundle.goal} />
        <BestMoveSprint5Card bestMove={bundle.bestMove} />
        <Top3RankedOptions ranking={bundle.ranking} />
        <ScenarioComparisonSection candidates={bundle.candidates} />
        <CFOAdvisorInsightsPanel cfo={bundle.cfo} />
        <WatchItemsPanel cfo={bundle.cfo} />
      </div>
    </div>
  );
}

export default Sprint5DecisionPanel;

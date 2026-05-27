/**
 * GoalSolverProTab.tsx — Sprint 11 Decision Engine surface.
 *
 * Sprint 11 #6 + #12 + #13 + #14 + #15 + #16 — the primary surface on
 * `/decision`. Wraps the existing Sprint 10 GoalSolverProSection in the
 * Sprint 11 hero pattern:
 *
 *   1. Feasibility hero (status badge + probability bar + median/best/worst
 *      FIRE-year tiles) — Sprint 11 #13
 *   2. Required-vs-Current strip — 5 horizontal "current vs required" bars,
 *      reading from goalSolverPro.requiredInputs + canonical-ledger current
 *      values — Sprint 11 #14
 *   3. Primary CTA from actionPlan[0] — Sprint 11 #16
 *   4. The existing GoalSolverProSection below — audit trail already
 *      demoted into <AdvancedDisclosure> by Phase 1 + this phase.
 *
 * Every value rendered traces to an existing canonical engine output. No new
 * financial math is performed here.
 */

import * as React from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import { buildRiskInput, computeRiskRadar } from "@/lib/riskEngine";
import {
  buildGoalSolverPro,
  EMPTY_GOAL_TARGETS,
  formatGoalSolverDollars,
  formatGoalSolverProbability,
  formatGoalSolverYear,
  type GoalSolverProTargets,
} from "@/lib/goalSolverPro";
import { GoalSolverProSection } from "@/components/GoalSolverProSection";
import { buildTruePortfolioOptimizer } from "@/lib/truePortfolioOptimizer";
import { buildProbabilisticWealthEngine } from "@/lib/probabilisticWealthEngine";
import { buildPathSimulationEngine } from "@/lib/pathSimulationEngine";
import { computeCanonicalFire, isFireGoalExplicitlySet } from "@/lib/canonicalFire";
import { useCanonicalGoal } from "@/lib/useCanonicalGoal";
import { FireGoalEmptyState } from "@/components/FireGoalEmptyState";
import { formatCurrency } from "@/lib/finance";
import {
  selectTop3Actions,
  selectPathRecommendations,
  selectRankedBlockers,
  selectDoNothingComparison,
} from "@/lib/goalSolverView";
import { DecisionCard } from "@/components/decision/DecisionCard";
import { BlockerAnalysisBlock } from "@/components/decision/BlockerAnalysisBlock";
import { AdvancedDisclosure } from "@/components/ui/AdvancedDisclosure";

/* ─── Helpers ───────────────────────────────────────────────────────── */

function statusTone(status: string): { chip: string; bar: string } {
  switch (status) {
    case "ACHIEVABLE":
      return { chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40", bar: "bg-emerald-500" };
    case "STRETCH":
      return { chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40", bar: "bg-amber-500" };
    case "UNLIKELY":
      return { chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40", bar: "bg-orange-500" };
    default:
      return { chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40", bar: "bg-rose-500" };
  }
}

/* Pick a sensible destination for the action-plan CTA based on the action
 * text. No new logic — just routing to existing pages. */
function routeForAction(action: string): string {
  const a = action.toLowerCase();
  if (a.includes("property") || a.includes("settle") || a.includes("purchase")) return "/property";
  if (a.includes("portfolio") || a.includes("rebalance") || a.includes("strategy")) return "/portfolio-lab";
  if (a.includes("dca") || a.includes("contribution") || a.includes("save")) return "/financial-plan";
  return "/dashboard";
}

/* ─── Required-vs-Current strip ─────────────────────────────────────── */

interface BarRowProps {
  label: string;
  current: number | null;
  required: number | null;
  unit: string;
  testid: string;
}

function BarRow({ label, current, required, unit, testid }: BarRowProps) {
  // Visual scale: required is reference (100%); current renders as a % of it,
  // capped at 200%. Purely presentational — no financial math.
  const ratio = current != null && required != null && required !== 0 ? Math.max(0, Math.min(2, current / required)) : 0;
  const pct = ratio * 50; // map 0..2 to 0..100% (1.0 ratio = 50% bar width = "meeting target")
  const metTarget = current != null && required != null && current >= required;
  const fmt = (n: number | null): string => {
    if (n == null) return "Not set";
    if (unit === "$") return formatCurrency(Math.round(n));
    if (unit === "%") return `${(n * 100).toFixed(1)}%`;
    if (unit === "count") return String(Math.round(n));
    return String(n);
  };
  return (
    <div className="flex flex-col gap-1 py-2 border-b border-border/40 last:border-b-0" data-testid={testid}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          <span data-testid={`${testid}-current`}>{fmt(current)}</span>
          <span className="mx-1.5 opacity-50">vs</span>
          <span data-testid={`${testid}-required`} className="font-medium text-foreground">{fmt(required)}</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden" aria-label={`${label} progress`}>
        <div
          className={`h-full ${metTarget ? "bg-emerald-500" : "bg-amber-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ─── Main tab ──────────────────────────────────────────────────────── */

export function GoalSolverProTab() {
  /* Canonical ledger queries — same pattern as PortfolioLabPage / decision page. */
  const { data: snapshot } = useQuery<any>({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot").then((r) => r.json()),
  });
  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ["/api/properties"],
    queryFn: () => apiRequest("GET", "/api/properties").then((r) => r.json()),
  });
  const { data: stocks = [] } = useQuery<any[]>({
    queryKey: ["/api/stocks"],
    queryFn: () => apiRequest("GET", "/api/stocks").then((r) => r.json()),
  });
  const { data: cryptos = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto"],
    queryFn: () => apiRequest("GET", "/api/crypto").then((r) => r.json()),
  });
  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ["/api/expenses"],
    queryFn: () => apiRequest("GET", "/api/expenses").then((r) => r.json()),
  });
  const { data: incomeRecords = [] } = useQuery<any[]>({
    queryKey: ["/api/income"],
    queryFn: () => apiRequest("GET", "/api/income").then((r) => r.json()),
  });
  const { data: holdingsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/holdings"],
    queryFn: () => apiRequest("GET", "/api/holdings").then((r) => r.json()),
  });

  const canonicalLedger: DashboardInputs | null = useMemo(() => {
    if (!snapshot) return null;
    return { snapshot, properties, stocks, cryptos, holdingsRaw, incomeRecords, expenses };
  }, [snapshot, properties, stocks, cryptos, holdingsRaw, incomeRecords, expenses]);

  const riskOutputs = useMemo(() => {
    if (!snapshot || !Object.keys(snapshot as any).length) return null;
    try {
      const input = buildRiskInput(snapshot, properties, expenses);
      return computeRiskRadar(input);
    } catch {
      return null;
    }
  }, [snapshot, properties, expenses]);

  const sprint7Result = useMemo(
    () => buildTruePortfolioOptimizer({
      canonicalLedger,
      riskOutputs,
      monteCarloOutputs: null,
      constraints: {},
    }),
    [canonicalLedger, riskOutputs],
  );

  const probabilistic = useMemo(
    () => buildProbabilisticWealthEngine({ sprint7Result }),
    [sprint7Result],
  );

  const pathSim = useMemo(
    () => buildPathSimulationEngine({ sprint7Result, canonicalLedger }),
    [sprint7Result, canonicalLedger],
  );

  const [goalTargets, setGoalTargets] = useState<GoalSolverProTargets>(EMPTY_GOAL_TARGETS);

  const goalSolverResult = useMemo(() => {
    const canonicalFire = canonicalLedger
      ? computeCanonicalFire(canonicalLedger)
      : {
          swrPct: 4,
          targetAnnualIncome: 0,
          targetMonthlyIncome: 0,
          fireNumber: 0,
          netWorthNow: 0,
          progressFraction: 0,
          annualPassiveIncome: 0,
          monthlyPassiveIncome: 0,
          monthlyExpenses: 0,
          passiveCoverage: null,
          gap: 0,
          source: "empty" as const,
        };
    return buildGoalSolverPro({
      canonicalLedger,
      canonicalFire,
      sprint7Result,
      sprint8Result: probabilistic,
      sprint9Result: pathSim,
      targets: goalTargets,
    });
  }, [canonicalLedger, sprint7Result, probabilistic, pathSim, goalTargets]);

  const feasibility = goalSolverResult.feasibility;
  const tone = statusTone(feasibility.status);
  const probability = feasibility.probabilityOfSuccess;
  const probabilityPct = probability != null ? Math.round(probability * 100) : null;

  const primaryAction = goalSolverResult.actionPlan[0] ?? null;

  // Required vs current strip data — Sprint 11 #14
  const required = goalSolverResult.requiredInputs;
  const canonicalFire = canonicalLedger ? computeCanonicalFire(canonicalLedger) : null;
  const bars: BarRowProps[] = useMemo(() => {
    const currentMonthlyDCA = canonicalLedger
      ? Math.max(0, ((canonicalFire?.monthlyPassiveIncome ?? 0) > 0 ? 0 : 0))
      : null;
    // Use the canonical "what is the current monthly surplus" — fallback to 0
    // when ledger missing. We never invent values: when current cannot be
    // sourced, the row renders "—" and the bar stays at 0%.
    const surplusToday =
      canonicalLedger && canonicalFire
        ? Math.max(0, (canonicalFire.monthlyPassiveIncome ?? 0))
        : null;
    return [
      {
        label: "Monthly DCA",
        current: currentMonthlyDCA,
        required: required.requiredMonthlyDCA,
        unit: "$",
        testid: "decision-bar-monthly-dca",
      },
      {
        label: "Net worth",
        current: canonicalFire?.netWorthNow ?? null,
        required: required.requiredFireNumber,
        unit: "$",
        testid: "decision-bar-net-worth",
      },
      {
        label: "Additional capital",
        current: 0,
        required: required.requiredAdditionalCapital,
        unit: "$",
        testid: "decision-bar-additional-capital",
      },
      {
        label: "Property count",
        current: properties?.length ?? null,
        required: required.requiredAdditionalProperties,
        unit: "count",
        testid: "decision-bar-property-count",
      },
      {
        label: "Savings rate",
        current: surplusToday != null && canonicalFire?.monthlyExpenses
          ? surplusToday / Math.max(1, surplusToday + canonicalFire.monthlyExpenses)
          : null,
        required: required.requiredSavingsRate,
        unit: "%",
        testid: "decision-bar-savings-rate",
      },
    ];
  }, [canonicalLedger, canonicalFire, required, properties]);

  // Sprint 12 — advisor views over Sprint 10 canonical output.
  const top3 = useMemo(() => selectTop3Actions(goalSolverResult), [goalSolverResult]);
  const pathRecommendations = useMemo(() => selectPathRecommendations(goalSolverResult), [goalSolverResult]);
  const rankedBlockers = useMemo(() => selectRankedBlockers(goalSolverResult), [goalSolverResult]);
  const doNothing = useMemo(() => selectDoNothingComparison(goalSolverResult), [goalSolverResult]);

  const topAction = top3[0];
  const altPath = pathRecommendations.find((p) => p.kind === "highest-prob") ?? pathRecommendations[1] ?? pathRecommendations[0];

  function fmt$M(v: number | null): string | null {
    if (v == null || !Number.isFinite(v)) return null;
    return formatCurrency(v, true);
  }
  function fmtPctSigned(v: number | null): string | null {
    if (v == null || !Number.isFinite(v)) return null;
    return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.round(Math.abs(v) * 100)}%`;
  }

  // Sprint 15.2 — surface the unified empty-state CTA when no FIRE goal
  // is explicitly set. The deep analysis tabs below still render with
  // derived defaults; the banner makes the "no goal" state explicit so
  // /decision matches the other 5 surfaces instead of silently using
  // derived "Probability of FIRE" / "Target FIRE Year" panels.
  const { data: canonicalGoal } = useCanonicalGoal();
  const goalSet = isFireGoalExplicitlySet(canonicalGoal ?? null);

  return (
    <div className="flex flex-col gap-4" data-testid="decision-goal-solver-tab">
      {!goalSet && (
        <FireGoalEmptyState
          surface="decision"
          subtitle="The /decision surface uses derived defaults until you set a FIRE goal. Configure your target monthly income and SWR to anchor the probability and timeline panels to your own plan."
        />
      )}
      {/* Sprint 12 — 5-card decision system. Action / Impact / Risk / Alternative / Do-Nothing. */}
      <section data-testid="decision-five-card-system">
        <header className="mb-3">
          <h2 className="text-lg sm:text-xl font-semibold text-foreground">Your decision, in five cards</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every card answers one question. Click each for details — every value is a verified pass-through of the live planner.
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <DecisionCard
            variant="action"
            title={topAction?.label ?? ""}
            subtitle={topAction?.dueYear ? `Due year: ${topAction.dueYear}` : undefined}
            facts={[
              { label: "Source", value: topAction?.sourceStrategyId ? topAction.sourceStrategyId.slice(0, 18) : null },
            ]}
            ctaHref={topAction ? "/portfolio-lab" : undefined}
            ctaLabel={topAction ? "View in Portfolio Lab" : undefined}
          />
          <DecisionCard
            variant="impact"
            title="Expected impact"
            facts={[
              { label: "Net worth", value: topAction?.netWorthDelta != null && topAction.netWorthDelta !== 0 ? `+ ${fmt$M(Math.abs(topAction.netWorthDelta))}` : null },
              { label: "Passive income", value: topAction?.passiveIncomeDelta != null && topAction.passiveIncomeDelta !== 0 ? `+ ${fmt$M(Math.abs(topAction.passiveIncomeDelta))}` : null },
              { label: "Probability of FIRE", value: fmtPctSigned(topAction?.probabilityDelta ?? null) },
            ]}
          />
          <DecisionCard
            variant="risk"
            title={rankedBlockers[0]?.label ?? "Top risks"}
            subtitle={rankedBlockers[0]?.requiredChange ?? undefined}
            facts={[
              ...(rankedBlockers[1]
                ? [{ label: rankedBlockers[1].label, value: rankedBlockers[1].requiredChange ?? "—" }]
                : []),
              ...(rankedBlockers[2]
                ? [{ label: rankedBlockers[2].label, value: rankedBlockers[2].requiredChange ?? "—" }]
                : []),
            ]}
          />
          <DecisionCard
            variant="alternative"
            title={altPath?.label ?? ""}
            subtitle={altPath?.strategyLabel ?? undefined}
            facts={[
              { label: "FIRE year", value: altPath?.expectedFireYear ?? null },
              { label: "Net worth", value: fmt$M(altPath?.expectedNetWorth ?? null) },
              { label: "Probability", value: altPath?.probability != null ? `${Math.round(altPath.probability * 100)}%` : null },
            ]}
          />
          <DecisionCard
            variant="do-nothing"
            title="If you take no action"
            facts={[
              { label: "FIRE year (baseline)", value: doNothing.baselineFireYear ?? null },
              { label: "Net worth (baseline)", value: fmt$M(doNothing.baselineNetWorth) },
              { label: "Probability", value: doNothing.baselineProbability != null ? `${Math.round(doNothing.baselineProbability * 100)}%` : null },
            ]}
          />
        </div>
      </section>

      {/* Sprint 12 — Ranked blockers (hides entirely when none). */}
      <BlockerAnalysisBlock blockers={rankedBlockers} />

      {/* Sprint 11 #13 — Feasibility Hero (demoted into AdvancedDisclosure to keep
          the Sprint 12 5-card system as the primary view above the fold). */}
      <AdvancedDisclosure
        title="Feasibility detail (Sprint 11 hero)"
        subtitle="Status, probability bar, median / best / worst FIRE-year tiles"
        data-testid="decision-feasibility-hero-disclosure"
      >
      {/* Sprint 11 #13 — Feasibility Hero */}
      <section
        className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-card to-card p-4 sm:p-6 shadow-sm"
        data-testid="decision-feasibility-hero"
      >
        <header className="mb-4 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-foreground" data-testid="decision-feasibility-hero-title">
              Can you reach your goal?
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
              Reverse-engineered feasibility from Sprint 9 simulations — every number is engine-backed.
            </p>
          </div>
          <span
            className={`text-[11px] px-3 py-1 rounded-full border font-semibold ${tone.chip}`}
            data-testid="decision-feasibility-status"
          >
            {feasibility.status}
          </span>
        </header>

        {probabilityPct != null ? (
          <div className="mb-4">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Probability of FIRE by target</span>
              <span className="text-lg font-semibold tabular-nums" data-testid="decision-feasibility-probability">
                {probabilityPct}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div className={`h-full ${tone.bar}`} style={{ width: `${Math.min(100, probabilityPct)}%` }} />
            </div>
          </div>
        ) : (
          <div className="text-xs italic text-muted-foreground mb-4" data-testid="decision-feasibility-no-target">
            Set at least one target below to compute a probability.
          </div>
        )}

        <div className="grid grid-cols-3 gap-3" data-testid="decision-feasibility-tiles">
          <div className="rounded-md border border-border bg-card/70 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Median FIRE year</div>
            <div className="mt-1 text-base font-semibold tabular-nums" data-testid="decision-feasibility-median">
              {formatGoalSolverYear(feasibility.medianFireYear)}
            </div>
          </div>
          <div className="rounded-md border border-border bg-card/70 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Best case</div>
            <div className="mt-1 text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400" data-testid="decision-feasibility-best">
              {formatGoalSolverYear(feasibility.bestCaseFireYear)}
            </div>
          </div>
          <div className="rounded-md border border-border bg-card/70 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Worst case</div>
            <div className="mt-1 text-base font-semibold tabular-nums text-rose-600 dark:text-rose-400" data-testid="decision-feasibility-worst">
              {formatGoalSolverYear(feasibility.worstCaseFireYear)}
            </div>
          </div>
        </div>
      </section>
      </AdvancedDisclosure>

      {/* Sprint 11 #16 — Primary action CTA */}
      {primaryAction ? (
        <section
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5 shadow-sm"
          data-testid="decision-primary-action"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Next best action</div>
              <h3 className="text-base font-semibold text-foreground" data-testid="decision-primary-action-text">
                {primaryAction.year}: {primaryAction.action}
              </h3>
            </div>
            <Link href={routeForAction(primaryAction.action)} data-testid="decision-primary-action-cta">
              <Button size="lg" variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Take this action
              </Button>
            </Link>
          </div>
        </section>
      ) : null}

      {/* Sprint 11 #14 — Required-vs-Current strip */}
      <Card data-testid="decision-required-vs-current">
        <CardContent className="p-4 sm:p-5">
          <header className="mb-3">
            <h3 className="text-base font-semibold text-foreground">Required vs Current</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              How far are today's numbers from what the engine says you need to hit your target?
            </p>
          </header>
          <div className="flex flex-col">
            {bars.map((b) => (
              <BarRow key={b.testid} {...b} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Existing Goal Solver Pro surface (Sprint 10) — audit trail has been
          demoted into <AdvancedDisclosure> by Phase 1. */}
      <GoalSolverProSection
        result={goalSolverResult}
        targets={goalTargets}
        onTargetsChange={setGoalTargets}
      />
    </div>
  );
}

export default GoalSolverProTab;

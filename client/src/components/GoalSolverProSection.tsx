/**
 * GoalSolverProSection.tsx — Sprint 10 presentational shell.
 *
 * Pure UI for the goal-solver engine output. Consumes `GoalSolverProResult`
 * and the user-facing target inputs. Every value rendered is a pass-through
 * from goalSolverPro.ts — this file performs zero financial math.
 *
 * Required testid prefix: `goal-solver-`.
 *
 * Section testids:
 *   goal-solver-root
 *   goal-solver-targets-form
 *   goal-solver-feasibility
 *   goal-solver-gap-analysis
 *   goal-solver-required
 *   goal-solver-constraints
 *   goal-solver-blockers
 *   goal-solver-best-path
 *   goal-solver-alternative-paths
 *   goal-solver-action-plan
 *   goal-solver-audit-trail
 */

import * as React from "react";
import {
  type GoalSolverProResult,
  type GoalSolverProTargets,
  type FeasibilityStatus,
  type OptimizationResult,
  formatGoalSolverProbability,
  formatGoalSolverDollars,
  formatGoalSolverYear,
} from "@/lib/goalSolverPro";
import { useAuditMode } from "@/lib/auditMode/AuditModeContext";
import { AdvancedDisclosure } from "@/components/ui/AdvancedDisclosure";

export interface GoalSolverProSectionProps {
  result: GoalSolverProResult;
  targets: GoalSolverProTargets;
  /**
   * Sprint 20 PR-F1: target editing is dead. Targets are sourced from the
   * canonical FIRE goal by the parent; this callback is kept (optional) for
   * backward source-compatibility with older callers — invoking it is a no-op
   * from the section's perspective.
   */
  onTargetsChange?: (next: GoalSolverProTargets) => void;
  className?: string;
}

/* ─── Helpers ─────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: FeasibilityStatus }) {
  const cls =
    status === "ACHIEVABLE"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : status === "STRETCH"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
      : status === "UNLIKELY"
      ? "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/30"
      : "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${cls}`}
      data-testid="goal-solver-feasibility-status"
    >
      {status}
    </span>
  );
}

function Chip({ tone, children, testid }: { tone: "ok" | "fail" | "default"; children: React.ReactNode; testid?: string }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : tone === "fail"
      ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
      : "bg-muted/40 text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}
      data-testid={testid}
    >
      {children}
    </span>
  );
}

function isAllEmpty(t: GoalSolverProTargets): boolean {
  return Object.values(t).every(
    (v) => v == null || v === "" || (typeof v === "number" && !Number.isFinite(v)),
  );
}

/* ─── Section components ──────────────────────────────────────────── */

/**
 * Sprint 20 PR-F1 — dedup. The legacy "Set Your Targets" FIRE-target editor
 * was a duplicate of the canonical FIRE Goal panel on /financial-plan. The
 * editable form has been HARD DELETED here; this banner now points users to
 * the single canonical surface. The targets flowing into the solver are
 * sourced from the canonical FIRE goal by the parent, so the underlying
 * solver math is unchanged.
 */
function TargetsReadOnlyPointer() {
  return (
    <div
      className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-xs text-muted-foreground"
      data-testid="goal-solver-targets-canonical-pointer"
    >
      <p className="font-medium text-foreground">FIRE targets are set in one place.</p>
      <p className="mt-1">
        Edit your target FIRE year and monthly passive income on the canonical{" "}
        <a
          href="/financial-plan#fire-goal"
          className="underline underline-offset-2 hover:text-foreground"
          data-testid="goal-solver-targets-canonical-link"
        >
          FIRE Goal panel
        </a>
        . The solver below reads those targets through the canonical reader hook.
      </p>
    </div>
  );
}

function FeasibilityCard({ result }: { result: GoalSolverProResult }) {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-testid="goal-solver-feasibility"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Feasibility</h3>
        <StatusBadge status={result.feasibility.status} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-xs">
        <div>
          <div className="text-muted-foreground">P(success)</div>
          <div className="font-medium" data-testid="goal-solver-feasibility-prob">
            {formatGoalSolverProbability(result.feasibility.probabilityOfSuccess)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Median FIRE year</div>
          <div className="font-medium" data-testid="goal-solver-feasibility-median">
            {formatGoalSolverYear(result.feasibility.medianFireYear)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Best case</div>
          <div className="font-medium" data-testid="goal-solver-feasibility-best">
            {formatGoalSolverYear(result.feasibility.bestCaseFireYear)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Worst case</div>
          <div className="font-medium" data-testid="goal-solver-feasibility-worst">
            {formatGoalSolverYear(result.feasibility.worstCaseFireYear)}
          </div>
        </div>
      </div>
    </div>
  );
}

function GapAnalysisCard({ result }: { result: GoalSolverProResult }) {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-testid="goal-solver-gap-analysis"
    >
      <h3 className="mb-3 text-sm font-semibold">Gap Analysis</h3>
      {result.gap.entries.length === 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="goal-solver-gap-empty">No targets supplied — gap analysis is empty.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1">Target</th>
              <th className="py-1 text-right">Wanted</th>
              <th className="py-1 text-right">Projected</th>
              <th className="py-1 text-right">Shortfall</th>
              <th className="py-1 text-right">Unit</th>
              <th className="py-1 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {result.gap.entries.map((g) => (
              <tr key={g.field} className="border-b border-border/40" data-testid={`goal-solver-gap-row-${g.field}`}>
                <td className="py-1">{g.label}</td>
                <td className="py-1 text-right" data-testid={`goal-solver-gap-target-${g.field}`}>{g.target}</td>
                <td className="py-1 text-right" data-testid={`goal-solver-gap-actual-${g.field}`}>{g.actual ?? "—"}</td>
                <td className="py-1 text-right" data-testid={`goal-solver-gap-shortfall-${g.field}`}>{g.shortfall}</td>
                <td className="py-1 text-right">{g.unit}</td>
                <td className="py-1 text-right">
                  <Chip tone={g.status === "met" ? "ok" : g.status === "shortfall" ? "fail" : "default"} testid={`goal-solver-gap-status-${g.field}`}>{g.status}</Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RequiredInputsCard({ result }: { result: GoalSolverProResult }) {
  const r = result.requiredInputs;
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-testid="goal-solver-required"
    >
      <h3 className="mb-3 text-sm font-semibold">Required Inputs (Reverse Engineering)</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 text-xs">
        <div>
          <div className="text-muted-foreground">Required Monthly DCA</div>
          <div className="font-medium" data-testid="goal-solver-required-dca">{formatGoalSolverDollars(r.requiredMonthlyDCA)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Required Additional Capital</div>
          <div className="font-medium" data-testid="goal-solver-required-capital">{formatGoalSolverDollars(r.requiredAdditionalCapital)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Required Additional Properties</div>
          <div className="font-medium" data-testid="goal-solver-required-properties">{r.requiredAdditionalProperties ?? "—"}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Required Savings Rate</div>
          <div className="font-medium" data-testid="goal-solver-required-savings-rate">
            {r.requiredSavingsRate == null ? "—" : `${(r.requiredSavingsRate * 100).toFixed(1)}%`}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Required FIRE Number</div>
          <div className="font-medium" data-testid="goal-solver-required-fire-number">{formatGoalSolverDollars(r.requiredFireNumber)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Source Strategy</div>
          <div className="font-medium" data-testid="goal-solver-required-source">{r.sourceStrategyLabel ?? "—"}</div>
        </div>
      </div>
    </div>
  );
}

function ConstraintsCard({ result }: { result: GoalSolverProResult }) {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-testid="goal-solver-constraints"
    >
      <h3 className="mb-3 text-sm font-semibold">Constraints</h3>
      {result.constraints.checks.length === 0 ? (
        <p className="text-xs text-muted-foreground">No constraints supplied.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {result.constraints.checks.map((c, i) => (
            <Chip key={i} tone={c.pass ? "ok" : "fail"} testid={`goal-solver-constraint-${i}`}>
              {c.constraint}: {c.pass ? "PASS" : "FAIL"} ({c.limit ?? "—"})
            </Chip>
          ))}
        </div>
      )}
      <div className="mt-3 text-[11px] text-muted-foreground">
        <span data-testid="goal-solver-constraint-evaluated">{result.constraints.candidatesEvaluated}</span>{" "}
        candidates evaluated;{" "}
        <span data-testid="goal-solver-constraint-passing">{result.constraints.candidatesPassing}</span>{" "}
        pass every constraint.
      </div>
    </div>
  );
}

function BlockersCard({ result }: { result: GoalSolverProResult }) {
  if (result.feasibility.status !== "IMPOSSIBLE" && result.blockers.length === 0) return null;
  return (
    <div
      className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-4"
      data-testid="goal-solver-blockers"
    >
      <h3 className="mb-2 text-sm font-semibold text-rose-700 dark:text-rose-300">Blockers</h3>
      {result.blockers.length === 0 ? (
        <p className="text-xs text-muted-foreground">No specific blocker recorded.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {result.blockers.map((b, i) => (
            <li key={i} data-testid={`goal-solver-blocker-${i}`}>
              <span className="font-medium">{b.constraint}</span>: {b.reason}
              {b.strategiesEliminated.length > 0 ? (
                <span className="text-muted-foreground"> — {b.strategiesEliminated.length} strategy(ies) eliminated</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BestPathCard({ result }: { result: GoalSolverProResult }) {
  const p = result.bestPath;
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-testid="goal-solver-best-path"
    >
      <h3 className="mb-3 text-sm font-semibold">Best Path (Hybrid)</h3>
      {p ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 text-xs">
          <div>
            <div className="text-muted-foreground">Strategy</div>
            <div className="font-medium" data-testid="goal-solver-best-path-label">{p.label}</div>
          </div>
          <div>
            <div className="text-muted-foreground">P(FIRE)</div>
            <div className="font-medium" data-testid="goal-solver-best-path-prob">{formatGoalSolverProbability(p.probabilityFireByTarget)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Median FIRE year</div>
            <div className="font-medium" data-testid="goal-solver-best-path-median">{formatGoalSolverYear(p.medianFireYear)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Net Worth P50</div>
            <div className="font-medium" data-testid="goal-solver-best-path-nw">{formatGoalSolverDollars(p.netWorthP50)}</div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No best path available.</p>
      )}
    </div>
  );
}

function AlternativePathsCard({ result }: { result: GoalSolverProResult }) {
  const { auditMode } = useAuditMode();
  const featured: OptimizationResult["objective"][] = [
    "fastestFire",
    "highestProbability",
    "lowestRisk",
    "bestHybrid",
  ];
  const featuredAlts = result.alternativePaths.filter((a) => featured.includes(a.objective));
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-testid="goal-solver-alternative-paths"
    >
      <h3 className="mb-3 text-sm font-semibold">Alternative Paths</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {featuredAlts.map((alt, i) => (
          <div
            key={alt.objective}
            className="rounded border border-border/60 p-3 text-xs"
            data-testid={`goal-solver-alt-${alt.objective}`}
          >
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">#{i + 1} · {alt.label}</div>
            <div className="mt-1 font-medium" data-testid={`goal-solver-alt-label-${alt.objective}`}>
              {alt.path?.label ?? "—"}
            </div>
            {auditMode ? (
              <div className="mt-1 text-muted-foreground" data-testid={`goal-solver-alt-score-${alt.objective}`}>
                score: {alt.score == null ? "—" : alt.score.toFixed(2)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionPlanCard({ result }: { result: GoalSolverProResult }) {
  const { auditMode } = useAuditMode();
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-testid="goal-solver-action-plan"
    >
      <h3 className="mb-3 text-sm font-semibold">Year-by-Year Action Plan</h3>
      {result.actionPlan.length === 0 ? (
        <p className="text-xs text-muted-foreground">No action plan generated.</p>
      ) : (
        <ol className="space-y-1 text-xs">
          {result.actionPlan.map((a, i) => (
            <li
              key={i}
              data-testid={`goal-solver-action-row-${i}`}
              className="border-l-2 border-emerald-500/40 pl-3"
            >
              <span className="font-medium" data-testid={`goal-solver-action-year-${i}`}>{a.year}</span>:{" "}
              <span data-testid={`goal-solver-action-text-${i}`}>{a.action}</span>
              {auditMode ? (
                <div className="text-[10px] text-muted-foreground">
                  source: {a.sourceStrategyId} · field: {a.inputField}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function AuditTrailCard({ result }: { result: GoalSolverProResult }) {
  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      data-testid="goal-solver-audit-trail"
    >
      <h3 className="mb-3 text-sm font-semibold">Audit Trail</h3>
      {result.auditTrail.length === 0 ? (
        <p className="text-xs text-muted-foreground">Audit trail is empty.</p>
      ) : (
        <div className="space-y-2 text-xs">
          {result.auditTrail.map((a, i) => (
            <details key={i} className="rounded border border-border/60 p-2" data-testid={`goal-solver-audit-entry-${i}`}>
              <summary className="cursor-pointer font-medium">{a.label}</summary>
              <div className="mt-2 grid grid-cols-1 gap-1">
                <div><span className="text-muted-foreground">Engines:</span> {a.enginesUsed.join(", ")}</div>
                <div><span className="text-muted-foreground">Inputs:</span> {a.inputsUsed.join(", ")}</div>
                <div><span className="text-muted-foreground">Assumptions:</span> {a.assumptionsUsed.join("; ")}</div>
                <div><span className="text-muted-foreground">Probability source:</span> {a.probabilitySource}</div>
                <div><span className="text-muted-foreground">Path source:</span> {a.pathSource}</div>
                <div><span className="text-muted-foreground">Constraint source:</span> {a.constraintSource}</div>
                <div><span className="text-muted-foreground">Confidence source:</span> {a.confidenceSource}</div>
                <div><span className="text-muted-foreground">How calculated:</span> {a.howCalculated}</div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Root ─────────────────────────────────────────────────────────── */

export function GoalSolverProSection({
  result,
  targets,
  className,
}: GoalSolverProSectionProps) {
  const targetsEmpty = isAllEmpty(targets);
  const showPlaceholder = result.empty || (targetsEmpty && result.feasibility.medianFireYear == null);

  return (
    <div
      className={`flex flex-col gap-4 ${className ?? ""}`}
      data-testid="goal-solver-root"
    >
      <TargetsReadOnlyPointer />
      {showPlaceholder ? (
        <div
          className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground"
          data-testid="goal-solver-placeholder"
        >
          Set at least one target above to run Goal Solver. The solver will reverse-engineer
          the smallest set of inputs (monthly DCA, capital, property count) that satisfy your
          targets — using only Sprint 7/8/9 outputs, no new financial formulas.
        </div>
      ) : (
        <>
          <FeasibilityCard result={result} />
          <GapAnalysisCard result={result} />
          <RequiredInputsCard result={result} />
          <ConstraintsCard result={result} />
          <BlockersCard result={result} />
          <BestPathCard result={result} />
          <AlternativePathsCard result={result} />
          <ActionPlanCard result={result} />
          {/* Sprint 11 #15 — demote the 8-field audit trail into AdvancedDisclosure. */}
          <AdvancedDisclosure
            title="Where did these numbers come from?"
            subtitle="Goal Solver Pro audit trail (engines, inputs, assumptions per section)"
            data-testid="goal-solver-advanced-disclosure"
          >
            <AuditTrailCard result={result} />
          </AdvancedDisclosure>
        </>
      )}
    </div>
  );
}

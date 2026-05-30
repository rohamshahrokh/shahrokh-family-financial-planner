/**
 * RecommendationExplainabilityPanel — Sprint 30B Step 2.
 *
 * Surfaces the full provenance of the currently selected recommendation:
 *   - Optimizer Selected vs Safety Override Applied (top badge)
 *   - Raw optimizer winner vs final recommendation (side-by-side)
 *   - Override rule + rationale (when applied)
 *   - Ranked candidate table (rank, score, FIRE age, NW, passive income,
 *     liquidity/risk/borrowing axes, final status)
 *   - Why selected / Why rejected / What changed the ranking
 *
 * This component renders ONLY what the selector produced — it does not
 * recompute scores, fan, or any financial math. All data flows from
 * `buildRecommendationExplanation()` in
 * `client/src/lib/actionRoadmap/recommendationExplanation.ts`.
 */
import * as React from "react";
import { AlertTriangle, CheckCircle2, Shield, Sparkles } from "lucide-react";
import type {
  ExplanationPathRow,
  RecommendationExplanation,
} from "@/lib/actionRoadmap/recommendationExplanation";

interface Props {
  explanation: RecommendationExplanation;
  className?: string;
}

function fmtScore(s: number | null): string {
  if (s == null || !Number.isFinite(s)) return "—";
  return s.toFixed(1);
}

function fmtAge(a: number | null): string {
  return a == null ? "—" : String(a);
}

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}

function fmtAxis(v: number | null): string {
  return v == null ? "—" : `${v}`;
}

function fmtProb(p: number | null): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(0)}%`;
}

function statusBadge(status: ExplanationPathRow["finalStatus"]): { label: string; tone: string } {
  switch (status) {
    case "selected":
      return {
        label: "Selected",
        tone:
          "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25",
      };
    case "rejected":
      return {
        label: "Rejected (overridden)",
        tone:
          "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25",
      };
    case "alternate":
    default:
      return {
        label: "Alternate",
        tone:
          "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-500/15 dark:text-slate-200 dark:ring-slate-400/25",
      };
  }
}

function profileTone(profile: string): string {
  switch (profile) {
    case "wealth_max":
    case "aggressive":
      return "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25";
    case "cashflow_safe":
    case "conservative":
      return "bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/25";
    case "fire_focused":
      return "bg-violet-100 text-violet-800 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/25";
    default:
      return "bg-muted text-muted-foreground ring-border";
  }
}

export function RecommendationExplainabilityPanel({ explanation, className }: Props) {
  if (!explanation.available) {
    return (
      <section
        data-testid="ar-recommendation-explainability"
        aria-labelledby="ar-rec-explain-heading"
        className={`rounded-2xl border border-border/70 bg-card p-5 shadow-sm ${className ?? ""}`}
      >
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Recommendation Explainability
            </div>
            <h2
              id="ar-rec-explain-heading"
              className="text-xl font-semibold text-foreground"
            >
              Not modelled yet
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Run a plan from Decision Lab to populate the recommendation provenance.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const {
    optimizerWinner,
    finalRecommendation,
    overrideApplied,
    overrideRule,
    overrideRationale,
    rankedTable,
    whySelected,
    whyRejected,
    whatChangedRanking,
    signals,
  } = explanation;

  const sourceBadge = overrideApplied
    ? {
        label: "Safety Override Applied",
        tone:
          "bg-rose-100 text-rose-800 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25",
        Icon: Shield,
      }
    : {
        label: "Optimizer Selected",
        tone:
          "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25",
        Icon: CheckCircle2,
      };

  return (
    <section
      data-testid="ar-recommendation-explainability"
      aria-labelledby="ar-rec-explain-heading"
      className={`rounded-2xl border border-border/70 bg-card p-5 shadow-sm ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-5 w-5 text-violet-600 dark:text-violet-400" aria-hidden />
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Recommendation Explainability
            </div>
            <h2
              id="ar-rec-explain-heading"
              className="text-xl font-semibold text-foreground"
            >
              {finalRecommendation?.templateLabel ?? "Not modelled yet"}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Full provenance for the selected path: score, ranking, and selection reason.
            </p>
          </div>
        </div>
        <span
          data-testid="ar-rec-explain-source-badge"
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${sourceBadge.tone}`}
        >
          <sourceBadge.Icon className="h-3.5 w-3.5" aria-hidden />
          {sourceBadge.label}
        </span>
      </div>

      {/* Optimizer winner ↔ Final recommendation */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <WinnerCard
          label="Optimizer winner"
          row={optimizerWinner}
          highlight={!overrideApplied}
          testId="ar-rec-explain-optimizer-winner"
        />
        <WinnerCard
          label="Final recommendation"
          row={finalRecommendation}
          highlight={overrideApplied}
          testId="ar-rec-explain-final-recommendation"
        />
      </div>

      {/* Override rule + rationale */}
      {overrideApplied && (
        <div
          data-testid="ar-rec-explain-override-rule"
          className="mt-4 rounded-lg border border-rose-300/60 bg-rose-50/40 p-3 dark:border-rose-400/30 dark:bg-rose-950/20"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600 dark:text-rose-400" aria-hidden />
            <div className="text-sm">
              <div className="font-semibold text-rose-900 dark:text-rose-100">
                Override rule fired: {ruleLabel(overrideRule)}
              </div>
              {overrideRationale && (
                <p
                  data-testid="ar-rec-explain-override-rationale"
                  className="mt-1 text-rose-900/90 dark:text-rose-100/90"
                >
                  {overrideRationale}
                </p>
              )}
              <p className="mt-1 text-xs text-rose-900/70 dark:text-rose-100/70">
                Signals — risk tolerance: <SignalChip v={signals.riskTolerance} /> · liquidity:{" "}
                <SignalChip v={signals.liquidityStressBand} /> · savings:{" "}
                <SignalChip v={signals.savingsConsistencyBand} /> · leverage:{" "}
                <SignalChip v={signals.leveragePressureBand} />
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Ranked candidate table */}
      <div className="mt-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Ranked candidate paths ({rankedTable.length})
        </div>
        <div className="mt-2 overflow-x-auto rounded-lg border border-border/60">
          <table
            data-testid="ar-rec-explain-table"
            className="w-full min-w-[760px] divide-y divide-border/60 text-xs"
          >
            <thead className="bg-muted/40">
              <tr className="text-left text-muted-foreground">
                <Th>#</Th>
                <Th>Path</Th>
                <Th>Score</Th>
                <Th>FIRE age</Th>
                <Th>NW @ FIRE</Th>
                <Th>Passive income</Th>
                <Th>Liquidity</Th>
                <Th>Risk (survival)</Th>
                <Th>Borrowing</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rankedTable.map((row) => {
                const s = statusBadge(row.finalStatus);
                const isSelected = row.finalStatus === "selected";
                const isRejected = row.finalStatus === "rejected";
                return (
                  <tr
                    key={row.templateId}
                    data-testid={`ar-rec-explain-row-${row.templateId}`}
                    data-status={row.finalStatus}
                    className={
                      isSelected
                        ? "bg-emerald-50/50 dark:bg-emerald-950/20"
                        : isRejected
                          ? "bg-rose-50/30 dark:bg-rose-950/15"
                          : ""
                    }
                  >
                    <Td>{row.rank}</Td>
                    <Td>
                      <div className="font-medium text-foreground">{row.templateLabel}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${profileTone(
                            row.investorProfile,
                          )}`}
                        >
                          {row.investorProfile}
                        </span>
                        {row.isAggressive && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25">
                            aggressive
                          </span>
                        )}
                        {row.isSafe && (
                          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 ring-1 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/25">
                            safe
                          </span>
                        )}
                        {/* Sprint 30B Step 3 — intent-filter + equivalency chips */}
                        {row.winnerSelectedByIntentFilter && (
                          <span
                            className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/25"
                            title="Winner picked by template intent filter, not the raw optimizer top."
                            data-testid={`ar-rec-row-intent-filtered-${row.templateId}`}
                          >
                            intent-filtered
                          </span>
                        )}
                        {row.equivalentTemplateIds.length > 0 && (
                          <span
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-300 dark:bg-slate-500/15 dark:text-slate-300 dark:ring-slate-400/25"
                            title={`Identical forecast to: ${row.equivalentTemplateIds.join(", ")}`}
                            data-testid={`ar-rec-row-equivalent-${row.templateId}`}
                          >
                            equivalent to: {row.equivalentTemplateIds.join(", ")}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td className="font-mono">{fmtScore(row.score)}</Td>
                    <Td className="font-mono">{fmtAge(row.fireAgeP50)}</Td>
                    <Td className="font-mono">{fmtMoney(row.netWorthAtFireP50)}</Td>
                    <Td className="font-mono">{fmtMoney(row.passiveIncomeAtFireP50)}</Td>
                    <Td className="font-mono">{fmtAxis(row.liquidityAxis)}</Td>
                    <Td className="font-mono">
                      {fmtAxis(row.survivalAxis)}
                      {row.probabilityP50 != null && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ({fmtProb(row.probabilityP50)})
                        </span>
                      )}
                    </Td>
                    <Td className="font-mono">{fmtAxis(row.leverageAxis)}</Td>
                    <Td>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${s.tone}`}
                      >
                        {s.label}
                      </span>
                      {row.rejectionReason && (
                        <div className="mt-1 max-w-[220px] text-[10px] text-muted-foreground">
                          {row.rejectionReason}
                        </div>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Scoring axes shown 0–100 (normalised). Liquidity / Risk / Borrowing come from
          the engine's score breakdown for each template's winning candidate.
          FIRE age / NW / passive income are P50 from each template's own Monte Carlo fan.
        </p>
        {/* Sprint 30B Step 3 — differentiation note. Only renders when at least
            one row has either an intent-filter pick or an equivalency collision. */}
        {rankedTable.some(
          (r) => r.winnerSelectedByIntentFilter || r.equivalentTemplateIds.length > 0,
        ) && (
          <p
            className="mt-1 text-[11px] text-muted-foreground"
            data-testid="ar-rec-explain-differentiation-note"
          >
            Each template routes through its own intent filter, so the winning
            candidate honours the template's promise rather than always falling
            back to the optimizer top. When two templates share an intent (for
            example, debt reduction and liquidity preservation both deposit into
            the offset), their forecasts are intentionally identical and flagged
            via the “equivalent to” chip.
          </p>
        )}
      </div>

      {/* Why selected / Why rejected / What changed the ranking */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ReasonCard title="Why selected" body={whySelected} testId="ar-rec-explain-why-selected" tone="emerald" />
        <ReasonCard
          title="Why optimizer top rejected"
          body={whyRejected ?? (overrideApplied ? null : "No optimizer top was rejected — the recommendation matches the raw ranking.")}
          testId="ar-rec-explain-why-rejected"
          tone={overrideApplied ? "rose" : "muted"}
        />
        <ReasonCard
          title="What changed the ranking"
          body={whatChangedRanking}
          testId="ar-rec-explain-what-changed"
          tone={overrideApplied ? "amber" : "muted"}
        />
      </div>
    </section>
  );
}

function ruleLabel(rule: RecommendationExplanation["overrideRule"]): string {
  switch (rule) {
    case "rule1_safety_override":
      return "Rule 1 — Safety override (aggressive top + low risk / weak liquidity)";
    case "rule2_savings_weak_override":
      return "Rule 2 — Savings-weak override (low risk + weak savings)";
    case "rule3_aggressive_default_with_rationale":
      return "Rule 3 — Aggressive top kept with rationale";
    case "none":
    default:
      return "No override";
  }
}

function WinnerCard({
  label,
  row,
  highlight,
  testId,
}: {
  label: string;
  row: ExplanationPathRow | null;
  highlight: boolean;
  testId: string;
}) {
  const ring = highlight
    ? "ring-2 ring-violet-400/70 dark:ring-violet-400/60"
    : "ring-1 ring-border/60";
  return (
    <div
      data-testid={testId}
      className={`rounded-lg bg-background/60 p-3 ${ring}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-foreground">
        {row?.templateLabel ?? "Not modelled yet"}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">
        {row?.promise ?? ""}
      </div>
      {row && (
        <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
          <Stat label="Score" value={fmtScore(row.score)} />
          <Stat label="Rank" value={`#${row.rank}`} />
          <Stat label="Profile" value={row.investorProfile} />
        </dl>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/40 bg-background/60 px-2 py-1">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[12px] text-foreground">{value}</div>
    </div>
  );
}

function ReasonCard({
  title,
  body,
  testId,
  tone,
}: {
  title: string;
  body: string | null;
  testId: string;
  tone: "emerald" | "rose" | "amber" | "muted";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-300/60 bg-emerald-50/40 dark:border-emerald-400/30 dark:bg-emerald-950/15"
      : tone === "rose"
        ? "border-rose-300/60 bg-rose-50/40 dark:border-rose-400/30 dark:bg-rose-950/15"
        : tone === "amber"
          ? "border-amber-300/60 bg-amber-50/40 dark:border-amber-400/30 dark:bg-amber-950/15"
          : "border-border/60 bg-background/40";
  return (
    <div
      data-testid={testId}
      className={`rounded-lg border p-3 text-xs ${toneClass}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <p className="mt-1 text-foreground/90 leading-relaxed">
        {body ?? <span className="italic text-muted-foreground">Not applicable.</span>}
      </p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wider">
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2.5 py-2 align-top ${className ?? ""}`}>{children}</td>;
}

function SignalChip({ v }: { v: string | null }) {
  if (!v) return <span className="italic">unknown</span>;
  const tone =
    v === "low" || v === "red"
      ? "text-rose-700 dark:text-rose-300"
      : v === "amber" || v === "medium"
        ? "text-amber-700 dark:text-amber-300"
        : "text-emerald-700 dark:text-emerald-300";
  return <span className={`font-semibold ${tone}`}>{v}</span>;
}

export default RecommendationExplainabilityPanel;

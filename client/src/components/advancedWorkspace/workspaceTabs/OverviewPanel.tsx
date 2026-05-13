/**
 * OverviewPanel — winner snapshot + headline metrics for the Advanced Workspace.
 *
 * Lean, analytical: a tabular header bar of key metrics, then the
 * comparative narrative + a small ranking strip.
 */
import { Crown } from "lucide-react";
import type { QuickDecisionOutput, RankedCandidate } from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import {
  LABEL_CLS, NUM_CLS, MICRO_CLS, PANEL_HEADING_CLS,
  POS_TEXT, NEG_TEXT,
} from "../workspaceTokens";
import { cn } from "@/lib/utils";

export interface OverviewPanelProps {
  output: QuickDecisionOutput;
  selectedCandidate: RankedCandidate;
  setRailScenario: (id: string) => void;
  fmt: {
    fmt$: (n: number) => string;
    fmt$k: (n: number) => string;
    fmt$M: (n: number) => string;
    pct: (n: number, d?: number) => string;
  };
}

export function OverviewPanel({ output, selectedCandidate, setRailScenario, fmt }: OverviewPanelProps) {
  const winner = output.ranked[0]!;
  const r = selectedCandidate.result;
  const rm = r.riskMetrics;
  const p50 = r.terminalNwSorted[Math.floor(r.terminalNwSorted.length * 0.5)] ?? 0;
  const p10 = r.terminalNwSorted[Math.floor(r.terminalNwSorted.length * 0.1)] ?? 0;
  const p90 = r.terminalNwSorted[Math.floor(r.terminalNwSorted.length * 0.9)] ?? 0;
  const survival = 1 - r.defaultProbability;

  return (
    <section className="space-y-4" data-testid="overview-panel">
      {/* Header strip */}
      <header className="border border-border rounded-md bg-card/95 dark:bg-card/70 p-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {selectedCandidate.id === winner.id && (
                <Crown className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              )}
              <span className={LABEL_CLS}>
                {selectedCandidate.id === winner.id ? "Current winner" : `Rank #${output.ranked.findIndex(c => c.id === selectedCandidate.id) + 1}`}
              </span>
            </div>
            <h2 className="text-base font-semibold mt-0.5 truncate" title={selectedCandidate.label}>
              {selectedCandidate.label}
            </h2>
            <p className={cn(MICRO_CLS, "mt-1 max-w-prose")}>{selectedCandidate.headline}</p>
          </div>
          <div className="text-right">
            <div className={LABEL_CLS}>Composite score</div>
            <div className={cn("text-2xl font-semibold mt-0.5", NUM_CLS)}>
              {selectedCandidate.score.score.toFixed(0)}
            </div>
            <div className={MICRO_CLS}>/ 100</div>
          </div>
        </div>

        {/* Metrics grid */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 border-t border-border/60">
          <Metric label="P50 net worth" value={fmt.fmt$M(p50)} />
          <Metric label="P10 (worst 10%)" value={fmt.fmt$M(p10)} />
          <Metric label="P90 (best 10%)" value={fmt.fmt$M(p90)} />
          <Metric label="Survival" value={fmt.pct(survival, 1)} valueClass={survival >= 0.95 ? POS_TEXT : survival >= 0.85 ? "" : NEG_TEXT} />
          <Metric label="VaR₉₅" value={fmt.fmt$M(rm.varDollars95)} />
          <Metric label="CVaR₉₅" value={fmt.fmt$M(rm.cvarDollars95)} />
          <Metric label="Max DD · median" value={fmt.pct(rm.maxDrawdownMedian, 1)} />
          <Metric label="Liq. exhaustion" value={fmt.pct(r.liquidityExhaustionProbability, 1)} />
        </div>
      </header>

      {/* Comparative narrative */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="border border-border rounded-md bg-card/95 dark:bg-card/70 p-3">
          <h3 className={cn(PANEL_HEADING_CLS, "mb-2")}>Why this leads</h3>
          {output.comparativeNarrative.whyWon.length === 0 ? (
            <p className={MICRO_CLS}>No comparative narrative available for this run.</p>
          ) : (
            <ul className="space-y-1.5 text-[12px] leading-snug">
              {output.comparativeNarrative.whyWon.map((line, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className={cn(POS_TEXT, "shrink-0")}>+</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border border-border rounded-md bg-card/95 dark:bg-card/70 p-3">
          <h3 className={cn(PANEL_HEADING_CLS, "mb-2")}>What could invalidate it</h3>
          {output.comparativeNarrative.whatCouldInvalidate.length === 0 ? (
            <p className={MICRO_CLS}>No invalidation conditions surfaced.</p>
          ) : (
            <ul className="space-y-1.5 text-[12px] leading-snug">
              {output.comparativeNarrative.whatCouldInvalidate.map((line, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className={cn(NEG_TEXT, "shrink-0")}>!</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Ranking strip */}
      <div className="border border-border rounded-md bg-card/95 dark:bg-card/70 p-3">
        <h3 className={cn(PANEL_HEADING_CLS, "mb-2")}>Ranking</h3>
        <div className="space-y-1">
          {output.ranked.slice(0, 8).map((c, i) => {
            const isSelected = c.id === selectedCandidate.id;
            const p50c = c.result.terminalNwSorted[Math.floor(c.result.terminalNwSorted.length * 0.5)] ?? 0;
            return (
              <button
                key={c.id}
                onClick={() => setRailScenario(c.id)}
                className={cn(
                  "w-full flex items-center gap-2 py-1 px-2 rounded text-[11px] transition-colors text-left",
                  isSelected ? "bg-muted/80" : "hover:bg-muted/40",
                )}
              >
                <span className={cn("w-5 text-muted-foreground", NUM_CLS)}>#{i + 1}</span>
                {i === 0 && <Crown className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                <span className={cn("flex-1 truncate", isSelected && "font-semibold")}>{c.label}</span>
                <span className={cn(NUM_CLS, "text-muted-foreground w-16 text-right")}>{c.score.score.toFixed(0)}</span>
                <span className={cn(NUM_CLS, "w-20 text-right")}>{fmt.fmt$M(p50c)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <div className={LABEL_CLS}>{label}</div>
      <div className={cn("text-sm font-semibold mt-0.5", NUM_CLS, valueClass)}>{value}</div>
    </div>
  );
}

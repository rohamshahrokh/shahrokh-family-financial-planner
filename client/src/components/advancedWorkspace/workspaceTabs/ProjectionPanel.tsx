/**
 * ProjectionPanel — fan chart + drawdown overlay for the selected scenario.
 *
 * Reuses the existing FanChart but in workspace chrome.
 */
import type { RankedCandidate } from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import { FanChart, DistributionHistogram } from "@/components/decisionEngine/RiskVisualizations";
import { PANEL_HEADING_CLS, MICRO_CLS, LABEL_CLS, NUM_CLS } from "../workspaceTokens";
import { cn } from "@/lib/utils";

export interface ProjectionPanelProps {
  selectedCandidate: RankedCandidate;
  fmt: {
    fmt$: (n: number) => string;
    fmt$k: (n: number) => string;
    fmt$M: (n: number) => string;
    pct: (n: number, d?: number) => string;
    sentence: (s: string) => string;
  };
  privacyMode?: boolean;
}

export function ProjectionPanel({ selectedCandidate, fmt, privacyMode }: ProjectionPanelProps) {
  const r = selectedCandidate.result;
  return (
    <section className="space-y-3" data-testid="projection-panel">
      <header>
        <h2 className={PANEL_HEADING_CLS}>Projection</h2>
        <p className={MICRO_CLS}>
          {r.simulationCount.toLocaleString()} Monte Carlo paths · horizon {r.horizonMonths} months
        </p>
      </header>

      <div className="border border-border rounded-md bg-card/95 dark:bg-card/70 p-3">
        <FanChart
          fan={r.netWorthFan}
          fmt={{
            fmt$: fmt.fmt$, fmt$k: fmt.fmt$k, fmt$M: fmt.fmt$M, pct: fmt.pct, sentence: fmt.sentence,
          }}
          initialNetWorth={r.initialNetWorth}
          hidden={privacyMode}
        />
      </div>

      <div className="border border-border rounded-md bg-card/95 dark:bg-card/70 p-3">
        <h3 className={cn(PANEL_HEADING_CLS, "mb-2")}>Terminal NW distribution</h3>
        <DistributionHistogram
          terminalNwSorted={r.terminalNwSorted}
          initialNetWorth={r.initialNetWorth}
          varDollars95={r.riskMetrics.varDollars95}
          cvarDollars95={r.riskMetrics.cvarDollars95}
          fmt={{
            fmt$: fmt.fmt$, fmt$k: fmt.fmt$k, fmt$M: fmt.fmt$M, pct: fmt.pct, sentence: fmt.sentence,
          }}
          hidden={privacyMode}
        />
      </div>

      {/* Percentile breakdown */}
      <div className="border border-border rounded-md bg-card/95 dark:bg-card/70 p-3">
        <h3 className={cn(PANEL_HEADING_CLS, "mb-2")}>Percentile breakdown · terminal NW</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {[0.05, 0.10, 0.50, 0.90, 0.95].map((q) => {
            const v = r.terminalNwSorted[Math.floor(r.terminalNwSorted.length * q)] ?? 0;
            return (
              <div key={q}>
                <div className={LABEL_CLS}>P{Math.round(q * 100)}</div>
                <div className={cn("text-sm font-semibold mt-0.5", NUM_CLS)}>
                  {privacyMode ? "•••" : fmt.fmt$M(v)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

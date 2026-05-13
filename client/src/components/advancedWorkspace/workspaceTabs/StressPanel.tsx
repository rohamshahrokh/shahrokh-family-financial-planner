/**
 * StressPanel — tail-risk + invalidation engine for the selected scenario.
 *
 * Reuses existing TailRiskCard + InvalidationEngine in workspace chrome.
 */
import type { QuickDecisionOutput, RankedCandidate } from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import { TailRiskCard } from "@/components/decisionEngine/RiskVisualizations";
import { InvalidationEngine } from "@/components/decisionEngine/ScoreVisualizations";
import { PANEL_HEADING_CLS, MICRO_CLS } from "../workspaceTokens";
import { cn } from "@/lib/utils";

export interface StressPanelProps {
  output: QuickDecisionOutput;
  selectedCandidate: RankedCandidate;
  fmt: {
    fmt$: (n: number) => string;
    fmt$k: (n: number) => string;
    fmt$M: (n: number) => string;
    pct: (n: number, d?: number) => string;
    sentence: (s: string) => string;
  };
}

export function StressPanel({ output, selectedCandidate, fmt }: StressPanelProps) {
  return (
    <section className="space-y-3" data-testid="stress-panel">
      <header>
        <h2 className={PANEL_HEADING_CLS}>Stress & tail risk</h2>
        <p className={MICRO_CLS}>
          Worst-case statistics for {selectedCandidate.label}
        </p>
      </header>

      <div className="border border-border rounded-md bg-card/95 dark:bg-card/70 p-3">
        <TailRiskCard
          result={selectedCandidate.result}
          fmt={fmt}
        />
      </div>

      <div className="border border-border rounded-md bg-card/95 dark:bg-card/70 p-3">
        <h3 className={cn(PANEL_HEADING_CLS, "mb-2")}>Invalidation engine</h3>
        <InvalidationEngine
          output={output}
          fmt={fmt}
        />
      </div>
    </section>
  );
}

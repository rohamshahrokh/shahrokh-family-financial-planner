/**
 * ExecutionPanel — phased execution plan + conditional recommendations
 * for the selected scenario.
 *
 * Reuses existing ExecutionPlanTimeline + ConditionalRecsList.
 */
import type { QuickDecisionOutput, RankedCandidate } from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import { ExecutionPlanTimeline, ConditionalRecsList } from "@/components/decisionEngine/RecommendationLayer";
import { PANEL_HEADING_CLS, MICRO_CLS } from "../workspaceTokens";
import { cn } from "@/lib/utils";

export interface ExecutionPanelProps {
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

export function ExecutionPanel({ output, selectedCandidate, fmt }: ExecutionPanelProps) {
  const isWinner = selectedCandidate.id === output.ranked[0]?.id;

  return (
    <section className="space-y-3" data-testid="execution-panel">
      <header>
        <h2 className={PANEL_HEADING_CLS}>Execution plan</h2>
        <p className={MICRO_CLS}>
          {isWinner
            ? "Phased rollout for the winning scenario"
            : "Execution plan only available for the current winner — switch via Compare tab"}
        </p>
      </header>

      {isWinner && output.executionPlan.length > 0 ? (
        <div className="border border-border rounded-md bg-card/95 dark:bg-card/70 p-3">
          <ExecutionPlanTimeline
            phases={output.executionPlan}
            fmt={fmt}
          />
        </div>
      ) : isWinner ? (
        <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-4 text-center">
          No execution phases produced for this scenario.
        </div>
      ) : (
        <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-4 text-center">
          Select the winner ({output.ranked[0]?.label}) to view its execution plan.
        </div>
      )}

      {output.conditionalRecommendations.length > 0 && (
        <div className="border border-border rounded-md bg-card/95 dark:bg-card/70 p-3">
          <h3 className={cn(PANEL_HEADING_CLS, "mb-2")}>Conditional recommendations</h3>
          <ConditionalRecsList
            recommendations={output.conditionalRecommendations}
            fmt={fmt}
          />
        </div>
      )}
    </section>
  );
}

/**
 * ProgressToFireSection — Section B of the Action Plan page.
 *
 * Pure pass-through: embeds the existing <GoalClosureLab /> component with
 * the same props the /goal-closure-lab page builds. No re-computation.
 */

import * as React from "react";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import type { RiskRadarResult } from "@/lib/riskEngine";
import { GoalClosureLab } from "@/components/GoalClosureLab";

export interface ProgressToFireSectionProps {
  canonicalLedger: DashboardInputs | null;
  riskOutputs: RiskRadarResult | null;
}

export function ProgressToFireSection({ canonicalLedger, riskOutputs }: ProgressToFireSectionProps) {
  return (
    <section data-testid="action-plan-progress-to-fire">
      <header className="mb-3">
        <h2 className="text-base sm:text-lg font-semibold">Progress to FIRE</h2>
        <p className="text-xs text-muted-foreground">
          Same engine output as Goal Closure Lab.
        </p>
      </header>
      <GoalClosureLab
        canonicalLedger={canonicalLedger}
        riskOutputs={riskOutputs}
      />
    </section>
  );
}

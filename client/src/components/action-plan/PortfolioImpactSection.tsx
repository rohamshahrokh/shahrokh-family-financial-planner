/**
 * PortfolioImpactSection — Section C of the Action Plan page.
 *
 * Pure pass-through: embeds the existing <TruePortfolioOptimizer /> with the
 * same props the /portfolio-lab page builds. No re-computation.
 */

import * as React from "react";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import type { RiskRadarResult } from "@/lib/riskEngine";
import { TruePortfolioOptimizer } from "@/components/TruePortfolioOptimizer";

export interface PortfolioImpactSectionProps {
  canonicalLedger: DashboardInputs | null;
  riskOutputs: RiskRadarResult | null;
}

export function PortfolioImpactSection({ canonicalLedger, riskOutputs }: PortfolioImpactSectionProps) {
  return (
    <section data-testid="action-plan-portfolio-impact">
      <header className="mb-3">
        <h2 className="text-base sm:text-lg font-semibold">Portfolio Impact</h2>
        <p className="text-xs text-muted-foreground">
          Same engine output as Portfolio Lab Optimizer.
        </p>
      </header>
      <TruePortfolioOptimizer
        canonicalLedger={canonicalLedger}
        riskOutputs={riskOutputs}
      />
    </section>
  );
}

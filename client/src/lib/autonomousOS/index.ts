/**
 * Autonomous Financial OS — entrypoint
 *
 * Runs all detectors and produces a single `OSReport` per pass. Every finding
 * is intended to be consumed by the Recommendation Engine V2 adapter so all
 * surfaced advice continues to flow through V2 (no parallel advice).
 */

import type { OSFinding, OSInputs, OSReport, OSDetectorId } from './types';
import {
  detectRefinanceOpportunity,
  detectLiquidityStress,
  detectFireDrift,
  detectPropertyReadiness,
  detectDebtPriority,
  detectOpportunityWindows,
  detectConcentrationRisk,
} from './detectors';

const SEVERITY_ORDER = { critical: 0, elevated: 1, watch: 2, info: 3 } as const;

export function runAutonomousOS(inputs: OSInputs | undefined | null): OSReport {
  const i = inputs ?? {};
  const findings: OSFinding[] = [
    ...detectRefinanceOpportunity(i),
    ...detectLiquidityStress(i),
    ...detectFireDrift(i),
    ...detectPropertyReadiness(i),
    ...detectDebtPriority(i),
    ...detectOpportunityWindows(i),
    ...detectConcentrationRisk(i),
  ];
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const detectorsRun: OSDetectorId[] = [
    'refinance', 'liquidity_stress', 'fire_drift', 'property_readiness',
    'debt_priority', 'opportunity_window', 'concentration_risk',
  ];

  const coverageKeys: (keyof OSInputs)[] = [
    'cashOutsideOffset', 'offsetBalance', 'mortgage', 'monthlyIncome',
    'monthlyExpenses', 'mortgageRate', 'etfExpectedReturn', 'depositReadinessPct',
    'fireYearsToTarget', 'mcStressFlag', 'totalNetWorth', 'rateRegime',
  ];
  const present = coverageKeys.reduce((acc, k) => acc + (i[k] != null ? 1 : 0), 0);
  const inputCoverage = present / coverageKeys.length;

  return {
    findings,
    generatedAt: new Date().toISOString(),
    detectorsRun,
    inputCoverage,
  };
}

export * from './types';
export {
  detectRefinanceOpportunity,
  detectLiquidityStress,
  detectFireDrift,
  detectPropertyReadiness,
  detectDebtPriority,
  detectOpportunityWindows,
  detectConcentrationRisk,
};

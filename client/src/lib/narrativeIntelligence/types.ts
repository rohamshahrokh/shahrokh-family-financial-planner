/**
 * Narrative Intelligence V2 — types
 *
 * Decorates Recommendation Engine V2 outputs with a private-wealth CIO memo
 * tone. Explains tradeoffs, opportunity cost, timing, uncertainty, risk
 * asymmetry, downside paths, and what changes a recommendation.
 *
 * Does not introduce new advice — purely a narrative wrapper.
 */

import type { Recommendation } from '../recommendationEngine/types';
import type { PortfolioConstructionResult } from '../portfolioConstruction/types';
import type { LifePlanResult } from '../lifePlanning/types';
import type { TaxIntelligenceResult } from '../taxIntelligence/types';
import type { ExecutionOSResult } from '../executionOS/types';

export interface NarrativeContext {
  recommendation: Recommendation;
  portfolio?: PortfolioConstructionResult | null;
  lifePlan?: LifePlanResult | null;
  tax?: TaxIntelligenceResult | null;
  execution?: ExecutionOSResult | null;
  macroRegime?: string;
  /** 0-1 stress pressure. */
  stressPressure?: number;
}

export interface CIOMemo {
  headline: string;
  rationale: string;        // 1-2 sentences — why this is the move now
  tradeoffs: string[];      // each is a single sentence
  opportunityCost: string;  // single sentence
  timing: string;           // why now / when to reconsider
  uncertainty: string;      // confidence band, what could change
  downsidePath: string;     // worst case sentence
  riskAsymmetry: string;    // payoff vs loss framing
  whatChangesRec: string[];
}

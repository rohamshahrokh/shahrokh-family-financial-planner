/**
 * Best Move ↔ Unified Recommendation bridge.
 *
 * `computeBestMoveV2` (the existing async data-fetcher) returns a
 * `BestMoveResult` plus the `BestMoveLedger` it used. We feed that ledger
 * into the unified engine so the dashboard's executive Best Move card and
 * the Action Centre share one source of truth.
 *
 * The legacy `BestMoveResult` is preserved and returned alongside the
 * unified payload — no existing consumer is broken.
 */

import { computeBestMoveV2, type BestMoveConfig, type BestMoveResult, type BestMoveLedger, type CalcBreakdownStep } from '../bestMoveEngine';
import { computeUnifiedRecommendations } from './engine';
import {
  fromBestMoveLedger, mergeSignals, fromRiskRadar, fromFirePath, fromMonteCarloV5,
  fromBehaviouralProfile, fromAutonomousOS, fromScenarioTree,
  fromPortfolioConstruction, fromLifePlan, fromTaxIntelligence, fromExecutionOS, fromAdaptiveLearning,
  fromDebtPrefsDebts,
} from './adapters';
import type { UnifiedRecommendationResult, UnifiedSignals, Recommendation } from './types';
import { snapshotHistory, type RecommendationChange } from './history';

// We rebuild the ledger from BestMoveResult.ledgerInputs (everything we need
// for unified signals is already in the audit panel inputs).
function ledgerFromInputs(b: BestMoveResult): Partial<BestMoveLedger> {
  const li = b.ledgerInputs;
  return {
    cash: li.cashOutsideOffset,
    offsetBalance: li.offsetBalance,
    mortgage: li.mortgage,
    otherDebts: li.otherDebts,
    monthlyIncome: li.monthlyIncome,
    monthlyExpenses: li.monthlyExpenses,
    emergencyBuffer: li.emergencyBuffer,
    rohamGrossAnnual: li.monthlyIncome * 12,
    superContribAnnual: 0,
    etfExpectedReturn: 0.095,
    cryptoExpectedReturn: 0.20,
    mortgageRate: 0.0625,
    ppor: 0,
    depositPowerResult: {
      totalDepositPower: li.depositPower,
      readinessPct: li.depositReadinessPct,
      isReady: li.depositReadinessPct >= 100,
      totalUsableEquity: 0,
      deployableCash: 0,
      fundingSources: [],
    },
  };
}

export interface UnifiedBestMoveResult {
  /** Legacy Best Move result for backward-compat UI bits. */
  legacy: BestMoveResult;
  /** Unified recommendation result — shared across surfaces. */
  unified: UnifiedRecommendationResult;
  /** What changed since previous run (in-memory only). */
  changes: RecommendationChange[];
}

/**
 * Run the existing Best Move fetcher, then layer in the unified engine.
 * Optional signal overlays (risk, fire, MC) merge in if available.
 */
export async function computeUnifiedBestMove(args: {
  cfg?: BestMoveConfig;
  riskRadar?: any;
  firePath?: any;
  monteCarloV5?: any;
  preference?: UnifiedSignals['preference'];
  /** Phase 5 — Behavioural profile (BehaviouralProfile) */
  behaviouralProfile?: any;
  /** Phase 5 — Autonomous OS report (OSReport) */
  autonomousOS?: any;
  /** Phase 5 — Scenario tree (ScenarioTreeResult) */
  scenarioTree?: any;
  /** Phase 6 — Portfolio construction result */
  portfolio?: any;
  /** Phase 6 — Life plan result */
  lifePlan?: any;
  /** Phase 6 — Tax intelligence result */
  taxIntelligence?: any;
  /** Phase 6 — Execution OS result */
  executionOS?: any;
  /** Phase 6 — Adaptive learning adjustments */
  adaptive?: any;
  /**
   * Classified debt list from `app_settings.debt_prefs.debts` (preserved
   * verbatim through `fromDebtPrefsDebts`). When supplied this is the single
   * source of truth for debt advice — overrides the legacy
   * `otherDebts × personalDebtRate` heuristic.
   */
  debtPrefsDebts?: any[];
} = {}): Promise<UnifiedBestMoveResult> {
  const legacy = await computeBestMoveV2(args.cfg ?? {});
  const partial = ledgerFromInputs(legacy);
  const baseSignals = fromBestMoveLedger(partial as BestMoveLedger);

  // If the caller didn't pass an explicit `debtPrefsDebts`, fetch it from
  // app_settings so every consumer (Best Move, FIRE, Risk, Action Centre,
  // Executive Dashboard, Family Office, Financial OS) automatically reads
  // the user's classified debt portfolio. Failures are tolerated — the
  // engine simply falls back to the legacy `otherDebts` signal classified
  // as `unknown_apr_debt` (NOT high APR).
  let debtPrefsDebts = args.debtPrefsDebts;
  if (!debtPrefsDebts) {
    try {
      const { apiRequest } = await import('../queryClient');
      const res = await apiRequest('GET', '/api/app-settings');
      const settings = await res.json();
      if (settings?.debt_prefs?.debts && Array.isArray(settings.debt_prefs.debts)) {
        debtPrefsDebts = settings.debt_prefs.debts;
      }
    } catch {
      // ignore — legacy fallback path handles missing portfolio
    }
  }
  const signals = mergeSignals(
    baseSignals,
    fromRiskRadar(args.riskRadar),
    fromFirePath(args.firePath),
    fromMonteCarloV5(args.monteCarloV5),
    args.preference ? { preference: args.preference } : {},
    fromBehaviouralProfile(args.behaviouralProfile),
    fromAutonomousOS(args.autonomousOS),
    fromScenarioTree(args.scenarioTree),
    fromPortfolioConstruction(args.portfolio),
    fromLifePlan(args.lifePlan),
    fromTaxIntelligence(args.taxIntelligence),
    fromExecutionOS(args.executionOS),
    fromAdaptiveLearning(args.adaptive),
    fromDebtPrefsDebts(debtPrefsDebts),
  );
  const unified = computeUnifiedRecommendations(signals);
  const changes = snapshotHistory(unified);
  return { legacy, unified, changes };
}

// ─── Helpers to bridge legacy → unified for surfaces that only have one ──────
export function legacyBestMoveToRecommendation(legacy: BestMoveResult): Recommendation {
  const best = legacy.best;
  return {
    id: best.id,
    title: best.action,
    actionType: 'hold_cash_offset', // legacy fallback type
    pillar: 'maintain_investing_discipline',
    priorityRank: 1,
    confidenceScore: best.data_reliable ? 0.85 : 0.6,
    urgency: 'this_quarter',
    riskLevel: best.risk,
    expectedFinancialImpact: { annualDollar: best.annual_benefit, label: best.benefit_label, confidence: best.data_reliable ? 0.85 : 0.6 },
    implementationSteps: [{ step: best.action }],
    whatCouldChangeRecommendation: ['Snapshot changes', 'New high-interest debt'],
    alternativeOptions: legacy.alternatives.map(a => ({
      title: a.action,
      whyAlternative: a.reason,
      tradeoff: a.benefit_label,
    })),
    reviewTrigger: { condition: 'Refresh when snapshot changes' },
    sourceSignalsUsed: ['snapshot', 'cash_offset'],
    surfaces: ['best_move', 'action_centre'],
    reasoning: best.reason,
    benefitLabel: best.benefit_label,
    cta: { label: best.cta, route: best.cta_route },
  };
}

// Convenience: shape the calc breakdown from legacy for UI re-use.
export function legacyCalcBreakdown(legacy: BestMoveResult): CalcBreakdownStep[] | undefined {
  return legacy.best.calcBreakdown;
}

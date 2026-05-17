/**
 * Adapters — convert outputs from existing engines into the canonical
 * UnifiedSignals consumed by the unified recommendation engine.
 *
 * Each adapter degrades gracefully when its source is unwired — it sets
 * only the fields it can compute.
 */

import type { UnifiedSignals } from './types';
import type { BestMoveLedger } from '../bestMoveEngine';

// ─── Best Move ledger → unified signals ──────────────────────────────────────
export function fromBestMoveLedger(ledger: BestMoveLedger): UnifiedSignals {
  const surplus = ledger.monthlyIncome - ledger.monthlyExpenses;
  const SUPER_CAP = 30_000;
  return {
    cashOutsideOffset: ledger.cash,
    offsetBalance: ledger.offsetBalance,
    mortgage: ledger.mortgage,
    otherDebts: ledger.otherDebts,
    ppor: ledger.ppor,
    monthlyIncome: ledger.monthlyIncome,
    monthlyExpenses: ledger.monthlyExpenses,
    monthlySurplus: surplus,
    rohamGrossAnnual: ledger.rohamGrossAnnual,
    superContribAnnualised: ledger.superContribAnnual,
    superCapRemaining: Math.max(0, SUPER_CAP - (ledger.superContribAnnual ?? 0)),
    emergencyBufferTarget: ledger.emergencyBuffer,
    upcomingBills12mo: 0, // filled below if billsRaw available
    depositPower: ledger.depositPowerResult?.totalDepositPower,
    depositReadinessPct: ledger.depositPowerResult?.readinessPct,
    serviceabilityHeadroomMonthly: surplus,
    postPurchaseBufferMonths: ledger.monthlyExpenses > 0
      ? (ledger.cash + ledger.offsetBalance) / ledger.monthlyExpenses
      : undefined,
    etfExpectedReturn: ledger.etfExpectedReturn,
    cryptoExpectedReturn: ledger.cryptoExpectedReturn,
    mortgageRate: ledger.mortgageRate,
    // personalDebtRate intentionally undefined. The unified engine prefers the
    // classified `debtPortfolio` (set elsewhere with real per-debt APRs); when
    // absent, an undefined personalDebtRate means "unknown" — and the engine
    // must NOT default to 17% the way the legacy code did.
    marginalTaxRate: ledger.rohamGrossAnnual > 135_000 ? 0.47
                   : ledger.rohamGrossAnnual > 45_000  ? 0.325
                   : 0.19,
    cashHisaReturn: 0.05,
  };
}

// ─── Risk Radar output → signal overlay ──────────────────────────────────────
export function fromRiskRadar(r: any): Partial<UnifiedSignals> {
  if (!r) return {};
  const cats: any[] = Array.isArray(r.categories) ? r.categories : [];
  const find = (id: string) => cats.find((c: any) => c.id === id);
  const top = Array.isArray(r.top_risks) ? r.top_risks : [];
  return {
    riskOverallScore: r.overall_score,
    riskLiquidityScore: find('cashflow')?.score,
    riskDebtScore: find('debt')?.score,
    riskCashflowScore: find('cashflow')?.score,
    topRiskFactor: top[0] ? { id: top[0].id, label: top[0].label, action: top[0].action } : undefined,
    secondRiskFactor: top[1] ? { id: top[1].id, label: top[1].label, action: top[1].action } : undefined,
  };
}

// ─── FIRE Path output → signal overlay ───────────────────────────────────────
export function fromFirePath(r: any): Partial<UnifiedSignals> {
  if (!r) return {};
  const best = Array.isArray(r.scenarios) ? r.scenarios.find((s: any) => s.id === r.best_scenario) : null;
  return {
    fireYearsToTarget: best?.years_to_fire,
    fireProgressPct: r.current_progress_pct,
    fireMonthlyInvestmentRequired: best?.annual_invest ? Math.round(best.annual_invest / 12) : undefined,
  };
}

// ─── Monte Carlo V5 / canonical MC output → signal overlay ──────────────────
// Accepts either:
//   - V5 advisor-intelligence shape: { survival_probability, stress_flag, ... }
//   - Canonical MonteCarloResult shape (forecastStore): { prob_ff (0-100%),
//     prob_neg_cf (0-100%), prob_cash_shortfall (0-100%), ... }
export function fromMonteCarloV5(r: any): Partial<UnifiedSignals> {
  if (!r) return {};
  // Survival probability — normalise to 0-1.
  let surv: number | undefined =
    r.survival_probability ?? r.survivalProbability ?? r.fire?.survival_probability;
  if (surv == null && typeof r.prob_ff === 'number') {
    surv = r.prob_ff > 1 ? r.prob_ff / 100 : r.prob_ff;
  }

  // Stress flag — explicit overrides, else derived from prob_neg_cf / prob_cash_shortfall.
  let stress: 'none' | 'moderate' | 'severe' | undefined =
    r.stress_flag ?? r.stressFlag;
  if (!stress) {
    const negCf = typeof r.prob_neg_cf === 'number'
      ? (r.prob_neg_cf > 1 ? r.prob_neg_cf / 100 : r.prob_neg_cf)
      : 0;
    const cashShort = typeof r.prob_cash_shortfall === 'number'
      ? (r.prob_cash_shortfall > 1 ? r.prob_cash_shortfall / 100 : r.prob_cash_shortfall)
      : 0;
    const worst = Math.max(negCf, cashShort, surv != null ? 1 - surv : 0);
    if (worst >= 0.4) stress = 'severe';
    else if (worst >= 0.2) stress = 'moderate';
    else if (worst > 0)    stress = 'none';
  }

  // Shortfall severity — accept explicit field; else proxy from prob_cash_shortfall.
  let severity: number | undefined = r.shortfall_severity;
  if (severity == null && typeof r.prob_cash_shortfall === 'number') {
    severity = r.prob_cash_shortfall > 1 ? r.prob_cash_shortfall / 100 : r.prob_cash_shortfall;
  }

  // Rate-stress active — explicit boolean, else infer from biggest_risk_driver text.
  const rateStress = r.rate_stress_active === true
    || (typeof r.biggest_risk_driver === 'string' && /rate|interest/i.test(r.biggest_risk_driver));

  return {
    mcSurvivalProbability: typeof surv === 'number' ? surv : undefined,
    mcStressFlag: stress,
    mcRateStressActive: rateStress || undefined,
    mcShortfallSeverity: severity,
  };
}

// ─── Decision Engine output → signal overlay ─────────────────────────────────
export function fromDecisionEngine(r: any): Partial<UnifiedSignals> {
  if (!r) return {};
  return {
    decisionTopAction: r.top_action ?? r.recommendation?.title,
    decisionConfidence: r.confidence ?? r.recommendation?.confidence,
  };
}

// ─── Behavioural Profile → signal overlay (Phase 5) ──────────────────────────
export function fromBehaviouralProfile(p: any): Partial<UnifiedSignals> {
  if (!p) return {};
  return {
    behaviouralProfile: {
      primary: p.primary,
      secondary: p.secondary,
      primaryLabel: p.primaryLabel,
      scores: p.scores,
      confidence: p.confidence,
    },
  };
}

// ─── Autonomous OS → signal overlay (Phase 5) ────────────────────────────────
// Maps OSReport findings into UnifiedSignals.osFindings (derived signals
// only — they never produce a parallel advice surface).
export function fromAutonomousOS(report: any): Partial<UnifiedSignals> {
  if (!report || !Array.isArray(report.findings)) return {};
  return {
    osFindings: report.findings.map((f: any) => ({
      id: f.id,
      detector: f.detector,
      severity: f.severity,
      actionTypeHint: f?.hints?.actionType,
      pillarHint: f?.hints?.pillar,
      confidence: f.confidence,
    })),
  };
}

// ─── Scenario Tree → signal overlay (Phase 5) ────────────────────────────────
export function fromScenarioTree(tree: any): Partial<UnifiedSignals> {
  if (!tree) return {};
  const w = tree.baseProbabilityWeighted ?? {};
  const dom = Array.isArray(tree.branches) && tree.branches.length
    ? tree.branches[0]?.id
    : undefined;
  return {
    scenarioContext: {
      probWeightedInsolvencyRisk: w.insolvencyRisk,
      probWeightedLiquidityRisk: w.liquidityRisk,
      probWeightedFireYear: w.fireYear,
      dominantRegime: dom,
    },
  };
}

// ─── Phase 6 — Portfolio Construction → signal overlay ──────────────────────
export function fromPortfolioConstruction(r: any): Partial<UnifiedSignals> {
  if (!r) return {};
  const tilts = r.tilts ?? {};
  return {
    portfolioTilts: {
      etfPush: tilts.etfPush,
      propertyPush: tilts.propertyPush,
      cashHold: tilts.cashHold,
      debtPay: tilts.debtPay,
      superPush: tilts.superPush,
      cryptoTrim: tilts.cryptoTrim,
      modelLabel: r.modelLabel,
      liquidityScore: r.metrics?.liquidityScore,
      taxEfficiencyScore: r.metrics?.taxEfficiencyScore,
    },
  };
}

// ─── Phase 6 — Life Planning → signal overlay ────────────────────────────────
export function fromLifePlan(r: any): Partial<UnifiedSignals> {
  if (!r || !r.summary) return {};
  return {
    lifeContext: {
      fireYearDelayEstimate: r.summary.fireYearDelayEstimate,
      averageAnnualDrag: r.summary.averageAnnualDrag,
      stressProbability: r.summary.stressProbability,
      liquidityStressMonths: r.summary.liquidityStressMonths,
      upcomingEventCount: Array.isArray(r.events) ? r.events.length : undefined,
    },
  };
}

// ─── Phase 6 — Tax Intelligence → signal overlay ────────────────────────────
export function fromTaxIntelligence(r: any): Partial<UnifiedSignals> {
  if (!r) return {};
  return {
    taxContext: {
      totalEstimatedSaving: r.totalEstimatedSaving,
      longTermTaxDragPct: r.longTermTaxDragPct,
      fireWithdrawalEfficiencyScore: r.fireWithdrawalEfficiencyScore,
      topStrategyId: r.topStrategies?.[0]?.id,
    },
  };
}

// ─── Phase 6 — Execution OS → signal overlay ─────────────────────────────────
export function fromExecutionOS(r: any): Partial<UnifiedSignals> {
  if (!r) return {};
  return {
    executionContext: {
      overallReadinessPct: r.overallReadinessPct,
      topBlocker: r.topBlockers?.[0],
    },
  };
}

// ─── Phase 6 — Adaptive Learning adjustments → signal overlay ────────────────
export function fromAdaptiveLearning(adj: any): Partial<UnifiedSignals> {
  if (!adj) return {};
  return {
    adaptive: {
      rankingMultiplierByActionType: adj.rankingMultiplierByActionType,
      urgencyMultiplier: adj.urgencyMultiplier,
      riskScoreTilt: adj.riskScoreTilt,
      pillarWeights: adj.pillarWeights,
      monteCarloPriorityMultiplier: adj.monteCarloPriorityMultiplier,
      explanation: adj.explanation,
    },
  };
}

// ─── Debt prefs (app_settings.debt_prefs.debts) → UnifiedSignals.debtPortfolio
/**
 * Convert the user-supplied detailed debt list (persisted in
 * `app_settings.debt_prefs.debts`) into the canonical `debtPortfolio`
 * consumed by the recommendation engine.
 *
 * The UI captures `rate` in PERCENT units (e.g. 17 for 17%, 0 for 0%). We
 * preserve those values verbatim — including 0 and blank/missing — so the
 * classifier can decide whether the debt is interest-free, unknown, etc.
 */
export function fromDebtPrefsDebts(rawDebts: any[] | undefined | null): Partial<UnifiedSignals> {
  if (!Array.isArray(rawDebts) || rawDebts.length === 0) return {};
  const debtPortfolio = rawDebts
    .map((d, i) => {
      const balance = typeof d.balance === 'number' ? d.balance : parseFloat(String(d.balance ?? '0')) || 0;
      // Preserve null/undefined/'' as null (unknown). Preserve 0 as 0.
      let ratePct: number | null | undefined;
      if (d.rate === null || d.rate === undefined) {
        ratePct = d.rate as any;
      } else if (typeof d.rate === 'string') {
        const t = d.rate.trim();
        ratePct = t === '' ? null : (Number.isFinite(parseFloat(t)) ? parseFloat(t) : null);
      } else if (typeof d.rate === 'number') {
        ratePct = Number.isFinite(d.rate) ? d.rate : null;
      } else {
        ratePct = null;
      }
      return {
        id: String(d.id ?? `debt_${i}`),
        name: String(d.name ?? 'Debt'),
        balance,
        ratePct,
        minPaymentMonthly: typeof d.minPayment === 'number' ? d.minPayment : undefined,
        type: d.type,
        expiryDateISO: d.expiryDateISO,
        taxDeductible: d.taxDeductible === true,
      };
    })
    .filter(d => d.balance > 0);
  return debtPortfolio.length > 0 ? { debtPortfolio } : {};
}

// ─── Merge helper ────────────────────────────────────────────────────────────
export function mergeSignals(...parts: Array<Partial<UnifiedSignals> | undefined>): UnifiedSignals {
  const merged: UnifiedSignals = {};
  for (const p of parts) {
    if (!p) continue;
    for (const [k, v] of Object.entries(p)) {
      if (v !== undefined && v !== null) {
        (merged as any)[k] = v;
      }
    }
  }
  return merged;
}

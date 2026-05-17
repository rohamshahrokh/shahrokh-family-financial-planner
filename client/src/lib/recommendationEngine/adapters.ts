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
    personalDebtRate: 0.17,
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

// ─── Monte Carlo V5 output → signal overlay ──────────────────────────────────
export function fromMonteCarloV5(r: any): Partial<UnifiedSignals> {
  if (!r) return {};
  const surv = r.survival_probability ?? r.survivalProbability ?? r.fire?.survival_probability;
  const stress = r.stress_flag ?? r.stressFlag ?? (surv != null
    ? (surv < 0.6 ? 'severe' : surv < 0.8 ? 'moderate' : 'none')
    : undefined);
  return {
    mcSurvivalProbability: typeof surv === 'number' ? surv : undefined,
    mcStressFlag: stress,
    mcRateStressActive: r.rate_stress_active === true,
    mcShortfallSeverity: r.shortfall_severity,
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

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

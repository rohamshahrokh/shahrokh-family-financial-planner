/**
 * FamilyOfficeMode.tsx — Phase 6 premium dashboard panel.
 *
 * Combines Portfolio Construction, Life Planning Timeline, Tax Intelligence,
 * Execution OS, Adaptive Learning narrative, and a CIO memo. Decorates —
 * never replaces — Recommendation Engine V2 outputs.
 *
 * Calm executive aesthetic — no gradients, no gamification. All inputs
 * derived from in-memory canonical sources (no DB writes).
 */

import { useMemo, useState } from 'react';
import { Briefcase, Compass, Coins, Map as MapIcon, Brain, FileText, ShieldCheck, Activity } from 'lucide-react';
import { SectionExplainer } from '@/components/intelligence/SectionExplainer';
import { useForecastStore } from '@/lib/forecastStore';
import { buildPortfolio, type PortfolioConstructionResult, type AssetClass } from '@/lib/portfolioConstruction';
import {
  modelLifePlan,
  instanceFromTemplate,
  listLifeEventTemplates,
  type LifeEventInstance,
  type LifePlanResult,
} from '@/lib/lifePlanning';
import { analyseTaxStrategies, type TaxIntelligenceResult } from '@/lib/taxIntelligence';
import { buildExecutionPlan, type ExecutionOSResult } from '@/lib/executionOS';
import {
  emptyAdaptiveState,
  applyAdaptiveLearning,
  type AdaptiveLearningResult,
} from '@/lib/adaptiveLearning';
import { buildCIOParagraph } from '@/lib/narrativeIntelligence';
import {
  computeUnifiedBestMove,
  type UnifiedBestMoveResult,
} from '@/lib/recommendationEngine';
import { useEffect } from 'react';

function fmtMoney(n?: number): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function pct(n?: number, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

const ASSET_LABELS: Record<AssetClass, string> = {
  cash: 'Cash',
  offset: 'Offset',
  debtPaydown: 'Debt Paydown',
  etf: 'ETF',
  crypto: 'Crypto',
  super: 'Super',
  ppor: 'PPOR',
  investmentProperty: 'Investment Property',
};

const driftBadge: Record<string, string> = {
  none: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
  mild: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  notable: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  urgent: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};

export default function FamilyOfficeMode() {
  const liveMC = useForecastStore((s) => s.monteCarloResult);
  const [unified, setUnified] = useState<UnifiedBestMoveResult | null>(null);

  // Default life events — small starter set so the Life Timeline has content.
  const [events, setEvents] = useState<LifeEventInstance[]>([
    instanceFromTemplate('child_birth', '2027-06-01'),
    instanceFromTemplate('school_costs', '2030-02-01'),
    instanceFromTemplate('career_upgrade', '2026-09-01'),
  ]);

  // Portfolio — derived from MC + sensible defaults until full ledger wiring lands.
  const portfolio: PortfolioConstructionResult = useMemo(() => {
    const stressP = liveMC ? Math.max(
      liveMC.prob_neg_cf ? liveMC.prob_neg_cf / 100 : 0,
      liveMC.prob_cash_shortfall ? liveMC.prob_cash_shortfall / 100 : 0,
    ) : 0;
    const survival = liveMC && typeof liveMC.prob_ff === 'number' ? liveMC.prob_ff / 100 : 0.85;
    return buildPortfolio({
      riskTolerance: 0.2,
      leverageTolerance: 0.55,
      liquidityNeed: 0.4,
      drawdownPanicThreshold: 0.55,
      propertyBias: 0.2,
      etfBias: 0.5,
      cryptoBias: 0.0,
      fireUrgency: 0.6,
      taxOptimisation: 0.5,
      mcStressPressure: stressP,
      mcSurvivalProbability: survival,
      lifeStage: 'accumulator',
      incomeVolatility: 0.3,
      macroRegime: 'late_cycle',
      marginalTaxRate: 0.37,
      mortgageRate: 0.0625,
      personalDebtRate: 0.17,
      superCapRemaining: 12_000,
      emergencyBufferTarget: 30_000,
    });
  }, [liveMC]);

  // Life plan
  const lifePlan: LifePlanResult = useMemo(() => modelLifePlan({
    baseYear: new Date().getFullYear(),
    horizonYears: 35,
    monthlySurplus: 4500,
    emergencyBuffer: 30000,
    fireYearsToTarget: 14,
    marginalTaxRate: 0.37,
    events,
  }), [events]);

  // Tax intelligence
  const tax: TaxIntelligenceResult = useMemo(() => analyseTaxStrategies({
    grossAnnual: 170_000,
    spouseGrossAnnual: 60_000,
    marginalTaxRate: 0.37,
    spouseMarginalTaxRate: 0.325,
    superContribAnnual: 18_000,
    superCapRemaining: 12_000,
    ipCashflow: -3_500,
    ipLoanInterestAnnual: 22_000,
    unrealisedEquityGains: 12_000,
    holdingYearsEquity: 0.7,
    offsetBalance: 80_000,
    mortgage: 650_000,
    mortgageRate: 0.0625,
    helpDebt: 0,
    hasPrivateHealth: true,
    hasDependants: true,
    hasInvestmentProperty: true,
    pporEquity: 300_000,
    equitiesOutsideSuper: 120_000,
    hasFamilyTrust: false,
    hasBucketCompany: false,
    drawdownPhase: false,
    superBalance: 250_000,
  }), []);

  // Execution OS
  const execution: ExecutionOSResult = useMemo(() => buildExecutionPlan({
    cashOutsideOffset: 12_000,
    offsetBalance: 80_000,
    mortgage: 650_000,
    otherDebts: 4_000,
    monthlyIncome: 19_000,
    monthlyExpenses: 13_500,
    monthlySurplus: 5_500,
    emergencyBufferTarget: 40_000,
    depositPower: 165_000,
    depositReadinessPct: 72,
    mcStressFlag: liveMC?.prob_neg_cf && liveMC.prob_neg_cf > 30 ? 'moderate' : 'none',
    fireYearsToTarget: 14,
    superCapRemaining: 12_000,
    marginalTaxRate: 0.37,
    propertyBias: 0.3,
    fireUrgency: 0.6,
    macroRegime: 'late_cycle',
    rebalanceNeeded: portfolio.rebalanceMoves.length > 0,
    refinanceOpportunity: false,
  }), [liveMC, portfolio.rebalanceMoves.length]);

  // Adaptive — baseline state for now (no persistence). UI can be extended later.
  const adaptive: AdaptiveLearningResult = useMemo(() => applyAdaptiveLearning(emptyAdaptiveState(), []), []);

  // Compute unified recommendation with all Phase 6 overlays.
  useEffect(() => {
    let cancelled = false;
    computeUnifiedBestMove({
      monteCarloV5: liveMC,
      portfolio,
      lifePlan,
      taxIntelligence: tax,
      executionOS: execution,
      adaptive: adaptive.adjustments,
    })
      .then(r => { if (!cancelled) setUnified(r); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [liveMC, portfolio, lifePlan, tax, execution, adaptive.adjustments]);

  const cioMemo = useMemo(() => {
    if (!unified) return null;
    return buildCIOParagraph({
      recommendation: unified.unified.bestMove,
      portfolio,
      lifePlan,
      tax,
      execution,
      macroRegime: 'late_cycle',
      stressPressure: liveMC?.prob_neg_cf ? liveMC.prob_neg_cf / 100 : 0,
    });
  }, [unified, portfolio, lifePlan, tax, execution, liveMC]);

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-900/40 p-4 sm:p-6 backdrop-blur-sm">
      <div className="flex items-center gap-3 mb-4">
        <Briefcase className="w-5 h-5 text-emerald-300" />
        <h2 className="text-lg sm:text-xl font-semibold text-slate-100">Family Office Mode</h2>
        <SectionExplainer metricId="family-office-mode" />
        <span className="ml-auto text-xs text-slate-400">Phase 6 — Intelligence Layer</span>
      </div>

      {/* CIO Memo */}
      {cioMemo && (
        <div className="mb-5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 sm:p-4">
          <div className="flex items-center gap-2 text-xs text-emerald-300 mb-1">
            <FileText className="w-3.5 h-3.5" /> CIO memo
          </div>
          <p className="text-sm leading-relaxed text-slate-200">{cioMemo}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Portfolio Construction */}
        <section className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-3 sm:p-4">
          <header className="flex items-center gap-2 mb-3">
            <Compass className="w-4 h-4 text-sky-300" />
            <h3 className="font-medium text-slate-100 text-sm sm:text-base">Portfolio Construction</h3>
            <SectionExplainer metricId="portfolio-construction" />
            <span className="ml-auto text-xs text-slate-400">{portfolio.modelLabel}</span>
          </header>
          <p className="text-xs text-slate-400 mb-3">{portfolio.modelRationale}</p>
          <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
            <Metric label="Expected return" value={pct(portfolio.metrics.expectedReturn, 1)} />
            <Metric label="Volatility" value={pct(portfolio.metrics.expectedVol, 1)} />
            <Metric label="Liquidity score" value={`${Math.round(portfolio.metrics.liquidityScore)}/100`} />
            <Metric label="Tax efficiency" value={`${Math.round(portfolio.metrics.taxEfficiencyScore)}/100`} />
          </div>
          <table className="w-full text-xs">
            <thead className="text-slate-400">
              <tr><th className="text-left">Asset</th><th>Target</th><th>Current</th><th>Drift</th></tr>
            </thead>
            <tbody>
              {portfolio.targets.map(t => (
                <tr key={t.asset} className="border-t border-slate-700/30">
                  <td className="py-1 text-slate-300">{ASSET_LABELS[t.asset]}</td>
                  <td className="text-center text-slate-200">{pct(t.target, 0)}</td>
                  <td className="text-center text-slate-400">{pct(t.current, 0)}</td>
                  <td className="text-center">
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] ${driftBadge[t.driftBand]}`}>
                      {(t.drift * 100).toFixed(1)}pp
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {portfolio.rebalanceMoves.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-slate-400 mb-1">Suggested moves</div>
              <ul className="space-y-1 text-xs text-slate-300">
                {portfolio.rebalanceMoves.slice(0, 3).map((m, i) => (
                  <li key={i}>• {ASSET_LABELS[m.from]} → {ASSET_LABELS[m.to]}: {fmtMoney(m.amount)}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Life Timeline */}
        <section className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-3 sm:p-4">
          <header className="flex items-center gap-2 mb-3">
            <MapIcon className="w-4 h-4 text-violet-300" />
            <h3 className="font-medium text-slate-100 text-sm sm:text-base">Life Timeline Planner</h3>
            <span className="ml-auto text-xs text-slate-400">{lifePlan.events.length} event(s)</span>
          </header>
          <p className="text-xs text-slate-400 mb-3">{lifePlan.summary.narrative}</p>
          <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
            <Metric label="FIRE delay" value={`${lifePlan.summary.fireYearDelayEstimate.toFixed(1)} yr`} />
            <Metric label="Lifetime net cost" value={fmtMoney(lifePlan.summary.totalLifetimeNetCost)} />
            <Metric label="Liquidity stress" value={`${lifePlan.summary.liquidityStressMonths} mo`} />
            <Metric label="Stress probability" value={pct(lifePlan.summary.stressProbability, 0)} />
          </div>
          <LifeTimelineGrid plan={lifePlan} />
          <details className="mt-3 text-xs text-slate-300">
            <summary className="cursor-pointer text-slate-400 hover:text-slate-200">Add an event</summary>
            <div className="mt-2 max-h-40 overflow-y-auto pr-1">
              <ul className="grid grid-cols-2 gap-1">
                {listLifeEventTemplates().map(t => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="w-full text-left text-[11px] px-2 py-1 rounded border border-slate-700/40 hover:bg-slate-800/60"
                      onClick={() => setEvents(prev => [
                        ...prev,
                        instanceFromTemplate(t.id, `${new Date().getFullYear() + 1}-01-01`),
                      ])}
                    >+ {t.label}</button>
                  </li>
                ))}
              </ul>
            </div>
          </details>
          {events.length > 0 && (
            <div className="mt-3 text-xs">
              <div className="text-slate-400 mb-1">Active events</div>
              <ul className="space-y-1">
                {events.map((e, idx) => (
                  <li key={e.id} className="flex items-center gap-2">
                    <span className="text-slate-300 flex-1">{e.templateId.replace(/_/g, ' ')} • {e.startISO.slice(0, 7)}</span>
                    <button
                      type="button"
                      className="text-[10px] text-slate-500 hover:text-rose-300"
                      onClick={() => setEvents(prev => prev.filter((_, i) => i !== idx))}
                    >remove</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Tax Intelligence */}
        <section className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-3 sm:p-4">
          <header className="flex items-center gap-2 mb-3">
            <Coins className="w-4 h-4 text-amber-300" />
            <h3 className="font-medium text-slate-100 text-sm sm:text-base">Tax Intelligence (AU)</h3>
            <SectionExplainer metricId="tax-efficiency" />
            <span className="ml-auto text-xs text-slate-400">Planning estimates</span>
          </header>
          <p className="text-xs text-slate-400 mb-3">{tax.narrative}</p>
          <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
            <Metric label="Estimated saving" value={fmtMoney(tax.totalEstimatedSaving)} />
            <Metric label="FIRE withdrawal fit" value={`${Math.round(tax.fireWithdrawalEfficiencyScore)}/100`} />
          </div>
          <ul className="space-y-1.5 text-xs">
            {tax.topStrategies.slice(0, 5).map(s => (
              <li key={s.id} className="rounded border border-slate-700/30 px-2 py-1.5 bg-slate-900/40">
                <div className="flex items-center gap-2">
                  <span className="text-slate-200 flex-1 font-medium">{s.label}</span>
                  <span className="text-emerald-300">{fmtMoney(s.estimatedAnnualSaving)}/yr</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{s.reasoning}</div>
                {s.recommendProfessionalAdvice && (
                  <div className="text-[10px] text-amber-300/80 mt-0.5">Confirm with a registered tax agent.</div>
                )}
              </li>
            ))}
          </ul>
          {tax.medicareLevySurchargeWarning && (
            <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
              Medicare Levy Surcharge applies — basic hospital cover is typically cheaper than the levy.
            </div>
          )}
        </section>

        {/* Execution OS */}
        <section className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-3 sm:p-4">
          <header className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-emerald-300" />
            <h3 className="font-medium text-slate-100 text-sm sm:text-base">Execution OS</h3>
            <SectionExplainer metricId="execution-os" />
            <span className="ml-auto text-xs text-slate-400">Readiness {Math.round(execution.overallReadinessPct)}/100</span>
          </header>
          <p className="text-xs text-slate-400 mb-3">{execution.narrative}</p>
          <ul className="space-y-2 text-xs">
            {execution.roadmaps.slice(0, 5).map(r => (
              <li key={r.id} className="rounded border border-slate-700/30 px-2 py-1.5 bg-slate-900/40">
                <div className="flex items-center gap-2">
                  <span className="text-slate-200 flex-1 font-medium">{r.label}</span>
                  <span className="text-slate-300">{Math.round(r.readinessPct)}%</span>
                </div>
                <div className="mt-1 h-1 w-full bg-slate-800 rounded overflow-hidden">
                  <div className="h-full bg-emerald-500/60" style={{ width: `${Math.round(r.readinessPct)}%` }} />
                </div>
                {r.activeBlockers.length > 0 && (
                  <div className="mt-1 text-[10px] text-amber-300/80">Blocker: {r.activeBlockers[0]}</div>
                )}
              </li>
            ))}
          </ul>
          {execution.monthlyMissions.length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-slate-400 mb-1">Next monthly missions</div>
              <ul className="space-y-0.5 text-[11px] text-slate-300">
                {execution.monthlyMissions.slice(0, 4).map(m => (
                  <li key={`${m.month}-${m.label}`}>
                    {m.month} — {m.label}{m.amount ? ` · ${fmtMoney(m.amount)}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Adaptive Learning */}
        <section className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-3 sm:p-4 lg:col-span-2">
          <header className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-fuchsia-300" />
            <h3 className="font-medium text-slate-100 text-sm sm:text-base">Adaptive Learning</h3>
            <span className="ml-auto text-xs text-slate-400">Deterministic, in-memory</span>
          </header>
          <p className="text-xs text-slate-300">{adaptive.adjustments.explanation}</p>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <Metric label="Urgency multiplier" value={adaptive.adjustments.urgencyMultiplier.toFixed(2)} />
            <Metric label="Risk score tilt" value={adaptive.adjustments.riskScoreTilt.toFixed(2)} />
            <Metric label="MC priority" value={adaptive.adjustments.monteCarloPriorityMultiplier.toFixed(2)} />
            <Metric label="Tracked events" value={`${adaptive.state.events.length}`} />
          </div>
        </section>

        {/* Strategic priority recap */}
        {unified && (
          <section className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-3 sm:p-4 lg:col-span-2">
            <header className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-rose-300" />
              <h3 className="font-medium text-slate-100 text-sm sm:text-base">Strategic Priority Stack</h3>
              <SectionExplainer metricId="strategic-priorities" />
              <span className="ml-auto text-xs text-slate-400">From Recommendation Engine V2</span>
            </header>
            <ol className="space-y-2 text-xs">
              {unified.unified.topPriorities.map(p => (
                <li key={p.id} className="rounded border border-slate-700/30 px-2 py-1.5 bg-slate-900/40">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-[10px]">#{p.priorityRank}</span>
                    <span className="text-slate-100 flex-1 font-medium">{p.title}</span>
                    {p.benefitLabel && <span className="text-emerald-300 text-[11px]">{p.benefitLabel}</span>}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{p.reasoning}</div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-700/30 bg-slate-900/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-slate-100 text-sm font-medium">{value}</div>
    </div>
  );
}

function LifeTimelineGrid({ plan }: { plan: LifePlanResult }) {
  const max = Math.max(1, ...plan.yearly.map(y => Math.abs(y.cashflowDelta)));
  const visible = plan.yearly.slice(0, 24); // 24 years for compactness
  return (
    <div className="grid grid-cols-12 gap-0.5">
      {visible.map(row => {
        const sign = row.cashflowDelta < 0 ? -1 : 1;
        const h = Math.max(2, Math.round(Math.abs(row.cashflowDelta) / max * 36));
        const color = row.cashflowDelta < 0 ? 'bg-rose-500/60' : row.cashflowDelta > 0 ? 'bg-emerald-500/60' : 'bg-slate-700/50';
        return (
          <div key={row.year} className="flex flex-col items-center" title={`${row.year}: ${Math.round(row.cashflowDelta).toLocaleString()}`}>
            <div
              className={`w-full ${color}`}
              style={{ height: `${h}px`, transform: sign < 0 ? 'translateY(0)' : 'translateY(0)' }}
            />
            <div className="text-[8px] text-slate-500 mt-0.5">{String(row.year).slice(2)}</div>
          </div>
        );
      })}
    </div>
  );
}

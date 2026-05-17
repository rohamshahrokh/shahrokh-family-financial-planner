/**
 * FinancialOSCentre.tsx — Phase 5 unified premium panel.
 *
 * Combines: Behaviour Profile, OS Findings, Readiness Gates, Strategy Drift,
 * Opportunity Windows, Risk Concentration, Strategic Priority Stack.
 *
 * Calm, advisor-style UI. No gradients, no gamification. Progressive
 * disclosure: secondary sections collapse on small screens.
 *
 * Every action shown here links back to the Recommendation Engine V2 unified
 * surfaces — no parallel advice is generated.
 */

import { useEffect, useMemo, useState } from 'react';
import { Activity, Compass, ShieldAlert, Target, TrendingUp, Layers } from 'lucide-react';
import { useForecastStore } from '@/lib/forecastStore';
import { inferBehaviouralProfile, type BehaviouralProfile } from '@/lib/behaviouralEngine';
import { runAutonomousOS, type OSReport } from '@/lib/autonomousOS';
import { buildScenarioTree, type ScenarioTreeResult } from '@/lib/scenarioTree';
import { computeUnifiedBestMove, type UnifiedBestMoveResult } from '@/lib/recommendationEngine';

function fmtMoney(n?: number): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

const severityClass: Record<string, string> = {
  critical: 'bg-rose-500/15 border-rose-500/30 text-rose-300',
  elevated: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
  watch: 'bg-sky-500/15 border-sky-500/30 text-sky-300',
  info: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
};

export default function FinancialOSCentre() {
  const maxLvr = useForecastStore((s) => s.maxLvr);
  const liveMC = useForecastStore((s) => s.monteCarloResult);
  const mcSig = liveMC ? `${liveMC.ran_at}-${liveMC.simulations}` : 'none';

  const [result, setResult] = useState<UnifiedBestMoveResult | null>(null);

  // Behavioural profile inferred from in-memory observations only — no DB.
  const behavioural: BehaviouralProfile = useMemo(() => inferBehaviouralProfile({}), []);

  useEffect(() => {
    let cancelled = false;
    computeUnifiedBestMove({
      cfg: { maxLvr },
      monteCarloV5: liveMC,
      behaviouralProfile: behavioural,
    })
      .then((r) => { if (!cancelled) setResult(r); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxLvr, mcSig]);

  const signals = result?.unified.signalCoverage ?? [];
  const top = result?.unified.topPriorities ?? [];

  // Build OS report from unified signals — derived only.
  const osReport: OSReport = useMemo(() => {
    if (!result) return { findings: [], generatedAt: '', detectorsRun: [], inputCoverage: 0 };
    const all = (result.unified.all as any[]) ?? [];
    const sample = all[0];
    void sample;
    // Pull from the same signals the engine used.
    const s = result.legacy.ledgerInputs;
    return runAutonomousOS({
      cashOutsideOffset: s.cashOutsideOffset,
      offsetBalance: s.offsetBalance,
      mortgage: s.mortgage,
      otherDebts: s.otherDebts,
      monthlyIncome: s.monthlyIncome,
      monthlyExpenses: s.monthlyExpenses,
      monthlySurplus: s.monthlyIncome - s.monthlyExpenses,
      emergencyBufferTarget: s.emergencyBuffer,
      depositReadinessPct: s.depositReadinessPct / 100,
      mortgageRate: 0.0625,
      marketMortgageRate: 0.057,
      // Do not hardcode 0.17 here. The classified debt portfolio (set on
      // /debt-strategy and persisted to app_settings.debt_prefs.debts) is the
      // sole source of truth for personal debt APR. Passing undefined means
      // the OS detector simply won't fire a high-APR debt finding from a
      // synthesised rate — it will only fire when real per-debt APRs are set.
      personalDebtRate: undefined,
      etfExpectedReturn: 0.095,
      marginalTaxRate: 0.325,
    });
  }, [result]);

  const tree: ScenarioTreeResult = useMemo(() => buildScenarioTree({
    baseNetWorth: result?.legacy.ledgerInputs ? Math.max(0, result.legacy.ledgerInputs.cashOutsideOffset + result.legacy.ledgerInputs.offsetBalance - result.legacy.ledgerInputs.mortgage - result.legacy.ledgerInputs.otherDebts) : undefined,
  }), [result]);

  if (!result) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-xs text-muted-foreground">Loading Financial OS Centre…</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden" data-testid="financial-os-centre">
      <header className="px-4 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
            <Compass className="w-4 h-4 text-indigo-300" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Financial OS Centre</p>
            <p className="text-[10px] text-muted-foreground">
              Behaviour · Autonomous OS · Readiness · Strategy Drift · {signals.length} signals
            </p>
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">Phase 5</span>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border">
        {/* Behaviour Profile */}
        <section className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold text-foreground">Behaviour profile</p>
          </div>
          <p className="text-sm font-bold text-foreground">{behavioural.primaryLabel}</p>
          <p className="text-xs text-muted-foreground mt-1">{behavioural.narrative}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
            <ScoreRow label="Liquidity preference" value={behavioural.scores.liquidityPreference} bipolar />
            <ScoreRow label="Volatility tolerance" value={behavioural.scores.volatilityTolerance} bipolar />
            <ScoreRow label="FIRE urgency" value={behavioural.scores.fireUrgency} />
            <ScoreRow label="Debt aversion" value={behavioural.scores.debtAversion} />
          </div>
        </section>

        {/* Strategic Priority Stack (top 3 from V2 — single source of truth) */}
        <section className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold text-foreground">Strategic priority stack</p>
          </div>
          {top.length === 0 ? (
            <p className="text-xs text-muted-foreground">No active priorities.</p>
          ) : (
            <ol className="space-y-2">
              {top.map((rec) => (
                <li key={rec.id} className="text-xs flex items-start gap-2">
                  <span className="w-5 h-5 rounded-md bg-muted text-foreground text-[10px] font-bold flex items-center justify-center shrink-0">
                    {rec.priorityRank}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{rec.title}</p>
                    <p className="text-[10px] text-muted-foreground">{rec.pillar.replace(/_/g, ' ')} · {rec.urgency.replace(/_/g, ' ')}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Autonomous OS findings */}
      <section className="px-4 py-4 border-t border-border">
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-foreground">Autonomous OS findings</p>
          <span className="text-[10px] text-muted-foreground">({osReport.findings.length})</span>
        </div>
        {osReport.findings.length === 0 ? (
          <p className="text-xs text-muted-foreground">All systems nominal — no findings.</p>
        ) : (
          <ul className="space-y-2">
            {osReport.findings.slice(0, 6).map((f) => (
              <li key={f.id} className={`rounded-lg border px-3 py-2 text-xs ${severityClass[f.severity]}`}>
                <p className="font-semibold">{f.title}</p>
                <p className="opacity-80 mt-0.5">{f.detail}</p>
                {f.quantifiedImpact?.dollarPerYear ? (
                  <p className="text-[10px] mt-1 opacity-70">
                    {fmtMoney(f.quantifiedImpact.dollarPerYear)}/yr · {f.quantifiedImpact.label ?? 'estimated impact'}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Macro regime + opportunity windows */}
      <section className="px-4 py-4 border-t border-border">
        <div className="flex items-center gap-2 mb-2">
          <Layers className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-foreground">Macro regime context</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {tree.branches.slice(0, 6).map((b) => (
            <div key={b.id} className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px]">
              <p className="font-semibold text-foreground">{b.label}</p>
              <p className="text-muted-foreground mt-0.5">p {Math.round(b.probability * 100)}%</p>
              <p className="text-muted-foreground">{b.keyDriver}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Risk concentration / strategy drift indicators */}
      <section className="px-4 py-4 border-t border-border">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-xs font-semibold text-foreground">Drift & readiness</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
          <Tile
            label="Deposit readiness"
            value={`${Math.round((result.legacy.ledgerInputs.depositReadinessPct ?? 0))}%`}
          />
          <Tile
            label="Buffer (months)"
            value={`${((result.legacy.ledgerInputs.cashOutsideOffset + result.legacy.ledgerInputs.offsetBalance) / Math.max(1, result.legacy.ledgerInputs.monthlyExpenses)).toFixed(1)}`}
          />
          <Tile
            label="FIRE prob (MC)"
            value={liveMC?.prob_ff != null ? `${Math.round(liveMC.prob_ff)}%` : '—'}
          />
          <Tile
            label="Dominant regime"
            value={tree.branches[0]?.label ?? '—'}
          />
        </div>
      </section>

      <footer className="px-4 pb-4 pt-3 border-t border-border">
        <p className="text-[10px] text-muted-foreground">
          All advice on this card flows through Recommendation Engine V2. Behavioural,
          autonomous OS and scenario context modulate ranking but never override hard
          safety pillars.
        </p>
      </footer>
    </div>
  );
}

function ScoreRow({ label, value, bipolar = false }: { label: string; value: number; bipolar?: boolean }) {
  const pct = bipolar ? Math.round((value + 1) * 50) : Math.round(value * 100);
  return (
    <div>
      <div className="flex justify-between text-muted-foreground">
        <span>{label}</span>
        <span>{bipolar ? value.toFixed(2) : Math.round(value * 100) + '%'}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
        <div className="h-full bg-indigo-400/60" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-foreground mt-0.5">{value}</p>
    </div>
  );
}

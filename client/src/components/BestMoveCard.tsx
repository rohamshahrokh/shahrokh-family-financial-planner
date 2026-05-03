/**
 * BestMoveCard.tsx — "Best Move Right Now" dashboard card (V2)
 *
 * V2 changes:
 *  - Shows calcBreakdown accordion when best.calcBreakdown exists
 *  - Shows Ledger Inputs panel (collapsible) from result.ledgerInputs
 *  - Uses computeBestMoveV2 (same backward-compat import)
 *  - Cached in sessionStorage so it doesn't re-run on every render
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'wouter';
import {
  Zap, ChevronDown, ChevronUp, RefreshCw,
  Loader2, AlertTriangle, TrendingUp, Shield,
  DollarSign, ArrowRight, Calculator, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { maskValue } from '@/components/PrivacyMask';
import { useAppStore } from '@/lib/store';
import { useForecastStore } from '@/lib/forecastStore';
import {
  computeBestMove,
  type BestMoveResult,
  type BestMoveOption,
  type CalcBreakdownStep,
  type LedgerInputs,
} from '@/lib/bestMoveEngine';

// ─── Cache ────────────────────────────────────────────────────────────────────
const CACHE_KEY = 'best_move_result_v2';   // bumped key to bust V1 cache
const CACHE_TTL = 30 * 60 * 1000;          // 30 min

function loadCache(): BestMoveResult | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data as BestMoveResult;
  } catch { return null; }
}

function saveCache(r: BestMoveResult) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: r, ts: Date.now() }));
  } catch { /* noop */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtCurrency(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${Math.round(Math.abs(n) / 1_000)}K`;
  return `$${Math.abs(Math.round(n))}`;
}

// ─── Risk badge ───────────────────────────────────────────────────────────────
function RiskBadge({ risk }: { risk: 'Low' | 'Med' | 'High' }) {
  const styles = {
    Low:  'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    Med:  'bg-amber-500/15   text-amber-400   border border-amber-500/30',
    High: 'bg-red-500/15     text-red-400     border border-red-500/30',
  }[risk];
  const icons = {
    Low:  <Shield       className="w-3 h-3" />,
    Med:  <TrendingUp   className="w-3 h-3" />,
    High: <AlertTriangle className="w-3 h-3" />,
  }[risk];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${styles}`}>
      {icons} {risk} Risk
    </span>
  );
}

// ─── Calculation breakdown panel ──────────────────────────────────────────────
function CalcBreakdown({ steps }: { steps: CalcBreakdownStep[] }) {
  return (
    <div className="mt-3 rounded-xl bg-background/50 border border-border/60 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <Calculator className="w-3 h-3 text-sky-400" />
        <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wide">How this was calculated</span>
      </div>
      <div className="space-y-0.5">
        {steps.map((step, i) => {
          const isResult  = step.sign === '=';
          const isNeg     = step.value < 0;
          const isZero    = step.value === 0;
          return (
            <div
              key={i}
              className={`flex items-center justify-between gap-2 py-0.5 ${isResult ? 'border-t border-border/60 mt-1 pt-1.5' : ''}`}
            >
              <span className={`text-[10px] ${isResult ? 'font-semibold text-foreground/80' : 'text-muted-foreground'}`}>
                {step.label}
              </span>
              <span className={`text-[10px] font-mono font-semibold tabular-nums ${
                isResult
                  ? step.value >= 0 ? 'text-emerald-400' : 'text-red-400'
                  : isNeg
                    ? 'text-red-400/80'
                    : isZero
                      ? 'text-muted-foreground'
                      : 'text-foreground/70'
              }`}>
                {step.sign === '-' || (step.sign === '+' && step.value < 0) ? '−' : ''}
                {step.sign === '=' ? (step.value >= 0 ? '' : '−') : ''}
                {/* For percentage values (readiness) */}
                {Math.abs(step.value) < 200 && !step.label.toLowerCase().includes('$') && step.label.toLowerCase().includes('readiness')
                  ? `${Math.round(Math.abs(step.value))}%`
                  : fmtCurrency(Math.abs(step.value))
                }
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Ledger Inputs panel ──────────────────────────────────────────────────────
function LedgerInputsPanel({ li, mv }: { li: LedgerInputs; mv: (v: string) => string }) {
  const rows: Array<{ label: string; value: number; highlight?: boolean; negative?: boolean }> = [
    { label: 'Cash (everyday account)',     value: li.cashOutsideOffset },
    { label: 'Offset balance',             value: li.offsetBalance },
    { label: 'Mortgage',                   value: li.mortgage,            negative: true },
    { label: 'Other debts',                value: li.otherDebts,          negative: true },
    { label: 'Emergency buffer',           value: li.emergencyBuffer,     negative: true },
    { label: 'Upcoming bills (12mo)',       value: li.upcomingBills12mo,   negative: true },
    { label: 'Planned investments',        value: li.plannedInvestmentsTotal, negative: true },
    { label: 'Property deposit reserve',   value: li.propertyDepositReserve, negative: true },
    { label: 'Tax reserve',                value: li.taxReserve,          negative: true },
    { label: 'Forecast shortfall reserve', value: li.forecastShortfallReserve, negative: true },
    { label: 'Free cash for offset',       value: li.freeCashForOffset,   highlight: true },
    { label: 'Monthly income',             value: li.monthlyIncome },
    { label: 'Monthly expenses',           value: li.monthlyExpenses,     negative: true },
    { label: 'Monthly surplus',            value: li.surplus,             highlight: true },
    { label: 'Total deposit power',        value: li.depositPower,        highlight: true },
    { label: 'Deposit readiness',          value: li.depositReadinessPct, highlight: true },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-border/40">
            <th className="px-3 py-1.5 text-left font-semibold text-muted-foreground">Input</th>
            <th className="px-3 py-1.5 text-right font-semibold text-muted-foreground">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-b border-border/20 ${r.highlight ? 'bg-background/60' : ''}`}>
              <td className={`px-3 py-1 ${r.highlight ? 'font-semibold text-foreground/80' : 'text-muted-foreground'}`}>
                {r.label}
              </td>
              <td className={`px-3 py-1 text-right font-mono tabular-nums ${
                r.highlight
                  ? r.value >= 0 ? 'font-bold text-emerald-400' : 'font-bold text-red-400'
                  : r.negative
                    ? 'text-red-400/70'
                    : 'text-foreground/70'
              }`}>
                {r.label === 'Deposit readiness'
                  ? mv(`${Math.round(r.value)}%`)
                  : `${r.negative ? '−' : ''}${mv(fmtCurrency(Math.abs(r.value)))}`
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Alternative row ──────────────────────────────────────────────────────────
function AltRow({ opt, mv }: { opt: BestMoveOption; mv: (v: string) => string }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  return (
    <div className="py-2.5 border-t border-white/[0.05]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground/70 leading-snug">
            #{opt.rank} {opt.action}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
            {opt.reason}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-xs font-semibold text-emerald-400 font-mono whitespace-nowrap">
            {mv(opt.benefit_label)}
          </span>
          <RiskBadge risk={opt.risk} />
        </div>
      </div>
      {opt.calcBreakdown && opt.calcBreakdown.length > 0 && (
        <button
          className="mt-1.5 flex items-center gap-1 text-[10px] text-sky-400/70 hover:text-sky-400 transition-colors"
          onClick={() => setShowBreakdown(v => !v)}
        >
          <Calculator className="w-3 h-3" />
          {showBreakdown ? 'Hide' : 'Show'} calculation
        </button>
      )}
      {showBreakdown && opt.calcBreakdown && (
        <CalcBreakdown steps={opt.calcBreakdown} />
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BestMoveCard() {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);

  const [result,        setResult]        = useState<BestMoveResult | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [expanded,      setExpanded]      = useState(false);
  const [showCalc,      setShowCalc]      = useState(false);
  const [showLedgerIn,  setShowLedgerIn]  = useState(false);

  // Pull deposit-power inputs from the forecast store
  const maxLvr = useForecastStore(s => s.maxLvr);

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = loadCache();
      if (cached) { setResult(cached); return; }
    }
    setLoading(true);
    setError(null);
    try {
      const r = await computeBestMove({ maxLvr });
      saveCache(r);
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to compute best move');
    } finally {
      setLoading(false);
    }
  }, [maxLvr]);

  useEffect(() => { load(); }, [load]);

  // Recompute whenever forecast mode/profile/MC result changes
  const forecastMode    = useForecastStore(s => s.forecastMode);
  const forecastProfile = useForecastStore(s => s.profile);
  const mcSignature     = useForecastStore(s =>
    s.monteCarloResult ? `${s.monteCarloResult.ran_at}-${s.monteCarloResult.simulations}` : 'none'
  );
  const isFirstForecastRun = useRef(true);
  useEffect(() => {
    if (isFirstForecastRun.current) {
      isFirstForecastRun.current = false;
      return;
    }
    try { sessionStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
    load(true);
  }, [forecastMode, forecastProfile, mcSignature, maxLvr, load]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading && !result) {
    return (
      <div className="rounded-2xl bg-card border border-border p-4 flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
        <div>
          <p className="text-sm font-semibold text-foreground">Analysing your finances…</p>
          <p className="text-xs text-muted-foreground">Computing risk-adjusted options across all ledger buckets</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-300">Could not load Best Move</p>
          <p className="text-xs text-slate-400 mt-0.5">{error}</p>
        </div>
        <Button size="sm" variant="ghost" className="text-xs text-slate-400 h-7" onClick={() => load(true)}>
          Retry
        </Button>
      </div>
    );
  }

  if (!result) return null;

  const { best, alternatives, ledgerInputs } = result;

  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-sm font-bold text-foreground tracking-tight">Best Move Right Now</span>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-secondary/40 transition-colors text-muted-foreground hover:text-foreground/70 disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ── Best action ──────────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-4">
        {/* Action title + risk */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-base font-bold text-foreground leading-snug flex-1">
            {best.action}
          </h3>
          <RiskBadge risk={best.risk} />
        </div>

        {/* Benefit pill */}
        <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1 mb-3">
          <DollarSign className="w-3 h-3 text-emerald-400" />
          <span className="text-xs font-semibold text-emerald-400 font-mono">
            {mv(best.benefit_label)}
          </span>
        </div>

        {/* Reason */}
        <p className="text-xs text-slate-400 leading-relaxed mb-3">
          {best.reason}
        </p>

        {/* Calculation breakdown toggle */}
        {best.calcBreakdown && best.calcBreakdown.length > 0 && (
          <>
            <button
              className="flex items-center gap-1.5 text-[10px] text-sky-400/70 hover:text-sky-400 transition-colors mb-2"
              onClick={() => setShowCalc(v => !v)}
            >
              <Calculator className="w-3 h-3" />
              {showCalc ? 'Hide' : 'Show'} calculation breakdown
              {showCalc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showCalc && <CalcBreakdown steps={best.calcBreakdown} />}
          </>
        )}

        {/* CTA + unreliable caveat */}
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <Link href={best.cta_route}>
            <Button
              size="sm"
              className="bg-amber-500 hover:bg-amber-400 text-black font-semibold h-8 text-xs gap-1"
            >
              {best.cta}
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
          {!best.data_reliable && (
            <span className="text-[10px] text-amber-500/70 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Needs more data in Settings
            </span>
          )}
        </div>
      </div>

      {/* ── Alternatives ──────────────────────────────────────────────────────── */}
      {alternatives.length > 0 && (
        <div className="border-t border-white/[0.05]">
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground/70 hover:bg-card transition-colors"
            onClick={() => setExpanded(v => !v)}
          >
            <span className="font-medium">Alternative options</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-600">{alternatives.length} options</span>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </button>

          {expanded && (
            <div className="px-4 pb-3">
              {alternatives.map(opt => (
                <AltRow key={opt.id} opt={opt} mv={mv} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Ledger Inputs panel ───────────────────────────────────────────────── */}
      {ledgerInputs && (
        <div className="border-t border-white/[0.05]">
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground/70 hover:bg-card transition-colors"
            onClick={() => setShowLedgerIn(v => !v)}
          >
            <div className="flex items-center gap-1.5">
              <Info className="w-3 h-3" />
              <span className="font-medium">Recommendation inputs (audit)</span>
            </div>
            <div className="flex items-center gap-1">
              {showLedgerIn ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </div>
          </button>

          {showLedgerIn && (
            <div className="pb-3">
              <LedgerInputsPanel li={ledgerInputs} mv={mv} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

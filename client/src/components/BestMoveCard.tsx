/**
 * BestMoveCard.tsx — "Best Move Right Now" dashboard card
 *
 * Shows:
 *  - Single best action with risk-adjusted annual benefit
 *  - Risk badge
 *  - CTA button → deep-links to relevant page
 *  - Expandable "Alternatives" section (top 3)
 *  - Privacy mask support
 *  - Refresh button with loading state
 *  - Cached in sessionStorage so it doesn't re-run on every render
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'wouter';
import {
  Zap, ChevronDown, ChevronUp, RefreshCw,
  Loader2, AlertTriangle, TrendingUp, Shield,
  DollarSign, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { maskValue } from '@/components/PrivacyMask';
import { useAppStore } from '@/lib/store';
import { computeBestMove, type BestMoveResult, type BestMoveOption } from '@/lib/bestMoveEngine';

// ─── Cache ────────────────────────────────────────────────────────────────────
const CACHE_KEY = 'best_move_result';
const CACHE_TTL = 30 * 60 * 1000; // 30 min

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

// ─── Risk badge ───────────────────────────────────────────────────────────────
function RiskBadge({ risk }: { risk: 'Low' | 'Med' | 'High' }) {
  const styles = {
    Low:  'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    Med:  'bg-amber-500/15   text-amber-400   border border-amber-500/30',
    High: 'bg-red-500/15     text-red-400     border border-red-500/30',
  }[risk];
  const icons = {
    Low:  <Shield   className="w-3 h-3" />,
    Med:  <TrendingUp className="w-3 h-3" />,
    High: <AlertTriangle className="w-3 h-3" />,
  }[risk];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${styles}`}>
      {icons} {risk} Risk
    </span>
  );
}

// ─── Alternative row ──────────────────────────────────────────────────────────
function AltRow({ opt, mv }: { opt: BestMoveOption; mv: (v: string) => string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-t border-white/[0.05]">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-300 leading-snug">
          #{opt.rank} {opt.action}
        </p>
        <p className="text-[10px] text-slate-500 mt-0.5 leading-snug line-clamp-2">
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
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BestMoveCard() {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);

  const [result, setResult]   = useState<BestMoveResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = loadCache();
      if (cached) { setResult(cached); return; }
    }
    setLoading(true);
    setError(null);
    try {
      const r = await computeBestMove();
      saveCache(r);
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to compute best move');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading && !result) {
    return (
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-4 flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
        <div>
          <p className="text-sm font-semibold text-white">Analysing your finances…</p>
          <p className="text-xs text-slate-500">Computing risk-adjusted options</p>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-300">Could not load Best Move</p>
          <p className="text-xs text-slate-400 mt-0.5">{error}</p>
        </div>
        <Button
          size="sm" variant="ghost"
          className="text-xs text-slate-400 h-7"
          onClick={() => load(true)}
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!result) return null;

  const { best, alternatives } = result;

  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-sm font-bold text-white tracking-tight">Best Move Right Now</span>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors text-slate-500 hover:text-slate-300 disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ── Best action ──────────────────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-4">
        {/* Action title + risk */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-base font-bold text-white leading-snug flex-1">
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
        <p className="text-xs text-slate-400 leading-relaxed mb-4">
          {best.reason}
        </p>

        {/* CTA + unreliable caveat */}
        <div className="flex items-center gap-2 flex-wrap">
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

      {/* ── Alternatives ─────────────────────────────────────────────────────── */}
      {alternatives.length > 0 && (
        <div className="border-t border-white/[0.05]">
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-slate-500 hover:text-slate-300 hover:bg-white/[0.03] transition-colors"
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
    </div>
  );
}

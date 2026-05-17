/**
 * ActionCentre.tsx — Dashboard executive action card.
 *
 * Consumes the Unified Recommendation Engine via the Best Move bridge so its
 * output is guaranteed coherent with the BestMoveCard, FIRE Optimizer, Risk
 * Radar, and Deposit Power surfaces.
 *
 * Sections:
 *   - Best Move Right Now (primary action)
 *   - Top 3 priorities
 *   - What changed (since previous run, in-memory)
 *   - Risk being reduced
 *   - Next steps for the primary action
 *
 * Non-destructive: this is purely additive on the dashboard.
 */

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Activity, Shield, ArrowRight, Sparkles, AlertTriangle } from 'lucide-react';
import { useForecastStore } from '@/lib/forecastStore';
import { computeUnifiedBestMove, type UnifiedBestMoveResult } from '@/lib/recommendationEngine';
import { maskValue } from '@/components/PrivacyMask';
import { useAppStore } from '@/lib/store';

function fmtBenefit(s?: string) {
  return s ?? '';
}

export default function ActionCentre() {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);
  const maxLvr = useForecastStore(s => s.maxLvr);
  // Live MC result so stress flag flows into the unified engine
  const liveMC = useForecastStore(s => s.monteCarloResult);
  const mcSig  = liveMC ? `${liveMC.ran_at}-${liveMC.simulations}` : 'none';

  const [result, setResult] = useState<UnifiedBestMoveResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    computeUnifiedBestMove({ cfg: { maxLvr }, monteCarloV5: liveMC })
      .then(r => { if (!cancelled) setResult(r); })
      .catch(() => { /* silent — card hides */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxLvr, mcSig]);

  if (loading || !result) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-xs text-muted-foreground">Loading Action Centre…</div>
      </div>
    );
  }

  const { unified, changes } = result;
  const best = unified.bestMove;
  const top  = unified.topPriorities;
  const meaningfulChanges = changes.filter(c => c.changedReason !== 'unchanged');

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden" data-testid="action-centre">
      <div className="px-4 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Action Centre</p>
            <p className="text-[10px] text-muted-foreground">Unified strategic brain · {unified.signalCoverage.length} signals</p>
          </div>
        </div>
        <Link href="/wealth-strategy">
          <span className="text-xs text-primary hover:underline whitespace-nowrap">Full plan →</span>
        </Link>
      </div>

      {/* Best Move Right Now */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Sparkles className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Best Move Right Now</span>
        </div>
        <p className="text-sm font-semibold text-foreground leading-snug" data-testid="action-centre-best-title">
          {best.title}
        </p>
        <p className="text-[11px] text-muted-foreground leading-snug mt-1 line-clamp-2">{best.reasoning}</p>
        {best.benefitLabel && (
          <p className="text-xs text-emerald-400 font-mono mt-1">{mv(fmtBenefit(best.benefitLabel))}</p>
        )}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="text-[9px] text-muted-foreground">Risk being reduced:</span>
          <span className="text-[10px] text-foreground/80">{unified.riskBeingReduced}</span>
        </div>
        {best.cta && (
          <Link href={best.cta.route}>
            <button className="mt-2.5 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold">
              {best.cta.label}
              <ArrowRight className="w-3 h-3" />
            </button>
          </Link>
        )}
      </div>

      {/* Top 3 priorities */}
      <div className="px-4 py-3 border-b border-border">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Top priorities</p>
        <ol className="space-y-1.5">
          {top.map(r => (
            <li key={r.id} className="rounded-lg border border-border/40 px-2.5 py-2 flex items-start justify-between gap-2"
                data-testid={`action-centre-priority-${r.priorityRank}`}>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground leading-snug">
                  #{r.priorityRank} {r.title}
                </p>
                <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{r.reasoning}</p>
              </div>
              <div className="text-right shrink-0">
                {r.benefitLabel && <p className="text-[10px] text-emerald-400 font-mono">{mv(r.benefitLabel)}</p>}
                <p className="text-[9px] text-muted-foreground tabular-nums">conf {(r.confidenceScore * 100).toFixed(0)}%</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* What changed */}
      {meaningfulChanges.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">What changed</p>
          <ul className="space-y-0.5 text-[10px] text-muted-foreground">
            {meaningfulChanges.slice(0, 4).map(c => (
              <li key={c.id}>
                <span className="text-foreground/80">{c.current.title}</span> — {c.changedReason.replace(/_/g, ' ')}
                {c.confidenceMovement !== 0 && (
                  <span className="ml-1 text-sky-300/70">
                    ({c.confidenceMovement > 0 ? '+' : ''}{(c.confidenceMovement * 100).toFixed(0)}% conf)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Next steps */}
      <div className="px-4 py-3">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Next action steps</p>
        <ol className="space-y-1 list-decimal list-inside text-[11px] text-foreground/80">
          {best.implementationSteps.slice(0, 3).map((s, i) => (
            <li key={i}>{s.step}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * UnifiedFirePanel.tsx — FIRE page consumer of the Unified Recommendation Engine.
 *
 * Shows: FIRE-pillar recommendations sourced from the canonical engine,
 * with confidence, risk being reduced, fire-impact deltas, and the live
 * Monte Carlo stress flag pulled from the forecast store.
 *
 * Preserves existing FIRE page visuals — this is an additive panel meant
 * to sit alongside ScenarioCards / SensitivityPanel.
 */

import { useEffect, useState } from 'react';
import { Flame, Activity, Sparkles, AlertTriangle } from 'lucide-react';
import { useForecastStore } from '@/lib/forecastStore';
import {
  computeUnifiedBestMove,
  fireSurfaceFrom,
  type UnifiedBestMoveResult,
} from '@/lib/recommendationEngine';
import { maskValue } from '@/components/PrivacyMask';
import { useAppStore } from '@/lib/store';
import { MetricExplainer } from '@/components/intelligence/MetricExplainer';
/* Sprint 15 Phase 3 — participate in the RecommendationFacade cache so this
   FIRE-pillar surface stays consistent with Action Plan / Decision Lab /
   dashboard. We still need the raw `UnifiedRecommendationResult` to call
   `fireSurfaceFrom()`, so we keep the engine call alongside the hook —
   the facade wraps the same engine, so they share state via React Query. */
import { useCanonicalRecommendation } from '@/hooks/useCanonicalRecommendation';

export default function UnifiedFirePanel() {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);

  const maxLvr = useForecastStore(s => s.maxLvr);
  const liveMC = useForecastStore(s => s.monteCarloResult);
  const mcSig  = liveMC ? `${liveMC.ran_at}-${liveMC.simulations}` : 'none';

  const [result, setResult] = useState<UnifiedBestMoveResult | null>(null);
  const [loading, setLoading] = useState(true);
  /* Keep the facade hook live so this widget participates in the shared
     canonical query cache (warm reads on cross-page navigation). */
  useCanonicalRecommendation();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    computeUnifiedBestMove({ cfg: { maxLvr }, monteCarloV5: liveMC })
      .then(r => { if (!cancelled) setResult(r); })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxLvr, mcSig]);

  if (loading || !result) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-xs text-muted-foreground">Loading FIRE strategy brain…</div>
      </div>
    );
  }

  const fire = fireSurfaceFrom(result.unified);
  const liveStress = liveMC
    ? (liveMC.prob_neg_cf > 40 || liveMC.prob_cash_shortfall > 40
        ? 'severe'
        : liveMC.prob_neg_cf > 20 || liveMC.prob_cash_shortfall > 20
          ? 'moderate'
          : 'none')
    : null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden" data-testid="unified-fire-panel">
      <div className="px-4 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center">
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground flex items-center gap-1">
              <span>FIRE — Strategic brain</span>
              <MetricExplainer metricId="fire-progress" size={11} />
              <MetricExplainer metricId="withdrawal-sustainability" size={11} />
            </p>
            <p className="text-[10px] text-muted-foreground">
              From the unified recommendation engine · {result.unified.signalCoverage.length} signals
            </p>
          </div>
        </div>
        {liveStress && (
          <span
            className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${
              liveStress === 'severe'
                ? 'bg-red-500/15 text-red-300 border-red-500/30'
                : liveStress === 'moderate'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
            }`}
            data-testid="unified-fire-panel-stress"
          >
            MC stress: {liveStress}
          </span>
        )}
      </div>

      <div className="px-4 py-3 border-b border-border text-[11px] text-muted-foreground italic">
        Risk being reduced:{' '}
        <span className="text-foreground/80 not-italic">{result.unified.riskBeingReduced}</span>
      </div>

      {fire.recommendations.length === 0 ? (
        <div className="px-4 py-4 text-xs text-muted-foreground flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          No FIRE-tilt actions surface today — your survival probability is above the engine threshold.
        </div>
      ) : (
        <ol className="px-4 py-3 space-y-2">
          {fire.recommendations.slice(0, 5).map(r => (
            <li
              key={r.id}
              className="rounded-xl border border-border/40 bg-background/40 p-2.5 space-y-1"
              data-testid={`unified-fire-rec-${r.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-semibold text-foreground leading-snug">
                  #{r.priorityRank} {r.title}
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Activity className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[9px] text-muted-foreground tabular-nums">
                    conf {(r.confidenceScore * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug line-clamp-3">{r.reasoning}</p>
              <div className="flex items-center gap-2 flex-wrap text-[10px]">
                {r.benefitLabel && (
                  <span className="text-emerald-400 font-mono">{mv(r.benefitLabel)}</span>
                )}
                {r.fireImpact?.yearsDelta && r.fireImpact.yearsDelta !== 0 && (
                  <span className="text-orange-300">
                    FIRE {r.fireImpact.yearsDelta > 0 ? '+' : ''}{r.fireImpact.yearsDelta.toFixed(1)}y sooner
                  </span>
                )}
                {r.fireImpact?.probabilityDelta && (
                  <span className="text-orange-300">
                    survival +{(r.fireImpact.probabilityDelta * 100).toFixed(0)}%
                  </span>
                )}
                {r.opportunityCost?.description && (
                  <span className="text-amber-300/80">Opp cost: {r.opportunityCost.description}</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {liveStress === 'severe' && (
        <div className="px-4 py-2.5 border-t border-border flex items-start gap-2 bg-red-500/5">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-red-300 leading-snug">
            Monte Carlo simulation flags severe stress. The engine has tilted FIRE recommendations toward
            liquidity protection and faster contribution increases.
          </p>
        </div>
      )}
    </div>
  );
}

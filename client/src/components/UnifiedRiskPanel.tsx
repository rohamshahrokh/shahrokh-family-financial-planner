/**
 * UnifiedRiskPanel.tsx — Risk Radar page consumer of the Unified
 * Recommendation Engine.
 *
 * Shows: top risk + second risk (forwarded from Risk Radar via props),
 * severity, required action, and the engine-derived recommendations that
 * reduce the surfaced risks. Pulls live Monte Carlo from forecastStore so
 * the engine receives the canonical stress flag.
 *
 * Preserves existing Risk Radar visuals — this is an additive panel.
 */

import { useEffect, useMemo, useState } from 'react';
import { Shield, ChevronRight, AlertTriangle } from 'lucide-react';
import { useForecastStore } from '@/lib/forecastStore';
import {
  computeUnifiedBestMove,
  riskRadarSurfaceFrom,
  type UnifiedBestMoveResult,
} from '@/lib/recommendationEngine';
import { maskValue } from '@/components/PrivacyMask';
import { useAppStore } from '@/lib/store';

interface RiskFactorLike {
  id: string;
  label: string;
  action: string;
}

interface Props {
  /** Overall safety score from computeRiskRadar (0-100). */
  overallScore?: number;
  /** Top 1-2 risks from the existing Risk Radar engine. */
  topRisks?: RiskFactorLike[];
}

export default function UnifiedRiskPanel({ overallScore, topRisks }: Props) {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);

  const maxLvr = useForecastStore(s => s.maxLvr);
  const liveMC = useForecastStore(s => s.monteCarloResult);
  const mcSig  = liveMC ? `${liveMC.ran_at}-${liveMC.simulations}` : 'none';

  const [result, setResult] = useState<UnifiedBestMoveResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    computeUnifiedBestMove({
      cfg: { maxLvr },
      monteCarloV5: liveMC,
    })
      .then(r => { if (!cancelled) setResult(r); })
      .catch(() => { /* silent */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxLvr, mcSig]);

  // Build a synthetic UnifiedSignals overlay so riskRadarSurfaceFrom has
  // access to the local risk factors discovered by the Risk Radar engine.
  const surface = useMemo(() => {
    if (!result) return null;
    const overlay = {
      riskOverallScore: overallScore,
      topRiskFactor: topRisks?.[0],
      secondRiskFactor: topRisks?.[1],
    };
    return riskRadarSurfaceFrom(overlay as any, result.unified);
  }, [result, overallScore, topRisks]);

  if (loading || !result || !surface) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="text-xs text-muted-foreground">Loading Risk strategy brain…</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden" data-testid="unified-risk-panel">
      <div className="px-4 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
            <Shield className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Risk Radar — Strategic brain</p>
            <p className="text-[10px] text-muted-foreground">
              From the unified recommendation engine · severity {surface.severity}
            </p>
          </div>
        </div>
        {liveMC && (
          <span className="text-[10px] font-semibold px-2 py-1 rounded-full border bg-secondary/40 text-muted-foreground border-border">
            MC ran {new Date(liveMC.ran_at).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="px-4 py-3 border-b border-border">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Top risk</p>
            <p className="text-foreground/90">{surface.topRisk ?? '—'}</p>
            {surface.requiredAction && (
              <p className="text-muted-foreground mt-1">→ {surface.requiredAction}</p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Second risk</p>
            <p className="text-foreground/90">{surface.secondRisk ?? '—'}</p>
          </div>
        </div>
      </div>

      {surface.recommendations.length === 0 ? (
        <div className="px-4 py-4 text-xs text-muted-foreground">
          No risk-reduction actions surface today — top priorities are already growth-oriented.
        </div>
      ) : (
        <ol className="px-4 py-3 space-y-2">
          {surface.recommendations.map(r => (
            <li
              key={r.id}
              className="rounded-xl border border-border/40 bg-background/40 p-2.5 space-y-1 flex items-start justify-between gap-2"
              data-testid={`unified-risk-rec-${r.id}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground leading-snug">
                  #{r.priorityRank} {r.title}
                </p>
                <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{r.reasoning}</p>
                <div className="flex items-center gap-2 flex-wrap text-[10px] mt-0.5">
                  {r.benefitLabel && (
                    <span className="text-emerald-400 font-mono">{mv(r.benefitLabel)}</span>
                  )}
                  {r.riskReductionImpact && (
                    <span className="text-sky-300">
                      +{r.riskReductionImpact.points} pts risk score
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            </li>
          ))}
        </ol>
      )}

      {surface.severity === 'high' && (
        <div className="px-4 py-2.5 border-t border-border flex items-start gap-2 bg-red-500/5">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-red-300 leading-snug">
            Overall safety score is in the red band. The engine has elevated risk-reduction actions above
            growth-oriented ones across all surfaces.
          </p>
        </div>
      )}
    </div>
  );
}

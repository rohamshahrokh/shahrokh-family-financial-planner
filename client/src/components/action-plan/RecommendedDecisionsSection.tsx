/**
 * RecommendedDecisionsSection — Section D of the Action Plan page.
 *
 * Reads `computeUnifiedBestMove` — the SAME orchestrator the dashboard's
 * Best Move card and the Action Centre already consume. We render the top
 * 5 from `unified.all` (already ranked by the engine). No re-ranking, no
 * new narrative.
 */

import * as React from "react";
import { useEffect, useState } from "react";
import {
  computeUnifiedBestMove,
  type UnifiedBestMoveResult,
} from "@/lib/recommendationEngine/bestMoveBridge";
import type { Recommendation } from "@/lib/recommendationEngine/types";
import { formatCurrency } from "@/lib/finance";

export interface RecommendedDecisionsSectionProps {
  /** Drives recomputation when the ledger changes (cheap; orchestrator is cached server-side). */
  refreshKey?: string | number;
  /** Notifies the parent of the current top-5 list so Section E can mirror it. */
  onDecisionsChange?: (decisions: Recommendation[]) => void;
}

function ImpactBadge({ rec }: { rec: Recommendation }) {
  const dollars = rec.expectedFinancialImpact?.annualDollar ?? rec.netWorthImpact?.delta;
  if (typeof dollars === "number" && Number.isFinite(dollars)) {
    return (
      <span className="text-xs font-semibold text-foreground/80 num-display">
        {formatCurrency(dollars)}
      </span>
    );
  }
  if (rec.benefitLabel) {
    return <span className="text-xs font-semibold text-foreground/80">{rec.benefitLabel}</span>;
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

function ConfidenceBadge({ rec }: { rec: Recommendation }) {
  const pct = Math.round((rec.confidenceScore ?? 0) * 100);
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {pct}% conf
    </span>
  );
}

export function RecommendedDecisionsSection({ refreshKey, onDecisionsChange }: RecommendedDecisionsSectionProps) {
  const [result, setResult] = useState<UnifiedBestMoveResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    computeUnifiedBestMove()
      .then(r => {
        if (cancelled) return;
        setResult(r);
        const top = r.unified.all.slice(0, 5);
        onDecisionsChange?.(top);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err?.message ?? String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey, onDecisionsChange]);

  const top = result?.unified?.all?.slice(0, 5) ?? [];

  return (
    <section data-testid="action-plan-recommended-decisions">
      <header className="mb-3">
        <h2 className="text-base sm:text-lg font-semibold">Recommended Decisions</h2>
        <p className="text-xs text-muted-foreground">
          Top 5 from the unified recommendation engine. Same ranking the dashboard uses.
        </p>
      </header>

      {loading && (
        <div className="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground" style={{ borderColor: "hsl(var(--border))" }}>
          Loading recommendations…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border bg-card px-4 py-4 text-sm" style={{ borderColor: "hsl(var(--danger) / 0.4)" }}>
          <p className="font-semibold" style={{ color: "hsl(var(--danger))" }}>Could not load recommendations.</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
        </div>
      )}

      {!loading && !error && top.length === 0 && (
        <div className="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground" style={{ borderColor: "hsl(var(--border))" }}>
          No recommendations available yet.
        </div>
      )}

      {!loading && !error && top.length > 0 && (
        <ol className="space-y-2" data-testid="action-plan-decisions-list">
          {top.map((rec, idx) => (
            <li
              key={rec.id}
              className="rounded-lg border bg-card px-3 sm:px-4 py-3 flex items-start gap-3"
              style={{ borderColor: "hsl(var(--border))" }}
              data-testid={`action-plan-decision-${idx}`}
            >
              <span
                className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                style={{
                  background: "hsl(var(--gold-surface))",
                  color: "hsl(var(--gold))",
                  border: "1px solid hsl(var(--gold-dim) / 0.4)",
                }}
              >
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-sm font-semibold text-foreground">{rec.title}</p>
                  <ImpactBadge rec={rec} />
                  <ConfidenceBadge rec={rec} />
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {rec.reasoning}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

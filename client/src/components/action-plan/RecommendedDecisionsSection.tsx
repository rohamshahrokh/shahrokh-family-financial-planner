/**
 * RecommendedDecisionsSection — Section D of the Action Plan page.
 *
 * Sprint 15 Phase 3 — flipped to RecommendationFacade
 * (useCanonicalRecommendation). Same orchestrator under the hood, but now
 * routed through the shared React Query cache so this surface reads the
 * identical recommendation list as every other consumer.
 */

import * as React from "react";
import { useEffect } from "react";
import type { Recommendation } from "@/lib/recommendationEngine/types";
import { formatCurrency } from "@/lib/finance";
import { useCanonicalRecommendation } from "@/hooks/useCanonicalRecommendation";
import { formatConfidence } from "@/lib/confidenceLabels";

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
  /* Sprint 15 Phase 3 — band-only label (rule-class confidence). */
  const info = formatConfidence({ kind: "rule", value: rec.confidenceScore });
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {info.label}
    </span>
  );
}

export function RecommendedDecisionsSection({ refreshKey, onDecisionsChange }: RecommendedDecisionsSectionProps) {
  // `refreshKey` is preserved on the props for backward compatibility — the
  // facade hook owns invalidation now, so the value is no longer threaded
  // through any local effect.
  void refreshKey;
  const { data: canonical, isLoading: loading, error } = useCanonicalRecommendation();

  const top: Recommendation[] = React.useMemo(
    () => (canonical?.all ?? []).slice(0, 5),
    [canonical],
  );

  useEffect(() => {
    if (canonical) onDecisionsChange?.(top);
  }, [canonical, top, onDecisionsChange]);

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
          <p className="text-xs text-muted-foreground mt-1">{error instanceof Error ? error.message : String(error)}</p>
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

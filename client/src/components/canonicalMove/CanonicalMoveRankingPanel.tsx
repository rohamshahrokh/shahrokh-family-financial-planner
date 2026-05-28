/**
 * CanonicalMoveRankingPanel.tsx — Sprint 20 PR-F2.
 *
 * Audit-mode diagnostic panel that surfaces the new `rankMove` output.
 * Rendered only when Audit Mode is on so the default UI of Action Centre /
 * Decision Lab / Wealth Strategy is unchanged (per Sprint 20 user
 * constraint: no UI redesign in F2). When auditMode is off this component
 * returns null.
 */

import { useAuditMode } from "@/lib/auditMode/AuditModeContext";
import { useCanonicalMoveRanking } from "@/hooks/useCanonicalMoveRanking";
import { canonicalMoveToRecommendation } from "@/lib/recommendationEngine/canonicalMoveToRecommendation";
import { MOVE_RANKING_WEIGHTS } from "@/lib/recommendationEngine/rankMove";

export function CanonicalMoveRankingPanel() {
  const { auditMode } = useAuditMode();
  const result = useCanonicalMoveRanking();
  if (!auditMode) return null;
  if (result.isLoading) {
    return (
      <section className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
        Loading canonical move ranking (PR-F2)…
      </section>
    );
  }
  if (!result.fire || !result.household || result.ranked.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground">
        Canonical move ranking (PR-F2) — set a FIRE goal to see ranked moves.
      </section>
    );
  }
  // Realise the canonical → Recommendation conversion so the parallel path
  // is exercised at runtime (Section 3.4 spec — the `canonicalMoveToRecommendation`
  // adapter must be wired, not just defined).
  const realised = result.ranked.map(canonicalMoveToRecommendation);
  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3" data-testid="canonical-move-ranking-panel">
      <header>
        <h3 className="text-sm font-semibold text-foreground">Canonical move ranking (PR-F2)</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          From <code>rankMove(canonicalFire, household, moveDef)</code>.
          Weights — FIRE date: {MOVE_RANKING_WEIGHTS.fireDateYearsPulled},
          NW Δ25y: {MOVE_RANKING_WEIGHTS.netWorthDelta25y},
          downside: {MOVE_RANKING_WEIGHTS.downsideVariancePenalty},
          illiquidity: {MOVE_RANKING_WEIGHTS.illiquidityPenalty},
          leverage: {MOVE_RANKING_WEIGHTS.leverageDeltaPenalty}.
        </p>
      </header>
      <table className="text-[11px] tabular-nums w-full">
        <thead className="text-muted-foreground">
          <tr>
            <th className="text-left">#</th>
            <th className="text-left">Move</th>
            <th className="text-right">rankScore</th>
            <th className="text-right">FIRE Δ (yrs)</th>
            <th className="text-right">NW Δ 25y</th>
            <th className="text-right">Cashflow/mo</th>
            <th className="text-left">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {result.ranked.map((m, i) => (
            <tr key={m.moveId} data-testid={`canonical-move-row-${m.moveId}`}>
              <td>{i + 1}</td>
              <td className="text-foreground">{m.moveId}</td>
              <td className="text-right">{m.rankScore.toFixed(4)}</td>
              <td className="text-right">{(m.expectedFireDateDelta.years + m.expectedFireDateDelta.months / 12).toFixed(2)}</td>
              <td className="text-right">${m.expectedNetWorthDelta25y.toLocaleString()}</td>
              <td className="text-right">${m.cashFlowImpactMonthly.toLocaleString()}</td>
              <td>{m.confidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="text-[11px] text-muted-foreground">
        <summary>Engine lineage</summary>
        <p>Realised as {realised.length} canonical Recommendation records via <code>canonicalMoveToRecommendation</code>. The legacy <code>legacyBestMoveToRecommendation</code> path is untouched.</p>
      </details>
    </section>
  );
}

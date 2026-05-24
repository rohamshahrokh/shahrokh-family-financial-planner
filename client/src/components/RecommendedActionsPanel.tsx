/**
 * RecommendedActionsPanel.tsx
 *
 * Sprint 2C — Decision UX. Dedicated, presentation-only "Recommended Actions"
 * section. Consumes pre-existing engine outputs only (Forecast, Goal Solver,
 * Risk, Monte Carlo, Recommendation engine) via the
 * `buildRecommendedActions()` adapter. Does NOT introduce new engines.
 *
 * Rendered on the Decision Engine page and as a deep-link target from the
 * Dashboard. Intentionally kept lean — the Dashboard purpose remains
 * "current situation, future wealth path, recommended actions" with this
 * section serving the last surface.
 */

import {
  buildRecommendedActions,
  visualClassForTone,
  tonePillLabel,
  tonePillEmoji,
  type RecommendedAction,
  type BuildRecommendedActionsInputs,
} from '@/lib/recommendedActionsAdapter';
import { Sparkles, Layers, AlertCircle } from 'lucide-react';

interface Props extends BuildRecommendedActionsInputs {
  /** Show full reason text? Defaults true; false renders a compact list. */
  showReasoning?: boolean;
  /** Max items to render. Defaults to all. */
  limit?: number;
  /** Test/storybook override — render the supplied list directly. */
  preComputedActions?: RecommendedAction[];
}

export default function RecommendedActionsPanel(props: Props) {
  const actions = props.preComputedActions ?? buildRecommendedActions(props);
  const limit = props.limit ?? actions.length;
  const visible = actions.slice(0, limit);

  if (visible.length === 0) {
    return (
      <section
        className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground"
        data-testid="recommended-actions-panel-empty"
      >
        <Sparkles className="w-4 h-4 mx-auto mb-2 text-muted-foreground" />
        No engine-driven actions to recommend right now. Run the Decision
        Engine or Goal Solver to populate this panel.
      </section>
    );
  }

  return (
    <section className="space-y-3" data-testid="recommended-actions-panel">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold uppercase tracking-widest text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Recommended Actions
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Curated from existing Forecast, Goal Solver, Risk and Monte Carlo engine outputs — no new math. Each item shows expected impact, risk, confidence and the engines that contributed.
          </p>
        </div>
      </header>

      <div className="space-y-2">
        {visible.map(a => (
          <ActionCard key={a.id} action={a} showReasoning={props.showReasoning !== false} />
        ))}
      </div>

      {actions.length > visible.length && (
        <p className="text-[11px] text-muted-foreground text-center">
          + {actions.length - visible.length} more action{actions.length - visible.length === 1 ? '' : 's'} from the recommendation engine.
        </p>
      )}
    </section>
  );
}

function ActionCard({ action, showReasoning }: { action: RecommendedAction; showReasoning: boolean }) {
  const toneClass = visualClassForTone(action.tone);
  const riskBadgeClass =
    action.risk === 'High'   ? 'border-red-500/40 bg-red-500/10 text-red-300'
    : action.risk === 'Medium' ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';

  return (
    <article
      className={`rounded-xl border p-3 ${toneClass}`}
      data-testid={`recommended-actions-card-${action.id}`}
      data-tone={action.tone}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest font-semibold opacity-80 mb-0.5">
            <span aria-hidden>{tonePillEmoji(action.tone)} </span>
            {tonePillLabel(action.tone)}
            {action.whenLabel && <span className="text-muted-foreground"> · {action.whenLabel}</span>}
          </p>
          <h4 className="text-sm font-bold text-foreground">{action.title}</h4>
          <p
            className="text-[12px] mt-0.5 font-medium"
            data-testid={`recommended-actions-impact-${action.id}`}
          >
            {action.impactLabel}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${riskBadgeClass}`}
            data-testid={`recommended-actions-risk-${action.id}`}
          >
            <AlertCircle className="w-3 h-3" />
            Risk: {action.risk}
          </span>
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border border-border bg-card text-muted-foreground"
            data-testid={`recommended-actions-confidence-${action.id}`}
          >
            Confidence: {action.confidencePct}%
          </span>
        </div>
      </header>

      {showReasoning && (
        <p
          className="text-[11px] text-muted-foreground mt-2 leading-relaxed"
          data-testid={`recommended-actions-reason-${action.id}`}
        >
          {action.reason}
        </p>
      )}

      {action.sourceEngines.length > 0 && (
        <footer className="flex flex-wrap items-center gap-1 mt-2 text-[10px] text-muted-foreground">
          <Layers className="w-3 h-3" />
          <span className="font-semibold uppercase tracking-wider">Sources:</span>
          {action.sourceEngines.map(s => (
            <span
              key={s}
              className="px-1.5 py-0.5 rounded bg-secondary/40 border border-border/60"
              data-testid={`recommended-actions-source-${action.id}-${s.replace(/\s+/g, '-').toLowerCase()}`}
            >
              {s}
            </span>
          ))}
        </footer>
      )}
    </article>
  );
}

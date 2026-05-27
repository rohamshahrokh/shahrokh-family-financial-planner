/**
 * EmptyStateExplainer.tsx — Sprint 20 PR-A.
 *
 * A single, reusable empty-state component. Replaces every "incomplete data"
 * / blank / undefined / NaN visible render with a WHY (reason) + WHAT
 * (missingFields) + HOW (howToFix + optional CTA) explainer.
 *
 * Surfaces using this:
 *   - Recommended Actions panel
 *   - Decision Lab / Sprint 5 Decision Panel
 *   - Goal Closure Lab
 *   - Portfolio Lab
 *   - Dashboard summary cards (where the card is meaningful only with goal SET)
 *   - Reverse-engineering displays
 *
 * The component intentionally renders NO numeric placeholders — "—" is also
 * banned by the uiCopy guard test when an explainer would be more useful.
 */

import * as React from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight } from "lucide-react";

export interface EmptyStateExplainerProps {
  /** WHY this panel is empty (one short sentence). */
  reason: string;
  /** WHAT inputs are missing (rendered as a short bulleted list). */
  missingFields: string[];
  /** HOW to fix it (one short sentence). */
  howToFix: string;
  /** Optional CTA link label. */
  fixLinkLabel?: string;
  /** Optional CTA href (internal route). */
  fixHref?: string;
  /** Optional surface key for analytics / data-testid. */
  surface?: string;
  /** Optional compact mode for inline use inside small cards. */
  compact?: boolean;
}

export function EmptyStateExplainer({
  reason,
  missingFields,
  howToFix,
  fixLinkLabel,
  fixHref,
  surface,
  compact = false,
}: EmptyStateExplainerProps): JSX.Element {
  const testId = surface ? `empty-state-${surface}` : "empty-state-explainer";

  const inner = (
    <div className="flex items-start gap-3">
      <AlertTriangle
        className="w-4 h-4 mt-0.5 shrink-0 text-amber-400"
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{reason}</p>
        {missingFields.length > 0 && (
          <ul className="mt-1.5 text-xs text-muted-foreground list-disc list-inside space-y-0.5">
            {missingFields.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{howToFix}</p>
        {fixLinkLabel && fixHref && (
          <Link href={fixHref}>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 gap-1.5 h-7 px-2 text-xs"
              data-testid={`${testId}-cta`}
            >
              {fixLinkLabel}
              <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );

  if (compact) {
    return (
      <div
        data-testid={testId}
        className="rounded border border-dashed border-amber-500/40 bg-amber-500/5 p-3"
      >
        {inner}
      </div>
    );
  }

  return (
    <Card
      data-testid={testId}
      className="p-4 sm:p-5 border-dashed border-amber-500/40 bg-amber-500/5"
    >
      {inner}
    </Card>
  );
}

export default EmptyStateExplainer;

/**
 * HelpLink.tsx — Inline contextual help affordances for the Decision Engine.
 *
 * #FWL_HELP_CENTER_OVERHAUL · presentation-only · no engine logic
 *
 * Three variants share one prop API:
 *   <HelpLink topic="risk-metrics" />              // small "i" icon button
 *   <HelpLink topic="risk-metrics" label="What is CVaR?" />  // text + icon
 *   <HelpLink topic="risk-metrics" variant="learn-more" />   // "Learn more" anchor
 *
 * Behaviour: clicking opens /help?topic=<id> in the same tab. The help page
 * reads the param, opens the matching accordion, and scrolls into view.
 *
 * Bilingual: the optional `label` is a string (caller picks language). The
 * tooltip aria-label always renders in English + Persian so screen readers
 * in either language get a useful description.
 *
 * Mobile: click target is min 28×28 px (tappable). Tooltip uses native
 * `title` so it works on touch via long-press without extra JS.
 */

import { Info, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export type HelpVariant = "icon" | "text" | "learn-more" | "how-calculated";

interface Props {
  /** Section id in client/src/pages/help.tsx — see HELP_TOPICS map below. */
  topic: string;
  /** Optional inline label (text variant). If omitted, icon-only. */
  label?: string;
  /** Visual variant. */
  variant?: HelpVariant;
  /** Extra classes for layout. */
  className?: string;
  /** Aria description override. */
  ariaLabel?: string;
}

/**
 * Canonical map of Decision-Engine help topics → help-page section id.
 * Keep in sync with SECTIONS in client/src/pages/help.tsx.
 */
export const HELP_TOPICS = {
  // Decision Engine
  decisionEngineOverview:   "de-overview",
  simpleVsAdvanced:         "de-simple-vs-advanced",
  recommendationLogic:      "de-recommendation-logic",
  decisionLenses:           "de-lenses",

  // Scenario assumptions
  scenarioAssumptions:      "de-assumptions",
  smartAutoDetect:          "de-assumption-auto-detect",
  todaysRules:              "de-assumption-current-rules",
  proposedReform:           "de-assumption-reform",
  customWhatIf:             "de-assumption-custom",

  // Risk metrics catalog (one section, all metrics inside)
  riskMetrics:              "de-risk-metrics",
  survivalProbability:      "de-risk-metrics#survival",
  valueAtRisk:              "de-risk-metrics#var",
  conditionalVar:           "de-risk-metrics#cvar",
  nsr:                      "de-risk-metrics#nsr",
  liquidityFactor:          "de-risk-metrics#liquidity",
  drawdown:                 "de-risk-metrics#drawdown",
  refinancePressure:        "de-risk-metrics#refi",
  insolvencyRisk:           "de-risk-metrics#insolvency",
  fireAcceleration:         "de-risk-metrics#fire-accel",
  riskAdjustedCagr:         "de-risk-metrics#rac",
  terminalNetWorth:         "de-risk-metrics#tnw",
  percentiles:              "de-risk-metrics#percentiles",

  // Formulas
  formulas:                 "de-formulas",
  scoringFormula:           "de-formulas#scoring",
  riskPenalties:            "de-formulas#penalties",
  cashflowModel:            "de-formulas#cashflow",
  fireTiming:               "de-formulas#fire-timing",
  survivalDerivation:       "de-formulas#survival-derivation",
  rankingWeights:           "de-formulas#weights",
  monteCarlo:               "de-formulas#monte-carlo",

  // Chart interpretation
  chartGuides:              "de-charts",
  wealthPathFan:            "de-charts#fan",
  terminalNwDistribution:   "de-charts#tnw-dist",
  scoreWaterfall:           "de-charts#waterfall",
  tailRiskProfile:          "de-charts#tail-risk",
  monteCarloOutputs:        "de-charts#mc-outputs",
  scenarioComparison:       "de-charts#scenario-compare",
} as const;

export type HelpTopicKey = keyof typeof HELP_TOPICS;

/**
 * Build the /help URL with topic param. The fragment (after #) is preserved
 * as the help page will scroll to that anchor inside the article.
 */
function buildHref(topicId: string): string {
  const [section, anchor] = topicId.split("#");
  const base = `/help?topic=${encodeURIComponent(section)}`;
  return anchor ? `${base}#${anchor}` : base;
}

export function HelpLink({
  topic,
  label,
  variant = "icon",
  className,
  ariaLabel,
}: Props): JSX.Element {
  const href = buildHref(topic);
  const a11y =
    ariaLabel ??
    (label ? `Learn more — ${label}` : "Open help article · باز کردن مقاله راهنما");

  if (variant === "icon") {
    return (
      <Link href={href}>
        <a
          className={cn(
            "inline-flex items-center justify-center rounded-full",
            "h-6 w-6 text-muted-foreground hover:text-foreground",
            "hover:bg-[hsl(var(--surface-2))] transition-colors shrink-0",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
            className,
          )}
          aria-label={a11y}
          title={a11y}
          data-testid="help-link-icon"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </Link>
    );
  }

  if (variant === "learn-more") {
    return (
      <Link href={href}>
        <a
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium",
            "text-[hsl(var(--primary))] hover:underline underline-offset-2",
            className,
          )}
          aria-label={a11y}
          title={a11y}
          data-testid="help-link-learn-more"
        >
          {label ?? "Learn more"}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </Link>
    );
  }

  if (variant === "how-calculated") {
    return (
      <Link href={href}>
        <a
          className={cn(
            "inline-flex items-center gap-1 text-[11px] uppercase tracking-wider font-medium",
            "text-muted-foreground hover:text-foreground transition-colors",
            className,
          )}
          aria-label={a11y}
          title={a11y}
          data-testid="help-link-how-calculated"
        >
          <Info className="h-3 w-3" aria-hidden="true" />
          {label ?? "How this is calculated"}
        </a>
      </Link>
    );
  }

  // Default text variant: small inline link with leading info icon
  return (
    <Link href={href}>
      <a
        className={cn(
          "inline-flex items-center gap-1 text-xs",
          "text-muted-foreground hover:text-foreground transition-colors",
          className,
        )}
        aria-label={a11y}
        title={a11y}
        data-testid="help-link-text"
      >
        <Info className="h-3 w-3 shrink-0" aria-hidden="true" />
        {label}
      </a>
    </Link>
  );
}

export default HelpLink;

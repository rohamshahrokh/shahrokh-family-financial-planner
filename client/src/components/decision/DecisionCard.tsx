/**
 * DecisionCard — Sprint 12 5-card system for /decision.
 *
 * One fixed-shape card per variant (action / impact / risk / alternative /
 * do-nothing). Each card answers one piece of the decision frame and never
 * renders empty placeholders.
 */

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Activity, Trophy, ShieldAlert, GitCompare, Pause } from "lucide-react";
import { isEmptyValue } from "@/lib/uiEmptyField";
import { cn } from "@/lib/utils";

export type DecisionCardVariant = "action" | "impact" | "risk" | "alternative" | "do-nothing";

export interface DecisionCardFact {
  label: string;
  value: string | number | null | undefined;
}

export interface DecisionCardProps {
  variant: DecisionCardVariant;
  title: string;
  subtitle?: string;
  facts: DecisionCardFact[];
  ctaHref?: string;
  ctaLabel?: string;
  testid?: string;
}

const TONE: Record<DecisionCardVariant, { ring: string; iconBg: string; icon: React.ReactNode; tag: string }> = {
  action: {
    ring: "border-emerald-500/30 bg-emerald-500/5",
    iconBg: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    icon: <Activity className="h-4 w-4" />,
    tag: "Action",
  },
  impact: {
    ring: "border-sky-500/30 bg-sky-500/5",
    iconBg: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    icon: <Trophy className="h-4 w-4" />,
    tag: "Impact",
  },
  risk: {
    ring: "border-amber-500/30 bg-amber-500/5",
    iconBg: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    icon: <ShieldAlert className="h-4 w-4" />,
    tag: "Risk",
  },
  alternative: {
    ring: "border-indigo-500/30 bg-indigo-500/5",
    iconBg: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
    icon: <GitCompare className="h-4 w-4" />,
    tag: "Alternative",
  },
  "do-nothing": {
    ring: "border-rose-500/30 bg-rose-500/5",
    iconBg: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    icon: <Pause className="h-4 w-4" />,
    tag: "Do Nothing",
  },
};

export function DecisionCard({
  variant,
  title,
  subtitle,
  facts,
  ctaHref,
  ctaLabel,
  testid,
}: DecisionCardProps) {
  const tone = TONE[variant];
  const visibleFacts = facts.filter((f) => !isEmptyValue(f.value));
  const tid = testid ?? `decision-card-${variant}`;

  if (isEmptyValue(title) && visibleFacts.length === 0) return null;

  return (
    <Card className={cn("p-4 flex flex-col gap-2 h-full", tone.ring)} data-testid={tid}>
      <header className="flex items-center gap-2">
        <span className={cn("inline-flex items-center justify-center h-7 w-7 rounded-full", tone.iconBg)}>
          {tone.icon}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{tone.tag}</span>
      </header>
      {!isEmptyValue(title) ? (
        <div className="text-sm font-semibold text-foreground leading-snug" data-testid={`${tid}-title`}>
          {title}
        </div>
      ) : null}
      {!isEmptyValue(subtitle) ? (
        <div className="text-xs text-muted-foreground leading-snug" data-testid={`${tid}-subtitle`}>
          {subtitle}
        </div>
      ) : null}
      {visibleFacts.length > 0 ? (
        <ul className="text-xs space-y-1 mt-1">
          {visibleFacts.map((f, i) => (
            <li key={`${tid}-fact-${i}`} className="flex justify-between gap-2" data-testid={`${tid}-fact-${i + 1}`}>
              <span className="text-muted-foreground">{f.label}</span>
              <span className="font-semibold tabular-nums text-foreground">{String(f.value)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {ctaHref && ctaLabel ? (
        <div className="mt-auto pt-2">
          <a href={ctaHref} data-testid={`${tid}-cta`}>
            <Button size="sm" variant="default" className="gap-1 w-full">
              {ctaLabel}
              <ArrowRight className="h-3 w-3" />
            </Button>
          </a>
        </div>
      ) : null}
    </Card>
  );
}

export default DecisionCard;

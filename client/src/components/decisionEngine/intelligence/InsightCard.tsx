/**
 * InsightCard — reusable card for the Financial Intelligence Layer.
 *
 * Renders a single InsightCard (typed in lib/scenarioV2/intelligence). The
 * component is mobile-first and uses the existing premium dark-navy + warm
 * gold palette via hsl(var(--*)) tokens. No layout / theme changes.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Activity,
  Sparkles,
  ShieldAlert,
  Droplet,
  TrendingDown,
  Flame,
  Wrench,
  Gauge,
  Clock,
  Coins,
  Layers,
} from "lucide-react";
import type {
  InsightCard as InsightCardModel,
  InsightCategory,
  InsightSeverity,
} from "@/lib/scenarioV2/intelligence";

const SEVERITY_CLASS: Record<InsightSeverity, string> = {
  critical: "border-[hsl(var(--destructive)/0.5)]",
  warn: "border-[hsl(var(--warning)/0.5)]",
  watch: "border-[hsl(var(--intelligence)/0.40)]",
  info: "border-border",
};

const SEVERITY_BADGE: Record<InsightSeverity, string> = {
  critical: "bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))]",
  warn: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]",
  watch: "bg-[hsl(var(--intelligence)/0.15)] text-[hsl(var(--intelligence-light))]",
  info: "bg-muted text-muted-foreground",
};

const CATEGORY_ICON: Record<InsightCategory, React.ReactNode> = {
  "turning-point": <Activity className="h-3.5 w-3.5" />,
  fragility: <AlertTriangle className="h-3.5 w-3.5" />,
  assumption: <Sparkles className="h-3.5 w-3.5" />,
  "weak-point": <Wrench className="h-3.5 w-3.5" />,
  regime: <Layers className="h-3.5 w-3.5" />,
  behavioural: <Gauge className="h-3.5 w-3.5" />,
  robustness: <ShieldAlert className="h-3.5 w-3.5" />,
  drift: <TrendingDown className="h-3.5 w-3.5" />,
  opportunity: <Sparkles className="h-3.5 w-3.5" />,
  liquidity: <Droplet className="h-3.5 w-3.5" />,
  leverage: <Flame className="h-3.5 w-3.5" />,
  concentration: <Layers className="h-3.5 w-3.5" />,
  tax: <Coins className="h-3.5 w-3.5" />,
  explainability: <Clock className="h-3.5 w-3.5" />,
};

export interface InsightCardViewProps {
  card: InsightCardModel;
  compact?: boolean;
}

export function InsightCardView({ card, compact = false }: InsightCardViewProps) {
  return (
    <Card
      className={`${SEVERITY_CLASS[card.severity]} bg-card/60`}
      data-testid={`insight-card-${card.kind}`}
      data-severity={card.severity}
      data-category={card.category}
    >
      <CardHeader className={compact ? "pb-1" : "pb-2"}>
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-[hsl(var(--intelligence-light))] mt-0.5 shrink-0">
            {CATEGORY_ICON[card.category]}
          </span>
          <CardTitle className="text-xs sm:text-sm leading-snug flex-1 min-w-0 text-foreground">
            {card.title}
          </CardTitle>
          <Badge className={`text-[10px] uppercase tracking-wide ${SEVERITY_BADGE[card.severity]}`}>
            {card.severity}
          </Badge>
        </div>
        {!compact && (
          <CardDescription className="text-xs leading-relaxed text-foreground/80 pt-1">
            {card.body}
          </CardDescription>
        )}
      </CardHeader>
      {!compact && (card.threshold || (card.details && card.details.length > 0)) && (
        <CardContent className="pt-0 space-y-1.5">
          {card.threshold && (
            <div
              className="text-[11px] sm:text-xs px-2 py-1.5 rounded-md border border-border/60 bg-[hsl(var(--surface-2))] text-foreground/85 leading-snug"
              data-testid="insight-card-threshold"
            >
              <span className="font-semibold text-[hsl(var(--intelligence-light))]">Threshold:</span>{" "}
              {card.threshold.label}
              {card.threshold.confidence === "qualitative" && (
                <span className="ml-1 text-muted-foreground italic">(qualitative)</span>
              )}
            </div>
          )}
          {card.details && card.details.length > 0 && (
            <ul className="text-[11px] sm:text-xs text-foreground/75 leading-relaxed space-y-1 pl-1">
              {card.details.slice(0, 4).map((d, i) => (
                <li key={i} className="whitespace-pre-wrap">
                  · {d}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}

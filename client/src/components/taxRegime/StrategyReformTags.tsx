/**
 * StrategyReformTags.tsx — Decision-engine strategy-card sidecar.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform
 *
 * Compact strip of metrics that slot into existing StrategyCard outputs
 * without rewriting the legacy ranking logic. Surfaces:
 *   - Why this ranks (caller-supplied narrative)
 *   - Tax efficiency
 *   - Policy risk
 *   - Deferred loss drag
 *   - Cashflow survivability
 *   - Reform sensitivity
 */

import { Sparkles, ShieldAlert, Layers, Activity, BarChart3, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface StrategyReformMetrics {
  /** Plain-English rationale: "ranks lower under reform because…". */
  rankingRationale: string;
  /** 0–100 tax efficiency score. */
  taxEfficiency: number;
  /** 0–100 policy risk score (higher = more exposed to reform). */
  policyRisk: number;
  /** Drag from carried-forward losses. */
  deferredLossDrag: "none" | "low" | "moderate" | "high";
  /** Months of cashflow runway after reform impact. */
  cashflowSurvivabilityMonths: number;
  /** Δ score (current vs reform). */
  reformSensitivityDelta: number;
}

interface Props {
  metrics: StrategyReformMetrics;
  className?: string;
}

function scoreTone(s: number, sense: "more-better" | "less-better"): string {
  const good = sense === "more-better" ? s >= 70 : s <= 30;
  const bad = sense === "more-better" ? s <= 30 : s >= 70;
  if (good) return "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-50/30 dark:bg-emerald-950/20";
  if (bad) return "border-rose-500/40 text-rose-700 dark:text-rose-300 bg-rose-50/30 dark:bg-rose-950/20";
  return "border-amber-500/30 text-amber-700 dark:text-amber-300 bg-amber-50/30 dark:bg-amber-950/20";
}

function dragLabel(d: StrategyReformMetrics["deferredLossDrag"]): string {
  return { none: "No drag", low: "Low drag", moderate: "Moderate drag", high: "High drag" }[d];
}
function dragTone(d: StrategyReformMetrics["deferredLossDrag"]): string {
  if (d === "none") return "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-50/30 dark:bg-emerald-950/20";
  if (d === "low") return "border-sky-500/40 text-sky-700 dark:text-sky-300 bg-sky-50/30 dark:bg-sky-950/20";
  if (d === "moderate") return "border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-50/30 dark:bg-amber-950/20";
  return "border-rose-500/40 text-rose-700 dark:text-rose-300 bg-rose-50/30 dark:bg-rose-950/20";
}

export function StrategyReformTags({ metrics, className }: Props): JSX.Element {
  return (
    <div className={cn("space-y-2", className)} data-testid="strategy-reform-tags">
      <div className="flex items-start gap-1.5 rounded-md border border-border/40 bg-muted/15 p-2 text-[11px] leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          <span className="font-semibold text-foreground">Why this ranks:</span>{" "}
          {metrics.rankingRationale}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline" className={cn("text-[10px]", scoreTone(metrics.taxEfficiency, "more-better"))}>
          <Sparkles className="mr-1 h-3 w-3" />
          Tax efficiency {metrics.taxEfficiency.toFixed(0)}/100
        </Badge>
        <Badge variant="outline" className={cn("text-[10px]", scoreTone(metrics.policyRisk, "less-better"))}>
          <ShieldAlert className="mr-1 h-3 w-3" />
          Policy risk {metrics.policyRisk.toFixed(0)}/100
        </Badge>
        <Badge variant="outline" className={cn("text-[10px]", dragTone(metrics.deferredLossDrag))}>
          <Layers className="mr-1 h-3 w-3" />
          {dragLabel(metrics.deferredLossDrag)}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          <Activity className="mr-1 h-3 w-3" />
          {metrics.cashflowSurvivabilityMonths.toFixed(0)} mo runway
        </Badge>
        <Badge variant="outline" className={cn(
          "text-[10px]",
          metrics.reformSensitivityDelta < -10
            ? "border-rose-500/40 text-rose-700 dark:text-rose-300"
            : metrics.reformSensitivityDelta < 0
            ? "border-amber-500/40 text-amber-700 dark:text-amber-300"
            : "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
        )}>
          <BarChart3 className="mr-1 h-3 w-3" />
          Reform Δ {metrics.reformSensitivityDelta > 0 ? "+" : ""}{metrics.reformSensitivityDelta.toFixed(0)}
        </Badge>
      </div>
    </div>
  );
}

export default StrategyReformTags;

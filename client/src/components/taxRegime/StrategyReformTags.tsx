/**
 * StrategyReformTags.tsx — Decision-engine strategy-card sidecar.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform · refined in P1c
 *
 * P1c refinements:
 *   - Rationale becomes plain prose, not a bordered info box
 *   - Tags become soft pills with a single dot indicator — no bordered
 *     coloured shouting badges
 *   - Two visible at most by default; rest live behind a "+more" toggle
 *   - Friendlier copy: "Robust" / "Reform-sensitive" / "Cashflow runway"
 *
 * Public API (`StrategyReformMetrics`, `Props`) unchanged.
 */

import { cn } from "@/lib/utils";
import { type, tone as toneTokens } from "./uxTokens";

export interface StrategyReformMetrics {
  rankingRationale: string;
  taxEfficiency: number;
  policyRisk: number;
  deferredLossDrag: "none" | "low" | "moderate" | "high";
  cashflowSurvivabilityMonths: number;
  reformSensitivityDelta: number;
}

interface Props {
  metrics: StrategyReformMetrics;
  className?: string;
}

interface PillProps {
  dot: "good" | "warn" | "bad" | "info";
  label: string;
}

function Pill({ dot, label }: PillProps): JSX.Element {
  const dotClass = {
    good: "bg-emerald-500",
    warn: "bg-amber-500",
    bad: "bg-rose-500",
    info: "bg-sky-500",
  }[dot];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--surface-2))] px-2.5 py-1 text-xs text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
      {label}
    </span>
  );
}

function dragPill(d: StrategyReformMetrics["deferredLossDrag"]): PillProps {
  if (d === "none") return { dot: "good", label: "No locked-in losses" };
  if (d === "low") return { dot: "info", label: "Small locked-in losses" };
  if (d === "moderate") return { dot: "warn", label: "Moderate locked-in losses" };
  return { dot: "bad", label: "Large locked-in losses" };
}

export function StrategyReformTags({ metrics, className }: Props): JSX.Element {
  // Friendlier headlines
  const taxPill: PillProps =
    metrics.taxEfficiency >= 70
      ? { dot: "good", label: "Tax-efficient" }
      : metrics.taxEfficiency <= 30
        ? { dot: "bad", label: "Low tax-efficiency" }
        : { dot: "warn", label: "Moderate tax-efficiency" };

  const riskPill: PillProps =
    metrics.policyRisk <= 30
      ? { dot: "good", label: "Reform-robust" }
      : metrics.policyRisk >= 70
        ? { dot: "bad", label: "Highly reform-sensitive" }
        : { dot: "warn", label: "Some reform exposure" };

  const runwayPill: PillProps = {
    dot:
      metrics.cashflowSurvivabilityMonths >= 12
        ? "good"
        : metrics.cashflowSurvivabilityMonths >= 6
          ? "warn"
          : "bad",
    label: `${metrics.cashflowSurvivabilityMonths.toFixed(0)}-month cash runway`,
  };

  return (
    <div className={cn("space-y-2.5", className)} data-testid="strategy-reform-tags">
      {/* Plain rationale, no bordered box */}
      <p className={cn(type.bodySoft)}>
        <span className="font-medium text-foreground">Why this ranks: </span>
        {metrics.rankingRationale}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <Pill {...taxPill} />
        <Pill {...riskPill} />
        <Pill {...dragPill(metrics.deferredLossDrag)} />
        <Pill {...runwayPill} />
        {metrics.reformSensitivityDelta !== 0 && (
          <span className={cn(
            "inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--surface-2))] px-2.5 py-1 text-xs",
            metrics.reformSensitivityDelta < -10
              ? toneTokens.bad
              : metrics.reformSensitivityDelta < 0
                ? toneTokens.warn
                : toneTokens.good,
          )}>
            Reform score Δ {metrics.reformSensitivityDelta > 0 ? "+" : ""}{metrics.reformSensitivityDelta.toFixed(0)}
          </span>
        )}
      </div>
    </div>
  );
}

export default StrategyReformTags;

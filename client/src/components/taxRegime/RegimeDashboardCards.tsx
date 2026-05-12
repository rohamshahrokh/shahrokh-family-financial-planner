/**
 * RegimeDashboardCards.tsx — Compact dashboard tiles for the regime layer.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform
 *
 * Six KPI tiles described in the brief:
 *   - Tax Regime Active
 *   - Deferred Loss Balance
 *   - Tax Timing Drag
 *   - Reform Sensitivity
 *   - Tax-Adjusted Net Worth
 *   - FIRE Delay / Acceleration
 *
 * Caller supplies the values (already computed by P1 overlays). The tiles
 * are mobile-first, two-up on phone, three-up on tablet+, six-up wide.
 */

import {
  ScaleIcon,
  Layers,
  Clock3,
  AlertTriangle,
  Wallet,
  Flame,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fmtAud, fmtAudSigned } from "./formatters";
import { regimeKindLabel } from "@/hooks/useActiveRegime";
import type { TaxPolicyRegimeKind } from "@/lib/taxPolicyEngine";

export interface RegimeDashboardData {
  /** Active regime selector kind. */
  activeRegime: TaxPolicyRegimeKind;
  /** Auto-detected effective regime when selector = AUTO_DETECT. */
  effectiveRegime?: "CURRENT_RULES" | "PROPOSED_2027_REFORM";
  /** Sum of carried-forward deferred losses across the household at horizon. */
  deferredLossBalance: number;
  /** Estimated $ value of timing drag this year (cumulative early-year drag). */
  timingDragYr1: number;
  /** Reform sensitivity score 0–100 (higher = more sensitive to reform). */
  reformSensitivity: number;
  /** Net worth delta at year 10 under reform vs current rules. */
  taxAdjustedNwDelta: number;
  /** FIRE year delta in years (positive = delayed by reform). */
  fireDeltaYears: number;
}

interface Props {
  data: RegimeDashboardData;
  className?: string;
}

interface TileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warn" | "violet" | "sky";
  className?: string;
  "data-testid"?: string;
}

function Tile({ icon, label, value, hint, tone = "default", className, ...rest }: TileProps): JSX.Element {
  const accent = {
    default: "border-border",
    good: "border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/15",
    warn: "border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/15",
    violet: "border-violet-500/30 bg-violet-50/30 dark:bg-violet-950/15",
    sky: "border-sky-500/30 bg-sky-50/30 dark:bg-sky-950/15",
  }[tone];
  return (
    <Card className={cn("border transition-colors", accent, className)} data-testid={rest["data-testid"]}>
      <CardContent className="space-y-1 p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          <span className="truncate">{label}</span>
        </div>
        <div className="text-base font-bold tabular-nums leading-tight">{value}</div>
        {hint && <div className="text-[10px] leading-snug text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function sensitivityLabel(s: number): string {
  if (s >= 70) return "High";
  if (s >= 40) return "Medium";
  return "Low";
}
function sensitivityTone(s: number): TileProps["tone"] {
  if (s >= 70) return "warn";
  if (s >= 40) return "sky";
  return "good";
}

export function RegimeDashboardCards({ data, className }: Props): JSX.Element {
  const reformActive =
    data.activeRegime === "PROPOSED_2027_REFORM" ||
    (data.activeRegime === "AUTO_DETECT" && data.effectiveRegime === "PROPOSED_2027_REFORM");

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
      data-testid="regime-dashboard-cards"
    >
      <Tile
        icon={<ScaleIcon className="h-3.5 w-3.5" />}
        label="Tax Regime"
        value={regimeKindLabel(data.activeRegime)}
        hint={
          data.activeRegime === "AUTO_DETECT" && data.effectiveRegime
            ? `Resolved: ${data.effectiveRegime === "PROPOSED_2027_REFORM" ? "Reform" : "Current"}`
            : "Active selection"
        }
        tone={reformActive ? "warn" : "good"}
        data-testid="tile-active-regime"
      />
      <Tile
        icon={<Layers className="h-3.5 w-3.5" />}
        label="Deferred Loss"
        value={fmtAud(data.deferredLossBalance)}
        hint="Quarantined NG balance"
        tone="violet"
        data-testid="tile-deferred-loss"
      />
      <Tile
        icon={<Clock3 className="h-3.5 w-3.5" />}
        label="Timing Drag"
        value={fmtAudSigned(-Math.abs(data.timingDragYr1))}
        hint="Cumulative early-year drag"
        tone={data.timingDragYr1 > 0 ? "warn" : "default"}
        data-testid="tile-timing-drag"
      />
      <Tile
        icon={<AlertTriangle className="h-3.5 w-3.5" />}
        label="Reform Sensitivity"
        value={`${data.reformSensitivity.toFixed(0)} / 100`}
        hint={sensitivityLabel(data.reformSensitivity)}
        tone={sensitivityTone(data.reformSensitivity)}
        data-testid="tile-reform-sensitivity"
      />
      <Tile
        icon={<Wallet className="h-3.5 w-3.5" />}
        label="Tax-Adjusted NW"
        value={fmtAudSigned(data.taxAdjustedNwDelta)}
        hint="Δ at Y10 under reform"
        tone={data.taxAdjustedNwDelta < 0 ? "warn" : "good"}
        data-testid="tile-tax-adjusted-nw"
      />
      <Tile
        icon={<Flame className="h-3.5 w-3.5" />}
        label="FIRE Delay"
        value={
          data.fireDeltaYears === 0
            ? "No delay"
            : `${data.fireDeltaYears > 0 ? "+" : "−"}${Math.abs(data.fireDeltaYears).toFixed(1)} yrs`
        }
        hint={data.fireDeltaYears > 0 ? "Reform delays FIRE" : data.fireDeltaYears < 0 ? "Reform accelerates FIRE" : "Unchanged"}
        tone={data.fireDeltaYears > 0 ? "warn" : data.fireDeltaYears < 0 ? "good" : "default"}
        data-testid="tile-fire-delay"
      />
    </div>
  );
}

export default RegimeDashboardCards;

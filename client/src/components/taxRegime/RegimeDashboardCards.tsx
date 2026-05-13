/**
 * RegimeDashboardCards.tsx — Premium dashboard tiles for the regime layer.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform · refined in P1c
 *
 * The brief's six KPIs are now presented as a calmer, mobile-first hierarchy:
 *
 *   Hero card (full-width, mobile + desktop)
 *     → "Wealth impact" — the single most important number
 *
 *   Secondary row (2 cols mobile, 5 cols desktop)
 *     → Active rules · Retirement shift · Reform exposure · Locked-in losses · Tax friction
 *
 * P1c refinements:
 *   - No internal jargon — labels use the PLAIN_LABEL dictionary
 *   - Hero numbers are large (text-2xl→text-3xl), captions are soft
 *   - Soft tinted surfaces instead of hard tinted borders
 *   - Single accent per card — no competing colours
 *   - Caller still supplies engine values verbatim — engine layer untouched
 */

import {
  Sparkles,
  Layers,
  Clock3,
  AlertTriangle,
  Wallet,
  Flame,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtAud, fmtAudSigned } from "./formatters";
import type { TaxPolicyRegimeKind } from "@/lib/taxPolicyEngine";
import { PLAIN_LABEL, PLAIN_HINT, type, tint, tone, spacing } from "./uxTokens";

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

/** A single calm tile — soft surface, no borders, hero number first. */
interface TileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: keyof typeof tint;       // soft tint background, optional
  valueTone?: keyof typeof tone;    // colour applied to the value only
  hero?: boolean;                    // larger number, more padding
  full?: boolean;                    // span full width
  "data-testid"?: string;
}

function Tile({
  icon, label, value, hint, accent = "none", valueTone, hero, full, ...rest
}: TileProps): JSX.Element {
  return (
    <Card
      className={cn(
        // Soft surface, no border
        "rounded-2xl border-0 shadow-[var(--shadow-sm)]",
        "bg-[hsl(var(--surface-1))]",
        tint[accent],
        full && "col-span-full",
      )}
      data-testid={rest["data-testid"]}
    >
      <CardContent className={cn(hero ? "p-5 sm:p-6" : "p-4 sm:p-5")}>
        {/* Eyebrow row — icon + soft label */}
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="inline-flex h-5 w-5 items-center justify-center">{icon}</span>
          <span className={type.eyebrow}>{label}</span>
        </div>
        {/* Hero number */}
        <div
          className={cn(
            "mt-2",
            hero ? type.hero : type.number,
            valueTone && tone[valueTone],
          )}
        >
          {value}
        </div>
        {/* Soft caption */}
        {hint && <div className={cn("mt-1", type.caption)}>{hint}</div>}
      </CardContent>
    </Card>
  );
}

function sensitivityLabel(s: number): string {
  if (s >= 70) return "High — multiple strategies affected";
  if (s >= 40) return "Moderate — some adjustments helpful";
  return "Low — your plan is largely robust";
}

function sensitivityAccent(s: number): keyof typeof tint {
  if (s >= 70) return "warn";
  if (s >= 40) return "info";
  return "good";
}

export function RegimeDashboardCards({ data, className }: Props): JSX.Element {
  const reformActive =
    data.activeRegime === "PROPOSED_2027_REFORM" ||
    (data.activeRegime === "AUTO_DETECT" && data.effectiveRegime === "PROPOSED_2027_REFORM");

  // Hero — Wealth Impact (the single most important number)
  const wealthDelta = data.taxAdjustedNwDelta;
  const wealthTone: keyof typeof tone =
    wealthDelta < 0 ? "bad" : wealthDelta > 0 ? "good" : "soft";
  const wealthAccent: keyof typeof tint =
    wealthDelta < 0 ? "bad" : wealthDelta > 0 ? "good" : "none";

  // FIRE shift
  const fireValue =
    data.fireDeltaYears === 0
      ? "Unchanged"
      : `${data.fireDeltaYears > 0 ? "+" : "−"}${Math.abs(data.fireDeltaYears).toFixed(1)} yrs`;
  const fireHint =
    data.fireDeltaYears > 0
      ? "Reform delays your retirement"
      : data.fireDeltaYears < 0
        ? "Reform brings retirement closer"
        : "No change to your retirement year";

  // Active regime
  const activeValue = PLAIN_LABEL[data.activeRegime];
  const activeHint =
    data.activeRegime === "AUTO_DETECT" && data.effectiveRegime
      ? `Best fit: ${data.effectiveRegime === "PROPOSED_2027_REFORM" ? "Proposed reform" : "Today's rules"}`
      : PLAIN_HINT.ACTIVE_REGIME;

  return (
    <div
      className={cn(
        // Mobile: 2 cols (hero spans full). Tablet: 2. Desktop: 5 + hero spans full.
        "grid grid-cols-2 lg:grid-cols-5",
        spacing.gridGap,
        className,
      )}
      data-testid="regime-dashboard-cards"
    >
      {/* HERO: Wealth Impact — full-width on every breakpoint */}
      <Tile
        full
        hero
        icon={<Wallet className="h-4 w-4" />}
        label={PLAIN_LABEL.TAX_ADJUSTED_NW}
        value={fmtAudSigned(wealthDelta)}
        hint={
          wealthDelta === 0
            ? "Your projected wealth is unchanged under the proposed reform"
            : wealthDelta < 0
              ? `Projected wealth is ${fmtAud(Math.abs(wealthDelta))} lower at year 10 under the proposed reform`
              : `Projected wealth is ${fmtAud(Math.abs(wealthDelta))} higher at year 10 under the proposed reform`
        }
        valueTone={wealthTone}
        accent={wealthAccent}
        data-testid="tile-tax-adjusted-nw"
      />

      {/* Secondary row */}
      <Tile
        icon={<Sparkles className="h-4 w-4" />}
        label={PLAIN_LABEL.TAX_REGIME_ACTIVE}
        value={activeValue}
        hint={activeHint}
        accent={reformActive ? "warn" : "good"}
        data-testid="tile-active-regime"
      />
      <Tile
        icon={<Flame className="h-4 w-4" />}
        label={PLAIN_LABEL.FIRE_DELAY}
        value={fireValue}
        hint={fireHint}
        valueTone={data.fireDeltaYears > 0 ? "bad" : data.fireDeltaYears < 0 ? "good" : "soft"}
        data-testid="tile-fire-delay"
      />
      <Tile
        icon={<AlertTriangle className="h-4 w-4" />}
        label={PLAIN_LABEL.REFORM_SENSITIVITY}
        value={
          data.reformSensitivity >= 70
            ? "High"
            : data.reformSensitivity >= 40
              ? "Moderate"
              : "Low"
        }
        hint={sensitivityLabel(data.reformSensitivity)}
        accent={sensitivityAccent(data.reformSensitivity)}
        data-testid="tile-reform-sensitivity"
      />
      <Tile
        icon={<Layers className="h-4 w-4" />}
        label={PLAIN_LABEL.DEFERRED_LOSS_BALANCE}
        value={fmtAud(data.deferredLossBalance)}
        hint={PLAIN_HINT.DEFERRED_LOSSES}
        valueTone="soft"
        data-testid="tile-deferred-loss"
      />
      <Tile
        icon={<Clock3 className="h-4 w-4" />}
        label={PLAIN_LABEL.TAX_TIMING_DRAG}
        value={fmtAudSigned(-Math.abs(data.timingDragYr1))}
        hint={PLAIN_HINT.TAX_FRICTION}
        valueTone={data.timingDragYr1 > 0 ? "bad" : "soft"}
        data-testid="tile-timing-drag"
      />
    </div>
  );
}

export default RegimeDashboardCards;

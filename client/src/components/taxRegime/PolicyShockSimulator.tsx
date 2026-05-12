/**
 * PolicyShockSimulator.tsx — "What if everything changes" stress panel.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform · refined in P1c
 *
 * P1c refinements:
 *   - Soft surface card, no hard borders, premium dark-mode feel.
 *   - Plain-English knob labels ("If negative gearing is removed", "Mortgage
 *     rate stress", etc.) — no jargon, no internal engine terms.
 *   - Hero outcome strip first: a single big "Wealth at year 10" number with
 *     a soft difference badge. Other outcomes become quieter secondary tiles.
 *   - Progressive disclosure: advanced rate / inflation / rent levers live
 *     behind an "Advanced stresses" toggle so the default state stays calm.
 *   - Reset action is a soft text button, not a chip.
 *
 * Public API (`PolicyShockInputs`, `PolicyShockOutputs`, `Props`) unchanged.
 * Compute remains caller-supplied — this component never imports an engine.
 */

import { useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { ChevronDown, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtAud, fmtAudSigned } from "./formatters";
import { surface, spacing, type, tone as toneTokens, tint, gridRecipe } from "./uxTokens";

export interface PolicyShockInputs {
  removeNegativeGearing: boolean;
  cgtDiscountPct: number;     // 0..0.5 (0 = no discount; 0.5 = current)
  rateShockPct: number;       // additive percentage points on mortgage rate
  inflationShockPct: number;  // additive percentage points on CPI
  rentSlowdownPct: number;    // multiplier reduction (e.g. -0.02 = 2pp slower rent growth)
}

export interface PolicyShockOutputs {
  netWorthAtY10: number;       // under stress
  netWorthBaseline: number;    // baseline (current rules, no shocks)
  fireDeltaYears: number;      // years later vs baseline
  cashflowSurvivabilityMonths: number; // runway after the shock
  passiveIncomeAtY10: number;
}

interface Props {
  baseline?: Partial<PolicyShockOutputs>;
  /** Called whenever inputs change. Caller computes outputs synchronously. */
  computeOutputs: (inputs: PolicyShockInputs) => PolicyShockOutputs;
  className?: string;
}

const DEFAULT_INPUTS: PolicyShockInputs = {
  removeNegativeGearing: false,
  cgtDiscountPct: 0.5,
  rateShockPct: 0,
  inflationShockPct: 0,
  rentSlowdownPct: 0,
};

export function PolicyShockSimulator({ computeOutputs, className }: Props): JSX.Element {
  const [inputs, setInputs] = useState<PolicyShockInputs>(DEFAULT_INPUTS);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const set = <K extends keyof PolicyShockInputs>(k: K, v: PolicyShockInputs[K]): void => {
    setInputs((prev) => ({ ...prev, [k]: v }));
  };

  const outputs = useMemo(() => computeOutputs(inputs), [inputs, computeOutputs]);
  const baselineOutputs = useMemo(() => computeOutputs(DEFAULT_INPUTS), [computeOutputs]);

  const nwDelta = outputs.netWorthAtY10 - baselineOutputs.netWorthAtY10;
  const passiveDelta = outputs.passiveIncomeAtY10 - baselineOutputs.passiveIncomeAtY10;

  const nwTone: keyof typeof toneTokens =
    nwDelta < -1 ? "bad" : nwDelta > 1 ? "good" : "soft";

  const isDirty =
    inputs.removeNegativeGearing !== DEFAULT_INPUTS.removeNegativeGearing ||
    inputs.cgtDiscountPct !== DEFAULT_INPUTS.cgtDiscountPct ||
    inputs.rateShockPct !== DEFAULT_INPUTS.rateShockPct ||
    inputs.inflationShockPct !== DEFAULT_INPUTS.inflationShockPct ||
    inputs.rentSlowdownPct !== DEFAULT_INPUTS.rentSlowdownPct;

  return (
    <section
      className={cn(surface.card, spacing.cardPad, "space-y-4", className)}
      data-testid="policy-shock-simulator"
    >
      {/* Heading row */}
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className={type.eyebrow}>Stress test</p>
          <h3 className={type.sectionTitle}>What if policy or rates change?</h3>
          <p className={type.caption}>
            Move a lever to see how your plan responds. Reset returns to today's settings.
          </p>
        </div>
        {isDirty && (
          <button
            type="button"
            onClick={() => setInputs(DEFAULT_INPUTS)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs",
              "text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-2))]",
              "transition-colors",
            )}
          >
            <RefreshCw className="h-3 w-3" />
            Reset
          </button>
        )}
      </header>

      {/* Hero outcome strip */}
      <div className={cn(gridRecipe.compare3, spacing.gridGap)}>
        <HeroOutcome
          label="Wealth at year 10"
          value={fmtAud(outputs.netWorthAtY10)}
          deltaLabel={Math.abs(nwDelta) > 1 ? `${fmtAudSigned(nwDelta)} vs today's rules` : "In line with today's rules"}
          tintKey={nwTone === "bad" ? "bad" : nwTone === "good" ? "good" : "none"}
          toneKey={nwTone}
        />
        <SecondaryOutcome
          label="Retirement shift"
          value={`${outputs.fireDeltaYears > 0 ? "+" : ""}${outputs.fireDeltaYears.toFixed(1)} yrs`}
          adverse={outputs.fireDeltaYears > 0.1}
          good={outputs.fireDeltaYears < -0.1}
        />
        <SecondaryOutcome
          label="Cash runway"
          value={`${outputs.cashflowSurvivabilityMonths.toFixed(0)} months`}
          adverse={outputs.cashflowSurvivabilityMonths < 6}
          good={outputs.cashflowSurvivabilityMonths >= 12}
        />
      </div>

      {/* Passive income subline (quiet) */}
      <p className={type.caption}>
        Passive income at year 10:{" "}
        <span className="font-medium text-foreground tabular-nums">
          {fmtAud(outputs.passiveIncomeAtY10)}
        </span>
        {Math.abs(passiveDelta) > 1 && (
          <>
            {" · "}
            <span className={cn(passiveDelta < 0 ? toneTokens.bad : toneTokens.good)}>
              {fmtAudSigned(passiveDelta)}
            </span>
          </>
        )}
      </p>

      {/* Primary levers — always visible */}
      <div className={cn(surface.well, "p-4 space-y-4")}>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="shock-ng" className="cursor-pointer text-sm font-medium">
            If negative gearing is removed
          </Label>
          <Switch
            id="shock-ng"
            checked={inputs.removeNegativeGearing}
            onCheckedChange={(v) => set("removeNegativeGearing", v)}
          />
        </div>

        <LeverRow
          label="CGT discount"
          value={`${(inputs.cgtDiscountPct * 100).toFixed(0)}%`}
          hint="Today's setting is 50%. Lower means more tax on gains."
        >
          <Slider
            value={[inputs.cgtDiscountPct * 100]}
            onValueChange={(v) => set("cgtDiscountPct", v[0] / 100)}
            min={0}
            max={50}
            step={5}
            aria-label="CGT discount"
          />
        </LeverRow>
      </div>

      {/* Advanced — progressive disclosure */}
      <button
        type="button"
        onClick={() => setShowAdvanced((s) => !s)}
        className={cn(
          "flex w-full items-center justify-between rounded-xl px-1 py-2",
          "text-sm text-muted-foreground hover:text-foreground transition-colors",
        )}
        aria-expanded={showAdvanced}
      >
        <span>Advanced stresses · rates, inflation, rent</span>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")}
        />
      </button>

      {showAdvanced && (
        <div className={cn(surface.well, "p-4 space-y-4")}>
          <LeverRow
            label="Mortgage rate stress"
            value={`${inputs.rateShockPct > 0 ? "+" : ""}${inputs.rateShockPct.toFixed(2)} pp`}
            hint="Adds to your modelled mortgage rate."
          >
            <Slider
              value={[inputs.rateShockPct]}
              onValueChange={(v) => set("rateShockPct", v[0])}
              min={0}
              max={3}
              step={0.25}
              aria-label="Mortgage rate stress"
            />
          </LeverRow>

          <LeverRow
            label="Inflation stress"
            value={`${inputs.inflationShockPct > 0 ? "+" : ""}${inputs.inflationShockPct.toFixed(1)} pp`}
            hint="Adds to modelled CPI — pushes up expenses."
          >
            <Slider
              value={[inputs.inflationShockPct]}
              onValueChange={(v) => set("inflationShockPct", v[0])}
              min={0}
              max={4}
              step={0.5}
              aria-label="Inflation stress"
            />
          </LeverRow>

          <LeverRow
            label="Rent growth slowdown"
            value={`${inputs.rentSlowdownPct.toFixed(1)} pp slower`}
            hint="Reduces modelled annual rent growth."
          >
            <Slider
              value={[inputs.rentSlowdownPct]}
              onValueChange={(v) => set("rentSlowdownPct", v[0])}
              min={0}
              max={4}
              step={0.5}
              aria-label="Rent slowdown"
            />
          </LeverRow>
        </div>
      )}

      <p className={cn(type.caption, "italic")}>
        This is modelling only and not personal tax advice. Stress-test combinations are
        illustrative — real policy outcomes will depend on legislative detail.
      </p>
    </section>
  );
}

interface HeroOutcomeProps {
  label: string;
  value: string;
  deltaLabel: string;
  tintKey: keyof typeof tint;
  toneKey: keyof typeof toneTokens;
}

function HeroOutcome({ label, value, deltaLabel, tintKey, toneKey }: HeroOutcomeProps): JSX.Element {
  return (
    <div className={cn("rounded-xl p-4 space-y-1.5", tint[tintKey])}>
      <p className={type.eyebrow}>{label}</p>
      <p className={type.hero}>{value}</p>
      <p className={cn(type.caption, toneKey !== "soft" && toneTokens[toneKey])}>{deltaLabel}</p>
    </div>
  );
}

interface SecondaryOutcomeProps {
  label: string;
  value: string;
  adverse?: boolean;
  good?: boolean;
}

function SecondaryOutcome({ label, value, adverse, good }: SecondaryOutcomeProps): JSX.Element {
  const accent = adverse ? toneTokens.bad : good ? toneTokens.good : "text-foreground";
  return (
    <div className="rounded-xl p-4 space-y-1.5 bg-[hsl(var(--surface-2)/0.5)]">
      <p className={type.eyebrow}>{label}</p>
      <p className={cn(type.number, accent)}>{value}</p>
    </div>
  );
}

interface LeverRowProps {
  label: string;
  value: string;
  hint: string;
  children: React.ReactNode;
}

function LeverRow({ label, value, hint, children }: LeverRowProps): JSX.Element {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-sm font-medium">{label}</Label>
        <span className="text-sm font-medium tabular-nums text-foreground">{value}</span>
      </div>
      {children}
      <p className={type.caption}>{hint}</p>
    </div>
  );
}

export default PolicyShockSimulator;

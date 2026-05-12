/**
 * PolicyShockSimulator.tsx — Premium "what if everything changes" panel.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform
 *
 * Lets the user toggle a battery of stresses (NG removal, CGT cut, rate
 * shock, inflation shock, rent slowdown) and see the impact on net worth,
 * FIRE date, cashflow survivability, and passive income.
 *
 * Compute is delegated to a caller-supplied callback so this component
 * stays presentation-only; it never imports an engine directly.
 */

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Zap, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtAud, fmtAudSigned } from "./formatters";

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
  const set = <K extends keyof PolicyShockInputs>(k: K, v: PolicyShockInputs[K]): void => {
    setInputs((prev) => ({ ...prev, [k]: v }));
  };
  const outputs = useMemo(() => computeOutputs(inputs), [inputs, computeOutputs]);

  const baselineOutputs = useMemo(() => computeOutputs(DEFAULT_INPUTS), [computeOutputs]);

  return (
    <Card className={cn("overflow-hidden", className)} data-testid="policy-shock-simulator">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Zap className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          <CardTitle className="text-base font-semibold">Policy Shock Simulator</CardTitle>
          <Badge variant="outline" className="text-[10px]">Premium · Stress test</Badge>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-[11px]"
            onClick={() => setInputs(DEFAULT_INPUTS)}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border/40 p-2">
              <Label htmlFor="shock-ng" className="cursor-pointer text-xs">
                Remove negative gearing
              </Label>
              <Switch
                id="shock-ng"
                checked={inputs.removeNegativeGearing}
                onCheckedChange={(v) => set("removeNegativeGearing", v)}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">CGT discount</Label>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {(inputs.cgtDiscountPct * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                value={[inputs.cgtDiscountPct * 100]}
                onValueChange={(v) => set("cgtDiscountPct", v[0] / 100)}
                min={0}
                max={50}
                step={5}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Rate shock</Label>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {inputs.rateShockPct > 0 ? "+" : ""}{inputs.rateShockPct.toFixed(1)}pp
                </span>
              </div>
              <Slider
                value={[inputs.rateShockPct]}
                onValueChange={(v) => set("rateShockPct", v[0])}
                min={0}
                max={3}
                step={0.25}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Inflation shock</Label>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {inputs.inflationShockPct > 0 ? "+" : ""}{inputs.inflationShockPct.toFixed(1)}pp
                </span>
              </div>
              <Slider
                value={[inputs.inflationShockPct]}
                onValueChange={(v) => set("inflationShockPct", v[0])}
                min={0}
                max={4}
                step={0.5}
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Rent slowdown</Label>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {inputs.rentSlowdownPct.toFixed(1)}pp slower
                </span>
              </div>
              <Slider
                value={[inputs.rentSlowdownPct]}
                onValueChange={(v) => set("rentSlowdownPct", v[0])}
                min={0}
                max={4}
                step={0.5}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Outcome label="Net worth Y10" value={fmtAud(outputs.netWorthAtY10)} delta={outputs.netWorthAtY10 - baselineOutputs.netWorthAtY10} />
          <Outcome label="FIRE Δ" value={`${outputs.fireDeltaYears > 0 ? "+" : ""}${outputs.fireDeltaYears.toFixed(1)} yrs`} adverse={outputs.fireDeltaYears > 0} />
          <Outcome label="Cashflow runway" value={`${outputs.cashflowSurvivabilityMonths.toFixed(0)} mo`} adverse={outputs.cashflowSurvivabilityMonths < 6} />
          <Outcome label="Passive income Y10" value={fmtAud(outputs.passiveIncomeAtY10)} delta={outputs.passiveIncomeAtY10 - baselineOutputs.passiveIncomeAtY10} />
        </div>

        <p className="flex items-start gap-1 text-[10px] italic text-muted-foreground">
          <Activity className="mt-0.5 h-3 w-3 shrink-0" />
          This is modelling only and not personal tax advice. Stress-test combinations are
          illustrative — real policy outcomes will depend on legislative detail.
        </p>
      </CardContent>
    </Card>
  );
}

function Outcome({ label, value, delta, adverse }: { label: string; value: string; delta?: number; adverse?: boolean }): JSX.Element {
  const tone =
    adverse ? "border-rose-500/40 bg-rose-50/30 dark:bg-rose-950/15"
    : delta !== undefined && delta < 0 ? "border-rose-500/40 bg-rose-50/30 dark:bg-rose-950/15"
    : delta !== undefined && delta > 0 ? "border-emerald-500/40 bg-emerald-50/30 dark:bg-emerald-950/15"
    : "border-border";
  return (
    <div className={cn("rounded-md border p-2", tone)}>
      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
      {delta !== undefined && Math.abs(delta) > 1 && (
        <div className="text-[10px] tabular-nums text-muted-foreground">{fmtAudSigned(delta)} vs baseline</div>
      )}
    </div>
  );
}

export default PolicyShockSimulator;

/**
 * V3 — Advanced Assumption Capture.
 *
 * Structured input for household / income / debt / property / investing
 * context. Values are stored client-side (state lifted to the parent page)
 * and feed two consumers:
 *
 *   1. The engine's `household` input (dependants + incomeVolatility)
 *   2. The narrative layer (qualitative interpretation)
 *
 * No production database schema change. The full assumption set lives in
 * memory only; the engine ignores anything it doesn't recognise.
 */

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronUp,
  Users,
  Briefcase,
  CreditCard,
  Home,
  PieChart,
} from "lucide-react";

export interface AdvancedAssumptions {
  household: {
    adults: number;
    children: number;
    dependants: number;
    childcareStage: "none" | "infant" | "preschool" | "primary" | "secondary";
    schoolingStage: "preschool" | "primary" | "secondary" | "tertiary" | "none";
    schoolingType: "public" | "private" | "mixed";
    dependantsPlanned: boolean;
  };
  income: {
    dualIncome: boolean;
    salaryStability: "very_stable" | "stable" | "variable" | "highly_variable";
    contractorRisk: boolean;
    bonusIncomeShare: number;          // 0..1
    expectedIncomeVolatility: number;  // 0..1
    redundancyRisk: "low" | "medium" | "high";
    industryCyclicality: "low" | "medium" | "high";
  };
  debt: {
    ioVsPiSplit: number;          // 0..1 share IO
    fixedVsVariableSplit: number; // 0..1 share fixed
    offsetBalance: number;
    refinanceHorizonMonths: number;
    debtStressComfort: "low" | "medium" | "high";
    acceptableDsr: number;        // 0..1
    repaymentAggressiveness: "minimum" | "moderate" | "aggressive";
  };
  property: {
    preferredType: "house" | "townhouse" | "unit" | "land" | "no_preference";
    targetRegion: string;
    expectedHoldYears: number;
    yieldVsGrowth: number;        // 0..1; 0=yield, 1=growth
    renovationAppetite: "none" | "cosmetic" | "structural";
    developmentAppetite: "none" | "minor" | "major";
  };
  investing: {
    etfFamiliarity: "beginner" | "intermediate" | "advanced";
    cryptoConviction: "none" | "low" | "medium" | "high";
    drawdownTolerance: number;    // 0..1 (1 = high tolerance)
    dcaPreference: "lump" | "dca12" | "dca24" | "neutral";
    leverageAcceptance: "none" | "moderate" | "high";
    concentrationTolerance: number; // 0..1
  };
}

export const DEFAULT_ADVANCED_ASSUMPTIONS: AdvancedAssumptions = {
  household: {
    adults: 2,
    children: 0,
    dependants: 0,
    childcareStage: "none",
    schoolingStage: "none",
    schoolingType: "public",
    dependantsPlanned: false,
  },
  income: {
    dualIncome: true,
    salaryStability: "stable",
    contractorRisk: false,
    bonusIncomeShare: 0.1,
    expectedIncomeVolatility: 0.15,
    redundancyRisk: "low",
    industryCyclicality: "low",
  },
  debt: {
    ioVsPiSplit: 0,
    fixedVsVariableSplit: 0,
    offsetBalance: 0,
    refinanceHorizonMonths: 24,
    debtStressComfort: "medium",
    acceptableDsr: 0.40,
    repaymentAggressiveness: "moderate",
  },
  property: {
    preferredType: "no_preference",
    targetRegion: "",
    expectedHoldYears: 15,
    yieldVsGrowth: 0.5,
    renovationAppetite: "none",
    developmentAppetite: "none",
  },
  investing: {
    etfFamiliarity: "intermediate",
    cryptoConviction: "low",
    drawdownTolerance: 0.5,
    dcaPreference: "neutral",
    leverageAcceptance: "moderate",
    concentrationTolerance: 0.5,
  },
};

interface SectionMeta {
  key: keyof AdvancedAssumptions;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
}

const SECTIONS: SectionMeta[] = [
  { key: "household", label: "Household",   subtitle: "Family structure, schooling, dependants", icon: <Users className="h-4 w-4" /> },
  { key: "income",    label: "Income",      subtitle: "Stability, bonuses, redundancy risk",     icon: <Briefcase className="h-4 w-4" /> },
  { key: "debt",      label: "Debt",        subtitle: "Structure, offset, repayment pace",       icon: <CreditCard className="h-4 w-4" /> },
  { key: "property",  label: "Property",    subtitle: "Type, region, hold horizon",              icon: <Home className="h-4 w-4" /> },
  { key: "investing", label: "Investing",   subtitle: "Risk style, DCA, concentration",          icon: <PieChart className="h-4 w-4" /> },
];

export interface AdvancedAssumptionCaptureProps {
  value: AdvancedAssumptions;
  onChange: (v: AdvancedAssumptions) => void;
}

export function AdvancedAssumptionCapture({ value, onChange }: AdvancedAssumptionCaptureProps) {
  const [open, setOpen] = useState<Partial<Record<keyof AdvancedAssumptions, boolean>>>({});
  const toggle = (k: keyof AdvancedAssumptions) =>
    setOpen((prev) => ({ ...prev, [k]: !prev[k] }));

  const customisedCount = countCustomised(value);

  return (
    <Card className="border-border" data-testid="advanced-assumption-capture">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
          Advanced assumptions
          {customisedCount > 0 && (
            <Badge variant="outline" className="text-[10px]">{customisedCount} customised</Badge>
          )}
        </CardTitle>
        <CardDescription className="text-xs leading-snug">
          Optional context the engine and narrative use to tailor recommendations. Defaults are sensible — change only what matters for your household.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-0">
        {SECTIONS.map((s) => {
          const isOpen = open[s.key] ?? false;
          return (
            <div
              key={s.key}
              className="rounded-lg border border-border bg-card/40"
              data-testid={`assumption-section-${s.key}`}
            >
              <button
                type="button"
                onClick={() => toggle(s.key)}
                aria-expanded={isOpen}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-muted/40 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[hsl(var(--intelligence-light))]">{s.icon}</span>
                  <div>
                    <div className="text-xs sm:text-sm font-semibold">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground">{s.subtitle}</div>
                  </div>
                </div>
                <span className="text-muted-foreground">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </button>
              {isOpen && (
                <div className="p-3 border-t border-border">
                  {s.key === "household" && (
                    <HouseholdFields value={value.household} onChange={(v) => onChange({ ...value, household: v })} />
                  )}
                  {s.key === "income" && (
                    <IncomeFields value={value.income} onChange={(v) => onChange({ ...value, income: v })} />
                  )}
                  {s.key === "debt" && (
                    <DebtFields value={value.debt} onChange={(v) => onChange({ ...value, debt: v })} />
                  )}
                  {s.key === "property" && (
                    <PropertyFields value={value.property} onChange={(v) => onChange({ ...value, property: v })} />
                  )}
                  {s.key === "investing" && (
                    <InvestingFields value={value.investing} onChange={(v) => onChange({ ...value, investing: v })} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─── Section field components ────────────────────────────────────────────────

function NumField({
  label, value, min, max, step, onChange,
}: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className="h-9 text-xs"
      />
    </div>
  );
}

function SelectField<T extends string>({
  label, value, options, onChange,
}: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px]">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-9 text-xs w-full rounded-md border border-border bg-background px-2"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleField({
  label, value, onChange,
}: { label: string; value: boolean; onChange: (b: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[11px]">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-border"
      />
      <span>{label}</span>
    </label>
  );
}

function PctSliderField({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-[11px]">{label}</Label>
        <span className="text-[11px] tabular-nums font-semibold">{Math.round(value * 100)}%</span>
      </div>
      <Slider
        value={[Math.round(value * 100)]}
        min={0} max={100} step={5}
        onValueChange={([n]) => onChange(n / 100)}
      />
    </div>
  );
}

function HouseholdFields({ value, onChange }: { value: AdvancedAssumptions["household"]; onChange: (v: AdvancedAssumptions["household"]) => void }) {
  const set = <K extends keyof AdvancedAssumptions["household"]>(k: K, v: AdvancedAssumptions["household"][K]) =>
    onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <NumField label="Adults" value={value.adults} min={1} max={4} step={1} onChange={(n) => set("adults", n)} />
      <NumField label="Children" value={value.children} min={0} max={8} step={1} onChange={(n) => set("children", n)} />
      <NumField label="Dependants" value={value.dependants} min={0} max={8} step={1} onChange={(n) => set("dependants", n)} />
      <SelectField label="Childcare stage" value={value.childcareStage} onChange={(v) => set("childcareStage", v)} options={[
        { value: "none", label: "None" },
        { value: "infant", label: "Infant" },
        { value: "preschool", label: "Preschool" },
        { value: "primary", label: "Primary" },
        { value: "secondary", label: "Secondary" },
      ]} />
      <SelectField label="Schooling stage" value={value.schoolingStage} onChange={(v) => set("schoolingStage", v)} options={[
        { value: "none", label: "None / not applicable" },
        { value: "preschool", label: "Preschool" },
        { value: "primary", label: "Primary" },
        { value: "secondary", label: "Secondary" },
        { value: "tertiary", label: "Tertiary" },
      ]} />
      <SelectField label="Schooling type" value={value.schoolingType} onChange={(v) => set("schoolingType", v)} options={[
        { value: "public", label: "Public" },
        { value: "private", label: "Private" },
        { value: "mixed", label: "Mixed" },
      ]} />
      <div className="sm:col-span-2 lg:col-span-3">
        <ToggleField label="Additional dependants planned in the next 5 years" value={value.dependantsPlanned} onChange={(b) => set("dependantsPlanned", b)} />
      </div>
    </div>
  );
}

function IncomeFields({ value, onChange }: { value: AdvancedAssumptions["income"]; onChange: (v: AdvancedAssumptions["income"]) => void }) {
  const set = <K extends keyof AdvancedAssumptions["income"]>(k: K, v: AdvancedAssumptions["income"][K]) =>
    onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <ToggleField label="Dual income household" value={value.dualIncome} onChange={(b) => set("dualIncome", b)} />
      <ToggleField label="Contractor / business risk" value={value.contractorRisk} onChange={(b) => set("contractorRisk", b)} />
      <SelectField label="Salary stability" value={value.salaryStability} onChange={(v) => set("salaryStability", v)} options={[
        { value: "very_stable", label: "Very stable" },
        { value: "stable", label: "Stable" },
        { value: "variable", label: "Variable" },
        { value: "highly_variable", label: "Highly variable" },
      ]} />
      <SelectField label="Redundancy risk" value={value.redundancyRisk} onChange={(v) => set("redundancyRisk", v)} options={[
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ]} />
      <SelectField label="Industry cyclicality" value={value.industryCyclicality} onChange={(v) => set("industryCyclicality", v)} options={[
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ]} />
      <PctSliderField label="Bonus income share" value={value.bonusIncomeShare} onChange={(n) => set("bonusIncomeShare", n)} />
      <PctSliderField label="Expected income volatility" value={value.expectedIncomeVolatility} onChange={(n) => set("expectedIncomeVolatility", n)} />
    </div>
  );
}

function DebtFields({ value, onChange }: { value: AdvancedAssumptions["debt"]; onChange: (v: AdvancedAssumptions["debt"]) => void }) {
  const set = <K extends keyof AdvancedAssumptions["debt"]>(k: K, v: AdvancedAssumptions["debt"][K]) =>
    onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <PctSliderField label="IO share of debt" value={value.ioVsPiSplit} onChange={(n) => set("ioVsPiSplit", n)} />
      <PctSliderField label="Fixed share of debt" value={value.fixedVsVariableSplit} onChange={(n) => set("fixedVsVariableSplit", n)} />
      <div className="space-y-1">
        <Label className="text-[11px]">Offset balance ($)</Label>
        <Input type="number" value={value.offsetBalance} min={0} step={1000} onChange={(e) => set("offsetBalance", Math.max(0, Number(e.target.value) || 0))} className="h-9 text-xs" />
      </div>
      <NumField label="Refinance horizon (months)" value={value.refinanceHorizonMonths} min={0} max={120} step={6} onChange={(n) => set("refinanceHorizonMonths", n)} />
      <SelectField label="Debt-stress comfort" value={value.debtStressComfort} onChange={(v) => set("debtStressComfort", v)} options={[
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ]} />
      <PctSliderField label="Acceptable DSR" value={value.acceptableDsr} onChange={(n) => set("acceptableDsr", n)} />
      <SelectField label="Repayment aggressiveness" value={value.repaymentAggressiveness} onChange={(v) => set("repaymentAggressiveness", v)} options={[
        { value: "minimum", label: "Minimum required" },
        { value: "moderate", label: "Moderate" },
        { value: "aggressive", label: "Aggressive" },
      ]} />
    </div>
  );
}

function PropertyFields({ value, onChange }: { value: AdvancedAssumptions["property"]; onChange: (v: AdvancedAssumptions["property"]) => void }) {
  const set = <K extends keyof AdvancedAssumptions["property"]>(k: K, v: AdvancedAssumptions["property"][K]) =>
    onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <SelectField label="Preferred property type" value={value.preferredType} onChange={(v) => set("preferredType", v)} options={[
        { value: "no_preference", label: "No preference" },
        { value: "house", label: "House" },
        { value: "townhouse", label: "Townhouse" },
        { value: "unit", label: "Unit / apartment" },
        { value: "land", label: "Land / development" },
      ]} />
      <div className="space-y-1">
        <Label className="text-[11px]">Target region</Label>
        <Input value={value.targetRegion} placeholder="e.g. Brisbane inner-north" onChange={(e) => set("targetRegion", e.target.value)} className="h-9 text-xs" />
      </div>
      <NumField label="Expected hold (years)" value={value.expectedHoldYears} min={1} max={40} step={1} onChange={(n) => set("expectedHoldYears", n)} />
      <PctSliderField label="Growth vs yield (0=yield, 100=growth)" value={value.yieldVsGrowth} onChange={(n) => set("yieldVsGrowth", n)} />
      <SelectField label="Renovation appetite" value={value.renovationAppetite} onChange={(v) => set("renovationAppetite", v)} options={[
        { value: "none", label: "None" },
        { value: "cosmetic", label: "Cosmetic" },
        { value: "structural", label: "Structural" },
      ]} />
      <SelectField label="Development appetite" value={value.developmentAppetite} onChange={(v) => set("developmentAppetite", v)} options={[
        { value: "none", label: "None" },
        { value: "minor", label: "Minor" },
        { value: "major", label: "Major" },
      ]} />
    </div>
  );
}

function InvestingFields({ value, onChange }: { value: AdvancedAssumptions["investing"]; onChange: (v: AdvancedAssumptions["investing"]) => void }) {
  const set = <K extends keyof AdvancedAssumptions["investing"]>(k: K, v: AdvancedAssumptions["investing"][K]) =>
    onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <SelectField label="ETF familiarity" value={value.etfFamiliarity} onChange={(v) => set("etfFamiliarity", v)} options={[
        { value: "beginner", label: "Beginner" },
        { value: "intermediate", label: "Intermediate" },
        { value: "advanced", label: "Advanced" },
      ]} />
      <SelectField label="Crypto conviction" value={value.cryptoConviction} onChange={(v) => set("cryptoConviction", v)} options={[
        { value: "none", label: "None" },
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ]} />
      <PctSliderField label="Drawdown tolerance" value={value.drawdownTolerance} onChange={(n) => set("drawdownTolerance", n)} />
      <SelectField label="DCA preference" value={value.dcaPreference} onChange={(v) => set("dcaPreference", v)} options={[
        { value: "neutral", label: "Neutral" },
        { value: "lump", label: "Lump sum" },
        { value: "dca12", label: "DCA 12mo" },
        { value: "dca24", label: "DCA 24mo" },
      ]} />
      <SelectField label="Leverage acceptance" value={value.leverageAcceptance} onChange={(v) => set("leverageAcceptance", v)} options={[
        { value: "none", label: "None" },
        { value: "moderate", label: "Moderate" },
        { value: "high", label: "High" },
      ]} />
      <PctSliderField label="Concentration tolerance" value={value.concentrationTolerance} onChange={(n) => set("concentrationTolerance", n)} />
    </div>
  );
}

function countCustomised(v: AdvancedAssumptions): number {
  let n = 0;
  const def = DEFAULT_ADVANCED_ASSUMPTIONS;
  for (const sk of Object.keys(def) as (keyof AdvancedAssumptions)[]) {
    const a = v[sk] as Record<string, unknown>;
    const d = def[sk] as Record<string, unknown>;
    for (const k of Object.keys(d)) {
      if (a[k] !== d[k]) n++;
    }
  }
  return n;
}

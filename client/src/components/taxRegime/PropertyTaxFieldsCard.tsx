/**
 * PropertyTaxFieldsCard.tsx — Additive sub-form for tax-policy metadata.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform · refined in P1c
 *
 * P1c refinements:
 *   - Friendlier section title and helper copy — no "additive sub-form".
 *   - Grouped fields: "What and when" (type + dates) is the always-visible
 *     primary group. Planned-sale date moves behind a progressive-disclosure
 *     toggle ("Tax planning timing — optional") to reduce default density.
 *   - Status footer is a soft surface with a single accent dot and plain-
 *     English headline, not a coloured bordered alert.
 *   - Removed shouting "Additive — does not affect existing fields" badge.
 *   - Pills are dot-prefixed soft pills, consistent with StrategyReformTags.
 *
 * Public API (`PropertyTaxFields`, `Props`) unchanged.
 * State remains caller-controlled.
 */

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resolveAutoDetectedRegime,
  type PropertyType,
} from "@/lib/taxPolicyEngine";
import { surface, spacing, type, tone as toneTokens } from "./uxTokens";

export interface PropertyTaxFields {
  propertyType: PropertyType;
  contractDate?: string;     // ISO yyyy-MM-dd
  purchaseDate?: string;     // settlement
  plannedSaleDate?: string;
}

interface Props {
  value: PropertyTaxFields;
  onChange: (next: PropertyTaxFields) => void;
  className?: string;
}

const TYPE_OPTIONS: { value: PropertyType; label: string; hint: string }[] = [
  { value: "ESTABLISHED",        label: "Established",        hint: "Existing dwelling — may be affected after the reform cutoff" },
  { value: "NEW_BUILD",          label: "New build",          hint: "Brand-new dwelling — typically carved out" },
  { value: "BUILD_TO_RENT",      label: "Build-to-rent",      hint: "Institutional BTR — typically carved out" },
  { value: "AFFORDABLE_HOUSING", label: "Affordable housing", hint: "NRAS-style — typically carved out" },
  { value: "UNKNOWN",            label: "Not sure yet",       hint: "We'll default to today's rules until you confirm" },
];

interface PillProps {
  dot: "good" | "warn";
  label: string;
}

function Pill({ dot, label }: PillProps): JSX.Element {
  const dotClass = dot === "good" ? "bg-emerald-500" : "bg-amber-500";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--surface-2))] px-2.5 py-1 text-xs text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
      {label}
    </span>
  );
}

function statusPills(v: PropertyTaxFields): PillProps[] {
  const detect = resolveAutoDetectedRegime({
    propertyType: v.propertyType,
    contractDate: v.contractDate,
    purchaseDate: v.purchaseDate,
  });

  const pills: PillProps[] = [];

  if (detect.resolvedRegimeKind === "CURRENT_RULES" && !detect.requiresUserConfirmation) {
    pills.push({ dot: "good", label: "Grandfathered" });
    pills.push({ dot: "good", label: "Immediate deduction allowed" });
  } else if (detect.resolvedRegimeKind === "PROPOSED_2027_REFORM") {
    if (v.propertyType === "ESTABLISHED") {
      pills.push({ dot: "warn", label: "Reform affected" });
      pills.push({ dot: "warn", label: "Loss carry-forward applies" });
    } else if (v.propertyType === "NEW_BUILD") {
      pills.push({ dot: "good", label: "New-build eligible" });
      pills.push({ dot: "good", label: "Immediate deduction allowed" });
    } else if (
      v.propertyType === "BUILD_TO_RENT" ||
      v.propertyType === "AFFORDABLE_HOUSING"
    ) {
      pills.push({ dot: "good", label: "Carve-out — today's rules apply" });
    }
  }
  if (detect.requiresUserConfirmation) {
    pills.push({ dot: "warn", label: "Needs confirmation" });
  }
  return pills;
}

export function PropertyTaxFieldsCard({ value, onChange, className }: Props): JSX.Element {
  const [showTiming, setShowTiming] = useState<boolean>(Boolean(value.plannedSaleDate));

  const set = <K extends keyof PropertyTaxFields>(k: K, v: PropertyTaxFields[K]): void => {
    onChange({ ...value, [k]: v });
  };

  const detection = resolveAutoDetectedRegime({
    propertyType: value.propertyType,
    contractDate: value.contractDate,
    purchaseDate: value.purchaseDate,
  });

  const isReform = detection.resolvedRegimeKind === "PROPOSED_2027_REFORM";
  const isUnknown = detection.requiresUserConfirmation;
  const dotClass = isUnknown ? "bg-amber-500" : isReform ? "bg-amber-500" : "bg-emerald-500";
  const dotTone: keyof typeof toneTokens = isUnknown ? "warn" : isReform ? "warn" : "good";
  const headline = isUnknown
    ? "We'll model today's rules until you confirm"
    : isReform
      ? "Modelled under proposed 2027 reform"
      : "Modelled under today's rules";

  return (
    <section
      className={cn(surface.card, spacing.cardPad, "space-y-4", className)}
      data-testid="property-tax-fields"
    >
      <header className="space-y-1">
        <p className={type.eyebrow}>Tax policy details</p>
        <h3 className={type.sectionTitle}>How should we treat this property?</h3>
        <p className={type.caption}>
          A few details so we can apply the right rules. We won't touch your existing
          property fields.
        </p>
      </header>

      {/* What and when — primary group */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Property type</Label>
          <Select
            value={value.propertyType}
            onValueChange={(v) => set("propertyType", v as PropertyType)}
          >
            <SelectTrigger className="h-10 text-sm bg-[hsl(var(--surface-2))] border-0">
              <SelectValue placeholder="Choose a type" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  <div className="flex flex-col py-0.5">
                    <span className="text-sm">{o.label}</span>
                    <span className="text-[11px] text-muted-foreground">{o.hint}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Contract date</Label>
          <Input
            type="date"
            value={value.contractDate ?? ""}
            onChange={(e) => set("contractDate", e.target.value || undefined)}
            className="h-10 text-sm bg-[hsl(var(--surface-2))] border-0"
          />
          <p className={type.caption}>When you signed the contract.</p>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-sm font-medium">Settlement date</Label>
          <Input
            type="date"
            value={value.purchaseDate ?? ""}
            onChange={(e) => set("purchaseDate", e.target.value || undefined)}
            className="h-10 text-sm bg-[hsl(var(--surface-2))] border-0"
          />
          <p className={type.caption}>When ownership transferred to you.</p>
        </div>
      </div>

      {/* Optional sale-timing — progressive disclosure */}
      <div className={surface.divider} />

      <button
        type="button"
        onClick={() => setShowTiming((s) => !s)}
        className={cn(
          "flex w-full items-center justify-between rounded-xl px-1 py-2",
          "text-sm text-muted-foreground hover:text-foreground transition-colors",
        )}
        aria-expanded={showTiming}
      >
        <span>Tax planning timing · optional</span>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", showTiming && "rotate-180")}
        />
      </button>

      {showTiming && (
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Planned sale date</Label>
          <Input
            type="date"
            value={value.plannedSaleDate ?? ""}
            onChange={(e) => set("plannedSaleDate", e.target.value || undefined)}
            className="h-10 text-sm bg-[hsl(var(--surface-2))] border-0"
          />
          <p className={type.caption}>
            Helps us model capital gains timing. Leave blank if you're not sure.
          </p>
        </div>
      )}

      {/* Live status well */}
      <div className={cn(surface.well, "p-4 space-y-2")}>
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full shrink-0", dotClass)} aria-hidden="true" />
          <p className={cn("text-sm font-medium", toneTokens[dotTone])}>{headline}</p>
        </div>
        <p className={type.body}>{detection.reason}</p>
        {statusPills(value).length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {statusPills(value).map((p, i) => (
              <Pill key={i} dot={p.dot} label={p.label} />
            ))}
          </div>
        )}
      </div>

      <p className={cn(type.caption, "italic")}>
        This is modelling only and not personal tax advice.
      </p>
    </section>
  );
}

export default PropertyTaxFieldsCard;

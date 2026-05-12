/**
 * PropertyTaxFieldsCard.tsx — Additive sub-form for tax-policy metadata.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform
 *
 * Slot this card inside existing property forms. It collects ONLY the new
 * P1b tax-policy fields:
 *   - Property type (Established / New Build / BTR / Affordable / Unknown)
 *   - Contract date
 *   - Purchase date (settlement)
 *   - Planned sale date (used by CGT timing)
 *
 * Form state lives outside; this card is a controlled component.
 * Existing property persistence layers are not touched.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Building2, CalendarClock, ShieldCheck, AlertTriangle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  resolveAutoDetectedRegime,
  type PropertyType,
} from "@/lib/taxPolicyEngine";

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
  { value: "ESTABLISHED",        label: "Established",        hint: "Existing dwelling — reform-affected post-cutoff" },
  { value: "NEW_BUILD",          label: "New Build",          hint: "Brand-new dwelling — typically carved out" },
  { value: "BUILD_TO_RENT",      label: "Build-to-Rent",      hint: "Institutional BTR — typically carved out" },
  { value: "AFFORDABLE_HOUSING", label: "Affordable Housing", hint: "NRAS-style — typically carved out" },
  { value: "UNKNOWN",            label: "Unknown",            hint: "Defaults to current rules pending confirmation" },
];

function DynamicStatusPills({ v }: { v: PropertyTaxFields }): JSX.Element {
  const detect = resolveAutoDetectedRegime({
    propertyType: v.propertyType,
    contractDate: v.contractDate,
    purchaseDate: v.purchaseDate,
  });

  const pills: { label: string; tone: "good" | "warn" | "neutral" }[] = [];

  if (detect.resolvedRegimeKind === "CURRENT_RULES" && !detect.requiresUserConfirmation) {
    pills.push({ label: "Grandfathered", tone: "good" });
    pills.push({ label: "Immediate deduction allowed", tone: "good" });
  } else if (detect.resolvedRegimeKind === "PROPOSED_2027_REFORM") {
    if (v.propertyType === "ESTABLISHED") {
      pills.push({ label: "Reform affected", tone: "warn" });
      pills.push({ label: "Loss carry-forward applies", tone: "warn" });
    } else if (v.propertyType === "NEW_BUILD") {
      pills.push({ label: "New-build eligible", tone: "good" });
      pills.push({ label: "Immediate deduction allowed", tone: "good" });
    } else if (v.propertyType === "BUILD_TO_RENT" || v.propertyType === "AFFORDABLE_HOUSING") {
      pills.push({ label: "Carve-out: current-rules treatment", tone: "good" });
    }
  }
  if (detect.requiresUserConfirmation) {
    pills.push({ label: "Needs confirmation", tone: "warn" });
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {pills.map((p, i) => (
        <Badge
          key={i}
          variant="outline"
          className={cn(
            "text-[10px]",
            p.tone === "good" && "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20",
            p.tone === "warn" && "border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-50/40 dark:bg-amber-950/20",
            p.tone === "neutral" && "text-muted-foreground",
          )}
        >
          {p.label}
        </Badge>
      ))}
    </div>
  );
}

export function PropertyTaxFieldsCard({ value, onChange, className }: Props): JSX.Element {
  const set = <K extends keyof PropertyTaxFields>(k: K, v: PropertyTaxFields[K]): void => {
    onChange({ ...value, [k]: v });
  };

  const detection = resolveAutoDetectedRegime({
    propertyType: value.propertyType,
    contractDate: value.contractDate,
    purchaseDate: value.purchaseDate,
  });

  const StatusIcon = detection.requiresUserConfirmation
    ? HelpCircle
    : detection.resolvedRegimeKind === "PROPOSED_2027_REFORM"
    ? AlertTriangle
    : ShieldCheck;

  return (
    <Card className={cn("border-dashed", className)} data-testid="property-tax-fields">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Tax Policy Details</CardTitle>
          <Badge variant="outline" className="ml-auto text-[10px]">Additive — does not affect existing fields</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Property Type</Label>
            <Select value={value.propertyType} onValueChange={(v) => set("propertyType", v as PropertyType)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select property type" />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <div className="flex flex-col">
                      <span className="text-sm">{o.label}</span>
                      <span className="text-[10px] text-muted-foreground">{o.hint}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Contract Date</Label>
            <Input
              type="date"
              value={value.contractDate ?? ""}
              onChange={(e) => set("contractDate", e.target.value || undefined)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Purchase (Settlement) Date</Label>
            <Input
              type="date"
              value={value.purchaseDate ?? ""}
              onChange={(e) => set("purchaseDate", e.target.value || undefined)}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Planned Sale Date</Label>
            <Input
              type="date"
              value={value.plannedSaleDate ?? ""}
              onChange={(e) => set("plannedSaleDate", e.target.value || undefined)}
              className="h-9 text-sm"
            />
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/20 p-3">
          <StatusIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px]">
                Auto Detect → {detection.resolvedRegimeKind === "PROPOSED_2027_REFORM" ? "Reform" : "Current Rules"}
              </Badge>
              <DynamicStatusPills v={value} />
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              <CalendarClock className="mr-1 inline h-3 w-3" />
              {detection.reason}
            </p>
          </div>
        </div>
        <p className="text-[10px] italic text-muted-foreground">
          This is modelling only and not personal tax advice.
        </p>
      </CardContent>
    </Card>
  );
}

export default PropertyTaxFieldsCard;

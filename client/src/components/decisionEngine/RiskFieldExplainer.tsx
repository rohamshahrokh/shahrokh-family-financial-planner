/**
 * V3 — Reusable risk-field explainer component.
 *
 * Renders a tooltip + "Explain" disclosure with:
 *   - plain-English explanation
 *   - recommended range
 *   - what raising the field does
 *   - what lowering the field does
 *
 * Driven by metadata in `client/src/lib/scenarioV2/riskExplainability.ts` so
 * every place a risk metric appears renders the same explanation copy.
 */

import { useState } from "react";
import {
  HelpCircle,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  RISK_FIELD_EXPLAINERS,
  type RiskFieldExplainer as RiskFieldExplainerData,
} from "@/lib/scenarioV2/riskExplainability";

export interface RiskFieldExplainerProps {
  /** Risk-explainability metadata id (e.g. "maxDefaultProbability"). */
  fieldId: string;
  /** Optional override for the popover trigger label. */
  triggerLabel?: string;
  /** Visual variant. */
  variant?: "tooltip" | "explain-button";
}

export function RiskFieldExplainer({
  fieldId,
  triggerLabel,
  variant = "tooltip",
}: RiskFieldExplainerProps) {
  const data = RISK_FIELD_EXPLAINERS[fieldId];
  if (!data) return null;

  if (variant === "explain-button") {
    return <RiskFieldExplainerInline data={data} triggerLabel={triggerLabel} />;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={`Explain ${data.label}`}
          data-testid={`risk-explainer-tooltip-${data.id}`}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="max-w-sm text-xs space-y-2">
        <RiskFieldExplainerBody data={data} />
      </PopoverContent>
    </Popover>
  );
}

function RiskFieldExplainerInline({
  data,
  triggerLabel,
}: {
  data: RiskFieldExplainerData;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-md border border-border bg-card/40 p-2"
      data-testid={`risk-explainer-inline-${data.id}`}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="h-7 px-2 text-[11px] font-medium gap-1.5"
      >
        <Info className="h-3 w-3" />
        {triggerLabel ?? `Explain "${data.label}"`}
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </Button>
      {open && (
        <div className="mt-2 pt-2 border-t border-border">
          <RiskFieldExplainerBody data={data} />
        </div>
      )}
    </div>
  );
}

function RiskFieldExplainerBody({ data }: { data: RiskFieldExplainerData }) {
  return (
    <div className="space-y-1.5 text-xs leading-relaxed">
      <div className="font-semibold text-foreground">{data.label}</div>
      <p className="text-foreground/85">{data.explanation}</p>
      <div className="grid grid-cols-1 gap-1.5 pt-1 border-t border-border">
        <Row label="Recommended range" value={data.recommendedRange} />
        <Row label="Raising this" value={data.whatHigherDoes} />
        <Row label="Lowering this" value={data.whatLowerDoes} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 items-start">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground pt-0.5">
        {label}
      </div>
      <div className="text-foreground/85">{value}</div>
    </div>
  );
}

export function RiskFieldExplainerLabel({
  fieldId,
  className,
}: {
  fieldId: string;
  className?: string;
}) {
  const data = RISK_FIELD_EXPLAINERS[fieldId];
  if (!data) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      <span>{data.label}</span>
      <RiskFieldExplainer fieldId={fieldId} variant="tooltip" />
    </span>
  );
}

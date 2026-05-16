/**
 * NarrativeReport.tsx — Renders the deterministic narrative produced by
 * `buildNarrativeReport()` for the winning candidate.
 *
 * Mandatory section order:
 *   1. Executive summary
 *   2. What should I do?
 *   3. Why did the engine choose this?
 *   4. What are the main risks?
 *   5. What happens if I ignore this?
 *   6. Step-by-step action plan
 *
 * Advanced analytics live BELOW this component, collapsed by default.
 *
 * Engine math is untouched — this component reads existing engine outputs
 * (QuickDecisionOutput) and translates them via narrativeLayer.ts.
 */

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ListChecks,
  Sparkles,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import type { QuickDecisionOutput } from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import {
  buildNarrativeReport,
  type NarrativeMode,
  type NarrativeSection,
} from "@/lib/scenarioV2/decisionEngine/narrativeLayer";

const SECTION_ICON: Record<NarrativeSection["id"], React.ReactNode> = {
  executiveSummary: <Sparkles className="h-4 w-4" />,
  whatShouldIDo: <CheckCircle2 className="h-4 w-4" />,
  whyEngineChoseThis: <HelpCircle className="h-4 w-4" />,
  mainRisks: <ShieldAlert className="h-4 w-4" />,
  ifIgnored: <AlertTriangle className="h-4 w-4" />,
  actionPlan: <ListChecks className="h-4 w-4" />,
};

const SECTION_TONE: Record<NarrativeSection["id"], string> = {
  executiveSummary: "border-[hsl(var(--intelligence)/0.30)]",
  whatShouldIDo: "border-[hsl(var(--success)/0.30)]",
  whyEngineChoseThis: "border-border",
  mainRisks: "border-[hsl(var(--warning)/0.30)]",
  ifIgnored: "border-[hsl(var(--warning)/0.30)]",
  actionPlan: "border-[hsl(var(--success)/0.30)]",
};

export interface NarrativeReportProps {
  output: QuickDecisionOutput;
  mode: NarrativeMode;
  /** Optional content rendered below the narrative (e.g. advanced analytics). */
  advancedSlot?: React.ReactNode;
}

export function NarrativeReport({ output, mode, advancedSlot }: NarrativeReportProps) {
  const report = useMemo(() => buildNarrativeReport(output, mode), [output, mode]);

  return (
    <div className="space-y-3" data-testid="narrative-report" data-mode={mode}>
      <Card className="border-[hsl(var(--intelligence)/0.30)]" data-testid="narrative-mode-banner">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <TrendingUp className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />
            <CardTitle className="text-sm sm:text-base">
              Reading mode: <span className="capitalize">{mode}</span>
            </CardTitle>
            <Badge variant="outline" className="text-[10px]">
              Confidence: {report.confidence}
            </Badge>
          </div>
          <CardDescription className="text-xs leading-snug">
            {modeDescription(mode)} {report.confidenceReason}
          </CardDescription>
        </CardHeader>
      </Card>

      {report.sections.map((section, idx) => (
        <Card
          key={section.id}
          className={SECTION_TONE[section.id]}
          data-testid={`narrative-section-${section.id}`}
          data-section-index={idx}
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base text-foreground">
              <span className="text-[hsl(var(--intelligence-light))]">{SECTION_ICON[section.id]}</span>
              <span>{section.title}</span>
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm leading-relaxed text-foreground/85">
              {section.summary}
            </CardDescription>
          </CardHeader>
          {section.body.length > 0 && (
            <CardContent className="pt-0">
              <ul className="space-y-1.5 text-xs sm:text-sm text-foreground/85 leading-relaxed">
                {section.body.map((line, i) => (
                  <li key={i} className="whitespace-pre-wrap">
                    {line}
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      ))}

      {report.showAdvanced && advancedSlot && (
        <div data-testid="narrative-advanced-slot">{advancedSlot}</div>
      )}
    </div>
  );
}

function modeDescription(mode: NarrativeMode): string {
  switch (mode) {
    case "simple":
      return "Plain-English summary aimed at a non-technical reader.";
    case "advisor":
      return "Comparative reasoning, runner-up, projections.";
    case "quant":
      return "Full quantitative context: stress probabilities, score derivation, dispersion metrics.";
  }
}

export interface NarrativeModeToggleProps {
  value: NarrativeMode;
  onChange: (m: NarrativeMode) => void;
}

export function NarrativeModeToggle({ value, onChange }: NarrativeModeToggleProps) {
  const opts: { id: NarrativeMode; label: string; sub: string }[] = [
    { id: "simple", label: "Simple", sub: "Plain English, no jargon" },
    { id: "advisor", label: "Advisor", sub: "Comparisons & projections" },
    { id: "quant", label: "Quant", sub: "Full Monte-Carlo & tail risk" },
  ];
  return (
    <div
      className="grid grid-cols-3 gap-2"
      role="radiogroup"
      aria-label="Narrative reading mode"
      data-testid="narrative-mode-toggle"
    >
      {opts.map(o => {
        const selected = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={selected}
            data-testid={`narrative-mode-${o.id}`}
            onClick={() => onChange(o.id)}
            className={`text-left rounded-lg border p-2.5 min-h-[60px] transition-all ${
              selected
                ? "border-primary/60 bg-[hsl(var(--intelligence-surface))] shadow-[var(--shadow-sm)]"
                : "border-border bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))]"
            }`}
          >
            <div className="text-xs font-semibold text-foreground">{o.label}</div>
            <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">
              {o.sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * NarrativeReport.tsx — Renders the deterministic narrative produced by
 * `buildNarrativeReport()` for the winning candidate.
 *
 * Mandatory v2 section order:
 *   1. Executive recommendation
 *   2. Why now
 *   3. Main risks avoided
 *   4. Trade-offs accepted
 *   5. Action plan
 *   6. What would change this recommendation later
 *
 * Advanced analytics live BELOW this component, collapsed by default.
 *
 * Engine math is untouched — this component reads existing engine outputs
 * (QuickDecisionOutput) and translates them via narrativeLayer.ts.
 */

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  Clock,
  ShieldCheck,
  Scale,
  ListChecks,
  Sparkles,
  RefreshCw,
  TrendingUp,
  Trophy,
  AlertTriangle,
  Brain,
  Gauge,
  Activity,
  BookOpen,
} from "lucide-react";
import type { QuickDecisionOutput } from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import {
  buildNarrativeReport,
  type NarrativeMode,
  type NarrativeSection,
} from "@/lib/scenarioV2/decisionEngine/narrativeLayer";

// V3 — ten-section icon + tone palette. Legacy v2 IDs fall back to the v2
// rendering so any caller that still uses buildNarrativeReportV2 keeps working.
const SECTION_ICON: Record<NarrativeSection["id"], React.ReactNode> = {
  executiveRecommendation:      <Sparkles className="h-4 w-4" />,
  whyThisPathWon:               <Trophy className="h-4 w-4" />,
  whyAlternativesLost:          <Scale className="h-4 w-4" />,
  whatChangesTheAnswer:         <RefreshCw className="h-4 w-4" />,
  biggestHiddenRisks:           <AlertTriangle className="h-4 w-4" />,
  behaviouralRiskCommentary:    <Brain className="h-4 w-4" />,
  sensitivityAnalysis:          <Gauge className="h-4 w-4" />,
  stressTestCommentary:         <Activity className="h-4 w-4" />,
  keyAssumptionsDrivingOutcome: <BookOpen className="h-4 w-4" />,
  tacticalNextActions:          <ListChecks className="h-4 w-4" />,
  // Legacy v2 fall-throughs
  whyNow:                       <Clock className="h-4 w-4" />,
  mainRisksAvoided:             <ShieldCheck className="h-4 w-4" />,
  tradeOffsAccepted:            <Scale className="h-4 w-4" />,
  actionPlan:                   <ListChecks className="h-4 w-4" />,
  whatWouldChangeThis:          <RefreshCw className="h-4 w-4" />,
};

const SECTION_TONE: Record<NarrativeSection["id"], string> = {
  executiveRecommendation:      "border-[hsl(var(--intelligence)/0.30)]",
  whyThisPathWon:               "border-[hsl(var(--success)/0.30)]",
  whyAlternativesLost:          "border-[hsl(var(--warning)/0.30)]",
  whatChangesTheAnswer:         "border-border",
  biggestHiddenRisks:           "border-[hsl(var(--warning)/0.30)]",
  behaviouralRiskCommentary:    "border-[hsl(var(--intelligence)/0.30)]",
  sensitivityAnalysis:          "border-border",
  stressTestCommentary:         "border-[hsl(var(--warning)/0.30)]",
  keyAssumptionsDrivingOutcome: "border-border",
  tacticalNextActions:          "border-[hsl(var(--success)/0.30)]",
  // Legacy v2 fall-throughs
  whyNow:                       "border-[hsl(var(--intelligence)/0.30)]",
  mainRisksAvoided:             "border-[hsl(var(--success)/0.30)]",
  tradeOffsAccepted:            "border-[hsl(var(--warning)/0.30)]",
  actionPlan:                   "border-[hsl(var(--success)/0.30)]",
  whatWouldChangeThis:          "border-border",
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
        <NarrativeSectionCard
          key={section.id}
          section={section}
          idx={idx}
          /* First three sections always open; rest collapsible on mobile for
             progressive disclosure (V3 mobile UX rebuild). */
          defaultOpen={idx < 3}
        />
      ))}

      {report.showAdvanced && advancedSlot && (
        <div data-testid="narrative-advanced-slot">{advancedSlot}</div>
      )}
    </div>
  );
}

function NarrativeSectionCard({
  section,
  idx,
  defaultOpen,
}: {
  section: NarrativeSection;
  idx: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card
      className={SECTION_TONE[section.id]}
      data-testid={`narrative-section-${section.id}`}
      data-section-index={idx}
    >
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={`narrative-body-${section.id}`}
          className="w-full text-left flex items-start gap-2 group"
        >
          <span className="text-[hsl(var(--intelligence-light))] mt-1">{SECTION_ICON[section.id]}</span>
          <div className="flex-1 min-w-0">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base text-foreground">
              <span>{section.title}</span>
              <span className="ml-auto text-muted-foreground sm:hidden">
                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm leading-relaxed text-foreground/85 mt-0.5">
              {section.summary}
            </CardDescription>
          </div>
        </button>
      </CardHeader>
      {section.body.length > 0 && (open || true) && (
        <CardContent
          id={`narrative-body-${section.id}`}
          className={`pt-0 ${open ? "block" : "hidden sm:block"}`}
        >
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
  );
}

function modeDescription(mode: NarrativeMode): string {
  switch (mode) {
    case "simple":
      return "Advisor-style memo: the recommendation, why now, what it avoids, and what would change it.";
    case "advisor":
      return "Senior-advisor reasoning with runner-up comparison and leverage / liquidity interpretation.";
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
    { id: "simple", label: "Simple", sub: "Advisor memo, plain language" },
    { id: "advisor", label: "Advisor", sub: "Runner-up comparison & leverage analysis" },
    { id: "quant", label: "Quant", sub: "Full simulation & risk metrics" },
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

/**
 * V3 — Grouped strategic-question selector.
 *
 * Renders the QUESTION_PRESETS registry as a category-grouped grid. Each
 * category is collapsible (closed by default except the current question's
 * category), so the 30+ questions fit on mobile without overwhelming the
 * "Run" call-to-action.
 */

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  QUESTION_PRESETS,
  QUESTION_CATEGORY_LABELS,
  type QuickDecisionQuestionKind,
  type QuestionCategory,
  type QuestionPreset,
} from "@/lib/scenarioV2/decisionEngine/candidateGenerator";

export interface QuestionFrameworkProps {
  value: QuickDecisionQuestionKind;
  onChange: (kind: QuickDecisionQuestionKind) => void;
}

export function QuestionFramework({ value, onChange }: QuestionFrameworkProps) {
  const grouped = useMemo(() => groupByCategory(), []);
  const currentCategory = QUESTION_PRESETS[value]?.category;
  const [open, setOpen] = useState<Partial<Record<QuestionCategory, boolean>>>(() => ({
    [currentCategory]: true,
  }));

  const toggle = (cat: QuestionCategory) => {
    setOpen((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const categories = Object.keys(QUESTION_CATEGORY_LABELS) as QuestionCategory[];

  return (
    <div className="space-y-2.5" data-testid="question-framework">
      <Label className="text-xs font-medium">Strategic question</Label>
      {categories.map((cat) => {
        const meta = QUESTION_CATEGORY_LABELS[cat];
        const presets = grouped[cat] ?? [];
        const isOpen = open[cat] ?? cat === currentCategory;
        const selectedInCategory = presets.some((p) => p.kind === value);
        return (
          <div
            key={cat}
            className="rounded-lg border border-border bg-card/40"
            data-testid={`question-category-${cat}`}
          >
            <button
              type="button"
              onClick={() => toggle(cat)}
              aria-expanded={isOpen}
              className="w-full px-3 py-2.5 flex items-center justify-between gap-2 hover:bg-muted/40 transition-colors text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-semibold truncate">{meta.label}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{meta.subtitle}</div>
                </div>
                {selectedInCategory && (
                  <Badge variant="outline" className="text-[9px] font-medium border-primary/40 text-primary/90">
                    selected
                  </Badge>
                )}
              </div>
              <span className="text-muted-foreground shrink-0">
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </button>
            {isOpen && (
              <div className="p-2 sm:p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 border-t border-border">
                {presets.map((p) => (
                  <button
                    key={p.kind}
                    type="button"
                    onClick={() => onChange(p.kind)}
                    aria-pressed={value === p.kind}
                    data-testid={`question-pill-${p.kind}`}
                    className={`text-left rounded-lg border p-2.5 transition-all min-h-[64px]
                      ${value === p.kind
                        ? "border-primary/60 bg-[hsl(var(--intelligence-surface))] shadow-[var(--shadow-sm)]"
                        : "border-border bg-[hsl(var(--surface-2))] hover:bg-[hsl(var(--surface-3))]"}`}
                  >
                    <div className="text-[11px] font-semibold text-foreground leading-snug">{p.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{p.description}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function groupByCategory(): Record<QuestionCategory, QuestionPreset[]> {
  const out: Record<QuestionCategory, QuestionPreset[]> = {
    capital_allocation: [],
    property_strategy: [],
    fire_retirement: [],
    risk_survival: [],
    tax_structure: [],
    family_lifestyle: [],
  };
  for (const p of Object.values(QUESTION_PRESETS) as QuestionPreset[]) {
    out[p.category].push(p);
  }
  return out;
}

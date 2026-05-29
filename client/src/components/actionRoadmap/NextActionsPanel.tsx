/**
 * NextActionsPanel — Action Roadmap S8 (Sprint 28B).
 *
 * Three sub-sections: THIS MONTH / NEXT 90 DAYS / NEXT 12 MONTHS. Each
 * item is a checkbox row (visual only — no persistence). Empty bucket
 * renders "Nothing scheduled" in muted text.
 *
 * Honesty: items derive from `roadmap.milestones` via `buildNextActions`.
 * No invented filler.
 */
import * as React from "react";
import { ListChecks } from "lucide-react";
import { SourceChip } from "@/components/SourceChip";
import type { RoadmapSectionProps } from "./roadmapContext";
import type { NextActionItem } from "@/lib/actionRoadmap/nextActionsBuilder";

const BUCKETS: Array<{ key: keyof RoadmapSectionProps["nextActions"]; label: string; testId: string }> = [
  { key: "thisMonth",    label: "THIS MONTH",     testId: "ar-s8-bucket-this-month" },
  { key: "next90Days",   label: "NEXT 90 DAYS",   testId: "ar-s8-bucket-next-90-days" },
  { key: "next12Months", label: "NEXT 12 MONTHS", testId: "ar-s8-bucket-next-12-months" },
];

export function NextActionsPanel(props: RoadmapSectionProps) {
  const { nextActions, auditMode } = props;

  return (
    <section
      data-testid="ar-s8-next-actions"
      aria-labelledby="ar-s8-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <ListChecks className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Next actions</div>
          <h2 id="ar-s8-heading" className="text-base font-semibold text-foreground">What should I do next?</h2>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {BUCKETS.map((b) => {
          const items = nextActions[b.key];
          return (
            <div key={b.key} data-testid={b.testId}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground">{b.label}</span>
                <SourceChip attribution={{ source: "actionRoadmap.pathCompletion", note: "Derived from roadmap milestones" }} auditMode={auditMode} />
              </div>
              {items.length === 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">Nothing scheduled</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {items.map((it) => (
                    <ActionRow key={it.id} item={it} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActionRow({ item }: { item: NextActionItem }) {
  return (
    <li className="flex items-start gap-2 rounded-md border border-border/60 bg-background/60 p-2 text-sm" data-testid={`ar-s8-item-${item.id}`}>
      <input
        type="checkbox"
        aria-label={item.title}
        className="mt-0.5 h-4 w-4 rounded border-border accent-violet-600"
        readOnly
      />
      <div className="min-w-0 flex-1">
        <div className="text-foreground">{item.title}</div>
        <div className="text-[11px] text-muted-foreground">Due {item.due}</div>
      </div>
    </li>
  );
}

export default NextActionsPanel;

/**
 * ActionChecklistSection — Section E of the Action Plan page.
 *
 * Pure projection of the SAME top-5 decisions Section D renders. Checkbox
 * state is client-side only (useState) — no backend persistence, no API
 * write, no new ranking.
 */

import * as React from "react";
import { useState } from "react";
import type { Recommendation } from "@/lib/recommendationEngine/types";

export interface ActionChecklistSectionProps {
  decisions: Recommendation[];
}

function dueBadgeFor(rec: Recommendation): string | null {
  if (rec.urgency === "immediate") return "Due this week";
  return null;
}

export function ActionChecklistSection({ decisions }: ActionChecklistSectionProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setChecked(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <section data-testid="action-plan-action-checklist">
      <header className="mb-3">
        <h2 className="text-base sm:text-lg font-semibold">Action Checklist</h2>
        <p className="text-xs text-muted-foreground">
          Tick what you've actioned. State is local to this device.
        </p>
      </header>

      {decisions.length === 0 ? (
        <div className="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground" style={{ borderColor: "hsl(var(--border))" }}>
          Nothing to action yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {decisions.map(rec => {
            const isChecked = !!checked[rec.id];
            const due = dueBadgeFor(rec);
            return (
              <li
                key={rec.id}
                className="rounded-lg border bg-card px-3 sm:px-4 py-2.5 flex items-center gap-3"
                style={{ borderColor: "hsl(var(--border))" }}
                data-testid={`action-plan-checklist-item-${rec.id}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggle(rec.id)}
                  aria-label={rec.title}
                  className="w-4 h-4 shrink-0 accent-amber-500"
                  data-testid={`action-plan-checkbox-${rec.id}`}
                />
                <span
                  className={`text-sm flex-1 ${isChecked ? "line-through text-muted-foreground" : "text-foreground"}`}
                >
                  {rec.title}
                </span>
                {due && (
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded shrink-0"
                    style={{
                      background: "hsl(var(--danger) / 0.12)",
                      color: "hsl(var(--danger))",
                      border: "1px solid hsl(var(--danger) / 0.3)",
                    }}
                  >
                    {due}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

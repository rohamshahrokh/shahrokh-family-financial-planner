/**
 * AlternativePaths — Action Roadmap S7 (Sprint 28).
 *
 * Lists the orchestrator's non-recommended template picks (safest, fastest,
 * bestCashflow, bestHybrid). Each card surfaces the engine's promise +
 * trade-off blurb from the existing narrative builder. Per architecture §7,
 * any alternate whose templateId differs from the recommended carries a
 * muted "Supporting Action" sub-badge so the user sees these as comparisons,
 * never as competing picks.
 */
import * as React from "react";
import { Compass } from "lucide-react";
import type { GoalLabPathPicks, GoalLabRankedScenario } from "@/lib/goalLab/orchestrator";
import { SourceChip } from "@/components/SourceChip";

export interface AlternativePathsProps {
  picks: GoalLabPathPicks;
  recommendedTemplateId: string | null;
  auditMode: boolean;
}

type AltLabel = "Safest" | "Fastest" | "Best cashflow" | "Best hybrid";

function buildAlts(picks: GoalLabPathPicks, recId: string | null): Array<{ label: AltLabel; pick: GoalLabRankedScenario }> {
  const out: Array<{ label: AltLabel; pick: GoalLabRankedScenario }> = [];
  const seen = new Set<string>();
  const push = (label: AltLabel, pick: GoalLabRankedScenario | null) => {
    if (!pick) return;
    if (pick.templateId === recId) return;
    if (seen.has(pick.templateId)) return;
    seen.add(pick.templateId);
    out.push({ label, pick });
  };
  push("Safest", picks.safest);
  push("Fastest", picks.fastest);
  push("Best cashflow", picks.bestCashflow);
  push("Best hybrid", picks.bestHybrid);
  return out;
}

export function AlternativePaths({ picks, recommendedTemplateId, auditMode }: AlternativePathsProps) {
  const alts = buildAlts(picks, recommendedTemplateId);

  return (
    <section
      data-testid="ar-section-alternative-paths"
      aria-labelledby="ar-s7-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <Compass className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Alternative paths</div>
          <h2 id="ar-s7-heading" className="text-base font-semibold text-foreground">Trade-offs against the recommended strategy</h2>
        </div>
      </div>

      {alts.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="ar-s7-empty">
          No alternative paths were modelled.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {alts.map((a) => {
            const isSupporting = a.pick.templateId !== recommendedTemplateId;
            return (
              <li
                key={a.pick.templateId}
                data-testid={`ar-s7-alt-${a.pick.templateId}`}
                className={
                  "rounded-lg border p-3 " +
                  (isSupporting
                    ? "border-border/40 bg-background/40 opacity-90"
                    : "border-border/60 bg-background/60")
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{a.label}</span>
                  <span className={`text-sm font-medium ${isSupporting ? "text-muted-foreground" : "text-foreground"}`}>{a.pick.templateLabel}</span>
                  {isSupporting && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border">
                      Supporting Action
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[12px] text-muted-foreground">{a.pick.promise}</div>
                <div className="mt-1.5">
                  <SourceChip
                    attribution={{ source: "goalLab.orchestrator", pathTemplateId: a.pick.templateId }}
                    auditMode={auditMode}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default AlternativePaths;

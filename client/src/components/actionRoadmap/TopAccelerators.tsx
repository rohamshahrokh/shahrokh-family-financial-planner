/**
 * TopAccelerators — Action Roadmap S5 (Sprint 28).
 *
 * Surfaces the engine-ranked accelerators from `buildAcceleratorRanking`.
 * CRITICAL GUARD (Sprint 28 architecture §7): when an accelerator's
 * `engineTemplateId` does not match the recommended path's template id, it
 * is rendered as a muted "Supporting Action" — never as a primary headline
 * accelerator. Same-template accelerators render as primary cards.
 */
import * as React from "react";
import { Zap } from "lucide-react";
import type { RoadmapAcceleratorRanking } from "@/lib/actionRoadmap/roadmapAccelerators";
import { SourceChip } from "@/components/SourceChip";

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString("en-AU")}`;
}

export interface TopAcceleratorsProps {
  ranking: RoadmapAcceleratorRanking;
  recommendedTemplateId: string | null;
  auditMode: boolean;
}

export function TopAccelerators({ ranking, recommendedTemplateId, auditMode }: TopAcceleratorsProps) {
  const items = ranking.topAccelerators;

  return (
    <section
      data-testid="ar-section-top-accelerators"
      aria-labelledby="ar-s5-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <Zap className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Top accelerators</div>
          <h2 id="ar-s5-heading" className="text-base font-semibold text-foreground">Actions that move the needle</h2>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="ar-s5-empty">
          No engine-modelled accelerator outperforms the recommended path right now.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((a) => {
            const isSupporting =
              recommendedTemplateId != null && a.engineTemplateId !== recommendedTemplateId;
            return (
              <li
                key={a.id}
                data-testid={`ar-s5-accelerator-${a.id}`}
                className={
                  "rounded-lg border p-3 " +
                  (isSupporting
                    ? "border-border/40 bg-background/40 opacity-80"
                    : "border-amber-300/60 bg-amber-50/40 dark:border-amber-400/30 dark:bg-amber-950/20")
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-sm font-medium ${isSupporting ? "text-muted-foreground" : "text-foreground"}`}>
                    {a.label}
                  </span>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 " +
                      (isSupporting
                        ? "bg-muted text-muted-foreground ring-border"
                        : "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25")
                    }
                  >
                    {isSupporting ? "Supporting Action" : "Accelerator"}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25">
                    {fmtMoney(a.terminalNwDelta)} NW
                  </span>
                </div>
                <div className={`mt-0.5 text-[12px] ${isSupporting ? "text-muted-foreground/80" : "text-muted-foreground"}`}>
                  {a.template.label} · {a.oneLine}
                </div>
                <div className="mt-1.5">
                  <SourceChip
                    attribution={{ source: "actionRoadmap.accelerators", pathTemplateId: a.engineTemplateId }}
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

export default TopAccelerators;

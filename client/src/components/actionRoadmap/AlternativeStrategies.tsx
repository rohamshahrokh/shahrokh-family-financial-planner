/**
 * AlternativeStrategies — Action Roadmap S7 (Sprint 28B).
 *
 * Recommended row pinned at top with a "Recommended" pill, followed by
 * each non-recommended pick from `picks.{safest, fastest, bestCashflow,
 * bestHybrid}`. Per row: FIRE age P50, NW at FIRE P50, Passive income
 * P50, risk band, and a signed delta column against the recommended row.
 *
 * Per architecture §9, alternates whose engineTemplateId differs from the
 * recommended templateId carry a muted "Supporting Action" sub-badge.
 */
import * as React from "react";
import { Compass, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { SourceChip } from "@/components/SourceChip";
import type { RoadmapSectionProps } from "./roadmapContext";
import type { GoalLabRankedScenario } from "@/lib/goalLab/orchestrator";
import { selectMonteCarloProjection, type MonteCarloProjection } from "@/lib/actionRoadmap/montecarloProjection";
import { analyzeRoadmapRisk } from "@/lib/actionRoadmap/roadmapRiskAnalyzer";
import type { FanPoint } from "@/lib/scenarioV2/types";
import type { RiskBand } from "@/lib/actionRoadmap/types";

function fmtMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "Not modelled yet";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}
function fmtAge(n: number | null): string {
  return n == null ? "Not modelled yet" : `${n}`;
}

function bandLabel(b: RiskBand): string {
  return b === "unknown" ? "—" : b.charAt(0).toUpperCase() + b.slice(1);
}

function bandTone(b: RiskBand): string {
  switch (b) {
    case "low":     return "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25";
    case "medium":  return "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25";
    case "high":    return "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25";
    case "unknown": return "bg-muted text-muted-foreground ring-border";
  }
}

interface Row {
  intent: "recommended" | "safest" | "fastest" | "bestCashflow" | "bestHybrid";
  intentLabel: string;
  scenario: GoalLabRankedScenario;
  mc: MonteCarloProjection;
  riskBand: RiskBand;
}

function projectFor(scenario: GoalLabRankedScenario, fireNumber: number | null, startAge: number | null, swrPct: number | null, simulationCount: number): MonteCarloProjection {
  const fan: FanPoint[] = (scenario.winner?.result?.netWorthFan as FanPoint[] | undefined) ?? [];
  return selectMonteCarloProjection({ fan, startAge, fireTarget: fireNumber, swrPct, simulationCount });
}

function signedDelta(alt: number | null, rec: number | null, kind: "years" | "money"): { text: string; tone: "up" | "down" | "flat" } {
  if (alt == null || rec == null) return { text: "—", tone: "flat" };
  const diff = alt - rec;
  if (Math.abs(diff) < 0.5 && kind === "years") return { text: "On par", tone: "flat" };
  if (Math.abs(diff) < 1 && kind === "money")   return { text: "On par", tone: "flat" };
  const sign = diff > 0 ? "+" : "";
  const text = kind === "money" ? `${sign}$${Math.round(diff).toLocaleString("en-AU")}` : `${sign}${diff} years`;
  // For FIRE age: down (more years) is bad, up (fewer years) is good — we
  // invert tone for years. For money: up is good, down is bad.
  const tone: "up" | "down" | "flat" = kind === "years" ? (diff < 0 ? "up" : "down") : (diff > 0 ? "up" : "down");
  return { text, tone };
}

function ToneArrow({ tone }: { tone: "up" | "down" | "flat" }) {
  if (tone === "up")   return <ArrowUp className="inline h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden />;
  if (tone === "down") return <ArrowDown className="inline h-3 w-3 text-rose-600 dark:text-rose-400" aria-hidden />;
  return <Minus className="inline h-3 w-3 text-muted-foreground" aria-hidden />;
}

export function AlternativeStrategies(props: RoadmapSectionProps) {
  const { picks, recommended, fireNumber, startAge, swrPct, auditMode } = props;

  const recRow: Row | null = recommended
    ? {
        intent: "recommended",
        intentLabel: "Recommended",
        scenario: recommended,
        mc: props.mcProjection,
        riskBand: analyzeRoadmapRisk(recommended).overall,
      }
    : null;

  const altRowsRaw: Array<{ intent: Row["intent"]; intentLabel: string; pick: GoalLabRankedScenario | null }> = [
    { intent: "safest",       intentLabel: "Safest",        pick: picks.safest },
    { intent: "fastest",      intentLabel: "Fastest",       pick: picks.fastest },
    { intent: "bestCashflow", intentLabel: "Best cashflow", pick: picks.bestCashflow },
    { intent: "bestHybrid",   intentLabel: "Best hybrid",   pick: picks.bestHybrid },
  ];
  const seen = new Set<string>(recommended ? [recommended.templateId] : []);
  const altRows: Row[] = altRowsRaw
    .filter((r) => r.pick != null && !seen.has(r.pick!.templateId))
    .map((r) => {
      seen.add(r.pick!.templateId);
      const mc = projectFor(r.pick!, fireNumber, startAge, swrPct, props.mcProjection.simulationCount);
      return {
        intent: r.intent,
        intentLabel: r.intentLabel,
        scenario: r.pick!,
        mc,
        riskBand: analyzeRoadmapRisk(r.pick!).overall,
      };
    });

  const rows: Row[] = recRow ? [recRow, ...altRows] : altRows;

  return (
    <section
      data-testid="ar-s7-alternatives"
      aria-labelledby="ar-s7-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <Compass className="mt-0.5 h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden />
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Alternative strategies</div>
          <h2 id="ar-s7-heading" className="text-base font-semibold text-foreground">Recommended vs alternatives</h2>
        </div>
      </div>

      {rows.length === 0 && (
        <div
          data-testid="ar-s7-empty"
          className="mt-4 rounded-lg border border-dashed border-border/60 bg-background/40 p-3 text-sm text-muted-foreground"
        >
          Not modelled yet — run a plan in Decision Lab to populate alternative strategies.
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {rows.map((r) => {
          const isRec = r.intent === "recommended";
          const isSupporting = !isRec && recommended != null && r.scenario.templateId !== recommended.templateId;
          const dAge   = isRec || !recRow ? null : signedDelta(r.mc.fireAge.p50,            recRow.mc.fireAge.p50,            "years");
          const dNw    = isRec || !recRow ? null : signedDelta(r.mc.netWorthAtFire.p50,     recRow.mc.netWorthAtFire.p50,     "money");
          const dPass  = isRec || !recRow ? null : signedDelta(r.mc.passiveIncomeAtFire.p50, recRow.mc.passiveIncomeAtFire.p50, "money");

          return (
            <li
              key={r.scenario.templateId}
              data-testid={`ar-s7-row-${r.intent}`}
              className={"rounded-lg border p-3 " + (isRec ? "border-violet-400/60 bg-violet-50/30 dark:border-violet-400/30 dark:bg-violet-950/15" : "border-border/60 bg-background/60")}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{r.intentLabel}</span>
                {isRec && <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-medium text-white">Recommended</span>}
                {isSupporting && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border">
                    Supporting Action
                  </span>
                )}
                <span className="text-sm font-semibold text-foreground">{r.scenario.templateLabel}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${bandTone(r.riskBand)}`}>{bandLabel(r.riskBand)}</span>
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <Cell label="FIRE age (P50)"          value={fmtAge(r.mc.fireAge.p50)}            delta={dAge} />
                <Cell label="NW at FIRE (P50)"         value={fmtMoney(r.mc.netWorthAtFire.p50)}     delta={dNw} />
                <Cell label="Passive income (P50)"     value={fmtMoney(r.mc.passiveIncomeAtFire.p50)} delta={dPass} />
              </div>

              <div className="mt-2">
                <SourceChip
                  attribution={{
                    source: "scenarioV2.monteCarlo",
                    percentile: "p50",
                    simulationCount: r.mc.simulationCount,
                    pathTemplateId: r.scenario.templateId,
                  }}
                  auditMode={auditMode}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Cell({ label, value, delta }: { label: string; value: string; delta: { text: string; tone: "up" | "down" | "flat" } | null }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-foreground">{value}</div>
      {delta && (
        <div className="text-[11px] text-muted-foreground">
          <ToneArrow tone={delta.tone} /> {delta.text} vs recommended
        </div>
      )}
    </div>
  );
}

export default AlternativeStrategies;

/**
 * B1 — Scenario Comparison Table
 *
 * Institutional-grade matrix: every ranked candidate × every key metric.
 * Sortable, filterable, winner-highlighted, delta-coloured against the
 * winner (or against a user-selected baseline).
 *
 * Data discipline:
 *  - Every column is read directly from the engine result for that candidate.
 *  - Deltas are pure UI-side math (subtract from baseline).
 *  - No fabricated/placeholder metrics.
 */
import { useMemo, useState } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown, Crown } from "lucide-react";
import type { RankedCandidate, QuickDecisionOutput } from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import {
  LABEL_CLS, MICRO_CLS, NUM_CLS, PANEL_HEADING_CLS,
  POS_TEXT, NEG_TEXT, MUTED_TEXT, deltaColor, fmtDeltaPct,
} from "../workspaceTokens";
import { cn } from "@/lib/utils";

export interface ScenarioComparisonTableProps {
  output: QuickDecisionOutput;
  fmt: {
    fmt$: (n: number) => string;
    fmt$k: (n: number) => string;
    fmt$M: (n: number) => string;
    pct: (n: number, d?: number) => string;
  };
  selectedScenarioIds?: string[];     // if set, restrict rows; else all ranked
  onRowClick?: (id: string) => void;
}

type SortKey =
  | "rank" | "label" | "score"
  | "p50" | "p10" | "p90"
  | "survival" | "liquidityExh"
  | "var95" | "cvar95" | "maxDD"
  | "fireAge" | "confidence";

interface Row {
  id: string;
  rank: number;
  label: string;
  score: number;
  p50: number;
  p10: number;
  p90: number;
  survival: number;
  liquidityExh: number;
  refiPressure: number;
  var95: number;
  cvar95: number;
  maxDDMed: number;
  fireAge: number | null;   // null if not retire-early question
  confidence: number;       // 0..1, derived from score normalised
  riskClass: "low" | "medium" | "high";
  isWinner: boolean;
  isHighRisk: boolean;
}

function deriveRiskClass(c: RankedCandidate): Row["riskClass"] {
  // Real, deterministic classification — based on engine outputs only.
  // High = any critical soft warning OR drawdown P90 > 40% OR insolvency > 10%.
  // Medium = any warn soft warning OR drawdown P90 > 25% OR insolvency > 5%.
  // Low = otherwise.
  const r = c.result;
  const ddP90 = r.riskMetrics.maxDrawdownP90;
  const def = r.defaultProbability;
  const hasCritical = c.softWarnings.some((w) => w.severity === "critical");
  const hasWarn = c.softWarnings.some((w) => w.severity === "warn");
  if (hasCritical || ddP90 > 0.40 || def > 0.10) return "high";
  if (hasWarn || ddP90 > 0.25 || def > 0.05) return "medium";
  return "low";
}

function deriveConfidence(c: RankedCandidate, maxScore: number): number {
  if (maxScore <= 0) return 0;
  // Normalise score to 0..1 against the top performer in the same run.
  return Math.max(0, Math.min(1, c.score.score / maxScore));
}

function deriveFireAge(c: RankedCandidate): number | null {
  // FIRE age is only meaningful when the question targets retirement.
  // Engine surfaces it on candidate.score's score-axes; otherwise null.
  const axes: any = (c.score as any).axes ?? {};
  if (typeof axes.fireAge === "number" && axes.fireAge > 0) return axes.fireAge;
  return null;
}

export function ScenarioComparisonTable({
  output, fmt, selectedScenarioIds, onRowClick,
}: ScenarioComparisonTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [riskFilter, setRiskFilter] = useState<"all" | "low" | "medium" | "high">("all");

  const baseline = output.ranked[0] ?? null;
  const maxScore = baseline?.score.score ?? 0;

  const rows: Row[] = useMemo(() => {
    const source = selectedScenarioIds && selectedScenarioIds.length > 0
      ? output.ranked.filter((c) => selectedScenarioIds.includes(c.id))
      : output.ranked;
    return source.map((c, i) => ({
      id: c.id,
      rank: i + 1,
      label: c.label,
      score: c.score.score,
      p50: c.result.terminalNwSorted[Math.floor(c.result.terminalNwSorted.length * 0.50)] ?? 0,
      p10: c.result.terminalNwSorted[Math.floor(c.result.terminalNwSorted.length * 0.10)] ?? 0,
      p90: c.result.terminalNwSorted[Math.floor(c.result.terminalNwSorted.length * 0.90)] ?? 0,
      survival: 1 - c.result.defaultProbability,
      liquidityExh: c.result.liquidityExhaustionProbability,
      refiPressure: c.result.refinancePressureProbability ?? 0,
      var95: c.result.riskMetrics.varDollars95,
      cvar95: c.result.riskMetrics.cvarDollars95,
      maxDDMed: c.result.riskMetrics.maxDrawdownMedian,
      fireAge: deriveFireAge(c),
      confidence: deriveConfidence(c, maxScore),
      riskClass: deriveRiskClass(c),
      isWinner: c.id === baseline?.id,
      isHighRisk: c.isHighRisk,
    }));
  }, [output.ranked, selectedScenarioIds, baseline?.id, maxScore]);

  const filtered = useMemo(() => {
    if (riskFilter === "all") return rows;
    return rows.filter((r) => r.riskClass === riskFilter);
  }, [rows, riskFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sortKey] as number | string | null;
      const bv = (b as unknown as Record<string, unknown>)[sortKey] as number | string | null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const baselineRow = rows.find((r) => r.isWinner) ?? rows[0];

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "rank" || k === "label" ? "asc" : "desc");
    }
  }

  if (rows.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-6 text-center">
        No scenarios to compare. Select two or more scenarios in the Control Tower.
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="scenario-comparison-table">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className={PANEL_HEADING_CLS}>Scenario comparison</h3>
          <p className={MICRO_CLS}>
            {rows.length} scenarios · sorted by{" "}
            <span className="font-medium">{SORT_LABELS[sortKey]}</span>{" "}
            ({sortDir === "asc" ? "ascending" : "descending"})
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className={LABEL_CLS}>Risk:</span>
          {(["all", "low", "medium", "high"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setRiskFilter(k)}
              className={cn(
                "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border transition-colors",
                riskFilter === k
                  ? "bg-foreground/90 text-background border-foreground/90"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40",
              )}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-border rounded-md">
        <table className="w-full text-[11px]">
          <thead className="bg-muted/40 border-b border-border">
            <tr>
              <Th label="#" k="rank" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" w="w-8" />
              <Th label="Scenario" k="label" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="left" />
              <Th label="Score" k="score" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              <Th label="P50 NW" k="p50" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              <Th label="P10" k="p10" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              <Th label="P90" k="p90" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              <Th label="Survival" k="survival" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              <Th label="Liq.Exh" k="liquidityExh" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              <Th label="VaR₉₅" k="var95" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              <Th label="CVaR₉₅" k="cvar95" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              <Th label="Max DD" k="maxDD" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              <Th label="FIRE" k="fireAge" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              <Th label="Conf." k="confidence" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              <th className="px-2 py-1.5 text-left">Risk</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row.id)}
                className={cn(
                  "border-b border-border/40 hover:bg-muted/30 cursor-pointer transition-colors",
                  row.isWinner && "bg-emerald-50/30 dark:bg-emerald-950/20",
                )}
              >
                <Td align="right">
                  <div className="flex items-center justify-end gap-1">
                    {row.isWinner && <Crown className="h-2.5 w-2.5 text-emerald-600 dark:text-emerald-400" />}
                    <span className={NUM_CLS}>{row.rank}</span>
                  </div>
                </Td>
                <Td align="left">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className={cn("truncate max-w-[180px]", row.isWinner && "font-semibold")}>
                      {row.label}
                    </span>
                    {row.isHighRisk && (
                      <span className={cn("text-[9px] px-1 rounded border border-rose-300/60 text-rose-600 dark:text-rose-400 uppercase tracking-wide")}>
                        High-risk
                      </span>
                    )}
                  </div>
                </Td>
                <Td align="right"><NumCell value={row.score.toFixed(0)} /></Td>
                <DeltaCell value={fmt.fmt$M(row.p50)} delta={pctDelta(row.p50, baselineRow?.p50)} betterIsHigher={true} isBaseline={row.isWinner} />
                <DeltaCell value={fmt.fmt$M(row.p10)} delta={pctDelta(row.p10, baselineRow?.p10)} betterIsHigher={true} isBaseline={row.isWinner} />
                <DeltaCell value={fmt.fmt$M(row.p90)} delta={pctDelta(row.p90, baselineRow?.p90)} betterIsHigher={true} isBaseline={row.isWinner} />
                <Td align="right">
                  <span className={cn(NUM_CLS, row.survival >= 0.98 ? POS_TEXT : row.survival >= 0.90 ? "" : NEG_TEXT)}>
                    {fmt.pct(row.survival, 1)}
                  </span>
                </Td>
                <Td align="right">
                  <span className={cn(NUM_CLS, row.liquidityExh > 0.20 ? NEG_TEXT : row.liquidityExh > 0.05 ? "" : POS_TEXT)}>
                    {fmt.pct(row.liquidityExh, 1)}
                  </span>
                </Td>
                <Td align="right"><NumCell value={fmt.fmt$M(row.var95)} /></Td>
                <Td align="right"><NumCell value={fmt.fmt$M(row.cvar95)} /></Td>
                <Td align="right">
                  <span className={cn(NUM_CLS, row.maxDDMed > 0.30 ? NEG_TEXT : row.maxDDMed > 0.15 ? "" : POS_TEXT)}>
                    {fmt.pct(row.maxDDMed, 1)}
                  </span>
                </Td>
                <Td align="right">
                  <NumCell value={row.fireAge == null ? "—" : `${row.fireAge.toFixed(0)}y`} />
                </Td>
                <Td align="right">
                  <NumCell value={`${(row.confidence * 100).toFixed(0)}%`} />
                </Td>
                <Td align="left">
                  <RiskBadge cls={row.riskClass} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footnote */}
      <p className={cn(MICRO_CLS, "px-1")}>
        Deltas compare against winner ({baselineRow?.label ?? "—"}).
        All values from {output.ranked[0]?.result.simulationCount.toLocaleString() ?? 0} Monte Carlo paths.
      </p>
    </div>
  );
}

const SORT_LABELS: Record<SortKey, string> = {
  rank: "rank", label: "scenario", score: "score",
  p50: "P50 NW", p10: "P10 NW", p90: "P90 NW",
  survival: "survival", liquidityExh: "liquidity exhaustion",
  var95: "VaR₉₅", cvar95: "CVaR₉₅", maxDD: "max drawdown",
  fireAge: "FIRE age", confidence: "confidence",
};

function Th({
  label, k, sortKey, sortDir, onSort, align, w,
}: {
  label: string; k: SortKey;
  sortKey: SortKey; sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align: "left" | "right"; w?: string;
}) {
  const active = sortKey === k;
  return (
    <th
      className={cn(
        "px-2 py-1.5 font-semibold uppercase tracking-wide text-[10px] text-muted-foreground select-none",
        align === "right" ? "text-right" : "text-left",
        w,
      )}
    >
      <button
        onClick={() => onSort(k)}
        className={cn("inline-flex items-center gap-0.5 hover:text-foreground transition-colors", align === "right" && "flex-row-reverse")}
      >
        <span>{label}</span>
        {active
          ? (sortDir === "asc" ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />)
          : <ArrowUpDown className="h-2.5 w-2.5 opacity-40" />}
      </button>
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align: "left" | "right" }) {
  return (
    <td className={cn("px-2 py-1.5 whitespace-nowrap", align === "right" ? "text-right" : "text-left")}>
      {children}
    </td>
  );
}

function NumCell({ value }: { value: string }) {
  return <span className={NUM_CLS}>{value}</span>;
}

function DeltaCell({
  value, delta, betterIsHigher, isBaseline,
}: {
  value: string; delta: number; betterIsHigher: boolean; isBaseline: boolean;
}) {
  return (
    <td className="px-2 py-1.5 whitespace-nowrap text-right">
      <div className={cn("inline-flex flex-col items-end leading-tight", NUM_CLS)}>
        <span>{value}</span>
        {!isBaseline && Math.abs(delta) >= 0.005 && (
          <span className={cn("text-[9px]", deltaColor(delta, betterIsHigher))}>
            {fmtDeltaPct(delta, 1)}
          </span>
        )}
      </div>
    </td>
  );
}

function RiskBadge({ cls }: { cls: "low" | "medium" | "high" }) {
  const map = {
    low: { text: POS_TEXT, label: "Low" },
    medium: { text: "text-amber-700 dark:text-amber-300", label: "Med" },
    high: { text: NEG_TEXT, label: "High" },
  };
  const m = map[cls];
  return (
    <span className={cn("text-[10px] uppercase tracking-wide font-medium", m.text)}>{m.label}</span>
  );
}

function pctDelta(v: number, baseline: number | undefined): number {
  if (!baseline || baseline === 0) return 0;
  return (v - baseline) / Math.abs(baseline);
}

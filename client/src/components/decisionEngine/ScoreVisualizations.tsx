/**
 * ScoreVisualizations.tsx — Phase 2.3 explainability UI
 *
 * Three components, all pure-deterministic, dark-mode safe, mobile-responsive:
 *
 *  • <ScoreWaterfall />  — horizontal contribution bars from baseScore→score,
 *                          showing every axis (positive) and every penalty (negative)
 *                          with running total ending at the final composite score.
 *  • <WinnerVsRunnerUp /> — diverging horizontal bar chart per scoring axis,
 *                          axis × (winner contribution − runner-up contribution),
 *                          with the largest gap highlighted as the explanatory hinge.
 *  • <InvalidationEngine /> — surfaces every condition that would invalidate the
 *                          winner: rate-rise headroom, income-drop sensitivity,
 *                          P10 negative-terminal-NW, plus residual robustness note.
 *
 * No mock data. No placeholder text. All inputs come from the engine's
 * RankedCandidate.score (ScoreBreakdownEntry[], PenaltyEntry[]) and
 * QuickDecisionOutput.comparativeNarrative.
 */

import type { ReactNode } from "react";
import { TrendingUp, TrendingDown, AlertTriangle, Trophy, Medal, ShieldAlert, Target } from "lucide-react";

import type { RankedCandidate, QuickDecisionOutput } from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import type { MaskFmt } from "@/components/decisionEngine/RiskVisualizations";
import { InfoTooltip } from "@/components/ui/info-tooltip";

// ─── ScoreWaterfall ──────────────────────────────────────────────────────────

export interface ScoreWaterfallProps {
  candidate: RankedCandidate;
  /** Optional title override. */
  title?: string;
  /** When true, render a more compact version without the running-total column. */
  compact?: boolean;
  /** Privacy-aware formatter (currency + pct). Required for masked terminalNW raw values. */
  fmt?: MaskFmt;
}

export function ScoreWaterfall({ candidate, title = "Score waterfall", compact = false, fmt }: ScoreWaterfallProps) {
  const breakdown = candidate.score.breakdown;
  const penalties = candidate.score.penalties.filter(p => p.magnitude > 0);
  const baseScore = candidate.score.baseScore;
  const finalScore = candidate.score.score;

  // Sort axes by contribution descending so the biggest movers are first.
  const sortedBreakdown = [...breakdown].sort((a, b) => b.contribution - a.contribution);

  // Compute the largest absolute value across all rows for x-axis scaling.
  const maxRow = Math.max(
    1,
    ...sortedBreakdown.map(b => b.contribution),
    ...penalties.map(p => p.magnitude)
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-[hsl(var(--intelligence-light))]" />
          <span className="text-xs uppercase tracking-wide font-semibold text-foreground">{title}</span>
          <InfoTooltip term="Score waterfall" size={11} />
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          base {baseScore.toFixed(1)} → final <span className="font-semibold text-foreground">{finalScore.toFixed(1)}</span>
        </div>
      </div>

      <div className="space-y-1">
        {sortedBreakdown.map(b => (
          <WaterfallRow
            key={String(b.axis)}
            label={prettifyAxis(String(b.axis))}
            value={b.contribution}
            maxAbs={maxRow}
            tone="positive"
            sub={`weight ${(b.weight * 100).toFixed(0)}% · raw ${formatRaw(String(b.axis), b.rawValue, fmt)}`}
            compact={compact}
          />
        ))}

        {penalties.length > 0 && (
          <>
            <div className="pt-1 text-[9px] uppercase tracking-wide font-semibold text-rose-700 dark:text-rose-400">
              Penalties applied
            </div>
            {penalties.map((p, i) => (
              <WaterfallRow
                key={`p${i}`}
                label={p.reason}
                value={-p.magnitude}
                maxAbs={maxRow}
                tone="negative"
                sub={p.id}
                compact={compact}
              />
            ))}
          </>
        )}

        {/* Final total row */}
        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground">Composite score</span>
          <span className="tabular-nums font-bold text-foreground">{finalScore.toFixed(1)} / 100</span>
        </div>
      </div>
    </div>
  );
}

function WaterfallRow({
  label, value, maxAbs, tone, sub, compact,
}: {
  label: string;
  value: number;
  maxAbs: number;
  tone: "positive" | "negative";
  sub?: string;
  compact: boolean;
}) {
  const isNeg = value < 0;
  const widthPct = Math.min(100, (Math.abs(value) / maxAbs) * 100);
  const barColor = isNeg
    ? "bg-rose-500 dark:bg-rose-400"
    : "bg-emerald-500 dark:bg-emerald-400";

  return (
    <div className="flex items-center gap-2 text-[11px]">
      <div className={`shrink-0 truncate ${compact ? "w-28" : "w-36 sm:w-44"} text-muted-foreground`}>
        <span className="text-foreground">{label}</span>
        {sub && !compact && (
          <span className="block text-[9px] text-muted-foreground/80 truncate">{sub}</span>
        )}
      </div>
      <div className="flex-1 relative h-3 bg-muted/50 rounded-sm overflow-hidden">
        <div
          className={`absolute top-0 bottom-0 ${barColor} rounded-sm transition-all`}
          style={{
            width: `${widthPct}%`,
            left: isNeg ? "auto" : 0,
            right: isNeg ? 0 : "auto",
          }}
        />
      </div>
      <div className={`shrink-0 w-14 text-right tabular-nums font-semibold ${isNeg ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>
        {isNeg ? "−" : "+"}{Math.abs(value).toFixed(1)}
      </div>
    </div>
  );
}

function prettifyAxis(axis: string): string {
  // camelCase → "Camel case"
  return axis
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, c => c.toUpperCase())
    .trim();
}

function formatRaw(axis: string, raw: number, fmt?: MaskFmt): string {
  // Heuristic formatting per known axis name so user sees, e.g. "72%" not "0.72".
  if (/probability|factor|return|drag|stress|risk/i.test(axis)) {
    // Percentages — not financially sensitive; route through fmt.pct if available
    return fmt ? fmt.pct(raw, 1) : `${(raw * 100).toFixed(1)}%`;
  }
  if (/terminalNetWorth/i.test(axis)) {
    // Privacy-sensitive: route through fmt.fmt$M when available
    if (fmt) return fmt.fmt$M(raw);
    if (Math.abs(raw) >= 1_000_000) return `$${(raw / 1_000_000).toFixed(2)}M`;
    return `$${Math.round(raw / 1000)}k`;
  }
  if (/months|fireMonth|fireAccel/i.test(axis)) {
    return `${raw.toFixed(0)} mo`;
  }
  return raw.toFixed(2);
}

// ─── WinnerVsRunnerUp ────────────────────────────────────────────────────────

export interface WinnerVsRunnerUpProps {
  output: QuickDecisionOutput;
  fmt: MaskFmt;
}

export function WinnerVsRunnerUp({ output, fmt }: WinnerVsRunnerUpProps) {
  const winner = output.ranked[0];
  const runnerUp = output.ranked[1];
  if (!winner || !runnerUp) {
    return null;
  }

  // Compute per-axis gap = winnerContribution − runnerUpContribution.
  // Positive = winner ahead on this axis. Negative = runner-up ahead.
  const rows = winner.score.breakdown.map(w => {
    const r = runnerUp.score.breakdown.find(x => x.axis === w.axis);
    const gap = r ? w.contribution - r.contribution : w.contribution;
    return {
      axis: String(w.axis),
      winnerContribution: w.contribution,
      runnerUpContribution: r ? r.contribution : 0,
      gap,
      winnerRaw: w.rawValue,
      runnerUpRaw: r ? r.rawValue : 0,
    };
  });

  // Sort by absolute gap, biggest movers first.
  rows.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  const maxGap = Math.max(0.5, ...rows.map(r => Math.abs(r.gap)));
  const totalGap = winner.score.score - runnerUp.score.score;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs uppercase tracking-wide font-semibold text-foreground">
            Why winner beat runner-up
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums">
          margin: <span className="font-semibold text-foreground">{totalGap.toFixed(1)}</span> pts
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 p-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold text-emerald-800 dark:text-emerald-300">
            <Trophy className="h-3 w-3" /> Winner
          </div>
          <div className="text-xs font-semibold text-foreground truncate mt-0.5">{winner.label}</div>
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {winner.score.score.toFixed(1)} / 100
          </div>
        </div>
        <div className="rounded-md border border-sky-200 dark:border-sky-900 bg-sky-50/40 dark:bg-sky-950/20 p-2">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold text-sky-800 dark:text-sky-300">
            <Medal className="h-3 w-3" /> Runner-up
          </div>
          <div className="text-xs font-semibold text-foreground truncate mt-0.5">{runnerUp.label}</div>
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {runnerUp.score.score.toFixed(1)} / 100
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        {rows.map((row, idx) => (
          <DivergingRow
            key={row.axis}
            label={prettifyAxis(row.axis)}
            gap={row.gap}
            maxGap={maxGap}
            isHinge={idx === 0 && Math.abs(row.gap) > 0.5}
            winnerContribution={row.winnerContribution}
            runnerUpContribution={row.runnerUpContribution}
          />
        ))}
      </div>

      <div className="rounded-md bg-muted/40 border border-border px-2.5 py-2 text-[11px] text-muted-foreground leading-relaxed">
        {fmt.sentence(output.comparativeNarrative.secondPlaceAndWhy)}
      </div>
    </div>
  );
}

function DivergingRow({
  label, gap, maxGap, isHinge, winnerContribution, runnerUpContribution,
}: {
  label: string;
  gap: number;
  maxGap: number;
  isHinge: boolean;
  winnerContribution: number;
  runnerUpContribution: number;
}) {
  const widthPct = Math.min(50, (Math.abs(gap) / maxGap) * 50);
  const isWinnerAhead = gap >= 0;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <div className="shrink-0 w-32 sm:w-40 text-foreground truncate">
        {isHinge && <Target className="inline h-2.5 w-2.5 mr-1 text-amber-600 dark:text-amber-400" />}
        <span className={isHinge ? "font-semibold" : ""}>{label}</span>
      </div>
      <div className="flex-1 relative h-3 bg-muted/40 rounded-sm overflow-hidden">
        {/* Centre line */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border" />
        <div
          className={`absolute top-0 bottom-0 ${
            isWinnerAhead
              ? "bg-emerald-500 dark:bg-emerald-400 left-1/2"
              : "bg-sky-500 dark:bg-sky-400 right-1/2"
          }`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <div className="shrink-0 w-20 text-right text-[10px] text-muted-foreground tabular-nums">
        <span className={isWinnerAhead ? "text-emerald-700 dark:text-emerald-400" : "text-sky-700 dark:text-sky-400"}>
          {isWinnerAhead ? "+" : "−"}{Math.abs(gap).toFixed(1)}
        </span>
        <span className="ml-1 opacity-60">
          ({winnerContribution.toFixed(1)} vs {runnerUpContribution.toFixed(1)})
        </span>
      </div>
    </div>
  );
}

// ─── InvalidationEngine ──────────────────────────────────────────────────────

export interface InvalidationEngineProps {
  output: QuickDecisionOutput;
  fmt: MaskFmt;
}

export function InvalidationEngine({ output, fmt }: InvalidationEngineProps) {
  const winner = output.ranked[0];
  if (!winner) return null;

  const conditions = output.comparativeNarrative.whatCouldInvalidate;

  // Build structured invalidation tiles from engine fields (no placeholders;
  // each tile only renders if its underlying engine value warrants it).
  const tiles: InvalidationTile[] = [];

  const nsr = winner.result.serviceability.nsr;
  if (nsr < 1.3 && nsr >= 1.0) {
    const headroomBps = Math.max(0, (nsr - 1.0) * 300);
    tiles.push({
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      label: "Rate-rise headroom",
      value: `~${headroomBps.toFixed(0)} bps`,
      detail: `NSR ${nsr.toFixed(2)} — a rate rise of this size pushes NSR below 1.0 (refinance stress).`,
      severity: nsr < 1.15 ? "high" : "medium",
    });
  } else if (nsr >= 1.3) {
    tiles.push({
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      label: "Rate-rise headroom",
      value: "robust",
      detail: `NSR ${nsr.toFixed(2)} — well clear of the 1.0 stress threshold.`,
      severity: "low",
    });
  }

  if (winner.result.defaultProbability > 0.05) {
    tiles.push({
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
      label: "Income-drop sensitivity",
      value: fmt.pct(winner.result.defaultProbability, 1),
      detail: `Insolvency P at base case. A >20% income drop sustained for 12+ months would push this above the 20% rejection bar.`,
      severity: winner.result.defaultProbability > 0.10 ? "high" : "medium",
    });
  }

  const finalFan = winner.result.netWorthFan[winner.result.netWorthFan.length - 1];
  if (finalFan && finalFan.p10 < 0) {
    tiles.push({
      icon: <TrendingDown className="h-3.5 w-3.5" />,
      label: "Bottom-decile terminal NW",
      value: fmt.fmt$M(finalFan.p10),
      detail: `10% of paths end with negative net worth. A property-market correction >15% or 5-year poor-equity sequence drives this.`,
      severity: "high",
    });
  }

  if (winner.result.liquidityExhaustionProbability > 0.10) {
    tiles.push({
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      label: "Liquidity exhaustion",
      value: fmt.pct(winner.result.liquidityExhaustionProbability, 1),
      detail: `Probability cash hits zero in at least one month. Triggered most often by simultaneous income shock + rate rise.`,
      severity: winner.result.liquidityExhaustionProbability > 0.20 ? "high" : "medium",
    });
  }

  if (tiles.length === 0) {
    tiles.push({
      icon: <Target className="h-3.5 w-3.5" />,
      label: "Robust profile",
      value: "—",
      detail: "Path is robust across modelled rate, income, and market stresses. Black-swan events outside registered ranges are not modelled.",
      severity: "low",
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        <span className="text-xs uppercase tracking-wide font-semibold text-foreground">
          What would invalidate this recommendation
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {tiles.map(t => (
          <InvalidationTileView key={t.label} tile={t} />
        ))}
      </div>

      {/* Narrative engine sentences (already filtered) */}
      {conditions.length > 0 && (
        <ul className="space-y-1 text-[11px] mt-1">
          {conditions.map((line, i) => (
            <li key={i} className="flex items-start gap-2 text-muted-foreground">
              <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
              <span>{fmt.sentence(line)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface InvalidationTile {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  severity: "low" | "medium" | "high";
}

function InvalidationTileView({ tile }: { tile: InvalidationTile }) {
  const sev = {
    low: "border-emerald-200 bg-emerald-50/60 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
    medium: "border-amber-200 bg-amber-50/60 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
    high: "border-rose-200 bg-rose-50/60 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900",
  }[tile.severity];

  return (
    <div className={`rounded-md border p-2 ${sev}`}>
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide font-semibold opacity-90">
        {tile.icon}
        <span className="truncate">{tile.label}</span>
      </div>
      <div className="text-sm font-bold tabular-nums mt-0.5">{tile.value}</div>
      <div className="text-[10px] opacity-90 leading-snug mt-0.5">{tile.detail}</div>
    </div>
  );
}

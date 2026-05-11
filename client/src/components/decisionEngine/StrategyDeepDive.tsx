/**
 * StrategyDeepDive.tsx — full deep-dive sheet for one ranked candidate
 *
 * Opens as a right sheet on desktop / full-height sheet on mobile and renders:
 *   • Identity + headline metrics
 *   • Fan chart (engine output)
 *   • Tail-risk card
 *   • Per-candidate score waterfall (existing component reused)
 *   • Drawdown / liquidity timeline (median NW + cash paths)
 *   • Constraints evaluated + risk drivers
 *   • Event timeline + assumptions used
 *
 * Reuses existing visualization components — no duplicate financial logic.
 * The "discovery" card stays clean; depth lives here.
 */

import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid } from "recharts";
import { Award, AlertTriangle, CheckCircle2, XCircle, Activity, TrendingDown, Clock } from "lucide-react";

import type { RankedCandidate } from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import type { ExtendedScenarioResult } from "@/lib/scenarioV2/runScenario";
import type { StrategyIntelligence } from "@/lib/scenarioV2/decisionEngine/strategyIntelligence";
import type { MaskFmt } from "@/components/decisionEngine/RiskVisualizations";

import { FanChart, TailRiskCard } from "@/components/decisionEngine/RiskVisualizations";
import { ScoreWaterfall } from "@/components/decisionEngine/ScoreVisualizations";

import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

export interface StrategyDeepDiveProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: RankedCandidate;
  baseline: ExtendedScenarioResult;
  fmt: MaskFmt;
  privacyMode: boolean;
  intel: StrategyIntelligence;
}

export function StrategyDeepDive({
  open, onOpenChange, candidate, baseline, fmt, privacyMode, intel,
}: StrategyDeepDiveProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto p-0"
      >
        <div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border/60 px-4 py-3">
          <SheetHeader className="space-y-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <SheetTitle className="text-base sm:text-lg truncate">
                  {candidate.label}
                </SheetTitle>
                <SheetDescription className="text-[11px]">
                  {intel.narrative.identityLabel} · {intel.narrative.identityHint}
                </SheetDescription>
              </div>
              <Badge className="tabular-nums font-bold shrink-0">
                {candidate.score.score.toFixed(0)}
              </Badge>
            </div>
          </SheetHeader>
        </div>

        <div className="p-4 space-y-4">
          {/* Fan chart */}
          <Section title="Path fan" subtitle="P5–P95 dispersion of net worth across simulations">
            <FanChart
              fan={candidate.result.netWorthFan}
              fmt={fmt}
              initialNetWorth={candidate.result.initialNetWorth}
              hidden={privacyMode}
              height={220}
              title=""
            />
          </Section>

          {/* Tail-risk */}
          <Section title="Tail risk">
            <TailRiskCard result={candidate.result} fmt={fmt} compact />
          </Section>

          {/* Median NW + Cash trajectory */}
          <Section title="Median trajectory" subtitle="Median net worth and cash buffer paths">
            <TrajectoryChart
              candidate={candidate}
              baseline={baseline}
              privacyMode={privacyMode}
              fmt={fmt}
            />
          </Section>

          {/* Score waterfall */}
          <Section title="Score derivation">
            <ScoreWaterfall candidate={candidate} compact fmt={fmt} />
          </Section>

          {/* Rationale / risk drivers */}
          {(candidate.rationale.length > 0 || candidate.trace.riskDrivers.length > 0) && (
            <Section title="Engine rationale">
              {candidate.rationale.length > 0 && (
                <ul className="space-y-1.5 mb-3">
                  {candidate.rationale.map((r, i) => (
                    <li key={i} className="text-xs flex items-start gap-2">
                      <Award className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                      <span>{fmt.sentence(r)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {candidate.trace.riskDrivers.length > 0 && (
                <ul className="space-y-1.5">
                  {candidate.trace.riskDrivers.map((r, i) => (
                    <li key={i} className="text-xs flex items-start gap-2">
                      <AlertTriangle className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-semibold text-foreground">{r.label}: </span>
                        <span className="text-muted-foreground">{fmt.sentence(r.detail)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {/* Constraints */}
          <Section title="Constraints evaluated">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {candidate.trace.constraintsEvaluated.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  {c.passed
                    ? <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                    : <XCircle className="h-3 w-3 text-rose-400 shrink-0" />}
                  <span className="text-muted-foreground truncate flex-1">{c.id}</span>
                  <span className="tabular-nums font-medium text-foreground">
                    {typeof c.value === "number" ? c.value.toFixed(2) : String(c.value)}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          {/* Event timeline */}
          {candidate.trace.timeline.length > 0 && (
            <Section title="Event timeline">
              <div className="space-y-1.5">
                {candidate.trace.timeline.map((t, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <Badge variant="outline" className="text-[10px] tabular-nums shrink-0 mt-0.5">
                      <Clock className="h-2.5 w-2.5 mr-1" />
                      {t.month}
                    </Badge>
                    <div className="min-w-0">
                      <span className="text-muted-foreground">{t.event}: </span>
                      <span className="text-foreground/90">{fmt.sentence(t.effect)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Assumptions */}
          <details className="rounded-lg border border-border/60 bg-[hsl(var(--surface-2))]/40 p-3">
            <summary className="cursor-pointer text-xs font-semibold text-foreground flex items-center gap-2">
              <Activity className="h-3.5 w-3.5" />
              Assumptions used ({candidate.trace.assumptionsUsed.length})
            </summary>
            <div className="mt-2 space-y-1 pl-2 border-l border-border/60 text-[11px]">
              {candidate.trace.assumptionsUsed.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-muted-foreground truncate flex-1">{a.id}</span>
                  <span className="tabular-nums font-medium">{String(a.value)}</span>
                  <span className="text-muted-foreground text-[10px]">· {a.source}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Section({
  title, subtitle, children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card shadow-[var(--shadow-sm)] p-3">
      <div className="mb-2">
        <div className="text-[11px] uppercase tracking-wide font-semibold text-foreground">
          {title}
        </div>
        {subtitle && (
          <div className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</div>
        )}
      </div>
      <Separator className="mb-2.5" />
      {children}
    </div>
  );
}

function TrajectoryChart({
  candidate, baseline, privacyMode, fmt,
}: {
  candidate: RankedCandidate;
  baseline: ExtendedScenarioResult;
  privacyMode: boolean;
  fmt: MaskFmt;
}) {
  const nwPath = candidate.result.medianNwPath || [];
  const cashPath = candidate.result.medianCashPath || [];
  const baseNw = baseline.medianNwPath || [];
  const len = Math.max(nwPath.length, cashPath.length, baseNw.length);

  const data = Array.from({ length: len }).map((_, i) => ({
    month: i,
    year: (i / 12).toFixed(1),
    nw: nwPath[i] ?? null,
    base: baseNw[i] ?? null,
    cash: cashPath[i] ?? null,
  }));

  // Find max-drawdown point on candidate NW path
  let peak = -Infinity;
  let troughIdx = 0;
  let troughDrawdown = 0;
  for (let i = 0; i < nwPath.length; i++) {
    const v = nwPath[i] ?? 0;
    if (v > peak) peak = v;
    const dd = peak > 0 ? (peak - v) / peak : 0;
    if (dd > troughDrawdown) {
      troughDrawdown = dd;
      troughIdx = i;
    }
  }

  return (
    <div className="space-y-2">
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="hsl(var(--border) / 0.5)" strokeDasharray="3 3" />
            <XAxis
              dataKey="year"
              tickFormatter={(v) => `${v}y`}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              stroke="hsl(var(--border) / 0.6)"
              interval={Math.max(0, Math.floor(len / 60))}
            />
            <YAxis
              tickFormatter={(v) => privacyMode ? "•••" : fmt.fmt$M(v)}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              stroke="hsl(var(--border) / 0.6)"
              width={50}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--surface-2))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(v: number, name: string) => [privacyMode ? "•••" : fmt.fmt$M(v), name === "nw" ? "Strategy NW" : name === "base" ? "Baseline NW" : "Cash"]}
              labelFormatter={(l) => `Year ${l}`}
            />
            <ReferenceLine
              x={data[troughIdx]?.year}
              stroke="hsl(var(--danger) / 0.5)"
              strokeDasharray="2 2"
              label={{ value: `Max DD ${(troughDrawdown * 100).toFixed(0)}%`, position: "top", fontSize: 9, fill: "hsl(var(--danger))" }}
            />
            <Line type="monotone" dataKey="nw"   stroke="hsl(var(--primary))"   strokeWidth={2} dot={false} name="nw" />
            <Line type="monotone" dataKey="base" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="base" />
            <Line type="monotone" dataKey="cash" stroke="hsl(var(--success))"   strokeWidth={1.5} dot={false} name="cash" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-primary rounded" />
          Strategy NW (P50)
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-muted-foreground rounded border-t border-dashed" />
          Baseline NW
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-emerald-500 rounded" />
          Cash buffer
        </span>
        <span className="ml-auto flex items-center gap-1">
          <TrendingDown className="h-2.5 w-2.5 text-rose-400" />
          Peak-to-trough {(troughDrawdown * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

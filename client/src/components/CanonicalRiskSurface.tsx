/**
 * CanonicalRiskSurface.tsx — Visual risk surface for the WDC Risk tab.
 *
 * Consumes `canonicalRiskSurface.ts` outputs only. No parallel maths, no
 * duplicated cards. Three sub-views, stacked vertically:
 *
 *   1. RadarPanel  — 8-axis spider chart with safe + warning zones.
 *   2. StressMatrix — 7 shock rows × 5 metric columns, traffic-light cells.
 *   3. FragilityGauge — stable / moderate / high gauge for FIRE durability.
 *
 * The host (WDC) supplies the canonical surface; this file is presentational.
 */

import { useMemo } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle,
  Flame,
  ShieldCheck,
  Activity,
} from "lucide-react";
import type {
  CanonicalRiskSurface as CanonicalRiskSurfaceData,
  StressTone,
} from "@/lib/canonicalRiskSurface";

const TONE_COLOR: Record<StressTone, { fg: string; bg: string; border: string }> = {
  green: { fg: "hsl(142,60%,55%)", bg: "hsl(142,60%,12% / 0.5)", border: "hsl(142,60%,30% / 0.6)" },
  amber: { fg: "hsl(43,90%,58%)",  bg: "hsl(43,90%,12% / 0.5)",  border: "hsl(43,90%,30% / 0.6)" },
  red:   { fg: "hsl(0,72%,62%)",   bg: "hsl(0,72%,12% / 0.5)",   border: "hsl(0,72%,30% / 0.6)" },
};

function fmtAud(n: number): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

// ─── Radar ───────────────────────────────────────────────────────────────────

function RadarPanel({ surface }: { surface: CanonicalRiskSurfaceData }) {
  const data = useMemo(
    () =>
      surface.radar.current.map((p, i) => ({
        axis: p.axis,
        score: Math.round(p.score),
        safe: surface.radar.safeZone[i],
        warning: surface.radar.warningZone[i],
        detail: p.detail,
      })),
    [surface],
  );

  return (
    <section
      className="rounded-xl border border-border/40 bg-card/40 overflow-hidden"
      data-testid="risk-radar-panel"
    >
      <header className="px-4 py-2.5 border-b border-border/30 flex items-center gap-2">
        <Activity className="w-4 h-4" style={{ color: "hsl(280,80%,68%)" }} />
        <div>
          <h3 className="text-xs font-bold text-foreground uppercase tracking-widest">
            Risk Radar
          </h3>
          <p className="text-[10px] text-muted-foreground">
            8-axis canonical risk surface · safe + warning zones · 100 = safest
          </p>
        </div>
      </header>
      <div className="px-3 pt-2 pb-1">
        <ResponsiveContainer width="100%" height={300} minHeight={260}>
          <RadarChart data={data} margin={{ top: 12, right: 28, bottom: 12, left: 28 }}>
            <PolarGrid stroke="hsl(var(--border) / 0.5)" />
            <PolarAngleAxis
              dataKey="axis"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9, fontWeight: 600 }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 8 }}
              tickCount={5}
            />
            {/* Safe zone — soft green fill at the safe threshold. */}
            <Radar
              name="Safe zone"
              dataKey="safe"
              stroke="hsl(142,60%,50%)"
              strokeOpacity={0.4}
              fill="hsl(142,60%,50%)"
              fillOpacity={0.07}
              isAnimationActive={false}
            />
            {/* Warning zone — amber threshold ring. */}
            <Radar
              name="Warning zone"
              dataKey="warning"
              stroke="hsl(43,90%,55%)"
              strokeOpacity={0.45}
              strokeDasharray="3 3"
              fill="transparent"
              isAnimationActive={false}
            />
            {/* Current position — gold spike. */}
            <Radar
              name="Current"
              dataKey="score"
              stroke="hsl(43,90%,60%)"
              strokeWidth={2}
              fill="hsl(43,90%,60%)"
              fillOpacity={0.22}
              isAnimationActive={false}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <ul
        className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 px-3 pb-3"
        data-testid="risk-radar-legend"
      >
        {surface.radar.current.map(p => (
          <li
            key={p.axis}
            className="text-[10px] text-muted-foreground flex items-start gap-2 leading-snug"
            data-testid={`risk-radar-axis-${p.axis.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
              style={{
                background:
                  p.score >= 70
                    ? "hsl(142,60%,55%)"
                    : p.score >= 45
                    ? "hsl(43,90%,58%)"
                    : "hsl(0,72%,60%)",
              }}
            />
            <span>
              <span className="font-semibold text-foreground/90">{p.axis}</span>
              {" · "}
              <span className="tabular-nums">{Math.round(p.score)}/100</span>
              <span className="block opacity-80">{p.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Stress matrix ───────────────────────────────────────────────────────────

function StressMatrix({ surface }: { surface: CanonicalRiskSurfaceData }) {
  return (
    <section
      className="rounded-xl border border-border/40 bg-card/40 overflow-hidden"
      data-testid="risk-stress-matrix"
    >
      <header className="px-4 py-2.5 border-b border-border/30 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" style={{ color: "hsl(43,90%,58%)" }} />
        <div>
          <h3 className="text-xs font-bold text-foreground uppercase tracking-widest">
            Stress Test Matrix
          </h3>
          <p className="text-[10px] text-muted-foreground">
            Shock impact on canonical metrics — green/amber/red derived from canonical inputs
          </p>
        </div>
      </header>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table
          className="w-full text-[11px]"
          data-testid="risk-stress-matrix-table"
        >
          <thead>
            <tr className="border-b border-border/40 bg-muted/10 text-[10px] uppercase tracking-widest text-muted-foreground">
              <th className="px-3 py-2 text-left font-semibold">Shock</th>
              <th className="px-3 py-2 text-right font-semibold">Monthly cashflow</th>
              <th className="px-3 py-2 text-right font-semibold">Liquidity runway</th>
              <th className="px-3 py-2 text-right font-semibold">Accessible NW</th>
              <th className="px-3 py-2 text-right font-semibold">FIRE year delay</th>
              <th className="px-3 py-2 text-right font-semibold">Debt ratio</th>
            </tr>
          </thead>
          <tbody>
            {surface.stress.map(row => (
              <tr
                key={row.id}
                className="border-b border-border/20"
                data-testid={`risk-stress-row-${row.id}`}
              >
                <td className="px-3 py-2 align-top">
                  <p className="font-semibold text-foreground leading-tight">{row.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-snug">{row.shock}</p>
                </td>
                <td
                  className="px-3 py-2 text-right tabular-nums font-mono"
                  style={{ color: TONE_COLOR[row.impact.monthlyCashflowTone].fg }}
                >
                  {fmtAud(row.impact.monthlyCashflow)}/mo
                </td>
                <td
                  className="px-3 py-2 text-right tabular-nums font-mono"
                  style={{ color: TONE_COLOR[row.impact.liquidityRunwayTone].fg }}
                >
                  {row.impact.liquidityRunwayMonths.toFixed(1)} mo
                </td>
                <td
                  className="px-3 py-2 text-right tabular-nums font-mono"
                  style={{ color: TONE_COLOR[row.impact.accessibleNWTone].fg }}
                >
                  {fmtAud(row.impact.accessibleNW)}
                </td>
                <td
                  className="px-3 py-2 text-right tabular-nums font-mono"
                  style={{ color: TONE_COLOR[row.impact.fireYearDeltaTone].fg }}
                >
                  +{row.impact.fireYearDelta.toFixed(1)} yr
                </td>
                <td
                  className="px-3 py-2 text-right tabular-nums font-mono"
                  style={{ color: TONE_COLOR[row.impact.debtRatioTone].fg }}
                >
                  {row.impact.debtRatioPct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile: stacked rows, no horizontal overflow */}
      <div
        className="md:hidden divide-y divide-border/30"
        data-testid="risk-stress-matrix-mobile"
      >
        {surface.stress.map(row => (
          <div
            key={row.id}
            className="px-3 py-2.5"
            data-testid={`risk-stress-row-mobile-${row.id}`}
          >
            <p className="font-semibold text-foreground text-[12px] leading-tight">
              {row.label}
            </p>
            <p className="text-[10px] text-muted-foreground leading-snug mb-1.5">
              {row.shock}
            </p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px]">
              <dt className="text-muted-foreground">Monthly cashflow</dt>
              <dd
                className="text-right tabular-nums font-mono"
                style={{ color: TONE_COLOR[row.impact.monthlyCashflowTone].fg }}
              >
                {fmtAud(row.impact.monthlyCashflow)}/mo
              </dd>
              <dt className="text-muted-foreground">Liquidity runway</dt>
              <dd
                className="text-right tabular-nums font-mono"
                style={{ color: TONE_COLOR[row.impact.liquidityRunwayTone].fg }}
              >
                {row.impact.liquidityRunwayMonths.toFixed(1)} mo
              </dd>
              <dt className="text-muted-foreground">Accessible NW</dt>
              <dd
                className="text-right tabular-nums font-mono"
                style={{ color: TONE_COLOR[row.impact.accessibleNWTone].fg }}
              >
                {fmtAud(row.impact.accessibleNW)}
              </dd>
              <dt className="text-muted-foreground">FIRE delay</dt>
              <dd
                className="text-right tabular-nums font-mono"
                style={{ color: TONE_COLOR[row.impact.fireYearDeltaTone].fg }}
              >
                +{row.impact.fireYearDelta.toFixed(1)} yr
              </dd>
              <dt className="text-muted-foreground">Debt ratio</dt>
              <dd
                className="text-right tabular-nums font-mono"
                style={{ color: TONE_COLOR[row.impact.debtRatioTone].fg }}
              >
                {row.impact.debtRatioPct.toFixed(1)}%
              </dd>
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Fragility gauge ─────────────────────────────────────────────────────────

function FragilityGauge({ surface }: { surface: CanonicalRiskSurfaceData }) {
  const { fragility } = surface;
  const segment =
    fragility.level === "stable"
      ? { color: "hsl(142,60%,55%)", label: "Stable", Icon: ShieldCheck }
      : fragility.level === "moderate"
      ? { color: "hsl(43,90%,58%)", label: "Moderate", Icon: Flame }
      : { color: "hsl(0,72%,62%)", label: "Highly Fragile", Icon: AlertTriangle };
  const Icon = segment.Icon;

  return (
    <section
      className="rounded-xl border border-border/40 bg-card/40 overflow-hidden"
      data-testid="risk-fire-fragility"
    >
      <header className="px-4 py-2.5 border-b border-border/30 flex items-center gap-2">
        <Icon className="w-4 h-4" style={{ color: segment.color }} />
        <div>
          <h3 className="text-xs font-bold text-foreground uppercase tracking-widest">
            FIRE Fragility Gauge
          </h3>
          <p className="text-[10px] text-muted-foreground">
            Composite resilience score · leverage · liquidity · appreciation reliance · post-tax value
          </p>
        </div>
      </header>
      <div className="px-4 py-3">
        <div className="flex items-end justify-between gap-3 mb-2 flex-wrap">
          <div>
            <p
              className="text-2xl font-extrabold leading-none"
              style={{ color: segment.color }}
              data-testid="risk-fragility-label"
            >
              {segment.label}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Score {Math.round(fragility.score)}/100
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground max-w-md leading-snug">
            {fragility.summary}
          </p>
        </div>
        <div className="h-2 rounded-full bg-border/40 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.max(4, Math.min(100, fragility.score))}%`,
              background: segment.color,
            }}
            data-testid="risk-fragility-bar"
          />
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1.5 mt-3 text-[10.5px]">
          <dt className="text-muted-foreground">Leverage (LVR)</dt>
          <dd className="text-right tabular-nums font-mono">
            {fragility.drivers.leveragePct.toFixed(1)}%
          </dd>
          <dt className="text-muted-foreground">Liquidity runway</dt>
          <dd className="text-right tabular-nums font-mono">
            {fragility.drivers.liquidityMonths.toFixed(1)} mo
          </dd>
          <dt className="text-muted-foreground">Appreciation reliance</dt>
          <dd className="text-right tabular-nums font-mono">
            {fragility.drivers.appreciationReliancePct.toFixed(0)}%
          </dd>
          <dt className="text-muted-foreground">Post-tax liq. value</dt>
          <dd className="text-right tabular-nums font-mono">
            {fmtAud(fragility.drivers.postTaxLiquidationValue)}
          </dd>
        </dl>
      </div>
    </section>
  );
}

// ─── Public ──────────────────────────────────────────────────────────────────

export interface CanonicalRiskSurfaceProps {
  surface: CanonicalRiskSurfaceData;
}

export default function CanonicalRiskSurface({ surface }: CanonicalRiskSurfaceProps) {
  return (
    <div className="space-y-3" data-testid="canonical-risk-surface">
      <RadarPanel surface={surface} />
      <StressMatrix surface={surface} />
      <FragilityGauge surface={surface} />
      <p className="text-[10px] text-muted-foreground px-1">
        All values derived from canonical financial state and the active tax regime
        ({surface.scenario === "proposed_reform" ? "Proposed 2027 Reform" : surface.scenario === "custom" ? "Custom" : "Current Law"}).
        Modelling only — not personal tax advice.
      </p>
    </div>
  );
}

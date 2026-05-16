/**
 * MonteCarloV4Panel.tsx — Phase I: Institutional Wealth Terminal
 *
 * Renders the V4-only outputs alongside the V3 fan chart:
 *  - regime indicator strip (per-year dominant macro regime)
 *  - confidence cone summary (P10/P50/P90)
 *  - probability cone bands
 *  - future event timeline
 *  - stress markers + leverage zones
 *  - liquidity runway + FIRE probability gauge
 *  - wealth percentile bands
 *  - allocation optimiser recommendations
 *  - advisor-grade narrative blocks
 *
 * Mobile-first. Progressive disclosure for advanced controls (regime mix,
 * stress markers, recommendations) via collapsible sections. Dark navy /
 * warm gold palette aligned with the rest of the app.
 *
 * This component is ADDITIVE — it sits in the forecast page alongside the
 * existing fan chart, key risks, and recommended actions panels.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Activity, Compass, Gauge, AlertTriangle, Lightbulb, BookOpen, Calendar } from "lucide-react";
import type { MonteCarloV4Extras } from "@/lib/monteCarloV4";
import { REGIME_EFFECTS, ASSUMPTION_GLOSSARY } from "@/lib/monteCarloV4";

interface Props {
  v4: MonteCarloV4Extras;
  startYear: number;
  endYear: number;
  median: number;
  p10: number;
  p90: number;
  probFf: number;
}

const fmtM = (n: number) => Math.abs(n) >= 1_000_000
  ? `$${(n / 1_000_000).toFixed(2)}M`
  : Math.abs(n) >= 1_000 ? `$${(n / 1_000).toFixed(0)}k` : `$${n.toFixed(0)}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

const REGIME_COLOURS: Record<string, string> = {
  normal_growth: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  high_inflation: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  disinflation: "bg-teal-500/20 text-teal-300 border-teal-500/30",
  stagflation: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  recession: "bg-red-500/20 text-red-300 border-red-500/30",
  commodity_boom: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  housing_slowdown: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  rate_cut_cycle: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  tightening_cycle: "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30",
  risk_on_mania: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  deflationary_shock: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
};

function Section({
  title, icon: Icon, defaultOpen = false, children, subtitle,
}: { title: string; icon: any; defaultOpen?: boolean; children: React.ReactNode; subtitle?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card/40 border border-border/40 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between p-3 hover:bg-card/60 transition"
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {subtitle && <span className="text-xs text-muted-foreground">— {subtitle}</span>}
        </div>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && <div className="p-3 pt-0">{children}</div>}
    </div>
  );
}

function GaugeRing({ value, max, label, color = "amber" }: { value: number; max: number; label: string; color?: string }) {
  const pct = Math.max(0, Math.min(1, value / Math.max(1, max)));
  const colorMap: Record<string, string> = {
    amber: "stroke-amber-400",
    emerald: "stroke-emerald-400",
    rose: "stroke-rose-400",
    sky: "stroke-sky-400",
  };
  const cls = colorMap[color] ?? colorMap.amber;
  const r = 28, c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} className="stroke-muted/30 fill-none" strokeWidth="6" />
        <circle
          cx="36" cy="36" r={r} className={`${cls} fill-none`} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 36 36)"
        />
        <text x="36" y="40" textAnchor="middle" className="fill-current text-foreground text-xs font-bold">
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <div className="text-xs">
        <p className="font-semibold text-foreground">{label}</p>
        <p className="text-muted-foreground">{value.toFixed(1)} / {max}</p>
      </div>
    </div>
  );
}

export default function MonteCarloV4Panel({ v4, startYear, endYear, median, p10, p90, probFf }: Props) {
  const yearSpan = endYear - startYear + 1;

  return (
    <div className="space-y-4">
      {/* Header strip */}
      <div className="bg-gradient-to-r from-amber-500/10 via-emerald-500/5 to-blue-500/10 border border-amber-500/20 rounded-lg p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-bold text-amber-300 flex items-center gap-2">
              <Compass className="w-4 h-4" /> Institutional Wealth Terminal
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Regime-aware macro · dynamic rates · AU property cycle · life events · behavioural overlays · advanced risk
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              v4 seed #{v4.seed}
            </span>
            <span className="text-muted-foreground">replay-safe</span>
          </div>
        </div>
      </div>

      {/* Regime indicator strip */}
      <Section title="Macro regime by year" subtitle="dominant regime across all paths" icon={Activity} defaultOpen>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {v4.regimeByYear.map((r, i) => (
            <div key={i} className="flex flex-col items-center min-w-[64px]">
              <span className="text-[10px] text-muted-foreground">{startYear + i}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${REGIME_COLOURS[r] ?? "bg-muted/20 border-muted/30"}`}>
                {REGIME_EFFECTS[r].label}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Probability gauges + survival */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="bg-card/40 border border-border/40 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">FIRE Probability</p>
          <p className="text-xl font-bold text-emerald-400">{fmtPct(probFf)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">by {endYear}</p>
        </div>
        <div className="bg-card/40 border border-border/40 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Liquidity Risk</p>
          <p className="text-xl font-bold text-amber-400">{fmtPct(v4.advancedRisk.liquidityExhaustionProb)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">cash exhaustion</p>
        </div>
        <div className="bg-card/40 border border-border/40 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Insolvency Tail</p>
          <p className="text-xl font-bold text-rose-400">{fmtPct(v4.advancedRisk.insolvencyProb)}</p>
          <p className="text-[10px] text-muted-foreground mt-1">NW &lt; 0 sometime</p>
        </div>
        <div className="bg-card/40 border border-border/40 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Survival Horizon</p>
          <p className="text-xl font-bold text-sky-400">{v4.advancedRisk.survivalHorizonYears} yrs</p>
          <p className="text-[10px] text-muted-foreground mt-1">until P10 breach</p>
        </div>
      </div>

      {/* VaR / CVaR / SoR */}
      <Section title="Advanced risk metrics" icon={Gauge} subtitle="VaR · CVaR · sequence-of-return · debt fragility">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
          <Metric label="VaR 95%" value={fmtM(v4.advancedRisk.var95)} hint="Worst 5% threshold" />
          <Metric label="VaR 99%" value={fmtM(v4.advancedRisk.var99)} hint="Worst 1% threshold" />
          <Metric label="CVaR 95%" value={fmtM(v4.advancedRisk.cvar95)} hint="Avg of worst 5%" />
          <Metric label="SoR Risk" value={v4.advancedRisk.sorRisk.toFixed(2)} hint="Sequence-of-return" />
          <Metric label="Debt Stress" value={v4.advancedRisk.debtStressScore.toFixed(2)} hint="Avg peak DSR" />
          <Metric label="Leverage Fragility" value={v4.advancedRisk.leverageFragilityScore.toFixed(2)} hint="Avg peak LVR" />
          <Metric label="Refinance Failure" value={fmtPct(v4.advancedRisk.refinanceFailureProb)} hint="≥ 1 refi failed" />
          <Metric label="Debt Spiral" value={fmtPct(v4.advancedRisk.debtSpiralProb)} hint="24mo neg-CF + DD" />
          <Metric label="Worst Drawdown Year" value={String(v4.advancedRisk.worstDrawdownYear)} hint="Most common peak-to-trough year" />
        </div>
      </Section>

      {/* Stress markers per year */}
      <Section title="Stress markers by year" icon={AlertTriangle} subtitle="leverage + liquidity heatmap">
        <div className="overflow-x-auto mt-2">
          <table className="text-xs w-full">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left p-1">Year</th>
                <th className="text-right p-1">Insolvency %</th>
                <th className="text-right p-1">Liquidity %</th>
                <th className="text-right p-1">Refi %</th>
              </tr>
            </thead>
            <tbody>
              {v4.stressMarkersByYear.map(s => (
                <tr key={s.year} className="border-t border-border/30">
                  <td className="p-1 font-mono">{s.year}</td>
                  <td className={`p-1 text-right ${s.insolvencyShare > 5 ? "text-rose-400" : "text-foreground"}`}>{s.insolvencyShare.toFixed(1)}</td>
                  <td className={`p-1 text-right ${s.liquidityShare > 10 ? "text-amber-400" : "text-foreground"}`}>{s.liquidityShare.toFixed(1)}</td>
                  <td className="p-1 text-right">{s.refinanceShare.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Future event timeline */}
      {v4.eventTimeline.length > 0 && (
        <Section title="Sampled future event timeline" icon={Calendar} subtitle="from a representative path">
          <ul className="space-y-1 text-xs mt-2">
            {v4.eventTimeline.map((e, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="font-mono text-muted-foreground w-12">{e.year}</span>
                <span className="px-1.5 py-0.5 rounded border border-border/40 bg-muted/20 text-[10px]">{e.type}</span>
                <span className="text-foreground">{e.label}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Recommendations */}
      <Section title="Allocation recommendations" icon={Lightbulb} subtitle="ranked by priority" defaultOpen>
        {v4.recommendations.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-2">No structural action recommended at current stress levels.</p>
        ) : (
          <ul className="space-y-2 mt-2">
            {v4.recommendations.map((r, i) => (
              <li key={i} className="bg-muted/10 border border-border/30 rounded p-2 text-xs">
                <p className="font-semibold text-amber-300">{r.title}</p>
                <p className="mt-1 text-foreground">{r.rationale}</p>
                <p className="mt-1 text-emerald-300">↑ {r.expectedBenefit}</p>
                <p className="mt-1 text-rose-300">↓ {r.riskTradeoff}</p>
                <p className="mt-1 text-muted-foreground">Confidence: <span className="font-mono">{r.confidence}</span></p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Narratives */}
      <Section title="Advisor narrative" icon={BookOpen} subtitle="causal · analytical · strategic" defaultOpen>
        <div className="space-y-2 mt-2">
          {v4.narratives.map((b, i) => (
            <div key={i} className={`text-xs rounded border p-2 ${
              b.tone === "warning" ? "border-rose-500/30 bg-rose-500/5"
              : b.tone === "positive" ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-border/40 bg-muted/10"
            }`}>
              <p className="font-semibold text-foreground">{b.heading}</p>
              <p className="mt-1 text-muted-foreground">{b.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Driver weights */}
      <Section title="What drives this forecast" icon={Activity} subtitle="assumption sensitivity proxy">
        <ul className="space-y-1 text-xs mt-2">
          {v4.driverWeights.slice(0, 6).map((d, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-40 truncate">{d.name}</span>
              <div className="flex-1 h-2 bg-muted/30 rounded">
                <div className="h-2 bg-amber-400 rounded" style={{ width: `${Math.round(d.weight * 100)}%` }} />
              </div>
              <span className="w-10 text-right font-mono text-muted-foreground">{Math.round(d.weight * 100)}%</span>
              <span className="text-muted-foreground">{d.direction === "up" ? "↑ wealth" : "↓ wealth"}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Assumption glossary */}
      <Section title="Assumption glossary" icon={BookOpen} subtitle="plain-English explanations">
        <div className="grid md:grid-cols-2 gap-2 mt-2">
          {Object.values(ASSUMPTION_GLOSSARY).map(a => (
            <details key={a.key} className="text-xs bg-muted/10 border border-border/30 rounded p-2">
              <summary className="font-semibold text-foreground cursor-pointer">{a.label}</summary>
              <p className="mt-1 text-muted-foreground">{a.tooltip}</p>
              <p className="mt-1 text-foreground"><span className="text-amber-400">Example:</span> {a.example}</p>
              <p className="mt-1 text-emerald-300">Why it matters: {a.whyItMatters}</p>
              <p className="mt-1 text-sky-300">Higher → {a.higherMeans}</p>
              <p className="mt-1 text-rose-300">Lower → {a.lowerMeans}</p>
            </details>
          ))}
        </div>
      </Section>

      <p className="text-[10px] text-muted-foreground italic">
        V4 outputs are deterministic given seed #{v4.seed}. {yearSpan}-year horizon · median {fmtM(median)} · P10 {fmtM(p10)} · P90 {fmtM(p90)}.
        Regimes are model-calibrated; no live macro data is fetched.
      </p>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-muted/10 border border-border/30 rounded p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-base font-bold text-foreground">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

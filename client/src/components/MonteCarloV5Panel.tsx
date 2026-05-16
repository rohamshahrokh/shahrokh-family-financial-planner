/**
 * MonteCarloV5Panel.tsx — Phase 12: V5 Realism + Advisor Intelligence Panel
 *
 * Renders V5-only outputs in a calm, family-office aesthetic alongside the
 * existing V4 panel. Modules:
 *
 *   - V5 regime + overlay strip (per-year)
 *   - Multi-tone advisor narrative (plain / advisor / optimistic / conservative / stress)
 *   - Assumption transparency expandable section
 *   - Top drivers + downside contributors
 *   - FIRE V2 summary (SWR bands, sequence risk, flavour)
 *   - Portfolio intelligence + contribution priority
 *   - Validation chips (reconciliation, sanity, overfitting, concentration)
 *   - Preference weighting awareness banner
 *
 * Mobile-first, dark/light parity, no flashy gradients, no glow effects.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, ShieldCheck, AlertTriangle, Compass, BookOpen, Sliders, Target } from "lucide-react";
import type {
  MonteCarloV5Extras, NarrativeTone, RegimeIdV5,
} from "@/lib/monteCarloV5";
import { V5_REGIME_LABELS, renderTone } from "@/lib/monteCarloV5";

interface Props {
  v5: MonteCarloV5Extras;
  startYear: number;
  endYear: number;
}

const fmtM = (n: number) =>
  Math.abs(n) >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
  : Math.abs(n) >= 1_000   ? `$${(n / 1_000).toFixed(0)}k`
  : `$${n.toFixed(0)}`;

const fmtPct = (n: number) => `${n.toFixed(0)}%`;

const REGIME_COLOR: Record<RegimeIdV5, string> = {
  normal_growth: "bg-emerald-500/20 text-emerald-200",
  inflation_shock: "bg-amber-500/30 text-amber-100",
  disinflation: "bg-sky-500/20 text-sky-200",
  recession: "bg-red-500/30 text-red-100",
  stagflation: "bg-red-700/40 text-red-100",
  low_growth: "bg-slate-500/30 text-slate-200",
  high_growth_boom: "bg-teal-500/30 text-teal-100",
  liquidity_crisis: "bg-rose-700/40 text-rose-100",
  housing_correction: "bg-orange-500/30 text-orange-100",
  tech_bull_cycle: "bg-indigo-500/30 text-indigo-100",
  crypto_winter: "bg-cyan-700/40 text-cyan-100",
};

export default function MonteCarloV5Panel({ v5, startYear, endYear }: Props) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    regime: true,
    narrative: true,
    transparency: false,
    fire: true,
    portfolio: true,
    validation: true,
  });
  const [tone, setTone] = useState<NarrativeTone>("advisor");

  const toggle = (k: string) =>
    setOpenSections(s => ({ ...s, [k]: !s[k] }));

  const nYears = Math.max(1, endYear - startYear + 1);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Compass className="w-4 h-4 text-amber-400" />
        <h2 className="text-sm font-bold tracking-wide">
          V5 Realism &amp; Advisor Intelligence
        </h2>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
          Non-destructive overlay
        </span>
      </div>

      {/* ── V5 Regime + overlay strip ──────────────────────────────────── */}
      <Section
        title="Economic Path"
        icon={<Compass className="w-3.5 h-3.5" />}
        open={openSections.regime}
        onToggle={() => toggle("regime")}
      >
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-10 gap-1 mt-3">
          {v5.v5RegimeByYear.slice(0, nYears).map((r, i) => (
            <div
              key={i}
              className={`px-2 py-1 rounded-md text-[10px] font-medium ${REGIME_COLOR[r] ?? "bg-muted text-muted-foreground"}`}
              title={V5_REGIME_LABELS[r]?.tooltip ?? r}
            >
              <div className="opacity-70">{startYear + i}</div>
              <div className="truncate">{V5_REGIME_LABELS[r]?.label ?? r}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <Chip label={`Jumps: ${v5.shockSummary.jumpMonths}`} />
          <Chip label={`Cascades: ${v5.shockSummary.cascadeMonths}`} />
          <Chip label={`Max vol: ${v5.shockSummary.maxVolScalar.toFixed(2)}×`} />
          <Chip label={`Tech bull yrs: ${v5.overlayByYear.filter(o => o.techBullCycle).length}`} />
          <Chip label={`Crypto winter yrs: ${v5.overlayByYear.filter(o => o.cryptoWinter).length}`} />
          <Chip label={`Liquidity yrs: ${v5.overlayByYear.filter(o => o.liquidityCrisis).length}`} />
        </div>
      </Section>

      {/* ── Advisor narrative (multi-tone) ─────────────────────────────── */}
      <Section
        title="Advisor Narrative (V3)"
        icon={<BookOpen className="w-3.5 h-3.5" />}
        open={openSections.narrative}
        onToggle={() => toggle("narrative")}
      >
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(["plain", "advisor", "optimistic", "conservative", "stress"] as NarrativeTone[]).map(t => (
            <button
              key={t}
              onClick={() => setTone(t)}
              className={`px-2.5 py-1 text-[11px] rounded-md border transition-colors ${
                tone === t
                  ? "border-amber-400 bg-amber-500/10 text-amber-100"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mt-3 space-y-4">
          {v5.narratives.map(b => (
            <div key={b.id} className="border-l-2 border-amber-500/30 pl-3">
              <div className="text-[12px] font-semibold mb-1">{b.heading}</div>
              <p className="text-[12px] text-muted-foreground leading-snug">{b.body[tone]}</p>
              {b.evidence && b.evidence.length > 0 && (
                <ul className="mt-1.5 text-[11px] text-muted-foreground/80 space-y-0.5">
                  {b.evidence.map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ── Transparency report ────────────────────────────────────────── */}
      <Section
        title="Why this outcome happened"
        icon={<Sliders className="w-3.5 h-3.5" />}
        open={openSections.transparency}
        onToggle={() => toggle("transparency")}
      >
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Key assumptions
            </div>
            <ul className="text-[11px] space-y-1">
              {v5.transparency.assumptions.map((a, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{a.label}</span>
                  <span className="font-medium">{a.value}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Top 5 drivers
            </div>
            <ul className="text-[11px] space-y-1.5">
              {v5.transparency.topDrivers.map((d, i) => (
                <li key={i} className="flex items-center gap-2">
                  <div className="flex-1 bg-muted h-1.5 rounded-full overflow-hidden">
                    <div
                      className={d.direction === "up" ? "bg-emerald-400 h-full" : "bg-rose-400 h-full"}
                      style={{ width: `${Math.max(2, d.contribution * 100)}%` }}
                    />
                  </div>
                  <span className="w-32 truncate" title={d.name}>{d.name}</span>
                  <span className="w-10 text-right">{fmtPct(d.contribution * 100)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Confidence:</span>{" "}
              {v5.transparency.confidenceScore.toFixed(0)}/100
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground leading-snug">
              {v5.transparency.confidenceExplanation}
            </p>
          </div>
        </div>
      </Section>

      {/* ── FIRE V2 ────────────────────────────────────────────────────── */}
      {v5.fire && (
        <Section
          title={`FIRE Engine V2 — ${v5.fire.flavour.replace(/_/g, " ")}`}
          icon={<Target className="w-3.5 h-3.5" />}
          open={openSections.fire}
          onToggle={() => toggle("fire")}
        >
          <p className="text-[12px] text-muted-foreground mt-2 leading-snug">{v5.fire.summary}</p>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <Stat label="Target NW" value={fmtM(v5.fire.fireTarget)} />
            <Stat label="Bridge target" value={fmtM(v5.fire.bridgeTarget)} />
            <Stat label="Super target" value={fmtM(v5.fire.superTarget)} />
            <Stat label="Failure prob" value={fmtPct(v5.fire.failureProbability * 100)} />
          </div>
          <div className="mt-3 text-[11px]">
            <div className="text-muted-foreground mb-1">SWR bands:</div>
            <ul className="space-y-0.5">
              {v5.fire.swrBands.map((b, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full ${b.sustainable ? "bg-emerald-400" : "bg-rose-400"}`} />
                  <span className="font-medium">{b.withdrawalRatePct}%</span>
                  <span className="text-muted-foreground flex-1">{b.description}</span>
                  <span className="text-muted-foreground">{b.yearsCovered}y</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}

      {/* ── Portfolio intelligence ─────────────────────────────────────── */}
      {v5.portfolio && (
        <Section
          title="Portfolio Intelligence"
          icon={<Compass className="w-3.5 h-3.5" />}
          open={openSections.portfolio}
          onToggle={() => toggle("portfolio")}
        >
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <Stat label="Liquidity" value={fmtPct(v5.portfolio.liquidityScore * 100)} />
            <Stat label="Concentration" value={fmtPct(v5.portfolio.concentrationScore * 100)} />
            <Stat label="Vol-adj score" value={v5.portfolio.volAdjustedScore.toFixed(2)} />
            <Stat label="Leverage-adj" value={fmtPct(v5.portfolio.leverageAdjustedScore * 100)} />
          </div>
          <div className="mt-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
              Reranked recommendations
            </div>
            <ul className="space-y-1.5">
              {v5.rerankedRecommendations.slice(0, 6).map((r, i) => (
                <li key={i} className="border border-border rounded-md px-2.5 py-1.5">
                  <div className="text-[12px] font-medium">{r.title}</div>
                  <div className="text-[11px] text-muted-foreground leading-snug">{r.rationale}</div>
                </li>
              ))}
            </ul>
          </div>
          {v5.contributionPlan.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Monthly contribution priority
              </div>
              <ul className="space-y-0.5 text-[11px]">
                {v5.contributionPlan.map((p, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{i + 1}. {p.destination}</span>
                    <span className="font-medium">${Math.round(p.monthly).toLocaleString()}/mo</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      )}

      {/* ── Validation chips ───────────────────────────────────────────── */}
      <Section
        title="Reconciliation &amp; Validation"
        icon={<ShieldCheck className="w-3.5 h-3.5" />}
        open={openSections.validation}
        onToggle={() => toggle("validation")}
      >
        <div className="mt-3 flex flex-wrap gap-1.5">
          {v5.validations.map((v, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] border ${
                v.severity === "error" ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                : v.severity === "warn" ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              }`}
              title={v.detail}
            >
              {v.severity === "error" || v.severity === "warn"
                ? <AlertTriangle className="w-3 h-3" />
                : <ShieldCheck className="w-3 h-3" />}
              {v.label}
            </span>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function Section({
  title, icon, open, onToggle, children,
}: { title: string; icon?: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode; }) {
  return (
    <div className="rounded-lg border border-border bg-card/50">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left"
      >
        {icon}
        <span className="text-[12px] font-semibold flex-1">{title}</span>
        {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-[13px] font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded-full bg-muted/50 text-[10px] text-muted-foreground">
      {label}
    </span>
  );
}

// Silenced unused import (keeps re-export of renderTone available to callers).
void renderTone;

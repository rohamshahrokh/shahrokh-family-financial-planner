/**
 * FutureWorldsPanel.tsx — Future Worlds UX rebuild.
 *
 * Premium strategic-intelligence experience built on top of the existing
 * Scenario Tree engine. The raw 15-branch Monte-Carlo-style dump has been
 * replaced with a four-section family-office decision layer:
 *
 *   1. Macro Executive Summary   — one-line institutional commentary,
 *                                  strongest tailwind, largest vulnerability,
 *                                  estimated resilience, dominant cluster.
 *   2. Three-World Model         — Bear / Base / Bull cards with probability,
 *                                  projected net worth, FIRE year, stress
 *                                  level, key driver and recommended posture.
 *   3. Portfolio Sensitivity Map — 5-factor heatmap (rates, property cycle,
 *                                  equity, inflation, employment) with the
 *                                  "why" behind each level.
 *   4. Scenario Explainability   — expandable "what changed under the hood"
 *                                  for every world and how it shifts the
 *                                  household plan.
 *
 * Engineering rules:
 *   • Reads ONLY from `buildScenarioTree(inputs)` + derived presentation
 *     summaries (`deriveFutureWorlds`). No engine math is duplicated.
 *   • Every metric, acronym, world and scenario row has tooltip support via
 *     the global intelligence tooltip system (MetricExplainer /
 *     TermExplainer / SectionExplainer). No native browser tooltips.
 *   • Empty / null / dash rows are skipped — the panel never renders a "—".
 *   • Preserves the FWL dark-premium visual identity: dark navy/graphite
 *     surfaces, restrained gold accents, green/cyan/purple semantic chips.
 */

import { useMemo, useState } from 'react';
import {
  Globe2,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  Compass,
  Activity,
  ShieldAlert,
  Gauge,
  Building2,
  LineChart as LineChartIcon,
  Briefcase,
  Wallet,
} from 'lucide-react';
import { SectionExplainer } from '@/components/intelligence/SectionExplainer';
import { MetricExplainer } from '@/components/intelligence/MetricExplainer';
import { TermExplainer } from '@/components/intelligence/TermExplainer';
import { buildScenarioTree, type ScenarioBranchInputs } from '@/lib/scenarioTree';
import {
  deriveFutureWorlds,
  type DerivationContext,
  type DerivedWorld,
  type FutureWorldsModel,
  type SensitivityLevel,
  type SensitivityRow,
  type WorldKind,
} from '@/lib/futureWorlds/derive';
import { cn } from '@/lib/utils';

function fmtMoney(n?: number): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

const SENS_COLOR: Record<SensitivityLevel, { dot: string; chip: string; chipText: string; border: string }> = {
  High:   { dot: 'bg-rose-500',  chip: 'bg-rose-500/15',  chipText: 'text-rose-300',  border: 'border-rose-500/30' },
  Medium: { dot: 'bg-amber-500', chip: 'bg-amber-500/15', chipText: 'text-amber-300', border: 'border-amber-500/30' },
  Low:    { dot: 'bg-emerald-500', chip: 'bg-emerald-500/15', chipText: 'text-emerald-300', border: 'border-emerald-500/30' },
};

const WORLD_ACCENT: Record<WorldKind, { surface: string; border: string; ring: string; text: string; icon: typeof TrendingUp; chip: string; chipText: string; label: string }> = {
  bear: {
    surface: 'bg-rose-500/10',
    border: 'border-rose-500/25',
    ring: 'shadow-[inset_0_0_0_1px_rgba(244,63,94,0.18)]',
    text: 'text-rose-300',
    icon: TrendingDown,
    chip: 'bg-rose-500/15',
    chipText: 'text-rose-300',
    label: 'Downside cluster',
  },
  base: {
    surface: 'bg-slate-500/10',
    border: 'border-slate-500/25',
    ring: 'shadow-[inset_0_0_0_1px_rgba(100,116,139,0.18)]',
    text: 'text-slate-200',
    icon: Minus,
    chip: 'bg-slate-500/15',
    chipText: 'text-slate-200',
    label: 'Central case',
  },
  bull: {
    surface: 'bg-emerald-500/10',
    border: 'border-emerald-500/25',
    ring: 'shadow-[inset_0_0_0_1px_rgba(16,185,129,0.18)]',
    text: 'text-emerald-300',
    icon: TrendingUp,
    chip: 'bg-emerald-500/15',
    chipText: 'text-emerald-300',
    label: 'Upside cluster',
  },
};

function stressTone(level: number): { chip: string; text: string; label: string } {
  if (level >= 60) return { chip: 'bg-rose-500/15 border-rose-500/30',  text: 'text-rose-300',   label: 'Severe' };
  if (level >= 40) return { chip: 'bg-amber-500/15 border-amber-500/30', text: 'text-amber-300',  label: 'Meaningful' };
  if (level >= 20) return { chip: 'bg-sky-500/15 border-sky-500/30',     text: 'text-sky-300',    label: 'Mild' };
  return                  { chip: 'bg-emerald-500/15 border-emerald-500/30', text: 'text-emerald-300', label: 'Minimal' };
}

/* ─── Subcomponents ─────────────────────────────────────────────────────── */

function ExecutiveSummaryRow({ model }: { model: FutureWorldsModel }) {
  const { summary } = model;

  return (
    <section
      className="rounded-xl border border-border bg-muted/20 p-4"
      data-testid="future-worlds-executive-summary"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
          <Compass className="w-4 h-4 text-amber-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            Macro Executive Summary
            <MetricExplainer metricId="future-worlds" size={12} />
          </div>
          <p
            className="mt-1.5 text-[13px] leading-relaxed text-foreground/90"
            data-testid="future-worlds-executive-commentary"
          >
            {summary.commentary}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
        {summary.strongestTailwind && (
          <SummaryCell
            icon={TrendingUp}
            tone="emerald"
            label={<TermExplainer metricId="macro-tailwind">Strongest tailwind</TermExplainer>}
            value={summary.strongestTailwind.label}
            sub={`${Math.round(summary.strongestTailwind.probability * 100)}% probability cluster`}
            testId="future-worlds-summary-tailwind"
          />
        )}
        {summary.largestVulnerability && (
          <SummaryCell
            icon={ShieldAlert}
            tone="rose"
            label={<TermExplainer metricId="macro-vulnerability">Largest vulnerability</TermExplainer>}
            value={summary.largestVulnerability.label}
            sub={`${Math.round(summary.largestVulnerability.probability * 100)}% probability cluster`}
            testId="future-worlds-summary-vulnerability"
          />
        )}
        <SummaryCell
          icon={Gauge}
          tone="amber"
          label={<TermExplainer metricId="resilience-score">Resilience</TermExplainer>}
          value={`${summary.resilience.score}/100`}
          sub={summary.resilience.band}
          testId="future-worlds-summary-resilience"
        />
        <SummaryCell
          icon={Activity}
          tone="sky"
          label={<TermExplainer metricId="scenario-tree">Dominant cluster</TermExplainer>}
          value={summary.dominantCluster === 'bear' ? 'Bear World' : summary.dominantCluster === 'bull' ? 'Bull World' : 'Base World'}
          sub="probability-weighted"
          testId="future-worlds-summary-cluster"
        />
      </div>
    </section>
  );
}

function SummaryCell({
  icon: Icon,
  tone,
  label,
  value,
  sub,
  testId,
}: {
  icon: typeof TrendingUp;
  tone: 'emerald' | 'rose' | 'amber' | 'sky';
  label: React.ReactNode;
  value: string;
  sub?: string;
  testId?: string;
}) {
  const toneMap = {
    emerald: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25',
    rose:    'text-rose-300 bg-rose-500/10 border-rose-500/25',
    amber:   'text-amber-300 bg-amber-500/10 border-amber-500/25',
    sky:     'text-sky-300 bg-sky-500/10 border-sky-500/25',
  } as const;
  if (!value) return null;
  return (
    <div
      className={cn('rounded-lg border p-3 flex flex-col gap-1', toneMap[tone])}
      data-testid={testId}
    >
      <div className="flex items-start gap-1.5 text-[10px] uppercase tracking-widest font-bold opacity-90">
        <Icon className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
        {/* Wrap freely on narrow columns; desktop columns are wide enough that
            the label still sits on one line. Never truncate the primary value. */}
        <span className="leading-tight break-words">{label}</span>
      </div>
      <div className="text-[13px] font-bold text-foreground leading-tight break-words">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground leading-snug break-words">{sub}</div>}
    </div>
  );
}

function ProbabilityCone({ probability }: { probability: number }) {
  const pct = Math.max(0, Math.min(1, probability));
  const width = `${Math.round(pct * 100)}%`;
  return (
    <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden" aria-hidden="true">
      <div
        className="h-full bg-gradient-to-r from-amber-400/70 via-amber-300/80 to-amber-200"
        style={{ width }}
      />
    </div>
  );
}

// Per-world inline tooltip — kept as a literal element so the canonical
// metricId for each cluster ("bear-world" / "base-world" / "bull-world")
// appears as a static string in source. Static auditors and the
// global-tooltip-wiring test both scan the source for these literals.
const WORLD_LABEL_NODE: Record<WorldKind, JSX.Element> = {
  bear: <TermExplainer metricId="bear-world">Bear World</TermExplainer>,
  base: <TermExplainer metricId="base-world">Base World</TermExplainer>,
  bull: <TermExplainer metricId="bull-world">Bull World</TermExplainer>,
};

function WorldCard({ world }: { world: DerivedWorld }) {
  const accent = WORLD_ACCENT[world.kind];
  const Icon = accent.icon;
  const [expanded, setExpanded] = useState(false);
  const stress = stressTone(world.stressLevel);
  const nw = fmtMoney(world.expectedNetWorth);
  const band = world.netWorthBand
    ? `${fmtMoney(world.netWorthBand.p10)} – ${fmtMoney(world.netWorthBand.p90)}`
    : null;
  const fireYear = world.fireYear != null && Number.isFinite(world.fireYear) ? `${world.fireYear} yr` : null;

  return (
    <article
      className={cn(
        'rounded-2xl border p-4 flex flex-col gap-3 transition-colors',
        accent.surface,
        accent.border,
        accent.ring,
      )}
      data-testid={`future-worlds-${world.kind}-card`}
      data-world={world.kind}
    >
      {/* Header */}
      <header className="flex items-start gap-2.5">
        <div className={cn('w-8 h-8 rounded-xl border flex items-center justify-center shrink-0', accent.border, accent.surface)}>
          <Icon className={cn('w-4 h-4', accent.text)} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-sm font-bold text-foreground leading-tight">
            {WORLD_LABEL_NODE[world.kind]}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{accent.label}</div>
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums', accent.chip, accent.chipText)}>
          {Math.round(world.probability * 100)}%
        </span>
      </header>

      <ProbabilityCone probability={world.probability} />

      {/* Headline KPIs */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {nw && (
          <KpiRow
            label={<TermExplainer metricId="net-worth-reconciliation">Projected net worth</TermExplainer>}
            value={nw}
            band={band ?? undefined}
          />
        )}
        {fireYear && (
          <KpiRow
            label={<TermExplainer metricId="fire">FIRE timeline</TermExplainer>}
            value={fireYear}
          />
        )}
        <KpiRow
          label={<TermExplainer metricId="stress-level">Stress level</TermExplainer>}
          value={
            <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold', stress.chip, stress.text)}>
              <span>{world.stressLevel}/100</span>
              <span className="opacity-80">·</span>
              <span>{stress.label}</span>
            </span>
          }
          isChip
        />
        <KpiRow
          label={<TermExplainer metricId="scenario-driver">Key driver</TermExplainer>}
          value={world.keyDriver}
        />
      </dl>

      {/* Posture row */}
      <div className="rounded-lg border border-border/60 bg-background/40 p-2.5">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">
          <Briefcase className="w-3 h-3" aria-hidden="true" />
          <TermExplainer metricId="decision-posture">Recommended posture</TermExplainer>
        </div>
        <p className="text-[12px] leading-relaxed text-foreground/90">{world.posture}</p>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {world.whatChanges}
      </p>

      {/* Explainability — expandable */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-amber-300 hover:text-amber-200 transition-colors w-fit"
        data-testid={`future-worlds-${world.kind}-explain-toggle`}
      >
        <span>What changed under the hood</span>
        <ChevronDown
          className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div
          className="rounded-lg border border-border/60 bg-background/40 p-2.5 space-y-2"
          data-testid={`future-worlds-${world.kind}-explain-body`}
        >
          {world.underTheHood.length > 0 && (
            <ul className="space-y-1">
              {world.underTheHood.map((line) => (
                <li key={line} className="text-[11px] leading-relaxed text-foreground/85 flex gap-1.5">
                  <span className="text-muted-foreground">·</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
          {world.contributingRegimes.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1">
                Top contributing regimes
              </div>
              <ul className="space-y-0.5">
                {world.contributingRegimes.map((r) => (
                  <li
                    key={r.id}
                    className="text-[11px] text-foreground/80 flex justify-between gap-2"
                  >
                    <span className="truncate">{r.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {Math.round(r.probability * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function KpiRow({
  label,
  value,
  band,
  isChip,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  band?: string;
  isChip?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold truncate">{label}</div>
      <div className={cn('mt-0.5 text-[12px] font-bold text-foreground leading-tight', isChip ? '' : 'truncate')}>
        {value}
      </div>
      {band && <div className="text-[10px] text-muted-foreground truncate">Band {band}</div>}
    </div>
  );
}

function SensitivityMap({ rows }: { rows: SensitivityRow[] }) {
  const iconFor: Record<SensitivityRow['id'], typeof Activity> = {
    rates: Gauge,
    property: Building2,
    equity: LineChartIcon,
    inflation: Activity,
    employment: Wallet,
  };

  return (
    <section
      className="rounded-xl border border-border bg-muted/15 p-4"
      data-testid="future-worlds-sensitivity-map"
    >
      <div className="flex items-center gap-1.5 mb-3">
        <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
          <Gauge className="w-3.5 h-3.5 text-sky-300" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground inline-flex items-center gap-1.5">
            Portfolio Sensitivity Map
            <SectionExplainer metricId="portfolio-sensitivity" />
          </p>
          <p className="text-[10px] text-muted-foreground">How net worth responds to the five primary macro shocks</p>
        </div>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => {
          const tone = SENS_COLOR[row.level];
          const Icon = iconFor[row.id];
          return (
            <li
              key={row.id}
              className={cn(
                'rounded-lg border bg-background/40 p-2.5 flex gap-3 items-start',
                tone.border,
              )}
              data-testid={`future-worlds-sensitivity-${row.id}`}
            >
              <div className={cn('mt-0.5 w-7 h-7 rounded-md border flex items-center justify-center shrink-0', tone.chip, tone.border)}>
                <Icon className={cn('w-3.5 h-3.5', tone.chipText)} aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold text-foreground">
                    <TermExplainer metricId="portfolio-sensitivity">{row.label}</TermExplainer>
                  </span>
                  <span
                    className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest', tone.chip, tone.chipText, tone.border)}
                    data-testid={`future-worlds-sensitivity-${row.id}-level`}
                  >
                    {row.level}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-foreground/80 mt-1">{row.why}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ─── Root component ────────────────────────────────────────────────────── */

export interface FutureWorldsPanelProps {
  inputs?: ScenarioBranchInputs;
  /** Additional household context used to derive the sensitivity map. */
  context?: DerivationContext;
}

export default function FutureWorldsPanel({
  inputs,
  context,
}: FutureWorldsPanelProps) {
  const model = useMemo<FutureWorldsModel>(() => {
    const tree = buildScenarioTree(inputs);
    const derivationCtx: DerivationContext = {
      baseNetWorth: inputs?.baseNetWorth,
      ...(context ?? {}),
    };
    return deriveFutureWorlds(tree, derivationCtx);
  }, [JSON.stringify(inputs ?? {}), JSON.stringify(context ?? {})]);

  // Header weighted-NW chip is rendered ONLY when it is backed by a real,
  // positive canonical baseline net worth. When the panel mounts without
  // inputs (e.g. dashboard hasn't wired the contract yet) the scenario
  // engine returns 0 — which is non-informative and would render as
  // "weighted NW $0". Per UX QA we hide it entirely in that case.
  const weighted = (() => {
    const v = model.weightedNetWorth;
    if (v == null || !Number.isFinite(v)) return null;
    if (Math.abs(v) < 1000) return null;
    if (!(inputs?.baseNetWorth && Number.isFinite(inputs.baseNetWorth) && inputs.baseNetWorth > 0)) return null;
    return fmtMoney(v);
  })();

  return (
    <div
      className="rounded-2xl border border-border bg-card overflow-hidden"
      data-testid="future-worlds-panel"
    >
      <header className="px-4 pt-4 pb-3 border-b border-border flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
            <Globe2 className="w-4 h-4 text-sky-300" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground inline-flex items-center gap-1.5">
              Future Worlds
              <SectionExplainer metricId="future-worlds" />
            </p>
            <p className="text-[10px] text-muted-foreground">
              Strategic intelligence — Bear · Base · Bull with sensitivity and posture
            </p>
          </div>
        </div>
        {weighted && (
          <span className="text-[10px] text-muted-foreground whitespace-nowrap" data-testid="future-worlds-weighted-nw">
            weighted NW {weighted}
          </span>
        )}
      </header>

      <div className="p-4 space-y-4">
        <ExecutiveSummaryRow model={model} />

        <section
          data-testid="future-worlds-three-worlds"
          className="grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          <WorldCard world={model.worlds.bear} />
          <WorldCard world={model.worlds.base} />
          <WorldCard world={model.worlds.bull} />
        </section>

        <SensitivityMap rows={model.sensitivity} />
      </div>

      <footer className="px-4 pb-4 pt-3 border-t border-border">
        <p className="text-[10px] text-muted-foreground">
          Future Worlds is descriptive — probability-weighted commentary built on the canonical Scenario Tree engine.
          Strategic actions remain owned by Recommendation Engine V2.
        </p>
      </footer>
    </div>
  );
}

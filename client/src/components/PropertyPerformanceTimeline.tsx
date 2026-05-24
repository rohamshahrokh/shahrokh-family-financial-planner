/**
 * PropertyPerformanceTimeline.tsx
 *
 * Sprint 2C — Property page only. Renders a 30-year property investment
 * journey view per property. Two view modes:
 *
 *   • Timeline View — annual table: Year, Value, Loan, Equity, Annual CF,
 *     Cumulative CF, Tax Refund, After-Tax CF (negative → red, breakeven →
 *     amber, positive → green). Highlights first positive year and the
 *     loss-bank balance under reform.
 *
 *   • Gantt View — one row per property, one bar per year coloured by tone
 *     (negative / breakeven / positive). Lets the user compare lifetimes at
 *     a glance.
 *
 * This is presentation-only: all numbers come from existing engine outputs
 * via buildPropertyTimeline() (projectProperty + calcNegativeGearing in
 * finance.ts). No new tax / forecast / borrowing engines.
 */

import { useMemo, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { Clock, Layers, TrendingUp, AlertTriangle, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import { buildPropertyTimeline, type PropertyTimelineSummary, type CashflowTone } from '@/lib/propertyTimelineBuilder';

const TONE_COLOR: Record<CashflowTone, string> = {
  negative:  'hsl(0,65%,58%)',
  breakeven: 'hsl(43,90%,58%)',
  positive:  'hsl(145,55%,48%)',
};

const TONE_CELL_CLASS: Record<CashflowTone, string> = {
  negative:  'bg-red-500/10 text-red-300',
  breakeven: 'bg-amber-500/10 text-amber-300',
  positive:  'bg-emerald-500/10 text-emerald-300',
};

const TONE_LABEL: Record<CashflowTone, string> = {
  negative: 'Negative', breakeven: 'Breakeven', positive: 'Positive',
};

interface Props {
  properties: any[];
  annualSalaryIncome?: number;
  scenario?: 'current_law' | 'proposed_reform' | 'custom';
  jointOwnership?: boolean;
  refundMode?: 'lump-sum' | 'payg';
  horizonYears?: number;
  /** Allow tests / storybook to pin "today" for deterministic content. */
  defaultMode?: 'timeline' | 'gantt';
}

export default function PropertyPerformanceTimeline({
  properties,
  annualSalaryIncome,
  scenario,
  jointOwnership,
  refundMode,
  horizonYears = 30,
  defaultMode = 'timeline',
}: Props) {
  const [mode, setMode] = useState<'timeline' | 'gantt'>(defaultMode);

  // Sprint 2C — only investment properties get a journey view. Historical
  // states (sold/archived) are dropped here so the timeline stays focused.
  const summaries = useMemo<PropertyTimelineSummary[]>(() => {
    const activeStatuses = new Set(['planned', 'under_contract', 'settled', '']);
    return (properties || [])
      .filter(p => p && p.type !== 'ppor' && p.type !== 'owner_occupied')
      .filter(p => {
        const s = String(p.lifecycle_status || '').toLowerCase();
        return activeStatuses.has(s);
      })
      .map(p =>
        buildPropertyTimeline({
          property: p,
          annualSalaryIncome,
          scenario,
          jointOwnership,
          refundMode,
          horizonYears,
        }),
      )
      .filter(s => s.points.length > 0);
  }, [properties, annualSalaryIncome, scenario, jointOwnership, refundMode, horizonYears]);

  if (summaries.length === 0) {
    return (
      <section
        className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground text-center"
        data-testid="property-performance-timeline-empty"
      >
        Add an active investment property (planned, under contract or settled)
        to see its {horizonYears}-year performance journey.
      </section>
    );
  }

  return (
    <section className="space-y-4" data-testid="property-performance-timeline">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold uppercase tracking-widest text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Property Performance Timeline
          </h3>
          <p className="text-[11px] text-muted-foreground">
            {horizonYears}-year investment journey per property: value, loan, equity, cashflow, tax effect and after-tax result. Negative years red · breakeven amber · positive green.
          </p>
        </div>
        <div
          className="inline-flex p-1 rounded-lg bg-secondary/60 border border-border"
          role="tablist"
          data-testid="property-performance-timeline-mode-switch"
        >
          <button
            role="tab"
            aria-selected={mode === 'timeline'}
            onClick={() => setMode('timeline')}
            className={`px-3 py-1.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
              mode === 'timeline' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="property-performance-timeline-mode-timeline"
          >
            <Clock className="w-3 h-3" />
            Timeline View
          </button>
          <button
            role="tab"
            aria-selected={mode === 'gantt'}
            onClick={() => setMode('gantt')}
            className={`px-3 py-1.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
              mode === 'gantt' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="property-performance-timeline-mode-gantt"
          >
            <Layers className="w-3 h-3" />
            Gantt View
          </button>
        </div>
      </header>

      {mode === 'timeline'
        ? <TimelineMode summaries={summaries} />
        : <GanttMode summaries={summaries} />
      }
    </section>
  );
}

/* ─── Timeline View ─────────────────────────────────────────────────── */

function TimelineMode({ summaries }: { summaries: PropertyTimelineSummary[] }) {
  return (
    <div className="space-y-6" data-testid="property-performance-timeline-mode-content-timeline">
      {summaries.map(summary => (
        <article
          key={String(summary.propertyId) || summary.propertyName}
          className="rounded-xl border border-border bg-card p-4"
          data-testid={`property-performance-timeline-property-${summary.propertyId}`}
        >
          <header className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h4 className="text-sm font-bold text-foreground">{summary.propertyName}</h4>
              <p className="text-[10px] text-muted-foreground font-mono">id: {String(summary.propertyId)}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              {summary.firstPositiveYear !== undefined && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-semibold">
                  <DollarSign className="w-3 h-3" />
                  First positive year: {summary.firstPositiveYear}
                </span>
              )}
              {summary.firstCumulativeBreakevenYear !== undefined && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-primary/40 bg-primary/10 text-primary font-semibold">
                  Cumulative breakeven: {summary.firstCumulativeBreakevenYear}
                </span>
              )}
              {summary.totalLossBankBalanceFinal > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 font-semibold">
                  <AlertTriangle className="w-3 h-3" />
                  Loss bank (final): {formatCurrency(summary.totalLossBankBalanceFinal, true)}
                </span>
              )}
            </div>
          </header>

          {/* Cumulative cashflow sparkline */}
          <div className="h-32 mb-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={summary.points}>
                <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
                <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }}
                       tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 11 }}
                  formatter={(v: any, name: string) => [formatCurrency(Number(v), true), name]}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="cumulativeAfterTax" name="Cumulative After-Tax" stroke="hsl(145,55%,55%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cumulativeCashflow" name="Cumulative Pre-Tax" stroke="hsl(210,55%,60%)" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Annual table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-secondary/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-1.5 font-semibold">Year</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Value</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Loan</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Equity</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Annual CF</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Cumulative CF</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Tax Refund</th>
                  <th className="text-right px-2 py-1.5 font-semibold">After-Tax CF</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Cumul. After-Tax</th>
                </tr>
              </thead>
              <tbody>
                {summary.points.map(p => (
                  <tr
                    key={p.year}
                    className={`border-t border-border/60 ${TONE_CELL_CLASS[p.tone]}`}
                    data-testid={`property-performance-timeline-row-${summary.propertyId}-${p.yearIndex}`}
                    data-tone={p.tone}
                  >
                    <td className="px-2 py-1.5 font-semibold">
                      {p.year}
                      {p.isFirstPositiveYear && (
                        <span className="ml-1 inline-block text-[9px] uppercase tracking-wider text-emerald-400 font-bold">★ first +ve</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(p.propertyValue, true)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(p.loanBalance, true)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(p.equity, true)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(p.annualCashflow, true)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(p.cumulativeCashflow, true)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(p.taxRefund, true)}</td>
                    <td className="px-2 py-1.5 text-right font-mono font-semibold">{formatCurrency(p.afterTaxCashflow, true)}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{formatCurrency(p.cumulativeAfterTax, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
    </div>
  );
}

/* ─── Gantt View ────────────────────────────────────────────────────── */

function GanttMode({ summaries }: { summaries: PropertyTimelineSummary[] }) {
  // One bar per year. We use a small recharts BarChart per property so the
  // colouring is consistent across responsive widths.
  return (
    <div className="space-y-6" data-testid="property-performance-timeline-mode-content-gantt">
      <Legend />
      {summaries.map(summary => (
        <article
          key={String(summary.propertyId) || summary.propertyName}
          className="rounded-xl border border-border bg-card p-4"
          data-testid={`property-performance-gantt-property-${summary.propertyId}`}
        >
          <header className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h4 className="text-sm font-bold text-foreground">{summary.propertyName}</h4>
              <p className="text-[10px] text-muted-foreground">
                {summary.years}-year journey
                {summary.firstPositiveYear !== undefined && ` · first +ve: ${summary.firstPositiveYear}`}
                {summary.firstCumulativeBreakevenYear !== undefined && ` · cumulative breakeven: ${summary.firstCumulativeBreakevenYear}`}
              </p>
            </div>
          </header>

          <div className="h-24">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.points} barCategoryGap={1}>
                <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 9 }} interval={1} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 11 }}
                  formatter={(_v: any, _n: string, item: any) => {
                    const p = item?.payload;
                    if (!p) return '';
                    return [
                      `${TONE_LABEL[p.tone as CashflowTone]} · ${formatCurrency(p.afterTaxCashflow, true)} after-tax`,
                      `Year ${p.year}`,
                    ];
                  }}
                />
                <Bar dataKey={(p: any) => Math.abs(p.afterTaxCashflow) || 1} radius={[2,2,2,2]}>
                  {summary.points.map((p, i) => (
                    <Cell key={i} fill={TONE_COLOR[p.tone]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Year labels grid — supports keyboard testing and a11y */}
          <div
            className="grid grid-flow-col auto-cols-fr gap-px mt-1"
            role="list"
            aria-label={`${summary.propertyName} per-year cashflow tone`}
          >
            {summary.points.map(p => (
              <div
                key={p.year}
                role="listitem"
                title={`${p.year} · ${TONE_LABEL[p.tone]} (${formatCurrency(p.afterTaxCashflow, true)})`}
                className={`h-2 rounded-sm ${TONE_CELL_CLASS[p.tone]}`}
                data-testid={`property-performance-gantt-cell-${summary.propertyId}-${p.yearIndex}`}
                data-tone={p.tone}
              />
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-[11px]" data-testid="property-performance-gantt-legend">
      {(['negative', 'breakeven', 'positive'] as CashflowTone[]).map(tone => (
        <span key={tone} className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: TONE_COLOR[tone] }} />
          <span className="text-muted-foreground">{TONE_LABEL[tone]} year</span>
        </span>
      ))}
    </div>
  );
}

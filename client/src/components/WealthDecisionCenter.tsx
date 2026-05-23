/**
 * WealthDecisionCenter.tsx — operational CASH / EVENTS / RISK surface.
 *
 * Sits inside the Executive Overview cockpit BELOW the promoted Strategic
 * Wealth Projection (chart) and richer analytical table, as the operational
 * decision surface:
 *
 *   • CASH    — Deposit Power & Usable Equity breakdown table + Plan
 *               Execution Capacity chart (all controls preserved).
 *   • EVENTS  — Strategy timeline / roadmap (deposit build, IP purchases,
 *               stock DCA, crypto allocation, refinance, FIRE target) with
 *               planned / active / completed status.
 *   • RISK    — Liquidity / leverage / downside / survivability summary.
 *
 * NOTE: The prior WEALTH tab — which re-rendered the Monte Carlo trajectory
 * chart + projection table — was removed in the Executive Overview Projection
 * Cleanup pass. The promoted Strategic Wealth Projection panel above is now
 * the single primary strategic visualization, paired with the single richer
 * analytical table. The deep Forecast Engine remains one click away via the
 * panel link.
 *
 * Source-of-truth invariants:
 *   • CURRENT debt is the only debt figure shown in the Hero / Today / CASH
 *     liquidity context. Planned and forecast leverage appear ONLY in the
 *     Events tab, clearly labelled as planned.
 *   • Live PPOR mortgage rate (5.82%) flows from `snap.mortgage_rate` — never
 *     a forecast / blended rate.
 *   • Reuses the existing DepositPowerTrajectoryPanel from ExecutiveDashboard
 *     via a single render slot — no duplicate intelligence.
 */

import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  Wallet, Calendar, Shield,
  Building2, LineChart as LineChartIcon, Coins as CoinsIcon,
  Repeat, Banknote, Flame, Sparkles, CheckCircle2, Clock, CircleDot,
} from 'lucide-react';
import { formatCurrency } from '@/lib/finance';
import { useAppStore } from '@/lib/store';
import { maskValue } from '@/components/PrivacyMask';
import CanonicalRiskSurface from '@/components/CanonicalRiskSurface';
import type {
  ExecutiveDashboardProps,
  RoadmapEvent,
  DepositPowerSummary,
} from './ExecutiveDashboard';

type TabKey = 'CASH' | 'EVENTS' | 'RISK';

const TAB_DEFS: { key: TabKey; label: string; Icon: any; description: string }[] = [
  { key: 'CASH',   label: 'CASH',   Icon: Wallet,   description: 'Deposit Power · liquidity execution' },
  { key: 'EVENTS', label: 'EVENTS', Icon: Calendar, description: 'Strategy roadmap · planned events' },
  { key: 'RISK',   label: 'RISK',   Icon: Shield,   description: 'Liquidity · leverage · downside' },
];

const ROADMAP_ICON: Record<string, any> = {
  'deposit-build':  Wallet,
  'ip-purchase':    Building2,
  'stock-dca':      LineChartIcon,
  'stock-buy':      LineChartIcon,
  'crypto-buy':     CoinsIcon,
  'crypto-dca':     CoinsIcon,
  'refinance':      Repeat,
  'debt-reduction': Banknote,
  'fire-target':    Flame,
  'default':        Sparkles,
};

const STATUS_CFG: Record<RoadmapEvent['status'], { label: string; tone: string; Icon: any }> = {
  planned:   { label: 'Planned',   tone: 'hsl(43,90%,55%)',  Icon: Clock },
  active:    { label: 'Active',    tone: 'hsl(195,80%,60%)', Icon: CircleDot },
  completed: { label: 'Completed', tone: 'hsl(142,60%,55%)', Icon: CheckCircle2 },
};

// ─── Default roadmap derivation ─────────────────────────────────────────────
// If the caller has no explicit roadmap, synthesise a deterministic roadmap
// from snapshot signals + the live property plan (acquisition / settlement /
// contract dates) so the EVENTS tab reflects the ACTUAL property plan and
// not a static +3y assumption. Required by FWL_TAX_REFORM_INTEGRITY_FIX:
// IP2 must show 2028 when the plan has IP2 acquisition in 2028.
//
// The "planned IPs" list is read from `props.plannedAcquisitions` when the
// host page wires it (dashboard now does — sourced from /api/properties
// rows with settlement_date / purchase_date / contract_date in the future).
function plannedAcquisitionYear(
  p: NonNullable<ExecutiveDashboardProps['plannedAcquisitions']>[number],
): number | null {
  const raw = p.contract_date ?? p.settlement_date ?? p.purchase_date ?? null;
  if (!raw) return null;
  const y = parseInt(String(raw).slice(0, 4), 10);
  return Number.isFinite(y) && y > 1900 ? y : null;
}

function defaultRoadmap(props: ExecutiveDashboardProps): RoadmapEvent[] {
  const thisYear = new Date().getFullYear();
  const dp = props.depositPowerSummary;
  const ipReadiness = dp?.ipReadinessPct ?? 0;
  const dpAmt = dp?.totalDepositPower ?? 0;
  const finalYear = dp?.finalYearLabel ?? `${thisYear + 10}`;

  // ── Live property plan derivation ──
  // Sort planned acquisitions by their target year. The FIRST entry feeds
  // the "First Investment Property" event; the SECOND entry feeds "Second
  // Investment Property". When the plan is empty we fall back to readiness
  // signals (first IP) and to NULL for IP2 (we skip it rather than fake a
  // static +3y entry — fakery is what this fix exists to remove).
  const plan = (props.plannedAcquisitions ?? [])
    .map(p => ({ entry: p, year: plannedAcquisitionYear(p) }))
    .filter(x => x.year !== null)
    .sort((a, b) => (a.year as number) - (b.year as number));

  const firstIpYear: number =
    plan[0]?.year ?? (thisYear + (ipReadiness >= 100 ? 0 : 1));
  // FOLLOW_UP: when the live /api/properties feed has fewer than 2 planned
  // IPs, fall back to the explicit roadmap-derived year supplied by the
  // host page (sourced from the execution roadmap / fire-scenario engine).
  // The Second IP event must still render so the user sees the planned
  // acquisition the engine knows about — never a static +3y guess.
  const roadmapIp2: number | null =
    typeof props.roadmapSecondIpYear === 'number' &&
    Number.isFinite(props.roadmapSecondIpYear)
      ? props.roadmapSecondIpYear
      : null;
  const secondIpYear: number | null = plan[1]?.year ?? roadmapIp2 ?? null;
  const secondIpFromRoadmap = plan[1]?.year == null && roadmapIp2 !== null;

  const events: RoadmapEvent[] = [];

  events.push({
    id: 'deposit-build',
    year: `${thisYear}`,
    kind: 'deposit-build',
    title: 'Deposit Power Build',
    description: 'Grow liquid deposit power via offset + surplus deployment.',
    amount: dpAmt,
    amountLabel: dpAmt > 0 ? `Deposit power ${formatCurrency(dpAmt, true)}` : null,
    status: 'active',
  });

  events.push({
    id: 'first-ip',
    year: `${firstIpYear}`,
    kind: 'ip-purchase',
    title: 'First Investment Property',
    description: plan[0]?.entry?.name
      ? `Acquire ${plan[0].entry.name} per property plan.`
      : 'Acquire first IP once deposit + buffer + serviceability align.',
    amountLabel: plan[0]?.entry?.purchase_price
      ? `Plan price ${formatCurrency(plan[0].entry.purchase_price, true)} · ~80% LVR`
      : 'Plan loan ~80% LVR · settled when ready',
    status: ipReadiness >= 100 ? 'active' : 'planned',
  });

  events.push({
    id: 'stock-dca',
    year: `${thisYear}`,
    kind: 'stock-dca',
    title: 'Stock DCA Plan',
    description: 'Dollar-cost averaging into global / Aussie ETFs after buffer.',
    amountLabel: 'Monthly allocation when surplus available',
    status: 'active',
  });

  events.push({
    id: 'crypto-allocation',
    year: `${thisYear}`,
    kind: 'crypto-buy',
    title: 'Crypto Allocation',
    description: 'Long-horizon BTC / ETH satellite allocation.',
    amountLabel: 'Disciplined % of portfolio',
    status: 'planned',
  });

  events.push({
    id: 'refinance-review',
    year: `${thisYear + 1}`,
    kind: 'refinance',
    title: 'Refinance Review',
    description: 'Re-shop the PPOR mortgage if rates drop > 0.5%.',
    amountLabel: typeof props.livePporRate === 'number' ? `Today PPOR ${props.livePporRate.toFixed(2)}%` : null,
    status: 'planned',
  });

  if (secondIpYear !== null) {
    events.push({
      id: 'second-ip',
      year: `${secondIpYear}`,
      kind: 'ip-purchase',
      title: 'Second Investment Property',
      description: plan[1]?.entry?.name
        ? `Acquire ${plan[1].entry.name} per property plan.`
        : (secondIpFromRoadmap
            ? 'Second IP per execution roadmap (acquisition engine target year).'
            : 'Second IP after equity from first IP recycles.'),
      amountLabel: plan[1]?.entry?.purchase_price
        ? `Plan price ${formatCurrency(plan[1].entry.purchase_price, true)} · recycled equity`
        : (secondIpFromRoadmap
            ? 'Roadmap target year · plan loan from recycled equity'
            : 'Plan loan from recycled equity'),
      status: 'planned',
    });
  }

  // Debt-reduction and FIRE target use the deposit power final year as the
  // calm "long horizon" anchor (no hardcoded +5y / +10y offsets).
  const finalYearNum = parseInt(String(finalYear).slice(0, 4), 10);
  if (Number.isFinite(finalYearNum)) {
    events.push({
      id: 'debt-reduction',
      year: `${Math.max(firstIpYear + 1, finalYearNum - 5)}`,
      kind: 'debt-reduction',
      title: 'Debt Reduction Phase',
      description: 'Switch from acquisition to principal reduction.',
      amountLabel: 'Target offset = mortgage',
      status: 'planned',
    });
  }

  events.push({
    id: 'fire-target',
    year: finalYear,
    kind: 'fire-target',
    title: 'FIRE Readiness Target',
    description: 'Passive income ≥ lifestyle expenses · safe withdrawal cleared.',
    amountLabel: `${Math.round(props.fireProgressPct ?? 0)}% of target today`,
    status: 'planned',
  });

  return events;
}

// ─── Deposit Power breakdown table ──────────────────────────────────────────
// The full canonical breakdown. The rows are non-negotiable:
//   Cash + Offset · PPOR Usable Equity · IP Usable Equity · Gross Total ·
//   Emergency Buffer · Total Deposit Power.
function DepositPowerBreakdownTable({
  summary,
  privacyMode,
}: {
  summary: DepositPowerSummary | null | undefined;
  privacyMode: boolean;
}) {
  const mv = (v: string) => maskValue(v, privacyMode);
  const cashAndOffset = summary?.cashAndOffset ?? summary?.cashToday ?? 0;
  const ppor = summary?.pporUsableEquity ?? 0;
  const ip = summary?.ipUsableEquity ?? 0;
  const buffer = summary?.emergencyBuffer ?? 0;
  const gross = summary?.grossTotal ?? (cashAndOffset + ppor + ip);
  const total = summary?.totalDepositPower ?? Math.max(0, gross - buffer);

  const rows: { label: string; value: number; sign?: 'plus' | 'minus'; emphasis?: boolean }[] = [
    { label: 'Cash + Offset',       value: cashAndOffset, sign: 'plus' },
    { label: 'PPOR Usable Equity',  value: ppor,          sign: 'plus' },
    { label: 'IP Usable Equity',    value: ip,            sign: 'plus' },
    { label: 'Gross Total',         value: gross,         emphasis: true },
    { label: 'Emergency Buffer',    value: buffer,        sign: 'minus' },
    { label: 'Total Deposit Power', value: total,         emphasis: true },
  ];

  return (
    <div
      className="rounded-xl border border-border/40 overflow-hidden"
      data-testid="wdc-deposit-power-breakdown"
    >
      <header className="px-4 py-2.5 border-b border-border/30 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-foreground uppercase tracking-widest">
            Deposit Power Breakdown
          </h3>
          <p className="text-[10px] text-muted-foreground">
            Canonical liquidity + usable equity stack
          </p>
        </div>
      </header>
      <table className="w-full text-sm" data-testid="wdc-deposit-power-table">
        <tbody className="divide-y divide-border/30">
          {rows.map((r) => {
            const isTotal = r.label === 'Total Deposit Power';
            const isGross = r.label === 'Gross Total';
            const tone = isTotal
              ? 'text-amber-300 font-extrabold'
              : isGross
              ? 'text-foreground font-bold'
              : 'text-foreground';
            return (
              <tr
                key={r.label}
                data-testid={`wdc-breakdown-row-${r.label.toLowerCase().replace(/[^a-z]+/g, '-')}`}
                className={isTotal ? 'bg-amber-500/5' : ''}
              >
                <td className={`px-4 py-2 text-[12px] ${isTotal ? 'font-extrabold uppercase tracking-widest text-amber-200' : 'text-muted-foreground'}`}>
                  {r.label}
                </td>
                <td className={`px-4 py-2 text-right tabular-nums font-mono text-[13px] ${tone}`}>
                  {r.sign === 'minus' ? '−' : ''}{mv(formatCurrency(Math.abs(r.value), true))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Events timeline ────────────────────────────────────────────────────────
function EventsTimeline({
  events,
  plannedDebt,
  privacyMode,
}: {
  events: RoadmapEvent[];
  plannedDebt?: number | null;
  privacyMode: boolean;
}) {
  const mv = (v: string) => maskValue(v, privacyMode);
  // Group by year for the marker rail.
  const grouped = useMemo(() => {
    const map = new Map<string, RoadmapEvent[]>();
    for (const e of events) {
      const arr = map.get(e.year) ?? [];
      arr.push(e);
      map.set(e.year, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  return (
    <div className="space-y-3" data-testid="wdc-events-timeline">
      {plannedDebt != null && plannedDebt > 0 && (
        <div
          className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-200"
          data-testid="wdc-events-planned-debt-banner"
        >
          Planned future leverage on this roadmap totals{' '}
          <span className="font-bold tabular-nums">{mv(formatCurrency(plannedDebt, true))}</span>.
          This is <span className="font-bold">planned</span> — not current debt. It is excluded
          from the Today snapshot and Best Move evaluation.
        </div>
      )}
      {grouped.length === 0 ? (
        <div className="rounded-lg border border-border/40 px-4 py-6 text-center text-xs text-muted-foreground">
          No roadmap events yet. Add planned moves from /wealth-strategy.
        </div>
      ) : (
        <ol className="relative pl-6" data-testid="wdc-events-list">
          <span
            className="absolute left-2 top-1 bottom-1 w-px"
            style={{ background: 'hsl(var(--border) / 0.65)' }}
            aria-hidden="true"
          />
          {grouped.map(([year, items]) => (
            <li key={year} className="mb-4" data-testid={`wdc-events-year-${year}`}>
              <div className="flex items-center gap-2 mb-2 -ml-6">
                <span
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold"
                  style={{ background: 'hsl(var(--gold))', color: 'hsl(var(--primary-foreground))' }}
                  aria-hidden="true"
                >
                  •
                </span>
                <span className="text-[10px] uppercase tracking-widest font-bold text-amber-200">
                  {year}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((e) => {
                  const Icon = ROADMAP_ICON[e.kind] ?? ROADMAP_ICON.default;
                  const status = STATUS_CFG[e.status];
                  const SIcon = status.Icon;
                  return (
                    <div
                      key={e.id}
                      data-testid={`wdc-event-${e.id}`}
                      className="rounded-lg border border-border/40 bg-card/40 px-3 py-2.5 flex items-start gap-3"
                    >
                      <div
                        className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: 'hsl(var(--gold-surface) / 0.45)', border: '1px solid hsl(var(--gold-dim) / 0.4)' }}
                      >
                        <Icon className="w-4 h-4" style={{ color: 'hsl(var(--gold))' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-[13px] font-semibold text-foreground leading-snug">
                            {e.title}
                          </p>
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest"
                            style={{ color: status.tone, border: `1px solid ${status.tone}55`, background: `${status.tone}10` }}
                            data-testid={`wdc-event-${e.id}-status`}
                          >
                            <SIcon className="w-2.5 h-2.5" />
                            {status.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                          {e.description}
                        </p>
                        {(e.amountLabel || (typeof e.amount === 'number' && e.amount > 0)) && (
                          <p className="text-[11px] text-emerald-300 font-mono mt-1 tabular-nums">
                            {e.amountLabel ?? (e.amount ? mv(formatCurrency(e.amount, true)) : null)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ─── Risk tab ───────────────────────────────────────────────────────────────
// The Risk tab renders the canonical 8-axis radar, stress matrix and FIRE
// fragility gauge ONLY. The prior liquidity / leverage / survivability /
// current-debt cards have been removed: they duplicated Financial Health and
// added no decision value on this surface. See `CanonicalRiskSurface`.
function RiskTabBody({ props }: { props: ExecutiveDashboardProps }) {
  if (!props.riskSurface) {
    return (
      <div
        className="rounded-xl border border-border/40 bg-card/40 px-4 py-6 text-center"
        data-testid="wdc-risk-pending"
      >
        <p className="text-xs text-muted-foreground">
          Risk surface is computing — open the dashboard once more to refresh.
        </p>
      </div>
    );
  }
  return <CanonicalRiskSurface surface={props.riskSurface} />;
}

// ─── Public component ──────────────────────────────────────────────────────

export interface WealthDecisionCenterProps {
  /** Initial active tab. */
  defaultTab?: TabKey;
  /** Forwarded executive props so each tab can render its dedicated view. */
  executiveProps: ExecutiveDashboardProps;
  /**
   * Slot renderer for the Plan Execution Capacity chart, supplied by
   * ExecutiveDashboard.tsx so the live operational chart renders without
   * duplicating logic. The prior WEALTH tab's Monte Carlo + projection
   * renderers were removed in the Executive Overview Projection Cleanup
   * pass — the promoted Strategic Wealth Projection above is the single
   * primary surface for those.
   */
  renderDepositPowerChart: () => React.ReactNode;
}

export default function WealthDecisionCenter({
  defaultTab = 'CASH',
  executiveProps,
  renderDepositPowerChart,
}: WealthDecisionCenterProps) {
  const [tab, setTab] = useState<TabKey>(defaultTab);
  const { privacyMode } = useAppStore();
  const events = useMemo(
    () => (executiveProps.roadmapEvents && executiveProps.roadmapEvents.length > 0
      ? executiveProps.roadmapEvents
      : defaultRoadmap(executiveProps)),
    [executiveProps],
  );

  return (
    <section
      className="rounded-2xl border border-border bg-card overflow-hidden"
      data-testid="wealth-decision-center"
      aria-label="Wealth Decision Center"
    >
      <header className="px-5 pt-4 pb-2.5 border-b border-border/30 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-foreground">Wealth Decision Center</h2>
          <p className="text-[11px] text-muted-foreground">
            Operational execution surface · CASH · EVENTS · RISK
          </p>
        </div>
        <nav
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label="Wealth Decision Center tabs"
          data-testid="wdc-tabs"
        >
          {TAB_DEFS.map((t) => {
            const active = tab === t.key;
            const Icon = t.Icon;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                data-testid={`wdc-tab-${t.key}`}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-colors ${
                  active
                    ? 'bg-amber-500/15 text-amber-200 border border-amber-500/40'
                    : 'text-muted-foreground border border-border/40 hover:text-foreground hover:border-border'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="p-4 space-y-4">
        {tab === 'CASH' && (
          <div className="space-y-4" data-testid="wdc-panel-cash" role="tabpanel">
            <DepositPowerBreakdownTable
              summary={executiveProps.depositPowerSummary}
              privacyMode={privacyMode}
            />
            <div>{renderDepositPowerChart()}</div>
          </div>
        )}
        {tab === 'EVENTS' && (
          <div className="space-y-3" data-testid="wdc-panel-events" role="tabpanel">
            <EventsTimeline
              events={events}
              plannedDebt={executiveProps.plannedDebt ?? null}
              privacyMode={privacyMode}
            />
          </div>
        )}
        {tab === 'RISK' && (
          <div className="space-y-3" data-testid="wdc-panel-risk" role="tabpanel">
            <RiskTabBody props={executiveProps} />
            <div className="flex items-center justify-end">
              <Link href="/risk-radar">
                <span className="text-xs text-primary hover:underline">Open full Risk Radar →</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

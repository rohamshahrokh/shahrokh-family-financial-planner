/**
 * DepositPowerCard.tsx — "How much can we put down on the next property?"
 *
 * Displays the per-property usable-equity breakdown:
 *   PPOR usable equity  $X
 *   IP1  usable equity  $Y
 *   IP2  usable equity  $Z
 *   ────────────────────
 *   Total deposit power  $T
 *
 * Plus a Max-LVR slider (default 80%) that updates the global forecast store
 * so all downstream calculations (Best Move, Property Buy vs Wait, FIRE
 * timeline, year-by-year forecast) refresh live.
 *
 * Pure presentational over computeDepositPower() — no Supabase reads here;
 * data is passed in via props or pulled from React Query caches the dashboard
 * already populates.
 */

import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Home, Building2, Wallet, ChevronRight, Info } from 'lucide-react';
import { useForecastStore } from '@/lib/forecastStore';
import { useAppStore } from '@/lib/store';
import { maskValue } from '@/components/PrivacyMask';
import { formatCurrency } from '@/lib/finance';
import { computeDepositPower, type StateCode } from '@/lib/depositPower';

const STATES: StateCode[] = ['QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'NT', 'ACT'];

export default function DepositPowerCard({
  defaultTargetPrice = 750_000,
  state              = 'QLD',
  buffer             = 30_000,
  showSliders        = true,
  compact            = false,
}: {
  defaultTargetPrice?: number;
  state?: StateCode;
  buffer?: number;
  showSliders?: boolean;
  compact?: boolean;
}) {
  const { privacyMode } = useAppStore();
  const maxLvr  = useForecastStore(s => s.maxLvr);
  const setLvr  = useForecastStore(s => s.setMaxLvr);

  const [targetPrice, setTargetPrice]   = useState(defaultTargetPrice);
  const [stateCode, setStateCode]       = useState<StateCode>(state);

  const { data: snap } = useQuery<any>({
    queryKey: ['/api/snapshot'],
    queryFn:  () => apiRequest('GET', '/api/snapshot').then(r => r.json()),
  });
  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ['/api/properties'],
    queryFn:  () => apiRequest('GET', '/api/properties').then(r => r.json()),
  });

  const result = useMemo(() => computeDepositPower({
    cash:            snap?.cash || 0,
    offset:          snap?.offset_balance || 0,
    properties:      properties || [],
    default_max_lvr: maxLvr,
    target_price:    targetPrice,
    state:           stateCode,
    buffer,
  }), [snap, properties, maxLvr, targetPrice, stateCode, buffer]);

  const fmt = (n: number) => maskValue(formatCurrency(n, true), privacyMode);

  // ── Compact mode (used inside other cards / sidebars) ───────────────────────
  if (compact) {
    return (
      <Link href="/property">
        <div className="rounded-xl bg-card border border-border p-3 hover:border-primary/40 transition-all cursor-pointer">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                Total Deposit Power
              </p>
              <p className="text-xl font-extrabold text-amber-400 tabular-nums leading-tight mt-0.5">
                {fmt(result.next_deposit_capacity)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                LVR {result.inputs.default_max_lvr}% \u00b7 vs {fmt(result.inputs.target_price)} target
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </Link>
    );
  }

  // ── Full card ───────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl bg-card border border-border p-4 md:p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-foreground tracking-tight">Next Deposit Power</h3>
            <p className="text-[11px] text-muted-foreground">Cash + offset + usable equity \u2212 stamp duty \u2212 buffer</p>
          </div>
        </div>
        <Link href="/property">
          <span className="text-xs text-primary hover:underline whitespace-nowrap">View Property \u2192</span>
        </Link>
      </div>

      {/* Per-property breakdown */}
      <div className="rounded-xl bg-muted/20 border border-border/50 divide-y divide-border/40">
        {result.rows.length === 0 && (
          <p className="px-3 py-4 text-xs text-muted-foreground text-center">
            No properties on file. Add a property to unlock equity-based deposit power.
          </p>
        )}
        {result.rows.map(r => (
          <div key={r.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {r.type === 'ppor'
                ? <Home className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                : <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{r.name}</p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  Value {fmt(r.current_value)} \u00b7 Loan {fmt(r.current_loan)} \u00b7 LVR {r.lvr_today_pct.toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-amber-400 tabular-nums">{fmt(r.usable_equity)}</p>
              <p className="text-[10px] text-muted-foreground">usable equity</p>
            </div>
          </div>
        ))}
      </div>

      {/* Aggregate breakdown */}
      <div className="rounded-xl border border-border/50 p-3 space-y-1.5 text-xs">
        <Row label="Liquid (cash + offset)"      value={fmt(result.total_liquid)} />
        <Row label={`Less: emergency buffer`}     value={`\u2212 ${fmt(buffer)}`} muted />
        <Row label="Deployable cash"              value={fmt(result.deployable_cash)} bold />
        <Row label="+ Total usable equity"        value={`+ ${fmt(result.total_usable_equity)}`} />
        <Row label={`Less: stamp duty (${result.inputs.state})`} value={`\u2212 ${fmt(result.est_stamp_duty)}`} muted />
        <Row label="Less: other acquisition costs" value={`\u2212 ${fmt(result.est_other_costs)}`} muted />
        <div className="border-t border-border/50 pt-2 mt-1 flex items-center justify-between">
          <span className="text-xs font-bold text-foreground">Total Deposit Power</span>
          <span className="text-xl font-extrabold text-amber-400 tabular-nums">
            {fmt(result.next_deposit_capacity)}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground pt-0.5">
          ~ {result.deposit_pct_of_target.toFixed(1)}% deposit on a {fmt(result.inputs.target_price)} purchase
        </p>
      </div>

      {/* Controls */}
      {showSliders && (
        <div className="space-y-3 pt-1">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Max LVR
              </label>
              <span className="text-xs font-bold text-foreground tabular-nums">{maxLvr.toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={50} max={95} step={1}
              value={maxLvr}
              onChange={e => setLvr(Number(e.target.value))}
              className="w-full accent-amber-500"
              data-testid="slider-max-lvr"
            />
            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
              <Info className="w-3 h-3" />
              80% is the standard cap before LMI. 90\u201395% is achievable but adds Lenders Mortgage Insurance.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Target purchase
              </label>
              <input
                type="number"
                value={targetPrice}
                onChange={e => setTargetPrice(Math.max(0, Number(e.target.value)))}
                step={25_000}
                className="w-full mt-1 bg-background border border-border rounded-md px-2 py-1.5 text-sm tabular-nums"
                data-testid="input-target-price"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                State (stamp duty)
              </label>
              <select
                value={stateCode}
                onChange={e => setStateCode(e.target.value as StateCode)}
                className="w-full mt-1 bg-background border border-border rounded-md px-2 py-1.5 text-sm"
                data-testid="select-state"
              >
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tiny row helper ──────────────────────────────────────────────────────────

function Row({
  label, value, muted, bold,
}: { label: string; value: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${muted ? 'text-muted-foreground' : 'text-foreground/80'}`}>{label}</span>
      <span className={`tabular-nums ${bold ? 'text-sm font-bold text-foreground' : 'text-xs text-foreground/90'}`}>
        {value}
      </span>
    </div>
  );
}

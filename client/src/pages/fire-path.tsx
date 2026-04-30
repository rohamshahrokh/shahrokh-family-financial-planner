/**
 * fire-path.tsx — FIRE Fastest Path Optimizer — Full Page
 *
 * Embedded as a tab inside wealth-strategy.tsx ("FIRE Path" tab)
 * Shows:
 *  1. Best path callout banner
 *  2. Scenario comparison cards (A/B/C/D)
 *  3. Timeline chart: all 4 net-worth trajectories
 *  4. Annual milestone table for selected scenario
 *  5. Recommendation + key moves
 *
 * All data from real snapshot — no hardcoded values.
 */

import { useState, useMemo } from "react";
import { useQuery }     from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import {
  Flame, Zap, Target, TrendingUp, Shield, BarChart3,
  ChevronDown, ChevronUp, CheckCircle, AlertTriangle, Info,
} from "lucide-react";
import {
  computeFirePath, buildFirePathInput,
  type FIREScenario, type FIREPathResult, type FIREScenarioId,
} from "@/lib/firePathEngine";
import { maskValue } from "@/components/PrivacyMask";
import { useAppStore } from "@/lib/store";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const safeNum = (v: unknown): number => { const n = parseFloat(String(v ?? 0)); return isNaN(n) ? 0 : n; };
const fmtM = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toFixed(0)}`;
const fmtK = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${n.toFixed(0)}`;

const SCENARIO_LETTERS: Record<FIREScenarioId, string> = {
  property:   'A',
  etf:        'B',
  mixed:      'C',
  aggressive: 'D',
};

const LINE_COLORS: Record<FIREScenarioId, string> = {
  property:   '#f59e0b',
  etf:        '#22c55e',
  mixed:      '#38bdf8',
  aggressive: '#a855f7',
};

const RISK_BADGE: Record<string, { bg: string; text: string }> = {
  Low:       { bg: 'rgba(34,197,94,0.12)',  text: '#22c55e' },
  Medium:    { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b' },
  High:      { bg: 'rgba(239,68,68,0.12)',  text: '#ef4444' },
  'Very High': { bg: 'rgba(168,85,247,0.12)', text: '#a855f7' },
};

// ─── ScenarioCard ──────────────────────────────────────────────────────────────
function ScenarioCard({
  s,
  isBest,
  isSelected,
  onSelect,
  mv,
}: {
  s:          FIREScenario;
  isBest:     boolean;
  isSelected: boolean;
  onSelect:   () => void;
  mv:         (v: string) => string;
}) {
  const letter = SCENARIO_LETTERS[s.id];
  const color  = LINE_COLORS[s.id];
  const rb     = RISK_BADGE[s.risk_level];
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-2xl border transition-all cursor-pointer overflow-hidden"
      style={{
        background: isSelected ? 'rgba(30,30,50,0.9)' : 'rgba(15,15,25,0.7)',
        borderColor: isSelected ? color + '60' : 'rgba(100,100,120,0.2)',
        boxShadow: isSelected ? `0 0 0 1.5px ${color}40` : 'none',
      }}
      onClick={onSelect}
    >
      {/* Top strip */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0"
            style={{ background: color + '18', color, border: `1.5px solid ${color}35` }}
          >
            {letter}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[13px] font-bold text-slate-100">{s.label}</p>
              {isBest && (
                <span
                  className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(249,115,22,0.18)', color: '#f97316' }}
                >
                  ⚡ FASTEST
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">{s.tagline}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-black" style={{ color }}>{s.fire_year}</p>
          <p className="text-[10px] text-slate-500">{s.years_to_fire}y to FIRE</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-0 border-t border-b border-slate-700/30 divide-x divide-slate-700/30">
        {[
          { label: 'NW at FIRE', value: mv(fmtM(s.net_worth_at_fire)) },
          { label: 'Passive/mo', value: mv(fmtK(s.monthly_passive_at_fire)) },
          { label: 'Invest/yr', value: mv(fmtK(s.annual_invest)) },
        ].map(k => (
          <div key={k.label} className="px-3 py-2 text-center">
            <p className="text-[10px] text-slate-500 mb-0.5">{k.label}</p>
            <p className="text-xs font-semibold text-slate-200">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Risk + vehicle */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={rb}
        >
          {s.risk_level} Risk
        </span>
        <span className="text-[10px] text-slate-500 truncate ml-2 max-w-[55%] text-right">
          {s.primary_vehicle}
        </span>
      </div>

      {/* Expandable detail */}
      <div
        className="border-t border-slate-700/30 px-4 py-2 flex items-center justify-between"
        onClick={e => { e.stopPropagation(); setExpanded(!expanded); }}
      >
        <span className="text-[10px] text-slate-500">Strategy details</span>
        {expanded ? <ChevronUp size={12} className="text-slate-500" /> : <ChevronDown size={12} className="text-slate-500" />}
      </div>
      {expanded && (
        <div className="px-4 pb-4 space-y-3" onClick={e => e.stopPropagation()}>
          <p className="text-[11px] text-slate-400 leading-relaxed">{s.strategy_summary}</p>
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Key Moves</p>
            {s.key_moves.map((m, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle size={11} className="shrink-0 mt-0.5" style={{ color }} />
                <p className="text-[11px] text-slate-300">{m}</p>
              </div>
            ))}
          </div>
          <div
            className="rounded-xl px-3 py-2"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-[10px] text-slate-500">
              <span className="text-slate-400 font-medium">Tax note: </span>{s.tax_note}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Timeline chart ───────────────────────────────────────────────────────────
function TimelineChart({
  result,
  mv,
}: {
  result:    FIREPathResult;
  mv:        (v: string) => string;
}) {
  const currentYear = new Date().getFullYear();

  // Build merged chart data — all scenarios aligned by year
  const allYears = Array.from(new Set(
    result.scenarios.flatMap(s => s.timeline.map(t => t.year))
  )).sort((a, b) => a - b).slice(0, 25); // cap at 25 years

  const chartData = allYears.map(yr => {
    const row: Record<string, number | string> = { year: yr };
    result.scenarios.forEach(s => {
      const t = s.timeline.find(r => r.year === yr);
      if (t) row[s.id] = Math.round(t.investable / 1000);  // in $K
    });
    return row;
  });

  const targetK = Math.round(result.target_capital / 1000);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        className="rounded-xl px-3 py-2.5 text-xs"
        style={{ background: '#1e2030', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        <p className="text-slate-400 font-semibold mb-1.5">{label}</p>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
            <div className="w-2 h-2 rounded-full" style={{ background: p.stroke }} />
            <span className="text-slate-300">{p.name}: </span>
            <span className="font-bold text-slate-100">{mv(`$${p.value}K`)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className="rounded-2xl border border-slate-700/40 p-4"
      style={{ background: 'rgba(15,15,25,0.7)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">Net Worth Trajectory</p>
          <p className="text-[11px] text-slate-500">Investable assets by scenario (excl. PPOR equity)</p>
        </div>
        <div
          className="text-[10px] px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(249,115,22,0.12)', color: '#f97316', border: '1px solid rgba(249,115,22,0.25)' }}
        >
          Target: {mv(fmtM(result.target_capital))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="year"
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 9 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => `$${v}K`}
            width={56}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={targetK}
            stroke="rgba(249,115,22,0.5)"
            strokeDasharray="4 4"
            label={{ value: 'FIRE', fill: '#f97316', fontSize: 9, position: 'right' }}
          />
          <ReferenceLine
            x={currentYear}
            stroke="rgba(255,255,255,0.15)"
            strokeDasharray="2 4"
          />
          {result.scenarios.map(s => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={`${SCENARIO_LETTERS[s.id]}. ${s.label}`}
              stroke={LINE_COLORS[s.id]}
              strokeWidth={s.id === result.best_scenario ? 2.5 : 1.5}
              dot={false}
              strokeOpacity={s.id === result.best_scenario ? 1 : 0.55}
            />
          ))}
          <Legend
            wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
            iconSize={8}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Milestone table ──────────────────────────────────────────────────────────
function MilestoneTable({
  scenario,
  targetCapital,
  mv,
}: {
  scenario:      FIREScenario;
  targetCapital: number;
  mv:            (v: string) => string;
}) {
  // Show every 2 years, cap at 20 rows
  const rows = scenario.timeline.filter((_, i) => i % 2 === 0).slice(0, 14);

  return (
    <div
      className="rounded-2xl border border-slate-700/40 overflow-hidden"
      style={{ background: 'rgba(15,15,25,0.7)' }}
    >
      <div className="px-4 py-3 border-b border-slate-700/30">
        <p className="text-sm font-semibold text-slate-100">
          {SCENARIO_LETTERS[scenario.id]}. {scenario.label} — Annual Milestones
        </p>
        <p className="text-[11px] text-slate-500">Every 2 years · FIRE target {mv(fmtM(targetCapital))}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-slate-700/30">
              {['Year', 'Investable', 'Super', 'Passive/mo', 'Surplus/mo', 'Progress'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-[10px] text-slate-500 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const pct = Math.min(100, Math.round((r.investable / targetCapital) * 100));
              const fireReached = r.investable + r.super_balance >= targetCapital;
              return (
                <tr
                  key={r.year}
                  className="border-b border-slate-700/20 transition-colors hover:bg-white/[0.02]"
                  style={{ background: fireReached ? 'rgba(249,115,22,0.05)' : undefined }}
                >
                  <td className="px-3 py-2.5 font-semibold text-slate-200">
                    {r.year}
                    {fireReached && <span className="ml-1 text-orange-400">🔥</span>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{mv(fmtK(r.investable))}</td>
                  <td className="px-3 py-2.5 text-slate-400">{mv(fmtK(r.super_balance))}</td>
                  <td className="px-3 py-2.5 text-slate-300">{mv(fmtK(r.passive_income))}</td>
                  <td className="px-3 py-2.5 text-slate-400">{mv(fmtK(r.surplus))}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-700/50 overflow-hidden min-w-[40px]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            background: pct >= 100 ? '#f97316' : pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#64748b',
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 shrink-0">{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────
export default function FIREPathPage() {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode, 'currency');

  const { data: snapRaw  } = useQuery({ queryKey: ["/api/snapshot"] });
  const { data: billsRaw } = useQuery({ queryKey: ["/api/bills"] });

  const result: FIREPathResult = useMemo(() => {
    const snap  = (snapRaw  as any)?.[0] ?? snapRaw  ?? {};
    const bills = Array.isArray(billsRaw) ? billsRaw : [];
    const input = buildFirePathInput(snap, bills);
    return computeFirePath(input);
  }, [snapRaw, billsRaw]);

  const [selectedId, setSelectedId] = useState<FIREScenarioId>(result.best_scenario);
  const selectedScenario = result.scenarios.find(s => s.id === selectedId) ?? result.scenarios[0];

  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-5 pb-6">

      {/* ── Banner: best path ─────────────────────────────────────────────── */}
      <div
        className="rounded-2xl px-5 py-4"
        style={{
          background: 'linear-gradient(135deg, rgba(249,115,22,0.12) 0%, rgba(251,146,60,0.06) 100%)',
          border: '1px solid rgba(249,115,22,0.25)',
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center shrink-0">
              <Zap size={18} className="text-orange-400" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-orange-400 uppercase tracking-wider mb-1">Fastest Path to FIRE</p>
              <p className="text-base font-bold text-slate-100">
                Option {SCENARIO_LETTERS[result.best_scenario]} — {result.best_label} → FIRE in {result.best_fire_year}
              </p>
              <p className="text-[12px] text-slate-400 mt-1 leading-relaxed max-w-2xl">{result.recommendation}</p>
            </div>
          </div>
          <div className="text-right shrink-0 hidden sm:block">
            <p className="text-3xl font-black text-orange-400">{result.best_fire_year}</p>
            <p className="text-[11px] text-slate-500">Best scenario</p>
            <p className="text-[11px] text-slate-500">Semi-FIRE: {result.semi_fire_year}</p>
          </div>
        </div>

        {/* Progress row */}
        <div className="mt-4 grid grid-cols-3 gap-4 sm:gap-6">
          {[
            { label: 'FIRE Target Capital', value: mv(fmtM(result.target_capital)) },
            { label: 'Current Progress', value: `${result.current_progress_pct}%` },
            { label: 'Strategy Spread', value: `±${result.fastest_vs_slowest_years}yr` },
          ].map(k => (
            <div key={k.label}>
              <p className="text-[10px] text-slate-500 mb-0.5">{k.label}</p>
              <p className="text-sm font-bold text-slate-200">{k.value}</p>
            </div>
          ))}
        </div>

        {result.data_coverage !== 'full' && (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-amber-400/80">
            <Info size={11} />
            <span>Partial data — add income, expenses and investments in Settings for more accurate projections.</span>
          </div>
        )}
      </div>

      {/* ── Scenario cards ────────────────────────────────────────────────── */}
      <div>
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Scenario Comparison — Click to explore</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {result.scenarios.map(s => (
            <ScenarioCard
              key={s.id}
              s={s}
              isBest={s.id === result.best_scenario}
              isSelected={s.id === selectedId}
              onSelect={() => setSelectedId(s.id)}
              mv={mv}
            />
          ))}
        </div>
      </div>

      {/* ── Timeline chart ────────────────────────────────────────────────── */}
      <TimelineChart result={result} mv={mv} />

      {/* ── Milestone table for selected scenario ────────────────────────── */}
      <MilestoneTable
        scenario={selectedScenario}
        targetCapital={result.target_capital}
        mv={mv}
      />

      {/* ── Key inputs summary ───────────────────────────────────────────── */}
      <div
        className="rounded-2xl border border-slate-700/40 p-4"
        style={{ background: 'rgba(15,15,25,0.7)' }}
      >
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Assumptions Used</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Withdrawal Rate', value: '4.0% (SWR)' },
            { label: 'ETF Return (B/C)', value: '8.5% CAGR' },
            { label: 'Property Growth', value: '5.0% CAGR' },
            { label: 'Aggressive Target', value: '11.0% CAGR' },
            { label: 'Super SGC', value: '11.5% of income' },
            { label: 'Super Return', value: '9.0% CAGR' },
            { label: 'Income Growth', value: '3.0%/year' },
            { label: 'Expense Inflation', value: '3.0%/year' },
          ].map(a => (
            <div key={a.label}>
              <p className="text-[10px] text-slate-500">{a.label}</p>
              <p className="text-[11px] font-semibold text-slate-300">{a.value}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-600 mt-3">
          Projections are estimates based on historical averages. Actual returns will differ. Not financial advice. Consult a licensed Australian financial adviser before making decisions.
        </p>
      </div>
    </div>
  );
}

/**
 * fire-path.tsx — FIRE Fastest Path Optimizer (v2 — fully data-driven)
 *
 * Rendered as a tab inside /wealth-strategy.
 *
 * Sections:
 *   1. Assumptions Panel — collapsible, with Year-by-Year table + presets
 *   2. Best Path Banner
 *   3. KPI row + data transparency badges
 *   4. Sensitivity Analysis
 *   5. Scenario Cards (A/B/C/D) with allocation editor
 *   6. Timeline Chart
 *   7. Milestone Table for selected scenario
 */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import {
  Flame, Zap, Target, TrendingUp, Shield, BarChart3,
  ChevronDown, ChevronUp, CheckCircle, AlertTriangle, Info,
  Settings2, Save, RotateCcw, Lock, Unlock, Eye, EyeOff,
  AlertCircle, ArrowRight,
} from "lucide-react";
import {
  computeFirePath, buildFirePathInput,
  type FIREScenario, type FIREPathResult, type FIREScenarioId,
  type FIRESettings, type FIREYearAssumption, type FIREScenarioConfig,
  type FIRESettingsResolved,
} from "@/lib/firePathEngine";
import { maskValue } from "@/components/PrivacyMask";
import { useAppStore } from "@/lib/store";
import { apiRequest } from "@/lib/queryClient";
import { runCashEngine } from "@/lib/cashEngine";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtM  = (n: number) => n >= 1_000_000 ? `$${(n/1_000_000).toFixed(2)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${Math.round(n).toLocaleString()}`;
const fmtK  = (n: number) => n >= 1_000_000 ? `$${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}K` : `$${Math.round(n)}`;
const pct   = (v: number | null | undefined, dp = 1) => v != null ? `${Number(v).toFixed(dp)}%` : '—';

const SCENARIO_LETTERS: Record<FIREScenarioId, string> = {
  property: 'A', etf: 'B', mixed: 'C', aggressive: 'D',
};
const LINE_COLORS: Record<FIREScenarioId, string> = {
  property: '#f59e0b', etf: '#22c55e', mixed: '#38bdf8', aggressive: '#a855f7',
};
const RISK_BADGE: Record<string, { bg: string; text: string }> = {
  Low:        { bg: 'rgba(34,197,94,0.12)',   text: '#22c55e' },
  Medium:     { bg: 'rgba(245,158,11,0.12)',  text: '#f59e0b' },
  High:       { bg: 'rgba(239,68,68,0.12)',   text: '#ef4444' },
  'Very High':{ bg: 'rgba(168,85,247,0.12)',  text: '#a855f7' },
};

// ─── Preset Scenarios ─────────────────────────────────────────────────────────

type Preset = 'base' | 'optimistic' | 'conservative';

const YEAR_PRESETS: Record<Preset, Omit<FIREYearAssumption, 'assumption_year'>> = {
  base: {
    property_pct: 5.0, stocks_pct: 8.5, crypto_pct: 15.0, super_pct: 8.0,
    cash_pct: 5.0, inflation_pct: 3.0, income_growth_pct: 3.0,
    expense_growth_pct: 3.0, interest_rate_pct: 6.5,
  },
  optimistic: {
    property_pct: 7.0, stocks_pct: 11.0, crypto_pct: 25.0, super_pct: 10.0,
    cash_pct: 5.5, inflation_pct: 2.0, income_growth_pct: 5.0,
    expense_growth_pct: 2.0, interest_rate_pct: 5.5,
  },
  conservative: {
    property_pct: 3.0, stocks_pct: 6.0, crypto_pct: 5.0, super_pct: 6.0,
    cash_pct: 4.0, inflation_pct: 4.0, income_growth_pct: 2.0,
    expense_growth_pct: 4.0, interest_rate_pct: 7.5,
  },
};

const PRESET_LABELS: Record<Preset, { label: string; color: string; description: string }> = {
  base:         { label: 'Base',         color: 'text-blue-400',   description: 'Historical averages — most likely scenario' },
  optimistic:   { label: 'Optimistic',   color: 'text-emerald-400',description: 'Strong growth, lower rates, higher income' },
  conservative: { label: 'Conservative', color: 'text-amber-400',  description: 'Lower returns, higher inflation, rate stress' },
};

const YEAR_COLUMNS = [
  { key: 'property_pct',      label: 'Property',     color: 'text-amber-400' },
  { key: 'stocks_pct',        label: 'Stocks/ETF',   color: 'text-emerald-400' },
  { key: 'crypto_pct',        label: 'Crypto',       color: 'text-purple-400' },
  { key: 'super_pct',         label: 'Super',        color: 'text-blue-400' },
  { key: 'cash_pct',          label: 'Cash/HISA',    color: 'text-cyan-400' },
  { key: 'inflation_pct',     label: 'Inflation',    color: 'text-red-400' },
  { key: 'income_growth_pct', label: 'Income Gr.',   color: 'text-green-400' },
  { key: 'expense_growth_pct',label: 'Expense Gr.',  color: 'text-orange-400' },
  { key: 'interest_rate_pct', label: 'Interest Rate',color: 'text-rose-400' },
] as const;

type YearKey = typeof YEAR_COLUMNS[number]['key'];

const YEARS = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035];

// ─── Assumption source badge ──────────────────────────────────────────────────

function SrcBadge({ src }: { src: 'user' | 'default' }) {
  return src === 'user'
    ? <span className="text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1 py-0.5 ml-1">YOU</span>
    : <span className="text-[9px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1 py-0.5 ml-1">DEFAULT</span>;
}

// ─── Numeric input cell ───────────────────────────────────────────────────────

function NumCell({
  value, onChange, min = 0, max = 100, step = 0.1,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number; max?: number; step?: number;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : '');
  useEffect(() => { setLocal(value != null ? String(value) : ''); }, [value]);
  return (
    <input
      type="number"
      value={local}
      min={min} max={max} step={step}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => {
        const n = parseFloat(local);
        if (isNaN(n)) { onChange(null); }
        else { onChange(Math.min(max, Math.max(min, n))); }
      }}
      className="w-16 bg-secondary/60 border border-border/60 rounded-lg text-[11px] text-center text-foreground px-1 py-1
                 focus:outline-none focus:border-primary/60 tabular-nums"
      placeholder="—"
    />
  );
}

// ─── Settings input row ───────────────────────────────────────────────────────

function SettingRow({
  label, value, onChange, unit = '%', min = 0, max = 100, step = 0.1, srcKey, rawSettings,
}: {
  label: string; value: number | null; onChange: (v: number | null) => void;
  unit?: string; min?: number; max?: number; step?: number;
  srcKey?: keyof FIRESettings; rawSettings?: FIRESettings | null;
}) {
  const [local, setLocal] = useState(value != null ? String(value) : '');
  useEffect(() => { setLocal(value != null ? String(value) : ''); }, [value]);
  const src: 'user' | 'default' = srcKey && rawSettings && rawSettings[srcKey] != null ? 'user' : 'default';
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/30">
      <div className="flex items-center gap-1 min-w-0">
        <span className="text-xs text-muted-foreground truncate">{label}</span>
        <SrcBadge src={src} />
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          value={local}
          min={min} max={max} step={step}
          onChange={e => setLocal(e.target.value)}
          onBlur={() => {
            const n = parseFloat(local);
            if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
          className="w-20 bg-secondary/60 border border-border/60 rounded-lg text-xs text-right text-foreground px-2 py-1.5
                     focus:outline-none focus:border-primary/60 tabular-nums"
        />
        <span className="text-[10px] text-muted-foreground w-5">{unit}</span>
      </div>
    </div>
  );
}

// ─── Toggle row ───────────────────────────────────────────────────────────────

function ToggleRow({
  label, value, onChange, srcKey, rawSettings,
}: {
  label: string; value: boolean; onChange: (v: boolean) => void;
  srcKey?: keyof FIRESettings; rawSettings?: FIRESettings | null;
}) {
  const src: 'user' | 'default' = srcKey && rawSettings && rawSettings[srcKey] != null ? 'user' : 'default';
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border/30">
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <SrcBadge src={src} />
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`w-10 h-5 rounded-full transition-colors relative ${value ? 'bg-primary' : 'bg-secondary/80'}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${value ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

// ─── Year-by-Year Table ───────────────────────────────────────────────────────

function YearByYearTable({
  yearRows, onRowChange, onApplyPreset,
}: {
  yearRows: FIREYearAssumption[];
  onRowChange: (year: number, key: YearKey, value: number | null) => void;
  onApplyPreset: (preset: Preset) => void;
}) {
  const [lockAll, setLockAll] = useState<Record<YearKey, boolean>>(
    Object.fromEntries(YEAR_COLUMNS.map(c => [c.key, false])) as Record<YearKey, boolean>
  );
  const [activePreset, setActivePreset] = useState<Preset | null>(null);

  function handlePreset(p: Preset) {
    setActivePreset(p);
    onApplyPreset(p);
  }

  function handleLockToggle(key: YearKey) {
    const newLock = !lockAll[key];
    setLockAll(prev => ({ ...prev, [key]: newLock }));
    if (newLock) {
      // When locking a column, set all years to the first non-null value
      const first = yearRows.find(r => r[key] != null)?.[key];
      if (first != null) {
        YEARS.forEach(yr => onRowChange(yr, key, first as number));
      }
    }
  }

  function handleCellChange(year: number, key: YearKey, value: number | null) {
    if (lockAll[key] && value != null) {
      // Propagate to all years
      YEARS.forEach(yr => onRowChange(yr, key, value));
    } else {
      onRowChange(year, key, value);
    }
  }

  return (
    <div className="space-y-3">
      {/* Presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Presets:</span>
        {(Object.keys(PRESET_LABELS) as Preset[]).map(p => {
          const cfg = PRESET_LABELS[p];
          return (
            <button
              key={p}
              onClick={() => handlePreset(p)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-all
                ${activePreset === p
                  ? `bg-primary/20 border-primary/50 text-primary`
                  : 'bg-secondary/40 border-border text-muted-foreground hover:text-foreground'}`}
              title={cfg.description}
            >
              {cfg.label}
            </button>
          );
        })}
        <span className="text-[10px] text-muted-foreground ml-2">
          Lock <Lock className="inline w-2.5 h-2.5 mb-0.5" /> = same rate all years
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full text-[11px] min-w-[900px]">
          <thead>
            <tr className="border-b border-border/60 bg-secondary/30">
              <th className="text-left px-3 py-2 text-muted-foreground font-semibold w-14">Year</th>
              {YEAR_COLUMNS.map(col => (
                <th key={col.key} className="px-2 py-2 text-center">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className={`font-semibold ${col.color}`}>{col.label}</span>
                    <button
                      onClick={() => handleLockToggle(col.key)}
                      title={lockAll[col.key] ? 'Unlock — edit per year' : 'Lock — same for all years'}
                      className={`p-0.5 rounded transition-colors ${lockAll[col.key] ? 'text-primary' : 'text-muted-foreground/40 hover:text-muted-foreground'}`}
                    >
                      {lockAll[col.key]
                        ? <Lock className="w-3 h-3" />
                        : <Unlock className="w-3 h-3" />}
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {YEARS.map((yr, idx) => {
              const row = yearRows.find(r => r.assumption_year === yr);
              return (
                <tr key={yr} className={`border-b border-border/30 ${idx % 2 === 0 ? 'bg-secondary/10' : ''} hover:bg-secondary/20 transition-colors`}>
                  <td className="px-3 py-1.5 font-bold text-foreground">{yr}</td>
                  {YEAR_COLUMNS.map(col => (
                    <td key={col.key} className="px-2 py-1 text-center">
                      <NumCell
                        value={(row?.[col.key] as number | null | undefined) ?? null}
                        onChange={v => handleCellChange(yr, col.key, v)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Empty cells use global assumptions above. Lock a column to apply one rate across all 10 years. All values in % p.a.
      </p>
    </div>
  );
}

// ─── Scenario Allocation Editor ───────────────────────────────────────────────

function AllocationEditor({
  cfg, onSave,
}: {
  cfg: FIREScenarioConfig;
  onSave: (updated: FIREScenarioConfig) => void;
}) {
  const [local, setLocal] = useState({ ...cfg });
  const total = local.pct_to_property + local.pct_to_etf + local.pct_to_crypto
    + local.pct_to_super + local.pct_to_offset + local.pct_to_cash;
  const valid = Math.abs(total - 100) < 0.5;

  const field = (key: keyof FIREScenarioConfig, label: string, color: string) => (
    <div key={key} className="flex items-center justify-between gap-2 py-1">
      <span className={`text-[11px] ${color}`}>{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number" min={0} max={100} step={1}
          value={Number(local[key]) || 0}
          onChange={e => setLocal(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
          className="w-14 bg-secondary/60 border border-border/60 rounded text-xs text-right px-1.5 py-1 focus:outline-none focus:border-primary/60"
        />
        <span className="text-[10px] text-muted-foreground">%</span>
      </div>
    </div>
  );

  return (
    <div className="p-3 bg-secondary/20 rounded-xl border border-border/40 space-y-1 mt-2">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Surplus Allocation</div>
      {field('pct_to_etf',      'ETF / Stocks',    'text-emerald-400')}
      {field('pct_to_property', 'Property / IP',   'text-amber-400')}
      {field('pct_to_crypto',   'Crypto',           'text-purple-400')}
      {field('pct_to_super',    'Extra Super',      'text-blue-400')}
      {field('pct_to_offset',   'Mortgage Offset',  'text-cyan-400')}
      {field('pct_to_cash',     'Cash / Buffer',    'text-slate-400')}
      <div className={`flex items-center justify-between pt-2 border-t border-border/40 ${valid ? 'text-emerald-400' : 'text-red-400'}`}>
        <span className="text-[11px] font-bold">Total</span>
        <span className="text-[11px] font-bold">{total.toFixed(0)}% {!valid && '— must be 100%'}</span>
      </div>
      {cfg.scenario_id === 'property' && (
        <div className="pt-2 space-y-1 border-t border-border/40">
          <div className="flex items-center justify-between gap-2 py-0.5">
            <span className="text-[11px] text-amber-400">Planned IPs</span>
            <input type="number" min={0} max={5} value={local.num_planned_ips}
              onChange={e => setLocal(p => ({ ...p, num_planned_ips: parseInt(e.target.value) || 0 }))}
              className="w-14 bg-secondary/60 border border-border/60 rounded text-xs text-right px-1.5 py-1 focus:outline-none" />
          </div>
          <div className="flex items-center justify-between gap-2 py-0.5">
            <span className="text-[11px] text-amber-400">Expected Yield %</span>
            <input type="number" min={0} max={15} step={0.1} value={local.ip_expected_yield}
              onChange={e => setLocal(p => ({ ...p, ip_expected_yield: parseFloat(e.target.value) || 0 }))}
              className="w-14 bg-secondary/60 border border-border/60 rounded text-xs text-right px-1.5 py-1 focus:outline-none" />
          </div>
        </div>
      )}
      {cfg.scenario_id === 'aggressive' && (
        <div className="flex items-center justify-between py-1 border-t border-border/40">
          <span className="text-[11px] text-purple-400">Leverage Allowed</span>
          <button onClick={() => setLocal(p => ({ ...p, leverage_allowed: !p.leverage_allowed }))}
            className={`w-8 h-4 rounded-full transition-colors relative ${local.leverage_allowed ? 'bg-purple-500' : 'bg-secondary/80'}`}>
            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${local.leverage_allowed ? 'left-4' : 'left-0.5'}`} />
          </button>
        </div>
      )}
      {cfg.custom_return_pct != null && (
        <div className="flex items-center justify-between gap-2 py-0.5 border-t border-border/40">
          <span className="text-[11px] text-foreground">Custom Return Override %</span>
          <input type="number" min={0} max={50} step={0.1} value={local.custom_return_pct ?? ''}
            onChange={e => setLocal(p => ({ ...p, custom_return_pct: parseFloat(e.target.value) || null }))}
            className="w-14 bg-secondary/60 border border-border/60 rounded text-xs text-right px-1.5 py-1 focus:outline-none" />
        </div>
      )}
      <button
        disabled={!valid}
        onClick={() => valid && onSave(local)}
        className={`w-full mt-2 py-1.5 rounded-lg text-xs font-semibold transition-all
          ${valid ? 'bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30' : 'bg-secondary/40 border border-border text-muted-foreground cursor-not-allowed'}`}
      >
        <Save className="inline w-3 h-3 mr-1" /> Save Allocation
      </button>
    </div>
  );
}

// ─── Scenario Card ────────────────────────────────────────────────────────────

function ScenarioCard({
  s, isBest, isSelected, onSelect, mv,
  cfg, onSaveCfg,
}: {
  s: FIREScenario;
  isBest: boolean;
  isSelected: boolean;
  onSelect: () => void;
  mv: (v: string) => string;
  cfg: FIREScenarioConfig;
  onSaveCfg: (c: FIREScenarioConfig) => void;
}) {
  const letter = SCENARIO_LETTERS[s.id];
  const color  = LINE_COLORS[s.id];
  const rb     = RISK_BADGE[s.risk_level];
  const [expanded, setExpanded] = useState(false);
  const [editingAlloc, setEditingAlloc] = useState(false);

  const allocationValid = s.allocation_total_pct >= 99 && s.allocation_total_pct <= 101;

  return (
    <div
      onClick={onSelect}
      className="rounded-2xl border transition-all cursor-pointer overflow-hidden"
      style={{
        borderColor: isSelected ? color : undefined,
        boxShadow: isSelected ? `0 0 0 1px ${color}30` : undefined,
        background: isSelected ? `${color}08` : undefined,
      }}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
              style={{ background: `${color}20`, color }}>
              {letter}
            </div>
            <div>
              <div className="text-sm font-bold text-foreground flex items-center gap-1.5">
                {s.label}
                {isBest && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/25">FASTEST</span>
                )}
                {!allocationValid && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/25">ALLOC ≠ 100%</span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground">{s.tagline}</div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-xl font-black" style={{ color }}>{s.fire_year}</div>
            <div className="text-[9px] text-muted-foreground">{s.years_to_fire}yr to FIRE</div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { l: 'NW at FIRE',    v: mv(fmtM(s.net_worth_at_fire)) },
            { l: 'Passive/mo',    v: mv(fmtK(s.monthly_passive_at_fire)) },
            { l: 'Return used',   v: `${s.return_pct_used}%` },
          ].map(({ l, v }) => (
            <div key={l} className="bg-secondary/30 rounded-lg p-2 text-center">
              <div className="text-[9px] text-muted-foreground">{l}</div>
              <div className="text-xs font-bold text-foreground">{v}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="space-y-1 mb-3">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-semibold text-foreground">{s.progress_pct}%</span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${s.progress_pct}%`, background: color }} />
          </div>
        </div>

        {/* Risk + allocation chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full border"
            style={{ background: rb.bg, color: rb.text, borderColor: `${rb.text}30` }}>
            {s.risk_level} Risk
          </span>
          <span className="text-[9px] text-muted-foreground">
            {s.primary_vehicle}
          </span>
        </div>
      </div>

      {/* Expand / edit */}
      <div className="border-t border-border/30">
        <button
          onClick={e => { e.stopPropagation(); setExpanded(o => !o); }}
          className="w-full flex items-center justify-between px-4 py-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>Key moves + allocation</span>
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {expanded && (
          <div className="px-4 pb-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="space-y-1.5">
              {s.key_moves.map((m, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <Zap className="w-3 h-3 mt-0.5 shrink-0" style={{ color }} />
                  <p className="text-[11px] text-foreground">{m}</p>
                </div>
              ))}
            </div>

            {/* Assumption transparency */}
            <div className="bg-secondary/20 rounded-lg p-2.5">
              <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Assumptions used</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {Object.entries(s.assumptions_used).slice(0, 8).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground capitalize">{k.replace(/_/g, ' ')}: </span>
                    <span className="text-[10px] font-semibold text-foreground">{v.value}</span>
                    <SrcBadge src={v.source} />
                  </div>
                ))}
              </div>
            </div>

            {/* Allocation editor */}
            <button
              onClick={() => setEditingAlloc(o => !o)}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline"
            >
              <Settings2 className="w-3 h-3" />
              {editingAlloc ? 'Close' : 'Edit Allocation'}
            </button>
            {editingAlloc && (
              <AllocationEditor cfg={cfg} onSave={c => { onSaveCfg(c); setEditingAlloc(false); }} />
            )}

            <p className="text-[10px] text-muted-foreground italic">{s.tax_note}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Timeline chart ───────────────────────────────────────────────────────────

function TimelineChart({ result, mv }: { result: FIREPathResult; mv: (v: string) => string }) {
  const years = [...new Set(result.scenarios.flatMap(s => s.timeline.map(t => t.year)))].sort();
  const data = years.map(yr => {
    const row: Record<string, number> = { year: yr };
    result.scenarios.forEach(s => {
      const t = s.timeline.find(t => t.year === yr);
      if (t) row[s.id] = t.net_worth;
    });
    row.target = result.target_capital;
    return row;
  });

  const fmt = (v: number) => v >= 1_000_000 ? `$${(v/1_000_000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}K`;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Net Worth Trajectories — All 4 Scenarios
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.4} />
          <XAxis dataKey="year" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
          <YAxis tickFormatter={fmt} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} width={58} />
          <Tooltip
            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
            formatter={(v: number, name: string) => [mv(fmt(v)), name === 'target' ? 'FIRE Target' : name]}
          />
          <Legend formatter={(v) => v === 'target' ? 'FIRE Target' : v} />
          {result.scenarios.map(s => (
            <Line
              key={s.id} type="monotone" dataKey={s.id}
              stroke={LINE_COLORS[s.id]}
              strokeWidth={s.id === result.best_scenario ? 2.5 : 1.5}
              dot={false} name={s.label}
              strokeOpacity={s.id === result.best_scenario ? 1 : 0.55}
            />
          ))}
          <Line key="target" type="monotone" dataKey="target"
            stroke="#64748b" strokeDasharray="6 3" strokeWidth={1.5} dot={false} name="target" />
          <ReferenceLine x={result.best_fire_year} stroke={LINE_COLORS[result.best_scenario]}
            strokeDasharray="4 2" label={{ value: `FIRE ${result.best_fire_year}`, fill: LINE_COLORS[result.best_scenario], fontSize: 10 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Milestone Table ──────────────────────────────────────────────────────────

function MilestoneTable({
  scenario, targetCapital, mv,
}: {
  scenario: FIREScenario;
  targetCapital: number;
  mv: (v: string) => string;
}) {
  const rows = scenario.timeline.filter((_, i) => i % 2 === 0);
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {scenario.label} — 2-Year Milestones
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-border/60">
              {['Year', 'Investable', 'Super', 'Net Worth', 'Passive/mo', 'Surplus', 'Progress'].map(h => (
                <th key={h} className="text-left px-2 py-1.5 text-muted-foreground font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const prog = Math.min(100, Math.round((r.investable + r.super_balance) / targetCapital * 100));
              return (
                <tr key={r.year} className={`border-b border-border/20 ${r.fire_reached ? 'bg-emerald-500/8' : ''}`}>
                  <td className="px-2 py-1.5 font-bold text-foreground">
                    {r.year} {r.fire_reached && <span className="text-emerald-400 text-[9px]">✓ FIRE</span>}
                  </td>
                  <td className="px-2 py-1.5 text-foreground">{mv(fmtK(r.investable))}</td>
                  <td className="px-2 py-1.5 text-blue-400">{mv(fmtK(r.super_balance))}</td>
                  <td className="px-2 py-1.5 text-foreground">{mv(fmtM(r.net_worth))}</td>
                  <td className="px-2 py-1.5 text-emerald-400">{mv(fmtK(r.passive_income))}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{mv(fmtK(r.surplus))}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden w-14">
                        <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${prog}%` }} />
                      </div>
                      <span className="text-muted-foreground tabular-nums">{prog}%</span>
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

// ─── Sensitivity Panel ────────────────────────────────────────────────────────

function SensitivityPanel({ result, mv }: { result: FIREPathResult; mv: (v: string) => string }) {
  const base = result.best_fire_year;
  const items = [
    { label: 'Returns drop 2%',          key: 'returns_minus_2pct',  icon: TrendingUp, color: 'text-orange-400' },
    { label: 'Expenses rise 10%',        key: 'expenses_plus_10pct', icon: AlertTriangle, color: 'text-red-400' },
    { label: 'Surplus falls 20%',        key: 'surplus_minus_20pct', icon: AlertCircle,   color: 'text-amber-400' },
    { label: 'Property growth flat',     key: 'property_flat',       icon: Shield,        color: 'text-amber-400' },
  ] as const;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Sensitivity Analysis — Best Scenario (Option {SCENARIO_LETTERS[result.best_scenario]})
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map(({ label, key, icon: Icon, color }) => {
          const s = result.sensitivity[key];
          const delta = s.delta;
          return (
            <div key={key} className="bg-secondary/30 rounded-xl p-3 border border-border/40">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={`w-3.5 h-3.5 ${color}`} />
                <span className="text-[11px] font-semibold text-foreground">{label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black text-foreground">{s.fire_year}</span>
                <span className={`text-sm font-bold ${delta > 0 ? 'text-red-400' : delta < 0 ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                  {delta > 0 ? `+${delta}yr` : delta < 0 ? `${delta}yr` : '—'}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground">vs base {base}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Assumptions Panel ────────────────────────────────────────────────────────

function AssumptionsPanel({
  settings, rawSettings, yearRows, scenarioConfigs,
  onSettingsChange, onYearRowChange, onApplyPreset, onSaveCfg, onSave, saving,
}: {
  settings: FIRESettingsResolved;
  rawSettings: FIRESettings | null;
  yearRows: FIREYearAssumption[];
  scenarioConfigs: FIREScenarioConfig[];
  onSettingsChange: (key: keyof FIRESettings, value: any) => void;
  onYearRowChange: (year: number, key: YearKey, value: number | null) => void;
  onApplyPreset: (preset: Preset) => void;
  onSaveCfg: (c: FIREScenarioConfig) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [section, setSection] = useState<'profile' | 'income' | 'investment' | 'super' | 'scenarios' | 'yearly'>('profile');

  const tabs = [
    { id: 'profile',    label: 'Profile & Target' },
    { id: 'income',     label: 'Income & Costs' },
    { id: 'investment', label: 'Investment Returns' },
    { id: 'super',      label: 'Superannuation' },
    { id: 'scenarios',  label: 'Scenario Alloc.' },
    { id: 'yearly',     label: 'Year-by-Year' },
  ] as const;

  const s = settings;
  const rs = rawSettings;
  const set = onSettingsChange;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Tab bar */}
      <div className="flex overflow-x-auto border-b border-border/60 bg-secondary/20">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSection(t.id as typeof section)}
            className={`px-4 py-2.5 text-[11px] font-semibold whitespace-nowrap transition-colors border-b-2 ${
              section === t.id
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-1">

        {section === 'profile' && (
          <div className="space-y-0">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Personal</div>
            <SettingRow label="Roham's current age"        value={s.roham_age || null}         onChange={v => set('roham_age', v)}         unit="yrs" min={18} max={80} step={1} srcKey="roham_age" rawSettings={rs} />
            <SettingRow label="Fara's current age"         value={s.fara_age || null}          onChange={v => set('fara_age', v)}          unit="yrs" min={18} max={80} step={1} srcKey="fara_age" rawSettings={rs} />
            <SettingRow label="Desired FIRE age (Roham)"   value={s.desired_fire_age || null}  onChange={v => set('desired_fire_age', v)}  unit="yrs" min={30} max={80} step={1} srcKey="desired_fire_age" rawSettings={rs} />
            <SettingRow label="Desired FIRE age (Fara)"    value={s.desired_partner_fire_age || null} onChange={v => set('desired_partner_fire_age', v)} unit="yrs" min={30} max={80} step={1} srcKey="desired_partner_fire_age" rawSettings={rs} />
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-2">FIRE Target</div>
            <SettingRow label="Desired monthly passive income" value={s.desired_monthly_passive} onChange={v => set('desired_monthly_passive', v)} unit="$/mo" min={0} max={200000} step={100} srcKey="desired_monthly_passive" rawSettings={rs} />
            <SettingRow label="Safe withdrawal rate"       value={s.safe_withdrawal_rate}      onChange={v => set('safe_withdrawal_rate', v)} unit="%" min={2} max={8} step={0.1} srcKey="safe_withdrawal_rate" rawSettings={rs} />
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-2">Include in accessible FIRE capital</div>
            <ToggleRow label="Include super in FIRE"        value={s.include_super_in_fire}    onChange={v => set('include_super_in_fire', v)}  srcKey="include_super_in_fire" rawSettings={rs} />
            <ToggleRow label="Include PPOR equity"          value={s.include_ppor_equity}      onChange={v => set('include_ppor_equity', v)}    srcKey="include_ppor_equity" rawSettings={rs} />
            <ToggleRow label="Include IP equity"            value={s.include_ip_equity}        onChange={v => set('include_ip_equity', v)}      srcKey="include_ip_equity" rawSettings={rs} />
            <ToggleRow label="Include crypto"               value={s.include_crypto}           onChange={v => set('include_crypto', v)}         srcKey="include_crypto" rawSettings={rs} />
            <ToggleRow label="Include stocks"               value={s.include_stocks}           onChange={v => set('include_stocks', v)}         srcKey="include_stocks" rawSettings={rs} />
            <ToggleRow label="Has dependants"               value={s.has_dependants}           onChange={v => set('has_dependants', v)}         srcKey="has_dependants" rawSettings={rs} />
          </div>
        )}

        {section === 'income' && (
          <div className="space-y-0">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Income Mode</div>
            <ToggleRow label="Use manual income values"     value={s.use_manual_income}        onChange={v => set('use_manual_income', v)}      srcKey="use_manual_income" rawSettings={rs} />
            {s.use_manual_income && (
              <>
                <SettingRow label="Manual monthly income"  value={s.manual_monthly_income}    onChange={v => set('manual_monthly_income', v)}  unit="$/mo" min={0} max={500000} step={100} srcKey="manual_monthly_income" rawSettings={rs} />
                <SettingRow label="Manual monthly expenses" value={s.manual_monthly_expenses} onChange={v => set('manual_monthly_expenses', v)} unit="$/mo" min={0} max={200000} step={100} srcKey="manual_monthly_expenses" rawSettings={rs} />
              </>
            )}
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-2">Fara's Income</div>
            <SettingRow label="Fara monthly net income"     value={s.fara_monthly_income || null} onChange={v => set('fara_monthly_income', v)} unit="$/mo" min={0} max={100000} step={100} srcKey="fara_monthly_income" rawSettings={rs} />
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-2">Growth Rates (global)</div>
            <SettingRow label="Income growth rate"          value={s.income_growth_pct}        onChange={v => set('income_growth_pct', v)}      unit="%" min={0} max={20} step={0.5} srcKey="income_growth_pct" rawSettings={rs} />
            <SettingRow label="Expense inflation rate"      value={s.expense_inflation_pct}    onChange={v => set('expense_inflation_pct', v)}  unit="%" min={0} max={20} step={0.5} srcKey="expense_inflation_pct" rawSettings={rs} />
            <SettingRow label="General inflation"           value={s.general_inflation_pct}    onChange={v => set('general_inflation_pct', v)}  unit="%" min={0} max={15} step={0.1} srcKey="general_inflation_pct" rawSettings={rs} />
            <SettingRow label="Tax rate estimate"           value={s.tax_rate_estimate_pct}    onChange={v => set('tax_rate_estimate_pct', v)}  unit="%" min={0} max={55} step={0.5} srcKey="tax_rate_estimate_pct" rawSettings={rs} />
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-2">Mortgage</div>
            <SettingRow label="Mortgage interest rate"      value={s.mortgage_rate}            onChange={v => set('mortgage_rate', v)}          unit="%" min={0} max={20} step={0.05} srcKey="mortgage_rate" rawSettings={rs} />
            <SettingRow label="Remaining loan term"         value={s.mortgage_term_remaining}  onChange={v => set('mortgage_term_remaining', v)} unit="yrs" min={0} max={30} step={1} srcKey="mortgage_term_remaining" rawSettings={rs} />
          </div>
        )}

        {section === 'investment' && (
          <div className="space-y-0">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Global Return Assumptions</div>
            <SettingRow label="ETF / index fund return"    value={s.etf_return_pct}           onChange={v => set('etf_return_pct', v)}         unit="%" min={0} max={30} step={0.5} srcKey="etf_return_pct" rawSettings={rs} />
            <SettingRow label="Stock return"               value={s.stock_return_pct}         onChange={v => set('stock_return_pct', v)}        unit="%" min={0} max={30} step={0.5} srcKey="stock_return_pct" rawSettings={rs} />
            <SettingRow label="Crypto return"              value={s.crypto_return_pct}        onChange={v => set('crypto_return_pct', v)}       unit="%" min={0} max={100} step={1}  srcKey="crypto_return_pct" rawSettings={rs} />
            <SettingRow label="Cash / HISA return"         value={s.cash_hisa_return_pct}     onChange={v => set('cash_hisa_return_pct', v)}    unit="%" min={0} max={15} step={0.1} srcKey="cash_hisa_return_pct" rawSettings={rs} />
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-2">Property</div>
            <SettingRow label="Property capital growth"    value={s.property_cagr}            onChange={v => set('property_cagr', v)}          unit="%" min={0} max={20} step={0.5} srcKey="property_cagr" rawSettings={rs} />
            <SettingRow label="Rent growth"                value={s.rent_growth_pct}          onChange={v => set('rent_growth_pct', v)}         unit="%" min={0} max={15} step={0.5} srcKey="rent_growth_pct" rawSettings={rs} />
            <SettingRow label="Vacancy"                    value={s.vacancy_pct}              onChange={v => set('vacancy_pct', v)}             unit="%" min={0} max={20} step={0.5} srcKey="vacancy_pct" rawSettings={rs} />
            <SettingRow label="Holding costs"              value={s.property_holding_cost_pct} onChange={v => set('property_holding_cost_pct', v)} unit="%" min={0} max={10} step={0.1} srcKey="property_holding_cost_pct" rawSettings={rs} />
          </div>
        )}

        {section === 'super' && (
          <div className="space-y-0">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Roham — Super</div>
            <SettingRow label="SGC employer contribution" value={s.roham_sgc_pct}             onChange={v => set('roham_sgc_pct', v)}          unit="%" min={0} max={30} step={0.5} srcKey="roham_sgc_pct" rawSettings={rs} />
            <SettingRow label="Super investment return"   value={s.roham_super_return_pct}    onChange={v => set('roham_super_return_pct', v)} unit="%" min={0} max={20} step={0.5} srcKey="roham_super_return_pct" rawSettings={rs} />
            <SettingRow label="Salary sacrifice (extra)"  value={s.roham_salary_sacrifice_mo} onChange={v => set('roham_salary_sacrifice_mo', v)} unit="$/mo" min={0} max={20000} step={50} srcKey="roham_salary_sacrifice_mo" rawSettings={rs} />
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-3 mb-2">Fara — Super</div>
            <SettingRow label="SGC employer contribution" value={s.fara_sgc_pct}              onChange={v => set('fara_sgc_pct', v)}           unit="%" min={0} max={30} step={0.5} srcKey="fara_sgc_pct" rawSettings={rs} />
            <SettingRow label="Super investment return"   value={s.fara_super_return_pct}     onChange={v => set('fara_super_return_pct', v)}  unit="%" min={0} max={20} step={0.5} srcKey="fara_super_return_pct" rawSettings={rs} />
            <SettingRow label="Salary sacrifice (extra)"  value={s.fara_salary_sacrifice_mo}  onChange={v => set('fara_salary_sacrifice_mo', v)} unit="$/mo" min={0} max={20000} step={50} srcKey="fara_salary_sacrifice_mo" rawSettings={rs} />
            <div className="mt-3 p-3 bg-blue-500/8 border border-blue-500/20 rounded-xl">
              <div className="flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-300 leading-relaxed">
                  Super is <strong>not counted as accessible cash</strong> until preservation age (60). It appears separately in the net worth calculation. Enable <em>Include super in FIRE</em> on the Profile tab to count it toward FIRE capital.
                </p>
              </div>
            </div>
          </div>
        )}

        {section === 'scenarios' && (
          <div className="space-y-3">
            {scenarioConfigs.map(cfg => (
              <div key={cfg.scenario_id} className="bg-secondary/20 rounded-xl border border-border/40 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
                  <div className="w-5 h-5 rounded text-[10px] font-black flex items-center justify-center"
                    style={{ background: `${LINE_COLORS[cfg.scenario_id]}20`, color: LINE_COLORS[cfg.scenario_id] }}>
                    {SCENARIO_LETTERS[cfg.scenario_id]}
                  </div>
                  <span className="text-xs font-semibold text-foreground">
                    {cfg.scenario_id === 'property' ? 'Property Focused' : cfg.scenario_id === 'etf' ? 'ETF / Stock Focused' : cfg.scenario_id === 'mixed' ? 'Mixed Strategy' : 'Aggressive Growth'}
                  </span>
                </div>
                <div className="p-3">
                  <AllocationEditor cfg={cfg} onSave={onSaveCfg} />
                </div>
              </div>
            ))}
          </div>
        )}

        {section === 'yearly' && (
          <YearByYearTable
            yearRows={yearRows}
            onRowChange={onYearRowChange}
            onApplyPreset={onApplyPreset}
          />
        )}
      </div>

      {/* Save bar */}
      <div className="px-4 py-3 border-t border-border/60 bg-secondary/10 flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          <span className="text-emerald-400 font-semibold">YOU</span> = your value &nbsp;
          <span className="text-amber-400 font-semibold">DEFAULT</span> = assumption (edit to remove)
        </p>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary text-xs font-semibold rounded-xl transition-all disabled:opacity-50"
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? 'Saving…' : 'Save All to Supabase'}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FIREPathPage() {
  const privacyMode = useAppStore(s => s.privacyMode);
  const mv = (v: string) => maskValue(v, privacyMode);
  const qc = useQueryClient();

  const { data: snapRaw }          = useQuery({ queryKey: ['/api/snapshot'] });
  const { data: billsRaw }         = useQuery({ queryKey: ['/api/bills'] });
  const { data: settingsRaw }      = useQuery({ queryKey: ['/api/fire-settings'] });
  const { data: scenarioCfgRaw }   = useQuery({ queryKey: ['/api/fire-scenario-config'] });
  const { data: yearAssumpRaw }    = useQuery({ queryKey: ['/api/fire-year-assumptions'] });
  // ─── cashEngine seed queries ─────────────────────────────────────────────
  const { data: propertiesRaw }    = useQuery<any[]>({ queryKey: ['/api/properties'],    queryFn: () => apiRequest('GET', '/api/properties').then(r => r.json()) });
  const { data: stocksRaw }        = useQuery<any[]>({ queryKey: ['/api/stocks'],         queryFn: () => apiRequest('GET', '/api/stocks').then(r => r.json()) });
  const { data: cryptosRaw }       = useQuery<any[]>({ queryKey: ['/api/crypto'],         queryFn: () => apiRequest('GET', '/api/crypto').then(r => r.json()) });
  const { data: expensesRaw }      = useQuery<any[]>({ queryKey: ['/api/expenses'],       queryFn: () => apiRequest('GET', '/api/expenses').then(r => r.json()) });
  const { data: stockDCARaw }      = useQuery<any[]>({ queryKey: ['/api/stock-dca'],      queryFn: () => apiRequest('GET', '/api/stock-dca').then(r => r.json()) });
  const { data: cryptoDCARaw }     = useQuery<any[]>({ queryKey: ['/api/crypto-dca'],     queryFn: () => apiRequest('GET', '/api/crypto-dca').then(r => r.json()) });
  const { data: plannedStockRaw }  = useQuery<any[]>({ queryKey: ['/api/planned-investments', 'stock'],  queryFn: () => apiRequest('GET', '/api/planned-investments?module=stock').then(r => r.json()) });
  const { data: plannedCryptoRaw } = useQuery<any[]>({ queryKey: ['/api/planned-investments', 'crypto'], queryFn: () => apiRequest('GET', '/api/planned-investments?module=crypto').then(r => r.json()) });

  // ── Local state for the assumptions panel ──────────────────────────────────
  const [localSettings, setLocalSettings]     = useState<FIRESettings | null>(null);
  const [localScenarios, setLocalScenarios]   = useState<FIREScenarioConfig[] | null>(null);
  const [localYearRows, setLocalYearRows]     = useState<FIREYearAssumption[] | null>(null);
  const [assumpOpen, setAssumpOpen]           = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [saveToast, setSaveToast]             = useState(false);

  // Sync remote → local on first load
  useEffect(() => {
    if (settingsRaw && !localSettings) setLocalSettings(settingsRaw as FIRESettings);
  }, [settingsRaw]);
  useEffect(() => {
    if (scenarioCfgRaw && !localScenarios) setLocalScenarios(scenarioCfgRaw as FIREScenarioConfig[]);
  }, [scenarioCfgRaw]);
  useEffect(() => {
    if (yearAssumpRaw && !localYearRows) setLocalYearRows(yearAssumpRaw as FIREYearAssumption[]);
  }, [yearAssumpRaw]);

  // ── Build result from live data + local overrides ─────────────────────────
  // ── cashEngine base-case series (seeds opening cash for FIRE engine) ──────
  const cashEngineOut = useMemo(() => {
    const snap = (snapRaw as any)?.[0] ?? (snapRaw as any) ?? {};
    if (!snap?.monthly_income) return null;
    return runCashEngine({
      snapshot: snap,
      properties: Array.isArray(propertiesRaw) ? propertiesRaw : [],
      stocks:     Array.isArray(stocksRaw)     ? stocksRaw     : [],
      cryptos:    Array.isArray(cryptosRaw)    ? cryptosRaw    : [],
      expenses:   Array.isArray(expensesRaw)   ? expensesRaw   : [],
      bills:      Array.isArray(billsRaw)      ? billsRaw      : [],
      stockDCASchedules:    Array.isArray(stockDCARaw)     ? stockDCARaw     : [],
      cryptoDCASchedules:   Array.isArray(cryptoDCARaw)    ? cryptoDCARaw    : [],
      plannedStockOrders:   Array.isArray(plannedStockRaw) ? plannedStockRaw : [],
      plannedCryptoOrders:  Array.isArray(plannedCryptoRaw)? plannedCryptoRaw: [],
    });
  }, [snapRaw, propertiesRaw, stocksRaw, cryptosRaw, expensesRaw, billsRaw, stockDCARaw, cryptoDCARaw, plannedStockRaw, plannedCryptoRaw]);

  const result: FIREPathResult = useMemo(() => {
    const snap   = (snapRaw as any)?.[0] ?? (snapRaw as any) ?? {};
    const bills  = Array.isArray(billsRaw) ? billsRaw : [];
    // Seed opening cash from cashEngine year-1 closing cash if available
    const seedSnap = cashEngineOut ? {
      ...snap,
      // cashEngine year-1 gives us the actual projected closing cash
      cash: cashEngineOut.cashByYear.get(new Date().getFullYear()) ?? snap.cash,
    } : snap;
    const input  = buildFirePathInput(
      seedSnap,
      bills,
      localSettings ?? (settingsRaw as FIRESettings | null),
      localScenarios ?? (Array.isArray(scenarioCfgRaw) ? scenarioCfgRaw : []),
      localYearRows  ?? (Array.isArray(yearAssumpRaw)  ? yearAssumpRaw  : []),
    );
    return computeFirePath(input, localSettings ?? (settingsRaw as FIRESettings | null));
  }, [snapRaw, billsRaw, localSettings, localScenarios, localYearRows, settingsRaw, scenarioCfgRaw, yearAssumpRaw, cashEngineOut]);

  const [selectedId, setSelectedId] = useState<FIREScenarioId>(result.best_scenario);
  const selectedScenario = result.scenarios.find(s => s.id === selectedId) ?? result.scenarios[0];

  // ── Settings change handler ────────────────────────────────────────────────
  function handleSettingsChange(key: keyof FIRESettings, value: any) {
    setLocalSettings(prev => ({ ...(prev ?? {}), [key]: value }));
  }

  function handleYearRowChange(year: number, key: YearKey, value: number | null) {
    setLocalYearRows(prev => {
      const rows = prev ? [...prev] : YEARS.map(yr => ({
        assumption_year: yr, property_pct: null, stocks_pct: null,
        crypto_pct: null, super_pct: null, cash_pct: null,
        inflation_pct: null, income_growth_pct: null,
        expense_growth_pct: null, interest_rate_pct: null,
      }));
      return rows.map(r => r.assumption_year === year ? { ...r, [key]: value } : r);
    });
  }

  function handleApplyPreset(preset: Preset) {
    const presetData = YEAR_PRESETS[preset];
    setLocalYearRows(YEARS.map(yr => ({ assumption_year: yr, ...presetData })));
  }

  function handleSaveCfg(cfg: FIREScenarioConfig) {
    setLocalScenarios(prev => {
      const existing = prev ?? [];
      const idx = existing.findIndex(c => c.scenario_id === cfg.scenario_id);
      if (idx >= 0) { const n = [...existing]; n[idx] = cfg; return n; }
      return [...existing, cfg];
    });
  }

  async function handleSaveAll() {
    setSaving(true);
    try {
      if (localSettings) {
        await apiRequest('PUT', '/api/fire-settings', localSettings);
      }
      if (localScenarios && localScenarios.length > 0) {
        await apiRequest('PUT', '/api/fire-scenario-config', localScenarios);
      }
      if (localYearRows && localYearRows.length > 0) {
        await apiRequest('PUT', '/api/fire-year-assumptions', localYearRows);
      }
      qc.invalidateQueries({ queryKey: ['/api/fire-settings'] });
      qc.invalidateQueries({ queryKey: ['/api/fire-scenario-config'] });
      qc.invalidateQueries({ queryKey: ['/api/fire-year-assumptions'] });
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 3000);
    } catch (e) {
      console.error('FIRE settings save error', e);
    } finally {
      setSaving(false);
    }
  }

  const resolvedSettings = result.scenarios[0]?.assumptions_used
    ? (() => {
        const snap   = (snapRaw as any)?.[0] ?? (snapRaw as any) ?? {};
        const bills  = Array.isArray(billsRaw) ? billsRaw : [];
        const input  = buildFirePathInput(snap, bills,
          localSettings ?? (settingsRaw as FIRESettings | null),
          localScenarios ?? (Array.isArray(scenarioCfgRaw) ? scenarioCfgRaw : []),
          localYearRows  ?? (Array.isArray(yearAssumpRaw)  ? yearAssumpRaw  : []),
        );
        return input.settings;
      })()
    : null;

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Save toast ──────────────────────────────────────────────────────── */}
      {saveToast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> Saved Successfully
        </div>
      )}

      {/* ── Missing fields warning ───────────────────────────────────────────── */}
      {result.missing_fields.length > 0 && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl border bg-amber-500/10 border-amber-500/25">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wide mb-0.5">
              {result.data_coverage === 'needs_setup' ? 'Needs Setup' : 'Using Default Values'}
            </div>
            <p className="text-xs text-amber-300 leading-relaxed">
              {result.missing_fields.join(' · ')}
            </p>
            <button onClick={() => setAssumpOpen(true)}
              className="mt-1.5 text-[11px] text-amber-400 underline">
              Open Assumptions to fix →
            </button>
          </div>
        </div>
      )}

      {/* ── Best path banner ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-orange-500/10 via-primary/5 to-transparent border border-orange-500/20 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Flame className="w-5 h-5 text-orange-400" />
              <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">Fastest FIRE Path</span>
            </div>
            <div className="text-lg font-black text-foreground">
              Option {SCENARIO_LETTERS[result.best_scenario]} — {result.best_label} → FIRE in {result.best_fire_year}
            </div>
            <p className="text-[12px] text-slate-400 mt-1 leading-relaxed max-w-2xl">{result.recommendation}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-3xl font-black text-orange-400">{result.best_fire_year}</p>
            <p className="text-[11px] text-slate-500">Semi-FIRE: {result.semi_fire_year}</p>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
          {[
            { label: 'FIRE Target Capital',   value: mv(fmtM(result.target_capital)),        sub: `${pct(resolvedSettings?.safe_withdrawal_rate)} SWR` },
            { label: 'Current Progress',       value: `${result.current_progress_pct}%`,      sub: `Gap: ${mv(fmtM(result.fire_gap))}` },
            { label: 'Investable Now',         value: mv(fmtM(result.investable_now)),         sub: 'excl. super + property' },
            { label: 'Super (locked)',         value: mv(fmtM(result.super_now)),              sub: 'accessible at 60' },
            { label: 'Strategy Spread',        value: `±${result.fastest_vs_slowest_years}yr`, sub: 'fastest vs slowest' },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-black/20 rounded-xl p-3">
              <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
              <div className="text-base font-black text-foreground">{value}</div>
              <div className="text-[10px] text-muted-foreground">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FIRE target formula transparency ─────────────────────────────────── */}
      <div className="flex items-start gap-2 p-3.5 bg-secondary/20 border border-border/40 rounded-xl">
        <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="text-[11px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Target formula:</strong> Desired monthly passive ÷ SWR × 12
          = {mv(fmtK(result.target_passive_income))}/mo ÷ {pct(resolvedSettings?.safe_withdrawal_rate)} × 12
          = <strong className="text-foreground">{mv(fmtM(result.target_capital))}</strong>
          &nbsp;·&nbsp;
          <strong className="text-foreground">Accessible capital:</strong> investable {mv(fmtM(result.investable_now))}
          {resolvedSettings?.include_super_in_fire && ` + super ${mv(fmtM(result.super_now))}`}
          = progress {result.current_progress_pct}%
        </div>
      </div>

      {/* ── Assumptions toggle ───────────────────────────────────────────────── */}
      <button
        onClick={() => setAssumpOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-card border border-border rounded-2xl text-sm font-semibold text-foreground hover:bg-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary" />
          <span>FIRE Assumptions & Settings</span>
          {result.missing_fields.length > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
              {result.missing_fields.length} defaults in use
            </span>
          )}
        </div>
        {assumpOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {assumpOpen && resolvedSettings && (
        <AssumptionsPanel
          settings={resolvedSettings}
          rawSettings={localSettings ?? (settingsRaw as FIRESettings | null)}
          yearRows={localYearRows ?? (Array.isArray(yearAssumpRaw) ? yearAssumpRaw as FIREYearAssumption[] : [])}
          scenarioConfigs={localScenarios ?? (Array.isArray(scenarioCfgRaw) ? resolvedSettings && [] : [])}
          onSettingsChange={handleSettingsChange}
          onYearRowChange={handleYearRowChange}
          onApplyPreset={handleApplyPreset}
          onSaveCfg={handleSaveCfg}
          onSave={handleSaveAll}
          saving={saving}
        />
      )}

      {/* ── Sensitivity ──────────────────────────────────────────────────────── */}
      <SensitivityPanel result={result} mv={mv} />

      {/* ── Scenario cards ───────────────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Scenario Comparison</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {result.scenarios.map(s => (
            <ScenarioCard
              key={s.id}
              s={s}
              isBest={s.id === result.best_scenario}
              isSelected={s.id === selectedId}
              onSelect={() => setSelectedId(s.id)}
              mv={mv}
              cfg={(localScenarios ?? (Array.isArray(scenarioCfgRaw) ? scenarioCfgRaw as FIREScenarioConfig[] : [])).find(c => c.scenario_id === s.id) ?? { scenario_id: s.id, pct_to_property: 0, pct_to_etf: 80, pct_to_crypto: 0, pct_to_super: 0, pct_to_offset: 0, pct_to_cash: 20, custom_return_pct: null, leverage_allowed: false, num_planned_ips: 0, ip_target_year: null, ip_deposit_pct: 20, ip_expected_yield: 4.0 }}
              onSaveCfg={handleSaveCfg}
            />
          ))}
        </div>
      </div>

      {/* ── Timeline chart ───────────────────────────────────────────────────── */}
      <TimelineChart result={result} mv={mv} />

      {/* ── Milestone table ──────────────────────────────────────────────────── */}
      <MilestoneTable
        scenario={selectedScenario}
        targetCapital={result.target_capital}
        mv={mv}
      />

      {/* ── Disclaimer ───────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 p-4 bg-secondary/30 border border-border rounded-xl">
        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">General information only.</strong> FIRE projections use compound growth models with the assumptions you set above. Returns shown are <em>not guaranteed</em>. Tax treatment, investment outcomes, and personal circumstances vary. Consult a licensed financial planner before making major decisions.
        </p>
      </div>

    </div>
  );
}

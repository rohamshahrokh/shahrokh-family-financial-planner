/**
 * property-buy-analysis.tsx — Property Buy vs Wait Analysis Page
 *
 * Full scenario comparison tool with:
 *   - Inputs panel (purchase price, deposit, rates, rent, costs, tax)
 *   - Three scenario tabs: Buy Now / Wait 6m / Wait 12m (or Alternative)
 *   - Comparison table
 *   - Equity growth chart
 *   - Cashflow chart
 *   - Decision summary with confidence score
 *   - Privacy mask
 */

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { formatCurrency, safeNum } from '@/lib/finance';
import { maskValue } from '@/components/PrivacyMask';
import { useAppStore } from '@/lib/store';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Home, Calculator, TrendingUp, DollarSign, ShieldCheck,
  AlertTriangle, CheckCircle2, Clock, Zap, ChevronDown,
  ChevronUp, Info,
} from 'lucide-react';
import {
  computeAllScenarios, defaultScenarioInputs, calcStampDuty,
  STATE_LABELS, type PropertyScenarioInput, type ScenarioResult,
  type PropertyBuyResult,
} from '@/lib/propertyBuyEngine';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}
function fmtPct(n: number, d = 1) { return `${(n * 100).toFixed(d)}%`; }
function fmtCF(n: number) { return `${n >= 0 ? '+' : ''}${fmt(n)}/mo`; }

type InputKey = keyof Omit<PropertyScenarioInput, 'label' | 'delay_months'>;

// ─── Number input field ───────────────────────────────────────────────────────
function NumField({
  label, hint, value, onChange, prefix = '$', suffix = '',
}: {
  label: string; hint?: string; value: number;
  onChange: (v: number) => void; prefix?: string; suffix?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</label>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-2.5 text-xs text-slate-500 pointer-events-none">{prefix}</span>
        )}
        <Input
          type="number"
          value={value || ''}
          onChange={e => onChange(safeNum(e.target.value))}
          className={`h-8 text-xs bg-white/[0.04] border-white/[0.08] text-white ${prefix ? 'pl-6' : 'pl-3'} ${suffix ? 'pr-8' : ''}`}
        />
        {suffix && (
          <span className="absolute right-2.5 text-xs text-slate-500 pointer-events-none">{suffix}</span>
        )}
      </div>
      {hint && <p className="text-[10px] text-slate-600 mt-0.5">{hint}</p>}
    </div>
  );
}

// ─── Risk badge ───────────────────────────────────────────────────────────────
function RiskBadge({ level }: { level: 'Low' | 'Med' | 'High' }) {
  const s = {
    Low:  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    Med:  'bg-amber-500/15   text-amber-400   border-amber-500/30',
    High: 'bg-red-500/15     text-red-400     border-red-500/30',
  }[level];
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase tracking-wide ${s}`}>
      {level} Risk
    </span>
  );
}

// ─── Scenario summary card ────────────────────────────────────────────────────
function ScenarioCard({
  result, isBest, mv,
}: {
  result: ScenarioResult; isBest: boolean; mv: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-2xl border p-4 transition-all ${
      isBest
        ? 'bg-emerald-500/5 border-emerald-500/30'
        : 'bg-white/[0.03] border-white/[0.07]'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isBest && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          <h3 className={`text-sm font-bold ${isBest ? 'text-emerald-300' : 'text-white'}`}>
            {result.label}
          </h3>
          {isBest && (
            <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full uppercase">
              Best Move
            </span>
          )}
        </div>
        <RiskBadge level={result.risk_level} />
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {[
          { label: 'Purchase Price',  val: fmt(result.purchase_price) },
          { label: 'Total Upfront',   val: mv(fmt(result.total_upfront)) },
          { label: `Equity (${result.yearly.length}yr)`, val: mv(fmt(result.equity_end)) },
          { label: 'Capital Gain',    val: mv(fmt(result.capital_gain)) },
          { label: 'IRR',             val: fmtPct(result.irr) },
          { label: 'Avg Monthly CF',  val: mv(fmtCF(result.avg_monthly_cashflow)) },
        ].map(({ label, val }) => (
          <div key={label} className="rounded-xl bg-white/[0.04] border border-white/[0.05] p-2.5">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
            <p className="text-sm font-bold text-white font-mono">{val}</p>
          </div>
        ))}
      </div>

      {/* Confidence */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">Confidence</span>
          <span className="text-xs font-semibold text-white">{result.confidence}/100</span>
        </div>
        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              result.confidence >= 70 ? 'bg-emerald-400' : result.confidence >= 50 ? 'bg-amber-400' : 'bg-red-400'
            }`}
            style={{ width: `${result.confidence}%` }}
          />
        </div>
      </div>

      {/* Risk summary */}
      {result.risk_summary && (
        <div className="flex items-start gap-1.5 mb-3">
          <Info className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-slate-400 leading-relaxed">{result.risk_summary}</p>
        </div>
      )}

      {/* Year-by-year toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between text-[10px] text-slate-500 hover:text-slate-300 transition-colors py-1"
      >
        <span className="font-medium uppercase tracking-wider">Year-by-year breakdown</span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[11px] text-slate-400 border-collapse">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Yr', 'Value', 'Equity', 'Rent', 'NG Benefit', 'Net CF/mo'].map(h => (
                  <th key={h} className="text-left py-1.5 pr-3 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.yearly.map(y => (
                <tr key={y.year} className="border-b border-white/[0.03]">
                  <td className="py-1.5 pr-3 font-mono">{y.year}</td>
                  <td className="py-1.5 pr-3 font-mono">{mv(fmt(y.property_value))}</td>
                  <td className="py-1.5 pr-3 font-mono">{mv(fmt(y.equity))}</td>
                  <td className="py-1.5 pr-3 font-mono">{mv(fmt(y.annual_rent))}</td>
                  <td className="py-1.5 pr-3 font-mono text-emerald-400">{mv(fmt(y.ng_benefit))}</td>
                  <td className={`py-1.5 pr-3 font-mono ${y.net_annual_cashflow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {mv(fmtCF(Math.round(y.net_annual_cashflow / 12)))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PropertyBuyAnalysisPage() {
  const { privacyMode } = useAppStore();
  const mv = useCallback((v: string) => maskValue(v, privacyMode), [privacyMode]);

  // Fetch snapshot for defaults
  const { data: snapshot } = useQuery({
    queryKey: ['/api/snapshot'],
    queryFn: () => apiRequest('GET', '/api/snapshot').then(r => r.json()),
  });

  // Build default inputs from snapshot
  const defaults = useMemo(() => defaultScenarioInputs(snapshot ?? {}), [snapshot]);

  // Inputs state
  const [inp, setInp] = useState<Omit<PropertyScenarioInput, 'label' | 'delay_months'>>(defaults);
  const [altEnabled, setAltEnabled] = useState(false);
  const [altPrice, setAltPrice]     = useState(650_000);
  const [altLabel, setAltLabel]     = useState('Alternative Location');
  const [computed, setComputed]     = useState(false);
  const [result, setResult]         = useState<PropertyBuyResult | null>(null);

  const set = (k: InputKey, v: number | string | boolean) =>
    setInp(prev => ({ ...prev, [k]: v }));

  // Auto-calculate stamp duty when price or state changes
  const stampDutyAuto = useMemo(() =>
    calcStampDuty(safeNum(inp.purchase_price), inp.state),
  [inp.purchase_price, inp.state]);

  const handleCompute = useCallback(() => {
    const altOverride = altEnabled ? {
      purchase_price: altPrice,
      label: altLabel,
      delay_months: 0,
      price_growth_during_wait_pct: 0,
    } : null;
    const res = computeAllScenarios(inp, {}, altOverride as any);
    setResult(res);
    setComputed(true);
  }, [inp, altEnabled, altPrice, altLabel]);

  // Charts from result
  const equityChartData = useMemo(() => {
    if (!result) return [];
    return result.buy_now.yearly.map((y, i) => ({
      year: `Yr ${y.year}`,
      'Buy Now': result.buy_now.yearly[i].equity,
      'Wait 6m': result.wait_6m.yearly[i]?.equity ?? 0,
      'Wait 12m / Alt': result.wait_12m?.yearly[i]?.equity ?? 0,
    }));
  }, [result]);

  const cashflowChartData = useMemo(() => {
    if (!result) return [];
    return result.buy_now.yearly.map((y, i) => ({
      year: `Yr ${y.year}`,
      'Buy Now': Math.round(result.buy_now.yearly[i].net_annual_cashflow / 12),
      'Wait 6m': Math.round((result.wait_6m.yearly[i]?.net_annual_cashflow ?? 0) / 12),
      'Wait 12m / Alt': Math.round((result.wait_12m?.yearly[i]?.net_annual_cashflow ?? 0) / 12),
    }));
  }, [result]);

  return (
    <div className="space-y-6 pb-10">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <Home className="w-4 h-4 text-emerald-400" />
            </div>
            <h1 className="text-xl font-black text-white tracking-tight">Property Buy vs Wait</h1>
          </div>
          <p className="text-xs text-slate-500 ml-10">AU-specific scenario analysis — IRR, equity, cashflow, negative gearing</p>
        </div>
      </div>

      {/* ── Inputs ──────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-4">
        <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-slate-400" />
          Property Inputs
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <NumField label="Purchase Price" value={inp.purchase_price} onChange={v => set('purchase_price', v)} />
          <NumField label="Deposit %" value={inp.deposit_pct} onChange={v => set('deposit_pct', v)} prefix="" suffix="%" hint={`Deposit: ${fmt(inp.purchase_price * inp.deposit_pct / 100)}`} />
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">State</label>
            <Select value={inp.state} onValueChange={v => set('state', v as any)}>
              <SelectTrigger className="h-8 text-xs bg-white/[0.04] border-white/[0.08] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <NumField label="Stamp Duty (auto)" value={stampDutyAuto} onChange={() => {}} prefix="$" hint="Auto-calculated for investors" />
          <NumField label="Loan Rate % p.a." value={inp.loan_rate} onChange={v => set('loan_rate', v)} prefix="" suffix="%" />
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Loan Type</label>
            <Select value={inp.loan_type} onValueChange={v => set('loan_type', v as any)}>
              <SelectTrigger className="h-8 text-xs bg-white/[0.04] border-white/[0.08] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PI">Principal & Interest</SelectItem>
                <SelectItem value="IO">Interest Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {inp.loan_type === 'IO' && (
            <NumField label="IO Period (years)" value={inp.io_years} onChange={v => set('io_years', v)} prefix="" suffix="yr" />
          )}
          <NumField label="Loan Term" value={inp.loan_term} onChange={v => set('loan_term', v)} prefix="" suffix="yr" />
          <NumField label="Weekly Rent" value={inp.weekly_rent} onChange={v => set('weekly_rent', v)} hint={`Yield: ${(inp.weekly_rent * 52 / inp.purchase_price * 100).toFixed(2)}% gross`} />
          <NumField label="Rental Growth % p.a." value={inp.rental_growth_pct} onChange={v => set('rental_growth_pct', v)} prefix="" suffix="%" />
          <NumField label="Capital Growth % p.a." value={inp.capital_growth_pct} onChange={v => set('capital_growth_pct', v)} prefix="" suffix="%" hint="AU avg ~6-7% long run" />
          <NumField label="Horizon" value={inp.horizon_years} onChange={v => set('horizon_years', Math.max(1, Math.min(15, v)))} prefix="" suffix="yr" />
        </div>

        <h3 className="text-xs font-semibold text-slate-400 mb-3">Holding Costs (Annual)</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <NumField label="Management Fee %" value={inp.management_fee_pct} onChange={v => set('management_fee_pct', v)} prefix="" suffix="%" hint={fmt(inp.weekly_rent * 52 * inp.management_fee_pct / 100)} />
          <NumField label="Council Rates" value={inp.council_rates} onChange={v => set('council_rates', v)} />
          <NumField label="Insurance" value={inp.insurance} onChange={v => set('insurance', v)} />
          <NumField label="Maintenance %" value={inp.maintenance_pct} onChange={v => set('maintenance_pct', v)} prefix="" suffix="%" hint={fmt(inp.purchase_price * inp.maintenance_pct / 100)} />
          <NumField label="Body Corporate" value={inp.body_corporate} onChange={v => set('body_corporate', v)} />
        </div>

        <h3 className="text-xs font-semibold text-slate-400 mb-3">Tax & Depreciation</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <NumField label="Annual Salary (gross)" value={inp.annual_salary} onChange={v => set('annual_salary', v)} hint={`Marginal rate: ${(require('./australianTax') ? '32%' : '32%')}`} />
          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Depreciation Schedule</label>
            <Select
              value={inp.has_depreciation ? 'yes' : 'no'}
              onValueChange={v => set('has_depreciation', v === 'yes')}
            >
              <SelectTrigger className="h-8 text-xs bg-white/[0.04] border-white/[0.08] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes (Div 43 + Div 40)</SelectItem>
                <SelectItem value="no">No (old property or unit)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {inp.has_depreciation && (
            <NumField label="Build Year" value={inp.build_year} onChange={v => set('build_year', v)} prefix="" suffix="" hint="Affects Div 40 diminishing value" />
          )}
        </div>

        <h3 className="text-xs font-semibold text-slate-400 mb-3">Wait Scenario Assumptions</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <NumField label="Deposit Return % (wait)" value={inp.deposit_investment_return_pct} onChange={v => set('deposit_investment_return_pct', v)} prefix="" suffix="%" hint="ETF ≈ 9.5%, Offset ≈ 6.25%" />
          <NumField label="Your PPOR Mortgage Rate" value={inp.mortgage_rate} onChange={v => set('mortgage_rate', v)} prefix="" suffix="%" hint="For offset tradeoff calc" />
        </div>

        {/* Alternative location toggle */}
        <div className="border-t border-white/[0.06] pt-3 mt-2">
          <button
            onClick={() => setAltEnabled(v => !v)}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${altEnabled ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`}>
              {altEnabled && <CheckCircle2 className="w-3 h-3 text-black" />}
            </div>
            Compare Alternative Location / Different Property
          </button>
          {altEnabled && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1">Scenario Label</label>
                <Input
                  value={altLabel}
                  onChange={e => setAltLabel(e.target.value)}
                  className="h-8 text-xs bg-white/[0.04] border-white/[0.08] text-white"
                />
              </div>
              <NumField label="Alternative Price" value={altPrice} onChange={setAltPrice} />
            </div>
          )}
        </div>

        <Button
          onClick={handleCompute}
          className="mt-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold h-9 text-sm gap-2"
        >
          <Calculator className="w-4 h-4" />
          Run Analysis
        </Button>
      </div>

      {/* ── Results ─────────────────────────────────────────────────────────── */}
      {computed && result && (
        <>
          {/* Decision summary */}
          <div className={`rounded-2xl border p-4 ${
            result.best_scenario === 'buy_now'
              ? 'bg-emerald-500/5 border-emerald-500/30'
              : 'bg-amber-500/5 border-amber-500/30'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                result.best_scenario === 'buy_now' ? 'bg-emerald-500/20' : 'bg-amber-500/20'
              }`}>
                {result.best_scenario === 'buy_now'
                  ? <Zap className="w-5 h-5 text-emerald-400" />
                  : <Clock className="w-5 h-5 text-amber-400" />
                }
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h2 className="text-base font-black text-white">
                    Recommendation: {result.best_label}
                  </h2>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/[0.08] text-slate-300">
                    {result.confidence}/100 confidence
                  </span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{result.key_insight}</p>
              </div>
            </div>
          </div>

          {/* Scenario cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[result.buy_now, result.wait_6m, result.wait_12m].filter(Boolean).map(s => (
              <ScenarioCard
                key={s!.label}
                result={s!}
                isBest={
                  (result.best_scenario === 'buy_now'  && s!.label === result.buy_now.label) ||
                  (result.best_scenario === 'wait_6m'  && s!.label === result.wait_6m.label) ||
                  (result.best_scenario === 'wait_12m' && s!.label === result.wait_12m?.label)
                }
                mv={mv}
              />
            ))}
          </div>

          {/* Comparison table */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
            <div className="px-4 pt-4 pb-2 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-bold text-white">Comparison Table</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/[0.07] bg-white/[0.03]">
                    <th className="text-left px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-semibold w-40">Metric</th>
                    {[result.buy_now, result.wait_6m, result.wait_12m].filter(Boolean).map(s => (
                      <th key={s!.label} className={`text-right px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold ${
                        (result.best_scenario === 'buy_now'  && s!.label === result.buy_now.label) ||
                        (result.best_scenario === 'wait_6m'  && s!.label === result.wait_6m.label) ||
                        (result.best_scenario === 'wait_12m' && s!.label === result.wait_12m?.label)
                          ? 'text-emerald-400'
                          : 'text-slate-500'
                      }`}>
                        {s!.label}
                        {((result.best_scenario === 'buy_now' && s!.label === result.buy_now.label) ||
                          (result.best_scenario === 'wait_6m' && s!.label === result.wait_6m.label) ||
                          (result.best_scenario === 'wait_12m' && s!.label === result.wait_12m?.label)) && (
                          <span className="ml-1">★</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.comparison_table.map((row, i) => (
                    <tr key={row.metric} className={`border-b border-white/[0.04] ${i % 2 === 0 ? '' : 'bg-white/[0.01]'}`}>
                      <td className="px-4 py-2.5 text-slate-400 font-medium">{row.metric}</td>
                      <td className="px-4 py-2.5 text-right text-white font-mono">{mv(row.buy_now)}</td>
                      <td className="px-4 py-2.5 text-right text-white font-mono">{mv(row.wait_6m)}</td>
                      <td className="px-4 py-2.5 text-right text-white font-mono">{mv(row.wait_12m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Equity growth chart */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-4">
            <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Equity Growth Over Time
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={equityChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => fmt(v)} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  contentStyle={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any) => mv(fmt(v))}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }} />
                <Area type="monotone" dataKey="Buy Now"       stroke="#10b981" fill="url(#g1)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="Wait 6m"       stroke="#f59e0b" fill="url(#g2)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="Wait 12m / Alt" stroke="#6366f1" fill="url(#g3)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly cashflow chart */}
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.07] p-4">
            <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-400" />
              Monthly Net Cashflow (after NG benefit)
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={cashflowChartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="year" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => fmt(v)} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip
                  contentStyle={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: any) => `${v >= 0 ? '+' : ''}${mv(fmt(v))}/mo`}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }} />
                <Bar dataKey="Buy Now"        fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Wait 6m"        fill="#f59e0b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Wait 12m / Alt" fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-[10px] text-slate-600 mt-2">
              Negative bars = net monthly cash cost. NG benefit applied. Land tax not included (varies by state).
            </p>
          </div>

          {/* Offset tradeoff note */}
          <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-cyan-300 mb-0.5">Offset vs Deposit Tradeoff</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Using {mv(fmt(result.buy_now.deposit))} as a deposit removes it from your PPOR offset account,
                costing ~{mv(fmt(result.buy_now.offset_tradeoff))}/year in mortgage interest at {inp.mortgage_rate}%.
                This is already factored into the Buy Now IRR calculation as an opportunity cost.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

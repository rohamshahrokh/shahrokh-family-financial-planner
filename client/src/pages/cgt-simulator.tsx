/**
 * cgt-simulator.tsx — Capital Gains Tax Simulator (Australia)
 * Route: /cgt-simulator (also embedded as a tab inside /tax)
 *
 * Premium clean cards. Side-by-side comparison: under-12-months vs ≥12-months.
 * Scenario mode (multiple "what if" sales) saved to Supabase via sf_scenarios.
 * "Use in Forecast" toggles emit a CgtForecastImpact for downstream modules.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Calculator, Calendar, Home, Users, Info, Plus, Trash2, Save,
  TrendingUp, TrendingDown, AlertTriangle, ExternalLink, CheckCircle2,
  Wallet, Sparkles, Building2, ArrowRight, RotateCcw,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { formatCurrency, safeNum } from '@/lib/finance';
import { useAppStore } from '@/lib/store';
import { maskValue } from '@/components/PrivacyMask';
import {
  computeCgtComparison, computeCgtScenario, defaultCgtInput, daysBetween,
  buildCgtForecastImpact, defaultCgtDueDate, ownershipShares,
  type CgtInput, type CgtComparison, type HoldingType,
  type OwnershipPreset, type AustralianState,
} from '@/lib/cgtEngine';
import { sbScenarios } from '@/lib/supabaseClient';
import type { TaxYear } from '@/lib/australianTax';

// ─── Persistence shape (stored as JSON string in sf_scenarios.data) ───────────

const SCENARIO_KIND = 'cgt_simulator_v1';

interface StoredCgtScenario {
  kind: typeof SCENARIO_KIND;
  input: CgtInput;
  use_in_forecast: boolean;
  notes?: string;
}

interface SavedScenario {
  id: number;
  name: string;
  stored: StoredCgtScenario;
  created_at: string;
}

// ─── Small UI atoms ───────────────────────────────────────────────────────────

function Field({
  label, hint, children,
}: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{hint}</p>}
    </div>
  );
}

function NumberField({
  label, hint, value, onChange, prefix = '$', suffix = '', step = 1,
}: {
  label: string; hint?: string; value: number;
  onChange: (v: number) => void; prefix?: string; suffix?: string; step?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-2.5 text-xs text-muted-foreground pointer-events-none">{prefix}</span>
        )}
        <Input
          type="number"
          step={step}
          value={value || ''}
          onChange={e => onChange(safeNum(e.target.value))}
          className={`h-9 text-sm ${prefix ? 'pl-6' : ''} ${suffix ? 'pr-8' : ''}`}
        />
        {suffix && (
          <span className="absolute right-2.5 text-xs text-muted-foreground pointer-events-none">{suffix}</span>
        )}
      </div>
    </Field>
  );
}

function DateField({
  label, value, onChange,
}: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <Input type="date" value={value} onChange={e => onChange(e.target.value)} className="h-9 text-sm" />
    </Field>
  );
}

// ─── Comparison card ──────────────────────────────────────────────────────────

function ComparisonCard({
  title, subtitle, tax, netCash, gain, discountFactor, daysHeld,
  variant, mv,
}: {
  title: string; subtitle: string;
  tax: number; netCash: number; gain: number; discountFactor: number; daysHeld: number;
  variant: 'red' | 'emerald' | 'blue';
  mv: (s: string) => string;
}) {
  const styles = {
    red:     'from-red-500/10 to-red-500/5 border-red-500/30 text-red-400',
    emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/30 text-emerald-400',
    blue:    'from-blue-500/10 to-blue-500/5 border-blue-500/30 text-blue-400',
  }[variant];

  return (
    <div className={`rounded-2xl border bg-gradient-to-b p-5 ${styles}`}>
      <div className="text-[10px] uppercase tracking-wider font-bold mb-1">{title}</div>
      <p className="text-xs text-muted-foreground mb-4">{subtitle}</p>

      <div className="space-y-3">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Tax payable</p>
          <p className={`text-2xl font-black tracking-tight tabular-nums`}>{mv(formatCurrency(tax))}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Net cash</p>
            <p className="text-sm font-bold tabular-nums">{mv(formatCurrency(netCash))}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Gross gain</p>
            <p className="text-sm font-bold tabular-nums">{mv(formatCurrency(gain))}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-current/10">
          <div className="text-[10px] text-muted-foreground">
            {daysHeld} days held · CGT discount {discountFactor > 0 ? `${(discountFactor * 100).toFixed(0)}%` : 'not applied'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Owner share row ──────────────────────────────────────────────────────────

function OwnerRow({
  name, share, allocatedGain, discountedGain, otherIncome, cgtPayable, mv,
}: {
  name: string; share: number; allocatedGain: number; discountedGain: number;
  otherIncome: number; cgtPayable: number; mv: (s: string) => string;
}) {
  return (
    <div className="grid grid-cols-5 gap-3 items-center py-2 border-t border-border/50 first:border-t-0">
      <div className="text-sm font-semibold">{name}</div>
      <div className="text-xs tabular-nums">{(share * 100).toFixed(0)}%</div>
      <div className="text-xs tabular-nums text-muted-foreground">{mv(formatCurrency(otherIncome))}</div>
      <div className="text-xs tabular-nums">{mv(formatCurrency(discountedGain))}</div>
      <div className="text-sm font-bold tabular-nums text-amber-400">{mv(formatCurrency(cgtPayable))}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CgtSimulatorPage() {
  const { privacyMode } = useAppStore();
  const mv = useCallback((s: string) => maskValue(s, privacyMode), [privacyMode]);

  // ── Active scenario inputs ───────────────────────────────────────────────────
  const [input, setInput]     = useState<CgtInput>(defaultCgtInput());
  const [activeId, setActive] = useState<number | null>(null);
  const [useInForecast, setUseInForecast] = useState(false);
  const [scenarioName, setScenarioName]   = useState('Sale Scenario');
  const [busy, setBusy]                   = useState(false);
  const [savedList, setSavedList]         = useState<SavedScenario[]>([]);

  const set = <K extends keyof CgtInput>(k: K, v: CgtInput[K]) =>
    setInput(prev => ({ ...prev, [k]: v }));

  // ── Load scenarios on mount ─────────────────────────────────────────────────
  const loadScenarios = useCallback(async () => {
    try {
      const rows = await sbScenarios.getAll();
      const parsed: SavedScenario[] = [];
      for (const r of rows ?? []) {
        try {
          const stored = JSON.parse(r.data) as StoredCgtScenario;
          if (stored?.kind === SCENARIO_KIND) {
            parsed.push({ id: r.id, name: r.name, stored, created_at: r.created_at });
          }
        } catch { /* ignore non-CGT rows */ }
      }
      setSavedList(parsed);
    } catch { /* offline; leave list empty */ }
  }, []);

  useEffect(() => { loadScenarios(); }, [loadScenarios]);

  // ── Computed comparison ─────────────────────────────────────────────────────
  const comparison: CgtComparison = useMemo(() => computeCgtComparison(input), [input]);
  const days = comparison.actual.days_held;
  const yearsHeld = days / 365.25;

  // ── Slider for "selling date" — easy date control ────────────────────────────
  const sliderMaxYears = 10;
  const sliderValue = Math.min(sliderMaxYears * 12, Math.max(1, Math.round((days / 30.44))));

  const handleSliderMonths = (months: number) => {
    const purchase = new Date(input.purchase_date);
    if (Number.isNaN(purchase.getTime())) return;
    const sale = new Date(purchase);
    sale.setMonth(sale.getMonth() + months);
    set('selling_date', sale.toISOString().slice(0, 10));
  };

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setInput(defaultCgtInput());
    setActive(null);
    setUseInForecast(false);
    setScenarioName('Sale Scenario');
  };

  const handleLoad = (s: SavedScenario) => {
    setInput(s.stored.input);
    setUseInForecast(!!s.stored.use_in_forecast);
    setScenarioName(s.name);
    setActive(s.id);
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      const stored: StoredCgtScenario = {
        kind: SCENARIO_KIND,
        input,
        use_in_forecast: useInForecast,
      };
      const payload = {
        name: scenarioName || 'Sale Scenario',
        data: JSON.stringify(stored),
      };
      const created = await sbScenarios.create(payload);
      if (created) {
        setActive(created.id);
        await loadScenarios();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    setBusy(true);
    try {
      await sbScenarios.delete(id);
      if (activeId === id) setActive(null);
      await loadScenarios();
    } finally {
      setBusy(false);
    }
  };

  const handleToggleForecast = async (next: boolean) => {
    setUseInForecast(next);
    // Persist the toggle on the active saved scenario, if any
    if (activeId == null) return;
    const stored: StoredCgtScenario = {
      kind: SCENARIO_KIND,
      input,
      use_in_forecast: next,
    };
    // sf_scenarios doesn't have an update API exported, so we delete + recreate
    // to keep the toggle authoritative on save. Update is rare.
    try {
      await sbScenarios.delete(activeId);
      const created = await sbScenarios.create({
        name: scenarioName,
        data: JSON.stringify(stored),
      });
      if (created) setActive(created.id);
      await loadScenarios();
    } catch { /* keep local state */ }
  };

  // ── Forecast-impact preview (when the toggle is ON) ─────────────────────────
  const forecastImpact = useMemo(() => {
    if (!useInForecast) return null;
    return buildCgtForecastImpact(
      String(activeId ?? 'draft'),
      scenarioName,
      input,
      comparison.actual,
    );
  }, [useInForecast, activeId, scenarioName, input, comparison.actual]);

  const forecastList = useMemo(
    () => savedList.filter(s => s.stored.use_in_forecast),
    [savedList],
  );

  return (
    <div className="space-y-6 pb-12">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">Capital Gains Simulator</h1>
              <p className="text-xs text-muted-foreground">Australian CGT estimator · investment property sale modelling</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleReset} className="gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={busy} className="gap-1.5">
            <Save className="w-3.5 h-3.5" />
            {activeId ? 'Save as new' : 'Save scenario'}
          </Button>
        </div>
      </div>

      {/* ── Saved scenarios strip ──────────────────────────────────────────── */}
      {savedList.length > 0 && (
        <div className="rounded-2xl bg-card/60 border border-border p-3">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Saved scenarios ({savedList.length})
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {savedList.map(s => (
              <div
                key={s.id}
                className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                  activeId === s.id
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                    : 'bg-secondary/40 border-border text-foreground hover:border-emerald-500/30'
                }`}
              >
                <button onClick={() => handleLoad(s)} className="font-semibold">{s.name}</button>
                {s.stored.use_in_forecast && (
                  <span className="text-[9px] uppercase tracking-wide font-bold text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                    in forecast
                  </span>
                )}
                <button
                  onClick={() => handleDelete(s.id)}
                  className="text-muted-foreground hover:text-red-400 transition-colors"
                  aria-label="Delete scenario"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Inputs panel ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-card/60 border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-bold">Sale inputs</h2>
        </div>

        {/* Scenario name */}
        <div className="mb-4">
          <Field label="Scenario name">
            <Input
              value={scenarioName}
              onChange={e => setScenarioName(e.target.value)}
              className="h-9 text-sm"
              placeholder="e.g. Sell Brisbane IP after Olympics"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <Field label="Property name">
            <Input
              value={input.property_name}
              onChange={e => set('property_name', e.target.value)}
              className="h-9 text-sm"
            />
          </Field>
          <NumberField
            label="Purchase price"
            value={input.purchase_price}
            onChange={v => set('purchase_price', v)}
          />
          <NumberField
            label="Selling price"
            value={input.selling_price}
            onChange={v => set('selling_price', v)}
          />
          <DateField
            label="Purchase date"
            value={input.purchase_date}
            onChange={v => set('purchase_date', v)}
          />
          <DateField
            label="Selling date"
            value={input.selling_date}
            onChange={v => set('selling_date', v)}
          />
          <NumberField
            label="Buying costs"
            hint="Stamp duty, legal, conveyancing"
            value={input.buying_costs}
            onChange={v => set('buying_costs', v)}
          />
          <NumberField
            label="Selling costs"
            hint="Agent commission, legal, marketing"
            value={input.selling_costs}
            onChange={v => set('selling_costs', v)}
          />
          <Field label="Holding type">
            <Select value={input.holding_type} onValueChange={(v: HoldingType) => set('holding_type', v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="personal">Personal names (individuals)</SelectItem>
                <SelectItem value="trust">Australian trust</SelectItem>
                <SelectItem value="company">Company (no CGT discount)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="State">
            <Select value={input.state} onValueChange={(v: AustralianState) => set('state', v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['QLD', 'NSW', 'VIC', 'WA', 'SA', 'TAS', 'ACT', 'NT'] as AustralianState[]).map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Tax year">
            <Select value={input.tax_year} onValueChange={(v: TaxYear) => set('tax_year', v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2024-25">2024–25</SelectItem>
                <SelectItem value="2025-26">2025–26</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        {/* Ownership */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <Field label="Ownership split" hint={
            input.ownership_preset === 'custom'
              ? `Roham ${input.custom_roham_pct}% · Fara ${100 - input.custom_roham_pct}%`
              : undefined
          }>
            <Select value={input.ownership_preset} onValueChange={(v: OwnershipPreset) => set('ownership_preset', v)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="roham_100">Roham 100%</SelectItem>
                <SelectItem value="fara_100">Fara 100%</SelectItem>
                <SelectItem value="split_50_50">50 / 50</SelectItem>
                <SelectItem value="custom">Custom %</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {input.ownership_preset === 'custom' && (
            <div className="md:col-span-2">
              <Field label={`Roham share: ${input.custom_roham_pct}%`}>
                <Slider
                  value={[input.custom_roham_pct]}
                  min={0} max={100} step={1}
                  onValueChange={([v]) => set('custom_roham_pct', v)}
                  className="mt-2"
                />
              </Field>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumberField
            label="Roham — other taxable income (sale year)"
            hint="Excluding the gain"
            value={input.roham_other_income}
            onChange={v => set('roham_other_income', v)}
          />
          <NumberField
            label="Fara — other taxable income (sale year)"
            hint="Excluding the gain"
            value={input.fara_other_income}
            onChange={v => set('fara_other_income', v)}
          />
        </div>

        {/* Selling-date slider — easy "what if I waited X months" */}
        <div className="mt-5 p-4 rounded-xl bg-secondary/30 border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold">Quick "what if I waited?" slider</p>
            <p className="text-xs tabular-nums text-muted-foreground">
              {sliderValue} months held · {yearsHeld.toFixed(2)} years
            </p>
          </div>
          <Slider
            value={[sliderValue]}
            min={1} max={sliderMaxYears * 12} step={1}
            onValueChange={([v]) => handleSliderMonths(v)}
          />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>1mo</span><span>12mo</span><span>3yr</span><span>5yr</span><span>10yr</span>
          </div>
        </div>
      </div>

      {/* ── Headline comparison cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ComparisonCard
          title="Sell under 12 months"
          subtitle="Full marginal tax — no CGT discount"
          tax={comparison.under_12_months.total_cgt_payable}
          netCash={comparison.under_12_months.net_cash_after_tax}
          gain={comparison.under_12_months.gross_gain}
          discountFactor={comparison.under_12_months.discount_factor}
          daysHeld={comparison.under_12_months.days_held}
          variant="red"
          mv={mv}
        />
        <ComparisonCard
          title="Sell after 12 months"
          subtitle={input.holding_type === 'company' ? 'Companies cannot use the discount' : '50% CGT discount applied'}
          tax={comparison.over_12_months.total_cgt_payable}
          netCash={comparison.over_12_months.net_cash_after_tax}
          gain={comparison.over_12_months.gross_gain}
          discountFactor={comparison.over_12_months.discount_factor}
          daysHeld={comparison.over_12_months.days_held}
          variant="emerald"
          mv={mv}
        />
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-amber-500/5 p-5">
          <div className="text-[10px] uppercase tracking-wider font-bold text-amber-400 mb-1">
            Tax saved by waiting
          </div>
          <p className="text-xs text-muted-foreground mb-4">≥12-month CGT discount benefit</p>
          <p className="text-3xl font-black tracking-tight tabular-nums text-amber-400">
            {mv(formatCurrency(comparison.tax_saved_waiting))}
          </p>
          <div className="mt-4 pt-3 border-t border-amber-500/20 space-y-1 text-[11px] text-muted-foreground">
            <div className="flex justify-between">
              <span>Holding now</span>
              <span className="tabular-nums">{days} days · {yearsHeld.toFixed(2)} yr</span>
            </div>
            <div className="flex justify-between">
              <span>12-month threshold</span>
              <span className="tabular-nums">{days >= 365 ? '✓ met' : `${365 - days} days to go`}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Active-scenario detail (uses actual selling_date) ──────────────── */}
      <div className="rounded-2xl bg-card/60 border border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              Result for actual selling date · {input.selling_date}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {comparison.actual.eligible_for_discount
                ? '50% CGT discount applied (asset held ≥ 12 months by an individual / trust)'
                : input.holding_type === 'company'
                  ? 'No CGT discount (company)'
                  : 'No CGT discount (asset held under 12 months)'}
            </p>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/40 border border-border">
            <Switch checked={useInForecast} onCheckedChange={handleToggleForecast} id="use-in-forecast" />
            <label htmlFor="use-in-forecast" className="text-xs font-semibold cursor-pointer">
              Use in Forecast
            </label>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Gross gain',        val: formatCurrency(comparison.actual.gross_gain) },
            { label: 'Estimated tax owed', val: formatCurrency(comparison.actual.total_cgt_payable) },
            { label: 'Net cash after sale', val: formatCurrency(comparison.actual.net_cash_after_tax) },
            { label: 'ROI',                val: `${(comparison.actual.roi_pct * 100).toFixed(1)}%` },
          ].map(({ label, val }) => (
            <div key={label} className="rounded-xl bg-secondary/40 border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
              <p className="text-base font-black tabular-nums">{mv(val)}</p>
            </div>
          ))}
        </div>

        {/* Annualised */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="rounded-xl bg-secondary/40 border border-border p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Annualised return</p>
            <p className="text-sm font-bold tabular-nums">
              {comparison.actual.annualised_return_pct
                ? `${(comparison.actual.annualised_return_pct * 100).toFixed(2)}% / yr`
                : 'n/a'}
            </p>
          </div>
          <div className="rounded-xl bg-secondary/40 border border-border p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Cost base</p>
            <p className="text-sm font-bold tabular-nums">{mv(formatCurrency(comparison.actual.cost_base))}</p>
          </div>
          <div className="rounded-xl bg-secondary/40 border border-border p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Gross proceeds</p>
            <p className="text-sm font-bold tabular-nums">{mv(formatCurrency(input.selling_price))}</p>
          </div>
          <div className="rounded-xl bg-secondary/40 border border-border p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">After-sale ledger entry</p>
            <p className="text-sm font-bold tabular-nums">
              {mv(formatCurrency(comparison.actual.net_cash_before_tax))}
              <span className="text-xs font-normal text-muted-foreground ml-1">on settlement</span>
            </p>
          </div>
        </div>

        {/* Owner breakdown (personal/trust) */}
        {comparison.actual.shares.length > 0 && (
          <div className="rounded-xl bg-secondary/30 border border-border p-4">
            <div className="grid grid-cols-5 gap-3 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              <span>Owner</span><span>Share</span><span>Other income</span><span>Discounted gain</span><span>CGT payable</span>
            </div>
            {comparison.actual.shares.map(s => (
              <OwnerRow
                key={s.owner}
                name={s.owner}
                share={s.share}
                allocatedGain={s.allocated_gain}
                discountedGain={s.discounted_gain}
                otherIncome={s.other_income}
                cgtPayable={s.cgt_payable}
                mv={mv}
              />
            ))}
          </div>
        )}
        {input.holding_type === 'company' && (
          <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-4 text-xs text-blue-300">
            Company scenario — flat tax at {((input.company_tax_rate ?? 0.25) * 100).toFixed(0)}%
            (base-rate entity assumption). Edit <code>company_tax_rate</code> in scenario data
            for non-base-rate entities.
          </div>
        )}

        {/* Capital loss callout */}
        {comparison.actual.capital_loss > 0 && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-300">
              <p className="font-bold">Capital loss of {mv(formatCurrency(comparison.actual.capital_loss))}</p>
              <p className="text-amber-300/80">
                Capital losses can only be applied against capital gains (this year or carried forward).
                No income-tax offset — verify with your accountant.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Forecast impact panel ──────────────────────────────────────────── */}
      <div className="rounded-2xl bg-card/60 border border-border p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold">Forecast impact</h3>
        </div>

        {forecastList.length === 0 && !useInForecast && (
          <p className="text-xs text-muted-foreground">
            Toggle <strong>Use in Forecast</strong> on a saved scenario to feed a sale event into projections.
          </p>
        )}

        {(useInForecast || forecastList.length > 0) && (
          <>
            <div className="space-y-2 mb-4">
              {(forecastImpact ? [{
                id: 'preview',
                name: scenarioName + ' (preview)',
                impact: forecastImpact,
                input,
                actual: comparison.actual,
              }] : []).concat(
                forecastList.filter(s => s.id !== activeId).map(s => {
                  const actual = computeCgtScenario(s.stored.input);
                  return {
                    id: String(s.id),
                    name: s.name,
                    impact: buildCgtForecastImpact(String(s.id), s.name, s.stored.input, actual),
                    input: s.stored.input,
                    actual,
                  };
                })
              ).map(item => (
                <div key={item.id} className="grid grid-cols-1 md:grid-cols-5 gap-3 p-3 rounded-xl bg-secondary/30 border border-border">
                  <div className="md:col-span-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Scenario</p>
                    <p className="text-sm font-bold">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Sells {item.input.property_name} on {item.impact.saleDate}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Sale proceeds</p>
                    <p className="text-sm font-bold tabular-nums text-emerald-400">+{mv(formatCurrency(item.impact.saleProceeds))}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">CGT payable</p>
                    <p className="text-sm font-bold tabular-nums text-red-400">−{mv(formatCurrency(item.impact.cgtPayable))}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">due ~{item.impact.cgtDueDate}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Net to cash</p>
                    <p className="text-sm font-bold tabular-nums">{mv(formatCurrency(item.actual.net_cash_after_tax))}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Downstream propagation status */}
            <div className="rounded-xl bg-blue-500/5 border border-blue-500/20 p-4">
              <p className="text-xs font-bold text-blue-300 mb-2 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" /> Downstream propagation
              </p>
              <ul className="text-[11px] text-blue-300/90 space-y-1">
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Cashflow forecast — sale-month proceeds + CGT month outflow shown above (read-only).</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Net worth projection — uses scenario&apos;s after-tax cash; the central forecast engine consumes this when integrated.</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>FIRE age — re-runs against the scenario&apos;s adjusted balance sheet on the next FIRE recomputation.</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Tax Alpha engine — CGT payable is exposed per-owner so it can be added to that year&apos;s burden.</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Debt strategy / Property plan — the simulator emits a sale event; deeper module integration (rental + mortgage removal at sale date) is opt-in and handled by the Property page once you mark the underlying property as sold.</span>
                </li>
              </ul>
              <p className="text-[10px] text-blue-300/70 mt-3">
                The simulator computes the canonical forecast-impact event ({forecastList.length + (useInForecast ? 1 : 0)} active).
                Modules that have not yet been wired to consume this event will continue to project as if no sale occurs —
                this is intentional to avoid double-counting until each downstream is migrated.
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Assumptions / disclaimer ──────────────────────────────────────── */}
      <div className="rounded-2xl bg-card/60 border border-border p-5">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-bold">Assumptions & ATO references</h3>
        </div>
        <ul className="text-xs text-muted-foreground space-y-2 mb-4">
          <li>• Resident tax brackets 2025–26: $0–$18,200 nil · $18,201–$45,000 16% · $45,001–$135,000 $4,288 + 30% over $45k · $135,001–$190,000 $31,288 + 37% over $135k · $190,001+ $51,638 + 45% over $190k.</li>
          <li>• CGT discount: individuals and Australian trusts may reduce eligible capital gains by 50% if the asset is held for at least 12 months. Companies cannot use the discount.</li>
          <li>• Cost base: purchase price + eligible acquisition / disposal costs (stamp duty, legal, agent commission). Costs already deducted as expenses must be excluded — review with your accountant.</li>
          <li>• Marginal tax incremental to the gain is computed per owner using their other taxable income for the sale year.</li>
        </ul>
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            ['ATO — Resident tax rates',         'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents'],
            ['ATO — CGT discount',                'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/cgt-discount'],
            ['ATO — CGT on rental property',      'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/property-and-capital-gains-tax/cgt-when-selling-your-rental-property'],
            ['ATO — Cost base of an asset',       'https://www.ato.gov.au/individuals-and-families/investments-and-assets/capital-gains-tax/calculating-your-cgt/cost-base-of-asset'],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/40 border border-border text-xs hover:border-emerald-500/30 transition-colors"
            >
              {label} <ExternalLink className="w-3 h-3" />
            </a>
          ))}
        </div>
        <p className="text-xs text-amber-400 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span><strong>Estimate only — verify with accountant.</strong> Doesn&apos;t model special rules (small-business CGT concessions, main-residence exemption partial use, foreign-resident CGT changes, capital-loss carry-forwards, depreciation cost-base reductions). Use as a planning aid, not as advice.</span>
        </p>
      </div>
    </div>
  );
}

/**
 * MonteCarloDashboard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Professional Monte Carlo FIRE Engine — Family Wealth Lab
 *
 * Tabs:
 *   1. Overview      — FIRE probability gauge, key metrics, AI commentary
 *   2. Fan Chart     — P10/P50/P90 net worth fan chart to age 65
 *   3. FIRE Timeline — FIRE year histogram + probability-by-age curve
 *   4. Scenarios     — Preset comparison, side-by-side results
 *   5. Random Events — All editable event probabilities
 *   6. Settings      — Return assumptions, volatility, correlation matrix
 *
 * Data flow:
 *   • Loads mc_fire_settings from Supabase via /api/mc-fire-settings
 *   • Loads latest mc_fire_results from Supabase via /api/mc-fire-results
 *   • On "Run Simulation" — calls runFireMonteCarlo() with current settings,
 *     saves result to /api/mc-fire-results
 *   • All settings edits autosave on blur → /api/mc-fire-settings
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell
} from "recharts";
import {
  Play, Settings, TrendingUp, Target, AlertTriangle, Zap,
  RefreshCw, CheckCircle, Clock, BarChart3, Flame, ChevronDown, ChevronUp,
  Info, ArrowUpRight, ArrowDownRight, Minus, Loader2
} from "lucide-react";
import {
  runFireMonteCarlo,
  DEFAULT_FIRE_MC_SETTINGS,
  PRESET_OVERRIDES,
  applyPreset,
  type FireMCSettings,
  type FireMCResult,
  type PresetKey,
} from "@/lib/fireMonteCarlo";
import SaveButton from "@/components/SaveButton";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtPct(n: number): string { return `${n.toFixed(1)}%`; }

const PRESET_LABELS: Record<PresetKey, string> = {
  conservative:   'Conservative',
  base:           'Base',
  growth:         'Growth',
  aggressive:     'Aggressive',
  property_heavy: 'Property Heavy',
  stock_heavy:    'Stock Heavy',
  custom:         'Custom',
};

const PRESET_COLORS: Record<PresetKey, string> = {
  conservative:   '#94a3b8',
  base:           '#60a5fa',
  growth:         '#34d399',
  aggressive:     '#f97316',
  property_heavy: '#a78bfa',
  stock_heavy:    '#f59e0b',
  custom:         '#ec4899',
};

// ─── Gauge Component ──────────────────────────────────────────────────────────

function ProbabilityGauge({ value }: { value: number }) {
  const angle = -135 + (value / 100) * 270;
  const color = value >= 70 ? '#22c55e' : value >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative flex flex-col items-center">
      <svg width="200" height="120" viewBox="0 0 200 120">
        {/* Background arc */}
        <path d="M 20 110 A 80 80 0 1 1 180 110" fill="none" stroke="#1e293b" strokeWidth="16" strokeLinecap="round"/>
        {/* Value arc */}
        <path
          d="M 20 110 A 80 80 0 1 1 180 110"
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * 251.3} 251.3`}
          style={{ transition: 'stroke-dasharray 0.8s ease, stroke 0.4s ease' }}
        />
        {/* Needle */}
        <line
          x1="100" y1="110"
          x2={100 + 60 * Math.cos((angle * Math.PI) / 180)}
          y2={110 + 60 * Math.sin((angle * Math.PI) / 180)}
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          style={{ transition: 'all 0.8s ease' }}
        />
        <circle cx="100" cy="110" r="5" fill="white"/>
        {/* Labels */}
        <text x="18"  y="125" fill="#475569" fontSize="11" fontFamily="monospace">0%</text>
        <text x="161" y="125" fill="#475569" fontSize="11" fontFamily="monospace">100%</text>
        <text x="88" y="70" fill="#94a3b8" fontSize="10">50%</text>
      </svg>
      <div className="mt-[-10px] text-center">
        <div className="text-4xl font-bold" style={{ color }}>{value.toFixed(1)}%</div>
        <div className="text-xs text-muted-foreground mt-1">Probability of FIRE by target age</div>
      </div>
    </div>
  );
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, trend, color }: {
  label: string; value: string; sub?: string; trend?: 'up' | 'down' | 'neutral'; color?: string;
}) {
  const Icon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-1">
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-bold" style={{ color: color || 'inherit' }}>{value}</div>
      {sub && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {trend && <Icon className="w-3 h-3"/>}
          {sub}
        </div>
      )}
    </div>
  );
}

// ─── Editable number input that doesn't steal focus ──────────────────────────

function EditableNum({
  label, value, onChange, min, max, step = 0.1, suffix = '', prefix = ''
}: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; suffix?: string; prefix?: string;
}) {
  const [local, setLocal] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setLocal(String(value));
  }, [value, focused]);

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
        <Input
          className="h-8 text-sm font-mono"
          value={local}
          onFocus={() => setFocused(true)}
          onChange={e => setLocal(e.target.value)}
          onBlur={() => {
            setFocused(false);
            const n = parseFloat(local);
            if (!isNaN(n)) {
              const clamped = min !== undefined ? Math.max(min, max !== undefined ? Math.min(max, n) : n) : n;
              onChange(clamped);
              setLocal(String(clamped));
            } else {
              setLocal(String(value));
            }
          }}
        />
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const DASH_TABS = [
  { id: 'overview',  label: 'Overview',      icon: Target },
  { id: 'fanchart',  label: 'Fan Chart',     icon: TrendingUp },
  { id: 'timeline',  label: 'FIRE Timeline', icon: BarChart3 },
  { id: 'scenarios', label: 'Scenarios',     icon: Zap },
  { id: 'events',    label: 'Random Events', icon: AlertTriangle },
  { id: 'settings',  label: 'Settings',      icon: Settings },
];

export default function MonteCarloDashboard() {
  const [activeTab,    setActiveTab]    = useState('overview');
  const [isRunning,    setIsRunning]    = useState(false);
  const [saveStatus,   setSaveStatus]   = useState<'idle'|'saving'|'saved'>('idle');
  const [expandedSection, setExpandedSection] = useState<string | null>('profile');
  const [scenarioResults, setScenarioResults] = useState<Partial<Record<PresetKey, FireMCResult>>>({});
  const [runningScenario, setRunningScenario] = useState<PresetKey | null>(null);
  const qc = useQueryClient();

  // ── Load settings from Supabase ──
  const { data: settingsRow, isLoading: loadingSettings } = useQuery<any>({
    queryKey: ['/api/mc-fire-settings'],
  });

  // ── Load last result from Supabase ──
  const { data: resultRow, isLoading: loadingResult } = useQuery<any>({
    queryKey: ['/api/mc-fire-results'],
  });

  // ── Snapshot for starting balances ──
  const { data: snapshot } = useQuery<any>({
    queryKey: ['/api/snapshot'],
  });

  // ── Build active settings (DB row merged with defaults) ──
  const [localSettings, setLocalSettings] = useState<FireMCSettings>(DEFAULT_FIRE_MC_SETTINGS);

  useEffect(() => {
    if (!settingsRow) return;
    setLocalSettings(prev => ({
      ...DEFAULT_FIRE_MC_SETTINGS,
      // Map snake_case DB columns to camelCase FireMCSettings
      currentAge:           settingsRow.current_age             ?? prev.currentAge,
      partnerAge:           settingsRow.partner_age             ?? prev.partnerAge,
      targetFireAge:        settingsRow.target_fire_age         ?? prev.targetFireAge,
      targetPassiveMonthly: settingsRow.target_passive_monthly  ?? prev.targetPassiveMonthly,
      swrPct:               settingsRow.swr_pct                 ?? prev.swrPct,
      simulationCount:      settingsRow.simulation_count        ?? prev.simulationCount,
      startPPOR:            settingsRow.start_ppor              ?? prev.startPPOR,
      startCash:            settingsRow.start_cash              ?? prev.startCash,
      startOffset:          settingsRow.start_offset            ?? prev.startOffset,
      startSuper:           settingsRow.start_super             ?? prev.startSuper,
      startStocks:          settingsRow.start_stocks            ?? prev.startStocks,
      startCrypto:          settingsRow.start_crypto            ?? prev.startCrypto,
      startMortgage:        settingsRow.start_mortgage          ?? prev.startMortgage,
      startOtherDebts:      settingsRow.start_other_debts       ?? prev.startOtherDebts,
      startMonthlyIncome:   settingsRow.start_monthly_income    ?? prev.startMonthlyIncome,
      startMonthlyExpenses: settingsRow.start_monthly_expenses  ?? prev.startMonthlyExpenses,
      meanStockReturn:      settingsRow.mean_stock_return       ?? prev.meanStockReturn,
      meanPropertyReturn:   settingsRow.mean_property_return    ?? prev.meanPropertyReturn,
      meanCryptoReturn:     settingsRow.mean_crypto_return      ?? prev.meanCryptoReturn,
      meanSuperReturn:      settingsRow.mean_super_return       ?? prev.meanSuperReturn,
      meanInflation:        settingsRow.mean_inflation          ?? prev.meanInflation,
      meanIncomeGrowth:     settingsRow.mean_income_growth      ?? prev.meanIncomeGrowth,
      meanExpenseGrowth:    settingsRow.mean_expense_growth     ?? prev.meanExpenseGrowth,
      meanMortgageRate:     settingsRow.mean_mortgage_rate      ?? prev.meanMortgageRate,
      volStocks:            settingsRow.vol_stocks              ?? prev.volStocks,
      volProperty:          settingsRow.vol_property            ?? prev.volProperty,
      volCrypto:            settingsRow.vol_crypto              ?? prev.volCrypto,
      volSuper:             settingsRow.vol_super               ?? prev.volSuper,
      volInflation:         settingsRow.vol_inflation           ?? prev.volInflation,
      rhoStocksCrypto:      settingsRow.rho_stocks_crypto       ?? prev.rhoStocksCrypto,
      rhoInflationRates:    settingsRow.rho_inflation_rates     ?? prev.rhoInflationRates,
      rhoRatesProperty:     settingsRow.rho_rates_property      ?? prev.rhoRatesProperty,
      rhoStocksProperty:    settingsRow.rho_stocks_property     ?? prev.rhoStocksProperty,
      evJobLossProb:        settingsRow.ev_job_loss_prob        ?? prev.evJobLossProb,
      evJobLossDurationMo:  settingsRow.ev_job_loss_duration_mo ?? prev.evJobLossDurationMo,
      evMarketCrashProb:    settingsRow.ev_market_crash_prob    ?? prev.evMarketCrashProb,
      evMarketCrashPct:     settingsRow.ev_market_crash_pct     ?? prev.evMarketCrashPct,
      evRateJumpProb:       settingsRow.ev_rate_jump_prob       ?? prev.evRateJumpProb,
      evRateJumpBps:        settingsRow.ev_rate_jump_bps        ?? prev.evRateJumpBps,
      evRecessionProb:      settingsRow.ev_recession_prob       ?? prev.evRecessionProb,
      evRecessionIncomeCut: settingsRow.ev_recession_income_cut ?? prev.evRecessionIncomeCut,
      evBullMarketProb:     settingsRow.ev_bull_market_prob     ?? prev.evBullMarketProb,
      evBullMarketPct:      settingsRow.ev_bull_market_pct      ?? prev.evBullMarketPct,
      evWindfallProb:       settingsRow.ev_windfall_prob        ?? prev.evWindfallProb,
      evWindfallAmount:     settingsRow.ev_windfall_amount      ?? prev.evWindfallAmount,
      evLargeExpenseProb:   settingsRow.ev_large_expense_prob   ?? prev.evLargeExpenseProb,
      evLargeExpenseAmount: settingsRow.ev_large_expense_amount ?? prev.evLargeExpenseAmount,
      compareOffsetVsEtf:   settingsRow.compare_offset_vs_etf  ?? prev.compareOffsetVsEtf,
      etfExpectedReturn:    settingsRow.etf_expected_return     ?? prev.etfExpectedReturn,
      stockCorrectionProb:  settingsRow.stock_correction_prob   ?? prev.stockCorrectionProb,
      stockCorrectionSize:  settingsRow.stock_correction_size   ?? prev.stockCorrectionSize,
      cryptoCrashProb:      settingsRow.crypto_crash_prob       ?? prev.cryptoCrashProb,
      cryptoCrashSize:      settingsRow.crypto_crash_size       ?? prev.cryptoCrashSize,
      cryptoBullProb:       settingsRow.crypto_bull_prob        ?? prev.cryptoBullProb,
      cryptoBullUpside:     settingsRow.crypto_bull_upside      ?? prev.cryptoBullUpside,
    }));
  }, [settingsRow]);

  // When snapshot loads, sync starting balances
  useEffect(() => {
    if (!snapshot) return;
    setLocalSettings(prev => ({
      ...prev,
      startPPOR:            snapshot.ppor              ?? prev.startPPOR,
      startCash:            snapshot.cash              ?? prev.startCash,
      startOffset:          snapshot.offset_balance    ?? prev.startOffset,
      startSuper:           (snapshot.roham_super_balance ?? 0) + (snapshot.fara_super_balance ?? 0) || snapshot.super_balance ?? prev.startSuper,
      startStocks:          snapshot.stocks            ?? prev.startStocks,
      startCrypto:          snapshot.crypto            ?? prev.startCrypto,
      startMortgage:        snapshot.mortgage          ?? prev.startMortgage,
      startOtherDebts:      snapshot.other_debts       ?? prev.startOtherDebts,
      startMonthlyIncome:   snapshot.monthly_income    ?? prev.startMonthlyIncome,
      startMonthlyExpenses: snapshot.monthly_expenses  ?? prev.startMonthlyExpenses,
    }));
  }, [snapshot]);

  // Parse last result
  const lastResult: FireMCResult | null = useMemo(() => {
    if (!resultRow || !resultRow.fan_data) return null;
    try {
      return {
        probFireByTarget:    resultRow.prob_fire_by_target   ?? 0,
        medianFireYear:      resultRow.median_fire_year      ?? null,
        p10FireYear:         resultRow.p10_fire_year         ?? null,
        p90FireYear:         resultRow.p90_fire_year         ?? null,
        neverFirePct:        resultRow.never_fire_pct        ?? 0,
        fanData:             resultRow.fan_data              ?? [],
        fireYearHistogram:   resultRow.fire_year_histogram   ?? [],
        fireProbByAge:       resultRow.fire_prob_by_age      ?? [],
        nwP10AtTarget:       resultRow.nw_p10_at_target      ?? 0,
        nwP50AtTarget:       resultRow.nw_p50_at_target      ?? 0,
        nwP90AtTarget:       resultRow.nw_p90_at_target      ?? 0,
        offsetVsEtf:         resultRow.offset_vs_etf         ?? null,
        propAcquisitionProb: resultRow.prop_acquisition_prob ?? 0,
        probCashShortfall:   resultRow.prob_cash_shortfall   ?? 0,
        probNegCashflow:     resultRow.prob_neg_cashflow      ?? 0,
        highestRiskYear:     resultRow.highest_risk_year     ?? 0,
        biggestRiskDriver:   resultRow.biggest_risk_driver   ?? '',
        keyRisks:            resultRow.key_risks             ?? [],
        recommendedActions:  resultRow.recommended_actions   ?? [],
        ranAt:               resultRow.ran_at                ?? '',
        simulationCount:     resultRow.simulation_count      ?? 0,
        runtimeMs:           0,
      };
    } catch { return null; }
  }, [resultRow]);

  const [displayResult, setDisplayResult] = useState<FireMCResult | null>(null);

  useEffect(() => {
    if (lastResult) setDisplayResult(lastResult);
  }, [lastResult]);

  // ── Save settings ──
  const saveSettings = useCallback(async (s: FireMCSettings) => {
    setSaveStatus('saving');
    try {
      await apiRequest('PUT', '/api/mc-fire-settings', {
        current_age:              s.currentAge,
        partner_age:              s.partnerAge,
        target_fire_age:          s.targetFireAge,
        target_passive_monthly:   s.targetPassiveMonthly,
        swr_pct:                  s.swrPct,
        simulation_count:         s.simulationCount,
        start_ppor:               s.startPPOR,
        start_cash:               s.startCash,
        start_offset:             s.startOffset,
        start_super:              s.startSuper,
        start_stocks:             s.startStocks,
        start_crypto:             s.startCrypto,
        start_mortgage:           s.startMortgage,
        start_other_debts:        s.startOtherDebts,
        start_monthly_income:     s.startMonthlyIncome,
        start_monthly_expenses:   s.startMonthlyExpenses,
        mean_stock_return:        s.meanStockReturn,
        mean_property_return:     s.meanPropertyReturn,
        mean_crypto_return:       s.meanCryptoReturn,
        mean_super_return:        s.meanSuperReturn,
        mean_inflation:           s.meanInflation,
        mean_income_growth:       s.meanIncomeGrowth,
        mean_expense_growth:      s.meanExpenseGrowth,
        mean_mortgage_rate:       s.meanMortgageRate,
        vol_stocks:               s.volStocks,
        vol_property:             s.volProperty,
        vol_crypto:               s.volCrypto,
        vol_super:                s.volSuper,
        vol_inflation:            s.volInflation,
        rho_stocks_crypto:        s.rhoStocksCrypto,
        rho_inflation_rates:      s.rhoInflationRates,
        rho_rates_property:       s.rhoRatesProperty,
        rho_stocks_property:      s.rhoStocksProperty,
        ev_job_loss_prob:         s.evJobLossProb,
        ev_job_loss_duration_mo:  s.evJobLossDurationMo,
        ev_market_crash_prob:     s.evMarketCrashProb,
        ev_market_crash_pct:      s.evMarketCrashPct,
        ev_rate_jump_prob:        s.evRateJumpProb,
        ev_rate_jump_bps:         s.evRateJumpBps,
        ev_recession_prob:        s.evRecessionProb,
        ev_recession_income_cut:  s.evRecessionIncomeCut,
        ev_bull_market_prob:      s.evBullMarketProb,
        ev_bull_market_pct:       s.evBullMarketPct,
        ev_windfall_prob:         s.evWindfallProb,
        ev_windfall_amount:       s.evWindfallAmount,
        ev_large_expense_prob:    s.evLargeExpenseProb,
        ev_large_expense_amount:  s.evLargeExpenseAmount,
        compare_offset_vs_etf:    s.compareOffsetVsEtf,
        etf_expected_return:      s.etfExpectedReturn,
        stock_correction_prob:    s.stockCorrectionProb,
        stock_correction_size:    s.stockCorrectionSize,
        crypto_crash_prob:        s.cryptoCrashProb,
        crypto_crash_size:        s.cryptoCrashSize,
        crypto_bull_prob:         s.cryptoBullProb,
        crypto_bull_upside:       s.cryptoBullUpside,
      });
      qc.invalidateQueries({ queryKey: ['/api/mc-fire-settings'] });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch (e) {
      setSaveStatus('idle');
    }
  }, [qc]);

  // ── Run simulation ──
  const handleRun = useCallback(async () => {
    setIsRunning(true);
    try {
      // Run in a microtask to allow React to render the loading state first
      await new Promise<void>(resolve => setTimeout(resolve, 50));
      const result = runFireMonteCarlo(localSettings);
      setDisplayResult(result);

      // Persist result to Supabase
      await apiRequest('PUT', '/api/mc-fire-results', {
        ran_at:                result.ranAt,
        simulation_count:      result.simulationCount,
        prob_fire_by_target:   result.probFireByTarget,
        median_fire_year:      result.medianFireYear,
        p10_fire_year:         result.p10FireYear,
        p90_fire_year:         result.p90FireYear,
        never_fire_pct:        result.neverFirePct,
        fan_data:              result.fanData,
        fire_year_histogram:   result.fireYearHistogram,
        fire_prob_by_age:      result.fireProbByAge,
        nw_p10_at_target:      result.nwP10AtTarget,
        nw_p50_at_target:      result.nwP50AtTarget,
        nw_p90_at_target:      result.nwP90AtTarget,
        offset_vs_etf:         result.offsetVsEtf,
        prop_acquisition_prob: result.propAcquisitionProb,
        prob_cash_shortfall:   result.probCashShortfall,
        prob_neg_cashflow:     result.probNegCashflow,
        highest_risk_year:     result.highestRiskYear,
        biggest_risk_driver:   result.biggestRiskDriver,
        key_risks:             result.keyRisks,
        recommended_actions:   result.recommendedActions,
      });
      qc.invalidateQueries({ queryKey: ['/api/mc-fire-results'] });
    } finally {
      setIsRunning(false);
    }
  }, [localSettings, qc]);

  // ── Run all scenarios ──
  const handleRunScenarios = useCallback(async () => {
    const presets: PresetKey[] = ['conservative', 'base', 'growth', 'aggressive'];
    for (const key of presets) {
      setRunningScenario(key);
      await new Promise<void>(resolve => setTimeout(resolve, 30));
      const s = applyPreset({ ...localSettings, simulationCount: 1000 }, key);
      const r = runFireMonteCarlo(s);
      setScenarioResults(prev => ({ ...prev, [key]: r }));
    }
    setRunningScenario(null);
  }, [localSettings]);

  // ── Update a field and autosave ──
  const update = useCallback((patch: Partial<FireMCSettings>) => {
    setLocalSettings(prev => {
      const next = { ...prev, ...patch };
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    saveSettings(localSettings);
  }, [localSettings, saveSettings]);

  // ── Preset selector ──
  const applyPresetToSettings = useCallback((key: PresetKey) => {
    const preset = PRESET_OVERRIDES[key];
    setLocalSettings(prev => ({ ...prev, ...preset }));
  }, []);

  // ── Custom Tooltip for charts ──
  const NWTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 text-xs space-y-1 shadow-xl">
        <div className="font-semibold text-foreground">{label}</div>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: p.fill || p.stroke }}/>
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-mono font-medium">{fmtK(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  const currentYear = new Date().getFullYear();
  const targetYear  = currentYear + (localSettings.targetFireAge - localSettings.currentAge);

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Header + Run button ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-400"/>
            Monte Carlo FIRE Engine
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {localSettings.simulationCount.toLocaleString()} simulations · monthly steps · correlated shocks · random events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(localSettings.simulationCount)}
            onValueChange={v => update({ simulationCount: parseInt(v) })}
          >
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue/>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1000">1,000 sims</SelectItem>
              <SelectItem value="5000">5,000 sims</SelectItem>
              <SelectItem value="10000">10,000 sims</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={handleRun}
            disabled={isRunning}
            className="h-8 px-4 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold"
          >
            {isRunning
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin"/>Running…</>
              : <><Play className="w-3.5 h-3.5 mr-1.5"/>Run Simulation</>
            }
          </Button>
          <SaveButton onClick={handleSave} status={saveStatus}/>
        </div>
      </div>

      {/* ── Run info bar ── */}
      {displayResult && (
        <div className="text-xs text-muted-foreground flex items-center gap-3 bg-muted/30 rounded-lg px-3 py-2">
          <Clock className="w-3.5 h-3.5"/>
          Last run: {new Date(displayResult.ranAt).toLocaleString('en-AU')}
          <span>·</span>
          {displayResult.simulationCount.toLocaleString()} simulations
          <span>·</span>
          {displayResult.runtimeMs > 0 ? `${(displayResult.runtimeMs / 1000).toFixed(1)}s` : 'instant'}
          <span>·</span>
          Biggest risk: <span className="text-orange-400 font-medium">{displayResult.biggestRiskDriver}</span>
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="flex flex-wrap gap-1 border-b border-border pb-0">
        {DASH_TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t transition-colors border-b-2 ${
                activeTab === t.id
                  ? 'border-orange-400 text-orange-400 bg-orange-400/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5"/>{t.label}
            </button>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: OVERVIEW
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {!displayResult && (
            <div className="text-center py-16 text-muted-foreground">
              <Flame className="w-12 h-12 mx-auto mb-3 opacity-30"/>
              <p className="text-sm">No simulation results yet.</p>
              <p className="text-xs mt-1">Click <strong>Run Simulation</strong> to generate your FIRE probability report.</p>
            </div>
          )}

          {displayResult && (
            <>
              {/* Gauge + key stats */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center">
                  <ProbabilityGauge value={displayResult.probFireByTarget}/>
                  <div className="mt-4 w-full grid grid-cols-2 gap-3 text-center">
                    <div>
                      <div className="text-xs text-muted-foreground">Target Age</div>
                      <div className="text-xl font-bold">{localSettings.targetFireAge}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Target Year</div>
                      <div className="text-xl font-bold">{targetYear}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Passive Target</div>
                      <div className="text-xl font-bold">{fmtK(localSettings.targetPassiveMonthly)}/mo</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">FIRE Capital Needed</div>
                      <div className="text-xl font-bold">{fmtK(localSettings.targetPassiveMonthly * 12 / (localSettings.swrPct / 100))}</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <MetricCard
                    label="Median FIRE Year"
                    value={displayResult.medianFireYear ? String(displayResult.medianFireYear) : 'Never (P50)'}
                    sub={displayResult.medianFireYear
                      ? `Age ${localSettings.currentAge + (displayResult.medianFireYear - currentYear)}`
                      : 'Less than 50% reach FIRE'}
                    trend={displayResult.medianFireYear && displayResult.medianFireYear <= targetYear ? 'up' : 'down'}
                    color={displayResult.medianFireYear && displayResult.medianFireYear <= targetYear ? '#22c55e' : '#f59e0b'}
                  />
                  <MetricCard
                    label="Optimistic (P90)"
                    value={displayResult.p90FireYear ? String(displayResult.p90FireYear) : 'N/A'}
                    sub={displayResult.p90FireYear ? `Age ${localSettings.currentAge + (displayResult.p90FireYear - currentYear)}` : ''}
                    color="#22c55e"
                  />
                  <MetricCard
                    label="Pessimistic (P10)"
                    value={displayResult.p10FireYear ? String(displayResult.p10FireYear) : 'Never'}
                    sub={displayResult.p10FireYear ? `Age ${localSettings.currentAge + (displayResult.p10FireYear - currentYear)}` : `${displayResult.neverFirePct}% never FIRE`}
                    color="#ef4444"
                  />
                  <MetricCard
                    label="Never FIRE"
                    value={fmtPct(displayResult.neverFirePct)}
                    sub="of simulations"
                    trend={displayResult.neverFirePct > 30 ? 'down' : 'up'}
                    color={displayResult.neverFirePct > 30 ? '#ef4444' : '#22c55e'}
                  />
                  <MetricCard
                    label="NW at Target Age (P50)"
                    value={fmtK(displayResult.nwP50AtTarget)}
                    sub={`P10: ${fmtK(displayResult.nwP10AtTarget)} · P90: ${fmtK(displayResult.nwP90AtTarget)}`}
                  />
                  <MetricCard
                    label="Cash Shortfall Risk"
                    value={fmtPct(displayResult.probCashShortfall)}
                    sub="drop below buffer"
                    trend={displayResult.probCashShortfall > 30 ? 'down' : 'up'}
                    color={displayResult.probCashShortfall > 30 ? '#ef4444' : '#22c55e'}
                  />
                </div>
              </div>

              {/* Key risks */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400"/>
                  Key Risks
                </h3>
                <ul className="space-y-2">
                  {displayResult.keyRisks.map((risk, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-yellow-400 mt-0.5">⚠</span>
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommendations */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400"/>
                  Recommended Actions
                </h3>
                <ul className="space-y-2">
                  {displayResult.recommendedActions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <span className="text-green-400 mt-0.5">→</span>
                      {action}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Offset vs ETF */}
              {displayResult.offsetVsEtf && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-400"/>
                    Offset vs ETF Comparison
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Offset NW (P50)</div>
                      <div className="text-lg font-bold text-blue-400">{fmtK(displayResult.offsetVsEtf.offsetNwP50)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">ETF NW (P50)</div>
                      <div className="text-lg font-bold text-green-400">{fmtK(displayResult.offsetVsEtf.etfNwP50)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Mortgage Interest Saved</div>
                      <div className="text-lg font-bold text-orange-400">{fmtK(displayResult.offsetVsEtf.mortgageSaved)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">ETF Growth Gain</div>
                      <div className="text-lg font-bold text-purple-400">{fmtK(displayResult.offsetVsEtf.etfGrowthGain)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Offset FIRE Prob</div>
                      <div className="text-lg font-bold">{fmtPct(displayResult.offsetVsEtf.offsetProb)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">ETF FIRE Prob</div>
                      <div className="text-lg font-bold">{fmtPct(displayResult.offsetVsEtf.etfProb)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Offset FIRE Year (P50)</div>
                      <div className="text-lg font-bold">{displayResult.offsetVsEtf.offsetFireYear ?? 'Never'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">ETF FIRE Year (P50)</div>
                      <div className="text-lg font-bold">{displayResult.offsetVsEtf.etfFireYear ?? 'Never'}</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: FAN CHART
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'fanchart' && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-4">Net Worth Fan Chart — P10 / P25 / P50 / P75 / P90</h3>
            {!displayResult?.fanData?.length ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                Run a simulation to see the fan chart
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={displayResult.fanData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#64748b' }}/>
                  <YAxis tickFormatter={(v) => fmtK(v)} tick={{ fontSize: 11, fill: '#64748b' }} width={70}/>
                  <Tooltip content={<NWTooltip/>}/>
                  <ReferenceLine x={targetYear} stroke="#f97316" strokeDasharray="4 2"
                    label={{ value: `FIRE Target ${targetYear}`, position: 'top', fontSize: 10, fill: '#f97316' }}/>
                  {/* P10–P90 shaded band */}
                  <Area type="monotone" dataKey="p90" name="P90" fill="#22c55e" fillOpacity={0.08} stroke="#22c55e" strokeWidth={1.5} dot={false}/>
                  <Area type="monotone" dataKey="p75" name="P75" fill="#60a5fa" fillOpacity={0.1}  stroke="#60a5fa" strokeWidth={1}   dot={false}/>
                  <Area type="monotone" dataKey="median" name="P50 (Median)" fill="#f97316" fillOpacity={0.12} stroke="#f97316" strokeWidth={2.5} dot={false}/>
                  <Area type="monotone" dataKey="p25" name="P25" fill="#f59e0b" fillOpacity={0.08} stroke="#f59e0b" strokeWidth={1}   dot={false}/>
                  <Area type="monotone" dataKey="p10" name="P10" fill="#ef4444" fillOpacity={0.08} stroke="#ef4444" strokeWidth={1.5} dot={false}/>
                  <ReferenceLine y={0} stroke="#475569" strokeDasharray="2 2"/>
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* NW at target age summary */}
          {displayResult && (
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="P10 NW at FIRE age" value={fmtK(displayResult.nwP10AtTarget)} color="#ef4444"/>
              <MetricCard label="P50 NW at FIRE age" value={fmtK(displayResult.nwP50AtTarget)} color="#f97316"/>
              <MetricCard label="P90 NW at FIRE age" value={fmtK(displayResult.nwP90AtTarget)} color="#22c55e"/>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: FIRE TIMELINE
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'timeline' && (
        <div className="space-y-6">

          {/* Histogram */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-4">FIRE Year Distribution — When do simulations reach FIRE?</h3>
            {!displayResult?.fireYearHistogram?.length ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                Run a simulation to see the histogram
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={displayResult.fireYearHistogram} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#64748b' }}/>
                  <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: '#64748b' }} width={45}/>
                  <Tooltip formatter={(v: any) => [`${v}%`, 'Pct of sims']} labelFormatter={l => `Year ${l}`}/>
                  <ReferenceLine x={targetYear} stroke="#f97316" strokeDasharray="4 2"/>
                  <Bar dataKey="pct" name="% of simulations" radius={[3,3,0,0]}>
                    {displayResult.fireYearHistogram.map((entry) => (
                      <Cell key={entry.year}
                        fill={entry.year <= targetYear ? '#22c55e' : '#ef4444'}
                        fillOpacity={0.8}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Green bars = FIRE reached by target age {localSettings.targetFireAge}. Red = after target.
            </p>
          </div>

          {/* Probability by age curve */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-4">Cumulative FIRE Probability by Age</h3>
            {!displayResult?.fireProbByAge?.length ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                Run a simulation first
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={displayResult.fireProbByAge} margin={{ top: 5, right: 10, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                  <XAxis dataKey="age" tick={{ fontSize: 11, fill: '#64748b' }} label={{ value: 'Age', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#64748b' }}/>
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#64748b' }} width={45}/>
                  <Tooltip formatter={(v: any) => [`${v}%`, 'Cumulative FIRE prob']}/>
                  <ReferenceLine y={50}  stroke="#f97316" strokeDasharray="4 2" label={{ value: '50%', fontSize: 9, fill: '#f97316' }}/>
                  <ReferenceLine x={localSettings.targetFireAge} stroke="#f97316" strokeDasharray="4 2"
                    label={{ value: `Target ${localSettings.targetFireAge}`, fontSize: 9, fill: '#f97316', position: 'top' }}/>
                  <Line type="monotone" dataKey="probability" name="FIRE probability"
                    stroke="#22c55e" strokeWidth={2.5} dot={false}/>
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: SCENARIOS
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'scenarios' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Run 1,000-simulation quick comparison across 4 preset scenarios. Does not overwrite your main result.
            </p>
            <Button
              onClick={handleRunScenarios}
              disabled={runningScenario !== null}
              className="h-8 px-4 text-xs"
            >
              {runningScenario !== null
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin"/>Running {PRESET_LABELS[runningScenario]}…</>
                : <><Zap className="w-3.5 h-3.5 mr-1.5"/>Run All Scenarios</>
              }
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {(['conservative', 'base', 'growth', 'aggressive'] as PresetKey[]).map(key => {
              const r = scenarioResults[key];
              const color = PRESET_COLORS[key];
              const isLoading = runningScenario === key;
              return (
                <div key={key} className="bg-card border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm" style={{ color }}>{PRESET_LABELS[key]}</div>
                    {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground"/>}
                  </div>
                  {r ? (
                    <>
                      <div>
                        <div className="text-xs text-muted-foreground">FIRE Probability</div>
                        <div className="text-2xl font-bold" style={{ color }}>
                          {fmtPct(r.probFireByTarget)}
                        </div>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Median FIRE year</span>
                          <span className="font-mono">{r.medianFireYear ?? 'Never'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">NW at target (P50)</span>
                          <span className="font-mono">{fmtK(r.nwP50AtTarget)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Never FIRE</span>
                          <span className="font-mono">{fmtPct(r.neverFirePct)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Cash shortfall risk</span>
                          <span className="font-mono">{fmtPct(r.probCashShortfall)}</span>
                        </div>
                      </div>
                      {/* Mini bar */}
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${r.probFireByTarget}%`, background: color }}/>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground py-6 text-center">
                      {isLoading ? 'Computing…' : 'Click Run All Scenarios'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Comparison chart */}
          {Object.keys(scenarioResults).length >= 2 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold text-sm mb-4">FIRE Probability by Scenario</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={(['conservative','base','growth','aggressive'] as PresetKey[])
                    .filter(k => scenarioResults[k])
                    .map(k => ({
                      name: PRESET_LABELS[k],
                      prob: scenarioResults[k]!.probFireByTarget,
                      color: PRESET_COLORS[k],
                    }))}
                  margin={{ top: 5, right: 10, left: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }}/>
                  <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#64748b' }} width={45}/>
                  <Tooltip formatter={(v: any) => [`${v.toFixed(1)}%`, 'FIRE Probability']}/>
                  <Bar dataKey="prob" radius={[4,4,0,0]}>
                    {(['conservative','base','growth','aggressive'] as PresetKey[])
                      .filter(k => scenarioResults[k])
                      .map(k => (
                        <Cell key={k} fill={PRESET_COLORS[k]}/>
                      ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: RANDOM EVENTS
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'events' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            All event probabilities are applied per-year per-simulation. Save changes, then re-run the simulation.
          </p>

          {/* Job loss */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm text-orange-400">Job Loss</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <EditableNum label="Probability (% pa)" value={localSettings.evJobLossProb}
                onChange={v => update({ evJobLossProb: v })} min={0} max={50} suffix="%"/>
              <EditableNum label="Duration (months)" value={localSettings.evJobLossDurationMo}
                onChange={v => update({ evJobLossDurationMo: Math.round(v) })} min={1} max={24} step={1}/>
            </div>
          </div>

          {/* Market crash */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm text-red-400">Market Crash</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <EditableNum label="Probability (% pa)" value={localSettings.evMarketCrashProb}
                onChange={v => update({ evMarketCrashProb: v })} min={0} max={50} suffix="%"/>
              <EditableNum label="Portfolio drop (%)" value={localSettings.evMarketCrashPct}
                onChange={v => update({ evMarketCrashPct: v })} min={5} max={80} suffix="%"/>
            </div>
          </div>

          {/* Rate jump */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm text-yellow-400">Interest Rate Jump</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <EditableNum label="Probability (% pa)" value={localSettings.evRateJumpProb}
                onChange={v => update({ evRateJumpProb: v })} min={0} max={60} suffix="%"/>
              <EditableNum label="Rate increase (bps)" value={localSettings.evRateJumpBps}
                onChange={v => update({ evRateJumpBps: v })} min={25} max={500} step={25}/>
            </div>
          </div>

          {/* Recession */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm text-red-400">Recession</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <EditableNum label="Probability (% pa)" value={localSettings.evRecessionProb}
                onChange={v => update({ evRecessionProb: v })} min={0} max={40} suffix="%"/>
              <EditableNum label="Income cut (%)" value={localSettings.evRecessionIncomeCut}
                onChange={v => update({ evRecessionIncomeCut: v })} min={0} max={60} suffix="%"/>
            </div>
          </div>

          {/* Bull market */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm text-green-400">Bull Market</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <EditableNum label="Probability (% pa)" value={localSettings.evBullMarketProb}
                onChange={v => update({ evBullMarketProb: v })} min={0} max={40} suffix="%"/>
              <EditableNum label="Portfolio gain (%)" value={localSettings.evBullMarketPct}
                onChange={v => update({ evBullMarketPct: v })} min={5} max={100} suffix="%"/>
            </div>
          </div>

          {/* Windfall */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm text-purple-400">Windfall / Inheritance</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <EditableNum label="Probability (% pa)" value={localSettings.evWindfallProb}
                onChange={v => update({ evWindfallProb: v })} min={0} max={20} suffix="%"/>
              <EditableNum label="Amount ($)" value={localSettings.evWindfallAmount}
                onChange={v => update({ evWindfallAmount: v })} min={1000} max={5000000} step={10000} prefix="$"/>
            </div>
          </div>

          {/* Large expense */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm text-pink-400">Large Unexpected Expense</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <EditableNum label="Probability (% pa)" value={localSettings.evLargeExpenseProb}
                onChange={v => update({ evLargeExpenseProb: v })} min={0} max={30} suffix="%"/>
              <EditableNum label="Amount ($)" value={localSettings.evLargeExpenseAmount}
                onChange={v => update({ evLargeExpenseAmount: v })} min={1000} max={500000} step={5000} prefix="$"/>
            </div>
          </div>

          {/* Stock/crypto correction params */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm text-blue-400">Stock Corrections &amp; Crypto Events</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <EditableNum label="Stock correction prob (% pa)" value={localSettings.stockCorrectionProb}
                onChange={v => update({ stockCorrectionProb: v })} min={0} max={50} suffix="%"/>
              <EditableNum label="Correction size (%)" value={localSettings.stockCorrectionSize}
                onChange={v => update({ stockCorrectionSize: v })} min={5} max={60} suffix="%"/>
              <EditableNum label="Crypto crash prob (% pa)" value={localSettings.cryptoCrashProb}
                onChange={v => update({ cryptoCrashProb: v })} min={0} max={70} suffix="%"/>
              <EditableNum label="Crypto crash size (%)" value={localSettings.cryptoCrashSize}
                onChange={v => update({ cryptoCrashSize: v })} min={10} max={95} suffix="%"/>
              <EditableNum label="Crypto bull prob (% pa)" value={localSettings.cryptoBullProb}
                onChange={v => update({ cryptoBullProb: v })} min={0} max={50} suffix="%"/>
              <EditableNum label="Crypto bull upside (%)" value={localSettings.cryptoBullUpside}
                onChange={v => update({ cryptoBullUpside: v })} min={10} max={1000} suffix="%"/>
            </div>
          </div>

          <SaveButton onClick={handleSave} status={saveStatus} label="Save Event Settings"/>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          TAB: SETTINGS
      ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'settings' && (
        <div className="space-y-4">

          {/* Preset selector */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="font-semibold text-sm mb-3">Apply Preset</h3>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PRESET_LABELS) as PresetKey[]).map(key => (
                <button key={key}
                  onClick={() => applyPresetToSettings(key)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:border-orange-400 transition-colors"
                  style={{ color: PRESET_COLORS[key] }}
                >
                  {PRESET_LABELS[key]}
                </button>
              ))}
            </div>
          </div>

          {/* Profile */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm">Profile</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <EditableNum label="Current Age" value={localSettings.currentAge}
                onChange={v => update({ currentAge: Math.round(v) })} min={20} max={60} step={1}/>
              <EditableNum label="Target FIRE Age" value={localSettings.targetFireAge}
                onChange={v => update({ targetFireAge: Math.round(v) })} min={localSettings.currentAge + 1} max={70} step={1}/>
              <EditableNum label="Target Passive Income ($/mo)" value={localSettings.targetPassiveMonthly}
                onChange={v => update({ targetPassiveMonthly: v })} min={1000} max={100000} step={500} prefix="$"/>
              <EditableNum label="Safe Withdrawal Rate (%)" value={localSettings.swrPct}
                onChange={v => update({ swrPct: v })} min={2} max={8} step={0.1} suffix="%"/>
            </div>
          </div>

          {/* Return assumptions */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm">Return Assumptions (mean % pa)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <EditableNum label="Stocks" value={localSettings.meanStockReturn}
                onChange={v => update({ meanStockReturn: v })} min={0} max={30} suffix="%"/>
              <EditableNum label="Property" value={localSettings.meanPropertyReturn}
                onChange={v => update({ meanPropertyReturn: v })} min={0} max={20} suffix="%"/>
              <EditableNum label="Crypto" value={localSettings.meanCryptoReturn}
                onChange={v => update({ meanCryptoReturn: v })} min={-50} max={200} suffix="%"/>
              <EditableNum label="Super" value={localSettings.meanSuperReturn}
                onChange={v => update({ meanSuperReturn: v })} min={0} max={20} suffix="%"/>
              <EditableNum label="Inflation" value={localSettings.meanInflation}
                onChange={v => update({ meanInflation: v })} min={0} max={15} suffix="%"/>
              <EditableNum label="Income Growth" value={localSettings.meanIncomeGrowth}
                onChange={v => update({ meanIncomeGrowth: v })} min={0} max={20} suffix="%"/>
              <EditableNum label="Expense Growth" value={localSettings.meanExpenseGrowth}
                onChange={v => update({ meanExpenseGrowth: v })} min={0} max={20} suffix="%"/>
              <EditableNum label="Mortgage Rate" value={localSettings.meanMortgageRate}
                onChange={v => update({ meanMortgageRate: v })} min={1} max={15} suffix="%"/>
            </div>
          </div>

          {/* Volatility */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm">Volatility (annual std dev %)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <EditableNum label="Stocks" value={localSettings.volStocks}
                onChange={v => update({ volStocks: v })} min={1} max={60} suffix="%"/>
              <EditableNum label="Property" value={localSettings.volProperty}
                onChange={v => update({ volProperty: v })} min={1} max={20} suffix="%"/>
              <EditableNum label="Crypto" value={localSettings.volCrypto}
                onChange={v => update({ volCrypto: v })} min={5} max={200} suffix="%"/>
              <EditableNum label="Super" value={localSettings.volSuper}
                onChange={v => update({ volSuper: v })} min={1} max={30} suffix="%"/>
              <EditableNum label="Inflation" value={localSettings.volInflation}
                onChange={v => update({ volInflation: v })} min={0.1} max={5} suffix="%"/>
            </div>
          </div>

          {/* Correlation matrix */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm">Correlation Matrix</h3>
            <p className="text-xs text-muted-foreground">Range: −1 (perfectly inverse) to +1 (perfectly correlated)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <EditableNum label="Stocks ↔ Crypto (ρ)" value={localSettings.rhoStocksCrypto}
                onChange={v => update({ rhoStocksCrypto: v })} min={-1} max={1} step={0.05}/>
              <EditableNum label="Inflation ↔ Rates (ρ)" value={localSettings.rhoInflationRates}
                onChange={v => update({ rhoInflationRates: v })} min={-1} max={1} step={0.05}/>
              <EditableNum label="Rates ↔ Property (ρ)" value={localSettings.rhoRatesProperty}
                onChange={v => update({ rhoRatesProperty: v })} min={-1} max={1} step={0.05}/>
              <EditableNum label="Stocks ↔ Property (ρ)" value={localSettings.rhoStocksProperty}
                onChange={v => update({ rhoStocksProperty: v })} min={-1} max={1} step={0.05}/>
            </div>
            {/* Visual correlation table */}
            <div className="mt-2 overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-muted-foreground p-2 border border-border">Asset</th>
                    {['Stocks', 'Crypto', 'Inflation', 'Property'].map(h => (
                      <th key={h} className="text-center text-muted-foreground p-2 border border-border">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Stocks',   1,                               localSettings.rhoStocksCrypto, 0, localSettings.rhoStocksProperty],
                    ['Crypto',   localSettings.rhoStocksCrypto,   1, 0, localSettings.rhoStocksProperty * 0.5],
                    ['Inflation',0,                               0, 1, localSettings.rhoInflationRates],
                    ['Property', localSettings.rhoStocksProperty, localSettings.rhoStocksProperty * 0.5, localSettings.rhoInflationRates, 1],
                  ].map(([label, ...vals]) => (
                    <tr key={label as string}>
                      <td className="p-2 border border-border font-medium">{label}</td>
                      {(vals as number[]).map((v, i) => {
                        const abs = Math.abs(v);
                        const bg = v === 1
                          ? 'bg-muted'
                          : v > 0
                          ? `rgba(34,197,94,${abs * 0.4})`
                          : `rgba(239,68,68,${abs * 0.4})`;
                        return (
                          <td key={i} className="text-center p-2 border border-border font-mono" style={{ background: v === 1 ? undefined : bg }}>
                            {typeof v === 'number' ? v.toFixed(2) : v}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Offset vs ETF */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm">Offset vs ETF Comparison</h3>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox"
                  checked={localSettings.compareOffsetVsEtf}
                  onChange={e => update({ compareOffsetVsEtf: e.target.checked })}
                  className="rounded"
                />
                Run parallel ETF simulation
              </label>
            </div>
            {localSettings.compareOffsetVsEtf && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <EditableNum label="ETF expected return (% pa)" value={localSettings.etfExpectedReturn}
                  onChange={v => update({ etfExpectedReturn: v })} min={0} max={30} suffix="%"/>
              </div>
            )}
          </div>

          {/* Property acquisition */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-sm">Future Property Acquisition (optional)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <EditableNum label="Buy Year (0 = none)" value={localSettings.propNextBuyYear ?? 0}
                onChange={v => update({ propNextBuyYear: v > 0 ? Math.round(v) : undefined })} min={0} max={2060} step={1}/>
              <EditableNum label="Purchase Price ($)" value={localSettings.propNextBuyPrice ?? 0}
                onChange={v => update({ propNextBuyPrice: v > 0 ? v : undefined })} min={0} max={5000000} step={10000} prefix="$"/>
              <EditableNum label="Deposit (%)" value={localSettings.propNextBuyDepositPct}
                onChange={v => update({ propNextBuyDepositPct: v })} min={5} max={100} suffix="%"/>
              <EditableNum label="Growth pa (%)" value={localSettings.propNextBuyGrowthPa}
                onChange={v => update({ propNextBuyGrowthPa: v })} min={0} max={20} suffix="%"/>
              <EditableNum label="Rent ($/pw)" value={localSettings.propNextRentPw}
                onChange={v => update({ propNextRentPw: v })} min={0} max={5000} step={50} prefix="$"/>
            </div>
          </div>

          <SaveButton onClick={handleSave} status={saveStatus} label="Save All Settings"/>
        </div>
      )}

    </div>
  );
}

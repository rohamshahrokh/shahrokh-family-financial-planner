/**
 * ai-forecast-engine.tsx — AI Forecast Engine (v2)
 * Route: /ai-forecast-engine
 *
 * Sections:
 *  1. Page header
 *  2. Forecast mode selector
 *  3. Year-by-Year table (year-by-year mode)
 *  4. MC Volatility Assumptions panel (monte-carlo mode)
 *  5. Run simulation button (monte-carlo mode)
 *  6. Probability results (monte-carlo)
 *  7. Fan chart (monte-carlo)
 *  8. Key risks + recommended actions (monte-carlo)
 *  9. Scenario comparison table (always)
 * 10. Model Assumptions Explained accordion (always)
 * 11. AI Insights card
 */

import { useEffect, useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAppStore } from "@/lib/store";
import { formatCurrency, safeNum } from "@/lib/finance";
import {
  useForecastStore,
  generateYearlyFromProfile,
  PROFILE_DEFAULTS,
  sbSaveMCResult,
  DEFAULT_MC_VOLATILITY,
  type YearAssumptions,
  type ForecastMode,
  type ForecastProfile,
  type MCVolatilityParams,
} from "@/lib/forecastStore";
import { runMonteCarlo } from "@/lib/monteCarloEngine";
import {
  ComposedChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Brain, Cpu, Zap, AlertTriangle, CheckCircle2, ArrowRight,
  RefreshCw, Save, BarChart3, Sliders, Layers, TrendingUp,
  TrendingDown, Target, DollarSign, Loader2, Clock, Sparkles,
  ShieldAlert, Activity, ChevronDown, ChevronRight, Home,
  TrendingUp as StocksIcon, Bitcoin, Wallet, CreditCard, Info,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { maskValue } from "@/components/PrivacyMask";
import AIInsightsCard from "@/components/AIInsightsCard";
import { useToast } from "@/hooks/use-toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtM(val: number): string {
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000)     return `$${(val / 1_000).toFixed(0)}k`;
  return `$${val.toFixed(0)}`;
}
function pct(val: number): string { return `${val.toFixed(1)}%`; }

// ─── Fan chart tooltip ────────────────────────────────────────────────────────

const FanTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs min-w-[170px]">
      <p className="text-muted-foreground mb-2 font-semibold">Year {d.year}</p>
      {[
        { k: 'p90', label: 'P90 (Best 10%)', color: 'text-emerald-400' },
        { k: 'p75', label: 'P75',             color: 'text-blue-400' },
        { k: 'median', label: 'Median',       color: 'text-yellow-400' },
        { k: 'p25', label: 'P25',             color: 'text-orange-400' },
        { k: 'p10', label: 'P10 (Worst 10%)', color: 'text-red-400' },
      ].map(({ k, label, color }) => (
        <p key={k} className="flex justify-between gap-4">
          <span className={color}>{label}</span>
          <span className="font-mono num-display">{fmtM(d[k] ?? 0)}</span>
        </p>
      ))}
    </div>
  );
};

// ─── Probability card ─────────────────────────────────────────────────────────

function ProbCard({ label, value, sub, icon, colorClass, bgClass }: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; colorClass: string; bgClass: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground font-medium leading-tight">{label}</p>
        <div className={`p-1.5 rounded-lg ${bgClass}`}>
          <div className={`w-4 h-4 ${colorClass}`}>{icon}</div>
        </div>
      </div>
      <p className={`text-xl font-bold num-display ${colorClass}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground leading-snug">{sub}</p>}
    </div>
  );
}

// ─── Year-by-Year input (uncontrolled, no focus loss) ─────────────────────────

function YearInput({ year, field, defaultValue, onCommit }: {
  year: number; field: keyof Omit<YearAssumptions, 'year'>;
  defaultValue: number; onCommit: (y: number, f: keyof Omit<YearAssumptions, 'year'>, v: number) => void;
}) {
  return (
    <Input
      type="number" step="0.1"
      defaultValue={defaultValue}
      key={`${year}-${field}-${defaultValue}`}
      onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onCommit(year, field, v); }}
      className="w-16 h-7 text-xs text-center font-mono bg-background border-border focus:border-primary"
    />
  );
}

// ─── Volatility param input ───────────────────────────────────────────────────

function VolInput({ label, value, onChange, suffix = '%', step = 1, hint }: {
  label: string; value: number; onChange: (v: number) => void;
  suffix?: string; step?: number; hint?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground font-medium leading-tight">{label}</label>
      <div className="flex items-center gap-1">
        <Input
          ref={ref}
          type="number"
          step={step}
          defaultValue={value}
          key={`${label}-${value}`}
          onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }}
          className="h-8 text-xs text-right font-mono bg-background border-border focus:border-primary w-24"
        />
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </div>
      {hint && <p className="text-xs text-muted-foreground/70 leading-tight">{hint}</p>}
    </div>
  );
}

// ─── Mode card ────────────────────────────────────────────────────────────────

function ModeCard({ active, onClick, icon, title, description, badge }: {
  active: boolean; onClick: () => void; icon: React.ReactNode;
  title: string; description: string; badge?: string;
}) {
  return (
    <button onClick={onClick} className={`w-full rounded-xl border p-4 text-left transition-all duration-150 ${
      active ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
             : 'border-border bg-card hover:border-primary/40 hover:bg-card/80'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className={`p-2 rounded-lg ${active ? 'bg-primary/20' : 'bg-muted/40'}`}>
          <div className={`w-5 h-5 ${active ? 'text-primary' : 'text-muted-foreground'}`}>{icon}</div>
        </div>
        {badge && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
          }`}>{badge}</span>
        )}
      </div>
      <p className={`mt-3 text-sm font-bold ${active ? 'text-foreground' : 'text-foreground/80'}`}>{title}</p>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
    </button>
  );
}

// ─── Accordion item ───────────────────────────────────────────────────────────

function AccordionItem({ icon, title, color, children }: {
  icon: React.ReactNode; title: string; color: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl border ${color} overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex-shrink-0">{icon}</div>
        <span className="text-sm font-semibold text-foreground flex-1">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
               : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 text-xs text-muted-foreground space-y-2 leading-relaxed border-t border-border/40">
          {children}
        </div>
      )}
    </div>
  );
}

function ExplainRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-primary font-semibold shrink-0">→</span>
      <span><span className="text-foreground/80 font-medium">{label}:</span> {detail}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AIForecastEnginePage() {
  const { toast } = useToast();
  const { privacyMode } = useAppStore();

  const {
    forecastMode, setForecastMode,
    profile, setProfile,
    yearlyAssumptions, setYearAssumption, generateFromProfile,
    monteCarloResult, setMonteCarloResult,
    isRunningMC, setIsRunningMC,
    isSaving, saveToSupabase,
    loadFromSupabase,
    mcVolatility, setMCVolatility, resetMCVolatility,
  } = useForecastStore();

  useEffect(() => { loadFromSupabase().catch(() => {}); }, []); // eslint-disable-line

  // ── Data queries ──────────────────────────────────────────────────────────────
  const { data: snapshot }            = useQuery<any>({ queryKey: ['/api/snapshot'],              queryFn: () => apiRequest('GET', '/api/snapshot').then(r => r.json()) });
  const { data: properties = [] }     = useQuery<any[]>({ queryKey: ['/api/properties'],          queryFn: () => apiRequest('GET', '/api/properties').then(r => r.json()) });
  const { data: stocks = [] }         = useQuery<any[]>({ queryKey: ['/api/stocks'],              queryFn: () => apiRequest('GET', '/api/stocks').then(r => r.json()) });
  const { data: cryptos = [] }        = useQuery<any[]>({ queryKey: ['/api/crypto'],              queryFn: () => apiRequest('GET', '/api/crypto').then(r => r.json()) });
  const { data: stockTx = [] }        = useQuery<any[]>({ queryKey: ['/api/stock-transactions'],  queryFn: () => apiRequest('GET', '/api/stock-transactions').then(r => r.json()) });
  const { data: cryptoTx = [] }       = useQuery<any[]>({ queryKey: ['/api/crypto-transactions'], queryFn: () => apiRequest('GET', '/api/crypto-transactions').then(r => r.json()) });
  const { data: bills = [] }          = useQuery<any[]>({ queryKey: ['/api/bills'],               queryFn: () => apiRequest('GET', '/api/bills').then(r => r.json()) });
  const { data: stockDCA = [] }       = useQuery<any[]>({ queryKey: ['/api/stock-dca'],           queryFn: () => apiRequest('GET', '/api/stock-dca').then(r => r.json()) });
  const { data: cryptoDCA = [] }      = useQuery<any[]>({ queryKey: ['/api/crypto-dca'],          queryFn: () => apiRequest('GET', '/api/crypto-dca').then(r => r.json()) });
  const { data: plannedStock = [] }   = useQuery<any[]>({ queryKey: ['/api/planned-stock-orders'],  queryFn: () => apiRequest('GET', '/api/planned-stock-orders').then(r => r.json()) });
  const { data: plannedCrypto = [] }  = useQuery<any[]>({ queryKey: ['/api/planned-crypto-orders'], queryFn: () => apiRequest('GET', '/api/planned-crypto-orders').then(r => r.json()) });

  // ── Run Monte Carlo ──────────────────────────────────────────────────────────
  const handleRunMC = useCallback(() => {
    if (isRunningMC) return;
    setIsRunningMC(true);
    setTimeout(() => {
      try {
        const snap = snapshot ?? {};
        const result = runMonteCarlo({
          snapshot: {
            ppor: safeNum(snap.ppor), cash: safeNum(snap.cash),
            super_balance: safeNum(snap.super_balance), stocks: safeNum(snap.stocks),
            crypto: safeNum(snap.crypto), cars: safeNum(snap.cars),
            iran_property: safeNum(snap.iran_property), mortgage: safeNum(snap.mortgage),
            other_debts: safeNum(snap.other_debts), monthly_income: safeNum(snap.monthly_income),
            monthly_expenses: safeNum(snap.monthly_expenses),
          },
          properties, stocks, cryptos,
          stockTransactions: stockTx, cryptoTransactions: cryptoTx,
          stockDCASchedules: stockDCA, cryptoDCASchedules: cryptoDCA,
          plannedStockOrders: plannedStock, plannedCryptoOrders: plannedCrypto,
          bills, yearlyAssumptions, simulations: 1000,
          volatilityParams: mcVolatility,
        });
        setMonteCarloResult(result);
        sbSaveMCResult(result).catch(() => {});
        toast({ title: 'Simulation Complete', description: `1,000 paths. Median 2035: ${fmtM(result.median)}` });
      } catch (err) {
        toast({ title: 'Simulation Error', description: String(err), variant: 'destructive' });
      } finally {
        setIsRunningMC(false);
      }
    }, 50);
  }, [isRunningMC, snapshot, properties, stocks, cryptos, stockTx, cryptoTx, stockDCA, cryptoDCA,
      plannedStock, plannedCrypto, bills, yearlyAssumptions, mcVolatility, setIsRunningMC, setMonteCarloResult, toast]);

  const handleSave = useCallback(async () => {
    await saveToSupabase();
    toast({ title: 'Saved Successfully', description: 'Assumptions saved to cloud.' });
  }, [saveToSupabase, toast]);

  const mc = monteCarloResult;
  const fanData = mc?.fan_data ?? [];

  const modeBadge = {
    'profile':      { label: 'Profile Mode',  color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    'year-by-year': { label: 'Year-by-Year',   color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
    'monte-carlo':  { label: 'Monte Carlo',    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  }[forecastMode];

  const COLUMNS: Array<{ key: keyof Omit<YearAssumptions, 'year'>; label: string }> = [
    { key: 'property_growth',  label: 'Prop %' },
    { key: 'stocks_return',    label: 'Stocks %' },
    { key: 'crypto_return',    label: 'Crypto %' },
    { key: 'super_return',     label: 'Super %' },
    { key: 'cash_return',      label: 'Cash %' },
    { key: 'inflation',        label: 'Inflation %' },
    { key: 'income_growth',    label: 'Income Gr %' },
    { key: 'expense_growth',   label: 'Expense Gr %' },
    { key: 'interest_rate',    label: 'Interest Rate %' },
    { key: 'rent_growth',      label: 'Rent Gr %' },
  ];

  const profilePresets: Record<ForecastProfile, { prop: string; stocks: string; crypto: string; inflation: string; label: string; notes: string }> = {
    conservative: { prop: '4%', stocks: '6%',  crypto: '5%',  inflation: '3.5%', label: 'Conservative', notes: 'Lower risk, steady growth' },
    moderate:     { prop: '6%', stocks: '10%', crypto: '20%', inflation: '3.0%', label: 'Moderate',     notes: 'Balanced baseline' },
    aggressive:   { prop: '9%', stocks: '15%', crypto: '40%', inflation: '2.5%', label: 'Aggressive',   notes: 'High risk, high upside' },
  };

  const getAIData = useCallback(() => ({
    forecastMode, profile,
    monteCarloResult: mc ? {
      median: mc.median, p10: mc.p10, p90: mc.p90, prob_ff: mc.prob_ff,
      prob_5m: mc.prob_5m, prob_neg_cf: mc.prob_neg_cf,
      key_risks: mc.key_risks, recommended_actions: mc.recommended_actions,
    } : null,
    yearlyAssumptions: yearlyAssumptions.slice(0, 3),
    mcVolatility,
  }), [forecastMode, profile, mc, yearlyAssumptions, mcVolatility]);

  return (
    <div className="flex flex-col gap-6 pb-10">

      {/* ── 1. Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/15 border border-primary/25">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              AI Forecast Engine <Cpu className="w-4 h-4 text-muted-foreground" />
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Realistic asset-class model · Monte Carlo simulations · Year-by-Year assumptions
            </p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${modeBadge.color}`}>
          {modeBadge.label}
        </span>
      </div>

      {/* ── 2. Forecast Mode Selector ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sliders className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Forecast Mode</h2>
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Save className="w-3 h-3" />Mode saved automatically
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ModeCard active={forecastMode === 'profile'} onClick={() => setForecastMode('profile')}
            icon={<Layers className="w-full h-full" />} title="Profile Mode" badge="Preset"
            description="Use Conservative, Moderate, or Aggressive return presets across all asset classes." />
          <ModeCard active={forecastMode === 'year-by-year'} onClick={() => setForecastMode('year-by-year')}
            icon={<BarChart3 className="w-full h-full" />} title="Year-by-Year Mode" badge="Advanced"
            description="Set custom % for each year 2026–2035 across every asset class and economic variable." />
          <ModeCard active={forecastMode === 'monte-carlo'} onClick={() => setForecastMode('monte-carlo')}
            icon={<Activity className="w-full h-full" />} title="Monte Carlo" badge="Simulation"
            description="1,000 probability simulations with realistic crash/bull events, vacancy, rate shocks. Fan chart + probabilities." />
        </div>

        {forecastMode === 'profile' && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground mb-3 font-medium">Select scenario profile:</p>
            <div className="flex flex-wrap gap-2">
              {(['conservative', 'moderate', 'aggressive'] as ForecastProfile[]).map(p => (
                <button key={p} onClick={() => { setProfile(p); generateFromProfile(p); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-150 ${
                    profile === p ? 'border-primary bg-primary/15 text-primary'
                                  : 'border-border bg-background text-muted-foreground hover:border-primary/40'
                  }`}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Property Growth', val: PROFILE_DEFAULTS[profile].property_growth },
                { label: 'Stocks Return',   val: PROFILE_DEFAULTS[profile].stocks_return },
                { label: 'Crypto Return',   val: PROFILE_DEFAULTS[profile].crypto_return },
                { label: 'Inflation',       val: PROFILE_DEFAULTS[profile].inflation },
              ].map(({ label, val }) => (
                <div key={label} className="rounded-lg bg-background border border-border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-base font-bold text-primary num-display mt-0.5">{val}%</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── 3. Year-by-Year Table ──────────────────────────────────────────────── */}
      {forecastMode === 'year-by-year' && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Year-by-Year Assumptions (2026–2035)</h2>
            <div className="ml-auto flex flex-wrap gap-2">
              {(['conservative', 'moderate', 'aggressive'] as ForecastProfile[]).map(p => (
                <Button key={p} size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => generateFromProfile(p)}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Button>
              ))}
              <Button size="sm" variant="outline" className="h-7 text-xs"
                onClick={() => generateFromProfile('moderate')}>
                <RefreshCw className="w-3 h-3 mr-1" />Reset
              </Button>
              <Button size="sm" className="h-7 text-xs bg-primary text-primary-foreground"
                onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                Save to Cloud
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-semibold w-12 sticky left-0 bg-card z-10">Year</th>
                  {COLUMNS.map(col => (
                    <th key={col.key} className="text-center py-2 px-1 text-muted-foreground font-semibold whitespace-nowrap">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {yearlyAssumptions.map((row, idx) => (
                  <tr key={row.year} className={`border-b border-border/50 ${idx % 2 === 0 ? 'bg-background/30' : 'bg-card'}`}>
                    <td className={`py-1.5 px-2 sticky left-0 z-10 font-medium ${idx % 2 === 0 ? 'bg-background/30' : 'bg-card'} ${row.year === 2035 ? 'text-primary' : 'text-muted-foreground'}`}>
                      {row.year}
                    </td>
                    {COLUMNS.map(col => (
                      <td key={col.key} className="py-1.5 px-1 text-center">
                        <YearInput year={row.year} field={col.key} defaultValue={row[col.key]} onCommit={setYearAssumption} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <Zap className="w-3 h-3 text-primary" />
            Values commit on blur and instantly update all forecast pages.
          </p>
        </div>
      )}

      {/* ── 4. MC Volatility Assumptions Panel ────────────────────────────────── */}
      {forecastMode === 'monte-carlo' && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <Sliders className="w-4 h-4 text-purple-400" />
            <h2 className="text-sm font-bold text-foreground">Monte Carlo Assumptions</h2>
            <span className="ml-auto text-xs text-muted-foreground">All changes take effect on next Run</span>
            <Button size="sm" variant="outline" className="h-7 text-xs ml-2"
              onClick={() => resetMCVolatility()}>
              <RotateCcw className="w-3 h-3 mr-1" />Reset Defaults
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            These parameters control how each asset class is modelled in the 1,000 simulations.
            Higher volatility = wider fan chart. Crash/bull events are drawn independently each year.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

            {/* Property */}
            <div className="rounded-lg border border-amber-700/30 bg-amber-900/10 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-1">
                <Home className="w-4 h-4 text-amber-400" />
                <p className="text-sm font-bold text-amber-300">Property</p>
              </div>
              <VolInput label="Annual Volatility" value={mcVolatility.prop_volatility}
                onChange={v => setMCVolatility({ prop_volatility: v })}
                hint="Std dev of annual capital growth" />
              <VolInput label="Vacancy Rate" value={mcVolatility.prop_vacancy_rate}
                onChange={v => setMCVolatility({ prop_vacancy_rate: v })}
                hint="% of time stochastically vacant" />
              <VolInput label="Maintenance % of Value p.a." value={mcVolatility.prop_maintenance_pct}
                onChange={v => setMCVolatility({ prop_maintenance_pct: v })}
                hint="Ongoing upkeep cost" />
              <VolInput label="Purchase Cost %" value={mcVolatility.prop_purchase_cost_pct}
                onChange={v => setMCVolatility({ prop_purchase_cost_pct: v })}
                hint="Stamp duty + legal fees as % of price" />
            </div>

            {/* Stocks */}
            <div className="rounded-lg border border-blue-700/30 bg-blue-900/10 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <p className="text-sm font-bold text-blue-300">Stocks</p>
              </div>
              <VolInput label="Annual Volatility" value={mcVolatility.stock_volatility}
                onChange={v => setMCVolatility({ stock_volatility: v })}
                hint="Std dev of annual return" />
              <VolInput label="Correction Probability" value={mcVolatility.stock_correction_prob}
                onChange={v => setMCVolatility({ stock_correction_prob: v })}
                hint="% chance of ≥20% drop in any year" />
              <VolInput label="Correction Size" value={mcVolatility.stock_correction_size}
                onChange={v => setMCVolatility({ stock_correction_size: v })}
                hint="Typical correction magnitude %" />
            </div>

            {/* Crypto */}
            <div className="rounded-lg border border-orange-700/30 bg-orange-900/10 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-1">
                <Bitcoin className="w-4 h-4 text-orange-400" />
                <p className="text-sm font-bold text-orange-300">Crypto</p>
              </div>
              <VolInput label="Annual Volatility" value={mcVolatility.crypto_volatility}
                onChange={v => setMCVolatility({ crypto_volatility: v })}
                hint="Std dev of annual return" />
              <VolInput label="Crash Probability" value={mcVolatility.crypto_crash_prob}
                onChange={v => setMCVolatility({ crypto_crash_prob: v })}
                hint="% chance of ≥50% crash in any year" />
              <VolInput label="Crash Size" value={mcVolatility.crypto_crash_size}
                onChange={v => setMCVolatility({ crypto_crash_size: v })}
                hint="Typical crash magnitude %" />
              <VolInput label="Bull-Run Probability" value={mcVolatility.crypto_bull_prob}
                onChange={v => setMCVolatility({ crypto_bull_prob: v })}
                hint="% chance of ≥100% bull run in any year" />
              <VolInput label="Bull-Run Upside" value={mcVolatility.crypto_bull_upside}
                onChange={v => setMCVolatility({ crypto_bull_upside: v })}
                hint="Typical bull-run magnitude %" />
            </div>

            {/* Cash */}
            <div className="rounded-lg border border-emerald-700/30 bg-emerald-900/10 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="w-4 h-4 text-emerald-400" />
                <p className="text-sm font-bold text-emerald-300">Cash</p>
              </div>
              <VolInput label="Cash Interest Rate" value={mcVolatility.cash_interest_rate}
                onChange={v => setMCVolatility({ cash_interest_rate: v })}
                hint="Savings account / HISA rate" />
              <VolInput label="Emergency Buffer" value={mcVolatility.emergency_buffer}
                onChange={v => setMCVolatility({ emergency_buffer: v })}
                suffix="$" step={1000}
                hint="Target minimum cash at all times" />
              <VolInput label="Inflation Volatility" value={mcVolatility.inflation_volatility}
                onChange={v => setMCVolatility({ inflation_volatility: v })}
                hint="Std dev around base inflation rate" />
            </div>

            {/* Debt */}
            <div className="rounded-lg border border-red-700/30 bg-red-900/10 p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-1">
                <CreditCard className="w-4 h-4 text-red-400" />
                <p className="text-sm font-bold text-red-300">Debt / Interest Rate</p>
              </div>
              <VolInput label="Rate Shock Probability" value={mcVolatility.rate_shock_prob}
                onChange={v => setMCVolatility({ rate_shock_prob: v })}
                hint="% chance of 1%+ RBA rate rise in any year" />
              <VolInput label="Rate Shock Size" value={mcVolatility.rate_shock_size}
                onChange={v => setMCVolatility({ rate_shock_size: v })}
                hint="Additional rate % added on shock year" />
            </div>

          </div>
        </div>
      )}

      {/* ── 5. Run Simulation ──────────────────────────────────────────────────── */}
      {forecastMode === 'monte-carlo' && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Run Monte Carlo Simulation</h2>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Button size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 min-w-[280px]"
              onClick={handleRunMC} disabled={isRunningMC}>
              {isRunningMC ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Running 1,000 simulations…</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" />Run 1,000 Monte Carlo Simulations</>
              )}
            </Button>
            <div className="flex flex-col gap-1">
              {mc && (
                <>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    Last run: {new Date(mc.ran_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                    {mc.simulations.toLocaleString()} simulations complete
                  </span>
                </>
              )}
              {!mc && !isRunningMC && (
                <p className="text-xs text-muted-foreground">No simulation yet. Adjust assumptions above, then run.</p>
              )}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Paths', val: '1,000 simulations' },
              { label: 'Horizon', val: '2026–2035 (10 years)' },
              { label: 'Step size', val: 'Monthly (120 steps)' },
            ].map(({ label, val }) => (
              <div key={label} className="rounded-lg bg-background/50 border border-border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-bold text-foreground num-display mt-0.5">{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 6. Probability Results ─────────────────────────────────────────────── */}
      {mc && forecastMode === 'monte-carlo' && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Probability Results — Year 2035</h2>
            <span className="ml-auto px-2 py-0.5 rounded-full text-xs bg-primary/15 text-primary border border-primary/25">
              {mc.simulations.toLocaleString()} simulations
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ProbCard label="Median Net Worth 2035" value={maskValue(fmtM(mc.median), privacyMode)}
              sub="50th percentile outcome" icon={<DollarSign className="w-full h-full" />}
              colorClass="text-emerald-400" bgClass="bg-emerald-500/15" />
            <ProbCard label="P10 — Bad Case" value={maskValue(fmtM(mc.p10), privacyMode)}
              sub="Worst 10% of outcomes" icon={<TrendingDown className="w-full h-full" />}
              colorClass="text-red-400" bgClass="bg-red-500/15" />
            <ProbCard label="P90 — Best Case" value={maskValue(fmtM(mc.p90), privacyMode)}
              sub="Best 10% of outcomes" icon={<TrendingUp className="w-full h-full" />}
              colorClass="text-emerald-400" bgClass="bg-emerald-500/15" />
            <ProbCard label="Financial Freedom" value={pct(mc.prob_ff)}
              sub="Passive income ≥ $120k/yr by 2035" icon={<Sparkles className="w-full h-full" />}
              colorClass="text-primary" bgClass="bg-primary/15" />
            <ProbCard label="Reach $3M Net Worth" value={pct(mc.prob_3m)}
              sub="Probability of $3M+ by 2035" icon={<Target className="w-full h-full" />}
              colorClass="text-teal-400" bgClass="bg-teal-500/15" />
            <ProbCard label="Reach $5M Net Worth" value={pct(mc.prob_5m)}
              sub="Probability of $5M+ by 2035" icon={<Target className="w-full h-full" />}
              colorClass="text-blue-400" bgClass="bg-blue-500/15" />
            <ProbCard label="Reach $10M Net Worth" value={pct(mc.prob_10m)}
              sub="Probability of $10M+ by 2035" icon={<Target className="w-full h-full" />}
              colorClass="text-purple-400" bgClass="bg-purple-500/15" />
            <ProbCard label="Negative Cashflow Risk" value={pct(mc.prob_neg_cf)}
              sub="Sims with ≥1 negative cashflow year"
              icon={<ShieldAlert className="w-full h-full" />}
              colorClass={mc.prob_neg_cf > 30 ? 'text-red-400' : 'text-orange-400'}
              bgClass={mc.prob_neg_cf > 30 ? 'bg-red-500/15' : 'bg-orange-500/15'} />
            <ProbCard label="Cash Shortfall Risk" value={pct(mc.prob_cash_shortfall)}
              sub={`Cash ever below $${(mcVolatility.emergency_buffer / 1000).toFixed(0)}k emergency buffer`}
              icon={<Wallet className="w-full h-full" />}
              colorClass={mc.prob_cash_shortfall > 30 ? 'text-red-400' : 'text-amber-400'}
              bgClass={mc.prob_cash_shortfall > 30 ? 'bg-red-500/15' : 'bg-amber-500/15'} />
            <ProbCard label="Median Lowest Cash" value={maskValue(fmtM(mc.lowest_cash_median), privacyMode)}
              sub="Median of minimum cash across all paths" icon={<Wallet className="w-full h-full" />}
              colorClass={mc.lowest_cash_median < mcVolatility.emergency_buffer ? 'text-red-400' : 'text-emerald-400'}
              bgClass={mc.lowest_cash_median < mcVolatility.emergency_buffer ? 'bg-red-500/15' : 'bg-emerald-500/15'} />
            <ProbCard label="Highest Risk Year" value={String(mc.highest_risk_year)}
              sub="Year with most negative cashflow events" icon={<AlertTriangle className="w-full h-full" />}
              colorClass="text-amber-400" bgClass="bg-amber-500/15" />
            <ProbCard label="Biggest Risk Driver" value={mc.biggest_risk_driver}
              sub="Top portfolio risk factor identified" icon={<ShieldAlert className="w-full h-full" />}
              colorClass="text-orange-400" bgClass="bg-orange-500/15" />
          </div>
        </div>
      )}

      {/* ── 7. Fan Chart ───────────────────────────────────────────────────────── */}
      {mc?.fan_data && forecastMode === 'monte-carlo' && fanData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-primary" />
            Net Worth Probability Fan Chart — 2026–2035
          </h2>
          <p className="text-xs text-muted-foreground mt-1 mb-3">
            Shaded bands show the outcome distribution across {mc.simulations.toLocaleString()} simulations
          </p>
          <div className="flex flex-wrap gap-3 mb-3">
            {[
              { color: '#22c55e', label: 'P90 (Best 10%)' },
              { color: '#6366f1', label: 'P75' },
              { color: '#eab308', label: 'Median' },
              { color: '#f97316', label: 'P25' },
              { color: '#ef4444', label: 'P10 (Worst 10%)' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 rounded-full" style={{ background: color }} />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={fanData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <defs>
                {[
                  { id: 'p90Fill', color: '#22c55e' }, { id: 'p75Fill', color: '#6366f1' },
                  { id: 'p25Fill', color: '#f97316' }, { id: 'p10Fill', color: '#ef4444' },
                ].map(({ id, color }) => (
                  <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.12} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.03} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="year" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => fmtM(v)} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} axisLine={false} tickLine={false} width={75} />
              <Tooltip content={<FanTooltip />} />
              <Area type="monotone" dataKey="p90" fill="url(#p90Fill)" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="P90" />
              <Area type="monotone" dataKey="p75" fill="url(#p75Fill)" stroke="#6366f1" strokeWidth={1} dot={false} name="P75" />
              <Line type="monotone" dataKey="median" stroke="#eab308" strokeWidth={2.5} dot={false} name="Median" />
              <Area type="monotone" dataKey="p25" fill="url(#p25Fill)" stroke="#f97316" strokeWidth={1} dot={false} name="P25" />
              <Area type="monotone" dataKey="p10" fill="url(#p10Fill)" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="P10" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── 8. Key Risks + Recommended Actions ────────────────────────────────── */}
      {mc && forecastMode === 'monte-carlo' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-foreground">Key Risks Identified</h2>
            </div>
            <div className="flex flex-col gap-2">
              {mc.key_risks.map((risk, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/15">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground/90 leading-relaxed">{risk}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-foreground">Recommended Actions</h2>
            </div>
            <div className="flex flex-col gap-2">
              {mc.recommended_actions.map((action, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                  <ArrowRight className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-foreground/90 leading-relaxed">{action}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── 9. Scenario Comparison ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Scenario Comparison</h2>
          <span className="ml-auto text-xs text-muted-foreground">
            Active: <span className="text-primary font-medium capitalize">{profile}</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                {['Scenario','Prop Growth','Stocks','Crypto','Inflation','Notes'].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-xs text-muted-foreground font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(['conservative', 'moderate', 'aggressive'] as ForecastProfile[]).map(p => {
                const ps = profilePresets[p];
                const isActive = profile === p && forecastMode === 'profile';
                return (
                  <tr key={p} className={`border-b border-border/50 ${isActive ? 'bg-primary/8' : 'hover:bg-background/40'}`}>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold text-sm ${p === 'conservative' ? 'text-blue-400' : p === 'moderate' ? 'text-emerald-400' : 'text-orange-400'}`}>
                          {ps.label}
                        </span>
                        {isActive && <span className="px-1.5 py-0.5 rounded-full text-xs bg-primary/20 text-primary">Active</span>}
                      </div>
                    </td>
                    {[ps.prop, ps.stocks, ps.crypto, ps.inflation].map((v, i) => (
                      <td key={i} className="py-2.5 px-3 font-mono num-display text-foreground text-xs">{v}</td>
                    ))}
                    <td className="py-2.5 px-3 text-xs text-muted-foreground">{ps.notes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 10. Model Assumptions Explained ───────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Model Assumptions Explained</h2>
          <span className="ml-2 text-xs text-muted-foreground">Click any section to expand</span>
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          This explains exactly how each asset class is forecast in all three modes.
          Understanding these assumptions helps you tune the model to your expectations.
        </p>

        <div className="flex flex-col gap-3">

          {/* Cash */}
          <AccordionItem
            icon={<Wallet className="w-4 h-4 text-emerald-400" />}
            title="A) Cash Forecast"
            color="border-emerald-700/30 bg-emerald-900/5">
            <p className="mb-2">Cash is the net of all inflows and outflows each month. It is the most detailed part of the model.</p>
            <ExplainRow label="Income" detail="Your monthly income, growing by the Income Growth % each year from the assumptions table." />
            <ExplainRow label="Expenses" detail="Your monthly expenses, growing by the Expense Growth % rate — amplified by a small random inflation shock in Monte Carlo mode." />
            <ExplainRow label="Recurring Bills" detail="All active recurring bills (mortgage, utilities, subscriptions) are deducted monthly at their scheduled frequency." />
            <ExplainRow label="Planned Purchases" detail="Planned stock/crypto buys are deducted as a one-time cash outflow at the exact month you scheduled them." />
            <ExplainRow label="DCA Schedules" detail="All active DCA plans (weekly/fortnightly/monthly) are deducted from cash each month and added to the investment portfolio." />
            <ExplainRow label="Property Deposits" detail="When a property settlement occurs, deposit + stamp duty + legal fees are deducted from cash in that month." />
            <ExplainRow label="Cash Interest" detail="Positive cash balances earn interest at the Cash Interest Rate (default 4.5% p.a., compounded monthly)." />
            <ExplainRow label="Emergency Buffer" detail="In Monte Carlo mode, simulations are flagged when cash falls below your emergency buffer target. This feeds the Cash Shortfall probability." />
            <ExplainRow label="Inflation Effect" detail="Expenses are indexed to inflation every month. In Monte Carlo mode, inflation itself is also randomised (±0.5% std dev around the base rate)." />
          </AccordionItem>

          {/* Property */}
          <AccordionItem
            icon={<Home className="w-4 h-4 text-amber-400" />}
            title="B) Property Forecast"
            color="border-amber-700/30 bg-amber-900/5">
            <p className="mb-2">Each property is modelled individually using its own settings. PPOR and investment properties are handled separately.</p>
            <ExplainRow label="Capital Growth" detail="Property value compounds monthly at the annual Property Growth % from your assumptions. In MC mode, a random shock (default ±5% std dev) is added each month." />
            <ExplainRow label="Rental Income" detail="Weekly rent × 52 ÷ 12 = monthly rent. In Monte Carlo, each month has a stochastic vacancy draw — the probability of being vacant equals your Vacancy Rate / 12." />
            <ExplainRow label="Rental Growth" detail="Rent grows at the Rent Growth % annually, compounding from the rental start date." />
            <ExplainRow label="Management Fee" detail="Deducted as a percentage of gross rent each month." />
            <ExplainRow label="Maintenance" detail="In Monte Carlo mode, an annual maintenance cost (default 1% of property value) is deducted from cash monthly." />
            <ExplainRow label="Loan Repayment" detail="Monthly PI repayment is calculated from loan amount, interest rate, and loan term. Principal component is tracked and reduces the outstanding loan." />
            <ExplainRow label="Interest Rate" detail="The base interest rate comes from the assumptions table. In MC mode, a rate shock event (default 30% annual probability) can add 1.5% to the effective rate for that year." />
            <ExplainRow label="Settlement Costs" detail="Deposit + stamp duty + legal fees are deducted from cash when settlement occurs. Renovation costs are included if entered." />
          </AccordionItem>

          {/* Stocks */}
          <AccordionItem
            icon={<TrendingUp className="w-4 h-4 text-blue-400" />}
            title="C) Stocks Forecast"
            color="border-blue-700/30 bg-blue-900/5">
            <p className="mb-2">Stocks are modelled as a single portfolio value that compounds monthly with random returns.</p>
            <ExplainRow label="Expected Return" detail="The mean monthly return is derived from the Stocks Return % in your assumptions table. In Year-by-Year mode this can vary each year." />
            <ExplainRow label="Annual Volatility" detail="In Monte Carlo mode, monthly returns are drawn from a normal distribution with standard deviation = Annual Volatility / √12. Default: 18% p.a." />
            <ExplainRow label="Correction Events" detail="At the start of each simulated year, a random draw determines whether a market correction occurs (default 15% probability). If it does, an additional loss of ~30% is applied at once." />
            <ExplainRow label="DCA Schedules" detail="All active stock DCA plans are added to the portfolio each month. DCA contributions also exit the cash balance in the same month." />
            <ExplainRow label="Planned Buys/Sells" detail="Planned transactions are applied as one-off cash and portfolio adjustments at the scheduled date." />
            <ExplainRow label="Per-Asset Return" detail="On the Stocks page, each holding has its own Expected Return %. The portfolio-level projection uses this per-asset rate (falling back to global rate if zero)." />
          </AccordionItem>

          {/* Crypto */}
          <AccordionItem
            icon={<Bitcoin className="w-4 h-4 text-orange-400" />}
            title="D) Crypto Forecast"
            color="border-orange-700/30 bg-orange-900/5">
            <p className="mb-2">Crypto uses the same framework as stocks but with much higher volatility and asymmetric event draws.</p>
            <ExplainRow label="Expected Return" detail="Mean monthly return from the Crypto Return % in your assumptions table." />
            <ExplainRow label="High Volatility" detail="Monthly returns are drawn from a normal distribution with std dev = Annual Crypto Volatility / √12. Default: 60% p.a." />
            <ExplainRow label="Crash Events" detail="Each simulated year has a 25% (default) probability of a ≥50% crash. When triggered, a loss drawn from Normal(−65%, ±13%) is applied at January of that year." />
            <ExplainRow label="Bull-Run Events" detail="Crash and bull-run are mutually exclusive in the same year. Bull-run has 20% probability (default). A gain of ~150% is applied when triggered." />
            <ExplainRow label="DCA Schedules" detail="All active crypto DCA plans are added to the portfolio monthly." />
            <ExplainRow label="Planned Buys/Sells" detail="Executed as one-off cash adjustments at the scheduled date." />
          </AccordionItem>

          {/* Debt */}
          <AccordionItem
            icon={<CreditCard className="w-4 h-4 text-red-400" />}
            title="E) Debt Forecast"
            color="border-red-700/30 bg-red-900/5">
            <p className="mb-2">Debt is modelled as a principal balance that reduces over time as repayments are made.</p>
            <ExplainRow label="Interest Rate" detail="The base rate comes from the Interest Rate % in your assumptions table. This is used to calculate monthly repayments and remaining principal." />
            <ExplainRow label="Rate Shock" detail="In Monte Carlo mode, each year has a probability (default 30%) of experiencing a rate shock (+1.5% by default). This increases the effective repayment for that year and is applied to both PPOR and investment loans." />
            <ExplainRow label="PI Repayment" detail="Monthly repayments are calculated using the standard annuity formula: PMT = P × r(1+r)ⁿ / ((1+r)ⁿ−1). The principal portion reduces the outstanding loan balance." />
            <ExplainRow label="PPOR Mortgage" detail="The PPOR mortgage is tracked separately. The effective interest rate changes each year to reflect rate assumptions and shocks." />
            <ExplainRow label="Investment Loans" detail="Each investment property has its own loan balance, rate, and term — all modelled independently." />
            <ExplainRow label="Extra Repayments" detail="Any cash surplus from the monthly cashflow automatically reduces the cash balance (not automatically applied to loans — you would need to model this as a planned transaction)." />
          </AccordionItem>

        </div>
      </div>

      {/* ── 11. AI Insights Card ───────────────────────────────────────────────── */}
      <AIInsightsCard
        pageKey="ai-forecast-engine"
        pageLabel="AI Forecast Engine"
        getData={getAIData}
        defaultExpanded={false}
      />
    </div>
  );
}

/**
 * ai-forecast-engine.tsx — AI Forecast Engine
 * Route: /ai-forecast-engine
 *
 * Features:
 *  - Three forecast modes: Profile / Year-by-Year / Monte Carlo
 *  - Profile mode: Conservative / Moderate / Aggressive presets
 *  - Year-by-Year mode: Editable table for 2026–2035
 *  - Monte Carlo mode: 1,000 probability simulations with fan chart
 *  - Probability metrics: FF, $3M/$5M/$10M reach, negative cashflow risk
 *  - Fan chart: P10/P25/Median/P75/P90 bands
 *  - Key risks + recommended actions from simulation
 *  - Scenario comparison table
 *  - Cloud persistence via Supabase
 */

import { useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAppStore } from "@/lib/store";
import { formatCurrency, safeNum } from "@/lib/finance";
import {
  useForecastStore,
  generateYearlyFromProfile,
  PROFILE_DEFAULTS,
  sbSaveMCResult,
  type YearAssumptions,
  type ForecastMode,
  type ForecastProfile,
} from "@/lib/forecastStore";
import { runMonteCarlo } from "@/lib/monteCarloEngine";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Brain,
  Cpu,
  Zap,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Save,
  BarChart3,
  Sliders,
  Layers,
  TrendingUp,
  TrendingDown,
  Target,
  DollarSign,
  Loader2,
  Clock,
  Sparkles,
  ShieldAlert,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { maskValue } from "@/components/PrivacyMask";
import AIInsightsCard from "@/components/AIInsightsCard";
import { useToast } from "@/hooks/use-toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtM(val: number): string {
  if (Math.abs(val) >= 1_000_000)
    return `$${(val / 1_000_000).toFixed(2)}M`;
  if (Math.abs(val) >= 1_000)
    return `$${(val / 1_000).toFixed(0)}k`;
  return `$${val.toFixed(0)}`;
}

function pct(val: number): string {
  return `${val.toFixed(1)}%`;
}

// ─── Custom tooltip for fan chart ─────────────────────────────────────────────

const FanTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs min-w-[160px]">
      <p className="text-muted-foreground mb-2 font-semibold">Year {label}</p>
      <div className="space-y-1">
        <p className="flex justify-between gap-4">
          <span className="text-emerald-400">P90 (Best 10%)</span>
          <span className="font-mono num-display">{fmtM(data.p90 ?? 0)}</span>
        </p>
        <p className="flex justify-between gap-4">
          <span className="text-blue-400">P75</span>
          <span className="font-mono num-display">{fmtM(data.p75 ?? 0)}</span>
        </p>
        <p className="flex justify-between gap-4 font-semibold">
          <span className="text-yellow-400">Median</span>
          <span className="font-mono num-display">{fmtM(data.median ?? 0)}</span>
        </p>
        <p className="flex justify-between gap-4">
          <span className="text-orange-400">P25</span>
          <span className="font-mono num-display">{fmtM(data.p25 ?? 0)}</span>
        </p>
        <p className="flex justify-between gap-4">
          <span className="text-red-400">P10 (Worst 10%)</span>
          <span className="font-mono num-display">{fmtM(data.p10 ?? 0)}</span>
        </p>
      </div>
    </div>
  );
};

// ─── Probability metric card ───────────────────────────────────────────────────

interface ProbCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  colorClass: string;
  bgClass: string;
}

function ProbCard({ label, value, sub, icon, colorClass, bgClass }: ProbCardProps) {
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

// ─── Year-by-year input cell (uncontrolled to preserve focus) ─────────────────

interface YearInputProps {
  year: number;
  field: keyof Omit<YearAssumptions, "year">;
  defaultValue: number;
  onCommit: (year: number, field: keyof Omit<YearAssumptions, "year">, value: number) => void;
}

function YearInput({ year, field, defaultValue, onCommit }: YearInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <Input
      ref={ref}
      type="number"
      step="0.1"
      defaultValue={defaultValue}
      key={`${year}-${field}-${defaultValue}`}
      onBlur={(e) => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) onCommit(year, field, v);
      }}
      className="w-16 h-7 text-xs text-center font-mono bg-background border-border focus:border-primary"
    />
  );
}

// ─── Mode card ────────────────────────────────────────────────────────────────

interface ModeCardProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
}

function ModeCard({ active, onClick, icon, title, description, badge }: ModeCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition-all duration-150 ${
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border bg-card hover:border-primary/40 hover:bg-card/80"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`p-2 rounded-lg ${active ? "bg-primary/20" : "bg-muted/40"}`}>
          <div className={`w-5 h-5 ${active ? "text-primary" : "text-muted-foreground"}`}>
            {icon}
          </div>
        </div>
        {badge && (
          <span
            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {badge}
          </span>
        )}
      </div>
      <p className={`mt-3 text-sm font-bold ${active ? "text-foreground" : "text-foreground/80"}`}>
        {title}
      </p>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AIForecastEnginePage() {
  const { toast } = useToast();
  const { privacyMode } = useAppStore();

  const {
    forecastMode,
    setForecastMode,
    profile,
    setProfile,
    yearlyAssumptions,
    setYearAssumption,
    generateFromProfile,
    monteCarloResult,
    setMonteCarloResult,
    isRunningMC,
    setIsRunningMC,
    isSaving,
    saveToSupabase,
    loadFromSupabase,
  } = useForecastStore();

  // ── Load from Supabase on mount ──────────────────────────────────────────────
  useEffect(() => {
    loadFromSupabase().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Data queries ──────────────────────────────────────────────────────────────
  const { data: snapshot } = useQuery<any>({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot").then((r) => r.json()),
  });
  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ["/api/properties"],
    queryFn: () => apiRequest("GET", "/api/properties").then((r) => r.json()),
  });
  const { data: stocks = [] } = useQuery<any[]>({
    queryKey: ["/api/stocks"],
    queryFn: () => apiRequest("GET", "/api/stocks").then((r) => r.json()),
  });
  const { data: cryptos = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto"],
    queryFn: () => apiRequest("GET", "/api/crypto").then((r) => r.json()),
  });
  const { data: stockTransactions = [] } = useQuery<any[]>({
    queryKey: ["/api/stock-transactions"],
    queryFn: () => apiRequest("GET", "/api/stock-transactions").then((r) => r.json()),
  });
  const { data: cryptoTransactions = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto-transactions"],
    queryFn: () => apiRequest("GET", "/api/crypto-transactions").then((r) => r.json()),
  });
  const { data: bills = [] } = useQuery<any[]>({
    queryKey: ["/api/bills"],
    queryFn: () => apiRequest("GET", "/api/bills").then((r) => r.json()),
  });
  const { data: stockDCA = [] } = useQuery<any[]>({
    queryKey: ["/api/stock-dca"],
    queryFn: () => apiRequest("GET", "/api/stock-dca").then((r) => r.json()),
  });
  const { data: cryptoDCA = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto-dca"],
    queryFn: () => apiRequest("GET", "/api/crypto-dca").then((r) => r.json()),
  });
  const { data: plannedStockOrders = [] } = useQuery<any[]>({
    queryKey: ["/api/planned-stock-orders"],
    queryFn: () => apiRequest("GET", "/api/planned-stock-orders").then((r) => r.json()),
  });
  const { data: plannedCryptoOrders = [] } = useQuery<any[]>({
    queryKey: ["/api/planned-crypto-orders"],
    queryFn: () => apiRequest("GET", "/api/planned-crypto-orders").then((r) => r.json()),
  });

  // ── Run Monte Carlo ────────────────────────────────────────────────────────────
  const handleRunMonteCarlo = useCallback(() => {
    if (isRunningMC) return;
    setIsRunningMC(true);

    // Allow React to render the loading state before blocking computation
    setTimeout(() => {
      try {
        const snap = snapshot ?? {};
        const input = {
          snapshot: {
            ppor:              safeNum(snap.ppor),
            cash:              safeNum(snap.cash),
            super_balance:     safeNum(snap.super_balance),
            stocks:            safeNum(snap.stocks),
            crypto:            safeNum(snap.crypto),
            cars:              safeNum(snap.cars),
            iran_property:     safeNum(snap.iran_property),
            mortgage:          safeNum(snap.mortgage),
            other_debts:       safeNum(snap.other_debts),
            monthly_income:    safeNum(snap.monthly_income),
            monthly_expenses:  safeNum(snap.monthly_expenses),
          },
          properties:           properties,
          stocks:               stocks,
          cryptos:              cryptos,
          stockTransactions:    stockTransactions,
          cryptoTransactions:   cryptoTransactions,
          stockDCASchedules:    stockDCA,
          cryptoDCASchedules:   cryptoDCA,
          plannedStockOrders:   plannedStockOrders,
          plannedCryptoOrders:  plannedCryptoOrders,
          bills:                bills,
          yearlyAssumptions:    yearlyAssumptions,
          simulations:          1000,
        };
        const result = runMonteCarlo(input);
        setMonteCarloResult(result);
        sbSaveMCResult(result).catch(() => {});
      } catch (err) {
        console.error("Monte Carlo error:", err);
        toast({ title: "Simulation Error", description: String(err), variant: "destructive" });
      } finally {
        setIsRunningMC(false);
      }
    }, 50);
  }, [
    isRunningMC,
    snapshot,
    properties,
    stocks,
    cryptos,
    stockTransactions,
    cryptoTransactions,
    stockDCA,
    cryptoDCA,
    plannedStockOrders,
    plannedCryptoOrders,
    bills,
    yearlyAssumptions,
    setIsRunningMC,
    setMonteCarloResult,
    toast,
  ]);

  // ── Save assumptions ────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    await saveToSupabase();
    toast({ title: "Saved Successfully", description: "Assumptions saved to cloud." });
  }, [saveToSupabase, toast]);

  // ── Mode badge ───────────────────────────────────────────────────────────────
  const modeBadge = {
    "profile":      { label: "Profile Mode",     color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    "year-by-year": { label: "Year-by-Year",      color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
    "monte-carlo":  { label: "Monte Carlo",       color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  }[forecastMode];

  // ── Profile presets display ──────────────────────────────────────────────────
  const profilePresets: Record<ForecastProfile, { prop: string; stocks: string; crypto: string; inflation: string; label: string; notes: string }> = {
    conservative: { prop: "4%", stocks: "6%", crypto: "5%", inflation: "3.5%", label: "Conservative", notes: "Lower risk, steady growth" },
    moderate:     { prop: "6%", stocks: "10%", crypto: "20%", inflation: "3.0%", label: "Moderate",     notes: "Balanced baseline" },
    aggressive:   { prop: "9%", stocks: "15%", crypto: "40%", inflation: "2.5%", label: "Aggressive",   notes: "High risk, high upside" },
  };

  // ── Table columns ─────────────────────────────────────────────────────────────
  const COLUMNS: Array<{ key: keyof Omit<YearAssumptions, "year">; label: string }> = [
    { key: "property_growth",  label: "Prop %" },
    { key: "stocks_return",    label: "Stocks %" },
    { key: "crypto_return",    label: "Crypto %" },
    { key: "super_return",     label: "Super %" },
    { key: "cash_return",      label: "Cash %" },
    { key: "inflation",        label: "Inflation %" },
    { key: "income_growth",    label: "Income Growth %" },
    { key: "expense_growth",   label: "Expense Growth %" },
    { key: "interest_rate",    label: "Interest Rate %" },
    { key: "rent_growth",      label: "Rent Growth %" },
  ];

  // ── Fan chart data transform ──────────────────────────────────────────────────
  const fanData = monteCarloResult?.fan_data ?? [];

  // ── AI insights data ─────────────────────────────────────────────────────────
  const getAIData = useCallback(() => ({
    forecastMode,
    profile,
    monteCarloResult: monteCarloResult
      ? {
          median: monteCarloResult.median,
          p10: monteCarloResult.p10,
          p90: monteCarloResult.p90,
          prob_ff: monteCarloResult.prob_ff,
          prob_5m: monteCarloResult.prob_5m,
          prob_neg_cf: monteCarloResult.prob_neg_cf,
          key_risks: monteCarloResult.key_risks,
          recommended_actions: monteCarloResult.recommended_actions,
        }
      : null,
    yearlyAssumptions: yearlyAssumptions.slice(0, 3),
  }), [forecastMode, profile, monteCarloResult, yearlyAssumptions]);

  return (
    <div className="flex flex-col gap-6 pb-10">

      {/* ── Section 1: Page Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/15 border border-primary/25">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              AI Forecast Engine
              <Cpu className="w-4 h-4 text-muted-foreground" />
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Monte Carlo simulations · Year-by-Year assumptions · Integrated with all forecasts
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${modeBadge.color}`}>
            {modeBadge.label}
          </span>
        </div>
      </div>

      {/* ── Section 2: Forecast Mode Selector ───────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sliders className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Forecast Mode</h2>
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Save className="w-3 h-3" />
            Mode + assumptions saved to cloud automatically
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ModeCard
            active={forecastMode === "profile"}
            onClick={() => setForecastMode("profile")}
            icon={<Layers className="w-full h-full" />}
            title="Profile Mode"
            description="Use Conservative, Moderate, or Aggressive return presets across all asset classes."
            badge="Preset"
          />
          <ModeCard
            active={forecastMode === "year-by-year"}
            onClick={() => setForecastMode("year-by-year")}
            icon={<BarChart3 className="w-full h-full" />}
            title="Year-by-Year Mode"
            description="Set custom % for each year 2026–2035 across every asset class and economic variable."
            badge="Advanced"
          />
          <ModeCard
            active={forecastMode === "monte-carlo"}
            onClick={() => setForecastMode("monte-carlo")}
            icon={<Activity className="w-full h-full" />}
            title="Monte Carlo"
            description="1,000 probability simulations with random return shocks. Generates fan chart + probability metrics."
            badge="Simulation"
          />
        </div>

        {/* Profile sub-selector (only when profile mode active) */}
        {forecastMode === "profile" && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground mb-3 font-medium">Select scenario profile:</p>
            <div className="flex flex-wrap gap-2">
              {(["conservative", "moderate", "aggressive"] as ForecastProfile[]).map((p) => (
                <button
                  key={p}
                  onClick={() => { setProfile(p); generateFromProfile(p); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all duration-150 ${
                    profile === p
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-background text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>

            {/* Show preset summary for active profile */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Property Growth", val: PROFILE_DEFAULTS[profile].property_growth },
                { label: "Stocks Return",   val: PROFILE_DEFAULTS[profile].stocks_return },
                { label: "Crypto Return",   val: PROFILE_DEFAULTS[profile].crypto_return },
                { label: "Inflation",       val: PROFILE_DEFAULTS[profile].inflation },
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

      {/* ── Section 3: Year-by-Year Assumptions Table ───────────────────────────── */}
      {forecastMode === "year-by-year" && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Year-by-Year Assumptions (2026–2035)</h2>
            <div className="ml-auto flex flex-wrap gap-2">
              {(["conservative", "moderate", "aggressive"] as ForecastProfile[]).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => generateFromProfile(p)}
                >
                  Generate from {p.charAt(0).toUpperCase() + p.slice(1)}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => generateFromProfile("moderate")}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Reset
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs bg-primary text-primary-foreground"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                ) : (
                  <Save className="w-3 h-3 mr-1" />
                )}
                Save to Cloud
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 text-muted-foreground font-semibold w-12 sticky left-0 bg-card z-10">
                    Year
                  </th>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className="text-center py-2 px-1 text-muted-foreground font-semibold whitespace-nowrap"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {yearlyAssumptions.map((row, idx) => (
                  <tr
                    key={row.year}
                    className={`border-b border-border/50 transition-colors ${
                      idx % 2 === 0 ? "bg-background/30" : "bg-card"
                    } ${row.year === 2035 ? "font-bold" : ""}`}
                  >
                    <td className={`py-1.5 px-2 sticky left-0 z-10 ${idx % 2 === 0 ? "bg-background/30" : "bg-card"} ${row.year === 2035 ? "font-bold text-primary" : "text-muted-foreground"}`}>
                      {row.year}
                    </td>
                    {COLUMNS.map((col) => (
                      <td key={col.key} className="py-1.5 px-1 text-center">
                        <YearInput
                          year={row.year}
                          field={col.key}
                          defaultValue={row[col.key]}
                          onCommit={setYearAssumption}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <Zap className="w-3 h-3 text-primary" />
            Values apply onBlur. All changes are applied immediately to forecast calculations.
          </p>
        </div>
      )}

      {/* ── Section 4: Run Simulation ─────────────────────────────────────────── */}
      {forecastMode === "monte-carlo" && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Monte Carlo Simulation</h2>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-8 min-w-[260px]"
              onClick={handleRunMonteCarlo}
              disabled={isRunningMC}
            >
              {isRunningMC ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running 1,000 simulations…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Run Monte Carlo Simulation
                </>
              )}
            </Button>

            <div className="flex flex-col gap-1">
              {monteCarloResult && (
                <>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    Last run:{" "}
                    {new Date(monteCarloResult.ran_at).toLocaleString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                      {monteCarloResult.simulations.toLocaleString()} simulations ran
                    </span>
                  </div>
                </>
              )}
              {!monteCarloResult && !isRunningMC && (
                <p className="text-xs text-muted-foreground">
                  No simulation run yet. Click the button to start.
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg bg-background/50 border border-border p-3">
              <p className="text-xs text-muted-foreground">Simulation count</p>
              <p className="text-base font-bold text-foreground num-display mt-0.5">1,000 paths</p>
            </div>
            <div className="rounded-lg bg-background/50 border border-border p-3">
              <p className="text-xs text-muted-foreground">Time horizon</p>
              <p className="text-base font-bold text-foreground num-display mt-0.5">2026–2035</p>
            </div>
            <div className="rounded-lg bg-background/50 border border-border p-3">
              <p className="text-xs text-muted-foreground">Step size</p>
              <p className="text-base font-bold text-foreground num-display mt-0.5">Monthly (120 steps)</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 5: Probability Results ──────────────────────────────────────── */}
      {monteCarloResult && forecastMode === "monte-carlo" && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Probability Results — Year 2035</h2>
            <span className="ml-auto px-2 py-0.5 rounded-full text-xs bg-primary/15 text-primary border border-primary/25">
              {monteCarloResult.simulations.toLocaleString()} simulations
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Median NW */}
            <ProbCard
              label="Median Net Worth 2035"
              value={maskValue(fmtM(monteCarloResult.median), privacyMode)}
              sub="50th percentile outcome"
              icon={<DollarSign className="w-full h-full" />}
              colorClass="text-emerald-400"
              bgClass="bg-emerald-500/15"
            />
            {/* P10 bad case */}
            <ProbCard
              label="P10 — Bad Case"
              value={maskValue(fmtM(monteCarloResult.p10), privacyMode)}
              sub="Worst 10% of outcomes"
              icon={<TrendingDown className="w-full h-full" />}
              colorClass="text-red-400"
              bgClass="bg-red-500/15"
            />
            {/* P90 best case */}
            <ProbCard
              label="P90 — Best Case"
              value={maskValue(fmtM(monteCarloResult.p90), privacyMode)}
              sub="Best 10% of outcomes"
              icon={<TrendingUp className="w-full h-full" />}
              colorClass="text-emerald-400"
              bgClass="bg-emerald-500/15"
            />
            {/* Financial freedom */}
            <ProbCard
              label="Financial Freedom"
              value={pct(monteCarloResult.prob_ff)}
              sub="Passive income ≥ $120k/yr by 2035"
              icon={<Sparkles className="w-full h-full" />}
              colorClass="text-primary"
              bgClass="bg-primary/15"
            />
            {/* Reach $3M */}
            <ProbCard
              label="Reach $3M Net Worth"
              value={pct(monteCarloResult.prob_3m)}
              sub="Probability of $3M+ by 2035"
              icon={<Target className="w-full h-full" />}
              colorClass="text-teal-400"
              bgClass="bg-teal-500/15"
            />
            {/* Reach $5M */}
            <ProbCard
              label="Reach $5M Net Worth"
              value={pct(monteCarloResult.prob_5m)}
              sub="Probability of $5M+ by 2035"
              icon={<Target className="w-full h-full" />}
              colorClass="text-blue-400"
              bgClass="bg-blue-500/15"
            />
            {/* Reach $10M */}
            <ProbCard
              label="Reach $10M Net Worth"
              value={pct(monteCarloResult.prob_10m)}
              sub="Probability of $10M+ by 2035"
              icon={<Target className="w-full h-full" />}
              colorClass="text-purple-400"
              bgClass="bg-purple-500/15"
            />
            {/* Negative cashflow risk */}
            <ProbCard
              label="Negative Cashflow Risk"
              value={pct(monteCarloResult.prob_neg_cf)}
              sub="Sims with ≥1 negative cashflow year"
              icon={<ShieldAlert className="w-full h-full" />}
              colorClass={monteCarloResult.prob_neg_cf > 30 ? "text-red-400" : "text-orange-400"}
              bgClass={monteCarloResult.prob_neg_cf > 30 ? "bg-red-500/15" : "bg-orange-500/15"}
            />
          </div>
        </div>
      )}

      {/* ── Section 6: Fan Chart ──────────────────────────────────────────────── */}
      {monteCarloResult?.fan_data && forecastMode === "monte-carlo" && fanData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-1">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              Net Worth Probability Fan Chart — 2026–2035
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Shaded bands show the range of outcomes across {monteCarloResult.simulations.toLocaleString()} simulations
            </p>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-3 mb-2">
            {[
              { color: "#22c55e", label: "P90 (Best 10%)", dash: true },
              { color: "#6366f1", label: "P75", dash: false },
              { color: "#eab308", label: "Median", dash: false },
              { color: "#f97316", label: "P25", dash: false },
              { color: "#ef4444", label: "P10 (Worst 10%)", dash: true },
            ].map(({ color, label, dash }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div
                  className="w-5 h-0.5 rounded-full"
                  style={{
                    background: color,
                    borderTop: dash ? `2px dashed ${color}` : undefined,
                  }}
                />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>

          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={fanData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="p90Fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.10} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id="p75Fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="p25Fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="p10Fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="year"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => fmtM(v)}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <Tooltip content={<FanTooltip />} />

              {/* Wide outer band P10–P90 */}
              <Area
                type="monotone"
                dataKey="p90"
                fill="url(#p90Fill)"
                stroke="#22c55e"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                name="P90"
              />
              {/* Mid band P25–P75 */}
              <Area
                type="monotone"
                dataKey="p75"
                fill="url(#p75Fill)"
                stroke="#6366f1"
                strokeWidth={1}
                dot={false}
                name="P75"
              />
              {/* Median line */}
              <Line
                type="monotone"
                dataKey="median"
                stroke="#eab308"
                strokeWidth={2.5}
                dot={false}
                name="Median"
              />
              {/* P25 */}
              <Area
                type="monotone"
                dataKey="p25"
                fill="url(#p25Fill)"
                stroke="#f97316"
                strokeWidth={1}
                dot={false}
                name="P25"
              />
              {/* P10 worst */}
              <Area
                type="monotone"
                dataKey="p10"
                fill="url(#p10Fill)"
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                name="P10"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Section 7: Key Risks ─────────────────────────────────────────────── */}
      {monteCarloResult && forecastMode === "monte-carlo" && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-foreground">Key Risks Identified</h2>
          </div>
          <div className="flex flex-col gap-2">
            {monteCarloResult.key_risks.map((risk, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/15"
              >
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-foreground/90 leading-relaxed">{risk}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 8: Recommended Actions ──────────────────────────────────── */}
      {monteCarloResult && forecastMode === "monte-carlo" && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-foreground">Recommended Actions</h2>
          </div>
          <div className="flex flex-col gap-2">
            {monteCarloResult.recommended_actions.map((action, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/15"
              >
                <ArrowRight className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-foreground/90 leading-relaxed">{action}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 9: Scenario Comparison ──────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Scenario Comparison</h2>
          <span className="ml-auto text-xs text-muted-foreground">
            Active profile: <span className="text-primary font-medium capitalize">{profile}</span>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-xs text-muted-foreground font-semibold">Scenario</th>
                <th className="text-center py-2 px-3 text-xs text-muted-foreground font-semibold">Prop Growth</th>
                <th className="text-center py-2 px-3 text-xs text-muted-foreground font-semibold">Stocks</th>
                <th className="text-center py-2 px-3 text-xs text-muted-foreground font-semibold">Crypto</th>
                <th className="text-center py-2 px-3 text-xs text-muted-foreground font-semibold">Inflation</th>
                <th className="text-left py-2 px-3 text-xs text-muted-foreground font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(["conservative", "moderate", "aggressive"] as ForecastProfile[]).map((p) => {
                const preset = profilePresets[p];
                const isActive = profile === p && forecastMode === "profile";
                return (
                  <tr
                    key={p}
                    className={`border-b border-border/50 transition-colors ${
                      isActive
                        ? "bg-primary/8 border-l-2 border-l-primary"
                        : "hover:bg-background/40"
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                        )}
                        <span
                          className={`font-semibold text-sm ${
                            p === "conservative"
                              ? "text-blue-400"
                              : p === "moderate"
                              ? "text-emerald-400"
                              : "text-orange-400"
                          }`}
                        >
                          {preset.label}
                        </span>
                        {isActive && (
                          <span className="px-1.5 py-0.5 rounded-full text-xs bg-primary/20 text-primary">
                            Active
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono num-display text-foreground">{preset.prop}</td>
                    <td className="py-2.5 px-3 text-center font-mono num-display text-foreground">{preset.stocks}</td>
                    <td className="py-2.5 px-3 text-center font-mono num-display text-foreground">{preset.crypto}</td>
                    <td className="py-2.5 px-3 text-center font-mono num-display text-foreground">{preset.inflation}</td>
                    <td className="py-2.5 px-3 text-xs text-muted-foreground">{preset.notes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
          <Zap className="w-3 h-3 text-primary" />
          Profile mode uses the above presets uniformly across 2026–2035. Year-by-Year mode allows per-year overrides.
        </p>
      </div>

      {/* ── AI Insights Card ──────────────────────────────────────────────────── */}
      <AIInsightsCard
        pageKey="ai-forecast-engine"
        pageLabel="AI Forecast Engine"
        getData={getAIData}
        defaultExpanded={false}
      />
    </div>
  );
}

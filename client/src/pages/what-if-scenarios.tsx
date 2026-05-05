/**
 * what-if-scenarios.tsx — What-If Scenarios (Professional Finance-Grade)
 *
 * ARCHITECTURE — STRICT STATE SEPARATION:
 *
 *   INPUTS  (loaded from DB, never mutated by compute):
 *     scenarioList, activeId, scenarioData {properties, stockPlans, cryptoPlans, assumptions}
 *
 *   RESULTS (pure output of computeResult(), never fed back into inputs):
 *     activeResult, allResults, baseResult
 *
 *   COMPUTE RULES:
 *     ✅ computeResult(inputs) → returns results (pure, no setState inside)
 *     ✅ Debounced 800ms on input change — one timer, one setState at the end
 *     ✅ Compute lock: isComputingRef.current guard prevents re-entry
 *     ✅ Hash check: skip if inputs haven't changed
 *     ❌ NO setScenarios/setActiveId inside compute
 *     ❌ NO loadScenarios() inside compute
 *     ❌ NO state mutation inside compute logic
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  TrendingUp, Target, Plus, Copy, Trash2, RefreshCw, FlaskConical,
  Check, AlertTriangle, BarChart2, Home, Bitcoin, DollarSign,
  Zap, ChevronDown, ChevronUp, Info, Loader2, AlertCircle,
  Table as TableIcon, Clock, LogOut, ArrowRightLeft, PieChart,
  Banknote, ShieldCheck, TrendingDown, BadgeDollarSign, Settings2,
  ArrowRight, Percent, Wallet, Activity, Lightbulb, Calendar,
  ChevronsUpDown, Star, Navigation, Gauge, ListChecks, BookOpen,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart as RPieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  loadScenarios, saveScenario, deleteScenario, cloneBasePlan,
  loadScenarioProperties, saveProperty, deleteProperty,
  loadScenarioStockPlans, saveStockPlan,
  loadScenarioCryptoPlans, saveCryptoPlan,
  loadScenarioAssumptions, saveAssumptions,
  runScenarioForecast, runGoalSolver, runWiMonteCarlo,
  runExitEvent, buildHoldVsExitComparison, calcReinvestmentIncome,
  runExitTimingOptimiser, runImpactEngine, runActionRecommendationEngine,
  buildScenarioComparison, enforceReturnConstraints,
  DEFAULT_SOLVER_CONSTRAINTS, DEFAULT_EXIT_STRATEGY,
  type WiScenario, type WiProperty, type WiStockPlan, type WiCryptoPlan,
  type WiAssumption, type WiScenarioResult, type GoalSolverOption,
  type MonteCarloWiResult, type GoalSolverConstraints,
  type ExitStrategy, type ExitEventResult, type HoldVsExitComparison,
  type CgtBreakdown, type ExitTimingResult, type ImpactResult,
  type ActionPlan, type ScenarioComparisonRow, type AssumptionWarning,
} from '@/lib/whatIfEngine';
import { PROFILE_DEFAULTS } from '@/lib/forecastStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const SB_URL = 'https://uoraduyyxhtzixcsaidg.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c';
const SB_HDRS = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeN(v: any): number { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n; }

function fmt(n: number, compact = true): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (compact && abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (compact && abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs).toLocaleString()}`;
}

function riskColor(s: number) { return s <= 3 ? 'text-green-500' : s <= 6 ? 'text-yellow-500' : 'text-red-500'; }
function riskLabel(s: number) { return s <= 3 ? 'Low' : s <= 5 ? 'Medium' : s <= 7 ? 'Med-High' : 'High'; }
function riskBg(s: number) {
  return s <= 3 ? 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20'
    : s <= 5 ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20'
    : s <= 7 ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/20'
    : 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20';
}
function feasLabel(s: number) { return s >= 9 ? 'Excellent' : s >= 7 ? 'Good' : s >= 5 ? 'Moderate' : 'Challenging'; }
function feasColor(s: number) { return s >= 9 ? 'text-green-500' : s >= 7 ? 'text-blue-500' : s >= 5 ? 'text-yellow-500' : 'text-red-500'; }

/** Stable hash of scenario inputs — used to avoid recomputing identical data */
function hashInputs(
  scenario: WiScenario | null,
  properties: WiProperty[],
  stockPlans: WiStockPlan[],
  cryptoPlans: WiCryptoPlan[],
  assumptions: WiAssumption[]
): string {
  if (!scenario) return '';
  const key = JSON.stringify({
    sc: { id: scenario.id, profile: scenario.profile, swr: scenario.swr,
          target_passive_income: scenario.target_passive_income,
          target_year: scenario.target_year,
          include_super: scenario.include_super, include_ppor_equity: scenario.include_ppor_equity,
          include_crypto: scenario.include_crypto, include_stocks: scenario.include_stocks,
          include_property_equity: scenario.include_property_equity,
          snap_overrides: scenario.snap_overrides, forecast_mode: scenario.forecast_mode },
    p: properties.map(p => ({ ...p })),
    s: stockPlans.map(s => ({ ...s })),
    c: cryptoPlans.map(c => ({ ...c })),
    a: assumptions.map(a => ({ ...a })),
  });
  // Simple djb2 hash (no crypto needed)
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h) + key.charCodeAt(i);
  return h.toString(16);
}

async function fetchSnap(): Promise<any> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/sf_snapshot?limit=1`, { headers: SB_HDRS });
    if (!r.ok) return {};
    const rows = await r.json();
    return rows[0] ?? {};
  } catch { return {}; }
}

async function fetchRealProperties(): Promise<any[]> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/sf_properties?order=id.asc`, { headers: SB_HDRS });
    if (!r.ok) return [];
    return r.json();
  } catch { return []; }
}

// ─── ScenarioData: the immutable inputs bundle ─────────────────────────────────

interface ScenarioData {
  properties:  WiProperty[];
  stockPlans:  WiStockPlan[];
  cryptoPlans: WiCryptoPlan[];
  assumptions: WiAssumption[];
}

/** Pure compute function — NO setState, NO side effects, NO DB calls */
function computeResult(
  scenario: WiScenario,
  data: ScenarioData,
  snap: any
): WiScenarioResult {
  return runScenarioForecast({
    scenario,
    properties:  data.properties,
    stockPlans:  data.stockPlans,
    cryptoPlans: data.cryptoPlans,
    assumptions: data.assumptions,
    snap,
  });
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = '', icon: Icon, trend }:
  { label: string; value: string; sub?: string; color?: string; icon?: any; trend?: 'up' | 'down' | 'neutral' }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      {Icon && <Icon className={`w-4 h-4 mb-1 ${color || 'text-muted-foreground'}`} />}
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground leading-tight">{label}</div>
      {sub && <div className="text-xs text-muted-foreground/60">{sub}</div>}
    </div>
  );
}

// ─── Root Cause Analysis ──────────────────────────────────────────────────────

function RootCausePanel({ result, scenario }: { result: WiScenarioResult; scenario: WiScenario }) {
  const gap = result.gapPerMonth;
  const achieved = gap <= 0;
  const targetYear = result.years.find(y => y.year === scenario.target_year);

  const causes: { severity: 'error' | 'warn' | 'info' | 'ok'; text: string }[] = [];

  if (achieved) {
    causes.push({ severity: 'ok', text: `Goal achieved — projected ${fmt(result.projectedPassiveIncome)}/month passive income by ${scenario.target_year}.` });
  } else {
    // Primary: capital gap
    if (result.capitalGap > 500_000) {
      causes.push({ severity: 'error', text: `Capital shortfall: need ${fmt(result.requiredCapital)} investable capital for ${fmt(scenario.target_passive_income)}/mo at ${scenario.swr}% SWR — currently projected ${fmt(result.currentProjectedCapital)} (gap ${fmt(result.capitalGap)}).` });
    } else if (result.capitalGap > 0) {
      causes.push({ severity: 'warn', text: `Capital gap: ${fmt(result.capitalGap)} short of the ${fmt(result.requiredCapital)} needed at ${scenario.swr}% SWR — close but not there yet.` });
    }
    // Stock contributions
    const totalStockValue = targetYear?.stockValue ?? 0;
    if (totalStockValue < 500_000) {
      causes.push({ severity: 'warn', text: `Stock portfolio at target year is ${fmt(totalStockValue)} — increasing DCA contributions would materially accelerate passive income.` });
    }
    // Property passive
    const netRentTotal = result.years.filter(y => y.year <= scenario.target_year).reduce((s, y) => s + y.netRent, 0);
    if (netRentTotal <= 0 && (targetYear?.ipValues ?? 0) === 0) {
      causes.push({ severity: 'warn', text: 'No investment properties in this scenario — property rental income is zero. Adding even one IP significantly increases passive income.' });
    }
    // Cash drag
    const cashStressYears = result.years.filter(y => y.cashShortfall > 0);
    if (cashStressYears.length > 0) {
      causes.push({ severity: 'error', text: `Cash shortfall in ${cashStressYears.length} year(s): ${cashStressYears.map(y => y.year).join(', ')}. Total shortfall: ${fmt(cashStressYears.reduce((s, y) => s + y.cashShortfall, 0))}. This is dragging on DCA and property purchases.` });
    }
    // Low DCA
    const totalDCA = (targetYear?.stockDCA ?? 0) + (targetYear?.cryptoDCA ?? 0);
    if (totalDCA < 20_000) {
      causes.push({ severity: 'info', text: `Annual DCA contributions (${fmt(totalDCA)}) are low. Increasing DCA is the highest-leverage lever after property.` });
    }
    // FIRE year
    if (result.fireYear) {
      causes.push({ severity: 'info', text: `FIRE projected in ${result.fireYear} — ${result.fireYear > scenario.target_year ? result.fireYear - scenario.target_year + ' years after' : 'before'} the ${scenario.target_year} target.` });
    }
  }

  // Always show: last year before target
  const prevYear = result.years.find(y => y.year === scenario.target_year - 1);
  if (prevYear && !achieved) {
    causes.push({ severity: 'info', text: `By ${scenario.target_year - 1}: NW ${fmt(prevYear.netWorth)}, passive ${fmt(prevYear.monthlyPassiveIncome)}/mo — still ${fmt(scenario.target_passive_income - prevYear.monthlyPassiveIncome)}/mo short one year before target.` });
  }

  const iconMap = { error: AlertTriangle, warn: AlertCircle, info: Info, ok: Check };
  const colorMap = { error: 'text-red-500', warn: 'text-yellow-500', info: 'text-blue-400', ok: 'text-green-500' };
  const bgMap    = { error: 'bg-red-500/5 border-red-500/20', warn: 'bg-yellow-500/5 border-yellow-500/20', info: 'bg-blue-500/5 border-blue-500/20', ok: 'bg-green-500/5 border-green-500/20' };

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Root Cause Analysis</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {causes.map((c, i) => {
          const Icon = iconMap[c.severity];
          return (
            <div key={i} className={`rounded-lg border p-3 flex gap-2 ${bgMap[c.severity]}`}>
              <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${colorMap[c.severity]}`} />
              <span className="text-xs leading-relaxed">{c.text}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ result, scenario, baseResult, snap }:
  { result: WiScenarioResult | null; scenario: WiScenario | null; baseResult: WiScenarioResult | null; snap: any }) {
  if (!result || !scenario) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <FlaskConical className="w-8 h-8 opacity-30" />
        <p className="text-sm">Select a scenario and click Compute to see the forecast.</p>
      </div>
    );
  }

  const isAchieved = result.gapPerMonth <= 0;
  const targetRow  = result.years.find(y => y.year === scenario.target_year);

  return (
    <div className="space-y-5">
      {/* Goal status banner */}
      <div className={`rounded-xl p-4 border ${isAchieved ? 'border-green-500/30 bg-green-500/5' : 'border-orange-500/30 bg-orange-500/5'}`}>
        <div className="flex items-start gap-3">
          {isAchieved
            ? <Check className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
            : <Target className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />}
          <div>
            <div className="font-semibold text-sm">
              {isAchieved
                ? `Goal Achieved — ${fmt(result.projectedPassiveIncome)}/mo by ${scenario.target_year} ✓`
                : `Gap: ${fmt(result.gapPerMonth)}/month to reach ${fmt(scenario.target_passive_income)}/month by ${scenario.target_year}`}
            </div>
            <div className="text-xs text-muted-foreground mt-1 space-x-3">
              <span>SWR {scenario.swr}%</span>
              <span>Required capital {fmt(result.requiredCapital)}</span>
              <span>Projected capital {fmt(result.currentProjectedCapital)}</span>
              {result.capitalGap > 0 && <span className="text-orange-500">Capital gap {fmt(result.capitalGap)}</span>}
              {result.fireYear && <span className="text-green-500">FIRE {result.fireYear}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Dashboard data sync notice */}
      <div className="rounded-lg bg-muted/30 border border-border px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
        <Info className="w-3 h-3 shrink-0" />
        Income {fmt(safeN(scenario.snap_overrides?.monthly_income ?? snap?.monthly_income))}/mo ·
        Expenses {fmt(safeN(scenario.snap_overrides?.monthly_expenses ?? snap?.monthly_expenses))}/mo ·
        Cash {fmt(safeN(scenario.snap_overrides?.cash ?? snap?.cash) + safeN(scenario.snap_overrides?.offset_balance ?? snap?.offset_balance))}/mo ·
        Stocks {fmt(safeN(scenario.snap_overrides?.stocks ?? snap?.stocks))} ·
        Crypto {fmt(safeN(scenario.snap_overrides?.crypto ?? snap?.crypto))}
      </div>

      {/* Capital requirement visual */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Capital Requirements at {scenario.target_year}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { label: 'Required Capital', value: result.requiredCapital, color: 'bg-muted' },
              { label: 'Projected Capital', value: result.currentProjectedCapital, color: isAchieved ? 'bg-green-500' : 'bg-primary' },
            ].map(row => (
              <div key={row.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-medium">{fmt(row.value)}</span>
                </div>
                <div className="h-2 rounded-full bg-border overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${row.color}`}
                    style={{ width: `${Math.min(100, (row.value / Math.max(result.requiredCapital, 1)) * 100).toFixed(1)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4 text-center text-xs">
            <div>
              <div className="font-semibold tabular-nums">{fmt(scenario.target_passive_income * 12)}</div>
              <div className="text-muted-foreground">Annual target</div>
            </div>
            <div>
              <div className="font-semibold tabular-nums">{scenario.swr}%</div>
              <div className="text-muted-foreground">Safe withdrawal rate</div>
            </div>
            <div>
              <div className={`font-semibold tabular-nums ${result.capitalGap > 0 ? 'text-orange-500' : 'text-green-500'}`}>
                {result.capitalGap > 0 ? `-${fmt(result.capitalGap)}` : `+${fmt(-result.capitalGap)}`}
              </div>
              <div className="text-muted-foreground">Capital gap</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label={`Passive Income ${scenario.target_year}`}
          value={fmt(result.projectedPassiveIncome) + '/mo'}
          color={isAchieved ? 'text-green-500' : 'text-orange-500'}
          icon={TrendingUp}
        />
        <KpiCard
          label="Gap to Goal"
          value={isAchieved ? 'Achieved ✓' : fmt(result.gapPerMonth) + '/mo short'}
          color={isAchieved ? 'text-green-500' : 'text-red-400'}
          icon={Target}
        />
        <KpiCard label={`Net Worth ${scenario.target_year}`} value={fmt(result.netWorthTargetYear)} icon={BarChart2} />
        <KpiCard
          label={`Cash ${scenario.target_year}`}
          value={fmt(result.cashTargetYear)}
          color={result.cashTargetYear < 20000 ? 'text-red-400' : ''}
          icon={DollarSign}
        />
        <KpiCard label="FIRE Year" value={result.fireYear ? `${result.fireYear}` : 'Not reached'} icon={Zap} color={result.fireYear ? 'text-green-500' : ''} />
        <KpiCard label="Risk" value={`${result.riskScore}/10`} color={riskColor(result.riskScore)} sub={riskLabel(result.riskScore)} />
        <KpiCard label="Feasibility" value={`${result.feasibilityScore}/10`} color={feasColor(result.feasibilityScore)} sub={feasLabel(result.feasibilityScore)} />
        <KpiCard
          label="Max Cash Shortfall"
          value={result.maxCashShortfall > 0 ? fmt(result.maxCashShortfall) : 'None'}
          color={result.maxCashShortfall > 50000 ? 'text-red-400' : 'text-green-500'}
        />
      </div>

      {/* Passive income by year */}
      {result.years.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly Passive Income by Year</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={result.years.map(y => ({ ...y, target: scenario.target_passive_income }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} width={55} />
                <Tooltip formatter={(v: number, n: string) => [`$${v.toLocaleString()}/mo`, n]} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="monthlyPassiveIncome" fill="hsl(var(--chart-2))" name="Passive Income/mo" radius={[3, 3, 0, 0]} />
                <ReferenceLine y={scenario.target_passive_income} stroke="hsl(var(--destructive))" strokeDasharray="5 3" label={{ value: 'Target', position: 'right', fontSize: 10 }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Net worth trajectory */}
      {result.years.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Net Worth Trajectory</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={result.years} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="wifNW" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `$${(v / 1e6).toFixed(1)}M`} tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="netWorth" stroke="hsl(var(--primary))" fill="url(#wifNW)" name="Net Worth" strokeWidth={2} />
                <Area type="monotone" dataKey="accessibleNetWorth" stroke="hsl(var(--chart-3))" fill="none" name="Accessible NW" strokeWidth={1.5} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* vs base plan */}
      {baseResult && baseResult.scenarioId !== result.scenarioId && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">This Scenario vs Base Plan</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Passive/mo', base: baseResult.projectedPassiveIncome, curr: result.projectedPassiveIncome, fmt: (v: number) => fmt(v) + '/mo', lowerBetter: false },
                { label: `Net Worth ${scenario.target_year}`, base: baseResult.netWorthTargetYear, curr: result.netWorthTargetYear, fmt, lowerBetter: false },
                { label: 'FIRE Year', base: baseResult.fireYear ?? 9999, curr: result.fireYear ?? 9999, fmt: (v: number) => v === 9999 ? 'N/A' : `${v}`, lowerBetter: true },
                { label: 'Max Shortfall', base: baseResult.maxCashShortfall, curr: result.maxCashShortfall, fmt, lowerBetter: true },
              ].map(row => {
                const delta = row.curr - row.base;
                const better = row.lowerBetter ? delta < 0 : delta > 0;
                return (
                  <div key={row.label} className="rounded-lg border border-border p-3 text-center">
                    <div className="text-xs text-muted-foreground mb-1">{row.label}</div>
                    <div className="font-semibold text-sm">{row.fmt(row.curr)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Base: {row.fmt(row.base)}</div>
                    {delta !== 0 && (
                      <div className={`text-xs font-medium mt-1 ${better ? 'text-green-500' : 'text-red-400'}`}>
                        {better ? '▲' : '▼'} {row.fmt(Math.abs(delta))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Root cause */}
      <RootCausePanel result={result} scenario={scenario} />
    </div>
  );
}

// ─── Properties Tab ────────────────────────────────────────────────────────────

function PropertiesTab({ scenarioId, onChanged }: { scenarioId: number; onChanged: () => void }) {
  const [props, setProps]     = useState<WiProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);
    loadScenarioProperties(scenarioId).then(rows => { setProps(rows); setLoading(false); });
  }, [scenarioId]);

  async function addProperty() {
    const saved = await saveProperty({
      scenario_id: scenarioId,
      property_name: 'Investment Property',
      is_ppor: false,
      purchase_year: 2028,
      purchase_month: 7,
      purchase_price: 850000,
      deposit_pct: 20,
      stamp_duty: 34000,
      legal_cost: 2500,
      lmi: 0,
      loan_amount: 680000,
      interest_rate: 6.25,
      loan_type: 'IO',
      loan_term_years: 30,
      rent_per_week: 650,
      rental_growth_pct: 3,
      vacancy_pct: 3,
      management_fee_pct: 8,
      council_rates_pa: 2000,
      insurance_pa: 1500,
      maintenance_pa: 2000,
      body_corporate_pa: 0,
      land_tax_pa: 0,
      other_costs_pa: 0,
      allow_equity_release: false,
      sort_order: props.length,
    });
    setProps(prev => [...prev, saved]);
    setExpanded(saved.id ?? null);
    onChanged();
  }

  async function updateProp(idx: number, field: keyof WiProperty, value: any) {
    const updated = { ...props[idx], [field]: value };
    const next = props.map((p, i) => i === idx ? updated : p);
    setProps(next);
    await saveProperty(updated);
    onChanged();
  }

  async function removeProp(id: number) {
    await deleteProperty(id);
    setProps(prev => prev.filter(p => p.id !== id));
    onChanged();
    toast({ title: 'Property removed' });
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin w-5 h-5 text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Investment Properties ({props.length})</h3>
        <Button size="sm" variant="outline" onClick={addProperty} data-testid="btn-add-property">
          <Plus className="w-3 h-3 mr-1" /> Add Property
        </Button>
      </div>

      {props.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          No investment properties. Click "Add Property" to model a new IP.
        </div>
      )}

      {props.map((p, idx) => (
        <Card key={p.id} className="overflow-hidden">
          <CardHeader className="pb-0 cursor-pointer" onClick={() => setExpanded(expanded === p.id ? null : (p.id ?? null))}>
            <div className="flex items-center justify-between py-1">
              <div>
                <div className="font-semibold text-sm flex items-center gap-2">
                  <Home className="w-4 h-4 text-muted-foreground" />
                  {p.property_name}
                  {p.is_ppor && <Badge variant="outline" className="text-xs">PPOR</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {p.purchase_year ? `Buy ${p.purchase_year}` : 'Existing'} · {fmt(p.purchase_price)} ·
                  Loan {fmt(p.loan_amount)} · ${p.rent_per_week}/wk · {p.loan_type}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={e => { e.stopPropagation(); removeProp(p.id!); }}
                  className="text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
                {expanded === p.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
          </CardHeader>
          {expanded === p.id && (
            <CardContent className="pt-3">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {([
                  ['Property Name',      'property_name',      'text'],
                  ['Purchase Year',      'purchase_year',      'number'],
                  ['Purchase Month',     'purchase_month',     'number'],
                  ['Purchase Price ($)', 'purchase_price',     'number'],
                  ['Deposit %',          'deposit_pct',        'number'],
                  ['Stamp Duty ($)',      'stamp_duty',         'number'],
                  ['Legal Cost ($)',      'legal_cost',         'number'],
                  ['LMI ($)',             'lmi',                'number'],
                  ['Loan Amount ($)',     'loan_amount',        'number'],
                  ['Interest Rate %',    'interest_rate',      'number'],
                  ['Rent/Week ($)',       'rent_per_week',      'number'],
                  ['Rental Growth %',    'rental_growth_pct',  'number'],
                  ['Vacancy %',          'vacancy_pct',        'number'],
                  ['Management Fee %',   'management_fee_pct', 'number'],
                  ['Council Rates PA',   'council_rates_pa',   'number'],
                  ['Insurance PA ($)',   'insurance_pa',        'number'],
                  ['Maintenance PA ($)', 'maintenance_pa',     'number'],
                  ['Body Corp PA ($)',   'body_corporate_pa',  'number'],
                  ['Land Tax PA ($)',    'land_tax_pa',        'number'],
                  ['Other Costs PA ($)', 'other_costs_pa',     'number'],
                  ['Expected Sale Year','expected_sale_year',  'number'],
                ] as [string, keyof WiProperty, string][]).map(([label, field, type]) => (
                  <div key={field}>
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <Input
                      type={type}
                      value={(p[field] as any) ?? ''}
                      onChange={e => updateProp(idx, field, type === 'number' ? safeN(e.target.value) : e.target.value)}
                      className="h-8 text-sm mt-0.5"
                      data-testid={`input-prop-${field}-${p.id}`}
                    />
                  </div>
                ))}
                <div>
                  <Label className="text-xs text-muted-foreground">Loan Type</Label>
                  <Select value={p.loan_type} onValueChange={v => updateProp(idx, 'loan_type', v)}>
                    <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IO">Interest Only</SelectItem>
                      <SelectItem value="PI">Principal & Interest</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}

// ─── Stocks Tab ────────────────────────────────────────────────────────────────

function StocksTab({ scenarioId, onChanged }: { scenarioId: number; onChanged: () => void }) {
  const [plans, setPlans] = useState<WiStockPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadScenarioStockPlans(scenarioId).then(rows => { setPlans(rows); setLoading(false); });
  }, [scenarioId]);

  async function addPlan() {
    const saved = await saveStockPlan({
      scenario_id: scenarioId,
      label: 'ETF Portfolio',
      starting_value: 0,
      lump_sum_amount: 0,
      dca_amount: 1200,
      dca_frequency: 'Weekly',
      dca_start_year: 2026,
      dca_end_year: 2035,
      return_mode: 'profile',
      custom_return: 10,
      dividend_yield: 2,
      lump_sum_month: 1,
    });
    setPlans(prev => [...prev, saved]);
    onChanged();
  }

  async function update(idx: number, field: keyof WiStockPlan, value: any) {
    const updated = { ...plans[idx], [field]: value };
    setPlans(plans.map((p, i) => i === idx ? updated : p));
    await saveStockPlan(updated);
    onChanged();
  }

  async function remove(id: number) {
    await fetch(`${SB_URL}/rest/v1/sf_scenario_stock_plans?id=eq.${id}`, { method: 'DELETE', headers: { ...SB_HDRS, 'Content-Type': 'application/json' } });
    setPlans(prev => prev.filter(p => p.id !== id));
    onChanged();
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin w-5 h-5 text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Stock Plans ({plans.length})</h3>
        <Button size="sm" variant="outline" onClick={addPlan} data-testid="btn-add-stock-plan">
          <Plus className="w-3 h-3 mr-1" /> Add Plan
        </Button>
      </div>

      {plans.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          No stock plans. Add one to model ETF/stock contributions.
        </div>
      )}

      {plans.map((sp, idx) => (
        <Card key={sp.id}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-muted-foreground" />{sp.label}
              </div>
              <button onClick={() => remove(sp.id!)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {([
                ['Label', 'label', 'text'],
                ['Starting Value ($)', 'starting_value', 'number'],
                ['Lump Sum ($)', 'lump_sum_amount', 'number'],
                ['Lump Sum Year', 'lump_sum_year', 'number'],
                ['DCA Amount ($)', 'dca_amount', 'number'],
                ['DCA Start Year', 'dca_start_year', 'number'],
                ['DCA End Year', 'dca_end_year', 'number'],
                ['Custom Return %', 'custom_return', 'number'],
                ['Dividend Yield %', 'dividend_yield', 'number'],
              ] as [string, keyof WiStockPlan, string][]).map(([label, field, type]) => (
                <div key={field}>
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input type={type} value={(sp[field] as any) ?? ''} onChange={e => update(idx, field, type === 'number' ? safeN(e.target.value) : e.target.value)} className="h-8 text-sm mt-0.5" />
                </div>
              ))}
              <div>
                <Label className="text-xs text-muted-foreground">DCA Frequency</Label>
                <Select value={sp.dca_frequency} onValueChange={v => update(idx, 'dca_frequency', v)}>
                  <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{['Weekly','Fortnightly','Monthly','Quarterly'].map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Return Mode</Label>
                <Select value={sp.return_mode} onValueChange={v => update(idx, 'return_mode', v)}>
                  <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="profile">Forecast Profile</SelectItem>
                    <SelectItem value="custom">Custom %</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Crypto Tab ────────────────────────────────────────────────────────────────

function CryptoTab({ scenarioId, onChanged }: { scenarioId: number; onChanged: () => void }) {
  const [plans, setPlans] = useState<WiCryptoPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadScenarioCryptoPlans(scenarioId).then(rows => { setPlans(rows); setLoading(false); });
  }, [scenarioId]);

  async function addPlan() {
    const saved = await saveCryptoPlan({
      scenario_id: scenarioId,
      label: 'Crypto Portfolio',
      starting_value: 0,
      lump_sum_amount: 0,
      dca_amount: 1300,
      dca_frequency: 'Monthly',
      dca_start_year: 2026,
      dca_end_year: 2035,
      return_mode: 'profile',
      custom_return: 20,
      btc_pct: 60, eth_pct: 30, other_pct: 10,
      lump_sum_month: 1,
    });
    setPlans(prev => [...prev, saved]);
    onChanged();
  }

  async function update(idx: number, field: keyof WiCryptoPlan, value: any) {
    const updated = { ...plans[idx], [field]: value };
    setPlans(plans.map((p, i) => i === idx ? updated : p));
    await saveCryptoPlan(updated);
    onChanged();
  }

  async function remove(id: number) {
    await fetch(`${SB_URL}/rest/v1/sf_scenario_crypto_plans?id=eq.${id}`, { method: 'DELETE', headers: { ...SB_HDRS, 'Content-Type': 'application/json' } });
    setPlans(prev => prev.filter(p => p.id !== id));
    onChanged();
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin w-5 h-5 text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Crypto Plans ({plans.length})</h3>
        <Button size="sm" variant="outline" onClick={addPlan} data-testid="btn-add-crypto-plan">
          <Plus className="w-3 h-3 mr-1" /> Add Plan
        </Button>
      </div>

      <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/20 p-3 flex gap-2 text-xs text-yellow-700 dark:text-yellow-300">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        Crypto passive income applies a conservative 2% withdrawal rate regardless of growth to account for volatility risk.
      </div>

      {plans.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          No crypto plans. Add one to model crypto contributions.
        </div>
      )}

      {plans.map((cp, idx) => (
        <Card key={cp.id}>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-sm flex items-center gap-2">
                <Bitcoin className="w-4 h-4 text-orange-400" />{cp.label}
              </div>
              <button onClick={() => remove(cp.id!)} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {([
                ['Label', 'label', 'text'],
                ['Starting Value ($)', 'starting_value', 'number'],
                ['Lump Sum ($)', 'lump_sum_amount', 'number'],
                ['Lump Sum Year', 'lump_sum_year', 'number'],
                ['DCA Amount ($)', 'dca_amount', 'number'],
                ['DCA Start Year', 'dca_start_year', 'number'],
                ['DCA End Year', 'dca_end_year', 'number'],
                ['Custom Return %', 'custom_return', 'number'],
                ['BTC %', 'btc_pct', 'number'],
                ['ETH %', 'eth_pct', 'number'],
                ['Other %', 'other_pct', 'number'],
              ] as [string, keyof WiCryptoPlan, string][]).map(([label, field, type]) => (
                <div key={field}>
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input type={type} value={(cp[field] as any) ?? ''} onChange={e => update(idx, field, type === 'number' ? safeN(e.target.value) : e.target.value)} className="h-8 text-sm mt-0.5" />
                </div>
              ))}
              <div>
                <Label className="text-xs text-muted-foreground">DCA Frequency</Label>
                <Select value={cp.dca_frequency} onValueChange={v => update(idx, 'dca_frequency', v)}>
                  <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{['Weekly','Fortnightly','Monthly','Quarterly'].map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Cashflow Tab ──────────────────────────────────────────────────────────────

function CashflowTab({ result, scenario }: { result: WiScenarioResult | null; scenario: WiScenario | null }) {
  if (!result || !scenario) return <div className="text-center py-10 text-muted-foreground text-sm">Run compute first.</div>;

  const stressYears = result.years.filter(y => y.cashShortfall > 0);

  return (
    <div className="space-y-5">
      {stressYears.length > 0 && (
        <div className="rounded-lg bg-red-500/5 border border-red-500/30 p-3 space-y-1">
          <div className="flex items-center gap-2 text-red-500 font-medium text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" /> Cash stress detected
          </div>
          {stressYears.map(y => (
            <div key={y.year} className="text-xs text-red-400 ml-6">
              ⚠ Cash deficit in {y.year}: {fmt(-y.cashShortfall)} shortfall
              (closing {fmt(y.closingCash)}, emergency buffer breached)
            </div>
          ))}
        </div>
      )}

      {/* Annual bridge chart */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Annual Cashflow Bridge</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={result.years} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} width={60} />
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="income"           fill="hsl(var(--chart-2))"    name="Income"       stackId="in"  />
              <Bar dataKey="rentalIncome"     fill="hsl(var(--chart-3))"    name="Rental"       stackId="in"  />
              <Bar dataKey="taxRefund"        fill="hsl(var(--chart-4))"    name="Tax Refund"   stackId="in"  />
              <Bar dataKey="livingExpenses"   fill="hsl(var(--destructive))" name="Expenses"    stackId="out" />
              <Bar dataKey="mortgageRepayments" fill="#f97316"              name="Mortgage"     stackId="out" />
              <Bar dataKey="propertyDeposits" fill="#a855f7"                name="Deposits"     stackId="out" />
              <Bar dataKey="stockDCA"         fill="#3b82f6"                name="Stock DCA"    stackId="out" />
              <Bar dataKey="cryptoDCA"        fill="#f59e0b"                name="Crypto DCA"   stackId="out" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Closing cash line */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Closing Cash by Year</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={result.years} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} width={60} />
              <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 2" />
              <Line type="monotone" dataKey="closingCash" stroke="hsl(var(--chart-2))" name="Closing Cash" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Year-by-year table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Year-by-Year Cashflow</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[800px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {['Year','Opening Cash','Income','Rental','Tax Refund','Expenses','Mortgage','IP Deposit','Stock DCA','Crypto DCA','Closing Cash','Shortfall'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.years.map(y => (
                  <tr key={y.year} className={`border-b border-border/50 transition-colors ${y.cashShortfall > 0 ? 'bg-red-500/5' : 'hover:bg-muted/20'}`}>
                    <td className="px-3 py-2 font-medium">{y.year}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(y.openingCash)}</td>
                    <td className="px-3 py-2 tabular-nums text-green-500">{fmt(y.income)}</td>
                    <td className="px-3 py-2 tabular-nums text-blue-500">{fmt(y.rentalIncome)}</td>
                    <td className="px-3 py-2 tabular-nums text-teal-500">{fmt(y.taxRefund)}</td>
                    <td className="px-3 py-2 tabular-nums text-red-400">{fmt(y.livingExpenses)}</td>
                    <td className="px-3 py-2 tabular-nums text-orange-400">{fmt(y.mortgageRepayments)}</td>
                    <td className="px-3 py-2 tabular-nums text-purple-400">{fmt(y.propertyDeposits)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(y.stockDCA)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(y.cryptoDCA)}</td>
                    <td className={`px-3 py-2 tabular-nums font-medium ${y.closingCash < 0 ? 'text-red-500' : 'text-green-500'}`}>{fmt(y.closingCash)}</td>
                    <td className="px-3 py-2 tabular-nums">{y.cashShortfall > 0 ? <span className="text-red-500 font-medium">{fmt(y.cashShortfall)}</span> : <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Asset table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Asset Snapshot by Year</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {['Year','PPOR','IP Value','IP Loans','Stocks','Crypto','Super','Net Worth','Passive/mo'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.years.map(y => (
                  <tr key={y.year} className={`border-b border-border/50 hover:bg-muted/20 ${y.fireAchieved ? 'bg-green-500/5' : ''}`}>
                    <td className="px-3 py-2 font-medium">{y.year}{y.fireAchieved ? ' 🔥' : ''}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(y.pporValue)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(y.ipValues)}</td>
                    <td className="px-3 py-2 tabular-nums text-red-400">{fmt(y.ipLoans)}</td>
                    <td className="px-3 py-2 tabular-nums text-blue-500">{fmt(y.stockValue)}</td>
                    <td className="px-3 py-2 tabular-nums text-orange-400">{fmt(y.cryptoValue)}</td>
                    <td className="px-3 py-2 tabular-nums text-purple-400">{fmt(y.superValue)}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{fmt(y.netWorth)}</td>
                    <td className={`px-3 py-2 tabular-nums font-medium ${y.monthlyPassiveIncome >= 20000 ? 'text-green-500' : ''}`}>{fmt(y.monthlyPassiveIncome)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Goal Solver Tab ──────────────────────────────────────────────────────────

function GoalSolverTab({ scenario, snap, assumptions, onApplyOption, exitResultForSolver }:
  { scenario: WiScenario | null; snap: any; assumptions: WiAssumption[]; onApplyOption: (opt: GoalSolverOption) => void; exitResultForSolver?: ExitEventResult | null }) {
  const [options, setOptions]   = useState<GoalSolverOption[]>([]);
  const [running, setRunning]   = useState(false);
  const [constraints, setConstraints] = useState<GoalSolverConstraints>({ ...DEFAULT_SOLVER_CONSTRAINTS });
  const [showConstraints, setShowConstraints] = useState(false);
  const [ranAt, setRanAt]       = useState<string | null>(null);

  async function runSolver() {
    if (!scenario || running) return;
    setRunning(true);
    await new Promise(r => setTimeout(r, 30));
    try {
      const opts = runGoalSolver({
        scenario,
        basePropCount: 1,
        currentStockDCAMonthly: 1200 * 52 / 12,
        currentCryptoDCAMonthly: 1300,
        assumptions,
        snap,
        constraints,
      });

      // Inject Option F — Exit Strategy path (if exit result is available)
      if (exitResultForSolver && exitResultForSolver.monthlyPassiveIncome > 0) {
        const exitOpt: GoalSolverOption = {
          label: 'Option F',
          name: 'Exit + Convert',
          description: `Sell assets in ${exitResultForSolver.exitYear} → reinvest ${fmt(exitResultForSolver.totalNetProceeds)} net capital into diversified portfolio`,
          extraProperties: [],
          stockDCAMonthly: 0,
          cryptoDCAMonthly: 0,
          projectedPassiveIncome: exitResultForSolver.monthlyPassiveIncome,
          targetAchievedYear: exitResultForSolver.exitYear,
          gap: scenario.target_passive_income - exitResultForSolver.monthlyPassiveIncome,
          riskScore: 3,
          feasibilityScore: exitResultForSolver.monthlyPassiveIncome >= scenario.target_passive_income ? 10 : 7,
          maxCashShortfall: 0,
          isRecommended: false,
          reasoning: [
            `Accumulate until ${exitResultForSolver.exitYear}, then exit`,
            `Net capital after CGT: ${fmt(exitResultForSolver.totalNetProceeds)}`,
            `Reinvest into diversified portfolio (ETF/Bonds/Cash)`,
            `${exitResultForSolver.incomeMode === 'swr' ? `${exitResultForSolver.effectiveSWR.toFixed(1)}% SWR withdrawal` : exitResultForSolver.incomeMode === 'yield' ? 'Yield-based income (no capital drawdown)' : 'Hybrid: growth + income'}`,
            `Income: ${fmt(exitResultForSolver.monthlyPassiveIncome)}/mo (${fmt(exitResultForSolver.annualPassiveIncome)}/yr)`,
            `CGT cost: ${fmt(exitResultForSolver.totalTaxOwed)} — vs. ${fmt((exitResultForSolver.monthlyPassiveIncome) * 12)}/yr income gain`,
          ],
        };
        // Re-evaluate recommended
        const allOpts = [...opts, exitOpt];
        const acceptable = allOpts.filter(r => r.riskScore <= 7 && r.feasibilityScore >= 7);
        const best = acceptable.length > 0
          ? acceptable.sort((a, b) => b.feasibilityScore - a.feasibilityScore)[0]
          : allOpts.sort((a, b) => b.feasibilityScore - a.feasibilityScore)[0];
        allOpts.forEach(o => { o.isRecommended = false; });
        if (best) best.isRecommended = true;
        setOptions(allOpts);
      } else {
        setOptions(opts);
      }

      setRanAt(new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setRunning(false);
    }
  }

  const recommended = options.find(o => o.isRecommended);

  return (
    <div className="space-y-5">
      {/* Goal */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="font-semibold text-sm mb-1">
          Goal: {scenario ? `$${scenario.target_passive_income.toLocaleString()}/month by ${scenario.target_year}` : 'No scenario selected'}
        </div>
        <div className="text-xs text-muted-foreground">
          Required capital: {scenario ? fmt(scenario.target_passive_income * 12 / (scenario.swr / 100)) : '—'} at {scenario?.swr ?? 3.5}% SWR
        </div>
      </div>

      {/* Recommended plan (pinned at top after solve) */}
      {recommended && (
        <Card className="border-green-500/40 ring-1 ring-green-500/20">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500 shrink-0" />
              <CardTitle className="text-sm text-green-500">Recommended Plan — {recommended.name}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 mb-3 text-center">
              <div>
                <div className={`text-lg font-bold ${recommended.gap <= 0 ? 'text-green-500' : 'text-orange-500'}`}>
                  {fmt(recommended.projectedPassiveIncome)}/mo
                </div>
                <div className="text-xs text-muted-foreground">Projected passive</div>
              </div>
              <div>
                <div className="text-lg font-bold">{recommended.targetAchievedYear ?? 'Beyond 2040'}</div>
                <div className="text-xs text-muted-foreground">Target achieved</div>
              </div>
              <div>
                <div className={`text-lg font-bold ${feasColor(recommended.feasibilityScore)}`}>{recommended.feasibilityScore}/10</div>
                <div className="text-xs text-muted-foreground">Feasibility</div>
              </div>
            </div>
            <div className="space-y-1.5 mb-3">
              {recommended.reasoning.map((r, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span className="text-green-500 font-bold shrink-0">→</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
            <Button size="sm" onClick={() => onApplyOption(recommended)} data-testid="btn-apply-recommended">
              <Check className="w-3 h-3 mr-1" /> Apply This Plan to Scenario
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Constraints */}
      <Card>
        <CardHeader className="pb-0 cursor-pointer" onClick={() => setShowConstraints(!showConstraints)}>
          <div className="flex items-center justify-between py-1">
            <CardTitle className="text-sm">Solver Constraints</CardTitle>
            {showConstraints ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </CardHeader>
        {showConstraints && (
          <CardContent className="pt-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {([
                ['Max IPs to Buy', 'maxIPs'],
                ['Max Property Price ($)', 'maxPropertyPrice'],
                ['Min Cash Buffer ($)', 'minCashBuffer'],
                ['Max Stock DCA/mo ($)', 'maxStockDCAMonthly'],
                ['Max Crypto DCA/mo ($)', 'maxCryptoDCAMonthly'],
                ['Max Annual Neg CF ($)', 'maxAnnualNegativeCF'],
              ] as [string, keyof GoalSolverConstraints][]).map(([label, field]) => (
                <div key={field}>
                  <Label className="text-xs text-muted-foreground">{label}</Label>
                  <Input type="number" value={(constraints[field] as number) ?? 0} onChange={e => setConstraints(p => ({ ...p, [field]: safeN(e.target.value) }))} className="h-8 text-sm mt-0.5" />
                </div>
              ))}
              <div>
                <Label className="text-xs text-muted-foreground">Preferred Risk</Label>
                <Select value={constraints.preferredRisk} onValueChange={v => setConstraints(p => ({ ...p, preferredRisk: v as any }))}>
                  <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <Button className="flex-1" onClick={runSolver} disabled={running || !scenario} data-testid="btn-run-goal-solver">
          {running
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running Solver…</>
            : <><Zap className="w-4 h-4 mr-2" /> Find Path to {scenario ? fmt(scenario.target_passive_income) + '/mo by ' + scenario.target_year : 'Goal'}</>}
        </Button>
        {ranAt && <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{ranAt}</span>}
      </div>

      {/* All options */}
      {options.map(opt => (
        <Card key={opt.label} className={opt.isRecommended ? 'border-primary/40' : ''}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">{opt.label} — {opt.name}</span>
                  {opt.isRecommended && <Badge className="text-xs bg-primary/10 text-primary border-primary/30">Recommended</Badge>}
                  <span className={`text-xs px-2 py-0.5 rounded border ${riskBg(opt.riskScore)}`}>{riskLabel(opt.riskScore)} Risk</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{opt.description}</div>
              </div>
              <div className="text-right shrink-0">
                <div className={`font-bold text-sm ${opt.gap <= 0 ? 'text-green-500' : 'text-orange-500'}`}>{fmt(opt.projectedPassiveIncome)}/mo</div>
                <div className="text-xs text-muted-foreground">{opt.gap <= 0 ? `Goal achieved ${opt.targetAchievedYear}` : `Gap ${fmt(opt.gap)}/mo`}</div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 mb-3 text-center">
              <div><div className={`font-semibold ${feasColor(opt.feasibilityScore)}`}>{opt.feasibilityScore}/10</div><div className="text-xs text-muted-foreground">Feasibility</div></div>
              <div><div className={`font-semibold ${riskColor(opt.riskScore)}`}>{opt.riskScore}/10</div><div className="text-xs text-muted-foreground">Risk</div></div>
              <div><div className="font-semibold">{opt.targetAchievedYear ?? 'Beyond 2040'}</div><div className="text-xs text-muted-foreground">Target year</div></div>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1 mb-3">
              {opt.reasoning.map((r, i) => <li key={i} className="flex gap-2"><span className="text-primary shrink-0">→</span>{r}</li>)}
            </ul>
            <Button size="sm" variant="outline" onClick={() => onApplyOption(opt)} data-testid={`btn-apply-${opt.label.replace(' ', '-').toLowerCase()}`}>
              Apply {opt.label} to Scenario
            </Button>
          </CardContent>
        </Card>
      ))}

      {options.length > 0 && (
        <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
          All options use your ledger data as starting point. Property estimates: 4% gross yield, 20% deposit, 6.25% IO rate. Results vary with actual property selection and market conditions.
        </div>
      )}
    </div>
  );
}

// ─── Monte Carlo Tab ──────────────────────────────────────────────────────────

function MonteCarloTab({ scenario, properties, stockPlans, cryptoPlans, assumptions, snap }:
  { scenario: WiScenario | null; properties: WiProperty[]; stockPlans: WiStockPlan[]; cryptoPlans: WiCryptoPlan[]; assumptions: WiAssumption[]; snap: any }) {
  const [result, setResult] = useState<MonteCarloWiResult | null>(null);
  const [running, setRunning] = useState(false);
  const [sims, setSims]       = useState(1000);
  const [ranAt, setRanAt]     = useState<string | null>(null);

  async function run() {
    if (!scenario || running) return;
    setRunning(true);
    await new Promise(r => setTimeout(r, 30));
    try {
      const res = runWiMonteCarlo({ scenario, properties, stockPlans, cryptoPlans, assumptions, snap, simulations: sims });
      setResult(res);
      setRanAt(new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <Label className="text-xs text-muted-foreground">Simulations</Label>
          <Select value={sims.toString()} onValueChange={v => setSims(parseInt(v))}>
            <SelectTrigger className="h-8 w-32 text-sm mt-0.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[500,1000,2000,5000].map(n => <SelectItem key={n} value={n.toString()}>{n.toLocaleString()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={run} disabled={running || !scenario} className="mt-5" data-testid="btn-run-mc">
          {running ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Running {sims.toLocaleString()} sims…</> : <><FlaskConical className="w-4 h-4 mr-2" />Run Monte Carlo</>}
        </Button>
        {ranAt && <span className="text-xs text-muted-foreground mt-5 flex items-center gap-1"><Clock className="w-3 h-3" />{ranAt}</span>}
      </div>

      {result && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <KpiCard label={`P(reach $${(scenario!.target_passive_income/1000).toFixed(0)}K/mo by ${scenario!.target_year})`} value={`${result.probTargetPassive}%`} color={result.probTargetPassive >= 60 ? 'text-green-500' : result.probTargetPassive >= 35 ? 'text-yellow-500' : 'text-red-400'} icon={Target} />
            <KpiCard label="P10 Net Worth" value={fmt(result.p10)} color="text-red-400" sub="Pessimistic" />
            <KpiCard label="P50 Net Worth" value={fmt(result.p50)} sub="Median" />
            <KpiCard label="P90 Net Worth" value={fmt(result.p90)} color="text-green-500" sub="Optimistic" />
            <KpiCard label="Cash Negative %" value={`${result.probCashNegative}%`} color={result.probCashNegative > 30 ? 'text-red-400' : 'text-green-500'} />
            <KpiCard label="Needs Refinance %" value={`${result.probNeedRefinance}%`} />
          </div>

          {result.fanData.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Net Worth Fan Chart (P10 / P50 / P90)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={result.fanData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="mcFan" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `$${(v / 1e6).toFixed(1)}M`} tick={{ fontSize: 11 }} width={60} />
                    <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="p90" stroke="hsl(var(--chart-2))" fill="url(#mcFan)" name="P90 (Good)" strokeWidth={1.5} />
                    <Line type="monotone" dataKey="p50" stroke="hsl(var(--primary))" name="P50 (Median)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="p10" stroke="hsl(var(--destructive))" name="P10 (Bad)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {Object.keys(result.fireYearDistribution).length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">FIRE Year Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart
                    data={Object.entries(result.fireYearDistribution).map(([yr, cnt]) => ({ year: yr, pct: +((cnt / sims) * 100).toFixed(1) }))}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} width={40} />
                    <Tooltip formatter={(v: number) => `${v}% of simulations`} contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="pct" fill="hsl(var(--chart-2))" name="% of sims" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Compare Tab ──────────────────────────────────────────────────────────────

function CompareTab({ allResults, targetPassive, targetYear }:
  { allResults: { name: string; result: WiScenarioResult }[]; targetPassive: number; targetYear: number }) {
  if (allResults.length < 2) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Create at least 2 scenarios to compare them here.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[700px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {['Scenario', `NW ${targetYear}`, `Stock ${targetYear}`, `Crypto ${targetYear}`, 'Passive/mo', 'Gap/mo', 'FIRE', 'Risk', 'Feasibility', 'Status'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allResults.map(({ name, result }) => {
              const achieved = result.gapPerMonth <= 0;
              return (
                <tr key={name} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{name}</td>
                  <td className="px-3 py-2 tabular-nums">{fmt(result.netWorthTargetYear)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmt(result.stockValueTargetYear)}</td>
                  <td className="px-3 py-2 tabular-nums">{fmt(result.cryptoValueTargetYear)}</td>
                  <td className={`px-3 py-2 tabular-nums font-medium ${achieved ? 'text-green-500' : 'text-orange-500'}`}>{fmt(result.projectedPassiveIncome)}/mo</td>
                  <td className={`px-3 py-2 tabular-nums ${achieved ? 'text-green-500' : 'text-red-400'}`}>{achieved ? '✓' : fmt(result.gapPerMonth)}</td>
                  <td className="px-3 py-2">{result.fireYear ?? '—'}</td>
                  <td className={`px-3 py-2 ${riskColor(result.riskScore)}`}>{riskLabel(result.riskScore)}</td>
                  <td className={`px-3 py-2 ${feasColor(result.feasibilityScore)}`}>{feasLabel(result.feasibilityScore)}</td>
                  <td className="px-3 py-2">
                    {achieved ? <span className="text-green-500 font-medium">Goal achieved ✓</span>
                      : result.feasibilityScore >= 7 ? <span className="text-blue-400">Possible</span>
                      : <span className="text-muted-foreground">Needs changes</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Passive Income Comparison</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={allResults.map(r => ({ name: r.name.slice(0, 14), passive: Math.round(r.result.projectedPassiveIncome), target: targetPassive }))}
              margin={{ top: 4, right: 8, left: 0, bottom: 30 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" />
              <YAxis tickFormatter={v => `$${(v/1000).toFixed(0)}K`} tick={{ fontSize: 11 }} width={55} />
              <Tooltip formatter={(v: number) => `$${v.toLocaleString()}/mo`} contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="passive" fill="hsl(var(--chart-2))" name="Projected Passive/mo" radius={[3,3,0,0]} />
              <Bar dataKey="target"  fill="hsl(var(--destructive))" name="Target" radius={[3,3,0,0]} opacity={0.4} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Exit Strategy Tab ────────────────────────────────────────────────────────

const PIE_COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

function ExitStrategyTab({ result, scenario, properties, onExitResult }: {
  result: WiScenarioResult | null;
  scenario: WiScenario | null;
  properties: WiProperty[];
  onExitResult?: (er: ExitEventResult | null) => void;
}) {
  const [strategy, setStrategy] = useState<ExitStrategy>(() => ({
    ...DEFAULT_EXIT_STRATEGY,
    exitYear: scenario?.target_year ?? 2035,
  }));
  const [exitResult, setExitResult] = useState<ExitEventResult | null>(null);
  const [comparison, setComparison] = useState<HoldVsExitComparison[]>([]);
  const [showCgt, setShowCgt] = useState(false);
  const [marginalTax, setMarginalTax] = useState(37);

  // Update exitYear when scenario changes
  useEffect(() => {
    if (scenario) setStrategy(s => ({ ...s, exitYear: scenario.target_year }));
  }, [scenario?.target_year]);

  // Derive property values at exit year from forecast result
  const propValuesAtExit = (() => {
    if (!result || !properties.length) return [];
    const exitYr = strategy.exitYear;
    const yr = result.years.find(y => y.year === exitYr) ?? result.years[result.years.length - 1];
    if (!yr) return [];
    // distribute ipValues proportionally across non-PPOR properties by purchase price weight
    const ips = properties.filter(p => !p.is_ppor);
    const totalPurchase = ips.reduce((s, p) => s + safeN(p.purchase_price), 0);
    if (totalPurchase === 0) return [];
    return ips.map(p => {
      const weight = safeN(p.purchase_price) / totalPurchase;
      const exitYrYear = strategy.exitYear;
      const purchaseYr = p.purchase_year ?? 2026;
      const yearsOwned = exitYrYear - purchaseYr;
      const ass = { property_growth: 7 }; // approximate
      const propV = safeN(p.purchase_price) * Math.pow(1 + 0.07, Math.max(0, yearsOwned));
      // loan balance at exit
      const rate = safeN(p.interest_rate) / 100 || 0.0625;
      let lbal = safeN(p.loan_amount);
      if (p.loan_type === 'PI' && yearsOwned > 0) {
        const mr = rate / 12;
        const n = p.loan_term_years * 12;
        const pm = Math.min(yearsOwned * 12, n);
        if (mr > 0) {
          const pmt = lbal * (mr * Math.pow(1 + mr, n)) / (Math.pow(1 + mr, n) - 1);
          for (let m = 0; m < pm; m++) {
            const int = lbal * mr;
            lbal = Math.max(0, lbal - (pmt - int));
          }
        }
      }
      return {
        id: p.id ?? 0,
        label: p.property_name,
        value: propV,
        loanBalance: lbal,
        purchasePrice: safeN(p.purchase_price),
        purchaseYear: purchaseYr,
      };
    });
  })();

  function runExit() {
    if (!result) return;
    const exitYr = strategy.exitYear;
    const yr = result.years.find(y => y.year === exitYr) ?? result.years[result.years.length - 1];
    if (!yr) return;

    const er = runExitEvent({
      strategy,
      properties,
      stockValueAtExit: yr.stockValue * (strategy.assets.stocksPct / 100),
      cryptoValueAtExit: yr.cryptoValue * (strategy.assets.cryptoPct / 100),
      propertyValuesAtExit: propValuesAtExit,
      marginalTaxRate: marginalTax / 100,
      currentYear: 2026,
    });
    setExitResult(er);
    onExitResult?.(er);

    if (result) {
      const comp = buildHoldVsExitComparison({
        holdResult: result,
        exitResult: er,
        targetYear: scenario?.target_year ?? 2035,
      });
      setComparison(comp);
    }
  }

  // Update strategy helper
  const updS = (patch: Partial<ExitStrategy>) => setStrategy(s => ({ ...s, ...patch }));
  const updA = (patch: Partial<ExitStrategy['assets']>) => setStrategy(s => ({ ...s, assets: { ...s.assets, ...patch } }));
  const updR = (patch: Partial<ExitStrategy['reinvestment']>) => setStrategy(s => ({ ...s, reinvestment: { ...s.reinvestment, ...patch } }));
  const updI = (patch: Partial<ExitStrategy['income']>) => setStrategy(s => ({ ...s, income: { ...s.income, ...patch } }));

  // Donut data for reinvestment allocation
  const donutData = [
    { name: 'ETF Growth', value: strategy.reinvestment.etfGrowthPct },
    { name: 'ETF Dividend', value: strategy.reinvestment.etfDividendPct },
    { name: 'Bonds', value: strategy.reinvestment.bondsPct },
    { name: 'Cash', value: strategy.reinvestment.cashPct },
  ].filter(d => d.value > 0);

  // Income preview (live, no exit event needed)
  const incomePreview = exitResult
    ? null
    : (() => {
        const exitYr = result?.years.find(y => y.year === strategy.exitYear) ?? result?.years[result.years.length - 1];
        if (!exitYr) return null;
        const approxNet = (exitYr.ipValues - exitYr.ipLoans) * (strategy.assets.sellAllIPs ? 1 : 0.5)
          + exitYr.stockValue * (strategy.assets.stocksPct / 100)
          + exitYr.cryptoValue * (strategy.assets.cryptoPct / 100);
        if (approxNet <= 0) return null;
        return calcReinvestmentIncome({ netProceeds: approxNet, allocation: strategy.reinvestment, income: strategy.income });
      })();

  if (!result) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Run a scenario forecast first to use Exit Strategy.</div>;
  }

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 flex items-start gap-3">
        <LogOut className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold text-sm text-orange-500 mb-0.5">Exit Strategy Simulator</div>
          <div className="text-xs text-muted-foreground">
            Simulate selling assets at a target year, converting proceeds into a stable income-generating portfolio.
            Compare "Hold" vs "Exit" to find your optimal wealth-to-income transition.
          </div>
        </div>
      </div>

      {/* ── SECTION 1: Exit Event ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Settings2 className="w-4 h-4 text-primary" /> Exit Event Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Exit Year</Label>
              <Select value={String(strategy.exitYear)} onValueChange={v => updS({ exitYear: parseInt(v) })}>
                <SelectTrigger className="h-8 text-sm mt-0.5" data-testid="exit-year-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 20 }, (_, i) => 2026 + i).map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Selling Costs (%)</Label>
              <Input type="number" step="0.1" min="0" max="10"
                value={strategy.sellingCostsPct}
                onChange={e => updS({ sellingCostsPct: safeN(e.target.value) })}
                className="h-8 text-sm mt-0.5" data-testid="exit-selling-costs" />
              <div className="text-xs text-muted-foreground mt-0.5">Agent fees, conveyancing etc.</div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Your Marginal Tax Rate (%)</Label>
              <Select value={String(marginalTax)} onValueChange={v => setMarginalTax(parseInt(v))}>
                <SelectTrigger className="h-8 text-sm mt-0.5" data-testid="exit-tax-rate"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="19">19% — $18,201–$45,000</SelectItem>
                  <SelectItem value="32">32.5% — $45,001–$120,000</SelectItem>
                  <SelectItem value="37">37% — $120,001–$180,000</SelectItem>
                  <SelectItem value="45">45% — $180,001+</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assets to sell */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Assets to Liquidate</div>
            <div className="space-y-3">
              {/* Properties */}
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Home className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Investment Properties</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Sell all IPs</Label>
                    <Switch
                      checked={strategy.assets.sellAllIPs}
                      onCheckedChange={v => updA({ sellAllIPs: v })}
                      data-testid="exit-sell-all-ips"
                    />
                  </div>
                </div>
                {!strategy.assets.sellAllIPs && propValuesAtExit.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {propValuesAtExit.map(pv => (
                      <div key={pv.id} className="flex items-center gap-2 text-xs">
                        <input type="checkbox"
                          className="rounded"
                          checked={strategy.assets.propertyIds.includes(pv.id)}
                          onChange={e => {
                            const ids = e.target.checked
                              ? [...strategy.assets.propertyIds, pv.id]
                              : strategy.assets.propertyIds.filter(id => id !== pv.id);
                            updA({ propertyIds: ids });
                          }}
                          data-testid={`exit-prop-${pv.id}`}
                        />
                        <span>{pv.label}</span>
                        <span className="text-muted-foreground">{fmt(pv.value)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {strategy.assets.sellAllIPs && propValuesAtExit.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Will sell: {propValuesAtExit.map(p => p.label).join(', ')}
                    {' · '}Gross: {fmt(propValuesAtExit.reduce((s, p) => s + p.value, 0))}
                    {' · '}Loans: {fmt(propValuesAtExit.reduce((s, p) => s + p.loanBalance, 0))}
                  </div>
                )}
              </div>

              {/* Stocks */}
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Stocks / ETFs — sell {strategy.assets.stocksPct}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <input type="range" min="0" max="100" step="5"
                    value={strategy.assets.stocksPct}
                    onChange={e => updA({ stocksPct: safeN(e.target.value) })}
                    className="flex-1" data-testid="exit-stocks-pct" />
                  <span className="text-sm font-bold w-10 text-right">{strategy.assets.stocksPct}%</span>
                </div>
                {result && (() => {
                  const yr = result.years.find(y => y.year === strategy.exitYear) ?? result.years[result.years.length - 1];
                  return yr ? <div className="text-xs text-muted-foreground mt-1">
                    Value at exit: {fmt(yr.stockValue)} → selling {fmt(yr.stockValue * strategy.assets.stocksPct / 100)}
                  </div> : null;
                })()}
              </div>

              {/* Crypto */}
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Bitcoin className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Crypto — sell {strategy.assets.cryptoPct}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <input type="range" min="0" max="100" step="5"
                    value={strategy.assets.cryptoPct}
                    onChange={e => updA({ cryptoPct: safeN(e.target.value) })}
                    className="flex-1" data-testid="exit-crypto-pct" />
                  <span className="text-sm font-bold w-10 text-right">{strategy.assets.cryptoPct}%</span>
                </div>
                {result && (() => {
                  const yr = result.years.find(y => y.year === strategy.exitYear) ?? result.years[result.years.length - 1];
                  return yr ? <div className="text-xs text-muted-foreground mt-1">
                    Value at exit: {fmt(yr.cryptoValue)} → selling {fmt(yr.cryptoValue * strategy.assets.cryptoPct / 100)}
                  </div> : null;
                })()}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── SECTION 2: Reinvestment Allocation ───────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><PieChart className="w-4 h-4 text-primary" /> Reinvestment Allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-5">
            {/* Sliders */}
            <div className="space-y-3">
              {([
                ['ETF Growth (VGS/VAS)', 'etfGrowthPct', 'chart-1'],
                ['ETF Dividend (VHY)', 'etfDividendPct', 'chart-2'],
                ['Bonds / Fixed Income', 'bondsPct', 'chart-3'],
                ['Cash / HISA', 'cashPct', 'chart-4'],
              ] as [string, keyof ExitStrategy['reinvestment'], string][]).map(([label, field]) => (
                <div key={field}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{strategy.reinvestment[field]}%</span>
                  </div>
                  <input type="range" min="0" max="100" step="5"
                    value={strategy.reinvestment[field]}
                    onChange={e => updR({ [field]: safeN(e.target.value) })}
                    className="w-full"
                    data-testid={`reinvest-${field}`}
                  />
                </div>
              ))}
              <div className="text-xs text-muted-foreground">
                Total: {strategy.reinvestment.etfGrowthPct + strategy.reinvestment.etfDividendPct + strategy.reinvestment.bondsPct + strategy.reinvestment.cashPct}%
                {' '}(auto-normalised on calculation)
              </div>
            </div>
            {/* Donut chart */}
            <div className="flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height={160}>
                <RPieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                    dataKey="value" nameKey="name" paddingAngle={2}>
                    {donutData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ fontSize: 11 }} />
                </RPieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
                {donutData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-muted-foreground">{d.name}: {d.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── SECTION 3: Income Mode ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Banknote className="w-4 h-4 text-primary" /> Income Mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mode selector */}
          <div className="grid grid-cols-3 gap-2">
            {([
              ['swr', 'Safe Withdrawal', 'Withdraw % of portfolio annually. Historically safe.'],
              ['yield', 'Yield-Based', 'Live off dividends/coupons only. No capital erosion.'],
              ['hybrid', 'Hybrid', 'Growth ETF stays invested. Income from yield + SWR on rest.'],
            ] as [ExitStrategy['income']['mode'], string, string][]).map(([mode, label, desc]) => (
              <button key={mode}
                onClick={() => updI({ mode })}
                data-testid={`income-mode-${mode}`}
                className={`rounded-lg border p-3 text-left transition-colors ${strategy.income.mode === mode
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/40'}`}
              >
                <div className="text-xs font-medium mb-1">{label}</div>
                <div className="text-xs text-muted-foreground leading-tight">{desc}</div>
              </button>
            ))}
          </div>

          {/* Mode-specific controls */}
          {strategy.income.mode === 'swr' && (
            <div className="grid grid-cols-3 gap-2">
              {[3, 3.5, 4].map(rate => (
                <button key={rate}
                  onClick={() => updI({ swrPct: rate })}
                  data-testid={`swr-rate-${rate}`}
                  className={`rounded-lg border p-3 text-center transition-colors ${strategy.income.swrPct === rate
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/40'}`}
                >
                  <div className="text-lg font-bold">{rate}%</div>
                  <div className="text-xs text-muted-foreground">
                    {rate === 3 ? 'Ultra-safe' : rate === 3.5 ? 'Conservative' : 'Standard (Trinity)'}
                  </div>
                </button>
              ))}
            </div>
          )}

          {strategy.income.mode === 'yield' && (
            <div>
              <Label className="text-xs text-muted-foreground">Target Dividend / Coupon Yield (%)</Label>
              <div className="flex items-center gap-3 mt-1">
                <input type="range" min="3" max="8" step="0.5"
                  value={strategy.income.dividendYieldPct}
                  onChange={e => updI({ dividendYieldPct: safeN(e.target.value) })}
                  className="flex-1" data-testid="yield-pct-slider" />
                <span className="text-sm font-bold w-12 text-right">{strategy.income.dividendYieldPct}%</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                VHY 2025 yield ≈ 5.5%. Higher yield = more income but lower growth potential.
              </div>
            </div>
          )}

          {strategy.income.mode === 'hybrid' && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Growth ETF kept for compounding (%)</Label>
                <div className="flex items-center gap-3 mt-1">
                  <input type="range" min="10" max="70" step="5"
                    value={strategy.income.hybridGrowthReinvestPct}
                    onChange={e => updI({ hybridGrowthReinvestPct: safeN(e.target.value) })}
                    className="flex-1" data-testid="hybrid-growth-pct" />
                  <span className="text-sm font-bold w-12 text-right">{strategy.income.hybridGrowthReinvestPct}%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">SWR on income pool (%)</Label>
                  <Input type="number" step="0.5" min="1" max="6"
                    value={strategy.income.swrPct}
                    onChange={e => updI({ swrPct: safeN(e.target.value) })}
                    className="h-8 text-sm mt-0.5" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Dividend yield on income ETF (%)</Label>
                  <Input type="number" step="0.5" min="1" max="8"
                    value={strategy.income.dividendYieldPct}
                    onChange={e => updI({ dividendYieldPct: safeN(e.target.value) })}
                    className="h-8 text-sm mt-0.5" />
                </div>
              </div>
            </div>
          )}

          {/* Live income preview */}
          {incomePreview && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="text-xs font-medium text-primary mb-1">Estimated Income Preview (before CGT)</div>
              <div className="text-2xl font-bold text-primary">{fmt(incomePreview.monthlyIncome)}<span className="text-sm font-normal text-muted-foreground">/month</span></div>
              <div className="text-xs text-muted-foreground">{fmt(incomePreview.annualIncome)}/year · Effective rate: {incomePreview.effectiveRate.toFixed(1)}%</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Run Button ───────────────────────────────────────────────────── */}
      <Button className="w-full" size="lg" onClick={runExit} data-testid="btn-run-exit">
        <LogOut className="w-4 h-4 mr-2" /> Calculate Exit Strategy
      </Button>

      {/* ── RESULTS ──────────────────────────────────────────────────────── */}
      {exitResult && (
        <>
          {/* Headline KPIs */}
          <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
            <div className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
              <Check className="w-4 h-4" />
              Exit in {exitResult.exitYear}: Your Wealth-to-Income Conversion
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold tabular-nums">{fmt(exitResult.totalNetProceeds)}</div>
                <div className="text-xs text-muted-foreground">Net Capital After Tax</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-500 tabular-nums">{fmt(exitResult.monthlyPassiveIncome)}</div>
                <div className="text-xs text-muted-foreground">Monthly Passive Income</div>
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums">{fmt(exitResult.annualPassiveIncome)}</div>
                <div className="text-xs text-muted-foreground">Annual Passive Income</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-500 tabular-nums">{exitResult.effectiveSWR.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">Effective Income Rate</div>
              </div>
            </div>
          </div>

          {/* Proceeds breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Wallet className="w-4 h-4 text-primary" /> Proceeds Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 mb-4 text-center">
                <div className="rounded-lg bg-muted/40 p-3">
                  <div className="text-lg font-bold tabular-nums">
                    {fmt(exitResult.propertyGrossValue + (exitResult.stockValueAtExit > 0 ? exitResult.stockValueAtExit / (strategy.assets.stocksPct / 100 || 1) * (strategy.assets.stocksPct / 100) : 0) + (exitResult.cryptoValueAtExit > 0 ? exitResult.cryptoValueAtExit / (strategy.assets.cryptoPct / 100 || 1) * (strategy.assets.cryptoPct / 100) : 0))}
                  </div>
                  <div className="text-xs text-muted-foreground">Gross Sale Value</div>
                </div>
                <div className="rounded-lg bg-red-500/10 p-3">
                  <div className="text-lg font-bold text-red-400 tabular-nums">-{fmt(exitResult.totalTaxOwed + exitResult.totalSellingCosts + exitResult.propertyLoansAtExit)}</div>
                  <div className="text-xs text-muted-foreground">CGT + Costs + Loans</div>
                </div>
                <div className="rounded-lg bg-green-500/10 p-3">
                  <div className="text-lg font-bold text-green-500 tabular-nums">{fmt(exitResult.totalNetProceeds)}</div>
                  <div className="text-xs text-muted-foreground">Net Cash to Deploy</div>
                </div>
              </div>

              {/* CGT detail toggle */}
              <button
                onClick={() => setShowCgt(!showCgt)}
                className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
                data-testid="toggle-cgt-detail"
              >
                {showCgt ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showCgt ? 'Hide' : 'Show'} per-asset CGT detail
              </button>

              {showCgt && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs min-w-[580px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {['Asset', 'Sale Price', 'Cost Base', 'Gross Gain', '50% Discount', 'Taxable Gain', 'Tax Owed', 'Net Proceeds'].map(h => (
                          <th key={h} className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {exitResult.cgtBreakdowns.map((c, i) => (
                        <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                          <td className="px-2 py-2 font-medium">{c.assetLabel}</td>
                          <td className="px-2 py-2 tabular-nums">{fmt(c.saleProceeds)}</td>
                          <td className="px-2 py-2 tabular-nums text-muted-foreground">{fmt(c.costBase)}</td>
                          <td className="px-2 py-2 tabular-nums text-orange-500">{fmt(c.grossGain)}</td>
                          <td className="px-2 py-2 tabular-nums text-green-500">-{fmt(c.cgtDiscount)}</td>
                          <td className="px-2 py-2 tabular-nums">{fmt(c.taxableGain)}</td>
                          <td className="px-2 py-2 tabular-nums text-red-400">-{fmt(c.taxOwed)}</td>
                          <td className="px-2 py-2 tabular-nums font-medium text-primary">{fmt(c.netProceeds)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted/30 font-semibold">
                        <td className="px-2 py-2">Total</td>
                        <td className="px-2 py-2 tabular-nums">{fmt(exitResult.cgtBreakdowns.reduce((s, c) => s + c.saleProceeds, 0))}</td>
                        <td className="px-2 py-2" />
                        <td className="px-2 py-2 tabular-nums text-orange-500">{fmt(exitResult.cgtBreakdowns.reduce((s, c) => s + c.grossGain, 0))}</td>
                        <td className="px-2 py-2 tabular-nums text-green-500">-{fmt(exitResult.cgtBreakdowns.reduce((s, c) => s + c.cgtDiscount, 0))}</td>
                        <td className="px-2 py-2 tabular-nums">{fmt(exitResult.cgtBreakdowns.reduce((s, c) => s + c.taxableGain, 0))}</td>
                        <td className="px-2 py-2 tabular-nums text-red-400">-{fmt(exitResult.totalTaxOwed)}</td>
                        <td className="px-2 py-2 tabular-nums text-primary">{fmt(exitResult.totalNetProceeds)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Portfolio deployment */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><PieChart className="w-4 h-4 text-primary" /> Portfolio Deployment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'ETF Growth', value: exitResult.etfGrowthValue, color: 'text-blue-400' },
                  { label: 'ETF Dividend', value: exitResult.etfDividendValue, color: 'text-green-400' },
                  { label: 'Bonds', value: exitResult.bondsValue, color: 'text-yellow-400' },
                  { label: 'Cash / HISA', value: exitResult.cashValue, color: 'text-purple-400' },
                ].map(({ label, value, color }) => value > 0 ? (
                  <div key={label} className="rounded-lg bg-muted/40 p-3 text-center">
                    <div className={`text-lg font-bold tabular-nums ${color}`}>{fmt(value)}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="text-xs text-muted-foreground/60">
                      {exitResult.totalNetProceeds > 0 ? `${(value / exitResult.totalNetProceeds * 100).toFixed(0)}%` : '—'}
                    </div>
                  </div>
                ) : null)}
              </div>
            </CardContent>
          </Card>

          {/* Hold vs Exit comparison */}
          {comparison.length === 2 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><ArrowRightLeft className="w-4 h-4 text-primary" /> Hold vs Exit — Decision Matrix</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[500px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Metric</th>
                        {comparison.map(c => (
                          <th key={c.strategy} className={`px-3 py-2 text-center font-medium ${c.strategy === 'exit' ? 'text-primary' : 'text-muted-foreground'}`}>
                            {c.strategy === 'hold' ? '🏠 Hold Strategy' : '🚪 Exit Strategy'}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        ['Passive Income', (c: HoldVsExitComparison) => `${fmt(c.passiveIncomeMonthly)}/mo`, 'income'],
                        ['Capital at Work', (c: HoldVsExitComparison) => fmt(c.capitalAtWork), ''],
                        ['Risk Level', (c: HoldVsExitComparison) => c.riskLabel, 'risk'],
                        ['Stability', (c: HoldVsExitComparison) => `${c.stabilityLabel} (${c.stabilityScore}/10)`, ''],
                        ['Income Sources', (c: HoldVsExitComparison) => c.primaryIncomeSources.join(', ') || '—', ''],
                      ] as [string, (c: HoldVsExitComparison) => string, string][]).map(([label, getter, type]) => (
                        <tr key={label} className="border-b border-border/40 hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium text-muted-foreground">{label}</td>
                          {comparison.map(c => {
                            const val = getter(c);
                            let cls = '';
                            if (type === 'income') {
                              const incomes = comparison.map(x => x.passiveIncomeMonthly);
                              cls = c.passiveIncomeMonthly === Math.max(...incomes) ? 'text-green-500 font-semibold' : '';
                            }
                            if (type === 'risk') {
                              cls = c.riskScore <= 3 ? 'text-green-500' : c.riskScore <= 6 ? 'text-yellow-500' : 'text-red-500';
                            }
                            return <td key={c.strategy} className={`px-3 py-2 text-center ${cls}`}>{val}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pros/Cons side by side */}
                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  {comparison.map(c => (
                    <div key={c.strategy}>
                      <div className="text-xs font-semibold mb-2 uppercase tracking-wide text-muted-foreground">
                        {c.strategy === 'hold' ? '🏠 Hold — Pros & Cons' : '🚪 Exit — Pros & Cons'}
                      </div>
                      <div className="space-y-1 mb-2">
                        {c.pros.map((p, i) => <div key={i} className="flex gap-1.5 text-xs"><span className="text-green-500 shrink-0">✓</span>{p}</div>)}
                      </div>
                      <div className="space-y-1">
                        {c.cons.map((p, i) => <div key={i} className="flex gap-1.5 text-xs"><span className="text-red-400 shrink-0">✗</span>{p}</div>)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Recommendation */}
                {comparison.length === 2 && (() => {
                  const [hold, exit] = comparison;
                  const exitBetter = exit.passiveIncomeMonthly > hold.passiveIncomeMonthly;
                  const winner = exitBetter ? exit : hold;
                  return (
                    <div className={`mt-4 rounded-lg p-3 border ${exitBetter ? 'border-primary/40 bg-primary/5' : 'border-green-500/40 bg-green-500/5'}`}>
                      <div className="flex items-center gap-2 text-xs font-semibold mb-1">
                        <ShieldCheck className="w-4 h-4 text-primary" />
                        Recommendation: {exitBetter ? 'Exit generates more income' : 'Hold generates more income'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {exitBetter
                          ? `Exiting in ${exit.strategy === 'exit' ? exitResult.exitYear : '—'} and reinvesting generates ${fmt(exit.passiveIncomeMonthly - hold.passiveIncomeMonthly)}/mo more than holding. Consider the ${fmt(exitResult.totalTaxOwed)} CGT cost vs. ${fmt((exit.passiveIncomeMonthly - hold.passiveIncomeMonthly) * 12)}/yr extra income.`
                          : `Holding generates ${fmt(hold.passiveIncomeMonthly - exit.passiveIncomeMonthly)}/mo more than exiting at these assumptions. Assets continue compounding and no CGT is triggered.`
                        }
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Goal Solver integration message */}
          <div className="rounded-lg border border-primary/20 bg-muted/30 p-3 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Goal Solver integration:</span> Switch to the Goal Solver tab — the solver now includes an exit strategy path ("Option F — Exit + Convert") using the income you've configured here.
          </div>
        </>
      )}
    </div>
  );
}


// ─── Decision Dashboard Summary Bar ──────────────────────────────────────────

function DecisionDashboard({ result, actionPlan, exitTiming, onTabSwitch }: {
  result: WiScenarioResult | null;
  actionPlan: ActionPlan | null;
  exitTiming: ExitTimingResult | null;
  onTabSwitch: (tab: string) => void;
}) {
  if (!result) return null;

  const gap = result.gapPerMonth;
  const gapPct = result.projectedPassiveIncome > 0
    ? gap / Math.max(result.projectedPassiveIncome, 1) * 100
    : 0;
  const onTrack = result.feasibilityScore >= 7;
  const exitImproves = exitTiming && exitTiming.rows.find(r => r.isOptimalTradeoff)
    ? (exitTiming.rows.find(r => r.isOptimalTradeoff)!.monthlyIncome - exitTiming.holdMonthlyIncome) > 200
    : false;

  return (
    <div className={`rounded-xl border-2 p-4 mb-4 ${onTrack ? 'border-green-500/30 bg-green-500/5' : 'border-orange-500/30 bg-orange-500/5'}`}>
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Navigation className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Decision Dashboard</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${onTrack ? 'bg-green-500/10 text-green-600 border-green-500/20' : 'bg-orange-500/10 text-orange-600 border-orange-500/20'}`}>
              {onTrack ? 'On Track' : 'Action Required'}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {actionPlan?.headline ?? 'Run forecast to see your plan'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Feasibility</span>
          <span className={`text-sm font-bold ${result.feasibilityScore >= 7 ? 'text-green-500' : result.feasibilityScore >= 5 ? 'text-yellow-500' : 'text-red-500'}`}>
            {result.feasibilityScore}/10
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <button onClick={() => onTabSwitch('overview')} className="rounded-lg bg-background/60 border border-border p-2.5 text-left hover:border-primary/40 transition-colors">
          <div className="text-xs text-muted-foreground mb-0.5">Monthly Passive</div>
          <div className="text-base font-bold tabular-nums text-primary">{fmt(result.projectedPassiveIncome)}</div>
        </button>
        <button onClick={() => onTabSwitch('overview')} className={`rounded-lg bg-background/60 border p-2.5 text-left hover:border-primary/40 transition-colors ${gap > 0 ? 'border-red-500/30' : 'border-green-500/30'}`}>
          <div className="text-xs text-muted-foreground mb-0.5">Gap to Goal</div>
          <div className={`text-base font-bold tabular-nums ${gap > 0 ? 'text-red-400' : 'text-green-500'}`}>
            {gap > 0 ? `-${fmt(gap)}` : `+${fmt(Math.abs(gap))}`}
          </div>
        </button>
        <button onClick={() => onTabSwitch('exit')} className={`rounded-lg bg-background/60 border p-2.5 text-left hover:border-primary/40 transition-colors ${exitImproves ? 'border-primary/40' : 'border-border'}`}>
          <div className="text-xs text-muted-foreground mb-0.5">Exit Outcome</div>
          <div className="text-base font-bold tabular-nums">
            {exitTiming ? fmt(exitTiming.maxMonthlyIncome) : '—'}
          </div>
          {exitImproves && <div className="text-xs text-primary">+{fmt((exitTiming!.rows.find(r => r.isOptimalTradeoff)?.monthlyIncome ?? 0) - exitTiming!.holdMonthlyIncome)}/mo gain</div>}
        </button>
        <button onClick={() => onTabSwitch('actions')} className="rounded-lg bg-background/60 border border-border p-2.5 text-left hover:border-primary/40 transition-colors">
          <div className="text-xs text-muted-foreground mb-0.5">Actions</div>
          <div className="text-base font-bold tabular-nums">
            {actionPlan ? actionPlan.actions.filter(a => a.priority === 'critical' || a.priority === 'high').length : '—'}
          </div>
          <div className="text-xs text-muted-foreground">High priority</div>
        </button>
      </div>

      {/* Best path strip */}
      {actionPlan && actionPlan.actions.length > 0 && (
        <div className="rounded-lg bg-background/60 border border-primary/20 p-2.5">
          <div className="text-xs font-medium text-primary mb-1.5 flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" /> Best Path
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {actionPlan.actions.filter(a => a.priority === 'critical' || a.priority === 'high').slice(0, 3).map((a, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <div className={`w-1.5 h-1.5 rounded-full ${a.priority === 'critical' ? 'bg-red-500' : 'bg-orange-400'}`} />
                <span className="font-medium">{a.title}</span>
                <span className="text-muted-foreground">{a.impact}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Impact Panel ─────────────────────────────────────────────────────────────

function ImpactPanel({ before, after }: { before: WiScenarioResult | null; after: WiScenarioResult | null }) {
  if (!before || !after) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-4 text-center text-xs text-muted-foreground">
        Make changes to any scenario input — impact will appear here instantly.
      </div>
    );
  }

  const impact = runImpactEngine({ before, after, changeSummary: 'Scenario inputs modified' });

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-semibold">Impact Analysis</span>
        <span className="text-xs text-muted-foreground ml-auto">{impact.summary}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {impact.deltas.slice(0, 6).map(d => (
          <div key={d.label} className="rounded-lg bg-background/60 border border-border p-2.5">
            <div className="text-xs text-muted-foreground mb-0.5">{d.label}</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold tabular-nums">
                {d.unit === '/10' ? d.after.toFixed(1) : d.unit === '$/mo' || d.unit === '$/yr' || d.unit === '$' ? fmt(d.after) : d.after.toFixed(1)}
              </span>
              {d.delta !== 0 && (
                <span className={`text-xs tabular-nums font-medium ${d.direction === 'up' ? (d.unit === '/10' && d.label.includes('Risk') ? 'text-red-400' : 'text-green-500') : (d.unit === '/10' && d.label.includes('Risk') ? 'text-green-500' : 'text-red-400')}`}>
                  {d.direction === 'up' ? '▲' : '▼'} {d.unit === '$' || d.unit === '$/mo' || d.unit === '$/yr' ? fmt(Math.abs(d.delta)) : Math.abs(d.delta).toFixed(1)}{d.unit === '/10' ? '' : ''}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {/* FIRE shift */}
      {impact.fireYearBefore !== impact.fireYearAfter && (
        <div className="mt-2 rounded-lg bg-background/60 border border-border p-2.5 text-xs flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">FIRE year:</span>
          <span className="font-medium">{impact.fireYearBefore ?? '—'}</span>
          <ArrowRight className="w-3 h-3 text-muted-foreground" />
          <span className={`font-bold ${impact.fireYearAfter !== null && impact.fireYearBefore !== null && impact.fireYearAfter < impact.fireYearBefore ? 'text-green-500' : 'text-red-400'}`}>
            {impact.fireYearAfter ?? '—'}
          </span>
          {impact.fireYearAfter !== null && impact.fireYearBefore !== null && (
            <span className={`${impact.fireYearAfter < impact.fireYearBefore ? 'text-green-500' : 'text-red-400'}`}>
              ({impact.fireYearAfter < impact.fireYearBefore ? '-' : '+'}{Math.abs(impact.fireYearAfter - impact.fireYearBefore)}yr)
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Exit Timing Optimiser Tab ────────────────────────────────────────────────

function ExitTimingTab({ result, scenario, properties, exitStrategy, onTimingResult }: {
  result: WiScenarioResult | null;
  scenario: WiScenario | null;
  properties: WiProperty[];
  exitStrategy: ExitStrategy;
  onTimingResult?: (tr: ExitTimingResult) => void;
}) {
  const [timingResult, setTimingResult] = useState<ExitTimingResult | null>(null);
  const [running, setRunning] = useState(false);
  const [marginalTax, setMarginalTax] = useState(37);
  const [startYear, setStartYear] = useState(2028);
  const [endYear, setEndYear] = useState(2044);
  const [showAll, setShowAll] = useState(false);

  async function run() {
    if (!result || running) return;
    setRunning(true);
    await new Promise(r => setTimeout(r, 20));
    try {
      const tr = runExitTimingOptimiser({
        startYear, endYear, strategy: exitStrategy, properties,
        forecastResult: result, marginalTaxRate: marginalTax / 100, currentYear: 2026,
      });
      setTimingResult(tr);
      onTimingResult?.(tr);
    } finally { setRunning(false); }
  }

  const displayRows = timingResult ? (showAll ? timingResult.rows : timingResult.rows.filter(
    r => r.isOptimalIncome || r.isOptimalTradeoff || timingResult.rows.indexOf(r) % 2 === 0
  )) : [];

  if (!result) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Run a scenario forecast first.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
        <Calendar className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold text-sm text-amber-500 mb-0.5">Exit Timing Optimiser</div>
          <div className="text-xs text-muted-foreground">
            Simulates your exit strategy across every year in the range. Identifies the year that maximises income and the year with the best income-vs-CGT tradeoff.
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div>
              <Label className="text-xs text-muted-foreground">From Year</Label>
              <Select value={String(startYear)} onValueChange={v => setStartYear(parseInt(v))}>
                <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 15 }, (_, i) => 2027 + i).map(y =>
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">To Year</Label>
              <Select value={String(endYear)} onValueChange={v => setEndYear(parseInt(v))}>
                <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 15 }, (_, i) => 2030 + i).map(y =>
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Marginal Tax Rate</Label>
              <Select value={String(marginalTax)} onValueChange={v => setMarginalTax(parseInt(v))}>
                <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="19">19%</SelectItem>
                  <SelectItem value="32">32.5%</SelectItem>
                  <SelectItem value="37">37%</SelectItem>
                  <SelectItem value="45">45%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button className="w-full h-8 text-sm" onClick={run} disabled={running} data-testid="btn-run-timing">
                {running ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Activity className="w-3.5 h-3.5 mr-1.5" />}
                {running ? 'Running…' : 'Optimise'}
              </Button>
            </div>
          </div>

          {/* Legend */}
          {timingResult && (
            <div className="flex flex-wrap gap-4 mb-3 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-green-500/20 border border-green-500/40" />
                <span>Best income year ({timingResult.optimalIncomeYear})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-blue-500/20 border border-blue-500/40" />
                <span>Best tradeoff year ({timingResult.optimalTradeoffYear})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Hold income: {fmt(timingResult.holdMonthlyIncome)}/mo</span>
              </div>
            </div>
          )}

          {timingResult && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[760px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {[
                        'Year', 'Net Equity', 'CGT', 'Selling Costs', 'Net Proceeds',
                        'Monthly Income', 'Annual Income', 'Eff. Rate%', 'Income vs Tax', 'CGT Recoup'
                      ].map(h => <th key={h} className="px-2 py-2 text-left text-muted-foreground font-medium whitespace-nowrap">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map(r => (
                      <tr key={r.year}
                        className={`border-b border-border/40 transition-colors
                          ${r.isOptimalIncome ? 'bg-green-500/10' : ''}
                          ${r.isOptimalTradeoff && !r.isOptimalIncome ? 'bg-blue-500/10' : ''}
                          ${!r.isOptimalIncome && !r.isOptimalTradeoff ? 'hover:bg-muted/20' : ''}
                        `}
                        data-testid={`timing-row-${r.year}`}
                      >
                        <td className="px-2 py-2 font-bold flex items-center gap-1">
                          {r.year}
                          {r.isOptimalIncome && <span className="text-green-500 text-xs">★max</span>}
                          {r.isOptimalTradeoff && !r.isOptimalIncome && <span className="text-blue-400 text-xs">★best</span>}
                        </td>
                        <td className="px-2 py-2 tabular-nums">{fmt(r.grossEquity)}</td>
                        <td className="px-2 py-2 tabular-nums text-red-400">-{fmt(r.totalCgt)}</td>
                        <td className="px-2 py-2 tabular-nums text-muted-foreground">-{fmt(r.totalSellingCosts)}</td>
                        <td className="px-2 py-2 tabular-nums font-medium text-primary">{fmt(r.netProceeds)}</td>
                        <td className="px-2 py-2 tabular-nums font-bold text-green-500">{fmt(r.monthlyIncome)}/mo</td>
                        <td className="px-2 py-2 tabular-nums">{fmt(r.annualIncome)}/yr</td>
                        <td className="px-2 py-2 tabular-nums">{r.effectiveRate.toFixed(1)}%</td>
                        <td className={`px-2 py-2 tabular-nums ${r.incomeVsCgt >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                          {r.incomeVsCgt >= 0 ? '+' : ''}{fmt(r.incomeVsCgt)}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-muted-foreground">
                          {r.yearsToRecoupCgt === Infinity ? '∞' : r.yearsToRecoupCgt.toFixed(1) + 'yr'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="mt-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showAll ? 'Show key rows only' : `Show all ${timingResult.rows.length} years`}
              </button>

              {/* Recommendation */}
              <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="text-xs font-semibold text-primary mb-1 flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5" /> Timing Recommendation
                </div>
                {timingResult.optimalIncomeYear === timingResult.optimalTradeoffYear ? (
                  <div className="text-xs text-muted-foreground">
                    <span className="text-foreground font-medium">{timingResult.optimalIncomeYear}</span> is both the highest-income and best tradeoff exit year. Strong signal — this is your target exit year.
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    <span className="text-green-500 font-medium">{timingResult.optimalIncomeYear}</span> maximises income ({fmt(timingResult.maxMonthlyIncome)}/mo).{' '}
                    <span className="text-blue-400 font-medium">{timingResult.optimalTradeoffYear}</span> offers the best income-after-tax tradeoff.
                    {timingResult.optimalTradeoffYear < timingResult.optimalIncomeYear
                      ? ' Exiting earlier may save on CGT while still delivering strong income.'
                      : ' A later exit lets assets compound further before conversion.'}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Action Recommendation Engine Tab ────────────────────────────────────────

const ACTION_PRIORITY_COLORS: Record<string, string> = {
  critical: 'border-red-500/40 bg-red-500/5 text-red-500',
  high:     'border-orange-500/40 bg-orange-500/5 text-orange-500',
  medium:   'border-yellow-500/40 bg-yellow-500/5 text-yellow-600',
  low:      'border-blue-500/40 bg-blue-500/5 text-blue-400',
};
const ACTION_CATEGORY_ICONS: Record<string, any> = {
  property: Home, stocks: TrendingUp, crypto: Bitcoin,
  cashflow: DollarSign, exit: LogOut, debt: TrendingDown, super: ShieldCheck,
};

function ActionEngineTab({ scenario, result, exitTiming, snap, properties, stockPlans, cryptoPlans, onPlanReady }: {
  scenario: WiScenario | null;
  result: WiScenarioResult | null;
  exitTiming: ExitTimingResult | null;
  snap: any;
  properties: WiProperty[];
  stockPlans: WiStockPlan[];
  cryptoPlans: WiCryptoPlan[];
  onPlanReady?: (p: ActionPlan) => void;
}) {
  const [plan, setPlan] = useState<ActionPlan | null>(null);
  const [running, setRunning] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  async function generate() {
    if (!scenario || !result || running) return;
    setRunning(true);
    await new Promise(r => setTimeout(r, 30));
    try {
      const p = runActionRecommendationEngine({ scenario, result, exitTiming: exitTiming ?? undefined, snap, properties, stockPlans, cryptoPlans });
      setPlan(p);
      onPlanReady?.(p);
    } finally { setRunning(false); }
  }

  if (!result) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Run a scenario forecast first.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 flex items-start gap-3">
        <ListChecks className="w-5 h-5 text-violet-500 mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold text-sm text-violet-500 mb-0.5">Action Recommendation Engine</div>
          <div className="text-xs text-muted-foreground">
            Analyses your scenario and produces a concrete, prioritised action plan. Respects cashflow constraints, borrowing capacity, and exit timing data.
          </div>
        </div>
      </div>

      <Button className="w-full" onClick={generate} disabled={running} data-testid="btn-generate-plan">
        {running ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lightbulb className="w-4 h-4 mr-2" />}
        {running ? 'Generating plan…' : 'Generate Action Plan'}
      </Button>

      {plan && (
        <>
          {/* Headline */}
          <div className={`rounded-xl border-2 p-4 ${plan.scenarioOutcome.feasibleByTargetYear ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
            <div className={`font-bold text-base mb-0.5 ${plan.scenarioOutcome.feasibleByTargetYear ? 'text-green-500' : 'text-red-400'}`}>
              {plan.headline}
            </div>
            <div className="text-sm text-muted-foreground">{plan.subheadline}</div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div className="text-center">
                <div className="text-lg font-bold tabular-nums">{fmt(plan.scenarioOutcome.currentMonthlyPassive)}</div>
                <div className="text-xs text-muted-foreground">Current Projection</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold tabular-nums text-primary">{fmt(plan.scenarioOutcome.targetMonthlyPassive)}</div>
                <div className="text-xs text-muted-foreground">Target</div>
              </div>
              <div className={`text-center`}>
                <div className={`text-lg font-bold tabular-nums ${plan.scenarioOutcome.gap > 0 ? 'text-red-400' : 'text-green-500'}`}>
                  {plan.scenarioOutcome.gap > 0 ? `-${fmt(plan.scenarioOutcome.gap)}` : `+${fmt(Math.abs(plan.scenarioOutcome.gap))}`}
                </div>
                <div className="text-xs text-muted-foreground">Gap</div>
              </div>
            </div>
          </div>

          {/* Actions list */}
          <div className="space-y-3">
            {plan.actions.map((action, i) => {
              const IconComp = ACTION_CATEGORY_ICONS[action.category] ?? Target;
              const expanded = expandedIdx === i;
              return (
                <div key={i}
                  className={`rounded-xl border p-4 ${ACTION_PRIORITY_COLORS[action.priority]}`}
                  data-testid={`action-item-${i}`}
                >
                  <div className="flex items-start justify-between gap-2 cursor-pointer"
                    onClick={() => setExpandedIdx(expanded ? null : i)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`rounded-lg p-1.5 border ${ACTION_PRIORITY_COLORS[action.priority]}`}>
                        <IconComp className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{action.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{action.timeframe}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-green-500">{action.impact}</span>
                      {!action.feasible && <span className="text-xs text-red-400 border border-red-400/30 rounded px-1.5 py-0.5">Constrained</span>}
                      <span className={`text-xs border rounded px-1.5 py-0.5 ${ACTION_PRIORITY_COLORS[action.priority]}`}>{action.priority}</span>
                      {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                    </div>
                  </div>
                  {expanded && (
                    <div className="mt-3 pt-3 border-t border-current/10">
                      <p className="text-xs text-muted-foreground mb-2">{action.detail}</p>
                      {action.blockers && action.blockers.length > 0 && (
                        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2 mt-2">
                          <div className="text-xs font-medium text-red-400 mb-1">Blockers</div>
                          {action.blockers.map((b, bi) => (
                            <div key={bi} className="text-xs text-muted-foreground flex items-start gap-1.5">
                              <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                              {b}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Exit recommendation */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><LogOut className="w-4 h-4 text-primary" /> Exit Strategy Recommendation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`rounded-lg border p-3 ${plan.exitRecommendation.recommended ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {plan.exitRecommendation.recommended
                    ? <Check className="w-4 h-4 text-green-500" />
                    : <Info className="w-4 h-4 text-muted-foreground" />}
                  <span className={`text-sm font-medium ${plan.exitRecommendation.recommended ? 'text-green-500' : 'text-muted-foreground'}`}>
                    {plan.exitRecommendation.recommended ? 'Exit Strategy Recommended' : 'Exit Strategy Optional'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{plan.exitRecommendation.summary}</p>
                {plan.exitRecommendation.recommended && (
                  <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
                    <div className="rounded bg-background/60 border border-border p-2">
                      <div className="font-bold">{plan.exitRecommendation.optimalYear}</div>
                      <div className="text-muted-foreground">Optimal Year</div>
                    </div>
                    <div className="rounded bg-background/60 border border-border p-2">
                      <div className="font-bold text-green-500">+{fmt(plan.exitRecommendation.incomeGain)}/mo</div>
                      <div className="text-muted-foreground">Income Gain</div>
                    </div>
                    <div className="rounded bg-background/60 border border-border p-2">
                      <div className="font-bold">{plan.exitRecommendation.yearsToRecoup.toFixed(1)}yr</div>
                      <div className="text-muted-foreground">Recoup CGT</div>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Scenario Comparison Tab (upgraded) ──────────────────────────────────────

function ScenarioComparisonTab({ allResults, activeId, baseId }: {
  allResults: { name: string; result: WiScenarioResult }[];
  activeId: number | null;
  baseId: number | null;
}) {
  if (allResults.length === 0) {
    return <div className="text-center py-12 text-muted-foreground text-sm">Create multiple scenarios to compare them side by side.</div>;
  }

  const rows = buildScenarioComparison({
    results: allResults.map(r => ({
      name: r.name,
      scenarioId: r.result.scenarioId,
      result: r.result,
    })),
    activeId: activeId ?? -1,
    baseId,
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground flex items-center gap-2">
        <BookOpen className="w-4 h-4 shrink-0" />
        Comparing {rows.length} scenario{rows.length !== 1 ? 's' : ''}. Green = above base, red = below base. Base scenario is the reference.
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[700px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {['Scenario', 'Monthly Income', 'Net Worth', 'Capital Gap', 'FIRE Year', 'Feasibility', 'Risk', 'vs Base Income'].map(h => (
                <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.scenarioId}
                className={`border-b border-border/40 transition-colors ${r.isActive ? 'bg-primary/5' : 'hover:bg-muted/20'}`}
                data-testid={`compare-row-${r.scenarioId}`}
              >
                <td className="px-3 py-2.5">
                  <div className="font-medium">{r.scenarioName}</div>
                  <div className="flex gap-1 mt-0.5">
                    {r.isBase && <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded px-1">Base</span>}
                    {r.isActive && <span className="text-xs bg-primary/10 text-primary border border-primary/20 rounded px-1">Active</span>}
                  </div>
                </td>
                <td className="px-3 py-2.5 tabular-nums font-bold text-primary">{fmt(r.passiveIncomeMonthly)}/mo</td>
                <td className="px-3 py-2.5 tabular-nums">{fmt(r.netWorthAtTarget)}</td>
                <td className={`px-3 py-2.5 tabular-nums ${r.capitalGap > 0 ? 'text-red-400' : 'text-green-500'}`}>
                  {r.capitalGap > 0 ? `-${fmt(r.capitalGap)}` : `Surplus ${fmt(Math.abs(r.capitalGap))}`}
                </td>
                <td className="px-3 py-2.5 tabular-nums">{r.fireYear ?? '—'}</td>
                <td className="px-3 py-2.5">
                  <span className={`${r.feasibilityScore >= 7 ? 'text-green-500' : r.feasibilityScore >= 5 ? 'text-yellow-500' : 'text-red-500'} font-medium`}>
                    {r.feasibilityLabel} ({r.feasibilityScore}/10)
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`${r.riskScore <= 3 ? 'text-green-500' : r.riskScore <= 6 ? 'text-yellow-500' : 'text-red-500'} font-medium`}>
                    {r.riskLabel} ({r.riskScore}/10)
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {r.vsBase ? (
                    <span className={`font-medium tabular-nums ${r.vsBase.passiveIncomeDelta >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                      {r.vsBase.passiveIncomeDelta >= 0 ? '+' : ''}{fmt(r.vsBase.passiveIncomeDelta)}/mo
                      {r.vsBase.fireYearDelta !== null && r.vsBase.fireYearDelta !== 0 && (
                        <span className="ml-1 text-muted-foreground">({r.vsBase.fireYearDelta > 0 ? '+' : ''}{r.vsBase.fireYearDelta}yr FIRE)</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">Reference</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bar chart comparison */}
      {rows.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="w-4 h-4 text-primary" /> Monthly Passive Income Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={rows.map(r => ({ name: r.scenarioName.substring(0, 15), income: r.passiveIncomeMonthly, feasibility: r.feasibilityScore }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={v => `$${Math.round(v / 1000)}K`} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [`${fmt(v)}/mo`, 'Income']} contentStyle={{ fontSize: 11 }} />
                <Bar dataKey="income" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Assumption Warnings Banner ───────────────────────────────────────────────

function AssumptionWarningsBanner({ assumptions, stockPlans }: {
  assumptions: WiAssumption[];
  stockPlans: WiStockPlan[];
}) {
  const warnings = (() => {
    if (!assumptions.length) return [];
    const firstAss = assumptions[0];
    const avgStockYield = stockPlans.length > 0
      ? stockPlans.reduce((s, p) => s + p.dividend_yield, 0) / stockPlans.length
      : 3;
    return enforceReturnConstraints({
      stockReturn: firstAss.stocks_return,
      stockDividendYield: avgStockYield,
      cryptoReturn: firstAss.crypto_return,
      propertyGrowth: firstAss.property_growth,
      rentalYield: 4, // approximate
      reinvestYield: undefined,
    });
  })();

  if (!warnings.length) return null;

  return (
    <div className="space-y-1.5 mb-3">
      {warnings.map((w, i) => (
        <div key={i}
          className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs
            ${w.severity === 'error' ? 'border-red-500/40 bg-red-500/5 text-red-400'
            : w.severity === 'warning' ? 'border-yellow-500/40 bg-yellow-500/5 text-yellow-600'
            : 'border-blue-500/40 bg-blue-500/5 text-blue-400'}`}
          data-testid={`assumption-warning-${w.field}`}
        >
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{w.message}</span>
        </div>
      ))}
    </div>
  );
}


// ─── Assumptions Panel ────────────────────────────────────────────────────────

function AssumptionsPanel({ scenarioId, profile, onChanged }:
  { scenarioId: number; profile: string; onChanged?: () => void }) {
  const [rows, setRows]   = useState<WiAssumption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadScenarioAssumptions(scenarioId).then(loaded => {
      if (loaded.length === 0) {
        const base = PROFILE_DEFAULTS[profile as keyof typeof PROFILE_DEFAULTS] ?? PROFILE_DEFAULTS.moderate;
        const generated = Array.from({ length: 10 }, (_, i) => ({
          scenario_id: scenarioId,
          year: 2026 + i,
          property_growth: base.property_growth,
          stocks_return: base.stocks_return,
          crypto_return: base.crypto_return,
          super_return: base.super_return,
          inflation: base.inflation,
          income_growth: base.income_growth,
          expense_growth: base.expense_growth,
          interest_rate: base.interest_rate,
          rent_growth: base.rent_growth,
        }));
        setRows(generated);
      } else {
        setRows(loaded);
      }
      setLoading(false);
    });
  }, [scenarioId, profile]);

  async function update(idx: number, field: keyof WiAssumption, value: number) {
    const updated = rows.map((r, i) => i === idx ? { ...r, [field]: value } : r);
    setRows(updated);
    await saveAssumptions([updated[idx]]);
    onChanged?.();
  }

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="animate-spin w-4 h-4 text-muted-foreground" /></div>;

  const COLS: [string, keyof WiAssumption][] = [
    ['Year', 'year'], ['Prop G%', 'property_growth'], ['Stocks%', 'stocks_return'],
    ['Crypto%', 'crypto_return'], ['Super%', 'super_return'], ['Inflation%', 'inflation'],
    ['Income G%', 'income_growth'], ['Exp G%', 'expense_growth'],
    ['Int Rate%', 'interest_rate'], ['Rent G%', 'rent_growth'],
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[700px]">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {COLS.map(([h]) => <th key={h} className="px-2 py-2 text-left font-medium text-muted-foreground">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.year} className="border-b border-border/40 hover:bg-muted/20">
              <td className="px-2 py-1.5 font-medium">{r.year}</td>
              {COLS.slice(1).map(([, field]) => (
                <td key={field} className="px-2 py-1">
                  <Input
                    type="number" step="0.1"
                    value={(r[field] as number) ?? 0}
                    onChange={e => update(idx, field, safeN(e.target.value))}
                    className="h-7 text-xs w-16 tabular-nums"
                    data-testid={`input-ass-${field}-${r.year}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WhatIfScenariosPage() {
  // ── INPUTS STATE (loaded from DB, never mutated by compute) ──────────────────
  const [scenarioList, setScenarioList] = useState<WiScenario[]>([]);
  const [activeId,     setActiveId]     = useState<number | null>(null);
  const [scenarioData, setScenarioData] = useState<ScenarioData>({ properties: [], stockPlans: [], cryptoPlans: [], assumptions: [] });
  const [snap,         setSnap]         = useState<any>(null);
  const [realProps,    setRealProps]     = useState<any[]>([]);
  const [loadingInit,  setLoadingInit]   = useState(true);
  const [loadingData,  setLoadingData]   = useState(false);

  // ── RESULTS STATE (output of computeResult, never feeds back into inputs) ────
  const [activeResult,  setActiveResult]  = useState<WiScenarioResult | null>(null);
  const [allResults,    setAllResults]    = useState<{ name: string; result: WiScenarioResult }[]>([]);
  const [baseResult,    setBaseResult]    = useState<WiScenarioResult | null>(null);
  const [exitResultForSolver, setExitResultForSolver] = useState<ExitEventResult | null>(null);
  const [exitTimingResult,    setExitTimingResult]    = useState<ExitTimingResult | null>(null);
  const [actionPlan,          setActionPlan]          = useState<ActionPlan | null>(null);

  // ── COMPUTE CONTROL ──────────────────────────────────────────────────────────
  const isComputingRef  = useRef(false);   // compute lock — prevents re-entry
  const lastHashRef     = useRef('');      // hash of last computed inputs
  const debounceTimer   = useRef<any>(null);
  const [isComputing,   setIsComputing]   = useState(false);
  const [lastComputedAt, setLastComputedAt] = useState<string | null>(null);

  // ── UI STATE ──────────────────────────────────────────────────────────────────
  const [tab,             setTab]             = useState('overview');
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [showDeleteDialog,setShowDeleteDialog]= useState(false);
  const [applyOption,     setApplyOption]     = useState<GoalSolverOption | null>(null);
  const { toast } = useToast();

  const activeScenario = scenarioList.find(s => s.id === activeId) ?? null;

  // Exit strategy is stored per-scenario in snap_overrides.exit_strategy
  const activeExitStrategy: ExitStrategy = useMemo(() => {
    const stored = activeScenario?.snap_overrides?.exit_strategy;
    if (stored && typeof stored === 'object') {
      return { ...DEFAULT_EXIT_STRATEGY, ...stored };
    }
    return { ...DEFAULT_EXIT_STRATEGY, exitYear: activeScenario?.target_year ?? 2035 };
  }, [activeScenario?.id, activeScenario?.snap_overrides?.exit_strategy, activeScenario?.target_year]);

  async function saveExitStrategy(es: ExitStrategy) {
    if (!activeScenario) return;
    const updated: WiScenario = {
      ...activeScenario,
      snap_overrides: { ...activeScenario.snap_overrides, exit_strategy: es },
    };
    await saveScenario(updated);
    setScenarioList(prev => prev.map(s => s.id === updated.id ? updated : s));
  }

  const baseScenarioId = useMemo(() =>
    scenarioList.find(s => s.is_base_plan)?.id ?? null
  , [scenarioList]);

  // ────────────────────────────────────────────────────────────────────────────
  // PURE COMPUTE FUNCTION
  // Takes all inputs as arguments, returns results.
  // NO setState inside. NO DB calls. NO side effects.
  // ────────────────────────────────────────────────────────────────────────────
  function doCompute(
    scenario: WiScenario,
    data: ScenarioData,
    snapData: any,
    allScenarios: WiScenario[],
    dataByScenario: Map<number, ScenarioData>
  ): {
    activeResult: WiScenarioResult;
    allResults: { name: string; result: WiScenarioResult }[];
    baseResult: WiScenarioResult | null;
  } {
    const active = computeResult(scenario, data, snapData);

    const all: { name: string; result: WiScenarioResult }[] = [];
    let base: WiScenarioResult | null = null;

    for (const sc of allScenarios) {
      const d = dataByScenario.get(sc.id) ?? { properties: [], stockPlans: [], cryptoPlans: [], assumptions: [] };
      const r = computeResult(sc, d, snapData);
      all.push({ name: sc.name, result: r });
      if (sc.is_base_plan && sc.id !== scenario.id) base = r;
    }

    return { activeResult: active, allResults: all, baseResult: base };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // TRIGGER COMPUTE — called from debounce timer or manual button
  // Uses compute lock + hash check to prevent duplicate/loop runs
  // ────────────────────────────────────────────────────────────────────────────
  const triggerCompute = useCallback(async () => {
    if (isComputingRef.current) return; // LOCK: prevent re-entry
    if (!activeScenario || !snap) return;

    const hash = hashInputs(
      activeScenario,
      scenarioData.properties,
      scenarioData.stockPlans,
      scenarioData.cryptoPlans,
      scenarioData.assumptions
    );
    if (hash === lastHashRef.current) return; // HASH: skip if nothing changed

    isComputingRef.current = true; // ACQUIRE LOCK
    setIsComputing(true);

    try {
      // Build dataByScenario map for all scenarios (use cached scenarioData for active,
      // fetch from DB for others — but only ONCE per compute, not in a loop)
      const dataByScenario = new Map<number, ScenarioData>();
      dataByScenario.set(activeScenario.id, scenarioData);

      // Fetch data for other scenarios in parallel (fire-and-forget each)
      const others = scenarioList.filter(s => s.id !== activeScenario.id);
      const otherData = await Promise.all(
        others.map(async sc => {
          const [p, s, c, a] = await Promise.all([
            loadScenarioProperties(sc.id),
            loadScenarioStockPlans(sc.id),
            loadScenarioCryptoPlans(sc.id),
            loadScenarioAssumptions(sc.id),
          ]);
          return { id: sc.id, data: { properties: p, stockPlans: s, cryptoPlans: c, assumptions: a } as ScenarioData };
        })
      );
      for (const { id, data } of otherData) dataByScenario.set(id, data);

      // PURE compute — no setState inside
      const results = doCompute(activeScenario, scenarioData, snap, scenarioList, dataByScenario);

      // Single atomic setState batch at the end
      setActiveResult(results.activeResult);
      setAllResults(results.allResults);
      setBaseResult(results.baseResult);
      setLastComputedAt(new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      lastHashRef.current = hash; // UPDATE HASH only after successful compute
    } finally {
      isComputingRef.current = false; // RELEASE LOCK
      setIsComputing(false);
    }
  }, [activeScenario, scenarioData, snap, scenarioList]);

  // ────────────────────────────────────────────────────────────────────────────
  // DEBOUNCED COMPUTE TRIGGER
  // Only fires when scenarioData changes (after user edits inputs).
  // 800ms delay. Does NOT fire on result state changes.
  // Does NOT call setScenarios, setActiveId, or any input-state setters.
  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeScenario || !snap) return;
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      triggerCompute();
    }, 800);
    return () => clearTimeout(debounceTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioData, activeScenario?.id, activeScenario?.profile, activeScenario?.swr,
      activeScenario?.target_passive_income, activeScenario?.target_year,
      activeScenario?.include_super, activeScenario?.include_ppor_equity,
      activeScenario?.include_crypto, activeScenario?.include_stocks,
      activeScenario?.include_property_equity, snap]);
  // ↑ Note: we list only STABLE primitive fields of activeScenario, not the object reference.
  //   This prevents the object-identity churn that was causing the loop.

  // ────────────────────────────────────────────────────────────────────────────
  // LOAD INITIAL DATA (once on mount)
  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const [snapData, propsData, scenarios] = await Promise.all([
        fetchSnap(),
        fetchRealProperties(),
        loadScenarios(),
      ]);
      setSnap(snapData);
      setRealProps(propsData);
      setScenarioList(scenarios);
      if (scenarios.length > 0) {
        setActiveId(scenarios[0].id);
      }
      setLoadingInit(false);
    }
    init();
  }, []);

  // ────────────────────────────────────────────────────────────────────────────
  // LOAD ACTIVE SCENARIO DATA when activeId changes
  // Only updates scenarioData (inputs) — never touches results
  // ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeId) return;
    setLoadingData(true);
    lastHashRef.current = ''; // Reset hash so next compute always runs for new scenario
    Promise.all([
      loadScenarioProperties(activeId),
      loadScenarioStockPlans(activeId),
      loadScenarioCryptoPlans(activeId),
      loadScenarioAssumptions(activeId),
    ]).then(([p, s, c, a]) => {
      setScenarioData({ properties: p, stockPlans: s, cryptoPlans: c, assumptions: a });
      setLoadingData(false);
    });
  }, [activeId]);

  // ────────────────────────────────────────────────────────────────────────────
  // CHILD CALLBACKS — called by tab components after a DB save
  // They signal inputs changed, which triggers the debounced compute
  // ────────────────────────────────────────────────────────────────────────────
  const onPropertiesChanged = useCallback(async () => {
    if (!activeId) return;
    const p = await loadScenarioProperties(activeId);
    setScenarioData(prev => ({ ...prev, properties: p }));
  }, [activeId]);

  const onStocksChanged = useCallback(async () => {
    if (!activeId) return;
    const s = await loadScenarioStockPlans(activeId);
    setScenarioData(prev => ({ ...prev, stockPlans: s }));
  }, [activeId]);

  const onCryptoChanged = useCallback(async () => {
    if (!activeId) return;
    const c = await loadScenarioCryptoPlans(activeId);
    setScenarioData(prev => ({ ...prev, cryptoPlans: c }));
  }, [activeId]);

  const onAssumptionsChanged = useCallback(async () => {
    if (!activeId) return;
    const a = await loadScenarioAssumptions(activeId);
    setScenarioData(prev => ({ ...prev, assumptions: a }));
  }, [activeId]);

  // ────────────────────────────────────────────────────────────────────────────
  // SCENARIO FIELD UPDATE — updates local list and persists to DB
  // Does NOT trigger setScenarioData (no result feed-back)
  // ────────────────────────────────────────────────────────────────────────────
  async function updateScenarioField(field: keyof WiScenario, value: any) {
    if (!activeScenario) return;
    const updated = { ...activeScenario, [field]: value };
    // Update list in-place (stable reference for other scenarios)
    setScenarioList(prev => prev.map(s => s.id === activeId ? updated : s));
    await saveScenario(updated);
    // Force immediate recompute for scenario-level changes
    lastHashRef.current = '';
  }

  // ────────────────────────────────────────────────────────────────────────────
  // SCENARIO MANAGEMENT
  // ────────────────────────────────────────────────────────────────────────────
  async function createNewScenario() {
    const s = await saveScenario({
      name: `Scenario ${scenarioList.length + 1}`,
      is_base_plan: false,
      forecast_mode: 'profile',
      profile: 'moderate',
      target_passive_income: 20000,
      target_year: 2035,
      swr: 3.5,
      include_super: true,
      include_ppor_equity: false,
      include_crypto: true,
      include_stocks: true,
      include_property_equity: true,
      snap_overrides: snap ? {
        monthly_income:   snap.monthly_income,
        monthly_expenses: snap.monthly_expenses,
        cash:             snap.cash,
        offset_balance:   snap.offset_balance,
        savings_cash:     snap.savings_cash,
        emergency_cash:   snap.emergency_cash,
        ppor:             snap.ppor,
        mortgage:         snap.mortgage,
        stocks:           snap.stocks,
        crypto:           snap.crypto,
        super_balance:    snap.super_balance,
        other_debts:      snap.other_debts,
      } : {},
    });
    setScenarioList(prev => [...prev, s]);
    setActiveId(s.id);
    toast({ title: 'New scenario created' });
  }

  async function duplicateScenario() {
    if (!activeScenario) return;
    const dup = await saveScenario({ ...activeScenario, id: undefined as any, name: `${activeScenario.name} (Copy)`, is_base_plan: false });
    for (const p of scenarioData.properties) await saveProperty({ ...p, id: undefined as any, scenario_id: dup.id });
    for (const s of scenarioData.stockPlans)  await saveStockPlan({ ...s, id: undefined as any, scenario_id: dup.id });
    for (const c of scenarioData.cryptoPlans) await saveCryptoPlan({ ...c, id: undefined as any, scenario_id: dup.id });
    if (scenarioData.assumptions.length > 0)  await saveAssumptions(scenarioData.assumptions.map(a => ({ ...a, scenario_id: dup.id })));
    const updated = await loadScenarios();
    setScenarioList(updated);
    setActiveId(dup.id);
    toast({ title: 'Scenario duplicated' });
  }

  async function doClone() {
    setShowCloneDialog(false);
    setLoadingInit(true);
    const cloned = await cloneBasePlan(snap, realProps, 'Base Plan');
    const updated = await loadScenarios();
    setScenarioList(updated);
    setActiveId(cloned.id);
    setLoadingInit(false);
    toast({ title: 'Base plan cloned from your current ledger' });
  }

  async function doDelete() {
    if (!activeId) return;
    await deleteScenario(activeId);
    const updated = await loadScenarios();
    setScenarioList(updated);
    const next = updated[0]?.id ?? null;
    setActiveId(next);
    setActiveResult(null);
    setShowDeleteDialog(false);
    toast({ title: 'Scenario deleted' });
  }

  async function handleApplyOption(opt: GoalSolverOption) {
    setApplyOption(opt);
    setShowApplyDialog(true);
  }

  async function confirmApplyOption() {
    if (!applyOption || !activeScenario || !activeId) return;
    setShowApplyDialog(false);
    for (const ip of applyOption.extraProperties) {
      await saveProperty({
        scenario_id: activeScenario.id,
        property_name: `IP ${ip.year}`,
        is_ppor: false,
        purchase_year: ip.year,
        purchase_month: 7,
        purchase_price: ip.price,
        deposit_pct: 20,
        stamp_duty: Math.round(ip.price * 0.04),
        legal_cost: 2500,
        lmi: 0,
        loan_amount: Math.round(ip.price * 0.8),
        interest_rate: 6.25,
        loan_type: 'IO',
        loan_term_years: 30,
        rent_per_week: Math.round((ip.price * 0.04) / 52),
        rental_growth_pct: 3,
        vacancy_pct: 3,
        management_fee_pct: 8,
        council_rates_pa: 2000,
        insurance_pa: 1500,
        maintenance_pa: 2000,
        body_corporate_pa: 0,
        land_tax_pa: 0,
        other_costs_pa: 0,
        allow_equity_release: false,
        sort_order: scenarioData.properties.length,
      });
    }
    if (scenarioData.stockPlans.length > 0) {
      await saveStockPlan({ ...scenarioData.stockPlans[0], dca_amount: applyOption.stockDCAMonthly, dca_frequency: 'Monthly' });
    }
    // Reload data to trigger recompute
    const [p, s, c, a] = await Promise.all([
      loadScenarioProperties(activeId),
      loadScenarioStockPlans(activeId),
      loadScenarioCryptoPlans(activeId),
      loadScenarioAssumptions(activeId),
    ]);
    setScenarioData({ properties: p, stockPlans: s, cryptoPlans: c, assumptions: a });
    lastHashRef.current = '';
    setTab('overview');
    toast({ title: `${applyOption.label} applied to scenario` });
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loadingInit) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="animate-spin w-6 h-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading What-If Scenarios…</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-3 md:px-6 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary" /> What-If Scenarios
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Sandbox forecasting — never affects your real plan unless you click "Apply to Main Plan".
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setShowCloneDialog(true)} data-testid="btn-clone-base-plan">
            <Copy className="w-3 h-3 mr-1" /> Clone Current Plan
          </Button>
          <Button size="sm" variant="outline" onClick={createNewScenario} data-testid="btn-new-scenario">
            <Plus className="w-3 h-3 mr-1" /> New Scenario
          </Button>
        </div>
      </div>

      {/* Scenario tabs */}
      {scenarioList.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {scenarioList.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              data-testid={`btn-scenario-${s.id}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-colors flex-shrink-0
                ${s.id === activeId
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'}`}
            >
              {s.is_base_plan ? '📋 ' : ''}{s.name}
            </button>
          ))}
        </div>
      )}

      {scenarioList.length === 0 && (
        <div className="text-center py-16 border border-dashed border-border rounded-xl text-muted-foreground space-y-3">
          <FlaskConical className="w-8 h-8 mx-auto opacity-30" />
          <p className="text-sm">No scenarios yet. Clone your current plan to get started.</p>
          <div className="flex justify-center gap-2">
            <Button size="sm" onClick={() => setShowCloneDialog(true)} data-testid="btn-clone-first">Clone Current Plan</Button>
            <Button size="sm" variant="outline" onClick={createNewScenario}>New Blank Scenario</Button>
          </div>
        </div>
      )}

      {activeScenario && (
        <>
          {/* Scenario settings */}
          <Card>
            <CardContent className="py-3">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                <div>
                  <Label className="text-xs text-muted-foreground">Scenario Name</Label>
                  <Input
                    value={activeScenario.name}
                    onChange={e => updateScenarioField('name', e.target.value)}
                    className="h-8 text-sm mt-0.5"
                    data-testid="input-scenario-name"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Target Passive/mo ($)</Label>
                  <Input
                    type="number"
                    value={activeScenario.target_passive_income}
                    onChange={e => updateScenarioField('target_passive_income', safeN(e.target.value))}
                    className="h-8 text-sm mt-0.5"
                    data-testid="input-target-passive"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Target Year</Label>
                  <Input
                    type="number"
                    value={activeScenario.target_year}
                    onChange={e => updateScenarioField('target_year', parseInt(e.target.value))}
                    className="h-8 text-sm mt-0.5"
                    data-testid="input-target-year"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">SWR %</Label>
                  <Select value={activeScenario.swr.toString()} onValueChange={v => updateScenarioField('swr', parseFloat(v))}>
                    <SelectTrigger className="h-8 text-sm mt-0.5" data-testid="select-swr"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3%</SelectItem>
                      <SelectItem value="3.5">3.5%</SelectItem>
                      <SelectItem value="4">4%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Forecast Profile</Label>
                  <Select value={activeScenario.profile} onValueChange={v => updateScenarioField('profile', v)}>
                    <SelectTrigger className="h-8 text-sm mt-0.5" data-testid="select-profile"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conservative">Conservative</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="aggressive">Aggressive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mt-3 text-xs">
                {([
                  ['Super', 'include_super'],
                  ['Stocks', 'include_stocks'],
                  ['Crypto', 'include_crypto'],
                  ['Property Equity', 'include_property_equity'],
                  ['PPOR Equity', 'include_ppor_equity'],
                ] as [string, keyof WiScenario][]).map(([label, field]) => (
                  <label key={field} className="flex items-center gap-2 cursor-pointer select-none">
                    <Switch
                      checked={!!activeScenario[field]}
                      onCheckedChange={v => updateScenarioField(field, v)}
                      data-testid={`toggle-${field}`}
                    />
                    <span className="text-muted-foreground">{label}</span>
                  </label>
                ))}
              </div>

              {/* Actions row */}
              <div className="flex gap-2 mt-3 flex-wrap items-center">
                <Button
                  size="sm"
                  onClick={() => { lastHashRef.current = ''; triggerCompute(); }}
                  disabled={isComputing || loadingData}
                  data-testid="btn-recompute"
                >
                  {isComputing
                    ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Computing…</>
                    : <><RefreshCw className="w-3 h-3 mr-1" /> Compute</>}
                </Button>
                <Button size="sm" variant="outline" onClick={duplicateScenario} data-testid="btn-duplicate-scenario">
                  <Copy className="w-3 h-3 mr-1" /> Duplicate
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setShowDeleteDialog(true)} data-testid="btn-delete-scenario">
                  <Trash2 className="w-3 h-3 mr-1" /> Delete
                </Button>
                {lastComputedAt && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1 ml-auto">
                    <Clock className="w-3 h-3" /> Last computed {lastComputedAt}
                  </span>
                )}
                {loadingData && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</span>}
              </div>
            </CardContent>
          </Card>

          {/* Decision Dashboard — promoted summary bar */}
          <DecisionDashboard
            result={activeResult}
            actionPlan={actionPlan}
            exitTiming={exitTimingResult}
            onTabSwitch={setTab}
          />

          {/* Assumption Warnings */}
          <AssumptionWarningsBanner
            assumptions={scenarioData.assumptions}
            stockPlans={scenarioData.stockPlans}
          />

          {/* Impact Panel — base vs active comparison */}
          {baseResult && activeResult && activeScenario && !activeScenario.is_base_plan && (
            <ImpactPanel before={baseResult} after={activeResult} />
          )}

          {/* Main tabs */}
          <Tabs value={tab} onValueChange={setTab}>
            <div className="overflow-x-auto">
              <TabsList className="flex h-auto gap-0.5 mb-4 bg-muted/40 p-1 rounded-lg w-max min-w-full">
                {[
                  { value: 'overview',     label: 'Overview',     icon: BarChart2 },
                  { value: 'properties',   label: 'Properties',   icon: Home },
                  { value: 'stocks',       label: 'Stocks',       icon: TrendingUp },
                  { value: 'crypto',       label: 'Crypto',       icon: Bitcoin },
                  { value: 'cashflow',     label: 'Cashflow',     icon: DollarSign },
                  { value: 'exit',         label: 'Exit Strategy',icon: LogOut },
                  { value: 'timing',       label: 'Exit Timing',  icon: Calendar },
                  { value: 'actions',      label: 'Action Plan',  icon: ListChecks },
                  { value: 'solver',       label: 'Goal Solver',  icon: Zap },
                  { value: 'montecarlo',   label: 'Monte Carlo',  icon: FlaskConical },
                  { value: 'compare',      label: 'Compare',      icon: TableIcon },
                  { value: 'assumptions',  label: 'Assumptions',  icon: Info },
                ].map(t => (
                  <TabsTrigger
                    key={t.value} value={t.value}
                    className="text-xs px-3 py-1.5 flex items-center gap-1.5 whitespace-nowrap"
                    data-testid={`tab-${t.value}`}
                  >
                    <t.icon className="w-3 h-3" />{t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="overview">
              <OverviewTab result={activeResult} scenario={activeScenario} baseResult={baseResult} snap={snap} />
            </TabsContent>
            <TabsContent value="properties">
              <PropertiesTab scenarioId={activeScenario.id} onChanged={onPropertiesChanged} />
            </TabsContent>
            <TabsContent value="stocks">
              <StocksTab scenarioId={activeScenario.id} onChanged={onStocksChanged} />
            </TabsContent>
            <TabsContent value="crypto">
              <CryptoTab scenarioId={activeScenario.id} onChanged={onCryptoChanged} />
            </TabsContent>
            <TabsContent value="cashflow">
              <CashflowTab result={activeResult} scenario={activeScenario} />
            </TabsContent>
            <TabsContent value="exit">
              <ExitStrategyTab
                result={activeResult}
                scenario={activeScenario}
                properties={scenarioData.properties}
                onExitResult={(er) => {
                  setExitResultForSolver(er);
                  // Persist exit strategy config back to scenario
                  if (er) {
                    // already persisted by ExitStrategyTab via saveExitStrategy below
                  }
                }}
              />
            </TabsContent>
            <TabsContent value="timing">
              <ExitTimingTab
                result={activeResult}
                scenario={activeScenario}
                properties={scenarioData.properties}
                exitStrategy={activeExitStrategy}
                onTimingResult={setExitTimingResult}
              />
            </TabsContent>
            <TabsContent value="actions">
              <ActionEngineTab
                scenario={activeScenario}
                result={activeResult}
                exitTiming={exitTimingResult}
                snap={snap}
                properties={scenarioData.properties}
                stockPlans={scenarioData.stockPlans}
                cryptoPlans={scenarioData.cryptoPlans}
                onPlanReady={setActionPlan}
              />
            </TabsContent>
            <TabsContent value="solver">
              <GoalSolverTab
                scenario={activeScenario}
                snap={snap}
                assumptions={scenarioData.assumptions}
                onApplyOption={handleApplyOption}
                exitResultForSolver={exitResultForSolver}
              />
            </TabsContent>
            <TabsContent value="montecarlo">
              <MonteCarloTab
                scenario={activeScenario}
                properties={scenarioData.properties}
                stockPlans={scenarioData.stockPlans}
                cryptoPlans={scenarioData.cryptoPlans}
                assumptions={scenarioData.assumptions}
                snap={snap}
              />
            </TabsContent>
            <TabsContent value="compare">
              <ScenarioComparisonTab
                allResults={allResults}
                activeId={activeId}
                baseId={baseScenarioId}
              />
            </TabsContent>
            <TabsContent value="assumptions">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Custom Year-by-Year Assumptions (2026–2035)</CardTitle>
                  <p className="text-xs text-muted-foreground">Override per year, or leave as-is to use the "{activeScenario.profile}" profile defaults.</p>
                </CardHeader>
                <CardContent>
                  <AssumptionsPanel
                    scenarioId={activeScenario.id}
                    profile={activeScenario.profile}
                    onChanged={onAssumptionsChanged}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Clone dialog */}
      <Dialog open={showCloneDialog} onOpenChange={setShowCloneDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Clone Current Plan</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Creates a sandbox scenario from your current ledger (income, expenses, cash, properties, stocks, crypto, super).
            Your real plan is not changed.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloneDialog(false)}>Cancel</Button>
            <Button onClick={doClone} data-testid="btn-confirm-clone">Clone</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply option dialog */}
      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Apply {applyOption?.label} to Scenario</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Applies to <strong>{activeScenario?.name}</strong> (sandbox only — real plan unchanged):
          </p>
          <ul className="text-sm space-y-1 mt-2">
            {applyOption?.reasoning.map((r, i) => <li key={i} className="flex gap-2 text-sm"><span className="text-primary">→</span>{r}</li>)}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApplyDialog(false)}>Cancel</Button>
            <Button onClick={confirmApplyOption} data-testid="btn-confirm-apply-option">Apply to Scenario</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Scenario</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <strong>{activeScenario?.name}</strong>? Cannot be undone. Real plan unaffected.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={doDelete} data-testid="btn-confirm-delete">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

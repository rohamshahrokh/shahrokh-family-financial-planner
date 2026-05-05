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

import { useState, useEffect, useRef, useCallback } from 'react';
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
  Table as TableIcon, Clock,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  loadScenarios, saveScenario, deleteScenario, cloneBasePlan,
  loadScenarioProperties, saveProperty, deleteProperty,
  loadScenarioStockPlans, saveStockPlan,
  loadScenarioCryptoPlans, saveCryptoPlan,
  loadScenarioAssumptions, saveAssumptions,
  runScenarioForecast, runGoalSolver, runWiMonteCarlo,
  DEFAULT_SOLVER_CONSTRAINTS,
  type WiScenario, type WiProperty, type WiStockPlan, type WiCryptoPlan,
  type WiAssumption, type WiScenarioResult, type GoalSolverOption,
  type MonteCarloWiResult, type GoalSolverConstraints,
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

function GoalSolverTab({ scenario, snap, assumptions, onApplyOption }:
  { scenario: WiScenario | null; snap: any; assumptions: WiAssumption[]; onApplyOption: (opt: GoalSolverOption) => void }) {
  const [options, setOptions]   = useState<GoalSolverOption[]>([]);
  const [running, setRunning]   = useState(false);
  const [constraints, setConstraints] = useState<GoalSolverConstraints>({ ...DEFAULT_SOLVER_CONSTRAINTS });
  const [showConstraints, setShowConstraints] = useState(false);
  const [ranAt, setRanAt]       = useState<string | null>(null);

  async function runSolver() {
    if (!scenario || running) return;
    setRunning(true);
    // yield to React so spinner renders
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
      setOptions(opts);
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
            <TabsContent value="solver">
              <GoalSolverTab
                scenario={activeScenario}
                snap={snap}
                assumptions={scenarioData.assumptions}
                onApplyOption={handleApplyOption}
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
              <CompareTab
                allResults={allResults}
                targetPassive={activeScenario.target_passive_income}
                targetYear={activeScenario.target_year}
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

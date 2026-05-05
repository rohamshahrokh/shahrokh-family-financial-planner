/**
 * what-if-scenarios.tsx — What-If Scenarios Module
 *
 * Sandbox forecast / goal solver / scenario comparer.
 * Never writes to central ledger unless user confirms "Apply to Main Plan".
 *
 * Tabs: Overview | Properties | Stocks | Crypto | Cashflow | Goal Solver | Monte Carlo | Compare
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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
  Zap, ChevronDown, ChevronUp, Info, Loader2, Star, AlertCircle,
  Table as TableIcon, Download,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
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
import type { YearAssumptions } from '@/lib/forecastStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://uoraduyyxhtzixcsaidg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c';

function safeN(v: any): number { const n = parseFloat(v); return isNaN(n) ? 0 : n; }

function fmt(n: number, compact = true): string {
  if (compact && Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (compact && Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function pct(n: number, d = 1) { return `${n.toFixed(d)}%`; }

function riskColor(score: number): string {
  if (score <= 3) return 'text-green-500';
  if (score <= 6) return 'text-yellow-500';
  return 'text-red-500';
}

function riskLabel(score: number): string {
  if (score <= 3) return 'Low';
  if (score <= 5) return 'Medium';
  if (score <= 7) return 'Med-High';
  return 'High';
}

function feasLabel(score: number): string {
  if (score >= 9) return 'Excellent';
  if (score >= 7) return 'Good';
  if (score >= 5) return 'Moderate';
  return 'Challenging';
}

function feasColor(score: number): string {
  if (score >= 9) return 'text-green-500';
  if (score >= 7) return 'text-blue-500';
  if (score >= 5) return 'text-yellow-500';
  return 'text-red-500';
}

async function fetchSnap(): Promise<any> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/sf_snapshot?limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!r.ok) return {};
    const rows = await r.json();
    return rows[0] ?? {};
  } catch { return {}; }
}

async function fetchProperties(): Promise<any[]> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/sf_properties?order=id.asc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!r.ok) return [];
    return r.json();
  } catch { return []; }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = '', icon: Icon }:
  { label: string; value: string; sub?: string; color?: string; icon?: any }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      {Icon && <Icon className={`w-4 h-4 mb-1 ${color || 'text-muted-foreground'}`} />}
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {sub && <div className="text-xs text-muted-foreground/70">{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

// ─── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ result, scenario, baseResult }:
  { result: WiScenarioResult | null; scenario: WiScenario | null; baseResult: WiScenarioResult | null }) {
  if (!result || !scenario) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
        <FlaskConical className="w-8 h-8 opacity-40" />
        <p className="text-sm">Select or create a scenario to see the forecast.</p>
      </div>
    );
  }

  const isAchieved = result.gapPerMonth <= 0;
  const targetCapFmt = fmt(result.requiredCapital);
  const projCapFmt   = fmt(result.currentProjectedCapital);

  return (
    <div className="space-y-6">
      {/* Goal Status Banner */}
      <div className={`rounded-xl p-4 border ${isAchieved ? 'border-green-500/30 bg-green-500/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
        <div className="flex items-start gap-3">
          {isAchieved
            ? <Check className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
            : <Target className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />}
          <div>
            <div className="font-semibold text-sm">
              {isAchieved
                ? `Goal achieved — projected $${Math.round(result.projectedPassiveIncome).toLocaleString()}/mo by ${scenario.target_year}`
                : `Gap: ${fmt(result.gapPerMonth)}/month to reach ${fmt(scenario.target_passive_income)}/month by ${scenario.target_year}`}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              SWR {scenario.swr}% · Required capital {targetCapFmt} · Projected capital {projCapFmt}
              {result.fireYear ? ` · FIRE year ${result.fireYear}` : ''}
            </div>
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label={`Passive Income ${scenario.target_year}`}
          value={fmt(result.projectedPassiveIncome) + '/mo'}
          color={isAchieved ? 'text-green-500' : 'text-yellow-500'}
          icon={TrendingUp}
        />
        <KpiCard
          label="Gap to Goal"
          value={isAchieved ? 'Achieved ✓' : fmt(result.gapPerMonth) + '/mo'}
          color={isAchieved ? 'text-green-500' : 'text-red-400'}
          icon={Target}
        />
        <KpiCard
          label={`Net Worth ${scenario.target_year}`}
          value={fmt(result.netWorthTargetYear)}
          icon={BarChart2}
        />
        <KpiCard
          label={`Cash ${scenario.target_year}`}
          value={fmt(result.cashTargetYear)}
          color={result.cashTargetYear < 10000 ? 'text-red-400' : ''}
          icon={DollarSign}
        />
        <KpiCard label="FIRE Year" value={result.fireYear ? `${result.fireYear}` : 'Not in range'} icon={Zap} />
        <KpiCard label="Risk Score" value={`${result.riskScore}/10`} color={riskColor(result.riskScore)} sub={riskLabel(result.riskScore)} />
        <KpiCard label="Feasibility" value={`${result.feasibilityScore}/10`} color={feasColor(result.feasibilityScore)} sub={feasLabel(result.feasibilityScore)} />
        <KpiCard label="Max Cash Shortfall" value={result.maxCashShortfall > 0 ? fmt(result.maxCashShortfall) : 'None'} color={result.maxCashShortfall > 50000 ? 'text-red-400' : 'text-green-500'} />
      </div>

      {/* Net Worth chart */}
      {result.years.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Net Worth Trajectory</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
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
                <Area type="monotone" dataKey="netWorth" stroke="hsl(var(--primary))" fill="url(#wifNW)" name="Net Worth" strokeWidth={2} />
                <Area type="monotone" dataKey="accessibleNetWorth" stroke="hsl(var(--chart-2))" fill="none" name="Accessible NW" strokeWidth={1.5} strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Passive income chart */}
      {result.years.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Monthly Passive Income by Year</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={result.years} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} width={55} />
                <Tooltip formatter={(v: number) => `$${v.toLocaleString()}/mo`} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="monthlyPassiveIncome" fill="hsl(var(--chart-2))" name="Passive Income/mo" radius={[3, 3, 0, 0]} />
                {/* Target line */}
                <Line type="monotone" dataKey={() => scenario.target_passive_income} stroke="hsl(var(--destructive))" strokeDasharray="5 3" dot={false} name="Target" strokeWidth={1.5} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Comparison vs base */}
      {baseResult && baseResult.scenarioId !== result.scenarioId && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">vs. Base Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              {[
                { label: 'Passive Income', base: baseResult.projectedPassiveIncome, this: result.projectedPassiveIncome, fmt: (v: number) => fmt(v) + '/mo' },
                { label: `Net Worth ${scenario.target_year}`, base: baseResult.netWorthTargetYear, this: result.netWorthTargetYear, fmt: fmt },
                { label: 'FIRE Year', base: baseResult.fireYear ?? 9999, this: result.fireYear ?? 9999, fmt: (v: number) => v === 9999 ? 'N/A' : `${v}` },
                { label: 'Max Shortfall', base: baseResult.maxCashShortfall, this: result.maxCashShortfall, fmt: fmt },
              ].map(row => {
                const delta = safeN(row.this) - safeN(row.base);
                const better = row.label.includes('Shortfall') || row.label === 'FIRE Year' ? delta < 0 : delta > 0;
                return (
                  <div key={row.label} className="rounded-lg border border-border p-3 text-center">
                    <div className="text-xs text-muted-foreground mb-1">{row.label}</div>
                    <div className="font-semibold">{row.fmt(row.this as number)}</div>
                    <div className={`text-xs mt-1 ${better ? 'text-green-500' : delta === 0 ? '' : 'text-red-400'}`}>
                      {delta === 0 ? '— same' : better ? `▲ ${row.fmt(Math.abs(delta))}` : `▼ ${row.fmt(Math.abs(delta))}`}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Properties Tab ────────────────────────────────────────────────────────────

function PropertiesTab({ scenarioId, onChanged }: { scenarioId: number; onChanged: () => void }) {
  const [props, setProps] = useState<WiProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const { toast } = useToast();

  const reload = useCallback(async () => {
    setLoading(true);
    const rows = await loadScenarioProperties(scenarioId);
    setProps(rows);
    setLoading(false);
  }, [scenarioId]);

  useEffect(() => { reload(); }, [reload]);

  async function addProperty() {
    const p: Partial<WiProperty> = {
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
    };
    const saved = await saveProperty(p);
    setProps(prev => [...prev, saved]);
    setExpanded(saved.id ?? null);
    onChanged();
  }

  async function updateProp(idx: number, field: keyof WiProperty, value: any) {
    const updated = { ...props[idx], [field]: value };
    setProps(prev => prev.map((p, i) => i === idx ? updated : p));
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
      <SectionHeader title={`Investment Properties (${props.length})`}>
        <Button size="sm" variant="outline" onClick={addProperty} data-testid="btn-add-property">
          <Plus className="w-3 h-3 mr-1" /> Add Property
        </Button>
      </SectionHeader>

      {props.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          No investment properties in this scenario. Click "Add Property" to model a new IP.
        </div>
      )}

      {props.map((p, idx) => (
        <Card key={p.id} className="overflow-hidden">
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(expanded === p.id ? null : (p.id ?? null))}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm flex items-center gap-2">
                  <Home className="w-4 h-4 text-muted-foreground" />
                  {p.property_name}
                  {p.is_ppor && <Badge variant="outline" className="text-xs">PPOR</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {p.purchase_year ? `Buy ${p.purchase_year}` : 'Existing'} · {fmt(p.purchase_price)} ·
                  Loan {fmt(p.loan_amount)} · Rent ${p.rent_per_week}/wk · {p.loan_type}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={e => { e.stopPropagation(); removeProp(p.id!); }} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-4 h-4" />
                </button>
                {expanded === p.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </div>
          </CardHeader>

          {expanded === p.id && (
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {([
                  ['Property Name', 'property_name', 'text'],
                  ['Purchase Year', 'purchase_year', 'number'],
                  ['Purchase Month', 'purchase_month', 'number'],
                  ['Purchase Price ($)', 'purchase_price', 'number'],
                  ['Deposit %', 'deposit_pct', 'number'],
                  ['Stamp Duty ($)', 'stamp_duty', 'number'],
                  ['Legal Cost ($)', 'legal_cost', 'number'],
                  ['LMI ($)', 'lmi', 'number'],
                  ['Loan Amount ($)', 'loan_amount', 'number'],
                  ['Interest Rate %', 'interest_rate', 'number'],
                  ['Rent/Week ($)', 'rent_per_week', 'number'],
                  ['Rental Growth %', 'rental_growth_pct', 'number'],
                  ['Vacancy %', 'vacancy_pct', 'number'],
                  ['Management Fee %', 'management_fee_pct', 'number'],
                  ['Council Rates PA ($)', 'council_rates_pa', 'number'],
                  ['Insurance PA ($)', 'insurance_pa', 'number'],
                  ['Maintenance PA ($)', 'maintenance_pa', 'number'],
                  ['Body Corporate PA ($)', 'body_corporate_pa', 'number'],
                  ['Land Tax PA ($)', 'land_tax_pa', 'number'],
                  ['Other Costs PA ($)', 'other_costs_pa', 'number'],
                  ['Expected Sale Year', 'expected_sale_year', 'number'],
                ] as [string, keyof WiProperty, string][]).map(([label, field, type]) => (
                  <div key={field}>
                    <Label className="text-xs">{label}</Label>
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
                  <Label className="text-xs">Loan Type</Label>
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
  const { toast } = useToast();

  useEffect(() => {
    loadScenarioStockPlans(scenarioId).then(rows => { setPlans(rows); setLoading(false); });
  }, [scenarioId]);

  async function addPlan() {
    const saved = await saveStockPlan({
      scenario_id: scenarioId,
      label: 'ETF Portfolio',
      starting_value: 0,
      lump_sum_amount: 0,
      lump_sum_year: undefined,
      lump_sum_month: 1,
      dca_amount: 1200,
      dca_frequency: 'Weekly',
      dca_start_year: 2026,
      dca_end_year: 2035,
      return_mode: 'profile',
      custom_return: 10,
      dividend_yield: 2,
    });
    setPlans(prev => [...prev, saved]);
    onChanged();
  }

  async function update(idx: number, field: keyof WiStockPlan, value: any) {
    const updated = { ...plans[idx], [field]: value };
    setPlans(prev => prev.map((p, i) => i === idx ? updated : p));
    await saveStockPlan(updated);
    onChanged();
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin w-5 h-5 text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <SectionHeader title={`Stock Plans (${plans.length})`}>
        <Button size="sm" variant="outline" onClick={addPlan} data-testid="btn-add-stock-plan">
          <Plus className="w-3 h-3 mr-1" /> Add Plan
        </Button>
      </SectionHeader>

      {plans.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          No stock plans. Add a plan to model ETF investments in this scenario.
        </div>
      )}

      {plans.map((sp, idx) => (
        <Card key={sp.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-muted-foreground" />
                {sp.label}
              </div>
              <button onClick={async () => {
                await fetch(`${SUPABASE_URL}/rest/v1/sf_scenario_stock_plans?id=eq.${sp.id}`, {
                  method: 'DELETE',
                  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
                });
                setPlans(prev => prev.filter(p => p.id !== sp.id));
                onChanged();
              }} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {([
                ['Label', 'label', 'text'],
                ['Starting Value ($)', 'starting_value', 'number'],
                ['Lump Sum Amount ($)', 'lump_sum_amount', 'number'],
                ['Lump Sum Year', 'lump_sum_year', 'number'],
                ['DCA Amount ($)', 'dca_amount', 'number'],
                ['DCA Start Year', 'dca_start_year', 'number'],
                ['DCA End Year', 'dca_end_year', 'number'],
                ['Custom Return %', 'custom_return', 'number'],
                ['Dividend Yield %', 'dividend_yield', 'number'],
              ] as [string, keyof WiStockPlan, string][]).map(([label, field, type]) => (
                <div key={field}>
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type={type}
                    value={(sp[field] as any) ?? ''}
                    onChange={e => update(idx, field, type === 'number' ? safeN(e.target.value) : e.target.value)}
                    className="h-8 text-sm mt-0.5"
                    data-testid={`input-stock-${field}-${sp.id}`}
                  />
                </div>
              ))}
              <div>
                <Label className="text-xs">DCA Frequency</Label>
                <Select value={sp.dca_frequency} onValueChange={v => update(idx, 'dca_frequency', v)}>
                  <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Weekly', 'Fortnightly', 'Monthly', 'Quarterly'].map(f => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Return Mode</Label>
                <Select value={sp.return_mode} onValueChange={v => update(idx, 'return_mode', v)}>
                  <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="profile">Use Forecast Profile</SelectItem>
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
      lump_sum_year: undefined,
      lump_sum_month: 1,
      dca_amount: 1300,
      dca_frequency: 'Monthly',
      dca_start_year: 2026,
      dca_end_year: 2035,
      return_mode: 'profile',
      custom_return: 20,
      btc_pct: 60,
      eth_pct: 30,
      other_pct: 10,
    });
    setPlans(prev => [...prev, saved]);
    onChanged();
  }

  async function update(idx: number, field: keyof WiCryptoPlan, value: any) {
    const updated = { ...plans[idx], [field]: value };
    setPlans(prev => prev.map((p, i) => i === idx ? updated : p));
    await saveCryptoPlan(updated);
    onChanged();
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin w-5 h-5 text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <SectionHeader title={`Crypto Plans (${plans.length})`}>
        <Button size="sm" variant="outline" onClick={addPlan} data-testid="btn-add-crypto-plan">
          <Plus className="w-3 h-3 mr-1" /> Add Plan
        </Button>
      </SectionHeader>

      <div className="rounded-lg bg-yellow-500/5 border border-yellow-500/20 p-3 flex gap-2 text-xs text-yellow-700 dark:text-yellow-300">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        Crypto passive income uses a conservative 2% withdrawal rate (vs {plans[0]?.custom_return ?? 20}% growth) to account for high volatility. High-growth outcomes are marked as elevated risk.
      </div>

      {plans.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          No crypto plans. Add a plan to model crypto in this scenario.
        </div>
      )}

      {plans.map((cp, idx) => (
        <Card key={cp.id}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm flex items-center gap-2">
                <Bitcoin className="w-4 h-4 text-orange-400" />
                {cp.label}
              </div>
              <button onClick={async () => {
                await fetch(`${SUPABASE_URL}/rest/v1/sf_scenario_crypto_plans?id=eq.${cp.id}`, {
                  method: 'DELETE',
                  headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
                });
                setPlans(prev => prev.filter(p => p.id !== cp.id));
                onChanged();
              }} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </CardHeader>
          <CardContent>
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
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type={type}
                    value={(cp[field] as any) ?? ''}
                    onChange={e => update(idx, field, type === 'number' ? safeN(e.target.value) : e.target.value)}
                    className="h-8 text-sm mt-0.5"
                    data-testid={`input-crypto-${field}-${cp.id}`}
                  />
                </div>
              ))}
              <div>
                <Label className="text-xs">DCA Frequency</Label>
                <Select value={cp.dca_frequency} onValueChange={v => update(idx, 'dca_frequency', v)}>
                  <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Weekly', 'Fortnightly', 'Monthly', 'Quarterly'].map(f => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
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

// ─── Cashflow Tab ──────────────────────────────────────────────────────────────

function CashflowTab({ result }: { result: WiScenarioResult | null }) {
  if (!result) return <div className="text-center py-10 text-muted-foreground text-sm">Run forecast first.</div>;

  const hasCashStress = result.years.some(y => y.cashShortfall > 0);

  return (
    <div className="space-y-5">
      {hasCashStress && (
        <div className="rounded-lg bg-red-500/5 border border-red-500/30 p-3 flex gap-2 text-xs text-red-500">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          Cash shortfall detected in {result.years.filter(y => y.cashShortfall > 0).map(y => y.year).join(', ')}.
          Consider delaying purchases or increasing DCA start date.
        </div>
      )}

      {/* Cashflow chart */}
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
              <Bar dataKey="income" fill="hsl(var(--chart-2))" name="Income" stackId="in" />
              <Bar dataKey="rentalIncome" fill="hsl(var(--chart-3))" name="Rental Income" stackId="in" />
              <Bar dataKey="taxRefund" fill="hsl(var(--chart-4))" name="Tax Refund" stackId="in" />
              <Bar dataKey="livingExpenses" fill="hsl(var(--destructive))" name="Living Expenses" stackId="out" />
              <Bar dataKey="mortgageRepayments" fill="#f97316" name="Mortgage" stackId="out" />
              <Bar dataKey="propertyDeposits" fill="#a855f7" name="Deposits" stackId="out" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Year-by-year table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Year-by-Year Cashflow</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {['Year', 'Opening Cash', 'Income', 'Rental', 'Expenses', 'Deposits', 'Stock DCA', 'Crypto DCA', 'Closing Cash', 'Shortfall'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.years.map(y => (
                  <tr key={y.year} className={`border-b border-border/50 hover:bg-muted/20 ${y.cashShortfall > 0 ? 'bg-red-500/5' : ''}`}>
                    <td className="px-3 py-2 font-medium">{y.year}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(y.openingCash)}</td>
                    <td className="px-3 py-2 tabular-nums text-green-500">{fmt(y.income)}</td>
                    <td className="px-3 py-2 tabular-nums text-blue-500">{fmt(y.rentalIncome)}</td>
                    <td className="px-3 py-2 tabular-nums text-red-400">{fmt(y.livingExpenses)}</td>
                    <td className="px-3 py-2 tabular-nums text-purple-400">{fmt(y.propertyDeposits)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(y.stockDCA)}</td>
                    <td className="px-3 py-2 tabular-nums">{fmt(y.cryptoDCA)}</td>
                    <td className={`px-3 py-2 tabular-nums font-medium ${y.closingCash < 0 ? 'text-red-500' : 'text-green-500'}`}>{fmt(y.closingCash)}</td>
                    <td className="px-3 py-2 tabular-nums">{y.cashShortfall > 0 ? <span className="text-red-500 font-medium">{fmt(y.cashShortfall)}</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Asset table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Asset Values by Year</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {['Year', 'PPOR', 'IP Values', 'IP Loans', 'Stocks', 'Crypto', 'Super', 'Net Worth', 'Passive/mo'].map(h => (
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
  const [options, setOptions] = useState<GoalSolverOption[]>([]);
  const [running, setRunning] = useState(false);
  const [constraints, setConstraints] = useState<GoalSolverConstraints>({ ...DEFAULT_SOLVER_CONSTRAINTS });
  const [showConstraints, setShowConstraints] = useState(false);

  async function runSolver() {
    if (!scenario) return;
    setRunning(true);
    await new Promise(r => setTimeout(r, 100));
    try {
      const opts = runGoalSolver({
        scenario,
        basePropCount: 1,
        currentStockDCAMonthly: 1200 * 52 / 12, // $1200/week
        currentCryptoDCAMonthly: 1300,
        assumptions,
        snap,
        constraints,
      });
      setOptions(opts);
    } finally {
      setRunning(false);
    }
  }

  const RISK_COLORS: Record<string, string> = {
    Low: 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20',
    Medium: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
    'Med-High': 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/20',
    High: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20',
  };

  return (
    <div className="space-y-5">
      {/* Goal header */}
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="font-semibold text-sm mb-1">Goal: {scenario ? `$${scenario.target_passive_income.toLocaleString()}/month passive income by ${scenario.target_year}` : 'No scenario selected'}</div>
        <div className="text-xs text-muted-foreground">
          Required capital at {scenario?.swr ?? 3.5}% SWR: {scenario ? fmt(scenario.target_passive_income * 12 / (scenario.swr / 100)) : '—'}
        </div>
      </div>

      {/* Constraints panel */}
      <Card>
        <CardHeader className="pb-0 cursor-pointer" onClick={() => setShowConstraints(!showConstraints)}>
          <div className="flex items-center justify-between">
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
                  <Label className="text-xs">{label}</Label>
                  <Input
                    type="number"
                    value={(constraints[field] as number) ?? 0}
                    onChange={e => setConstraints(prev => ({ ...prev, [field]: safeN(e.target.value) }))}
                    className="h-8 text-sm mt-0.5"
                  />
                </div>
              ))}
              <div>
                <Label className="text-xs">Preferred Risk</Label>
                <Select value={constraints.preferredRisk} onValueChange={v => setConstraints(prev => ({ ...prev, preferredRisk: v as any }))}>
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

      <Button
        className="w-full"
        onClick={runSolver}
        disabled={running || !scenario}
        data-testid="btn-run-goal-solver"
      >
        {running ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running Solver...</> : <><Zap className="w-4 h-4 mr-2" /> Find Path to {scenario ? fmt(scenario.target_passive_income) + '/month by ' + scenario.target_year : 'Goal'}</>}
      </Button>

      {options.map(opt => (
        <Card key={opt.label} className={opt.isRecommended ? 'border-primary/50 ring-1 ring-primary/20' : ''}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{opt.label} — {opt.name}</span>
                  {opt.isRecommended && <Badge className="text-xs bg-primary/10 text-primary border-primary/30">Recommended</Badge>}
                  <span className={`text-xs px-2 py-0.5 rounded border ${RISK_COLORS[riskLabel(opt.riskScore)] ?? ''}`}>
                    {riskLabel(opt.riskScore)} Risk
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{opt.description}</div>
              </div>
              <div className="text-right shrink-0">
                <div className={`font-bold text-sm ${opt.gap <= 0 ? 'text-green-500' : 'text-yellow-500'}`}>
                  {fmt(opt.projectedPassiveIncome)}/mo
                </div>
                <div className="text-xs text-muted-foreground">
                  {opt.gap <= 0 ? `Achieved by ${opt.targetAchievedYear}` : `Gap ${fmt(opt.gap)}/mo`}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Feasibility</div>
                <div className={`font-semibold text-sm ${feasColor(opt.feasibilityScore)}`}>{opt.feasibilityScore}/10</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Risk</div>
                <div className={`font-semibold text-sm ${riskColor(opt.riskScore)}`}>{opt.riskScore}/10</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Target Year</div>
                <div className="font-semibold text-sm">{opt.targetAchievedYear ?? 'Beyond 2040'}</div>
              </div>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1">
              {opt.reasoning.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-primary shrink-0">→</span> {r}
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <Button
                size="sm" variant="outline"
                onClick={() => onApplyOption(opt)}
                data-testid={`btn-apply-option-${opt.label.replace(' ', '-').toLowerCase()}`}
              >
                Apply {opt.label} to Scenario
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      {options.length > 0 && (
        <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
          <strong>Note:</strong> All options use your actual ledger data as the starting point. Property estimates use 4% gross yield, 20% deposit, and 6.25% IO rate. Actual results will vary based on your specific properties and market conditions.
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
  const [sims, setSims] = useState(1000);

  async function run() {
    if (!scenario) return;
    setRunning(true);
    await new Promise(r => setTimeout(r, 50));
    try {
      const res = runWiMonteCarlo({ scenario, properties, stockPlans, cryptoPlans, assumptions, snap, simulations: sims });
      setResult(res);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div>
          <Label className="text-xs">Simulations</Label>
          <Select value={sims.toString()} onValueChange={v => setSims(parseInt(v))}>
            <SelectTrigger className="h-8 w-32 text-sm mt-0.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="500">500</SelectItem>
              <SelectItem value="1000">1,000</SelectItem>
              <SelectItem value="2000">2,000</SelectItem>
              <SelectItem value="5000">5,000</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={run} disabled={running || !scenario} className="mt-5" data-testid="btn-run-mc">
          {running ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running {sims.toLocaleString()} sims...</> : <><FlaskConical className="w-4 h-4 mr-2" /> Run Monte Carlo</>}
        </Button>
      </div>

      {result && (
        <div className="space-y-5">
          {/* Probability strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label={`P(reach $${(scenario!.target_passive_income / 1000).toFixed(0)}K/mo by ${scenario!.target_year})`}
              value={`${result.probTargetPassive}%`}
              color={result.probTargetPassive >= 60 ? 'text-green-500' : result.probTargetPassive >= 35 ? 'text-yellow-500' : 'text-red-400'}
              icon={Target}
            />
            <KpiCard label="Median Net Worth" value={fmt(result.p50)} icon={TrendingUp} />
            <KpiCard label="P10 (Bad Case)" value={fmt(result.p10)} color="text-red-400" />
            <KpiCard label="P90 (Good Case)" value={fmt(result.p90)} color="text-green-500" />
            <KpiCard label="Cash Goes Negative" value={`${result.probCashNegative}%`} color={result.probCashNegative > 30 ? 'text-red-400' : 'text-green-500'} />
            <KpiCard label="Needs Refinance" value={`${result.probNeedRefinance}%`} />
          </div>

          {/* Fan chart */}
          {result.fanData.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Net Worth Fan (P10 / P50 / P90)</CardTitle></CardHeader>
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
                    <Area type="monotone" dataKey="p90" stroke="hsl(var(--chart-2))" fill="url(#mcFan)" name="P90" strokeWidth={1.5} />
                    <Line type="monotone" dataKey="p50" stroke="hsl(var(--primary))" name="P50 (Median)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="p10" stroke="hsl(var(--destructive))" name="P10" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* FIRE year distribution */}
          {Object.keys(result.fireYearDistribution).length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">FIRE Year Distribution</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart
                    data={Object.entries(result.fireYearDistribution).map(([yr, cnt]) => ({ year: yr, count: cnt, pct: ((cnt / sims) * 100).toFixed(1) }))}
                    margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} width={40} />
                    <Tooltip formatter={(v: number, n: string) => n === 'pct' ? `${v}%` : v} contentStyle={{ fontSize: 12 }} />
                    <Bar dataKey="pct" fill="hsl(var(--chart-2))" name="% of simulations" radius={[3, 3, 0, 0]} />
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
  if (allResults.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        Create and run at least two scenarios to compare them here.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[700px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {['Scenario', `Net Worth ${targetYear}`, `Stock ${targetYear}`, `Crypto ${targetYear}`, 'Passive/mo', 'Gap/mo', 'FIRE Year', 'Risk', 'Feasibility', 'Recommendation'].map(h => (
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
                  <td className={`px-3 py-2 tabular-nums font-medium ${achieved ? 'text-green-500' : 'text-yellow-500'}`}>{fmt(result.projectedPassiveIncome)}/mo</td>
                  <td className={`px-3 py-2 tabular-nums ${achieved ? 'text-green-500' : 'text-red-400'}`}>{achieved ? '✓ Achieved' : fmt(result.gapPerMonth)}</td>
                  <td className="px-3 py-2">{result.fireYear ?? '—'}</td>
                  <td className={`px-3 py-2 ${riskColor(result.riskScore)}`}>{riskLabel(result.riskScore)}</td>
                  <td className={`px-3 py-2 ${feasColor(result.feasibilityScore)}`}>{feasLabel(result.feasibilityScore)}</td>
                  <td className="px-3 py-2">
                    {achieved
                      ? <span className="text-green-500 font-medium">Achieves goal ✓</span>
                      : result.feasibilityScore >= 7 ? <span className="text-blue-400">Close — possible</span>
                      : <span className="text-muted-foreground">Needs changes</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Visual comparison bar chart */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Passive Income Comparison</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={allResults.map(r => ({ name: r.name.slice(0, 16), passive: Math.round(r.result.projectedPassiveIncome), target: targetPassive }))}
              margin={{ top: 4, right: 8, left: 0, bottom: 30 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" />
              <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} width={55} />
              <Tooltip formatter={(v: number) => `$${v.toLocaleString()}/mo`} contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="passive" fill="hsl(var(--chart-2))" name="Projected Passive/mo" radius={[3, 3, 0, 0]} />
              <Bar dataKey="target" fill="hsl(var(--destructive))" name="Target" radius={[3, 3, 0, 0]} opacity={0.4} />
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
  const [assumptions, setAssumptions] = useState<WiAssumption[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    let rows = await loadScenarioAssumptions(scenarioId);
    if (rows.length === 0) {
      const base = PROFILE_DEFAULTS[profile as keyof typeof PROFILE_DEFAULTS] ?? PROFILE_DEFAULTS.moderate;
      rows = Array.from({ length: 10 }, (_, i) => ({
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
    }
    setAssumptions(rows);
    setLoading(false);
  }, [scenarioId, profile]);

  useEffect(() => { reload(); }, [reload]);

  async function update(idx: number, field: keyof WiAssumption, value: number) {
    const updated = assumptions.map((a, i) => i === idx ? { ...a, [field]: value } : a);
    setAssumptions(updated);
    await saveAssumptions([updated[idx]]);
    onChanged?.();
  }

  if (loading) return <div className="flex justify-center py-6"><Loader2 className="animate-spin w-4 h-4 text-muted-foreground" /></div>;

  const COLS: [string, keyof WiAssumption][] = [
    ['Year', 'year'],
    ['Prop G%', 'property_growth'],
    ['Stocks%', 'stocks_return'],
    ['Crypto%', 'crypto_return'],
    ['Super%', 'super_return'],
    ['Inflation%', 'inflation'],
    ['Income G%', 'income_growth'],
    ['Exp G%', 'expense_growth'],
    ['Int Rate%', 'interest_rate'],
    ['Rent G%', 'rent_growth'],
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
          {assumptions.map((a, idx) => (
            <tr key={a.year} className="border-b border-border/40">
              <td className="px-2 py-1.5 font-medium">{a.year}</td>
              {COLS.slice(1).map(([, field]) => (
                <td key={field} className="px-2 py-1">
                  <Input
                    type="number"
                    value={(a[field] as number) ?? 0}
                    onChange={e => update(idx, field, safeN(e.target.value))}
                    className="h-7 text-xs w-16 tabular-nums"
                    step="0.1"
                    data-testid={`input-ass-${field}-${a.year}`}
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
  const [scenarios, setScenarios] = useState<WiScenario[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tab, setTab] = useState('overview');
  const [snap, setSnap] = useState<any>({});
  const [realProperties, setRealProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Active scenario data
  const [properties, setProperties] = useState<WiProperty[]>([]);
  const [stockPlans, setStockPlans] = useState<WiStockPlan[]>([]);
  const [cryptoPlans, setCryptoPlans] = useState<WiCryptoPlan[]>([]);
  const [assumptions, setAssumptions] = useState<WiAssumption[]>([]);
  const [result, setResult] = useState<WiScenarioResult | null>(null);
  const [baseResult, setBaseResult] = useState<WiScenarioResult | null>(null);

  // All results for compare tab
  const [allResults, setAllResults] = useState<{ name: string; result: WiScenarioResult }[]>([]);

  const [computing, setComputing] = useState(false);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [applyOption, setApplyOption] = useState<GoalSolverOption | null>(null);
  const [editGoal, setEditGoal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { toast } = useToast();

  const activeScenario = scenarios.find(s => s.id === activeId) ?? null;

  // ── Load on mount ────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const [snapData, propsData, scenariosData] = await Promise.all([
        fetchSnap(),
        fetchProperties(),
        loadScenarios(),
      ]);
      setSnap(snapData);
      setRealProperties(propsData);
      setScenarios(scenariosData);
      if (scenariosData.length > 0) {
        setActiveId(scenariosData[0].id);
      }
      setLoading(false);
    }
    init();
  }, []);

  // ── Load active scenario data whenever activeId changes ───────────────────

  useEffect(() => {
    if (!activeId) return;
    async function loadActive() {
      const [p, sp, cp, ass] = await Promise.all([
        loadScenarioProperties(activeId!),
        loadScenarioStockPlans(activeId!),
        loadScenarioCryptoPlans(activeId!),
        loadScenarioAssumptions(activeId!),
      ]);
      setProperties(p);
      setStockPlans(sp);
      setCryptoPlans(cp);
      setAssumptions(ass);
    }
    loadActive();
  }, [activeId]);

  // ── Auto-compute on data change ────────────────────────────────────────────

  const computeTimer = useRef<any>(null);

  const scheduleCompute = useCallback(() => {
    clearTimeout(computeTimer.current);
    computeTimer.current = setTimeout(async () => {
      if (!activeScenario) return;
      setComputing(true);
      await new Promise(r => setTimeout(r, 50));
      try {
        // Load fresh data for this scenario
        const [p, sp, cp, ass] = await Promise.all([
          loadScenarioProperties(activeScenario.id),
          loadScenarioStockPlans(activeScenario.id),
          loadScenarioCryptoPlans(activeScenario.id),
          loadScenarioAssumptions(activeScenario.id),
        ]);
        setProperties(p);
        setStockPlans(sp);
        setCryptoPlans(cp);
        setAssumptions(ass);

        const res = runScenarioForecast({
          scenario: activeScenario,
          properties: p,
          stockPlans: sp,
          cryptoPlans: cp,
          assumptions: ass,
          snap,
        });
        setResult(res);

        // Also compute all scenarios for compare tab
        const allSc = await loadScenarios();
        setScenarios(allSc);
        const allRes: { name: string; result: WiScenarioResult }[] = [];
        for (const sc of allSc) {
          const [sp2, cp2, pp2, ass2] = await Promise.all([
            loadScenarioStockPlans(sc.id),
            loadScenarioCryptoPlans(sc.id),
            loadScenarioProperties(sc.id),
            loadScenarioAssumptions(sc.id),
          ]);
          const r2 = runScenarioForecast({ scenario: sc, properties: pp2, stockPlans: sp2, cryptoPlans: cp2, assumptions: ass2, snap });
          allRes.push({ name: sc.name, result: r2 });
          if (sc.is_base_plan && sc.id !== activeScenario.id) setBaseResult(r2);
        }
        setAllResults(allRes);

        // Find base plan result for current scenario's target
        const basePlanRow = allSc.find(s => s.is_base_plan);
        if (basePlanRow && basePlanRow.id !== activeScenario.id) {
          const baseR = allRes.find(r => r.name === basePlanRow.name);
          if (baseR) setBaseResult(baseR.result);
        }
      } finally {
        setComputing(false);
      }
    }, 400);
  }, [activeScenario, snap]);

  useEffect(() => {
    if (activeScenario && snap) scheduleCompute();
  }, [activeScenario, snap, scheduleCompute]);

  // ── Scenario management ───────────────────────────────────────────────────

  async function createNewScenario() {
    const s = await saveScenario({
      name: `Scenario ${scenarios.length + 1}`,
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
        monthly_income: snap.monthly_income,
        monthly_expenses: snap.monthly_expenses,
        cash: snap.cash,
        offset_balance: snap.offset_balance,
        ppor: snap.ppor,
        mortgage: snap.mortgage,
        stocks: snap.stocks,
        crypto: snap.crypto,
        super_balance: snap.super_balance,
        other_debts: snap.other_debts,
      } : {},
    });
    setScenarios(prev => [...prev, s]);
    setActiveId(s.id);
    toast({ title: 'New scenario created' });
  }

  async function duplicateScenario() {
    if (!activeScenario) return;
    const dup = await saveScenario({
      ...activeScenario,
      id: undefined,
      name: `${activeScenario.name} (Copy)`,
      is_base_plan: false,
    });
    // Clone properties
    for (const p of properties) {
      await saveProperty({ ...p, id: undefined, scenario_id: dup.id });
    }
    for (const sp of stockPlans) {
      await saveStockPlan({ ...sp, id: undefined, scenario_id: dup.id });
    }
    for (const cp of cryptoPlans) {
      await saveCryptoPlan({ ...cp, id: undefined, scenario_id: dup.id });
    }
    if (assumptions.length > 0) {
      await saveAssumptions(assumptions.map(a => ({ ...a, id: undefined, scenario_id: dup.id })));
    }
    const updated = await loadScenarios();
    setScenarios(updated);
    setActiveId(dup.id);
    toast({ title: 'Scenario duplicated' });
  }

  async function doClone() {
    setShowCloneDialog(false);
    setLoading(true);
    const cloned = await cloneBasePlan(snap, realProperties, 'Base Plan');
    const updated = await loadScenarios();
    setScenarios(updated);
    setActiveId(cloned.id);
    setLoading(false);
    toast({ title: 'Base plan cloned from your current ledger' });
  }

  async function doDelete() {
    if (!activeId) return;
    await deleteScenario(activeId);
    const updated = await loadScenarios();
    setScenarios(updated);
    setActiveId(updated[0]?.id ?? null);
    setResult(null);
    setShowDeleteDialog(false);
    toast({ title: 'Scenario deleted' });
  }

  async function updateScenarioField(field: keyof WiScenario, value: any) {
    if (!activeScenario) return;
    const updated = { ...activeScenario, [field]: value };
    setScenarios(prev => prev.map(s => s.id === activeId ? updated : s));
    await saveScenario(updated);
    scheduleCompute();
  }

  function handleApplyOption(opt: GoalSolverOption) {
    setApplyOption(opt);
    setShowApplyDialog(true);
  }

  async function confirmApplyOption() {
    if (!applyOption || !activeScenario) return;
    setShowApplyDialog(false);
    // Add extra IPs from the solver option
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
        sort_order: properties.length,
      });
    }
    // Update DCA stock plan
    if (stockPlans.length > 0) {
      await saveStockPlan({ ...stockPlans[0], dca_amount: applyOption.stockDCAMonthly, dca_frequency: 'Monthly' });
    } else {
      await saveStockPlan({
        scenario_id: activeScenario.id,
        label: 'ETF Portfolio',
        starting_value: safeN(snap?.stocks ?? 0),
        lump_sum_amount: 0,
        dca_amount: applyOption.stockDCAMonthly,
        dca_frequency: 'Monthly',
        dca_start_year: 2026,
        dca_end_year: 2035,
        return_mode: 'profile',
        custom_return: 10,
        dividend_yield: 2,
        lump_sum_month: 1,
      });
    }
    scheduleCompute();
    setTab('overview');
    toast({ title: `${applyOption.label} applied to scenario` });
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="animate-spin w-6 h-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading What-If Scenarios…</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-3 md:px-6 py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary" /> What-If Scenarios
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Sandbox forecasting — changes here never affect your real plan unless you click "Apply to Main Plan".
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

      {/* Scenario selector bar */}
      {scenarios.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {scenarios.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveId(s.id)}
              data-testid={`btn-scenario-${s.id}`}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap border transition-colors
                ${s.id === activeId
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:border-primary/50'}`}
            >
              {s.is_base_plan && <span className="mr-1">📋</span>}
              {s.name}
            </button>
          ))}
        </div>
      )}

      {scenarios.length === 0 && (
        <div className="text-center py-16 border border-dashed border-border rounded-xl text-muted-foreground space-y-3">
          <FlaskConical className="w-8 h-8 mx-auto opacity-30" />
          <p className="text-sm">No scenarios yet.</p>
          <div className="flex justify-center gap-2">
            <Button size="sm" onClick={() => setShowCloneDialog(true)} data-testid="btn-clone-first">Clone Current Plan</Button>
            <Button size="sm" variant="outline" onClick={createNewScenario}>New Blank Scenario</Button>
          </div>
        </div>
      )}

      {activeScenario && (
        <>
          {/* Scenario settings bar */}
          <Card>
            <CardContent className="py-3">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
                <div>
                  <Label className="text-xs">Scenario Name</Label>
                  <Input
                    value={activeScenario.name}
                    onChange={e => updateScenarioField('name', e.target.value)}
                    className="h-8 text-sm mt-0.5"
                    data-testid="input-scenario-name"
                  />
                </div>
                <div>
                  <Label className="text-xs">Target Passive/mo ($)</Label>
                  <Input
                    type="number"
                    value={activeScenario.target_passive_income}
                    onChange={e => updateScenarioField('target_passive_income', safeN(e.target.value))}
                    className="h-8 text-sm mt-0.5"
                    data-testid="input-target-passive"
                  />
                </div>
                <div>
                  <Label className="text-xs">Target Year</Label>
                  <Input
                    type="number"
                    value={activeScenario.target_year}
                    onChange={e => updateScenarioField('target_year', parseInt(e.target.value))}
                    className="h-8 text-sm mt-0.5"
                    data-testid="input-target-year"
                  />
                </div>
                <div>
                  <Label className="text-xs">SWR %</Label>
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
                  <Label className="text-xs">Forecast Profile</Label>
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

              {/* Toggles */}
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

              {/* Scenario actions */}
              <div className="flex gap-2 mt-3 flex-wrap">
                <Button size="sm" variant="outline" onClick={duplicateScenario} data-testid="btn-duplicate-scenario">
                  <Copy className="w-3 h-3 mr-1" /> Duplicate
                </Button>
                <Button size="sm" variant="outline" onClick={() => scheduleCompute()} data-testid="btn-recompute">
                  {computing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                  Recompute
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTab('assumptions')} data-testid="btn-show-assumptions">
                  <Info className="w-3 h-3 mr-1" /> Assumptions
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setShowDeleteDialog(true)} data-testid="btn-delete-scenario">
                  <Trash2 className="w-3 h-3 mr-1" /> Delete
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Computing indicator */}
          {computing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Computing forecast…
            </div>
          )}

          {/* Main tabs */}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex flex-wrap h-auto gap-1 mb-4 bg-muted/40 p-1 rounded-lg">
              {[
                { value: 'overview', label: 'Overview', icon: BarChart2 },
                { value: 'properties', label: 'Properties', icon: Home },
                { value: 'stocks', label: 'Stocks', icon: TrendingUp },
                { value: 'crypto', label: 'Crypto', icon: Bitcoin },
                { value: 'cashflow', label: 'Cashflow', icon: DollarSign },
                { value: 'solver', label: 'Goal Solver', icon: Zap },
                { value: 'montecarlo', label: 'Monte Carlo', icon: FlaskConical },
                { value: 'compare', label: 'Compare', icon: TableIcon },
                { value: 'assumptions', label: 'Assumptions', icon: Info },
              ].map(t => (
                <TabsTrigger key={t.value} value={t.value} className="text-xs px-3 py-1.5 flex items-center gap-1.5" data-testid={`tab-${t.value}`}>
                  <t.icon className="w-3 h-3" />{t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="overview">
              <OverviewTab result={result} scenario={activeScenario} baseResult={baseResult} />
            </TabsContent>

            <TabsContent value="properties">
              <PropertiesTab scenarioId={activeScenario.id} onChanged={scheduleCompute} />
            </TabsContent>

            <TabsContent value="stocks">
              <StocksTab scenarioId={activeScenario.id} onChanged={scheduleCompute} />
            </TabsContent>

            <TabsContent value="crypto">
              <CryptoTab scenarioId={activeScenario.id} onChanged={scheduleCompute} />
            </TabsContent>

            <TabsContent value="cashflow">
              <CashflowTab result={result} />
            </TabsContent>

            <TabsContent value="solver">
              <GoalSolverTab
                scenario={activeScenario}
                snap={snap}
                assumptions={assumptions}
                onApplyOption={handleApplyOption}
              />
            </TabsContent>

            <TabsContent value="montecarlo">
              <MonteCarloTab
                scenario={activeScenario}
                properties={properties}
                stockPlans={stockPlans}
                cryptoPlans={cryptoPlans}
                assumptions={assumptions}
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
                  <CardTitle className="text-sm">Custom Year-by-Year Assumptions</CardTitle>
                  <p className="text-xs text-muted-foreground">Override per year, or leave as-is to use the "{activeScenario.profile}" profile defaults.</p>
                </CardHeader>
                <CardContent>
                  <AssumptionsPanel
                    scenarioId={activeScenario.id}
                    profile={activeScenario.profile}
                    onChanged={scheduleCompute}
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
          <DialogHeader>
            <DialogTitle>Clone Current Plan</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will create a new sandbox scenario using your current ledger data (income, expenses, cash, properties, stocks, crypto, super). Your real plan will not be changed.
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
          <DialogHeader>
            <DialogTitle>Apply {applyOption?.label} to Scenario</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will add the following to <strong>{activeScenario?.name}</strong> (sandbox only — real plan unchanged):
          </p>
          <ul className="text-sm space-y-1 mt-2">
            {applyOption?.reasoning.map((r, i) => (
              <li key={i} className="flex gap-2"><span className="text-primary">→</span>{r}</li>
            ))}
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
          <DialogHeader>
            <DialogTitle>Delete Scenario</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Delete <strong>{activeScenario?.name}</strong>? This cannot be undone. Your real plan is not affected.
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

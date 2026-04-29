/**
 * debt-strategy.tsx — Debt Payoff Strategy Engine
 * Route: /debt-strategy
 *
 * Features:
 *  - Load debts from snapshot (mortgage + other_debts) + user can add custom debts
 *  - Three strategies: Avalanche (highest rate first), Snowball (lowest balance first), Hybrid
 *  - Extra payment slider (per month)
 *  - For each strategy: payoff months, total interest, interest saved vs minimum-only, relief after first payoff
 *  - Payoff timeline bar chart (stacked months-to-payoff per debt per strategy)
 *  - Comparison table: side-by-side summary
 *  - First-12-months action plan (month-by-month schedule for recommended strategy)
 *  - Debt inputs: name, balance, rate, minimum payment — editable, add/remove
 */

import SaveButton from "@/components/SaveButton";
import { useState, useMemo, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, safeNum } from "@/lib/finance";
import { useAppStore } from "@/lib/store";
import { useForecastAssumptions } from "@/lib/useForecastAssumptions";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line, Cell,
} from "recharts";
import {
  CreditCard, Plus, Trash2, TrendingDown, Zap,
  Award, Target, Info, ChevronDown, ChevronUp,
  ArrowRight, CheckCircle2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DebtItem {
  id: string;
  name: string;
  balance: number;
  rate: number;      // annual % e.g. 6.5
  minPayment: number;
}

interface DebtResult {
  months: number;
  totalPaid: number;
  totalInterest: number;
  schedule: Array<{ month: number; debtId: string; payment: number; principalPaid: number; interestPaid: number; remaining: number }>;
  perDebtPayoff: Record<string, number>; // debtId → month when paid off
}

// ─── Engine ───────────────────────────────────────────────────────────────────

function simulateDebtPayoff(
  debts: DebtItem[],
  extraPayment: number,
  sortFn: (a: DebtItem, b: DebtItem) => number
): DebtResult {
  if (!debts.length) return { months: 0, totalPaid: 0, totalInterest: 0, schedule: [], perDebtPayoff: {} };

  const totalMin = debts.reduce((s, d) => s + d.minPayment, 0);
  const totalBudget = totalMin + extraPayment;

  // Clone debts
  let ds = debts.map((d) => ({ ...d, remaining: d.balance, paidOff: false, paidOffMonth: 0 }));
  let month = 0;
  let totalPaid = 0;
  let totalInterest = 0;
  const schedule: DebtResult["schedule"] = [];
  const perDebtPayoff: Record<string, number> = {};

  const MAX_MONTHS = 600;

  while (ds.some((d) => d.remaining > 0.01) && month < MAX_MONTHS) {
    month++;

    // Calculate interest on all active debts
    for (const d of ds) {
      if (d.remaining <= 0.01) continue;
      const monthlyRate = d.rate / 100 / 12;
      const interest = d.remaining * monthlyRate;
      d.remaining += interest;
      totalInterest += interest;
    }

    // Pay minimums on all active debts
    let budgetLeft = totalBudget;
    for (const d of ds) {
      if (d.remaining <= 0.01) continue;
      const pay = Math.min(d.minPayment, d.remaining);
      const interestShare = d.remaining * (d.rate / 100 / 12) / (1 + d.rate / 100 / 12);
      const principalPay = pay - interestShare;
      d.remaining -= pay;
      totalPaid += pay;
      budgetLeft -= pay;
      schedule.push({ month, debtId: d.id, payment: pay, principalPaid: Math.max(0, principalPay), interestPaid: Math.max(0, interestShare), remaining: Math.max(0, d.remaining) });
      if (d.remaining <= 0.01 && !d.paidOff) {
        d.remaining = 0;
        d.paidOff = true;
        d.paidOffMonth = month;
        perDebtPayoff[d.id] = month;
      }
    }

    // Apply extra payment to priority target (sorted)
    const active = ds.filter((d) => d.remaining > 0.01).sort(sortFn);
    if (active.length > 0 && budgetLeft > 0) {
      const target = active[0];
      const extra = Math.min(budgetLeft, target.remaining);
      target.remaining -= extra;
      totalPaid += extra;
      if (target.remaining <= 0.01) {
        target.remaining = 0;
        if (!target.paidOff) {
          target.paidOff = true;
          target.paidOffMonth = month;
          perDebtPayoff[target.id] = month;
        }
      }
    }

    // Freed minimums roll into next budget (waterfall effect)
    // Already handled because paidOff debts pay 0
  }

  return { months: month, totalPaid, totalInterest, schedule, perDebtPayoff };
}

function simulateMinimumOnly(debts: DebtItem[]): DebtResult {
  return simulateDebtPayoff(debts, 0, (a, b) => a.rate - b.rate);
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color = 'text-foreground', icon: Icon,
}: {
  label: string; value: string; sub?: string; color?: string; icon?: React.ComponentType<any>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
      </div>
      <p className={`text-xl font-bold num-display ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
        <p className="text-muted-foreground mb-1 font-medium">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }} className="flex justify-between gap-4">
            <span>{p.name}</span>
            <span className="font-mono">{typeof p.value === 'number' ? formatCurrency(p.value, true) : p.value}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ─── Debt Row Form (module-level to prevent focus loss) ───────────────────────

interface DebtRowProps {
  debt: DebtItem;
  onChange: (id: string, field: keyof DebtItem, value: string) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
}

function DebtRow({ debt, onChange, onRemove, canRemove }: DebtRowProps) {
  const uid = useId();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end p-3 rounded-lg bg-secondary/30 border border-border/50">
      <div className="col-span-2 sm:col-span-1">
        <Label htmlFor={`${uid}-name`} className="text-xs text-muted-foreground mb-1 block">Debt Name</Label>
        <Input
          id={`${uid}-name`}
          value={debt.name}
          onChange={(e) => onChange(debt.id, 'name', e.target.value)}
          className="h-8 text-sm"
          placeholder="e.g. Car Loan"
        />
      </div>
      <div>
        <Label htmlFor={`${uid}-balance`} className="text-xs text-muted-foreground mb-1 block">Balance ($)</Label>
        <Input
          id={`${uid}-balance`}
          type="number"
          value={debt.balance || ''}
          onChange={(e) => onChange(debt.id, 'balance', e.target.value)}
          className="h-8 text-sm"
          placeholder="0"
          min={0}
        />
      </div>
      <div>
        <Label htmlFor={`${uid}-rate`} className="text-xs text-muted-foreground mb-1 block">Rate (% p.a.)</Label>
        <Input
          id={`${uid}-rate`}
          type="number"
          value={debt.rate || ''}
          onChange={(e) => onChange(debt.id, 'rate', e.target.value)}
          className="h-8 text-sm"
          placeholder="0.00"
          step={0.1}
          min={0}
        />
      </div>
      <div>
        <Label htmlFor={`${uid}-min`} className="text-xs text-muted-foreground mb-1 block">Min Payment ($/mo)</Label>
        <Input
          id={`${uid}-min`}
          type="number"
          value={debt.minPayment || ''}
          onChange={(e) => onChange(debt.id, 'minPayment', e.target.value)}
          className="h-8 text-sm"
          placeholder="0"
          min={0}
        />
      </div>
      <div className="flex justify-end">
        {canRemove && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-950/30"
            onClick={() => onRemove(debt.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Strategy colors ──────────────────────────────────────────────────────────

const STRATEGY_COLORS = {
  avalanche: 'hsl(188,60%,48%)',
  snowball:  'hsl(142,60%,45%)',
  hybrid:    'hsl(43,85%,55%)',
  minimum:   'hsl(0,72%,51%)',
};

const DEBT_COLORS = ['hsl(43,85%,55%)', 'hsl(188,60%,48%)', 'hsl(142,60%,45%)', 'hsl(20,80%,55%)', 'hsl(270,60%,60%)', 'hsl(0,72%,51%)'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DebtStrategyPage() {
  const { toast } = useToast();
  const { privacyMode } = useAppStore();
  const fa = useForecastAssumptions();

  // ── Fetch snapshot for mortgage + other_debts ──────────────────────────────
  const { data: snapshot } = useQuery<any>({
    queryKey: ['/api/snapshot'],
    queryFn: () => apiRequest('GET', '/api/snapshot').then(r => r.json()),
  });

  const snapMortgage   = safeNum(snapshot?.mortgage);
  const snapOtherDebts = safeNum(snapshot?.other_debts);

  // ── Debts state (pre-populated from snapshot) ─────────────────────────────
  const defaultDebts: DebtItem[] = useMemo(() => {
    const list: DebtItem[] = [];
    if (snapMortgage > 0) {
      list.push({
        id: 'mortgage',
        name: 'Home Mortgage',
        balance: snapMortgage,
        rate: fa.flat.interest_rate,
        minPayment: Math.round(snapMortgage * 0.006),  // ~0.6% of balance as rough est.
      });
    }
    if (snapOtherDebts > 0) {
      list.push({
        id: 'other',
        name: 'Other Debts',
        balance: snapOtherDebts,
        rate: 15.0,
        minPayment: Math.round(snapOtherDebts * 0.03),  // ~3% of balance
      });
    }
    if (!list.length) {
      list.push({ id: 'sample', name: 'Credit Card', balance: 5000, rate: 19.99, minPayment: 150 });
    }
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapMortgage, snapOtherDebts]);

  const [debts, setDebts] = useState<DebtItem[]>([]);
  // ── Debt prefs — loaded from Supabase (sf_app_settings) ─────────────────
  const { data: appSettings } = useQuery({
    queryKey: ['/api/app-settings'],
    queryFn: () => apiRequest('GET', '/api/app-settings').then(r => r.json()),
    staleTime: 0,
  });
  const [debtPrefsEdit, setDebtPrefsEdit] = useState<any>(null);
  const debtPrefs = debtPrefsEdit ??
    (appSettings?.debt_prefs ? { extraPayment: 500, activeStrategy: 'avalanche', ...appSettings.debt_prefs }
     : { extraPayment: 500, activeStrategy: 'avalanche' });

  const extraPayment    = debtPrefs.extraPayment;
  const activeStrategy  = debtPrefs.activeStrategy as 'avalanche' | 'snowball' | 'hybrid';
  function setExtraPayment(v: number)             { setDebtPrefsEdit((p:any) => ({ ...(p ?? debtPrefs), extraPayment: v })); }
  function setActiveStrategy(v: 'avalanche' | 'snowball' | 'hybrid') { setDebtPrefsEdit((p:any) => ({ ...(p ?? debtPrefs), activeStrategy: v })); }

  const saveDebtPrefs = async () => {
    await apiRequest('PATCH', '/api/app-settings', { debt_prefs: debtPrefs });
    setDebtPrefsEdit(null);
  };
  const [showActionPlan, setShowActionPlan] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Initialise from snapshot once data arrives
  useMemo(() => {
    if (!initialized && defaultDebts.length > 0) {
      setDebts(defaultDebts);
      setInitialized(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultDebts]);

  // ── Debt CRUD ──────────────────────────────────────────────────────────────

  const handleChange = (id: string, field: keyof DebtItem, value: string) => {
    setDebts(prev => prev.map(d => d.id !== id ? d : {
      ...d,
      [field]: field === 'name' ? value : parseFloat(value) || 0,
    }));
  };

  const handleRemove = (id: string) => {
    setDebts(prev => prev.filter(d => d.id !== id));
  };

  const handleAdd = () => {
    const id = `debt_${Date.now()}`;
    setDebts(prev => [...prev, { id, name: 'New Debt', balance: 0, rate: 5.0, minPayment: 100 }]);
    toast({ title: 'Debt added', description: 'Fill in the details above.' });
  };

  // ── Engine runs ────────────────────────────────────────────────────────────

  const validDebts = debts.filter(d => d.balance > 0 && d.rate >= 0 && d.minPayment > 0);

  const results = useMemo(() => {
    if (!validDebts.length) return null;

    const maxRate = Math.max(...validDebts.map(d => d.rate));
    const maxBal  = Math.max(...validDebts.map(d => d.balance));

    const avalanche = simulateDebtPayoff(validDebts, extraPayment, (a, b) => b.rate - a.rate);
    const snowball  = simulateDebtPayoff(validDebts, extraPayment, (a, b) => a.balance - b.balance);
    const hybrid    = simulateDebtPayoff(validDebts, extraPayment, (a, b) => {
      const scoreA = (a.rate / maxRate) * 0.6 + (1 - a.balance / maxBal) * 0.4;
      const scoreB = (b.rate / maxBal) * 0.6 + (1 - b.balance / maxBal) * 0.4;
      return scoreB - scoreA;
    });
    const minimum   = simulateMinimumOnly(validDebts);

    return { avalanche, snowball, hybrid, minimum };
  }, [validDebts, extraPayment]);

  // ── First 12-month action plan (for active strategy) ─────────────────────

  const actionPlan = useMemo(() => {
    if (!validDebts.length || !results) return [];

    const sortFn =
      activeStrategy === 'avalanche' ? (a: DebtItem, b: DebtItem) => b.rate - a.rate :
      activeStrategy === 'snowball'  ? (a: DebtItem, b: DebtItem) => a.balance - b.balance :
      (a: DebtItem, b: DebtItem) => {
        const maxRate = Math.max(...validDebts.map(d => d.rate));
        const maxBal  = Math.max(...validDebts.map(d => d.balance));
        const scoreA = (a.rate / maxRate) * 0.6 + (1 - a.balance / maxBal) * 0.4;
        const scoreB = (b.rate / maxRate) * 0.6 + (1 - b.balance / maxBal) * 0.4;
        return scoreB - scoreA;
      };

    const totalMin = validDebts.reduce((s, d) => s + d.minPayment, 0);
    const totalBudget = totalMin + extraPayment;
    let ds = validDebts.map(d => ({ ...d, remaining: d.balance }));
    const plan: Array<{ month: number; target: string; totalBudget: number; payments: Array<{ name: string; amount: number; interest: number; remaining: number }>; freed: number }> = [];

    for (let m = 1; m <= 12; m++) {
      // Apply interest
      for (const d of ds) {
        if (d.remaining <= 0) continue;
        d.remaining += d.remaining * (d.rate / 100 / 12);
      }

      // Sort to find target
      const active = ds.filter(d => d.remaining > 0.01).sort(sortFn);
      const target = active[0];

      // Pay minimums
      let budgetLeft = totalBudget;
      const payments: typeof plan[0]['payments'] = [];
      for (const d of ds) {
        if (d.remaining <= 0.01) { payments.push({ name: d.name, amount: 0, interest: 0, remaining: 0 }); continue; }
        const interest = d.remaining * (d.rate / 100 / 12);
        const pay = Math.min(d.minPayment, d.remaining);
        d.remaining -= pay;
        budgetLeft -= pay;
        payments.push({ name: d.name, amount: pay, interest: Math.round(interest), remaining: Math.round(Math.max(0, d.remaining)) });
      }

      // Extra to target
      let freed = 0;
      if (target && budgetLeft > 0) {
        const extra = Math.min(budgetLeft, target.remaining);
        target.remaining -= extra;
        const idx = payments.findIndex(p => p.name === target.name);
        if (idx >= 0) { payments[idx].amount += extra; payments[idx].remaining = Math.round(Math.max(0, target.remaining)); }

        // Check if any debt was freed this month
        for (const d of ds) {
          if (d.remaining <= 0.01 && validDebts.find(od => od.id === d.id)?.balance > 0) {
            freed += validDebts.find(od => od.id === d.id)?.minPayment || 0;
          }
        }
      }

      plan.push({
        month: m,
        target: target?.name || '—',
        totalBudget,
        payments,
        freed,
      });
    }

    return plan;
  }, [validDebts, extraPayment, activeStrategy, results]);

  // ── Chart data: comparison bar chart ─────────────────────────────────────

  const comparisonChartData = useMemo(() => {
    if (!results) return [];
    return [
      { name: 'Avalanche', months: results.avalanche.months, interest: results.avalanche.totalInterest, color: STRATEGY_COLORS.avalanche },
      { name: 'Snowball',  months: results.snowball.months,  interest: results.snowball.totalInterest,  color: STRATEGY_COLORS.snowball },
      { name: 'Hybrid',    months: results.hybrid.months,    interest: results.hybrid.totalInterest,    color: STRATEGY_COLORS.hybrid },
      { name: 'Min Only',  months: results.minimum.months,   interest: results.minimum.totalInterest,   color: STRATEGY_COLORS.minimum },
    ];
  }, [results]);

  // ── Chart data: per-debt payoff timeline ─────────────────────────────────

  const payoffTimelineData = useMemo(() => {
    if (!results) return [];
    const chosen = results[activeStrategy];

    return validDebts.map((d, i) => ({
      name: d.name.length > 14 ? d.name.slice(0, 14) + '…' : d.name,
      month: chosen.perDebtPayoff[d.id] || chosen.months,
      balance: d.balance,
      color: DEBT_COLORS[i % DEBT_COLORS.length],
    }));
  }, [results, activeStrategy, validDebts]);

  // ── Monthly balance over time (first 60 months) ───────────────────────────

  const balanceOverTime = useMemo(() => {
    if (!results || !validDebts.length) return [];
    const chosen = results[activeStrategy];
    const minimum = results.minimum;

    const data: Array<{ month: string; Chosen: number; MinimumOnly: number }> = [];
    const totalBal = validDebts.reduce((s, d) => s + d.balance, 0);

    for (let m = 0; m <= Math.min(chosen.months + 6, 120); m += 3) {
      const chosenBal = chosen.schedule.filter(s => s.month === m).reduce((s, r) => s + r.remaining, totalBal);
      const minBal    = minimum.schedule.filter(s => s.month === m).reduce((s, r) => s + r.remaining, totalBal);
      data.push({
        month: `Mo ${m}`,
        Chosen: Math.max(0, chosenBal),
        MinimumOnly: Math.max(0, minBal),
      });
    }

    return data;
  }, [results, activeStrategy, validDebts]);

  // ── Mask helper ───────────────────────────────────────────────────────────

  const mv = (val: string) => privacyMode ? '$••••••' : val;

  const chosen = results?.[activeStrategy];
  const minimum = results?.minimum;
  const interestSaved = minimum && chosen ? minimum.totalInterest - chosen.totalInterest : 0;
  const monthsSaved   = minimum && chosen ? minimum.months - chosen.months : 0;

  const totalBalance = validDebts.reduce((s, d) => s + d.balance, 0);

  return (
    <div className="space-y-5 animate-fade-up pb-8">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Debt Strategy Engine
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Avalanche · Snowball · Hybrid — Find the fastest, cheapest path to debt freedom
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-lg">
            {validDebts.length} debt{validDebts.length !== 1 ? 's' : ''} · {mv(formatCurrency(totalBalance, true))} total
          </span>
        </div>
      </div>

      {/* ── Debt Inputs ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            <p className="text-sm font-bold">Your Debts</p>
          </div>
          <Button size="sm" onClick={handleAdd} className="gap-1.5 h-8 text-xs">
            <Plus className="w-3.5 h-3.5" /> Add Debt
          </Button>
        </div>

        <div className="space-y-2">
          {debts.map(debt => (
            <DebtRow
              key={debt.id}
              debt={debt}
              onChange={handleChange}
              onRemove={handleRemove}
              canRemove={debts.length > 1}
            />
          ))}
        </div>

        {/* Extra payment slider */}
        <div className="mt-5 pt-4 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-semibold">Extra Monthly Payment</p>
              <p className="text-xs text-muted-foreground">Amount above minimums to attack debt faster</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={extraPayment}
                onChange={(e) => setExtraPayment(Math.max(0, parseFloat(e.target.value) || 0))}
                className="h-8 w-28 text-sm text-right"
                min={0}
                step={50}
              />
              <span className="text-sm text-muted-foreground">/mo</span>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={5000}
            step={50}
            value={extraPayment}
            onChange={(e) => setExtraPayment(parseInt(e.target.value))}
            className="w-full h-2 rounded-full cursor-pointer"
            style={{ accentColor: 'hsl(43,85%,55%)' }}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>$0</span>
            <span>$1,000</span>
            <span>$2,500</span>
            <span>$5,000</span>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <SaveButton label="Save Preferences" onSave={saveDebtPrefs} />
            {debtPrefsEdit && (
              <span className="text-xs text-amber-400">Unsaved — click Save to persist</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Results guard ─────────────────────────────────────────────────── */}
      {!results ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Add at least one debt with a balance, rate, and minimum payment to see your strategy results.</p>
        </div>
      ) : (
        <>
          {/* ── Strategy Selector ──────────────────────────────────────── */}
          <div className="grid sm:grid-cols-3 gap-3">
            {(
              [
                {
                  key: 'avalanche' as const,
                  label: 'Avalanche',
                  icon: TrendingDown,
                  desc: 'Highest interest rate first — minimises total interest paid',
                  badge: 'Saves Most Money',
                  badgeColor: 'hsl(188,60%,48%)',
                  data: results.avalanche,
                },
                {
                  key: 'snowball' as const,
                  label: 'Snowball',
                  icon: Zap,
                  desc: 'Smallest balance first — fastest psychological wins',
                  badge: 'Fastest Wins',
                  badgeColor: 'hsl(142,60%,45%)',
                  data: results.snowball,
                },
                {
                  key: 'hybrid' as const,
                  label: 'Hybrid',
                  icon: Award,
                  desc: 'Balanced mix of rate & balance — optimal real-world approach',
                  badge: 'Recommended',
                  badgeColor: 'hsl(43,85%,55%)',
                  data: results.hybrid,
                },
              ]
            ).map(({ key, label, icon: Icon, desc, badge, badgeColor, data }) => (
              <button
                key={key}
                onClick={() => setActiveStrategy(key)}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  activeStrategy === key
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-card hover:border-muted-foreground/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" style={{ color: badgeColor }} />
                    <span className="font-bold text-sm">{label}</span>
                  </div>
                  {activeStrategy === key && (
                    <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                  )}
                </div>
                <span
                  className="text-xs font-semibold px-1.5 py-0.5 rounded"
                  style={{ background: `${badgeColor}22`, color: badgeColor }}
                >
                  {badge}
                </span>
                <p className="text-xs text-muted-foreground mt-2">{desc}</p>
                <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Payoff</p>
                    <p className="font-bold num-display">
                      {data.months >= 600 ? '50+ yrs' : data.months < 12
                        ? `${data.months}mo`
                        : `${Math.floor(data.months / 12)}y ${data.months % 12}m`}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total Interest</p>
                    <p className="font-bold num-display text-red-400">{mv(formatCurrency(data.totalInterest, true))}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* ── KPI Row ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard
              label="Payoff Timeline"
              value={chosen!.months >= 600
                ? '50+ years'
                : chosen!.months < 12
                  ? `${chosen!.months} months`
                  : `${Math.floor(chosen!.months / 12)}y ${chosen!.months % 12}m`}
              sub={`${chosen!.months} monthly payments`}
              color="text-primary"
              icon={Target}
            />
            <KpiCard
              label="Total Interest"
              value={mv(formatCurrency(chosen!.totalInterest, true))}
              sub="Interest you'll pay in total"
              color="text-red-400"
              icon={CreditCard}
            />
            <KpiCard
              label="Interest Saved"
              value={mv(formatCurrency(Math.max(0, interestSaved), true))}
              sub={`vs. minimum-only payments`}
              color="text-emerald-400"
              icon={Award}
            />
            <KpiCard
              label="Time Saved"
              value={monthsSaved <= 0 ? '—' : monthsSaved < 12 ? `${monthsSaved}mo` : `${Math.floor(monthsSaved / 12)}y ${monthsSaved % 12}m`}
              sub="vs. minimum-only payments"
              color="text-emerald-400"
              icon={Zap}
            />
          </div>

          {/* ── Charts Row ──────────────────────────────────────────────── */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Strategy Comparison */}
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm font-bold mb-1">Strategy Comparison</p>
              <p className="text-xs text-muted-foreground mb-4">Total interest paid by strategy</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={comparisonChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(220,10%,55%)' }} />
                  <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="interest" name="Total Interest" radius={[4, 4, 0, 0]}>
                    {comparisonChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Debt payoff order */}
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm font-bold mb-1">Payoff Order — {activeStrategy.charAt(0).toUpperCase() + activeStrategy.slice(1)}</p>
              <p className="text-xs text-muted-foreground mb-4">Month each debt is fully paid off</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={payoffTimelineData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" horizontal={false} />
                  <XAxis type="number" dataKey="month" tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }}
                    label={{ value: 'Month', position: 'insideBottom', offset: -2, fontSize: 10, fill: 'hsl(220,10%,55%)' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} width={80} />
                  <Tooltip content={<CustomTooltip />} formatter={(v: any) => [`Month ${v}`, 'Paid off at']} />
                  <Bar dataKey="month" name="Payoff Month" radius={[0, 4, 4, 0]}>
                    {payoffTimelineData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Balance Over Time Chart */}
          {balanceOverTime.length > 1 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold">Total Debt Balance Over Time</p>
                  <p className="text-xs text-muted-foreground">
                    {activeStrategy.charAt(0).toUpperCase() + activeStrategy.slice(1)} strategy vs. minimum-only payments
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-2 rounded" style={{ background: STRATEGY_COLORS[activeStrategy] }} />
                    <span className="text-muted-foreground">{activeStrategy.charAt(0).toUpperCase() + activeStrategy.slice(1)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-2 rounded" style={{ background: STRATEGY_COLORS.minimum }} />
                    <span className="text-muted-foreground">Min Only</span>
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={balanceOverTime} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} interval={3} />
                  <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="Chosen"     stroke={STRATEGY_COLORS[activeStrategy]} strokeWidth={2.5} dot={false} name={activeStrategy.charAt(0).toUpperCase() + activeStrategy.slice(1)} />
                  <Line type="monotone" dataKey="MinimumOnly" stroke={STRATEGY_COLORS.minimum}        strokeWidth={1.5} dot={false} strokeDasharray="5 3" name="Min Only" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ── Comparison Table ────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-sm font-bold mb-4 flex items-center gap-2">
              <Award className="w-4 h-4 text-primary" />
              Side-by-Side Comparison
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left pb-2 pr-4 text-muted-foreground font-medium">Metric</th>
                    <th className="text-right pb-2 pr-4 font-semibold" style={{ color: STRATEGY_COLORS.avalanche }}>Avalanche</th>
                    <th className="text-right pb-2 pr-4 font-semibold" style={{ color: STRATEGY_COLORS.snowball }}>Snowball</th>
                    <th className="text-right pb-2 pr-4 font-semibold" style={{ color: STRATEGY_COLORS.hybrid }}>Hybrid</th>
                    <th className="text-right pb-2 text-muted-foreground font-medium">Min Only</th>
                  </tr>
                </thead>
                <tbody className="[&>tr]:border-b [&>tr]:border-border/50 [&>tr>td]:py-2">
                  <tr>
                    <td className="pr-4 text-muted-foreground">Payoff Time</td>
                    <td className="text-right pr-4 num-display font-semibold">
                      {results.avalanche.months >= 600 ? '50+ yrs' : `${Math.floor(results.avalanche.months / 12)}y ${results.avalanche.months % 12}m`}
                    </td>
                    <td className="text-right pr-4 num-display font-semibold">
                      {results.snowball.months >= 600 ? '50+ yrs' : `${Math.floor(results.snowball.months / 12)}y ${results.snowball.months % 12}m`}
                    </td>
                    <td className="text-right pr-4 num-display font-semibold">
                      {results.hybrid.months >= 600 ? '50+ yrs' : `${Math.floor(results.hybrid.months / 12)}y ${results.hybrid.months % 12}m`}
                    </td>
                    <td className="text-right num-display text-muted-foreground">
                      {results.minimum.months >= 600 ? '50+ yrs' : `${Math.floor(results.minimum.months / 12)}y ${results.minimum.months % 12}m`}
                    </td>
                  </tr>
                  <tr>
                    <td className="pr-4 text-muted-foreground">Total Interest</td>
                    <td className="text-right pr-4 num-display text-red-400">{mv(formatCurrency(results.avalanche.totalInterest, true))}</td>
                    <td className="text-right pr-4 num-display text-red-400">{mv(formatCurrency(results.snowball.totalInterest, true))}</td>
                    <td className="text-right pr-4 num-display text-red-400">{mv(formatCurrency(results.hybrid.totalInterest, true))}</td>
                    <td className="text-right num-display text-red-400">{mv(formatCurrency(results.minimum.totalInterest, true))}</td>
                  </tr>
                  <tr>
                    <td className="pr-4 text-muted-foreground">Interest Saved</td>
                    <td className="text-right pr-4 num-display text-emerald-400">{mv(formatCurrency(Math.max(0, results.minimum.totalInterest - results.avalanche.totalInterest), true))}</td>
                    <td className="text-right pr-4 num-display text-emerald-400">{mv(formatCurrency(Math.max(0, results.minimum.totalInterest - results.snowball.totalInterest), true))}</td>
                    <td className="text-right pr-4 num-display text-emerald-400">{mv(formatCurrency(Math.max(0, results.minimum.totalInterest - results.hybrid.totalInterest), true))}</td>
                    <td className="text-right num-display text-muted-foreground">baseline</td>
                  </tr>
                  <tr>
                    <td className="pr-4 text-muted-foreground">Time Saved</td>
                    <td className="text-right pr-4 num-display text-emerald-400">
                      {results.minimum.months - results.avalanche.months <= 0 ? '—' : `${results.minimum.months - results.avalanche.months}mo`}
                    </td>
                    <td className="text-right pr-4 num-display text-emerald-400">
                      {results.minimum.months - results.snowball.months <= 0 ? '—' : `${results.minimum.months - results.snowball.months}mo`}
                    </td>
                    <td className="text-right pr-4 num-display text-emerald-400">
                      {results.minimum.months - results.hybrid.months <= 0 ? '—' : `${results.minimum.months - results.hybrid.months}mo`}
                    </td>
                    <td className="text-right num-display text-muted-foreground">baseline</td>
                  </tr>
                  <tr>
                    <td className="pr-4 text-muted-foreground">Total Paid</td>
                    <td className="text-right pr-4 num-display">{mv(formatCurrency(results.avalanche.totalPaid, true))}</td>
                    <td className="text-right pr-4 num-display">{mv(formatCurrency(results.snowball.totalPaid, true))}</td>
                    <td className="text-right pr-4 num-display">{mv(formatCurrency(results.hybrid.totalPaid, true))}</td>
                    <td className="text-right num-display text-muted-foreground">{mv(formatCurrency(results.minimum.totalPaid, true))}</td>
                  </tr>
                  <tr>
                    <td className="pr-4 text-muted-foreground">Extra/month</td>
                    <td className="text-right pr-4 num-display">{mv(formatCurrency(extraPayment))}</td>
                    <td className="text-right pr-4 num-display">{mv(formatCurrency(extraPayment))}</td>
                    <td className="text-right pr-4 num-display">{mv(formatCurrency(extraPayment))}</td>
                    <td className="text-right num-display text-muted-foreground">$0</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 12-Month Action Plan ─────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-5">
            <button
              onClick={() => setShowActionPlan(v => !v)}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-primary" />
                <p className="text-sm font-bold">12-Month Action Plan — {activeStrategy.charAt(0).toUpperCase() + activeStrategy.slice(1)} Strategy</p>
              </div>
              {showActionPlan ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {showActionPlan && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-3">
                  Month-by-month payment schedule for your first 12 months.
                  <strong className="text-foreground"> Focus target</strong> receives all extra payments.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left pb-2 pr-3 text-muted-foreground font-medium whitespace-nowrap">Month</th>
                        <th className="text-left pb-2 pr-3 text-muted-foreground font-medium whitespace-nowrap">Focus Target</th>
                        {validDebts.map(d => (
                          <th key={d.id} className="text-right pb-2 pr-3 text-muted-foreground font-medium whitespace-nowrap">{d.name.length > 10 ? d.name.slice(0, 10) + '…' : d.name}</th>
                        ))}
                        <th className="text-right pb-2 text-muted-foreground font-medium whitespace-nowrap">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actionPlan.map((row) => (
                        <tr key={row.month} className="border-b border-border/40 hover:bg-secondary/20">
                          <td className="py-1.5 pr-3 font-semibold text-primary">Mo {row.month}</td>
                          <td className="py-1.5 pr-3">
                            <span className="px-1.5 py-0.5 rounded text-xs font-semibold" style={{ background: 'hsl(43,85%,55%)22', color: 'hsl(43,85%,65%)' }}>
                              {row.target}
                            </span>
                          </td>
                          {validDebts.map(d => {
                            const pay = row.payments.find(p => p.name === d.name);
                            const isTarget = row.target === d.name;
                            return (
                              <td key={d.id} className={`py-1.5 pr-3 text-right num-display ${isTarget ? 'font-bold text-primary' : 'text-foreground'}`}>
                                {pay && pay.amount > 0 ? mv(formatCurrency(pay.amount)) : '—'}
                                {pay && pay.remaining === 0 && <span className="ml-1 text-emerald-400 text-xs">✓</span>}
                              </td>
                            );
                          })}
                          <td className="py-1.5 text-right num-display font-semibold">
                            {mv(formatCurrency(row.totalBudget))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border">
                        <td colSpan={2} className="pt-2 text-xs text-muted-foreground">Total budget/mo</td>
                        {validDebts.map(d => (
                          <td key={d.id} className="pt-2 text-right text-xs num-display text-muted-foreground">
                            {mv(formatCurrency(d.minPayment))} min
                          </td>
                        ))}
                        <td className="pt-2 text-right num-display font-bold">
                          {mv(formatCurrency(validDebts.reduce((s, d) => s + d.minPayment, 0) + extraPayment))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ── Strategy Tips ────────────────────────────────────────────── */}
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              {
                title: 'Avalanche Tip',
                color: STRATEGY_COLORS.avalanche,
                icon: TrendingDown,
                text: "Mathematically optimal. Target the highest-rate debt first. You'll pay the least total interest over time. Great if you stay disciplined.",
              },
              {
                title: 'Snowball Tip',
                color: STRATEGY_COLORS.snowball,
                icon: Zap,
                text: 'Psychologically powerful. Quick wins boost motivation. Pay off the smallest balance first, then roll that payment to the next debt.',
              },
              {
                title: 'Hybrid Tip',
                color: STRATEGY_COLORS.hybrid,
                icon: Award,
                text: "Best of both worlds. Balances rate savings with motivational wins. Recommended for most households as it is both efficient and sustainable.",
              },
            ].map(({ title, color, icon: Icon, text }) => (
              <div key={title} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4" style={{ color }} />
                  <p className="text-sm font-semibold">{title}</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
              </div>
            ))}
          </div>

          {/* ── Info note ────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground/70">How This Works</p>
                <ul className="space-y-0.5 list-disc list-inside">
                  <li>All calculations use compound interest (monthly compounding).</li>
                  <li>Minimum payments are paid to all debts each month.</li>
                  <li>Extra payment is directed entirely to the focus target debt.</li>
                  <li>When a debt is paid off, its minimum payment is freed and rolls into the extra budget (debt avalanche/waterfall effect).</li>
                  <li>Mortgage uses ~0.6% of balance as estimated minimum payment — update to your actual P&amp;I repayment for accuracy.</li>
                </ul>
                <p className="mt-1 italic">This is a planning tool only. Actual outcomes depend on your lender's interest calculation method and any fees.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

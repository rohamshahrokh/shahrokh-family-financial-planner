import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, safeNum, calcSavingsRate, projectNetWorth } from "@/lib/finance";
import { syncFromCloud, getLastSync } from "@/lib/localStore";
import { useAppStore } from "@/lib/store";
import KpiCard from "@/components/KpiCard";
import SaveButton from "@/components/SaveButton";
import { useState, useMemo, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line
} from "recharts";
import {
  TrendingUp, DollarSign, Home, CreditCard,
  PiggyBank, Calendar, Layers, Target, Edit2, Check, X, RefreshCw
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import familyImg from "@assets/family.jpeg";

const COLORS = ['hsl(43,85%,55%)', 'hsl(188,60%,48%)', 'hsl(142,60%,45%)', 'hsl(20,80%,55%)', 'hsl(270,60%,60%)', 'hsl(0,72%,51%)'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value, true)}</p>
        ))}
      </div>
    );
  }
  return null;
};

export default function DashboardPage() {
  const qc = useQueryClient();
  const { chartView } = useAppStore();
  const [editSnap, setEditSnap] = useState(false);
  const [snapDraft, setSnapDraft] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(getLastSync);

  const handleSyncFromCloud = useCallback(async () => {
    setSyncing(true);
    try {
      await syncFromCloud();
      await qc.invalidateQueries();
      setLastSync(getLastSync());
    } finally {
      setSyncing(false);
    }
  }, [qc]);

  const { data: snapshot } = useQuery({ queryKey: ['/api/snapshot'], queryFn: () => apiRequest('GET', '/api/snapshot').then(r => r.json()) });
  const { data: properties = [] } = useQuery({ queryKey: ['/api/properties'], queryFn: () => apiRequest('GET', '/api/properties').then(r => r.json()) });
  const { data: stocks = [] } = useQuery({ queryKey: ['/api/stocks'], queryFn: () => apiRequest('GET', '/api/stocks').then(r => r.json()) });
  const { data: cryptos = [] } = useQuery({ queryKey: ['/api/crypto'], queryFn: () => apiRequest('GET', '/api/crypto').then(r => r.json()) });
  const { data: expenses = [] } = useQuery({ queryKey: ['/api/expenses'], queryFn: () => apiRequest('GET', '/api/expenses').then(r => r.json()) });

  const updateSnap = useMutation({
    mutationFn: (data: any) => apiRequest('PUT', '/api/snapshot', data).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/snapshot'] })
  });

  // Always produce a fully-populated snap with safe numeric defaults.
  // safeNum() converts undefined / null / NaN / "" → 0 so no arithmetic
  // can ever produce NaN regardless of what the API or localStorage returns.
  const snap = {
    ppor:             safeNum(snapshot?.ppor)             || 1510000,
    cash:             safeNum(snapshot?.cash)             || 220000,
    super_balance:    safeNum(snapshot?.super_balance)    || 85000,
    stocks:           safeNum(snapshot?.stocks),
    crypto:           safeNum(snapshot?.crypto),
    cars:             safeNum(snapshot?.cars)             || 65000,
    iran_property:    safeNum(snapshot?.iran_property)    || 150000,
    mortgage:         safeNum(snapshot?.mortgage)         || 1200000,
    other_debts:      safeNum(snapshot?.other_debts)      || 19000,
    monthly_income:   safeNum(snapshot?.monthly_income)   || 22000,
    monthly_expenses: safeNum(snapshot?.monthly_expenses) || 14540,
  };

  const totalAssets      = snap.ppor + snap.cash + snap.super_balance + snap.stocks + snap.crypto + snap.cars + snap.iran_property;
  const totalLiabilities = snap.mortgage + snap.other_debts;
  const netWorth         = totalAssets - totalLiabilities;
  const surplus          = snap.monthly_income - snap.monthly_expenses;
  const savingsRate      = calcSavingsRate(snap.monthly_income, snap.monthly_expenses);
  const propertyEquity   = snap.ppor - snap.mortgage;

  const stocksTotal = stocks.reduce((s: number, st: any) => s + safeNum(st.current_holding) * safeNum(st.current_price), 0);
  const cryptoTotal = cryptos.reduce((s: number, c: any) => s + safeNum(c.current_holding) * safeNum(c.current_price), 0);
  const totalInvestments = stocksTotal + cryptoTotal;

  // 10-year projection
  const projection = useMemo(() => projectNetWorth({
    snapshot: snap,
    properties,
    stocks,
    cryptos,
    years: 10,
  }), [snap, properties, stocks, cryptos]);

  const year10NW = projection[9]?.endNetWorth || netWorth;
  const passiveIncome = projection[0]?.passiveIncome || 0;

  // Asset allocation data
  const assetData = [
    { name: 'PPOR', value: snap.ppor },
    { name: 'Cash', value: snap.cash },
    { name: 'Super', value: snap.super_balance },
    { name: 'Cars', value: snap.cars },
    { name: 'Iran Property', value: snap.iran_property },
    { name: 'Stocks', value: stocksTotal + snap.stocks },
    { name: 'Crypto', value: cryptoTotal + snap.crypto },
  ].filter(d => d.value > 0);

  // Monthly cash flow data
  const cashFlowData = [
    { month: 'Income', value: snap.monthly_income, fill: 'hsl(142,60%,45%)' },
    { month: 'Expenses', value: snap.monthly_expenses, fill: 'hsl(0,72%,51%)' },
    { month: 'Surplus', value: surplus, fill: 'hsl(43,85%,55%)' },
  ];

  // Net worth growth chart data
  const nwGrowthData = projection.map(p => ({
    year: p.year.toString(),
    netWorth: p.endNetWorth,
    assets: p.totalAssets,
    liabilities: p.totalLiabilities,
  }));

  // Expense categories chart
  const expensesByCategory = expenses.reduce((acc: any, e: any) => {
    acc[e.category] = (acc[e.category] || 0) + e.amount;
    return acc;
  }, {});
  const expensePieData = Object.entries(expensesByCategory).slice(0, 7).map(([name, value]) => ({ name, value: value as number }));

  const handleSaveSnap = async () => {
    if (snapDraft) {
      await updateSnap.mutateAsync(snapDraft);
      setEditSnap(false);
      setSnapDraft(null);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* ─── Hero Section ──────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl" style={{ border: '1px solid rgba(196,165,90,0.2)' }}>
        <div className="absolute inset-0">
          <img src={familyImg} alt="Shahrokh Family" className="w-full h-full object-cover object-top opacity-15" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, hsl(224,40%,10%) 0%, hsl(224,20%,12%) 100%)' }} />
        </div>
        <div className="relative z-10 p-6 lg:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <img src={familyImg} alt="" className="w-16 h-16 rounded-xl object-cover object-top shrink-0 ring-2 ring-primary/40" />
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] mb-1" style={{ color: 'hsl(43,85%,65%)' }}>
              Welcome Back
            </p>
            <h1 className="text-xl font-bold text-foreground">Fara & Roham</h1>
            <p className="text-muted-foreground text-sm">Family Net Worth Command Center</p>
            <p className="text-xs mt-1" style={{ color: 'hsl(43,85%,55%)' }}>Building Wealth for Yara & Jana</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-1">Estimated Net Worth</p>
            <div className="text-2xl font-bold num-display" style={{ color: 'hsl(43,85%,65%)' }}>
              {formatCurrency(netWorth)}
            </div>
            <p className="text-xs text-muted-foreground">Brisbane, QLD · AUD</p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSyncFromCloud}
              disabled={syncing}
              className="mt-2 h-7 text-xs gap-1.5"
              style={{ borderColor: 'rgba(196,165,90,0.3)', color: 'hsl(43,85%,65%)' }}
            >
              <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync From Cloud'}
            </Button>
            {lastSync && (
              <p className="text-xs text-muted-foreground mt-1">
                Last synced: {new Date(lastSync).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ─── KPI Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 gap-3">
        <KpiCard
          label="Net Worth"
          value={formatCurrency(netWorth, true)}
          subValue={`${savingsRate.toFixed(0)}% savings rate`}
          trend={1}
          icon={<DollarSign />}
        />
        <KpiCard
          label="Monthly Surplus"
          value={formatCurrency(surplus)}
          subValue={`${formatCurrency(surplus * 12)} / year`}
          trend={1}
          icon={<TrendingUp />}
        />
        <KpiCard
          label="Total Investments"
          value={formatCurrency(totalInvestments, true)}
          subValue="Stocks + Crypto"
          trend={totalInvestments > 0 ? 1 : 0}
          icon={<Layers />}
          accent="hsl(188,60%,48%)"
        />
        <KpiCard
          label="Property Equity"
          value={formatCurrency(propertyEquity, true)}
          subValue={`${(snap.ppor > 0 ? (propertyEquity / snap.ppor) * 100 : 0).toFixed(0)}% LVR met`}
          trend={1}
          icon={<Home />}
          accent="hsl(142,60%,45%)"
        />
        <KpiCard
          label="Debt Balance"
          value={formatCurrency(totalLiabilities, true)}
          subValue="Mortgage + Debts"
          trend={-1}
          icon={<CreditCard />}
          accent="hsl(0,72%,51%)"
        />
        <KpiCard
          label="10-Year Forecast"
          value={formatCurrency(year10NW, true)}
          subValue={`From ${formatCurrency(netWorth, true)} today`}
          trend={1}
          icon={<Calendar />}
          accent="hsl(270,60%,60%)"
        />
        <KpiCard
          label="Passive Income"
          value={formatCurrency(passiveIncome, true)}
          subValue="Rental + Dividends"
          trend={passiveIncome > 0 ? 1 : 0}
          icon={<PiggyBank />}
          accent="hsl(43,85%,55%)"
        />
        <KpiCard
          label="Savings Rate"
          value={`${savingsRate.toFixed(1)}%`}
          subValue={`${formatCurrency(surplus * 12)} saved / yr`}
          trend={savingsRate > 20 ? 1 : savingsRate > 0 ? 0 : -1}
          icon={<Target />}
          accent="hsl(20,80%,55%)"
        />
      </div>

      {/* ─── Financial Snapshot Edit ────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-foreground">Financial Snapshot</h2>
          <div className="flex gap-2">
            {editSnap ? (
              <>
                <SaveButton label="Save Dashboard Snapshot" onSave={handleSaveSnap} />
                <Button size="sm" variant="ghost" onClick={() => { setEditSnap(false); setSnapDraft(null); }}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => { setEditSnap(true); setSnapDraft({ ...snap }); }}>
                <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { label: 'PPOR', key: 'ppor', group: 'asset' },
            { label: 'Cash', key: 'cash', group: 'asset' },
            { label: 'Super', key: 'super_balance', group: 'asset' },
            { label: 'Cars', key: 'cars', group: 'asset' },
            { label: 'Iran Property', key: 'iran_property', group: 'asset' },
            { label: 'Mortgage', key: 'mortgage', group: 'liability' },
            { label: 'Other Debts', key: 'other_debts', group: 'liability' },
            { label: 'Monthly Income', key: 'monthly_income', group: 'income' },
            { label: 'Monthly Expenses', key: 'monthly_expenses', group: 'expense' },
          ].map(({ label, key, group }) => (
            <div key={key} className="rounded-lg p-3 bg-secondary/40">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              {editSnap && snapDraft ? (
                <Input
                  type="number"
                  value={snapDraft[key]}
                  onChange={e => setSnapDraft({ ...snapDraft, [key]: parseFloat(e.target.value) || 0 })}
                  className="h-7 text-sm num-display font-semibold"
                />
              ) : (
                <p className={`text-sm font-bold num-display ${
                  group === 'liability' || group === 'expense' ? 'text-red-400' :
                  group === 'income' ? 'text-emerald-400' :
                  'text-foreground'
                }`}>
                  {formatCurrency((snap as any)[key] || 0)}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-border">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Total Assets</p>
            <p className="text-sm font-bold text-emerald-400 num-display">{formatCurrency(totalAssets)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Total Liabilities</p>
            <p className="text-sm font-bold text-red-400 num-display">{formatCurrency(totalLiabilities)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Net Worth</p>
            <p className="text-sm font-bold num-display" style={{ color: 'hsl(43,85%,65%)' }}>{formatCurrency(netWorth)}</p>
          </div>
        </div>
      </div>

      {/* ─── Charts Row ────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Net Worth Growth */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold mb-4">10-Year Net Worth Growth</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={nwGrowthData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(43,85%,55%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(43,85%,55%)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'hsl(220,10%,55%)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="netWorth" stroke="hsl(43,85%,55%)" fill="url(#nwGrad)" strokeWidth={2} name="Net Worth" />
              <Area type="monotone" dataKey="assets" stroke="hsl(142,60%,45%)" fill="none" strokeWidth={1.5} strokeDasharray="5 3" name="Assets" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Asset Allocation */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold mb-4">Asset Allocation</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={220}>
              <PieChart>
                <Pie data={assetData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  paddingAngle={3} dataKey="value">
                  {assetData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v, true)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {assetData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-muted-foreground">{d.name}</span>
                  </div>
                  <span className="font-semibold num-display">{((d.value / totalAssets) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Cash Flow + Expenses ─────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Monthly Cash Flow */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold mb-4">Monthly Cash Flow</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={cashFlowData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(220,10%,55%)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Amount" radius={[4, 4, 0, 0]}>
                {cashFlowData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border text-center">
            <div>
              <p className="text-xs text-muted-foreground">Income</p>
              <p className="text-xs font-bold text-emerald-400 num-display">{formatCurrency(snap.monthly_income)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expenses</p>
              <p className="text-xs font-bold text-red-400 num-display">{formatCurrency(snap.monthly_expenses)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Surplus</p>
              <p className="text-xs font-bold num-display" style={{ color: 'hsl(43,85%,65%)' }}>{formatCurrency(surplus)}</p>
            </div>
          </div>
        </div>

        {/* Expense Breakdown */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold mb-4">Expense Breakdown</h3>
          {expensePieData.length > 0 ? (
            <div className="flex items-center gap-3">
              <ResponsiveContainer width="45%" height={200}>
                <PieChart>
                  <Pie data={expensePieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                    paddingAngle={3} dataKey="value">
                    {expensePieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5 text-xs">
                {expensePieData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground truncate max-w-[80px]">{d.name}</span>
                    </div>
                    <span className="font-semibold num-display">{formatCurrency(d.value, true)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
              <TrendingUp className="w-8 h-8 opacity-30" />
              <p>No expenses tracked yet</p>
              <p className="text-xs">Add expenses in the Expense Tracker</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── 10-Year Net Worth Table ───────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold">Year-by-Year Net Worth Projection</h3>
          <span className="text-xs text-muted-foreground">10-Year Forecast</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {['Year', 'Start NW', 'Income', 'Expenses', 'Prop. Value', 'Prop. Loans', 'Equity', 'Stocks', 'Crypto', 'Cash', 'Total Assets', 'Liabilities', 'End NW', 'Growth', 'Passive Income', 'Mthly CF'].map(h => (
                  <th key={h} className="text-left py-2 pr-4 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projection.map((p, i) => (
                <tr key={p.year} className={`border-b border-border/50 transition-colors hover:bg-secondary/30 ${i === 9 ? 'font-bold' : ''}`}>
                  <td className="py-2 pr-4 font-semibold text-primary">{p.year}</td>
                  <td className="py-2 pr-4 num-display">{formatCurrency(p.startNetWorth, true)}</td>
                  <td className="py-2 pr-4 num-display text-emerald-400">{formatCurrency(p.income, true)}</td>
                  <td className="py-2 pr-4 num-display text-red-400">{formatCurrency(p.expenses, true)}</td>
                  <td className="py-2 pr-4 num-display">{formatCurrency(p.propertyValue, true)}</td>
                  <td className="py-2 pr-4 num-display text-red-400">{formatCurrency(p.propertyLoans, true)}</td>
                  <td className="py-2 pr-4 num-display text-emerald-400">{formatCurrency(p.propertyEquity, true)}</td>
                  <td className="py-2 pr-4 num-display">{formatCurrency(p.stockValue, true)}</td>
                  <td className="py-2 pr-4 num-display">{formatCurrency(p.cryptoValue, true)}</td>
                  <td className="py-2 pr-4 num-display">{formatCurrency(p.cash, true)}</td>
                  <td className="py-2 pr-4 num-display text-emerald-400">{formatCurrency(p.totalAssets, true)}</td>
                  <td className="py-2 pr-4 num-display text-red-400">{formatCurrency(p.totalLiabilities, true)}</td>
                  <td className="py-2 pr-4 num-display font-bold" style={{ color: 'hsl(43,85%,65%)' }}>{formatCurrency(p.endNetWorth, true)}</td>
                  <td className={`py-2 pr-4 num-display ${p.growth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    +{formatCurrency(p.growth, true)}
                  </td>
                  <td className="py-2 pr-4 num-display">{formatCurrency(p.passiveIncome, true)}</td>
                  <td className="py-2 pr-4 num-display">{formatCurrency(p.monthlyCashFlow, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

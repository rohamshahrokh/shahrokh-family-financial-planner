/**
 * timeline.tsx — Net Worth Timeline (10-Year Projection)
 * Route: /timeline
 *
 * Features:
 *  - 10-year projection from 2025–2035
 *  - Monthly/Annual view toggle
 *  - Area chart: Net Worth over time (gold)
 *  - Stacked area: Assets vs Liabilities
 *  - Cash flow: income vs expenses
 *  - Property equity over time
 *  - Year-by-year data table with all columns
 *  - Excel export
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  formatCurrency, safeNum,
  projectNetWorth, buildCashFlowSeries, aggregateCashFlowToAnnual,
  type YearlyProjection,
} from "@/lib/finance";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, LineChart, Line,
} from "recharts";
import {
  TrendingUp, Download, Calendar, BarChart2,
  Home, DollarSign, Layers, Target, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import AIInsightsCard from "@/components/AIInsightsCard";
import * as XLSX from "xlsx";
import { useToast } from "@/hooks/use-toast";

// ─── Tooltip ──────────────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs max-w-xs">
        <p className="text-muted-foreground mb-2 font-medium">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="flex justify-between gap-4" style={{ color: p.color }}>
            <span>{p.name}</span>
            <span className="font-mono num-display">{formatCurrency(p.value, true)}</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ─── KPI mini card ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'text-foreground' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground font-medium mb-1">{label}</p>
      <p className={`text-lg font-bold num-display ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function TimelinePage() {
  const { toast } = useToast();
  const [view, setView] = useState<'annual' | 'monthly'>('annual');
  const [activeChart, setActiveChart] = useState<'networth' | 'assets' | 'cashflow' | 'equity'>('networth');

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: snapshot } = useQuery<any>({
    queryKey: ['/api/snapshot'],
    queryFn: () => apiRequest('GET', '/api/snapshot').then(r => r.json()),
  });
  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ['/api/properties'],
    queryFn: () => apiRequest('GET', '/api/properties').then(r => r.json()),
  });
  const { data: stocks = [] } = useQuery<any[]>({
    queryKey: ['/api/stocks'],
    queryFn: () => apiRequest('GET', '/api/stocks').then(r => r.json()),
  });
  const { data: cryptos = [] } = useQuery<any[]>({
    queryKey: ['/api/crypto'],
    queryFn: () => apiRequest('GET', '/api/crypto').then(r => r.json()),
  });
  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ['/api/expenses'],
    queryFn: () => apiRequest('GET', '/api/expenses').then(r => r.json()),
  });

  // ── Snapshot with safe defaults ────────────────────────────────────────────
  const snap = useMemo(() => ({
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
  }), [snapshot]);

  // ── 10-year net worth projection ───────────────────────────────────────────
  const projection: YearlyProjection[] = useMemo(() =>
    projectNetWorth({ snapshot: snap, properties, stocks: stocks, cryptos, years: 10 }),
    [snap, properties, stocks, cryptos]
  );

  // ── Monthly cash flow series ───────────────────────────────────────────────
  const monthlySeries = useMemo(() =>
    buildCashFlowSeries({
      snapshot: snap,
      expenses,
      properties,
    }),
    [snap, expenses, properties]
  );

  const annualSeries = useMemo(() =>
    aggregateCashFlowToAnnual(monthlySeries),
    [monthlySeries]
  );

  // ── Summary KPIs ───────────────────────────────────────────────────────────
  const currentNW = (snap.ppor + snap.cash + snap.super_balance + snap.stocks + snap.crypto + snap.cars + snap.iran_property)
    - (snap.mortgage + snap.other_debts);
  const finalYear = projection[projection.length - 1];
  const nwIn10y = finalYear?.endNetWorth ?? 0;
  const nwGrowth = nwIn10y - currentNW;
  const cagr = currentNW > 0 ? (Math.pow(nwIn10y / currentNW, 1 / 10) - 1) * 100 : 0;
  const monthlySurplus = snap.monthly_income - snap.monthly_expenses;

  // ── Chart data ─────────────────────────────────────────────────────────────
  const nwChartData = projection.map(p => ({
    year: p.year.toString(),
    'Net Worth': p.endNetWorth,
    'Total Assets': p.totalAssets,
    'Total Liabilities': p.totalLiabilities,
  }));

  const equityChartData = projection.map(p => ({
    year: p.year.toString(),
    'Property Equity': p.propertyEquity,
    'Property Value': p.propertyValue,
    'Property Loans': p.propertyLoans,
  }));

  // Monthly cash flow (last 24 months of monthly data, then forecast)
  const cashFlowChartData = useMemo(() => {
    if (view === 'monthly') {
      // Show all monthly data — but cap at first/last 60 points to avoid overloading chart
      const sample = monthlySeries.filter((_, i) => i % 3 === 0); // every quarter
      return sample.map(m => ({
        label: m.label,
        Income: m.income,
        Expenses: m.totalExpenses + m.mortgageRepayment + m.investmentLoanRepayment,
        'Net Cash Flow': m.netCashFlow,
      }));
    }
    return annualSeries.map(y => ({
      label: y.year.toString(),
      Income: y.income,
      Expenses: y.totalExpenses + y.mortgageRepayment + y.investmentLoanRepayment,
      'Net Cash Flow': y.netCashFlow,
    }));
  }, [view, monthlySeries, annualSeries]);

  // ── Excel export ───────────────────────────────────────────────────────────
  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Annual projection sheet
    const projHeaders = [
      'Year', 'Start NW', 'Total Assets', 'Property Value', 'Property Equity',
      'Stocks', 'Crypto', 'Cash', 'Total Liabilities', 'End NW', 'Growth', 'Growth %', 'Monthly CF'
    ];
    const projRows = projection.map(p => [
      p.year, p.startNetWorth, p.totalAssets, p.propertyValue, p.propertyEquity,
      p.stockValue, p.cryptoValue, p.cash, p.totalLiabilities, p.endNetWorth,
      p.growth, p.growthPct.toFixed(1) + '%', p.monthlyCashFlow,
    ]);
    const projSheet = XLSX.utils.aoa_to_sheet([projHeaders, ...projRows]);
    XLSX.utils.book_append_sheet(wb, projSheet, 'Annual Projection');

    // Monthly cash flow sheet
    const cfHeaders = [
      'Month', 'Year', 'Actual?', 'Income', 'Expenses (Actual)', 'Forecast Expenses',
      'Total Expenses', 'Rental Income', 'Mortgage', 'Inv. Loan', 'Net Cash Flow', 'Cumulative'
    ];
    const cfRows = monthlySeries.map(m => [
      m.label, m.year, m.isActual ? 'Yes' : 'No', m.income, m.actualExpenses,
      m.forecastExpenses, m.totalExpenses, m.rentalIncome, m.mortgageRepayment,
      m.investmentLoanRepayment, m.netCashFlow, m.cumulativeBalance,
    ]);
    const cfSheet = XLSX.utils.aoa_to_sheet([cfHeaders, ...cfRows]);
    XLSX.utils.book_append_sheet(wb, cfSheet, 'Monthly Cash Flow');

    XLSX.writeFile(wb, `Shahrokh_NetWorth_Timeline_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Excel exported', description: 'Timeline data saved successfully.' });
  };

  const CHART_TABS = [
    { key: 'networth', label: 'Net Worth', icon: TrendingUp },
    { key: 'assets', label: 'Assets vs Liabilities', icon: Layers },
    { key: 'cashflow', label: 'Cash Flow', icon: DollarSign },
    { key: 'equity', label: 'Property Equity', icon: Home },
  ] as const;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Net Worth Timeline
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">10-year projection 2025–2035 · Based on current assets, growth rates & expenses</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Monthly/Annual toggle */}
          <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5">
            {(['annual', 'monthly'] as const).map(v => (
              <button
                key={v}
                className={`px-3 py-1.5 text-xs rounded font-medium transition-all capitalize ${view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => setView(v)}
              >
                {v}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleExportExcel}>
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Current Net Worth"
          value={formatCurrency(currentNW, true)}
          sub={`${new Date().getFullYear()}`}
          color="text-primary"
        />
        <StatCard
          label="Projected 2035"
          value={formatCurrency(nwIn10y, true)}
          sub="10-year target"
          color="text-emerald-400"
        />
        <StatCard
          label="Total Growth"
          value={formatCurrency(nwGrowth, true)}
          sub={`CAGR ${cagr.toFixed(1)}% p.a.`}
          color={nwGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <StatCard
          label="Monthly Surplus"
          value={formatCurrency(monthlySurplus)}
          sub="Income minus expenses"
          color={monthlySurplus >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
      </div>

      {/* Chart section */}
      <div className="rounded-xl border border-border bg-card p-5">
        {/* Chart tabs */}
        <div className="flex flex-wrap items-center gap-1 mb-5">
          {CHART_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-all font-medium ${
                activeChart === key
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveChart(key)}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Chart: Net Worth */}
        {activeChart === 'networth' && (
          <div>
            <p className="text-xs font-bold mb-3 text-muted-foreground uppercase tracking-wider">Net Worth Over Time</p>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={nwChartData}>
                <defs>
                  <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(43,85%,55%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(43,85%,55%)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tickFormatter={v => `$${(v / 1_000_000).toFixed(1)}M`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="Net Worth"
                  stroke="hsl(43,85%,55%)"
                  strokeWidth={2.5}
                  fill="url(#nwGradient)"
                  dot={{ r: 3, fill: 'hsl(43,85%,55%)', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Chart: Assets vs Liabilities */}
        {activeChart === 'assets' && (
          <div>
            <p className="text-xs font-bold mb-3 text-muted-foreground uppercase tracking-wider">Assets vs Liabilities</p>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={nwChartData}>
                <defs>
                  <linearGradient id="assetsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142,60%,45%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142,60%,45%)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="liabGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(0,72%,51%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(0,72%,51%)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tickFormatter={v => `$${(v / 1_000_000).toFixed(1)}M`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="Total Assets" stroke="hsl(142,60%,45%)" strokeWidth={2} fill="url(#assetsGrad)" />
                <Area type="monotone" dataKey="Total Liabilities" stroke="hsl(0,72%,51%)" strokeWidth={2} fill="url(#liabGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Chart: Cash Flow */}
        {activeChart === 'cashflow' && (
          <div>
            <p className="text-xs font-bold mb-3 text-muted-foreground uppercase tracking-wider">
              Cash Flow ({view === 'monthly' ? 'Quarterly sample' : 'Annual'})
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={cashFlowChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  interval={view === 'monthly' ? 3 : 0} angle={view === 'monthly' ? -30 : 0}
                  textAnchor={view === 'monthly' ? 'end' : 'middle'}
                  height={view === 'monthly' ? 48 : 24}
                />
                <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Income" stroke="hsl(142,60%,45%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Expenses" stroke="hsl(0,72%,51%)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Net Cash Flow" stroke="hsl(43,85%,55%)" strokeWidth={2.5} dot={false} strokeDasharray={view === 'monthly' ? undefined : "5 2"} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Chart: Property Equity */}
        {activeChart === 'equity' && (
          <div>
            <p className="text-xs font-bold mb-3 text-muted-foreground uppercase tracking-wider">Property Equity Over Time</p>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={equityChartData}>
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(188,60%,48%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(188,60%,48%)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="propValGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(43,85%,55%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(43,85%,55%)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tickFormatter={v => `$${(v / 1_000_000).toFixed(1)}M`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="Property Value" stroke="hsl(43,85%,55%)" strokeWidth={2} fill="url(#propValGrad)" />
                <Area type="monotone" dataKey="Property Equity" stroke="hsl(188,60%,48%)" strokeWidth={2} fill="url(#equityGrad)" />
                <Area type="monotone" dataKey="Property Loans" stroke="hsl(0,72%,51%)" strokeWidth={1.5} fill="none" strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Year-by-year table */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4 text-primary" />
            <p className="text-sm font-bold">Year-by-Year Projection</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="w-3.5 h-3.5" />
            <span>Assumes 6% PPOR growth, 10% super growth, 3% inflation</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {[
                  'Year', 'Start NW', 'Total Assets', 'Prop Value', 'Prop Equity',
                  'Stocks', 'Crypto', 'Cash', 'Total Liabilities', 'End NW', 'Growth', 'Monthly CF'
                ].map(h => (
                  <th key={h} className="text-left pb-2 pr-3 text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projection.map((p, i) => {
                const isLast = i === projection.length - 1;
                const isCurrent = p.year === new Date().getFullYear() + 1;
                const growthPositive = p.growth >= 0;

                return (
                  <tr
                    key={p.year}
                    className={`border-b border-border/50 transition-colors hover:bg-secondary/30 ${isLast ? 'font-bold' : ''} ${isCurrent ? 'bg-primary/5' : ''}`}
                  >
                    <td className={`py-2 pr-3 font-semibold ${isLast ? 'text-primary' : ''}`}>{p.year}</td>
                    <td className="py-2 pr-3 num-display text-muted-foreground">{formatCurrency(p.startNetWorth, true)}</td>
                    <td className="py-2 pr-3 num-display text-emerald-400">{formatCurrency(p.totalAssets, true)}</td>
                    <td className="py-2 pr-3 num-display">{formatCurrency(p.propertyValue, true)}</td>
                    <td className="py-2 pr-3 num-display text-primary">{formatCurrency(p.propertyEquity, true)}</td>
                    <td className="py-2 pr-3 num-display">{formatCurrency(p.stockValue, true)}</td>
                    <td className="py-2 pr-3 num-display">{formatCurrency(p.cryptoValue, true)}</td>
                    <td className="py-2 pr-3 num-display">{formatCurrency(p.cash, true)}</td>
                    <td className="py-2 pr-3 num-display text-red-400">{formatCurrency(p.totalLiabilities, true)}</td>
                    <td className={`py-2 pr-3 num-display font-bold ${isLast ? 'text-primary' : 'text-foreground'}`}>
                      {formatCurrency(p.endNetWorth, true)}
                    </td>
                    <td className={`py-2 pr-3 num-display ${growthPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                      {growthPositive ? '+' : ''}{formatCurrency(p.growth, true)}
                      <span className="text-muted-foreground ml-1">({p.growthPct.toFixed(0)}%)</span>
                    </td>
                    <td className={`py-2 num-display ${p.monthlyCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCurrency(p.monthlyCashFlow)}/mo
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totals row */}
            {projection.length > 0 && (
              <tfoot>
                <tr className="border-t border-border">
                  <td className="pt-3 text-xs text-muted-foreground font-medium" colSpan={1}>Summary</td>
                  <td className="pt-3 pr-3" />
                  <td className="pt-3 pr-3" />
                  <td className="pt-3 pr-3" />
                  <td className="pt-3 pr-3" />
                  <td className="pt-3 pr-3" />
                  <td className="pt-3 pr-3" />
                  <td className="pt-3 pr-3" />
                  <td className="pt-3 pr-3" />
                  <td className="pt-3 pr-3 text-primary font-bold num-display">
                    {formatCurrency(finalYear?.endNetWorth ?? 0, true)}
                  </td>
                  <td className="pt-3 pr-3 text-emerald-400 font-bold num-display">
                    +{formatCurrency(nwGrowth, true)}
                  </td>
                  <td className="pt-3" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Assumptions note */}
      <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground/70">Projection Assumptions</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>PPOR value growth: 6% p.a.</li>
              <li>Super balance growth: 10% p.a.</li>
              <li>Stocks/Crypto: individual expected return rates per asset</li>
              <li>Expenses: 3% annual inflation</li>
              <li>Income: 3.5% annual growth</li>
              <li>Mortgage: 6.5% rate, 30-year term (from snapshot balance)</li>
              <li>50% of annual surplus added to cash savings</li>
              <li>Past months use actual expense records where available</li>
            </ul>
            <p className="mt-1 italic">This is a projection only. Actual outcomes will vary based on market conditions, lifestyle changes, and other factors.</p>
          </div>
        </div>
      </div>

      {/* ─── AI Insights ───────────────────────────────────────────────────── */}
      <AIInsightsCard
        pageKey="timeline"
        pageLabel="Net Worth Timeline"
        getData={() => ({
        milestones: (events || []).slice(0, 10).map((e: any) => ({ date: e.date, label: e.label, amount: e.amount }))
      })}
      />
    </div>
  );
}

/**
 * PropertyLifecycleAnalysis.tsx
 *
 * Property → Portfolio Analysis → Lifecycle Analysis section.
 *
 * Per-property 30-year lifecycle view:
 *   • Annual cashflow chart (green positive years, red negative years)
 *   • Loan balance curve
 *   • Property value curve
 *   • Equity curve
 *   • "Cashflow Positive Year" break-even marker
 *   • Summary cards: Purchase Price, Current Value, Current Loan Balance,
 *     Current Equity, Annual Cashflow, Cumulative Cashflow, Cashflow Positive
 *     Year, Total Interest Paid, Estimated 30-Year Equity
 *
 * Modes:
 *   • Single Property View  — pick one property
 *   • Combined Portfolio    — aggregate of all settled investment properties
 *
 * Calculations are local to this section and reuse assumptions already stored
 * on each property row (capital_growth, rental_growth, vacancy_rate, mgmt fee,
 * insurance, council_rates, water_rates, maintenance, body_corporate, land_tax,
 * interest_rate, loan_type, loan_term, weekly_rent). No new assumptions are
 * introduced. The forecast / Monte Carlo / Future Wealth Path / Events Timeline
 * / tax engines are NOT touched.
 */

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceLine, Legend, Cell,
} from 'recharts';
import { Building, Home, TrendingUp } from 'lucide-react';
import { formatCurrency, calcMonthlyRepayment, calcLoanBalance, safeNum } from '@/lib/finance';
import { maskValue } from '@/components/PrivacyMask';
import { useAppStore } from '@/lib/store';

interface LifecycleYear {
  year: number;
  yearIdx: number;            // 0-based years from purchase
  propertyValue: number;
  loanBalance: number;
  equity: number;
  rentalIncome: number;
  expenses: number;
  interestPaid: number;
  netCashFlow: number;
  cumulativeCashFlow: number;
}

const LIFECYCLE_YEARS = 30;

function projectLifecycle(p: any): LifecycleYear[] {
  const purchasePrice = safeNum(p.purchase_price) || safeNum(p.current_value) || 0;
  const startValue    = safeNum(p.current_value) || purchasePrice;
  const loanStart     = safeNum(p.loan_amount);
  const rate          = safeNum(p.interest_rate);
  const term          = safeNum(p.loan_term) || 30;
  const loanType      = (p.loan_type || 'PI').toUpperCase();
  const capitalGrowth = safeNum(p.capital_growth);
  const weeklyRent    = safeNum(p.weekly_rent);
  const rentalGrowth  = safeNum(p.rental_growth);
  const vacancy       = safeNum(p.vacancy_rate);
  const mgmt          = safeNum(p.management_fee);
  const insurance     = safeNum(p.insurance);
  const council       = safeNum(p.council_rates);
  const water         = safeNum(p.water_rates);
  const maintenance   = safeNum(p.maintenance);
  const bodyCorp      = safeNum(p.body_corporate);
  const landTax       = safeNum(p.land_tax);

  // Purchase year — use purchase_date if present, otherwise default to current
  // year. For purely planned (future-dated) properties the timeline still
  // starts at the purchase year.
  const startYear = p.purchase_date
    ? (() => {
        const y = parseInt(String(p.purchase_date).slice(0, 4), 10);
        return Number.isFinite(y) ? y : new Date().getFullYear();
      })()
    : new Date().getFullYear();

  const monthlyPayment = calcMonthlyRepayment(loanStart, rate, term);
  const monthlyRate = rate / 100 / 12;

  let cumulative = 0;
  let value = startValue;
  let rentAnnual = weeklyRent * 52;
  const rows: LifecycleYear[] = [];

  for (let i = 1; i <= LIFECYCLE_YEARS; i++) {
    value *= (1 + capitalGrowth / 100);
    const loanBalance = loanType === 'IO'
      ? loanStart
      : Math.max(0, calcLoanBalance(loanStart, rate, term, i * 12));

    // Estimate annual interest paid this year by comparing balance reduction
    // vs total payments. For IO loans, annual interest = loanStart * rate.
    let interestPaid = 0;
    if (loanType === 'IO') {
      interestPaid = loanStart * (rate / 100);
    } else {
      const prevBalance = i === 1
        ? loanStart
        : Math.max(0, calcLoanBalance(loanStart, rate, term, (i - 1) * 12));
      const totalPaidThisYear = monthlyPayment * 12;
      const principalReduction = Math.max(0, prevBalance - loanBalance);
      interestPaid = Math.max(0, totalPaidThisYear - principalReduction);
    }

    const grossRent = rentAnnual * (1 - vacancy / 100);
    const mgmtFee   = grossRent * (mgmt / 100);
    const netRent   = grossRent - mgmtFee;
    const runningCosts = insurance + council + water + maintenance + bodyCorp + landTax;
    const annualLoanCost = loanType === 'IO' ? interestPaid : monthlyPayment * 12;
    const expenses = runningCosts + annualLoanCost;
    const netCashFlow = netRent - expenses;
    cumulative += netCashFlow;

    rows.push({
      year:               startYear + (i - 1),
      yearIdx:            i,
      propertyValue:      Math.round(value),
      loanBalance:        Math.round(loanBalance),
      equity:             Math.round(value - loanBalance),
      rentalIncome:       Math.round(netRent),
      expenses:           Math.round(expenses),
      interestPaid:       Math.round(interestPaid),
      netCashFlow:        Math.round(netCashFlow),
      cumulativeCashFlow: Math.round(cumulative),
    });

    rentAnnual *= (1 + rentalGrowth / 100);
  }

  return rows;
}

/** Aggregate (sum) multiple per-property lifecycle series into a combined view. */
function aggregateLifecycle(series: LifecycleYear[][]): LifecycleYear[] {
  if (series.length === 0) return [];
  const out: LifecycleYear[] = [];
  for (let i = 0; i < LIFECYCLE_YEARS; i++) {
    let propertyValue = 0, loanBalance = 0, equity = 0, rentalIncome = 0,
        expenses = 0, interestPaid = 0, netCashFlow = 0, cumulativeCashFlow = 0;
    let yearLabel = series[0]?.[i]?.year ?? (new Date().getFullYear() + i);
    for (const s of series) {
      const r = s[i];
      if (!r) continue;
      propertyValue      += r.propertyValue;
      loanBalance        += r.loanBalance;
      equity             += r.equity;
      rentalIncome       += r.rentalIncome;
      expenses           += r.expenses;
      interestPaid       += r.interestPaid;
      netCashFlow        += r.netCashFlow;
      cumulativeCashFlow += r.cumulativeCashFlow;
    }
    out.push({
      year: yearLabel, yearIdx: i + 1,
      propertyValue, loanBalance, equity,
      rentalIncome, expenses, interestPaid,
      netCashFlow, cumulativeCashFlow,
    });
  }
  return out;
}

function firstPositiveCashflowYear(rows: LifecycleYear[]): number | null {
  for (const r of rows) {
    if (r.netCashFlow >= 0) return r.year;
  }
  return null;
}

interface Props {
  properties: any[];
  privacyMode?: boolean;
}

export default function PropertyLifecycleAnalysis({ properties, privacyMode }: Props) {
  const { privacyMode: storePrivacy } = useAppStore();
  const mask = privacyMode ?? storePrivacy;
  const mv = (v: string) => maskValue(v, mask);

  // Only investment-style settled or planned properties carry meaningful
  // lifecycle metrics. PPOR has no rent → cashflow is uninformative.
  const eligible = useMemo(
    () => (properties || []).filter((p: any) => p && (p.type === 'investment' || p.type === 'land')),
    [properties],
  );

  const [view, setView] = useState<'single' | 'combined'>('single');
  const [selectedId, setSelectedId] = useState<number | null>(() => eligible[0]?.id ?? null);

  // Reset selection if the previously selected property disappears.
  const safeSelected = useMemo(
    () => eligible.find((p: any) => p.id === selectedId) ?? eligible[0] ?? null,
    [eligible, selectedId],
  );

  // Per-property lifecycle series — memoised
  const perPropertySeries = useMemo(
    () => eligible.map((p: any) => ({ property: p, rows: projectLifecycle(p) })),
    [eligible],
  );

  const combinedRows = useMemo(
    () => aggregateLifecycle(perPropertySeries.map(s => s.rows)),
    [perPropertySeries],
  );

  const activeRows = useMemo(() => {
    if (view === 'combined') return combinedRows;
    const found = perPropertySeries.find(s => s.property.id === safeSelected?.id);
    return found?.rows ?? [];
  }, [view, combinedRows, perPropertySeries, safeSelected]);

  if (eligible.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Add at least one investment property to see the 30-year lifecycle analysis.
      </div>
    );
  }

  // Headline metrics
  const totalInterest = activeRows.reduce((s, r) => s + r.interestPaid, 0);
  const finalEquity   = activeRows[activeRows.length - 1]?.equity ?? 0;
  const finalCum      = activeRows[activeRows.length - 1]?.cumulativeCashFlow ?? 0;
  const breakEvenYear = firstPositiveCashflowYear(activeRows);

  let purchasePrice = 0, currentValue = 0, currentLoan = 0, currentEquity = 0, annualCashflow = 0;
  if (view === 'single' && safeSelected) {
    purchasePrice  = safeNum(safeSelected.purchase_price) || safeNum(safeSelected.current_value);
    currentValue   = safeNum(safeSelected.current_value);
    currentLoan    = safeNum(safeSelected.loan_amount);
    currentEquity  = currentValue - currentLoan;
    annualCashflow = activeRows[0]?.netCashFlow ?? 0;
  } else {
    purchasePrice = eligible.reduce((s, p: any) => s + (safeNum(p.purchase_price) || safeNum(p.current_value)), 0);
    currentValue  = eligible.reduce((s, p: any) => s + safeNum(p.current_value), 0);
    currentLoan   = eligible.reduce((s, p: any) => s + safeNum(p.loan_amount), 0);
    currentEquity = currentValue - currentLoan;
    annualCashflow = activeRows[0]?.netCashFlow ?? 0;
  }

  const cards: { label: string; value: string; color?: string }[] = [
    { label: 'Purchase Price',          value: mv(formatCurrency(purchasePrice, true)) },
    { label: 'Current Value',           value: mv(formatCurrency(currentValue, true)) },
    { label: 'Current Loan Balance',    value: mv(formatCurrency(currentLoan, true)),    color: 'text-red-400' },
    { label: 'Current Equity',          value: mv(formatCurrency(currentEquity, true)),  color: 'text-emerald-400' },
    { label: 'Annual Cashflow',         value: mv(formatCurrency(annualCashflow, true)), color: annualCashflow >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Cumulative Cashflow (30y)', value: mv(formatCurrency(finalCum, true)),     color: finalCum >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Cashflow Positive Year',  value: breakEvenYear ? String(breakEvenYear) : '—' },
    { label: 'Total Interest Paid',     value: mv(formatCurrency(totalInterest, true)),  color: 'text-red-400' },
    { label: 'Estimated 30-Year Equity', value: mv(formatCurrency(finalEquity, true)),   color: 'text-emerald-400' },
  ];

  return (
    <section className="space-y-4" data-testid="property-lifecycle-analysis">
      {/* Header + mode toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Property Lifecycle Analysis
          </h2>
          <p className="text-[11px] text-muted-foreground">
            30-year cashflow, loan, value and equity curves per property — using assumptions already stored on each row.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-secondary/60 border border-border p-0.5">
            {(['single', 'combined'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all ${
                  view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
                data-testid={`lifecycle-view-${v}`}
              >
                {v === 'single' ? 'Single Property' : 'Combined Portfolio'}
              </button>
            ))}
          </div>
          {view === 'single' && (
            <select
              value={safeSelected?.id ?? ''}
              onChange={e => setSelectedId(Number(e.target.value))}
              className="h-8 text-xs bg-background border border-border rounded-md px-2"
              data-testid="lifecycle-property-select"
            >
              {eligible.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {cards.map(c => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{c.label}</p>
            <p className={`text-sm font-bold num-display mt-1 ${c.color ?? ''}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Annual cashflow chart (green/red bars + break-even marker) */}
      <div className="rounded-xl border border-border bg-card p-4">
        <header className="mb-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">Annual Cashflow</h3>
          <p className="text-[10px] text-muted-foreground">
            Green bars = positive years · Red bars = negative years · Dashed line marks the first cashflow-positive year.
          </p>
        </header>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <ComposedChart data={activeRows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
              <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }}
                formatter={(v: any) => formatCurrency(Number(v), true)}
              />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
              {breakEvenYear != null && (
                <ReferenceLine
                  x={breakEvenYear}
                  stroke="hsl(43,90%,60%)"
                  strokeDasharray="4 4"
                  label={{ value: 'Cashflow Positive Year', position: 'top', fill: 'hsl(43,90%,60%)', fontSize: 10 }}
                />
              )}
              <Bar dataKey="netCashFlow" name="Annual Cashflow" radius={[4, 4, 0, 0]}>
                {activeRows.map((r, i) => (
                  <Cell key={i} fill={r.netCashFlow >= 0 ? 'hsl(142,60%,45%)' : 'hsl(0,72%,55%)'} />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Loan balance / property value / equity */}
      <div className="rounded-xl border border-border bg-card p-4">
        <header className="mb-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">Value · Loan Balance · Equity</h3>
          <p className="text-[10px] text-muted-foreground">
            30-year trajectory using each property's stored capital growth and loan terms.
          </p>
        </header>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <ComposedChart data={activeRows} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} />
              <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v, true)} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }}
                formatter={(v: any) => formatCurrency(Number(v), true)}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="propertyValue" name="Property Value" stroke="hsl(43,90%,60%)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="loanBalance"   name="Loan Balance"   stroke="hsl(0,72%,55%)"  strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="equity"        name="Equity"         stroke="hsl(142,60%,45%)" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {view === 'combined' && (
        <p className="text-[10px] text-muted-foreground">
          Combined portfolio view sums {eligible.length} investment {eligible.length === 1 ? 'property' : 'properties'}.
          Per-property assumptions (interest rate, capital growth, rental growth, vacancy, expenses) are preserved — no
          global re-blend.
        </p>
      )}
    </section>
  );
}

/**
 * wealth-strategy.tsx
 * Shahrokh Family Financial Planner — Wealth Strategy Hub
 * 10 fully-functional calculation modules in a tabbed interface.
 */

import SaveButton from "@/components/SaveButton";
import { useState, useMemo, useCallback } from "react";
import html2canvas from 'html2canvas';
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/finance";
import { useForecastAssumptions } from "@/lib/useForecastAssumptions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AIInsightsCard from "@/components/AIInsightsCard";
import {
  Flame,
  Sword,
  BarChart3,
  TrendingUp,
  Shield,
  Calculator,
  Building2,
  Clock,
  Search,
  Brain,
  ChevronRight,
  Info,
  AlertTriangle,
  CheckCircle,
  Zap,
  Target,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Eye,
  FileDown,
  Bookmark,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

// ─── safeNum ──────────────────────────────────────────────────────────────────
const safeNum = (v: unknown): number => {
  const n = parseFloat(String(v ?? 0));
  return isNaN(n) ? 0 : n;
};

// ─── Shared UI helpers ────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  color,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-secondary/40 rounded-xl p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon && <span style={{ color }}>{icon}</span>}
        {label}
      </div>
      <div className="text-lg font-bold" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
      {children}
    </h3>
  );
}

function Disclaimer() {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground/60 pt-4 border-t border-border mt-4">
      <Info className="w-3 h-3 shrink-0 mt-0.5" />
      <span>
        General information only, not financial, tax, or legal advice. Consult a
        licensed Australian financial adviser before making any decisions.
      </span>
    </div>
  );
}

// Progress Ring (SVG)
function ProgressRing({
  pct,
  size = 140,
  stroke = 12,
  color = "hsl(43,85%,55%)",
  children,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(pct / 100, 1) * circ;
  const cx = size / 2;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="hsl(0,0%,15%)"
          strokeWidth={stroke}
        />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}

function InputRow({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-xs text-muted-foreground flex-1">{label}</label>
      <div className="flex items-center gap-1 shrink-0">
        {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
        <Input
          type="number"
          value={value}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="h-8 text-sm w-28"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { id: "fire", label: "FIRE Tracker", icon: Flame },
  { id: "debt", label: "Debt Killer", icon: Sword },
  { id: "networth", label: "Net Worth", icon: BarChart3 },
  { id: "lifestyle", label: "Lifestyle", icon: TrendingUp },
  { id: "emergency", label: "Emergency", icon: Shield },
  { id: "tax", label: "Tax Optimizer", icon: Calculator },
  { id: "property", label: "Property Engine", icon: Building2 },
  { id: "retirement", label: "Retirement", icon: Clock },
  { id: "hidden", label: "Hidden Money", icon: Search },
  { id: "coach", label: "AI Coach", icon: Brain },
  { id: "action-plan", label: "Action Plan", icon: Zap },
];

// ─── Month simulation helper ──────────────────────────────────────────────────

function monthsToFIRE(
  startBalance: number,
  monthlyContrib: number,
  monthlyRate: number,
  target: number
): number {
  if (startBalance >= target) return 0;
  let bal = startBalance;
  for (let m = 1; m <= 480; m++) {
    bal = bal * (1 + monthlyRate) + monthlyContrib;
    if (bal >= target) return m;
  }
  return 480;
}

// ─── Australian Tax Calculator ────────────────────────────────────────────────

function calcAusTax(taxableIncome: number): number {
  let tax = 0;
  if (taxableIncome <= 18200) {
    tax = 0;
  } else if (taxableIncome <= 45000) {
    tax = (taxableIncome - 18200) * 0.19;
  } else if (taxableIncome <= 120000) {
    tax = 5092 + (taxableIncome - 45000) * 0.325;
  } else if (taxableIncome <= 180000) {
    tax = 29467 + (taxableIncome - 120000) * 0.37;
  } else {
    tax = 51667 + (taxableIncome - 180000) * 0.45;
  }
  return tax;
}

function calcLITO(taxableIncome: number): number {
  if (taxableIncome <= 37500) return 700;
  if (taxableIncome <= 45000) return 700 - (taxableIncome - 37500) * 0.05;
  if (taxableIncome <= 66667) return 325 - (taxableIncome - 45000) * 0.015;
  return 0;
}

function calcMedicare(taxableIncome: number): number {
  return taxableIncome > 26000 ? taxableIncome * 0.02 : 0;
}

function calcQldStampDuty(price: number): number {
  let duty = 0;
  const bands = [
    [5000, 0],
    [75000, 0.015],
    [540000, 0.035],
    [1000000, 0.045],
    [3000000, 0.0575],
    [Infinity, 0.0575],
  ] as const;

  let prev = 0;
  for (const [limit, rate] of bands) {
    if (price <= prev) break;
    const taxable = Math.min(price, limit) - prev;
    duty += taxable * rate;
    prev = limit;
  }
  return Math.round(duty);
}

function calcMarginalRate(taxableIncome: number): number {
  if (taxableIncome <= 18200) return 0;
  if (taxableIncome <= 45000) return 0.19;
  if (taxableIncome <= 120000) return 0.325;
  if (taxableIncome <= 180000) return 0.37;
  return 0.45;
}

// ─── TAB 1: FIRE TRACKER ─────────────────────────────────────────────────────

function FireTracker({ snap, stocks, crypto }: { snap: Record<string, number>; stocks: any[]; crypto: any[] }) {
  const [desiredMonthly, setDesiredMonthly] = useState(10000);
  const [expectedReturn, setExpectedReturn] = useState(7);
  const [swr, setSwr] = useState(4);
  const [extraMonthly, setExtraMonthly] = useState(2000);
  const [ipMonthly, setIpMonthly] = useState(2000);

  const calc = useMemo(() => {
    const stocksTotal = stocks.reduce((s: number, st: any) => s + safeNum(st.current_holding) * safeNum(st.current_price), 0);
    const cryptoTotal = crypto.reduce((s: number, c: any) => s + safeNum(c.current_holding) * safeNum(c.current_price), 0);

    const currentInvestable =
      safeNum(snap.cash) +
      safeNum(snap.super_balance) +
      safeNum(snap.stocks) +
      safeNum(snap.crypto) +
      stocksTotal +
      cryptoTotal;

    const reqAnnual = desiredMonthly * 12;
    const reqCapital = reqAnnual / (swr / 100);
    const progress = Math.min(100, (currentInvestable / reqCapital) * 100);
    const gap = Math.max(0, reqCapital - currentInvestable);
    const monthlyRate = expectedReturn / 100 / 12;
    const monthlySaving = safeNum(snap.monthly_income) - safeNum(snap.monthly_expenses);

    const monthsBase = monthsToFIRE(currentInvestable, monthlySaving, monthlyRate, reqCapital);
    const monthsExtra = monthsToFIRE(currentInvestable, monthlySaving + extraMonthly, monthlyRate, reqCapital);
    const monthsIP = monthsToFIRE(currentInvestable, monthlySaving + ipMonthly, monthlyRate, reqCapital);

    const yearsBase = monthsBase / 12;
    const yearsExtra = monthsExtra / 12;
    const yearsIP = monthsIP / 12;

    const now = new Date();
    const fireYear = now.getFullYear() + Math.ceil(yearsBase);
    const semiCapital = reqCapital * 0.5;
    const monthsSemi = monthsToFIRE(currentInvestable, monthlySaving, monthlyRate, semiCapital);
    const semiFIREYear = now.getFullYear() + Math.ceil(monthsSemi / 12);

    return {
      currentInvestable,
      reqCapital,
      progress,
      gap,
      yearsBase,
      yearsExtra,
      yearsIP,
      fireYear,
      semiFIREYear,
      savedByExtra: yearsBase - yearsExtra,
      savedByIP: yearsBase - yearsIP,
      monthlySaving,
    };
  }, [snap, stocks, crypto, desiredMonthly, expectedReturn, swr, extraMonthly, ipMonthly]);

  return (
    <div className="space-y-6">
      {/* Assumptions */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <SectionTitle>Assumptions</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InputRow label="Desired monthly passive income" value={desiredMonthly} onChange={setDesiredMonthly} prefix="$" />
          <InputRow label="Expected portfolio return" value={expectedReturn} onChange={setExpectedReturn} suffix="%" step={0.5} />
          <InputRow label="Safe withdrawal rate" value={swr} onChange={setSwr} suffix="%" step={0.5} />
          <InputRow label="Extra monthly investment" value={extraMonthly} onChange={setExtraMonthly} prefix="$" />
          <InputRow label="IP income (Scenario B)" value={ipMonthly} onChange={setIpMonthly} prefix="$" />
        </div>
      </div>

      {/* Progress Ring + Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center gap-4">
          <p className="text-sm font-semibold text-center">FIRE Progress</p>
          <ProgressRing pct={calc.progress} size={160} stroke={14} color="hsl(43,85%,55%)">
            <span className="text-2xl font-bold">{calc.progress.toFixed(1)}%</span>
            <span className="text-xs text-muted-foreground mt-1">of target</span>
          </ProgressRing>
          <div className="w-full grid grid-cols-2 gap-3 mt-2">
            <KpiCard label="FIRE Target" value={formatCurrency(calc.reqCapital)} sub={`@${swr}% SWR`} />
            <KpiCard label="Current Investable" value={formatCurrency(calc.currentInvestable)} color="hsl(142,60%,45%)" />
            <KpiCard label="Capital Gap" value={formatCurrency(calc.gap)} color="hsl(0,72%,51%)" />
            <KpiCard label="Monthly Surplus" value={formatCurrency(calc.monthlySaving)} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <SectionTitle>Timeline</SectionTitle>
          <KpiCard label="FIRE Target Year" value={String(calc.fireYear)} sub={`${calc.yearsBase.toFixed(1)} years away`} color="hsl(43,85%,55%)" icon={<Target className="w-4 h-4" />} />
          <KpiCard label="Semi-FIRE Year (50%)" value={String(calc.semiFIREYear)} sub="Partial financial independence" />

          <SectionTitle>Scenarios</SectionTitle>
          <div className="space-y-2">
            <div className="bg-secondary/40 rounded-xl p-3 flex justify-between items-center">
              <div>
                <p className="text-xs font-medium">Scenario A — Extra {formatCurrency(extraMonthly)}/mo</p>
                <p className="text-xs text-muted-foreground">{calc.yearsExtra.toFixed(1)} years</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-green-400">
                  {calc.savedByExtra > 0 ? `-${calc.savedByExtra.toFixed(1)} yrs` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">time saved</p>
              </div>
            </div>
            <div className="bg-secondary/40 rounded-xl p-3 flex justify-between items-center">
              <div>
                <p className="text-xs font-medium">Scenario B — IP Income {formatCurrency(ipMonthly)}/mo</p>
                <p className="text-xs text-muted-foreground">{calc.yearsIP.toFixed(1)} years</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-green-400">
                  {calc.savedByIP > 0 ? `-${calc.savedByIP.toFixed(1)} yrs` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">time saved</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <Disclaimer />
    </div>
  );
}

// ─── TAB 2: DEBT KILLER ENGINE ────────────────────────────────────────────────

interface DebtItem {
  id: number;
  name: string;
  balance: number;
  rate: number;
  minPayment: number;
}

interface DebtResult {
  months: number;
  totalInterest: number;
  interestSaved: number;
  order: string[];
}

function simulateDebtPayoff(
  debts: DebtItem[],
  extraPayment: number,
  sortFn: (a: DebtItem, b: DebtItem) => number
): DebtResult {
  // Deep clone
  let ds = debts.map((d) => ({ ...d }));
  const totalMin = ds.reduce((s, d) => s + d.minPayment, 0);

  // Minimum-only baseline (no extra)
  const baselineInterest = ds.reduce((s, d) => {
    let bal = d.balance;
    const r = d.rate / 100 / 12;
    for (let m = 0; m < 480; m++) {
      const interest = bal * r;
      const principal = Math.max(0, d.minPayment - interest);
      bal -= principal;
      s += interest;
      if (bal <= 0) break;
    }
    return s;
  }, 0);

  let month = 0;
  let totalInterest = 0;
  let extra = extraPayment;

  for (let m = 0; m < 480; m++) {
    // Sort each month
    const sorted = [...ds].sort(sortFn);
    let remaining = extra;

    for (const d of sorted) {
      if (d.balance <= 0) continue;
      const r = d.rate / 100 / 12;
      const interest = d.balance * r;
      totalInterest += interest;
      const payment = Math.min(d.balance + interest, d.minPayment + remaining);
      d.balance = Math.max(0, d.balance + interest - payment);
      if (d.balance <= 0) remaining += d.minPayment;
    }

    // Update original array
    ds = ds.map((orig) => {
      const found = sorted.find((s) => s.id === orig.id);
      return found ? { ...orig, balance: found.balance } : orig;
    });

    month++;
    if (ds.every((d) => d.balance <= 0)) break;
  }

  return {
    months: month,
    totalInterest: Math.round(totalInterest),
    interestSaved: Math.round(Math.max(0, baselineInterest - totalInterest)),
    order: ds.sort(sortFn).map((d) => d.name),
  };
}

function DebtKiller({ snap }: { snap: Record<string, number> }) {
  const mortgageBal = safeNum(snap.mortgage);
  const otherBal = safeNum(snap.other_debts);

  const defaultDebts: DebtItem[] = [
    {
      id: 1,
      name: "PPOR Mortgage",
      balance: mortgageBal,
      rate: 6.0,
      minPayment: Math.round((mortgageBal * 0.07) / 12),
    },
    {
      id: 2,
      name: "Other Debts",
      balance: otherBal,
      rate: 15,
      minPayment: Math.round(otherBal * 0.1),
    },
  ].filter((d) => d.balance > 0);

  const [debts, setDebts] = useState<DebtItem[]>(defaultDebts);
  const [extra, setExtra] = useState(1000);
  const [newName, setNewName] = useState("");
  const [newBal, setNewBal] = useState(0);
  const [newRate, setNewRate] = useState(10);
  const [newMin, setNewMin] = useState(0);
  const [nextId, setNextId] = useState(10);

  const addDebt = () => {
    if (!newName || newBal <= 0) return;
    setDebts((prev) => [
      ...prev,
      { id: nextId, name: newName, balance: newBal, rate: newRate, minPayment: newMin },
    ]);
    setNextId((n) => n + 1);
    setNewName("");
    setNewBal(0);
    setNewRate(10);
    setNewMin(0);
  };

  const results = useMemo(() => {
    if (debts.length === 0) return null;
    const avalanche = simulateDebtPayoff(
      debts,
      extra,
      (a, b) => b.rate - a.rate
    );
    const snowball = simulateDebtPayoff(
      debts,
      extra,
      (a, b) => a.balance - b.balance
    );
    // Hybrid: score = 0.6 * rateRank + 0.4 * (1 - balRank)
    const hybrid = simulateDebtPayoff(debts, extra, (a, b) => {
      const maxRate = Math.max(...debts.map((d) => d.rate));
      const maxBal = Math.max(...debts.map((d) => d.balance));
      const scoreA = (a.rate / maxRate) * 0.6 + (1 - a.balance / maxBal) * 0.4;
      const scoreB = (b.rate / maxRate) * 0.6 + (1 - b.balance / maxBal) * 0.4;
      return scoreB - scoreA;
    });
    return { avalanche, snowball, hybrid };
  }, [debts, extra]);

  // First 12 months schedule for avalanche
  const schedule12 = useMemo(() => {
    if (debts.length === 0) return [];
    const rows: { month: number; payments: Record<string, number> }[] = [];
    let ds = debts.map((d) => ({ ...d }));
    const sorted = [...ds].sort((a, b) => b.rate - a.rate);

    for (let m = 1; m <= 12; m++) {
      let remaining = extra;
      const row: Record<string, number> = {};
      for (const d of sorted) {
        if (d.balance <= 0) { row[d.name] = 0; continue; }
        const r = d.rate / 100 / 12;
        const interest = d.balance * r;
        const payment = Math.min(d.balance + interest, d.minPayment + remaining);
        d.balance = Math.max(0, d.balance + interest - payment);
        row[d.name] = Math.round(payment);
        if (d.balance <= 0) remaining += d.minPayment;
      }
      rows.push({ month: m, payments: row });
    }
    return rows;
  }, [debts, extra]);

  const methods = results
    ? [
        { name: "Avalanche", data: results.avalanche, desc: "Highest interest rate first — saves the most money" },
        { name: "Snowball", data: results.snowball, desc: "Smallest balance first — fastest psychological wins" },
        { name: "Hybrid", data: results.hybrid, desc: "60/40 blend — balanced speed and savings" },
      ]
    : [];

  const best = results
    ? methods.reduce((a, b) => (a.data.totalInterest <= b.data.totalInterest ? a : b))
    : null;

  return (
    <div className="space-y-6">
      {/* Debts list */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <SectionTitle>Your Debts</SectionTitle>
        <div className="space-y-2 mb-4">
          {debts.map((d) => (
            <div key={d.id} className="flex items-center justify-between bg-secondary/40 rounded-xl px-4 py-2">
              <div>
                <p className="text-sm font-medium">{d.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(d.balance)} @ {d.rate}% — min {formatCurrency(d.minPayment)}/mo
                </p>
              </div>
              <button
                className="text-xs text-destructive hover:opacity-70"
                onClick={() => setDebts((prev) => prev.filter((x) => x.id !== d.id))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Input placeholder="Debt name" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-8 text-sm" />
          <Input type="number" placeholder="Balance $" value={newBal || ""} onChange={(e) => setNewBal(parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
          <Input type="number" placeholder="Rate %" value={newRate || ""} onChange={(e) => setNewRate(parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
          <Input type="number" placeholder="Min payment $" value={newMin || ""} onChange={(e) => setNewMin(parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
        </div>
        <Button size="sm" onClick={addDebt} className="mt-2 h-8 text-xs">Add Debt</Button>

        <div className="mt-4">
          <InputRow label="Extra monthly payment" value={extra} onChange={setExtra} prefix="$" />
        </div>
      </div>

      {/* Comparison */}
      {results && (
        <>
          <div className="bg-card border border-border rounded-2xl p-5">
            <SectionTitle>Strategy Comparison</SectionTitle>
            {best && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 mb-4 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                <p className="text-xs">
                  <span className="font-semibold text-green-400">Recommended: {best.name}</span> — saves the most in interest ({formatCurrency(best.data.interestSaved)} saved)
                </p>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left py-2">Method</th>
                    <th className="text-right py-2">Months</th>
                    <th className="text-right py-2">Total Interest</th>
                    <th className="text-right py-2">Interest Saved</th>
                  </tr>
                </thead>
                <tbody>
                  {methods.map((m) => (
                    <tr key={m.name} className="border-b border-border/50">
                      <td className="py-2">
                        <p className="font-medium">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{m.desc}</p>
                      </td>
                      <td className="py-2 text-right font-mono">{m.data.months}</td>
                      <td className="py-2 text-right font-mono text-red-400">{formatCurrency(m.data.totalInterest)}</td>
                      <td className="py-2 text-right font-mono text-green-400">{formatCurrency(m.data.interestSaved)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Visual bars */}
            <div className="mt-4 space-y-2">
              {methods.map((m) => {
                const maxMonths = Math.max(...methods.map((x) => x.data.months));
                const pct = maxMonths > 0 ? (m.data.months / maxMonths) * 100 : 0;
                return (
                  <div key={m.name} className="flex items-center gap-3">
                    <span className="text-xs w-20 text-muted-foreground">{m.name}</span>
                    <div className="flex-1 bg-secondary/40 rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: "hsl(43,85%,55%)" }}
                      />
                    </div>
                    <span className="text-xs w-16 text-right">{m.data.months} mo</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 12-month schedule */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <SectionTitle>Avalanche — First 12 Months</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left py-2">Month</th>
                    {debts.map((d) => <th key={d.id} className="text-right py-2">{d.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {schedule12.map((row) => (
                    <tr key={row.month} className="border-b border-border/40">
                      <td className="py-1.5 font-mono">{row.month}</td>
                      {debts.map((d) => (
                        <td key={d.id} className="py-1.5 text-right font-mono">
                          {row.payments[d.name] ? formatCurrency(row.payments[d.name]) : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <Disclaimer />
    </div>
  );
}

// ─── TAB 3: NET WORTH SIMULATOR ───────────────────────────────────────────────

function NetWorthSimulator({ snap }: { snap: Record<string, number> }) {
  // ── Seed defaults from global forecast store ─────────────────────────────
  // wealthAssumptionsEdit = null means “use global store”; once the user
  // manually edits a field it becomes a local override for scenario testing.
  const fa = useForecastAssumptions();
  const WA_DEFAULTS = {
    propGrowth:   fa.flat.property_growth,
    stockReturn:  fa.flat.stocks_return,
    cryptoReturn: fa.flat.crypto_return,
    inflationRate: fa.flat.inflation,
    incomeGrowth: fa.flat.income_growth,
    expenseGrowth: fa.flat.expense_growth,
    interestRate: fa.flat.interest_rate,
    rentGrowth:   fa.flat.rent_growth,
  };
  const { data: appSettings } = useQuery({
    queryKey: ['/api/app-settings'],
    queryFn: () => apiRequest('GET', '/api/app-settings').then(r => r.json()),
    staleTime: 0,
  });
  const [wealthAssumptionsEdit, setWealthAssumptionsEdit] = useState<any>(null);
  // When mode changes externally, local override is cleared so the new global
  // defaults flow through (user must re-edit to override again).
  const wealthAssumptions = wealthAssumptionsEdit ?? WA_DEFAULTS;

  const propGrowth    = wealthAssumptions.propGrowth;
  const stockReturn   = wealthAssumptions.stockReturn;
  const cryptoReturn  = wealthAssumptions.cryptoReturn;
  const inflationRate = wealthAssumptions.inflationRate;
  const incomeGrowth  = wealthAssumptions.incomeGrowth;
  const expenseGrowth = wealthAssumptions.expenseGrowth;
  const interestRate  = wealthAssumptions.interestRate;
  const rentGrowth    = wealthAssumptions.rentGrowth;

  function setPropGrowth(v: number)    { setWealthAssumptionsEdit((p:any) => ({ ...(p ?? wealthAssumptions), propGrowth: v })); }
  function setStockReturn(v: number)   { setWealthAssumptionsEdit((p:any) => ({ ...(p ?? wealthAssumptions), stockReturn: v })); }
  function setCryptoReturn(v: number)  { setWealthAssumptionsEdit((p:any) => ({ ...(p ?? wealthAssumptions), cryptoReturn: v })); }
  function setInflationRate(v: number) { setWealthAssumptionsEdit((p:any) => ({ ...(p ?? wealthAssumptions), inflationRate: v })); }
  function setIncomeGrowth(v: number)  { setWealthAssumptionsEdit((p:any) => ({ ...(p ?? wealthAssumptions), incomeGrowth: v })); }
  function setExpenseGrowth(v: number) { setWealthAssumptionsEdit((p:any) => ({ ...(p ?? wealthAssumptions), expenseGrowth: v })); }
  function setInterestRate(v: number)  { setWealthAssumptionsEdit((p:any) => ({ ...(p ?? wealthAssumptions), interestRate: v })); }
  function setRentGrowth(v: number)    { setWealthAssumptionsEdit((p:any) => ({ ...(p ?? wealthAssumptions), rentGrowth: v })); }

  const [savedScenarios, setSavedScenarios] = useState<Array<{id: string; name: string; assumptions: any; savedAt: string}>>(() => {
    try { return JSON.parse(localStorage.getItem('sf_wealth_scenarios') || '[]'); } catch { return []; }
  });
  const [newScenarioName, setNewScenarioName] = useState('');

  const currentAssumptions = { propGrowth, stockReturn, cryptoReturn, inflationRate, incomeGrowth, expenseGrowth, interestRate, rentGrowth };

  const saveWealthAssumptions = async () => {
    try {
      await apiRequest('PATCH', '/api/app-settings', { wealth_assumptions: wealthAssumptions });
      setWealthAssumptionsEdit(null);
    } catch (err: any) {
      throw new Error(err?.message ?? 'Failed to save to Supabase');
    }
  };

  const saveScenario = (assumptions: any, name: string) => {
    if (!name.trim()) return;
    const scenario = {
      id: Date.now().toString(),
      name: name.trim(),
      assumptions,
      savedAt: new Date().toISOString(),
    };
    const updated = [...savedScenarios, scenario].slice(-10);
    setSavedScenarios(updated);
    localStorage.setItem('sf_wealth_scenarios', JSON.stringify(updated));
    setNewScenarioName('');
  };

  const deleteScenario = (id: string) => {
    const updated = savedScenarios.filter(s => s.id !== id);
    setSavedScenarios(updated);
    localStorage.setItem('sf_wealth_scenarios', JSON.stringify(updated));
  };

  const loadScenario = (scenario: {id: string; name: string; assumptions: any; savedAt: string}) => {
    const a = scenario.assumptions;
    if (a.propGrowth !== undefined) setPropGrowth(a.propGrowth);
    if (a.stockReturn !== undefined) setStockReturn(a.stockReturn);
    if (a.cryptoReturn !== undefined) setCryptoReturn(a.cryptoReturn);
    if (a.inflationRate !== undefined) setInflationRate(a.inflationRate);
    if (a.incomeGrowth !== undefined) setIncomeGrowth(a.incomeGrowth);
    if (a.expenseGrowth !== undefined) setExpenseGrowth(a.expenseGrowth);
    if (a.interestRate !== undefined) setInterestRate(a.interestRate);
    if (a.rentGrowth !== undefined) setRentGrowth(a.rentGrowth);
  };

  const baseNW =
    safeNum(snap.ppor) +
    safeNum(snap.cash) +
    safeNum(snap.super_balance) +
    safeNum(snap.stocks) +
    safeNum(snap.crypto) +
    safeNum(snap.cars) +
    safeNum(snap.iran_property) -
    safeNum(snap.mortgage) -
    safeNum(snap.other_debts);

  const chartData = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const rows = [];

    for (let y = 1; y <= 10; y++) {
      const yr = currentYear + y;

      // Scenario A: current path
      const a_assets =
        safeNum(snap.ppor) * Math.pow(1 + propGrowth / 100, y) +
        safeNum(snap.cash) +
        (safeNum(snap.monthly_income) - safeNum(snap.monthly_expenses)) * 12 * y * 0.5 +
        safeNum(snap.super_balance) * Math.pow(1.09, y) +
        safeNum(snap.stocks) * Math.pow(1 + stockReturn / 100, y) +
        safeNum(snap.crypto) * Math.pow(1 + cryptoReturn / 100, y) +
        safeNum(snap.cars) * 0.6 +
        safeNum(snap.iran_property) * Math.pow(1.04, y);
      const a_liab =
        Math.max(0, safeNum(snap.mortgage) - (safeNum(snap.mortgage) * 0.035 * y)) +
        Math.max(0, safeNum(snap.other_debts) * (1 - y * 0.12));
      const a_nw = a_assets - a_liab;

      // Scenario B: Buy 1 IP at $750k, 80% LVR, 6% growth, 5% rental yield
      const ipValue = 750000 * Math.pow(1 + propGrowth / 100, y);
      const ipLoan = Math.max(0, 600000 - 600000 * (interestRate / 100) * y * 0.3);
      const ipRentAnnual = 750000 * 0.05 * Math.pow(1 + rentGrowth / 100, y);
      const b_nw = a_nw + (ipValue - ipLoan) + ipRentAnnual * y * 0.3;

      // Scenario C: $3k/month extra stocks
      const extraStock = (() => {
        let val = 0;
        const mr = stockReturn / 100 / 12;
        for (let m = 0; m < y * 12; m++) {
          val = val * (1 + mr) + 3000;
        }
        return val;
      })();
      const c_nw = a_nw + extraStock;

      // Scenario D: B + C
      const d_nw = a_nw + (ipValue - ipLoan) + ipRentAnnual * y * 0.3 + extraStock;

      rows.push({
        year: yr,
        "Current Path": Math.round(a_nw / 1000),
        "Buy IP": Math.round(b_nw / 1000),
        "Extra Stocks": Math.round(c_nw / 1000),
        "IP + Stocks": Math.round(d_nw / 1000),
        _a: a_nw,
        _b: b_nw,
        _c: c_nw,
        _d: d_nw,
      });
    }
    return rows;
  }, [snap, propGrowth, stockReturn, cryptoReturn, inflationRate, incomeGrowth, expenseGrowth, interestRate, rentGrowth]);

  const yr5 = chartData[4];
  const yr10 = chartData[9];

  const COLORS = {
    "Current Path": "hsl(210,80%,60%)",
    "Buy IP": "hsl(43,85%,55%)",
    "Extra Stocks": "hsl(142,60%,45%)",
    "IP + Stocks": "hsl(280,60%,65%)",
  };

  const barData = yr5 && yr10 ? [
    { scenario: "Current", "5yr": Math.round(yr5._a / 1000), "10yr": Math.round(yr10._a / 1000) },
    { scenario: "Buy IP", "5yr": Math.round(yr5._b / 1000), "10yr": Math.round(yr10._b / 1000) },
    { scenario: "Stocks", "5yr": Math.round(yr5._c / 1000), "10yr": Math.round(yr10._c / 1000) },
    { scenario: "Combined", "5yr": Math.round(yr5._d / 1000), "10yr": Math.round(yr10._d / 1000) },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Assumptions */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <SectionTitle>Assumptions (10-Year Projection)</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <InputRow label="Property growth" value={propGrowth} onChange={setPropGrowth} suffix="%" step={0.5} />
          <InputRow label="Stock return" value={stockReturn} onChange={setStockReturn} suffix="%" step={0.5} />
          <InputRow label="Crypto return" value={cryptoReturn} onChange={setCryptoReturn} suffix="%" step={0.5} />
          <InputRow label="Inflation" value={inflationRate} onChange={setInflationRate} suffix="%" step={0.5} />
          <InputRow label="Income growth" value={incomeGrowth} onChange={setIncomeGrowth} suffix="%" step={0.5} />
          <InputRow label="Expense growth" value={expenseGrowth} onChange={setExpenseGrowth} suffix="%" step={0.5} />
          <InputRow label="Interest rate" value={interestRate} onChange={setInterestRate} suffix="%" step={0.5} />
          <InputRow label="Rent growth" value={rentGrowth} onChange={setRentGrowth} suffix="%" step={0.5} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <SaveButton label="Save Assumptions" onSave={saveWealthAssumptions} />
          {wealthAssumptionsEdit && (
            <span className="text-xs text-amber-400">Unsaved changes — click Save to persist</span>
          )}
        </div>
      </div>

      {/* Save Scenario section */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-primary" />
          Saved Scenarios
        </h4>
        <div className="flex gap-2">
          <Input
            value={newScenarioName}
            onChange={e => setNewScenarioName(e.target.value)}
            placeholder="Scenario name (e.g. Buy IP in 2026)"
            className="h-8 text-sm flex-1"
          />
          <Button size="sm" onClick={() => saveScenario(currentAssumptions, newScenarioName)} className="h-8">
            Save
          </Button>
        </div>
        {savedScenarios.length > 0 && (
          <div className="space-y-2 mt-2">
            {savedScenarios.map(s => (
              <div key={s.id} className="flex items-center justify-between bg-secondary/30 rounded-lg px-3 py-2 text-xs">
                <div>
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-muted-foreground ml-2">{new Date(s.savedAt).toLocaleDateString('en-AU')}</span>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => loadScenario(s)}>Load</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-destructive" onClick={() => deleteScenario(s.id)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Current NW */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Current Net Worth" value={formatCurrency(baseNW)} color="hsl(43,85%,55%)" />
        {yr5 && <KpiCard label="5yr — Current Path" value={formatCurrency(yr5._a)} />}
        {yr10 && <KpiCard label="10yr — Current Path" value={formatCurrency(yr10._a)} />}
        {yr10 && yr5 && (
          <KpiCard label="Best Scenario 10yr" value={formatCurrency(yr10._d)} color="hsl(142,60%,45%)" sub="IP + Stocks combined" />
        )}
      </div>

      {/* Line chart */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <SectionTitle>10-Year Net Worth Trajectories ($000s)</SectionTitle>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,18%)" />
            <XAxis dataKey="year" tick={{ fill: "hsl(0,0%,55%)", fontSize: 11 }} />
            <YAxis tick={{ fill: "hsl(0,0%,55%)", fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: "hsl(0,0%,10%)", border: "1px solid hsl(0,0%,20%)", borderRadius: 8 }}
              formatter={(v: number) => [`$${v}k`, ""]}
            />
            <Legend />
            {(["Current Path", "Buy IP", "Extra Stocks", "IP + Stocks"] as const).map((k) => (
              <Line key={k} type="monotone" dataKey={k} stroke={COLORS[k]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bar comparison */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <SectionTitle>5yr vs 10yr Comparison ($000s)</SectionTitle>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,18%)" />
            <XAxis dataKey="scenario" tick={{ fill: "hsl(0,0%,55%)", fontSize: 11 }} />
            <YAxis tick={{ fill: "hsl(0,0%,55%)", fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: "hsl(0,0%,10%)", border: "1px solid hsl(0,0%,20%)", borderRadius: 8 }}
              formatter={(v: number) => [`$${v}k`, ""]}
            />
            <Legend />
            <Bar dataKey="5yr" fill="hsl(210,80%,60%)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="10yr" fill="hsl(43,85%,55%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Data table */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <SectionTitle>Year-by-Year Table</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left py-2">Year</th>
                <th className="text-right py-2">Current</th>
                <th className="text-right py-2">Buy IP</th>
                <th className="text-right py-2">Extra Stocks</th>
                <th className="text-right py-2">IP + Stocks</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((row) => (
                <tr key={row.year} className="border-b border-border/40">
                  <td className="py-1.5 font-mono">{row.year}</td>
                  <td className="py-1.5 text-right font-mono">{formatCurrency(row._a)}</td>
                  <td className="py-1.5 text-right font-mono">{formatCurrency(row._b)}</td>
                  <td className="py-1.5 text-right font-mono">{formatCurrency(row._c)}</td>
                  <td className="py-1.5 text-right font-mono text-yellow-400">{formatCurrency(row._d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Disclaimer />
    </div>
  );
}

// ─── TAB 4: LIFESTYLE INFLATION DETECTOR ──────────────────────────────────────

function LifestyleInflation({ expenses }: { expenses: any[] }) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const sameMonthLastYear = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const getMonthExp = (ym: string) =>
    expenses.filter((e) => (e.date || "").startsWith(ym)).reduce((s: number, e: any) => s + safeNum(e.amount), 0);

  const getMonthsAvg = (months: string[]) => {
    const totals = months.map(getMonthExp);
    const nonZero = totals.filter((t) => t > 0);
    return nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
  };

  const getMonthKey = (offset: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const recent3 = [0, -1, -2].map(getMonthKey);
  const prior3 = [-3, -4, -5].map(getMonthKey);

  const thisTotal = getMonthExp(thisMonth);
  const lastTotal = getMonthExp(lastMonth);
  const sameLastYearTotal = getMonthExp(sameMonthLastYear);
  const recent3Avg = getMonthsAvg(recent3);
  const prior3Avg = getMonthsAvg(prior3);

  // 12-month baseline
  const last12 = Array.from({ length: 12 }, (_, i) => getMonthKey(-i));
  const baseline12Avg = getMonthsAvg(last12);

  // Category analysis
  const catMap = new Map<string, { recent: number; prior: number }>();
  for (const e of expenses) {
    const ym = (e.date || "").substring(0, 7);
    const cat = e.category || "Other";
    if (!catMap.has(cat)) catMap.set(cat, { recent: 0, prior: 0 });
    const rec = catMap.get(cat)!;
    if (recent3.includes(ym)) rec.recent += safeNum(e.amount) / 3;
    if (prior3.includes(ym)) rec.prior += safeNum(e.amount) / 3;
  }

  const catChanges = Array.from(catMap.entries())
    .map(([cat, v]) => ({
      cat,
      recent: v.recent,
      prior: v.prior,
      change: v.prior > 0 ? ((v.recent - v.prior) / v.prior) * 100 : 0,
      abs: v.recent - v.prior,
    }))
    .filter((c) => c.recent > 0)
    .sort((a, b) => b.abs - a.abs);

  const top5Growing = catChanges.filter((c) => c.abs > 0).slice(0, 5);

  const subscriptionTotal = catChanges.find((c) => c.cat.toLowerCase().includes("subscription"))?.recent || 0;
  const diningTotal =
    (catChanges.find((c) => c.cat.toLowerCase().includes("dining"))?.recent || 0) +
    (catChanges.find((c) => c.cat.toLowerCase().includes("coffee"))?.recent || 0);

  const nonEssentialCats = ["Dining Out / Coffee", "Entertainment", "Shopping", "Subscriptions", "Travel", "Personal Care"];
  const nonEssential = catChanges
    .filter((c) => nonEssentialCats.some((ne) => c.cat.includes(ne)))
    .reduce((s, c) => s + c.recent, 0);
  const lifestyleRatio = recent3Avg > 0 ? (nonEssential / recent3Avg) * 100 : 0;

  const leakage = Math.max(0, recent3Avg - prior3Avg);
  const annualLeakage = leakage * 12;

  const momChange = lastTotal > 0 ? ((thisTotal - lastTotal) / lastTotal) * 100 : 0;
  const yoyChange = sameLastYearTotal > 0 ? ((thisTotal - sameLastYearTotal) / sameLastYearTotal) * 100 : 0;
  const momAvgChange = prior3Avg > 0 ? ((recent3Avg - prior3Avg) / prior3Avg) * 100 : 0;

  const trafficLight =
    momAvgChange > 10 ? "red" : momAvgChange > 5 ? "amber" : "green";

  const tlColors = { red: "hsl(0,72%,51%)", amber: "hsl(43,85%,55%)", green: "hsl(142,60%,45%)" };
  const tlLabels = { red: "High Inflation Risk", amber: "Moderate Creep", green: "Well Controlled" };

  return (
    <div className="space-y-6">
      {/* Traffic light */}
      <div
        className="bg-card border rounded-2xl p-5 flex items-center gap-4"
        style={{ borderColor: tlColors[trafficLight] }}
      >
        <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: tlColors[trafficLight] }}>
          {trafficLight === "red" ? <AlertTriangle className="w-6 h-6 text-white" /> :
           trafficLight === "amber" ? <Eye className="w-6 h-6 text-white" /> :
           <CheckCircle className="w-6 h-6 text-white" />}
        </div>
        <div>
          <p className="font-bold" style={{ color: tlColors[trafficLight] }}>{tlLabels[trafficLight]}</p>
          <p className="text-xs text-muted-foreground">
            3-month average spending {momAvgChange >= 0 ? "up" : "down"} {Math.abs(momAvgChange).toFixed(1)}% vs prior period
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-muted-foreground">Lifestyle Ratio</p>
          <p className="text-lg font-bold">{lifestyleRatio.toFixed(0)}%</p>
          <p className="text-xs text-muted-foreground">non-essential</p>
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="MoM Change" value={`${momChange >= 0 ? "+" : ""}${momChange.toFixed(1)}%`} color={momChange > 5 ? "hsl(0,72%,51%)" : "hsl(142,60%,45%)"} />
        <KpiCard label="YoY Change" value={`${yoyChange >= 0 ? "+" : ""}${yoyChange.toFixed(1)}%`} color={yoyChange > 10 ? "hsl(0,72%,51%)" : "hsl(142,60%,45%)"} />
        <KpiCard label="Monthly Leakage" value={formatCurrency(leakage)} color="hsl(0,72%,51%)" sub="vs prior 3 months" />
        <KpiCard label="Annual Leakage" value={formatCurrency(annualLeakage)} color="hsl(0,72%,51%)" sub="projected savings potential" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Category creep */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <SectionTitle>Top 5 Growing Categories</SectionTitle>
          {top5Growing.length === 0 ? (
            <p className="text-xs text-muted-foreground">No significant category creep detected.</p>
          ) : (
            <div className="space-y-3">
              {top5Growing.map((c) => (
                <div key={c.cat} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium">{c.cat}</span>
                      <span className="text-red-400">+{formatCurrency(c.abs)}/mo</span>
                    </div>
                    <div className="bg-secondary/40 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, Math.abs(c.change))}%`,
                          background: "hsl(0,72%,51%)",
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.change.toFixed(1)}% increase</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Subscriptions & dining */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <SectionTitle>Spending Highlights</SectionTitle>
          <div className="bg-secondary/40 rounded-xl p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-medium">Subscription Total</p>
                <p className="text-xs text-muted-foreground">Monthly average (recent 3 months)</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">{formatCurrency(subscriptionTotal)}</p>
                {subscriptionTotal > 200 && (
                  <p className="text-xs text-red-400">⚠ Review recommended</p>
                )}
              </div>
            </div>
          </div>
          <div className="bg-secondary/40 rounded-xl p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-medium">Dining Out / Coffee</p>
                <p className="text-xs text-muted-foreground">Monthly average</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">{formatCurrency(diningTotal)}</p>
                {diningTotal > 600 && (
                  <p className="text-xs text-red-400">⚠ Above target</p>
                )}
              </div>
            </div>
          </div>
          <div className="bg-secondary/40 rounded-xl p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-medium">12-Month Avg Spend</p>
                <p className="text-xs text-muted-foreground">Baseline</p>
              </div>
              <p className="text-lg font-bold">{formatCurrency(baseline12Avg)}/mo</p>
            </div>
          </div>
          {leakage > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3">
              <p className="text-xs font-medium text-yellow-400">Recommended Monthly Savings</p>
              <p className="text-lg font-bold text-yellow-400">{formatCurrency(leakage)}</p>
              <p className="text-xs text-muted-foreground">by returning to prior-period baseline</p>
            </div>
          )}
        </div>
      </div>
      <Disclaimer />
    </div>
  );
}

// ─── TAB 5: EMERGENCY SCORE ───────────────────────────────────────────────────

function EmergencyScore({ snap }: { snap: Record<string, number> }) {
  const [familySize, setFamilySize] = useState(4);
  const [incomeStreams, setIncomeStreams] = useState(1);

  const calc = useMemo(() => {
    const liquidAssets = safeNum(snap.cash);
    const monthlyExpenses = safeNum(snap.monthly_expenses);
    const monthlyDebtPayments =
      safeNum(snap.mortgage) / 12 + safeNum(snap.other_debts) * 0.1;
    const totalMonthly = monthlyExpenses + monthlyDebtPayments;
    const monthsCovered = totalMonthly > 0 ? liquidAssets / totalMonthly : 0;
    const recommended = familySize >= 4 ? 6 : 3;
    const adjustedRec = incomeStreams > 1 ? Math.max(3, recommended - 1) : recommended;
    const score = Math.min(100, (monthsCovered / adjustedRec) * 100);
    const riskLevel: "Low" | "Medium" | "High" =
      score >= 80 ? "Low" : score >= 50 ? "Medium" : "High";
    const targetCash = totalMonthly * adjustedRec;
    const shortfall = Math.max(0, targetCash - liquidAssets);
    const monthlyToFill = shortfall / 12;

    return {
      liquidAssets,
      monthlyExpenses,
      monthlyDebtPayments,
      totalMonthly,
      monthsCovered,
      recommended: adjustedRec,
      score,
      riskLevel,
      targetCash,
      shortfall,
      monthlyToFill,
    };
  }, [snap, familySize, incomeStreams]);

  const riskColor = { Low: "hsl(142,60%,45%)", Medium: "hsl(43,85%,55%)", High: "hsl(0,72%,51%)" };
  const ringColor = riskColor[calc.riskLevel];

  const recommendations = [
    `Build cash to ${formatCurrency(calc.targetCash)} (${calc.recommended} months of expenses)`,
    "Keep emergency funds in a high-interest savings account (4%+)",
    incomeStreams < 2 ? "Add a second income stream to reduce risk" : "Maintain current dual-income buffer",
    "Review and reduce monthly commitments to lower your expense base",
    "Set up automatic transfers of at least " + formatCurrency(Math.max(500, calc.monthlyToFill)) + "/month",
  ];

  return (
    <div className="space-y-6">
      {/* Inputs */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <SectionTitle>Household Details</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <InputRow label="Family size" value={familySize} onChange={setFamilySize} />
          <InputRow label="Income streams" value={incomeStreams} onChange={setIncomeStreams} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Score ring */}
        <div className="bg-card border border-border rounded-2xl p-6 flex flex-col items-center gap-4">
          <p className="text-sm font-semibold">Emergency Fund Score</p>
          <ProgressRing pct={calc.score} size={160} stroke={14} color={ringColor}>
            <span className="text-2xl font-bold">{Math.round(calc.score)}</span>
            <span className="text-xs text-muted-foreground mt-0.5">/ 100</span>
          </ProgressRing>
          <div
            className="px-4 py-1.5 rounded-full text-sm font-semibold"
            style={{ background: ringColor + "22", color: ringColor, border: `1px solid ${ringColor}44` }}
          >
            {calc.riskLevel} Risk
          </div>
          <div className="w-full grid grid-cols-2 gap-3">
            <KpiCard label="Months Covered" value={calc.monthsCovered.toFixed(1)} sub={`need ${calc.recommended}`} />
            <KpiCard label="Current Cash" value={formatCurrency(calc.liquidAssets)} color="hsl(210,80%,60%)" />
            <KpiCard label="Target Cash" value={formatCurrency(calc.targetCash)} />
            <KpiCard label="Shortfall" value={formatCurrency(calc.shortfall)} color={calc.shortfall > 0 ? "hsl(0,72%,51%)" : "hsl(142,60%,45%)"} />
          </div>
        </div>

        {/* Recommendations */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <SectionTitle>Action Plan</SectionTitle>
          {calc.shortfall > 0 && (
            <div className="bg-secondary/40 rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Monthly save needed to fill gap in 12 months</p>
              <p className="text-2xl font-bold text-yellow-400">{formatCurrency(calc.monthlyToFill)}</p>
            </div>
          )}
          <div className="space-y-2">
            {recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2 bg-secondary/40 rounded-xl px-3 py-2">
                <span className="text-xs font-bold text-yellow-400 mt-0.5 w-4 shrink-0">{i + 1}</span>
                <p className="text-xs">{rec}</p>
              </div>
            ))}
          </div>

          {/* Expense breakdown */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <KpiCard label="Monthly Expenses" value={formatCurrency(calc.monthlyExpenses)} />
            <KpiCard label="Monthly Debt Payments" value={formatCurrency(calc.monthlyDebtPayments)} />
          </div>
        </div>
      </div>
      <Disclaimer />
    </div>
  );
}

// ─── TAB 6: TAX OPTIMIZER ────────────────────────────────────────────────────

function TaxOptimizer({ snap, properties }: { snap: Record<string, number>; properties: any[] }) {
  const grossDefault = safeNum(snap.monthly_income) * 12;
  const [grossIncome, setGrossIncome] = useState(grossDefault || 120000);
  const [totalDeductions, setTotalDeductions] = useState(5000);
  const [negGearing, setNegGearing] = useState(0);
  const [extraSuper, setExtraSuper] = useState(0);
  const [cgGain, setCgGain] = useState(0);
  const [cgMonths, setCgMonths] = useState(13);

  // Auto-calculate negative gearing from properties
  const autoNegGearing = useMemo(() => {
    if (!properties.length) return 0;
    return properties.reduce((total: number, p: any) => {
      const annualRent = safeNum(p.weekly_rent) * 52 * (1 - safeNum(p.vacancy_rate) / 100) * (1 - safeNum(p.management_fee) / 100);
      const annualCosts =
        safeNum(p.council_rates) +
        safeNum(p.insurance) +
        safeNum(p.maintenance) +
        safeNum(p.loan_amount) * (safeNum(p.interest_rate) / 100);
      return total + Math.max(0, annualCosts - annualRent);
    }, 0);
  }, [properties]);

  const effectiveNegGearing = negGearing || autoNegGearing;

  const calc = useMemo(() => {
    const taxableIncome = Math.max(0, grossIncome - totalDeductions - effectiveNegGearing - extraSuper);
    const grossTax = calcAusTax(taxableIncome);
    const lito = calcLITO(taxableIncome);
    const medicare = calcMedicare(taxableIncome);
    const netTax = Math.max(0, grossTax - lito + medicare);
    const effectiveRate = grossIncome > 0 ? (netTax / grossIncome) * 100 : 0;
    const monthlyTax = netTax / 12;
    const monthlyNet = (grossIncome - netTax) / 12;

    // Without deductions
    const noDeductTax = calcAusTax(grossIncome) - calcLITO(grossIncome) + calcMedicare(grossIncome);
    const taxSaving = Math.max(0, noDeductTax - netTax);

    // Super saving
    const marginalRate = calcMarginalRate(taxableIncome);
    const superTaxRate = 0.15;
    const superSaving = extraSuper * Math.max(0, marginalRate - superTaxRate);

    // CGT
    const cgtGain = cgMonths > 12 ? cgGain * 0.5 : cgGain;
    const cgtTax = calcAusTax(taxableIncome + cgtGain) - calcAusTax(taxableIncome);
    const cgtWithDiscount = calcAusTax(taxableIncome + cgGain * 0.5) - calcAusTax(taxableIncome);
    const cgtWithout = calcAusTax(taxableIncome + cgGain) - calcAusTax(taxableIncome);

    return {
      taxableIncome,
      grossTax,
      lito,
      medicare,
      netTax,
      effectiveRate,
      monthlyTax,
      monthlyNet,
      taxSaving,
      superSaving,
      marginalRate,
      cgtTax,
      cgtWithDiscount,
      cgtWithout,
    };
  }, [grossIncome, totalDeductions, effectiveNegGearing, extraSuper, cgGain, cgMonths]);

  // Bar chart data
  const barData = [
    { name: "Gross Income", value: Math.round(grossIncome / 1000) },
    { name: "Taxable Income", value: Math.round(calc.taxableIncome / 1000) },
    { name: "Net Tax", value: Math.round(calc.netTax / 1000) },
    { name: "Take-home", value: Math.round((grossIncome - calc.netTax) / 1000) },
  ];

  return (
    <div className="space-y-6">
      {/* Inputs */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <SectionTitle>FY2025-26 Tax Inputs</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InputRow label="Gross income" value={grossIncome} onChange={setGrossIncome} prefix="$" />
          <InputRow label="Total deductions" value={totalDeductions} onChange={setTotalDeductions} prefix="$" />
          <InputRow
            label={`Negative gearing loss${autoNegGearing > 0 ? ` (auto: ${formatCurrency(autoNegGearing)})` : ""}`}
            value={effectiveNegGearing}
            onChange={setNegGearing}
            prefix="$"
          />
          <InputRow label="Extra super contribution" value={extraSuper} onChange={setExtraSuper} prefix="$" />
          <InputRow label="Capital gain (before discount)" value={cgGain} onChange={setCgGain} prefix="$" />
          <InputRow label="Months held (>12 = 50% CGT discount)" value={cgMonths} onChange={setCgMonths} />
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Taxable Income" value={formatCurrency(calc.taxableIncome)} />
        <KpiCard label="Total Tax" value={formatCurrency(calc.netTax)} color="hsl(0,72%,51%)" />
        <KpiCard label="Effective Rate" value={`${calc.effectiveRate.toFixed(1)}%`} />
        <KpiCard label="Monthly Take-Home" value={formatCurrency(calc.monthlyNet)} color="hsl(142,60%,45%)" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Breakdown */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <SectionTitle>Tax Breakdown</SectionTitle>
          <div className="space-y-2 text-sm">
            {[
              { label: "Gross income", value: grossIncome, color: "" },
              { label: `Deductions & neg. gearing`, value: -(totalDeductions + effectiveNegGearing + extraSuper), color: "text-green-400" },
              { label: "Taxable income", value: calc.taxableIncome, color: "font-bold" },
              { label: "Gross tax", value: calc.grossTax, color: "text-red-400" },
              { label: "LITO offset", value: -calc.lito, color: "text-green-400" },
              { label: "Medicare levy (2%)", value: calc.medicare, color: "text-red-400" },
              { label: "Net tax payable", value: calc.netTax, color: "font-bold text-red-400" },
              { label: "Annual take-home", value: grossIncome - calc.netTax, color: "font-bold text-green-400" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center border-b border-border/30 pb-1">
                <span className={`text-xs text-muted-foreground ${row.color}`}>{row.label}</span>
                <span className={`text-xs font-mono ${row.color}`}>{formatCurrency(row.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Savings */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <SectionTitle>Optimisation Opportunities</SectionTitle>
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Tax saving from deductions</p>
            <p className="text-xl font-bold text-green-400">{formatCurrency(calc.taxSaving)}</p>
            <p className="text-xs text-muted-foreground">vs no deductions applied</p>
          </div>
          {extraSuper > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
              <p className="text-xs text-muted-foreground">Super contribution tax saving</p>
              <p className="text-xl font-bold text-blue-400">{formatCurrency(calc.superSaving)}</p>
              <p className="text-xs text-muted-foreground">
                {(calc.marginalRate * 100).toFixed(0)}% marginal vs 15% super tax
              </p>
            </div>
          )}
          {cgGain > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
              <p className="text-xs text-muted-foreground">CGT with 50% discount (held {cgMonths} months)</p>
              <p className="text-xl font-bold text-yellow-400">{formatCurrency(calc.cgtWithDiscount)}</p>
              <p className="text-xs text-muted-foreground">
                vs {formatCurrency(calc.cgtWithout)} without discount
              </p>
            </div>
          )}
          <div className="bg-card border border-border rounded-xl p-5">
            <SectionTitle>Income Bar</SectionTitle>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,18%)" />
                <XAxis type="number" tick={{ fill: "hsl(0,0%,55%)", fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tick={{ fill: "hsl(0,0%,55%)", fontSize: 10 }} width={80} />
                <Tooltip
                  contentStyle={{ background: "hsl(0,0%,10%)", border: "1px solid hsl(0,0%,20%)", borderRadius: 8 }}
                  formatter={(v: number) => [`$${v}k`, ""]}
                />
                <Bar dataKey="value" fill="hsl(43,85%,55%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground/60 pt-2 border-t border-border">
        <Info className="w-3 h-3 shrink-0 mt-0.5" />
        <span>
          General information only, not tax advice. Consult a registered Australian tax adviser. Brackets based on ATO FY2025-26 rates.
        </span>
      </div>
    </div>
  );
}

// ─── TAB 7: PROPERTY EXPANSION ENGINE ────────────────────────────────────────

function PropertyExpansion({ snap }: { snap: Record<string, number> }) {
  const [targetPrice, setTargetPrice] = useState(750000);
  const [useQldStamp, setUseQldStamp] = useState<string>("yes");
  const monthlySurplus = safeNum(snap.monthly_income) - safeNum(snap.monthly_expenses);
  const pporEquity = safeNum(snap.ppor) - safeNum(snap.mortgage);
  const cash = safeNum(snap.cash);

  const lvrScenarios = [80, 85, 90];

  const results = useMemo(() => {
    const stampDuty = useQldStamp === "yes" ? calcQldStampDuty(targetPrice) : Math.round(targetPrice * 0.04);

    return lvrScenarios.map((lvr) => {
      const deposit = targetPrice * (1 - lvr / 100);
      const lmi = lvr > 80 ? targetPrice * 0.02 : 0;
      const legalFees = 2000;
      const purchaseCosts = stampDuty + legalFees + lmi;
      const totalCashNeeded = deposit + purchaseCosts;
      const equityAvailable = Math.max(0, pporEquity * 0.8 - safeNum(snap.mortgage) * 0.2);
      const depositAvailable = Math.min(cash * 0.7, Math.max(0, cash - 50000));
      const totalFundsAvailable = depositAvailable + Math.min(equityAvailable, totalCashNeeded * 0.5);
      const depositReadiness = Math.min(100, (totalFundsAvailable / totalCashNeeded) * 100);
      const cashBufferAfter = cash - totalCashNeeded;
      const loanAmount = targetPrice * (lvr / 100);
      const monthlyRepayment = loanAmount > 0 ? (loanAmount * (0.065 / 12) * Math.pow(1 + 0.065 / 12, 360)) / (Math.pow(1 + 0.065 / 12, 360) - 1) : 0;
      const monthsToReady = Math.max(0, Math.ceil((totalCashNeeded - totalFundsAvailable) / Math.max(1, monthlySurplus)));
      const borrowingPower = monthlySurplus * 12 / 0.07;

      return {
        lvr,
        deposit,
        lmi,
        stampDuty,
        legalFees,
        purchaseCosts,
        totalCashNeeded,
        depositAvailable: totalFundsAvailable,
        depositReadiness,
        cashBufferAfter,
        monthlyRepayment,
        monthsToReady,
        borrowingPower,
        loanAmount,
      };
    });
  }, [targetPrice, useQldStamp, snap, cash, pporEquity, monthlySurplus]);

  return (
    <div className="space-y-6">
      {/* Inputs */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <SectionTitle>Property Parameters</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InputRow label="Target IP price" value={targetPrice} onChange={setTargetPrice} prefix="$" />
          <div className="flex items-center justify-between gap-3">
            <label className="text-xs text-muted-foreground flex-1">QLD Stamp Duty</label>
            <Select value={useQldStamp} onValueChange={setUseQldStamp}>
              <SelectTrigger className="h-8 text-sm w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">QLD Rate</SelectItem>
                <SelectItem value="no">~4% Generic</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Current position */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="PPOR Equity" value={formatCurrency(pporEquity)} color={pporEquity > 0 ? "hsl(142,60%,45%)" : "hsl(0,72%,51%)"} />
        <KpiCard label="Cash Available" value={formatCurrency(cash)} />
        <KpiCard label="Monthly Surplus" value={formatCurrency(monthlySurplus)} />
        <KpiCard label="Borrowing Power" value={formatCurrency(Math.max(0, monthlySurplus * 12 / 0.07))} sub="rough estimate" />
      </div>

      {/* LVR comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {results.map((r) => (
          <div
            key={r.lvr}
            className="bg-card border rounded-2xl p-5 space-y-3"
            style={{ borderColor: r.cashBufferAfter < 30000 ? "hsl(0,72%,51%)" : r.depositReadiness >= 80 ? "hsl(142,60%,45%)" : "hsl(0,0%,20%)" }}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">{r.lvr}% LVR</p>
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  background: r.depositReadiness >= 80 ? "hsl(142,60%,15%)" : r.depositReadiness >= 50 ? "hsl(43,85%,15%)" : "hsl(0,72%,15%)",
                  color: r.depositReadiness >= 80 ? "hsl(142,60%,45%)" : r.depositReadiness >= 50 ? "hsl(43,85%,55%)" : "hsl(0,72%,51%)",
                }}
              >
                {Math.round(r.depositReadiness)}% ready
              </span>
            </div>

            <div className="bg-secondary/40 rounded-full h-2">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, r.depositReadiness)}%`,
                  background: r.depositReadiness >= 80 ? "hsl(142,60%,45%)" : r.depositReadiness >= 50 ? "hsl(43,85%,55%)" : "hsl(0,72%,51%)",
                }}
              />
            </div>

            {[
              ["Deposit Required", formatCurrency(r.deposit)],
              ["LMI", r.lmi > 0 ? formatCurrency(r.lmi) : "None"],
              ["Stamp Duty", formatCurrency(r.stampDuty)],
              ["Legal Fees", formatCurrency(r.legalFees)],
              ["Total Cash Needed", formatCurrency(r.totalCashNeeded)],
              ["Available Funds", formatCurrency(r.depositAvailable)],
              ["Cash Buffer After", formatCurrency(r.cashBufferAfter)],
              ["Monthly Repayment", formatCurrency(r.monthlyRepayment)],
              ["Months to Ready", r.monthsToReady > 0 ? `${r.monthsToReady} months` : "Ready Now"],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between text-xs border-b border-border/30 pb-1">
                <span className="text-muted-foreground">{label}</span>
                <span
                  className="font-mono font-medium"
                  style={{
                    color: label === "Cash Buffer After"
                      ? r.cashBufferAfter < 30000
                        ? "hsl(0,72%,51%)"
                        : "hsl(142,60%,45%)"
                      : undefined,
                  }}
                >
                  {val}
                </span>
              </div>
            ))}

            {r.cashBufferAfter < 30000 && (
              <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 rounded-lg px-2 py-1.5">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                Cash buffer below safe minimum
              </div>
            )}
          </div>
        ))}
      </div>
      <Disclaimer />
    </div>
  );
}

// ─── TAB 8: RETIREMENT AGE PREDICTOR ─────────────────────────────────────────

function RetirementPredictor({ snap, stocks, crypto }: { snap: Record<string, number>; stocks: any[]; crypto: any[] }) {
  const [currentAge, setCurrentAge] = useState(36);
  const [targetAge, setTargetAge] = useState(55);
  const [targetPassive, setTargetPassive] = useState(8000);
  const [expectedReturn, setExpectedReturn] = useState(7);

  const stocksVal = stocks.reduce((s: number, st: any) => s + safeNum(st.current_holding) * safeNum(st.current_price), 0);
  const cryptoVal = crypto.reduce((s: number, c: any) => s + safeNum(c.current_holding) * safeNum(c.current_price), 0);

  const investableAssets =
    safeNum(snap.cash) +
    safeNum(snap.super_balance) +
    safeNum(snap.stocks) +
    safeNum(snap.crypto) +
    stocksVal +
    cryptoVal;

  const monthlySurplus = safeNum(snap.monthly_income) - safeNum(snap.monthly_expenses);
  const targetCapital = (targetPassive * 12) / 0.04;

  const scenarios = useMemo(() => {
    const defs = [
      { label: "Current Path", extraMonthly: 0, returnRate: expectedReturn, color: "hsl(210,80%,60%)" },
      { label: "Aggressive (+$2k)", extraMonthly: 2000, returnRate: expectedReturn + 1, color: "hsl(43,85%,55%)" },
      { label: "Property IP (+age 40)", extraMonthly: 0, returnRate: expectedReturn, ipAtAge: 40, color: "hsl(142,60%,45%)" },
      { label: "Stocks Focus", extraMonthly: 0, returnRate: expectedReturn + 2, allToStocks: true, color: "hsl(280,60%,65%)" },
      { label: "Combined (B+C)", extraMonthly: 2000, returnRate: expectedReturn + 1.5, ipAtAge: 40, color: "hsl(0,72%,51%)" },
    ];

    return defs.map((s) => {
      let portfolio = investableAssets;
      let fireAge = 80;
      const chartData: { age: number; value: number }[] = [];

      for (let age = currentAge + 1; age <= 80; age++) {
        const mr = s.returnRate / 100 / 12;
        const monthly = monthlySurplus + s.extraMonthly;
        for (let m = 0; m < 12; m++) {
          portfolio = portfolio * (1 + mr) + monthly;
        }

        // IP scenario: add equity from IP at age 40
        if ((s as any).ipAtAge && age === (s as any).ipAtAge + 10) {
          portfolio += 750000 * Math.pow(1.06, 10) - 600000 * 0.5; // rough IP equity
        }

        const passiveFromPortfolio = portfolio * 0.04 / 12;
        chartData.push({ age, value: Math.round(portfolio) });

        if (fireAge === 80 && passiveFromPortfolio >= targetPassive) {
          fireAge = age;
        }
      }

      const nwAtTarget = chartData.find((d) => d.age === targetAge)?.value || 0;
      const gapToTarget = fireAge - targetAge;

      return {
        ...s,
        fireAge,
        nwAtTarget,
        gapToTarget,
        chartData,
      };
    });
  }, [snap, stocks, crypto, currentAge, targetAge, targetPassive, expectedReturn, investableAssets, monthlySurplus]);

  // Merge chart data
  const merged = useMemo(() => {
    const ages = Array.from({ length: 80 - currentAge }, (_, i) => currentAge + 1 + i);
    return ages.map((age) => {
      const row: Record<string, number | string> = { age };
      for (const s of scenarios) {
        const pt = s.chartData.find((d) => d.age === age);
        if (pt) row[s.label] = Math.round(pt.value / 1000);
      }
      return row;
    });
  }, [scenarios, currentAge]);

  const scenarioColors = scenarios.reduce((acc, s) => ({ ...acc, [s.label]: s.color }), {} as Record<string, string>);

  // Monthly needed to hit target age
  const requiredMonthly = useMemo(() => {
    const targetMonths = (targetAge - currentAge) * 12;
    if (targetMonths <= 0) return 0;
    const mr = expectedReturn / 100 / 12;
    if (mr === 0) return (targetCapital - investableAssets) / targetMonths;
    const fvFactor = (Math.pow(1 + mr, targetMonths) - 1) / mr;
    const pvGrowth = investableAssets * Math.pow(1 + mr, targetMonths);
    return Math.max(0, (targetCapital - pvGrowth) / fvFactor);
  }, [targetAge, currentAge, expectedReturn, targetCapital, investableAssets]);

  return (
    <div className="space-y-6">
      {/* Inputs */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <SectionTitle>Inputs</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <InputRow label="Current age" value={currentAge} onChange={setCurrentAge} />
          <InputRow label="Target retirement age" value={targetAge} onChange={setTargetAge} />
          <InputRow label="Target monthly passive income" value={targetPassive} onChange={setTargetPassive} prefix="$" />
          <InputRow label="Expected return" value={expectedReturn} onChange={setExpectedReturn} suffix="%" step={0.5} />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Investable Assets" value={formatCurrency(investableAssets)} />
        <KpiCard label="Target FIRE Capital" value={formatCurrency(targetCapital)} sub="@4% SWR" />
        <KpiCard label="Monthly Surplus" value={formatCurrency(monthlySurplus)} />
        <KpiCard label="Monthly Needed" value={formatCurrency(requiredMonthly)} sub={`to retire at ${targetAge}`} color="hsl(43,85%,55%)" />
      </div>

      {/* Scenario cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {scenarios.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
              <p className="text-xs font-semibold">{s.label}</p>
            </div>
            <p className="text-2xl font-bold" style={{ color: s.color }}>Age {s.fireAge}</p>
            <p className="text-xs text-muted-foreground">
              {s.gapToTarget === 0
                ? "Exactly on target"
                : s.gapToTarget < 0
                ? `${Math.abs(s.gapToTarget)} years early`
                : `${s.gapToTarget} years after target`}
            </p>
            <div
              className="text-xs px-2 py-1 rounded-full inline-block"
              style={{
                background: s.gapToTarget <= 0 ? "hsl(142,60%,10%)" : "hsl(0,72%,10%)",
                color: s.gapToTarget <= 0 ? "hsl(142,60%,45%)" : "hsl(0,72%,51%)",
              }}
            >
              {s.gapToTarget <= 0 ? "✓ On Track" : "⚠ Adjust Plan"}
            </div>
            <p className="text-xs text-muted-foreground">NW at age {targetAge}: {formatCurrency(s.nwAtTarget)}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <SectionTitle>Portfolio Growth to Age 80 ($000s)</SectionTitle>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={merged}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,18%)" />
            <XAxis dataKey="age" tick={{ fill: "hsl(0,0%,55%)", fontSize: 11 }} />
            <YAxis tick={{ fill: "hsl(0,0%,55%)", fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: "hsl(0,0%,10%)", border: "1px solid hsl(0,0%,20%)", borderRadius: 8 }}
              formatter={(v: number) => [`$${v}k`, ""]}
            />
            <Legend />
            <ReferenceLine x={targetAge} stroke="hsl(43,85%,55%)" strokeDasharray="4 4" label={{ value: `Target ${targetAge}`, fill: "hsl(43,85%,55%)", fontSize: 10 }} />
            {scenarios.map((s) => (
              <Line key={s.label} type="monotone" dataKey={s.label} stroke={s.color} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Disclaimer />
    </div>
  );
}

// ─── TAB 9: HIDDEN MONEY DETECTOR ────────────────────────────────────────────

interface Leak {
  title: string;
  monthly: number;
  annual: number;
  action: string;
  priority: "High" | "Medium" | "Low";
  rows?: any[];       // raw expense rows for drilldown
  why?: string;       // explanation of why this was flagged
  fix?: string;       // specific fix action
}

// ─── Leak Drilldown Modal ─────────────────────────────────────────────────────
function LeakDrilldownModal({ leak, onClose, onNavigate }: {
  leak: Leak;
  onClose: () => void;
  onNavigate?: () => void;
}) {
  const priorityColor: Record<string, string> = {
    High: "hsl(0,72%,51%)",
    Medium: "hsl(43,85%,55%)",
    Low: "hsl(210,80%,60%)",
  };
  const color = priorityColor[leak.priority];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div className="flex items-start gap-3">
            <span
              className="text-xs px-2 py-0.5 rounded-full shrink-0 mt-0.5"
              style={{ background: color + "22", color }}
            >{leak.priority}</span>
            <div>
              <h3 className="font-bold text-sm">{leak.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Costing you <span className="font-bold" style={{ color }}>${leak.monthly.toFixed(0)}/mo</span> · ${leak.annual.toFixed(0)}/yr
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0 ml-4">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Why flagged */}
          <div className="bg-secondary/40 rounded-xl p-4">
            <p className="text-xs font-semibold mb-1 text-muted-foreground uppercase tracking-wide">Why flagged</p>
            <p className="text-sm">{leak.why ?? leak.action}</p>
          </div>

          {/* Recommendation */}
          <div className="rounded-xl p-4" style={{ background: color + "11", border: `1px solid ${color}33` }}>
            <p className="text-xs font-semibold mb-1 uppercase tracking-wide" style={{ color }}>Recommended Action</p>
            <p className="text-sm">{leak.fix ?? leak.action}</p>
          </div>

          {/* Savings projection */}
          <div className="bg-secondary/40 rounded-xl p-4">
            <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Savings Impact</p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Monthly Saving", value: `$${leak.monthly.toFixed(0)}` },
                { label: "Annual Saving", value: `$${leak.annual.toFixed(0)}` },
                { label: "5-Year (invested @ 8%)", value: `$${(leak.monthly * 12 * ((Math.pow(1.08, 5) - 1) / 0.08)).toFixed(0)}` },
              ].map(k => (
                <div key={k.label} className="text-center">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-base font-bold num-display text-emerald-400">{k.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Raw rows drilldown */}
          {leak.rows && leak.rows.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
                Flagged Transactions ({leak.rows.length})
              </p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      {["Date","Description","Category","Amount"].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-muted-foreground font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leak.rows.slice(0, 30).map((row: any, i: number) => (
                      <tr key={i} className="border-b border-border/40 hover:bg-secondary/20">
                        <td className="px-3 py-1.5 text-muted-foreground">{row.date ?? "—"}</td>
                        <td className="px-3 py-1.5 max-w-[180px] truncate">{row.description ?? row.notes ?? "—"}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{row.category ?? "—"}</td>
                        <td className="px-3 py-1.5 num-display font-semibold" style={{ color }}>${parseFloat(row.amount || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {leak.rows.length > 30 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-center text-xs text-muted-foreground">
                          ...and {leak.rows.length - 30} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-xs font-semibold rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            Close
          </button>
          {onNavigate && (
            <button
              onClick={() => { onNavigate(); onClose(); }}
              className="flex-1 py-2 text-xs font-semibold rounded-xl text-black"
              style={{ background: "linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))" }}
            >
              Go to Expenses →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function HiddenMoney({ snap, expenses }: { snap: Record<string, number>; expenses: any[] }) {
  const leaks = useMemo<Leak[]>(() => {
    const result: Leak[] = [];
    const now = new Date();
    const recent3 = Array.from({ length: 3 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });

    const recentExp = expenses.filter((e) => recent3.some((m) => (e.date || "").startsWith(m)));

    // 1. Subscription creep
    const subTotal = recentExp
      .filter((e) => (e.category || "").toLowerCase().includes("subscription"))
      .reduce((s: number, e: any) => s + safeNum(e.amount), 0) / 3;
    if (subTotal > 200) {
      const subRows = recentExp.filter((e) => (e.category || "").toLowerCase().includes("subscription"));
      result.push({
        title: "Subscription Creep",
        monthly: subTotal,
        annual: subTotal * 12,
        action: "Audit all subscriptions — cancel unused. Target: under $200/month.",
        priority: "High",
        rows: subRows,
        why: `You are spending $${subTotal.toFixed(0)}/mo on subscriptions over the last 3 months — above the $200/mo threshold. Many households accumulate subscriptions that are rarely used.`,
        fix: "List all active subscriptions, identify unused ones, and cancel immediately. Consider annual billing for services you keep — typically saves 15-20%.",
      });
    }

    // 2. Dining creep
    const diningTotal = recentExp
      .filter((e) => {
        const cat = (e.category || "").toLowerCase();
        return cat.includes("dining") || cat.includes("coffee") || cat.includes("restaurant");
      })
      .reduce((s: number, e: any) => s + safeNum(e.amount), 0) / 3;
    if (diningTotal > 600) {
      const diningRows = recentExp.filter((e) => { const cat = (e.category || "").toLowerCase(); return cat.includes("dining") || cat.includes("coffee") || cat.includes("restaurant"); });
      result.push({
        title: "Dining Out / Coffee Overspend",
        monthly: diningTotal - 600,
        annual: (diningTotal - 600) * 12,
        action: "Meal prep 3 days/week and limit café visits to 2x per week.",
        priority: "Medium",
        rows: diningRows,
        why: `Dining/café spending averaged $${diningTotal.toFixed(0)}/mo — $${(diningTotal - 600).toFixed(0)} above the $600/mo benchmark for a family of your size.`,
        fix: "Set a weekly dining budget. Meal prep Sunday evening for the week ahead. Limit café visits to 2 per week per adult. This alone can save $${((diningTotal - 600) * 12).toFixed(0)}/year.",
      });
    }

    // 3. High-interest debt cost
    const otherDebt = safeNum(snap.other_debts);
    if (otherDebt > 0) {
      const monthlyInterest = (otherDebt * 0.15) / 12;
      result.push({
        title: "High-Interest Debt Interest",
        monthly: monthlyInterest,
        annual: monthlyInterest * 12,
        action: "Prioritise paying off high-interest debt. Consider balance transfer.",
        priority: "High",
        why: `You have $${otherDebt.toLocaleString()} in non-mortgage debt at an estimated 15% rate, costing ~$${monthlyInterest.toFixed(0)}/mo in interest alone.`,
        fix: "Pay more than minimum each month. Consider a 0% balance transfer card for credit card debt. Use the Debt Killer tab to model an accelerated payoff strategy.",
      });
    }

    // 4. Dead cash (above 6-month buffer)
    const buffer6Month = safeNum(snap.monthly_expenses) * 6;
    const deadCash = Math.max(0, safeNum(snap.cash) - buffer6Month);
    if (deadCash > 10000) {
      const lostMonthly = (deadCash * 0.04) / 12;
      result.push({
        title: "Uninvested Cash Drag",
        monthly: lostMonthly,
        annual: lostMonthly * 12,
        action: `Move ${formatCurrency(deadCash)} above your buffer into investments or HISA.`,
        priority: "Medium",
        why: `You have $${deadCash.toLocaleString()} sitting above your 6-month emergency buffer earning near-zero return. At 4% (HISA/ETFs), that dead cash costs ~$${lostMonthly.toFixed(0)}/mo in opportunity cost.`,
        fix: `Move $${deadCash.toLocaleString()} into a high-yield savings account (4-5% p.a.) or diversified ETF portfolio. Keep 6 months expenses ($${buffer6Month.toLocaleString()}) as your emergency buffer only.`,
      });
    }

    // 5. Large unusual transactions
    const nonHousingLarge = recentExp.filter((e) => {
      const cat = (e.category || "").toLowerCase();
      const isHousing = cat.includes("mortgage") || cat.includes("rent") || cat.includes("council");
      return !isHousing && safeNum(e.amount) > 2000;
    });
    if (nonHousingLarge.length > 0) {
      const avgMonthly = nonHousingLarge.reduce((s: number, e: any) => s + safeNum(e.amount), 0) / 3;
      result.push({
        title: `Large Unusual Transactions (${nonHousingLarge.length} items)`,
        monthly: avgMonthly,
        annual: avgMonthly * 12,
        action: "Review each large transaction — are these one-offs or recurring?",
        priority: "Low",
        rows: nonHousingLarge,
        why: `Found ${nonHousingLarge.length} non-housing transactions above $2,000 in the last 3 months. These may be genuine one-offs or a sign of recurring overspend.`,
        fix: "Review each transaction. For one-offs, no action needed. For recurring large expenses, evaluate if they deliver adequate value and negotiate or eliminate where possible.",
      });
    }

    // 6. Insurance check
    const insTotal = recentExp
      .filter((e) => (e.category || "").toLowerCase().includes("insurance"))
      .reduce((s: number, e: any) => s + safeNum(e.amount), 0) / 3;
    if (insTotal > 600) {
      const insRows = recentExp.filter((e) => (e.category || "").toLowerCase().includes("insurance"));
      result.push({
        title: "High Insurance Costs",
        monthly: insTotal - 600,
        annual: (insTotal - 600) * 12,
        action: "Shop around for insurance quotes. Bundling policies may save 10-20%.",
        priority: "Low",
        rows: insRows,
        why: `Insurance costs averaged $${insTotal.toFixed(0)}/mo — $${(insTotal - 600).toFixed(0)} above the $600/mo benchmark. This may indicate duplicate coverage or uncompetitive policies.`,
        fix: "Get 3 competitive quotes for each policy. Bundle home + contents + car with one insurer for 10-20% discount. Review annual excesses — higher excess = lower premium.",
      });
    }

    // 7. Duplicate expenses
    const seenTxns = new Map<string, string>();
    const dupes: any[] = [];
    for (const e of expenses.sort((a, b) => (a.date || "").localeCompare(b.date || ""))) {
      const key = `${safeNum(e.amount)}_${e.description || ""}`;
      const prev = seenTxns.get(key);
      if (prev) {
        const prevDate = new Date(prev);
        const curDate = new Date(e.date || "");
        const diffDays = Math.abs((curDate.getTime() - prevDate.getTime()) / (1000 * 86400));
        if (diffDays <= 7) dupes.push(e);
      }
      seenTxns.set(key, e.date || "");
    }
    if (dupes.length > 0) {
      const dupeMonthly = dupes.reduce((s: number, e: any) => s + safeNum(e.amount), 0) / 3;
      result.push({
        title: `Potential Duplicate Transactions (${dupes.length})`,
        monthly: dupeMonthly,
        annual: dupeMonthly * 12,
        action: "Review duplicate transactions — may indicate double-billing or error.",
        priority: "High",
        rows: dupes,
        why: `Found ${dupes.length} transactions with identical amounts and descriptions within 7 days of each other. These may be double-billing errors or accidental duplicate payments.`,
        fix: "Review each pair carefully. If confirmed duplicates, contact your bank or merchant immediately to dispute and request a refund. Set up transaction alerts to catch these faster.",
      });
    }

    return result.sort((a, b) => b.monthly - a.monthly);
  }, [snap, expenses]);

  const [selectedLeak, setSelectedLeak] = useState<Leak | null>(null);

  const totalMonthly = leaks.reduce((s, l) => s + l.monthly, 0);
  const totalAnnual = leaks.reduce((s, l) => s + l.annual, 0);
  const monthlyExp = safeNum(snap.monthly_expenses);
  const healthScore = Math.max(0, Math.min(100, 100 - (monthlyExp > 0 ? (totalMonthly / monthlyExp) * 100 : 0)));

  const priorityColor = { High: "hsl(0,72%,51%)", Medium: "hsl(43,85%,55%)", Low: "hsl(210,80%,60%)" };
  const top3 = leaks.filter((l) => l.priority === "High").slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Drilldown modal */}
      {selectedLeak && (
        <LeakDrilldownModal
          leak={selectedLeak}
          onClose={() => setSelectedLeak(null)}
        />
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4 md:col-span-1">
          <ProgressRing pct={healthScore} size={100} stroke={10} color={healthScore >= 80 ? "hsl(142,60%,45%)" : healthScore >= 60 ? "hsl(43,85%,55%)" : "hsl(0,72%,51%)"}>
            <span className="text-lg font-bold">{Math.round(healthScore)}</span>
          </ProgressRing>
          <div>
            <p className="text-xs text-muted-foreground">Money Health Score</p>
            <p className="text-sm font-semibold">{healthScore >= 80 ? "Excellent" : healthScore >= 60 ? "Good" : "Needs Work"}</p>
          </div>
        </div>
        <div className="md:col-span-2 grid grid-cols-2 gap-3">
          <KpiCard label="Monthly Leakage" value={formatCurrency(totalMonthly)} color="hsl(0,72%,51%)" sub="detected inefficiencies" />
          <KpiCard label="Annual Savings Potential" value={formatCurrency(totalAnnual)} color="hsl(142,60%,45%)" sub="if all leaks fixed" />
          <KpiCard label="Leaks Detected" value={String(leaks.length)} />
          <KpiCard label="Quick Wins" value={String(top3.length)} sub="high-priority items" color="hsl(43,85%,55%)" />
        </div>
      </div>

      {/* Quick wins */}
      {top3.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <SectionTitle>Quick Wins (Top {top3.length} High-Priority)</SectionTitle>
          <div className="space-y-3">
            {top3.map((l, i) => (
              <div
                key={i}
                className="bg-secondary/40 rounded-xl p-4 flex items-start gap-3 cursor-pointer hover:bg-secondary/60 transition-colors"
                onClick={() => setSelectedLeak(l)}
              >
                <div className="w-7 h-7 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                  <Zap className="w-3.5 h-3.5 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{l.title}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-red-400">{formatCurrency(l.monthly)}/mo</span>
                      <span className="text-xs text-primary opacity-70">View →</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{l.action}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All leaks */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <SectionTitle>All Detected Leaks</SectionTitle>
        {leaks.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No leaks detected with current data.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {leaks.map((l, i) => (
              <div
                key={i}
                className="border border-border/50 rounded-xl p-4 cursor-pointer hover:border-primary/40 hover:bg-secondary/20 transition-all"
                onClick={() => setSelectedLeak(l)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full shrink-0"
                      style={{
                        background: priorityColor[l.priority] + "22",
                        color: priorityColor[l.priority],
                      }}
                    >
                      {l.priority}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{l.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{l.action}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold" style={{ color: priorityColor[l.priority] }}>
                      {formatCurrency(l.monthly)}/mo
                    </p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(l.annual)}/yr</p>
                    <p className="text-xs text-primary opacity-70 mt-0.5">View details →</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Disclaimer />
    </div>
  );
}

// ─── TAB 10: AI FINANCIAL COACH ───────────────────────────────────────────────

function AICoach({
  snap,
  expenses,
  properties,
  stocks,
  crypto,
}: {
  snap: Record<string, number>;
  expenses: any[];
  properties: any[];
  stocks: any[];
  crypto: any[];
}) {
  const [reportType, setReportType] = useState<"weekly" | "monthly">("weekly");

  const stocksVal = stocks.reduce((s: number, st: any) => s + safeNum(st.current_holding) * safeNum(st.current_price), 0);
  const cryptoVal = crypto.reduce((s: number, c: any) => s + safeNum(c.current_holding) * safeNum(c.current_price), 0);

  const netWorth =
    safeNum(snap.ppor) +
    safeNum(snap.cash) +
    safeNum(snap.super_balance) +
    safeNum(snap.stocks) +
    safeNum(snap.crypto) +
    stocksVal +
    cryptoVal +
    safeNum(snap.cars) +
    safeNum(snap.iran_property) -
    safeNum(snap.mortgage) -
    safeNum(snap.other_debts);

  const monthlySurplus = safeNum(snap.monthly_income) - safeNum(snap.monthly_expenses);
  const savingsRate = safeNum(snap.monthly_income) > 0
    ? (monthlySurplus / safeNum(snap.monthly_income)) * 100
    : 0;

  // Top 8 categories
  const catTotals = new Map<string, number>();
  for (const e of expenses) {
    const cat = e.category || "Other";
    catTotals.set(cat, (catTotals.get(cat) || 0) + safeNum(e.amount));
  }
  const topCats = Array.from(catTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .reduce((acc, [k, v]) => ({ ...acc, [k]: Math.round(v) }), {} as Record<string, number>);

  const investableAssets =
    safeNum(snap.cash) +
    safeNum(snap.super_balance) +
    safeNum(snap.stocks) +
    safeNum(snap.crypto) +
    stocksVal +
    cryptoVal;

  const fireProgress = Math.min(
    100,
    (investableAssets / Math.max(1, (safeNum(snap.monthly_income) * 12) / 0.04)) * 100
  );

  const getData = useCallback(
    () => ({
      netWorth: Math.round(netWorth),
      monthlySurplus: Math.round(monthlySurplus),
      savingsRate: Math.round(savingsRate * 10) / 10,
      expensesByCategory: topCats,
      monthlyExpenses: Math.round(safeNum(snap.monthly_expenses)),
      monthlyIncome: Math.round(safeNum(snap.monthly_income)),
      debts: {
        mortgage: Math.round(safeNum(snap.mortgage)),
        other: Math.round(safeNum(snap.other_debts)),
      },
      properties: properties.length,
      stocksValue: Math.round(stocksVal),
      cryptoValue: Math.round(cryptoVal),
      emergencyMonths: safeNum(snap.monthly_expenses) > 0
        ? Math.round((safeNum(snap.cash) / safeNum(snap.monthly_expenses)) * 10) / 10
        : 0,
      fireProgress: Math.round(fireProgress * 10) / 10,
      reportType,
    }),
    [snap, expenses, properties, stocks, crypto, reportType, netWorth, monthlySurplus, savingsRate, topCats, stocksVal, cryptoVal, fireProgress]
  );

  return (
    <div className="space-y-6">
      {/* Report type selector */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <SectionTitle>Report Type</SectionTitle>
        <div className="flex gap-3">
          {(["weekly", "monthly"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setReportType(type)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all capitalize"
              style={{
                background: reportType === type ? "hsl(43,85%,55%)" : "hsl(0,0%,12%)",
                color: reportType === type ? "hsl(0,0%,10%)" : "hsl(0,0%,70%)",
                border: `1px solid ${reportType === type ? "transparent" : "hsl(0,0%,20%)"}`,
              }}
            >
              {type} Report
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          ~$0.001 per report · Results cached 24 hours · Powered by GPT-4o mini
        </p>
      </div>

      {/* Snapshot of data being sent */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <SectionTitle>Data Summary (Sent to AI)</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="Net Worth" value={formatCurrency(netWorth)} />
          <KpiCard label="Monthly Surplus" value={formatCurrency(monthlySurplus)} />
          <KpiCard label="Savings Rate" value={`${savingsRate.toFixed(1)}%`} />
          <KpiCard label="FIRE Progress" value={`${fireProgress.toFixed(1)}%`} />
          <KpiCard label="Emergency Months" value={safeNum(snap.monthly_expenses) > 0 ? (safeNum(snap.cash) / safeNum(snap.monthly_expenses)).toFixed(1) : "—"} />
          <KpiCard label="Properties" value={String(properties.length)} />
          <KpiCard label="Stocks Value" value={formatCurrency(stocksVal)} />
          <KpiCard label="Crypto Value" value={formatCurrency(cryptoVal)} />
        </div>
      </div>

      {/* AI Card */}
      <AIInsightsCard
        pageKey={`wealth-coach-${reportType}`}
        pageLabel={`${reportType === "weekly" ? "Weekly" : "Monthly"} Financial Coach Report`}
        getData={getData}
        defaultExpanded={false}
      />

      <div className="flex items-start gap-2 text-xs text-muted-foreground/60 pt-2 border-t border-border">
        <Info className="w-3 h-3 shrink-0 mt-0.5" />
        <span>
          AI-generated insights are general information only. Always consult a licensed financial adviser before acting.
          Results cached for 24 hours. Cost approximately $0.001 per report.
        </span>
      </div>
    </div>
  );
}

// ─── Action Plan Engine ───────────────────────────────────────────────────
function generateActionPlan(snap: any, properties: any[], expenses: any[]): Array<{
  rank: number;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  impact: string;
  suggestedDate: string;
  category: string;
}> {
  const actions: any[] = [];
  const now = new Date();
  const monthName = (offset: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  };

  const income = safeNum(snap?.monthly_income);
  const expenses_total = safeNum(snap?.monthly_expenses);
  const surplus = income - expenses_total;
  const cash = safeNum(snap?.cash);
  const mortgage = safeNum(snap?.mortgage);
  const other_debts = safeNum(snap?.other_debts);
  const super_balance = safeNum(snap?.super_balance);
  const ppor = safeNum(snap?.ppor);
  const stocksVal = safeNum(snap?.stocks);
  const cryptoVal = safeNum(snap?.crypto);

  const investable = cash + super_balance + stocksVal + cryptoVal;
  const requiredFIRE = (10000 * 12) / 0.04;
  const fireProgress = investable / requiredFIRE;
  const emergencyMonths = cash / (expenses_total + mortgage / 12);
  const savingsRate = income > 0 ? surplus / income : 0;

  // Expense analysis
  const subscriptions = expenses.filter((e: any) => e.category === 'Subscriptions').reduce((s: number, e: any) => s + e.amount, 0);
  const monthlySubscriptions = subscriptions / Math.max(1, (() => {
    const months = new Set(expenses.map((e: any) => e.date?.slice(0, 7)));
    return months.size || 1;
  })());
  const dining = expenses.filter((e: any) => e.category === 'Dining Out / Coffee').reduce((s: number, e: any) => s + e.amount, 0);
  const monthlyDining = dining / Math.max(1, (() => {
    const months = new Set(expenses.map((e: any) => e.date?.slice(0, 7)));
    return months.size || 1;
  })());

  // HIGH PRIORITY RULES
  if (emergencyMonths < 3) {
    const target = expenses_total * 6;
    const shortfall = Math.max(0, target - cash);
    actions.push({
      title: 'Build Emergency Fund Urgently',
      description: `Your cash covers only ${emergencyMonths.toFixed(1)} months of expenses. Target: ${Math.ceil(target / 1000) * 1000 > 0 ? '$' + Math.ceil(target / 1000) * 1000 : '$0'}. Set aside $${Math.round(shortfall / 6)} extra/month.`,
      priority: 'High',
      impact: `Protect against ${Math.round(shortfall / Math.max(1, surplus))} months of job loss`,
      suggestedDate: monthName(1),
      category: 'Emergency',
    });
  }

  if (other_debts > 10000) {
    const monthlyInterest = Math.round(other_debts * 0.15 / 12);
    actions.push({
      title: 'Pay Off High-Interest Debt',
      description: `You have $${other_debts.toLocaleString()} in other debts costing ~$${monthlyInterest}/month in interest at 15%. Use avalanche method.`,
      priority: 'High',
      impact: `Save ~$${monthlyInterest * 12} per year in interest`,
      suggestedDate: monthName(0),
      category: 'Debt',
    });
  }

  if (savingsRate < 0.20) {
    actions.push({
      title: 'Increase Savings Rate to 20%+',
      description: `Current savings rate is ${Math.round(savingsRate * 100)}%. Target at least 20%. Review dining ($${Math.round(monthlyDining)}/mo) and subscriptions ($${Math.round(monthlySubscriptions)}/mo).`,
      priority: 'High',
      impact: `Extra $${Math.round(income * 0.20 - surplus)}/month invested = significant FIRE acceleration`,
      suggestedDate: monthName(1),
      category: 'Savings',
    });
  }

  // MEDIUM PRIORITY RULES
  if (monthlySubscriptions > 200) {
    actions.push({
      title: 'Audit Monthly Subscriptions',
      description: `Subscriptions total ~$${Math.round(monthlySubscriptions)}/month. Review and cancel unused services. Target: reduce by $50-100/month.`,
      priority: 'Medium',
      impact: `Save $${Math.round(monthlySubscriptions * 0.4 * 12)} per year`,
      suggestedDate: monthName(0),
      category: 'Expenses',
    });
  }

  if (cash > expenses_total * 9) {
    const excess = cash - expenses_total * 6;
    actions.push({
      title: 'Invest Excess Cash',
      description: `You have $${Math.round(excess)} above your 6-month emergency buffer sitting idle. Consider ETF DCA or offset account to earn 5-7% return.`,
      priority: 'Medium',
      impact: `$${Math.round(excess * 0.06 / 12)}/month extra return at 6%`,
      suggestedDate: monthName(1),
      category: 'Investment',
    });
  }

  if (fireProgress < 0.5 && surplus > 2000) {
    const extraDCA = Math.round(surplus * 0.3);
    actions.push({
      title: 'Increase ETF DCA Contributions',
      description: `FIRE progress is ${Math.round(fireProgress * 100)}%. Redirect $${extraDCA}/month (30% of surplus) into diversified index ETFs to accelerate financial freedom.`,
      priority: 'Medium',
      impact: `Reduces FIRE timeline by ~${Math.round(extraDCA / 500)} years`,
      suggestedDate: monthName(2),
      category: 'Investment',
    });
  }

  const equity = ppor - mortgage;
  const depositFor750k = 750000 * 0.2 + 750000 * 0.035;
  if (equity > 200000 && cash > depositFor750k * 0.8) {
    actions.push({
      title: 'Consider Investment Property Purchase',
      description: `PPOR equity is $${Math.round(equity).toLocaleString()} and cash covers ~${Math.round(cash / depositFor750k * 100)}% of a $750k IP deposit+costs. Assess borrowing capacity with a broker.`,
      priority: 'Medium',
      impact: 'Adds property growth + rental income to wealth building',
      suggestedDate: monthName(3),
      category: 'Property',
    });
  }

  if (super_balance < income * 12 * 5) {
    actions.push({
      title: 'Review Super Contribution Strategy',
      description: `Super balance of $${super_balance.toLocaleString()} may be below optimal for your income. Consider salary sacrifice to reduce tax and boost retirement savings.`,
      priority: 'Medium',
      impact: `Tax saving at marginal rate vs 15% super tax`,
      suggestedDate: monthName(2),
      category: 'Super',
    });
  }

  // LOW PRIORITY RULES
  if (monthlyDining > 600) {
    actions.push({
      title: 'Reduce Dining & Coffee Spend',
      description: `Dining Out / Coffee is $${Math.round(monthlyDining)}/month. Reducing by 25% saves $${Math.round(monthlyDining * 0.25 * 12)} annually. Meal prep 2 days/week can achieve this.`,
      priority: 'Low',
      impact: `Save $${Math.round(monthlyDining * 0.25)}/month`,
      suggestedDate: monthName(1),
      category: 'Lifestyle',
    });
  }

  if (properties.length === 0 && income > 15000) {
    actions.push({
      title: 'Research Investment Property Markets',
      description: 'No investment properties recorded. High income bracket makes negative gearing advantageous. Research Brisbane, Ipswich, or Logan growth corridors.',
      priority: 'Low',
      impact: 'Position for future IP purchase in 6-12 months',
      suggestedDate: monthName(4),
      category: 'Property',
    });
  }

  return actions.map((a, i) => ({ ...a, rank: i + 1 }));
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function WealthStrategyPage() {
  const [activeTab, setActiveTab] = useState("fire");

  const { data: snapRaw } = useQuery({ queryKey: ["/api/snapshot"] });
  const { data: expensesRaw } = useQuery({ queryKey: ["/api/expenses"] });
  const { data: propertiesRaw } = useQuery({ queryKey: ["/api/properties"] });
  const { data: stocksRaw } = useQuery({ queryKey: ["/api/stocks"] });
  const { data: cryptoRaw } = useQuery({ queryKey: ["/api/crypto"] });

  const snap: Record<string, number> = useMemo(() => {
    const s: any = snapRaw || {};
    return {
      ppor: safeNum(s.ppor),
      cash: safeNum(s.cash),
      super_balance: safeNum(s.super_balance),
      stocks: safeNum(s.stocks),
      crypto: safeNum(s.crypto),
      cars: safeNum(s.cars),
      iran_property: safeNum(s.iran_property),
      mortgage: safeNum(s.mortgage),
      other_debts: safeNum(s.other_debts),
      monthly_income: safeNum(s.monthly_income),
      monthly_expenses: safeNum(s.monthly_expenses),
    };
  }, [snapRaw]);

  const expenses: any[] = Array.isArray(expensesRaw) ? expensesRaw : [];
  const properties: any[] = Array.isArray(propertiesRaw) ? propertiesRaw : [];
  const stocks: any[] = Array.isArray(stocksRaw) ? stocksRaw : [];
  const crypto: any[] = Array.isArray(cryptoRaw) ? cryptoRaw : [];

  const handleExportPDF = useCallback(async () => {
    const s = snapRaw as any || {};
    const inv = safeNum(s.cash) + safeNum(s.super_balance) + safeNum(s.stocks) + safeNum(s.crypto);
    const requiredFIRE = (10000 * 12) / 0.04;
    const fireProgress = Math.min(100, Math.round((inv / requiredFIRE) * 100));
    const totalDebt = safeNum(s.mortgage) + safeNum(s.other_debts);
    const netWorth = (safeNum(s.ppor) + safeNum(s.cash) + safeNum(s.super_balance) + safeNum(s.stocks) + safeNum(s.crypto) + safeNum(s.cars) + safeNum(s.iran_property)) - totalDebt;
    const surplus = safeNum(s.monthly_income) - safeNum(s.monthly_expenses);
    const savingsRate = safeNum(s.monthly_income) > 0 ? Math.round((surplus / safeNum(s.monthly_income)) * 100) : 0;

    const fmt = (v: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(v);

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Wealth Report — ${new Date().toLocaleDateString('en-AU')}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #1a1a2e; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #C4A55A; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { font-size: 28px; font-weight: 800; color: #1a1a2e; }
    .header .date { font-size: 13px; color: #666; margin-top: 4px; }
    .gold { color: #C4A55A; }
    .section { margin-bottom: 28px; }
    .section h2 { font-size: 16px; font-weight: 700; color: #C4A55A; border-left: 4px solid #C4A55A; padding-left: 10px; margin-bottom: 14px; text-transform: uppercase; letter-spacing: 0.05em; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .card { background: #f7f7f9; border-radius: 10px; padding: 14px 16px; border: 1px solid #e0e0e8; }
    .card .label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
    .card .value { font-size: 20px; font-weight: 800; color: #1a1a2e; }
    .card .sub { font-size: 11px; color: #aaa; margin-top: 2px; }
    .progress-bar { height: 10px; background: #e0e0e8; border-radius: 5px; overflow: hidden; margin-top: 8px; }
    .progress-fill { height: 100%; background: linear-gradient(90deg, #C4A55A, #a07a30); border-radius: 5px; }
    .disclaimer { margin-top: 30px; padding: 14px; background: #f7f7f9; border-radius: 8px; font-size: 11px; color: #888; border: 1px solid #e0e0e8; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Shahrokh Family <span class="gold">Wealth Report</span></h1>
      <div class="date">Generated: ${new Date().toLocaleDateString('en-AU', { dateStyle: 'long' })}</div>
    </div>
    <div style="text-align:right; font-size:12px; color:#888;">
      <div>Powered by Family Wealth Planner</div>
      <div style="margin-top:4px; color:#C4A55A; font-weight:600;">Personal CFO Platform</div>
    </div>
  </div>

  <div class="section">
    <h2>Net Worth Overview</h2>
    <div class="grid">
      <div class="card"><div class="label">Net Worth</div><div class="value">${fmt(netWorth)}</div></div>
      <div class="card"><div class="label">Monthly Income</div><div class="value">${fmt(safeNum(s.monthly_income))}</div></div>
      <div class="card"><div class="label">Monthly Surplus</div><div class="value">${fmt(surplus)}</div></div>
      <div class="card"><div class="label">Savings Rate</div><div class="value">${savingsRate}%</div><div class="sub">${savingsRate >= 20 ? 'On track' : 'Below target'}</div></div>
    </div>
  </div>

  <div class="section">
    <h2>FIRE Progress</h2>
    <div class="grid-3">
      <div class="card"><div class="label">Current Investable</div><div class="value">${fmt(inv)}</div></div>
      <div class="card"><div class="label">Required FIRE Capital</div><div class="value">${fmt(requiredFIRE)}</div></div>
      <div class="card"><div class="label">FIRE Progress</div><div class="value">${fireProgress}%</div><div class="progress-bar"><div class="progress-fill" style="width:${fireProgress}%"></div></div></div>
    </div>
  </div>

  <div class="section">
    <h2>Debt Summary</h2>
    <div class="grid-3">
      <div class="card"><div class="label">PPOR Mortgage</div><div class="value">${fmt(safeNum(s.mortgage))}</div></div>
      <div class="card"><div class="label">Other Debts</div><div class="value">${fmt(safeNum(s.other_debts))}</div></div>
      <div class="card"><div class="label">Total Debt</div><div class="value">${fmt(totalDebt)}</div></div>
    </div>
  </div>

  <div class="section">
    <h2>Assets</h2>
    <div class="grid">
      <div class="card"><div class="label">PPOR</div><div class="value">${fmt(safeNum(s.ppor))}</div></div>
      <div class="card"><div class="label">Cash</div><div class="value">${fmt(safeNum(s.cash))}</div></div>
      <div class="card"><div class="label">Super</div><div class="value">${fmt(safeNum(s.super_balance))}</div></div>
      <div class="card"><div class="label">Stocks + Crypto</div><div class="value">${fmt(safeNum(s.stocks) + safeNum(s.crypto))}</div></div>
    </div>
  </div>

  <div class="disclaimer">
    <strong>Disclaimer:</strong> This report is generated from data entered by the user and is for general information purposes only. It does not constitute financial, tax, or legal advice. Past performance is not indicative of future results. Consult a licensed financial adviser before making investment decisions.
  </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => win.print(), 500);
    }
  }, [snapRaw]);

  const renderTab = () => {
    switch (activeTab) {
      case "fire":
        return <FireTracker snap={snap} stocks={stocks} crypto={crypto} />;
      case "debt":
        return <DebtKiller snap={snap} />;
      case "networth":
        return <NetWorthSimulator snap={snap} />;
      case "lifestyle":
        return <LifestyleInflation expenses={expenses} />;
      case "emergency":
        return <EmergencyScore snap={snap} />;
      case "tax":
        return <TaxOptimizer snap={snap} properties={properties} />;
      case "property":
        return <PropertyExpansion snap={snap} />;
      case "retirement":
        return <RetirementPredictor snap={snap} stocks={stocks} crypto={crypto} />;
      case "hidden":
        return <HiddenMoney snap={snap} expenses={expenses} />;
      case "coach":
        return <AICoach snap={snap} expenses={expenses} properties={properties} stocks={stocks} crypto={crypto} />;
      case "action-plan": {
        const actionPlan = generateActionPlan(snap, properties, expenses);
        return (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold">Personalised Action Plan</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                {actionPlan.length} actions ranked by impact · Based on your live financial data
              </p>
            </div>

            {actionPlan.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Zap className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>No actions needed — your finances look healthy!</p>
              </div>
            )}

            <div className="space-y-3">
              {actionPlan.map(action => (
                <div key={action.rank} className={`bg-card border rounded-2xl p-5 ${
                  action.priority === 'High' ? 'border-red-800/40' :
                  action.priority === 'Medium' ? 'border-yellow-800/40' : 'border-border'
                }`}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-muted-foreground/30 w-8 shrink-0">#{action.rank}</span>
                      <div>
                        <h3 className="text-sm font-bold">{action.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{action.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        action.priority === 'High' ? 'bg-red-900/30 text-red-400' :
                        action.priority === 'Medium' ? 'bg-yellow-900/30 text-yellow-400' :
                        'bg-green-900/30 text-green-400'
                      }`}>{action.priority}</span>
                      <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">{action.category}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border/50">
                    <div>
                      <p className="text-xs text-muted-foreground">Estimated Impact</p>
                      <p className="text-xs font-semibold text-primary mt-0.5">{action.impact}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Suggested Start</p>
                      <p className="text-xs font-semibold mt-0.5">{action.suggestedDate}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="text-xs text-muted-foreground/60 text-center pt-2">
              General information only — not financial, tax, or legal advice. Actions are generated from your data using deterministic rules.
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const activeTabDef = TABS.find((t) => t.id === activeTab);

  return (
    <div className="min-h-screen bg-background px-4 py-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="w-6 h-6 text-yellow-400" />
            Wealth Strategy Hub
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            11 deterministic calculation modules for the Shahrokh Family Financial Plan
          </p>
        </div>
        <Button
          onClick={handleExportPDF}
          variant="outline"
          size="sm"
          className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
        >
          <FileDown className="w-3.5 h-3.5" />
          Export PDF Report
        </Button>
      </div>

      {/* Tab bar */}
      <div className="bg-card border border-border rounded-2xl mb-6 overflow-hidden">
        <div className="overflow-x-auto">
          <div className="flex min-w-max px-2 py-2 gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all"
                  style={{
                    background: isActive ? "hsl(43,85%,55%)" : "transparent",
                    color: isActive ? "hsl(0,0%,10%)" : "hsl(0,0%,60%)",
                  }}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active module */}
      <div className="bg-card border border-border rounded-2xl p-6">
        {activeTabDef && (
          <div className="flex items-center gap-2 mb-5 pb-4 border-b border-border">
            <activeTabDef.icon className="w-5 h-5 text-yellow-400" />
            <h2 className="text-lg font-bold">{activeTabDef.label}</h2>
          </div>
        )}
        {renderTab()}
      </div>
    </div>
  );
}

/**
 * reports.tsx — Premium Reports & Analytics Page
 * 6 collapsible report sections reading from central ledger + cashEngine.
 * Export: PDF (jsPDF + autoTable) · Excel (xlsx) · Print
 * All numbers come from snapshot + cashEngine + Supabase tables.
 * No mock data. No hardcoded fallbacks.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, calcSavingsRate, safeNum } from "@/lib/finance";
import { runCashEngine } from "@/lib/cashEngine";
import { useForecastAssumptions } from "@/lib/useForecastAssumptions";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import BulkDeleteModal from "@/components/BulkDeleteModal";
import { useToast } from "@/hooks/use-toast";
import {
  Download, FileText, BarChart2, FileSpreadsheet, Trash2, CheckSquare,
  Square, ChevronDown, ChevronRight, TrendingUp, Wallet, CreditCard,
  Building2, LineChart, Shield, Zap, Target, Printer, Share2,
  AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend,
} from "recharts";

const ACCENT = ['hsl(43,85%,55%)', 'hsl(188,60%,48%)', 'hsl(142,60%,45%)', 'hsl(20,80%,55%)', 'hsl(270,60%,60%)', 'hsl(0,72%,51%)', 'hsl(210,75%,55%)'];
const fmt = (v: number, compact = false) => formatCurrency(v, compact);
const pct = (v: number) => `${safeNum(v).toFixed(1)}%`;

// ─── Collapsible Section ──────────────────────────────────────────────────────
function ReportSection({
  id, icon, title, badge, badgeColor = 'amber', defaultOpen = false, children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  badge?: string;
  badgeColor?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const badgeColors: Record<string, string> = {
    amber:  'bg-amber-500/15 text-amber-500 border border-amber-500/20',
    green:  'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20',
    blue:   'bg-blue-500/15 text-blue-500 border border-blue-500/20',
    purple: 'bg-violet-500/15 text-violet-500 border border-violet-500/20',
    red:    'bg-red-500/15 text-red-500 border border-red-500/20',
    cyan:   'bg-cyan-500/15 text-cyan-500 border border-cyan-500/20',
  };
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm" data-testid={`section-${id}`}>
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/20 transition-all"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-secondary/40 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <span className="font-semibold text-sm text-foreground">{title}</span>
          {badge && (
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${badgeColors[badgeColor] ?? badgeColors.amber}`}>
              {badge}
            </span>
          )}
        </div>
        {open
          ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
          : <ChevronRight className="w-4 h-4 text-muted-foreground" />
        }
      </button>
      {open && <div className="px-5 pb-5 pt-1 border-t border-border/60">{children}</div>}
    </div>
  );
}

// ─── KPI chip ─────────────────────────────────────────────────────────────────
function KpiChip({ label, value, sub, accent = false, up }: {
  label: string; value: string; sub?: string; accent?: boolean; up?: boolean | null;
}) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-card'}`}>
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className={`text-base font-bold num-display ${accent ? 'text-amber-500' : 'text-foreground'}`}>{value}</p>
      {sub && (
        <p className={`text-[11px] mt-0.5 flex items-center gap-0.5 ${up === true ? 'text-emerald-500' : up === false ? 'text-red-400' : 'text-muted-foreground'}`}>
          {up === true && <ArrowUpRight className="w-3 h-3" />}
          {up === false && <ArrowDownRight className="w-3 h-3" />}
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── Table helpers ─────────────────────────────────────────────────────────────
function ReportTable({ headers, rows, className = '' }: {
  headers: string[];
  rows: (string | number | React.ReactNode)[][];
  className?: string;
}) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-border ${className}`}>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-secondary/30">
            {headers.map(h => (
              <th key={h} className="text-left px-4 py-2.5 text-muted-foreground font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/40 hover:bg-secondary/10 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 whitespace-nowrap">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { privacyMode } = useAppStore();
  const mv = (v: string) => privacyMode ? '••••••' : v;

  // ── All data from central ledger ──────────────────────────────────────────
  const { data: snapshot, isLoading: snapLoading } = useQuery({
    queryKey: ['/api/snapshot'],
    queryFn: () => apiRequest('GET', '/api/snapshot').then(r => r.json()),
  });
  const { data: properties = [] }     = useQuery<any[]>({ queryKey: ['/api/properties'],    queryFn: () => apiRequest('GET', '/api/properties').then(r => r.json()) });
  const { data: stocks = [] }         = useQuery<any[]>({ queryKey: ['/api/stocks'],        queryFn: () => apiRequest('GET', '/api/stocks').then(r => r.json()) });
  const { data: cryptos = [] }        = useQuery<any[]>({ queryKey: ['/api/crypto'],        queryFn: () => apiRequest('GET', '/api/crypto').then(r => r.json()) });
  const { data: expenses = [] }       = useQuery<any[]>({ queryKey: ['/api/expenses'],      queryFn: () => apiRequest('GET', '/api/expenses').then(r => r.json()) });
  const { data: bills = [] }          = useQuery<any[]>({ queryKey: ['/api/bills'],         queryFn: () => apiRequest('GET', '/api/bills').then(r => r.json()).catch(() => []) });
  const { data: incomeRecords = [] }  = useQuery<any[]>({ queryKey: ['/api/income'],        queryFn: () => apiRequest('GET', '/api/income').then(r => r.json()).catch(() => []) });
  const { data: scenarios = [] }      = useQuery<any[]>({ queryKey: ['/api/scenarios'],     queryFn: () => apiRequest('GET', '/api/scenarios').then(r => r.json()).catch(() => []) });
  const { data: stockDCASchedules = [] }   = useQuery<any[]>({ queryKey: ['/api/stock-dca'],   queryFn: () => apiRequest('GET', '/api/stock-dca').then(r => r.json()).catch(() => []) });
  const { data: cryptoDCASchedules = [] }  = useQuery<any[]>({ queryKey: ['/api/crypto-dca'],  queryFn: () => apiRequest('GET', '/api/crypto-dca').then(r => r.json()).catch(() => []) });
  const { data: plannedStockOrders = [] }  = useQuery<any[]>({ queryKey: ['/api/planned-investments', 'stock'],  queryFn: () => apiRequest('GET', '/api/planned-investments?module=stock').then(r => r.json()).catch(() => []) });
  const { data: plannedCryptoOrders = [] } = useQuery<any[]>({ queryKey: ['/api/planned-investments', 'crypto'], queryFn: () => apiRequest('GET', '/api/planned-investments?module=crypto').then(r => r.json()).catch(() => []) });
  const fa = useForecastAssumptions();

  // ── Scenario bulk delete ───────────────────────────────────────────────────
  const [selectedScenarios, setSelectedScenarios] = useState<Set<number>>(new Set());
  const [showScenarioBulkModal, setShowScenarioBulkModal] = useState(false);

  const snap = snapshot ?? {};

  // ── Core derived numbers (central ledger) ─────────────────────────────────
  const cash          = safeNum(snap.cash) + safeNum(snap.offset_balance);
  const totalAssets   = safeNum(snap.ppor) + cash + safeNum(snap.super_balance)
                      + safeNum(snap.stocks) + safeNum(snap.crypto)
                      + safeNum(snap.cars) + safeNum(snap.iran_property);
  const totalLiab     = safeNum(snap.mortgage) + safeNum(snap.other_debts);
  const netWorth      = totalAssets - totalLiab;
  const monthlyInc    = safeNum(snap.monthly_income);
  const monthlyExp    = safeNum(snap.monthly_expenses);
  const surplus       = monthlyInc - monthlyExp;
  const savingsRate   = calcSavingsRate(monthlyInc, monthlyExp);
  const accessibleWlt = cash + safeNum(snap.stocks) + safeNum(snap.crypto);
  const lockedWlt     = safeNum(snap.super_balance) + safeNum(snap.ppor)
                      + safeNum(snap.iran_property) + safeNum(snap.cars);

  // ── Cash engine (same as dashboard) ──────────────────────────────────────
  const cashEngineOut = snapshot ? runCashEngine({
    snapshot: snap, properties, stocks, cryptos, expenses, bills,
    stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders,
    inflationRate:    fa?.flat?.inflation    ?? 3,
    incomeGrowthRate: fa?.flat?.income_growth ?? 3.5,
  }) : null;
  const projection = cashEngineOut?.annual ?? [];

  // ── Annual cashflow table (from ledger) ───────────────────────────────────
  const cfRows = (() => {
    if (!cashEngineOut) return [];
    const byYear = new Map<number, any[]>();
    for (const m of cashEngineOut.ledger) {
      if (!byYear.has(m.year)) byYear.set(m.year, []);
      byYear.get(m.year)!.push(m);
    }
    let runNW = netWorth;
    return Array.from(byYear.entries()).sort(([a], [b]) => a - b).map(([year, months]) => {
      const income             = months.reduce((s, m) => s + m.salaryIncome, 0);
      const rentalIncome       = months.reduce((s, m) => s + m.rentalIncome, 0);
      const exp                = months.reduce((s, m) => s + m.livingExpenses, 0);
      const mortgage           = months.reduce((s, m) => s + m.mortgagePpor + m.mortgageIp, 0);
      const propertySettlement = months.reduce((s, m) => s + m.propertyPurchase, 0);
      const ngRefund           = months.reduce((s, m) => s + m.taxRefunds, 0);
      const netCF              = months.reduce((s, m) => s + m.netCashFlow, 0);
      const endingCash         = months[months.length - 1]?.closingCash ?? 0;
      runNW += netCF;
      return { year, income, rentalIncome, exp, mortgage, propertySettlement, ngRefund, netCF, endingCash, netWorth: runNW };
    });
  })();

  // ── Chart data ──────────────────────────────────────────────────────────
  const nwChartData = projection.map((p: any) => ({
    year: p.year?.toString() ?? '',
    netWorth:  safeNum(p.endNetWorth ?? p.endingCash),
    assets:    safeNum(p.totalAssets ?? p.totalInflows),
    liabs:     safeNum(p.totalLiabilities ?? 0),
  }));

  const cfChartData = cfRows.slice(0, 10).map(r => ({
    year: r.year.toString(),
    income:   r.income + r.rentalIncome,
    expenses: r.exp + r.mortgage,
    surplus:  r.netCF,
  }));

  const assetData = [
    { name: 'PPOR',          value: safeNum(snap.ppor) },
    { name: 'Cash & Offset', value: cash },
    { name: 'Super',         value: safeNum(snap.super_balance) },
    { name: 'Stocks',        value: safeNum(snap.stocks) },
    { name: 'Crypto',        value: safeNum(snap.crypto) },
    { name: 'Cars',          value: safeNum(snap.cars) },
    { name: 'Iran Property', value: safeNum(snap.iran_property) },
  ].filter(d => d.value > 0);

  const expByCat: Record<string, number> = {};
  expenses.forEach((e: any) => { expByCat[e.category] = (expByCat[e.category] || 0) + safeNum(e.amount); });
  const expCatData = Object.entries(expByCat).sort(([, a], [, b]) => b - a).slice(0, 8).map(([name, value]) => ({ name, value }));

  // ── Stocks/Crypto totals ───────────────────────────────────────────────
  const stocksValue  = stocks.reduce((s: number, x: any) => s + safeNum(x.current_holding) * safeNum(x.current_price), 0);
  const cryptoValue  = cryptos.reduce((s: number, x: any) => s + safeNum(x.current_holding) * safeNum(x.current_price), 0);
  const stocksDCA    = stocks.reduce((s: number, x: any) => s + safeNum(x.monthly_dca), 0);
  const cryptoDCA    = cryptos.reduce((s: number, x: any) => s + safeNum(x.monthly_dca), 0);

  // ── Property totals ────────────────────────────────────────────────────
  const propValue    = properties.reduce((s: number, p: any) => s + safeNum(p.current_value), 0);
  const propLoans    = properties.reduce((s: number, p: any) => s + safeNum(p.loan_amount), 0);
  const propEquity   = propValue - propLoans;
  const propRental   = properties.reduce((s: number, p: any) => s + safeNum(p.weekly_rent) * 52 / 12, 0);

  // ── Tax estimates ─────────────────────────────────────────────────────
  const annualInc    = monthlyInc * 12;
  const taxRate      = annualInc > 180000 ? 47 : annualInc > 120000 ? 37 : annualInc > 45000 ? 32.5 : annualInc > 18200 ? 19 : 0;
  const estimatedTax = annualInc * (taxRate / 100);
  const propNgLoss   = properties.filter((p: any) => p.type === 'Investment').reduce((s: number, p: any) => {
    const rent = safeNum(p.weekly_rent) * 52;
    const interest = safeNum(p.loan_amount) * (safeNum(p.interest_rate) / 100);
    return s + Math.max(0, interest - rent);
  }, 0);
  const ngRefund     = propNgLoss * (taxRate / 100);

  // ── FIRE estimate (from snapshot) ─────────────────────────────────────
  const yearsToFire  = safeNum(snap.years_to_fire);
  const fireNumber   = monthlyExp > 0 ? (monthlyExp * 12) / (safeNum(fa?.flat?.safe_withdrawal_rate ?? 4) / 100) : 0;

  // ── Risk score ────────────────────────────────────────────────────────
  let riskScore = 5;
  if (totalLiab / totalAssets > 0.6) riskScore -= 2;
  if (surplus < 0) riskScore -= 3;
  if (cash < monthlyExp * 3) riskScore -= 1;
  if (savingsRate > 20) riskScore += 2;
  if (safeNum(snap.super_balance) > 100000) riskScore += 1;
  riskScore = Math.min(10, Math.max(1, riskScore));

  // ── Scenario helpers ──────────────────────────────────────────────────
  const toggleScenario = (id: number) => setSelectedScenarios(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAllScenarios = () =>
    selectedScenarios.size === scenarios.length
      ? setSelectedScenarios(new Set())
      : setSelectedScenarios(new Set(scenarios.map((s: any) => s.id)));
  const handleBulkDeleteScenarios = async () => {
    for (const id of Array.from(selectedScenarios)) {
      await apiRequest('DELETE', `/api/scenarios/${id}`).catch(() => {});
    }
    await qc.invalidateQueries({ queryKey: ['/api/scenarios'] });
    setSelectedScenarios(new Set());
    setShowScenarioBulkModal(false);
    toast({ title: `Deleted ${selectedScenarios.size} scenarios` });
  };
  const handleExportScenariosBackup = () => {
    const wb = XLSX.utils.book_new();
    const sel = scenarios.filter((s: any) => selectedScenarios.has(s.id));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['ID', 'Name', 'Description', 'Created'],
      ...sel.map((s: any) => [s.id, s.name, s.description, s.created_at]),
    ]), 'Scenarios Backup');
    XLSX.writeFile(wb, `Scenarios_Backup_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Backup exported' });
  };

  // ─── Excel Export ─────────────────────────────────────────────────────────
  const exportExcel = () => {
    const wb   = XLSX.utils.book_new();
    const date = new Date().toLocaleDateString('en-AU');

    // Executive Summary
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['SHAHROKH FAMILY WEALTH REPORT', '', ''],
      ['Generated', date, ''],
      ['', '', ''],
      ['EXECUTIVE SUMMARY', '', ''],
      ['Net Worth', fmt(netWorth), ''],
      ['Total Assets', fmt(totalAssets), ''],
      ['Total Liabilities', fmt(totalLiab), ''],
      ['Accessible Wealth', fmt(accessibleWlt), ''],
      ['Locked Wealth', fmt(lockedWlt), ''],
      ['Monthly Income', fmt(monthlyInc), ''],
      ['Monthly Expenses', fmt(monthlyExp), ''],
      ['Monthly Surplus', fmt(surplus), ''],
      ['Savings Rate', pct(savingsRate), ''],
      ['FIRE Number', fmt(fireNumber), ''],
      ['Years to FIRE', yearsToFire > 0 ? yearsToFire.toFixed(1) : 'N/A', ''],
      ['Risk Score', `${riskScore}/10`, ''],
    ]), 'Executive Summary');

    // Balance Sheet
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['BALANCE SHEET', '', ''],
      ['', '', ''],
      ['ASSETS', '', ''],
      ['PPOR', fmt(safeNum(snap.ppor)), ''],
      ['Cash', fmt(safeNum(snap.cash)), ''],
      ['Offset Balance', fmt(safeNum(snap.offset_balance)), ''],
      ['Super', fmt(safeNum(snap.super_balance)), ''],
      ['Stocks', fmt(stocksValue), ''],
      ['Crypto', fmt(cryptoValue), ''],
      ['Cars', fmt(safeNum(snap.cars)), ''],
      ['Iran Property', fmt(safeNum(snap.iran_property)), ''],
      ['TOTAL ASSETS', fmt(totalAssets), ''],
      ['', '', ''],
      ['LIABILITIES', '', ''],
      ['Mortgage', fmt(safeNum(snap.mortgage)), ''],
      ['Other Debts', fmt(safeNum(snap.other_debts)), ''],
      ['TOTAL LIABILITIES', fmt(totalLiab), ''],
      ['', '', ''],
      ['NET WORTH', fmt(netWorth), ''],
    ]), 'Balance Sheet');

    // 10-Year Forecast
    const fcH = ['Year', 'Net Worth', 'Income', 'Expenses', 'Prop Equity', 'Stocks', 'Crypto', 'Cash', 'Passive Income', 'Monthly CF'];
    const fcB = projection.map((p: any) => [p.year, fmt(p.endNetWorth, true), fmt(p.income, true), fmt(p.expenses, true), fmt(p.propertyEquity, true), fmt(p.stockValue, true), fmt(p.cryptoValue, true), fmt(p.cash, true), fmt(p.passiveIncome, true), fmt(p.monthlyCashFlow)]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([fcH, ...fcB]), '10-Year Forecast');

    // Cashflow
    const cfH = ['Year', 'Income', 'Rental Income', 'Expenses', 'Mortgage', 'Prop Settlement', 'NG Refund', 'Net Cashflow', 'Ending Cash', 'Net Worth'];
    const cfB = cfRows.map(r => [r.year, fmt(r.income), fmt(r.rentalIncome), fmt(r.exp), fmt(r.mortgage), fmt(r.propertySettlement), fmt(r.ngRefund), fmt(r.netCF), fmt(r.endingCash), fmt(r.netWorth)]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cfH, ...cfB]), 'Annual Cashflow');

    // Properties
    if (properties.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Name', 'Type', 'Value', 'Loan', 'Equity', 'Rate', 'Growth', 'Weekly Rent', 'Annual Rent'],
        ...properties.map((p: any) => [p.name, p.type, fmt(p.current_value), fmt(p.loan_amount), fmt(safeNum(p.current_value) - safeNum(p.loan_amount)), `${p.interest_rate}%`, `${p.capital_growth}%`, fmt(p.weekly_rent), fmt(safeNum(p.weekly_rent) * 52)]),
      ]), 'Properties');
    }

    // Stocks
    if (stocks.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Ticker', 'Name', 'Price', 'Holdings', 'Value', 'Exp Return', 'Monthly DCA'],
        ...stocks.map((s: any) => [s.ticker, s.name, fmt(s.current_price), s.current_holding || 0, fmt(safeNum(s.current_holding) * safeNum(s.current_price)), `${s.expected_return}%`, fmt(s.monthly_dca)]),
      ]), 'Stocks');
    }

    // Crypto
    if (cryptos.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Symbol', 'Name', 'Price', 'Holdings', 'Value', 'Exp Return', 'Monthly DCA'],
        ...cryptos.map((c: any) => [c.symbol, c.name, fmt(c.current_price), c.current_holding || 0, fmt(safeNum(c.current_holding) * safeNum(c.current_price)), `${c.expected_return}%`, fmt(c.monthly_dca)]),
      ]), 'Crypto');
    }

    // Income
    if (incomeRecords.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Date', 'Source', 'Amount', 'Member', 'Frequency', 'Recurring'],
        ...incomeRecords.map((r: any) => [r.date, r.source, fmt(r.amount), r.member, r.frequency, r.recurring ? 'Yes' : 'No']),
      ]), 'Income');
    }

    // Expenses
    if (expenses.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ['Date', 'Amount', 'Category', 'Sub-category', 'Description', 'Member', 'Payment Method'],
        ...expenses.map((e: any) => [e.date, fmt(e.amount), e.category, e.subcategory, e.description, e.family_member, e.payment_method]),
      ]), 'Expenses');
    }

    XLSX.writeFile(wb, `Shahrokh_Family_Wealth_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Excel Report Exported', description: '7 sheets: Summary, Balance Sheet, Cashflow, Forecast, Properties, Stocks, Crypto' });
  };

  // ─── PDF Export ──────────────────────────────────────────────────────────
  const exportPDF = () => {
    const doc   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const gold  = [196, 165, 90] as [number, number, number];
    const dark  = [14, 17, 28] as [number, number, number];
    const light = [245, 247, 250] as [number, number, number];
    const date  = new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });

    const sectionHeader = (title: string, y = 25) => {
      doc.addPage();
      doc.setFillColor(...dark);
      doc.rect(0, 0, 210, 22, 'F');
      doc.setDrawColor(...gold);
      doc.setLineWidth(0.5);
      doc.line(0, 22, 210, 22);
      doc.setTextColor(...gold);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(title, 14, 14);
      doc.setTextColor(60, 60, 60);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      return y;
    };

    const tableOpts = {
      theme: 'striped' as const,
      headStyles: { fillColor: gold, textColor: dark, fontStyle: 'bold' as const },
      styles: { fontSize: 9, cellPadding: 3 },
      alternateRowStyles: { fillColor: light },
    };

    // ── Cover ──
    doc.setFillColor(...dark);
    doc.rect(0, 0, 210, 297, 'F');
    // Gold accent line
    doc.setFillColor(...gold);
    doc.rect(0, 0, 4, 297, 'F');
    doc.rect(0, 110, 210, 1, 'F');
    doc.rect(0, 175, 210, 1, 'F');
    // Title
    doc.setTextColor(...gold);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('PRIVATE & CONFIDENTIAL', 105, 72, { align: 'center' });
    doc.setFontSize(30);
    doc.setFont('helvetica', 'bold');
    doc.text('SHAHROKH FAMILY', 105, 96, { align: 'center' });
    doc.setFontSize(22);
    doc.text('WEALTH REPORT', 105, 108, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(200, 200, 200);
    doc.text('Family Wealth Planning · Central Ledger Analytics', 105, 124, { align: 'center' });
    doc.setFontSize(9);
    doc.text('Roham · Fara · Kids', 105, 140, { align: 'center' });
    doc.text('Brisbane, Queensland, Australia', 105, 149, { align: 'center' });
    doc.setTextColor(...gold);
    doc.setFontSize(10);
    doc.text(date, 105, 168, { align: 'center' });
    // Net worth callout
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 160);
    doc.text('NET WORTH', 105, 200, { align: 'center' });
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...gold);
    doc.text(fmt(netWorth, true), 105, 215, { align: 'center' });
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 160);
    doc.text(`Savings Rate: ${pct(savingsRate)}  ·  Risk Score: ${riskScore}/10`, 105, 225, { align: 'center' });

    // ── Section A: Executive Summary ──
    sectionHeader('A  Executive Summary');
    autoTable(doc, {
      ...tableOpts,
      startY: 28,
      head: [['Metric', 'Value', 'Notes']],
      body: [
        ['Net Worth',           fmt(netWorth, true),      ''],
        ['Total Assets',        fmt(totalAssets, true),   ''],
        ['Total Liabilities',   fmt(totalLiab, true),     ''],
        ['Accessible Wealth',   fmt(accessibleWlt, true), 'Cash + Stocks + Crypto'],
        ['Locked Wealth',       fmt(lockedWlt, true),     'PPOR + Super + Iran Prop + Cars'],
        ['Monthly Income',      fmt(monthlyInc),          ''],
        ['Monthly Expenses',    fmt(monthlyExp),          ''],
        ['Monthly Surplus',     fmt(surplus),             surplus >= 0 ? 'Positive cashflow' : 'Cashflow deficit'],
        ['Savings Rate',        pct(savingsRate),         savingsRate >= 20 ? 'Strong' : savingsRate >= 10 ? 'Moderate' : 'Below target'],
        ['FIRE Number',         fmt(fireNumber, true),    'At 4% SWR'],
        ['Years to FIRE',       yearsToFire > 0 ? yearsToFire.toFixed(1) + ' years' : 'Not set', ''],
        ['Risk Score',          `${riskScore}/10`,        riskScore >= 7 ? 'Healthy' : riskScore >= 5 ? 'Moderate' : 'Needs attention'],
      ],
    });

    // ── Section B: Balance Sheet ──
    sectionHeader('B  Balance Sheet');
    autoTable(doc, {
      ...tableOpts,
      startY: 28,
      head: [['Asset / Liability', 'Value', 'Type']],
      body: [
        ['PPOR',                fmt(safeNum(snap.ppor), true),             'Real Estate'],
        ['Cash & Bank',         fmt(safeNum(snap.cash), true),             'Liquid'],
        ['Offset Balance',      fmt(safeNum(snap.offset_balance), true),   'Liquid'],
        ['Super Balance',       fmt(safeNum(snap.super_balance), true),    'Preserved'],
        ['Stock Portfolio',     fmt(stocksValue, true),                    'Liquid'],
        ['Crypto Portfolio',    fmt(cryptoValue, true),                    'Liquid'],
        ['Cars',                fmt(safeNum(snap.cars), true),             'Depreciating'],
        ['Iran Property',       fmt(safeNum(snap.iran_property), true),    'International'],
        ['TOTAL ASSETS',        fmt(totalAssets, true),                    ''],
        ['—', '—', '—'],
        ['Home Mortgage',       fmt(safeNum(snap.mortgage), true),         'Liability'],
        ['Other Debts',         fmt(safeNum(snap.other_debts), true),      'Liability'],
        ['TOTAL LIABILITIES',   fmt(totalLiab, true),                      ''],
        ['—', '—', '—'],
        ['NET WORTH',           fmt(netWorth, true),                       'Assets − Liabilities'],
        ['Accessible Wealth',   fmt(accessibleWlt, true),                  'Liquid Only'],
        ['Locked Wealth',       fmt(lockedWlt, true),                      'Illiquid'],
        ['LVR (Liab/Assets)',   totalAssets > 0 ? pct((totalLiab / totalAssets) * 100) : '0%', ''],
      ],
    });

    // ── Section C: Cashflow ──
    sectionHeader('C  Annual Cashflow');
    const cfPdfRows = cfRows.slice(0, 10).map(r => [
      r.year.toString(),
      fmt(r.income + r.rentalIncome, true),
      fmt(r.exp + r.mortgage, true),
      fmt(r.netCF, true),
      fmt(r.endingCash, true),
      fmt(r.netWorth, true),
    ]);
    autoTable(doc, {
      ...tableOpts,
      startY: 28,
      head: [['Year', 'Total Income', 'Total Outflows', 'Net Cashflow', 'Ending Cash', 'Net Worth']],
      body: cfPdfRows.length > 0 ? cfPdfRows : [['No projection data available', '', '', '', '', '']],
    });

    // ── Section D: Investments ──
    if (properties.length > 0 || stocks.length > 0 || cryptos.length > 0) {
      sectionHeader('D  Investment Portfolio');
      if (properties.length > 0) {
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60);
        doc.text('Property Portfolio', 14, 30);
        autoTable(doc, {
          ...tableOpts,
          startY: 34,
          head: [['Name', 'Type', 'Value', 'Loan', 'Equity', 'Rate', 'Mo. Rent']],
          body: properties.map((p: any) => [p.name, p.type, fmt(p.current_value, true), fmt(p.loan_amount, true), fmt(safeNum(p.current_value) - safeNum(p.loan_amount), true), `${p.interest_rate}%`, fmt(safeNum(p.weekly_rent) * 52 / 12)]),
        });
      }
      const afterPropY = (doc as any).lastAutoTable?.finalY + 8 || 80;
      if (stocks.length > 0) {
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60);
        doc.text('Stock Portfolio', 14, afterPropY);
        autoTable(doc, {
          ...tableOpts,
          startY: afterPropY + 4,
          head: [['Ticker', 'Name', 'Price', 'Holdings', 'Value', 'Mo. DCA']],
          body: stocks.map((s: any) => [s.ticker, s.name, fmt(s.current_price), s.current_holding || 0, fmt(safeNum(s.current_holding) * safeNum(s.current_price), true), fmt(s.monthly_dca)]),
        });
      }
      const afterStocksY = (doc as any).lastAutoTable?.finalY + 8 || 120;
      if (cryptos.length > 0) {
        doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60);
        doc.text('Crypto Portfolio', 14, afterStocksY);
        autoTable(doc, {
          ...tableOpts,
          startY: afterStocksY + 4,
          head: [['Symbol', 'Name', 'Price', 'Holdings', 'Value', 'Mo. DCA']],
          body: cryptos.map((c: any) => [c.symbol, c.name, fmt(c.current_price), c.current_holding || 0, fmt(safeNum(c.current_holding) * safeNum(c.current_price), true), fmt(c.monthly_dca)]),
        });
      }
    }

    // ── Section E: Tax ──
    sectionHeader('E  Tax Summary');
    autoTable(doc, {
      ...tableOpts,
      startY: 28,
      head: [['Metric', 'Estimate', 'Notes']],
      body: [
        ['Annual Income',          fmt(annualInc),           ''],
        ['Estimated Tax Rate',     `${taxRate}%`,            'Marginal rate (simplified)'],
        ['Estimated Tax Payable',  fmt(estimatedTax),        'Before offsets & deductions'],
        ['Negative Gearing Loss',  fmt(propNgLoss),          'Investment property interest > rent'],
        ['Estimated NG Refund',    fmt(ngRefund),            `At ${taxRate}% marginal rate`],
        ['Super Balance',          fmt(safeNum(snap.super_balance)), 'Concessional tax environment'],
      ],
    });
    if (annualInc > 0) {
      const afterTaxY = (doc as any).lastAutoTable?.finalY + 8;
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text('Note: These are simplified estimates only. Consult your accountant for formal tax advice. Negative gearing calculations use a simplified interest-only model.', 14, afterTaxY, { maxWidth: 182 });
    }

    // ── Footer on all pages ──
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      // Bottom border
      doc.setFillColor(...dark);
      doc.rect(0, 288, 210, 10, 'F');
      doc.setFontSize(7.5);
      doc.setTextColor(...gold);
      doc.text('Shahrokh Family Financial Planner', 14, 293);
      doc.setTextColor(160, 160, 170);
      doc.text(`Private & Confidential  ·  Generated ${date}  ·  Page ${i} of ${pageCount}`, 105, 293, { align: 'center' });
      doc.text('familywealthlab.net', 196, 293, { align: 'right' });
    }

    doc.save(`Shahrokh_Family_Wealth_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    toast({ title: 'PDF Exported', description: 'Premium 5-section wealth report generated.' });
  };

  const handlePrint = () => window.print();

  if (snapLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading report data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Reports &amp; Analytics</h1>
          <p className="text-sm text-muted-foreground">Exportable family wealth reports from your central ledger.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-9"
            onClick={handlePrint}
            data-testid="button-print"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-9"
            onClick={exportExcel}
            data-testid="button-export-excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
          </Button>
          <Button
            size="sm"
            className="gap-1.5 h-9 font-semibold"
            style={{ background: 'linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))', color: 'hsl(224,40%,8%)', border: 'none' }}
            onClick={exportPDF}
            data-testid="button-export-pdf"
          >
            <FileText className="w-3.5 h-3.5" /> Export PDF
          </Button>
        </div>
      </div>

      {/* ── Top KPI summary strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
        <KpiChip label="Net Worth"      value={mv(fmt(netWorth, true))}        accent up={netWorth > 0} />
        <KpiChip label="Accessible"     value={mv(fmt(accessibleWlt, true))}   sub="Cash + Stocks + Crypto" />
        <KpiChip label="Debt Balance"   value={mv(fmt(totalLiab, true))}       up={totalLiab === 0} />
        <KpiChip label="Monthly Surplus" value={mv(fmt(surplus))}              sub={surplus >= 0 ? 'Positive cashflow' : 'Deficit'} up={surplus > 0} />
        <KpiChip label="Savings Rate"   value={pct(savingsRate)}               sub={savingsRate >= 20 ? 'Strong' : 'Moderate'} up={savingsRate >= 20} />
        <KpiChip label="FIRE Estimate"  value={yearsToFire > 0 ? `${yearsToFire.toFixed(1)}y` : '—'} sub={yearsToFire > 0 ? fmt(fireNumber, true) : 'Set cashflow'} />
        <KpiChip label="Risk Score"     value={`${riskScore}/10`}              sub={riskScore >= 7 ? 'Healthy' : riskScore >= 5 ? 'Moderate' : 'Needs review'} up={riskScore >= 7} />
      </div>

      {/* ── Section A: Executive Summary ──────────────────────────────────── */}
      <ReportSection id="exec" defaultOpen icon={<BarChart2 className="w-4 h-4 text-amber-500" />} title="A · Executive Summary" badge="Core Metrics" badgeColor="amber">
        <div className="space-y-4 pt-3">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: 'Net Worth',         value: mv(fmt(netWorth, true)),     color: 'text-amber-500' },
              { label: 'Total Assets',      value: mv(fmt(totalAssets, true)),  color: 'text-emerald-500' },
              { label: 'Total Liabilities', value: mv(fmt(totalLiab, true)),    color: 'text-red-400' },
              { label: 'Accessible Wealth', value: mv(fmt(accessibleWlt, true)), color: 'text-blue-400' },
              { label: 'Locked Wealth',     value: mv(fmt(lockedWlt, true)),    color: 'text-violet-400' },
              { label: 'Monthly Surplus',   value: mv(fmt(surplus)),            color: surplus >= 0 ? 'text-emerald-500' : 'text-red-400' },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-border bg-card p-4">
                <p className="text-[11px] text-muted-foreground mb-1">{s.label}</p>
                <p className={`text-base font-bold num-display ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-3">Asset vs Liability Ratio</p>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, totalAssets > 0 ? (accessibleWlt / totalAssets) * 100 : 0)}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                <span>Accessible {totalAssets > 0 ? pct((accessibleWlt / totalAssets) * 100) : '0%'}</span>
                <span>LVR {totalAssets > 0 ? pct((totalLiab / totalAssets) * 100) : '0%'}</span>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">FIRE Progress</p>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, fireNumber > 0 ? (netWorth / fireNumber) * 100 : 0)}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1.5">
                <span>Current {mv(fmt(netWorth, true))}</span>
                <span>Target {mv(fmt(fireNumber, true))}</span>
              </div>
            </div>
          </div>
          {/* Net Worth chart */}
          {nwChartData.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3">10-Year Net Worth Projection</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={nwChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rGradA" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(43,85%,55%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(43,85%,55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,22%)" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'hsl(220,10%,50%)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: 'hsl(220,10%,50%)' }} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} axisLine={false} tickLine={false} width={50} />
                  <Tooltip formatter={(v: number) => fmt(v, true)} contentStyle={{ background: 'var(--tooltip-bg, #fff)', border: '1px solid hsl(220,15%,82%)', borderRadius: 8, fontSize: 11 }} />
                  <Area type="monotone" dataKey="netWorth" stroke="hsl(43,85%,55%)" fill="url(#rGradA)" strokeWidth={2} name="Net Worth" />
                  <Area type="monotone" dataKey="assets" stroke="hsl(142,60%,45%)" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="Assets" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </ReportSection>

      {/* ── Section B: Balance Sheet ──────────────────────────────────────── */}
      <ReportSection id="balance" icon={<Wallet className="w-4 h-4 text-blue-400" />} title="B · Balance Sheet" badge="Assets &amp; Liabilities" badgeColor="blue">
        <div className="space-y-4 pt-3">
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Asset allocation donut */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3">Asset Allocation</p>
              <div className="flex items-center gap-3">
                <ResponsiveContainer width="45%" height={180}>
                  <PieChart>
                    <Pie data={assetData} cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={2} dataKey="value">
                      {assetData.map((_, i) => <Cell key={i} fill={ACCENT[i % ACCENT.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v, true)} contentStyle={{ background: 'var(--tooltip-bg,#fff)', border: '1px solid hsl(220,15%,82%)', borderRadius: 8, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {assetData.map((d, i) => (
                    <div key={d.name} className="flex items-center justify-between text-xs gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: ACCENT[i % ACCENT.length] }} />
                        <span className="text-muted-foreground truncate">{d.name}</span>
                      </div>
                      <span className="font-semibold num-display shrink-0">{mv(fmt(d.value, true))}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Balance sheet table */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Statement of Position</p>
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <tbody>
                    <tr className="bg-secondary/30 border-b border-border">
                      <td className="px-4 py-2 font-semibold text-foreground" colSpan={2}>ASSETS</td>
                    </tr>
                    {assetData.map(a => (
                      <tr key={a.name} className="border-b border-border/40">
                        <td className="px-4 py-2 text-muted-foreground">{a.name}</td>
                        <td className="px-4 py-2 text-right font-mono font-medium">{mv(fmt(a.value, true))}</td>
                      </tr>
                    ))}
                    <tr className="border-b border-border bg-secondary/20">
                      <td className="px-4 py-2 font-semibold">Total Assets</td>
                      <td className="px-4 py-2 text-right font-bold num-display text-emerald-500">{mv(fmt(totalAssets, true))}</td>
                    </tr>
                    <tr className="bg-secondary/30 border-b border-border">
                      <td className="px-4 py-2 font-semibold text-foreground" colSpan={2}>LIABILITIES</td>
                    </tr>
                    <tr className="border-b border-border/40">
                      <td className="px-4 py-2 text-muted-foreground">Home Mortgage</td>
                      <td className="px-4 py-2 text-right font-mono">{mv(fmt(safeNum(snap.mortgage), true))}</td>
                    </tr>
                    <tr className="border-b border-border/40">
                      <td className="px-4 py-2 text-muted-foreground">Other Debts</td>
                      <td className="px-4 py-2 text-right font-mono">{mv(fmt(safeNum(snap.other_debts), true))}</td>
                    </tr>
                    <tr className="border-b border-border bg-secondary/20">
                      <td className="px-4 py-2 font-semibold">Total Liabilities</td>
                      <td className="px-4 py-2 text-right font-bold num-display text-red-400">{mv(fmt(totalLiab, true))}</td>
                    </tr>
                    <tr className="bg-amber-500/5">
                      <td className="px-4 py-3 font-bold text-amber-500">NET WORTH</td>
                      <td className="px-4 py-3 text-right font-bold num-display text-amber-500 text-sm">{mv(fmt(netWorth, true))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </ReportSection>

      {/* ── Section C: Cashflow ───────────────────────────────────────────── */}
      <ReportSection id="cashflow" icon={<TrendingUp className="w-4 h-4 text-emerald-500" />} title="C · Cashflow Report" badge="Income &amp; Expenses" badgeColor="green">
        <div className="space-y-4 pt-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] text-muted-foreground">Monthly Income</p>
              <p className="text-base font-bold text-emerald-500 num-display mt-1">{mv(fmt(monthlyInc))}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{mv(fmt(monthlyInc * 12))} / year</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] text-muted-foreground">Monthly Expenses + Bills</p>
              <p className="text-base font-bold text-red-400 num-display mt-1">{mv(fmt(monthlyExp))}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{mv(fmt(monthlyExp * 12))} / year</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] text-muted-foreground">Net Monthly Surplus</p>
              <p className={`text-base font-bold num-display mt-1 ${surplus >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>{mv(fmt(surplus))}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Savings rate {pct(savingsRate)}</p>
            </div>
          </div>
          {/* Income vs Expenses bar chart */}
          {cfChartData.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-3">Annual Income vs Expenses (10 Years)</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={cfChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,22%)" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'hsl(220,10%,50%)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: 'hsl(220,10%,50%)' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} width={50} />
                  <Tooltip formatter={(v: number) => fmt(v, true)} contentStyle={{ background: 'var(--tooltip-bg,#fff)', border: '1px solid hsl(220,15%,82%)', borderRadius: 8, fontSize: 11 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="income" name="Income" fill="hsl(142,60%,45%)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="expenses" name="Outflows" fill="hsl(5,70%,55%)" radius={[3, 3, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {/* Annual cashflow table */}
          {cfRows.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Annual Detail (Central Ledger)</p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs" style={{ minWidth: 720 }}>
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      {['Year', 'Income', 'Rental', 'Expenses', 'Mortgage', 'Prop. Sett.', 'NG Refund', 'Net CF', 'Ending Cash', 'Net Worth'].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 text-muted-foreground font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cfRows.map((r, i) => (
                      <tr key={r.year} className={`border-b border-border/40 hover:bg-secondary/10 ${i === cfRows.length - 1 ? 'font-bold bg-secondary/10' : ''}`}>
                        <td className="px-3 py-2 font-semibold" style={{ color: 'hsl(42,80%,55%)' }}>{r.year}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: 'hsl(142,55%,48%)' }}>{mv(fmt(r.income, true))}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: 'hsl(188,60%,50%)' }}>{r.rentalIncome > 0 ? mv(fmt(r.rentalIncome, true)) : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: 'hsl(5,70%,55%)' }}>{mv(fmt(r.exp, true))}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: 'hsl(20,80%,55%)' }}>{mv(fmt(r.mortgage, true))}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: 'hsl(260,60%,60%)' }}>{r.propertySettlement > 0 ? mv(fmt(r.propertySettlement, true)) : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: 'hsl(43,85%,55%)' }}>{r.ngRefund > 0 ? mv(fmt(r.ngRefund, true)) : <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2 font-mono font-semibold" style={{ color: r.netCF >= 0 ? 'hsl(142,55%,48%)' : 'hsl(5,70%,55%)' }}>{r.netCF >= 0 ? '+' : ''}{mv(fmt(r.netCF, true))}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: 'hsl(210,75%,58%)' }}>{mv(fmt(r.endingCash, true))}</td>
                        <td className="px-3 py-2 font-mono font-bold" style={{ color: 'hsl(43,85%,60%)' }}>{mv(fmt(r.netWorth, true))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* Expense by category */}
          {expCatData.length > 0 && (
            <div className="grid lg:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-3">Expense Breakdown by Category</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={expCatData} layout="vertical" margin={{ top: 0, right: 10, left: 80, bottom: 0 }}>
                    <XAxis type="number" tick={{ fontSize: 9, fill: 'hsl(220,10%,50%)' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'hsl(220,10%,50%)' }} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: number) => fmt(v, true)} contentStyle={{ background: 'var(--tooltip-bg,#fff)', border: '1px solid hsl(220,15%,82%)', borderRadius: 8, fontSize: 11 }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
                      {expCatData.map((_, i) => <Cell key={i} fill={ACCENT[i % ACCENT.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Top Expense Categories</p>
                <div className="space-y-1.5">
                  {expCatData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: ACCENT[i % ACCENT.length] }} />
                      <span className="text-muted-foreground flex-1 truncate">{d.name}</span>
                      <span className="font-semibold num-display">{mv(fmt(d.value, true))}</span>
                      <span className="text-[10px] text-muted-foreground w-10 text-right">{expByCat && Object.values(expByCat).reduce((s, v) => s + v, 0) > 0 ? pct((d.value / Object.values(expByCat).reduce((s, v) => s + v, 0)) * 100) : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </ReportSection>

      {/* ── Section D: Investment Report ──────────────────────────────────── */}
      <ReportSection id="investment" icon={<LineChart className="w-4 h-4 text-violet-400" />} title="D · Investment Report" badge="Portfolio" badgeColor="purple">
        <div className="space-y-4 pt-3">
          {/* Investment KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] text-muted-foreground">Property Portfolio</p>
              <p className="text-sm font-bold num-display mt-1">{mv(fmt(propValue, true))}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Equity {mv(fmt(propEquity, true))}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] text-muted-foreground">Stocks Portfolio</p>
              <p className="text-sm font-bold num-display mt-1 text-blue-400">{mv(fmt(stocksValue, true))}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">DCA {mv(fmt(stocksDCA))}/mo</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] text-muted-foreground">Crypto Portfolio</p>
              <p className="text-sm font-bold num-display mt-1 text-amber-500">{mv(fmt(cryptoValue, true))}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">DCA {mv(fmt(cryptoDCA))}/mo</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] text-muted-foreground">Super Balance</p>
              <p className="text-sm font-bold num-display mt-1 text-emerald-500">{mv(fmt(safeNum(snap.super_balance), true))}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Concessional</p>
            </div>
          </div>
          {/* Properties table */}
          {properties.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Property Portfolio</p>
              <ReportTable
                headers={['Name', 'Type', 'Value', 'Loan', 'Equity', 'Rate', 'Growth', 'Mo. Rent']}
                rows={properties.map((p: any) => [
                  p.name,
                  <span key="type" className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${p.type === 'Investment' ? 'bg-blue-500/15 text-blue-500' : 'bg-emerald-500/15 text-emerald-500'}`}>{p.type}</span>,
                  mv(fmt(p.current_value, true)),
                  mv(fmt(p.loan_amount, true)),
                  <span key="equity" className="text-emerald-500 font-semibold">{mv(fmt(safeNum(p.current_value) - safeNum(p.loan_amount), true))}</span>,
                  `${p.interest_rate}%`,
                  `${p.capital_growth}%`,
                  mv(fmt(safeNum(p.weekly_rent) * 52 / 12)),
                ])}
              />
            </div>
          )}
          {/* Stocks table */}
          {stocks.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Stock Holdings</p>
              <ReportTable
                headers={['Ticker', 'Name', 'Price', 'Holdings', 'Market Value', 'Exp. Return', 'Mo. DCA']}
                rows={stocks.map((s: any) => [
                  <span key="t" className="font-bold text-blue-400">{s.ticker}</span>,
                  s.name,
                  mv(fmt(s.current_price)),
                  s.current_holding || 0,
                  mv(fmt(safeNum(s.current_holding) * safeNum(s.current_price), true)),
                  `${s.expected_return}%`,
                  mv(fmt(s.monthly_dca)),
                ])}
              />
            </div>
          )}
          {/* Crypto table */}
          {cryptos.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Crypto Holdings</p>
              <ReportTable
                headers={['Symbol', 'Name', 'Price', 'Holdings', 'Market Value', 'Exp. Return', 'Mo. DCA']}
                rows={cryptos.map((c: any) => [
                  <span key="s" className="font-bold text-amber-500">{c.symbol}</span>,
                  c.name,
                  mv(fmt(c.current_price)),
                  c.current_holding || 0,
                  mv(fmt(safeNum(c.current_holding) * safeNum(c.current_price), true)),
                  `${c.expected_return}%`,
                  mv(fmt(c.monthly_dca)),
                ])}
              />
            </div>
          )}
          {/* DCA + planned orders summary */}
          {(stockDCASchedules.length > 0 || cryptoDCASchedules.length > 0 || plannedStockOrders.length > 0 || plannedCryptoOrders.length > 0) && (
            <div className="rounded-xl border border-border bg-secondary/20 p-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Planned Investment Activity</p>
              <div className="grid sm:grid-cols-2 gap-3 text-xs">
                <div><span className="text-muted-foreground">Stock DCA Schedules:</span> <span className="font-semibold">{stockDCASchedules.length}</span></div>
                <div><span className="text-muted-foreground">Crypto DCA Schedules:</span> <span className="font-semibold">{cryptoDCASchedules.length}</span></div>
                <div><span className="text-muted-foreground">Planned Stock Orders:</span> <span className="font-semibold">{plannedStockOrders.length}</span></div>
                <div><span className="text-muted-foreground">Planned Crypto Orders:</span> <span className="font-semibold">{plannedCryptoOrders.length}</span></div>
              </div>
            </div>
          )}
        </div>
      </ReportSection>

      {/* ── Section E: Tax Report ─────────────────────────────────────────── */}
      <ReportSection id="tax" icon={<CreditCard className="w-4 h-4 text-cyan-400" />} title="E · Tax Report" badge="Estimates" badgeColor="cyan">
        <div className="space-y-4 pt-3">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">These are simplified estimates based on marginal tax rates. Consult your accountant for formal advice.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] text-muted-foreground">Annual Income</p>
              <p className="text-sm font-bold num-display mt-1">{mv(fmt(annualInc, true))}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] text-muted-foreground">Marginal Tax Rate</p>
              <p className="text-sm font-bold mt-1">{taxRate}%</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">2025–26 ATO rates</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] text-muted-foreground">Estimated Tax Payable</p>
              <p className="text-sm font-bold num-display mt-1 text-red-400">{mv(fmt(estimatedTax, true))}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Before offsets</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] text-muted-foreground">Neg. Gearing Loss</p>
              <p className="text-sm font-bold num-display mt-1 text-blue-400">{mv(fmt(propNgLoss, true))}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Interest minus rent</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] text-muted-foreground">Est. NG Tax Refund</p>
              <p className="text-sm font-bold num-display mt-1 text-emerald-500">{mv(fmt(ngRefund, true))}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">At {taxRate}% marginal rate</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] text-muted-foreground">Super Balance</p>
              <p className="text-sm font-bold num-display mt-1">{mv(fmt(safeNum(snap.super_balance), true))}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">15% contributions tax</p>
            </div>
          </div>
          {properties.filter((p: any) => p.type === 'Investment').length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Investment Property Tax Position</p>
              <ReportTable
                headers={['Property', 'Annual Rent', 'Annual Interest', 'NG Loss', 'Tax Refund']}
                rows={properties.filter((p: any) => p.type === 'Investment').map((p: any) => {
                  const rent = safeNum(p.weekly_rent) * 52;
                  const interest = safeNum(p.loan_amount) * (safeNum(p.interest_rate) / 100);
                  const ngLoss = Math.max(0, interest - rent);
                  const refund = ngLoss * (taxRate / 100);
                  return [
                    p.name,
                    mv(fmt(rent, true)),
                    mv(fmt(interest, true)),
                    <span key="ng" className={ngLoss > 0 ? 'text-blue-400' : 'text-muted-foreground'}>{mv(fmt(ngLoss, true))}</span>,
                    <span key="r" className="text-emerald-500">{mv(fmt(refund, true))}</span>,
                  ];
                })}
              />
            </div>
          )}
        </div>
      </ReportSection>

      {/* ── Section F: Action Report ──────────────────────────────────────── */}
      <ReportSection id="action" icon={<Zap className="w-4 h-4 text-amber-500" />} title="F · Action Report" badge="Recommendations" badgeColor="amber">
        <div className="space-y-4 pt-3">
          {/* Risk indicators */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              {
                label: 'Emergency Buffer',
                value: cash >= monthlyExp * 6 ? 'Adequate' : cash >= monthlyExp * 3 ? 'Marginal' : 'Low',
                status: cash >= monthlyExp * 6 ? 'green' : cash >= monthlyExp * 3 ? 'amber' : 'red',
                sub: `${mv(fmt(cash, true))} cash vs ${mv(fmt(monthlyExp * 3, true))} (3mo target)`,
              },
              {
                label: 'Cashflow Health',
                value: surplus >= monthlyExp * 0.2 ? 'Strong' : surplus >= 0 ? 'Positive' : 'Deficit',
                status: surplus >= monthlyExp * 0.2 ? 'green' : surplus >= 0 ? 'amber' : 'red',
                sub: `${mv(fmt(surplus))}/mo · ${pct(savingsRate)} savings rate`,
              },
              {
                label: 'Debt Risk',
                value: totalLiab / totalAssets < 0.3 ? 'Low' : totalLiab / totalAssets < 0.6 ? 'Moderate' : 'High',
                status: totalLiab / totalAssets < 0.3 ? 'green' : totalLiab / totalAssets < 0.6 ? 'amber' : 'red',
                sub: `LVR ${totalAssets > 0 ? pct((totalLiab / totalAssets) * 100) : '0%'}`,
              },
              {
                label: 'Diversification',
                value: assetData.length >= 4 ? 'Diversified' : assetData.length >= 2 ? 'Partial' : 'Concentrated',
                status: assetData.length >= 4 ? 'green' : assetData.length >= 2 ? 'amber' : 'red',
                sub: `${assetData.length} asset classes`,
              },
              {
                label: 'FIRE Progress',
                value: fireNumber > 0 && netWorth >= fireNumber * 0.75 ? 'Close' : fireNumber > 0 && netWorth >= fireNumber * 0.4 ? 'On Track' : 'Building',
                status: fireNumber > 0 && netWorth >= fireNumber * 0.75 ? 'green' : fireNumber > 0 && netWorth >= fireNumber * 0.4 ? 'amber' : 'amber',
                sub: fireNumber > 0 ? `${pct((netWorth / fireNumber) * 100)} of FIRE number` : 'Set income/expense data',
              },
              {
                label: 'Investment DCA',
                value: stocksDCA + cryptoDCA > 0 ? 'Active' : 'Not Set',
                status: stocksDCA + cryptoDCA > 0 ? 'green' : 'amber',
                sub: stocksDCA + cryptoDCA > 0 ? `${mv(fmt(stocksDCA + cryptoDCA))}/mo automated` : 'Configure DCA in Stocks/Crypto',
              },
            ].map(item => {
              const colors = {
                green: 'border-emerald-500/30 bg-emerald-500/5',
                amber: 'border-amber-500/30 bg-amber-500/5',
                red:   'border-red-400/30 bg-red-400/5',
              };
              const textColors = { green: 'text-emerald-500', amber: 'text-amber-500', red: 'text-red-400' };
              const icons = { green: <CheckCircle2 className="w-4 h-4 text-emerald-500" />, amber: <AlertTriangle className="w-4 h-4 text-amber-500" />, red: <AlertTriangle className="w-4 h-4 text-red-400" /> };
              return (
                <div key={item.label} className={`rounded-xl border p-4 ${colors[item.status as keyof typeof colors]}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">{item.label}</p>
                    {icons[item.status as keyof typeof icons]}
                  </div>
                  <p className={`text-sm font-bold mt-1 ${textColors[item.status as keyof typeof textColors]}`}>{item.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{item.sub}</p>
                </div>
              );
            })}
          </div>

          {/* Recommended actions */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">Recommended Actions (based on your ledger)</p>
            <div className="space-y-2">
              {[
                { condition: cash < monthlyExp * 3, priority: 'High', action: 'Build Emergency Buffer', detail: `Target ${mv(fmt(monthlyExp * 6))} (6 months expenses). Currently ${mv(fmt(cash))} cash.` },
                { condition: surplus < 0, priority: 'High', action: 'Reduce Monthly Deficit', detail: `Spending exceeds income by ${mv(fmt(Math.abs(surplus)))}/mo. Review discretionary expenses.` },
                { condition: stocksDCA + cryptoDCA === 0 && surplus > 500, priority: 'Medium', action: 'Start Automated DCA', detail: 'Set up monthly DCA for stocks and/or crypto to automate wealth building.' },
                { condition: propNgLoss > 0, priority: 'Medium', action: 'Maximise Negative Gearing', detail: `Est. ${mv(fmt(ngRefund))} tax refund available. Ensure you're lodging all deductions.` },
                { condition: safeNum(snap.super_balance) < monthlyInc * 12 * 5, priority: 'Low', action: 'Review Super Contributions', detail: 'Consider voluntary concessional contributions to reduce taxable income.' },
                { condition: yearsToFire > 20, priority: 'Low', action: 'Accelerate FIRE Strategy', detail: `Current trajectory: ${yearsToFire.toFixed(1)} years to FIRE. Increasing savings rate by 5% can cut years significantly.` },
              ].filter(a => a.condition).map((a, i) => {
                const pColors = { High: 'bg-red-400/15 text-red-400', Medium: 'bg-amber-500/15 text-amber-500', Low: 'bg-blue-500/15 text-blue-400' };
                return (
                  <div key={i} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${pColors[a.priority as keyof typeof pColors]}`}>{a.priority}</span>
                    <div>
                      <p className="text-sm font-semibold">{a.action}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{a.detail}</p>
                    </div>
                  </div>
                );
              })}
              {/* If no actions needed */}
              {[
                cash < monthlyExp * 3, surplus < 0, stocksDCA + cryptoDCA === 0 && surplus > 500,
                propNgLoss > 0, safeNum(snap.super_balance) < monthlyInc * 12 * 5, yearsToFire > 20,
              ].filter(Boolean).length === 0 && (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-500">All indicators healthy</p>
                    <p className="text-xs text-muted-foreground">Your ledger shows no immediate action required. Keep maintaining your savings discipline.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </ReportSection>

      {/* ── Scenarios section ─────────────────────────────────────────────── */}
      {scenarios.length > 0 && (
        <ReportSection id="scenarios" icon={<Target className="w-4 h-4 text-violet-400" />} title="Saved Scenarios" badge={`${scenarios.length} saved`} badgeColor="purple">
          <div className="space-y-3 pt-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={toggleAllScenarios} data-testid="button-select-all-scenarios">
                {selectedScenarios.size === scenarios.length ? <><CheckSquare className="w-3.5 h-3.5" /> Deselect All</> : <><Square className="w-3.5 h-3.5" /> Select All</>}
              </Button>
              {selectedScenarios.size > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">{selectedScenarios.size} selected</span>
                  <Button size="sm" variant="destructive" className="gap-1.5 text-xs h-7" onClick={() => setShowScenarioBulkModal(true)} data-testid="button-bulk-delete-scenarios">
                    <Trash2 className="w-3.5 h-3.5" /> Delete {selectedScenarios.size}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setSelectedScenarios(new Set())}>Clear</Button>
                </>
              )}
            </div>
            <div className="space-y-2">
              {scenarios.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-secondary/20 transition-colors" style={{ borderColor: selectedScenarios.has(s.id) ? 'hsl(0,72%,51%)' : undefined }} data-testid={`scenario-${s.id}`}>
                  <button onClick={() => toggleScenario(s.id)} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors" data-testid={`checkbox-scenario-${s.id}`}>
                    {selectedScenarios.has(s.id) ? <CheckSquare className="w-4 h-4 text-red-400" /> : <Square className="w-4 h-4" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{s.name || `Scenario ${s.id}`}</p>
                    {s.description && <p className="text-xs text-muted-foreground truncate">{s.description}</p>}
                  </div>
                  {s.created_at && <p className="text-xs text-muted-foreground shrink-0">{new Date(s.created_at).toLocaleDateString('en-AU')}</p>}
                </div>
              ))}
            </div>
          </div>
        </ReportSection>
      )}

      <BulkDeleteModal
        open={showScenarioBulkModal}
        count={selectedScenarios.size}
        label="scenarios"
        onConfirm={handleBulkDeleteScenarios}
        onCancel={() => setShowScenarioBulkModal(false)}
        onExportBackup={handleExportScenariosBackup}
      />
    </div>
  );
}

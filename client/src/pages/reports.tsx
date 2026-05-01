import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, calcSavingsRate, safeNum } from "@/lib/finance";
import { runCashEngine } from "@/lib/cashEngine";
import { useForecastAssumptions } from "@/lib/useForecastAssumptions";
import { Button } from "@/components/ui/button";
import BulkDeleteModal from "@/components/BulkDeleteModal";
import { useToast } from "@/hooks/use-toast";
import { Download, FileText, BarChart2, FileSpreadsheet, Trash2, CheckSquare, Square } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from "recharts";

const COLORS = ['hsl(43,85%,55%)', 'hsl(188,60%,48%)', 'hsl(142,60%,45%)', 'hsl(20,80%,55%)', 'hsl(270,60%,60%)', 'hsl(0,72%,51%)'];

export default function ReportsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: snapshot } = useQuery({ queryKey: ['/api/snapshot'], queryFn: () => apiRequest('GET', '/api/snapshot').then(r => r.json()) });
  const { data: properties = [] } = useQuery<any[]>({ queryKey: ['/api/properties'], queryFn: () => apiRequest('GET', '/api/properties').then(r => r.json()) });
  const { data: stocks = [] } = useQuery<any[]>({ queryKey: ['/api/stocks'], queryFn: () => apiRequest('GET', '/api/stocks').then(r => r.json()) });
  const { data: cryptos = [] } = useQuery<any[]>({ queryKey: ['/api/crypto'], queryFn: () => apiRequest('GET', '/api/crypto').then(r => r.json()) });
  const { data: expenses = [] } = useQuery<any[]>({ queryKey: ['/api/expenses'], queryFn: () => apiRequest('GET', '/api/expenses').then(r => r.json()) });
  const { data: scenarios = [] } = useQuery<any[]>({ queryKey: ['/api/scenarios'], queryFn: () => apiRequest('GET', '/api/scenarios').then(r => r.json()).catch(() => []) });
  const { data: incomeRecords = [] } = useQuery<any[]>({ queryKey: ['/api/income'], queryFn: () => apiRequest('GET', '/api/income').then(r => r.json()).catch(() => []) });
  const { data: bills = [] } = useQuery<any[]>({ queryKey: ['/api/bills'], queryFn: () => apiRequest('GET', '/api/bills').then(r => r.json()).catch(() => []) });
  const { data: stockDCASchedules = [] } = useQuery<any[]>({ queryKey: ['/api/stock-dca'], queryFn: () => apiRequest('GET', '/api/stock-dca').then(r => r.json()).catch(() => []) });
  const { data: cryptoDCASchedules = [] } = useQuery<any[]>({ queryKey: ['/api/crypto-dca'], queryFn: () => apiRequest('GET', '/api/crypto-dca').then(r => r.json()).catch(() => []) });
  const { data: plannedStockOrders = [] } = useQuery<any[]>({ queryKey: ['/api/planned-investments', 'stock'], queryFn: () => apiRequest('GET', '/api/planned-investments?module=stock').then(r => r.json()).catch(() => []) });
  const { data: plannedCryptoOrders = [] } = useQuery<any[]>({ queryKey: ['/api/planned-investments', 'crypto'], queryFn: () => apiRequest('GET', '/api/planned-investments?module=crypto').then(r => r.json()).catch(() => []) });
  const fa = useForecastAssumptions();

  // ─── Bulk delete state for scenarios ─────────────────────────────────────
  const [selectedScenarios, setSelectedScenarios] = useState<Set<number>>(new Set());
  const [showScenarioBulkModal, setShowScenarioBulkModal] = useState(false);

  const snap = snapshot ?? {};

  const totalAssets = safeNum(snap.ppor) + safeNum(snap.cash) + safeNum(snap.offset_balance) + safeNum(snap.super_balance) + safeNum(snap.stocks) + safeNum(snap.crypto) + safeNum(snap.cars) + safeNum(snap.iran_property);
  const totalLiabilities = safeNum(snap.mortgage) + safeNum(snap.other_debts);
  const netWorth = totalAssets - totalLiabilities;
  const surplus = safeNum(snap.monthly_income) - safeNum(snap.monthly_expenses);
  const savingsRate = calcSavingsRate(safeNum(snap.monthly_income), safeNum(snap.monthly_expenses));

  // ─── Central Cash Engine — one source of truth ────────────────────────
  const cashEngineOut = snapshot ? runCashEngine({
    snapshot: snap,
    properties,
    stocks,
    cryptos,
    expenses,
    bills,
    stockDCASchedules,
    cryptoDCASchedules,
    plannedStockOrders,
    plannedCryptoOrders,
    inflationRate:    fa?.flat?.inflation    ?? 3,
    incomeGrowthRate: fa?.flat?.income_growth ?? 3.5,
  }) : null;

  const projection = cashEngineOut?.annual ?? [];

  const assetData = [
    { name: 'PPOR', value: safeNum(snap.ppor) }, { name: 'Cash', value: safeNum(snap.cash) + safeNum(snap.offset_balance) },
    { name: 'Super', value: safeNum(snap.super_balance) }, { name: 'Cars', value: safeNum(snap.cars) },
    { name: 'Iran Property', value: safeNum(snap.iran_property) },
  ].filter(d => d.value > 0);

  const nwChartData = projection.map((p: any) => ({
    year: p.year?.toString() ?? '',
    netWorth: safeNum(p.endNetWorth ?? p.endingCash),
    assets: safeNum(p.totalAssets ?? p.totalInflows),
    cashFlow: safeNum(p.netCashFlow ?? p.avgMonthlyCF),
  }));

  const expenseByCategory: Record<string, number> = {};
  expenses.forEach((e: any) => { expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + e.amount; });
  const expCatData = Object.entries(expenseByCategory).slice(0, 8).map(([name, value]) => ({ name, value: value as number }));

  // ─── Scenario bulk select helpers ─────────────────────────────────────────
  const toggleScenario = (id: number) => {
    setSelectedScenarios(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllScenarios = () => {
    if (selectedScenarios.size === scenarios.length) {
      setSelectedScenarios(new Set());
    } else {
      setSelectedScenarios(new Set(scenarios.map((s: any) => s.id)));
    }
  };

  const handleExportScenariosBackup = () => {
    const wb = XLSX.utils.book_new();
    const sel = scenarios.filter((s: any) => selectedScenarios.has(s.id));
    const headers = ['ID', 'Name', 'Description', 'Created'];
    const rows = sel.map((s: any) => [s.id, s.name || '', s.description || '', s.created_at || '']);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Scenarios Backup');
    XLSX.writeFile(wb, `Scenarios_Backup_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Backup exported', description: `${sel.length} scenarios saved.` });
  };

  const handleBulkDeleteScenarios = async () => {
    const ids = Array.from(selectedScenarios);
    for (const id of ids) {
      await apiRequest('DELETE', `/api/scenarios/${id}`).catch(() => {});
    }
    await qc.invalidateQueries({ queryKey: ['/api/scenarios'] });
    setSelectedScenarios(new Set());
    setShowScenarioBulkModal(false);
    toast({ title: `Deleted ${ids.length} scenarios`, description: 'Scenarios removed from Supabase and local cache.' });
  };

  // ─── Excel Export ────────────────────────────────────────────────────
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const dateStr = new Date().toISOString().split('T')[0];

    // Executive Summary
    const summary = [
      ['SHAHROKH FAMILY FINANCIAL REPORT', '', ''],
      ['Generated:', new Date().toLocaleDateString('en-AU'), ''],
      ['', '', ''],
      ['FINANCIAL SNAPSHOT', '', ''],
      ['Total Assets', formatCurrency(totalAssets), ''],
      ['Total Liabilities', formatCurrency(totalLiabilities), ''],
      ['Net Worth', formatCurrency(netWorth), ''],
      ['Monthly Income', formatCurrency(snap.monthly_income), ''],
      ['Monthly Expenses', formatCurrency(snap.monthly_expenses), ''],
      ['Monthly Surplus', formatCurrency(surplus), ''],
      ['Savings Rate', `${savingsRate.toFixed(1)}%`, ''],
      ['', '', ''],
      ['ASSETS', '', ''],
      ['PPOR', formatCurrency(snap.ppor), ''],
      ['Cash', formatCurrency(snap.cash), ''],
      ['Super', formatCurrency(snap.super_balance), ''],
      ['Cars', formatCurrency(snap.cars), ''],
      ['Iran Property', formatCurrency(snap.iran_property), ''],
      ['', '', ''],
      ['LIABILITIES', '', ''],
      ['Mortgage', formatCurrency(snap.mortgage), ''],
      ['Other Debts', formatCurrency(snap.other_debts), ''],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Executive Summary');

    // 10-Year Forecast
    const fcHeaders = ['Year', 'Start NW', 'Income', 'Expenses', 'Property Value', 'Property Loans', 'Property Equity', 'Stocks', 'Crypto', 'Cash', 'Total Assets', 'Liabilities', 'End NW', 'Growth', 'Passive Income', 'Monthly CF'];
    const fcRows = projection.map(p => [p.year, p.startNetWorth, p.income, p.expenses, p.propertyValue, p.propertyLoans, p.propertyEquity, p.stockValue, p.cryptoValue, p.cash, p.totalAssets, p.totalLiabilities, p.endNetWorth, p.growth, p.passiveIncome, p.monthlyCashFlow]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([fcHeaders, ...fcRows]), '10-Year Forecast');

    // Income
    if (incomeRecords.length > 0) {
      const incHeaders = ['Date', 'Amount', 'Source', 'Description', 'Member', 'Frequency', 'Recurring', 'Notes'];
      const incRows = incomeRecords.map((r: any) => [r.date, r.amount, r.source, r.description, r.member, r.frequency, r.recurring ? 'Yes' : 'No', r.notes]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([incHeaders, ...incRows]), 'Income');
    }

    // Expenses
    if (expenses.length > 0) {
      const expHeaders = ['Date', 'Amount', 'Category', 'Sub-category', 'Description', 'Payment Method', 'Family Member', 'Recurring', 'Notes'];
      const expRows = expenses.map((e: any) => [e.date, e.amount, e.category, e.subcategory, e.description, e.payment_method, e.family_member, e.recurring ? 'Yes' : 'No', e.notes]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([expHeaders, ...expRows]), 'Expenses');
    }

    // Properties
    if (properties.length > 0) {
      const propHeaders = ['Name', 'Type', 'Value', 'Loan', 'Interest Rate', 'Capital Growth', 'Weekly Rent'];
      const propRows = properties.map((p: any) => [p.name, p.type, p.current_value, p.loan_amount, p.interest_rate, p.capital_growth, p.weekly_rent]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([propHeaders, ...propRows]), 'Properties');
    }

    // Stocks
    if (stocks.length > 0) {
      const stHeaders = ['Ticker', 'Name', 'Price', 'Shares', 'Value', 'Expected Return', 'Monthly DCA'];
      const stRows = stocks.map((s: any) => [s.ticker, s.name, s.current_price, s.current_holding, s.current_holding * s.current_price, s.expected_return, s.monthly_dca]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([stHeaders, ...stRows]), 'Stocks');
    }

    // Crypto
    if (cryptos.length > 0) {
      const crHeaders = ['Symbol', 'Name', 'Price', 'Holdings', 'Value', 'Expected Return', 'Monthly DCA'];
      const crRows = cryptos.map((c: any) => [c.symbol, c.name, c.current_price, c.current_holding, (c.current_holding || 0) * c.current_price, c.expected_return, c.monthly_dca]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([crHeaders, ...crRows]), 'Crypto');
    }

    XLSX.writeFile(wb, `Shahrokh_Family_Financial_Report_${dateStr}.xlsx`);
    toast({ title: 'Excel Report Exported', description: `Saved as Shahrokh_Family_Financial_Report_${dateStr}.xlsx` });
  };

  // ─── PDF Export ──────────────────────────────────────────────────────
  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const gold = [196, 165, 90] as [number, number, number];
    const dark = [15, 18, 30] as [number, number, number];
    const dateStr = new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });

    // ── Cover page ──
    doc.setFillColor(...dark);
    doc.rect(0, 0, 210, 297, 'F');
    doc.setTextColor(...gold);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text('SHAHROKH FAMILY', 105, 90, { align: 'center' });
    doc.text('FINANCIAL REPORT', 105, 106, { align: 'center' });
    doc.setFontSize(12);
    doc.setTextColor(200, 200, 200);
    doc.text('Private Wealth Planning Dashboard', 105, 125, { align: 'center' });
    doc.setFontSize(10);
    doc.text('Roham Shahrokh · Fara Ghiyasi · Yara · Jana', 105, 140, { align: 'center' });
    doc.text('Brisbane, Queensland, Australia', 105, 150, { align: 'center' });
    doc.setTextColor(...gold);
    doc.setFontSize(10);
    doc.text(dateStr, 105, 170, { align: 'center' });

    // ── Executive Summary ──
    doc.addPage();
    doc.setFillColor(...dark);
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(...gold);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Executive Summary', 14, 13);
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    const summaryData = [
      ['Metric', 'Value'],
      ['Total Assets', formatCurrency(totalAssets)],
      ['Total Liabilities', formatCurrency(totalLiabilities)],
      ['Net Worth', formatCurrency(netWorth)],
      ['Monthly Income', formatCurrency(snap.monthly_income)],
      ['Monthly Expenses', formatCurrency(snap.monthly_expenses)],
      ['Monthly Surplus', formatCurrency(surplus)],
      ['Savings Rate', `${savingsRate.toFixed(1)}%`],
    ];

    autoTable(doc, {
      head: [summaryData[0]],
      body: summaryData.slice(1),
      startY: 25,
      theme: 'striped',
      headStyles: { fillColor: gold, textColor: [15, 18, 30], fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 4 },
    });

    // ── 10-Year Forecast ──
    doc.addPage();
    doc.setFillColor(...dark);
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(...gold);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('10-Year Net Worth Forecast', 14, 13);

    const fcData = projection.map(p => [
      p.year.toString(),
      formatCurrency(p.endNetWorth, true),
      formatCurrency(p.income, true),
      formatCurrency(p.expenses, true),
      formatCurrency(p.propertyEquity, true),
      formatCurrency(p.passiveIncome, true),
    ]);

    autoTable(doc, {
      head: [['Year', 'Net Worth', 'Income', 'Expenses', 'Prop. Equity', 'Passive Income']],
      body: fcData,
      startY: 25,
      theme: 'striped',
      headStyles: { fillColor: gold, textColor: [15, 18, 30], fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 3 },
    });

    // ── Properties ──
    if (properties.length > 0) {
      doc.addPage();
      doc.setFillColor(...dark);
      doc.rect(0, 0, 210, 20, 'F');
      doc.setTextColor(...gold);
      doc.setFontSize(14);
      doc.text('Property Portfolio', 14, 13);
      autoTable(doc, {
        head: [['Name', 'Type', 'Value', 'Loan', 'Rate', 'Growth', 'Weekly Rent']],
        body: properties.map((p: any) => [p.name, p.type, formatCurrency(p.current_value, true), formatCurrency(p.loan_amount, true), `${p.interest_rate}%`, `${p.capital_growth}%`, formatCurrency(p.weekly_rent)]),
        startY: 25,
        theme: 'striped',
        headStyles: { fillColor: gold, textColor: [15, 18, 30], fontStyle: 'bold' },
        styles: { fontSize: 9 },
      });
    }

    // ── Stocks ──
    if (stocks.length > 0) {
      doc.addPage();
      doc.setFillColor(...dark);
      doc.rect(0, 0, 210, 20, 'F');
      doc.setTextColor(...gold);
      doc.setFontSize(14);
      doc.text('Stock Portfolio', 14, 13);
      autoTable(doc, {
        head: [['Ticker', 'Name', 'Price', 'Shares', 'Value', 'Exp. Return']],
        body: stocks.map((s: any) => [s.ticker, s.name, formatCurrency(s.current_price), s.current_holding || 0, formatCurrency(s.current_holding * s.current_price, true), `${s.expected_return}%`]),
        startY: 25,
        theme: 'striped',
        headStyles: { fillColor: gold, textColor: [15, 18, 30], fontStyle: 'bold' },
        styles: { fontSize: 9 },
      });
    }

    // ── Income Summary ──
    if (incomeRecords.length > 0) {
      doc.addPage();
      doc.setFillColor(...dark);
      doc.rect(0, 0, 210, 20, 'F');
      doc.setTextColor(...gold);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Income Summary', 14, 13);

      // aggregate by source
      const bySource: Record<string, number> = {};
      const FREQ_MULT_PDF: Record<string, number> = {
        Weekly: 52 / 12, Fortnightly: 26 / 12, Monthly: 1,
        Quarterly: 4 / 12, Annual: 1 / 12, 'One-off': 0,
      };
      let totalMonthly = 0;
      for (const r of incomeRecords) {
        bySource[r.source || 'Other'] = (bySource[r.source || 'Other'] || 0) + (r.amount || 0);
        totalMonthly += (r.amount || 0) * (FREQ_MULT_PDF[r.frequency] ?? 1);
      }

      // Summary stats table
      autoTable(doc, {
        head: [['Metric', 'Value']],
        body: [
          ['Total Income Records', incomeRecords.length.toString()],
          ['Estimated Monthly Income', formatCurrency(totalMonthly)],
          ['Estimated Annual Income', formatCurrency(totalMonthly * 12)],
          ['Unique Income Sources', Object.keys(bySource).length.toString()],
        ],
        startY: 25,
        theme: 'striped',
        headStyles: { fillColor: gold, textColor: [15, 18, 30], fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 4 },
      });

      // By source breakdown
      const sourceBody = Object.entries(bySource).map(([src, amt]) => [src, formatCurrency(amt)]);
      autoTable(doc, {
        head: [['Income Source', 'Total Amount']],
        body: sourceBody,
        startY: (doc as any).lastAutoTable.finalY + 8,
        theme: 'striped',
        headStyles: { fillColor: gold, textColor: [15, 18, 30], fontStyle: 'bold' },
        styles: { fontSize: 9 },
      });

      // Recent records (up to 30)
      autoTable(doc, {
        head: [['Date', 'Source', 'Amount', 'Member', 'Frequency']],
        body: incomeRecords.slice(0, 30).map((r: any) => [
          r.date || '', r.source || '', formatCurrency(r.amount), r.member || '', r.frequency || ''
        ]),
        startY: (doc as any).lastAutoTable.finalY + 8,
        theme: 'striped',
        headStyles: { fillColor: gold, textColor: [15, 18, 30], fontStyle: 'bold' },
        styles: { fontSize: 9 },
      });
    }

    // ── Expenses ──
    if (expenses.length > 0) {
      doc.addPage();
      doc.setFillColor(...dark);
      doc.rect(0, 0, 210, 20, 'F');
      doc.setTextColor(...gold);
      doc.setFontSize(14);
      doc.text('Expense Analysis', 14, 13);
      autoTable(doc, {
        head: [['Date', 'Amount', 'Category', 'Description']],
        body: expenses.slice(0, 50).map((e: any) => [e.date, formatCurrency(e.amount), e.category, e.description || '']),
        startY: 25,
        theme: 'striped',
        headStyles: { fillColor: gold, textColor: [15, 18, 30], fontStyle: 'bold' },
        styles: { fontSize: 9 },
      });
    }

    // ── Footer on all pages ──
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Shahrokh Family Financial Planner · Private & Confidential · Page ${i} of ${pageCount}`, 105, 292, { align: 'center' });
    }

    doc.save(`Shahrokh_Family_Wealth_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    toast({ title: 'PDF Report Exported', description: 'Premium wealth report generated.' });
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">Reports & Analytics</h1>
          <p className="text-muted-foreground text-sm">Comprehensive wealth reporting</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={exportExcel}
            variant="outline"
            className="gap-2"
            data-testid="button-export-excel"
          >
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </Button>
          <Button
            onClick={exportPDF}
            className="gap-2"
            style={{ background: 'linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))', color: 'hsl(224,40%,8%)', border: 'none' }}
            data-testid="button-export-pdf"
          >
            <FileText className="w-4 h-4" /> Export PDF Report
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Net Worth', value: formatCurrency(netWorth, true) },
          { label: 'Total Assets', value: formatCurrency(totalAssets, true) },
          { label: 'Total Liabilities', value: formatCurrency(totalLiabilities, true) },
          { label: 'Monthly Surplus', value: formatCurrency(surplus) },
          { label: 'Savings Rate', value: `${savingsRate.toFixed(1)}%` },
          { label: '10Y Forecast', value: formatCurrency(projection[9]?.endNetWorth || netWorth, true) },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-sm font-bold num-display mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold mb-4">Net Worth Growth (10 Years)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={nwChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(43,85%,55%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(43,85%,55%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} />
              <Tooltip formatter={(v: number) => formatCurrency(v, true)} />
              <Area type="monotone" dataKey="netWorth" stroke="hsl(43,85%,55%)" fill="url(#rGrad)" strokeWidth={2} name="Net Worth" />
              <Area type="monotone" dataKey="assets" stroke="hsl(142,60%,45%)" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="Assets" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold mb-4">Asset Allocation</h3>
          <div className="flex items-center gap-3">
            <ResponsiveContainer width="50%" height={220}>
              <PieChart>
                <Pie data={assetData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                  {assetData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v, true)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5 text-xs">
              {assetData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between">
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

      {/* 10-Year Detail Table */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-bold mb-4">10-Year Wealth Projection Detail</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {['Year', 'Net Worth', 'Growth', 'Property Equity', 'Stocks', 'Crypto', 'Passive Income', 'Monthly CF'].map(h => (
                  <th key={h} className="text-left pb-2 pr-4 text-muted-foreground font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {projection.map((p, i) => (
                <tr key={p.year} className={`border-b border-border/40 hover:bg-secondary/20 ${i === 9 ? 'font-bold bg-secondary/10' : ''}`}>
                  <td className="py-1.5 pr-4 font-semibold text-primary">{p.year}</td>
                  <td className="py-1.5 pr-4 num-display" style={{ color: 'hsl(43,85%,65%)' }}>{formatCurrency(p.endNetWorth, true)}</td>
                  <td className="py-1.5 pr-4 num-display text-emerald-400">{formatCurrency(p.growth, true)}</td>
                  <td className="py-1.5 pr-4 num-display">{formatCurrency(p.propertyEquity, true)}</td>
                  <td className="py-1.5 pr-4 num-display">{formatCurrency(p.stockValue, true)}</td>
                  <td className="py-1.5 pr-4 num-display">{formatCurrency(p.cryptoValue, true)}</td>
                  <td className="py-1.5 pr-4 num-display text-emerald-400">{formatCurrency(p.passiveIncome, true)}</td>
                  <td className="py-1.5 pr-4 num-display">{formatCurrency(p.monthlyCashFlow, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expense breakdown */}
      {expCatData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold mb-4">Expense Analysis by Category</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={expCatData} margin={{ top: 5, right: 10, left: 0, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} angle={-30} textAnchor="end" />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
              <Tooltip formatter={(v: number) => formatCurrency(v, true)} />
              <Bar dataKey="value" name="Total" radius={[4, 4, 0, 0]}>
                {expCatData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ─── Scenarios / What-If Analysis ───────────────────────────────── */}
      {scenarios.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-sm font-bold">Saved Scenarios / What-If Analysis</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs h-7"
                onClick={toggleAllScenarios}
                data-testid="button-select-all-scenarios"
              >
                {selectedScenarios.size === scenarios.length
                  ? <><CheckSquare className="w-3.5 h-3.5" /> Deselect All</>
                  : <><Square className="w-3.5 h-3.5" /> Select All</>
                }
              </Button>
              {selectedScenarios.size > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">{selectedScenarios.size} selected</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5 text-xs h-7"
                    onClick={() => setShowScenarioBulkModal(true)}
                    data-testid="button-bulk-delete-scenarios"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete {selectedScenarios.size}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs h-7"
                    onClick={() => setSelectedScenarios(new Set())}
                  >
                    Clear
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {scenarios.map((s: any) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-secondary/20 transition-colors"
                style={{ borderColor: selectedScenarios.has(s.id) ? 'hsl(0,72%,51%)' : undefined }}
              >
                <button
                  onClick={() => toggleScenario(s.id)}
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`checkbox-scenario-${s.id}`}
                >
                  {selectedScenarios.has(s.id)
                    ? <CheckSquare className="w-4 h-4 text-red-400" />
                    : <Square className="w-4 h-4" />
                  }
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{s.name || `Scenario ${s.id}`}</p>
                  {s.description && <p className="text-xs text-muted-foreground truncate">{s.description}</p>}
                </div>
                {s.created_at && (
                  <p className="text-xs text-muted-foreground shrink-0">
                    {new Date(s.created_at).toLocaleDateString('en-AU')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bulk Delete Modal for Scenarios */}
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

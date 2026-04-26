import { useState, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/finance";
import SaveButton from "@/components/SaveButton";
import BulkDeleteModal from "@/components/BulkDeleteModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend,
} from "recharts";
import {
  Plus, Trash2, Edit2, Upload, Download, Search,
  CheckSquare, Square, ChevronDown, Filter, TrendingDown,
} from "lucide-react";
import * as XLSX from "xlsx";

const CATEGORIES = [
  'Mortgage', 'Childcare', 'Groceries', 'Eating Out', 'Fuel', 'Car Loan',
  'Insurance', 'Utilities', 'Health', 'Education', 'Shopping', 'Entertainment',
  'Travel', 'Subscriptions', 'Personal Care', 'Investments', 'Other'
];
const FAMILY_MEMBERS = ['Roham Shahrokh', 'Fara Ghiyasi', 'Yara Shahrokh', 'Jana Shahrokh', 'Family'];
const PAYMENT_METHODS = ['Bank Transfer', 'Credit Card', 'Debit Card', 'Cash', 'Offset Account', 'BPAY'];
const COLORS = [
  'hsl(43,85%,55%)', 'hsl(188,60%,48%)', 'hsl(142,60%,45%)', 'hsl(20,80%,55%)',
  'hsl(270,60%,60%)', 'hsl(0,72%,51%)', 'hsl(60,80%,50%)', 'hsl(300,60%,55%)',
  'hsl(200,70%,55%)', 'hsl(160,65%,48%)'
];

const EMPTY_EXPENSE = {
  date: new Date().toISOString().split('T')[0],
  amount: '' as any,
  category: 'Other', subcategory: '', description: '',
  payment_method: '', family_member: '', recurring: false, notes: '',
};

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// ─── ExpenseForm is defined OUTSIDE parent — prevents focus-loss on re-render ──
interface ExpenseFormData {
  date: string; amount: any; category: string; subcategory: string;
  description: string; payment_method: string; family_member: string;
  recurring: boolean; notes: string;
}
interface ExpenseFormProps { data: ExpenseFormData; onChange: (d: ExpenseFormData) => void; }

function ExpenseForm({ data, onChange }: ExpenseFormProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div>
        <label className="text-xs text-muted-foreground">Date</label>
        <Input type="date" value={data.date} onChange={e => onChange({ ...data, date: e.target.value })} className="h-8 text-sm" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Amount (AUD)</label>
        <Input type="number" value={data.amount} onChange={e => onChange({ ...data, amount: e.target.value })}
          className="h-8 text-sm num-display" step="0.01" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Category</label>
        <Select value={data.category} onValueChange={v => onChange({ ...data, category: v })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Sub-category</label>
        <Input value={data.subcategory} onChange={e => onChange({ ...data, subcategory: e.target.value })} className="h-8 text-sm" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Description</label>
        <Input value={data.description} onChange={e => onChange({ ...data, description: e.target.value })} className="h-8 text-sm" />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Payment Method</label>
        <Select value={data.payment_method} onValueChange={v => onChange({ ...data, payment_method: v })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent>{PAYMENT_METHODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Family Member</label>
        <Select value={data.family_member} onValueChange={v => onChange({ ...data, family_member: v })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent>{FAMILY_MEMBERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Notes</label>
        <Input value={data.notes} onChange={e => onChange({ ...data, notes: e.target.value })} className="h-8 text-sm" />
      </div>
      <div className="flex items-end gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={data.recurring}
            onChange={e => onChange({ ...data, recurring: e.target.checked })} className="rounded" />
          Recurring
        </label>
      </div>
    </div>
  );
}

function normaliseDraft(d: ExpenseFormData) {
  return { ...d, amount: parseFloat(String(d.amount)) || 0 };
}

// ─── Small chart tooltip ──────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value, true)}</p>
      ))}
    </div>
  );
};

export default function ExpensesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<ExpenseFormData>({ ...EMPTY_EXPENSE });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ExpenseFormData | null>(null);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filterYear, setFilterYear] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSubcat, setFilterSubcat] = useState('');
  const [filterMember, setFilterMember] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // ── Selection state (bulk delete) ──────────────────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);

  // ── Stable onChange handlers ───────────────────────────────────────────────
  const handleDraftChange = useCallback((d: ExpenseFormData) => setDraft(d), []);
  const handleEditDraftChange = useCallback((d: ExpenseFormData) => setEditDraft(d), []);

  // ── Queries / Mutations ────────────────────────────────────────────────────
  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ['/api/expenses'],
    queryFn: () => apiRequest('GET', '/api/expenses').then(r => r.json())
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/expenses', data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/expenses'] }); setShowAdd(false); setDraft({ ...EMPTY_EXPENSE }); }
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest('PUT', `/api/expenses/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/expenses'] }); setEditingId(null); }
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/expenses/${id}`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/expenses'] })
  });
  const bulkMut = useMutation({
    mutationFn: (data: any[]) => apiRequest('POST', '/api/expenses/bulk', { expenses: data }).then(r => r.json()),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['/api/expenses'] });
      toast({ title: `Imported ${res.created} expenses`, description: 'Excel import complete.' });
    }
  });

  // ── Filter logic ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => expenses.filter((e: any) => {
    const d = new Date(e.date);
    if (filterYear !== 'all' && d.getFullYear() !== parseInt(filterYear)) return false;
    if (filterMonth !== 'all' && d.getMonth() !== parseInt(filterMonth)) return false;
    if (filterDateFrom && e.date < filterDateFrom) return false;
    if (filterDateTo && e.date > filterDateTo) return false;
    if (filterCategory !== 'all' && e.category !== filterCategory) return false;
    if (filterSubcat && !e.subcategory?.toLowerCase().includes(filterSubcat.toLowerCase())) return false;
    if (filterMember !== 'all' && e.family_member !== filterMember) return false;
    if (filterPayment !== 'all' && e.payment_method !== filterPayment) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.description?.toLowerCase().includes(q) &&
          !e.category?.toLowerCase().includes(q) &&
          !e.notes?.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [expenses, filterYear, filterMonth, filterDateFrom, filterDateTo,
       filterCategory, filterSubcat, filterMember, filterPayment, search]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Analytics ──────────────────────────────────────────────────────────────
  const analytics = useMemo(() => {
    const totalSpend = filtered.reduce((s: number, e: any) => s + e.amount, 0);
    const now = new Date();
    const monthlySpend = expenses.filter((e: any) => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((s: number, e: any) => s + e.amount, 0);

    // By category
    const byCategory: Record<string, number> = {};
    filtered.forEach((e: any) => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    const categoryData = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, value]) => ({ name, value: value as number }));

    // Monthly trend (last 12 months from filtered)
    const monthlyTrend: Record<string, number> = {};
    filtered.forEach((e: any) => {
      const key = new Date(e.date).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
      monthlyTrend[key] = (monthlyTrend[key] || 0) + e.amount;
    });
    const trendData = Object.entries(monthlyTrend).slice(-12)
      .map(([month, amount]) => ({ month, amount: amount as number }));

    // Weekly trend (last 8 weeks)
    const weeklyMap: Record<string, number> = {};
    filtered.forEach((e: any) => {
      const d = new Date(e.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
      weeklyMap[key] = (weeklyMap[key] || 0) + e.amount;
    });
    const weeklyData = Object.entries(weeklyMap).slice(-8)
      .map(([week, amount]) => ({ week, amount: amount as number }));

    // Avg monthly / avg weekly per category
    const months = Object.keys(monthlyTrend).length || 1;
    const weeks = Object.keys(weeklyMap).length || 1;
    const avgMonthlyByCategory = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, total]) => ({ name, avg: (total as number) / months }));

    // Top 10
    const top10 = categoryData.slice(0, 10);

    // Avg monthly spend overall
    const avgMonthly = months > 0 ? totalSpend / months : 0;
    const avgWeekly = weeks > 0 ? totalSpend / weeks : 0;

    return { totalSpend, monthlySpend, categoryData, trendData, weeklyData,
             avgMonthlyByCategory, top10, avgMonthly, avgWeekly, months };
  }, [filtered, expenses]);

  // ── Subcategories derived from current expenses ────────────────────────────
  const subcats = useMemo(() => {
    const s = new Set<string>();
    expenses.forEach((e: any) => { if (e.subcategory) s.add(e.subcategory); });
    return Array.from(s).sort();
  }, [expenses]);

  // ── Selection helpers ──────────────────────────────────────────────────────
  const allPageSelected = paginated.length > 0 && paginated.every((e: any) => selected.has(e.id));
  const allFilteredSelected = filtered.length > 0 && filtered.every((e: any) => selected.has(e.id));

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const togglePageSelect = () => {
    if (allPageSelected) {
      setSelected(prev => { const n = new Set(prev); paginated.forEach((e: any) => n.delete(e.id)); return n; });
    } else {
      setSelected(prev => { const n = new Set(prev); paginated.forEach((e: any) => n.add(e.id)); return n; });
    }
  };
  const selectAllFiltered = () => setSelected(new Set(filtered.map((e: any) => e.id)));
  const selectAll = () => setSelected(new Set(expenses.map((e: any) => e.id)));
  const clearSelection = () => setSelected(new Set());

  // ── Bulk delete ────────────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    for (const id of ids) {
      await apiRequest('DELETE', `/api/expenses/${id}`);
    }
    await qc.invalidateQueries({ queryKey: ['/api/expenses'] });
    clearSelection();
    toast({ title: `Deleted ${ids.length} expense records`, description: 'Bulk delete complete.' });
    setShowBulkModal(false);
  };

  const handleExportBackup = () => {
    const toExport = expenses.filter((e: any) => selected.has(e.id));
    const data = toExport.map((e: any) => ({
      Date: e.date, Amount: e.amount, Category: e.category,
      'Sub-category': e.subcategory, Description: e.description,
      'Payment Method': e.payment_method, 'Family Member': e.family_member,
      Recurring: e.recurring ? 'Yes' : 'No', Notes: e.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Backup');
    XLSX.writeFile(wb, `Shahrokh_Expenses_Backup_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Backup exported', description: `${data.length} records saved to Excel.` });
  };

  // ── Excel import / export ─────────────────────────────────────────────────
  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      const mapped = rows.slice(1).filter(r => r[0] && r[1]).map(r => ({
        date: r[0] instanceof Date ? r[0].toISOString().split('T')[0] : String(r[0]).split('T')[0],
        amount: parseFloat(r[1]) || 0,
        category: r[2] || 'Other',
        subcategory: r[3] || '',
        description: r[4] || '',
        payment_method: r[5] || '',
        family_member: r[6] || '',
        recurring: r[7] === 'Yes' || r[7] === true,
        notes: r[8] || '',
      }));
      bulkMut.mutate(mapped);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleExcelExport = () => {
    const data = expenses.map((e: any) => ({
      Date: e.date, Amount: e.amount, Category: e.category,
      'Sub-category': e.subcategory, Description: e.description,
      'Payment Method': e.payment_method, 'Family Member': e.family_member,
      Recurring: e.recurring ? 'Yes' : 'No', Notes: e.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
    XLSX.writeFile(wb, `Shahrokh_Expenses_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Exported', description: 'Expenses exported to Excel.' });
  };

  const handleDownloadTemplate = () => {
    const headers = [['Date', 'Amount', 'Category', 'Sub-category', 'Description', 'Payment Method', 'Family Member', 'Recurring', 'Notes']];
    const sample = [['2026-04-01', '2500', 'Mortgage', '', 'Monthly mortgage payment', 'Bank Transfer', 'Roham Shahrokh', 'Yes', '']];
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'Shahrokh_Expense_Template.xlsx');
  };

  const resetFilters = () => {
    setFilterYear('all'); setFilterMonth('all'); setFilterCategory('all');
    setFilterSubcat(''); setFilterMember('all'); setFilterPayment('all');
    setFilterDateFrom(''); setFilterDateTo(''); setSearch(''); setPage(1);
  };

  return (
    <div className="space-y-5 pb-8">

      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">Expense Tracker</h1>
          <p className="text-muted-foreground text-sm">Track all family spending</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={handleExcelExport} className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
          <Button size="sm" variant="outline" onClick={handleDownloadTemplate} className="gap-1.5">
            <Download className="w-3.5 h-3.5" /> Template
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="gap-1.5">
            <Upload className="w-3.5 h-3.5" /> Import Excel
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelImport} />
          <Button
            size="sm"
            onClick={() => setShowAdd(true)}
            className="gap-1.5"
            style={{ background: 'linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))', color: 'hsl(224,40%,8%)', border: 'none' }}
          >
            <Plus className="w-3.5 h-3.5" /> Add Expense
          </Button>
        </div>
      </div>

      {/* ─── KPI cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total (filtered)', value: formatCurrency(analytics.totalSpend, true) },
          { label: 'This Month', value: formatCurrency(analytics.monthlySpend, true) },
          { label: 'Avg Monthly', value: formatCurrency(analytics.avgMonthly, true) },
          { label: 'Transactions', value: filtered.length.toString() },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-lg font-bold num-display mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* ─── Analytics charts ────────────────────────────────── */}
      {analytics.categoryData.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Category breakdown */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-bold mb-4">Spending by Category</h3>
            <div className="flex items-center gap-3">
              <ResponsiveContainer width="45%" height={200}>
                <PieChart>
                  <Pie data={analytics.categoryData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                    {analytics.categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v, true)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1 text-xs">
                {analytics.categoryData.slice(0, 8).map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-muted-foreground truncate max-w-[90px]">{d.name}</span>
                    </div>
                    <span className="font-semibold num-display">{formatCurrency(d.value, true)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Monthly trend */}
          {analytics.trendData.length > 1 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-bold mb-4">Monthly Spend Trend</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={analytics.trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="amount" name="Spend" fill="hsl(43,85%,55%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Weekly trend */}
          {analytics.weeklyData.length > 1 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-bold mb-4">Weekly Spend Trend</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={analytics.weeklyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v/1000).toFixed(1)}K`} />
                  <Tooltip content={<ChartTip />} />
                  <Line type="monotone" dataKey="amount" name="Spend" stroke="hsl(188,60%,48%)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Avg monthly by category */}
          {analytics.avgMonthlyByCategory.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-bold mb-4">Avg Monthly by Category</h3>
              <div className="space-y-2">
                {analytics.avgMonthlyByCategory.slice(0, 8).map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-muted-foreground w-32 truncate">{d.name}</span>
                    <div className="flex-1 bg-secondary/30 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{
                        background: COLORS[i % COLORS.length],
                        width: `${Math.min(100, (d.avg / (analytics.avgMonthlyByCategory[0]?.avg || 1)) * 100)}%`
                      }} />
                    </div>
                    <span className="font-semibold num-display w-16 text-right">{formatCurrency(d.avg, true)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Add Form ────────────────────────────────────────── */}
      {showAdd && (
        <div className="rounded-xl border border-primary/30 bg-card p-5">
          <h3 className="text-sm font-bold mb-4">Add Expense</h3>
          <ExpenseForm data={draft} onChange={handleDraftChange} />
          <div className="flex gap-2 mt-4">
            <SaveButton label="Save Expense Entry" onSave={() => createMut.mutateAsync(normaliseDraft(draft))} />
            <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ─── Filters ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        {/* Basic row */}
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 pl-8 text-sm" />
          </div>
          <Select value={filterYear} onValueChange={v => { setFilterYear(v); setPage(1); }}>
            <SelectTrigger className="h-8 text-sm w-28"><SelectValue placeholder="Year" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterMonth} onValueChange={v => { setFilterMonth(v); setPage(1); }}>
            <SelectTrigger className="h-8 text-sm w-32"><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Months</SelectItem>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={v => { setFilterCategory(v); setPage(1); }}>
            <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" onClick={() => setShowAdvancedFilters(v => !v)} className="gap-1 text-xs h-8">
            <Filter className="w-3 h-3" /> Advanced <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`} />
          </Button>
          <Button size="sm" variant="ghost" onClick={resetFilters} className="text-xs h-8 text-muted-foreground">Reset</Button>
        </div>

        {/* Advanced filters */}
        {showAdvancedFilters && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border">
            <div>
              <label className="text-xs text-muted-foreground">Sub-category</label>
              <Input value={filterSubcat} onChange={e => { setFilterSubcat(e.target.value); setPage(1); }}
                placeholder="Filter sub-cat..." className="h-8 text-sm mt-0.5" list="subcats-list" />
              <datalist id="subcats-list">{subcats.map(s => <option key={s} value={s} />)}</datalist>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Family Member</label>
              <Select value={filterMember} onValueChange={v => { setFilterMember(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue placeholder="Member" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  {FAMILY_MEMBERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Payment Method</label>
              <Select value={filterPayment} onValueChange={v => { setFilterPayment(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue placeholder="Payment" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  {PAYMENT_METHODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Date From</label>
              <Input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }} className="h-8 text-sm mt-0.5" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Date To</label>
              <Input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }} className="h-8 text-sm mt-0.5" />
            </div>
          </div>
        )}
      </div>

      {/* ─── Bulk toolbar (shows when rows selected) ──────────── */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-xl border px-4 py-2.5 text-sm"
          style={{ borderColor: 'hsl(0,72%,35%)', background: 'hsl(0,50%,8%)' }}>
          <span className="text-red-300 font-semibold">{selected.size} selected</span>
          <Button size="sm" variant="ghost" onClick={togglePageSelect} className="text-xs h-7">
            {allPageSelected ? 'Deselect page' : 'Select page'}
          </Button>
          <Button size="sm" variant="ghost" onClick={selectAllFiltered} className="text-xs h-7">
            Select all {filtered.length} filtered
          </Button>
          <Button size="sm" variant="ghost" onClick={selectAll} className="text-xs h-7">
            Select all {expenses.length} records
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection} className="text-xs h-7 text-muted-foreground">
            Clear
          </Button>
          <div className="flex-1" />
          <Button size="sm" onClick={() => setShowBulkModal(true)}
            className="gap-1.5 bg-red-600 hover:bg-red-700 text-white border-0 h-7 text-xs">
            <Trash2 className="w-3 h-3" /> Delete {selected.size} records
          </Button>
        </div>
      )}

      {/* ─── Expense table ───────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                {/* Checkbox column */}
                <th className="px-3 py-2.5 w-8">
                  <button onClick={togglePageSelect} className="flex items-center justify-center text-muted-foreground hover:text-foreground">
                    {allPageSelected
                      ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                      : <Square className="w-3.5 h-3.5" />}
                  </button>
                </th>
                {['Date', 'Amount', 'Category', 'Sub-cat', 'Description', 'Payment', 'Member', 'Recurring', 'Actions'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={10} className="py-10 text-center text-sm text-muted-foreground">No expenses found.</td></tr>
              ) : paginated.map((e: any) => {
                if (editingId === e.id && editDraft) {
                  return (
                    <tr key={e.id} className="border-b border-border bg-secondary/20">
                      <td colSpan={10} className="p-3">
                        <ExpenseForm data={editDraft} onChange={handleEditDraftChange} />
                        <div className="flex gap-2 mt-3">
                          <SaveButton label="Save Expense Entry" onSave={() => updateMut.mutateAsync({ id: e.id, data: normaliseDraft(editDraft) })} />
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                const isSelected = selected.has(e.id);
                return (
                  <tr key={e.id}
                    className={`border-b border-border/50 hover:bg-secondary/20 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`}
                    onClick={() => toggleSelect(e.id)}
                  >
                    <td className="px-3 py-2" onClick={ev => ev.stopPropagation()}>
                      <button onClick={() => toggleSelect(e.id)} className="flex items-center justify-center text-muted-foreground hover:text-foreground">
                        {isSelected
                          ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                          : <Square className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-xs">{e.date}</td>
                    <td className="px-3 py-2 text-xs font-bold num-display text-primary">{formatCurrency(e.amount)}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{e.category}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{e.subcategory}</td>
                    <td className="px-3 py-2 text-xs max-w-[150px] truncate">{e.description}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{e.payment_method}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{e.family_member}</td>
                    <td className="px-3 py-2 text-xs">{e.recurring ? '🔄' : '—'}</td>
                    <td className="px-3 py-2" onClick={ev => ev.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="w-6 h-6"
                          onClick={() => { setEditingId(e.id); setEditDraft({ ...e }); }}>
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="w-6 h-6 text-red-400"
                          onClick={() => deleteMut.mutate(e.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              {filtered.length} results · Page {page} of {Math.ceil(filtered.length / PAGE_SIZE)}
            </p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <Button size="sm" variant="outline" disabled={page >= Math.ceil(filtered.length / PAGE_SIZE)} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Bulk delete modal ───────────────────────────────── */}
      <BulkDeleteModal
        open={showBulkModal}
        count={selected.size}
        label="expense records"
        onConfirm={handleBulkDelete}
        onCancel={() => setShowBulkModal(false)}
        onExportBackup={handleExportBackup}
      />
    </div>
  );
}

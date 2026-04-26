import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/finance";
import SaveButton from "@/components/SaveButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Plus, Trash2, Edit2, Upload, Download, Search } from "lucide-react";
import * as XLSX from "xlsx";

const CATEGORIES = [
  'Mortgage', 'Childcare', 'Groceries', 'Eating Out', 'Fuel', 'Car Loan',
  'Insurance', 'Utilities', 'Health', 'Education', 'Shopping', 'Entertainment',
  'Travel', 'Subscriptions', 'Personal Care', 'Investments', 'Other'
];

const FAMILY_MEMBERS = ['Roham Shahrokh', 'Fara Ghiyasi', 'Yara Shahrokh', 'Jana Shahrokh', 'Family'];
const PAYMENT_METHODS = ['Bank Transfer', 'Credit Card', 'Debit Card', 'Cash', 'Offset Account', 'BPAY'];

const COLORS = ['hsl(43,85%,55%)', 'hsl(188,60%,48%)', 'hsl(142,60%,45%)', 'hsl(20,80%,55%)',
  'hsl(270,60%,60%)', 'hsl(0,72%,51%)', 'hsl(60,80%,50%)', 'hsl(300,60%,55%)',
  'hsl(200,70%,55%)', 'hsl(160,65%,48%)'];

const EMPTY_EXPENSE = {
  date: new Date().toISOString().split('T')[0],
  amount: '' as any,
  category: 'Other', subcategory: '', description: '',
  payment_method: '', family_member: '', recurring: false, notes: '',
};

// ─── ExpenseForm is defined OUTSIDE the parent so React never remounts it ──────
// This is the root cause fix for focus-loss: inline sub-components cause React
// to treat them as new component types on every parent render → unmount/remount.
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
        <Input
          type="number"
          value={data.amount}
          onChange={e => onChange({ ...data, amount: e.target.value })}
          className="h-8 text-sm num-display"
          step="0.01"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Category</label>
        <Select value={data.category} onValueChange={v => onChange({ ...data, category: v })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
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
          <SelectContent>
            {PAYMENT_METHODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Family Member</label>
        <Select value={data.family_member} onValueChange={v => onChange({ ...data, family_member: v })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
          <SelectContent>
            {FAMILY_MEMBERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Notes</label>
        <Input value={data.notes} onChange={e => onChange({ ...data, notes: e.target.value })} className="h-8 text-sm" />
      </div>
      <div className="flex items-end gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={data.recurring} onChange={e => onChange({ ...data, recurring: e.target.checked })} className="rounded" />
          Recurring
        </label>
      </div>
    </div>
  );
}

// Normalise a draft to ensure amount is a proper number before saving
function normaliseDraft(d: ExpenseFormData) {
  return { ...d, amount: parseFloat(String(d.amount)) || 0 };
}

export default function ExpensesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<ExpenseFormData>({ ...EMPTY_EXPENSE });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ExpenseFormData | null>(null);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterMember, setFilterMember] = useState('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Stable onChange callbacks — never recreated → no remount
  const handleDraftChange = useCallback((d: ExpenseFormData) => setDraft(d), []);
  const handleEditDraftChange = useCallback((d: ExpenseFormData) => setEditDraft(d), []);

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

  // Filter & search
  const filtered = expenses.filter((e: any) => {
    const matchSearch = !search || e.description?.toLowerCase().includes(search.toLowerCase()) || e.category?.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCategory === 'all' || e.category === filterCategory;
    const matchMember = filterMember === 'all' || e.family_member === filterMember;
    return matchSearch && matchCat && matchMember;
  });

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Stats
  const totalSpend = expenses.reduce((s: number, e: any) => s + e.amount, 0);
  const monthlySpend = expenses.filter((e: any) => {
    const m = new Date().getMonth();
    const y = new Date().getFullYear();
    const d = new Date(e.date);
    return d.getMonth() === m && d.getFullYear() === y;
  }).reduce((s: number, e: any) => s + e.amount, 0);

  const byCategory: Record<string, number> = {};
  expenses.forEach((e: any) => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
  const categoryData = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value: value as number }));

  // Monthly trend
  const monthlyTrend: Record<string, number> = {};
  expenses.forEach((e: any) => {
    const key = new Date(e.date).toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
    monthlyTrend[key] = (monthlyTrend[key] || 0) + e.amount;
  });
  const trendData = Object.entries(monthlyTrend)
    .slice(-12)
    .map(([month, amount]) => ({ month, amount: amount as number }));

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      const expenses = rows.slice(1).filter(r => r[0] && r[1]).map(r => ({
        date: r[0] instanceof Date ? r[0].toISOString().split('T')[0] : String(r[0]).split('T')[0] || new Date().toISOString().split('T')[0],
        amount: parseFloat(r[1]) || 0,
        category: r[2] || 'Other',
        subcategory: r[3] || '',
        description: r[4] || '',
        payment_method: r[5] || '',
        family_member: r[6] || '',
        recurring: r[7] === 'Yes' || r[7] === true,
        notes: r[8] || '',
      }));
      bulkMut.mutate(expenses);
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

  return (
    <div className="space-y-5 pb-8">
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
            data-testid="button-add-expense"
          >
            <Plus className="w-3.5 h-3.5" /> Add Expense
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Spend (YTD)', value: formatCurrency(totalSpend, true) },
          { label: 'This Month', value: formatCurrency(monthlySpend, true) },
          { label: 'Avg. Daily', value: formatCurrency(expenses.length > 0 ? totalSpend / 365 : 0) },
          { label: 'Transactions', value: expenses.length.toString() },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-lg font-bold num-display mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      {categoryData.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-bold mb-4">Spending by Category</h3>
            <div className="flex items-center gap-3">
              <ResponsiveContainer width="45%" height={200}>
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                    {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v, true)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1 text-xs">
                {categoryData.slice(0, 8).map((d, i) => (
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

          {trendData.length > 1 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-bold mb-4">Monthly Spend Trend</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v, true)} />
                  <Bar dataKey="amount" name="Spend" fill="hsl(43,85%,55%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Add Form — ExpenseForm is a stable top-level component, no remount */}
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

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Select value={filterCategory} onValueChange={v => { setFilterCategory(v); setPage(1); }}>
          <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterMember} onValueChange={v => { setFilterMember(v); setPage(1); }}>
          <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="Member" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Members</SelectItem>
            {FAMILY_MEMBERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Expense Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                {['Date', 'Amount', 'Category', 'Sub-cat', 'Description', 'Payment', 'Member', 'Recurring', 'Actions'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={9} className="py-10 text-center text-sm text-muted-foreground">No expenses found. Add one above.</td></tr>
              ) : paginated.map((e: any) => {
                if (editingId === e.id && editDraft) {
                  return (
                    <tr key={e.id} className="border-b border-border bg-secondary/20">
                      <td colSpan={9} className="p-3">
                        <ExpenseForm data={editDraft} onChange={handleEditDraftChange} />
                        <div className="flex gap-2 mt-3">
                          <SaveButton label="Save Expense Entry" onSave={() => updateMut.mutateAsync({ id: e.id, data: normaliseDraft(editDraft) })} />
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={e.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
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
                    <td className="px-3 py-2">
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
            <p className="text-xs text-muted-foreground">{filtered.length} total · Page {page} of {Math.ceil(filtered.length / PAGE_SIZE)}</p>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <Button size="sm" variant="outline" disabled={page >= Math.ceil(filtered.length / PAGE_SIZE)} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

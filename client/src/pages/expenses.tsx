import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/finance";
import SaveButton from "@/components/SaveButton";
import BulkDeleteModal from "@/components/BulkDeleteModal";
import AutoImportPanel from "@/components/AutoImportPanel";
import AIInsightsCard from "@/components/AIInsightsCard";
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
  CheckSquare, Square, ChevronDown, Filter, TrendingDown, AlertTriangle, X,
  RefreshCw, Zap,
} from "lucide-react";
import * as XLSX from "xlsx";

// ─── Master category list ─────────────────────────────────────────────────────
const CATEGORIES = [
  'Housing / Mortgage',
  'Utilities',
  'Groceries',
  'Dining Out / Coffee',
  'Childcare',
  'Kids Expenses',
  'Transport / Fuel',
  'Car Loan / Car Expenses',
  'Insurance',
  'Health / Medical',
  'Shopping',
  'Subscriptions',
  'Entertainment',
  'Fitness',
  'Education',
  'Travel',
  'Gifts',
  'Home Maintenance',
  'Investment Costs',
  'Debt Repayment',
  'Other',
];

// ─── Source code → category map ───────────────────────────────────────────────
export const SOURCE_CODE_MAP: Record<string, string> = {
  D:  'Groceries',
  M:  'Health / Medical',
  T:  'Transport / Fuel',
  E:  'Entertainment',
  C:  'Car Loan / Car Expenses',
  B:  'Shopping',
  R:  'Housing / Mortgage',
  G:  'Gifts',
  S:  'Fitness',
  L:  'Debt Repayment',
  PI: 'Insurance',
  I:  'Investment Costs',
  U:  'Utilities',
  BB: 'Kids Expenses',
  CC: 'Childcare',
  TR: 'Travel',
  // backward compat — old codes
  F:  'Other',
  RN: 'Other',
  MF: 'Other',
};

// All display codes for the Source Code filter dropdown
const ALL_SOURCE_CODES = ['D', 'M', 'T', 'E', 'C', 'B', 'R', 'G', 'S', 'L', 'PI', 'I', 'U', 'BB', 'CC', 'TR'];

const FAMILY_MEMBERS = ['Roham Shahrokh', 'Fara Ghiyasi', 'Yara Shahrokh', 'Jana Shahrokh', 'Family'];
const PAYMENT_METHODS = ['Bank Transfer', 'Credit Card', 'Debit Card', 'Cash', 'Offset Account', 'BPAY'];
const COLORS = [
  'hsl(43,85%,55%)', 'hsl(188,60%,48%)', 'hsl(142,60%,45%)', 'hsl(20,80%,55%)',
  'hsl(270,60%,60%)', 'hsl(0,72%,51%)', 'hsl(60,80%,50%)', 'hsl(300,60%,55%)',
  'hsl(200,70%,55%)', 'hsl(160,65%,48%)',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
// ISO weeks 01–52
const WEEKS = Array.from({ length: 52 }, (_, i) => `W${String(i + 1).padStart(2, '0')}`);

// ─── Helper: get ISO week number ──────────────────────────────────────────────
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ─── Migration helpers ────────────────────────────────────────────────────────
const LEGACY_CATEGORY_MAP: Record<string, string> = {
  'Personal Care': 'Shopping',
  // old category names → new names
  'Mortgage': 'Housing / Mortgage',
  'Eating Out': 'Dining Out / Coffee',
  'Fuel': 'Transport / Fuel',
  'Car Loan': 'Car Loan / Car Expenses',
  'Health': 'Health / Medical',
  'Investments': 'Investment Costs',
};

// ─── Shared code-to-category mapper (used everywhere) ────────────────────────
export function mapExpenseCodeToCategory(code: string): string {
  if (!code) return '';
  const upper = code.trim().toUpperCase();
  // Direct lookup
  if (SOURCE_CODE_MAP[upper]) return SOURCE_CODE_MAP[upper];
  // Check if it's actually a category name (reverse lookup)
  const reverseEntry = Object.entries(SOURCE_CODE_MAP).find(
    ([, cat]) => cat.toLowerCase() === upper.toLowerCase()
  );
  return reverseEntry ? reverseEntry[1] : '';
}

function migrateExpense(e: any): any {
  let category = e.category || 'Other';
  // Check all possible code fields in priority order
  const codeFields = [e.source_code, e.subcategory, e.sub_category, e.code, e.sourceCode];
  for (const rawField of codeFields) {
    if (!rawField) continue;
    const mapped = mapExpenseCodeToCategory(String(rawField));
    if (mapped) {
      category = mapped;
      break;
    }
  }
  // If still 'Other', try legacy category name remapping
  if (category === 'Other' || LEGACY_CATEGORY_MAP[category]) {
    category = LEGACY_CATEGORY_MAP[category] || category;
  }
  return { ...e, category };
}

// ─── Empty expense & form types ───────────────────────────────────────────────
const EMPTY_EXPENSE = {
  date: new Date().toISOString().split('T')[0],
  amount: '' as any,
  category: 'Other',
  subcategory: '',
  description: '',
  payment_method: '',
  family_member: '',
  recurring: false,
  notes: '',
  source_code: '',
};

interface ExpenseFormData {
  date: string;
  amount: any;
  category: string;
  subcategory: string;
  description: string;
  payment_method: string;
  family_member: string;
  recurring: boolean;
  notes: string;
  source_code: string;
}

interface ExpenseFormProps {
  data: ExpenseFormData;
  onChange: (d: ExpenseFormData) => void;
}

// ─── ExpenseForm defined OUTSIDE parent — prevents focus-loss on re-render ────
function ExpenseForm({ data, onChange }: ExpenseFormProps) {
  const handleSourceCodeChange = (raw: string) => {
    const code = raw.trim().toUpperCase().slice(0, 4);
    const autoCategory = SOURCE_CODE_MAP[code];
    if (['F', 'RN', 'MF'].includes(code)) {
      console.warn(`[expenses] Legacy source_code '${code}' entered — mapped to Other`);
    }
    onChange({
      ...data,
      source_code: code,
      category: autoCategory || data.category,
    });
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div>
        <label className="text-xs text-muted-foreground">Date</label>
        <Input
          type="date"
          value={data.date}
          onChange={e => onChange({ ...data, date: e.target.value })}
          className="h-8 text-sm"
        />
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
        <label className="text-xs text-muted-foreground">Source Code</label>
        <Input
          value={data.source_code}
          onChange={e => handleSourceCodeChange(e.target.value)}
          placeholder="e.g. D, R, PI…"
          maxLength={4}
          className="h-8 text-sm uppercase"
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
        <Input
          value={data.subcategory}
          onChange={e => onChange({ ...data, subcategory: e.target.value })}
          className="h-8 text-sm"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Description</label>
        <Input
          value={data.description}
          onChange={e => onChange({ ...data, description: e.target.value })}
          className="h-8 text-sm"
        />
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
        <Input
          value={data.notes}
          onChange={e => onChange({ ...data, notes: e.target.value })}
          className="h-8 text-sm"
        />
      </div>
      <div className="flex items-end gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={data.recurring}
            onChange={e => onChange({ ...data, recurring: e.target.checked })}
            className="rounded"
          />
          Recurring
        </label>
      </div>
    </div>
  );
}

function normaliseDraft(d: ExpenseFormData) {
  return {
    ...d,
    amount: parseFloat(String(d.amount)) || 0,
    source_code: d.source_code.trim().toUpperCase(),
  };
}

// ─── Excel date serial → YYYY-MM-DD ──────────────────────────────────────────
function excelSerialToDate(serial: number): string {
  // Excel epoch: Dec 30, 1899. Correction for Lotus 1-2-3 bug (day 60 = Feb 29 1900)
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date = new Date(utc_value * 1000);
  return date.toISOString().split('T')[0];
}

function parseExcelDate(raw: any): { iso: string; wasSerial: boolean } {
  if (!raw && raw !== 0) return { iso: new Date().toISOString().split('T')[0], wasSerial: false };
  // Already a JS Date (cellDates: true worked)
  if (raw instanceof Date) return { iso: raw.toISOString().split('T')[0], wasSerial: false };
  const s = String(raw).trim();
  // Numeric serial
  const num = Number(s);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    return { iso: excelSerialToDate(num), wasSerial: true };
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return { iso: s.split('T')[0], wasSerial: false };
  // DD/MM/YYYY
  const dmatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmatch) {
    const [, d, m, y] = dmatch;
    // Detect DD/MM vs MM/DD: if day > 12 it must be DD/MM
    const day = parseInt(d, 10);
    const mon = parseInt(m, 10);
    if (day > 12) return { iso: `${y}-${mon.toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}`, wasSerial: false };
    // Assume DD/MM/YYYY as default (Australian)
    return { iso: `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`, wasSerial: false };
  }
  // Fallback: try native Date parse
  const dobj = new Date(s);
  if (!isNaN(dobj.getTime())) return { iso: dobj.toISOString().split('T')[0], wasSerial: false };
  return { iso: s, wasSerial: false };
}

// ─── Normalize member name ────────────────────────────────────────────────────
function normalizeMember(raw: string): string {
  if (!raw) return 'Family';
  const s = raw.trim().toLowerCase();
  if (s.includes('roham')) return 'Roham Shahrokh';
  if (s.includes('fara')) return 'Fara Ghiyasi';
  if (s.includes('yara') || s.includes('jana') || s.includes('kids') || s.includes('babies') || s.includes('baby')) return 'Yara Shahrokh';
  if (s.includes('family') || s.includes('household')) return 'Family';
  return 'Family';
}

// ─── Normalize payment method ─────────────────────────────────────────────────
function normalizePaymentMethod(raw: string): string {
  if (!raw) return 'Bank Transfer';
  const s = raw.trim().toLowerCase();
  if (s.includes('bp') || s.includes('bpay')) return 'Bank Transfer';
  if (s.includes('credit')) return 'Credit Card';
  if (s.includes('debit')) return 'Debit Card';
  if (s.includes('offset')) return 'Offset Account';
  if (s.includes('cash')) return 'Cash';
  if (s.includes('transfer') || s.includes('bank')) return 'Bank Transfer';
  return 'Bank Transfer';
}

// ─── Import preview row type ──────────────────────────────────────────────────
interface ImportRow {
  date: string;
  amount: number;
  source_code: string;
  category: string;
  description: string;
  member: string;
  payment_method: string;
  notes: string;
  recurring: boolean;
  warning: string;
  wasSerial?: boolean;
}

// ─── Chart tooltip ────────────────────────────────────────────────────────────
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

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<ExpenseFormData>({ ...EMPTY_EXPENSE });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ExpenseFormData | null>(null);

  // ── Import preview state ────────────────────────────────────────────────────
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [filterYear, setFilterYear] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterWeek, setFilterWeek] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterSourceCode, setFilterSourceCode] = useState('all');
  const [filterSubcat, setFilterSubcat] = useState('');
  const [filterMember, setFilterMember] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // ── Selection state ─────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);

  // ── Stable onChange handlers ────────────────────────────────────────────────
  const handleDraftChange = useCallback((d: ExpenseFormData) => setDraft(d), []);
  const handleEditDraftChange = useCallback((d: ExpenseFormData) => setEditDraft(d), []);

  // ── Data fetching ───────────────────────────────────────────────────────────
  const { data: rawExpenses = [] } = useQuery<any[]>({
    queryKey: ['/api/expenses'],
    queryFn: () => apiRequest('GET', '/api/expenses').then(r => r.json()),
  });

  // Apply migration to all loaded expenses
  const expenses = useMemo(() => rawExpenses.map(migrateExpense), [rawExpenses]);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/expenses', data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/expenses'] });
      setShowAdd(false);
      setDraft({ ...EMPTY_EXPENSE });
    },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest('PUT', `/api/expenses/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/expenses'] });
      setEditingId(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/expenses/${id}`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/expenses'] }),
  });
  const bulkMut = useMutation({
    mutationFn: (data: any[]) => apiRequest('POST', '/api/expenses/bulk', { expenses: data }).then(r => r.json()),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['/api/expenses'] });
      toast({ title: `Imported ${res.created} expenses`, description: 'Excel import complete.' });
    },
  });
  const fixCategoriesMut = useMutation({
    mutationFn: async () => {
      const allExpenses = await apiRequest('GET', '/api/expenses').then(r => r.json()) as any[];
      let fixed = 0;
      const toFix: any[] = [];
      for (const e of allExpenses) {
        const codeFields = [e.source_code, e.subcategory, e.sub_category, e.code];
        let newCategory = e.category;
        for (const rawField of codeFields) {
          if (!rawField) continue;
          const mapped = mapExpenseCodeToCategory(String(rawField));
          if (mapped && mapped !== e.category) {
            newCategory = mapped;
            break;
          }
        }
        if (newCategory !== e.category) {
          toFix.push({ id: e.id, category: newCategory });
          fixed++;
        }
      }
      // Update each record
      await Promise.all(toFix.map(item =>
        apiRequest('PUT', `/api/expenses/${item.id}`, { category: item.category })
      ));
      return { fixed, total: allExpenses.length };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['/api/expenses'] });
      toast({ title: `Categories Fixed`, description: `${result.fixed} of ${result.total} records updated.` });
    },
    onError: () => toast({ title: 'Fix failed', variant: 'destructive' }),
  });

  // ── Filter logic ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => expenses.filter((e: any) => {
    const d = new Date(e.date);
    const yr = parseInt(filterYear);
    if (filterYear !== 'all' && d.getFullYear() !== yr) return false;
    if (filterMonth !== 'all' && d.getMonth() !== parseInt(filterMonth)) return false;
    if (filterWeek !== 'all') {
      // Only match week within the selected year (or current year if no year filter)
      const weekNum = parseInt(filterWeek.replace('W', ''));
      if (getISOWeek(d) !== weekNum) return false;
      // Also restrict to the year if year filter is set
      if (filterYear !== 'all' && d.getFullYear() !== yr) return false;
    }
    if (filterDateFrom && e.date < filterDateFrom) return false;
    if (filterDateTo && e.date > filterDateTo) return false;
    if (filterCategory !== 'all' && e.category !== filterCategory) return false;
    if (filterSourceCode !== 'all') {
      if (filterSourceCode === '__unknown__') {
        // "Unknown/Other" — source_code not in the known map, or absent
        const sc = e.source_code ? String(e.source_code).trim().toUpperCase() : '';
        if (sc && SOURCE_CODE_MAP[sc] && SOURCE_CODE_MAP[sc] !== 'Other') return false;
        if (!sc && e.category !== 'Other') return false;
      } else {
        const sc = e.source_code ? String(e.source_code).trim().toUpperCase() : '';
        if (sc !== filterSourceCode) return false;
      }
    }
    if (filterSubcat && !e.subcategory?.toLowerCase().includes(filterSubcat.toLowerCase())) return false;
    if (filterMember !== 'all' && e.family_member !== filterMember) return false;
    if (filterPayment !== 'all' && e.payment_method !== filterPayment) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !e.description?.toLowerCase().includes(q) &&
        !e.category?.toLowerCase().includes(q) &&
        !e.notes?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  }), [expenses, filterYear, filterMonth, filterWeek, filterDateFrom, filterDateTo,
      filterCategory, filterSourceCode, filterSubcat, filterMember, filterPayment, search]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Analytics ───────────────────────────────────────────────────────────────
  const analytics = useMemo(() => {
    const totalSpend = filtered.reduce((s: number, e: any) => s + e.amount, 0);
    const now = new Date();
    const monthlySpend = expenses.filter((e: any) => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((s: number, e: any) => s + e.amount, 0);

    // By category
    const byCategory: Record<string, number> = {};
    filtered.forEach((e: any) => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });
    const categoryData = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, value]) => ({ name, value: value as number }));

    // Monthly trend (last 12 months)
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

    const months = Object.keys(monthlyTrend).length || 1;
    const weeks = Object.keys(weeklyMap).length || 1;
    const avgMonthlyByCategory = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, total]) => ({ name, avg: (total as number) / months }));

    const avgMonthly = months > 0 ? totalSpend / months : 0;
    const avgWeekly = weeks > 0 ? totalSpend / weeks : 0;

    // ── Yearly totals ─────────────────────────────────────────────────────────
    const byYear: Record<string, number> = {};
    filtered.forEach((e: any) => {
      const yr = String(new Date(e.date).getFullYear());
      byYear[yr] = (byYear[yr] || 0) + e.amount;
    });
    const yearlyData = Object.entries(byYear)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([year, amount]) => ({ year, amount: amount as number }));

    // ── Top Growing Categories ────────────────────────────────────────────────
    // Compare last 3 months avg vs prior 3 months avg, using ALL expenses (not filtered)
    const nowMs = now.getTime();
    const ms3mo = 3 * 30 * 24 * 60 * 60 * 1000;
    const last3Start = new Date(nowMs - ms3mo);
    const prior3Start = new Date(nowMs - 2 * ms3mo);

    const last3ByCategory: Record<string, number> = {};
    const prior3ByCategory: Record<string, number> = {};
    expenses.forEach((e: any) => {
      const d = new Date(e.date);
      if (d >= last3Start) {
        last3ByCategory[e.category] = (last3ByCategory[e.category] || 0) + e.amount;
      } else if (d >= prior3Start && d < last3Start) {
        prior3ByCategory[e.category] = (prior3ByCategory[e.category] || 0) + e.amount;
      }
    });

    const growingCategories = CATEGORIES
      .map(cat => {
        const last = (last3ByCategory[cat] || 0) / 3;
        const prior = (prior3ByCategory[cat] || 0) / 3;
        const pct = prior > 0 ? ((last - prior) / prior) * 100 : last > 0 ? 100 : 0;
        return { category: cat, last, prior, pct };
      })
      .filter(c => c.last > 0 || c.prior > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);

    return {
      totalSpend, monthlySpend, categoryData, trendData, weeklyData,
      avgMonthlyByCategory, avgMonthly, avgWeekly, months, yearlyData,
      growingCategories,
    };
  }, [filtered, expenses]);

  // ── Subcategories ────────────────────────────────────────────────────────────
  const subcats = useMemo(() => {
    const s = new Set<string>();
    expenses.forEach((e: any) => { if (e.subcategory) s.add(e.subcategory); });
    return Array.from(s).sort();
  }, [expenses]);

  // ── Selection helpers ────────────────────────────────────────────────────────
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

  // ── Bulk delete ──────────────────────────────────────────────────────────────
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

  // ── Backup export ────────────────────────────────────────────────────────────
  const handleExportBackup = () => {
    const toExport = expenses.filter((e: any) => selected.has(e.id));
    const data = toExport.map((e: any) => ({
      Date: e.date,
      Amount: e.amount,
      'Source Code': e.source_code || '',
      Category: e.category,
      'Sub-category': e.subcategory,
      Description: e.description,
      'Payment Method': e.payment_method,
      'Family Member': e.family_member,
      Recurring: e.recurring ? 'Yes' : 'No',
      Notes: e.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Backup');
    XLSX.writeFile(wb, `Shahrokh_Expenses_Backup_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Backup exported', description: `${data.length} records saved to Excel.` });
  };

  // ── Excel import ─────────────────────────────────────────────────
  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' }) as any[][];
      if (allRows.length < 2) {
        toast({ title: 'Empty file', description: 'No data rows found.', variant: 'destructive' });
        return;
      }
      // Detect header row — find column indices by name
      const headerRow = allRows[0].map((h: any) => String(h ?? '').trim().toLowerCase());
      const col = (names: string[], fallbackPosition?: number): number => {
        // 1. Exact match (lowercased)
        for (const n of names) {
          const idx = headerRow.indexOf(n);
          if (idx >= 0) return idx;
        }
        // 2. Partial match (header contains any of the names)
        for (let i = 0; i < headerRow.length; i++) {
          const h = headerRow[i];
          if (names.some(n => h.includes(n) || n.includes(h))) return i;
        }
        // 3. Positional fallback (for standard template column order)
        if (fallbackPosition !== undefined && headerRow.length > fallbackPosition) {
          return fallbackPosition;
        }
        return -1;
      };
      const colDate    = col(['date'], 0);
      const colAmount  = col(['amount'], 1);
      // Code column: check many names, fallback to position 2
      const colCode    = col(['code', 'source code', 'source_code', 'sub-category', 'subcategory', 'subcat', 'sub cat', 'sourcecode'], 2);
      const colDesc    = col(['description', 'desc', 'details', 'note', 'merchant', 'narration', 'reference'], 3);
      const colMember  = col(['member', 'family member', 'family_member', 'person', 'who'], 4);
      const colPayment = col(['payment method', 'payment_method', 'payment', 'method'], 5);
      const colNotes   = col(['notes', 'note', 'comment', 'comments'], 6);
      const colRecur   = col(['recurring', 'repeat', 'recur'], 7);

      const dataRows = allRows.slice(1);
      const preview: ImportRow[] = [];

      for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
        const r = dataRows[rowIdx];
        // Skip truly empty rows
        const hasDate   = colDate >= 0 && r[colDate] != null && r[colDate] !== '';
        const hasAmount = colAmount >= 0 && r[colAmount] != null && r[colAmount] !== '';
        if (!hasDate && !hasAmount) continue;

        // Date — re-read raw numeric value for serial detection
        const rawDateVal = colDate >= 0 ? r[colDate] : null;
        const rawCell = colDate >= 0 ? ws[XLSX.utils.encode_cell({ r: rowIdx + 1, c: colDate })] : null;
        const rawNumeric = rawCell?.t === 'n' ? rawCell.v : null;
        let dateResult: { iso: string; wasSerial: boolean };
        if (rawNumeric && rawNumeric > 40000) {
          dateResult = { iso: excelSerialToDate(rawNumeric), wasSerial: true };
        } else {
          dateResult = parseExcelDate(rawDateVal);
        }

        // Amount
        const amount = parseFloat(String(colAmount >= 0 ? r[colAmount] : 0).replace(/[^0-9.-]/g, '')) || 0;

        // Code + Category
        const rawCode = colCode >= 0 ? String(r[colCode] ?? '').trim().toUpperCase() : '';
        // If rawCode looks like a full category name (contains space, longer than 4 chars), try reverse mapping
        let resolvedCode = rawCode;
        if (rawCode.length > 4 || rawCode.includes(' ')) {
          // Try to find which code maps to this category
          const reverseEntry = Object.entries(SOURCE_CODE_MAP).find(
            ([, cat]) => cat.toLowerCase() === rawCode.toLowerCase()
          );
          resolvedCode = reverseEntry ? reverseEntry[0] : rawCode;
        }
        const mapped  = SOURCE_CODE_MAP[resolvedCode] || SOURCE_CODE_MAP[rawCode];
        const isLegacy  = ['F', 'RN', 'MF'].includes(rawCode);
        const isUnknown = rawCode && !SOURCE_CODE_MAP[rawCode] && !mapped;

        // Member
        const rawMember = colMember >= 0 ? String(r[colMember] ?? '') : '';
        const member = normalizeMember(rawMember);

        // Payment Method
        const rawPayment = colPayment >= 0 ? String(r[colPayment] ?? '') : '';
        const payment_method = normalizePaymentMethod(rawPayment);

        // Notes
        const notes = colNotes >= 0 ? String(r[colNotes] ?? '') : '';

        // Recurring
        const recurRaw = colRecur >= 0 ? String(r[colRecur] ?? '').toLowerCase() : '';
        const recurring = recurRaw === 'yes' || recurRaw === 'true' || recurRaw === '1';

        // Description
        const description = colDesc >= 0 ? String(r[colDesc] ?? '') : '';

        // Warning
        let warning = '';
        if (dateResult.wasSerial) warning += `Date converted from serial (${rawNumeric}). `;
        if (isUnknown) warning += `Unknown code "${rawCode}" → Other. `;
        if (isLegacy)  warning += `Legacy code "${rawCode}" → Other. `;
        if (amount <= 0) warning += `Invalid amount. `;

        preview.push({
          date: dateResult.iso,
          amount,
          source_code: resolvedCode,
          category: mapped || 'Other',
          description,
          member,
          payment_method,
          notes,
          recurring,
          warning: warning.trim(),
          wasSerial: dateResult.wasSerial,
        });
      }

      setImportRows(preview);
      setShowImportModal(true);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleConfirmImport = () => {
    // Build a set of existing fingerprints for duplicate detection
    const existingFingerprints = new Set(
      (expenses as any[]).map(e =>
        `${e.date}|${Number(e.amount).toFixed(2)}|${(e.source_code || '').toUpperCase()}|${(e.description || '').trim().toLowerCase()}`
      )
    );

    let skipped = 0;
    let added = 0;
    const toCreate: any[] = [];

    for (const r of importRows) {
      const fp = `${r.date}|${Number(r.amount).toFixed(2)}|${r.source_code.toUpperCase()}|${r.description.trim().toLowerCase()}`;
      if (existingFingerprints.has(fp)) {
        skipped++;
        continue;
      }
      added++;
      toCreate.push({
        date: r.date,
        amount: r.amount,
        source_code: r.source_code,
        category: r.category,
        subcategory: '',
        description: r.description,
        payment_method: r.payment_method || 'Bank Transfer',
        family_member: r.member || 'Family',
        recurring: r.recurring || false,
        notes: r.notes || '',
      });
    }

    if (toCreate.length > 0) {
      bulkMut.mutate(toCreate, {
        onSuccess: () => {
          toast({
            title: `Import Complete`,
            description: `${added} added, ${skipped} skipped as duplicates.`,
          });
          // Auto-clear filters and show newly imported data
          const importedYears = toCreate
            .map((r: any) => { const d = new Date(r.date); return isNaN(d.getTime()) ? null : d.getFullYear(); })
            .filter((y: number | null): y is number => y !== null);
          if (importedYears.length > 0) {
            const latestImportedYear = Math.max(...importedYears);
            setFilterYear(String(latestImportedYear));
          } else {
            setFilterYear('all');
          }
          setFilterMonth('all'); setFilterWeek('all');
          setFilterCategory('all'); setFilterSourceCode('all');
          setFilterSubcat(''); setFilterMember('all'); setFilterPayment('all');
          setFilterDateFrom(''); setFilterDateTo(''); setSearch(''); setPage(1);
          // Re-fetch to ensure latest data is displayed
          qc.invalidateQueries({ queryKey: ['/api/expenses'] });
          // Log to import history in localStorage
          const history = JSON.parse(localStorage.getItem('sf_import_history') || '[]');
          history.unshift({
            id: Date.now(),
            timestamp: new Date().toISOString(),
            trigger: 'Manual',
            checked: importRows.length,
            added,
            skipped,
            status: 'Success',
            error: '',
            source: 'manual-upload',
          });
          localStorage.setItem('sf_import_history', JSON.stringify(history.slice(0, 100)));
        },
      });
    } else {
      toast({ title: 'No new records', description: `All ${skipped} rows already exist.` });
      const history = JSON.parse(localStorage.getItem('sf_import_history') || '[]');
      history.unshift({
        id: Date.now(),
        timestamp: new Date().toISOString(),
        trigger: 'Manual',
        checked: importRows.length,
        added: 0,
        skipped,
        status: 'Success',
        error: '',
        source: 'manual-upload',
      });
      localStorage.setItem('sf_import_history', JSON.stringify(history.slice(0, 100)));
    }

    setShowImportModal(false);
    setImportRows([]);
  };

  // ── Excel export ─────────────────────────────────────────────────────────────
  const handleExcelExport = () => {
    const data = expenses.map((e: any) => ({
      Date: e.date,
      Amount: e.amount,
      'Source Code': e.source_code || '',
      Category: e.category,
      'Sub-category': e.subcategory,
      Description: e.description,
      'Payment Method': e.payment_method,
      'Family Member': e.family_member,
      Recurring: e.recurring ? 'Yes' : 'No',
      Notes: e.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
    XLSX.writeFile(wb, `Shahrokh_Expenses_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Exported', description: 'Expenses exported to Excel.' });
  };

  // ── Download template ───────────────────────────────────────────────────
  const handleDownloadTemplate = () => {
    const headers = [['Date', 'Amount', 'Code', 'Description', 'Member', 'Payment Method', 'Notes', 'Recurring']];
    const sample = [
      ['2026-04-01', '150.00', 'D', 'Weekly groceries — Coles', 'Family', 'Debit Card', '', 'No'],
      ['2026-04-05', '2500.00', 'R', 'Monthly mortgage payment', 'Roham', 'Bank Transfer', 'Fixed mortgage', 'Yes'],
      ['2026-04-10', '80.00', 'T', 'Petrol — BP Station', 'Roham', 'Credit Card', '', 'No'],
      ['2026-04-12', '45.00', 'CC', 'Childcare — Little Learners', 'Kids', 'Bank Transfer', '', 'No'],
      ['2026-04-15', '320.00', 'PI', 'Car insurance renewal', 'Family', 'Bank Transfer', 'Annual policy', 'No'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'Shahrokh_Expense_Template.xlsx');
  };

  const resetFilters = () => {
    setFilterYear('all'); setFilterMonth('all'); setFilterWeek('all');
    setFilterCategory('all'); setFilterSourceCode('all');
    setFilterSubcat(''); setFilterMember('all'); setFilterPayment('all');
    setFilterDateFrom(''); setFilterDateTo(''); setSearch(''); setPage(1);
  };

  // Detect if any filter is active
  const hasActiveFilters = filterYear !== 'all' || filterMonth !== 'all' || filterWeek !== 'all'
    || filterCategory !== 'all' || filterSourceCode !== 'all' || filterSubcat !== ''
    || filterMember !== 'all' || filterPayment !== 'all'
    || filterDateFrom !== '' || filterDateTo !== '' || search !== '';

  // Auto-detect and apply latest year from expenses
  useEffect(() => {
    if (!rawExpenses || rawExpenses.length === 0) return;
    // Only auto-detect when no filter is set yet (on first load)
    if (filterYear !== 'all') return;
    // Find the most recent year in the data
    const years = rawExpenses
      .map((e: any) => { const d = new Date(e.date); return isNaN(d.getTime()) ? null : d.getFullYear(); })
      .filter((y: number | null): y is number => y !== null);
    if (years.length === 0) return;
    const latestYear = Math.max(...years);
    // Only auto-select if it's not the current year (i.e. data is from a previous year)
    // Always default to showing latest year's data
    setFilterYear(String(latestYear));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-8">

      {/* ─── Import Preview Modal ──────────────────────────────────── */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="text-base font-bold">Import Preview</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{importRows.length} records ready to import{importRows.filter(r => r.wasSerial).length > 0 ? ` · Date serial numbers converted: ${importRows.filter(r => r.wasSerial).length}` : ''}</p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-auto flex-1 px-2">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-secondary/80 backdrop-blur-sm">
                  <tr>
                    {['Date', 'Amount', 'Source Code', 'Auto Category', 'Description', 'Member', 'Payment Method', 'Warning'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((r, i) => (
                    <tr key={i} className={`border-b border-border/40 ${r.warning ? 'bg-yellow-950/20' : ''}`}>
                      <td className="px-3 py-1.5">{r.date}</td>
                      <td className="px-3 py-1.5 num-display font-bold text-primary">{formatCurrency(r.amount)}</td>
                      <td className="px-3 py-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-secondary font-mono">{r.source_code || '—'}</span>
                      </td>
                      <td className="px-3 py-1.5">{r.category}</td>
                      <td className="px-3 py-1.5 max-w-[180px] truncate">{r.description}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{r.member || '—'}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{r.payment_method || '—'}</td>
                      <td className="px-3 py-1.5">
                        {r.warning && (
                          <span className="flex items-center gap-1 text-yellow-400">
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            {r.warning}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
              <Button
                onClick={handleConfirmImport}
                disabled={bulkMut.isPending}
                style={{ background: 'linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))', color: 'hsl(224,40%,8%)', border: 'none' }}
              >
                Confirm Import ({importRows.length} records)
              </Button>
              <Button variant="outline" onClick={() => setShowImportModal(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Header ───────────────────────────────────────────────── */}
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
            variant="outline"
            onClick={() => fixCategoriesMut.mutate()}
            disabled={fixCategoriesMut.isPending}
            className="gap-1.5 text-yellow-400 border-yellow-800/40 hover:border-yellow-600"
          >
            {fixCategoriesMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            Fix Categories
          </Button>
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

      {/* ─── KPI cards ────────────────────────────────────────────── */}
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

      {/* ─── Analytics charts ──────────────────────────────────────── */}
      {analytics.categoryData.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4">

          {/* Category breakdown pie */}
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
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
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
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v / 1000).toFixed(1)}K`} />
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
                        width: `${Math.min(100, (d.avg / (analytics.avgMonthlyByCategory[0]?.avg || 1)) * 100)}%`,
                      }} />
                    </div>
                    <span className="font-semibold num-display w-16 text-right">{formatCurrency(d.avg, true)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Yearly totals bar chart */}
          {analytics.yearlyData.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-bold mb-4">Yearly Totals</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={analytics.yearlyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="amount" name="Total" fill="hsl(270,60%,60%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Top Growing Categories */}
          {analytics.growingCategories.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-bold mb-1">Top Growing Categories</h3>
              <p className="text-xs text-muted-foreground mb-4">Last 3 months vs prior 3 months avg</p>
              <div className="space-y-3">
                {analytics.growingCategories.map((c, i) => {
                  const growing = c.pct > 0;
                  return (
                    <div key={c.category} className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-muted-foreground truncate">{c.category}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-muted-foreground num-display">{formatCurrency(c.last, true)}/mo</span>
                        <span
                          className="px-1.5 py-0.5 rounded font-semibold num-display"
                          style={{
                            background: growing ? 'hsl(0,60%,15%)' : 'hsl(142,60%,10%)',
                            color: growing ? 'hsl(0,72%,60%)' : 'hsl(142,60%,45%)',
                          }}
                        >
                          {growing ? '+' : ''}{c.pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ─── Add Form ─────────────────────────────────────────────── */}
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

      {/* ─── Filters ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        {/* Basic row */}
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
            <SelectTrigger className="h-8 text-sm w-44"><SelectValue placeholder="Category" /></SelectTrigger>
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
              <label className="text-xs text-muted-foreground">Source Code</label>
              <Select value={filterSourceCode} onValueChange={v => { setFilterSourceCode(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue placeholder="Code" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Codes</SelectItem>
                  {ALL_SOURCE_CODES.map(c => (
                    <SelectItem key={c} value={c}>{c} — {SOURCE_CODE_MAP[c]}</SelectItem>
                  ))}
                  <SelectItem value="__unknown__">Unknown / Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Week (ISO)</label>
              <Select value={filterWeek} onValueChange={v => { setFilterWeek(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue placeholder="Week" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Weeks</SelectItem>
                  {WEEKS.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Sub-category</label>
              <Input
                value={filterSubcat}
                onChange={e => { setFilterSubcat(e.target.value); setPage(1); }}
                placeholder="Filter sub-cat..."
                className="h-8 text-sm mt-0.5"
                list="subcats-list"
              />
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
              <Input
                type="date"
                value={filterDateFrom}
                onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }}
                className="h-8 text-sm mt-0.5"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Date To</label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={e => { setFilterDateTo(e.target.value); setPage(1); }}
                className="h-8 text-sm mt-0.5"
              />
            </div>
          </div>
        )}
      </div>

      {/* ─── Bulk toolbar ─────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div
          className="flex items-center gap-3 flex-wrap rounded-xl border px-4 py-2.5 text-sm"
          style={{ borderColor: 'hsl(0,72%,35%)', background: 'hsl(0,50%,8%)' }}
        >
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
          <Button
            size="sm"
            onClick={() => setShowBulkModal(true)}
            className="gap-1.5 bg-red-600 hover:bg-red-700 text-white border-0 h-7 text-xs"
          >
            <Trash2 className="w-3 h-3" /> Delete {selected.size} records
          </Button>
        </div>
      )}

      {/* ─── Expense table ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-3 py-2.5 w-8">
                  <button onClick={togglePageSelect} className="flex items-center justify-center text-muted-foreground hover:text-foreground">
                    {allPageSelected
                      ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
                      : <Square className="w-3.5 h-3.5" />}
                  </button>
                </th>
                {['Date', 'Amount', 'Category', 'Source Code', 'Sub-cat', 'Description', 'Payment', 'Member', 'Recurring', 'Actions'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={11} className="py-10 text-center text-sm text-muted-foreground">
                    <div className="flex flex-col items-center gap-3">
                      <span>No expenses found{hasActiveFilters ? ' matching your filters' : ''}.</span>
                      {hasActiveFilters && (
                        <Button size="sm" variant="outline" className="text-xs border-amber-500/50 text-amber-400 hover:bg-amber-500/10" onClick={resetFilters}>
                          Clear Filters — Show All
                        </Button>
                      )}
                    </div>
                  </td></tr>
              ) : paginated.map((e: any) => {
                if (editingId === e.id && editDraft) {
                  return (
                    <tr key={e.id} className="border-b border-border bg-secondary/20">
                      <td colSpan={11} className="p-3">
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
                  <tr
                    key={e.id}
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
                    <td className="px-3 py-2 text-xs">
                      {e.source_code
                        ? <span className="px-1.5 py-0.5 rounded bg-secondary/60 font-mono text-muted-foreground">{e.source_code}</span>
                        : <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{e.subcategory}</td>
                    <td className="px-3 py-2 text-xs max-w-[150px] truncate">{e.description}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{e.payment_method}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{e.family_member}</td>
                    <td className="px-3 py-2 text-xs">{e.recurring ? '🔄' : '—'}</td>
                    <td className="px-3 py-2" onClick={ev => ev.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button
                          size="icon" variant="ghost" className="w-6 h-6"
                          onClick={() => {
                            setEditingId(e.id);
                            setEditDraft({
                              date: e.date || '',
                              amount: e.amount || '',
                              category: e.category || 'Other',
                              subcategory: e.subcategory || '',
                              description: e.description || '',
                              payment_method: e.payment_method || '',
                              family_member: e.family_member || '',
                              recurring: !!e.recurring,
                              notes: e.notes || '',
                              source_code: e.source_code || '',
                            });
                          }}
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button
                          size="icon" variant="ghost" className="w-6 h-6 text-red-400"
                          onClick={() => deleteMut.mutate(e.id)}
                        >
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

      {/* ─── Bulk delete modal ─────────────────────────────────────── */}
      <BulkDeleteModal
        open={showBulkModal}
        count={selected.size}
        label="expense records"
        onConfirm={handleBulkDelete}
        onCancel={() => setShowBulkModal(false)}
        onExportBackup={handleExportBackup}
      />

      {/* ─── Auto Import Panel ─────────────────────────────── */}
      <AutoImportPanel expenses={expenses} onImportComplete={() => {
        qc.invalidateQueries({ queryKey: ['/api/expenses'] });
        resetFilters();
      }} />

      {/* ─── AI Insights ─────────────────────────────────────────────────── */}
      <AIInsightsCard
        pageKey="expenses"
        pageLabel="Spending Analysis"
        getData={() => {
          const byCategory: Record<string,number> = {};
          let monthlyTotal = 0;
          const now = new Date();
          expenses.forEach((e: any) => {
            byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
            const d = new Date(e.date);
            if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) monthlyTotal += e.amount;
          });
          const top = Object.entries(byCategory).sort((a,b) => b[1]-a[1]).slice(0,8).map(([cat,amt]) => ({ cat, amt: Math.round(amt) }));
          return { count: expenses.length, monthlyTotal: Math.round(monthlyTotal), topCategories: top };
        }}
      />
    </div>
  );
}

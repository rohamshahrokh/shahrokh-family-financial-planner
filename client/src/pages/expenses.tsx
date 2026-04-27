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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, AreaChart, Area, Legend,
} from "recharts";
import {
  Plus, Trash2, Edit2, Upload, Download, Search,
  CheckSquare, Square, ChevronDown, Filter, TrendingDown, AlertTriangle, X,
  RefreshCw, Zap, TrendingUp, DollarSign,
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

// ─── Income constants ─────────────────────────────────────────────────────────
const INCOME_SOURCES = ['Salary', 'Bonus', 'Rental Income', 'Dividends', 'Interest', 'Tax Refund', 'Side Income', 'Other'];
const INCOME_FREQUENCIES = ['Weekly', 'Fortnightly', 'Monthly', 'Quarterly', 'Annual', 'One-off'];

// Monthly equivalent multipliers
const FREQ_MULTIPLIER: Record<string, number> = {
  'Weekly':      52 / 12,
  'Fortnightly': 26 / 12,
  'Monthly':     1,
  'Quarterly':   4 / 12,
  'Annual':      1 / 12,
  'One-off':     0, // excluded from recurring projection
};

function toMonthlyEquiv(amount: number, frequency: string): number {
  return amount * (FREQ_MULTIPLIER[frequency] ?? 1);
}

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
  'Mortgage': 'Housing / Mortgage',
  'Eating Out': 'Dining Out / Coffee',
  'Fuel': 'Transport / Fuel',
  'Car Loan': 'Car Loan / Car Expenses',
  'Health': 'Health / Medical',
  'Investments': 'Investment Costs',
};

export function mapExpenseCodeToCategory(code: string): string {
  if (!code) return '';
  const upper = code.trim().toUpperCase();
  if (SOURCE_CODE_MAP[upper]) return SOURCE_CODE_MAP[upper];
  const reverseEntry = Object.entries(SOURCE_CODE_MAP).find(
    ([, cat]) => cat.toLowerCase() === upper.toLowerCase()
  );
  return reverseEntry ? reverseEntry[1] : '';
}

function migrateExpense(e: any): any {
  let category = e.category || 'Other';
  const codeFields = [e.source_code, e.subcategory, e.sub_category, e.code, e.sourceCode];
  for (const rawField of codeFields) {
    if (!rawField) continue;
    const mapped = mapExpenseCodeToCategory(String(rawField));
    if (mapped) {
      category = mapped;
      break;
    }
  }
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

// ─── Empty income record ──────────────────────────────────────────────────────
const EMPTY_INCOME = {
  date: new Date().toISOString().split('T')[0],
  amount: '' as any,
  source: 'Salary',
  description: '',
  member: 'Family',
  frequency: 'Monthly',
  recurring: true,
  notes: '',
};

interface IncomeFormData {
  date: string;
  amount: any;
  source: string;
  description: string;
  member: string;
  frequency: string;
  recurring: boolean;
  notes: string;
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

// ─── IncomeForm defined OUTSIDE parent ───────────────────────────────────────
interface IncomeFormProps {
  data: IncomeFormData;
  onChange: (d: IncomeFormData) => void;
}
function IncomeForm({ data, onChange }: IncomeFormProps) {
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
        <label className="text-xs text-muted-foreground">Source</label>
        <Select value={data.source} onValueChange={v => onChange({ ...data, source: v })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {INCOME_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Frequency</label>
        <Select value={data.frequency} onValueChange={v => onChange({ ...data, frequency: v })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {INCOME_FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Family Member</label>
        <Select value={data.member} onValueChange={v => onChange({ ...data, member: v })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {FAMILY_MEMBERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">Description</label>
        <Input
          value={data.description}
          onChange={e => onChange({ ...data, description: e.target.value })}
          className="h-8 text-sm"
          placeholder="e.g. July salary"
        />
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

function normaliseIncomeDraft(d: IncomeFormData) {
  return {
    ...d,
    amount: parseFloat(String(d.amount)) || 0,
  };
}

// ─── Excel date serial → YYYY-MM-DD ──────────────────────────────────────────
function excelSerialToDate(serial: number): string {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date = new Date(utc_value * 1000);
  return date.toISOString().split('T')[0];
}

function parseExcelDate(raw: any): { iso: string; wasSerial: boolean } {
  if (!raw && raw !== 0) return { iso: new Date().toISOString().split('T')[0], wasSerial: false };
  if (raw instanceof Date) return { iso: raw.toISOString().split('T')[0], wasSerial: false };
  const s = String(raw).trim();
  const num = Number(s);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    return { iso: excelSerialToDate(num), wasSerial: true };
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return { iso: s.split('T')[0], wasSerial: false };
  const dmatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmatch) {
    const [, d, m, y] = dmatch;
    const day = parseInt(d, 10);
    const mon = parseInt(m, 10);
    if (day > 12) return { iso: `${y}-${mon.toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}`, wasSerial: false };
    return { iso: `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`, wasSerial: false };
  }
  const dobj = new Date(s);
  if (!isNaN(dobj.getTime())) return { iso: dobj.toISOString().split('T')[0], wasSerial: false };
  return { iso: s, wasSerial: false };
}

function normalizeMember(raw: string): string {
  if (!raw) return 'Family';
  const s = raw.trim().toLowerCase();
  if (s.includes('roham')) return 'Roham Shahrokh';
  if (s.includes('fara')) return 'Fara Ghiyasi';
  if (s.includes('yara') || s.includes('jana') || s.includes('kids') || s.includes('babies') || s.includes('baby')) return 'Yara Shahrokh';
  if (s.includes('family') || s.includes('household')) return 'Family';
  return 'Family';
}

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

interface IncomeImportRow {
  date: string;
  amount: number;
  source: string;
  description: string;
  member: string;
  frequency: string;
  recurring: boolean;
  notes: string;
  warning: string;
}

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

// ─── Tab type ─────────────────────────────────────────────────────────────────
type PageTab = 'expenses' | 'income' | 'cashflow';

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const incomeFileRef = useRef<HTMLInputElement>(null);

  // ── Tab state ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<PageTab>('expenses');

  // ── Expense form state ───────────────────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<ExpenseFormData>({ ...EMPTY_EXPENSE });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ExpenseFormData | null>(null);

  // ── Income form state ────────────────────────────────────────────────────────
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [incomeDraft, setIncomeDraft] = useState<IncomeFormData>({ ...EMPTY_INCOME });
  const [editingIncomeId, setEditingIncomeId] = useState<number | null>(null);
  const [editIncomeDraft, setEditIncomeDraft] = useState<IncomeFormData | null>(null);

  // ── Import preview state ─────────────────────────────────────────────────────
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);

  // ── Income import preview state ──────────────────────────────────────────────
  const [incomeImportRows, setIncomeImportRows] = useState<IncomeImportRow[]>([]);
  const [showIncomeImportModal, setShowIncomeImportModal] = useState(false);

  // ── Expense filter state ─────────────────────────────────────────────────────
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
  const [chartView, setChartView] = useState<'monthly' | 'annual' | 'daily'>('monthly');

  // ── Income filter state ──────────────────────────────────────────────────────
  const [incomeSearch, setIncomeSearch] = useState('');
  const [incomeFilterYear, setIncomeFilterYear] = useState('all');
  const [incomeFilterMonth, setIncomeFilterMonth] = useState('all');
  const [incomeFilterSource, setIncomeFilterSource] = useState('all');
  const [incomeFilterMember, setIncomeFilterMember] = useState('all');
  const [incomePage, setIncomePage] = useState(1);

  // ── Cash flow filter state ────────────────────────────────────────────────────
  const [cfYear, setCfYear] = useState(String(CURRENT_YEAR));
  const [cfMonth, setCfMonth] = useState('all');

  // ── Selection state ──────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);

  // ── Stable onChange handlers ─────────────────────────────────────────────────
  const handleDraftChange = useCallback((d: ExpenseFormData) => setDraft(d), []);
  const handleEditDraftChange = useCallback((d: ExpenseFormData) => setEditDraft(d), []);
  const handleIncomeDraftChange = useCallback((d: IncomeFormData) => setIncomeDraft(d), []);
  const handleEditIncomeDraftChange = useCallback((d: IncomeFormData) => setEditIncomeDraft(d), []);

  // ── Import refs ──────────────────────────────────────────────────────────────
  const pendingImportYearRef = useRef<string>('all');
  const importJustSetFilterRef = useRef(false);

  // ── Data fetching ─────────────────────────────────────────────────────────────
  const { data: rawExpenses = [] } = useQuery<any[]>({
    queryKey: ['/api/expenses'],
    queryFn: () => apiRequest('GET', '/api/expenses').then(r => r.json()),
  });

  const { data: incomeRecords = [] } = useQuery<any[]>({
    queryKey: ['/api/income'],
    queryFn: () => apiRequest('GET', '/api/income').then(r => r.json()),
  });

  const expenses = useMemo(() => rawExpenses.map(migrateExpense), [rawExpenses]);

  // ── Expense mutations ─────────────────────────────────────────────────────────
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
    onSuccess: async (res) => {
      await qc.refetchQueries({ queryKey: ['/api/expenses'] });
      importJustSetFilterRef.current = true;
      setFilterYear(pendingImportYearRef.current);
      setFilterMonth('all'); setFilterWeek('all');
      setFilterCategory('all'); setFilterSourceCode('all');
      setFilterSubcat(''); setFilterMember('all'); setFilterPayment('all');
      setFilterDateFrom(''); setFilterDateTo(''); setSearch(''); setPage(1);
      toast({ title: `Import Complete`, description: `${res.created} expense(s) saved to database.` });
    },
    onError: (err: any) => {
      const msg = err?.message || String(err) || 'Unknown error';
      toast({ title: 'Import Failed', description: msg.slice(0, 200), variant: 'destructive' });
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
          if (mapped && mapped !== e.category) { newCategory = mapped; break; }
        }
        if (newCategory !== e.category) { toFix.push({ id: e.id, category: newCategory }); fixed++; }
      }
      await Promise.all(toFix.map(item => apiRequest('PUT', `/api/expenses/${item.id}`, { category: item.category })));
      return { fixed, total: allExpenses.length };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['/api/expenses'] });
      toast({ title: `Categories Fixed`, description: `${result.fixed} of ${result.total} records updated.` });
    },
    onError: () => toast({ title: 'Fix failed', variant: 'destructive' }),
  });

  // ── Income mutations ──────────────────────────────────────────────────────────
  const createIncomeMut = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/income', data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/income'] });
      setShowAddIncome(false);
      setIncomeDraft({ ...EMPTY_INCOME });
      toast({ title: 'Income Saved', description: 'Income record added successfully.' });
    },
    onError: (err: any) => toast({ title: 'Save Failed', description: String(err?.message || err), variant: 'destructive' }),
  });
  const updateIncomeMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest('PUT', `/api/income/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/income'] });
      setEditingIncomeId(null);
      toast({ title: 'Income Updated' });
    },
  });
  const deleteIncomeMut = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/income/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/income'] });
      toast({ title: 'Income Deleted' });
    },
  });
  const bulkIncomeMut = useMutation({
    mutationFn: (data: any[]) => apiRequest('POST', '/api/income/bulk', { records: data }).then(r => r.json()),
    onSuccess: async (res) => {
      await qc.refetchQueries({ queryKey: ['/api/income'] });
      toast({ title: `Income Import Complete`, description: `${res.created} record(s) saved.` });
    },
    onError: (err: any) => {
      const msg = err?.message || String(err) || 'Unknown error';
      toast({ title: 'Income Import Failed', description: msg.slice(0, 200), variant: 'destructive' });
    },
  });

  // ── Expense filter logic ──────────────────────────────────────────────────────
  const filtered = useMemo(() => expenses.filter((e: any) => {
    const d = new Date(e.date);
    const yr = parseInt(filterYear);
    if (filterYear !== 'all' && d.getFullYear() !== yr) return false;
    if (filterMonth !== 'all' && d.getMonth() !== parseInt(filterMonth)) return false;
    if (filterWeek !== 'all') {
      const weekNum = parseInt(filterWeek.replace('W', ''));
      if (getISOWeek(d) !== weekNum) return false;
      if (filterYear !== 'all' && d.getFullYear() !== yr) return false;
    }
    if (filterDateFrom && e.date < filterDateFrom) return false;
    if (filterDateTo && e.date > filterDateTo) return false;
    if (filterCategory !== 'all' && e.category !== filterCategory) return false;
    if (filterSourceCode !== 'all') {
      if (filterSourceCode === '__unknown__') {
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
      if (!e.description?.toLowerCase().includes(q) && !e.category?.toLowerCase().includes(q) && !e.notes?.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [expenses, filterYear, filterMonth, filterWeek, filterDateFrom, filterDateTo,
      filterCategory, filterSourceCode, filterSubcat, filterMember, filterPayment, search]);

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Income filter logic ───────────────────────────────────────────────────────
  const filteredIncome = useMemo(() => incomeRecords.filter((r: any) => {
    const d = new Date(r.date);
    if (incomeFilterYear !== 'all' && d.getFullYear() !== parseInt(incomeFilterYear)) return false;
    if (incomeFilterMonth !== 'all' && d.getMonth() !== parseInt(incomeFilterMonth)) return false;
    if (incomeFilterSource !== 'all' && r.source !== incomeFilterSource) return false;
    if (incomeFilterMember !== 'all' && r.member !== incomeFilterMember) return false;
    if (incomeSearch) {
      const q = incomeSearch.toLowerCase();
      if (!r.description?.toLowerCase().includes(q) && !r.source?.toLowerCase().includes(q) && !r.notes?.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [incomeRecords, incomeFilterYear, incomeFilterMonth, incomeFilterSource, incomeFilterMember, incomeSearch]);

  const paginatedIncome = filteredIncome.slice((incomePage - 1) * PAGE_SIZE, incomePage * PAGE_SIZE);

  // ── Filtered income totals (react instantly to filters) ─────────────────────
  const filteredIncomeTotals = useMemo(() => {
    const totalAmount = filteredIncome.reduce((s: number, r: any) => s + (r.amount || 0), 0);
    // Monthly equiv for filtered set — same deduplication as KPI card
    const streamMapF = new Map<string, any>();
    const sortedF = [...filteredIncome]
      .filter((r: any) => r.recurring && r.frequency !== 'One-off')
      .sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
    for (const r of sortedF) {
      const key = `${(r.member || '').toLowerCase()}|${(r.source || '').toLowerCase()}|${(r.frequency || '').toLowerCase()}`;
      if (!streamMapF.has(key)) streamMapF.set(key, r);
    }
    const totalMonthlyEquiv = Array.from(streamMapF.values())
      .reduce((s: number, r: any) => s + toMonthlyEquiv(r.amount, r.frequency), 0);
    return { totalAmount, totalMonthlyEquiv, count: filteredIncome.length };
  }, [filteredIncome]);

  // ── Expense analytics ─────────────────────────────────────────────────────────
  const analytics = useMemo(() => {
    const totalSpend = filtered.reduce((s: number, e: any) => s + e.amount, 0);
    const now = new Date();
    const monthlySpend = expenses.filter((e: any) => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((s: number, e: any) => s + e.amount, 0);

    const byCategory: Record<string, number> = {};
    filtered.forEach((e: any) => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    const categoryData = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, value]) => ({ name, value: value as number }));

    // Monthly trend — full history, sorted chronologically by ISO key
    // Key is YYYY-MM for sorting; label is "May 2023" for display
    const monthlyTrendMap: Record<string, { label: string; amount: number }> = {};
    filtered.forEach((e: any) => {
      const d = new Date(e.date);
      if (isNaN(d.getTime())) return;
      const isoKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label  = d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
      if (!monthlyTrendMap[isoKey]) monthlyTrendMap[isoKey] = { label, amount: 0 };
      monthlyTrendMap[isoKey].amount += e.amount;
    });
    const trendData = Object.entries(monthlyTrendMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({ month: v.label, amount: v.amount }));

    // Weekly trend — last 16 weeks of filtered data, sorted chronologically
    const weeklyMap: Record<string, number> = {};

    filtered.forEach((e: any) => {
      const d = new Date(e.date);
      if (isNaN(d.getTime())) return;
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const isoWeek = weekStart.toISOString().slice(0, 10);
      const key = weekStart.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
      if (!weeklyMap[isoWeek]) weeklyMap[isoWeek] = 0;
      weeklyMap[isoWeek] += e.amount;
    });
    const weeklyData = Object.entries(weeklyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-16)
      .map(([iso, amount]) => {
        const d = new Date(iso);
        return { week: d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: '2-digit' }), amount };
      });

    const months = Object.keys(monthlyTrendMap).length || 1;
    const weeks = Object.keys(weeklyMap).length || 1;
    const avgMonthlyByCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, total]) => ({ name, avg: (total as number) / months }));

    const avgMonthly = months > 0 ? totalSpend / months : 0;
    const avgWeekly = weeks > 0 ? totalSpend / weeks : 0;

    const byYear: Record<string, number> = {};
    filtered.forEach((e: any) => {
      const yr = String(new Date(e.date).getFullYear());
      byYear[yr] = (byYear[yr] || 0) + e.amount;
    });
    const yearlyData = Object.entries(byYear).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([year, amount]) => ({ year, amount: amount as number }));

    const nowMs = now.getTime();
    const ms3mo = 3 * 30 * 24 * 60 * 60 * 1000;
    const last3Start = new Date(nowMs - ms3mo);
    const prior3Start = new Date(nowMs - 2 * ms3mo);
    const last3ByCategory: Record<string, number> = {};
    const prior3ByCategory: Record<string, number> = {};
    expenses.forEach((e: any) => {
      const d = new Date(e.date);
      if (d >= last3Start) last3ByCategory[e.category] = (last3ByCategory[e.category] || 0) + e.amount;
      else if (d >= prior3Start && d < last3Start) prior3ByCategory[e.category] = (prior3ByCategory[e.category] || 0) + e.amount;
    });
    const growingCategories = CATEGORIES
      .map(cat => {
        const last = (last3ByCategory[cat] || 0) / 3;
        const prior = (prior3ByCategory[cat] || 0) / 3;
        const pct = prior > 0 ? ((last - prior) / prior) * 100 : last > 0 ? 100 : 0;
        return { category: cat, last, prior, pct };
      })
      .filter(c => c.last > 0 || c.prior > 0)
      .sort((a, b) => b.pct - a.pct).slice(0, 5);

    // Daily data — only computed when both year and month filter are active
    let dailyData: { day: string; amount: number }[] = [];
    if (filterYear !== 'all' && filterMonth !== 'all') {
      const yr = parseInt(filterYear);
      const mo = parseInt(filterMonth);
      const daysInMonth = new Date(yr, mo + 1, 0).getDate();
      const dailyMap: Record<number, number> = {};
      filtered.forEach((e: any) => {
        const d = new Date(e.date);
        if (d.getFullYear() === yr && d.getMonth() === mo) {
          dailyMap[d.getDate()] = (dailyMap[d.getDate()] || 0) + e.amount;
        }
      });
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(yr, mo, day);
        dailyData.push({
          day: d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
          amount: dailyMap[day] || 0,
        });
      }
    }

    return { totalSpend, monthlySpend, categoryData, trendData, weeklyData, avgMonthlyByCategory, avgMonthly, avgWeekly, months, yearlyData, growingCategories, dailyData };
  }, [filtered, expenses, filterYear, filterMonth]);

  // ── Income analytics ──────────────────────────────────────────────────────────
  const incomeAnalytics = useMemo(() => {
    const totalIncome = filteredIncome.reduce((s: number, r: any) => s + r.amount, 0);

    // Monthly equivalent total — deduplicated per income stream.
    // Each unique (member + source + frequency) counts ONCE — we take the
    // most recent record for that stream. This prevents historical salary
    // rows (Jan, Feb, Mar …) from stacking into an inflated total.
    const streamMap = new Map<string, any>();
    const sortedByDateDesc = [...incomeRecords]
      .filter((r: any) => r.recurring && r.frequency !== 'One-off')
      .sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
    for (const r of sortedByDateDesc) {
      const key = `${(r.member || '').toLowerCase()}|${(r.source || '').toLowerCase()}|${(r.frequency || '').toLowerCase()}`;
      if (!streamMap.has(key)) streamMap.set(key, r);
    }
    const recurringMonthlyTotal = Array.from(streamMap.values())
      .reduce((s: number, r: any) => s + toMonthlyEquiv(r.amount, r.frequency), 0);

    const now = new Date();
    const thisMonthIncome = incomeRecords.filter((r: any) => {
      const d = new Date(r.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((s: number, r: any) => s + r.amount, 0);

    // By source
    const bySource: Record<string, number> = {};
    filteredIncome.forEach((r: any) => { bySource[r.source] = (bySource[r.source] || 0) + r.amount; });
    const sourceData = Object.entries(bySource).sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value: value as number }));

    // Monthly trend — full history, ISO-key sorted
    const incomeTrendMap: Record<string, { label: string; amount: number }> = {};
    filteredIncome.forEach((r: any) => {
      const d = new Date(r.date);
      if (isNaN(d.getTime())) return;
      const isoKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label  = d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' });
      if (!incomeTrendMap[isoKey]) incomeTrendMap[isoKey] = { label, amount: 0 };
      incomeTrendMap[isoKey].amount += r.amount;
    });
    const trendData = Object.entries(incomeTrendMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({ month: v.label, amount: v.amount }));

    // By member
    const byMember: Record<string, number> = {};
    filteredIncome.forEach((r: any) => { byMember[r.member] = (byMember[r.member] || 0) + r.amount; });
    const memberData = Object.entries(byMember).sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value: value as number }));

    return { totalIncome, recurringMonthlyTotal, thisMonthIncome, sourceData, trendData, memberData };
  }, [filteredIncome, incomeRecords]);

  // ── Filtered expense totals (react instantly to filters) ─────────────────
  const filteredExpensesTotals = useMemo(() => {
    const totalAmount = filtered.reduce((s: number, e: any) => s + (e.amount || 0), 0);
    return { totalAmount, count: filtered.length };
  }, [filtered]);

  // ── Cash Flow data ────────────────────────────────────────────────────────────
  const cashFlowData = useMemo(() => {
    const yearNum = parseInt(cfYear);
    if (isNaN(yearNum)) return { monthly: [], daily: [], summary: { totalIncome: 0, totalExpenses: 0, netCF: 0, savingsRate: 0 } };

    // Build monthly cashflow: aggregate income + expenses by month in selected year
    const monthlyData: { month: string; income: number; expenses: number; netCF: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const monthLabel = MONTHS[m].substring(0, 3);
      const monthIncome = incomeRecords
        .filter((r: any) => { const d = new Date(r.date); return d.getFullYear() === yearNum && d.getMonth() === m; })
        .reduce((s: number, r: any) => s + r.amount, 0);
      const monthExpenses = expenses
        .filter((e: any) => { const d = new Date(e.date); return d.getFullYear() === yearNum && d.getMonth() === m; })
        .reduce((s: number, e: any) => s + e.amount, 0);
      if (cfMonth === 'all' || parseInt(cfMonth) === m) {
        monthlyData.push({ month: monthLabel, income: monthIncome, expenses: monthExpenses, netCF: monthIncome - monthExpenses });
      }
    }

    // Daily expenses for selected month
    let dailyData: { day: string; expenses: number; income: number }[] = [];
    if (cfMonth !== 'all') {
      const mIdx = parseInt(cfMonth);
      const daysInMonth = new Date(yearNum, mIdx + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${yearNum}-${String(mIdx + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayExpenses = expenses.filter((e: any) => e.date === dateStr).reduce((s: number, e: any) => s + e.amount, 0);
        const dayIncome = incomeRecords.filter((r: any) => r.date === dateStr).reduce((s: number, r: any) => s + r.amount, 0);
        if (dayExpenses > 0 || dayIncome > 0) dailyData.push({ day: `${d}`, expenses: dayExpenses, income: dayIncome });
      }
    }

    const totalIncome = monthlyData.reduce((s, m) => s + m.income, 0);
    const totalExpenses = monthlyData.reduce((s, m) => s + m.expenses, 0);
    const netCF = totalIncome - totalExpenses;
    const savingsRate = totalIncome > 0 ? (netCF / totalIncome) * 100 : 0;

    return { monthly: monthlyData, daily: dailyData, summary: { totalIncome, totalExpenses, netCF, savingsRate } };
  }, [incomeRecords, expenses, cfYear, cfMonth]);

  // ── Subcategories ─────────────────────────────────────────────────────────────
  const subcats = useMemo(() => {
    const s = new Set<string>();
    expenses.forEach((e: any) => { if (e.subcategory) s.add(e.subcategory); });
    return Array.from(s).sort();
  }, [expenses]);

  // ── Selection helpers ─────────────────────────────────────────────────────────
  const allPageSelected = paginated.length > 0 && paginated.every((e: any) => selected.has(e.id));
  const allFilteredSelected = filtered.length > 0 && filtered.every((e: any) => selected.has(e.id));

  const toggleSelect = (id: number) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const togglePageSelect = () => {
    if (allPageSelected) setSelected(prev => { const n = new Set(prev); paginated.forEach((e: any) => n.delete(e.id)); return n; });
    else setSelected(prev => { const n = new Set(prev); paginated.forEach((e: any) => n.add(e.id)); return n; });
  };
  const selectAllFiltered = () => setSelected(new Set(filtered.map((e: any) => e.id)));
  const clearSelection = () => setSelected(new Set());

  // ── Bulk delete ───────────────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    for (const id of ids) await apiRequest('DELETE', `/api/expenses/${id}`);
    await qc.invalidateQueries({ queryKey: ['/api/expenses'] });
    clearSelection();
    toast({ title: `Deleted ${ids.length} expense records`, description: 'Bulk delete complete.' });
    setShowBulkModal(false);
  };

  const handleExportBackup = () => {
    const toExport = expenses.filter((e: any) => selected.has(e.id));
    const data = toExport.map((e: any) => ({
      Date: e.date, Amount: e.amount, 'Source Code': e.source_code || '',
      Category: e.category, 'Sub-category': e.subcategory, Description: e.description,
      'Payment Method': e.payment_method, 'Family Member': e.family_member,
      Recurring: e.recurring ? 'Yes' : 'No', Notes: e.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Backup');
    XLSX.writeFile(wb, `Shahrokh_Expenses_Backup_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Backup exported', description: `${data.length} records saved to Excel.` });
  };

  // ── Excel import (expenses) ───────────────────────────────────────────────────
  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' }) as any[][];
      if (allRows.length < 2) { toast({ title: 'Empty file', description: 'No data rows found.', variant: 'destructive' }); return; }
      const headerRow = allRows[0].map((h: any) => String(h ?? '').trim().toLowerCase());
      const col = (names: string[], fallbackPosition?: number): number => {
        for (const n of names) { const idx = headerRow.indexOf(n); if (idx >= 0) return idx; }
        for (let i = 0; i < headerRow.length; i++) { const h = headerRow[i]; if (names.some(n => h.includes(n) || n.includes(h))) return i; }
        if (fallbackPosition !== undefined && headerRow.length > fallbackPosition) return fallbackPosition;
        return -1;
      };
      const colDate    = col(['date'], 0);
      const colAmount  = col(['amount'], 1);
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
        const hasDate   = colDate >= 0 && r[colDate] != null && r[colDate] !== '';
        const hasAmount = colAmount >= 0 && r[colAmount] != null && r[colAmount] !== '';
        if (!hasDate && !hasAmount) continue;
        const rawDateVal = colDate >= 0 ? r[colDate] : null;
        const rawCell = colDate >= 0 ? ws[XLSX.utils.encode_cell({ r: rowIdx + 1, c: colDate })] : null;
        const rawNumeric = rawCell?.t === 'n' ? rawCell.v : null;
        let dateResult: { iso: string; wasSerial: boolean };
        if (rawNumeric && rawNumeric > 40000) dateResult = { iso: excelSerialToDate(rawNumeric), wasSerial: true };
        else dateResult = parseExcelDate(rawDateVal);
        const amount = parseFloat(String(colAmount >= 0 ? r[colAmount] : 0).replace(/[^0-9.-]/g, '')) || 0;
        const rawCode = colCode >= 0 ? String(r[colCode] ?? '').trim().toUpperCase() : '';
        let resolvedCode = rawCode;
        if (rawCode.length > 4 || rawCode.includes(' ')) {
          const reverseEntry = Object.entries(SOURCE_CODE_MAP).find(([, cat]) => cat.toLowerCase() === rawCode.toLowerCase());
          resolvedCode = reverseEntry ? reverseEntry[0] : rawCode;
        }
        const mapped  = SOURCE_CODE_MAP[resolvedCode] || SOURCE_CODE_MAP[rawCode];
        const isLegacy  = ['F', 'RN', 'MF'].includes(rawCode);
        const isUnknown = rawCode && !SOURCE_CODE_MAP[rawCode] && !mapped;
        const rawMember = colMember >= 0 ? String(r[colMember] ?? '') : '';
        const member = normalizeMember(rawMember);
        const rawPayment = colPayment >= 0 ? String(r[colPayment] ?? '') : '';
        const payment_method = normalizePaymentMethod(rawPayment);
        const notes = colNotes >= 0 ? String(r[colNotes] ?? '') : '';
        const recurRaw = colRecur >= 0 ? String(r[colRecur] ?? '').toLowerCase() : '';
        const recurring = recurRaw === 'yes' || recurRaw === 'true' || recurRaw === '1';
        const description = colDesc >= 0 ? String(r[colDesc] ?? '') : '';
        let warning = '';
        if (dateResult.wasSerial) warning += `Date converted from serial (${rawNumeric}). `;
        if (isUnknown) warning += `Unknown code "${rawCode}" → Other. `;
        if (isLegacy)  warning += `Legacy code "${rawCode}" → Other. `;
        if (amount <= 0) warning += `Invalid amount. `;
        preview.push({ date: dateResult.iso, amount, source_code: resolvedCode, category: mapped || 'Other', description, member, payment_method, notes, recurring, warning: warning.trim(), wasSerial: dateResult.wasSerial });
      }
      setImportRows(preview);
      setShowImportModal(true);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // ── Excel import (income) ─────────────────────────────────────────────────────
  const handleIncomeExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' }) as any[][];
      if (allRows.length < 2) { toast({ title: 'Empty file', description: 'No data rows found.', variant: 'destructive' }); return; }
      const headerRow = allRows[0].map((h: any) => String(h ?? '').trim().toLowerCase());
      const col = (names: string[], fb?: number): number => {
        for (const n of names) { const idx = headerRow.indexOf(n); if (idx >= 0) return idx; }
        for (let i = 0; i < headerRow.length; i++) { const h = headerRow[i]; if (names.some(n => h.includes(n) || n.includes(h))) return i; }
        if (fb !== undefined && headerRow.length > fb) return fb;
        return -1;
      };
      const colDate   = col(['date'], 0);
      const colAmount = col(['amount'], 1);
      const colSource = col(['source', 'type', 'income source'], 2);
      const colDesc   = col(['description', 'desc', 'details'], 3);
      const colMember = col(['member', 'family member', 'person', 'who'], 4);
      const colFreq   = col(['frequency', 'freq', 'period'], 5);
      const colRecur  = col(['recurring', 'repeat', 'recur'], 6);
      const colNotes  = col(['notes', 'note', 'comment'], 7);
      const dataRows = allRows.slice(1);
      const preview: IncomeImportRow[] = [];
      for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
        const r = dataRows[rowIdx];
        const hasDate = colDate >= 0 && r[colDate] != null && r[colDate] !== '';
        const hasAmount = colAmount >= 0 && r[colAmount] != null && r[colAmount] !== '';
        if (!hasDate && !hasAmount) continue;
        const rawDateVal = colDate >= 0 ? r[colDate] : null;
        const rawCell = colDate >= 0 ? ws[XLSX.utils.encode_cell({ r: rowIdx + 1, c: colDate })] : null;
        const rawNumeric = rawCell?.t === 'n' ? rawCell.v : null;
        let dateResult: { iso: string; wasSerial: boolean };
        if (rawNumeric && rawNumeric > 40000) dateResult = { iso: excelSerialToDate(rawNumeric), wasSerial: true };
        else dateResult = parseExcelDate(rawDateVal);
        const amount = parseFloat(String(colAmount >= 0 ? r[colAmount] : 0).replace(/[^0-9.-]/g, '')) || 0;
        const rawSource = colSource >= 0 ? String(r[colSource] ?? '').trim() : 'Other';
        const source = INCOME_SOURCES.includes(rawSource) ? rawSource : 'Other';
        const description = colDesc >= 0 ? String(r[colDesc] ?? '') : '';
        const rawMember = colMember >= 0 ? String(r[colMember] ?? '') : '';
        const member = normalizeMember(rawMember) || 'Family';
        const rawFreq = colFreq >= 0 ? String(r[colFreq] ?? '').trim() : 'Monthly';
        const freq = INCOME_FREQUENCIES.find(f => f.toLowerCase() === rawFreq.toLowerCase()) || 'Monthly';
        const recurRaw = colRecur >= 0 ? String(r[colRecur] ?? '').toLowerCase() : '';
        const recurring = recurRaw === 'yes' || recurRaw === 'true' || recurRaw === '1' || freq !== 'One-off';
        const notes = colNotes >= 0 ? String(r[colNotes] ?? '') : '';
        let warning = '';
        if (dateResult.wasSerial) warning += `Date converted from serial. `;
        if (amount <= 0) warning += `Invalid amount. `;
        if (!INCOME_SOURCES.includes(rawSource)) warning += `Source "${rawSource}" → Other. `;
        preview.push({ date: dateResult.iso, amount, source, description, member, frequency: freq, recurring, notes, warning: warning.trim() });
      }
      setIncomeImportRows(preview);
      setShowIncomeImportModal(true);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleConfirmImport = () => {
    const existingFingerprints = new Set(
      (expenses as any[]).map(e => `${e.date}|${Number(e.amount).toFixed(2)}|${(e.source_code || '').toUpperCase()}|${(e.description || '').trim().toLowerCase()}`)
    );
    let skipped = 0; let added = 0;
    const toCreate: any[] = [];
    for (const r of importRows) {
      const fp = `${r.date}|${Number(r.amount).toFixed(2)}|${r.source_code.toUpperCase()}|${r.description.trim().toLowerCase()}`;
      if (existingFingerprints.has(fp)) { skipped++; continue; }
      added++;
      toCreate.push({ date: r.date, amount: r.amount, source_code: r.source_code, category: r.category, subcategory: '', description: r.description, payment_method: r.payment_method || 'Bank Transfer', family_member: r.member || 'Family', recurring: r.recurring || false, notes: r.notes || '' });
    }
    if (toCreate.length > 0) {
      const importedYears = toCreate.map((r: any) => { const d = new Date(r.date); return isNaN(d.getTime()) ? null : d.getFullYear(); }).filter((y: number | null): y is number => y !== null);
      pendingImportYearRef.current = importedYears.length > 0 ? String(Math.max(...importedYears)) : 'all';
      const history = JSON.parse(localStorage.getItem('sf_import_history') || '[]');
      history.unshift({ id: Date.now(), timestamp: new Date().toISOString(), trigger: 'Manual', checked: importRows.length, added, skipped, status: 'Success', error: '', source: 'manual-upload' });
      localStorage.setItem('sf_import_history', JSON.stringify(history.slice(0, 100)));
      bulkMut.mutate(toCreate);
    } else {
      toast({ title: 'No new records', description: `All ${skipped} rows already exist.` });
    }
    setShowImportModal(false);
    setImportRows([]);
  };

  const handleConfirmIncomeImport = () => {
    const existingFingerprints = new Set(
      (incomeRecords as any[]).map((r: any) => `${r.date}|${Number(r.amount).toFixed(2)}|${(r.source || '').toLowerCase()}|${(r.description || '').trim().toLowerCase()}`)
    );
    let skipped = 0; const toCreate: any[] = [];
    for (const r of incomeImportRows) {
      const fp = `${r.date}|${Number(r.amount).toFixed(2)}|${r.source.toLowerCase()}|${r.description.trim().toLowerCase()}`;
      if (existingFingerprints.has(fp)) { skipped++; continue; }
      toCreate.push({ date: r.date, amount: r.amount, source: r.source, description: r.description, member: r.member, frequency: r.frequency, recurring: r.recurring, notes: r.notes });
    }
    if (toCreate.length > 0) {
      bulkIncomeMut.mutate(toCreate);
    } else {
      toast({ title: 'No new records', description: `All ${skipped} rows already exist.` });
    }
    setShowIncomeImportModal(false);
    setIncomeImportRows([]);
  };

  const handleExcelExport = () => {
    const data = expenses.map((e: any) => ({
      Date: e.date, Amount: e.amount, 'Source Code': e.source_code || '', Category: e.category,
      'Sub-category': e.subcategory, Description: e.description, 'Payment Method': e.payment_method,
      'Family Member': e.family_member, Recurring: e.recurring ? 'Yes' : 'No', Notes: e.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
    XLSX.writeFile(wb, `Shahrokh_Expenses_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Exported', description: 'Expenses exported to Excel.' });
  };

  const handleIncomeExport = () => {
    const data = incomeRecords.map((r: any) => ({
      Date: r.date, Amount: r.amount, Source: r.source, Description: r.description,
      Member: r.member, Frequency: r.frequency, Recurring: r.recurring ? 'Yes' : 'No',
      'Monthly Equiv': toMonthlyEquiv(r.amount, r.frequency).toFixed(2), Notes: r.notes,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Income');
    XLSX.writeFile(wb, `Shahrokh_Income_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Exported', description: 'Income exported to Excel.' });
  };

  const handleDownloadTemplate = () => {
    const headers = [['Date', 'Amount', 'Code', 'Description', 'Member', 'Payment Method', 'Notes', 'Recurring']];
    const sample = [
      ['2026-04-01', '150.00', 'D', 'Weekly groceries — Coles', 'Family', 'Debit Card', '', 'No'],
      ['2026-04-05', '2500.00', 'R', 'Monthly mortgage payment', 'Roham', 'Bank Transfer', 'Fixed mortgage', 'Yes'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'Shahrokh_Expense_Template.xlsx');
  };

  const handleDownloadIncomeTemplate = () => {
    const headers = [['Date', 'Amount', 'Source', 'Description', 'Member', 'Frequency', 'Recurring', 'Notes']];
    const sample = [
      ['2026-04-01', '10000.00', 'Salary', 'April salary', 'Roham Shahrokh', 'Monthly', 'Yes', ''],
      ['2026-04-01', '8000.00', 'Salary', 'April salary', 'Fara Ghiyasi', 'Monthly', 'Yes', ''],
      ['2026-04-15', '2500.00', 'Rental Income', 'Investment property rent', 'Family', 'Monthly', 'Yes', ''],
      ['2026-04-20', '1200.00', 'Dividends', 'NVDA quarterly dividend', 'Roham Shahrokh', 'Quarterly', 'Yes', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Income Template');
    XLSX.writeFile(wb, 'Shahrokh_Income_Template.xlsx');
  };

  const resetFilters = () => {
    setFilterYear('all'); setFilterMonth('all'); setFilterWeek('all');
    setFilterCategory('all'); setFilterSourceCode('all');
    setFilterSubcat(''); setFilterMember('all'); setFilterPayment('all');
    setFilterDateFrom(''); setFilterDateTo(''); setSearch(''); setPage(1);
  };

  const hasActiveFilters = filterYear !== 'all' || filterMonth !== 'all' || filterWeek !== 'all'
    || filterCategory !== 'all' || filterSourceCode !== 'all' || filterSubcat !== ''
    || filterMember !== 'all' || filterPayment !== 'all'
    || filterDateFrom !== '' || filterDateTo !== '' || search !== '';

  // Auto-detect latest year for expense filter
  useEffect(() => {
    if (!rawExpenses || rawExpenses.length === 0) return;
    if (importJustSetFilterRef.current) { importJustSetFilterRef.current = false; return; }
    if (filterYear !== 'all') return;
    const years = rawExpenses
      .map((e: any) => { const d = new Date(e.date); return isNaN(d.getTime()) ? null : d.getFullYear(); })
      .filter((y: number | null): y is number => y !== null && y > 2000 && y < 2100);
    if (years.length === 0) return;
    setFilterYear(String(Math.max(...years)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawExpenses]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-8">

      {/* ─── Import Preview Modal (Expenses) ──────────────────────── */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="text-base font-bold">Expense Import Preview</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{importRows.length} records ready to import{importRows.filter(r => r.wasSerial).length > 0 ? ` · Date serial numbers converted: ${importRows.filter(r => r.wasSerial).length}` : ''}</p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-auto flex-1 px-2">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-secondary/80 backdrop-blur-sm">
                  <tr>{['Date', 'Amount', 'Source Code', 'Auto Category', 'Description', 'Member', 'Payment Method', 'Warning'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {importRows.map((r, i) => (
                    <tr key={i} className={`border-b border-border/40 ${r.warning ? 'bg-yellow-950/20' : ''}`}>
                      <td className="px-3 py-1.5">{r.date}</td>
                      <td className="px-3 py-1.5 num-display font-bold text-primary">{formatCurrency(r.amount)}</td>
                      <td className="px-3 py-1.5"><span className="px-1.5 py-0.5 rounded bg-secondary font-mono">{r.source_code || '—'}</span></td>
                      <td className="px-3 py-1.5">{r.category}</td>
                      <td className="px-3 py-1.5 max-w-[180px] truncate">{r.description}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{r.member || '—'}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{r.payment_method || '—'}</td>
                      <td className="px-3 py-1.5">{r.warning && <span className="flex items-center gap-1 text-yellow-400"><AlertTriangle className="w-3 h-3 shrink-0" />{r.warning}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
              <Button onClick={handleConfirmImport} disabled={bulkMut.isPending} style={{ background: 'linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))', color: 'hsl(224,40%,8%)', border: 'none' }}>
                Confirm Import ({importRows.length} records)
              </Button>
              <Button variant="outline" onClick={() => setShowImportModal(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Import Preview Modal (Income) ────────────────────────── */}
      {showIncomeImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="text-base font-bold">Income Import Preview</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{incomeImportRows.length} records ready to import</p>
              </div>
              <button onClick={() => setShowIncomeImportModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-auto flex-1 px-2">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-secondary/80 backdrop-blur-sm">
                  <tr>{['Date', 'Amount', 'Monthly Equiv', 'Source', 'Description', 'Member', 'Frequency', 'Warning'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {incomeImportRows.map((r, i) => (
                    <tr key={i} className={`border-b border-border/40 ${r.warning ? 'bg-yellow-950/20' : ''}`}>
                      <td className="px-3 py-1.5">{r.date}</td>
                      <td className="px-3 py-1.5 num-display font-bold text-emerald-400">{formatCurrency(r.amount)}</td>
                      <td className="px-3 py-1.5 num-display text-primary">{formatCurrency(toMonthlyEquiv(r.amount, r.frequency))}/mo</td>
                      <td className="px-3 py-1.5"><span className="px-1.5 py-0.5 rounded bg-secondary">{r.source}</span></td>
                      <td className="px-3 py-1.5 max-w-[160px] truncate">{r.description}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{r.member}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">{r.frequency}</td>
                      <td className="px-3 py-1.5">{r.warning && <span className="flex items-center gap-1 text-yellow-400"><AlertTriangle className="w-3 h-3 shrink-0" />{r.warning}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
              <Button onClick={handleConfirmIncomeImport} disabled={bulkIncomeMut.isPending} style={{ background: 'linear-gradient(135deg, hsl(142,60%,45%), hsl(142,50%,32%))', color: '#fff', border: 'none' }}>
                Confirm Import ({incomeImportRows.length} records)
              </Button>
              <Button variant="outline" onClick={() => setShowIncomeImportModal(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Page Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">Income & Expense Tracker</h1>
          <p className="text-muted-foreground text-sm">Track all family spending, income & cash flow</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {activeTab === 'expenses' && (
            <>
              <Button size="sm" variant="outline" onClick={handleExcelExport} className="gap-1.5"><Download className="w-3.5 h-3.5" /> Export</Button>
              <Button size="sm" variant="outline" onClick={handleDownloadTemplate} className="gap-1.5"><Download className="w-3.5 h-3.5" /> Template</Button>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="gap-1.5"><Upload className="w-3.5 h-3.5" /> Import Excel</Button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelImport} />
              <Button size="sm" variant="outline" onClick={() => fixCategoriesMut.mutate()} disabled={fixCategoriesMut.isPending} className="gap-1.5 text-yellow-400 border-yellow-800/40 hover:border-yellow-600">
                {fixCategoriesMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />} Fix Categories
              </Button>
              <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5" style={{ background: 'linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))', color: 'hsl(224,40%,8%)', border: 'none' }}>
                <Plus className="w-3.5 h-3.5" /> Add Expense
              </Button>
            </>
          )}
          {activeTab === 'income' && (
            <>
              <Button size="sm" variant="outline" onClick={handleIncomeExport} className="gap-1.5"><Download className="w-3.5 h-3.5" /> Export</Button>
              <Button size="sm" variant="outline" onClick={handleDownloadIncomeTemplate} className="gap-1.5"><Download className="w-3.5 h-3.5" /> Template</Button>
              <Button size="sm" variant="outline" onClick={() => incomeFileRef.current?.click()} className="gap-1.5"><Upload className="w-3.5 h-3.5" /> Import Excel</Button>
              <input ref={incomeFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleIncomeExcelImport} />
              <Button size="sm" onClick={() => setShowAddIncome(true)} className="gap-1.5" style={{ background: 'linear-gradient(135deg, hsl(142,60%,45%), hsl(142,50%,32%))', color: '#fff', border: 'none' }}>
                <Plus className="w-3.5 h-3.5" /> Add Income
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ─── Tabs ─────────────────────────────────────────────────── */}
      <div className="flex gap-1 p-1 bg-secondary/30 rounded-xl border border-border w-fit">
        {([['expenses', 'Expenses'], ['income', 'Income'], ['cashflow', 'Cash Flow']] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 text-sm rounded-lg transition-all font-medium ${activeTab === tab ? 'bg-card text-foreground shadow-sm border border-border/60' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          EXPENSES TAB
      ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'expenses' && (
        <>
          {/* KPI cards */}
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

          {/* Chart view toggle */}
          <div className="flex items-center gap-2 flex-wrap">
            {(['monthly', 'annual', 'daily'] as const).map(v => (
              <button
                key={v}
                onClick={() => setChartView(v)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  chartView === v
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {v === 'monthly' ? 'Monthly' : v === 'annual' ? 'Annual' : 'Daily'}
              </button>
            ))}
            {chartView === 'daily' && filterYear === 'all' && (
              <span className="text-xs text-amber-400 ml-2">Select a year and month above to view daily spending</span>
            )}
          </div>

          {/* Analytics charts */}
          {analytics.categoryData.length > 0 && (
            <div className="grid lg:grid-cols-2 gap-4">
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
              {/* ── Trend chart — controlled by chartView toggle ── */}
              {chartView === 'monthly' && analytics.trendData.length > 1 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-bold mb-1">Monthly Spend Trend</h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    {analytics.trendData[0]?.month} → {analytics.trendData[analytics.trendData.length - 1]?.month}
                    {' '}({analytics.trendData.length} months)
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={analytics.trendData} margin={{ top: 5, right: 10, left: 0, bottom: analytics.trendData.length > 18 ? 50 : 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 9, fill: 'hsl(220,10%,55%)' }}
                        angle={analytics.trendData.length > 12 ? -45 : 0}
                        textAnchor={analytics.trendData.length > 12 ? 'end' : 'middle'}
                        interval={analytics.trendData.length > 24 ? Math.floor(analytics.trendData.length / 24) : 0}
                      />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="amount" name="Spend" fill="hsl(43,85%,55%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {chartView === 'annual' && analytics.yearlyData.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-bold mb-1">Annual Spend by Year</h3>
                  <p className="text-xs text-muted-foreground mb-3">{analytics.yearlyData.map(y => y.year).join(' · ')}</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={analytics.yearlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                      <XAxis dataKey="year" tick={{ fontSize: 12, fill: 'hsl(220,10%,55%)' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="amount" name="Total Spend" fill="hsl(270,60%,60%)" radius={[4, 4, 0, 0]}>
                        {analytics.yearlyData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {analytics.yearlyData.map(y => (
                      <div key={y.year} className="text-xs flex justify-between px-2 py-1 rounded bg-secondary/30">
                        <span className="font-semibold">{y.year}</span>
                        <span className="num-display text-primary">{formatCurrency(y.amount, true)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {chartView === 'daily' && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-bold mb-1">Daily Spend</h3>
                  {filterYear === 'all' || filterMonth === 'all' ? (
                    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground italic">
                      Select a year and month from the filters above to view daily spending
                    </div>
                  ) : analytics.dailyData.length > 0 ? (
                    <>
                      <p className="text-xs text-muted-foreground mb-3">
                        {new Date(parseInt(filterYear), parseInt(filterMonth), 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
                      </p>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={analytics.dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                          <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'hsl(220,10%,55%)' }} angle={-45} textAnchor="end" interval={0} />
                          <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v / 1000).toFixed(1)}K`} />
                          <Tooltip content={<ChartTip />} />
                          <Bar dataKey="amount" name="Spend" fill="hsl(188,60%,48%)" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground italic">
                      No expenses found for the selected period
                    </div>
                  )}
                </div>
              )}
              {chartView === 'monthly' && analytics.weeklyData.length > 1 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-bold mb-4">Weekly Spend (last 16 weeks)</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={analytics.weeklyData} margin={{ top: 5, right: 10, left: 0, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                      <XAxis dataKey="week" tick={{ fontSize: 9, fill: 'hsl(220,10%,55%)' }} angle={-30} textAnchor="end" />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v / 1000).toFixed(1)}K`} />
                      <Tooltip content={<ChartTip />} />
                      <Line type="monotone" dataKey="amount" name="Spend" stroke="hsl(188,60%,48%)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {analytics.avgMonthlyByCategory.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-bold mb-4">Avg Monthly by Category</h3>
                  <div className="space-y-2">
                    {analytics.avgMonthlyByCategory.slice(0, 8).map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-muted-foreground w-32 truncate">{d.name}</span>
                        <div className="flex-1 bg-secondary/30 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full rounded-full" style={{ background: COLORS[i % COLORS.length], width: `${Math.min(100, (d.avg / (analytics.avgMonthlyByCategory[0]?.avg || 1)) * 100)}%` }} />
                        </div>
                        <span className="font-semibold num-display w-16 text-right">{formatCurrency(d.avg, true)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                            <span className="px-1.5 py-0.5 rounded font-semibold num-display" style={{ background: growing ? 'hsl(0,60%,15%)' : 'hsl(142,60%,10%)', color: growing ? 'hsl(0,72%,60%)' : 'hsl(142,60%,45%)' }}>
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

          {/* Add Form */}
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
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
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
            {showAdvancedFilters && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border">
                <div>
                  <label className="text-xs text-muted-foreground">Source Code</label>
                  <Select value={filterSourceCode} onValueChange={v => { setFilterSourceCode(v); setPage(1); }}>
                    <SelectTrigger className="h-8 text-sm mt-0.5"><SelectValue placeholder="Code" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Codes</SelectItem>
                      {ALL_SOURCE_CODES.map(c => <SelectItem key={c} value={c}>{c} — {SOURCE_CODE_MAP[c]}</SelectItem>)}
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
                  <Input value={filterSubcat} onChange={e => { setFilterSubcat(e.target.value); setPage(1); }} placeholder="Filter sub-cat..." className="h-8 text-sm mt-0.5" list="subcats-list" />
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

          {/* Bulk toolbar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 flex-wrap rounded-xl border px-4 py-2.5 text-sm" style={{ borderColor: 'hsl(0,72%,35%)', background: 'hsl(0,50%,8%)' }}>
              <span className="text-red-300 font-semibold">{selected.size} selected</span>
              <Button size="sm" variant="ghost" onClick={togglePageSelect} className="text-xs h-7">{allPageSelected ? 'Deselect page' : 'Select page'}</Button>
              <Button size="sm" variant="ghost" onClick={selectAllFiltered} className="text-xs h-7">Select all {filtered.length} filtered</Button>
              <Button size="sm" variant="ghost" onClick={clearSelection} className="text-xs h-7 text-muted-foreground">Clear</Button>
              <div className="flex-1" />
              <Button size="sm" onClick={() => setShowBulkModal(true)} className="gap-1.5 bg-red-600 hover:bg-red-700 text-white border-0 h-7 text-xs">
                <Trash2 className="w-3 h-3" /> Delete {selected.size} records
              </Button>
            </div>
          )}

          {/* Warning banner */}
          {filtered.length === 0 && expenses.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300 text-sm">
              <span className="text-lg">⚠️</span>
              <div className="flex-1">
                <span className="font-semibold">Your database has {expenses.length} expense record{expenses.length === 1 ? '' : 's'}</span>, but all are hidden by the current filters.
                {filterYear !== 'all' && <span className="ml-1">(Year filter: <strong>{filterYear}</strong>)</span>}
              </div>
              <Button size="sm" variant="outline" className="shrink-0 border-amber-500/50 text-amber-300 hover:bg-amber-500/15 text-xs" onClick={resetFilters}>Clear All Filters</Button>
            </div>
          )}

          {/* Expense table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="px-3 py-2.5 w-8">
                      <button onClick={togglePageSelect} className="flex items-center justify-center text-muted-foreground hover:text-foreground">
                        {allPageSelected ? <CheckSquare className="w-3.5 h-3.5 text-primary" /> : <Square className="w-3.5 h-3.5" />}
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
                          <Button size="sm" variant="outline" className="text-xs border-amber-500/50 text-amber-400 hover:bg-amber-500/10" onClick={resetFilters}>Clear Filters — Show All</Button>
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
                      <tr key={e.id} className={`border-b border-border/50 hover:bg-secondary/20 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`} onClick={() => toggleSelect(e.id)}>
                        <td className="px-3 py-2" onClick={ev => ev.stopPropagation()}>
                          <button onClick={() => toggleSelect(e.id)} className="flex items-center justify-center text-muted-foreground hover:text-foreground">
                            {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-primary" /> : <Square className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-xs">{e.date}</td>
                        <td className="px-3 py-2 text-xs font-bold num-display text-primary">{formatCurrency(e.amount)}</td>
                        <td className="px-3 py-2 text-xs"><span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{e.category}</span></td>
                        <td className="px-3 py-2 text-xs">{e.source_code ? <span className="px-1.5 py-0.5 rounded bg-secondary/60 font-mono text-muted-foreground">{e.source_code}</span> : <span className="text-muted-foreground/40">—</span>}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{e.subcategory}</td>
                        <td className="px-3 py-2 text-xs max-w-[150px] truncate">{e.description}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{e.payment_method}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{e.family_member}</td>
                        <td className="px-3 py-2 text-xs">{e.recurring ? '🔄' : '—'}</td>
                        <td className="px-3 py-2" onClick={ev => ev.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="w-6 h-6" onClick={() => { setEditingId(e.id); setEditDraft({ date: e.date || '', amount: e.amount || '', category: e.category || 'Other', subcategory: e.subcategory || '', description: e.description || '', payment_method: e.payment_method || '', family_member: e.family_member || '', recurring: !!e.recurring, notes: e.notes || '', source_code: e.source_code || '' }); }}>
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="w-6 h-6 text-red-400" onClick={() => deleteMut.mutate(e.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-border bg-secondary/20">
                      <td className="px-3 py-2.5 w-8" />
                      <td className="px-3 py-2.5 text-xs font-bold text-muted-foreground whitespace-nowrap">
                        {filtered.length} record{filtered.length !== 1 ? 's' : ''}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-bold num-display text-primary whitespace-nowrap">
                        {formatCurrency(filteredExpensesTotals.totalAmount, true)}
                      </td>
                      <td colSpan={8} className="px-3 py-2.5 text-xs text-muted-foreground italic">
                        Filtered total · {filtered.length < (expenses as any[]).length ? `${(expenses as any[]).length - filtered.length} records hidden by filters` : 'All records shown'}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-border">
                <p className="text-xs text-muted-foreground">{filtered.length} results · Page {page} of {Math.ceil(filtered.length / PAGE_SIZE)}</p>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                  <Button size="sm" variant="outline" disabled={page >= Math.ceil(filtered.length / PAGE_SIZE)} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </div>

          {/* Bulk delete modal */}
          <BulkDeleteModal open={showBulkModal} count={selected.size} label="expense records" onConfirm={handleBulkDelete} onCancel={() => setShowBulkModal(false)} onExportBackup={handleExportBackup} />

          {/* Auto Import Panel */}
          <AutoImportPanel expenses={expenses} onImportComplete={() => { qc.invalidateQueries({ queryKey: ['/api/expenses'] }); resetFilters(); }} />

          {/* AI Insights */}
          <AIInsightsCard pageKey="expenses" pageLabel="Spending Analysis" getData={() => {
            const byCategory: Record<string,number> = {};
            let monthlyTotal = 0;
            const now = new Date();
            expenses.forEach((e: any) => {
              byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
              const d = new Date(e.date);
              if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) monthlyTotal += e.amount;
            });
            const top = Object.entries(byCategory).sort((a,b) => b[1]-a[1]).slice(0,8).map(([cat,amt]) => ({ cat, amt: Math.round(amt as number) }));
            return { count: expenses.length, monthlyTotal: Math.round(monthlyTotal), topCategories: top };
          }} />
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          INCOME TAB
      ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'income' && (
        <>
          {/* Income KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total (filtered)', value: formatCurrency(incomeAnalytics.totalIncome, true), color: 'text-emerald-400' },
              { label: 'This Month', value: formatCurrency(incomeAnalytics.thisMonthIncome, true), color: 'text-emerald-400' },
              { label: 'Monthly Equiv (recurring)', value: formatCurrency(incomeAnalytics.recurringMonthlyTotal, true), color: 'text-primary' },
              { label: 'Records', value: filteredIncome.length.toString(), color: '' },
            ].map(s => (
              <div key={s.label} className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-lg font-bold num-display mt-1 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Income charts */}
          {incomeAnalytics.sourceData.length > 0 && (
            <div className="grid lg:grid-cols-2 gap-4">
              {/* Income by source */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-bold mb-4">Income by Source</h3>
                <div className="flex items-center gap-3">
                  <ResponsiveContainer width="45%" height={200}>
                    <PieChart>
                      <Pie data={incomeAnalytics.sourceData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                        {incomeAnalytics.sourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v, true)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1 text-xs">
                    {incomeAnalytics.sourceData.map((d, i) => (
                      <div key={d.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="text-muted-foreground truncate max-w-[80px]">{d.name}</span>
                        </div>
                        <span className="font-semibold num-display text-emerald-400">{formatCurrency(d.value, true)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Income trend */}
              {incomeAnalytics.trendData.length > 1 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-bold mb-4">Monthly Income Trend</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={incomeAnalytics.trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                      <Tooltip content={<ChartTip />} />
                      <Bar dataKey="amount" name="Income" fill="hsl(142,60%,45%)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {/* Income by member */}
              {incomeAnalytics.memberData.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-bold mb-4">Income by Member</h3>
                  <div className="space-y-2">
                    {incomeAnalytics.memberData.map((d, i) => (
                      <div key={d.name} className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-muted-foreground w-32 truncate">{d.name}</span>
                        <div className="flex-1 bg-secondary/30 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full rounded-full" style={{ background: COLORS[i % COLORS.length], width: `${Math.min(100, (d.value / (incomeAnalytics.memberData[0]?.value || 1)) * 100)}%` }} />
                        </div>
                        <span className="font-semibold num-display w-16 text-right text-emerald-400">{formatCurrency(d.value, true)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Recurring monthly equiv summary */}
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-bold mb-4">Recurring Monthly Breakdown</h3>
                <div className="space-y-2">
                  {incomeRecords.filter((r: any) => r.recurring && r.frequency !== 'One-off').map((r: any, i: number) => (
                    <div key={r.id} className="flex items-center justify-between text-xs py-1 border-b border-border/30">
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium truncate">{r.source}{r.description ? ` — ${r.description}` : ''}</span>
                        <span className="text-muted-foreground">{r.member} · {r.frequency}</span>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="font-bold num-display text-emerald-400">{formatCurrency(toMonthlyEquiv(r.amount, r.frequency))}<span className="text-muted-foreground font-normal">/mo</span></p>
                        <p className="text-muted-foreground">{formatCurrency(r.amount)} {r.frequency.toLowerCase()}</p>
                      </div>
                    </div>
                  ))}
                  {incomeRecords.filter((r: any) => r.recurring).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No recurring income records yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Add income form */}
          {showAddIncome && (
            <div className="rounded-xl border border-emerald-500/30 bg-card p-5">
              <h3 className="text-sm font-bold mb-4">Add Income Record</h3>
              <IncomeForm data={incomeDraft} onChange={handleIncomeDraftChange} />
              <div className="flex gap-2 mt-4">
                <SaveButton label="Save Income Record" onSave={() => createIncomeMut.mutateAsync(normaliseIncomeDraft(incomeDraft))} />
                <Button size="sm" variant="outline" onClick={() => setShowAddIncome(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Income filters */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex gap-2 flex-wrap items-center">
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input placeholder="Search..." value={incomeSearch} onChange={e => setIncomeSearch(e.target.value)} className="h-8 pl-8 text-sm" />
              </div>
              <Select value={incomeFilterYear} onValueChange={v => { setIncomeFilterYear(v); setIncomePage(1); }}>
                <SelectTrigger className="h-8 text-sm w-28"><SelectValue placeholder="Year" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={incomeFilterMonth} onValueChange={v => { setIncomeFilterMonth(v); setIncomePage(1); }}>
                <SelectTrigger className="h-8 text-sm w-32"><SelectValue placeholder="Month" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={incomeFilterSource} onValueChange={v => { setIncomeFilterSource(v); setIncomePage(1); }}>
                <SelectTrigger className="h-8 text-sm w-40"><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  {INCOME_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={incomeFilterMember} onValueChange={v => { setIncomeFilterMember(v); setIncomePage(1); }}>
                <SelectTrigger className="h-8 text-sm w-40"><SelectValue placeholder="Member" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Members</SelectItem>
                  {FAMILY_MEMBERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" className="text-xs h-8 text-muted-foreground" onClick={() => { setIncomeSearch(''); setIncomeFilterYear('all'); setIncomeFilterMonth('all'); setIncomeFilterSource('all'); setIncomeFilterMember('all'); setIncomePage(1); }}>Reset</Button>
            </div>
          </div>

          {/* Income table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    {['Date', 'Amount', 'Monthly Equiv', 'Source', 'Description', 'Member', 'Frequency', 'Recurring', 'Notes', 'Actions'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedIncome.length === 0 ? (
                    <tr><td colSpan={10} className="py-10 text-center text-sm text-muted-foreground">
                      No income records found. Add your first record above or import from Excel.
                    </td></tr>
                  ) : paginatedIncome.map((r: any) => {
                    if (editingIncomeId === r.id && editIncomeDraft) {
                      return (
                        <tr key={r.id} className="border-b border-border bg-secondary/20">
                          <td colSpan={10} className="p-3">
                            <IncomeForm data={editIncomeDraft} onChange={handleEditIncomeDraftChange} />
                            <div className="flex gap-2 mt-3">
                              <SaveButton label="Save Income Record" onSave={() => updateIncomeMut.mutateAsync({ id: r.id, data: normaliseIncomeDraft(editIncomeDraft) })} />
                              <Button size="sm" variant="outline" onClick={() => setEditingIncomeId(null)}>Cancel</Button>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                        <td className="px-3 py-2 text-xs">{r.date}</td>
                        <td className="px-3 py-2 text-xs font-bold num-display text-emerald-400">{formatCurrency(r.amount)}</td>
                        <td className="px-3 py-2 text-xs num-display text-primary">{r.frequency !== 'One-off' ? `${formatCurrency(toMonthlyEquiv(r.amount, r.frequency))}/mo` : '—'}</td>
                        <td className="px-3 py-2 text-xs"><span className="px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 text-[11px]">{r.source}</span></td>
                        <td className="px-3 py-2 text-xs max-w-[140px] truncate">{r.description}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{r.member}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{r.frequency}</td>
                        <td className="px-3 py-2 text-xs">{r.recurring ? '🔄' : '—'}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground max-w-[100px] truncate">{r.notes}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="w-6 h-6" onClick={() => { setEditingIncomeId(r.id); setEditIncomeDraft({ date: r.date || '', amount: r.amount || '', source: r.source || 'Salary', description: r.description || '', member: r.member || 'Family', frequency: r.frequency || 'Monthly', recurring: !!r.recurring, notes: r.notes || '' }); }}>
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="w-6 h-6 text-red-400" onClick={() => deleteIncomeMut.mutate(r.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {filteredIncome.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-primary/30 bg-primary/5">
                      <td className="px-3 py-2.5 text-xs font-bold text-muted-foreground whitespace-nowrap">
                        {filteredIncome.length} record{filteredIncome.length !== 1 ? 's' : ''}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-bold num-display text-emerald-400 whitespace-nowrap">
                        {formatCurrency(filteredIncomeTotals.totalAmount, true)}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-bold num-display text-primary whitespace-nowrap">
                        {filteredIncomeTotals.totalMonthlyEquiv > 0
                          ? <>{formatCurrency(filteredIncomeTotals.totalMonthlyEquiv, true)}<span className="text-muted-foreground font-normal">/mo</span></>
                          : <span className="text-muted-foreground font-normal">—</span>}
                      </td>
                      <td colSpan={7} className="px-3 py-2.5 text-xs text-muted-foreground italic">
                        Filtered totals · {filteredIncome.length < (incomeRecords as any[]).length ? `${(incomeRecords as any[]).length - filteredIncome.length} records hidden by filters` : 'All records shown'}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {filteredIncome.length > PAGE_SIZE && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-border">
                <p className="text-xs text-muted-foreground">{filteredIncome.length} results · Page {incomePage} of {Math.ceil(filteredIncome.length / PAGE_SIZE)}</p>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" disabled={incomePage <= 1} onClick={() => setIncomePage(p => p - 1)}>Prev</Button>
                  <Button size="sm" variant="outline" disabled={incomePage >= Math.ceil(filteredIncome.length / PAGE_SIZE)} onClick={() => setIncomePage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          CASH FLOW TAB
      ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'cashflow' && (
        <>
          {/* Cash flow filters */}
          <div className="flex gap-2 items-center flex-wrap">
            <Select value={cfYear} onValueChange={setCfYear}>
              <SelectTrigger className="h-8 text-sm w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={cfMonth} onValueChange={setCfMonth}>
              <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="All Months" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Months</SelectItem>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Cash flow = Income − Expenses</p>
          </div>

          {/* Cash Flow KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: `${cfYear} Total Income`, value: formatCurrency(cashFlowData.summary.totalIncome, true), color: 'text-emerald-400' },
              { label: `${cfYear} Total Expenses`, value: formatCurrency(cashFlowData.summary.totalExpenses, true), color: 'text-red-400' },
              { label: 'Net Cash Flow', value: formatCurrency(cashFlowData.summary.netCF, true), color: cashFlowData.summary.netCF >= 0 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Savings Rate', value: `${cashFlowData.summary.savingsRate.toFixed(1)}%`, color: cashFlowData.summary.savingsRate >= 20 ? 'text-emerald-400' : 'text-amber-400' },
            ].map(s => (
              <div key={s.label} className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-lg font-bold num-display mt-1 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Cash Flow Chart 1: Monthly Income vs Expenses bar chart */}
          {cashFlowData.monthly.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-bold mb-4">Monthly Income vs Expenses — {cfYear}</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={cashFlowData.monthly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(220,10%,55%)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'hsl(220,10%,55%)' }} />
                  <Bar dataKey="income" name="Income" fill="hsl(142,60%,45%)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="hsl(0,72%,51%)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Cash Flow Chart 2: Net cash flow line */}
          {cashFlowData.monthly.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-bold mb-1">Net Cash Flow Trend</h3>
              <p className="text-xs text-muted-foreground mb-4">Positive = surplus, negative = deficit</p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={cashFlowData.monthly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(43,85%,55%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(43,85%,55%)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(220,10%,55%)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="netCF" name="Net CF" stroke="hsl(43,85%,55%)" fill="url(#cfGrad)" strokeWidth={2} dot={{ fill: 'hsl(43,85%,55%)', r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Cash Flow Chart 3: Daily expense spikes (when month selected) */}
          {cfMonth !== 'all' && cashFlowData.daily.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-bold mb-1">Daily Transactions — {MONTHS[parseInt(cfMonth)]} {cfYear}</h3>
              <p className="text-xs text-muted-foreground mb-4">Income (green) and expenses (gold) by day</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={cashFlowData.daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v / 1000).toFixed(1)}K`} />
                  <Tooltip content={<ChartTip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: 'hsl(220,10%,55%)' }} />
                  <Bar dataKey="income" name="Income" fill="hsl(142,60%,45%)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="hsl(43,85%,55%)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Cash Flow Chart 4: Savings rate gauge-style bar */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-bold mb-1">Savings Rate Analysis — {cfYear}</h3>
            <p className="text-xs text-muted-foreground mb-4">Target: 20%+. Income source: {incomeRecords.length > 0 ? 'Income Tracker' : 'Snapshot fallback'}</p>
            {incomeRecords.length === 0 && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-700/30 text-xs text-amber-300">
                No income records in tracker. Add income records in the Income tab for accurate cash flow analysis.
              </div>
            )}
            <div className="space-y-3">
              {cashFlowData.monthly.filter(m => m.income > 0 || m.expenses > 0).map((m, i) => {
                const rate = m.income > 0 ? ((m.income - m.expenses) / m.income) * 100 : 0;
                const good = rate >= 20;
                return (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="w-8 text-muted-foreground">{m.month}</span>
                    <div className="flex-1 bg-secondary/30 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, rate))}%`, background: good ? 'hsl(142,60%,45%)' : rate > 0 ? 'hsl(43,85%,55%)' : 'hsl(0,72%,51%)' }}
                      />
                    </div>
                    <span className={`w-12 text-right num-display font-semibold ${good ? 'text-emerald-400' : rate > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                      {rate.toFixed(0)}%
                    </span>
                    <span className="w-20 text-right text-muted-foreground num-display">{formatCurrency(m.netCF, true)}</span>
                  </div>
                );
              })}
              {cashFlowData.monthly.filter(m => m.income > 0 || m.expenses > 0).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No data for {cfYear}. Add income and expense records first.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

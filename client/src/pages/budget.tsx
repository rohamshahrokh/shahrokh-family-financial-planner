import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAppStore } from "@/lib/store";
import { formatCurrency } from "@/lib/finance";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { Target, Plus, Pencil, Trash2, Download, Copy, AlertCircle, TrendingUp, TrendingDown } from "lucide-react";

// ---------------------------------------------------------------------------
// Constants & helpers at module level
// ---------------------------------------------------------------------------

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MEMBERS = ["Family", "Roham", "Fara", "Kids"] as const;

const safeNum = (v: any): number => parseFloat(v) || 0;

// ---------------------------------------------------------------------------
// Inline form field components (module level to avoid re-mount)
// ---------------------------------------------------------------------------

interface AddBudgetFormProps {
  selectedYear: number;
  selectedMonth: number;
  onSuccess: () => void;
}

function AddBudgetForm({ selectedYear, selectedMonth, onSuccess }: AddBudgetFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [category, setCategory] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [member, setMember] = useState<string>("Family");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("POST", "/api/budgets", data); return r.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      toast({ title: "Budget saved", description: `Budget row for "${category}" created.` });
      setCategory("");
      setBudgetAmount("");
      setMember("Family");
      setNotes("");
      onSuccess();
    },
    onError: (err: any) => {
      toast({ title: "Error saving budget", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!category.trim()) {
      toast({ title: "Category required", variant: "destructive" });
      return;
    }
    if (!budgetAmount || safeNum(budgetAmount) <= 0) {
      toast({ title: "Valid budget amount required", variant: "destructive" });
      return;
    }
    mutation.mutate({
      year: selectedYear,
      month: selectedMonth,
      category: category.trim(),
      budget_amount: safeNum(budgetAmount),
      member,
      notes: notes.trim(),
    });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-400 font-medium">Category</label>
        <Input
          placeholder="e.g. Groceries"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-400 font-medium">Budget Amount ($)</label>
        <Input
          type="number"
          placeholder="0.00"
          value={budgetAmount}
          onChange={(e) => setBudgetAmount(e.target.value)}
          className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-400 font-medium">Member</label>
        <Select value={member} onValueChange={setMember}>
          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
            {MEMBERS.map((m) => (
              <SelectItem key={m} value={m} className="focus:bg-zinc-700">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-400 font-medium">Notes (optional)</label>
        <Input
          placeholder="Optional notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
        />
      </div>
      <Button
        onClick={handleSubmit}
        disabled={mutation.isPending}
        className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
      >
        <Plus className="w-4 h-4 mr-1" />
        {mutation.isPending ? "Saving…" : "Add Budget"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline edit row component (module level)
// ---------------------------------------------------------------------------

interface EditRowProps {
  row: any;
  onCancel: () => void;
  onSaved: () => void;
}

function EditRow({ row, onCancel, onSaved }: EditRowProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [category, setCategory] = useState(row.category ?? "");
  const [budgetAmount, setBudgetAmount] = useState(String(safeNum(row.budget_amount)));
  const [member, setMember] = useState(row.member ?? "Family");
  const [notes, setNotes] = useState(row.notes ?? "");

  const mutation = useMutation({
    mutationFn: async (data: any) => { const r = await apiRequest("PUT", `/api/budgets/id/${row.id}`, data); return r.json(); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      toast({ title: "Budget updated" });
      onSaved();
    },
    onError: (err: any) => {
      toast({ title: "Error updating budget", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const handleSave = () => {
    if (!category.trim()) {
      toast({ title: "Category required", variant: "destructive" });
      return;
    }
    mutation.mutate({
      category: category.trim(),
      budget_amount: safeNum(budgetAmount),
      member,
      notes: notes.trim(),
    });
  };

  return (
    <tr className="bg-indigo-950/40 border-b border-zinc-700/50">
      <td className="px-3 py-2">
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm"
        />
      </td>
      <td className="px-3 py-2">
        <Input
          type="number"
          value={budgetAmount}
          onChange={(e) => setBudgetAmount(e.target.value)}
          className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm w-28"
        />
      </td>
      <td className="px-3 py-2 text-zinc-400 text-sm">—</td>
      <td className="px-3 py-2 text-zinc-400 text-sm">—</td>
      <td className="px-3 py-2 text-zinc-400 text-sm">—</td>
      <td className="px-3 py-2 text-zinc-400 text-sm">—</td>
      <td className="px-3 py-2">
        <Select value={member} onValueChange={setMember}>
          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100 h-8 text-sm w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700 text-zinc-100">
            {MEMBERS.map((m) => (
              <SelectItem key={m} value={m} className="focus:bg-zinc-700 text-sm">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={mutation.isPending}
            className="bg-indigo-600 hover:bg-indigo-500 text-white h-7 px-3 text-xs"
          >
            {mutation.isPending ? "…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            className="text-zinc-400 hover:text-zinc-100 h-7 px-3 text-xs"
          >
            Cancel
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Status badge helper
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: "under" | "near" | "over" }) {
  if (status === "under") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-900/60 text-emerald-400 border border-emerald-700/50">
        <TrendingUp className="w-3 h-3" />
        On Track
      </span>
    );
  }
  if (status === "near") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-900/60 text-amber-400 border border-amber-700/50">
        <AlertCircle className="w-3 h-3" />
        Near Limit
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/60 text-red-400 border border-red-700/50">
      <TrendingDown className="w-3 h-3" />
      Over Budget
    </span>
  );
}

// ---------------------------------------------------------------------------
// Used% progress bar helper
// ---------------------------------------------------------------------------

function UsedPctBar({ pct }: { pct: number }) {
  const clamped = Math.min(pct, 100);
  const color =
    pct >= 100
      ? "bg-red-500"
      : pct >= 80
      ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden min-w-[60px]">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs text-zinc-300 tabular-nums w-10 text-right">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI summary card
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "red" | "amber" | "default";
}) {
  const accentClass =
    accent === "green"
      ? "text-emerald-400"
      : accent === "red"
      ? "text-red-400"
      : accent === "amber"
      ? "text-amber-400"
      : "text-indigo-400";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-1">
      <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${accentClass}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function BudgetPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { privacyMode } = useAppStore();

  // Current date defaults
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1); // 1-based
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formKey, setFormKey] = useState(0); // force re-mount form on success

  // Privacy-aware formatter
  const fmt = (v: number) =>
    privacyMode ? "$••••••" : formatCurrency(v);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const { data: budgetsRaw = [], isLoading: budgetsLoading } = useQuery<any[]>({
    queryKey: ["/api/budgets"],
    queryFn: async (): Promise<any[]> => { const r = await apiRequest("GET", "/api/budgets"); return r.json(); },
  });

  const { data: expensesRaw = [], isLoading: expensesLoading } = useQuery<any[]>({
    queryKey: ["/api/expenses"],
    queryFn: async (): Promise<any[]> => { const r = await apiRequest("GET", "/api/expenses"); return r.json(); },
  });

  // ---------------------------------------------------------------------------
  // Filter + compute
  // ---------------------------------------------------------------------------

  const monthPrefix = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;

  const budgets = useMemo(
    () =>
      budgetsRaw.filter(
        (b: any) =>
          safeNum(b.year) === selectedYear && safeNum(b.month) === selectedMonth
      ),
    [budgetsRaw, selectedYear, selectedMonth]
  );

  const expenses = useMemo(
    () =>
      expensesRaw.filter(
        (e: any) =>
          typeof e.date === "string" && e.date.startsWith(monthPrefix)
      ),
    [expensesRaw, monthPrefix]
  );

  // Build expense totals per category (case-insensitive key)
  const expenseByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of expenses) {
      const key = (e.category ?? "").toLowerCase().trim();
      map[key] = (map[key] ?? 0) + safeNum(e.amount);
    }
    return map;
  }, [expenses]);

  // Compute enriched rows
  const rows = useMemo(() => {
    return budgets.map((b: any) => {
      const budgetAmount = safeNum(b.budget_amount);
      const actualSpend =
        expenseByCategory[(b.category ?? "").toLowerCase().trim()] ?? 0;
      const variance = budgetAmount - actualSpend;
      const variancePct =
        budgetAmount > 0 ? (variance / budgetAmount) * 100 : 0;
      const usedPct = budgetAmount > 0 ? (actualSpend / budgetAmount) * 100 : 0;
      const remaining = variance;
      const status: "under" | "near" | "over" =
        usedPct >= 100 ? "over" : usedPct >= 80 ? "near" : "under";

      return {
        ...b,
        budgetAmount,
        actualSpend,
        variance,
        variancePct,
        usedPct,
        remaining,
        status,
      };
    });
  }, [budgets, expenseByCategory]);

  // Untracked categories: have expenses but NO budget row
  const untrackedCategories = useMemo(() => {
    const budgetedKeys = new Set(
      budgets.map((b: any) => (b.category ?? "").toLowerCase().trim())
    );
    const result: { category: string; totalSpend: number }[] = [];
    for (const [key, total] of Object.entries(expenseByCategory)) {
      if (!budgetedKeys.has(key)) {
        result.push({ category: key, totalSpend: total });
      }
    }
    return result.sort((a, b) => b.totalSpend - a.totalSpend);
  }, [budgets, expenseByCategory]);

  // Totals
  const totals = useMemo(() => {
    return rows.reduce(
      (acc: { budgetAmount: number; actualSpend: number; variance: number; remaining: number; overCount: number }, r: any) => ({
        budgetAmount: acc.budgetAmount + r.budgetAmount,
        actualSpend: acc.actualSpend + r.actualSpend,
        variance: acc.variance + r.variance,
        remaining: acc.remaining + r.remaining,
        overCount: acc.overCount + (r.status === "over" ? 1 : 0),
      }),
      { budgetAmount: 0, actualSpend: 0, variance: 0, remaining: 0, overCount: 0 }
    );
  }, [rows]);

  // ---------------------------------------------------------------------------
  // Delete mutation
  // ---------------------------------------------------------------------------

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { const r = await apiRequest("DELETE", `/api/budgets/id/${id}`); return r.json().catch(() => null); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      toast({ title: "Budget row deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Error deleting", description: err?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  // ---------------------------------------------------------------------------
  // Copy previous month
  // ---------------------------------------------------------------------------

  const copyPrevMonth = async () => {
    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

    try {
      const prevResp = await apiRequest("GET", `/api/budgets/${prevYear}/${prevMonth}`);
      const prevBudgets = await prevResp.json();
      if (!Array.isArray(prevBudgets) || prevBudgets.length === 0) {
        toast({
          title: "No budgets found",
          description: `No budget rows in ${MONTHS[prevMonth - 1]} ${prevYear}.`,
          variant: "destructive",
        });
        return;
      }

      const newRows = prevBudgets.map(({ id: _id, ...rest }: any) => ({
        ...rest,
        year: selectedYear,
        month: selectedMonth,
      }));

      const bulkResp = await apiRequest("POST", "/api/budgets/bulk", { budgets: newRows });
      await bulkResp.json().catch(() => null);
      queryClient.invalidateQueries({ queryKey: ["/api/budgets"] });
      toast({
        title: "Budgets copied",
        description: `${newRows.length} rows copied from ${MONTHS[prevMonth - 1]} ${prevYear}.`,
      });
    } catch (err: any) {
      toast({
        title: "Copy failed",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Export Excel
  // ---------------------------------------------------------------------------

  const exportExcel = () => {
    const data = rows.map((r: any) => ({
      Category: r.category,
      Member: r.member ?? "",
      "Budget ($)": r.budgetAmount,
      "Actual Spend ($)": r.actualSpend,
      "Remaining ($)": r.remaining,
      "Used %": parseFloat(r.usedPct.toFixed(2)),
      "Variance ($)": r.variance,
      "Variance %": parseFloat(r.variancePct.toFixed(2)),
      Status: r.status === "under" ? "On Track" : r.status === "near" ? "Near Limit" : "Over Budget",
      Notes: r.notes ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Budget ${MONTHS[selectedMonth - 1]} ${selectedYear}`);
    XLSX.writeFile(wb, `budget_${selectedYear}_${String(selectedMonth).padStart(2, "0")}.xlsx`);

    toast({ title: "Excel exported", description: `budget_${selectedYear}_${String(selectedMonth).padStart(2, "0")}.xlsx` });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isLoading = budgetsLoading || expensesLoading;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 sm:p-6 lg:p-8">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
            <Target className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Monthly Budget</h1>
            <p className="text-sm text-zinc-400">
              {MONTHS[selectedMonth - 1]} {selectedYear}
            </p>
          </div>
        </div>

        {/* Month / Year selectors */}
        <div className="flex items-center gap-2">
          <Select
            value={String(selectedMonth)}
            onValueChange={(v) => setSelectedMonth(Number(v))}
          >
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
              {MONTHS.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)} className="focus:bg-zinc-700">
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(selectedYear)}
            onValueChange={(v) => setSelectedYear(Number(v))}
          >
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100 w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-700 text-zinc-100">
              {[2024, 2025, 2026, 2027].map((y) => (
                <SelectItem key={y} value={String(y)} className="focus:bg-zinc-700">
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 5 — KPI Summary cards (placed near top for quick overview)  */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label="Total Budgeted"
          value={fmt(totals.budgetAmount)}
          accent="default"
        />
        <KpiCard
          label="Total Actual Spend"
          value={fmt(totals.actualSpend)}
          accent={totals.actualSpend > totals.budgetAmount ? "red" : "default"}
        />
        <KpiCard
          label="Total Remaining"
          value={fmt(totals.remaining)}
          accent={totals.remaining >= 0 ? "green" : "red"}
          sub={totals.remaining < 0 ? "Over total budget" : undefined}
        />
        <KpiCard
          label="Categories Over Budget"
          value={String(totals.overCount)}
          accent={totals.overCount > 0 ? "red" : "green"}
          sub={totals.overCount === 0 ? "All on track" : `${totals.overCount} exceeded`}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 1 — Add Budget Row form card                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-indigo-400" />
          Add Budget Row
        </h2>
        <AddBudgetForm
          key={formKey}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onSuccess={() => setFormKey((k) => k + 1)}
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2 — Action buttons                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Button
          variant="outline"
          onClick={copyPrevMonth}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <Copy className="w-4 h-4 mr-2" />
          Copy Previous Month
        </Button>
        <Button
          variant="outline"
          onClick={exportExcel}
          disabled={rows.length === 0}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <Download className="w-4 h-4 mr-2" />
          Export Excel
        </Button>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 3 — Budget vs Actual table                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl mb-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <Target className="w-4 h-4 text-indigo-400" />
            Budget vs. Actual — {MONTHS[selectedMonth - 1]} {selectedYear}
          </h2>
          {isLoading && (
            <span className="text-xs text-zinc-500 animate-pulse">Loading…</span>
          )}
        </div>

        {rows.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
            <Target className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No budget rows for this month.</p>
            <p className="text-xs mt-1">Add a row above or copy from the previous month.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                  <th className="px-3 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                    Category
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                    Budget
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                    Actual
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                    Remaining
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide min-w-[120px]">
                    Used %
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                    Variance
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: any) =>
                  editingId === row.id ? (
                    <EditRow
                      key={`edit-${row.id}`}
                      row={row}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => setEditingId(null)}
                    />
                  ) : (
                    <tr
                      key={row.id}
                      className="border-b border-zinc-800/60 hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-3 py-3">
                        <div className="font-medium text-zinc-100">{row.category}</div>
                        {row.member && (
                          <div className="text-xs text-zinc-500 mt-0.5">{row.member}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-zinc-300">
                        {fmt(row.budgetAmount)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-zinc-300">
                        {fmt(row.actualSpend)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right tabular-nums font-medium ${
                          row.remaining < 0 ? "text-red-400" : "text-emerald-400"
                        }`}
                      >
                        {fmt(row.remaining)}
                      </td>
                      <td className="px-3 py-3">
                        <UsedPctBar pct={row.usedPct} />
                      </td>
                      <td
                        className={`px-3 py-3 text-right tabular-nums font-medium ${
                          row.variance < 0 ? "text-red-400" : "text-emerald-400"
                        }`}
                      >
                        {row.variance >= 0 ? "+" : ""}
                        {fmt(row.variance)}
                        <div className="text-xs text-zinc-500 font-normal">
                          {row.variancePct >= 0 ? "+" : ""}
                          {row.variancePct.toFixed(1)}%
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingId(row.id)}
                            className="h-7 w-7 p-0 text-zinc-400 hover:text-indigo-400 hover:bg-indigo-900/30"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteMutation.mutate(row.id)}
                            disabled={deleteMutation.isPending}
                            className="h-7 w-7 p-0 text-zinc-400 hover:text-red-400 hover:bg-red-900/30"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                )}

                {/* Totals row */}
                {rows.length > 0 && (
                  <tr className="bg-zinc-800/50 border-t-2 border-zinc-600">
                    <td className="px-3 py-3 font-bold text-zinc-200 text-sm">Totals</td>
                    <td className="px-3 py-3 text-right tabular-nums font-bold text-zinc-200">
                      {fmt(totals.budgetAmount)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-bold text-zinc-200">
                      {fmt(totals.actualSpend)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums font-bold ${
                        totals.remaining < 0 ? "text-red-400" : "text-emerald-400"
                      }`}
                    >
                      {fmt(totals.remaining)}
                    </td>
                    <td className="px-3 py-3">
                      {totals.budgetAmount > 0 && (
                        <UsedPctBar
                          pct={(totals.actualSpend / totals.budgetAmount) * 100}
                        />
                      )}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums font-bold ${
                        totals.variance < 0 ? "text-red-400" : "text-emerald-400"
                      }`}
                    >
                      {totals.variance >= 0 ? "+" : ""}
                      {fmt(totals.variance)}
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs text-zinc-400">
                        {totals.overCount > 0
                          ? `${totals.overCount} over budget`
                          : "All on track"}
                      </span>
                    </td>
                    <td className="px-3 py-3" />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Section 4 — Untracked categories (warning cards)                    */}
      {/* ------------------------------------------------------------------ */}
      {untrackedCategories.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            Untracked Spending — No Budget Set
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {untrackedCategories.map(({ category, totalSpend }) => (
              <div
                key={category}
                className="bg-amber-950/30 border border-amber-700/40 rounded-xl p-3 flex flex-col gap-1"
              >
                <p className="text-xs font-medium text-amber-400 capitalize truncate">
                  {category}
                </p>
                <p className="text-lg font-bold tabular-nums text-amber-300">
                  {fmt(totalSpend)}
                </p>
                <p className="text-xs text-amber-600">No budget set</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

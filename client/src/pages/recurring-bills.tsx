/**
 * recurring-bills.tsx — Recurring Bills & Obligations
 * Route: /recurring-bills
 *
 * Features:
 *  - Add / Edit bill form (always visible)
 *  - KPI summary cards (monthly cost, due this week, annual, overdue)
 *  - Upcoming bills with 30/60/90/All tab filter
 *  - Monthly breakdown by category
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAppStore } from "@/lib/store";
import { formatCurrency } from "@/lib/finance";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Clock,
  Calendar,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Bill {
  id: number;
  name: string;
  category: string;
  amount: number;
  frequency: string;
  next_due_date: string | null;
  start_date: string | null;
  reminder_days: number;
  member: string;
  essential: boolean;
  auto_renew: boolean;
  payment_method: string;
  notes: string;
  active: boolean;
}

interface BillFormState {
  name: string;
  category: string;
  amount: string;
  frequency: string;
  next_due_date: string;
  start_date: string;
  reminder_days: string;
  reminder_custom: string;
  member: string;
  essential: boolean;
  auto_renew: boolean;
  payment_method: string;
  notes: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Housing",
  "Insurance",
  "Utilities",
  "Childcare",
  "Subscriptions",
  "Transport",
  "Health",
  "Finance",
  "Other",
];

const FREQUENCIES = ["Weekly", "Fortnightly", "Monthly", "Quarterly", "Annual"];
const MEMBERS = ["Family", "Roham", "Fara", "Kids"];
const REMINDER_OPTIONS = ["1", "3", "7", "14", "custom"];

const safeNum = (v: any) => parseFloat(v) || 0;

function toMonthly(amount: number, frequency: string): number {
  switch (frequency) {
    case "Weekly":
      return amount * (52 / 12);
    case "Fortnightly":
      return amount * (26 / 12);
    case "Monthly":
      return amount;
    case "Quarterly":
      return amount / 3;
    case "Annual":
      return amount / 12;
    default:
      return amount;
  }
}

function toAnnual(amount: number, frequency: string): number {
  return toMonthly(amount, frequency) * 12;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Default form state (module level) ───────────────────────────────────────

const DEFAULT_FORM: BillFormState = {
  name: "",
  category: "Housing",
  amount: "",
  frequency: "Monthly",
  next_due_date: "",
  start_date: "",
  reminder_days: "7",
  reminder_custom: "",
  member: "Family",
  essential: false,
  auto_renew: false,
  payment_method: "",
  notes: "",
};

// ─── BillForm component (module level — prevents focus loss) ──────────────────

interface BillFormProps {
  form: BillFormState;
  onChange: (field: keyof BillFormState, value: string | boolean) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  isEditing: boolean;
  isPending: boolean;
}

function BillForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  isEditing,
  isPending,
}: BillFormProps) {
  const effectiveReminder =
    form.reminder_days === "custom" ? form.reminder_custom : form.reminder_days;

  return (
    <div className="space-y-5">
      {/* Row 1: Name + Category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Bill Name *
          </label>
          <Input
            value={form.name}
            onChange={(e) => onChange("name", e.target.value)}
            placeholder="e.g. Mortgage, Netflix, AGL Power"
            className="bg-zinc-900 border-zinc-700 text-white"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Category
          </label>
          <Select
            value={form.category}
            onValueChange={(v) => onChange("category", v)}
          >
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2: Amount + Frequency */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Amount ($)
          </label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={(e) => onChange("amount", e.target.value)}
            placeholder="0.00"
            className="bg-zinc-900 border-zinc-700 text-white"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Frequency
          </label>
          <Select
            value={form.frequency}
            onValueChange={(v) => onChange("frequency", v)}
          >
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 3: Next Due Date + Start Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Next Due Date
          </label>
          <Input
            type="date"
            value={form.next_due_date}
            onChange={(e) => onChange("next_due_date", e.target.value)}
            className="bg-zinc-900 border-zinc-700 text-white"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Start Date
          </label>
          <Input
            type="date"
            value={form.start_date}
            onChange={(e) => onChange("start_date", e.target.value)}
            className="bg-zinc-900 border-zinc-700 text-white"
          />
        </div>
      </div>

      {/* Row 4: Reminder Days + Member */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Reminder Days Before
          </label>
          <div className="flex gap-2">
            <Select
              value={form.reminder_days}
              onValueChange={(v) => onChange("reminder_days", v)}
            >
              <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REMINDER_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r === "custom" ? "Custom…" : `${r} day${r === "1" ? "" : "s"}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.reminder_days === "custom" && (
              <Input
                type="number"
                min="1"
                value={form.reminder_custom}
                onChange={(e) => onChange("reminder_custom", e.target.value)}
                placeholder="Days"
                className="bg-zinc-900 border-zinc-700 text-white w-24"
              />
            )}
          </div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Member
          </label>
          <Select
            value={form.member}
            onValueChange={(v) => onChange("member", v)}
          >
            <SelectTrigger className="bg-zinc-900 border-zinc-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMBERS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 5: Payment Method + Notes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Payment Method
          </label>
          <Input
            value={form.payment_method}
            onChange={(e) => onChange("payment_method", e.target.value)}
            placeholder="e.g. Direct Debit, Credit Card"
            className="bg-zinc-900 border-zinc-700 text-white"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Notes
          </label>
          <Input
            value={form.notes}
            onChange={(e) => onChange("notes", e.target.value)}
            placeholder="Optional notes"
            className="bg-zinc-900 border-zinc-700 text-white"
          />
        </div>
      </div>

      {/* Row 6: Checkboxes */}
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.essential}
            onChange={(e) => onChange("essential", e.target.checked)}
            className="w-4 h-4 accent-emerald-500"
          />
          <span className="text-sm text-zinc-300">Essential</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.auto_renew}
            onChange={(e) => onChange("auto_renew", e.target.checked)}
            className="w-4 h-4 accent-emerald-500"
          />
          <span className="text-sm text-zinc-300">Auto Renew</span>
        </label>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 pt-1">
        <Button
          onClick={onSubmit}
          disabled={isPending || !form.name.trim() || !form.amount}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6"
        >
          <Plus className="w-4 h-4 mr-2" />
          {isEditing ? "Update Bill" : "Add Bill"}
        </Button>
        {isEditing && onCancel && (
          <Button
            variant="outline"
            onClick={onCancel}
            className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── DaysUntilBadge component (module level) ──────────────────────────────────

function DaysUntilBadge({ days }: { days: number | null }) {
  if (days === null)
    return <span className="text-zinc-500 text-xs">—</span>;

  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-700 text-zinc-300">
        Overdue
      </span>
    );
  }
  if (days <= 3) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-900/60 text-red-300 border border-red-700/40">
        {days}d
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-900/50 text-amber-300 border border-amber-700/40">
        {days}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-900/40 text-emerald-300 border border-emerald-700/30">
      {days}d
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabFilter = "30" | "60" | "90" | "all";

export default function RecurringBillsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { privacyMode } = useAppStore();

  const [form, setForm] = useState<BillFormState>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [tabFilter, setTabFilter] = useState<TabFilter>("30");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // ─── Data fetching ───────────────────────────────────────────────────────

  const { data: bills = [], isLoading } = useQuery<Bill[]>({
    queryKey: ["/api/bills"],
    queryFn: () => apiRequest("GET", "/api/bills").then((r) => r.json()),
  });

  // ─── Mutations ───────────────────────────────────────────────────────────

  const invalidateBills = () => qc.invalidateQueries({ queryKey: ["/api/bills"] });

  function buildPayload(f: BillFormState) {
    const reminderDays =
      f.reminder_days === "custom"
        ? safeNum(f.reminder_custom)
        : safeNum(f.reminder_days);
    return {
      name: f.name.trim(),
      category: f.category,
      amount: safeNum(f.amount),
      frequency: f.frequency,
      next_due_date: f.next_due_date || null,
      start_date: f.start_date || null,
      reminder_days: reminderDays,
      member: f.member,
      essential: f.essential,
      auto_renew: f.auto_renew,
      payment_method: f.payment_method.trim(),
      notes: f.notes.trim(),
    };
  }

  const addMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof buildPayload>) =>
      apiRequest("POST", "/api/bills", payload).then((r) => r.json()),
    onSuccess: () => {
      invalidateBills();
      setForm(DEFAULT_FORM);
      toast({ title: "Saved Successfully", description: "Bill added." });
    },
    onError: () =>
      toast({ title: "Error", description: "Failed to add bill.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ReturnType<typeof buildPayload> }) =>
      apiRequest("PUT", `/api/bills/${id}`, payload).then((r) => r.json()),
    onSuccess: () => {
      invalidateBills();
      setForm(DEFAULT_FORM);
      setEditingId(null);
      toast({ title: "Saved Successfully", description: "Bill updated." });
    },
    onError: () =>
      toast({ title: "Error", description: "Failed to update bill.", variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiRequest("PUT", `/api/bills/${id}`, { active }).then((r) => r.json()),
    onSuccess: () => invalidateBills(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/bills/${id}`).then((r) => r.json()),
    onSuccess: () => {
      invalidateBills();
      setDeleteConfirm(null);
      toast({ title: "Saved Successfully", description: "Bill deleted." });
    },
    onError: () =>
      toast({ title: "Error", description: "Failed to delete bill.", variant: "destructive" }),
  });

  // ─── Form handlers ───────────────────────────────────────────────────────

  function handleFormChange(field: keyof BillFormState, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit() {
    const payload = buildPayload(form);
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      addMutation.mutate(payload);
    }
  }

  function handleEdit(bill: Bill) {
    setEditingId(bill.id);
    setForm({
      name: bill.name,
      category: bill.category,
      amount: String(bill.amount),
      frequency: bill.frequency,
      next_due_date: bill.next_due_date ?? "",
      start_date: bill.start_date ?? "",
      reminder_days: REMINDER_OPTIONS.slice(0, -1).includes(String(bill.reminder_days))
        ? String(bill.reminder_days)
        : "custom",
      reminder_custom: REMINDER_OPTIONS.slice(0, -1).includes(String(bill.reminder_days))
        ? ""
        : String(bill.reminder_days),
      member: bill.member,
      essential: bill.essential,
      auto_renew: bill.auto_renew,
      payment_method: bill.payment_method ?? "",
      notes: bill.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
  }

  // ─── KPI calculations ────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in7 = new Date(today);
    in7.setDate(today.getDate() + 7);

    let totalMonthly = 0;
    let totalAnnual = 0;
    let dueThisWeek = 0;
    let overdue = 0;

    for (const b of bills) {
      const monthly = toMonthly(safeNum(b.amount), b.frequency);
      totalMonthly += monthly;
      totalAnnual += monthly * 12;

      if (b.next_due_date) {
        const due = new Date(b.next_due_date);
        due.setHours(0, 0, 0, 0);
        if (due < today) overdue++;
        else if (due <= in7) dueThisWeek++;
      }
    }

    return { totalMonthly, totalAnnual, dueThisWeek, overdue };
  }, [bills]);

  // ─── Tab filter ──────────────────────────────────────────────────────────

  const filteredBills = useMemo(() => {
    if (tabFilter === "all") return bills;
    const days = parseInt(tabFilter);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const limit = new Date(today);
    limit.setDate(today.getDate() + days);

    return bills.filter((b) => {
      if (!b.next_due_date) return false;
      const due = new Date(b.next_due_date);
      due.setHours(0, 0, 0, 0);
      return due <= limit;
    });
  }, [bills, tabFilter]);

  // ─── Category breakdown ──────────────────────────────────────────────────

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of bills) {
      const m = toMonthly(safeNum(b.amount), b.frequency);
      map[b.category] = (map[b.category] ?? 0) + m;
    }
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, monthly]) => ({
        category: cat,
        monthly,
        pct: total > 0 ? (monthly / total) * 100 : 0,
      }));
  }, [bills]);

  // ─── Mask helper ─────────────────────────────────────────────────────────

  const mask = (v: number) =>
    privacyMode ? "$••••••" : formatCurrency(v);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8 sm:px-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <CreditCard className="w-7 h-7 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">
              Recurring Bills &amp; Obligations
            </h1>
            <p className="text-zinc-400 mt-1 text-sm">
              Track your fixed commitments — mortgage, insurance, utilities, subscriptions
            </p>
          </div>
        </div>

        {/* ── SECTION 1: Add / Edit Bill Form ─────────────────────────────── */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-5">
            {editingId !== null ? (
              <>
                <Pencil className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-semibold text-white">Edit Bill</h2>
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-700/30">
                  Editing #{editingId}
                </span>
              </>
            ) : (
              <>
                <Plus className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-semibold text-white">Add New Bill</h2>
              </>
            )}
          </div>

          <BillForm
            form={form}
            onChange={handleFormChange}
            onSubmit={handleSubmit}
            onCancel={handleCancelEdit}
            isEditing={editingId !== null}
            isPending={addMutation.isPending || updateMutation.isPending}
          />
        </div>

        {/* ── SECTION 2: KPI Summary Cards ────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Monthly */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide">
                Monthly Fixed
              </span>
            </div>
            <div className="text-2xl font-bold text-white tabular-nums">
              {mask(kpis.totalMonthly)}
            </div>
            <div className="text-xs text-zinc-500 mt-1">Total recurring / month</div>
          </div>

          {/* Due This Week */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide">
                Due This Week
              </span>
            </div>
            <div className="text-2xl font-bold text-white tabular-nums">
              {kpis.dueThisWeek}
            </div>
            <div className="text-xs text-zinc-500 mt-1">Bills due within 7 days</div>
          </div>

          {/* Annual Commitment */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-4 h-4 text-sky-400" />
              <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide">
                Annual Total
              </span>
            </div>
            <div className="text-2xl font-bold text-white tabular-nums">
              {mask(kpis.totalAnnual)}
            </div>
            <div className="text-xs text-zinc-500 mt-1">Total annual commitment</div>
          </div>

          {/* Overdue */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide">
                Overdue
              </span>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${kpis.overdue > 0 ? "text-red-400" : "text-white"}`}>
              {kpis.overdue}
            </div>
            <div className="text-xs text-zinc-500 mt-1">Bills past due date</div>
          </div>
        </div>

        {/* ── SECTION 3: Upcoming Bills Table ─────────────────────────────── */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur shadow-xl overflow-hidden">
          {/* Tab filter */}
          <div className="flex items-center gap-0 border-b border-zinc-800 px-2 pt-4 pb-0">
            <div className="flex gap-1 px-2 pb-3">
              {(
                [
                  { key: "30", label: "Next 30 days" },
                  { key: "60", label: "Next 60 days" },
                  { key: "90", label: "Next 90 days" },
                  { key: "all", label: "All Bills" },
                ] as { key: TabFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setTabFilter(tab.key)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    tabFilter === tab.key
                      ? "bg-emerald-600 text-white"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="ml-auto pr-4 pb-3 text-xs text-zinc-500">
              {filteredBills.length} bill{filteredBills.length !== 1 ? "s" : ""}
            </div>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-zinc-500 text-sm">Loading bills…</div>
          ) : filteredBills.length === 0 ? (
            <div className="p-12 text-center text-zinc-500 text-sm">
              No bills match this filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/80">
                    <th className="text-left px-4 py-3 text-xs text-zinc-400 font-semibold uppercase tracking-wide">
                      Bill Name
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-400 font-semibold uppercase tracking-wide">
                      Category
                    </th>
                    <th className="text-right px-4 py-3 text-xs text-zinc-400 font-semibold uppercase tracking-wide">
                      Amount
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-400 font-semibold uppercase tracking-wide">
                      Frequency
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-400 font-semibold uppercase tracking-wide">
                      Next Due
                    </th>
                    <th className="text-center px-4 py-3 text-xs text-zinc-400 font-semibold uppercase tracking-wide">
                      Days Until
                    </th>
                    <th className="text-left px-4 py-3 text-xs text-zinc-400 font-semibold uppercase tracking-wide">
                      Member
                    </th>
                    <th className="text-center px-4 py-3 text-xs text-zinc-400 font-semibold uppercase tracking-wide">
                      Essential
                    </th>
                    <th className="text-center px-4 py-3 text-xs text-zinc-400 font-semibold uppercase tracking-wide">
                      Reminder
                    </th>
                    <th className="text-center px-4 py-3 text-xs text-zinc-400 font-semibold uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredBills.map((bill) => {
                    const days = daysUntil(bill.next_due_date);
                    return (
                      <tr
                        key={bill.id}
                        className={`transition-colors hover:bg-zinc-800/40 ${
                          !bill.active ? "opacity-50" : ""
                        }`}
                      >
                        <td className="px-4 py-3 font-medium text-white">
                          {bill.name}
                          {bill.auto_renew && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">
                              Auto
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-300">{bill.category}</td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-300 tabular-nums">
                          {mask(safeNum(bill.amount))}
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{bill.frequency}</td>
                        <td className="px-4 py-3 text-zinc-300">
                          {bill.next_due_date
                            ? new Date(bill.next_due_date).toLocaleDateString("en-AU", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <DaysUntilBadge days={days} />
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{bill.member}</td>
                        <td className="px-4 py-3 text-center">
                          {bill.essential ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" />
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-zinc-400 text-xs">
                          {bill.reminder_days ? `${bill.reminder_days}d` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {/* Edit */}
                            <button
                              onClick={() => handleEdit(bill)}
                              className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            {/* Toggle active */}
                            <button
                              onClick={() =>
                                toggleActiveMutation.mutate({
                                  id: bill.id,
                                  active: !bill.active,
                                })
                              }
                              className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                              title={bill.active ? "Deactivate" : "Activate"}
                            >
                              {bill.active ? (
                                <Eye className="w-3.5 h-3.5" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5 text-zinc-600" />
                              )}
                            </button>

                            {/* Delete */}
                            {deleteConfirm === bill.id ? (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => deleteMutation.mutate(bill.id)}
                                  className="px-2 py-0.5 rounded bg-red-700 hover:bg-red-600 text-white text-xs"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  className="px-2 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirm(bill.id)}
                                className="p-1.5 rounded hover:bg-red-900/50 text-zinc-400 hover:text-red-400 transition-colors"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── SECTION 4: Monthly Cost Breakdown by Category ────────────────── */}
        {categoryBreakdown.length > 0 && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-sky-400" />
              Monthly Fixed Costs by Category
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-3 py-2 text-xs text-zinc-400 font-semibold uppercase tracking-wide">
                      Category
                    </th>
                    <th className="text-right px-3 py-2 text-xs text-zinc-400 font-semibold uppercase tracking-wide">
                      Monthly Equiv.
                    </th>
                    <th className="text-right px-3 py-2 text-xs text-zinc-400 font-semibold uppercase tracking-wide">
                      % of Total
                    </th>
                    <th className="px-3 py-2 w-40"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {categoryBreakdown.map(({ category, monthly, pct }) => (
                    <tr key={category} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="px-3 py-2.5 text-zinc-200 font-medium">{category}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-300 font-semibold tabular-nums">
                        {mask(monthly)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-zinc-400 tabular-nums">
                        {pct.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500/70"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-zinc-700">
                    <td className="px-3 py-2.5 text-zinc-300 font-semibold">Total</td>
                    <td className="px-3 py-2.5 text-right text-white font-bold tabular-nums">
                      {mask(kpis.totalMonthly)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-zinc-400">100%</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

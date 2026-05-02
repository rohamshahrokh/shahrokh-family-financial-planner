/**
 * recurring-bills.tsx — Recurring Bills & Obligations (v3)
 * Route: /recurring-bills
 *
 * v3 changes:
 *  - Bill occurrence tracking (each cycle is its own row in sf_bill_occurrences)
 *  - Payment status: upcoming / due_soon / due_today / paid / overdue / skipped
 *  - Per-bill reminder config: before X days, remind on due date, overdue policy
 *  - Auto expense matching (amount ±%, date window, name similarity)
 *  - Manual controls: Mark Paid / Unpaid / Skip / Edit next due date
 *  - Notification log tab
 *  - Daily digest preview
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAppStore } from "@/lib/store";
import { formatCurrency } from "@/lib/finance";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
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
  Bell,
  BellOff,
  CheckCheck,
  RotateCcw,
  SkipForward,
  Zap,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Send,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL  = "https://uoraduyyxhtzixcsaidg.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c";
const SB_HEADERS = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const CATEGORIES = ["Housing","Insurance","Utilities","Childcare","Subscriptions","Transport","Health","Finance","Other"];
const FREQUENCIES = ["Weekly","Fortnightly","Monthly","Quarterly","Annual"];
const MEMBERS     = ["Family","Roham","Fara","Kids"];
const REMINDER_OPTIONS = ["1","3","7","14","custom"];
const OVERDUE_OPTIONS  = ["off","once","daily"];

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentStatus = "upcoming" | "due_soon" | "due_today" | "paid" | "overdue" | "skipped";
export type OverduePolicy = "off" | "once" | "daily";

export interface Bill {
  id: number;
  bill_name: string;
  category: string;
  amount: number;
  frequency: string;
  next_due_date: string | null;
  start_date: string | null;
  reminder_days_before: number;
  remind_on_due_date: boolean;
  overdue_reminder: OverduePolicy;
  priority: string;
  merchant_keywords: string | null;
  match_tolerance_pct: number;
  member: string;
  essential: boolean;
  auto_renew: boolean;
  payment_method: string;
  notes: string;
  active: boolean;
}

export interface BillOccurrence {
  id: number;
  bill_id: number;
  bill_name: string;
  due_date: string;
  amount: number;
  payment_status: PaymentStatus;
  paid_at: string | null;
  matched_expense_id: number | null;
  reminder_before_sent_at: string | null;
  due_today_sent_at: string | null;
  overdue_sent_at: string | null;
  digest_included_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillNotifLog {
  id: number;
  occurrence_id: number | null;
  bill_id: number | null;
  bill_name: string;
  due_date: string | null;
  stage: string;
  channel: string;
  sent_at: string;
  status: string;
  message_text: string | null;
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
  remind_on_due_date: boolean;
  overdue_reminder: OverduePolicy;
  priority: string;
  merchant_keywords: string;
  match_tolerance_pct: string;
  member: string;
  essential: boolean;
  auto_renew: boolean;
  payment_method: string;
  notes: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const safeNum = (v: any) => parseFloat(v) || 0;

function toMonthly(amount: number, frequency: string): number {
  switch (frequency) {
    case "Weekly":      return amount * (52 / 12);
    case "Fortnightly": return amount * (26 / 12);
    case "Monthly":     return amount;
    case "Quarterly":   return amount / 3;
    case "Annual":      return amount / 12;
    default:            return amount;
  }
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(dateStr); due.setHours(0,0,0,0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function advanceDueDate(dateStr: string, frequency: string): string {
  const d = new Date(dateStr);
  switch (frequency) {
    case "Weekly":      d.setDate(d.getDate() + 7); break;
    case "Fortnightly": d.setDate(d.getDate() + 14); break;
    case "Monthly":     d.setMonth(d.getMonth() + 1); break;
    case "Quarterly":   d.setMonth(d.getMonth() + 3); break;
    case "Annual":      d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().split("T")[0];
}

/** Derive PaymentStatus from days until due */
function deriveStatus(days: number | null, paid: boolean, skipped: boolean): PaymentStatus {
  if (paid)    return "paid";
  if (skipped) return "skipped";
  if (days === null) return "upcoming";
  if (days < 0)  return "overdue";
  if (days === 0) return "due_today";
  if (days <= 3)  return "due_soon";
  return "upcoming";
}

/** Fuzzy name matching score 0-1 */
function nameSimilarity(a: string, b: string): number {
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const tokensA = new Set(clean(a).split(/\s+/));
  const tokensB = new Set(clean(b).split(/\s+/));
  let matches = 0;
  tokensA.forEach(t => { if (tokensB.has(t)) matches++; });
  return matches / Math.max(tokensA.size, tokensB.size, 1);
}

/** Returns a match score 0-100 for an expense vs a bill */
function matchScore(
  bill: Bill,
  exp: { description?: string; category?: string; amount: number; date: string }
): number {
  const tolerance = (bill.match_tolerance_pct ?? 5) / 100;
  const billAmount = safeNum(bill.amount);
  const expAmount  = safeNum(exp.amount);

  // Amount: must be within tolerance
  if (Math.abs(expAmount - billAmount) / Math.max(billAmount, 1) > tolerance) return 0;

  // Date: within ±5 days of next_due_date
  const due = bill.next_due_date ? daysUntil(bill.next_due_date) : null;
  const expDays = daysUntil(exp.date);
  if (due !== null && expDays !== null && Math.abs(due - expDays) > 5) return 0;

  // Name similarity
  const keywords = [bill.bill_name, ...(bill.merchant_keywords?.split(",").map(k => k.trim()) ?? [])];
  const expDesc  = exp.description ?? "";
  let nameScore  = 0;
  for (const kw of keywords) {
    nameScore = Math.max(nameScore, nameSimilarity(kw, expDesc));
  }

  // Category similarity
  const catScore = (exp.category?.toLowerCase() === bill.category?.toLowerCase()) ? 0.3 : 0;

  return Math.round((nameScore * 0.6 + catScore + 0.1) * 100);
}

// ─── Supabase direct calls ────────────────────────────────────────────────────

async function sbGetOccurrences(billId?: number): Promise<BillOccurrence[]> {
  const filter = billId ? `bill_id=eq.${billId}&` : "";
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sf_bill_occurrences?${filter}order=due_date.desc&limit=200`,
    { headers: SB_HEADERS }
  );
  if (!res.ok) return [];
  return res.json();
}

async function sbUpsertOccurrence(data: Partial<BillOccurrence> & { bill_id: number; due_date: string }): Promise<BillOccurrence | null> {
  const payload = { ...data, updated_at: new Date().toISOString() };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/sf_bill_occurrences`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function sbUpdateOccurrence(id: number, data: Partial<BillOccurrence>): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/sf_bill_occurrences?id=eq.${id}`, {
    method: "PATCH",
    headers: SB_HEADERS,
    body: JSON.stringify({ ...data, updated_at: new Date().toISOString() }),
  });
}

async function sbGetNotifLog(limit = 60): Promise<BillNotifLog[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sf_bill_notification_log?order=sent_at.desc&limit=${limit}`,
    { headers: SB_HEADERS }
  );
  if (!res.ok) return [];
  return res.json();
}

async function sbGetDailyDigestLog(limit = 14): Promise<{ id: number; digest_date: string; sent_at: string; status: string }[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sf_daily_digest_log?order=digest_date.desc&limit=${limit}`,
    { headers: SB_HEADERS }
  );
  if (!res.ok) return [];
  return res.json();
}

/** Get expenses from last 30 days for matching */
async function sbGetRecentExpenses(): Promise<any[]> {
  const since = new Date(); since.setDate(since.getDate() - 30);
  const sinceStr = since.toISOString().split("T")[0];
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sf_expenses?date=gte.${sinceStr}&order=date.desc&limit=200`,
    { headers: SB_HEADERS }
  );
  if (!res.ok) return [];
  return res.json();
}

// ─── Default form ─────────────────────────────────────────────────────────────

const DEFAULT_FORM: BillFormState = {
  name: "",
  category: "Housing",
  amount: "",
  frequency: "Monthly",
  next_due_date: "",
  start_date: "",
  reminder_days: "7",
  reminder_custom: "",
  remind_on_due_date: false,
  overdue_reminder: "off",
  priority: "normal",
  merchant_keywords: "",
  match_tolerance_pct: "5",
  member: "Family",
  essential: false,
  auto_renew: false,
  payment_method: "",
  notes: "",
};

// ─── Status badge component ───────────────────────────────────────────────────

function StatusBadge({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, { label: string; className: string }> = {
    upcoming:  { label: "Upcoming",  className: "bg-zinc-800 text-zinc-300 border-zinc-700" },
    due_soon:  { label: "Due Soon",  className: "bg-amber-900/60 text-amber-300 border-amber-700/40" },
    due_today: { label: "Due Today", className: "bg-orange-900/60 text-orange-300 border-orange-700/40" },
    paid:      { label: "Paid",      className: "bg-emerald-900/60 text-emerald-300 border-emerald-700/40" },
    overdue:   { label: "Overdue",   className: "bg-red-900/60 text-red-300 border-red-700/40" },
    skipped:   { label: "Skipped",   className: "bg-zinc-700/60 text-zinc-400 border-zinc-600/40" },
  };
  const { label, className } = map[status] ?? map.upcoming;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${className}`}>
      {label}
    </span>
  );
}

// ─── Bill form component ──────────────────────────────────────────────────────

interface BillFormProps {
  form: BillFormState;
  onChange: (field: keyof BillFormState, value: string | boolean) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  isEditing: boolean;
  isPending: boolean;
}

function BillForm({ form, onChange, onSubmit, onCancel, isEditing, isPending }: BillFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  return (
    <div className="space-y-5">
      {/* Row 1: Name + Category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Bill Name *</label>
          <Input value={form.name} onChange={e => onChange("name", e.target.value)}
            placeholder="e.g. Bupa Private, Netflix, AGL Power"
            className="bg-input border-border text-foreground" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Category</label>
          <Select value={form.category} onValueChange={v => onChange("category", v)}>
            <SelectTrigger className="bg-input border-border text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2: Amount + Frequency */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Amount ($)</label>
          <Input type="number" min="0" step="0.01" value={form.amount}
            onChange={e => onChange("amount", e.target.value)}
            placeholder="0.00" className="bg-input border-border text-foreground" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Frequency</label>
          <Select value={form.frequency} onValueChange={v => onChange("frequency", v)}>
            <SelectTrigger className="bg-input border-border text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>{FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 3: Due Date + Start Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Next Due Date</label>
          <Input type="date" value={form.next_due_date}
            onChange={e => onChange("next_due_date", e.target.value)}
            className="bg-input border-border text-foreground" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Start Date</label>
          <Input type="date" value={form.start_date}
            onChange={e => onChange("start_date", e.target.value)}
            className="bg-input border-border text-foreground" />
        </div>
      </div>

      {/* Row 4: Reminder config */}
      <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/40 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Bell className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold text-zinc-200">Reminder Settings</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Before due */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Remind before due date</label>
            <div className="flex gap-2">
              <Select value={form.reminder_days} onValueChange={v => onChange("reminder_days", v)}>
                <SelectTrigger className="bg-input border-border text-foreground flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REMINDER_OPTIONS.map(r => (
                    <SelectItem key={r} value={r}>
                      {r === "custom" ? "Custom…" : `${r} day${r === "1" ? "" : "s"}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.reminder_days === "custom" && (
                <Input type="number" min="1" value={form.reminder_custom}
                  onChange={e => onChange("reminder_custom", e.target.value)}
                  placeholder="Days" className="bg-input border-border text-foreground w-20" />
              )}
            </div>
          </div>

          {/* Remind on due date */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Remind on due date</label>
            <div className="flex items-center gap-3 mt-2">
              <Switch
                checked={form.remind_on_due_date}
                onCheckedChange={v => onChange("remind_on_due_date", v)}
              />
              <span className="text-sm text-zinc-300">{form.remind_on_due_date ? "Yes" : "No"}</span>
            </div>
          </div>

          {/* Overdue reminder */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Overdue reminder</label>
            <Select value={form.overdue_reminder} onValueChange={v => onChange("overdue_reminder", v as OverduePolicy)}>
              <SelectTrigger className="bg-input border-border text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off (default)</SelectItem>
                <SelectItem value="once">Once only</SelectItem>
                <SelectItem value="daily">Daily until paid</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <p className="text-xs text-zinc-500 mt-1">
          Before-due reminder fires once per cycle, only for upcoming/due-soon bills. Paid bills are never reminded.
        </p>
      </div>

      {/* Row 5: Member + Priority */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Member</label>
          <Select value={form.member} onValueChange={v => onChange("member", v)}>
            <SelectTrigger className="bg-input border-border text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>{MEMBERS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Priority</label>
          <Select value={form.priority} onValueChange={v => onChange("priority", v)}>
            <SelectTrigger className="bg-input border-border text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High (urgent individual alerts)</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Advanced (merchant matching) */}
      <button
        type="button"
        onClick={() => setShowAdvanced(p => !p)}
        className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        {showAdvanced ? "Hide" : "Show"} auto-matching settings
      </button>

      {showAdvanced && (
        <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/40 p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-sky-400" />
            <span className="text-sm font-semibold text-zinc-200">Auto Payment Matching</span>
            <span className="text-xs text-zinc-500 ml-1">— matches imported expenses to auto-mark as paid</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Merchant keywords (comma-separated)
              </label>
              <Input value={form.merchant_keywords}
                onChange={e => onChange("merchant_keywords", e.target.value)}
                placeholder="e.g. Bupa, bupa health, HBF"
                className="bg-input border-border text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Amount tolerance (%)
              </label>
              <Input type="number" min="0" max="20" value={form.match_tolerance_pct}
                onChange={e => onChange("match_tolerance_pct", e.target.value)}
                placeholder="5" className="bg-input border-border text-foreground" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Payment Method</label>
              <Input value={form.payment_method}
                onChange={e => onChange("payment_method", e.target.value)}
                placeholder="e.g. Direct Debit, Credit Card"
                className="bg-input border-border text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
              <Input value={form.notes}
                onChange={e => onChange("notes", e.target.value)}
                placeholder="Optional notes"
                className="bg-input border-border text-foreground" />
            </div>
          </div>
        </div>
      )}

      {/* Checkboxes */}
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={form.essential}
            onChange={e => onChange("essential", e.target.checked)}
            className="w-4 h-4 accent-emerald-500" />
          <span className="text-sm text-zinc-300">Essential</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={form.auto_renew}
            onChange={e => onChange("auto_renew", e.target.checked)}
            className="w-4 h-4 accent-emerald-500" />
          <span className="text-sm text-zinc-300">Auto Renew</span>
        </label>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <Button onClick={onSubmit}
          disabled={isPending || !form.name.trim() || !form.amount}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-6">
          <Plus className="w-4 h-4 mr-2" />
          {isPending ? "Saving…" : isEditing ? "Update Bill" : "Add Bill"}
        </Button>
        {isEditing && onCancel && (
          <Button variant="outline" onClick={onCancel}
            className="border-zinc-600 text-zinc-300 hover:bg-zinc-800">
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Occurrence actions row ───────────────────────────────────────────────────

interface OccurrenceActionsProps {
  occ: BillOccurrence;
  bill: Bill;
  onMarkPaid: (occ: BillOccurrence) => void;
  onMarkUnpaid: (occ: BillOccurrence) => void;
  onSkip: (occ: BillOccurrence) => void;
  onEditDueDate: (occ: BillOccurrence) => void;
}

function OccurrenceActions({ occ, bill, onMarkPaid, onMarkUnpaid, onSkip, onEditDueDate }: OccurrenceActionsProps) {
  const isPaid    = occ.payment_status === "paid";
  const isSkipped = occ.payment_status === "skipped";

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {!isPaid && !isSkipped && (
        <button onClick={() => onMarkPaid(occ)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-emerald-900/40 text-emerald-300 border border-emerald-700/40 hover:bg-emerald-700/40 transition-colors"
          title="Mark as Paid">
          <CheckCheck className="w-3 h-3" /> Paid
        </button>
      )}
      {isPaid && (
        <button onClick={() => onMarkUnpaid(occ)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700 transition-colors"
          title="Mark as Unpaid">
          <RotateCcw className="w-3 h-3" /> Unpaid
        </button>
      )}
      {!isPaid && !isSkipped && (
        <button onClick={() => onSkip(occ)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700 transition-colors"
          title="Skip this cycle">
          <SkipForward className="w-3 h-3" /> Skip
        </button>
      )}
      <button onClick={() => onEditDueDate(occ)}
        className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700 transition-colors"
        title="Edit due date">
        <Calendar className="w-3 h-3" /> Date
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type PageTab = "bills" | "occurrences" | "log" | "digest";
type TabFilter = "30" | "60" | "90" | "all";

export default function RecurringBillsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { privacyMode } = useAppStore();

  const [form, setForm] = useState<BillFormState>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pageTab, setPageTab] = useState<PageTab>("bills");
  const [tabFilter, setTabFilter] = useState<TabFilter>("all");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [editDueDateOcc, setEditDueDateOcc] = useState<BillOccurrence | null>(null);
  const [editDueDateVal, setEditDueDateVal] = useState("");
  const [matchingBillId, setMatchingBillId] = useState<number | null>(null);
  const [digestPreview, setDigestPreview] = useState<string>("");
  const [digestSending, setDigestSending] = useState(false);

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: bills = [], isLoading: billsLoading } = useQuery<Bill[]>({
    queryKey: ["/api/bills"],
    queryFn: () => apiRequest("GET", "/api/bills").then(r => r.json()),
  });

  const { data: occurrences = [], isLoading: occsLoading, refetch: refetchOccs } = useQuery<BillOccurrence[]>({
    queryKey: ["sf_bill_occurrences"],
    queryFn: () => sbGetOccurrences(),
    staleTime: 30000,
  });

  const { data: notifLog = [], isLoading: logLoading } = useQuery<BillNotifLog[]>({
    queryKey: ["sf_bill_notif_log"],
    queryFn: () => sbGetNotifLog(80),
    enabled: pageTab === "log",
  });

  const { data: digestLog = [], isLoading: digestLogLoading } = useQuery<any[]>({
    queryKey: ["sf_daily_digest_log"],
    queryFn: () => sbGetDailyDigestLog(14),
    enabled: pageTab === "digest",
  });

  const { data: recentExpenses = [] } = useQuery<any[]>({
    queryKey: ["sf_recent_expenses_for_matching"],
    queryFn: () => sbGetRecentExpenses(),
    staleTime: 60000,
  });

  // ─── Mutations ────────────────────────────────────────────────────────────

  const invalidateBills = () => qc.invalidateQueries({ queryKey: ["/api/bills"] });
  const invalidateOccs  = () => qc.invalidateQueries({ queryKey: ["sf_bill_occurrences"] });

  function buildPayload(f: BillFormState) {
    const reminderDays = f.reminder_days === "custom"
      ? safeNum(f.reminder_custom) : safeNum(f.reminder_days);
    return {
      bill_name:            f.name.trim(),
      category:             f.category,
      amount:               safeNum(f.amount),
      frequency:            f.frequency,
      next_due_date:        f.next_due_date || null,
      start_date:           f.start_date || null,
      reminder_days_before: reminderDays,
      remind_on_due_date:   f.remind_on_due_date,
      overdue_reminder:     f.overdue_reminder,
      priority:             f.priority,
      merchant_keywords:    f.merchant_keywords.trim() || null,
      match_tolerance_pct:  safeNum(f.match_tolerance_pct) || 5,
      member:               f.member,
      essential:            f.essential,
      auto_renew:           f.auto_renew,
      payment_method:       f.payment_method.trim(),
      notes:                f.notes.trim(),
      active:               true,
    };
  }

  const addMutation = useMutation({
    mutationFn: (payload: ReturnType<typeof buildPayload>) =>
      apiRequest("POST", "/api/bills", payload).then(r => r.json()),
    onSuccess: async (newBill: Bill) => {
      invalidateBills();
      setForm(DEFAULT_FORM);
      // Auto-generate first occurrence
      if (newBill?.id && newBill.next_due_date) {
        await sbUpsertOccurrence({
          bill_id:        newBill.id,
          bill_name:      newBill.bill_name,
          due_date:       newBill.next_due_date,
          amount:         newBill.amount,
          payment_status: "upcoming",
        });
        invalidateOccs();
      }
      toast({ title: "Saved Successfully", description: "Bill added and first occurrence created." });
    },
    onError: (err: any) =>
      toast({ title: "Error saving bill", description: err?.message ?? "Unknown error", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ReturnType<typeof buildPayload> }) =>
      apiRequest("PUT", `/api/bills/${id}`, payload).then(r => r.json()),
    onSuccess: () => {
      invalidateBills();
      invalidateOccs();
      setForm(DEFAULT_FORM);
      setEditingId(null);
      toast({ title: "Saved Successfully", description: "Bill updated." });
    },
    onError: (err: any) =>
      toast({ title: "Error updating bill", description: err?.message ?? "Unknown error", variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiRequest("PUT", `/api/bills/${id}`, { active }).then(r => r.json()),
    onSuccess: () => invalidateBills(),
    onError: (err: any) =>
      toast({ title: "Error", description: err?.message ?? "Failed to toggle.", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/bills/${id}`).then(r => r.json().catch(() => null)),
    onSuccess: () => {
      invalidateBills();
      invalidateOccs();
      setDeleteConfirm(null);
      toast({ title: "Saved Successfully", description: "Bill deleted." });
    },
    onError: (err: any) =>
      toast({ title: "Error deleting bill", description: err?.message ?? "Unknown error", variant: "destructive" }),
  });

  // ─── Occurrence actions ───────────────────────────────────────────────────

  const handleMarkPaid = useCallback(async (occ: BillOccurrence) => {
    const now = new Date().toISOString();
    await sbUpdateOccurrence(occ.id, {
      payment_status: "paid",
      paid_at: now,
      reminder_before_sent_at: occ.reminder_before_sent_at,
      due_today_sent_at: occ.due_today_sent_at,
    });
    // Roll forward next due date on master bill
    const bill = bills.find(b => b.id === occ.bill_id);
    if (bill && bill.frequency !== "Annual" || bill) {
      const nextDue = advanceDueDate(occ.due_date, bill?.frequency ?? "Monthly");
      await apiRequest("PUT", `/api/bills/${occ.bill_id}`, { next_due_date: nextDue });
      // Create next occurrence
      await sbUpsertOccurrence({
        bill_id:        occ.bill_id,
        bill_name:      occ.bill_name,
        due_date:       nextDue,
        amount:         occ.amount,
        payment_status: "upcoming",
      });
    }
    invalidateBills();
    invalidateOccs();
    toast({ title: "Marked as Paid", description: `${occ.bill_name} — next cycle created.` });
  }, [bills]);

  const handleMarkUnpaid = useCallback(async (occ: BillOccurrence) => {
    await sbUpdateOccurrence(occ.id, { payment_status: "upcoming", paid_at: undefined });
    invalidateOccs();
    toast({ title: "Marked as Unpaid", description: occ.bill_name });
  }, []);

  const handleSkip = useCallback(async (occ: BillOccurrence) => {
    await sbUpdateOccurrence(occ.id, { payment_status: "skipped" });
    // Still roll forward next due date
    const bill = bills.find(b => b.id === occ.bill_id);
    if (bill) {
      const nextDue = advanceDueDate(occ.due_date, bill.frequency);
      await apiRequest("PUT", `/api/bills/${occ.bill_id}`, { next_due_date: nextDue });
      await sbUpsertOccurrence({
        bill_id:        occ.bill_id,
        bill_name:      occ.bill_name,
        due_date:       nextDue,
        amount:         occ.amount,
        payment_status: "upcoming",
      });
    }
    invalidateBills();
    invalidateOccs();
    toast({ title: "Cycle Skipped", description: `${occ.bill_name} — next cycle created.` });
  }, [bills]);

  const handleEditDueDateSave = useCallback(async () => {
    if (!editDueDateOcc || !editDueDateVal) return;
    await sbUpdateOccurrence(editDueDateOcc.id, { due_date: editDueDateVal } as any);
    await apiRequest("PUT", `/api/bills/${editDueDateOcc.bill_id}`, { next_due_date: editDueDateVal });
    invalidateBills();
    invalidateOccs();
    setEditDueDateOcc(null);
    toast({ title: "Due date updated.", description: editDueDateOcc.bill_name });
  }, [editDueDateOcc, editDueDateVal]);

  // ─── Auto-match expenses → bills ─────────────────────────────────────────

  const handleAutoMatch = useCallback(async () => {
    if (!recentExpenses.length || !bills.length) {
      toast({ title: "No data to match", description: "Import expenses first." });
      return;
    }
    let matched = 0;
    for (const bill of bills) {
      if (!bill.active) continue;
      // Find the current unpaid occurrence for this bill
      const occ = occurrences.find(o =>
        o.bill_id === bill.id &&
        o.payment_status !== "paid" &&
        o.payment_status !== "skipped"
      );
      if (!occ) continue;

      let bestScore = 0;
      let bestExp: any = null;
      for (const exp of recentExpenses) {
        const s = matchScore(bill, { description: exp.description ?? exp.merchant ?? exp.bill_name, category: exp.category, amount: safeNum(exp.amount), date: exp.date });
        if (s > bestScore) { bestScore = s; bestExp = exp; }
      }
      if (bestScore >= 60 && bestExp) {
        const now = new Date().toISOString();
        await sbUpdateOccurrence(occ.id, {
          payment_status:     "paid",
          paid_at:            now,
          matched_expense_id: bestExp.id,
        });
        // Roll forward
        const nextDue = advanceDueDate(occ.due_date, bill.frequency);
        await apiRequest("PUT", `/api/bills/${bill.id}`, { next_due_date: nextDue });
        await sbUpsertOccurrence({
          bill_id:        bill.id,
          bill_name:      bill.bill_name,
          due_date:       nextDue,
          amount:         bill.amount,
          payment_status: "upcoming",
        });
        matched++;
      }
    }
    invalidateBills();
    invalidateOccs();
    toast({ title: `Auto-match complete`, description: `${matched} bill${matched !== 1 ? "s" : ""} matched and marked as paid.` });
  }, [bills, occurrences, recentExpenses]);

  // ─── Ensure occurrences exist for active bills ────────────────────────────

  const handleSyncOccurrences = useCallback(async () => {
    let created = 0;
    for (const bill of bills) {
      if (!bill.active || !bill.next_due_date) continue;
      const existing = occurrences.find(o =>
        o.bill_id === bill.id &&
        o.due_date === bill.next_due_date &&
        o.payment_status !== "paid" &&
        o.payment_status !== "skipped"
      );
      if (!existing) {
        await sbUpsertOccurrence({
          bill_id:        bill.id,
          bill_name:      bill.bill_name,
          due_date:       bill.next_due_date,
          amount:         bill.amount,
          payment_status: "upcoming",
        });
        created++;
      }
    }
    invalidateOccs();
    toast({ title: "Occurrences synced", description: `${created} new occurrence${created !== 1 ? "s" : ""} created.` });
  }, [bills, occurrences]);

  // ─── Daily digest preview + send ─────────────────────────────────────────

  const handleBuildDigest = useCallback(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const in7 = new Date(today); in7.setDate(today.getDate() + 7);

    const activeOccs = occurrences
      .filter(o => ["upcoming","due_soon","due_today","overdue"].includes(o.payment_status))
      .filter(o => {
        const d = new Date(o.due_date); d.setHours(0,0,0,0);
        return d >= today && d <= in7;
      })
      .sort((a,b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

    const billLines = activeOccs.map(o => {
      const days = daysUntil(o.due_date);
      const when = days === 0 ? "due today" : days === 1 ? "due tomorrow" : `due in ${days} days`;
      return `• ${o.bill_name} — ${when} — $${safeNum(o.amount).toFixed(0)}`;
    });

    const next7Total = activeOccs.reduce((s,o) => s + safeNum(o.amount), 0);

    const lines = [
      "🏠 <b>Family Wealth Daily Check</b>",
      "",
      "📋 <b>Bills:</b>",
      ...(billLines.length ? billLines : ["  No bills due in next 7 days ✓"]),
      "",
      "💰 <b>Cash:</b>",
      `  • Expected bills next 7 days: $${next7Total.toFixed(0)}`,
    ];

    setDigestPreview(lines.join("\n"));
    setPageTab("digest");
  }, [occurrences]);

  const handleSendDigest = useCallback(async () => {
    if (!digestPreview) return;
    setDigestSending(true);
    try {
      const { sendBillsDigest } = await import("@/lib/notifications");
      await sendBillsDigest(digestPreview, occurrences.filter(o =>
        ["upcoming","due_soon","due_today","overdue"].includes(o.payment_status)
      ));
      qc.invalidateQueries({ queryKey: ["sf_daily_digest_log"] });
      toast({ title: "Daily digest sent", description: "Check Telegram." });
    } catch (e: any) {
      toast({ title: "Failed to send digest", description: e?.message, variant: "destructive" });
    } finally {
      setDigestSending(false);
    }
  }, [digestPreview, occurrences]);

  // ─── Form handlers ────────────────────────────────────────────────────────

  function handleFormChange(field: keyof BillFormState, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }));
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
      name:               bill.bill_name,
      category:           bill.category,
      amount:             String(bill.amount),
      frequency:          bill.frequency,
      next_due_date:      bill.next_due_date ?? "",
      start_date:         bill.start_date ?? "",
      reminder_days:      REMINDER_OPTIONS.slice(0,-1).includes(String(bill.reminder_days_before))
                            ? String(bill.reminder_days_before) : "custom",
      reminder_custom:    REMINDER_OPTIONS.slice(0,-1).includes(String(bill.reminder_days_before))
                            ? "" : String(bill.reminder_days_before),
      remind_on_due_date: bill.remind_on_due_date ?? false,
      overdue_reminder:   (bill.overdue_reminder ?? "off") as OverduePolicy,
      priority:           bill.priority ?? "normal",
      merchant_keywords:  bill.merchant_keywords ?? "",
      match_tolerance_pct: String(bill.match_tolerance_pct ?? 5),
      member:             bill.member,
      essential:          bill.essential,
      auto_renew:         bill.auto_renew,
      payment_method:     bill.payment_method ?? "",
      notes:              bill.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
  }

  // ─── KPIs ─────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const in7   = new Date(today); in7.setDate(today.getDate() + 7);
    let totalMonthly = 0, totalAnnual = 0, dueThisWeek = 0, overdue = 0, paid = 0;

    for (const b of bills) {
      const monthly = toMonthly(safeNum(b.amount), b.frequency);
      totalMonthly += monthly;
      totalAnnual  += monthly * 12;
    }

    for (const o of occurrences) {
      if (o.payment_status === "paid") { paid++; continue; }
      if (o.payment_status === "skipped") continue;
      const due = new Date(o.due_date); due.setHours(0,0,0,0);
      if (due < today) overdue++;
      else if (due <= in7) dueThisWeek++;
    }

    return { totalMonthly, totalAnnual, dueThisWeek, overdue, paid };
  }, [bills, occurrences]);

  // ─── Filter bills ─────────────────────────────────────────────────────────

  const filteredBills = useMemo(() => {
    if (tabFilter === "all") return bills;
    const days = parseInt(tabFilter);
    const today = new Date(); today.setHours(0,0,0,0);
    const limit = new Date(today); limit.setDate(today.getDate() + days);
    return bills.filter(b => {
      if (!b.next_due_date) return false;
      const due = new Date(b.next_due_date); due.setHours(0,0,0,0);
      return due <= limit;
    });
  }, [bills, tabFilter]);

  // ─── Category breakdown ───────────────────────────────────────────────────

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of bills) {
      const m = toMonthly(safeNum(b.amount), b.frequency);
      map[b.category] = (map[b.category] ?? 0) + m;
    }
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return Object.entries(map).sort((a,b) => b[1]-a[1]).map(([category, monthly]) => ({
      category, monthly, pct: total > 0 ? (monthly / total) * 100 : 0,
    }));
  }, [bills]);

  // ─── Mask helper ──────────────────────────────────────────────────────────

  const mask = (v: number) => privacyMode ? "$••••••" : formatCurrency(v);

  // ─── Active occurrences enriched with days-until ──────────────────────────

  const enrichedOccs = useMemo(() =>
    occurrences.map(o => ({
      ...o,
      days: daysUntil(o.due_date),
      bill: bills.find(b => b.id === o.bill_id),
    }))
    .sort((a,b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()),
    [occurrences, bills]
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 px-4 py-8 sm:px-8">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <CreditCard className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">Recurring Bills</h1>
              <p className="text-zinc-400 mt-1 text-sm">
                Per-cycle payment tracking · Auto expense matching · Smart Telegram digest
              </p>
            </div>
          </div>
          {/* Quick action buttons */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleSyncOccurrences}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Sync Cycles
            </button>
            <button onClick={handleAutoMatch}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-sky-900/40 text-sky-300 border border-sky-700/40 hover:bg-sky-700/40 transition-colors">
              <Zap className="w-3.5 h-3.5" /> Auto-Match Expenses
            </button>
            <button onClick={handleBuildDigest}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-amber-900/40 text-amber-300 border border-amber-700/40 hover:bg-amber-700/40 transition-colors">
              <Send className="w-3.5 h-3.5" /> Preview Digest
            </button>
          </div>
        </div>

        {/* ── KPI Cards ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Monthly Equiv.</span>
            </div>
            <div className="text-2xl font-bold text-white tabular-nums">{mask(kpis.totalMonthly)}</div>
            <div className="text-xs text-zinc-500 mt-1">Budget basis</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Due This Week</span>
            </div>
            <div className="text-2xl font-bold text-white tabular-nums">{kpis.dueThisWeek}</div>
            <div className="text-xs text-zinc-500 mt-1">Unpaid, next 7 days</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Overdue</span>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${kpis.overdue > 0 ? "text-red-400" : "text-white"}`}>{kpis.overdue}</div>
            <div className="text-xs text-zinc-500 mt-1">Past due, unpaid</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Paid This Month</span>
            </div>
            <div className="text-2xl font-bold text-white tabular-nums">{kpis.paid}</div>
            <div className="text-xs text-zinc-500 mt-1">Occurrences paid</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 shadow">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-4 h-4 text-sky-400" />
              <span className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Annual Total</span>
            </div>
            <div className="text-2xl font-bold text-white tabular-nums">{mask(kpis.totalAnnual)}</div>
            <div className="text-xs text-zinc-500 mt-1">All bills combined</div>
          </div>
        </div>

        {/* ── Page tabs ────────────────────────────────────────────────────── */}
        <div className="flex gap-1 border-b border-zinc-800 pb-0">
          {([
            { key: "bills",       label: "Bills", icon: CreditCard },
            { key: "occurrences", label: "Payment Cycles", icon: Calendar },
            { key: "log",         label: "Notification Log", icon: Bell },
            { key: "digest",      label: "Daily Digest", icon: MessageSquare },
          ] as { key: PageTab; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setPageTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                pageTab === key
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}>
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab: Bills ────────────────────────────────────────────────────── */}
        {pageTab === "bills" && (
          <>
            {/* Add / Edit form */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-5">
                {editingId !== null ? (
                  <>
                    <Pencil className="w-5 h-5 text-amber-400" />
                    <h2 className="text-lg font-semibold text-white">Edit Bill</h2>
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-700/30">Editing #{editingId}</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5 text-emerald-400" />
                    <h2 className="text-lg font-semibold text-white">Add New Bill</h2>
                  </>
                )}
              </div>
              <BillForm form={form} onChange={handleFormChange} onSubmit={handleSubmit}
                onCancel={handleCancelEdit} isEditing={editingId !== null}
                isPending={addMutation.isPending || updateMutation.isPending} />
            </div>

            {/* Bills table */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur shadow-xl overflow-hidden">
              <div className="flex items-center gap-0 border-b border-zinc-800 px-2 pt-4 pb-0">
                <div className="flex gap-1 px-2 pb-3">
                  {([
                    { key: "30", label: "Next 30d" },
                    { key: "60", label: "Next 60d" },
                    { key: "90", label: "Next 90d" },
                    { key: "all", label: "All" },
                  ] as { key: TabFilter; label: string }[]).map(tab => (
                    <button key={tab.key} onClick={() => setTabFilter(tab.key)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        tabFilter === tab.key
                          ? "bg-emerald-600 text-white"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                      }`}>{tab.label}</button>
                  ))}
                </div>
                <div className="ml-auto pr-4 pb-3 text-xs text-zinc-500">{filteredBills.length} bills</div>
              </div>

              {billsLoading ? (
                <div className="p-12 text-center text-zinc-500">Loading bills…</div>
              ) : filteredBills.length === 0 ? (
                <div className="p-12 text-center text-zinc-500">No bills match this filter.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/80">
                        {["Bill Name","Category","Amount","Frequency","Next Due","Status","Member","Reminder","Actions"].map(h => (
                          <th key={h} className={`px-4 py-3 text-xs text-zinc-400 font-semibold uppercase tracking-wide ${h === "Amount" ? "text-right" : "text-left"} ${h === "Actions" ? "text-center" : ""}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {filteredBills.map(bill => {
                        const days    = daysUntil(bill.next_due_date);
                        const occ     = occurrences.find(o => o.bill_id === bill.id && o.payment_status !== "paid" && o.payment_status !== "skipped");
                        const status  = occ?.payment_status ?? deriveStatus(days, false, false);
                        return (
                          <tr key={bill.id} className={`transition-colors hover:bg-zinc-800/40 ${!bill.active ? "opacity-50" : ""}`}>
                            <td className="px-4 py-3 font-medium text-white">
                              {bill.bill_name}
                              {bill.auto_renew && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">Auto</span>}
                              {bill.essential && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-400">Essential</span>}
                            </td>
                            <td className="px-4 py-3 text-zinc-300">{bill.category}</td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              <span className="font-semibold text-emerald-300">{mask(safeNum(bill.amount))}</span>
                            </td>
                            <td className="px-4 py-3 text-zinc-400">{bill.frequency}</td>
                            <td className="px-4 py-3 text-zinc-300">
                              {bill.next_due_date
                                ? new Date(bill.next_due_date).toLocaleDateString("en-AU", { day:"2-digit", month:"short", year:"numeric" })
                                : "—"}
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={status} /></td>
                            <td className="px-4 py-3 text-zinc-400">{bill.member}</td>
                            <td className="px-4 py-3 text-zinc-400 text-xs">
                              <div className="space-y-0.5">
                                <div>{bill.reminder_days_before}d before</div>
                                {bill.remind_on_due_date && <div className="text-amber-400">+ due day</div>}
                                {bill.overdue_reminder !== "off" && <div className="text-red-400">Overdue: {bill.overdue_reminder}</div>}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => handleEdit(bill)} className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors" title="Edit">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => toggleActiveMutation.mutate({ id: bill.id, active: !bill.active })}
                                  className="p-1.5 rounded hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                                  title={bill.active ? "Deactivate" : "Activate"}>
                                  {bill.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-zinc-600" />}
                                </button>
                                {deleteConfirm === bill.id ? (
                                  <div className="flex gap-1">
                                    <button onClick={() => deleteMutation.mutate(bill.id)} className="px-2 py-0.5 rounded bg-red-700 hover:bg-red-600 text-white text-xs">Confirm</button>
                                    <button onClick={() => setDeleteConfirm(null)} className="px-2 py-0.5 rounded bg-zinc-700 text-zinc-200 text-xs">Cancel</button>
                                  </div>
                                ) : (
                                  <button onClick={() => setDeleteConfirm(bill.id)} className="p-1.5 rounded hover:bg-red-900/50 text-zinc-400 hover:text-red-400 transition-colors" title="Delete">
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

            {/* Category breakdown */}
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
                        <th className="text-left px-3 py-2 text-xs text-zinc-400 font-semibold uppercase tracking-wide">Category</th>
                        <th className="text-right px-3 py-2 text-xs text-zinc-400 font-semibold uppercase tracking-wide">Budget Equiv./mo</th>
                        <th className="text-right px-3 py-2 text-xs text-zinc-400 font-semibold uppercase tracking-wide">% of Total</th>
                        <th className="px-3 py-2 w-40"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {categoryBreakdown.map(({ category, monthly, pct }) => (
                        <tr key={category} className="hover:bg-zinc-800/30 transition-colors">
                          <td className="px-3 py-2.5 text-zinc-200 font-medium">{category}</td>
                          <td className="px-3 py-2.5 text-right text-emerald-300 font-semibold tabular-nums">{mask(monthly)}</td>
                          <td className="px-3 py-2.5 text-right text-zinc-400 tabular-nums">{pct.toFixed(1)}%</td>
                          <td className="px-3 py-2.5">
                            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500/70" style={{ width: `${Math.min(pct,100)}%` }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-zinc-700">
                        <td className="px-3 py-2.5 text-zinc-300 font-semibold">Total</td>
                        <td className="px-3 py-2.5 text-right text-white font-bold tabular-nums">{mask(kpis.totalMonthly)}</td>
                        <td className="px-3 py-2.5 text-right text-zinc-400">100%</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Tab: Occurrences ─────────────────────────────────────────────── */}
        {pageTab === "occurrences" && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-sky-400" /> Payment Cycles
              </h2>
              <span className="text-xs text-zinc-500">{occurrences.length} occurrences tracked</span>
            </div>

            {occsLoading ? (
              <div className="p-12 text-center text-zinc-500">Loading occurrences…</div>
            ) : enrichedOccs.length === 0 ? (
              <div className="p-12 text-center text-zinc-500">
                No occurrences yet. Click <b>Sync Cycles</b> to generate them from your bills.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/80">
                      {["Bill","Due Date","Amount","Status","Paid At","Auto-Matched","Actions"].map(h => (
                        <th key={h} className={`px-4 py-3 text-xs text-zinc-400 font-semibold uppercase tracking-wide text-left ${h === "Amount" ? "text-right" : ""}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {enrichedOccs.map(occ => (
                      <tr key={occ.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-white">{occ.bill_name}</td>
                        <td className="px-4 py-3 text-zinc-300">
                          {new Date(occ.due_date).toLocaleDateString("en-AU", { day:"2-digit", month:"short", year:"numeric" })}
                          {occ.days !== null && occ.payment_status !== "paid" && occ.payment_status !== "skipped" && (
                            <span className="ml-2 text-xs text-zinc-500">
                              {occ.days < 0 ? `${Math.abs(occ.days)}d ago` : occ.days === 0 ? "today" : `in ${occ.days}d`}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-300 font-semibold tabular-nums">
                          {mask(safeNum(occ.amount))}
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={occ.payment_status} /></td>
                        <td className="px-4 py-3 text-zinc-400 text-xs">
                          {occ.paid_at
                            ? new Date(occ.paid_at).toLocaleDateString("en-AU", { day:"2-digit", month:"short" })
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-zinc-400 text-xs">
                          {occ.matched_expense_id
                            ? <span className="text-sky-400 flex items-center gap-1"><Zap className="w-3 h-3" />Exp #{occ.matched_expense_id}</span>
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {occ.bill && (
                            <OccurrenceActions
                              occ={occ}
                              bill={occ.bill}
                              onMarkPaid={handleMarkPaid}
                              onMarkUnpaid={handleMarkUnpaid}
                              onSkip={handleSkip}
                              onEditDueDate={o => { setEditDueDateOcc(o); setEditDueDateVal(o.due_date); }}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Notification Log ─────────────────────────────────────────── */}
        {pageTab === "log" && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-400" /> Notification Log
              </h2>
              <button onClick={() => qc.invalidateQueries({ queryKey: ["sf_bill_notif_log"] })}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>

            {logLoading ? (
              <div className="p-12 text-center text-zinc-500">Loading log…</div>
            ) : notifLog.length === 0 ? (
              <div className="p-12 text-center text-zinc-500">No notifications sent yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/80">
                      {["Bill Name","Due Date","Sent At","Stage","Channel","Status"].map(h => (
                        <th key={h} className="px-4 py-3 text-xs text-zinc-400 font-semibold uppercase tracking-wide text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {notifLog.map(log => (
                      <tr key={log.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-white">{log.bill_name}</td>
                        <td className="px-4 py-3 text-zinc-400 text-xs">
                          {log.due_date ? new Date(log.due_date).toLocaleDateString("en-AU", { day:"2-digit", month:"short", year:"numeric" }) : "—"}
                        </td>
                        <td className="px-4 py-3 text-zinc-300 text-xs">
                          {new Date(log.sent_at).toLocaleString("en-AU", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                            log.stage === "digest"         ? "bg-amber-900/40 text-amber-300 border-amber-700/40" :
                            log.stage === "overdue"        ? "bg-red-900/40 text-red-300 border-red-700/40" :
                            log.stage === "due_today"      ? "bg-orange-900/40 text-orange-300 border-orange-700/40" :
                            log.stage === "before_due"     ? "bg-sky-900/40 text-sky-300 border-sky-700/40" :
                            "bg-zinc-800 text-zinc-400 border-zinc-700"
                          }`}>{log.stage}</span>
                        </td>
                        <td className="px-4 py-3 text-zinc-400 text-xs capitalize">{log.channel}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold ${log.status === "sent" ? "text-emerald-400" : "text-red-400"}`}>{log.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Daily Digest ─────────────────────────────────────────────── */}
        {pageTab === "digest" && (
          <div className="space-y-6">
            {/* Digest preview + send */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-amber-400" /> Today's Digest Preview
              </h2>
              {digestPreview ? (
                <>
                  <pre className="bg-zinc-950 border border-zinc-700 rounded-xl p-4 text-sm text-zinc-200 font-mono whitespace-pre-wrap leading-relaxed mb-4">
                    {digestPreview.replace(/<[^>]+>/g, "")}
                  </pre>
                  <div className="flex gap-3">
                    <button onClick={handleSendDigest} disabled={digestSending}
                      className="flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-sm transition-colors disabled:opacity-50">
                      <Send className="w-4 h-4" />
                      {digestSending ? "Sending…" : "Send via Telegram"}
                    </button>
                    <button onClick={handleBuildDigest}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors">
                      <RefreshCw className="w-4 h-4" /> Rebuild
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-zinc-500 text-sm">
                  Click <b className="text-amber-400">Preview Digest</b> at the top of the page to build today's digest.
                </div>
              )}
            </div>

            {/* Digest send history */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-sky-400" /> Digest Send History
              </h2>
              {digestLogLoading ? (
                <div className="text-zinc-500 text-sm">Loading…</div>
              ) : digestLog.length === 0 ? (
                <div className="text-zinc-500 text-sm">No digests sent yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left px-3 py-2 text-xs text-zinc-400 font-semibold uppercase tracking-wide">Date</th>
                        <th className="text-left px-3 py-2 text-xs text-zinc-400 font-semibold uppercase tracking-wide">Sent At</th>
                        <th className="text-left px-3 py-2 text-xs text-zinc-400 font-semibold uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {digestLog.map(d => (
                        <tr key={d.id} className="hover:bg-zinc-800/30">
                          <td className="px-3 py-2.5 text-zinc-200">{d.digest_date}</td>
                          <td className="px-3 py-2.5 text-zinc-400 text-xs">
                            {new Date(d.sent_at).toLocaleString("en-AU", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`text-xs font-semibold ${d.status === "sent" ? "text-emerald-400" : "text-zinc-400"}`}>{d.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ── Edit due date dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!editDueDateOcc} onOpenChange={open => { if (!open) setEditDueDateOcc(null); }}>
        <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Due Date</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-zinc-400">{editDueDateOcc?.bill_name}</p>
            <Input type="date" value={editDueDateVal}
              onChange={e => setEditDueDateVal(e.target.value)}
              className="bg-input border-border text-foreground" />
            <div className="flex gap-3">
              <Button onClick={handleEditDueDateSave}
                className="bg-emerald-600 hover:bg-emerald-500 text-white flex-1">
                Save
              </Button>
              <Button variant="outline" onClick={() => setEditDueDateOcc(null)}
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 flex-1">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

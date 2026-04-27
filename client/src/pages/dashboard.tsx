/**
 * data-health.tsx — Data Health & Maintenance
 * Route: /data-health
 *
 * Features:
 *  - Supabase connection status (live test)
 *  - Last sync timestamp
 *  - Record counts per table
 *  - Data quality checks (duplicates, missing fields, invalid amounts, large expenses)
 *  - Import batch history (group by created_at date)
 *  - Action buttons: sync, clear cache, export JSON, export Excel, delete dupes
 *  - BulkDeleteModal for destructive operations
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, safeNum } from "@/lib/finance";
import { syncFromCloud, getLastSync } from "@/lib/localStore";
import BulkDeleteModal from "@/components/BulkDeleteModal";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import {
  Shield, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Trash2, Download, Database, Clock, FileJson, FileSpreadsheet,
  ChevronDown, ChevronRight, Layers, Search, AlertCircle, Info,
  RotateCcw, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DuplicateGroup {
  key: string;      // date|amount|category
  date: string;
  amount: number;
  category: string;
  expenses: any[];  // all matching expenses
  keepId: number;   // newest (max id), rest will be deleted
  deleteIds: number[];
}

interface QualityCheck {
  label: string;
  icon: React.ReactNode;
  status: 'ok' | 'warning' | 'error';
  count: number;
  detail?: string;
  items?: any[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectDuplicates(expenses: any[]): DuplicateGroup[] {
  const groups = new Map<string, any[]>();

  for (const exp of expenses) {
    const key = `${exp.date}|${safeNum(exp.amount).toFixed(2)}|${(exp.category || '').trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(exp);
  }

  const duplicateGroups: DuplicateGroup[] = [];
  for (const [key, items] of Array.from(groups.entries())) {
    if (items.length > 1) {
      const sorted = [...items].sort((a, b) => b.id - a.id);
      const keepId = sorted[0].id;
      const deleteIds = sorted.slice(1).map((e: any) => e.id);
      const parts = key.split('|');
      duplicateGroups.push({
        key,
        date: parts[0],
        amount: safeNum(parts[1]),
        category: parts[2],
        expenses: items,
        keepId,
        deleteIds,
      });
    }
  }

  return duplicateGroups.sort((a, b) => b.deleteIds.length - a.deleteIds.length);
}

function groupByImportDate(expenses: any[]): { date: string; count: number; total: number; categories: string[] }[] {
  const groups = new Map<string, { count: number; total: number; categories: Set<string> }>();
  for (const exp of expenses) {
    const dateKey = exp.created_at ? exp.created_at.substring(0, 10) : 'unknown';
    if (!groups.has(dateKey)) groups.set(dateKey, { count: 0, total: 0, categories: new Set() });
    const g = groups.get(dateKey)!;
    g.count++;
    g.total += safeNum(exp.amount);
    if (exp.category) g.categories.add(exp.category);
  }
  return Array.from(groups.entries())
    .map(([date, g]) => ({ date, count: g.count, total: g.total, categories: Array.from(g.categories).slice(0, 5) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ─── Status dot ───────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: 'checking' | 'ok' | 'error' }) {
  const color = status === 'ok' ? 'bg-emerald-400' : status === 'error' ? 'bg-red-400' : 'bg-amber-400';
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${color} ${status === 'checking' ? 'animate-pulse' : ''}`} />
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children, defaultOpen = true }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        className="flex items-center gap-2.5 w-full px-5 py-4 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="text-primary">{icon}</span>
        <span className="text-sm font-bold">{title}</span>
        <span className="ml-auto text-muted-foreground">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function DataHealthPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── State ──────────────────────────────────────────────────────────────────
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'ok' | 'error'>('checking');
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(getLastSync);
  const [showDupes, setShowDupes] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedDupeIds, setSelectedDupeIds] = useState<number[]>([]);
  const [batchHistoryOpen, setBatchHistoryOpen] = useState(false);
  const [dupeExpanded, setDupeExpanded] = useState<Set<string>>(new Set());
  const [largeExpensesExpanded, setLargeExpensesExpanded] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: snapshot, error: snapError } = useQuery<any>({
    queryKey: ['/api/snapshot'],
    queryFn: () => apiRequest('GET', '/api/snapshot').then(r => r.json()),
  });
  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ['/api/expenses'],
    queryFn: () => apiRequest('GET', '/api/expenses').then(r => r.json()),
  });
  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ['/api/properties'],
    queryFn: () => apiRequest('GET', '/api/properties').then(r => r.json()),
  });
  const { data: stocks = [] } = useQuery<any[]>({
    queryKey: ['/api/stocks'],
    queryFn: () => apiRequest('GET', '/api/stocks').then(r => r.json()),
  });
  const { data: cryptos = [] } = useQuery<any[]>({
    queryKey: ['/api/crypto'],
    queryFn: () => apiRequest('GET', '/api/crypto').then(r => r.json()),
  });
  const { data: timeline = [] } = useQuery<any[]>({
    queryKey: ['/api/timeline'],
    queryFn: () => apiRequest('GET', '/api/timeline').then(r => r.json()),
  });
  const { data: scenarios = [] } = useQuery<any[]>({
    queryKey: ['/api/scenarios'],
    queryFn: () => apiRequest('GET', '/api/scenarios').then(r => r.json()).catch(() => []),
  });
  const { data: incomeRecords = [] } = useQuery<any[]>({
    queryKey: ['/api/income'],
    queryFn: () => apiRequest('GET', '/api/income').then(r => r.json()).catch(() => []),
  });

  // ── Test Supabase connection on mount ──────────────────────────────────────
  useEffect(() => {
    const testConnection = async () => {
      setConnectionStatus('checking');
      try {
        const SUPABASE_URL = 'https://uoraduyyxhtzixcsaidg.supabase.co';
        const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c';
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/sf_snapshot?id=eq.shahrokh-family-main&select=id`,
          { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
        );
        setConnectionStatus(res.ok ? 'ok' : 'error');
      } catch {
        setConnectionStatus('error');
      }
    };
    testConnection();
  }, []);

  // ── Derived data quality checks ────────────────────────────────────────────
  const duplicateGroups = useMemo(() => detectDuplicates(expenses), [expenses]);
  const totalDupeCount = useMemo(() => duplicateGroups.reduce((sum, g) => sum + g.deleteIds.length, 0), [duplicateGroups]);

  // ─── Income quality checks ─────────────────────────────────────────────────────
  const incomeTotalAmount = useMemo(() => incomeRecords.reduce((s: number, r: any) => s + safeNum(r.amount), 0), [incomeRecords]);
  const incomeDuplicates = useMemo(() => {
    const seen = new Map<string, number>();
    const dupes: any[] = [];
    for (const r of incomeRecords) {
      const key = `${r.date}|${safeNum(r.amount).toFixed(2)}|${(r.source || '').toLowerCase()}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    for (const r of incomeRecords) {
      const key = `${r.date}|${safeNum(r.amount).toFixed(2)}|${(r.source || '').toLowerCase()}`;
      if ((seen.get(key) || 0) > 1) dupes.push(r);
    }
    return dupes;
  }, [incomeRecords]);
  const incomeMissingDates = useMemo(() => incomeRecords.filter((r: any) => !r.date || r.date.trim() === ''), [incomeRecords]);
  const incomeInvalidAmounts = useMemo(() => incomeRecords.filter((r: any) => !isFinite(safeNum(r.amount)) || safeNum(r.amount) <= 0), [incomeRecords]);

  const missingDates = useMemo(() => expenses.filter((e: any) => !e.date || e.date.trim() === ''), [expenses]);
  const missingCategories = useMemo(() => expenses.filter((e: any) => !e.category || e.category.trim() === ''), [expenses]);
  const invalidAmounts = useMemo(() => expenses.filter((e: any) => !isFinite(safeNum(e.amount)) || safeNum(e.amount) <= 0), [expenses]);
  const largeExpenses = useMemo(() => expenses.filter((e: any) => safeNum(e.amount) > 5000).sort((a: any, b: any) => b.amount - a.amount), [expenses]);

  const qualityChecks: QualityCheck[] = [
    {
      label: 'Duplicate expenses',
      icon: <Layers className="w-4 h-4" />,
      status: totalDupeCount > 0 ? 'error' : 'ok',
      count: totalDupeCount,
      detail: totalDupeCount > 0 ? `${duplicateGroups.length} duplicate groups (${totalDupeCount} extra records)` : 'No duplicates detected',
    },
    {
      label: 'Missing dates',
      icon: <Clock className="w-4 h-4" />,
      status: missingDates.length > 0 ? 'warning' : 'ok',
      count: missingDates.length,
      detail: missingDates.length > 0 ? `${missingDates.length} expenses have no date` : 'All expenses have dates',
      items: missingDates.slice(0, 5),
    },
    {
      label: 'Missing categories',
      icon: <Search className="w-4 h-4" />,
      status: missingCategories.length > 0 ? 'warning' : 'ok',
      count: missingCategories.length,
      detail: missingCategories.length > 0 ? `${missingCategories.length} expenses have no category` : 'All expenses categorised',
      items: missingCategories.slice(0, 5),
    },
    {
      label: 'Invalid amounts',
      icon: <AlertCircle className="w-4 h-4" />,
      status: invalidAmounts.length > 0 ? 'error' : 'ok',
      count: invalidAmounts.length,
      detail: invalidAmounts.length > 0 ? `${invalidAmounts.length} expenses have amount ≤ 0 or invalid` : 'All amounts valid',
      items: invalidAmounts.slice(0, 5),
    },
    {
      label: 'Large expenses (>$5,000)',
      icon: <AlertTriangle className="w-4 h-4" />,
      status: largeExpenses.length > 0 ? 'warning' : 'ok',
      count: largeExpenses.length,
      detail: largeExpenses.length > 0 ? `${largeExpenses.length} unusually large expense records` : 'No unusually large expenses',
      items: largeExpenses.slice(0, 10),
    },
  ];

  const importBatches = useMemo(() => groupByImportDate(expenses), [expenses]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleSyncFromCloud = useCallback(async () => {
    setSyncing(true);
    try {
      await syncFromCloud();
      await qc.invalidateQueries();
      const ts = getLastSync();
      setLastSync(ts);
      toast({ title: 'Synced from cloud', description: 'All data refreshed from Supabase.' });
    } catch (err) {
      toast({ title: 'Sync failed', description: String(err), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  }, [qc, toast]);

  const handleClearAndReload = useCallback(async () => {
    // Clear all sf_* localStorage keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sf_')) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    toast({ title: 'Cache cleared', description: `Removed ${keysToRemove.length} local cache keys. Re-syncing from cloud…` });
    await handleSyncFromCloud();
  }, [handleSyncFromCloud, toast]);

  const handleExportJSON = useCallback(() => {
    const data = {
      exportedAt: new Date().toISOString(),
      snapshot,
      expenses,
      properties,
      stocks,
      cryptos,
      timeline,
      scenarios,
      income: incomeRecords,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Shahrokh_FullBackup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'JSON backup exported', description: 'All data saved to file.' });
  }, [snapshot, expenses, properties, stocks, cryptos, timeline, scenarios, toast]);

  const handleExportExpensesExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const headers = ['ID', 'Date', 'Amount', 'Category', 'Subcategory', 'Description', 'Payment Method', 'Family Member', 'Recurring', 'Notes', 'Created At'];
    const rows = expenses.map((e: any) => [
      e.id, e.date, e.amount, e.category, e.subcategory || '',
      e.description || '', e.payment_method || '', e.family_member || '',
      e.recurring ? 'Yes' : 'No', e.notes || '', e.created_at || ''
    ]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Expenses');
    XLSX.writeFile(wb, `Shahrokh_Expenses_Backup_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast({ title: 'Expenses Excel exported', description: `${expenses.length} records saved.` });
  }, [expenses, toast]);

  const handleDeleteDuplicates = useCallback(async () => {
    // Collect all IDs to delete across all selected/all duplicate groups
    const idsToDelete = selectedDupeIds.length > 0
      ? selectedDupeIds
      : duplicateGroups.flatMap(g => g.deleteIds);

    let deleted = 0;
    for (const id of idsToDelete) {
      try {
        await apiRequest('DELETE', `/api/expenses/${id}`);
        deleted++;
      } catch (e) {
        console.warn('Failed to delete expense', id, e);
      }
    }
    await qc.invalidateQueries({ queryKey: ['/api/expenses'] });
    setSelectedDupeIds([]);
    toast({ title: 'Duplicates deleted', description: `${deleted} duplicate records removed.` });
  }, [selectedDupeIds, duplicateGroups, qc, toast]);

  const handleExportDupesBackup = useCallback(() => {
    const idsToDelete = selectedDupeIds.length > 0
      ? selectedDupeIds
      : duplicateGroups.flatMap(g => g.deleteIds);
    const expensesToExport = expenses.filter((e: any) => idsToDelete.includes(e.id));
    const wb = XLSX.utils.book_new();
    const headers = ['ID', 'Date', 'Amount', 'Category', 'Description'];
    const rows = expensesToExport.map((e: any) => [e.id, e.date, e.amount, e.category, e.description || '']);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Dupes to Delete');
    XLSX.writeFile(wb, `Shahrokh_Dupes_Backup_${new Date().toISOString().split('T')[0]}.xlsx`);
  }, [selectedDupeIds, duplicateGroups, expenses]);

  const toggleDupeExpanded = (key: string) => {
    setDupeExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const allDupeIdsToDelete = useMemo(
    () => duplicateGroups.flatMap(g => g.deleteIds),
    [duplicateGroups]
  );

  const deleteCount = selectedDupeIds.length > 0 ? selectedDupeIds.length : allDupeIdsToDelete.length;

  const statusColor = { ok: 'text-emerald-400', warning: 'text-amber-400', error: 'text-red-400' };
  const statusIcon = {
    ok: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-400" />,
    error: <XCircle className="w-4 h-4 text-red-400" />,
  };

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Data Health
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Sync status, quality checks, and maintenance tools</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-8 text-xs"
          onClick={handleSyncFromCloud}
          disabled={syncing}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync from Cloud'}
        </Button>
      </div>

      {/* Top status bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Connection status */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1.5">Supabase Connection</p>
          <div className="flex items-center gap-2">
            <StatusDot status={connectionStatus} />
            <span className={`text-sm font-bold ${connectionStatus === 'ok' ? 'text-emerald-400' : connectionStatus === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
              {connectionStatus === 'ok' ? 'Connected' : connectionStatus === 'error' ? 'Error' : 'Checking…'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">uoraduyyxhtzixcsaidg.supabase.co</p>
        </div>

        {/* Last sync */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1.5">Last Synced</p>
          <p className="text-sm font-bold text-foreground">
            {lastSync
              ? new Date(lastSync).toLocaleString('en-AU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
              : 'Never'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {lastSync ? `${Math.round((Date.now() - new Date(lastSync).getTime()) / 60000)} min ago` : 'Not synced yet'}
          </p>
        </div>

        {/* Total expenses */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1.5">Total Expenses</p>
          <p className="text-lg font-bold num-display text-primary">{expenses.length.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatCurrency(expenses.reduce((s: number, e: any) => s + safeNum(e.amount), 0), true)} total
          </p>
        </div>

        {/* Data quality score */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1.5">Data Quality</p>
          {(() => {
            const issues = qualityChecks.filter(c => c.status !== 'ok').length;
            const score = Math.round(((qualityChecks.length - issues) / qualityChecks.length) * 100);
            return (
              <>
                <p className={`text-lg font-bold ${score === 100 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                  {score}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">{issues} issue{issues !== 1 ? 's' : ''} detected</p>
              </>
            );
          })()}
        </div>
      </div>

      {/* Record counts */}
      <SectionCard title="Record Counts per Table" icon={<Database className="w-4 h-4" />}>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3">
          {[
            { label: 'Expenses', count: expenses.length, color: 'text-primary' },
            { label: 'Income', count: incomeRecords.length, color: 'text-emerald-400' },
            { label: 'Properties', count: properties.length, color: 'text-cyan-400' },
            { label: 'Stocks', count: stocks.length, color: 'text-sky-400' },
            { label: 'Crypto', count: cryptos.length, color: 'text-amber-400' },
            { label: 'Timeline', count: timeline.length, color: 'text-purple-400' },
            { label: 'Scenarios', count: scenarios.length, color: 'text-pink-400' },
          ].map(({ label, count, color }) => (
            <div key={label} className="rounded-lg bg-secondary/50 p-3 text-center">
              <p className={`text-2xl font-bold num-display ${color}`}>{count}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        {/* Snapshot indicator */}
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <div className={`w-2 h-2 rounded-full ${snapshot ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span>Snapshot: {snapshot ? 'Loaded (updated ' + (snapshot.updated_at ? new Date(snapshot.updated_at).toLocaleDateString('en-AU') : 'unknown') + ')' : 'Not loaded'}</span>
        </div>
      </SectionCard>

      {/* Data quality checks */}
      <SectionCard title="Data Quality Checks" icon={<CheckCircle2 className="w-4 h-4" />}>
        <div className="space-y-3">
          {qualityChecks.map((check, i) => (
            <div key={i} className={`rounded-lg border p-3 ${
              check.status === 'ok'
                ? 'border-emerald-800/30 bg-emerald-950/10'
                : check.status === 'warning'
                ? 'border-amber-800/30 bg-amber-950/10'
                : 'border-red-800/30 bg-red-950/10'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={check.status === 'ok' ? 'text-emerald-400' : check.status === 'warning' ? 'text-amber-400' : 'text-red-400'}>
                    {check.icon}
                  </span>
                  <span className="text-sm font-medium">{check.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {check.count > 0 && (
                    <span className={`text-xs font-bold num-display ${statusColor[check.status]}`}>
                      {check.count}
                    </span>
                  )}
                  {statusIcon[check.status]}
                </div>
              </div>
              {check.detail && (
                <p className="text-xs text-muted-foreground mt-1 ml-6">{check.detail}</p>
              )}
              {/* Show items for large expenses */}
              {check.label === 'Large expenses (>$5,000)' && check.items && check.items.length > 0 && (
                <div className="mt-2 ml-6">
                  <button
                    className="text-xs text-primary flex items-center gap-1 mb-2"
                    onClick={() => setLargeExpensesExpanded(!largeExpensesExpanded)}
                  >
                    {largeExpensesExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    {largeExpensesExpanded ? 'Hide' : 'Show'} large expenses
                  </button>
                  {largeExpensesExpanded && (
                    <div className="space-y-1">
                      {check.items.map((e: any) => (
                        <div key={e.id} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                          <span className="text-muted-foreground">{e.date} · {e.category}</span>
                          <span className="font-mono num-display text-amber-400 font-semibold">{formatCurrency(e.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Duplicates section */}
      {duplicateGroups.length > 0 && (
        <SectionCard title={`Duplicate Expenses (${duplicateGroups.length} groups, ${totalDupeCount} extra records)`} icon={<Layers className="w-4 h-4" />}>
          <div className="space-y-2 mb-4">
            {duplicateGroups.map(group => (
              <div key={group.key} className="rounded-lg border border-red-800/30 bg-red-950/10">
                <div
                  className="flex items-center justify-between p-3 cursor-pointer"
                  onClick={() => toggleDupeExpanded(group.key)}
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-red-400 font-medium">{group.expenses.length}x</span>
                    <span className="text-muted-foreground">{group.date}</span>
                    <span className="font-mono num-display text-foreground">{formatCurrency(group.amount)}</span>
                    <span className="text-muted-foreground">· {group.category}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-400">{group.deleteIds.length} to delete</span>
                    {dupeExpanded.has(group.key) ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                </div>

                {dupeExpanded.has(group.key) && (
                  <div className="px-3 pb-3 space-y-1 border-t border-red-800/20">
                    {group.expenses.map(exp => (
                      <div key={exp.id} className={`flex items-center justify-between text-xs py-1.5 ${exp.id === group.keepId ? 'text-emerald-400' : 'text-red-400/70'}`}>
                        <span>ID #{exp.id} · {exp.description || 'No description'}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-xs">
                            {exp.created_at ? new Date(exp.created_at).toLocaleString('en-AU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                          <span className={`text-xs font-medium ${exp.id === group.keepId ? 'text-emerald-400' : 'text-red-400'}`}>
                            {exp.id === group.keepId ? '✓ Keep (newest)' : '✕ Delete'}
                          </span>
                          {exp.id !== group.keepId && (
                            <input
                              type="checkbox"
                              checked={selectedDupeIds.includes(exp.id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedDupeIds(prev => [...prev, exp.id]);
                                } else {
                                  setSelectedDupeIds(prev => prev.filter(id => id !== exp.id));
                                }
                              }}
                              className="accent-red-500"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">
              {selectedDupeIds.length > 0
                ? `${selectedDupeIds.length} records selected for deletion`
                : `All ${allDupeIdsToDelete.length} duplicates will be deleted (keeping newest of each group)`
              }
            </p>
            <Button
              size="sm"
              className="gap-1.5 bg-red-600 hover:bg-red-700 text-white border-0 h-8 text-xs ml-auto"
              onClick={() => setShowDeleteModal(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete {deleteCount} Duplicate{deleteCount !== 1 ? 's' : ''}
            </Button>
          </div>
        </SectionCard>
      )}

      {/* Import batch history */}
      <SectionCard title="Import Batch History" icon={<Clock className="w-4 h-4" />} defaultOpen={false}>
        <p className="text-xs text-muted-foreground mb-3">Expenses grouped by the date they were added to the database (created_at).</p>
        {importBatches.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No import history available.</p>
        ) : (
          <div className="space-y-1.5">
            {importBatches.map(batch => (
              <div key={batch.date} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <div>
                  <p className="text-xs font-medium">
                    {batch.date === 'unknown' ? 'Unknown date' : new Date(batch.date).toLocaleDateString('en-AU', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {batch.categories.slice(0, 3).join(', ')}{batch.categories.length > 3 ? ` +${batch.categories.length - 3} more` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold num-display text-primary">{batch.count} records</p>
                  <p className="text-xs text-muted-foreground num-display">{formatCurrency(batch.total, true)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ─── Income Health Section ──────────────────────────────────────── */}
      <SectionCard title="Income Data Health" icon={<CheckCircle2 className="w-4 h-4" />}>
        {incomeRecords.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No income records found in sf_income. Add records via the Income tab on the Expenses page.</p>
        ) : (
          <div className="space-y-3">
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-xl font-bold num-display text-emerald-400">{incomeRecords.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Records</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-xl font-bold num-display text-emerald-400">{formatCurrency(incomeTotalAmount, true)}</p>
                <p className="text-xs text-muted-foreground mt-1">Total Income</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className={`text-xl font-bold num-display ${incomeDuplicates.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {incomeDuplicates.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Duplicates</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className={`text-xl font-bold num-display ${incomeInvalidAmounts.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                  {incomeInvalidAmounts.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Invalid Amounts</p>
              </div>
            </div>

            {/* Quality checks */}
            {[
              {
                label: 'Duplicate income records',
                icon: <Layers className="w-4 h-4" />,
                status: incomeDuplicates.length > 0 ? 'error' : 'ok',
                count: incomeDuplicates.length,
                detail: incomeDuplicates.length > 0
                  ? `${incomeDuplicates.length} records share the same date + amount + source`
                  : 'No duplicate income records',
              },
              {
                label: 'Missing dates',
                icon: <Clock className="w-4 h-4" />,
                status: incomeMissingDates.length > 0 ? 'warning' : 'ok',
                count: incomeMissingDates.length,
                detail: incomeMissingDates.length > 0
                  ? `${incomeMissingDates.length} records have no date`
                  : 'All income records have dates',
              },
              {
                label: 'Invalid amounts (≤0)',
                icon: <AlertCircle className="w-4 h-4" />,
                status: incomeInvalidAmounts.length > 0 ? 'error' : 'ok',
                count: incomeInvalidAmounts.length,
                detail: incomeInvalidAmounts.length > 0
                  ? `${incomeInvalidAmounts.length} records have amount ≤0 or invalid`
                  : 'All income amounts are valid',
              },
            ].map((check, i) => (
              <div key={i} className={`rounded-lg border p-3 ${
                check.status === 'ok'
                  ? 'border-emerald-800/30 bg-emerald-950/10'
                  : check.status === 'warning'
                  ? 'border-amber-800/30 bg-amber-950/10'
                  : 'border-red-800/30 bg-red-950/10'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={check.status === 'ok' ? 'text-emerald-400' : check.status === 'warning' ? 'text-amber-400' : 'text-red-400'}>
                      {check.icon}
                    </span>
                    <span className="text-sm font-medium">{check.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {check.count > 0 && (
                      <span className={`text-xs font-bold num-display ${
                        check.status === 'ok' ? 'text-emerald-400' : check.status === 'warning' ? 'text-amber-400' : 'text-red-400'
                      }`}>{check.count}</span>
                    )}
                    {statusIcon[check.status as keyof typeof statusIcon]}
                  </div>
                </div>
                {check.detail && <p className="text-xs text-muted-foreground mt-1 ml-6">{check.detail}</p>}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Action buttons */}
      <SectionCard title="Maintenance Actions" icon={<Zap className="w-4 h-4" />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Sync from cloud */}
          <button
            className="flex items-center gap-3 rounded-lg border border-border p-4 text-left hover:border-primary/50 hover:bg-primary/5 transition-all group"
            onClick={handleSyncFromCloud}
            disabled={syncing}
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
              <RefreshCw className={`w-4 h-4 text-primary ${syncing ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <p className="text-sm font-medium">{syncing ? 'Syncing…' : 'Sync from Cloud'}</p>
              <p className="text-xs text-muted-foreground">Pull latest data from Supabase, overwrite local cache</p>
            </div>
          </button>

          {/* Clear cache and reload */}
          <button
            className="flex items-center gap-3 rounded-lg border border-border p-4 text-left hover:border-amber-500/50 hover:bg-amber-950/20 transition-all group"
            onClick={handleClearAndReload}
            disabled={syncing}
          >
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 group-hover:bg-amber-500/20 transition-colors">
              <RotateCcw className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Clear Cache & Reload</p>
              <p className="text-xs text-muted-foreground">Remove all sf_* localStorage keys, then re-sync from cloud</p>
            </div>
          </button>

          {/* Export full JSON */}
          <button
            className="flex items-center gap-3 rounded-lg border border-border p-4 text-left hover:border-cyan-500/50 hover:bg-cyan-950/20 transition-all group"
            onClick={handleExportJSON}
          >
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0 group-hover:bg-cyan-500/20 transition-colors">
              <FileJson className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Export Full Backup JSON</p>
              <p className="text-xs text-muted-foreground">All tables: snapshot, expenses, income, properties, stocks, crypto, timeline, scenarios</p>
            </div>
          </button>

          {/* Export expenses Excel */}
          <button
            className="flex items-center gap-3 rounded-lg border border-border p-4 text-left hover:border-emerald-500/50 hover:bg-emerald-950/20 transition-all group"
            onClick={handleExportExpensesExcel}
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20 transition-colors">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium">Export Expenses Excel</p>
              <p className="text-xs text-muted-foreground">{expenses.length} expense records as .xlsx file</p>
            </div>
          </button>
        </div>

        {/* Destructive zone */}
        {duplicateGroups.length > 0 && (
          <div className="mt-4 rounded-lg border border-red-800/40 bg-red-950/10 p-4">
            <div className="flex items-start gap-2.5 mb-3">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-300">Destructive Zone</p>
                <p className="text-xs text-red-400/80">Actions below permanently delete data and cannot be undone.</p>
              </div>
            </div>
            <Button
              size="sm"
              className="gap-1.5 bg-red-600 hover:bg-red-700 text-white border-0 h-8 text-xs"
              onClick={() => setShowDeleteModal(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete {deleteCount} Duplicate Expense{deleteCount !== 1 ? 's' : ''}
            </Button>
          </div>
        )}
      </SectionCard>

      {/* Local vs Cloud comparison */}
      <SectionCard title="Local vs Cloud Comparison" icon={<Info className="w-4 h-4" />} defaultOpen={false}>
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex-1 rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-muted-foreground font-medium mb-2">Local Cache (localStorage)</p>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Expenses</span>
                  <span className="num-display font-mono">{expenses.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Properties</span>
                  <span className="num-display font-mono">{properties.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Stocks</span>
                  <span className="num-display font-mono">{stocks.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cryptos</span>
                  <span className="num-display font-mono">{cryptos.length}</span>
                </div>
              </div>
            </div>
            <div className="text-muted-foreground">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div className="flex-1 rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-muted-foreground font-medium mb-2">Supabase (Cloud)</p>
              <div className="space-y-1">
                <div className="flex justify-between text-muted-foreground">
                  <span>Last sync</span>
                  <span>
                    {lastSync
                      ? new Date(lastSync).toLocaleString('en-AU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : 'Never'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Connection</span>
                  <span className={connectionStatus === 'ok' ? 'text-emerald-400' : 'text-red-400'}>
                    {connectionStatus === 'ok' ? '✓ Live' : connectionStatus === 'error' ? '✗ Error' : '… Checking'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            <Info className="w-3 h-3 inline mr-1" />
            Counts shown are from the current session. Data is always fetched from Supabase first on every page load (staleTime: 0). Local cache is only used as fallback when Supabase is unreachable.
          </p>
        </div>
      </SectionCard>

      {/* Bulk Delete Modal */}
      <BulkDeleteModal
        open={showDeleteModal}
        count={deleteCount}
        label="duplicate expense records"
        onConfirm={handleDeleteDuplicates}
        onCancel={() => setShowDeleteModal(false)}
        onExportBackup={handleExportDupesBackup}
      />
    </div>
  );
}

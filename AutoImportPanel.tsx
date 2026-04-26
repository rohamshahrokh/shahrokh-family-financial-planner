import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Upload, Play, Clock, CheckCircle, AlertTriangle, Info,
  RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";
import * as XLSX from "xlsx";

// ─── Source code → category map (duplicated here to keep component self-contained) ──
const SOURCE_CODE_MAP: Record<string, string> = {
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
  F:  'Other',
  RN: 'Other',
  MF: 'Other',
};

// ─── Excel date serial → YYYY-MM-DD ──────────────────────────────────────────
function excelSerialToDate(serial: number): string {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date = new Date(utc_value * 1000);
  return date.toISOString().split('T')[0];
}

function parseExcelDate(raw: any): string {
  if (!raw && raw !== 0) return new Date().toISOString().split('T')[0];
  if (raw instanceof Date) return raw.toISOString().split('T')[0];
  const s = String(raw).trim();
  const num = Number(s);
  if (!isNaN(num) && num > 40000 && num < 60000) return excelSerialToDate(num);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split('T')[0];
  const dmatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmatch) {
    const [, d, m, y] = dmatch;
    const day = parseInt(d, 10);
    const mon = parseInt(m, 10);
    if (day > 12) return `${y}-${mon.toString().padStart(2,'0')}-${day.toString().padStart(2,'0')}`;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  const dobj = new Date(s);
  if (!isNaN(dobj.getTime())) return dobj.toISOString().split('T')[0];
  return s;
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

// ─── Parse an XLSX ArrayBuffer into expense rows ──────────────────────────────
function parseXlsxBuffer(buffer: ArrayBuffer): any[] {
  const data = new Uint8Array(buffer);
  const wb = XLSX.read(data, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' }) as any[][];
  if (allRows.length < 2) return [];

  const headerRow = allRows[0].map((h: any) => String(h ?? '').trim().toLowerCase());
  const col = (names: string[]) => {
    for (const n of names) {
      const idx = headerRow.indexOf(n);
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const colDate    = col(['date']);
  const colAmount  = col(['amount']);
  const colCode    = col(['code', 'source code', 'source_code', 'sub-category', 'subcategory', 'subcat']);
  const colDesc    = col(['description', 'desc', 'details', 'note']);
  const colMember  = col(['member', 'family member', 'family_member', 'person', 'who']);
  const colPayment = col(['payment method', 'payment_method', 'payment', 'method']);
  const colNotes   = col(['notes', 'note', 'comment', 'comments']);
  const colRecur   = col(['recurring', 'repeat', 'recur']);

  const rows: any[] = [];
  const dataRows = allRows.slice(1);

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const r = dataRows[rowIdx];
    const hasDate   = colDate >= 0 && r[colDate] != null && r[colDate] !== '';
    const hasAmount = colAmount >= 0 && r[colAmount] != null && r[colAmount] !== '';
    if (!hasDate && !hasAmount) continue;

    const rawDateVal = colDate >= 0 ? r[colDate] : null;
    const rawCell = colDate >= 0 ? ws[XLSX.utils.encode_cell({ r: rowIdx + 1, c: colDate })] : null;
    const rawNumeric = rawCell?.t === 'n' ? rawCell.v : null;

    let dateIso: string;
    if (rawNumeric && rawNumeric > 40000) {
      dateIso = excelSerialToDate(rawNumeric);
    } else {
      dateIso = parseExcelDate(rawDateVal);
    }

    const amount = parseFloat(String(colAmount >= 0 ? r[colAmount] : 0).replace(/[^0-9.-]/g, '')) || 0;
    const rawCode = colCode >= 0 ? String(r[colCode] ?? '').trim().toUpperCase() : '';
    const mapped  = SOURCE_CODE_MAP[rawCode];
    const rawMember = colMember >= 0 ? String(r[colMember] ?? '') : '';
    const rawPayment = colPayment >= 0 ? String(r[colPayment] ?? '') : '';
    const notes = colNotes >= 0 ? String(r[colNotes] ?? '') : '';
    const recurRaw = colRecur >= 0 ? String(r[colRecur] ?? '').toLowerCase() : '';
    const recurring = recurRaw === 'yes' || recurRaw === 'true' || recurRaw === '1';
    const description = colDesc >= 0 ? String(r[colDesc] ?? '') : '';

    rows.push({
      date: dateIso,
      amount,
      source_code: rawCode,
      category: mapped || 'Other',
      subcategory: '',
      description,
      family_member: normalizeMember(rawMember),
      payment_method: normalizePaymentMethod(rawPayment),
      notes,
      recurring,
    });
  }
  return rows;
}

// ─── Import history entry type ────────────────────────────────────────────────
interface ImportHistoryEntry {
  id: number;
  timestamp: string;
  trigger: string;
  checked: number;
  added: number;
  skipped: number;
  status: 'Success' | 'Failed';
  error: string;
  source: string;
}

// ─── Component props ──────────────────────────────────────────────────────────
interface AutoImportPanelProps {
  expenses: any[];
  onImportComplete: () => void;
}

export default function AutoImportPanel({ expenses, onImportComplete }: AutoImportPanelProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [expanded, setExpanded] = useState(false);
  const [autoEnabled, setAutoEnabled] = useState(() => localStorage.getItem('sf_auto_import_enabled') === 'true');
  const [storedFileName, setStoredFileName] = useState(() => localStorage.getItem('sf_auto_import_file_name') || '');
  const [importHistory, setImportHistory] = useState<ImportHistoryEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('sf_import_history') || '[]'); }
    catch { return []; }
  });
  const [isRunning, setIsRunning] = useState(false);

  // Keep history in sync with localStorage changes from expenses.tsx
  useEffect(() => {
    const handleStorage = () => {
      try {
        setImportHistory(JSON.parse(localStorage.getItem('sf_import_history') || '[]'));
      } catch {}
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Re-read history when panel expands
  useEffect(() => {
    if (expanded) {
      try {
        setImportHistory(JSON.parse(localStorage.getItem('sf_import_history') || '[]'));
      } catch {}
    }
  }, [expanded]);

  const bulkMut = useMutation({
    mutationFn: (data: any[]) =>
      apiRequest('POST', '/api/expenses/bulk', { expenses: data }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/expenses'] });
      onImportComplete();
    },
  });

  // ─── Upload master file ───────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = btoa(
        new Uint8Array(ev.target?.result as ArrayBuffer)
          .reduce((acc, byte) => acc + String.fromCharCode(byte), '')
      );
      localStorage.setItem('sf_auto_import_file_b64', b64);
      localStorage.setItem('sf_auto_import_file_name', file.name);
      setStoredFileName(file.name);
      toast({ title: 'Master file saved', description: `${file.name} stored in browser.` });
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // ─── Run import now ───────────────────────────────────────────────────────
  const handleRunNow = async () => {
    const b64 = localStorage.getItem('sf_auto_import_file_b64');
    if (!b64) {
      toast({ title: 'No master file', description: 'Upload a master XLSX file first.', variant: 'destructive' });
      return;
    }

    setIsRunning(true);
    try {
      // Decode base64 → ArrayBuffer
      const binary = atob(b64);
      const buffer = new ArrayBuffer(binary.length);
      const view = new Uint8Array(buffer);
      for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);

      const rows = parseXlsxBuffer(buffer);

      // Duplicate check
      const existingFingerprints = new Set(
        expenses.map(e =>
          `${e.date}|${Number(e.amount).toFixed(2)}|${(e.source_code || '').toUpperCase()}|${(e.description || '').trim().toLowerCase()}`
        )
      );

      let skipped = 0;
      let added = 0;
      const toCreate: any[] = [];

      for (const r of rows) {
        const fp = `${r.date}|${Number(r.amount).toFixed(2)}|${r.source_code.toUpperCase()}|${r.description.trim().toLowerCase()}`;
        if (existingFingerprints.has(fp)) { skipped++; continue; }
        added++;
        toCreate.push(r);
      }

      const logEntry: ImportHistoryEntry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        trigger: 'Auto Panel',
        checked: rows.length,
        added,
        skipped,
        status: 'Success',
        error: '',
        source: storedFileName,
      };

      if (toCreate.length > 0) {
        await bulkMut.mutateAsync(toCreate);
        toast({ title: 'Import complete', description: `${added} added, ${skipped} skipped as duplicates.` });
      } else {
        toast({ title: 'No new records', description: `All ${skipped} rows already exist.` });
      }

      // Save to history
      const history = JSON.parse(localStorage.getItem('sf_import_history') || '[]');
      history.unshift(logEntry);
      localStorage.setItem('sf_import_history', JSON.stringify(history.slice(0, 100)));
      setImportHistory(history.slice(0, 100));
    } catch (err: any) {
      const logEntry: ImportHistoryEntry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        trigger: 'Auto Panel',
        checked: 0,
        added: 0,
        skipped: 0,
        status: 'Failed',
        error: String(err?.message || err),
        source: storedFileName,
      };
      const history = JSON.parse(localStorage.getItem('sf_import_history') || '[]');
      history.unshift(logEntry);
      localStorage.setItem('sf_import_history', JSON.stringify(history.slice(0, 100)));
      setImportHistory(history.slice(0, 100));
      toast({ title: 'Import failed', description: String(err?.message || err), variant: 'destructive' });
    } finally {
      setIsRunning(false);
    }
  };

  // ─── Toggle auto import ───────────────────────────────────────────────────
  const handleToggleAuto = () => {
    const newVal = !autoEnabled;
    setAutoEnabled(newVal);
    localStorage.setItem('sf_auto_import_enabled', String(newVal));
    toast({
      title: newVal ? 'Auto import enabled' : 'Auto import disabled',
      description: newVal ? 'Nightly import at 12:00 AM (requires Vercel Cron setup).' : 'Auto import turned off.',
    });
  };

  const lastRun = importHistory[0] || null;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* ─── Collapsible header ──────────────────────────────────── */}
      <button
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-secondary/30 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-3">
          <RefreshCw className="w-4 h-4 text-primary" />
          <span className="text-sm font-bold">Auto Import Settings</span>
          {autoEnabled && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-800">
              Enabled
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-6 border-t border-border pt-5">

          {/* ─── Info callout ─────────────────────────────────────── */}
          <div className="flex gap-2 items-start text-xs bg-blue-950/30 border border-blue-800/40 rounded-xl px-4 py-3">
            <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
            <span className="text-blue-300">
              Automatic scheduled import requires a Vercel Cron Job. See{" "}
              <code className="font-mono text-blue-200">VERCEL_CRON_INSTRUCTIONS.md</code>{" "}
              in the repo for setup. Use "Run Import Now" for manual sync.
            </span>
          </div>

          {/* ─── Status grid ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-secondary/40 rounded-xl p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Source File</p>
              <p className="text-xs font-semibold truncate" title={storedFileName}>
                {storedFileName || <span className="text-muted-foreground/60">Not set</span>}
              </p>
            </div>
            <div className="bg-secondary/40 rounded-xl p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Last Import</p>
              <p className="text-xs font-semibold">
                {lastRun
                  ? new Date(lastRun.timestamp).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })
                  : <span className="text-muted-foreground/60">Never</span>
                }
              </p>
            </div>
            <div className="bg-secondary/40 rounded-xl p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Next Scheduled</p>
              <p className="text-xs font-semibold">
                {autoEnabled
                  ? <span className="text-green-400">12:00 AM (nightly)</span>
                  : <span className="text-muted-foreground/60">Disabled</span>
                }
              </p>
            </div>
            <div className="bg-secondary/40 rounded-xl p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Last Result</p>
              {lastRun ? (
                <div className="flex items-center gap-1">
                  {lastRun.status === 'Success'
                    ? <CheckCircle className="w-3 h-3 text-green-400 shrink-0" />
                    : <AlertTriangle className="w-3 h-3 text-yellow-400 shrink-0" />
                  }
                  <span className={`text-xs font-semibold ${lastRun.status === 'Success' ? 'text-green-400' : 'text-yellow-400'}`}>
                    {lastRun.status}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground/60">—</span>
              )}
            </div>
          </div>

          {/* ─── Last run stats ────────────────────────────────────── */}
          {lastRun && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Rows Checked', value: lastRun.checked },
                { label: 'Rows Added', value: lastRun.added },
                { label: 'Rows Skipped', value: lastRun.skipped },
              ].map(s => (
                <div key={s.label} className="bg-secondary/30 rounded-xl px-4 py-2 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                  <span className="text-sm font-bold num-display">{s.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* ─── Action buttons ────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Master File
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />

            <Button
              size="sm"
              className="gap-2"
              style={{ background: 'linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))', color: 'hsl(224,40%,8%)', border: 'none' }}
              onClick={handleRunNow}
              disabled={isRunning || bulkMut.isPending}
            >
              {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              {isRunning ? 'Running…' : 'Run Import Now'}
            </Button>

            <Button
              size="sm"
              variant={autoEnabled ? 'default' : 'outline'}
              className={`gap-2 ${autoEnabled ? 'bg-green-700 hover:bg-green-600 text-white border-green-600' : ''}`}
              onClick={handleToggleAuto}
            >
              <Clock className="w-3.5 h-3.5" />
              Auto Import: {autoEnabled ? 'ON' : 'OFF'}
            </Button>
          </div>

          {/* ─── Auto import status badge ─────────────────────────── */}
          {autoEnabled ? (
            <div className="flex items-center gap-2 text-xs text-green-400 bg-green-900/20 border border-green-800/40 rounded-lg px-3 py-2">
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              Auto import enabled — runs nightly at 12:00 AM (requires Vercel Cron — see VERCEL_CRON_INSTRUCTIONS.md)
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/30 border border-border rounded-lg px-3 py-2">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              Auto import is off. Enable to schedule nightly runs (requires Vercel Cron setup).
            </div>
          )}

          {/* ─── Import history table ──────────────────────────────── */}
          <div>
            <h3 className="text-xs font-bold mb-3 text-muted-foreground uppercase tracking-wider">Import History (last 20)</h3>
            {importHistory.length === 0 ? (
              <div className="text-xs text-muted-foreground/60 text-center py-6 bg-secondary/20 rounded-xl">
                No imports yet.
              </div>
            ) : (
              <div className="overflow-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/60">
                    <tr>
                      {['Time', 'Trigger', 'Checked', 'Added', 'Skipped', 'Status', 'Error'].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importHistory.slice(0, 20).map((entry, i) => (
                      <tr key={entry.id ?? i} className="border-t border-border/40 hover:bg-secondary/20">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {new Date(entry.timestamp).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{entry.trigger}</td>
                        <td className="px-3 py-2 num-display">{entry.checked}</td>
                        <td className="px-3 py-2 num-display text-green-400">{entry.added}</td>
                        <td className="px-3 py-2 num-display text-muted-foreground">{entry.skipped}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                            entry.status === 'Success'
                              ? 'bg-green-900/40 text-green-400'
                              : 'bg-red-900/40 text-red-400'
                          }`}>
                            {entry.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 max-w-[200px] truncate text-muted-foreground" title={entry.error}>
                          {entry.error || '—'}
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
  );
}

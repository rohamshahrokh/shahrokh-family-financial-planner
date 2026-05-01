import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, safeNum, projectInvestment, calcCAGR } from "@/lib/finance";
import { maskValue } from "@/components/PrivacyMask";
import { useAppStore } from "@/lib/store";
import { useForecastAssumptions } from "@/lib/useForecastAssumptions";
import { runCashEngine } from "@/lib/cashEngine";
import SaveButton from "@/components/SaveButton";
import BulkDeleteModal from "@/components/BulkDeleteModal";
import { Button } from "@/components/ui/button";
import AIInsightsCard from "@/components/AIInsightsCard";
import PortfolioLiveReturn from "@/components/PortfolioLiveReturn";
import { fetchAllStockPrices, formatLastUpdated, isStaleByAge, type PriceEntry } from "@/lib/marketData";
import { Input } from "@/components/ui/input";
import type { StockTransaction, StockDCASchedule } from "@/lib/localStore";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import {
  Plus, Trash2, Edit2, TrendingUp, CheckSquare, Square,
  ArrowUpRight, ArrowDownRight, X, Calendar, Filter,
  Upload, RefreshCw, Clock, ToggleLeft, ToggleRight, Download,
  ShoppingCart,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

// ─── Colour palette ──────────────────────────────────────────────────────────
const COLORS = [
  "hsl(43,85%,55%)",
  "hsl(188,60%,48%)",
  "hsl(142,60%,45%)",
  "hsl(20,80%,55%)",
  "hsl(270,60%,60%)",
  "hsl(0,72%,51%)",
  "hsl(60,80%,50%)",
  "hsl(300,60%,55%)",
  "hsl(200,70%,55%)",
];

// ─── Custom chart tooltip ────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: {formatCurrency(p.value, true)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ─── Field mapping:
//   allocation_pct   → stores target_allocation_pct
//   annual_lump_sum  → stores avg_buy_price

// ─── Normalise stock ─────────────────────────────────────────────────────────
const SF_STOCK_COLS = new Set([
  'ticker','name','current_price','current_holding','allocation_pct',
  'expected_return','monthly_dca','annual_lump_sum','projection_years',
]);

function normaliseStock(d: any) {
  const out: Record<string, any> = {};
  for (const k of SF_STOCK_COLS) {
    if (k in d) out[k] = d[k];
  }
  const numKeys = [
    "current_price", "current_holding", "expected_return",
    "monthly_dca", "allocation_pct", "annual_lump_sum", "projection_years",
  ];
  for (const k of numKeys) {
    if (k in out) out[k] = parseFloat(String(out[k])) || 0;
  }
  return out;
}

// ─── Derived per-stock calcs ─────────────────────────────────────────────────
function stockCalcs(s: any, totalPortfolioValue: number) {
  const units = safeNum(s.current_holding);
  const currentPrice = safeNum(s.current_price);
  const avgBuyPrice = safeNum(s.annual_lump_sum); // stored in annual_lump_sum
  const targetAlloc = safeNum(s.allocation_pct);  // stored in allocation_pct

  const currentValue = units * currentPrice;
  const totalInvested = units * avgBuyPrice;
  const unrealisedGL = currentValue - totalInvested;
  const unrealisedGLPct = totalInvested > 0 ? (unrealisedGL / totalInvested) * 100 : 0;
  const actualAllocPct = totalPortfolioValue > 0 ? (currentValue / totalPortfolioValue) * 100 : 0;
  const allocDiff = actualAllocPct - targetAlloc;

  return {
    units, currentPrice, avgBuyPrice, targetAlloc,
    currentValue, totalInvested, unrealisedGL, unrealisedGLPct,
    actualAllocPct, allocDiff,
  };
}

// ─── Today's date string ─────────────────────────────────────────────────────
function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

// ─── Empty transaction form ──────────────────────────────────────────────────
function emptyTxForm(): Partial<StockTransaction> {
  return {
    transaction_type: "buy",
    status: "actual",
    transaction_date: todayStr(),
    ticker: "",
    asset_name: "",
    units: 0,
    price_per_unit: 0,
    total_amount: 0,
    brokerage_fee: 0,
    notes: "",
    created_by: "user",
  };
}

// ─── Empty planned order form ────────────────────────────────────────────────
function emptyOrderForm(): any {
  return {
    module: 'stock',
    ticker: '',
    asset_name: '',
    action: 'buy',
    amount_aud: 0,
    units: null,
    planned_date: new Date().toISOString().split('T')[0],
    status: 'planned',
    notes: '',
  };
}

// ─── Live price state uses marketData.ts multi-source engine ────────────────
// fetchAllStockPrices is imported from @/lib/marketData (Yahoo→Stooq fallback)

// ─── Bulk Import Modal ───────────────────────────────────────────────────────
interface ImportRow {
  ticker: string; name: string; units: number; avgBuyPrice: number;
  currentPrice: number; expectedReturn: number; monthlyDCA: number; allocationPct: number;
}

const IMPORT_TEMPLATE_HEADERS = [
  "Ticker", "Company Name", "Units Owned", "Avg Buy Price (AUD)",
  "Current Price (AUD)", "Expected Return %", "Monthly DCA (AUD)", "Target Allocation %",
];

function downloadImportTemplate() {
  const wb = XLSX.utils.book_new();
  const sample: any[] = [
    IMPORT_TEMPLATE_HEADERS,
    ["AAPL", "Apple Inc.", 10, 150.00, 175.00, 14, 200, 15],
    ["NVDA", "NVIDIA Corporation", 5, 400.00, 950.00, 20, 500, 25],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sample), "Stocks Import");
  XLSX.writeFile(wb, "Stocks_Import_Template.xlsx");
}

function parseImportFile(file: File): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });
        const rows: ImportRow[] = [];
        for (let i = 1; i < raw.length; i++) {
          const r = raw[i];
          if (!r[0]) continue;
          rows.push({
            ticker: String(r[0] ?? "").trim().toUpperCase(),
            name: String(r[1] ?? r[0]).trim(),
            units: parseFloat(r[2]) || 0,
            avgBuyPrice: parseFloat(r[3]) || 0,
            currentPrice: parseFloat(r[4]) || 0,
            expectedReturn: parseFloat(r[5]) || 12,
            monthlyDCA: parseFloat(r[6]) || 0,
            allocationPct: parseFloat(r[7]) || 0,
          });
        }
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

interface BulkImportModalProps {
  onImport: (rows: ImportRow[]) => void;
  onClose: () => void;
}

function BulkImportModal({ onImport, onClose }: BulkImportModalProps) {
  const [preview, setPreview] = useState<ImportRow[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError("");
    setLoading(true);
    try {
      const rows = await parseImportFile(file);
      if (rows.length === 0) { setError("No data rows found. Check your file format."); setLoading(false); return; }
      setPreview(rows);
    } catch { setError("Could not parse file. Use the template for correct formatting."); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="font-bold text-sm">Bulk Import Stock Holdings</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Upload an Excel file — each row is one stock holding</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Step 1 — Download template */}
          <div className="bg-secondary/40 rounded-xl p-4">
            <p className="text-xs font-semibold mb-2">Step 1 — Download the import template</p>
            <Button size="sm" variant="outline" onClick={downloadImportTemplate} className="gap-2 text-xs h-7">
              <Download className="w-3 h-3" /> Download Template (.xlsx)
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Columns: {IMPORT_TEMPLATE_HEADERS.join(" | ")}
            </p>
          </div>

          {/* Step 2 — Upload */}
          <div className="bg-secondary/40 rounded-xl p-4">
            <p className="text-xs font-semibold mb-2">Step 2 — Upload your filled file</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <Button
              size="sm" variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={loading}
              className="gap-2 text-xs h-7"
            >
              <Upload className="w-3 h-3" /> {loading ? "Parsing..." : "Choose File"}
            </Button>
            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          </div>

          {/* Step 3 — Preview */}
          {preview && (
            <div>
              <p className="text-xs font-semibold mb-2">Step 3 — Review {preview.length} rows before importing</p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      {["Ticker","Name","Units","Avg Buy","Current Price","Exp Return %","Monthly DCA","Alloc %"].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-muted-foreground font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} className="border-b border-border/40 hover:bg-secondary/20">
                        <td className="px-3 py-1.5 font-bold text-primary">{r.ticker}</td>
                        <td className="px-3 py-1.5 max-w-[120px] truncate">{r.name}</td>
                        <td className="px-3 py-1.5 num-display">{r.units.toLocaleString()}</td>
                        <td className="px-3 py-1.5 num-display">{formatCurrency(r.avgBuyPrice)}</td>
                        <td className="px-3 py-1.5 num-display">{formatCurrency(r.currentPrice)}</td>
                        <td className="px-3 py-1.5 num-display">{r.expectedReturn}%</td>
                        <td className="px-3 py-1.5 num-display">{formatCurrency(r.monthlyDCA)}</td>
                        <td className="px-3 py-1.5 num-display">{r.allocationPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 p-5 border-t border-border">
          {preview && (
            <Button
              onClick={() => { onImport(preview); onClose(); }}
              style={{ background: "linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))", color: "hsl(224,40%,8%)", border: "none" }}
              className="text-xs h-8 gap-1"
            >
              <Upload className="w-3 h-3" /> Import {preview.length} Holdings
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onClose} className="text-xs h-8">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ─── DCA Schedule Form ────────────────────────────────────────────────────────
// Default portfolio tickers — always available in DCA selector even if holdings table is empty
const DEFAULT_STOCK_TICKERS = ['NVDA','GOOGL','MSFT','AVGO','CEG','CCJ','WPM','TSLA','OKLO','ANET'];

function emptyDCAForm(extraTickers: string[] = []): Omit<StockDCASchedule, 'id'|'created_at'|'updated_at'> {
  // Prefer first available ticker from defaults
  const ticker = DEFAULT_STOCK_TICKERS[0];
  return {
    ticker,
    asset_name: '',
    amount: 0,
    frequency: 'monthly',
    start_date: new Date().toISOString().split('T')[0],
    end_date: null,
    enabled: true,
    notes: '',
  };
}

function dcaMonthlyEquiv(amount: number, freq: string): number {
  const map: Record<string, number> = { weekly: 52/12, fortnightly: 26/12, monthly: 1, quarterly: 1/3 };
  return amount * (map[freq] ?? 1);
}

// ─── StockEditForm ────────────────────────────────────────────────────────────
interface StockEditFormProps {
  data: any;
  onChange: (d: any) => void;
  onEnterSave?: () => void;
}

function StockEditForm({ data, onChange, onEnterSave }: StockEditFormProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(e.target as HTMLElement).matches("textarea")) {
      e.preventDefault();
      onEnterSave?.();
    }
  };

  const fields: { label: string; key: string; type: string; step?: string; placeholder?: string }[] = [
    { label: "Ticker", key: "ticker", type: "text", placeholder: "AAPL" },
    { label: "Company Name", key: "name", type: "text", placeholder: "Apple Inc." },
    { label: "Units Owned", key: "current_holding", type: "number", step: "0.001" },
    { label: "Avg Buy Price ($)", key: "annual_lump_sum", type: "number", step: "0.01" },
    { label: "Current Price ($)", key: "current_price", type: "number", step: "0.01" },
    { label: "Expected Return %", key: "expected_return", type: "number", step: "0.5" },
    { label: "Monthly DCA ($)", key: "monthly_dca", type: "number", step: "50" },
    { label: "Target Allocation %", key: "allocation_pct", type: "number", step: "0.5" },
    { label: "Projection Years", key: "projection_years", type: "number", step: "1" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" onKeyDown={handleKeyDown}>
      {fields.map(f => (
        <div key={f.key}>
          <label className="text-xs text-muted-foreground block mb-1">{f.label}</label>
          <Input
            type={f.type}
            placeholder={f.placeholder}
            step={f.step}
            value={data[f.key] ?? ""}
            onChange={e => onChange({ ...data, [f.key]: e.target.value })}
            className="h-7 text-xs"
          />
        </div>
      ))}
      {/* Auto-calculated display fields */}
      {(() => {
        const units = safeNum(data.current_holding);
        const cp = safeNum(data.current_price);
        const abp = safeNum(data.annual_lump_sum);
        const cv = units * cp;
        const ti = units * abp;
        const gl = cv - ti;
        const glPct = ti > 0 ? (gl / ti) * 100 : 0;
        return (
          <>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Current Value (auto)</label>
              <Input readOnly value={formatCurrency(cv)} className="h-7 text-xs opacity-60 cursor-not-allowed border-primary/30" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Total Invested (auto)</label>
              <Input readOnly value={formatCurrency(ti)} className="h-7 text-xs opacity-60 cursor-not-allowed border-primary/30" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Unrealised G/L (auto)</label>
              <Input
                readOnly
                value={`${gl >= 0 ? "+" : ""}${formatCurrency(gl)} (${glPct >= 0 ? "+" : ""}${glPct.toFixed(1)}%)`}
                className={`h-7 text-xs opacity-80 cursor-not-allowed ${gl >= 0 ? "text-emerald-400 border-emerald-400/30" : "text-red-400 border-red-400/30"}`}
              />
            </div>
          </>
        );
      })()}
    </div>
  );
}

// ─── Transaction Form Modal ───────────────────────────────────────────────────
interface TxFormProps {
  initial: Partial<StockTransaction>;
  stocks: any[];
  onSave: (data: Partial<StockTransaction>) => void;
  onCancel: () => void;
  isSaving: boolean;
}

function StockTxForm({ initial, stocks, onSave, onCancel, isSaving }: TxFormProps) {
  const [form, setForm] = useState<Partial<StockTransaction>>(initial);

  const set = (key: keyof StockTransaction, value: any) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      // Auto-calculate total_amount
      if (key === "units" || key === "price_per_unit") {
        const u = safeNum(key === "units" ? value : prev.units);
        const p = safeNum(key === "price_per_unit" ? value : prev.price_per_unit);
        next.total_amount = parseFloat((u * p).toFixed(2));
      }
      // Auto-fill asset_name if ticker matches holding
      if (key === "ticker") {
        const match = stocks.find((s: any) =>
          s.ticker?.toLowerCase() === String(value).toLowerCase()
        );
        if (match) next.asset_name = match.name;
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-sm">
            {initial.id ? "Edit Transaction" : "Add Transaction"}
          </h3>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Type + Status toggles */}
        <div className="flex gap-4 mb-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Type</label>
            <div className="flex rounded-lg overflow-hidden border border-border">
              {(["buy", "sell"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => set("transaction_type", t)}
                  className={`px-4 py-1.5 text-xs font-semibold transition-colors ${
                    form.transaction_type === t
                      ? t === "buy" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "buy" ? "Buy" : "Sell"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Status</label>
            <div className="flex rounded-lg overflow-hidden border border-border">
              {(["actual", "planned"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => set("status", s)}
                  className={`px-4 py-1.5 text-xs font-semibold transition-colors ${
                    form.status === s
                      ? "bg-primary text-black"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s === "actual" ? "Actual" : "Planned"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Date</label>
            <Input
              type="date"
              value={form.transaction_date ?? ""}
              onChange={e => set("transaction_date", e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Ticker</label>
            <Input
              type="text"
              placeholder="AAPL"
              value={form.ticker ?? ""}
              onChange={e => set("ticker", e.target.value.toUpperCase())}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Asset Name</label>
            <Input
              type="text"
              placeholder="Apple Inc."
              value={form.asset_name ?? ""}
              onChange={e => set("asset_name", e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Units / Shares</label>
            <Input
              type="number"
              step="0.001"
              min="0"
              value={form.units ?? ""}
              onChange={e => set("units", parseFloat(e.target.value) || 0)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Price per Share (AUD)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.price_per_unit ?? ""}
              onChange={e => set("price_per_unit", parseFloat(e.target.value) || 0)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Total Amount (AUD)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.total_amount ?? ""}
              onChange={e => set("total_amount", parseFloat(e.target.value) || 0)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Brokerage Fee (AUD)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.brokerage_fee ?? ""}
              onChange={e => set("brokerage_fee", parseFloat(e.target.value) || 0)}
              className="h-8 text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground block mb-1">Notes</label>
            <Input
              type="text"
              placeholder="Optional notes..."
              value={form.notes ?? ""}
              onChange={e => set("notes", e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <Button
            onClick={() => onSave(form)}
            disabled={isSaving}
            style={{ background: "linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))", color: "hsl(224,40%,8%)", border: "none" }}
            className="text-xs h-8"
          >
            {isSaving ? "Saving..." : "Save Transaction"}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel} className="text-xs h-8">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Planned Order Form Modal ─────────────────────────────────────────────────
interface OrderFormProps {
  initial: any;
  stocks: any[];
  onSave: (data: any) => void;
  onCancel: () => void;
  isSaving: boolean;
}

function PlannedOrderForm({ initial, stocks, onSave, onCancel, isSaving }: OrderFormProps) {
  const [form, setForm] = useState<any>(initial);

  const set = (key: string, value: any) => {
    setForm((prev: any) => {
      const next = { ...prev, [key]: value };
      if (key === 'ticker') {
        const match = stocks.find((s: any) => s.ticker?.toLowerCase() === String(value).toLowerCase());
        if (match) next.asset_name = match.name;
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-2xl shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-sm">
            {initial.id ? "Edit Planned Order" : "Add Planned Order"}
          </h3>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action toggle */}
        <div className="flex gap-4 mb-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Action</label>
            <div className="flex rounded-lg overflow-hidden border border-border">
              {(["buy", "sell"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => set("action", t)}
                  className={`px-4 py-1.5 text-xs font-semibold transition-colors ${
                    form.action === t
                      ? t === "buy" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "buy" ? "Buy" : "Sell"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Status</label>
            <div className="flex rounded-lg overflow-hidden border border-border">
              {(["planned", "executed", "cancelled"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => set("status", s)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    form.status === s
                      ? s === "planned" ? "bg-amber-500 text-white" : s === "executed" ? "bg-emerald-600 text-white" : "bg-secondary text-muted-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Ticker</label>
            <div className="flex gap-1">
              <select
                value={stocks.find((s: any) => s.ticker === form.ticker) ? form.ticker : '__custom__'}
                onChange={e => {
                  if (e.target.value !== '__custom__') set('ticker', e.target.value);
                  else set('ticker', '');
                }}
                className="h-8 text-xs bg-secondary border border-border rounded px-2 text-foreground flex-1"
              >
                {stocks.map((s: any) => <option key={s.ticker} value={s.ticker}>{s.ticker}</option>)}
                <option value="__custom__">Custom...</option>
              </select>
            </div>
            {(!stocks.find((s: any) => s.ticker === form.ticker) || form.ticker === '') && (
              <Input
                type="text"
                placeholder="TICKER"
                value={form.ticker}
                onChange={e => set('ticker', e.target.value.toUpperCase())}
                className="h-8 text-xs mt-1"
              />
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Asset Name</label>
            <Input
              type="text"
              placeholder="Company name"
              value={form.asset_name}
              onChange={e => set('asset_name', e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Planned Date</label>
            <Input
              type="date"
              value={form.planned_date}
              onChange={e => set('planned_date', e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Amount AUD</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.amount_aud}
              onChange={e => set('amount_aud', parseFloat(e.target.value) || 0)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Units (optional)</label>
            <Input
              type="number"
              step="0.001"
              min="0"
              value={form.units ?? ''}
              onChange={e => set('units', e.target.value ? parseFloat(e.target.value) : null)}
              className="h-8 text-xs"
              placeholder="Optional"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground block mb-1">Notes</label>
            <Input
              type="text"
              placeholder="Optional notes..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <Button
            onClick={() => onSave(form)}
            disabled={isSaving}
            style={{ background: "linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))", color: "hsl(224,40%,8%)", border: "none" }}
            className="text-xs h-8"
          >
            {isSaving ? "Saving..." : "Save Order"}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel} className="text-xs h-8">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function StocksPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { privacyMode, chartView } = useAppStore();
  const fa = useForecastAssumptions();

  // Holdings state
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<any>({
    ticker: "", name: "", current_price: "", current_holding: "",
    allocation_pct: 0, expected_return: 12, monthly_dca: 0,
    annual_lump_sum: 0, projection_years: 10,
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<any>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Transaction state
  const [showTxForm, setShowTxForm] = useState(false);
  const [txDraft, setTxDraft] = useState<Partial<StockTransaction>>(emptyTxForm());
  const [editingTxId, setEditingTxId] = useState<number | null>(null);

  // Filter state
  const [txTypeFilter, setTxTypeFilter] = useState<"all" | "buy" | "sell">("all");
  const [txStatusFilter, setTxStatusFilter] = useState<"all" | "actual" | "planned">("all");
  const [txDateFrom, setTxDateFrom] = useState("");
  const [txDateTo, setTxDateTo] = useState("");
  const [txTickerFilter, setTxTickerFilter] = useState("all");

  const handleDraftChange = useCallback((d: any) => setDraft(d), []);
  const handleEditDraftChange = useCallback((d: any) => setEditDraft(d), []);

  // Live price state — sourced from multi-source engine (marketData.ts)
  const [livePrices, setLivePrices] = useState<Record<string, PriceEntry>>({});
  const [fetchingPrices, setFetchingPrices] = useState(false);
  const [lastPriceFetch, setLastPriceFetch] = useState<number | null>(null);

  // Import / DCA state
  const [showImportModal, setShowImportModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'portfolio' | 'transactions' | 'dca' | 'orders' | 'cashflow'>('portfolio');
  const [showDCAForm, setShowDCAForm] = useState(false);
  const [dcaDraft, setDcaDraft] = useState<any>(null);
  const [editingDCAId, setEditingDCAId] = useState<number | null>(null);

  // Planned Orders state
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderDraft, setOrderDraft] = useState<any>(null);
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  // ─── cashEngine dependencies ────────────────────────────────────────────
  const { data: snapshot } = useQuery<any>({ queryKey: ["/api/snapshot"], queryFn: () => apiRequest("GET", "/api/snapshot").then(r => r.json()) });
  const { data: expenses = [] } = useQuery<any[]>({ queryKey: ["/api/expenses"], queryFn: () => apiRequest("GET", "/api/expenses").then(r => r.json()) });
  const { data: bills = [] } = useQuery<any[]>({ queryKey: ["/api/bills"], queryFn: () => apiRequest("GET", "/api/bills").then(r => r.json()) });
  const { data: properties = [] } = useQuery<any[]>({ queryKey: ["/api/properties"], queryFn: () => apiRequest("GET", "/api/properties").then(r => r.json()) });
  const { data: cryptos = [] } = useQuery<any[]>({ queryKey: ["/api/crypto"], queryFn: () => apiRequest("GET", "/api/crypto").then(r => r.json()) });
  const { data: plannedStockOrders = [] } = useQuery<any[]>({ queryKey: ["/api/planned-investments", "stock"], queryFn: () => apiRequest("GET", "/api/planned-investments?module=stock").then(r => r.json()) });
  const { data: plannedCryptoOrders = [] } = useQuery<any[]>({ queryKey: ["/api/planned-investments", "crypto"], queryFn: () => apiRequest("GET", "/api/planned-investments?module=crypto").then(r => r.json()) });
    const { data: stocks = [] } = useQuery<any[]>({
    queryKey: ["/api/stocks"],
    queryFn: () => apiRequest("GET", "/api/stocks").then(r => r.json()),
  });

  const { data: transactions = [] } = useQuery<StockTransaction[]>({
    queryKey: ["/api/stock-transactions"],
    queryFn: () => apiRequest("GET", "/api/stock-transactions").then(r => r.json()),
  });

  const { data: dcaSchedules = [] } = useQuery<StockDCASchedule[]>({
    queryKey: ["/api/stock-dca"],
    queryFn: () => apiRequest("GET", "/api/stock-dca").then(r => r.json()),
  });

  const { data: plannedOrders = [] } = useQuery<any[]>({
    queryKey: ['/api/planned-investments', 'stock'],
    queryFn: () => apiRequest("GET", "/api/planned-investments?module=stock").then(r => r.json()),
    staleTime: 0,
  });

  // ── Live price fetch handler (multi-source: Yahoo → Stooq fallback) ─────
  const handleFetchLivePrices = useCallback(async () => {
    if (stocks.length === 0 || fetchingPrices) return;
    setFetchingPrices(true);
    const tickers = stocks.map((s: any) => s.ticker).filter(Boolean);
    const results = await fetchAllStockPrices(
      tickers,
      (ticker, entry) => setLivePrices(prev => ({ ...prev, [ticker]: entry }))
    );
    setLivePrices(prev => ({ ...prev, ...results }));
    setLastPriceFetch(Date.now());
    setFetchingPrices(false);
    const fetched = Object.keys(results).length;
    const failed  = tickers.filter((t: string) => !results[t]);
    if (failed.length > 0) console.warn("[Stocks] Failed to fetch prices for:", failed);
    toast({
      title: "Live prices updated",
      description: `${fetched}/${tickers.length} tickers updated${failed.length > 0 ? ` · ${failed.join(", ")} stale` : ""}.`,
    });
  }, [stocks, fetchingPrices, toast]);
  // ── Bulk import handler ────────────────────────────────────────────────────
  const handleBulkImport = useCallback(async (rows: ImportRow[]) => {
    let imported = 0;
    for (const r of rows) {
      await apiRequest("POST", "/api/stocks", normaliseStock({
        ticker: r.ticker, name: r.name,
        current_holding: r.units, annual_lump_sum: r.avgBuyPrice,
        current_price: r.currentPrice, expected_return: r.expectedReturn,
        monthly_dca: r.monthlyDCA, allocation_pct: r.allocationPct,
        projection_years: 10,
      }));
      imported++;
    }
    await qc.invalidateQueries({ queryKey: ["/api/stocks"] });
    toast({ title: "Import complete", description: `${imported} stocks imported successfully.` });
  }, [qc, toast]);

  // ── DCA mutations ─────────────────────────────────────────────────────────
  const createDCAMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/stock-dca", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stock-dca"] });
      setShowDCAForm(false); setDcaDraft(null);
      toast({ title: "DCA schedule saved" });
    },
    onError: (err: any) => {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    },
  });
  const updateDCAMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest("PUT", `/api/stock-dca/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stock-dca"] });
      setShowDCAForm(false); setEditingDCAId(null); setDcaDraft(null);
      toast({ title: "DCA schedule updated" });
    },
    onError: (err: any) => {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    },
  });
  const deleteDCAMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/stock-dca/${id}`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/stock-dca"] }),
    onError: (err: any) => {
      toast({ title: 'Delete failed', description: String(err), variant: 'destructive' });
    },
  });

  // ── Holdings mutations ─────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/stocks", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stocks"] });
      setShowAdd(false);
      setDraft({ ticker: "", name: "", current_price: "", current_holding: "", allocation_pct: 0, expected_return: 12, monthly_dca: 0, annual_lump_sum: 0, projection_years: 10 });
      toast({ title: "Holding saved", description: "Stock added to portfolio." });
    },
    onError: (err: any) => toast({ title: 'Save failed', description: String(err?.message || err), variant: 'destructive' }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) =>
      apiRequest("PUT", `/api/stocks/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stocks"] });
      setEditingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/stocks/${id}`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/stocks"] }),
  });

  // ── Transaction mutations ──────────────────────────────────────────────────

  const createTxMut = useMutation({
    mutationFn: (data: Partial<StockTransaction>) =>
      apiRequest("POST", "/api/stock-transactions", data).then(r => r.json()),
    onSuccess: async (saved: any) => {
      setShowTxForm(false);
      setEditingTxId(null);
      setTxDraft(emptyTxForm());
      // Refetch from Supabase to confirm the row is visible
      await qc.refetchQueries({ queryKey: ["/api/stock-transactions"] });
      const current = qc.getQueryData<StockTransaction[]>(["/api/stock-transactions"]) ?? [];
      const found = current.some((t: any) => t.id === saved?.id);
      if (found) {
        toast({ title: "Transaction saved", description: "Stock transaction recorded." });
      } else {
        toast({ title: "Saved to database but not visible — table/filter mismatch", variant: "destructive" });
      }
    },
    onError: (err) => {
      toast({ title: "Error saving transaction", description: String(err), variant: "destructive" });
    },
  });

  const updateTxMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<StockTransaction> }) =>
      apiRequest("PUT", `/api/stock-transactions/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stock-transactions"] });
      setShowTxForm(false);
      setEditingTxId(null);
      setTxDraft(emptyTxForm());
      toast({ title: "Transaction updated" });
    },
  });

  const deleteTxMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/stock-transactions/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stock-transactions"] });
      toast({ title: "Transaction deleted" });
    },
  });

  // ── Planned Order mutations ────────────────────────────────────────────────

  const createOrderMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/planned-investments", data).then(r => r.json()),
    onSuccess: async (newOrder: any) => {
      // 1. Optimistically patch the cache so the table updates instantly
      qc.setQueryData(['/api/planned-investments', 'stock'], (old: any[] = []) => [...old, newOrder]);
      // 2. Close the modal
      setShowOrderForm(false); setOrderDraft(null); setEditingOrderId(null);
      toast({ title: "Planned order saved" });
      // 3. Background sync — refetch from Supabase to confirm and update dashboard/timeline
      await qc.refetchQueries({ queryKey: ['/api/planned-investments'] });
    },
    onError: (err: any) => {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    },
  });

  const updateOrderMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest("PUT", `/api/planned-investments/${id}`, data).then(r => r.json()),
    onSuccess: async (updatedOrder: any) => {
      // Optimistically patch the cache
      qc.setQueryData(['/api/planned-investments', 'stock'], (old: any[] = []) =>
        old.map((o: any) => (o.id === updatedOrder?.id ? updatedOrder : o))
      );
      setShowOrderForm(false); setOrderDraft(null); setEditingOrderId(null);
      toast({ title: "Planned order updated" });
      await qc.refetchQueries({ queryKey: ['/api/planned-investments'] });
    },
    onError: (err: any) => {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    },
  });

  const deleteOrderMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/planned-investments/${id}`).then(r => r.json()),
    onSuccess: async (_: any, id: number) => {
      // Optimistically remove from cache
      qc.setQueryData(['/api/planned-investments', 'stock'], (old: any[] = []) =>
        old.filter((o: any) => o.id !== id)
      );
      toast({ title: "Planned order deleted" });
      await qc.refetchQueries({ queryKey: ['/api/planned-investments'] });
    },
    onError: (err: any) => {
      toast({ title: 'Delete failed', description: String(err), variant: 'destructive' });
    },
  });

  // ── Portfolio-level calcs ──────────────────────────────────────────────────

  const totalCurrentValue = useMemo(
    () => stocks.reduce((s: number, st: any) => s + safeNum(st.current_holding) * safeNum(st.current_price), 0),
    [stocks]
  );

  const totalInvested = useMemo(
    () => stocks.reduce((s: number, st: any) => s + safeNum(st.current_holding) * safeNum(st.annual_lump_sum), 0),
    [stocks]
  );

  const totalGL = totalCurrentValue - totalInvested;
  const totalGLPct = totalInvested > 0 ? (totalGL / totalInvested) * 100 : 0;

  // ── Transaction-derived KPIs ───────────────────────────────────────────────
  const today = todayStr();

  const plannedBuys = useMemo(
    () => transactions.filter(t => t.status === "planned" && t.transaction_type === "buy"),
    [transactions]
  );
  const plannedSells = useMemo(
    () => transactions.filter(t => t.status === "planned" && t.transaction_type === "sell"),
    [transactions]
  );

  const plannedBuyTotal = useMemo(
    () => plannedBuys.reduce((s, t) => s + safeNum(t.total_amount), 0),
    [plannedBuys]
  );
  const plannedSellTotal = useMemo(
    () => plannedSells.reduce((s, t) => s + safeNum(t.total_amount), 0),
    [plannedSells]
  );
  const netCashImpact = plannedSellTotal - plannedBuyTotal;

  // ── Cash Engine — central cashflow (wired to DCA schedules) ─────────────
  const cashEngineOut = snapshot ? runCashEngine({
    snapshot,
    properties: properties ?? [],
    stocks: stocksData ?? [],
    cryptos: cryptos ?? [],
    expenses,
    bills,
    stockDCASchedules,
    cryptoDCASchedules,
    plannedStockOrders,
    plannedCryptoOrders,
    inflationRate:    fa?.inflation_pct    ?? 3,
    incomeGrowthRate: fa?.income_growth_pct ?? 3.5,
  }) : null;

    // ── Combined projection ────────────────────────────────────────────────────
  // Single stateful forward pass — each asset's running value is carried
  // year-over-year so DCA ending does NOT cause a cliff/drop.
  // Includes: current holdings + planned orders + DCA schedules.
  const combinedProjection = useMemo(() => {
    const years = 10;
    const currentYear = new Date().getFullYear();
    const defaultReturn = fa.flat.stocks_return || 10;
    const holdingTickers = new Set(stocks.map((s: any) => s.ticker));

    // Initialise per-asset running state (value + totalInvested)
    // Key = ticker string (or '__unknown__' for no-ticker orders)
    type AssetState = { running: number; invested: number; monthlyRate: number; };
    const assetState = new Map<string, AssetState>();

    // Seed from existing holdings
    for (const s of stocks) {
      const initVal = safeNum(s.current_holding) * safeNum(s.current_price);
      const rate = (safeNum(s.expected_return) > 0 ? safeNum(s.expected_return) : defaultReturn) / 100 / 12;
      assetState.set(s.ticker, { running: initVal, invested: initVal, monthlyRate: rate });
    }

    // Seed virtual assets from orphan planned orders (tickers not in holdings)
    const orphanOrderTickers = new Set<string>();
    for (const o of plannedOrders) {
      const key = o.ticker || '__unknown__';
      if (o.status === 'planned' && o.action === 'buy' && !holdingTickers.has(key)) {
        orphanOrderTickers.add(key);
        if (!assetState.has(key))
          assetState.set(key, { running: 0, invested: 0, monthlyRate: defaultReturn / 100 / 12 });
      }
    }

    // Seed virtual assets from orphan DCA schedules (tickers not in holdings)
    for (const d of dcaSchedules) {
      if (!d.enabled) continue;
      const key = (d as any).ticker || '__dcaUnknown__';
      if (!holdingTickers.has(key) && !assetState.has(key))
        assetState.set(key, { running: 0, invested: 0, monthlyRate: defaultReturn / 100 / 12 });
    }

    const result: { year: string; value: number; invested: number; }[] = [];

    for (let y = 1; y <= years; y++) {
      const projYear = currentYear + y;
      let yearTotalVal = 0;
      let yearTotalInv = 0;

      for (const [key, state] of assetState) {
        const isHolding = holdingTickers.has(key);
        const holdingRow = isHolding ? stocks.find((s: any) => s.ticker === key) : null;

        // ── One-time planned order injections this year ────────────────────
        // Legacy transactions table
        const legacyBuys = transactions
          .filter(t => t.status === 'planned' && t.transaction_type === 'buy' &&
            t.ticker === key && new Date(t.transaction_date).getFullYear() === projYear)
          .reduce((s, t) => s + safeNum(t.total_amount), 0);
        // New planned orders table
        const orderBuys = plannedOrders
          .filter((o: any) => o.status === 'planned' && o.action === 'buy' &&
            (o.ticker === key || (!o.ticker && key === '__unknown__')) &&
            new Date(o.planned_date).getFullYear() === projYear)
          .reduce((s: number, o: any) => s + safeNum(o.amount_aud), 0);
        const injectionThisYear = legacyBuys + orderBuys;
        state.running  += injectionThisYear;
        state.invested += injectionThisYear;

        // ── Monthly DCA for this year (only months in DCA window) ─────────
        const holdingDCA = holdingRow ? safeNum(holdingRow.monthly_dca) : 0;
        const scheduleDCA = dcaSchedules
          .filter((d: StockDCASchedule) => {
            if (!d.enabled) return false;
            const dcaStart = new Date(d.start_date).getFullYear();
            const dcaEnd   = d.end_date ? new Date(d.end_date).getFullYear() : 9999;
            return projYear >= dcaStart && projYear <= dcaEnd &&
              ((d as any).ticker === key || !(d as any).ticker);
          })
          .reduce((s: number, d: StockDCASchedule) => s + dcaMonthlyEquiv(d.amount, d.frequency), 0);
        const monthlyDCA = holdingDCA + scheduleDCA;

        // ── Compound 12 months, adding DCA each month ────────────────────
        for (let m = 0; m < 12; m++) {
          state.running   = state.running * (1 + state.monthlyRate) + monthlyDCA;
          state.invested += monthlyDCA;
        }

        yearTotalVal += state.running;
        yearTotalInv += state.invested;
      }

      result.push({
        year: projYear.toString(),
        value: Math.round(yearTotalVal),
        invested: Math.round(yearTotalInv),
      });
    }
    return result;
  }, [stocks, transactions, plannedOrders, dcaSchedules, fa]);

  const year10Val = combinedProjection[9]?.value || 0;
  const cagr = calcCAGR(totalCurrentValue || 1, year10Val || 1, 10);

  const allocationData = stocks
    .map((s: any, i: number) => {
      const val = safeNum(s.current_holding) * safeNum(s.current_price);
      return { name: s.ticker, value: val || 0, color: COLORS[i % COLORS.length] };
    })
    .filter((d: any) => d.value > 0);

  // ── Filtered transactions ──────────────────────────────────────────────────
  const allTickers = useMemo(() => {
    const tickers = new Set(transactions.map(t => t.ticker));
    return Array.from(tickers).filter(Boolean).sort();
  }, [transactions]);

  const filteredTx = useMemo(() => {
    return transactions
      .filter(t => {
        if (txTypeFilter !== "all" && t.transaction_type !== txTypeFilter) return false;
        if (txStatusFilter !== "all" && t.status !== txStatusFilter) return false;
        if (txDateFrom && t.transaction_date < txDateFrom) return false;
        if (txDateTo && t.transaction_date > txDateTo) return false;
        if (txTickerFilter !== "all" && t.ticker !== txTickerFilter) return false;
        return true;
      })
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
  }, [transactions, txTypeFilter, txStatusFilter, txDateFrom, txDateTo, txTickerFilter]);

  // ── Planned Orders KPIs ────────────────────────────────────────────────────
  const orderBuyTotal = useMemo(
    () => plannedOrders.filter(o => o.action === 'buy' && o.status === 'planned').reduce((s: number, o: any) => s + safeNum(o.amount_aud), 0),
    [plannedOrders]
  );
  const orderSellTotal = useMemo(
    () => plannedOrders.filter(o => o.action === 'sell' && o.status === 'planned').reduce((s: number, o: any) => s + safeNum(o.amount_aud), 0),
    [plannedOrders]
  );
  const ordersByStatus = useMemo(() => {
    const counts: Record<string, number> = { planned: 0, executed: 0, cancelled: 0 };
    for (const o of plannedOrders) { counts[o.status] = (counts[o.status] || 0) + 1; }
    return counts;
  }, [plannedOrders]);

  // ── DCA monthly total ──────────────────────────────────────────────────────
  const dcaMonthlyTotal = useMemo(
    () => dcaSchedules.filter(d => d.enabled).reduce((s, d) => s + dcaMonthlyEquiv(d.amount, d.frequency), 0),
    [dcaSchedules]
  );

  const mv = (v: string) => maskValue(v, privacyMode);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSaveEdit = () => {
    if (!editDraft || !editingId) return;
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      updateMut.mutateAsync({ id: editingId, data: normaliseStock(editDraft) });
    }, 100);
  };

  const handleSaveTx = (data: Partial<StockTransaction>) => {
    if (editingTxId) {
      updateTxMut.mutate({ id: editingTxId, data });
    } else {
      createTxMut.mutate(data);
    }
  };

  const handleEditTx = (tx: StockTransaction) => {
    setTxDraft({ ...tx });
    setEditingTxId(tx.id);
    setShowTxForm(true);
  };

  const handleSaveOrder = (data: any) => {
    const payload = { ...data, module: 'stock' };
    if (editingOrderId) {
      updateOrderMut.mutate({ id: editingOrderId, data: payload });
    } else {
      createOrderMut.mutate(payload);
    }
  };

  const handleToggleOrderStatus = (order: any) => {
    const nextStatus = order.status === 'planned' ? 'executed' : order.status === 'executed' ? 'cancelled' : 'planned';
    updateOrderMut.mutate({ id: order.id, data: { ...order, status: nextStatus } });
  };

  const handleExportBackup = () => {
    const wb = XLSX.utils.book_new();
    const selectedStocks = stocks.filter((s: any) => selected.has(s.id));
    const headers = ["Ticker", "Name", "Units", "Avg Buy Price", "Current Price", "Current Value", "Total Invested", "Unrealised G/L", "G/L %", "Expected Return", "Monthly DCA"];
    const rows = selectedStocks.map((s: any) => {
      const c = stockCalcs(s, totalCurrentValue);
      return [s.ticker, s.name, c.units, c.avgBuyPrice, c.currentPrice, c.currentValue, c.totalInvested, c.unrealisedGL, c.unrealisedGLPct.toFixed(1) + "%", s.expected_return, s.monthly_dca];
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), "Stocks Backup");
    XLSX.writeFile(wb, `Stocks_Backup_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Backup exported", description: `${selectedStocks.length} stocks saved to Excel.` });
  };

  return (
    <div className="space-y-5 pb-8">

      {/* ─── Bulk Import Modal ─────────────────────────────────────────────── */}
      {showImportModal && (
        <BulkImportModal
          onImport={handleBulkImport}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* ─── Transaction Form Modal ─────────────────────────────────────────── */}
      {showTxForm && (
        <StockTxForm
          initial={txDraft}
          stocks={stocks}
          onSave={handleSaveTx}
          onCancel={() => { setShowTxForm(false); setEditingTxId(null); setTxDraft(emptyTxForm()); }}
          isSaving={createTxMut.isPending || updateTxMut.isPending}
        />
      )}

      {/* ─── Planned Order Form Modal ────────────────────────────────────────── */}
      {showOrderForm && orderDraft && (
        <PlannedOrderForm
          initial={orderDraft}
          stocks={stocks}
          onSave={handleSaveOrder}
          onCancel={() => { setShowOrderForm(false); setOrderDraft(null); setEditingOrderId(null); }}
          isSaving={createOrderMut.isPending || updateOrderMut.isPending}
        />
      )}

      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Stock Portfolio</h1>
          <p className="text-muted-foreground text-sm">US & International equities — transaction ledger & DCA planning</p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-1.5">
            <Button
              onClick={handleFetchLivePrices}
              variant="outline"
              size="sm"
              disabled={fetchingPrices}
              className="gap-2 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${fetchingPrices ? 'animate-spin' : ''}`} />
              {fetchingPrices ? "Fetching..." : "Live Prices"}
            </Button>
            {lastPriceFetch && (
              <span className={`text-xs flex items-center gap-1 ${
                isStaleByAge(lastPriceFetch) ? 'text-amber-400' : 'text-muted-foreground'
              }`}>
                {isStaleByAge(lastPriceFetch) && <span title="Stale">⚠</span>}
                {formatLastUpdated(lastPriceFetch)}
              </span>
            )}
          </div>
          <Button
            onClick={() => setShowImportModal(true)}
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
          >
            <Upload className="w-3.5 h-3.5" /> Import
          </Button>
          <Button
            onClick={() => { setShowAdd(true); setActiveTab('portfolio'); }}
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Add Holding
          </Button>
          <Button
            onClick={() => { setTxDraft(emptyTxForm()); setEditingTxId(null); setShowTxForm(true); }}
            className="gap-2 text-xs"
            style={{ background: "linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))", color: "hsl(224,40%,8%)", border: "none" }}
          >
            <Plus className="w-3.5 h-3.5" /> Add Transaction
          </Button>
        </div>
      </div>

      {/* ─── Tab Bar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 bg-secondary/50 rounded-xl p-1 w-fit flex-wrap">
        {([
          ['portfolio', 'Portfolio'],
          ['transactions', 'Transactions'],
          ['dca', 'DCA Schedules'],
          ['orders', 'Planned Orders'],
          ['cashflow', 'Cash Flow'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeTab === id ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ─── Portfolio Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'portfolio' && (
        <>
          {/* ─── 7 KPI Cards ───────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: "Portfolio Value", value: mv(formatCurrency(totalCurrentValue, true)), color: "" },
              { label: "Cost Basis", value: mv(formatCurrency(totalInvested, true)), color: "" },
              {
                label: "Unrealised G/L",
                value: mv(`${totalGL >= 0 ? "+" : ""}${formatCurrency(totalGL, true)}`),
                color: totalGL >= 0 ? "text-emerald-400" : "text-red-400",
              },
              {
                label: "G/L %",
                value: mv(`${totalGLPct >= 0 ? "+" : ""}${totalGLPct.toFixed(1)}%`),
                color: totalGLPct >= 0 ? "text-emerald-400" : "text-red-400",
              },
              {
                // Combines legacy transactions (planned status) + new planned orders table
                label: "Planned Buys",
                value: mv(formatCurrency(plannedBuyTotal + orderBuyTotal, true)),
                color: "text-emerald-400",
              },
              {
                label: "Planned Sells",
                value: mv(formatCurrency(plannedSellTotal + orderSellTotal, true)),
                color: "text-red-400",
              },
              {
                // Net cash impact = sells - buys (across both tables)
                label: "Net Cash Impact",
                value: mv(`${(plannedSellTotal + orderSellTotal - plannedBuyTotal - orderBuyTotal) >= 0 ? "+" : ""}${formatCurrency(plannedSellTotal + orderSellTotal - plannedBuyTotal - orderBuyTotal, true)}`),
                color: (plannedSellTotal + orderSellTotal - plannedBuyTotal - orderBuyTotal) >= 0 ? "text-emerald-400" : "text-red-400",
              },
            ].map(s => (
              <div key={s.label} className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-base font-bold num-display mt-1 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* ─── Charts row ────────────────────────────────────────────────────── */}
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-bold mb-4">Portfolio Growth (10Y)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={combinedProjection} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(43,85%,55%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(43,85%,55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: "hsl(220,10%,55%)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(220,10%,55%)" }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="value" stroke="hsl(43,85%,55%)" fill="url(#stockGrad)" strokeWidth={2} name="Portfolio Value" />
                  <Area type="monotone" dataKey="invested" stroke="hsl(188,60%,48%)" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="Total Invested" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-bold mb-4">Current Allocation</h3>
              {allocationData.length > 0 ? (
                <div className="flex items-center gap-3">
                  <ResponsiveContainer width="45%" height={180}>
                    <PieChart>
                      <Pie
                        data={allocationData}
                        cx="50%" cy="50%"
                        innerRadius={45} outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {allocationData.map((d: any, i: number) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => mv(formatCurrency(v, true))} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-1.5 text-xs overflow-hidden">
                    {allocationData.map((d: any) => {
                      const stock = stocks.find((s: any) => s.ticker === d.name);
                      const targetAlloc = safeNum(stock?.allocation_pct);
                      const actualPct = totalCurrentValue > 0 ? (d.value / totalCurrentValue) * 100 : 0;
                      const diff = actualPct - targetAlloc;
                      return (
                        <div key={d.name} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                            <span className="text-muted-foreground truncate">{d.name}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-bold num-display">{mv(formatCurrency(d.value, true))}</span>
                            <span className="text-muted-foreground ml-1">({actualPct.toFixed(1)}%)</span>
                            {targetAlloc > 0 && (
                              <span className={`ml-1 ${diff > 0 ? "text-red-400" : "text-emerald-400"}`}>
                                {diff > 0 ? "+" : ""}{diff.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
                  <TrendingUp className="w-8 h-8 opacity-30 mb-2" />
                  <p>Set holdings above zero to see allocation</p>
                </div>
              )}
            </div>
          </div>

          {/* ─── Add Holding Form ───────────────────────────────────────────────── */}
          {showAdd && (
            <div className="rounded-xl border border-primary/30 bg-card p-5">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4 text-primary" /> Add Stock Holding
              </h3>
              <StockEditForm
                data={draft}
                onChange={handleDraftChange}
                onEnterSave={() => createMut.mutateAsync(normaliseStock(draft))}
              />
              <div className="flex gap-2 mt-4">
                <SaveButton
                  label="Save Stock Holding"
                  onSave={() => createMut.mutateAsync(normaliseStock(draft))}
                />
                <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {/* ─── Bulk toolbar ───────────────────────────────────────────────────── */}
          {selected.size > 0 && (
            <div
              className="flex items-center gap-3 flex-wrap rounded-xl border px-4 py-2.5 text-sm"
              style={{ borderColor: "hsl(0,72%,35%)", background: "hsl(0,50%,8%)" }}
            >
              <span className="text-red-300 font-semibold">{selected.size} selected</span>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="text-xs h-7 text-muted-foreground">Clear</Button>
              <div className="flex-1" />
              <Button size="sm" onClick={handleExportBackup} variant="outline" className="text-xs h-7 gap-1">Export Selected</Button>
              <Button
                size="sm"
                onClick={() => setShowBulkModal(true)}
                className="gap-1.5 bg-red-600 hover:bg-red-700 text-white border-0 h-7 text-xs"
              >
                <Trash2 className="w-3 h-3" /> Delete {selected.size} stocks
              </Button>
            </div>
          )}

          {/* ─── Current Holdings Table ─────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold">Current Holdings</h3>
              {stocks.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-7 gap-1 text-muted-foreground"
                  onClick={() =>
                    selected.size === stocks.length
                      ? setSelected(new Set())
                      : setSelected(new Set(stocks.map((s: any) => s.id)))
                  }
                >
                  {selected.size === stocks.length ? (
                    <CheckSquare className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  Select all
                </Button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="px-3 py-2.5 w-8"></th>
                    {[
                      "Stock", "Units", "Avg Buy", "Stored Price", "Live Price", "Daily Δ", "Value",
                      "Invested", "Gain/Loss", "G/L %", "Alloc (Act/Tgt)", "10Y Value", "DCA", "Actions",
                    ].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stocks.length === 0 && (
                    <tr>
                      <td colSpan={13} className="px-3 py-8 text-center text-xs text-muted-foreground">
                        No stocks added yet. Click "Add Holding" to get started.
                      </td>
                    </tr>
                  )}
                  {stocks.map((stock: any, idx: number) => {
                    const c = stockCalcs(stock, totalCurrentValue);
                    const isEditing = editingId === stock.id;
                    const isSelected = selected.has(stock.id);
                    const proj = projectInvestment(c.currentValue, stock.expected_return, stock.monthly_dca || 0, 10);
                    const proj10 = proj[9]?.value || c.currentValue;

                    if (isEditing && editDraft) {
                      return (
                        <tr key={stock.id} className="border-b border-border bg-secondary/20">
                          <td colSpan={13} className="p-3">
                            <StockEditForm
                              data={editDraft}
                              onChange={handleEditDraftChange}
                              onEnterSave={handleSaveEdit}
                            />
                            <div className="flex gap-2 mt-3">
                              <SaveButton
                                label="Save Stock Holding"
                                onSave={() => updateMut.mutateAsync({ id: stock.id, data: normaliseStock(editDraft) })}
                              />
                              <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={stock.id}
                        className={`border-b border-border/50 hover:bg-secondary/20 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                      >
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() =>
                              setSelected(prev => {
                                const n = new Set(prev);
                                n.has(stock.id) ? n.delete(stock.id) : n.add(stock.id);
                                return n;
                              })
                            }
                            className="flex items-center justify-center text-muted-foreground hover:text-foreground"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-3.5 h-3.5 text-primary" />
                            ) : (
                              <Square className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>

                        {/* Stock identity */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold shrink-0"
                              style={{
                                background: COLORS[idx % COLORS.length] + "20",
                                color: COLORS[idx % COLORS.length],
                              }}
                            >
                              {stock.ticker?.charAt(0) ?? "?"}
                            </div>
                            <div>
                              <p className="text-xs font-bold">{stock.ticker}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[100px]">{stock.name}</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-2.5 text-xs num-display">{c.units.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-xs num-display">{mv(formatCurrency(c.avgBuyPrice))}</td>
                        <td className="px-3 py-2.5 text-xs num-display">{mv(formatCurrency(c.currentPrice))}</td>
                        <td className="px-3 py-2.5 text-xs">
                          {livePrices[stock.ticker] ? (
                            <span className="num-display font-semibold">{mv(formatCurrency(livePrices[stock.ticker].price))}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {livePrices[stock.ticker] ? (
                            <span className={`num-display font-semibold ${livePrices[stock.ticker].change24h >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {livePrices[stock.ticker].change24h >= 0 ? '+' : ''}{livePrices[stock.ticker].change24h.toFixed(2)}%
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs num-display font-semibold">{mv(formatCurrency(c.currentValue, true))}</td>
                        <td className="px-3 py-2.5 text-xs num-display">{mv(formatCurrency(c.totalInvested, true))}</td>

                        {/* Gain/Loss */}
                        <td className={`px-3 py-2.5 text-xs num-display font-semibold ${c.unrealisedGL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          <div className="flex items-center gap-1">
                            {c.unrealisedGL >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {mv(`${c.unrealisedGL >= 0 ? "+" : ""}${formatCurrency(c.unrealisedGL, true)}`)}
                          </div>
                        </td>

                        {/* G/L % */}
                        <td className={`px-3 py-2.5 text-xs num-display font-semibold ${c.unrealisedGLPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {mv(`${c.unrealisedGLPct >= 0 ? "+" : ""}${c.unrealisedGLPct.toFixed(1)}%`)}
                        </td>

                        {/* Allocation actual / target */}
                        <td className="px-3 py-2.5 text-xs">
                          <div className="flex items-center gap-1 whitespace-nowrap">
                            <span className="num-display font-semibold">{mv(`${c.actualAllocPct.toFixed(1)}%`)}</span>
                            {c.targetAlloc > 0 && (
                              <>
                                <span className="text-muted-foreground">/</span>
                                <span className="text-muted-foreground">{mv(`${c.targetAlloc.toFixed(1)}%`)}</span>
                                <span className={`text-xs ml-0.5 ${c.allocDiff > 1 ? "text-red-400" : c.allocDiff < -1 ? "text-emerald-400" : "text-muted-foreground"}`}>
                                  ({c.allocDiff > 0 ? "+" : ""}{c.allocDiff.toFixed(1)}%)
                                </span>
                              </>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-2.5 text-xs num-display text-emerald-400">{mv(formatCurrency(proj10, true))}</td>
                        <td className="px-3 py-2.5 text-xs num-display text-primary">{mv(formatCurrency(stock.monthly_dca || 0))}</td>

                        <td className="px-3 py-2.5">
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="w-6 h-6"
                              onClick={() => { setEditingId(stock.id); setEditDraft({ ...stock }); }}
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="w-6 h-6 text-red-400"
                              onClick={() => { if (confirm("Delete this stock?")) deleteMut.mutate(stock.id); }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Footer totals */}
                {stocks.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border bg-secondary/20">
                      <td></td>
                      <td className="px-3 py-2.5 text-xs font-bold" colSpan={4}>TOTAL</td>
                      <td className="px-3 py-2.5 text-xs font-bold num-display">{mv(formatCurrency(totalCurrentValue, true))}</td>
                      <td className="px-3 py-2.5 text-xs font-bold num-display">{mv(formatCurrency(totalInvested, true))}</td>
                      <td className={`px-3 py-2.5 text-xs font-bold num-display ${totalGL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {mv(`${totalGL >= 0 ? "+" : ""}${formatCurrency(totalGL, true)}`)}
                      </td>
                      <td className={`px-3 py-2.5 text-xs font-bold num-display ${totalGLPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {mv(`${totalGLPct >= 0 ? "+" : ""}${totalGLPct.toFixed(1)}%`)}
                      </td>
                      <td colSpan={2}></td>
                      <td className="px-3 py-2.5 text-xs font-bold num-display text-emerald-400">{mv(formatCurrency(year10Val, true))}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* ─── Bulk Delete Modal ──────────────────────────────────────────────── */}
          <BulkDeleteModal
            open={showBulkModal}
            count={selected.size}
            label="stock holdings"
            onConfirm={async () => {
              const ids = Array.from(selected);
              for (const id of ids) await apiRequest("DELETE", `/api/stocks/${id}`);
              await qc.invalidateQueries({ queryKey: ["/api/stocks"] });
              setSelected(new Set());
              setShowBulkModal(false);
              toast({ title: `Deleted ${ids.length} stocks`, description: "Records removed from Supabase and local cache." });
            }}
            onCancel={() => setShowBulkModal(false)}
            onExportBackup={selected.size > 0 ? handleExportBackup : undefined}
          />

          {/* ─── Planned Future Transactions ────────────────────────────────────── */}
          {(plannedBuys.length > 0 || plannedSells.length > 0) && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                Planned Future Transactions
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {[...plannedBuys, ...plannedSells]
                  .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))
                  .map(tx => (
                    <div
                      key={tx.id}
                      className={`rounded-lg border p-3 ${
                        tx.transaction_type === "buy"
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-red-500/30 bg-red-500/5"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold">{tx.ticker}</span>
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                          tx.transaction_type === "buy"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        }`}>
                          {tx.transaction_type === "buy" ? "Buy" : "Sell"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">{tx.transaction_date}</p>
                      <p className="text-sm font-bold num-display">{mv(formatCurrency(safeNum(tx.total_amount), true))}</p>
                      {tx.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{tx.notes}</p>}
                      <div className="mt-2 pt-2 border-t border-border/50">
                        <span className="text-xs text-amber-400 font-semibold">Planned</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ─── 10-Year Projection Chart ───────────────────────────────────────── */}
          {combinedProjection.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold">10-Year Portfolio Projection</h3>
                <span className="text-xs text-muted-foreground">CAGR: <span className="text-primary font-bold">{cagr.toFixed(1)}%</span></span>
              </div>

              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={combinedProjection} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="projGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(43,85%,55%)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(43,85%,55%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: "hsl(220,10%,55%)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(220,10%,55%)" }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="value" stroke="hsl(43,85%,55%)" fill="url(#projGrad2)" strokeWidth={2} name="Portfolio Value" />
                  <Area type="monotone" dataKey="invested" stroke="hsl(188,60%,48%)" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="Total Invested" />
                </AreaChart>
              </ResponsiveContainer>

              <div className="overflow-x-auto mt-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left pb-2 pr-4 text-muted-foreground font-semibold">Year</th>
                      <th className="text-left pb-2 pr-4 text-muted-foreground font-semibold">Total Invested</th>
                      <th className="text-left pb-2 pr-4 text-muted-foreground font-semibold">Portfolio Value</th>
                      <th className="text-left pb-2 pr-4 text-muted-foreground font-semibold">Unrealised Gain</th>
                      <th className="text-left pb-2 pr-4 text-muted-foreground font-semibold">Gain %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinedProjection.map(p => {
                      const gain = p.value - p.invested;
                      const gainPct = p.invested > 0 ? (gain / p.invested) * 100 : 0;
                      return (
                        <tr key={p.year} className="border-b border-border/40 hover:bg-secondary/20">
                          <td className="py-1.5 pr-4 font-semibold text-primary">{p.year}</td>
                          <td className="py-1.5 pr-4 num-display">{mv(formatCurrency(p.invested, true))}</td>
                          <td className="py-1.5 pr-4 num-display text-emerald-400 font-bold">{mv(formatCurrency(p.value, true))}</td>
                          <td className={`py-1.5 pr-4 num-display font-semibold ${gain >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {mv(`${gain >= 0 ? "+" : ""}${formatCurrency(gain, true)}`)}
                          </td>
                          <td className={`py-1.5 pr-4 num-display ${gainPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {mv(`${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}%`)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Transactions Tab ──────────────────────────────────────────────── */}
      {activeTab === 'transactions' && (
        <div className="space-y-4">
          {/* Add Transaction button */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">Transaction Ledger</h3>
            <Button
              onClick={() => { setTxDraft(emptyTxForm()); setEditingTxId(null); setShowTxForm(true); }}
              className="gap-2 text-xs h-8"
              style={{ background: "linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))", color: "hsl(224,40%,8%)", border: "none" }}
            >
              <Plus className="w-3.5 h-3.5" /> Add Transaction
            </Button>
          </div>

          {/* ─── Transaction Ledger ─────────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-sm font-bold">All Transactions</h3>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Type filter */}
                <div className="flex rounded-lg overflow-hidden border border-border text-xs">
                  {(["all", "buy", "sell"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTxTypeFilter(t)}
                      className={`px-2.5 py-1 font-semibold transition-colors ${
                        txTypeFilter === t ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t === "all" ? "All" : t === "buy" ? "Buy" : "Sell"}
                    </button>
                  ))}
                </div>
                {/* Status filter */}
                <div className="flex rounded-lg overflow-hidden border border-border text-xs">
                  {(["all", "actual", "planned"] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setTxStatusFilter(s)}
                      className={`px-2.5 py-1 font-semibold transition-colors ${
                        txStatusFilter === s ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s === "all" ? "All" : s === "actual" ? "Actual" : "Planned"}
                    </button>
                  ))}
                </div>
                {/* Date range */}
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  <Input
                    type="date"
                    value={txDateFrom}
                    onChange={e => setTxDateFrom(e.target.value)}
                    className="h-7 text-xs w-32"
                    placeholder="From"
                  />
                  <span className="text-muted-foreground text-xs">–</span>
                  <Input
                    type="date"
                    value={txDateTo}
                    onChange={e => setTxDateTo(e.target.value)}
                    className="h-7 text-xs w-32"
                    placeholder="To"
                  />
                </div>
                {/* Ticker filter */}
                {allTickers.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Filter className="w-3 h-3 text-muted-foreground" />
                    <select
                      value={txTickerFilter}
                      onChange={e => setTxTickerFilter(e.target.value)}
                      className="h-7 text-xs bg-secondary border border-border rounded px-2 text-foreground"
                    >
                      <option value="all">All Tickers</option>
                      {allTickers.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    {["Date", "Type", "Status", "Ticker", "Units", "Price/Unit", "Total", "Fee", "Notes", "Actions"].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTx.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-xs text-muted-foreground">
                        No transactions found. Click "Add Transaction" to record a trade.
                      </td>
                    </tr>
                  )}
                  {filteredTx.map(tx => (
                    <tr key={tx.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                      <td className="px-3 py-2.5 text-xs num-display text-muted-foreground">{tx.transaction_date}</td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          tx.transaction_type === "buy"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-red-500/15 text-red-400"
                        }`}>
                          {tx.transaction_type === "buy" ? "Buy" : "Sell"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          tx.status === "actual"
                            ? "bg-blue-500/15 text-blue-400"
                            : "bg-amber-500/15 text-amber-400"
                        }`}>
                          {tx.status === "actual" ? "Actual" : "Planned"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-bold">{tx.ticker}</td>
                      <td className="px-3 py-2.5 text-xs num-display">{safeNum(tx.units).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-xs num-display">{mv(formatCurrency(safeNum(tx.price_per_unit)))}</td>
                      <td className="px-3 py-2.5 text-xs num-display font-semibold">{mv(formatCurrency(safeNum(tx.total_amount), true))}</td>
                      <td className="px-3 py-2.5 text-xs num-display text-muted-foreground">{mv(formatCurrency(safeNum(tx.brokerage_fee)))}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[120px] truncate">{tx.notes}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-6 h-6"
                            onClick={() => handleEditTx(tx)}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-6 h-6 text-red-400"
                            onClick={() => { if (confirm("Delete this transaction?")) deleteTxMut.mutate(tx.id); }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── DCA Schedules Tab ─────────────────────────────────────────────── */}
      {activeTab === 'dca' && (
        <div className="space-y-4">
          {/* DCA form modal */}
          {showDCAForm && dcaDraft && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-sm">{editingDCAId ? 'Edit DCA Schedule' : 'New DCA Schedule'}</h3>
                  <button onClick={() => { setShowDCAForm(false); setDcaDraft(null); setEditingDCAId(null); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Ticker</label>
                    <select
                      value={dcaDraft.ticker}
                      onChange={e => setDcaDraft((p: any) => ({ ...p, ticker: e.target.value, asset_name: e.target.value === '' ? p.asset_name : '' }))}
                      className="w-full h-8 text-xs bg-secondary border border-border rounded px-2 text-foreground"
                    >
                      {/* Default portfolio + any additional holdings loaded from DB */}
                      {['NVDA','GOOGL','MSFT','AVGO','CEG','CCJ','WPM','TSLA','OKLO','ANET'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                      {/* Any stocks in portfolio not already in the default list */}
                      {stocks
                        .filter((s: any) => !['NVDA','GOOGL','MSFT','AVGO','CEG','CCJ','WPM','TSLA','OKLO','ANET'].includes(s.ticker))
                        .map((s: any) => <option key={s.ticker} value={s.ticker}>{s.ticker} — {s.name}</option>)
                      }
                      <option value="">Custom...</option>
                    </select>
                  </div>
                  {dcaDraft.ticker === '' && (
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Custom Ticker</label>
                      <Input type="text" value={dcaDraft.asset_name} onChange={e => setDcaDraft((p: any) => ({ ...p, asset_name: e.target.value }))} className="h-8 text-xs" placeholder="e.g. AAPL" />
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Amount (AUD)</label>
                    <Input type="number" step="50" value={dcaDraft.amount} onChange={e => setDcaDraft((p: any) => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Frequency</label>
                    <select value={dcaDraft.frequency} onChange={e => setDcaDraft((p: any) => ({ ...p, frequency: e.target.value }))} className="w-full h-8 text-xs bg-secondary border border-border rounded px-2 text-foreground">
                      {['weekly','fortnightly','monthly','quarterly'].map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Start Date</label>
                    <Input type="date" value={dcaDraft.start_date} onChange={e => setDcaDraft((p: any) => ({ ...p, start_date: e.target.value }))} className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">End Date (optional)</label>
                    <Input type="date" value={dcaDraft.end_date ?? ''} onChange={e => setDcaDraft((p: any) => ({ ...p, end_date: e.target.value || null }))} className="h-8 text-xs" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground block mb-1">Notes</label>
                    <Input type="text" value={dcaDraft.notes} onChange={e => setDcaDraft((p: any) => ({ ...p, notes: e.target.value }))} className="h-8 text-xs" placeholder="Optional..." />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Enabled</label>
                    <button onClick={() => setDcaDraft((p: any) => ({ ...p, enabled: !p.enabled }))}>
                      {dcaDraft.enabled ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                    </button>
                    <span className="text-xs ml-2 text-muted-foreground">
                      Monthly equiv: {formatCurrency(dcaMonthlyEquiv(dcaDraft.amount, dcaDraft.frequency))}/mo
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <Button
                    onClick={() => {
                      // When custom ticker, use asset_name as the ticker value
                      const payload = { ...dcaDraft, ticker: dcaDraft.ticker || dcaDraft.asset_name };
                      if (!payload.ticker) { toast({ title: 'Ticker required', description: 'Enter a ticker symbol.', variant: 'destructive' }); return; }
                      editingDCAId ? updateDCAMut.mutate({ id: editingDCAId, data: payload }) : createDCAMut.mutate(payload);
                    }}
                    disabled={createDCAMut.isPending || updateDCAMut.isPending}
                    style={{ background: "linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))", color: "hsl(224,40%,8%)", border: "none" }}
                    className="text-xs h-8"
                  >
                    {createDCAMut.isPending || updateDCAMut.isPending ? 'Saving...' : 'Save Schedule'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowDCAForm(false); setDcaDraft(null); setEditingDCAId(null); }} className="text-xs h-8">Cancel</Button>
                </div>
              </div>
            </div>
          )}

          {/* DCA summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Active Schedules', value: String(dcaSchedules.filter(d => d.enabled).length) },
              { label: 'Total Monthly DCA', value: formatCurrency(dcaMonthlyTotal) },
              { label: 'Annual DCA Budget', value: formatCurrency(dcaMonthlyTotal * 12) },
              { label: 'Tickers Scheduled', value: String(new Set(dcaSchedules.filter(d => d.enabled).map(d => d.ticker)).size) },
            ].map(k => (
              <div key={k.label} className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-base font-bold num-display mt-1">{mv(k.value)}</p>
              </div>
            ))}
          </div>

          {/* Add button + table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold">DCA Schedules</h3>
              <Button
                size="sm"
                onClick={() => { setDcaDraft(emptyDCAForm(stocks.map((s: any) => s.ticker))); setEditingDCAId(null); setShowDCAForm(true); }}
                style={{ background: "linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))", color: "hsl(224,40%,8%)", border: "none" }}
                className="gap-2 text-xs h-7"
              >
                <Plus className="w-3 h-3" /> Add Schedule
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    {['Ticker','Amount','Frequency','Monthly Equiv','Start Date','End Date','Status','Notes','Actions'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dcaSchedules.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-8 text-center text-xs text-muted-foreground">No DCA schedules. Click "Add Schedule" to set up automated investing.</td></tr>
                  )}
                  {dcaSchedules.map(d => (
                    <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="px-3 py-2.5 text-xs font-bold text-primary">{d.ticker || d.asset_name}</td>
                      <td className="px-3 py-2.5 text-xs num-display">{mv(formatCurrency(d.amount))}</td>
                      <td className="px-3 py-2.5 text-xs capitalize">{d.frequency}</td>
                      <td className="px-3 py-2.5 text-xs num-display text-primary">{mv(formatCurrency(dcaMonthlyEquiv(d.amount, d.frequency)))}/mo</td>
                      <td className="px-3 py-2.5 text-xs num-display text-muted-foreground">{d.start_date}</td>
                      <td className="px-3 py-2.5 text-xs num-display text-muted-foreground">{d.end_date ?? 'Ongoing'}</td>
                      <td className="px-3 py-2.5 text-xs">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${d.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-secondary text-muted-foreground'}`}>
                          {d.enabled ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[120px] truncate">{d.notes}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="w-6 h-6" onClick={() => { setDcaDraft({ ...d }); setEditingDCAId(d.id); setShowDCAForm(true); }}><Edit2 className="w-3 h-3" /></Button>
                          <Button size="icon" variant="ghost" className="w-6 h-6 text-red-400" onClick={() => { if (confirm('Delete this DCA schedule?')) deleteDCAMut.mutate(d.id); }}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {dcaSchedules.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border bg-secondary/20">
                      <td className="px-3 py-2.5 text-xs font-bold" colSpan={3}>TOTAL (active)</td>
                      <td className="px-3 py-2.5 text-xs font-bold num-display text-primary">
                        {mv(formatCurrency(dcaMonthlyTotal))}/mo
                      </td>
                      <td colSpan={5}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* DCA Forecast Section */}
          {dcaMonthlyTotal > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                DCA Forecast Impact
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Monthly DCA Committed</p>
                  <p className="text-sm font-bold num-display text-primary mt-1">{mv(formatCurrency(dcaMonthlyTotal))}/mo</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">Annual DCA Committed</p>
                  <p className="text-sm font-bold num-display text-primary mt-1">{mv(formatCurrency(dcaMonthlyTotal * 12))}/yr</p>
                </div>
                <div className="bg-secondary/40 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">10-Year DCA Total (no returns)</p>
                  <p className="text-sm font-bold num-display text-emerald-400 mt-1">{mv(formatCurrency(dcaMonthlyTotal * 12 * 10))}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                DCA Impact: <span className="text-primary font-semibold">+{mv(formatCurrency(dcaMonthlyTotal))}/month</span> total committed DCA across {dcaSchedules.filter(d => d.enabled).length} active schedule{dcaSchedules.filter(d => d.enabled).length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      )}


      {/* ─── Cash Flow Tab (cashEngine wired) ─────────────────────────────── */}
      {activeTab === 'cashflow' && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="w-5 h-5 text-primary" />
              <div>
                <h3 className="font-bold text-sm">Cash Flow Impact of Stock DCA</h3>
                <p className="text-xs text-muted-foreground">Central cashEngine — includes all stock DCA schedules in household cash flow</p>
              </div>
            </div>
            {!cashEngineOut ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading cash engine data…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'Annual DCA Outflow', value: stockDCASchedules.filter((d: any) => d.enabled !== false).reduce((s: number, d: any) => {
                        const FREQ: Record<string, number> = { Weekly: 52/12, Fortnightly: 26/12, Monthly: 1, Quarterly: 1/3 };
                        return s + (d.amount || 0) * (FREQ[d.frequency] || 1) * 12;
                      }, 0) },
                    { label: 'This Year Net CF', value: cashEngineOut.annual[0]?.netCashFlow ?? 0 },
                    { label: 'Year 5 Net CF', value: cashEngineOut.annual[4]?.netCashFlow ?? 0 },
                    { label: 'Year 10 Net CF', value: cashEngineOut.annual[9]?.netCashFlow ?? 0 },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-secondary/40 rounded-xl p-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className={`text-base font-bold ${value >= 0 ? 'text-green-400' : 'text-red-400'}`}>{value >= 0 ? '' : '-'}{formatCurrency(Math.abs(value))}</p>
                    </div>
                  ))}
                </div>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={cashEngineOut.annual.map((a: any) => ({
                      year: a.year, netCF: Math.round(a.netCashFlow), closingCash: Math.round(a.endingCash)
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => `$${Math.abs(v) >= 1000 ? (v/1000).toFixed(0)+'K' : v}`} tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(v: any) => formatCurrency(v)}
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      />
                      <Area type="monotone" dataKey="netCF" name="Net Cash Flow" stroke="hsl(43,85%,55%)" fill="hsl(43,85%,25%)" fillOpacity={0.3} />
                      <Area type="monotone" dataKey="closingCash" name="Closing Cash" stroke="hsl(142,60%,45%)" fill="hsl(142,60%,20%)" fillOpacity={0.2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* ─── Planned Orders Tab ────────────────────────────────────────────── */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {/* KPI Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Total Planned Buy', value: mv(formatCurrency(orderBuyTotal, true)), color: 'text-emerald-400' },
              { label: 'Total Planned Sell', value: mv(formatCurrency(orderSellTotal, true)), color: 'text-red-400' },
              { label: 'Planned', value: String(ordersByStatus.planned || 0), color: 'text-amber-400' },
              { label: 'Executed', value: String(ordersByStatus.executed || 0), color: 'text-emerald-400' },
              { label: 'Cancelled', value: String(ordersByStatus.cancelled || 0), color: 'text-muted-foreground' },
            ].map(k => (
              <div key={k.label} className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`text-base font-bold num-display mt-1 ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Orders Table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-primary" />
                Planned Investment Orders
              </h3>
              <Button
                size="sm"
                onClick={() => { setOrderDraft(emptyOrderForm()); setEditingOrderId(null); setShowOrderForm(true); }}
                style={{ background: "linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))", color: "hsl(224,40%,8%)", border: "none" }}
                className="gap-2 text-xs h-7"
              >
                <Plus className="w-3 h-3" /> Add Order
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    {['Date','Ticker','Action','Amount AUD','Units','Status','Notes','Actions'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plannedOrders.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-xs text-muted-foreground">
                        No planned orders yet. Click "Add Order" to plan your next investment.
                      </td>
                    </tr>
                  )}
                  {[...plannedOrders]
                    .sort((a, b) => (a.planned_date ?? '').localeCompare(b.planned_date ?? ''))
                    .map((order: any) => (
                    <tr key={order.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                      <td className="px-3 py-2.5 text-xs num-display text-muted-foreground">{order.planned_date}</td>
                      <td className="px-3 py-2.5">
                        <div>
                          <p className="text-xs font-bold">{order.ticker}</p>
                          {order.asset_name && <p className="text-xs text-muted-foreground truncate max-w-[100px]">{order.asset_name}</p>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          order.action === 'buy'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-red-500/15 text-red-400'
                        }`}>
                          {order.action === 'buy' ? 'Buy' : 'Sell'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs num-display font-semibold">{mv(formatCurrency(safeNum(order.amount_aud), true))}</td>
                      <td className="px-3 py-2.5 text-xs num-display text-muted-foreground">
                        {order.units != null ? safeNum(order.units).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => handleToggleOrderStatus(order)}
                          title="Click to cycle status"
                          className="cursor-pointer"
                        >
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            order.status === 'planned'
                              ? 'bg-amber-500/15 text-amber-400'
                              : order.status === 'executed'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-secondary text-muted-foreground'
                          }`}>
                            {order.status === 'planned' ? 'Planned' : order.status === 'executed' ? 'Executed' : 'Cancelled'}
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[120px] truncate">{order.notes}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-6 h-6"
                            onClick={() => { setOrderDraft({ ...order }); setEditingOrderId(order.id); setShowOrderForm(true); }}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-6 h-6 text-red-400"
                            onClick={() => { if (confirm('Delete this planned order?')) deleteOrderMut.mutate(order.id); }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {plannedOrders.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border bg-secondary/20">
                      <td className="px-3 py-2.5 text-xs font-bold" colSpan={3}>TOTAL (planned only)</td>
                      <td className="px-3 py-2.5 text-xs font-bold num-display">
                        <span className="text-emerald-400">{mv(formatCurrency(orderBuyTotal, true))} buy</span>
                        <span className="text-muted-foreground mx-1">/</span>
                        <span className="text-red-400">{mv(formatCurrency(orderSellTotal, true))} sell</span>
                      </td>
                      <td colSpan={4}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── Portfolio Live Return ───────────────────────────────────────────── */}
      <PortfolioLiveReturn />

      {/* ─── AI Insights ───────────────────────────────────────────────────── */}
      <AIInsightsCard
        pageKey="stocks"
        pageLabel="Stocks Portfolio"
        getData={() => {
          if (!stocks?.length) return { count: 0 };
          return {
            stocks: stocks.map((s: any) => ({
              ticker: s.ticker,
              shares: safeNum(s.current_holding),
              avgBuy: safeNum(s.annual_lump_sum),
              current: safeNum(s.current_price),
              pnl: ((safeNum(s.current_price) - safeNum(s.annual_lump_sum)) * safeNum(s.current_holding)).toFixed(2),
            })),
            transactions: {
              total: transactions.length,
              actual: transactions.filter(t => t.status === "actual").length,
              planned: transactions.filter(t => t.status === "planned").length,
              plannedBuyTotal: plannedBuyTotal,
              plannedSellTotal: plannedSellTotal,
            },
          };
        }}
      />
    </div>
  );
}

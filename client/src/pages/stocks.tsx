import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, safeNum, projectInvestment, calcCAGR } from "@/lib/finance";
import { maskValue } from "@/components/PrivacyMask";
import { useAppStore } from "@/lib/store";
import SaveButton from "@/components/SaveButton";
import BulkDeleteModal from "@/components/BulkDeleteModal";
import { Button } from "@/components/ui/button";
import AIInsightsCard from "@/components/AIInsightsCard";
import { Input } from "@/components/ui/input";
import type { StockTransaction } from "@/lib/localStore";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Plus, Trash2, Edit2, TrendingUp, CheckSquare, Square,
  ArrowUpRight, ArrowDownRight, X, Calendar, Filter,
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function StocksPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { privacyMode, chartView } = useAppStore();

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

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: stocks = [] } = useQuery<any[]>({
    queryKey: ["/api/stocks"],
    queryFn: () => apiRequest("GET", "/api/stocks").then(r => r.json()),
  });

  const { data: transactions = [] } = useQuery<StockTransaction[]>({
    queryKey: ["/api/stock-transactions"],
    queryFn: () => apiRequest("GET", "/api/stock-transactions").then(r => r.json()),
  });

  // ── Holdings mutations ─────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/stocks", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stocks"] });
      setShowAdd(false);
      setDraft({ ticker: "", name: "", current_price: "", current_holding: "", allocation_pct: 0, expected_return: 12, monthly_dca: 0, annual_lump_sum: 0, projection_years: 10 });
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/stock-transactions"] });
      setShowTxForm(false);
      setEditingTxId(null);
      setTxDraft(emptyTxForm());
      toast({ title: "Transaction saved", description: "Stock transaction recorded." });
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

  // ── Combined projection ────────────────────────────────────────────────────
  const combinedProjection = useMemo(() => {
    const years = 10;
    const result = [];
    const currentYear = new Date().getFullYear();

    for (let y = 1; y <= years; y++) {
      let totalVal = 0;
      let totalInv = 0;
      const projYear = currentYear + y;

      for (const s of stocks) {
        const initVal = safeNum(s.current_holding) * safeNum(s.current_price);

        // Add planned buys for this ticker up to this projection year
        const plannedBuysForStock = transactions.filter(t =>
          t.status === "planned" &&
          t.transaction_type === "buy" &&
          t.ticker === s.ticker &&
          new Date(t.transaction_date).getFullYear() <= projYear
        );
        const plannedBuyExtra = plannedBuysForStock.reduce((sum, t) => sum + safeNum(t.total_amount), 0);

        const proj = projectInvestment(initVal + plannedBuyExtra, s.expected_return, s.monthly_dca || 0, y);
        const last = proj[y - 1];
        if (last) { totalVal += last.value; totalInv += last.totalInvested; }
      }

      result.push({
        year: (currentYear + y).toString(),
        value: Math.round(totalVal),
        invested: Math.round(totalInv),
      });
    }
    return result;
  }, [stocks, transactions]);

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

      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Stock Portfolio</h1>
          <p className="text-muted-foreground text-sm">US & International equities — transaction ledger & DCA planning</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowAdd(true)}
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
            label: "Planned Buys",
            value: mv(formatCurrency(plannedBuyTotal, true)),
            color: "text-emerald-400",
          },
          {
            label: "Planned Sells",
            value: mv(formatCurrency(plannedSellTotal, true)),
            color: "text-red-400",
          },
          {
            label: "Net Cash Impact",
            value: mv(`${netCashImpact >= 0 ? "+" : ""}${formatCurrency(netCashImpact, true)}`),
            color: netCashImpact >= 0 ? "text-emerald-400" : "text-red-400",
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
                  "Stock", "Units", "Avg Buy", "Price", "Value",
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

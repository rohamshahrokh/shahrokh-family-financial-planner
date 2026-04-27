import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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
import type { CryptoTransaction, CryptoDCASchedule } from "@/lib/localStore";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import {
  Plus, Trash2, Edit2, Bitcoin, CheckSquare, Square,
  ArrowUpRight, ArrowDownRight, X, Calendar, Filter,
  Upload, RefreshCw, Download, ToggleLeft, ToggleRight, ShoppingCart,
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
];

// ─── Custom tooltip ──────────────────────────────────────────────────────────
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
//   lump_sum_amount  → stores avg_buy_price

// ─── Normalise crypto ─────────────────────────────────────────────────────────
const SF_CRYPTO_COLS = new Set([
  'symbol','name','current_price','current_holding',
  'expected_return','monthly_dca','lump_sum_amount','projection_years',
]);

function normaliseCrypto(d: any) {
  const out: Record<string, any> = {};
  for (const k of SF_CRYPTO_COLS) {
    if (k in d) out[k] = d[k];
  }
  const numKeys = [
    "current_price", "current_holding", "expected_return",
    "monthly_dca", "lump_sum_amount", "projection_years",
  ];
  for (const k of numKeys) {
    if (k in out) out[k] = parseFloat(String(out[k])) || 0;
  }
  return out;
}

// ─── Derived per-crypto calcs ─────────────────────────────────────────────────
function cryptoCalcs(c: any, totalPortfolioValue: number) {
  const units = safeNum(c.current_holding);
  const currentPrice = safeNum(c.current_price);
  const avgBuyPrice = safeNum(c.lump_sum_amount); // stored in lump_sum_amount

  const currentValue = units * currentPrice;
  const totalInvested = units * avgBuyPrice;
  const unrealisedGL = currentValue - totalInvested;
  const unrealisedGLPct = totalInvested > 0 ? (unrealisedGL / totalInvested) * 100 : 0;
  const actualAllocPct = totalPortfolioValue > 0 ? (currentValue / totalPortfolioValue) * 100 : 0;

  return {
    units, currentPrice, avgBuyPrice,
    currentValue, totalInvested, unrealisedGL, unrealisedGLPct,
    actualAllocPct,
  };
}

// ─── Today's date string ─────────────────────────────────────────────────────
function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

// ─── Empty transaction form ──────────────────────────────────────────────────
function emptyTxForm(): Partial<CryptoTransaction> {
  return {
    transaction_type: "buy",
    status: "actual",
    transaction_date: todayStr(),
    symbol: "",
    asset_name: "",
    units: 0,
    price_per_unit: 0,
    total_amount: 0,
    fee: 0,
    notes: "",
    created_by: "user",
  };
}

// ─── Empty planned order form ─────────────────────────────────────────────────
function emptyOrderForm(): any {
  return {
    module: 'crypto',
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

// ─── Crypto Live Price Cache ─────────────────────────────────────────────────
const CRYPTO_PRICE_CACHE_KEY = "sf_crypto_prices_cache";
const CRYPTO_TTL_MS = 15 * 60 * 1000;

interface CryptoPriceCacheEntry { price: number; change24h: number; fetchedAt: number; }
type CryptoPriceCache = Record<string, CryptoPriceCacheEntry>;

function getCryptoLivePriceCache(): CryptoPriceCache {
  try { return JSON.parse(localStorage.getItem(CRYPTO_PRICE_CACHE_KEY) ?? "{}"); } catch { return {}; }
}
function saveCryptoLivePriceCache(cache: CryptoPriceCache) {
  try { localStorage.setItem(CRYPTO_PRICE_CACHE_KEY, JSON.stringify(cache)); } catch {}
}

// Maps common crypto symbols to CoinGecko IDs
const COINGECKO_ID_MAP: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", BNB: "binancecoin",
  ADA: "cardano", XRP: "ripple", DOGE: "dogecoin", AVAX: "avalanche-2",
  DOT: "polkadot", MATIC: "matic-network", LINK: "chainlink", LTC: "litecoin",
  UNI: "uniswap", ATOM: "cosmos", FIL: "filecoin", NEAR: "near", APT: "aptos",
  ARB: "arbitrum", OP: "optimism", INJ: "injective-protocol",
};

async function fetchLiveCryptoPrice(symbol: string): Promise<{ price: number; change24h: number } | null> {
  const cache = getCryptoLivePriceCache();
  const cached = cache[symbol.toUpperCase()];
  if (cached && Date.now() - cached.fetchedAt < CRYPTO_TTL_MS) {
    return { price: cached.price, change24h: cached.change24h };
  }
  const id = COINGECKO_ID_MAP[symbol.toUpperCase()] ?? symbol.toLowerCase();
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error("coingecko failed");
    const data = await res.json();
    const entry = data[id];
    if (!entry) throw new Error("no data");
    const price = entry.usd ?? 0;
    const change24h = entry.usd_24h_change ?? 0;
    const cacheEntry: CryptoPriceCacheEntry = { price, change24h, fetchedAt: Date.now() };
    saveCryptoLivePriceCache({ ...getCryptoLivePriceCache(), [symbol.toUpperCase()]: cacheEntry });
    return { price, change24h };
  } catch (err) {
    console.warn(`[CryptoLivePrice] Failed for ${symbol}:`, err);
    return null;
  }
}

// ─── Crypto Bulk Import ───────────────────────────────────────────────────────
interface CryptoImportRow {
  symbol: string; name: string; units: number; avgBuyPrice: number;
  currentPrice: number; expectedReturn: number; monthlyDCA: number;
}

const CRYPTO_IMPORT_HEADERS = [
  "Symbol", "Coin Name", "Units Held", "Avg Buy Price (USD)",
  "Current Price (USD)", "Expected Return %", "Monthly DCA (AUD)",
];

function downloadCryptoImportTemplate() {
  const wb = XLSX.utils.book_new();
  const sample: any[] = [
    CRYPTO_IMPORT_HEADERS,
    ["BTC", "Bitcoin", 0.5, 42000, 95000, 40, 500],
    ["ETH", "Ethereum", 3, 2000, 3200, 35, 300],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sample), "Crypto Import");
  XLSX.writeFile(wb, "Crypto_Import_Template.xlsx");
}

function parseCryptoImportFile(file: File): Promise<CryptoImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });
        const rows: CryptoImportRow[] = [];
        for (let i = 1; i < raw.length; i++) {
          const r = raw[i];
          if (!r[0]) continue;
          rows.push({
            symbol: String(r[0] ?? "").trim().toUpperCase(),
            name: String(r[1] ?? r[0]).trim(),
            units: parseFloat(r[2]) || 0,
            avgBuyPrice: parseFloat(r[3]) || 0,
            currentPrice: parseFloat(r[4]) || 0,
            expectedReturn: parseFloat(r[5]) || 25,
            monthlyDCA: parseFloat(r[6]) || 0,
          });
        }
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

function CryptoBulkImportModal({ onImport, onClose }: { onImport: (rows: CryptoImportRow[]) => void; onClose: () => void }) {
  const [preview, setPreview] = useState<CryptoImportRow[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(""); setLoading(true);
    try {
      const rows = await parseCryptoImportFile(file);
      if (rows.length === 0) { setError("No data rows found. Use the template."); setLoading(false); return; }
      setPreview(rows);
    } catch { setError("Could not parse file."); }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h3 className="font-bold text-sm">Bulk Import Crypto Holdings</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Upload an Excel file — each row is one crypto holding</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="bg-secondary/40 rounded-xl p-4">
            <p className="text-xs font-semibold mb-2">Step 1 — Download template</p>
            <Button size="sm" variant="outline" onClick={downloadCryptoImportTemplate} className="gap-2 text-xs h-7">
              <Download className="w-3 h-3" /> Download Template
            </Button>
            <p className="text-xs text-muted-foreground mt-2">Columns: {CRYPTO_IMPORT_HEADERS.join(" | ")}</p>
          </div>
          <div className="bg-secondary/40 rounded-xl p-4">
            <p className="text-xs font-semibold mb-2">Step 2 — Upload file</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={loading} className="gap-2 text-xs h-7">
              <Upload className="w-3 h-3" /> {loading ? "Parsing..." : "Choose File"}
            </Button>
            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          </div>
          {preview && (
            <div>
              <p className="text-xs font-semibold mb-2">Step 3 — Review {preview.length} rows</p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      {["Symbol","Name","Units","Avg Buy","Current Price","Exp Return %","Monthly DCA"].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-muted-foreground font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} className="border-b border-border/40 hover:bg-secondary/20">
                        <td className="px-3 py-1.5 font-bold text-primary">{r.symbol}</td>
                        <td className="px-3 py-1.5">{r.name}</td>
                        <td className="px-3 py-1.5 num-display">{r.units}</td>
                        <td className="px-3 py-1.5 num-display">{formatCurrency(r.avgBuyPrice)}</td>
                        <td className="px-3 py-1.5 num-display">{formatCurrency(r.currentPrice)}</td>
                        <td className="px-3 py-1.5 num-display">{r.expectedReturn}%</td>
                        <td className="px-3 py-1.5 num-display">{formatCurrency(r.monthlyDCA)}</td>
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
            <Button onClick={() => { onImport(preview); onClose(); }}
              style={{ background: "linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))", color: "hsl(224,40%,8%)", border: "none" }}
              className="text-xs h-8 gap-1">
              <Upload className="w-3 h-3" /> Import {preview.length} Holdings
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onClose} className="text-xs h-8">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Crypto DCA helpers ───────────────────────────────────────────────────────
function emptyCryptoDCAForm(symbols: string[]): Omit<CryptoDCASchedule, 'id'|'created_at'|'updated_at'> {
  return {
    symbol: symbols[0] ?? "",
    asset_name: "",
    amount: 0,
    frequency: "monthly",
    start_date: new Date().toISOString().split("T")[0],
    end_date: null,
    enabled: true,
    notes: "",
  };
}
function cryptoDcaMonthlyEquiv(amount: number, freq: string): number {
  const map: Record<string, number> = { weekly: 52/12, fortnightly: 26/12, monthly: 1, quarterly: 1/3 };
  return amount * (map[freq] ?? 1);
}

// ─── CryptoEditForm ───────────────────────────────────────────────────────────
interface CryptoEditFormProps {
  data: any;
  onChange: (d: any) => void;
  onEnterSave?: () => void;
}

function CryptoEditForm({ data, onChange, onEnterSave }: CryptoEditFormProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(e.target as HTMLElement).matches("textarea")) {
      e.preventDefault();
      onEnterSave?.();
    }
  };

  const fields: { label: string; key: string; type: string; step?: string; placeholder?: string }[] = [
    { label: "Name", key: "name", type: "text", placeholder: "Bitcoin" },
    { label: "Symbol", key: "symbol", type: "text", placeholder: "BTC" },
    { label: "Holdings (units)", key: "current_holding", type: "number", step: "0.00000001" },
    { label: "Avg Buy Price ($)", key: "lump_sum_amount", type: "number", step: "0.01" },
    { label: "Current Price ($)", key: "current_price", type: "number", step: "0.01" },
    { label: "Expected Return %", key: "expected_return", type: "number", step: "1" },
    { label: "Monthly DCA ($)", key: "monthly_dca", type: "number", step: "50" },
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
        const abp = safeNum(data.lump_sum_amount);
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
interface CryptoTxFormProps {
  initial: Partial<CryptoTransaction>;
  cryptos: any[];
  onSave: (data: Partial<CryptoTransaction>) => void;
  onCancel: () => void;
  isSaving: boolean;
}

function CryptoTxForm({ initial, cryptos, onSave, onCancel, isSaving }: CryptoTxFormProps) {
  const [form, setForm] = useState<Partial<CryptoTransaction>>(initial);

  const set = (key: keyof CryptoTransaction, value: any) => {
    setForm(prev => {
      const next = { ...prev, [key]: value };
      // Auto-calculate total_amount
      if (key === "units" || key === "price_per_unit") {
        const u = safeNum(key === "units" ? value : prev.units);
        const p = safeNum(key === "price_per_unit" ? value : prev.price_per_unit);
        next.total_amount = parseFloat((u * p).toFixed(8));
      }
      // Auto-fill asset_name if symbol matches holding
      if (key === "symbol") {
        const match = cryptos.find((c: any) =>
          c.symbol?.toLowerCase() === String(value).toLowerCase()
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
            <label className="text-xs text-muted-foreground block mb-1">Symbol</label>
            <Input
              type="text"
              placeholder="BTC"
              value={form.symbol ?? ""}
              onChange={e => set("symbol", e.target.value.toUpperCase())}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Asset Name</label>
            <Input
              type="text"
              placeholder="Bitcoin"
              value={form.asset_name ?? ""}
              onChange={e => set("asset_name", e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Units</label>
            <Input
              type="number"
              step="0.00000001"
              min="0"
              value={form.units ?? ""}
              onChange={e => set("units", parseFloat(e.target.value) || 0)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Price per Unit (AUD)</label>
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
            <label className="text-xs text-muted-foreground block mb-1">Fee (AUD)</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.fee ?? ""}
              onChange={e => set("fee", parseFloat(e.target.value) || 0)}
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
interface PlannedOrderFormProps {
  initial: any;
  cryptos: any[];
  onSave: (data: any) => void;
  onCancel: () => void;
  isSaving: boolean;
}

function PlannedOrderForm({ initial, cryptos, onSave, onCancel, isSaving }: PlannedOrderFormProps) {
  const [form, setForm] = useState<any>(initial);

  const set = (key: string, value: any) => {
    setForm((prev: any) => {
      const next = { ...prev, [key]: value };
      // Auto-fill asset_name from cryptos list
      if (key === "ticker") {
        const match = cryptos.find((c: any) =>
          c.symbol?.toLowerCase() === String(value).toLowerCase()
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
                      ? s === "planned" ? "bg-amber-500 text-black"
                        : s === "executed" ? "bg-emerald-600 text-white"
                        : "bg-secondary text-foreground"
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
            <label className="text-xs text-muted-foreground block mb-1">Symbol</label>
            <div className="flex gap-1">
              <select
                value={cryptos.find((c: any) => c.symbol === form.ticker) ? form.ticker : "__custom__"}
                onChange={e => {
                  if (e.target.value !== "__custom__") set("ticker", e.target.value);
                }}
                className="flex-1 h-8 text-xs bg-secondary border border-border rounded px-2 text-foreground"
              >
                {cryptos.map((c: any) => <option key={c.symbol} value={c.symbol}>{c.symbol}</option>)}
                <option value="__custom__">Custom...</option>
              </select>
              <Input
                type="text"
                placeholder="BTC"
                value={form.ticker}
                onChange={e => set("ticker", e.target.value.toUpperCase())}
                className="w-20 h-8 text-xs"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Asset Name</label>
            <Input
              type="text"
              placeholder="Bitcoin"
              value={form.asset_name ?? ""}
              onChange={e => set("asset_name", e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Planned Date</label>
            <Input
              type="date"
              value={form.planned_date ?? ""}
              onChange={e => set("planned_date", e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Amount AUD</label>
            <Input
              type="number"
              step="50"
              min="0"
              value={form.amount_aud ?? ""}
              onChange={e => set("amount_aud", parseFloat(e.target.value) || 0)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Units (optional)</label>
            <Input
              type="number"
              step="0.00000001"
              min="0"
              placeholder="Optional"
              value={form.units ?? ""}
              onChange={e => set("units", e.target.value ? parseFloat(e.target.value) : null)}
              className="h-8 text-xs"
            />
          </div>
          <div>
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
            {isSaving ? "Saving..." : "Save Order"}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel} className="text-xs h-8">Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CryptoPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { privacyMode, chartView } = useAppStore();

  // Holdings state
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<any>({
    name: "", symbol: "", current_price: "", current_holding: "",
    expected_return: 25, monthly_dca: 0, lump_sum_amount: 0, projection_years: 10,
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<any>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Transaction state
  const [showTxForm, setShowTxForm] = useState(false);
  const [txDraft, setTxDraft] = useState<Partial<CryptoTransaction>>(emptyTxForm());
  const [editingTxId, setEditingTxId] = useState<number | null>(null);

  // Filter state
  const [txTypeFilter, setTxTypeFilter] = useState<"all" | "buy" | "sell">("all");
  const [txStatusFilter, setTxStatusFilter] = useState<"all" | "actual" | "planned">("all");
  const [txDateFrom, setTxDateFrom] = useState("");
  const [txDateTo, setTxDateTo] = useState("");
  const [txSymbolFilter, setTxSymbolFilter] = useState("all");

  const handleDraftChange = useCallback((d: any) => setDraft(d), []);
  const handleEditDraftChange = useCallback((d: any) => setEditDraft(d), []);

  // Live price state
  const [liveCryptoPrices, setLiveCryptoPrices] = useState<Record<string, { price: number; change24h: number }>>(() => {
    const cache = getCryptoLivePriceCache();
    return Object.fromEntries(Object.entries(cache).map(([k, v]: any) => [k, { price: v.price, change24h: v.change24h }]));
  });
  const [fetchingCryptoPrices, setFetchingCryptoPrices] = useState(false);
  const [lastCryptoPriceFetch, setLastCryptoPriceFetch] = useState<Date | null>(null);

  // Import / DCA / Planned Orders state
  const [showImportModal, setShowImportModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'portfolio' | 'transactions' | 'dca' | 'orders'>('portfolio');
  const [showDCAForm, setShowDCAForm] = useState(false);
  const [dcaDraft, setDcaDraft] = useState<any>(null);
  const [editingDCAId, setEditingDCAId] = useState<number | null>(null);

  // Planned Orders state
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderDraft, setOrderDraft] = useState<any>(null);
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: cryptos = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto"],
    queryFn: () => apiRequest("GET", "/api/crypto").then(r => r.json()),
  });

  const { data: transactions = [] } = useQuery<CryptoTransaction[]>({
    queryKey: ["/api/crypto-transactions"],
    queryFn: () => apiRequest("GET", "/api/crypto-transactions").then(r => r.json()),
  });

  const { data: dcaSchedules = [] } = useQuery<CryptoDCASchedule[]>({
    queryKey: ["/api/crypto-dca"],
    queryFn: () => apiRequest("GET", "/api/crypto-dca").then(r => r.json()),
  });

  const { data: plannedOrders = [] } = useQuery<any[]>({
    queryKey: ["/api/planned-investments", "crypto"],
    queryFn: () => apiRequest("GET", "/api/planned-investments?module=crypto").then(r => r.json()),
  });

  // ── Live price + import handlers ────────────────────────────────────────────
  const handleFetchLivePrices = useCallback(async () => {
    if (cryptos.length === 0 || fetchingCryptoPrices) return;
    setFetchingCryptoPrices(true);
    const results: Record<string, { price: number; change24h: number }> = {};
    await Promise.allSettled(
      cryptos.map(async (c: any) => {
        if (!c.symbol) return;
        const r = await fetchLiveCryptoPrice(c.symbol);
        if (r) results[c.symbol.toUpperCase()] = r;
      })
    );
    setLiveCryptoPrices(prev => ({ ...prev, ...results }));
    setLastCryptoPriceFetch(new Date());
    setFetchingCryptoPrices(false);
    toast({ title: "Live crypto prices updated", description: `Fetched for ${Object.keys(results).length} tokens.` });
  }, [cryptos, fetchingCryptoPrices, toast]);

  const handleBulkImport = useCallback(async (rows: CryptoImportRow[]) => {
    let imported = 0;
    for (const r of rows) {
      const cols: Record<string, any> = {
        symbol: r.symbol, name: r.name, current_holding: r.units,
        lump_sum_amount: r.avgBuyPrice, current_price: r.currentPrice,
        expected_return: r.expectedReturn, monthly_dca: r.monthlyDCA, projection_years: 10,
      };
      // whitelist
      const CRYPTO_COLS = new Set(['symbol','name','current_price','current_holding','expected_return','monthly_dca','lump_sum_amount','projection_years']);
      const safe: Record<string, any> = {};
      for (const k of CRYPTO_COLS) { if (k in cols) safe[k] = cols[k]; }
      const numKeys = ["current_price","current_holding","expected_return","monthly_dca","lump_sum_amount","projection_years"];
      for (const k of numKeys) { if (k in safe) safe[k] = parseFloat(String(safe[k])) || 0; }
      await apiRequest("POST", "/api/crypto", safe);
      imported++;
    }
    await qc.invalidateQueries({ queryKey: ["/api/crypto"] });
    toast({ title: "Import complete", description: `${imported} crypto assets imported.` });
  }, [qc, toast]);

  // ── DCA mutations ──────────────────────────────────────────────────────────
  const createDCAMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/crypto-dca", data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/crypto-dca"] }); setShowDCAForm(false); setDcaDraft(null); toast({ title: "DCA schedule saved" }); },
    onError: (err: any) => toast({ title: 'Save failed', description: String(err), variant: 'destructive' }),
  });
  const updateDCAMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest("PUT", `/api/crypto-dca/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/crypto-dca"] }); setShowDCAForm(false); setEditingDCAId(null); setDcaDraft(null); toast({ title: "DCA updated" }); },
    onError: (err: any) => toast({ title: 'Save failed', description: String(err), variant: 'destructive' }),
  });
  const deleteDCAMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/crypto-dca/${id}`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/crypto-dca"] }),
    onError: (err: any) => toast({ title: 'Delete failed', description: String(err), variant: 'destructive' }),
  });

  // ── Planned Order mutations ────────────────────────────────────────────────
  const createOrderMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/planned-investments", { ...data, module: 'crypto' }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/planned-investments", "crypto"] });
      setShowOrderForm(false);
      setOrderDraft(null);
      setEditingOrderId(null);
      toast({ title: "Planned order saved" });
    },
    onError: (err: any) => toast({ title: 'Save failed', description: String(err), variant: 'destructive' }),
  });
  const updateOrderMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest("PUT", `/api/planned-investments/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/planned-investments", "crypto"] });
      setShowOrderForm(false);
      setOrderDraft(null);
      setEditingOrderId(null);
      toast({ title: "Planned order updated" });
    },
    onError: (err: any) => toast({ title: 'Save failed', description: String(err), variant: 'destructive' }),
  });
  const deleteOrderMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/planned-investments/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/planned-investments", "crypto"] });
      toast({ title: "Planned order deleted" });
    },
    onError: (err: any) => toast({ title: 'Delete failed', description: String(err), variant: 'destructive' }),
  });

  // ── Holdings mutations ─────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/crypto", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/crypto"] });
      setShowAdd(false);
      setDraft({ name: "", symbol: "", current_price: "", current_holding: "", expected_return: 25, monthly_dca: 0, lump_sum_amount: 0, projection_years: 10 });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) =>
      apiRequest("PUT", `/api/crypto/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/crypto"] });
      setEditingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/crypto/${id}`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/crypto"] }),
  });

  // ── Transaction mutations ──────────────────────────────────────────────────

  const createTxMut = useMutation({
    mutationFn: (data: Partial<CryptoTransaction>) =>
      apiRequest("POST", "/api/crypto-transactions", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/crypto-transactions"] });
      setShowTxForm(false);
      setEditingTxId(null);
      setTxDraft(emptyTxForm());
      toast({ title: "Transaction saved", description: "Crypto transaction recorded." });
    },
    onError: (err) => {
      toast({ title: "Error saving transaction", description: String(err), variant: "destructive" });
    },
  });

  const updateTxMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CryptoTransaction> }) =>
      apiRequest("PUT", `/api/crypto-transactions/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/crypto-transactions"] });
      setShowTxForm(false);
      setEditingTxId(null);
      setTxDraft(emptyTxForm());
      toast({ title: "Transaction updated" });
    },
  });

  const deleteTxMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/crypto-transactions/${id}`).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/crypto-transactions"] });
      toast({ title: "Transaction deleted" });
    },
  });

  // ── Portfolio-level calcs ──────────────────────────────────────────────────

  const totalCurrentValue = useMemo(
    () => cryptos.reduce((s: number, c: any) => s + safeNum(c.current_holding) * safeNum(c.current_price), 0),
    [cryptos]
  );

  const totalInvested = useMemo(
    () => cryptos.reduce((s: number, c: any) => s + safeNum(c.current_holding) * safeNum(c.lump_sum_amount), 0),
    [cryptos]
  );

  const totalGL = totalCurrentValue - totalInvested;
  const totalGLPct = totalInvested > 0 ? (totalGL / totalInvested) * 100 : 0;

  // ── Transaction-derived KPIs ───────────────────────────────────────────────
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

  // ── Planned Orders KPIs ────────────────────────────────────────────────────
  const orderBuyTotal = useMemo(
    () => plannedOrders.filter((o: any) => o.action === 'buy' && o.status === 'planned').reduce((s: number, o: any) => s + safeNum(o.amount_aud), 0),
    [plannedOrders]
  );
  const orderSellTotal = useMemo(
    () => plannedOrders.filter((o: any) => o.action === 'sell' && o.status === 'planned').reduce((s: number, o: any) => s + safeNum(o.amount_aud), 0),
    [plannedOrders]
  );
  const orderStatusCounts = useMemo(() => {
    const counts: Record<string, number> = { planned: 0, executed: 0, cancelled: 0 };
    for (const o of plannedOrders) {
      if (o.status in counts) counts[o.status]++;
    }
    return counts;
  }, [plannedOrders]);

  // ── DCA monthly total for projection ──────────────────────────────────────
  const dcaMonthlyTotal = useMemo(
    () => dcaSchedules.filter((d: CryptoDCASchedule) => d.enabled).reduce((s: number, d: CryptoDCASchedule) => s + cryptoDcaMonthlyEquiv(d.amount, d.frequency), 0),
    [dcaSchedules]
  );

  // ── Combined projection ────────────────────────────────────────────────────
  const combinedProjection = useMemo(() => {
    const years = 10;
    const result = [];
    const currentYear = new Date().getFullYear();

    for (let y = 1; y <= years; y++) {
      let totalVal = 0;
      let totalInv = 0;
      const projYear = currentYear + y;

      for (const c of cryptos) {
        const initVal = safeNum(c.current_holding) * safeNum(c.current_price);

        // Add planned buys for this symbol up to this projection year
        const plannedBuysForAsset = transactions.filter(t =>
          t.status === "planned" &&
          t.transaction_type === "buy" &&
          t.symbol === c.symbol &&
          new Date(t.transaction_date).getFullYear() <= projYear
        );
        const plannedBuyExtra = plannedBuysForAsset.reduce((sum, t) => sum + safeNum(t.total_amount), 0);

        // Add DCA monthly contribution for this coin
        const dcaForCoin = dcaSchedules
          .filter((d: CryptoDCASchedule) => d.enabled && d.symbol === c.symbol)
          .reduce((s: number, d: CryptoDCASchedule) => s + cryptoDcaMonthlyEquiv(d.amount, d.frequency), 0);

        const proj = projectInvestment(initVal + plannedBuyExtra, c.expected_return, (c.monthly_dca || 0) + dcaForCoin, y);
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
  }, [cryptos, transactions, dcaSchedules]);

  const assetProjections = useMemo(() => {
    const years = 10;
    const result: any[] = [];
    for (let y = 1; y <= years; y++) {
      const row: any = { year: (new Date().getFullYear() + y).toString() };
      for (const c of cryptos) {
        const initVal = safeNum(c.current_holding) * safeNum(c.current_price);
        const proj = projectInvestment(initVal, c.expected_return, c.monthly_dca || 0, y);
        row[c.symbol] = proj[y - 1]?.value || 0;
      }
      result.push(row);
    }
    return result;
  }, [cryptos]);

  const year10Val = combinedProjection[9]?.value || 0;
  const cagr = calcCAGR(totalCurrentValue || 1, year10Val || 1, 10);

  const allocationData = cryptos
    .map((c: any, i: number) => {
      const val = safeNum(c.current_holding) * safeNum(c.current_price);
      return { name: c.symbol, value: val || 0, color: COLORS[i % COLORS.length] };
    })
    .filter((d: any) => d.value > 0);

  // ── Filtered transactions ──────────────────────────────────────────────────
  const allSymbols = useMemo(() => {
    const symbols = new Set(transactions.map(t => t.symbol));
    return Array.from(symbols).filter(Boolean).sort();
  }, [transactions]);

  const filteredTx = useMemo(() => {
    return transactions
      .filter(t => {
        if (txTypeFilter !== "all" && t.transaction_type !== txTypeFilter) return false;
        if (txStatusFilter !== "all" && t.status !== txStatusFilter) return false;
        if (txDateFrom && t.transaction_date < txDateFrom) return false;
        if (txDateTo && t.transaction_date > txDateTo) return false;
        if (txSymbolFilter !== "all" && t.symbol !== txSymbolFilter) return false;
        return true;
      })
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
  }, [transactions, txTypeFilter, txStatusFilter, txDateFrom, txDateTo, txSymbolFilter]);

  const mv = (v: string) => maskValue(v, privacyMode);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSaveEdit = () => {
    if (!editDraft || !editingId) return;
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      updateMut.mutateAsync({ id: editingId, data: normaliseCrypto(editDraft) });
    }, 100);
  };

  const handleSaveTx = (data: Partial<CryptoTransaction>) => {
    if (editingTxId) {
      updateTxMut.mutate({ id: editingTxId, data });
    } else {
      createTxMut.mutate(data);
    }
  };

  const handleEditTx = (tx: CryptoTransaction) => {
    setTxDraft({ ...tx });
    setEditingTxId(tx.id);
    setShowTxForm(true);
  };

  const handleSaveOrder = (data: any) => {
    if (editingOrderId) {
      updateOrderMut.mutate({ id: editingOrderId, data });
    } else {
      createOrderMut.mutate(data);
    }
  };

  const handleExportBackup = () => {
    const wb = XLSX.utils.book_new();
    const selectedCryptos = cryptos.filter((c: any) => selected.has(c.id));
    const headers = [
      "Symbol", "Name", "Holdings", "Avg Buy Price", "Current Price",
      "Current Value", "Total Invested", "Unrealised G/L", "G/L %", "Expected Return", "Monthly DCA",
    ];
    const rows = selectedCryptos.map((c: any) => {
      const calc = cryptoCalcs(c, totalCurrentValue);
      return [
        c.symbol, c.name, calc.units, calc.avgBuyPrice, calc.currentPrice,
        calc.currentValue, calc.totalInvested, calc.unrealisedGL,
        calc.unrealisedGLPct.toFixed(1) + "%", c.expected_return, c.monthly_dca,
      ];
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), "Crypto Backup");
    XLSX.writeFile(wb, `Crypto_Backup_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Backup exported", description: `${selectedCryptos.length} assets saved to Excel.` });
  };

  return (
    <div className="space-y-5 pb-8">

      {/* ─── Transaction Form Modal ─────────────────────────────────────────── */}
      {/* ─── Bulk Import Modal ─────────────────────────────────────────────── */}
      {showImportModal && (
        <CryptoBulkImportModal
          onImport={handleBulkImport}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {showTxForm && (
        <CryptoTxForm
          initial={txDraft}
          cryptos={cryptos}
          onSave={handleSaveTx}
          onCancel={() => { setShowTxForm(false); setEditingTxId(null); setTxDraft(emptyTxForm()); }}
          isSaving={createTxMut.isPending || updateTxMut.isPending}
        />
      )}

      {showOrderForm && orderDraft && (
        <PlannedOrderForm
          initial={orderDraft}
          cryptos={cryptos}
          onSave={handleSaveOrder}
          onCancel={() => { setShowOrderForm(false); setOrderDraft(null); setEditingOrderId(null); }}
          isSaving={createOrderMut.isPending || updateOrderMut.isPending}
        />
      )}

      {/* ─── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Crypto Portfolio</h1>
          <p className="text-muted-foreground text-sm">Bitcoin, Ethereum & digital assets — transaction ledger & DCA planning</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleFetchLivePrices}
            variant="outline"
            size="sm"
            disabled={fetchingCryptoPrices}
            className="gap-2 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${fetchingCryptoPrices ? 'animate-spin' : ''}`} />
            {fetchingCryptoPrices ? "Fetching..." : "Live Prices"}
          </Button>
          <Button
            onClick={() => setShowImportModal(true)}
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
          >
            <Upload className="w-3.5 h-3.5" /> Import
          </Button>
          <Button
            onClick={() => setShowAdd(true)}
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Add Asset
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
      <div className="flex items-center gap-1 bg-secondary/50 rounded-xl p-1 w-fit">
        {([
          ['portfolio', 'Portfolio'],
          ['transactions', 'Transactions'],
          ['dca', 'DCA Schedules'],
          ['orders', 'Planned Orders'],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${activeTab === id ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
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
                  <linearGradient id="cryptoGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(43,85%,55%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(43,85%,55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: "hsl(220,10%,55%)" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(220,10%,55%)" }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="value" stroke="hsl(43,85%,55%)" fill="url(#cryptoGrad)" strokeWidth={2} name="Portfolio Value" />
                <Area type="monotone" dataKey="invested" stroke="hsl(188,60%,48%)" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="Total Invested" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-bold mb-4">Asset Allocation</h3>
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
                  {cryptos.map((c: any, i: number) => {
                    const calc = cryptoCalcs(c, totalCurrentValue);
                    if (calc.currentValue <= 0) return null;
                    const proj10 = projectInvestment(calc.currentValue, c.expected_return, c.monthly_dca || 0, 10)[9]?.value || 0;
                    return (
                      <div key={c.id} className="rounded-lg p-2 bg-secondary/30">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                            <span className="font-bold truncate">{c.symbol}</span>
                            <span className="text-muted-foreground text-xs">({calc.actualAllocPct.toFixed(1)}%)</span>
                          </div>
                          <span className="num-display">{mv(formatCurrency(calc.currentValue, true))}</span>
                        </div>
                        <div className="flex justify-between mt-1 text-muted-foreground">
                          <span>{c.expected_return}% exp. return</span>
                          <span className="text-emerald-400">{mv(formatCurrency(proj10, true))} in 10Y</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
                <Bitcoin className="w-8 h-8 opacity-30 mb-2" />
                <p>Set holdings to see allocation</p>
              </div>
            )}
          </div>
        </div>

        {/* Asset comparison chart */}
        {cryptos.length > 1 && assetProjections.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-bold mb-4">Asset Comparison (10Y Projection)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={assetProjections} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: "hsl(220,10%,55%)" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(220,10%,55%)" }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                {cryptos.map((c: any, i: number) => (
                  <Line
                    key={c.symbol}
                    type="monotone"
                    dataKey={c.symbol}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    name={c.symbol}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ─── Add Asset Form ─────────────────────────────────────────────────── */}
        {showAdd && (
          <div className="rounded-xl border border-primary/30 bg-card p-5">
            <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" /> Add Crypto Asset
            </h3>
            <CryptoEditForm
              data={draft}
              onChange={handleDraftChange}
              onEnterSave={() => createMut.mutateAsync(normaliseCrypto(draft))}
            />
            <div className="flex gap-2 mt-4">
              <SaveButton
                label="Save Crypto Asset"
                onSave={() => createMut.mutateAsync(normaliseCrypto(draft))}
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
              <Trash2 className="w-3 h-3" /> Delete {selected.size} assets
            </Button>
          </div>
        )}

        {/* ─── Current Holdings Table ─────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-bold">Current Holdings</h3>
            {cryptos.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7 gap-1 text-muted-foreground"
                onClick={() =>
                  selected.size === cryptos.length
                    ? setSelected(new Set())
                    : setSelected(new Set(cryptos.map((c: any) => c.id)))
                }
              >
                {selected.size === cryptos.length ? (
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
                    "Asset", "Holdings", "Avg Buy", "Price", "Value",
                    "Invested", "Gain/Loss", "G/L %", "Allocation", "10Y Value", "DCA", "Actions",
                  ].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cryptos.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-3 py-8 text-center text-xs text-muted-foreground">
                      No crypto assets added yet. Click "Add Asset" to get started.
                    </td>
                  </tr>
                )}
                {cryptos.map((c: any, i: number) => {
                  const calc = cryptoCalcs(c, totalCurrentValue);
                  const isEditing = editingId === c.id;
                  const isSelected = selected.has(c.id);
                  const proj10 = projectInvestment(calc.currentValue, c.expected_return, c.monthly_dca || 0, 10)[9]?.value || 0;

                  if (isEditing && editDraft) {
                    return (
                      <tr key={c.id} className="border-b border-border bg-secondary/20">
                        <td colSpan={13} className="p-3">
                          <CryptoEditForm
                            data={editDraft}
                            onChange={handleEditDraftChange}
                            onEnterSave={handleSaveEdit}
                          />
                          <div className="flex gap-2 mt-3">
                            <SaveButton
                              label="Save Crypto Asset"
                              onSave={() => updateMut.mutateAsync({ id: c.id, data: normaliseCrypto(editDraft) })}
                            />
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={c.id}
                      className={`border-b border-border/50 hover:bg-secondary/20 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() =>
                            setSelected(prev => {
                              const n = new Set(prev);
                              n.has(c.id) ? n.delete(c.id) : n.add(c.id);
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

                      {/* Asset identity */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold shrink-0"
                            style={{
                              background: COLORS[i % COLORS.length] + "20",
                              color: COLORS[i % COLORS.length],
                            }}
                          >
                            {c.symbol?.charAt(0) ?? "?"}
                          </div>
                          <div>
                            <p className="text-xs font-bold">{c.symbol}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[90px]">{c.name}</p>
                          </div>
                        </div>
                      </td>

                      {/* Holdings — many decimals for crypto */}
                      <td className="px-3 py-2.5 text-xs num-display">
                        {calc.units < 1 ? calc.units.toFixed(8) : calc.units.toLocaleString()}
                      </td>

                      <td className="px-3 py-2.5 text-xs num-display">{mv(formatCurrency(calc.avgBuyPrice))}</td>
                      <td className="px-3 py-2.5 text-xs num-display">{mv(formatCurrency(calc.currentPrice))}</td>
                      <td className="px-3 py-2.5 text-xs num-display font-semibold">{mv(formatCurrency(calc.currentValue, true))}</td>
                      <td className="px-3 py-2.5 text-xs num-display">{mv(formatCurrency(calc.totalInvested, true))}</td>

                      {/* Gain/Loss */}
                      <td className={`px-3 py-2.5 text-xs num-display font-semibold ${calc.unrealisedGL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        <div className="flex items-center gap-1">
                          {calc.unrealisedGL >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {mv(`${calc.unrealisedGL >= 0 ? "+" : ""}${formatCurrency(calc.unrealisedGL, true)}`)}
                        </div>
                      </td>

                      {/* G/L % */}
                      <td className={`px-3 py-2.5 text-xs num-display font-semibold ${calc.unrealisedGLPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {mv(`${calc.unrealisedGLPct >= 0 ? "+" : ""}${calc.unrealisedGLPct.toFixed(1)}%`)}
                      </td>

                      {/* Allocation */}
                      <td className="px-3 py-2.5 text-xs num-display">
                        {mv(`${calc.actualAllocPct.toFixed(1)}%`)}
                      </td>

                      <td className="px-3 py-2.5 text-xs num-display text-emerald-400">{mv(formatCurrency(proj10, true))}</td>
                      <td className="px-3 py-2.5 text-xs num-display text-primary">{mv(formatCurrency(c.monthly_dca || 0))}</td>

                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-6 h-6"
                            onClick={() => { setEditingId(c.id); setEditDraft({ ...c }); }}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-6 h-6 text-red-400"
                            onClick={() => { if (confirm("Delete this asset?")) deleteMut.mutate(c.id); }}
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
              {cryptos.length > 0 && (
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
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">100%</td>
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
          label="crypto assets"
          onConfirm={async () => {
            const ids = Array.from(selected);
            for (const id of ids) await apiRequest("DELETE", `/api/crypto/${id}`);
            await qc.invalidateQueries({ queryKey: ["/api/crypto"] });
            setSelected(new Set());
            setShowBulkModal(false);
            toast({ title: `Deleted ${ids.length} crypto assets`, description: "Records removed from Supabase and local cache." });
          }}
          onCancel={() => setShowBulkModal(false)}
          onExportBackup={selected.size > 0 ? handleExportBackup : undefined}
        />

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
                  <linearGradient id="cryptoProjGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(43,85%,55%)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(43,85%,55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: "hsl(220,10%,55%)" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(220,10%,55%)" }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="value" stroke="hsl(43,85%,55%)" fill="url(#cryptoProjGrad)" strokeWidth={2} name="Portfolio Value" />
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
          {/* ─── Add Transaction button ──────────────────────────────────────── */}
          <div className="flex justify-end">
            <Button
              onClick={() => { setTxDraft(emptyTxForm()); setEditingTxId(null); setShowTxForm(true); }}
              className="gap-2 text-xs"
              style={{ background: "linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))", color: "hsl(224,40%,8%)", border: "none" }}
            >
              <Plus className="w-3.5 h-3.5" /> Add Transaction
            </Button>
          </div>

          {/* ─── Transaction Ledger ─────────────────────────────────────────── */}
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
                  />
                  <span className="text-muted-foreground text-xs">–</span>
                  <Input
                    type="date"
                    value={txDateTo}
                    onChange={e => setTxDateTo(e.target.value)}
                    className="h-7 text-xs w-32"
                  />
                </div>
                {/* Symbol filter */}
                {allSymbols.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Filter className="w-3 h-3 text-muted-foreground" />
                    <select
                      value={txSymbolFilter}
                      onChange={e => setTxSymbolFilter(e.target.value)}
                      className="h-7 text-xs bg-secondary border border-border rounded px-2 text-foreground"
                    >
                      <option value="all">All Symbols</option>
                      {allSymbols.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    {["Date", "Type", "Status", "Symbol", "Units", "Price/Unit", "Total", "Fee", "Notes", "Actions"].map(h => (
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
                      <td className="px-3 py-2.5 text-xs font-bold">{tx.symbol}</td>
                      <td className="px-3 py-2.5 text-xs num-display">
                        {safeNum(tx.units) < 1 ? safeNum(tx.units).toFixed(8) : safeNum(tx.units).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-xs num-display">{mv(formatCurrency(safeNum(tx.price_per_unit)))}</td>
                      <td className="px-3 py-2.5 text-xs num-display font-semibold">{mv(formatCurrency(safeNum(tx.total_amount), true))}</td>
                      <td className="px-3 py-2.5 text-xs num-display text-muted-foreground">{mv(formatCurrency(safeNum(tx.fee)))}</td>
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
                        <span className="text-xs font-bold">{tx.symbol}</span>
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
        </div>
      )}

      {/* ─── DCA Schedules Tab ─────────────────────────────────────────────── */}
      {activeTab === 'dca' && (
        <div className="space-y-4">
          {showDCAForm && dcaDraft && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-lg shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-bold text-sm">{editingDCAId ? 'Edit DCA Schedule' : 'New DCA Schedule'}</h3>
                  <button onClick={() => { setShowDCAForm(false); setDcaDraft(null); setEditingDCAId(null); }} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Coin Symbol</label>
                    <select value={dcaDraft.symbol} onChange={e => setDcaDraft((p: any) => ({ ...p, symbol: e.target.value }))}
                      className="w-full h-8 text-xs bg-secondary border border-border rounded px-2 text-foreground">
                      {cryptos.map((c: any) => <option key={c.symbol} value={c.symbol}>{c.symbol} — {c.name}</option>)}
                      <option value="">Custom...</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Amount (AUD)</label>
                    <Input type="number" step="50" value={dcaDraft.amount} onChange={e => setDcaDraft((p: any) => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Frequency</label>
                    <select value={dcaDraft.frequency} onChange={e => setDcaDraft((p: any) => ({ ...p, frequency: e.target.value }))}
                      className="w-full h-8 text-xs bg-secondary border border-border rounded px-2 text-foreground">
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
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Notes</label>
                    <Input type="text" value={dcaDraft.notes} onChange={e => setDcaDraft((p: any) => ({ ...p, notes: e.target.value }))} className="h-8 text-xs" placeholder="Optional..." />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <label className="text-xs text-muted-foreground">Enabled</label>
                    <button onClick={() => setDcaDraft((p: any) => ({ ...p, enabled: !p.enabled }))}>
                      {dcaDraft.enabled ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                    </button>
                    <span className="text-xs ml-2 text-muted-foreground">Monthly equiv: {formatCurrency(cryptoDcaMonthlyEquiv(dcaDraft.amount, dcaDraft.frequency))}/mo</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <Button onClick={() => editingDCAId ? updateDCAMut.mutate({ id: editingDCAId, data: dcaDraft }) : createDCAMut.mutate(dcaDraft)}
                    disabled={createDCAMut.isPending || updateDCAMut.isPending}
                    style={{ background: "linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))", color: "hsl(224,40%,8%)", border: "none" }}
                    className="text-xs h-8">
                    {createDCAMut.isPending || updateDCAMut.isPending ? 'Saving...' : 'Save Schedule'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowDCAForm(false); setDcaDraft(null); setEditingDCAId(null); }} className="text-xs h-8">Cancel</Button>
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Active Schedules', value: String(dcaSchedules.filter((d: CryptoDCASchedule) => d.enabled).length) },
              { label: 'Total Monthly DCA', value: formatCurrency(dcaMonthlyTotal) },
              { label: 'Annual DCA Budget', value: formatCurrency(dcaMonthlyTotal * 12) },
              { label: 'Coins Scheduled', value: String(new Set(dcaSchedules.filter((d: CryptoDCASchedule) => d.enabled).map((d: CryptoDCASchedule) => d.symbol)).size) },
            ].map(k => (
              <div key={k.label} className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-base font-bold num-display mt-1">{mv(k.value)}</p>
              </div>
            ))}
          </div>

          {/* DCA Forecast impact on projection */}
          {dcaSchedules.filter((d: CryptoDCASchedule) => d.enabled).length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="text-sm font-bold mb-3">DCA Impact on Portfolio Projection</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Your active DCA schedules contribute <span className="text-primary font-semibold">{mv(formatCurrency(dcaMonthlyTotal))}/mo</span> ({mv(formatCurrency(dcaMonthlyTotal * 12))}/yr) to the portfolio growth model.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left pb-2 pr-4 text-muted-foreground font-semibold">Symbol</th>
                      <th className="text-left pb-2 pr-4 text-muted-foreground font-semibold">Frequency</th>
                      <th className="text-left pb-2 pr-4 text-muted-foreground font-semibold">Amount</th>
                      <th className="text-left pb-2 pr-4 text-muted-foreground font-semibold">Monthly Equiv</th>
                      <th className="text-left pb-2 pr-4 text-muted-foreground font-semibold">Annual Contrib</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dcaSchedules.filter((d: CryptoDCASchedule) => d.enabled).map((d: CryptoDCASchedule) => {
                      const monthly = cryptoDcaMonthlyEquiv(d.amount, d.frequency);
                      return (
                        <tr key={d.id} className="border-b border-border/40 hover:bg-secondary/20">
                          <td className="py-1.5 pr-4 font-bold text-primary">{d.symbol || d.asset_name}</td>
                          <td className="py-1.5 pr-4 capitalize text-muted-foreground">{d.frequency}</td>
                          <td className="py-1.5 pr-4 num-display">{mv(formatCurrency(d.amount))}</td>
                          <td className="py-1.5 pr-4 num-display text-primary">{mv(formatCurrency(monthly))}/mo</td>
                          <td className="py-1.5 pr-4 num-display text-emerald-400">{mv(formatCurrency(monthly * 12))}/yr</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold">DCA Schedules</h3>
              <Button size="sm" onClick={() => { setDcaDraft(emptyCryptoDCAForm(cryptos.map((c: any) => c.symbol))); setEditingDCAId(null); setShowDCAForm(true); }}
                style={{ background: "linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))", color: "hsl(224,40%,8%)", border: "none" }}
                className="gap-2 text-xs h-7"><Plus className="w-3 h-3" /> Add Schedule</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    {['Symbol','Amount','Frequency','Monthly Equiv','Start Date','End Date','Status','Notes','Actions'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dcaSchedules.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-xs text-muted-foreground">No DCA schedules yet.</td></tr>}
                  {dcaSchedules.map((d: CryptoDCASchedule) => (
                    <tr key={d.id} className="border-b border-border/50 hover:bg-secondary/20">
                      <td className="px-3 py-2.5 text-xs font-bold text-primary">{d.symbol || d.asset_name}</td>
                      <td className="px-3 py-2.5 text-xs num-display">{mv(formatCurrency(d.amount))}</td>
                      <td className="px-3 py-2.5 text-xs capitalize">{d.frequency}</td>
                      <td className="px-3 py-2.5 text-xs num-display text-primary">{mv(formatCurrency(cryptoDcaMonthlyEquiv(d.amount, d.frequency)))}/mo</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{d.start_date}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{d.end_date ?? 'Ongoing'}</td>
                      <td className="px-3 py-2.5 text-xs">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${d.enabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-secondary text-muted-foreground'}`}>{d.enabled ? 'Active' : 'Paused'}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[120px] truncate">{d.notes}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="w-6 h-6" onClick={() => { setDcaDraft({ ...d }); setEditingDCAId(d.id); setShowDCAForm(true); }}><Edit2 className="w-3 h-3" /></Button>
                          <Button size="icon" variant="ghost" className="w-6 h-6 text-red-400" onClick={() => { if (confirm('Delete?')) deleteDCAMut.mutate(d.id); }}><Trash2 className="w-3 h-3" /></Button>
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

      {/* ─── Planned Orders Tab ────────────────────────────────────────────── */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {/* ─── KPI Summary ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {[
              { label: 'Total Orders', value: String(plannedOrders.length), color: '' },
              { label: 'Planned Buy AUD', value: mv(formatCurrency(orderBuyTotal, true)), color: 'text-emerald-400' },
              { label: 'Planned Sell AUD', value: mv(formatCurrency(orderSellTotal, true)), color: 'text-red-400' },
              { label: 'Pending', value: String(orderStatusCounts.planned), color: 'text-amber-400' },
              { label: 'Executed', value: String(orderStatusCounts.executed), color: 'text-emerald-400' },
            ].map(k => (
              <div key={k.label} className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`text-base font-bold num-display mt-1 ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* ─── Orders Table ───────────────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-primary" /> Planned Investment Orders
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
                    {['Date', 'Symbol', 'Asset', 'Action', 'Amount AUD', 'Units', 'Status', 'Notes', 'Actions'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plannedOrders.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-8 text-center text-xs text-muted-foreground">
                        No planned orders yet. Click "Add Order" to create one.
                      </td>
                    </tr>
                  )}
                  {[...plannedOrders]
                    .sort((a: any, b: any) => (a.planned_date ?? '').localeCompare(b.planned_date ?? ''))
                    .map((o: any) => (
                      <tr key={o.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                        <td className="px-3 py-2.5 text-xs text-muted-foreground num-display">{o.planned_date}</td>
                        <td className="px-3 py-2.5 text-xs font-bold text-primary">{o.ticker}</td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[100px] truncate">{o.asset_name}</td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            o.action === 'buy'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-red-500/15 text-red-400'
                          }`}>
                            {o.action === 'buy' ? 'Buy' : 'Sell'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs num-display font-semibold">{mv(formatCurrency(safeNum(o.amount_aud), true))}</td>
                        <td className="px-3 py-2.5 text-xs num-display text-muted-foreground">
                          {o.units != null ? (safeNum(o.units) < 1 ? safeNum(o.units).toFixed(8) : safeNum(o.units).toLocaleString()) : '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            o.status === 'planned'
                              ? 'bg-amber-500/15 text-amber-400'
                              : o.status === 'executed'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-secondary text-muted-foreground'
                          }`}>
                            {o.status ? o.status.charAt(0).toUpperCase() + o.status.slice(1) : 'Planned'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[120px] truncate">{o.notes}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1">
                            {/* Quick status toggle: planned → executed */}
                            {o.status === 'planned' && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="w-6 h-6 text-emerald-400"
                                title="Mark as executed"
                                onClick={() => updateOrderMut.mutate({ id: o.id, data: { ...o, status: 'executed' } })}
                              >
                                <CheckSquare className="w-3 h-3" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="w-6 h-6"
                              onClick={() => { setOrderDraft({ ...o }); setEditingOrderId(o.id); setShowOrderForm(true); }}
                            >
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="w-6 h-6 text-red-400"
                              onClick={() => { if (confirm('Delete this order?')) deleteOrderMut.mutate(o.id); }}
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

      {/* ─── AI Insights ───────────────────────────────────────────────────── */}
      <AIInsightsCard
        pageKey="crypto"
        pageLabel="Crypto Portfolio"
        getData={() => {
          if (!cryptos?.length) return { count: 0 };
          return {
            crypto: cryptos.map((c: any) => ({
              symbol: c.symbol,
              qty: safeNum(c.current_holding),
              avgBuy: safeNum(c.lump_sum_amount),
              current: safeNum(c.current_price),
              pnl: ((safeNum(c.current_price) - safeNum(c.lump_sum_amount)) * safeNum(c.current_holding)).toFixed(2),
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

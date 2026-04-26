import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, safeNum, projectInvestment, calcCAGR } from "@/lib/finance";
import { maskValue } from "@/components/PrivacyMask";
import { useAppStore } from "@/lib/store";
import SaveButton from "@/components/SaveButton";
import BulkDeleteModal from "@/components/BulkDeleteModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import {
  Plus, Trash2, Edit2, Bitcoin, CheckSquare, Square,
  ArrowUpRight, ArrowDownRight,
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
function normaliseCrypto(d: any) {
  const out = { ...d };
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CryptoPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { privacyMode } = useAppStore();
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

  const handleDraftChange = useCallback((d: any) => setDraft(d), []);
  const handleEditDraftChange = useCallback((d: any) => setEditDraft(d), []);

  const { data: cryptos = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto"],
    queryFn: () => apiRequest("GET", "/api/crypto").then(r => r.json()),
  });

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

  // Portfolio-level calcs
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

  const combinedProjection = useMemo(() => {
    const years = 10;
    const result = [];
    for (let y = 1; y <= years; y++) {
      let totalVal = 0;
      let totalInv = 0;
      for (const c of cryptos) {
        const initVal = safeNum(c.current_holding) * safeNum(c.current_price);
        const proj = projectInvestment(initVal, c.expected_return, c.monthly_dca || 0, y);
        const last = proj[y - 1];
        if (last) { totalVal += last.value; totalInv += last.totalInvested; }
      }
      result.push({
        year: (new Date().getFullYear() + y).toString(),
        value: Math.round(totalVal),
        invested: Math.round(totalInv),
      });
    }
    return result;
  }, [cryptos]);

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

  const mv = (v: string) => maskValue(v, privacyMode);

  const handleSaveEdit = () => {
    if (!editDraft || !editingId) return;
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      updateMut.mutateAsync({ id: editingId, data: normaliseCrypto(editDraft) });
    }, 100);
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Crypto Portfolio</h1>
          <p className="text-muted-foreground text-sm">Bitcoin, Ethereum & digital assets — gain/loss tracking</p>
        </div>
        <Button
          onClick={() => setShowAdd(true)}
          className="gap-2"
          style={{ background: "linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))", color: "hsl(224,40%,8%)", border: "none" }}
          data-testid="button-add-crypto"
        >
          <Plus className="w-4 h-4" /> Add Asset
        </Button>
      </div>

      {/* Portfolio Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total Invested", value: mv(formatCurrency(totalInvested, true)), color: "" },
          { label: "Current Value", value: mv(formatCurrency(totalCurrentValue, true)), color: "" },
          {
            label: "Total Gain/Loss",
            value: mv(`${totalGL >= 0 ? "+" : ""}${formatCurrency(totalGL, true)}`),
            color: totalGL >= 0 ? "text-emerald-400" : "text-red-400",
          },
          {
            label: "Gain/Loss %",
            value: mv(`${totalGLPct >= 0 ? "+" : ""}${totalGLPct.toFixed(1)}%`),
            color: totalGLPct >= 0 ? "text-emerald-400" : "text-red-400",
          },
          { label: "10Y Projected", value: mv(formatCurrency(year10Val, true)), color: "text-primary" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-lg font-bold num-display mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
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

      {/* Add Crypto Form */}
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
              label="Save Crypto Scenario"
              onSave={() => createMut.mutateAsync(normaliseCrypto(draft))}
            />
            <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Bulk toolbar */}
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

      {/* Holdings Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-bold">Holdings</h3>
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
                            label="Save Crypto Scenario"
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

      {/* Bulk Delete Modal */}
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

      {/* 10Y Year-by-Year Table */}
      {combinedProjection.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold">Year-by-Year Projection</h3>
            <span className="text-xs text-muted-foreground">CAGR: <span className="text-primary font-bold">{cagr.toFixed(1)}%</span></span>
          </div>
          <div className="overflow-x-auto">
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
    </div>
  );
}

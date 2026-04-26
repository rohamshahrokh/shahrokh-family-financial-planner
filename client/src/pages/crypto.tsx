import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, projectInvestment, calcCAGR } from "@/lib/finance";
import SaveButton from "@/components/SaveButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from "recharts";
import { Plus, Trash2, Edit2, Bitcoin } from "lucide-react";

const COLORS = ['hsl(43,85%,55%)', 'hsl(188,60%,48%)', 'hsl(142,60%,45%)', 'hsl(20,80%,55%)', 'hsl(270,60%,60%)'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value, true)}</p>
        ))}
      </div>
    );
  }
  return null;
};

const CRYPTO_FIELDS = [
  { label: 'Name', key: 'name', type: 'text' },
  { label: 'Symbol', key: 'symbol', type: 'text' },
  { label: 'Price ($)', key: 'current_price', type: 'number' },
  { label: 'Holdings', key: 'current_holding', type: 'number' },
  { label: 'Expected Return %', key: 'expected_return', type: 'number' },
  { label: 'Monthly DCA ($)', key: 'monthly_dca', type: 'number' },
] as const;

// ─── CryptoEditForm defined OUTSIDE parent — prevents remount on keystroke ─────
interface CryptoEditFormProps { data: any; onChange: (d: any) => void; }
function CryptoEditForm({ data, onChange }: CryptoEditFormProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {CRYPTO_FIELDS.map(f => (
        <div key={f.key}>
          <label className="text-xs text-muted-foreground">{f.label}</label>
          <Input
            type={f.type}
            value={data[f.key] ?? ''}
            onChange={e => onChange({ ...data, [f.key]: e.target.value })}
            className="h-7 text-xs"
          />
        </div>
      ))}
    </div>
  );
}

function normaliseCrypto(d: any) {
  const out = { ...d };
  for (const f of CRYPTO_FIELDS) {
    if (f.type === 'number') out[f.key] = parseFloat(String(out[f.key])) || 0;
  }
  return out;
}

export default function CryptoPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<any>({
    name: '', symbol: '', current_price: '', current_holding: '',
    expected_return: 25, monthly_dca: 0, lump_sum_amount: 0, projection_years: 10,
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<any>(null);

  const handleDraftChange = useCallback((d: any) => setDraft(d), []);
  const handleEditDraftChange = useCallback((d: any) => setEditDraft(d), []);

  const { data: cryptos = [] } = useQuery<any[]>({
    queryKey: ['/api/crypto'],
    queryFn: () => apiRequest('GET', '/api/crypto').then(r => r.json())
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/crypto', data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/crypto'] }); setShowAdd(false); }
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest('PUT', `/api/crypto/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/crypto'] }); setEditingId(null); }
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/crypto/${id}`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/crypto'] })
  });

  const totalValue = cryptos.reduce((s: number, c: any) => s + (c.current_holding * c.current_price), 0);

  const combinedProjection = useMemo(() => {
    const years = 10;
    const result = [];
    for (let y = 1; y <= years; y++) {
      let totalVal = 0; let totalInv = 0;
      for (const c of cryptos) {
        const initVal = (c.current_holding || 0) * (c.current_price || 0);
        const proj = projectInvestment(initVal, c.expected_return, c.monthly_dca || 0, y);
        const last = proj[y - 1];
        if (last) { totalVal += last.value; totalInv += last.totalInvested; }
      }
      result.push({ year: (new Date().getFullYear() + y).toString(), value: Math.round(totalVal), invested: Math.round(totalInv) });
    }
    return result;
  }, [cryptos]);

  const assetProjections = useMemo(() => {
    const years = 10;
    const result: any[] = [];
    for (let y = 1; y <= years; y++) {
      const row: any = { year: (new Date().getFullYear() + y).toString() };
      for (const c of cryptos) {
        const initVal = (c.current_holding || 0) * (c.current_price || 0);
        const proj = projectInvestment(initVal, c.expected_return, c.monthly_dca || 0, y);
        row[c.symbol] = proj[y - 1]?.value || 0;
      }
      result.push(row);
    }
    return result;
  }, [cryptos]);

  const year10Val = combinedProjection[9]?.value || 0;
  const cagr = calcCAGR(totalValue || 1, year10Val || 1, 10);

  const allocationData = cryptos.map((c: any, i: number) => ({
    name: c.symbol,
    value: (c.current_holding || 0) * (c.current_price || 0) || 1,
    color: COLORS[i % COLORS.length],
  }));

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Crypto Portfolio</h1>
          <p className="text-muted-foreground text-sm">Bitcoin, Ethereum & digital asset planning</p>
        </div>
        <Button
          onClick={() => setShowAdd(true)}
          className="gap-2"
          style={{ background: 'linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))', color: 'hsl(224,40%,8%)', border: 'none' }}
          data-testid="button-add-crypto"
        >
          <Plus className="w-4 h-4" /> Add Asset
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Value', value: formatCurrency(totalValue, true) },
          { label: '10Y Projected', value: formatCurrency(year10Val, true) },
          { label: 'CAGR', value: `${cagr.toFixed(1)}%` },
          { label: 'Assets', value: cryptos.length.toString() },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-lg font-bold num-display mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
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
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="value" stroke="hsl(43,85%,55%)" fill="url(#cryptoGrad)" strokeWidth={2} name="Portfolio Value" />
              <Area type="monotone" dataKey="invested" stroke="hsl(188,60%,48%)" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="Total Invested" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold mb-4">Asset Allocation</h3>
          {allocationData.filter((d: any) => d.value > 1).length > 0 ? (
            <div className="flex items-center gap-3">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={allocationData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {allocationData.map((d: any, i: number) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v, true)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2 text-xs">
                {cryptos.map((c: any, i: number) => {
                  const val = (c.current_holding || 0) * (c.current_price || 0);
                  const proj10 = projectInvestment(val, c.expected_return, c.monthly_dca || 0, 10)[9]?.value || 0;
                  return (
                    <div key={c.id} className="rounded-lg p-2 bg-secondary/30">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="font-bold">{c.symbol}</span>
                        </div>
                        <span className="num-display">{formatCurrency(val, true)}</span>
                      </div>
                      <div className="flex justify-between mt-1 text-muted-foreground">
                        <span>{c.expected_return}% return</span>
                        <span className="text-emerald-400">{formatCurrency(proj10, true)} in 10Y</span>
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

      {/* Asset Comparison Chart */}
      {cryptos.length > 1 && assetProjections.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold mb-4">Asset Comparison (10Y)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={assetProjections} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              {cryptos.map((c: any, i: number) => (
                <Line key={c.symbol} type="monotone" dataKey={c.symbol} stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2} dot={false} name={c.symbol} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Add Crypto Form */}
      {showAdd && (
        <div className="rounded-xl border border-primary/30 bg-card p-5">
          <h3 className="text-sm font-bold mb-4">Add Crypto Asset</h3>
          <CryptoEditForm data={draft} onChange={handleDraftChange} />
          <div className="flex gap-2 mt-4">
            <SaveButton label="Save Crypto Scenario" onSave={() => createMut.mutateAsync(normaliseCrypto(draft))} />
            <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Assets Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-bold">Holdings</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                {['Asset', 'Holdings', 'Price', 'Value', 'Exp. Return', '10Y Value', 'DCA', 'Actions'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cryptos.map((c: any, i: number) => {
                const val = (c.current_holding || 0) * (c.current_price || 0);
                const proj10 = projectInvestment(val, c.expected_return, c.monthly_dca || 0, 10)[9]?.value || 0;

                if (editingId === c.id && editDraft) {
                  return (
                    <tr key={c.id} className="border-b border-border bg-secondary/20">
                      <td className="p-2" colSpan={8}>
                        <CryptoEditForm data={editDraft} onChange={handleEditDraftChange} />
                        <div className="flex gap-2 mt-2">
                          <SaveButton label="Save Crypto Scenario" onSave={() => updateMut.mutateAsync({ id: c.id, data: normaliseCrypto(editDraft) })} />
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
                          style={{ background: COLORS[i % COLORS.length] + '20', color: COLORS[i % COLORS.length] }}>
                          {c.symbol?.charAt(0)}
                        </div>
                        <div>
                          <p className="text-xs font-bold">{c.symbol}</p>
                          <p className="text-xs text-muted-foreground">{c.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs num-display">{c.current_holding || 0}</td>
                    <td className="px-3 py-2.5 text-xs num-display">{formatCurrency(c.current_price || 0)}</td>
                    <td className="px-3 py-2.5 text-xs num-display font-semibold">{formatCurrency(val, true)}</td>
                    <td className="px-3 py-2.5 text-xs">{c.expected_return}%</td>
                    <td className="px-3 py-2.5 text-xs num-display text-emerald-400">{formatCurrency(proj10, true)}</td>
                    <td className="px-3 py-2.5 text-xs num-display text-primary">{formatCurrency(c.monthly_dca || 0)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="w-6 h-6"
                          onClick={() => { setEditingId(c.id); setEditDraft({ ...c }); }}>
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="w-6 h-6 text-red-400"
                          onClick={() => { if (confirm('Delete?')) deleteMut.mutate(c.id); }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 10Y table */}
      {combinedProjection.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold mb-4">Year-by-Year Projection</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {['Year', 'Total Invested', 'Portfolio Value', 'Gain'].map(h => (
                    <th key={h} className="text-left pb-2 pr-4 text-muted-foreground font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {combinedProjection.map(p => (
                  <tr key={p.year} className="border-b border-border/40 hover:bg-secondary/20">
                    <td className="py-1.5 pr-4 font-semibold text-primary">{p.year}</td>
                    <td className="py-1.5 pr-4 num-display">{formatCurrency(p.invested, true)}</td>
                    <td className="py-1.5 pr-4 num-display text-emerald-400 font-bold">{formatCurrency(p.value, true)}</td>
                    <td className="py-1.5 pr-4 num-display text-primary">{formatCurrency(p.value - p.invested, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

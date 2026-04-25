import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, projectInvestment, calcCAGR } from "@/lib/finance";
import SaveButton from "@/components/SaveButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from "recharts";
import { Plus, Trash2, Edit2, TrendingUp, Save } from "lucide-react";

const COLORS = ['hsl(43,85%,55%)', 'hsl(188,60%,48%)', 'hsl(142,60%,45%)', 'hsl(20,80%,55%)', 'hsl(270,60%,60%)', 'hsl(0,72%,51%)', 'hsl(60,80%,50%)', 'hsl(300,60%,55%)', 'hsl(200,70%,55%)'];

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

export default function StocksPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({
    ticker: '', name: '', current_price: 0, current_holding: 0,
    allocation_pct: 0, expected_return: 12, monthly_dca: 0,
    annual_lump_sum: 0, projection_years: 10,
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<any>(null);

  const { data: stocks = [] } = useQuery<any[]>({
    queryKey: ['/api/stocks'],
    queryFn: () => apiRequest('GET', '/api/stocks').then(r => r.json())
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/stocks', data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/stocks'] }); setShowAdd(false); }
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest('PUT', `/api/stocks/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/stocks'] }); setEditingId(null); }
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/stocks/${id}`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/stocks'] })
  });

  const totalValue = stocks.reduce((s: number, st: any) => s + (st.current_holding * st.current_price), 0);
  const totalHolding = stocks.reduce((s: number, st: any) => s + st.current_holding, 0);

  // Portfolio 10-year projection (combined)
  const combinedProjection = useMemo(() => {
    const years = 10;
    const result = [];
    for (let y = 1; y <= years; y++) {
      let totalVal = 0;
      let totalInv = 0;
      for (const s of stocks) {
        const initVal = s.current_holding * s.current_price;
        const proj = projectInvestment(initVal, s.expected_return, s.monthly_dca || 0, y);
        const last = proj[y - 1];
        if (last) { totalVal += last.value; totalInv += last.totalInvested; }
      }
      result.push({ year: (new Date().getFullYear() + y).toString(), value: Math.round(totalVal), invested: Math.round(totalInv) });
    }
    return result;
  }, [stocks]);

  const allocationData = stocks.map((s: any, i: number) => ({
    name: s.ticker,
    value: s.current_holding * s.current_price || 1,
    color: COLORS[i % COLORS.length],
  })).filter((d: any) => d.value > 0);

  const year10Val = combinedProjection[9]?.value || 0;
  const cagr = calcCAGR(totalValue || 1, year10Val || 1, 10);

  const StockRow = ({ stock, idx }: { stock: any; idx: number }) => {
    const val = stock.current_holding * stock.current_price;
    const isEditing = editingId === stock.id;
    const proj = projectInvestment(val, stock.expected_return, stock.monthly_dca || 0, 10);
    const proj10 = proj[9]?.value || val;
    const gain = proj10 - (proj[9]?.totalInvested || val);

    if (isEditing && editDraft) {
      return (
        <tr className="border-b border-border bg-secondary/20">
          <td className="p-2" colSpan={8}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: 'Ticker', key: 'ticker', type: 'text' },
                { label: 'Name', key: 'name', type: 'text' },
                { label: 'Price ($)', key: 'current_price', type: 'number' },
                { label: 'Holding (shares)', key: 'current_holding', type: 'number' },
                { label: 'Expected Return %', key: 'expected_return', type: 'number' },
                { label: 'Monthly DCA ($)', key: 'monthly_dca', type: 'number' },
                { label: 'Annual Lump Sum ($)', key: 'annual_lump_sum', type: 'number' },
                { label: 'Projection Years', key: 'projection_years', type: 'number' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-muted-foreground">{f.label}</label>
                  <Input
                    type={f.type}
                    value={editDraft[f.key]}
                    onChange={e => setEditDraft({ ...editDraft, [f.key]: f.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <SaveButton label="Save Stock Scenario" onSave={() => updateMut.mutateAsync({ id: stock.id, data: editDraft })} />
              <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
            </div>
          </td>
        </tr>
      );
    }

    return (
      <tr className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
              style={{ background: COLORS[idx % COLORS.length] + '20', color: COLORS[idx % COLORS.length] }}>
              {stock.ticker?.charAt(0)}
            </div>
            <div>
              <p className="text-xs font-bold">{stock.ticker}</p>
              <p className="text-xs text-muted-foreground truncate max-w-[100px]">{stock.name}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs num-display">{stock.current_holding || 0} shares</td>
        <td className="px-3 py-2.5 text-xs num-display">{formatCurrency(stock.current_price || 0)}</td>
        <td className="px-3 py-2.5 text-xs num-display font-semibold">{formatCurrency(val, true)}</td>
        <td className="px-3 py-2.5 text-xs">{stock.expected_return}%</td>
        <td className="px-3 py-2.5 text-xs num-display text-emerald-400">{formatCurrency(proj10, true)}</td>
        <td className="px-3 py-2.5 text-xs num-display text-primary">{formatCurrency(stock.monthly_dca || 0)}</td>
        <td className="px-3 py-2.5">
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="w-6 h-6"
              onClick={() => { setEditingId(stock.id); setEditDraft({ ...stock }); }}>
              <Edit2 className="w-3 h-3" />
            </Button>
            <Button size="icon" variant="ghost" className="w-6 h-6 text-red-400"
              onClick={() => { if (confirm('Delete?')) deleteMut.mutate(stock.id); }}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Stock Portfolio</h1>
          <p className="text-muted-foreground text-sm">US & International equities with DCA planning</p>
        </div>
        <Button
          onClick={() => setShowAdd(true)}
          className="gap-2"
          style={{ background: 'linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))', color: 'hsl(224,40%,8%)', border: 'none' }}
          data-testid="button-add-stock"
        >
          <Plus className="w-4 h-4" /> Add Stock
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Value', value: formatCurrency(totalValue, true), color: '' },
          { label: '10Y Projected', value: formatCurrency(year10Val, true), color: 'text-emerald-400' },
          { label: 'CAGR', value: `${cagr.toFixed(1)}%`, color: 'text-primary' },
          { label: 'Holdings', value: stocks.length.toString(), color: '' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-lg font-bold num-display mt-1 ${s.color}`}>{s.value}</p>
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
                <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(43,85%,55%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(43,85%,55%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="value" stroke="hsl(43,85%,55%)" fill="url(#stockGrad)" strokeWidth={2} name="Portfolio Value" />
              <Area type="monotone" dataKey="invested" stroke="hsl(188,60%,48%)" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="Total Invested" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold mb-4">Portfolio Allocation</h3>
          {allocationData.length > 0 ? (
            <div className="flex items-center gap-3">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={allocationData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                    {allocationData.map((d: any, i: number) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v, true)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5 text-xs">
                {allocationData.map((d: any) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                      <span className="text-muted-foreground">{d.name}</span>
                    </div>
                    <span className="font-bold num-display">{formatCurrency(d.value, true)}</span>
                  </div>
                ))}
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

      {/* Add Stock Form */}
      {showAdd && (
        <div className="rounded-xl border border-primary/30 bg-card p-5">
          <h3 className="text-sm font-bold mb-4">Add Stock</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Ticker', key: 'ticker', type: 'text' },
              { label: 'Company Name', key: 'name', type: 'text' },
              { label: 'Current Price ($)', key: 'current_price', type: 'number' },
              { label: 'Shares Held', key: 'current_holding', type: 'number' },
              { label: 'Expected Return %', key: 'expected_return', type: 'number' },
              { label: 'Monthly DCA ($)', key: 'monthly_dca', type: 'number' },
              { label: 'Annual Lump Sum ($)', key: 'annual_lump_sum', type: 'number' },
              { label: 'Projection Years', key: 'projection_years', type: 'number' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-muted-foreground">{f.label}</label>
                <Input
                  type={f.type}
                  value={(draft as any)[f.key]}
                  onChange={e => setDraft({ ...draft, [f.key]: f.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value })}
                  className="h-8 text-sm"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <SaveButton label="Save Stock Scenario" onSave={() => createMut.mutateAsync(draft)} />
            <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Stock Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-bold">Holdings</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                {['Stock', 'Shares', 'Price', 'Value', 'Expected Return', '10Y Value', 'Monthly DCA', 'Actions'].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stocks.map((s: any, i: number) => <StockRow key={s.id} stock={s} idx={i} />)}
            </tbody>
            {stocks.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-secondary/20">
                  <td className="px-3 py-2.5 text-xs font-bold" colSpan={3}>TOTAL</td>
                  <td className="px-3 py-2.5 text-xs font-bold num-display">{formatCurrency(totalValue, true)}</td>
                  <td></td>
                  <td className="px-3 py-2.5 text-xs font-bold num-display text-emerald-400">{formatCurrency(year10Val, true)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 10Y Year-by-Year Table */}
      {combinedProjection.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold mb-4">Year-by-Year Projection</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left pb-2 pr-4 text-muted-foreground font-semibold">Year</th>
                  <th className="text-left pb-2 pr-4 text-muted-foreground font-semibold">Total Invested</th>
                  <th className="text-left pb-2 pr-4 text-muted-foreground font-semibold">Portfolio Value</th>
                  <th className="text-left pb-2 pr-4 text-muted-foreground font-semibold">Gain</th>
                </tr>
              </thead>
              <tbody>
                {combinedProjection.map((p) => (
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

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, calcMonthlyRepayment, projectProperty } from "@/lib/finance";
import SaveButton from "@/components/SaveButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend
} from "recharts";
import { Plus, Trash2, Edit2, Home, Building, ChevronDown, ChevronUp } from "lucide-react";

const EMPTY_PROPERTY = {
  name: 'New Investment Property',
  type: 'investment',
  purchase_price: 750000,
  current_value: 750000,
  purchase_date: '',
  loan_amount: 600000,
  interest_rate: 6.5,
  loan_type: 'PI',
  loan_term: 30,
  weekly_rent: 550,
  rental_growth: 3,
  vacancy_rate: 2,
  management_fee: 8,
  council_rates: 2200,
  insurance: 1800,
  maintenance: 2000,
  capital_growth: 6,
  deposit: 150000,
  stamp_duty: 25000,
  legal_fees: 2000,
  selling_costs: 2.5,
  projection_years: 10,
  notes: '',
};

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

export default function PropertyPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<any>({ ...EMPTY_PROPERTY });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<any>(null);

  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ['/api/properties'],
    queryFn: () => apiRequest('GET', '/api/properties').then(r => r.json())
  });

  const createMut = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/properties', data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/properties'] }); setShowAdd(false); }
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => apiRequest('PUT', `/api/properties/${id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/properties'] }); setEditingId(null); }
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/properties/${id}`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['/api/properties'] })
  });

  // PPOR = first property of type 'ppor' or snapshot
  const pporProps = properties.filter((p: any) => p.type === 'ppor');
  const ipProps = properties.filter((p: any) => p.type !== 'ppor');

  const portfolioValue = properties.reduce((s: number, p: any) => s + p.current_value, 0);
  const portfolioLoans = properties.reduce((s: number, p: any) => s + p.loan_amount, 0);
  const portfolioEquity = portfolioValue - portfolioLoans;

  const Field = ({ label, value, onChange, type = 'number', step = '1000', prefix = '$' }: any) => (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <div className="relative">
        {prefix && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{prefix}</span>}
        <Input
          type={type}
          value={value}
          onChange={e => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
          step={step}
          className={`h-8 text-sm num-display ${prefix ? 'pl-6' : ''}`}
        />
      </div>
    </div>
  );

  const PropertyForm = ({ data, onChange }: any) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <div className="col-span-2 sm:col-span-3 lg:col-span-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Property Name</label>
            <Input value={data.name} onChange={e => onChange({ ...data, name: e.target.value })} className="h-8 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Type</label>
            <Select value={data.type} onValueChange={v => onChange({ ...data, type: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ppor">PPOR (Primary Residence)</SelectItem>
                <SelectItem value="investment">Investment Property</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <Field label="Current Value" value={data.current_value} onChange={(v: number) => onChange({ ...data, current_value: v })} />
      <Field label="Loan Amount" value={data.loan_amount} onChange={(v: number) => onChange({ ...data, loan_amount: v })} />
      <Field label="Interest Rate %" value={data.interest_rate} onChange={(v: number) => onChange({ ...data, interest_rate: v })} step="0.1" prefix="%" />
      <Field label="Loan Term (yrs)" value={data.loan_term} onChange={(v: number) => onChange({ ...data, loan_term: v })} step="1" prefix="" />
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Loan Type</label>
        <Select value={data.loan_type} onValueChange={v => onChange({ ...data, loan_type: v })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PI">Principal & Interest</SelectItem>
            <SelectItem value="IO">Interest Only</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Field label="Capital Growth %" value={data.capital_growth} onChange={(v: number) => onChange({ ...data, capital_growth: v })} step="0.5" prefix="%" />
      <Field label="Weekly Rent" value={data.weekly_rent} onChange={(v: number) => onChange({ ...data, weekly_rent: v })} />
      <Field label="Rental Growth %" value={data.rental_growth} onChange={(v: number) => onChange({ ...data, rental_growth: v })} step="0.5" prefix="%" />
      <Field label="Vacancy %" value={data.vacancy_rate} onChange={(v: number) => onChange({ ...data, vacancy_rate: v })} step="0.5" prefix="%" />
      <Field label="Mgmt Fee %" value={data.management_fee} onChange={(v: number) => onChange({ ...data, management_fee: v })} step="0.5" prefix="%" />
      <Field label="Council Rates" value={data.council_rates} onChange={(v: number) => onChange({ ...data, council_rates: v })} />
      <Field label="Insurance" value={data.insurance} onChange={(v: number) => onChange({ ...data, insurance: v })} />
      <Field label="Maintenance" value={data.maintenance} onChange={(v: number) => onChange({ ...data, maintenance: v })} />
      <Field label="Stamp Duty" value={data.stamp_duty} onChange={(v: number) => onChange({ ...data, stamp_duty: v })} />
      <Field label="Legal Fees" value={data.legal_fees} onChange={(v: number) => onChange({ ...data, legal_fees: v })} />
      <Field label="Selling Costs %" value={data.selling_costs} onChange={(v: number) => onChange({ ...data, selling_costs: v })} step="0.5" prefix="%" />
      <Field label="Projection Years" value={data.projection_years} onChange={(v: number) => onChange({ ...data, projection_years: Math.min(30, Math.max(1, v)) })} step="1" prefix="" />
    </div>
  );

  const PropertyCard = ({ prop }: { prop: any }) => {
    const isExpanded = expandedId === prop.id;
    const isEditing = editingId === prop.id;
    const projection = projectProperty(prop);
    const monthly = calcMonthlyRepayment(prop.loan_amount, prop.interest_rate, prop.loan_term);
    const equity = prop.current_value - prop.loan_amount;

    const chartData = projection.map(p => ({
      year: p.year.toString(),
      value: p.value,
      loan: p.loanBalance,
      equity: p.equity,
    }));

    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Header */}
        <div className="p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: prop.type === 'ppor' ? 'rgba(142,200,100,0.1)' : 'rgba(196,165,90,0.1)' }}>
            {prop.type === 'ppor' ? <Home className="w-4 h-4 text-emerald-400" /> : <Building className="w-4 h-4 text-primary" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold truncate">{prop.name}</p>
            <p className="text-xs text-muted-foreground">
              {prop.type === 'ppor' ? 'Primary Residence' : 'Investment Property'} · {prop.loan_type}
            </p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground">Value</p>
            <p className="text-sm font-bold num-display">{formatCurrency(prop.current_value, true)}</p>
          </div>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="w-7 h-7"
              onClick={() => { setEditingId(prop.id); setEditDraft({ ...prop }); }}>
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="w-7 h-7 text-red-400 hover:text-red-300"
              onClick={() => { if (confirm('Delete this property?')) deleteMut.mutate(prop.id); }}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="w-7 h-7"
              onClick={() => setExpandedId(isExpanded ? null : prop.id)}>
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-4 gap-px bg-border">
          {[
            { label: 'Value', value: formatCurrency(prop.current_value, true), color: '' },
            { label: 'Loan', value: formatCurrency(prop.loan_amount, true), color: 'text-red-400' },
            { label: 'Equity', value: formatCurrency(equity, true), color: 'text-emerald-400' },
            { label: 'Monthly Pmt', value: formatCurrency(monthly, true), color: 'text-primary' },
          ].map(s => (
            <div key={s.label} className="bg-secondary/30 p-2 text-center">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-xs font-bold num-display ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {isEditing && editDraft && (
          <div className="p-4 border-t border-border bg-secondary/20">
            <PropertyForm data={editDraft} onChange={setEditDraft} />
            <div className="flex gap-2 mt-4">
              <SaveButton label="Save Property Scenario"
                onSave={() => updateMut.mutateAsync({ id: prop.id, data: editDraft })} />
              <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
            </div>
          </div>
        )}

        {isExpanded && !isEditing && (
          <div className="p-4 border-t border-border">
            {/* Projection Chart */}
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Value vs Debt Projection</h4>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="valGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142,60%,45%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142,60%,45%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(43,85%,55%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(43,85%,55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(220,10%,55%)' }} tickFormatter={v => `$${(v/1000000).toFixed(1)}M`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="value" stroke="hsl(142,60%,45%)" fill="url(#valGrad)" strokeWidth={2} name="Value" />
                <Area type="monotone" dataKey="equity" stroke="hsl(43,85%,55%)" fill="url(#equityGrad)" strokeWidth={2} name="Equity" />
                <Line type="monotone" dataKey="loan" stroke="hsl(0,72%,51%)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Loan" />
              </AreaChart>
            </ResponsiveContainer>

            {/* Year table (compact) */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    {['Year', 'Value', 'Loan', 'Equity', 'Rent (Net)', 'Net CF'].map(h => (
                      <th key={h} className="text-left pb-2 pr-4 text-muted-foreground font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projection.map(p => (
                    <tr key={p.year} className="border-b border-border/40 hover:bg-secondary/20">
                      <td className="py-1.5 pr-4 font-semibold text-primary">{p.year}</td>
                      <td className="py-1.5 pr-4 num-display">{formatCurrency(p.value, true)}</td>
                      <td className="py-1.5 pr-4 num-display text-red-400">{formatCurrency(p.loanBalance, true)}</td>
                      <td className="py-1.5 pr-4 num-display text-emerald-400">{formatCurrency(p.equity, true)}</td>
                      <td className="py-1.5 pr-4 num-display">{formatCurrency(p.rentalIncome, true)}</td>
                      <td className={`py-1.5 pr-4 num-display ${p.netCashFlow >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatCurrency(p.netCashFlow, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Property costs breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 text-xs">
              {[
                { label: 'Weekly Rent', value: formatCurrency(prop.weekly_rent) },
                { label: 'Annual Rental', value: formatCurrency(prop.weekly_rent * 52) },
                { label: 'Vacancy Loss', value: `${prop.vacancy_rate}%` },
                { label: 'Mgmt Fee', value: `${prop.management_fee}%` },
                { label: 'Council Rates', value: formatCurrency(prop.council_rates) },
                { label: 'Insurance', value: formatCurrency(prop.insurance) },
              ].map(item => (
                <div key={item.label} className="bg-secondary/30 rounded-lg p-2">
                  <p className="text-muted-foreground">{item.label}</p>
                  <p className="font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Property Portfolio</h1>
          <p className="text-muted-foreground text-sm">Queensland-focused property investment planning</p>
        </div>
        <Button
          onClick={() => { setShowAdd(true); setDraft({ ...EMPTY_PROPERTY }); }}
          className="gap-2"
          style={{ background: 'linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))', color: 'hsl(224,40%,8%)', border: 'none' }}
          data-testid="button-add-property"
        >
          <Plus className="w-4 h-4" /> Add Property
        </Button>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Portfolio Value', value: formatCurrency(portfolioValue, true), color: '' },
          { label: 'Total Loans', value: formatCurrency(portfolioLoans, true), color: 'text-red-400' },
          { label: 'Total Equity', value: formatCurrency(portfolioEquity, true), color: 'text-emerald-400' },
          { label: 'Properties', value: properties.length.toString(), color: 'text-primary' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-lg font-bold num-display mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Add Property Form */}
      {showAdd && (
        <div className="rounded-xl border border-primary/30 bg-card p-5">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> Add Property
          </h3>
          <PropertyForm data={draft} onChange={setDraft} />
          <div className="flex gap-2 mt-4">
            <SaveButton label="Save Property Scenario" onSave={() => createMut.mutateAsync(draft)} />
            <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Property List */}
      {properties.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Home className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted-foreground">No properties added yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Add your PPOR and investment properties to start planning.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map((p: any) => <PropertyCard key={p.id} prop={p} />)}
        </div>
      )}

      {/* Default PPOR info */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold mb-3">PPOR Snapshot (from Dashboard)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {[
            { label: 'Current Value', value: '$1,510,000' },
            { label: 'Mortgage Balance', value: '$1,200,000' },
            { label: 'Equity', value: '$310,000' },
            { label: 'LVR', value: '79.5%' },
          ].map(i => (
            <div key={i.label} className="bg-secondary/40 rounded-lg p-3">
              <p className="text-muted-foreground">{i.label}</p>
              <p className="font-bold mt-1">{i.value}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Edit PPOR values in the Dashboard Financial Snapshot section. No CGT or GST applies to primary residences.
        </p>
      </div>
    </div>
  );
}

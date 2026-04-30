/**
 * tax-alpha.tsx — Full Tax Alpha Breakdown Page
 * Route: rendered as a tab inside /tax
 *
 * Shows all 8 AU tax strategies with full detail:
 * savings estimate, impact explanation, compliance notes, risk badge.
 */

import { useQuery } from '@tanstack/react-query';
import {
  computeTaxAlpha,
  buildTaxAlphaInput,
  type TaxAlphaStrategy,
  type TaxAlphaResult,
} from '@/lib/taxAlphaEngine';
import { useAppStore } from '@/lib/store';
import { maskValue } from '@/components/PrivacyMask';
import { formatCurrency } from '@/lib/finance';
import {
  Zap, Shield, AlertTriangle, CheckCircle2,
  ChevronDown, ChevronUp, Info, DollarSign,
  TrendingDown, TrendingUp, Home, PiggyBank,
  Users, BarChart2, CreditCard, Percent,
} from 'lucide-react';
import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n <= 0) return '$0';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString('en-AU')}`;
}

// ─── Category metadata ────────────────────────────────────────────────────────

const CAT_META: Record<string, { label: string; color: string; bg: string; border: string; Icon: any }> = {
  super:            { label: 'Super',           color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/25', Icon: PiggyBank },
  negative_gearing: { label: 'Neg. Gearing',    color: 'text-emerald-400',bg: 'bg-emerald-500/10',border: 'border-emerald-500/25',Icon: TrendingDown },
  offset:           { label: 'Offset',          color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/25',   Icon: Home },
  capital_gains:    { label: 'CGT',             color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/25',  Icon: BarChart2 },
  spouse_split:     { label: 'Spouse Split',    color: 'text-pink-400',   bg: 'bg-pink-500/10',   border: 'border-pink-500/25',   Icon: Users },
  medicare:         { label: 'Medicare',        color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/25',   Icon: Shield },
  debt_structure:   { label: 'Debt Structure',  color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/25', Icon: CreditCard },
  bracket:          { label: 'Bracket Optim.',  color: 'text-rose-400',   bg: 'bg-rose-500/10',   border: 'border-rose-500/25',   Icon: Percent },
};

// ─── Risk badge ───────────────────────────────────────────────────────────────

function RiskBadge({ risk }: { risk: TaxAlphaStrategy['risk'] }) {
  const cfg = {
    Low:    { cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', label: 'Low Risk' },
    Medium: { cls: 'bg-amber-500/20   text-amber-300   border-amber-500/30',   label: 'Medium Risk' },
    High:   { cls: 'bg-red-500/20     text-red-300     border-red-500/30',     label: 'High Risk' },
  }[risk];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.cls}`}>
      {risk === 'Low' && <CheckCircle2 className="w-2.5 h-2.5" />}
      {risk === 'Medium' && <AlertTriangle className="w-2.5 h-2.5" />}
      {risk === 'High' && <Shield className="w-2.5 h-2.5" />}
      {cfg.label}
    </span>
  );
}

// ─── Strategy card ────────────────────────────────────────────────────────────

function StrategyCard({ s, rank }: { s: TaxAlphaStrategy; rank: number }) {
  const [open, setOpen] = useState(rank <= 3); // top 3 open by default
  const meta = CAT_META[s.category] ?? { label: s.category, color: 'text-muted-foreground', bg: 'bg-secondary/40', border: 'border-border', Icon: DollarSign };
  const Icon = meta.Icon;
  const hasValue = s.annual_saving > 0;

  return (
    <div className={`rounded-2xl border ${s.data_reliable ? meta.border : 'border-border'} ${meta.bg} overflow-hidden`}>
      {/* Header row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        {/* Rank badge */}
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-black ${
          rank <= 3 ? 'bg-emerald-500/25 text-emerald-300' : 'bg-secondary text-muted-foreground'
        }`}>
          #{rank}
        </div>

        {/* Icon */}
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${meta.bg} ${meta.border}`}>
          <Icon className={`w-4 h-4 ${meta.color}`} />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
            <RiskBadge risk={s.risk} />
            {!s.data_reliable && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 font-semibold">Needs setup</span>
            )}
          </div>
          <div className="text-sm font-bold text-foreground leading-snug mt-0.5 truncate">{s.title}</div>
        </div>

        {/* Saving */}
        <div className="text-right shrink-0">
          <div className={`text-base font-black ${hasValue ? 'text-emerald-400' : 'text-muted-foreground'}`}>
            {s.annual_saving_label}
          </div>
          {hasValue && <div className="text-[9px] text-muted-foreground">estimated/yr</div>}
        </div>

        <div className="text-muted-foreground ml-1">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expanded detail */}
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/40">
          {/* Action */}
          <div className="flex items-start gap-2 mt-3">
            <Zap className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${meta.color}`} />
            <p className="text-xs font-semibold text-foreground">{s.action}</p>
          </div>

          {/* Impact */}
          <div className="flex items-start gap-2">
            <TrendingUp className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">{s.impact}</p>
          </div>

          {/* Compliance */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-secondary/40 border border-border/50">
            <Info className="w-3.5 h-3.5 mt-0.5 text-blue-400 shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">{s.compliance}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Summary chart ────────────────────────────────────────────────────────────

function SavingsChart({ strategies, mv }: { strategies: TaxAlphaStrategy[]; mv: (v: string) => string }) {
  const data = strategies
    .filter(s => s.annual_saving > 0 && s.data_reliable)
    .map(s => ({
      name: CAT_META[s.category]?.label ?? s.category,
      saving: Math.round(s.annual_saving),
    }));

  if (data.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Annual Savings by Strategy</div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+'K' : v}`} />
          <Tooltip
            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
            labelStyle={{ color: 'hsl(var(--foreground))', fontSize: 11 }}
            formatter={(v: number) => [`$${v.toLocaleString('en-AU')}`, 'Annual saving']}
          />
          <Bar dataKey="saving" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={['#34d399', '#a78bfa', '#38bdf8', '#fbbf24', '#f472b6', '#60a5fa', '#fb923c', '#f87171'][i % 8]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TaxAlphaPage() {
  const privacyMode = useAppStore(s => s.privacyMode);
  const mv = (v: string) => maskValue(v, privacyMode);

  const { data: snap } = useQuery<any>({ queryKey: ['/api/snapshots/latest'] });
  const { data: properties = [] } = useQuery<any[]>({ queryKey: ['/api/properties'] });

  if (!snap) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-secondary/40 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  const input  = buildTaxAlphaInput(snap, properties);
  const result = computeTaxAlpha(input);
  const { strategies, top3, total_annual_saving, total_saving_label,
    roham_tax_now, fara_tax_now, household_tax_now, data_coverage, fy } = result;

  return (
    <div className="space-y-5">

      {/* ── Summary KPIs ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Potential Savings', value: mv(total_saving_label), sub: 'top strategies', color: 'text-emerald-400' },
          { label: 'Household Tax Now', value: mv(formatCurrency(household_tax_now, true)), sub: 'PAYG + Medicare/yr', color: 'text-foreground' },
          { label: 'Roham Tax Eff. Rate', value: `${(roham_tax_now.effectiveTaxRate * 100).toFixed(1)}%`, sub: `on ${mv(formatCurrency(roham_tax_now.annualGross, true))}`, color: 'text-foreground' },
          { label: 'Strategies Found', value: `${strategies.filter(s => s.annual_saving > 500).length}`, sub: `${data_coverage} data · FY ${fy}`, color: 'text-amber-400' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-card border border-border rounded-xl p-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
            <div className={`text-lg font-black leading-tight ${color}`}>{value}</div>
            <div className="text-[9px] text-muted-foreground mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Data coverage warning */}
      {data_coverage !== 'full' && (
        <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">
            {data_coverage === 'partial'
              ? 'Some data is missing (Fara income, portfolio values). Savings estimates are conservative. Add data in Settings and Property page for full analysis.'
              : 'Income data is not set up. Strategies cannot be reliably calculated. Go to Settings → Income to add income details.'}
          </p>
        </div>
      )}

      {/* ── Savings chart ──────────────────────────────────────────────────── */}
      <SavingsChart strategies={strategies} mv={mv} />

      {/* ── Current tax position ──────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Current Tax Position — FY {fy}</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          {[
            { label: 'Roham Gross', value: mv(formatCurrency(roham_tax_now.annualGross)) },
            { label: 'Roham Taxable Income', value: mv(formatCurrency(roham_tax_now.taxableIncome)) },
            { label: 'Roham Income Tax', value: mv(formatCurrency(roham_tax_now.incomeTax)) },
            { label: 'Roham Medicare Levy', value: mv(formatCurrency(roham_tax_now.medicareLevy + roham_tax_now.medicareLevySurcharge)) },
            { label: 'Roham Total Deductions', value: mv(formatCurrency(roham_tax_now.totalDeductions)) },
            { label: 'Roham Net Monthly', value: mv(formatCurrency(roham_tax_now.netMonthly)) },
          ].concat(fara_tax_now.annualGross > 0 ? [
            { label: 'Fara Gross', value: mv(formatCurrency(fara_tax_now.annualGross)) },
            { label: 'Fara Taxable Income', value: mv(formatCurrency(fara_tax_now.taxableIncome)) },
            { label: 'Fara Total Deductions', value: mv(formatCurrency(fara_tax_now.totalDeductions)) },
          ] : []).map(({ label, value }) => (
            <div key={label} className="bg-secondary/30 rounded-xl p-2.5">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">{label}</div>
              <div className="font-bold text-foreground">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Strategy cards ─────────────────────────────────────────────────── */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">All Strategies ({strategies.length})</div>
        <div className="space-y-3">
          {strategies.map((s, i) => (
            <StrategyCard key={s.id} s={s} rank={i + 1} />
          ))}
        </div>
      </div>

      {/* ── Disclaimer ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 p-4 bg-secondary/30 border border-border rounded-xl">
        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">General information only.</strong> These calculations are based on ATO published rates for FY 2025-26 and your entered financial data.
          They do not constitute tax advice. Savings estimates are indicative and depend on individual circumstances, ATO interpretation, and proper implementation.
          Consult a registered tax agent or financial adviser before acting on any strategy. Rules correct as at 1 July 2025.
        </p>
      </div>

    </div>
  );
}

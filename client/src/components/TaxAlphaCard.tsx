/**
 * TaxAlphaCard.tsx — Dashboard compact card for Tax Alpha Engine
 *
 * Shows total potential saving + top 3 strategies.
 * Links to full /tax page (Tax Alpha tab).
 */

import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { computeTaxAlpha, buildTaxAlphaInput, type TaxAlphaStrategy } from '@/lib/taxAlphaEngine';
import { useAppStore } from '@/lib/store';
import { maskValue } from '@/components/PrivacyMask';
import { Link } from 'wouter';
import {
  TrendingUp, Shield, AlertTriangle, CheckCircle2,
  ChevronRight, Zap, DollarSign,
} from 'lucide-react';
import { formatCurrency } from '@/lib/finance';

// ─── Risk badge ───────────────────────────────────────────────────────────────
function RiskBadge({ risk }: { risk: TaxAlphaStrategy['risk'] }) {
  const cfg = {
    Low:    { cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: <CheckCircle2 className="w-2.5 h-2.5" /> },
    Medium: { cls: 'bg-amber-500/20   text-amber-300   border-amber-500/30',   icon: <AlertTriangle className="w-2.5 h-2.5" /> },
    High:   { cls: 'bg-red-500/20     text-red-300     border-red-500/30',     icon: <Shield className="w-2.5 h-2.5" /> },
  }[risk];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border ${cfg.cls}`}>
      {cfg.icon} {risk}
    </span>
  );
}

// ─── Category colour ──────────────────────────────────────────────────────────
const CAT_COLOR: Record<string, string> = {
  super:            'text-violet-400',
  negative_gearing: 'text-emerald-400',
  offset:           'text-cyan-400',
  capital_gains:    'text-amber-400',
  spouse_split:     'text-pink-400',
  medicare:         'text-blue-400',
  debt_structure:   'text-orange-400',
  bracket:          'text-rose-400',
};

const CAT_LABEL: Record<string, string> = {
  super:            'Super',
  negative_gearing: 'Neg. Gearing',
  offset:           'Offset',
  capital_gains:    'CGT',
  spouse_split:     'Spouse Split',
  medicare:         'Medicare',
  debt_structure:   'Debt',
  bracket:          'Bracket',
};

export default function TaxAlphaCard() {
  const privacyMode = useAppStore(s => s.privacyMode);
  const mv = (v: string) => maskValue(v, privacyMode);

  // Fetch snapshot + properties
  const { data: snap } = useQuery<any>({ queryKey: ['/api/snapshot'] });
  const { data: properties = [] } = useQuery<any[]>({ queryKey: ['/api/properties'] });

  if (!snap) {
    return (
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="h-4 bg-secondary rounded animate-pulse w-1/2 mb-3" />
        <div className="h-3 bg-secondary rounded animate-pulse w-3/4" />
      </div>
    );
  }

  const input  = buildTaxAlphaInput(snap, properties);
  const result = computeTaxAlpha(input);
  const { top3, total_annual_saving, total_saving_label, household_tax_now, data_coverage } = result;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground leading-tight">Tax Alpha Engine</div>
            <div className="text-[10px] text-muted-foreground">Australian optimisation · FY 2025-26</div>
          </div>
        </div>
        {data_coverage !== 'full' && (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25 font-semibold shrink-0">
            {data_coverage === 'partial' ? 'Partial data' : 'Minimal data'}
          </span>
        )}
      </div>

      {/* Saving KPI */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-3">
          <div className="text-[10px] text-emerald-400/80 uppercase tracking-wider mb-1">Potential Savings</div>
          <div className="text-xl font-black text-emerald-400 leading-tight">
            {mv(total_saving_label)}
          </div>
          <div className="text-[9px] text-muted-foreground mt-0.5">top strategies combined</div>
        </div>
        <div className="bg-secondary/40 border border-border rounded-xl p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Household Tax Now</div>
          <div className="text-xl font-black text-foreground leading-tight">
            {mv(formatCurrency(household_tax_now, true))}
          </div>
          <div className="text-[9px] text-muted-foreground mt-0.5">annual PAYG + Medicare</div>
        </div>
      </div>

      {/* Top 3 strategies */}
      <div className="space-y-2">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Top Opportunities</div>
        {top3.length === 0 && (
          <p className="text-xs text-muted-foreground">Set up income and property data to detect savings.</p>
        )}
        {top3.map((s) => (
          <div key={s.id} className="flex items-start gap-3 p-3 bg-secondary/30 rounded-xl border border-border/50">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] font-bold uppercase tracking-wide ${CAT_COLOR[s.category] ?? 'text-muted-foreground'}`}>
                  {CAT_LABEL[s.category] ?? s.category}
                </span>
                <RiskBadge risk={s.risk} />
              </div>
              <div className="text-xs font-semibold text-foreground leading-snug">{s.action}</div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-sm font-black ${s.annual_saving > 0 ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                {mv(s.annual_saving_label)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <Link href="/tax">
        <button className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-all">
          <DollarSign className="w-3.5 h-3.5" />
          Full Tax Alpha Breakdown
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </Link>

    </div>
  );
}

/**
 * FIREPathCard.tsx — Dashboard compact card for FIRE Fastest Path Optimizer
 * v2: Uses CSS theme tokens throughout (no hardcoded slate/zinc classes)
 */

import { useMemo } from "react";
import { useQuery }    from "@tanstack/react-query";
import { Link }        from "wouter";
import { Flame, ChevronRight, Zap } from "lucide-react";
import { computeFirePath, buildFirePathInput } from "@/lib/firePathEngine";
import { maskValue } from "@/components/PrivacyMask";
import { useAppStore } from "@/lib/store";

const safeNum = (v: unknown): number => {
  const n = parseFloat(String(v ?? 0));
  return isNaN(n) ? 0 : n;
};

const RISK_COLORS: Record<string, string> = {
  green:  '#22c55e',
  amber:  '#f59e0b',
  red:    '#ef4444',
  purple: '#a855f7',
};
const RISK_BG: Record<string, string> = {
  green:  'rgba(34,197,94,0.10)',
  amber:  'rgba(245,158,11,0.10)',
  red:    'rgba(239,68,68,0.10)',
  purple: 'rgba(168,85,247,0.10)',
};

export default function FIREPathCard() {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode, 'currency');

  const { data: snapRaw        } = useQuery({ queryKey: ["/api/snapshot"] });
  const { data: billsRaw       } = useQuery({ queryKey: ["/api/bills"] });
  const { data: settingsRaw    } = useQuery({ queryKey: ["/api/fire-settings"] });
  const { data: scenarioCfgRaw } = useQuery({ queryKey: ["/api/fire-scenario-config"] });
  const { data: yearAssumpRaw  } = useQuery({ queryKey: ["/api/fire-year-assumptions"] });

  const result = useMemo(() => {
    const snap       = (snapRaw  as any)?.[0] ?? snapRaw  ?? {};
    const bills      = Array.isArray(billsRaw)       ? billsRaw       : [];
    const scenarioCfg = Array.isArray(scenarioCfgRaw) ? scenarioCfgRaw : [];
    const yearAssump  = Array.isArray(yearAssumpRaw)  ? yearAssumpRaw  : [];
    const input = buildFirePathInput(
      snap, bills,
      (settingsRaw as any) ?? null,
      scenarioCfg,
      yearAssump,
    );
    return computeFirePath(input, (settingsRaw as any) ?? null);
  }, [snapRaw, billsRaw, settingsRaw, scenarioCfgRaw, yearAssumpRaw]);

  const best = result.scenarios.find(s => s.id === result.best_scenario)!;
  const fmt  = (n: number) => `$${n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(0) + 'K' : n.toFixed(0)}`;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden"
      style={{ boxShadow: '0 2px 20px rgba(0,0,0,0.12)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.25)' }}>
            <Flame size={15} className="text-orange-400" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-foreground">FIRE Path Optimizer</p>
            <p className="text-[10px] text-muted-foreground">Fastest path to financial independence</p>
          </div>
        </div>
        <Link href="/wealth-strategy">
          <button
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-orange-400 transition-colors"
            onClick={() => sessionStorage.setItem('wealth-strategy-tab', 'fire-path')}
          >
            Full Analysis <ChevronRight size={12} />
          </button>
        </Link>
      </div>

      {/* Best path callout */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Zap size={12} className="text-orange-400 shrink-0" />
          <p className="text-[11px] font-semibold text-orange-400 uppercase tracking-wider">Fastest Path</p>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-foreground">
              Option {best.id === 'property' ? 'A' : best.id === 'etf' ? 'B' : best.id === 'mixed' ? 'C' : 'D'} — {best.label}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              FIRE in <span className="text-orange-400 font-semibold">{best.fire_year}</span> · {best.years_to_fire}y away · {best.primary_vehicle}
            </p>
          </div>
          <div className="text-center px-3 py-2 rounded-xl"
            style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)' }}>
            <p className="text-lg font-black text-orange-400">{best.fire_year}</p>
            <p className="text-[9px] text-muted-foreground">FIRE Year</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-2.5">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>Progress toward FIRE target</span>
            <span className="text-orange-400 font-medium">{result.current_progress_pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${result.current_progress_pct}%`,
                background: 'linear-gradient(90deg, #f97316, #fb923c)',
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Target: {mv(fmt(result.target_capital))} · Semi-FIRE: {result.semi_fire_year}
          </p>
        </div>
      </div>

      {/* 4 Scenario pills */}
      <div className="px-4 py-3">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">All Scenarios</p>
        <div className="grid grid-cols-2 gap-1.5">
          {result.scenarios.map((s, i) => {
            const letter = ['A', 'B', 'C', 'D'][i];
            const isBest = s.id === result.best_scenario;
            return (
              <div key={s.id} className="rounded-xl px-2.5 py-2 relative"
                style={{
                  background: isBest ? 'rgba(249,115,22,0.10)' : RISK_BG[s.risk_color],
                  border: `1px solid ${isBest ? 'rgba(249,115,22,0.30)' : RISK_COLORS[s.risk_color] + '30'}`,
                }}>
                {isBest && (
                  <div className="absolute top-1.5 right-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(249,115,22,0.20)', color: '#f97316' }}>
                    BEST
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mb-0.5">{letter}. {s.label}</p>
                <p className="text-sm font-bold"
                  style={{ color: isBest ? '#f97316' : RISK_COLORS[s.risk_color] }}>
                  {s.fire_year}
                </p>
                <p className="text-[9px] text-muted-foreground">{s.risk_level} risk</p>
              </div>
            );
          })}
        </div>

        {result.fastest_vs_slowest_years > 0 && (
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Strategy choice spans <span className="text-foreground font-medium">{result.fastest_vs_slowest_years} years</span> difference in FIRE date
          </p>
        )}
      </div>
    </div>
  );
}

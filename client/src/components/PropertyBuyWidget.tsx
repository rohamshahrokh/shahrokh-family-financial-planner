/**
 * PropertyBuyWidget.tsx — compact "Buy vs Wait" teaser on Dashboard.
 *
 * Shows the current best recommendation and IRR comparison.
 * Links to the full analysis page.
 * Uses default inputs from Supabase snapshot.
 * 30-min sessionStorage cache.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'wouter';
import {
  Home, ArrowRight, Loader2, AlertTriangle,
  TrendingUp, Clock, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { maskValue } from '@/components/PrivacyMask';
import { useAppStore } from '@/lib/store';
import {
  computeAllScenarios, defaultScenarioInputs,
  type PropertyBuyResult,
} from '@/lib/propertyBuyEngine';

const CACHE_KEY = 'prop_buy_widget';
const CACHE_TTL = 30 * 60 * 1000;

function loadCache(): PropertyBuyResult | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data as PropertyBuyResult;
  } catch { return null; }
}
function saveCache(r: PropertyBuyResult) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: r, ts: Date.now() })); } catch { }
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export default function PropertyBuyWidget() {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);

  const [result, setResult]   = useState<PropertyBuyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    const cached = loadCache();
    if (cached) { setResult(cached); return; }
    setLoading(true);
    setError(null);
    try {
      // Fetch snapshot for defaults
      const res = await fetch(
        'https://uoraduyyxhtzixcsaidg.supabase.co/rest/v1/sf_snapshot?id=eq.shahrokh-family-main',
        {
          headers: {
            apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c',
            Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c',
          },
        }
      );
      const rows = res.ok ? await res.json() : [];
      const snap = rows?.[0] ?? {};
      const defaults = defaultScenarioInputs(snap);
      const r = computeAllScenarios(defaults);
      saveCache(r);
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !result) {
    return (
      <div className="rounded-2xl bg-card border border-border p-4 flex items-center gap-3">
        <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
        <p className="text-sm text-slate-400">Analysing property scenarios…</p>
      </div>
    );
  }

  if (error || !result) return null;

  const isBuyNow = result.best_scenario === 'buy_now';
  const best = isBuyNow ? result.buy_now : result.best_scenario === 'wait_6m' ? result.wait_6m : result.wait_12m!;
  const horizon = result.buy_now.yearly.length;

  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <Home className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <span className="text-sm font-bold text-foreground">Property: Buy vs Wait</span>
        </div>
        <span className="text-[10px] text-slate-500">{result.confidence}/100 confidence</span>
      </div>

      {/* Decision */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-1.5">
          {isBuyNow
            ? <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
            : <Clock className="w-4 h-4 text-amber-400 shrink-0" />
          }
          <span className={`text-sm font-bold ${isBuyNow ? 'text-emerald-300' : 'text-amber-300'}`}>
            {result.best_label}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
          {result.key_insight.slice(0, 160)}{result.key_insight.length > 160 ? '…' : ''}
        </p>

        {/* 3 scenario IRR comparison */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[result.buy_now, result.wait_6m, result.wait_12m].filter(Boolean).map(s => (
            <div
              key={s!.label}
              className={`rounded-xl p-2.5 border ${
                result.best_scenario === 'buy_now' && s!.label === result.buy_now.label ||
                result.best_scenario === 'wait_6m' && s!.label === result.wait_6m.label ||
                result.best_scenario === 'wait_12m' && s!.label === result.wait_12m?.label
                  ? 'bg-emerald-500/10 border-emerald-500/25'
                  : 'bg-secondary/30 border-border/40'
              }`}
            >
              <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1 truncate">{s!.label}</p>
              <p className="text-sm font-black text-foreground font-mono">{(s!.irr * 100).toFixed(1)}%</p>
              <p className="text-[10px] text-slate-400">IRR</p>
              <p className="text-[10px] text-emerald-400 mt-0.5">{mv(fmt(s!.equity_end))}</p>
              <p className="text-[9px] text-slate-600">{horizon}yr equity</p>
            </div>
          ))}
        </div>

        <Link href="/property">
          <Button
            size="sm"
            className="w-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 h-8 text-xs font-semibold gap-1.5"
            onClick={() => {
              // Signal property page to open the Buy vs Wait tab
              if (typeof window !== 'undefined') {
                sessionStorage.setItem('property_open_tab', 'buy-vs-wait');
              }
            }}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Full Analysis
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

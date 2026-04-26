/**
 * AIInsightsCard.tsx
 * Reusable AI Insights panel used on every main page + dedicated /ai-insights page.
 *
 * Features:
 * - "Generate Insights" button triggers POST /api/ai-insights
 * - Loading / error states
 * - Results rendered as summary + 4 categorised lists
 * - 24-hour localStorage cache per page key
 * - "Refresh" button forces regeneration
 * - Last generated timestamp shown
 * - Falls back to direct Vercel function call on static deployment
 */

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, RefreshCw, AlertTriangle, TrendingUp,
  Lightbulb, Zap, ChevronDown, ChevronRight, Info,
  ShieldAlert, Clock,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AIInsightsResult {
  summary: string;
  risks: string[];
  opportunities: string[];
  recommendations: string[];
  nextActions: string[];
}

interface CachedEntry {
  insights: AIInsightsResult;
  generatedAt: string;
  model: string;
}

interface AIInsightsCardProps {
  /** Unique key per page — used for localStorage cache */
  pageKey: string;
  /** Human-readable page label */
  pageLabel: string;
  /** Data to send to the API — keep minimal and summarised */
  getData: () => Record<string, unknown>;
  /** Whether to show expanded by default */
  defaultExpanded?: boolean;
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCached(pageKey: string): CachedEntry | null {
  try {
    const raw = localStorage.getItem(`sf_ai_cache_${pageKey}`);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CachedEntry & { cachedAt: number };
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(`sf_ai_cache_${pageKey}`);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function setCached(pageKey: string, entry: CachedEntry) {
  try {
    localStorage.setItem(
      `sf_ai_cache_${pageKey}`,
      JSON.stringify({ ...entry, cachedAt: Date.now() })
    );
  } catch {}
}

// ─── API endpoint detection ───────────────────────────────────────────────────
// On Vercel: /api/ai-insights is a real serverless function
// On localhost: proxy to same path (Express would need to handle it, or use VITE_AI_INSIGHTS_URL)

function getApiUrl(): string {
  // Allow override via env var for local testing
  if (import.meta.env.VITE_AI_INSIGHTS_URL) {
    return import.meta.env.VITE_AI_INSIGHTS_URL as string;
  }
  // On Vercel production / preview: use relative path (serverless function)
  return "/api/ai-insights";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIInsightsCard({
  pageKey,
  pageLabel,
  getData,
  defaultExpanded = false,
}: AIInsightsCardProps) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CachedEntry | null>(null);

  // Load from cache on mount
  useEffect(() => {
    const cached = getCached(pageKey);
    if (cached) setResult(cached);
  }, [pageKey]);

  const generate = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCached(pageKey);
      if (cached) { setResult(cached); setExpanded(true); return; }
    }

    setLoading(true);
    setError(null);
    setExpanded(true);

    try {
      const data = getData();
      const res = await fetch(getApiUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: pageKey, data }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      const body = await res.json() as {
        insights: AIInsightsResult;
        generatedAt: string;
        model: string;
      };

      const entry: CachedEntry = {
        insights: body.insights,
        generatedAt: body.generatedAt,
        model: body.model,
      };
      setCached(pageKey, entry);
      setResult(entry);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast({ title: "AI Insights failed", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [pageKey, getData, toast]);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-AU", {
        dateStyle: "short", timeStyle: "short",
      });
    } catch { return iso; }
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* ─── Header bar ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4">
        <button
          className="flex items-center gap-2.5 flex-1 text-left hover:opacity-80 transition-opacity"
          onClick={() => setExpanded(v => !v)}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, hsl(270,60%,40%), hsl(240,80%,55%))" }}
          >
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold leading-none">AI Insights</p>
            <p className="text-xs text-muted-foreground mt-0.5">{pageLabel}</p>
          </div>
          {result && (
            <span className="ml-2 text-xs text-muted-foreground/70 hidden sm:block">
              Generated {formatTime(result.generatedAt)}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {result && !loading && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1 text-muted-foreground"
              onClick={() => generate(true)}
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </Button>
          )}
          <Button
            size="sm"
            disabled={loading}
            onClick={() => generate(false)}
            style={{
              background: loading
                ? undefined
                : "linear-gradient(135deg, hsl(270,60%,40%), hsl(240,80%,55%))",
              color: loading ? undefined : "white",
              border: "none",
            }}
            className="h-7 text-xs gap-1.5"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" />
                Analysing…
              </>
            ) : result ? (
              <>
                <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
                {expanded ? "Hide" : "Show"}
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3" />
                Generate Insights
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ─── Body ───────────────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-border px-5 pb-5 pt-4 space-y-4">
          {/* Cost note */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
            <Info className="w-3 h-3 shrink-0" />
            Low-cost AI analysis powered by GPT-4o mini · Results cached 24 hours
          </div>

          {/* Error */}
          {error && !loading && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3 text-xs text-destructive">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Failed to generate insights</p>
                <p>{error}</p>
                {error.includes("OPENAI_API_KEY") && (
                  <p className="mt-1 text-destructive/80">
                    Add <code className="font-mono bg-destructive/20 px-1 rounded">OPENAI_API_KEY</code> to your Vercel Environment Variables and redeploy.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 bg-secondary rounded w-3/4" />
              <div className="h-4 bg-secondary rounded w-1/2" />
              <div className="grid grid-cols-2 gap-3 mt-4">
                {[0,1,2,3].map(i => (
                  <div key={i} className="bg-secondary rounded-xl p-4 space-y-2">
                    <div className="h-3 bg-secondary/60 rounded w-1/3" />
                    <div className="h-3 bg-secondary/60 rounded w-5/6" />
                    <div className="h-3 bg-secondary/60 rounded w-4/6" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-secondary/30 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> Summary
                </p>
                <p className="text-sm leading-relaxed">{result.insights.summary}</p>
              </div>

              {/* 4-panel grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Risks */}
                <InsightPanel
                  icon={<ShieldAlert className="w-3.5 h-3.5" />}
                  label="Risks"
                  items={result.insights.risks}
                  color="hsl(0,72%,51%)"
                  bg="hsl(0,60%,8%)"
                  border="hsl(0,50%,20%)"
                />
                {/* Opportunities */}
                <InsightPanel
                  icon={<TrendingUp className="w-3.5 h-3.5" />}
                  label="Opportunities"
                  items={result.insights.opportunities}
                  color="hsl(142,60%,45%)"
                  bg="hsl(142,60%,6%)"
                  border="hsl(142,40%,18%)"
                />
                {/* Recommendations */}
                <InsightPanel
                  icon={<Lightbulb className="w-3.5 h-3.5" />}
                  label="Recommendations"
                  items={result.insights.recommendations}
                  color="hsl(43,85%,55%)"
                  bg="hsl(43,80%,6%)"
                  border="hsl(43,60%,18%)"
                />
                {/* Next Actions */}
                <InsightPanel
                  icon={<Zap className="w-3.5 h-3.5" />}
                  label="Next Actions"
                  items={result.insights.nextActions}
                  color="hsl(210,80%,60%)"
                  bg="hsl(210,70%,6%)"
                  border="hsl(210,50%,18%)"
                />
              </div>

              {/* Disclaimer + meta */}
              <div className="flex items-start gap-2 text-xs text-muted-foreground/60 pt-1">
                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                <p>
                  This is general information only and not financial advice. Always consult a licensed financial adviser before making investment decisions.
                  <span className="ml-2 text-muted-foreground/40">· {result.model} · {formatTime(result.generatedAt)}</span>
                </p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!result && !loading && !error && (
            <div className="text-center py-8 text-muted-foreground">
              <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Click "Generate Insights" to analyse your {pageLabel.toLowerCase()} data with AI.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-component: single insight panel ─────────────────────────────────────

function InsightPanel({
  icon, label, items, color, bg, border,
}: {
  icon: React.ReactNode;
  label: string;
  items: string[];
  color: string;
  bg: string;
  border: string;
}) {
  if (!items?.length) return null;
  return (
    <div
      className="rounded-xl p-4 space-y-2"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color }}>
        <span style={{ color }}>{icon}</span>
        {label}
      </p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="text-xs flex items-start gap-1.5">
            <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

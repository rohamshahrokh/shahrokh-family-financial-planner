/**
 * CFODashboardWidget.tsx
 * Shows the latest AI Weekly CFO report as a dashboard card.
 * Displays overall score, 4 sub-scores, best move, summary, and a link to full report.
 */

import { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { getCFOReports, generateCFOReport, saveCFOReport, type CFOReport } from "@/lib/cfoEngine";
import {
  BrainCircuit,
  TrendingUp,
  Wallet,
  ShieldCheck,
  Target,
  ChevronRight,
  RefreshCw,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Score ring component ─────────────────────────────────────────────────────
function ScoreRing({
  score,
  label,
  icon: Icon,
  color,
}: {
  score: number;
  label: string;
  icon: React.ElementType;
  color: string;
}) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const circumference = 2 * Math.PI * 20;
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-14 h-14">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 48 48">
          {/* Background ring */}
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="4"
          />
          {/* Score arc */}
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        {/* Score label in centre */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-white">{clampedScore}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Icon size={10} style={{ color }} />
        <span className="text-[10px] text-slate-400">{label}</span>
      </div>
    </div>
  );
}

// ─── Overall score badge ──────────────────────────────────────────────────────
function OverallScore({ score }: { score: number }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const color =
    clampedScore >= 75
      ? "#22d3ee"
      : clampedScore >= 50
      ? "#f59e0b"
      : "#f87171";

  const label =
    clampedScore >= 75 ? "Excellent" : clampedScore >= 50 ? "Fair" : "Needs Attention";

  return (
    <div className="flex flex-col items-center justify-center">
      <div
        className="text-5xl font-black tabular-nums"
        style={{ color, textShadow: `0 0 24px ${color}40` }}
      >
        {clampedScore}
      </div>
      <div className="text-xs font-semibold mt-0.5" style={{ color }}>
        {label}
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5">Overall CFO Score</div>
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────
export default function CFODashboardWidget() {
  const [report, setReport] = useState<CFOReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const reports = await getCFOReports(1);
      if (reports && reports.length > 0) {
        setReport(reports[0].report_json as CFOReport);
      } else {
        setReport(null);
      }
    } catch (e: any) {
      setError("Could not load CFO report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const newReport = await generateCFOReport("Balanced");
      await saveCFOReport(newReport, false);
      setReport(newReport);
    } catch (e: any) {
      setError("Failed to generate report. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, []);

  // Compute overall score as average of 4 sub-scores
  const overallScore = report
    ? Math.round(
        (report.wealth_score +
          report.cashflow_score +
          report.risk_score +
          report.discipline_score) /
          4
      )
    : 0;

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0f1724] p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <BrainCircuit size={18} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">AI Weekly CFO</span>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-cyan-400" />
        </div>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0f1724] p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <BrainCircuit size={18} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">AI Weekly CFO</span>
        </div>
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="mt-3 text-xs"
          onClick={fetchLatest}
        >
          <RefreshCw size={12} className="mr-1" /> Retry
        </Button>
      </div>
    );
  }

  // ── No report yet ────────────────────────────────────────────────────────────
  if (!report) {
    return (
      <div className="rounded-2xl border border-dashed border-cyan-900/60 bg-[#0f1724] p-6 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <BrainCircuit size={18} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">AI Weekly CFO</span>
        </div>
        <p className="text-slate-400 text-sm mb-4">
          No CFO report generated yet. Run your first weekly briefing to see your financial score, alerts, and best move.
        </p>
        <Button
          size="sm"
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold text-xs"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <>
              <Loader2 size={12} className="mr-1 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <BrainCircuit size={12} className="mr-1" />
              Generate First Report
            </>
          )}
        </Button>
      </div>
    );
  }

  // ── Report present ───────────────────────────────────────────────────────────
  const weekDate = new Date(report.week_date).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="rounded-2xl border border-cyan-900/40 bg-[#0a1420] mb-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <BrainCircuit size={18} className="text-cyan-400" />
          <span className="text-sm font-semibold text-white">AI Weekly CFO</span>
          <span className="text-[10px] text-slate-500 ml-1">Week of {weekDate}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-cyan-400 transition-colors"
            onClick={handleGenerate}
            disabled={generating}
            title="Regenerate report"
          >
            {generating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
          </button>
          <Link href="/ai-weekly-cfo">
            <button className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors">
              Full Report <ChevronRight size={12} />
            </button>
          </Link>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        <div className="flex items-stretch gap-6">
          {/* Left: overall score */}
          <div className="flex flex-col items-center justify-center min-w-[100px]">
            <OverallScore score={overallScore} />
          </div>

          {/* Divider */}
          <div className="w-px bg-white/5 self-stretch" />

          {/* Centre: sub-scores + summary */}
          <div className="flex-1 min-w-0">
            {/* Sub-scores row */}
            <div className="flex items-center gap-4 mb-4 flex-wrap">
              <ScoreRing
                score={report.wealth_score}
                label="Wealth"
                icon={TrendingUp}
                color="#22d3ee"
              />
              <ScoreRing
                score={report.cashflow_score}
                label="Cashflow"
                icon={Wallet}
                color="#a78bfa"
              />
              <ScoreRing
                score={report.risk_score}
                label="Risk"
                icon={ShieldCheck}
                color="#34d399"
              />
              <ScoreRing
                score={report.discipline_score}
                label="Discipline"
                icon={Target}
                color="#f59e0b"
              />
            </div>

            {/* Summary */}
            <p className="text-xs text-slate-300 leading-relaxed line-clamp-2 mb-3">
              {report.summary}
            </p>

            {/* Best Move */}
            {report.best_move && (
              <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 px-3 py-2">
                <div className="flex items-start gap-2">
                  <Target size={13} className="text-cyan-400 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider mb-0.5">
                      Best Move This Week
                    </div>
                    <div className="text-xs text-slate-200 leading-relaxed">
                      {report.best_move}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top alert (if any) */}
        {report.alerts && report.alerts.length > 0 && (
          <div className="mt-3 flex items-start gap-2 text-xs text-amber-400">
            <AlertCircle size={12} className="mt-0.5 shrink-0" />
            <span className="line-clamp-1">{report.alerts[0]}</span>
          </div>
        )}
      </div>

      {/* Footer CTA */}
      <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
        <span className="text-[10px] text-slate-600">
          {report.alerts?.length ?? 0} alert{(report.alerts?.length ?? 0) !== 1 ? "s" : ""} ·{" "}
          {report.opportunities?.length ?? 0} opportunit{(report.opportunities?.length ?? 0) !== 1 ? "ies" : "y"}
        </span>
        <Link href="/ai-weekly-cfo">
          <button className="flex items-center gap-1 text-[11px] font-medium text-cyan-400 hover:text-cyan-300 transition-colors">
            View full briefing <ChevronRight size={12} />
          </button>
        </Link>
      </div>
    </div>
  );
}

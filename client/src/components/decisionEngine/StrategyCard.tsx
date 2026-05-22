/**
 * StrategyCard.tsx — premium discovery-layer strategy card
 *
 * Replaces the raw "score + numbers" CandidateRow with an investment-committee
 * surface:
 *
 *   • Headline (rank, label, identity, score, risk pill)
 *   • Core metrics (P50 NW, survival %, FIRE Δ)
 *   • Why this ranks (strengths) + Main weaknesses
 *   • Trade-off bars (6 axes)
 *   • Best for / Avoid if
 *   • Delta vs baseline (user's no-change path)
 *   • Stress & resilience summary
 *   • [ Open Deep Dive ] CTA → opens StrategyDeepDive sheet
 *
 * All copy is rule-based by default; "Explain with AI" optionally polishes.
 * No financial logic — strictly a discovery presentation layer.
 */

import { useEffect, useState } from "react";
import {
  ChevronRight, Sparkles, Shield, TrendingUp, Droplets, Receipt,
  AlertTriangle, Award, Check, X, Activity, Cloud, Wallet, Briefcase, Wand2, Loader2,
} from "lucide-react";

import type { RankedCandidate } from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import type { ExtendedScenarioResult } from "@/lib/scenarioV2/runScenario";
import {
  buildStrategyIntelligence,
  type StrategyIntelligence,
  type StrategyNarrative,
  type ResilienceLevel,
} from "@/lib/scenarioV2/decisionEngine/strategyIntelligence";
import { polishNarrativeWithAi } from "@/lib/scenarioV2/decisionEngine/polishNarrativeWithAi";
import type { MaskFmt } from "@/components/decisionEngine/RiskVisualizations";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { AuditableMetric } from "@/components/auditMode/AuditableMetric";

import { StrategyDeepDive } from "./StrategyDeepDive";

export interface StrategyCardProps {
  rank: number;
  candidate: RankedCandidate;
  baseline: ExtendedScenarioResult;
  fmt: MaskFmt;
  privacyMode: boolean;
}

export function StrategyCard({ rank, candidate, baseline, fmt, privacyMode }: StrategyCardProps) {
  const baseIntel = buildStrategyIntelligence(candidate, baseline);
  const [intel, setIntel] = useState<StrategyIntelligence>(baseIntel);
  const [deepDiveOpen, setDeepDiveOpen] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [polished, setPolished] = useState(false);

  // Reset when candidate changes
  useEffect(() => {
    setIntel(baseIntel);
    setPolished(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate.id]);

  const score = candidate.score.score;
  const scoreTone =
    score >= 75 ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" :
    score >= 55 ? "bg-sky-500/15 text-sky-300 border-sky-500/30" :
    score >= 35 ? "bg-amber-500/15 text-amber-300 border-amber-500/30" :
                  "bg-rose-500/15 text-rose-300 border-rose-500/30";

  const riskLevel: { label: string; tone: string } = (() => {
    const r = intel.tradeOffs.riskExposure;
    if (r <= 0.25) return { label: "Low risk",      tone: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25" };
    if (r <= 0.50) return { label: "Moderate risk", tone: "bg-sky-500/10 text-sky-300 border-sky-500/25" };
    if (r <= 0.75) return { label: "Elevated risk", tone: "bg-amber-500/10 text-amber-300 border-amber-500/25" };
    return                  { label: "High risk",    tone: "bg-rose-500/10 text-rose-300 border-rose-500/25" };
  })();

  const survival = 1 - (candidate.result.defaultProbability ?? 0);

  async function handlePolish() {
    if (polishing) return;
    setPolishing(true);
    try {
      const polishedNarrative = await polishNarrativeWithAi({
        candidateLabel: candidate.label,
        identityLabel: intel.narrative.identityLabel,
        rawNarrative: intel.narrative,
        context: {
          score: candidate.score.score,
          survivalPct: (survival * 100).toFixed(0),
          fireYearsDelta: intel.baselineDelta.fireYearsDelta.toFixed(1),
          nwDelta$: intel.baselineDelta.netWorthDelta.toFixed(0),
        },
      });
      setIntel(prev => ({ ...prev, narrative: polishedNarrative }));
      setPolished(true);
    } finally {
      setPolishing(false);
    }
  }

  return (
    <>
      <div className="rounded-xl border border-border/60 bg-card shadow-[var(--shadow-md)] overflow-hidden hover:shadow-[var(--shadow-lg)] transition-shadow">
        {/* ── Headline ──────────────────────────────────────────────────── */}
        <div className="p-3 sm:p-4 flex items-start gap-3">
          <Badge variant="outline" className="shrink-0 tabular-nums h-7 px-2 text-xs">
            #{rank}
          </Badge>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="text-sm sm:text-base font-semibold leading-tight truncate">
                  {candidate.label}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-medium text-foreground/80">
                    {intel.narrative.identityLabel}
                  </span>
                  <span className="text-[11px] text-muted-foreground">·</span>
                  <span className="text-[11px] text-muted-foreground truncate">
                    {intel.narrative.identityHint}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${riskLevel.tone}`}>
                  {riskLevel.label}
                </span>
                <span className={`tabular-nums font-bold text-sm px-2 py-1 rounded-md border ${scoreTone}`}>
                  <AuditableMetric traceId={`decision:candidate:${candidate.id}:total-score`}>
                    {score.toFixed(0)}
                  </AuditableMetric>
                </span>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Core metrics ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-px bg-border/40">
          <MetricTile
            icon={<Wallet className="h-3 w-3" />}
            label="P50 Net Worth"
            value={privacyMode ? "•••" : fmt.fmt$M(candidate.result.netWorthFan.at(-1)?.p50 ?? 0)}
            infoTerm="P50"
          />
          <MetricTile
            icon={<Shield className="h-3 w-3" />}
            label="Survival"
            value={`${(survival * 100).toFixed(0)}%`}
            tone={survival >= 0.9 ? "good" : survival >= 0.75 ? "warn" : "bad"}
            infoTerm="Survival probability"
          />
          <MetricTile
            icon={<TrendingUp className="h-3 w-3" />}
            label="FIRE Δ"
            value={(() => {
              const y = intel.baselineDelta.fireYearsDelta;
              if (Math.abs(y) < 0.1) return "—";
              return `${y < 0 ? "−" : "+"}${Math.abs(y).toFixed(1)}y`;
            })()}
            tone={intel.baselineDelta.fireYearsDelta < -0.5 ? "good" :
                  intel.baselineDelta.fireYearsDelta > 0.5 ? "bad" : "neutral"}
            infoTerm="FIRE"
          />
        </div>

        {/* ── Why this ranks / Main weaknesses ──────────────────────────── */}
        <div className="p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] uppercase tracking-wide font-semibold text-foreground">
                <AuditableMetric traceId={`decision:candidate:${candidate.id}:rationale`}>Why this ranks</AuditableMetric>
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
              onClick={handlePolish}
              disabled={polishing}
              aria-label={polished ? "Polished by AI" : "Explain with AI"}
            >
              {polishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              {polished ? "Polished" : polishing ? "Polishing…" : "Explain with AI"}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <NarrativeColumn
              tone="good"
              icon={<Award className="h-3 w-3" />}
              label="Why this ranks well"
              items={intel.narrative.strengths}
            />
            <NarrativeColumn
              tone="warn"
              icon={<AlertTriangle className="h-3 w-3" />}
              label="Main weaknesses"
              items={intel.narrative.weaknesses}
            />
          </div>
        </div>

        <Separator />

        {/* ── Trade-off bars ────────────────────────────────────────────── */}
        <div className="p-3 sm:p-4 space-y-2">
          <div className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-foreground/70" />
            <span className="text-[11px] uppercase tracking-wide font-semibold text-foreground">
              <AuditableMetric traceId="decision:trade-off-analysis">Trade-offs</AuditableMetric>
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
            <TradeBar label="Return potential"   value={intel.tradeOffs.returnPotential}   tone="primary" />
            <TradeBar label="Risk exposure"      value={intel.tradeOffs.riskExposure}      tone="danger" invertTone />
            <TradeBar label="Liquidity"          value={intel.tradeOffs.liquidity}         tone="info" />
            <TradeBar label="Cashflow safety"    value={intel.tradeOffs.cashflowSafety}    tone="success" />
            <TradeBar label="Tax efficiency"     value={intel.tradeOffs.taxEfficiency}     tone="success" />
            <TradeBar label="Volatility tolerance needed" value={intel.tradeOffs.volatilityTolerance} tone="warning" invertTone />
          </div>
        </div>

        <Separator />

        {/* ── Best for / Avoid if ───────────────────────────────────────── */}
        <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <BestAvoidColumn
            tone="good"
            icon={<Check className="h-3 w-3" />}
            label="Best for"
            items={intel.narrative.bestFor}
          />
          <BestAvoidColumn
            tone="warn"
            icon={<X className="h-3 w-3" />}
            label="Avoid if"
            items={intel.narrative.avoidIf}
          />
        </div>

        <Separator />

        {/* ── Delta vs baseline ─────────────────────────────────────────── */}
        <div className="p-3 sm:p-4 space-y-2 bg-[hsl(var(--surface-2))]/40">
          <div className="flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-foreground/70" />
            <span className="text-[11px] uppercase tracking-wide font-semibold text-foreground">
              Compared to your current path
            </span>
          </div>
          <ul className="space-y-1">
            {intel.baselineDelta.bullets.map((b, i) => (
              <li key={i} className="text-xs text-foreground/90 flex items-start gap-2">
                <ChevronRight className="h-3 w-3 mt-0.5 text-primary shrink-0" />
                <span className="leading-snug">{privacyMode ? b.replace(/[+\-−]?\$[\d.,\s]+(?:M|k)?/g, "$•••") : b}</span>
              </li>
            ))}
          </ul>
        </div>

        <Separator />

        {/* ── Stress / resilience ───────────────────────────────────────── */}
        <div className="p-3 sm:p-4 space-y-2">
          <div className="flex items-center gap-1.5">
            <Cloud className="h-3.5 w-3.5 text-foreground/70" />
            <span className="text-[11px] uppercase tracking-wide font-semibold text-foreground">
              Stress & resilience
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <ResilienceTile label="Recession"  level={intel.stress.recession.level}  detail={intel.stress.recession.detail} />
            <ResilienceTile label="Inflation"  level={intel.stress.inflation.level}  detail={intel.stress.inflation.detail} />
            <ResilienceTile label="Rate shock" level={intel.stress.rateShock.level}  detail={intel.stress.rateShock.detail} />
            <ResilienceTile
              label={`Job loss${intel.stress.jobLoss.months !== null ? ` · ${intel.stress.jobLoss.months}mo runway` : ""}`}
              level={intel.stress.jobLoss.level}
              detail={intel.stress.jobLoss.detail}
            />
          </div>
        </div>

        {/* ── CTA ───────────────────────────────────────────────────────── */}
        <div className="p-3 sm:p-4 border-t border-border/60 bg-[hsl(var(--surface-2))]/30">
          <Button
            className="w-full h-10 text-sm"
            variant="outline"
            onClick={() => setDeepDiveOpen(true)}
          >
            Open Deep Dive
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      <StrategyDeepDive
        open={deepDiveOpen}
        onOpenChange={setDeepDiveOpen}
        candidate={candidate}
        baseline={baseline}
        fmt={fmt}
        privacyMode={privacyMode}
        intel={intel}
      />
    </>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function MetricTile({
  icon, label, value, tone = "neutral", infoTerm,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "good" | "warn" | "bad" | "neutral";
  /** Glossary key for inline info tooltip. */
  infoTerm?: string;
}) {
  const toneClass =
    tone === "good" ? "text-[hsl(var(--success-light))]" :
    tone === "warn" ? "text-[hsl(var(--warning-light))]" :
    tone === "bad"  ? "text-[hsl(var(--danger-light))]" :
                      "text-foreground";
  return (
    <div className="bg-card p-2.5 sm:p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
        {infoTerm && <InfoTooltip term={infoTerm} size={10} />}
      </div>
      <div className={`mt-0.5 text-sm sm:text-base font-bold tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function NarrativeColumn({
  tone, icon, label, items,
}: {
  tone: "good" | "warn";
  icon: React.ReactNode;
  label: string;
  items: string[];
}) {
  const headerClass =
    tone === "good" ? "text-emerald-300" : "text-amber-300";
  const dotClass =
    tone === "good" ? "text-emerald-400" : "text-amber-400";
  return (
    <div>
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold ${headerClass} mb-1.5`}>
        {icon}
        <span>{label}</span>
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="text-xs leading-snug text-foreground/90 flex items-start gap-2">
            <span className={`mt-1 h-1 w-1 rounded-full shrink-0 ${dotClass.replace("text-", "bg-")}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TradeBar({
  label, value, tone, invertTone = false,
}: {
  label: string;
  value: number;
  tone: "primary" | "success" | "info" | "warning" | "danger";
  /** If true, high values render in a warning color (e.g. risk). */
  invertTone?: boolean;
}) {
  // Tone resolution: if invertTone and value > 0.5, drift toward danger.
  const effectiveTone = invertTone
    ? value >= 0.7 ? "danger" : value >= 0.4 ? "warning" : "success"
    : tone;
  const fillClass = {
    primary: "bg-primary",
    success: "bg-emerald-500",
    info:    "bg-sky-500",
    warning: "bg-amber-500",
    danger:  "bg-rose-500",
  }[effectiveTone];

  const pct = Math.max(0, Math.min(1, value));
  // Render 8 segments for that "compact bar" feel.
  const segments = 8;
  const filled = Math.round(pct * segments);

  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-[11px] text-muted-foreground w-32 sm:w-36 shrink-0 truncate">
        {label}
      </span>
      <div className="flex-1 flex items-center gap-0.5" aria-label={`${label}: ${(pct * 100).toFixed(0)}%`}>
        {Array.from({ length: segments }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-sm ${i < filled ? fillClass : "bg-border/50"}`}
          />
        ))}
      </div>
      <span className="text-[10px] tabular-nums text-muted-foreground w-7 text-right">
        {(pct * 100).toFixed(0)}
      </span>
    </div>
  );
}

function BestAvoidColumn({
  tone, icon, label, items,
}: {
  tone: "good" | "warn";
  icon: React.ReactNode;
  label: string;
  items: string[];
}) {
  const surface =
    tone === "good"
      ? "bg-emerald-500/8 border-emerald-500/25"
      : "bg-amber-500/8 border-amber-500/25";
  const headerClass =
    tone === "good" ? "text-emerald-300" : "text-amber-300";
  return (
    <div className={`rounded-lg border p-2.5 ${surface}`}>
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold ${headerClass} mb-1.5`}>
        {icon}
        <span>{label}</span>
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="text-[11px] leading-snug text-foreground/90 flex items-start gap-2">
            <ChevronRight className="h-3 w-3 mt-0.5 text-foreground/40 shrink-0" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResilienceTile({
  label, level, detail,
}: {
  label: string;
  level: ResilienceLevel;
  detail: string;
}) {
  const tone =
    level === "strong"   ? { dot: "bg-emerald-400", surface: "border-emerald-500/25 bg-emerald-500/5", text: "text-emerald-300" } :
    level === "moderate" ? { dot: "bg-amber-400",   surface: "border-amber-500/25 bg-amber-500/5",   text: "text-amber-300"   } :
                           { dot: "bg-rose-400",    surface: "border-rose-500/25 bg-rose-500/5",     text: "text-rose-300"    };
  return (
    <div className={`rounded-md border p-2 ${tone.surface}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-foreground/90 truncate">{label}</span>
        <span className={`text-[10px] uppercase font-bold tracking-wide flex items-center gap-1 ${tone.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
          {level}
        </span>
      </div>
      <div className="mt-1 text-[10px] leading-snug text-muted-foreground">
        {detail}
      </div>
    </div>
  );
}

// We can't satisfy MaskFmt if not used (TS error in some configs), but
// keeping `_priv` here for callers passing the field is intentional — used
// in trim() above. Suppress unused-export lint by re-exporting type.
export type { StrategyNarrative };

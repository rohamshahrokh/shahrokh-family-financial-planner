/**
 * AiInsightsPanel — strategy intelligence narrative for the selected scenario.
 *
 * Reuses buildStrategyIntelligence(candidate, baseline) — deterministic,
 * no AI calls in this panel (LLM polish is opt-in elsewhere).
 */
import { useMemo } from "react";
import { Sparkles, Check, AlertCircle, Target, ShieldOff } from "lucide-react";
import type { QuickDecisionOutput, RankedCandidate } from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import { buildStrategyIntelligence } from "@/lib/scenarioV2/decisionEngine/strategyIntelligence";
import { LABEL_CLS, NUM_CLS, MICRO_CLS, PANEL_HEADING_CLS, POS_TEXT, NEG_TEXT } from "../workspaceTokens";
import { cn } from "@/lib/utils";

export interface AiInsightsPanelProps {
  output: QuickDecisionOutput;
  selectedCandidate: RankedCandidate;
  fmt: {
    fmt$M: (n: number) => string;
    pct: (n: number, d?: number) => string;
  };
}

export function AiInsightsPanel({ output, selectedCandidate, fmt }: AiInsightsPanelProps) {
  const intel = useMemo(
    () => buildStrategyIntelligence(selectedCandidate, output.baseScenarioResult),
    [selectedCandidate, output.baseScenarioResult],
  );

  return (
    <section className="space-y-3" data-testid="ai-insights-panel">
      <header className="flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className={PANEL_HEADING_CLS}>Strategy intelligence</h2>
      </header>

      <div className="border border-border rounded-md bg-card/95 dark:bg-card/70 p-3">
        <div className={LABEL_CLS}>Strategy identity</div>
        <div className="text-sm font-semibold mt-1">{intel.narrative.identityLabel}</div>
        <p className={cn(MICRO_CLS, "mt-1")}>{intel.narrative.identityHint}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <BulletCard
          icon={Check}
          title="Strengths"
          tone="pos"
          items={intel.narrative.strengths}
        />
        <BulletCard
          icon={AlertCircle}
          title="Weaknesses"
          tone="neg"
          items={intel.narrative.weaknesses}
        />
        <BulletCard
          icon={Target}
          title="Best for"
          tone="info"
          items={intel.narrative.bestFor}
        />
        <BulletCard
          icon={ShieldOff}
          title="Avoid if"
          tone="warn"
          items={intel.narrative.avoidIf}
        />
      </div>

      {/* Baseline delta */}
      <div className="border border-border rounded-md bg-card/95 dark:bg-card/70 p-3">
        <h3 className={cn(PANEL_HEADING_CLS, "mb-2")}>Versus your baseline (no-action plan)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <DeltaMetric label="P50 NW" value={intel.baselineDelta.netWorthDelta} fmt={fmt.fmt$M} betterIsHigher />
          <DeltaMetric label="P50 NW · %" value={intel.baselineDelta.netWorthDeltaPct} fmt={(n) => fmt.pct(n, 1)} betterIsHigher />
          <DeltaMetric label="Max DD" value={intel.baselineDelta.drawdownDeltaPct} fmt={(n) => fmt.pct(n, 1)} betterIsHigher={false} />
          <DeltaMetric label="Liquidity" value={intel.baselineDelta.liquidityDeltaPct} fmt={(n) => fmt.pct(n, 1)} betterIsHigher />
        </div>
        {intel.baselineDelta.bullets.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
            {intel.baselineDelta.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
}

function BulletCard({
  icon: Icon, title, tone, items,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  tone: "pos" | "neg" | "info" | "warn";
  items: string[];
}) {
  const toneCls = {
    pos: "text-emerald-700 dark:text-emerald-300",
    neg: "text-rose-700 dark:text-rose-300",
    info: "text-sky-700 dark:text-sky-300",
    warn: "text-amber-700 dark:text-amber-300",
  }[tone];
  return (
    <div className="border border-border rounded-md bg-card/95 dark:bg-card/70 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={cn("h-3 w-3", toneCls)} />
        <h3 className={PANEL_HEADING_CLS}>{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className={MICRO_CLS}>None surfaced.</p>
      ) : (
        <ul className="space-y-1 text-[12px] leading-snug">
          {items.map((s, i) => (
            <li key={i} className="flex gap-1.5">
              <span className={cn(toneCls, "shrink-0")}>•</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeltaMetric({
  label, value, fmt, betterIsHigher,
}: {
  label: string; value: number; fmt: (n: number) => string; betterIsHigher: boolean;
}) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const good = betterIsHigher ? value > 0 : value < 0;
  const cls = Math.abs(value) < 1e-6 ? "" : good ? POS_TEXT : NEG_TEXT;
  return (
    <div>
      <div className={LABEL_CLS}>{label}</div>
      <div className={cn("text-sm font-semibold mt-0.5", NUM_CLS, cls)}>
        {sign}{fmt(Math.abs(value))}
      </div>
    </div>
  );
}

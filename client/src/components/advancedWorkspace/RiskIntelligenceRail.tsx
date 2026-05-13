/**
 * Risk & Intelligence Rail — right rail of the Advanced Workspace.
 *
 * Live risk telemetry for the currently-selected scenario (defaults to
 * the winner). All metrics are read directly from the engine output —
 * no fabricated numbers, no placeholders.
 *
 * If no output yet, renders an empty-state with a list of what will appear.
 */
import { ShieldAlert, Activity, TrendingDown, Droplets, AlertOctagon, Banknote } from "lucide-react";
import type { RankedCandidate, QuickDecisionOutput } from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import {
  LABEL_CLS, MICRO_CLS, NUM_CLS, PANEL_HEADING_CLS, PANEL_DIVIDER,
  POS_TEXT, NEG_TEXT, WARN_TEXT, INFO_TEXT, MUTED_TEXT,
} from "./workspaceTokens";
import { cn } from "@/lib/utils";

export interface RiskIntelligenceRailProps {
  output: QuickDecisionOutput | null;
  selectedCandidate: RankedCandidate | null;
  fmt: {
    fmt$: (n: number) => string;
    fmt$k: (n: number) => string;
    fmt$M: (n: number) => string;
    pct: (n: number, d?: number) => string;
  };
}

/**
 * Three-band classification for any probability metric.
 * Thresholds chosen to mirror APRA-style stress bands.
 */
function probBand(p: number, lowGood = 0.05, highBad = 0.20): {
  text: string;
  band: "low" | "mid" | "high";
} {
  if (p <= lowGood) return { text: POS_TEXT, band: "low" };
  if (p <= highBad) return { text: WARN_TEXT, band: "mid" };
  return { text: NEG_TEXT, band: "high" };
}

function MetricRow({
  icon: Icon, label, value, valueClass, hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1">
      <Icon className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className={LABEL_CLS}>{label}</div>
        {hint && <div className={cn(MICRO_CLS, "mt-0.5")}>{hint}</div>}
      </div>
      <div className={cn("text-xs font-semibold shrink-0", NUM_CLS, valueClass)}>{value}</div>
    </div>
  );
}

export function RiskIntelligenceRail({ output, selectedCandidate, fmt }: RiskIntelligenceRailProps) {
  return (
    <aside
      className="hidden xl:flex flex-col gap-3 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto pl-1"
      aria-label="Risk and Intelligence"
      data-testid="risk-intelligence-rail"
    >
      <header className="flex items-center gap-2">
        <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className={PANEL_HEADING_CLS}>Risk & Intelligence</h2>
      </header>

      {!output || !selectedCandidate ? (
        <div className="text-[11px] text-muted-foreground space-y-2 px-1">
          <p>Run an analysis to populate live risk telemetry:</p>
          <ul className="space-y-0.5 list-disc list-inside opacity-80">
            <li>Survival probability</li>
            <li>VaR<sub>95</sub> & CVaR<sub>95</sub></li>
            <li>Max drawdown (median &amp; P90)</li>
            <li>Liquidity exhaustion probability</li>
            <li>Refinance stress probability</li>
            <li>Invalidation triggers</li>
          </ul>
        </div>
      ) : (
        <RailBody candidate={selectedCandidate} output={output} fmt={fmt} />
      )}
    </aside>
  );
}

function RailBody({
  candidate, output, fmt,
}: {
  candidate: RankedCandidate;
  output: QuickDecisionOutput;
  fmt: RiskIntelligenceRailProps["fmt"];
}) {
  const r = candidate.result;
  const rm = r.riskMetrics;
  const survival = 1 - r.defaultProbability;
  const survivalBand = probBand(r.defaultProbability, 0.02, 0.10);
  const liqBand = probBand(r.liquidityExhaustionProbability, 0.05, 0.20);
  const refiBand = probBand(r.refinancePressureProbability ?? 0, 0.10, 0.30);
  const negEqBand = probBand(r.negativeEquityProbability ?? 0, 0.05, 0.20);

  // VaR/CVaR are dollar losses vs initial NW — show as absolute and as %.
  const initialNw = r.initialNetWorth || 1;
  const varPct = rm.varDollars95 / initialNw;
  const cvarPct = rm.cvarDollars95 / initialNw;

  return (
    <div className="space-y-3">
      {/* Selected scenario header */}
      <div className="px-1">
        <div className={LABEL_CLS}>Selected scenario</div>
        <div className="text-xs font-medium truncate mt-0.5" title={candidate.label}>
          {candidate.label}
        </div>
        {output.ranked[0]?.id === candidate.id && (
          <div className={cn(MICRO_CLS, POS_TEXT, "mt-0.5")}>Current winner</div>
        )}
      </div>

      <div className={PANEL_DIVIDER} />

      {/* Survival + insolvency */}
      <section>
        <div className={cn(PANEL_HEADING_CLS, "mb-1")}>Survival</div>
        <MetricRow
          icon={Activity}
          label="Survival probability"
          value={fmt.pct(survival, 1)}
          valueClass={survivalBand.text}
          hint="Probability household stays solvent through horizon"
        />
        <MetricRow
          icon={AlertOctagon}
          label="Insolvency probability"
          value={fmt.pct(r.defaultProbability, 1)}
          valueClass={r.defaultProbability > 0.02 ? NEG_TEXT : MUTED_TEXT}
          hint={r.medianDefaultMonth != null ? `Median month if it fires: ${r.medianDefaultMonth}` : undefined}
        />
      </section>

      <div className={PANEL_DIVIDER} />

      {/* Tail-loss metrics */}
      <section>
        <div className={cn(PANEL_HEADING_CLS, "mb-1")}>Tail-loss (95%)</div>
        <MetricRow
          icon={TrendingDown}
          label={"VaR\u2089\u2085"}
          value={fmt.fmt$M(rm.varDollars95)}
          valueClass={varPct > 0.20 ? NEG_TEXT : varPct > 0.10 ? WARN_TEXT : INFO_TEXT}
          hint={`${(varPct * 100).toFixed(1)}% of starting net worth`}
        />
        <MetricRow
          icon={TrendingDown}
          label={"CVaR\u2089\u2085"}
          value={fmt.fmt$M(rm.cvarDollars95)}
          valueClass={cvarPct > 0.30 ? NEG_TEXT : cvarPct > 0.15 ? WARN_TEXT : INFO_TEXT}
          hint={`Avg loss in worst 5% of paths · ${(cvarPct * 100).toFixed(1)}% of NW`}
        />
        <MetricRow
          icon={TrendingDown}
          label="Max drawdown · median"
          value={fmt.pct(rm.maxDrawdownMedian, 1)}
          valueClass={rm.maxDrawdownMedian > 0.30 ? NEG_TEXT : rm.maxDrawdownMedian > 0.15 ? WARN_TEXT : INFO_TEXT}
        />
        <MetricRow
          icon={TrendingDown}
          label="Max drawdown · P90"
          value={fmt.pct(rm.maxDrawdownP90, 1)}
          valueClass={rm.maxDrawdownP90 > 0.40 ? NEG_TEXT : rm.maxDrawdownP90 > 0.20 ? WARN_TEXT : INFO_TEXT}
          hint="Worst 10% of paths"
        />
      </section>

      <div className={PANEL_DIVIDER} />

      {/* Liquidity + refinance + neg-equity */}
      <section>
        <div className={cn(PANEL_HEADING_CLS, "mb-1")}>Stress probabilities</div>
        <MetricRow
          icon={Droplets}
          label="Liquidity exhaustion"
          value={fmt.pct(r.liquidityExhaustionProbability, 1)}
          valueClass={liqBand.text}
          hint={r.medianLiquidityFirstMonth != null ? `Median first hit: month ${r.medianLiquidityFirstMonth}` : "Cash ≤ 0 in any month"}
        />
        <MetricRow
          icon={Banknote}
          label="Refinance pressure"
          value={fmt.pct(r.refinancePressureProbability ?? 0, 1)}
          valueClass={refiBand.text}
          hint="DSCR / serviceability breach"
        />
        <MetricRow
          icon={TrendingDown}
          label="Negative equity"
          value={fmt.pct(r.negativeEquityProbability ?? 0, 1)}
          valueClass={negEqBand.text}
          hint={r.medianNegEquityFirstMonth != null ? `Median first hit: month ${r.medianNegEquityFirstMonth}` : "Loan > property value"}
        />
      </section>

      {/* Invalidation triggers — pulled from engine.conditionalRecommendations */}
      {output.conditionalRecommendations.length > 0 && (
        <>
          <div className={PANEL_DIVIDER} />
          <section>
            <div className={cn(PANEL_HEADING_CLS, "mb-1.5")}>Invalidation triggers</div>
            <ul className="space-y-1.5">
              {output.conditionalRecommendations.slice(0, 4).map((rec) => (
                <li key={rec.id} className="text-[11px] leading-snug">
                  <div className="font-medium text-foreground/90">If {rec.trigger}</div>
                  <div className="text-muted-foreground">→ {rec.action}</div>
                </li>
              ))}
              {output.conditionalRecommendations.length > 4 && (
                <li className={cn(MICRO_CLS, "italic")}>
                  +{output.conditionalRecommendations.length - 4} more in Execution tab
                </li>
              )}
            </ul>
          </section>
        </>
      )}

      {/* Soft warnings */}
      {candidate.softWarnings.length > 0 && (
        <>
          <div className={PANEL_DIVIDER} />
          <section>
            <div className={cn(PANEL_HEADING_CLS, "mb-1.5")}>Soft warnings</div>
            <ul className="space-y-1">
              {candidate.softWarnings.map((w) => (
                <li
                  key={w.id}
                  className={cn(
                    "text-[11px] leading-snug px-1.5 py-1 rounded border",
                    w.severity === "critical" && "bg-rose-50/60 dark:bg-rose-950/40 border-rose-200/60 dark:border-rose-800/50",
                    w.severity === "warn" && "bg-amber-50/60 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-800/50",
                    w.severity === "info" && "bg-sky-50/60 dark:bg-sky-950/40 border-sky-200/60 dark:border-sky-800/50",
                  )}
                >
                  <div className="font-medium">{w.label}</div>
                  <div className="text-muted-foreground">{w.detail}</div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <div className={PANEL_DIVIDER} />
      <p className={cn(MICRO_CLS, "px-1")}>
        All metrics from {r.simulationCount.toLocaleString()} Monte-Carlo paths.
      </p>
    </div>
  );
}

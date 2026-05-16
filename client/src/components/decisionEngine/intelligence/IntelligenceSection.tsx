/**
 * IntelligenceSection — Financial Intelligence Layer V1 UI surface.
 *
 * Renders the full deterministic intelligence report from
 * `buildFinancialIntelligence()` in a calm, collapsible advisor-memo
 * layout that respects the premium dark-navy + warm-gold palette.
 *
 * Top-level structure:
 *   1. Critical findings hero
 *   2. Explainability memo
 *   3. Turning points
 *   4. Fragility map
 *   5. Assumption dependency map
 *   6. Weakest link
 *   7. Regime dependency
 *   8. Behavioural survivability
 *   9. Path robustness
 *  10. Recommendation drift + financial drift
 *  11. Reusable insight cards (full list)
 *
 * Each section is collapsible and mobile-first; nothing is dense by
 * default.
 */

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  Compass,
  ShieldAlert,
  TrendingDown,
  Wrench,
  Gauge,
  Layers,
  ListChecks,
  Brain,
} from "lucide-react";
import type { QuickDecisionOutput } from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import {
  buildFinancialIntelligence,
  type FinancialIntelligenceReport,
  type PriorContext,
  type RegimePerformance,
} from "@/lib/scenarioV2/intelligence";
import { InsightCardView } from "./InsightCard";

export interface IntelligenceSectionProps {
  output: QuickDecisionOutput;
  /** Optional prior context for adaptive-recommendation + drift modules. */
  prior?: PriorContext | null;
  defaultOpen?: boolean;
}

const REGIME_TONE: Record<RegimePerformance, string> = {
  strong: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]",
  neutral: "bg-muted text-muted-foreground",
  weak: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]",
  fragile: "bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))]",
};

export function IntelligenceSection({
  output,
  prior = null,
  defaultOpen = true,
}: IntelligenceSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const report = useMemo<FinancialIntelligenceReport>(
    () => buildFinancialIntelligence({ output, prior }),
    [output, prior],
  );

  if (!output.ranked.length) return null;

  return (
    <div className="space-y-3" data-testid="intelligence-section">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg border border-[hsl(var(--intelligence)/0.4)] bg-[hsl(var(--intelligence-surface))] hover:bg-[hsl(var(--surface-3))] transition-colors min-h-[48px]"
        aria-expanded={open}
        data-testid="intelligence-section-toggle"
      >
        <Brain className="h-4 w-4 text-[hsl(var(--intelligence-light))] shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-semibold text-foreground">
            Financial Intelligence
          </div>
          <div className="text-[11px] text-muted-foreground leading-snug truncate">
            Interpretive overlay — turning points, fragility, assumptions, regimes, behavioural risk
          </div>
        </div>
        {report.criticalFindings.length > 0 && (
          <Badge
            className="bg-[hsl(var(--warning)/0.18)] text-[hsl(var(--warning))] text-[10px]"
            data-testid="intelligence-critical-badge"
          >
            {report.criticalFindings.length} critical
          </Badge>
        )}
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-3">
          {/* 1. Critical findings hero */}
          {report.criticalFindings.length > 0 && (
            <Card
              className="border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning)/0.04)]"
              data-testid="critical-findings"
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />
                  Critical findings
                </CardTitle>
                <CardDescription className="text-xs">
                  The most material risks and breakpoints in the current recommendation.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {report.criticalFindings.map((c) => (
                  <InsightCardView key={c.id} card={c} compact />
                ))}
              </CardContent>
            </Card>
          )}

          {/* 2. Explainability — advisor memo */}
          <Collapsible
            title="Why this recommendation"
            hint="Eight-question explainability layer"
            icon={<Compass className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />}
            dataTestid="explainability-memo"
          >
            <ExplainabilityList report={report} />
          </Collapsible>

          {/* 3. Turning points */}
          {report.turningPoints.length > 0 && (
            <Collapsible
              title="Turning points"
              hint="Breakpoints where recommendation or risk shifts"
              icon={<Activity className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />}
              dataTestid="turning-points"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {report.turningPoints.map((tp) => (
                  <InsightCardView
                    key={tp.id}
                    card={{
                      id: tp.id,
                      kind: "turning-point-warning",
                      category: "turning-point",
                      severity: tp.severity,
                      title: humanise(tp.kind),
                      body: tp.description,
                      threshold: tp.threshold,
                      drivers: tp.drivers,
                    }}
                  />
                ))}
              </div>
            </Collapsible>
          )}

          {/* 4. Fragility map */}
          {report.fragility.length > 0 && (
            <Collapsible
              title="Fragility map"
              hint="Hidden dependencies the top-line numbers obscure"
              icon={<AlertTriangle className="h-4 w-4 text-[hsl(var(--warning))]" />}
              dataTestid="fragility-map"
            >
              <div className="space-y-2">
                {report.fragility.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-start gap-2 px-3 py-2 rounded-md bg-[hsl(var(--surface-2))] border border-border/60"
                    data-testid={`fragility-${f.kind}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs sm:text-sm text-foreground/85 leading-relaxed">
                        {f.description}
                      </div>
                    </div>
                    <Badge className="text-[10px] uppercase shrink-0" variant="outline">
                      {Math.round(f.weight * 100)}%
                    </Badge>
                  </div>
                ))}
              </div>
            </Collapsible>
          )}

          {/* 5. Assumption dependency map */}
          {report.assumptions.length > 0 && (
            <Collapsible
              title="Critical assumptions"
              hint="Inputs driving the outcome ranked by impact"
              icon={<Sparkles className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />}
              dataTestid="assumption-map"
            >
              <div className="space-y-2">
                {report.assumptions.slice(0, 6).map((a) => (
                  <div
                    key={a.key}
                    className="px-3 py-2 rounded-md bg-[hsl(var(--surface-2))] border border-border/60"
                    data-testid={`assumption-${a.key}`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-xs sm:text-sm font-semibold text-foreground">
                        {a.label}
                      </div>
                      <Badge
                        className={`text-[10px] uppercase ${
                          a.impactBand === "high"
                            ? "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]"
                            : a.impactBand === "medium"
                            ? "bg-[hsl(var(--intelligence)/0.15)] text-[hsl(var(--intelligence-light))]"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {a.impactBand} impact
                      </Badge>
                    </div>
                    <div className="text-[11px] sm:text-xs text-foreground/75 leading-relaxed mt-1">
                      {a.impactDescription}
                    </div>
                    {a.quant && (
                      <div className="text-[11px] text-foreground/70 mt-1 italic">
                        {a.quant.label}{" "}
                        <span className="font-semibold not-italic">
                          {a.quant.unit === "$" ? `$${a.quant.value.toLocaleString("en-AU")}` : `${a.quant.value} ${a.quant.unit}`}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Collapsible>
          )}

          {/* 6. Weakest link */}
          <Collapsible
            title="Strategic weakest link"
            hint="Single most fragile point and bottleneck"
            icon={<Wrench className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />}
            dataTestid="weakest-link"
          >
            <div className="space-y-2 text-xs sm:text-sm text-foreground/85 leading-relaxed">
              <Line label="Primary fragility" value={report.weakestLink.primary} />
              <Line label="Bottleneck" value={report.weakestLink.bottleneck} />
              <Line label="Dominant risk" value={report.weakestLink.dominantRisk} />
              {report.weakestLink.fireBlocker && (
                <Line label="FIRE blocker" value={report.weakestLink.fireBlocker} />
              )}
            </div>
          </Collapsible>

          {/* 7. Regime dependency */}
          <Collapsible
            title="Regime dependency"
            hint="How the strategy performs across macro regimes"
            icon={<Layers className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />}
            dataTestid="regime-map"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {report.regime.map((r) => (
                <div
                  key={r.regime}
                  className="px-3 py-2 rounded-md bg-[hsl(var(--surface-2))] border border-border/60"
                  data-testid={`regime-${r.regime}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs sm:text-sm font-semibold text-foreground">
                      {r.label}
                    </span>
                    <Badge className={`text-[10px] uppercase ${REGIME_TONE[r.performance]}`}>
                      {r.performance}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-foreground/75 leading-relaxed">
                    {r.rationale}
                  </div>
                </div>
              ))}
            </div>
          </Collapsible>

          {/* 8. Behavioural survivability */}
          {report.behavioural.length > 0 && (
            <Collapsible
              title="Behavioural survivability"
              hint="Mathematical vs psychological execution risk"
              icon={<Gauge className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />}
              dataTestid="behavioural-map"
            >
              <div className="space-y-2">
                {report.behavioural.map((b) => (
                  <div
                    key={b.axis}
                    className="px-3 py-2 rounded-md bg-[hsl(var(--surface-2))] border border-border/60"
                    data-testid={`behavioural-${b.axis}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs sm:text-sm font-semibold text-foreground capitalize">
                        {b.axis.replace(/-/g, " ")}
                      </span>
                      <Badge className="text-[10px] uppercase" variant="outline">
                        {Math.round(b.risk * 100)}%
                      </Badge>
                    </div>
                    <div className="text-[11px] text-foreground/75 leading-relaxed">
                      {b.description}
                    </div>
                  </div>
                ))}
              </div>
            </Collapsible>
          )}

          {/* 9. Path robustness */}
          <Collapsible
            title="Path robustness"
            hint="High-return-fragile vs lower-return-robust"
            icon={<ShieldAlert className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />}
            dataTestid="robustness-section"
          >
            <div className="space-y-2 text-xs sm:text-sm text-foreground/85 leading-relaxed">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">
                  Robustness {Math.round(report.robustness.robustnessScore * 100)}/100
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  Return {Math.round(report.robustness.returnScore * 100)}/100
                </Badge>
                <Badge className="text-[10px] bg-[hsl(var(--intelligence)/0.15)] text-[hsl(var(--intelligence-light))]">
                  {report.robustness.classification.replace(/-/g, " ")}
                </Badge>
              </div>
              <p>{report.robustness.tradeoff}</p>
              <ul className="space-y-1 pl-2 text-[11px] sm:text-xs text-foreground/75">
                {report.robustness.rationale.map((r, i) => (
                  <li key={i}>· {r}</li>
                ))}
              </ul>
            </div>
          </Collapsible>

          {/* 10. Recommendation drift + financial drift */}
          {(report.recommendationDelta.changed || report.drift.length > 0) && (
            <Collapsible
              title="Recommendation & financial drift"
              hint="What changed vs prior run + ledger trend signals"
              icon={<TrendingDown className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />}
              dataTestid="drift-section"
            >
              <div className="space-y-3">
                <div
                  className="px-3 py-2 rounded-md bg-[hsl(var(--surface-2))] border border-border/60"
                  data-testid="recommendation-delta"
                >
                  <div className="text-xs sm:text-sm font-semibold text-foreground mb-1">
                    {report.recommendationDelta.changed
                      ? "Recommendation changed"
                      : report.meta.isBaselineRecommendation
                      ? "Baseline recommendation"
                      : "Recommendation unchanged"}
                  </div>
                  <div className="text-[11px] sm:text-xs text-foreground/80 leading-relaxed">
                    {report.recommendationDelta.reason}
                  </div>
                  {report.recommendationDelta.diffs.length > 0 && (
                    <ul className="text-[11px] text-foreground/70 mt-1 space-y-0.5">
                      {report.recommendationDelta.diffs.map((d, i) => (
                        <li key={i}>· {d}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {report.drift.length > 0 && (
                  <div className="space-y-2">
                    {report.drift.map((d, i) => (
                      <div
                        key={`${d.kind}-${i}`}
                        className="px-3 py-2 rounded-md bg-[hsl(var(--surface-2))] border border-border/60"
                        data-testid={`drift-${d.kind}`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-foreground capitalize">
                            {d.kind.replace(/-/g, " ")}
                          </span>
                          <Badge className="text-[10px] uppercase" variant="outline">
                            {d.severity}
                          </Badge>
                          {d.needsHistory && (
                            <Badge
                              className="text-[10px] bg-muted text-muted-foreground"
                              data-testid="needs-history-tag"
                            >
                              needs history
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-foreground/75 leading-relaxed">
                          {d.description}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Collapsible>
          )}

          {/* 11. Reusable insight cards */}
          <Collapsible
            title="Insight cards"
            hint="Complete intelligence card surface"
            icon={<ListChecks className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />}
            dataTestid="all-insight-cards"
            defaultOpen={false}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {report.insightCards.map((c) => (
                <InsightCardView key={c.id} card={c} />
              ))}
            </div>
          </Collapsible>
        </div>
      )}
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

interface CollapsibleProps {
  title: string;
  hint: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  dataTestid?: string;
}

function Collapsible({
  title,
  hint,
  icon,
  children,
  defaultOpen = true,
  dataTestid,
}: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border bg-card/40" data-testid={dataTestid}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 sm:px-4 py-2.5 hover:bg-muted/30 transition-colors min-h-[44px] text-left"
      >
        {icon}
        <div className="flex-1 min-w-0">
          <div className="text-xs sm:text-sm font-semibold text-foreground">{title}</div>
          <div className="text-[10px] sm:text-[11px] text-muted-foreground leading-snug truncate">
            {hint}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="px-3 sm:px-4 pb-3 pt-1 border-t border-border/50">{children}</div>}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide font-semibold text-[hsl(var(--intelligence-light))] mb-0.5">
        {label}
      </div>
      <p className="text-xs sm:text-sm text-foreground/85 leading-relaxed">{value}</p>
    </div>
  );
}

function ExplainabilityList({ report }: { report: FinancialIntelligenceReport }) {
  const items: Array<{ q: string; a: string }> = [
    { q: "Why this won", a: report.explainability.whyThisWon },
    { q: "Why others lost", a: report.explainability.whyOthersLost },
    { q: "What changes the answer", a: report.explainability.whatChangesTheAnswer },
    { q: "What breaks the strategy", a: report.explainability.whatBreaksTheStrategy },
    { q: "What assumptions matter most", a: report.explainability.whatAssumptionsMatter },
    { q: "What environment this needs", a: report.explainability.whatEnvironmentItNeeds },
    { q: "How robust this path is", a: report.explainability.howRobustItIs },
    { q: "How behaviourally realistic", a: report.explainability.howBehaviourallyRealistic },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="explainability-grid">
      {items.map((item, i) => (
        <div
          key={i}
          className="px-3 py-2 rounded-md bg-[hsl(var(--surface-2))] border border-border/60"
          data-testid={`explain-${i}`}
        >
          <div className="text-[10px] uppercase tracking-wide font-semibold text-[hsl(var(--intelligence-light))] mb-1">
            {item.q}
          </div>
          <p className="text-[11px] sm:text-xs text-foreground/85 leading-relaxed">{item.a}</p>
        </div>
      ))}
    </div>
  );
}

function humanise(kind: string): string {
  switch (kind) {
    case "recommendation-flip": return "Recommendation flip threshold";
    case "risk-acceleration": return "Risk acceleration threshold";
    case "leverage-unsafe": return "Leverage pressure threshold";
    case "fire-collapse": return "FIRE trajectory breakpoint";
    case "liquidity-stress": return "Liquidity stress threshold";
    case "debt-dominant": return "Debt-service dominance";
    case "serviceability-weak": return "Refinance pressure threshold";
    case "volatility-intolerance": return "Volatility tolerance breach";
    default: return kind.replace(/-/g, " ");
  }
}

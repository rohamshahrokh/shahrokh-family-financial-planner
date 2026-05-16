/**
 * AutonomousSection — Phase 3 Autonomous Financial OS UI surface.
 *
 * Renders the deterministic AutonomousReport from buildAutonomousReport()
 * in a calm, collapsible, mobile-first layout. Uses the premium dark-navy
 * + warm-gold palette via existing hsl(var(--*)) tokens. No new theme
 * tokens; no layout changes elsewhere.
 *
 * Top-level structure:
 *   1. Critical findings hero
 *   2. Macro regime
 *   3. Recommendation evolution / why this changed
 *   4. Dynamic priority stack
 *   5. Autonomous alerts
 *   6. Continuous strategy monitoring
 *   7. Opportunity windows
 *   8. Trajectory drift
 *   9. Rebalancing intelligence
 *  10. Life-event simulation
 *  11. Longitudinal comparison
 *  12. Rolling roadmap
 *  13. Strategic memory echo
 *  14. Visualisation strip (lightweight)
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
  AlertTriangle,
  Activity,
  Sparkles,
  ChevronDown,
  Compass,
  Bell,
  ListChecks,
  TrendingDown,
  Layers,
  Brain,
  Zap,
  History,
  CalendarClock,
  Eye,
  PieChart,
  ShieldAlert,
  Droplet,
  Flame,
  Coins,
} from "lucide-react";
import type { QuickDecisionOutput } from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import type { FinancialIntelligenceReport } from "@/lib/scenarioV2/intelligence";
import {
  buildAutonomousReport,
  type AutonomousAlert,
  type AutonomousReport,
  type LedgerSnapshot,
  type MacroRegimeSignals,
  type MonitoringSignal,
  type OpportunityWindow,
  type PriorityItem,
  type RebalanceSignal,
  type StrategicMemoryInput,
  type TrajectoryDrift,
} from "@/lib/scenarioV2/autonomous";
import type { BasePlanAssumptions } from "@/lib/scenarioV2";
import type { InsightSeverity } from "@/lib/scenarioV2/intelligence";

const SEVERITY_BORDER: Record<InsightSeverity, string> = {
  critical: "border-[hsl(var(--destructive)/0.5)]",
  warn: "border-[hsl(var(--warning)/0.5)]",
  watch: "border-[hsl(var(--intelligence)/0.40)]",
  info: "border-border",
};

const SEVERITY_BADGE: Record<InsightSeverity, string> = {
  critical: "bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))]",
  warn: "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]",
  watch: "bg-[hsl(var(--intelligence)/0.15)] text-[hsl(var(--intelligence-light))]",
  info: "bg-muted text-muted-foreground",
};

const DIRECTION_BADGE: Record<MonitoringSignal["direction"], string> = {
  improving: "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]",
  stable: "bg-muted text-muted-foreground",
  deteriorating: "bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))]",
  "needs-history": "bg-[hsl(var(--intelligence)/0.10)] text-[hsl(var(--intelligence-light))]",
};

export interface AutonomousSectionProps {
  output: QuickDecisionOutput;
  intelligence: FinancialIntelligenceReport;
  assumptions: BasePlanAssumptions;
  history?: LedgerSnapshot[];
  memory?: StrategicMemoryInput | null;
  regimeSignals?: MacroRegimeSignals;
  defaultOpen?: boolean;
}

export function AutonomousSection({
  output,
  intelligence,
  assumptions,
  history = [],
  memory = null,
  regimeSignals,
  defaultOpen = true,
}: AutonomousSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const report = useMemo<AutonomousReport>(
    () =>
      buildAutonomousReport({
        output,
        intelligence,
        assumptions,
        history,
        memory,
        regimeSignals,
      }),
    [output, intelligence, assumptions, history, memory, regimeSignals],
  );

  if (!output.ranked?.length) return null;

  return (
    <div className="space-y-3" data-testid="autonomous-section">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-lg border border-[hsl(var(--intelligence)/0.4)] bg-[hsl(var(--intelligence-surface))] hover:bg-[hsl(var(--surface-3))] transition-colors min-h-[48px]"
        aria-expanded={open}
        data-testid="autonomous-section-toggle"
      >
        <Zap className="h-4 w-4 text-[hsl(var(--intelligence-light))] shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-semibold text-foreground">
            Autonomous Financial OS
          </div>
          <div className="text-[11px] text-muted-foreground leading-snug truncate">
            Continuous monitoring, alerts, priorities, opportunities, drift, rebalancing, life-event impact, regime, roadmap
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-3" data-testid="autonomous-content">
          <CriticalFindings report={report} />
          <RegimeBlock report={report} />
          <RecommendationChangeBlock report={report} />
          <PriorityStack priorities={report.priorities} />
          <AlertsBlock alerts={report.alerts} />
          <MonitoringBlock signals={report.monitoring} />
          <OpportunitiesBlock opportunities={report.opportunities} />
          <DriftBlock drift={report.drift} />
          <RebalancingBlock signals={report.rebalancing} />
          <LifeEventsBlock report={report} />
          <LongitudinalBlock report={report} />
          <RoadmapBlock report={report} />
          <StrategicMemoryBlock report={report} />
          <VisualisationsBlock report={report} />
          <FooterMeta report={report} />
        </div>
      )}
    </div>
  );
}

// ────────────────────────── BLOCKS ──────────────────────────

function CriticalFindings({ report }: { report: AutonomousReport }) {
  const items = report.criticalFindings;
  if (!items.length) {
    return (
      <Card className="bg-card/60 border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-[hsl(var(--success))]" />
            <CardTitle className="text-sm">Critical findings</CardTitle>
            <Badge className="ml-auto bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))] text-[10px]">
              clear
            </Badge>
          </div>
          <CardDescription className="text-xs leading-snug">
            No critical or warning-grade findings under the current run.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card className="bg-card/60 border-[hsl(var(--destructive)/0.4)]">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[hsl(var(--destructive))]" />
          <CardTitle className="text-sm">Critical findings</CardTitle>
          <Badge className="ml-auto bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))] text-[10px]">
            {items.length}
          </Badge>
        </div>
        <CardDescription className="text-xs leading-snug">
          Top items the autonomous layer flagged this run.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {items.map((it) => (
          <div
            key={it.id}
            className={`rounded-md border ${SEVERITY_BORDER[it.severity]} bg-card/40 p-2.5`}
            data-testid={`critical-${it.source}`}
          >
            <div className="flex items-start gap-2">
              <Badge className={`${SEVERITY_BADGE[it.severity]} text-[10px] uppercase`}>
                {it.severity}
              </Badge>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{it.source}</span>
            </div>
            <div className="text-sm font-medium text-foreground mt-1">{it.title}</div>
            <div className="text-xs text-muted-foreground leading-snug">{it.body}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RegimeBlock({ report }: { report: AutonomousReport }) {
  const r = report.regime;
  return (
    <Card className="bg-card/60 border-[hsl(var(--intelligence)/0.4)]">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />
          <CardTitle className="text-sm">Macro regime awareness</CardTitle>
          <Badge className="ml-auto bg-[hsl(var(--intelligence)/0.15)] text-[hsl(var(--intelligence-light))] text-[10px]">
            {(r.confidence * 100).toFixed(0)}% confidence
          </Badge>
        </div>
        <CardDescription className="text-xs leading-snug">{r.label}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        <div className="text-xs text-foreground/90 leading-snug">{r.rationale}</div>
        {r.implications.length > 0 && (
          <ul className="space-y-1 text-xs">
            {r.implications.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-foreground/85">
                <Activity className="h-3 w-3 text-[hsl(var(--intelligence-light))] mt-0.5 shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RecommendationChangeBlock({ report }: { report: AutonomousReport }) {
  const c = report.recommendationChange;
  return (
    <Card className="bg-card/60 border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />
          <CardTitle className="text-sm">Why this changed</CardTitle>
          <Badge className={`ml-auto text-[10px] ${c.changed ? SEVERITY_BADGE.warn : SEVERITY_BADGE.info}`}>
            {c.changed ? "changed" : "unchanged"}
          </Badge>
        </div>
        <CardDescription className="text-xs leading-snug">
          {c.previousLabel ? `Previous: ${c.previousLabel}  →  Current: ${c.currentLabel}` : `Current: ${c.currentLabel}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        <div className="text-xs text-foreground/90 leading-snug">{c.reason}</div>
        {c.factors.length > 0 && (
          <ul className="space-y-1 text-xs">
            {c.factors.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-foreground/80">
                <Activity className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PriorityStack({ priorities }: { priorities: PriorityItem[] }) {
  if (!priorities.length) {
    return (
      <Card className="bg-card/60 border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />
            <CardTitle className="text-sm">Dynamic priority stack</CardTitle>
          </div>
          <CardDescription className="text-xs leading-snug">No active priorities — the plan is on track.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return (
    <Card className="bg-card/60 border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />
          <CardTitle className="text-sm">Dynamic priority stack</CardTitle>
          <Badge className={`ml-auto text-[10px] ${SEVERITY_BADGE.watch}`}>{priorities.length}</Badge>
        </div>
        <CardDescription className="text-xs leading-snug">
          Top priorities right now, ranked by severity then urgency.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {priorities.map((p) => (
          <div key={p.id} className="rounded-md border border-border bg-card/40 p-2.5" data-testid={`priority-${p.rank}`}>
            <div className="flex items-start gap-2 flex-wrap">
              <Badge className={`${SEVERITY_BADGE.watch} text-[10px]`}>#{p.rank}</Badge>
              <div className="text-sm font-medium text-foreground flex-1 min-w-0">{p.title}</div>
              <Badge className={`text-[10px] ${urgencyBadge(p.urgency)}`}>{p.urgency}</Badge>
            </div>
            <div className="text-xs text-muted-foreground leading-snug mt-1">{p.rationale}</div>
            <div className="text-xs text-foreground/85 mt-1.5 leading-snug">
              <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--intelligence-light))] mr-1">Suggested</span>
              {p.suggestedAction}
            </div>
            {p.deepLink && (
              <a href={p.deepLink} className="text-[11px] text-[hsl(var(--intelligence-light))] underline mt-1 inline-block">
                Open related view →
              </a>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function urgencyBadge(u: PriorityItem["urgency"]): string {
  switch (u) {
    case "immediate": return SEVERITY_BADGE.critical;
    case "near-term": return SEVERITY_BADGE.warn;
    case "ongoing": return SEVERITY_BADGE.watch;
    case "long-term": return SEVERITY_BADGE.info;
  }
}

function AlertsBlock({ alerts }: { alerts: AutonomousAlert[] }) {
  if (!alerts.length) return null;
  return (
    <Card className="bg-card/60 border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />
          <CardTitle className="text-sm">Autonomous alerts</CardTitle>
          <Badge className={`ml-auto text-[10px] ${SEVERITY_BADGE.watch}`}>{alerts.length}</Badge>
        </div>
        <CardDescription className="text-xs leading-snug">
          Continuous warnings, opportunities, structural notes, risk and execution reminders.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {alerts.map((a) => (
          <div key={a.id} className={`rounded-md border ${SEVERITY_BORDER[a.severity]} bg-card/40 p-2.5`} data-testid={`alert-${a.channel}`}>
            <div className="flex items-start gap-2 flex-wrap">
              <Badge className={`${SEVERITY_BADGE[a.severity]} text-[10px] uppercase`}>{a.severity}</Badge>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{a.channel}</span>
            </div>
            <div className="text-sm font-medium text-foreground mt-1">{a.title}</div>
            <div className="text-xs text-muted-foreground leading-snug">{a.body}</div>
            {a.threshold && (
              <div className="text-[11px] text-foreground/70 mt-1">
                <span className="uppercase tracking-wide text-[10px] mr-1 text-[hsl(var(--intelligence-light))]">Threshold</span>
                {a.threshold.label}
                {a.threshold.value !== undefined ? `: ${a.threshold.value}${a.threshold.unit ?? ""}` : null}
              </div>
            )}
            {a.suggestedAction && (
              <div className="text-xs text-foreground/85 mt-1.5 leading-snug">
                <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--intelligence-light))] mr-1">Action</span>
                {a.suggestedAction}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MonitoringBlock({ signals }: { signals: MonitoringSignal[] }) {
  if (!signals.length) return null;
  return (
    <Card className="bg-card/60 border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />
          <CardTitle className="text-sm">Continuous strategy monitoring</CardTitle>
        </div>
        <CardDescription className="text-xs leading-snug">
          Per-dimension health checks across balance sheet, cashflow, leverage, liquidity, debt, FIRE, risk, sensitivity, concentration, behaviour.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {signals.map((s) => (
            <div key={s.id} className={`rounded-md border ${SEVERITY_BORDER[s.severity]} bg-card/40 p-2.5`} data-testid={`monitor-${s.dimension}`}>
              <div className="flex items-start gap-2 flex-wrap">
                <Badge className={`${DIRECTION_BADGE[s.direction]} text-[10px] uppercase`}>{s.direction}</Badge>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.dimension}</span>
              </div>
              <div className="text-sm font-medium text-foreground mt-1">{s.label}</div>
              <div className="text-xs text-muted-foreground leading-snug">{s.summary}</div>
              {s.delta && (
                <div className="text-[11px] text-foreground/70 mt-1">
                  {s.delta.label}: {formatNumber(s.delta.value)}{s.delta.unit}
                </div>
              )}
              {s.needsHistory && (
                <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--intelligence-light))] mt-1">Awaiting history</div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function OpportunitiesBlock({ opportunities }: { opportunities: OpportunityWindow[] }) {
  if (!opportunities.length) return null;
  return (
    <Card className="bg-card/60 border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[hsl(var(--success))]" />
          <CardTitle className="text-sm">Opportunity windows</CardTitle>
          <Badge className={`ml-auto text-[10px] ${SEVERITY_BADGE.info}`}>{opportunities.length}</Badge>
        </div>
        <CardDescription className="text-xs leading-snug">
          Deterministic upside windows detected in current state and regime.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {opportunities.map((o) => (
          <div key={o.id} className={`rounded-md border ${SEVERITY_BORDER[o.severity]} bg-card/40 p-2.5`} data-testid={`opportunity-${o.kind}`}>
            <div className="flex items-start gap-2 flex-wrap">
              <Badge className={`${SEVERITY_BADGE[o.severity]} text-[10px] uppercase`}>{o.severity}</Badge>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{o.kind}</span>
              {o.quant && (
                <span className="text-[10px] text-foreground/70 ml-auto">{o.quant.label}: {formatNumber(o.quant.value)}{o.quant.unit}</span>
              )}
            </div>
            <div className="text-sm font-medium text-foreground mt-1">{o.title}</div>
            <div className="text-xs text-muted-foreground leading-snug">{o.body}</div>
            <div className="text-xs text-foreground/85 mt-1.5 leading-snug">
              <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--intelligence-light))] mr-1">Action</span>
              {o.suggestedAction}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DriftBlock({ drift }: { drift: TrajectoryDrift[] }) {
  if (!drift.length) return null;
  return (
    <Card className="bg-card/60 border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />
          <CardTitle className="text-sm">Trajectory drift</CardTitle>
        </div>
        <CardDescription className="text-xs leading-snug">
          FIRE delay, savings-rate, lifestyle, leverage, liquidity, dependency, survivability.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {drift.map((d) => (
          <div key={d.id} className={`rounded-md border ${SEVERITY_BORDER[d.severity]} bg-card/40 p-2.5`} data-testid={`drift-${d.kind}`}>
            <div className="flex items-start gap-2 flex-wrap">
              <Badge className={`${SEVERITY_BADGE[d.severity]} text-[10px] uppercase`}>{d.severity}</Badge>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{d.kind}</span>
            </div>
            <div className="text-sm text-foreground mt-1 leading-snug">{d.description}</div>
            {d.magnitude && (
              <div className="text-[11px] text-foreground/70 mt-1">
                {d.magnitude.label}: {formatNumber(d.magnitude.value)}{d.magnitude.unit}
              </div>
            )}
            {d.needsHistory && (
              <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--intelligence-light))] mt-1">Awaiting history</div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RebalancingBlock({ signals }: { signals: RebalanceSignal[] }) {
  if (!signals.length) return null;
  return (
    <Card className="bg-card/60 border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <PieChart className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />
          <CardTitle className="text-sm">Rebalancing intelligence</CardTitle>
        </div>
        <CardDescription className="text-xs leading-snug">
          Allocation drift, concentration, volatility imbalance, liquidity imbalance, CGT-aware timing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {signals.map((s) => (
          <div key={s.id} className={`rounded-md border ${SEVERITY_BORDER[s.severity]} bg-card/40 p-2.5`} data-testid={`rebalance-${s.kind}`}>
            <div className="flex items-start gap-2 flex-wrap">
              <Badge className={`${SEVERITY_BADGE[s.severity]} text-[10px] uppercase`}>{s.severity}</Badge>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.kind}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{s.assetClass}</span>
            </div>
            <div className="text-sm text-foreground mt-1 leading-snug">{s.description}</div>
            <div className="text-xs text-foreground/85 mt-1.5 leading-snug">
              <span className="text-[10px] uppercase tracking-wide text-[hsl(var(--intelligence-light))] mr-1">Action</span>
              {s.suggestedAction}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function LifeEventsBlock({ report }: { report: AutonomousReport }) {
  if (!report.lifeEvents.length) return null;
  return (
    <Card className="bg-card/60 border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />
          <CardTitle className="text-sm">Life-event impact</CardTitle>
        </div>
        <CardDescription className="text-xs leading-snug">
          Proactive what-if simulation across major life events.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {report.lifeEvents.map((e) => (
            <div key={e.id} className="rounded-md border border-border bg-card/40 p-2.5" data-testid={`life-${e.kind}`}>
              <div className="flex items-start gap-2 flex-wrap">
                <Badge className={`text-[10px] uppercase ${e.direction === "improves" ? "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]" : e.direction === "deteriorates" ? "bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))]" : "bg-muted text-muted-foreground"}`}>
                  {e.direction}
                </Badge>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{e.kind}</span>
              </div>
              <div className="text-sm font-medium text-foreground mt-1">{e.label}</div>
              <div className="text-xs text-muted-foreground leading-snug">{e.summary}</div>
              {e.estimate && (
                <div className="text-[11px] text-foreground/70 mt-1">
                  {e.estimate.label}: {formatNumber(e.estimate.value)}{e.estimate.unit}
                </div>
              )}
              {e.deepLink && (
                <a href={e.deepLink} className="text-[11px] text-[hsl(var(--intelligence-light))] underline mt-1 inline-block">
                  Model in detail →
                </a>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function LongitudinalBlock({ report }: { report: AutonomousReport }) {
  const l = report.longitudinal;
  return (
    <Card className="bg-card/60 border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />
          <CardTitle className="text-sm">Longitudinal intelligence</CardTitle>
          <Badge className={`ml-auto text-[10px] ${l.hasHistory ? SEVERITY_BADGE.info : SEVERITY_BADGE.watch}`}>
            {l.hasHistory ? l.window : "baseline"}
          </Badge>
        </div>
        <CardDescription className="text-xs leading-snug">
          Resilience comparison versus the prior window.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {l.summary.map((s, i) => (
          <div key={i} className="text-xs text-foreground/90 leading-snug">{s}</div>
        ))}
        {l.deltas.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            {l.deltas.map((d, i) => (
              <div key={i} className="rounded-md border border-border bg-card/30 p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{d.label}</div>
                <div className={`text-sm font-medium ${d.direction === "up" ? "text-[hsl(var(--success))]" : d.direction === "down" ? "text-[hsl(var(--destructive))]" : "text-foreground"}`}>
                  {d.direction === "up" ? "+" : d.direction === "down" ? "" : ""}{formatNumber(d.value)}{d.unit}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RoadmapBlock({ report }: { report: AutonomousReport }) {
  if (!report.roadmap.length) return null;
  return (
    <Card className="bg-card/60 border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />
          <CardTitle className="text-sm">Rolling strategic roadmap</CardTitle>
        </div>
        <CardDescription className="text-xs leading-snug">
          3-month, 12-month, 3-year, and 10-year action sets — refreshed every run.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {report.roadmap.map((h) => (
            <div key={h.horizon} className="rounded-md border border-border bg-card/40 p-2.5" data-testid={`roadmap-${h.horizon}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`text-[10px] ${SEVERITY_BADGE.watch}`}>{h.label}</Badge>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{h.theme}</span>
              </div>
              <ul className="space-y-1 text-xs mt-2">
                {h.actions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-foreground/85">
                    <Activity className="h-3 w-3 text-[hsl(var(--intelligence-light))] mt-0.5 shrink-0" />
                    <span className="leading-snug">{a}</span>
                  </li>
                ))}
              </ul>
              {h.conditions && h.conditions.length > 0 && (
                <div className="text-[11px] text-foreground/70 mt-2 italic leading-snug">
                  Conditions: {h.conditions.join(" · ")}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StrategicMemoryBlock({ report }: { report: AutonomousReport }) {
  const m = report.strategicMemory;
  return (
    <Card className="bg-card/60 border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />
          <CardTitle className="text-sm">Strategic memory</CardTitle>
          <Badge className={`ml-auto text-[10px] ${m.hasMemory ? SEVERITY_BADGE.info : SEVERITY_BADGE.watch}`}>
            {m.hasMemory ? "active" : "baseline"}
          </Badge>
        </div>
        <CardDescription className="text-xs leading-snug">
          Preferences, philosophy, leverage tolerance, liquidity preference, prior choices.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {m.summary.map((s, i) => (
          <div key={i} className="text-xs text-foreground/90 leading-snug">{s}</div>
        ))}
        {m.activeConstraints.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--intelligence-light))] mt-1">Active constraints</div>
            <ul className="space-y-1 text-xs">
              {m.activeConstraints.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-foreground/85">
                  <Eye className="h-3 w-3 text-[hsl(var(--intelligence-light))] mt-0.5 shrink-0" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VisualisationsBlock({ report }: { report: AutonomousReport }) {
  const v = report.visuals;
  const items = [
    { label: v.trajectoryDrift.label, has: v.trajectoryDrift.hasHistory, n: v.trajectoryDrift.data.length, icon: <TrendingDown className="h-3.5 w-3.5" /> },
    { label: v.allocationDrift.label, has: v.allocationDrift.hasHistory, n: v.allocationDrift.data.length, icon: <PieChart className="h-3.5 w-3.5" /> },
    { label: v.survivabilityTrend.label, has: v.survivabilityTrend.hasHistory, n: v.survivabilityTrend.data.length, icon: <Droplet className="h-3.5 w-3.5" /> },
    { label: v.priorityEvolution.label, has: v.priorityEvolution.hasHistory, n: v.priorityEvolution.data.length, icon: <ListChecks className="h-3.5 w-3.5" /> },
    { label: v.recommendationEvolution.label, has: v.recommendationEvolution.hasHistory, n: v.recommendationEvolution.data.length, icon: <Sparkles className="h-3.5 w-3.5" /> },
  ];
  return (
    <Card className="bg-card/60 border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <PieChart className="h-4 w-4 text-[hsl(var(--intelligence-light))]" />
          <CardTitle className="text-sm">Advanced visualisations</CardTitle>
        </div>
        <CardDescription className="text-xs leading-snug">
          Trajectory, allocation, survivability, priority and recommendation evolution. Charts activate as history accumulates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {items.map((it, i) => (
            <div key={i} className="rounded-md border border-border bg-card/40 p-2.5">
              <div className="flex items-center gap-1.5 text-[hsl(var(--intelligence-light))]">{it.icon}<span className="text-[11px] uppercase tracking-wide">{it.has ? "live" : "baseline"}</span></div>
              <div className="text-sm text-foreground mt-1 leading-snug">{it.label}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{it.has ? `${it.n} points` : "Will populate as snapshots accumulate"}</div>
            </div>
          ))}
        </div>
        {v.fragilityMap.length > 0 && (
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--intelligence-light))]">Fragility map</div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {v.fragilityMap.map((f, i) => (
                <Badge key={i} className={`text-[10px] ${SEVERITY_BADGE[f.severity]}`}>{f.label} · {(f.weight * 100).toFixed(0)}%</Badge>
              ))}
            </div>
          </div>
        )}
        {v.dependencyMap.length > 0 && (
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--intelligence-light))]">Dependency map</div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {v.dependencyMap.map((d, i) => (
                <Badge key={i} className={`text-[10px] ${SEVERITY_BADGE[d.severity]}`}>{d.label} · {(d.weight * 100).toFixed(0)}%</Badge>
              ))}
            </div>
          </div>
        )}
        {v.regimeMap.length > 0 && (
          <div className="mt-2">
            <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--intelligence-light))]">Regime map</div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {v.regimeMap.map((r, i) => (
                <Badge key={i} className={`text-[10px] ${performanceBadge(r.performance)}`}>{r.label}</Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function performanceBadge(p: "strong" | "neutral" | "weak" | "fragile"): string {
  switch (p) {
    case "strong": return "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]";
    case "neutral": return "bg-muted text-muted-foreground";
    case "weak": return "bg-[hsl(var(--warning)/0.15)] text-[hsl(var(--warning))]";
    case "fragile": return "bg-[hsl(var(--destructive)/0.15)] text-[hsl(var(--destructive))]";
  }
}

function FooterMeta({ report }: { report: AutonomousReport }) {
  return (
    <div className="text-[10px] text-muted-foreground leading-snug px-1">
      Regime: {report.meta.regimeNote}
      {" · "}History: {report.meta.hasHistory ? "available" : "baseline"}
      {" · "}Strategic memory: {report.meta.memoryActive ? "active" : "baseline"}
    </div>
  );
}

function formatNumber(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return v.toLocaleString("en-AU", { maximumFractionDigits: 0 });
  return v.toLocaleString("en-AU", { maximumFractionDigits: 2 });
}

// Suppress unused-import warnings for icons reserved for future expansion.
void Flame; void Coins; void ShieldAlert;

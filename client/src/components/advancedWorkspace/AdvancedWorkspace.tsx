/**
 * AdvancedWorkspace — institutional 3-panel analytical workspace.
 *
 * Architecture:
 *   Desktop/Wide (xl+):  [ ControlTower | Canvas + Tabs | RiskIntelligenceRail ]
 *   Tablet (lg):         [ ControlTower | Canvas + Tabs ]  (Risk Rail accessible via toggle)
 *   Mobile (<lg):        [ PinnedHeaderBar + SegmentedSections + SwipeableScenarios ]
 *
 * Visual divergence from Quick Decision: denser typography, tabular numerics,
 * tighter spacing, analytical chrome.
 *
 * Engine: identical to Quick Decision (generateQuickDecisionCandidates).
 * No engine changes. No DB changes. UX/architecture/visual refactor only.
 */
import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { ShieldAlert, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import {
  generateQuickDecisionCandidates,
  type QuickDecisionOutput,
  type QuickDecisionQuestionKind,
  type RankedCandidate,
  type RiskControlMode,
  type RiskControlOverrides,
  QUESTION_PRESETS,
  listQuestionPresets,
} from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import {
  type InvestorProfile,
} from "@/lib/scenarioV2/registry";
import type { DashboardInputs } from "@/lib/dashboardDataContract";

import { ControlTower } from "./ControlTower";
import { RiskIntelligenceRail } from "./RiskIntelligenceRail";

// Lazy-load heavy tabs to keep first paint snappy.
const OverviewPanel = lazy(() => import("./workspaceTabs/OverviewPanel").then(m => ({ default: m.OverviewPanel })));
const ProjectionPanel = lazy(() => import("./workspaceTabs/ProjectionPanel").then(m => ({ default: m.ProjectionPanel })));
const ComparePanel = lazy(() => import("./workspaceTabs/ComparePanel").then(m => ({ default: m.ComparePanel })));
const StressPanel = lazy(() => import("./workspaceTabs/StressPanel").then(m => ({ default: m.StressPanel })));
const ExecutionPanel = lazy(() => import("./workspaceTabs/ExecutionPanel").then(m => ({ default: m.ExecutionPanel })));
const AssumptionsTabPanel = lazy(() => import("./workspaceTabs/AssumptionsTabPanel").then(m => ({ default: m.AssumptionsTabPanel })));
const AiInsightsPanel = lazy(() => import("./workspaceTabs/AiInsightsPanel").then(m => ({ default: m.AiInsightsPanel })));

import { PANEL_HEADING_CLS, MICRO_CLS, LABEL_CLS, NUM_CLS } from "./workspaceTokens";
import { cn } from "@/lib/utils";

export interface AdvancedWorkspaceProps {
  dashboardInputs: DashboardInputs | null;
  liveReadouts: { income: number } | null;
  fmt: {
    fmt$: (n: number) => string;
    fmt$k: (n: number) => string;
    fmt$M: (n: number) => string;
    pct: (n: number, d?: number) => string;
    sentence: (s: string) => string;
  };
  privacyMode?: boolean;
}

type WorkspaceTab = "overview" | "projection" | "compare" | "stress" | "execution" | "assumptions" | "intelligence";

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "projection", label: "Projection" },
  { id: "compare", label: "Compare" },
  { id: "stress", label: "Stress" },
  { id: "execution", label: "Execution" },
  { id: "assumptions", label: "Assumptions" },
  { id: "intelligence", label: "AI Insights" },
];

const DEFAULT_QUESTION: QuickDecisionQuestionKind = "deploy_capital";
const DEFAULTS = {
  question: DEFAULT_QUESTION,
  capital: QUESTION_PRESETS[DEFAULT_QUESTION].defaults.capital,
  horizonYears: QUESTION_PRESETS[DEFAULT_QUESTION].defaults.horizonYears,
  dependants: QUESTION_PRESETS[DEFAULT_QUESTION].defaults.dependants,
  incomeVolatility: QUESTION_PRESETS[DEFAULT_QUESTION].defaults.incomeVolatility,
  investorProfile: QUESTION_PRESETS[DEFAULT_QUESTION].defaults.investorProfile as InvestorProfile,
  riskMode: "balanced" as RiskControlMode,
};

export function AdvancedWorkspace({ dashboardInputs, liveReadouts, fmt, privacyMode }: AdvancedWorkspaceProps) {
  // ── Inputs (mirror QuickDecisionTab) ──────────────────────────────────────
  const [question, setQuestion] = useState<QuickDecisionQuestionKind>(DEFAULTS.question);
  const [capital, setCapital] = useState<number>(DEFAULTS.capital);
  const [horizonYears, setHorizonYears] = useState<number>(DEFAULTS.horizonYears);
  const [dependants, setDependants] = useState<number>(DEFAULTS.dependants);
  const [incomeVolatility, setIncomeVolatility] = useState<number>(DEFAULTS.incomeVolatility);
  const [investorProfile, setInvestorProfile] = useState<InvestorProfile>(DEFAULTS.investorProfile);
  const [riskMode, setRiskMode] = useState<RiskControlMode>(DEFAULTS.riskMode);
  const [customControls] = useState<Partial<RiskControlOverrides>>({});
  const [hasHelpDebt, setHasHelpDebt] = useState<boolean>(false);
  const [hasPrivateHospitalCover, setHasPrivateHospitalCover] = useState<boolean>(true);

  // ── Output ───────────────────────────────────────────────────────────────
  const [output, setOutput] = useState<QuickDecisionOutput | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Workspace state ──────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [selectedRailId, setSelectedRailId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState<boolean>(false);
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>([]);

  // Drawer state for mobile / tablet
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);
  const [mobileRiskOpen, setMobileRiskOpen] = useState(false);

  // Capital input is meaningful for capital-deploy/buy-property/debt-vs-invest/super-vs-invest etc.
  // The engine accepts capital for all kinds, but we hide the slider for kinds where it's not the main lever.
  const capitalEligible = useMemo(
    () => question !== "downside_protection" && question !== "fire_acceleration",
    [question],
  );

  const canRun = useMemo(
    () => !!dashboardInputs && !running && (!capitalEligible || capital >= 0),
    [dashboardInputs, running, capitalEligible, capital],
  );

  // Selected candidate defaults to winner; user can click rows / tree / ranking to switch.
  const selectedCandidate: RankedCandidate | null = useMemo(() => {
    if (!output) return null;
    if (selectedRailId) {
      const c = output.ranked.find((x) => x.id === selectedRailId);
      if (c) return c;
    }
    return output.ranked[0] ?? null;
  }, [output, selectedRailId]);

  // Auto-select winner when output arrives
  useEffect(() => {
    if (output && output.ranked.length > 0 && !selectedRailId) {
      setSelectedRailId(output.ranked[0].id);
    }
  }, [output, selectedRailId]);

  // Invalidate output if any input changes
  useEffect(() => { setOutput(null); setSelectedRailId(null); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question, capital, horizonYears, dependants, incomeVolatility, investorProfile, riskMode, hasHelpDebt, hasPrivateHospitalCover]);

  async function runAnalysis() {
    if (!dashboardInputs) return;
    setRunning(true); setError(null); setOutput(null); setSelectedRailId(null);
    try {
      const annualGrossIncome = (liveReadouts?.income ?? 0) * 12;
      const out = await generateQuickDecisionCandidates({
        dashboardInputs,
        question: { kind: question, capital },
        horizonYears,
        household: { dependants, incomeVolatility },
        investorProfile,
        simulationCount: 300,
        taxContext: { annualGrossIncome, hasHelpDebt, hasPrivateHospitalCover },
        riskMode,
        riskControls: riskMode === "custom" ? customControls : undefined,
      });
      setOutput(out);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setRunning(false);
    }
  }

  function toggleScenarioSelection(id: string) {
    setSelectedScenarioIds((s) => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  }

  const scenarioList = useMemo(
    () => (output?.ranked ?? []).map((c) => ({ id: c.id, label: c.label })),
    [output?.ranked],
  );

  const controlTowerProps = {
    question, setQuestion, capital, setCapital, capitalEligible,
    horizonYears, setHorizonYears, dependants, setDependants,
    incomeVolatility, setIncomeVolatility,
    investorProfile, setInvestorProfile,
    riskMode, setRiskMode,
    hasHelpDebt, setHasHelpDebt, hasPrivateHospitalCover, setHasPrivateHospitalCover,
    canRun, running, onRun: runAnalysis, hasOutput: !!output,
    compareMode, setCompareMode, selectedScenarioIds, toggleScenarioSelection, scenarioList,
  };

  return (
    <div className="space-y-3" data-testid="advanced-workspace">
      {/* Mobile / tablet action bar (drawer triggers) */}
      <div className="flex items-center justify-between gap-2 lg:hidden">
        <Button
          variant="outline" size="sm"
          onClick={() => setMobileControlsOpen(true)}
          className="h-8 text-xs"
        >
          <Settings2 className="h-3 w-3 mr-1.5" />
          Controls
        </Button>
        {output && (
          <Button
            variant="outline" size="sm"
            onClick={() => setMobileRiskOpen(true)}
            className="h-8 text-xs"
          >
            <ShieldAlert className="h-3 w-3 mr-1.5" />
            Risk
          </Button>
        )}
      </div>

      {/* 3-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_300px] gap-4">
        {/* LEFT — Control Tower (desktop only; drawer on mobile) */}
        <ControlTower {...controlTowerProps} />

        {/* CENTER — Canvas */}
        <main className="min-w-0 space-y-3" data-testid="workspace-canvas">
          {error && (
            <div className="border border-rose-200 dark:border-rose-800/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs rounded-md p-2">
              {error}
            </div>
          )}

          {!output ? (
            <EmptyState
              hasInputs={!!dashboardInputs}
              running={running}
              onRun={runAnalysis}
              canRun={canRun}
            />
          ) : selectedCandidate ? (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as WorkspaceTab)}>
              <TabsList className="flex flex-wrap h-auto w-full justify-start gap-0.5 bg-muted/40 p-0.5">
                {TABS.map((t) => (
                  <TabsTrigger
                    key={t.id}
                    value={t.id}
                    className="text-[11px] uppercase tracking-wide h-7 px-2.5 data-[state=active]:bg-background"
                    data-testid={`workspace-tab-${t.id}`}
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="overview" className="mt-3">
                <Suspense fallback={<TabFallback />}>
                  <OverviewPanel
                    output={output}
                    selectedCandidate={selectedCandidate}
                    setRailScenario={setSelectedRailId}
                    fmt={fmt}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="projection" className="mt-3">
                <Suspense fallback={<TabFallback />}>
                  <ProjectionPanel
                    selectedCandidate={selectedCandidate}
                    fmt={fmt}
                    privacyMode={privacyMode}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="compare" className="mt-3">
                <Suspense fallback={<TabFallback />}>
                  <ComparePanel
                    output={output}
                    fmt={fmt}
                    selectedScenarioIds={selectedScenarioIds}
                    selectedRailScenarioId={selectedRailId}
                    setRailScenario={setSelectedRailId}
                    privacyMode={privacyMode}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="stress" className="mt-3">
                <Suspense fallback={<TabFallback />}>
                  <StressPanel
                    output={output}
                    selectedCandidate={selectedCandidate}
                    fmt={fmt}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="execution" className="mt-3">
                <Suspense fallback={<TabFallback />}>
                  <ExecutionPanel
                    output={output}
                    selectedCandidate={selectedCandidate}
                    fmt={fmt}
                  />
                </Suspense>
              </TabsContent>

              <TabsContent value="assumptions" className="mt-3">
                <Suspense fallback={<TabFallback />}>
                  <AssumptionsTabPanel />
                </Suspense>
              </TabsContent>

              <TabsContent value="intelligence" className="mt-3">
                <Suspense fallback={<TabFallback />}>
                  <AiInsightsPanel
                    output={output}
                    selectedCandidate={selectedCandidate}
                    fmt={fmt}
                  />
                </Suspense>
              </TabsContent>
            </Tabs>
          ) : null}

          {/* Mobile pinned metrics — shown only on mobile/tablet, above tabs */}
          {output && selectedCandidate && (
            <MobilePinnedMetrics
              candidate={selectedCandidate}
              fmt={fmt}
            />
          )}
        </main>

        {/* RIGHT — Risk Rail (xl+ only; drawer on smaller) */}
        <RiskIntelligenceRail
          output={output}
          selectedCandidate={selectedCandidate}
          fmt={fmt}
        />
      </div>

      {/* ── Mobile Control Tower drawer ───────────────────────────────────── */}
      {mobileControlsOpen && (
        <MobileDrawer onClose={() => setMobileControlsOpen(false)} title="Controls">
          <ControlTower {...controlTowerProps} />
        </MobileDrawer>
      )}

      {/* ── Mobile Risk Rail drawer ───────────────────────────────────────── */}
      {mobileRiskOpen && output && (
        <MobileDrawer onClose={() => setMobileRiskOpen(false)} title="Risk & Intelligence">
          <RiskIntelligenceRail
            output={output}
            selectedCandidate={selectedCandidate}
            fmt={fmt}
          />
        </MobileDrawer>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function EmptyState({
  hasInputs, running, onRun, canRun,
}: {
  hasInputs: boolean; running: boolean; onRun: () => void; canRun: boolean;
}) {
  return (
    <div className="border border-dashed border-border rounded-md bg-card/50 p-8 text-center space-y-3">
      <h3 className={PANEL_HEADING_CLS}>Financial analysis workspace</h3>
      <p className={cn(MICRO_CLS, "max-w-md mx-auto")}>
        Configure the analysis in the Control Tower (left) and run to populate
        the workspace. Comparison table, overlay, tree view, risk rail and
        execution plan all activate once an analysis is generated.
      </p>
      {hasInputs ? (
        <Button onClick={onRun} disabled={!canRun || running} className="h-9 text-xs">
          {running ? "Running…" : "Run analysis"}
        </Button>
      ) : (
        <p className="text-[11px] text-rose-700 dark:text-rose-300">
          Add income, expenses and accounts in the dashboard first.
        </p>
      )}
    </div>
  );
}

function TabFallback() {
  return (
    <div className={cn(MICRO_CLS, "py-8 text-center")}>
      Loading panel…
    </div>
  );
}

function MobilePinnedMetrics({
  candidate, fmt,
}: {
  candidate: RankedCandidate;
  fmt: AdvancedWorkspaceProps["fmt"];
}) {
  const r = candidate.result;
  const p50 = r.terminalNwSorted[Math.floor(r.terminalNwSorted.length * 0.5)] ?? 0;
  const survival = 1 - r.defaultProbability;
  return (
    <div className="lg:hidden border border-border rounded-md bg-card/95 dark:bg-card/70 px-3 py-2 sticky top-2 z-20 shadow-sm">
      <div className="flex items-center gap-3 text-[11px] overflow-x-auto">
        <Pin label="Score" value={candidate.score.score.toFixed(0)} />
        <Pin label="P50 NW" value={fmt.fmt$M(p50)} />
        <Pin label="Survival" value={fmt.pct(survival, 1)} />
        <Pin label="Max DD" value={fmt.pct(r.riskMetrics.maxDrawdownMedian, 1)} />
        <Pin label="VaR₉₅" value={fmt.fmt$M(r.riskMetrics.varDollars95)} />
      </div>
    </div>
  );
}

function Pin({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-start shrink-0 pr-3 border-r border-border/60 last:border-r-0">
      <span className={LABEL_CLS}>{label}</span>
      <span className={cn("text-xs font-semibold", NUM_CLS)}>{value}</span>
    </div>
  );
}

function MobileDrawer({
  onClose, title, children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-background border-l border-border shadow-xl overflow-y-auto p-3">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
          <h3 className={PANEL_HEADING_CLS}>{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {/* The aside has hidden lg:flex by default — force visible inside drawer. */}
        <div className="[&>aside]:!flex [&>aside]:!sticky-none [&>aside]:!max-h-none [&>aside]:!overflow-visible">
          {children}
        </div>
      </div>
    </div>
  );
}

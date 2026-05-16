/**
 * decision.tsx — Family Wealth Lab V3 Unified Decision Engine
 *
 * One page replaces three (Scenario Lab + What-If Scenarios + Scenario Compare).
 * Two tabs sharing the SAME engine, assumptions, MC paths, narrative, PDF:
 *
 *   1. Quick Decision  — auto-generates 15-25 financially realistic paths from
 *      capital + timing, runs them through Behavioural / Safety / Scoring,
 *      ranks them, and explains why winner won + what could invalidate it.
 *
 *   2. Advanced Builder — the legacy event-timeline UX from scenario-compare-v2,
 *      retained for power-users who want to author their own scenario deltas.
 *
 * All standing rules respected:
 *   • Real Supabase ledger only — no demo fallback
 *   • Deterministic financial math; AI only narrates, never computes
 *   • DSR banded; LVR 0.85 hard ceiling; dynamic liquidity floor
 *   • privacyMode, dark mode, mobile-first, a11y all preserved
 */

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/finance";
import { useAppStore } from "@/lib/store";
import { maskValue } from "@/components/PrivacyMask";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SmartNumInput } from "@/components/ui/smart-num-input";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { HelpLink, HELP_TOPICS } from "@/components/help";
import { PlainMetric } from "@/components/decisionEngine/PlainMetric";
import { AdvancedAnalysisSection } from "@/components/decisionEngine/AdvancedAnalysisSection";
import { IntelligenceSection } from "@/components/decisionEngine/intelligence/IntelligenceSection";
import { METRIC_LABELS, LENS_LABELS, RISK_MODE_LABELS } from "@/lib/decisionEngineLabels";
import {
  Sparkles, Play, Award, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp,
  Trophy, Shield, Droplet, TrendingDown, Target, Info, Eye, EyeOff, ShieldAlert,
  Beaker, ListChecks, XCircle, Activity, SlidersHorizontal, FileDown,
  Gauge, Flame, Clock, Wrench, Lightbulb, Crown, Coins, Heart, Layers,
} from "lucide-react";

import type { DashboardInputs } from "@/lib/dashboardDataContract";
import {
  selectMonthlyIncome, selectMonthlyExpensesLedger, selectMonthlySurplus, selectCashToday,
} from "@/lib/dashboardDataContract";
import {
  generateQuickDecisionCandidates,
  getQuestionPreset,
  listQuestionPresets,
  QUESTION_PRESETS,
  RISK_MODE_DEFAULTS,
  resolveRiskControls,
  type QuickDecisionOutput,
  type RankedCandidate,
  type DiscardedCandidate,
  type QuickDecisionQuestionKind,
  type RiskControlMode,
  type RiskControlOverrides,
} from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import {
  listInvestorProfiles,
  PROFILE_REGISTRY,
  DEFAULT_PRIORITIES,
  type InvestorProfile,
  type BehaviouralPriorities,
} from "@/lib/scenarioV2/registry";
import { BehaviouralPrioritiesPanel } from "@/components/decisionEngine/BehaviouralPrioritiesPanel";
import { QuestionFramework } from "@/components/decisionEngine/QuestionFramework";
import {
  AdvancedAssumptionCapture,
  DEFAULT_ADVANCED_ASSUMPTIONS,
  type AdvancedAssumptions,
} from "@/components/decisionEngine/AdvancedAssumptionCapture";
import { RiskFieldExplainer } from "@/components/decisionEngine/RiskFieldExplainer";
import { generateQuickDecisionPdf } from "@/lib/scenarioV2/quickDecisionPdf";
import {
  FanChart,
  DistributionHistogram,
  TailRiskCard,
} from "@/components/decisionEngine/RiskVisualizations";
import {
  ScoreWaterfall,
  WinnerVsRunnerUp,
  InvalidationEngine,
} from "@/components/decisionEngine/ScoreVisualizations";
import {
  ExecutionPlanTimeline,
  ConditionalRecsList,
} from "@/components/decisionEngine/RecommendationLayer";
import { StrategyCard } from "@/components/decisionEngine/StrategyCard";
import {
  NarrativeReport,
  NarrativeModeToggle,
} from "@/components/decisionEngine/NarrativeReport";
import type { NarrativeMode } from "@/lib/scenarioV2/decisionEngine/narrativeLayer";

// Embedded power-user tab — re-uses every line of premium Scenario Lab UX.
import ScenarioCompareV2Page from "./scenario-compare-v2";
import AssumptionsPanel from "@/components/AssumptionsPanel";

// ─── Formatting helpers (mask-aware) ─────────────────────────────────────────

const pctRaw = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;
const fmt$Raw = (n: number) => formatCurrency(Math.round(n));
const fmt$kRaw = (n: number) => `$${(Math.round(n) / 1000).toFixed(0)}k`;
const fmt$MRaw = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : `$${(Math.round(n / 1000))}k`;

function useMaskFmt(hidden: boolean) {
  return useMemo(() => ({
    pct: (n: number, d = 1) => maskValue(pctRaw(n, d), hidden, "pct"),
    fmt$: (n: number) => maskValue(fmt$Raw(n), hidden, "currency"),
    fmt$k: (n: number) => maskValue(fmt$kRaw(n), hidden, "currency"),
    fmt$M: (n: number) => maskValue(fmt$MRaw(n), hidden, "currency"),
    sentence: (s: string) => hidden
      ? s.replace(/\$[\d,.\-]+[kKmM]?/g, "$••••••").replace(/[\d,.]+%/g, "•••%")
      : s,
  }), [hidden]);
}

// ─── Question kind metadata ──────────────────────────────────────────────────

// Question pill metadata. Labels + descriptions are sourced from the engine's
// QUESTION_PRESETS registry so a question added to the engine flows through to UI.
const QUESTION_OPTIONS: { value: QuickDecisionQuestionKind; label: string; sub: string }[] =
  listQuestionPresets().map(p => ({
    value: p.kind,
    label: p.label,
    sub: p.description,
  }));

const DEFAULT_QUESTION: QuickDecisionQuestionKind = "deploy_capital";
const DEFAULT_PRESET = QUESTION_PRESETS[DEFAULT_QUESTION];

// ─── Quick Decision Tab ──────────────────────────────────────────────────────

function QuickDecisionTab() {
  // ── Live ledger ────────────────────────────────────────────────────────────
  const { data: snapshot } = useQuery<any>({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot").then(r => r.json()),
  });
  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ["/api/properties"],
    queryFn: () => apiRequest("GET", "/api/properties").then(r => r.json()),
  });
  const { data: stocks = [] } = useQuery<any[]>({
    queryKey: ["/api/stocks"],
    queryFn: () => apiRequest("GET", "/api/stocks").then(r => r.json()),
  });
  const { data: cryptos = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto"],
    queryFn: () => apiRequest("GET", "/api/crypto").then(r => r.json()),
  });
  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ["/api/expenses"],
    queryFn: () => apiRequest("GET", "/api/expenses").then(r => r.json()),
  });
  const { data: incomeRecords = [] } = useQuery<any[]>({
    queryKey: ["/api/income"],
    queryFn: () => apiRequest("GET", "/api/income").then(r => r.json()),
  });
  const { data: holdingsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/holdings"],
    queryFn: () => apiRequest("GET", "/api/holdings").then(r => r.json()),
  });

  const dashboardInputs: DashboardInputs | null = useMemo(() => {
    if (!snapshot) return null;
    return { snapshot, properties, stocks, cryptos, holdingsRaw, incomeRecords, expenses };
  }, [snapshot, properties, stocks, cryptos, holdingsRaw, incomeRecords, expenses]);

  const liveReadouts = useMemo(() => {
    if (!dashboardInputs) return null;
    return {
      income:   selectMonthlyIncome(dashboardInputs),
      expenses: selectMonthlyExpensesLedger(dashboardInputs),
      surplus:  selectMonthlySurplus(dashboardInputs),
      cash:     selectCashToday(dashboardInputs),
    };
  }, [dashboardInputs]);

  // ── Privacy mode ───────────────────────────────────────────────────────────
  const { privacyMode, togglePrivacy } = useAppStore();
  const { fmt$, fmt$k, fmt$M, pct, sentence } = useMaskFmt(privacyMode);

  // ── User question input ────────────────────────────────────────────────────
  const [question, setQuestion] = useState<QuickDecisionQuestionKind>(DEFAULT_QUESTION);
  const [capital, setCapital] = useState<number>(DEFAULT_PRESET.defaults.capital);
  const [horizonYears, setHorizonYears] = useState<number>(DEFAULT_PRESET.defaults.horizonYears);
  const [dependants, setDependants] = useState<number>(DEFAULT_PRESET.defaults.dependants);
  const [incomeVolatility, setIncomeVolatility] = useState<number>(DEFAULT_PRESET.defaults.incomeVolatility);
  const [investorProfile, setInvestorProfile] = useState<InvestorProfile>(DEFAULT_PRESET.defaults.investorProfile);
  const [hasHelpDebt, setHasHelpDebt] = useState<boolean>(false);
  const [hasPrivateHospitalCover, setHasPrivateHospitalCover] = useState<boolean>(true);
  // Audit P1-6: on mobile (< md) the seven secondary inputs collapse into a
  // disclosure so the question selector and the Run button are visible above
  // the fold. md:+ ignores this state (the contents render unconditionally).
  const [mobileInputsOpen, setMobileInputsOpen] = useState<boolean>(false);

  // ── Phase 2.8: Risk Control Mode ──────────────────────────────────────────
  const [riskMode, setRiskMode] = useState<RiskControlMode>("balanced");
  const [customControls, setCustomControls] = useState<Partial<RiskControlOverrides>>({});
  const [expandedDiscardId, setExpandedDiscardId] = useState<string | null>(null);
  const [showRiskControls, setShowRiskControls] = useState(false);

  // ── V3: Behavioural priorities (11-slider overlay) ────────────────────────
  // Defaults are all 5 (neutral). The engine treats this as a no-op so
  // existing users see no behaviour change unless they configure priorities.
  const [priorities, setPriorities] = useState<BehaviouralPriorities>({ ...DEFAULT_PRIORITIES });

  // ── V3: Advanced assumption capture (household / income / debt / property
  // / investing context). Client-side only — engine reads `dependants` and
  // `incomeVolatility` directly; the rest informs narrative tone and PDF.
  const [advancedAssumptions, setAdvancedAssumptions] =
    useState<AdvancedAssumptions>(DEFAULT_ADVANCED_ASSUMPTIONS);

  // ── Output state ───────────────────────────────────────────────────────────
  const [output, setOutput] = useState<QuickDecisionOutput | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [showDiscarded, setShowDiscarded] = useState(false);

  // ── Narrative-layer v1: reading mode (Simple / Advisor / Quant) ──────────
  // Simple is the default — the page should be readable by a non-finance user
  // out of the box. Advisor adds comparative reasoning; Quant exposes the full
  // Monte-Carlo / tail-risk surface (which is otherwise tucked behind the
  // AdvancedAnalysisSection progressive disclosure).
  const [narrativeMode, setNarrativeMode] = useState<NarrativeMode>("simple");

  // ── Question-switching reset (Session 6 bug fix) ──────────────────────────
  //
  // When the user picks a different preset card, we MUST:
  //   1. clear stale output (candidates from the old preset)
  //   2. clear stale errors/loading/expansion/discarded panel state
  //   3. load THIS preset's realistic defaults for capital/horizon/etc.
  //   4. load THIS preset's default investor profile (scoring weights)
  //
  // Without this effect, the "Generate paths" button feels broken after a switch
  // because filter results from the wrong context persist.
  useEffect(() => {
    const preset = getQuestionPreset(question);
    setOutput(null);
    setError(null);
    setExpandedCandidateId(null);
    setShowDiscarded(false);
    setCapital(preset.defaults.capital);
    setHorizonYears(preset.defaults.horizonYears);
    setDependants(preset.defaults.dependants);
    setIncomeVolatility(preset.defaults.incomeVolatility);
    setInvestorProfile(preset.defaults.investorProfile);
  }, [question]);

  // When the user manually changes the investor profile, invalidate the cached
  // output so the score axes shown match the currently-selected weights.
  useEffect(() => {
    setOutput(null);
    setExpandedCandidateId(null);
  }, [investorProfile]);

  // Phase 2.8 — changing risk mode invalidates the output (different filter set).
  useEffect(() => {
    setOutput(null);
    setExpandedCandidateId(null);
    setExpandedDiscardId(null);
  }, [riskMode]);

  // V3 — changing behavioural priorities re-shapes the scoring weights, so
  // the cached output is no longer comparable. Invalidate to force a re-run.
  useEffect(() => {
    setOutput(null);
    setExpandedCandidateId(null);
  }, [priorities]);

  // ── Run-button validity ────────────────────────────────────────────────────
  // Button is disabled ONLY when inputs are invalid or a run is in flight.
  // Anything that resets state above also restores validity, so the button can
  // never silently get stuck disabled after a question switch.
  const canRun = useMemo(
    () =>
      Boolean(dashboardInputs) &&
      capital > 0 &&
      horizonYears >= 5 &&
      horizonYears <= 30 &&
      dependants >= 0 &&
      dependants <= 6 &&
      incomeVolatility >= 0 &&
      incomeVolatility <= 0.5,
    [dashboardInputs, capital, horizonYears, dependants, incomeVolatility],
  );

  // ── Run ────────────────────────────────────────────────────────────────────
  async function run() {
    if (!dashboardInputs) {
      setError("Loading live ledger — please wait for snapshot to load.");
      return;
    }
    setRunning(true);
    setError(null);
    setOutput(null);
    setExpandedCandidateId(null);
    try {
      const annualGrossIncome = (liveReadouts?.income ?? 0) * 12;
      // V3 — prefer values from the Advanced Assumption Capture panel when the
      // user has touched them. Fall back to the inline secondary inputs.
      const effectiveDependants = advancedAssumptions.household.dependants !== 0
        ? advancedAssumptions.household.dependants
        : dependants;
      const effectiveIncomeVol = advancedAssumptions.income.expectedIncomeVolatility !== 0.15
        ? advancedAssumptions.income.expectedIncomeVolatility
        : incomeVolatility;
      const out = await generateQuickDecisionCandidates({
        dashboardInputs,
        question: { kind: question, capital },
        horizonYears,
        household: { dependants: effectiveDependants, incomeVolatility: effectiveIncomeVol },
        investorProfile,
        simulationCount: 300,    // good balance of speed + signal for UX
        taxContext: {
          annualGrossIncome,
          hasHelpDebt,
          hasPrivateHospitalCover,
        },
        riskMode,
        riskControls: riskMode === "custom" ? customControls : undefined,
        behaviouralPriorities: priorities,
      });
      setOutput(out);
      if (out.ranked.length > 0) setExpandedCandidateId(out.ranked[0].id);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setRunning(false);
    }
  }

  // ── PDF export (Phase 2.7) ─────────────────────────────────────────────────
  async function handleDownloadPdf() {
    if (!output) return;
    setPdfBusy(true);
    try {
      const profileSpec = PROFILE_REGISTRY[output.investorProfile];
      const doc = await generateQuickDecisionPdf({
        householdName: "Family Wealth Lab",
        output,
        profile: profileSpec,
        generatedAt: new Date().toISOString(),
        hideValues: privacyMode,
      });
      const ts = new Date().toISOString().slice(0, 10);
      doc.save(`quick-decision-${output.question}-${ts}.pdf`);
    } catch (err: any) {
      setError(`PDF export failed: ${err?.message ?? String(err)}`);
    } finally {
      setPdfBusy(false);
    }
  }

  const ranked = output?.ranked ?? [];
  const discarded = output?.discarded ?? [];
  const highRiskPaths = output?.highRiskPaths ?? [];
  const winner = ranked[0];
  const runnerUp = ranked[1];

  return (
    <div className="space-y-6">
      {/* ── Question + input panel ──────────────────────────────────────── */}
      <Card className="border-indigo-200 dark:border-indigo-900 bg-gradient-to-br from-indigo-50/40 to-violet-50/40 dark:from-indigo-950/20 dark:to-violet-950/20">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Sparkles className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                Quick Decision
                <HelpLink topic={HELP_TOPICS.recommendationLogic} variant="icon" ariaLabel="How recommendations are ranked" />
              </CardTitle>
              <CardDescription>
                Pick a question, set your capital and horizon — the engine ranks 15+ paths
                using deterministic math (no AI in the calculations).
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePrivacy}
              aria-label={privacyMode ? "Show values" : "Hide values"}
              title={privacyMode ? "Show values" : "Hide values"}
            >
              {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {/* V3 — Grouped strategic-question framework. Replaces the flat
              pill grid with category-grouped sections so the 30+ questions
              fit on mobile without burying the Run button. */}
          <QuestionFramework value={question} onChange={setQuestion} />

          {/* Mobile-only collapsible trigger (audit P1-6). Hidden on md+. */}
          <div className="md:hidden">
            <Collapsible open={mobileInputsOpen} onOpenChange={setMobileInputsOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between h-11"
                  aria-expanded={mobileInputsOpen}
                >
                  <span className="text-xs font-semibold">Inputs &amp; assumptions</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${mobileInputsOpen ? "rotate-180" : ""}`} />
                </Button>
              </CollapsibleTrigger>
              {/* The actual content lives in the shared block below; this
                  trigger only toggles the local state, and the wrapping
                  div uses `data-state` styling to hide on mobile when closed. */}
            </Collapsible>
          </div>

          {/* Inputs block — always rendered on md+, collapsible on mobile.
              `md:!block` forces visibility on tablet/desktop regardless of
              the mobile collapsible state. */}
          <div
            className={`${mobileInputsOpen ? "block" : "hidden"} md:block space-y-5`}
            data-testid="decision-inputs-block"
          >
          {/* Inputs grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                Capital available (AUD)
              </Label>
              {/* iOS-safe SmartNumInput: tap-to-clear-zero + select-on-focus.
                  Replaces plain <Input type=number> which appended digits on iOS. */}
              <SmartNumInput
                value={capital}
                min={0}
                step={1000}
                prefix="$"
                onChange={(n) => setCapital(Math.max(0, n))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Horizon (years)</Label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[horizonYears]} min={5} max={30} step={1}
                  onValueChange={([v]) => setHorizonYears(v)}
                />
                <span className="text-xs tabular-nums w-8 text-right font-semibold">{horizonYears}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Dependants</Label>
              <SmartNumInput
                value={dependants}
                min={0}
                max={6}
                step={1}
                onChange={(n) => setDependants(Math.max(0, Math.min(6, Math.round(n))))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Income volatility</Label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[Math.round(incomeVolatility * 100)]} min={0} max={50} step={5}
                  onValueChange={([v]) => setIncomeVolatility(v / 100)}
                />
                <span className="text-xs tabular-nums w-10 text-right font-semibold">
                  {Math.round(incomeVolatility * 100)}%
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={hasHelpDebt}
                onChange={(e) => setHasHelpDebt(e.target.checked)}
                className="rounded border-border"
              />
              <span>HELP/HECS debt (raises effective marginal tax)</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={hasPrivateHospitalCover}
                onChange={(e) => setHasPrivateHospitalCover(e.target.checked)}
                className="rounded border-border"
              />
              <span>Private hospital cover (avoids Medicare Levy Surcharge)</span>
            </label>
          </div>

          {/* Investor profile selector (Phase 2.1) — plain-English heading */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <SlidersHorizontal className="h-3.5 w-3.5 text-[hsl(var(--intelligence))]" />
              <Label className="text-xs font-medium">What kind of investor are you?</Label>
              <HelpLink topic={HELP_TOPICS.recommendationLogic} variant="icon" ariaLabel="How investor profile changes ranking" />
            </div>
            <p className="text-[11px] text-foreground/70 leading-snug">
              Picks which trade-offs the ranking favours. The math doesn’t change — just which path bubbles to the top.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" data-testid="investor-profile-grid">
              {listInvestorProfiles().map(p => (
                <button
                  key={p.id}
                  onClick={() => setInvestorProfile(p.id)}
                  data-testid={`investor-profile-${p.id}`}
                  className={
                    investorProfile === p.id
                      ? // Selected — semantic tokens, high-contrast in both modes
                        "de-selectable-card selected text-left rounded-lg p-2 transition-all min-h-[64px]"
                      : "de-selectable-card text-left rounded-lg border border-border bg-card p-2 transition-all min-h-[64px] hover:bg-muted/50"
                  }
                  aria-pressed={investorProfile === p.id}
                  title={p.description}
                >
                  <div className="text-[11px] font-semibold text-foreground truncate">{p.label}</div>
                  <div className="text-[10px] text-foreground/70 mt-0.5 leading-snug line-clamp-2">
                    {p.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Risk control mode — 4 plain-English presets with obvious selected state
              and "what changes" subtitle for each option. Engine logic untouched. */}
          <RiskControlsPanel
            mode={riskMode}
            onModeChange={setRiskMode}
            customControls={customControls}
            onCustomControlsChange={setCustomControls}
            expanded={showRiskControls}
            onToggleExpanded={() => setShowRiskControls((v) => !v)}
          />

          {/* V3 — Investor behaviour & priorities. Collapsed by default so it
              does not crowd the mobile flow; expanding reveals 11 sliders
              that re-weight the composite score deterministically. */}
          <BehaviouralPrioritiesPanel value={priorities} onChange={setPriorities} />

          {/* V3 — Advanced assumption capture (household / income / debt /
              property / investing). Optional, collapsible. The engine reads
              dependants + income volatility directly; the rest informs
              narrative tone and PDF context. */}
          <AdvancedAssumptionCapture value={advancedAssumptions} onChange={setAdvancedAssumptions} />
          </div>{/* /Mobile collapsible inputs block (audit P1-6) */}

          {liveReadouts && (
            <div className="rounded-lg border border-border bg-card/50 p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <ReadoutTile label="Monthly income"    value={fmt$(liveReadouts.income)}   />
              <ReadoutTile label="Monthly expenses"  value={fmt$(liveReadouts.expenses)} />
              <ReadoutTile label="Monthly surplus"   value={fmt$(liveReadouts.surplus)}  />
              <ReadoutTile label="Cash on hand"      value={fmt$(liveReadouts.cash)}     />
            </div>
          )}

          {/* Run row — sticky on mobile so the CTA is always reachable
              when results scroll off the bottom (audit P1-6). */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 sticky bottom-2 md:static md:bottom-auto md:bg-transparent bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/70 border-t md:border-0 border-border -mx-4 px-4 py-3 md:m-0 md:p-0 z-10">
            <div className="text-[11px] text-muted-foreground hidden md:flex items-center gap-1">
              <span>500-path</span>
              <span className="inline-flex items-center gap-0.5">
                Monte Carlo<InfoTooltip term="Monte Carlo" size={11} />
              </span>
              <span>per candidate · banded</span>
              <span className="inline-flex items-center gap-0.5">DSR<InfoTooltip term="DSR" size={11} /></span>
              <span>·</span>
              <span className="inline-flex items-center gap-0.5">LVR<InfoTooltip term="LVR" size={11} /></span>
              <span>0.85 ceiling · dynamic liquidity floor</span>
            </div>
            <Button
              onClick={run}
              disabled={running || !canRun}
              className="min-w-[160px] h-11 md:h-10 w-full md:w-auto"
            >
              {running ? (
                <><Activity className="h-4 w-4 mr-2 animate-pulse" /> Running…</>
              ) : (
                <><Play className="h-4 w-4 mr-2" /> Generate paths</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Could not run engine</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ── Winner card ──────────────────────────────────────────────────── */}
      {winner && (
        <Card className="de-result-card" data-testid="decision-result-card">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Trophy className="h-5 w-5 text-[hsl(var(--success-light))]" />
                  <Badge
                    variant="default"
                    className="bg-[hsl(var(--success))] text-[hsl(var(--background))] hover:bg-[hsl(var(--success))]/90"
                  >
                    Recommended path
                  </Badge>
                </div>
                <CardTitle className="text-base sm:text-xl text-foreground">{winner.label}</CardTitle>
                <CardDescription className="text-xs text-foreground/75">{sentence(winner.headline)}</CardDescription>
                {output && (
                  <div className="flex items-center gap-1.5 pt-1">
                    <SlidersHorizontal className="h-3 w-3 text-[hsl(var(--intelligence-light))]" />
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-[hsl(var(--intelligence-light))]">
                      Ranked under: {output.investorProfile.replace(/_/g, " ")}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className="text-right">
                  <div className="text-2xl sm:text-3xl font-bold tabular-nums text-[hsl(var(--success-light))]">
                    {winner.score.score.toFixed(0)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-foreground/60">/100</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5 bg-card text-foreground border-[hsl(var(--success)/0.4)] hover:bg-[hsl(var(--success)/0.12)] hover:text-foreground"
                  onClick={handleDownloadPdf}
                  disabled={pdfBusy}
                  data-testid="button-download-decision-pdf"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  {pdfBusy ? "Generating…" : "Download report"}
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <PlainMetric
                icon={<Shield className="h-3 w-3" />}
                label={METRIC_LABELS.survivalProbability}
                value={pct(winner.trace.scoreDerivation.find(s => s.axis === "survivalProbability")?.rawValue ?? 0, 0)}
                tone="emerald"
                infoTerm="Survival probability"
                helpTopic={HELP_TOPICS.survivalProbability}
              />
              <PlainMetric
                icon={<Droplet className="h-3 w-3" />}
                label={METRIC_LABELS.liquidityFactor}
                value={(winner.trace.scoreDerivation.find(s => s.axis === "liquidityFactor")?.rawValue ?? 0).toFixed(2)}
                tone="sky"
                infoTerm="Liquidity factor"
                helpTopic={HELP_TOPICS.liquidityFactor}
              />
              <PlainMetric
                icon={<TrendingDown className="h-3 w-3" />}
                label={METRIC_LABELS.riskAdjustedReturn}
                value={pct(winner.trace.scoreDerivation.find(s => s.axis === "riskAdjustedReturn")?.rawValue ?? 0, 1)}
                tone="indigo"
                infoTerm="Risk-adjusted return"
                helpTopic={HELP_TOPICS.riskAdjustedCagr}
              />
              <PlainMetric
                icon={<Target className="h-3 w-3" />}
                label={METRIC_LABELS.terminalNetWorth}
                value={fmt$M(winner.trace.scoreDerivation.find(s => s.axis === "terminalNetWorth")?.rawValue ?? 0)}
                tone="amber"
                infoTerm="P50"
                helpTopic={HELP_TOPICS.terminalNetWorth}
              />
            </div>

            {/* ── Narrative layer v1 ──────────────────────────────────────
                Mode toggle + deterministic plain-English narrative built from
                engine outputs. The mandatory section order is enforced inside
                NarrativeReport: executive summary → what should I do → why →
                main risks → what if ignored → step-by-step action plan. */}
            {output && (
              <div className="space-y-3" data-testid="narrative-block">
                <NarrativeModeToggle value={narrativeMode} onChange={setNarrativeMode} />
                <NarrativeReport output={output} mode={narrativeMode} />
              </div>
            )}

            {/* ── Financial Intelligence Layer V1 ─────────────────────────
                Deterministic interpretive overlay sitting on top of the
                Decision Engine narrative. Adds turning-point detection,
                fragility scanning, assumption dependency ranking, regime
                awareness, behavioural survivability, path-robustness
                scoring, recommendation drift, and an explainability memo.
                Engine math untouched. */}
            {output && (
              <IntelligenceSection output={output} prior={null} />
            )}

            {/* Legacy "why-won / what-could-invalidate" block — Quant mode only,
                since Simple/Advisor narratives already cover this. Kept so quant
                users still see the engine's raw rationale strings verbatim. */}
            {output && narrativeMode === "quant" && (
              <div className="de-result-narrative rounded-lg p-3 space-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide font-semibold text-[hsl(var(--success-light))] mb-1">
                    Why this won
                  </div>
                  <ul className="space-y-1 text-xs">
                    {output.comparativeNarrative.whyWon.map((line, i) => (
                      <li key={i} className="flex items-start gap-2 text-foreground/90">
                        <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success-light))] mt-0.5 shrink-0" />
                        <span>{sentence(line)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {output.comparativeNarrative.whatCouldInvalidate.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide font-semibold text-[hsl(var(--warning-light))] mb-1">
                      What could invalidate this
                    </div>
                    <ul className="space-y-1 text-xs">
                      {output.comparativeNarrative.whatCouldInvalidate.map((line, i) => (
                        <li key={i} className="flex items-start gap-2 text-foreground/90">
                          <AlertTriangle className="h-3 w-3 text-[hsl(var(--warning-light))] mt-0.5 shrink-0" />
                          <span>{sentence(line)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {output.comparativeNarrative.secondPlaceAndWhy && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide font-semibold text-foreground/70 mb-1">
                      Runner-up
                    </div>
                    <p className="text-xs text-foreground/80 leading-relaxed">
                      {sentence(output.comparativeNarrative.secondPlaceAndWhy)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Wealth-path fan chart stays visible by default — it's the
                most intuitive view ("where could my wealth go?"). */}
            <div className="rounded-lg bg-card/70 dark:bg-card/50 border border-border p-3 sm:p-4">
              <FanChart
                fan={winner.result.netWorthFan}
                fmt={{ fmt$, fmt$k, fmt$M, pct, sentence }}
                initialNetWorth={winner.result.initialNetWorth}
                hidden={privacyMode}
              />
            </div>

            {/* Everything else — quant-grade charts and bad-tail analysis —
                tucked into progressive disclosure so beginners don't drown.
                In Quant mode it auto-opens (key remounts) so Monte Carlo,
                VaR/CVaR, distribution histogram and waterfall are all visible. */}
            <AdvancedAnalysisSection
              key={`adv-${narrativeMode}`}
              title="Advanced analysis"
              hint={narrativeMode === "quant"
                ? "Monte Carlo, VaR/CVaR, distribution, score waterfall"
                : "Tail risk, score breakdown, runner-up comparison"}
              helpTopic={HELP_TOPICS.chartGuides}
              defaultOpen={narrativeMode === "quant"}
              dataTestid="winner-advanced-analysis"
            >
              <div className="rounded-lg bg-card/70 dark:bg-card/50 border border-border p-3">
                <TailRiskCard
                  result={winner.result}
                  fmt={{ fmt$, fmt$k, fmt$M, pct, sentence }}
                />
              </div>
              <div className="rounded-lg bg-card/70 dark:bg-card/50 border border-border p-3">
                <DistributionHistogram
                  terminalNwSorted={winner.result.terminalNwSorted}
                  initialNetWorth={winner.result.initialNetWorth}
                  varDollars95={winner.result.riskMetrics.varDollars95}
                  cvarDollars95={winner.result.riskMetrics.cvarDollars95}
                  fmt={{ fmt$, fmt$k, fmt$M, pct, sentence }}
                  hidden={privacyMode}
                />
              </div>
              <div className="rounded-lg bg-card/70 dark:bg-card/50 border border-border p-3">
                <ScoreWaterfall candidate={winner} fmt={{ fmt$, fmt$k, fmt$M, pct, sentence }} />
              </div>
              {output && output.ranked.length >= 2 && (
                <div className="rounded-lg bg-card/70 dark:bg-card/50 border border-border p-3">
                  <WinnerVsRunnerUp output={output} fmt={{ fmt$, fmt$k, fmt$M, pct, sentence }} />
                </div>
              )}
            </AdvancedAnalysisSection>

            {/* Phase 2.3: Invalidation engine */}
            {output && (
              <div className="rounded-lg bg-card/70 dark:bg-card/50 border border-border p-3">
                <InvalidationEngine output={output} fmt={{ fmt$, fmt$k, fmt$M, pct, sentence }} />
              </div>
            )}

            {/* Phase 2.4: Phased execution plan */}
            {output && output.executionPlan.length > 0 && (
              <div className="rounded-lg bg-card/70 dark:bg-card/50 border border-border p-3">
                <ExecutionPlanTimeline
                  phases={output.executionPlan}
                  fmt={{ fmt$, fmt$k, fmt$M, pct, sentence }}
                />
              </div>
            )}

            {/* Phase 2.4: Conditional / event-driven recommendations */}
            {output && output.conditionalRecommendations.length > 0 && (
              <div className="rounded-lg bg-card/70 dark:bg-card/50 border border-border p-3">
                <ConditionalRecsList
                  recommendations={output.conditionalRecommendations}
                  fmt={{ fmt$, fmt$k, fmt$M, pct, sentence }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Ranked list ──────────────────────────────────────────────────── */}
      {ranked.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-5 w-5" />
              All ranked paths ({ranked.length})
              <HelpLink topic={HELP_TOPICS.rankingWeights} variant="icon" ariaLabel="How paths are ranked" />
            </CardTitle>
            <CardDescription>
              Each path is an investment-committee–style explanation with trade-offs, baseline delta, stress, and a deep-dive sheet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ranked.map((c, idx) => (
              <StrategyCard
                key={c.id}
                rank={idx + 1}
                candidate={c}
                baseline={output!.baseScenarioResult}
                fmt={{ fmt$, fmt$k, fmt$M, pct, sentence }}
                privacyMode={privacyMode}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Phase 2.8: Multi-winner lenses ──────────────────────────────── */}
      {output && <MultiWinnerPanel output={output} />}

      {/* ── Phase 2.8: High-risk-but-possible paths ─────────────────────── */}
      {highRiskPaths.length > 0 && output && (
        <HighRiskPathsPanel
          paths={highRiskPaths}
          fmt={{ fmt$, fmt$k, fmt$M, pct, sentence }}
          riskMode={output.riskControlsApplied.mode}
        />
      )}

      {/* ── Discarded paths (collapsed by default) ───────────────────────── */}
      {discarded.length > 0 && (
        <Card>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setShowDiscarded(s => !s)}
          >
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldAlert className="h-5 w-5 text-rose-500" />
                  Filtered out ({discarded.length})
                </CardTitle>
                <CardDescription>
                  Paths blocked by behavioural-realism or safety-ceiling filters.
                </CardDescription>
              </div>
              {showDiscarded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardHeader>
          {showDiscarded && (
            <CardContent>
              <div className="space-y-2">
                {discarded.map((d) => (
                  <WhyFilteredPanel
                    key={d.id}
                    discard={d}
                    expanded={expandedDiscardId === d.id}
                    onToggle={() => setExpandedDiscardId(expandedDiscardId === d.id ? null : d.id)}
                    fmt={{ fmt$, fmt$k, fmt$M, pct, sentence }}
                  />
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Empty state */}
      {!output && !running && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Ready to generate paths</AlertTitle>
          <AlertDescription>
            Pick a question and tap “Generate paths”. The engine produces 15–25 realistic
            paths, filters out behaviourally-unrealistic ones (e.g. zero-cash plans,
            crypto over 10% of portfolio), then runs a 300-path Monte Carlo per remaining
            candidate. Final ranking weights survival (35%), liquidity (25%), risk-adjusted
            return (20%), FIRE acceleration (12%) and terminal net worth (8%).
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

// Phase 2.8 — Risk Control Mode panel
function RiskControlsPanel({
  mode, onModeChange, customControls, onCustomControlsChange, expanded, onToggleExpanded,
}: {
  mode: RiskControlMode;
  onModeChange: (m: RiskControlMode) => void;
  customControls: Partial<RiskControlOverrides>;
  onCustomControlsChange: (c: Partial<RiskControlOverrides>) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  // Plain-English risk-mode labels with "what changes" copy sourced from
  // the central labels module. Engine receives identical mode keys.
  const modes: { id: RiskControlMode; tone: string; icon: React.ReactNode; def: typeof RISK_MODE_LABELS[string] }[] = [
    { id: "conservative", tone: "emerald", icon: <Shield className="h-3 w-3" />,            def: RISK_MODE_LABELS.conservative },
    { id: "balanced",     tone: "sky",     icon: <Gauge className="h-3 w-3" />,             def: RISK_MODE_LABELS.balanced },
    { id: "aggressive",   tone: "amber",   icon: <Flame className="h-3 w-3" />,             def: RISK_MODE_LABELS.aggressive },
    { id: "custom",       tone: "violet",  icon: <SlidersHorizontal className="h-3 w-3" />, def: RISK_MODE_LABELS.custom },
  ];
  const resolved = resolveRiskControls(mode, mode === "custom" ? customControls : undefined);

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Gauge className="h-3.5 w-3.5 text-[hsl(var(--intelligence))]" />
        <Label className="text-xs font-medium">How aggressive should the engine be?</Label>
        <InfoTooltip term="Risk control mode" />
        <HelpLink topic={HELP_TOPICS.scenarioAssumptions} variant="icon" ariaLabel="Learn about risk control modes" />
        <button
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="ml-auto text-[11px] font-medium text-[hsl(var(--intelligence))] hover:underline underline-offset-2"
        >
          {expanded ? "Hide details" : "Show details"}
        </button>
      </div>
      <p className="text-[11px] text-foreground/70 leading-snug">
        Controls how strict the engine is about filtering risky paths. Doesn’t change the math — just what you see.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5" data-testid="risk-mode-grid">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => onModeChange(m.id)}
            aria-pressed={mode === m.id}
            data-testid={`risk-mode-${m.id}`}
            className={
              mode === m.id
                ? "de-selectable-card selected text-left rounded-lg p-3 transition-all min-h-[78px] ring-2 ring-[hsl(var(--intelligence)/0.35)] shadow-sm"
                : "de-selectable-card text-left rounded-lg border border-border bg-card p-3 transition-all min-h-[78px] hover:bg-muted/40 hover:border-border/80"
            }
          >
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
              {m.icon}
              <span className="truncate">{m.def.simple}</span>
              {mode === m.id && (
                <span className="ml-auto text-[9px] uppercase tracking-wide font-bold text-[hsl(var(--intelligence-light))]">●</span>
              )}
            </div>
            <div className="text-[10px] text-foreground/70 mt-1 leading-snug line-clamp-2">
              {m.def.subtitle}
            </div>
            <div className="text-[9px] text-foreground/55 italic mt-1.5 leading-snug line-clamp-2">
              {m.def.whatChanges}
            </div>
          </button>
        ))}
      </div>

      {expanded && (
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-md border border-border bg-card/60 p-3 text-[11px]">
          <ControlReadout label="Max LVR"           value={`${(resolved.maxLvr * 100).toFixed(0)}%`} hint="absolute ceiling ≤ 85%" />
          <ControlReadout label="Min buffered NSR"  value={resolved.minNsrBuffered.toFixed(2)}     hint="institutional floor ≥ 0.70" />
          <ControlReadout label="Max default prob"  value={`${(resolved.maxDefaultProbability * 100).toFixed(0)}%`} hint="institutional floor ≤ 40%" />
          <ControlReadout label="Max crypto share"  value={`${(resolved.maxCryptoSharePct * 100).toFixed(0)}%`} hint="of portfolio" />
          <ControlReadout label="Max single asset"  value={`${(resolved.maxSingleAssetSharePct * 100).toFixed(0)}%`} hint="of portfolio" />
          <ControlReadout label="Allow high-risk"   value={resolved.allowHighRiskPaths ? "yes" : "no"} hint="soft warnings → high-risk bucket" />
        </div>
      )}

      {mode === "custom" && expanded && (
        <div className="mt-2 space-y-3 rounded-md border border-violet-300 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/20 p-3">
          <div className="text-[10px] uppercase tracking-wide font-semibold text-violet-700 dark:text-violet-300">Custom thresholds</div>
          <CustomSlider
            label="Max LVR"
            explainerId="maxLvr"
            value={customControls.maxLvr ?? RISK_MODE_DEFAULTS.custom.maxLvr}
            min={0.50} max={0.85} step={0.01}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(v) => onCustomControlsChange({ ...customControls, maxLvr: v })}
          />
          <CustomSlider
            label="Min buffered NSR"
            explainerId="minNsrBuffered"
            value={customControls.minNsrBuffered ?? RISK_MODE_DEFAULTS.custom.minNsrBuffered}
            min={0.70} max={1.20} step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(v) => onCustomControlsChange({ ...customControls, minNsrBuffered: v })}
          />
          <CustomSlider
            label="Max default probability"
            explainerId="maxDefaultProbability"
            value={customControls.maxDefaultProbability ?? RISK_MODE_DEFAULTS.custom.maxDefaultProbability}
            min={0.05} max={0.40} step={0.01}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(v) => onCustomControlsChange({ ...customControls, maxDefaultProbability: v })}
          />
          <CustomSlider
            label="Max crypto share"
            explainerId="maxCryptoSharePct"
            value={customControls.maxCryptoSharePct ?? RISK_MODE_DEFAULTS.custom.maxCryptoSharePct}
            min={0.00} max={1.00} step={0.05}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(v) => onCustomControlsChange({ ...customControls, maxCryptoSharePct: v })}
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={customControls.allowHighRiskPaths ?? RISK_MODE_DEFAULTS.custom.allowHighRiskPaths}
              onChange={(e) => onCustomControlsChange({ ...customControls, allowHighRiskPaths: e.target.checked })}
              className="rounded border-border"
            />
            <span>Allow high-risk paths (soft warnings still surfaced, with penalty)</span>
          </label>
          <div className="text-[10px] text-muted-foreground">
            Hard floors enforced regardless: LVR ≤ 85%, default-prob ≤ 40%, NSR ≥ 0.70.
          </div>
        </div>
      )}
    </div>
  );
}

function ControlReadout({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-xs font-semibold tabular-nums">{value}</div>
      </div>
      <div className="text-[9px] text-muted-foreground italic">{hint}</div>
    </div>
  );
}

function CustomSlider({
  label, value, min, max, step, format, onChange, explainerId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  /** Optional risk-explainability metadata id. Adds a popover with plain-English
   *  explanation, recommended range, and what raising/lowering does. */
  explainerId?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <Label className="text-[11px] flex items-center gap-1">
          {label}
          {explainerId && <RiskFieldExplainer fieldId={explainerId} />}
        </Label>
        <span className="font-semibold tabular-nums">{format(value)}</span>
      </div>
      <Slider
        value={[value]} min={min} max={max} step={step}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

// Phase 2.8 — Multi-winner re-scoring lenses
function MultiWinnerPanel({ output }: { output: QuickDecisionOutput }) {
  const w = output.multiWinner;
  const allRanked = [...output.ranked, ...output.highRiskPaths];
  const findLabel = (id: string | undefined): string => {
    if (!id) return "—";
    return allRanked.find((c) => c.id === id)?.shortLabel ?? id;
  };
  // Plain-English lens definitions sourced from the central labels module.
  // The engine still uses internal keys ("balanced", "wealthMax", etc.) —
  // we just re-label them at the UI layer for non-financial users.
  const lenses: { key: keyof typeof w; icon: React.ReactNode; tone: string; def: typeof LENS_LABELS[string] }[] = [
    { key: "balanced",     icon: <Gauge className="h-3.5 w-3.5" />, tone: "sky",     def: LENS_LABELS.balanced },
    { key: "wealthMax",    icon: <Crown className="h-3.5 w-3.5" />, tone: "amber",   def: LENS_LABELS.wealthMax },
    { key: "cashflowSafe", icon: <Heart className="h-3.5 w-3.5" />, tone: "emerald", def: LENS_LABELS.cashflowSafe },
    { key: "highRisk",     icon: <Flame className="h-3.5 w-3.5" />, tone: "rose",    def: LENS_LABELS.highRisk },
  ];
  // Softer tones — lower-saturation surfaces, less harsh dark-mode contrast.
  // Premium-fintech look: calm tints, no neon, easy on the eye over long sessions.
  const tones: Record<string, string> = {
    sky:     "border-sky-300/50 bg-sky-50/60 dark:bg-sky-950/20 dark:border-sky-900/50 text-sky-800 dark:text-sky-300",
    amber:   "border-amber-300/50 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-900/50 text-amber-800 dark:text-amber-300",
    emerald: "border-emerald-300/50 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300",
    rose:    "border-rose-300/50 bg-rose-50/60 dark:bg-rose-950/20 dark:border-rose-900/50 text-rose-800 dark:text-rose-300",
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-5 w-5" />
          Different ways to read “best”
          <HelpLink topic={HELP_TOPICS.decisionLenses} variant="icon" ariaLabel="Why lenses differ" />
        </CardTitle>
        <CardDescription>
          The same paths, re-scored four different ways. “Best” depends on what matters most to you — growth, safety, or balance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" data-testid="multi-winner-grid">
          {lenses.map((lens) => {
            const v = w[lens.key];
            return (
              <div
                key={lens.key}
                className={`rounded-lg border p-3.5 ${tones[lens.tone]} space-y-1.5`}
                data-testid={`multi-winner-${lens.key}`}
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold opacity-90">
                  {lens.icon}
                  <span className="truncate">{lens.def.simple}</span>
                </div>
                <div className="text-sm font-semibold mt-0.5 truncate text-foreground">{findLabel(v?.id)}</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-base font-bold tabular-nums">
                    {v ? v.score.toFixed(0) : "—"}
                  </span>
                  <span className="text-[10px] opacity-70">{v ? "/100" : "no candidate"}</span>
                </div>
                <div className="text-[10px] leading-snug opacity-80">{lens.def.subtitle}</div>
                <div className="text-[10px] italic opacity-70 leading-snug pt-1 border-t border-current/10">
                  Why this wins: {lens.def.whyThisWon}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// Phase 2.8 — High-risk-but-possible paths section
function HighRiskPathsPanel({
  paths, fmt, riskMode,
}: {
  paths: RankedCandidate[];
  fmt: ReturnType<typeof useMaskFmt>;
  riskMode: RiskControlMode;
}) {
  return (
    <Card className="border-amber-300 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/15">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              High-risk but possible paths ({paths.length})
            </CardTitle>
            <CardDescription>
              These breach balanced-mode soft warnings but are surfaced under <span className="font-semibold">{riskMode}</span> mode
              with explicit penalties. The engine guides, it does not censor.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {paths.map((c) => (
          <div
            key={c.id}
            className="rounded-md border border-amber-300 dark:border-amber-800 bg-card/60 p-3"
            data-testid={`highrisk-${c.id}`}
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold truncate">{c.label}</span>
                  <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300 text-[10px] font-semibold">
                    HIGH RISK
                  </Badge>
                  {c.softWarnings.map((sw) => (
                    <Badge
                      key={sw.id}
                      variant="outline"
                      className={`text-[10px] font-medium ${
                        sw.severity === "critical"
                          ? "border-rose-400 text-rose-700 dark:text-rose-400"
                          : sw.severity === "warn"
                            ? "border-amber-400 text-amber-700 dark:text-amber-400"
                            : "border-sky-400 text-sky-700 dark:text-sky-400"
                      }`}
                    >
                      {sw.label}
                    </Badge>
                  ))}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{fmt.sentence(c.headline)}</div>
              </div>
              <Badge className="tabular-nums font-bold text-base bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                {c.score.score.toFixed(0)}
              </Badge>
            </div>
            <ul className="mt-2 text-[10px] text-muted-foreground space-y-0.5">
              {c.softWarnings.slice(0, 3).map((sw) => (
                <li key={sw.id} className="flex items-start gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />
                  <span>{fmt.sentence(sw.detail)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Phase 2.8 — Per-discard collapsible "Why filtered?" panel
function WhyFilteredPanel({
  discard, expanded, onToggle, fmt,
}: {
  discard: DiscardedCandidate;
  expanded: boolean;
  onToggle: () => void;
  fmt: ReturnType<typeof useMaskFmt>;
}) {
  const d = discard;
  const ex = d.explanation;
  return (
    <div
      className="rounded-md border border-border bg-card/50 overflow-hidden"
      data-testid={`discarded-${d.id}`}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left p-3 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold truncate">{d.label}</span>
          <Badge
            variant="outline"
            className={
              d.severity === "hard_blocker"
                ? "border-rose-400 text-rose-700 dark:text-rose-400 text-[10px] font-semibold"
                : "border-amber-400 text-amber-700 dark:text-amber-400 text-[10px] font-semibold"
            }
          >
            {d.severity === "hard_blocker" ? "HARD BLOCKER" : "SOFT WARNING"}
          </Badge>
          <Badge variant="outline" className="text-[10px] border-border text-muted-foreground">
            {d.stage === "behavioural" ? "behavioural" : "safety ceiling"}
          </Badge>
          {d.horizonSensitive && (
            <Badge
              variant="outline"
              className="text-[10px] font-semibold border-violet-400 text-violet-700 dark:text-violet-400 gap-1"
              data-testid={`horizon-badge-${d.id}`}
              title={
                d.viableHorizonYears
                  ? `Viable at ${d.viableHorizonYears}y horizon`
                  : "Becomes viable with a longer horizon"
              }
            >
              <Clock className="h-2.5 w-2.5" />
              Horizon-sensitive
              {d.viableHorizonYears ? ` (≥${d.viableHorizonYears}y)` : ""}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] border-indigo-300 text-indigo-700 dark:text-indigo-400">
            mode: {d.riskMode}
          </Badge>
          <span className="ml-auto text-muted-foreground">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        </div>
        {!expanded && (
          <div className="text-[11px] text-muted-foreground mt-1">
            <span className="font-medium text-foreground">{d.reason}.</span> {fmt.sentence(ex.plainEnglish)}
          </div>
        )}
      </button>
      {expanded && (
        <div className="border-t border-border p-3 space-y-3 bg-muted/10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Plain English</div>
              <div className="text-xs mt-1">{fmt.sentence(ex.plainEnglish)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Primary driver</div>
              <div className="text-xs mt-1 font-semibold">{ex.primaryDriver}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Technical</div>
              <div className="text-xs mt-1 font-mono text-muted-foreground">{fmt.sentence(ex.technical)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> Stress period
              </div>
              <div className="text-xs mt-1">{fmt.sentence(ex.stressPeriod)}</div>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wide font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
              <Wrench className="h-3 w-3" /> What would make this viable
            </div>
            <ul className="text-xs mt-1 space-y-0.5">
              {ex.whatWouldFix.map((line, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <Lightbulb className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                  <span>{fmt.sentence(line)}</span>
                </li>
              ))}
            </ul>
          </div>

          {d.recovery && <RecoveryMiniTimeline recovery={d.recovery} />}

          <div className="text-[10px] text-muted-foreground border-t border-border pt-2">
            <span className="font-semibold text-foreground">Override:</span>{" "}
            {d.override.possible ? (
              <span className="text-amber-700 dark:text-amber-400">Possible — {fmt.sentence(d.override.mechanism)}</span>
            ) : (
              <span className="text-rose-700 dark:text-rose-400">Not overridable — {fmt.sentence(d.override.mechanism)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Phase 2.8 — Recovery mini-timeline for leveraged-property paths
function RecoveryMiniTimeline({ recovery }: { recovery: NonNullable<DiscardedCandidate["recovery"]> }) {
  const maxYear = Math.max(
    recovery.liquidityTroughYear,
    recovery.debtStabilisationYear,
    recovery.refinanceRiskWindow.endYear,
  ) + 1;
  const xFor = (y: number) => Math.min(100, Math.max(0, (y / maxYear) * 100));
  return (
    <div className="rounded-md border border-violet-300 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 p-3">
      <div className="text-[10px] uppercase tracking-wide font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-1">
        <Coins className="h-3 w-3" /> Recovery analysis (leveraged path)
      </div>
      <div className="relative h-6 mt-2 bg-violet-100 dark:bg-violet-900/40 rounded-sm">
        <div
          className="absolute top-0 bottom-0 bg-amber-200/70 dark:bg-amber-800/40"
          style={{
            left: `${xFor(recovery.refinanceRiskWindow.startYear)}%`,
            width: `${xFor(recovery.refinanceRiskWindow.endYear) - xFor(recovery.refinanceRiskWindow.startYear)}%`,
          }}
          title={`Refinance risk window: Years ${recovery.refinanceRiskWindow.startYear}–${recovery.refinanceRiskWindow.endYear}`}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-rose-600"
          style={{ left: `${xFor(recovery.liquidityTroughYear)}%` }}
          title={`Liquidity trough at year ${recovery.liquidityTroughYear}`}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-emerald-600"
          style={{ left: `${xFor(recovery.debtStabilisationYear)}%` }}
          title={`Debt stabilises at year ${recovery.debtStabilisationYear}`}
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] mt-2">
        <div><span className="text-rose-700 dark:text-rose-400 font-semibold">Trough:</span> Year {recovery.liquidityTroughYear}</div>
        <div><span className="text-emerald-700 dark:text-emerald-400 font-semibold">Stabilises:</span> Year {recovery.debtStabilisationYear}</div>
        <div><span className="text-amber-700 dark:text-amber-400 font-semibold">Refi window:</span> Y{recovery.refinanceRiskWindow.startYear}–{recovery.refinanceRiskWindow.endYear}</div>
        <div><span className="text-violet-700 dark:text-violet-300 font-semibold">Recovery:</span> {recovery.recoveryYears}y</div>
      </div>
    </div>
  );
}

function ReadoutTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xs font-semibold tabular-nums truncate">{value}</div>
    </div>
  );
}

function MetricTile({
  icon, label, value, tone, infoTerm, helpTopic,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "emerald" | "sky" | "indigo" | "amber";
  /** Glossary key to attach an <InfoTooltip /> next to the label. */
  infoTerm?: string;
  /** Optional Help Center topic id — adds a deep-link to the full explanation. */
  helpTopic?: string;
}) {
  // Semantic-token tile shells so contrast is correct in both light and dark.
  // We pair a low-saturation surface with the tone-specific accent text — and
  // we make the surface dark enough in dark mode that white-ish digits read
  // crisply (no more 'muddy' look).
  const tones = {
    emerald: "border-[hsl(var(--success)/0.35)] bg-[hsl(var(--success-surface))]",
    sky:     "border-[hsl(var(--info)/0.35)] bg-[hsl(var(--info)/0.10)]",
    indigo:  "border-[hsl(var(--intelligence)/0.35)] bg-[hsl(var(--intelligence-surface))]",
    amber:   "border-[hsl(var(--gold)/0.35)] bg-[hsl(var(--gold-surface))]",
  };
  const accents = {
    emerald: "text-[hsl(var(--success-light))]",
    sky:     "text-[hsl(var(--info-light))]",
    indigo:  "text-[hsl(var(--intelligence-light))]",
    amber:   "text-[hsl(var(--gold-light))]",
  };
  return (
    <div className={`rounded-lg border p-2.5 sm:p-3 ${tones[tone]}`}>
      <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold ${accents[tone]}`}>
        {icon}
        <span className="truncate">{label}</span>
        {infoTerm && <InfoTooltip term={infoTerm} size={11} />}
        {helpTopic && <HelpLink topic={helpTopic} variant="icon" ariaLabel={`Learn more about ${label}`} />}
      </div>
      <div className="text-base sm:text-lg font-bold tabular-nums mt-0.5 text-foreground">{value}</div>
    </div>
  );
}

function CandidateRow({
  rank, candidate, expanded, onToggle, fmt, privacyMode,
}: {
  rank: number;
  candidate: RankedCandidate;
  expanded: boolean;
  onToggle: () => void;
  fmt: ReturnType<typeof useMaskFmt>;
  privacyMode: boolean;
}) {
  const { pct, fmt$M, sentence } = fmt;
  const scoreToneClass =
    candidate.score.score >= 75 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400" :
    candidate.score.score >= 55 ? "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400" :
    candidate.score.score >= 35 ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400" :
    "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400";

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full p-3 hover:bg-muted/40 transition-colors text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Badge variant="outline" className="shrink-0 tabular-nums">#{rank}</Badge>
            <div className="min-w-0 flex-1">
              <div className="text-xs sm:text-sm font-semibold truncate">{candidate.label}</div>
              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                {sentence(candidate.headline)}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={`tabular-nums font-bold ${scoreToneClass}`}>
              {candidate.score.score.toFixed(0)}
            </Badge>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/20 p-3 space-y-4">
          {/* Phase 2.2: Compact fan + tail risk for this candidate */}
          <div className="rounded-lg bg-card/70 dark:bg-card/50 border border-border p-3">
            <FanChart
              fan={candidate.result.netWorthFan}
              fmt={fmt}
              initialNetWorth={candidate.result.initialNetWorth}
              hidden={privacyMode}
              height={180}
              title="Path fan"
              subtitle="P5–P95 dispersion · this candidate"
            />
          </div>

          <div className="rounded-lg bg-card/70 dark:bg-card/50 border border-border p-3">
            <TailRiskCard result={candidate.result} fmt={fmt} compact />
          </div>

          {/* Phase 2.3: Per-candidate score waterfall */}
          <div className="rounded-lg bg-card/70 dark:bg-card/50 border border-border p-3">
            <ScoreWaterfall candidate={candidate} compact fmt={fmt} />
          </div>

          <Separator />

          {/* Rationale */}
          <div>
            <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">
              Rationale
            </div>
            <ul className="space-y-1 text-xs">
              {candidate.rationale.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Award className="h-3 w-3 text-indigo-600 mt-0.5 shrink-0" />
                  <span>{sentence(r)}</span>
                </li>
              ))}
            </ul>
          </div>

          <Separator />

          {/* Score breakdown */}
          <div>
            <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">
              Score derivation
            </div>
            <div className="space-y-1.5">
              {candidate.score.breakdown.map((b) => (
                <div key={b.axis} className="flex items-center gap-2 text-xs">
                  <div className="w-32 sm:w-40 shrink-0 truncate text-muted-foreground capitalize">
                    {String(b.axis).replace(/([A-Z])/g, " $1").trim()}
                  </div>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 transition-all"
                      style={{ width: `${Math.max(0, Math.min(100, b.normalisedValue * 100))}%` }}
                    />
                  </div>
                  <div className="w-16 text-right tabular-nums font-medium">
                    {b.contribution.toFixed(1)}
                  </div>
                </div>
              ))}
              {candidate.score.penalties.length > 0 && (
                <div className="pt-2 space-y-1">
                  {candidate.score.penalties.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] text-rose-700 dark:text-rose-400">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span className="flex-1 truncate">{p.reason}</span>
                      <span className="tabular-nums font-medium">−{p.magnitude.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Event timeline */}
          {candidate.trace.timeline.length > 0 && (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">
                  Event timeline
                </div>
                <div className="space-y-1.5">
                  {candidate.trace.timeline.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="text-[10px] tabular-nums shrink-0">
                        {t.month}
                      </Badge>
                      <span className="text-muted-foreground shrink-0">{t.event}</span>
                      <span className="text-foreground truncate">{sentence(t.effect)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Constraints evaluated */}
          <div>
            <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">
              Constraints evaluated
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {candidate.trace.constraintsEvaluated.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  {c.passed
                    ? <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                    : <XCircle className="h-3 w-3 text-rose-600 shrink-0" />}
                  <span className="text-muted-foreground truncate flex-1">{c.id}</span>
                  <span className="tabular-nums font-medium">
                    {typeof c.value === "number" ? c.value.toFixed(2) : String(c.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Risk drivers */}
          {candidate.trace.riskDrivers.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground mb-1.5">
                Risk drivers
              </div>
              <ul className="space-y-1 text-xs">
                {candidate.trace.riskDrivers.map((r, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <AlertTriangle className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
                    <span>
                      <span className="font-semibold">{r.label}:</span>{" "}
                      <span className="text-muted-foreground">{sentence(r.detail)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Assumptions used */}
          <details className="text-[11px]">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
              Assumptions used ({candidate.trace.assumptionsUsed.length})
            </summary>
            <div className="mt-2 space-y-1 pl-2 border-l border-border">
              {candidate.trace.assumptionsUsed.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-muted-foreground">{a.id}</span>
                  <span className="tabular-nums font-medium">{String(a.value)}</span>
                  <span className="text-muted-foreground text-[10px]">· {a.source}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

// ─── Page (tabs) ─────────────────────────────────────────────────────────────

export default function DecisionPage() {
  const [tab, setTab] = useState<"quick" | "advanced">("quick");

  // Sync browser hash so deep-links work and refreshing preserves the active tab.
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash === "advanced") setTab("advanced");
  }, []);

  useEffect(() => {
    window.location.hash = tab;
  }, [tab]);

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-bold">Decision Engine</h1>
          <HelpLink topic={HELP_TOPICS.decisionEngineOverview} variant="icon" ariaLabel="How the Decision Engine works" />
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground">
          One engine, two interfaces. Quick Decision auto-ranks the best paths;
          Advanced Builder lets you author scenarios event-by-event.
        </p>
        <div className="pt-0.5">
          <HelpLink topic={HELP_TOPICS.simpleVsAdvanced} variant="learn-more" label="Simple vs Advanced — which one should I use?" />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "quick" | "advanced")}>
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger value="quick" className="text-xs sm:text-sm h-11 sm:h-9">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Quick Decision
          </TabsTrigger>
          <TabsTrigger value="advanced" className="text-xs sm:text-sm h-11 sm:h-9">
            <Beaker className="h-3.5 w-3.5 mr-1.5" />
            Advanced Builder
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quick" className="mt-4">
          <QuickDecisionTab />
        </TabsContent>

        <TabsContent value="advanced" className="mt-4">
          {/* The legacy event-timeline UX, but rendered without page-level header
              chrome since we're already inside a Layout. */}
          <ScenarioCompareV2Page />
        </TabsContent>
      </Tabs>

      {/* Audit fix P1.4: every engine assumption is surfaced here, collapsible. */}
      <AssumptionsPanel mode="compact" />
    </div>
  );
}

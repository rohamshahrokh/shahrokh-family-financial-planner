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
import {
  Sparkles, Play, Award, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp,
  Trophy, Shield, Droplet, TrendingDown, Target, Info, Eye, EyeOff, ShieldAlert,
  Beaker, ListChecks, XCircle, Activity, SlidersHorizontal,
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
  type QuickDecisionOutput,
  type RankedCandidate,
  type QuickDecisionQuestionKind,
} from "@/lib/scenarioV2/decisionEngine/candidateGenerator";
import {
  listInvestorProfiles,
  type InvestorProfile,
} from "@/lib/scenarioV2/registry";
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

// Embedded power-user tab — re-uses every line of premium Scenario Lab UX.
import ScenarioCompareV2Page from "./scenario-compare-v2";

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

  // ── Output state ───────────────────────────────────────────────────────────
  const [output, setOutput] = useState<QuickDecisionOutput | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null);
  const [showDiscarded, setShowDiscarded] = useState(false);

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
      const out = await generateQuickDecisionCandidates({
        dashboardInputs,
        question: { kind: question, capital },
        horizonYears,
        household: { dependants, incomeVolatility },
        investorProfile,
        simulationCount: 300,    // good balance of speed + signal for UX
        taxContext: {
          annualGrossIncome,
          hasHelpDebt,
          hasPrivateHospitalCover,
        },
      });
      setOutput(out);
      if (out.ranked.length > 0) setExpandedCandidateId(out.ranked[0].id);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setRunning(false);
    }
  }

  const ranked = output?.ranked ?? [];
  const discarded = output?.discarded ?? [];
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
          {/* Question pills */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Question</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {QUESTION_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setQuestion(opt.value)}
                  className={`text-left rounded-lg border p-3 transition-all min-h-[64px]
                    ${question === opt.value
                      ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-200 dark:ring-indigo-800"
                      : "border-border bg-card hover:bg-muted/50"}`}
                  aria-pressed={question === opt.value}
                >
                  <div className="text-xs font-semibold text-foreground">{opt.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Inputs grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Capital available (AUD)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={capital}
                min={0}
                step={1000}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (Number.isFinite(n)) setCapital(Math.max(0, n));
                }}
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
              <Input
                type="number"
                value={dependants}
                min={0}
                max={6}
                step={1}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isFinite(n)) setDependants(Math.max(0, Math.min(6, n)));
                }}
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

          {/* Investor profile selector (Phase 2.1) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              <Label className="text-xs font-medium">Investor profile</Label>
              <span className="text-[10px] text-muted-foreground">
                re-weights ranking · raw math unchanged
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {listInvestorProfiles().map(p => (
                <button
                  key={p.id}
                  onClick={() => setInvestorProfile(p.id)}
                  className={`text-left rounded-lg border p-2 transition-all min-h-[64px]
                    ${investorProfile === p.id
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40 ring-2 ring-violet-200 dark:ring-violet-800"
                      : "border-border bg-card hover:bg-muted/50"}`}
                  aria-pressed={investorProfile === p.id}
                  title={p.description}
                >
                  <div className="text-[11px] font-semibold text-foreground truncate">{p.label}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                    {p.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {liveReadouts && (
            <div className="rounded-lg border border-border bg-card/50 p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <ReadoutTile label="Monthly income"    value={fmt$(liveReadouts.income)}   />
              <ReadoutTile label="Monthly expenses"  value={fmt$(liveReadouts.expenses)} />
              <ReadoutTile label="Monthly surplus"   value={fmt$(liveReadouts.surplus)}  />
              <ReadoutTile label="Cash on hand"      value={fmt$(liveReadouts.cash)}     />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-[11px] text-muted-foreground">
              500-path Monte Carlo per candidate · banded DSR · LVR 0.85 ceiling · dynamic liquidity floor
            </div>
            <Button
              onClick={run}
              disabled={running || !canRun}
              className="min-w-[160px]"
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
        <Card className="border-emerald-300 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <Badge variant="default" className="bg-emerald-600">Recommended path</Badge>
                </div>
                <CardTitle className="text-base sm:text-xl">{winner.label}</CardTitle>
                <CardDescription className="text-xs">{sentence(winner.headline)}</CardDescription>
                {output && (
                  <div className="flex items-center gap-1.5 pt-1">
                    <SlidersHorizontal className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-violet-700 dark:text-violet-400">
                      Ranked under: {output.investorProfile.replace(/_/g, " ")}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-2xl sm:text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {winner.score.score.toFixed(0)}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">/100</div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricTile
                icon={<Shield className="h-3 w-3" />}
                label="Survival"
                value={pct(winner.trace.scoreDerivation.find(s => s.axis === "survivalProbability")?.rawValue ?? 0, 0)}
                tone="emerald"
              />
              <MetricTile
                icon={<Droplet className="h-3 w-3" />}
                label="Liquidity factor"
                value={(winner.trace.scoreDerivation.find(s => s.axis === "liquidityFactor")?.rawValue ?? 0).toFixed(2)}
                tone="sky"
              />
              <MetricTile
                icon={<TrendingDown className="h-3 w-3" />}
                label="Risk-adj CAGR"
                value={pct(winner.trace.scoreDerivation.find(s => s.axis === "riskAdjustedReturn")?.rawValue ?? 0, 1)}
                tone="indigo"
              />
              <MetricTile
                icon={<Target className="h-3 w-3" />}
                label="Terminal NW (P50)"
                value={fmt$M(winner.trace.scoreDerivation.find(s => s.axis === "terminalNetWorth")?.rawValue ?? 0)}
                tone="amber"
              />
            </div>

            {output && (
              <div className="rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-3 space-y-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide font-semibold text-emerald-800 dark:text-emerald-400 mb-1">
                    Why this won
                  </div>
                  <ul className="space-y-1 text-xs">
                    {output.comparativeNarrative.whyWon.map((line, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-3 w-3 text-emerald-600 mt-0.5 shrink-0" />
                        <span>{sentence(line)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {output.comparativeNarrative.whatCouldInvalidate.length > 0 && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide font-semibold text-amber-800 dark:text-amber-400 mb-1">
                      What could invalidate this
                    </div>
                    <ul className="space-y-1 text-xs">
                      {output.comparativeNarrative.whatCouldInvalidate.map((line, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <AlertTriangle className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
                          <span>{sentence(line)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {output.comparativeNarrative.secondPlaceAndWhy && (
                  <div>
                    <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-1">
                      Runner-up
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {sentence(output.comparativeNarrative.secondPlaceAndWhy)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Phase 2.2: Wealth-path fan chart */}
            <div className="rounded-lg bg-card/70 dark:bg-card/50 border border-border p-3">
              <FanChart
                fan={winner.result.netWorthFan}
                fmt={{ fmt$, fmt$k, fmt$M, pct, sentence }}
                initialNetWorth={winner.result.initialNetWorth}
                hidden={privacyMode}
              />
            </div>

            {/* Phase 2.2: Tail-risk profile */}
            <div className="rounded-lg bg-card/70 dark:bg-card/50 border border-border p-3">
              <TailRiskCard
                result={winner.result}
                fmt={{ fmt$, fmt$k, fmt$M, pct, sentence }}
              />
            </div>

            {/* Phase 2.2: Terminal NW distribution + VaR/CVaR markers */}
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

            {/* Phase 2.3: Score waterfall */}
            <div className="rounded-lg bg-card/70 dark:bg-card/50 border border-border p-3">
              <ScoreWaterfall candidate={winner} />
            </div>

            {/* Phase 2.3: Winner vs runner-up */}
            {output && output.ranked.length >= 2 && (
              <div className="rounded-lg bg-card/70 dark:bg-card/50 border border-border p-3">
                <WinnerVsRunnerUp output={output} fmt={{ fmt$, fmt$k, fmt$M, pct, sentence }} />
              </div>
            )}

            {/* Phase 2.3: Invalidation engine */}
            {output && (
              <div className="rounded-lg bg-card/70 dark:bg-card/50 border border-border p-3">
                <InvalidationEngine output={output} fmt={{ fmt$, fmt$k, fmt$M, pct, sentence }} />
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
            </CardTitle>
            <CardDescription>
              Tap a path to inspect its assumptions, formulas invoked, and event timeline.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {ranked.map((c, idx) => (
              <CandidateRow
                key={c.id}
                rank={idx + 1}
                candidate={c}
                expanded={expandedCandidateId === c.id}
                onToggle={() => setExpandedCandidateId(expandedCandidateId === c.id ? null : c.id)}
                fmt={{ fmt$, fmt$k, fmt$M, pct, sentence }}
                privacyMode={privacyMode}
              />
            ))}
          </CardContent>
        </Card>
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
                  <div
                    key={d.id}
                    className="rounded-md border border-border bg-card/50 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold truncate">{d.label}</span>
                          <Badge
                            variant="outline"
                            className={
                              d.stage === "behavioural"
                                ? "border-amber-300 text-amber-700 dark:text-amber-400 text-[10px]"
                                : "border-rose-300 text-rose-700 dark:text-rose-400 text-[10px]"
                            }
                          >
                            {d.stage === "behavioural" ? "behavioural" : "safety ceiling"}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          <span className="font-medium">{d.reason}</span> — {sentence(d.detail)}
                        </div>
                      </div>
                    </div>
                  </div>
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

function ReadoutTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xs font-semibold tabular-nums truncate">{value}</div>
    </div>
  );
}

function MetricTile({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "emerald" | "sky" | "indigo" | "amber";
}) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50/60 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900",
    sky:     "border-sky-200 bg-sky-50/60 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400 dark:border-sky-900",
    indigo:  "border-indigo-200 bg-indigo-50/60 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 dark:border-indigo-900",
    amber:   "border-amber-200 bg-amber-50/60 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900",
  };
  return (
    <div className={`rounded-lg border p-2.5 sm:p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide font-semibold opacity-80">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-base sm:text-lg font-bold tabular-nums mt-0.5">{value}</div>
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
            <ScoreWaterfall candidate={candidate} compact />
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
        <h1 className="text-xl sm:text-2xl font-bold">Decision Engine</h1>
        <p className="text-xs sm:text-sm text-muted-foreground">
          One engine, two interfaces. Quick Decision auto-ranks the best paths;
          Advanced Builder lets you author scenarios event-by-event.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "quick" | "advanced")}>
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger value="quick" className="text-xs sm:text-sm">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
            Quick Decision
          </TabsTrigger>
          <TabsTrigger value="advanced" className="text-xs sm:text-sm">
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
    </div>
  );
}

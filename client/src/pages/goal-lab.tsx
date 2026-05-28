/**
 * goal-lab.tsx — Sprint 21 P2.
 *
 * Goal Lab is the PLAN-step intake surface that captures the household's
 * intent + constraints in six calm cards and produces the canonical goal
 * profile downstream surfaces (Decision Lab, Action Plan) consume.
 *
 * This file is the UI foundation. Scope (locked, 2026-05-28):
 *   • Layout, card interactions, mobile responsiveness.
 *   • Real canonical reads where they already exist (Q1, Q2, Q3, Q4).
 *   • Lightweight, grounded inference for Q5 + Q6 via
 *     `client/src/lib/goalLab/inferences.ts` — no engine calls.
 *   • Q1 + Q2 persist to the existing `PUT /api/mc-fire-settings` endpoint.
 *   • Q3–Q6 confirmations stay in local component state until the
 *     `goal_profile_extras` JSONB migration lands (P1 of the architecture).
 *
 * Out of scope for THIS file:
 *   • Orchestrator wiring (Decision Lab consumes this profile later).
 *   • Recommendation re-rank, MC, scenarioV2, goalSolverPro.
 *   • Booking integration (the "Talk to a planner" card is a placeholder).
 *
 * Visual reference: the user's mockup at
 *   uploaded_attachments/.../56D707E1-6F65-4859-A570-3EA172D01AF5.jpeg
 * with two label changes vs the mockup, per locked architecture v3:
 *   • Sidebar entry and route are "/goal-lab" → "Goal Lab" (Goal Lab in PLAN).
 *   • Footer CTA reads "Go to Decision Lab →" and links to "/decision-lab".
 */

import * as React from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

import {
  Target, TrendingUp, PieChart, Rocket, Shield, Lock,
  Check, Edit3, ArrowRight, Sparkles, Quote,
  Loader2, AlertCircle,
  Activity, Zap, Gauge, Flag,
} from "lucide-react";

import AssumptionsPanel from "@/components/AssumptionsPanel";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import { useCanonicalGoal } from "@/lib/useCanonicalGoal";
import { computeCanonicalHeadlineMetrics } from "@/lib/canonicalHeadlineMetrics";
import { formatCurrency } from "@/lib/finance";
import {
  buildCapitalStructureSnapshot,
  buildWealthEngineMix,
  inferRiskCapacity,
  inferPreferenceVector,
  primaryDriverCopy,
} from "@/lib/goalLab/inferences";
import {
  useGoalProfileStore,
  type ConstraintOverride as StoreConstraintOverride,
} from "@/lib/goalLab/goalProfileStore";

/**
 * Sprint 23 — page→store constraint mapper.
 *
 * The Q6 dropdown shows UI-blocker copy ("Timeline too aggressive", "Savings
 * too low", …) because that's what users recognise. The engine consumes a
 * constraint-axis vocabulary ("timeline", "growth", "liquidity", …) because
 * that's what scenario templates branch on. This is the single boundary that
 * translates between the two. If you add a Q6 option, add a mapping here.
 */
function mapPageConstraintToStore(
  v:
    | "auto" | "timeline-too-aggressive" | "savings-too-low" | "debt-pressure"
    | "liquidity-too-low" | "concentration-high" | "target-too-high" | "growth-engine-low",
): StoreConstraintOverride {
  switch (v) {
    case "auto":                     return "auto";
    case "timeline-too-aggressive": return "timeline";
    case "target-too-high":         return "timeline";   // same axis — reach
    case "savings-too-low":         return "growth";
    case "growth-engine-low":       return "growth";
    case "debt-pressure":           return "leverage";
    case "liquidity-too-low":       return "liquidity";
    case "concentration-high":      return "stability";
  }
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Card primitive                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

type CardTone = "violet" | "emerald" | "blue" | "amber" | "rose" | "teal";

// Tone chips — flat, premium, dark-mode aware. Light-mode reads as a soft tinted
// chip; dark-mode uses a desaturated tint at 15-18% alpha with a brighter foreground
// so the chip still pops against the card surface without glowing.
const TONE_CHIP: Record<CardTone, string> = {
  violet:  "bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/25",
  emerald: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25",
  blue:    "bg-blue-100 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/25",
  amber:   "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25",
  rose:    "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25",
  teal:    "bg-teal-100 text-teal-700 ring-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-400/25",
};

const TONE_EDIT_BUTTON: Record<CardTone, string> = {
  violet:  "bg-violet-600 hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400",
  emerald: "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400",
  blue:    "bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400",
  amber:   "bg-amber-500 hover:bg-amber-600 dark:bg-amber-500 dark:hover:bg-amber-400",
  rose:    "bg-rose-600 hover:bg-rose-700 dark:bg-rose-500 dark:hover:bg-rose-400",
  teal:    "bg-teal-600 hover:bg-teal-700 dark:bg-teal-500 dark:hover:bg-teal-400",
};

type CardStatus = "inferred" | "missing" | "confirmed";

interface GoalLabCardShellProps {
  index: number;
  tone: CardTone;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  status: CardStatus;
  /** Body slot — the "Current answer" panel + any inline summary. */
  children: React.ReactNode;
  onEdit: () => void;
  onConfirm: () => void;
  /** Optional dedicated save handler used when in edit mode. Falls back to onConfirm. */
  onSaveEdit?: () => void;
  editing: boolean;
  /** Inline edit drawer body when editing === true. */
  editingBody?: React.ReactNode;
  saving?: boolean;
  testId: string;
  /** Provenance badge rendered top-right of card header. */
  sourceBadge?: BadgeVariant;
}

function GoalLabCard(props: GoalLabCardShellProps) {
  const {
    index, tone, title, subtitle, icon, status, children,
    onEdit, onConfirm, onSaveEdit, editing, editingBody, saving, testId, sourceBadge,
  } = props;
  const handleSave = onSaveEdit ?? onConfirm;

  return (
    <div
      data-testid={testId}
      className="relative flex flex-col rounded-2xl border border-border/70 bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-3 p-5 pb-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset ${TONE_CHIP[tone]}`}
          aria-hidden
        >
          {index}
        </span>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {sourceBadge ? <DataSourceBadge variant={sourceBadge} /> : null}
          <span className="text-muted-foreground/70" aria-hidden>
            {icon}
          </span>
        </div>
      </div>

      <div className="px-5 pb-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {editing ? "Edit answer" : "Current answer"}
        </div>
        {editing ? editingBody : children}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 px-5 py-3">
        {editing ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              disabled={saving}
              data-testid={`${testId}-cancel`}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className={`text-white ${TONE_EDIT_BUTTON[tone]}`}
              data-testid={`${testId}-save`}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Saving
                </>
              ) : (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Save
                </>
              )}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              onClick={onEdit}
              className={`text-white ${TONE_EDIT_BUTTON[tone]}`}
              data-testid={`${testId}-edit`}
            >
              <Edit3 className="mr-1.5 h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onConfirm}
              data-testid={`${testId}-looks-good`}
              className={
                status === "confirmed"
                  ? "text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                  : "text-muted-foreground hover:bg-muted/50"
              }
            >
              <Check className={`mr-1.5 h-3.5 w-3.5 ${status === "confirmed" ? "text-emerald-600 dark:text-emerald-300" : ""}`} />
              {status === "confirmed" ? "Confirmed" : "Looks good"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── small re-usable bits ─────────────────────────────────────────────────── */

function AnswerPanel({ children, tone = "slate" }: {
  children: React.ReactNode; tone?: "slate" | "amber" | "rose";
}) {
  // Neutral well — sits inside the card. In dark mode it reads as a slightly
  // deeper surface (the --muted token) so the well is distinct from the card
  // body without introducing a gradient.
  const bg =
    tone === "amber" ? "bg-amber-50/70 border-amber-100 dark:bg-amber-500/8 dark:border-amber-400/15" :
    tone === "rose"  ? "bg-rose-50/70 border-rose-100 dark:bg-rose-500/8 dark:border-rose-400/15" :
    "bg-muted/40 border-border/40 dark:bg-muted/30";
  return (
    <div className={`rounded-xl border p-3.5 text-sm leading-relaxed text-foreground ${bg}`}>
      {children}
    </div>
  );
}

function SourceTag({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-card/80 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200/70 dark:text-emerald-300 dark:ring-emerald-400/25 dark:bg-emerald-500/10">
      <Check className="h-3 w-3" />
      {children}
    </div>
  );
}

/* ── DataSourceBadge ─────────────────────────────────────────────────
 * Honest provenance tag rendered at the top-right of every card. Six variants
 * map to the trust states from the brief:
 *   - ledger              -> reads directly from canonical ledger selectors
 *   - fire-settings       -> reads mc_fire_settings via useCanonicalGoal
 *   - assumptions         -> reads from canonical assumptions layer
 *   - estimated           -> computed locally from canonical sources
 *   - confirmed           -> user has confirmed in this session
 *   - needs-confirmation  -> system has a value but the user hasn't agreed yet
 * Tone is muted on purpose — these are provenance, not headlines.                          */
type BadgeVariant = "ledger" | "fire-settings" | "assumptions" | "estimated" | "confirmed" | "needs-confirmation";
function DataSourceBadge({ variant }: { variant: BadgeVariant }) {
  const map: Record<BadgeVariant, { label: string; cls: string }> = {
    "ledger":             { label: "From ledger",          cls: "text-emerald-700 ring-emerald-200/70 dark:text-emerald-300 dark:ring-emerald-400/25" },
    "fire-settings":      { label: "From FIRE settings",   cls: "text-violet-700 ring-violet-200/70 dark:text-violet-300 dark:ring-violet-400/25" },
    "assumptions":        { label: "From assumptions",     cls: "text-blue-700 ring-blue-200/70 dark:text-blue-300 dark:ring-blue-400/25" },
    "estimated":          { label: "Estimated",            cls: "text-amber-700 ring-amber-200/70 dark:text-amber-300 dark:ring-amber-400/25" },
    "confirmed":          { label: "User confirmed",       cls: "text-emerald-700 ring-emerald-200/70 dark:text-emerald-300 dark:ring-emerald-400/25" },
    "needs-confirmation": { label: "Needs confirmation",   cls: "text-muted-foreground ring-border" },
  };
  const { label, cls } = map[variant];
  return (
    <span
      data-testid={`goal-lab-badge-${variant}`}
      className={`inline-flex items-center gap-1 rounded-full bg-card/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${cls}`}
    >
      {label}
    </span>
  );
}

function MissingState({ message, cta }: { message: string; cta: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/60 bg-muted/30 p-3.5 text-sm text-muted-foreground">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70" />
        <div>
          <div className="font-medium text-foreground">{message}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{cta}</div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Page                                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

type DimKey = "Q1" | "Q2" | "Q3" | "Q4" | "Q5" | "Q6";

export default function GoalLabPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Canonical reads (real where they exist) ─────────────────────────────
  const canonicalGoal = useCanonicalGoal();

  const snapQ      = useQuery<any>({ queryKey: ["/api/snapshot"],   queryFn: async () => (await apiRequest("GET", "/api/snapshot")).json() });
  const propsQ     = useQuery<any[]>({ queryKey: ["/api/properties"], queryFn: async () => (await apiRequest("GET", "/api/properties")).json() });
  const stocksQ    = useQuery<any[]>({ queryKey: ["/api/stocks"],     queryFn: async () => (await apiRequest("GET", "/api/stocks")).json() });
  const cryptosQ   = useQuery<any[]>({ queryKey: ["/api/cryptos"],    queryFn: async () => (await apiRequest("GET", "/api/cryptos")).json() });
  const holdingsQ  = useQuery<any[]>({ queryKey: ["/api/holdings"],   queryFn: async () => (await apiRequest("GET", "/api/holdings")).json() });
  const incomeQ    = useQuery<any[]>({ queryKey: ["/api/income-records"], queryFn: async () => (await apiRequest("GET", "/api/income-records")).json() });
  const expensesQ  = useQuery<any[]>({ queryKey: ["/api/expenses"],   queryFn: async () => (await apiRequest("GET", "/api/expenses")).json() });
  const fireSettingsQ = useQuery<any>({ queryKey: ["/api/mc-fire-settings"], queryFn: async () => (await apiRequest("GET", "/api/mc-fire-settings")).json() });

  const dashboardInputs: DashboardInputs = React.useMemo(() => ({
    snapshot:      snapQ.data ?? null,
    properties:    propsQ.data ?? [],
    stocks:        stocksQ.data ?? [],
    cryptos:       cryptosQ.data ?? [],
    holdingsRaw:   holdingsQ.data ?? [],
    incomeRecords: incomeQ.data ?? [],
    expenses:      expensesQ.data ?? [],
  }), [snapQ.data, propsQ.data, stocksQ.data, cryptosQ.data, holdingsQ.data, incomeQ.data, expensesQ.data]);

  const ledgerReady = !!snapQ.data;
  const headline = React.useMemo(
    () => (ledgerReady ? computeCanonicalHeadlineMetrics(dashboardInputs) : null),
    [ledgerReady, dashboardInputs],
  );

  // ── Confirmation state (per-card) ───────────────────────────────────────
  // Q1/Q2 persistence flows through /api/mc-fire-settings; Q3–Q6 stay local
  // until goal_profile_extras lands.
  const [confirmed, setConfirmed] = React.useState<Record<DimKey, boolean>>({
    Q1: false, Q2: false, Q3: false, Q4: false, Q5: false, Q6: false,
  });
  const [editing, setEditing] = React.useState<DimKey | null>(null);
  const toggleConfirmed = (k: DimKey) =>
    setConfirmed((c) => ({ ...c, [k]: !c[k] }));

  // ── Q1 / Q2 editable drafts ─────────────────────────────────────────────
  const goal = canonicalGoal.data;
  const [draftFireAge, setDraftFireAge] = React.useState<string>("");
  const [draftPassiveMonthly, setDraftPassiveMonthly] = React.useState<string>("");
  const [draftLifestyle, setDraftLifestyle] = React.useState<string>("comfortable");

  // ── Q4 / Q5 / Q6 overrides — React state only (no schema yet) ──────────
  // The brief introduces three canonical goal-profile fields. Until
  // goal_profile_extras lands, these live in component state; the data-source
  // badge flips to 'User confirmed' whenever the user picks anything other
  // than 'auto' (i.e. anything other than the engine's inferred default).
  type PreferredEngine = "auto" | "property" | "etf-stocks" | "hybrid" | "debt-reduction" | "unsure";
  type RiskTolerance  = "auto" | "low" | "moderate" | "high";
  type ConstraintOverride =
    | "auto" | "timeline-too-aggressive" | "savings-too-low" | "debt-pressure"
    | "liquidity-too-low" | "concentration-high" | "target-too-high" | "growth-engine-low";
  const [preferredEngine,    setPreferredEngine]    = React.useState<PreferredEngine>("auto");
  const [riskTolerance,      setRiskTolerance]      = React.useState<RiskTolerance>("auto");
  const [constraintOverride, setConstraintOverride] = React.useState<ConstraintOverride>("auto");

  // Sprint 23 — mirror Q4/Q5/Q6 selections into the canonical goal-profile
  // store so the orchestrator + downstream engines can read them. The page
  // still owns the UI vocabulary; this effect translates page enums into the
  // store's engine-facing vocabulary. See lib/goalLab/goalProfileStore.ts.
  const setStorePreferredEngine    = useGoalProfileStore((s) => s.setPreferredEngine);
  const setStoreRiskTolerance      = useGoalProfileStore((s) => s.setRiskTolerance);
  const setStoreConstraintOverride = useGoalProfileStore((s) => s.setConstraintOverride);

  React.useEffect(() => {
    // Q4 — page enum is identical to store enum (auto/property/etf-stocks/
    // hybrid/debt-reduction/unsure). Safe pass-through.
    setStorePreferredEngine(preferredEngine);
  }, [preferredEngine, setStorePreferredEngine]);

  React.useEffect(() => {
    // Q5 — page enum is identical to store enum.
    setStoreRiskTolerance(riskTolerance);
  }, [riskTolerance, setStoreRiskTolerance]);

  React.useEffect(() => {
    // Q6 — page enum is UI-blocker copy; store enum is engine-axis copy.
    // This mapper is the boundary between the two vocabularies. The store
    // value is what reaches the engine; the UI value is what the user sees.
    setStoreConstraintOverride(mapPageConstraintToStore(constraintOverride));
  }, [constraintOverride, setStoreConstraintOverride]);

  // When the user opens an edit drawer, seed the draft from canonical.
  React.useEffect(() => {
    if (editing === "Q1" && goal?.status === "SET") {
      setDraftPassiveMonthly(String(goal.targetPassiveMonthly));
      setDraftFireAge(String(goal.targetFireAge));
    }
    if (editing === "Q2" && goal?.status === "SET") {
      setDraftPassiveMonthly(String(goal.targetPassiveMonthly));
    }
  }, [editing, goal]);

  const fireSettingsMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      return apiRequest("PUT", "/api/mc-fire-settings", body);
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/mc-fire-settings"] });
      qc.invalidateQueries({ queryKey: ["/api/canonical-goal"] });
      toast({ title: "Saved", description: "Your FIRE settings have been updated." });
      // Auto-confirm the affected card on successful save.
      if ("target_fire_age" in vars) setConfirmed((c) => ({ ...c, Q1: true }));
      if ("target_passive_monthly" in vars) setConfirmed((c) => ({ ...c, Q2: true }));
      setEditing(null);
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't save",
        description: err?.message ?? "Try again in a moment.",
        variant: "destructive",
      });
    },
  });

  // ── Derived snapshots for cards 3 / 4 / 5 / 6 ───────────────────────────
  const capital = React.useMemo(
    () => (ledgerReady ? buildCapitalStructureSnapshot(dashboardInputs) : null),
    [ledgerReady, dashboardInputs],
  );
  const wealthMix = React.useMemo(
    () => (ledgerReady ? buildWealthEngineMix(dashboardInputs) : null),
    [ledgerReady, dashboardInputs],
  );
  const riskCapacity = React.useMemo(
    () => (ledgerReady ? inferRiskCapacity(dashboardInputs) : null),
    [ledgerReady, dashboardInputs],
  );
  const preferenceVec = React.useMemo(
    () => (ledgerReady ? inferPreferenceVector(dashboardInputs) : null),
    [ledgerReady, dashboardInputs],
  );

  const completed = Object.values(confirmed).filter(Boolean).length;
  const allDone = completed === 6;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
      <Header />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* ── Left column: 6 cards in a 2-column grid ──────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Q1 ── FIRE goal ────────────────────────────────────────────── */}
          <GoalLabCard
            index={1}
            tone="violet"
            title="What is your FIRE goal?"
            subtitle="Define the life you want and when you want it."
            icon={<Target className="h-5 w-5" />}
            status={confirmed.Q1 ? "confirmed" : goal?.status === "SET" ? "inferred" : "missing"}
            onEdit={() => setEditing(editing === "Q1" ? null : "Q1")}
            onConfirm={() => toggleConfirmed("Q1")}
            editing={editing === "Q1"}
            saving={fireSettingsMutation.isPending}
            testId="goal-lab-q1"
            sourceBadge={
              confirmed.Q1 ? "confirmed" :
              goal?.status === "SET" ? "fire-settings" :
              "needs-confirmation"
            }
            editingBody={
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="q1-fire-age" className="text-xs">Target FIRE age</Label>
                    <Input
                      id="q1-fire-age"
                      type="number"
                      value={draftFireAge}
                      onChange={(e) => setDraftFireAge(e.target.value)}
                      placeholder="50"
                    />
                  </div>
                  <div>
                    <Label htmlFor="q1-passive" className="text-xs">Target monthly passive ($)</Label>
                    <Input
                      id="q1-passive"
                      type="number"
                      value={draftPassiveMonthly}
                      onChange={(e) => setDraftPassiveMonthly(e.target.value)}
                      placeholder="10000"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="q1-lifestyle" className="text-xs">Lifestyle</Label>
                  <select
                    id="q1-lifestyle"
                    value={draftLifestyle}
                    onChange={(e) => setDraftLifestyle(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  >
                    <option value="lean">Lean — basic comfort</option>
                    <option value="comfortable">Comfortable — relaxed lifestyle</option>
                    <option value="aspirational">Aspirational — travel + freedom</option>
                  </select>
                </div>
              </div>
            }
            onSaveEdit={() => {
              const age = Number(draftFireAge);
              const passive = Number(draftPassiveMonthly);
              if (!Number.isFinite(age) || age <= 0 || !Number.isFinite(passive) || passive <= 0) {
                toast({
                  title: "Check your inputs",
                  description: "FIRE age and passive income must be positive numbers.",
                  variant: "destructive",
                });
                return;
              }
              fireSettingsMutation.mutate({
                target_fire_age: age,
                target_passive_monthly: passive,
                goals_set: true,
              });
            }}
          >
            {goal?.status === "SET" ? (
              <AnswerPanel>
                <div className="font-medium text-foreground">
                  FIRE at age {goal.targetFireAge}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({new Date().getFullYear() + Math.max(0, goal.targetFireAge - 35)})
                  </span>
                </div>
                <div className="mt-1 text-foreground/85">
                  Passive income: {formatCurrency(goal.targetPassiveAnnual)} / year
                </div>
                <div className="text-foreground/85">
                  Target net worth: {formatCurrency(goal.targetNetWorth)}
                </div>
                <SourceTag>Canonical FIRE settings</SourceTag>
              </AnswerPanel>
            ) : (
              <MissingState
                message="Goal not set"
                cta="Set your target FIRE age and monthly passive income to continue."
              />
            )}
          </GoalLabCard>

          {/* Q2 ── Monthly fuel (surplus) ───────────────────────────────── */}
          <GoalLabCard
            index={2}
            tone="emerald"
            title="How much fuel do you generate each month?"
            subtitle="Your monthly investable surplus after all expenses and debts."
            icon={<TrendingUp className="h-5 w-5" />}
            status={confirmed.Q2 ? "confirmed" : headline ? "inferred" : "missing"}
            onEdit={() => setEditing(editing === "Q2" ? null : "Q2")}
            onConfirm={() => toggleConfirmed("Q2")}
            editing={editing === "Q2"}
            saving={fireSettingsMutation.isPending}
            testId="goal-lab-q2"
            sourceBadge={confirmed.Q2 ? "confirmed" : headline ? "ledger" : "needs-confirmation"}
            editingBody={
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Monthly surplus is read directly from your income + expense ledger.
                  To change it, update your income or recurring expenses in the ledger.
                </p>
                <div className="rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
                  Current: <span className="font-semibold text-foreground">
                    {headline ? formatCurrency(headline.monthlySurplus) : "—"} / month
                  </span>
                </div>
              </div>
            }
          >
            {headline ? (
              <AnswerPanel>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estimated surplus</div>
                <div className="mt-1 text-xl font-semibold text-foreground">
                  {formatCurrency(headline.monthlySurplus)}{" "}
                  <span className="text-sm font-normal text-muted-foreground">/ month</span>
                </div>
                <SourceTag>From ledger</SourceTag>
              </AnswerPanel>
            ) : (
              <MissingState
                message="No ledger data yet"
                cta="Add income and expenses to estimate your monthly investable surplus."
              />
            )}
          </GoalLabCard>

          {/* Q3 ── Capital structure ───────────────────────────────────── */}
          <GoalLabCard
            index={3}
            tone="blue"
            title="What is your current capital structure?"
            subtitle="Assets, liabilities, liquidity and overall balance sheet health."
            icon={<PieChart className="h-5 w-5" />}
            status={confirmed.Q3 ? "confirmed" : capital ? "inferred" : "missing"}
            onEdit={() => setEditing(editing === "Q3" ? null : "Q3")}
            onConfirm={() => toggleConfirmed("Q3")}
            editing={editing === "Q3"}
            testId="goal-lab-q3"
            sourceBadge={confirmed.Q3 ? "confirmed" : capital ? "ledger" : "needs-confirmation"}
            editingBody={
              <p className="text-xs text-muted-foreground">
                Capital structure is calculated from your ledger. To change it,
                edit your snapshot, properties, stocks, or debts in the ledger.
              </p>
            }
          >
            {capital ? (
              <AnswerPanel>
                <KvRow k="Net worth"          v={formatCurrency(capital.netWorth)} />
                <KvRow k="Total assets"       v={formatCurrency(capital.totalAssets)} />
                <KvRow k="Total liabilities"  v={formatCurrency(capital.totalLiabilities)} />
                <KvRow k="Liquidity (cash + offset)" v={formatCurrency(capital.liquidity)} />
                <KvRow
                  k="Leverage"
                  v={
                    <span className={leverageColour(capital.leverageBand)}>
                      {capital.leverageBand === "n/a"
                        ? "n/a"
                        : `${capitaliseFirst(capital.leverageBand)} (${(capital.leverage * 100).toFixed(0)}%)`}
                    </span>
                  }
                />
                <SourceTag>Canonical ledger</SourceTag>
              </AnswerPanel>
            ) : (
              <MissingState
                message="Capital structure not yet available"
                cta="Add snapshot, properties and investments to your ledger."
              />
            )}
          </GoalLabCard>

          {/* Q4 ── Wealth engine ───────────────────────────────────────── */}
          <GoalLabCard
            index={4}
            tone="amber"
            title="What is your primary wealth engine?"
            subtitle="Where is your wealth growth coming from?"
            icon={<Rocket className="h-5 w-5" />}
            status={confirmed.Q4 ? "confirmed" : wealthMix ? "inferred" : "missing"}
            onEdit={() => setEditing(editing === "Q4" ? null : "Q4")}
            onConfirm={() => toggleConfirmed("Q4")}
            editing={editing === "Q4"}
            testId="goal-lab-q4"
            sourceBadge={
              confirmed.Q4 ? "confirmed" :
              preferredEngine !== "auto" ? "confirmed" :
              wealthMix ? "estimated" :
              "needs-confirmation"
            }
            editingBody={
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Pick your preferred wealth engine going forward. We'll bias
                  Decision Lab paths toward this engine while still scoring all
                  options.
                </p>
                <select
                  value={preferredEngine}
                  onChange={(e) => setPreferredEngine(e.target.value as PreferredEngine)}
                  data-testid="goal-lab-q4-engine-select"
                  className="w-full rounded-md border border-border bg-background text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                >
                  <option value="auto">Use system inference</option>
                  <option value="property">Property-led</option>
                  <option value="etf-stocks">ETF / stocks-led</option>
                  <option value="hybrid">Hybrid — property + ETF</option>
                  <option value="debt-reduction">Debt reduction first</option>
                  <option value="unsure">I'm not sure yet</option>
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Saved this session. Persists to your goal profile once the
                  schema lands.
                </p>
              </div>
            }
          >
            {wealthMix ? (
              <AnswerPanel tone="amber">
                <div className="font-semibold capitalize text-foreground">
                  {wealthMix.label.replace("-", " ")} engine
                </div>
                <ul className="mt-1.5 space-y-0.5 text-foreground/85">
                  <li>• Salary &amp; bonuses ({wealthMix.salaryAndBonusesPct.toFixed(0)}%)</li>
                  <li>• Property ({wealthMix.propertyPct.toFixed(0)}%)</li>
                  <li>• Investments ({wealthMix.investmentsPct.toFixed(0)}%)</li>
                </ul>
                <div className={`mt-2 text-xs font-semibold ${
                  wealthMix.convictionTag === "high"   ? "text-amber-700 dark:text-amber-300" :
                  wealthMix.convictionTag === "medium" ? "text-amber-600 dark:text-amber-400" :
                  "text-muted-foreground"
                }`}>
                  {wealthMix.convictionTag === "high"   ? "High conviction" :
                   wealthMix.convictionTag === "medium" ? "Medium conviction" :
                   "Diversified mix"}
                </div>
                {preferredEngine !== "auto" ? (
                  <div className="mt-2 rounded-md border border-amber-200/60 bg-amber-50/60 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200">
                    Preferred going forward: <span className="font-semibold">{preferredEngineLabel(preferredEngine)}</span>
                  </div>
                ) : null}
              </AnswerPanel>
            ) : (
              <MissingState
                message="Wealth engine mix not yet computable"
                cta="Add ledger data to see where your growth is coming from."
              />
            )}
          </GoalLabCard>

          {/* Q5 ── Risk capacity ───────────────────────────────────────── */}
          <GoalLabCard
            index={5}
            tone="violet"
            title="How much risk can your plan truly survive?"
            subtitle="Your risk capacity, not just your risk tolerance."
            icon={<Shield className="h-5 w-5" />}
            status={confirmed.Q5 ? "confirmed" : riskCapacity ? "inferred" : "missing"}
            onEdit={() => setEditing(editing === "Q5" ? null : "Q5")}
            onConfirm={() => toggleConfirmed("Q5")}
            editing={editing === "Q5"}
            testId="goal-lab-q5"
            sourceBadge={
              confirmed.Q5 ? "confirmed" :
              riskTolerance !== "auto" ? "confirmed" :
              riskCapacity ? "estimated" :
              "needs-confirmation"
            }
            editingBody={
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Risk capacity</span> is
                  what your ledger can absorb. <span className="font-medium text-foreground">Risk
                  tolerance</span> is what you emotionally accept. Set your tolerance — we'll
                  use the lower of the two when ranking paths.
                </p>
                <select
                  value={riskTolerance}
                  onChange={(e) => setRiskTolerance(e.target.value as RiskTolerance)}
                  data-testid="goal-lab-q5-tolerance-select"
                  className="w-full rounded-md border border-border bg-background text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                >
                  <option value="auto">Use inferred capacity</option>
                  <option value="low">Low — prioritise safety, avoid drawdowns</option>
                  <option value="moderate">Moderate — balanced</option>
                  <option value="high">High — comfortable with volatility</option>
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Saved this session.
                </p>
              </div>
            }
          >
            {riskCapacity ? (
              <AnswerPanel>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Risk capacity (from ledger)</div>
                <div className="mt-1 font-semibold text-violet-700 dark:text-violet-300">
                  {bandLabel(riskCapacity.band)}
                </div>
                <p className="mt-1 text-foreground/85">
                  Plan can survive a {(riskCapacity.drawdownToleranceP * 100).toFixed(0)}% portfolio
                  drawdown and {riskCapacity.incomeLossEnduranceMonths} months
                  income loss.
                </p>
                <p className="text-foreground/85">
                  Comfort with leverage: <span className="capitalize">{riskCapacity.leverageComfort}</span>.
                </p>
                {riskTolerance !== "auto" ? (
                  <div className="mt-2 rounded-md border border-violet-200/60 bg-violet-50/60 px-2.5 py-1.5 text-xs text-violet-800 dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-violet-200">
                    Your emotional tolerance: <span className="font-semibold capitalize">{riskTolerance}</span>
                  </div>
                ) : null}
                <SourceTag>Derived from ledger</SourceTag>
              </AnswerPanel>
            ) : (
              <MissingState
                message="Risk capacity not yet computable"
                cta="Add ledger data for a believable capacity estimate."
              />
            )}
          </GoalLabCard>

          {/* Q6 ── Preference vector (hybrid) ──────────────────────────── */}
          <GoalLabCard
            index={6}
            tone="teal"
            title="What is currently blocking your path to FIRE?"
            subtitle="We identify your biggest constraint so we can solve the right problem."
            icon={<Lock className="h-5 w-5" />}
            status={confirmed.Q6 ? "confirmed" : preferenceVec ? "inferred" : "missing"}
            onEdit={() => setEditing(editing === "Q6" ? null : "Q6")}
            onConfirm={() => toggleConfirmed("Q6")}
            editing={editing === "Q6"}
            testId="goal-lab-q6"
            sourceBadge={
              confirmed.Q6 ? "confirmed" :
              constraintOverride !== "auto" ? "confirmed" :
              preferenceVec ? "estimated" :
              "needs-confirmation"
            }
            editingBody={
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  We've inferred a primary blocker from your ledger. If you'd
                  rather solve a different one first, pick it here. Decision Lab
                  will rank paths that resolve your chosen blocker.
                </p>
                <select
                  value={constraintOverride}
                  onChange={(e) => setConstraintOverride(e.target.value as ConstraintOverride)}
                  data-testid="goal-lab-q6-constraint-select"
                  className="w-full rounded-md border border-border bg-background text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                >
                  <option value="auto">Use system inference</option>
                  <option value="timeline-too-aggressive">Timeline too aggressive</option>
                  <option value="savings-too-low">Savings rate too low</option>
                  <option value="debt-pressure">Debt servicing pressure</option>
                  <option value="liquidity-too-low">Liquidity too low</option>
                  <option value="concentration-high">Concentration / overreliance</option>
                  <option value="target-too-high">Target passive income too high</option>
                  <option value="growth-engine-low">Growth engine too low</option>
                </select>
                <p className="text-[11px] text-muted-foreground">Saved this session.</p>
              </div>
            }
          >
            {preferenceVec ? (
              <AnswerPanel tone="rose">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Biggest constraint</div>
                <div className="mt-1 font-semibold text-rose-700 dark:text-rose-300">
                  {constraintOverride !== "auto" ? constraintOverrideLabel(constraintOverride) : primaryDriverCopy(preferenceVec.primaryDriver)}
                </div>
                {constraintOverride !== "auto" ? (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    System inferred: {primaryDriverCopy(preferenceVec.primaryDriver)}
                  </div>
                ) : null}
                <p className="mt-1 text-foreground/85">
                  Your plan currently weights{" "}
                  <span className="font-semibold">safety {Math.round(preferenceVec.safety * 100)}%</span>,
                  speed {Math.round(preferenceVec.speed * 100)}%,
                  flexibility {Math.round(preferenceVec.flexibility * 100)}%,
                  lifestyle {Math.round(preferenceVec.lifestyle * 100)}%.
                </p>
                <SourceTag>Inferred from your behaviour</SourceTag>
              </AnswerPanel>
            ) : (
              <MissingState
                message="Not enough data to infer your blocker yet"
                cta="Add a ledger snapshot to see your primary constraint."
              />
            )}
          </GoalLabCard>
        </div>

        {/* ── Right rail ──────────────────────────────────────────────── */}
        <aside className="space-y-4">
          <SummaryPanel
            completed={completed}
            confirmed={confirmed}
          />
          <LiveSignalsPanel
            completed={completed}
            riskCapacity={riskCapacity}
            preferenceVec={preferenceVec}
            capital={capital}
            wealthMix={wealthMix}
            headline={headline}
            goal={goal}
          />
          <WhatHappensNext />
          {/* Canonical assumptions disclosure — collapsed by default. Brief says
              'Goal Lab should show only simplified assumption disclosure.' We use
              the existing AssumptionsPanel in compact mode so a click reveals the
              full audit-mode set without cluttering the primary surface.            */}
          <AssumptionsPanel mode="compact" />
          <QuoteCard />
        </aside>
      </div>

      {/* ── Footer CTA banner ─────────────────────────────────────────── */}
      <FooterCta allDone={allDone} />

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3" />
        Your data is private and secure.
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Header                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

function Header() {
  // Flat, premium header. Light: very subtle violet tint. Dark: deep card surface
  // with a faint violet wash on the top edge — no full gradient fog.
  return (
    <header className="relative overflow-hidden rounded-2xl border border-border/70 bg-card p-6 sm:p-7">
      {/* Subtle accent wash — tiny, anchored top-left, low opacity */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 -left-12 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl dark:bg-violet-400/10"
      />
      <div className="relative flex items-start justify-between gap-6">
        <div className="max-w-2xl">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">
            Goals-Based Wealth Planning · Behavioural Finance · Monte Carlo Forecasting
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <Target className="h-6 w-6 text-violet-600 dark:text-violet-300" />
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Goal Lab
            </h1>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Let's build your personalised path to <span className="font-semibold text-foreground">Financial Independence</span>.
            Answer 6 key questions. We'll do the heavy lifting.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/80">
            An institutional-style framework for understanding your path to financial independence.
          </p>
        </div>
      </div>
    </header>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Right rail panels                                                          */
/* ────────────────────────────────────────────────────────────────────────── */

const DIM_META: Array<{ key: DimKey; label: string; icon: React.ReactNode }> = [
  { key: "Q1", label: "Goal clarity",       icon: <Target className="h-4 w-4" /> },
  { key: "Q2", label: "Savings engine",     icon: <TrendingUp className="h-4 w-4" /> },
  { key: "Q3", label: "Capital structure",  icon: <PieChart className="h-4 w-4" /> },
  { key: "Q4", label: "Wealth engine",      icon: <Rocket className="h-4 w-4" /> },
  { key: "Q5", label: "Risk capacity",      icon: <Shield className="h-4 w-4" /> },
  { key: "Q6", label: "Constraints",        icon: <Lock className="h-4 w-4" /> },
];

function SummaryPanel({ completed, confirmed }: {
  completed: number;
  confirmed: Record<DimKey, boolean>;
}) {
  const pct = (completed / 6) * 100;
  const circumference = 2 * Math.PI * 42;
  const offset = circumference * (1 - pct / 100);

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <h3 className="text-base font-semibold text-foreground">Your Summary</h3>
        <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
          Preview
        </span>
      </div>

      <div className="my-4 flex justify-center">
        <div className="relative">
          <svg width="120" height="120" className="-rotate-90">
            <circle
              cx="60" cy="60" r="42"
              stroke="hsl(var(--border))"
              strokeWidth="10"
              fill="none"
            />
            <circle
              cx="60" cy="60" r="42"
              stroke="#8b5cf6" strokeWidth="10" fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 600ms ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-lg font-bold text-violet-700 dark:text-violet-300">{completed}/6</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Completed</div>
          </div>
        </div>
      </div>

      <p className="mb-3 text-center text-sm text-muted-foreground">
        {completed === 0 ? "Start with any card that feels easiest." :
         completed === 6 ? <span><span className="font-semibold text-foreground">Great job!</span> You've completed your Goal Lab.</span> :
         "Keep going — confirm each card when it looks right."}
      </p>

      <ul className="space-y-1.5">
        {DIM_META.map((d) => {
          const isDone = confirmed[d.key];
          return (
            <li key={d.key} className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-2 text-foreground/85">
                <span className="text-muted-foreground/70">{d.icon}</span>
                {d.label}
              </span>
              <span className={
                isDone
                  ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"
                  : "h-5 w-5 rounded-full border border-border"
              }>
                {isDone && <Check className="h-3 w-3" />}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Live Signals (system-native panel replacing planner CTA) ───────────────
 * Shows four real, derived signals that prove the engine is reading the
 * ledger right now:
 *   1. Confidence score   — derived from how many cards are confirmed AND
 *                           how complete the underlying ledger reads are.
 *   2. Strongest leverage — derived from wealthMix dominant engine.
 *   3. Most likely blocker— from preferenceVec.primaryDriver.
 *   4. Path stability     — from riskCapacity band.
 *
 * No fabricated numbers — every line falls back to a quiet placeholder when
 * its source isn't computable yet. No CTA, no booking, no upsell.                                  */
function LiveSignalsPanel(props: {
  completed: number;
  riskCapacity: import("@/lib/goalLab/inferences").RiskCapacityInference | null;
  preferenceVec: import("@/lib/goalLab/inferences").PreferenceVectorInference | null;
  capital: import("@/lib/goalLab/inferences").CapitalStructureSnapshot | null;
  wealthMix: import("@/lib/goalLab/inferences").WealthEngineMix | null;
  headline: ReturnType<typeof computeCanonicalHeadlineMetrics> | null;
  goal: ReturnType<typeof useCanonicalGoal>["data"];
}) {
  const { completed, riskCapacity, preferenceVec, capital, wealthMix, headline, goal } = props;

  // Confidence = blended ledger completeness + confirmation rate.
  // Each of the six derived sources contributes; we weight ledger over confirms.
  const ledgerScore =
    (goal?.status === "SET" ? 1 : 0) +
    (headline ? 1 : 0) +
    (capital ? 1 : 0) +
    (wealthMix ? 1 : 0) +
    (riskCapacity ? 1 : 0) +
    (preferenceVec ? 1 : 0);
  const confidencePct = Math.round(((ledgerScore / 6) * 0.7 + (completed / 6) * 0.3) * 100);
  const confidenceBand: "low" | "medium" | "high" =
    confidencePct < 40 ? "low" : confidencePct < 75 ? "medium" : "high";

  // Path stability — directly from risk capacity band.
  const stabilityLabel = riskCapacity ? bandLabel(riskCapacity.band) : "—";
  const stabilityTone: "green" | "amber" | "red" =
    !riskCapacity ? "amber" :
    riskCapacity.band === "high" || riskCapacity.band === "medium_high" ? "green" :
    riskCapacity.band === "medium" ? "amber" :
    "red";

  // Strongest leverage — from wealth engine mix.
  const leverageLabel = wealthMix
    ? wealthMix.label === "income-led"     ? "Income & savings rate"
    : wealthMix.label === "property-led"   ? "Property equity growth"
    : wealthMix.label === "investment-led" ? "Investment compounding"
    : wealthMix.label === "balanced"       ? "Balanced multi-engine"
    : "Mixed engines"
    : "—";

  // Most likely blocker — from preference vector.
  const blockerLabel = preferenceVec ? primaryDriverCopy(preferenceVec.primaryDriver) : "—";

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Live Signals</h3>
        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          <span className="relative inline-flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60" />
          </span>
          From ledger
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <SignalRow
          icon={<Gauge className="h-4 w-4" />}
          label="Confidence score"
          value={`${confidencePct}%`}
          valueTone={confidenceBand === "high" ? "green" : confidenceBand === "medium" ? "amber" : "red"}
        />
        <SignalRow
          icon={<Zap className="h-4 w-4" />}
          label="Strongest leverage"
          value={leverageLabel}
          valueTone="neutral"
        />
        <SignalRow
          icon={<Flag className="h-4 w-4" />}
          label="Most likely blocker"
          value={blockerLabel}
          valueTone="neutral"
        />
        <SignalRow
          icon={<Activity className="h-4 w-4" />}
          label="Path stability"
          value={stabilityLabel}
          valueTone={stabilityTone}
        />
      </div>
    </div>
  );
}

function SignalRow({ icon, label, value, valueTone }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueTone: "green" | "amber" | "red" | "neutral";
}) {
  const toneClass =
    valueTone === "green"  ? "text-emerald-700 dark:text-emerald-300" :
    valueTone === "amber"  ? "text-amber-700 dark:text-amber-300" :
    valueTone === "red"    ? "text-rose-700 dark:text-rose-300" :
    "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
      </span>
      <span className={`text-sm font-semibold ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

function WhatHappensNext() {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <h3 className="text-base font-semibold text-foreground">What happens next?</h3>
      <ol className="mt-3 space-y-3 text-sm">
        <NextStep n={1}>
          We run thousands of scenarios using <span className="font-medium text-foreground">Monte Carlo simulation</span>
        </NextStep>
        <NextStep n={2}>
          We evaluate probability of success, risk, and timeline
        </NextStep>
        <NextStep n={3}>
          You get a ranked action plan with clear next steps
        </NextStep>
      </ol>
    </div>
  );
}

function NextStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
        {n}
      </span>
      <span className="text-foreground/85">{children}</span>
    </li>
  );
}

function QuoteCard() {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
      <Quote className="h-5 w-5 text-violet-400 dark:text-violet-300/80" />
      <p className="mt-2 text-sm leading-relaxed text-foreground">
        The best plan is the one built around your life, not someone else's.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">— Family Wealth Lab</p>
    </div>
  );
}

function FooterCta({ allDone }: { allDone: boolean }) {
  return (
    <div className={`mt-6 flex flex-col items-start justify-between gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center ${
      allDone
        ? "border-violet-200 bg-violet-50/50 dark:border-violet-400/30 dark:bg-violet-500/10"
        : "border-border/70 bg-card"
    }`}>
      <div className="flex items-center gap-3">
        <Sparkles className={`h-5 w-5 ${allDone ? "text-violet-600 dark:text-violet-300" : "text-muted-foreground/70"}`} />
        <p className="text-sm text-foreground/90">
          {allDone
            ? "All set! We've captured your goals and constraints. Let's run the numbers and find your best paths."
            : "Confirm each card to unlock your ranked next moves in the Decision Lab."}
        </p>
      </div>
      <Button
        asChild
        size="lg"
        disabled={!allDone}
        className={allDone ? "bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400" : ""}
        data-testid="goal-lab-go-to-decision-lab"
      >
        <Link href="/decision-lab">
          Go to Decision Lab
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Helpers                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

function KvRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 py-1 text-sm last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-foreground">{v}</span>
    </div>
  );
}

function leverageColour(band: ReturnType<typeof buildCapitalStructureSnapshot> extends infer T
  ? T extends { leverageBand: infer B } ? B : never
  : never): string {
  switch (band) {
    case "conservative": return "text-emerald-700 dark:text-emerald-300";
    case "moderate":     return "text-blue-700 dark:text-blue-300";
    case "elevated":     return "text-amber-700 dark:text-amber-300";
    case "high":         return "text-rose-700 dark:text-rose-300";
    default:             return "text-foreground/85";
  }
}

function capitaliseFirst(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function bandLabel(b: "low" | "medium_low" | "medium" | "medium_high" | "high"): string {
  switch (b) {
    case "low":          return "Low";
    case "medium_low":   return "Medium-low";
    case "medium":       return "Medium";
    case "medium_high":  return "Medium-High";
    case "high":         return "High";
  }
}

function preferredEngineLabel(e: string): string {
  switch (e) {
    case "property":       return "Property-led";
    case "etf-stocks":     return "ETF / stocks-led";
    case "hybrid":         return "Hybrid — property + ETF";
    case "debt-reduction": return "Debt reduction first";
    case "unsure":         return "Undecided";
    default:               return "—";
  }
}

function constraintOverrideLabel(c: string): string {
  switch (c) {
    case "timeline-too-aggressive": return "Timeline too aggressive";
    case "savings-too-low":         return "Savings rate too low";
    case "debt-pressure":           return "Debt servicing pressure";
    case "liquidity-too-low":       return "Liquidity too low";
    case "concentration-high":      return "Concentration / overreliance";
    case "target-too-high":         return "Target passive income too high";
    case "growth-engine-low":       return "Growth engine too low";
    default:                        return "—";
  }
}

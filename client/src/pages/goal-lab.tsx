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
  Loader2, AlertCircle, X as XIcon,
  Activity, Zap, Gauge, Flag,
} from "lucide-react";

import AssumptionsPanel from "@/components/AssumptionsPanel";
import type { DashboardInputs } from "@/lib/dashboardDataContract";
import { useCanonicalGoal, type CanonicalGoal } from "@/lib/useCanonicalGoal";
import { computeCanonicalHeadlineMetrics } from "@/lib/canonicalHeadlineMetrics";
import { selectCanonicalFire, isFireGoalExplicitlySet } from "@/lib/canonicalFire";
import { formatCurrency } from "@/lib/finance";
import { readLatestGoalLabPlan } from "@/lib/goalLab/orchestrator";
import { buildRecommendationExplanation } from "@/lib/actionRoadmap/recommendationExplanation";
import { RecommendationExplainabilityPanel } from "@/components/actionRoadmap/RecommendationExplainabilityPanel";
import {
  computeGoalLabConfidence,
  type ConfidenceResult,
} from "@/lib/goalLab/goalLabConfidence";
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
import { RecommendedStrategyCard } from "@/components/RecommendedStrategyCard";

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
  /** Optional in Sprint 24 — readOnly cards (Q6) don't need an edit handler. */
  onEdit?: () => void;
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
  /**
   * Sprint 24 — some cards (Q6 blocker) are system-derived and not user-
   * editable. When true, the Edit button is hidden and only the Confirm
   * affordance is rendered. The card still flips to "confirmed" status.
   */
  readOnly?: boolean;
  /** Optional label for the confirm button when readOnly. Defaults to "Confirm" / "Confirmed". */
  confirmLabel?: { idle: string; confirmed: string };
}

function GoalLabCard(props: GoalLabCardShellProps) {
  const {
    index, tone, title, subtitle, icon, status, children,
    onEdit, onConfirm, onSaveEdit, editing, editingBody, saving, testId, sourceBadge,
    readOnly, confirmLabel,
  } = props;
  const handleSave = onSaveEdit ?? onConfirm;
  const confirmIdle = confirmLabel?.idle ?? "Looks good";
  const confirmDone = confirmLabel?.confirmed ?? "Confirmed";

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
            {readOnly ? (
              // Read-only card (e.g. Q6 system-derived blocker). No Edit button.
              <span
                className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                data-testid={`${testId}-readonly-tag`}
              >
                <Lock className="h-3 w-3" />
                System derived
              </span>
            ) : (
              <Button
                size="sm"
                onClick={onEdit}
                className={`text-white ${TONE_EDIT_BUTTON[tone]}`}
                data-testid={`${testId}-edit`}
              >
                <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                Edit
              </Button>
            )}
            <Button
              size="sm"
              variant={status === "confirmed" ? "ghost" : readOnly ? "default" : "ghost"}
              onClick={onConfirm}
              data-testid={`${testId}-looks-good`}
              className={
                status === "confirmed"
                  ? "text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                  : readOnly
                    ? `text-white ${TONE_EDIT_BUTTON[tone]}`
                    : "text-muted-foreground hover:bg-muted/50"
              }
            >
              <Check className={`mr-1.5 h-3.5 w-3.5 ${status === "confirmed" ? "text-emerald-600 dark:text-emerald-300" : ""}`} />
              {status === "confirmed" ? confirmDone : confirmIdle}
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
  // Higher-contrast dark variants: deeper saturated backgrounds and clearer
  // borders so info wells don't disappear into the card body.
  const bg =
    tone === "amber" ? "bg-amber-50/70 border-amber-100 dark:bg-amber-950/40 dark:border-amber-700/50" :
    tone === "rose"  ? "bg-rose-50/70 border-rose-100 dark:bg-rose-950/40 dark:border-rose-700/50" :
    "bg-muted/40 border-border/40 dark:bg-slate-900/60 dark:border-slate-700/60";
  return (
    <div className={`rounded-xl border p-3.5 text-sm leading-relaxed text-foreground/95 ${bg}`}>
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
    <div className="rounded-xl border border-dashed border-border/60 bg-muted/40 p-3.5 text-sm text-foreground/90 dark:border-slate-700/60 dark:bg-slate-900/60">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground dark:text-amber-300" />
        <div>
          <div className="font-medium text-foreground">{message}</div>
          <div className="mt-0.5 text-xs text-foreground/75 dark:text-foreground/80">{cta}</div>
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
    snapshot:       snapQ.data ?? null,
    properties:     propsQ.data ?? [],
    stocks:         stocksQ.data ?? [],
    cryptos:        cryptosQ.data ?? [],
    holdingsRaw:    holdingsQ.data ?? [],
    incomeRecords:  incomeQ.data ?? [],
    expenses:       expensesQ.data ?? [],
    // Sprint 31D — thread mc_fire_settings so selectMortgageRepayment can
    // fall back to mean_mortgage_rate when sf_snapshot lacks mortgage_rate.
    mcFireSettings: fireSettingsQ.data ?? null,
  }), [snapQ.data, propsQ.data, stocksQ.data, cryptosQ.data, holdingsQ.data, incomeQ.data, expensesQ.data, fireSettingsQ.data]);

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
  const toggleConfirmed = (k: DimKey) =>
    setConfirmed((c) => ({ ...c, [k]: !c[k] }));

  // ── Q1 / Q2 editable drafts ─────────────────────────────────────────────
  const goal = canonicalGoal.data;
  const [draftFireAge, setDraftFireAge] = React.useState<string>("");
  const [draftPassiveMonthly, setDraftPassiveMonthly] = React.useState<string>("");
  const [draftLifestyle, setDraftLifestyle] = React.useState<string>("comfortable");

  // Sprint 24 — editor key state. A small wrapper (defined below) seeds the
  // Q5 draft when the user opens the editor and is the single boundary that
  // closes the editor on Save / Cancel.
  const [editing, _setEditingRaw] = React.useState<DimKey | null>(null);

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

  // Sprint 24 — Q5 draft pattern. The previous implementation wrote the
  // select's onChange directly into `riskTolerance`, so a user who opened
  // the editor, picked a value, then clicked Cancel still had the value
  // committed silently. Worse, clicking Save (which fell back to onConfirm
  // → toggleConfirmed) didn't close the editor or give feedback. The draft
  // state below decouples editor UI from committed state: edit-time changes
  // go to `draftRiskTolerance`; Save commits + closes; Cancel discards.
  const [draftRiskTolerance, setDraftRiskTolerance] = React.useState<RiskTolerance>("auto");

  // Wrapper around _setEditingRaw — declared AFTER riskTolerance so the
  // closure captures the latest committed value when seeding the draft.
  const setEditing = React.useCallback((k: DimKey | null) => {
    _setEditingRaw((prev) => {
      // Opening Q5 → seed draft from committed value.
      if (k === "Q5" && prev !== "Q5") {
        setDraftRiskTolerance(riskTolerance);
      }
      return k;
    });
  }, [riskTolerance]);

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

  // ── Sprint 26 P1 — Real Goal Lab confidence ──────────────────────────────
  // We read the latest orchestrator plan from the in-memory cache (set by
  // Decision Lab when Run plan was clicked). No engine call here.
  const latestPlan = React.useMemo(() => readLatestGoalLabPlan(), [
    // Re-evaluate when confirmations / ledger / goal change so the panel
    // refreshes without forcing a re-run. The actual cache content updates
    // are pushed by Decision Lab; this is a passive read.
    confirmed, ledgerReady, goal,
  ]);
  const monthlySurplus = headline?.monthlySurplus ?? null;
  const confidence: ConfidenceResult = React.useMemo(
    () =>
      computeGoalLabConfidence({
        goal: goal ?? null,
        hasLedger: ledgerReady,
        netWorth: headline?.netWorth ?? null,
        monthlySurplus,
        confirmed,
        plan: latestPlan,
      }),
    [goal, ledgerReady, headline?.netWorth, monthlySurplus, confirmed, latestPlan],
  );

  // ── Sprint 26 P2 — Current Position (FIRE gap / progress / target year) ──
  const fire = React.useMemo(
    () => (ledgerReady ? selectCanonicalFire(dashboardInputs, goal) : null),
    [ledgerReady, dashboardInputs, goal],
  );
  const currentAge: number | null = React.useMemo(() => {
    const a = Number(fireSettingsQ.data?.current_age);
    return Number.isFinite(a) && a > 0 ? a : null;
  }, [fireSettingsQ.data?.current_age]);

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
            onSaveEdit={() => {
              setConfirmed((c) => ({ ...c, Q2: true }));
              _setEditingRaw(null);
              toast({ title: "Saved", description: "Monthly fuel confirmed." });
            }}
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
            onSaveEdit={() => {
              setConfirmed((c) => ({ ...c, Q3: true }));
              _setEditingRaw(null);
              toast({ title: "Saved", description: "Capital structure confirmed." });
            }}
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
            onSaveEdit={() => {
              // preferredEngine is bound directly to the store via the select onChange,
              // so any change is already persisted at the moment Save is clicked.
              setConfirmed((c) => ({ ...c, Q4: true }));
              _setEditingRaw(null);
              toast({
                title: "Saved",
                description: preferredEngine === "auto"
                  ? "Wealth engine preference cleared \u2014 using system inference."
                  : `Wealth engine set to ${preferredEngineLabel(preferredEngine)}.`,
              });
            }}
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
              <AnswerPanel>
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
            onSaveEdit={() => {
              // Sprint 24 — Q5 Save: commit draft → committed, mark confirmed,
              // close editor, and toast for feedback. The committed value
              // mirrors into the goalProfileStore via the existing useEffect
              // (line ~424) so engines pick it up immediately.
              setRiskTolerance(draftRiskTolerance);
              setConfirmed((c) => ({ ...c, Q5: true }));
              _setEditingRaw(null);
              toast({
                title: "Risk tolerance saved",
                description:
                  draftRiskTolerance === "auto"
                    ? "Using your inferred capacity from the ledger."
                    : `Set to ${draftRiskTolerance}. Decision Lab will respect this.`,
              });
            }}
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
                  value={draftRiskTolerance}
                  onChange={(e) => setDraftRiskTolerance(e.target.value as RiskTolerance)}
                  data-testid="goal-lab-q5-tolerance-select"
                  className="w-full rounded-md border border-border bg-background text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                >
                  <option value="auto">Use inferred capacity</option>
                  <option value="low">Low — prioritise safety, avoid drawdowns</option>
                  <option value="moderate">Moderate — balanced</option>
                  <option value="high">High — comfortable with volatility</option>
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Click <span className="font-medium text-foreground">Save</span> to apply. <span className="font-medium text-foreground">Cancel</span> discards changes.
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
                  <div className="mt-2 rounded-md border border-violet-200/60 bg-violet-50/60 px-2.5 py-1.5 text-xs text-violet-900 dark:border-violet-500/40 dark:bg-violet-950/40 dark:text-violet-100">
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

          {/* Q6 ── Preference vector (system-inferred, read-only) ──────── */}
          <GoalLabCard
            index={6}
            tone="teal"
            title="What is currently blocking your path to FIRE?"
            subtitle="System-derived from your ledger, cashflow, leverage and risk capacity. Confirm to lock in."
            icon={<Lock className="h-5 w-5" />}
            status={confirmed.Q6 ? "confirmed" : preferenceVec ? "inferred" : "missing"}
            onConfirm={() => toggleConfirmed("Q6")}
            editing={false}
            readOnly
            confirmLabel={{ idle: "Confirm diagnosis", confirmed: "Diagnosis confirmed" }}
            testId="goal-lab-q6"
            sourceBadge={
              confirmed.Q6 ? "confirmed" :
              preferenceVec ? "estimated" :
              "needs-confirmation"
            }
          >
            {preferenceVec ? (
              <AnswerPanel>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Biggest constraint (system-inferred)</div>
                <div className="mt-1 font-semibold text-rose-700 dark:text-rose-300">
                  {primaryDriverCopy(preferenceVec.primaryDriver)}
                </div>
                <p className="mt-2 text-foreground/95">
                  {buildBlockerDiagnosis(preferenceVec, riskCapacity)}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <SignalChip label="Liquidity" band={preferenceVec.signals.liquidityStressBand} />
                  <SignalChip label="Leverage pressure" band={preferenceVec.signals.leveragePressureBand} />
                  <SignalChip label="Savings consistency" band={preferenceVec.signals.savingsConsistencyBand} />
                  <SignalChip label="Risk capacity" band={riskCapacity?.band ?? null} />
                </div>
                <p className="mt-3 text-foreground/85">
                  Plan weighting:{" "}
                  <span className="font-semibold">safety {Math.round(preferenceVec.safety * 100)}%</span>,
                  speed {Math.round(preferenceVec.speed * 100)}%,
                  flexibility {Math.round(preferenceVec.flexibility * 100)}%,
                  lifestyle {Math.round(preferenceVec.lifestyle * 100)}%.
                </p>
                <SourceTag>System-derived — not user-selectable</SourceTag>
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
          {/* Sprint 26 P2 — Current Position (FIRE numbers from Goal Closure) */}
          <CurrentPositionPanel
            goal={goal ?? null}
            netWorth={headline?.netWorth ?? null}
            fire={fire}
            currentAge={currentAge}
          />
          {/* Sprint 26 P1 — Real confidence (replaces fake placeholder) */}
          <ConfidencePanel confidence={confidence} />
          {/* Sprint 28 — Recommended Strategy handoff to /action-roadmap.
              Goal Lab no longer renders milestones, accelerators, risk axes, or
              path-completion — those live exclusively on the Action Roadmap. */}
          {latestPlan?.picks?.recommended ? (
            <RecommendedStrategyCard
              pick={latestPlan.picks.recommended}
              rationale={latestPlan.picks.recommendedRationale}
            />
          ) : null}
          {/* Sprint 30B Step 2 — Recommendation Explainability mounted from the
              SAME plan object. Goal Lab, Decision Lab, and Action Roadmap all
              read from one source so the surfaces cannot drift. */}
          {latestPlan ? (
            <RecommendationExplainabilityPanel
              explanation={buildRecommendationExplanation({
                plan: latestPlan,
                startAge: latestPlan.profile.fire.currentAge ?? null,
                fireTarget:
                  latestPlan.profile.fire.targetPassiveAnnual != null &&
                  latestPlan.profile.fire.swrPct != null &&
                  latestPlan.profile.fire.swrPct > 0
                    ? latestPlan.profile.fire.targetPassiveAnnual / (latestPlan.profile.fire.swrPct / 100)
                    : null,
                swrPct: latestPlan.profile.fire.swrPct ?? null,
              })}
            />
          ) : null}
          <SummaryPanel
            completed={completed}
            confirmed={confirmed}
            statuses={{
              Q1: confirmed.Q1 ? "confirmed" : goal?.status === "SET" ? "inferred" : "missing",
              Q2: confirmed.Q2 ? "confirmed" : headline ? "inferred" : "missing",
              Q3: confirmed.Q3 ? "confirmed" : capital ? "inferred" : "missing",
              Q4: confirmed.Q4 ? "confirmed" : wealthMix ? "inferred" : "missing",
              Q5: confirmed.Q5 ? "confirmed" : riskCapacity ? "inferred" : "missing",
              Q6: confirmed.Q6 ? "locked-confirmed" : preferenceVec ? "locked-inferred" : "missing",
            }}
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

/**
 * Sprint 25 — human-language Summary rows.
 * Every row reads in plain English and explains where the data came from in
 * one short sentence. Targets a non-finance user understanding the row in
 * ≤3 seconds.
 */
const DIM_META: Array<{
  key: DimKey;
  label: string;
  source: string;
  icon: React.ReactNode;
}> = [
  { key: "Q1", label: "Your FIRE Goal",       source: "Set by you \u2014 target retirement age and income",      icon: <Target className="h-4 w-4" /> },
  { key: "Q2", label: "Monthly Savings",      source: "Derived from your income and expenses",                  icon: <TrendingUp className="h-4 w-4" /> },
  { key: "Q3", label: "Available Capital",    source: "Estimated from your assets, debts and liquidity",        icon: <PieChart className="h-4 w-4" /> },
  { key: "Q4", label: "Wealth Engine",        source: "Based on where your wealth is currently growing",        icon: <Rocket className="h-4 w-4" /> },
  { key: "Q5", label: "Risk Capacity",        source: "Calculated automatically from your finances",           icon: <Shield className="h-4 w-4" /> },
  { key: "Q6", label: "Biggest Blocker",      source: "Identified automatically \u2014 what to solve first",     icon: <Lock className="h-4 w-4" /> },
];

function StatusChip({ status }: { status: SummaryStatus }) {
  // Sprint 25 — plain English status chip. No jargon (no "inferred",
  // "derived", "engine", "signal").
  const map: Record<SummaryStatus, { label: string; cls: string }> = {
    "confirmed":        { label: "Confirmed",         cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200" },
    "inferred":         { label: "Please review",     cls: "border-amber-500/40 bg-amber-500/15 text-amber-900 dark:text-amber-100" },
    "locked-confirmed": { label: "Confirmed",         cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200" },
    "locked-inferred":  { label: "Please review",     cls: "border-amber-500/40 bg-amber-500/15 text-amber-900 dark:text-amber-100" },
    "missing":          { label: "Needs data",         cls: "border-border bg-muted/40 text-muted-foreground" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {status === "confirmed" || status === "locked-confirmed" ? <Check className="h-2.5 w-2.5" /> : null}
      {label}
    </span>
  );
}

/* ── Sprint 26 P2 — Current Position panel ─────────────────────────────── *
 * Replaces the Goal Closure MOVE card. Shows four headline FIRE numbers          *
 * computed from the same canonical selectors the rest of the app uses:           *
 *   • Progress to FIRE  — NW ÷ FIRE number (selectCanonicalFire)                  *
 *   • FIRE gap          — FIRE number − NW                                       *
 *   • Target year       — today + (targetFireAge − currentAge)                    *
 *   • Years remaining   — targetFireAge − currentAge                              *
 *                                                                                *
 * When the goal isn't set we suppress goal-derived figures rather than           *
 * invent defaults — same contract as Action Centre / Goal Closure Lab.           */
function CurrentPositionPanel({
  goal, netWorth, fire, currentAge,
}: {
  goal: CanonicalGoal | null;
  netWorth: number | null;
  fire: ReturnType<typeof selectCanonicalFire> | null;
  currentAge: number | null;
}) {
  const goalSet = isFireGoalExplicitlySet(goal);
  const fireNumber = fire?.fireNumber && fire.fireNumber > 0 ? fire.fireNumber : null;
  const progressPct =
    goalSet && netWorth !== null && fireNumber !== null
      ? Math.max(0, Math.min(100, (netWorth / fireNumber) * 100))
      : null;
  const gap = goalSet ? (fire?.gap ?? null) : null;
  const targetFireAge =
    goalSet && goal && goal.status === "SET" ? goal.targetFireAge : null;
  const yearsRemaining =
    targetFireAge !== null && currentAge !== null
      ? Math.max(0, targetFireAge - currentAge)
      : null;
  const targetYear =
    yearsRemaining !== null ? new Date().getFullYear() + yearsRemaining : null;

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm" data-testid="goal-lab-current-position">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Current Position</h3>
        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          <Activity className="h-3 w-3" />
          From ledger
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <PositionCell
          label="Progress to FIRE"
          value={progressPct !== null ? `${progressPct.toFixed(0)}%` : "—"}
          hint={!goalSet ? "Set FIRE goal in Q1" : netWorth === null ? "Ledger missing" : null}
          testId="gl-cp-progress"
        />
        <PositionCell
          label="FIRE gap"
          value={gap !== null ? (gap > 0 ? formatCurrency(gap) : "On target") : "—"}
          hint={!goalSet ? "Set FIRE goal in Q1" : null}
          testId="gl-cp-gap"
        />
        <PositionCell
          label="Target year"
          value={targetYear !== null ? String(targetYear) : "—"}
          hint={
            !goalSet ? "Set FIRE goal in Q1"
            : currentAge === null ? "Save current age in Settings"
            : null
          }
          testId="gl-cp-target-year"
        />
        <PositionCell
          label="Years remaining"
          value={yearsRemaining !== null ? `${yearsRemaining} yr${yearsRemaining === 1 ? "" : "s"}` : "—"}
          hint={
            !goalSet ? "Set FIRE goal in Q1"
            : currentAge === null ? "Save current age in Settings"
            : null
          }
          testId="gl-cp-years-remaining"
        />
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground/80">
        Same numbers as <Link href="/goal-closure-lab"><span className="underline text-foreground">Goal Closure Lab</span></Link> — powered by canonical selectors.
      </p>
    </div>
  );
}

function PositionCell({
  label, value, hint, testId,
}: { label: string; value: string; hint: string | null; testId: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 dark:bg-slate-900/40 p-3" data-testid={testId}>
      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-semibold text-foreground">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</div> : null}
    </div>
  );
}

/* ── Sprint 26 P1 — Confidence panel ──────────────────────────────────── *
 * Real Goal Lab trust score. Shows the band (High / Medium / Low) and the        *
 * numeric score, plus a "Why" list of the six signals with tick / X marks.       *
 * NO fabricated probability — if MC didn't produce a P50 the row says            *
 * "Probability unavailable" rather than inventing a number.                      */
function ConfidencePanel({ confidence }: { confidence: ConfidenceResult }) {
  const { score, band, signals } = confidence;
  const bandColor =
    band === "High"   ? "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/15 ring-emerald-200 dark:ring-emerald-400/30" :
    band === "Medium" ? "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 ring-amber-200 dark:ring-amber-400/30" :
                        "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/15 ring-rose-200 dark:ring-rose-400/30";
  const trackBg =
    band === "High"   ? "bg-emerald-500" :
    band === "Medium" ? "bg-amber-500"   :
                        "bg-rose-500";
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm" data-testid="goal-lab-confidence">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground">Confidence</h3>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${bandColor}`}
          data-testid="goal-lab-confidence-band"
        >
          {band} ({score}%)
        </span>
      </div>
      {/* Score track — simple horizontal bar mirroring the band colour. */}
      <div className="mt-3 h-1.5 w-full rounded-full bg-muted/60 dark:bg-slate-800/80 overflow-hidden">
        <div
          className={`h-full ${trackBg} transition-all`}
          style={{ width: `${Math.max(2, Math.min(100, score))}%` }}
          data-testid="goal-lab-confidence-track"
        />
      </div>
      <div className="mt-4 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">Why</div>
      <ul className="mt-2 space-y-1.5" data-testid="goal-lab-confidence-why">
        {signals.map((s) => (
          <li key={s.id} className="flex items-start gap-2 text-sm">
            {s.ok ? (
              <Check className="mt-0.5 h-4 w-4 flex-none text-emerald-600 dark:text-emerald-300" />
            ) : (
              <XIcon className="mt-0.5 h-4 w-4 flex-none text-muted-foreground/70" />
            )}
            <div className="min-w-0">
              <div className={`font-medium ${s.ok ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</div>
              <div className="text-[12px] text-muted-foreground/85 leading-snug">{s.detail}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

type SummaryStatus =
  | "confirmed"          // user explicitly confirmed
  | "inferred"           // system has a value; user hasn't confirmed yet
  | "locked-confirmed"   // system-derived AND user confirmed (e.g. Q6)
  | "locked-inferred"    // system-derived, awaiting confirm (e.g. Q6)
  | "missing";           // no data

function SummaryPanel({ completed, confirmed, statuses }: {
  completed: number;
  confirmed: Record<DimKey, boolean>;
  statuses: Record<DimKey, SummaryStatus>;
}) {
  const inferredCount = (Object.values(statuses) as SummaryStatus[])
    .filter((s) => s === "inferred" || s === "locked-inferred")
    .length;
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

      <p className="mb-1 text-center text-sm text-foreground/80">
        {completed === 0 ? "Start with any card that feels easiest." :
         completed === 6 ? <span><span className="font-semibold text-foreground">Great job.</span> You've completed your Goal Lab.</span> :
         "Keep going — review and confirm each row."}
      </p>
      {inferredCount > 0 && completed < 6 ? (
        <p className="mb-3 text-center text-xs text-amber-700 dark:text-amber-300">
          {inferredCount} {inferredCount === 1 ? "row is" : "rows are"} ready for you to review.
        </p>
      ) : <div className="mb-3" />}

      <ul className="space-y-2.5">
        {DIM_META.map((d) => {
          const s = statuses[d.key];
          return (
            <li key={d.key} className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 dark:bg-slate-900/40">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span className="text-muted-foreground/80">{d.icon}</span>
                    {d.label}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {d.source}
                  </div>
                </div>
                <StatusChip status={s} />
              </div>
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
  // Sprint 26 P1 — the dedicated <ConfidencePanel/> is now the canonical
  // surface for the trust score. We deliberately drop the old blended
  // "Confidence score" row from this panel to avoid two competing numbers.
  const { riskCapacity, preferenceVec, wealthMix } = props;

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

type PrefVec = import("@/lib/goalLab/inferences").PreferenceVectorInference;
type RiskCap = import("@/lib/goalLab/inferences").RiskCapacityInference;

function buildBlockerDiagnosis(
  pv: PrefVec,
  rc: RiskCap | null,
): string {
  const liq = pv.signals.liquidityStressBand;
  const lev = pv.signals.leveragePressureBand;
  const sav = pv.signals.savingsConsistencyBand;
  const risk = rc?.band ?? null;

  const parts: string[] = [];
  if (liq === "red") {
    parts.push("your liquidity buffer is red \u2014 cash runway is too thin to absorb a shock");
  } else if (liq === "amber") {
    parts.push("your liquidity buffer is amber \u2014 some runway, but not enough for a confident new position");
  }
  if (lev === "red") {
    parts.push("leverage pressure is red \u2014 existing debt servicing is already stretched");
  } else if (lev === "amber") {
    parts.push("leverage pressure is amber \u2014 adding more debt would raise serviceability risk");
  }
  if (sav === "low") {
    parts.push("savings consistency is low \u2014 the growth engine isn\u2019t reliably feeding the plan yet");
  }
  if (risk === "low" || risk === "medium_low") {
    parts.push("risk capacity is on the low side \u2014 the plan can\u2019t afford a large drawdown right now");
  }

  let lead: string;
  switch (pv.primaryDriver) {
    case "liquidity_buffer":
      lead = "Buffer building should come before new positions.";
      break;
    case "leverage_headroom":
      lead = "Reducing debt pressure should come before stacking more leverage.";
      break;
    case "savings_rate_and_cashflow":
      lead = "Lifting savings rate and cashflow is the highest-leverage move right now.";
      break;
    case "lifestyle_protection":
      lead = "Protecting lifestyle resilience is the binding constraint right now.";
      break;
    default:
      lead = "Your plan is reasonably balanced \u2014 the smallest gap is what to solve next.";
  }

  if (parts.length === 0) {
    return `${lead} No red or amber signals on liquidity, leverage or savings \u2014 the binding constraint is structural rather than acute.`;
  }
  const tail = parts.join("; ");
  return `${lead} The diagnosis: ${tail}.`;
}

function SignalChip({
  label,
  band,
}: {
  label: string;
  band:
    | "green" | "amber" | "red"
    | "low" | "medium" | "high"
    | "medium_low" | "medium_high"
    | null;
}) {
  const norm =
    band === "green" || band === "high" ? "good" :
    band === "amber" || band === "medium" || band === "medium_high" ? "warn" :
    band === "red" || band === "low" || band === "medium_low" ? "bad" :
    "unknown";
  const styles =
    norm === "good" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200" :
    norm === "warn" ? "border-amber-500/40 bg-amber-500/15 text-amber-800 dark:text-amber-200" :
    norm === "bad"  ? "border-rose-500/40 bg-rose-500/15 text-rose-800 dark:text-rose-200" :
                      "border-slate-400/40 bg-slate-500/10 text-slate-700 dark:text-slate-200";
  const bandText =
    band === null ? "\u2014" :
    band === "medium_low" ? "med-low" :
    band === "medium_high" ? "med-high" :
    band;
  return (
    <div className={`flex items-center justify-between rounded-md border px-2 py-1 ${styles}`}>
      <span className="font-medium">{label}</span>
      <span className="capitalize">{bandText}</span>
    </div>
  );
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

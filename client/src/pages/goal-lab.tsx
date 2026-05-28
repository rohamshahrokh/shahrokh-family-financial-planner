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
  Check, Edit3, ArrowRight, Sparkles, Quote, CalendarClock,
  Loader2, AlertCircle,
} from "lucide-react";

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

/* ────────────────────────────────────────────────────────────────────────── */
/* Card primitive                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

type CardTone = "violet" | "emerald" | "blue" | "amber" | "rose" | "teal";

const TONE_CHIP: Record<CardTone, string> = {
  violet:  "bg-violet-100 text-violet-700 ring-violet-200",
  emerald: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  blue:    "bg-blue-100 text-blue-700 ring-blue-200",
  amber:   "bg-amber-100 text-amber-700 ring-amber-200",
  rose:    "bg-rose-100 text-rose-700 ring-rose-200",
  teal:    "bg-teal-100 text-teal-700 ring-teal-200",
};

const TONE_EDIT_BUTTON: Record<CardTone, string> = {
  violet:  "bg-violet-600 hover:bg-violet-700",
  emerald: "bg-emerald-600 hover:bg-emerald-700",
  blue:    "bg-blue-600 hover:bg-blue-700",
  amber:   "bg-amber-500 hover:bg-amber-600",
  rose:    "bg-rose-600 hover:bg-rose-700",
  teal:    "bg-teal-600 hover:bg-teal-700",
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
}

function GoalLabCard(props: GoalLabCardShellProps) {
  const {
    index, tone, title, subtitle, icon, status, children,
    onEdit, onConfirm, onSaveEdit, editing, editingBody, saving, testId,
  } = props;
  const handleSave = onSaveEdit ?? onConfirm;

  return (
    <div
      data-testid={testId}
      className="relative flex flex-col rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-3 p-5 pb-3">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset ${TONE_CHIP[tone]}`}
          aria-hidden
        >
          {index}
        </span>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            {subtitle}
          </p>
        </div>
        <span className="mt-1 text-slate-400" aria-hidden>
          {icon}
        </span>
      </div>

      <div className="px-5 pb-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          {editing ? "Edit answer" : "Current answer"}
        </div>
        {editing ? editingBody : children}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
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
                  ? "text-emerald-700 hover:bg-emerald-50"
                  : "text-slate-600 hover:bg-slate-50"
              }
            >
              <Check className={`mr-1.5 h-3.5 w-3.5 ${status === "confirmed" ? "text-emerald-600" : ""}`} />
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
  const bg =
    tone === "amber" ? "bg-amber-50/70 border-amber-100" :
    tone === "rose"  ? "bg-rose-50/70 border-rose-100" :
    "bg-slate-50/70 border-slate-100";
  return (
    <div className={`rounded-xl border p-3.5 text-sm leading-relaxed ${bg}`}>
      {children}
    </div>
  );
}

function SourceTag({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200/70">
      <Check className="h-3 w-3" />
      {children}
    </div>
  );
}

function MissingState({ message, cta }: { message: string; cta: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/40 p-3.5 text-sm text-slate-600">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div>
          <div className="font-medium text-slate-700">{message}</div>
          <div className="mt-0.5 text-xs text-slate-500">{cta}</div>
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
                    className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
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
                <div className="font-medium text-slate-900">
                  FIRE at age {goal.targetFireAge}{" "}
                  <span className="font-normal text-slate-500">
                    ({new Date().getFullYear() + Math.max(0, goal.targetFireAge - 35)})
                  </span>
                </div>
                <div className="mt-1 text-slate-700">
                  Passive income: {formatCurrency(goal.targetPassiveAnnual)} / year
                </div>
                <div className="text-slate-700">
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
            editingBody={
              <div className="space-y-2">
                <p className="text-xs text-slate-500">
                  Monthly surplus is read directly from your income + expense ledger.
                  To change it, update your income or recurring expenses in the ledger.
                </p>
                <div className="rounded-md bg-slate-50 p-2.5 text-xs text-slate-600">
                  Current: <span className="font-semibold text-slate-900">
                    {headline ? formatCurrency(headline.monthlySurplus) : "—"} / month
                  </span>
                </div>
              </div>
            }
          >
            {headline ? (
              <AnswerPanel>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Estimated surplus</div>
                <div className="mt-1 text-xl font-semibold text-slate-900">
                  {formatCurrency(headline.monthlySurplus)}{" "}
                  <span className="text-sm font-normal text-slate-500">/ month</span>
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
            editingBody={
              <p className="text-xs text-slate-500">
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
            editingBody={
              <p className="text-xs text-slate-500">
                Wealth engine mix is derived from your ledger. Edit your income,
                properties, or investments to shift the mix.
              </p>
            }
          >
            {wealthMix ? (
              <AnswerPanel tone="amber">
                <div className="font-semibold capitalize text-slate-900">
                  {wealthMix.label.replace("-", " ")} engine
                </div>
                <ul className="mt-1.5 space-y-0.5 text-slate-700">
                  <li>• Salary &amp; bonuses ({wealthMix.salaryAndBonusesPct.toFixed(0)}%)</li>
                  <li>• Property ({wealthMix.propertyPct.toFixed(0)}%)</li>
                  <li>• Investments ({wealthMix.investmentsPct.toFixed(0)}%)</li>
                </ul>
                <div className={`mt-2 text-xs font-semibold ${
                  wealthMix.convictionTag === "high"   ? "text-amber-700" :
                  wealthMix.convictionTag === "medium" ? "text-amber-600" :
                  "text-slate-500"
                }`}>
                  {wealthMix.convictionTag === "high"   ? "High conviction" :
                   wealthMix.convictionTag === "medium" ? "Medium conviction" :
                   "Diversified mix"}
                </div>
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
            editingBody={
              <p className="text-xs text-slate-500">
                Risk capacity is derived from your liquidity buffer, debt service,
                and current asset mix. Override coming in the next phase.
              </p>
            }
          >
            {riskCapacity ? (
              <AnswerPanel>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Risk capacity</div>
                <div className="mt-1 font-semibold text-violet-700">
                  {bandLabel(riskCapacity.band)}
                </div>
                <p className="mt-1 text-slate-700">
                  Plan can survive a {(riskCapacity.drawdownToleranceP * 100).toFixed(0)}% portfolio
                  drawdown and {riskCapacity.incomeLossEnduranceMonths} months
                  income loss.
                </p>
                <p className="text-slate-700">
                  Comfort with leverage: <span className="capitalize">{riskCapacity.leverageComfort}</span>.
                </p>
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
            editingBody={
              <p className="text-xs text-slate-500">
                The inferred answer is based on five signals from your ledger.
                Manual override comes in the next phase.
              </p>
            }
          >
            {preferenceVec ? (
              <AnswerPanel tone="rose">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Biggest constraint</div>
                <div className="mt-1 font-semibold text-rose-700">
                  {primaryDriverCopy(preferenceVec.primaryDriver)}
                </div>
                <p className="mt-1 text-slate-700">
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
          <WhatHappensNext />
          <QuoteCard />
          <BookACallPlaceholder />
        </aside>
      </div>

      {/* ── Footer CTA banner ─────────────────────────────────────────── */}
      <FooterCta allDone={allDone} />

      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
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
  return (
    <header className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-violet-50/40 p-6 sm:p-7">
      <div className="flex items-start justify-between gap-6">
        <div className="max-w-2xl">
          <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-violet-700">
            Goals-Based Wealth Planning · Behavioural Finance · Monte Carlo Forecasting
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <Target className="h-6 w-6 text-violet-600" />
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Goal Lab
            </h1>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Let's build your personalised path to <span className="font-semibold text-slate-800">Financial Independence</span>.
            Answer 6 key questions. We'll do the heavy lifting.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            An institutional-style framework for understanding your path to financial independence.
          </p>
        </div>
        <div className="hidden h-24 w-44 shrink-0 rounded-xl bg-gradient-to-br from-violet-100 via-sky-100 to-emerald-50 sm:block" aria-hidden />
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
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <h3 className="text-base font-semibold text-slate-900">Your Summary</h3>
        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
          Preview
        </span>
      </div>

      <div className="my-4 flex justify-center">
        <div className="relative">
          <svg width="120" height="120" className="-rotate-90">
            <circle cx="60" cy="60" r="42" stroke="#e2e8f0" strokeWidth="10" fill="none" />
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
            <div className="text-lg font-bold text-violet-700">{completed}/6</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Completed</div>
          </div>
        </div>
      </div>

      <p className="mb-3 text-center text-sm text-slate-600">
        {completed === 0 ? "Start with any card that feels easiest." :
         completed === 6 ? <span><span className="font-semibold text-slate-900">Great job!</span> You've completed your Goal Lab.</span> :
         "Keep going — confirm each card when it looks right."}
      </p>

      <ul className="space-y-1.5">
        {DIM_META.map((d) => {
          const isDone = confirmed[d.key];
          return (
            <li key={d.key} className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-2 text-slate-700">
                <span className="text-slate-400">{d.icon}</span>
                {d.label}
              </span>
              <span className={
                isDone
                  ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"
                  : "h-5 w-5 rounded-full border border-slate-200"
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

function WhatHappensNext() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">What happens next?</h3>
      <ol className="mt-3 space-y-3 text-sm">
        <NextStep n={1}>
          We run thousands of scenarios using <span className="font-medium text-slate-800">Monte Carlo simulation</span>
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
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11px] font-semibold text-violet-700">
        {n}
      </span>
      <span className="text-slate-700">{children}</span>
    </li>
  );
}

function QuoteCard() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-violet-50/50 to-slate-50 p-5 shadow-sm">
      <Quote className="h-5 w-5 text-violet-400" />
      <p className="mt-2 text-sm leading-relaxed text-slate-800">
        The best plan is the one built around your life, not someone else's.
      </p>
      <p className="mt-2 text-xs text-slate-500">— Family Wealth Lab</p>
    </div>
  );
}

function BookACallPlaceholder() {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Need help?</h3>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <CalendarClock className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-medium text-slate-800">Talk to a planner</div>
          <div className="text-xs text-slate-500">Coming soon</div>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled
        className="mt-3 w-full"
        data-testid="goal-lab-book-a-call"
      >
        Book a call
      </Button>
    </div>
  );
}

function FooterCta({ allDone }: { allDone: boolean }) {
  return (
    <div className={`mt-6 flex flex-col items-start justify-between gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center ${
      allDone
        ? "border-violet-200 bg-violet-50/50"
        : "border-slate-200 bg-white"
    }`}>
      <div className="flex items-center gap-3">
        <Sparkles className={`h-5 w-5 ${allDone ? "text-violet-600" : "text-slate-400"}`} />
        <p className="text-sm text-slate-700">
          {allDone
            ? "All set! We've captured your goals and constraints. Let's run the numbers and find your best paths."
            : "Confirm each card to unlock your ranked next moves in the Decision Lab."}
        </p>
      </div>
      <Button
        asChild
        size="lg"
        disabled={!allDone}
        className={allDone ? "bg-violet-600 text-white hover:bg-violet-700" : ""}
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
    <div className="flex items-center justify-between border-b border-slate-100 py-1 text-sm last:border-0">
      <span className="text-slate-600">{k}</span>
      <span className="font-medium text-slate-900">{v}</span>
    </div>
  );
}

function leverageColour(band: ReturnType<typeof buildCapitalStructureSnapshot> extends infer T
  ? T extends { leverageBand: infer B } ? B : never
  : never): string {
  switch (band) {
    case "conservative": return "text-emerald-700";
    case "moderate":     return "text-blue-700";
    case "elevated":     return "text-amber-700";
    case "high":         return "text-rose-700";
    default:             return "text-slate-700";
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

/**
 * wealth-strategy.tsx
 * Shahrokh Family Financial Planner — Wealth Strategy Hub (Rearchitecture v1)
 *
 * Executive orchestration layer. NOT a calculator. Reads from existing
 * engines/source data, summarises household position, identifies priorities,
 * and routes users to the correct source-of-truth page for deeper work.
 *
 * Architecture:
 *   1. Executive Overview  — status, top 3 priorities, key risk, next best action
 *   2. Financial Health    — Emergency Buffer / Debt Position / Cashflow / Data Quality
 *   3. Wealth Building     — Financial Freedom Path / Property Strategy / Investment Strategy
 *   4. Optimisation        — Tax Position / Debt Optimisation / Scenario Readiness
 *   5. Advanced Analytics  — collapsed; deep links to Forecast / MC / Decision / CGT
 *
 * Source-of-truth routes:
 *   /dashboard               Snapshot, current net worth, asset/liability balances
 *   /data-health             Data quality and freshness
 *   /property                Property Plan (LVR, deposits, cashflow, property tax)
 *   /stocks /crypto          DCA / allocation plans
 *   /debt-strategy           Debt payoff, avalanche/snowball, refinance
 *   /tax                     Tax Strategy (income tax, negative gearing, optimisation)
 *   /cgt-simulator           CGT modelling
 *   /ai-forecast-engine      Forecast Engine (deterministic + Monte Carlo + stress)
 *   /decision                Decision Engine (scenario ranking, Quick Decision)
 *   /financial-plan          FIRE Path / Financial Freedom plan
 *   /timeline                Net Worth Timeline
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import AssumptionsPanel from "@/components/AssumptionsPanel";
import {
  Target,
  Shield,
  CreditCard,
  Wallet,
  HeartPulse,
  Flame,
  Home,
  TrendingUp,
  Calculator,
  Layers,
  Sparkles,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Info,
  Sigma,
  Atom,
  LineChart as LineChartIcon,
  BarChart2,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const safeNum = (v: unknown): number => {
  const n = parseFloat(String(v ?? 0));
  return isNaN(n) ? 0 : n;
};

const fmtAUD = (v: number, frac = 0) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: frac,
  }).format(v);

type Status = "good" | "warn" | "risk" | "neutral";

const STATUS_TONE: Record<Status, { dot: string; label: string; chip: string }> = {
  good: {
    dot: "bg-emerald-500",
    label: "On track",
    chip: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
  },
  warn: {
    dot: "bg-amber-500",
    label: "Attention",
    chip: "bg-amber-500/10 text-amber-500 border-amber-500/30",
  },
  risk: {
    dot: "bg-rose-500",
    label: "Action needed",
    chip: "bg-rose-500/10 text-rose-500 border-rose-500/30",
  },
  neutral: {
    dot: "bg-muted-foreground/50",
    label: "Informational",
    chip: "bg-muted/40 text-muted-foreground border-border",
  },
};

// ─── Reusable section primitives ──────────────────────────────────────────────

function SectionHeader({
  step,
  title,
  intent,
  rationale,
}: {
  step: string;
  title: string;
  intent: string;
  rationale?: string;
}) {
  return (
    <header className="mb-4 sm:mb-5">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary/80">
          {step}
        </span>
        <h2 className="text-lg sm:text-xl font-bold text-foreground">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{intent}</p>
      {rationale && (
        <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">
          {rationale}
        </p>
      )}
    </header>
  );
}

function StatusChip({ status }: { status: Status }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${tone.chip}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
      {tone.label}
    </span>
  );
}

function HubCard({
  icon: Icon,
  title,
  status,
  keyMetric,
  metricLabel,
  narrative,
  href,
  ctaLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  status: Status;
  keyMetric: string;
  metricLabel: string;
  narrative: string;
  href: string;
  ctaLabel: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 flex flex-col gap-3 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 w-8 h-8 rounded-lg bg-primary/10 text-primary inline-flex items-center justify-center">
            <Icon className="w-4 h-4" />
          </span>
          <h3 className="text-sm sm:text-[15px] font-semibold text-foreground truncate">
            {title}
          </h3>
        </div>
        <StatusChip status={status} />
      </div>

      <div>
        <div className="text-xl sm:text-2xl font-bold text-foreground leading-tight">
          {keyMetric}
        </div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80 mt-0.5">
          {metricLabel}
        </div>
      </div>

      <p className="text-[13px] text-muted-foreground leading-relaxed flex-1">
        {narrative}
      </p>

      <Link href={href}>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between text-xs h-9 border-border hover:border-primary/40 hover:bg-primary/5"
        >
          <span className="truncate">{ctaLabel}</span>
          <ArrowRight className="w-3.5 h-3.5 shrink-0" />
        </Button>
      </Link>
    </div>
  );
}

// ─── Priority assessment (derived from existing data, no new formulas) ────────

type Priority = {
  rank: 1 | 2 | 3;
  title: string;
  reason: string;
  impact: string;
  urgency: Status;
  href: string;
  ctaLabel: string;
};

function buildPriorities(input: {
  monthsBuffer: number;
  bufferTargetMonths: number;
  expensiveDebt: number;
  totalDebt: number;
  savingsRate: number;
  netWorth: number;
  fireProgressPct: number;
  hasHighInterestDebt: boolean;
  liquidity: number;
  monthlyExpenses: number;
}): Priority[] {
  const out: Priority[] = [];

  // 1. Emergency liquidity is the first constraint
  if (input.monthsBuffer < input.bufferTargetMonths) {
    out.push({
      rank: 1,
      title: "Strengthen emergency liquidity",
      reason: `Cash buffer covers ${input.monthsBuffer.toFixed(1)} months of expenses — target is ${input.bufferTargetMonths} months.`,
      impact: "Protects the plan against income shocks before any new leverage is added.",
      urgency: input.monthsBuffer < 3 ? "risk" : "warn",
      href: "/dashboard",
      ctaLabel: "Open Snapshot",
    });
  }

  // 2. High-interest debt
  if (input.hasHighInterestDebt) {
    out.push({
      rank: (out.length + 1) as 1 | 2 | 3,
      title: "Reduce expensive debt exposure",
      reason: `Non-mortgage / high-rate debt is dragging compounding power on the asset side.`,
      impact: "Each dollar redirected from expensive debt typically beats market returns risk-free.",
      urgency: "warn",
      href: "/debt-strategy",
      ctaLabel: "Review Debt Strategy",
    });
  }

  // 3. Cashflow / savings rate
  if (input.savingsRate < 15) {
    out.push({
      rank: (out.length + 1) as 1 | 2 | 3,
      title: "Lift household savings rate",
      reason: `Current savings rate is ${input.savingsRate.toFixed(0)}% of income — sustainable growth typically needs 20%+.`,
      impact: "Improves Forecast Engine outputs and unlocks investment optionality.",
      urgency: input.savingsRate < 5 ? "risk" : "warn",
      href: "/budget",
      ctaLabel: "Open Cashflow Plan",
    });
  }

  // 4. FIRE progression
  if (out.length < 3 && input.fireProgressPct < 40) {
    out.push({
      rank: (out.length + 1) as 1 | 2 | 3,
      title: "Accelerate financial freedom path",
      reason: `Independence progress is ${input.fireProgressPct.toFixed(0)}% — increasing investable contributions compounds quickly.`,
      impact: "Brings the freedom timeline forward without taking on additional risk.",
      urgency: "neutral",
      href: "/financial-plan",
      ctaLabel: "Open Financial Plan",
    });
  }

  // 5. Scenario readiness fallback
  if (out.length < 3) {
    out.push({
      rank: (out.length + 1) as 1 | 2 | 3,
      title: "Run a scenario before the next big move",
      reason: "No high-priority gap detected — use the Decision Engine to pressure-test the plan.",
      impact: "Catches second-order risks before committing to property, leverage or asset shifts.",
      urgency: "neutral",
      href: "/decision",
      ctaLabel: "Run Decision Engine",
    });
  }

  // Optimisation suggestion
  if (out.length < 3) {
    out.push({
      rank: (out.length + 1) as 1 | 2 | 3,
      title: "Review tax position",
      reason: "Tax structure typically improves outcomes more reliably than asset selection.",
      impact: "Higher after-tax compounding without changing risk profile.",
      urgency: "neutral",
      href: "/tax",
      ctaLabel: "Review Tax Strategy",
    });
  }

  return out.slice(0, 3) as Priority[];
}

function nextBestAction(priorities: Priority[]): string {
  if (priorities.length === 0) {
    return "Your strongest next move is to run the Decision Engine against your live data to confirm the plan still holds.";
  }
  const top = priorities[0];
  if (top.title.includes("liquidity")) {
    return "Your strongest next move is to strengthen liquidity before adding new leverage.";
  }
  if (top.title.includes("expensive debt")) {
    return "Your strongest next move is to reduce expensive debt — it compounds against you faster than any current investment.";
  }
  if (top.title.includes("savings rate")) {
    return "Your strongest next move is to widen the gap between income and expenses — that gap is the engine for every other goal.";
  }
  if (top.title.includes("freedom")) {
    return "Your strongest next move is to formalise the path to financial freedom and lock in monthly contributions.";
  }
  return `Your strongest next move: ${top.title}.`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WealthStrategyPage() {
  // One-time clean-up of legacy tab signals (no longer used in v1 architecture)
  if (typeof window !== "undefined" && sessionStorage.getItem("wealth-strategy-tab")) {
    sessionStorage.removeItem("wealth-strategy-tab");
  }

  const { data: snapRaw } = useQuery({ queryKey: ["/api/snapshot"] });
  const { data: expensesRaw } = useQuery({ queryKey: ["/api/expenses"] });
  const { data: propertiesRaw } = useQuery({ queryKey: ["/api/properties"] });
  const { data: stocksRaw } = useQuery({ queryKey: ["/api/stocks"] });
  const { data: cryptoRaw } = useQuery({ queryKey: ["/api/crypto"] });

  const snap: Record<string, number> = useMemo(() => {
    const s: any = snapRaw || {};
    return {
      ppor: safeNum(s.ppor),
      cash: safeNum(s.cash),
      offset_balance: safeNum(s.offset_balance),
      super_balance: safeNum(s.super_balance),
      stocks: safeNum(s.stocks),
      crypto: safeNum(s.crypto),
      cars: safeNum(s.cars),
      iran_property: safeNum(s.iran_property),
      mortgage: safeNum(s.mortgage),
      other_debts: safeNum(s.other_debts),
      monthly_income: safeNum(s.monthly_income),
      monthly_expenses: safeNum(s.monthly_expenses),
    };
  }, [snapRaw]);

  const expenses: any[] = Array.isArray(expensesRaw) ? expensesRaw : [];
  const properties: any[] = Array.isArray(propertiesRaw) ? propertiesRaw : [];
  const stocks: any[] = Array.isArray(stocksRaw) ? stocksRaw : [];
  const crypto: any[] = Array.isArray(cryptoRaw) ? cryptoRaw : [];

  // ─ Derived values (read-only summaries, no new calculation logic) ──────────
  const derived = useMemo(() => {
    const totalAssets =
      snap.ppor + snap.cash + snap.offset_balance + snap.super_balance +
      snap.stocks + snap.crypto + snap.cars + snap.iran_property;
    const totalDebt = snap.mortgage + snap.other_debts;
    const netWorth = totalAssets - totalDebt;

    const monthlyIncome = snap.monthly_income;
    const monthlyExpenses = snap.monthly_expenses;
    const monthlySurplus = monthlyIncome - monthlyExpenses;
    const savingsRate = monthlyIncome > 0 ? (monthlySurplus / monthlyIncome) * 100 : 0;

    const liquidity = snap.cash + snap.offset_balance;
    const monthsBuffer = monthlyExpenses > 0 ? liquidity / monthlyExpenses : 0;
    const bufferTargetMonths = 6;

    // FIRE: required investable capital using a 4% rule heuristic on current expenses
    const annualExpenses = monthlyExpenses * 12;
    const requiredFIRE = annualExpenses > 0 ? annualExpenses / 0.04 : 0;
    const investable = snap.cash + snap.offset_balance + snap.super_balance + snap.stocks + snap.crypto;
    const fireProgressPct = requiredFIRE > 0 ? Math.min(100, (investable / requiredFIRE) * 100) : 0;

    const expensiveDebt = snap.other_debts;
    const hasHighInterestDebt = expensiveDebt > 0;

    const debtToAsset = totalAssets > 0 ? (totalDebt / totalAssets) * 100 : 0;

    const propertyValue = properties.reduce(
      (sum, p) => sum + safeNum(p.current_value ?? p.purchase_price ?? 0),
      0,
    ) + snap.ppor + snap.iran_property;

    const investmentValue = snap.stocks + snap.crypto +
      stocks.reduce((s, p) => s + safeNum(p.current_value ?? p.units * (p.current_price ?? 0)), 0) +
      crypto.reduce((s, c) => s + safeNum(c.current_value ?? c.units * (c.current_price ?? 0)), 0);

    return {
      totalAssets,
      totalDebt,
      netWorth,
      monthlyIncome,
      monthlyExpenses,
      monthlySurplus,
      savingsRate,
      liquidity,
      monthsBuffer,
      bufferTargetMonths,
      requiredFIRE,
      investable,
      fireProgressPct,
      expensiveDebt,
      hasHighInterestDebt,
      debtToAsset,
      propertyValue,
      investmentValue,
    };
  }, [snap, properties, stocks, crypto]);

  // ─ Health status thresholds ────────────────────────────────────────────────
  const emergencyStatus: Status =
    derived.monthsBuffer >= derived.bufferTargetMonths ? "good"
    : derived.monthsBuffer >= 3 ? "warn"
    : "risk";

  const debtStatus: Status =
    derived.debtToAsset === 0 ? "neutral"
    : derived.debtToAsset < 40 ? "good"
    : derived.debtToAsset < 70 ? "warn"
    : "risk";

  const cashflowStatus: Status =
    derived.monthlyIncome === 0 ? "neutral"
    : derived.savingsRate >= 20 ? "good"
    : derived.savingsRate >= 10 ? "warn"
    : "risk";

  // Data quality: count of snapshot fields populated
  const populatedFields = Object.values(snap).filter((v) => v > 0).length;
  const dataQualityPct = Math.round((populatedFields / Object.keys(snap).length) * 100);
  const dataQualityStatus: Status =
    dataQualityPct >= 75 ? "good" : dataQualityPct >= 50 ? "warn" : "risk";

  const fireStatus: Status =
    derived.fireProgressPct >= 70 ? "good"
    : derived.fireProgressPct >= 30 ? "warn"
    : "neutral";

  const propertyStatus: Status =
    properties.length > 0 || snap.ppor > 0 ? "good" : "neutral";

  const investmentStatus: Status =
    derived.investmentValue > 0 ? "good" : "neutral";

  const priorities = useMemo(
    () =>
      buildPriorities({
        monthsBuffer: derived.monthsBuffer,
        bufferTargetMonths: derived.bufferTargetMonths,
        expensiveDebt: derived.expensiveDebt,
        totalDebt: derived.totalDebt,
        savingsRate: derived.savingsRate,
        netWorth: derived.netWorth,
        fireProgressPct: derived.fireProgressPct,
        hasHighInterestDebt: derived.hasHighInterestDebt,
        liquidity: derived.liquidity,
        monthlyExpenses: derived.monthlyExpenses,
      }),
    [derived],
  );

  const action = nextBestAction(priorities);

  // Executive summary status (rolls up the worst of the health signals)
  const overallStatus: Status = useMemo(() => {
    const ranks: Record<Status, number> = { risk: 3, warn: 2, good: 1, neutral: 0 };
    const list: Status[] = [emergencyStatus, debtStatus, cashflowStatus];
    return list.reduce((worst, s) => (ranks[s] > ranks[worst] ? s : worst), "good" as Status);
  }, [emergencyStatus, debtStatus, cashflowStatus]);

  const overallNarrative = useMemo(() => {
    if (overallStatus === "good") {
      return "Your balance sheet looks growth-capable with no critical gaps. Continue with the existing plan and revisit assumptions periodically in the Forecast Engine.";
    }
    if (overallStatus === "warn") {
      return "Your balance sheet is growth-capable, but liquidity or cashflow should remain the first constraint before adding new leverage or risk.";
    }
    if (overallStatus === "risk") {
      return "Your household has at least one structural risk that should be addressed before any new investment or property decision is committed.";
    }
    return "Add more data in Snapshot and Data Health so the Hub can give a clearer read on your position.";
  }, [overallStatus]);

  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 sm:px-6 py-5 sm:py-7 max-w-6xl mx-auto">
        {/* ─── Page header ───────────────────────────────────────────────── */}
        <header className="mb-6 sm:mb-8">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-5 h-5 text-primary" />
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              Wealth Strategy Hub
            </h1>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            Your household command centre. This hub summarises position and
            priorities — open the source pages on the left for full calculation and edits.
          </p>
        </header>

        {/* ─── 1. EXECUTIVE OVERVIEW ─────────────────────────────────────── */}
        <section className="mb-8 sm:mb-10">
          <SectionHeader
            step="01"
            title="Executive Overview"
            intent="Where the household stands today and where to focus this month."
          />

          {/* Status card */}
          <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 mb-4">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80 mb-1">
                  Household financial status
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-2xl sm:text-3xl font-bold text-foreground">
                    {fmtAUD(derived.netWorth)}
                  </span>
                  <span className="text-xs text-muted-foreground">net position</span>
                </div>
              </div>
              <StatusChip status={overallStatus} />
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed mb-5">
              {overallNarrative}
            </p>

            {/* Key signals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <SignalTile
                label="Cash buffer"
                value={`${derived.monthsBuffer.toFixed(1)} mo`}
                tone={emergencyStatus}
              />
              <SignalTile
                label="Savings rate"
                value={`${derived.savingsRate.toFixed(0)}%`}
                tone={cashflowStatus}
              />
              <SignalTile
                label="Debt / assets"
                value={`${derived.debtToAsset.toFixed(0)}%`}
                tone={debtStatus}
              />
              <SignalTile
                label="Freedom progress"
                value={`${derived.fireProgressPct.toFixed(0)}%`}
                tone={fireStatus}
              />
            </div>

            {/* Next best action */}
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-primary/80 mb-1 font-medium">
                  Next best action
                </div>
                <p className="text-sm text-foreground leading-relaxed">{action}</p>
              </div>
            </div>
          </div>

          {/* Top 3 priorities */}
          <div className="bg-card border border-border rounded-2xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-sm sm:text-base font-semibold text-foreground">
                Top 3 priorities this month
              </h3>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                Ranked by impact
              </span>
            </div>
            <div className="space-y-3">
              {priorities.map((p) => (
                <PriorityRow key={p.rank} priority={p} />
              ))}
              {priorities.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No critical priorities detected. Use the Decision Engine to pressure-test the plan.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ─── 2. FINANCIAL HEALTH ───────────────────────────────────────── */}
        <section className="mb-8 sm:mb-10">
          <SectionHeader
            step="02"
            title="Financial Health"
            intent="The four signals that decide whether the household can take additional risk."
            rationale="Each card is a summary — open the source page to dig into the numbers, edit assumptions or take action."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <HubCard
              icon={Shield}
              title="Emergency Buffer"
              status={emergencyStatus}
              keyMetric={`${derived.monthsBuffer.toFixed(1)} months`}
              metricLabel={`of expenses · target ${derived.bufferTargetMonths} mo`}
              narrative={
                emergencyStatus === "good"
                  ? "Your emergency buffer is within target. Maintain it as a non-negotiable line item before any new leverage."
                  : emergencyStatus === "warn"
                  ? "Your emergency buffer is approaching target. Build the remaining months before adding new leverage."
                  : "Your emergency buffer is below target. Build this before taking on additional leverage."
              }
              href="/dashboard"
              ctaLabel="Open Snapshot"
            />

            <HubCard
              icon={CreditCard}
              title="Debt Position"
              status={debtStatus}
              keyMetric={fmtAUD(derived.totalDebt)}
              metricLabel={`debt-to-asset ${derived.debtToAsset.toFixed(0)}%`}
              narrative={
                derived.totalDebt === 0
                  ? "No household debt recorded. Review Debt Strategy to confirm and to model future leverage."
                  : derived.hasHighInterestDebt
                  ? "Expensive (non-mortgage) debt is present. Prioritise paying these down — they compound against you faster than the asset side compounds for you."
                  : "Debt is mortgage-weighted with no expensive consumer balances. Continue with the existing payoff strategy."
              }
              href="/debt-strategy"
              ctaLabel="Review Debt Strategy"
            />

            <HubCard
              icon={Wallet}
              title="Cashflow Health"
              status={cashflowStatus}
              keyMetric={fmtAUD(derived.monthlySurplus)}
              metricLabel={`monthly surplus · ${derived.savingsRate.toFixed(0)}% savings rate`}
              narrative={
                cashflowStatus === "good"
                  ? "Your savings rate is at a sustainable level. Direct the surplus into the highest-impact lever (debt, super, or investment)."
                  : cashflowStatus === "warn"
                  ? "Savings rate is improving but below the 20% benchmark. Tightening one or two expense categories will compound quickly."
                  : "Savings rate is too low to fund growth. Review the budget and recurring bills before adding leverage."
              }
              href="/budget"
              ctaLabel="Open Cashflow Plan"
            />

            <HubCard
              icon={HeartPulse}
              title="Data Quality"
              status={dataQualityStatus}
              keyMetric={`${dataQualityPct}%`}
              metricLabel="snapshot fields populated"
              narrative={
                dataQualityStatus === "good"
                  ? "Snapshot is well populated — Forecast Engine and Decision Engine outputs are reliable."
                  : dataQualityStatus === "warn"
                  ? "Some snapshot fields are missing. Forecast accuracy will improve when you populate them."
                  : "Several snapshot fields are missing. The Hub's signals will sharpen once data is filled in."
              }
              href="/data-health"
              ctaLabel="Open Data Health"
            />
          </div>
        </section>

        {/* ─── 3. WEALTH BUILDING ────────────────────────────────────────── */}
        <section className="mb-8 sm:mb-10">
          <SectionHeader
            step="03"
            title="Wealth Building"
            intent="Where compounding gets done. Summaries only — engines live on the dedicated pages."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <HubCard
              icon={Flame}
              title="Financial Freedom Path"
              status={fireStatus}
              keyMetric={`${derived.fireProgressPct.toFixed(0)}%`}
              metricLabel={`towards ${fmtAUD(derived.requiredFIRE)}`}
              narrative={
                derived.fireProgressPct === 0
                  ? "Set up the freedom plan to translate today's surplus into a target year. The Decision Engine will then rank moves against it."
                  : derived.fireProgressPct >= 70
                  ? "You are inside the home stretch. Asset allocation and sequence-of-returns risk now matter more than contribution rate."
                  : "Independence is reachable but contribution rate and asset mix are the main levers. Lock both in inside the Financial Plan."
              }
              href="/financial-plan"
              ctaLabel="Open Financial Plan"
            />

            <HubCard
              icon={Home}
              title="Property Strategy"
              status={propertyStatus}
              keyMetric={fmtAUD(derived.propertyValue)}
              metricLabel={`${properties.length} investment ${properties.length === 1 ? "property" : "properties"}`}
              narrative={
                emergencyStatus !== "good"
                  ? "Property remains viable, but the Decision Engine currently prefers waiting until liquidity improves."
                  : derived.hasHighInterestDebt
                  ? "Resolve expensive debt before adding leveraged property — the after-tax maths favours that order."
                  : "Use the Property Plan to model LVR, deposit, borrowing power and after-tax cashflow before committing."
              }
              href="/property"
              ctaLabel="Open Property Plan"
            />

            <HubCard
              icon={TrendingUp}
              title="Investment Strategy"
              status={investmentStatus}
              keyMetric={fmtAUD(derived.investmentValue)}
              metricLabel="stocks + crypto + super"
              narrative={
                derived.investmentValue === 0
                  ? "No investment portfolio yet. Start with the Stocks Plan to set a DCA cadence aligned to monthly surplus."
                  : "Asset mix and DCA cadence are the levers. Use Stocks / Crypto plans to set rules, and Decision Engine to compare scenarios."
              }
              href="/stocks"
              ctaLabel="Open Stocks Plan"
            />
          </div>
        </section>

        {/* ─── 4. OPTIMISATION ───────────────────────────────────────────── */}
        <section className="mb-8 sm:mb-10">
          <SectionHeader
            step="04"
            title="Optimisation"
            intent="Squeeze more out of the existing plan without adding new risk."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <HubCard
              icon={Calculator}
              title="Tax Position"
              status="neutral"
              keyMetric={fmtAUD(derived.monthlyIncome * 12)}
              metricLabel="annualised income · structure matters"
              narrative="Tax structure typically improves after-tax returns more reliably than picking assets. Review negative gearing, super contributions and offset strategy on the Tax Strategy page."
              href="/tax"
              ctaLabel="Review Tax Strategy"
            />

            <HubCard
              icon={Layers}
              title="Debt Optimisation"
              status={derived.hasHighInterestDebt ? "warn" : "neutral"}
              keyMetric={fmtAUD(derived.totalDebt)}
              metricLabel="payoff order + refinance levers"
              narrative={
                derived.hasHighInterestDebt
                  ? "Expensive balances are dragging the plan. The avalanche order in Debt Strategy will minimise interest paid."
                  : "Debt is well-structured. Use Debt Strategy to model refinance scenarios when rates move."
              }
              href="/debt-strategy"
              ctaLabel="Open Debt Strategy"
            />

            <HubCard
              icon={Sparkles}
              title="Scenario Readiness"
              status={dataQualityStatus === "good" ? "good" : "warn"}
              keyMetric={priorities.length.toString()}
              metricLabel="open priorities to pressure-test"
              narrative="Before any property, leverage or major asset shift — run the move through the Decision Engine. It ranks scenarios using the same engines as the Hub."
              href="/decision"
              ctaLabel="Run Decision Engine"
            />
          </div>
        </section>

        {/* ─── 5. ADVANCED ANALYTICS (collapsed) ─────────────────────────── */}
        <section className="mb-6">
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full bg-card border border-border rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-3 hover:border-primary/40 transition-colors"
            aria-expanded={showAdvanced}
          >
            <div className="flex items-center gap-3 text-left min-w-0">
              <span className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 text-primary inline-flex items-center justify-center">
                <BarChart2 className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm sm:text-base font-semibold text-foreground">
                  Advanced Analytics
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Forecast Engine · Monte Carlo · Decision Engine · CGT Simulator
                </div>
              </div>
            </div>
            {showAdvanced ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
          </button>

          {showAdvanced && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AdvancedLink
                href="/ai-forecast-engine"
                icon={Sigma}
                title="Forecast Engine"
                description="Year-by-year deterministic forecast, stress testing and projection outputs."
              />
              <AdvancedLink
                href="/ai-forecast-engine"
                icon={Atom}
                title="Monte Carlo"
                description="Probabilistic forecast across thousands of paths — runs inside the Forecast Engine."
              />
              <AdvancedLink
                href="/decision"
                icon={Sparkles}
                title="Decision Engine"
                description="Scenario ranking, investment allocation recommendations and the Advanced Builder."
              />
              <AdvancedLink
                href="/cgt-simulator"
                icon={LineChartIcon}
                title="CGT Simulator"
                description="Model capital gains tax outcomes against the current portfolio."
              />
              <AdvancedLink
                href="/timeline"
                icon={TrendingUp}
                title="Net Worth Timeline"
                description="History of net worth movements with snapshot-level drill-down."
              />
              <AdvancedLink
                href="/data-health"
                icon={HeartPulse}
                title="Data Health"
                description="Freshness and completeness checks on every input the engines depend on."
              />
            </div>
          )}
        </section>

        {/* ─── Footer note + Assumptions ─────────────────────────────────── */}
        <div className="flex items-start gap-2 text-xs text-muted-foreground/80 pt-4 mt-4 border-t border-border">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            The Hub summarises and orchestrates — every number here is derived from the
            source-of-truth engines, not calculated independently. General information only,
            not financial, tax or legal advice. Consult a licensed Australian financial adviser
            before making decisions.
          </p>
        </div>

        <AssumptionsPanel mode="compact" />
      </div>
    </div>
  );
}

// ─── Smaller building blocks ──────────────────────────────────────────────────

function SignalTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: Status;
}) {
  const t = STATUS_TONE[tone];
  return (
    <div className="rounded-xl border border-border bg-background/40 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
          {label}
        </span>
      </div>
      <div className="text-base sm:text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function PriorityRow({ priority }: { priority: Priority }) {
  const tone = STATUS_TONE[priority.urgency];
  const Icon =
    priority.urgency === "risk"
      ? AlertTriangle
      : priority.urgency === "warn"
      ? Info
      : CheckCircle2;

  return (
    <div className="rounded-xl border border-border bg-background/40 p-4 flex flex-col sm:flex-row sm:items-start gap-3">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="shrink-0 w-7 h-7 rounded-full bg-muted/40 text-foreground inline-flex items-center justify-center text-xs font-bold">
          {priority.rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h4 className="text-sm font-semibold text-foreground">{priority.title}</h4>
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${tone.chip}`}
            >
              <Icon className="w-3 h-3" />
              {tone.label}
            </span>
          </div>
          <p className="text-[13px] text-muted-foreground leading-relaxed mb-1">
            {priority.reason}
          </p>
          <p className="text-[12px] text-muted-foreground/80 leading-relaxed">
            <span className="font-medium text-foreground/70">Why it matters:</span>{" "}
            {priority.impact}
          </p>
        </div>
      </div>
      <Link href={priority.href}>
        <Button
          variant="outline"
          size="sm"
          className="w-full sm:w-auto shrink-0 text-xs h-8 border-border hover:border-primary/40 hover:bg-primary/5"
        >
          {priority.ctaLabel}
          <ArrowRight className="w-3 h-3 ml-1" />
        </Button>
      </Link>
    </div>
  );
}

function AdvancedLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3 hover:border-primary/40 transition-colors cursor-pointer">
        <span className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 text-primary inline-flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground mb-0.5">{title}</div>
          <div className="text-[12px] text-muted-foreground leading-relaxed">
            {description}
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground/60 shrink-0 mt-1" />
      </div>
    </Link>
  );
}

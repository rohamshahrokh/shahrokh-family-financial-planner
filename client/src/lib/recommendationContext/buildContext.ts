/**
 * Sprint 17 Phase 17.0 — Build RecommendationContext from CanonicalLedger
 * (DashboardInputs) + CanonicalGoal.
 *
 * Pure function. Pulls existing canonical selectors where possible; falls
 * back to safe inferred values. Does NOT mutate any input.
 */

import type {
  RecommendationContext,
  TodaySlice,
  PlanSlice,
} from "./types";
import { buildBaselineForecast } from "./baselineForecast";
import { classifyHouseholdLifeStage } from "../householdState/classifier";

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function inferAgeFromSnapshot(snapshot: any): number | null {
  if (!snapshot) return null;
  const candidates = [
    snapshot.current_age,
    snapshot.age,
    snapshot.roham_age,
    snapshot.fara_age,
    snapshot.primary_age,
  ];
  for (const c of candidates) {
    const n = num(c, NaN);
    if (Number.isFinite(n) && n > 10 && n < 100) return n;
  }
  if (snapshot.date_of_birth) {
    const dob = new Date(snapshot.date_of_birth);
    if (!Number.isNaN(dob.getTime())) {
      const now = new Date();
      const years = now.getFullYear() - dob.getFullYear();
      return years > 0 && years < 100 ? years : null;
    }
  }
  return null;
}

function safeReduce(rows: any[] | undefined, accessor: (r: any) => number): number {
  if (!Array.isArray(rows)) return 0;
  let total = 0;
  for (const r of rows) {
    total += num(accessor(r), 0);
  }
  return total;
}

function computeMonthlyIncome(inputs: any): number {
  if (!inputs) return 0;
  const rows = inputs.incomeRecords;
  if (Array.isArray(rows) && rows.length > 0) {
    return safeReduce(rows, (r) => {
      const amt = num(r.amount ?? r.monthly_amount ?? r.value, 0);
      const freq = String(r.frequency ?? r.cadence ?? "monthly").toLowerCase();
      if (freq.includes("annual") || freq.includes("year")) return amt / 12;
      if (freq.includes("week")) return (amt * 52) / 12;
      if (freq.includes("fortnight")) return (amt * 26) / 12;
      return amt;
    });
  }
  // Fallback to snapshot fields
  const snap = inputs.snapshot ?? {};
  const annualRoham = num(snap.roham_gross_annual ?? snap.roham_gross_income, 0);
  const annualFara = num(snap.fara_gross_annual ?? snap.fara_gross_income, 0);
  if (annualRoham + annualFara > 0) return (annualRoham + annualFara) / 12;
  return num(snap.monthly_income, 0);
}

function computeMonthlyExpenses(inputs: any): number {
  if (!inputs) return 0;
  const rows = inputs.expenses;
  if (Array.isArray(rows) && rows.length > 0) {
    return safeReduce(rows, (r) => {
      const amt = num(r.amount ?? r.monthly_amount ?? r.value, 0);
      const freq = String(r.frequency ?? r.cadence ?? "monthly").toLowerCase();
      if (freq.includes("annual") || freq.includes("year")) return amt / 12;
      if (freq.includes("week")) return (amt * 52) / 12;
      if (freq.includes("fortnight")) return (amt * 26) / 12;
      return amt;
    });
  }
  return num(inputs.snapshot?.monthly_expenses, 0);
}

function computeNetWorthComponents(inputs: any): TodaySlice["netWorth"] {
  const snap = inputs?.snapshot ?? {};
  const cash =
    num(snap.cash, 0) +
    num(snap.other_cash, 0) +
    num(snap.offset_balance, 0);
  const superBalance =
    num(snap.super_combined, 0) +
    num(snap.roham_super_balance, 0) +
    num(snap.fara_super_balance, 0) +
    (snap.super_combined ? 0 : num(snap.super_balance, 0));

  // Holdings (ETFs / shares / crypto) — read from unified /api/holdings rows or stocks/crypto
  let investments = 0;
  let crypto = 0;
  if (Array.isArray(inputs?.holdingsRaw)) {
    for (const h of inputs.holdingsRaw) {
      const value = num(h.current_value ?? h.value ?? h.balance, 0);
      const type = String(h.asset_type ?? h.type ?? "").toLowerCase();
      if (type.includes("crypto")) crypto += value;
      else investments += value;
    }
  } else {
    if (Array.isArray(inputs?.stocks)) {
      investments += safeReduce(inputs.stocks, (s) => num(s.current_value ?? s.value, 0));
    }
    if (Array.isArray(inputs?.cryptos)) {
      crypto += safeReduce(inputs.cryptos, (c) => num(c.current_value ?? c.value, 0));
    }
  }

  let propertyEquity = 0;
  let propertyDebt = 0;
  if (Array.isArray(inputs?.properties)) {
    for (const p of inputs.properties) {
      const val = num(p.current_value ?? p.value, 0);
      const mortgage = num(p.mortgage_balance ?? p.loan_balance, 0);
      propertyEquity += Math.max(0, val - mortgage);
      propertyDebt += mortgage;
    }
  } else {
    propertyEquity = num(snap.ppor, 0);
    propertyDebt = num(snap.mortgage, 0);
  }

  const otherDebt = num(snap.other_debts, 0) + num(snap.consumer_debt, 0);
  const debt = propertyDebt + otherDebt;
  const total = cash + investments + superBalance + propertyEquity + crypto - 0; // debt already netted in equity
  return {
    total,
    cash,
    investments,
    superBalance,
    propertyEquity,
    crypto,
    debt,
  };
}

function inferHouseholdProfile(inputs: any): TodaySlice["householdProfile"] {
  const snap = inputs?.snapshot ?? {};
  const dependents = num(snap.num_dependents ?? snap.dependents ?? snap.children, 0);
  const hasDependents = dependents > 0;
  // Single income if only one of (roham, fara) has gross > 0
  const rohamAnnual = num(snap.roham_gross_annual ?? snap.roham_gross_income, 0);
  const faraAnnual = num(snap.fara_gross_annual ?? snap.fara_gross_income, 0);
  const singleIncome =
    (rohamAnnual > 0 && faraAnnual <= 0) || (faraAnnual > 0 && rohamAnnual <= 0);
  const selfEmployed = Boolean(snap.self_employed || snap.is_self_employed);
  const retired = Boolean(snap.retired);
  return { hasDependents, singleIncome, selfEmployed, retired };
}

function planFromGoal(goal: any): PlanSlice {
  if (!goal || goal.status !== "SET") {
    return {
      goal: goal ?? null,
      targetFireAge: null,
      targetPassiveMonthly: null,
      swrPct: null,
      riskPreference: null,
      ownershipGoals: { keepPpor: true, allowInvestmentProperty: true },
    };
  }
  return {
    goal,
    targetFireAge: num(goal.targetFireAge, 0) || null,
    targetPassiveMonthly: num(goal.targetPassiveMonthly, 0) || null,
    swrPct: num(goal.swrPct, 0) || null,
    riskPreference: typeof goal.riskPreference === "number" ? goal.riskPreference : null,
    ownershipGoals: {
      keepPpor: goal.keepPpor !== false,
      allowInvestmentProperty: goal.allowInvestmentProperty !== false,
    },
  };
}

function stableHash(obj: any): string {
  try {
    const s = JSON.stringify(obj);
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return `ctx_${(h >>> 0).toString(16)}`;
  } catch {
    return `ctx_${Date.now().toString(16)}`;
  }
}

export interface BuildContextOpts {
  todayIso?: string;
  horizonYears?: number;
  /** Override real return % (0..1). */
  realReturnPct?: number;
  /** Override inflation % (0..1). */
  inflationPct?: number;
}

/**
 * Assemble a RecommendationContext from DashboardInputs + CanonicalGoal.
 * Both inputs may be unwired; this function never throws.
 */
export function buildRecommendationContext(
  inputs: any | null | undefined,
  goal: any | null | undefined,
  opts?: BuildContextOpts,
): RecommendationContext {
  const today: TodaySlice = {
    ledger: inputs ?? null,
    age: inferAgeFromSnapshot(inputs?.snapshot),
    householdProfile: inferHouseholdProfile(inputs),
    cashflow: (() => {
      const monthlyIncome = computeMonthlyIncome(inputs);
      const monthlyExpenses = computeMonthlyExpenses(inputs);
      return {
        monthlyIncome,
        monthlyExpenses,
        monthlySurplus: monthlyIncome - monthlyExpenses,
      };
    })(),
    netWorth: computeNetWorthComponents(inputs),
  };

  const plan = planFromGoal(goal);

  const realReturnPct = typeof opts?.realReturnPct === "number" ? opts.realReturnPct : 0.05;
  const inflationPct = typeof opts?.inflationPct === "number" ? opts.inflationPct : 0.025;
  const horizonYears = Math.max(
    1,
    opts?.horizonYears ??
      (plan.targetFireAge && today.age ? Math.max(5, plan.targetFireAge - today.age + 10) : 25),
  );

  const fireNumber =
    plan.swrPct && plan.targetPassiveMonthly && plan.swrPct > 0
      ? (plan.targetPassiveMonthly * 12) / plan.swrPct
      : 0;

  const forecast = buildBaselineForecast({
    currentAge: today.age,
    targetFireAge: plan.targetFireAge,
    netWorthNow: today.netWorth.total,
    fireNumber,
    monthlySurplus: today.cashflow.monthlySurplus,
    monthlyExpenses: today.cashflow.monthlyExpenses,
    realReturnPct,
    inflationPct,
    horizonYears,
    passiveAnnualAtFire:
      plan.targetPassiveMonthly != null ? plan.targetPassiveMonthly * 12 : null,
  });

  const generatedAt = opts?.todayIso ?? new Date().toISOString();
  const horizonAge = (today.age ?? 0) + horizonYears;
  const contextHash = stableHash({
    age: today.age,
    netWorth: today.netWorth.total,
    monthlySurplus: today.cashflow.monthlySurplus,
    fireNumber,
    targetFireAge: plan.targetFireAge,
  });

  const baseCtx: RecommendationContext = {
    today,
    plan,
    forecast,
    meta: { generatedAt, horizonYears, horizonAge, contextHash },
  };
  // Populate lifeStage from the classifier. Done here so every consumer
  // sees a fully populated context.
  baseCtx.lifeStage = classifyHouseholdLifeStage(baseCtx).primary;
  return baseCtx;
}

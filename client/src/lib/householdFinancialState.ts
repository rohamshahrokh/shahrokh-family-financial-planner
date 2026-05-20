/**
 * householdFinancialState.ts — canonical household financial input object.
 *
 * Why this file exists
 * --------------------
 * Prior to this refactor, financial numeric inputs (cash buckets, super
 * balances, salary-linked super inputs, etc.) were edited in BOTH Settings
 * and Financial Centre / Financial Plan. The two surfaces wrote to the same
 * Supabase `sf_snapshot` row but with overlapping forms, leading to
 * duplicate-state confusion and inconsistent values flowing into engines.
 *
 * This module exposes ONE canonical view of the household's numeric financial
 * state. It is a thin, pure projection over:
 *   • sf_snapshot           (single Supabase row — the persistence layer)
 *   • sf_properties         (settled + planned IPs)
 *   • sf_income / sf_expenses ledgers
 *
 * It DOES NOT introduce a parallel store, hook, or cache — those already exist
 * in `dashboardDataContract.ts` and `canonicalNetWorth.ts`. It simply gives
 * engines a single typed object to consume so they no longer reach into the
 * raw snapshot themselves.
 *
 * Rule
 * ----
 * Settings is NOT allowed to write to any field in this object. Only Financial
 * Centre / Financial Plan may edit these values. Settings is restricted to
 * non-financial preferences (theme, notifications, integrations, permissions).
 */

import {
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectSuperCombined,
  selectCashToday,
  selectMortgageRepayment,
  selectMonthlyDebtService,
  selectIpCurrentValueSettled,
  selectIpLoanBalanceSettled,
  selectStocksTotal,
  selectCryptoTotal,
  type DashboardInputs,
} from "./dashboardDataContract";

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

/** Per-person super inputs (was previously edited in Settings). */
export interface PersonSuperInputs {
  balance: number;
  salary: number;                 // annual gross
  employerContribPct: number;     // SG %
  salarySacrifice: number;        // annual
  personalContrib: number;        // annual after-tax
  annualTopUp: number;            // annual
  insurancePa: number;            // annual premium inside super
  growthRatePct: number;          // expected annual return
  feePct: number;                 // annual fee %
  option: string;                 // High Growth / Growth / Balanced / etc.
  provider: string;
  retirementAge: number;
}

/** Cash decomposition (was previously edited in Settings → Cash Allocation). */
export interface CashAllocation {
  everyday: number;     // sf_snapshot.cash
  savings: number;      // sf_snapshot.savings_cash
  emergency: number;    // sf_snapshot.emergency_cash
  other: number;        // sf_snapshot.other_cash
  offset: number;       // sf_snapshot.offset_balance
  total: number;        // derived
}

/** Canonical household financial state — the single input every engine reads. */
export interface HouseholdFinancialState {
  /** ISO date the projection was built. */
  asOf: string;

  // ─── Income / expenses ──────────────────────────────────────────────
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySurplus: number;

  // ─── Cash ───────────────────────────────────────────────────────────
  cash: CashAllocation;

  // ─── Investments ────────────────────────────────────────────────────
  stocks: number;
  crypto: number;

  // ─── Property ───────────────────────────────────────────────────────
  ppor: number;
  iranProperty: number;
  cars: number;
  ipValueSettled: number;
  ipLoanSettled: number;

  // ─── Debt ───────────────────────────────────────────────────────────
  mortgage: number;
  otherDebts: number;
  mortgageRepaymentMonthly: number;
  totalDebtServiceMonthly: number;

  // ─── Super ──────────────────────────────────────────────────────────
  superCombined: number;
  roham: PersonSuperInputs;
  fara: PersonSuperInputs;

  // ─── Plan targets ───────────────────────────────────────────────────
  fireTargetAge: number;
  fireTargetMonthlyIncome: number;

  /**
   * Back-reference to the raw snapshot row. Engines that already accept a
   * snapshot-shaped argument (forecastEngine, monteCarlo, firePathEngine)
   * can pass `state.snapshot` directly without rewiring — this keeps the
   * refactor surgical and low-risk.
   */
  snapshot: any;
}

function readPerson(snap: any, prefix: "roham" | "fara"): PersonSuperInputs {
  const k = (n: string) => `${prefix}_${n}`;
  return {
    balance:            num(snap?.[k("super_balance")]),
    salary:             num(snap?.[k("super_salary")]),
    employerContribPct: num(snap?.[k("employer_contrib")]) || 11.5,
    salarySacrifice:    num(snap?.[k("salary_sacrifice")]),
    personalContrib:    num(snap?.[k("super_personal_contrib")]),
    annualTopUp:        num(snap?.[k("super_annual_topup")]),
    insurancePa:        num(snap?.[k("super_insurance_pa")]),
    growthRatePct:      num(snap?.[k("super_growth_rate")]) || 8.0,
    feePct:             num(snap?.[k("super_fee_pct")]) || 0.5,
    option:             (snap?.[k("super_option")] as string) || "High Growth",
    provider:           (snap?.[k("super_provider")] as string) || "",
    retirementAge:      num(snap?.[k("retirement_age")]) || 60,
  };
}

/**
 * Pure: build the canonical household financial state from the ledger inputs.
 * Same input shape every selector uses, so engines can keep their existing
 * `DashboardInputs` plumbing.
 */
export function buildHouseholdFinancialState(
  inputs: DashboardInputs,
): HouseholdFinancialState {
  const s = inputs.snapshot ?? {};
  const monthlyIncome    = selectMonthlyIncome(inputs);
  const monthlyExpenses  = selectMonthlyExpensesLedger(inputs);
  const cashTotal        = selectCashToday(inputs);
  const superCombined    = selectSuperCombined(inputs);
  const mortgageRepay    = selectMortgageRepayment(inputs);
  const totalDebtSvc     = selectMonthlyDebtService(inputs);

  return {
    asOf: inputs.todayIso ?? new Date().toISOString().split("T")[0],

    monthlyIncome,
    monthlyExpenses,
    monthlySurplus: monthlyIncome - monthlyExpenses,

    cash: {
      everyday:  num(s.cash),
      savings:   num(s.savings_cash),
      emergency: num(s.emergency_cash),
      other:     num(s.other_cash),
      offset:    num(s.offset_balance),
      total:     cashTotal,
    },

    stocks: selectStocksTotal(inputs),
    crypto: selectCryptoTotal(inputs),

    ppor:           num(s.ppor),
    iranProperty:   num(s.iran_property),
    cars:           num(s.cars),
    ipValueSettled: selectIpCurrentValueSettled(inputs),
    ipLoanSettled:  selectIpLoanBalanceSettled(inputs),

    mortgage:   num(s.mortgage),
    otherDebts: num(s.other_debts),
    mortgageRepaymentMonthly: mortgageRepay,
    totalDebtServiceMonthly:  totalDebtSvc,

    superCombined,
    roham: readPerson(s, "roham"),
    fara:  readPerson(s, "fara"),

    fireTargetAge:            num(s.fire_target_age) || 55,
    fireTargetMonthlyIncome:  num(s.fire_target_monthly_income) || 20000,

    snapshot: s,
  };
}

/**
 * Settings UI guard.
 *
 * The intent of this refactor is that Settings must never present numeric
 * financial input forms for any of these fields. Tests assert that the
 * settings page module does not export functions whose names mention these
 * snapshot columns. Updating this list signals that a new financial input
 * has been moved into the canonical model — Settings must NOT host it.
 */
/**
 * Engine adapter — `buildFirePathInput` expects a snapshot-shaped object.
 * Passing the canonical state directly demonstrates the routing requirement:
 * engines consume the canonical household state, not a hand-rolled snapshot.
 *
 * `state.snapshot` is preserved as the persistence-shaped bag for back-compat;
 * the typed fields above (monthlyIncome, cash.total, superCombined, …) are the
 * pre-resolved values that the engine wrappers in firePathEngine.ts can read
 * via `selectMonthlyIncome`/`selectSuperCombined` from the same shape.
 */
export function toEngineSnapshot(state: HouseholdFinancialState): any {
  return {
    ...state.snapshot,
    // Mirror resolved canonical fields back onto the snapshot shape so engines
    // that read snapshot.monthly_income / snapshot.super_balance always see the
    // canonical value, never a raw Settings-local input.
    monthly_income:        state.monthlyIncome,
    monthly_expenses:      state.monthlyExpenses,
    cash:                  state.cash.everyday,
    savings_cash:          state.cash.savings,
    emergency_cash:        state.cash.emergency,
    other_cash:            state.cash.other,
    offset_balance:        state.cash.offset,
    super_balance:         state.superCombined,
    roham_super_balance:   state.roham.balance,
    fara_super_balance:    state.fara.balance,
    ppor:                  state.ppor,
    mortgage:              state.mortgage,
    other_debts:           state.otherDebts,
  };
}

export const FORBIDDEN_IN_SETTINGS_SNAPSHOT_FIELDS = [
  // Cash buckets
  "cash",
  "savings_cash",
  "emergency_cash",
  "other_cash",
  "offset_balance",
  // Super
  "super_balance",
  "roham_super_balance",
  "fara_super_balance",
  "roham_super_salary",
  "fara_super_salary",
  "roham_employer_contrib",
  "fara_employer_contrib",
  "roham_salary_sacrifice",
  "fara_salary_sacrifice",
  "roham_super_personal_contrib",
  "fara_super_personal_contrib",
  "roham_super_annual_topup",
  "fara_super_annual_topup",
  "roham_super_growth_rate",
  "fara_super_growth_rate",
  "roham_super_fee_pct",
  "fara_super_fee_pct",
  "roham_super_insurance_pa",
  "fara_super_insurance_pa",
] as const;

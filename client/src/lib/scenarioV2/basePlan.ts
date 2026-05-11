/**
 * Scenario Engine V2 — Base Plan Derivation
 *
 * Reads the SAME shape the dashboard reads (DashboardInputs), so anything
 * displayed on the dashboard is automatically available to V2 — no manual
 * re-entry. This is the "auto-derivation" promise of V2.
 *
 * Reconciliation guard:
 *   The returned BasePlanState's month-1 surplus must equal
 *   selectMonthlySurplus(inputs) within $1. The runtime check is in
 *   `runScenarioV2`, but the values flow through unchanged here.
 */

import type { DashboardInputs } from "../dashboardDataContract";
import {
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectMonthlyDebtService,
  selectExpensesIncludesDebt,
  selectCashToday,
  selectStocksTotal,
  selectCryptoTotal,
  selectSuperCombined,
  selectSettledIPs,
  selectPlannedIPs,
  selectIpCurrentValueSettled,
  selectIpLoanBalanceSettled,
  selectIpCurrentValuePlanned,
  selectIpLoanBalancePlanned,
  selectCanonicalNetWorth,
} from "../dashboardDataContract";
import { snapshotHash } from "./determinism";
import type {
  BasePlan,
  BasePlanAssumptions,
  BasePlanAssetTag,
  PortfolioState,
  PropertyState,
  MonthKey,
} from "./types";

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

/** Default rails, mirrors DEFAULT_FIRE_MC_SETTINGS but in V2 shape. */
export const DEFAULT_ASSUMPTIONS: BasePlanAssumptions = {
  inflation:      0.03,
  incomeGrowth:   0.035,
  expenseGrowth:  0.03,
  stockReturn:    0.10,
  stockVol:       0.18,
  cryptoReturn:   0.20,
  cryptoVol:      0.60,
  propertyGrowth: 0.065,
  propertyVol:    0.05,
  superReturn:    0.095,
  superVol:       0.08,
  cashApr:        0.045,
  mortgageRate:   0.065,
  swr:            0.04,
};

/** Format a Date as `YYYY-MM`. */
export function monthKey(d: Date): MonthKey {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Add `n` whole months to a `YYYY-MM` key (n may be negative). */
export function addMonths(mk: MonthKey, n: number): MonthKey {
  const [y, m] = mk.split("-").map((x) => parseInt(x, 10));
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Inclusive range of monthKeys. */
export function rangeKeys(start: MonthKey, end: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  let cur = start;
  // Safety cap at 600 months (50 years)
  for (let i = 0; i < 600 && cur <= end; i++) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

// ─── Derive ─────────────────────────────────────────────────────────────────

export interface DerivedBasePlan {
  /** The metadata row (would map to sf_base_plans). */
  plan: BasePlan;
  /** The month-zero PortfolioState seeded from the snapshot. */
  initialState: PortfolioState;
  /** Trailing-twelve-month income (annualised) at month zero. */
  ttmIncome: number;
  /** TTM expenses (excluding debt service) at month zero. */
  ttmExpenseLedger: number;
  /** Per-bucket monthly debt service at month zero. */
  monthlyDebtService: number;
  /** True when ledger expenses already include mortgage/debt repayments. */
  expensesIncludeDebt: boolean;
  /** Reconciliation check — should equal selectMonthlySurplus(inputs). */
  reconciledMonthlySurplus: number;
}

/**
 * Derive a BasePlan + initial PortfolioState from the same DashboardInputs
 * the dashboard uses. NO manual fields. NO duplication of selector logic —
 * we go through dashboardDataContract.
 */
export function deriveBasePlan(
  inputs: DashboardInputs,
  opts: {
    name?: string;
    ownerId?: string;
    startMonth?: MonthKey;
    assumptions?: Partial<BasePlanAssumptions>;
  } = {},
): DerivedBasePlan {
  const s = inputs.snapshot ?? {};
  const startMonth = opts.startMonth ?? monthKey(new Date());

  const monthlyIncome  = selectMonthlyIncome(inputs);
  const monthlyExpensesLedger = selectMonthlyExpensesLedger(inputs);
  const debtIncluded   = selectExpensesIncludesDebt(inputs);
  const monthlyDebt    = selectMonthlyDebtService(inputs);

  const cashToday      = selectCashToday(inputs);
  const stocksTotal    = selectStocksTotal(inputs);
  const cryptoTotal    = selectCryptoTotal(inputs);
  const superCombined  = selectSuperCombined(inputs);

  // Per-person super (fall back to half/half if only master populated)
  const superRoham = num(s.roham_super_balance) > 0
    ? num(s.roham_super_balance)
    : superCombined * 0.5;
  const superFara  = num(s.fara_super_balance)  > 0
    ? num(s.fara_super_balance)
    : superCombined * 0.5;

  // ─── Properties ─────────────────────────────────────────────────────────
  // 1. PPOR (snapshot.ppor + snapshot.mortgage), if any
  // 2. Each settled IP from sf_properties
  const properties: PropertyState[] = [];

  const pporValue = num(s.ppor);
  const pporMortgage = num(s.mortgage);
  const pporRate = num(s.mortgage_rate) || 6.5;
  const pporTerm = num(s.mortgage_term_years) || 30;
  if (pporValue > 0 || pporMortgage > 0) {
    properties.push({
      id: "ppor",
      marketValue: pporValue,
      loanBalance: pporMortgage,
      rate: pporRate / 100,
      monthlyRepayment: amort(pporMortgage, pporRate / 100, pporTerm),
      monthlyRent: 0, // PPOR doesn't produce rent
      monthlyCosts: 0,
      offsetBalance: num(s.offset_balance),
      // PPOR repayment is captured in the household ledger (rent.expenses
      // or mortgage line); the engine must NOT double-deduct it.
      inLedger: debtIncluded,
    });
  }

  for (const p of selectSettledIPs(inputs)) {
    const loan = num((p as any).loan_amount);
    const rate = num((p as any).interest_rate ?? pporRate);
    const term = num((p as any).loan_term ?? pporTerm);
    const weekly = num((p as any).weekly_rent);
    const vac = num((p as any).vacancy_rate) / 100;
    const mgmt = num((p as any).management_fee) / 100;
    const monthlyRent = weekly * 52 / 12 * (1 - vac) * (1 - mgmt);
    const monthlyCosts =
      num((p as any).council_rates) / 12 +
      num((p as any).insurance) / 12 +
      num((p as any).maintenance) / 12 +
      num((p as any).water_rates) / 12 +
      num((p as any).body_corporate) / 12 +
      num((p as any).land_tax) / 12;
    properties.push({
      id: String((p as any).id ?? `ip-${properties.length}`),
      marketValue: num((p as any).current_value ?? (p as any).purchase_price),
      loanBalance: loan,
      rate: rate / 100,
      monthlyRepayment: amort(loan, rate / 100, term),
      monthlyRent,
      monthlyCosts,
      offsetBalance: 0,
      // IPs: repayment is NOT in the household ledger — engine pays it from
      // rent + cash. Keep inLedger=false.
      inLedger: false,
    });
  }

  // Audit fix P1.1: seed cars / iran_property / other_assets / other_debts so
  // the engine's NW reconciles with the dashboard. These were previously
  // excluded, opening a silent $196k gap on the real user's household.
  const initialState: PortfolioState = {
    month: startMonth,
    cash: cashToday,
    etfBalance: stocksTotal,
    cryptoBalance: cryptoTotal,
    superRoham,
    superFara,
    properties,
    cars: num(s.cars),
    iranProperty: num(s.iran_property),
    otherAssets: num(s.other_assets),
    otherDebts: num(s.other_debts),
    fyTaxPaid: 0,
    ttmIncome: monthlyIncome * 12,
    ttmExpenses: (monthlyExpensesLedger + (debtIncluded ? 0 : monthlyDebt)) * 12,
  };

  const assumptions: BasePlanAssumptions = {
    ...DEFAULT_ASSUMPTIONS,
    ...(opts.assumptions ?? {}),
  };

  const plan: BasePlan = {
    id: `bp-${snapshotHash(s)}`,
    ownerId: opts.ownerId ?? String(s.owner_id ?? "shahrokh-family-main"),
    name: opts.name ?? "Auto-derived base plan",
    snapshotHash: snapshotHash(s),
    assumptions,
    createdAt: "1970-01-01T00:00:00Z", // deterministic; real createdAt set on persistence
  };

  // Reconciliation: this MUST match selectMonthlySurplus(inputs).
  const reconciledMonthlySurplus = debtIncluded
    ? Math.round(monthlyIncome - monthlyExpensesLedger)
    : Math.round(monthlyIncome - monthlyExpensesLedger - monthlyDebt);

  return {
    plan,
    initialState,
    ttmIncome: monthlyIncome * 12,
    ttmExpenseLedger: monthlyExpensesLedger * 12,
    monthlyDebtService: monthlyDebt,
    expensesIncludeDebt: debtIncluded,
    reconciledMonthlySurplus,
  };
}

/** Standard amortising P&I monthly payment. */
function amort(principal: number, annualRate: number, termYears: number): number {
  if (principal <= 0) return 0;
  const r = annualRate / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

/**
 * Enumerate every asset/liability bucket the base plan touches and tag it with
 * a scope. Surfaced on /decision and /data-health so users can audit which
 * positions feed the engine vs which are excluded.
 *
 * Why this exists: audit fix P1.3. Prior to the fix the engine's intake was
 * implicit (hard-coded subset of snapshot fields). The audit surfaced cars
 * and iran_property as silently-excluded; this inventory makes that visible.
 */
export function basePlanInventory(inputs: DashboardInputs): BasePlanAssetTag[] {
  const s = inputs.snapshot ?? {};
  const canonical = selectCanonicalNetWorth(inputs);
  const settled = selectSettledIPs(inputs);
  const planned = selectPlannedIPs(inputs);
  const settledVal = canonical.assets.settledIpValue;
  const settledLoans = canonical.liabilities.settledIpLoans;
  const plannedVal = selectIpCurrentValuePlanned(inputs);
  const plannedLoans = selectIpLoanBalancePlanned(inputs);

  const rows: BasePlanAssetTag[] = [
    {
      key: "cash",
      scope: "current",
      label: "Cash + offset",
      currentValue: canonical.assets.cashOffset,
      rationale: "Liquid cash buckets and PPOR offset balance — evolves at the short rate.",
    },
    {
      key: "ppor",
      scope: "current",
      label: "PPOR (family home)",
      currentValue: canonical.assets.ppor,
      rationale: "Owner-occupied dwelling — grows at the property rail with a stochastic shock.",
    },
    {
      key: "superRoham",
      scope: "current",
      label: "Super combined",
      currentValue: canonical.assets.super,
      rationale: "Concessionally taxed retirement balance — locked until preservation age (60).",
    },
    {
      key: "etfBalance",
      scope: "current",
      label: "Stocks / ETF holdings",
      currentValue: canonical.assets.stocks,
      rationale: "Listed equities — fat-tailed Student-t shocks with correlation to crypto and property.",
    },
    {
      key: "cryptoBalance",
      scope: "current",
      label: "Crypto holdings",
      currentValue: canonical.assets.crypto,
      rationale: "Digital assets — fat-tailed with jump-diffusion overlay (mean -5% jumps, ~1.5/yr).",
    },
    {
      key: "settledIP",
      scope: "current",
      label: `Settled IPs (${settled.length})`,
      currentValue: settledVal - settledLoans,
      rationale: "Investment properties already settled — modelled with rental cashflows, costs, depreciation, and CGT on sale.",
    },
    {
      key: "cars",
      scope: "non-investable",
      label: "Cars / vehicles",
      currentValue: canonical.assets.cars,
      rationale: "Counted in NW for completeness but engine does not project depreciation stochastically (held flat).",
    },
    {
      key: "iranProperty",
      scope: "non-investable",
      label: "Iran property (overseas)",
      currentValue: canonical.assets.iranProperty,
      rationale: "Foreign-denominated real estate — grows at half the AU property rail (FX + non-correlation haircut).",
    },
    {
      key: "otherAssets",
      scope: "non-investable",
      label: "Other assets",
      currentValue: canonical.assets.otherAssets,
      rationale: "Miscellaneous self-reported assets — counted in NW but held flat by engine.",
    },
    {
      key: "plannedIP",
      scope: "planned",
      label: `Planned IPs (${planned.length})`,
      currentValue: plannedVal - plannedLoans,
      rationale: "Future-settlement IPs — NOT in current NW; only deposit/stamp-duty outflows hit the projection until settlement.",
    },
    {
      key: "mortgage",
      scope: "current",
      label: "PPOR mortgage",
      currentValue: -canonical.liabilities.ppoMortgage,
      rationale: "PPOR principal balance — amortised at snapshot.mortgage_rate over remaining term.",
    },
    {
      key: "otherDebts",
      scope: "current",
      label: "Other debts (cards / personal loans)",
      currentValue: -canonical.liabilities.otherDebts,
      rationale: "Non-property liabilities — paid down deterministically at 15% APR / 12 monthly to mirror dashboard heuristic.",
    },
  ];
  // Hide zero rows except the audit-relevant ones (cars/iran/other_debts must
  // always be visible so users see they ARE being included).
  return rows.filter(r => {
    if (r.key === "cars" || r.key === "iranProperty" || r.key === "otherDebts" || r.key === "otherAssets") return true;
    return Math.abs(r.currentValue) > 0.5;
  });
}

/** Compute NW of a PortfolioState including non-investable buckets. */
export function netWorthOfState(s: PortfolioState): number {
  const propsNet = s.properties.reduce(
    (acc, p) => acc + (p.marketValue - p.loanBalance),
    0,
  );
  const cars = s.cars ?? 0;
  const iran = s.iranProperty ?? 0;
  const other = s.otherAssets ?? 0;
  const debts = s.otherDebts ?? 0;
  return (
    s.cash + s.etfBalance + s.cryptoBalance +
    s.superRoham + s.superFara + propsNet +
    cars + iran + other - debts
  );
}

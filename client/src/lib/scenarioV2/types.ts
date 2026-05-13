/**
 * Scenario Engine V2 — Core Type Skeleton (Phase 1)
 *
 * This file defines the *shape* of V2 only. No logic, no implementations.
 * Phases 3–13 fill in the modules that consume these types.
 *
 * Design contract (from scenario_engine_v2_spec.md + amendment_1):
 *   BasePlan + Delta[]  →  ScenarioEvent[]  →  tick(state, events, rails)  →  Result
 *
 * Determinism rule: every reducer must be a pure function of (state, events,
 * rails, seed). No Date.now(), no Math.random(), no Map/Set iteration leaks.
 */

// ─── Time ────────────────────────────────────────────────────────────────────

/** Calendar month key in `YYYY-MM` format. Stable lexicographic sort = chronological sort. */
export type MonthKey = string;

// ─── Snapshot identity ───────────────────────────────────────────────────────

/** Deterministic hash of the snapshot row used to derive a BasePlan. */
export type SnapshotHash = string;

// ─── Base plan ───────────────────────────────────────────────────────────────

/** Default rails (returns / volatility / inflation) used by every scenario unless overridden. */
export interface BasePlanAssumptions {
  inflation: number; // 0.03
  incomeGrowth: number; // 0.03
  expenseGrowth: number; // 0.03
  stockReturn: number; // 0.10
  stockVol: number; // 0.18
  cryptoReturn: number; // 0.20
  cryptoVol: number; // 0.60
  propertyGrowth: number; // 0.06
  propertyVol: number; // 0.05
  superReturn: number; // 0.08
  superVol: number; // 0.12
  cashApr: number; // 0.045
  mortgageRate: number; // 0.065
  swr: number; // 0.04
}

/** Snapshot of the family's current financial position, derived once per plan. */
export interface BasePlan {
  id: string;
  ownerId: string;
  name: string;
  snapshotHash: SnapshotHash;
  assumptions: BasePlanAssumptions;
  createdAt: string; // ISO timestamp
}

// ─── Deltas (user-authored scenario actions) ─────────────────────────────────

/** All 17 delta types. See spec §6 for full param schemas. */
export type DeltaType =
  | "property_deposit_boost"
  | "crypto_lump_sum"
  | "etf_lump_sum"
  | "etf_dca"
  | "offset_deposit"
  | "cash_hold"
  | "extra_mortgage_repayment"
  | "refinance"
  | "buy_property"
  | "sell_property"
  | "rentvest"
  | "early_retire"
  | "salary_change"
  | "career_break"
  | "child_expense"
  | "market_crash_stress"
  | "interest_rate_spike";

export interface ScenarioDelta {
  id: string;
  scenarioId: string;
  deltaType: DeltaType;
  activationMonth: MonthKey;
  /** Type-specific parameters (validated per deltaType in Phase 6). */
  params: Record<string, unknown>;
  /** Ordering priority within the same monthKey. Smaller = earlier. */
  priority: number;
  /** Stable key for idempotent replay. */
  idempotencyKey: string;
}

// ─── Event timeline (unified internal representation) ────────────────────────

/**
 * ScenarioEvent priority bands (smaller fires first within a month):
 *   100 macro        (regime shift, rate spike)
 *   200 income       (salary, dividend)
 *   300 expense      (bill, child cost)
 *   400 contribution (offset deposit, ETF DCA)
 *   500 debt         (mortgage payment, extra repayment)
 *   600 asset_move   (buy/sell property, crypto lump sum)
 *   700 tax          (PAYG, CGT, refund)
 */
export type EventPriority = 100 | 200 | 300 | 400 | 500 | 600 | 700;

export type ScenarioEventType =
  | "macro.regime_shift"
  | "macro.rate_spike"
  | "income.payg"
  | "income.salary_change"
  | "income.career_break"
  | "expense.recurring"
  | "expense.child_cost"
  | "contribution.offset_deposit"
  | "contribution.etf_dca"
  | "contribution.etf_lump"
  | "contribution.crypto_lump"
  | "debt.mortgage_payment"
  | "debt.extra_repayment"
  | "debt.refinance"
  | "asset.buy_property"
  | "asset.sell_property"
  | "asset.rentvest"
  | "asset.cash_hold"
  | "tax.payg"
  | "tax.cgt"
  | "tax.refund";

export interface ScenarioEvent {
  id: string;
  type: ScenarioEventType;
  month: MonthKey;
  priority: EventPriority;
  /** Source delta if this event came from one; null for base-plan events. */
  sourceDeltaId: string | null;
  payload: Record<string, unknown>;
}

// ─── Portfolio state (mutated by tick) ───────────────────────────────────────

export interface PropertyState {
  id: string;
  marketValue: number;
  loanBalance: number;
  rate: number;
  monthlyRepayment: number;
  monthlyRent: number;
  monthlyCosts: number;
  offsetBalance: number;
  /**
   * True when this property's monthly P&I is already represented in
   * baseMonthlyExpenses (the dashboard ledger). The engine MUST NOT
   * deduct the mortgage payment a second time when this is true.
   * Default for snapshot-derived PPOR is true; for new acquisitions
   * it is false.
   */
  inLedger?: boolean;

  // ── Tax Policy Engine fields (P0) ─────────────────────────────────────────
  // Optional and additive. Legacy properties default to UNKNOWN classification
  // and no contract date, which means grandfathering can fall back to
  // purchaseDate or be treated conservatively. See client/src/lib/taxPolicyEngine.
  /** Classification driving NG / CGT carve-out logic under a reform regime. */
  propertyType?:
    | "ESTABLISHED"
    | "NEW_BUILD"
    | "BUILD_TO_RENT"
    | "AFFORDABLE_HOUSING"
    | "UNKNOWN";
  /** ISO YYYY-MM-DD contract signing date (grandfathering check). */
  contractDate?: string;
  /** ISO YYYY-MM-DD settlement date (fallback when contract date is missing). */
  purchaseDate?: string;
}

export interface PortfolioState {
  month: MonthKey;
  cash: number;
  etfBalance: number;
  cryptoBalance: number;
  superRoham: number;
  superFara: number;
  properties: PropertyState[];
  /**
   * Cars / vehicles — non-investable but counted in NW for completeness so the
   * engine's net worth reconciles with the dashboard. Held flat by default
   * (depreciation modelled as zero unless rails introduce a `carsDepreciation`).
   * Why: NW-1 audit defect — engine was excluding cars, opening a silent
   * $65k gap vs the dashboard.
   */
  cars: number;
  /**
   * Overseas (Iran) property — non-AUD-denominated real estate held by the
   * household. Grows at a haircut of the AU property growth rule because the
   * macro process driving local property doesn't directly apply offshore.
   */
  iranProperty: number;
  /** Other non-investable assets the user has on snapshot. Held flat. */
  otherAssets: number;
  /**
   * Non-property debts (cards, personal loans, etc.). Paid down deterministically
   * at the dashboard heuristic of 15% annual / 12 monthly so engine and dashboard
   * use the same amortisation profile.
   */
  otherDebts: number;
  /** Cumulative tax paid this FY (resets each July). */
  fyTaxPaid: number;
  /** Trailing 12-month income (used by serviceability calcs). */
  ttmIncome: number;
  /** Trailing 12-month expenses incl. debt service. */
  ttmExpenses: number;
  /** Household has triggered insolvency (cash exhausted, asset sales exhausted). */
  defaulted?: boolean;
  /** Month in which insolvency first occurred (null if solvent). */
  defaultMonth?: MonthKey | null;
  /** Cumulative forced asset sales taken to cover deficits ($). */
  forcedSales?: number;
  /** Cumulative interest accrued on a margin/overdraft when cash went negative. */
  marginInterestAccrued?: number;
}

// ─── Result (output of a full projection) ────────────────────────────────────

/**
 * Seven-percentile fan-chart point: P5/P10/P25/P50/P75/P90/P95.
 *
 * Why all seven:
 *   • P5/P95   — institutional-grade left/right tail (VaR-aligned)
 *   • P10/P90  — outer band, preserved for backward compatibility
 *   • P25/P75  — interquartile (likely range that anchors planning)
 *   • P50      — median
 *
 * Every percentile is computed from the SAME sorted sample array per month,
 * using linear interpolation (see `pct7` in monteCarlo.ts) — i.e. no
 * approximation, no separate bootstrap.
 */
export interface FanPoint {
  month: MonthKey;
  p5:  number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
}

export interface ConfidenceBand {
  /** 0..1 — propagated assumption confidence at this month. */
  level: number;
  /** True when level falls below threshold and UI should render dashed. */
  isLow: boolean;
}

export interface ScenarioResult {
  scenarioId: string;
  snapshotHash: SnapshotHash;
  seed: number;
  runTimestamp: string; // ISO
  netWorthFan: FanPoint[];
  confidence: ConfidenceBand[];
  /** Populated by Phase 10. */
  risk: Record<string, number> | null;
  /** Populated by Phase 13. Sum minus residual = NW delta. */
  attribution: Record<string, number> | null;
  /** Populated by Phase 9. Shape evolves per phase; widened to `unknown` here. */
  serviceability: unknown | null;
}

// ─── Asset scope tags (decision-engine inventory) ────────────────────────────

/**
 * How the engine treats an asset bucket in the base plan.
 *
 *   • current       — exists today, included in initial NW, evolves stochastically
 *   • planned       — settles in the future, NOT in initial NW (deposits aside)
 *   • non-investable — counted in NW but engine does NOT model returns
 *   • excluded      — outside the scope of this base plan entirely
 *
 * The decision engine reports these tags so users can audit exactly which
 * positions feed the projection. Audit defect NW-1 surfaced this gap.
 */
export type AssetScope = "current" | "planned" | "excluded" | "non-investable";

export interface BasePlanAssetTag {
  /** Key into PortfolioState (or synthetic id for derived buckets). */
  key: string;
  scope: AssetScope;
  label: string;
  currentValue: number;
  /** Plain-English explanation of why this bucket carries the chosen scope. */
  rationale: string;
}

// ─── Minimal sanity: types compile in isolation ──────────────────────────────

export const __V2_TYPES_VERSION__ = "phase-1-skeleton" as const;

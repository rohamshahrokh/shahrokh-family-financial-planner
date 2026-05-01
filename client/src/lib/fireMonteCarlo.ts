/**
 * fireMonteCarlo.ts — Professional FIRE Monte Carlo Simulation Engine
 *
 * Institutional-grade FIRE probability engine.
 * Key differences from monteCarloEngine.ts (10-year net-worth engine):
 *   • Simulates from current age → age 65 (not just 10 years)
 *   • Monthly time steps for full horizon
 *   • Box-Muller normal distribution with Cholesky-decomposed correlation matrix
 *   • Random events module: job loss, market crash, rate jump, recession, bull, windfall
 *   • FIRE trigger: investable NW ≥ target_capital = annual_passive / (SWR/100)
 *   • Outputs: prob FIRE by target age, median/P10/P90 FIRE year, fan chart, histogram,
 *              probability-by-age curve, offset vs ETF comparison, property acquisition prob
 *   • 1,000 / 5,000 / 10,000 simulation modes
 *   • Pure function — no DOM references, Web-Worker safe
 *
 * All monetary values in AUD.
 * Returns are annual percentages; internally converted to monthly.
 */

// ─── Box-Muller Standard Normal ──────────────────────────────────────────────

function randNormal(mean: number, stdDev: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + stdDev * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ─── Cholesky decomposition for 4×4 correlation matrix ──────────────────────
// Returns lower-triangular L such that L·Lᵀ = Σ (correlation matrix).
// We use 4 correlated factors: [stocks, crypto, inflation, property].
//   rho_sc  = stocks↔crypto
//   rho_ir  = inflation↔rates (applied to mortgage rate shocks)
//   rho_rp  = rates↔property (negative)
//   rho_sp  = stocks↔property

function buildCholesky(rho_sc: number, rho_ir: number, rho_rp: number, rho_sp: number): number[][] {
  // 4×4 correlation matrix rows: [stocks, crypto, inflation, property]
  const C = [
    [1,      rho_sc, 0,      rho_sp ],
    [rho_sc, 1,      0,      rho_sp * 0.5],
    [0,      0,      1,      rho_ir ],
    [rho_sp, rho_sp * 0.5, rho_ir, 1],
  ];
  const n = 4;
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        L[i][j] = Math.sqrt(Math.max(C[i][i] - sum, 1e-10));
      } else {
        L[i][j] = (C[i][j] - sum) / L[j][j];
      }
    }
  }
  return L;
}

// Produce 4 correlated standard normals using Cholesky L
function correlatedNormals(L: number[][]): [number, number, number, number] {
  const z = [
    randNormal(0, 1),
    randNormal(0, 1),
    randNormal(0, 1),
    randNormal(0, 1),
  ];
  const x: number[] = new Array(4).fill(0);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j <= i; j++) {
      x[i] += L[i][j] * z[j];
    }
  }
  return [x[0], x[1], x[2], x[3]];
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FireMCSettings {
  // Profile
  currentAge:             number;     // default 36
  partnerAge:             number;     // default 34
  targetFireAge:          number;     // default 55
  targetPassiveMonthly:   number;     // default 20000
  swrPct:                 number;     // default 4.0

  // Starting balances
  startPPOR:              number;
  startCash:              number;
  startOffset:            number;
  startSuper:             number;
  startStocks:            number;
  startCrypto:            number;
  startMortgage:          number;
  startOtherDebts:        number;
  startMonthlyIncome:     number;
  startMonthlyExpenses:   number;

  // Return assumptions (% pa)
  meanStockReturn:        number;
  meanPropertyReturn:     number;
  meanCryptoReturn:       number;
  meanSuperReturn:        number;
  meanInflation:          number;
  meanIncomeGrowth:       number;
  meanExpenseGrowth:      number;
  meanMortgageRate:       number;

  // Volatility (annual std dev %)
  volStocks:              number;
  volProperty:            number;
  volCrypto:              number;
  volSuper:               number;
  volInflation:           number;

  // Correlation matrix
  rhoStocksCrypto:        number;   // default 0.7
  rhoInflationRates:      number;   // default 0.6
  rhoRatesProperty:       number;   // default -0.3
  rhoStocksProperty:      number;   // default 0.2

  // Random events
  evJobLossProb:          number;   // % per year
  evJobLossDurationMo:    number;   // months income stops
  evMarketCrashProb:      number;   // % per year
  evMarketCrashPct:       number;   // % portfolio drop (stocks+crypto)
  evRateJumpProb:         number;   // % per year
  evRateJumpBps:          number;   // basis points added to mortgage rate
  evRecessionProb:        number;   // % per year
  evRecessionIncomeCut:   number;   // % income reduction
  evBullMarketProb:       number;   // % per year
  evBullMarketPct:        number;   // % stocks portfolio boost
  evWindfallProb:         number;   // % per year
  evWindfallAmount:       number;   // $ one-off inflow
  evLargeExpenseProb:     number;   // % per year
  evLargeExpenseAmount:   number;   // $ one-off outflow

  // Offset vs ETF comparison
  compareOffsetVsEtf:     boolean;
  etfExpectedReturn:      number;   // % pa  (what offset savings would earn if in ETFs)

  // Future property acquisition
  propNextBuyYear?:       number;   // if set, simulate a property purchase in this year
  propNextBuyPrice?:      number;
  propNextBuyDepositPct:  number;
  propNextBuyGrowthPa:    number;
  propNextRentPw:         number;

  // Stock correction / crypto bull params (inherited from MCVolatilityParams)
  stockCorrectionProb:    number;
  stockCorrectionSize:    number;
  cryptoCrashProb:        number;
  cryptoCrashSize:        number;
  cryptoBullProb:         number;
  cryptoBullUpside:       number;

  // Simulation config
  simulationCount:        number;   // 1000 | 5000 | 10000
}

// ─── Plan Input Types ───────────────────────────────────────────────────────

export interface FireMCPlanInput {
  properties:           PropertyForPlan[];
  stockDCASchedules:    DCAForPlan[];
  cryptoDCASchedules:   DCAForPlan[];
  plannedStockOrders:   PlannedOrderForPlan[];
  plannedCryptoOrders:  PlannedOrderForPlan[];
  bills:                BillForPlan[];
  ngAnnualBenefit?:     number;
}

export interface PropertyForPlan {
  settlement_date?:  string;
  purchase_date?:    string;
  rental_start_date?: string;
  deposit:           number;
  stamp_duty?:       number;
  legal_fees?:       number;
  loan_setup_fees?:  number;
  renovation_costs?: number;
  building_inspection?: number;
  loan_amount:       number;
  interest_rate:     number;
  loan_term:         number;
  weekly_rent:       number;
  rental_growth:     number;
  vacancy_rate:      number;
  management_fee:    number;
  council_rates?:    number;
  insurance?:        number;
  maintenance?:      number;
  water_rates?:      number;
  body_corporate?:   number;
  land_tax?:         number;
  name?:             string;
}

export interface DCAForPlan {
  enabled:    boolean;
  amount:     number;
  frequency:  string;   // 'weekly' | 'fortnightly' | 'monthly'
  start_date: string;
  end_date?:  string | null;
}

export interface PlannedOrderForPlan {
  action:       string;  // 'buy' | 'sell'
  amount_aud:   number;
  planned_date: string;
  status:       string;  // 'planned'
}

export interface BillForPlan {
  amount:     number;
  frequency:  string;
  is_active?: boolean;
}

// ─── Result types ─────────────────────────────────────────────────────────────

export interface FireFanPoint {
  year:   number;
  p10:    number;
  p25:    number;
  median: number;
  p75:    number;
  p90:    number;
}

export interface FireHistPoint {
  year:  number;
  count: number;
  pct:   number;
}

export interface FireProbByAge {
  age:         number;
  probability: number;   // 0–100
}

export interface OffsetVsEtfResult {
  offsetNwP50:    number;
  etfNwP50:       number;
  offsetFireYear: number | null;
  etfFireYear:    number | null;
  offsetProb:     number;
  etfProb:        number;
  mortgageSaved:  number;   // interest saved by keeping offset
  etfGrowthGain:  number;   // extra growth from ETF vs offset
}

export interface FireMCResult {
  // FIRE probability
  probFireByTarget:     number;   // % of sims that fire by target age
  medianFireYear:       number | null;
  p10FireYear:          number | null;   // pessimistic (10th pct hits FIRE)
  p90FireYear:          number | null;   // optimistic (90th pct hits FIRE)
  neverFirePct:         number;

  // Net worth fan chart (year → percentiles)
  fanData:              FireFanPoint[];

  // FIRE year histogram
  fireYearHistogram:    FireHistPoint[];

  // Probability of FIRE by age
  fireProbByAge:        FireProbByAge[];

  // NW at target fire age
  nwP10AtTarget:        number;
  nwP50AtTarget:        number;
  nwP90AtTarget:        number;

  // Offset vs ETF
  offsetVsEtf:          OffsetVsEtfResult | null;

  // Property acquisition probability
  propAcquisitionProb:  number;

  // Risk metrics
  probCashShortfall:    number;
  probNegCashflow:      number;
  highestRiskYear:      number;
  biggestRiskDriver:    string;

  // Narrative
  keyRisks:             string[];
  recommendedActions:   string[];

  // Run metadata
  ranAt:                string;
  simulationCount:      number;
  runtimeMs:            number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeNum(v: number | null | undefined): number {
  if (v == null || isNaN(v) || !isFinite(v)) return 0;
  return v;
}

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx    = Math.max(0, Math.floor((p / 100) * sorted.length) - 1);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function calcMonthlyRepayment(principal: number, annualRatePct: number, termYears: number): number {
  if (principal <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// ─── DEFAULT SETTINGS (used when DB row not yet seeded) ───────────────────────

export const DEFAULT_FIRE_MC_SETTINGS: FireMCSettings = {
  currentAge:           36,
  partnerAge:           34,
  targetFireAge:        55,
  targetPassiveMonthly: 20000,
  swrPct:               4.0,
  startPPOR:            1510000,
  startCash:            220000,
  startOffset:          0,
  startSuper:           87000,
  startStocks:          0,
  startCrypto:          0,
  startMortgage:        1200000,
  startOtherDebts:      19000,
  startMonthlyIncome:   22000,
  startMonthlyExpenses: 14540,
  meanStockReturn:      10.0,
  meanPropertyReturn:   6.5,
  meanCryptoReturn:     20.0,
  meanSuperReturn:      9.5,
  meanInflation:        3.0,
  meanIncomeGrowth:     3.5,
  meanExpenseGrowth:    3.0,
  meanMortgageRate:     6.5,
  volStocks:            18.0,
  volProperty:          5.0,
  volCrypto:            60.0,
  volSuper:             8.0,
  volInflation:         0.8,
  rhoStocksCrypto:      0.7,
  rhoInflationRates:    0.6,
  rhoRatesProperty:     -0.3,
  rhoStocksProperty:    0.2,
  evJobLossProb:        5.0,
  evJobLossDurationMo:  6,
  evMarketCrashProb:    7.0,
  evMarketCrashPct:     35.0,
  evRateJumpProb:       15.0,
  evRateJumpBps:        150.0,
  evRecessionProb:      10.0,
  evRecessionIncomeCut: 20.0,
  evBullMarketProb:     12.0,
  evBullMarketPct:      40.0,
  evWindfallProb:       3.0,
  evWindfallAmount:     100000,
  evLargeExpenseProb:   8.0,
  evLargeExpenseAmount: 50000,
  compareOffsetVsEtf:   true,
  etfExpectedReturn:    10.0,
  propNextBuyYear:      undefined,
  propNextBuyPrice:     undefined,
  propNextBuyDepositPct: 20.0,
  propNextBuyGrowthPa:  6.0,
  propNextRentPw:       600,
  stockCorrectionProb:  15.0,
  stockCorrectionSize:  30.0,
  cryptoCrashProb:      25.0,
  cryptoCrashSize:      65.0,
  cryptoBullProb:       20.0,
  cryptoBullUpside:     150.0,
  simulationCount:      5000,
};

// ─── PRESET FACTORY ──────────────────────────────────────────────────────────

export type PresetKey = 'conservative' | 'base' | 'growth' | 'aggressive' | 'property_heavy' | 'stock_heavy' | 'custom';

export const PRESET_OVERRIDES: Record<PresetKey, Partial<FireMCSettings>> = {
  conservative: {
    meanStockReturn: 6.0, meanPropertyReturn: 4.0, meanCryptoReturn: 10.0, meanSuperReturn: 7.5,
    meanInflation: 3.5, meanIncomeGrowth: 2.5, meanExpenseGrowth: 3.5, meanMortgageRate: 7.0,
    volStocks: 22.0, volProperty: 7.0, volCrypto: 70.0, volSuper: 10.0,
    evMarketCrashProb: 12.0, evJobLossProb: 8.0, evBullMarketProb: 8.0,
  },
  base: {
    meanStockReturn: 10.0, meanPropertyReturn: 6.5, meanCryptoReturn: 20.0, meanSuperReturn: 9.5,
    meanInflation: 3.0, meanIncomeGrowth: 3.5, meanExpenseGrowth: 3.0, meanMortgageRate: 6.5,
    volStocks: 18.0, volProperty: 5.0, volCrypto: 60.0, volSuper: 8.0,
    evMarketCrashProb: 7.0, evJobLossProb: 5.0, evBullMarketProb: 12.0,
  },
  growth: {
    meanStockReturn: 12.0, meanPropertyReturn: 7.5, meanCryptoReturn: 30.0, meanSuperReturn: 11.0,
    meanInflation: 2.5, meanIncomeGrowth: 4.5, meanExpenseGrowth: 2.5, meanMortgageRate: 6.0,
    volStocks: 16.0, volProperty: 4.5, volCrypto: 55.0, volSuper: 7.0,
    evMarketCrashProb: 5.0, evJobLossProb: 4.0, evBullMarketProb: 15.0,
  },
  aggressive: {
    meanStockReturn: 15.0, meanPropertyReturn: 8.5, meanCryptoReturn: 50.0, meanSuperReturn: 13.0,
    meanInflation: 2.0, meanIncomeGrowth: 5.5, meanExpenseGrowth: 2.0, meanMortgageRate: 5.5,
    volStocks: 20.0, volProperty: 6.0, volCrypto: 65.0, volSuper: 9.0,
    evMarketCrashProb: 4.0, evJobLossProb: 3.0, evBullMarketProb: 20.0,
  },
  property_heavy: {
    meanStockReturn: 8.0, meanPropertyReturn: 9.0, meanCryptoReturn: 8.0, meanSuperReturn: 9.0,
    meanInflation: 3.0, meanIncomeGrowth: 3.5, meanExpenseGrowth: 3.0, meanMortgageRate: 6.5,
    volStocks: 14.0, volProperty: 5.5, volCrypto: 50.0, volSuper: 8.0,
    evMarketCrashProb: 5.0, evJobLossProb: 5.0, evBullMarketProb: 10.0,
  },
  stock_heavy: {
    meanStockReturn: 13.0, meanPropertyReturn: 5.0, meanCryptoReturn: 15.0, meanSuperReturn: 11.0,
    meanInflation: 2.8, meanIncomeGrowth: 4.0, meanExpenseGrowth: 2.8, meanMortgageRate: 6.0,
    volStocks: 19.0, volProperty: 4.0, volCrypto: 55.0, volSuper: 8.5,
    evMarketCrashProb: 6.0, evJobLossProb: 5.0, evBullMarketProb: 14.0,
  },
  custom: {},  // user-defined — no overrides, uses settings table directly
};

export function applyPreset(base: FireMCSettings, key: PresetKey): FireMCSettings {
  return { ...base, ...PRESET_OVERRIDES[key] };
}

// ─── Plan-level helpers ──────────────────────────────────────────────────────

function dcaMonthlyFromPlan(amount: number, frequency: string): number {
  switch (frequency) {
    case 'weekly':      return amount * (52 / 12);
    case 'fortnightly': return amount * (26 / 12);
    case 'monthly':     return amount;
    case 'quarterly':   return amount / 3;
    default:            return amount;
  }
}

function dateToMonthIndex(dateStr: string, currentYear: number): number {
  const d = new Date(dateStr);
  return (d.getFullYear() - currentYear) * 12 + d.getMonth();
}

// ─── MAIN ENGINE ─────────────────────────────────────────────────────────────

export function runFireMonteCarlo(settings: FireMCSettings, planInput?: FireMCPlanInput): FireMCResult {
  const startTime = Date.now();
  const s = settings;
  const N_SIM = Math.max(100, Math.min(10000, safeNum(s.simulationCount) || 5000));

  // Calendar years
  const currentYear  = new Date().getFullYear();
  const endYear      = currentYear + Math.max(0, 65 - s.currentAge);  // simulate to age 65 minimum
  const fireAgeYears = s.targetFireAge - s.currentAge;  // years until target FIRE age
  const N_YEARS      = endYear - currentYear + 1;
  const N_MONTHS     = N_YEARS * 12;

  // FIRE target capital = annual passive / SWR
  const annualPassiveTarget = s.targetPassiveMonthly * 12;
  const fireTargetCapital   = annualPassiveTarget / (s.swrPct / 100);

  // Mortgage assumptions
  const mortgageTermYears = 30;
  const initialMortgageRate = s.meanMortgageRate;

  // ── Pre-compute monthly std devs ──────────────────────────────────────────
  const stockStdMo   = s.volStocks   / 100 / Math.sqrt(12);
  const propStdMo    = s.volProperty / 100 / Math.sqrt(12);
  const cryptoStdMo  = s.volCrypto   / 100 / Math.sqrt(12);
  const superStdMo   = s.volSuper    / 100 / Math.sqrt(12);
  const inflStdMo    = s.volInflation / 100 / Math.sqrt(12);

  // ── Cholesky decomposition once (all sims share the same correlation matrix) ──
  const L = buildCholesky(s.rhoStocksCrypto, s.rhoInflationRates, s.rhoRatesProperty, s.rhoStocksProperty);

  // ── Pre-compute plan-level deterministic cash deltas ──────────────────────
  // These override/augment the scalar settings for properties, DCA, and lump sums.
  // Structure: monthDeltasCash[mi] = net cash delta from plan events in that month
  //            monthDeltasPropEquity[mi] = { value, loan } deltas for each IP
  //            monthDeltasStocks[mi] = cash outflow going INTO stocks (DCA + buys)
  //            monthDeltasCrypto[mi] = cash outflow going INTO crypto

  // Per-month net cash flows from plan (outflows negative, inflows positive)
  const planCashDelta:   Float64Array = new Float64Array(N_MONTHS);
  const planStockDelta:  Float64Array = new Float64Array(N_MONTHS); // $ added to stocks
  const planCryptoDelta: Float64Array = new Float64Array(N_MONTHS); // $ added to crypto

  // Investment properties from plan — each carries its own value + loan state
  interface PlanIPState {
    settledAtMi:    number;
    rentalStartMi:  number;
    initialValue:   number;
    loanAmount:     number;
    interestRate:   number;  // % pa
    loanTerm:       number;  // years
    weeklyRent:     number;
    rentalGrowth:   number;  // % pa
    vacancyRate:    number;  // %
    managementFee:  number;  // %
    monthlyHolding: number;  // sum of council/insurance/maintenance etc /12
    purchaseCosts:  number;  // deposit + stamp duty + legal etc
  }
  const planIPStates: PlanIPState[] = [];

  if (planInput) {
    // ── Investment properties ──
    for (const prop of planInput.properties) {
      const settleDateStr = prop.settlement_date || prop.purchase_date;
      const settledAtMi = settleDateStr
        ? dateToMonthIndex(settleDateStr, currentYear)
        : 0;
      const rentalStartMi = prop.rental_start_date
        ? dateToMonthIndex(prop.rental_start_date, currentYear)
        : settledAtMi + 1;

      const purchaseCosts =
        safeNum(prop.deposit) +
        safeNum(prop.stamp_duty) +
        safeNum(prop.legal_fees) +
        safeNum(prop.loan_setup_fees) +
        safeNum(prop.renovation_costs) +
        safeNum(prop.building_inspection);

      const monthlyHolding = (
        safeNum(prop.council_rates) +
        safeNum(prop.insurance) +
        safeNum(prop.maintenance) +
        safeNum(prop.water_rates) +
        safeNum(prop.body_corporate) +
        safeNum(prop.land_tax)
      ) / 12;

      planIPStates.push({
        settledAtMi,
        rentalStartMi,
        initialValue:  safeNum(prop.loan_amount) + safeNum(prop.deposit),
        loanAmount:    safeNum(prop.loan_amount),
        interestRate:  safeNum(prop.interest_rate) || 6.5,
        loanTerm:      safeNum(prop.loan_term) || 30,
        weeklyRent:    safeNum(prop.weekly_rent),
        rentalGrowth:  safeNum(prop.rental_growth) || 3,
        vacancyRate:   safeNum(prop.vacancy_rate),
        managementFee: safeNum(prop.management_fee),
        monthlyHolding,
        purchaseCosts,
      });

      // Deduct purchase costs in settlement month
      if (settledAtMi >= 0 && settledAtMi < N_MONTHS) {
        planCashDelta[settledAtMi] -= purchaseCosts;
      }
    }

    // ── Stock DCA ──
    for (const dca of planInput.stockDCASchedules) {
      if (!dca.enabled) continue;
      const startMi  = dateToMonthIndex(dca.start_date, currentYear);
      const endMi    = dca.end_date ? dateToMonthIndex(dca.end_date, currentYear) : N_MONTHS - 1;
      const monthly  = dcaMonthlyFromPlan(safeNum(dca.amount), dca.frequency);
      for (let mi = Math.max(0, startMi); mi <= Math.min(N_MONTHS - 1, endMi); mi++) {
        planCashDelta[mi]  -= monthly;
        planStockDelta[mi] += monthly;
      }
    }

    // ── Crypto DCA ──
    for (const dca of planInput.cryptoDCASchedules) {
      if (!dca.enabled) continue;
      const startMi  = dateToMonthIndex(dca.start_date, currentYear);
      const endMi    = dca.end_date ? dateToMonthIndex(dca.end_date, currentYear) : N_MONTHS - 1;
      const monthly  = dcaMonthlyFromPlan(safeNum(dca.amount), dca.frequency);
      for (let mi = Math.max(0, startMi); mi <= Math.min(N_MONTHS - 1, endMi); mi++) {
        planCashDelta[mi]   -= monthly;
        planCryptoDelta[mi] += monthly;
      }
    }

    // ── Planned stock lump-sum orders ──
    for (const order of planInput.plannedStockOrders) {
      if (order.status !== 'planned') continue;
      const mi = dateToMonthIndex(order.planned_date, currentYear);
      if (mi >= 0 && mi < N_MONTHS) {
        const sign = order.action === 'buy' ? 1 : -1;
        planCashDelta[mi]  -= sign * safeNum(order.amount_aud);
        planStockDelta[mi] += sign * safeNum(order.amount_aud);
      }
    }

    // ── Planned crypto lump-sum orders ──
    for (const order of planInput.plannedCryptoOrders) {
      if (order.status !== 'planned') continue;
      const mi = dateToMonthIndex(order.planned_date, currentYear);
      if (mi >= 0 && mi < N_MONTHS) {
        const sign = order.action === 'buy' ? 1 : -1;
        planCashDelta[mi]   -= sign * safeNum(order.amount_aud);
        planCryptoDelta[mi] += sign * safeNum(order.amount_aud);
      }
    }

    // ── Bills (already embedded in expenses baseline — but if bills are SEPARATE, add them) ──
    // Bills are already folded into s.startMonthlyExpenses in the default path.
    // When planInput provides them explicitly, they are additional outflows:
    for (const bill of planInput.bills) {
      if (bill.is_active === false) continue;
      const monthly = dcaMonthlyFromPlan(safeNum(bill.amount), bill.frequency || 'monthly');
      for (let mi = 0; mi < N_MONTHS; mi++) {
        planCashDelta[mi] -= monthly;
      }
    }
  }

  // ── Property purchase month index (deterministic event) ──────────────────
  const propBuyMi = (s.propNextBuyYear && s.propNextBuyPrice)
    ? (s.propNextBuyYear - currentYear) * 12
    : -1;

  // ── Result collectors ─────────────────────────────────────────────────────
  // Per-year NW for fan chart (only every December = mi % 12 === 11)
  const yearNWSnapshots:  number[][] = Array.from({ length: N_YEARS }, () => new Array(N_SIM).fill(0));
  // For offset vs ETF comparison
  const yearNWSnapshotsEtf: number[][] = s.compareOffsetVsEtf
    ? Array.from({ length: N_YEARS }, () => new Array(N_SIM).fill(0))
    : [];

  // FIRE year per simulation (year reached; null = never)
  const fireYear:    (number | null)[] = new Array(N_SIM).fill(null);
  const fireYearEtf: (number | null)[] = new Array(N_SIM).fill(null);

  // NW at target fire age per sim
  const nwAtTargetAge: number[] = new Array(N_SIM).fill(0);

  // FIRE probability by age accumulator
  const fireCountByAge: number[] = new Array(N_YEARS + 1).fill(0);

  // Risk metrics
  let countCashShortfall  = 0;
  let countNegCashflow    = 0;
  let countPropAcquired   = 0;
  const negCFByYear = new Array(N_YEARS).fill(0);

  // ── Mortgage baseline — deterministic repayment ignoring random rate shocks ──
  const baseMonthlyRepayment = calcMonthlyRepayment(s.startMortgage, initialMortgageRate, mortgageTermYears);

  // ── Per-simulation IP state arrays for plan-driven path ────────────────
  // Flat arrays: [sim * MAX_IPS + ipIdx] = value or loan balance
  const MAX_IPS = 10;
  const ipValues = planInput && planIPStates.length > 0
    ? new Float64Array(N_SIM * MAX_IPS)
    : null as unknown as Float64Array;
  const ipLoans  = planInput && planIPStates.length > 0
    ? new Float64Array(N_SIM * MAX_IPS)
    : null as unknown as Float64Array;
  if (planInput && planIPStates.length > 0) {
    for (let sim2 = 0; sim2 < N_SIM; sim2++) {
      for (let ipIdx = 0; ipIdx < planIPStates.length && ipIdx < MAX_IPS; ipIdx++) {
        ipValues[sim2 * MAX_IPS + ipIdx] = planIPStates[ipIdx].initialValue;
        ipLoans [sim2 * MAX_IPS + ipIdx] = planIPStates[ipIdx].loanAmount;
      }
    }
  }

  // ── Main simulation loop ──────────────────────────────────────────────────
  for (let sim = 0; sim < N_SIM; sim++) {
    // --- Starting balances ---
    let ppor      = safeNum(s.startPPOR);
    let cash      = safeNum(s.startCash) + safeNum(s.startOffset);   // offset reduces mortgage interest
    let superBal  = safeNum(s.startSuper);
    let stocks    = safeNum(s.startStocks);
    let crypto    = safeNum(s.startCrypto);
    let mortgage  = safeNum(s.startMortgage);
    let otherDebts= safeNum(s.startOtherDebts);
    let income    = safeNum(s.startMonthlyIncome);
    let expenses  = safeNum(s.startMonthlyExpenses);

    // Investment property (acquired mid-simulation)
    let invPropValue   = 0;
    let invPropLoan    = 0;
    let invPropStartMi = -1;
    let propAcquired   = false;

    // State flags
    let hadNegCF        = false;
    let hadShortfall    = false;
    let reachedFire     = false;
    let fireReachedYear: number | null = null;

    // ── Draw per-simulation annual random events ──────────────────────────
    // Each event is decided per-year for this simulation at sim start.
    const evJobLoss     = new Array(N_YEARS).fill(false);
    const evMarketCrash = new Array(N_YEARS).fill(false);
    const evRateJump    = new Array(N_YEARS).fill(0);   // extra rate bps
    const evRecession   = new Array(N_YEARS).fill(false);
    const evBullMarket  = new Array(N_YEARS).fill(false);
    const evWindfall    = new Array(N_YEARS).fill(false);
    const evLargeExpense= new Array(N_YEARS).fill(false);
    const stockCorrection = new Array(N_YEARS).fill(false);
    const cryptoCrash   = new Array(N_YEARS).fill(false);
    const cryptoBull    = new Array(N_YEARS).fill(false);

    for (let yi = 0; yi < N_YEARS; yi++) {
      if (Math.random() < s.evJobLossProb     / 100) evJobLoss[yi]      = true;
      if (Math.random() < s.evMarketCrashProb  / 100) evMarketCrash[yi] = true;
      if (Math.random() < s.evRateJumpProb    / 100) evRateJump[yi]     = s.evRateJumpBps / 100;
      if (Math.random() < s.evRecessionProb   / 100) evRecession[yi]    = true;
      if (!evMarketCrash[yi] && Math.random() < s.evBullMarketProb / 100) evBullMarket[yi] = true;
      if (Math.random() < s.evWindfallProb    / 100) evWindfall[yi]     = true;
      if (Math.random() < s.evLargeExpenseProb / 100) evLargeExpense[yi] = true;
      if (Math.random() < s.stockCorrectionProb / 100) stockCorrection[yi] = true;
      if (Math.random() < s.cryptoCrashProb  / 100) cryptoCrash[yi]    = true;
      if (!cryptoCrash[yi] && Math.random() < s.cryptoBullProb / 100) cryptoBull[yi] = true;
    }

    // ── Parallel ETF simulation (offset cash deployed to ETFs) ───────────
    let cashEtf    = 0;   // no offset — all cash is deployed to stocks
    let stocksEtf  = stocks + safeNum(s.startOffset);  // offset capital → ETFs
    let mortgageEtf = mortgage;  // no offset benefit
    let reachedFireEtf     = false;
    let fireReachedYearEtf: number | null = null;

    // ── Monthly loop ─────────────────────────────────────────────────────
    let jobLossMonthsRemaining = 0;
    let recessionMonthsRemaining = 0;

    for (let mi = 0; mi < N_MONTHS; mi++) {
      const yi  = Math.floor(mi / 12);
      const isJan = (mi % 12) === 0;
      const isAug = (mi % 12) === 7;   // Australian tax refund month

      // ── Correlated random shocks for this month ──
      const [zsStocks, zsCrypto, zsInflation, zsProp] = correlatedNormals(L);

      // ── Asset returns (monthly, correlated) ──
      const stockRet  = s.meanStockReturn   / 100 / 12 + stockStdMo   * zsStocks;
      const propRet   = s.meanPropertyReturn / 100 / 12 + propStdMo    * zsProp;
      const cryptoRet = s.meanCryptoReturn  / 100 / 12 + cryptoStdMo  * zsCrypto;
      const superRet  = s.meanSuperReturn   / 100 / 12 + superStdMo   * randNormal(0, 1);
      const inflShock = s.meanInflation     / 100 / 12 + inflStdMo    * zsInflation;

      // ── Apply annual events at January of each year ──
      let extraStockShock  = 0;
      let extraCryptoShock = 0;
      let rateExtra        = 0;   // extra rate added to mortgage this year

      if (isJan) {
        // Job loss event
        if (evJobLoss[yi]) jobLossMonthsRemaining = s.evJobLossDurationMo;
        // Market crash: hit stocks and crypto immediately
        if (evMarketCrash[yi]) {
          extraStockShock  = -s.evMarketCrashPct / 100;
          extraCryptoShock = -s.evMarketCrashPct * 0.8 / 100;
        }
        // Bull market
        if (!evMarketCrash[yi] && evBullMarket[yi]) {
          extraStockShock = s.evBullMarketPct / 100;
        }
        // Rate jump (affects entire year)
        rateExtra = evRateJump[yi];
        // Recession: income cut
        if (evRecession[yi]) recessionMonthsRemaining = 12;
        // Stock correction (extra shock in January)
        if (stockCorrection[yi]) {
          extraStockShock += randNormal(-s.stockCorrectionSize / 100, s.stockCorrectionSize * 0.3 / 100);
        }
        // Crypto crash / bull
        if (cryptoCrash[yi]) {
          extraCryptoShock += randNormal(-s.cryptoCrashSize / 100, s.cryptoCrashSize * 0.2 / 100);
        } else if (cryptoBull[yi]) {
          extraCryptoShock += randNormal(s.cryptoBullUpside / 100, s.cryptoBullUpside * 0.3 / 100);
        }
      }

      // ── Effective mortgage rate for this year ──
      const effectiveRatePct = s.meanMortgageRate + rateExtra;

      // ── Asset value growth ──
      ppor      *= (1 + propRet);
      stocks    *= (1 + stockRet + extraStockShock);
      crypto    *= (1 + cryptoRet + extraCryptoShock);
      superBal  *= (1 + superRet);

      // Protect against negative asset values from extreme shocks
      stocks    = Math.max(0, stocks);
      crypto    = Math.max(0, crypto);
      superBal  = Math.max(0, superBal);

      // ── Income / expenses drift with inflation ──
      const effectiveIncomeMult = recessionMonthsRemaining > 0
        ? 1 - s.evRecessionIncomeCut / 100 / 12
        : 1 + s.meanIncomeGrowth / 100 / 12;
      income   *= effectiveIncomeMult;

      const effectiveIncomeThisMonth = jobLossMonthsRemaining > 0 ? 0 : income;
      if (jobLossMonthsRemaining > 0) jobLossMonthsRemaining--;
      if (recessionMonthsRemaining > 0) recessionMonthsRemaining--;

      expenses *= (1 + safeNum(inflShock) + s.meanExpenseGrowth / 100 / 12);

      // ── Investment properties — plan-driven or legacy scalar ──────────────
      let propRent  = 0;
      let propRepay = 0;

      if (planInput && planIPStates.length > 0) {
        // ── Plan-driven path: iterate all real IPs from planInput ──
        for (let ipIdx = 0; ipIdx < planIPStates.length; ipIdx++) {
          const ip = planIPStates[ipIdx];
          if (mi < ip.settledAtMi) continue;  // not yet settled

          // Grow IP value by stochastic property return
          ipValues[sim * MAX_IPS + ipIdx]   *= (1 + propRet);
          const ipV   = ipValues[sim * MAX_IPS + ipIdx];
          const ipL   = ipLoans[sim * MAX_IPS + ipIdx];

          // Monthly loan repayment
          const ipRate     = effectiveRatePct / 100 / 12;
          const ipInterest = ipL * ipRate;
          const ipRepayAmt = calcMonthlyRepayment(ip.loanAmount, effectiveRatePct, ip.loanTerm);
          ipLoans[sim * MAX_IPS + ipIdx] = Math.max(0, ipL - Math.max(0, ipRepayAmt - ipInterest));
          propRepay += ipRepayAmt;

          // Rental income + holding costs (from rental start)
          if (mi >= ip.rentalStartMi) {
            const monthsSinceRental = mi - ip.rentalStartMi;
            const yearsSinceRental  = monthsSinceRental / 12;
            const annRent = ip.weeklyRent * 52
              * (1 - ip.vacancyRate / 100)
              * (1 - ip.managementFee / 100)
              * Math.pow(1 + ip.rentalGrowth / 100, yearsSinceRental);
            propRent += annRent / 12;
            propRepay += ip.monthlyHolding;  // holding costs are an outflow
          }
        }
      } else if (propBuyMi >= 0) {
        // ── Legacy scalar path: single propNextBuy from settings ──
        if (mi === propBuyMi && !propAcquired) {
          const buyPrice   = safeNum(s.propNextBuyPrice) || 800000;
          const depositAmt = buyPrice * s.propNextBuyDepositPct / 100;
          const loanAmt    = buyPrice - depositAmt;
          invPropValue     = buyPrice;
          invPropLoan      = loanAmt;
          invPropStartMi   = mi;
          cash            -= depositAmt;
          propAcquired     = true;
        }
        if (propAcquired && mi >= invPropStartMi) {
          invPropValue *= (1 + propRet);
          const invRate     = effectiveRatePct / 100 / 12;
          const invInterest = invPropLoan * invRate;
          propRepay         = calcMonthlyRepayment(safeNum(s.propNextBuyPrice) * (1 - s.propNextBuyDepositPct / 100), effectiveRatePct, 30);
          invPropLoan       = Math.max(0, invPropLoan - Math.max(0, propRepay - invInterest));
          const annRent     = safeNum(s.propNextRentPw) * 52 * 0.95;
          propRent          = annRent / 12;
        }
      }

      // ── PPOR mortgage ──
      const pporRate    = effectiveRatePct / 100 / 12;
      const pporInterest = Math.max(0, mortgage) * pporRate;
      const pporRepay   = calcMonthlyRepayment(Math.max(0, mortgage), effectiveRatePct, mortgageTermYears);
      const pporPrincipal = Math.max(0, pporRepay - pporInterest);
      mortgage         = Math.max(0, mortgage - pporPrincipal);

      // ── Cash interest (on offset/savings — earns high-yield rate) ──
      const cashRate   = 4.5 / 100 / 12;
      const cashInterest = Math.max(0, cash) * cashRate;

      // ── One-off events (applied in January of event year) ──
      let oneOffCash = 0;
      if (isJan) {
        if (evWindfall[yi])     oneOffCash += s.evWindfallAmount;
        if (evLargeExpense[yi]) oneOffCash -= s.evLargeExpenseAmount;
      }

      // ── Net monthly cashflow ──
      // Plan-driven additional cash deltas (DCA buys, lump sums, bill overrides)
      const planDelta = planInput ? planCashDelta[mi] : 0;
      const monthlyCF = effectiveIncomeThisMonth + propRent + cashInterest + oneOffCash
        - expenses - pporRepay - propRepay + planDelta;

      // Plan-driven asset accumulation (DCA stocks/crypto flowing in)
      if (planInput) {
        stocks += planStockDelta[mi];
        crypto += planCryptoDelta[mi];
      }

      cash += monthlyCF;

      // NG tax benefit from plan (lump-sum in August each year)
      if (planInput && planInput.ngAnnualBenefit && planInput.ngAnnualBenefit > 0) {
        const calMonth = ((mi % 12) + 1);  // 1-based calendar month
        if (calMonth === 8) {
          cash += planInput.ngAnnualBenefit;
        }
      }

      // Super guarantee (9.5% pa → added to super monthly, not cash)
      superBal += effectiveIncomeThisMonth * 0.115 / 12;

      if (monthlyCF < -500) {
        hadNegCF = true;
        negCFByYear[yi]++;
      }
      if (cash < 20000) hadShortfall = true;

      // ── ETF parallel track ──
      if (s.compareOffsetVsEtf) {
        stocksEtf *= (1 + stockRet + extraStockShock);
        stocksEtf = Math.max(0, stocksEtf);
        // ETF track: surplus cash also goes to ETFs
        const cfEtf = effectiveIncomeThisMonth + cashEtf * cashRate + oneOffCash
          - expenses - calcMonthlyRepayment(Math.max(0, mortgageEtf), effectiveRatePct, mortgageTermYears);
        stocksEtf  += Math.max(0, cfEtf) * 0.8;  // 80% of surplus to ETFs
        cashEtf    += Math.min(0, cfEtf);
        const mortEtfInterest = Math.max(0, mortgageEtf) * pporRate;
        const mortEtfRepay    = calcMonthlyRepayment(Math.max(0, mortgageEtf), effectiveRatePct, mortgageTermYears);
        mortgageEtf = Math.max(0, mortgageEtf - Math.max(0, mortEtfRepay - mortEtfInterest));
      }

      // ── Investable NW for FIRE trigger ──
      // FIRE definition: liquid/investable assets can generate target passive income
      // Investable = stocks + crypto + (super if age >= 60) + invPropEquity
      // We use SWR on total investable NW
      const currentAge = s.currentAge + mi / 12;
      const superAccessible = currentAge >= 60 ? superBal : 0;
      let invPropEquity = Math.max(0, invPropValue - invPropLoan);
      if (planInput && planIPStates.length > 0) {
        invPropEquity = 0;
        for (let ipIdx = 0; ipIdx < planIPStates.length && ipIdx < MAX_IPS; ipIdx++) {
          if (mi >= planIPStates[ipIdx].settledAtMi) {
            invPropEquity += Math.max(0, ipValues[sim * MAX_IPS + ipIdx] - ipLoans[sim * MAX_IPS + ipIdx]);
          }
        }
      }
      const investableNW = stocks + crypto + superAccessible + invPropEquity + Math.max(0, cash - 30000);
      const passiveIncomeEstimate = investableNW * s.swrPct / 100 / 12
        + (propRent > 0 ? propRent : 0);

      // FIRE trigger: passive income estimate ≥ target monthly
      if (!reachedFire && passiveIncomeEstimate >= s.targetPassiveMonthly) {
        reachedFire     = true;
        fireReachedYear = currentYear + yi;
        // Count by age
        const ageAtFire = Math.floor(currentAge);
        if (ageAtFire >= 0 && ageAtFire <= 65 + s.currentAge) {
          const ageIdx = ageAtFire - s.currentAge;
          if (ageIdx >= 0 && ageIdx < N_YEARS) fireCountByAge[ageIdx]++;
        }
      }

      // ETF track FIRE trigger
      if (s.compareOffsetVsEtf && !reachedFireEtf) {
        const investableEtf = stocksEtf + crypto + superAccessible;
        const passiveEtf    = investableEtf * s.swrPct / 100 / 12;
        if (passiveEtf >= s.targetPassiveMonthly) {
          reachedFireEtf     = true;
          fireReachedYearEtf = currentYear + yi;
        }
      }

      // ── Year-end snapshots ──
      if ((mi + 1) % 12 === 0) {
        // Sum all plan IPs' equity
        let planIPEquity = 0;
        if (planInput && planIPStates.length > 0) {
          for (let ipIdx = 0; ipIdx < planIPStates.length && ipIdx < MAX_IPS; ipIdx++) {
            if (yi * 12 >= planIPStates[ipIdx].settledAtMi) {
              planIPEquity += Math.max(0, ipValues[sim * MAX_IPS + ipIdx] - ipLoans[sim * MAX_IPS + ipIdx]);
            }
          }
        }
        const totalNW = ppor + cash + superBal + stocks + crypto
          + (planInput && planIPStates.length > 0 ? planIPEquity : invPropValue)
          - mortgage - otherDebts
          - (planInput && planIPStates.length > 0 ? 0 : invPropLoan);
        yearNWSnapshots[yi][sim] = totalNW;

        if (s.compareOffsetVsEtf) {
          const nwEtf = ppor + cashEtf + superBal + stocksEtf + crypto
            + invPropValue - mortgageEtf - otherDebts - invPropLoan;
          yearNWSnapshotsEtf[yi][sim] = nwEtf;
        }

        // Snapshot at target FIRE age
        const ageAtYearEnd = s.currentAge + yi + 1;
        if (ageAtYearEnd === s.targetFireAge) {
          let planIPEqTarget = 0;
          if (planInput && planIPStates.length > 0) {
            for (let ipIdx = 0; ipIdx < planIPStates.length && ipIdx < MAX_IPS; ipIdx++) {
              planIPEqTarget += Math.max(0, ipValues[sim * MAX_IPS + ipIdx] - ipLoans[sim * MAX_IPS + ipIdx]);
            }
          }
          nwAtTargetAge[sim] = ppor + cash + superBal + stocks + crypto
            + (planInput && planIPStates.length > 0 ? planIPEqTarget : invPropValue)
            - mortgage - otherDebts
            - (planInput && planIPStates.length > 0 ? 0 : invPropLoan);
        }
      }
    }

    fireYear[sim]    = fireReachedYear;
    fireYearEtf[sim] = fireReachedYearEtf;
    if (hadNegCF)     countNegCashflow++;
    if (hadShortfall) countCashShortfall++;
    if (propAcquired) countPropAcquired++;
  }

  // ── Post-processing ───────────────────────────────────────────────────────

  // FIRE probabilities
  const firesReached     = fireYear.filter(y => y !== null).length;
  const probFireByTarget = (() => {
    const targetYear = currentYear + fireAgeYears;
    const count = fireYear.filter(y => y !== null && y <= targetYear).length;
    return Math.round((count / N_SIM) * 1000) / 10;
  })();
  const neverFirePct = Math.round(((N_SIM - firesReached) / N_SIM) * 1000) / 10;

  // Median / P10 / P90 FIRE year
  const validFireYears = fireYear.filter(y => y !== null).map(y => y as number).sort((a, b) => a - b);
  const medianFireYear = validFireYears.length >= N_SIM * 0.5
    ? validFireYears[Math.floor(validFireYears.length / 2)]
    : null;
  const p10FireYear = validFireYears.length >= N_SIM * 0.1
    ? validFireYears[Math.floor(validFireYears.length * 0.1)]
    : null;
  const p90FireYear = validFireYears.length >= N_SIM * 0.9
    ? validFireYears[Math.floor(validFireYears.length * 0.9)]
    : null;

  // Fan chart
  const fanData: FireFanPoint[] = yearNWSnapshots.map((sims, yi) => ({
    year:   currentYear + yi,
    p10:    Math.round(pct(sims, 10)),
    p25:    Math.round(pct(sims, 25)),
    median: Math.round(pct(sims, 50)),
    p75:    Math.round(pct(sims, 75)),
    p90:    Math.round(pct(sims, 90)),
  }));

  // FIRE year histogram (bucketed by year)
  const yearCounts: Record<number, number> = {};
  for (const y of validFireYears) {
    yearCounts[y] = (yearCounts[y] || 0) + 1;
  }
  const fireYearHistogram: FireHistPoint[] = Object.entries(yearCounts)
    .map(([year, count]) => ({
      year:  parseInt(year),
      count: count as number,
      pct:   Math.round(((count as number) / N_SIM) * 1000) / 10,
    }))
    .sort((a, b) => a.year - b.year);

  // Probability of FIRE by age
  let cumulative = 0;
  const fireProbByAge: FireProbByAge[] = [];
  for (let ageIdx = 0; ageIdx < Math.min(N_YEARS, 30); ageIdx++) {
    cumulative += fireCountByAge[ageIdx];
    fireProbByAge.push({
      age:         s.currentAge + ageIdx + 1,
      probability: Math.round((cumulative / N_SIM) * 1000) / 10,
    });
  }

  // NW at target fire age percentiles
  const nwP10AtTarget  = Math.round(pct(nwAtTargetAge, 10));
  const nwP50AtTarget  = Math.round(pct(nwAtTargetAge, 50));
  const nwP90AtTarget  = Math.round(pct(nwAtTargetAge, 90));

  // Offset vs ETF comparison
  let offsetVsEtf: OffsetVsEtfResult | null = null;
  if (s.compareOffsetVsEtf) {
    const finalOffsetNW = yearNWSnapshots[yearNWSnapshots.length - 1];
    const finalEtfNW    = yearNWSnapshotsEtf[yearNWSnapshotsEtf.length - 1];
    const validEtfFires = fireYearEtf.filter(y => y !== null).map(y => y as number).sort((a, b) => a - b);
    const targetYear = currentYear + fireAgeYears;

    // Estimate interest saved by offset (simple approximation)
    const offsetSavingsPa = safeNum(s.startOffset) * s.meanMortgageRate / 100;
    const mortgageSaved   = offsetSavingsPa * fireAgeYears;
    const etfGrowthGain   = safeNum(s.startOffset) * Math.pow(1 + s.etfExpectedReturn / 100, fireAgeYears) - safeNum(s.startOffset);

    const etfCountByTarget = fireYearEtf.filter(y => y !== null && y <= targetYear).length;

    offsetVsEtf = {
      offsetNwP50:    Math.round(pct(finalOffsetNW, 50)),
      etfNwP50:       Math.round(pct(finalEtfNW, 50)),
      offsetFireYear: validFireYears.length >= N_SIM * 0.5
        ? validFireYears[Math.floor(validFireYears.length / 2)]
        : null,
      etfFireYear:    validEtfFires.length >= N_SIM * 0.5
        ? validEtfFires[Math.floor(validEtfFires.length / 2)]
        : null,
      offsetProb:     probFireByTarget,
      etfProb:        Math.round((etfCountByTarget / N_SIM) * 1000) / 10,
      mortgageSaved:  Math.round(mortgageSaved),
      etfGrowthGain:  Math.round(etfGrowthGain),
    };
  }

  // Property acquisition probability
  const propAcquisitionProb = Math.round((countPropAcquired / N_SIM) * 1000) / 10;

  // Risk metrics
  const probCashShortfall = Math.round((countCashShortfall / N_SIM) * 1000) / 10;
  const probNegCashflow   = Math.round((countNegCashflow   / N_SIM) * 1000) / 10;

  let highestRiskYearIdx = 0, highestRiskCount = 0;
  for (let yi = 0; yi < N_YEARS; yi++) {
    if (negCFByYear[yi] > highestRiskCount) {
      highestRiskCount   = negCFByYear[yi];
      highestRiskYearIdx = yi;
    }
  }
  const highestRiskYear = currentYear + highestRiskYearIdx;

  // Biggest risk driver
  const debtToAssets = s.startMortgage / Math.max(s.startPPOR + s.startCash + s.startStocks + s.startCrypto + s.startSuper, 1);
  let biggestRiskDriver = 'Market volatility';
  if (s.startCrypto / Math.max(s.startPPOR + s.startCash + s.startStocks + s.startCrypto + s.startSuper, 1) > 0.25)
    biggestRiskDriver = 'Crypto concentration';
  else if (debtToAssets > 0.7) biggestRiskDriver = 'High leverage';
  else if (probNegCashflow > 30) biggestRiskDriver = 'Cashflow pressure';
  else if (probFireByTarget < 20) biggestRiskDriver = 'FIRE timeline risk';

  // Key risks
  const keyRisks: string[] = [];
  if (probFireByTarget < 50)
    keyRisks.push(`Only ${probFireByTarget}% probability of FIRE by age ${s.targetFireAge} — consider increasing investment contributions or reducing target passive income`);
  if (probNegCashflow > 25)
    keyRisks.push(`${probNegCashflow}% of simulations show at least one month of negative cashflow — cash buffer is essential`);
  if (probCashShortfall > 30)
    keyRisks.push(`${probCashShortfall}% of paths drop below $20k cash buffer at some point — stress-test emergency fund size`);
  if (s.evJobLossProb >= 5)
    keyRisks.push(`${s.evJobLossProb}% annual job loss probability with ${s.evJobLossDurationMo}-month income gap — income protection insurance recommended`);
  if (debtToAssets > 0.6)
    keyRisks.push(`Debt-to-asset ratio ${Math.round(debtToAssets * 100)}% — rate jump events amplify cashflow risk significantly`);
  if (nwP10AtTarget < 0)
    keyRisks.push(`P10 scenario produces negative net worth at age ${s.targetFireAge} — severe downturns could eliminate equity entirely`);
  if (keyRisks.length === 0)
    keyRisks.push('No critical structural risks detected — portfolio appears well-positioned for FIRE trajectory');

  // Recommended actions
  const recommendedActions: string[] = [];
  if (probFireByTarget < 50)
    recommendedActions.push(`Increase monthly investment surplus by $${Math.round((fireTargetCapital - nwP50AtTarget) / (fireAgeYears * 12 * 12)).toLocaleString()} to close the FIRE gap`);
  if (medianFireYear && medianFireYear > currentYear + fireAgeYears)
    recommendedActions.push(`Median FIRE year is ${medianFireYear} (age ${s.currentAge + (medianFireYear - currentYear)}), ${medianFireYear - currentYear - fireAgeYears} years after target — review spending or return assumptions`);
  if (probNegCashflow > 20)
    recommendedActions.push('Build 6-month emergency buffer ($' + Math.round(s.startMonthlyExpenses * 6 / 1000) + 'k) to absorb cashflow gaps without selling assets');
  if (offsetVsEtf && offsetVsEtf.etfNwP50 > offsetVsEtf.offsetNwP50 * 1.05)
    recommendedActions.push(`ETF path produces ${Math.round((offsetVsEtf.etfNwP50 / offsetVsEtf.offsetNwP50 - 1) * 100)}% higher median NW — consider partial reallocation of offset to growth assets`);
  if (offsetVsEtf && offsetVsEtf.offsetNwP50 > offsetVsEtf.etfNwP50)
    recommendedActions.push('Offset strategy saves more on mortgage interest than ETF growth — maintaining current offset balance is optimal');
  if (s.propNextBuyYear && propAcquisitionProb < 70)
    recommendedActions.push(`Only ${propAcquisitionProb}% of simulations can fund the planned property purchase — may need larger cash buffer or lower purchase price`);
  recommendedActions.push('Re-run simulation after each major life event (property purchase, income change, market correction)');
  if (recommendedActions.length < 4)
    recommendedActions.push('Current FIRE trajectory is on track — maintain consistent contributions and review annually');

  return {
    probFireByTarget,
    medianFireYear,
    p10FireYear,
    p90FireYear,
    neverFirePct,
    fanData,
    fireYearHistogram,
    fireProbByAge,
    nwP10AtTarget,
    nwP50AtTarget,
    nwP90AtTarget,
    offsetVsEtf,
    propAcquisitionProb,
    probCashShortfall,
    probNegCashflow,
    highestRiskYear,
    biggestRiskDriver,
    keyRisks,
    recommendedActions,
    ranAt:           new Date().toISOString(),
    simulationCount: N_SIM,
    runtimeMs:       Date.now() - startTime,
  };
}

// ─── PLAN VALIDATION HELPER ──────────────────────────────────────────────────
// Used by MyFinancialPlan.tsx to show event counts before running simulation.

export interface PlanValidationSummary {
  propertyCount:          number;
  plannedStockOrderCount: number;
  plannedCryptoOrderCount:number;
  activeStockDCACount:    number;
  activeCryptoDCACount:   number;
  totalMonthlyDCA:        number;   // total DCA per month (approx at start)
  totalLumpSums:          number;   // total one-off investment $ planned
  ngAnnualBenefit:        number;
  firstSettlementDate:    string | null;
}

export function validatePlanInput(planInput: FireMCPlanInput): PlanValidationSummary {
  const activeStockDCA   = planInput.stockDCASchedules.filter(d => d.enabled);
  const activeCryptoDCA  = planInput.cryptoDCASchedules.filter(d => d.enabled);
  const totalMonthlyDCA  =
    activeStockDCA.reduce((s, d) => s + dcaMonthlyFromPlan(d.amount, d.frequency), 0) +
    activeCryptoDCA.reduce((s, d) => s + dcaMonthlyFromPlan(d.amount, d.frequency), 0);

  const plannedBuysStock  = planInput.plannedStockOrders.filter(o => o.status === 'planned' && o.action === 'buy');
  const plannedBuysCrypto = planInput.plannedCryptoOrders.filter(o => o.status === 'planned' && o.action === 'buy');
  const totalLumpSums =
    plannedBuysStock.reduce((s, o) => s + o.amount_aud, 0) +
    plannedBuysCrypto.reduce((s, o) => s + o.amount_aud, 0);

  const settlementDates = planInput.properties
    .map(p => p.settlement_date || p.purchase_date)
    .filter(Boolean) as string[];
  const firstSettlementDate = settlementDates.length > 0
    ? settlementDates.sort()[0]
    : null;

  return {
    propertyCount:           planInput.properties.length,
    plannedStockOrderCount:  plannedBuysStock.length,
    plannedCryptoOrderCount: plannedBuysCrypto.length,
    activeStockDCACount:     activeStockDCA.length,
    activeCryptoDCACount:    activeCryptoDCA.length,
    totalMonthlyDCA:         Math.round(totalMonthlyDCA),
    totalLumpSums:           Math.round(totalLumpSums),
    ngAnnualBenefit:         planInput.ngAnnualBenefit ?? 0,
    firstSettlementDate,
  };
}

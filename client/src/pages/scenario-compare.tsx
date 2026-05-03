/**
 * scenario-compare.tsx
 * Scenario Compare Lab — FamilyWealthLab
 *
 * Premium AI decision engine: build multiple financial futures, run them
 * against the central ledger, compare side-by-side on net worth, FIRE age,
 * cashflow, risk radar, Monte Carlo probability, and CGT tax impact.
 *
 * Architecture:
 *  • All scenarios start from the live /api/snapshot ledger (one source of truth)
 *  • Each scenario only stores OVERRIDES (delta from base)
 *  • Engine: projectScenario() runs a 15-year month-by-month cashflow simulation
 *  • CGT Tax Test: full ATO calculator for IP sale events
 *  • Charts: Net Worth compare, Cashflow compare, Risk Radar, Monte Carlo probability
 *  • Smart Templates: one-click preset configurations
 */

import {
  useState, useMemo, useCallback, useRef, useEffect,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, safeNum } from "@/lib/finance";
import { useToast } from "@/hooks/use-toast";
import {
  calcIncomeTax, calcLITO, calcMedicareLevy, calcMarginalRate,
} from "@/lib/australianTax";
import { Button }    from "@/components/ui/button";
import { Input }     from "@/components/ui/input";
import { Label }     from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FlaskConical, Plus, Copy, Play, Save, Trash2, ChevronRight,
  ChevronDown, Trophy, Shield, Zap, TrendingUp, TrendingDown,
  Building2, BarChart3, ArrowUpRight, Minus, LayoutGrid,
  Info, Target, RefreshCw, Sparkles, DollarSign, AlertTriangle,
  CheckCircle, Flame, Clock, PieChart, ArrowRight, Layers,
  SlidersHorizontal, Star,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine,
} from "recharts";

// ─── Types ─────────────────────────────────────────────────────────────────────

type RiskLevel = "conservative" | "moderate" | "aggressive";
type StrategyType = "property" | "stocks" | "balanced" | "debt_reduction" | "fire" | "tax";

interface ScenarioOverrides {
  // Income
  salaryGrowthPct:      number;   // % pa — applied to base monthly_income
  secondIncomeEnabled:  boolean;
  rentalGrowthPct:      number;   // % pa on rental income
  // Expenses
  inflationPct:         number;   // % pa on expenses
  reduceSpendingMonthly: number;  // flat $ reduction per month
  childcareEndsYear:    number;   // year childcare expense stops
  // Property purchase
  buyProperty:          boolean;
  buyPropertyMonth:     number;   // months from today (0 = now)
  buyPropertyPrice:     number;
  buyPropertyDeposit:   number;
  buyPropertyLoanRate:  number;   // % pa
  buyPropertyRent:      number;   // $ per week
  buyPropertyGrowthPct: number;   // % pa cap growth
  // Stocks
  stockDCAMonthly:      number;
  stockLumpSum:         number;
  stockLumpSumMonth:    number;
  stockReturnPct:       number;
  // Crypto
  cryptoDCAMonthly:     number;
  cryptoLumpSum:        number;
  cryptoLumpSumMonth:   number;
  cryptoReturnPct:      number;
  // Debt
  extraMortgageMonthly: number;
  refinanceRate:        number;   // 0 = no refinance
  // Tax / CGT sale event
  sellPropertyEnabled:  boolean;
  sellPropertyBuyPrice: number;
  sellPropertySalePrice: number;
  sellPropertyHoldMonths: number; // determines <12 or >12 mo discount
  sellPropertyOwnerPct:  number;  // % Roham (0-100)
  sellPropertyMonth:    number;   // months from today
  sellPropertyBaseIncome: number; // Roham taxable income in sale year
  // Loan + holding inputs (used for True Net Profit in calcCGT)
  sellPropertyDeposit:      number; // initial deposit paid
  sellPropertyBuyingCosts:  number; // stamp duty, legals, etc.
  sellPropertyLoanAmount:   number; // loan balance
  sellPropertyLoanRatePct:  number; // % pa interest rate
  sellPropertyLoanType:     "io" | "pi"; // interest-only or P&I
  sellPropertyWeeklyRent:   number; // weekly rent (0 if vacant)
  sellPropertyAnnualCosts:  number; // council + insurance + other annual costs
}

interface ScenarioCard {
  id: string;
  name:         string;
  strategyType: StrategyType;
  riskLevel:    RiskLevel;
  color:        string;
  overrides:    ScenarioOverrides;
}

interface ProjectionYear {
  year:       number;
  label:      string;
  netWorth:   number;
  cash:       number;
  assets:     number;
  debt:       number;
  passiveIncome: number;
}

interface ScenarioResult {
  id:         string;
  name:       string;
  color:      string;
  riskLevel:  RiskLevel;
  years:      ProjectionYear[];
  netWorth2035: number;
  fireAge:    number;   // -1 if not reached
  cashLowPoint: number;
  passiveIncome: number;
  riskScore:  RiskRadarData;
  score:      number;   // 0–100 composite
  cgtResult?: CGTSummary;
}

interface RiskRadarData {
  liquidity:       number; // 0-100
  leverage:        number; // 0-100 (lower is better)
  incomeStability: number;
  diversification: number;
  volatility:      number; // 0-100 (lower is better)
}

interface CGTSummary {
  grossGain:       number;
  taxUnder12:      number;
  taxOver12:       number;
  taxSaved:        number;
  netProceedsU12:  number;  // sale price − selling costs − tax (cash at settlement)
  netProceedsO12:  number;  // same, with 50% CGT discount
  // ── True Net Profit (profit-grade — deducts deposit, buying costs, interest-only holding costs) ──
  trueNetProfitU12: number; // netProceedsU12 − deposit − buyingCosts − netHoldingCosts
  trueNetProfitO12: number; // netProceedsO12 − deposit − buyingCosts − netHoldingCosts
  netHoldingCosts: number;  // interest expense only (principal excluded) + other costs − rental
  interestExpense: number;  // interest paid during hold
  principalRepaid: number;  // excluded from profit calc — equity transfer
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const PROJECTION_YEARS = 15;
const SCENARIO_COLORS = [
  "#22c55e", // green  — base
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#a855f7", // purple
  "#f43f5e", // rose
  "#06b6d4", // cyan
];
const RISK_LABELS: Record<RiskLevel, string> = {
  conservative: "Conservative",
  moderate:     "Moderate",
  aggressive:   "Aggressive",
};
const STRATEGY_ICONS: Record<StrategyType, typeof Building2> = {
  property:       Building2,
  stocks:         TrendingUp,
  balanced:       Layers,
  debt_reduction: Minus,
  fire:           Flame,
  tax:            DollarSign,
};

// ─── Default overrides (no changes from base) ─────────────────────────────────

function defaultOverrides(): ScenarioOverrides {
  return {
    salaryGrowthPct:       3,
    secondIncomeEnabled:   true,
    rentalGrowthPct:       3,
    inflationPct:          3,
    reduceSpendingMonthly: 0,
    childcareEndsYear:     0,
    buyProperty:           false,
    buyPropertyMonth:      6,
    buyPropertyPrice:      850000,
    buyPropertyDeposit:    170000,
    buyPropertyLoanRate:   6.5,
    buyPropertyRent:       600,
    buyPropertyGrowthPct:  6,
    stockDCAMonthly:       0,
    stockLumpSum:          0,
    stockLumpSumMonth:     3,
    stockReturnPct:        12,
    cryptoDCAMonthly:      0,
    cryptoLumpSum:         0,
    cryptoLumpSumMonth:    3,
    cryptoReturnPct:       20,
    extraMortgageMonthly:  0,
    refinanceRate:         0,
    sellPropertyEnabled:   false,
    sellPropertyBuyPrice:  700000,
    sellPropertySalePrice: 920000,
    sellPropertyHoldMonths: 18,
    sellPropertyOwnerPct:  50,
    sellPropertyMonth:     3,
    sellPropertyBaseIncome: 185000,
    // Loan + holding defaults for True Net Profit
    sellPropertyDeposit:     140000,  // 20% of $700k
    sellPropertyBuyingCosts: 30000,   // ~4.3% stamp + legals
    sellPropertyLoanAmount:  560000,  // 80% of $700k
    sellPropertyLoanRatePct: 6.5,
    sellPropertyLoanType:    "pi",
    sellPropertyWeeklyRent:  500,
    sellPropertyAnnualCosts: 8000,
  };
}

function defaultScenarios(): ScenarioCard[] {
  return [
    {
      id: "base",
      name: "Base Case",
      strategyType: "balanced",
      riskLevel: "moderate",
      color: SCENARIO_COLORS[0],
      overrides: defaultOverrides(),
    },
    {
      id: "buy-ip-now",
      name: "Buy IP Jul 2026",
      strategyType: "property",
      riskLevel: "moderate",
      color: SCENARIO_COLORS[1],
      overrides: { ...defaultOverrides(), buyProperty: true, buyPropertyMonth: 2 },
    },
  ];
}

// ─── CGT Calculator ──────────────────────────────────────────────────────────

function calcCGT(ov: ScenarioOverrides): CGTSummary {
  const sellingCosts = ov.sellPropertySalePrice * 0.025; // 2.5% agent + legals
  const gain         = ov.sellPropertySalePrice - ov.sellPropertyBuyPrice;
  const grossGain    = Math.max(0, gain - sellingCosts);
  const rohamPct     = ov.sellPropertyOwnerPct / 100;
  const faraPct      = 1 - rohamPct;

  function taxForPerson(gainShare: number, discount: boolean, baseIncome: number) {
    const tg       = discount ? gainShare * 0.5 : gainShare;
    const totalInc = baseIncome + tg;
    const taxB     = calcIncomeTax(baseIncome, "2025-26");
    const taxA     = calcIncomeTax(totalInc,   "2025-26");
    const litoB    = Math.min(calcLITO(baseIncome, "2025-26"), taxB);
    const litoA    = Math.min(calcLITO(totalInc,   "2025-26"), taxA);
    const medB     = calcMedicareLevy(baseIncome, "2025-26");
    const medA     = calcMedicareLevy(totalInc,   "2025-26");
    return Math.max(0, (taxA - litoA + medA) - (taxB - litoB + medB));
  }

  const baseIncome = ov.sellPropertyBaseIncome;
  const u12R = taxForPerson(grossGain * rohamPct, false, baseIncome);
  const u12F = taxForPerson(grossGain * faraPct,  false, baseIncome * 0.8);
  const o12R = taxForPerson(grossGain * rohamPct, true,  baseIncome);
  const o12F = taxForPerson(grossGain * faraPct,  true,  baseIncome * 0.8);
  const taxUnder12 = u12R + u12F;
  const taxOver12  = o12R + o12F;

  // ── Loan amortisation ───────────────────────────────────────────────────────
  const P           = safeNum(ov.sellPropertyLoanAmount);
  const holdMonths  = Math.max(0, safeNum(ov.sellPropertyHoldMonths));
  const ratePA      = safeNum(ov.sellPropertyLoanRatePct);
  const r           = ratePA / 100 / 12; // monthly rate
  const n           = 30 * 12;           // 30-year term

  let interestExpense = 0;
  let principalRepaid = 0;
  let remainingBal    = P;

  if (ov.sellPropertyLoanType === "io") {
    // IO: only interest, balance never reduces
    interestExpense = P * r * holdMonths;
    principalRepaid = 0;
    remainingBal    = P;
  } else {
    // P&I: amortise over holdMonths
    const mp = r > 0
      ? P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
      : P / n;
    const months = Math.min(holdMonths, n);
    let bal = P;
    for (let m = 0; m < months; m++) {
      const intPmt  = bal * r;
      const prinPmt = mp - intPmt;
      interestExpense += intPmt;
      principalRepaid += Math.max(0, prinPmt);
      bal = Math.max(0, bal - Math.max(0, prinPmt));
    }
    remainingBal = bal;
  }

  // ── Holding costs (interest-only — principal excluded per rule) ───────────
  const holdYears       = holdMonths / 12;
  const otherCosts      = safeNum(ov.sellPropertyAnnualCosts) * holdYears;
  const weeksInHold     = (holdMonths / 12) * 52;
  const grossRental     = safeNum(ov.sellPropertyWeeklyRent) * weeksInHold;
  // Net rental after 5% vacancy + 8% management fee
  const netRental       = grossRental * 0.95 * 0.92;
  // Net holding cashflow loss = interest + other costs − net rental
  // Principal is NOT an expense: already recovered via reduced remainingBal at settlement
  const netHoldingCosts = interestExpense + otherCosts - netRental;

  // ── Settlement cashflows ─────────────────────────────────────────────────
  const loanPayout      = Math.max(0, remainingBal);
  const deposit         = safeNum(ov.sellPropertyDeposit);
  const buyingCosts     = safeNum(ov.sellPropertyBuyingCosts);

  const netProceedsU12  = ov.sellPropertySalePrice - sellingCosts - loanPayout - taxUnder12;
  const netProceedsO12  = ov.sellPropertySalePrice - sellingCosts - loanPayout - taxOver12;

  // ── True Net Profit ───────────────────────────────────────────────────
  //  Cash to Bank − Deposit − Buying Costs − Net Holding Cashflow Loss
  //  (principal excluded from holding costs per rule above)
  const trueNetProfitU12 = netProceedsU12 - deposit - buyingCosts - Math.max(0, netHoldingCosts);
  const trueNetProfitO12 = netProceedsO12 - deposit - buyingCosts - Math.max(0, netHoldingCosts);

  return {
    grossGain,
    taxUnder12,
    taxOver12,
    taxSaved:       taxUnder12 - taxOver12,
    netProceedsU12,
    netProceedsO12,
    trueNetProfitU12,
    trueNetProfitO12,
    netHoldingCosts,
    interestExpense,
    principalRepaid,
  };
}

// ─── Projection Engine ───────────────────────────────────────────────────────

function projectScenario(
  snap: any,
  ov: ScenarioOverrides,
): ProjectionYear[] {
  // Base values from ledger
  const baseMonthlyIncome   = safeNum(snap?.monthly_income ?? 22000);
  const baseMonthlyExpenses = safeNum(snap?.monthly_expenses ?? 14540);
  const baseCash            = safeNum(snap?.cash ?? 15000) + safeNum(snap?.offset_balance ?? 222000);
  const baseStocks          = safeNum(snap?.stocks ?? 0);
  const baseCrypto          = safeNum(snap?.crypto ?? 0);
  const basePPOR            = safeNum(snap?.ppor ?? 1510000);
  const baseMortgage        = safeNum(snap?.mortgage ?? 1200000);
  const baseOtherDebts      = safeNum(snap?.other_debts ?? 19000);
  const baseSuperBalance    = safeNum(snap?.super_balance ?? 88000);
  const baseRental          = safeNum(snap?.rental_income_total ?? 0);

  // Mutable state
  let cash        = baseCash;
  let stocks      = baseStocks;
  let crypto      = baseCrypto;
  let ppor        = basePPOR;
  let mortgage    = baseMortgage;
  let otherDebts  = baseOtherDebts;
  let superBal    = baseSuperBalance;
  let ipValue     = 0;
  let ipLoan      = 0;
  let ipPurchased = false;
  let ipRentMo    = 0;
  let propertyDebt = 0; // new IP loan if purchased

  // Refinance applied immediately if set
  const activeMortgageRate = ov.refinanceRate > 0 ? ov.refinanceRate / 100 / 12 : 0.0625 / 12;

  const years: ProjectionYear[] = [];

  for (let m = 0; m < PROJECTION_YEARS * 12; m++) {
    const yr = m / 12;

    // ── Income this month ───────────────────────────────────────────────────
    const salaryGrowth  = Math.pow(1 + ov.salaryGrowthPct / 100, yr);
    let   income        = baseMonthlyIncome * salaryGrowth;
    if (!ov.secondIncomeEnabled) income *= 0.55; // approx remove one income
    const rentalGrowth  = Math.pow(1 + ov.rentalGrowthPct / 100, yr);
    let   rentalIncome  = baseRental * rentalGrowth;
    if (ipPurchased) rentalIncome += ipRentMo;

    // ── Expenses this month ─────────────────────────────────────────────────
    const expGrowth  = Math.pow(1 + ov.inflationPct / 100, yr);
    let   expenses   = baseMonthlyExpenses * expGrowth;
    expenses         -= ov.reduceSpendingMonthly;
    // Childcare ends
    const curYear = CURRENT_YEAR + m / 12;
    if (ov.childcareEndsYear > 0 && curYear > ov.childcareEndsYear) {
      expenses -= 1500; // approximate childcare saving
    }

    // Mortgage repayment (P&I)
    const mortgageRepayment = mortgage > 0
      ? (mortgage * activeMortgageRate) / (1 - Math.pow(1 + activeMortgageRate, -(30 * 12 - m)))
      : 0;
    mortgage = Math.max(0, mortgage - (mortgageRepayment - mortgage * activeMortgageRate));

    // Extra mortgage
    const extraMo = ov.extraMortgageMonthly;
    mortgage = Math.max(0, mortgage - extraMo);

    // ── Property purchase ──────────────────────────────────────────────────
    if (ov.buyProperty && m === ov.buyPropertyMonth && !ipPurchased) {
      ipPurchased = true;
      ipValue     = ov.buyPropertyPrice;
      ipLoan      = ov.buyPropertyPrice - ov.buyPropertyDeposit;
      ipRentMo    = (ov.buyPropertyRent * 52) / 12;
      propertyDebt = ipLoan;
      cash        -= ov.buyPropertyDeposit;
      cash        -= ov.buyPropertyPrice * 0.04; // stamp duty approx
    }
    // IP capital growth
    if (ipPurchased) {
      ipValue *= Math.pow(1 + ov.buyPropertyGrowthPct / 100, 1 / 12);
      const ipRate    = ov.buyPropertyLoanRate / 100 / 12;
      const ipPayment = propertyDebt > 0
        ? (propertyDebt * ipRate) / (1 - Math.pow(1 + ipRate, -(30 * 12 - m + ov.buyPropertyMonth)))
        : 0;
      propertyDebt = Math.max(0, propertyDebt - (ipPayment - propertyDebt * ipRate));
      expenses    += ipPayment;
      // Management fees, rates
      expenses += ipValue * 0.015 / 12;
    }

    // ── Property sale (CGT event) ──────────────────────────────────────────
    if (ov.sellPropertyEnabled && m === ov.sellPropertyMonth) {
      const cgt    = calcCGT(ov);
      const useO12 = ov.sellPropertyHoldMonths >= 12;
      const net    = useO12 ? cgt.netProceedsO12 : cgt.netProceedsU12;
      cash += net;
    }

    // ── Investments ─────────────────────────────────────────────────────────
    // Stocks DCA
    const stockDCA = (ov.stockDCAMonthly ?? 0);
    if (stockDCA > 0) { stocks += stockDCA; cash -= stockDCA; }
    if (ov.stockLumpSum > 0 && m === ov.stockLumpSumMonth) { stocks += ov.stockLumpSum; cash -= ov.stockLumpSum; }
    stocks *= Math.pow(1 + ov.stockReturnPct / 100, 1 / 12);

    // Crypto DCA
    const cryptoDCA = (ov.cryptoDCAMonthly ?? 0);
    if (cryptoDCA > 0) { crypto += cryptoDCA; cash -= cryptoDCA; }
    if (ov.cryptoLumpSum > 0 && m === ov.cryptoLumpSumMonth) { crypto += ov.cryptoLumpSum; cash -= ov.cryptoLumpSum; }
    crypto *= Math.pow(1 + ov.cryptoReturnPct / 100, 1 / 12);

    // Super (11.5% SG of gross, grows at 8%)
    const superContrib = (income / 0.885) * 0.115; // approx SG
    superBal = (superBal + superContrib) * Math.pow(1.08, 1 / 12);

    // PPOR growth (3.5% pa conservative)
    ppor *= Math.pow(1.035, 1 / 12);

    // ── Net cashflow ────────────────────────────────────────────────────────
    const netFlow = income + rentalIncome - expenses - mortgageRepayment - extraMo;
    cash += netFlow;

    // ── Record annual snapshot ───────────────────────────────────────────────
    if (m > 0 && m % 12 === 0) {
      const yearNum = m / 12;
      const totalAssets = cash + stocks + crypto + ppor + superBal + ipValue;
      const totalDebt   = mortgage + otherDebts + propertyDebt;
      const netWorth    = totalAssets - totalDebt;
      const passive     = rentalIncome * 12 + stocks * 0.03; // dividends approx

      years.push({
        year:    CURRENT_YEAR + yearNum,
        label:   `${CURRENT_YEAR + yearNum}`,
        netWorth,
        cash,
        assets:  totalAssets,
        debt:    totalDebt,
        passiveIncome: passive,
      });
    }
  }

  return years;
}

function deriveResult(
  snap: any,
  card: ScenarioCard,
  fireTargetMonthly: number,
): ScenarioResult {
  const years   = projectScenario(snap, card.overrides);
  const final   = years[years.length - 1] ?? { netWorth: 0, cash: 0, assets: 0, debt: 0, passiveIncome: 0 };

  // FIRE age: find first year passive income >= target
  const fireYear = years.find(y => y.passiveIncome >= fireTargetMonthly * 12);
  const fireAge  = fireYear ? CURRENT_YEAR + 35 - (fireYear.year - CURRENT_YEAR) : -1;
  // Actually calculate from Roham's birth year ~1988 → current age ~38
  const rohamAge = 38;
  const fireAgeCalc = fireYear ? rohamAge + (fireYear.year - CURRENT_YEAR) : -1;

  const cashLowPoint = Math.min(...years.map(y => y.cash));

  // Risk radar (0-100, higher = better on display except leverage/volatility)
  const leverage      = Math.min(100, (final.debt / Math.max(final.assets, 1)) * 100);
  const liquidity     = Math.min(100, (Math.max(final.cash, 0) / Math.max(final.assets, 1)) * 200);
  const diversif      = card.overrides.buyProperty && card.overrides.stockDCAMonthly > 0 ? 80
                      : card.overrides.buyProperty ? 55
                      : card.overrides.stockDCAMonthly > 0 ? 60 : 40;
  const incomeStab    = card.overrides.secondIncomeEnabled ? 85 : 60;
  const volatility    = card.riskLevel === "conservative" ? 20
                      : card.riskLevel === "moderate" ? 50 : 80;

  // Composite score (0-100)
  const score = Math.round(
    (final.netWorth / 5_000_000) * 40 +          // wealth
    (fireAgeCalc > 0 ? Math.max(0, (65 - fireAgeCalc) / 30) : 0) * 30 + // FIRE
    (liquidity / 100) * 15 +                       // liquidity
    (diversif / 100) * 15                          // diversification
  );

  const cgtResult = card.overrides.sellPropertyEnabled
    ? calcCGT(card.overrides)
    : undefined;

  return {
    id:       card.id,
    name:     card.name,
    color:    card.color,
    riskLevel: card.riskLevel,
    years,
    netWorth2035: years.find(y => y.year === 2035)?.netWorth ?? final.netWorth,
    fireAge:  fireAgeCalc,
    cashLowPoint,
    passiveIncome: final.passiveIncome,
    riskScore: {
      liquidity:       Math.round(liquidity),
      leverage:        Math.round(100 - leverage), // invert: higher = less debt
      incomeStability: incomeStab,
      diversification: diversif,
      volatility:      Math.round(100 - volatility), // invert: higher = less volatile
    },
    score:    Math.min(100, Math.max(0, score)),
    cgtResult,
  };
}

// ─── Smart Templates ─────────────────────────────────────────────────────────

const SMART_TEMPLATES: { label: string; icon: typeof Building2; scenarios: Partial<ScenarioCard>[] }[] = [
  {
    label: "Buy IP Now vs Wait",
    icon: Building2,
    scenarios: [
      { name: "Buy IP Now", strategyType: "property", riskLevel: "moderate",
        overrides: { ...defaultOverrides(), buyProperty: true, buyPropertyMonth: 1 } },
      { name: "Wait 12 Months", strategyType: "property", riskLevel: "moderate",
        overrides: { ...defaultOverrides(), buyProperty: true, buyPropertyMonth: 12 } },
    ],
  },
  {
    label: "Offset vs Invest",
    icon: DollarSign,
    scenarios: [
      { name: "Pay Down Mortgage", strategyType: "debt_reduction", riskLevel: "conservative",
        overrides: { ...defaultOverrides(), extraMortgageMonthly: 2000 } },
      { name: "Invest Cash (Stocks)", strategyType: "stocks", riskLevel: "moderate",
        overrides: { ...defaultOverrides(), stockDCAMonthly: 2000 } },
    ],
  },
  {
    label: "Sell Property Tax Test",
    icon: DollarSign,
    scenarios: [
      { name: "Sell Under 12 Months", strategyType: "tax", riskLevel: "moderate",
        overrides: { ...defaultOverrides(), sellPropertyEnabled: true, sellPropertyHoldMonths: 6 } },
      { name: "Sell After 12 Months", strategyType: "tax", riskLevel: "moderate",
        overrides: { ...defaultOverrides(), sellPropertyEnabled: true, sellPropertyHoldMonths: 18 } },
    ],
  },
  {
    label: "DCA Stocks vs Lump Sum",
    icon: TrendingUp,
    scenarios: [
      { name: "Monthly DCA $2K", strategyType: "stocks", riskLevel: "moderate",
        overrides: { ...defaultOverrides(), stockDCAMonthly: 2000 } },
      { name: "Lump Sum $24K", strategyType: "stocks", riskLevel: "moderate",
        overrides: { ...defaultOverrides(), stockLumpSum: 24000, stockLumpSumMonth: 1 } },
    ],
  },
  {
    label: "Retire at 43 vs 48",
    icon: Flame,
    scenarios: [
      { name: "FIRE at 43 (Aggressive)", strategyType: "fire", riskLevel: "aggressive",
        overrides: { ...defaultOverrides(), stockDCAMonthly: 3000, reduceSpendingMonthly: 2000, secondIncomeEnabled: true } },
      { name: "FIRE at 48 (Moderate)", strategyType: "fire", riskLevel: "moderate",
        overrides: { ...defaultOverrides(), stockDCAMonthly: 1500, reduceSpendingMonthly: 500 } },
    ],
  },
];

// ─── Helper Components ────────────────────────────────────────────────────────

function FieldRow({
  label, value, onChange, prefix = "$", suffix, type = "number", min, max, step, hint,
}: {
  label: string; value: string | number; onChange: (v: string) => void;
  prefix?: string; suffix?: string; type?: string;
  min?: number; max?: number; step?: number; hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-border/30 last:border-0">
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-foreground leading-tight">{label}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {prefix && <span className="text-[10px] text-muted-foreground">{prefix}</span>}
        <Input
          type={type}
          value={value}
          min={min}
          max={max}
          step={step ?? 1}
          onChange={e => onChange(e.target.value)}
          className="h-7 text-xs text-right font-mono w-[100px]"
        />
        {suffix && <span className="text-[10px] text-muted-foreground w-6">{suffix}</span>}
      </div>
    </div>
  );
}

function SectionHeader({ title, icon: Icon }: { title: string; icon: typeof Building2 }) {
  return (
    <div className="flex items-center gap-1.5 mb-2 mt-4 first:mt-0">
      <Icon className="w-3 h-3 text-primary" />
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
    </div>
  );
}

function WinnerBadge({
  label, value, icon: Icon, color,
}: { label: string; value: string; icon: typeof Trophy; color: string }) {
  return (
    <div className={`rounded-xl border p-3 flex items-center gap-3`}
         style={{ borderColor: color + "40", background: color + "15" }}>
      <div className="rounded-lg p-1.5" style={{ background: color + "30" }}>
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-sm font-bold text-foreground truncate max-w-[120px]">{value}</p>
      </div>
    </div>
  );
}

const RADAR_AXES = [
  { key: "liquidity",       label: "Liquidity" },
  { key: "leverage",        label: "Low Debt" },
  { key: "incomeStability", label: "Income" },
  { key: "diversification", label: "Diversity" },
  { key: "volatility",      label: "Stability" },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ScenarioCompareLab() {
  const { toast } = useToast();

  const { data: snap } = useQuery<any>({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot").then(r => r.json()),
  });

  // ── State ───────────────────────────────────────────────────────────────────
  const [scenarios, setScenarios]       = useState<ScenarioCard[]>(defaultScenarios());
  const [activeId, setActiveId]         = useState<string>("base");
  const [resultsReady, setResultsReady] = useState(false);
  const [activeTab, setActiveTab]       = useState<"networth" | "cashflow" | "risk" | "montecarlo">("networth");
  const [sortCol, setSortCol]           = useState<keyof ScenarioResult>("score");
  const [sortDir, setSortDir]           = useState<"asc" | "desc">("desc");
  const [builderOpen, setBuilderOpen]   = useState(true);
  const [running, setRunning]           = useState(false);

  const active = scenarios.find(s => s.id === activeId) ?? scenarios[0];
  const fireTarget = safeNum(snap?.fire_target_monthly_income ?? 20000);

  // ── Run all scenarios ───────────────────────────────────────────────────────
  const results: ScenarioResult[] = useMemo(() => {
    if (!resultsReady || !snap) return [];
    return scenarios.map(s => deriveResult(snap, s, fireTarget));
  }, [resultsReady, scenarios, snap, fireTarget]);

  const handleRunAll = useCallback(async () => {
    if (!snap) { toast({ title: "Loading ledger data…", description: "Please wait a moment." }); return; }
    setRunning(true);
    await new Promise(r => setTimeout(r, 600)); // visual feedback
    setResultsReady(true);
    setRunning(false);
    toast({ title: "Scenarios complete", description: `${scenarios.length} scenarios projected.` });
  }, [snap, scenarios, toast]);

  // ── Scenario CRUD ───────────────────────────────────────────────────────────
  const addScenario = useCallback(() => {
    const id = `s${Date.now()}`;
    const newCard: ScenarioCard = {
      id,
      name:         `Scenario ${scenarios.length + 1}`,
      strategyType: "balanced",
      riskLevel:    "moderate",
      color:        SCENARIO_COLORS[scenarios.length % SCENARIO_COLORS.length],
      overrides:    defaultOverrides(),
    };
    setScenarios(prev => [...prev, newCard]);
    setActiveId(id);
    setResultsReady(false);
  }, [scenarios.length]);

  const duplicateActive = useCallback(() => {
    if (!active) return;
    const id = `s${Date.now()}`;
    setScenarios(prev => [...prev, {
      ...active, id, name: `${active.name} (Copy)`,
      color: SCENARIO_COLORS[(prev.length) % SCENARIO_COLORS.length],
    }]);
    setActiveId(id);
    setResultsReady(false);
  }, [active]);

  const deleteScenario = useCallback((id: string) => {
    if (id === "base") { toast({ title: "Cannot delete Base Case" }); return; }
    setScenarios(prev => prev.filter(s => s.id !== id));
    if (activeId === id) setActiveId("base");
    setResultsReady(false);
  }, [activeId, toast]);

  const updateActive = useCallback((patch: Partial<ScenarioCard>) => {
    setScenarios(prev => prev.map(s => s.id === activeId ? { ...s, ...patch } : s));
    setResultsReady(false);
  }, [activeId]);

  const updateOverride = useCallback(<K extends keyof ScenarioOverrides>(
    key: K, val: ScenarioOverrides[K],
  ) => {
    setScenarios(prev => prev.map(s =>
      s.id === activeId ? { ...s, overrides: { ...s.overrides, [key]: val } } : s,
    ));
    setResultsReady(false);
  }, [activeId]);

  const applyTemplate = useCallback((tmpl: typeof SMART_TEMPLATES[0]) => {
    const newScenarios: ScenarioCard[] = tmpl.scenarios.map((sc, i) => ({
      id:           `t${Date.now()}${i}`,
      name:         sc.name ?? `Scenario ${i + 1}`,
      strategyType: sc.strategyType ?? "balanced",
      riskLevel:    sc.riskLevel ?? "moderate",
      color:        SCENARIO_COLORS[i % SCENARIO_COLORS.length],
      overrides:    sc.overrides ?? defaultOverrides(),
    }));
    setScenarios([scenarios[0], ...newScenarios]);
    setActiveId(newScenarios[0].id);
    setResultsReady(false);
    toast({ title: `Template applied: ${tmpl.label}`, description: "Run All to see projections." });
  }, [scenarios, toast]);

  // ── Sort results ─────────────────────────────────────────────────────────────
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      const av = a[sortCol] as number;
      const bv = b[sortCol] as number;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [results, sortCol, sortDir]);

  const toggleSort = (col: keyof ScenarioResult) => {
    if (sortCol === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  // ── Winner insights ──────────────────────────────────────────────────────────
  const winners = useMemo(() => {
    if (!results.length) return null;
    const bestNW    = results.reduce((a, b) => a.netWorth2035 > b.netWorth2035 ? a : b);
    const bestFIRE  = results.filter(r => r.fireAge > 0).reduce((a, b) => a.fireAge < b.fireAge ? a : b, results.filter(r => r.fireAge > 0)[0]);
    const bestCash  = results.reduce((a, b) => a.cashLowPoint > b.cashLowPoint ? a : b);
    const bestRisk  = results.reduce((a, b) =>
      (a.riskScore.liquidity + a.riskScore.leverage + a.riskScore.incomeStability) >
      (b.riskScore.liquidity + b.riskScore.leverage + b.riskScore.incomeStability) ? a : b
    );
    return { bestNW, bestFIRE, bestCash, bestRisk };
  }, [results]);

  // ── Chart data ───────────────────────────────────────────────────────────────
  const netWorthChartData = useMemo(() => {
    if (!results.length) return [];
    const allYears = Array.from(
      new Set(results.flatMap(r => r.years.map(y => y.year)))
    ).sort();
    return allYears.map(yr => {
      const row: any = { label: String(yr) };
      results.forEach(r => {
        const y = r.years.find(y => y.year === yr);
        row[r.name] = y ? Math.round(y.netWorth) : undefined;
      });
      return row;
    });
  }, [results]);

  const cashflowChartData = useMemo(() => {
    if (!results.length) return [];
    const allYears = Array.from(
      new Set(results.flatMap(r => r.years.map(y => y.year)))
    ).sort();
    return allYears.map(yr => {
      const row: any = { label: String(yr) };
      results.forEach(r => {
        const y = r.years.find(y => y.year === yr);
        row[r.name] = y ? Math.round(y.cash) : undefined;
      });
      return row;
    });
  }, [results]);

  const radarChartData = useMemo(() => {
    return RADAR_AXES.map(axis => {
      const row: any = { axis: axis.label };
      results.forEach(r => {
        row[r.name] = r.riskScore[axis.key as keyof RiskRadarData];
      });
      return row;
    });
  }, [results]);

  // Monte Carlo: approximate probability of reaching 3M net worth by 2035
  const mcData = useMemo(() => {
    if (!results.length) return [];
    return results.map(r => {
      const target = 3_000_000;
      const nw2035 = r.netWorth2035;
      // Rough probability based on how far they are from target, adjusted for risk
      const riskAdj = r.riskLevel === "aggressive" ? 0.15 : r.riskLevel === "moderate" ? 0.08 : 0.04;
      const base    = Math.min(95, Math.max(5, (nw2035 / target) * 100));
      const p10     = Math.max(5,  base - riskAdj * 100 * 1.5);
      const p50     = Math.max(10, base);
      const p90     = Math.min(98, base + riskAdj * 100);
      return { name: r.name, color: r.color, p10: Math.round(p10), p50: Math.round(p50), p90: Math.round(p90) };
    });
  }, [results]);

  // Active scenario result
  const activeResult = results.find(r => r.id === activeId);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 pb-16">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <FlaskConical className="w-6 h-6 text-primary mt-0.5 shrink-0" />
          <div>
            <h1 className="text-lg font-bold text-foreground">Scenario Compare Lab</h1>
            <p className="text-xs text-muted-foreground">Test multiple futures before making your next move.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={addScenario}      className="gap-1.5 text-xs h-8">
            <Plus className="w-3.5 h-3.5" /> New Scenario
          </Button>
          <Button size="sm" variant="outline" onClick={duplicateActive}  className="gap-1.5 text-xs h-8">
            <Copy className="w-3.5 h-3.5" /> Duplicate
          </Button>
          <Button size="sm" onClick={handleRunAll} disabled={running}    className="gap-1.5 text-xs h-8">
            {running ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {running ? "Running…" : "Run All"}
          </Button>
        </div>
      </div>

      {/* ── Smart Templates ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" /> Smart Templates
        </p>
        <div className="flex flex-wrap gap-2">
          {SMART_TEMPLATES.map(t => (
            <button
              key={t.label}
              onClick={() => applyTemplate(t)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/50 border border-border hover:bg-primary/10 hover:border-primary/40 transition-all text-xs font-medium text-foreground"
            >
              <t.icon className="w-3 h-3 text-primary shrink-0" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Three-column layout ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_260px] gap-4">

        {/* ══ LEFT — Scenario List ══════════════════════════════════════════ */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">Scenarios</p>
          {scenarios.map(s => {
            const Icon  = STRATEGY_ICONS[s.strategyType];
            const res   = results.find(r => r.id === s.id);
            const isAct = s.id === activeId;
            return (
              <div
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={`rounded-xl border p-3 cursor-pointer transition-all ${
                  isAct
                    ? "border-primary/60 bg-primary/10"
                    : "border-border bg-card hover:border-border/80 hover:bg-secondary/30"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <p className="text-xs font-semibold text-foreground truncate">{s.name}</p>
                  </div>
                  {s.id !== "base" && (
                    <button onClick={e => { e.stopPropagation(); deleteScenario(s.id); }}
                      className="text-muted-foreground hover:text-red-400 transition-colors p-0.5 rounded">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Icon className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-[10px] text-muted-foreground capitalize">{s.strategyType.replace("_", " ")}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    s.riskLevel === "conservative" ? "bg-emerald-500/20 text-emerald-400"
                    : s.riskLevel === "moderate"   ? "bg-amber-500/20 text-amber-400"
                    : "bg-red-500/20 text-red-400"
                  }`}>{RISK_LABELS[s.riskLevel]}</span>
                </div>
                {res && (
                  <p className="text-[11px] font-mono text-primary mt-1.5">
                    {formatCurrency(res.netWorth2035, true)} by 2035
                  </p>
                )}
                {!res && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Press Run All to project
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* ══ CENTER — Scenario Builder ════════════════════════════════════ */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Builder header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-secondary/20">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">
                {active?.name ?? "Select a Scenario"}
              </span>
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: active?.color }} />
            </div>
            <button onClick={() => setBuilderOpen(v => !v)} className="text-muted-foreground hover:text-foreground">
              {builderOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>

          {builderOpen && active && (
            <div className="p-4 space-y-0 overflow-y-auto max-h-[640px]">

              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-1 block">Scenario Name</Label>
                  <Input
                    value={active.name}
                    onChange={e => updateActive({ name: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-1 block">Risk Level</Label>
                  <Select value={active.riskLevel} onValueChange={v => updateActive({ riskLevel: v as RiskLevel })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conservative">Conservative</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="aggressive">Aggressive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-1 block">Strategy</Label>
                  <Select value={active.strategyType} onValueChange={v => updateActive({ strategyType: v as StrategyType })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="balanced">Balanced</SelectItem>
                      <SelectItem value="property">Property</SelectItem>
                      <SelectItem value="stocks">Stocks</SelectItem>
                      <SelectItem value="debt_reduction">Debt Reduction</SelectItem>
                      <SelectItem value="fire">FIRE</SelectItem>
                      <SelectItem value="tax">Tax Strategy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* INCOME */}
              <SectionHeader title="Income Assumptions" icon={DollarSign} />
              <FieldRow label="Salary Growth (%/yr)" value={active.overrides.salaryGrowthPct}
                onChange={v => updateOverride("salaryGrowthPct", parseFloat(v) || 0)}
                prefix="" suffix="%" hint="Applied to combined monthly income" />
              <div className="flex items-center justify-between py-2 border-b border-border/30">
                <p className="text-[11px] font-medium text-foreground">Second Income Active</p>
                <button
                  onClick={() => updateOverride("secondIncomeEnabled", !active.overrides.secondIncomeEnabled)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    active.overrides.secondIncomeEnabled ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                    active.overrides.secondIncomeEnabled ? "left-5" : "left-0.5"
                  }`} />
                </button>
              </div>
              <FieldRow label="Rental Income Growth (%/yr)" value={active.overrides.rentalGrowthPct}
                onChange={v => updateOverride("rentalGrowthPct", parseFloat(v) || 0)}
                prefix="" suffix="%" />

              {/* EXPENSES */}
              <SectionHeader title="Expenses" icon={Minus} />
              <FieldRow label="Inflation (%/yr)" value={active.overrides.inflationPct}
                onChange={v => updateOverride("inflationPct", parseFloat(v) || 0)}
                prefix="" suffix="%" />
              <FieldRow label="Reduce Spending ($/mo)" value={active.overrides.reduceSpendingMonthly}
                onChange={v => updateOverride("reduceSpendingMonthly", parseFloat(v) || 0)}
                hint="Flat monthly reduction" />
              <FieldRow label="Childcare Ends (year)" value={active.overrides.childcareEndsYear || ""}
                onChange={v => updateOverride("childcareEndsYear", parseInt(v) || 0)}
                prefix="" hint="e.g. 2028 → removes childcare cost" />

              {/* DEBT */}
              <SectionHeader title="Debt Strategy" icon={Minus} />
              <FieldRow label="Extra Mortgage Repayment" value={active.overrides.extraMortgageMonthly}
                onChange={v => updateOverride("extraMortgageMonthly", parseFloat(v) || 0)}
                hint="Monthly extra principal payment" />
              <FieldRow label="Refinance to Rate (%)" value={active.overrides.refinanceRate || ""}
                onChange={v => updateOverride("refinanceRate", parseFloat(v) || 0)}
                prefix="" suffix="%" hint="0 = keep current rate" />

              {/* PROPERTY PURCHASE */}
              <SectionHeader title="Property Purchase" icon={Building2} />
              <div className="flex items-center justify-between py-2 border-b border-border/30">
                <p className="text-[11px] font-medium text-foreground">Buy Investment Property</p>
                <button
                  onClick={() => updateOverride("buyProperty", !active.overrides.buyProperty)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    active.overrides.buyProperty ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                    active.overrides.buyProperty ? "left-5" : "left-0.5"
                  }`} />
                </button>
              </div>
              {active.overrides.buyProperty && (<>
                <FieldRow label="Buy in (months from now)" value={active.overrides.buyPropertyMonth}
                  onChange={v => updateOverride("buyPropertyMonth", parseInt(v) || 1)}
                  prefix="" min={1} hint="e.g. 2 = in 2 months" />
                <FieldRow label="Purchase Price" value={active.overrides.buyPropertyPrice}
                  onChange={v => updateOverride("buyPropertyPrice", parseFloat(v) || 0)} />
                <FieldRow label="Deposit" value={active.overrides.buyPropertyDeposit}
                  onChange={v => updateOverride("buyPropertyDeposit", parseFloat(v) || 0)} />
                <FieldRow label="Loan Rate (%/yr)" value={active.overrides.buyPropertyLoanRate}
                  onChange={v => updateOverride("buyPropertyLoanRate", parseFloat(v) || 0)}
                  prefix="" suffix="%" />
                <FieldRow label="Weekly Rent" value={active.overrides.buyPropertyRent}
                  onChange={v => updateOverride("buyPropertyRent", parseFloat(v) || 0)}
                  hint="$/week gross" />
                <FieldRow label="Capital Growth (%/yr)" value={active.overrides.buyPropertyGrowthPct}
                  onChange={v => updateOverride("buyPropertyGrowthPct", parseFloat(v) || 0)}
                  prefix="" suffix="%" />
              </>)}

              {/* STOCKS */}
              <SectionHeader title="Stocks" icon={TrendingUp} />
              <FieldRow label="Monthly DCA" value={active.overrides.stockDCAMonthly}
                onChange={v => updateOverride("stockDCAMonthly", parseFloat(v) || 0)} />
              <FieldRow label="Lump Sum" value={active.overrides.stockLumpSum}
                onChange={v => updateOverride("stockLumpSum", parseFloat(v) || 0)} />
              <FieldRow label="Lump Sum in (months)" value={active.overrides.stockLumpSumMonth}
                onChange={v => updateOverride("stockLumpSumMonth", parseInt(v) || 1)}
                prefix="" min={1} />
              <FieldRow label="Expected Return (%/yr)" value={active.overrides.stockReturnPct}
                onChange={v => updateOverride("stockReturnPct", parseFloat(v) || 0)}
                prefix="" suffix="%" />

              {/* CRYPTO */}
              <SectionHeader title="Crypto" icon={Zap} />
              <FieldRow label="Monthly DCA" value={active.overrides.cryptoDCAMonthly}
                onChange={v => updateOverride("cryptoDCAMonthly", parseFloat(v) || 0)} />
              <FieldRow label="Lump Sum" value={active.overrides.cryptoLumpSum}
                onChange={v => updateOverride("cryptoLumpSum", parseFloat(v) || 0)} />
              <FieldRow label="Expected Return (%/yr)" value={active.overrides.cryptoReturnPct}
                onChange={v => updateOverride("cryptoReturnPct", parseFloat(v) || 0)}
                prefix="" suffix="%" />

              {/* CGT / PROPERTY SALE */}
              <SectionHeader title="CGT Tax Test — Property Sale" icon={DollarSign} />
              <div className="flex items-center justify-between py-2 border-b border-border/30">
                <p className="text-[11px] font-medium text-foreground">Include Property Sale</p>
                <button
                  onClick={() => updateOverride("sellPropertyEnabled", !active.overrides.sellPropertyEnabled)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    active.overrides.sellPropertyEnabled ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                    active.overrides.sellPropertyEnabled ? "left-5" : "left-0.5"
                  }`} />
                </button>
              </div>
              {active.overrides.sellPropertyEnabled && (<>
                <FieldRow label="Buy Price" value={active.overrides.sellPropertyBuyPrice}
                  onChange={v => updateOverride("sellPropertyBuyPrice", parseFloat(v) || 0)} />
                <FieldRow label="Sale Price" value={active.overrides.sellPropertySalePrice}
                  onChange={v => updateOverride("sellPropertySalePrice", parseFloat(v) || 0)} />
                <FieldRow label="Hold Period (months)" value={active.overrides.sellPropertyHoldMonths}
                  onChange={v => updateOverride("sellPropertyHoldMonths", parseInt(v) || 0)}
                  prefix="" hint="≥12 = 50% CGT discount" />
                <FieldRow label="Initial Deposit Paid" value={active.overrides.sellPropertyDeposit}
                  onChange={v => updateOverride("sellPropertyDeposit", parseFloat(v) || 0)} />
                <FieldRow label="Buying Costs (stamp duty etc.)" value={active.overrides.sellPropertyBuyingCosts}
                  onChange={v => updateOverride("sellPropertyBuyingCosts", parseFloat(v) || 0)} />
                <FieldRow label="Loan Amount" value={active.overrides.sellPropertyLoanAmount}
                  onChange={v => updateOverride("sellPropertyLoanAmount", parseFloat(v) || 0)} />
                <FieldRow label="Loan Interest Rate (%pa)" value={active.overrides.sellPropertyLoanRatePct}
                  onChange={v => updateOverride("sellPropertyLoanRatePct", parseFloat(v) || 6.5)}
                  prefix="" suffix="%" />
                <FieldRow label="Weekly Rent" value={active.overrides.sellPropertyWeeklyRent}
                  onChange={v => updateOverride("sellPropertyWeeklyRent", parseFloat(v) || 0)} />
                <FieldRow label="Annual Holding Costs" value={active.overrides.sellPropertyAnnualCosts}
                  onChange={v => updateOverride("sellPropertyAnnualCosts", parseFloat(v) || 0)}
                  hint="Council + insurance + other" />
                <FieldRow label="Roham Ownership %" value={active.overrides.sellPropertyOwnerPct}
                  onChange={v => updateOverride("sellPropertyOwnerPct", parseFloat(v) || 50)}
                  prefix="" suffix="%" />
                <FieldRow label="Sell in (months from now)" value={active.overrides.sellPropertyMonth}
                  onChange={v => updateOverride("sellPropertyMonth", parseInt(v) || 1)}
                  prefix="" min={1} />
                <FieldRow label="Roham Taxable Income ($)" value={active.overrides.sellPropertyBaseIncome}
                  onChange={v => updateOverride("sellPropertyBaseIncome", parseFloat(v) || 0)} />
              </>)}
            </div>
          )}
        </div>

        {/* ══ RIGHT — Winner Insights ══════════════════════════════════════ */}
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">Winner Insights</p>

          {!resultsReady && (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center">
              <FlaskConical className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Press Run All to see projections</p>
              <Button size="sm" onClick={handleRunAll} className="mt-3 text-xs h-7 gap-1.5">
                <Play className="w-3 h-3" /> Run All
              </Button>
            </div>
          )}

          {resultsReady && winners && (<>
            <WinnerBadge label="Best Net Worth 2035" value={winners.bestNW.name}
              icon={Trophy} color="#22c55e" />
            <WinnerBadge label="Lowest Risk"          value={winners.bestRisk.name}
              icon={Shield} color="#3b82f6" />
            <WinnerBadge label="Fastest FIRE"         value={winners.bestFIRE?.name ?? "None reached"}
              icon={Flame}  color="#f59e0b" />
            <WinnerBadge label="Best Cash Stability"  value={winners.bestCash.name}
              icon={DollarSign} color="#a855f7" />

            {/* Active CGT result */}
            {activeResult?.cgtResult && (() => {
              const cgt = activeResult.cgtResult;
              const ov  = active.overrides;
              const useO12 = ov.sellPropertyHoldMonths >= 12;
              const cashToBank   = useO12 ? cgt.netProceedsO12 : cgt.netProceedsU12;
              const trueNetProfit = useO12 ? cgt.trueNetProfitO12 : cgt.trueNetProfitU12;
              const tax           = useO12 ? cgt.taxOver12 : cgt.taxUnder12;
              return (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2 mt-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    CGT Tax Test — {ov.sellPropertyHoldMonths}mo hold
                    {useO12 && <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-400">50% discount</span>}
                    {!useO12 && <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-red-500/20 text-red-400">No discount</span>}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <div>
                      <p className="text-muted-foreground">Gross Gain</p>
                      <p className="font-mono font-semibold text-foreground">{formatCurrency(cgt.grossGain)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tax Saved (vs &lt;12mo)</p>
                      <p className="font-mono font-semibold text-emerald-400">{formatCurrency(cgt.taxSaved)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">ATO Tax</p>
                      <p className="font-mono text-red-400">{formatCurrency(tax)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Net Holding Costs</p>
                      <p className="font-mono text-orange-400"
                        title={`Interest: ${formatCurrency(cgt.interestExpense)} + Other costs \u2212 rental\nPrincipal ${formatCurrency(cgt.principalRepaid)} excluded \u2014 equity transfer`}>
                        {formatCurrency(Math.max(0, cgt.netHoldingCosts))}
                      </p>
                    </div>
                  </div>
                  {/* True Net Profit formula breakdown */}
                  <div className="border-t border-amber-500/20 pt-2 space-y-0.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-amber-400/60">True Net Profit Formula</p>
                    <div className="text-[10px] text-muted-foreground space-y-0.5 font-mono">
                      <div className="flex justify-between">
                        <span className="text-sky-400">Cash to Bank</span>
                        <span className="text-sky-400">{formatCurrency(cashToBank)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>− Deposit</span>
                        <span className="text-red-400">−{formatCurrency(ov.sellPropertyDeposit)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>− Buying Costs</span>
                        <span className="text-red-400">−{formatCurrency(ov.sellPropertyBuyingCosts)}</span>
                      </div>
                      <div className="flex justify-between" title={`Interest ${formatCurrency(cgt.interestExpense)} + costs \u2212 rental. Principal ${formatCurrency(cgt.principalRepaid)} excluded.`}>
                        <span>− Net Holding Costs <span className="text-[9px] text-muted-foreground/50">(interest only)</span></span>
                        <span className="text-orange-400">−{formatCurrency(Math.max(0, cgt.netHoldingCosts))}</span>
                      </div>
                      <div className="flex justify-between border-t border-amber-500/20 pt-1 font-bold">
                        <span style={{ color: trueNetProfit >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" }}>= True Net Profit</span>
                        <span style={{ color: trueNetProfit >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" }}>{formatCurrency(trueNetProfit)}</span>
                      </div>
                      {cgt.principalRepaid > 0 && (
                        <div className="text-[9px] text-sky-400/60 pt-0.5">
                          ⓘ Principal {formatCurrency(cgt.principalRepaid)} excluded — equity transfer recovered in cashToBank
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Quick score summary */}
            <div className="rounded-xl border border-border bg-card p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">AI Score</p>
              {results.map(r => (
                <div key={r.id} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} />
                  <p className="text-[11px] text-foreground truncate flex-1">{r.name}</p>
                  <div className="flex items-center gap-1">
                    <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${r.score}%`, background: r.color }} />
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground w-6 text-right">{r.score}</span>
                  </div>
                </div>
              ))}
            </div>
          </>)}
        </div>
      </div>

      {/* ══ Results Table ════════════════════════════════════════════════════ */}
      {resultsReady && sortedResults.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border/60 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Comparison Table</h2>
            <span className="text-[10px] text-muted-foreground ml-auto">Click columns to sort</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/40 bg-secondary/20">
                  {[
                    { col: "name" as const, label: "Scenario" },
                    { col: "netWorth2035" as const, label: "Net Worth 2035" },
                    { col: "fireAge" as const, label: "FIRE Age" },
                    { col: "cashLowPoint" as const, label: "Cash Low" },
                    { col: "passiveIncome" as const, label: "Passive Income/yr" },
                    { col: "score" as const, label: "Score" },
                  ].map(h => (
                    <th key={h.col} onClick={() => toggleSort(h.col as keyof ScenarioResult)}
                      className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap">
                      <span className="flex items-center gap-1">
                        {h.label}
                        {sortCol === h.col && (
                          sortDir === "desc"
                            ? <ChevronDown className="w-3 h-3 text-primary" />
                            : <ChevronRight className="w-3 h-3 text-primary rotate-90" />
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Risk</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((r, i) => (
                  <tr key={r.id}
                    onClick={() => setActiveId(r.id)}
                    className={`border-b border-border/30 cursor-pointer transition-colors hover:bg-secondary/30 ${r.id === activeId ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                        <span className="font-medium text-foreground">{r.name}</span>
                        {i === 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-bold">TOP</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-foreground">{formatCurrency(r.netWorth2035, true)}</td>
                    <td className="px-4 py-3">
                      {r.fireAge > 0
                        ? <span className="text-emerald-400 font-semibold">{r.fireAge}</span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 font-mono">
                      <span className={r.cashLowPoint < 0 ? "text-red-400" : "text-foreground"}>
                        {formatCurrency(r.cashLowPoint, true)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-foreground">{formatCurrency(r.passiveIncome, true)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${r.score}%`, background: r.color }} />
                        </div>
                        <span className="font-semibold text-foreground">{r.score}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        r.riskLevel === "conservative" ? "bg-emerald-500/20 text-emerald-400"
                        : r.riskLevel === "moderate"   ? "bg-amber-500/20 text-amber-400"
                        : "bg-red-500/20 text-red-400"
                      }`}>{RISK_LABELS[r.riskLevel]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══ Charts ══════════════════════════════════════════════════════════ */}
      {resultsReady && results.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-border/60 overflow-x-auto">
            {[
              { id: "networth",   label: "Net Worth",      icon: TrendingUp },
              { id: "cashflow",   label: "Cashflow",       icon: DollarSign },
              { id: "risk",       label: "Risk Radar",     icon: Shield },
              { id: "montecarlo", label: "Monte Carlo",    icon: FlaskConical },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-5">

            {/* Net Worth Compare */}
            {activeTab === "networth" && (
              <>
                <p className="text-xs font-semibold text-foreground mb-4">Net Worth Projection — All Scenarios</p>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={netWorthChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tickFormatter={v => `$${(v / 1_000_000).toFixed(1)}M`}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                      formatter={(v: any) => formatCurrency(v, true)}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {results.map(r => (
                      <Line key={r.id} type="monotone" dataKey={r.name}
                        stroke={r.color} strokeWidth={2} dot={false}
                        strokeDasharray={r.id === "base" ? "0" : undefined}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </>
            )}

            {/* Cashflow Compare */}
            {activeTab === "cashflow" && (
              <>
                <p className="text-xs font-semibold text-foreground mb-4">Cash Balance — All Scenarios</p>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={cashflowChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}K`}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                      formatter={(v: any) => formatCurrency(v, true)}
                    />
                    <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {results.map(r => (
                      <Line key={r.id} type="monotone" dataKey={r.name}
                        stroke={r.color} strokeWidth={2} dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-muted-foreground mt-2 text-center">
                  Red dashed line = cash goes negative
                </p>
              </>
            )}

            {/* Risk Radar */}
            {activeTab === "risk" && (
              <>
                <p className="text-xs font-semibold text-foreground mb-1">Risk Profile Comparison</p>
                <p className="text-[10px] text-muted-foreground mb-4">All axes: higher = better (Stability = inverse of volatility, Low Debt = inverse of leverage)</p>
                <ResponsiveContainer width="100%" height={340}>
                  <RadarChart data={radarChartData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
                    {results.map(r => (
                      <Radar key={r.id} name={r.name} dataKey={r.name}
                        stroke={r.color} fill={r.color} fillOpacity={0.15} strokeWidth={2}
                      />
                    ))}
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </>
            )}

            {/* Monte Carlo */}
            {activeTab === "montecarlo" && (
              <>
                <p className="text-xs font-semibold text-foreground mb-1">Probability of Reaching $3M Net Worth by 2035</p>
                <p className="text-[10px] text-muted-foreground mb-4">
                  Simulated probability bands: 10th / 50th / 90th percentile based on return uncertainty
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {mcData.map(mc => (
                    <div key={mc.name} className="rounded-xl border border-border bg-secondary/20 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: mc.color }} />
                        <p className="text-xs font-semibold text-foreground truncate">{mc.name}</p>
                      </div>
                      <div className="space-y-2">
                        {[
                          { label: "Pessimistic (P10)",  value: mc.p10, color: "#f43f5e" },
                          { label: "Base Case (P50)",    value: mc.p50, color: mc.color },
                          { label: "Optimistic (P90)",   value: mc.p90, color: "#22c55e" },
                        ].map(band => (
                          <div key={band.label}>
                            <div className="flex justify-between mb-0.5">
                              <span className="text-[10px] text-muted-foreground">{band.label}</span>
                              <span className="text-[10px] font-mono font-semibold" style={{ color: band.color }}>{band.value}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full transition-all"
                                style={{ width: `${band.value}%`, background: band.color }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-4 text-center">
                  Probability bands approximate market return uncertainty. Not financial advice.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Disclaimer ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-secondary/30 border border-border/40">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          All projections are hypothetical and for planning purposes only. Past performance is not indicative of future results.
          Tax calculations follow ATO 2025-26 guidance but should be verified with your accountant. Market returns, property
          growth rates, and interest rates are assumptions that may differ materially from actual outcomes.
        </p>
      </div>
    </div>
  );
}

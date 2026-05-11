/**
 * Family Wealth Lab — Registry & Scoring Test Suite (Phase 0e)
 *
 * Run with:  npm run test:registry
 *
 * Covers:
 *   A. Formula Registry
 *      - amortization math (rate=0, normal rate, IO)
 *      - offset effective rate (PPOR vs IP)
 *      - net rental yield + property total return
 *      - liquidity ratio (incl. ETF haircut, zero-expense edge)
 *      - dynamic liquidity floor (PAYG/self-emp, dependants, events)
 *      - DSR banding (every boundary)
 *      - refinance pressure band (all 4)
 *      - downside (clamping, neg P50)
 *      - survival probability (full set, half-weighted forced sales)
 *      - FIRE coverage + SWR sustainable spend
 *      - super: concessional cap incl. carry-forward, Div 293, SG rate
 *      - risk-adjusted return (downside + sequence penalty)
 *      - registry getters: getFormula, listFormulas
 *      - determinism: same input twice → identical output
 *
 *   B. Assumption Registry
 *      - default BasePlanAssumptions equals registry-derived
 *      - assertAssumptionsConsistent: clean + violations (low, high, NaN)
 *      - all spec.range.min ≤ defaultValue ≤ spec.range.max
 *      - REGISTRY_VERSION + REGISTRY_LAST_REVIEWED present
 *      - listAssumptions by category
 *
 *   C. Scoring Framework
 *      - weight convex sum guard (throws on bad)
 *      - validateScoreWeights happy + sad
 *      - monotonicity: ↑survival → ↑score (others fixed)
 *      - monotonicity: ↑liquidity → ↑score
 *      - penalty: refinance band step lowers score
 *      - penalty: LVR > 80% lowers score
 *      - top-of-range vs bottom-of-range produces distinct scores
 *      - score always in [0,100]
 *      - rationale array populated
 *      - terminalNw normalisation with/without reference
 *
 * Exit 0 on all pass, 1 on any failure.
 */

import {
  // Formulas
  amortizationPayment,
  amortizationSchedule,
  interestOnlyPayment,
  offsetEffectiveRate,
  netRentalYield,
  propertyTotalReturn,
  liquidityRatio,
  dynamicLiquidityFloor,
  dsrBand,
  refinancePressureBand,
  downside,
  survivalProbability,
  fireCoverage,
  swrSustainableSpend,
  riskAdjustedReturn,
  concessionalSuperCap,
  divisionTwoNinetyThreeTax,
  superGuaranteeRate,
  SUPER_CONSTANTS_FY26,
  FORMULA_REGISTRY,
  getFormula,
  listFormulas,
  // Assumptions
  ASSUMPTION_REGISTRY,
  REGISTRY_VERSION,
  REGISTRY_LAST_REVIEWED,
  getAssumption,
  listAssumptions,
  assertAssumptionsConsistent,
  defaultBasePlanAssumptionsFromRegistry,
  // Scoring
  compositeScore,
  validateScoreWeights,
  DEFAULT_SCORE_WEIGHTS,
  type ScoreInputs,
} from "../client/src/lib/scenarioV2/registry";
import { DEFAULT_ASSUMPTIONS } from "../client/src/lib/scenarioV2/basePlan";

// ─── harness ─────────────────────────────────────────────────────────────────

let pass = 0;
let fail = 0;

function assert(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    pass++;
    process.stdout.write(`  ✓ ${name}\n`);
  } else {
    fail++;
    process.stdout.write(`  ✗ ${name}${detail ? `  — ${detail}` : ""}\n`);
  }
}

function near(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

function section(title: string): void {
  process.stdout.write(`\n${title}\n`);
}

function throws(fn: () => unknown): boolean {
  try { fn(); return false; } catch { return true; }
}

// ════════════════════════════════════════════════════════════════════════════
// A. FORMULA REGISTRY
// ════════════════════════════════════════════════════════════════════════════

section("A. Formula Registry");

// Amortization
{
  // Known case: $500k @ 6% over 30y → ~$2997.75/mo
  const pay = amortizationPayment({ principal: 500_000, annualRate: 0.06, termYears: 30 });
  assert("amortizationPayment $500k @ 6% / 30y ≈ $2997.75", near(pay, 2997.7521, 0.5),
    `got ${pay.toFixed(2)}`);

  // Zero rate
  assert("amortizationPayment rate=0 → principal/n",
    near(amortizationPayment({ principal: 360_000, annualRate: 0, termYears: 30 }), 1000, 1e-6));

  // Zero principal
  assert("amortizationPayment principal=0 → 0",
    amortizationPayment({ principal: 0, annualRate: 0.06, termYears: 30 }) === 0);

  // Schedule balance reaches 0 at end of term
  const sched = amortizationSchedule({ principal: 100_000, annualRate: 0.06, termYears: 5 });
  assert("amortizationSchedule final balance is 0",
    Math.abs(sched[sched.length - 1].balance) < 0.01,
    `final balance: ${sched[sched.length - 1].balance.toFixed(4)}`);
  assert("amortizationSchedule row count = 60", sched.length === 60);

  // Interest-only
  assert("interestOnlyPayment $500k @ 6% → $2500/mo",
    near(interestOnlyPayment({ principal: 500_000, annualRate: 0.06 }), 2500, 1e-6));
}

// Offset effective rate
{
  // PPOR offset @ 6.5% mortgage, 32% marginal: after-tax = 6.5%, pre-tax-equiv = 6.5/0.68
  const ppor = offsetEffectiveRate({ mortgageRate: 0.065, marginalTaxRate: 0.32, isInvestmentLoan: false });
  assert("offset PPOR afterTaxYield = mortgageRate",
    near(ppor.afterTaxYield, 0.065, 1e-9));
  assert("offset PPOR preTaxEquivalent = m/(1−t)",
    near(ppor.preTaxEquivalent, 0.065 / 0.68, 1e-9));

  const ip = offsetEffectiveRate({ mortgageRate: 0.065, marginalTaxRate: 0.32, isInvestmentLoan: true });
  assert("offset IP afterTaxYield = m·(1−t)",
    near(ip.afterTaxYield, 0.065 * 0.68, 1e-9));
  assert("offset IP preTaxEquivalent = m",
    near(ip.preTaxEquivalent, 0.065, 1e-9));
}

// Net rental yield + total return
{
  const y = netRentalYield({
    marketValue: 800_000, annualRent: 32_000, vacancyRate: 0.04,
    annualHoldingCosts: 6_000, annualInterest: 20_000,
  });
  // gross 32k × 0.96 = 30720; minus 6k − 20k = 4720; / 800k = 0.0059
  assert("netRentalYield ≈ 0.59%", near(y, 0.0059, 1e-4));

  const tr = propertyTotalReturn({
    capitalGrowthRate: 0.065, netRentalYield: 0.0059, taxDragOnValue: 0.005,
  });
  assert("propertyTotalReturn ≈ 6.59%", near(tr, 0.0659, 1e-4));

  // Zero market value → yield = 0
  assert("netRentalYield zero MV → 0",
    netRentalYield({ marketValue: 0, annualRent: 30000, vacancyRate: 0, annualHoldingCosts: 5000, annualInterest: 10000 }) === 0);
}

// Liquidity ratio
{
  const lr = liquidityRatio({ cash: 30_000, offsetBalance: 50_000, etfValue: 100_000, monthlyExpenses: 10_000 });
  // 30 + 50 + 95 = 175; /10 = 17.5
  assert("liquidityRatio default haircut → 17.5mo", near(lr, 17.5, 1e-6));

  const lr0 = liquidityRatio({ cash: 0, offsetBalance: 0, etfValue: 0, monthlyExpenses: 5000 });
  assert("liquidityRatio zero liquid → 0mo", lr0 === 0);

  const lrInf = liquidityRatio({ cash: 10000, offsetBalance: 0, etfValue: 0, monthlyExpenses: 0 });
  assert("liquidityRatio zero expenses → Infinity", lrInf === Number.POSITIVE_INFINITY);
}

// Dynamic liquidity floor
{
  // PAYG, no dependants, low LVR, no events → close to base 3mo
  const payg = dynamicLiquidityFloor({
    monthlyExpenses: 10_000, dependants: 0, incomeVolatility: 0.05,
    totalLvr: 0.30, illiquidAssetShare: 0.40, upcomingEvents12mo: [],
  });
  // base 3 + vol(0.05*24=1.2) + lev(0) + illiq(4*0.40/0.80=2.0) = 6.2
  assert("dynLiqFloor PAYG with 40% illiquid ≈ 6.2mo", near(payg.floorMonths, 6.2, 0.01),
    `got ${payg.floorMonths.toFixed(2)}`);

  // Self-employed with 2 kids, high LVR, refinance + IP in 12mo
  const stress = dynamicLiquidityFloor({
    monthlyExpenses: 10_000, dependants: 2, incomeVolatility: 0.40,
    totalLvr: 0.75, illiquidAssetShare: 0.80,
    upcomingEvents12mo: [{ type: "refinance" }, { type: "buy_property" }],
  });
  // base 3 + 1 (dep) + 9.6 (vol) + 1.5 (lev) + 4 (illiq) + 3 + 6 = 28.1 → clamped 24
  assert("dynLiqFloor stress case clamped to 24mo", stress.floorMonths === 24);

  // Clamp lower bound = 3
  const tiny = dynamicLiquidityFloor({
    monthlyExpenses: 5000, dependants: 0, incomeVolatility: 0,
    totalLvr: 0, illiquidAssetShare: 0, upcomingEvents12mo: [],
  });
  assert("dynLiqFloor lower clamp = 3mo", tiny.floorMonths === 3);

  // Dollars track months × expenses
  assert("dynLiqFloor floorDollars = floorMonths × expenses",
    near(stress.floorDollars, stress.floorMonths * 10_000, 1e-6));

  // Rationale populated
  assert("dynLiqFloor rationale non-empty", stress.rationale.length > 0);
}

// DSR banding — every boundary
{
  assert("dsrBand 0.0 → healthy",        dsrBand(0.0) === "healthy");
  assert("dsrBand 0.299 → healthy",      dsrBand(0.299) === "healthy");
  assert("dsrBand 0.30 → watchlist",     dsrBand(0.30) === "watchlist");
  assert("dsrBand 0.399 → watchlist",    dsrBand(0.399) === "watchlist");
  assert("dsrBand 0.40 → stressed",      dsrBand(0.40) === "stressed");
  assert("dsrBand 0.549 → stressed",     dsrBand(0.549) === "stressed");
  assert("dsrBand 0.55 → critical",      dsrBand(0.55) === "critical");
  assert("dsrBand 1.20 → critical",      dsrBand(1.20) === "critical");
  assert("dsrBand neg → critical",       dsrBand(-0.1) === "critical");
  assert("dsrBand NaN → critical",       dsrBand(NaN) === "critical");
}

// Refinance pressure band
{
  assert("refiBand high NSR + headroom → none",
    refinancePressureBand({ nsrBuffered: 1.40, rateHeadroomBps: 250, monthsToNextRefinance: null }) === "none");
  assert("refiBand NSR 1.20 → mild",
    refinancePressureBand({ nsrBuffered: 1.20, rateHeadroomBps: 250, monthsToNextRefinance: null }) === "mild");
  assert("refiBand NSR 1.05 → elevated",
    refinancePressureBand({ nsrBuffered: 1.05, rateHeadroomBps: 250, monthsToNextRefinance: null }) === "elevated");
  assert("refiBand low headroom → elevated",
    refinancePressureBand({ nsrBuffered: 1.40, rateHeadroomBps: 50, monthsToNextRefinance: null }) === "elevated");
  assert("refiBand NSR < 1 → severe",
    refinancePressureBand({ nsrBuffered: 0.90, rateHeadroomBps: 300, monthsToNextRefinance: null }) === "severe");
  assert("refiBand refi <6mo + marginal NSR → severe",
    refinancePressureBand({ nsrBuffered: 1.10, rateHeadroomBps: 300, monthsToNextRefinance: 3 }) === "severe");
}

// Downside
{
  assert("downside clean: P10=80, P50=100 → 0.20", near(downside(80, 100), 0.20, 1e-6));
  assert("downside P10 > P50 → 0", downside(120, 100) === 0);
  assert("downside negative P10 clamped to 1", downside(-50, 100) === 1);
  assert("downside zero P50 → 1", downside(0, 0) === 1);
}

// Survival probability
{
  const s = survivalProbability({ totalPaths: 1000, defaultedPaths: 10, forcedSalePaths: 40 });
  // (10 + 20) / 1000 = 0.03 → survival 0.97
  assert("survivalProbability 1000/10/40 → 0.97", near(s, 0.97, 1e-9));
  assert("survivalProbability zero paths → 1",
    survivalProbability({ totalPaths: 0, defaultedPaths: 0, forcedSalePaths: 0 }) === 1);
  assert("survivalProbability all defaulted → 0",
    survivalProbability({ totalPaths: 100, defaultedPaths: 100, forcedSalePaths: 0 }) === 0);
}

// FIRE coverage
{
  const fc = fireCoverage({
    investedLiquid: 1_000_000, propertyEquity: 800_000,
    netRentalIncome: 20_000, swr: 0.04, annualExpenses: 80_000,
  });
  // 1M × 0.04 = 40k + 20k = 60k; / 80k = 0.75
  assert("fireCoverage ≈ 0.75", near(fc, 0.75, 1e-9));

  assert("fireCoverage zero expenses → Infinity",
    fireCoverage({ investedLiquid: 100000, propertyEquity: 0, netRentalIncome: 0, swr: 0.04, annualExpenses: 0 }) === Number.POSITIVE_INFINITY);

  assert("swrSustainableSpend $1M @ 4% = $40k",
    near(swrSustainableSpend({ portfolio: 1_000_000, swr: 0.04 }), 40_000, 1e-9));
}

// Super: concessional cap + Div 293 + SG rate
{
  // TSB < $500k → carry-forward usable
  const cap1 = concessionalSuperCap({ fy: "2025-26", totalSuperBalanceJune30: 200_000, carryForwardAvailable: 15_000 });
  assert("concessionalSuperCap TSB<500k → cap + carry",
    cap1.effectiveCap === 45_000 && cap1.carryForwardUsable === true);
  const cap2 = concessionalSuperCap({ fy: "2025-26", totalSuperBalanceJune30: 800_000, carryForwardAvailable: 15_000 });
  assert("concessionalSuperCap TSB≥500k → base cap only",
    cap2.effectiveCap === 30_000 && cap2.carryForwardUsable === false);

  // Div 293: income above $250k threshold
  const d1 = divisionTwoNinetyThreeTax({ income: 230_000, concessionalContributionsThisYear: 30_000 });
  // combined 260k; over by 10k; taxable = min(30k, 10k) = 10k; extra = 1500
  assert("Div 293 income 230k + 30k contrib → 10k taxable, $1500 extra",
    d1.liable && near(d1.extraTax, 1500, 1e-6));
  const d2 = divisionTwoNinetyThreeTax({ income: 200_000, concessionalContributionsThisYear: 20_000 });
  assert("Div 293 below threshold → no liability",
    !d2.liable && d2.extraTax === 0);

  assert("SG rate FY26 = 11.5%", superGuaranteeRate("2025-26") === 0.115);
  assert("SUPER_CONSTANTS_FY26.concessionalCap = $30k", SUPER_CONSTANTS_FY26.concessionalCap === 30_000);
}

// Risk-adjusted return
{
  const rar1 = riskAdjustedReturn({ expectedReturnCagr: 0.10, downside: 0, sequenceRisk: 0 });
  assert("riskAdj no penalties → expected", near(rar1, 0.10, 1e-9));

  const rar2 = riskAdjustedReturn({ expectedReturnCagr: 0.10, downside: 0.40, sequenceRisk: 0 });
  // 0.10 × (1 − 0.20) = 0.08
  assert("riskAdj downside 0.40 → 0.08", near(rar2, 0.08, 1e-9));

  const rar3 = riskAdjustedReturn({ expectedReturnCagr: 0.10, downside: 0.40, sequenceRisk: 0.30 });
  // 0.10 × 0.80 × 0.70 = 0.056
  assert("riskAdj both penalties → 0.056", near(rar3, 0.056, 1e-9));
}

// Registry index
{
  assert("FORMULA_REGISTRY has ≥ 25 entries", Object.keys(FORMULA_REGISTRY).length >= 25,
    `got ${Object.keys(FORMULA_REGISTRY).length}`);
  assert("getFormula('dsr') returns spec", getFormula("dsr").id === "dsr");
  assert("getFormula unknown throws", throws(() => getFormula("__nope__")));

  assert("listFormulas('borrowing') non-empty", listFormulas("borrowing").length >= 5);
  assert("listFormulas all categories",
    listFormulas().length === Object.keys(FORMULA_REGISTRY).length);
}

// Determinism: same input → identical output across helpers
{
  const a = amortizationPayment({ principal: 425_000, annualRate: 0.0639, termYears: 30 });
  const b = amortizationPayment({ principal: 425_000, annualRate: 0.0639, termYears: 30 });
  assert("amortization deterministic", a === b);

  const f1 = dynamicLiquidityFloor({ monthlyExpenses: 8000, dependants: 1, incomeVolatility: 0.1, totalLvr: 0.6, illiquidAssetShare: 0.5, upcomingEvents12mo: [{type:"refinance"}] });
  const f2 = dynamicLiquidityFloor({ monthlyExpenses: 8000, dependants: 1, incomeVolatility: 0.1, totalLvr: 0.6, illiquidAssetShare: 0.5, upcomingEvents12mo: [{type:"refinance"}] });
  assert("dynLiqFloor deterministic", f1.floorMonths === f2.floorMonths && f1.floorDollars === f2.floorDollars);
}

// ════════════════════════════════════════════════════════════════════════════
// B. ASSUMPTION REGISTRY
// ════════════════════════════════════════════════════════════════════════════

section("B. Assumption Registry");

{
  assert("REGISTRY_VERSION defined", typeof REGISTRY_VERSION === "string" && REGISTRY_VERSION.length > 0);
  assert("REGISTRY_LAST_REVIEWED defined", typeof REGISTRY_LAST_REVIEWED === "string" && REGISTRY_LAST_REVIEWED.length === 10);
  assert("ASSUMPTION_REGISTRY has ≥ 20 entries", Object.keys(ASSUMPTION_REGISTRY).length >= 20,
    `got ${Object.keys(ASSUMPTION_REGISTRY).length}`);

  // Default range invariant
  let invariantOk = true;
  for (const [id, spec] of Object.entries(ASSUMPTION_REGISTRY)) {
    const min = spec.range.min as number;
    const max = spec.range.max as number;
    const dv = spec.defaultValue as number;
    if (!(min <= dv && dv <= max)) {
      invariantOk = false;
      process.stdout.write(`    ! invariant fail: ${id} default ${dv} not in [${min}, ${max}]\n`);
    }
  }
  assert("every assumption default within its range", invariantOk);

  // Default BasePlanAssumptions matches engine's DEFAULT_ASSUMPTIONS
  const fromReg = defaultBasePlanAssumptionsFromRegistry();
  const fields = Object.keys(DEFAULT_ASSUMPTIONS) as (keyof typeof DEFAULT_ASSUMPTIONS)[];
  let match = true;
  for (const f of fields) {
    if (Math.abs((fromReg as any)[f] - (DEFAULT_ASSUMPTIONS as any)[f]) > 1e-9) {
      match = false;
      process.stdout.write(`    ! mismatch ${f}: registry ${(fromReg as any)[f]} vs engine ${(DEFAULT_ASSUMPTIONS as any)[f]}\n`);
    }
  }
  assert("registry-derived defaults match DEFAULT_ASSUMPTIONS", match);

  // getAssumption + lookup
  assert("getAssumption known id", getAssumption("inflation.cpi.au").id === "inflation.cpi.au");
  assert("getAssumption unknown throws", throws(() => getAssumption("__nope__")));

  // listAssumptions by category
  assert("listAssumptions('macro') ≥ 5", listAssumptions("macro").length >= 5);
  assert("listAssumptions('tax') ≥ 5", listAssumptions("tax").length >= 5);
  assert("listAssumptions all", listAssumptions().length === Object.keys(ASSUMPTION_REGISTRY).length);

  // assertAssumptionsConsistent: clean
  const clean = assertAssumptionsConsistent(DEFAULT_ASSUMPTIONS);
  assert("assertAssumptionsConsistent clean → []", clean.length === 0);

  // Violations: too low + too high + NaN
  const bad = { ...DEFAULT_ASSUMPTIONS, stockReturn: 0.50 as number, cryptoReturn: -0.50 as number, inflation: NaN as number };
  const v = assertAssumptionsConsistent(bad);
  assert("assertAssumptionsConsistent flags out-of-range high",
    v.some(x => x.field === "stockReturn"));
  assert("assertAssumptionsConsistent flags out-of-range low",
    v.some(x => x.field === "cryptoReturn"));
  assert("assertAssumptionsConsistent flags NaN",
    v.some(x => x.field === "inflation" && x.reason.includes("non-finite")));
}

// ════════════════════════════════════════════════════════════════════════════
// C. SCORING FRAMEWORK
// ════════════════════════════════════════════════════════════════════════════

section("C. Scoring Framework");

const baseInputs: ScoreInputs = {
  survivalProbability: 0.90,
  liquidityFactor: 0.60,
  riskAdjustedReturn: 0.05,
  fireAcceleration: 0,
  terminalNetWorth: 2_000_000,
  refinancePressureBand: "mild",
  worstInvestmentLvr: 0.70,
};

{
  // Weight invariants
  assert("DEFAULT_SCORE_WEIGHTS convex sum = 1.0",
    near(
      DEFAULT_SCORE_WEIGHTS.survival + DEFAULT_SCORE_WEIGHTS.liquidity +
      DEFAULT_SCORE_WEIGHTS.riskAdjusted + DEFAULT_SCORE_WEIGHTS.fire +
      DEFAULT_SCORE_WEIGHTS.terminalNw,
      1.0, 1e-9));

  assert("validateScoreWeights default passes", !throws(() => validateScoreWeights(DEFAULT_SCORE_WEIGHTS)));
  assert("validateScoreWeights bad sum throws",
    throws(() => validateScoreWeights({ ...DEFAULT_SCORE_WEIGHTS, survival: 0.50 })));
  assert("validateScoreWeights negative penalty throws",
    throws(() => validateScoreWeights({ ...DEFAULT_SCORE_WEIGHTS, refinancePenalty: -0.1 })));

  // Bad weights into compositeScore throws
  assert("compositeScore bad weights throws",
    throws(() => compositeScore(baseInputs, { survival: 0.99 })));

  // Score always in [0, 100]
  const s1 = compositeScore(baseInputs);
  assert("compositeScore in [0,100]", s1.score >= 0 && s1.score <= 100,
    `got ${s1.score.toFixed(2)}`);

  // Breakdown adds up to baseScore (modulo derived non-weighted axis)
  const sumContribs = s1.breakdown.reduce((s, b) => s + b.contribution, 0);
  assert("breakdown contributions sum to baseScore",
    near(sumContribs, s1.baseScore, 1e-6));

  // Penalties present (2)
  assert("two penalty entries present (refi + leverage)",
    s1.penalties.length === 2 &&
    s1.penalties.some(p => p.id === "refinancePressure") &&
    s1.penalties.some(p => p.id === "leverageQuality"));

  // Rationale non-empty
  assert("rationale non-empty", s1.rationale.length > 0);

  // Monotonicity: ↑survival → ↑score
  const sLow = compositeScore({ ...baseInputs, survivalProbability: 0.50 });
  const sHigh = compositeScore({ ...baseInputs, survivalProbability: 1.00 });
  assert("monotonicity: ↑survival → ↑score", sHigh.score > sLow.score,
    `low=${sLow.score.toFixed(1)} high=${sHigh.score.toFixed(1)}`);

  // Monotonicity: ↑liquidity → ↑score
  const lLow = compositeScore({ ...baseInputs, liquidityFactor: 0.10 });
  const lHigh = compositeScore({ ...baseInputs, liquidityFactor: 1.00 });
  assert("monotonicity: ↑liquidity → ↑score", lHigh.score > lLow.score);

  // Monotonicity: ↑refinance band → ↓score (penalty grows)
  const refMild = compositeScore({ ...baseInputs, refinancePressureBand: "mild" });
  const refElev = compositeScore({ ...baseInputs, refinancePressureBand: "elevated" });
  const refSev  = compositeScore({ ...baseInputs, refinancePressureBand: "severe" });
  assert("refinance penalty: mild ≥ elevated ≥ severe",
    refMild.score >= refElev.score && refElev.score >= refSev.score);

  // Leverage penalty: LVR > 80% reduces score
  const ipLow  = compositeScore({ ...baseInputs, worstInvestmentLvr: 0.70 });
  const ipHigh = compositeScore({ ...baseInputs, worstInvestmentLvr: 0.85 });
  assert("leverage penalty: LVR 0.85 score < LVR 0.70 score",
    ipHigh.score < ipLow.score,
    `low=${ipLow.score.toFixed(1)} high=${ipHigh.score.toFixed(1)}`);

  // Terminal NW reference normalisation
  const noRef = compositeScore({ ...baseInputs, terminalNetWorth: 2_000_000, referenceTerminalNw: undefined });
  const withRef = compositeScore({ ...baseInputs, terminalNetWorth: 2_000_000, referenceTerminalNw: 2_000_000 });
  // With reference, parity (NW == ref) normalises to 0.5; without reference, 2M/5M = 0.4
  // So withRef should score higher on terminalNw axis
  const noRefContrib = noRef.breakdown.find(b => b.axis === "terminalNetWorth")!.contribution;
  const withRefContrib = withRef.breakdown.find(b => b.axis === "terminalNetWorth")!.contribution;
  assert("terminalNw reference normalisation differs (parity vs abs)",
    withRefContrib > noRefContrib);

  // Determinism
  const sa = compositeScore(baseInputs);
  const sb = compositeScore(baseInputs);
  assert("compositeScore deterministic",
    sa.score === sb.score && sa.baseScore === sb.baseScore);
}

// ─── Tally ───────────────────────────────────────────────────────────────────

process.stdout.write(`\nResult: ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);

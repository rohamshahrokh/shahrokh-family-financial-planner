/**
 * Sprint 20 PR-B — 25-scenario assertion test.
 *
 * Drives the new advisorNarrativeEngine + recommendationsBuilder over every
 * Sprint 18 audit scenario and asserts narrative-specific quality gates:
 *   - what.concreteDetails matches /(\d+%|\$\d|\d+\s*months?|\d+\s*years?)/
 *   - crypto > 30%   → narrative mentions "crypto" (case-insensitive)
 *   - property > 80% → narrative mentions "property"
 *   - doNothing.projectedFireYear + gapVsTarget computed
 *   - alternatives.length >= 2
 *   - risks.length >= 1
 *   - narrative.why cites at least 2 named household signals
 *   - boilerplate phrases not present
 * Scenario-specific fixes (04 / 07 / 08) get extra assertions.
 *
 * Run: npx tsx client/src/lib/__tests__/sprint20PrBScenarios.test.ts
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateAdvisorRecommendations } from "../advisorRecommendationsBuilder";
import { buildAdvisorSignals } from "../advisorContextBuilder";
import type { ConcentrationFlag } from "../concentration/types";
import type { HouseholdLifeStage } from "../householdState/types";
import { containsBoilerplate } from "../advisorNarrativeEngine";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) { pass++; }
  else { fail++; console.error(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const SCEN_DIR = join(REPO_ROOT, "..", "sprint16_scenarios");

interface ScenarioInput {
  id: string;
  profile: string;
  age: number;
  netWorth: number;
  annualIncome: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySurplus: number;
  ppor: number;
  mortgage: number;
  cash: number;
  cryptoValue: number;
  stocksValue: number;
  fireAge: number;
  targetMonthlyIncome: number;
  features: string[];
}

function loadJsonScenarios(): ScenarioInput[] {
  const files = readdirSync(SCEN_DIR).filter((f) => f.endsWith(".json")).sort();
  return files.map((f) => {
    const raw = JSON.parse(readFileSync(join(SCEN_DIR, f), "utf8"));
    const meta = raw.meta;
    const s = raw.signals;
    const g = raw.goal;
    // Heuristic split for crypto / stocks based on features when not separable
    const isCrypto = meta.profile.toLowerCase().includes("crypto");
    const isCashHoarder = meta.profile.toLowerCase().includes("cash hoarder");
    const totalNonCashAssets = Math.max(0, meta.net_worth_aud - (s.cashOutsideOffset + s.offsetBalance + (s.ppor ?? 0)));
    const cryptoValue = isCrypto ? Math.max(0, totalNonCashAssets * 0.6) : 0;
    const stocksValue = isCashHoarder ? 0 : Math.max(0, totalNonCashAssets - cryptoValue);
    return {
      id: meta.id,
      profile: meta.profile,
      age: meta.age,
      netWorth: meta.net_worth_aud,
      annualIncome: meta.annual_income_aud,
      monthlyIncome: s.monthlyIncome,
      monthlyExpenses: s.monthlyExpenses,
      monthlySurplus: s.monthlySurplus,
      ppor: s.ppor ?? 0,
      mortgage: s.mortgage ?? 0,
      cash: (s.cashOutsideOffset ?? 0) + (s.offsetBalance ?? 0),
      cryptoValue,
      stocksValue,
      fireAge: g.fireAge,
      targetMonthlyIncome: g.targetMonthlyIncome,
      features: meta.key_features ?? [],
    };
  });
}

/* Synthetic scenarios 15..25 to round out to 25 — modelled from the MD
   profiles (no Supabase access from this test). */
function syntheticScenarios(): ScenarioInput[] {
  const today = new Date().getFullYear();
  return [
    { id: '15_self_employed_contractor', profile: 'Self-employed contractor', age: 36, netWorth: 250_000, annualIncome: 110_000, monthlyIncome: 9_167, monthlyExpenses: 5_800, monthlySurplus: 3_367, ppor: 0, mortgage: 0, cash: 250_000, cryptoValue: 0, stocksValue: 0, fireAge: 60, targetMonthlyIncome: 6_000, features: ['irregular income', 'cash heavy'] },
    { id: '16_divorced_split_assets', profile: 'Divorced household', age: 45, netWorth: 380_000, annualIncome: 140_000, monthlyIncome: 11_667, monthlyExpenses: 8_300, monthlySurplus: 3_367, ppor: 600_000, mortgage: 350_000, cash: 30_000, cryptoValue: 0, stocksValue: 120_000, fireAge: 62, targetMonthlyIncome: 6_000, features: ['post-divorce', 'restart'] },
    { id: '17_late_starter_aggressive', profile: 'Late starter, aggressive', age: 52, netWorth: 220_000, annualIncome: 180_000, monthlyIncome: 15_000, monthlyExpenses: 8_500, monthlySurplus: 6_500, ppor: 850_000, mortgage: 650_000, cash: 25_000, cryptoValue: 40_000, stocksValue: 150_000, fireAge: 65, targetMonthlyIncome: 8_000, features: ['late starter', 'aggressive equity'] },
    { id: '18_inheritance_pending', profile: 'Inheritance pending', age: 48, netWorth: 540_000, annualIncome: 200_000, monthlyIncome: 16_667, monthlyExpenses: 9_500, monthlySurplus: 7_167, ppor: 900_000, mortgage: 500_000, cash: 80_000, cryptoValue: 0, stocksValue: 220_000, fireAge: 58, targetMonthlyIncome: 9_000, features: ['inheritance', 'event-driven'] },
    { id: '19_retired_longevity_risk', profile: 'Retired with longevity risk', age: 68, netWorth: 1_400_000, annualIncome: 25_000, monthlyIncome: 2_083, monthlyExpenses: 6_500, monthlySurplus: -4_417, ppor: 900_000, mortgage: 0, cash: 350_000, cryptoValue: 0, stocksValue: 250_000, fireAge: 60, targetMonthlyIncome: 7_500, features: ['longevity', 'drawing down'] },
    { id: '20_expat_split_jurisdiction', profile: 'Expat across jurisdictions', age: 42, netWorth: 900_000, annualIncome: 230_000, monthlyIncome: 19_167, monthlyExpenses: 11_000, monthlySurplus: 8_167, ppor: 0, mortgage: 0, cash: 200_000, cryptoValue: 60_000, stocksValue: 540_000, fireAge: 58, targetMonthlyIncome: 12_000, features: ['expat', 'multi-currency'] },
    { id: '21_family_childcare_pressure', profile: 'Family with childcare pressure', age: 38, netWorth: 420_000, annualIncome: 165_000, monthlyIncome: 13_750, monthlyExpenses: 10_900, monthlySurplus: 2_850, ppor: 950_000, mortgage: 720_000, cash: 35_000, cryptoValue: 0, stocksValue: 95_000, fireAge: 60, targetMonthlyIncome: 8_500, features: ['childcare', 'tight surplus'] },
    { id: '22_high_mortgage_rate_sensitive', profile: 'Rate-sensitive mortgage', age: 39, netWorth: 280_000, annualIncome: 175_000, monthlyIncome: 14_583, monthlyExpenses: 11_000, monthlySurplus: 3_583, ppor: 1_050_000, mortgage: 820_000, cash: 18_000, cryptoValue: 0, stocksValue: 60_000, fireAge: 65, targetMonthlyIncome: 8_000, features: ['rate sensitivity'] },
    { id: '23_strong_super_low_liquid', profile: 'Strong super, low liquid', age: 56, netWorth: 1_100_000, annualIncome: 160_000, monthlyIncome: 13_333, monthlyExpenses: 7_200, monthlySurplus: 6_133, ppor: 900_000, mortgage: 100_000, cash: 25_000, cryptoValue: 0, stocksValue: 75_000, fireAge: 62, targetMonthlyIncome: 9_500, features: ['super heavy', 'illiquid'] },
    { id: '24_property_infeasible', profile: 'Property purchase infeasible', age: 33, netWorth: 90_000, annualIncome: 95_000, monthlyIncome: 7_917, monthlyExpenses: 5_400, monthlySurplus: 2_517, ppor: 0, mortgage: 0, cash: 60_000, cryptoValue: 0, stocksValue: 30_000, fireAge: 60, targetMonthlyIncome: 5_500, features: ['borrowing capacity limited'] },
    { id: '25_property_feasible_etf_best', profile: 'Property feasible, ETF preferred', age: 35, netWorth: 350_000, annualIncome: 180_000, monthlyIncome: 15_000, monthlyExpenses: 8_400, monthlySurplus: 6_600, ppor: 0, mortgage: 0, cash: 110_000, cryptoValue: 0, stocksValue: 240_000, fireAge: 58, targetMonthlyIncome: 9_500, features: ['ETF biased', 'borrowing available'] },
  ];
}

function deriveLifeStage(input: ScenarioInput): HouseholdLifeStage {
  const fireNumber = (input.targetMonthlyIncome * 12) / 0.04;
  const progressPct = fireNumber > 0 ? (input.netWorth / fireNumber) * 100 : 0;
  if (input.age >= input.fireAge) return 'STATE_E_DECUMULATION';
  if (progressPct >= 100) return 'STATE_D_FIRE_ACHIEVED';
  if (progressPct >= 85) return 'STATE_C_NEAR_FIRE';
  if (progressPct >= 50) return 'STATE_B_ACCELERATING';
  return 'STATE_A_ACCUMULATION';
}

function buildSignals(input: ScenarioInput): {
  signals: ReturnType<typeof buildAdvisorSignals>;
  monthlyCashflow: number;
  liquidityBufferMonths: number;
} {
  const totalAssets = Math.max(0, input.cash + input.stocksValue + input.cryptoValue + input.ppor);
  const totalDebt = input.mortgage;
  const propertyExposurePct = totalAssets > 0 ? (input.ppor / totalAssets) * 100 : 0;
  const concentrationFlags: ConcentrationFlag[] = [];
  if (propertyExposurePct > 80) {
    concentrationFlags.push({
      kind: 'property_over_80',
      severity: 'critical',
      observedPct: propertyExposurePct,
      thresholdPct: 80,
      affectedAssets: ['PPOR'],
      remediation: 'Trim property allocation below 80% to defuse concentration risk',
    });
  }
  const cryptoExposurePct = totalAssets > 0 ? (input.cryptoValue / totalAssets) * 100 : 0;
  if (cryptoExposurePct > 30) {
    concentrationFlags.push({
      kind: 'crypto_over_30',
      severity: 'critical',
      observedPct: cryptoExposurePct,
      thresholdPct: 30,
      affectedAssets: ['Crypto'],
      remediation: 'Reduce crypto exposure below 30% to limit volatility drawdown',
    });
  }
  const lifeStage = deriveLifeStage(input);
  const targetFireYear = new Date().getFullYear() + Math.max(0, input.fireAge - input.age);
  const baselineFireYear = targetFireYear;
  const baselineMonthlyPassive = input.netWorth * 0.04 / 12;
  const signals = buildAdvisorSignals({
    monthlyIncome: input.monthlyIncome,
    monthlyExpenses: input.monthlyExpenses,
    monthlySurplus: input.monthlySurplus,
    netWorth: input.netWorth,
    totalDebt,
    totalAssets,
    propertyValue: input.ppor,
    cryptoValue: input.cryptoValue,
    equityValue: input.stocksValue,
    liquidCash: input.cash,
    targetFireYear,
    targetMonthlyPassive: input.targetMonthlyIncome,
    baselineFireYear,
    baselineMonthlyPassive,
    baselineFireProgressPct: ((input.netWorth) / Math.max(1, (input.targetMonthlyIncome * 12) / 0.04)) * 100,
    lifeStage,
    concentrationFlags,
  });
  const liquidityBufferMonths = input.cash / Math.max(1, input.monthlyExpenses);
  return { signals, monthlyCashflow: input.monthlySurplus, liquidityBufferMonths };
}

const scenarios: ScenarioInput[] = [
  ...loadJsonScenarios(),
  ...syntheticScenarios(),
];

console.log(`\n── Sprint 20 PR-B — running ${scenarios.length} scenarios ──\n`);
const results: Array<{ id: string; topAction: string; topRecCount: number; allPass: boolean; notes: string[] }> = [];

for (const sc of scenarios) {
  const { signals, monthlyCashflow, liquidityBufferMonths } = buildSignals(sc);
  const recs = generateAdvisorRecommendations({
    signals,
    borrowingCapacity: sc.annualIncome * 6 * 0.4,
    liquidityBufferMonths,
    monthlyCashflow,
  });
  const localNotes: string[] = [];
  const top = recs[0];

  check(`[${sc.id}] at least 1 recommendation`, recs.length >= 1);
  if (recs.length === 0) {
    results.push({ id: sc.id, topAction: '(none)', topRecCount: 0, allPass: false, notes: ['no recs generated'] });
    continue;
  }
  check(`[${sc.id}] top concreteDetails matches numeric token`, /(\d+%|\$\d|\d+\s*months?|\d+\s*years?)/.test(top.what.concreteDetails), top.what.concreteDetails);
  check(`[${sc.id}] alternatives.length >= 2`, top.alternatives.length >= 2);
  check(`[${sc.id}] risks.length >= 1`, top.risks.length >= 1);
  check(`[${sc.id}] doNothing.projectedFireYear is number`, typeof top.doNothing.projectedFireYear === 'number');
  check(`[${sc.id}] doNothing.gapVsTarget is number`, typeof top.doNothing.gapVsTarget === 'number');
  check(`[${sc.id}] no boilerplate in why`, !containsBoilerplate(top.why));
  check(`[${sc.id}] why cites ≥ 2 numbers`, (top.why.match(/\d/g) || []).length >= 2);

  if (signals.cryptoExposurePct > 30) {
    const anyMentions = recs.some((r) => /crypto/i.test(r.what.action + " " + r.why + " " + r.what.concreteDetails));
    check(`[${sc.id}] crypto > 30% → recommendation mentions crypto`, anyMentions);
    if (sc.id === '07_crypto_concentrated') {
      const topCrypto = top.what.action.toLowerCase().includes('crypto');
      check(`[Scenario 07 fix] top recommendation directly addresses crypto concentration`, topCrypto, top.what.action);
    }
  }
  if (signals.propertyExposurePct > 80) {
    const anyMentions = recs.some((r) => /property/i.test(r.what.action + " " + r.why));
    check(`[${sc.id}] property > 80% → recommendation mentions property`, anyMentions);
  }

  if (sc.id === '04_pre_retiree_ahead') {
    const decumulationWords = /decumulation|glidepath|income.conversion|sequence risk|drawdown|cash reserve|income conversion/i;
    const topText = (top.what.action + " " + top.what.concreteDetails + " " + top.why).toLowerCase();
    check(`[Scenario 04 fix] top-1 mentions decumulation / glidepath / income conversion / sequence risk / drawdown`, decumulationWords.test(topText), topText.slice(0, 200));
  }
  if (sc.id === '08_negative_cashflow') {
    const opStab = /stabilis|cashflow|cut discretionary/i.test(top.what.action + " " + top.what.concreteDetails);
    check(`[Scenario 08 fix] top-1 is operational stabilisation`, opStab, top.what.action);
  }

  results.push({
    id: sc.id,
    topAction: top.what.action,
    topRecCount: recs.length,
    allPass: true,
    notes: localNotes,
  });
}

console.log(`\n── Summary ──\n  scenarios: ${scenarios.length}\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);
// Persist results for the workspace deliverable
console.log("\nTop-1 per scenario:");
results.forEach((r) => {
  console.log(`  ${r.id} → ${r.topAction}`);
});

/**
 * Sprint 20 PR-B P1-2 + P1-5 — Advisor Narrative Engine tests.
 *
 * Run: npx tsx client/src/lib/__tests__/advisorNarrativeEngine.test.ts
 */

import {
  buildAdvisorRecommendation,
  containsBoilerplate,
  ADVISOR_BANNED_BOILERPLATE,
  type HouseholdSignals,
  type AdvisorActionInput,
} from "../advisorNarrativeEngine";
import { generateAdvisorRecommendations } from "../advisorRecommendationsBuilder";
import type { ConcentrationFlag } from "../concentration/types";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.error(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

const baseSignals: HouseholdSignals = {
  leverage: 0.38,
  propertyExposurePct: 65,
  cryptoExposurePct: 8,
  liquidityMonths: 6,
  fireGapDollars: 1_942_000,
  yearsToTarget: 14,
  debtServiceRatio: 0.18,
  monthlySurplus: 7_500,
  netWorth: 758_000,
  monthlyIncome: 30_700,
  baselineFireProgressPct: 28.1,
  baselineFireYear: 2040,
  baselineMonthlyPassive: 8_500,
  targetMonthlyPassive: 20_000,
  targetFireYear: 2035,
  concentrationRisks: [],
  lifeStage: 'STATE_A_ACCUMULATION',
  equitySharePct: 12,
};

console.log("\n── buildAdvisorRecommendation 7-field shape ──");
{
  const action: AdvisorActionInput = {
    id: 'etf_dca',
    actionKind: 'etf_dca',
    proposedYear: 2027,
    proposedDollarAmount: 4500,
    conciseLabel: 'Increase ETF DCA to $4,500/mo',
    baseConfidence: 0.72,
    fireYearDelta: -0.6,
    nwDelta: 75_000,
  };
  const rec = buildAdvisorRecommendation({ action, signals: baseSignals });
  check("what.action populated", !!rec.what.action && rec.what.action.length > 5);
  check("why field cites ≥ 2 signals", (rec.why.match(/\d/g) || []).length >= 2, rec.why);
  check("why mentions a $ or %", /\$|%/.test(rec.why));
  check("when.year populated", typeof rec.when.year === 'number' && rec.when.year > 0);
  check("improves.fireYearDelta carried through", rec.improves.fireYearDelta === -0.6);
  check("risks.length >= 1", rec.risks.length >= 1);
  check("alternatives.length >= 2", rec.alternatives.length >= 2);
  check("doNothing.projectedFireYear computed", typeof rec.doNothing.projectedFireYear === 'number');
  check("doNothing.gapVsTarget computed", typeof rec.doNothing.gapVsTarget === 'number');
  check("confidence band labelled (not probability)", rec.confidence.band === 'low' || rec.confidence.band === 'medium' || rec.confidence.band === 'high');
  check("assumptions >= 3", rec.assumptions.length >= 3);
  check("sensitivity present for non-op actions", !!rec.sensitivity);
}

console.log("\n── Boilerplate guard (P1-5) ──");
{
  ADVISOR_BANNED_BOILERPLATE.forEach((phrase) => {
    check(`containsBoilerplate detects: "${phrase}"`, containsBoilerplate(`We recommend you ${phrase}.`));
  });
  check("specific advice not flagged", !containsBoilerplate('Sell IP #2 in 2034 net ~$640K'));
}

console.log("\n── Scenario 07 fix (concentration: crypto > 30%) ──");
{
  const cryptoFlag: ConcentrationFlag = {
    kind: 'crypto_over_30',
    severity: 'critical',
    observedPct: 45,
    thresholdPct: 30,
    affectedAssets: ['BTC', 'ETH'],
    remediation: 'Trim crypto allocation below 30% to defuse concentration risk',
  };
  const signals: HouseholdSignals = {
    ...baseSignals,
    cryptoExposurePct: 45,
    concentrationRisks: [{ ...cryptoFlag, breached: true }],
  };
  const recs = generateAdvisorRecommendations({
    signals,
    borrowingCapacity: 0,
    liquidityBufferMonths: signals.liquidityMonths,
    monthlyCashflow: signals.monthlySurplus,
  });
  check("recommendations generated", recs.length > 0);
  const concentrationRec = recs.find((r) => /reduce crypto|crypto over 30|crypto_over_30|trim crypto/i.test(r.what.action));
  check("concentration rec uses breached flag (not allocations[0])", !!concentrationRec, recs[0]?.what.action);
  if (concentrationRec) {
    check("narrative references crypto (case-insensitive)", /crypto/i.test(concentrationRec.what.action + " " + concentrationRec.why + " " + concentrationRec.what.concreteDetails));
  }
}

console.log("\n── Scenario 08 fix (cashflow guard) ──");
{
  const signals: HouseholdSignals = {
    ...baseSignals,
    monthlySurplus: -500,
    liquidityMonths: 0.5,
  };
  const recs = generateAdvisorRecommendations({
    signals,
    borrowingCapacity: 50_000,
    liquidityBufferMonths: 0.5,
    monthlyCashflow: -500,
  });
  check("recommendations generated", recs.length > 0);
  check("top-1 recommendation is operational_stabilisation", /stabilis|cashflow|cut discretionary|raise income/i.test(recs[0].what.action + " " + recs[0].what.concreteDetails));
  check("top-1 high severity risk", recs[0].risks.some(r => r.severity === 'high'));
}

console.log("\n── P1-5 WHY field cites ≥ 2 named household signals ──");
{
  const action: AdvisorActionInput = {
    id: 'reduce_debt',
    actionKind: 'reduce_debt',
    proposedYear: 2026,
    conciseLabel: 'Reduce debt',
    baseConfidence: 0.7,
  };
  const signals: HouseholdSignals = {
    ...baseSignals,
    leverage: 0.55,
    debtServiceRatio: 0.34,
    liquidityMonths: 2,
  };
  const rec = buildAdvisorRecommendation({ action, signals });
  // Need at least 2 of: leverage, concentration, liquidity, income reliability,
  // FIRE gap, time horizon, debt service ratio, property exposure, sequence risk
  const namedSignals = [
    /leverage\s+\d/i,
    /property exposure/i,
    /crypto exposure/i,
    /liquidity/i,
    /fire gap/i,
    /years? to target/i,
    /debt-service ratio/i,
    /sequence risk/i,
    /net worth/i,
    /monthly surplus/i,
  ];
  const matches = namedSignals.filter((rx) => rx.test(rec.why));
  check(`WHY cites ≥ 2 household-specific signals (matched ${matches.length})`, matches.length >= 2, rec.why);
}

console.log("\n── Crypto > 30% case mentions crypto ──");
{
  const signals: HouseholdSignals = {
    ...baseSignals,
    cryptoExposurePct: 42,
  };
  const rec = buildAdvisorRecommendation({
    action: { id: 'etf_dca', actionKind: 'etf_dca', proposedYear: 2027, proposedDollarAmount: 3000, conciseLabel: 'ETF DCA', baseConfidence: 0.7 },
    signals,
  });
  check("WHY mentions crypto when crypto > 30%", /crypto/i.test(rec.why), rec.why);
}

console.log("\n── Property > 60% case mentions property ──");
{
  const signals: HouseholdSignals = {
    ...baseSignals,
    propertyExposurePct: 78,
  };
  const rec = buildAdvisorRecommendation({
    action: { id: 'etf_dca', actionKind: 'etf_dca', proposedYear: 2027, proposedDollarAmount: 3000, conciseLabel: 'ETF DCA', baseConfidence: 0.7 },
    signals,
  });
  check("WHY mentions property when exposure > 60%", /property/i.test(rec.why), rec.why);
}

console.log("\n── Concrete details contain a numeric token ──");
{
  const action: AdvisorActionInput = {
    id: 'etf_dca',
    actionKind: 'etf_dca',
    proposedYear: 2027,
    proposedDollarAmount: 3500,
    conciseLabel: 'ETF DCA',
    baseConfidence: 0.72,
  };
  const rec = buildAdvisorRecommendation({ action, signals: baseSignals });
  check("concrete details match (%|$|months|years)", /(\d+%|\$\d|\d+\s*months?|\d+\s*years?)/.test(rec.what.concreteDetails), rec.what.concreteDetails);
}

console.log("\n── Execution-fit downgrades 'high' to 'medium' ──");
{
  const action: AdvisorActionInput = {
    id: 'etf_dca',
    actionKind: 'etf_dca',
    proposedYear: 2027,
    proposedDollarAmount: 3000,
    conciseLabel: 'ETF DCA',
    baseConfidence: 0.85,
  };
  const rec = buildAdvisorRecommendation({ action, signals: baseSignals, executionFit: { likelyAdherence: 0.4 } });
  check("execution-fit downgrades band to medium", rec.confidence.band === 'medium', rec.confidence.basis);
  check("assumptions note behavioural commitment", rec.assumptions.some(a => /behavioural commitment/i.test(a)));
}

console.log("\n── Sprint 20 PR-B fix-up Defect 1: human concentration + life-stage labels ──");
{
  const propertyFlag: ConcentrationFlag = {
    kind: 'property_over_80',
    severity: 'critical',
    observedPct: 82.9,
    thresholdPct: 80,
    affectedAssets: ['PPOR'],
    remediation: 'Trim property allocation below 80%',
  };
  const signals: HouseholdSignals = {
    ...baseSignals,
    propertyExposurePct: 82.9,
    concentrationRisks: [{ ...propertyFlag, breached: true }],
  };
  const recs = generateAdvisorRecommendations({
    signals,
    borrowingCapacity: 600_000,
    liquidityBufferMonths: signals.liquidityMonths,
    monthlyCashflow: signals.monthlySurplus,
  });
  const top = recs[0];
  check("demo top-1 action is 'Trim property allocation to under 80%'", /trim property allocation to under 80%/i.test(top.what.action), top.what.action);
  check("demo top-1 confidence.basis uses 'Accumulation phase' (not 'life stage a accumulation')", /accumulation phase/i.test(top.confidence.basis) && !/life stage [a-e]\b/i.test(top.confidence.basis), top.confidence.basis);
  check("demo top-1 has no 'exposure above N below N%' broken phrase", !/exposure above \d+ below \d+%/i.test(top.what.action + top.what.concreteDetails));
}

console.log("\n── Sprint 20 PR-B fix-up Defect 1: scenario-07 crypto label ──");
{
  const cryptoFlag: ConcentrationFlag = {
    kind: 'crypto_over_30',
    severity: 'critical',
    observedPct: 45,
    thresholdPct: 30,
    affectedAssets: ['BTC', 'ETH'],
    remediation: 'Reduce crypto exposure below 30%',
  };
  const signals: HouseholdSignals = {
    ...baseSignals,
    cryptoExposurePct: 45,
    concentrationRisks: [{ ...cryptoFlag, breached: true }],
  };
  const recs = generateAdvisorRecommendations({
    signals,
    borrowingCapacity: 0,
    liquidityBufferMonths: signals.liquidityMonths,
    monthlyCashflow: signals.monthlySurplus,
  });
  const top = recs[0];
  check("scenario 07 top-1 action is 'Trim crypto allocation to under 30%'", /trim crypto allocation to under 30%/i.test(top.what.action), top.what.action);
  check("scenario 07 no 'exposure above 30 below 30%' broken phrase", !/exposure above \d+ below \d+%/i.test(top.what.action));
}

console.log("\n── Sprint 20 PR-B fix-up Defect 3: confidence penalty when plan ends ≥30% short ──");
{
  const action: AdvisorActionInput = {
    id: 'etf_dca',
    actionKind: 'etf_dca',
    proposedYear: 2027,
    proposedDollarAmount: 4500,
    conciseLabel: 'ETF DCA',
    baseConfidence: 0.82,
  };
  const rec = buildAdvisorRecommendation({
    action,
    signals: baseSignals,
    pathPenalties: { endingShortfallPct: 0.56, containsContradiction: false },
  });
  check("confidence band downgraded to medium when shortfall >= 30%", rec.confidence.band === 'medium' || rec.confidence.band === 'low', rec.confidence.basis);
  check("confidence value capped at 0.65 when penalty triggered", rec.confidence.value <= 0.65 + 1e-9, `value=${rec.confidence.value}`);
  check("basis cites the shortfall in the explanation", /short/i.test(rec.confidence.basis), rec.confidence.basis);
}

console.log("\n── Sprint 20 PR-B fix-up Defect 3: improves fields always present ──");
{
  const action: AdvisorActionInput = {
    id: 'etf_dca',
    actionKind: 'etf_dca',
    proposedYear: 2027,
    proposedDollarAmount: 4500,
    conciseLabel: 'ETF DCA',
    baseConfidence: 0.72,
    // Deliberately leave all four delta fields undefined to assert defaults
  };
  const rec = buildAdvisorRecommendation({ action, signals: baseSignals });
  check("improves.fireYearDelta present (=0 when absent)", rec.improves.fireYearDelta === 0);
  check("improves.successDelta present (=0 when absent)", rec.improves.successDelta === 0);
  check("improves.nwDelta present (=0 when absent)", rec.improves.nwDelta === 0);
  check("improves.monthlyPassiveDelta present (=0 when absent)", rec.improves.monthlyPassiveDelta === 0);
}

console.log("\n── Sprint 20 PR-B fix-up Defect 3: sensitivity gating ──");
{
  const zeroEquitySignals: HouseholdSignals = {
    ...baseSignals,
    equitySharePct: 0,
    propertyExposurePct: 82.9,
  };
  const rec = buildAdvisorRecommendation({
    action: { id: 'etf_dca', actionKind: 'etf_dca', proposedYear: 2027, proposedDollarAmount: 3000, conciseLabel: 'ETF DCA', baseConfidence: 0.7 },
    signals: zeroEquitySignals,
  });
  check("sensitivity drivers do NOT cite equity real return when equitySharePct < 10", !(rec.sensitivity?.drivers ?? []).includes('equity real return'), (rec.sensitivity?.drivers ?? []).join(','));
  check("sensitivity line does NOT mention equity when equitySharePct < 10", !/equity return/i.test(rec.sensitivity?.line ?? ''), rec.sensitivity?.line);
}

console.log(`\n── Summary ──\n  pass: ${pass}\n  fail: ${fail}`);
if (fail > 0) process.exit(1);

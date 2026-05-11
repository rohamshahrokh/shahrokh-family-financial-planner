/**
 * Decision Engine audit harness.
 *
 * Runs generateQuickDecisionCandidates against the real Supabase snapshot for
 * every question kind. Outputs a structured JSON file the audit reviewer can
 * inspect, then also generates a Quick Decision PDF from the winning result.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import {
  generateQuickDecisionCandidates,
  type QuickDecisionInput,
  type QuickDecisionOutput,
  type QuickDecisionQuestionKind,
  type RiskControlMode,
} from "./client/src/lib/scenarioV2/decisionEngine/candidateGenerator";
import type { DashboardInputs } from "./client/src/lib/dashboardDataContract";

const RAW = "/home/user/workspace/audit/raw_data";
const OUT_DIR = "/home/user/workspace/audit";
const OUT_JSON = path.join(OUT_DIR, "decision-engine-checks.json");

const j = (p: string) => JSON.parse(fs.readFileSync(path.join(RAW, p), "utf8"));

const snapshot   = j("sf_snapshot_full.json")[0];
const properties = j("sf_properties.json").map((p: any) => ({
  ...p,
  settlement_date: p.settlement_date ?? p.purchase_date ?? null,
}));
const stocks         = j("sf_stocks.json");
const cryptos        = j("sf_crypto.json");
const incomeRecords  = j("sf_income.json");
const expenses       = j("sf_expenses.json");
const tax            = j("sf_tax_profile.json")[0];

const dashboardInputs: DashboardInputs = {
  snapshot,
  properties,
  stocks,
  cryptos,
  holdingsRaw: [],
  incomeRecords,
  expenses,
  todayIso: "2026-05-11",
};

const taxContext = {
  annualGrossIncome:
    Number(tax?.roham_salary ?? snapshot.roham_super_salary ?? 0) +
    Number(tax?.fara_salary  ?? snapshot.fara_super_salary  ?? 0),
  hasHelpDebt: Boolean(tax?.roham_has_help_debt || tax?.fara_has_help_debt),
  hasPrivateHospitalCover: Boolean(tax?.roham_has_private_health || tax?.fara_has_private_health),
};

const household = {
  dependants: 2,         // 2 kids in expense records (childcare)
  incomeVolatility: 0.15,
};

const horizonYears = 15;
const simulationCount = 200; // faster — still gives clean P5..P95

const QUESTIONS: { kind: QuickDecisionQuestionKind; capital?: number }[] = [
  { kind: "deploy_capital",      capital: 100_000 },
  { kind: "buy_property",        capital:  60_000 },
  { kind: "super_vs_invest",     capital:  25_000 },
  { kind: "debt_vs_invest",      capital:  50_000 },
  { kind: "fire_acceleration",                       },
  { kind: "downside_protection",                     },
];
const RISK_MODES: RiskControlMode[] = ["conservative", "balanced", "aggressive"];

function extractMetrics(result: any) {
  if (!result) return null;
  const fan = result.netWorthFan ?? [];
  const last = fan.length > 0 ? fan[fan.length - 1] : null;
  const rm = result.riskMetrics ?? null;
  return {
    initialNetWorth: result.initialNetWorth ?? null,
    finalNetWorthP5:  last?.p5  ?? null,
    finalNetWorthP10: last?.p10 ?? null,
    finalNetWorthP25: last?.p25 ?? null,
    finalNetWorthP50: last?.p50 ?? null,
    finalNetWorthP75: last?.p75 ?? null,
    finalNetWorthP90: last?.p90 ?? null,
    finalNetWorthP95: last?.p95 ?? null,
    varDollars95:  rm?.varDollars95  ?? null,
    cvarDollars95: rm?.cvarDollars95 ?? null,
    maxDrawdownMedian: rm?.maxDrawdownMedian ?? null,
    maxDrawdownP90:    rm?.maxDrawdownP90    ?? null,
    volatility:        rm?.volatility        ?? null,
    downsideRisk:      rm?.downsideRisk      ?? null,
    leverageRisk:      rm?.leverageRisk      ?? null,
    liquidityRisk:     rm?.liquidityRisk     ?? null,
    concentrationRisk: rm?.concentrationRisk ?? null,
    riskAdjustedNw:    rm?.riskAdjustedNw    ?? null,
    riskRationale:     rm?.rationale         ?? [],
    defaultProbability:           result.defaultProbability           ?? null,
    negativeEquityProbability:    result.negativeEquityProbability    ?? null,
    liquidityStressProbability:   result.liquidityStressProbability   ?? null,
    refinancePressureProbability: result.refinancePressureProbability ?? null,
    liquidityExhaustionProbability: result.liquidityExhaustionProbability ?? null,
    medianDefaultMonth:        result.medianDefaultMonth        ?? null,
    medianLiquidityFirstMonth: result.medianLiquidityFirstMonth ?? null,
    medianNegEquityFirstMonth: result.medianNegEquityFirstMonth ?? null,
    reconciledMonthlySurplus:  result.reconciledMonthlySurplus  ?? null,
    dashboardMonthlySurplus:   result.dashboardMonthlySurplus   ?? null,
    reconcilesToDashboard:     result.reconcilesToDashboard     ?? null,
    horizonMonths: result.horizonMonths ?? null,
    simulationCount: result.simulationCount ?? null,
    runtimeMs: result.runtimeMs ?? null,
    serviceability: result.serviceability ? {
      passesDtiTest: result.serviceability.passesDtiTest ?? null,
      borrowingCapacity: result.serviceability.borrowingCapacity ?? null,
      dtiRatio: result.serviceability.dtiRatio ?? null,
      surplusAtAprasBuffer: result.serviceability.surplusAtAprasBuffer ?? null,
      rationale: result.serviceability.rationale ?? null,
    } : null,
  };
}

function summarise(out: QuickDecisionOutput) {
  const winner = out.ranked[0];
  const baseResult = (out as any).baseScenarioResult;
  return {
    question: out.question,
    capital: out.capital,
    investorProfile: out.investorProfile,
    counts: {
      ranked: out.ranked.length,
      discarded: out.discarded.length,
      highRiskPaths: out.highRiskPaths.length,
    },
    riskControlsApplied: out.riskControlsApplied,
    multiWinner: out.multiWinner,
    base: extractMetrics(baseResult),
    winner: winner ? {
      id: winner.id,
      label: winner.label,
      score: winner.score,
      scoreBreakdown: (winner as any).scoreBreakdown,
      events: ((winner as any).events ?? []).map((e: any) => ({
        type: e.type ?? e.deltaType,
        activationMonth: e.activationMonth,
        params: e.params,
      })),
      keyMetrics: extractMetrics((winner as any).result),
      softWarnings: (winner as any).softWarnings ?? [],
      hardBlockers: (winner as any).hardBlockers ?? [],
      isHighRisk:   (winner as any).isHighRisk ?? false,
    } : null,
    rankedTop3: out.ranked.slice(0, 3).map((c: any) => ({
      id: c.id, label: c.label, score: c.score,
      scoreBreakdown: c.scoreBreakdown,
      keyMetrics: extractMetrics(c.result),
    })),
    highRiskPaths: out.highRiskPaths.map((c: any) => ({
      id: c.id, label: c.label, score: c.score,
      softWarnings: c.softWarnings ?? [],
    })),
    comparativeNarrative: out.comparativeNarrative,
    executionPlan: out.executionPlan,
    conditionalRecommendations: out.conditionalRecommendations,
    discardedSummary: out.discarded.map((d) => ({
      id: d.id, label: d.label, stage: d.stage,
      reason: d.reason, severity: d.severity,
      override: d.override?.possible,
      horizonSensitive: (d as any).horizonSensitive,
      explanation: (d as any).explanation,
    })),
  };
}

(async () => {
  const all: any = { meta: {
    todayIso: "2026-05-11",
    horizonYears,
    simulationCount,
    taxContext,
    household,
  }, runs: [] as any[] };

  for (const q of QUESTIONS) {
    for (const mode of RISK_MODES) {
      const t0 = Date.now();
      console.log(`-- ${q.kind} capital=${q.capital ?? "n/a"} mode=${mode} ...`);
      const input: QuickDecisionInput = {
        dashboardInputs,
        question: q,
        horizonYears,
        simulationCount,
        household,
        taxContext,
        riskMode: mode,
      };
      let summary: any;
      try {
        const out = await generateQuickDecisionCandidates(input);
        summary = summarise(out);
        summary.elapsedMs = Date.now() - t0;
        summary.status = "ok";
      } catch (e: any) {
        summary = {
          question: q, mode,
          status: "error",
          error: e?.message ?? String(e),
          elapsedMs: Date.now() - t0,
        };
      }
      all.runs.push({ mode, ...summary });
      console.log(
        `   -> status=${summary.status} ranked=${summary.counts?.ranked ?? "-"} ` +
        `discarded=${summary.counts?.discarded ?? "-"} highRisk=${summary.counts?.highRiskPaths ?? "-"} ` +
        `(${summary.elapsedMs}ms)`
      );
    }
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(all, null, 2));
  console.log(`Wrote ${OUT_JSON} (${fs.statSync(OUT_JSON).size} bytes)`);
})();

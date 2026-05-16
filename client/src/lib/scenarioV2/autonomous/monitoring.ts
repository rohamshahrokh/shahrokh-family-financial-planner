/**
 * PART 1 — Continuous Strategy Monitoring.
 *
 * Deterministic per-dimension monitor. When ledger history is available we
 * report direction (improving / stable / deteriorating) with safe deltas.
 * When it is not, we report current-state observations and mark the signal
 * `needs-history` so the UI shows the honest baseline state.
 */

import type { RankedCandidate } from "../decisionEngine/candidateGenerator";
import type { ExtendedScenarioResult } from "../runScenario";
import type {
  LedgerSnapshot,
  MonitoringDimension,
  MonitoringDirection,
  MonitoringSignal,
} from "./types";
import type { InsightSeverity } from "../intelligence/types";

interface MonitoringInput {
  winner: RankedCandidate;
  baseline: ExtendedScenarioResult;
  /** Chronological history snapshots (oldest first). */
  history: LedgerSnapshot[];
  /** Liquidity floor preference (months of expenses) — default 6. */
  liquidityFloorMonths?: number;
  /** User-preferred max leverage (LVR 0..1) — default 0.80. */
  preferredMaxLvr?: number;
}

const SAFE_DELTA_THRESHOLD = 0.02;

function direction(prev: number, curr: number, betterUp: boolean, eps = SAFE_DELTA_THRESHOLD): MonitoringDirection {
  if (prev === 0 && curr === 0) return "stable";
  const denom = Math.max(1, Math.abs(prev));
  const change = (curr - prev) / denom;
  if (Math.abs(change) < eps) return "stable";
  const up = change > 0;
  if (up === betterUp) return "improving";
  return "deteriorating";
}

function severityFromDirection(d: MonitoringDirection, magnitude = 0): InsightSeverity {
  if (d === "deteriorating") {
    if (magnitude >= 0.2) return "critical";
    if (magnitude >= 0.1) return "warn";
    return "watch";
  }
  if (d === "improving") return "info";
  if (d === "needs-history") return "watch";
  return "info";
}

function firstAndLast(history: LedgerSnapshot[]): { first: LedgerSnapshot | null; last: LedgerSnapshot | null } {
  if (!history.length) return { first: null, last: null };
  return { first: history[0], last: history[history.length - 1] };
}

export function buildMonitoringSignals(input: MonitoringInput): MonitoringSignal[] {
  const { winner, baseline, history } = input;
  const liquidityFloorMonths = input.liquidityFloorMonths ?? 6;
  const preferredMaxLvr = input.preferredMaxLvr ?? 0.80;
  const signals: MonitoringSignal[] = [];
  const { first, last } = firstAndLast(history);
  const hasHistory = !!first && !!last && first.month !== last.month;

  const winnerRes = winner.result;
  // Conservative monthly-expense floor derived from history when available, else default $6k.
  const lastSnapshot = history.length ? history[history.length - 1] : null;
  const monthlyExpenses = Math.max(
    1,
    lastSnapshot?.monthlyExpenses ?? 6_000,
  );

  // ── balance-sheet
  signals.push(monitorBalanceSheet(winnerRes, hasHistory, first, last));

  // ── cashflow
  signals.push(monitorCashflow(baseline, hasHistory, first, last));

  // ── leverage
  signals.push(monitorLeverage(winnerRes, preferredMaxLvr, hasHistory, first, last));

  // ── liquidity
  signals.push(monitorLiquidity(winnerRes, monthlyExpenses, liquidityFloorMonths, hasHistory, first, last));

  // ── debt serviceability
  signals.push(monitorServiceability(winnerRes));

  // ── FIRE trajectory
  signals.push(monitorFireTrajectory(winnerRes, hasHistory, first, last));

  // ── risk drift
  signals.push(monitorRiskDrift(winnerRes));

  // ── market sensitivity
  signals.push(monitorMarketSensitivity(winnerRes));

  // ── asset concentration
  signals.push(monitorConcentration(winnerRes));

  // ── behaviour drift (history-driven; needs-history when absent)
  signals.push(monitorBehaviourDrift(hasHistory, first, last));

  return signals;
}

function mkSignal(
  id: string,
  dimension: MonitoringDimension,
  label: string,
  direction: MonitoringDirection,
  summary: string,
  drivers: string[],
  opts: { delta?: MonitoringSignal["delta"]; needsHistory?: boolean; magnitude?: number } = {},
): MonitoringSignal {
  return {
    id,
    dimension,
    label,
    direction,
    severity: severityFromDirection(direction, opts.magnitude ?? 0),
    summary,
    delta: opts.delta,
    drivers,
    needsHistory: !!opts.needsHistory,
  };
}

function monitorBalanceSheet(res: ExtendedScenarioResult, hasHistory: boolean, first: LedgerSnapshot | null, last: LedgerSnapshot | null): MonitoringSignal {
  if (hasHistory && first && last) {
    const dir = direction(first.netWorth, last.netWorth, true);
    const deltaValue = last.netWorth - first.netWorth;
    return mkSignal(
      "mon-balance-sheet",
      "balance-sheet",
      "Balance sheet",
      dir,
      dir === "improving"
        ? "Net worth has been compounding versus your baseline — the balance sheet is strengthening."
        : dir === "deteriorating"
        ? "Net worth has moved backwards versus your baseline — the balance sheet is under pressure."
        : "Net worth is broadly flat versus your baseline.",
      ["history.netWorth"],
      {
        delta: { label: dir === "improving" ? "Net worth growth" : "Net worth change", value: Math.round(deltaValue), unit: "$" },
        magnitude: Math.abs(deltaValue) / Math.max(1, first.netWorth),
      },
    );
  }
  return mkSignal(
    "mon-balance-sheet",
    "balance-sheet",
    "Balance sheet",
    "needs-history",
    `Current net worth is $${Math.round(res.initialNetWorth).toLocaleString("en-AU")}. Historical comparison will appear after monthly snapshots accumulate.`,
    ["result.initialNetWorth"],
    { needsHistory: true },
  );
}

function monitorCashflow(baseline: ExtendedScenarioResult, hasHistory: boolean, first: LedgerSnapshot | null, last: LedgerSnapshot | null): MonitoringSignal {
  if (hasHistory && first && last) {
    const dir = direction(first.monthlySurplus, last.monthlySurplus, true);
    const change = last.monthlySurplus - first.monthlySurplus;
    return mkSignal(
      "mon-cashflow",
      "cashflow",
      "Cashflow",
      dir,
      dir === "improving"
        ? "Monthly surplus has expanded — cashflow is reinforcing your strategy."
        : dir === "deteriorating"
        ? "Monthly surplus has compressed — cashflow is constraining strategic flexibility."
        : "Monthly surplus is broadly unchanged.",
      ["history.monthlySurplus"],
      {
        delta: { label: "Monthly surplus change", value: Math.round(change), unit: "$/mo" },
        magnitude: Math.abs(change) / Math.max(1, Math.abs(first.monthlySurplus) || 1),
      },
    );
  }
  const surplus = baseline.dashboardMonthlySurplus;
  return mkSignal(
    "mon-cashflow",
    "cashflow",
    "Cashflow",
    "needs-history",
    `Current monthly surplus is $${Math.round(surplus).toLocaleString("en-AU")}. Trend monitoring will activate after several monthly snapshots accumulate.`,
    ["baseline.dashboardMonthlySurplus"],
    { needsHistory: true },
  );
}

function monitorLeverage(res: ExtendedScenarioResult, preferredMaxLvr: number, hasHistory: boolean, first: LedgerSnapshot | null, last: LedgerSnapshot | null): MonitoringSignal {
  if (hasHistory && first && last && first.lvr !== undefined && last.lvr !== undefined) {
    const dir = direction(first.lvr, last.lvr, false);
    const change = last.lvr - first.lvr;
    const breaches = last.lvr > preferredMaxLvr;
    return mkSignal(
      "mon-leverage",
      "leverage",
      "Leverage",
      dir,
      breaches
        ? `Your LVR has moved to ${(last.lvr * 100).toFixed(0)}%, above your preferred ${(preferredMaxLvr * 100).toFixed(0)}% ceiling.`
        : dir === "improving"
        ? "Leverage has reduced — additional capacity is opening up."
        : dir === "deteriorating"
        ? "Leverage has increased versus baseline."
        : "Leverage profile is broadly unchanged.",
      ["history.lvr"],
      { delta: { label: "LVR change", value: Number((change * 100).toFixed(1)), unit: "pp" }, magnitude: Math.abs(change) * 5 },
    );
  }
  const service = res.serviceability;
  const currentLvr = service?.lvr ?? null;
  if (currentLvr === null) {
    return mkSignal(
      "mon-leverage",
      "leverage",
      "Leverage",
      "needs-history",
      "Current LVR is unavailable from the engine output. Historical leverage trend will activate as snapshots accumulate.",
      ["result.serviceability.lvr"],
      { needsHistory: true },
    );
  }
  return mkSignal(
    "mon-leverage",
    "leverage",
    "Leverage",
    currentLvr > preferredMaxLvr ? "deteriorating" : "stable",
    currentLvr > preferredMaxLvr
      ? `LVR of ${(currentLvr * 100).toFixed(0)}% currently exceeds your preferred ceiling of ${(preferredMaxLvr * 100).toFixed(0)}%.`
      : `LVR of ${(currentLvr * 100).toFixed(0)}% remains within your preferred ${(preferredMaxLvr * 100).toFixed(0)}% ceiling.`,
    ["result.serviceability.lvr"],
    { magnitude: Math.max(0, currentLvr - preferredMaxLvr) },
  );
}

function monitorLiquidity(res: ExtendedScenarioResult, monthlyExpenses: number, floorMonths: number, hasHistory: boolean, first: LedgerSnapshot | null, last: LedgerSnapshot | null): MonitoringSignal {
  const stress = res.liquidityStressProbability ?? 0;
  const liquidityFloor$ = floorMonths * monthlyExpenses;
  if (hasHistory && first && last) {
    const dir = direction(first.liquidCash, last.liquidCash, true);
    const change = last.liquidCash - first.liquidCash;
    const breaches = last.liquidCash < liquidityFloor$;
    return mkSignal(
      "mon-liquidity",
      "liquidity",
      "Liquidity",
      breaches ? "deteriorating" : dir,
      breaches
        ? `Liquid buffer of $${Math.round(last.liquidCash).toLocaleString("en-AU")} is below your preferred ${floorMonths}-month floor (~$${Math.round(liquidityFloor$).toLocaleString("en-AU")}).`
        : dir === "improving"
        ? "Liquid buffer has rebuilt versus baseline."
        : dir === "deteriorating"
        ? "Liquid buffer has compressed versus baseline."
        : "Liquid buffer is broadly unchanged.",
      ["history.liquidCash"],
      { delta: { label: "Liquid cash change", value: Math.round(change), unit: "$" }, magnitude: Math.abs(change) / Math.max(1, first.liquidCash || 1) },
    );
  }
  return mkSignal(
    "mon-liquidity",
    "liquidity",
    "Liquidity",
    stress > 0.25 ? "deteriorating" : "stable",
    stress > 0.25
      ? `Modelled probability of liquidity stress is ${(stress * 100).toFixed(0)}% — buffers are thin under the winning path.`
      : `Modelled probability of liquidity stress is ${(stress * 100).toFixed(0)}% under the winning path.`,
    ["result.liquidityStressProbability"],
    { magnitude: stress, needsHistory: !hasHistory },
  );
}

function monitorServiceability(res: ExtendedScenarioResult): MonitoringSignal {
  const refi = res.refinancePressureProbability ?? 0;
  const def = res.defaultProbability ?? 0;
  const dir: MonitoringDirection = def > 0.10 || refi > 0.30 ? "deteriorating" : "stable";
  return mkSignal(
    "mon-serviceability",
    "debt-serviceability",
    "Debt serviceability",
    dir,
    `Modelled default probability is ${(def * 100).toFixed(0)}%; refinance pressure probability is ${(refi * 100).toFixed(0)}%.`,
    ["result.defaultProbability", "result.refinancePressureProbability"],
    { magnitude: Math.max(def, refi) },
  );
}

function monitorFireTrajectory(res: ExtendedScenarioResult, hasHistory: boolean, first: LedgerSnapshot | null, last: LedgerSnapshot | null): MonitoringSignal {
  if (hasHistory && first && last && first.fireYearsAway !== undefined && last.fireYearsAway !== undefined) {
    const dir = direction(first.fireYearsAway, last.fireYearsAway, false);
    const change = last.fireYearsAway - first.fireYearsAway;
    return mkSignal(
      "mon-fire",
      "fire-trajectory",
      "FIRE trajectory",
      dir,
      dir === "improving"
        ? `FIRE trajectory has improved by ${Math.abs(change).toFixed(1)} years versus baseline.`
        : dir === "deteriorating"
        ? `FIRE trajectory has drifted ${Math.abs(change).toFixed(1)} years further away versus baseline.`
        : "FIRE trajectory is broadly unchanged.",
      ["history.fireYearsAway"],
      { delta: { label: "FIRE years change", value: Number(change.toFixed(1)), unit: "years" }, magnitude: Math.abs(change) / 10 },
    );
  }
  return mkSignal(
    "mon-fire",
    "fire-trajectory",
    "FIRE trajectory",
    "needs-history",
    "FIRE trajectory comparison requires longitudinal snapshots — current run will become the baseline.",
    ["result.medianNwPath"],
    { needsHistory: true },
  );
}

function monitorRiskDrift(res: ExtendedScenarioResult): MonitoringSignal {
  const vol = res.riskMetrics?.volatility ?? 0;
  const down = res.riskMetrics?.downsideRisk ?? 0;
  const high = vol > 0.25 || down > 0.20;
  return mkSignal(
    "mon-risk-drift",
    "risk-drift",
    "Risk drift",
    high ? "deteriorating" : "stable",
    high
      ? `Strategy volatility is ${(vol * 100).toFixed(0)}% with downside exposure ${(down * 100).toFixed(0)}% — well above conservative bands.`
      : `Strategy volatility ${(vol * 100).toFixed(0)}%; downside ${(down * 100).toFixed(0)}% — within balanced bands.`,
    ["result.riskMetrics.volatility", "result.riskMetrics.downsideRisk"],
    { magnitude: Math.max(vol, down) },
  );
}

function monitorMarketSensitivity(res: ExtendedScenarioResult): MonitoringSignal {
  const negEq = res.negativeEquityProbability ?? 0;
  const refi = res.refinancePressureProbability ?? 0;
  const high = negEq > 0.10 || refi > 0.30;
  return mkSignal(
    "mon-market-sensitivity",
    "market-sensitivity",
    "Market sensitivity",
    high ? "deteriorating" : "stable",
    high
      ? `Strategy is materially sensitive to property and rate paths — negative-equity probability ${(negEq * 100).toFixed(0)}%, refi pressure ${(refi * 100).toFixed(0)}%.`
      : `Market sensitivity within tolerance: negative-equity probability ${(negEq * 100).toFixed(0)}%, refi pressure ${(refi * 100).toFixed(0)}%.`,
    ["result.negativeEquityProbability", "result.refinancePressureProbability"],
    { magnitude: Math.max(negEq, refi) },
  );
}

function monitorConcentration(res: ExtendedScenarioResult): MonitoringSignal {
  const conc = res.riskMetrics?.concentrationRisk ?? 0;
  return mkSignal(
    "mon-concentration",
    "asset-concentration",
    "Asset concentration",
    conc > 0.7 ? "deteriorating" : "stable",
    conc > 0.7
      ? `Allocation concentration index of ${conc.toFixed(2)} is high — limited diversification benefit under sequence stress.`
      : `Concentration index ${conc.toFixed(2)} is within balanced bands.`,
    ["result.riskMetrics.concentrationRisk"],
    { magnitude: conc },
  );
}

function monitorBehaviourDrift(hasHistory: boolean, first: LedgerSnapshot | null, last: LedgerSnapshot | null): MonitoringSignal {
  if (hasHistory && first && last) {
    // Behavioural proxy: surplus as fraction of income — declining suggests lifestyle creep.
    const fSavings = first.monthlyIncome > 0 ? first.monthlySurplus / first.monthlyIncome : 0;
    const lSavings = last.monthlyIncome > 0 ? last.monthlySurplus / last.monthlyIncome : 0;
    const dir = direction(fSavings, lSavings, true);
    return mkSignal(
      "mon-behaviour-drift",
      "behaviour-drift",
      "Behaviour drift",
      dir,
      dir === "deteriorating"
        ? "Savings rate has declined materially — lifestyle inflation is absorbing income growth."
        : dir === "improving"
        ? "Savings rate has expanded — disciplined behaviour is reinforcing strategy."
        : "Savings rate is broadly unchanged.",
      ["history.monthlyIncome", "history.monthlySurplus"],
      { delta: { label: "Savings-rate change", value: Number(((lSavings - fSavings) * 100).toFixed(1)), unit: "pp" } },
    );
  }
  return mkSignal(
    "mon-behaviour-drift",
    "behaviour-drift",
    "Behaviour drift",
    "needs-history",
    "Behavioural drift requires multiple monthly snapshots — current run is the baseline.",
    ["history.monthlySurplus"],
    { needsHistory: true },
  );
}

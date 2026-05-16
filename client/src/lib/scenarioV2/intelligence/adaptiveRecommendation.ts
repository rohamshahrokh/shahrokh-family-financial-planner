/**
 * Adaptive Recommendation System — explains how the current
 * recommendation differs from a prior one (if any), and detects
 * financial drift from a history series.
 *
 * If no prior context is supplied, returns a neutral baseline state and
 * does not fabricate history.
 */

import type { RankedCandidate } from "../decisionEngine/candidateGenerator";
import type { ExtendedScenarioResult } from "../runScenario";
import type {
  DriftFinding,
  PriorContext,
  RecommendationDelta,
  InsightSeverity,
} from "./types";

export function buildRecommendationDelta(
  winner: RankedCandidate,
  prior: PriorContext | null,
): RecommendationDelta {
  if (!prior || !prior.previousWinnerId) {
    return {
      previousWinnerId: null,
      previousLabel: null,
      currentWinnerId: winner.id,
      currentLabel: winner.label,
      changed: false,
      reason:
        "Baseline recommendation — no prior decision context exists. The next ranking will be compared against this run.",
      diffs: [],
    };
  }
  if (prior.previousWinnerId === winner.id) {
    return {
      previousWinnerId: prior.previousWinnerId,
      previousLabel: prior.previousLabel,
      currentWinnerId: winner.id,
      currentLabel: winner.label,
      changed: false,
      reason:
        "Recommendation is unchanged — the same path remains the highest-scoring strategy under the current ledger and constraints.",
      diffs: [],
    };
  }

  // Recommendation changed.
  const diffs: string[] = [];
  const cur = winner;
  const prevLabel = prior.previousLabel ?? prior.previousWinnerId;
  const surplusBefore = (prior.history?.[0]?.monthlySurplus ?? null);
  const surplusAfter = (prior.history?.[prior.history.length - 1]?.monthlySurplus ?? null);
  if (surplusBefore !== null && surplusAfter !== null && Math.abs(surplusAfter - surplusBefore) > 200) {
    const direction = surplusAfter > surplusBefore ? "improved" : "declined";
    diffs.push(`Monthly surplus has ${direction} from $${Math.round(surplusBefore).toLocaleString("en-AU")} to $${Math.round(surplusAfter).toLocaleString("en-AU")}.`);
  }
  const cashBefore = prior.history?.[0]?.cash ?? null;
  const cashAfter = prior.history?.[prior.history.length - 1]?.cash ?? null;
  if (cashBefore !== null && cashAfter !== null && Math.abs(cashAfter - cashBefore) > 5000) {
    const direction = cashAfter > cashBefore ? "rebuilt" : "compressed";
    diffs.push(`Cash buffer has ${direction} from $${Math.round(cashBefore).toLocaleString("en-AU")} to $${Math.round(cashAfter).toLocaleString("en-AU")}.`);
  }

  // Compose reason
  let reason = `Recommendation changed from ${prevLabel} to ${winner.label}.`;
  const text = `${winner.label} ${winner.id}`.toLowerCase();
  const isDefensive = /offset|defer|cash|defensive|liquidity/.test(text);
  const isLevered = /property|ip\b|lever/.test(text);
  if (isDefensive && surplusAfter !== null && surplusBefore !== null && surplusAfter < surplusBefore) {
    reason = `Recommendation changed from ${prevLabel} to liquidity preservation due to declining monthly surplus.`;
  } else if (isLevered && cashAfter !== null && cashBefore !== null && cashAfter > cashBefore) {
    reason = `Improved offset balance increased survivability enough to unlock higher-growth paths — recommendation upgraded from ${prevLabel} to ${winner.label}.`;
  }

  return {
    previousWinnerId: prior.previousWinnerId,
    previousLabel: prior.previousLabel,
    currentWinnerId: winner.id,
    currentLabel: winner.label,
    changed: true,
    reason,
    diffs,
  };
}

export function detectDrift(
  baseline: ExtendedScenarioResult,
  prior: PriorContext | null,
): DriftFinding[] {
  const out: DriftFinding[] = [];
  const history = prior?.history ?? [];
  const hasHistory = history.length >= 2;

  if (!hasHistory) {
    // Surface what can be inferred from current data, plus "needs history" markers.
    const liq = baseline.riskMetrics?.liquidityRisk ?? 0;
    if (liq >= 0.4) {
      out.push({
        kind: "liquidity-deterioration",
        description:
          "Liquidity buffer reads thin relative to a 6-month expense band on the current ledger. Historical comparison would clarify whether this is a recent compression or a structural posture.",
        severity: bandFromValue(liq, 0.4, 0.6),
        needsHistory: true,
      });
    }
    const surplus = baseline.reconciledMonthlySurplus ?? 0;
    if (surplus > 0 && surplus < 3000) {
      out.push({
        kind: "cashflow-weakening",
        description:
          "Current monthly surplus is below the band typical for the household's income — drift comparison requires multi-month history.",
        severity: "watch",
        needsHistory: true,
      });
    }
    if (out.length === 0) {
      out.push({
        kind: "fire-delay",
        description:
          "Drift detection requires multi-month ledger history. Connect history to evaluate spending creep, savings-rate decline, and FIRE trajectory drift.",
        severity: "info",
        needsHistory: true,
      });
    }
    return out;
  }

  const first = history[0];
  const last = history[history.length - 1];
  const monthsSpan = Math.max(1, history.length - 1);

  // Surplus decline
  const surplusDelta = last.monthlySurplus - first.monthlySurplus;
  if (surplusDelta < -200) {
    const dropPct = Math.abs(surplusDelta) / Math.max(1, Math.abs(first.monthlySurplus));
    out.push({
      kind: "savings-rate-decline",
      description: `Monthly surplus has fallen by ~${Math.round(dropPct * 100)}% over the observed ${monthsSpan}-month window. Lifestyle inflation appears to be consuming a meaningful share of recent income growth.`,
      severity: dropPct >= 0.3 ? "warn" : "watch",
      needsHistory: false,
    });
  }

  // Spending creep proxy — derived from surplus drop vs cash balance change.
  if (last.monthlySurplus < first.monthlySurplus && last.cash < first.cash) {
    out.push({
      kind: "spending-creep",
      description:
        "Surplus and cash are both falling — expenses are growing faster than income on the recent run-rate. Investigate recurring-bill drift and discretionary creep.",
      severity: "watch",
      needsHistory: false,
    });
  }

  // Leverage increase
  const debtDelta = last.debt - first.debt;
  if (debtDelta > 5000 && (last.netWorth - first.netWorth) < debtDelta) {
    out.push({
      kind: "leverage-increase",
      description: "Debt is growing faster than net worth — leverage ratio is drifting upward on the current trajectory.",
      severity: "warn",
      needsHistory: false,
    });
  }

  // FIRE delay
  if (typeof first.fireYearsAway === "number" && typeof last.fireYearsAway === "number") {
    const delay = last.fireYearsAway - first.fireYearsAway;
    if (delay > 0.5) {
      out.push({
        kind: "fire-delay",
        description: `FIRE date has drifted back by ${delay.toFixed(1)} years over the observed window. Compound effect of surplus drift is meaningful.`,
        severity: delay >= 2 ? "warn" : "watch",
        needsHistory: false,
      });
    }
  }

  // Liquidity deterioration
  const cashDelta = last.cash - first.cash;
  if (cashDelta < -5000) {
    out.push({
      kind: "liquidity-deterioration",
      description: `Cash buffer compressed by approximately $${Math.abs(Math.round(cashDelta)).toLocaleString("en-AU")} over the observed window.`,
      severity: "watch",
      needsHistory: false,
    });
  }

  return out;
}

function bandFromValue(v: number, watchMin: number, warnMin: number): InsightSeverity {
  if (v >= warnMin) return "warn";
  if (v >= watchMin) return "watch";
  return "info";
}

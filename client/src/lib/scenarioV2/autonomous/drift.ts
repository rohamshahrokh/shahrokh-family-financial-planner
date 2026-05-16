/**
 * PART 5 — Trajectory Drift Engine.
 *
 * Detects deterministic drift signals from longitudinal history when
 * available; otherwise emits `needsHistory` findings so the UI shows the
 * honest baseline state. Magnitudes are derived only from real snapshots.
 */

import type { ExtendedScenarioResult } from "../runScenario";
import type { DriftKind, LedgerSnapshot, TrajectoryDrift } from "./types";
import type { InsightSeverity } from "../intelligence/types";

export interface DriftInput {
  baseline: ExtendedScenarioResult;
  history: LedgerSnapshot[];
}

function sev(magnitude: number): InsightSeverity {
  if (magnitude >= 0.25) return "critical";
  if (magnitude >= 0.10) return "warn";
  if (magnitude >= 0.03) return "watch";
  return "info";
}

function mk(
  id: string,
  kind: DriftKind,
  description: string,
  drivers: string[],
  opts: { severity?: InsightSeverity; magnitude?: TrajectoryDrift["magnitude"]; needsHistory?: boolean } = {},
): TrajectoryDrift {
  return {
    id,
    kind,
    description,
    severity: opts.severity ?? "watch",
    magnitude: opts.magnitude,
    needsHistory: !!opts.needsHistory,
    drivers,
  };
}

export function detectTrajectoryDrift(input: DriftInput): TrajectoryDrift[] {
  const { baseline, history } = input;
  if (history.length < 2) {
    return [
      mk("drift-baseline", "fire-delay", "Trajectory drift requires multiple monthly snapshots — this run becomes the comparison baseline.", ["history"], { needsHistory: true }),
    ];
  }
  const first = history[0];
  const last = history[history.length - 1];
  const out: TrajectoryDrift[] = [];

  // ── FIRE delay
  if (first.fireYearsAway !== undefined && last.fireYearsAway !== undefined) {
    const diff = last.fireYearsAway - first.fireYearsAway;
    if (Math.abs(diff) >= 0.5) {
      out.push(
        mk(
          "drift-fire",
          "fire-delay",
          diff > 0
            ? `Your current trajectory has drifted ${diff.toFixed(1)} years further from FIRE versus your original baseline.`
            : `Your current trajectory has accelerated ${Math.abs(diff).toFixed(1)} years closer to FIRE versus your original baseline.`,
          ["history.fireYearsAway"],
          {
            severity: sev(Math.abs(diff) / 10),
            magnitude: { label: "FIRE drift", value: Number(diff.toFixed(1)), unit: "years" },
          },
        ),
      );
    }
  }

  // ── Savings-rate deterioration / lifestyle inflation
  const fRate = first.monthlyIncome > 0 ? first.monthlySurplus / first.monthlyIncome : 0;
  const lRate = last.monthlyIncome > 0 ? last.monthlySurplus / last.monthlyIncome : 0;
  if (fRate - lRate >= 0.03) {
    out.push(
      mk(
        "drift-savings-rate",
        "savings-rate-deterioration",
        `Savings rate has fallen from ${(fRate * 100).toFixed(0)}% to ${(lRate * 100).toFixed(0)}% of income.`,
        ["history.monthlyIncome", "history.monthlySurplus"],
        {
          severity: sev(fRate - lRate),
          magnitude: { label: "Savings-rate change", value: Number(((lRate - fRate) * 100).toFixed(1)), unit: "pp" },
        },
      ),
    );
  }

  // ── Spending creep
  if (first.monthlyExpenses > 0) {
    const exGrowth = (last.monthlyExpenses - first.monthlyExpenses) / first.monthlyExpenses;
    const inGrowth = first.monthlyIncome > 0 ? (last.monthlyIncome - first.monthlyIncome) / first.monthlyIncome : 0;
    if (exGrowth >= 0.05 && exGrowth > inGrowth * 0.7) {
      const ratio = inGrowth > 0 ? Math.min(1, (last.monthlyExpenses - first.monthlyExpenses) / Math.max(1, last.monthlyIncome - first.monthlyIncome)) : 1;
      out.push(
        mk(
          "drift-spending-creep",
          "spending-creep",
          `Lifestyle inflation is absorbing ${(ratio * 100).toFixed(0)}% of recent income growth.`,
          ["history.monthlyExpenses", "history.monthlyIncome"],
          {
            severity: sev(exGrowth),
            magnitude: { label: "Expense growth", value: Number((exGrowth * 100).toFixed(1)), unit: "%" },
          },
        ),
      );
    }
  }

  // ── Leverage acceleration
  if (first.totalDebt > 0) {
    const debtGrowth = (last.totalDebt - first.totalDebt) / first.totalDebt;
    const nwGrowth = first.netWorth > 0 ? (last.netWorth - first.netWorth) / first.netWorth : 0;
    if (debtGrowth >= 0.05 && debtGrowth > nwGrowth) {
      out.push(
        mk(
          "drift-leverage",
          "leverage-acceleration",
          "Debt growth is outpacing asset growth — leverage profile is accelerating.",
          ["history.totalDebt", "history.netWorth"],
          { severity: sev(debtGrowth - Math.max(0, nwGrowth)), magnitude: { label: "Debt vs NW growth", value: Number(((debtGrowth - nwGrowth) * 100).toFixed(1)), unit: "pp" } },
        ),
      );
    }
  }

  // ── Liquidity compression
  if (first.liquidCash > 0) {
    const dCash = last.liquidCash - first.liquidCash;
    if (dCash <= -first.liquidCash * 0.15) {
      out.push(
        mk(
          "drift-liquidity",
          "liquidity-compression",
          `Liquid balance has compressed by $${Math.abs(Math.round(dCash)).toLocaleString("en-AU")} (${((dCash / first.liquidCash) * 100).toFixed(0)}%) versus baseline.`,
          ["history.liquidCash"],
          {
            severity: sev(Math.abs(dCash) / Math.max(1, first.liquidCash)),
            magnitude: { label: "Liquid-cash change", value: Math.round(dCash), unit: "$" },
          },
        ),
      );
    }
  }

  // ── Survivability deterioration: surrogate via default probability vs history note
  if ((baseline.defaultProbability ?? 0) >= 0.10) {
    out.push(
      mk(
        "drift-survivability",
        "survivability-deterioration",
        `Modelled survivability has weakened — default probability is ${((baseline.defaultProbability ?? 0) * 100).toFixed(0)}% under current settings.`,
        ["baseline.defaultProbability"],
        { severity: sev(baseline.defaultProbability ?? 0) },
      ),
    );
  }

  if (!out.length) {
    out.push(
      mk("drift-clean", "fire-delay", "No material drift detected between baseline and current snapshots.", ["history"], { severity: "info" }),
    );
  }
  return out;
}

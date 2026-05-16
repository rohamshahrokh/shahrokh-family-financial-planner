/**
 * PART 10 — Longitudinal Intelligence.
 *
 * Compares the latest snapshot to a window-back snapshot. When history is
 * insufficient, returns a no-history state so the UI can show the honest
 * baseline. Never fabricates prior values.
 */

import type { LedgerSnapshot, LongitudinalComparison } from "./types";

export interface LongitudinalInput {
  history: LedgerSnapshot[];
  /** Months back to compare against; default 6. Falls back to first snapshot when shorter. */
  windowMonths?: number;
}

export function buildLongitudinal(input: LongitudinalInput): LongitudinalComparison {
  const { history } = input;
  const windowMonths = input.windowMonths ?? 6;
  if (history.length < 2) {
    return {
      window: `vs ${windowMonths} months ago`,
      hasHistory: false,
      summary: ["Longitudinal comparison will activate after multiple monthly snapshots accumulate."],
      deltas: [],
    };
  }
  const last = history[history.length - 1];
  // Find the snapshot windowMonths before last (or the earliest available).
  const target = (() => {
    const idx = Math.max(0, history.length - 1 - windowMonths);
    return history[idx];
  })();

  const deltas: LongitudinalComparison["deltas"] = [];
  const summary: string[] = [];

  const dNw = last.netWorth - target.netWorth;
  deltas.push({ metric: "netWorth", label: "Net worth", value: Math.round(dNw), unit: "$", direction: dirOf(dNw) });
  if (Math.abs(dNw) >= 10_000) {
    summary.push(`Net worth has ${dNw > 0 ? "increased" : "decreased"} by $${Math.round(Math.abs(dNw)).toLocaleString("en-AU")} versus ${windowMonths} months ago.`);
  }

  const dCash = last.liquidCash - target.liquidCash;
  deltas.push({ metric: "liquidCash", label: "Liquid cash", value: Math.round(dCash), unit: "$", direction: dirOf(dCash) });
  if (Math.abs(dCash) >= 5_000) {
    summary.push(`Liquid balance has ${dCash > 0 ? "rebuilt" : "compressed"} by $${Math.round(Math.abs(dCash)).toLocaleString("en-AU")}.`);
  }

  const dDebt = last.totalDebt - target.totalDebt;
  deltas.push({ metric: "totalDebt", label: "Total debt", value: Math.round(dDebt), unit: "$", direction: dirOf(dDebt) });
  if (Math.abs(dDebt) >= 5_000) {
    summary.push(`Total debt has ${dDebt > 0 ? "increased" : "reduced"} by $${Math.round(Math.abs(dDebt)).toLocaleString("en-AU")}.`);
  }

  const dSurplus = last.monthlySurplus - target.monthlySurplus;
  deltas.push({ metric: "monthlySurplus", label: "Monthly surplus", value: Math.round(dSurplus), unit: "$/mo", direction: dirOf(dSurplus) });
  if (Math.abs(dSurplus) >= 200) {
    summary.push(`Monthly surplus has ${dSurplus > 0 ? "expanded" : "compressed"} by $${Math.round(Math.abs(dSurplus)).toLocaleString("en-AU")}/mo.`);
  }

  if (last.fireYearsAway !== undefined && target.fireYearsAway !== undefined) {
    const dFire = last.fireYearsAway - target.fireYearsAway;
    deltas.push({ metric: "fireYearsAway", label: "FIRE years away", value: Number(dFire.toFixed(1)), unit: "years", direction: dirOf(dFire) });
    if (Math.abs(dFire) >= 0.3) {
      summary.push(`FIRE trajectory has ${dFire > 0 ? "drifted" : "improved"} by ${Math.abs(dFire).toFixed(1)} years.`);
    }
  }

  if (!summary.length) {
    summary.push("Headline metrics are broadly unchanged versus the comparison window.");
  }

  // Strategic shape comparison sentence
  const dirOnNw = dirOf(dNw);
  const dirOnDebt = dirOf(dDebt);
  if (dirOnNw === "up" && dirOnDebt === "down") {
    summary.unshift("Compared with the prior window, financial resilience has improved materially due to debt reduction and balance-sheet expansion.");
  } else if (dirOnNw === "down" && dirOnDebt === "up") {
    summary.unshift("Compared with the prior window, financial resilience has weakened — debt is rising while net worth softens.");
  }

  return {
    window: `vs ${windowMonths} months ago`,
    hasHistory: true,
    summary,
    deltas,
  };
}

function dirOf(v: number): "up" | "down" | "flat" {
  if (Math.abs(v) < 1) return "flat";
  return v > 0 ? "up" : "down";
}

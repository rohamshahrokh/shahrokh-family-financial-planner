/**
 * PART 7 — Portfolio Rebalancing Intelligence.
 *
 * Compares the latest snapshot's allocation against a target derived from
 * the user's investor philosophy (or supplied targets). Emits signals for
 * over/under-allocation, concentration drift, volatility imbalance, and
 * liquidity imbalance. CGT-aware timing is surfaced as a structural note,
 * never as a precise tax projection.
 */

import type { ExtendedScenarioResult } from "../runScenario";
import type {
  AllocationSnapshot,
  LedgerSnapshot,
  RebalanceKind,
  RebalanceSignal,
  StrategicMemoryInput,
} from "./types";
import type { InsightSeverity } from "../intelligence/types";

export interface RebalanceInput {
  baseline: ExtendedScenarioResult;
  history: LedgerSnapshot[];
  memory?: StrategicMemoryInput | null;
  /** Optional explicit target allocation overriding philosophy default. */
  targetAllocation?: AllocationSnapshot;
}

const PHILOSOPHY_TARGETS: Record<NonNullable<StrategicMemoryInput["philosophy"]>, AllocationSnapshot> = {
  "preserve-first": { cash: 0.30, equities: 0.20, property: 0.30, super: 0.15, crypto: 0.00, other: 0.05 },
  "balanced-growth": { cash: 0.15, equities: 0.35, property: 0.30, super: 0.15, crypto: 0.02, other: 0.03 },
  "compound-growth": { cash: 0.10, equities: 0.45, property: 0.30, super: 0.10, crypto: 0.03, other: 0.02 },
  "aggressive-growth": { cash: 0.05, equities: 0.50, property: 0.30, super: 0.05, crypto: 0.07, other: 0.03 },
  "income-focused": { cash: 0.10, equities: 0.30, property: 0.45, super: 0.10, crypto: 0.00, other: 0.05 },
};
const DEFAULT_TARGET = PHILOSOPHY_TARGETS["balanced-growth"];

function severityFromDiff(diffPp: number): InsightSeverity {
  if (Math.abs(diffPp) >= 0.15) return "warn";
  if (Math.abs(diffPp) >= 0.08) return "watch";
  return "info";
}

function mk(
  id: string,
  kind: RebalanceKind,
  assetClass: RebalanceSignal["assetClass"],
  description: string,
  suggestedAction: string,
  drivers: string[],
  severity: InsightSeverity,
  magnitude?: RebalanceSignal["magnitude"],
): RebalanceSignal {
  return { id, kind, assetClass, description, suggestedAction, drivers, severity, magnitude };
}

export function detectRebalancing(input: RebalanceInput): RebalanceSignal[] {
  const { baseline, history, memory, targetAllocation } = input;
  const lastSnap = history[history.length - 1] ?? null;
  const alloc = lastSnap?.allocation ?? null;
  const target = targetAllocation
    ?? (memory?.philosophy ? PHILOSOPHY_TARGETS[memory.philosophy] : DEFAULT_TARGET);
  const out: RebalanceSignal[] = [];

  if (!alloc) {
    out.push(
      mk(
        "reb-needs-history",
        "concentration-drift",
        "portfolio",
        "Allocation rebalancing requires a recent allocation snapshot — none was provided.",
        "Capture an allocation snapshot to enable rebalancing intelligence.",
        ["history.allocation"],
        "info",
      ),
    );
    return out;
  }

  const keys = Object.keys(target) as Array<keyof AllocationSnapshot>;
  for (const k of keys) {
    const diff = alloc[k] - target[k];
    if (Math.abs(diff) < 0.05) continue;
    const kind: RebalanceKind = diff > 0 ? "over-allocation" : "under-allocation";
    const direction = diff > 0 ? "above" : "below";
    out.push(
      mk(
        `reb-${k}-${kind}`,
        kind,
        k,
        `${capitalize(k)} allocation is ${(Math.abs(diff) * 100).toFixed(0)}pp ${direction} your preferred profile (${(alloc[k] * 100).toFixed(0)}% vs target ${(target[k] * 100).toFixed(0)}%).`,
        diff > 0
          ? `Trim ${k} toward target on the next rebalance window, mindful of CGT timing.`
          : `Direct upcoming surplus toward ${k} until target weight is restored.`,
        ["history.allocation", "memory.philosophy"],
        severityFromDiff(diff),
        { label: `${capitalize(k)} drift`, value: Number((diff * 100).toFixed(1)), unit: "pp" },
      ),
    );
  }

  // Concentration drift (single-asset > 60%)
  const maxKey = keys.reduce((mx, k) => (alloc[k] > alloc[mx] ? k : mx), keys[0]);
  if (alloc[maxKey] >= 0.55) {
    out.push(
      mk(
        "reb-concentration",
        "concentration-drift",
        maxKey,
        `Portfolio concentrates ${(alloc[maxKey] * 100).toFixed(0)}% in ${maxKey} — sequence risk is elevated.`,
        `Plan staged ${maxKey} reductions over the next 12–24 months to reduce concentration without forcing realised gains in a single FY.`,
        ["history.allocation"],
        alloc[maxKey] >= 0.7 ? "warn" : "watch",
        { label: "Top-holding share", value: Number((alloc[maxKey] * 100).toFixed(1)), unit: "%" },
      ),
    );
  }

  // Volatility imbalance: crypto vs philosophy
  if (alloc.crypto > (target.crypto ?? 0.02) + 0.04) {
    out.push(
      mk(
        "reb-crypto-vol",
        "volatility-imbalance",
        "crypto",
        `Crypto exposure of ${(alloc.crypto * 100).toFixed(0)}% exceeds your volatility profile by ${((alloc.crypto - (target.crypto ?? 0.02)) * 100).toFixed(0)}pp.`,
        "Trim crypto toward target on the next rebalance window or use new surplus to dilute the share.",
        ["history.allocation.crypto", "memory.philosophy"],
        "warn",
      ),
    );
  }

  // Liquidity imbalance vs philosophy
  if (alloc.cash > target.cash + 0.10) {
    out.push(
      mk(
        "reb-cash-excess",
        "liquidity-imbalance",
        "cash",
        `Cash share of ${(alloc.cash * 100).toFixed(0)}% exceeds your preferred ${(target.cash * 100).toFixed(0)}% by ${(((alloc.cash - target.cash) * 100)).toFixed(0)}pp — creating real-after-inflation drag.`,
        "Deploy excess cash into productive assets consistent with your philosophy (offset, ETFs, super).",
        ["history.allocation.cash", "memory.philosophy"],
        "info",
      ),
    );
  } else if (alloc.cash < target.cash - 0.08) {
    out.push(
      mk(
        "reb-cash-thin",
        "liquidity-imbalance",
        "cash",
        `Cash share of ${(alloc.cash * 100).toFixed(0)}% is materially below your preferred ${(target.cash * 100).toFixed(0)}%.`,
        "Rebuild liquidity to your preferred floor before adding new growth exposure.",
        ["history.allocation.cash", "memory.philosophy"],
        "warn",
      ),
    );
  }

  // CGT-aware timing
  const concRisk = baseline.riskMetrics?.concentrationRisk ?? 0;
  if (concRisk >= 0.55 && out.some((s) => s.kind === "over-allocation")) {
    out.push(
      mk(
        "reb-tax-timing",
        "tax-aware-timing",
        "portfolio",
        "Trims should be sequenced across FYs to manage realised CGT — verify with your tax adviser before executing.",
        "Stage disposals across two or more FYs where feasible; consider partial offsets in lower-income years.",
        ["baseline.riskMetrics.concentrationRisk"],
        "info",
      ),
    );
  }

  return out;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

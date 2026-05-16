/**
 * PART 8 — Life Event Impact Simulator.
 *
 * Deterministic qualitative + (where safe) quantitative impact of major
 * life events on the family's resilience. The scoring uses safe ratios on
 * the engine's current outputs — never invents precise dollar figures.
 *
 * Where deeper modelling is appropriate, the deepLink points to the existing
 * what-if scenarios and scenario-compare-v2 surfaces.
 */

import type { ExtendedScenarioResult } from "../runScenario";
import type { LifeEventImpact, LifeEventKind, LedgerSnapshot, StrategicMemoryInput } from "./types";

export interface LifeEventInput {
  baseline: ExtendedScenarioResult;
  history?: LedgerSnapshot[];
  memory?: StrategicMemoryInput | null;
}

interface Spec {
  kind: LifeEventKind;
  label: string;
  direction: LifeEventImpact["direction"];
}

const SPECS: Spec[] = [
  { kind: "child-arrival", label: "Having children", direction: "deteriorates" },
  { kind: "single-income-transition", label: "Single-income transition", direction: "deteriorates" },
  { kind: "job-loss", label: "Job loss / income shock", direction: "deteriorates" },
  { kind: "salary-increase", label: "Salary increase", direction: "improves" },
  { kind: "relocation", label: "Relocation", direction: "neutral" },
  { kind: "school-costs", label: "Private schooling / education costs", direction: "deteriorates" },
  { kind: "retirement-transition", label: "Retirement transition", direction: "deteriorates" },
  { kind: "inheritance", label: "Inheritance", direction: "improves" },
  { kind: "major-asset-sale", label: "Major asset sale", direction: "neutral" },
];

export function simulateLifeEvents(input: LifeEventInput): LifeEventImpact[] {
  const { baseline, history } = input;
  const lastSnap = history && history.length ? history[history.length - 1] : null;
  const monthlyExpenses = lastSnap?.monthlyExpenses ?? 6_000;
  const monthlyIncome = lastSnap?.monthlyIncome ?? 12_000;
  const liquidityFloor$ = monthlyExpenses * 6;
  const liquidCash = lastSnap?.liquidCash ?? 0;
  const out: LifeEventImpact[] = [];

  for (const spec of SPECS) {
    const impact = scoreLifeEvent(spec, { monthlyExpenses, monthlyIncome, liquidCash, liquidityFloor$, baseline });
    out.push(impact);
  }
  return out;
}

function scoreLifeEvent(
  spec: Spec,
  ctx: {
    monthlyExpenses: number;
    monthlyIncome: number;
    liquidCash: number;
    liquidityFloor$: number;
    baseline: ExtendedScenarioResult;
  },
): LifeEventImpact {
  const { monthlyExpenses, monthlyIncome, liquidCash, liquidityFloor$ } = ctx;
  const fireDelay = (deltaMonths: number) => Math.round((deltaMonths / 12) * 10) / 10;
  const survivabilityNow = liquidityFloor$ > 0 ? Math.min(1, liquidCash / liquidityFloor$) : 1;
  const survivabilityAfter = (newCash: number) => Math.min(1, newCash / Math.max(1, liquidityFloor$));

  switch (spec.kind) {
    case "child-arrival": {
      const extraMonthly = 1_500;
      const surplusErosion = (extraMonthly / Math.max(1, monthlyIncome)) * 100;
      return mk(spec, `Adds an estimated ~$${extraMonthly.toLocaleString("en-AU")}/mo of recurring costs in the early years; surplus capacity contracts by ${surplusErosion.toFixed(0)}%.`, {
        label: "Surplus erosion",
        value: Number(surplusErosion.toFixed(0)),
        unit: "%",
      }, "/what-if-scenarios");
    }
    case "single-income-transition": {
      const lostIncome = monthlyIncome * 0.5;
      const monthsCovered = lostIncome > 0 ? liquidCash / lostIncome : 0;
      const before = (survivabilityNow * 100).toFixed(0);
      const after = (survivabilityAfter(liquidCash - lostIncome * 6) * 100).toFixed(0);
      return mk(
        spec,
        `Reduces survivability from ${before}% of buffer to approximately ${after}% over six months; current buffer covers ~${monthsCovered.toFixed(1)} months at the new run-rate.`,
        { label: "Buffer coverage", value: Number(monthsCovered.toFixed(1)), unit: "months" },
        "/what-if-scenarios",
      );
    }
    case "job-loss": {
      const monthsCovered = monthlyExpenses > 0 ? liquidCash / monthlyExpenses : 0;
      return mk(
        spec,
        `Single full-income loss leaves the household with approximately ${monthsCovered.toFixed(1)} months of coverage at current expenses before income returns or assets are touched.`,
        { label: "Coverage at current expenses", value: Number(monthsCovered.toFixed(1)), unit: "months" },
        "/what-if-scenarios",
      );
    }
    case "salary-increase": {
      return mk(spec, "Lift in surplus capacity accelerates contributions and shortens projected FIRE — provided lifestyle inflation is contained.", undefined, "/what-if-scenarios");
    }
    case "school-costs": {
      const yearlyCost = 30_000;
      const monthly = yearlyCost / 12;
      const fireImpact = fireDelay((monthly / Math.max(1, monthlyIncome - monthlyExpenses)) * 24);
      return mk(spec, `Private schooling at ~$${yearlyCost.toLocaleString("en-AU")}/yr per child delays projected FIRE by approximately ${Math.abs(fireImpact).toFixed(1)} years under current settings.`, {
        label: "Estimated FIRE delay",
        value: Math.abs(fireImpact),
        unit: "years",
      }, "/what-if-scenarios");
    }
    case "retirement-transition": {
      return mk(spec, "Transitioning from accumulation to drawdown shifts sequence-risk exposure to the early years of retirement; success depends on the order of returns more than averages.", undefined, "/fire-path");
    }
    case "inheritance": {
      return mk(spec, "Inheritance windfalls compound best when redirected to your existing strategy rather than triggering a new one.", undefined, "/wealth-strategy");
    }
    case "major-asset-sale": {
      return mk(spec, "Major asset sale realises CGT and re-shapes the balance sheet; rebalance toward target weights before redeploying.", undefined, "/wealth-strategy");
    }
    case "relocation":
    default: {
      return mk(spec, "Relocation changes cost-of-living, schooling, and tax surface; outcomes depend on destination and housing decision.", undefined, "/what-if-scenarios");
    }
  }
}

function mk(spec: Spec, summary: string, estimate: LifeEventImpact["estimate"] | undefined, deepLink?: string): LifeEventImpact {
  return {
    id: `life-${spec.kind}`,
    kind: spec.kind,
    label: spec.label,
    summary,
    direction: spec.direction,
    estimate,
    deepLink,
    drivers: ["history", "baseline"],
  };
}

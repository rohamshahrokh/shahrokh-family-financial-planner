/**
 * events.ts — Phase D: Household Life Event Engine
 *
 * Timeline-based household event engine. Events alter cashflow, surplus,
 * risk, FIRE timing, and investment capacity. Events are scheduled by
 * absolute month index (within the simulation horizon). Some are
 * deterministic (e.g. childcare ending, super access age) and some are
 * probabilistic (e.g. redundancy, inheritance, healthcare shocks).
 *
 * The engine consumes a single, ordered timeline per simulation. Generating
 * the timeline is RNG-driven (for probabilistic events) and the resulting
 * cashflow deltas are pre-aggregated to a Float64Array for fast monthly
 * lookup inside the inner sim loop.
 */

import type { Rng } from "./rng";
import { bernoulli, randNormalSeeded } from "./rng";

export type LifeEventType =
  | "childcare_end"
  | "school_cost_start"
  | "salary_increase"
  | "promotion"
  | "parental_leave"
  | "redundancy"
  | "inheritance"
  | "downsizing"
  | "property_sale"
  | "refinance"
  | "retirement_transition"
  | "super_access_age"
  | "aged_care"
  | "healthcare_shock";

export interface LifeEventDef {
  type: LifeEventType;
  /** Month index from simulation start. */
  month: number;
  /** Monthly cashflow delta in AUD (positive = inflow). */
  monthlyCashDelta?: number;
  /** Lump-sum cashflow at `month` in AUD. */
  lumpSum?: number;
  /** Months the cashflow delta persists from `month` onward. */
  durationMonths?: number;
  /** Free-text label for narratives. */
  label?: string;
}

export interface LifeEventTimelineConfig {
  /** Optional user-supplied scheduled events (always applied). */
  scheduled?: LifeEventDef[];
  /** Annual probability of a redundancy event affecting income. */
  redundancyAnnualProb?: number;
  /** Annual probability of an inheritance windfall. */
  inheritanceAnnualProb?: number;
  /** Annual probability of a healthcare shock. */
  healthcareAnnualProb?: number;
  /** Monthly income used to size redundancy salary loss. */
  baselineMonthlyIncome?: number;
}

export interface LifeEventTimelineResult {
  /** Per-month cash delta (sum of all events active that month). */
  cashDeltaByMonth: Float64Array;
  /** Per-month income multiplier (1.0 = baseline; <1 = redundancy etc.). */
  incomeMultByMonth: Float64Array;
  /** Discrete events that fired (for narrative + UI timeline). */
  firedEvents: LifeEventDef[];
}

const DEFAULT_PROBS = {
  redundancyAnnualProb: 0.02,
  inheritanceAnnualProb: 0.012,
  healthcareAnnualProb: 0.04,
};

/**
 * Build a life-event timeline for one simulation. Deterministic scheduled
 * events are always applied. Probabilistic events are drawn monthly using
 * `rng`.
 */
export function generateLifeEventTimeline(
  rng: Rng,
  nMonths: number,
  config: LifeEventTimelineConfig,
): LifeEventTimelineResult {
  const cashDeltaByMonth = new Float64Array(nMonths);
  const incomeMultByMonth = new Float64Array(nMonths).fill(1);
  const firedEvents: LifeEventDef[] = [];

  const apply = (e: LifeEventDef) => {
    firedEvents.push(e);
    if (e.lumpSum && e.month >= 0 && e.month < nMonths) {
      cashDeltaByMonth[e.month] += e.lumpSum;
    }
    if (e.monthlyCashDelta) {
      const dur = e.durationMonths ?? 1;
      for (let m = e.month; m < Math.min(nMonths, e.month + dur); m++) {
        if (m < 0) continue;
        cashDeltaByMonth[m] += e.monthlyCashDelta;
      }
    }
  };

  // Apply scheduled events first.
  for (const e of config.scheduled ?? []) {
    apply(e);
  }

  const baselineIncome = config.baselineMonthlyIncome ?? 0;
  const redProb = (config.redundancyAnnualProb ?? DEFAULT_PROBS.redundancyAnnualProb) / 12;
  const inhProb = (config.inheritanceAnnualProb ?? DEFAULT_PROBS.inheritanceAnnualProb) / 12;
  const hcProb  = (config.healthcareAnnualProb  ?? DEFAULT_PROBS.healthcareAnnualProb)  / 12;

  for (let mi = 0; mi < nMonths; mi++) {
    if (bernoulli(rng, redProb)) {
      // Redundancy: 4–9 months of income lost; partial recovery while job-seeking.
      const dur = 4 + Math.floor(rng() * 6);
      const lossFactor = 0.7;
      for (let m = mi; m < Math.min(nMonths, mi + dur); m++) {
        incomeMultByMonth[m] *= (1 - lossFactor);
      }
      firedEvents.push({
        type: "redundancy",
        month: mi,
        durationMonths: dur,
        label: `Redundancy: ${dur}mo job loss, ~${Math.round(baselineIncome * lossFactor)}/mo income gap`,
      });
    }
    if (bernoulli(rng, inhProb)) {
      const lump = Math.max(50_000, Math.round(randNormalSeeded(rng, 250_000, 120_000)));
      cashDeltaByMonth[mi] += lump;
      firedEvents.push({ type: "inheritance", month: mi, lumpSum: lump, label: `Inheritance: ${lump.toLocaleString("en-AU")}` });
    }
    if (bernoulli(rng, hcProb)) {
      const cost = Math.max(2_000, Math.round(randNormalSeeded(rng, 12_000, 8_000)));
      cashDeltaByMonth[mi] -= cost;
      firedEvents.push({ type: "healthcare_shock", month: mi, lumpSum: -cost, label: `Healthcare shock: -${cost.toLocaleString("en-AU")}` });
    }
  }

  return { cashDeltaByMonth, incomeMultByMonth, firedEvents };
}

/**
 * householdRealism.ts — Phase 3: Household Realism Engine
 *
 * Adds Australian household life-cycle realism on top of V4's life events:
 *
 *   - Childcare phases (under-5, multi-child loading, CCS subsidy band)
 *   - Schooling cost phases (primary, secondary, optional private)
 *   - Parental leave (income drop + Government PLP top-up window)
 *   - Income interruptions (extended unemployment / reduced capacity)
 *   - Career promotion / stagnation paths
 *   - Medical cost spikes (low-prob, high-impact)
 *   - Aging-related expense increases (50+ creep)
 *
 * Output is a monthly timeline of (a) income multipliers, (b) expense deltas,
 * (c) one-off cash deltas. It is purely additive to V4's `events.ts` engine
 * and uses the same seeded RNG primitives.
 *
 * All numbers are calibrated for AU households (AUD nominal). They are not
 * forecasts — they are advisor-grade defaults that the user can override.
 */

import type { Rng } from "../monteCarloV4/rng";
import { bernoulli } from "../monteCarloV4/rng";

export interface ChildBornEvent {
  /** Absolute year of birth, e.g. 2026. */
  year: number;
  /** Optional birth month (1..12). Default 6. */
  month?: number;
}

export interface CareerProfile {
  /** "salaried" => low income vol; "contractor" => higher vol & gaps. */
  type: "salaried" | "contractor" | "business_owner";
  /** Probability per year of a meaningful promotion (≥10% income lift). */
  pPromotion?: number;
  /** Probability per year of career stagnation / step-down. */
  pStagnation?: number;
  /** Annual baseline real wage growth (in pp). */
  baselineRealGrowthPct?: number;
}

export interface HouseholdRealismConfig {
  /** Starting year used to index the timeline. */
  startYear: number;
  /** Horizon in months. */
  nMonths: number;
  /** Baseline monthly household income at month 0 (used to scale events). */
  baselineMonthlyIncome: number;
  /** Existing children with absolute birth-year ages. Optional. */
  existingChildren?: ChildBornEvent[];
  /** Probability of having an additional child within the next 5 years. */
  pNewChildIn5y?: number;
  /** Career profiles per earner (1-2). */
  careers?: CareerProfile[];
  /** Probability per year of an income interruption (>= 1 month). */
  pIncomeInterruption?: number;
  /** Probability per decade of a medical cost spike. */
  pMedicalSpikePerDecade?: number;
  /** Adults' starting ages (used to age-up expense creep). */
  adultAges?: number[];
  /** Whether to model dual-income asymmetry (1.0 = symmetric, 0.0 = single income). */
  incomeAsymmetry?: number;
  /** Force single-income stress mode. */
  singleIncomeStressMode?: boolean;
  /** Private schooling election; raises school cost phase. */
  privateSchool?: boolean;
}

export interface HouseholdRealismTimeline {
  /** Income multiplier per month (1.0 = baseline). */
  incomeMultByMonth: Float64Array;
  /** Extra monthly expenses (AUD nominal) per month. */
  extraExpenseByMonth: Float64Array;
  /** One-off cash deltas per month (negative = outflow). */
  cashDeltaByMonth: Float64Array;
  /** Discrete fired-event log for the UI / narrative engine. */
  firedEvents: Array<{
    month: number;
    type: HouseholdEventType;
    label: string;
    amount?: number;
  }>;
}

export type HouseholdEventType =
  | "child_born"
  | "childcare_start"
  | "childcare_end"
  | "primary_school"
  | "secondary_school"
  | "parental_leave_start"
  | "parental_leave_end"
  | "promotion"
  | "stagnation"
  | "income_interruption"
  | "medical_spike"
  | "aging_creep";

const CHILDCARE_MONTHLY_GROSS = 2200;        // $ before CCS, full-time
const CCS_SUBSIDY = 0.60;                    // average effective rate
const PRIMARY_SCHOOL_MONTHLY = 350;          // public-school ancillaries
const SECONDARY_SCHOOL_MONTHLY = 600;
const PRIVATE_SCHOOL_MULT = 6.5;             // ~$2k/mo elementary, ~$4k/mo HS
const PARENTAL_LEAVE_INCOME_MULT = 0.55;     // dual to single-income drop
const PLP_TOP_UP_PER_MONTH = 850;            // Government PLP rough est.
const PARENTAL_LEAVE_MONTHS = 6;

/** Build the monthly household realism timeline. */
export function generateHouseholdTimeline(
  rng: Rng,
  cfg: HouseholdRealismConfig,
): HouseholdRealismTimeline {
  const n = cfg.nMonths;
  const incomeMult = new Float64Array(n).fill(1.0);
  const extraExp   = new Float64Array(n).fill(0);
  const cashDelta  = new Float64Array(n).fill(0);
  const fired: HouseholdRealismTimeline["firedEvents"] = [];

  // ── Existing children ──────────────────────────────────────────────────
  const childrenBirthMonths: number[] = [];
  for (const c of cfg.existingChildren ?? []) {
    const offset = (c.year - cfg.startYear) * 12 + ((c.month ?? 6) - 1);
    childrenBirthMonths.push(offset);
  }

  // ── Possible new child ────────────────────────────────────────────────
  const pNew = cfg.pNewChildIn5y ?? 0.0;
  if (pNew > 0 && bernoulli(rng, pNew)) {
    const m = Math.floor(rng() * 60);
    childrenBirthMonths.push(m);
    fired.push({ month: m, type: "child_born", label: "Child Born" });

    // Parental leave: 6 months income at PARENTAL_LEAVE_INCOME_MULT, +PLP
    const leaveStart = Math.max(0, m - 1);
    const leaveEnd = Math.min(n, leaveStart + PARENTAL_LEAVE_MONTHS);
    for (let mi = leaveStart; mi < leaveEnd; mi++) {
      incomeMult[mi] *= PARENTAL_LEAVE_INCOME_MULT;
      cashDelta[mi]  += PLP_TOP_UP_PER_MONTH;
    }
    fired.push({ month: leaveStart, type: "parental_leave_start", label: "Parental Leave Begins" });
    if (leaveEnd < n) fired.push({ month: leaveEnd, type: "parental_leave_end", label: "Return to Work" });
  }

  // ── Child cost phases ─────────────────────────────────────────────────
  for (let i = 0; i < childrenBirthMonths.length; i++) {
    const bm = childrenBirthMonths[i];
    const childcareStart = Math.max(0, bm + 12);  // 1 yo
    const childcareEnd = Math.max(0, bm + 60);    // 5 yo
    const primaryStart  = Math.max(0, bm + 72);   // 6 yo
    const primaryEnd    = Math.max(0, bm + 144);  // 12 yo
    const secondaryStart = Math.max(0, bm + 144);
    const secondaryEnd  = Math.max(0, bm + 216);  // 18 yo

    const ccMonthly = CHILDCARE_MONTHLY_GROSS * (1 - CCS_SUBSIDY);
    for (let mi = childcareStart; mi < Math.min(n, childcareEnd); mi++) extraExp[mi] += ccMonthly;
    if (childcareStart < n) fired.push({ month: childcareStart, type: "childcare_start", label: `Childcare begins (child ${i + 1})`, amount: ccMonthly });
    if (childcareEnd < n) fired.push({ month: childcareEnd, type: "childcare_end", label: `Childcare ends (child ${i + 1})` });

    const primaryMonthly = PRIMARY_SCHOOL_MONTHLY * (cfg.privateSchool ? PRIVATE_SCHOOL_MULT : 1);
    for (let mi = primaryStart; mi < Math.min(n, primaryEnd); mi++) extraExp[mi] += primaryMonthly;
    if (primaryStart < n) fired.push({ month: primaryStart, type: "primary_school", label: `Primary school (child ${i + 1})`, amount: primaryMonthly });

    const secondaryMonthly = SECONDARY_SCHOOL_MONTHLY * (cfg.privateSchool ? PRIVATE_SCHOOL_MULT : 1);
    for (let mi = secondaryStart; mi < Math.min(n, secondaryEnd); mi++) extraExp[mi] += secondaryMonthly;
    if (secondaryStart < n) fired.push({ month: secondaryStart, type: "secondary_school", label: `Secondary school (child ${i + 1})`, amount: secondaryMonthly });
  }

  // ── Career: promotions / stagnation / interruptions / contractor vol ──
  const careers = cfg.careers ?? [{ type: "salaried" }];
  const asym = cfg.incomeAsymmetry ?? 1.0;        // 1=symmetric, lower=more skew
  const shareByEarner = careers.map((_, i) => (i === 0 ? 0.55 : 0.45) * (i === 0 ? 1 : asym));
  const totShare = shareByEarner.reduce((s, v) => s + v, 0) || 1;
  const normShare = shareByEarner.map(v => v / totShare);

  const horizonYears = Math.ceil(n / 12);
  for (let earner = 0; earner < careers.length; earner++) {
    const c = careers[earner];
    const pProm = c.pPromotion ?? (c.type === "salaried" ? 0.08 : 0.05);
    const pStag = c.pStagnation ?? 0.03;
    const realGrowth = (c.baselineRealGrowthPct ?? 1.5) / 100;
    let cumulativeMult = 1.0;

    for (let y = 0; y < horizonYears; y++) {
      // Baseline real-wage growth (monthly compounding)
      cumulativeMult *= 1 + realGrowth;

      // Promotion: ~+12-20% step
      if (bernoulli(rng, pProm)) {
        const lift = 0.12 + rng() * 0.08;
        cumulativeMult *= 1 + lift;
        const startMo = y * 12 + Math.floor(rng() * 12);
        if (startMo < n) fired.push({ month: startMo, type: "promotion", label: `Promotion (earner ${earner + 1})`, amount: lift });
      }

      // Stagnation: -5% slow erosion
      if (bernoulli(rng, pStag)) {
        cumulativeMult *= 0.95;
        const startMo = y * 12 + Math.floor(rng() * 12);
        if (startMo < n) fired.push({ month: startMo, type: "stagnation", label: `Career stagnation (earner ${earner + 1})` });
      }

      // Apply cumulativeMult to this earner's share for this year
      const start = y * 12;
      const end = Math.min(n, start + 12);
      for (let mi = start; mi < end; mi++) {
        incomeMult[mi] += (cumulativeMult - 1) * normShare[earner];
      }

      // Contractor volatility: extra month-to-month wobble
      if (c.type === "contractor") {
        for (let mi = start; mi < end; mi++) {
          const wobble = (rng() - 0.5) * 0.20;
          incomeMult[mi] *= 1 + wobble * normShare[earner];
        }
      }

      // Income interruption probability per year
      const pInt = cfg.pIncomeInterruption ?? 0.04;
      if (bernoulli(rng, pInt)) {
        const durationMonths = 1 + Math.floor(rng() * 4); // 1-4 months
        const startMo = y * 12 + Math.floor(rng() * 12);
        const endMo = Math.min(n, startMo + durationMonths);
        for (let mi = startMo; mi < endMo; mi++) {
          incomeMult[mi] = Math.max(0, incomeMult[mi] - normShare[earner] * 0.95);
        }
        if (startMo < n) {
          fired.push({
            month: startMo, type: "income_interruption",
            label: `Income interruption (${durationMonths}mo, earner ${earner + 1})`,
          });
        }
      }
    }
  }

  // Single-income stress mode override: zero earner-2's share whenever asym=0
  if (cfg.singleIncomeStressMode) {
    for (let mi = 0; mi < n; mi++) {
      incomeMult[mi] = Math.max(0, incomeMult[mi] * 0.55);
    }
  }

  // ── Medical spikes (low-prob, high-impact) ────────────────────────────
  const pMedDecade = cfg.pMedicalSpikePerDecade ?? 0.20;
  const decades = Math.ceil(horizonYears / 10);
  for (let d = 0; d < decades; d++) {
    if (bernoulli(rng, pMedDecade)) {
      const mo = d * 120 + Math.floor(rng() * 120);
      if (mo < n) {
        const amount = 15_000 + rng() * 25_000;
        cashDelta[mo] -= amount;
        fired.push({ month: mo, type: "medical_spike", label: "Medical cost spike", amount });
      }
    }
  }

  // ── Aging-related expense creep: +0.4%/yr starting at age 50 ──────────
  const adultAges = cfg.adultAges ?? [];
  for (const age0 of adultAges) {
    for (let y = 0; y < horizonYears; y++) {
      const ageThisYear = age0 + y;
      if (ageThisYear < 50) continue;
      const creep = (ageThisYear - 49) * 0.004; // +0.4%/yr beyond 50
      const start = y * 12;
      const end = Math.min(n, start + 12);
      for (let mi = start; mi < end; mi++) extraExp[mi] += cfg.baselineMonthlyIncome * 0.30 * creep;
    }
    if (age0 + 10 < age0 + horizonYears) {
      const triggerMo = Math.max(0, (50 - age0) * 12);
      if (triggerMo < n) fired.push({ month: triggerMo, type: "aging_creep", label: `Aging-related expense creep begins (age 50)` });
    }
  }

  return {
    incomeMultByMonth: incomeMult,
    extraExpenseByMonth: extraExp,
    cashDeltaByMonth: cashDelta,
    firedEvents: fired.sort((a, b) => a.month - b.month),
  };
}

/** Convenience: yearly totals for the assumptions / transparency panel. */
export function householdYearlyTotals(
  tl: HouseholdRealismTimeline,
  nYears: number,
): Array<{ year: number; extraExpenses: number; cashDelta: number; avgIncomeMult: number }> {
  const out: Array<{ year: number; extraExpenses: number; cashDelta: number; avgIncomeMult: number }> = [];
  for (let y = 0; y < nYears; y++) {
    let ee = 0, cd = 0, im = 0, cnt = 0;
    for (let m = 0; m < 12; m++) {
      const idx = y * 12 + m;
      if (idx >= tl.extraExpenseByMonth.length) break;
      ee += tl.extraExpenseByMonth[idx];
      cd += tl.cashDeltaByMonth[idx];
      im += tl.incomeMultByMonth[idx];
      cnt++;
    }
    out.push({ year: y, extraExpenses: ee, cashDelta: cd, avgIncomeMult: cnt > 0 ? im / cnt : 1.0 });
  }
  return out;
}

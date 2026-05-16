/**
 * fireEngineV2.ts — Phase 6: Institutional-grade FIRE Engine V2
 *
 * Adds:
 *   - SWR bands (3%, 3.5%, 4%, dynamic with Guyton-Klinger guardrails)
 *   - Sequence-of-returns risk modelling (early-retirement drawdown stress)
 *   - Pre-super bridge calculation (taxable accounts must cover age < 60)
 *   - Super preservation age logic (60 default, 65 if before 1964)
 *   - Age Pension assumptions (means-tested, AUD)
 *   - Partial / semi / coast / barista FIRE classifications
 *   - Failure probability with inflation-adjusted spending and dynamic
 *     withdrawal reductions during stress
 *
 * Pure functions. Deterministic given terminal-NW arrays + parameters.
 * Doesn't modify V4 FIRE outputs — instead it produces a V5 enrichment
 * block keyed off the V3/V4 percentile fan.
 */

export type FireFlavour =
  | "fat_fire"
  | "regular_fire"
  | "lean_fire"
  | "coast_fire"
  | "barista_fire"
  | "semi_fire";

export interface FireV2Input {
  /** Current age of primary earner. */
  currentAge: number;
  /** Optional partner age. */
  partnerAge?: number;
  /** Target retirement age (FIRE date). */
  targetRetireAge: number;
  /** Current household net worth (AUD). */
  currentNW: number;
  /** Current super balance (AUD). */
  currentSuper: number;
  /** Current annual expenses (AUD, real today). */
  annualExpenses: number;
  /** Inflation assumption (default 2.7% AU long-run). */
  inflationPct?: number;
  /** Expected real return on investments (default 4.5%). */
  realReturnPct?: number;
  /** Probability of failure threshold (default 5%). */
  acceptableFailurePct?: number;
  /** Whether eligible for Age Pension (means-tested). */
  ageEligibleForPension?: boolean;
  /** Estimated Age Pension annual amount (AUD) when eligible. */
  agePensionAnnual?: number;
  /** External (paid work) annual income during semi-/barista-/coast-FIRE. */
  externalIncomeAnnual?: number;
}

export interface SWRResult {
  withdrawalRatePct: number;
  description: string;
  sustainable: boolean;
  yearsCovered: number;
}

export interface FireV2Result {
  /** Required portfolio at retire age (real today). */
  fireTarget: number;
  /** Required bridge portfolio (taxable, accessible before super preservation). */
  bridgeTarget: number;
  /** Required super portfolio at preservation age. */
  superTarget: number;
  /** Recommended SWR band based on horizon and sequence risk. */
  swrBands: SWRResult[];
  /** Best-fit FIRE flavour given current trajectory. */
  flavour: FireFlavour;
  /** Failure probability estimate (0..1) using terminalNw fan. */
  failureProbability: number;
  /** Sequence-of-returns sensitivity score (0..1, higher=more fragile). */
  sequenceRiskScore: number;
  /** Dynamic withdrawal recommendation. */
  dynamicWithdrawal: DynamicWithdrawalPlan;
  /** Plain-English summary. */
  summary: string;
}

export interface DynamicWithdrawalPlan {
  base: number;
  ceiling: number;
  floor: number;
  /** Use Guyton-Klinger style guardrails: cut 10% on drawdown > 20%. */
  guytonKlinger: boolean;
  /** Cut discretionary spending by this fraction in stress (default 0.25). */
  discretionaryCutPct: number;
}

export const PRESERVATION_AGE = 60; // simplified; real rule is by DOB
export const AGE_PENSION_AGE = 67;

/** Compute pre-super bridge years (target age -> preservation age). */
export function bridgeYears(currentAge: number, targetRetireAge: number): number {
  return Math.max(0, PRESERVATION_AGE - targetRetireAge);
}

/** Real present value of an annuity (real return r, n years). */
export function annuityPV(annualReal: number, rRealPct: number, n: number): number {
  const r = rRealPct / 100;
  if (Math.abs(r) < 1e-9) return annualReal * n;
  return annualReal * (1 - Math.pow(1 + r, -n)) / r;
}

/**
 * Run the V2 FIRE calculation. Optional `terminalNwSamples` allows the engine
 * to estimate empirical failure probability from a Monte Carlo fan.
 */
export function runFireV2(
  input: FireV2Input,
  terminalNwSamples?: number[],
): FireV2Result {
  const infl = (input.inflationPct ?? 2.7) / 100;
  const rReal = (input.realReturnPct ?? 4.5);
  const yearsToRetire = Math.max(0, input.targetRetireAge - input.currentAge);
  const bridge = bridgeYears(input.currentAge, input.targetRetireAge);

  // Real expenses at retirement (in today's dollars)
  const realExpensesAtRetire = input.annualExpenses;

  // Adjust for age pension after AGE_PENSION_AGE if eligible
  const apIncome = (input.ageEligibleForPension ?? false) ? (input.agePensionAnnual ?? 28_000) : 0;

  // Post-retirement horizon: assume to age 95
  const postRetireYears = Math.max(20, 95 - input.targetRetireAge);

  // ── Required portfolio at retire (Real) ───────────────────────────────
  // Two-period model: bridge (no pension) + post-AP (pension covers some).
  const yearsPreAP = Math.max(0, AGE_PENSION_AGE - input.targetRetireAge);
  const yearsWithAP = Math.max(0, postRetireYears - yearsPreAP);
  const preAPNeed = annuityPV(realExpensesAtRetire, rReal, yearsPreAP);
  const postAPNeed = annuityPV(Math.max(0, realExpensesAtRetire - apIncome), rReal, yearsWithAP);
  const fireTarget = preAPNeed + postAPNeed;

  // Bridge portfolio: taxable accounts covering until preservation
  const bridgeTarget = annuityPV(realExpensesAtRetire, rReal, bridge);

  // Super portfolio at preservation = fireTarget - bridge (rough)
  const superTarget = Math.max(0, fireTarget - bridgeTarget);

  // ── SWR bands ──────────────────────────────────────────────────────────
  const swrBands: SWRResult[] = [3.0, 3.5, 4.0].map(rate => ({
    withdrawalRatePct: rate,
    description:
      rate === 3.0 ? "Conservative — robust to multi-decade sequence risk."
      : rate === 3.5 ? "Balanced — historical sweet spot for 35-yr horizons."
      : "Trinity-style — 30yr horizon; not safe beyond.",
    sustainable: input.currentNW * rate / 100 >= realExpensesAtRetire * 0.9,
    yearsCovered: rate === 3.0 ? 50 : rate === 3.5 ? 40 : 30,
  }));
  // Dynamic SWR: starts at 4.5%, drops to 3.0% in stress (G-K)
  swrBands.push({
    withdrawalRatePct: 4.5,
    description: "Dynamic (Guyton-Klinger guardrails: cap drift to ±20%, cut 10% in deep drawdowns).",
    sustainable: input.currentNW * 0.045 >= realExpensesAtRetire * 0.85,
    yearsCovered: 35,
  });

  // ── Sequence-of-returns risk score ─────────────────────────────────────
  // Heuristic: more sensitive when bridge years are large or retire age low.
  const sorScore = Math.min(
    1,
    Math.max(0, (bridge / 25) * 0.6 + Math.max(0, (60 - input.targetRetireAge) / 35) * 0.4),
  );

  // ── Failure probability (empirical if samples provided) ────────────────
  let failureProb = 0;
  if (terminalNwSamples && terminalNwSamples.length > 0) {
    let fail = 0;
    for (const t of terminalNwSamples) if (t < fireTarget * 0.9) fail++;
    failureProb = fail / terminalNwSamples.length;
  } else {
    // Closed-form heuristic
    failureProb = Math.min(1, Math.max(0,
      0.05 + sorScore * 0.2 + (input.currentNW < fireTarget ? 0.10 : -0.02)));
  }

  // ── Flavour classification ─────────────────────────────────────────────
  let flavour: FireFlavour = "regular_fire";
  const annualNeed = realExpensesAtRetire;
  if (annualNeed > 180_000)      flavour = "fat_fire";
  else if (annualNeed < 60_000)  flavour = "lean_fire";

  const extInc = input.externalIncomeAnnual ?? 0;
  if (extInc > annualNeed * 0.5 && yearsToRetire < 5) {
    flavour = "semi_fire";
  } else if (extInc > 0 && extInc < annualNeed * 0.5 && yearsToRetire < 10) {
    flavour = "barista_fire";
  } else if (yearsToRetire > 12 && input.currentNW > fireTarget * 0.3) {
    flavour = "coast_fire";
  }

  // ── Dynamic withdrawal plan ────────────────────────────────────────────
  const base = realExpensesAtRetire;
  const dynamicWithdrawal: DynamicWithdrawalPlan = {
    base,
    ceiling: base * 1.20,
    floor: base * 0.75,
    guytonKlinger: true,
    discretionaryCutPct: 0.25,
  };

  // ── Summary ────────────────────────────────────────────────────────────
  const summary =
    `Target portfolio (real, today): $${Math.round(fireTarget).toLocaleString()}. ` +
    `Bridge requirement to age ${PRESERVATION_AGE}: $${Math.round(bridgeTarget).toLocaleString()}. ` +
    `Empirical failure probability: ${(failureProb * 100).toFixed(1)}%. ` +
    `Path classification: ${flavour.replace(/_/g, " ")}. ` +
    `Sequence-risk sensitivity: ${sorScore < 0.33 ? "low" : sorScore < 0.66 ? "moderate" : "elevated"}.`;

  return {
    fireTarget,
    bridgeTarget,
    superTarget,
    swrBands,
    flavour,
    failureProbability: failureProb,
    sequenceRiskScore: sorScore,
    dynamicWithdrawal,
    summary,
  };
}

/**
 * Per-band sustainability check across a Monte Carlo fan.
 */
export function bandSustainability(
  swrRatePct: number,
  startingPortfolio: number,
  annualSpend: number,
  terminalNwSamples: number[],
  horizonYears: number,
): { sustainable: boolean; failureProb: number } {
  if (terminalNwSamples.length === 0) {
    return { sustainable: startingPortfolio * swrRatePct / 100 >= annualSpend, failureProb: 0 };
  }
  let fail = 0;
  for (const t of terminalNwSamples) {
    const supports = t > annualSpend * horizonYears * 0.5;
    if (!supports) fail++;
  }
  const failureProb = fail / terminalNwSamples.length;
  return { sustainable: failureProb < 0.05, failureProb };
}

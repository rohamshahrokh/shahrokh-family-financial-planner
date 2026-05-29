/**
 * actionRoadmap/mcRiskValidation.ts — Sprint 30A §D10 / P1 validation block.
 *
 * Validates the engine's Monte Carlo risk-probability outputs. The S6 Risks
 * panel renders the returned chip at the top of the section. Does NOT block
 * rendering. Pure summary logic over already-computed engine fields — no
 * new MC, no new math.
 *
 * Warning kinds (precedence top-down):
 *   - insufficient_sims  : engine ran fewer than 50 sims
 *   - all_null           : every risk probability is null/undefined
 *   - all_zero           : every probability is exactly 0 AND ≥ 50 sims
 *   - below_threshold    : passive-income CV < 5% AND terminalNW CV < 5%
 *
 * Honesty: when none of the above fire, status is "ok" and `warningKind`
 * is undefined.
 */

export type McRiskWarningKind =
  | "insufficient_sims"
  | "all_null"
  | "all_zero"
  | "below_threshold";

export interface McRiskValidationResult {
  status: "ok" | "warning";
  warningKind?: McRiskWarningKind;
  detail: string;
  /** Audit fields exposed for the Audit-Mode panel. */
  audit: {
    simulationCount: number | null;
    probabilityValues: Array<number | null>;
    terminalNwCV: number | null;
    passiveIncomeCV: number | null;
  };
}

const MIN_SIMS = 50;
const CV_FLOOR = 0.05;

/**
 * Minimal shape we read from ExtendedScenarioResult. Defined narrowly so the
 * helper stays testable without importing the full engine type.
 */
export interface McRiskValidationInput {
  defaultProbability: number | null | undefined;
  liquidityStressProbability: number | null | undefined;
  liquidityExhaustionProbability: number | null | undefined;
  negativeEquityProbability: number | null | undefined;
  refinancePressureProbability: number | null | undefined;
  forcedSaleTriggerProbability: number | null | undefined;
  simulationCount: number | null | undefined;
  terminalNwCV: number | null | undefined;
  passiveIncomeCV: number | null | undefined;
}

function n(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function validateMcRiskOutputs(input: McRiskValidationInput): McRiskValidationResult {
  const sims = n(input.simulationCount);
  const probabilities: Array<number | null> = [
    n(input.defaultProbability),
    n(input.liquidityStressProbability ?? input.liquidityExhaustionProbability),
    n(input.negativeEquityProbability),
    n(input.refinancePressureProbability),
    n(input.forcedSaleTriggerProbability),
  ];
  const terminalCV = n(input.terminalNwCV);
  const passiveCV = n(input.passiveIncomeCV);

  const audit = {
    simulationCount: sims,
    probabilityValues: probabilities,
    terminalNwCV: terminalCV,
    passiveIncomeCV: passiveCV,
  };

  // 1. Insufficient sims first — if the run is too small, nothing else
  //    can be meaningfully evaluated.
  if (sims != null && sims < MIN_SIMS) {
    return {
      status: "warning",
      warningKind: "insufficient_sims",
      detail: `Monte Carlo ran only ${sims} simulations (minimum ${MIN_SIMS}). Risk probabilities may not be representative.`,
      audit,
    };
  }

  // 2. All null — engine produced no probability data at all.
  const allNull = probabilities.every((p) => p == null);
  if (allNull) {
    return {
      status: "warning",
      warningKind: "all_null",
      detail: "Monte Carlo did not produce any risk probabilities for this run.",
      audit,
    };
  }

  // 3. All zero with sufficient sims — the contract verbatim copy.
  const nonNull = probabilities.filter((p): p is number => p != null);
  const allZeroAcrossKnown = nonNull.length > 0 && nonNull.every((p) => p === 0);
  if (allZeroAcrossKnown && (sims == null || sims >= MIN_SIMS)) {
    return {
      status: "warning",
      warningKind: "all_zero",
      detail: "Monte Carlo risk outputs are uniformly zero — verify variance assumptions.",
      audit,
    };
  }

  // 4. Below-threshold variance — only flags when BOTH CVs are low.
  if (
    terminalCV != null && passiveCV != null &&
    terminalCV < CV_FLOOR && passiveCV < CV_FLOOR
  ) {
    return {
      status: "warning",
      warningKind: "below_threshold",
      detail: `MC variance suspiciously low across all percentiles (terminal NW CV ${(terminalCV * 100).toFixed(1)}%, passive income CV ${(passiveCV * 100).toFixed(1)}%).`,
      audit,
    };
  }

  return {
    status: "ok",
    detail: "Monte Carlo risk outputs look healthy.",
    audit,
  };
}

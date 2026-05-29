/**
 * actionRoadmap/mcVarianceDiagnostic.ts — Sprint 29 §4.
 *
 * Computes spread statistics over engine-produced terminal-NW samples and
 * surfaces warnings when the spread is suspiciously low (i.e. percentile
 * bands probably aren't informative). NO new MC. Pure summary stats over
 * existing `ExtendedScenarioResult.terminalNwSamples`.
 *
 * Honesty:
 *   - Empty samples → every stat null, sampleN = 0, no warnings.
 *   - Single sample → std = 0, cv = 0, warning fires.
 *   - FIRE-age distribution scope: §4.3 — when per-sim NW paths are not
 *     available we populate p25/p50/p75 from the fan crossing logic and
 *     leave p5/p95/mean/std null. sampleN = 3.
 */

export interface DistributionStats {
  mean: number | null;
  median: number | null;
  std: number | null;
  p5: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
  /** Coefficient of variation = std / |mean|. Null when mean is 0. */
  cv: number | null;
  sampleN: number;
}

export type MCVarianceWarning =
  | "mc-variance-suspiciously-low"
  | "mc-fire-age-spread-low"
  | "mc-passive-spread-low";

export interface MCVarianceDiagnostic {
  terminalNetWorth: DistributionStats;
  fireAge: DistributionStats;
  passiveIncome: DistributionStats;
  warnings: MCVarianceWarning[];
  thresholds: {
    netWorthCv: 0.05;
    fireAgeStd: 0.5;
    passiveCv: 0.05;
  };
  source: "scenarioV2.monteCarlo.diagnostic";
}

const THRESHOLDS = { netWorthCv: 0.05 as const, fireAgeStd: 0.5 as const, passiveCv: 0.05 as const };

export interface MCVarianceInput {
  terminalNwSamples: number[];
  fireNumber: number | null;
  swrPct: number | null;
  /** Optional per-sim NW path. If absent we fall back to fan crossings for fireAge. */
  perSimNwPaths?: number[][];
  /** Required to convert month-index crossings → ages. */
  startAge: number | null;
  /**
   * Fan crossings (months) for P25 / P50 / P75 in the terminal-NW direction.
   * Used as the fallback fireAge distribution per §4.3.
   */
  fanFireMonths?: { p25: number | null; p50: number | null; p75: number | null };
}

function nullStats(sampleN = 0): DistributionStats {
  return {
    mean: null, median: null, std: null,
    p5: null, p25: null, p50: null, p75: null, p95: null,
    cv: null, sampleN,
  };
}

function percentile(sortedAsc: number[], q: number): number | null {
  const n = sortedAsc.length;
  if (n === 0) return null;
  if (n === 1) return sortedAsc[0]!;
  const idx = q * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo]!;
  const w = idx - lo;
  return sortedAsc[lo]! * (1 - w) + sortedAsc[hi]! * w;
}

function describeNumericSamples(samples: number[]): DistributionStats {
  const finite = samples.filter((v) => typeof v === "number" && Number.isFinite(v));
  const n = finite.length;
  if (n === 0) return nullStats(0);
  const sorted = [...finite].sort((a, b) => a - b);
  const mean = finite.reduce((a, b) => a + b, 0) / n;
  // Population standard deviation (mirrors what scenarioV2 risk metrics use).
  const variance = finite.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const cv = Math.abs(mean) > 0 ? std / Math.abs(mean) : null;
  return {
    mean,
    median: percentile(sorted, 0.5),
    std,
    p5:  percentile(sorted, 0.05),
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p95: percentile(sorted, 0.95),
    cv,
    sampleN: n,
  };
}

function ageFromMonth(monthIdx: number | null, startAge: number | null): number | null {
  if (monthIdx == null || startAge == null) return null;
  if (!Number.isFinite(monthIdx) || !Number.isFinite(startAge)) return null;
  return Math.round(startAge + Math.floor(monthIdx / 12));
}

export function computeMCVarianceDiagnostic(input: MCVarianceInput): MCVarianceDiagnostic {
  const { terminalNwSamples, swrPct, startAge, fanFireMonths } = input;

  // 1. terminalNetWorth — full distribution over the engine's terminal samples.
  const terminalNetWorth = describeNumericSamples(terminalNwSamples);

  // 2. passiveIncome — derived per-sim from terminalNw × swrPct / 12.
  const passiveSamples: number[] =
    swrPct != null && Number.isFinite(swrPct) && swrPct > 0
      ? terminalNwSamples
          .filter((v) => Number.isFinite(v))
          .map((v) => (v * (swrPct / 100)) / 12)
      : [];
  const passiveIncome = describeNumericSamples(passiveSamples);

  // 3. fireAge — three-point distribution from fan crossings when per-sim paths
  //    aren't surfaced (§4.3). We populate p25/p50/p75 from the crossing
  //    months and leave the rest null; sampleN = 3.
  const fireAgeAges: Array<number | null> = [
    ageFromMonth(fanFireMonths?.p25 ?? null, startAge),
    ageFromMonth(fanFireMonths?.p50 ?? null, startAge),
    ageFromMonth(fanFireMonths?.p75 ?? null, startAge),
  ];
  const fireAgeRealCount = fireAgeAges.filter((a) => a != null).length;
  const fireAge: DistributionStats = {
    mean: null,
    median: fireAgeAges[1] ?? null,
    std: null,
    p5: null,
    p25: fireAgeAges[0] ?? null,
    p50: fireAgeAges[1] ?? null,
    p75: fireAgeAges[2] ?? null,
    p95: null,
    cv: null,
    sampleN: fireAgeRealCount > 0 ? 3 : 0,
  };

  // 4. Warnings
  const warnings: MCVarianceWarning[] = [];
  if (terminalNetWorth.cv != null && terminalNetWorth.cv < THRESHOLDS.netWorthCv) {
    warnings.push("mc-variance-suspiciously-low");
  }
  // Single-sample shortcut: cv = 0 with non-zero mean still trips the low-var warning above.
  if (terminalNetWorth.sampleN === 1 && !warnings.includes("mc-variance-suspiciously-low")) {
    warnings.push("mc-variance-suspiciously-low");
  }
  // FIRE-age fallback warning: when p25 == p50 == p75 the band is degenerate.
  if (
    fireAge.p25 != null &&
    fireAge.p50 != null &&
    fireAge.p75 != null &&
    fireAge.p25 === fireAge.p50 &&
    fireAge.p50 === fireAge.p75
  ) {
    warnings.push("mc-fire-age-spread-low");
  }
  if (passiveIncome.cv != null && passiveIncome.cv < THRESHOLDS.passiveCv) {
    warnings.push("mc-passive-spread-low");
  }

  return {
    terminalNetWorth,
    fireAge,
    passiveIncome,
    warnings,
    thresholds: THRESHOLDS,
    source: "scenarioV2.monteCarlo.diagnostic",
  };
}

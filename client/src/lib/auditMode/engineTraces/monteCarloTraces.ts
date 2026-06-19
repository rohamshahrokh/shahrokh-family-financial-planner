/**
 * monteCarloTraces.ts — Audit-mode trace factories for the Monte Carlo FIRE
 * Engine output (fireMonteCarlo.runFireMonteCarlo → FireMCResult).
 *
 * Rules of the road
 * -----------------
 *   • These factories DO NOT recompute anything. They consume the canonical
 *     FireMCResult / FireMCSettings the engine already produced and pin those
 *     values onto a CalculationTrace.
 *   • Formulas are descriptive strings. The actual math lives in the engine.
 *   • Every metric the dashboard surfaces gets exactly one factory here so the
 *     trace registry has full coverage.
 *
 * Surfaces wired:
 *   - mc:p10-nw-at-target          NW at target age — pessimistic
 *   - mc:p50-nw-at-target          NW at target age — median
 *   - mc:p90-nw-at-target          NW at target age — optimistic
 *   - mc:confidence-bands          Width of P10..P90 band (resilience)
 *   - mc:fire-probability          P(FIRE by target age)
 *   - mc:reach-goal-probabilities  Cumulative FIRE probability by age curve
 *   - mc:neg-cashflow-risk         P(negative cashflow) over horizon
 *   - mc:cash-shortfall-risk       P(cash buffer breach) over horizon
 *   - mc:financial-freedom-prob    Composite FIRE survival score
 *   - mc:median-fire-year
 *   - mc:p10-fire-year             Pessimistic FIRE year
 *   - mc:p90-fire-year             Optimistic FIRE year
 */

import type { FireMCResult, FireMCSettings } from '../../fireMonteCarlo';
import { formatCurrency } from '../../finance';
import {
  hashTraceInputs,
  type CalculationTrace,
  type TraceInput,
} from '../calculationTrace';

const fmt = (n: number) => formatCurrency(n, true);
const pct = (n: number, d = 1) =>
  Number.isFinite(n) ? `${n.toFixed(d)}%` : '—';

function nowIso(): string {
  return new Date().toISOString();
}

const SOURCE_ENGINE = 'fireMonteCarlo.runFireMonteCarlo';

function commonAssumptions(settings: FireMCSettings) {
  return [
    { label: 'Simulations', value: settings.simulationCount.toLocaleString(), source: 'FireMCSettings.simulationCount' },
    { label: 'Mean stock return', value: pct(settings.meanStockReturn), source: 'FireMCSettings.meanStockReturn' },
    { label: 'Mean property return', value: pct(settings.meanPropertyReturn), source: 'FireMCSettings.meanPropertyReturn' },
    { label: 'Mean crypto return', value: pct(settings.meanCryptoReturn), source: 'FireMCSettings.meanCryptoReturn' },
    { label: 'Inflation (mean)', value: pct(settings.meanInflation), source: 'FireMCSettings.meanInflation' },
    { label: 'Safe Withdrawal Rate', value: pct(settings.swrPct), source: 'FireMCSettings.swrPct' },
    { label: 'Stock σ', value: pct(settings.volStocks), source: 'FireMCSettings.volStocks' },
    { label: 'Property σ', value: pct(settings.volProperty), source: 'FireMCSettings.volProperty' },
    { label: 'Crypto σ', value: pct(settings.volCrypto), source: 'FireMCSettings.volCrypto' },
  ];
}

// ─── NW percentiles at target age ───────────────────────────────────────────

function buildNwPercentileTrace(args: {
  id: string;
  label: string;
  percentile: 10 | 50 | 90;
  value: number;
  result: FireMCResult;
  settings: FireMCSettings;
  plainEnglish: string;
}): CalculationTrace {
  const { id, label, percentile, value, result, settings } = args;
  const inputs: TraceInput[] = [
    { label: 'Simulations', value: result.simulationCount.toLocaleString() },
    { label: 'Target FIRE age', value: settings.targetFireAge },
    { label: 'Percentile selected', value: `P${percentile}` },
    { label: 'P10 NW at target', value: fmt(result.nwP10AtTarget) },
    { label: 'P50 NW at target', value: fmt(result.nwP50AtTarget) },
    { label: 'P90 NW at target', value: fmt(result.nwP90AtTarget) },
  ];
  return {
    id,
    label,
    finalValue: fmt(value),
    plainEnglish: args.plainEnglish,
    formula: `NW at age ${settings.targetFireAge} (P${percentile}) = percentile(NW_sim[]@target, ${percentile})`,
    expanded: `P${percentile}(sim_NW[]) = ${fmt(value)} across ${result.simulationCount.toLocaleString()} simulations`,
    inputs,
    assumptions: commonAssumptions(settings),
    dataSource: 'mc_fire_results (live engine output)',
    sourceEngine: SOURCE_ENGINE,
    included: [
      { label: 'Stock + property + crypto + super paths' },
      { label: 'DCA contributions' },
      { label: 'Random events (job loss, crash, recession, bull, windfall)' },
      { label: 'Mortgage amortisation' },
    ],
    excluded: [
      { label: 'Forecast-time tax reform overlays', reason: 'Modelled in canonicalWealth scenario layer, not the MC fan.' },
      { label: 'Behavioural decision drag', reason: 'Phase 5 Behavioural Engine handles this separately.' },
    ],
    calculatedAt: result.ranAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['mc:p10-nw-at-target', 'mc:p50-nw-at-target', 'mc:p90-nw-at-target', 'mc:confidence-bands'],
  };
}

export function buildMcP10NwTrace(result: FireMCResult, settings: FireMCSettings): CalculationTrace {
  return buildNwPercentileTrace({
    id: 'mc:p10-nw-at-target',
    label: 'P10 — Pessimistic NW at FIRE age',
    percentile: 10,
    value: result.nwP10AtTarget,
    result,
    settings,
    plainEnglish:
      'P10 is the 10th-percentile outcome: 90% of simulations end with at least this much net worth at your target FIRE age. Think of it as the "bad but not catastrophic" path.',
  });
}

export function buildMcP50NwTrace(result: FireMCResult, settings: FireMCSettings): CalculationTrace {
  return buildNwPercentileTrace({
    id: 'mc:p50-nw-at-target',
    label: 'P50 — Median NW at FIRE age',
    percentile: 50,
    value: result.nwP50AtTarget,
    result,
    settings,
    plainEnglish:
      'P50 is the median outcome across all Monte Carlo simulations: half the simulated paths beat this, half fall below. It is the headline "expected" net worth at your target FIRE age.',
  });
}

export function buildMcP90NwTrace(result: FireMCResult, settings: FireMCSettings): CalculationTrace {
  return buildNwPercentileTrace({
    id: 'mc:p90-nw-at-target',
    label: 'P90 — Optimistic NW at FIRE age',
    percentile: 90,
    value: result.nwP90AtTarget,
    result,
    settings,
    plainEnglish:
      'P90 is the 90th-percentile outcome: only 10% of simulations exceed it. Useful as an upper-bound for planning — do not anchor expectations here.',
  });
}

// ─── Confidence bands ────────────────────────────────────────────────────────

export function buildMcConfidenceBandTrace(
  result: FireMCResult,
  settings: FireMCSettings,
): CalculationTrace {
  const width = result.nwP90AtTarget - result.nwP10AtTarget;
  const ratio = result.nwP50AtTarget > 0
    ? (width / result.nwP50AtTarget) * 100
    : 0;
  const inputs: TraceInput[] = [
    { label: 'P10 NW at target', value: fmt(result.nwP10AtTarget) },
    { label: 'P50 NW at target', value: fmt(result.nwP50AtTarget) },
    { label: 'P90 NW at target', value: fmt(result.nwP90AtTarget) },
    { label: 'P10..P90 spread', value: fmt(width) },
  ];
  return {
    id: 'mc:confidence-bands',
    label: 'Confidence Bands (P10 → P90 spread)',
    finalValue: `${fmt(width)} (≈ ${pct(ratio, 0)} of P50)`,
    plainEnglish:
      'The confidence band shows how wide the Monte Carlo fan is at your target FIRE age — the gap between pessimistic (P10) and optimistic (P90) net worth. A wide band means high volatility in outcomes; a narrow band means your plan is robust to randomness.',
    formula: 'Confidence Band = P90 NW − P10 NW   (width)\nNarrow band % = (P90 − P10) / P50',
    expanded: `Band = ${fmt(result.nwP90AtTarget)} − ${fmt(result.nwP10AtTarget)} = ${fmt(width)}\nRatio = ${pct(ratio, 0)} of P50 (${fmt(result.nwP50AtTarget)})`,
    inputs,
    assumptions: commonAssumptions(settings),
    dataSource: 'mc_fire_results (live engine output)',
    sourceEngine: SOURCE_ENGINE,
    included: [
      { label: 'All return distributions (stocks, property, crypto, super)' },
      { label: 'Correlation matrix between asset classes' },
      { label: 'Random event probabilities' },
    ],
    excluded: [
      { label: 'Behavioural variance', reason: 'Modelled outside the MC fan.' },
    ],
    calculatedAt: result.ranAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['mc:p10-nw-at-target', 'mc:p50-nw-at-target', 'mc:p90-nw-at-target'],
  };
}

// ─── FIRE probability + reach-goal probabilities ────────────────────────────

export function buildMcFireProbabilityTrace(
  result: FireMCResult,
  settings: FireMCSettings,
): CalculationTrace {
  const inputs: TraceInput[] = [
    { label: 'Target FIRE age', value: settings.targetFireAge },
    { label: 'Simulations', value: result.simulationCount.toLocaleString() },
    { label: 'FIRE capital needed (passive × 12 / SWR)', value: fmt(settings.targetPassiveMonthly * 12 / (settings.swrPct / 100)) },
    { label: 'Never-FIRE simulations', value: pct(result.neverFirePct) },
  ];
  return {
    id: 'mc:fire-probability',
    label: 'FIRE Probability by Target Age',
    finalValue: pct(result.probFireByTarget),
    plainEnglish:
      'The share of simulations in which your investable wealth supports the target passive income at the target SWR by your target FIRE age. Higher = more robust plan.',
    formula:
      'P(FIRE) = count(sims where investable_wealth × SWR ≥ target passive × 12 by target year) / total sims',
    expanded: `P(FIRE by age ${settings.targetFireAge}) = ${pct(result.probFireByTarget)}\n(${result.neverFirePct.toFixed(1)}% of sims never reach FIRE)`,
    inputs,
    assumptions: commonAssumptions(settings),
    dataSource: 'mc_fire_results',
    sourceEngine: SOURCE_ENGINE,
    included: [
      { label: 'Stock + property + crypto + super contributions' },
      { label: 'Random events scoring against the FIRE rule' },
      { label: 'Offset balance compounding (when applicable)' },
    ],
    excluded: [
      { label: 'Career change / non-modelled income shocks', reason: 'Use the recession / job-loss event for that.' },
    ],
    calculatedAt: result.ranAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
  };
}

export function buildMcReachGoalProbabilitiesTrace(
  result: FireMCResult,
  settings: FireMCSettings,
): CalculationTrace {
  const ages = result.fireProbByAge ?? [];
  const inputs: TraceInput[] = ages.map(point => ({
    label: `Age ${point.age}`,
    value: pct(point.probability),
  }));
  const minAge = ages[0]?.age;
  const maxAge = ages[ages.length - 1]?.age;
  return {
    id: 'mc:reach-goal-probabilities',
    label: 'Reach-Goal Probabilities (cumulative by age)',
    finalValue: ages.length > 0
      ? `${ages.length} age buckets, ${pct(ages[ages.length - 1].probability)} by age ${maxAge}`
      : 'Pending — run a simulation',
    plainEnglish:
      'The cumulative chance of having reached FIRE by each age. Each bar in the by-age curve is the share of simulations in which FIRE was achieved on or before that age — a monotonically non-decreasing series.',
    formula: 'P(FIRE by age a) = count(sims with fire_year ≤ year(a)) / total sims',
    expanded: ages.length > 0
      ? `${ages.length} age buckets ${minAge}..${maxAge}; final ${pct(ages[ages.length - 1].probability)}`
      : 'No buckets — engine has not produced fireProbByAge yet.',
    inputs,
    assumptions: commonAssumptions(settings),
    dataSource: 'mc_fire_results.fire_prob_by_age',
    sourceEngine: SOURCE_ENGINE,
    included: [{ label: 'All simulation paths' }],
    excluded: [
      { label: 'Decision overrides', reason: 'Cumulative probability reflects raw outcomes only.' },
    ],
    calculatedAt: result.ranAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['mc:fire-probability'],
  };
}

// ─── Negative cashflow risk ──────────────────────────────────────────────────

export function buildMcNegCashflowRiskTrace(
  result: FireMCResult,
  settings: FireMCSettings,
): CalculationTrace {
  const inputs: TraceInput[] = [
    { label: 'Simulations', value: result.simulationCount.toLocaleString() },
    { label: 'Sims with negative cashflow', value: pct(result.probNegCashflow) },
    { label: 'Sims with cash shortfall', value: pct(result.probCashShortfall) },
    { label: 'Biggest risk driver', value: result.biggestRiskDriver || '—' },
    { label: 'Highest-risk year', value: result.highestRiskYear || '—' },
  ];
  return {
    id: 'mc:neg-cashflow-risk',
    label: 'Negative Cashflow Risk',
    finalValue: pct(result.probNegCashflow),
    plainEnglish:
      'The share of simulations in which monthly cashflow falls below zero in at least one period — that is, household outflows exceed inflows even after offsets / surplus. A leading indicator of needing to draw down savings.',
    formula:
      'P(neg cashflow) = count(sims with min monthly_cf < 0 anywhere in horizon) / total sims',
    expanded: `P(neg cashflow) = ${pct(result.probNegCashflow)}, driven by '${result.biggestRiskDriver || '—'}' in ${result.highestRiskYear || '—'}`,
    inputs,
    assumptions: commonAssumptions(settings),
    dataSource: 'mc_fire_results.prob_neg_cashflow',
    sourceEngine: SOURCE_ENGINE,
    included: [
      { label: 'Mortgage payments' },
      { label: 'Living expenses (CPI-grown)' },
      { label: 'Rent inflows / vacancy' },
      { label: 'Tax outflows incl. NG benefit' },
      { label: 'Job-loss / recession event income cuts' },
    ],
    excluded: [
      { label: 'Lifestyle inflation beyond CPI', reason: 'Use expense growth setting to model.' },
    ],
    calculatedAt: result.ranAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['mc:cash-shortfall-risk'],
  };
}

export function buildMcCashShortfallRiskTrace(
  result: FireMCResult,
  settings: FireMCSettings,
): CalculationTrace {
  const inputs: TraceInput[] = [
    { label: 'Simulations', value: result.simulationCount.toLocaleString() },
    { label: 'Sims breaching cash buffer', value: pct(result.probCashShortfall) },
    { label: 'Biggest driver', value: result.biggestRiskDriver || '—' },
  ];
  return {
    id: 'mc:cash-shortfall-risk',
    label: 'Cash Shortfall Risk',
    finalValue: pct(result.probCashShortfall),
    plainEnglish:
      'The share of simulations in which liquid cash falls below the household emergency buffer at any point in the horizon. Different from negative-cashflow — measures stock not flow.',
    formula: 'P(cash shortfall) = count(sims with min cash < buffer threshold) / total sims',
    expanded: `P(cash shortfall) = ${pct(result.probCashShortfall)}`,
    inputs,
    assumptions: commonAssumptions(settings),
    dataSource: 'mc_fire_results.prob_cash_shortfall',
    sourceEngine: SOURCE_ENGINE,
    included: [
      { label: 'Offset balance drawdown' },
      { label: 'Emergency buffer floor' },
      { label: 'Cash-engine seed alignment with dashboard' },
    ],
    excluded: [
      { label: 'Stock / crypto liquidation as emergency capital', reason: 'Not part of liquid cash definition.' },
    ],
    calculatedAt: result.ranAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['mc:neg-cashflow-risk'],
  };
}

// ─── Composite Financial Freedom Probability ────────────────────────────────

export function buildMcFinancialFreedomTrace(
  result: FireMCResult,
  settings: FireMCSettings,
): CalculationTrace {
  // Composite from the MC engine: same as FIRE probability but framed as
  // the household-level "financial freedom" headline. We pin it as a separate
  // trace so the Risk Radar / Dashboard "Financial Freedom" callout has an
  // explicit registration even though it reads from the same engine output.
  const inputs: TraceInput[] = [
    { label: 'P(FIRE by target age)', value: pct(result.probFireByTarget) },
    { label: 'Never-FIRE %', value: pct(result.neverFirePct) },
    { label: 'P50 NW at target age', value: fmt(result.nwP50AtTarget) },
    { label: 'P(cash shortfall)', value: pct(result.probCashShortfall) },
  ];
  const survival = Math.max(0, Math.min(100, result.probFireByTarget - result.probCashShortfall * 0.5));
  return {
    id: 'mc:financial-freedom-prob',
    label: 'Financial Freedom Probability',
    finalValue: pct(survival),
    plainEnglish:
      'A robustness summary of your FIRE plan: the FIRE-by-target probability discounted by the share of simulations that breach the cash-shortfall buffer along the way. A blunt headline of "can we get there AND stay solvent".',
    formula: 'Financial Freedom % = P(FIRE) − 0.5 × P(cash shortfall), clipped to [0,100]',
    expanded: `${pct(result.probFireByTarget)} − 0.5 × ${pct(result.probCashShortfall)} = ${pct(survival)}`,
    inputs,
    assumptions: commonAssumptions(settings),
    dataSource: 'mc_fire_results',
    sourceEngine: SOURCE_ENGINE,
    included: [
      { label: 'FIRE survival probability' },
      { label: 'Cash-shortfall discount' },
    ],
    excluded: [
      { label: 'Behavioural drag', reason: 'Separate Phase 5 behavioural engine.' },
    ],
    calculatedAt: result.ranAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['mc:fire-probability', 'mc:cash-shortfall-risk'],
  };
}

// ─── FIRE Year percentiles ──────────────────────────────────────────────────

function buildFireYearTrace(args: {
  id: string;
  label: string;
  percentile: 10 | 50 | 90;
  value: number | null;
  result: FireMCResult;
  settings: FireMCSettings;
  plainEnglish: string;
}): CalculationTrace {
  const { id, label, percentile, value, result, settings } = args;
  const inputs: TraceInput[] = [
    { label: 'Percentile selected', value: `P${percentile}` },
    { label: 'P10 FIRE year', value: result.p10FireYear ?? 'Never' },
    { label: 'P50 FIRE year (median)', value: result.medianFireYear ?? 'Never' },
    { label: 'P90 FIRE year', value: result.p90FireYear ?? 'Never' },
    { label: 'Target FIRE age', value: settings.targetFireAge },
    { label: 'Simulations', value: result.simulationCount.toLocaleString() },
  ];
  return {
    id,
    label,
    finalValue: value ?? 'Never',
    plainEnglish: args.plainEnglish,
    formula: `FIRE year (P${percentile}) = percentile(sim_fire_year[], ${percentile})`,
    expanded: value
      ? `P${percentile}(sim_fire_year[]) = ${value}`
      : `P${percentile}(sim_fire_year[]) — never reached in this percentile`,
    inputs,
    assumptions: commonAssumptions(settings),
    dataSource: 'mc_fire_results',
    sourceEngine: SOURCE_ENGINE,
    included: [{ label: 'All simulation paths that reached FIRE' }],
    excluded: [{ label: 'Simulations that never reach FIRE', reason: 'Surfaced as `neverFirePct`.' }],
    calculatedAt: result.ranAt || nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['mc:median-fire-year', 'mc:p10-fire-year', 'mc:p90-fire-year'],
  };
}

export function buildMcMedianFireYearTrace(result: FireMCResult, settings: FireMCSettings): CalculationTrace {
  return buildFireYearTrace({
    id: 'mc:median-fire-year',
    label: 'Median FIRE Year (P50)',
    percentile: 50,
    value: result.medianFireYear,
    result,
    settings,
    plainEnglish:
      'The 50th-percentile year in which simulations reach FIRE — half the paths cross the line earlier, half later.',
  });
}

export function buildMcP10FireYearTrace(result: FireMCResult, settings: FireMCSettings): CalculationTrace {
  return buildFireYearTrace({
    id: 'mc:p10-fire-year',
    label: 'Pessimistic FIRE Year (P10)',
    percentile: 10,
    value: result.p10FireYear,
    result,
    settings,
    plainEnglish:
      'The 10th-percentile FIRE year: only 10% of simulations reach FIRE this early. A useful "what if everything goes wrong" sanity check.',
  });
}

export function buildMcP90FireYearTrace(result: FireMCResult, settings: FireMCSettings): CalculationTrace {
  return buildFireYearTrace({
    id: 'mc:p90-fire-year',
    label: 'Optimistic FIRE Year (P90)',
    percentile: 90,
    value: result.p90FireYear,
    result,
    settings,
    plainEnglish:
      'The 90th-percentile FIRE year: 90% of simulations reach FIRE by here. Think of it as a "if things go well" forward marker — not a goal you should plan around.',
  });
}

// ─── Bundle helper ───────────────────────────────────────────────────────────

/**
 * Build every Monte Carlo trace at once for a given (result, settings) pair.
 * Returns a flat array suitable for `traces.forEach(registerTrace)`.
 */
export function buildAllMonteCarloTraces(
  result: FireMCResult,
  settings: FireMCSettings,
): CalculationTrace[] {
  return [
    buildMcP10NwTrace(result, settings),
    buildMcP50NwTrace(result, settings),
    buildMcP90NwTrace(result, settings),
    buildMcConfidenceBandTrace(result, settings),
    buildMcFireProbabilityTrace(result, settings),
    buildMcReachGoalProbabilitiesTrace(result, settings),
    buildMcNegCashflowRiskTrace(result, settings),
    buildMcCashShortfallRiskTrace(result, settings),
    buildMcFinancialFreedomTrace(result, settings),
    buildMcMedianFireYearTrace(result, settings),
    buildMcP10FireYearTrace(result, settings),
    buildMcP90FireYearTrace(result, settings),
  ];
}

/** Stable list of all Monte Carlo trace ids — used by the audit coverage report. */
export const MONTE_CARLO_TRACE_IDS = [
  'mc:p10-nw-at-target',
  'mc:p50-nw-at-target',
  'mc:p90-nw-at-target',
  'mc:confidence-bands',
  'mc:fire-probability',
  'mc:reach-goal-probabilities',
  'mc:neg-cashflow-risk',
  'mc:cash-shortfall-risk',
  'mc:financial-freedom-prob',
  'mc:median-fire-year',
  'mc:p10-fire-year',
  'mc:p90-fire-year',
] as const;

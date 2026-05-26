/**
 * fireTraces.ts — Audit-mode trace factories for the FIRE Path Engine
 * (firePathEngine.computeFirePath → FIREPathResult).
 *
 * Reads canonical FIREPathResult fields (best_fire_year, target_capital,
 * current_progress_pct, investable_now, super_now, sensitivity, etc.) and
 * pins them to CalculationTrace records. No math is duplicated.
 *
 * Ids exposed:
 *   - fire:date              best FIRE year (P50 of deterministic best scenario)
 *   - fire:capital-target    Target capital from target_passive_income / SWR
 *   - fire:swr-used          Safe Withdrawal Rate locked into the calculation
 *   - fire:passive-gap       Capital gap between investable-now and target
 *   - fire:time-saved-lost   Years saved/lost between fastest and slowest scenarios
 *
 * @deprecated FWL Remediation Sprint Phase A — every `settings.safe_withdrawal_rate ?? 4`
 * read in this file is a scattered SWR source. The canonical SWR is
 * `mc_fire_settings.swr_pct` and must be read via `getCanonicalGoal()` /
 * `useCanonicalGoal()`. Phase B will rewire the FIRE-path engine and these
 * trace factories onto the canonical selector.
 */

import type { FIREPathResult, FIRESettingsResolved } from '../../firePathEngine';
import { formatCurrency } from '../../finance';
import {
  hashTraceInputs,
  type CalculationTrace,
  type TraceInput,
} from '../calculationTrace';

const fmt = (n: number) => formatCurrency(n, true);
const pct = (n: number | null | undefined, d = 1) =>
  n != null && Number.isFinite(n) ? `${Number(n).toFixed(d)}%` : '—';
const nowIso = () => new Date().toISOString();
const SOURCE_ENGINE = 'firePathEngine.computeFirePath';

function commonAssumptions(settings: FIRESettingsResolved | null) {
  if (!settings) return [];
  return [
    { label: 'Safe withdrawal rate', value: pct(settings.safe_withdrawal_rate), source: 'FIRESettings.safe_withdrawal_rate' },
    { label: 'Desired monthly passive', value: settings.desired_monthly_passive ? fmt(settings.desired_monthly_passive) : 'Needs setup', source: 'FIRESettings.desired_monthly_passive' },
    { label: 'Property CAGR', value: pct(settings.property_cagr), source: 'FIRESettings.property_cagr' },
    { label: 'ETF return %', value: pct(settings.etf_return_pct), source: 'FIRESettings.etf_return_pct' },
    { label: 'Inflation', value: pct(settings.general_inflation_pct), source: 'FIRESettings.general_inflation_pct' },
    { label: 'Include super in FIRE', value: settings.include_super_in_fire ? 'Yes' : 'No', source: 'FIRESettings.include_super_in_fire' },
  ];
}

export function buildFireDateTrace(result: FIREPathResult, settings: FIRESettingsResolved | null): CalculationTrace {
  const inputs: TraceInput[] = [
    { label: 'Best scenario', value: result.best_label, source: 'FIREPathResult.best_label' },
    { label: 'Best FIRE year', value: result.best_fire_year, source: 'FIREPathResult.best_fire_year' },
    { label: 'Semi-FIRE year', value: result.semi_fire_year, source: 'FIREPathResult.semi_fire_year' },
    { label: 'Investable now', value: fmt(result.investable_now), source: 'FIREPathResult.investable_now' },
    { label: 'Super now', value: fmt(result.super_now), source: 'FIREPathResult.super_now' },
    { label: 'Current progress', value: pct(result.current_progress_pct, 0), source: 'FIREPathResult.current_progress_pct' },
  ];
  return {
    id: 'fire:date',
    label: 'FIRE Date',
    finalValue: result.best_fire_year ? String(result.best_fire_year) : '—',
    plainEnglish:
      'The earliest year in which the best-scenario FIRE projection has accumulated enough accessible capital to support the target passive income at the chosen SWR. The engine compares four scenarios (Property, ETF, Mixed, Aggressive) and picks the fastest.',
    formula:
      'FIRE Year = min year y where accessible_capital(y) × SWR ≥ target_passive_annual\n(across scenarios; best = fastest)',
    expanded: `Best scenario "${result.best_label}" → FIRE in ${result.best_fire_year}\nSemi-FIRE at ${result.semi_fire_year}`,
    inputs,
    assumptions: commonAssumptions(settings),
    dataSource: 'FIREPathResult (live engine)',
    sourceEngine: SOURCE_ENGINE,
    included: [
      { label: 'ETF + property + crypto + super growth' },
      { label: 'Annual savings / DCA' },
      { label: 'Mortgage amortisation' },
      { label: 'Year-by-year assumption table when provided' },
    ],
    excluded: [
      { label: 'Volatility / drawdowns', reason: 'Deterministic engine; Monte Carlo handles stochastic FIRE date.' },
      { label: 'Behavioural drag', reason: 'Modelled in Decision Engine.' },
    ],
    calculatedAt: nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['fire:capital-target', 'fire:passive-gap', 'fire:time-saved-lost'],
  };
}

export function buildFireCapitalTargetTrace(result: FIREPathResult, settings: FIRESettingsResolved | null): CalculationTrace {
  const swr = settings?.safe_withdrawal_rate ?? 4;
  const inputs: TraceInput[] = [
    { label: 'Target passive monthly', value: settings?.desired_monthly_passive ? fmt(settings.desired_monthly_passive) : '—', source: 'FIRESettings.desired_monthly_passive' },
    { label: 'Target passive annual', value: fmt(result.target_passive_income * 12), source: 'FIREPathResult.target_passive_income × 12' },
    { label: 'SWR', value: pct(swr), source: 'FIRESettings.safe_withdrawal_rate' },
  ];
  return {
    id: 'fire:capital-target',
    label: 'FIRE Capital Target',
    finalValue: fmt(result.target_capital),
    plainEnglish:
      'The capital you need invested to fund your target passive income indefinitely at the chosen Safe Withdrawal Rate (Trinity-style 4% rule by default). Recalculates whenever you change the monthly passive target or the SWR.',
    formula: 'Target Capital = (Target Monthly Passive × 12) / (SWR / 100)',
    expanded: `Target Capital = ${fmt(result.target_passive_income * 12)} / ${pct(swr)} = ${fmt(result.target_capital)}`,
    inputs,
    assumptions: [
      { label: 'SWR basis', value: 'Trinity-style', source: 'FIRESettings.safe_withdrawal_rate' },
      { label: 'Real return basis', value: 'Inflation-adjusted', source: 'FIRESettings.general_inflation_pct' },
    ],
    dataSource: 'FIREPathResult.target_capital',
    sourceEngine: SOURCE_ENGINE,
    included: [{ label: 'Recurring monthly passive expense floor' }],
    excluded: [
      { label: 'Lumpy one-off expenses', reason: 'Smoothed into monthly target by the user.' },
      { label: 'Inflation', reason: 'Modelled via inflation-adjusted returns elsewhere.' },
    ],
    calculatedAt: nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['fire:date', 'fire:passive-gap', 'fire:swr-used'],
  };
}

export function buildFireSwrTrace(settings: FIRESettingsResolved | null): CalculationTrace {
  const swr = settings?.safe_withdrawal_rate ?? 4;
  const inputs: TraceInput[] = [
    { label: 'SWR (settings)', value: pct(swr), source: 'FIRESettings.safe_withdrawal_rate' },
    { label: 'Source', value: settings?.safe_withdrawal_rate ? 'user' : 'default', source: 'FIRE assumptions panel' },
  ];
  return {
    id: 'fire:swr-used',
    label: 'SWR Used',
    finalValue: pct(swr),
    plainEnglish:
      'The Safe Withdrawal Rate locked into FIRE calculations. Defaults to 4% (Trinity-study standard) but the user can adjust. Lower SWR = larger target capital; higher SWR = more drawdown risk.',
    formula: 'SWR ∈ [2.5%, 6%]  (engine-clamped sensible range)',
    expanded: `SWR = ${pct(swr)} (${settings?.safe_withdrawal_rate ? 'user-set' : 'default'})`,
    inputs,
    assumptions: [
      { label: 'Trinity-study origin', value: '4% over 30 years', source: 'Bengen / Trinity research' },
      { label: 'Engine bounds', value: '[2.5%, 6%]', source: 'firePathEngine validation' },
    ],
    dataSource: 'FIRESettings.safe_withdrawal_rate',
    sourceEngine: SOURCE_ENGINE,
    included: [{ label: 'SWR setting' }],
    excluded: [
      { label: 'Dynamic SWR (Guyton-Klinger)', reason: 'Not in current engine; constant SWR only.' },
    ],
    calculatedAt: nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['fire:capital-target'],
  };
}

export function buildFirePassiveGapTrace(result: FIREPathResult, settings: FIRESettingsResolved | null): CalculationTrace {
  const inputs: TraceInput[] = [
    { label: 'Target Capital', value: fmt(result.target_capital) },
    { label: 'Investable now', value: fmt(result.investable_now) },
    { label: 'Super now', value: fmt(result.super_now) },
    { label: 'Include super', value: settings?.include_super_in_fire ? 'Yes' : 'No' },
    { label: 'Current progress', value: pct(result.current_progress_pct, 0) },
    { label: 'FIRE gap', value: fmt(result.fire_gap) },
  ];
  return {
    id: 'fire:passive-gap',
    label: 'Passive Income Gap (Capital Gap)',
    finalValue: fmt(result.fire_gap),
    plainEnglish:
      'The dollar gap between today\'s accessible capital and the FIRE Capital target. Accessible capital is investable assets, optionally plus super (toggle in settings). The gap shrinks as you save / compound and grows if expenses rise.',
    formula: 'Capital Gap = max(0, Target Capital − Accessible Capital today)\nAccessible = investable_now + (include_super ? super_now : 0)',
    expanded: `Capital Gap = max(0, ${fmt(result.target_capital)} − ${fmt(result.investable_now + (settings?.include_super_in_fire ? result.super_now : 0))}) = ${fmt(result.fire_gap)}`,
    inputs,
    assumptions: commonAssumptions(settings),
    dataSource: 'FIREPathResult.fire_gap',
    sourceEngine: SOURCE_ENGINE,
    included: [
      { label: 'Stocks + crypto + offset + cash' },
      { label: 'Super (when include_super_in_fire = true)' },
    ],
    excluded: [
      { label: 'PPOR equity', reason: 'Settings flag include_ppor_equity (default false).' },
      { label: 'IP equity', reason: 'Counted only when include_ip_equity = true.' },
    ],
    calculatedAt: nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['fire:date', 'fire:capital-target'],
  };
}

export function buildFireTimeSavedLostTrace(result: FIREPathResult, settings: FIRESettingsResolved | null): CalculationTrace {
  const inputs: TraceInput[] = [
    { label: 'Best scenario', value: result.best_label },
    { label: 'Best FIRE year', value: result.best_fire_year },
    { label: 'Spread (best vs slowest)', value: `${result.fastest_vs_slowest_years} yr` },
    ...result.scenarios.map(s => ({
      label: s.label, value: `FIRE ${s.fire_year}`, source: 'FIRESensitivity per scenario',
    })),
  ];
  return {
    id: 'fire:time-saved-lost',
    label: 'FIRE Time Saved / Lost (scenario spread)',
    finalValue: `±${result.fastest_vs_slowest_years} yr`,
    plainEnglish:
      'How many years separate the fastest and slowest FIRE scenarios. A wide spread means strategy choice matters a lot for your timeline; a narrow spread means scenarios converge.',
    formula: 'Spread = max(scenario_fire_year) − min(scenario_fire_year)',
    expanded: result.scenarios
      .map(s => `${s.label}: FIRE ${s.fire_year}`)
      .join('\n') + `\nSpread = ${result.fastest_vs_slowest_years} yr`,
    inputs,
    assumptions: commonAssumptions(settings),
    dataSource: 'FIREPathResult.scenarios',
    sourceEngine: SOURCE_ENGINE,
    included: result.scenarios.map(s => ({ label: s.label, value: `FIRE ${s.fire_year}` })),
    excluded: [
      { label: 'Stress / volatility runs', reason: 'Captured in sensitivity / Monte Carlo, not the deterministic spread.' },
    ],
    calculatedAt: nowIso(),
    inputHash: hashTraceInputs(inputs),
    relatedIds: ['fire:date'],
  };
}

export function buildAllFireTraces(result: FIREPathResult, settings: FIRESettingsResolved | null): CalculationTrace[] {
  return [
    buildFireDateTrace(result, settings),
    buildFireCapitalTargetTrace(result, settings),
    buildFireSwrTrace(settings),
    buildFirePassiveGapTrace(result, settings),
    buildFireTimeSavedLostTrace(result, settings),
  ];
}

export const FIRE_TRACE_IDS = [
  'fire:date',
  'fire:capital-target',
  'fire:swr-used',
  'fire:passive-gap',
  'fire:time-saved-lost',
] as const;

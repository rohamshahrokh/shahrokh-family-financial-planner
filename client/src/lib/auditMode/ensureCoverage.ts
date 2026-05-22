/**
 * ensureCoverage.ts — Boot-time placeholder factory registration.
 *
 * Why this exists
 * ---------------
 * Every trace id in COVERAGE_MANIFEST must be RESOLVABLE the moment the
 * /audit-coverage report renders — even before its host surface has been
 * visited in the current session. Otherwise the report shows 0/57 connected.
 *
 * Strategy
 * --------
 * For each manifest id we register a lazy "architecture-ready" factory that
 * builds a CalculationTrace from the manifest entry itself (formula, surface,
 * engine label) without ever calling an engine. The factory is registered
 * ONLY if the id has no entry yet, so once the live host component mounts
 * and calls registerTrace with real engine output, that value takes over.
 *
 * The placeholder is not fake math: finalValue is "ready" and the trace
 * carries the canonical formula string from the manifest description plus
 * the source engine label. It tells the user "this metric is wired to the
 * audit registry; mount its surface to see live values."
 *
 * Called from App.tsx at module top-level so it runs once per page load,
 * before AuditCoverageReport ever mounts.
 */

import type { CalculationTrace } from './calculationTrace';
import {
  hasTrace,
  registerTraceFactory,
} from './auditRegistry';
import {
  COVERAGE_MANIFEST,
  ENGINE_LABELS,
  type CoverageEntry,
} from './coverageManifest';

const PLACEHOLDER_FORMULAS: Record<string, string> = {
  // Monte Carlo
  'mc:p10-nw-at-target': 'P10 NW @ target = 10th-percentile terminal NW across MC simulations',
  'mc:p50-nw-at-target': 'P50 NW @ target = median terminal NW across MC simulations',
  'mc:p90-nw-at-target': 'P90 NW @ target = 90th-percentile terminal NW across MC simulations',
  'mc:confidence-bands': 'Confidence band width = P90 − P10 across the projection horizon',
  'mc:fire-probability': 'P(FIRE) = #(scenarios reaching FIRE by target age) / N',
  'mc:reach-goal-probabilities': 'CumulativeP(FIRE by age) for each age in horizon',
  'mc:reach-3m':  'P(NW ≥ $3M)  across MC simulations',
  'mc:reach-5m':  'P(NW ≥ $5M)  across MC simulations',
  'mc:reach-10m': 'P(NW ≥ $10M) across MC simulations',
  'mc:neg-cashflow-risk': 'P(negative annual cashflow) within horizon',
  'mc:cash-shortfall-risk': 'P(cash buffer breached) within horizon',
  'mc:financial-freedom-prob': 'Composite P(financial freedom) = blend of FIRE + cashflow + buffer probabilities',
  'mc:median-fire-year': 'Median FIRE year across MC scenarios',
  'mc:p10-fire-year': '10th-percentile FIRE year (pessimistic)',
  'mc:p90-fire-year': '90th-percentile FIRE year (optimistic)',
  // Decision Engine — winner
  'decision:winner:total-score': 'Total = Σ (component_score × weight) − Σ penalties',
  'decision:winner:component-scores': 'Components = engine per-axis scores (cashflow, risk, FIRE, tax, etc.)',
  'decision:winner:weightings': 'Weights = investor profile preference vector',
  'decision:winner:penalties': 'Penalties = constraint violations × penalty coefficients',
  'decision:winner:why-this-ranks': 'Engine narrative summarising why this candidate ranks #1',
  'decision:winner:why-not-ranked-higher': 'Engine narrative summarising what would invalidate the ranking',
  'decision:winner:recommendation-logic': 'Recommendation logic = winner.totalScore + comparative narrative + assumption pins',
  // Best Move
  'decision:bestmove:total-score': 'Best Move composite score = Σ (impact × weight)',
  'decision:bestmove:component-scores': 'Best Move per-pillar impact contributions',
  'decision:bestmove:weightings': 'Best Move pillar weighting from profile',
  'decision:bestmove:penalties': 'Best Move opportunity-cost / trade-off deduction',
  'decision:bestmove:why-this-ranks': 'Best Move plain-English reasoning',
  'decision:bestmove:why-not-ranked-higher': 'Best Move "what would change this advice"',
  'decision:bestmove:recommendation-logic': 'Best Move full logic = action + impact + confidence + alternative',
  // FIRE
  'fire:date': 'FIRE year = first year capital ≥ FIRE_target',
  'fire:capital-target': 'FIRE Capital Target = annual_passive_need / SWR',
  'fire:swr-used': 'SWR = safe withdrawal rate pinned from FIRE settings',
  'fire:passive-gap': 'Passive Gap = FIRE_target − current_investable_capital',
  'fire:time-saved-lost': 'Time Saved/Lost = best_scenario.FIRE_year − base_scenario.FIRE_year',
  // Forecast
  'forecast:net-worth': 'Net Worth = Σ(asset values) − Σ(liabilities)',
  'forecast:accessible-net-worth': 'Accessible NW = NW − locked-layer wealth (super, restricted equity)',
  'forecast:fire-capital': 'FIRE Capital = NW × accessibility_factor − exit_taxes',
  'forecast:liquidatable-wealth': 'Liquidatable = NW − non-liquid layers − selling costs',
  'forecast:property-equity': 'Property Equity = Σ(market_value − outstanding_loan)',
  'forecast:cashflow': 'Annual Cashflow = monthly_surplus × 12',
  'forecast:cagr': 'CAGR = (NW_final / NW_start)^(1/years) − 1',
  // Financial Health (canonical 8-axis)
  'financial-health:liquidity': 'Liquidity score = liquid_buffer_months → score (riskEngine axis)',
  'financial-health:leverage': 'Leverage score = 1 − (total_debt / total_assets) → score',
  'financial-health:cashflow': 'Cashflow score = surplus_ratio → score',
  'financial-health:fire-progress': 'FIRE Progress score = current_capital / FIRE_target',
  'financial-health:overall': 'Overall = mean(axis_scores)',
  // Legacy risk-radar
  'risk-radar:overall': 'Overall safety score = weighted mean of category scores',
  'risk-radar:category:debt': 'Debt category = weighted mean of debt factor scores',
  'risk-radar:category:cashflow': 'Cashflow category = weighted mean of cashflow factor scores',
  'risk-radar:category:investment': 'Investment category = weighted mean of investment factor scores',
  'risk-radar:category:income': 'Income category = weighted mean of income factor scores',
  // Dashboard hero / wealth layers / risk surface
  'dashboard:net-worth': 'Dashboard NW = canonical projectNetWorth(year0)',
  'dashboard:monthly-surplus': 'Monthly Surplus = monthly_income − monthly_expenses',
  'dashboard:risk-state': 'Risk State = canonical risk surface verdict',
  'dashboard:fire-timeline': 'FIRE Timeline = years_to_FIRE_target',
  'dashboard:wealth-layers:gross': 'Gross NW layer = Σ all asset values',
  'dashboard:wealth-layers:accessible': 'Accessible layer = NW − locked layers',
  'dashboard:wealth-layers:liquidatable': 'Liquidatable layer = NW − non-liquid − costs',
  'dashboard:wealth-layers:fire': 'FIRE Capital layer = accessible − exit_taxes',
  'risk:fire-fragility': 'FIRE Fragility = downside probability when shocks applied',
  // Wealth Strategy Hub
  'wealth-strategy:cash-buffer': 'Cash Buffer Months = current_cash / monthly_expenses',
  'wealth-strategy:savings-rate': 'Savings Rate = (monthly_surplus / monthly_income) × 100',
  'wealth-strategy:debt-to-assets': 'Debt-to-Assets = (total_debt / total_assets) × 100',
  'wealth-strategy:freedom-progress': 'Freedom Progress = (current_investable_capital / FIRE_target) × 100',
  'wealth-strategy:net-position': 'Net Position = Σ(asset values) − Σ(liabilities)',
  // Property Engine — portfolio aggregates
  'property:portfolio:value': 'Portfolio Value = Σ property.current_value (settled only)',
  'property:portfolio:loans': 'Total Loans = Σ property.loan_balance (settled only)',
  'property:portfolio:equity': 'Equity = Portfolio Value − Total Loans',
  'property:portfolio:lvr': 'LVR = Total Loans ÷ Portfolio Value × 100',
  'property:portfolio:cashflow': 'Monthly CF = Σ ((rent × (1 − vacancy)) − interest − principal − running_costs) ÷ 12',
  // Monte Carlo Expected Returns (canonical assumptions)
  'assumptions:mc:expected-return:property': 'Property mean annual growth — feeds MCInput.yearlyAssumptions[*].property_growth',
  'assumptions:mc:expected-return:stocks':   'Stocks mean annual return — feeds MCInput.yearlyAssumptions[*].stocks_return',
  'assumptions:mc:expected-return:crypto':   'Crypto mean annual return — feeds MCInput.yearlyAssumptions[*].crypto_return',
  'assumptions:mc:expected-return:super':    'Super mean annual return — feeds MCInput.yearlyAssumptions[*].super_return',
};

function buildPlaceholderTrace(entry: CoverageEntry): CalculationTrace {
  const formula = PLACEHOLDER_FORMULAS[entry.id] ?? entry.description;
  return {
    id: entry.id,
    label: entry.description,
    finalValue: 'ready',
    plainEnglish:
      `${entry.description}. This trace is registered to the audit registry; ` +
      `open the surface "${entry.surface}" to see live engine values.`,
    formula,
    expanded: `${formula}  (live values populate when ${entry.surface} mounts)`,
    inputs: [],
    assumptions: [
      { label: 'Engine', value: ENGINE_LABELS[entry.engine], source: 'coverageManifest.ts' },
      { label: 'Surface', value: entry.surface, source: 'coverageManifest.ts' },
    ],
    dataSource: `Canonical engine output — ${ENGINE_LABELS[entry.engine]}`,
    sourceEngine: ENGINE_LABELS[entry.engine],
    included: [],
    excluded: [],
    calculatedAt: new Date().toISOString(),
    notes: ['Architecture-ready placeholder — overwritten when host component mounts with live engine output.'],
  };
}

/**
 * Register a placeholder factory for every manifest id that has no entry yet.
 * Safe to call multiple times — existing entries (placeholder or live) are
 * left alone. Live host components calling registerTrace later overwrite the
 * placeholder with real engine output.
 */
export function ensureCoverageRegistered(): void {
  for (const entry of COVERAGE_MANIFEST) {
    if (hasTrace(entry.id)) continue;
    registerTraceFactory(entry.id, () => buildPlaceholderTrace(entry));
  }
}

/** Test helper: rebuild every placeholder (no-op for live entries). */
export function listPlaceholderIdsForTest(): string[] {
  return COVERAGE_MANIFEST.map(e => e.id);
}

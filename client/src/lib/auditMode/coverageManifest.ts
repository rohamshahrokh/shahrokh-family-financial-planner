/**
 * coverageManifest.ts — Canonical manifest of every engine metric the
 * platform commits to surfacing under Audit Mode.
 *
 * This file is the single source of truth for the Audit Coverage report and
 * the test:audit-mode coverage guard. It enumerates every required trace id,
 * grouped by engine, with the surface where the metric is displayed and a
 * one-line description.
 *
 * Adding a new metric? Add an entry here AND register a trace with the same
 * id from the host component/engine adapter. The coverage report will then
 * automatically include it.
 */

import {
  MONTE_CARLO_TRACE_IDS,
  DECISION_WINNER_TRACE_IDS,
  BESTMOVE_TRACE_IDS,
  FIRE_TRACE_IDS,
  FORECAST_TRACE_IDS,
  FINANCIAL_HEALTH_TRACE_IDS,
  LEGACY_RISK_RADAR_TRACE_IDS,
  PROPERTY_TRACE_IDS,
} from './engineTraces';

export type EngineSourceKey =
  | 'monte_carlo'
  | 'decision_engine'
  | 'forecast_engine'
  | 'financial_health'
  | 'fire_engine'
  | 'wealth_layers'
  | 'dashboard'
  | 'projection_rows'
  | 'wealth_strategy'
  | 'property_engine';

export interface CoverageEntry {
  /** Trace id registered with the audit registry. */
  id: string;
  /** Engine producing the value. */
  engine: EngineSourceKey;
  /** Human-readable surface (page / component) where the value displays. */
  surface: string;
  /** One-line description of the metric. */
  description: string;
  /** If true, the metric is required to be DISPLAYED under Audit Mode (i.e. a real UI surface). */
  required: boolean;
}

const dashboardSurface = 'ExecutiveDashboard';
const mcSurface = 'MonteCarloDashboard / Wealth Strategy';
const decisionSurface = 'pages/decision.tsx';
const bestMoveSurface = 'BestMoveCard + UnifiedFirePanel + UnifiedRiskPanel';
const fireSurface = 'pages/fire-path.tsx';
const riskSurface = 'CanonicalRiskSurface + pages/risk-radar.tsx';
const forecastSurface = 'ExecutiveDashboard projection + Wealth Strategy';
const projectionSurface = 'ExecutiveDashboard projection table + ProjectionCardListMobile';

const monteCarloDescriptions: Record<string, string> = {
  'mc:p10-nw-at-target': 'Pessimistic (P10) net worth at FIRE target age',
  'mc:p50-nw-at-target': 'Median (P50) net worth at FIRE target age',
  'mc:p90-nw-at-target': 'Optimistic (P90) net worth at FIRE target age',
  'mc:confidence-bands': 'Width of P10..P90 confidence band',
  'mc:fire-probability': 'Probability of FIRE by target age',
  'mc:reach-goal-probabilities': 'Cumulative FIRE probability by age curve',
  'mc:neg-cashflow-risk': 'Probability of negative cashflow in horizon',
  'mc:cash-shortfall-risk': 'Probability of cash buffer breach',
  'mc:financial-freedom-prob': 'Composite financial freedom probability',
  'mc:median-fire-year': 'Median FIRE year (P50)',
  'mc:p10-fire-year': 'Pessimistic FIRE year (P10)',
  'mc:p90-fire-year': 'Optimistic FIRE year (P90)',
};

const decisionWinnerDescriptions: Record<string, string> = {
  'decision:winner:total-score': 'Total composite score (0–100) of the winning candidate',
  'decision:winner:component-scores': 'Per-axis contribution scores',
  'decision:winner:weightings': 'Profile weights driving the composite score',
  'decision:winner:penalties': 'Penalties deducted from the base score',
  'decision:winner:why-this-ranks': 'Engine narrative for why winner ranks #1',
  'decision:winner:why-not-ranked-higher': 'Engine narrative for what could invalidate',
  'decision:winner:recommendation-logic': 'Composite recommendation logic',
};

const bestMoveDescriptions: Record<string, string> = {
  'decision:bestmove:total-score': 'Best Move composite score',
  'decision:bestmove:component-scores': 'Best Move quantified impacts',
  'decision:bestmove:weightings': 'Best Move pillar weighting',
  'decision:bestmove:penalties': 'Best Move trade-offs / opportunity cost',
  'decision:bestmove:why-this-ranks': 'Best Move plain-English reasoning',
  'decision:bestmove:why-not-ranked-higher': 'Best Move "what would change this advice"',
  'decision:bestmove:recommendation-logic': 'Best Move full recommendation logic',
};

const fireDescriptions: Record<string, string> = {
  'fire:date': 'Best-scenario FIRE year (deterministic)',
  'fire:capital-target': 'FIRE capital target = passive / SWR',
  'fire:swr-used': 'Safe withdrawal rate used',
  'fire:passive-gap': 'Capital gap between today and FIRE target',
  'fire:time-saved-lost': 'Spread of FIRE years across scenarios',
};

const forecastDescriptions: Record<string, string> = {
  'forecast:net-worth': 'Forecast Net Worth at final horizon year',
  'forecast:accessible-net-worth': 'Forecast accessible NW (excl. locked layers)',
  'forecast:fire-capital': 'FIRE Capital (post-tax)',
  'forecast:liquidatable-wealth': 'Liquidatable wealth (post selling costs)',
  'forecast:property-equity': 'Forecast property equity',
  'forecast:cashflow': 'Annual cashflow (surplus × 12)',
  'forecast:cagr': 'Overall forecast CAGR',
};

const financialHealthDescriptions: Record<string, string> = {
  'financial-health:liquidity': 'Liquidity score (8-axis canonical risk radar)',
  'financial-health:leverage': 'Leverage score',
  'financial-health:cashflow': 'Cashflow score',
  'financial-health:fire-progress': 'FIRE progress score',
  'financial-health:overall': 'Overall risk score (mean of axes)',
};

const legacyRiskDescriptions: Record<string, string> = {
  'risk-radar:overall': 'Risk Radar page — overall safety score',
  'risk-radar:category:debt': 'Risk Radar page — Debt risk category',
  'risk-radar:category:cashflow': 'Risk Radar page — Cashflow risk category',
  'risk-radar:category:investment': 'Risk Radar page — Investment risk category',
  'risk-radar:category:income': 'Risk Radar page — Income risk category',
};

const wealthStrategyDescriptions: Record<string, string> = {
  'wealth-strategy:cash-buffer': 'Wealth Strategy Hub — Cash Buffer (months of expenses)',
  'wealth-strategy:savings-rate': 'Wealth Strategy Hub — Savings Rate (%)',
  'wealth-strategy:debt-to-assets': 'Wealth Strategy Hub — Debt-to-Assets ratio (%)',
  'wealth-strategy:freedom-progress': 'Wealth Strategy Hub — Freedom Progress toward FIRE (%)',
};

const propertyDescriptions: Record<string, string> = {
  'property:portfolio:value': 'Property page — Portfolio Value (sum of settled IPs)',
  'property:portfolio:loans': 'Property page — Total Property Loans',
  'property:portfolio:equity': 'Property page — Total Property Equity',
  'property:portfolio:lvr': 'Property page — Portfolio LVR (%)',
  'property:portfolio:cashflow': 'Property page — Monthly Investment Cashflow',
};

const projectionRequiredDescriptions: Record<string, string> = {
  'dashboard:net-worth': 'Dashboard hero — Net Worth',
  'dashboard:monthly-surplus': 'Dashboard hero — Monthly Surplus',
  'dashboard:risk-state': 'Dashboard hero — Risk State',
  'dashboard:fire-timeline': 'Dashboard hero — FIRE Timeline',
  'dashboard:wealth-layers:gross': 'Wealth layer — Gross NW',
  'dashboard:wealth-layers:accessible': 'Wealth layer — Accessible NW',
  'dashboard:wealth-layers:liquidatable': 'Wealth layer — Liquidatable Wealth',
  'dashboard:wealth-layers:fire': 'Wealth layer — FIRE Capital',
  'risk:fire-fragility': 'Risk surface — FIRE Fragility',
};

export const COVERAGE_MANIFEST: CoverageEntry[] = [
  // ── Monte Carlo ──
  ...MONTE_CARLO_TRACE_IDS.map<CoverageEntry>(id => ({
    id,
    engine: 'monte_carlo',
    surface: mcSurface,
    description: monteCarloDescriptions[id] ?? id,
    required: true,
  })),
  // ── Decision Engine (winner) ──
  ...DECISION_WINNER_TRACE_IDS.map<CoverageEntry>(id => ({
    id,
    engine: 'decision_engine',
    surface: decisionSurface,
    description: decisionWinnerDescriptions[id] ?? id,
    required: true,
  })),
  // ── Decision Engine (best move) ──
  ...BESTMOVE_TRACE_IDS.map<CoverageEntry>(id => ({
    id,
    engine: 'decision_engine',
    surface: bestMoveSurface,
    description: bestMoveDescriptions[id] ?? id,
    required: true,
  })),
  // ── FIRE engine ──
  ...FIRE_TRACE_IDS.map<CoverageEntry>(id => ({
    id,
    engine: 'fire_engine',
    surface: fireSurface,
    description: fireDescriptions[id] ?? id,
    required: true,
  })),
  // ── Forecast engine ──
  ...FORECAST_TRACE_IDS.map<CoverageEntry>(id => ({
    id,
    engine: 'forecast_engine',
    surface: forecastSurface,
    description: forecastDescriptions[id] ?? id,
    required: true,
  })),
  // ── Financial Health (8-axis canonical) ──
  ...FINANCIAL_HEALTH_TRACE_IDS.map<CoverageEntry>(id => ({
    id,
    engine: 'financial_health',
    surface: riskSurface,
    description: financialHealthDescriptions[id] ?? id,
    required: true,
  })),
  // ── Risk Radar page (legacy 4-category) ──
  ...LEGACY_RISK_RADAR_TRACE_IDS.map<CoverageEntry>(id => ({
    id,
    engine: 'financial_health',
    surface: 'pages/risk-radar.tsx',
    description: legacyRiskDescriptions[id] ?? id,
    required: true,
  })),
  // ── Pre-existing required dashboard / projection / risk surface traces ──
  ...Object.entries(projectionRequiredDescriptions).map<CoverageEntry>(([id, description]) => ({
    id,
    engine: id.startsWith('dashboard:wealth') ? 'wealth_layers' :
            id.startsWith('risk:') ? 'financial_health' :
            'dashboard',
    surface: dashboardSurface,
    description,
    required: true,
  })),
  // ── Wealth Strategy Hub visible KPI tiles ──
  ...Object.entries(wealthStrategyDescriptions).map<CoverageEntry>(([id, description]) => ({
    id,
    engine: 'wealth_strategy',
    surface: 'pages/wealth-strategy.tsx',
    description,
    required: true,
  })),
  // ── Property page portfolio aggregates ──
  ...PROPERTY_TRACE_IDS.map<CoverageEntry>(id => ({
    id,
    engine: 'property_engine',
    surface: 'pages/property.tsx (Portfolio tab)',
    description: propertyDescriptions[id] ?? id,
    required: true,
  })),
];

/** Map an engine key to a friendly label. */
export const ENGINE_LABELS: Record<EngineSourceKey, string> = {
  monte_carlo: 'Monte Carlo Engine',
  decision_engine: 'Decision Engine',
  forecast_engine: 'Forecast Engine',
  financial_health: 'Financial Health Engine',
  fire_engine: 'FIRE Engine',
  wealth_layers: 'Canonical Wealth Layers',
  dashboard: 'Dashboard Hero',
  projection_rows: 'Projection Rows',
  wealth_strategy: 'Wealth Strategy Hub',
  property_engine: 'Property Engine',
};

/** All required trace ids in a stable order. */
export const REQUIRED_TRACE_IDS: string[] = COVERAGE_MANIFEST.filter(e => e.required).map(e => e.id);

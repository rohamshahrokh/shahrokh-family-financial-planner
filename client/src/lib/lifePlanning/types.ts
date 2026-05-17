/**
 * Life Planning Engine — types
 *
 * Catalog of personal/career events whose financial impacts can be modelled,
 * stress-tested and used to inform Recommendation Engine V2.
 */

export type LifeEventCategory =
  | 'family'
  | 'career'
  | 'housing'
  | 'health'
  | 'wealth_transfer'
  | 'retirement';

export type LifeEventId =
  | 'child_birth'
  | 'additional_child'
  | 'childcare_change'
  | 'school_costs'
  | 'university_funding'
  | 'parental_care'
  | 'job_loss'
  | 'income_shock'
  | 'career_upgrade'
  | 'moving_house'
  | 'upsizing'
  | 'downsizing'
  | 'retirement_transition'
  | 'semi_retirement'
  | 'inheritance'
  | 'divorce_separation'
  | 'health_event'
  | 'reduced_work_capacity';

export interface LifeEventTemplate {
  id: LifeEventId;
  category: LifeEventCategory;
  label: string;
  description: string;
  /** Default $/month direct expense delta. Positive = adds expense. */
  defaultMonthlyExpenseDelta: number;
  /** Default annual income delta. Positive = adds income. */
  defaultAnnualIncomeDelta: number;
  /** Default one-time $ cost (negative = inflow). */
  defaultOneTimeCost: number;
  /** Duration in months — 0 means one-time / permanent. */
  defaultDurationMonths: number;
  /** Likelihood for stress modelling (0-1) when toggled. */
  stressProbability: number;
  /** Notes/considerations shown to user. */
  considerations: string[];
}

export interface LifeEventInstance {
  id: string;                  // unique instance id
  templateId: LifeEventId;
  /** ISO date or "YYYY-MM" of expected start. */
  startISO: string;
  /** Optional overrides of template values. */
  monthlyExpenseDelta?: number;
  annualIncomeDelta?: number;
  oneTimeCost?: number;
  durationMonths?: number;
  /** Optional probability override for stress modelling 0..1. */
  probability?: number;
  enabled?: boolean;
  notes?: string;
}

export interface YearlyLifeImpact {
  year: number;
  /** Net annual cashflow impact (negative = costs cashflow). */
  cashflowDelta: number;
  /** Annual expense delta. */
  expenseDelta: number;
  /** Annual income delta. */
  incomeDelta: number;
  /** One-time costs falling in this year. */
  oneTimeCosts: number;
  /** Active events in this year. */
  activeEvents: LifeEventId[];
}

export interface LifeImpactSummary {
  totalLifetimeNetCost: number;
  worstYear: YearlyLifeImpact | null;
  bestYear: YearlyLifeImpact | null;
  affectedYears: YearlyLifeImpact[];
  /** Annual cashflow drag averaged over impact horizon. */
  averageAnnualDrag: number;
  /** Estimated FIRE year delay vs base (positive = later). */
  fireYearDelayEstimate: number;
  /** Estimated reduction in borrowing power $ (very rough). */
  borrowingPowerImpact: number;
  /** Liquidity stress months (peak month with worst draw). */
  liquidityStressMonths: number;
  /** Stress probability of insufficient buffer over horizon 0..1. */
  stressProbability: number;
  /** Plain narrative. */
  narrative: string;
}

export interface LifePlanInputs {
  baseYear?: number;          // default current year
  horizonYears?: number;      // default 35
  monthlySurplus?: number;
  emergencyBuffer?: number;
  fireYearsToTarget?: number;
  marginalTaxRate?: number;
  events: LifeEventInstance[];
}

export interface LifePlanResult {
  events: LifeEventInstance[];
  yearly: YearlyLifeImpact[];
  summary: LifeImpactSummary;
  generatedAt: string;
}

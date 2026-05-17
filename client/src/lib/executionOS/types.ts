/**
 * Execution Operating System — types
 *
 * Translates strategy into operational execution: milestones, dependencies,
 * monthly missions, readiness tracking.
 */

export type RoadmapId =
  | 'investment_property_plan'
  | 'emergency_buffer'
  | 'debt_paydown'
  | 'super_optimisation'
  | 'fire_savings_rate'
  | 'portfolio_rebalance'
  | 'refinance_window';

export type MilestoneStatus = 'not_started' | 'in_progress' | 'blocked' | 'complete';

export interface Milestone {
  id: string;
  label: string;
  description?: string;
  status: MilestoneStatus;
  /** 0-100. */
  readinessPct: number;
  /** ISO date. */
  targetDate?: string;
  /** ISO date. */
  earliestStart?: string;
  /** Blockers must clear before this milestone. */
  dependencies?: string[];
  /** Active blockers preventing progression. */
  blockers?: string[];
  /** Monthly $ target required to hit milestone. */
  monthlyDollarTarget?: number;
  /** Plain-English reasoning. */
  reasoning?: string;
}

export interface Roadmap {
  id: RoadmapId;
  label: string;
  description: string;
  /** Overall readiness 0-100. */
  readinessPct: number;
  /** Expected completion ISO date or null if blocked. */
  estimatedCompletionISO: string | null;
  milestones: Milestone[];
  /** Active blockers across the roadmap. */
  activeBlockers: string[];
}

export interface MonthlyMission {
  month: string;          // YYYY-MM
  label: string;
  amount?: number;
  category: 'surplus' | 'debt' | 'savings' | 'investing' | 'super' | 'review';
  rationale: string;
  /** Optional cross-link to roadmap milestone. */
  milestoneId?: string;
}

export interface ExecutionOSInputs {
  cashOutsideOffset?: number;
  offsetBalance?: number;
  mortgage?: number;
  otherDebts?: number;
  monthlyIncome?: number;
  monthlyExpenses?: number;
  monthlySurplus?: number;
  emergencyBufferTarget?: number;
  depositPower?: number;
  depositReadinessPct?: number;
  mcStressFlag?: 'none' | 'moderate' | 'severe';
  fireYearsToTarget?: number;
  superCapRemaining?: number;
  marginalTaxRate?: number;
  /** True when behavioural profile signals high property bias. */
  propertyBias?: number;
  /** Behavioural fire urgency 0..1. */
  fireUrgency?: number;
  /** Macro hint. */
  macroRegime?: string;
  /** Whether portfolio engine flagged a rebalance is needed. */
  rebalanceNeeded?: boolean;
  /** Whether refinance opportunity has been detected. */
  refinanceOpportunity?: boolean;
}

export interface ExecutionOSResult {
  roadmaps: Roadmap[];
  monthlyMissions: MonthlyMission[];
  /** Active blockers across all roadmaps. */
  topBlockers: string[];
  /** Overall execution readiness 0-100. */
  overallReadinessPct: number;
  /** Plain narrative. */
  narrative: string;
  generatedAt: string;
}

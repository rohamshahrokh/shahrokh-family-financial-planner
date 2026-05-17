/**
 * Autonomous Financial OS — types
 *
 * Each detector emits zero or more `OSFinding` records. Findings are pure
 * derived signals — they never compete with Recommendation Engine V2.
 * Instead they map into the engine's `UnifiedSignals` and surface
 * priorities, so all on-screen advice continues to flow through V2.
 */

export type OSDetectorId =
  | 'refinance'
  | 'liquidity_stress'
  | 'fire_drift'
  | 'property_readiness'
  | 'debt_priority'
  | 'opportunity_window'
  | 'concentration_risk';

export type OSSeverity = 'info' | 'watch' | 'elevated' | 'critical';

export interface OSFinding {
  id: string;
  detector: OSDetectorId;
  severity: OSSeverity;
  title: string;
  detail: string;
  /** Quantified $/yr or pp where applicable. */
  quantifiedImpact?: { dollarPerYear?: number; pctPoints?: number; label?: string };
  /** Mapping hints for the Recommendation Engine V2 layer. */
  hints?: {
    actionType?: string;
    pillar?: string;
    urgency?: 'immediate' | 'this_quarter' | 'this_year' | 'monitor';
    surfaces?: Array<'best_move' | 'action_centre' | 'fire' | 'risk' | 'property' | 'debt' | 'tax'>;
  };
  /** Optional human-readable drivers. */
  drivers?: string[];
  /** Confidence 0..1 (input coverage / signal strength). */
  confidence: number;
}

export interface OSInputs {
  // Money state.
  cashOutsideOffset?: number;
  offsetBalance?: number;
  mortgage?: number;
  otherDebts?: number;
  ppor?: number;
  monthlyIncome?: number;
  monthlyExpenses?: number;
  monthlySurplus?: number;
  emergencyBufferTarget?: number;
  upcomingBills12mo?: number;

  // Rates.
  mortgageRate?: number;          // 0..1 e.g. 0.0639
  marketMortgageRate?: number;    // best obtainable rate today
  personalDebtRate?: number;
  cashHisaReturn?: number;
  etfExpectedReturn?: number;
  cryptoExpectedReturn?: number;
  propertyCagr?: number;
  marginalTaxRate?: number;

  // Property readiness.
  depositPower?: number;
  depositReadinessPct?: number;        // 0..1
  serviceabilityHeadroomMonthly?: number;
  postPurchaseBufferMonths?: number;
  hasIPStrategy?: boolean;

  // FIRE / forecast.
  fireYearsToTarget?: number;
  fireProgressPct?: number;            // 0..1
  fireMonthlyInvestmentRequired?: number;
  expenseInflationLast12moPct?: number; // 0..1
  monthlyInvestActual?: number;

  // Monte Carlo.
  mcSurvivalProbability?: number;       // 0..1
  mcStressFlag?: 'none' | 'moderate' | 'severe';

  // Concentration.
  totalNetWorth?: number;
  propertyEquity?: number;
  cryptoValue?: number;
  etfValue?: number;
  superValue?: number;

  // Macro / regime context.
  rateRegime?: 'cutting' | 'hiking' | 'flat';
  marketDrawdownPct?: number;           // 0..1 (e.g. 0.18 = market down 18%)

  // Cash window analysis.
  upcoming12moCashLow?: number;         // worst cash balance over next 12 months
}

export interface OSReport {
  findings: OSFinding[];
  generatedAt: string;
  detectorsRun: OSDetectorId[];
  inputCoverage: number; // 0..1
}

/**
 * Australian Tax Intelligence Engine — types
 *
 * Outputs are PLANNING ESTIMATES only. Not legal or tax-filing advice.
 */

export type TaxStrategyId =
  | 'negative_gearing'
  | 'cgt_optimisation'
  | 'trust_structure'
  | 'bucket_company'
  | 'debt_recycling'
  | 'offset_vs_redraw'
  | 'super_concessional'
  | 'spouse_contribution'
  | 'medicare_levy_optimisation'
  | 'hecs_help_management'
  | 'marginal_bracket_smoothing'
  | 'retirement_drawdown'
  | 'fire_withdrawal_efficiency'
  | 'asset_ownership_choice'
  | 'ppor_vs_ip_strategy';

export interface TaxStrategy {
  id: TaxStrategyId;
  label: string;
  /** 0-100 — relative score for this household. */
  score: number;
  /** Approximate $/yr tax saved. */
  estimatedAnnualSaving: number;
  /** Confidence 0-1. */
  confidence: number;
  /** Plain-English explanation. */
  reasoning: string;
  /** Cautions / planning constraints. */
  cautions: string[];
  /** Suggested next step. */
  nextStep?: string;
  /** Whether this should be flagged for professional advice. */
  recommendProfessionalAdvice?: boolean;
}

export interface TaxIntelligenceInputs {
  /** Gross annual income (primary earner). */
  grossAnnual?: number;
  /** Spouse gross annual income. */
  spouseGrossAnnual?: number;
  /** Marginal tax rate (decimal). */
  marginalTaxRate?: number;
  /** Spouse marginal tax rate (decimal). */
  spouseMarginalTaxRate?: number;
  /** Super contribution made this FY ($). */
  superContribAnnual?: number;
  /** Concessional cap remaining ($). */
  superCapRemaining?: number;
  /** Investment property cashflow before tax (rent - costs). */
  ipCashflow?: number;
  /** Investment property loan interest paid ($). */
  ipLoanInterestAnnual?: number;
  /** Unrealised capital gains on equities ($). */
  unrealisedEquityGains?: number;
  /** Unrealised capital gains on crypto ($). */
  unrealisedCryptoGains?: number;
  /** Years held — affects 50% discount logic. */
  holdingYearsEquity?: number;
  holdingYearsCrypto?: number;
  /** Offset balance ($). */
  offsetBalance?: number;
  /** Mortgage balance ($). */
  mortgage?: number;
  /** Mortgage rate (decimal). */
  mortgageRate?: number;
  /** HELP/HECS debt outstanding ($). */
  helpDebt?: number;
  /** Private health insurance held? (affects Medicare levy surcharge). */
  hasPrivateHealth?: boolean;
  /** Has dependants */
  hasDependants?: boolean;
  /** Has investment property */
  hasInvestmentProperty?: boolean;
  /** PPOR equity ($). */
  pporEquity?: number;
  /** Owns shares outside super ($). */
  equitiesOutsideSuper?: number;
  /** Family trust in place? */
  hasFamilyTrust?: boolean;
  /** Bucket / corporate beneficiary in place? */
  hasBucketCompany?: boolean;
  /** Whether near or past preservation age (60). */
  ageNearPreservation?: boolean;
  /** Are we modelling drawdown phase (post retirement). */
  drawdownPhase?: boolean;
  /** Approx super balance ($). */
  superBalance?: number;
  /** Annual lifestyle expenses target in drawdown ($). */
  drawdownExpenseTarget?: number;
}

export interface OwnershipRecommendation {
  asset: 'ip' | 'etf' | 'crypto';
  ownership: 'self' | 'spouse' | 'joint' | 'trust' | 'bucket_company' | 'super';
  reasoning: string;
}

export interface DebtStructureRecommendation {
  type: 'offset_first' | 'split_loan' | 'redraw_strategy' | 'debt_recycle' | 'keep_simple';
  reasoning: string;
  estimatedAnnualBenefit: number;
}

export interface TaxIntelligenceResult {
  totalEstimatedSaving: number;
  topStrategies: TaxStrategy[];
  allStrategies: TaxStrategy[];
  ownership: OwnershipRecommendation[];
  debtStructure: DebtStructureRecommendation[];
  longTermTaxDragPct: number;
  fireWithdrawalEfficiencyScore: number;  // 0-100
  /** True when household crosses Medicare levy surcharge threshold without PHI. */
  medicareLevySurchargeWarning: boolean;
  narrative: string;
  generatedAt: string;
}

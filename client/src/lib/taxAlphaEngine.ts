/**
 * taxAlphaEngine.ts — Australian Tax Optimisation Engine
 *
 * Detects real, actionable tax saving opportunities using verified AU tax logic.
 * All calculations derive from calcAustralianTax / calcMarginalRate from australianTax.ts.
 *
 * Strategies covered:
 *  1. Super concessional contributions (SS / carry-forward)
 *  2. Spouse super contribution splitting
 *  3. Negative gearing benefit (IPs)
 *  4. Offset vs redraw inefficiency
 *  5. Capital gains timing (discount threshold)
 *  6. Tax bracket optimisation (split income via trust / super)
 *  7. Medicare Levy Surcharge avoidance via private health cover
 *  8. Deductible debt restructure (non-deductible vs deductible debt)
 */

import {
  calcAustralianTax,
  calcMarginalRate,
  calcIncomeTax,
  calcLITO,
  calcMedicareLevy,
  calcMLS,
  type TaxInput,
  type TaxBreakdown,
} from './australianTax';
import { safeNum } from './finance';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaxAlphaRisk = 'Low' | 'Medium' | 'High';
export type TaxAlphaCategory =
  | 'super'
  | 'negative_gearing'
  | 'offset'
  | 'capital_gains'
  | 'bracket'
  | 'medicare'
  | 'debt_structure'
  | 'spouse_split';

export interface TaxAlphaStrategy {
  id:             string;
  category:       TaxAlphaCategory;
  title:          string;
  action:         string;          // one-liner: "Add $X concessional super"
  annual_saving:  number;          // AUD — 0 if cannot calculate
  annual_saving_label: string;     // "$3,200/yr" or "Up to $X/yr" or "Review with accountant"
  impact:         string;          // 1–2 sentence explanation
  compliance:     string;          // ATO/risk note
  risk:           TaxAlphaRisk;
  data_reliable:  boolean;         // false = data missing, show "Needs setup"
  priority:       number;          // 1 = highest
}

export interface TaxAlphaResult {
  strategies:            TaxAlphaStrategy[];   // all detected, sorted by priority
  top3:                  TaxAlphaStrategy[];   // top 3 by annual_saving
  total_annual_saving:   number;               // sum of reliable top-3 only
  total_saving_label:    string;
  roham_tax_now:         TaxBreakdown;
  fara_tax_now:          TaxBreakdown;
  household_tax_now:     number;
  data_coverage:         'full' | 'partial' | 'minimal'; // how much data we had
  fy:                    string;               // '2025-26'
}

export interface TaxAlphaInput {
  // Income — annual gross
  roham_annual_income:  number;   // from snap.monthly_income * 12 for Roham
  fara_annual_income:   number;   // from sf_income for Fara (or 0)
  // Super
  roham_super_balance:  number;
  fara_super_balance:   number;
  roham_employer_sg_rate: number; // e.g. 12 (percent)
  roham_salary_sacrifice_monthly: number;
  fara_employer_sg_rate: number;
  fara_salary_sacrifice_monthly: number;
  // Property
  properties: Array<{
    is_ppor:        boolean;
    weekly_rent:    number;
    loan_amount:    number;
    interest_rate:  number;       // percent, e.g. 6.5
    management_fee: number;       // percent of rent e.g. 8
    council_rates:  number;       // annual
    insurance:      number;       // annual
    maintenance:    number;       // annual
    body_corporate: number;       // annual
  }>;
  // PPOR mortgage
  mortgage_balance:     number;
  mortgage_rate:        number;   // percent e.g. 6.5
  offset_balance:       number;
  // Portfolio
  stocks_value:         number;
  crypto_value:         number;
  // Debts
  other_debts:          number;   // non-deductible personal debt
  // Tax flags
  roham_has_private_health: boolean;
  fara_has_private_health:  boolean;
  roham_has_help_debt:  boolean;
  fara_has_help_debt:   boolean;
  // CGT
  unrealised_gains:     number;   // estimated unrealised gains in portfolio
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CONCESSIONAL_CAP_2526 = 30_000;  // ATO 2025-26
const SUPER_TAX_RATE        = 0.15;    // flat rate inside super fund
// ─── Dynamic Financial Year ──────────────────────────────────────────────────
function getCurrentFY(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-based
  // ATO financial year: 1 July – 30 June
  if (m >= 7) {
    return `${y}-${String(y + 1).slice(-2)}`;
  }
  return `${y - 1}-${String(y).slice(-2)}`;
}
const FY = getCurrentFY() as import('./australianTax').TaxYear;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${Math.round(n / 100) * 100 >= 1000 ? (n / 1000).toFixed(0) + 'K' : n.toLocaleString('en-AU')}`;
  return `$${Math.round(n).toLocaleString('en-AU')}`;
}

function savingLabel(n: number, prefix = ''): string {
  if (n <= 0) return 'Review with accountant';
  return `${prefix}${fmt(n)}/yr`;
}

function baseTax(income: number): number {
  return calcIncomeTax(income, '2025-26') -
    Math.min(calcLITO(income, '2025-26'), calcIncomeTax(income, '2025-26')) +
    calcMedicareLevy(income, '2025-26');
}

// ─── Strategy 1: Concessional Super — Roham ──────────────────────────────────

function detectSuperConcessional(inp: TaxAlphaInput): TaxAlphaStrategy {
  const grossAnn      = inp.roham_annual_income;
  const sgRate        = safeNum(inp.roham_employer_sg_rate) > 0
    ? inp.roham_employer_sg_rate / 100
    : 0.12;
  const employerContr = grossAnn * sgRate;
  const ssAnn         = inp.roham_salary_sacrifice_monthly * 12;
  const totalContr    = employerContr + ssAnn;
  const roomRemaining = Math.max(0, CONCESSIONAL_CAP_2526 - totalContr);

  const dataReliable  = grossAnn > 0;

  let saving = 0;
  let action = '';
  let impact = '';

  if (dataReliable && roomRemaining > 1000) {
    // Tax saved = (marginal rate - super tax rate) × contribution amount
    // But cap at realistic salary sacrifice (limited by take-home)
    const marginal    = calcMarginalRate(grossAnn, '2025-26') + 0.02; // +Medicare
    const effectiveSaving = (marginal - SUPER_TAX_RATE) * roomRemaining;
    saving = Math.max(0, effectiveSaving);
    action = `Salary sacrifice ${fmt(roomRemaining)} to super (fill concessional cap)`;
    impact = `Your employer SG (${(sgRate * 100).toFixed(1)}%) contributes ${fmt(Math.round(employerContr))} — you have ${fmt(Math.round(roomRemaining))} of the ${fmt(CONCESSIONAL_CAP_2526)} concessional cap unused. ` +
      `Contributions taxed at 15% inside super vs your ${(marginal * 100).toFixed(0)}% marginal rate — a ${((marginal - SUPER_TAX_RATE) * 100).toFixed(0)}¢-per-dollar saving.`;
  } else if (dataReliable && roomRemaining <= 1000) {
    action = 'Concessional cap fully utilised';
    impact = `Employer SG (${fmt(Math.round(employerContr))}) + salary sacrifice (${fmt(ssAnn)}) = ${fmt(Math.round(totalContr))} — cap of ${fmt(CONCESSIONAL_CAP_2526)} is nearly full. Well optimised.`;
  } else {
    action = 'Set up income in Settings to calculate super room';
    impact = 'Cannot calculate concessional cap room without annual income data.';
  }

  return {
    id:             'super_concessional_roham',
    category:       'super',
    title:          'Super Concessional Contribution',
    action,
    annual_saving:  saving,
    annual_saving_label: dataReliable && roomRemaining > 1000 ? savingLabel(saving) : (dataReliable ? 'Cap utilised ✓' : 'Needs setup'),
    impact,
    compliance:     'ATO 2025-26 cap: $30,000/year (employer SG + salary sacrifice). Excess contributions taxed at marginal rate. Carry-forward unused caps available if super balance < $500K.',
    risk:           'Low',
    data_reliable:  dataReliable,
    priority:       1,
  };
}

// ─── Strategy 2: Spouse Contribution Splitting ───────────────────────────────

function detectSpouseContribSplit(inp: TaxAlphaInput): TaxAlphaStrategy {
  const rohamGross = inp.roham_annual_income;
  const faraGross  = inp.fara_annual_income;
  const dataReliable = rohamGross > 0 && faraGross >= 0;

  // Only beneficial if Roham earns significantly more than Fara
  const gapSignificant = rohamGross - faraGross > 40_000;
  const rohamMarginal  = calcMarginalRate(rohamGross, '2025-26');
  const faraMarginal   = calcMarginalRate(faraGross, '2025-26');
  const bracketGap     = rohamMarginal - faraMarginal;

  // Max 85% of concessional contributions can be split to spouse
  const sgRate         = (inp.roham_employer_sg_rate || 12) / 100;
  const splitableContr = rohamGross * sgRate * 0.85;
  const saving         = bracketGap > 0.05 ? splitableContr * bracketGap : 0;

  return {
    id:             'spouse_super_split',
    category:       'spouse_split',
    title:          'Spouse Super Contribution Splitting',
    action:         gapSignificant && saving > 500
      ? `Split ${fmt(Math.round(splitableContr))} of Roham's employer super to Fara's super`
      : 'Income gap too small to benefit materially',
    annual_saving:  saving,
    annual_saving_label: saving > 500 ? savingLabel(saving, 'Up to ') : 'Minimal benefit',
    impact: gapSignificant
      ? `Roham's marginal rate (${(rohamMarginal * 100).toFixed(0)}%) vs Fara's (${(faraMarginal * 100).toFixed(0)}%) — splitting super grows the lower-taxed fund, reduces estate/tax risk at retirement, and can improve Fara's co-contribution eligibility.`
      : `Both earners are in similar tax brackets — contribution splitting provides limited benefit currently. Revisit if incomes diverge further.`,
    compliance:     'ATO allows up to 85% of previous year\'s concessional contributions to be split. Fara must be under preservation age or under 65 and not retired. Lodge request via Fara\'s super fund within the financial year.',
    risk:           'Low',
    data_reliable:  dataReliable,
    priority:       5,
  };
}

// ─── Strategy 3: Negative Gearing ────────────────────────────────────────────

function detectNegativeGearing(inp: TaxAlphaInput): TaxAlphaStrategy {
  const annualIncome   = inp.roham_annual_income;
  const marginalRate   = calcMarginalRate(annualIncome, '2025-26') + 0.02; // +Medicare
  const dataReliable   = inp.properties.length > 0 && annualIncome > 0;

  let totalNGLoss = 0;
  const propertyDetails: string[] = [];

  for (const p of inp.properties) {
    if (p.is_ppor) continue; // PPOR costs not deductible
    const rentalAnn   = safeNum(p.weekly_rent) * 52;
    const interestAnn = safeNum(p.loan_amount) * (safeNum(p.interest_rate) || 6.5) / 100;
    const mgmtFee     = (safeNum(p.management_fee) / 100) * rentalAnn;
    const costsAnn    = mgmtFee + safeNum(p.council_rates) + safeNum(p.insurance) + safeNum(p.maintenance) + safeNum(p.body_corporate);
    const ngLoss      = interestAnn + costsAnn - rentalAnn;
    if (ngLoss > 0) {
      totalNGLoss += ngLoss;
      propertyDetails.push(`NG loss ${fmt(Math.round(ngLoss))}/yr on IP loan of ${fmt(Math.round(p.loan_amount))}`);
    }
  }

  const saving = totalNGLoss > 0 ? totalNGLoss * marginalRate : 0;

  return {
    id:             'negative_gearing',
    category:       'negative_gearing',
    title:          'Negative Gearing Deduction',
    action:         totalNGLoss > 0
      ? `Claim ${fmt(Math.round(totalNGLoss))} net rental loss → ${fmt(Math.round(saving))} tax reduction`
      : dataReliable ? 'Properties are cash-flow positive — no NG benefit' : 'Add IP details in Property page',
    annual_saving:  saving,
    annual_saving_label: saving > 0 ? savingLabel(saving) : (dataReliable ? 'Cash-flow positive' : 'Needs IP data'),
    impact: totalNGLoss > 0
      ? `Investment property interest + costs exceed rental income by ${fmt(Math.round(totalNGLoss))}/year. This loss offsets your taxable income at your ${(marginalRate * 100).toFixed(0)}% combined rate, reducing tax by ~${fmt(Math.round(saving))}. ` +
        propertyDetails.join('; ')
      : 'Your IPs are positively geared — all income and profit is taxable but the positive cashflow is a net benefit.',
    compliance:     'ATO: only deductible for investment properties, not PPOR. Interest, management fees, council rates, insurance, repairs, body corporate are deductible. Depreciation (Div 43 / 40) further reduces taxable income — get a quantity surveyor report.',
    risk:           'Low',
    data_reliable:  dataReliable,
    priority:       2,
  };
}

// ─── Strategy 4: Offset vs Redraw inefficiency ───────────────────────────────

function detectOffsetInefficiency(inp: TaxAlphaInput): TaxAlphaStrategy {
  const mortgage      = inp.mortgage_balance;
  const offsetBal     = inp.offset_balance;
  const mortgageRate  = (inp.mortgage_rate || 6.5) / 100;
  const annualSaving  = offsetBal * mortgageRate;
  const dataReliable  = mortgage > 0;

  // If user has meaningful cash NOT in offset, flag it
  const suggestMoveAmt = 0; // we don't know exact non-offset cash amount here, offset_balance is already there

  return {
    id:             'offset_account',
    category:       'offset',
    title:          'Mortgage Offset Optimisation',
    action:         offsetBal > 0
      ? `Keep ${fmt(offsetBal)} in offset — saves ${fmt(Math.round(annualSaving))}/yr in non-deductible interest`
      : mortgage > 0 ? 'Set offset balance in Settings to calculate interest saving' : 'No PPOR mortgage detected',
    annual_saving:  annualSaving,
    annual_saving_label: offsetBal > 0 ? savingLabel(annualSaving) : 'Needs setup',
    impact: offsetBal > 0
      ? `${fmt(offsetBal)} in your offset account saves ${fmt(Math.round(annualSaving))}/year in PPOR mortgage interest at ${inp.mortgage_rate || 6.5}% p.a. — a guaranteed, tax-free return equal to your mortgage rate. Better than any high-interest savings account after tax.`
      : 'Offset balance not configured. If you have an offset account, keeping salary credit there (even briefly) reduces interest daily.',
    compliance:     'Offset interest savings are not taxable income — unlike interest earned in a savings account. PPOR interest is not deductible. The offset provides a guaranteed after-tax return equal to the mortgage rate. Using redraw instead of offset removes flexibility and may trigger tax issues if you later redraw for investment purposes.',
    risk:           'Low',
    data_reliable:  dataReliable,
    priority:       3,
  };
}

// ─── Strategy 5: Capital Gains Timing ────────────────────────────────────────

function detectCapitalGainsTiming(inp: TaxAlphaInput): TaxAlphaStrategy {
  const unrealisedGains = inp.unrealised_gains;
  const annualIncome    = inp.roham_annual_income;
  const marginalRate    = calcMarginalRate(annualIncome, '2025-26') + 0.02;
  const portfolioVal    = inp.stocks_value + inp.crypto_value;
  const dataReliable    = portfolioVal > 0;

  // CGT discount: 50% for assets held > 12 months
  // Saving = difference between realising now (no discount) vs holding 12+ months (50% discount)
  const estimatedGain   = unrealisedGains > 0 ? unrealisedGains : portfolioVal * 0.15; // 15% estimated gain if not provided
  const taxIfRealisedNow     = estimatedGain * marginalRate;
  const taxIfRealisedAfter12m = (estimatedGain * 0.5) * marginalRate;
  const discountSaving   = unrealisedGains > 0 ? taxIfRealisedNow - taxIfRealisedAfter12m : 0;

  // Also: harvest losses to offset gains
  const harvestNote = portfolioVal > 50_000
    ? 'Consider tax-loss harvesting before 30 June — selling underperforming positions crystallises losses that offset capital gains.'
    : '';

  return {
    id:             'cgt_timing',
    category:       'capital_gains',
    title:          'Capital Gains Timing & Discount',
    action: estimatedGain > 5_000
      ? `Hold assets 12+ months for 50% CGT discount — saves ${fmt(Math.round(taxIfRealisedNow - taxIfRealisedAfter12m))} on ${fmt(Math.round(estimatedGain))} gain`
      : 'No significant unrealised gains detected',
    annual_saving:  discountSaving,
    annual_saving_label: discountSaving > 0 ? savingLabel(discountSaving, 'Up to ') : (dataReliable ? 'Low gains — monitor' : 'Needs portfolio data'),
    impact: portfolioVal > 0
      ? `Assets held >12 months attract a 50% CGT discount, halving the taxable gain. At your ${(marginalRate * 100).toFixed(0)}% rate, realising a ${fmt(Math.round(estimatedGain))} gain before 12 months costs ~${fmt(Math.round(taxIfRealisedNow))} vs ~${fmt(Math.round(taxIfRealisedAfter12m))} after. ${harvestNote}`
      : 'No portfolio data — add stocks/crypto holdings to calculate CGT position.',
    compliance:     'ATO: 50% CGT discount applies to Australian residents who hold assets for more than 12 months. Crypto is a CGT asset. Loss-harvesting is legitimate but wash-sale rules may apply. Each disposal event is a taxable event for crypto.',
    risk:           'Low',
    data_reliable:  dataReliable,
    priority:       4,
  };
}

// ─── Strategy 6: Medicare Levy Surcharge ─────────────────────────────────────

function detectMLSSaving(inp: TaxAlphaInput): TaxAlphaStrategy {
  const rohamIncome = inp.roham_annual_income;
  const faraIncome  = inp.fara_annual_income;
  const combined    = rohamIncome + faraIncome;

  // 2025-26 MLS threshold: single $101,000 / family $202,000
  const rohamMLS = calcMLS(rohamIncome, inp.roham_has_private_health, combined, '2025-26');
  const faraMLS  = calcMLS(faraIncome,  inp.fara_has_private_health,  combined, '2025-26');
  const totalMLS = rohamMLS + faraMLS;

  // Typical family hospital cover: ~$3,000–$4,500/yr — compare to MLS cost
  const privateHealthEstimate = 3_500;
  const netSaving = totalMLS > privateHealthEstimate ? totalMLS - privateHealthEstimate : 0;
  const dataReliable = rohamIncome > 0;

  return {
    id:             'mls_avoidance',
    category:       'medicare',
    title:          'Medicare Levy Surcharge Avoidance',
    action: totalMLS > 0
      ? `Private hospital cover costs ~${fmt(privateHealthEstimate)}/yr — avoids ${fmt(Math.round(totalMLS))} MLS`
      : 'MLS not triggered — income below threshold or already covered',
    annual_saving:  netSaving,
    annual_saving_label: netSaving > 0 ? savingLabel(netSaving) : (totalMLS > 0 ? 'Already covered ✓' : 'Not applicable'),
    impact: totalMLS > 0 && !inp.roham_has_private_health
      ? `Combined income of ${fmt(Math.round(combined))} triggers the Medicare Levy Surcharge (${rohamIncome > 158_000 ? '1.5' : rohamIncome > 118_000 ? '1.25' : '1.0'}%). Adding private hospital cover (~${fmt(privateHealthEstimate)}/yr) eliminates the MLS of ${fmt(Math.round(totalMLS))}/yr — a net saving of ${fmt(Math.round(netSaving))}.`
      : `Private hospital cover is in place — MLS not applicable. ✓`,
    compliance:     'ATO: MLS applies to higher earners without eligible private hospital cover. Extras-only cover does NOT waive MLS — must have hospital cover. 2025-26 single threshold: $101,000; family: $202,000.',
    risk:           'Low',
    data_reliable:  dataReliable,
    priority:       6,
  };
}

// ─── Strategy 7: Deductible Debt Restructure ─────────────────────────────────

function detectDebtStructure(inp: TaxAlphaInput): TaxAlphaStrategy {
  const otherDebts    = inp.other_debts; // personal, non-deductible
  const mortgage      = inp.mortgage_balance;
  const annualIncome  = inp.roham_annual_income;
  const marginalRate  = calcMarginalRate(annualIncome, '2025-26') + 0.02;

  // If they have personal debt AND investment property with deductible loan:
  // Restructuring to maximise deductible debt (pay down PPOR, draw down IP) saves tax
  const hasIpLoans = inp.properties.some(p => !p.is_ppor && p.loan_amount > 0);
  const dataReliable = otherDebts > 0 || mortgage > 0;

  // Annual benefit: interest on restructured amount × marginal rate
  // Assuming ~8% on personal debt → converting to deductible saves tax
  const personalDebtInterest = otherDebts * 0.08;
  const deductibleBenefit    = personalDebtInterest * marginalRate;

  return {
    id:             'debt_restructure',
    category:       'debt_structure',
    title:          'Deductible Debt Restructure',
    action: otherDebts > 5_000
      ? `Review ${fmt(otherDebts)} personal debt — restructure to maximise deductible borrowings`
      : 'Non-deductible debt is minimal — maintain current structure',
    annual_saving:  deductibleBenefit,
    annual_saving_label: otherDebts > 5_000 && deductibleBenefit > 500 ? savingLabel(deductibleBenefit, 'Up to ') : 'Review with advisor',
    impact: otherDebts > 0
      ? `${fmt(otherDebts)} in non-deductible personal/consumer debt costs ~${fmt(Math.round(personalDebtInterest))}/yr in after-tax interest. ` +
        (hasIpLoans
          ? `With investment property loans in place, a debt recycling strategy (using PPOR surplus to pay down non-deductible debt while drawing investment loans) could make ~${fmt(Math.round(deductibleBenefit))} of annual interest tax-deductible.`
          : `Prioritise eliminating personal debt before investing — the guaranteed after-tax return exceeds most investment yields.`)
      : 'Non-deductible debt is minimal. Focus surplus on deductible investment loans and super.',
    compliance:     'ATO: interest on borrowings to produce assessable income is deductible (Div 8-1 ITAA97). Debt recycling must be structured carefully — mixing investment and personal use of redraw facilities can create mixed-purpose debt issues. Seek licensed advice before restructuring.',
    risk:           'Medium',
    data_reliable:  dataReliable,
    priority:       7,
  };
}

// ─── Strategy 8: Tax Bracket Optimisation ────────────────────────────────────

function detectBracketOptimisation(inp: TaxAlphaInput): TaxAlphaStrategy {
  const rohamGross = inp.roham_annual_income;
  const faraGross  = inp.fara_annual_income;
  const dataReliable = rohamGross > 0;

  // Check if Roham is in 37% or 45% bracket — room to shift income to spouse/super
  const rohamMarginal = calcMarginalRate(rohamGross, '2025-26');
  const faraMarginal  = calcMarginalRate(faraGross, '2025-26');
  const bracketGap    = rohamMarginal - faraMarginal;

  // How much income to shift to bring Roham to next lower bracket boundary
  let shiftAmt = 0;
  let saving = 0;
  let action = '';

  if (rohamGross > 190_000) {
    // In 45% bracket — shift to 37% threshold
    shiftAmt = rohamGross - 190_000;
    saving = shiftAmt * (0.45 - (faraMarginal + 0.02));
    action = `Roham is in 45% bracket — ${fmt(shiftAmt)} above $190K threshold`;
  } else if (rohamGross > 135_000) {
    shiftAmt = rohamGross - 135_000;
    saving = shiftAmt * (0.37 - (faraMarginal + 0.02));
    action = `Roham is in 37% bracket — ${fmt(shiftAmt)} above $135K threshold`;
  } else {
    action = 'Income within 30% bracket — minimal bracket arbitrage available';
  }

  return {
    id:             'bracket_optimisation',
    category:       'bracket',
    title:          'Income & Tax Bracket Optimisation',
    action:         bracketGap > 0.05 && saving > 1000 ? action : 'Bracket gap minimal — incomes well-balanced',
    annual_saving:  saving > 1000 ? saving : 0,
    annual_saving_label: saving > 1000 ? savingLabel(saving, 'Up to ') : 'Minimal benefit',
    impact: rohamMarginal > 0.30
      ? `Roham's income (${fmt(Math.round(rohamGross))}) is taxed at ${(rohamMarginal * 100).toFixed(0)}% marginal rate. ` +
        (faraGross > 0
          ? `Fara's income (${fmt(Math.round(faraGross))}) is taxed at ${(faraMarginal * 100).toFixed(0)}%. Income splitting via trusts, spouse super, or investment structures can shift taxable income to the lower bracket, saving up to ${fmt(Math.round(saving))}/yr.`
          : 'Review income-producing assets structure with a tax adviser to reduce household effective rate.')
      : `Both earners are in a mid-range bracket (${(rohamMarginal * 100).toFixed(0)}%). Limited bracket arbitrage available at current income levels.`,
    compliance:     'ATO: income splitting must reflect genuine economic arrangements. Dividend streaming through family trusts is subject to TR 97/12 and Part IVA. Spouse super splitting is the lowest-risk income-splitting tool.',
    risk:           'High',
    data_reliable:  dataReliable,
    priority:       8,
  };
}

// ─── Main Engine ──────────────────────────────────────────────────────────────

export function computeTaxAlpha(inp: TaxAlphaInput): TaxAlphaResult {
  const year = FY;

  // Current tax position
  const rohamTaxInput: TaxInput = {
    grossSalary:           inp.roham_annual_income,
    payPeriod:             'annual',
    taxYear:               year,
    superIncluded:         false,
    superRate:             inp.roham_employer_sg_rate || 12,
    salarySacrifice:       inp.roham_salary_sacrifice_monthly * 12,
    hasPrivateHospitalCover: inp.roham_has_private_health,
    hasHelpDebt:           inp.roham_has_help_debt,
    familyIncome:          inp.roham_annual_income + inp.fara_annual_income,
  };

  const faraTaxInput: TaxInput = {
    grossSalary:           inp.fara_annual_income,
    payPeriod:             'annual',
    taxYear:               year,
    superIncluded:         false,
    superRate:             inp.fara_employer_sg_rate || 12,
    salarySacrifice:       inp.fara_salary_sacrifice_monthly * 12,
    hasPrivateHospitalCover: inp.fara_has_private_health,
    hasHelpDebt:           inp.fara_has_help_debt,
    familyIncome:          inp.roham_annual_income + inp.fara_annual_income,
  };

  const rohamTax = calcAustralianTax(rohamTaxInput);
  const faraTax  = inp.fara_annual_income > 0 ? calcAustralianTax(faraTaxInput) : calcAustralianTax({ ...faraTaxInput, grossSalary: 0 });
  const householdTax = rohamTax.totalDeductions + faraTax.totalDeductions;

  // Run all strategies
  const strategies: TaxAlphaStrategy[] = [
    detectSuperConcessional(inp),
    detectNegativeGearing(inp),
    detectOffsetInefficiency(inp),
    detectCapitalGainsTiming(inp),
    detectSpouseContribSplit(inp),
    detectMLSSaving(inp),
    detectDebtStructure(inp),
    detectBracketOptimisation(inp),
  ].sort((a, b) => b.annual_saving - a.annual_saving);

  // Top 3 by saving, reliable only
  const top3 = strategies
    .filter(s => s.data_reliable)
    .slice(0, 3);

  const totalSaving = top3
    .filter(s => s.annual_saving > 0)
    .reduce((sum, s) => sum + s.annual_saving, 0);

  // Data coverage assessment
  const hasIncome    = inp.roham_annual_income > 0;
  const hasProps     = inp.properties.length > 0;
  const hasPortfolio = inp.stocks_value > 0 || inp.crypto_value > 0;
  const dataCoverage: 'full' | 'partial' | 'minimal' =
    hasIncome && hasProps && hasPortfolio ? 'full' :
    hasIncome ? 'partial' : 'minimal';

  return {
    strategies,
    top3,
    total_annual_saving:  totalSaving,
    total_saving_label:   totalSaving > 0 ? `Up to ${fmt(Math.round(totalSaving))}/yr` : 'Review with accountant',
    roham_tax_now:        rohamTax,
    fara_tax_now:         faraTax,
    household_tax_now:    householdTax,
    data_coverage:        dataCoverage,
    fy:                   FY,
  };
}

// ─── Build input from Supabase snapshot ──────────────────────────────────────

export function buildTaxAlphaInput(snap: any, properties: any[]): TaxAlphaInput {
  const n = (v: any) => safeNum(v);

  // Fara income: try sf_income data via snap, fallback to 0
  const rohamMonthly = n(snap.monthly_income);
  const faraMonthly  = n(snap.fara_monthly_income) || 0;

  return {
    roham_annual_income:  rohamMonthly * 12,
    fara_annual_income:   faraMonthly * 12,
    roham_super_balance:  n(snap.roham_super_balance) || n(snap.super_balance) * 0.6,
    fara_super_balance:   n(snap.fara_super_balance)  || n(snap.super_balance) * 0.4,
    roham_employer_sg_rate:         n(snap.roham_employer_contrib) || 12,
    roham_salary_sacrifice_monthly: n(snap.roham_salary_sacrifice),
    fara_employer_sg_rate:          n(snap.fara_employer_contrib)  || 12,
    fara_salary_sacrifice_monthly:  n(snap.fara_salary_sacrifice)  || 0,
    properties: (properties || []).map((p: any) => ({
      is_ppor:        p.is_ppor || p.property_type === 'PPOR' || false,
      weekly_rent:    n(p.weekly_rent),
      loan_amount:    n(p.loan_balance || p.loan_amount || p.mortgage_balance || 0),
      interest_rate:  n(p.interest_rate) || 6.5,
      management_fee: n(p.management_fee) || 8,
      council_rates:  n(p.council_rates)  || 1_800,
      insurance:      n(p.insurance)      || 1_200,
      maintenance:    n(p.maintenance)    || 1_500,
      body_corporate: n(p.body_corporate) || 0,
    })),
    mortgage_balance:  n(snap.mortgage),
    mortgage_rate:     n(snap.mortgage_rate) || 6.5,
    offset_balance:    n(snap.offset_balance),
    stocks_value:      n(snap.stocks),
    crypto_value:      n(snap.crypto),
    other_debts:       n(snap.other_debts),
    roham_has_private_health: Boolean(snap.roham_has_private_health),
    fara_has_private_health:  Boolean(snap.fara_has_private_health),
    roham_has_help_debt:      Boolean(snap.roham_has_help_debt),
    fara_has_help_debt:       Boolean(snap.fara_has_help_debt),
    unrealised_gains:         n(snap.unrealised_gains),
  };
}

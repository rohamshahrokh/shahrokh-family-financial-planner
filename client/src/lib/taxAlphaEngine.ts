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
// Centralized tax engine (FWL_TAX_REFORM_MODELLING_ENGINE) — the strategy
// generator delegates per-property regime classification here so it cannot
// recommend invalid NG deductions for quarantined post-cutoff IPs.
import {
  classifyPropertyTaxRegime,
  type PropertyTaxClassification,
} from './tax/taxRulesEngine';

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
  | 'spouse_split'
  // Regime-aware (reform) categories — surface alternatives when NG is
  // quarantined for post-cutoff established IPs.
  | 'new_build_strategy'
  | 'yield_optimisation'
  | 'hold_period_optimisation'
  | 'loss_bank_exit'
  | 'future_cgt_offset';

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
  // FOLLOW_UP: Active scenario the strategy list was computed against.
  // Drives the visible scenario banner in tax-alpha.tsx so the user can
  // see at a glance whether the recommendations reflect current law or
  // the proposed 2027 reform.
  active_scenario:       'current_law' | 'proposed_reform' | 'custom';
  /** True iff any IP is quarantined under the active scenario. */
  reform_has_quarantined_ips: boolean;
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
    // Regime-aware fields — drive grandfathering / carve-out logic via
    // taxRulesEngine.classifyPropertyTaxRegime. Optional for back-compat.
    id?:             string | number;
    property_type?:  string;      // ESTABLISHED | NEW_BUILD | UNKNOWN
    contract_date?:  string;      // ISO YYYY-MM-DD
    purchase_date?:  string;      // ISO YYYY-MM-DD
    settlement_date?:string;      // ISO YYYY-MM-DD
    annual_depreciation?: number;
  }>;
  /**
   * Active tax-policy scenario. When "proposed_reform", quarantined
   * post-cutoff established IPs do NOT generate a wage-deductible NG
   * refund — the strategy engine surfaces loss-bank-aware alternatives
   * (new-build, yield, hold-period, future CGT offset, exit planning)
   * instead of the invalid current-law NG suggestion.
   */
  active_scenario?: 'current_law' | 'proposed_reform' | 'custom';
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

// ─── Strategy 3: Negative Gearing (regime-aware) ─────────────────────────────
//
// SINGLE SOURCE OF TRUTH: taxRulesEngine.classifyPropertyTaxRegime.
//
// Under "current_law" — behaviour unchanged: combined NG loss across IPs
// generates a wage-deductible refund at the marginal rate.
//
// Under "proposed_reform" — every property is classified individually.
// Quarantined post-cutoff established IPs do NOT generate a wage refund;
// the loss accrues to the per-property loss bank. The strategy only
// surfaces NG benefit for IPs that remain eligible (grandfathered or
// carve-out). Quarantined IPs trigger the regime-aware alternative
// strategies (new build, yield, hold period, future CGT offset, exit).

interface NgClassifiedProperty {
  loss: number;
  classification: PropertyTaxClassification;
  raw: TaxAlphaInput['properties'][number];
}

function classifyIpsForScenario(inp: TaxAlphaInput): NgClassifiedProperty[] {
  const scenario = inp.active_scenario ?? 'current_law';
  const out: NgClassifiedProperty[] = [];
  for (const p of inp.properties) {
    if (p.is_ppor) continue;
    const rentalAnn   = safeNum(p.weekly_rent) * 52;
    const interestAnn = safeNum(p.loan_amount) * (safeNum(p.interest_rate) || 6.5) / 100;
    const mgmtFee     = (safeNum(p.management_fee) / 100) * rentalAnn;
    const costsAnn    = mgmtFee + safeNum(p.council_rates) + safeNum(p.insurance) +
                        safeNum(p.maintenance) + safeNum(p.body_corporate);
    const depreciation = safeNum(p.annual_depreciation);
    const taxableResult = rentalAnn - interestAnn - costsAnn - depreciation;
    const ngLoss = taxableResult < 0 ? -taxableResult : 0;
    const classification = classifyPropertyTaxRegime(
      {
        propertyId: String(p.id ?? `ip-${out.length}`),
        contractDate: p.contract_date ?? p.purchase_date,
        purchaseDate: p.purchase_date,
        settlementDate: p.settlement_date,
        propertyType: (p.property_type as any) ?? 'ESTABLISHED',
        annualRent: rentalAnn,
        annualHoldingCosts: costsAnn,
        annualInterest: interestAnn,
        annualDepreciation: depreciation,
        annualWageIncome: inp.roham_annual_income + inp.fara_annual_income,
      },
      scenario,
    );
    out.push({ loss: ngLoss, classification, raw: p });
  }
  return out;
}

function detectNegativeGearing(inp: TaxAlphaInput): TaxAlphaStrategy {
  const annualIncome   = inp.roham_annual_income;
  const marginalRate   = calcMarginalRate(annualIncome, '2025-26') + 0.02; // +Medicare
  const dataReliable   = inp.properties.length > 0 && annualIncome > 0;
  const scenario       = inp.active_scenario ?? 'current_law';

  const classified = classifyIpsForScenario(inp);

  // Only properties that remain wage-deductible under the active scenario
  // are eligible for a current-style NG refund. Quarantined IPs return 0.
  const eligibleLosses = classified.filter(c =>
    c.loss > 0 && c.classification.negativeGearingEligible,
  );
  const quarantinedLosses = classified.filter(c =>
    c.loss > 0 && !c.classification.negativeGearingEligible,
  );

  const totalEligibleLoss = eligibleLosses.reduce((s, c) => s + c.loss, 0);
  const totalQuarantinedLoss = quarantinedLosses.reduce((s, c) => s + c.loss, 0);
  const saving = totalEligibleLoss > 0 ? totalEligibleLoss * marginalRate : 0;

  const reformActive = scenario === 'proposed_reform';
  const hasQuarantined = quarantinedLosses.length > 0;

  // Build action / impact lines.
  const ngDetail = eligibleLosses.length > 0
    ? eligibleLosses
        .map(c => `NG loss ${fmt(Math.round(c.loss))}/yr (${c.classification.status.isGrandfathered ? 'grandfathered' : 'carve-out'})`)
        .join('; ')
    : '';

  let action: string;
  let impact: string;
  let compliance: string;

  // FOLLOW_UP: Under proposed reform, whenever ANY IP is quarantined, the
  // visible card must be the "Quarantined Under Reform" variant — even when
  // other IPs remain eligible. The current-law "Claim ... rental loss →
  // tax reduction" wording is invalid under reform regardless of whether
  // a separate carve-out refund exists; that smaller refund is surfaced as
  // a sub-line and the user is pointed to the regime-aware alternatives.
  if (reformActive && hasQuarantined) {
    if (totalEligibleLoss > 0) {
      action = `Reform: NG quarantined on ${quarantinedLosses.length} IP(s) — loss bank +${fmt(Math.round(totalQuarantinedLoss))}/yr. Carve-out IP(s) still refund ${fmt(Math.round(saving))}.`;
      impact = `Under the proposed 2027 reform, post-cutoff established dwellings cannot offset rental losses against wages. ${quarantinedLosses.length} of your IP(s) are quarantined and accumulate ${fmt(Math.round(totalQuarantinedLoss))}/yr in the per-property loss bank. ${eligibleLosses.length} carve-out / grandfathered IP(s) still produce a wage refund of ~${fmt(Math.round(saving))}. See the New-build / Yield / Hold-period / CGT-offset / Exit-planning strategies below for the regime-aware playbook.`;
      compliance = 'Proposed 2027 reform: established-dwelling losses quarantined to the property. Indexed cost-base on disposal. New builds, BTR and affordable housing remain carved out. Modelling only — not personal tax advice.';
    } else {
      action = `Reform: NG quarantined on ${quarantinedLosses.length} IP(s) — loss bank +${fmt(Math.round(totalQuarantinedLoss))}/yr accumulates instead of refund`;
      impact = `Under the proposed 2027 reform, post-cutoff established dwellings cannot offset rental losses against wages. Your ${quarantinedLosses.length} affected IP(s) accumulate ${fmt(Math.round(totalQuarantinedLoss))} in the per-property loss bank this year. The bank consumes against future rental profit or the eventual CGT gain. See the New-build / Yield / Hold-period / CGT-offset / Exit-planning strategies below.`;
      compliance = 'Proposed 2027 reform: established-dwelling losses quarantined to the property. Indexed cost-base on disposal. New builds, BTR and affordable housing remain carved out. Modelling only — not personal tax advice.';
    }
  } else if (totalEligibleLoss > 0) {
    action = `Claim ${fmt(Math.round(totalEligibleLoss))} net rental loss → ${fmt(Math.round(saving))} tax reduction`;
    impact = `Investment property interest + costs exceed rental income by ${fmt(Math.round(totalEligibleLoss))}/year. This loss offsets your taxable income at your ${(marginalRate * 100).toFixed(0)}% combined rate, reducing tax by ~${fmt(Math.round(saving))}. ${ngDetail}`;
    compliance = 'ATO: only deductible for investment properties, not PPOR. Interest, management fees, council rates, insurance, repairs, body corporate are deductible. Depreciation (Div 43 / 40) further reduces taxable income — get a quantity surveyor report.';
  } else {
    action = dataReliable ? 'Properties are cash-flow positive — no NG benefit' : 'Add IP details in Property page';
    impact = 'Your IPs are positively geared — all income and profit is taxable but the positive cashflow is a net benefit.';
    compliance = 'ATO: only deductible for investment properties, not PPOR.';
  }

  const labelText = saving > 0
    ? savingLabel(saving)
    : (reformActive && hasQuarantined ? 'Quarantined under reform' : (dataReliable ? 'Cash-flow positive' : 'Needs IP data'));

  return {
    id:             'negative_gearing',
    category:       'negative_gearing',
    title:          reformActive && hasQuarantined
      ? 'Negative Gearing — Quarantined Under Reform'
      : 'Negative Gearing Deduction',
    action,
    annual_saving:  saving,
    annual_saving_label: labelText,
    impact,
    compliance,
    risk:           reformActive && hasQuarantined ? 'Medium' : 'Low',
    data_reliable:  dataReliable,
    priority:       2,
  };
}

// ─── Regime-aware alternatives (active when reform quarantines losses) ──────

function detectNewBuildStrategy(inp: TaxAlphaInput): TaxAlphaStrategy {
  const scenario = inp.active_scenario ?? 'current_law';
  const classified = classifyIpsForScenario(inp);
  const quarantined = classified.filter(c => c.loss > 0 && !c.classification.negativeGearingEligible);
  const dataReliable = inp.properties.length > 0 && inp.roham_annual_income > 0;
  const marginalRate = calcMarginalRate(inp.roham_annual_income, '2025-26') + 0.02;

  // The carve-out preserves a refund equal to what the quarantined IPs lose.
  const reformActive = scenario === 'proposed_reform';
  const quarantinedLoss = quarantined.reduce((s, c) => s + c.loss, 0);
  const potentialRefund = reformActive ? quarantinedLoss * marginalRate : 0;

  return {
    id:             'new_build_strategy',
    category:       'new_build_strategy',
    title:          'New-Build / BTR Carve-Out Strategy',
    action: reformActive && quarantined.length > 0
      ? `Direct next acquisition to new builds / BTR / affordable to preserve up to ${fmt(Math.round(potentialRefund))}/yr in wage-deductible NG`
      : reformActive
        ? 'Future acquisitions in new-build / BTR / affordable retain current-law NG and 50% CGT discount'
        : 'New-build advantage relevant only under proposed reform',
    annual_saving:  potentialRefund,
    annual_saving_label: reformActive && potentialRefund > 0
      ? savingLabel(potentialRefund, 'Up to ')
      : (reformActive ? 'Reserve future acquisitions' : 'Not active under current law'),
    impact: reformActive
      ? `Under the proposed reform, only new builds, BTR, and affordable housing keep wage-deductible negative gearing and the 50% CGT discount. Pivoting future buys into these carve-outs recovers refund capacity lost on the ${quarantined.length} quarantined IP(s).`
      : 'Carve-out is meaningful only when reform is active. Under current law all IPs already qualify for wage-deductible NG and the 50% CGT discount.',
    compliance:     'Carve-out scope per the proposed reform: NEW_BUILD, BUILD_TO_RENT, AFFORDABLE_HOUSING. Confirm contracts and property-type certification before relying on the carve-out.',
    risk:           'Low',
    data_reliable:  dataReliable,
    priority:       reformActive ? 2 : 8,
  };
}

function detectYieldOptimisation(inp: TaxAlphaInput): TaxAlphaStrategy {
  const scenario = inp.active_scenario ?? 'current_law';
  const classified = classifyIpsForScenario(inp);
  const quarantined = classified.filter(c => c.loss > 0 && !c.classification.negativeGearingEligible);
  const reformActive = scenario === 'proposed_reform';
  const dataReliable = inp.properties.length > 0;

  // Estimate the rent uplift required to neutralise the quarantined loss.
  const totalQuarantinedLoss = quarantined.reduce((s, c) => s + c.loss, 0);
  const weeklyUplift = totalQuarantinedLoss > 0
    ? Math.ceil((totalQuarantinedLoss / 52) / Math.max(1, quarantined.length))
    : 0;

  return {
    id:             'yield_optimisation',
    category:       'yield_optimisation',
    title:          'Yield Optimisation on Quarantined IPs',
    action: reformActive && quarantined.length > 0
      ? `Lift average rent ~${fmt(weeklyUplift)}/week per quarantined IP to neutralise the ${fmt(Math.round(totalQuarantinedLoss))}/yr loss bank growth`
      : 'Yield optimisation always beneficial — quarantine adds urgency under reform',
    annual_saving:  reformActive ? totalQuarantinedLoss : 0,
    annual_saving_label: reformActive && totalQuarantinedLoss > 0
      ? savingLabel(totalQuarantinedLoss, 'Neutralises ')
      : 'Indirect benefit',
    impact: reformActive
      ? `Quarantined IPs lose the wage refund — net cashflow is purely rent − costs. Lifting yield (rent reviews, value-add reno, depreciation refresh, vacancy reduction) is the single highest-leverage lever, because every dollar lifts cashflow AND avoids further loss-bank growth.`
      : 'Even under current law, lifting yield improves post-tax cashflow — but the lost refund cushion is missing under reform.',
    compliance:     'Tenancy law: rent reviews must comply with state-specific notice/frequency rules. Capex and depreciation schedules (Div 43/40) refresh requires a quantity surveyor.',
    risk:           'Low',
    data_reliable:  dataReliable,
    priority:       reformActive && quarantined.length > 0 ? 2 : 7,
  };
}

function detectHoldPeriodOptimisation(inp: TaxAlphaInput): TaxAlphaStrategy {
  const scenario = inp.active_scenario ?? 'current_law';
  const classified = classifyIpsForScenario(inp);
  const reformActive = scenario === 'proposed_reform';
  const quarantined = classified.filter(c => !c.classification.negativeGearingEligible);
  const dataReliable = inp.properties.length > 0;

  return {
    id:             'hold_period_optimisation',
    category:       'hold_period_optimisation',
    title:          'Hold-Period Optimisation (Indexed Cost Base)',
    action: reformActive && quarantined.length > 0
      ? 'Lengthen hold period to maximise indexation uplift on the cost base and accumulate loss-bank credits used on disposal'
      : 'Hold ≥ 12 months under current law to retain the 50% CGT discount',
    annual_saving:  0, // saving accrues at disposal, not annually
    annual_saving_label: reformActive
      ? 'Disposal-time benefit'
      : '50% CGT discount @ 12mo',
    impact: reformActive
      ? `Reform replaces the 50% CGT discount with an indexed cost base. Each additional year of hold inflates the cost base by the indexation factor — and lets more of the loss bank consume against the final capital gain. Short holds are the worst outcome under reform.`
      : 'Holding > 12 months unlocks the 50% CGT discount under current law.',
    compliance:     'Indexation rate is set by the proposed reform regime — refer to taxRulesEngine. Loss bank applies against the indexed gain on disposal (not against unrelated income).',
    risk:           'Low',
    data_reliable:  dataReliable,
    priority:       reformActive ? 3 : 8,
  };
}

function detectFutureCgtOffset(inp: TaxAlphaInput): TaxAlphaStrategy {
  const scenario = inp.active_scenario ?? 'current_law';
  const classified = classifyIpsForScenario(inp);
  const reformActive = scenario === 'proposed_reform';
  const quarantined = classified.filter(c => c.loss > 0 && !c.classification.negativeGearingEligible);
  const totalQuarantinedLoss = quarantined.reduce((s, c) => s + c.loss, 0);
  const dataReliable = inp.properties.length > 0;
  // Marginal benefit when the loss bank is applied against an eventual gain.
  const marginalRate = calcMarginalRate(inp.roham_annual_income, '2025-26') + 0.02;
  const deferredBenefit = reformActive ? totalQuarantinedLoss * marginalRate : 0;

  return {
    id:             'future_cgt_offset',
    category:       'future_cgt_offset',
    title:          'Future CGT Offset via Loss Bank',
    action: reformActive && quarantined.length > 0
      ? `Plan disposals so accumulated ${fmt(Math.round(totalQuarantinedLoss))}/yr loss bank consumes against the indexed capital gain at sale`
      : 'No quarantined loss bank under current law',
    annual_saving:  deferredBenefit,
    annual_saving_label: reformActive && deferredBenefit > 0
      ? savingLabel(deferredBenefit, 'Deferred ')
      : 'Not applicable',
    impact: reformActive
      ? `The annual ${fmt(Math.round(totalQuarantinedLoss))} quarantined loss does not disappear — it accrues to the per-property loss bank and consumes against the indexed gain at disposal. Sequencing high-gain disposals against the IP with the largest bank converts deferred losses into a tax credit on capital gains.`
      : 'Loss bank is only created when reform quarantines a loss. Under current law NG losses flow against wages immediately, with no deferred CGT credit.',
    compliance:     'Per the proposed reform, loss bank applies against the indexed capital gain on disposal of the SAME property. Cross-property pooling is NOT permitted.',
    risk:           'Medium',
    data_reliable:  dataReliable,
    priority:       reformActive && quarantined.length > 0 ? 3 : 8,
  };
}

function detectLossBankExit(inp: TaxAlphaInput): TaxAlphaStrategy {
  const scenario = inp.active_scenario ?? 'current_law';
  const classified = classifyIpsForScenario(inp);
  const reformActive = scenario === 'proposed_reform';
  const quarantined = classified.filter(c => c.loss > 0 && !c.classification.negativeGearingEligible);
  const dataReliable = inp.properties.length > 0;
  const totalQuarantinedLoss = quarantined.reduce((s, c) => s + c.loss, 0);

  return {
    id:             'loss_bank_exit',
    category:       'loss_bank_exit',
    title:          'Loss-Bank-Aware Exit Planning',
    action: reformActive && quarantined.length > 0
      ? `Audit each quarantined IP's loss-bank trajectory; trigger disposal when bank ≈ projected capital gain to maximise CGT offset`
      : 'No quarantined IPs — exit planning driven by ordinary equity / cashflow goals',
    annual_saving:  0,
    annual_saving_label: reformActive ? 'Disposal-time planning' : 'Not applicable',
    impact: reformActive
      ? `An IP that is bleeding cashflow AND quarantined is the worst held asset on the portfolio. Modelling each IP's projected loss bank vs projected capital gain (via the CGT simulator) reveals the optimal disposal year — when the bank fully offsets the indexed gain. Holding past that point destroys value.`
      : 'Under current law, exit planning is dominated by yield, leverage and lifestyle goals; no loss bank to balance against the gain.',
    compliance:     'Modelling only — actual disposal triggers stamp duty, agent fees, capital gains and potential mortgage break costs. Engage a registered tax agent before transacting.',
    risk:           'Medium',
    data_reliable:  dataReliable,
    priority:       reformActive && quarantined.length > 0 ? 3 : 9,
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

  // Run all strategies. Regime-aware alternatives are appended and
  // self-gate to priority 8/9 under current law (so they don't pollute
  // the top-3 unless reform is actually active).
  const scenario = inp.active_scenario ?? 'current_law';
  const strategies: TaxAlphaStrategy[] = [
    detectSuperConcessional(inp),
    detectNegativeGearing(inp),
    detectOffsetInefficiency(inp),
    detectCapitalGainsTiming(inp),
    detectSpouseContribSplit(inp),
    detectMLSSaving(inp),
    detectDebtStructure(inp),
    detectBracketOptimisation(inp),
    detectNewBuildStrategy(inp),
    detectYieldOptimisation(inp),
    detectHoldPeriodOptimisation(inp),
    detectFutureCgtOffset(inp),
    detectLossBankExit(inp),
  ].sort((a, b) => {
    // Reform scenario: prefer regime-aware alternatives over current-law
    // NG suggestions when NG has been quarantined to zero.
    if (a.annual_saving === b.annual_saving) return a.priority - b.priority;
    return b.annual_saving - a.annual_saving;
  });
  void scenario;

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

  // ── #AuditTaxAlphaIncomeSource — temporary diagnostic logging ──────
  // Emits the final calc-chain values so the displayed “Current Tax
  // Position” numbers can be reconciled against the source-of-truth
  // table from buildTaxAlphaInput. Audit-only.
  if (typeof window !== 'undefined') {
    /* eslint-disable no-console */
    console.groupCollapsed('%c[tax-alpha-audit] computeTaxAlpha result', 'color:#34d399;font-weight:bold');
    console.table({
      'Roham annualGross':         rohamTax.annualGross,
      'Roham taxableIncome':       rohamTax.taxableIncome,
      'Roham incomeTax':           rohamTax.incomeTax,
      'Roham medicareLevy':        rohamTax.medicareLevy,
      'Roham medicareSurcharge':   rohamTax.medicareLevySurcharge,
      'Roham helpRepayment':       rohamTax.helpRepayment,
      'Roham totalDeductions':     rohamTax.totalDeductions,
      'Roham netAnnual':           rohamTax.netAnnual,
      'Roham effectiveTaxRate':    rohamTax.effectiveTaxRate,
      'Roham marginalRate':        rohamTax.marginalRate,
      'Fara annualGross':          faraTax.annualGross,
      'Fara taxableIncome':        faraTax.taxableIncome,
      'Fara totalDeductions':      faraTax.totalDeductions,
      'Household totalDeductions': householdTax,
    });
    console.groupEnd();
    /* eslint-enable no-console */
  }

  // Detect whether the current-scenario classification produced any
  // quarantined IPs — used for the visible scenario banner + tests.
  const reformHasQuarantined = scenario === 'proposed_reform' &&
    classifyIpsForScenario(inp).some(
      c => c.loss > 0 && !c.classification.negativeGearingEligible,
    );

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
    active_scenario:      scenario,
    reform_has_quarantined_ips: reformHasQuarantined,
  };
}

// ─── Build input from Supabase snapshot ──────────────────────────────────────
//
// Salary source precedence (fixes #FixTaxAlphaUsesSavedTaxProfile):
//   1. If `taxProfile.override_active === true` and roham_salary/fara_salary
//      are set on the profile, USE THEM. The Tax Calculator + Tax Alpha now
//      share the same source the user explicitly saved.
//   2. Else, if `canonicalIncome` is provided (ledger-derived per-person
//      annualised salary), use that.
//   3. Else, fall back to legacy snapshot fields (monthly_income * 12) so
//      callers that don't have the new context still get a result.
//
// Tax flags (super rate, salary sacrifice, private health, HELP debt) are
// always preferred from the saved tax profile when set there — those fields
// are naturally owned by sf_tax_profile and the snapshot copies are stale
// secondaries.

/** Minimal shape required from canonical income selector. */
export interface CanonicalIncomeLike {
  perPerson: {
    roham: { annual: number };
    fara:  { annual: number };
  };
}

/**
 * Minimal shape required from the shared household-tax selector. Kept as
 * a structural interface so `taxAlphaEngine.ts` does not import
 * `householdTaxInputs.ts` (avoids a hard cycle and lets tests pass a
 * literal object). See `householdTaxInputs.ts` for the canonical type.
 */
export interface HouseholdTaxInputsLike {
  rohamAnnual:    number;
  faraAnnual:     number;
  overrideActive: boolean;
}

export function buildTaxAlphaInput(
  snap: any,
  properties: any[],
  taxProfile?: any,
  canonicalIncome?: CanonicalIncomeLike,
  household?: HouseholdTaxInputsLike,
): TaxAlphaInput {
  const n = (v: any) => safeNum(v);

  // ── Salary source ───────────────────────────────────────────────────
  // Priority (fix #FixTaxAlphaWrongIncomeSourceStillBroken):
  //   1. `household` from the shared selector — single source of truth.
  //      The Tax Calculator and Tax Alpha now both flow through
  //      `getHouseholdTaxInputs`, so passing it here means the engine
  //      cannot diverge from the Calculator's totals.
  //   2. (Legacy callers only) Re-derive locally: profile override >
  //      canonical > zero. We DO NOT fall back to snap.monthly_income
  //      directly — that field is the COMBINED household figure and
  //      using it as Roham's salary double-counts Fara.
  const overrideActive    = Boolean(taxProfile && taxProfile.override_active === true);
  const profileRohamAnnual = n(taxProfile?.roham_salary);
  const profileFaraAnnual  = n(taxProfile?.fara_salary);
  const canonRohamAnnual   = n(canonicalIncome?.perPerson?.roham?.annual);
  const canonFaraAnnual    = n(canonicalIncome?.perPerson?.fara?.annual);

  let rohamAnnual: number;
  let faraAnnual:  number;
  let pickedPath:  'household' | 'profile-override' | 'canonical' | 'zero';
  if (household) {
    // Shared selector path — preferred.
    rohamAnnual = n(household.rohamAnnual);
    faraAnnual  = n(household.faraAnnual);
    pickedPath  = 'household';
  } else if (overrideActive && (profileRohamAnnual > 0 || profileFaraAnnual > 0)) {
    rohamAnnual = profileRohamAnnual > 0 ? profileRohamAnnual : canonRohamAnnual;
    faraAnnual  = profileFaraAnnual  > 0 ? profileFaraAnnual  : canonFaraAnnual;
    pickedPath  = 'profile-override';
  } else if (canonRohamAnnual > 0 || canonFaraAnnual > 0) {
    rohamAnnual = canonRohamAnnual;
    faraAnnual  = canonFaraAnnual;
    pickedPath  = 'canonical';
  } else {
    rohamAnnual = 0;
    faraAnnual  = 0;
    pickedPath  = 'zero';
  }

  // ── #AuditTaxAlphaIncomeSource — temporary diagnostic logging ──────
  // Emits every contributing source the engine considered, which branch
  // of the priority hierarchy actually fired, and the resulting annual
  // gross. Audit-only — remove once #11 is fully validated in prod.
  // No financial logic, no DB writes, no PII beyond what user sees on the page.
  if (typeof window !== 'undefined') {
    /* eslint-disable no-console */
    console.groupCollapsed('%c[tax-alpha-audit] buildTaxAlphaInput sources', 'color:#34d399;font-weight:bold');
    console.table({
      'snap.monthly_income (COMBINED household)': n(snap?.monthly_income),
      'snap.roham_monthly_income (per-person)':   n(snap?.roham_monthly_income),
      'snap.fara_monthly_income  (per-person)':   n(snap?.fara_monthly_income),
      'snap.rental_income_total':                 n(snap?.rental_income_total),
      'snap.other_income':                        n(snap?.other_income),
    });
    console.table({
      'taxProfile.override_active':   overrideActive,
      'taxProfile.roham_salary':      profileRohamAnnual,
      'taxProfile.fara_salary':       profileFaraAnnual,
      'canonicalIncome.roham.annual': canonRohamAnnual,
      'canonicalIncome.fara.annual':  canonFaraAnnual,
      'household.rohamAnnual':        n(household?.rohamAnnual),
      'household.faraAnnual':         n(household?.faraAnnual),
      'household.overrideActive':     household?.overrideActive ?? null,
    });
    console.table({
      'PICKED PATH':           pickedPath,
      'roham_annual_income':   rohamAnnual,
      'fara_annual_income':    faraAnnual,
    });
    console.groupEnd();
    /* eslint-enable no-console */
  }

  // ── Tax flags: prefer tax profile when explicitly set ─────────────────
  const tp = taxProfile ?? {};
  const pickBool = (a: any, b: any): boolean =>
    (a !== undefined && a !== null) ? Boolean(a) : Boolean(b);
  const pickNum = (a: any, b: any): number => (n(a) > 0 ? n(a) : n(b));

  return {
    roham_annual_income:  rohamAnnual,
    fara_annual_income:   faraAnnual,
    roham_super_balance:  n(snap.roham_super_balance) || n(snap.super_balance) * 0.6,
    fara_super_balance:   n(snap.fara_super_balance)  || n(snap.super_balance) * 0.4,
    roham_employer_sg_rate:         pickNum(tp.roham_super_rate,      snap.roham_employer_contrib) || 12,
    roham_salary_sacrifice_monthly: pickNum(tp.roham_salary_sacrifice, snap.roham_salary_sacrifice),
    fara_employer_sg_rate:          pickNum(tp.fara_super_rate,       snap.fara_employer_contrib) || 12,
    fara_salary_sacrifice_monthly:  pickNum(tp.fara_salary_sacrifice,  snap.fara_salary_sacrifice),
    properties: (properties || []).map((p: any) => ({
      id:              p.id,
      is_ppor:         p.is_ppor || p.property_type === 'PPOR' || p.type === 'ppor' || false,
      weekly_rent:     n(p.weekly_rent),
      loan_amount:     n(p.loan_balance || p.loan_amount || p.mortgage_balance || 0),
      interest_rate:   n(p.interest_rate) || 6.5,
      management_fee:  n(p.management_fee) || 8,
      council_rates:   n(p.council_rates)  || 1_800,
      insurance:       n(p.insurance)      || 1_200,
      maintenance:     n(p.maintenance)    || 1_500,
      body_corporate:  n(p.body_corporate) || 0,
      // Regime-aware fields passed through to taxRulesEngine.
      property_type:   p.property_type,
      contract_date:   p.contract_date,
      purchase_date:   p.purchase_date,
      settlement_date: p.settlement_date,
      annual_depreciation: n(p.annual_depreciation),
    })),
    mortgage_balance:  n(snap.mortgage),
    mortgage_rate:     n(snap.mortgage_rate) || 6.5,
    offset_balance:    n(snap.offset_balance),
    stocks_value:      n(snap.stocks),
    crypto_value:      n(snap.crypto),
    other_debts:       n(snap.other_debts),
    roham_has_private_health: pickBool(tp.roham_has_private_health, snap.roham_has_private_health),
    fara_has_private_health:  pickBool(tp.fara_has_private_health,  snap.fara_has_private_health),
    roham_has_help_debt:      pickBool(tp.roham_has_help_debt,      snap.roham_has_help_debt),
    fara_has_help_debt:       pickBool(tp.fara_has_help_debt,       snap.fara_has_help_debt),
    unrealised_gains:         n(snap.unrealised_gains),
  };
}

/**
 * Australian Tax Intelligence Engine — analyseTaxStrategies.
 *
 * Deterministic planning estimates. Not tax advice — every output is labelled
 * as a planning estimate where it would normally surface to UI.
 */

import type {
  DebtStructureRecommendation,
  OwnershipRecommendation,
  TaxIntelligenceInputs,
  TaxIntelligenceResult,
  TaxStrategy,
} from './types';

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function marginalRateFor(income: number | undefined): number {
  if (income == null) return 0.325;
  if (income <= 18200) return 0.0;
  if (income <= 45000) return 0.19;
  if (income <= 135000) return 0.325;
  if (income <= 190000) return 0.37;
  return 0.45;
}

// Strategy builders — each returns null when not applicable.

function negativeGearing(i: TaxIntelligenceInputs): TaxStrategy | null {
  if (!i.hasInvestmentProperty) return null;
  const loss = Math.max(0, -(i.ipCashflow ?? 0));
  if (loss <= 0) return null;
  const mtr = i.marginalTaxRate ?? marginalRateFor(i.grossAnnual);
  const saving = Math.round(loss * mtr);
  return {
    id: 'negative_gearing',
    label: 'Negative gearing optimisation',
    score: clamp(saving / 200, 0, 100),
    estimatedAnnualSaving: saving,
    confidence: 0.7,
    reasoning: `Investment property is generating ~$${loss.toLocaleString()} of deductible loss. ` +
      `At a ${(mtr * 100).toFixed(1)}% marginal rate this offsets ~$${saving.toLocaleString()} of tax per year.`,
    cautions: [
      'Holding for cashflow loss alone is unwise — total return must justify.',
      'Negative gearing tax rules subject to legislative change risk.',
    ],
    nextStep: 'Confirm deductibility of each cost component with tax agent.',
  };
}

function cgtOptimisation(i: TaxIntelligenceInputs): TaxStrategy | null {
  const equityYears = i.holdingYearsEquity ?? 0;
  const cryptoYears = i.holdingYearsCrypto ?? 0;
  const equityGain = i.unrealisedEquityGains ?? 0;
  const cryptoGain = i.unrealisedCryptoGains ?? 0;
  if (equityGain + cryptoGain <= 0) return null;
  const mtr = i.marginalTaxRate ?? marginalRateFor(i.grossAnnual);
  const discountedRate = mtr * 0.5;
  // Saving from waiting until 12 months for the half held under a year.
  let saving = 0;
  if (equityYears < 1 && equityGain > 0) saving += equityGain * (mtr - discountedRate);
  if (cryptoYears < 1 && cryptoGain > 0) saving += cryptoGain * (mtr - discountedRate);
  if (saving < 200) return null;
  return {
    id: 'cgt_optimisation',
    label: 'CGT — 12-month timing',
    score: clamp(saving / 200, 0, 100),
    estimatedAnnualSaving: Math.round(saving),
    confidence: 0.85,
    reasoning: `Holding select positions past 12 months can halve the CGT rate. ` +
      `Estimated saving if you delay realisation: ~$${Math.round(saving).toLocaleString()}.`,
    cautions: ['Do not let the tax tail wag the investment dog.', 'Market timing risk increases with longer hold.'],
    nextStep: 'Map each lot to its 12-month maturity date before realising.',
  };
}

function trustStructure(i: TaxIntelligenceInputs): TaxStrategy | null {
  const total = (i.grossAnnual ?? 0) + (i.spouseGrossAnnual ?? 0);
  if (total < 220_000 && !(i.equitiesOutsideSuper ?? 0)) return null;
  const skew = Math.abs((i.grossAnnual ?? 0) - (i.spouseGrossAnnual ?? 0));
  const benefit = Math.round(skew * 0.06);
  if (benefit < 800) return null;
  return {
    id: 'trust_structure',
    label: 'Family trust streaming',
    score: clamp(benefit / 80, 0, 100),
    estimatedAnnualSaving: benefit,
    confidence: 0.5,
    reasoning: `Significant income skew (~$${skew.toLocaleString()} spread) suggests streaming investment income to the lower-rate spouse (or via a family trust) could save ~$${benefit.toLocaleString()}/yr.`,
    cautions: ['Trust setup + accounting costs ~$1.5-3k/yr.', 'Anti-avoidance rules apply; cannot simply alienate income.'],
    nextStep: 'Run trust-vs-personal modelling with accountant for next FY.',
    recommendProfessionalAdvice: true,
  };
}

function bucketCompany(i: TaxIntelligenceInputs): TaxStrategy | null {
  if (!i.hasFamilyTrust && (i.grossAnnual ?? 0) < 180_000) return null;
  // Bucket company saves the difference between top MTR and 30% company rate.
  const trustIncome = Math.max(0, ((i.equitiesOutsideSuper ?? 0) * 0.05));
  if (trustIncome < 5000) return null;
  const topMtr = 0.47;
  const corp = 0.30;
  const benefit = Math.round(trustIncome * (topMtr - corp));
  return {
    id: 'bucket_company',
    label: 'Bucket / corporate beneficiary',
    score: clamp(benefit / 100, 0, 100),
    estimatedAnnualSaving: benefit,
    confidence: 0.5,
    reasoning: `Park distributable trust profit in a corporate beneficiary at the 30% rate vs personal top rate — saves ~$${benefit.toLocaleString()}/yr while franking credits accumulate.`,
    cautions: ['Div 7A loan rules apply on any drawdown.', 'Adds compliance complexity.'],
    nextStep: 'Talk to accountant about Div 7A schedule and timing.',
    recommendProfessionalAdvice: true,
  };
}

function debtRecycling(i: TaxIntelligenceInputs): TaxStrategy | null {
  const offset = i.offsetBalance ?? 0;
  const mortgage = i.mortgage ?? 0;
  const rate = i.mortgageRate ?? 0.0625;
  if (offset < 20_000 || mortgage <= 0) return null;
  const mtr = i.marginalTaxRate ?? marginalRateFor(i.grossAnnual);
  const recyclable = Math.min(offset, mortgage);
  // Saved interest deductibility roughly: recycled balance * rate * mtr (interest becomes deductible).
  const benefit = Math.round(recyclable * rate * mtr * 0.7);
  if (benefit < 500) return null;
  return {
    id: 'debt_recycling',
    label: 'Debt recycling',
    score: clamp(benefit / 60, 0, 100),
    estimatedAnnualSaving: benefit,
    confidence: 0.55,
    reasoning: `Convert non-deductible home loan debt into deductible investment debt. Estimated tax benefit ~$${benefit.toLocaleString()}/yr.`,
    cautions: ['Requires split loan facility.', 'Increases gross debt — only suitable if cashflow + risk capacity intact.'],
    nextStep: 'Confirm split-loan availability with lender before drawing.',
    recommendProfessionalAdvice: true,
  };
}

function offsetVsRedraw(i: TaxIntelligenceInputs): TaxStrategy | null {
  const offset = i.offsetBalance ?? 0;
  if (offset < 5000) return null;
  // Offset is preferable for future deductibility — score by balance.
  const benefit = Math.round(offset * 0.02);
  return {
    id: 'offset_vs_redraw',
    label: 'Offset vs redraw discipline',
    score: clamp(benefit / 50, 0, 100),
    estimatedAnnualSaving: benefit,
    confidence: 0.7,
    reasoning: `Funds parked in offset preserve future-purpose flexibility. Drawing from redraw and re-borrowing for investments can taint deductibility (purpose test).`,
    cautions: ['Once you redraw and pay down, re-borrowing for investment is harder to deduct.'],
    nextStep: 'Keep investment funds in offset; use a fresh split for investment debt.',
  };
}

function superConcessional(i: TaxIntelligenceInputs): TaxStrategy | null {
  const cap = i.superCapRemaining ?? 0;
  if (cap < 1000) return null;
  const mtr = i.marginalTaxRate ?? marginalRateFor(i.grossAnnual);
  const benefit = Math.round(cap * (mtr - 0.15));
  if (benefit < 300) return null;
  return {
    id: 'super_concessional',
    label: 'Super concessional contributions',
    score: clamp(benefit / 100, 0, 100),
    estimatedAnnualSaving: benefit,
    confidence: 0.92,
    reasoning: `~$${cap.toLocaleString()} of concessional cap is unused. ` +
      `Salary-sacrificing this saves ~$${benefit.toLocaleString()} this year (MTR ${(mtr * 100).toFixed(1)}% vs 15% contributions tax).`,
    cautions: ['Funds are preserved until age 60 (or condition of release).', 'Watch Division 293 if income > $250k.'],
    nextStep: 'Set up salary sacrifice arrangement before EOFY.',
  };
}

function spouseContribution(i: TaxIntelligenceInputs): TaxStrategy | null {
  const spouseIncome = i.spouseGrossAnnual ?? 0;
  if (spouseIncome >= 40000 || spouseIncome === 0) return null;
  // Up to $540 spouse offset.
  const benefit = 540;
  return {
    id: 'spouse_contribution',
    label: 'Spouse super contribution',
    score: 40,
    estimatedAnnualSaving: benefit,
    confidence: 0.95,
    reasoning: `Spouse income below $40k — a $3,000 non-concessional spouse contribution yields up to $540 tax offset and grows the long-term pool.`,
    cautions: ['Offset reduces above $37k spouse income.'],
    nextStep: 'Make spouse contribution before 30 June.',
  };
}

function medicareLevy(i: TaxIntelligenceInputs): TaxStrategy | null {
  const family = (i.grossAnnual ?? 0) + (i.spouseGrossAnnual ?? 0);
  if (family < 180_000 || i.hasPrivateHealth) return null;
  const surchargeRate = family > 280_000 ? 0.015 : family > 224_000 ? 0.0125 : 0.01;
  const benefit = Math.round(family * surchargeRate);
  return {
    id: 'medicare_levy_optimisation',
    label: 'Medicare Levy Surcharge avoidance',
    score: clamp(benefit / 30, 0, 100),
    estimatedAnnualSaving: benefit,
    confidence: 0.9,
    reasoning: `Family income above $180k without private hospital cover triggers a ${(surchargeRate * 100).toFixed(2)}% surcharge — taking out basic hospital cover typically costs less than the levy.`,
    cautions: ['Cover must be a complying hospital policy, not just extras.'],
    nextStep: 'Compare basic hospital cover quotes against the surcharge cost.',
  };
}

function hecsOptimisation(i: TaxIntelligenceInputs): TaxStrategy | null {
  const help = i.helpDebt ?? 0;
  if (help < 1000) return null;
  return {
    id: 'hecs_help_management',
    label: 'HELP/HECS repayment timing',
    score: 20,
    estimatedAnnualSaving: 0,
    confidence: 0.7,
    reasoning: `Outstanding HELP of ~$${help.toLocaleString()} is indexed annually. Voluntary repayment may not be optimal vs investing the spread, but the 1 June indexation date is worth timing.`,
    cautions: ['Indexation can exceed mortgage rate after-tax.', 'No tax deduction for HELP repayments.'],
    nextStep: 'Decide voluntary repayment vs invest in early May each year.',
  };
}

function bracketSmoothing(i: TaxIntelligenceInputs): TaxStrategy | null {
  const income = i.grossAnnual ?? 0;
  if (income <= 135_000 && income > 140_000) return null;
  if (income > 130_000 && income < 145_000) {
    return {
      id: 'marginal_bracket_smoothing',
      label: 'Marginal bracket smoothing',
      score: 50,
      estimatedAnnualSaving: 0,
      confidence: 0.6,
      reasoning: `Income is near the $135,000 bracket boundary — concessional super, charitable giving, or work-related deductions can keep more income below the 37% step.`,
      cautions: ['Avoid deductions that destroy value just to save tax.'],
      nextStep: 'Map deductible items vs target gross before EOFY.',
    };
  }
  return null;
}

function retirementDrawdown(i: TaxIntelligenceInputs): TaxStrategy | null {
  if (!i.drawdownPhase && !i.ageNearPreservation) return null;
  const sup = i.superBalance ?? 0;
  const expense = i.drawdownExpenseTarget ?? 70_000;
  if (sup < 200_000) return null;
  return {
    id: 'retirement_drawdown',
    label: 'Retirement drawdown ordering',
    score: 70,
    estimatedAnnualSaving: Math.round(expense * 0.10),
    confidence: 0.6,
    reasoning: `Drawing super pension income tax-free post-60, then layering in low-rate personal income (e.g. franked dividends), can substantially reduce total drawdown tax vs equal blended draws.`,
    cautions: ['Transfer balance cap currently $1.9m for pension phase.', 'Strategy depends on ages of both partners.'],
    nextStep: 'Model 5-year drawdown sequence before retirement date.',
    recommendProfessionalAdvice: true,
  };
}

function fireWithdrawalEfficiency(i: TaxIntelligenceInputs): TaxStrategy | null {
  if (i.drawdownPhase) return null;
  return {
    id: 'fire_withdrawal_efficiency',
    label: 'FIRE bridge-year tax structuring',
    score: 50,
    estimatedAnnualSaving: 0,
    confidence: 0.5,
    reasoning: `Bridging from FIRE date to super preservation age (60) is the highest-tax stretch in a FIRE plan — placing growth assets outside super in tax-efficient wrappers (e.g. ETFs harvested at <$18,200 effective income) preserves more capital.`,
    cautions: ['Sequencing risk dominates returns risk in early FIRE years.'],
    nextStep: 'Plan a $0-18k tax-free CGT harvest band each FY of the bridge.',
  };
}

function assetOwnership(i: TaxIntelligenceInputs): TaxStrategy | null {
  const spouseMtr = i.spouseMarginalTaxRate ?? marginalRateFor(i.spouseGrossAnnual);
  const mtr = i.marginalTaxRate ?? marginalRateFor(i.grossAnnual);
  if (Math.abs(mtr - spouseMtr) < 0.05) return null;
  return {
    id: 'asset_ownership_choice',
    label: 'Asset ownership choice',
    score: 60,
    estimatedAnnualSaving: 0,
    confidence: 0.65,
    reasoning: `Significant MTR gap between you (${(mtr * 100).toFixed(1)}%) and spouse (${(spouseMtr * 100).toFixed(1)}%). New income-producing assets are typically better held in the lower-rate spouse's name.`,
    cautions: ['CGT consequences if existing assets are transferred.', 'Joint ownership splits 50/50 by law in most cases.'],
    nextStep: 'Hold the next ETF/IP purchase in the lower-MTR name where appropriate.',
  };
}

function pporVsIp(i: TaxIntelligenceInputs): TaxStrategy | null {
  if (!i.hasInvestmentProperty && (i.pporEquity ?? 0) < 200_000) return null;
  return {
    id: 'ppor_vs_ip_strategy',
    label: 'PPOR vs IP strategy',
    score: 45,
    estimatedAnnualSaving: 0,
    confidence: 0.5,
    reasoning: `Main-residence CGT exemption is the largest tax shield available. Hold growth-heavy property as PPOR where possible; hold yield-heavy property as IP for deductibility.`,
    cautions: ['6-year absence rule and pre-CGT rules are nuanced.', 'Rent-vest decisions are not purely tax-driven.'],
    nextStep: 'Tag each property by primary purpose (CGT shield vs income deduction).',
  };
}

export function analyseTaxStrategies(i: TaxIntelligenceInputs): TaxIntelligenceResult {
  const all: TaxStrategy[] = [];
  const push = (s: TaxStrategy | null) => { if (s) all.push(s); };
  push(negativeGearing(i));
  push(cgtOptimisation(i));
  push(trustStructure(i));
  push(bucketCompany(i));
  push(debtRecycling(i));
  push(offsetVsRedraw(i));
  push(superConcessional(i));
  push(spouseContribution(i));
  push(medicareLevy(i));
  push(hecsOptimisation(i));
  push(bracketSmoothing(i));
  push(retirementDrawdown(i));
  push(fireWithdrawalEfficiency(i));
  push(assetOwnership(i));
  push(pporVsIp(i));

  all.sort((a, b) => b.estimatedAnnualSaving - a.estimatedAnnualSaving);
  const topStrategies = all.slice(0, 5);
  const totalEstimatedSaving = all.reduce((acc, s) => acc + (s.estimatedAnnualSaving || 0), 0);

  const ownership: OwnershipRecommendation[] = [];
  const mtr = i.marginalTaxRate ?? marginalRateFor(i.grossAnnual);
  const spouseMtr = i.spouseMarginalTaxRate ?? marginalRateFor(i.spouseGrossAnnual);
  if ((i.equitiesOutsideSuper ?? 0) > 50_000) {
    ownership.push({
      asset: 'etf',
      ownership: spouseMtr < mtr - 0.05 ? 'spouse' : 'joint',
      reasoning: spouseMtr < mtr ? 'Lower MTR spouse holds dividend-bearing ETFs to reduce annual tax leakage.' : 'Joint ownership splits both income and CGT 50/50.',
    });
  }
  if (i.hasInvestmentProperty) {
    ownership.push({
      asset: 'ip',
      ownership: (i.ipCashflow ?? 0) < 0 ? (mtr > spouseMtr ? 'self' : 'spouse') : 'spouse',
      reasoning: (i.ipCashflow ?? 0) < 0
        ? 'Negatively-geared IP usually best held by the higher-MTR earner for greater deductibility — until it turns cashflow positive.'
        : 'Positively-geared IP best in lower-MTR name.',
    });
  }
  if ((i.unrealisedCryptoGains ?? 0) > 10_000) {
    ownership.push({
      asset: 'crypto',
      ownership: 'self',
      reasoning: 'Crypto held personally; if joint, ensure exchange KYC reflects ownership for CGT events.',
    });
  }

  const debtStructure: DebtStructureRecommendation[] = [];
  if ((i.mortgage ?? 0) > 100_000) {
    debtStructure.push({
      type: 'offset_first',
      reasoning: 'Keep surplus in offset to preserve future deductibility purpose for any drawn loan splits.',
      estimatedAnnualBenefit: Math.round((i.offsetBalance ?? 0) * (i.mortgageRate ?? 0.0625)),
    });
    if ((i.offsetBalance ?? 0) > 50_000) {
      debtStructure.push({
        type: 'debt_recycle',
        reasoning: 'Set up a clean split loan and recycle offset funds into investment debt as discipline allows.',
        estimatedAnnualBenefit: Math.round((i.offsetBalance ?? 0) * (i.mortgageRate ?? 0.0625) * (mtr) * 0.7),
      });
    }
  }
  if (debtStructure.length === 0) {
    debtStructure.push({
      type: 'keep_simple',
      reasoning: 'Debt position not large enough to warrant structural complexity.',
      estimatedAnnualBenefit: 0,
    });
  }

  // Long-term tax drag % — function of estimated savings vs gross income.
  const gross = (i.grossAnnual ?? 0) + (i.spouseGrossAnnual ?? 0);
  const longTermTaxDragPct = gross > 0 ? clamp(1 - totalEstimatedSaving / Math.max(1, gross * 0.05), 0, 1) : 0.5;

  const fireWithdrawalEfficiencyScore = clamp(
    50 +
    ((i.superCapRemaining ?? 0) > 5000 ? 10 : 0) +
    ((i.offsetBalance ?? 0) > 50_000 ? 10 : 0) +
    (i.hasInvestmentProperty ? 10 : 0) +
    (totalEstimatedSaving > 5_000 ? 20 : 0),
    0,
    100,
  );

  const medicareLevySurchargeWarning = !i.hasPrivateHealth && gross >= 180_000;

  const narrative = buildNarrative(topStrategies, totalEstimatedSaving, medicareLevySurchargeWarning);

  return {
    totalEstimatedSaving,
    topStrategies,
    allStrategies: all,
    ownership,
    debtStructure,
    longTermTaxDragPct,
    fireWithdrawalEfficiencyScore,
    medicareLevySurchargeWarning,
    narrative,
    generatedAt: new Date().toISOString(),
  };
}

function buildNarrative(top: TaxStrategy[], total: number, medicareWarning: boolean): string {
  const parts: string[] = [];
  parts.push(`Estimated annual tax saving from available strategies: ~$${total.toLocaleString()} (planning estimate, not advice).`);
  if (top.length > 0) {
    parts.push(`Top lever: ${top[0].label} (~$${(top[0].estimatedAnnualSaving || 0).toLocaleString()}/yr).`);
  }
  if (medicareWarning) parts.push('Medicare Levy Surcharge applies — basic hospital cover typically cheaper than the levy.');
  return parts.join(' ');
}

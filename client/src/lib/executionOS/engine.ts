/**
 * Execution Operating System — buildExecutionPlan.
 *
 * Deterministic, pure. Generates roadmaps + milestones + monthly missions
 * for execution coaching. Decorates Recommendation Engine V2 outputs.
 */

import type {
  ExecutionOSInputs,
  ExecutionOSResult,
  Milestone,
  MonthlyMission,
  Roadmap,
} from './types';

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function isoNow(): string { return new Date().toISOString(); }

function isoMonthsFromNow(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

function ymKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function emergencyBufferRoadmap(i: ExecutionOSInputs): Roadmap {
  const cash = (i.cashOutsideOffset ?? 0) + (i.offsetBalance ?? 0);
  const target = i.emergencyBufferTarget ?? Math.max(0, (i.monthlyExpenses ?? 0) * 3);
  const readiness = target > 0 ? clamp((cash / target) * 100, 0, 100) : 100;
  const surplus = Math.max(0, i.monthlySurplus ?? 0);
  const monthsToFill = surplus > 0 && readiness < 100
    ? Math.ceil((target - cash) / surplus)
    : 0;

  const milestones: Milestone[] = [
    {
      id: 'em_buffer_1',
      label: '1 month of expenses in cash + offset',
      status: cash >= (i.monthlyExpenses ?? 0) ? 'complete' : 'in_progress',
      readinessPct: clamp((cash / Math.max(1, (i.monthlyExpenses ?? 0))) * 100, 0, 100),
      monthlyDollarTarget: surplus,
    },
    {
      id: 'em_buffer_3',
      label: '3 months of expenses (base buffer)',
      status: cash >= target ? 'complete' : surplus > 0 ? 'in_progress' : 'blocked',
      readinessPct: readiness,
      monthlyDollarTarget: surplus,
      targetDate: monthsToFill ? isoMonthsFromNow(monthsToFill) : undefined,
    },
    {
      id: 'em_buffer_6',
      label: '6 months of expenses (resilient buffer)',
      status: cash >= 2 * target ? 'complete' : 'not_started',
      readinessPct: clamp((cash / Math.max(1, 2 * target)) * 100, 0, 100),
      monthlyDollarTarget: surplus,
    },
  ];

  const blockers: string[] = [];
  if (surplus <= 0) blockers.push('Monthly surplus is zero or negative — must improve cashflow first.');

  return {
    id: 'emergency_buffer',
    label: 'Emergency Buffer',
    description: 'Build a 3-6 month buffer in cash + offset to absorb income shocks.',
    readinessPct: readiness,
    estimatedCompletionISO: monthsToFill > 0 ? isoMonthsFromNow(monthsToFill) : null,
    milestones,
    activeBlockers: blockers,
  };
}

function debtPaydownRoadmap(i: ExecutionOSInputs): Roadmap {
  const debt = i.otherDebts ?? 0;
  const surplus = Math.max(0, i.monthlySurplus ?? 0);
  const monthsToClear = surplus > 0 && debt > 0 ? Math.ceil(debt / surplus) : 0;
  const readiness = debt === 0 ? 100 : surplus > 0 ? clamp(50 - debt / 1000, 0, 100) : 0;
  const milestones: Milestone[] = [];
  if (debt > 0) {
    milestones.push({
      id: 'debt_paydown_50',
      label: `Reduce other debts to ${Math.round(debt / 2).toLocaleString()}`,
      status: 'in_progress',
      readinessPct: 0,
      monthlyDollarTarget: Math.max(surplus, debt / 24),
      targetDate: isoMonthsFromNow(Math.min(12, monthsToClear / 2)),
    });
    milestones.push({
      id: 'debt_paydown_clear',
      label: 'Clear all non-mortgage debt',
      status: 'in_progress',
      readinessPct: 0,
      monthlyDollarTarget: Math.max(surplus, debt / 18),
      targetDate: monthsToClear ? isoMonthsFromNow(monthsToClear) : undefined,
    });
  } else {
    milestones.push({
      id: 'debt_paydown_clear',
      label: 'Non-mortgage debt cleared',
      status: 'complete',
      readinessPct: 100,
    });
  }
  return {
    id: 'debt_paydown',
    label: 'High-Interest Debt Paydown',
    description: 'Eliminate consumer / personal debt above the mortgage rate.',
    readinessPct: readiness,
    estimatedCompletionISO: monthsToClear ? isoMonthsFromNow(monthsToClear) : null,
    milestones,
    activeBlockers: surplus <= 0 ? ['Negative surplus — pause new debt and trim variable expenses.'] : [],
  };
}

function investmentPropertyRoadmap(i: ExecutionOSInputs): Roadmap {
  const ready = i.depositReadinessPct ?? 0;
  const buffer = (i.cashOutsideOffset ?? 0) + (i.offsetBalance ?? 0);
  const monthlySurplus = Math.max(0, i.monthlySurplus ?? 0);
  const deposit = i.depositPower ?? 0;

  const bufferMet = buffer >= (i.emergencyBufferTarget ?? 0);
  const otherDebtsLow = (i.otherDebts ?? 0) < 5_000;
  const surplusHealthy = monthlySurplus > 500;
  const depositReady = ready >= 75;

  const milestones: Milestone[] = [
    {
      id: 'ip_buffer',
      label: 'Build emergency buffer',
      status: bufferMet ? 'complete' : 'in_progress',
      readinessPct: bufferMet ? 100 : clamp(buffer / Math.max(1, (i.emergencyBufferTarget ?? 1)) * 100, 0, 99),
      reasoning: 'Lenders see a healthy buffer as serviceability evidence.',
    },
    {
      id: 'ip_personal_debt',
      label: 'Reduce personal debt',
      status: otherDebtsLow ? 'complete' : 'in_progress',
      readinessPct: otherDebtsLow ? 100 : clamp(50 - (i.otherDebts ?? 0) / 200, 0, 99),
      reasoning: 'Personal debt suppresses borrowing capacity disproportionately.',
    },
    {
      id: 'ip_nsr',
      label: 'Maintain healthy NSR',
      status: surplusHealthy ? 'complete' : 'in_progress',
      readinessPct: surplusHealthy ? 100 : clamp((monthlySurplus / 1000) * 50, 0, 99),
      monthlyDollarTarget: 800,
      reasoning: 'Net Surplus Ratio is a key serviceability lever for lenders.',
    },
    {
      id: 'ip_borrowing_capacity',
      label: 'Target borrowing capacity',
      status: depositReady ? 'complete' : monthlySurplus <= 0 ? 'blocked' : 'in_progress',
      readinessPct: ready,
      reasoning: 'Deposit + serviceability fund the purchase window.',
      monthlyDollarTarget: 1500,
    },
    {
      id: 'ip_purchase_window',
      label: 'Expected purchase window',
      status: depositReady && bufferMet && otherDebtsLow ? 'in_progress' : 'not_started',
      readinessPct: depositReady && bufferMet && otherDebtsLow ? 90 : 0,
      reasoning: 'All preconditions cleared — line up pre-approval and shortlist.',
      targetDate: depositReady ? isoMonthsFromNow(3) : undefined,
    },
  ];

  const stages = [bufferMet, otherDebtsLow, surplusHealthy, depositReady];
  const stageScore = stages.filter(Boolean).length / stages.length * 100;
  const blockers: string[] = [];
  if (!bufferMet) blockers.push('Emergency buffer not yet at target.');
  if (!otherDebtsLow) blockers.push('Personal debt above $5k — clear first.');
  if (!surplusHealthy) blockers.push('Monthly surplus too thin to support new mortgage.');
  if (i.mcStressFlag === 'severe') blockers.push('Monte Carlo stress flag is severe — delay leverage.');

  return {
    id: 'investment_property_plan',
    label: 'Investment Property Plan',
    description: 'Roadmap to the next IP purchase: buffer, debt, NSR, capacity, window.',
    readinessPct: (stageScore + ready) / 2,
    estimatedCompletionISO: depositReady ? isoMonthsFromNow(3) : null,
    milestones,
    activeBlockers: blockers,
  };
}

function superRoadmap(i: ExecutionOSInputs): Roadmap {
  const cap = i.superCapRemaining ?? 0;
  const filled = cap === 0;
  const monthly = cap > 0 ? Math.ceil(cap / 12) : 0;
  return {
    id: 'super_optimisation',
    label: 'Super Concessional Optimisation',
    description: 'Use unused concessional cap to lower tax and grow long-term wealth.',
    readinessPct: filled ? 100 : clamp(60 - cap / 500, 0, 99),
    estimatedCompletionISO: filled ? null : isoMonthsFromNow(12),
    milestones: [
      {
        id: 'super_salary_sacrifice',
        label: 'Salary sacrifice arrangement in place',
        status: filled ? 'complete' : 'in_progress',
        readinessPct: filled ? 100 : 40,
        monthlyDollarTarget: monthly,
      },
      {
        id: 'super_cap_used',
        label: 'Full concessional cap utilised',
        status: filled ? 'complete' : 'in_progress',
        readinessPct: filled ? 100 : clamp(((30_000 - cap) / 30_000) * 100, 0, 99),
        targetDate: isoMonthsFromNow(12),
      },
    ],
    activeBlockers: (i.monthlySurplus ?? 0) <= 0 ? ['Insufficient surplus to add salary sacrifice without cashflow stress.'] : [],
  };
}

function fireSavingsRateRoadmap(i: ExecutionOSInputs): Roadmap {
  const income = i.monthlyIncome ?? 0;
  const surplus = i.monthlySurplus ?? 0;
  const rate = income > 0 ? surplus / income : 0;
  const ratePct = rate * 100;
  let band: number;
  if (ratePct >= 50) band = 100;
  else if (ratePct >= 35) band = 80;
  else if (ratePct >= 25) band = 65;
  else if (ratePct >= 15) band = 45;
  else band = clamp(ratePct * 3, 0, 30);

  return {
    id: 'fire_savings_rate',
    label: 'FIRE Savings Rate',
    description: 'Lift household savings rate to compress time to financial independence.',
    readinessPct: band,
    estimatedCompletionISO: null,
    milestones: [
      { id: 'fsr_15', label: '15% savings rate', status: ratePct >= 15 ? 'complete' : 'in_progress', readinessPct: clamp((ratePct / 15) * 100, 0, 100) },
      { id: 'fsr_25', label: '25% savings rate', status: ratePct >= 25 ? 'complete' : 'in_progress', readinessPct: clamp((ratePct / 25) * 100, 0, 100) },
      { id: 'fsr_35', label: '35% savings rate', status: ratePct >= 35 ? 'complete' : 'in_progress', readinessPct: clamp((ratePct / 35) * 100, 0, 100) },
      { id: 'fsr_50', label: '50% savings rate (FIRE-grade)', status: ratePct >= 50 ? 'complete' : 'in_progress', readinessPct: clamp((ratePct / 50) * 100, 0, 100) },
    ],
    activeBlockers: surplus <= 0 ? ['Negative surplus — trim discretionary spend or grow income.'] : [],
  };
}

function rebalanceRoadmap(i: ExecutionOSInputs): Roadmap | null {
  if (!i.rebalanceNeeded) return null;
  return {
    id: 'portfolio_rebalance',
    label: 'Portfolio Rebalance',
    description: 'Bring allocation back in line with model targets.',
    readinessPct: 50,
    estimatedCompletionISO: isoMonthsFromNow(3),
    milestones: [
      { id: 'rb_assess', label: 'Assess drift across asset classes', status: 'complete', readinessPct: 100 },
      { id: 'rb_decide', label: 'Decide trim vs new-contribution rebalance', status: 'in_progress', readinessPct: 30 },
      { id: 'rb_execute', label: 'Execute trades / redirect contributions', status: 'not_started', readinessPct: 0 },
    ],
    activeBlockers: [],
  };
}

function refinanceRoadmap(i: ExecutionOSInputs): Roadmap | null {
  if (!i.refinanceOpportunity) return null;
  return {
    id: 'refinance_window',
    label: 'Refinance Window',
    description: 'Capture rate or product savings via refinance.',
    readinessPct: 60,
    estimatedCompletionISO: isoMonthsFromNow(2),
    milestones: [
      { id: 'rf_quotes', label: 'Get 3+ lender quotes', status: 'in_progress', readinessPct: 30 },
      { id: 'rf_compare', label: 'Compare effective rate incl. fees', status: 'not_started', readinessPct: 0 },
      { id: 'rf_execute', label: 'Lodge application', status: 'not_started', readinessPct: 0 },
    ],
    activeBlockers: [],
  };
}

function buildMissions(i: ExecutionOSInputs, roadmaps: Roadmap[]): MonthlyMission[] {
  const missions: MonthlyMission[] = [];
  const now = new Date();
  const surplus = Math.max(0, i.monthlySurplus ?? 0);
  for (let m = 0; m < 6; m++) {
    const d = new Date(now);
    d.setMonth(d.getMonth() + m);
    const month = ymKey(d);
    // Cycle category by month index for diversity.
    const buffer = (i.cashOutsideOffset ?? 0) + (i.offsetBalance ?? 0);
    if (buffer < (i.emergencyBufferTarget ?? 0) && surplus > 0 && m % 2 === 0) {
      missions.push({
        month,
        label: 'Build emergency buffer',
        amount: Math.min(surplus, Math.max(500, ((i.emergencyBufferTarget ?? 0) - buffer) / 4)),
        category: 'savings',
        rationale: 'Top up cash + offset until the 3-month buffer is restored.',
        milestoneId: 'em_buffer_3',
      });
    } else if ((i.otherDebts ?? 0) > 0 && surplus > 0 && m % 3 === 0) {
      missions.push({
        month,
        label: 'Pay down personal debt',
        amount: Math.min(surplus, Math.max(500, (i.otherDebts ?? 0) / 12)),
        category: 'debt',
        rationale: 'Highest guaranteed return action available.',
        milestoneId: 'debt_paydown_clear',
      });
    } else if ((i.superCapRemaining ?? 0) > 1000 && surplus > 0 && m % 4 === 0) {
      missions.push({
        month,
        label: 'Salary sacrifice to super',
        amount: Math.min(surplus, Math.ceil((i.superCapRemaining ?? 0) / 12)),
        category: 'super',
        rationale: 'Use unused concessional cap for tax + long-term growth.',
        milestoneId: 'super_cap_used',
      });
    } else if (surplus > 0) {
      missions.push({
        month,
        label: 'DCA into ETF allocation',
        amount: Math.round(surplus * 0.6),
        category: 'investing',
        rationale: 'Steady DCA captures compounding while maintaining discipline.',
      });
    } else {
      missions.push({
        month,
        label: 'Cashflow review',
        category: 'review',
        rationale: 'Surplus too thin — review variable spending categories and renegotiate fixed bills.',
      });
    }
  }
  return missions;
}

export function buildExecutionPlan(i: ExecutionOSInputs): ExecutionOSResult {
  const roadmaps: Roadmap[] = [];
  roadmaps.push(emergencyBufferRoadmap(i));
  roadmaps.push(debtPaydownRoadmap(i));
  if ((i.propertyBias ?? 0) >= -0.2) roadmaps.push(investmentPropertyRoadmap(i));
  if ((i.superCapRemaining ?? 0) > 1000) roadmaps.push(superRoadmap(i));
  roadmaps.push(fireSavingsRateRoadmap(i));
  const rb = rebalanceRoadmap(i); if (rb) roadmaps.push(rb);
  const rf = refinanceRoadmap(i); if (rf) roadmaps.push(rf);

  const topBlockers = Array.from(new Set(roadmaps.flatMap(r => r.activeBlockers))).slice(0, 5);
  const overallReadinessPct = clamp(
    roadmaps.reduce((acc, r) => acc + r.readinessPct, 0) / Math.max(1, roadmaps.length),
    0, 100,
  );

  const monthlyMissions = buildMissions(i, roadmaps);
  const narrative = `Overall execution readiness ${overallReadinessPct.toFixed(0)}/100 across ${roadmaps.length} roadmaps.` +
    (topBlockers.length > 0 ? ` Top blocker: ${topBlockers[0]}` : ' No active blockers.');

  return {
    roadmaps,
    monthlyMissions,
    topBlockers,
    overallReadinessPct,
    narrative,
    generatedAt: isoNow(),
  };
}

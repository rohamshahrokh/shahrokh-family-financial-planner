/**
 * monteCarloEngine.ts
 *
 * Runs N probability simulations (default 1,000) of 10-year net worth
 * across all asset classes: Property, Stocks, Crypto, Super, Cash, Debt.
 *
 * Each simulation uses monthly steps (120 months) with normally-distributed
 * random returns drawn from mean ± volatility for each asset class.
 *
 * Planned purchases, DCA schedules, and recurring bills are included
 * as deterministic cash outflows at their scheduled months.
 *
 * Returns percentile fan chart data + probability metrics.
 */

import { safeNum, calcMonthlyRepayment, calcLoanBalance, dcaMonthlyEquiv } from './finance';
import type { YearAssumptions, MonteCarloResult, MonteCarloFanPoint } from './forecastStore';

// ─── Box-Muller normal random ──────────────────────────────────────────────────

function randNormal(mean: number, stdDev: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + stdDev * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ─── Input type ───────────────────────────────────────────────────────────────

export interface MCInput {
  snapshot: {
    ppor:            number;
    cash:            number;
    super_balance:   number;
    stocks:          number;
    crypto:          number;
    cars:            number;
    iran_property:   number;
    mortgage:        number;
    other_debts:     number;
    monthly_income:  number;
    monthly_expenses: number;
  };
  properties: Array<{
    id: number;
    type: string;
    purchase_date?: string;
    settlement_date?: string;
    rental_start_date?: string;
    loan_amount: number;
    interest_rate: number;
    loan_term: number;
    weekly_rent: number;
    rental_growth: number;
    vacancy_rate: number;
    management_fee: number;
    capital_growth: number;
    deposit?: number;
    stamp_duty?: number;
    legal_fees?: number;
    renovation_costs?: number;
  }>;
  stocks: Array<{ current_holding: number; current_price: number; expected_return: number }>;
  cryptos: Array<{ current_holding: number; current_price: number; expected_return: number }>;
  stockTransactions: Array<{ transaction_type: string; status: string; transaction_date: string; total_amount: number }>;
  cryptoTransactions: Array<{ transaction_type: string; status: string; transaction_date: string; total_amount: number }>;
  stockDCASchedules: Array<{ enabled: boolean; amount: number; frequency: string; start_date: string; end_date?: string | null }>;
  cryptoDCASchedules: Array<{ enabled: boolean; amount: number; frequency: string; start_date: string; end_date?: string | null }>;
  plannedStockOrders: Array<{ action: string; amount_aud: number; planned_date: string; status: string }>;
  plannedCryptoOrders: Array<{ action: string; amount_aud: number; planned_date: string; status: string }>;
  bills: Array<{ amount: number; frequency: string; is_active?: boolean }>;
  yearlyAssumptions: YearAssumptions[]; // 2026–2035

  // Simulation config
  simulations?: number;   // default 1000
  financialFreedomThreshold?: number; // annual passive income target (default 120000)
  targetNetWorthMilestones?: number[]; // default [3_000_000, 5_000_000, 10_000_000]
}

// ─── Volatility presets per asset class ───────────────────────────────────────
// Annual volatility (std dev of return, %)

const VOLATILITY = {
  property: 5,   // relatively stable
  stocks:   18,
  crypto:   60,
  super:    10,
  cash:     0.5,
};

// ─── Main engine ──────────────────────────────────────────────────────────────

export function runMonteCarlo(input: MCInput): MonteCarloResult {
  const N_SIM    = input.simulations ?? 1000;
  const START_YEAR = 2026;
  const END_YEAR   = 2035;
  const N_YEARS    = END_YEAR - START_YEAR + 1;
  const N_MONTHS   = N_YEARS * 12;

  const FF_TARGET    = input.financialFreedomThreshold ?? 120_000;
  const MILESTONES   = input.targetNetWorthMilestones ?? [3_000_000, 5_000_000, 10_000_000];

  const s = input.snapshot;

  // Pre-compute investment properties (non-PPOR only)
  const investProps = input.properties.filter(p => p.type !== 'ppor');

  // Pre-compute planned one-time stock/crypto cash deltas per month index (0 = Jan 2026)
  function monthIndex(dateStr: string): number {
    const d = new Date(dateStr);
    return (d.getFullYear() - START_YEAR) * 12 + d.getMonth();
  }

  // Deterministic cashflow deltas per month — same for all simulations
  const deterministicDeltas = new Float64Array(N_MONTHS).fill(0);

  // Property settlement costs
  for (const prop of investProps) {
    const settleDateStr = prop.settlement_date || prop.purchase_date;
    if (!settleDateStr) continue;
    const mi = monthIndex(settleDateStr);
    if (mi < 0 || mi >= N_MONTHS) continue;
    deterministicDeltas[mi] -= safeNum(prop.deposit)
      + safeNum(prop.stamp_duty)
      + safeNum(prop.legal_fees)
      + safeNum(prop.renovation_costs);
  }

  // Planned stock/crypto transactions
  for (const tx of input.stockTransactions) {
    if (tx.status !== 'planned' || !tx.transaction_date) continue;
    const mi = monthIndex(tx.transaction_date);
    if (mi < 0 || mi >= N_MONTHS) continue;
    deterministicDeltas[mi] += tx.transaction_type === 'buy'
      ? -safeNum(tx.total_amount) : safeNum(tx.total_amount);
  }
  for (const tx of input.cryptoTransactions) {
    if (tx.status !== 'planned' || !tx.transaction_date) continue;
    const mi = monthIndex(tx.transaction_date);
    if (mi < 0 || mi >= N_MONTHS) continue;
    deterministicDeltas[mi] += tx.transaction_type === 'buy'
      ? -safeNum(tx.total_amount) : safeNum(tx.total_amount);
  }

  // Planned orders
  for (const o of input.plannedStockOrders) {
    if (o.status !== 'planned' || !o.planned_date) continue;
    const mi = monthIndex(o.planned_date);
    if (mi < 0 || mi >= N_MONTHS) continue;
    deterministicDeltas[mi] += o.action === 'buy' ? -safeNum(o.amount_aud) : safeNum(o.amount_aud);
  }
  for (const o of input.plannedCryptoOrders) {
    if (o.status !== 'planned' || !o.planned_date) continue;
    const mi = monthIndex(o.planned_date);
    if (mi < 0 || mi >= N_MONTHS) continue;
    deterministicDeltas[mi] += o.action === 'buy' ? -safeNum(o.amount_aud) : safeNum(o.amount_aud);
  }

  // Pre-compute DCA monthly outflow per month
  const dcaPerMonth = new Float64Array(N_MONTHS).fill(0);
  for (let mi = 0; mi < N_MONTHS; mi++) {
    const year = START_YEAR + Math.floor(mi / 12);
    const monthDate = new Date(year, mi % 12, 1);
    let total = 0;
    for (const dca of [...input.stockDCASchedules, ...input.cryptoDCASchedules]) {
      if (!dca.enabled) continue;
      const start = new Date(dca.start_date);
      const end = dca.end_date ? new Date(dca.end_date) : null;
      if (monthDate < start) continue;
      if (end && monthDate > end) continue;
      total += dcaMonthlyEquiv(safeNum(dca.amount), dca.frequency);
    }
    dcaPerMonth[mi] = total;
  }

  // Recurring bills monthly total
  const billsMonthly = input.bills.reduce((sum, b) => {
    if (b.is_active === false) return sum;
    return sum + dcaMonthlyEquiv(safeNum(b.amount), b.frequency || 'monthly');
  }, 0);

  // ── Assumption lookup per month ──
  function getAssumptions(mi: number): YearAssumptions {
    const year = START_YEAR + Math.floor(mi / 12);
    return input.yearlyAssumptions.find(a => a.year === year)
      ?? input.yearlyAssumptions[input.yearlyAssumptions.length - 1]
      ?? {
        year, property_growth: 6, stocks_return: 10, crypto_return: 20,
        super_return: 10, cash_return: 4.5, inflation: 3, income_growth: 3.5,
        expense_growth: 3, interest_rate: 6.5, rent_growth: 3,
      };
  }

  // ── Per-year net worth buckets — stores final NW of each sim per year ──
  // [year_index][sim_index]
  const nwByYear: number[][] = Array.from({ length: N_YEARS }, () => new Array(N_SIM).fill(0));

  // ── Track probability counters ──
  let countFF = 0;
  const countMilestone = new Array(MILESTONES.length).fill(0);
  let countNegCF = 0;

  // ── Run simulations ──
  for (let sim = 0; sim < N_SIM; sim++) {
    // Initial state
    let ppor      = safeNum(s.ppor);
    let cash      = safeNum(s.cash);
    let superBal  = safeNum(s.super_balance);
    let stockVal  = safeNum(s.stocks)
      + input.stocks.reduce((sum, st) => sum + st.current_holding * st.current_price, 0);
    let cryptoVal = safeNum(s.crypto)
      + input.cryptos.reduce((sum, c) => sum + c.current_holding * c.current_price, 0);
    let mortgage  = safeNum(s.mortgage);
    let propValues= investProps.map(p => ({
      value: safeNum(p.current_value ?? (p as any).purchase_price ?? 0),
      loan:  safeNum(p.loan_amount),
      settledAt: (() => {
        const ds = p.settlement_date || p.purchase_date;
        return ds ? monthIndex(ds) : 0;
      })(),
    }));
    let income    = safeNum(s.monthly_income);
    let expenses  = safeNum(s.monthly_expenses);

    // PPOR mortgage monthly repayment (fixed)
    const pporMonthly = calcMonthlyRepayment(safeNum(s.mortgage), 6.5, 30);

    let hadNegCF = false;
    let reachedFF = false;

    for (let mi = 0; mi < N_MONTHS; mi++) {
      const ass = getAssumptions(mi);

      // Monthly rates from annual assumptions with random shock
      const propReturn   = randNormal(ass.property_growth / 100 / 12, VOLATILITY.property / 100 / Math.sqrt(12));
      const stockReturn  = randNormal(ass.stocks_return  / 100 / 12, VOLATILITY.stocks  / 100 / Math.sqrt(12));
      const cryptoReturn = randNormal(ass.crypto_return  / 100 / 12, VOLATILITY.crypto  / 100 / Math.sqrt(12));
      const superReturn  = randNormal(ass.super_return   / 100 / 12, VOLATILITY.super   / 100 / Math.sqrt(12));
      const cashReturn   = randNormal(ass.cash_return    / 100 / 12, VOLATILITY.cash    / 100 / Math.sqrt(12));

      // Asset growth
      ppor      *= (1 + propReturn);
      stockVal  *= (1 + stockReturn);
      cryptoVal *= (1 + cryptoReturn);
      superBal  *= (1 + superReturn);
      cash      *= (1 + Math.max(0, cashReturn));

      // Income & expense drift
      income   *= (1 + ass.income_growth   / 100 / 12);
      expenses *= (1 + ass.expense_growth  / 100 / 12);

      // PPOR mortgage reduction
      mortgage = Math.max(0, mortgage - (pporMonthly - mortgage * (ass.interest_rate / 100 / 12)));

      // Investment properties
      let propValue = 0, propLoan = 0, propRent = 0;
      for (let pi = 0; pi < investProps.length; pi++) {
        const pv = propValues[pi];
        if (mi < pv.settledAt) continue;
        pv.value *= (1 + propReturn);
        pv.loan  = Math.max(0, calcLoanBalance(
          investProps[pi].loan_amount,
          investProps[pi].interest_rate || ass.interest_rate,
          investProps[pi].loan_term || 30,
          mi - pv.settledAt + 1
        ));
        propValue += pv.value;
        propLoan  += pv.loan;

        // Rental income
        const rentalStartMi = (() => {
          const rs = investProps[pi].rental_start_date;
          return rs ? monthIndex(rs) : pv.settledAt + 1;
        })();
        if (mi >= rentalStartMi) {
          const monthsSinceRental = mi - rentalStartMi;
          const annualRent = safeNum(investProps[pi].weekly_rent) * 52
            * (1 - safeNum(investProps[pi].vacancy_rate) / 100)
            * (1 - safeNum(investProps[pi].management_fee) / 100)
            * Math.pow(1 + ass.rent_growth / 100, monthsSinceRental / 12);
          propRent += annualRent / 12;
        }
      }

      // Investment loan repayment (total for all settled props)
      const propLoanRepayment = investProps.reduce((sum, prop, pi) => {
        if (mi < propValues[pi].settledAt) return sum;
        return sum + calcMonthlyRepayment(
          safeNum(prop.loan_amount),
          safeNum(prop.interest_rate) || ass.interest_rate,
          safeNum(prop.loan_term) || 30
        );
      }, 0);

      // Cash flow
      const grossCashFlow = income + propRent
        - expenses - pporMonthly - propLoanRepayment
        - dcaPerMonth[mi] - billsMonthly
        + deterministicDeltas[mi];

      // DCA shifts cash to investments
      const dcaOut = dcaPerMonth[mi];
      stockVal  += dcaOut * 0.5; // split DCA 50/50 stocks/crypto for simplicity
      cryptoVal += dcaOut * 0.5;

      cash += grossCashFlow;

      // Check negative cashflow
      if (grossCashFlow < 0) hadNegCF = true;

      // Check financial freedom — annual passive income (rental + investment yield) > annual expenses
      if (!reachedFF) {
        const annualPassive = propRent * 12 + stockVal * 0.02 + cryptoVal * 0.01 + superBal * 0.04;
        if (annualPassive >= FF_TARGET) {
          reachedFF = true;
          countFF++;
        }
      }
    }

    // Final net worth
    const finalNW = ppor + cash + superBal + stockVal + cryptoVal
      + safeNum(s.cars) * 0.8 + safeNum(s.iran_property)
      + propValues.reduce((s, p) => s + p.value, 0)
      - mortgage - safeNum(s.other_debts)
      - propValues.reduce((s, p) => s + p.loan, 0);

    // Milestone checks
    MILESTONES.forEach((m, mi_) => { if (finalNW >= m) countMilestone[mi_]++; });
    if (hadNegCF) countNegCF++;

    // Store per-year NW for fan chart
    // Re-run approximate end-of-year NW from full simulation is expensive so we
    // compute it approximately as a fraction of the path. We'll track per-year.
    // Simpler: compute yearly snapshots during the loop above.
    // For this version we use the final NW and distribute linearly for the fan.
    // A more accurate approach stores snapshots — implemented below via outer loop.
    nwByYear[N_YEARS - 1][sim] = finalNW;
  }

  // ── Full simulation with year snapshots ──────────────────────────────────────
  // Re-run to get year-by-year fan data (needed for fan chart).
  // We run a lighter pass keeping year-end snapshots.
  const yearSnapshots: number[][] = Array.from({ length: N_YEARS }, () => new Array(N_SIM).fill(0));

  for (let sim = 0; sim < N_SIM; sim++) {
    let ppor      = safeNum(s.ppor);
    let cash      = safeNum(s.cash);
    let superBal  = safeNum(s.super_balance);
    let stockVal  = safeNum(s.stocks)
      + input.stocks.reduce((sum, st) => sum + st.current_holding * st.current_price, 0);
    let cryptoVal = safeNum(s.crypto)
      + input.cryptos.reduce((sum, c) => sum + c.current_holding * c.current_price, 0);
    let mortgage  = safeNum(s.mortgage);
    const propVals = investProps.map(p => ({
      value: safeNum((p as any).current_value ?? (p as any).purchase_price ?? 0),
      loan:  safeNum(p.loan_amount),
      settledAt: (() => {
        const ds = p.settlement_date || p.purchase_date;
        return ds ? monthIndex(ds) : 0;
      })(),
    }));
    let income   = safeNum(s.monthly_income);
    let expenses_ = safeNum(s.monthly_expenses);
    const pporMonthly = calcMonthlyRepayment(safeNum(s.mortgage), 6.5, 30);

    for (let mi = 0; mi < N_MONTHS; mi++) {
      const ass = getAssumptions(mi);
      const propReturn   = randNormal(ass.property_growth / 100 / 12, VOLATILITY.property / 100 / Math.sqrt(12));
      const stockReturn  = randNormal(ass.stocks_return   / 100 / 12, VOLATILITY.stocks   / 100 / Math.sqrt(12));
      const cryptoReturn = randNormal(ass.crypto_return   / 100 / 12, VOLATILITY.crypto   / 100 / Math.sqrt(12));
      const superReturn  = randNormal(ass.super_return    / 100 / 12, VOLATILITY.super    / 100 / Math.sqrt(12));
      const cashReturn   = randNormal(ass.cash_return     / 100 / 12, VOLATILITY.cash     / 100 / Math.sqrt(12));

      ppor      *= (1 + propReturn);
      stockVal  *= (1 + stockReturn);
      cryptoVal *= (1 + cryptoReturn);
      superBal  *= (1 + superReturn);
      cash      *= (1 + Math.max(0, cashReturn));
      income    *= (1 + ass.income_growth   / 100 / 12);
      expenses_ *= (1 + ass.expense_growth  / 100 / 12);
      mortgage   = Math.max(0, mortgage - (pporMonthly - mortgage * (ass.interest_rate / 100 / 12)));

      let propValue = 0, propLoan = 0, propRent = 0;
      for (let pi = 0; pi < investProps.length; pi++) {
        const pv = propVals[pi];
        if (mi < pv.settledAt) continue;
        pv.value *= (1 + propReturn);
        pv.loan   = Math.max(0, calcLoanBalance(
          investProps[pi].loan_amount,
          investProps[pi].interest_rate || ass.interest_rate,
          investProps[pi].loan_term || 30,
          mi - pv.settledAt + 1
        ));
        propValue += pv.value;
        propLoan  += pv.loan;
        const rentalStartMi = (() => {
          const rs = investProps[pi].rental_start_date;
          return rs ? monthIndex(rs) : pv.settledAt + 1;
        })();
        if (mi >= rentalStartMi) {
          const monthsSince = mi - rentalStartMi;
          const annualRent  = safeNum(investProps[pi].weekly_rent) * 52
            * (1 - safeNum(investProps[pi].vacancy_rate) / 100)
            * (1 - safeNum(investProps[pi].management_fee) / 100)
            * Math.pow(1 + ass.rent_growth / 100, monthsSince / 12);
          propRent += annualRent / 12;
        }
      }
      const propLoanRepayment = investProps.reduce((sum, prop, pi) => {
        if (mi < propVals[pi].settledAt) return sum;
        return sum + calcMonthlyRepayment(
          safeNum(prop.loan_amount), safeNum(prop.interest_rate) || ass.interest_rate, safeNum(prop.loan_term) || 30
        );
      }, 0);

      const grossCF = income + propRent - expenses_ - pporMonthly - propLoanRepayment
        - dcaPerMonth[mi] - billsMonthly + deterministicDeltas[mi];
      const dcaOut = dcaPerMonth[mi];
      stockVal  += dcaOut * 0.5;
      cryptoVal += dcaOut * 0.5;
      cash += grossCF;

      // Store year-end snapshot
      if ((mi + 1) % 12 === 0) {
        const yearIdx = Math.floor(mi / 12);
        const totalPropValue = propVals.reduce((s_, p) => s_ + p.value, 0);
        const totalPropLoan  = propVals.reduce((s_, p) => s_ + p.loan, 0);
        const nw = ppor + cash + superBal + stockVal + cryptoVal
          + safeNum(s.cars) * 0.8 + safeNum(s.iran_property)
          + totalPropValue - mortgage - safeNum(s.other_debts) - totalPropLoan;
        yearSnapshots[yearIdx][sim] = nw;
      }
    }
  }

  // ── Percentile helper ─────────────────────────────────────────────────────────
  function percentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor((p / 100) * sorted.length);
    return sorted[Math.min(idx, sorted.length - 1)];
  }

  // ── Fan chart data ────────────────────────────────────────────────────────────
  const fan_data: MonteCarloFanPoint[] = yearSnapshots.map((sims, yi) => ({
    year:   START_YEAR + yi,
    p10:    Math.round(percentile(sims, 10)),
    p25:    Math.round(percentile(sims, 25)),
    median: Math.round(percentile(sims, 50)),
    p75:    Math.round(percentile(sims, 75)),
    p90:    Math.round(percentile(sims, 90)),
  }));

  const finalSims = yearSnapshots[N_YEARS - 1];
  const p10    = Math.round(percentile(finalSims, 10));
  const p25    = Math.round(percentile(finalSims, 25));
  const median = Math.round(percentile(finalSims, 50));
  const p75    = Math.round(percentile(finalSims, 75));
  const p90    = Math.round(percentile(finalSims, 90));

  // ── Probabilities ──────────────────────────────────────────────────────────────
  const prob_ff      = Math.round((countFF / N_SIM) * 1000) / 10;
  const prob_neg_cf  = Math.round((countNegCF / N_SIM) * 1000) / 10;
  const prob_3m  = Math.round((countMilestone[0] / N_SIM) * 1000) / 10;
  const prob_5m  = Math.round((countMilestone[1] / N_SIM) * 1000) / 10;
  const prob_10m = Math.round((countMilestone[2] / N_SIM) * 1000) / 10;

  // ── Key risks (auto-generated from results) ────────────────────────────────────
  const key_risks: string[] = [];
  if (p10 < 0) key_risks.push('10th percentile net worth is negative — high downside risk in adverse scenarios');
  if (prob_neg_cf > 30) key_risks.push(`${prob_neg_cf}% of simulations show at least one year of negative cashflow — consider reducing expenses or increasing income`);
  if (prob_ff < 20) key_risks.push('Low probability of financial freedom by 2035 — passive income likely insufficient to cover expenses');
  if (p90 / Math.max(p10, 1) > 10) key_risks.push('High outcome dispersion (P90/P10 > 10x) — results are highly sensitive to market assumptions');
  const cryptoWeight = input.snapshot.crypto / Math.max(input.snapshot.ppor + input.snapshot.cash + input.snapshot.stocks + input.snapshot.crypto, 1);
  if (cryptoWeight > 0.2) key_risks.push(`Crypto represents ${Math.round(cryptoWeight * 100)}% of portfolio — high volatility risk`);
  if (key_risks.length === 0) key_risks.push('No major structural risks detected in your current forecast scenario');

  // ── Recommended actions ────────────────────────────────────────────────────────
  const recommended_actions: string[] = [];
  if (prob_ff < 50) recommended_actions.push('Increase passive income sources — consider additional investment properties or dividend-yielding stocks');
  if (prob_neg_cf > 20) recommended_actions.push('Build a 3–6 month cash buffer to handle periods of negative cashflow');
  if (prob_5m < 50) recommended_actions.push('Increase DCA contributions or extend investment horizon to improve $5M probability');
  if (cryptoWeight > 0.3) recommended_actions.push('Consider rebalancing crypto to reduce portfolio volatility');
  recommended_actions.push('Review and update assumptions annually as your situation evolves');
  if (recommended_actions.length < 3) recommended_actions.push('Continue current investment strategy — projections are on track');

  return {
    p10, p25, median, p75, p90,
    prob_ff, prob_3m, prob_5m, prob_10m, prob_neg_cf,
    fan_data, key_risks, recommended_actions,
    ran_at: new Date().toISOString(),
    simulations: N_SIM,
  };
}

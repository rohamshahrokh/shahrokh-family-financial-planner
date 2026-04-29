/**
 * monteCarloEngine.ts  — Realistic Asset-Class Monte Carlo Engine
 *
 * Runs N probability simulations (default 1,000) of 10-year net worth
 * using monthly steps (120 months) for each of:
 *
 *   PROPERTY  — mean growth + volatility + vacancy + maintenance + rate sensitivity
 *   STOCKS    — mean return + volatility + periodic correction events
 *   CRYPTO    — mean return + high vol + crash + bull-run event draws
 *   SUPER     — mean return + moderate volatility
 *   CASH      — income − expenses − bills − DCA − planned purchases + interest
 *               Emergency buffer tracking; inflation-adjusted expenses
 *   DEBT      — PPOR mortgage + investment loans; annual rate shock draws
 *
 * All deterministic cashflows (planned buys/sells, property settlements,
 * DCA schedules) are pre-computed and applied at the correct month.
 *
 * Volatility and event parameters are now user-configurable via MCVolatilityParams.
 */

import { safeNum, calcMonthlyRepayment, calcLoanBalance, dcaMonthlyEquiv } from './finance';
import type { YearAssumptions, MonteCarloResult, MonteCarloFanPoint, MCVolatilityParams } from './forecastStore';
import { DEFAULT_MC_VOLATILITY } from './forecastStore';

// ─── Box-Muller standard normal ───────────────────────────────────────────────

function randNormal(mean: number, stdDev: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + stdDev * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ─── Input type ───────────────────────────────────────────────────────────────

export interface MCInput {
  snapshot: {
    ppor:             number;
    cash:             number;
    super_balance:    number;
    stocks:           number;
    crypto:           number;
    cars:             number;
    iran_property:    number;
    mortgage:         number;
    other_debts:      number;
    monthly_income:   number;
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
    current_value?: number;
    purchase_price?: number;
  }>;
  stocks: Array<{ current_holding: number; current_price: number; expected_return: number }>;
  cryptos: Array<{ current_holding: number; current_price: number; expected_return: number }>;
  stockTransactions: Array<{ transaction_type: string; status: string; transaction_date: string; total_amount: number }>;
  cryptoTransactions: Array<{ transaction_type: string; status: string; transaction_date: string; total_amount: number }>;
  stockDCASchedules: Array<{ enabled: boolean; amount: number; frequency: string; start_date: string; end_date?: string | null }>;
  cryptoDCASchedules: Array<{ enabled: boolean; amount: number; frequency: string; start_date: string; end_date?: string | null }>;
  plannedStockOrders: Array<{ action: string; amount_aud: number; planned_date: string; status: string }>;
  plannedCryptoOrders: Array<{ action: string; amount_aud: number; planned_date: string; status: string }>;
  bills: Array<{ amount: number; frequency: string; is_active?: boolean; active?: boolean }>;
  yearlyAssumptions: YearAssumptions[];   // 2026–2035

  // User-editable volatility parameters (optional — defaults used if omitted)
  volatilityParams?: Partial<MCVolatilityParams>;

  // Simulation config
  simulations?: number;
  financialFreedomThreshold?: number;
  targetNetWorthMilestones?: number[];
}

// ─── Main engine ──────────────────────────────────────────────────────────────

export function runMonteCarlo(input: MCInput): MonteCarloResult {
  const N_SIM     = input.simulations ?? 1000;
  const START_YR  = 2026;
  const END_YR    = 2035;
  const N_YEARS   = END_YR - START_YR + 1;
  const N_MONTHS  = N_YEARS * 12;

  const FF_TARGET  = input.financialFreedomThreshold ?? 120_000;
  const MILESTONES = input.targetNetWorthMilestones  ?? [3_000_000, 5_000_000, 10_000_000];

  // Merge default volatility with user overrides
  const vp: MCVolatilityParams = { ...DEFAULT_MC_VOLATILITY, ...(input.volatilityParams ?? {}) };

  const s = input.snapshot;
  const investProps = input.properties.filter(p => p.type !== 'ppor');

  // ── Month index helper ──
  function miOf(dateStr: string): number {
    const d = new Date(dateStr);
    return (d.getFullYear() - START_YR) * 12 + d.getMonth();
  }

  // ── Deterministic cash deltas per month (same across all sims) ──
  const deterministicDeltas = new Float64Array(N_MONTHS).fill(0);

  for (const prop of investProps) {
    const ds = prop.settlement_date || prop.purchase_date;
    if (!ds) continue;
    const mi = miOf(ds);
    if (mi < 0 || mi >= N_MONTHS) continue;
    deterministicDeltas[mi] -= safeNum(prop.deposit)
      + safeNum(prop.stamp_duty)
      + safeNum(prop.legal_fees)
      + safeNum(prop.renovation_costs);
  }
  for (const tx of input.stockTransactions) {
    if (tx.status !== 'planned' || !tx.transaction_date) continue;
    const mi = miOf(tx.transaction_date);
    if (mi < 0 || mi >= N_MONTHS) continue;
    deterministicDeltas[mi] += tx.transaction_type === 'buy' ? -safeNum(tx.total_amount) : safeNum(tx.total_amount);
  }
  for (const tx of input.cryptoTransactions) {
    if (tx.status !== 'planned' || !tx.transaction_date) continue;
    const mi = miOf(tx.transaction_date);
    if (mi < 0 || mi >= N_MONTHS) continue;
    deterministicDeltas[mi] += tx.transaction_type === 'buy' ? -safeNum(tx.total_amount) : safeNum(tx.total_amount);
  }
  for (const o of input.plannedStockOrders) {
    if (o.status !== 'planned' || !o.planned_date) continue;
    const mi = miOf(o.planned_date);
    if (mi < 0 || mi >= N_MONTHS) continue;
    deterministicDeltas[mi] += o.action === 'buy' ? -safeNum(o.amount_aud) : safeNum(o.amount_aud);
  }
  for (const o of input.plannedCryptoOrders) {
    if (o.status !== 'planned' || !o.planned_date) continue;
    const mi = miOf(o.planned_date);
    if (mi < 0 || mi >= N_MONTHS) continue;
    deterministicDeltas[mi] += o.action === 'buy' ? -safeNum(o.amount_aud) : safeNum(o.amount_aud);
  }

  // ── DCA outflow per month ──
  const dcaPerMonth = new Float64Array(N_MONTHS).fill(0);
  for (let mi = 0; mi < N_MONTHS; mi++) {
    const yr    = START_YR + Math.floor(mi / 12);
    const mDate = new Date(yr, mi % 12, 1);
    let tot = 0;
    for (const dca of [...input.stockDCASchedules, ...input.cryptoDCASchedules]) {
      if (!dca.enabled) continue;
      const start = new Date(dca.start_date);
      const end   = dca.end_date ? new Date(dca.end_date) : null;
      if (mDate < start || (end && mDate > end)) continue;
      tot += dcaMonthlyEquiv(safeNum(dca.amount), dca.frequency);
    }
    dcaPerMonth[mi] = tot;
  }

  // ── Recurring bills monthly ──
  const billsMonthly = input.bills.reduce((sum, b) => {
    if (b.is_active === false || b.active === false) return sum;
    return sum + dcaMonthlyEquiv(safeNum(b.amount), b.frequency || 'monthly');
  }, 0);

  // ── Assumptions lookup ──
  function getAss(mi: number): YearAssumptions {
    const yr = START_YR + Math.floor(mi / 12);
    return input.yearlyAssumptions.find(a => a.year === yr)
      ?? input.yearlyAssumptions[input.yearlyAssumptions.length - 1]
      ?? { year: yr, property_growth: 6, stocks_return: 10, crypto_return: 20,
           super_return: 10, cash_return: 4.5, inflation: 3, income_growth: 3.5,
           expense_growth: 3, interest_rate: 6.5, rent_growth: 3 };
  }

  // ── Convert annual volatility to monthly std dev ──
  const propStd   = vp.prop_volatility    / 100 / Math.sqrt(12);
  const stockStd  = vp.stock_volatility   / 100 / Math.sqrt(12);
  const cryptoStd = vp.crypto_volatility  / 100 / Math.sqrt(12);
  const superStd  = 10                    / 100 / Math.sqrt(12);
  const inflStd   = vp.inflation_volatility / 100 / Math.sqrt(12);

  // ── Data structures to collect results ──
  // Per-year net-worth for fan chart
  const yearSnapshots: number[][] = Array.from({ length: N_YEARS }, () => new Array(N_SIM).fill(0));

  // Probability counters
  let countFF        = 0;
  const countMS      = new Array(MILESTONES.length).fill(0);
  let countNegCF     = 0;
  let countShortfall = 0;  // sims where cash < emergency buffer at any month

  // For highest-risk-year: count negative-CF events per year
  const negCFByYear = new Array(N_YEARS).fill(0);

  // Lowest cash balance per sim (for median calculation)
  const lowestCashPerSim = new Array(N_SIM).fill(0);

  // ── Main simulation loop ──
  for (let sim = 0; sim < N_SIM; sim++) {
    // --- Initial state ---
    let ppor      = safeNum(s.ppor);
    let cash      = safeNum(s.cash);
    let superBal  = safeNum(s.super_balance);
    let stockVal  = safeNum(s.stocks)
      + input.stocks.reduce((acc, st) => acc + st.current_holding * st.current_price, 0);
    let cryptoVal = safeNum(s.crypto)
      + input.cryptos.reduce((acc, c) => acc + c.current_holding * c.current_price, 0);
    let mortgage  = safeNum(s.mortgage);

    const propState = investProps.map(p => ({
      value:     safeNum(p.current_value ?? p.purchase_price ?? 0),
      loan:      safeNum(p.loan_amount),
      settledAt: (() => {
        const ds = p.settlement_date || p.purchase_date;
        return ds ? miOf(ds) : 0;
      })(),
    }));

    let income    = safeNum(s.monthly_income);
    let expenses  = safeNum(s.monthly_expenses);

    // PPOR mortgage repayment (deterministic at baseline interest rate)
    const pporRate     = safeNum(s.mortgage) > 0 ? (getAss(0).interest_rate / 100) : 0;
    const pporMonthly  = calcMonthlyRepayment(safeNum(s.mortgage), pporRate * 100 || 6.5, 30);

    let hadNegCF   = false;
    let hadShortfall = false;
    let reachedFF  = false;
    let lowestCash = cash;

    // ── Draw annual-event flags for this simulation ──
    // Crash/correction/bull-run happen at most once per year, decided at start of each year.
    const annualStockCorrectionYear  = new Array(N_YEARS).fill(false);
    const annualCryptoCrashYear      = new Array(N_YEARS).fill(false);
    const annualCryptoBullYear       = new Array(N_YEARS).fill(false);
    const annualRateShockYear        = new Array(N_YEARS).fill(0); // extra rate delta

    for (let yi = 0; yi < N_YEARS; yi++) {
      if (Math.random() < vp.stock_correction_prob / 100) annualStockCorrectionYear[yi] = true;
      if (Math.random() < vp.crypto_crash_prob  / 100) annualCryptoCrashYear[yi]  = true;
      // Bull run and crash are mutually exclusive in the same year
      if (!annualCryptoCrashYear[yi] && Math.random() < vp.crypto_bull_prob / 100) annualCryptoBullYear[yi] = true;
      if (Math.random() < vp.rate_shock_prob / 100) annualRateShockYear[yi] = vp.rate_shock_size;
    }

    // ── Monthly loop ──
    for (let mi = 0; mi < N_MONTHS; mi++) {
      const ass = getAss(mi);
      const yi  = Math.floor(mi / 12);         // year index 0–9
      const isJanuary = (mi % 12) === 0;       // event month = January of each year

      // Effective interest rate for this year (with possible shock)
      const effectiveRate = ass.interest_rate + annualRateShockYear[yi];

      // ── Asset returns (monthly, normally distributed) ──
      const propRet   = randNormal(ass.property_growth / 100 / 12, propStd);
      const stockRet  = randNormal(ass.stocks_return   / 100 / 12, stockStd);
      const cryptoRet = randNormal(ass.crypto_return   / 100 / 12, cryptoStd);
      const superRet  = randNormal(ass.super_return    / 100 / 12, superStd);
      const cashIntRate = vp.cash_interest_rate / 100 / 12;

      // ── Apply crash/correction/bull events at January of each year ──
      let extraStockShock  = 0;
      let extraCryptoShock = 0;
      if (isJanuary) {
        if (annualStockCorrectionYear[yi]) {
          // Correction: draw from Normal(−correction_size, correction_size*0.3)
          extraStockShock = randNormal(-vp.stock_correction_size / 100, vp.stock_correction_size * 0.3 / 100);
        }
        if (annualCryptoCrashYear[yi]) {
          extraCryptoShock = randNormal(-vp.crypto_crash_size / 100, vp.crypto_crash_size * 0.2 / 100);
        } else if (annualCryptoBullYear[yi]) {
          extraCryptoShock = randNormal(vp.crypto_bull_upside / 100, vp.crypto_bull_upside * 0.3 / 100);
        }
      }

      // ── Asset value growth ──
      ppor      *= (1 + propRet);
      stockVal  *= (1 + stockRet + extraStockShock);
      cryptoVal *= (1 + cryptoRet + extraCryptoShock);
      superBal  *= (1 + superRet);

      // Income + expense drift (with inflation noise)
      const inflShock = randNormal(0, inflStd);
      income    *= (1 + ass.income_growth   / 100 / 12);
      expenses  *= (1 + (ass.expense_growth / 100 + inflShock) / 12);

      // ── Property: maintenance cost deducted from cash monthly ──
      let propMaintCost = 0;
      for (let pi = 0; pi < investProps.length; pi++) {
        const pv = propState[pi];
        if (mi < pv.settledAt) continue;
        // Maintenance drawn from cash each month
        propMaintCost += pv.value * (vp.prop_maintenance_pct / 100 / 12);
      }

      // ── PPOR mortgage ──
      // Recalculate monthly repayment annually to reflect rate shocks
      const activePPORRate = effectiveRate;
      const pporMonthlyActual = calcMonthlyRepayment(
        Math.max(0, mortgage),
        activePPORRate || 6.5,
        30
      );
      const pporInterest = mortgage * (activePPORRate / 100 / 12);
      const pporPrincipal = Math.max(0, pporMonthlyActual - pporInterest);
      mortgage = Math.max(0, mortgage - pporPrincipal);

      // ── Investment properties ──
      let propValue = 0, propLoan = 0, propRent = 0, propLoanRepay = 0;
      for (let pi = 0; pi < investProps.length; pi++) {
        const pv  = propState[pi];
        if (mi < pv.settledAt) continue;
        pv.value *= (1 + propRet);

        const propIntRate = safeNum(investProps[pi].interest_rate) || effectiveRate;
        pv.loan = Math.max(0, calcLoanBalance(
          investProps[pi].loan_amount,
          propIntRate,
          investProps[pi].loan_term || 30,
          mi - pv.settledAt + 1
        ));
        propValue += pv.value;
        propLoan  += pv.loan;

        // Rental income
        const rentalStartMi = (() => {
          const rs = investProps[pi].rental_start_date;
          return rs ? miOf(rs) : pv.settledAt + 1;
        })();
        if (mi >= rentalStartMi) {
          const mths = mi - rentalStartMi;
          // Vacancy: draw stochastic — ~(vacancy_rate/12) months vacant per year
          const isVacant = Math.random() < (vp.prop_vacancy_rate / 100 / 12);
          const annualRent = safeNum(investProps[pi].weekly_rent) * 52
            * (1 - safeNum(investProps[pi].management_fee) / 100)
            * Math.pow(1 + ass.rent_growth / 100, mths / 12);
          propRent += isVacant ? 0 : (annualRent / 12);
        }

        propLoanRepay += calcMonthlyRepayment(
          safeNum(investProps[pi].loan_amount),
          propIntRate,
          safeNum(investProps[pi].loan_term) || 30
        );
      }

      // ── Cash interest (earned on positive cash balance) ──
      const cashInterest = Math.max(0, cash) * cashIntRate;

      // ── Net monthly cashflow ──
      const grossCF = income + propRent + cashInterest
        - expenses - pporMonthlyActual - propLoanRepay - propMaintCost
        - dcaPerMonth[mi] - billsMonthly
        + deterministicDeltas[mi];

      // DCA capital moves from cash to investments (split 50/50 stocks/crypto)
      const dcaOut = dcaPerMonth[mi];
      stockVal  += dcaOut * 0.5;
      cryptoVal += dcaOut * 0.5;

      cash += grossCF;

      // Track lowest cash
      if (cash < lowestCash) lowestCash = cash;

      // Check negative cashflow
      if (grossCF < 0) {
        hadNegCF = true;
        negCFByYear[yi]++;
      }

      // Check emergency buffer shortfall
      if (cash < vp.emergency_buffer) hadShortfall = true;

      // ── Year-end snapshot ──
      if ((mi + 1) % 12 === 0) {
        const totalPropValue = propState.reduce((acc, p) => acc + p.value, 0);
        const totalPropLoan  = propState.reduce((acc, p) => acc + p.loan, 0);
        const nw = ppor + cash + superBal + stockVal + cryptoVal
          + safeNum(s.cars) * 0.8 + safeNum(s.iran_property)
          + totalPropValue
          - mortgage - safeNum(s.other_debts) - totalPropLoan;
        yearSnapshots[yi][sim] = nw;
      }

      // ── Financial freedom check ──
      if (!reachedFF) {
        const annualRental = propRent * 12;
        const annualPassive = annualRental
          + stockVal  * 0.02    // 2% dividend/yield
          + cryptoVal * 0.01    // 1% staking/yield
          + superBal  * 0.04;   // 4% drawdown
        if (annualPassive >= FF_TARGET) {
          reachedFF = true;
          countFF++;
        }
      }
    }

    // Milestone checks on final year NW
    const finalNW = yearSnapshots[N_YEARS - 1][sim];
    MILESTONES.forEach((m, i) => { if (finalNW >= m) countMS[i]++; });
    if (hadNegCF)     countNegCF++;
    if (hadShortfall) countShortfall++;
    lowestCashPerSim[sim] = lowestCash;
  }

  // ── Percentile helper ──
  function pct(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.floor((p / 100) * sorted.length);
    return sorted[Math.min(idx, sorted.length - 1)];
  }

  // ── Fan chart ──
  const fan_data: MonteCarloFanPoint[] = yearSnapshots.map((sims, yi) => ({
    year:   START_YR + yi,
    p10:    Math.round(pct(sims, 10)),
    p25:    Math.round(pct(sims, 25)),
    median: Math.round(pct(sims, 50)),
    p75:    Math.round(pct(sims, 75)),
    p90:    Math.round(pct(sims, 90)),
  }));

  const finalSims = yearSnapshots[N_YEARS - 1];
  const p10    = Math.round(pct(finalSims, 10));
  const p25    = Math.round(pct(finalSims, 25));
  const median = Math.round(pct(finalSims, 50));
  const p75    = Math.round(pct(finalSims, 75));
  const p90    = Math.round(pct(finalSims, 90));

  // ── Probabilities ──
  const prob_ff            = Math.round((countFF / N_SIM) * 1000) / 10;
  const prob_neg_cf        = Math.round((countNegCF / N_SIM) * 1000) / 10;
  const prob_cash_shortfall = Math.round((countShortfall / N_SIM) * 1000) / 10;
  const prob_3m  = Math.round((countMS[0] / N_SIM) * 1000) / 10;
  const prob_5m  = Math.round((countMS[1] / N_SIM) * 1000) / 10;
  const prob_10m = Math.round((countMS[2] / N_SIM) * 1000) / 10;

  // ── Lowest cash median ──
  const lowest_cash_median = Math.round(pct(lowestCashPerSim, 50));

  // ── Highest risk year ──
  let highestRiskYearIdx = 0;
  let highestRiskCount   = 0;
  for (let yi = 0; yi < N_YEARS; yi++) {
    if (negCFByYear[yi] > highestRiskCount) {
      highestRiskCount   = negCFByYear[yi];
      highestRiskYearIdx = yi;
    }
  }
  const highest_risk_year = START_YR + highestRiskYearIdx;

  // ── Biggest risk driver ──
  const cryptoWeight = safeNum(s.crypto) / Math.max(
    safeNum(s.ppor) + safeNum(s.cash) + safeNum(s.stocks) + safeNum(s.crypto) + safeNum(s.super_balance), 1
  );
  const stockWeight = safeNum(s.stocks) / Math.max(
    safeNum(s.ppor) + safeNum(s.cash) + safeNum(s.stocks) + safeNum(s.crypto) + safeNum(s.super_balance), 1
  );
  const debtToAssets = (safeNum(s.mortgage) + safeNum(s.other_debts)) / Math.max(
    safeNum(s.ppor) + safeNum(s.cash) + safeNum(s.stocks) + safeNum(s.crypto) + safeNum(s.super_balance), 1
  );

  let biggest_risk_driver = 'Market volatility';
  if (cryptoWeight > 0.25) biggest_risk_driver = 'Crypto concentration';
  else if (debtToAssets > 0.5) biggest_risk_driver = 'High leverage';
  else if (prob_neg_cf > 30)   biggest_risk_driver = 'Cashflow pressure';
  else if (stockWeight > 0.5)  biggest_risk_driver = 'Stock market risk';
  else if (p10 < 0)            biggest_risk_driver = 'Downside net worth risk';

  // ── Key risks ──
  const key_risks: string[] = [];
  if (p10 < 0)                  key_risks.push('P10 scenario produces negative net worth — severe market downturns could eliminate equity');
  if (prob_neg_cf > 30)         key_risks.push(`${prob_neg_cf}% of simulations show at least one year of negative cashflow — emergency buffer may be needed`);
  if (prob_cash_shortfall > 25) key_risks.push(`${prob_cash_shortfall}% of paths fall below your $${(vp.emergency_buffer / 1000).toFixed(0)}k emergency buffer at some point`);
  if (prob_ff < 30)             key_risks.push('Less than 30% chance of reaching financial freedom by 2035 — passive income growth is the key gap');
  if (cryptoWeight > 0.2)       key_risks.push(`Crypto is ${Math.round(cryptoWeight * 100)}% of your liquid portfolio — high volatility (${vp.crypto_volatility}% annual std dev) drives wide outcome range`);
  if (p90 / Math.max(p10, 1) > 10) key_risks.push(`Outcome spread is ${(p90 / Math.max(p10, 1)).toFixed(0)}x (P90 vs P10) — your portfolio has high return variance`);
  if (vp.rate_shock_prob > 20 && debtToAssets > 0.3) key_risks.push(`${vp.rate_shock_prob}% annual probability of rate shock — large debt load amplifies this risk`);
  if (key_risks.length === 0)   key_risks.push('No critical structural risks detected in current scenario');

  // ── Recommended actions ──
  const recommended_actions: string[] = [];
  if (prob_ff < 50)             recommended_actions.push('Grow passive income — add investment properties or dividend-yielding ETFs to reach financial freedom faster');
  if (prob_neg_cf > 20)         recommended_actions.push(`Build cash buffer of $${(vp.emergency_buffer / 1000).toFixed(0)}k+ to absorb cashflow-negative periods without selling assets`);
  if (lowest_cash_median < vp.emergency_buffer) recommended_actions.push('Lowest projected cash balance is below your emergency buffer — consider increasing cash holdings or reducing planned purchases');
  if (cryptoWeight > 0.3)       recommended_actions.push('Rebalance crypto to reduce concentration risk — consider converting partial gains to property or diversified equities');
  if (prob_5m < 50)             recommended_actions.push('Increase DCA contributions or leverage property equity to improve $5M probability');
  if (vp.rate_shock_prob > 20 && debtToAssets > 0.4) recommended_actions.push('Consider fixing a portion of your mortgage to reduce interest rate shock exposure');
  recommended_actions.push('Re-run simulation after each major life event (property purchase, job change, market correction) to update your forecast');
  if (recommended_actions.length < 4) recommended_actions.push('Current strategy is on track — maintain consistent DCA and review annually');

  return {
    p10, p25, median, p75, p90,
    prob_ff, prob_3m, prob_5m, prob_10m, prob_neg_cf,
    prob_cash_shortfall,
    lowest_cash_median,
    highest_risk_year,
    biggest_risk_driver,
    fan_data, key_risks, recommended_actions,
    ran_at: new Date().toISOString(),
    simulations: N_SIM,
  };
}

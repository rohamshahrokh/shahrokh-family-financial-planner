// ─── Financial Calculation Engine ───────────────────────────────────
import { runCashEngine } from './cashEngine';

/**
 * safeNum — converts any value to a finite number.
 * undefined / null / "" / NaN all become 0.
 * Preserves valid positive and negative numbers.
 */
export function safeNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

export const formatCurrency = (amount: number, compact = false): string => {
  const n = safeNum(amount); // guard: never format NaN
  if (compact && Math.abs(n) >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(2)}M`;
  }
  if (compact && Math.abs(n) >= 1_000) {
    return `$${(n / 1_000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
};

export const formatPct = (value: number, decimals = 1) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;

// ─── DCA monthly equivalent ───────────────────────────────────────────
// Converts any DCA frequency + amount into a per-month cash figure.
export function dcaMonthlyEquiv(amount: number, frequency: string): number {
  switch (frequency) {
    case 'weekly':      return safeNum(amount) * (52 / 12);
    case 'fortnightly': return safeNum(amount) * (26 / 12);
    case 'monthly':     return safeNum(amount);
    case 'quarterly':   return safeNum(amount) / 3;
    default:            return safeNum(amount);
  }
}

// ─── Mortgage Calculator ───────────────────────────────────────────────
export function calcMonthlyRepayment(principal: number, annualRate: number, termYears: number): number {
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return principal / n;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export function calcLoanBalance(principal: number, annualRate: number, termYears: number, monthsPaid: number): number {
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (r === 0) return Math.max(0, principal - (principal / n) * monthsPaid);
  const pmt = calcMonthlyRepayment(principal, annualRate, termYears);
  return principal * Math.pow(1 + r, monthsPaid) - pmt * ((Math.pow(1 + r, monthsPaid) - 1) / r);
}

// ─── Property Projection ──────────────────────────────────────────────
export interface PropertyProjection {
  year: number;
  value: number;
  loanBalance: number;
  equity: number;
  rentalIncome: number;
  expenses: number;
  netCashFlow: number;
  cumulativeRent: number;
}

export function projectProperty(prop: {
  current_value: number;
  loan_amount: number;
  interest_rate: number;
  loan_type: string;
  loan_term: number;
  weekly_rent: number;
  rental_growth: number;
  vacancy_rate: number;
  management_fee: number;
  council_rates: number;
  insurance: number;
  maintenance: number;
  capital_growth: number;
  projection_years: number;
}): PropertyProjection[] {
  const years = prop.projection_years || 10;
  const results: PropertyProjection[] = [];
  let value = prop.current_value;
  let loan = prop.loan_amount;
  let rent = prop.weekly_rent * 52;
  let cumulativeRent = 0;

  const monthlyPayment = calcMonthlyRepayment(prop.loan_amount, prop.interest_rate, prop.loan_term);

  for (let y = 1; y <= years; y++) {
    // Property value growth
    value *= (1 + prop.capital_growth / 100);

    // Loan balance
    loan = Math.max(0, calcLoanBalance(prop.loan_amount, prop.interest_rate, prop.loan_term, y * 12));

    // Rental income (adjusted for vacancy)
    const grossRent = rent * (1 - prop.vacancy_rate / 100);
    const mgmtFee = grossRent * (prop.management_fee / 100);
    const netRent = grossRent - mgmtFee;

    // Annual expenses
    const annualExpenses = prop.council_rates + prop.insurance + prop.maintenance + monthlyPayment * 12;

    const netCashFlow = netRent - annualExpenses;
    cumulativeRent += netRent;

    results.push({
      year: new Date().getFullYear() + y,
      value: Math.round(value),
      loanBalance: Math.round(loan),
      equity: Math.round(value - loan),
      rentalIncome: Math.round(netRent),
      expenses: Math.round(annualExpenses),
      netCashFlow: Math.round(netCashFlow),
      cumulativeRent: Math.round(cumulativeRent),
    });

    // Rent grows annually
    rent *= (1 + prop.rental_growth / 100);
  }

  return results;
}

// ─── Stock/Crypto Projection ──────────────────────────────────────────
export interface InvestmentProjection {
  year: number;
  totalInvested: number;
  value: number;
  gain: number;
  gainPct: number;
}

export function projectInvestment(
  initialValue: number,
  expectedReturn: number,
  monthlyDCA: number,
  years: number,
  startYear = new Date().getFullYear()
): InvestmentProjection[] {
  const results: InvestmentProjection[] = [];
  let value = initialValue;
  let totalInvested = initialValue;
  const monthlyRate = expectedReturn / 100 / 12;

  for (let y = 1; y <= years; y++) {
    // Compound for 12 months with monthly DCA
    for (let m = 0; m < 12; m++) {
      value = value * (1 + monthlyRate) + monthlyDCA;
      totalInvested += monthlyDCA;
    }
    const gain = value - totalInvested;
    results.push({
      year: startYear + y,
      totalInvested: Math.round(totalInvested),
      value: Math.round(value),
      gain: Math.round(gain),
      gainPct: totalInvested > 0 ? (gain / totalInvested) * 100 : 0,
    });
  }
  return results;
}

// ─── Net Worth Projection ─────────────────────────────────────────────
export interface PropertyYearDetail {
  id: number;
  name: string;
  value: number;
  loanBalance: number;
  equity: number;
  annualCashFlow: number; // rental income minus loan repayments
}

export interface YearlyProjection {
  year: number;
  startNetWorth: number;
  income: number;
  expenses: number;
  propertyValue: number;
  propertyLoans: number;
  propertyEquity: number;
  propertyDetails: PropertyYearDetail[]; // per-property breakdown
  stockValue: number;
  cryptoValue: number;
  cash: number;
  totalAssets: number;
  totalLiabilities: number;
  endNetWorth: number;
  growth: number;
  growthPct: number;
  passiveIncome: number;
  monthlyCashFlow: number;
}

export function projectNetWorth(params: {
  snapshot: {
    ppor: number; cash: number; super_balance: number; stocks: number; crypto: number;
    cars: number; iran_property: number; mortgage: number; other_debts: number;
    monthly_income: number; monthly_expenses: number;
  };
  properties: any[];
  stocks: any[];
  cryptos: any[];
  years?: number;
  inflation?: number;
  ppor_growth?: number;
  // Per-year assumption overrides — when provided, growth rates come from here
  yearlyAssumptions?: Array<{
    year: number; property_growth: number; stocks_return: number; crypto_return: number;
    super_return: number; inflation: number; income_growth: number; expense_growth: number;
    interest_rate: number; rent_growth: number;
  }>;
  stockTransactions?: Array<{ transaction_type: string; status: string; transaction_date: string; total_amount: number; }>;
  cryptoTransactions?: Array<{ transaction_type: string; status: string; transaction_date: string; total_amount: number; }>;
  stockDCASchedules?: Array<{ enabled: boolean; amount: number; frequency: string; start_date: string; end_date?: string | null; }>;
  cryptoDCASchedules?: Array<{ enabled: boolean; amount: number; frequency: string; start_date: string; end_date?: string | null; }>;
  plannedStockOrders?: Array<{ action: string; amount_aud: number; planned_date: string; status: string; }>;
  plannedCryptoOrders?: Array<{ action: string; amount_aud: number; planned_date: string; status: string; }>;
  // Central Cash Engine params (for real cash balance vs. 50% shortcut)
  expenses?: Array<{ date: string; amount: number; category: string }>;
  bills?: Array<{ amount: number; frequency: string; next_due_date?: string; is_active?: boolean; }>;
  ngRefundMode?: 'lump-sum' | 'payg';
  ngAnnualBenefit?: number;
  annualSalaryIncome?: number;
}): YearlyProjection[] {
  const years = params.years || 10;
  const inflation = params.inflation || 3;
  const pporGrowth = params.ppor_growth || 6;
  const s = params.snapshot;

  const results: YearlyProjection[] = [];
  const currentYear = new Date().getFullYear();

  // ── Central Cash Engine (runCashEngine) — event-driven monthly ledger ──
  // Replaces the old "annualSurplus * 0.5" shortcut entirely.
  // cashByYear gives the real December closing cash for each year.
  const _engineOut = runCashEngine({
    snapshot: {
      cash:             safeNum(params.snapshot.cash),
      monthly_income:   safeNum(params.snapshot.monthly_income),
      monthly_expenses: safeNum(params.snapshot.monthly_expenses),
      mortgage:         safeNum(params.snapshot.mortgage),
      other_debts:      safeNum(params.snapshot.other_debts),
    },
    properties:          params.properties,
    stockTransactions:   params.stockTransactions   ?? [],
    cryptoTransactions:  params.cryptoTransactions  ?? [],
    stockDCASchedules:   params.stockDCASchedules   ?? [],
    cryptoDCASchedules:  params.cryptoDCASchedules  ?? [],
    plannedStockOrders:  params.plannedStockOrders  ?? [],
    plannedCryptoOrders: params.plannedCryptoOrders ?? [],
    bills:               params.bills               ?? [],
    expenses:            params.expenses            ?? [],
    ngRefundMode:        params.ngRefundMode,
    ngAnnualBenefit:     params.ngAnnualBenefit,
    annualSalaryIncome:  params.annualSalaryIncome,
    inflationRate:       params.inflation,
    incomeGrowthRate:    params.yearlyAssumptions?.[0]?.income_growth,
  });
  const _cashByYear = _engineOut.cashByYear;

  // Guard every field — if snapshot came back with undefined/NaN fields
  // (e.g. field name mismatch), calculations silently use 0 instead of NaN.
  let ppor           = safeNum(s.ppor);
  let cash           = safeNum(s.cash);
  let superBal       = safeNum(s.super_balance);
  let stockVal       = safeNum(s.stocks);
  let cryptoVal      = safeNum(s.crypto);
  let mortgage       = safeNum(s.mortgage);
  let otherDebts     = safeNum(s.other_debts);
  let monthlyIncome  = safeNum(s.monthly_income);
  let monthlyExpenses = safeNum(s.monthly_expenses);
  const cars         = safeNum(s.cars);
  const iranProp     = safeNum(s.iran_property);

  for (let y = 1; y <= years; y++) {
    const year = currentYear + y;
    const startNW = (ppor + cash + superBal + stockVal + cryptoVal + cars + iranProp) - (mortgage + otherDebts);

    // Resolve per-year assumptions if available
    const yAss = params.yearlyAssumptions?.find(a => a.year === year);
    const effectivePporGrowth  = yAss ? yAss.property_growth : pporGrowth;
    const effectiveInflation   = yAss ? yAss.inflation        : inflation;
    const effectiveIncomeGrowth = yAss ? yAss.income_growth   : 3.5;
    const effectiveSuperReturn  = yAss ? yAss.super_return    : 10;
    const effectiveInterestRate = yAss ? yAss.interest_rate   : 6.5;

    // PPOR growth
    ppor *= (1 + effectivePporGrowth / 100);
    // Mortgage reduction
    mortgage = Math.max(0, calcLoanBalance(s.mortgage, effectiveInterestRate, 30, y * 12));

    // Super growth
    superBal *= (1 + effectiveSuperReturn / 100);

    // Income/expense changes
    monthlyIncome    *= (1 + effectiveIncomeGrowth / 100);
    monthlyExpenses  *= (1 + effectiveInflation    / 100);

    // Property portfolio — only include investment properties that have settled by this year
    let propValue = 0; let propLoans = 0; let propRent = 0;
    const propertyDetails: PropertyYearDetail[] = [];
    const todayYear = new Date().getFullYear();
    for (const prop of params.properties) {
      if (prop.type === 'ppor') continue; // PPOR already in snapshot

      // Determine settlement year
      const settleDateStr = prop.settlement_date || prop.purchase_date;
      const settleYear = settleDateStr
        ? new Date(settleDateStr).getFullYear()
        : todayYear; // if no date, assume already settled

      if (year < settleYear) continue; // not yet purchased

      // Years since settlement for this projection year
      const yearsSinceSettle = year - settleYear;
      const startValue = safeNum(prop.purchase_price) || safeNum(prop.current_value);
      const growthRate = (safeNum(prop.capital_growth) || 6) / 100;
      const projValue = startValue * Math.pow(1 + growthRate, yearsSinceSettle + 1);

      const loanBal = Math.max(0, calcLoanBalance(
        safeNum(prop.loan_amount),
        safeNum(prop.interest_rate) || 6.5,
        safeNum(prop.loan_term) || 30,
        (yearsSinceSettle + 1) * 12
      ));

      propValue += projValue;
      propLoans += loanBal;

      // Rental income only if settled and rental started
      let annualRent = 0;
      const rentalStartStr = prop.rental_start_date;
      const rentalStartYear = rentalStartStr
        ? new Date(rentalStartStr).getFullYear()
        : settleYear;
      if (year >= rentalStartYear) {
        const yearsSinceRental = year - rentalStartYear;
        annualRent = safeNum(prop.weekly_rent) * 52
          * (1 - safeNum(prop.vacancy_rate) / 100)
          * (1 - safeNum(prop.management_fee) / 100)
          * Math.pow(1 + (safeNum(prop.rental_growth) || 3) / 100, yearsSinceRental);
        propRent += annualRent;
      }

      // Annual loan repayment for this property
      const annualLoanRepayment = calcMonthlyRepayment(
        safeNum(prop.loan_amount),
        safeNum(prop.interest_rate) || 6.5,
        safeNum(prop.loan_term) || 30
      ) * 12;

      propertyDetails.push({
        id: prop.id,
        name: prop.name || prop.address || `Property ${prop.id}`,
        value: Math.round(projValue),
        loanBalance: Math.round(loanBal),
        equity: Math.round(projValue - loanBal),
        annualCashFlow: Math.round(annualRent - annualLoanRepayment),
      });
    }

    // Stocks projection
    let stocksTotal = stockVal;
    for (const stock of params.stocks) {
      const val = stock.current_holding * stock.current_price;
      if (val > 0) {
        const proj = projectInvestment(val, stock.expected_return, stock.monthly_dca || 0, y);
        stocksTotal += proj[y - 1]?.value || 0;
      }
    }

    // Crypto projection
    let cryptoTotal = cryptoVal;
    for (const c of params.cryptos) {
      const val = c.current_holding * c.current_price;
      if (val > 0) {
        const proj = projectInvestment(val, c.expected_return, c.monthly_dca || 0, y);
        cryptoTotal += proj[y - 1]?.value || 0;
      }
    }

    // Add planned stock/crypto buys to portfolio value from that year onward
    const stockTxYear = params.stockTransactions ?? [];
    const cryptoTxYear = params.cryptoTransactions ?? [];

    for (const tx of stockTxYear) {
      if (tx.status !== 'planned') continue;
      const txYear = new Date(tx.transaction_date).getFullYear();
      if (year < txYear) continue; // not yet
      const yearsGrowing = year - txYear;
      const txReturn = (params.stocks?.[0]?.expected_return ?? 10) / 100;
      if (tx.transaction_type === 'buy') {
        stocksTotal += safeNum(tx.total_amount) * Math.pow(1 + txReturn, yearsGrowing + 1);
      }
      // sells reduce value — handled via cash impact in cashflow
    }

    for (const tx of cryptoTxYear) {
      if (tx.status !== 'planned') continue;
      const txYear = new Date(tx.transaction_date).getFullYear();
      if (year < txYear) continue;
      const yearsGrowing = year - txYear;
      const txReturn = (params.cryptos?.[0]?.expected_return ?? 20) / 100;
      if (tx.transaction_type === 'buy') {
        cryptoTotal += safeNum(tx.total_amount) * Math.pow(1 + txReturn, yearsGrowing + 1);
      }
    }

    // ── DCA schedule impact on net worth ──
    // DCA cash goes from cash account → investment value (net zero for NW, but shifts asset class)
    // The actual growth impact is already handled by projectInvestment on individual stocks/cryptos via monthly_dca.
    // Here we also account for DCA schedules from the dedicated DCA tables (additive to per-stock monthly_dca).
    const dcaYear = currentYear + y;
    let totalStockDCAMonthly = 0;
    for (const dca of (params.stockDCASchedules ?? [])) {
      if (!dca.enabled) continue;
      const dcaStartYear = new Date(dca.start_date).getFullYear();
      const dcaEndYear = dca.end_date ? new Date(dca.end_date).getFullYear() : 9999;
      if (dcaYear >= dcaStartYear && dcaYear <= dcaEndYear) {
        totalStockDCAMonthly += dcaMonthlyEquiv(dca.amount, dca.frequency);
      }
    }
    let totalCryptoDCAMonthly = 0;
    for (const dca of (params.cryptoDCASchedules ?? [])) {
      if (!dca.enabled) continue;
      const dcaStartYear = new Date(dca.start_date).getFullYear();
      const dcaEndYear = dca.end_date ? new Date(dca.end_date).getFullYear() : 9999;
      if (dcaYear >= dcaStartYear && dcaYear <= dcaEndYear) {
        totalCryptoDCAMonthly += dcaMonthlyEquiv(dca.amount, dca.frequency);
      }
    }
    // DCA amounts boost investment values (compounded at avg return rate)
    const avgStockReturn = params.stocks?.length > 0
      ? params.stocks.reduce((s, st) => s + safeNum(st.expected_return), 0) / params.stocks.length
      : 10;
    const avgCryptoReturn = params.cryptos?.length > 0
      ? params.cryptos.reduce((s, c) => s + safeNum(c.expected_return), 0) / params.cryptos.length
      : 20;
    // Compound 12 months of DCA at the avg annual return
    const monthlyStockRate = avgStockReturn / 100 / 12;
    const monthlyCryptoRate = avgCryptoReturn / 100 / 12;
    let dcaStockGrowth = 0;
    let dcaCryptoGrowth = 0;
    for (let m = 0; m < 12; m++) {
      dcaStockGrowth = (dcaStockGrowth + totalStockDCAMonthly) * (1 + monthlyStockRate);
      dcaCryptoGrowth = (dcaCryptoGrowth + totalCryptoDCAMonthly) * (1 + monthlyCryptoRate);
    }
    stockVal += dcaStockGrowth;
    cryptoVal += dcaCryptoGrowth;

    // ── Planned orders impact on net worth ──
    for (const o of (params.plannedStockOrders ?? [])) {
      if (o.status !== 'planned') continue;
      const oYear = new Date(o.planned_date).getFullYear();
      if (oYear !== dcaYear) continue;
      const yearsGrowing = 0; // added this year, grows from next year
      if (o.action === 'buy') stockVal += safeNum(o.amount_aud);
      if (o.action === 'sell') stockVal -= safeNum(o.amount_aud);
    }
    for (const o of (params.plannedCryptoOrders ?? [])) {
      if (o.status !== 'planned') continue;
      const oYear = new Date(o.planned_date).getFullYear();
      if (oYear !== dcaYear) continue;
      if (o.action === 'buy') cryptoVal += safeNum(o.amount_aud);
      if (o.action === 'sell') cryptoVal -= safeNum(o.amount_aud);
    }

    // Cash balance from central monthly engine (real projected ending balance for this year)
    cash = _cashByYear.get(year) ?? cash;

    // Calculate totals
    const totalAssets = ppor + cash + superBal + stocksTotal + cryptoTotal + cars * 0.8 + iranProp + propValue;
    const totalLiabilities = mortgage + otherDebts * Math.max(0, 1 - y * 0.1) + propLoans;
    const endNW = totalAssets - totalLiabilities;
    const passiveIncome = propRent + stocksTotal * 0.02 + cryptoTotal * 0.01;
    const monthlyCF = monthlyIncome - monthlyExpenses + passiveIncome / 12;

    results.push({
      year,
      startNetWorth: Math.round(startNW),
      income: Math.round(monthlyIncome * 12),
      expenses: Math.round(monthlyExpenses * 12),
      propertyValue: Math.round(ppor + propValue),
      propertyLoans: Math.round(mortgage + propLoans),
      propertyEquity: Math.round(ppor + propValue - mortgage - propLoans),
      propertyDetails,
      stockValue: Math.round(stocksTotal),
      cryptoValue: Math.round(cryptoTotal),
      cash: Math.round(cash),
      totalAssets: Math.round(totalAssets),
      totalLiabilities: Math.round(totalLiabilities),
      endNetWorth: Math.round(endNW),
      growth: Math.round(endNW - startNW),
      growthPct: startNW > 0 ? ((endNW - startNW) / Math.abs(startNW)) * 100 : 0,
      passiveIncome: Math.round(passiveIncome),
      monthlyCashFlow: Math.round(monthlyCF),
    });
  }

  return results;
}

// ─── Savings Rate ─────────────────────────────────────────────────────
export function calcSavingsRate(income: number, expenses: number): number {
  if (income === 0) return 0;
  return ((income - expenses) / income) * 100;
}

// ─── CAGR ─────────────────────────────────────────────────────────────
export function calcCAGR(startValue: number, endValue: number, years: number): number {
  if (startValue <= 0 || years === 0) return 0;
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
}

// ─── Master Cash Flow Series ──────────────────────────────────────────
// Produces a month-by-month cash flow series from Jan 2025 → Dec 2035.
// Actual expenses are the source of truth for historical months.
// Financial Snapshot assumptions fill in the future (forecast).
//
// Double-counting logic:
//   - If the expenses array contains any row with category 'Mortgage' for a given
//     month, we skip adding PPOR mortgage repayment from the snapshot for that month.
//   - Investment properties contribute rental income / loan costs only from their
//     purchase_date onward (or Jan 2025 if no purchase_date).

export interface CashFlowMonth {
  key: string;          // e.g. "2025-01"
  label: string;        // e.g. "Jan 2025"
  year: number;
  month: number;        // 1-12
  isActual: boolean;    // true = driven by real expense records

  // Income
  income: number;       // gross monthly income (salary)

  // Expenses
  actualExpenses: number;   // sum of tracked expense rows for this month
  forecastExpenses: number; // snapshot-derived forecast (used when no actuals)
  totalExpenses: number;    // whichever is used

  // Property
  rentalIncome: number;              // net rental income from investment props
  mortgageRepayment: number;         // PPOR mortgage repayment
  investmentLoanRepayment: number;   // investment property loan repayments
  propertyExpenses: number;          // deductible running costs (rates, insurance, maintenance)

  // Tax
  taxPayable: number;        // estimated tax payable (income tax, simplified)
  ngTaxBenefit: number;      // negative gearing refund (lump-sum: Aug only; PAYG: every month)
  ngBenefitSpread: number;   // PAYG monthly benefit amount (same as ngTaxBenefit in PAYG mode)

  // Summary
  netCashFlow: number;       // income + rental + ngTaxBenefit - expenses - mortgages - tax
  cumulativeBalance: number; // running cumulative
}

export function buildCashFlowSeries(params: {
  snapshot: {
    monthly_income: number;
    monthly_expenses: number;
    mortgage: number;
    other_debts: number;
    cash: number;
  };
  expenses: Array<{ date: string; amount: number; category: string }>;
  properties: Array<{
    id: number;
    type: string;
    purchase_date?: string;
    settlement_date?: string;
    rental_start_date?: string;
    loan_amount: number;
    interest_rate: number;
    loan_term: number;
    loan_type: string;
    weekly_rent: number;
    rental_growth: number;
    vacancy_rate: number;
    management_fee: number;
    council_rates: number;
    insurance: number;
    maintenance: number;
    capital_growth: number;
    projection_years: number;
    deposit?: number;
    stamp_duty?: number;
    legal_fees?: number;
    renovation_costs?: number;
    building_inspection?: number;
    loan_setup_fees?: number;
  }>;
  inflationRate?: number;   // annual % for expense forecast growth (default 3)
  incomeGrowthRate?: number; // annual % for income forecast growth (default 3.5)
  stockTransactions?: Array<{ transaction_type: string; status: string; transaction_date: string; total_amount: number; ticker?: string; }>;
  cryptoTransactions?: Array<{ transaction_type: string; status: string; transaction_date: string; total_amount: number; symbol?: string; }>;
  // DCA schedules — monthly cash outflows for automated investing
  stockDCASchedules?: Array<{ enabled: boolean; amount: number; frequency: string; start_date: string; end_date?: string | null; }>;
  cryptoDCASchedules?: Array<{ enabled: boolean; amount: number; frequency: string; start_date: string; end_date?: string | null; }>;
  // Planned orders — one-time future investment cash flows
  plannedStockOrders?: Array<{ action: string; amount_aud: number; planned_date: string; status: string; }>;
  plannedCryptoOrders?: Array<{ action: string; amount_aud: number; planned_date: string; status: string; }>;
  // Recurring bills — monthly outflows (insurance, subscriptions, utilities not in expenses)
  bills?: Array<{ amount: number; frequency: string; next_due_date?: string; is_active?: boolean; }>;
  // Australian negative gearing options
  ngRefundMode?: 'lump-sum' | 'payg'; // default 'lump-sum'
  ngAnnualBenefit?: number;            // pre-calculated total NG refund per year (from calcNegativeGearing)
  annualSalaryIncome?: number;         // gross annual salary for tax calc display
}): CashFlowMonth[] {
  const START_YEAR = 2025;
  const START_MONTH = 1;
  const END_YEAR = 2035;
  const END_MONTH = 12;

  const inflationRate = (params.inflationRate ?? 3) / 100;
  const incomeGrowthRate = (params.incomeGrowthRate ?? 3.5) / 100;
  const s = params.snapshot;

  // ─ NG refund parameters ─
  const ngRefundMode   = params.ngRefundMode   ?? 'lump-sum';
  const ngAnnualBenefit = safeNum(params.ngAnnualBenefit); // $0 if not provided
  const ngMonthlyBenefit = ngAnnualBenefit / 12;           // for PAYG mode
  // Australian FY ends 30 June; tax return / refund lands in August (month 8)
  const NG_REFUND_MONTH = 8; // August

  const snap_income   = safeNum(s.monthly_income) || 22000;
  const snap_expenses = safeNum(s.monthly_expenses) || 14540;
  const snap_mortgage = safeNum(s.mortgage) || 1200000;

  // Pre-compute PPOR monthly mortgage repayment (fixed amount)
  const pporMonthlyRepayment = calcMonthlyRepayment(snap_mortgage, 6.5, 30);

  // Pre-build a lookup: "YYYY-MM" → { totalAmount, hasMortgage }
  const expenseLookup = new Map<string, { total: number; hasMortgage: boolean }>();
  for (const exp of params.expenses) {
    if (!exp.date) continue;
    const key = exp.date.substring(0, 7); // "YYYY-MM"
    const existing = expenseLookup.get(key) || { total: 0, hasMortgage: false };
    existing.total += safeNum(exp.amount);
    if ((exp.category || '').toLowerCase().includes('mortgage')) {
      existing.hasMortgage = true;
    }
    expenseLookup.set(key, existing);
  }

  // Determine the most recent month that has actual expense records
  const actualKeys = Array.from(expenseLookup.keys()).sort();
  const lastActualKey = actualKeys.length > 0 ? actualKeys[actualKeys.length - 1] : '';

  // Investment properties: exclude PPOR type
  const investmentProps = params.properties.filter(p => p.type !== 'ppor');

  const results: CashFlowMonth[] = [];
  let cumulativeBalance = safeNum(s.cash);
  let monthIndex = 0; // months since Jan 2025

  for (let year = START_YEAR; year <= END_YEAR; year++) {
    for (let month = (year === START_YEAR ? START_MONTH : 1);
         month <= (year === END_YEAR ? END_MONTH : 12);
         month++) {
      const keyMM = String(month).padStart(2, '0');
      const key = `${year}-${keyMM}`;
      const isActual = expenseLookup.has(key);
      const yearsFromStart = monthIndex / 12;

      // ── Income ──
      const income = snap_income * Math.pow(1 + incomeGrowthRate, yearsFromStart);

      // ── Expenses ──
      let actualExpenses = 0;
      let hasMortgageInActuals = false;
      if (isActual) {
        const rec = expenseLookup.get(key)!;
        actualExpenses = rec.total;
        hasMortgageInActuals = rec.hasMortgage;
      }

      // Forecast expenses grow with inflation from the base snapshot figure,
      // but we only use forecast for months with no actuals
      const forecastExpenses = snap_expenses * Math.pow(1 + inflationRate, yearsFromStart);
      const totalExpenses = isActual ? actualExpenses : forecastExpenses;

      // ── PPOR Mortgage ──
      // Skip if actuals already include a 'Mortgage' category row for this month
      const mortgageRepayment = hasMortgageInActuals ? 0 : pporMonthlyRepayment;

      // ── Investment Properties ──
      let rentalIncome = 0;
      let investmentLoanRepayment = 0;
      let propDeductibleExpenses = 0; // running costs for NG calc display
      const monthDate = new Date(year, month - 1, 1);

      // Track one-time cash outflows for this month
      let oneTimeCashOutflow = 0;

      for (const prop of investmentProps) {
        // Prefer settlement_date over purchase_date
        const settleDateStr = prop.settlement_date || prop.purchase_date;
        let settleDate: Date;
        if (settleDateStr) {
          settleDate = new Date(settleDateStr);
          settleDate.setDate(1); // normalise to month start
        } else {
          settleDate = new Date(START_YEAR, 0, 1);
        }

        // Rental start date (default: month after settlement)
        let rentalStartDate: Date;
        if (prop.rental_start_date) {
          rentalStartDate = new Date(prop.rental_start_date);
          rentalStartDate.setDate(1);
        } else {
          rentalStartDate = new Date(settleDate.getFullYear(), settleDate.getMonth() + 1, 1);
        }

        // One-time purchase costs: subtract in the settlement month
        const isSettlementMonth = (
          monthDate.getFullYear() === settleDate.getFullYear() &&
          monthDate.getMonth() === settleDate.getMonth()
        );
        if (isSettlementMonth) {
          oneTimeCashOutflow += safeNum(prop.deposit)
            + safeNum(prop.stamp_duty)
            + safeNum(prop.legal_fees)
            + safeNum(prop.renovation_costs)
            + safeNum(prop.building_inspection)
            + safeNum(prop.loan_setup_fees);
        }

        // Loan repayment: starts from settlement month
        if (monthDate >= settleDate) {
          const monthlyLoanPmt = calcMonthlyRepayment(
            safeNum(prop.loan_amount),
            safeNum(prop.interest_rate) || 6.5,
            safeNum(prop.loan_term) || 30
          );
          investmentLoanRepayment += monthlyLoanPmt;
        }

        // Rental income: only from rental_start_date
        if (monthDate >= rentalStartDate) {
          const monthsSinceRental = (monthDate.getFullYear() - rentalStartDate.getFullYear()) * 12
            + (monthDate.getMonth() - rentalStartDate.getMonth());
          const yearsSinceRental = monthsSinceRental / 12;
          const annualRent = safeNum(prop.weekly_rent) * 52
            * (1 - safeNum(prop.vacancy_rate) / 100)
            * (1 - safeNum(prop.management_fee) / 100)
            * Math.pow(1 + (safeNum(prop.rental_growth) || 3) / 100, yearsSinceRental);
          rentalIncome += annualRent / 12;

          // Track deductible expenses per month for this property
          propDeductibleExpenses += (
            safeNum(prop.council_rates) + safeNum(prop.insurance) +
            safeNum(prop.maintenance) + safeNum((prop as any).water_rates) +
            safeNum((prop as any).body_corporate) + safeNum((prop as any).land_tax)
          ) / 12;
        }
      }

      // ── Planned stock transactions ──
      let plannedStockCashDelta = 0;
      for (const tx of (params.stockTransactions ?? [])) {
        if (tx.status !== 'planned') continue;
        if (!tx.transaction_date) continue;
        const txDate = new Date(tx.transaction_date);
        if (txDate.getFullYear() === year && txDate.getMonth() + 1 === month) {
          if (tx.transaction_type === 'buy') plannedStockCashDelta -= safeNum(tx.total_amount);
          if (tx.transaction_type === 'sell') plannedStockCashDelta += safeNum(tx.total_amount);
        }
      }

      // ── Planned crypto transactions ──
      let plannedCryptoCashDelta = 0;
      for (const tx of (params.cryptoTransactions ?? [])) {
        if (tx.status !== 'planned') continue;
        if (!tx.transaction_date) continue;
        const txDate = new Date(tx.transaction_date);
        if (txDate.getFullYear() === year && txDate.getMonth() + 1 === month) {
          if (tx.transaction_type === 'buy') plannedCryptoCashDelta -= safeNum(tx.total_amount);
          if (tx.transaction_type === 'sell') plannedCryptoCashDelta += safeNum(tx.total_amount);
        }
      }

      // ── DCA schedule outflows ──
      // Each active DCA schedule is a monthly cash outflow (money leaving cash, going into investments)
      let stockDCAOutflow = 0;
      for (const dca of (params.stockDCASchedules ?? [])) {
        if (!dca.enabled) continue;
        const dcaStart = new Date(dca.start_date);
        const dcaEnd = dca.end_date ? new Date(dca.end_date) : null;
        if (monthDate < dcaStart) continue;
        if (dcaEnd && monthDate > dcaEnd) continue;
        stockDCAOutflow += dcaMonthlyEquiv(dca.amount, dca.frequency);
      }
      let cryptoDCAOutflow = 0;
      for (const dca of (params.cryptoDCASchedules ?? [])) {
        if (!dca.enabled) continue;
        const dcaStart = new Date(dca.start_date);
        const dcaEnd = dca.end_date ? new Date(dca.end_date) : null;
        if (monthDate < dcaStart) continue;
        if (dcaEnd && monthDate > dcaEnd) continue;
        cryptoDCAOutflow += dcaMonthlyEquiv(dca.amount, dca.frequency);
      }

      // ── Planned orders (one-time) ──
      let plannedStockOrderDelta = 0;
      for (const o of (params.plannedStockOrders ?? [])) {
        if (o.status !== 'planned') continue;
        if (!o.planned_date) continue;
        const oDate = new Date(o.planned_date);
        if (oDate.getFullYear() === year && oDate.getMonth() + 1 === month) {
          if (o.action === 'buy') plannedStockOrderDelta -= safeNum(o.amount_aud);
          if (o.action === 'sell') plannedStockOrderDelta += safeNum(o.amount_aud);
        }
      }
      let plannedCryptoOrderDelta = 0;
      for (const o of (params.plannedCryptoOrders ?? [])) {
        if (o.status !== 'planned') continue;
        if (!o.planned_date) continue;
        const oDate = new Date(o.planned_date);
        if (oDate.getFullYear() === year && oDate.getMonth() + 1 === month) {
          if (o.action === 'buy') plannedCryptoOrderDelta -= safeNum(o.amount_aud);
          if (o.action === 'sell') plannedCryptoOrderDelta += safeNum(o.amount_aud);
        }
      }

      // ── Recurring bills outflow ──
      // Only apply to forecast months (not actual months — bills are already in tracked expenses)
      let billsOutflow = 0;
      if (!isActual) {
        for (const bill of (params.bills ?? [])) {
          if (bill.is_active === false) continue;
          billsOutflow += dcaMonthlyEquiv(safeNum(bill.amount), bill.frequency || 'monthly');
        }
      }

      // ── Negative Gearing Tax Benefit ──
      // PAYG mode: monthly benefit spread evenly throughout the year (employer variation)
      // Lump-sum mode: ATO refund received in August (month 8) for prior FY
      // Only apply to forecast months (actual months already have correct tax withheld)
      let ngTaxBenefit  = 0;
      let ngBenefitSpread = 0;
      if (!isActual && ngAnnualBenefit > 0) {
        if (ngRefundMode === 'payg') {
          // PAYG withholding variation: benefit spread every month
          ngTaxBenefit   = ngMonthlyBenefit;
          ngBenefitSpread = ngMonthlyBenefit;
        } else {
          // Lump-sum: refund arrives in August (month 8)
          // We credit the previous FY's refund — so Aug 2026 gets FY2025–26 refund, etc.
          if (month === NG_REFUND_MONTH && year > 2025) {
            ngTaxBenefit = ngAnnualBenefit;
          }
        }
      }

      // Simplified annual tax payable estimate (for display line only — does NOT reduce cash)
      // Tax is withheld from salary by employer; we show it as informational only
      const annualSalary = safeNum(params.annualSalaryIncome) || income * 12;
      const taxPayable = auTaxPayable(annualSalary) / 12;

      // ── Net Cash Flow ──
      // income + rental + ngTaxBenefit - expenses (actuals or forecast) - mortgage - invest loans
      // Note: when actuals are used and they include mortgage, mortgageRepayment=0 so no double count
      // Tax is already withheld by employer so not subtracted here (salary is post-tax at source)
      const netCashFlow = income + rentalIncome + ngTaxBenefit - totalExpenses - mortgageRepayment - investmentLoanRepayment
        - oneTimeCashOutflow + plannedStockCashDelta + plannedCryptoCashDelta
        - stockDCAOutflow - cryptoDCAOutflow
        + plannedStockOrderDelta + plannedCryptoOrderDelta
        - billsOutflow;
      cumulativeBalance += netCashFlow;

      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      results.push({
        key,
        label: `${monthNames[month - 1]} ${year}`,
        year,
        month,
        isActual,
        income: Math.round(income),
        actualExpenses: Math.round(actualExpenses),
        forecastExpenses: Math.round(forecastExpenses),
        totalExpenses: Math.round(totalExpenses),
        rentalIncome: Math.round(rentalIncome),
        mortgageRepayment: Math.round(mortgageRepayment),
        investmentLoanRepayment: Math.round(investmentLoanRepayment),
        propertyExpenses: Math.round(propDeductibleExpenses),
        taxPayable: Math.round(taxPayable),
        ngTaxBenefit: Math.round(ngTaxBenefit),
        ngBenefitSpread: Math.round(ngBenefitSpread),
        netCashFlow: Math.round(netCashFlow),
        cumulativeBalance: Math.round(cumulativeBalance),
      });

      monthIndex++;
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// AUSTRALIAN TAX ENGINE — Negative Gearing + PAYG/EOFY Refund
// ═══════════════════════════════════════════════════════════════════════

/**
 * Australian 2024-25 individual income tax brackets (resident, excluding Medicare levy).
 * We add 2% Medicare levy on top for a realistic marginal effective rate.
 *
 * Brackets: https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents
 *   $0       – $18,200   : 0%
 *   $18,201  – $45,000   : 19%
 *   $45,001  – $120,000  : 32.5%
 *   $120,001 – $180,000  : 37%
 *   $180,001+            : 45%
 * Medicare levy: 2% on top (approximation — full threshold logic omitted for simplicity)
 */
export function auMarginalRate(annualIncome: number): number {
  const income = Math.max(0, annualIncome);
  if (income <= 18_200) return 0;
  if (income <= 45_000) return 0.19 + 0.02; // 21%
  if (income <= 120_000) return 0.325 + 0.02; // 34.5%
  if (income <= 180_000) return 0.37 + 0.02; // 39%
  return 0.45 + 0.02; // 47%
}

/**
 * Calculate tax payable at each bracket (for display purposes only).
 */
export function auTaxPayable(annualIncome: number): number {
  const income = Math.max(0, annualIncome);
  if (income <= 18_200) return 0;
  if (income <= 45_000) return (income - 18_200) * 0.19;
  if (income <= 120_000) return 5_092 + (income - 45_000) * 0.325;
  if (income <= 180_000) return 29_467 + (income - 120_000) * 0.37;
  return 51_667 + (income - 180_000) * 0.45;
}

/**
 * Per-property negative gearing analysis.
 *
 * Taxable rental loss (ATO method):
 *   rental income (net of vacancy + mgmt fee)
 *   − loan interest (interest-only portion of repayment)
 *   − deductible property expenses (council, insurance, maintenance, water, body corp, land tax)
 *   − depreciation estimate (if enabled)
 *
 * NOTE: principal repayments are NOT tax-deductible.
 * NOTE: capital works / building depreciation is approximated at 2.5% of
 *       purchase price per year (Div 43 at standard rate).
 */
export interface NGAnalysis {
  propertyId: number;
  propertyName: string;
  annualRentalIncome: number;     // net (after vacancy + mgmt fee)
  annualInterest: number;         // interest-only portion of loan repayments
  annualDeductibleExpenses: number; // rates + insurance + maintenance etc.
  annualDepreciation: number;     // Div 43 estimate
  taxableRentalResult: number;    // income - interest - expenses - depreciation  (negative = loss)
  isNegativelyGeared: boolean;
  annualTaxBenefit: number;       // marginalRate × |loss|  (positive = $ refund)
  monthlyTaxBenefit: number;      // annualTaxBenefit / 12  (for PAYG spread)
  monthlyCashLoss: number;        // net rental income − full loan repayment − expenses/12
  netAfterTaxMonthlyCost: number; // monthlyCashLoss + monthlyTaxBenefit
  ownershipShare: number;         // 0–1
}

export interface NGSummary {
  properties: NGAnalysis[];
  totalAnnualTaxBenefit: number;
  totalMonthlyCashLoss: number;
  totalNetAfterTaxMonthlyCost: number;
  totalTaxableRentalResult: number;
  marginalRate: number;
  refundMode: 'lump-sum' | 'payg';
}

export function calcNegativeGearing(params: {
  properties: Array<{
    id: number;
    name?: string;
    address?: string;
    type: string;
    loan_amount: number;
    interest_rate: number;
    loan_type: string;
    loan_term: number;
    weekly_rent: number;
    vacancy_rate: number;
    management_fee: number;
    council_rates: number;
    insurance: number;
    maintenance: number;
    water_rates?: number;
    body_corporate?: number;
    land_tax?: number;
    purchase_price?: number;
    current_value?: number;
    ownership_share?: number; // 0–1, default 1.0
    depreciation_enabled?: boolean;
    settlement_date?: string;
    purchase_date?: string;
    rental_start_date?: string;
  }>;
  annualSalaryIncome: number; // combined household gross salary
  refundMode?: 'lump-sum' | 'payg';
  jointOwnership?: boolean;    // if true, income split 50/50 before bracket calc
}): NGSummary {
  const mode = params.refundMode ?? 'lump-sum';
  const salaryForBracket = params.jointOwnership
    ? params.annualSalaryIncome / 2
    : params.annualSalaryIncome;

  const investmentProps = params.properties.filter(p => p.type !== 'ppor');

  const analyses: NGAnalysis[] = investmentProps.map(prop => {
    const loanAmount    = safeNum(prop.loan_amount);
    const interestRate  = safeNum(prop.interest_rate) || 6.5;
    const loanTerm      = safeNum(prop.loan_term) || 30;
    const isIO          = prop.loan_type === 'IO';
    const weeklyRent    = safeNum(prop.weekly_rent);
    const ownerShare    = safeNum(prop.ownership_share) || 1.0;
    const purchasePrice = safeNum(prop.purchase_price) || safeNum(prop.current_value);

    // Annual rental income (net of vacancy + management fee)
    const grossAnnualRent = weeklyRent * 52 * (1 - safeNum(prop.vacancy_rate) / 100);
    const annualRentalIncome = grossAnnualRent * (1 - safeNum(prop.management_fee) / 100) * ownerShare;

    // Annual interest (deductible portion)
    // IO loan: entire repayment is interest
    // PI loan: interest portion = outstanding balance × rate (approximated at year 1)
    const annualInterest = isIO
      ? loanAmount * (interestRate / 100) * ownerShare
      : loanAmount * (interestRate / 100) * ownerShare; // conservative: use full interest rate × principal (slightly overstates early, understates late — good enough for forecast)

    // Deductible running expenses (excl. principal)
    const annualDeductibleExpenses = (
      safeNum(prop.council_rates) +
      safeNum(prop.insurance) +
      safeNum(prop.maintenance) +
      safeNum(prop.water_rates) +
      safeNum(prop.body_corporate) +
      safeNum(prop.land_tax)
    ) * ownerShare;

    // Div 43 building depreciation estimate (2.5% of purchase price, if enabled)
    const annualDepreciation = prop.depreciation_enabled !== false && purchasePrice > 0
      ? purchasePrice * 0.025 * ownerShare
      : 0;

    // Taxable rental result
    const taxableRentalResult = annualRentalIncome - annualInterest - annualDeductibleExpenses - annualDepreciation;
    const isNegativelyGeared = taxableRentalResult < 0;

    // Tax benefit: marginal rate on the loss, calculated at combined income bracket
    // The rental loss offsets salary income → refund = loss × marginalRate
    const effectiveIncome = salaryForBracket + Math.max(0, taxableRentalResult); // add profit if positive; 0 if loss (ATO offsets)
    const marginalRate = auMarginalRate(effectiveIncome);
    const annualTaxBenefit = isNegativelyGeared
      ? Math.abs(taxableRentalResult) * marginalRate
      : 0;

    // Actual monthly cash loss (before tax benefit) — uses full loan repayment (principal + interest)
    const fullMonthlyLoanRepayment = isIO
      ? loanAmount * (interestRate / 100) / 12
      : calcMonthlyRepayment(loanAmount, interestRate, loanTerm);
    const monthlyCashLoss = annualRentalIncome / 12
      - fullMonthlyLoanRepayment * ownerShare
      - annualDeductibleExpenses / 12;

    return {
      propertyId:               prop.id,
      propertyName:             prop.name || prop.address || `Property ${prop.id}`,
      annualRentalIncome:       Math.round(annualRentalIncome),
      annualInterest:           Math.round(annualInterest),
      annualDeductibleExpenses: Math.round(annualDeductibleExpenses),
      annualDepreciation:       Math.round(annualDepreciation),
      taxableRentalResult:      Math.round(taxableRentalResult),
      isNegativelyGeared,
      annualTaxBenefit:         Math.round(annualTaxBenefit),
      monthlyTaxBenefit:        Math.round(annualTaxBenefit / 12),
      monthlyCashLoss:          Math.round(monthlyCashLoss),
      netAfterTaxMonthlyCost:   Math.round(monthlyCashLoss + annualTaxBenefit / 12),
      ownershipShare:           ownerShare,
    };
  });

  const totalAnnualTaxBenefit        = analyses.reduce((s, a) => s + a.annualTaxBenefit, 0);
  const totalMonthlyCashLoss         = analyses.reduce((s, a) => s + a.monthlyCashLoss, 0);
  const totalNetAfterTaxMonthlyCost  = analyses.reduce((s, a) => s + a.netAfterTaxMonthlyCost, 0);
  const totalTaxableRentalResult     = analyses.reduce((s, a) => s + a.taxableRentalResult, 0);
  const marginalRate                 = auMarginalRate(salaryForBracket);

  return {
    properties: analyses,
    totalAnnualTaxBenefit,
    totalMonthlyCashLoss,
    totalNetAfterTaxMonthlyCost,
    totalTaxableRentalResult,
    marginalRate,
    refundMode: mode,
  };
}

// ─── Aggregate cash flow to annual totals ─────────────────────────────
export interface CashFlowYear {
  year: number;
  income: number;
  totalExpenses: number;
  rentalIncome: number;
  mortgageRepayment: number;
  investmentLoanRepayment: number;
  // NG fields
  ngTaxBenefit: number;     // NG refund received this year (Aug lump-sum or 0)
  ngBenefitSpread: number;  // NG benefit included via PAYG spread (monthly total)
  netCashFlow: number;
  endingBalance: number;
  hasActualMonths: number; // count of months with actual data
}

export function aggregateCashFlowToAnnual(monthly: CashFlowMonth[]): CashFlowYear[] {
  const byYear = new Map<number, CashFlowYear>();
  for (const m of monthly) {
    if (!byYear.has(m.year)) {
      byYear.set(m.year, {
        year: m.year,
        income: 0, totalExpenses: 0, rentalIncome: 0,
        mortgageRepayment: 0, investmentLoanRepayment: 0,
        ngTaxBenefit: 0, ngBenefitSpread: 0,
        netCashFlow: 0, endingBalance: 0, hasActualMonths: 0,
      });
    }
    const yr = byYear.get(m.year)!;
    yr.income += m.income;
    yr.totalExpenses += m.totalExpenses;
    yr.rentalIncome += m.rentalIncome;
    yr.mortgageRepayment += m.mortgageRepayment;
    yr.investmentLoanRepayment += m.investmentLoanRepayment;
    yr.ngTaxBenefit   += m.ngTaxBenefit ?? 0;
    yr.ngBenefitSpread += m.ngBenefitSpread ?? 0;
    yr.netCashFlow += m.netCashFlow;
    yr.endingBalance = m.cumulativeBalance; // last month of year
    if (m.isActual) yr.hasActualMonths++;
  }
  return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
}

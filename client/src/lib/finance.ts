// ─── Financial Calculation Engine ────────────────────────────────────

export const formatCurrency = (amount: number, compact = false): string => {
  if (compact && Math.abs(amount) >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (compact && Math.abs(amount) >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatPct = (value: number, decimals = 1) =>
  `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;

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
export interface YearlyProjection {
  year: number;
  startNetWorth: number;
  income: number;
  expenses: number;
  propertyValue: number;
  propertyLoans: number;
  propertyEquity: number;
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
}): YearlyProjection[] {
  const years = params.years || 10;
  const inflation = params.inflation || 3;
  const pporGrowth = params.ppor_growth || 6;
  const s = params.snapshot;

  const results: YearlyProjection[] = [];
  const currentYear = new Date().getFullYear();

  let ppor = s.ppor;
  let cash = s.cash;
  let superBal = s.super_balance;
  let stockVal = s.stocks;
  let cryptoVal = s.crypto;
  let mortgage = s.mortgage;
  let otherDebts = s.other_debts;
  let monthlyIncome = s.monthly_income;
  let monthlyExpenses = s.monthly_expenses;

  for (let y = 1; y <= years; y++) {
    const year = currentYear + y;
    const startNW = (ppor + cash + superBal + stockVal + cryptoVal + s.cars + s.iran_property) - (mortgage + otherDebts);

    // PPOR growth
    ppor *= (1 + pporGrowth / 100);
    // Mortgage reduction
    const monthlyPmt = calcMonthlyRepayment(s.mortgage, 6.5, 30);
    mortgage = Math.max(0, calcLoanBalance(s.mortgage, 6.5, 30, y * 12));

    // Super growth (10% pa)
    superBal *= 1.10;

    // Income/expense changes (inflation)
    monthlyIncome *= (1 + 3.5 / 100);
    monthlyExpenses *= (1 + inflation / 100);

    // Property portfolio
    let propValue = 0; let propLoans = 0; let propRent = 0;
    for (const prop of params.properties) {
      const proj = projectProperty(prop);
      const yr = proj[y - 1];
      if (yr) {
        propValue += yr.value;
        propLoans += yr.loanBalance;
        propRent += yr.rentalIncome;
      }
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

    // Annual surplus added to cash
    const annualSurplus = (monthlyIncome - monthlyExpenses) * 12;
    cash += annualSurplus * 0.5; // 50% saved

    // Calculate totals
    const totalAssets = ppor + cash + superBal + stocksTotal + cryptoTotal + s.cars * 0.8 + s.iran_property + propValue;
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

/**
 * cfoEngine.ts
 * Saturday Morning Financial Bulletin engine.
 *
 * Generates a structured weekly bulletin with 7 sections:
 *   1. Weekly Snapshot
 *   2. Top 3 Expenses
 *   3. Spending Insight
 *   4. Bills & Cashflow Ahead (7–14 days)
 *   5. Investment Update
 *   6. Risk / Opportunity Alert
 *   7. Best Move This Week
 *
 * Pure computation — no Telegram/email side effects.
 * Delivery handled by dispatchWeeklyCFO() in notifications.ts.
 */

import { safeNum } from './finance';
import { billActualOutflow } from './finance';

// ─── Supabase ─────────────────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://uoraduyyxhtzixcsaidg.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c';
const SB_HEADERS = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BulletinExpense {
  amount:      number;
  category:    string;
  description: string;
  member:      string;
  date:        string;
  flag:        'normal' | 'unusual' | 'high';
}

export interface BulletinBillAhead {
  bill_name:    string;
  due_date:     string;
  days_away:    number;
  amount:       number;
  frequency:    string;
}

export interface BulletinInvestment {
  stocks_value:    number;
  crypto_value:    number;
  portfolio_value: number;
  stocks_change:   number;   // vs prior report
  crypto_change:   number;   // vs prior report
  dca_scheduled:   string[]; // list of upcoming DCA labels
  planned_buys:    string[]; // planned investment purchases
}

export interface BulletinFireSnapshot {
  progress_pct:  number;
  fire_year:     number;
  years_away:    number;
  target_capital: number;
  investable:    number;
  on_track:      boolean;
}

export interface CFOReport {
  // Metadata
  week_date:    string;   // ISO date of the Saturday

  // Section 1 — Weekly Snapshot
  snapshot: {
    net_worth:       number;
    net_worth_delta: number;   // vs previous report
    cash:            number;
    offset_balance:  number;
    monthly_surplus: number;
    fire:            BulletinFireSnapshot;
  };

  // Section 2 — Top 3 Expenses
  top_expenses: BulletinExpense[];

  // Section 3 — Spending Insight
  spending_insight: string;

  // Section 4 — Bills & Cashflow Ahead
  bills_ahead: BulletinBillAhead[];
  cashflow_next14: number;   // net cash impact: income_expected - bills_due

  // Section 5 — Investment Update
  investment: BulletinInvestment;

  // Section 6 — Risk / Opportunity Alerts (1-2 items)
  alerts: string[];

  // Section 7 — Best Move
  best_move: string;

  // Scores (used in dashboard widget)
  wealth_score:    number;
  cashflow_score:  number;
  risk_score:      number;
  discipline_score: number;

  // Legacy flat fields for DB columns
  summary:         string;
  opportunities:   string[];
  networth:        number;
  networth_delta:  number;
  monthly_surplus: number;
  debt_total:      number;
  portfolio_value: number;
  fire_year:       number;
  fire_progress:   number;
}

export interface CFOSettings {
  id:               string;
  enabled:          boolean;
  telegram_enabled: boolean;
  email_enabled:    boolean;
  email_address:    string;
  delivery_day:     string;
  delivery_time:    string;
  tone:             'Conservative' | 'Balanced' | 'Aggressive';
  last_run_at:      string | null;
}

// ─── Settings CRUD ───────────────────────────────────────────────────────────

export async function getCFOSettings(): Promise<CFOSettings> {
  const DEFAULT: CFOSettings = {
    id: 'shahrokh-family-main',
    enabled: true,
    telegram_enabled: true,
    email_enabled: false,
    email_address: '',
    delivery_day: 'Saturday',
    delivery_time: '08:00',
    tone: 'Balanced',
    last_run_at: null,
  };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/sf_cfo_settings?id=eq.shahrokh-family-main`,
      { headers: SB_HEADERS }
    );
    if (!res.ok) return DEFAULT;
    const rows = await res.json();
    return rows?.[0] ? { ...DEFAULT, ...rows[0] } : DEFAULT;
  } catch { return DEFAULT; }
}

export async function saveCFOSettings(s: Partial<CFOSettings>): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/sf_cfo_settings`, {
    method: 'POST',
    headers: { ...SB_HEADERS, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ id: 'shahrokh-family-main', ...s, updated_at: new Date().toISOString() }),
  });
}

// ─── Report history ───────────────────────────────────────────────────────────

export async function getCFOReports(limit = 12): Promise<any[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/sf_cfo_reports?order=week_date.desc&limit=${limit}`,
      { headers: SB_HEADERS }
    );
    if (!res.ok) return [];
    return (await res.json()) ?? [];
  } catch { return []; }
}

export async function saveCFOReport(report: CFOReport, telegramSent: boolean): Promise<void> {
  const row = {
    week_date:        report.week_date,
    summary:          report.summary,
    alerts:           report.alerts,
    opportunities:    report.opportunities,
    best_move:        report.best_move,
    wealth_score:     report.wealth_score,
    cashflow_score:   report.cashflow_score,
    risk_score:       report.risk_score,
    discipline_score: report.discipline_score,
    networth:         report.networth,
    networth_delta:   report.networth_delta,
    cash:             report.snapshot.cash,
    monthly_surplus:  report.monthly_surplus,
    debt_total:       report.debt_total,
    portfolio_value:  report.portfolio_value,
    fire_year:        report.fire_year,
    fire_progress:    report.fire_progress,
    telegram_sent:    telegramSent,
    // Full bulletin stored in json_payload for in-app viewer
    report_json:      report,
  };
  await fetch(`${SUPABASE_URL}/rest/v1/sf_cfo_reports`, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(row),
  });
  await saveCFOSettings({ last_run_at: new Date().toISOString() });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function pct(n: number, dec = 1): string { return `${n.toFixed(dec)}%`; }
function scoreClamp(n: number): number { return Math.max(0, Math.min(100, Math.round(n))); }

function monthsToFIRE(current: number, monthlyAdd: number, monthlyRate: number, target: number): number {
  if (current >= target) return 0;
  if (monthlyAdd <= 0 && monthlyRate <= 0) return Infinity;
  let bal = current;
  for (let m = 0; m < 600; m++) {
    bal = bal * (1 + monthlyRate) + monthlyAdd;
    if (bal >= target) return m + 1;
  }
  return 600;
}

// ─── Expense category budget benchmarks (% of income) ────────────────────────
// Used to flag "unusual" expenses
const CATEGORY_MONTHLY_BENCH: Record<string, number> = {
  'Groceries':     1500,
  'Dining':        600,
  'Transport':     400,
  'Entertainment': 300,
  'Clothing':      400,
  'Health':        300,
  'Education':     500,
  'Utilities':     350,
  'Childcare':     2000,
  'Travel':        800,
  'Shopping':      500,
};

function flagExpense(exp: any, allExpenses: any[]): 'normal' | 'unusual' | 'high' {
  const category = exp.category || 'Other';
  const amount   = safeNum(exp.amount);
  // Flag as high if single transaction > $500
  if (amount > 500) return 'high';
  // Flag as unusual if > 2x category average transaction
  const catExps = allExpenses.filter((e: any) => e.category === category);
  if (catExps.length >= 3) {
    const avg = catExps.reduce((s: number, e: any) => s + safeNum(e.amount), 0) / catExps.length;
    if (amount > avg * 2.5) return 'unusual';
  }
  return 'normal';
}

// ─── Main bulletin generator ──────────────────────────────────────────────────

export async function generateCFOReport(
  tone: 'Conservative' | 'Balanced' | 'Aggressive' = 'Balanced'
): Promise<CFOReport> {

  // ── Fetch all data sources in parallel ──────────────────────────────────────
  const [
    snapRows, expRows, billRows, propRows,
    stockRows, cryptoRows, dcaStockRows, dcaCryptoRows,
    plannedRows, prevReportRows,
  ] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/sf_snapshot?id=eq.shahrokh-family-main`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/sf_expenses?order=date.desc&limit=200`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/sf_recurring_bills?active=eq.true`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/sf_properties`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/sf_stocks`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/sf_crypto`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/sf_stock_dca`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/sf_crypto_dca`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/sf_planned_investments`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/sf_cfo_reports?order=week_date.desc&limit=2`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
  ]);

  const snap       = snapRows?.[0] ?? {};
  const prevReport = prevReportRows?.[1];   // second-most-recent (before current)
  const allExp     = Array.isArray(expRows) ? expRows : [];
  const allBills   = Array.isArray(billRows) ? billRows : [];

  const now = new Date();
  // Saturday date for this bulletin
  const weekDate = (() => {
    const d = new Date(now);
    // If today is Saturday (day 6), use today; otherwise find the most recent Saturday
    const dayOfWeek = d.getDay(); // 0=Sun ... 6=Sat
    const daysBack = dayOfWeek === 6 ? 0 : (dayOfWeek + 1);
    d.setDate(d.getDate() - daysBack);
    return d.toISOString().split('T')[0];
  })();

  // ── 1. Core financial metrics ────────────────────────────────────────────────
  const ppor         = safeNum(snap.ppor);
  const cash         = safeNum(snap.cash);
  const offsetBal    = safeNum(snap.offset_balance);
  const superR       = safeNum(snap.roham_super_balance);
  const superF       = safeNum(snap.fara_super_balance);
  const superCombined = superR + superF;
  const cars         = safeNum(snap.cars);
  const iranProp     = safeNum(snap.iran_property);
  const otherAssets  = safeNum(snap.other_assets);
  const mortgage     = safeNum(snap.mortgage);
  const otherDebts   = safeNum(snap.other_debts);
  const monthlyIncome    = safeNum(snap.monthly_income) || 22000;
  const monthlyExpenses  = safeNum(snap.monthly_expenses) || 8000;
  const mortgageRate     = 0.0625;

  // Portfolio
  const stocksValue  = (stockRows ?? []).reduce((s: number, r: any) => s + safeNum(r.current_value ?? r.total_value), 0) || safeNum(snap.stocks);
  const cryptoValue  = (cryptoRows ?? []).reduce((s: number, r: any) => s + safeNum(r.current_value ?? r.total_value), 0) || safeNum(snap.crypto);
  const portfolioVal = stocksValue + cryptoValue;

  const propEquity   = (propRows ?? []).reduce((s: number, p: any) => s + safeNum(p.current_value) - safeNum(p.mortgage_balance), 0);
  const totalAssets  = ppor + cash + offsetBal + portfolioVal + superCombined + cars + iranProp + otherAssets + Math.max(0, propEquity);
  const totalDebt    = mortgage + otherDebts;
  const netWorth     = totalAssets - totalDebt;

  // Net worth delta vs previous bulletin
  const prevNW       = safeNum(prevReport?.networth);
  const nwDelta      = prevNW ? netWorth - prevNW : 0;

  // Monthly surplus
  const billsMonthly = allBills.reduce((s: number, b: any) => {
    const freq = (b.frequency || 'Monthly').trim();
    const amt  = safeNum(b.amount);
    if (freq === 'Weekly')      return s + amt * (52 / 12);
    if (freq === 'Fortnightly') return s + amt * (26 / 12);
    if (freq === 'Monthly')     return s + amt;
    if (freq === 'Quarterly')   return s + amt / 3;
    if (freq === 'Semi-Annual') return s + amt / 6;
    if (freq === 'Annual')      return s + amt / 12;
    return s + amt;
  }, 0);
  const monthlySurplus = monthlyIncome - monthlyExpenses - billsMonthly;

  // ── 2. FIRE ─────────────────────────────────────────────────────────────────
  const swr         = tone === 'Aggressive' ? 0.05 : tone === 'Conservative' ? 0.03 : 0.04;
  const annualExpT  = (monthlyExpenses + billsMonthly) * 12;
  const reqCapital  = annualExpT / swr;
  const investable  = portfolioVal + superCombined;
  const monthlyRate = (tone === 'Aggressive' ? 0.10 : tone === 'Conservative' ? 0.07 : 0.085) / 12;
  const monthlySav  = Math.max(0, monthlySurplus * 0.7);
  const months      = monthsToFIRE(investable, monthlySav, monthlyRate, reqCapital);
  const fireYear    = now.getFullYear() + Math.ceil(months / 12);
  const fireProgress = Math.min(100, (investable / reqCapital) * 100);
  const prevFireYear = prevReport?.fire_year;
  const fireOnTrack  = prevFireYear ? fireYear <= prevFireYear : true;

  const fireSnapshot: BulletinFireSnapshot = {
    progress_pct:   fireProgress,
    fire_year:      fireYear,
    years_away:     months / 12,
    target_capital: reqCapital,
    investable,
    on_track:       fireOnTrack,
  };

  // ── 3. Top 3 expenses this week ──────────────────────────────────────────────
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
  const weekExpenses = allExp.filter((e: any) => e.date >= sevenDaysAgo);
  const sorted       = [...weekExpenses].sort((a: any, b: any) => safeNum(b.amount) - safeNum(a.amount));
  const top3: BulletinExpense[] = sorted.slice(0, 3).map((e: any) => ({
    amount:      safeNum(e.amount),
    category:    e.category   || 'Other',
    description: e.description || e.subcategory || '',
    member:      e.member || e.family_member || 'Family',
    date:        e.date,
    flag:        flagExpense(e, allExp),
  }));

  // ── 4. Spending insight ──────────────────────────────────────────────────────
  let spendingInsight = '';
  // Category with biggest change vs 3-month average
  const cutoff7  = new Date(now.getTime() - 7 * 86400000);
  const cutoff90 = new Date(now.getTime() - 90 * 86400000);
  const last7Exp = allExp.filter((e: any) => new Date(e.date) >= cutoff7);
  const last90Exp = allExp.filter((e: any) => new Date(e.date) >= cutoff90);

  // Build weekly total per category
  const weekByCat: Record<string, number> = {};
  last7Exp.forEach((e: any) => {
    const cat = e.category || 'Other';
    weekByCat[cat] = (weekByCat[cat] || 0) + safeNum(e.amount);
  });

  // 3-month weekly average per category (90 days / 13 weeks)
  const avgWeekByCat: Record<string, number> = {};
  last90Exp.forEach((e: any) => {
    const cat = e.category || 'Other';
    avgWeekByCat[cat] = (avgWeekByCat[cat] || 0) + safeNum(e.amount);
  });
  Object.keys(avgWeekByCat).forEach(cat => { avgWeekByCat[cat] /= 13; });

  // Find category with biggest % deviation this week
  let biggestCat = '';
  let biggestPct = 0;
  for (const cat of Object.keys(weekByCat)) {
    const avg = avgWeekByCat[cat] || 0;
    if (avg > 0) {
      const change = ((weekByCat[cat] - avg) / avg) * 100;
      if (Math.abs(change) > Math.abs(biggestPct)) {
        biggestPct = change;
        biggestCat = cat;
      }
    }
  }

  // Find largest fixed cost
  const largestCat = Object.keys(weekByCat).sort((a, b) => weekByCat[b] - weekByCat[a])[0];

  if (biggestCat && Math.abs(biggestPct) >= 15) {
    const dir = biggestPct > 0 ? 'higher' : 'lower';
    spendingInsight = `${biggestCat} spending was ${Math.abs(biggestPct).toFixed(0)}% ${dir} than your 3-month weekly average.`;
  } else if (largestCat) {
    spendingInsight = `${largestCat} was your largest expense category this week.`;
  } else if (weekExpenses.length === 0) {
    spendingInsight = 'No expense records found for this week — add expenses to get spending insights.';
  } else {
    spendingInsight = 'Spending is on track with your 3-month average — no unusual patterns detected.';
  }

  // ── 5. Bills & cashflow ahead (7–14 days) ───────────────────────────────────
  const todayStr   = now.toISOString().split('T')[0];
  const in14Days   = new Date(now.getTime() + 14 * 86400000).toISOString().split('T')[0];
  const billsAhead: BulletinBillAhead[] = [];

  for (const bill of allBills) {
    if (!bill.next_due_date) continue;
    const daysAway = Math.round((new Date(bill.next_due_date).getTime() - now.getTime()) / 86400000);
    if (daysAway >= 0 && bill.next_due_date <= in14Days) {
      billsAhead.push({
        bill_name:  bill.bill_name || bill.name || 'Bill',
        due_date:   bill.next_due_date,
        days_away:  daysAway,
        amount:     safeNum(bill.amount),
        frequency:  bill.frequency || 'Monthly',
      });
    }
  }
  billsAhead.sort((a, b) => a.days_away - b.days_away);

  const billsDueTotal  = billsAhead.reduce((s, b) => s + b.amount, 0);
  // Estimate income in next 14 days (fortnightly pay assumption)
  const incomeExpected = monthlyIncome * (14 / 30);
  const cashflowNext14 = incomeExpected - billsDueTotal;

  // ── 6. Investment update ─────────────────────────────────────────────────────
  const prevStocks = safeNum(prevReport?.report_json?.investment?.stocks_value ?? prevReport?.portfolio_value);
  const prevCrypto = safeNum(prevReport?.report_json?.investment?.crypto_value);
  const stocksChange = prevStocks ? stocksValue - prevStocks : 0;
  const cryptoChange = prevCrypto ? cryptoValue - prevCrypto : 0;

  // Active DCA plans
  const dcaScheduled: string[] = [];
  for (const d of (dcaStockRows ?? [])) {
    if (d.active !== false) {
      const amt   = safeNum(d.monthly_amount || d.amount);
      const label = d.ticker || d.stock_name || d.name || 'Stock';
      if (amt > 0) dcaScheduled.push(`${label} — ${fmt(amt)}/mo`);
    }
  }
  for (const d of (dcaCryptoRows ?? [])) {
    if (d.active !== false) {
      const amt   = safeNum(d.monthly_amount || d.amount);
      const label = d.coin || d.crypto_name || d.name || 'Crypto';
      if (amt > 0) dcaScheduled.push(`${label} — ${fmt(amt)}/mo`);
    }
  }

  // Planned buys within next 30 days
  const in30Days = new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0];
  const plannedBuys: string[] = [];
  for (const p of (plannedRows ?? [])) {
    const target = p.target_date || p.planned_date || '';
    if (target && target <= in30Days && target >= todayStr) {
      const label = p.asset_name || p.name || p.ticker || 'Investment';
      const amt   = safeNum(p.amount || p.planned_amount);
      plannedBuys.push(`${label}${amt > 0 ? ` — ${fmt(amt)}` : ''}`);
    }
  }

  const investment: BulletinInvestment = {
    stocks_value:    stocksValue,
    crypto_value:    cryptoValue,
    portfolio_value: portfolioVal,
    stocks_change:   stocksChange,
    crypto_change:   cryptoChange,
    dca_scheduled:   dcaScheduled.slice(0, 4),
    planned_buys:    plannedBuys.slice(0, 3),
  };

  // ── 7. Risk / opportunity alerts (top 2) ────────────────────────────────────
  const allAlerts: string[] = [];

  // Cash buffer check
  const monthsCash = (monthlyExpenses + billsMonthly) > 0
    ? cash / (monthlyExpenses + billsMonthly)
    : 99;
  if (monthsCash < 1.5) {
    allAlerts.push(`⚠️ Cash buffer critical — ${fmt(cash)} covers only ${monthsCash.toFixed(1)} months of expenses`);
  } else if (monthsCash < 3) {
    allAlerts.push(`Cash buffer is thin at ${monthsCash.toFixed(1)} months — target is 3 months minimum`);
  }

  // Idle cash in offset opportunity
  const idleCash = cash - (monthlyExpenses * 3);
  if (idleCash > 20000) {
    const saving = idleCash * mortgageRate;
    allAlerts.push(`💡 ${fmt(idleCash)} idle in cash — moving to offset saves ~${fmt(saving)}/year in mortgage interest`);
  }

  // Spending spike
  const cut30 = new Date(now.getTime() - 30 * 86400000);
  const cut60 = new Date(now.getTime() - 60 * 86400000);
  const last30  = allExp.filter((e: any) => new Date(e.date) >= cut30).reduce((s: number, e: any) => s + safeNum(e.amount), 0);
  const prior30 = allExp.filter((e: any) => new Date(e.date) >= cut60 && new Date(e.date) < cut30).reduce((s: number, e: any) => s + safeNum(e.amount), 0);
  const spendSpike = prior30 > 0 ? ((last30 - prior30) / prior30) * 100 : 0;
  if (spendSpike > 20) {
    allAlerts.push(`⚠️ Spending up ${spendSpike.toFixed(0)}% vs prior 30 days — review recent large purchases`);
  }

  // Debt risk
  const dta = totalAssets > 0 ? totalDebt / totalAssets : 0;
  if (dta > 0.45) {
    allAlerts.push(`Debt-to-assets ratio is ${pct(dta * 100, 0)} — elevated leverage; consider accelerating principal payments`);
  }

  // Negative cashflow
  if (monthlySurplus < 0) {
    allAlerts.push(`🔴 Monthly cashflow negative — outflows exceed income by ${fmt(Math.abs(monthlySurplus))}`);
  }

  // Super reminder (end of financial year = June)
  const month = now.getMonth(); // 0-indexed
  if (month === 4 || month === 5) {  // May or June
    allAlerts.push(`🗓️ Financial year ends 30 June — check concessional super contributions limit before deadline`);
  }

  // FIRE slipped
  if (!fireOnTrack && prevFireYear) {
    allAlerts.push(`FIRE target slipped from ${prevFireYear} → ${fireYear} — review investment contributions`);
  }

  // Portfolio crypto concentration
  const cryptoPct = portfolioVal > 0 ? (cryptoValue / portfolioVal) * 100 : 0;
  if (cryptoPct > 40) {
    allAlerts.push(`Crypto is ${cryptoPct.toFixed(0)}% of portfolio — above recommended 30% cap; consider rebalancing`);
  }

  // Net worth drop
  if (nwDelta < -5000) {
    allAlerts.push(`Net worth dropped ${fmt(Math.abs(nwDelta))} vs last bulletin — check for large debt or asset change`);
  }

  // Return top 2 most urgent alerts
  const finalAlerts = allAlerts.slice(0, 2);

  // ── 8. Opportunities ────────────────────────────────────────────────────────
  const opportunities: string[] = [];
  if (idleCash > 20000) {
    opportunities.push(`Move ${fmt(Math.round(idleCash / 5000) * 5000)} to mortgage offset — guaranteed ${pct(mortgageRate * 100, 2)} return`);
  }
  if (monthlySurplus > 2000) {
    opportunities.push(`Deploy extra ${fmt(Math.round(monthlySurplus * 0.4))} surplus into ETF DCA`);
  }
  if (superCombined < 200000 && monthlyIncome > 15000) {
    opportunities.push('Consider salary sacrifice into super — reduce taxable income now');
  }
  if (propRows?.some((p: any) => safeNum(p.loan_balance) > 0 && safeNum(p.weekly_rent) > 0)) {
    opportunities.push('Negative gearing benefit available — confirm claimed in tax return');
  }

  // ── 9. Best move ─────────────────────────────────────────────────────────────
  let bestMove: string;
  if (monthlySurplus < 0) {
    bestMove = `Reduce monthly outflows by at least ${fmt(Math.abs(monthlySurplus))} — cashflow is currently negative`;
  } else if (monthsCash < 2) {
    bestMove = `Build cash buffer to at least ${fmt(monthlyExpenses * 3)} before any new investments`;
  } else if (idleCash > 30000) {
    bestMove = `Move ${fmt(Math.round(idleCash / 10000) * 10000)} from everyday account into mortgage offset — saves ${fmt(idleCash * mortgageRate)} interest this year`;
  } else if (monthlySurplus > 1500 && dcaScheduled.length === 0) {
    bestMove = `Set up a ${fmt(Math.round(monthlySurplus * 0.4))}/month automated ETF DCA — put your surplus to work`;
  } else if (opportunities.length > 0) {
    bestMove = opportunities[0];
  } else {
    bestMove = 'Review recurring bills — find one subscription to cancel or renegotiate';
  }

  // ── 10. Scores ───────────────────────────────────────────────────────────────
  let wealthScore    = 50;
  let cashflowScore  = 50;
  let riskScore      = 70;
  let disciplineScore = 60;

  if (nwDelta > 0)       wealthScore += 15;
  if (nwDelta > 10000)   wealthScore += 10;
  if (fireProgress > 30) wealthScore += 10;
  if (fireProgress > 60) wealthScore += 10;
  if (portfolioVal > 50000) wealthScore += 5;

  const surplusRatio = monthlyIncome > 0 ? monthlySurplus / monthlyIncome : 0;
  if (surplusRatio > 0.30) cashflowScore += 20;
  else if (surplusRatio > 0.15) cashflowScore += 10;
  else if (surplusRatio < 0)    cashflowScore -= 20;
  if (spendSpike > 20)  cashflowScore -= 15;
  if (spendSpike < 0)   cashflowScore += 10;
  if (monthsCash >= 3)  cashflowScore += 10;
  else if (monthsCash < 1) cashflowScore -= 15;

  if (dta > 0.5) riskScore -= 20;
  else if (dta > 0.3) riskScore -= 10;
  if (cryptoPct > 40) riskScore -= 15;
  else if (cryptoPct > 25) riskScore -= 8;
  if (monthsCash < 3) riskScore -= 10;
  if (offsetBal > 50000) riskScore += 10;

  if (surplusRatio > 0.20) disciplineScore += 15;
  if (monthlySav > 1000)   disciplineScore += 10;
  if (spendSpike < 5)      disciplineScore += 15;
  if (spendSpike > 15)     disciplineScore -= 20;

  // ── 11. Executive summary line ───────────────────────────────────────────────
  const nwLine    = nwDelta !== 0
    ? `Net worth ${nwDelta >= 0 ? `up ${fmt(nwDelta)}` : `down ${fmt(Math.abs(nwDelta))}`} this week.`
    : `Net worth: ${fmt(netWorth)}.`;
  const cashLine  = monthsCash >= 3 ? 'Cash buffer healthy.' : `Cash buffer: ${monthsCash.toFixed(1)} months.`;
  const spendLine = spendSpike > 15 ? `Spending up ${spendSpike.toFixed(0)}%.` : 'Spending on track.';
  const fireLine  = `FIRE ${fireProgress.toFixed(0)}% — target ${fireYear}.`;
  const summary   = `${nwLine} ${cashLine} ${spendLine} ${fireLine} Best move: ${bestMove.split('—')[0].trim()}.`;

  return {
    week_date: weekDate,

    snapshot: {
      net_worth:       netWorth,
      net_worth_delta: nwDelta,
      cash,
      offset_balance:  offsetBal,
      monthly_surplus: monthlySurplus,
      fire:            fireSnapshot,
    },

    top_expenses:     top3,
    spending_insight: spendingInsight,
    bills_ahead:      billsAhead,
    cashflow_next14:  cashflowNext14,
    investment,
    alerts:           finalAlerts,
    best_move:        bestMove,

    wealth_score:     scoreClamp(wealthScore),
    cashflow_score:   scoreClamp(cashflowScore),
    risk_score:       scoreClamp(riskScore),
    discipline_score: scoreClamp(disciplineScore),

    // Legacy flat fields
    summary,
    opportunities,
    networth:         netWorth,
    networth_delta:   nwDelta,
    monthly_surplus:  monthlySurplus,
    debt_total:       totalDebt,
    portfolio_value:  portfolioVal,
    fire_year:        fireYear,
    fire_progress:    fireProgress,
  };
}

// ─── Telegram formatter (compact + emojis) ───────────────────────────────────

export function formatCFOTelegram(report: CFOReport): string {
  const { snapshot, top_expenses, spending_insight, bills_ahead, investment, alerts, best_move } = report;
  const f  = fmt;
  const s  = snapshot;
  const nwSign   = s.net_worth_delta >= 0 ? '+' : '';
  const surplus  = s.monthly_surplus;
  const fireEmoji = s.fire.on_track ? '🔥' : '⚠️';
  const overallScore = Math.round(
    (report.wealth_score + report.cashflow_score + report.risk_score + report.discipline_score) / 4
  );
  const scoreEmoji = overallScore >= 75 ? '🟢' : overallScore >= 55 ? '🟡' : '🔴';

  let msg = `🏦 <b>Saturday Morning Bulletin</b>\n`;
  msg += `<i>Week of ${report.week_date}</i>\n\n`;

  // Section 1 — Snapshot
  msg += `📊 <b>Weekly Snapshot</b>\n`;
  msg += `Net Worth: <b>${f(s.net_worth)}</b> (${nwSign}${f(s.net_worth_delta)})\n`;
  msg += `Cash: ${f(s.cash)} | Surplus: ${f(surplus)}/mo\n`;
  msg += `${fireEmoji} FIRE: ${s.fire.progress_pct.toFixed(0)}% — target ${s.fire.fire_year}\n\n`;

  // Section 2 — Top expenses
  if (top_expenses.length > 0) {
    msg += `💸 <b>Top Expenses This Week</b>\n`;
    top_expenses.forEach((e, i) => {
      const flagIcon = e.flag === 'unusual' ? ' ⚠️' : e.flag === 'high' ? ' ❗' : '';
      msg += `${i + 1}. <b>${f(e.amount)}</b> — ${e.category}${e.description ? ` (${e.description})` : ''} [${e.member}]${flagIcon}\n`;
    });
    msg += `\n`;
  } else {
    msg += `💸 <b>Top Expenses</b>\nNo expenses recorded this week.\n\n`;
  }

  // Section 3 — Spending insight
  msg += `💡 <b>Spending Insight</b>\n${spending_insight}\n\n`;

  // Section 4 — Bills ahead
  if (bills_ahead.length > 0) {
    msg += `📅 <b>Bills Coming Up (14 days)</b>\n`;
    bills_ahead.slice(0, 4).forEach(b => {
      msg += `• ${b.bill_name}: ${f(b.amount)} in ${b.days_away}d (${b.due_date})\n`;
    });
    msg += `\n`;
  }

  // Section 5 — Investment
  const sChange = investment.stocks_change;
  const cChange = investment.crypto_change;
  msg += `📈 <b>Investment Update</b>\n`;
  msg += `Stocks: ${f(investment.stocks_value)}${sChange !== 0 ? ` (${sChange >= 0 ? '+' : ''}${f(sChange)})` : ''}\n`;
  msg += `Crypto: ${f(investment.crypto_value)}${cChange !== 0 ? ` (${cChange >= 0 ? '+' : ''}${f(cChange)})` : ''}\n`;
  if (investment.dca_scheduled.length > 0) {
    msg += `DCA active: ${investment.dca_scheduled.slice(0, 2).join(', ')}\n`;
  }
  if (investment.planned_buys.length > 0) {
    msg += `Planned: ${investment.planned_buys.join(', ')}\n`;
  }
  msg += `\n`;

  // Section 6 — Alerts
  if (alerts.length > 0) {
    msg += `🚨 <b>Risk / Opportunity</b>\n`;
    alerts.forEach(a => { msg += `${a}\n`; });
    msg += `\n`;
  }

  // Section 7 — Best move
  msg += `🎯 <b>Best Move This Week</b>\n`;
  msg += `${best_move}\n\n`;

  // Score footer
  msg += `${scoreEmoji} Score: ${overallScore}/100 | Wealth ${report.wealth_score} | Cash ${report.cashflow_score} | Risk ${report.risk_score} | Discipline ${report.discipline_score}\n`;
  msg += `\n👉 <a href="https://familywealthlab.net">Open full bulletin</a>`;

  return msg;
}

// ─── Email formatter (branded HTML) ──────────────────────────────────────────

export function formatCFOEmail(report: CFOReport): { subject: string; html: string } {
  const { snapshot: s, top_expenses, spending_insight, bills_ahead, investment, alerts, best_move } = report;
  const f   = fmt;
  const nwUp = s.net_worth_delta >= 0;

  const subject = `🏦 Your Saturday Morning Financial Bulletin — ${report.week_date}`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Saturday Morning Bulletin</title>
</head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0;">
<div style="max-width:600px;margin:0 auto;padding:20px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#0ea5e9,#6366f1);border-radius:16px;padding:28px 24px;margin-bottom:20px;text-align:center;">
    <div style="font-size:28px;margin-bottom:4px;">🏦</div>
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">Saturday Morning Bulletin</h1>
    <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Family Wealth Lab · Week of ${report.week_date}</p>
  </div>

  <!-- Section 1: Snapshot -->
  <div style="background:#161b22;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #21262d;">
    <h2 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#58a6ff;">📊 Weekly Snapshot</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      <div style="background:#0d1117;border-radius:8px;padding:12px;border:1px solid #21262d;">
        <div style="font-size:11px;color:#8b949e;margin-bottom:4px;">NET WORTH</div>
        <div style="font-size:20px;font-weight:700;color:#fff;">${f(s.net_worth)}</div>
        <div style="font-size:12px;color:${nwUp ? '#3fb950' : '#f85149'};">${nwUp ? '▲' : '▼'} ${f(Math.abs(s.net_worth_delta))} vs last week</div>
      </div>
      <div style="background:#0d1117;border-radius:8px;padding:12px;border:1px solid #21262d;">
        <div style="font-size:11px;color:#8b949e;margin-bottom:4px;">CASH BALANCE</div>
        <div style="font-size:20px;font-weight:700;color:#fff;">${f(s.cash)}</div>
        <div style="font-size:12px;color:#8b949e;">Offset: ${f(s.offset_balance)}</div>
      </div>
      <div style="background:#0d1117;border-radius:8px;padding:12px;border:1px solid #21262d;">
        <div style="font-size:11px;color:#8b949e;margin-bottom:4px;">MONTHLY SURPLUS</div>
        <div style="font-size:20px;font-weight:700;color:${s.monthly_surplus >= 0 ? '#3fb950' : '#f85149'};">${f(s.monthly_surplus)}</div>
      </div>
      <div style="background:#0d1117;border-radius:8px;padding:12px;border:1px solid #21262d;">
        <div style="font-size:11px;color:#8b949e;margin-bottom:4px;">FIRE PROGRESS</div>
        <div style="font-size:20px;font-weight:700;color:#f0883e;">${s.fire.progress_pct.toFixed(0)}%</div>
        <div style="font-size:12px;color:#8b949e;">Target: ${s.fire.fire_year}</div>
      </div>
    </div>
  </div>

  <!-- Section 2: Top Expenses -->
  <div style="background:#161b22;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #21262d;">
    <h2 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#58a6ff;">💸 Top 3 Expenses This Week</h2>
    ${top_expenses.length === 0
      ? '<p style="color:#8b949e;font-size:13px;margin:0;">No expenses recorded this week.</p>'
      : top_expenses.map((e, i) => `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:10px 0;border-bottom:1px solid #21262d${i === top_expenses.length - 1 ? ';border-bottom:none' : ''};">
      <div>
        <div style="font-size:14px;font-weight:600;color:#e2e8f0;">${e.category}${e.description ? ` — ${e.description}` : ''}</div>
        <div style="font-size:12px;color:#8b949e;margin-top:2px;">${e.member} · ${e.date}${e.flag !== 'normal' ? ` · <span style="color:#f0883e;">${e.flag === 'unusual' ? '⚠️ Unusual' : '❗ High'}</span>` : ''}</div>
      </div>
      <div style="font-size:16px;font-weight:700;color:#f85149;white-space:nowrap;">${f(e.amount)}</div>
    </div>`).join('')}
  </div>

  <!-- Section 3: Spending Insight -->
  <div style="background:#161b22;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #21262d;">
    <h2 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#58a6ff;">💡 Spending Insight</h2>
    <p style="margin:0;font-size:14px;color:#e2e8f0;line-height:1.6;">${spending_insight}</p>
  </div>

  <!-- Section 4: Bills Ahead -->
  ${bills_ahead.length > 0 ? `
  <div style="background:#161b22;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #21262d;">
    <h2 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#58a6ff;">📅 Bills & Cashflow Ahead</h2>
    ${bills_ahead.slice(0, 5).map(b => `
    <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #21262d;">
      <div>
        <div style="font-size:13px;font-weight:500;color:#e2e8f0;">${b.bill_name}</div>
        <div style="font-size:12px;color:#8b949e;">${b.due_date} · ${b.days_away === 0 ? 'Due today' : `in ${b.days_away} days`}</div>
      </div>
      <div style="font-size:14px;font-weight:600;color:#f0883e;">${f(b.amount)}</div>
    </div>`).join('')}
  </div>` : ''}

  <!-- Section 5: Investment Update -->
  <div style="background:#161b22;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #21262d;">
    <h2 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#58a6ff;">📈 Investment Update</h2>
    <div style="display:flex;gap:12px;margin-bottom:12px;">
      <div style="flex:1;background:#0d1117;border-radius:8px;padding:12px;border:1px solid #21262d;">
        <div style="font-size:11px;color:#8b949e;">STOCKS</div>
        <div style="font-size:18px;font-weight:700;color:#e2e8f0;">${f(investment.stocks_value)}</div>
        ${investment.stocks_change !== 0 ? `<div style="font-size:12px;color:${investment.stocks_change >= 0 ? '#3fb950' : '#f85149'};">${investment.stocks_change >= 0 ? '▲' : '▼'} ${f(Math.abs(investment.stocks_change))}</div>` : ''}
      </div>
      <div style="flex:1;background:#0d1117;border-radius:8px;padding:12px;border:1px solid #21262d;">
        <div style="font-size:11px;color:#8b949e;">CRYPTO</div>
        <div style="font-size:18px;font-weight:700;color:#e2e8f0;">${f(investment.crypto_value)}</div>
        ${investment.crypto_change !== 0 ? `<div style="font-size:12px;color:${investment.crypto_change >= 0 ? '#3fb950' : '#f85149'};">${investment.crypto_change >= 0 ? '▲' : '▼'} ${f(Math.abs(investment.crypto_change))}</div>` : ''}
      </div>
    </div>
    ${investment.dca_scheduled.length > 0 ? `<div style="font-size:13px;color:#8b949e;">🔄 DCA active: ${investment.dca_scheduled.join(', ')}</div>` : ''}
    ${investment.planned_buys.length > 0 ? `<div style="font-size:13px;color:#8b949e;margin-top:6px;">📌 Planned: ${investment.planned_buys.join(', ')}</div>` : ''}
  </div>

  <!-- Section 6: Risk / Opportunity -->
  ${alerts.length > 0 ? `
  <div style="background:#161b22;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #21262d;">
    <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#58a6ff;">🚨 Risk & Opportunity</h2>
    ${alerts.map(a => `<div style="background:#0d1117;border-left:3px solid #f0883e;border-radius:0 8px 8px 0;padding:10px 12px;margin-bottom:8px;font-size:13px;color:#e2e8f0;line-height:1.5;">${a}</div>`).join('')}
  </div>` : ''}

  <!-- Section 7: Best Move -->
  <div style="background:linear-gradient(135deg,#0ea5e920,#6366f120);border:1px solid #0ea5e940;border-radius:12px;padding:20px;margin-bottom:20px;">
    <h2 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#0ea5e9;">🎯 Best Move This Week</h2>
    <p style="margin:0;font-size:15px;font-weight:500;color:#e2e8f0;line-height:1.6;">${best_move}</p>
  </div>

  <!-- CTA -->
  <div style="text-align:center;margin-bottom:20px;">
    <a href="https://familywealthlab.net" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">Open Family Wealth Lab →</a>
  </div>

  <!-- Footer -->
  <div style="text-align:center;font-size:11px;color:#484f58;">
    Family Wealth Lab · Automated Saturday Morning Bulletin<br>
    Manage delivery settings at <a href="https://familywealthlab.net/#/settings" style="color:#58a6ff;">familywealthlab.net/#/settings</a>
  </div>

</div>
</body>
</html>`;

  return { subject, html };
}

// ─── Dedup: has bulletin run this week? (6-day cooldown) ─────────────────────

export async function cfoAlreadyRanThisWeek(): Promise<boolean> {
  const settings = await getCFOSettings();
  if (!settings.last_run_at) return false;
  const lastRun = new Date(settings.last_run_at);
  const msSince = Date.now() - lastRun.getTime();
  return msSince < 6 * 24 * 60 * 60 * 1000;
}

// ─── Schedule check (Saturday 8:00 AM Brisbane time) ─────────────────────────

export function isCFOScheduleTime(deliveryDay: string, deliveryTime: string): boolean {
  const now      = new Date();
  const brisbane = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Brisbane' }));
  const day      = brisbane.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Australia/Brisbane' });
  const [targetH, targetM] = deliveryTime.split(':').map(Number);
  const nowMins    = brisbane.getHours() * 60 + brisbane.getMinutes();
  const targetMins = targetH * 60 + targetM;
  // Window: within 45 minutes after scheduled time
  return day === deliveryDay && nowMins >= targetMins && nowMins < targetMins + 45;
}

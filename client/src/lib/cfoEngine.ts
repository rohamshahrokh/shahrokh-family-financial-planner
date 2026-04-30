/**
 * cfoEngine.ts
 * AI Weekly CFO — Intelligent financial briefing engine.
 *
 * Aggregates all user data, computes scores, generates alerts,
 * opportunities, best move, and FIRE status. Pure computation — no side effects.
 * Delivery (Telegram, storage) handled by cfoDispatch() in notifications.ts.
 */

import { safeNum } from './finance';
import { billActualOutflow } from './finance';

// ─── Supabase constants ───────────────────────────────────────────────────────
const SUPABASE_URL  = 'https://uoraduyyxhtzixcsaidg.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c';
const SB_HEADERS = {
  apikey: SUPABASE_ANON,
  Authorization: `Bearer ${SUPABASE_ANON}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CFOReport {
  week_date:        string;   // ISO date of the Saturday
  summary:          string;
  kpis:             CFOKpis;
  alerts:           string[];
  opportunities:    string[];
  best_move:        string;
  wealth_score:     number;
  cashflow_score:   number;
  risk_score:       number;
  discipline_score: number;
  fire_section:     CFOFireSection;
  lookahead:        CFOLookahead[];
  networth:         number;
  networth_delta:   number;
  cash:             number;
  monthly_surplus:  number;
  debt_total:       number;
  portfolio_value:  number;
  fire_year:        number;
  fire_progress:    number;
}

export interface CFOKpis {
  net_worth:         number;
  weekly_change:     number;
  cash_available:    number;
  offset_balance:    number;
  offset_annual_saving: number;
  monthly_surplus:   number;
  debt_total:        number;
  mortgage_balance:  number;
  portfolio_value:   number;
  stocks_value:      number;
  crypto_value:      number;
  super_combined:    number;
  fire_progress_pct: number;
  fire_year:         number;
}

export interface CFOFireSection {
  target_capital:  number;
  current_investable: number;
  progress_pct:    number;
  fire_year:       number;
  semi_fire_year:  number;
  years_away:      number;
  on_track:        boolean;
  accelerator:     string;
}

export interface CFOLookahead {
  date: string;
  label: string;
  type: 'bill' | 'investment' | 'income' | 'tax';
  amount?: number;
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
  detail_level:     'Short' | 'Full';
  last_run_at:      string | null;
}

// ─── Settings loader ──────────────────────────────────────────────────────────

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
    detail_level: 'Full',
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
    week_date:       report.week_date,
    summary:         report.summary,
    alerts:          report.alerts,
    opportunities:   report.opportunities,
    best_move:       report.best_move,
    wealth_score:    report.wealth_score,
    cashflow_score:  report.cashflow_score,
    risk_score:      report.risk_score,
    discipline_score: report.discipline_score,
    networth:        report.networth,
    networth_delta:  report.networth_delta,
    cash:            report.cash,
    monthly_surplus: report.monthly_surplus,
    debt_total:      report.debt_total,
    portfolio_value: report.portfolio_value,
    fire_year:       report.fire_year,
    fire_progress:   report.fire_progress,
    telegram_sent:   telegramSent,
    json_payload:    { kpis: report.kpis, fire: report.fire_section, lookahead: report.lookahead },
  };
  await fetch(`${SUPABASE_URL}/rest/v1/sf_cfo_reports`, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(row),
  });
  // Update last_run_at in settings
  await saveCFOSettings({ last_run_at: new Date().toISOString() });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

function pct(n: number, dec = 1): string { return `${n.toFixed(dec)}%`; }

function monthsToFIRE(
  current: number,
  monthlyAdd: number,
  monthlyRate: number,
  target: number,
): number {
  if (current >= target) return 0;
  if (monthlyAdd <= 0 && monthlyRate <= 0) return Infinity;
  let bal = current;
  for (let m = 0; m < 600; m++) {
    bal = bal * (1 + monthlyRate) + monthlyAdd;
    if (bal >= target) return m + 1;
  }
  return 600;
}

function scoreClamp(n: number): number { return Math.max(0, Math.min(100, Math.round(n))); }

// ─── Main engine ──────────────────────────────────────────────────────────────

export async function generateCFOReport(tone: 'Conservative' | 'Balanced' | 'Aggressive' = 'Balanced'): Promise<CFOReport> {
  // ── 1. Fetch all data sources in parallel ──────────────────────────────────
  const [
    snapRows, expRows, billRows, propRows,
    stockRows, cryptoRows, incomeRows,
    prevReportRows,
  ] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/sf_snapshot?id=eq.shahrokh-family-main`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/sf_expenses?order=date.desc&limit=90`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/sf_recurring_bills?active=eq.true`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/sf_properties`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/sf_stocks`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/sf_crypto`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/sf_income?order=date.desc&limit=6`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
    fetch(`${SUPABASE_URL}/rest/v1/sf_cfo_reports?order=week_date.desc&limit=2`, { headers: SB_HEADERS }).then(r => r.json()).catch(() => []),
  ]);

  const snap = snapRows?.[0] ?? {};
  const prevReport = prevReportRows?.[1]; // second-most-recent (the one before this run)
  const now = new Date();
  const weekDate = (() => {
    // Find the most recent Saturday
    const d = new Date(now);
    d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
    return d.toISOString().split('T')[0];
  })();

  // ── 2. Core financial metrics ──────────────────────────────────────────────
  const ppor        = safeNum(snap.ppor);
  const cash        = safeNum(snap.cash);
  const offsetBal   = safeNum(snap.offset_balance);
  const superR      = safeNum(snap.roham_super_balance);
  const superF      = safeNum(snap.fara_super_balance);
  const superCombined = superR + superF;
  const cars        = safeNum(snap.cars);
  const iranProp    = safeNum(snap.iran_property);
  const otherAssets = safeNum(snap.other_assets);
  const mortgage    = safeNum(snap.mortgage);
  const otherDebts  = safeNum(snap.other_debts);
  const monthlyIncome = safeNum(snap.monthly_income) || 22000;
  const monthlyExpenses = safeNum(snap.monthly_expenses) || 8000;

  // Investment portfolio
  const stocksValue  = stockRows?.reduce((s: number, r: any) => s + safeNum(r.current_value ?? r.total_value), 0) ?? safeNum(snap.stocks);
  const cryptoValue  = cryptoRows?.reduce((s: number, r: any) => s + safeNum(r.current_value ?? r.total_value), 0) ?? safeNum(snap.crypto);
  const portfolioVal = stocksValue + cryptoValue;

  // Property equity
  const propEquity = propRows?.reduce((s: number, p: any) => s + safeNum(p.current_value) - safeNum(p.mortgage_balance), 0) ?? 0;
  const totalAssets = ppor + cash + offsetBal + portfolioVal + superCombined + cars + iranProp + otherAssets + (propEquity > 0 ? propEquity : 0);
  const totalDebt   = mortgage + otherDebts;
  const netWorth    = totalAssets - totalDebt;
  const prevNW      = safeNum(prevReport?.networth);
  const nwDelta     = prevNW ? netWorth - prevNW : 0;

  // Cashflow
  const billsMonthly = (billRows ?? []).reduce((s: number, b: any) => {
    if (!b.active && b.is_active !== true) return s;
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

  // Offset benefit (annual interest saving)
  const mortgageRate = 0.0625; // 6.25% typical Aus variable
  const offsetAnnualSaving = offsetBal * mortgageRate;

  // Expenses trend (last 30 vs prior 30 days)
  const cutoff30 = new Date(now.getTime() - 30 * 86400000);
  const cutoff60 = new Date(now.getTime() - 60 * 86400000);
  const last30  = (expRows ?? []).filter((e: any) => new Date(e.date) >= cutoff30).reduce((s: number, e: any) => s + safeNum(e.amount), 0);
  const prior30 = (expRows ?? []).filter((e: any) => new Date(e.date) >= cutoff60 && new Date(e.date) < cutoff30).reduce((s: number, e: any) => s + safeNum(e.amount), 0);
  const expenseSpike = prior30 > 0 ? ((last30 - prior30) / prior30) * 100 : 0;

  // ── 3. FIRE calculation ────────────────────────────────────────────────────
  const swr          = tone === 'Aggressive' ? 0.05 : tone === 'Conservative' ? 0.03 : 0.04;
  const annualExpTarget = (monthlyExpenses + billsMonthly) * 12;
  const reqCapital   = annualExpTarget / swr;
  const investable   = portfolioVal + superCombined;
  const monthlyRate  = (tone === 'Aggressive' ? 0.10 : tone === 'Conservative' ? 0.07 : 0.085) / 12;
  const monthlySaving = Math.max(0, monthlySurplus * 0.7);
  const months       = monthsToFIRE(investable, monthlySaving, monthlyRate, reqCapital);
  const fireYear     = now.getFullYear() + Math.ceil(months / 12);
  const semiMonths   = monthsToFIRE(investable, monthlySaving, monthlyRate, reqCapital * 0.5);
  const semiFIREYear = now.getFullYear() + Math.ceil(semiMonths / 12);
  const fireProgress = Math.min(100, (investable / reqCapital) * 100);
  const prevFireYear = prevReport?.fire_year;
  const fireOnTrack  = prevFireYear ? fireYear <= prevFireYear : true;

  // ── 4. Scoring ─────────────────────────────────────────────────────────────
  // Wealth score: NW growth + portfolio size + FIRE progress
  let wealthScore = 50;
  if (nwDelta > 0)       wealthScore += 15;
  if (nwDelta > 10000)   wealthScore += 10;
  if (fireProgress > 30) wealthScore += 10;
  if (fireProgress > 60) wealthScore += 10;
  if (portfolioVal > 50000) wealthScore += 5;

  // Cashflow score: surplus, expense control
  let cashflowScore = 50;
  const surplusRatio = monthlyIncome > 0 ? monthlySurplus / monthlyIncome : 0;
  if (surplusRatio > 0.30) cashflowScore += 20;
  else if (surplusRatio > 0.15) cashflowScore += 10;
  else if (surplusRatio < 0) cashflowScore -= 20;
  if (expenseSpike > 20) cashflowScore -= 15;
  if (expenseSpike < 0)  cashflowScore += 10;
  if (cash > monthlyExpenses * 3) cashflowScore += 10;
  else if (cash < monthlyExpenses) cashflowScore -= 15;

  // Risk score: debt-to-assets, crypto allocation, cash buffer
  let riskScore = 70;
  const dta = totalAssets > 0 ? totalDebt / totalAssets : 0;
  if (dta > 0.5) riskScore -= 20;
  else if (dta > 0.3) riskScore -= 10;
  const cryptoPct = portfolioVal > 0 ? (cryptoValue / portfolioVal) * 100 : 0;
  if (cryptoPct > 40) riskScore -= 15;
  else if (cryptoPct > 25) riskScore -= 8;
  if (cash < monthlyExpenses * 3) riskScore -= 10;
  if (offsetBal > 50000) riskScore += 10;

  // Discipline score: DCA active, surplus positive, bills up to date
  let disciplineScore = 60;
  if (surplusRatio > 0.20) disciplineScore += 15;
  if (monthlySaving > 1000) disciplineScore += 10;
  if (expenseSpike < 5)    disciplineScore += 15;
  if (expenseSpike > 15)   disciplineScore -= 20;

  // ── 5. Alerts ──────────────────────────────────────────────────────────────
  const alerts: string[] = [];

  if (expenseSpike > 20)
    alerts.push(`Expenses up ${pct(expenseSpike, 0)} vs prior 30 days — spending spike detected`);
  if (cash < monthlyExpenses * 2)
    alerts.push(`Cash buffer low — ${fmt(cash)} covers only ${(cash / (monthlyExpenses + billsMonthly)).toFixed(1)} months`);
  if (cryptoPct > 35)
    alerts.push(`Crypto is ${pct(cryptoPct, 0)} of investment portfolio — above recommended 20-30% cap`);
  if (monthlySurplus < 0)
    alerts.push(`Monthly cashflow NEGATIVE — outflows exceed income by ${fmt(Math.abs(monthlySurplus))}`);
  if (dta > 0.4)
    alerts.push(`Debt-to-assets at ${pct(dta * 100, 0)} — elevated leverage risk`);
  if (!fireOnTrack && prevFireYear)
    alerts.push(`FIRE year slipped from ${prevFireYear} to ${fireYear} — trajectory worsening`);
  if (nwDelta < -5000)
    alerts.push(`Net worth declined ${fmt(Math.abs(nwDelta))} this week — investigate cause`);

  // Upcoming bills in next 30 days
  const soon: string[] = [];
  const today = new Date();
  for (const bill of (billRows ?? [])) {
    if (!bill.next_due_date) continue;
    const due = new Date(bill.next_due_date);
    const daysOut = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (daysOut >= 0 && daysOut <= 30) {
      soon.push(`${bill.bill_name} (${fmt(safeNum(bill.amount))}) due in ${daysOut} days`);
    }
  }
  if (soon.length > 0) alerts.push(`Upcoming bills: ${soon.slice(0, 3).join('; ')}`);

  // ── 6. Opportunities ──────────────────────────────────────────────────────
  const opportunities: string[] = [];

  // Offset opportunity
  const idleCash = cash - (monthlyExpenses * 3); // keep 3 months buffer
  if (idleCash > 20000) {
    const saving = idleCash * mortgageRate;
    opportunities.push(`Move ${fmt(idleCash)} idle cash to offset — saves ~${fmt(saving)}/year in interest (guaranteed ${pct(mortgageRate * 100, 2)} return)`);
  }
  // Investment opportunity
  if (monthlySurplus > 2000 && monthlySaving < monthlySurplus * 0.5) {
    const extra = monthlySurplus * 0.4;
    const extraYears = months - monthsToFIRE(investable, monthlySaving + extra, monthlyRate, reqCapital);
    if (extraYears > 0)
      opportunities.push(`Deploy extra ${fmt(extra)}/month into ETFs — pulls FIRE forward by ~${Math.round(extraYears / 12)} year(s)`);
  }
  // Debt payoff vs investing
  if (otherDebts > 0) {
    const debtRate = 0.08; // assume 8% avg
    const invReturn = monthlyRate * 12;
    if (debtRate > invReturn)
      opportunities.push(`Other debts at ~${pct(debtRate * 100, 0)} cost — higher than expected investment returns. Prioritise payoff.`);
  }
  // Super optimisation
  if (superCombined < 200000 && monthlyIncome > 15000) {
    opportunities.push('Salary sacrifice into super — concessional contributions taxed at 15% vs marginal rate (possible 30%+ saving)');
  }
  // Tax offset
  if (propRows?.some((p: any) => safeNum(p.loan_balance) > 0 && safeNum(p.weekly_rent) > 0)) {
    opportunities.push('Investment property negative gearing benefit available — ensure claimed in next tax return');
  }

  // ── 7. Best move ───────────────────────────────────────────────────────────
  let bestMove: string;
  if (monthlySurplus < 0) {
    bestMove = `Reduce monthly expenses by at least ${fmt(Math.abs(monthlySurplus))} — cashflow is negative`;
  } else if (idleCash > 30000) {
    bestMove = `Move ${fmt(Math.round(idleCash / 10000) * 10000)} to mortgage offset — guaranteed ${pct(mortgageRate * 100, 2)} return`;
  } else if (opportunities.length > 0) {
    bestMove = opportunities[0].split(' — ')[0];
  } else if (monthlySurplus > 1500) {
    bestMove = `Automate ${fmt(Math.round(monthlySurplus * 0.4))} monthly DCA into diversified ETFs`;
  } else {
    bestMove = 'Review recurring bills — identify subscriptions to cancel';
  }

  // ── 8. FIRE section ────────────────────────────────────────────────────────
  const accelerator = monthlySaving > 0
    ? `Each extra ${fmt(1000)}/month invested accelerates FIRE by ~${Math.max(1, Math.round(12000 / (reqCapital - investable) * months / 12))} months`
    : 'Start investing monthly to activate FIRE calculator';

  const fireSection: CFOFireSection = {
    target_capital:    reqCapital,
    current_investable: investable,
    progress_pct:      fireProgress,
    fire_year:         fireYear,
    semi_fire_year:    semiFIREYear,
    years_away:        months / 12,
    on_track:          fireOnTrack,
    accelerator,
  };

  // ── 9. 30-day lookahead ────────────────────────────────────────────────────
  const lookahead: CFOLookahead[] = [];
  for (const bill of (billRows ?? [])) {
    if (!bill.next_due_date) continue;
    const due = new Date(bill.next_due_date);
    const daysOut = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (daysOut >= 0 && daysOut <= 30) {
      lookahead.push({
        date:   bill.next_due_date,
        label:  bill.bill_name,
        type:   'bill',
        amount: safeNum(bill.amount),
      });
    }
  }
  // Income expected (from recurring salary patterns)
  const nextPayday = new Date(today);
  nextPayday.setDate(today.getDate() + (15 - today.getDate() + 30) % 30);
  lookahead.push({ date: nextPayday.toISOString().split('T')[0], label: 'Expected salary', type: 'income', amount: monthlyIncome });
  lookahead.sort((a, b) => a.date.localeCompare(b.date));

  // ── 10. Executive summary ──────────────────────────────────────────────────
  const nwLine   = nwDelta !== 0 ? `Net worth ${nwDelta >= 0 ? `up ${fmt(nwDelta)}` : `down ${fmt(Math.abs(nwDelta))}`} vs last report.` : `Net worth stands at ${fmt(netWorth)}.`;
  const cashLine = cash >= monthlyExpenses * 3 ? 'Cash reserves healthy.' : `Cash buffer tight at ${(cash / (monthlyExpenses + billsMonthly)).toFixed(1)} months.`;
  const spendLine = expenseSpike > 15 ? `Spending up ${pct(expenseSpike, 0)} — monitor closely.` : 'Spending under control.';
  const fireLineStr  = `FIRE progress: ${pct(fireProgress)} — target year ${fireYear}.`;
  const summary = `${nwLine} ${cashLine} ${spendLine} ${fireLineStr} Best move: ${bestMove.split('—')[0].trim()}.`;

  // ── 11. KPIs ───────────────────────────────────────────────────────────────
  const kpis: CFOKpis = {
    net_worth:            netWorth,
    weekly_change:        nwDelta,
    cash_available:       cash,
    offset_balance:       offsetBal,
    offset_annual_saving: offsetAnnualSaving,
    monthly_surplus:      monthlySurplus,
    debt_total:           totalDebt,
    mortgage_balance:     mortgage,
    portfolio_value:      portfolioVal,
    stocks_value:         stocksValue,
    crypto_value:         cryptoValue,
    super_combined:       superCombined,
    fire_progress_pct:    fireProgress,
    fire_year:            fireYear,
  };

  return {
    week_date:        weekDate,
    summary,
    kpis,
    alerts,
    opportunities,
    best_move:        bestMove,
    wealth_score:     scoreClamp(wealthScore),
    cashflow_score:   scoreClamp(cashflowScore),
    risk_score:       scoreClamp(riskScore),
    discipline_score: scoreClamp(disciplineScore),
    fire_section:     fireSection,
    lookahead,
    networth:         netWorth,
    networth_delta:   nwDelta,
    cash,
    monthly_surplus:  monthlySurplus,
    debt_total:       totalDebt,
    portfolio_value:  portfolioVal,
    fire_year:        fireYear,
    fire_progress:    fireProgress,
  };
}

// ─── Telegram message formatter ───────────────────────────────────────────────

export function formatCFOTelegram(report: CFOReport): string {
  const { kpis, alerts, opportunities, best_move, fire_section } = report;
  const sign = (n: number) => n >= 0 ? '+' : '';
  const f = (n: number) => {
    if (Math.abs(n) >= 1_000_000) return `$${(n/1_000_000).toFixed(2)}M`;
    if (Math.abs(n) >= 1_000)     return `$${Math.round(n/1_000)}K`;
    return `$${Math.round(n)}`;
  };

  const overallScore = Math.round((report.wealth_score + report.cashflow_score + report.risk_score + report.discipline_score) / 4);
  const scoreEmoji   = overallScore >= 75 ? '🟢' : overallScore >= 55 ? '🟡' : '🔴';

  let msg = `📊 <b>AI Weekly CFO Report</b>\n`;
  msg += `<i>${report.week_date}</i>\n\n`;
  msg += `${scoreEmoji} <b>Overall Score: ${overallScore}/100</b>\n\n`;
  msg += `<b>📈 KPI Snapshot</b>\n`;
  msg += `Net Worth: <b>${f(kpis.net_worth)}</b> (${sign(kpis.weekly_change)}${f(kpis.weekly_change)})\n`;
  msg += `Cash: ${f(kpis.cash_available)} | Surplus: ${f(kpis.monthly_surplus)}/mo\n`;
  msg += `Portfolio: ${f(kpis.portfolio_value)} | Super: ${f(kpis.super_combined)}\n`;
  msg += `Debt: ${f(kpis.debt_total)}\n\n`;

  if (alerts.length > 0) {
    msg += `<b>⚠️ Alerts (${alerts.length})</b>\n`;
    alerts.slice(0, 3).forEach(a => { msg += `• ${a}\n`; });
    msg += '\n';
  }

  msg += `<b>🎯 Best Move This Week</b>\n`;
  msg += `${best_move}\n\n`;

  msg += `<b>🔥 FIRE</b>\n`;
  msg += `Progress: ${fire_section.progress_pct.toFixed(1)}% | Target: ${fire_section.fire_year}\n`;
  msg += `${fire_section.on_track ? '✅ On track' : '⚠️ Behind plan'}\n\n`;

  msg += `<b>Scores</b>\n`;
  msg += `Wealth ${report.wealth_score} | Cashflow ${report.cashflow_score} | Risk ${report.risk_score} | Discipline ${report.discipline_score}\n\n`;

  msg += `Open app for full report 👉 familywealthlab.net`;
  return msg;
}

// ─── Dedup check: has report run this week? ───────────────────────────────────

export async function cfoAlreadyRanThisWeek(): Promise<boolean> {
  const settings = await getCFOSettings();
  if (!settings.last_run_at) return false;
  const lastRun = new Date(settings.last_run_at);
  const msSince = Date.now() - lastRun.getTime();
  return msSince < 6 * 24 * 60 * 60 * 1000; // less than 6 days ago
}

// ─── Is it time to run? (Saturday morning AEST) ───────────────────────────────

export function isCFOScheduleTime(deliveryDay: string, deliveryTime: string): boolean {
  const now      = new Date();
  const brisbane = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Brisbane' }));
  const day      = brisbane.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Australia/Brisbane' });
  const [targetH, targetM] = deliveryTime.split(':').map(Number);
  const nowMins  = brisbane.getHours() * 60 + brisbane.getMinutes();
  const targetMins = targetH * 60 + targetM;
  return day === deliveryDay && nowMins >= targetMins;
}

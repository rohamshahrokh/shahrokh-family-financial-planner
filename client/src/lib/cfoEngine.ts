/**
 * cfoEngine.ts — Saturday Morning Financial Bulletin Engine
 *
 * CRITICAL: Net Worth uses the EXACT same formula as dashboard.tsx:
 *   totalAssets = ppor + cash + offset_balance + super_combined + liveStocks + liveCrypto + cars + iran_property
 *   netWorth    = totalAssets - (mortgage + other_debts)
 *
 * Single source of truth — no parallel formulas.
 */

import { safeNum } from './finance';
import { computeTaxAlpha, buildTaxAlphaInput, type TaxAlphaResult } from './taxAlphaEngine';
import { computeRiskRadar, buildRiskInput } from './riskEngine';
import { computeFirePath, buildFirePathInput, type FIREPathResult } from './firePathEngine';
import { computeBestMove, type BestMoveResult } from './bestMoveEngine';
import { computeAllScenarios, defaultScenarioInputs } from './propertyBuyEngine';

// ─── Supabase ─────────────────────────────────────────────────────────────────
const SB_URL  = 'https://uoraduyyxhtzixcsaidg.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c';
const SB_HDR  = {
  apikey: SB_ANON,
  Authorization: `Bearer ${SB_ANON}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const sb = (path: string) =>
  fetch(`${SB_URL}/rest/v1/${path}`, { headers: SB_HDR })
    .then(r => r.ok ? r.json() : [])
    .catch(() => []);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CFOScore {
  wealth:      number;
  cashflow:    number;
  risk:        number;
  discipline:  number;
  opportunity: number;
  overall:     number;
}

export interface CFOSnapshot {
  net_worth:         number;
  net_worth_delta:   number;
  // Cash breakdown
  cash_everyday:     number;
  cash_savings:      number;
  cash_emergency:    number;
  cash_other:        number;
  offset_balance:    number;
  liquid_cash:       number;       // all cash accounts combined
  offset_interest_saving: number;  // annual interest saved by offset
  // Income/expense — stored so surplus tooltip can show breakdown
  monthly_income:    number;
  monthly_expenses:  number;
  // Other
  monthly_surplus:   number;
  debt_ratio:        number;       // total_debt / total_assets
  fire_progress_pct: number;
  years_to_fire:     number;
  fire_year:         number;
  fire_on_track:     boolean;
  total_assets:      number;
  total_debt:        number;
  portfolio_value:   number;
  super_combined:    number;
}

export interface CFOExpense {
  amount:      number;
  category:    string;
  description: string;
  member:      string;
  date:        string;
  flag:        'normal' | 'unusual' | 'high';
}

export interface CFOBillAhead {
  bill_name:  string;
  due_date:   string;
  days_away:  number;
  amount:     number;
  frequency:  string;
}

export interface CFOCashflow {
  income_expected:  number;
  bills_total:      number;
  net_cashflow:     number;
  status:           'green' | 'amber' | 'red';
  bills:            CFOBillAhead[];
}

export interface CFOInvestment {
  stocks_value:      number;
  stocks_delta:      number;
  stocks_delta_pct:  number;
  best_stock:        string;
  worst_stock:       string;
  crypto_value:      number;
  crypto_delta:      number;
  crypto_delta_pct:  number;
  dca_active:        string[];
  planned_buys:      string[];
  portfolio_total:   number;
}

export interface CFOPropertyWatch {
  buy_score:          number;   // /10
  wait_score:         number;   // /10
  borrowing_power:    number;
  deposit_ready:      number;   // % of recommended deposit
  market_summary:     string;
}

export interface CFOFireTracker {
  target_passive_income:  number;
  current_passive_income: number;
  years_remaining:        number;
  progress_pct:           number;
  fire_year:              number;
  semi_fire_year:         number;
  target_capital:         number;
  investable:             number;
  on_track:               boolean;
  accelerator:            string;
}

export interface CFOTaxAlpha {
  neg_gearing_benefit:   number;
  super_room_remaining:  number;
  estimated_refund:      string;
  tips:                  string[];
  // Extended Tax Alpha fields
  total_annual_saving:   number;
  total_saving_label:    string;
  household_tax_now:     number;
  top_strategies:        Array<{ title: string; action: string; annual_saving: number; annual_saving_label: string; risk: string }>;
}

export interface CFOBestMove {
  action:         string;
  reason:         string;
  annual_benefit: number;
  benefit_label:  string;
  risk:           'Low' | 'Med' | 'High';
  cta:            string;
  cta_route:      string;
  alternatives:   Array<{ action: string; benefit_label: string; risk: 'Low' | 'Med' | 'High' }>;
  summary:        string;
}

export interface CFOBulletin {
  // Metadata
  week_date:   string;
  generated_at: string;

  // 1. Scores
  scores:       CFOScore;

  // 2. Snapshot
  snapshot:     CFOSnapshot;

  // 3. Top expenses
  top_expenses:     CFOExpense[];
  spending_insight: string;

  // 4. 7-day cashflow
  cashflow:     CFOCashflow;

  // 5. Smart action
  smart_action:       string;
  smart_action_value: string;   // quantified ROI, e.g. "$11K/year saved"

  // 6. Property watch
  property_watch: CFOPropertyWatch;

  // 7. Investment update
  investment: CFOInvestment;

  // 8. Risk radar
  risk_alerts:  string[];
  risk_radar: {
    overall_score:   number;
    overall_level:   'green' | 'amber' | 'red';
    overall_label:   string;
    fragility_index: number;
    categories: Array<{ id: string; label: string; icon: string; score: number; level: 'green' | 'amber' | 'red'; summary: string }>;
    top_risks: Array<{ label: string; value: string; finding: string; action: string; level: 'green' | 'amber' | 'red' }>;
    top_mitigations: string[];
  };

  // 9. FIRE tracker
  fire:         CFOFireTracker;

  // 9b. FIRE Fastest Path
  fire_path: {
    best_scenario:   string;
    best_label:      string;
    best_fire_year:  number;
    fastest_vs_slowest_years: number;
    target_capital:  number;
    current_progress_pct: number;
    semi_fire_year:  number;
    recommendation:  string;
    scenarios: Array<{
      id:              string;
      label:           string;
      fire_year:       number;
      years_to_fire:   number;
      risk_level:      string;
      monthly_passive_at_fire: number;
      annual_invest:   number;
    }>;
  };

  // 10. Tax alpha
  tax_alpha:    CFOTaxAlpha;

  // 11. Best Move Right Now
  best_move:    CFOBestMove;

  // 12. Family CFO insight
  cfo_insight:  string;

  // Legacy flat fields for DB columns
  summary:          string;
  alerts:           string[];
  opportunities:    string[];
  best_move:        string;
  wealth_score:     number;
  cashflow_score:   number;
  risk_score:       number;
  discipline_score: number;
  networth:         number;
  networth_delta:   number;
  monthly_surplus:  number;
  debt_total:       number;
  portfolio_value:  number;
  fire_year:        number;
  fire_progress:    number;
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

const DEFAULT_SETTINGS: CFOSettings = {
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

export async function getCFOSettings(): Promise<CFOSettings> {
  try {
    const rows = await sb('sf_cfo_settings?id=eq.shahrokh-family-main');
    return rows?.[0] ? { ...DEFAULT_SETTINGS, ...rows[0] } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

export async function saveCFOSettings(s: Partial<CFOSettings>): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/sf_cfo_settings`, {
    method: 'POST',
    headers: { ...SB_HDR, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ id: 'shahrokh-family-main', ...s, updated_at: new Date().toISOString() }),
  });
}

// ─── Report history ───────────────────────────────────────────────────────────

export async function getCFOReports(limit = 12): Promise<any[]> {
  try {
    const rows = await sb(`sf_cfo_reports?order=week_date.desc&limit=${limit}`);
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}

export async function saveCFOReport(report: CFOBulletin, telegramSent: boolean): Promise<void> {
  const row = {
    week_date:        report.week_date,
    summary:          report.summary,
    alerts:           report.alerts,
    opportunities:    report.opportunities,
    best_move:        (report as any).best_move_text ?? '',  // DB column stores legacy flat string
    wealth_score:     report.wealth_score,
    cashflow_score:   report.cashflow_score,
    risk_score:       report.risk_score,
    discipline_score: report.discipline_score,
    networth:         report.networth,
    networth_delta:   report.networth_delta,
    cash:             report.snapshot.liquid_cash,
    monthly_surplus:  report.monthly_surplus,
    debt_total:       report.debt_total,
    portfolio_value:  report.portfolio_value,
    fire_year:        report.fire_year,
    fire_progress:    report.fire_progress,
    telegram_sent:    telegramSent,
    json_payload:     report,   // full bulletin for in-app viewer
  };
  // UPSERT by week_date — re-generating same week replaces stale row
  await fetch(`${SB_URL}/rest/v1/sf_cfo_reports`, {
    method: 'POST',
    headers: { ...SB_HDR, Prefer: 'resolution=merge-duplicates,return=representation' },
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
function pct(n: number, d = 1)   { return `${n.toFixed(d)}%`; }
function sc(n: number)           { return Math.max(0, Math.min(100, Math.round(n))); }

function monthsToFIRE(bal: number, add: number, rate: number, target: number): number {
  if (bal >= target) return 0;
  if (add <= 0 && rate <= 0) return Infinity;
  let b = bal;
  for (let m = 0; m < 600; m++) {
    b = b * (1 + rate) + add;
    if (b >= target) return m + 1;
  }
  return 600;
}

function flagExpense(e: any, all: any[]): 'normal' | 'unusual' | 'high' {
  const amt = safeNum(e.amount);
  if (amt > 500) return 'high';
  const same = all.filter((x: any) => x.category === e.category);
  if (same.length >= 3) {
    const avg = same.reduce((s: number, x: any) => s + safeNum(x.amount), 0) / same.length;
    if (amt > avg * 2.5) return 'unusual';
  }
  return 'normal';
}

// ─── Main bulletin generator ──────────────────────────────────────────────────

export async function generateCFOReport(
  tone: 'Conservative' | 'Balanced' | 'Aggressive' = 'Balanced'
): Promise<CFOBulletin> {

  // ── Fetch all data in parallel ────────────────────────────────────────────
  const [
    snapRows, expRows, billRows, propRows,
    stockRows, cryptoRows, dcaStockRows, dcaCryptoRows,
    plannedRows, prevReportRows, incomeRows,
    bestMoveResult,
  ] = await Promise.all([ // NOTE: propertyBuyResult computed below after snap is known
    sb('sf_snapshot?id=eq.shahrokh-family-main'),
    sb('sf_expenses?order=date.desc&limit=300'),
    sb('sf_recurring_bills?active=eq.true'),
    sb('sf_properties'),
    sb('sf_stocks'),
    sb('sf_crypto'),
    sb('sf_stock_dca'),
    sb('sf_crypto_dca'),
    sb('sf_planned_investments'),
    sb('sf_cfo_reports?order=week_date.desc&limit=2'),
    sb('sf_income?order=date.desc&limit=60'),
    computeBestMove().catch(() => null),
  ]);

  const snap = snapRows?.[0] ?? {};
  const prevReport = prevReportRows?.[1];

  // Property Buy vs Wait — runs after snap is available (fast, pure calc)
  const propertyBuyResult = (() => {
    try {
      const inp = defaultScenarioInputs({
        monthly_income: safeNum(snap.monthly_income),
        cash: safeNum(snap.cash),
        offset_balance: safeNum(snap.offset_balance),
        mortgage: safeNum(snap.mortgage),
      });
      return computeAllScenarios(inp);
    } catch { return null; }
  })();
  const allExp  = Array.isArray(expRows)  ? expRows  : [];
  const allBills = Array.isArray(billRows) ? billRows : [];
  const now = new Date();

  // Saturday date
  const weekDate = (() => {
    const d = new Date(now);
    const day = d.getDay(); // 0=Sun,6=Sat
    d.setDate(d.getDate() - (day === 6 ? 0 : (day + 1)));
    return d.toISOString().split('T')[0];
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: NET WORTH — EXACT SAME FORMULA AS dashboard.tsx lines 357-359
  // ═══════════════════════════════════════════════════════════════════════════

  // Per-person super (mirrors dashboard exactly)
  const superRoham = safeNum(snap.roham_super_balance) > 0
    ? safeNum(snap.roham_super_balance)
    : safeNum(snap.super_balance) * 0.6;
  const superFara  = safeNum(snap.fara_super_balance) > 0
    ? safeNum(snap.fara_super_balance)
    : safeNum(snap.super_balance) * 0.4;
  const superCombined = superRoham + superFara;

  // Live portfolio from individual stock/crypto rows (mirrors dashboard)
  const stocksFromRows  = (stockRows  ?? []).reduce((s: number, r: any) =>
    s + safeNum(r.current_holding) * safeNum(r.current_price), 0);
  const cryptoFromRows  = (cryptoRows ?? []).reduce((s: number, r: any) =>
    s + safeNum(r.current_holding) * safeNum(r.current_price), 0);
  const liveStocks  = stocksFromRows  > 0 ? stocksFromRows  : safeNum(snap.stocks);
  const liveCrypto  = cryptoFromRows  > 0 ? cryptoFromRows  : safeNum(snap.crypto);
  const portfolioVal = liveStocks + liveCrypto;

  // ── Canonical cash formula (SINGLE SOURCE OF TRUTH — must match dashboard.tsx totalLiquidCash) ──
  // Total Liquid Cash = Everyday + Savings + Emergency + Other + Offset
  // "Other Cash" must NEVER equal offset_balance (dedup guard also in localStore)
  const cashEveryday  = safeNum(snap.cash);
  const cashSavings   = safeNum(snap.savings_cash);
  const cashEmergency = safeNum(snap.emergency_cash);
  const cashOther     = safeNum(snap.other_cash);
  const offsetBal     = safeNum(snap.offset_balance);
  // Dedup guard: if other_cash was accidentally set to offset_balance, zero it
  const safeOther     = (cashOther > 0 && cashOther === offsetBal) ? 0 : cashOther;
  const liquidCash    = cashEveryday + cashSavings + cashEmergency + safeOther + offsetBal;

  // Core balance sheet — IDENTICAL to dashboard.tsx
  const totalAssets =
    safeNum(snap.ppor) +
    liquidCash +            // all cash buckets + offset (single source of truth)
    superCombined +
    liveStocks +
    liveCrypto +
    safeNum(snap.cars) +
    safeNum(snap.iran_property);
  const totalDebt    = safeNum(snap.mortgage) + safeNum(snap.other_debts);
  const netWorth     = totalAssets - totalDebt;
  const debtRatio    = totalAssets > 0 ? totalDebt / totalAssets : 0;
  const propEquity   = safeNum(snap.ppor) - safeNum(snap.mortgage);

  // NW delta vs previous bulletin
  const prevNW   = safeNum(prevReport?.networth);
  const nwDelta  = prevNW ? netWorth - prevNW : 0;

  // Mortgage offset annual interest saving (6.25% typical AUS variable)
  const mortgageRate      = 0.0625;
  const offsetAnnualSaving = offsetBal * mortgageRate;

  // ── Income & surplus ──────────────────────────────────────────────────────
  // Use income records if available (mirrors dashboard income tracker)
  const FREQ_MULT: Record<string, number> = {
    Weekly: 52/12, Fortnightly: 26/12, Monthly: 1,
    Quarterly: 1/3, 'Semi-Annual': 1/6, Annual: 1/12,
  };
  let incomeTrackerMonthly = 0;
  if (Array.isArray(incomeRows) && incomeRows.length > 0) {
    // FIX: sf_income is a TRANSACTION LOG — each payslip is a separate row.
    // Summing all 60 rows multiplied by frequency = catastrophic double-counting
    // (e.g. 17 Fara payslip rows × fortnightly multiplier = $170K/month from one stream).
    //
    // Correct approach: deduplicate to ONE row per unique income stream
    // (identified by description + member), keeping the MOST RECENT row for each.
    // Sort newest-first so the first occurrence we encounter is the most recent.
    const sorted = [...incomeRows].sort((a: any, b: any) =>
      new Date(b.date ?? b.created_at ?? 0).getTime() - new Date(a.date ?? a.created_at ?? 0).getTime()
    );
    const seen = new Set<string>();
    sorted.forEach((r: any) => {
      if (r.recurring === false) return; // skip explicitly non-recurring
      const key = `${(r.description ?? '').trim().toLowerCase()}|${(r.member ?? '').trim().toLowerCase()}`;
      if (seen.has(key)) return; // already counted this stream — skip historical duplicates
      seen.add(key);
      incomeTrackerMonthly += safeNum(r.amount) * (FREQ_MULT[r.frequency] ?? 1);
    });
  }
  const monthlyIncome   = incomeTrackerMonthly > 0
    ? incomeTrackerMonthly
    : safeNum(snap.monthly_income) || 22000;
  const monthlyExpenses = safeNum(snap.monthly_expenses) || 8000;

  // Bills monthly equivalent (for FIRE calc and cashflow display — NOT subtracted from surplus)
  // IMPORTANT: dashboard surplus = income - expenses ONLY (line 363).
  // monthly_expenses already includes bills in the user's budget.
  // We keep billsMonthly for FIRE capital requirement and cashflow display.
  const FREQ_BILLS: Record<string, number> = {
    Weekly: 52/12, Fortnightly: 26/12, Monthly: 1,
    Quarterly: 4/12, 'Semi-Annual': 2/12, Annual: 1/12,
  };
  const billsMonthly = allBills.reduce((s: number, b: any) => {
    const freq = (b.frequency || 'Monthly').trim();
    const amt  = safeNum(b.amount);
    return s + amt * (FREQ_BILLS[freq] ?? 1);
  }, 0);
  // Surplus = income - expenses (IDENTICAL to dashboard.tsx line 363)
  const monthlySurplus = monthlyIncome - monthlyExpenses;

  // Current passive income estimate (dividends + rental)
  const rentalIncome = (Array.isArray(propRows) ? propRows : [])
    .filter((p: any) => p.type !== 'ppor')
    .reduce((s: number, p: any) => s + safeNum(p.weekly_rent) * 52 / 12, 0);
  const dividendYield      = 0.03; // assume 3% dividend yield on stocks
  const dividendIncome     = liveStocks * dividendYield / 12;
  const passiveIncomeMonthly = rentalIncome + dividendIncome;

  // ═══════════════════════════════════════════════════════════════════════════
  // FIRE CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════
  const swr         = tone === 'Aggressive' ? 0.05 : tone === 'Conservative' ? 0.03 : 0.04;
  const annualExp   = (monthlyExpenses + billsMonthly) * 12;
  const reqCapital  = annualExp / swr;
  const investable  = portfolioVal + superCombined;
  const monthlyRate = (tone === 'Aggressive' ? 0.10 : tone === 'Conservative' ? 0.07 : 0.085) / 12;
  const monthlySav  = Math.max(0, monthlySurplus * 0.7);
  const months      = monthsToFIRE(investable, monthlySav, monthlyRate, reqCapital);
  const fireYear    = now.getFullYear() + Math.ceil(months / 12);
  const semiMonths  = monthsToFIRE(investable, monthlySav, monthlyRate, reqCapital * 0.5);
  const semiFIREYear = now.getFullYear() + Math.ceil(semiMonths / 12);
  const firePct     = Math.min(100, (investable / reqCapital) * 100);
  const prevFireYear = prevReport?.fire_year;
  const fireOnTrack  = prevFireYear ? fireYear <= prevFireYear : true;

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: TOP 6 EXPENSES (last 7 days)
  // ═══════════════════════════════════════════════════════════════════════════
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
  const weekExps = allExp.filter((e: any) => e.date >= sevenDaysAgo);
  const top6: CFOExpense[] = [...weekExps]
    .sort((a: any, b: any) => safeNum(b.amount) - safeNum(a.amount))
    .slice(0, 6)
    .map((e: any) => ({
      amount:      safeNum(e.amount),
      category:    e.category    || 'Other',
      description: e.description || e.subcategory || '',
      member:      e.member      || e.family_member || 'Family',
      date:        e.date,
      flag:        flagExpense(e, allExp),
    }));

  // Spending insight: biggest category change vs 3-month weekly avg
  const cutoff90 = new Date(now.getTime() - 90 * 86400000);
  const last90   = allExp.filter((e: any) => new Date(e.date) >= cutoff90);
  const weekByCat: Record<string, number> = {};
  weekExps.forEach((e: any) => { weekByCat[e.category||'Other'] = (weekByCat[e.category||'Other']||0) + safeNum(e.amount); });
  const avgWeekByCat: Record<string, number> = {};
  last90.forEach((e: any) => { avgWeekByCat[e.category||'Other'] = (avgWeekByCat[e.category||'Other']||0) + safeNum(e.amount); });
  Object.keys(avgWeekByCat).forEach(c => { avgWeekByCat[c] /= 13; });

  let spendInsight = '';
  let bigCat = ''; let bigPct = 0;
  for (const cat of Object.keys(weekByCat)) {
    const avg = avgWeekByCat[cat] || 0;
    if (avg > 0) {
      const change = ((weekByCat[cat] - avg) / avg) * 100;
      if (Math.abs(change) > Math.abs(bigPct)) { bigPct = change; bigCat = cat; }
    }
  }
  if (bigCat && Math.abs(bigPct) >= 15) {
    const dir = bigPct > 0 ? 'above' : 'below';
    spendInsight = `${bigCat} spending was ${Math.abs(bigPct).toFixed(0)}% ${dir} your 3-month average this week.`;
  } else {
    const largest = Object.keys(weekByCat).sort((a,b) => weekByCat[b] - weekByCat[a])[0];
    spendInsight = largest
      ? `${largest} remains your largest spending category this week.`
      : 'No expenses recorded this week.';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: 7-DAY CASHFLOW (bills only, next 7 days)
  // ═══════════════════════════════════════════════════════════════════════════
  const todayStr = now.toISOString().split('T')[0];
  const in7Days  = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0];
  const billsNext7: CFOBillAhead[] = [];
  for (const b of allBills) {
    if (!b.next_due_date) continue;
    const daysAway = Math.round((new Date(b.next_due_date).getTime() - now.getTime()) / 86400000);
    if (daysAway >= 0 && b.next_due_date <= in7Days) {
      billsNext7.push({
        bill_name:  b.bill_name || b.name || 'Bill',
        due_date:   b.next_due_date,
        days_away:  daysAway,
        amount:     safeNum(b.amount),
        frequency:  b.frequency || 'Monthly',
      });
    }
  }
  billsNext7.sort((a, b) => a.days_away - b.days_away);
  const billsDueTotal7  = billsNext7.reduce((s, b) => s + b.amount, 0);
  const incomeExpected7 = monthlyIncome * (7 / 30);
  const netCashflow7    = incomeExpected7 - billsDueTotal7;
  const cashflowStatus: 'green'|'amber'|'red' =
    netCashflow7 > 500 ? 'green' : netCashflow7 > 0 ? 'amber' : 'red';
  const cashflow: CFOCashflow = {
    income_expected: incomeExpected7,
    bills_total:     billsDueTotal7,
    net_cashflow:    netCashflow7,
    status:          cashflowStatus,
    bills:           billsNext7.slice(0, 6),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: SMART ACTION (highest ROI single action)
  // ═══════════════════════════════════════════════════════════════════════════
  // idleCash: total liquid cash above a 3-month emergency buffer
  // Uses full liquidCash (everyday + savings + emergency + other) not just cashEveryday
  const idleCash = liquidCash - monthlyExpenses * 3;
  let smartAction = '';
  let smartActionValue = '';

  if (monthlySurplus < 0) {
    smartAction = `Reduce monthly outflows by at least ${fmt(Math.abs(monthlySurplus))} — cashflow is negative`;
    smartActionValue = `${fmt(Math.abs(monthlySurplus * 12))} annual deficit to close`;
  } else if (idleCash > 20000 && offsetBal > 0) {
    // Offset account exists and has a balance — recommend topping it up
    const saving = idleCash * mortgageRate;
    smartAction = `Move ${fmt(Math.round(idleCash / 10000) * 10000)} idle cash to mortgage offset`;
    smartActionValue = `Saves ~${fmt(saving)}/year in mortgage interest (guaranteed ${pct(mortgageRate * 100, 2)} return)`;
  } else if (idleCash > 20000 && offsetBal === 0 && safeNum(snap.mortgage) > 0) {
    // FIX: user has idle cash but offset_balance=0 in DB — this means offset account
    // balance hasn’t been entered in Settings yet. Don’t recommend moving to an
    // account that shows $0 — instead prompt user to configure their offset balance.
    smartAction = `Set up your offset account balance in Settings to unlock cash optimisation`;
    smartActionValue = `You have ${fmt(liquidCash)} in liquid cash — linking your offset could save ${fmt(liquidCash * mortgageRate)}/year in mortgage interest`;
  } else if (safeNum(snap.other_debts) > 10000) {
    const debtSaving = safeNum(snap.other_debts) * 0.09;
    smartAction = `Pay down personal debts totalling ${fmt(safeNum(snap.other_debts))}`;
    smartActionValue = `Saves ~${fmt(debtSaving)}/year in interest at ~9% avg rate`;
  } else if (monthlySurplus > 1500 && (dcaStockRows ?? []).filter((d: any) => d.active !== false).length === 0) {
    const dcaAmt = Math.round(monthlySurplus * 0.4);
    const fireGainMonths = months - monthsToFIRE(investable, monthlySav + dcaAmt, monthlyRate, reqCapital);
    smartAction = `Set up ${fmt(dcaAmt)}/month automated ETF DCA with your surplus`;
    smartActionValue = fireGainMonths > 0 ? `Brings FIRE forward by ~${(fireGainMonths / 12).toFixed(1)} years` : 'Accelerates wealth compounding';
  } else if (safeNum(snap.mortgage) > 0) {
    const refinanceSaving = safeNum(snap.mortgage) * 0.005; // 0.5% rate improvement
    smartAction = `Shop mortgage rates — a 0.5% improvement on ${fmt(safeNum(snap.mortgage))}`;
    smartActionValue = `Could save ~${fmt(refinanceSaving)}/year in repayments`;
  } else if (monthlySurplus > 500) {
    smartAction = `Automate ${fmt(Math.round(monthlySurplus * 0.5))}/month into your mortgage offset`;
    smartActionValue = `Saves ~${fmt(Math.round(monthlySurplus * 0.5) * 12 * mortgageRate)}/year in interest`;
  } else {
    smartAction = 'Audit recurring subscriptions and cancel at least one';
    smartActionValue = 'Even $30/month = $360/year recovered';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: PROPERTY WATCH (Brisbane/SEQ market)
  // ═══════════════════════════════════════════════════════════════════════════
  // Simple heuristic-based scoring based on financial readiness
  // liquidCash already includes offsetBal — use directly (no double-counting)
  const hasSavedDeposit = liquidCash;
  const targetDeposit   = safeNum(snap.ppor) * 0.20; // 20% of PPOR as proxy
  const depositReadiness = Math.min(100, (hasSavedDeposit / Math.max(targetDeposit, 1)) * 100);
  // FIX: Borrowing power formula (income × 72 − mortgage) is too crude to display.
  // Even with correct income it produces unreliable estimates that are not from a bank
  // serviceability model. Mark as -1 to signal "needs setup" in the UI layer.
  // The display component should show "Needs setup" when borrowingPower === -1.
  const borrowingPower = -1; // Hidden — not reliable without bank serviceability model
  // Buy/wait scores based on cashflow health
  const surplusRatio = monthlyIncome > 0 ? monthlySurplus / monthlyIncome : 0;
  const buyScore  = Math.max(1, Math.min(10, Math.round(
    4 + (surplusRatio > 0.2 ? 2 : 0) + (debtRatio < 0.4 ? 1 : -1) + (liquidCash > 50000 ? 1 : -1) + (safeNum(snap.mortgage) === 0 ? 2 : 0)
  )));
  const waitScore = 10 - buyScore;
  const marketSummary = buyScore >= 7
    ? 'Your financial position is strong. Brisbane/SEQ market fundamentals remain favourable for quality assets.'
    : buyScore >= 5
    ? 'Solid base, but strengthen cashflow buffer before next purchase to avoid overextension.'
    : 'Focus on reducing debt and building deposit before adding more property exposure.';

  const propertyWatch: CFOPropertyWatch = {
    buy_score:       buyScore,
    wait_score:      waitScore,
    borrowing_power: borrowingPower,
    deposit_ready:   depositReadiness,
    market_summary:  marketSummary,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: INVESTMENT UPDATE
  // ═══════════════════════════════════════════════════════════════════════════
  const prevStocks = safeNum(prevReport?.json_payload?.investment?.stocks_value ?? prevReport?.portfolio_value);
  const prevCrypto = safeNum(prevReport?.json_payload?.investment?.crypto_value);
  const stocksDelta    = prevStocks > 0 ? liveStocks - prevStocks : 0;
  const cryptoDelta    = prevCrypto > 0 ? liveCrypto - prevCrypto : 0;
  const stocksDeltaPct = prevStocks > 0 ? (stocksDelta / prevStocks) * 100 : 0;
  const cryptoDeltaPct = prevCrypto > 0 ? (cryptoDelta / prevCrypto) * 100 : 0;

  // Best/worst stock by change vs purchase price (if holding > 0)
  let bestStock = ''; let worstStock = '';
  const activeStocks = (stockRows ?? []).filter((s: any) => safeNum(s.current_holding) > 0);
  if (activeStocks.length > 0) {
    const withGain = activeStocks.map((s: any) => ({
      ticker: s.ticker || s.name || 'Stock',
      gain: safeNum(s.current_price) - safeNum(s.avg_cost || s.current_price),
    }));
    withGain.sort((a: any, b: any) => b.gain - a.gain);
    bestStock  = withGain[0]?.ticker  || '';
    worstStock = withGain[withGain.length - 1]?.ticker || '';
  }

  // DCA active
  const dcaActive: string[] = [];
  for (const d of (dcaStockRows ?? [])) {
    if (d.active !== false && safeNum(d.monthly_amount || d.amount) > 0) {
      dcaActive.push(`${d.ticker || d.name || 'Stock'} ${fmt(safeNum(d.monthly_amount || d.amount))}/mo`);
    }
  }
  for (const d of (dcaCryptoRows ?? [])) {
    if (d.active !== false && safeNum(d.monthly_amount || d.amount) > 0) {
      dcaActive.push(`${d.coin || d.asset_name || 'Crypto'} ${fmt(safeNum(d.monthly_amount || d.amount))}/mo`);
    }
  }

  // Planned buys in next 30 days
  const in30Days = new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0];
  const plannedBuys: string[] = [];
  for (const p of (plannedRows ?? [])) {
    const target = p.target_date || p.planned_date || '';
    if (target && target >= todayStr && target <= in30Days) {
      const label = p.asset_name || p.name || p.ticker || 'Investment';
      const amt   = safeNum(p.amount || p.planned_amount);
      plannedBuys.push(`${label}${amt > 0 ? ` — ${fmt(amt)}` : ''}`);
    }
  }

  const investment: CFOInvestment = {
    stocks_value:      liveStocks,
    stocks_delta:      stocksDelta,
    stocks_delta_pct:  stocksDeltaPct,
    best_stock:        bestStock,
    worst_stock:       worstStock,
    crypto_value:      liveCrypto,
    crypto_delta:      cryptoDelta,
    crypto_delta_pct:  cryptoDeltaPct,
    dca_active:        dcaActive.slice(0, 4),
    planned_buys:      plannedBuys.slice(0, 3),
    portfolio_total:   portfolioVal,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8: RISK RADAR — powered by riskEngine.ts
  // ═══════════════════════════════════════════════════════════════════════════
  // Build big-bills amount for riskEngine input
  const bigBills = allBills.filter((b: any) => {
    if (!b.next_due_date) return false;
    const daysOut = Math.round((new Date(b.next_due_date).getTime() - now.getTime()) / 86400000);
    return daysOut >= 0 && daysOut <= 30 && safeNum(b.amount) > 500;
  });
  const bigBillsAmt = bigBills.reduce((s: number, b: any) => s + safeNum(b.amount), 0);

  // Compute risk using full engine
  const riskSnapForEngine = { ...snap, big_bills_next30: bigBillsAmt };
  const riskEngineInput   = buildRiskInput(riskSnapForEngine, propRows ?? [], allExp ?? []);
  // Inject computed values not in snap directly
  riskEngineInput.big_bills_next30   = bigBillsAmt;
  riskEngineInput.monthly_expenses   = monthlyExpenses;
  riskEngineInput.stocks             = liveStocks;
  riskEngineInput.crypto             = liveCrypto;
  riskEngineInput.super_combined     = superCombined;
  riskEngineInput.total_assets       = totalAssets;
  riskEngineInput.total_debt         = totalDebt;
  const riskResult = computeRiskRadar(riskEngineInput);

  // Build legacy riskAlerts array for backward compat with bulletin
  const riskAlerts: string[] = [
    ...riskResult.alerts
      .filter(a => a.severity === 'critical' || a.severity === 'high')
      .map(a => `${a.severity === 'critical' ? '🔴 ' : ''}${a.message}`),
  ];
  // Always include FY deadline if applicable
  const month = now.getMonth();
  if (month === 4 || month === 5) riskAlerts.push(`🗓️ Financial year ends 30 June — check concessional super contribution cap before deadline.`);
  if (!fireOnTrack && prevFireYear) riskAlerts.push(`FIRE timeline slipped — target moved from ${prevFireYear} → ${fireYear}.`);

  const cryptoPct = portfolioVal > 0 ? (liveCrypto / portfolioVal) * 100 : 0;
  const spendSpike30 = (() => {
    const c30 = new Date(now.getTime() - 30 * 86400000);
    const c60 = new Date(now.getTime() - 60 * 86400000);
    const l30 = allExp.filter((e: any) => new Date(e.date) >= c30).reduce((s: number, e: any) => s + safeNum(e.amount), 0);
    const p30 = allExp.filter((e: any) => new Date(e.date) >= c60 && new Date(e.date) < c30).reduce((s: number, e: any) => s + safeNum(e.amount), 0);
    return p30 > 0 ? ((l30 - p30) / p30) * 100 : 0;
  })();
  if (spendSpike30 > 20) riskAlerts.push(`Spending up ${spendSpike30.toFixed(0)}% vs prior 30 days — ${riskResult.categories.find(c => c.id === 'cashflow')?.factors.find(f => f.id === 'surplus_ratio')?.finding ?? 'review discretionary spend'}.`);
  if (bigBills.length > 0) {
    const names = bigBills.slice(0, 2).map((b: any) => `${b.bill_name} (${fmt(safeNum(b.amount))})`).join(', ');
    riskAlerts.push(`Large bill${bigBills.length > 1 ? 's' : ''} within 30 days: ${names}.`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 9: FIRE TRACKER
  // ═══════════════════════════════════════════════════════════════════════════
  const targetPassiveIncome = (monthlyExpenses + billsMonthly);
  const accelerator = monthlySav > 0
    ? `Each extra ${fmt(1000)}/month invested brings FIRE forward by ~${Math.max(1, Math.round((months - monthsToFIRE(investable, monthlySav + 1000, monthlyRate, reqCapital)) / 12))} months`
    : 'Start investing monthly to activate FIRE projections';

  const fire: CFOFireTracker = {
    target_passive_income:  targetPassiveIncome,
    current_passive_income: passiveIncomeMonthly,
    years_remaining:        months / 12,
    progress_pct:           firePct,
    fire_year:              fireYear,
    semi_fire_year:         semiFIREYear,
    target_capital:         reqCapital,
    investable,
    on_track:               fireOnTrack,
    accelerator,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 9b: FIRE FASTEST PATH — powered by firePathEngine.ts
  // ═══════════════════════════════════════════════════════════════════════════
  const firePathInput  = buildFirePathInput(snap, billRows ?? [], null, [], []);
  const firePathResult: FIREPathResult = computeFirePath(firePathInput, null);

  const firePath = {
    best_scenario:            firePathResult.best_scenario,
    best_label:               firePathResult.best_label,
    best_fire_year:           firePathResult.best_fire_year,
    fastest_vs_slowest_years: firePathResult.fastest_vs_slowest_years,
    target_capital:           firePathResult.target_capital,
    current_progress_pct:     firePathResult.current_progress_pct,
    semi_fire_year:           firePathResult.semi_fire_year,
    recommendation:           firePathResult.recommendation,
    scenarios: firePathResult.scenarios.map(s => ({
      id:                      s.id,
      label:                   s.label,
      fire_year:               s.fire_year,
      years_to_fire:           s.years_to_fire,
      risk_level:              s.risk_level,
      monthly_passive_at_fire: s.monthly_passive_at_fire,
      annual_invest:           s.annual_invest,
    })),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 10: TAX ALPHA — powered by taxAlphaEngine.ts
  // ═══════════════════════════════════════════════════════════════════════════
  const taxAlphaInput  = buildTaxAlphaInput(snap, propRows ?? []);
  const taxAlphaResult = computeTaxAlpha(taxAlphaInput);

  // Legacy fields (keep for backward compat with bulletin HTML template)
  const negGearStrategy = taxAlphaResult.strategies.find(s => s.id === 'negative_gearing');
  const superStrategy   = taxAlphaResult.strategies.find(s => s.id === 'super_concessional_roham');
  const negGearBenefit  = negGearStrategy?.annual_saving ?? 0;
  const superRoom       = superStrategy?.annual_saving   ?? 0;

  const taxTipsFinal = taxAlphaResult.top3.length > 0
    ? taxAlphaResult.top3.map(s => `${s.action} — ${s.annual_saving_label}`)
    : ['Set up income data in Settings to detect tax savings opportunities.'];

  const taxAlpha: CFOTaxAlpha = {
    neg_gearing_benefit:  negGearBenefit,
    super_room_remaining: superRoom,
    estimated_refund:     taxAlphaResult.total_annual_saving > 0 ? fmt(taxAlphaResult.total_annual_saving) : 'Review with accountant',
    tips:                 taxTipsFinal,
    total_annual_saving:  taxAlphaResult.total_annual_saving,
    total_saving_label:   taxAlphaResult.total_saving_label,
    household_tax_now:    taxAlphaResult.household_tax_now,
    top_strategies:       taxAlphaResult.top3.map(s => ({
      title:               s.title,
      action:              s.action,
      annual_saving:       s.annual_saving,
      annual_saving_label: s.annual_saving_label,
      risk:                s.risk,
    })),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 11: FAMILY CFO INSIGHT (single smart sentence)
  // ═══════════════════════════════════════════════════════════════════════════
  let cfoInsight = '';
  if (monthlySurplus < 0) {
    cfoInsight = `Cashflow is under pressure — reducing outflows is more impactful right now than any investment strategy.`;
  } else if (firePct > 70) {
    cfoInsight = `You are in the final stretch toward financial freedom — consistency and protecting against lifestyle creep are now the highest-priority moves.`;
  } else if (firePct > 40 && surplusRatio > 0.25) {
    cfoInsight = `Strong savings rate and growing wealth — deploying surplus into productive assets monthly will accelerate FIRE by years, not months.`;
  } else if (idleCash > 50000) {
    cfoInsight = `Significant idle cash is sitting outside your offset — every dollar moved saves guaranteed interest and quietly grows your net worth.`;
  } else if (cryptoPct > 35) {
    cfoInsight = `Portfolio is crypto-heavy right now — a partial rebalance into diversified ETFs would reduce volatility without sacrificing long-term returns.`;
  } else if (nwDelta > 10000) {
    cfoInsight = `Net worth grew ${fmt(nwDelta)} this week — you are building strongly. Stay disciplined with the plan and let compounding do the rest.`;
  } else {
    cfoInsight = `Steady progress this week. Focus on consistency: automate savings, review bills, and keep investing — time in market beats timing the market.`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SCORES
  // ═══════════════════════════════════════════════════════════════════════════
  let wealthScore = 50;
  if (nwDelta > 0)        wealthScore += 15;
  if (nwDelta > 10000)    wealthScore += 10;
  if (firePct > 30)       wealthScore += 10;
  if (firePct > 60)       wealthScore += 10;
  if (portfolioVal > 50000) wealthScore += 5;

  let cashflowScore = 50;
  if (surplusRatio > 0.30) cashflowScore += 20;
  else if (surplusRatio > 0.15) cashflowScore += 10;
  else if (surplusRatio < 0)    cashflowScore -= 20;
  if (spendSpike30 > 20) cashflowScore -= 15;
  if (monthsCash >= 3)   cashflowScore += 10;
  else if (monthsCash < 1) cashflowScore -= 20;

  // Risk score sourced directly from riskEngine — no duplicate formula
  const riskScore = riskResult.overall_score;

  let disciplineScore = 60;
  if (surplusRatio > 0.20) disciplineScore += 15;
  if (monthlySav > 1000)   disciplineScore += 10;
  if (spendSpike30 < 5)    disciplineScore += 15;
  if (spendSpike30 > 15)   disciplineScore -= 20;
  if (dcaActive.length > 0) disciplineScore += 10;

  let opportunityScore = 50;
  if (idleCash > 20000)     opportunityScore += 20;
  if (superRoom > 5000)     opportunityScore += 15;
  if (negGearBenefit > 0)   opportunityScore += 15;
  if (surplusRatio > 0.25 && dcaActive.length === 0) opportunityScore += 10;
  if (borrowingPower > 200000 && buyScore >= 7)      opportunityScore += 10;

  const scores: CFOScore = {
    wealth:      sc(wealthScore),
    cashflow:    sc(cashflowScore),
    risk:        sc(riskScore),
    discipline:  sc(disciplineScore),
    opportunity: sc(opportunityScore),
    overall:     sc((wealthScore + cashflowScore + riskScore + disciplineScore + opportunityScore) / 5),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SNAPSHOT object
  // ═══════════════════════════════════════════════════════════════════════════
  const snapshot: CFOSnapshot = {
    net_worth:          netWorth,
    net_worth_delta:    nwDelta,
    cash_everyday:      cashEveryday,
    cash_savings:       cashSavings,
    cash_emergency:     cashEmergency,
    cash_other:         cashOther,
    offset_balance:     offsetBal,
    liquid_cash:        liquidCash,
    offset_interest_saving: offsetAnnualSaving,
    monthly_income:     monthlyIncome,
    monthly_expenses:   monthlyExpenses,
    monthly_surplus:    monthlySurplus,
    debt_ratio:         debtRatio,
    fire_progress_pct:  firePct,
    years_to_fire:      months / 12,
    fire_year:          fireYear,
    fire_on_track:      fireOnTrack,
    total_assets:       totalAssets,
    total_debt:         totalDebt,
    portfolio_value:    portfolioVal,
    super_combined:     superCombined,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY + LEGACY FLAT FIELDS
  // ═══════════════════════════════════════════════════════════════════════════
  const nwLine    = nwDelta !== 0 ? `Net worth ${nwDelta >= 0 ? `up ${fmt(nwDelta)}` : `down ${fmt(Math.abs(nwDelta))}`}.` : `Net worth: ${fmt(netWorth)}.`;
  const cashLine  = monthsCash >= 3 ? 'Cash buffer healthy.' : `Cash buffer: ${monthsCash.toFixed(1)} months.`;
  const fireLine  = `FIRE ${firePct.toFixed(0)}% — target ${fireYear}.`;
  const summary   = `${nwLine} ${cashLine} ${fireLine} Smart action: ${smartAction.split('—')[0].trim()}.`;

  const opportunities: string[] = [];
  if (idleCash > 20000)  opportunities.push(`Move idle ${fmt(idleCash)} to offset — saves ${fmt(idleCash * mortgageRate)}/year`);
  if (superRoom > 5000)  opportunities.push(`${fmt(superRoom)} super contribution room remaining before 30 June`);
  if (negGearBenefit > 0) opportunities.push(`Negative gearing benefit: ${fmt(negGearBenefit)}/year`);

  return {
    week_date:    weekDate,
    generated_at: now.toISOString(),
    scores,
    snapshot,
    top_expenses:      top6,
    spending_insight:  spendInsight,
    cashflow,
    smart_action:      smartAction,
    smart_action_value: smartActionValue,
    property_watch:    propertyWatch,
    investment,
    risk_alerts:       riskAlerts.slice(0, 4),
    risk_radar: {
      overall_score:   riskResult.overall_score,
      overall_level:   riskResult.overall_level,
      overall_label:   riskResult.overall_label,
      fragility_index: riskResult.fragility_index,
      categories:      riskResult.categories.map(c => ({
        id:      c.id,
        label:   c.label,
        icon:    c.icon,
        score:   c.score,
        level:   c.level,
        summary: c.summary,
      })),
      top_risks: riskResult.top_risks.map(r => ({
        label:   r.label,
        value:   r.value,
        finding: r.finding,
        action:  r.action,
        level:   r.level,
      })),
      top_mitigations: riskResult.top_mitigations,
    },
    fire,
    fire_path:         firePath,
    tax_alpha:         taxAlpha,
    property_buy_signal: propertyBuyResult ? {
      best_label:  propertyBuyResult.best_label,
      best_scenario: propertyBuyResult.best_scenario,
      confidence:  propertyBuyResult.confidence,
      key_insight: propertyBuyResult.key_insight,
      buy_now_irr: propertyBuyResult.buy_now.irr,
      wait_6m_irr: propertyBuyResult.wait_6m.irr,
    } : null,
    best_move: bestMoveResult ? {
      action:         bestMoveResult.best.action,
      reason:         bestMoveResult.best.reason,
      annual_benefit: bestMoveResult.best.annual_benefit,
      benefit_label:  bestMoveResult.best.benefit_label,
      risk:           bestMoveResult.best.risk,
      cta:            bestMoveResult.best.cta,
      cta_route:      bestMoveResult.best.cta_route,
      alternatives:   bestMoveResult.alternatives.map(a => ({
        action: a.action, benefit_label: a.benefit_label, risk: a.risk,
      })),
      summary:        bestMoveResult.summary,
    } : {
      action: 'Data unavailable', reason: '', annual_benefit: 0,
      benefit_label: 'Needs setup', risk: 'Low' as const,
      cta: 'Dashboard', cta_route: '/dashboard',
      alternatives: [], summary: '',
    },
    cfo_insight:       cfoInsight,
    // Legacy DB columns
    summary,
    alerts:            riskAlerts.slice(0, 2),
    opportunities,
    best_move_text:    smartAction,   // legacy flat column — renamed to avoid collision with CFOBestMove
    wealth_score:      scores.wealth,
    cashflow_score:    scores.cashflow,
    risk_score:        scores.risk,
    discipline_score:  scores.discipline,
    networth:          netWorth,
    networth_delta:    nwDelta,
    monthly_surplus:   monthlySurplus,
    debt_total:        totalDebt,
    portfolio_value:   portfolioVal,
    fire_year:         fireYear,
    fire_progress:     firePct,
  };
}

// ─── Telegram formatter (compact + emojis) ───────────────────────────────────

export function formatCFOTelegram(report: CFOBulletin): string {
  const { scores, snapshot: s, top_expenses, spending_insight,
          cashflow, smart_action, smart_action_value, risk_alerts,
          fire, cfo_insight, best_move } = report;
  const f = fmt;
  const nwSign = s.net_worth_delta >= 0 ? '+' : '';
  const scoreEmoji = scores.overall >= 75 ? '🟢' : scores.overall >= 55 ? '🟡' : '🔴';
  const cashEmoji  = cashflow.status === 'green' ? '🟢' : cashflow.status === 'amber' ? '🟡' : '🔴';

  let msg = `🏦 <b>Saturday Morning CFO Bulletin</b>\n`;
  msg += `<i>Week of ${report.week_date}</i>\n\n`;

  msg += `${scoreEmoji} <b>CFO Score: ${scores.overall}/100</b>\n`;
  msg += `Wealth ${scores.wealth} · Cash ${scores.cashflow} · Risk ${scores.risk} · Discipline ${scores.discipline} · Opportunity ${scores.opportunity}\n\n`;

  msg += `📊 <b>Weekly Snapshot</b>\n`;
  msg += `Net Worth: <b>${f(s.net_worth)}</b> (${nwSign}${f(s.net_worth_delta)})\n`;
  msg += `Liquid Cash: ${f(s.liquid_cash)} | Offset: ${f(s.offset_balance)}\n`;
  msg += `Surplus: ${f(s.monthly_surplus)}/mo | Debt Ratio: ${pct(s.debt_ratio * 100, 0)}\n`;
  msg += `🔥 FIRE: ${s.fire_progress_pct.toFixed(0)}% — target ${s.fire_year} (${s.years_to_fire.toFixed(1)}y)\n\n`;

  if (top_expenses.length > 0) {
    msg += `💸 <b>Top Expenses This Week</b>\n`;
    top_expenses.forEach((e, i) => {
      const flag = e.flag !== 'normal' ? ` ⚠️` : '';
      msg += `${i+1}. ${f(e.amount)} — ${e.category}${e.description ? ` (${e.description})` : ''} [${e.member}]${flag}\n`;
    });
    msg += `📌 ${spending_insight}\n\n`;
  }

  msg += `${cashEmoji} <b>7-Day Cashflow</b>\n`;
  msg += `Income: ${f(cashflow.income_expected)} | Bills: ${f(cashflow.bills_total)} | Net: ${f(cashflow.net_cashflow)}\n`;
  if (cashflow.bills.length > 0) {
    cashflow.bills.slice(0, 3).forEach(b => {
      msg += `• ${b.bill_name}: ${f(b.amount)} in ${b.days_away}d\n`;
    });
  }
  msg += `\n`;

  msg += `🎯 <b>Smart Action of the Week</b>\n`;
  msg += `${smart_action}\n`;
  if (smart_action_value) msg += `<i>${smart_action_value}</i>\n\n`;

  // Best Move Right Now
  if (best_move?.action && best_move.action !== 'Data unavailable') {
    msg += `⚡ <b>Best Move Right Now</b>\n`;
    msg += `${best_move.action}\n`;
    msg += `<i>${best_move.benefit_label} · Risk: ${best_move.risk}</i>\n`;
    if (best_move.alternatives.length > 0) {
      msg += `<b>Alternatives:</b> `;
      msg += best_move.alternatives.slice(0, 3).map(a => a.action).join(' | ');
      msg += `\n`;
    }
    msg += `\n`;
  }

  // Property Buy vs Wait summary
  if ((report as any).property_buy_signal) {
    const pb = (report as any).property_buy_signal;
    msg += `🏠 <b>Property: Buy vs Wait</b>\n`;
    msg += `Recommendation: <b>${pb.best_label}</b>\n`;
    msg += `<i>${pb.key_insight.slice(0, 180)}</i>\n\n`;
  }

  if (risk_alerts.length > 0) {
    msg += `🚨 <b>Risk Radar</b>\n`;
    risk_alerts.slice(0, 2).forEach(a => { msg += `• ${a}\n`; });
    msg += `\n`;
  }

  msg += `💬 <i>${cfo_insight}</i>\n\n`;
  msg += `👉 <a href="https://familywealthlab.net">Open full bulletin →</a>`;
  return msg;
}

// ─── Email formatter (branded HTML) ──────────────────────────────────────────

export function formatCFOEmail(report: CFOBulletin): { subject: string; html: string } {
  const { scores, snapshot: s, top_expenses, spending_insight,
          cashflow, smart_action, smart_action_value, investment,
          risk_alerts, fire, tax_alpha, cfo_insight, best_move } = report;
  const f = fmt;
  const nwUp = s.net_worth_delta >= 0;
  const subject = `🏦 Saturday Morning CFO Bulletin — ${report.week_date}`;

  const scoreBar = (val: number, color: string) => {
    return `<div style="height:6px;background:#1a2233;border-radius:3px;margin-top:4px;">
      <div style="height:6px;width:${val}%;background:${color};border-radius:3px;"></div></div>`;
  };

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0;">
<div style="max-width:620px;margin:0 auto;padding:20px;">

<!-- Header -->
<div style="background:linear-gradient(135deg,#0ea5e9,#6366f1);border-radius:16px;padding:28px 24px;margin-bottom:20px;text-align:center;">
  <div style="font-size:28px;margin-bottom:4px;">🏦</div>
  <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">Saturday Morning CFO Bulletin</h1>
  <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Family Wealth Lab · Week of ${report.week_date}</p>
</div>

<!-- CFO Insight -->
<div style="background:#161b22;border-radius:12px;padding:16px 20px;margin-bottom:16px;border-left:4px solid #0ea5e9;">
  <p style="margin:0;font-size:14px;font-style:italic;color:#94a3b8;">"${cfo_insight}"</p>
</div>

<!-- Scoreboard -->
<div style="background:#161b22;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #21262d;">
  <h2 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#58a6ff;">📊 Executive Scoreboard</h2>
  <div style="text-align:center;margin-bottom:16px;">
    <div style="font-size:48px;font-weight:900;color:${scores.overall>=75?'#22d3ee':scores.overall>=55?'#f59e0b':'#f87171'};">${scores.overall}</div>
    <div style="font-size:12px;color:#8b949e;">Overall CFO Score / 100</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
    ${[['Wealth',scores.wealth,'#22d3ee'],['Cashflow',scores.cashflow,'#a78bfa'],['Risk',scores.risk,'#34d399'],['Discipline',scores.discipline,'#f59e0b'],['Opportunity',scores.opportunity,'#f97316']].map(([label,val,color])=>`
    <div style="background:#0d1117;border-radius:8px;padding:10px 12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="font-size:12px;color:#8b949e;">${label}</span>
        <span style="font-size:14px;font-weight:700;color:${color};">${val}</span>
      </div>
      ${scoreBar(Number(val), String(color))}
    </div>`).join('')}
  </div>
</div>

<!-- Snapshot -->
<div style="background:#161b22;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #21262d;">
  <h2 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#58a6ff;">📈 Weekly Snapshot</h2>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
    <div style="background:#0d1117;border-radius:8px;padding:12px;border:1px solid #21262d;">
      <div style="font-size:11px;color:#8b949e;">NET WORTH</div>
      <div style="font-size:20px;font-weight:700;color:#fff;margin-top:2px;">${f(s.net_worth)}</div>
      <div style="font-size:12px;color:${nwUp?'#3fb950':'#f85149'};margin-top:2px;">${nwUp?'▲':'▼'} ${f(Math.abs(s.net_worth_delta))} vs last week</div>
    </div>
    <div style="background:#0d1117;border-radius:8px;padding:12px;border:1px solid #21262d;">
      <div style="font-size:11px;color:#8b949e;">LIQUID CASH</div>
      <div style="font-size:20px;font-weight:700;color:#fff;margin-top:2px;">${f(s.liquid_cash)}</div>
      <div style="font-size:12px;color:#8b949e;margin-top:2px;">Offset: ${f(s.offset_balance)}</div>
    </div>
    <div style="background:#0d1117;border-radius:8px;padding:12px;border:1px solid #21262d;">
      <div style="font-size:11px;color:#8b949e;">MONTHLY SURPLUS</div>
      <div style="font-size:20px;font-weight:700;color:${s.monthly_surplus>=0?'#3fb950':'#f85149'};margin-top:2px;">${f(s.monthly_surplus)}</div>
    </div>
    <div style="background:#0d1117;border-radius:8px;padding:12px;border:1px solid #21262d;">
      <div style="font-size:11px;color:#8b949e;">FIRE PROGRESS</div>
      <div style="font-size:20px;font-weight:700;color:#f0883e;margin-top:2px;">${s.fire_progress_pct.toFixed(0)}%</div>
      <div style="font-size:12px;color:#8b949e;margin-top:2px;">Target: ${s.fire_year} · ${s.years_to_fire.toFixed(1)}y</div>
    </div>
  </div>
</div>

<!-- Smart Action -->
<div style="background:linear-gradient(135deg,#0ea5e920,#6366f120);border:1px solid #0ea5e950;border-radius:12px;padding:20px;margin-bottom:16px;">
  <h2 style="margin:0 0 10px;font-size:15px;font-weight:700;color:#0ea5e9;">🎯 Smart Action of the Week</h2>
  <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#fff;">${smart_action}</p>
  ${smart_action_value ? `<p style="margin:0;font-size:13px;color:#94a3b8;font-style:italic;">${smart_action_value}</p>` : ''}
</div>

${best_move?.action && best_move.action !== 'Data unavailable' ? `
<!-- Best Move Right Now -->
<div style="background:linear-gradient(135deg,#f59e0b20,#f97316 20);border:1px solid #f59e0b50;border-radius:12px;padding:20px;margin-bottom:16px;">
  <h2 style="margin:0 0 4px;font-size:15px;font-weight:700;color:#f59e0b;">⚡ Best Move Right Now</h2>
  <p style="margin:0 0 6px;font-size:15px;font-weight:600;color:#fff;">${best_move.action}</p>
  <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">${best_move.reason}</p>
  <div style="display:inline-block;background:#10b98130;border:1px solid #10b98160;border-radius:20px;padding:3px 12px;margin-bottom:8px;">
    <span style="color:#10b981;font-size:12px;font-weight:700;">${best_move.benefit_label}</span>
    <span style="color:#64748b;font-size:12px;"> &middot; Risk: ${best_move.risk}</span>
  </div>
  ${best_move.alternatives.length > 0 ? `
  <p style="margin:4px 0 2px;font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Alternatives</p>
  ${best_move.alternatives.slice(0,3).map(a =>
    `<p style="margin:0 0 2px;font-size:12px;color:#94a3b8;">&#8250; ${a.action} &mdash; ${a.benefit_label} &middot; <span style="color:${a.risk==='Low'?'#10b981':a.risk==='Med'?'#f59e0b':'#ef4444'}">${a.risk}</span></p>`
  ).join('')}` : ''}
</div>` : ''}

<!-- Top Expenses -->
${top_expenses.length > 0 ? `
<div style="background:#161b22;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #21262d;">
  <h2 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#58a6ff;">💸 Top 3 Expenses</h2>
  ${top_expenses.map((e,i)=>`
  <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #21262d${i===top_expenses.length-1?';border-bottom:none':''};">
    <div>
      <div style="font-size:13px;font-weight:600;color:#e2e8f0;">${e.category}${e.description?` — ${e.description}`:''}</div>
      <div style="font-size:11px;color:#8b949e;margin-top:2px;">${e.member} · ${e.date}${e.flag!=='normal'?` · <span style="color:#f0883e;">${e.flag==='unusual'?'⚠️ Unusual':'❗ High'}</span>`:''}</div>
    </div>
    <div style="font-size:15px;font-weight:700;color:#f85149;">${f(e.amount)}</div>
  </div>`).join('')}
  <div style="margin-top:10px;padding:10px 12px;background:#0d1117;border-radius:8px;font-size:12px;color:#94a3b8;font-style:italic;">📌 ${spending_insight}</div>
</div>` : ''}

<!-- 7-Day Cashflow -->
<div style="background:#161b22;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #21262d;">
  <h2 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#58a6ff;">📅 7-Day Cashflow</h2>
  <div style="display:flex;gap:10px;margin-bottom:12px;">
    <div style="flex:1;text-align:center;background:#0d1117;border-radius:8px;padding:12px;">
      <div style="font-size:11px;color:#8b949e;">INCOME</div>
      <div style="font-size:16px;font-weight:700;color:#3fb950;">${f(cashflow.income_expected)}</div>
    </div>
    <div style="flex:1;text-align:center;background:#0d1117;border-radius:8px;padding:12px;">
      <div style="font-size:11px;color:#8b949e;">BILLS</div>
      <div style="font-size:16px;font-weight:700;color:#f85149;">${f(cashflow.bills_total)}</div>
    </div>
    <div style="flex:1;text-align:center;background:#0d1117;border-radius:8px;padding:12px;border:1px solid ${cashflow.status==='green'?'#3fb950':cashflow.status==='amber'?'#f59e0b':'#f85149'}40;">
      <div style="font-size:11px;color:#8b949e;">NET</div>
      <div style="font-size:16px;font-weight:700;color:${cashflow.status==='green'?'#3fb950':cashflow.status==='amber'?'#f59e0b':'#f85149'};">${f(cashflow.net_cashflow)}</div>
    </div>
  </div>
  ${cashflow.bills.map(b=>`<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #21262d;font-size:12px;"><span style="color:#e2e8f0;">${b.bill_name} <span style="color:#8b949e;">· ${b.days_away===0?'Today':`in ${b.days_away}d`}</span></span><span style="color:#f0883e;font-weight:600;">${f(b.amount)}</span></div>`).join('')}
</div>

<!-- Risk Radar -->
${risk_alerts.length > 0 ? `
<div style="background:#161b22;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #21262d;">
  <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#58a6ff;">🚨 Risk Radar</h2>
  ${risk_alerts.map(a=>`<div style="background:#0d1117;border-left:3px solid #f0883e;border-radius:0 8px 8px 0;padding:10px 12px;margin-bottom:8px;font-size:13px;color:#e2e8f0;line-height:1.5;">${a}</div>`).join('')}
</div>` : ''}

<!-- Tax Alpha -->
${tax_alpha.tips.length > 0 ? `
<div style="background:#161b22;border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid #21262d;">
  <h2 style="margin:0 0 12px;font-size:15px;font-weight:700;color:#58a6ff;">🧾 Tax Alpha</h2>
  ${tax_alpha.tips.map(t=>`<div style="font-size:13px;color:#e2e8f0;padding:6px 0;border-bottom:1px solid #21262d;">${t}</div>`).join('')}
</div>` : ''}

<!-- CTA -->
<div style="text-align:center;margin-bottom:20px;">
  <a href="https://familywealthlab.net" style="display:inline-block;background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;font-weight:700;font-size:14px;padding:14px 32px;border-radius:10px;text-decoration:none;">Open Family Wealth Lab →</a>
</div>

<!-- Footer -->
<div style="text-align:center;font-size:11px;color:#484f58;">
  Family Wealth Lab · Automated Saturday Morning CFO Bulletin<br>
  <a href="https://familywealthlab.net/settings" style="color:#58a6ff;">Manage delivery settings</a>
</div>

</div></body></html>`;

  return { subject, html };
}

// ─── Schedule / dedup guards ──────────────────────────────────────────────────

export async function cfoAlreadyRanThisWeek(): Promise<boolean> {
  const settings = await getCFOSettings();
  if (!settings.last_run_at) return false;
  const msSince = Date.now() - new Date(settings.last_run_at).getTime();
  return msSince < 6 * 24 * 60 * 60 * 1000;
}

export function isCFOScheduleTime(deliveryDay: string, deliveryTime: string): boolean {
  const now      = new Date();
  const brisbane = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Brisbane' }));
  const day      = brisbane.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Australia/Brisbane' });
  const [targetH, targetM] = deliveryTime.split(':').map(Number);
  const nowMins    = brisbane.getHours() * 60 + brisbane.getMinutes();
  const targetMins = targetH * 60 + targetM;
  return day === deliveryDay && nowMins >= targetMins && nowMins < targetMins + 45;
}

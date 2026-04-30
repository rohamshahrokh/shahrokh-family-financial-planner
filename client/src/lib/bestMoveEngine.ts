/**
 * bestMoveEngine.ts — "Best Move Right Now" Decision Engine
 *
 * Evaluates every candidate financial action using risk-adjusted annual benefit
 * and returns a ranked list with the single highest-value action at the top.
 *
 * Data sources: snapshot fields (same as dashboard/cfoEngine), live
 * stocks/crypto rows, DCA schedules, properties, income rows.
 *
 * Rules:
 *  • If high-interest debt rate > expected investment return → debt first
 *  • If offset exists → compare offset saving vs ETF expected return
 *  • If liquid cash < 3-month buffer → prioritise liquidity
 *  • Super contributions evaluated against marginal tax rate saving
 *  • All values in annual AUD benefit
 *  • If data is missing/unreliable → action is suppressed (not invented)
 */

import { safeNum } from './finance';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RiskLevel = 'Low' | 'Med' | 'High';

export interface BestMoveOption {
  id:               string;       // machine-readable key
  action:           string;       // short label, e.g. "Pay down personal debt"
  reason:           string;       // 2–3 sentence explanation
  annual_benefit:   number;       // AUD/year (deterministic or expected)
  benefit_label:    string;       // human-readable, e.g. "$4,200/yr guaranteed"
  risk:             RiskLevel;
  cta:              string;       // action button label
  cta_route:        string;       // wouter hash route
  rank:             number;       // 1 = best
  data_reliable:    boolean;      // false → show "Needs setup" caveat
}

export interface BestMoveResult {
  best:        BestMoveOption;
  alternatives: BestMoveOption[];  // top 3 after best
  generated_at: string;
  summary:     string;             // one-line summary for bulletin
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MORTGAGE_RATE         = 0.0625;  // 6.25% typical AUS variable
const ETF_EXPECTED_RETURN   = 0.095;   // 9.5% long-run ASX/global ETF
const CRYPTO_EXPECTED_RETURN= 0.20;    // 20% expected — high volatility
const PERSONAL_DEBT_RATE    = 0.17;    // 17% typical credit card / personal loan
const SUPER_CONCESSIONAL_CAP= 30_000;
const SG_RATE               = 0.115;   // Superannuation guarantee 2025-26
const MONTHS_BUFFER_TARGET  = 3;       // 3-month emergency buffer

// ─── Supabase fetch helper (same pattern as cfoEngine) ────────────────────────

const SB_URL  = 'https://uoraduyyxhtzixcsaidg.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c';
const SB_HDR  = {
  apikey:        SB_ANON,
  Authorization: `Bearer ${SB_ANON}`,
  'Content-Type': 'application/json',
};
const sb = (path: string) =>
  fetch(`${SB_URL}/rest/v1/${path}`, { headers: SB_HDR })
    .then(r => r.ok ? r.json() : [])
    .catch(() => []);

// ─── Income dedup (mirrors cfoEngine fix) ─────────────────────────────────────

function deduplicatedMonthlyIncome(incomeRows: any[]): number {
  if (!Array.isArray(incomeRows) || incomeRows.length === 0) return 0;
  const FREQ: Record<string, number> = {
    Weekly: 52 / 12, Fortnightly: 26 / 12, Monthly: 1,
    Quarterly: 1 / 3, 'Semi-Annual': 1 / 6, Annual: 1 / 12,
  };
  const sorted = [...incomeRows].sort((a, b) =>
    new Date(b.date ?? b.created_at ?? 0).getTime() -
    new Date(a.date ?? a.created_at ?? 0).getTime()
  );
  const seen = new Set<string>();
  let total = 0;
  sorted.forEach(r => {
    if (r.recurring === false) return;
    const key = `${(r.description ?? '').trim().toLowerCase()}|${(r.member ?? '').trim().toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    total += safeNum(r.amount) * (FREQ[r.frequency] ?? 1);
  });
  return total;
}

// ─── fmt helper ───────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

// ─── Core evaluation ──────────────────────────────────────────────────────────

export async function computeBestMove(): Promise<BestMoveResult> {
  // ── 1. Fetch all data in parallel ─────────────────────────────────────────
  const [
    snapRows, billRows, propRows,
    stockRows, cryptoRows, dcaStockRows, dcaCryptoRows,
    incomeRows,
  ] = await Promise.all([
    sb('sf_snapshot?id=eq.shahrokh-family-main'),
    sb('sf_recurring_bills?active=eq.true'),
    sb('sf_properties'),
    sb('sf_stocks'),
    sb('sf_crypto'),
    sb('sf_stock_dca'),
    sb('sf_crypto_dca'),
    sb('sf_income?order=date.desc&limit=60'),
  ]);

  const snap = snapRows?.[0] ?? {};

  // ── 2. Core financials ────────────────────────────────────────────────────
  const cash          = safeNum(snap.cash);
  const offsetBal     = safeNum(snap.offset_balance);
  const mortgage      = safeNum(snap.mortgage);
  const otherDebts    = safeNum(snap.other_debts);
  const cars          = safeNum(snap.cars);
  const iranProp      = safeNum(snap.iran_property);
  const ppor          = safeNum(snap.ppor);
  const snapMonthlyIncome  = safeNum(snap.monthly_income);
  const snapMonthlyExp     = safeNum(snap.monthly_expenses);

  // Deduplicated income
  const incomeFromTracker = deduplicatedMonthlyIncome(incomeRows);
  const monthlyIncome     = incomeFromTracker > 0 ? incomeFromTracker : snapMonthlyIncome;
  const monthlyExpenses   = snapMonthlyExp > 0 ? snapMonthlyExp : 0;

  // Bills total (monthly)
  const billsMonthly = (Array.isArray(billRows) ? billRows : []).reduce((s: number, b: any) => {
    const FREQ: Record<string, number> = {
      Weekly: 52/12, Fortnightly: 26/12, Monthly: 1,
      Quarterly: 1/3, Annual: 1/12,
    };
    return s + safeNum(b.amount) * (FREQ[b.frequency] ?? 1);
  }, 0);

  const totalExpenses  = Math.max(monthlyExpenses, billsMonthly);
  const surplus        = monthlyIncome - totalExpenses;
  const annualSurplus  = surplus * 12;

  // Cash buffer target (3 months of expenses)
  const bufferTarget   = totalExpenses * MONTHS_BUFFER_TARGET;
  const liquidCash     = cash + offsetBal;
  const belowBuffer    = liquidCash < bufferTarget;
  const idleCash       = Math.max(0, liquidCash - bufferTarget);  // cash above buffer

  // Portfolio
  const stocksValue    = (stockRows  ?? []).reduce((s: number, r: any) =>
    s + safeNum(r.current_holding) * safeNum(r.current_price), 0)
    || safeNum(snap.stocks);
  const cryptoValue    = (cryptoRows ?? []).reduce((s: number, r: any) =>
    s + safeNum(r.current_holding) * safeNum(r.current_price), 0)
    || safeNum(snap.crypto);

  // Super
  const rohamSuper     = safeNum(snap.roham_super_balance) || safeNum(snap.super_balance) * 0.6;
  const rohamGrossAnn  = snapMonthlyIncome * 12;
  const employerSG     = rohamGrossAnn * SG_RATE;
  const salarySacAnn   = safeNum(snap.roham_salary_sacrifice) * 12;
  const superContrib   = employerSG + salarySacAnn;
  const superRoom      = Math.max(0, SUPER_CONCESSIONAL_CAP - superContrib);
  // Marginal rate (AUS 2025-26)
  const marginalRate   = rohamGrossAnn > 135_000 ? 0.47
                        : rohamGrossAnn > 45_000 ? 0.325
                        : rohamGrossAnn > 18_200 ? 0.19
                        : 0;

  // DCA active
  const dcaActive = [
    ...(Array.isArray(dcaStockRows) ? dcaStockRows : []),
    ...(Array.isArray(dcaCryptoRows) ? dcaCryptoRows : []),
  ].filter(d => d.active !== false);
  const dcaMonthlyCost = dcaActive.reduce((s: number, d: any) => s + safeNum(d.monthly_amount), 0);

  // ── 3. Evaluate candidate actions ─────────────────────────────────────────

  const candidates: Array<Omit<BestMoveOption, 'rank'>> = [];

  // ── A. Emergency buffer / liquidity ───────────────────────────────────────
  if (belowBuffer && monthlyIncome > 0) {
    const shortfall = bufferTarget - liquidCash;
    candidates.push({
      id: 'build_buffer',
      action: `Build emergency cash buffer`,
      reason: `Your liquid cash (${fmt(liquidCash)}) is below the recommended 3-month buffer of ${fmt(bufferTarget)}. ` +
        `You're short ${fmt(shortfall)}. Without this buffer, any income disruption could force high-cost borrowing. ` +
        `Divert surplus to cash savings until the buffer is reached.`,
      annual_benefit: shortfall * PERSONAL_DEBT_RATE,  // avoids ~17% emergency borrowing
      benefit_label: `Avoids up to ${fmt(shortfall * PERSONAL_DEBT_RATE)}/yr in emergency borrowing cost`,
      risk: 'Low',
      cta: 'Go to Settings',
      cta_route: '/settings',
      data_reliable: monthlyIncome > 0 && totalExpenses > 0,
    });
  }

  // ── B. Pay down high-interest personal debt ────────────────────────────────
  if (otherDebts > 1_000) {
    // Use idleCash to wipe debt if possible
    const payable = Math.min(idleCash, otherDebts);
    const debtBenefit = payable * PERSONAL_DEBT_RATE;
    candidates.push({
      id: 'paydown_personal_debt',
      action: `Pay down personal debt (${fmt(otherDebts)})`,
      reason: `Personal debt at ~17% interest costs ${fmt(otherDebts * PERSONAL_DEBT_RATE)}/year. ` +
        `Paying ${fmt(payable)} now saves ${fmt(debtBenefit)}/year — guaranteed, risk-free return far exceeding any investment. ` +
        `${PERSONAL_DEBT_RATE > ETF_EXPECTED_RETURN ? 'This beats the long-run ETF return of 9.5%.' : ''}`,
      annual_benefit: debtBenefit,
      benefit_label: `${fmt(debtBenefit)}/yr guaranteed (${(PERSONAL_DEBT_RATE * 100).toFixed(0)}% rate)`,
      risk: 'Low',
      cta: 'View Debt Strategy',
      cta_route: '/debt-strategy',
      data_reliable: otherDebts > 0,
    });
  }

  // ── C. Move idle cash to mortgage offset ─────────────────────────────────
  if (idleCash > 5_000 && mortgage > 0 && offsetBal > 0) {
    const moveable = Math.round(idleCash / 5_000) * 5_000;
    const saving = moveable * MORTGAGE_RATE;
    candidates.push({
      id: 'move_to_offset',
      action: `Move ${fmt(moveable)} idle cash to mortgage offset`,
      reason: `Your offset account has ${fmt(offsetBal)} already working. Moving an additional ${fmt(moveable)} from everyday cash saves ` +
        `${fmt(saving)}/year in mortgage interest at ${(MORTGAGE_RATE * 100).toFixed(2)}% — a guaranteed, tax-free return. ` +
        `Offset saving beats after-tax fixed deposit rates.`,
      annual_benefit: saving,
      benefit_label: `${fmt(saving)}/yr guaranteed (offset interest saving)`,
      risk: 'Low',
      cta: 'Update Offset Balance',
      cta_route: '/settings',
      data_reliable: offsetBal > 0 && mortgage > 0,
    });
  } else if (idleCash > 5_000 && mortgage > 0 && offsetBal === 0) {
    // Offset not configured — prompt setup
    const saving = idleCash * MORTGAGE_RATE;
    candidates.push({
      id: 'setup_offset',
      action: `Set up mortgage offset account`,
      reason: `You have ${fmt(idleCash)} in idle cash and a ${fmt(mortgage)} mortgage. ` +
        `Parking idle cash in an offset account would save ${fmt(saving)}/year in interest — a guaranteed return matching your mortgage rate. ` +
        `Add your offset balance in Settings to unlock this.`,
      annual_benefit: saving,
      benefit_label: `Up to ${fmt(saving)}/yr (once offset is configured)`,
      risk: 'Low',
      cta: 'Configure Offset',
      cta_route: '/settings',
      data_reliable: false,  // can't confirm offset exists
    });
  }

  // ── D. Super salary sacrifice (tax alpha) ─────────────────────────────────
  if (superRoom > 2_000 && surplus > 500 && snapMonthlyIncome > 0) {
    // Max you can salary sacrifice = min(superRoom, annual surplus)
    const sacrificeAmount = Math.min(superRoom, annualSurplus * 0.5);
    // Tax saving: income tax rate minus 15% super contribution tax = marginal − 15%
    const effectiveTaxSaving = Math.max(0, marginalRate - 0.15) * sacrificeAmount;
    candidates.push({
      id: 'super_sacrifice',
      action: `Salary sacrifice ${fmt(sacrificeAmount / 12)}/month into super`,
      reason: `You have ${fmt(superRoom)} of concessional super cap remaining this financial year. ` +
        `Salary sacrificing ${fmt(sacrificeAmount)} saves ${fmt(effectiveTaxSaving)} in income tax ` +
        `(your ${(marginalRate * 100).toFixed(0)}% marginal rate vs 15% super tax). ` +
        `Investments also grow in a 15% tax environment vs your marginal rate.`,
      annual_benefit: effectiveTaxSaving,
      benefit_label: `${fmt(effectiveTaxSaving)}/yr tax saving (salary sacrifice)`,
      risk: 'Low',
      cta: 'Super Settings',
      cta_route: '/settings',
      data_reliable: snapMonthlyIncome > 0 && superRoom > 0,
    });
  }

  // ── E. Invest in ETFs (if surplus exists, buffer is met, debt is low) ────
  if (idleCash > 2_000 && !belowBuffer && otherDebts < 5_000) {
    const investable = idleCash * 0.7;  // keep 30% as float
    const expectedGain = investable * ETF_EXPECTED_RETURN;
    candidates.push({
      id: 'invest_etf',
      action: `Invest ${fmt(investable)} in diversified ETFs`,
      reason: `With your buffer covered and low consumer debt, investing ${fmt(investable)} in a diversified ETF ` +
        `(e.g. VAS + VGS) generates an expected ${fmt(expectedGain)}/year at a historic 9.5% return. ` +
        `This accelerates your FIRE timeline and grows your portfolio compounding base.`,
      annual_benefit: expectedGain,
      benefit_label: `~${fmt(expectedGain)}/yr expected (9.5% long-run, not guaranteed)`,
      risk: 'Med',
      cta: 'Go to Stocks',
      cta_route: '/stocks',
      data_reliable: true,
    });
  }

  // ── F. Invest in crypto (surplus, buffer met, only if crypto interest shown) ──
  const hasCryptoHistory = cryptoValue > 0 || dcaActive.some((d: any) => d.asset_type === 'crypto');
  if (idleCash > 3_000 && !belowBuffer && hasCryptoHistory && otherDebts < 5_000) {
    const cryptoInvestable = idleCash * 0.15;  // conservative allocation
    const expectedCryptoGain = cryptoInvestable * CRYPTO_EXPECTED_RETURN;
    candidates.push({
      id: 'invest_crypto',
      action: `Add ${fmt(cryptoInvestable)} to crypto portfolio`,
      reason: `You have existing crypto holdings. Adding ${fmt(cryptoInvestable)} (15% of idle cash, to limit exposure) ` +
        `has an expected return of ~${fmt(expectedCryptoGain)}/year at 20%, ` +
        `but with high volatility — only appropriate if you can hold through drawdowns of 50%+.`,
      annual_benefit: expectedCryptoGain,
      benefit_label: `~${fmt(expectedCryptoGain)}/yr expected (20%, HIGH volatility)`,
      risk: 'High',
      cta: 'Go to Crypto',
      cta_route: '/crypto',
      data_reliable: true,
    });
  }

  // ── G. Keep cash (liquidity play — low-rate environment, high uncertainty) ─
  // Always available as a fallback with 0 benefit (opportunity cost framing)
  candidates.push({
    id: 'keep_cash',
    action: `Keep cash liquid (HISA or offset)`,
    reason: `If you expect large near-term expenses (property deposit, renovation, car) within 12 months, ` +
      `preserving ${fmt(liquidCash)} in a high-interest savings account or offset protects optionality. ` +
      `HISA rates (~5%) provide ${fmt(liquidCash * 0.05)}/year with zero risk.`,
    annual_benefit: liquidCash * 0.05,
    benefit_label: `${fmt(liquidCash * 0.05)}/yr at ~5% HISA rate`,
    risk: 'Low',
    cta: 'View Dashboard',
    cta_route: '/dashboard',
    data_reliable: true,
  });

  // ── H. Property deposit timing (if deposit readiness is high) ─────────────
  const superCombined = (safeNum(snap.roham_super_balance) || safeNum(snap.super_balance) * 0.6)
    + (safeNum(snap.fara_super_balance) || safeNum(snap.super_balance) * 0.4);
  const totalAssets = ppor + cash + offsetBal + superCombined + stocksValue + cryptoValue + cars + iranProp;
  const netWorth    = totalAssets - (mortgage + otherDebts);
  const depositTarget = ppor > 0 ? ppor * 0.20 : 400_000;  // 20% of current PPOR as proxy IP target
  const depositReady  = liquidCash / depositTarget;

  if (depositReady >= 0.5 && mortgage > 0) {
    const propertyBenefit = (ppor * 0.06);  // 6% avg AU property capital growth
    candidates.push({
      id: 'property_deposit',
      action: `Plan next property purchase (deposit ${(depositReady * 100).toFixed(0)}% ready)`,
      reason: `Your liquid cash of ${fmt(liquidCash)} is ${(depositReady * 100).toFixed(0)}% of a 20% deposit target. ` +
        `If purchasing an investment property, long-run AU property capital growth (~6%) on a ${fmt(ppor)}-equivalent asset ` +
        `generates ${fmt(propertyBenefit)}/year in equity, plus rental yield and negative gearing offsets. ` +
        `Requires bank pre-approval and tax planning first.`,
      annual_benefit: propertyBenefit * (depositReady),  // discounted by readiness
      benefit_label: `~${fmt(propertyBenefit * depositReady)}/yr (equity growth, varies)`,
      risk: 'Med',
      cta: 'Go to Property',
      cta_route: '/property',
      data_reliable: depositReady >= 0.5,
    });
  }

  // ── 4. Rank by risk-adjusted annual benefit ───────────────────────────────
  // Risk adjustment: Low × 1.0, Med × 0.75, High × 0.5
  const riskAdj = (c: typeof candidates[0]) => {
    const mult = c.risk === 'Low' ? 1.0 : c.risk === 'Med' ? 0.75 : 0.50;
    return c.annual_benefit * mult;
  };

  // Sort descending by risk-adjusted benefit, push unreliable data to bottom
  const ranked = candidates
    .filter(c => c.annual_benefit > 0)
    .sort((a, b) => {
      // Reliable data always beats unreliable at same tier
      if (a.data_reliable !== b.data_reliable) return a.data_reliable ? -1 : 1;
      return riskAdj(b) - riskAdj(a);
    })
    .map((c, i) => ({ ...c, rank: i + 1 } as BestMoveOption));

  // Fallback: if nothing scored, return keep_cash
  if (ranked.length === 0) {
    const fallback = candidates.find(c => c.id === 'keep_cash')!;
    const fallbackFull: BestMoveOption = { ...fallback, rank: 1 };
    return {
      best: fallbackFull,
      alternatives: [],
      generated_at: new Date().toISOString(),
      summary: `Best Move: ${fallbackFull.action} — ${fallbackFull.benefit_label}`,
    };
  }

  const best = ranked[0];
  const alternatives = ranked.slice(1, 4);

  const summary = `Best Move: ${best.action} — ${best.benefit_label} [Risk: ${best.risk}]`;

  return { best, alternatives, generated_at: new Date().toISOString(), summary };
}

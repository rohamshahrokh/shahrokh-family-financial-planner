/**
 * incomeClassificationEngine.ts — canonical income type / behaviour / treatment
 * classifier used by every downstream engine that consumes household income.
 *
 * Why this file exists
 * --------------------
 * The Income Tracker (sf_income ledger) historically averaged ALL records over
 * a trailing window to produce `monthlyIncome`. That treated a one-off $80k
 * crypto sale, a tax refund, an inheritance, or a one-off bonus as if it were
 * recurring salary, permanently inflating:
 *   • Forecast Engine projections
 *   • Monte Carlo projections
 *   • Deposit Power / Affordability / Serviceability
 *   • Dashboard "Monthly Income" KPI
 *
 * The fix: every income record is now classified by
 *   (a) Income Type      (Employment Salary, Rental, Dividend, Tax Refund, …)
 *   (b) Income Behaviour (Recurring / One-Off)
 *   (c) Forecast Treatment (Include in recurring / Exclude from recurring)
 * and engines route through `aggregateIncome(records, todayIso)` which returns
 * a recurringMonthlyIncome figure with one-off events fully excluded.
 *
 * Data shape
 * ----------
 * sf_income is a flexible JSON-backed table on Supabase, so this refactor
 * does NOT introduce a schema migration. Records may carry:
 *   - record.income_type       (canonical IncomeType)  ← new
 *   - record.behaviour         (Recurring | One-Off)   ← new
 *   - record.forecast_treatment(include | exclude)     ← new
 *   - record.source            (legacy "Salary" / "Bonus" / …)
 *   - record.frequency         (Monthly | Annual | One-off | …)
 *   - record.recurring         (legacy boolean)
 *   - record.amount, record.date
 *
 * When the new fields are missing we infer them from legacy fields using
 * conservative defaults that match the user-requested rules.
 *
 * Rules
 * -----
 * Recurring (counted in recurringMonthlyIncome):
 *   Employment Salary, Rental Income, Dividend Income, Interest Income,
 *   Business Income, Other (only if user marks recurring).
 *
 * One-Off (NEVER counted in recurringMonthlyIncome; cash event only):
 *   Employment Bonus (default), Tax Refund, Asset Sale, Gift / Inheritance,
 *   Other (default), and any record explicitly marked behaviour=One-Off or
 *   forecast_treatment=exclude.
 *
 * Critical invariant
 * ------------------
 * A $80k one-off event added to sf_income increases cash in its event month
 * only and MUST NOT mutate recurringMonthlyIncome. This is enforced by the
 * regression test in script/test-income-classification.ts.
 */

export type IncomeType =
  | 'employment_salary'
  | 'employment_bonus'
  | 'rental_income'
  | 'dividend_income'
  | 'interest_income'
  | 'tax_refund'
  | 'business_income'
  | 'asset_sale'
  | 'gift_inheritance'
  | 'other';

export type IncomeBehaviour = 'recurring' | 'one_off';

/** Whether this record contributes to recurringMonthlyIncome. */
export type ForecastTreatment = 'include' | 'exclude';

/** Display labels for the new selects (Income Tracker UI). */
export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  employment_salary: 'Employment Salary',
  employment_bonus:  'Employment Bonus',
  rental_income:     'Rental Income',
  dividend_income:   'Dividend Income',
  interest_income:   'Interest Income',
  tax_refund:        'Tax Refund',
  business_income:   'Business Income',
  asset_sale:        'Asset Sale',
  gift_inheritance:  'Gift / Inheritance',
  other:             'Other',
};

export const INCOME_BEHAVIOUR_LABELS: Record<IncomeBehaviour, string> = {
  recurring: 'Recurring',
  one_off:   'One-Off',
};

export const FORECAST_TREATMENT_LABELS: Record<ForecastTreatment, string> = {
  include: 'Include in recurring income calculations',
  exclude: 'Exclude from recurring income calculations',
};

/** Default behaviour by type. */
const DEFAULT_BEHAVIOUR: Record<IncomeType, IncomeBehaviour> = {
  employment_salary: 'recurring',
  employment_bonus:  'one_off',
  rental_income:     'recurring',
  dividend_income:   'recurring',
  interest_income:   'recurring',
  tax_refund:        'one_off',
  business_income:   'recurring',
  asset_sale:        'one_off',
  gift_inheritance:  'one_off',
  other:             'one_off', // safe default — user must opt-in to recurring
};

/** Default forecast treatment by type — mirrors behaviour. */
const DEFAULT_TREATMENT: Record<IncomeType, ForecastTreatment> = {
  employment_salary: 'include',
  employment_bonus:  'exclude',
  rental_income:     'include',
  dividend_income:   'include',
  interest_income:   'include',
  tax_refund:        'exclude',
  business_income:   'include',
  asset_sale:        'exclude',
  gift_inheritance:  'exclude',
  other:             'exclude',
};

/** Lower-case legacy "source" string → canonical IncomeType. */
const LEGACY_SOURCE_MAP: Record<string, IncomeType> = {
  'salary':        'employment_salary',
  'wages':         'employment_salary',
  'paye':          'employment_salary',
  'bonus':         'employment_bonus',
  'employment bonus': 'employment_bonus',
  'rental income': 'rental_income',
  'rent':          'rental_income',
  'rental':        'rental_income',
  'dividends':     'dividend_income',
  'dividend':      'dividend_income',
  'dividend income': 'dividend_income',
  'interest':      'interest_income',
  'interest income': 'interest_income',
  'tax refund':    'tax_refund',
  'refund':        'tax_refund',
  'business':      'business_income',
  'business income': 'business_income',
  'side income':   'other',
  'asset sale':    'asset_sale',
  'crypto sale':   'asset_sale',
  'sale':          'asset_sale',
  'gift':          'gift_inheritance',
  'inheritance':   'gift_inheritance',
  'gift / inheritance': 'gift_inheritance',
  'other':         'other',
};

/** Frequency multipliers for monthly equivalence. One-off → 0. */
const FREQ_MULTIPLIER: Record<string, number> = {
  'weekly':      52 / 12,
  'fortnightly': 26 / 12,
  'monthly':     1,
  'quarterly':   4 / 12,
  'annual':      1 / 12,
  'yearly':      1 / 12,
  'one-off':     0,
  'oneoff':      0,
  'one_off':     0,
};

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

/**
 * A classified income record — the same shape as the raw sf_income row, with
 * the canonical type/behaviour/treatment fields resolved. Engines should
 * consume this rather than the raw row.
 */
export interface ClassifiedIncomeRecord {
  id: number | string | undefined;
  date: string;
  amount: number;
  description: string;
  member: string;
  /** Raw underlying source label (legacy) — preserved for display. */
  sourceLabel: string;
  /** Frequency as entered by the user (Weekly|Monthly|…|One-off). */
  frequency: string;
  /** Canonical income type. */
  incomeType: IncomeType;
  /** Recurring vs one-off behaviour. */
  behaviour: IncomeBehaviour;
  /** Whether this record is INCLUDED in recurringMonthlyIncome. */
  forecastTreatment: ForecastTreatment;
  /** Why the classification fell where it did — useful in audit trace. */
  classificationReason: string;
  /** Monthly equivalent of `amount` given `frequency`. 0 for one-off records. */
  monthlyEquivalent: number;
  /** The raw record (for downstream debugging only — do not consume in engines). */
  raw: any;
}

/**
 * Classify a single record. Robust to missing/legacy fields.
 */
export function classifyIncomeRecord(rec: any): ClassifiedIncomeRecord {
  const sourceLabel = String(rec?.source ?? rec?.income_type ?? '').trim();
  const frequencyRaw = String(rec?.frequency ?? '').trim();
  const frequencyKey = frequencyRaw.toLowerCase();
  const amount = num(rec?.amount);

  // 1. Resolve income type
  //
  // Legacy back-compat: rows that pre-date the income engine refactor have
  // NO `income_type` and NO `source` field. The Income Tracker previously
  // defaulted such rows to "Salary", so we adopt the same default here —
  // otherwise every historical sf_income row would be reclassified as
  // one-off "other" and silently disappear from recurringMonthlyIncome.
  let incomeType: IncomeType = 'employment_salary';
  let reasonParts: string[] = [];
  let typeResolved = false;
  if (rec?.income_type && typeof rec.income_type === 'string') {
    const key = rec.income_type.toLowerCase();
    if (LEGACY_SOURCE_MAP[key]) {
      incomeType = LEGACY_SOURCE_MAP[key];
      reasonParts.push(`income_type='${rec.income_type}'`);
      typeResolved = true;
    } else if ((Object.keys(INCOME_TYPE_LABELS) as IncomeType[]).includes(key as IncomeType)) {
      incomeType = key as IncomeType;
      reasonParts.push(`income_type='${key}'`);
      typeResolved = true;
    }
  }
  if (!typeResolved && sourceLabel) {
    const key = sourceLabel.toLowerCase();
    if (LEGACY_SOURCE_MAP[key]) {
      incomeType = LEGACY_SOURCE_MAP[key];
      reasonParts.push(`legacy source='${sourceLabel}'`);
      typeResolved = true;
    } else {
      incomeType = 'other';
      reasonParts.push(`unknown source='${sourceLabel}' → other`);
      typeResolved = true;
    }
  }
  if (!typeResolved) {
    // No income_type AND no source — legacy row; default to employment_salary.
    reasonParts.push('legacy row (no source/type) → employment_salary');
  }

  // 2. Resolve behaviour (explicit user input > frequency hint > type default)
  let behaviour: IncomeBehaviour = DEFAULT_BEHAVIOUR[incomeType];
  if (rec?.behaviour === 'recurring' || rec?.behaviour === 'one_off') {
    behaviour = rec.behaviour;
    reasonParts.push(`behaviour='${rec.behaviour}' (explicit)`);
  } else if (frequencyKey && (frequencyKey === 'one-off' || frequencyKey === 'oneoff' || frequencyKey === 'one_off')) {
    behaviour = 'one_off';
    reasonParts.push(`frequency='${frequencyRaw}' → one_off`);
  } else if (rec?.recurring === false && behaviour === 'recurring') {
    // Legacy boolean override: user explicitly toggled recurring off.
    behaviour = 'one_off';
    reasonParts.push(`recurring=false → one_off`);
  } else if (rec?.recurring === true && behaviour === 'one_off') {
    // User explicitly marked an "other"/"bonus" as recurring — honour it.
    behaviour = 'recurring';
    reasonParts.push(`recurring=true → recurring`);
  } else {
    reasonParts.push(`behaviour default for ${incomeType} = ${behaviour}`);
  }

  // 3. Resolve forecast treatment (explicit > behaviour-aligned default)
  let forecastTreatment: ForecastTreatment;
  if (rec?.forecast_treatment === 'include' || rec?.forecast_treatment === 'exclude') {
    forecastTreatment = rec.forecast_treatment;
    reasonParts.push(`forecast_treatment='${rec.forecast_treatment}' (explicit)`);
  } else {
    // Treatment follows behaviour: recurring → include, one-off → exclude.
    forecastTreatment = behaviour === 'recurring' ? 'include' : 'exclude';
    reasonParts.push(`treatment follows behaviour → ${forecastTreatment}`);
  }

  // 4. Monthly equivalent
  let monthlyEquivalent = 0;
  if (behaviour === 'recurring') {
    const m = FREQ_MULTIPLIER[frequencyKey];
    monthlyEquivalent = amount * (m === undefined ? 1 : m); // default monthly when frequency unknown
  }
  // One-off records always have monthlyEquivalent = 0; their amount remains
  // available via `amount` for cash-event treatment in the event month.

  return {
    id: rec?.id,
    date: String(rec?.date ?? ''),
    amount,
    description: String(rec?.description ?? rec?.notes ?? ''),
    member: String(rec?.member ?? rec?.family_member ?? 'Family'),
    sourceLabel: sourceLabel || INCOME_TYPE_LABELS[incomeType],
    frequency: frequencyRaw || (behaviour === 'recurring' ? 'Monthly' : 'One-off'),
    incomeType,
    behaviour,
    forecastTreatment,
    classificationReason: reasonParts.join('; '),
    monthlyEquivalent,
    raw: rec,
  };
}

/**
 * Aggregated income across a list of records.
 *
 * Engines should read `recurringMonthlyIncome` for any forward-looking
 * projection. `oneOffIncomeLast12Months` is exposed for the dashboard "One-Off
 * income (last 12 months)" card and for cash-event handling. `totalHistorical`
 * is the raw sum of every record (used only for the historical KPI).
 */
export interface AggregatedIncome {
  /** Sum of monthlyEquivalent across RECURRING + INCLUDED records. */
  recurringMonthlyIncome: number;
  /** Sum of ONE-OFF records dated within trailing 12 months of `todayIso`. */
  oneOffIncomeLast12Months: number;
  /** Sum of ALL records (historical). */
  totalHistoricalIncome: number;
  /** Classified records — recurring + included. */
  recurringRecords: ClassifiedIncomeRecord[];
  /** Classified records — one-off OR excluded from forecast. */
  excludedOneOffEvents: ClassifiedIncomeRecord[];
  /** Engine inputs — all equal to recurringMonthlyIncome by default; can be
      independently overridden by callers who explicitly enable inclusion. */
  engineInputs: {
    forecastIncomeUsed: number;
    monteCarloIncomeUsed: number;
    serviceabilityIncomeUsed: number;
  };
}

const EMPTY_AGGREGATE: AggregatedIncome = {
  recurringMonthlyIncome: 0,
  oneOffIncomeLast12Months: 0,
  totalHistoricalIncome: 0,
  recurringRecords: [],
  excludedOneOffEvents: [],
  engineInputs: {
    forecastIncomeUsed: 0,
    monteCarloIncomeUsed: 0,
    serviceabilityIncomeUsed: 0,
  },
};

/**
 * Aggregate a list of income records into the canonical breakdown.
 *
 * Approach for `recurringMonthlyIncome`:
 *   1. Classify every record.
 *   2. Partition into recurring (treatment=include) vs excluded one-off.
 *   3. For RECURRING records:
 *      a. If at least one is dated within the trailing 6-month window AND has
 *         a known frequency (Weekly/Monthly/etc), we use the
 *         monthlyEquivalent sum across the latest record per (type, member)
 *         group — this is the canonical "what is my current recurring income"
 *         view and is robust to multiple monthly salary rows in the window.
 *      b. Otherwise we fall back to the trailing-6-month average of the
 *         recurring amounts (the previous behaviour, but now restricted to
 *         recurring-only). This handles the case where each monthly pay row
 *         was entered without an explicit frequency.
 *
 * `oneOffIncomeLast12Months` sums every excluded one-off record dated within
 * the trailing 12 months of `todayIso`.
 */
export function aggregateIncome(
  rows: any[] | undefined,
  todayIso?: string,
): AggregatedIncome {
  if (!Array.isArray(rows) || rows.length === 0) return { ...EMPTY_AGGREGATE };

  const today = todayIso ?? new Date().toISOString().split('T')[0];
  const todayDate = new Date(today);
  const cutoff6mo = new Date(todayDate); cutoff6mo.setMonth(cutoff6mo.getMonth() - 6);
  const cutoff12mo = new Date(todayDate); cutoff12mo.setMonth(cutoff12mo.getMonth() - 12);
  const cutoff6moIso = cutoff6mo.toISOString().split('T')[0];
  const cutoff12moIso = cutoff12mo.toISOString().split('T')[0];

  const classified = rows.map(classifyIncomeRecord);
  const recurringRecords = classified.filter(r => r.forecastTreatment === 'include');
  const excludedOneOffEvents = classified.filter(r => r.forecastTreatment === 'exclude');

  // ── Recurring monthly income ──────────────────────────────────────────────
  // Strategy A: use monthlyEquivalent of latest record per (type, member) when
  // any recurring record carries a usable frequency.
  const hasExplicitFrequency = recurringRecords.some(
    r => r.frequency && !['', 'one-off', 'oneoff'].includes(r.frequency.toLowerCase())
       && r.monthlyEquivalent > 0
  );

  let recurringMonthlyIncome = 0;
  if (hasExplicitFrequency) {
    // Latest record per (incomeType, member) — use its monthlyEquivalent.
    const latest = new Map<string, ClassifiedIncomeRecord>();
    for (const r of recurringRecords) {
      if (r.monthlyEquivalent <= 0) continue;
      const key = `${r.incomeType}::${r.member}`;
      const existing = latest.get(key);
      if (!existing || r.date > existing.date) latest.set(key, r);
    }
    latest.forEach(r => { recurringMonthlyIncome += r.monthlyEquivalent; });
  } else {
    // Strategy B: trailing 6mo average of recurring records only.
    let total6mo = 0;
    let countedMonths = 0;
    const monthsSeen = new Set<string>();
    for (const r of recurringRecords) {
      if (!r.date || r.date < cutoff6moIso) continue;
      total6mo += r.amount;
      monthsSeen.add(r.date.slice(0, 7));
    }
    countedMonths = Math.max(monthsSeen.size, 1);
    // Divide by the smaller of (months seen, 6) to avoid under-counting when
    // the window is sparsely populated.
    recurringMonthlyIncome = total6mo > 0
      ? total6mo / Math.min(6, Math.max(countedMonths, 1))
      : 0;
  }
  recurringMonthlyIncome = Math.round(recurringMonthlyIncome);

  // ── One-off income, last 12 months ───────────────────────────────────────
  let oneOffIncomeLast12Months = 0;
  for (const r of excludedOneOffEvents) {
    if (!r.date || r.date < cutoff12moIso) continue;
    oneOffIncomeLast12Months += r.amount;
  }
  oneOffIncomeLast12Months = Math.round(oneOffIncomeLast12Months);

  // ── Total historical income (every record) ───────────────────────────────
  const totalHistoricalIncome = Math.round(
    classified.reduce((s, r) => s + r.amount, 0)
  );

  return {
    recurringMonthlyIncome,
    oneOffIncomeLast12Months,
    totalHistoricalIncome,
    recurringRecords,
    excludedOneOffEvents,
    engineInputs: {
      forecastIncomeUsed:       recurringMonthlyIncome,
      monteCarloIncomeUsed:     recurringMonthlyIncome,
      serviceabilityIncomeUsed: recurringMonthlyIncome,
    },
  };
}

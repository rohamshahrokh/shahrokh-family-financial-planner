/**
 * Scenario Engine V2 — Determinism Foundation
 *
 * Three primitives that everything else depends on:
 *   1. canonicalJson(value)   — stable JSON with sorted keys (for hashing)
 *   2. snapshotHash(snapshot) — content hash of the snapshot subset that
 *                                feeds the engine
 *   3. makeRng(seed)          — Mulberry32 seeded RNG; identical seed →
 *                                identical sequence forever
 *
 * Rules:
 *   - No `Math.random()` inside V2 reducers. Use `makeRng(seed)`.
 *   - No `Date.now()` inside V2 reducers. Pass an explicit `now` if needed.
 */

// ─── Canonical JSON ──────────────────────────────────────────────────────────
/**
 * Stable JSON serialiser: object keys sorted lexicographically, arrays
 * preserved in source order, NaN/Infinity normalised to null. This is what
 * `snapshotHash` and idempotency keys hash over.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value));
}

function canonicalise(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(canonicalise);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>).sort()) {
    out[k] = canonicalise((v as Record<string, unknown>)[k]);
  }
  return out;
}

// ─── FNV-1a 32-bit hash (deterministic, no crypto, browser-safe) ─────────────
/** Hex hash of the canonical JSON representation of `value`. */
export function stableHash(value: unknown): string {
  const s = canonicalJson(value);
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // FNV prime mult, kept in unsigned 32-bit via Math.imul
    h = Math.imul(h, 0x01000193);
  }
  // 8-hex zero-padded
  return ("00000000" + (h >>> 0).toString(16)).slice(-8);
}

/**
 * Hash of the snapshot fields the V2 engine actually reads. Whitelisted —
 * extra columns on `sf_snapshot` (UI state, last-modified, etc.) do NOT
 * change the hash, so a result is only marked stale when something the
 * engine actually cares about changes.
 */
export function snapshotHash(snapshot: Record<string, unknown> | null | undefined): string {
  if (!snapshot) return "00000000";
  const keep: Record<string, unknown> = {};
  for (const k of SNAPSHOT_HASH_KEYS) {
    if (k in snapshot) keep[k] = snapshot[k];
  }
  return stableHash(keep);
}

/**
 * Snapshot columns the V2 engine reads. Edit ONLY when adding new
 * engine-relevant inputs; otherwise every existing scenario result would
 * be invalidated.
 */
export const SNAPSHOT_HASH_KEYS = [
  // identity & timing
  "owner_id",
  // cash & liquid
  "cash",
  "savings_cash",
  "emergency_cash",
  "other_cash",
  "offset_balance",
  // assets
  "ppor",
  "stocks",
  "crypto",
  "cars",
  "iran_property",
  "other_assets",
  // super
  "roham_super_balance",
  "fara_super_balance",
  "super_balance",
  // debt
  "mortgage",
  "mortgage_rate",
  "mortgage_term_years",
  "other_debts",
  // income / expenses
  "roham_monthly_income",
  "fara_monthly_income",
  "rental_income_total",
  "other_income",
  "monthly_income",
  "monthly_expenses",
  "expenses_includes_debt",
] as const;

// ─── Sprint 3B H-1 — Derived (material) inputs hash ──────────────────────────
/**
 * The snapshot hash above only covers the dashboard snapshot row. The audit
 * pack (Sprint 3A) flagged that properties, income/expense ledgers, stocks,
 * crypto, and lifecycle_status changes never invalidated cached scenario
 * results because they were outside the snapshot. This hash includes the
 * full set of *material* engine inputs: snapshot + derived sub-collections.
 *
 * Anything that changes the V2 (or any downstream) engine's output must
 * appear in this hash. Use `derivedInputsHash(inputs)` to test freshness
 * before serving a cached result.
 */
export interface DerivedHashInputs {
  snapshot?: Record<string, unknown> | null;
  properties?: any[] | null;
  stocks?: any[] | null;
  crypto?: any[] | null;
  income?: any[] | null;
  expenses?: any[] | null;
  bills?: any[] | null;
  debts?: any[] | null;
}

/**
 * Extract the material fields from a property row — lifecycle_status is
 * load-bearing per Sprint 3B C-1 (selectors filter on it).
 */
function propertyHashFields(p: any): Record<string, unknown> {
  return {
    id: p?.id,
    type: p?.type,
    lifecycle_status: p?.lifecycle_status,
    purchase_price: p?.purchase_price,
    current_value: p?.current_value,
    loan_amount: p?.loan_amount,
    interest_rate: p?.interest_rate,
    loan_type: p?.loan_type,
    loan_term: p?.loan_term,
    weekly_rent: p?.weekly_rent,
    rental_growth: p?.rental_growth,
    capital_growth: p?.capital_growth,
    purchase_date: p?.purchase_date,
    settlement_date: p?.settlement_date,
    rental_start_date: p?.rental_start_date,
    deposit: p?.deposit,
    stamp_duty: p?.stamp_duty,
    vacancy_rate: p?.vacancy_rate,
    management_fee: p?.management_fee,
    council_rates: p?.council_rates,
    insurance: p?.insurance,
    maintenance: p?.maintenance,
    land_tax: p?.land_tax,
    body_corporate: p?.body_corporate,
  };
}

function holdingHashFields(h: any): Record<string, unknown> {
  return {
    id: h?.id,
    ticker: h?.ticker ?? h?.symbol,
    current_holding: h?.current_holding,
    current_price: h?.current_price,
    current_value: h?.current_value,
    expected_return: h?.expected_return,
    monthly_dca: h?.monthly_dca,
    annual_lump_sum: h?.annual_lump_sum,
  };
}

function ledgerHashFields(row: any): Record<string, unknown> {
  return {
    id: row?.id,
    amount: row?.amount,
    frequency: row?.frequency,
    is_active: row?.is_active ?? row?.active,
    category: row?.category,
    start_date: row?.start_date,
    end_date: row?.end_date,
  };
}

function debtHashFields(row: any): Record<string, unknown> {
  return {
    id: row?.id,
    balance: row?.balance,
    ratePct: row?.ratePct,
    type: row?.type,
    minPaymentMonthly: row?.minPaymentMonthly,
    planned: row?.planned,
    settlementDateISO: row?.settlementDateISO,
  };
}

/**
 * Material-inputs hash. Pure function — every field that can change the
 * engine's output (and therefore the freshness of a cached scenario
 * result) must be reflected here. Stable across reorderings of array
 * members thanks to `canonicalJson`'s key-sort and array-preserve rules
 * (callers should pre-sort arrays by id for deterministic hashing).
 */
export function derivedInputsHash(inputs: DerivedHashInputs): string {
  const sortById = <T extends { id?: unknown }>(arr: T[] | null | undefined): T[] =>
    (arr ?? []).slice().sort((a, b) => {
      const ai = String(a?.id ?? "");
      const bi = String(b?.id ?? "");
      return ai < bi ? -1 : ai > bi ? 1 : 0;
    });

  const snapPart: Record<string, unknown> = {};
  if (inputs.snapshot) {
    for (const k of SNAPSHOT_HASH_KEYS) {
      if (k in inputs.snapshot) snapPart[k] = (inputs.snapshot as any)[k];
    }
  }

  return stableHash({
    snapshot: snapPart,
    properties: sortById(inputs.properties).map(propertyHashFields),
    stocks: sortById(inputs.stocks).map(holdingHashFields),
    crypto: sortById(inputs.crypto).map(holdingHashFields),
    income: sortById(inputs.income).map(ledgerHashFields),
    expenses: sortById(inputs.expenses).map(ledgerHashFields),
    bills: sortById(inputs.bills).map(ledgerHashFields),
    debts: sortById(inputs.debts).map(debtHashFields),
  });
}

/**
 * Alias — matches the audit pack vocabulary. Use either name; they return
 * identical hashes.
 */
export const materialInputsHash = derivedInputsHash;

// ─── Seeded RNG (Mulberry32) ─────────────────────────────────────────────────
/** Lightweight, well-distributed seeded PRNG. Period ≈ 2^32, suitable for MC. */
export interface SeededRng {
  /** Uniform [0, 1). */
  next: () => number;
  /** Standard normal via Box-Muller. */
  normal: () => number;
  /** The seed this RNG was initialised with (for logging). */
  seed: number;
}

export function makeRng(seed: number): SeededRng {
  let a = (seed | 0) >>> 0;
  // Box-Muller carries one cached sample
  let cached: number | null = null;

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const normal = (): number => {
    if (cached !== null) {
      const r = cached;
      cached = null;
      return r;
    }
    // Box-Muller — guard u against 0 to avoid log(0)
    let u = 0;
    while (u === 0) u = next();
    const v = next();
    const mag = Math.sqrt(-2 * Math.log(u));
    cached = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };

  return { next, normal, seed };
}

/** Derive a child seed deterministically from a parent seed + label. */
export function deriveSeed(parentSeed: number, label: string): number {
  const h = stableHash({ p: parentSeed, l: label });
  // Take first 8 hex chars as 32-bit unsigned int
  return parseInt(h, 16) >>> 0;
}

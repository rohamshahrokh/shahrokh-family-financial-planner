/**
 * property/types.ts — Sprint 20 PR-F2 property model.
 *
 * Single shape every property-aware surface (NW, leverage, sell-move,
 * refinance-move) reads from. Explicit `kind` discriminator forces PPOR vs
 * investment distinction at the type level — no implicit string sniffing.
 *
 * Source-of-truth: a `CanonicalProperty` is produced from the raw
 * mc_property row (or the demo fixture) by `classifyProperty()` in
 * `./classify.ts`. Surfaces never read raw rows — they read this shape.
 */

/** PPOR provides shelter; never counted toward investable wealth. */
export type PpoRKind = "ppor";
/** Investment property — counted via equity portion (value − loan). */
export type InvestmentKind = "investment";
/** Discriminator: every property is exactly one of these two. */
export type PropertyKind = PpoRKind | InvestmentKind;

/**
 * Settled vs planned. Planned IPs (purchase_date in the future) are
 * modelled but do NOT contribute to current-period leverage or cashflow.
 */
export type PropertyLifecycle = "settled" | "planned" | "historical";

/**
 * Canonical, fully-classified property record. The single shape every
 * downstream consumer reads.
 */
export interface CanonicalProperty {
  id: number | string;
  name: string;
  kind: PropertyKind;
  lifecycle: PropertyLifecycle;
  /** Current market value (AUD). */
  currentValue: number;
  /** Outstanding loan balance (AUD). 0 if no loan. */
  loanBalance: number;
  /** Equity = max(0, currentValue − loanBalance). */
  equity: number;
  /** Interest rate as a decimal (0.0582 = 5.82%). */
  interestRate: number;
  /** Whether the loan is interest-only (true) or P&I (false). */
  interestOnly: boolean;
  /** Weekly rent (AUD/week). 0 for PPOR. */
  weeklyRent: number;
  /** Vacancy rate as a decimal (0.03 = 3%). */
  vacancyRate: number;
  /** Property manager fee as a decimal (0.085 = 8.5%). */
  managementFeeRate: number;
  /** Annual council rates (AUD). */
  councilRates: number;
  /** Annual insurance (AUD). */
  insurance: number;
  /** Annual maintenance budget (AUD). */
  maintenance: number;
  /** ISO date string of original purchase. */
  purchaseDate: string;
  /** Original purchase price (AUD) — needed for CGT base cost. */
  purchasePrice: number;
  /** Selling costs estimate (AUD) — agent fees + conveyancing. */
  sellingCosts: number;
}

/**
 * The minimum raw shape `classifyProperty()` expects. Matches both the
 * mc_property rows and the demo `Property` fixture.
 */
export interface RawPropertyLike {
  id?: number | string;
  name?: string;
  type?: string;
  current_value?: number;
  purchase_price?: number;
  loan_amount?: number;
  interest_rate?: number;
  loan_type?: string;
  weekly_rent?: number;
  vacancy_rate?: number;
  management_fee?: number;
  council_rates?: number;
  insurance?: number;
  maintenance?: number;
  purchase_date?: string;
  selling_costs?: number;
}

/**
 * netWorthBreakdown.ts — Sprint 13 P0-1.
 *
 * Single canonical, lineage-tagged Net Worth breakdown for every Portfolio
 * Lab NW renderer. Builds on `selectCanonicalNetWorth()` in
 * dashboardDataContract.ts and adds per-component source lineage so the
 * audit panel can show WHERE every dollar came from.
 *
 * Reconciliation contract: `sum(components) - netWorth| <= $1`. When that
 * fails, the breakdown is marked `reconciled: false` and consumers must
 * render `"Net worth unavailable — reconciliation failed."` rather than a
 * partial figure.
 */

import {
  selectCanonicalNetWorth,
  selectCashToday,
  selectSuperCombined,
  selectStocksTotal,
  selectCryptoTotal,
  selectIpCurrentValueSettled,
  selectIpLoanBalanceSettled,
  type DashboardInputs,
} from "./dashboardDataContract";

export interface SourceLineage {
  /** Stable id used by audit panel as testid suffix (e.g. "ppor"). */
  component: string;
  /** UI label (e.g. "PPOR equity"). */
  label: string;
  /** Resolved dollar value. */
  value: number;
  /** Source table where this value is stored (e.g. "financial_snapshot"). */
  sourceTable: string;
  /** Field(s) in the source table that contributed. */
  sourceField: string;
  /** Pseudo-SQL query that reproduces this value. */
  sourceQuery: string;
  /** Formula used to derive the value. */
  formula: string;
}

export interface NetWorthBreakdown {
  /** PPOR equity = PPOR value − PPOR mortgage. May be 0 if PPOR sold. */
  pporEquity: number;
  /** Sum of settled investment-property equity (value − loan). */
  investmentPropertyEquity: number;
  /** Cash buckets (cash + savings_cash + emergency_cash + other_cash). */
  cash: number;
  /** Offset account balance against PPOR mortgage. */
  offset: number;
  /** Stocks (canonical selector; max of holdings / sf_stocks / snapshot). */
  stocks: number;
  /** Crypto (canonical selector). */
  crypto: number;
  /** Combined super (roham + fara, fallback to snapshot.super_balance). */
  super: number;
  /** Other non-financial assets: cars + iran_property + other_assets. */
  otherAssets: number;
  /** Sum of asset rows above. */
  totalAssets: number;
  /** PPOR mortgage (separate from offset). */
  mortgageDebt: number;
  /** other_debts + settled IP loans. */
  otherLiabilities: number;
  /** Sum of liability rows. */
  totalLiabilities: number;
  /** Final net worth (matches selectCanonicalNetWorth().netWorth). */
  netWorth: number;
  /** True when sum(components) − netWorth| <= $1. */
  reconciled: boolean;
  /** Signed delta between sum of components and netWorth. 0 on PASS. */
  reconcileDelta: number;
  /** Per-component lineage trace (for audit panel). */
  lineage: SourceLineage[];
}

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Selects the canonical Net Worth breakdown with lineage.
 *
 * IMPORTANT: this is purely a re-presentation of `selectCanonicalNetWorth()`.
 * Every component value MUST come from the canonical selectors so there is
 * exactly one source of truth for the dashboard NW figure.
 */
export function selectCanonicalNetWorthBreakdown(
  inputs: DashboardInputs,
): NetWorthBreakdown {
  const s = inputs.snapshot ?? {};
  const canonical = selectCanonicalNetWorth(inputs);

  // The canonical selector folds offset_balance into cashOffset. Split it
  // apart here so the audit panel can show offset against mortgage as a
  // separate line — but the sum still matches the canonical aggregate.
  const offset = num(s.offset_balance);
  const cashBuckets = selectCashToday(inputs) - offset;

  const pporValue = num(s.ppor);
  const pporMortgage = num(s.mortgage);
  const pporEquity = pporValue - pporMortgage;

  const ipValue = selectIpCurrentValueSettled(inputs);
  const ipLoans = selectIpLoanBalanceSettled(inputs);
  const investmentPropertyEquity = ipValue - ipLoans;

  const otherAssets =
    num(s.cars) + num(s.iran_property) + num(s.other_assets);

  const stocks = selectStocksTotal(inputs);
  const crypto = selectCryptoTotal(inputs);
  const superCombined = selectSuperCombined(inputs);

  const otherDebts = num(s.other_debts);

  const totalAssets =
    pporEquity +
    investmentPropertyEquity +
    cashBuckets +
    offset +
    stocks +
    crypto +
    superCombined +
    otherAssets +
    pporMortgage; // we'll subtract again below — see note in formula

  // Because pporEquity already nets out the mortgage AND we treat
  // mortgage as a liability line, we need to recompute the assets/lia
  // split in the "intuitive household" view that the audit panel shows:
  //   totalAssets    = ppor value + IP value + cash + offset + stocks + crypto + super + otherAssets
  //   totalLiab      = mortgage + ip loans + other_debts
  //   netWorth       = assets − liabilities
  // The breakdown returns the intuitive view; the reconciliation check
  // pins it against `selectCanonicalNetWorth().netWorth` to within $1.
  const totalAssetsIntuitive =
    pporValue +
    ipValue +
    cashBuckets +
    offset +
    stocks +
    crypto +
    superCombined +
    otherAssets;
  const totalLiabilitiesIntuitive = pporMortgage + ipLoans + otherDebts;
  const netWorth = canonical.netWorth;
  const componentSum = totalAssetsIntuitive - totalLiabilitiesIntuitive;
  const reconcileDelta = Math.round(componentSum - netWorth);
  const reconciled = Math.abs(reconcileDelta) <= 1;

  const lineage: SourceLineage[] = [
    {
      component: "ppor-equity",
      label: "PPOR equity",
      value: pporEquity,
      sourceTable: "financial_snapshot",
      sourceField: "ppor − mortgage",
      sourceQuery:
        "SELECT ppor, mortgage FROM financial_snapshot WHERE id = :user_id",
      formula: "ppor − mortgage",
    },
    {
      component: "investment-property-equity",
      label: "Investment property equity (settled)",
      value: investmentPropertyEquity,
      sourceTable: "properties",
      sourceField: "current_value − loan_balance (settled IPs only)",
      sourceQuery:
        "SELECT current_value, loan_balance FROM properties WHERE settlement_status='settled' AND type='investment'",
      formula: "Σ(current_value) − Σ(loan_balance) for settled IPs",
    },
    {
      component: "cash",
      label: "Cash buckets",
      value: cashBuckets,
      sourceTable: "financial_snapshot",
      sourceField: "cash + savings_cash + emergency_cash + other_cash",
      sourceQuery:
        "SELECT cash, savings_cash, emergency_cash, other_cash FROM financial_snapshot",
      formula: "Σ named cash buckets (excludes offset)",
    },
    {
      component: "offset",
      label: "Offset balance",
      value: offset,
      sourceTable: "financial_snapshot",
      sourceField: "offset_balance",
      sourceQuery: "SELECT offset_balance FROM financial_snapshot",
      formula: "snapshot.offset_balance",
    },
    {
      component: "stocks",
      label: "Stocks",
      value: stocks,
      sourceTable: "holdings + sf_stocks + financial_snapshot",
      sourceField: "MAX(holdings.current_value, ticker×holding, snapshot.stocks)",
      sourceQuery:
        "selectStocksTotal(): max(holdings asset_type='stock'.current_value, Σ stocks.ticker×holding, snapshot.stocks)",
      formula: "MAX of three engine sources (canonical selector)",
    },
    {
      component: "crypto",
      label: "Crypto",
      value: crypto,
      sourceTable: "holdings + sf_crypto + financial_snapshot",
      sourceField: "MAX(holdings.current_value, ticker×holding, snapshot.crypto)",
      sourceQuery:
        "selectCryptoTotal(): max(holdings asset_type='crypto'.current_value, Σ crypto.ticker×holding, snapshot.crypto)",
      formula: "MAX of three engine sources (canonical selector)",
    },
    {
      component: "super",
      label: "Superannuation",
      value: superCombined,
      sourceTable: "financial_snapshot",
      sourceField:
        "GREATEST(roham_super_balance + fara_super_balance, super_balance)",
      sourceQuery:
        "selectSuperCombined(): sum(roham, fara) if either > 0 else super_balance",
      formula: "Member balances when present, else combined snapshot.super_balance",
    },
    {
      component: "other-assets",
      label: "Other assets (cars · iran · misc)",
      value: otherAssets,
      sourceTable: "financial_snapshot",
      sourceField: "cars + iran_property + other_assets",
      sourceQuery:
        "SELECT cars, iran_property, other_assets FROM financial_snapshot",
      formula: "Σ non-financial asset buckets",
    },
    {
      component: "mortgage-debt",
      label: "PPOR mortgage",
      value: pporMortgage,
      sourceTable: "financial_snapshot",
      sourceField: "mortgage",
      sourceQuery: "SELECT mortgage FROM financial_snapshot",
      formula: "snapshot.mortgage",
    },
    {
      component: "ip-loans",
      label: "Investment property loans (settled)",
      value: ipLoans,
      sourceTable: "properties",
      sourceField: "loan_balance (settled IPs only)",
      sourceQuery:
        "SELECT loan_balance FROM properties WHERE settlement_status='settled' AND type='investment'",
      formula: "Σ loan_balance for settled IPs",
    },
    {
      component: "other-liabilities",
      label: "Other debts",
      value: otherDebts,
      sourceTable: "financial_snapshot",
      sourceField: "other_debts",
      sourceQuery: "SELECT other_debts FROM financial_snapshot",
      formula: "snapshot.other_debts",
    },
  ];

  // Suppress unused-variable lint; computed eagerly for future audit-panel.
  void totalAssets;

  return {
    pporEquity,
    investmentPropertyEquity,
    cash: cashBuckets,
    offset,
    stocks,
    crypto,
    super: superCombined,
    otherAssets,
    totalAssets: totalAssetsIntuitive,
    mortgageDebt: pporMortgage,
    otherLiabilities: ipLoans + otherDebts,
    totalLiabilities: totalLiabilitiesIntuitive,
    netWorth,
    reconciled,
    reconcileDelta,
    lineage,
  };
}

/** Sentinel text rendered in place of the NW figure when reconciled === false. */
export const NW_RECONCILIATION_FAILED_TEXT =
  "Net worth unavailable — reconciliation failed.";

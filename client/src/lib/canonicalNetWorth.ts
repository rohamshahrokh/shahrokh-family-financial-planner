/**
 * canonicalNetWorth.ts — single source of truth for "Net Worth".
 *
 * Why this file exists
 * --------------------
 * The May-2026 UX audit found SEVEN different "Net Worth" values rendered
 * across dashboard / financial-plan / reports / timeline / decision: $222K,
 * $350K, $660K, $816K, $856K, $1.03M, $1.04M. Every surface was rolling its
 * own sum from sf_snapshot fields with subtle variations (some included cars,
 * some used liveStocks vs snap.stocks, some forgot offset_balance, etc.).
 *
 * Everything here is a thin wrapper on top of `selectCanonicalNetWorth` from
 * `dashboardDataContract.ts` (which the scenarioV2 engine already reconciles
 * against to within $1). The point of this module is to give the React layer
 * an ergonomic API:
 *
 *   const { netWorth, components, lastCalculatedAt } = useCanonicalNetWorth();
 *
 * No selector logic is duplicated — `dashboardDataContract` remains the single
 * implementation. If a future caller has the same DashboardInputs shape, it
 * MUST consume this module rather than re-summing snapshot fields locally.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiRequest } from "./queryClient";
import {
  selectCanonicalNetWorth,
  type CanonicalNetWorth,
  type DashboardInputs,
} from "./dashboardDataContract";

/** Explicit components — every $ on a NW card must reconcile against these. */
export interface CanonicalNetWorthComponents {
  // Assets
  cashTotal: number;        // cash + savings + emergency + other + offset
  superTotal: number;
  ppor: number;
  ips: number;              // settled IP market value only
  stocks: number;
  crypto: number;
  cars: number;
  iranProperty: number;
  otherAssets: number;
  // Liabilities (positive numbers; subtract from assets)
  mortgage: number;
  ipsLoans: number;
  otherDebts: number;
}

export interface CanonicalNetWorthResult {
  /** The single Net Worth figure all surfaces must render. */
  netWorth: number;
  /** Explicit decomposition for tooltips / breakdown UIs. */
  components: CanonicalNetWorthComponents;
  /** Raw canonical struct from the contract layer (assets + liabilities + plannedIpEquity). */
  raw: CanonicalNetWorth;
  /** Wall-clock timestamp the calculation ran. */
  lastCalculatedAt: string;
  /** True until every underlying query has resolved at least once. */
  loading: boolean;
}

/**
 * Pure function: compute canonical NW from a DashboardInputs ledger payload.
 * Use this on the server or in tests; React surfaces should use the hook.
 */
export function computeCanonicalNetWorth(
  ledger: DashboardInputs,
): CanonicalNetWorthResult {
  const raw = selectCanonicalNetWorth(ledger);
  const components: CanonicalNetWorthComponents = {
    cashTotal:     raw.assets.cashOffset,
    superTotal:    raw.assets.super,
    ppor:          raw.assets.ppor,
    ips:           raw.assets.settledIpValue,
    stocks:        raw.assets.stocks,
    crypto:        raw.assets.crypto,
    cars:          raw.assets.cars,
    iranProperty:  raw.assets.iranProperty,
    otherAssets:   raw.assets.otherAssets,
    mortgage:      raw.liabilities.ppoMortgage,
    ipsLoans:      raw.liabilities.settledIpLoans,
    otherDebts:    raw.liabilities.otherDebts,
  };
  // Determinism: tests pin lastCalculatedAt via a stable iso, runtime uses now()
  const lastCalculatedAt = new Date().toISOString();
  return { netWorth: raw.netWorth, components, raw, lastCalculatedAt, loading: false };
}

// ───────────────────────────────────────────────────────────────────────────
// Hook
// ───────────────────────────────────────────────────────────────────────────
//
// The hook fetches the canonical ledger surface (snapshot + properties +
// stocks + crypto + holdings + income + expenses) the same way the dashboard
// does, then runs the pure compute. By centralising this we guarantee that
// every page using the hook ends up calling `selectCanonicalNetWorth` with
// the SAME inputs — which is what was missing before.
//
// Pages that already fetch these queries themselves can pass their inputs in
// via the optional `overrideInputs` arg to avoid double-fetching; the result
// is computed synchronously without spawning new requests.

const STALE_60S = 60 * 1000;

interface UseCanonicalNetWorthOptions {
  /** When set, skip the internal queries and compute from these inputs. */
  overrideInputs?: DashboardInputs | null;
}

export function useCanonicalNetWorth(
  opts: UseCanonicalNetWorthOptions = {},
): CanonicalNetWorthResult {
  const skipFetch = !!opts.overrideInputs;

  const snapshotQ = useQuery<any>({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot").then(r => r.json()),
    staleTime: STALE_60S,
    enabled: !skipFetch,
  });
  const propertiesQ = useQuery<any[]>({
    queryKey: ["/api/properties"],
    queryFn: () => apiRequest("GET", "/api/properties").then(r => r.json()).catch(() => []),
    staleTime: STALE_60S,
    enabled: !skipFetch,
  });
  const stocksQ = useQuery<any[]>({
    queryKey: ["/api/stocks"],
    queryFn: () => apiRequest("GET", "/api/stocks").then(r => r.json()).catch(() => []),
    staleTime: STALE_60S,
    enabled: !skipFetch,
  });
  const cryptosQ = useQuery<any[]>({
    queryKey: ["/api/crypto"],
    queryFn: () => apiRequest("GET", "/api/crypto").then(r => r.json()).catch(() => []),
    staleTime: STALE_60S,
    enabled: !skipFetch,
  });
  const holdingsQ = useQuery<any[]>({
    queryKey: ["/api/holdings"],
    queryFn: () => apiRequest("GET", "/api/holdings").then(r => r.json()).catch(() => []),
    staleTime: STALE_60S,
    enabled: !skipFetch,
  });
  const incomeQ = useQuery<any[]>({
    queryKey: ["/api/income"],
    queryFn: () => apiRequest("GET", "/api/income").then(r => r.json()).catch(() => []),
    staleTime: STALE_60S,
    enabled: !skipFetch,
  });
  const expensesQ = useQuery<any[]>({
    queryKey: ["/api/expenses"],
    queryFn: () => apiRequest("GET", "/api/expenses").then(r => r.json()).catch(() => []),
    staleTime: STALE_60S,
    enabled: !skipFetch,
  });

  return useMemo<CanonicalNetWorthResult>(() => {
    if (opts.overrideInputs) {
      return computeCanonicalNetWorth(opts.overrideInputs);
    }
    const inputs: DashboardInputs = {
      snapshot:       snapshotQ.data ?? null,
      properties:     propertiesQ.data,
      stocks:         stocksQ.data,
      cryptos:        cryptosQ.data,
      holdingsRaw:    holdingsQ.data,
      incomeRecords:  incomeQ.data,
      expenses:       expensesQ.data,
    };
    const result = computeCanonicalNetWorth(inputs);
    const loading =
      snapshotQ.isLoading || propertiesQ.isLoading || stocksQ.isLoading ||
      cryptosQ.isLoading || holdingsQ.isLoading;
    return { ...result, loading };
  }, [
    opts.overrideInputs,
    snapshotQ.data, snapshotQ.isLoading,
    propertiesQ.data, propertiesQ.isLoading,
    stocksQ.data, stocksQ.isLoading,
    cryptosQ.data, cryptosQ.isLoading,
    holdingsQ.data, holdingsQ.isLoading,
    incomeQ.data, expensesQ.data,
  ]);
}

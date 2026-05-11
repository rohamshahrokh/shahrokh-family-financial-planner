/**
 * scenario-compare-v2.tsx
 * Scenario Compare Lab — V2 (read-only vertical slice)
 *
 * Purpose: render the V2 engine's 4-way comparison (Base / +50k Crypto /
 * +50k Property / 50k Cash hold) end-to-end against the live ledger.
 *
 * This route is deliberately minimal:
 *  • No editing UI yet (Phase 2)
 *  • No persistence (Phase 11)
 *  • No template gallery (Phase 13)
 *  • One button: "Run V2 engine"
 *  • Reads DashboardInputs the exact same way the dashboard does
 *  • Calls runScenarioV2() four times (Base + 3 deltas)
 *  • Surfaces reconciliation status + serviceability + terminal P10/P50/P90
 *
 * Goal: prove the engine works end-to-end against real data, expose the
 * advisor-grade fields (DSR/DTI/LVR/NSR), and show the median final state
 * per scenario — so the user can sanity-check the math before we polish UI.
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, safeNum } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Beaker, CheckCircle2, AlertTriangle, Play, RefreshCw } from "lucide-react";

import {
  runScenarioV2,
  type ExtendedScenarioResult,
  type ScenarioDelta,
} from "@/lib/scenarioV2";
import {
  selectMonthlySurplus,
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectCashToday,
  type DashboardInputs,
} from "@/lib/dashboardDataContract";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmt$ = (n: number) => formatCurrency(Math.round(n));
const bandClass = (band: string) =>
  band === "comfortable" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
  band === "manageable" ? "bg-blue-100 text-blue-800 border-blue-200" :
  band === "stressed" ? "bg-amber-100 text-amber-800 border-amber-200" :
  "bg-red-100 text-red-800 border-red-200";

/** Build the 4 scenario delta sets the slice supports. */
function buildSliceScenarios(activationMonth: string): Array<{
  scenarioId: string;
  name: string;
  deltas: ScenarioDelta[];
}> {
  return [
    { scenarioId: "base", name: "Base (no change)", deltas: [] },
    {
      scenarioId: "crypto_50k",
      name: "+$50k Crypto lump sum",
      deltas: [{
        id: "delta-crypto",
        scenarioId: "crypto_50k",
        deltaType: "crypto_lump_sum",
        activationMonth,
        params: { amount: 50_000, asset: "BTC" },
        priority: 600,
        idempotencyKey: "v2-slice-crypto-50k",
      }],
    },
    {
      scenarioId: "property_50k",
      name: "+$50k Property deposit",
      deltas: [{
        id: "delta-property",
        scenarioId: "property_50k",
        deltaType: "property_deposit_boost",
        activationMonth,
        params: { extraDeposit: 50_000 },
        priority: 600,
        idempotencyKey: "v2-slice-property-50k",
      }],
    },
    {
      scenarioId: "cash_50k",
      name: "Hold $50k as cash",
      deltas: [{
        id: "delta-cash",
        scenarioId: "cash_50k",
        deltaType: "cash_hold",
        activationMonth,
        params: { amount: 50_000 },
        priority: 600,
        idempotencyKey: "v2-slice-cash-50k",
      }],
    },
  ];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScenarioCompareV2Page() {
  // Match dashboard.tsx exactly — DashboardInputs has 7 required slots.
  const { data: snapshot } = useQuery<any>({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot").then(r => r.json()),
  });
  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ["/api/properties"],
    queryFn: () => apiRequest("GET", "/api/properties").then(r => r.json()),
  });
  const { data: stocks = [] } = useQuery<any[]>({
    queryKey: ["/api/stocks"],
    queryFn: () => apiRequest("GET", "/api/stocks").then(r => r.json()),
  });
  const { data: cryptos = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto"],
    queryFn: () => apiRequest("GET", "/api/crypto").then(r => r.json()),
  });
  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ["/api/expenses"],
    queryFn: () => apiRequest("GET", "/api/expenses").then(r => r.json()),
  });
  const { data: incomeRecords = [] } = useQuery<any[]>({
    queryKey: ["/api/income"],
    queryFn: () => apiRequest("GET", "/api/income").then(r => r.json()),
  });
  const { data: holdingsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/holdings"],
    queryFn: () => apiRequest("GET", "/api/holdings").then(r => r.json()),
  });

  const dashboardInputs: DashboardInputs | null = useMemo(() => {
    if (!snapshot) return null;
    return {
      snapshot,
      properties,
      stocks,
      cryptos,
      holdingsRaw,
      incomeRecords,
      expenses,
    };
  }, [snapshot, properties, stocks, cryptos, holdingsRaw, incomeRecords, expenses]);

  // Sanity readouts derived from the same selectors the engine uses.
  const liveReadouts = useMemo(() => {
    if (!dashboardInputs) return null;
    return {
      income: selectMonthlyIncome(dashboardInputs),
      expenses: selectMonthlyExpensesLedger(dashboardInputs),
      surplus: selectMonthlySurplus(dashboardInputs),
      cash: selectCashToday(dashboardInputs),
    };
  }, [dashboardInputs]);

  const [results, setResults] = useState<ExtendedScenarioResult[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRun = useCallback(() => {
    if (!dashboardInputs) return;
    setRunning(true);
    setError(null);

    // Defer to next tick so the spinner can paint.
    setTimeout(() => {
      try {
        const now = new Date();
        const activationMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const scenarios = buildSliceScenarios(activationMonth);

        const out: ExtendedScenarioResult[] = scenarios.map(s =>
          runScenarioV2({
            dashboardInputs,
            name: s.name,
            scenarioId: s.scenarioId,
            deltas: s.deltas,
            simulationCount: 200, // matches the test fixture; <2s/scenario
            horizonMonths: 120,
            startMonth: activationMonth,
          }),
        );

        setResults(out);
      } catch (e: any) {
        console.error("[scenario-v2] run failed:", e);
        setError(e?.message ?? String(e));
      } finally {
        setRunning(false);
      }
    }, 50);
  }, [dashboardInputs]);

  const baseResult = results.find(r => r.scenarioId === "base" || r.name?.startsWith("Base"));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Beaker className="h-6 w-6 text-purple-600" />
            <h1 className="text-2xl font-bold">Scenario Compare V2</h1>
            <Badge variant="outline" className="text-xs">vertical slice · read-only</Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Reads your live ledger, derives the Base Plan automatically, then runs Base /
            +$50k Crypto / +$50k Property / +$50k Cash through a deterministic, seeded Monte Carlo
            and reports advisor-grade serviceability. No manual fields, no rebuild per scenario.
          </p>
        </div>
        <Button onClick={handleRun} disabled={!dashboardInputs || running} size="lg">
          {running ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          {running ? "Running…" : results.length ? "Re-run" : "Run V2 engine"}
        </Button>
      </div>

      {/* Live ledger readout */}
      {liveReadouts && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Live ledger (single source of truth)</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Monthly income</div>
              <div className="text-lg font-semibold">{fmt$(liveReadouts.income)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Monthly expenses (incl. debt)</div>
              <div className="text-lg font-semibold">{fmt$(liveReadouts.expenses)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Monthly surplus</div>
              <div className="text-lg font-semibold text-emerald-700">{fmt$(liveReadouts.surplus)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Cash today</div>
              <div className="text-lg font-semibold">{fmt$(liveReadouts.cash)}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Engine error</AlertTitle>
          <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Reconciliation banner */}
      {baseResult && (
        <Alert className={baseResult.reconcilesToDashboard ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}>
          {baseResult.reconcilesToDashboard
            ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            : <AlertTriangle className="h-4 w-4 text-red-600" />}
          <AlertTitle>
            Reconciliation: {baseResult.reconcilesToDashboard ? "PASS" : "FAIL"}
          </AlertTitle>
          <AlertDescription className="text-sm">
            Engine month-0 surplus = {fmt$(baseResult.reconciledMonthlySurplus)} ·
            Dashboard surplus = {fmt$(baseResult.dashboardMonthlySurplus)} ·
            Δ = {fmt$(Math.abs(baseResult.reconciledMonthlySurplus - baseResult.dashboardMonthlySurplus))}
          </AlertDescription>
        </Alert>
      )}

      {/* Results table */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>10-year forecast — 200 Monte Carlo sims per scenario</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left">
                    <th className="py-2 pr-4">Scenario</th>
                    <th className="py-2 pr-4 text-right">Initial NW</th>
                    <th className="py-2 pr-4 text-right">Terminal P10</th>
                    <th className="py-2 pr-4 text-right">Terminal P50</th>
                    <th className="py-2 pr-4 text-right">Terminal P90</th>
                    <th className="py-2 pr-4 text-right">DSR</th>
                    <th className="py-2 pr-4 text-right">DTI</th>
                    <th className="py-2 pr-4 text-right">LVR</th>
                    <th className="py-2 pr-4 text-right">NSR</th>
                    <th className="py-2 pr-4">Band</th>
                    <th className="py-2 pr-4 text-right">Runtime</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => {
                    const fanEnd = r.netWorthFan?.[r.netWorthFan.length - 1];
                    return (
                      <tr key={r.scenarioId} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{r.name}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{fmt$(r.initialNetWorth)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{fanEnd ? fmt$(fanEnd.p10) : "—"}</td>
                        <td className="py-2 pr-4 text-right tabular-nums font-semibold">{fanEnd ? fmt$(fanEnd.p50) : "—"}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{fanEnd ? fmt$(fanEnd.p90) : "—"}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{pct(safeNum(r.serviceability?.dsr))}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{safeNum(r.serviceability?.dti).toFixed(2)}×</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{pct(safeNum(r.serviceability?.lvr))}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {r.serviceability?.nsr === Infinity ? "∞" : safeNum(r.serviceability?.nsr).toFixed(2)}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline" className={bandClass(r.serviceability?.band ?? "")}>
                            {r.serviceability?.band ?? "—"}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                          {r.runtimeMs}ms
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Serviceability rationale */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Serviceability rationale (median final state)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {results.map((r) => (
              <div key={r.scenarioId} className="border-l-2 border-purple-300 pl-4">
                <div className="font-medium mb-1">{r.name}</div>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {(r.serviceability?.rationale ?? []).map((line, i) => (
                    <li key={i} className="font-mono">{line}</li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!running && results.length === 0 && !error && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Beaker className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <div className="text-sm">
              Click <span className="font-semibold">Run V2 engine</span> to project Base + 3 deltas
              from your live ledger.
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

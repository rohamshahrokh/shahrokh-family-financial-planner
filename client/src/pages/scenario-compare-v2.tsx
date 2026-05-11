/**
 * scenario-compare-v2.tsx
 * Scenario Compare V2 — Real product feature
 *
 * The $50k marginal capital allocation decision tool.
 *
 *   ┌─ Live ledger banner (auto-derived Base Plan)
 *   ├─ Editable assumptions panel (property growth, crypto return, cash APR,
 *   │   interest rate, rent yield, horizon years, MC sims)
 *   ├─ Run/Re-run + Download PDF
 *   ├─ Winner cards (NW / liquidity / risk-adj / best median / worst downside)
 *   ├─ Comparison table (NW P10/P50/P90, terminal cash, DSR, LVR, NSR,
 *   │   risk metrics, band)
 *   ├─ Tabs: Net Worth Projection │ Liquidity │ Delta vs Base │ MC bands
 *   └─ Risk + serviceability rationale per scenario
 */

import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, safeNum } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Beaker, CheckCircle2, AlertTriangle, Play, RefreshCw, Download,
  Trophy, Droplet, Shield, TrendingUp, TrendingDown, Settings,
  Building2, Bitcoin, Wallet, Award, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ReferenceLine,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import {
  runScenarioV2,
  type ExtendedScenarioResult,
  type ScenarioDelta,
  type BasePlanAssumptions,
  DEFAULT_ASSUMPTIONS,
} from "@/lib/scenarioV2";
import {
  selectMonthlySurplus,
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectCashToday,
  type DashboardInputs,
} from "@/lib/dashboardDataContract";

// ─── Types / helpers ─────────────────────────────────────────────────────────

interface UserAssumptions {
  propertyGrowthPct: number;   // %/yr
  propertyVolPct: number;      // %/yr σ
  cryptoReturnPct: number;     // %/yr
  cryptoVolPct: number;        // %/yr σ
  cashAprPct: number;          // %/yr
  mortgageRatePct: number;     // %/yr
  rentYieldPct: number;        // %/yr gross
  horizonYears: number;
  simulationCount: number;
  capital: number;             // AUD — the marginal capital being allocated
}

const DEFAULT_USER_ASSUMPTIONS: UserAssumptions = {
  propertyGrowthPct: 6.0,
  propertyVolPct: 5.0,
  cryptoReturnPct: 20.0,
  cryptoVolPct: 60.0,
  cashAprPct: 4.5,
  mortgageRatePct: 6.5,
  rentYieldPct: 4.5,
  horizonYears: 10,
  simulationCount: 500,
  capital: 50_000,
};

const SCENARIO_COLORS = {
  base: "#64748b",       // slate
  property: "#0ea5e9",   // sky
  crypto: "#f59e0b",     // amber
  cash: "#10b981",       // emerald
};

const SCENARIO_KEY_MAP: Record<string, keyof typeof SCENARIO_COLORS> = {
  "base": "base",
  "property_50k": "property",
  "crypto_50k": "crypto",
  "cash_50k": "cash",
};

const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;
const fmt$ = (n: number) => formatCurrency(Math.round(n));
const fmt$k = (n: number) => `$${(Math.round(n) / 1000).toFixed(0)}k`;
const fmt$M = (n: number) => `$${(n / 1_000_000).toFixed(2)}M`;
const bandClass = (band: string) =>
  band === "comfortable" ? "bg-emerald-100 text-emerald-800 border-emerald-200" :
  band === "manageable" ? "bg-blue-100 text-blue-800 border-blue-200" :
  band === "stressed" ? "bg-amber-100 text-amber-800 border-amber-200" :
  "bg-red-100 text-red-800 border-red-200";

function buildAssumptionsOverride(u: UserAssumptions): Partial<BasePlanAssumptions> {
  return {
    propertyGrowth: u.propertyGrowthPct / 100,
    propertyVol: u.propertyVolPct / 100,
    cryptoReturn: u.cryptoReturnPct / 100,
    cryptoVol: u.cryptoVolPct / 100,
    cashApr: u.cashAprPct / 100,
    mortgageRate: u.mortgageRatePct / 100,
  };
}

function buildSliceScenarios(activationMonth: string, u: UserAssumptions): Array<{
  scenarioId: string;
  name: string;
  deltas: ScenarioDelta[];
}> {
  // Property delta — derive purchasePrice from capital using a standard 20% deposit
  // (so the capital acts as the FULL deposit). Then auto-derive rent from rent-yield knob.
  const purchasePrice = u.capital * 5; // 20% deposit → 5× capital
  const weeklyRent = Math.round((purchasePrice * (u.rentYieldPct / 100)) / 52);

  return [
    { scenarioId: "base", name: "Base Case", deltas: [] },
    {
      scenarioId: "property_50k",
      name: `+$${(u.capital / 1000).toFixed(0)}k Property Deposit`,
      deltas: [{
        id: "delta-property",
        scenarioId: "property_50k",
        deltaType: "property_deposit_boost",
        activationMonth,
        params: {
          extraDeposit: u.capital,
          purchasePrice,
          weeklyRent,
          rate: u.mortgageRatePct,
          loanTermYears: 30,
          vacancyRate: 0.04,
          managementFee: 0.08,
        },
        priority: 600,
        idempotencyKey: `v2-prop-${u.capital}`,
      }],
    },
    {
      scenarioId: "crypto_50k",
      name: `+$${(u.capital / 1000).toFixed(0)}k Crypto`,
      deltas: [{
        id: "delta-crypto",
        scenarioId: "crypto_50k",
        deltaType: "crypto_lump_sum",
        activationMonth,
        params: { amount: u.capital, asset: "BTC" },
        priority: 600,
        idempotencyKey: `v2-crypto-${u.capital}`,
      }],
    },
    {
      scenarioId: "cash_50k",
      name: `Hold $${(u.capital / 1000).toFixed(0)}k as Cash`,
      deltas: [{
        id: "delta-cash",
        scenarioId: "cash_50k",
        deltaType: "cash_hold",
        activationMonth,
        params: { amount: u.capital },
        priority: 600,
        idempotencyKey: `v2-cash-${u.capital}`,
      }],
    },
  ];
}

// ─── Slider row ──────────────────────────────────────────────────────────────

function SliderRow({
  label, value, min, max, step, suffix, onChange, hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (n: number) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={value}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n)) onChange(n);
            }}
            min={min}
            max={max}
            step={step}
            className="h-7 w-20 text-right text-xs tabular-nums"
          />
          {suffix && <span className="text-xs text-muted-foreground w-6">{suffix}</span>}
        </div>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="py-1"
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ScenarioCompareV2Page() {
  // Live ledger — same shape dashboard uses.
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
    return { snapshot, properties, stocks, cryptos, holdingsRaw, incomeRecords, expenses };
  }, [snapshot, properties, stocks, cryptos, holdingsRaw, incomeRecords, expenses]);

  const liveReadouts = useMemo(() => {
    if (!dashboardInputs) return null;
    return {
      income: selectMonthlyIncome(dashboardInputs),
      expenses: selectMonthlyExpensesLedger(dashboardInputs),
      surplus: selectMonthlySurplus(dashboardInputs),
      cash: selectCashToday(dashboardInputs),
    };
  }, [dashboardInputs]);

  const [assumptions, setAssumptions] = useState<UserAssumptions>(DEFAULT_USER_ASSUMPTIONS);
  const [showAssumptions, setShowAssumptions] = useState(true);
  const [results, setResults] = useState<ExtendedScenarioResult[]>([]);
  const [lastAssumptions, setLastAssumptions] = useState<UserAssumptions>(DEFAULT_USER_ASSUMPTIONS);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const handleRun = useCallback(() => {
    if (!dashboardInputs) return;
    setRunning(true);
    setError(null);

    setTimeout(() => {
      try {
        const now = new Date();
        const activationMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const scenarios = buildSliceScenarios(activationMonth, assumptions);
        const overrides = buildAssumptionsOverride(assumptions);

        const out: ExtendedScenarioResult[] = scenarios.map(s =>
          runScenarioV2({
            dashboardInputs,
            name: s.name,
            scenarioId: s.scenarioId,
            deltas: s.deltas,
            simulationCount: assumptions.simulationCount,
            horizonMonths: assumptions.horizonYears * 12,
            startMonth: activationMonth,
            assumptions: overrides,
          }),
        );

        setResults(out);
        setLastAssumptions(assumptions);
      } catch (e: any) {
        console.error("[scenario-v2] run failed:", e);
        setError(e?.message ?? String(e));
      } finally {
        setRunning(false);
      }
    }, 50);
  }, [dashboardInputs, assumptions]);

  const base = results.find(r => r.scenarioId === "base");
  const property = results.find(r => r.scenarioId === "property_50k");
  const crypto = results.find(r => r.scenarioId === "crypto_50k");
  const cash = results.find(r => r.scenarioId === "cash_50k");

  // ─── Winners ──────────────────────────────────────────────────────────────
  const winners = useMemo(() => {
    if (results.length === 0) return null;
    const fanEnd = (r: ExtendedScenarioResult) => r.netWorthFan[r.netWorthFan.length - 1];

    const byNw = [...results].sort((a, b) => fanEnd(b).p50 - fanEnd(a).p50)[0];
    const byLiquidity = [...results].sort((a, b) => {
      const aCash = a.cashFan[a.cashFan.length - 1]?.p50 ?? 0;
      const bCash = b.cashFan[b.cashFan.length - 1]?.p50 ?? 0;
      return bCash - aCash;
    })[0];
    const byRiskAdj = [...results].sort(
      (a, b) => b.riskMetrics.riskAdjustedNw - a.riskMetrics.riskAdjustedNw,
    )[0];
    const bestMedian = byNw; // alias for clarity in cards
    const worstDownside = [...results].sort(
      (a, b) => b.riskMetrics.downsideRisk - a.riskMetrics.downsideRisk,
    )[0];

    return { byNw, byLiquidity, byRiskAdj, bestMedian, worstDownside };
  }, [results]);

  // ─── Chart data ───────────────────────────────────────────────────────────
  const nwChartData = useMemo(() => {
    if (results.length === 0) return [];
    const M = results[0].netWorthFan.length;
    const rows: any[] = [];
    for (let i = 0; i < M; i++) {
      const month = results[0].netWorthFan[i].month;
      const yr = (i + 1) / 12;
      const row: any = { month, year: yr.toFixed(1) };
      results.forEach(r => {
        const key = SCENARIO_KEY_MAP[r.scenarioId] ?? "base";
        row[key] = r.netWorthFan[i].p50;
      });
      rows.push(row);
    }
    return rows;
  }, [results]);

  const liquidityChartData = useMemo(() => {
    if (results.length === 0) return [];
    const M = results[0].cashFan.length;
    const rows: any[] = [];
    for (let i = 0; i < M; i++) {
      const yr = (i + 1) / 12;
      const row: any = { year: yr.toFixed(1) };
      results.forEach(r => {
        const key = SCENARIO_KEY_MAP[r.scenarioId] ?? "base";
        row[key] = r.cashFan[i].p50;
      });
      rows.push(row);
    }
    return rows;
  }, [results]);

  const deltaChartData = useMemo(() => {
    if (!base || results.length === 0) return [];
    const M = base.netWorthFan.length;
    const rows: any[] = [];
    for (let i = 0; i < M; i++) {
      const baseV = base.netWorthFan[i].p50;
      const yr = (i + 1) / 12;
      const row: any = { year: yr.toFixed(1) };
      results.forEach(r => {
        if (r.scenarioId === "base") return;
        const key = SCENARIO_KEY_MAP[r.scenarioId] ?? "base";
        row[key] = r.netWorthFan[i].p50 - baseV;
      });
      rows.push(row);
    }
    return rows;
  }, [results, base]);

  const [bandsScenarioIdx, setBandsScenarioIdx] = useState(1);
  const bandsChartData = useMemo(() => {
    if (results.length === 0) return [];
    const r = results[bandsScenarioIdx] ?? results[0];
    return r.netWorthFan.map((f, i) => ({
      year: ((i + 1) / 12).toFixed(1),
      p10: f.p10,
      p50: f.p50,
      p90: f.p90,
      p90Minus50: f.p90 - f.p50,
      p50Minus10: f.p50 - f.p10,
    }));
  }, [results, bandsScenarioIdx]);

  // ─── PDF export ───────────────────────────────────────────────────────────
  const handleDownloadPdf = useCallback(() => {
    if (results.length === 0 || !base) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = margin;

    // Header
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Scenario Compare V2 — Capital Allocation Decision", margin, y);
    y += 22;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(
      `Generated ${new Date().toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })} · ` +
      `Horizon ${lastAssumptions.horizonYears}yr · ${lastAssumptions.simulationCount} Monte Carlo sims`,
      margin, y,
    );
    y += 24;
    doc.setTextColor(0);

    // Exec summary
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Executive Summary", margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const baseFanEnd = base.netWorthFan[base.netWorthFan.length - 1];
    const summaryLines: string[] = [];
    summaryLines.push(
      `Capital under decision: ${fmt$(lastAssumptions.capital)}. Compared 4 paths (Base, Property, Crypto, Cash) ` +
      `against your live ledger.`,
    );
    if (winners) {
      summaryLines.push(
        `Highest median net worth: ${winners.byNw.name} ($${Math.round(winners.byNw.netWorthFan[winners.byNw.netWorthFan.length - 1].p50).toLocaleString()}).`,
      );
      summaryLines.push(
        `Best risk-adjusted outcome: ${winners.byRiskAdj.name} ($${Math.round(winners.byRiskAdj.riskMetrics.riskAdjustedNw).toLocaleString()}).`,
      );
      summaryLines.push(
        `Highest terminal liquidity: ${winners.byLiquidity.name} ($${Math.round(winners.byLiquidity.cashFan[winners.byLiquidity.cashFan.length - 1].p50).toLocaleString()} P50 cash).`,
      );
      summaryLines.push(
        `Worst downside risk: ${winners.worstDownside.name} (${(winners.worstDownside.riskMetrics.downsideRisk * 100).toFixed(1)}% P10-vs-P50 drawdown).`,
      );
    }
    summaryLines.forEach(line => {
      const wrapped = doc.splitTextToSize(line, pageW - margin * 2);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 12 + 2;
    });
    y += 8;

    // Assumptions
    autoTable(doc, {
      startY: y,
      head: [["Assumption", "Value"]],
      body: [
        ["Capital allocated", fmt$(lastAssumptions.capital)],
        ["Horizon", `${lastAssumptions.horizonYears} years`],
        ["Monte Carlo sims", `${lastAssumptions.simulationCount}`],
        ["Property growth", `${lastAssumptions.propertyGrowthPct.toFixed(1)}% / yr`],
        ["Property volatility", `${lastAssumptions.propertyVolPct.toFixed(1)}% σ`],
        ["Crypto return", `${lastAssumptions.cryptoReturnPct.toFixed(1)}% / yr`],
        ["Crypto volatility", `${lastAssumptions.cryptoVolPct.toFixed(1)}% σ`],
        ["Cash APR", `${lastAssumptions.cashAprPct.toFixed(2)}% / yr`],
        ["Mortgage rate", `${lastAssumptions.mortgageRatePct.toFixed(2)}% / yr`],
        ["Gross rent yield", `${lastAssumptions.rentYieldPct.toFixed(2)}% / yr`],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [99, 102, 241] },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 20;

    // Comparison table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Scenario Comparison", margin, y);
    y += 14;

    autoTable(doc, {
      startY: y,
      head: [["Scenario", "Initial NW", "P10 NW", "P50 NW", "P90 NW", "P50 Cash", "DSR", "LVR", "Downside", "Vol (CV)", "Risk-Adj NW"]],
      body: results.map(r => {
        const fanEnd = r.netWorthFan[r.netWorthFan.length - 1];
        const cashEnd = r.cashFan[r.cashFan.length - 1];
        return [
          r.name,
          fmt$(r.initialNetWorth),
          fmt$(fanEnd.p10),
          fmt$(fanEnd.p50),
          fmt$(fanEnd.p90),
          fmt$(cashEnd.p50),
          `${(r.serviceability.dsr * 100).toFixed(1)}%`,
          `${(r.serviceability.lvr * 100).toFixed(1)}%`,
          `${(r.riskMetrics.downsideRisk * 100).toFixed(1)}%`,
          `${(r.riskMetrics.volatility * 100).toFixed(1)}%`,
          fmt$(r.riskMetrics.riskAdjustedNw),
        ];
      }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [99, 102, 241] },
      margin: { left: margin, right: margin },
    });
    y = (doc as any).lastAutoTable.finalY + 20;

    // Risk Analysis
    if (y > 680) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Risk Analysis", margin, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    results.forEach(r => {
      if (y > 740) { doc.addPage(); y = margin; }
      doc.setFont("helvetica", "bold");
      doc.text(r.name, margin, y);
      y += 12;
      doc.setFont("helvetica", "normal");
      r.riskMetrics.rationale.forEach(line => {
        const w = doc.splitTextToSize(`• ${line}`, pageW - margin * 2 - 10);
        doc.text(w, margin + 10, y);
        y += w.length * 11;
      });
      r.serviceability.rationale.forEach(line => {
        const w = doc.splitTextToSize(`• ${line}`, pageW - margin * 2 - 10);
        doc.text(w, margin + 10, y);
        y += w.length * 11;
      });
      y += 6;
    });

    // Recommendation
    if (y > 680) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Recommendation", margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    if (winners) {
      const rec = buildRecommendation(winners, lastAssumptions);
      const wrapped = doc.splitTextToSize(rec, pageW - margin * 2);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 13;
    }

    // Disclaimer
    if (y > 720) { doc.addPage(); y = margin; }
    y += 16;
    doc.setFontSize(8);
    doc.setTextColor(120);
    const disc = doc.splitTextToSize(
      "Disclaimer: This report is generated by an automated financial planning tool using your own ledger data and the assumptions you specified. " +
      "It is not personal financial advice. Monte Carlo projections illustrate a range of possible outcomes given the input assumptions; actual results " +
      "will differ. Property and crypto markets carry significant risk including loss of capital. Consider consulting a licensed financial adviser before acting.",
      pageW - margin * 2,
    );
    doc.text(disc, margin, y);

    doc.save(`scenario-compare-v2-${new Date().toISOString().slice(0, 10)}.pdf`);
  }, [results, base, winners, lastAssumptions]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-7xl mx-auto" ref={reportRef}>
      {/* Active banner — proves the new UI is what you're looking at */}
      <div
        data-testid="scenario-engine-v2-active-banner"
        className="relative overflow-hidden rounded-lg border-2 border-purple-300 bg-gradient-to-r from-purple-600 via-fuchsia-600 to-indigo-600 p-4 shadow-lg"
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 ring-2 ring-white/40">
              <Beaker className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-white text-base font-bold tracking-tight">
                Scenario Engine V2 · ACTIVE
              </div>
              <div className="text-purple-100 text-xs">
                Auto-derived Base Plan · Deterministic Monte Carlo · Advisor-grade risk + serviceability
              </div>
            </div>
          </div>
          <Badge className="bg-white/95 text-purple-700 font-semibold">
            BUILD {(import.meta as any).env?.VITE_COMMIT_SHA?.slice(0, 7) ?? "v2"}
          </Badge>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Beaker className="h-6 w-6 text-purple-600" />
            <h1 className="text-2xl font-bold">Scenario Compare V2</h1>
            <Badge variant="outline" className="text-xs">capital allocation engine</Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Decide where to deploy ${(assumptions.capital / 1000).toFixed(0)}k of marginal capital.
            Engine auto-derives your Base Plan from your live ledger and runs a deterministic Monte Carlo
            across Property, Crypto, and Cash — with real volatility, leverage, and liquidity scoring.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {results.length > 0 && (
            <Button variant="outline" onClick={handleDownloadPdf} className="flex-1 sm:flex-none">
              <Download className="h-4 w-4 mr-2" /> Download PDF
            </Button>
          )}
          <Button onClick={handleRun} disabled={!dashboardInputs || running} size="lg" className="flex-1 sm:flex-none">
            {running ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            {running ? "Running…" : results.length ? "Re-run with current assumptions" : "Run engine"}
          </Button>
        </div>
      </div>

      {/* Live ledger readout */}
      {liveReadouts && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Live ledger — Base Plan auto-derived from this
            </CardTitle>
            {base && (
              <Badge variant="outline" className={base.reconcilesToDashboard
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"}>
                {base.reconcilesToDashboard
                  ? <><CheckCircle2 className="h-3 w-3 mr-1 inline" /> Reconciles to dashboard</>
                  : <><AlertTriangle className="h-3 w-3 mr-1 inline" /> Reconciliation drift</>}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Monthly income</div>
              <div className="text-lg font-semibold tabular-nums">{fmt$(liveReadouts.income)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Monthly expenses</div>
              <div className="text-lg font-semibold tabular-nums">{fmt$(liveReadouts.expenses)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Monthly surplus</div>
              <div className="text-lg font-semibold text-emerald-700 tabular-nums">{fmt$(liveReadouts.surplus)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Cash today</div>
              <div className="text-lg font-semibold tabular-nums">{fmt$(liveReadouts.cash)}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Editable assumptions */}
      <Card>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowAssumptions(s => !s)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4" /> Assumptions
            </CardTitle>
            {showAssumptions
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
          <CardDescription className="text-xs">
            Tune market assumptions to match your view. Re-run after changing.
          </CardDescription>
        </CardHeader>
        {showAssumptions && (
          <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
            <SliderRow
              label="Capital to allocate" value={assumptions.capital}
              min={10_000} max={500_000} step={5_000} suffix="$"
              onChange={n => setAssumptions(a => ({ ...a, capital: n }))}
              hint="The marginal cash you're deciding how to deploy"
            />
            <SliderRow
              label="Property growth (capital)" value={assumptions.propertyGrowthPct}
              min={0} max={12} step={0.25} suffix="%/yr"
              onChange={n => setAssumptions(a => ({ ...a, propertyGrowthPct: n }))}
              hint="Long-run capital growth assumption for residential property"
            />
            <SliderRow
              label="Property volatility (σ)" value={assumptions.propertyVolPct}
              min={2} max={15} step={0.5} suffix="%/yr"
              onChange={n => setAssumptions(a => ({ ...a, propertyVolPct: n }))}
              hint="Annual std-dev of property returns — drives MC dispersion"
            />
            <SliderRow
              label="Crypto return" value={assumptions.cryptoReturnPct}
              min={-10} max={50} step={1} suffix="%/yr"
              onChange={n => setAssumptions(a => ({ ...a, cryptoReturnPct: n }))}
              hint="Expected long-run crypto return"
            />
            <SliderRow
              label="Crypto volatility (σ)" value={assumptions.cryptoVolPct}
              min={20} max={120} step={5} suffix="%/yr"
              onChange={n => setAssumptions(a => ({ ...a, cryptoVolPct: n }))}
              hint="Annual std-dev — high vol = wide MC fan"
            />
            <SliderRow
              label="Cash / offset APR" value={assumptions.cashAprPct}
              min={0} max={8} step={0.1} suffix="%/yr"
              onChange={n => setAssumptions(a => ({ ...a, cashAprPct: n }))}
              hint="After-tax cash/savings rate"
            />
            <SliderRow
              label="Mortgage rate" value={assumptions.mortgageRatePct}
              min={2} max={12} step={0.05} suffix="%/yr"
              onChange={n => setAssumptions(a => ({ ...a, mortgageRatePct: n }))}
              hint="Interest rate applied to any new investment property loan"
            />
            <SliderRow
              label="Gross rent yield" value={assumptions.rentYieldPct}
              min={2} max={8} step={0.1} suffix="%/yr"
              onChange={n => setAssumptions(a => ({ ...a, rentYieldPct: n }))}
              hint="Annual rent / purchase price (before vacancy + mgmt)"
            />
            <SliderRow
              label="Forecast horizon" value={assumptions.horizonYears}
              min={3} max={30} step={1} suffix="yr"
              onChange={n => setAssumptions(a => ({ ...a, horizonYears: n }))}
              hint="How many years to project"
            />
            <SliderRow
              label="Monte Carlo sims" value={assumptions.simulationCount}
              min={100} max={2000} step={100} suffix=""
              onChange={n => setAssumptions(a => ({ ...a, simulationCount: n }))}
              hint="More sims = smoother percentile estimates"
            />
          </CardContent>
        )}
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Engine error</AlertTitle>
          <AlertDescription className="font-mono text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {!running && results.length === 0 && !error && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Beaker className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <div className="text-sm">
              Tune assumptions above, then click <span className="font-semibold">Run engine</span>.
            </div>
          </CardContent>
        </Card>
      )}

      {/* WINNERS CARDS */}
      {winners && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <WinnerCard
            icon={<Trophy className="h-5 w-5" />}
            label="Highest net worth"
            scenario={winners.byNw}
            metric={fmt$(winners.byNw.netWorthFan[winners.byNw.netWorthFan.length - 1].p50)}
            sub="P50 terminal NW"
            tone="emerald"
          />
          <WinnerCard
            icon={<Droplet className="h-5 w-5" />}
            label="Most liquid"
            scenario={winners.byLiquidity}
            metric={fmt$(winners.byLiquidity.cashFan[winners.byLiquidity.cashFan.length - 1].p50)}
            sub="P50 terminal cash"
            tone="sky"
          />
          <WinnerCard
            icon={<Shield className="h-5 w-5" />}
            label="Best risk-adjusted"
            scenario={winners.byRiskAdj}
            metric={fmt$(winners.byRiskAdj.riskMetrics.riskAdjustedNw)}
            sub="P50 × (1 − downside)"
            tone="indigo"
          />
          <WinnerCard
            icon={<Award className="h-5 w-5" />}
            label="Best median outcome"
            scenario={winners.bestMedian}
            metric={fmt$(winners.bestMedian.netWorthFan[winners.bestMedian.netWorthFan.length - 1].p50)}
            sub="Same as NW leader"
            tone="purple"
          />
          <WinnerCard
            icon={<TrendingDown className="h-5 w-5" />}
            label="Worst downside"
            scenario={winners.worstDownside}
            metric={`${(winners.worstDownside.riskMetrics.downsideRisk * 100).toFixed(1)}%`}
            sub="P10 vs P50 drawdown"
            tone="red"
          />
        </div>
      )}

      {/* COMPARISON TABLE */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Scenario comparison · {lastAssumptions.horizonYears}-year horizon · {lastAssumptions.simulationCount} sims</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left">
                  <tr>
                    <th className="py-2 pr-4">Scenario</th>
                    <th className="py-2 pr-4 text-right">Initial NW</th>
                    <th className="py-2 pr-4 text-right">P10 NW</th>
                    <th className="py-2 pr-4 text-right">P50 NW</th>
                    <th className="py-2 pr-4 text-right">P90 NW</th>
                    <th className="py-2 pr-4 text-right">P50 Cash</th>
                    <th className="py-2 pr-4 text-right">DSR</th>
                    <th className="py-2 pr-4 text-right">LVR</th>
                    <th className="py-2 pr-4 text-right">Downside</th>
                    <th className="py-2 pr-4 text-right">Vol (CV)</th>
                    <th className="py-2 pr-4 text-right" title="Probability that property equity goes negative at any point">Neg-Eq P</th>
                    <th className="py-2 pr-4 text-right" title="Probability of cash buffer running below safety threshold">Liq Stress</th>
                    <th className="py-2 pr-4 text-right" title="Probability of breaching APRA serviceability buffer">Refi P</th>
                    <th className="py-2 pr-4 text-right" title="Coefficient of variation across terminal net-worth samples — captures sequence-of-returns dispersion">Seq σ</th>
                    <th className="py-2 pr-4 text-right">Risk-Adj NW</th>
                    <th className="py-2 pr-4">Band</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map(r => {
                    const fanEnd = r.netWorthFan[r.netWorthFan.length - 1];
                    const cashEnd = r.cashFan[r.cashFan.length - 1];
                    const colorKey = SCENARIO_KEY_MAP[r.scenarioId] ?? "base";
                    return (
                      <tr key={r.scenarioId} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="py-2 pr-4 font-medium">
                          <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
                                style={{ backgroundColor: SCENARIO_COLORS[colorKey] }} />
                          {r.name}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{fmt$(r.initialNetWorth)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-red-700">{fmt$(fanEnd.p10)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums font-semibold">{fmt$(fanEnd.p50)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-emerald-700">{fmt$(fanEnd.p90)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{fmt$(cashEnd.p50)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{pct(safeNum(r.serviceability?.dsr))}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{pct(safeNum(r.serviceability?.lvr))}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{pct(r.riskMetrics.downsideRisk)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{pct(r.riskMetrics.volatility)}</td>
                        <td className={`py-2 pr-4 text-right tabular-nums ${r.negativeEquityProbability > 0.10 ? "text-red-700 font-semibold" : ""}`}>{pct(r.negativeEquityProbability)}</td>
                        <td className={`py-2 pr-4 text-right tabular-nums ${r.liquidityStressProbability > 0.10 ? "text-red-700 font-semibold" : ""}`}>{pct(r.liquidityStressProbability)}</td>
                        <td className={`py-2 pr-4 text-right tabular-nums ${r.refinancePressureProbability > 0.10 ? "text-red-700 font-semibold" : ""}`}>{pct(r.refinancePressureProbability)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{pct(r.sequenceDispersion.cv)}</td>
                        <td className="py-2 pr-4 text-right tabular-nums font-semibold">{fmt$(r.riskMetrics.riskAdjustedNw)}</td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline" className={bandClass(r.serviceability?.band ?? "")}>
                            {r.serviceability?.band ?? "—"}
                          </Badge>
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

      {/* STRESS PATHS */}
      {results.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Stress paths · downside probabilities
            </CardTitle>
            <CardDescription className="text-xs">
              Probability of hitting each stress condition at any point over the horizon, plus dispersion of terminal outcomes (sequence-of-returns surrogate). Values above 10% are highlighted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {results.map(r => {
                const colorKey = SCENARIO_KEY_MAP[r.scenarioId] ?? "base";
                return (
                  <div key={r.scenarioId} className="rounded-lg border bg-card p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold truncate">
                      <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: SCENARIO_COLORS[colorKey] }} />
                      <span className="truncate">{r.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[11px]">
                      <div className="text-muted-foreground">Neg-Equity P</div>
                      <div className={`text-right tabular-nums font-semibold ${r.negativeEquityProbability > 0.10 ? "text-red-700" : ""}`}>
                        {pct(r.negativeEquityProbability)}
                      </div>
                      <div className="text-muted-foreground">Liquidity stress</div>
                      <div className={`text-right tabular-nums font-semibold ${r.liquidityStressProbability > 0.10 ? "text-red-700" : ""}`}>
                        {pct(r.liquidityStressProbability)}
                      </div>
                      <div className="text-muted-foreground">Refi pressure</div>
                      <div className={`text-right tabular-nums font-semibold ${r.refinancePressureProbability > 0.10 ? "text-red-700" : ""}`}>
                        {pct(r.refinancePressureProbability)}
                      </div>
                      <div className="text-muted-foreground">Terminal NW CV</div>
                      <div className="text-right tabular-nums font-semibold">
                        {pct(r.sequenceDispersion.cv)}
                      </div>
                      <div className="text-muted-foreground">Terminal rate (P50)</div>
                      <div className="text-right tabular-nums">
                        {(() => {
                          const sorted = [...r.terminalRates].sort((a, b) => a - b);
                          const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
                          return `${(p50 * 100).toFixed(2)}%`;
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
              <strong>Neg-Equity P</strong>: probability that property loan balance ever exceeds property value. {" "}
              <strong>Liquidity stress</strong>: probability that cash buffer drops below 1× monthly expenses. {" "}
              <strong>Refi pressure</strong>: probability of LVR exceeding 90% (APRA refinance friction). {" "}
              <strong>Terminal NW CV</strong>: stddev / mean of terminal net worth across all sims — sequence-of-returns dispersion. {" "}
              <strong>Terminal rate</strong>: median short-rate at horizon end from the Vasicek process.
            </p>
          </CardContent>
        </Card>
      )}

      {/* CHARTS */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Projections</CardTitle>
            <CardDescription>P50 (median) trajectories for net worth, liquidity, and delta vs Base</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="nw">
              <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full max-w-2xl h-auto">
                <TabsTrigger value="nw">Net Worth</TabsTrigger>
                <TabsTrigger value="liq">Liquidity</TabsTrigger>
                <TabsTrigger value="delta">Δ vs Base</TabsTrigger>
                <TabsTrigger value="bands">MC Bands</TabsTrigger>
              </TabsList>

              <TabsContent value="nw" className="pt-4">
                <ResponsiveContainer width="100%" height={360}>
                  <LineChart data={nwChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="year" label={{ value: "Years", position: "insideBottom", offset: -2 }} />
                    <YAxis tickFormatter={(v) => fmt$k(v)} width={70} />
                    <RTooltip formatter={(v: any) => fmt$(v)} labelFormatter={(l) => `Year ${l}`} />
                    <Legend />
                    <Line type="monotone" dataKey="base" stroke={SCENARIO_COLORS.base} name="Base" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="property" stroke={SCENARIO_COLORS.property} name="Property" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="crypto" stroke={SCENARIO_COLORS.crypto} name="Crypto" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cash" stroke={SCENARIO_COLORS.cash} name="Cash" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </TabsContent>

              <TabsContent value="liq" className="pt-4">
                <ResponsiveContainer width="100%" height={360}>
                  <LineChart data={liquidityChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="year" label={{ value: "Years", position: "insideBottom", offset: -2 }} />
                    <YAxis tickFormatter={(v) => fmt$k(v)} width={70} />
                    <RTooltip formatter={(v: any) => fmt$(v)} labelFormatter={(l) => `Year ${l}`} />
                    <Legend />
                    <Line type="monotone" dataKey="base" stroke={SCENARIO_COLORS.base} name="Base" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="property" stroke={SCENARIO_COLORS.property} name="Property" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="crypto" stroke={SCENARIO_COLORS.crypto} name="Crypto" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cash" stroke={SCENARIO_COLORS.cash} name="Cash" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground mt-2">
                  Median (P50) cash balance across all sims — a proxy for liquidity / runway under each strategy.
                </p>
              </TabsContent>

              <TabsContent value="delta" className="pt-4">
                <ResponsiveContainer width="100%" height={360}>
                  <LineChart data={deltaChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="year" label={{ value: "Years", position: "insideBottom", offset: -2 }} />
                    <YAxis tickFormatter={(v) => fmt$k(v)} width={70} />
                    <RTooltip formatter={(v: any) => fmt$(v)} labelFormatter={(l) => `Year ${l}`} />
                    <Legend />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="property" stroke={SCENARIO_COLORS.property} name="Property − Base" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="crypto" stroke={SCENARIO_COLORS.crypto} name="Crypto − Base" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cash" stroke={SCENARIO_COLORS.cash} name="Cash − Base" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground mt-2">
                  Net worth delta vs the Base Case — shows the cumulative value created or destroyed by each allocation.
                </p>
              </TabsContent>

              <TabsContent value="bands" className="pt-4">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {results.map((r, i) => (
                    <Button
                      key={r.scenarioId}
                      variant={i === bandsScenarioIdx ? "default" : "outline"}
                      size="sm"
                      onClick={() => setBandsScenarioIdx(i)}
                    >
                      {r.name}
                    </Button>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={360}>
                  <AreaChart data={bandsChartData} stackOffset="none">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="year" label={{ value: "Years", position: "insideBottom", offset: -2 }} />
                    <YAxis tickFormatter={(v) => fmt$k(v)} width={70} />
                    <RTooltip formatter={(v: any) => fmt$(v)} labelFormatter={(l) => `Year ${l}`} />
                    <Legend />
                    <Area type="monotone" dataKey="p10" stackId="1" stroke="#cbd5e1" fill="#e2e8f0" name="P10" />
                    <Area type="monotone" dataKey="p50Minus10" stackId="1" stroke="#7dd3fc" fill="#bae6fd" name="P10→P50" />
                    <Area type="monotone" dataKey="p90Minus50" stackId="1" stroke="#0ea5e9" fill="#7dd3fc" name="P50→P90" />
                  </AreaChart>
                </ResponsiveContainer>
                <p className="text-xs text-muted-foreground mt-2">
                  Monte Carlo P10/P50/P90 bands for the selected scenario — the spread shows uncertainty under your volatility assumptions.
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Risk + Serviceability rationale */}
      {results.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {results.map(r => (
            <Card key={r.scenarioId}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: SCENARIO_COLORS[SCENARIO_KEY_MAP[r.scenarioId] ?? "base"] }} />
                  {r.name}
                </CardTitle>
                <CardDescription className="text-xs">
                  Risk + serviceability on median final state (year {lastAssumptions.horizonYears})
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <RiskBars metrics={r.riskMetrics} />
                <Separator />
                <ul className="text-xs text-muted-foreground space-y-1">
                  {r.riskMetrics.rationale.map((line, i) => (
                    <li key={`risk-${i}`} className="font-mono leading-snug">{line}</li>
                  ))}
                </ul>
                <Separator />
                <ul className="text-xs text-muted-foreground space-y-1">
                  {r.serviceability.rationale.map((line, i) => (
                    <li key={`serv-${i}`} className="font-mono leading-snug">{line}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Recommendation */}
      {winners && (
        <Card className="border-purple-200 bg-purple-50/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4 text-purple-600" />
              Recommendation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{buildRecommendation(winners, lastAssumptions)}</p>
            <p className="text-[10px] text-muted-foreground mt-3 italic">
              Not personal financial advice. Generated from your ledger + your input assumptions. See the PDF report
              for the full disclaimer.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function WinnerCard({
  icon, label, scenario, metric, sub, tone,
}: {
  icon: React.ReactNode;
  label: string;
  scenario: ExtendedScenarioResult;
  metric: string;
  sub: string;
  tone: "emerald" | "sky" | "indigo" | "purple" | "red";
}) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50",
    sky: "border-sky-200 bg-sky-50",
    indigo: "border-indigo-200 bg-indigo-50",
    purple: "border-purple-200 bg-purple-50",
    red: "border-red-200 bg-red-50",
  };
  return (
    <Card className={tones[tone]}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-sm font-semibold mb-1 truncate" title={scenario.name}>{scenario.name}</div>
        <div className="text-xl font-bold tabular-nums">{metric}</div>
        <div className="text-[10px] text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function RiskBars({ metrics }: { metrics: ExtendedScenarioResult["riskMetrics"] }) {
  const items: Array<{ label: string; value: number; tone: string }> = [
    { label: "Volatility (CV)", value: Math.min(1, metrics.volatility / 0.6), tone: "bg-amber-500" },
    { label: "Downside (P10 vs P50)", value: Math.min(1, metrics.downsideRisk / 0.6), tone: "bg-red-500" },
    { label: "Leverage (LVR)", value: Math.min(1, metrics.leverageRisk / 1.0), tone: "bg-indigo-500" },
    { label: "Liquidity shortfall", value: Math.min(1, metrics.liquidityRisk), tone: "bg-sky-500" },
    { label: "Concentration", value: Math.min(1, metrics.concentrationRisk), tone: "bg-purple-500" },
  ];
  return (
    <div className="space-y-1.5">
      {items.map(it => (
        <div key={it.label}>
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>{it.label}</span>
            <span className="tabular-nums">{(it.value * 100).toFixed(0)}%</span>
          </div>
          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div className={`h-full ${it.tone}`} style={{ width: `${it.value * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Recommendation text generator ───────────────────────────────────────────

function buildRecommendation(
  winners: NonNullable<ReturnType<typeof useMemo>> & {
    byNw: ExtendedScenarioResult;
    byLiquidity: ExtendedScenarioResult;
    byRiskAdj: ExtendedScenarioResult;
    bestMedian: ExtendedScenarioResult;
    worstDownside: ExtendedScenarioResult;
  },
  u: UserAssumptions,
): string {
  const lead = winners.byRiskAdj;
  const nwEnd = lead.netWorthFan[lead.netWorthFan.length - 1];
  const cashEnd = lead.cashFan[lead.cashFan.length - 1];

  let body = `Based on a ${u.horizonYears}-year horizon and ${u.simulationCount} Monte Carlo sims, ` +
    `the best risk-adjusted outcome for your ${fmt$(u.capital)} is the "${lead.name}" path: ` +
    `${fmt$(nwEnd.p50)} median net worth with ${fmt$(cashEnd.p50)} median terminal cash, ` +
    `a ${(lead.riskMetrics.downsideRisk * 100).toFixed(1)}% downside (P10 vs P50), and a ` +
    `serviceability band of "${lead.serviceability.band}". `;

  if (winners.byNw.scenarioId !== winners.byRiskAdj.scenarioId) {
    body += `Note that "${winners.byNw.name}" has a higher raw P50 net worth (` +
      `${fmt$(winners.byNw.netWorthFan[winners.byNw.netWorthFan.length - 1].p50)}) but its downside ` +
      `(${(winners.byNw.riskMetrics.downsideRisk * 100).toFixed(1)}%) means risk-adjusted returns favour the option above. `;
  }

  if (winners.worstDownside.scenarioId === "crypto_50k") {
    body += `Crypto shows the widest dispersion under your ${u.cryptoVolPct}% σ assumption — ` +
      `treat it as a barbell allocation, not a core holding. `;
  } else if (winners.worstDownside.scenarioId === "property_50k") {
    body += `Property carries leverage and illiquidity risk — confirm serviceability holds under a ` +
      `rate shock before committing. `;
  }

  if (winners.byLiquidity.scenarioId === "cash_50k") {
    body += `Cash preserves the most optionality (highest terminal liquidity) but at the cost of ` +
      `long-run net worth under a ${u.cashAprPct}% APR vs ${u.propertyGrowthPct}% property growth assumption.`;
  }

  return body;
}

/**
 * scenario-compare-v2.tsx — Premium Family Wealth Lab
 *
 * Sessions 2+3 redesign:
 *   • Premium fintech UX (hero, decision summary, confidence ribbon, narrative cards)
 *   • Mobile-first iPhone-grade layout (sticky picker, swipeable cards, bottom action bar,
 *     table→cards on mobile, touch-friendly sliders)
 *   • Real ledger only (live Supabase). No demo fallback.
 *   • Save/Load/Clone/Re-run scenarios + assumption presets (persisted to Supabase)
 *   • Narrative engine: plain-English stories, why-this-wins, what-could-go-wrong
 *   • Executive-grade PDF with branded cover, charts, scenario details, recommendation
 *   • Determinism + audit trail: seed, snapshot_hash, assumptions_hash stored per save
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/finance";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Beaker, CheckCircle2, AlertTriangle, Play, RefreshCw, Download,
  Trophy, Droplet, Shield, TrendingDown, Settings,
  Award, ChevronUp, ChevronDown, Save, FolderOpen, Copy, Trash2,
  Sparkles, ArrowRight, Star, Info,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ReferenceLine,
} from "recharts";

import {
  runScenarioV2,
  type ExtendedScenarioResult,
  type ScenarioDelta,
  type BasePlanAssumptions,
  snapshotHash,
  deriveAssumptionsHash,
  buildComparisonNarrative,
  generatePremiumPdf,
  v2Persistence,
  v2Presets,
  v2LastAssumptions,
  type SavedScenario,
  type AssumptionPreset,
  type ComparisonNarrative,
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
  propertyGrowthPct: number;
  propertyVolPct: number;
  cryptoReturnPct: number;
  cryptoVolPct: number;
  cashAprPct: number;
  mortgageRatePct: number;
  rentYieldPct: number;
  horizonYears: number;
  simulationCount: number;
  capital: number;
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
  base: "#64748b",
  property: "#0ea5e9",
  crypto: "#f59e0b",
  cash: "#10b981",
};

const SCENARIO_KEY_MAP: Record<string, keyof typeof SCENARIO_COLORS> = {
  "base": "base",
  "property_50k": "property",
  "crypto_50k": "crypto",
  "cash_50k": "cash",
};

const SCENARIO_GRADIENT: Record<string, string> = {
  base: "from-slate-500 to-slate-600",
  property_50k: "from-sky-500 to-blue-600",
  crypto_50k: "from-amber-500 to-orange-600",
  cash_50k: "from-emerald-500 to-teal-600",
};

const pct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;
const fmt$ = (n: number) => formatCurrency(Math.round(n));
const fmt$k = (n: number) => `$${(Math.round(n) / 1000).toFixed(0)}k`;
const fmt$M = (n: number) =>
  Math.abs(n) >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : `$${(Math.round(n / 1000))}k`;

const bandClass = (band?: string) =>
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
  const purchasePrice = u.capital * 5;
  const weeklyRent = Math.round((purchasePrice * (u.rentYieldPct / 100)) / 52);

  return [
    { scenarioId: "base", name: "Base Case", deltas: [] },
    {
      scenarioId: "property_50k",
      name: `+${fmt$k(u.capital)} Property Deposit`,
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
      name: `+${fmt$k(u.capital)} Crypto`,
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
      name: `Hold ${fmt$k(u.capital)} as Cash`,
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

// ─── Premium slider row (touch-friendly) ─────────────────────────────────────

function SliderRow({
  label, value, min, max, step, suffix, onChange, hint,
}: {
  label: string;
  value: number;
  min: number; max: number; step: number;
  suffix?: string;
  onChange: (n: number) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs font-medium text-foreground">{label}</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n)) onChange(n);
            }}
            min={min} max={max} step={step}
            className="h-8 w-24 text-right text-xs tabular-nums"
          />
          {suffix && <span className="text-xs text-muted-foreground w-8 shrink-0">{suffix}</span>}
        </div>
      </div>
      <Slider
        value={[value]} min={min} max={max} step={step}
        onValueChange={([v]) => onChange(v)}
        className="py-2"
      />
      {hint && <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>}
    </div>
  );
}

// ─── Confidence ribbon ────────────────────────────────────────────────────────

function ConfidenceRibbon({ value, label }: { value: number; label?: string }) {
  const tone =
    value >= 70 ? "bg-emerald-500" :
    value >= 50 ? "bg-amber-500" : "bg-rose-500";
  const textTone =
    value >= 70 ? "text-emerald-700 dark:text-emerald-400" :
    value >= 50 ? "text-amber-700 dark:text-amber-400" : "text-rose-700 dark:text-rose-400";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label ?? "Confidence"}</span>
        <span className={`font-semibold tabular-nums ${textTone}`}>{value}%</span>
      </div>
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${tone} transition-all duration-500`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ─── Stat tile (premium, mobile-friendly) ─────────────────────────────────────

function StatTile({
  label, value, sub, tone = "default", icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "emerald" | "rose" | "sky" | "amber" | "indigo";
  icon?: React.ReactNode;
}) {
  const tones = {
    default: "border-border bg-card",
    emerald: "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20",
    rose: "border-rose-200 bg-rose-50/50 dark:bg-rose-950/20",
    sky: "border-sky-200 bg-sky-50/50 dark:bg-sky-950/20",
    amber: "border-amber-200 bg-amber-50/50 dark:bg-amber-950/20",
    indigo: "border-indigo-200 bg-indigo-50/50 dark:bg-indigo-950/20",
  };
  const valueTones = {
    default: "text-foreground",
    emerald: "text-emerald-700 dark:text-emerald-400",
    rose: "text-rose-700 dark:text-rose-400",
    sky: "text-sky-700 dark:text-sky-400",
    amber: "text-amber-700 dark:text-amber-400",
    indigo: "text-indigo-700 dark:text-indigo-400",
  };
  return (
    <div className={`rounded-xl border ${tones[tone]} p-4 space-y-1.5 min-w-0`}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-xl sm:text-2xl font-bold tabular-nums ${valueTones[tone]} truncate`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

// ─── Scenario narrative card (premium, mobile-swipeable) ──────────────────────

function NarrativeCard({
  scenarioId, name, headline, story, keyMoves, whyItWorks, whatCouldGoWrong, confidence,
  result, isWinner,
}: {
  scenarioId: string;
  name: string;
  headline: string;
  story: string;
  keyMoves: string[];
  whyItWorks: string;
  whatCouldGoWrong: string;
  confidence: number;
  result: ExtendedScenarioResult;
  isWinner: boolean;
}) {
  const fanEnd = result.netWorthFan[result.netWorthFan.length - 1];
  const cashEnd = result.cashFan[result.cashFan.length - 1];
  const gradient = SCENARIO_GRADIENT[scenarioId] ?? "from-slate-500 to-slate-600";

  return (
    <Card className={`overflow-hidden ${isWinner ? "ring-2 ring-purple-400 shadow-lg" : ""}`}>
      {/* Gradient header */}
      <div className={`bg-gradient-to-r ${gradient} p-4 text-white relative`}>
        {isWinner && (
          <Badge className="absolute top-3 right-3 bg-white/95 text-purple-700 font-semibold shadow">
            <Star className="h-3 w-3 mr-1 fill-current" />
            Recommended
          </Badge>
        )}
        <div className="flex items-center gap-2 text-white/85 text-xs font-semibold uppercase tracking-wide mb-1">
          <Sparkles className="h-3.5 w-3.5" />
          {scenarioId === "base" ? "Stay the course" : "Allocation path"}
        </div>
        <h3 className="text-lg sm:text-xl font-bold leading-tight">{name}</h3>
        <p className="text-white/90 text-sm mt-2 leading-snug">{headline}</p>
      </div>

      <CardContent className="pt-4 space-y-4">
        {/* KPI row */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <div className="text-[10px] uppercase text-muted-foreground font-semibold">P50 NW</div>
            <div className="text-base font-bold tabular-nums">{fmt$M(fanEnd.p50)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground font-semibold">P10 / P90</div>
            <div className="text-xs font-semibold tabular-nums text-rose-700">{fmt$M(fanEnd.p10)}</div>
            <div className="text-xs font-semibold tabular-nums text-emerald-700">{fmt$M(fanEnd.p90)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-muted-foreground font-semibold">Cash</div>
            <div className="text-base font-bold tabular-nums text-sky-700">{fmt$M(cashEnd.p50)}</div>
          </div>
        </div>

        {/* Confidence */}
        <ConfidenceRibbon value={confidence} label="Path confidence" />

        {/* Story */}
        <p className="text-sm leading-relaxed text-foreground/90">{story}</p>

        {/* Key moves */}
        {keyMoves.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] uppercase font-semibold text-muted-foreground tracking-wide">
              What happens
            </div>
            <ul className="space-y-1">
              {keyMoves.map((m, i) => (
                <li key={i} className="text-xs flex gap-2 items-start">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="text-foreground/85">{m}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Why / risk two-up */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-2.5">
            <div className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 tracking-wide mb-1">
              Why it works
            </div>
            <p className="text-xs text-foreground/80 leading-snug">{whyItWorks}</p>
          </div>
          <div className="rounded-lg bg-rose-50 dark:bg-rose-950/20 p-2.5">
            <div className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400 tracking-wide mb-1">
              What could go wrong
            </div>
            <p className="text-xs text-foreground/80 leading-snug">{whatCouldGoWrong}</p>
          </div>
        </div>

        {/* Stress chips */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className={result.negativeEquityProbability > 0.1 ? "border-rose-300 text-rose-700" : ""}>
            Neg-Eq {pct(result.negativeEquityProbability, 0)}
          </Badge>
          <Badge variant="outline" className={result.liquidityStressProbability > 0.1 ? "border-rose-300 text-rose-700" : ""}>
            Liq stress {pct(result.liquidityStressProbability, 0)}
          </Badge>
          <Badge variant="outline" className={bandClass(result.serviceability?.band)}>
            {result.serviceability?.band ?? "—"}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ScenarioCompareV2Page() {
  // ── Live ledger queries ────────────────────────────────────────────────────
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

  // Compute snapshot hash for audit + staleness
  const currentSnapshotHash = useMemo(() => {
    return snapshot ? snapshotHash(snapshot) : null;
  }, [snapshot]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [assumptions, setAssumptions] = useState<UserAssumptions>(DEFAULT_USER_ASSUMPTIONS);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [results, setResults] = useState<ExtendedScenarioResult[]>([]);
  const [lastAssumptions, setLastAssumptions] = useState<UserAssumptions>(DEFAULT_USER_ASSUMPTIONS);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeScenarioIdx, setActiveScenarioIdx] = useState(0);

  // Persistence state
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [presets, setPresets] = useState<AssumptionPreset[]>([]);
  const [loadedScenarioId, setLoadedScenarioId] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [loadSheetOpen, setLoadSheetOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);
  const nwChartRef = useRef<HTMLDivElement>(null);
  const liquidityChartRef = useRef<HTMLDivElement>(null);
  const bandsChartRef = useRef<HTMLDivElement>(null);

  // ── Restore last-used assumptions on mount ────────────────────────────────
  useEffect(() => {
    const last = v2LastAssumptions.load<UserAssumptions>();
    if (last && typeof last === "object") {
      setAssumptions(prev => ({ ...prev, ...last }));
    }
  }, []);

  // Save last assumptions whenever they change
  useEffect(() => {
    v2LastAssumptions.save(assumptions);
  }, [assumptions]);

  // Load saved scenarios + presets
  const refreshSaved = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([v2Persistence.list(), v2Presets.list()]);
      setSavedScenarios(s);
      setPresets(p);
    } catch (err) {
      console.warn("[v2] failed to load saved:", err);
    }
  }, []);

  useEffect(() => {
    refreshSaved();
  }, [refreshSaved]);

  // ── Run engine ────────────────────────────────────────────────────────────
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
        const t0 = performance.now();

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
        const elapsedMs = Math.round(performance.now() - t0);

        setResults(out);
        setLastAssumptions(assumptions);
        setActiveScenarioIdx(0);

        // If a scenario is loaded, update its last_run on Supabase
        if (loadedScenarioId && !loadedScenarioId.startsWith("local-")) {
          v2Persistence.updateLastRun(loadedScenarioId, { results: out } as any, elapsedMs)
            .catch(err => console.warn("[v2] updateLastRun failed:", err));
        }
      } catch (e: any) {
        console.error("[scenario-v2] run failed:", e);
        setError(e?.message ?? String(e));
      } finally {
        setRunning(false);
      }
    }, 50);
  }, [dashboardInputs, assumptions, loadedScenarioId]);

  // ── Save scenario ─────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (results.length === 0) return;
    if (!saveName.trim()) return;
    try {
      const now = new Date();
      const startMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const deltas: ScenarioDelta[] = buildSliceScenarios(startMonth, assumptions).flatMap(s => s.deltas);

      const payload = {
        name: saveName.trim(),
        description: saveDescription.trim() || null,
        assumptions: assumptions as unknown as Record<string, unknown>,
        deltas,
        horizonMonths: assumptions.horizonYears * 12,
        simulationCount: assumptions.simulationCount,
        startMonth,
        snapshotHash: currentSnapshotHash ?? undefined,
        lastResult: { results } as unknown as Record<string, unknown>,
        lastRunAt: new Date().toISOString(),
        lastRunMs: 0,
      };

      if (loadedScenarioId && !loadedScenarioId.startsWith("local-")) {
        await v2Persistence.update(loadedScenarioId, payload);
      } else {
        const saved = await v2Persistence.create(payload);
        setLoadedScenarioId(saved.id);
      }
      await refreshSaved();
      setSaveDialogOpen(false);
      setSaveName("");
      setSaveDescription("");
    } catch (err: any) {
      console.error("[v2] save failed:", err);
      setError(`Save failed: ${err?.message ?? err}`);
    }
  }, [results, saveName, saveDescription, assumptions, currentSnapshotHash, loadedScenarioId, refreshSaved]);

  // ── Load saved scenario ───────────────────────────────────────────────────
  const handleLoad = useCallback(async (id: string) => {
    try {
      const s = await v2Persistence.getById(id);
      if (!s) return;
      const a = s.assumptions as unknown as UserAssumptions;
      if (a && typeof a === "object") {
        setAssumptions(prev => ({ ...prev, ...a }));
        setLastAssumptions(prev => ({ ...prev, ...a }));
      }
      const lr = (s.last_result as any)?.results as ExtendedScenarioResult[] | undefined;
      if (Array.isArray(lr) && lr.length > 0) {
        setResults(lr);
      } else {
        // No cached result — clear so user can re-run
        setResults([]);
      }
      setLoadedScenarioId(s.id);
      setLoadSheetOpen(false);
    } catch (err: any) {
      console.error("[v2] load failed:", err);
      setError(`Load failed: ${err?.message ?? err}`);
    }
  }, []);

  // ── Clone scenario ────────────────────────────────────────────────────────
  const handleClone = useCallback(async (id: string, srcName: string) => {
    try {
      const cloned = await v2Persistence.clone(id, `${srcName} (copy)`);
      setLoadedScenarioId(cloned.id);
      await refreshSaved();
    } catch (err: any) {
      console.error("[v2] clone failed:", err);
      setError(`Clone failed: ${err?.message ?? err}`);
    }
  }, [refreshSaved]);

  // ── Delete scenario ───────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this scenario?")) return;
    try {
      await v2Persistence.delete(id);
      if (loadedScenarioId === id) setLoadedScenarioId(null);
      await refreshSaved();
    } catch (err: any) {
      console.error("[v2] delete failed:", err);
      setError(`Delete failed: ${err?.message ?? err}`);
    }
  }, [loadedScenarioId, refreshSaved]);

  // ── Reset to new scenario ─────────────────────────────────────────────────
  const handleNewScenario = useCallback(() => {
    setLoadedScenarioId(null);
    setResults([]);
    setError(null);
  }, []);

  // ── Narrative ─────────────────────────────────────────────────────────────
  const narrative: ComparisonNarrative | null = useMemo(() => {
    if (results.length === 0) return null;
    return buildComparisonNarrative({
      results,
      horizonYears: lastAssumptions.horizonYears,
      simulationCount: lastAssumptions.simulationCount,
      capital: lastAssumptions.capital,
      propertyGrowthPct: lastAssumptions.propertyGrowthPct,
      cryptoVolPct: lastAssumptions.cryptoVolPct,
      cashAprPct: lastAssumptions.cashAprPct,
      mortgageRatePct: lastAssumptions.mortgageRatePct,
    });
  }, [results, lastAssumptions]);

  // ── Winners (for compact strip) ───────────────────────────────────────────
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
    const worstDownside = [...results].sort(
      (a, b) => b.riskMetrics.downsideRisk - a.riskMetrics.downsideRisk,
    )[0];
    return { byNw, byLiquidity, byRiskAdj, worstDownside };
  }, [results]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const nwChartData = useMemo(() => {
    if (results.length === 0) return [];
    const M = results[0].netWorthFan.length;
    const rows: any[] = [];
    for (let i = 0; i < M; i++) {
      const yr = (i + 1) / 12;
      const row: any = { year: yr.toFixed(1) };
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
    const base = results.find(r => r.scenarioId === "base");
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
  }, [results]);

  const [bandsScenarioIdx, setBandsScenarioIdx] = useState(1);
  const bandsChartData = useMemo(() => {
    if (results.length === 0) return [];
    const r = results[bandsScenarioIdx] ?? results[0];
    return r.netWorthFan.map((f, i) => ({
      year: ((i + 1) / 12).toFixed(1),
      p10: f.p10,
      p50Minus10: f.p50 - f.p10,
      p90Minus50: f.p90 - f.p50,
    }));
  }, [results, bandsScenarioIdx]);

  // ── PDF download ──────────────────────────────────────────────────────────
  const handleDownloadPdf = useCallback(async () => {
    if (results.length === 0 || !narrative) return;
    setPdfBusy(true);
    try {
      const now = new Date();
      const startMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const deltas = buildSliceScenarios(startMonth, lastAssumptions).flatMap(s => s.deltas);
      const aHash = deriveAssumptionsHash({
        assumptions: lastAssumptions as unknown as Record<string, unknown>,
        deltas,
        horizonMonths: lastAssumptions.horizonYears * 12,
        simulationCount: lastAssumptions.simulationCount,
        startMonth,
      });

      const doc = await generatePremiumPdf({
        householdName: "Shahrokh Family",
        capital: lastAssumptions.capital,
        horizonYears: lastAssumptions.horizonYears,
        simulationCount: lastAssumptions.simulationCount,
        generatedAt: new Date().toISOString(),
        results,
        narrative,
        assumptions: {
          propertyGrowthPct: lastAssumptions.propertyGrowthPct,
          propertyVolPct: lastAssumptions.propertyVolPct,
          cryptoReturnPct: lastAssumptions.cryptoReturnPct,
          cryptoVolPct: lastAssumptions.cryptoVolPct,
          cashAprPct: lastAssumptions.cashAprPct,
          mortgageRatePct: lastAssumptions.mortgageRatePct,
          rentYieldPct: lastAssumptions.rentYieldPct,
        },
        snapshotHash: currentSnapshotHash ?? undefined,
        assumptionsHash: aHash,
        chartEls: {
          nwChart: nwChartRef.current,
          liquidityChart: liquidityChartRef.current,
          bandsChart: bandsChartRef.current,
        },
      });
      doc.save(`family-wealth-lab-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err: any) {
      console.error("[v2] pdf failed:", err);
      setError(`PDF generation failed: ${err?.message ?? err}`);
    } finally {
      setPdfBusy(false);
    }
  }, [results, narrative, lastAssumptions, currentSnapshotHash]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const winner = narrative && results.find(r => r.scenarioId === narrative.winnerScenarioId);
  const base = results.find(r => r.scenarioId === "base");
  const baseFanEnd = base?.netWorthFan[base.netWorthFan.length - 1];
  const winnerFanEnd = winner?.netWorthFan[winner.netWorthFan.length - 1];

  return (
    <div className="pb-24 md:pb-6" ref={reportRef}>
      {/* ─── HERO HEADER (gradient) ────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 text-white">
        <div className="absolute inset-0 opacity-20"
             style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 0%, transparent 50%)" }} />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-8 sm:pt-10 sm:pb-12">
          <div className="flex items-center gap-2 text-white/80 text-xs font-semibold uppercase tracking-wider mb-2">
            <Beaker className="h-4 w-4" />
            <span>Family Wealth Lab · Scenario Engine V2</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-tight">
            Where should your{" "}
            <span className="bg-gradient-to-r from-amber-300 to-yellow-200 bg-clip-text text-transparent">
              {fmt$k(assumptions.capital)}
            </span>{" "}
            go?
          </h1>
          <p className="text-white/85 text-sm sm:text-base mt-3 max-w-3xl leading-relaxed">
            Deterministic Monte Carlo across Property, Crypto, and Cash — measured against your live ledger.
            Real volatility, real leverage, real serviceability scoring.
          </p>

          {/* Header action chips */}
          <div className="flex items-center gap-2 mt-4 sm:mt-6 flex-wrap">
            {loadedScenarioId && (
              <Badge className="bg-white/95 text-purple-700 font-semibold px-3 py-1">
                <FolderOpen className="h-3 w-3 mr-1.5 inline" />
                Loaded: {savedScenarios.find(s => s.id === loadedScenarioId)?.name ?? "(unsaved)"}
              </Badge>
            )}
            {base?.reconcilesToDashboard && (
              <Badge className="bg-emerald-500/95 text-white font-semibold px-3 py-1">
                <CheckCircle2 className="h-3 w-3 mr-1.5 inline" />
                Reconciles to your dashboard
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* ─── MAIN CONTENT ───────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 -mt-6 space-y-4 sm:space-y-6">
        {/* ── DECISION SUMMARY CARD (premium) ───────────────────────────── */}
        {narrative && winner && winnerFanEnd && (
          <Card className="overflow-hidden shadow-xl border-purple-200">
            <div className="bg-gradient-to-r from-purple-50 via-fuchsia-50 to-indigo-50 dark:from-purple-950/30 dark:via-fuchsia-950/30 dark:to-indigo-950/30 p-5 sm:p-6">
              <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 text-xs font-bold uppercase tracking-wider mb-2">
                <Award className="h-4 w-4" />
                The recommendation
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">
                {winner.name}
              </h2>
              <p className="text-sm sm:text-base text-foreground/80 mt-2 leading-relaxed">
                {narrative.tldr}
              </p>
              <div className="mt-4">
                <ConfidenceRibbon value={narrative.confidenceOverall} label="Overall confidence" />
              </div>
            </div>
            <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-5">
              <StatTile
                label="Median NW"
                value={fmt$M(winnerFanEnd.p50)}
                sub={`${lastAssumptions.horizonYears}-year horizon`}
                tone="indigo"
              />
              <StatTile
                label="vs Base"
                value={baseFanEnd ? fmt$M(winnerFanEnd.p50 - baseFanEnd.p50) : "—"}
                sub={baseFanEnd ? `Base: ${fmt$M(baseFanEnd.p50)}` : ""}
                tone={baseFanEnd && winnerFanEnd.p50 >= baseFanEnd.p50 ? "emerald" : "rose"}
              />
              <StatTile
                label="Downside"
                value={pct(winner.riskMetrics.downsideRisk, 1)}
                sub="P10 vs P50"
                tone="amber"
              />
              <StatTile
                label="Terminal Cash"
                value={fmt$M(winner.cashFan[winner.cashFan.length - 1].p50)}
                sub="P50 liquidity"
                tone="sky"
              />
            </CardContent>
          </Card>
        )}

        {/* ── LIVE LEDGER STRIP ────────────────────────────────────────── */}
        {liveReadouts && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center justify-between flex-wrap gap-2">
                <span className="text-muted-foreground">Live ledger — your starting point</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  hash:{currentSnapshotHash?.slice(0, 8) ?? "—"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatTile label="Monthly income" value={fmt$(liveReadouts.income)} icon={null} />
              <StatTile label="Monthly expenses" value={fmt$(liveReadouts.expenses)} />
              <StatTile label="Monthly surplus" value={fmt$(liveReadouts.surplus)} tone="emerald" />
              <StatTile label="Cash today" value={fmt$(liveReadouts.cash)} tone="sky" />
            </CardContent>
          </Card>
        )}

        {/* ── ACTION BAR (desktop only — mobile has sticky bottom bar) ──── */}
        <div className="hidden md:flex items-center gap-2 flex-wrap">
          <Button
            onClick={handleRun}
            disabled={!dashboardInputs || running}
            size="lg"
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-md"
          >
            {running ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            {running ? "Running…" : results.length ? "Re-run engine" : "Run engine"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowAssumptions(s => !s)}
          >
            <Settings className="h-4 w-4 mr-2" />
            Assumptions
            {showAssumptions ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
          </Button>

          {results.length > 0 && (
            <>
              <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" onClick={() => {
                    setSaveName(loadedScenarioId
                      ? savedScenarios.find(s => s.id === loadedScenarioId)?.name ?? ""
                      : `Scenario ${new Date().toLocaleDateString("en-AU")}`);
                  }}>
                    <Save className="h-4 w-4 mr-2" />
                    {loadedScenarioId ? "Update" : "Save"}
                  </Button>
                </DialogTrigger>
                <SaveDialog
                  saveName={saveName} setSaveName={setSaveName}
                  saveDescription={saveDescription} setSaveDescription={setSaveDescription}
                  isUpdate={!!loadedScenarioId}
                  onSubmit={handleSave}
                />
              </Dialog>

              <Button variant="outline" onClick={handleDownloadPdf} disabled={pdfBusy}>
                {pdfBusy ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                {pdfBusy ? "Building PDF…" : "Download PDF"}
              </Button>
            </>
          )}

          <Sheet open={loadSheetOpen} onOpenChange={setLoadSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline">
                <FolderOpen className="h-4 w-4 mr-2" />
                Saved ({savedScenarios.length})
              </Button>
            </SheetTrigger>
            <LoadSheet
              savedScenarios={savedScenarios}
              loadedScenarioId={loadedScenarioId}
              onLoad={handleLoad}
              onClone={handleClone}
              onDelete={handleDelete}
            />
          </Sheet>

          {loadedScenarioId && (
            <Button variant="ghost" size="sm" onClick={handleNewScenario}>
              + New scenario
            </Button>
          )}
        </div>

        {/* ── ASSUMPTIONS PANEL ─────────────────────────────────────────── */}
        {showAssumptions && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Assumptions
              </CardTitle>
              <CardDescription className="text-xs">
                Tune market assumptions to match your view. Re-run after changing.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
              <SliderRow label="Capital to allocate" value={assumptions.capital}
                min={10_000} max={500_000} step={5_000} suffix="$"
                onChange={n => setAssumptions(a => ({ ...a, capital: n }))}
                hint="The marginal cash you're deciding how to deploy" />
              <SliderRow label="Property growth (capital)" value={assumptions.propertyGrowthPct}
                min={0} max={12} step={0.25} suffix="%/yr"
                onChange={n => setAssumptions(a => ({ ...a, propertyGrowthPct: n }))}
                hint="Long-run capital growth for residential property" />
              <SliderRow label="Property volatility (σ)" value={assumptions.propertyVolPct}
                min={2} max={15} step={0.5} suffix="%/yr"
                onChange={n => setAssumptions(a => ({ ...a, propertyVolPct: n }))}
                hint="Annual std-dev of property returns — drives MC dispersion" />
              <SliderRow label="Crypto return" value={assumptions.cryptoReturnPct}
                min={-10} max={50} step={1} suffix="%/yr"
                onChange={n => setAssumptions(a => ({ ...a, cryptoReturnPct: n }))}
                hint="Expected long-run crypto return" />
              <SliderRow label="Crypto volatility (σ)" value={assumptions.cryptoVolPct}
                min={20} max={120} step={5} suffix="%/yr"
                onChange={n => setAssumptions(a => ({ ...a, cryptoVolPct: n }))}
                hint="High vol = wide MC fan" />
              <SliderRow label="Cash / offset APR" value={assumptions.cashAprPct}
                min={0} max={8} step={0.1} suffix="%/yr"
                onChange={n => setAssumptions(a => ({ ...a, cashAprPct: n }))}
                hint="After-tax cash/savings rate" />
              <SliderRow label="Mortgage rate" value={assumptions.mortgageRatePct}
                min={2} max={12} step={0.05} suffix="%/yr"
                onChange={n => setAssumptions(a => ({ ...a, mortgageRatePct: n }))}
                hint="Applied to any new investment property loan" />
              <SliderRow label="Gross rent yield" value={assumptions.rentYieldPct}
                min={2} max={8} step={0.1} suffix="%/yr"
                onChange={n => setAssumptions(a => ({ ...a, rentYieldPct: n }))}
                hint="Annual rent / purchase price (before vacancy + mgmt)" />
              <SliderRow label="Forecast horizon" value={assumptions.horizonYears}
                min={3} max={30} step={1} suffix="yr"
                onChange={n => setAssumptions(a => ({ ...a, horizonYears: n }))}
                hint="How many years to project" />
              <SliderRow label="Monte Carlo sims" value={assumptions.simulationCount}
                min={100} max={2000} step={100} suffix=""
                onChange={n => setAssumptions(a => ({ ...a, simulationCount: n }))}
                hint="More sims = smoother percentile estimates" />
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

        {/* ── EMPTY STATE ───────────────────────────────────────────────── */}
        {!running && results.length === 0 && !error && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center mb-4">
                <Beaker className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="text-base font-semibold mb-1">Ready to run</h3>
              <p className="text-sm text-muted-foreground mb-4">
                We'll compare {fmt$k(assumptions.capital)} across 4 paths using your live ledger.
              </p>
              <Button onClick={handleRun} disabled={!dashboardInputs}
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                <Play className="h-4 w-4 mr-2" />
                Run engine
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── WINNER STRIP ─────────────────────────────────────────────── */}
        {winners && narrative && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile
              icon={<Trophy className="h-3.5 w-3.5" />}
              label="Highest NW"
              value={fmt$M(winners.byNw.netWorthFan[winners.byNw.netWorthFan.length - 1].p50)}
              sub={winners.byNw.name}
              tone="indigo"
            />
            <StatTile
              icon={<Droplet className="h-3.5 w-3.5" />}
              label="Most liquid"
              value={fmt$M(winners.byLiquidity.cashFan[winners.byLiquidity.cashFan.length - 1].p50)}
              sub={winners.byLiquidity.name}
              tone="sky"
            />
            <StatTile
              icon={<Shield className="h-3.5 w-3.5" />}
              label="Risk-adjusted"
              value={fmt$M(winners.byRiskAdj.riskMetrics.riskAdjustedNw)}
              sub={winners.byRiskAdj.name}
              tone="emerald"
            />
            <StatTile
              icon={<TrendingDown className="h-3.5 w-3.5" />}
              label="Worst downside"
              value={pct(winners.worstDownside.riskMetrics.downsideRisk, 1)}
              sub={winners.worstDownside.name}
              tone="rose"
            />
          </div>
        )}

        {/* ── SCENARIO PICKER (mobile-first, sticky on mobile) ─────────── */}
        {results.length > 0 && narrative && (
          <div className="sticky top-0 z-20 -mx-4 sm:mx-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 border-b sm:border sm:rounded-xl sm:bg-card sm:backdrop-blur-none">
            <div className="px-4 sm:px-3 py-2 sm:py-2.5">
              <div className="text-[11px] uppercase font-bold text-muted-foreground tracking-wider mb-1.5 sm:hidden">
                Scenarios
              </div>
              <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 scrollbar-thin">
                {results.map((r, idx) => {
                  const isActive = idx === activeScenarioIdx;
                  const isWinner = r.scenarioId === narrative.winnerScenarioId;
                  const key = SCENARIO_KEY_MAP[r.scenarioId] ?? "base";
                  return (
                    <button
                      key={r.scenarioId}
                      onClick={() => setActiveScenarioIdx(idx)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        isActive
                          ? "bg-foreground text-background shadow-sm"
                          : "bg-muted hover:bg-muted/80 text-foreground/70"
                      }`}
                    >
                      <span className="inline-block w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: SCENARIO_COLORS[key] }} />
                      <span className="truncate max-w-[140px]">{r.name}</span>
                      {isWinner && <Star className="h-3 w-3 fill-amber-400 text-amber-400" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── ACTIVE SCENARIO NARRATIVE CARD ─────────────────────────────── */}
        {results.length > 0 && narrative && results[activeScenarioIdx] && (
          <NarrativeCard
            scenarioId={results[activeScenarioIdx].scenarioId}
            name={results[activeScenarioIdx].name}
            headline={narrative.scenarios[activeScenarioIdx]?.headline ?? ""}
            story={narrative.scenarios[activeScenarioIdx]?.story ?? ""}
            keyMoves={narrative.scenarios[activeScenarioIdx]?.keyMoves ?? []}
            whyItWorks={narrative.scenarios[activeScenarioIdx]?.whyItWorks ?? ""}
            whatCouldGoWrong={narrative.scenarios[activeScenarioIdx]?.whatCouldGoWrong ?? ""}
            confidence={narrative.scenarios[activeScenarioIdx]?.confidence ?? 50}
            result={results[activeScenarioIdx]}
            isWinner={results[activeScenarioIdx].scenarioId === narrative.winnerScenarioId}
          />
        )}

        {/* ── CHARTS ───────────────────────────────────────────────────── */}
        {results.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Projections</CardTitle>
              <CardDescription>P50 (median) trajectories — net worth, liquidity, and delta vs Base</CardDescription>
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
                  <div ref={nwChartRef} className="bg-white rounded">
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={nwChartData} margin={{ top: 10, right: 10, left: 0, bottom: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="year" label={{ value: "Years", position: "insideBottom", offset: -4, fontSize: 11 }} fontSize={11} />
                        <YAxis tickFormatter={(v) => fmt$k(v)} width={62} fontSize={11} />
                        <RTooltip formatter={(v: any) => fmt$(v)} labelFormatter={(l) => `Year ${l}`} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="base" stroke={SCENARIO_COLORS.base} name="Base" strokeWidth={2.5} dot={false} />
                        <Line type="monotone" dataKey="property" stroke={SCENARIO_COLORS.property} name="Property" strokeWidth={2.5} dot={false} />
                        <Line type="monotone" dataKey="crypto" stroke={SCENARIO_COLORS.crypto} name="Crypto" strokeWidth={2.5} dot={false} />
                        <Line type="monotone" dataKey="cash" stroke={SCENARIO_COLORS.cash} name="Cash" strokeWidth={2.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>

                <TabsContent value="liq" className="pt-4">
                  <div ref={liquidityChartRef} className="bg-white rounded">
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={liquidityChartData} margin={{ top: 10, right: 10, left: 0, bottom: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="year" label={{ value: "Years", position: "insideBottom", offset: -4, fontSize: 11 }} fontSize={11} />
                        <YAxis tickFormatter={(v) => fmt$k(v)} width={62} fontSize={11} />
                        <RTooltip formatter={(v: any) => fmt$(v)} labelFormatter={(l) => `Year ${l}`} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line type="monotone" dataKey="base" stroke={SCENARIO_COLORS.base} name="Base" strokeWidth={2.5} dot={false} />
                        <Line type="monotone" dataKey="property" stroke={SCENARIO_COLORS.property} name="Property" strokeWidth={2.5} dot={false} />
                        <Line type="monotone" dataKey="crypto" stroke={SCENARIO_COLORS.crypto} name="Crypto" strokeWidth={2.5} dot={false} />
                        <Line type="monotone" dataKey="cash" stroke={SCENARIO_COLORS.cash} name="Cash" strokeWidth={2.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>

                <TabsContent value="delta" className="pt-4">
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={deltaChartData} margin={{ top: 10, right: 10, left: 0, bottom: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="year" label={{ value: "Years", position: "insideBottom", offset: -4, fontSize: 11 }} fontSize={11} />
                      <YAxis tickFormatter={(v) => fmt$k(v)} width={62} fontSize={11} />
                      <RTooltip formatter={(v: any) => fmt$(v)} labelFormatter={(l) => `Year ${l}`} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                      <Line type="monotone" dataKey="property" stroke={SCENARIO_COLORS.property} name="Property − Base" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="crypto" stroke={SCENARIO_COLORS.crypto} name="Crypto − Base" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="cash" stroke={SCENARIO_COLORS.cash} name="Cash − Base" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </TabsContent>

                <TabsContent value="bands" className="pt-4">
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap">
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
                  <div ref={bandsChartRef} className="bg-white rounded">
                    <ResponsiveContainer width="100%" height={320}>
                      <AreaChart data={bandsChartData} stackOffset="none" margin={{ top: 10, right: 10, left: 0, bottom: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="year" fontSize={11} />
                        <YAxis tickFormatter={(v) => fmt$k(v)} width={62} fontSize={11} />
                        <RTooltip formatter={(v: any) => fmt$(v)} labelFormatter={(l) => `Year ${l}`} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Area type="monotone" dataKey="p10" stackId="1" stroke="#cbd5e1" fill="#e2e8f0" name="P10" />
                        <Area type="monotone" dataKey="p50Minus10" stackId="1" stroke="#7dd3fc" fill="#bae6fd" name="P10→P50" />
                        <Area type="monotone" dataKey="p90Minus50" stackId="1" stroke="#0ea5e9" fill="#7dd3fc" name="P50→P90" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* ── DESKTOP COMPARISON TABLE / MOBILE CARDS ──────────────────── */}
        {results.length > 0 && narrative && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Scenario comparison</CardTitle>
              <CardDescription className="text-xs">
                {lastAssumptions.horizonYears}-year horizon · {lastAssumptions.simulationCount.toLocaleString()} sims
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs uppercase text-muted-foreground tracking-wide">
                    <tr>
                      <th className="py-2.5 pr-3">Scenario</th>
                      <th className="py-2.5 pr-3 text-right">P10</th>
                      <th className="py-2.5 pr-3 text-right">P50</th>
                      <th className="py-2.5 pr-3 text-right">P90</th>
                      <th className="py-2.5 pr-3 text-right">Cash</th>
                      <th className="py-2.5 pr-3 text-right">DSR</th>
                      <th className="py-2.5 pr-3 text-right">LVR</th>
                      <th className="py-2.5 pr-3 text-right">Downside</th>
                      <th className="py-2.5 pr-3 text-right" title="Probability of property negative-equity">Neg-Eq</th>
                      <th className="py-2.5 pr-3 text-right" title="Probability of cash buffer below 1× expenses">Liq</th>
                      <th className="py-2.5 pr-3 text-right">Conf</th>
                      <th className="py-2.5">Band</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, idx) => {
                      const fanEnd = r.netWorthFan[r.netWorthFan.length - 1];
                      const cashEnd = r.cashFan[r.cashFan.length - 1];
                      const colorKey = SCENARIO_KEY_MAP[r.scenarioId] ?? "base";
                      const conf = narrative.scenarios[idx]?.confidence ?? 50;
                      const isWinner = r.scenarioId === narrative.winnerScenarioId;
                      return (
                        <tr key={r.scenarioId} className={`border-b last:border-0 hover:bg-muted/30 ${isWinner ? "bg-purple-50/40 dark:bg-purple-950/10" : ""}`}>
                          <td className="py-2.5 pr-3 font-medium">
                            <div className="flex items-center gap-2">
                              <span className="inline-block w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: SCENARIO_COLORS[colorKey] }} />
                              <span>{r.name}</span>
                              {isWinner && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 text-right tabular-nums text-rose-700">{fmt$M(fanEnd.p10)}</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums font-semibold">{fmt$M(fanEnd.p50)}</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums text-emerald-700">{fmt$M(fanEnd.p90)}</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{fmt$M(cashEnd.p50)}</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{pct(r.serviceability?.dsr ?? 0)}</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{pct(r.serviceability?.lvr ?? 0)}</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{pct(r.riskMetrics.downsideRisk)}</td>
                          <td className={`py-2.5 pr-3 text-right tabular-nums ${r.negativeEquityProbability > 0.1 ? "text-rose-700 font-semibold" : ""}`}>{pct(r.negativeEquityProbability, 0)}</td>
                          <td className={`py-2.5 pr-3 text-right tabular-nums ${r.liquidityStressProbability > 0.1 ? "text-rose-700 font-semibold" : ""}`}>{pct(r.liquidityStressProbability, 0)}</td>
                          <td className="py-2.5 pr-3 text-right tabular-nums">{conf}%</td>
                          <td className="py-2.5">
                            <Badge variant="outline" className={bandClass(r.serviceability?.band)}>
                              {r.serviceability?.band ?? "—"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden space-y-2">
                {results.map((r, idx) => {
                  const fanEnd = r.netWorthFan[r.netWorthFan.length - 1];
                  const cashEnd = r.cashFan[r.cashFan.length - 1];
                  const colorKey = SCENARIO_KEY_MAP[r.scenarioId] ?? "base";
                  const conf = narrative.scenarios[idx]?.confidence ?? 50;
                  const isWinner = r.scenarioId === narrative.winnerScenarioId;
                  return (
                    <div key={r.scenarioId}
                         className={`rounded-lg border p-3 ${isWinner ? "border-purple-300 bg-purple-50/40 dark:bg-purple-950/10" : ""}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: SCENARIO_COLORS[colorKey] }} />
                          <span className="font-semibold text-sm">{r.name}</span>
                          {isWinner && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${bandClass(r.serviceability?.band)}`}>
                          {r.serviceability?.band ?? "—"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground font-semibold">P50</div>
                          <div className="font-semibold tabular-nums">{fmt$M(fanEnd.p50)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground font-semibold">Cash</div>
                          <div className="font-semibold tabular-nums">{fmt$M(cashEnd.p50)}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase text-muted-foreground font-semibold">Downside</div>
                          <div className="font-semibold tabular-nums">{pct(r.riskMetrics.downsideRisk, 0)}</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] mt-2 pt-2 border-t">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">DSR / LVR</span>
                          <span className="tabular-nums font-medium">{pct(r.serviceability?.dsr ?? 0, 0)} / {pct(r.serviceability?.lvr ?? 0, 0)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Confidence</span>
                          <span className="tabular-nums font-medium">{conf}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── RECOMMENDATION ───────────────────────────────────────────── */}
        {narrative && narrative.recommendation && (
          <Card className="border-purple-200 bg-gradient-to-br from-purple-50/60 via-fuchsia-50/40 to-indigo-50/60 dark:from-purple-950/20 dark:via-fuchsia-950/20 dark:to-indigo-950/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="h-4 w-4 text-purple-600" />
                Long-form recommendation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm leading-relaxed whitespace-pre-line text-foreground/85">
                {narrative.recommendation}
              </div>
              <p className="text-[10px] text-muted-foreground mt-4 italic">
                Not personal financial advice. Generated from your live ledger + your input assumptions.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ─── MOBILE STICKY BOTTOM ACTION BAR ──────────────────────────── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t shadow-lg">
        <div className="px-3 py-2.5 flex items-center gap-1.5">
          <Button
            onClick={handleRun}
            disabled={!dashboardInputs || running}
            size="sm"
            className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs"
          >
            {running ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
            {running ? "Running…" : results.length ? "Re-run" : "Run"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAssumptions(s => !s)}
            className="text-xs"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
          {results.length > 0 && (
            <>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => {
                    setSaveName(loadedScenarioId
                      ? savedScenarios.find(s => s.id === loadedScenarioId)?.name ?? ""
                      : `Scenario ${new Date().toLocaleDateString("en-AU")}`);
                  }}>
                    <Save className="h-3.5 w-3.5" />
                  </Button>
                </DialogTrigger>
                <SaveDialog
                  saveName={saveName} setSaveName={setSaveName}
                  saveDescription={saveDescription} setSaveDescription={setSaveDescription}
                  isUpdate={!!loadedScenarioId}
                  onSubmit={handleSave}
                />
              </Dialog>
              <Button variant="outline" size="sm" className="text-xs" onClick={handleDownloadPdf} disabled={pdfBusy}>
                {pdfBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              </Button>
            </>
          )}
          <Sheet open={loadSheetOpen} onOpenChange={setLoadSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs">
                <FolderOpen className="h-3.5 w-3.5" />
                {savedScenarios.length > 0 && <span className="ml-1 tabular-nums">{savedScenarios.length}</span>}
              </Button>
            </SheetTrigger>
            <LoadSheet
              savedScenarios={savedScenarios}
              loadedScenarioId={loadedScenarioId}
              onLoad={handleLoad}
              onClone={handleClone}
              onDelete={handleDelete}
            />
          </Sheet>
        </div>
      </div>
    </div>
  );
}

// ─── SaveDialog component ────────────────────────────────────────────────────

function SaveDialog({
  saveName, setSaveName, saveDescription, setSaveDescription, isUpdate, onSubmit,
}: {
  saveName: string;
  setSaveName: (v: string) => void;
  saveDescription: string;
  setSaveDescription: (v: string) => void;
  isUpdate: boolean;
  onSubmit: () => Promise<void> | void;
}) {
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{isUpdate ? "Update scenario" : "Save scenario"}</DialogTitle>
        <DialogDescription>
          Saves assumptions, deltas, results, and audit hashes to your ledger.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="scenario-name" className="text-xs">Name</Label>
          <Input
            id="scenario-name"
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="e.g. Lev into rental property"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="scenario-desc" className="text-xs">Description (optional)</Label>
          <Input
            id="scenario-desc"
            value={saveDescription}
            onChange={e => setSaveDescription(e.target.value)}
            placeholder="Why am I considering this?"
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={onSubmit} disabled={!saveName.trim()}>
          <Save className="h-4 w-4 mr-2" />
          {isUpdate ? "Update" : "Save scenario"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ─── LoadSheet (mobile-first scenario picker) ────────────────────────────────

function LoadSheet({
  savedScenarios, loadedScenarioId, onLoad, onClone, onDelete,
}: {
  savedScenarios: SavedScenario[];
  loadedScenarioId: string | null;
  onLoad: (id: string) => Promise<void> | void;
  onClone: (id: string, name: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}) {
  return (
    <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4" />
          Saved scenarios
        </SheetTitle>
      </SheetHeader>
      <div className="mt-4 space-y-2">
        {savedScenarios.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No saved scenarios yet. Run the engine and click Save.
          </div>
        ) : (
          savedScenarios.map(s => {
            const isLoaded = s.id === loadedScenarioId;
            return (
              <div key={s.id}
                   className={`rounded-lg border p-3 ${isLoaded ? "border-purple-300 bg-purple-50/40" : ""}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{s.name}</div>
                    {s.description && (
                      <div className="text-xs text-muted-foreground truncate">{s.description}</div>
                    )}
                  </div>
                  {isLoaded && <Badge variant="outline" className="text-[10px]">Loaded</Badge>}
                </div>
                <div className="text-[11px] text-muted-foreground space-y-0.5">
                  <div>Updated {new Date(s.updated_at).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" })}</div>
                  <div className="font-mono">
                    snap:{s.snapshot_hash?.slice(0, 6) ?? "—"} · asm:{s.assumptions_hash?.slice(0, 6) ?? "—"}
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-2.5">
                  <Button size="sm" variant="default" className="flex-1 h-8 text-xs"
                          onClick={() => onLoad(s.id)} disabled={isLoaded}>
                    <ArrowRight className="h-3.5 w-3.5 mr-1" />
                    Load
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs"
                          onClick={() => onClone(s.id, s.name)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs text-rose-600"
                          onClick={() => onDelete(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </SheetContent>
  );
}

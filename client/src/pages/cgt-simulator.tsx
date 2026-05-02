/**
 * cgt-simulator.tsx
 *
 * Capital Gains Tax Simulator — Australian Investment Property
 *
 * Features:
 *  • Full ATO CGT calculation: gross gain → discount → taxable gain → marginal tax
 *  • Side-by-side: Sell <12 months vs Sell >12 months
 *  • Ownership split (Roham / Fara / 50-50 / Custom)
 *  • Holding structure (Personal / Trust / Company)
 *  • Three named scenarios with date sliders
 *  • "Use in Forecast" integration hook (stores event in central ledger via Supabase)
 *  • Net proceeds, ROI %, Annualised Return %
 *  • Disclaimer banner
 */

import { useState, useMemo, useCallback } from "react";
import {
  CalendarDays, TrendingUp, TrendingDown, DollarSign, Info,
  ChevronDown, ChevronUp, Zap, Building2, PieChart, BarChart3,
  AlertTriangle, CheckCircle, Clock, Sparkles, RefreshCw, Plus, Trash2,
} from "lucide-react";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/lib/store";
import {
  calcIncomeTax, calcMedicareLevy, calcLITO, calcMarginalRate,
} from "@/lib/australianTax";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Cell, PieChart as RePieChart, Pie, Legend,
} from "recharts";

// ─── Types ─────────────────────────────────────────────────────────────────────

type OwnerSplit = "roham100" | "fara100" | "5050" | "custom";
type HoldingType = "personal" | "trust" | "company";

interface Scenario {
  id: string;
  name: string;
  propertyName: string;
  purchasePrice: number;
  purchaseDate: string;          // YYYY-MM-DD
  sellingPrice: number;
  sellingDate: string;           // YYYY-MM-DD
  sellingCosts: number;          // agent fees, legal, etc.
  buyingCosts: number;           // stamp duty, legal (if eligible)
  ownerSplit: OwnerSplit;
  customRohamPct: number;        // 0–100
  rohamIncome: number;           // annual taxable income in sale year
  faraIncome: number;
  holdingType: HoldingType;
  useInForecast: boolean;
}

interface CGTResult {
  holdingMonths: number;
  holdingDays: number;
  grossGain: number;
  costBase: number;
  netProceeds: number;
  // Under 12 months
  under12: {
    taxableGain: number;
    rohamTax: number;
    faraTax: number;
    totalTax: number;
    netCashAfterSale: number;
    roi: number;
    annualisedReturn: number;
  };
  // Over 12 months
  over12: {
    discountedGain: number;
    taxableGain: number;
    rohamTax: number;
    faraTax: number;
    totalTax: number;
    netCashAfterSale: number;
    roi: number;
    annualisedReturn: number;
  };
  taxSavedByWaiting: number;
  marginalRateRoham: number;
  marginalRateFara: number;
  actualMode: "under12" | "over12";
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

const fmt = (n: number, abs = false): string => {
  const v = abs ? Math.abs(n) : n;
  const prefix = !abs && n < 0 ? "-" : "";
  return prefix + "$" + Math.round(Math.abs(v)).toLocaleString("en-AU");
};

const fmtPct = (n: number): string => `${(n * 100).toFixed(1)}%`;

function calcCGTForPerson(
  taxableGainShare: number,
  baseIncome: number,
  holdingType: HoldingType,
): { tax: number; marginalRate: number } {
  if (holdingType === "company") {
    // Company rate 25% (small business) or 30% — no discount
    return { tax: taxableGainShare * 0.25, marginalRate: 0.25 };
  }
  // Personal or Trust (individuals in trust get 50% discount — handled upstream)
  const totalIncome = baseIncome + taxableGainShare;
  const taxBefore = calcIncomeTax(baseIncome, "2025-26");
  const taxAfter  = calcIncomeTax(totalIncome, "2025-26");
  const litoB     = Math.min(calcLITO(baseIncome, "2025-26"), taxBefore);
  const litoA     = Math.min(calcLITO(totalIncome, "2025-26"), taxAfter);
  const medB      = calcMedicareLevy(baseIncome, "2025-26");
  const medA      = calcMedicareLevy(totalIncome, "2025-26");
  const netTaxB   = Math.max(0, taxBefore - litoB) + medB;
  const netTaxA   = Math.max(0, taxAfter  - litoA) + medA;
  const tax       = Math.max(0, netTaxA - netTaxB);
  const marginal  = calcMarginalRate(totalIncome, "2025-26");
  return { tax, marginalRate: marginal };
}

function computeCGT(s: Scenario): CGTResult {
  const purchaseDate = new Date(s.purchaseDate);
  const sellingDate  = new Date(s.sellingDate);
  const msPerDay     = 1000 * 60 * 60 * 24;
  const holdingDays  = Math.max(0, Math.round((sellingDate.getTime() - purchaseDate.getTime()) / msPerDay));
  const holdingMonths = holdingDays / 30.44;

  const costBase   = s.purchasePrice + s.buyingCosts;
  const netProceeds = s.sellingPrice - s.sellingCosts;
  const grossGain  = netProceeds - costBase;

  // Ownership split
  const rohamPct = (() => {
    if (s.ownerSplit === "roham100") return 1.0;
    if (s.ownerSplit === "fara100")  return 0.0;
    if (s.ownerSplit === "5050")     return 0.5;
    return Math.min(100, Math.max(0, s.customRohamPct)) / 100;
  })();
  const faraPct = 1 - rohamPct;

  // Is company? (no discount, flat rate)
  const isCompany = s.holdingType === "company";

  // ── UNDER 12 MONTHS ──────────────────────────────────────────────────────
  const u12GainR = grossGain * rohamPct;
  const u12GainF = grossGain * faraPct;
  const u12R = calcCGTForPerson(Math.max(0, u12GainR), s.rohamIncome, s.holdingType);
  const u12F = calcCGTForPerson(Math.max(0, u12GainF), s.faraIncome,  s.holdingType);
  const u12TotalTax = u12R.tax + u12F.tax;
  const u12Net      = netProceeds - u12TotalTax;
  const u12ROI      = costBase > 0 ? (u12Net - costBase) / costBase : 0;
  const holdingYears = holdingDays / 365.25;
  const u12Ann      = holdingYears > 0 ? (Math.pow(1 + u12ROI, 1 / holdingYears) - 1) : 0;

  // ── OVER 12 MONTHS (50% CGT discount for individuals/trusts) ──────────────
  const discountFactor = isCompany ? 1.0 : 0.5;
  const o12GainR = grossGain * rohamPct * discountFactor;
  const o12GainF = grossGain * faraPct  * discountFactor;
  const o12R = calcCGTForPerson(Math.max(0, o12GainR), s.rohamIncome, s.holdingType);
  const o12F = calcCGTForPerson(Math.max(0, o12GainF), s.faraIncome,  s.holdingType);
  const o12TotalTax = o12R.tax + o12F.tax;
  const o12Net      = netProceeds - o12TotalTax;
  const o12ROI      = costBase > 0 ? (o12Net - costBase) / costBase : 0;
  const o12Ann      = holdingYears > 0 ? (Math.pow(1 + o12ROI, 1 / holdingYears) - 1) : 0;

  const taxSavedByWaiting = u12TotalTax - o12TotalTax;
  const actualMode: "under12" | "over12" = holdingDays < 365 ? "under12" : "over12";

  return {
    holdingMonths,
    holdingDays,
    grossGain,
    costBase,
    netProceeds,
    under12: {
      taxableGain: grossGain,
      rohamTax: u12R.tax,
      faraTax: u12F.tax,
      totalTax: u12TotalTax,
      netCashAfterSale: u12Net,
      roi: u12ROI,
      annualisedReturn: u12Ann,
    },
    over12: {
      discountedGain: grossGain * discountFactor,
      taxableGain: grossGain * discountFactor,
      rohamTax: o12R.tax,
      faraTax: o12F.tax,
      totalTax: o12TotalTax,
      netCashAfterSale: o12Net,
      roi: o12ROI,
      annualisedReturn: o12Ann,
    },
    taxSavedByWaiting,
    marginalRateRoham: u12R.marginalRate,
    marginalRateFara:  u12F.marginalRate,
    actualMode,
  };
}

// ─── Default Scenario ─────────────────────────────────────────────────────────

const makeScenario = (id: string, name: string, overrides: Partial<Scenario> = {}): Scenario => ({
  id,
  name,
  propertyName: "Investment Property 1",
  purchasePrice: 800_000,
  purchaseDate: "2026-07-15",
  sellingPrice: 920_000,
  sellingDate: "2028-03-01",
  sellingCosts: 18_000,
  buyingCosts: 26_250,
  ownerSplit: "roham100",
  customRohamPct: 50,
  rohamIncome: 200_000,
  faraIncome: 80_000,
  holdingType: "personal",
  useInForecast: false,
  ...overrides,
});

const DEFAULT_SCENARIOS: Scenario[] = [
  makeScenario("A", "Scenario A — Sell at 10 months", {
    sellingDate: "2027-05-15",
  }),
  makeScenario("B", "Scenario B — Sell at 14 months", {
    sellingDate: "2027-09-15",
  }),
  makeScenario("C", "Scenario C — Hold to 2032 Olympics", {
    sellingDate: "2032-07-01",
    sellingPrice: 1_150_000,
  }),
];

// ─── Input Field Component ─────────────────────────────────────────────────────

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/60 mt-0.5">{hint}</p>}
    </div>
  );
}

function NumInput({
  value, onChange, prefix = "$", min = 0, step = 1000,
}: {
  value: number; onChange: (v: number) => void; prefix?: string; min?: number; step?: number;
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium pointer-events-none">
          {prefix}
        </span>
      )}
      <Input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className={`bg-background/50 border-border text-sm h-9 ${prefix ? "pl-7" : ""}`}
      />
    </div>
  );
}

// ─── Result Card ──────────────────────────────────────────────────────────────

function ResultCard({
  title, tag, taxLabel, tax, netCash, roi, annReturn, gainLabel, gain,
  isHighlighted, isBetter, savings,
}: {
  title: string; tag: string; taxLabel: string; tax: number;
  netCash: number; roi: number; annReturn: number;
  gainLabel: string; gain: number;
  isHighlighted?: boolean; isBetter?: boolean; savings?: number;
}) {
  const accent = isBetter ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)";
  const cardBg = isHighlighted ? "bg-card border-primary/30" : "bg-card/60 border-border/60";
  return (
    <div className={`rounded-2xl border p-5 space-y-4 transition-all ${cardBg} ${isHighlighted ? "ring-1 ring-primary/20" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs font-bold tracking-widest uppercase text-muted-foreground mb-0.5">{tag}</div>
          <div className="text-base font-bold">{title}</div>
        </div>
        {isBetter && (
          <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: "hsl(142,55%,18%)", color: "hsl(142,65%,58%)" }}>
            <CheckCircle className="w-3 h-3" /> Better outcome
          </span>
        )}
      </div>

      {/* Key number */}
      <div className="space-y-0.5">
        <div className="text-xs text-muted-foreground">{gainLabel}</div>
        <div className="text-2xl font-bold tabular-nums" style={{ color: gain >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" }}>
          {gain >= 0 ? "+" : ""}{fmt(gain)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-background/50 p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{taxLabel}</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: "hsl(0,65%,52%)" }}>
            {fmt(tax)}
          </div>
        </div>
        <div className="rounded-xl bg-background/50 p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Net Cash Received</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: "hsl(210,80%,65%)" }}>
            {fmt(netCash)}
          </div>
        </div>
        <div className="rounded-xl bg-background/50 p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">ROI</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: roi >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" }}>
            {roi >= 0 ? "+" : ""}{fmtPct(roi)}
          </div>
        </div>
        <div className="rounded-xl bg-background/50 p-3">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Ann. Return</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: annReturn >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" }}>
            {annReturn >= 0 ? "+" : ""}{fmtPct(annReturn)}
          </div>
        </div>
      </div>

      {savings !== undefined && savings > 0 && (
        <div className="rounded-xl px-4 py-2.5 flex items-center gap-2"
          style={{ background: "hsl(142,55%,10%)", border: "1px solid hsl(142,55%,22%)" }}>
          <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: "hsl(142,65%,58%)" }} />
          <span className="text-xs font-semibold" style={{ color: "hsl(142,65%,58%)" }}>
            Tax saved by holding 12+ months: {fmt(savings)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Bar Chart Comparison ─────────────────────────────────────────────────────

function TaxCompareChart({ result }: { result: CGTResult }) {
  const data = [
    { name: "< 12 mo", tax: Math.round(result.under12.totalTax), net: Math.round(result.under12.netCashAfterSale), fill: "hsl(0,65%,52%)" },
    { name: "> 12 mo", tax: Math.round(result.over12.totalTax),  net: Math.round(result.over12.netCashAfterSale),  fill: "hsl(142,55%,40%)" },
  ];
  return (
    <div style={{ height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,15%,17%)" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(215,12%,45%)" }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 9, fill: "hsl(215,12%,38%)" }} axisLine={false} tickLine={false} width={46} />
          <Tooltip
            formatter={(v: number, name: string) => [fmt(v), name === "tax" ? "Tax Payable" : "Net Received"]}
            contentStyle={{ background: "hsl(222,25%,8%)", border: "1px solid hsl(222,15%,20%)", borderRadius: 10, fontSize: 12 }}
          />
          <Bar dataKey="tax" name="tax" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.85} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Waterfall breakdown ──────────────────────────────────────────────────────

function WaterfallRow({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/30 last:border-0">
      <div>
        <div className="text-xs font-medium">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground/70">{sub}</div>}
      </div>
      <div className="text-sm font-bold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

// ─── Scenario Editor ──────────────────────────────────────────────────────────

function ScenarioEditor({
  scenario, onChange,
}: {
  scenario: Scenario;
  onChange: (updated: Scenario) => void;
}) {
  const upd = useCallback(<K extends keyof Scenario>(key: K, val: Scenario[K]) => {
    onChange({ ...scenario, [key]: val });
  }, [scenario, onChange]);

  return (
    <div className="space-y-5">
      {/* Property basics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Property Name">
          <Input
            value={scenario.propertyName}
            onChange={e => upd("propertyName", e.target.value)}
            className="bg-background/50 border-border text-sm h-9"
          />
        </Field>
        <Field label="Holding Structure">
          <div className="flex gap-1 flex-wrap">
            {(["personal", "trust", "company"] as HoldingType[]).map(ht => (
              <button key={ht} onClick={() => upd("holdingType", ht)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                  scenario.holdingType === ht
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "text-muted-foreground border border-border/50 hover:text-foreground"
                }`}>
                {ht}
              </button>
            ))}
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Purchase Price">
          <NumInput value={scenario.purchasePrice} onChange={v => upd("purchasePrice", v)} step={10000} />
        </Field>
        <Field label="Purchase Date">
          <Input type="date" value={scenario.purchaseDate}
            onChange={e => upd("purchaseDate", e.target.value)}
            className="bg-background/50 border-border text-sm h-9" />
        </Field>
        <Field label="Selling Price">
          <NumInput value={scenario.sellingPrice} onChange={v => upd("sellingPrice", v)} step={10000} />
        </Field>
        <Field label="Selling Date">
          <Input type="date" value={scenario.sellingDate}
            onChange={e => upd("sellingDate", e.target.value)}
            className="bg-background/50 border-border text-sm h-9" />
        </Field>
        <Field label="Selling Costs" hint="Agent, legal, advertising">
          <NumInput value={scenario.sellingCosts} onChange={v => upd("sellingCosts", v)} step={500} />
        </Field>
        <Field label="Buying Costs" hint="Stamp duty, legal (if eligible for cost base)">
          <NumInput value={scenario.buyingCosts} onChange={v => upd("buyingCosts", v)} step={500} />
        </Field>
      </div>

      {/* Ownership split */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Ownership Split
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {([
            ["roham100", "Roham 100%"],
            ["fara100",  "Fara 100%"],
            ["5050",     "50 / 50"],
            ["custom",   "Custom"],
          ] as [OwnerSplit, string][]).map(([val, lbl]) => (
            <button key={val} onClick={() => upd("ownerSplit", val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                scenario.ownerSplit === val
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground border border-border/50 hover:text-foreground"
              }`}>
              {lbl}
            </button>
          ))}
        </div>
        {scenario.ownerSplit === "custom" && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label="Roham %">
              <NumInput value={scenario.customRohamPct} onChange={v => upd("customRohamPct", Math.min(100, Math.max(0, v)))} prefix="%" step={1} min={0} />
            </Field>
            <Field label="Fara %">
              <div className="h-9 flex items-center px-3 rounded-lg bg-background/30 border border-border/50 text-sm text-muted-foreground">
                {Math.round(100 - scenario.customRohamPct)}%
              </div>
            </Field>
          </div>
        )}
      </div>

      {/* Annual incomes */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Annual Taxable Income in Sale Year
        </Label>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Roham Income">
            <NumInput value={scenario.rohamIncome} onChange={v => upd("rohamIncome", v)} step={5000} />
          </Field>
          <Field label="Fara Income">
            <NumInput value={scenario.faraIncome} onChange={v => upd("faraIncome", v)} step={5000} />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CGTSimulatorPage() {
  const { privacyMode } = useAppStore();
  const { toast } = useToast();

  const [scenarios, setScenarios] = useState<Scenario[]>(DEFAULT_SCENARIOS);
  const [activeId, setActiveId] = useState<string>("A");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [saving, setSaving] = useState(false);

  const active = scenarios.find(s => s.id === activeId) ?? scenarios[0];

  const updateActive = useCallback((updated: Scenario) => {
    setScenarios(prev => prev.map(s => s.id === updated.id ? updated : s));
  }, []);

  const result = useMemo(() => computeCGT(active), [active]);

  const addScenario = () => {
    const id = `custom-${Date.now()}`;
    const base = scenarios[scenarios.length - 1];
    const newS = makeScenario(id, `Scenario ${String.fromCharCode(65 + scenarios.length)}`, {
      ...base,
      id,
      name: `Scenario ${String.fromCharCode(65 + scenarios.length)}`,
    });
    setScenarios(prev => [...prev, newS]);
    setActiveId(id);
  };

  const removeScenario = (id: string) => {
    if (scenarios.length <= 1) return;
    setScenarios(prev => prev.filter(s => s.id !== id));
    if (activeId === id) setActiveId(scenarios[0].id);
  };

  const handleForecastIntegration = async () => {
    setSaving(true);
    try {
      // Store a CGT event in supabase financial_plan_ledger as a sale event
      // This is a stub that writes to localStorage as fallback
      const event = {
        type: "property_sale_cgt",
        propertyName: active.propertyName,
        sellingDate: active.sellingDate,
        netProceeds: result.netProceeds,
        cgtPayable: result.actualMode === "over12" ? result.over12.totalTax : result.under12.totalTax,
        netCashAfterSale: result.actualMode === "over12" ? result.over12.netCashAfterSale : result.under12.netCashAfterSale,
        scenario: active.name,
      };
      // Save to Supabase via existing store infrastructure
      const { supabase } = await import("@/lib/supabaseClient");
      const { data: existing } = await supabase
        .from("financial_plans")
        .select("data")
        .eq("id", "shahrokh-family-main")
        .single();
      if (existing?.data) {
        const planData = typeof existing.data === "string" ? JSON.parse(existing.data) : existing.data;
        const cgtEvents = planData.cgtEvents ?? [];
        const idx = cgtEvents.findIndex((e: any) => e.propertyName === event.propertyName && e.sellingDate === event.sellingDate);
        if (idx >= 0) cgtEvents[idx] = event;
        else cgtEvents.push(event);
        planData.cgtEvents = cgtEvents;
        await supabase
          .from("financial_plans")
          .update({ data: planData, updated_at: new Date().toISOString() })
          .eq("id", "shahrokh-family-main");
      }
      toast({ title: "Forecast Updated", description: `${active.propertyName} CGT event added to your central ledger.` });
      updateActive({ ...active, useInForecast: true });
    } catch {
      toast({ title: "Saved Locally", description: "Could not reach Supabase — event noted locally.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const holdingLabel = result.holdingDays < 0
    ? "Invalid dates"
    : result.holdingDays < 365
    ? `${Math.floor(result.holdingMonths)} months (< 12 months — no discount)`
    : `${result.holdingMonths.toFixed(1)} months (> 12 months — 50% discount eligible)`;

  const maskVal = (s: string) => privacyMode ? "••••••" : s;

  return (
    <div className="min-h-screen pb-20 bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-3 border-b border-border/50 bg-background/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "hsl(262,60%,20%)" }}>
                <BarChart3 className="w-4 h-4" style={{ color: "hsl(262,70%,65%)" }} />
              </div>
              <div>
                <h1 className="text-base font-bold">Capital Gains Tax Simulator</h1>
                <p className="text-[11px] text-muted-foreground">Australian Investment Property · 2025-26 ATO Rates</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Scenario tabs */}
            {scenarios.map(s => (
              <div key={s.id} className="flex items-center gap-0.5">
                <button
                  onClick={() => setActiveId(s.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeId === s.id
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "text-muted-foreground border border-border/50 hover:text-foreground"
                  }`}>
                  {s.name.split("—")[0].trim()}
                </button>
                {scenarios.length > 1 && (
                  <button onClick={() => removeScenario(s.id)}
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-900/30 text-muted-foreground hover:text-red-400 transition-all">
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            ))}
            <button onClick={addScenario}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground border border-border/50 hover:text-foreground transition-all">
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-6 space-y-6">

        {/* Disclaimer */}
        <div className="rounded-xl px-4 py-3 flex items-start gap-3"
          style={{ background: "hsl(43,60%,10%)", border: "1px solid hsl(43,60%,22%)" }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "hsl(43,90%,60%)" }} />
          <p className="text-xs" style={{ color: "hsl(43,80%,65%)" }}>
            <strong>Estimate only.</strong> This calculator provides indicative CGT estimates using ATO 2025-26 rates. It does not account for all cost base adjustments, depreciation recapture, HELP debts, offsets, or trust distribution rules. Always verify with a qualified accountant or tax agent before making property decisions.
          </p>
        </div>

        {/* Scenario name editor */}
        <div className="flex items-center gap-3">
          <Input
            value={active.name}
            onChange={e => updateActive({ ...active, name: e.target.value })}
            className="max-w-xs bg-background/50 border-border text-sm h-9 font-semibold"
          />
          {active.useInForecast && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold"
              style={{ background: "hsl(142,55%,10%)", color: "hsl(142,65%,58%)", border: "1px solid hsl(142,45%,25%)" }}>
              <CheckCircle className="w-2.5 h-2.5" /> In Forecast
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6">

          {/* LEFT: Inputs */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4" style={{ color: "hsl(262,70%,65%)" }} />
              <h2 className="text-sm font-bold">Property Details</h2>
            </div>
            <ScenarioEditor scenario={active} onChange={updateActive} />

            {/* Holding Period Display */}
            <div className="rounded-xl px-4 py-3 flex items-center gap-3"
              style={{
                background: result.holdingDays >= 365 ? "hsl(142,55%,8%)" : "hsl(0,55%,10%)",
                border: `1px solid ${result.holdingDays >= 365 ? "hsl(142,45%,20%)" : "hsl(0,45%,22%)"}`,
              }}>
              <Clock className="w-4 h-4 shrink-0" style={{ color: result.holdingDays >= 365 ? "hsl(142,65%,58%)" : "hsl(0,65%,58%)" }} />
              <div>
                <div className="text-xs font-bold" style={{ color: result.holdingDays >= 365 ? "hsl(142,65%,58%)" : "hsl(0,65%,58%)" }}>
                  Holding Period
                </div>
                <div className="text-[11px] text-muted-foreground">{holdingLabel}</div>
              </div>
            </div>

            {/* Use In Forecast */}
            <div className="rounded-xl p-4 space-y-3"
              style={{ background: "hsl(262,55%,10%)", border: "1px solid hsl(262,45%,22%)" }}>
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5" style={{ color: "hsl(262,70%,65%)" }} />
                <span className="text-xs font-bold" style={{ color: "hsl(262,70%,65%)" }}>
                  Use in Forecast
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Push this sale event to your central ledger. Updates cashflow, net worth, FIRE age, and debt projections.
              </p>
              <Button
                size="sm"
                onClick={handleForecastIntegration}
                disabled={saving || active.useInForecast}
                className="w-full h-8 text-xs font-semibold"
                style={{
                  background: "hsl(262,60%,35%)",
                  color: "hsl(262,20%,98%)",
                }}>
                {saving ? (
                  <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Saving…</>
                ) : active.useInForecast ? (
                  <><CheckCircle className="w-3 h-3 mr-1.5" />Already in Forecast</>
                ) : (
                  <><Zap className="w-3 h-3 mr-1.5" />Add to Forecast Ledger</>
                )}
              </Button>
            </div>
          </div>

          {/* RIGHT: Results */}
          <div className="space-y-4">

            {/* Gain overview strip */}
            <div className="rounded-2xl border border-border bg-card px-6 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Cost Base",     val: fmt(result.costBase),    color: "hsl(215,12%,55%)" },
                  { label: "Net Proceeds",  val: fmt(result.netProceeds), color: "hsl(210,80%,65%)" },
                  { label: "Gross Gain",    val: (result.grossGain >= 0 ? "+" : "") + fmt(result.grossGain), color: result.grossGain >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" },
                  { label: "Tax Saved Waiting 12mo", val: maskVal(fmt(result.taxSavedByWaiting)), color: "hsl(43,90%,60%)" },
                ].map(k => (
                  <div key={k.label}>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{k.label}</div>
                    <div className="text-lg font-bold tabular-nums" style={{ color: k.color }}>{k.val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Side-by-side comparison */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ResultCard
                title="Sell under 12 months"
                tag="No discount"
                taxLabel="Tax Payable"
                tax={result.under12.totalTax}
                netCash={result.under12.netCashAfterSale}
                roi={result.under12.roi}
                annReturn={result.under12.annualisedReturn}
                gainLabel="Taxable Capital Gain"
                gain={result.under12.taxableGain}
                isHighlighted={result.actualMode === "under12"}
                isBetter={false}
              />
              <ResultCard
                title="Sell after 12 months"
                tag="50% CGT discount"
                taxLabel="Tax Payable"
                tax={result.over12.totalTax}
                netCash={result.over12.netCashAfterSale}
                roi={result.over12.roi}
                annReturn={result.over12.annualisedReturn}
                gainLabel="Discounted Taxable Gain"
                gain={result.over12.discountedGain}
                isHighlighted={result.actualMode === "over12"}
                isBetter={result.taxSavedByWaiting > 0}
                savings={result.taxSavedByWaiting}
              />
            </div>

            {/* Chart */}
            <div className="rounded-2xl border border-border bg-card px-5 py-4">
              <div className="flex items-center gap-2 mb-4">
                <PieChart className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                  Tax Payable Comparison
                </span>
              </div>
              <TaxCompareChart result={result} />
            </div>

            {/* Breakdown toggle */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <button
                onClick={() => setShowBreakdown(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-all">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Full Calculation Breakdown</span>
                </div>
                {showBreakdown ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {showBreakdown && (
                <div className="px-5 pb-5 space-y-6 border-t border-border/40">
                  {/* Actual mode result */}
                  <div className="pt-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
                      {result.actualMode === "over12" ? "Over 12 Months (Actual)" : "Under 12 Months (Actual)"} — Step-by-step
                    </div>
                    <div className="space-y-0">
                      <WaterfallRow label="Selling Price"        value={maskVal(fmt(active.sellingPrice))}              color="hsl(210,80%,65%)" />
                      <WaterfallRow label="− Selling Costs"      value={maskVal(`−${fmt(active.sellingCosts)}`)}       color="hsl(0,65%,52%)" />
                      <WaterfallRow label="= Net Proceeds"       value={maskVal(fmt(result.netProceeds))}               color="hsl(215,12%,80%)" />
                      <WaterfallRow label="− Cost Base"          value={maskVal(`−${fmt(result.costBase)}`)}            color="hsl(0,65%,52%)"
                        sub={`Purchase $${(active.purchasePrice/1000).toFixed(0)}k + Buying costs $${(active.buyingCosts/1000).toFixed(0)}k`} />
                      <WaterfallRow label="= Gross Capital Gain" value={maskVal(fmt(result.grossGain))}                 color="hsl(43,90%,60%)" />
                      {result.actualMode === "over12" && active.holdingType !== "company" && (
                        <WaterfallRow label="× 50% CGT Discount" value={maskVal(fmt(result.over12.discountedGain))}    color="hsl(142,60%,52%)"
                          sub="ATO s.115-A: 50% discount for individuals holding >12 months" />
                      )}
                      {result.actualMode === "under12" ? (
                        <>
                          <WaterfallRow label="Roham's Tax"  value={maskVal(`−${fmt(result.under12.rohamTax)}`)}       color="hsl(0,65%,52%)" sub={`Marginal rate ${(result.marginalRateRoham*100).toFixed(0)}% on gain portion`} />
                          <WaterfallRow label="Fara's Tax"   value={maskVal(`−${fmt(result.under12.faraTax)}`)}        color="hsl(0,65%,52%)" sub={`Marginal rate ${(result.marginalRateFara*100).toFixed(0)}% on gain portion`} />
                          <WaterfallRow label="= Net Cash After Sale" value={maskVal(fmt(result.under12.netCashAfterSale))} color="hsl(142,60%,52%)" />
                        </>
                      ) : (
                        <>
                          <WaterfallRow label="Roham's Tax"  value={maskVal(`−${fmt(result.over12.rohamTax)}`)}        color="hsl(0,65%,52%)" sub={`Marginal rate ${(result.marginalRateRoham*100).toFixed(0)}% on discounted gain`} />
                          <WaterfallRow label="Fara's Tax"   value={maskVal(`−${fmt(result.over12.faraTax)}`)}         color="hsl(0,65%,52%)" sub={`Marginal rate ${(result.marginalRateFara*100).toFixed(0)}% on discounted gain`} />
                          <WaterfallRow label="= Net Cash After Sale" value={maskVal(fmt(result.over12.netCashAfterSale))} color="hsl(142,60%,52%)" />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Tax rates reference */}
                  <div className="rounded-xl p-4 space-y-2"
                    style={{ background: "hsl(222,20%,9%)", border: "1px solid hsl(222,15%,18%)" }}>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">2025-26 ATO Tax Brackets Reference</div>
                    {[
                      ["$0 – $18,200",      "0%",   "Tax-free threshold"],
                      ["$18,201 – $45,000", "16%",  "Stage 3 rates"],
                      ["$45,001 – $135,000","30%",  "Middle bracket"],
                      ["$135,001 – $190,000","37%", "Upper bracket"],
                      ["$190,001+",         "45%",  "Top marginal rate"],
                    ].map(([range, rate, note]) => (
                      <div key={range} className="flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">{range}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-muted-foreground/60">{note}</span>
                          <span className="text-xs font-bold" style={{ color: "hsl(210,80%,65%)" }}>{rate}</span>
                        </div>
                      </div>
                    ))}
                    <div className="pt-1 border-t border-border/30 text-[10px] text-muted-foreground/60">
                      + 2% Medicare Levy. CGT discount: 50% for individuals/trusts holding &gt;12 months. Companies: no discount, 25% flat rate.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* All scenarios summary */}
            {scenarios.length > 1 && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                    All Scenarios — Tax Comparison
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/40">
                        <th className="text-left pb-2 text-muted-foreground font-semibold">Scenario</th>
                        <th className="text-right pb-2 text-muted-foreground font-semibold">Holding</th>
                        <th className="text-right pb-2 text-muted-foreground font-semibold">Gross Gain</th>
                        <th className="text-right pb-2 text-muted-foreground font-semibold">Tax (actual)</th>
                        <th className="text-right pb-2 text-muted-foreground font-semibold">Net Cash</th>
                        <th className="text-right pb-2 text-muted-foreground font-semibold">ROI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scenarios.map(s => {
                        const r = computeCGT(s);
                        const actualTax = r.actualMode === "over12" ? r.over12.totalTax : r.under12.totalTax;
                        const actualNet = r.actualMode === "over12" ? r.over12.netCashAfterSale : r.under12.netCashAfterSale;
                        const actualROI = r.actualMode === "over12" ? r.over12.roi : r.under12.roi;
                        return (
                          <tr key={s.id} onClick={() => setActiveId(s.id)}
                            className={`border-b border-border/20 cursor-pointer transition-colors hover:bg-muted/10 ${activeId === s.id ? "bg-primary/5" : ""}`}>
                            <td className="py-2.5 font-medium">{s.name}</td>
                            <td className="py-2.5 text-right text-muted-foreground">
                              {Math.floor(r.holdingMonths)}mo
                              <span className="ml-1" style={{ color: r.holdingDays >= 365 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" }}>
                                {r.holdingDays >= 365 ? "✓" : "✗"}
                              </span>
                            </td>
                            <td className="py-2.5 text-right tabular-nums" style={{ color: r.grossGain >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" }}>
                              {maskVal(fmt(r.grossGain))}
                            </td>
                            <td className="py-2.5 text-right tabular-nums" style={{ color: "hsl(0,65%,52%)" }}>
                              {maskVal(fmt(actualTax))}
                            </td>
                            <td className="py-2.5 text-right tabular-nums" style={{ color: "hsl(210,80%,65%)" }}>
                              {maskVal(fmt(actualNet))}
                            </td>
                            <td className="py-2.5 text-right tabular-nums" style={{ color: actualROI >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" }}>
                              {fmtPct(actualROI)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Decision helper */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: "hsl(43,90%,60%)" }} />
                <span className="text-sm font-bold">Should You Sell Now?</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    q: "Sell right now?",
                    a: result.holdingDays < 365
                      ? `Wait ${Math.ceil((365 - result.holdingDays) / 30)} more months to get 50% discount`
                      : "You've passed 12 months — discount applies ✓",
                    pos: result.holdingDays >= 365,
                  },
                  {
                    q: "Tax difference?",
                    a: result.taxSavedByWaiting > 0
                      ? `Waiting saves ${maskVal(fmt(result.taxSavedByWaiting))} in tax`
                      : "No CGT discount benefit (company structure)",
                    pos: result.taxSavedByWaiting > 0,
                  },
                  {
                    q: "Net cash today?",
                    a: maskVal(fmt(result.actualMode === "over12" ? result.over12.netCashAfterSale : result.under12.netCashAfterSale)),
                    pos: true,
                  },
                  {
                    q: "ROI on this property?",
                    a: fmtPct(result.actualMode === "over12" ? result.over12.roi : result.under12.roi),
                    pos: (result.actualMode === "over12" ? result.over12.roi : result.under12.roi) > 0,
                  },
                ].map(({ q, a, pos }) => (
                  <div key={q} className="rounded-xl p-3" style={{ background: "hsl(222,20%,9%)" }}>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{q}</div>
                    <div className="text-xs font-semibold" style={{ color: pos ? "hsl(142,60%,52%)" : "hsl(43,90%,60%)" }}>
                      {a}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

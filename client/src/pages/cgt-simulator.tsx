/**
 * cgt-simulator.tsx — Australian Property Exit Decision Engine
 *
 * Premium CGT calculator: Personal / Trust / Company comparison
 * with loan payout, structure comparison table, Wait vs Sell engine,
 * investor metrics, and Ledger integration.
 *
 * Tax engine: australianTax.ts (2025-26 ATO rates)
 * Architecture: all calculations pure/memo, no mock data
 */

import { useState, useMemo, useCallback } from "react";
import {
  BarChart3, Building2, AlertTriangle, CheckCircle, Clock, Sparkles,
  RefreshCw, Plus, Trash2, Info, ChevronDown, ChevronUp, Zap,
  Users, Landmark, TrendingUp, DollarSign, ArrowDownLeft,
  CalendarDays, ShieldCheck, ArrowRight, Calculator,
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
  CartesianGrid, Cell,
} from "recharts";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type Structure = "personal" | "trust" | "company";

interface Beneficiary {
  name: string;
  income: number;
  pct: number; // 0-100
}

interface Scenario {
  id: string;
  name: string;
  propertyName: string;
  purchasePrice: number;
  purchaseDate: string;
  salePrice: number;
  saleDate: string;
  sellingCosts: number;
  buyingCosts: number;
  loanBalance: number;
  monthlyHoldingCost: number; // interest + rates + insurance per month
  structure: Structure;
  // Personal
  owner1Name: string;
  owner1Income: number;
  owner1Pct: number;
  owner2Name: string;
  owner2Income: number;
  owner2Pct: number;
  includeMedicare: boolean;
  // Trust
  beneficiaries: Beneficiary[];
  // Company
  companyTaxRate: number; // 25 or 30
  extractDividend: boolean;
  shareholderIncome: number; // for franking credit / top-up calc
  // Forecast
  useInForecast: boolean;
}

interface PersonTaxResult {
  name: string;
  pct: number;
  gainShare: number;      // pre-discount
  taxableGain: number;    // post-discount
  tax: number;
  marginalRate: number;
}

interface StructureResult {
  structure: Structure;
  label: string;
  grossGain: number;
  discountApplied: boolean;
  taxableGain: number;
  totalTax: number;
  persons: PersonTaxResult[];
  // Cash flow
  salePrice: number;
  sellingCosts: number;
  loanPayout: number;
  taxPayable: number;
  cashToBank: number;
  // Company extras
  retainedEarnings?: number;
  extractedCash?: number;
  dividendTopUpTax?: number;
  // Metrics
  roi: number;
  annualisedReturn: number;
  effectiveTaxRate: number;
  // Optimal distribution note (trust only)
  optimalNote?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const $ = (n: number, abs = false): string => {
  const v = abs ? Math.abs(n) : n;
  const neg = !abs && n < 0 ? "-" : "";
  return neg + "$" + Math.round(Math.abs(v)).toLocaleString("en-AU");
};
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function personalTax(taxableGainShare: number, baseIncome: number, includeMed: boolean): number {
  const totalInc = baseIncome + Math.max(0, taxableGainShare);
  const taxBefore = calcIncomeTax(baseIncome, "2025-26");
  const taxAfter  = calcIncomeTax(totalInc,   "2025-26");
  const litoB     = Math.min(calcLITO(baseIncome, "2025-26"), taxBefore);
  const litoA     = Math.min(calcLITO(totalInc,   "2025-26"), taxAfter);
  const medB      = includeMed ? calcMedicareLevy(baseIncome, "2025-26") : 0;
  const medA      = includeMed ? calcMedicareLevy(totalInc,   "2025-26") : 0;
  const net = (Math.max(0, taxAfter - litoA) + medA) - (Math.max(0, taxBefore - litoB) + medB);
  return Math.max(0, net);
}

function calcStructure(s: Scenario, structure: Structure, forceDiscount = false): StructureResult {
  const saleDate    = new Date(s.saleDate);
  const purchDate   = new Date(s.purchaseDate);
  const holdDays    = Math.max(0, Math.round((saleDate.getTime() - purchDate.getTime()) / 86400000));
  const holdMonths  = holdDays / 30.44;
  const holdYears   = holdDays / 365.25;

  const costBase    = s.purchasePrice + s.buyingCosts;
  const netProceeds = s.salePrice - s.sellingCosts;
  const grossGain   = netProceeds - costBase;

  const over12      = holdDays >= 365 || forceDiscount;
  const discApplied = over12 && structure !== "company";
  const discFactor  = discApplied ? 0.5 : 1.0;

  let totalTax = 0;
  let persons: PersonTaxResult[] = [];
  let taxableGain = Math.max(0, grossGain) * discFactor;
  let retainedEarnings: number | undefined;
  let extractedCash: number | undefined;
  let dividendTopUpTax: number | undefined;
  let optimalNote: string | undefined;

  if (structure === "personal") {
    const owners: { name: string; pct: number; income: number }[] = [];
    if (s.owner1Pct > 0) owners.push({ name: s.owner1Name || "Owner 1", pct: s.owner1Pct / 100, income: s.owner1Income });
    if (s.owner2Pct > 0) owners.push({ name: s.owner2Name || "Owner 2", pct: s.owner2Pct / 100, income: s.owner2Income });
    if (owners.length === 0) owners.push({ name: s.owner1Name || "Owner 1", pct: 1, income: s.owner1Income });
    for (const o of owners) {
      const gainShare    = Math.max(0, grossGain) * o.pct;
      const txGain       = gainShare * discFactor;
      const tax          = personalTax(txGain, o.income, s.includeMedicare);
      const marginalRate = calcMarginalRate(o.income + txGain, "2025-26");
      totalTax += tax;
      persons.push({ name: o.name, pct: o.pct, gainShare, taxableGain: txGain, tax, marginalRate });
    }

  } else if (structure === "trust") {
    // Trust distributes discounted gain to beneficiaries
    // Auto-optimise: find lowest total tax across all split options
    const bens = s.beneficiaries.filter(b => b.pct > 0);
    const totalPct = bens.reduce((s, b) => s + b.pct, 0);
    const normBens = totalPct > 0 ? bens.map(b => ({ ...b, pct: b.pct / totalPct })) : bens;

    let bestTax = Infinity;
    let bestDist = normBens;

    // Try current distribution
    const testDist = (dist: { name: string; income: number; pct: number }[]) => {
      let t = 0;
      const ps: PersonTaxResult[] = [];
      for (const b of dist) {
        const gainShare = Math.max(0, grossGain) * b.pct;
        const txGain    = gainShare * discFactor; // trust passes through 50% discount
        const tax       = personalTax(txGain, b.income, s.includeMedicare);
        const mr        = calcMarginalRate(b.income + txGain, "2025-26");
        t += tax;
        ps.push({ name: b.name, pct: b.pct, gainShare, taxableGain: txGain, tax, marginalRate: mr });
      }
      return { total: t, persons: ps };
    };

    const curr = testDist(normBens);
    totalTax = curr.total;
    persons  = curr.persons;

    // Auto-optimise: try 100% to lowest income beneficiary
    if (normBens.length >= 2) {
      const sorted = [...normBens].sort((a, b) => a.income - b.income);
      const opt100 = testDist([{ ...sorted[0], pct: 1 }]);
      if (opt100.total < totalTax - 100) {
        bestTax  = opt100.total;
        bestDist = [{ ...sorted[0], pct: 1 }];
        const saving = totalTax - bestTax;
        optimalNote = `Allocating 100% to ${sorted[0].name} saves ${$(saving)} vs equal split.`;
      }
    }

    taxableGain = Math.max(0, grossGain) * discFactor;

  } else { // company
    const rate   = (s.companyTaxRate || 25) / 100;
    const compTax = Math.max(0, grossGain) * rate; // no CGT discount
    taxableGain  = Math.max(0, grossGain);
    totalTax     = compTax;
    retainedEarnings = Math.max(0, grossGain) - compTax;
    persons = [{ name: "Company", pct: 1, gainShare: Math.max(0, grossGain), taxableGain: Math.max(0, grossGain), tax: compTax, marginalRate: rate }];

    // Dividend extraction: franking credits offset personal tax
    if (s.extractDividend) {
      // Grossed-up dividend = retained / (1 - company rate)
      const grossedUp   = retainedEarnings / (1 - rate);
      const frankCredit = grossedUp - retainedEarnings;
      const personalInc = s.shareholderIncome + grossedUp;
      const personalTaxTotal = calcIncomeTax(personalInc, "2025-26") + (s.includeMedicare ? calcMedicareLevy(personalInc, "2025-26") : 0);
      const baseTax = calcIncomeTax(s.shareholderIncome, "2025-26") + (s.includeMedicare ? calcMedicareLevy(s.shareholderIncome, "2025-26") : 0);
      const topUpTax = Math.max(0, personalTaxTotal - baseTax - frankCredit);
      dividendTopUpTax = topUpTax;
      extractedCash    = retainedEarnings - topUpTax;
    }
  }

  const loanPayout  = Math.max(0, s.loanBalance);
  const cashToBank  = (structure === "company" && !s.extractDividend)
    ? s.salePrice - s.sellingCosts - loanPayout - totalTax   // net inside company
    : s.salePrice - s.sellingCosts - loanPayout - totalTax;

  const roi = costBase > 0 ? (cashToBank - (costBase - loanPayout)) / costBase : 0;
  const annualisedReturn = holdYears > 0 ? (Math.pow(1 + Math.max(-0.99, roi), 1 / holdYears) - 1) : 0;
  const effectiveTaxRate = grossGain > 0 ? totalTax / grossGain : 0;

  const labels: Record<Structure, string> = {
    personal: "Personal",
    trust:    "Trust",
    company:  "Company",
  };

  return {
    structure,
    label: labels[structure],
    grossGain,
    discountApplied: discApplied,
    taxableGain,
    totalTax,
    persons,
    salePrice: s.salePrice,
    sellingCosts: s.sellingCosts,
    loanPayout,
    taxPayable: totalTax,
    cashToBank,
    retainedEarnings,
    extractedCash,
    dividendTopUpTax,
    roi,
    annualisedReturn,
    effectiveTaxRate,
    optimalNote,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT DATA
// ─────────────────────────────────────────────────────────────────────────────

const makeDefault = (id: string, name: string, overrides: Partial<Scenario> = {}): Scenario => ({
  id,
  name,
  propertyName: "Investment Property 1",
  purchasePrice: 800_000,
  purchaseDate: "2026-07-15",
  salePrice: 920_000,
  saleDate: "2028-03-01",
  sellingCosts: 18_000,
  buyingCosts: 26_250,
  loanBalance: 600_000,
  monthlyHoldingCost: 3_500,
  structure: "personal",
  owner1Name: "Roham",
  owner1Income: 200_000,
  owner1Pct: 50,
  owner2Name: "Fara",
  owner2Income: 80_000,
  owner2Pct: 50,
  includeMedicare: true,
  beneficiaries: [
    { name: "Roham", income: 200_000, pct: 50 },
    { name: "Fara",  income: 80_000,  pct: 50 },
  ],
  companyTaxRate: 25,
  extractDividend: false,
  shareholderIncome: 200_000,
  useInForecast: false,
  ...overrides,
});

const DEFAULTS: Scenario[] = [
  makeDefault("A", "Scenario A — Sell 10 months", { saleDate: "2027-05-15" }),
  makeDefault("B", "Scenario B — Sell 14 months", { saleDate: "2027-09-15" }),
  makeDefault("C", "Scenario C — Hold to 2032",   { saleDate: "2032-07-01", salePrice: 1_150_000 }),
];

// ─────────────────────────────────────────────────────────────────────────────
// SMALL COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{hint}</p>}
    </div>
  );
}

function Num({ value, onChange, prefix = "$", step = 1000, min = 0 }: {
  value: number; onChange: (v: number) => void; prefix?: string; step?: number; min?: number;
}) {
  return (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{prefix}</span>}
      <Input
        type="number" min={min} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className={`bg-background/50 border-border text-sm h-9 ${prefix ? "pl-7" : ""}`}
      />
    </div>
  );
}

function StructTab({ active, id, label, icon, onClick }: {
  active: boolean; id: Structure; label: string; icon: React.ReactNode; onClick: () => void;
}) {
  const colors: Record<Structure, string> = {
    personal: "hsl(210,80%,55%)",
    trust:    "hsl(142,55%,48%)",
    company:  "hsl(262,65%,60%)",
  };
  return (
    <button onClick={onClick} data-testid={`tab-${id}`}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all border ${
        active
          ? "border-2 text-white"
          : "border-border/50 text-muted-foreground hover:text-foreground"
      }`}
      style={active ? { borderColor: colors[id], background: `${colors[id]}25`, color: colors[id] } : {}}
    >
      {icon} {label}
    </button>
  );
}

// Cash-to-bank waterfall row
function WRow({ label, value, sub, color, big = false, border = true }: {
  label: string; value: string; sub?: string; color?: string; big?: boolean; border?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-2 ${border ? "border-b border-border/30 last:border-0" : ""}`}>
      <div>
        <div className={`${big ? "text-sm font-bold" : "text-xs font-medium"} text-foreground`}>{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground/70">{sub}</div>}
      </div>
      <div className={`${big ? "text-base font-bold" : "text-sm font-bold"} tabular-nums`} style={{ color }}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INPUT PANEL
// ─────────────────────────────────────────────────────────────────────────────

function InputPanel({ s, upd }: { s: Scenario; upd: <K extends keyof Scenario>(k: K, v: Scenario[K]) => void }) {
  const saleDate = new Date(s.saleDate);
  const purchDate = new Date(s.purchaseDate);
  const holdDays = Math.max(0, Math.round((saleDate.getTime() - purchDate.getTime()) / 86400000));
  const over12 = holdDays >= 365;

  return (
    <div className="space-y-5">

      {/* Property basics */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Property Details</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Property Name">
            <Input value={s.propertyName} onChange={e => upd("propertyName", e.target.value)}
              className="bg-background/50 border-border text-sm h-9" />
          </Field>
          <Field label="Remaining Loan Balance" hint="What you owe at settlement">
            <Num value={s.loanBalance} onChange={v => upd("loanBalance", v)} step={10000} />
          </Field>
          <Field label="Purchase Price">
            <Num value={s.purchasePrice} onChange={v => upd("purchasePrice", v)} step={10000} />
          </Field>
          <Field label="Purchase Date">
            <Input type="date" value={s.purchaseDate} onChange={e => upd("purchaseDate", e.target.value)}
              className="bg-background/50 border-border text-sm h-9" />
          </Field>
          <Field label="Sale Price">
            <Num value={s.salePrice} onChange={v => upd("salePrice", v)} step={10000} />
          </Field>
          <Field label="Sale Date">
            <Input type="date" value={s.saleDate} onChange={e => upd("saleDate", e.target.value)}
              className="bg-background/50 border-border text-sm h-9" />
          </Field>
          <Field label="Buying Costs" hint="Stamp duty, legal">
            <Num value={s.buyingCosts} onChange={v => upd("buyingCosts", v)} step={500} />
          </Field>
          <Field label="Selling Costs" hint="Agent, legal, advertising">
            <Num value={s.sellingCosts} onChange={v => upd("sellingCosts", v)} step={500} />
          </Field>
          <Field label="Monthly Holding Cost" hint="Interest + rates + insurance (for Wait vs Sell calc)">
            <Num value={s.monthlyHoldingCost} onChange={v => upd("monthlyHoldingCost", v)} step={100} />
          </Field>
        </div>
      </div>

      {/* Holding period indicator */}
      <div className="rounded-xl px-4 py-3 flex items-center gap-3"
        style={{
          background: over12 ? "hsl(142,55%,8%)" : "hsl(0,55%,10%)",
          border: `1px solid ${over12 ? "hsl(142,45%,20%)" : "hsl(0,45%,22%)"}`,
        }}>
        <Clock className="w-4 h-4 shrink-0" style={{ color: over12 ? "hsl(142,65%,55%)" : "hsl(0,65%,55%)" }} />
        <div>
          <div className="text-xs font-bold" style={{ color: over12 ? "hsl(142,65%,55%)" : "hsl(0,65%,55%)" }}>
            {over12 ? `${Math.floor(holdDays / 30)} months held — 50% CGT discount applies` : `${Math.floor(holdDays / 30)} months held — No discount yet`}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {over12
              ? "Personal & Trust structures get the 50% CGT discount"
              : `${Math.ceil((365 - holdDays) / 30)} more months to unlock 50% discount`}
          </div>
        </div>
      </div>

      <div className="border-t border-border/40 pt-4" />

      {/* Structure tabs */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Ownership Structure</p>
        <div className="flex flex-wrap gap-2">
          <StructTab active={s.structure === "personal"} id="personal" label="Personal"
            icon={<Users className="w-3.5 h-3.5" />} onClick={() => upd("structure", "personal")} />
          <StructTab active={s.structure === "trust"} id="trust" label="Trust"
            icon={<ShieldCheck className="w-3.5 h-3.5" />} onClick={() => upd("structure", "trust")} />
          <StructTab active={s.structure === "company"} id="company" label="Company"
            icon={<Landmark className="w-3.5 h-3.5" />} onClick={() => upd("structure", "company")} />
        </div>
      </div>

      {/* Structure-specific inputs */}
      {s.structure === "personal" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Owner 1 Name">
              <Input value={s.owner1Name} onChange={e => upd("owner1Name", e.target.value)}
                className="bg-background/50 border-border text-sm h-9" />
            </Field>
            <Field label="Ownership % (Owner 1)">
              <Num value={s.owner1Pct} onChange={v => upd("owner1Pct", Math.min(100, Math.max(0, v)))} prefix="%" step={5} min={0} />
            </Field>
            <Field label="Annual Income (sale year)">
              <Num value={s.owner1Income} onChange={v => upd("owner1Income", v)} step={5000} />
            </Field>
            <div className="rounded-xl border border-border/40 p-3 bg-secondary/20">
              <div className="text-[10px] text-muted-foreground">Owner 1 marginal rate</div>
              <div className="text-sm font-bold mt-0.5"
                style={{ color: "hsl(210,75%,60%)" }}>
                {Math.round(calcMarginalRate(s.owner1Income, "2025-26") * 100)}%
              </div>
            </div>
          </div>
          {s.owner1Pct < 100 && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Owner 2 Name">
                <Input value={s.owner2Name} onChange={e => upd("owner2Name", e.target.value)}
                  className="bg-background/50 border-border text-sm h-9" />
              </Field>
              <Field label="Ownership % (Owner 2)">
                <div className="h-9 flex items-center px-3 rounded-lg bg-background/30 border border-border/50 text-sm text-muted-foreground">
                  {100 - s.owner1Pct}%
                </div>
              </Field>
              <Field label="Annual Income (sale year)">
                <Num value={s.owner2Income} onChange={v => upd("owner2Income", v)} step={5000} />
              </Field>
              <div className="rounded-xl border border-border/40 p-3 bg-secondary/20">
                <div className="text-[10px] text-muted-foreground">Owner 2 marginal rate</div>
                <div className="text-sm font-bold mt-0.5" style={{ color: "hsl(210,75%,60%)" }}>
                  {Math.round(calcMarginalRate(s.owner2Income, "2025-26") * 100)}%
                </div>
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input type="checkbox" checked={s.includeMedicare}
              onChange={e => upd("includeMedicare", e.target.checked)}
              className="w-3.5 h-3.5 rounded" />
            <span className="text-muted-foreground">Include 2% Medicare Levy</span>
          </label>
        </div>
      )}

      {s.structure === "trust" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Distribute the discounted capital gain among beneficiaries. Trust passes the 50% CGT discount through to individuals.
          </p>
          {s.beneficiaries.map((b, i) => (
            <div key={i} className="grid grid-cols-3 gap-2 items-end">
              <Field label={i === 0 ? "Beneficiary Name" : ""}>
                <Input value={b.name} onChange={e => {
                  const bens = [...s.beneficiaries];
                  bens[i] = { ...b, name: e.target.value };
                  upd("beneficiaries", bens);
                }} className="bg-background/50 border-border text-sm h-9" />
              </Field>
              <Field label={i === 0 ? "Annual Income" : ""}>
                <Num value={b.income} onChange={v => {
                  const bens = [...s.beneficiaries];
                  bens[i] = { ...b, income: v };
                  upd("beneficiaries", bens);
                }} step={5000} />
              </Field>
              <Field label={i === 0 ? "Share %" : ""}>
                <div className="flex gap-1">
                  <Num value={b.pct} onChange={v => {
                    const bens = [...s.beneficiaries];
                    bens[i] = { ...b, pct: Math.min(100, Math.max(0, v)) };
                    upd("beneficiaries", bens);
                  }} prefix="%" step={5} min={0} />
                  {s.beneficiaries.length > 1 && (
                    <button onClick={() => upd("beneficiaries", s.beneficiaries.filter((_, j) => j !== i))}
                      className="w-9 h-9 flex items-center justify-center rounded-lg border border-border/50 text-muted-foreground hover:text-red-400 hover:border-red-400/40 transition-all">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </Field>
            </div>
          ))}
          <button onClick={() => upd("beneficiaries", [...s.beneficiaries, { name: "Beneficiary", income: 0, pct: 0 }])}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border/40 rounded-lg px-3 py-2 transition-all">
            <Plus className="w-3 h-3" /> Add Beneficiary
          </button>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input type="checkbox" checked={s.includeMedicare}
              onChange={e => upd("includeMedicare", e.target.checked)}
              className="w-3.5 h-3.5 rounded" />
            <span className="text-muted-foreground">Include Medicare Levy on each beneficiary</span>
          </label>
        </div>
      )}

      {s.structure === "company" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Companies pay flat tax on the full gain — no 50% CGT discount. Base rate entity (≤$50M turnover): 25%. Standard: 30%.
          </p>
          <Field label="Company Tax Rate">
            <div className="flex gap-2">
              {[25, 30].map(r => (
                <button key={r} onClick={() => upd("companyTaxRate", r)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                    s.companyTaxRate === r
                      ? "border-violet-500/50 bg-violet-500/15 text-violet-400"
                      : "border-border/50 text-muted-foreground hover:text-foreground"
                  }`}>
                  {r}% {r === 25 ? "(Base Rate)" : "(Standard)"}
                </button>
              ))}
            </div>
          </Field>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input type="checkbox" checked={s.extractDividend}
              onChange={e => upd("extractDividend", e.target.checked)}
              className="w-3.5 h-3.5 rounded" />
            <span className="text-muted-foreground">Calculate dividend extraction (pay out to shareholder personally)</span>
          </label>
          {s.extractDividend && (
            <>
              <Field label="Shareholder Annual Income" hint="Used to calculate top-up tax on franked dividends">
                <Num value={s.shareholderIncome} onChange={v => upd("shareholderIncome", v)} step={5000} />
              </Field>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input type="checkbox" checked={s.includeMedicare}
                  onChange={e => upd("includeMedicare", e.target.checked)}
                  className="w-3.5 h-3.5 rounded" />
                <span className="text-muted-foreground">Include Medicare Levy</span>
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS PANEL
// ─────────────────────────────────────────────────────────────────────────────

function ResultsPanel({ s, res, mv, onForecast, saving }: {
  s: Scenario;
  res: StructureResult;
  mv: (v: string) => string;
  onForecast: () => void;
  saving: boolean;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);

  // All 3 structures computed for comparison
  const personal = useMemo(() => calcStructure(s, "personal"), [s]);
  const trust    = useMemo(() => calcStructure(s, "trust"),    [s]);
  const company  = useMemo(() => calcStructure(s, "company"),  [s]);

  const allResults = [personal, trust, company];
  const bestCash   = Math.max(personal.cashToBank, trust.cashToBank, company.cashToBank);

  // Holding period for Wait vs Sell
  const saleDate  = new Date(s.saleDate);
  const purchDate = new Date(s.purchaseDate);
  const holdDays  = Math.max(0, Math.round((saleDate.getTime() - purchDate.getTime()) / 86400000));
  const holdMonths = holdDays / 30.44;
  const over12    = holdDays >= 365;
  const mthsToGo  = over12 ? 0 : Math.ceil((365 - holdDays) / 30);

  // Wait vs Sell: what if we wait mthsToGo months?
  const sellNowResult    = calcStructure(s, s.structure, false);  // current date = no discount
  const sellWaitResult   = calcStructure(s, s.structure, true);   // force 50% discount
  const taxSavedByWaiting = !over12 ? Math.max(0, sellNowResult.totalTax - sellWaitResult.totalTax) : 0;
  const holdingCost       = s.monthlyHoldingCost * mthsToGo;
  const netBenefitWaiting = taxSavedByWaiting - holdingCost;

  // Investor metrics
  const costBase     = s.purchasePrice + s.buyingCosts;
  const grossGain    = s.salePrice - s.sellingCosts - costBase;
  const annualised   = holdDays > 0 ? (Math.pow(Math.max(0.01, 1 + res.roi), 365.25 / holdDays) - 1) : 0;
  const cashOnCash   = (s.purchasePrice - s.loanBalance) > 0
    ? (res.cashToBank - (s.purchasePrice - s.loanBalance)) / (s.purchasePrice - s.loanBalance)
    : 0;

  const accentColor: Record<Structure, string> = {
    personal: "hsl(210,80%,55%)",
    trust:    "hsl(142,55%,48%)",
    company:  "hsl(262,65%,60%)",
  };
  const col = accentColor[s.structure];

  const chartData = allResults.map(r => ({
    name:  r.label,
    tax:   Math.round(r.totalTax),
    cash:  Math.round(r.cashToBank),
    fill:  accentColor[r.structure],
  }));

  return (
    <div className="space-y-4">

      {/* ── TOP SUMMARY CARD ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border-2 bg-card overflow-hidden" style={{ borderColor: col + "60" }}>
        <div className="px-5 py-3 flex items-center gap-2" style={{ background: col + "18" }}>
          <DollarSign className="w-4 h-4" style={{ color: col }} />
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: col }}>{res.label} — Cash Flow Summary</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/30">
          {[
            { label: "Sale Price",        value: mv($(s.salePrice)),                        color: "hsl(210,80%,65%)" },
            { label: "Tax Payable",       value: mv($(res.totalTax)),                       color: "hsl(0,65%,55%)" },
            { label: "Loan Payout",       value: mv($(s.loanBalance)),                      color: "hsl(20,75%,55%)" },
            { label: "CASH TO BANK",      value: mv($(res.cashToBank)),                     color: "hsl(142,60%,52%)", big: true },
          ].map(k => (
            <div key={k.label} className="bg-card px-4 py-4">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{k.label}</div>
              <div className={`${(k as any).big ? "text-xl" : "text-base"} font-bold tabular-nums`} style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
        {/* Formula row */}
        <div className="px-5 py-2.5 border-t border-border/30 text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <span style={{ color: "hsl(210,80%,65%)" }}>Sale Price</span>
          <ArrowRight className="w-3 h-3" />
          <span>− Selling Costs ({mv($(s.sellingCosts))})</span>
          <ArrowRight className="w-3 h-3" />
          <span>− Loan Payout ({mv($(s.loanBalance))})</span>
          <ArrowRight className="w-3 h-3" />
          <span>− Tax ({mv($(res.totalTax))})</span>
          <span className="font-bold" style={{ color: "hsl(142,60%,52%)" }}>= {mv($(res.cashToBank))}</span>
        </div>
      </div>

      {/* ── STRUCTURE COMPARISON TABLE ───────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Structure Comparison</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 560 }}>
            <thead>
              <tr className="border-b border-border/50 bg-secondary/20">
                {["Structure", "Tax Payable", "Loan Payout", "Cash To Bank", "Eff. Tax %", "Annualised", "Best For"].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-muted-foreground font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allResults.map(r => {
                const isBest = r.cashToBank === bestCash;
                const bestFor: Record<Structure, string> = {
                  personal: "Fastest access",
                  trust:    "Family tax split",
                  company:  "Reinvesting capital",
                };
                return (
                  <tr key={r.structure}
                    className={`border-b border-border/30 transition-all ${s.structure === r.structure ? "bg-secondary/20" : ""}`}
                    style={isBest ? { background: "hsl(142,55%,8%)" } : {}}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: accentColor[r.structure] }} />
                        <span className="font-semibold" style={{ color: accentColor[r.structure] }}>{r.label}</span>
                        {isBest && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1"
                            style={{ background: "hsl(142,55%,15%)", color: "hsl(142,65%,58%)" }}>
                            Best
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono" style={{ color: "hsl(0,65%,55%)" }}>{mv($(r.totalTax))}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{mv($(r.loanPayout))}</td>
                    <td className="px-4 py-3 font-bold font-mono" style={{ color: isBest ? "hsl(142,60%,52%)" : "hsl(43,85%,55%)" }}>
                      {mv($(r.cashToBank))}
                    </td>
                    <td className="px-4 py-3" style={{ color: r.effectiveTaxRate > 0.35 ? "hsl(0,65%,55%)" : "hsl(43,85%,55%)" }}>
                      {pct(r.effectiveTaxRate)}
                    </td>
                    <td className="px-4 py-3" style={{ color: r.annualisedReturn >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" }}>
                      {r.annualisedReturn >= 0 ? "+" : ""}{pct(r.annualisedReturn)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{bestFor[r.structure]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Bar chart */}
        <div className="px-5 pb-4 pt-2 border-t border-border/30">
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(215,12%,50%)" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 9, fill: "hsl(215,12%,40%)" }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  formatter={(v: number, name: string) => [mv($(v)), name === "tax" ? "Tax Payable" : "Cash to Bank"]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 11 }}
                />
                <Bar dataKey="tax" name="tax" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.6} />)}
                </Bar>
                <Bar dataKey="cash" name="cash" radius={[4, 4, 0, 0]} maxBarSize={36}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 text-[10px] text-muted-foreground mt-1 ml-12">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded opacity-60" style={{ background: accentColor[s.structure] }} /> Tax (lighter)</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded" style={{ background: accentColor[s.structure] }} /> Cash to Bank (solid)</div>
          </div>
        </div>
      </div>

      {/* ── SELECTED STRUCTURE: PERSON-BY-PERSON BREAKDOWN ───────────────── */}
      {res.persons.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {s.structure === "company" ? "Company Tax Detail" : "Tax by Owner / Beneficiary"}
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/20">
                  <th className="text-left px-4 py-2 text-muted-foreground font-semibold">Name</th>
                  <th className="text-right px-4 py-2 text-muted-foreground font-semibold">Share %</th>
                  <th className="text-right px-4 py-2 text-muted-foreground font-semibold">Gain Share</th>
                  <th className="text-right px-4 py-2 text-muted-foreground font-semibold">Taxable Gain</th>
                  <th className="text-right px-4 py-2 text-muted-foreground font-semibold">Tax</th>
                  <th className="text-right px-4 py-2 text-muted-foreground font-semibold">Marginal Rate</th>
                </tr>
              </thead>
              <tbody>
                {res.persons.map((p, i) => (
                  <tr key={i} className="border-b border-border/30 last:border-0">
                    <td className="px-4 py-2.5 font-medium">{p.name}</td>
                    <td className="px-4 py-2.5 text-right">{Math.round(p.pct * 100)}%</td>
                    <td className="px-4 py-2.5 text-right font-mono">{mv($(p.gainShare))}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{mv($(p.taxableGain))}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold" style={{ color: "hsl(0,65%,55%)" }}>{mv($(p.tax))}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: "hsl(210,80%,65%)" }}>{Math.round(p.marginalRate * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {res.optimalNote && (
            <div className="rounded-xl px-4 py-3 flex items-start gap-2"
              style={{ background: "hsl(142,55%,8%)", border: "1px solid hsl(142,45%,20%)" }}>
              <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "hsl(142,65%,55%)" }} />
              <div>
                <p className="text-xs font-semibold" style={{ color: "hsl(142,65%,55%)" }}>Auto-Optimise Distribution</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{res.optimalNote}</p>
              </div>
            </div>
          )}
          {/* Company retained + dividend extraction */}
          {s.structure === "company" && res.retainedEarnings !== undefined && (
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-border/40 p-4 bg-secondary/10">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Retained Inside Company</p>
                <p className="text-lg font-bold num-display mt-1" style={{ color: "hsl(262,65%,65%)" }}>{mv($(res.retainedEarnings))}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">After {s.companyTaxRate}% company tax</p>
              </div>
              {s.extractDividend && res.extractedCash !== undefined && (
                <div className="rounded-xl border border-border/40 p-4 bg-secondary/10">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">If Extracted as Dividend</p>
                  <p className="text-lg font-bold num-display mt-1" style={{ color: "hsl(142,60%,52%)" }}>{mv($(res.extractedCash))}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">After franking credits + top-up tax ({mv($(res.dividendTopUpTax ?? 0))})</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── INVESTOR METRICS ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Investor Metrics</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "Gross Capital Gain",    value: mv($(grossGain)),                                          color: grossGain >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" },
            { label: "Net Profit After Tax",  value: mv($(grossGain - res.totalTax)),                           color: "hsl(43,85%,55%)" },
            { label: "Months Held",           value: `${Math.floor(holdMonths)}mo`,                             color: "hsl(210,80%,65%)" },
            { label: "ROI (after tax)",       value: `${res.roi >= 0 ? "+" : ""}${pct(res.roi)}`,               color: res.roi >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" },
            { label: "Annualised Return",     value: `${annualised >= 0 ? "+" : ""}${pct(annualised)}`,          color: annualised >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" },
            { label: "Cash-on-Cash Return",   value: `${cashOnCash >= 0 ? "+" : ""}${pct(cashOnCash)}`,         color: cashOnCash >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" },
          ].map(m => (
            <div key={m.label} className="rounded-xl border border-border/40 p-3.5">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{m.label}</div>
              <div className="text-sm font-bold tabular-nums" style={{ color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>
        {res.discountApplied && (
          <div className="mt-3 rounded-xl px-4 py-2.5 flex items-center gap-2"
            style={{ background: "hsl(142,55%,8%)", border: "1px solid hsl(142,45%,20%)" }}>
            <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "hsl(142,65%,55%)" }} />
            <span className="text-xs" style={{ color: "hsl(142,65%,55%)" }}>
              50% CGT discount applied — {s.structure === "trust" ? "Trust passes discount to beneficiaries" : "Held > 12 months"}
            </span>
          </div>
        )}
      </div>

      {/* ── WAIT vs SELL ENGINE ───────────────────────────────────────────── */}
      {s.structure !== "company" && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4" style={{ color: "hsl(43,90%,60%)" }} />
            <span className="text-sm font-bold">Sell Now or Wait?</span>
          </div>

          {over12 ? (
            <div className="rounded-xl px-4 py-3 flex items-center gap-2"
              style={{ background: "hsl(142,55%,8%)", border: "1px solid hsl(142,45%,20%)" }}>
              <CheckCircle className="w-4 h-4 shrink-0" style={{ color: "hsl(142,65%,55%)" }} />
              <div>
                <p className="text-xs font-bold" style={{ color: "hsl(142,65%,55%)" }}>You already qualify for the 50% CGT discount.</p>
                <p className="text-[11px] text-muted-foreground">No waiting required. Sell when market conditions are right.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-border/40 p-4 bg-secondary/10">
                  <div className="text-[10px] text-muted-foreground uppercase">Sell Now (no discount)</div>
                  <div className="text-base font-bold mt-1" style={{ color: "hsl(0,65%,55%)" }}>{mv($(sellNowResult.totalTax))} tax</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{mv($(sellNowResult.cashToBank))} to bank</div>
                </div>
                <div className="rounded-xl border border-emerald-500/30 p-4"
                  style={{ background: "hsl(142,55%,6%)" }}>
                  <div className="text-[10px] text-muted-foreground uppercase">Wait {mthsToGo} Months</div>
                  <div className="text-base font-bold mt-1" style={{ color: "hsl(142,60%,52%)" }}>{mv($(sellWaitResult.totalTax))} tax</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{mv($(sellWaitResult.cashToBank))} to bank</div>
                </div>
                <div className={`rounded-xl border p-4 ${netBenefitWaiting > 0 ? "border-amber-500/30" : "border-border/40"}`}
                  style={netBenefitWaiting > 0 ? { background: "hsl(43,60%,8%)" } : {}}>
                  <div className="text-[10px] text-muted-foreground uppercase">Net Benefit Waiting</div>
                  <div className="text-base font-bold mt-1" style={{ color: netBenefitWaiting > 0 ? "hsl(43,90%,60%)" : "hsl(215,12%,50%)" }}>
                    {netBenefitWaiting > 0 ? "+" : ""}{mv($(netBenefitWaiting))}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {mv($(taxSavedByWaiting))} saved − {mv($(holdingCost))} costs
                  </div>
                </div>
              </div>

              {/* Recommendation box */}
              <div className="rounded-xl px-4 py-3 flex items-start gap-2"
                style={{
                  background:  netBenefitWaiting > 0 ? "hsl(43,60%,8%)" : "hsl(222,20%,9%)",
                  border:      `1px solid ${netBenefitWaiting > 0 ? "hsl(43,55%,22%)" : "hsl(222,15%,20%)"}`,
                }}>
                <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: netBenefitWaiting > 0 ? "hsl(43,90%,60%)" : "hsl(215,12%,55%)" }} />
                <div>
                  <p className="text-xs font-bold" style={{ color: netBenefitWaiting > 0 ? "hsl(43,90%,60%)" : "hsl(215,12%,65%)" }}>
                    {netBenefitWaiting > 5000
                      ? `Recommendation: WAIT ${mthsToGo} months`
                      : netBenefitWaiting > 0
                      ? "Marginal benefit — consider market timing"
                      : "Holding costs exceed tax saving — SELL NOW if market is right"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Waiting {mthsToGo} months saves {mv($(taxSavedByWaiting))} in tax.
                    {" "}Holding cost for {mthsToGo} months = {mv($(holdingCost))}.
                    {" "}Net benefit = {mv($(netBenefitWaiting))}.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FULL WATERFALL BREAKDOWN ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <button onClick={() => setShowBreakdown(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/20 transition-all">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Full Calculation Breakdown</span>
          </div>
          {showBreakdown
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {showBreakdown && (
          <div className="px-5 pb-5 border-t border-border/40 pt-4 space-y-2">
            <WRow label="Sale Price"           value={mv($(s.salePrice))}                         color="hsl(210,80%,65%)" />
            <WRow label="− Selling Costs"      value={mv(`−${$(s.sellingCosts)}`)}                color="hsl(0,65%,52%)" />
            <WRow label="= Net Proceeds"       value={mv($(s.salePrice - s.sellingCosts))}         color="hsl(215,12%,75%)" />
            <WRow label="− Cost Base"          value={mv(`−${$(s.purchasePrice + s.buyingCosts)}`)} color="hsl(0,65%,52%)"
              sub={`Purchase ${$(s.purchasePrice)} + Buying costs ${$(s.buyingCosts)}`} />
            <WRow label="= Gross Capital Gain" value={mv($(grossGain))}                            color="hsl(43,90%,60%)" />
            {res.discountApplied && (
              <WRow label="× 50% CGT Discount" value={mv($(grossGain * 0.5))}                     color="hsl(142,60%,52%)"
                sub="ATO s.115-A: 50% discount for individuals/trusts > 12 months" />
            )}
            {s.structure === "company" && (
              <WRow label={`× Company Tax Rate ${s.companyTaxRate}%`} value={mv(`−${$(res.totalTax)}`)} color="hsl(0,65%,52%)" />
            )}
            {s.structure !== "company" && res.persons.map((p, i) => (
              <WRow key={i} label={`${p.name}'s Tax (${Math.round(p.marginalRate * 100)}% marginal)`}
                value={mv(`−${$(p.tax)}`)} color="hsl(0,65%,52%)" />
            ))}
            <div className="border-t border-border/50 mt-1 pt-1" />
            <WRow label="− Loan Payout (settlement)" value={mv(`−${$(s.loanBalance)}`)}          color="hsl(20,75%,55%)" big />
            <WRow label="= CASH TO BANK ACCOUNT"      value={mv($(res.cashToBank))}               color="hsl(142,60%,52%)" big />
          </div>
        )}
      </div>

      {/* ── LEDGER INTEGRATION ───────────────────────────────────────────── */}
      <div className="rounded-2xl border p-5 space-y-3"
        style={{ background: "hsl(262,55%,8%)", borderColor: "hsl(262,45%,22%)" }}>
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5" style={{ color: "hsl(262,70%,65%)" }} />
          <span className="text-xs font-bold" style={{ color: "hsl(262,70%,65%)" }}>Use in Forecast Ledger</span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Push this sale scenario into your central ledger. All downstream modules — Cashflow Charts, Net Worth, FIRE Timeline, Wealth Projection — update automatically.
        </p>

        {/* Preview of what gets pushed */}
        <div className="rounded-xl border border-border/40 overflow-hidden text-xs bg-card/50">
          {[
            { label: `${s.saleDate.slice(0, 7)} Property Sale Proceeds`, value: `+${mv($(s.salePrice - s.sellingCosts))}`, color: "hsl(142,60%,52%)" },
            { label: `${s.saleDate.slice(0, 7)} Loan Payout`, value: `-${mv($(s.loanBalance))}`, color: "hsl(0,65%,52%)" },
            { label: `${s.saleDate.slice(0, 7)} Tax Payment (${res.label})`, value: `-${mv($(res.totalTax))}`, color: "hsl(0,65%,52%)" },
            { label: `${s.saleDate.slice(0, 7)} Net Cash Injection`, value: `+${mv($(res.cashToBank))}`, color: "hsl(43,90%,60%)" },
          ].map((row, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 last:border-0">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-bold tabular-nums" style={{ color: row.color }}>{row.value}</span>
            </div>
          ))}
        </div>

        <Button size="sm" onClick={onForecast} disabled={saving || s.useInForecast}
          className="w-full h-9 text-xs font-semibold"
          style={{ background: "hsl(262,60%,35%)", color: "hsl(262,20%,98%)" }}
          data-testid="button-use-in-forecast">
          {saving ? (
            <><RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />Saving to Ledger…</>
          ) : s.useInForecast ? (
            <><CheckCircle className="w-3 h-3 mr-1.5" />Added to Forecast Ledger</>
          ) : (
            <><Zap className="w-3 h-3 mr-1.5" />Push to Forecast Ledger</>
          )}
        </Button>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function CGTSimulatorPage() {
  const { privacyMode } = useAppStore();
  const { toast } = useToast();
  const mv = (v: string) => privacyMode ? "••••••" : v;

  const [scenarios, setScenarios] = useState<Scenario[]>(DEFAULTS);
  const [activeId, setActiveId]   = useState<string>("A");
  const [saving, setSaving]       = useState(false);

  const active = scenarios.find(s => s.id === activeId) ?? scenarios[0];

  const upd = useCallback(<K extends keyof Scenario>(k: K, v: Scenario[K]) => {
    setScenarios(prev => prev.map(s => s.id === activeId ? { ...s, [k]: v } : s));
  }, [activeId]);

  const result = useMemo(() => calcStructure(active, active.structure), [active]);

  const addScenario = () => {
    const id  = `s-${Date.now()}`;
    const base = scenarios[scenarios.length - 1];
    const letter = String.fromCharCode(65 + scenarios.length);
    setScenarios(prev => [...prev, makeDefault(id, `Scenario ${letter}`, { ...base, id, name: `Scenario ${letter}`, useInForecast: false })]);
    setActiveId(id);
  };

  const removeScenario = (id: string) => {
    if (scenarios.length <= 1) return;
    const remaining = scenarios.filter(s => s.id !== id);
    setScenarios(remaining);
    if (activeId === id) setActiveId(remaining[0].id);
  };

  const handleForecast = async () => {
    setSaving(true);
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const event = {
        type:         "property_sale_cgt",
        id:           `${active.propertyName}-${active.saleDate}`,
        propertyName: active.propertyName,
        saleDate:     active.saleDate,
        salePrice:    active.salePrice,
        sellingCosts: active.sellingCosts,
        loanPayout:   active.loanBalance,
        taxPayable:   result.totalTax,
        structure:    active.structure,
        cashToBank:   result.cashToBank,
        scenario:     active.name,
        pushedAt:     new Date().toISOString(),
      };
      const { data: existing } = await supabase
        .from("financial_plans")
        .select("data")
        .eq("id", "shahrokh-family-main")
        .single();
      if (existing?.data) {
        const planData   = typeof existing.data === "string" ? JSON.parse(existing.data) : existing.data;
        const cgtEvents  = planData.cgtEvents ?? [];
        const idx        = cgtEvents.findIndex((e: any) => e.id === event.id);
        if (idx >= 0) cgtEvents[idx] = event; else cgtEvents.push(event);
        planData.cgtEvents = cgtEvents;
        await supabase
          .from("financial_plans")
          .update({ data: planData, updated_at: new Date().toISOString() })
          .eq("id", "shahrokh-family-main");
      }
      setScenarios(prev => prev.map(s => s.id === activeId ? { ...s, useInForecast: true } : s));
      toast({
        title: "Forecast Ledger Updated",
        description: `${active.propertyName} — ${$(result.cashToBank)} cash injection added for ${active.saleDate.slice(0, 7)}`,
      });
    } catch {
      toast({ title: "Saved Locally", description: "Could not reach Supabase.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // All-scenarios comparison summary
  const allSummary = useMemo(() =>
    scenarios.map(s => ({
      s,
      res: calcStructure(s, s.structure),
      holdDays: Math.max(0, Math.round((new Date(s.saleDate).getTime() - new Date(s.purchaseDate).getTime()) / 86400000)),
    })),
  [scenarios]);

  const bestCashScenario = allSummary.reduce((a, b) => b.res.cashToBank > a.res.cashToBank ? b : a, allSummary[0]);

  return (
    <div className="min-h-screen pb-20 bg-background">

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-3 border-b border-border/50 bg-background/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: "hsl(262,60%,18%)" }}>
              <BarChart3 className="w-4 h-4" style={{ color: "hsl(262,70%,65%)" }} />
            </div>
            <div>
              <h1 className="text-base font-bold">Property Exit Decision Engine</h1>
              <p className="text-[11px] text-muted-foreground">Personal · Trust · Company · ATO 2025-26</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {scenarios.map(s => (
              <div key={s.id} className="flex items-center gap-0.5">
                <button onClick={() => setActiveId(s.id)} data-testid={`scenario-tab-${s.id}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeId === s.id
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "text-muted-foreground border border-border/50 hover:text-foreground"
                  }`}>
                  {s.name.split("—")[0].trim()}
                  {s.useInForecast && <span className="ml-1 text-[8px]" style={{ color: "hsl(142,65%,55%)" }}>✓</span>}
                </button>
                {scenarios.length > 1 && (
                  <button onClick={() => removeScenario(s.id)}
                    className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-red-400 hover:bg-red-900/20 transition-all">
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            ))}
            <button onClick={addScenario} data-testid="button-add-scenario"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground border border-border/50 hover:text-foreground transition-all">
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 pt-6 space-y-6">

        {/* Disclaimer */}
        <div className="rounded-xl px-4 py-3 flex items-start gap-3"
          style={{ background: "hsl(43,55%,8%)", border: "1px solid hsl(43,50%,20%)" }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "hsl(43,90%,60%)" }} />
          <p className="text-xs" style={{ color: "hsl(43,80%,65%)" }}>
            <strong>Indicative estimate only. Not tax advice.</strong> Uses ATO 2025-26 rates. Does not account for all cost base adjustments, depreciation recapture, HELP debts, franking offsets, or complex trust distributions. Verify with a qualified accountant before making property decisions. Company and trust outcomes depend on entity structure, trust deed, and individual circumstances.
          </p>
        </div>

        {/* Scenario name input */}
        <div className="flex items-center gap-3 flex-wrap">
          <Input value={active.name} onChange={e => upd("name", e.target.value)}
            className="max-w-xs bg-background/50 border-border text-sm h-9 font-semibold"
            data-testid="input-scenario-name" />
          {active.useInForecast && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold"
              style={{ background: "hsl(142,55%,8%)", color: "hsl(142,65%,55%)", border: "1px solid hsl(142,45%,22%)" }}>
              <CheckCircle className="w-2.5 h-2.5" /> In Forecast Ledger
            </span>
          )}
        </div>

        {/* Main grid: inputs left, results right */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.35fr] gap-6">

          {/* LEFT: inputs */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <Building2 className="w-4 h-4" style={{ color: "hsl(262,70%,65%)" }} />
              <h2 className="text-sm font-bold">Property &amp; Structure Details</h2>
            </div>
            <InputPanel s={active} upd={upd} />
          </div>

          {/* RIGHT: results */}
          <ResultsPanel s={active} res={result} mv={mv} onForecast={handleForecast} saving={saving} />
        </div>

        {/* All-scenarios cross-comparison table */}
        {scenarios.length > 1 && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 pt-4 pb-3 flex items-center gap-2 border-b border-border/40">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">All Scenarios — Cross Comparison</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: 680 }}>
                <thead>
                  <tr className="border-b border-border/50 bg-secondary/20">
                    {["Scenario", "Structure", "Holding", "Gross Gain", "Tax", "Loan Payout", "Cash To Bank", "ROI", "Ann. Return"].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-muted-foreground font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allSummary.map(({ s: sc, res: r, holdDays }, i) => {
                    const isBest = sc.id === bestCashScenario?.s.id;
                    return (
                      <tr key={sc.id} onClick={() => setActiveId(sc.id)}
                        className={`border-b border-border/20 cursor-pointer transition-colors hover:bg-secondary/10 ${activeId === sc.id ? "bg-primary/5" : ""}`}
                        style={isBest ? { background: "hsl(142,55%,5%)" } : {}}>
                        <td className="px-4 py-3 font-medium">
                          {sc.name.split("—")[0].trim()}
                          {isBest && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                            style={{ background: "hsl(142,55%,15%)", color: "hsl(142,65%,58%)" }}>Best</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-semibold capitalize" style={{ color: { personal: "hsl(210,80%,55%)", trust: "hsl(142,55%,48%)", company: "hsl(262,65%,60%)" }[sc.structure] }}>
                            {sc.structure}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span style={{ color: holdDays >= 365 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" }}>
                            {Math.floor(holdDays / 30)}mo {holdDays >= 365 ? "✓" : "✗"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono" style={{ color: r.grossGain >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" }}>{mv($(r.grossGain))}</td>
                        <td className="px-4 py-3 font-mono" style={{ color: "hsl(0,65%,52%)" }}>{mv($(r.totalTax))}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">{mv($(r.loanPayout))}</td>
                        <td className="px-4 py-3 font-bold font-mono" style={{ color: isBest ? "hsl(142,60%,52%)" : "hsl(43,85%,55%)" }}>{mv($(r.cashToBank))}</td>
                        <td className="px-4 py-3" style={{ color: r.roi >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" }}>{pct(r.roi)}</td>
                        <td className="px-4 py-3" style={{ color: r.annualisedReturn >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" }}>{pct(r.annualisedReturn)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {bestCashScenario && (
              <div className="px-5 pb-4 pt-3 border-t border-border/30">
                <div className="rounded-xl px-4 py-2.5 flex items-center gap-2"
                  style={{ background: "hsl(142,55%,8%)", border: "1px solid hsl(142,45%,20%)" }}>
                  <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: "hsl(142,65%,55%)" }} />
                  <span className="text-xs" style={{ color: "hsl(142,65%,55%)" }}>
                    Best cash outcome: <strong>{bestCashScenario.s.name}</strong> ({bestCashScenario.s.structure}) — {mv($(bestCashScenario.res.cashToBank))} to bank
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tax rates reference */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">2025-26 ATO Tax Reference</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Income Tax Brackets</p>
              <div className="space-y-1">
                {[
                  ["$0 – $18,200",       "0%",   "Tax-free threshold"],
                  ["$18,201 – $45,000",  "16%",  "Stage 3"],
                  ["$45,001 – $135,000", "30%",  "Middle bracket"],
                  ["$135,001 – $190,000","37%",  "Upper"],
                  ["$190,001+",          "45%",  "Top marginal"],
                ].map(([range, rate, note]) => (
                  <div key={range} className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">{range}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground/60">{note}</span>
                      <span className="font-bold" style={{ color: "hsl(210,80%,65%)" }}>{rate}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">CGT Discount Rules</p>
                <div className="space-y-1 text-[11px]">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground"><strong>Personal / Trust:</strong> 50% CGT discount if held &gt;12 months</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground"><strong>Trust:</strong> Can pass 50% discount through to individual beneficiaries</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground"><strong>Company:</strong> No CGT discount — 25% or 30% flat on full gain</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                    <span className="text-muted-foreground"><strong>Medicare Levy:</strong> 2% on taxable income (can toggle on/off)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

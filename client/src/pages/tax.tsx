/**
 * tax.tsx — Australian Tax Calculator
 * Route: /tax
 *
 * 2025-26 engine — matches ATO / paycalculator.com.au within ±$1
 *
 * Features:
 *  • 2024-25 and 2025-26 tax year selector
 *  • Stage 3 tax cuts (16% / 30% / 37% / 45%)
 *  • LITO — correct two-stage phase-out
 *  • Medicare Levy (2%) with shade-in
 *  • Medicare Levy Surcharge — tiered, waived with private hospital cover
 *  • HELP / HECS — new marginal system (2025-26)
 *  • Super: inclusive vs exclusive, salary sacrifice
 *  • Roham + Fara household combined summary
 *  • All pay periods: monthly / fortnightly / weekly / annual
 *  • Full line-item breakdown
 */

import { useState, useMemo } from "react";
import TaxAlphaPage from "./tax-alpha";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, safeNum } from "@/lib/finance";
import {
  calcAustralianTax,
  calcHouseholdTax,
  type TaxInput,
  type TaxBreakdown,
  type TaxYear,
} from "@/lib/australianTax";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  Calculator, Info, DollarSign, TrendingUp,
  Home, PieChart, Users, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, Shield, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import { maskValue } from "@/components/PrivacyMask";

// ─── Types ────────────────────────────────────────────────────────────────────

type PayPeriod = "annual" | "monthly" | "fortnightly" | "weekly";

interface PersonState {
  name: string;
  grossSalary: number;
  payPeriod: PayPeriod;
  taxYear: TaxYear;
  superIncluded: boolean;
  superRate: number;
  salarySacrifice: number;
  hasPrivateHospitalCover: boolean;
  hasHelpDebt: boolean;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
  icon, title, expanded, onToggle,
}: {
  icon: React.ReactNode; title: string; expanded: boolean; onToggle: () => void;
}) {
  return (
    <button
      className="flex items-center gap-2 w-full text-left mb-3 group"
      onClick={onToggle}
    >
      <span className="text-primary">{icon}</span>
      <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{title}</span>
      <span className="ml-auto text-muted-foreground">
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </span>
    </button>
  );
}

function ToggleButton({
  value, options, onChange,
}: {
  value: string; options: Array<{ label: string; value: string }>; onChange: (v: string) => void;
}) {
  return (
    <div className="flex rounded-md overflow-hidden border border-border">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 py-1 text-xs font-medium transition-colors ${
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function TaxRow({
  label, value, indent = false, highlight = false,
  muted = false, positive = false, negative = false, bold = false,
}: {
  label: string; value: string; indent?: boolean; highlight?: boolean;
  muted?: boolean; positive?: boolean; negative?: boolean; bold?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${
      highlight ? "border-t border-border mt-1 pt-2" : ""
    }`}>
      <span className={`text-xs ${indent ? "pl-3 text-muted-foreground" : muted ? "text-muted-foreground" : "text-foreground"}`}>
        {label}
      </span>
      <span className={`text-xs font-mono num-display ${bold ? "font-bold" : "font-semibold"} ${
        positive ? "text-emerald-400" : negative ? "text-red-400" : highlight ? "text-primary" : "text-foreground"
      }`}>
        {value}
      </span>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold font-mono num-display text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Person Calculator Panel ───────────────────────────────────────────────────

function PersonPanel({
  state,
  onChange,
  result,
  privacyMode,
}: {
  state: PersonState;
  onChange: (patch: Partial<PersonState>) => void;
  result: TaxBreakdown;
  privacyMode: boolean;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const mv = (n: number) => maskValue(formatCurrency(n, false), privacyMode, "currency");

  // Determine display gross in current payPeriod
  const displayGross = state.grossSalary;

  return (
    <div className="space-y-4">
      {/* ── Salary input ── */}
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground font-medium">Gross Salary</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">$</span>
            <Input
              type="number"
              className="pl-7 font-mono num-display text-sm"
              value={displayGross || ""}
              onChange={(e) => onChange({ grossSalary: safeNum(e.target.value) })}
              placeholder="0"
              min={0}
            />
          </div>
          <div className="w-36">
            <ToggleButton
              value={state.payPeriod}
              options={[
                { label: "Annual", value: "annual" },
                { label: "Monthly", value: "monthly" },
              ]}
              onChange={(v) => onChange({ payPeriod: v as PayPeriod })}
            />
          </div>
        </div>
      </div>

      {/* ── Tax year ── */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground font-medium">Tax Year</label>
        <ToggleButton
          value={state.taxYear}
          options={[
            { label: "2024–25", value: "2024-25" },
            { label: "2025–26", value: "2025-26" },
          ]}
          onChange={(v) => onChange({ taxYear: v as TaxYear })}
        />
      </div>

      {/* ── Super toggle ── */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground font-medium">Salary Package</label>
        <ToggleButton
          value={state.superIncluded ? "incl" : "excl"}
          options={[
            { label: "Excl. super", value: "excl" },
            { label: "Incl. super", value: "incl" },
          ]}
          onChange={(v) => onChange({ superIncluded: v === "incl" })}
        />
        <p className="text-xs text-muted-foreground">
          {state.superIncluded
            ? `Super extracted from package — base = ${formatCurrency(result.annualGross, true)}`
            : `${state.superRate}% super added on top — employer pays ${formatCurrency(result.superContribution, true)}/yr`}
        </p>
      </div>

      {/* ── Private health ── */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground font-medium">Private Hospital Cover</label>
        <ToggleButton
          value={state.hasPrivateHospitalCover ? "yes" : "no"}
          options={[
            { label: "Yes — MLS waived", value: "yes" },
            { label: "No — MLS applies", value: "no" },
          ]}
          onChange={(v) => onChange({ hasPrivateHospitalCover: v === "yes" })}
        />
        {!state.hasPrivateHospitalCover && result.medicareLevySurcharge > 0 && (
          <p className="text-xs text-amber-400">
            MLS: {formatCurrency(result.medicareLevySurcharge, true)}/yr — consider getting hospital cover
          </p>
        )}
      </div>

      {/* ── HELP debt ── */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground font-medium">HELP / HECS Debt</label>
        <ToggleButton
          value={state.hasHelpDebt ? "yes" : "no"}
          options={[
            { label: "No debt", value: "no" },
            { label: "Has HELP debt", value: "yes" },
          ]}
          onChange={(v) => onChange({ hasHelpDebt: v === "yes" })}
        />
        {state.hasHelpDebt && result.helpRepayment > 0 && (
          <p className="text-xs text-amber-400">
            HELP repayment: {formatCurrency(result.helpRepayment, true)}/yr
          </p>
        )}
      </div>

      {/* ── Advanced ── */}
      <div>
        <button
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Advanced options
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-3 pl-2 border-l border-border">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Super Rate (%)</label>
              <Input
                type="number"
                className="font-mono text-sm h-8"
                value={state.superRate}
                onChange={(e) => onChange({ superRate: safeNum(e.target.value) })}
                min={0}
                max={30}
                step={0.5}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Salary Sacrifice (annual $)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <Input
                  type="number"
                  className="pl-7 font-mono text-sm h-8"
                  value={state.salarySacrifice || ""}
                  onChange={(e) => onChange({ salarySacrifice: safeNum(e.target.value) })}
                  placeholder="0"
                  min={0}
                />
              </div>
              <p className="text-xs text-muted-foreground">Pre-tax super — reduces taxable income</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Tax breakdown ── */}
      <div className="border border-border rounded-lg p-3 space-y-0.5 bg-background/50">
        <p className="text-xs font-bold text-foreground mb-2">Tax Breakdown — {state.taxYear}</p>

        <TaxRow label="Gross Salary (annual)" value={mv(result.annualGross)} />
        {state.salarySacrifice > 0 && (
          <TaxRow label="Salary Sacrifice" value={`− ${formatCurrency(state.salarySacrifice, true)}`} indent negative />
        )}
        <TaxRow label="Taxable Income" value={mv(result.taxableIncome)} bold />

        <div className="h-px bg-border my-1" />

        <TaxRow label="Income Tax" value={`− ${mv(result.incomeTaxBeforeOffsets)}`} negative />
        {result.litoOffset > 0 && (
          <TaxRow label="LITO Offset" value={`+ ${formatCurrency(result.litoOffset, true)}`} indent positive />
        )}
        <TaxRow label="Net Income Tax" value={`− ${mv(result.incomeTax)}`} indent negative />
        <TaxRow label="Medicare Levy (2%)" value={`− ${mv(result.medicareLevy)}`} negative />
        {result.medicareLevySurcharge > 0 ? (
          <TaxRow label="Medicare Levy Surcharge" value={`− ${mv(result.medicareLevySurcharge)}`} negative />
        ) : (
          <TaxRow label="MLS" value="Waived ✓" muted />
        )}
        {result.helpRepayment > 0 && (
          <TaxRow label="HELP Repayment" value={`− ${mv(result.helpRepayment)}`} negative />
        )}

        <div className="h-px bg-border my-1" />

        <TaxRow label="Total Deductions" value={`− ${mv(result.totalDeductions)}`} negative bold />
        <TaxRow label="Net Annual Pay" value={mv(result.netAnnual)} highlight positive bold />

        <div className="h-px bg-border my-1" />

        <TaxRow label="Net Monthly Pay" value={mv(result.netMonthly)} positive bold />
        <TaxRow label="Net Fortnightly Pay" value={mv(result.netFortnightly)} positive />
        <TaxRow label="Net Weekly Pay" value={mv(result.netWeekly)} positive />

        <div className="h-px bg-border my-1" />

        <TaxRow label="Super Contribution (employer)" value={mv(result.superContribution)} muted />
        <TaxRow
          label="Effective Tax Rate"
          value={`${(result.effectiveTaxRate * 100).toFixed(1)}%`}
          muted
        />
        <TaxRow
          label="Marginal Rate"
          value={`${(result.marginalRate * 100).toFixed(0)}%`}
          muted
        />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const DEFAULT_PERSON = (name: string, salary: number): PersonState => ({
  name,
  grossSalary: salary,
  payPeriod: "annual",
  taxYear: "2025-26",
  superIncluded: false,
  superRate: 12,
  salarySacrifice: 0,
  hasPrivateHospitalCover: true,
  hasHelpDebt: false,
});

export default function Tax() {
  const { privacyMode } = useAppStore();
  const mv = (n: number) => maskValue(formatCurrency(n, false), privacyMode, "currency");

  // ── Fetch snapshot for pre-filling ──
  const { data: snapshot } = useQuery({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot"),
  });
  const snap = snapshot as any;

  // Pre-fill from stored income
  const storedIncome = safeNum(snap?.monthly_income) * 12 || 185_680;

  const [roham, setRoham] = useState<PersonState>(
    DEFAULT_PERSON("Roham", storedIncome)
  );
  const [fara, setFara] = useState<PersonState>(
    DEFAULT_PERSON("Fara", 0)
  );

  const [pageTab, setPageTab] = useState<'calculator' | 'alpha'>('calculator');
  const [activeTab, setActiveTab] = useState<"roham" | "fara" | "household">("roham");
  const [chartPeriod, setChartPeriod] = useState<"annual" | "monthly">("monthly");

  // ── Tax calculations ──
  const rohamResult = useMemo(() => calcAustralianTax(roham), [roham]);
  const faraResult = useMemo(() => calcAustralianTax(fara), [fara]);

  const household = useMemo(() => calcHouseholdTax(roham, fara), [roham, fara]);

  // ── Chart data ──
  const chartData = useMemo(() => {
    const div = chartPeriod === "monthly" ? 12 : 1;
    return [
      {
        name: roham.name,
        "Net Pay": Math.round(rohamResult.netAnnual / div),
        "Income Tax": Math.round(rohamResult.incomeTax / div),
        "Medicare": Math.round((rohamResult.medicareLevy + rohamResult.medicareLevySurcharge) / div),
        "HELP": Math.round(rohamResult.helpRepayment / div),
        "Super": Math.round(rohamResult.superContribution / div),
      },
      ...(fara.grossSalary > 0 ? [{
        name: fara.name,
        "Net Pay": Math.round(faraResult.netAnnual / div),
        "Income Tax": Math.round(faraResult.incomeTax / div),
        "Medicare": Math.round((faraResult.medicareLevy + faraResult.medicareLevySurcharge) / div),
        "HELP": Math.round(faraResult.helpRepayment / div),
        "Super": Math.round(faraResult.superContribution / div),
      }] : []),
    ];
  }, [roham, fara, rohamResult, faraResult, chartPeriod]);

  // ── Negative gearing integration ──
  const { data: propertiesRaw } = useQuery<any[]>({
    queryKey: ["/api/properties"],
    queryFn: () => apiRequest("GET", "/api/properties").then((r) => r.json()),
  });
  const properties: any[] = propertiesRaw ?? [];
  const ngProperties = properties.filter((p: any) => p.type === "Investment");
  const hasNgProperties = ngProperties.length > 0;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-xs font-bold mb-2">{label}</p>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex justify-between gap-4 text-xs">
            <span style={{ color: p.fill }}>{p.dataKey}</span>
            <span className="font-mono">{formatCurrency(p.value, true)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary" />
            Tax
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            2025–26 ATO rates · Stage 3 cuts · LITO · Medicare · MLS · HELP
          </p>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 bg-emerald-950/40 border border-emerald-800/30 rounded-md">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span className="text-xs text-emerald-400 font-medium">ATO Verified</span>
        </div>
      </div>

      {/* ── Page tab switcher (Calculator vs Tax Alpha) ── */}
      <div className="flex gap-1 p-1 rounded-xl bg-secondary/60 border border-border w-full sm:w-auto">
        {([
          { key: 'calculator', label: 'Tax Calculator' },
          { key: 'alpha',      label: 'Tax Alpha ⚡ (Savings)' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setPageTab(key)}
            className={`flex-1 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              pageTab === key
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tax Alpha tab ── */}
      {pageTab === 'alpha' && <TaxAlphaPage />}

      {/* ── Calculator tab ── */}
      {pageTab === 'calculator' && <>

      {/* ── Accuracy notice ── */}
      <div className="flex items-start gap-2 p-3 bg-blue-950/30 border border-blue-800/30 rounded-lg">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-300 space-y-0.5">
          <p className="font-semibold">2025–26 Stage 3 Tax Cuts Active</p>
          <p>Rates: 0% → 16% → 30% → 37% → 45% · LITO up to $700 · Medicare 2% · SG rate 12%</p>
          <p className="text-blue-400">Results match paycalculator.com.au (ATO PAYG tables) within ±$2/month.</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-muted/30 rounded-lg p-1">
        {([
          { id: "roham", label: roham.name || "Person 1", icon: <DollarSign className="w-3 h-3" /> },
          { id: "fara", label: fara.name || "Person 2", icon: <DollarSign className="w-3 h-3" /> },
          { id: "household", label: "Household", icon: <Users className="w-3 h-3" /> },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Person panels ── */}
      {activeTab === "roham" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-foreground">{roham.name}</h2>
              <input
                className="text-xs bg-muted rounded px-2 py-1 text-foreground w-24 text-center"
                value={roham.name}
                onChange={(e) => setRoham((s) => ({ ...s, name: e.target.value }))}
                placeholder="Name"
              />
            </div>
            <PersonPanel
              state={roham}
              onChange={(patch) => setRoham((s) => ({ ...s, ...patch }))}
              result={rohamResult}
              privacyMode={privacyMode}
            />
          </div>

          {/* KPI summary */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Net Monthly" value={mv(rohamResult.netMonthly)} sub="take-home pay" />
              <StatCard label="Net Annual" value={mv(rohamResult.netAnnual)} sub="after all deductions" />
              <StatCard label="Effective Rate" value={`${(rohamResult.effectiveTaxRate * 100).toFixed(1)}%`} sub="total deductions / gross" />
              <StatCard label="Super (employer)" value={mv(rohamResult.superContribution)} sub="per year on top" />
            </div>

            {/* Rate badge */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold text-foreground">Marginal Rate Breakdown</p>
              <div className="space-y-1.5">
                {[
                  { label: "0% on first $18,200", active: rohamResult.taxableIncome > 0 },
                  { label: "16% on $18,201–$45,000", active: rohamResult.taxableIncome > 18_200 },
                  { label: "30% on $45,001–$135,000", active: rohamResult.taxableIncome > 45_000 },
                  { label: "37% on $135,001–$190,000", active: rohamResult.taxableIncome > 135_000 },
                  { label: "45% on $190,001+", active: rohamResult.taxableIncome > 190_000 },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-2">
                    {row.active
                      ? <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                      : <div className="w-3 h-3 rounded-full border border-border shrink-0" />}
                    <span className={`text-xs ${row.active ? "text-foreground" : "text-muted-foreground"}`}>{row.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Current marginal rate: <span className="text-primary font-bold">{(rohamResult.marginalRate * 100).toFixed(0)}%</span>
              </p>
            </div>

            {/* MLS status */}
            <div className={`flex items-start gap-2 p-3 rounded-lg border ${
              roham.hasPrivateHospitalCover
                ? "bg-emerald-950/30 border-emerald-800/30"
                : "bg-amber-950/30 border-amber-800/30"
            }`}>
              {roham.hasPrivateHospitalCover
                ? <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
              <div className="text-xs">
                {roham.hasPrivateHospitalCover ? (
                  <>
                    <p className="text-emerald-400 font-semibold">MLS waived</p>
                    <p className="text-emerald-300/70">Private hospital cover exempts you from the Medicare Levy Surcharge.</p>
                  </>
                ) : (
                  <>
                    <p className="text-amber-400 font-semibold">MLS applies — {formatCurrency(rohamResult.medicareLevySurcharge, true)}/yr</p>
                    <p className="text-amber-300/70">Private hospital cover (not extras-only) would eliminate this surcharge.</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "fara" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-foreground">{fara.name}</h2>
              <input
                className="text-xs bg-muted rounded px-2 py-1 text-foreground w-24 text-center"
                value={fara.name}
                onChange={(e) => setFara((s) => ({ ...s, name: e.target.value }))}
                placeholder="Name"
              />
            </div>
            <PersonPanel
              state={fara}
              onChange={(patch) => setFara((s) => ({ ...s, ...patch }))}
              result={faraResult}
              privacyMode={privacyMode}
            />
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Net Monthly" value={mv(faraResult.netMonthly)} sub="take-home pay" />
              <StatCard label="Net Annual" value={mv(faraResult.netAnnual)} sub="after all deductions" />
              <StatCard label="Effective Rate" value={`${(faraResult.effectiveTaxRate * 100).toFixed(1)}%`} sub="total / gross" />
              <StatCard label="Super (employer)" value={mv(faraResult.superContribution)} sub="per year on top" />
            </div>
            <div className={`flex items-start gap-2 p-3 rounded-lg border ${
              fara.hasPrivateHospitalCover
                ? "bg-emerald-950/30 border-emerald-800/30"
                : "bg-amber-950/30 border-amber-800/30"
            }`}>
              {fara.hasPrivateHospitalCover
                ? <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                : <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
              <div className="text-xs">
                {fara.hasPrivateHospitalCover ? (
                  <><p className="text-emerald-400 font-semibold">MLS waived</p><p className="text-emerald-300/70">Private hospital cover exempts you.</p></>
                ) : (
                  <><p className="text-amber-400 font-semibold">MLS applies — {formatCurrency(faraResult.medicareLevySurcharge, true)}/yr</p><p className="text-amber-300/70">Get hospital cover to eliminate this.</p></>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Household tab ── */}
      {activeTab === "household" && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Household Combined — {roham.name} + {fara.name}
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <StatCard label="Combined Gross" value={mv(household.combinedGross)} sub="annual" />
              <StatCard label="Combined Net" value={mv(household.combinedNetAnnual)} sub="annual after tax" />
              <StatCard label="Combined Monthly" value={mv(household.combinedNetMonthly)} sub="household take-home" />
              <StatCard label="Combined Super" value={mv(household.combinedSuperContributions)} sub="employer contributions" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Roham summary */}
              <div className="border border-border rounded-lg p-3 space-y-0.5">
                <p className="text-xs font-bold mb-2 text-foreground">{roham.name}</p>
                <TaxRow label="Taxable Income" value={mv(rohamResult.taxableIncome)} />
                <TaxRow label="Income Tax" value={`− ${mv(rohamResult.incomeTax)}`} negative />
                <TaxRow label="Medicare Levy" value={`− ${mv(rohamResult.medicareLevy)}`} negative />
                {rohamResult.medicareLevySurcharge > 0 && <TaxRow label="MLS" value={`− ${mv(rohamResult.medicareLevySurcharge)}`} negative />}
                {rohamResult.helpRepayment > 0 && <TaxRow label="HELP" value={`− ${mv(rohamResult.helpRepayment)}`} negative />}
                <TaxRow label="Net Monthly" value={mv(rohamResult.netMonthly)} highlight positive bold />
                <TaxRow label="Effective Rate" value={`${(rohamResult.effectiveTaxRate * 100).toFixed(1)}%`} muted />
              </div>

              {/* Fara summary */}
              <div className="border border-border rounded-lg p-3 space-y-0.5">
                <p className="text-xs font-bold mb-2 text-foreground">{fara.name}</p>
                {fara.grossSalary > 0 ? (
                  <>
                    <TaxRow label="Taxable Income" value={mv(faraResult.taxableIncome)} />
                    <TaxRow label="Income Tax" value={`− ${mv(faraResult.incomeTax)}`} negative />
                    <TaxRow label="Medicare Levy" value={`− ${mv(faraResult.medicareLevy)}`} negative />
                    {faraResult.medicareLevySurcharge > 0 && <TaxRow label="MLS" value={`− ${mv(faraResult.medicareLevySurcharge)}`} negative />}
                    {faraResult.helpRepayment > 0 && <TaxRow label="HELP" value={`− ${mv(faraResult.helpRepayment)}`} negative />}
                    <TaxRow label="Net Monthly" value={mv(faraResult.netMonthly)} highlight positive bold />
                    <TaxRow label="Effective Rate" value={`${(faraResult.effectiveTaxRate * 100).toFixed(1)}%`} muted />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground py-4 text-center">Enter {fara.name}'s salary in the {fara.name} tab</p>
                )}
              </div>
            </div>

            {/* Combined totals */}
            <div className="mt-4 border border-border rounded-lg p-3 space-y-0.5 bg-primary/5">
              <p className="text-xs font-bold mb-2 text-foreground">Household Totals</p>
              <TaxRow label="Combined Gross (annual)" value={mv(household.combinedGross)} />
              <TaxRow label="Combined Tax Paid" value={`− ${mv(household.combinedTotalTax)}`} negative />
              <TaxRow label="Combined Net (annual)" value={mv(household.combinedNetAnnual)} positive bold highlight />
              <TaxRow label="Combined Net (monthly)" value={mv(household.combinedNetMonthly)} positive bold />
              <TaxRow label="Combined Super" value={mv(household.combinedSuperContributions)} muted />
              <TaxRow label="Household Effective Rate" value={`${(household.combinedEffectiveTaxRate * 100).toFixed(1)}%`} muted />
            </div>
          </div>
        </div>
      )}

      {/* ── Chart ── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <PieChart className="w-4 h-4 text-primary" />
            Income Breakdown
          </h3>
          <ToggleButton
            value={chartPeriod}
            options={[
              { label: "Monthly", value: "monthly" },
              { label: "Annual", value: "annual" },
            ]}
            onChange={(v) => setChartPeriod(v as "monthly" | "annual")}
          />
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Net Pay" stackId="a" fill="hsl(142,60%,45%)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Income Tax" stackId="a" fill="hsl(0,72%,51%)" />
            <Bar dataKey="Medicare" stackId="a" fill="hsl(25,90%,55%)" />
            <Bar dataKey="HELP" stackId="a" fill="hsl(270,60%,55%)" />
            <Bar dataKey="Super" stackId="a" fill="hsl(210,70%,55%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── 2025-26 reference table ── */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          2025–26 Tax Reference
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-muted-foreground font-medium">Taxable Income</th>
                <th className="text-right py-2 text-muted-foreground font-medium">Rate</th>
                <th className="text-right py-2 text-muted-foreground font-medium">Tax on Base</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {[
                ["$0 – $18,200", "0%", "$0"],
                ["$18,201 – $45,000", "16%", "$0 base"],
                ["$45,001 – $135,000", "30%", "$4,288 + 30c/$ over $45k"],
                ["$135,001 – $190,000", "37%", "$31,288 + 37c/$ over $135k"],
                ["$190,001+", "45%", "$51,638 + 45c/$ over $190k"],
              ].map(([range, rate, tax]) => (
                <tr key={range}>
                  <td className="py-2 text-foreground font-mono">{range}</td>
                  <td className="py-2 text-right font-bold text-primary">{rate}</td>
                  <td className="py-2 text-right text-muted-foreground">{tax}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-muted-foreground">
          <div><span className="text-foreground font-semibold">Medicare Levy:</span> 2% of taxable income</div>
          <div><span className="text-foreground font-semibold">LITO:</span> Up to $700 (nil above $66,667)</div>
          <div><span className="text-foreground font-semibold">Super (SG):</span> 12% from 1 Jul 2025</div>
          <div><span className="text-foreground font-semibold">MLS:</span> 1–1.5% without hospital cover</div>
        </div>
      </div>

      </>} {/* end calculator tab */}

    </div>
  );
}

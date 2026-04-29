/**
 * tax.tsx — Australian Tax Calculator (2024-25)
 * Route: /tax
 *
 * Features:
 *  - Two-person income calculator (Your Income + Spouse Income)
 *  - 2024-25 Australian tax brackets
 *  - Medicare levy (2%)
 *  - LITO (Low Income Tax Offset) up to $700
 *  - LMITO ($675 for $37k–$126k incomes)
 *  - Investment property negative gearing (auto-pulls from /api/properties)
 *  - Capital gains with 50% CGT discount for >12m held assets
 *  - Super contributions (concessional + non-concessional)
 *  - Summary panel + Recharts bar chart
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, safeNum } from "@/lib/finance";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from "recharts";
import {
  Calculator, AlertTriangle, Info, ChevronDown, ChevronRight,
  DollarSign, TrendingUp, Home, PieChart, Zap, ArrowRight, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ─── Australian Tax Calculation Engine (2024-25) ──────────────────────────────

function calcIncomeTax(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  if (taxableIncome <= 18200) return 0;
  if (taxableIncome <= 45000) return (taxableIncome - 18200) * 0.19;
  if (taxableIncome <= 120000) return 5092 + (taxableIncome - 45000) * 0.325;
  if (taxableIncome <= 180000) return 29467 + (taxableIncome - 120000) * 0.37;
  return 51667 + (taxableIncome - 180000) * 0.45;
}

function calcMedicareLevy(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  // Phase-in zone: $26,000 – $32,500
  if (taxableIncome < 26000) return 0;
  if (taxableIncome < 32500) return (taxableIncome - 26000) * 0.1;
  return taxableIncome * 0.02;
}

function calcLITO(taxableIncome: number): number {
  // $700 reducing by 5c per $1 over $37,500, fully phased out at $66,667
  if (taxableIncome <= 37500) return 700;
  if (taxableIncome <= 66667) return Math.max(0, 700 - (taxableIncome - 37500) * 0.05);
  return 0;
}

function calcLMITO(taxableIncome: number): number {
  // $675 available for income $37,000–$126,000
  // Phased out for incomes $90,000–$126,000
  if (taxableIncome < 37000) return 0;
  if (taxableIncome <= 90000) return 675;
  if (taxableIncome <= 126000) return Math.max(0, 675 - (taxableIncome - 90000) * (675 / 36000));
  return 0;
}

interface TaxResult {
  grossIncome: number;
  taxableIncome: number;
  incomeTax: number;
  medicareLevy: number;
  lito: number;
  lmito: number;
  netTaxPayable: number;
  monthlyTax: number;
  takeHomePay: number;         // annual
  takeHomeMonthly: number;
  effectiveRate: number;
}

function calcTax(
  salary: number,
  otherIncome: number,
  propertyNet: number,       // negative gearing amount
  cgtAmount: number,         // discounted CGT added
  concessionalSuper: number, // pre-tax (reduces taxable income)
): TaxResult {
  const grossIncome = safeNum(salary) + safeNum(otherIncome);
  // Concessional super reduces taxable income, capped at $27,500
  const concessional = Math.min(safeNum(concessionalSuper), 27500);
  // Property net income (can be negative = negative gearing benefit)
  const propNet = safeNum(propertyNet);
  const cgt = safeNum(cgtAmount);

  let taxableIncome = grossIncome - concessional + propNet + cgt;
  taxableIncome = Math.max(0, taxableIncome);

  const incomeTax = calcIncomeTax(taxableIncome);
  const medicareLevy = calcMedicareLevy(taxableIncome);
  const lito = calcLITO(taxableIncome);
  const lmito = calcLMITO(taxableIncome);

  const netTaxPayable = Math.max(0, incomeTax + medicareLevy - lito - lmito);
  const monthlyTax = netTaxPayable / 12;
  const takeHomePay = grossIncome - netTaxPayable;
  const takeHomeMonthly = takeHomePay / 12;
  const effectiveRate = grossIncome > 0 ? (netTaxPayable / grossIncome) * 100 : 0;

  return {
    grossIncome,
    taxableIncome,
    incomeTax,
    medicareLevy,
    lito,
    lmito,
    netTaxPayable,
    monthlyTax,
    takeHomePay,
    takeHomeMonthly,
    effectiveRate,
  };
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  expanded: boolean;
  onToggle: () => void;
}

function SectionHeader({ icon, title, expanded, onToggle }: SectionHeaderProps) {
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

interface AUDInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  readOnly?: boolean;
  hint?: string;
  className?: string;
}

function AUDInput({ label, value, onChange, readOnly, hint, className = "" }: AUDInputProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      <label className="text-xs text-muted-foreground font-medium">{label}</label>
      <div className="relative flex items-center">
        <span className="absolute left-3 text-xs text-muted-foreground font-mono select-none">AUD</span>
        <Input
          type="number"
          className={`pl-12 text-right font-mono num-display text-sm h-8 ${readOnly ? 'bg-muted text-muted-foreground' : ''}`}
          value={value || ""}
          readOnly={readOnly}
          onChange={e => onChange(safeNum(e.target.value))}
          placeholder="0"
          min={0}
        />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface TaxRowProps {
  label: string;
  value: string;
  indent?: boolean;
  highlight?: boolean;
  muted?: boolean;
  positive?: boolean;
  negative?: boolean;
}

function TaxRow({ label, value, indent, highlight, muted, positive, negative }: TaxRowProps) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${highlight ? 'border-t border-border mt-1' : ''}`}>
      <span className={`text-xs ${indent ? 'pl-3' : ''} ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{label}</span>
      <span className={`text-xs font-mono num-display font-semibold ${positive ? 'text-emerald-400' : negative ? 'text-red-400' : highlight ? 'text-primary' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
        <p className="text-muted-foreground mb-1 font-medium">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>
            {p.name}: {formatCurrency(p.value)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function TaxPage() {
  // ── Person 1 ──────────────────────────────────────────────────────────────
  const [p1Salary, setP1Salary] = useState(0);
  const [p1Other, setP1Other] = useState(0);
  const [p1Concessional, setP1Concessional] = useState(0);
  const [p1NonConcessional, setP1NonConcessional] = useState(0);

  // ── Person 2 ──────────────────────────────────────────────────────────────
  const [p2Salary, setP2Salary] = useState(0);
  const [p2Other, setP2Other] = useState(0);
  const [p2Concessional, setP2Concessional] = useState(0);
  const [p2NonConcessional, setP2NonConcessional] = useState(0);

  // ── Investment Property ────────────────────────────────────────────────────
  const [rentalIncome, setRentalIncome] = useState(0);
  const [propInterest, setPropInterest] = useState(0);
  const [propRates, setPropRates] = useState(0);
  const [propInsurance, setPropInsurance] = useState(0);
  const [propMaintenance, setPropMaintenance] = useState(0);
  const [propOther, setPropOther] = useState(0);

  // ── Capital Gains (full calculator) ──────────────────────────────────────
  const [cgtAssetType, setCgtAssetType] = useState<'property' | 'shares' | 'crypto'>('shares');
  const [cgtPurchaseDate, setCgtPurchaseDate] = useState('');
  const [cgtSaleDate, setCgtSaleDate] = useState('');
  const [cgtPurchasePrice, setCgtPurchasePrice] = useState(0);
  const [cgtSalePrice, setCgtSalePrice] = useState(0);
  const [cgtSellingCosts, setCgtSellingCosts] = useState(0);
  const [cgtOwnershipPct, setCgtOwnershipPct] = useState(100);
  const [cgtPerson, setCgtPerson] = useState<'roham' | 'fara' | 'joint'>('roham');
  const [cgtCurrentIncome, setCgtCurrentIncome] = useState(0);

  // Auto-detect held >12m from dates
  const cgtHeld12m = useMemo(() => {
    if (!cgtPurchaseDate || !cgtSaleDate) return true;
    const purchaseMs = new Date(cgtPurchaseDate).getTime();
    const saleMs = new Date(cgtSaleDate).getTime();
    if (isNaN(purchaseMs) || isNaN(saleMs)) return true;
    return (saleMs - purchaseMs) / (1000 * 60 * 60 * 24) >= 365;
  }, [cgtPurchaseDate, cgtSaleDate]);

  // Full CGT calculation — step-by-step
  const cgtCalc = useMemo(() => {
    const ownerFrac = safeNum(cgtOwnershipPct) / 100;
    const grossProceeds = safeNum(cgtSalePrice) * ownerFrac;
    const costBase = (safeNum(cgtPurchasePrice) + safeNum(cgtSellingCosts)) * ownerFrac;
    const grossCG = grossProceeds - costBase;
    const discount = (cgtHeld12m && grossCG > 0) ? grossCG * 0.5 : 0;
    const taxableCapitalGain = Math.max(0, grossCG - discount);
    const capitalLoss = grossCG < 0 ? Math.abs(grossCG) : 0;
    const baseIncome = safeNum(cgtCurrentIncome);
    const newTaxableIncome = baseIncome + taxableCapitalGain;
    const taxWithout = Math.max(0, calcIncomeTax(baseIncome) + calcMedicareLevy(baseIncome) - calcLITO(baseIncome) - calcLMITO(baseIncome));
    const taxWith = Math.max(0, calcIncomeTax(newTaxableIncome) + calcMedicareLevy(newTaxableIncome) - calcLITO(newTaxableIncome) - calcLMITO(newTaxableIncome));
    const extraTax = Math.max(0, taxWith - taxWithout);
    const effectiveCgtRate = taxableCapitalGain > 0 ? (extraTax / taxableCapitalGain) * 100 : 0;
    const netProceeds = grossProceeds - safeNum(cgtSellingCosts) * ownerFrac - extraTax;
    return { ownerFrac, grossProceeds, costBase, grossCG, discount, taxableCapitalGain, capitalLoss, baseIncome, newTaxableIncome, taxWithout, taxWith, extraTax, effectiveCgtRate, netProceeds };
  }, [cgtSalePrice, cgtPurchasePrice, cgtSellingCosts, cgtOwnershipPct, cgtCurrentIncome, cgtHeld12m]);

  // ── Section visibility ─────────────────────────────────────────────────────
  const [showP1Super, setShowP1Super] = useState(false);
  const [showP2Super, setShowP2Super] = useState(false);
  const [showProperty, setShowProperty] = useState(true);
  const [showCgt, setShowCgt] = useState(true);

  // ── Fetch property data to pre-fill expenses ───────────────────────────────
  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ['/api/properties'],
    queryFn: () => apiRequest('GET', '/api/properties').then(r => r.json()),
  });

  // Auto-fill property expenses from fetched properties (first investment property)
  const investmentProperties = useMemo(
    () => properties.filter((p: any) => p.type !== 'ppor' && p.type !== 'primary'),
    [properties]
  );

  const autofillFromProperty = (prop: any) => {
    setRentalIncome(safeNum(prop.weekly_rent) * 52);
    setPropInterest(safeNum(prop.interest_rate) * safeNum(prop.loan_amount) / 100);
    setPropRates(safeNum(prop.council_rates));
    setPropInsurance(safeNum(prop.insurance));
    setPropMaintenance(safeNum(prop.maintenance));
  };

  // ── Derived calculations ───────────────────────────────────────────────────
  const totalPropExpenses = propInterest + propRates + propInsurance + propMaintenance + propOther;
  const propertyNetIncome = rentalIncome - totalPropExpenses; // negative = negative gearing

  // cgtForP1: discounted taxable gain — passed to income tax calc for person by cgtPerson
  const cgtForP1 = cgtPerson === 'joint'
    ? cgtCalc.taxableCapitalGain * 0.5
    : cgtPerson === 'roham' ? cgtCalc.taxableCapitalGain : 0;
  const cgtForP2 = cgtPerson === 'joint'
    ? cgtCalc.taxableCapitalGain * 0.5
    : cgtPerson === 'fara' ? cgtCalc.taxableCapitalGain : 0;

  // Property net income split 50/50 between both persons (simplified assumption)
  const propNetP1 = propertyNetIncome / 2;
  const propNetP2 = propertyNetIncome / 2;

  const p1 = calcTax(p1Salary, p1Other, propNetP1, cgtForP1, p1Concessional);
  const p2 = calcTax(p2Salary, p2Other, propNetP2, cgtForP2, p2Concessional);

  const combinedTax = p1.netTaxPayable + p2.netTaxPayable;
  const combinedGross = p1.grossIncome + p2.grossIncome;
  const combinedTakeHome = p1.takeHomePay + p2.takeHomePay;
  const combinedEffectiveRate = combinedGross > 0 ? (combinedTax / combinedGross) * 100 : 0;

  const chartData = [
    {
      name: 'Person 1',
      'Gross Income': p1.grossIncome,
      'Tax Payable': p1.netTaxPayable,
      'Take-Home': p1.takeHomePay,
    },
    {
      name: 'Person 2',
      'Gross Income': p2.grossIncome,
      'Tax Payable': p2.netTaxPayable,
      'Take-Home': p2.takeHomePay,
    },
  ];

  const SummaryPanel = ({ person, result, label }: { person: number; result: TaxResult; label: string }) => (
    <div className="space-y-0.5">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <TaxRow label="Gross income" value={formatCurrency(result.grossIncome)} />
      <TaxRow label="Concessional super" value={`- ${formatCurrency(Math.min(person === 1 ? p1Concessional : p2Concessional, 27500))}`} indent muted />
      {propertyNetIncome !== 0 && (
        <TaxRow
          label="Property net income"
          value={`${propertyNetIncome < 0 ? '- ' : '+ '}${formatCurrency(Math.abs(person === 1 ? propNetP1 : propNetP2))}`}
          indent
          muted
          negative={propertyNetIncome < 0}
          positive={propertyNetIncome > 0}
        />
      )}
      {((person === 1 && cgtForP1 > 0) || (person === 2 && cgtForP2 > 0)) && (
        <TaxRow label="Capital gain (discounted)" value={`+ ${formatCurrency(person === 1 ? cgtForP1 : cgtForP2)}`} indent muted />
      )}
      <TaxRow label="Taxable income" value={formatCurrency(result.taxableIncome)} highlight />
      <TaxRow label="Income tax" value={`- ${formatCurrency(result.incomeTax)}`} indent negative />
      <TaxRow label="Medicare levy (2%)" value={`- ${formatCurrency(result.medicareLevy)}`} indent negative />
      {result.lito > 0 && <TaxRow label="LITO offset" value={`+ ${formatCurrency(result.lito)}`} indent positive />}
      {result.lmito > 0 && <TaxRow label="LMITO offset" value={`+ ${formatCurrency(result.lmito)}`} indent positive />}
      <TaxRow label="Net tax payable" value={formatCurrency(result.netTaxPayable)} highlight negative />
      <TaxRow label="Monthly tax impact" value={`- ${formatCurrency(result.monthlyTax)}/mo`} muted />
      <TaxRow label="Effective tax rate" value={`${result.effectiveRate.toFixed(1)}%`} muted />
      <TaxRow label="Take-home (annual)" value={formatCurrency(result.takeHomePay)} highlight positive />
      <TaxRow label="Take-home (monthly)" value={formatCurrency(result.takeHomeMonthly) + '/mo'} indent positive />
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary" />
            Australian Tax Calculator
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">2024–25 Financial Year · All calculations are estimates only</p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-800/40 bg-amber-950/20 p-3">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-200/80">
          <span className="font-semibold text-amber-300">Estimate only.</span>{' '}
          This calculator uses 2024–25 ATO tax brackets and standard offsets. It does not account for
          tax deductions, private health rebate, HELP debt, or all Medicare Levy Surcharge scenarios.
          Consult a registered tax agent for advice specific to your situation.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* ── Left column: Inputs ─────────────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-4">

          {/* Income sections side-by-side on md+ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Person 1 */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: 'hsl(43,85%,55%)', color: 'hsl(224,40%,8%)' }}>R</div>
                <p className="text-sm font-bold">Your Income</p>
              </div>
              <AUDInput label="Gross annual salary" value={p1Salary} onChange={setP1Salary} />
              <AUDInput label="Other taxable income" value={p1Other} onChange={setP1Other} hint="Freelance, rental, investment income, etc." />
              <AUDInput label="Total taxable income (auto)" value={p1.grossIncome} onChange={() => {}} readOnly />

              {/* Super */}
              <button
                className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
                onClick={() => setShowP1Super(!showP1Super)}
              >
                <Zap className="w-3 h-3" />
                Super contributions
                {showP1Super ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
              {showP1Super && (
                <div className="space-y-2 pt-1">
                  <AUDInput
                    label="Concessional (pre-tax, cap $27,500)"
                    value={p1Concessional}
                    onChange={setP1Concessional}
                    hint="Reduces taxable income"
                  />
                  <AUDInput
                    label="Non-concessional (post-tax, cap $110,000)"
                    value={p1NonConcessional}
                    onChange={setP1NonConcessional}
                    hint="No tax deduction"
                  />
                </div>
              )}
            </div>

            {/* Person 2 */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: 'hsl(188,60%,48%)', color: 'hsl(224,40%,8%)' }}>F</div>
                <p className="text-sm font-bold">Spouse Income</p>
              </div>
              <AUDInput label="Gross annual salary" value={p2Salary} onChange={setP2Salary} />
              <AUDInput label="Other taxable income" value={p2Other} onChange={setP2Other} hint="Freelance, rental, investment income, etc." />
              <AUDInput label="Total taxable income (auto)" value={p2.grossIncome} onChange={() => {}} readOnly />

              {/* Super */}
              <button
                className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
                onClick={() => setShowP2Super(!showP2Super)}
              >
                <Zap className="w-3 h-3" />
                Super contributions
                {showP2Super ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
              {showP2Super && (
                <div className="space-y-2 pt-1">
                  <AUDInput
                    label="Concessional (pre-tax, cap $27,500)"
                    value={p2Concessional}
                    onChange={setP2Concessional}
                    hint="Reduces taxable income"
                  />
                  <AUDInput
                    label="Non-concessional (post-tax, cap $110,000)"
                    value={p2NonConcessional}
                    onChange={setP2NonConcessional}
                    hint="No tax deduction"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Investment Property */}
          <div className="rounded-xl border border-border bg-card p-5">
            <SectionHeader
              icon={<Home className="w-4 h-4" />}
              title="Investment Property"
              expanded={showProperty}
              onToggle={() => setShowProperty(!showProperty)}
            />
            {showProperty && (
              <div className="space-y-3">
                {investmentProperties.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">Auto-fill from:</span>
                    {investmentProperties.map((p: any) => (
                      <button
                        key={p.id}
                        className="text-xs text-primary underline hover:no-underline"
                        onClick={() => autofillFromProperty(p)}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <AUDInput label="Annual rental income" value={rentalIncome} onChange={setRentalIncome} />
                  <AUDInput label="Mortgage interest" value={propInterest} onChange={setPropInterest} />
                  <AUDInput label="Council rates" value={propRates} onChange={setPropRates} />
                  <AUDInput label="Insurance" value={propInsurance} onChange={setPropInsurance} />
                  <AUDInput label="Maintenance" value={propMaintenance} onChange={setPropMaintenance} />
                  <AUDInput label="Other expenses" value={propOther} onChange={setPropOther} />
                </div>

                <div className="rounded-lg bg-secondary/60 p-3 space-y-1 mt-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Total expenses</span>
                    <span className="font-mono num-display text-red-400">- {formatCurrency(totalPropExpenses)}</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-border pt-1 mt-1">
                    <span className="font-medium">Net property income</span>
                    <span className={`font-mono num-display font-bold ${propertyNetIncome >= 0 ? 'text-emerald-400' : 'text-primary'}`}>
                      {propertyNetIncome < 0 ? `- ${formatCurrency(Math.abs(propertyNetIncome))}` : formatCurrency(propertyNetIncome)}
                    </span>
                  </div>
                  {propertyNetIncome < 0 && (
                    <p className="text-xs text-primary/80 italic mt-1">
                      Negative gearing: {formatCurrency(Math.abs(propertyNetIncome))} reduces taxable income (split 50/50).
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Capital Gains / CGT Calculator */}
          <div className="rounded-xl border border-border bg-card p-5">
            <SectionHeader
              icon={<TrendingUp className="w-4 h-4" />}
              title="Capital Gains / CGT Calculator"
              expanded={showCgt}
              onToggle={() => setShowCgt(!showCgt)}
            />
            {showCgt && (
              <div className="space-y-4">
                {/* Disclaimer */}
                <div className="flex items-start gap-2 rounded-lg border border-amber-800/40 bg-amber-950/20 p-2.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-200/80">General information only — not tax advice. Consult a registered tax agent.</p>
                </div>

                {/* Row 1: Asset type + Person */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground font-medium">Asset type</p>
                    <div className="flex gap-2 flex-wrap">
                      {(['property', 'shares', 'crypto'] as const).map(t => (
                        <button key={t} className={`px-3 py-1 text-xs rounded-lg border transition-all ${cgtAssetType === t ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:border-muted-foreground'}`} onClick={() => setCgtAssetType(t)}>
                          {t === 'property' ? 'Property' : t === 'shares' ? 'Shares/ETF' : 'Crypto'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground font-medium">Selling person</p>
                    <div className="flex gap-2">
                      {(['roham', 'fara', 'joint'] as const).map(p => (
                        <button key={p} className={`px-3 py-1 text-xs rounded-lg border transition-all capitalize ${cgtPerson === p ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:border-muted-foreground'}`} onClick={() => setCgtPerson(p)}>
                          {p === 'roham' ? 'Roham' : p === 'fara' ? 'Fara' : 'Joint (50/50)'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Row 2: Dates */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-medium">Purchase date</label>
                    <input
                      type="date"
                      className="w-full h-8 rounded-md border border-border bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      value={cgtPurchaseDate}
                      onChange={e => setCgtPurchaseDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-medium">Sale date (actual or planned)</label>
                    <input
                      type="date"
                      className="w-full h-8 rounded-md border border-border bg-background px-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      value={cgtSaleDate}
                      onChange={e => setCgtSaleDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Held period auto-detected */}
                {cgtPurchaseDate && cgtSaleDate && (
                  <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${cgtHeld12m ? 'bg-emerald-950/30 border border-emerald-800/30 text-emerald-400' : 'bg-amber-950/30 border border-amber-800/30 text-amber-400'}`}>
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    {cgtHeld12m
                      ? 'Held more than 12 months — 50% CGT discount applies'
                      : 'Held less than 12 months — no CGT discount, full gain taxable'}
                  </div>
                )}

                {/* Row 3: Prices + costs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <AUDInput label="Purchase price (cost base)" value={cgtPurchasePrice} onChange={setCgtPurchasePrice} />
                  <AUDInput label="Sale price (gross proceeds)" value={cgtSalePrice} onChange={setCgtSalePrice} />
                  <AUDInput label="Selling costs (agent, legal, etc.)" value={cgtSellingCosts} onChange={setCgtSellingCosts} hint="Added to cost base, reduces gain" />
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-medium">Your ownership %</label>
                    <div className="relative flex items-center">
                      <Input
                        type="number"
                        className="pr-8 text-right font-mono num-display text-sm h-8"
                        value={cgtOwnershipPct || ''}
                        onChange={e => setCgtOwnershipPct(safeNum(e.target.value))}
                        placeholder="100"
                        min={1} max={100}
                      />
                      <span className="absolute right-3 text-xs text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Your share of the asset</p>
                  </div>
                </div>

                {/* Row 4: Base income */}
                <AUDInput
                  label={cgtPerson === 'fara' ? "Fara's current taxable income (before this sale)" : cgtPerson === 'joint' ? "Each person's current taxable income (before this sale)" : "Roham's current taxable income (before this sale)"}
                  value={cgtCurrentIncome}
                  onChange={setCgtCurrentIncome}
                  hint="Used to calculate which tax bracket the gain falls into"
                />

                {/* Step-by-step results */}
                {(cgtSalePrice > 0 || cgtPurchasePrice > 0) && (
                  <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-2.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Step-by-Step CGT Breakdown</p>

                    {/* Step 1: Gross proceeds */}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-foreground/80">Step 1 — Your share of proceeds</p>
                      <div className="pl-3 space-y-0.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Sale price × {cgtOwnershipPct}% ownership</span>
                          <span className="font-mono num-display">{formatCurrency(cgtCalc.grossProceeds)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Step 2: Cost base */}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-foreground/80">Step 2 — Cost base (your share)</p>
                      <div className="pl-3 space-y-0.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">(Purchase price + selling costs) × {cgtOwnershipPct}%</span>
                          <span className="font-mono num-display text-red-400">− {formatCurrency(cgtCalc.costBase)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Step 3: Gross CG */}
                    <div className="flex justify-between text-xs border-t border-border pt-2">
                      <span className="font-semibold">Gross capital gain / (loss)</span>
                      <span className={`font-mono num-display font-bold ${cgtCalc.grossCG >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {cgtCalc.grossCG < 0 ? `(${formatCurrency(Math.abs(cgtCalc.grossCG))})` : formatCurrency(cgtCalc.grossCG)}
                      </span>
                    </div>

                    {/* Step 4: 50% discount */}
                    {cgtCalc.grossCG > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-foreground/80">Step 3 — 50% CGT discount</p>
                        <div className="pl-3 space-y-0.5">
                          {cgtHeld12m ? (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Held &gt;12m — 50% discount applies</span>
                              <span className="font-mono num-display text-primary">− {formatCurrency(cgtCalc.discount)}</span>
                            </div>
                          ) : (
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Held &lt;12m — no discount</span>
                              <span className="font-mono num-display text-muted-foreground">$0</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Taxable CG */}
                    {cgtCalc.grossCG > 0 && (
                      <div className="flex justify-between text-xs border-t border-border pt-2">
                        <span className="font-semibold">Taxable capital gain</span>
                        <span className="font-mono num-display font-bold text-amber-400">{formatCurrency(cgtCalc.taxableCapitalGain)}</span>
                      </div>
                    )}
                    {cgtCalc.capitalLoss > 0 && (
                      <div className="flex justify-between text-xs border-t border-border pt-2">
                        <span className="font-semibold">Capital loss (can offset future gains)</span>
                        <span className="font-mono num-display font-bold text-red-400">{formatCurrency(cgtCalc.capitalLoss)}</span>
                      </div>
                    )}

                    {/* Step 5: Income impact */}
                    {cgtCalc.taxableCapitalGain > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-foreground/80">Step 4 — Income tax impact</p>
                        <div className="pl-3 space-y-0.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Taxable income (before CGT)</span>
                            <span className="font-mono num-display">{formatCurrency(cgtCalc.baseIncome)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">+ Taxable capital gain</span>
                            <span className="font-mono num-display text-amber-400">+ {formatCurrency(cgtCalc.taxableCapitalGain)}</span>
                          </div>
                          <div className="flex justify-between text-xs font-semibold border-t border-border/50 pt-1">
                            <span>New taxable income</span>
                            <span className="font-mono num-display">{formatCurrency(cgtCalc.newTaxableIncome)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Tax before CGT</span>
                            <span className="font-mono num-display text-red-400/70">− {formatCurrency(cgtCalc.taxWithout)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Tax after CGT</span>
                            <span className="font-mono num-display text-red-400">− {formatCurrency(cgtCalc.taxWith)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Final summary cards */}
                    {cgtCalc.taxableCapitalGain > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3 pt-3 border-t border-border">
                        <div className="rounded-lg bg-red-950/30 border border-red-800/30 p-3 text-center">
                          <p className="text-xs text-muted-foreground mb-1">Extra tax due to CGT</p>
                          <p className="text-sm font-bold num-display text-red-400">{formatCurrency(cgtCalc.extraTax)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Effective rate {cgtCalc.effectiveCgtRate.toFixed(1)}%</p>
                        </div>
                        <div className="rounded-lg bg-emerald-950/30 border border-emerald-800/30 p-3 text-center">
                          <p className="text-xs text-muted-foreground mb-1">Net proceeds after tax</p>
                          <p className="text-sm font-bold num-display text-emerald-400">{formatCurrency(cgtCalc.netProceeds)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">Cash you keep</p>
                        </div>
                        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-center">
                          <p className="text-xs text-muted-foreground mb-1">Total gain kept</p>
                          <p className="text-sm font-bold num-display text-primary">{formatCurrency(cgtCalc.netProceeds - cgtCalc.costBase)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">After all costs + tax</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tax brackets reference */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-primary" />
              <p className="text-sm font-bold">2024–25 Tax Brackets (ATO)</p>
            </div>
            <div className="space-y-1.5">
              {[
                { range: '$0 – $18,200', rate: '0%', tax: 'Nil' },
                { range: '$18,201 – $45,000', rate: '19c per $1 over $18,200', tax: '' },
                { range: '$45,001 – $120,000', rate: '32.5c per $1 over $45,000', tax: '$5,092 base' },
                { range: '$120,001 – $180,000', rate: '37c per $1 over $120,000', tax: '$29,467 base' },
                { range: '$180,001+', rate: '45c per $1 over $180,000', tax: '$51,667 base' },
              ].map((b, i) => (
                <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b border-border/50 last:border-0">
                  <span className="text-muted-foreground w-36 shrink-0">{b.range}</span>
                  <span className="flex-1 text-foreground">{b.rate}</span>
                  {b.tax && <span className="text-primary/70">{b.tax}</span>}
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <p>+ Medicare Levy: 2% of taxable income</p>
              <p>+ LITO: up to $700 (phases out $37,500–$66,667)</p>
              <p>+ LMITO: $675 for income $37,000–$126,000</p>
            </div>
          </div>
        </div>

        {/* ── Right column: Summary ────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Combined household */}
          <div className="rounded-xl border border-border bg-card p-5"
            style={{ borderColor: 'rgba(196,165,90,0.3)' }}>
            <div className="flex items-center gap-2 mb-3">
              <PieChart className="w-4 h-4 text-primary" />
              <p className="text-sm font-bold text-gold-gradient">Household Summary</p>
            </div>
            <div className="space-y-0.5">
              <TaxRow label="Combined gross income" value={formatCurrency(combinedGross)} />
              <TaxRow label="Combined tax payable" value={formatCurrency(combinedTax)} highlight negative />
              <TaxRow label="Household effective rate" value={`${combinedEffectiveRate.toFixed(1)}%`} muted />
              <TaxRow label="Combined take-home (annual)" value={formatCurrency(combinedTakeHome)} highlight positive />
              <TaxRow label="Combined take-home (monthly)" value={formatCurrency(combinedTakeHome / 12) + '/mo'} indent positive />
            </div>
          </div>

          {/* Person 1 Summary */}
          <div className="rounded-xl border border-border bg-card p-5">
            <SummaryPanel person={1} result={p1} label="Person 1 — Roham" />
          </div>

          {/* Person 2 Summary */}
          <div className="rounded-xl border border-border bg-card p-5">
            <SummaryPanel person={2} result={p2} label="Person 2 — Fara" />
          </div>

          {/* Super caps */}
          <div className="rounded-xl border border-border bg-card p-5">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Super Contribution Caps</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs font-medium">Concessional (pre-tax)</p>
                  <p className="text-xs text-muted-foreground">Employer + salary sacrifice</p>
                </div>
                <span className="text-xs num-display font-mono text-primary">$27,500</span>
              </div>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs font-medium">Non-concessional (post-tax)</p>
                  <p className="text-xs text-muted-foreground">Personal contributions</p>
                </div>
                <span className="text-xs num-display font-mono text-primary">$110,000</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      {(p1.grossIncome > 0 || p2.grossIncome > 0) && (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm font-bold mb-4">Income vs Tax vs Take-Home Comparison</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} barGap={4} barSize={40}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Gross Income" fill="hsl(43,85%,55%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Tax Payable" fill="hsl(0,72%,51%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Take-Home" fill="hsl(142,60%,45%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legal disclaimer */}
      <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          <strong>Disclaimer:</strong> This is an estimate only and does not constitute tax advice.
          Calculations are based on 2024–25 ATO tax rates and standard offsets. Individual circumstances,
          deductions, HELP/HECS debt, and other factors may affect your actual tax liability.
          Consult a registered tax agent (Tax Agent Registration Act 2009) for personalised advice.
        </p>
      </div>
    </div>
  );
}

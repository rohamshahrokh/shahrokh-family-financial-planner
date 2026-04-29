import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  formatCurrency, safeNum, calcMonthlyRepayment, projectProperty,
  calcNegativeGearing, auMarginalRate,
} from "@/lib/finance";
import { maskValue } from "@/components/PrivacyMask";
import { useAppStore } from "@/lib/store";
import { useForecastAssumptions } from "@/lib/useForecastAssumptions";
import SaveButton from "@/components/SaveButton";
import BulkDeleteModal from "@/components/BulkDeleteModal";
import { Button } from "@/components/ui/button";
import AIInsightsCard from "@/components/AIInsightsCard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, Line, LineChart,
} from "recharts";
import {
  Plus, Trash2, Edit2, Home, Building, ChevronDown, ChevronUp,
  CheckSquare, Square, MapPin, DollarSign, Calculator, TrendingUp,
  Wallet, AlertCircle, Calendar,
} from "lucide-react";
import * as XLSX from "xlsx";

// ─── QLD Stamp Duty estimate ────────────────────────────────────────────────
function estimateStampDuty(price: number): number {
  if (price <= 0) return 0;
  if (price <= 5000) return price * 0.01;
  if (price <= 75000) return 50 + (price - 5000) * 0.015;
  if (price <= 540000) return 1075 + (price - 75000) * 0.035;
  if (price <= 1000000) return 17325 + (price - 540000) * 0.045;
  return 38025 + (price - 1000000) * 0.0575;
}

// ─── Empty property template ────────────────────────────────────────────────
const EMPTY_PROPERTY = {
  name: "New Investment Property",
  type: "investment",
  purchase_date: "",
  settlement_date: "",
  purchase_price: 750000,
  deposit: 150000,
  stamp_duty: 26250,
  legal_fees: 2000,
  building_inspection: 800,
  loan_setup_fees: 1500,
  loan_amount: 600000,
  interest_rate: 6.5,
  loan_type: "PI",
  loan_term: 30,
  io_period_start: "",
  io_period_end: "",
  current_value: 750000,
  capital_growth: 6,
  rental_start_date: "",
  weekly_rent: 550,
  rental_growth: 3,
  vacancy_rate: 2,
  management_fee: 8,
  insurance: 1800,
  council_rates: 2200,
  water_rates: 900,
  maintenance: 2000,
  body_corporate: 0,
  land_tax: 0,
  renovation_costs: 0,
  planned_sale_date: "",
  selling_costs: 2.5,
  projection_years: 10,
  notes: "",
};

// ─── Normalise numeric fields ────────────────────────────────────────────────
const NUM_FIELDS = [
  "purchase_price","deposit","stamp_duty","legal_fees","building_inspection","loan_setup_fees",
  "loan_amount","interest_rate","loan_term","current_value","capital_growth",
  "weekly_rent","rental_growth","vacancy_rate","management_fee",
  "insurance","council_rates","water_rates","maintenance","body_corporate","land_tax","renovation_costs",
  "selling_costs","projection_years",
];

// Columns that exist in sf_properties table.
// Extended columns (building_inspection etc.) are added via SQL migration.
// This list is the safe minimum — unknown cols cause Supabase PGRST204 and
// silently drop to localStorage-only, making the page appear blank.
const SF_PROPERTY_COLS = new Set([
  'name','type','purchase_date','settlement_date','purchase_price','deposit',
  'stamp_duty','legal_fees','building_inspection','loan_setup_fees',
  'loan_amount','interest_rate','loan_type','loan_term',
  'io_period_start','io_period_end','current_value','capital_growth',
  'rental_start_date','weekly_rent','rental_growth','vacancy_rate','management_fee',
  'insurance','council_rates','water_rates','maintenance','body_corporate',
  'land_tax','renovation_costs','planned_sale_date','selling_costs',
  'projection_years','notes',
]);

// Baseline cols that definitely exist before running the v2 migration
const SF_PROPERTY_BASELINE = new Set([
  'name','type','purchase_date','purchase_price','deposit','stamp_duty','legal_fees',
  'loan_amount','interest_rate','loan_type','loan_term','current_value','capital_growth',
  'weekly_rent','rental_growth','vacancy_rate','management_fee',
  'insurance','council_rates','maintenance','selling_costs','projection_years','notes',
]);

function normalisePropertyDraft(d: any) {
  const out: Record<string, any> = {};
  const allowedCols = SF_PROPERTY_COLS;
  for (const k of allowedCols) {
    if (k in d) out[k] = d[k];
  }
  for (const k of NUM_FIELDS) {
    if (k in out) out[k] = parseFloat(String(out[k])) || 0;
  }
  out.projection_years = Math.min(30, Math.max(1, out.projection_years || 10));
  return out;
}

// ─── Derived calcs ───────────────────────────────────────────────────────────
function deriveCalcs(d: any) {
  const price = safeNum(d.purchase_price);
  const deposit = safeNum(d.deposit);
  const loanAmount = safeNum(d.loan_amount) || Math.max(0, price - deposit);
  const stampDuty = safeNum(d.stamp_duty) || estimateStampDuty(price);
  const legalFees = safeNum(d.legal_fees);
  const buildingInspection = safeNum(d.building_inspection);
  const loanSetupFees = safeNum(d.loan_setup_fees);
  const totalAcquisitionCost = price + stampDuty + legalFees + buildingInspection + loanSetupFees;

  const lvr = price > 0 ? (loanAmount / price) * 100 : 0;
  const currentValue = safeNum(d.current_value) || price;
  const currentLVR = currentValue > 0 ? (loanAmount / currentValue) * 100 : 0;
  const equity = currentValue - loanAmount;

  const isIO = d.loan_type === "IO";
  const monthly = isIO
    ? (loanAmount * (safeNum(d.interest_rate) / 100)) / 12
    : calcMonthlyRepayment(loanAmount, safeNum(d.interest_rate), safeNum(d.loan_term) || 30);

  const weeklyRent = safeNum(d.weekly_rent);
  const annualRent = weeklyRent * 52;
  const grossAnnualRent = annualRent * (1 - safeNum(d.vacancy_rate) / 100);
  const netAnnualRent = grossAnnualRent * (1 - safeNum(d.management_fee) / 100);
  const monthlyRent = netAnnualRent / 12;

  const annualRunningCosts =
    safeNum(d.insurance) + safeNum(d.council_rates) + safeNum(d.water_rates) +
    safeNum(d.maintenance) + safeNum(d.body_corporate) + safeNum(d.land_tax) + safeNum(d.renovation_costs);

  const monthlyCashFlow = monthlyRent - monthly - annualRunningCosts / 12;
  const annualCashFlow = monthlyCashFlow * 12;

  const grossYield = currentValue > 0 ? (annualRent / currentValue) * 100 : 0;
  const netYield = currentValue > 0 ? (netAnnualRent - annualRunningCosts) / currentValue * 100 : 0;

  // CGT estimate
  const saleDate = d.planned_sale_date ? new Date(d.planned_sale_date) : null;
  const purchaseDate = d.purchase_date ? new Date(d.purchase_date) : null;
  const sellingCostsPct = safeNum(d.selling_costs);
  const saleProceeds = saleDate ? currentValue * Math.pow(1 + safeNum(d.capital_growth) / 100,
    saleDate ? Math.max(0, (saleDate.getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000)) : 0) : currentValue;
  const sellingCostsAmount = saleProceeds * (sellingCostsPct / 100);
  const capitalGain = saleProceeds - price - totalAcquisitionCost - sellingCostsAmount;
  const heldOver12Months = purchaseDate && saleDate
    ? (saleDate.getTime() - purchaseDate.getTime()) > 365 * 24 * 3600 * 1000
    : true;
  const taxableGain = heldOver12Months ? capitalGain * 0.5 : capitalGain;
  const cgtEstimate = Math.max(0, taxableGain * 0.39); // ~39% marginal rate

  // ─ Negative Gearing (investment properties only) ─
  const isInvestment = d.type !== 'ppor' && d.type !== 'PPOR';
  let ngAnalysis = null as null | {
    annualRentalIncome: number;
    annualInterest: number;
    annualDeductibleExpenses: number;
    annualDepreciation: number;
    taxableRentalResult: number;
    isNegativelyGeared: boolean;
    annualTaxBenefit: number;
    monthlyTaxBenefit: number;
    monthlyCashLoss: number;
    netAfterTaxMonthlyCost: number;
    marginalRate: number;
  };
  if (isInvestment) {
    const grossAnnualRent = safeNum(d.weekly_rent) * 52 * (1 - safeNum(d.vacancy_rate) / 100);
    const annualRentalIncome = grossAnnualRent * (1 - safeNum(d.management_fee) / 100);
    const annualInterest = loanAmount * (safeNum(d.interest_rate) / 100);
    const annualDeductibleExpenses =
      safeNum(d.council_rates) + safeNum(d.insurance) + safeNum(d.maintenance) +
      safeNum(d.water_rates) + safeNum(d.body_corporate) + safeNum(d.land_tax);
    const annualDepreciation = (safeNum(d.purchase_price) || safeNum(d.current_value)) * 0.025;
    const taxableRentalResult = annualRentalIncome - annualInterest - annualDeductibleExpenses - annualDepreciation;
    const isNeg = taxableRentalResult < 0;
    // Use a rough $200k income bracket as default (user may not have snapshot here)
    const marginalRate = auMarginalRate(200_000);
    const annualTaxBenefit = isNeg ? Math.abs(taxableRentalResult) * marginalRate : 0;
    const fullMonthlyLoan = d.loan_type === 'IO'
      ? loanAmount * (safeNum(d.interest_rate) / 100) / 12
      : monthly;
    const monthlyCashLoss = annualRentalIncome / 12 - fullMonthlyLoan - annualDeductibleExpenses / 12;
    ngAnalysis = {
      annualRentalIncome:       Math.round(annualRentalIncome),
      annualInterest:           Math.round(annualInterest),
      annualDeductibleExpenses: Math.round(annualDeductibleExpenses),
      annualDepreciation:       Math.round(annualDepreciation),
      taxableRentalResult:      Math.round(taxableRentalResult),
      isNegativelyGeared:       isNeg,
      annualTaxBenefit:         Math.round(annualTaxBenefit),
      monthlyTaxBenefit:        Math.round(annualTaxBenefit / 12),
      monthlyCashLoss:          Math.round(monthlyCashLoss),
      netAfterTaxMonthlyCost:   Math.round(monthlyCashLoss + annualTaxBenefit / 12),
      marginalRate,
    };
  }

  return {
    loanAmount,
    stampDuty,
    totalAcquisitionCost,
    lvr,
    currentLVR,
    equity,
    monthly,
    monthlyRent,
    monthlyCashFlow,
    annualCashFlow,
    grossYield,
    netYield,
    saleProceeds,
    capitalGain,
    taxableGain,
    cgtEstimate,
    heldOver12Months,
    ngAnalysis,
  };
}

// ─── Custom tooltip ──────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl">
        <p className="text-muted-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>{p.name}: {formatCurrency(p.value, true)}</p>
        ))}
      </div>
    );
  }
  return null;
};

// ─── Field component ─────────────────────────────────────────────────────────
interface FieldProps {
  label: string;
  value: any;
  onChange: (v: any) => void;
  type?: string;
  step?: string;
  prefix?: string;
  readOnly?: boolean;
  highlight?: boolean;
}

function Field({ label, value, onChange, type = "number", step = "1000", prefix = "$", readOnly = false, highlight = false }: FieldProps) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground z-10">{prefix}</span>
        )}
        <Input
          type={type}
          value={value}
          onChange={e => !readOnly && onChange(type === "number" ? e.target.value : e.target.value)}
          step={step}
          readOnly={readOnly}
          className={`h-8 text-sm num-display ${prefix ? "pl-6" : ""} ${readOnly ? "opacity-60 cursor-not-allowed" : ""} ${highlight ? "border-primary/50 bg-primary/5" : ""}`}
        />
      </div>
    </div>
  );
}

// ─── Section accordion ────────────────────────────────────────────────────────
interface SectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ title, icon, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-2.5 bg-secondary/30 hover:bg-secondary/50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2 text-sm font-bold">
          {icon}
          {title}
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Property form ────────────────────────────────────────────────────────────
interface PropertyFormProps {
  data: any;
  onChange: (d: any) => void;
  onEnterSave?: () => void;
}

function PropertyForm({ data, onChange, onEnterSave }: PropertyFormProps) {
  const num = (key: string, v: string) => onChange({ ...data, [key]: v });
  const str = (key: string, v: string) => onChange({ ...data, [key]: v });

  const calcs = deriveCalcs(data);
  const autoStampDuty = estimateStampDuty(safeNum(data.purchase_price));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(e.target as HTMLElement).matches("textarea")) {
      e.preventDefault();
      onEnterSave?.();
    }
  };

  return (
    <div className="space-y-3" onKeyDown={handleKeyDown}>
      {/* Section 1: Purchase Details */}
      <Section title="Purchase Details" icon={<MapPin className="w-3.5 h-3.5 text-primary" />} defaultOpen>
        <div className="col-span-2 sm:col-span-3 lg:col-span-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Property Name</label>
              <Input value={data.name} onChange={e => str("name", e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Type</label>
              <Select value={data.type} onValueChange={v => onChange({ ...data, type: v })}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ppor">PPOR (Primary Residence)</SelectItem>
                  <SelectItem value="investment">Investment Property</SelectItem>
                  <SelectItem value="land">Vacant Land</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <Field label="Purchase Date" value={data.purchase_date} onChange={v => str("purchase_date", v)} type="date" prefix="" />
        <Field label="Settlement Date" value={data.settlement_date} onChange={v => str("settlement_date", v)} type="date" prefix="" />
        <Field label="Purchase Price" value={data.purchase_price} onChange={v => {
          const price = parseFloat(v) || 0;
          const dep = safeNum(data.deposit);
          onChange({
            ...data,
            purchase_price: v,
            loan_amount: Math.max(0, price - dep).toString(),
            stamp_duty: estimateStampDuty(price).toString(),
          });
        }} />
        <Field label="Deposit" value={data.deposit} onChange={v => {
          const dep = parseFloat(v) || 0;
          const price = safeNum(data.purchase_price);
          onChange({
            ...data,
            deposit: v,
            loan_amount: Math.max(0, price - dep).toString(),
          });
        }} />
        <Field label={`LVR (auto) — ${calcs.lvr.toFixed(1)}%`} value={calcs.lvr.toFixed(1)} onChange={() => {}} prefix="%" readOnly highlight />
        <Field label={`Stamp Duty (QLD est: ${formatCurrency(autoStampDuty, true)})`} value={data.stamp_duty} onChange={v => num("stamp_duty", v)} />
        <Field label="Legal Fees" value={data.legal_fees} onChange={v => num("legal_fees", v)} />
        <Field label="Building & Pest Inspection" value={data.building_inspection} onChange={v => num("building_inspection", v)} />
        <Field label="Loan Setup Fees" value={data.loan_setup_fees} onChange={v => num("loan_setup_fees", v)} />
        <Field
          label={`Total Acquisition Cost (auto)`}
          value={Math.round(calcs.totalAcquisitionCost).toString()}
          onChange={() => {}}
          readOnly
          highlight
        />
      </Section>

      {/* Section 2: Loan Details */}
      <Section title="Loan Details" icon={<Calculator className="w-3.5 h-3.5 text-primary" />}>
        <Field label={`Loan Amount (auto)`} value={data.loan_amount} onChange={v => num("loan_amount", v)} />
        <Field label="Interest Rate %" value={data.interest_rate} onChange={v => num("interest_rate", v)} step="0.1" prefix="%" />
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Loan Type</label>
          <Select value={data.loan_type} onValueChange={v => onChange({ ...data, loan_type: v })}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PI">Principal & Interest</SelectItem>
              <SelectItem value="IO">Interest Only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Field label="Loan Term (years)" value={data.loan_term} onChange={v => num("loan_term", v)} step="1" prefix="" />
        <Field label="IO Period Start" value={data.io_period_start} onChange={v => str("io_period_start", v)} type="date" prefix="" />
        <Field label="IO Period End" value={data.io_period_end} onChange={v => str("io_period_end", v)} type="date" prefix="" />
        <Field
          label={`Monthly Repayment (auto)`}
          value={Math.round(calcs.monthly).toString()}
          onChange={() => {}}
          readOnly
          highlight
        />
      </Section>

      {/* Section 3: Current Status */}
      <Section title="Current Status" icon={<TrendingUp className="w-3.5 h-3.5 text-primary" />}>
        <Field label="Current Value" value={data.current_value} onChange={v => num("current_value", v)} />
        <Field label="Capital Growth % p.a." value={data.capital_growth} onChange={v => num("capital_growth", v)} step="0.5" prefix="%" />
        <Field label={`Equity (auto)`} value={Math.round(calcs.equity).toString()} onChange={() => {}} readOnly highlight />
        <Field label={`Current LVR (auto)`} value={calcs.currentLVR.toFixed(1)} onChange={() => {}} prefix="%" readOnly highlight />
      </Section>

      {/* Section 4: Rental Income (investment only) */}
      {(data.type === "investment" || data.type === "land") && (
        <Section title="Rental Income" icon={<DollarSign className="w-3.5 h-3.5 text-primary" />}>
          <Field label="Rental Start Date" value={data.rental_start_date} onChange={v => str("rental_start_date", v)} type="date" prefix="" />
          <Field label="Weekly Rent" value={data.weekly_rent} onChange={v => num("weekly_rent", v)} />
          <Field label="Rental Growth % p.a." value={data.rental_growth} onChange={v => num("rental_growth", v)} step="0.5" prefix="%" />
          <Field label="Vacancy Rate %" value={data.vacancy_rate} onChange={v => num("vacancy_rate", v)} step="0.5" prefix="%" />
          <Field label="Property Mgmt Fee %" value={data.management_fee} onChange={v => num("management_fee", v)} step="0.5" prefix="%" />
          <Field label="Gross Yield (auto)" value={calcs.grossYield.toFixed(2)} onChange={() => {}} prefix="%" readOnly highlight />
          <Field label="Net Yield (auto)" value={calcs.netYield.toFixed(2)} onChange={() => {}} prefix="%" readOnly highlight />
        </Section>
      )}

      {/* Section 5: Running Costs */}
      <Section title="Running Costs (Annual)" icon={<Wallet className="w-3.5 h-3.5 text-primary" />}>
        <Field label="Insurance" value={data.insurance} onChange={v => num("insurance", v)} />
        <Field label="Council Rates" value={data.council_rates} onChange={v => num("council_rates", v)} />
        <Field label="Water Rates" value={data.water_rates} onChange={v => num("water_rates", v)} />
        <Field label="Maintenance" value={data.maintenance} onChange={v => num("maintenance", v)} />
        <Field label="Body Corporate" value={data.body_corporate} onChange={v => num("body_corporate", v)} />
        <Field label="Land Tax" value={data.land_tax} onChange={v => num("land_tax", v)} />
        <Field label="Renovation Costs" value={data.renovation_costs} onChange={v => num("renovation_costs", v)} />
      </Section>

      {/* Section 6: Sale Planning */}
      <Section title="Sale Planning" icon={<Calendar className="w-3.5 h-3.5 text-primary" />}>
        <Field label="Planned Sale Date" value={data.planned_sale_date} onChange={v => str("planned_sale_date", v)} type="date" prefix="" />
        <Field label="Selling Costs %" value={data.selling_costs} onChange={v => num("selling_costs", v)} step="0.5" prefix="%" />
        <Field label="CGT Estimate (auto)" value={Math.round(calcs.cgtEstimate).toString()} onChange={() => {}} readOnly highlight />
        <Field label="Taxable Gain (auto)" value={Math.round(Math.max(0, calcs.taxableGain)).toString()} onChange={() => {}} readOnly highlight />
        <div className="col-span-2 sm:col-span-3 lg:col-span-4">
          <p className="text-xs text-muted-foreground">
            {calcs.heldOver12Months
              ? "CGT 50% discount applied (held >12 months). Estimated at 39% marginal rate."
              : "No CGT discount (held <12 months). Estimated at 39% marginal rate."}
            {" "}Consult a tax adviser for accurate CGT planning.
          </p>
        </div>
      </Section>

      {/* Projection Years */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
        <Field label="Projection Years" value={data.projection_years} onChange={v => num("projection_years", v)} step="1" prefix="" />
      </div>
    </div>
  );
}

// ─── PropertyCard ─────────────────────────────────────────────────────────────
interface PropertyCardProps {
  prop: any;
  onDelete: (id: number) => void;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  privacyMode: boolean;
}

function PropertyCard({ prop, onDelete, selected, onToggleSelect, privacyMode }: PropertyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<any>(null);
  const qc = useQueryClient();
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) =>
      apiRequest("PUT", `/api/properties/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/properties"] });
      setEditing(false);
    },
  });

  const handleEditChange = useCallback((d: any) => setEditDraft(d), []);

  const norm = normalisePropertyDraft(prop);
  const calcs = deriveCalcs(norm);

  // Build projection data for chart
  const projInput = {
    current_value: norm.current_value,
    loan_amount: norm.loan_amount,
    interest_rate: norm.interest_rate,
    loan_type: norm.loan_type,
    loan_term: norm.loan_term,
    weekly_rent: norm.weekly_rent,
    rental_growth: norm.rental_growth,
    vacancy_rate: norm.vacancy_rate,
    management_fee: norm.management_fee,
    council_rates: norm.council_rates,
    insurance: norm.insurance,
    maintenance: norm.maintenance + norm.water_rates + norm.body_corporate + norm.land_tax,
    capital_growth: norm.capital_growth,
    projection_years: norm.projection_years || 10,
  };

  const projection = projectProperty(projInput);
  const purchaseYear = norm.purchase_date ? new Date(norm.purchase_date).getFullYear() : null;
  const currentYear = new Date().getFullYear();

  const chartData = projection.map(p => {
    const isFuturePurchase = purchaseYear && purchaseYear > currentYear + (p.year - currentYear - 1);
    return {
      year: p.year.toString(),
      Value: isFuturePurchase ? 0 : p.value,
      "Loan Balance": isFuturePurchase ? 0 : p.loanBalance,
      Equity: isFuturePurchase ? 0 : p.equity,
      "Annual Cash Flow": isFuturePurchase ? 0 : p.netCashFlow,
    };
  });

  const mv = (v: string) => maskValue(v, privacyMode);

  const handleSaveEdit = () => {
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      updateMut.mutateAsync({ id: prop.id, data: normalisePropertyDraft(editDraft) });
    }, 100);
  };

  const typeLabel = prop.type === "ppor"
    ? "Primary Residence"
    : prop.type === "land"
    ? "Vacant Land"
    : "Investment Property";

  return (
    <div
      className="rounded-xl border bg-card overflow-hidden transition-colors"
      style={{ borderColor: selected ? "hsl(0,72%,51%)" : undefined }}
    >
      {/* Header */}
      <div className="p-4 flex items-center gap-3">
        <button
          onClick={() => onToggleSelect(prop.id)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          data-testid={`checkbox-property-${prop.id}`}
        >
          {selected ? (
            <CheckSquare className="w-4 h-4 text-red-400" />
          ) : (
            <Square className="w-4 h-4" />
          )}
        </button>

        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background:
              prop.type === "ppor"
                ? "rgba(142,200,100,0.1)"
                : "rgba(196,165,90,0.1)",
          }}
        >
          {prop.type === "ppor" ? (
            <Home className="w-4 h-4 text-emerald-400" />
          ) : (
            <Building className="w-4 h-4 text-primary" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{prop.name}</p>
          <p className="text-xs text-muted-foreground">
            {typeLabel} · {prop.loan_type === "IO" ? "Interest Only" : "P&I"}{" "}
            {prop.purchase_date && `· Purchased ${new Date(prop.purchase_date).getFullYear()}`}
          </p>
        </div>

        <div className="text-right hidden sm:block">
          <p className="text-xs text-muted-foreground">Value</p>
          <p className="text-sm font-bold num-display">
            {mv(formatCurrency(prop.current_value, true))}
          </p>
        </div>

        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7"
            onClick={() => {
              setEditing(true);
              setEditDraft({ ...prop });
            }}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7 text-red-400 hover:text-red-300"
            onClick={() => {
              if (confirm("Delete this property?")) onDelete(prop.id);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7"
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Quick Stat Strip */}
      <div className="grid grid-cols-4 gap-px bg-border">
        {[
          { label: "Value", value: mv(formatCurrency(norm.current_value, true)), color: "" },
          { label: "Loan", value: mv(formatCurrency(norm.loan_amount, true)), color: "text-red-400" },
          { label: "Equity", value: mv(formatCurrency(calcs.equity, true)), color: "text-emerald-400" },
          { label: "Monthly Pmt", value: mv(formatCurrency(calcs.monthly, true)), color: "text-primary" },
        ].map(s => (
          <div key={s.label} className="bg-secondary/30 p-2 text-center">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-xs font-bold num-display ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Output KPIs (shown when not editing, always visible) */}
      {!editing && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-px bg-border/30">
          {[
            {
              label: "Monthly CF",
              value: mv(formatCurrency(calcs.monthlyCashFlow, true)),
              color: calcs.monthlyCashFlow >= 0 ? "text-emerald-400" : "text-red-400",
            },
            {
              label: "Annual CF",
              value: mv(formatCurrency(calcs.annualCashFlow, true)),
              color: calcs.annualCashFlow >= 0 ? "text-emerald-400" : "text-red-400",
            },
            {
              label: "LVR",
              value: mv(`${calcs.currentLVR.toFixed(1)}%`),
              color: calcs.currentLVR > 80 ? "text-red-400" : "text-muted-foreground",
            },
            {
              label: "Gross Yield",
              value: mv(`${calcs.grossYield.toFixed(2)}%`),
              color: "text-primary",
            },
            {
              label: "Net Yield",
              value: mv(`${calcs.netYield.toFixed(2)}%`),
              color: "text-primary",
            },
            {
              label: "Acq. Cost",
              value: mv(formatCurrency(calcs.totalAcquisitionCost, true)),
              color: "",
            },
            {
              label: "CGT Est.",
              value: mv(formatCurrency(calcs.cgtEstimate, true)),
              color: "text-red-400",
            },
            {
              label: "Monthly Rent",
              value: mv(formatCurrency(calcs.monthlyRent, true)),
              color: "text-emerald-400",
            },
          ].map(s => (
            <div key={s.label} className="bg-card p-2 text-center">
              <p className="text-xs text-muted-foreground leading-tight">{s.label}</p>
              <p className={`text-xs font-bold num-display mt-0.5 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ─ Negative Gearing Holding Cost Card (investment properties only) ─ */}
      {!editing && calcs.ngAnalysis && (
        <div className={`mx-0 px-4 py-3 border-t border-border ${
          calcs.ngAnalysis.isNegativelyGeared
            ? 'bg-yellow-900/10 border-l-2 border-l-yellow-600/50'
            : 'bg-emerald-900/10 border-l-2 border-l-emerald-600/50'
        }`}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs font-bold text-yellow-300">
                {calcs.ngAnalysis.isNegativelyGeared ? 'Negatively Geared' : 'Positively Geared'}
                <span className="ml-2 text-muted-foreground font-normal">
                  · {Math.round(calcs.ngAnalysis.marginalRate * 100)}% marginal rate
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Taxable result: {formatCurrency(calcs.ngAnalysis.taxableRentalResult, true)}/yr
                {calcs.ngAnalysis.isNegativelyGeared && ` → loss offsets salary tax`}
              </p>
            </div>
            <div className="flex flex-wrap gap-5 text-xs">
              <div>
                <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Monthly Holding Cost</p>
                <p className={`font-bold num-display ${
                  calcs.ngAnalysis.monthlyCashLoss >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}>{mv(formatCurrency(calcs.ngAnalysis.monthlyCashLoss, true))}</p>
              </div>
              {calcs.ngAnalysis.isNegativelyGeared && (
                <>
                  <div>
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Est. Annual Tax Refund</p>
                    <p className="font-bold text-yellow-400 num-display">+{mv(formatCurrency(calcs.ngAnalysis.annualTaxBenefit, true))}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px] uppercase tracking-wide">Net After-Tax Cost/mo</p>
                    <p className={`font-bold num-display ${
                      calcs.ngAnalysis.netAfterTaxMonthlyCost >= 0 ? 'text-emerald-400' : 'text-orange-400'
                    }`}>{mv(formatCurrency(calcs.ngAnalysis.netAfterTaxMonthlyCost, true))}</p>
                  </div>
                </>
              )}
            </div>
          </div>
          {calcs.ngAnalysis.isNegativelyGeared && (
            <div className="mt-2.5 pt-2 border-t border-border/50">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                {[
                  { label: 'Net Rental Income', value: calcs.ngAnalysis.annualRentalIncome, color: 'text-emerald-400' },
                  { label: 'Loan Interest (deductible)', value: -calcs.ngAnalysis.annualInterest, color: 'text-red-400' },
                  { label: 'Running Expenses (deductible)', value: -calcs.ngAnalysis.annualDeductibleExpenses, color: 'text-red-400' },
                  { label: 'Depreciation (Div 43 est.)', value: -calcs.ngAnalysis.annualDepreciation, color: 'text-orange-400' },
                ].map(r => (
                  <div key={r.label}>
                    <p className="text-muted-foreground">{r.label}</p>
                    <p className={`font-semibold num-display ${r.color}`}>
                      {r.value >= 0 ? '+' : ''}{formatCurrency(r.value, true)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit form */}
      {editing && editDraft && (
        <div className="p-4 border-t border-border bg-secondary/10">
          <PropertyForm data={editDraft} onChange={handleEditChange} onEnterSave={handleSaveEdit} />
          <div className="flex gap-2 mt-4">
            <SaveButton
              label="Save Property Scenario"
              onSave={() =>
                updateMut.mutateAsync({
                  id: prop.id,
                  data: normalisePropertyDraft(editDraft),
                })
              }
            />
            <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Expanded projection */}
      {expanded && !editing && (
        <div className="p-4 border-t border-border space-y-4">
          {/* Chart */}
          <div>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Value · Loan · Equity · Cash Flow ({norm.projection_years || 10}Y Projection)
            </h4>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`valGrad-${prop.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142,60%,45%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142,60%,45%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={`eqGrad-${prop.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(43,85%,55%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(43,85%,55%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: "hsl(220,10%,55%)" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(220,10%,55%)" }} tickFormatter={v => `$${(v / 1000000).toFixed(1)}M`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="Value" stroke="hsl(142,60%,45%)" fill={`url(#valGrad-${prop.id})`} strokeWidth={2} name="Value" />
                <Area type="monotone" dataKey="Equity" stroke="hsl(43,85%,55%)" fill={`url(#eqGrad-${prop.id})`} strokeWidth={2} name="Equity" />
                <Line type="monotone" dataKey="Loan Balance" stroke="hsl(0,72%,51%)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Loan Balance" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Annual Cash Flow bar chart */}
          <div>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Annual Cash Flow</h4>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 9, fill: "hsl(220,10%,55%)" }} />
                <YAxis tick={{ fontSize: 9, fill: "hsl(220,10%,55%)" }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Annual Cash Flow" name="Annual Cash Flow"
                  fill="hsl(43,85%,55%)"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Year-by-year table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Year", "Value", "Loan", "Equity", "Net Rent", "Running Costs", "Net CF"].map(h => (
                    <th key={h} className="text-left pb-2 pr-4 text-muted-foreground font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projection.map(p => (
                  <tr key={p.year} className="border-b border-border/40 hover:bg-secondary/20">
                    <td className="py-1.5 pr-4 font-semibold text-primary">{p.year}</td>
                    <td className="py-1.5 pr-4 num-display">{mv(formatCurrency(p.value, true))}</td>
                    <td className="py-1.5 pr-4 num-display text-red-400">{mv(formatCurrency(p.loanBalance, true))}</td>
                    <td className="py-1.5 pr-4 num-display text-emerald-400">{mv(formatCurrency(p.equity, true))}</td>
                    <td className="py-1.5 pr-4 num-display">{mv(formatCurrency(p.rentalIncome, true))}</td>
                    <td className="py-1.5 pr-4 num-display">{mv(formatCurrency(p.expenses, true))}</td>
                    <td className={`py-1.5 pr-4 num-display font-semibold ${p.netCashFlow >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {mv(formatCurrency(p.netCashFlow, true))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Running costs breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[
              { label: "Weekly Rent", value: formatCurrency(norm.weekly_rent) },
              { label: "Annual Gross Rent", value: formatCurrency(norm.weekly_rent * 52) },
              { label: "Vacancy Loss", value: `${norm.vacancy_rate}%` },
              { label: "Mgmt Fee", value: `${norm.management_fee}%` },
              { label: "Insurance", value: formatCurrency(norm.insurance) },
              { label: "Council Rates", value: formatCurrency(norm.council_rates) },
              { label: "Water Rates", value: formatCurrency(norm.water_rates) },
              { label: "Body Corporate", value: formatCurrency(norm.body_corporate) },
            ].map(item => (
              <div key={item.label} className="bg-secondary/30 rounded-lg p-2">
                <p className="text-muted-foreground">{item.label}</p>
                <p className="font-semibold">{mv(item.value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────
export default function PropertyPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { privacyMode } = useAppStore();
  const fa = useForecastAssumptions();
  // Seed new-property form defaults from global forecast assumptions
  const emptyWithDefaults = {
    ...EMPTY_PROPERTY,
    capital_growth: fa.flat.property_growth,
    rental_growth:  fa.flat.rent_growth,
    interest_rate:  fa.flat.interest_rate,
  };
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<any>({ ...emptyWithDefaults });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);

  const handleDraftChange = useCallback((d: any) => setDraft(d), []);

  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ["/api/properties"],
    queryFn: () => apiRequest("GET", "/api/properties").then(r => r.json()),
  });

  const createMut = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", "/api/properties", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/properties"] });
      setShowAdd(false);
      setDraft({ ...EMPTY_PROPERTY });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/properties/${id}`).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/properties"] }),
  });

  // Portfolio summary
  const portfolioValue = properties.reduce((s: number, p: any) => s + safeNum(p.current_value), 0);
  const portfolioLoans = properties.reduce((s: number, p: any) => s + safeNum(p.loan_amount), 0);
  const portfolioEquity = portfolioValue - portfolioLoans;
  const portfolioLVR = portfolioValue > 0 ? (portfolioLoans / portfolioValue) * 100 : 0;

  // Monthly cash flow across all investment props
  const monthlyPortfolioCF = properties.reduce((s: number, p: any) => {
    if (p.type === "ppor") return s;
    const n = normalisePropertyDraft(p);
    const c = deriveCalcs(n);
    return s + c.monthlyCashFlow;
  }, 0);

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === properties.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(properties.map((p: any) => p.id)));
    }
  };

  const handleExportBackup = () => {
    const wb = XLSX.utils.book_new();
    const selectedProps = properties.filter((p: any) => selected.has(p.id));
    const headers = [
      "Name", "Type", "Purchase Price", "Current Value", "Loan Amount",
      "Interest Rate", "Capital Growth", "Weekly Rent", "Purchase Date",
      "Stamp Duty", "Total Acq. Cost",
    ];
    const rows = selectedProps.map((p: any) => {
      const n = normalisePropertyDraft(p);
      const c = deriveCalcs(n);
      return [
        p.name, p.type, n.purchase_price, n.current_value, n.loan_amount,
        n.interest_rate, n.capital_growth, n.weekly_rent, p.purchase_date || "",
        n.stamp_duty, c.totalAcquisitionCost,
      ];
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([headers, ...rows]),
      "Properties Backup"
    );
    XLSX.writeFile(wb, `Properties_Backup_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Backup exported", description: `${selectedProps.length} properties saved to Excel.` });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selected);
    for (const id of ids) {
      await apiRequest("DELETE", `/api/properties/${id}`);
    }
    await qc.invalidateQueries({ queryKey: ["/api/properties"] });
    setSelected(new Set());
    setShowBulkModal(false);
    toast({
      title: `Deleted ${ids.length} properties`,
      description: "Records removed from Supabase and local cache.",
    });
  };

  const mv = (v: string) => maskValue(v, privacyMode);

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Property Portfolio</h1>
          <p className="text-muted-foreground text-sm">
            Australian Investment Property Simulator — Queensland focus
          </p>
        </div>
        <Button
          onClick={() => {
            setShowAdd(true);
            setDraft({ ...EMPTY_PROPERTY });
          }}
          className="gap-2"
          style={{
            background: "linear-gradient(135deg, hsl(43,85%,55%), hsl(43,70%,42%))",
            color: "hsl(224,40%,8%)",
            border: "none",
          }}
          data-testid="button-add-property"
        >
          <Plus className="w-4 h-4" /> Add Property
        </Button>
      </div>

      {/* Portfolio Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Portfolio Value", value: mv(formatCurrency(portfolioValue, true)), color: "" },
          { label: "Total Loans", value: mv(formatCurrency(portfolioLoans, true)), color: "text-red-400" },
          { label: "Total Equity", value: mv(formatCurrency(portfolioEquity, true)), color: "text-emerald-400" },
          { label: "Portfolio LVR", value: mv(`${portfolioLVR.toFixed(1)}%`), color: portfolioLVR > 80 ? "text-red-400" : "text-primary" },
          { label: "Monthly CF (Inv.)", value: mv(formatCurrency(monthlyPortfolioCF, true)), color: monthlyPortfolioCF >= 0 ? "text-emerald-400" : "text-red-400" },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-lg font-bold num-display mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Add Property Form */}
      {showAdd && (
        <div className="rounded-xl border border-primary/30 bg-card p-5">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> Add Property
          </h3>
          <PropertyForm
            data={draft}
            onChange={handleDraftChange}
            onEnterSave={() => createMut.mutateAsync(normalisePropertyDraft(draft))}
          />
          <div className="flex gap-2 mt-4">
            <SaveButton
              label="Save Property Scenario"
              onSave={() => createMut.mutateAsync(normalisePropertyDraft(draft))}
            />
            <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Bulk selection toolbar */}
      {properties.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs h-7"
            onClick={toggleSelectAll}
            data-testid="button-select-all-properties"
          >
            {selected.size === properties.length && properties.length > 0 ? (
              <><CheckSquare className="w-3.5 h-3.5" /> Deselect All</>
            ) : (
              <><Square className="w-3.5 h-3.5" /> Select All ({properties.length})</>
            )}
          </Button>
          {selected.size > 0 && (
            <>
              <span className="text-xs text-muted-foreground">{selected.size} selected</span>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5 text-xs h-7"
                onClick={() => setShowBulkModal(true)}
                data-testid="button-bulk-delete-properties"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete {selected.size} Properties
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </>
          )}
        </div>
      )}

      {/* Property List */}
      {properties.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Home className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted-foreground">No properties added yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add your PPOR and investment properties to start planning.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map((p: any) => (
            <PropertyCard
              key={p.id}
              prop={p}
              onDelete={(id) => deleteMut.mutate(id)}
              selected={selected.has(p.id)}
              onToggleSelect={toggleSelect}
              privacyMode={privacyMode}
            />
          ))}
        </div>
      )}

      {/* QLD Info note */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              <strong className="text-foreground">QLD Stamp Duty:</strong> Auto-estimated using Queensland
              graduated scale. Actual duty may vary — confirm with QLD Revenue Office or solicitor.
            </p>
            <p>
              <strong className="text-foreground">CGT:</strong> 50% discount applied if held &gt;12 months.
              Estimated at 39% marginal rate. Consult your tax adviser for accurate planning.
            </p>
            <p>
              <strong className="text-foreground">PPOR:</strong> No CGT applies to primary residences under
              Australian law. Rental income fields are hidden for PPOR properties.
            </p>
          </div>
        </div>
      </div>

      {/* Bulk Delete Modal */}
      <BulkDeleteModal
        open={showBulkModal}
        count={selected.size}
        label="properties"
        onConfirm={handleBulkDelete}
        onCancel={() => setShowBulkModal(false)}
        onExportBackup={handleExportBackup}
      />

      {/* ─── AI Insights ───────────────────────────────────────────────────── */}
      <AIInsightsCard
        pageKey="property"
        pageLabel="Property Portfolio"
        getData={() => {
        if (!properties?.length) return { count: 0 };
        return { properties: properties.map((p: any) => ({ name: p.name, value: p.value, loan: p.loan_balance, lvr: p.lvr, rentalYield: p.rental_yield, weeklyRent: p.weekly_rent })) };
      }}
      />
    </div>
  );
}

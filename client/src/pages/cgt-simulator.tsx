/**
 * cgt-simulator.tsx — Australian Property Exit Decision Engine v2
 *
 * Full holding-cost + loan-repayment upgrade:
 *   • Interest-Only and Principal & Interest loan calculations
 *   • Weekly rent, vacancy %, property management fee
 *   • Negative gearing tax benefit (annual refund, per year)
 *   • All holding costs: council, insurance, body corporate, maintenance,
 *     land tax, property management, vacancy allowance, other
 *   • TRUE NET PROFIT = Cash to Bank − Deposit − Buying Costs − Out of Pocket
 *   • True ROI, Annualised True Return
 *   • FINAL RESULT summary card (the headline number)
 *   • Ledger integration: all holding-period events pushed
 *
 * Tax engine: australianTax.ts (2025-26 ATO rates)
 */

import { useState, useMemo, useCallback } from "react";
import {
  BarChart3, Building2, AlertTriangle, CheckCircle, Clock, Sparkles,
  RefreshCw, Plus, Trash2, Info, ChevronDown, ChevronUp, Zap,
  Users, Landmark, TrendingUp, DollarSign, ArrowDownLeft,
  CalendarDays, ShieldCheck, ArrowRight, Calculator,
  Home, Banknote, Wallet,
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
type LoanType  = "io" | "pi";
type RepayFreq = "monthly" | "fortnightly" | "weekly";

interface Beneficiary {
  name: string;
  income: number;
  pct: number; // 0-100
}

interface HoldingCosts {
  councilRates:       number; // annual $
  insurance:          number; // annual $
  bodyCorporate:      number; // annual $
  maintenance:        number; // annual $
  propertyMgmtFee:    number; // annual $
  landTax:            number; // annual $
  vacancyAllowance:   number; // annual $
  other:              number; // annual $
}

interface LoanInputs {
  loanType:      LoanType;
  loanAmount:    number;
  interestRate:  number; // % pa
  loanTermYears: number;
  repayFreq:     RepayFreq;
}

interface RentalInputs {
  weeklyRent:    number;
  vacancyPct:    number; // 0-100
  mgmtFeePct:    number; // % of gross rent
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
  deposit: number;           // initial out-of-pocket deposit
  // Legacy simple loan balance (for backwards compat / override)
  loanBalance: number;
  // New detailed loan
  loan: LoanInputs;
  holdingCosts: HoldingCosts;
  rental: RentalInputs;
  // Personal
  structure: Structure;
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
  companyTaxRate: number;
  extractDividend: boolean;
  shareholderIncome: number;
  // Forecast
  useInForecast: boolean;
  // UI state
  showLoanDetail: boolean;
}

interface PersonTaxResult {
  name: string;
  pct: number;
  gainShare: number;
  taxableGain: number;
  tax: number;
  marginalRate: number;
}

interface LoanCalcResult {
  monthlyRepayment: number;
  totalRepayments: number;
  totalInterestPaid: number;
  totalPrincipalRepaid: number;
  remainingBalance: number;
  // IO-specific
  monthlyInterest?: number;
}

interface HoldingCalcResult {
  // Loan
  loan: LoanCalcResult;
  holdMonths: number;
  holdYears: number;
  holdDays: number;
  // Rental
  grossRentalIncome: number;
  vacancyLoss: number;
  mgmtFees: number;
  netRentalIncome: number;
  // Other holding costs (total for hold period)
  councilRates: number;
  insurance: number;
  bodyCorporate: number;
  maintenance: number;
  propertyMgmtFee: number;
  landTax: number;
  vacancyAllowance: number;
  otherCosts: number;
  totalOtherHoldingCosts: number;
  // Negative gearing
  annualTaxableLoss: number;         // < 0 if NG
  ngBenefitPerYear: number;          // tax refund per year
  totalNgBenefit: number;            // over hold period
  // Combined
  totalOutOfPocket: number;          // repayments + costs − income − NG benefit
}

interface StructureResult {
  structure: Structure;
  label: string;
  grossGain: number;
  discountApplied: boolean;
  taxableGain: number;
  totalTax: number;
  persons: PersonTaxResult[];
  // Settlement cash flow
  salePrice: number;
  sellingCosts: number;
  loanPayout: number;
  taxPayable: number;
  cashToBank: number;             // at settlement
  // True profit
  holding: HoldingCalcResult;
  trueNetProfit: number;          // cashToBank − deposit − buyingCosts − totalOutOfPocket
  trueROI: number;
  trueAnnualisedReturn: number;
  // Company extras
  retainedEarnings?: number;
  extractedCash?: number;
  dividendTopUpTax?: number;
  // Standard metrics
  roi: number;
  annualisedReturn: number;
  effectiveTaxRate: number;
  optimalNote?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const $ = (n: number, abs = false): string => {
  const v = abs ? Math.abs(n) : n;
  const neg = !abs && n < 0 ? "−" : "";
  return neg + "$" + Math.round(Math.abs(v)).toLocaleString("en-AU");
};
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const sn  = (v: number) => isFinite(v) ? v : 0;

function personalTax(taxableGainShare: number, baseIncome: number, includeMed: boolean): number {
  const totalInc = baseIncome + Math.max(0, taxableGainShare);
  const taxBefore = calcIncomeTax(baseIncome, "2025-26");
  const taxAfter  = calcIncomeTax(totalInc,   "2025-26");
  const litoB     = Math.min(calcLITO(baseIncome, "2025-26"), taxBefore);
  const litoA     = Math.min(calcLITO(totalInc,   "2025-26"), taxAfter);
  const medB      = includeMed ? calcMedicareLevy(baseIncome, "2025-26") : 0;
  const medA      = includeMed ? calcMedicareLevy(totalInc,   "2025-26") : 0;
  return Math.max(0, (Math.max(0, taxAfter - litoA) + medA) - (Math.max(0, taxBefore - litoB) + medB));
}

// ── Loan calculator ──────────────────────────────────────────────────────────

function calcLoan(loan: LoanInputs, holdMonths: number): LoanCalcResult {
  const r  = loan.interestRate / 100 / 12;  // monthly rate
  const n  = loan.loanTermYears * 12;        // total months
  const P  = loan.loanAmount;

  if (loan.loanType === "io") {
    const monthlyInterest = P * r;
    const totalInterestPaid = monthlyInterest * holdMonths;
    return {
      monthlyRepayment:   monthlyInterest,
      totalRepayments:    totalInterestPaid,
      totalInterestPaid,
      totalPrincipalRepaid: 0,
      remainingBalance:   P,
      monthlyInterest,
    };
  }

  // Principal & Interest
  if (r === 0) {
    const mp = P / n;
    const total = mp * holdMonths;
    return {
      monthlyRepayment:   mp,
      totalRepayments:    total,
      totalInterestPaid:  0,
      totalPrincipalRepaid: total,
      remainingBalance:   Math.max(0, P - total),
    };
  }

  const monthlyRepayment = P * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  // Amortise over holdMonths
  let balance = P;
  let totalInterest = 0;
  let totalPrincipal = 0;
  const months = Math.min(holdMonths, n);
  for (let m = 0; m < months; m++) {
    const intPmt = balance * r;
    const prinPmt = monthlyRepayment - intPmt;
    totalInterest  += intPmt;
    totalPrincipal += prinPmt;
    balance = Math.max(0, balance - prinPmt);
  }
  return {
    monthlyRepayment,
    totalRepayments:     monthlyRepayment * months,
    totalInterestPaid:   totalInterest,
    totalPrincipalRepaid: totalPrincipal,
    remainingBalance:    balance,
  };
}

// ── Holding cost calculator ──────────────────────────────────────────────────

function calcHolding(s: Scenario): HoldingCalcResult {
  const saleDate  = new Date(s.saleDate);
  const purchDate = new Date(s.purchaseDate);
  const holdDays  = Math.max(0, Math.round((saleDate.getTime() - purchDate.getTime()) / 86400000));
  const holdMonths = holdDays / 30.44;
  const holdYears  = holdDays / 365.25;

  const loan = calcLoan(s.loan, holdMonths);

  // Rental income
  const weeksInHold     = holdDays / 7;
  const grossRentalIncome  = s.rental.weeklyRent * weeksInHold;
  const vacancyLoss        = grossRentalIncome * (s.rental.vacancyPct / 100);
  const netBeforeMgmt      = grossRentalIncome - vacancyLoss;
  const mgmtFees           = netBeforeMgmt * (s.rental.mgmtFeePct / 100);
  const netRentalIncome    = netBeforeMgmt - mgmtFees;

  // Other holding costs — scale from annual → hold period
  const scale = holdYears;
  const hc = s.holdingCosts;
  const councilRates    = hc.councilRates    * scale;
  const insurance       = hc.insurance       * scale;
  const bodyCorporate   = hc.bodyCorporate   * scale;
  const maintenance     = hc.maintenance     * scale;
  const propertyMgmtFee = hc.propertyMgmtFee * scale;
  const landTax         = hc.landTax         * scale;
  const vacancyAllowance = hc.vacancyAllowance * scale;
  const otherCosts      = hc.other           * scale;
  const totalOtherHoldingCosts = councilRates + insurance + bodyCorporate + maintenance +
    propertyMgmtFee + landTax + vacancyAllowance + otherCosts;

  // Negative gearing — annual loss
  const annualRentalIncome   = s.rental.weeklyRent * 52 * (1 - s.rental.vacancyPct / 100) * (1 - s.rental.mgmtFeePct / 100);
  const annualInterest       = loan.totalInterestPaid / Math.max(holdYears, 0.001) * (holdYears > 0 ? 1 : 0);
  const annualOtherCosts     = hc.councilRates + hc.insurance + hc.bodyCorporate +
    hc.maintenance + hc.propertyMgmtFee + hc.landTax + hc.vacancyAllowance + hc.other;
  const annualTaxableLoss    = annualRentalIncome - annualInterest - annualOtherCosts; // negative = NG

  // NG benefit: if loss, owner 1 (or trust bens) get tax back at marginal rate
  // We use owner 1 for Personal/Trust; assume corp handles internally
  const marginal1 = calcMarginalRate(s.owner1Income, "2025-26");
  const ngBenefitPerYear = annualTaxableLoss < 0 ? Math.abs(annualTaxableLoss) * marginal1 : 0;
  const totalNgBenefit   = ngBenefitPerYear * holdYears;

  // Total out of pocket during hold = loan repayments + costs - rental income - NG benefit
  const totalOutOfPocket = loan.totalRepayments + totalOtherHoldingCosts - netRentalIncome - totalNgBenefit;

  return {
    loan,
    holdMonths,
    holdYears,
    holdDays,
    grossRentalIncome,
    vacancyLoss,
    mgmtFees,
    netRentalIncome,
    councilRates,
    insurance,
    bodyCorporate,
    maintenance,
    propertyMgmtFee,
    landTax,
    vacancyAllowance,
    otherCosts,
    totalOtherHoldingCosts,
    annualTaxableLoss,
    ngBenefitPerYear,
    totalNgBenefit,
    totalOutOfPocket,
  };
}

// ── Full structure + holding calc ────────────────────────────────────────────

function calcStructure(s: Scenario, structure: Structure, forceDiscount = false): StructureResult {
  const holding   = calcHolding(s);
  const { holdDays, holdYears } = holding;

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
      const gainShare = Math.max(0, grossGain) * o.pct;
      const txGain    = gainShare * discFactor;
      const tax       = personalTax(txGain, o.income, s.includeMedicare);
      const mr        = calcMarginalRate(o.income + txGain, "2025-26");
      totalTax += tax;
      persons.push({ name: o.name, pct: o.pct, gainShare, taxableGain: txGain, tax, marginalRate: mr });
    }

  } else if (structure === "trust") {
    const bens    = s.beneficiaries.filter(b => b.pct > 0);
    const total   = bens.reduce((a, b) => a + b.pct, 0);
    const normBens = total > 0 ? bens.map(b => ({ ...b, pct: b.pct / total })) : bens;

    const testDist = (dist: { name: string; income: number; pct: number }[]) => {
      let t = 0; const ps: PersonTaxResult[] = [];
      for (const b of dist) {
        const gainShare = Math.max(0, grossGain) * b.pct;
        const txGain    = gainShare * discFactor;
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
    taxableGain = Math.max(0, grossGain) * discFactor;

    if (normBens.length >= 2) {
      const sorted = [...normBens].sort((a, b) => a.income - b.income);
      const opt100 = testDist([{ ...sorted[0], pct: 1 }]);
      if (opt100.total < totalTax - 100) {
        const saving = totalTax - opt100.total;
        optimalNote = `Allocating 100% to ${sorted[0].name} saves ${$(saving)} vs equal split.`;
      }
    }

  } else { // company
    const rate    = (s.companyTaxRate || 25) / 100;
    const compTax = Math.max(0, grossGain) * rate;
    taxableGain   = Math.max(0, grossGain);
    totalTax      = compTax;
    retainedEarnings = Math.max(0, grossGain) - compTax;
    persons = [{ name: "Company", pct: 1, gainShare: Math.max(0, grossGain), taxableGain: Math.max(0, grossGain), tax: compTax, marginalRate: rate }];

    if (s.extractDividend) {
      const grossedUp   = retainedEarnings / (1 - rate);
      const frankCredit = grossedUp - retainedEarnings;
      const personalInc = s.shareholderIncome + grossedUp;
      const pTaxTotal   = calcIncomeTax(personalInc, "2025-26") + (s.includeMedicare ? calcMedicareLevy(personalInc, "2025-26") : 0);
      const baseTax     = calcIncomeTax(s.shareholderIncome, "2025-26") + (s.includeMedicare ? calcMedicareLevy(s.shareholderIncome, "2025-26") : 0);
      const topUpTax    = Math.max(0, pTaxTotal - baseTax - frankCredit);
      dividendTopUpTax  = topUpTax;
      extractedCash     = retainedEarnings - topUpTax;
    }
  }

  // Loan payout = remaining balance at sale (from P&I amortisation, or original for IO)
  const loanPayout  = Math.max(0, holding.loan.remainingBalance);
  const cashToBank  = s.salePrice - s.sellingCosts - loanPayout - totalTax;

  // True Net Profit
  const totalCashIn  = s.deposit + s.buyingCosts + holding.totalOutOfPocket;
  const trueNetProfit = cashToBank - s.deposit - s.buyingCosts - holding.totalOutOfPocket;

  const roi            = costBase > 0 ? sn((cashToBank - (costBase - loanPayout)) / costBase) : 0;
  const annualisedReturn = holdYears > 0 ? sn(Math.pow(1 + Math.max(-0.99, roi), 1 / holdYears) - 1) : 0;

  // True ROI = trueNetProfit / total cash invested
  const totalInvested  = s.deposit + s.buyingCosts + Math.max(0, holding.totalOutOfPocket);
  const trueROI        = totalInvested > 0 ? sn(trueNetProfit / totalInvested) : 0;
  const trueAnnualisedReturn = holdYears > 0 ? sn(Math.pow(1 + Math.max(-0.99, trueROI), 1 / holdYears) - 1) : 0;

  const effectiveTaxRate = grossGain > 0 ? totalTax / grossGain : 0;

  return {
    structure,
    label: { personal: "Personal", trust: "Trust", company: "Company" }[structure],
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
    holding,
    trueNetProfit,
    trueROI,
    trueAnnualisedReturn,
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

const DEFAULT_LOAN: LoanInputs = {
  loanType:      "pi",
  loanAmount:    600_000,
  interestRate:  6.2,
  loanTermYears: 30,
  repayFreq:     "monthly",
};

const DEFAULT_HOLDING: HoldingCosts = {
  councilRates:      1_800,
  insurance:         1_400,
  bodyCorporate:     0,
  maintenance:       1_200,
  propertyMgmtFee:   0,
  landTax:           2_200,
  vacancyAllowance:  0,
  other:             0,
};

const DEFAULT_RENTAL: RentalInputs = {
  weeklyRent: 550,
  vacancyPct: 4,
  mgmtFeePct: 8,
};

const makeDefault = (id: string, name: string, overrides: Partial<Scenario> = {}): Scenario => ({
  id,
  name,
  propertyName: "Investment Property 1",
  purchasePrice: 800_000,
  purchaseDate:  "2026-07-15",
  salePrice:     920_000,
  saleDate:      "2028-03-01",
  sellingCosts:  18_000,
  buyingCosts:   26_250,
  deposit:       200_000,
  loanBalance:   600_000,
  loan:          { ...DEFAULT_LOAN },
  holdingCosts:  { ...DEFAULT_HOLDING },
  rental:        { ...DEFAULT_RENTAL },
  structure:     "personal",
  owner1Name:    "Roham",
  owner1Income:  200_000,
  owner1Pct:     50,
  owner2Name:    "Fara",
  owner2Income:  80_000,
  owner2Pct:     50,
  includeMedicare: true,
  beneficiaries: [
    { name: "Roham", income: 200_000, pct: 50 },
    { name: "Fara",  income: 80_000,  pct: 50 },
  ],
  companyTaxRate:   25,
  extractDividend:  false,
  shareholderIncome: 200_000,
  useInForecast:    false,
  showLoanDetail:   true,
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
        active ? "border-2 text-white" : "border-border/50 text-muted-foreground hover:text-foreground"
      }`}
      style={active ? { borderColor: colors[id], background: `${colors[id]}25`, color: colors[id] } : {}}
    >
      {icon} {label}
    </button>
  );
}

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

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
      {icon}{label}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAN INPUTS PANEL
// ─────────────────────────────────────────────────────────────────────────────

function LoanPanel({ s, upd }: { s: Scenario; upd: <K extends keyof Scenario>(k: K, v: Scenario[K]) => void }) {
  const loan = s.loan;
  const updLoan = (k: keyof LoanInputs, v: LoanInputs[typeof k]) =>
    upd("loan", { ...loan, [k]: v });

  return (
    <div className="space-y-4">
      <SectionHeader icon={<Banknote className="w-3.5 h-3.5" />} label="Loan Details" />

      {/* Loan type buttons */}
      <Field label="Loan Type">
        <div className="flex gap-2">
          {(["io", "pi"] as LoanType[]).map(t => (
            <button key={t} onClick={() => updLoan("loanType", t)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                loan.loanType === t
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-400"
                  : "border-border/50 text-muted-foreground hover:text-foreground"
              }`}>
              {t === "io" ? "Interest Only" : "Principal & Interest"}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Loan Amount">
          <Num value={loan.loanAmount} onChange={v => updLoan("loanAmount", v)} step={10000} />
        </Field>
        <Field label="Interest Rate" hint="% per annum">
          <Num value={loan.interestRate} onChange={v => updLoan("interestRate", v)} prefix="%" step={0.1} min={0} />
        </Field>
        {loan.loanType === "pi" && (
          <Field label="Loan Term" hint="Years">
            <Num value={loan.loanTermYears} onChange={v => updLoan("loanTermYears", v)} prefix="yr" step={1} min={1} />
          </Field>
        )}
        <Field label="Repayment Frequency">
          <select
            value={loan.repayFreq}
            onChange={e => updLoan("repayFreq", e.target.value as RepayFreq)}
            className="w-full h-9 rounded-lg bg-background/50 border border-border text-sm px-3 text-foreground"
          >
            <option value="monthly">Monthly</option>
            <option value="fortnightly">Fortnightly</option>
            <option value="weekly">Weekly</option>
          </select>
        </Field>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOLDING COSTS PANEL
// ─────────────────────────────────────────────────────────────────────────────

function HoldingCostPanel({ s, upd }: { s: Scenario; upd: <K extends keyof Scenario>(k: K, v: Scenario[K]) => void }) {
  const hc = s.holdingCosts;
  const updHC = (k: keyof HoldingCosts, v: number) => upd("holdingCosts", { ...hc, [k]: v });
  const r  = s.rental;
  const updR = (k: keyof RentalInputs, v: number) => upd("rental", { ...r, [k]: v });

  return (
    <div className="space-y-5">

      {/* Rental Income */}
      <div>
        <SectionHeader icon={<Home className="w-3.5 h-3.5" />} label="Rental Income" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Weekly Rent">
            <Num value={r.weeklyRent} onChange={v => updR("weeklyRent", v)} step={50} />
          </Field>
          <Field label="Vacancy Rate" hint="% of year vacant">
            <Num value={r.vacancyPct} onChange={v => updR("vacancyPct", Math.min(100, Math.max(0, v)))} prefix="%" step={1} min={0} />
          </Field>
          <Field label="Mgmt Fee" hint="% of gross rent collected">
            <Num value={r.mgmtFeePct} onChange={v => updR("mgmtFeePct", Math.min(30, Math.max(0, v)))} prefix="%" step={0.5} min={0} />
          </Field>
        </div>
      </div>

      {/* Annual holding costs */}
      <div>
        <SectionHeader icon={<Wallet className="w-3.5 h-3.5" />} label="Annual Holding Costs" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Council Rates" hint="Annual">
            <Num value={hc.councilRates} onChange={v => updHC("councilRates", v)} step={100} />
          </Field>
          <Field label="Insurance" hint="Annual">
            <Num value={hc.insurance} onChange={v => updHC("insurance", v)} step={100} />
          </Field>
          <Field label="Body Corporate" hint="Annual">
            <Num value={hc.bodyCorporate} onChange={v => updHC("bodyCorporate", v)} step={100} />
          </Field>
          <Field label="Maintenance" hint="Annual estimate">
            <Num value={hc.maintenance} onChange={v => updHC("maintenance", v)} step={100} />
          </Field>
          <Field label="Property Mgmt" hint="Annual (if not included in % fee)">
            <Num value={hc.propertyMgmtFee} onChange={v => updHC("propertyMgmtFee", v)} step={100} />
          </Field>
          <Field label="Land Tax" hint="Annual">
            <Num value={hc.landTax} onChange={v => updHC("landTax", v)} step={100} />
          </Field>
          <Field label="Vacancy Allowance" hint="Annual buffer">
            <Num value={hc.vacancyAllowance} onChange={v => updHC("vacancyAllowance", v)} step={100} />
          </Field>
          <Field label="Other" hint="Annual">
            <Num value={hc.other} onChange={v => updHC("other", v)} step={100} />
          </Field>
        </div>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INPUT PANEL
// ─────────────────────────────────────────────────────────────────────────────

function InputPanel({ s, upd }: { s: Scenario; upd: <K extends keyof Scenario>(k: K, v: Scenario[K]) => void }) {
  const holding  = calcHolding(s);
  const over12   = holding.holdDays >= 365;

  return (
    <div className="space-y-5">

      {/* Property basics */}
      <div>
        <SectionHeader icon={<Building2 className="w-3.5 h-3.5" />} label="Property Details" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Property Name">
            <Input value={s.propertyName} onChange={e => upd("propertyName", e.target.value)}
              className="bg-background/50 border-border text-sm h-9" />
          </Field>
          <Field label="Initial Deposit" hint="Cash out of pocket at purchase">
            <Num value={s.deposit} onChange={v => upd("deposit", v)} step={10000} />
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
          <Field label="Buying Costs" hint="Stamp duty, legal, conveyancing">
            <Num value={s.buyingCosts} onChange={v => upd("buyingCosts", v)} step={500} />
          </Field>
          <Field label="Selling Costs" hint="Agent, legal, advertising">
            <Num value={s.sellingCosts} onChange={v => upd("sellingCosts", v)} step={500} />
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
            {Math.floor(holding.holdMonths)} months held — {over12 ? "50% CGT discount applies" : "No discount yet"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {over12
              ? "Personal & Trust structures get the 50% CGT discount"
              : `${Math.ceil((365 - holding.holdDays) / 30)} more months to unlock 50% discount`}
          </div>
        </div>
      </div>

      <div className="border-t border-border/40 pt-1" />

      {/* Loan panel */}
      <LoanPanel s={s} upd={upd} />

      <div className="border-t border-border/40 pt-1" />

      {/* Holding costs + rental */}
      <HoldingCostPanel s={s} upd={upd} />

      <div className="border-t border-border/40 pt-1" />

      {/* Structure tabs */}
      <div>
        <SectionHeader icon={<Users className="w-3.5 h-3.5" />} label="Ownership Structure" />
        <div className="flex flex-wrap gap-2">
          <StructTab active={s.structure === "personal"} id="personal" label="Personal"
            icon={<Users className="w-3.5 h-3.5" />} onClick={() => upd("structure", "personal")} />
          <StructTab active={s.structure === "trust"} id="trust" label="Trust"
            icon={<ShieldCheck className="w-3.5 h-3.5" />} onClick={() => upd("structure", "trust")} />
          <StructTab active={s.structure === "company"} id="company" label="Company"
            icon={<Landmark className="w-3.5 h-3.5" />} onClick={() => upd("structure", "company")} />
        </div>
      </div>

      {/* Personal */}
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
              <div className="text-sm font-bold mt-0.5" style={{ color: "hsl(210,75%,60%)" }}>
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
              onChange={e => upd("includeMedicare", e.target.checked)} className="w-3.5 h-3.5 rounded" />
            <span className="text-muted-foreground">Include 2% Medicare Levy</span>
          </label>
        </div>
      )}

      {/* Trust */}
      {s.structure === "trust" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Distribute the discounted capital gain among beneficiaries. Trust passes the 50% CGT discount through to individuals.
          </p>
          {s.beneficiaries.map((b, i) => (
            <div key={i} className="grid grid-cols-3 gap-2 items-end">
              <Field label={i === 0 ? "Beneficiary Name" : ""}>
                <Input value={b.name} onChange={e => {
                  const bens = [...s.beneficiaries]; bens[i] = { ...b, name: e.target.value }; upd("beneficiaries", bens);
                }} className="bg-background/50 border-border text-sm h-9" />
              </Field>
              <Field label={i === 0 ? "Annual Income" : ""}>
                <Num value={b.income} onChange={v => {
                  const bens = [...s.beneficiaries]; bens[i] = { ...b, income: v }; upd("beneficiaries", bens);
                }} step={5000} />
              </Field>
              <Field label={i === 0 ? "Share %" : ""}>
                <div className="flex gap-1">
                  <Num value={b.pct} onChange={v => {
                    const bens = [...s.beneficiaries]; bens[i] = { ...b, pct: Math.min(100, Math.max(0, v)) }; upd("beneficiaries", bens);
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
              onChange={e => upd("includeMedicare", e.target.checked)} className="w-3.5 h-3.5 rounded" />
            <span className="text-muted-foreground">Include Medicare Levy on each beneficiary</span>
          </label>
        </div>
      )}

      {/* Company */}
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
              onChange={e => upd("extractDividend", e.target.checked)} className="w-3.5 h-3.5 rounded" />
            <span className="text-muted-foreground">Calculate dividend extraction</span>
          </label>
          {s.extractDividend && (
            <>
              <Field label="Shareholder Annual Income" hint="Used to calculate top-up tax on franked dividends">
                <Num value={s.shareholderIncome} onChange={v => upd("shareholderIncome", v)} step={5000} />
              </Field>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input type="checkbox" checked={s.includeMedicare}
                  onChange={e => upd("includeMedicare", e.target.checked)} className="w-3.5 h-3.5 rounded" />
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
// HOLDING COST SUMMARY CARD
// ─────────────────────────────────────────────────────────────────────────────

function HoldingSummaryCard({ res, mv }: { res: StructureResult; mv: (v: string) => string }) {
  const [open, setOpen] = useState(true);
  const h = res.holding;
  const loan = h.loan;

  const isNG = h.annualTaxableLoss < 0;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/20 transition-all">
        <div className="flex items-center gap-2">
          <Banknote className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold">Holding Period Cashflow</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold ml-1"
            style={{ background: "hsl(43,60%,10%)", color: "hsl(43,90%,60%)", border: "1px solid hsl(43,55%,22%)" }}>
            {Math.floor(h.holdMonths)}mo
          </span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-border/40 pt-4 space-y-5">

          {/* Loan summary */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">
              Loan — {res.holding.loan.monthlyInterest !== undefined ? "Interest Only" : "Principal & Interest"}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Monthly Repayment", value: mv($(loan.monthlyRepayment)) },
                { label: "Total Repayments", value: mv($(loan.totalRepayments)),   color: "hsl(0,65%,55%)" },
                { label: "Interest Paid",     value: mv($(loan.totalInterestPaid)), color: "hsl(0,55%,52%)" },
                { label: "Remaining Balance (payout)", value: mv($(loan.remainingBalance)), color: "hsl(20,75%,55%)" },
              ].map(m => (
                <div key={m.label} className="rounded-xl border border-border/40 p-3 bg-secondary/10">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{m.label}</div>
                  <div className="text-sm font-bold tabular-nums" style={{ color: m.color ?? "hsl(215,12%,80%)" }}>{m.value}</div>
                </div>
              ))}
              {loan.totalPrincipalRepaid > 0 && (
                <div className="rounded-xl border border-border/40 p-3 bg-secondary/10">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Principal Repaid</div>
                  <div className="text-sm font-bold tabular-nums" style={{ color: "hsl(142,60%,52%)" }}>{mv($(loan.totalPrincipalRepaid))}</div>
                </div>
              )}
            </div>
          </div>

          {/* Rental income */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Rental Income</p>
            <div className="space-y-1">
              <WRow label="Gross Rental Income"      value={mv($(h.grossRentalIncome))}  color="hsl(142,60%,52%)" />
              <WRow label="− Vacancy Loss"           value={mv(`−${$(h.vacancyLoss, true)}`)}  color="hsl(0,65%,52%)" />
              <WRow label="− Management Fees"        value={mv(`−${$(h.mgmtFees, true)}`)}      color="hsl(0,65%,52%)" />
              <WRow label="= Net Rental Income"      value={mv($(h.netRentalIncome))}    color="hsl(142,60%,52%)" big />
            </div>
          </div>

          {/* Holding costs */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Holding Costs (total over hold period)</p>
            <div className="space-y-1">
              {[
                ["Council Rates",          h.councilRates],
                ["Insurance",              h.insurance],
                ["Body Corporate",         h.bodyCorporate],
                ["Maintenance",            h.maintenance],
                ["Property Management",    h.propertyMgmtFee],
                ["Land Tax",               h.landTax],
                ["Vacancy Allowance",      h.vacancyAllowance],
                ["Other",                  h.otherCosts],
              ].filter(([, v]) => (v as number) > 0).map(([label, value]) => (
                <WRow key={label as string} label={label as string} value={mv($(value as number))} color="hsl(0,55%,52%)" />
              ))}
              <WRow label="= Total Other Holding Costs" value={mv($(h.totalOtherHoldingCosts))} color="hsl(0,65%,55%)" big />
            </div>
          </div>

          {/* Negative gearing */}
          {h.annualTaxableLoss !== 0 && (
            <div className="rounded-xl p-4 space-y-2"
              style={{
                background: isNG ? "hsl(142,55%,6%)" : "hsl(43,55%,6%)",
                border: `1px solid ${isNG ? "hsl(142,45%,18%)" : "hsl(43,45%,18%)"}`,
              }}>
              <div className="flex items-center gap-2">
                {isNG
                  ? <CheckCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "hsl(142,65%,55%)" }} />
                  : <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ color: "hsl(43,90%,60%)" }} />}
                <span className="text-xs font-bold" style={{ color: isNG ? "hsl(142,65%,55%)" : "hsl(43,90%,60%)" }}>
                  {isNG ? "Negatively Geared — Tax Refund Applies" : "Positively Geared"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <div className="text-muted-foreground">Annual Taxable {isNG ? "Loss" : "Income"}</div>
                  <div className="font-bold" style={{ color: isNG ? "hsl(0,65%,55%)" : "hsl(142,60%,52%)" }}>
                    {mv($(h.annualTaxableLoss))}
                  </div>
                </div>
                {isNG && (
                  <>
                    <div>
                      <div className="text-muted-foreground">Tax Refund / Year</div>
                      <div className="font-bold" style={{ color: "hsl(142,60%,52%)" }}>{mv($(h.ngBenefitPerYear))}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Total NG Benefit</div>
                      <div className="font-bold" style={{ color: "hsl(142,60%,52%)" }}>{mv($(h.totalNgBenefit))}</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Total out of pocket */}
          <div className="rounded-xl border border-border p-4 bg-secondary/10">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-foreground">Total Out-of-Pocket During Holding</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Repayments + Costs − Rental Income − NG Benefit
                </div>
              </div>
              <div className="text-lg font-bold tabular-nums"
                style={{ color: h.totalOutOfPocket > 0 ? "hsl(0,65%,55%)" : "hsl(142,60%,52%)" }}>
                {mv($(h.totalOutOfPocket))}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FINAL RESULT CARD — THE HEADLINE NUMBER
// ─────────────────────────────────────────────────────────────────────────────

function FinalResultCard({ s, res, mv }: { s: Scenario; res: StructureResult; mv: (v: string) => string }) {
  const h = res.holding;
  const isProfit = res.trueNetProfit >= 0;

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: `2px solid ${isProfit ? "hsl(142,55%,25%)" : "hsl(0,55%,25%)"}` }}>

      {/* Header */}
      <div className="px-5 py-3 flex items-center gap-2"
        style={{ background: isProfit ? "hsl(142,55%,8%)" : "hsl(0,55%,8%)" }}>
        <DollarSign className="w-4 h-4" style={{ color: isProfit ? "hsl(142,65%,55%)" : "hsl(0,65%,55%)" }} />
        <span className="text-xs font-bold uppercase tracking-widest"
          style={{ color: isProfit ? "hsl(142,65%,55%)" : "hsl(0,65%,55%)" }}>
          Final Result — {res.label}
        </span>
      </div>

      {/* 4-tile grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/30">
        {[
          { label: "Cash to Bank at Settlement", value: mv($(res.cashToBank)),       color: "hsl(210,80%,65%)" },
          { label: "ATO Tax Payable",            value: mv($(res.totalTax)),          color: "hsl(0,65%,55%)" },
          { label: "Out-of-Pocket While Holding", value: mv($(h.totalOutOfPocket)),  color: "hsl(20,75%,55%)" },
          { label: "TRUE NET PROFIT",            value: mv($(res.trueNetProfit)),      color: isProfit ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)", big: true },
        ].map(k => (
          <div key={k.label} className="bg-card px-4 py-4">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{k.label}</div>
            <div className={`${(k as any).big ? "text-xl" : "text-base"} font-bold tabular-nums`}
              style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Formula row */}
      <div className="px-5 py-2.5 border-t border-border/30 text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap"
        style={{ background: isProfit ? "hsl(142,55%,4%)" : "hsl(0,55%,4%)" }}>
        <span style={{ color: "hsl(210,80%,65%)" }}>Cash to Bank</span>
        <ArrowRight className="w-3 h-3" />
        <span>− Deposit ({mv($(s.deposit))})</span>
        <ArrowRight className="w-3 h-3" />
        <span>− Buying Costs ({mv($(s.buyingCosts))})</span>
        <ArrowRight className="w-3 h-3" />
        <span>− Out-of-Pocket ({mv($(h.totalOutOfPocket))})</span>
        <ArrowRight className="w-3 h-3" />
        <span className="font-bold" style={{ color: isProfit ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" }}>
          = {mv($(res.trueNetProfit))} True Net Profit
        </span>
      </div>

      {/* True ROI metrics */}
      <div className="grid grid-cols-3 gap-px bg-border/20">
        {[
          { label: "True ROI",                value: `${res.trueROI >= 0 ? "+" : ""}${pct(res.trueROI)}` },
          { label: "True Annualised Return",  value: `${res.trueAnnualisedReturn >= 0 ? "+" : ""}${pct(res.trueAnnualisedReturn)}` },
          { label: "Months Held",             value: `${Math.floor(h.holdMonths)}mo` },
        ].map(m => (
          <div key={m.label} className="bg-card px-4 py-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">{m.label}</div>
            <div className="text-sm font-bold tabular-nums" style={{ color: "hsl(43,85%,55%)" }}>{m.value}</div>
          </div>
        ))}
      </div>
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

  const personal = useMemo(() => calcStructure(s, "personal"), [s]);
  const trust    = useMemo(() => calcStructure(s, "trust"),    [s]);
  const company  = useMemo(() => calcStructure(s, "company"),  [s]);
  const allResults = [personal, trust, company];
  const bestCash   = Math.max(personal.cashToBank, trust.cashToBank, company.cashToBank);
  const bestTrue   = Math.max(personal.trueNetProfit, trust.trueNetProfit, company.trueNetProfit);

  const holding     = res.holding;
  const { holdDays, holdMonths } = holding;
  const over12      = holdDays >= 365;
  const mthsToGo    = over12 ? 0 : Math.ceil((365 - holdDays) / 30);

  const sellNowResult   = calcStructure(s, s.structure, false);
  const sellWaitResult  = calcStructure(s, s.structure, true);
  const taxSavedWaiting = !over12 ? Math.max(0, sellNowResult.totalTax - sellWaitResult.totalTax) : 0;
  const holdingCostWait = (holding.loan.monthlyRepayment + holding.totalOtherHoldingCosts / Math.max(holdMonths, 0.001)) * mthsToGo;
  const netBenefitWait  = taxSavedWaiting - holdingCostWait;

  const costBase     = s.purchasePrice + s.buyingCosts;
  const grossGain    = s.salePrice - s.sellingCosts - costBase;
  const annualised   = holdDays > 0 ? sn(Math.pow(Math.max(0.01, 1 + res.roi), 365.25 / holdDays) - 1) : 0;
  const cashOnCash   = (s.purchasePrice - holding.loan.remainingBalance) > 0
    ? sn((res.cashToBank - (s.purchasePrice - holding.loan.remainingBalance)) / (s.purchasePrice - holding.loan.remainingBalance))
    : 0;

  const accentColor: Record<Structure, string> = {
    personal: "hsl(210,80%,55%)",
    trust:    "hsl(142,55%,48%)",
    company:  "hsl(262,65%,60%)",
  };
  const col = accentColor[s.structure];

  const chartData = allResults.map(r => ({
    name: r.label,
    tax:  Math.round(r.totalTax),
    cash: Math.round(r.cashToBank),
    true: Math.round(r.trueNetProfit),
    fill: accentColor[r.structure],
  }));

  return (
    <div className="space-y-4">

      {/* ── FINAL RESULT (TOP) ──────────────────────────────────────────────── */}
      <FinalResultCard s={s} res={res} mv={mv} />

      {/* ── SETTLEMENT CASH FLOW ────────────────────────────────────────────── */}
      <div className="rounded-2xl border-2 bg-card overflow-hidden" style={{ borderColor: col + "60" }}>
        <div className="px-5 py-3 flex items-center gap-2" style={{ background: col + "18" }}>
          <DollarSign className="w-4 h-4" style={{ color: col }} />
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: col }}>{res.label} — Settlement Cash Flow</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/30">
          {[
            { label: "Sale Price",      value: mv($(s.salePrice)),              color: "hsl(210,80%,65%)" },
            { label: "Tax Payable",     value: mv($(res.totalTax)),             color: "hsl(0,65%,55%)" },
            { label: "Loan Payout",     value: mv($(holding.loan.remainingBalance)), color: "hsl(20,75%,55%)" },
            { label: "CASH TO BANK",    value: mv($(res.cashToBank)),           color: "hsl(142,60%,52%)", big: true },
          ].map(k => (
            <div key={k.label} className="bg-card px-4 py-4">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{k.label}</div>
              <div className={`${(k as any).big ? "text-xl" : "text-base"} font-bold tabular-nums`} style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>
        <div className="px-5 py-2.5 border-t border-border/30 text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <span style={{ color: "hsl(210,80%,65%)" }}>Sale Price</span>
          <ArrowRight className="w-3 h-3" />
          <span>− Selling Costs ({mv($(s.sellingCosts))})</span>
          <ArrowRight className="w-3 h-3" />
          <span>− Loan Payout ({mv($(holding.loan.remainingBalance))})</span>
          <ArrowRight className="w-3 h-3" />
          <span>− Tax ({mv($(res.totalTax))})</span>
          <ArrowRight className="w-3 h-3" />
          <span className="font-bold" style={{ color: "hsl(142,60%,52%)" }}>= {mv($(res.cashToBank))}</span>
        </div>
      </div>

      {/* ── HOLDING PERIOD CASHFLOW ────────────────────────────────────────── */}
      <HoldingSummaryCard res={res} mv={mv} />

      {/* ── STRUCTURE COMPARISON TABLE ───────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Structure Comparison</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 620 }}>
            <thead>
              <tr className="border-b border-border/50 bg-secondary/20">
                {["Structure", "Tax Payable", "Loan Payout", "Cash To Bank", "Out-of-Pocket", "True Net Profit", "True ROI", "Best For"].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-muted-foreground font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allResults.map(r => {
                const isBestCash  = r.cashToBank === bestCash;
                const isBestTrue  = r.trueNetProfit === bestTrue;
                const bestFor: Record<Structure, string> = {
                  personal: "Fastest access",
                  trust:    "Family tax split",
                  company:  "Reinvesting capital",
                };
                return (
                  <tr key={r.structure}
                    className={`border-b border-border/30 transition-all ${s.structure === r.structure ? "bg-secondary/20" : ""}`}
                    style={isBestTrue ? { background: "hsl(142,55%,8%)" } : {}}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ background: accentColor[r.structure] }} />
                        <span className="font-semibold" style={{ color: accentColor[r.structure] }}>{r.label}</span>
                        {isBestTrue && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-1"
                            style={{ background: "hsl(142,55%,15%)", color: "hsl(142,65%,58%)" }}>Best</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono" style={{ color: "hsl(0,65%,55%)" }}>{mv($(r.totalTax))}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{mv($(r.loanPayout))}</td>
                    <td className="px-4 py-3 font-bold font-mono" style={{ color: isBestCash ? "hsl(142,60%,52%)" : "hsl(43,85%,55%)" }}>
                      {mv($(r.cashToBank))}
                    </td>
                    <td className="px-4 py-3 font-mono" style={{ color: "hsl(20,75%,55%)" }}>{mv($(r.holding.totalOutOfPocket))}</td>
                    <td className="px-4 py-3 font-bold font-mono"
                      style={{ color: r.trueNetProfit >= 0 ? (isBestTrue ? "hsl(142,60%,52%)" : "hsl(43,85%,55%)") : "hsl(0,65%,52%)" }}>
                      {mv($(r.trueNetProfit))}
                    </td>
                    <td className="px-4 py-3" style={{ color: r.trueROI >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" }}>
                      {r.trueROI >= 0 ? "+" : ""}{pct(r.trueROI)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{bestFor[r.structure]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* Bar chart — cash vs true net profit */}
        <div className="px-5 pb-4 pt-2 border-t border-border/30">
          <div style={{ height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(224,12%,20%)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(215,12%,50%)" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 9, fill: "hsl(215,12%,40%)" }} axisLine={false} tickLine={false} width={48} />
                <Tooltip
                  formatter={(v: number, name: string) => [mv($(v)), name === "tax" ? "Tax Payable" : name === "cash" ? "Cash to Bank" : "True Net Profit"]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 10, fontSize: 11 }}
                />
                <Bar dataKey="tax"  name="tax"  radius={[4, 4, 0, 0]} maxBarSize={28}>{chartData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.5} />)}</Bar>
                <Bar dataKey="cash" name="cash" radius={[4, 4, 0, 0]} maxBarSize={28}>{chartData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.8} />)}</Bar>
                <Bar dataKey="true" name="true" radius={[4, 4, 0, 0]} maxBarSize={28}>{chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 text-[10px] text-muted-foreground mt-1 ml-12 flex-wrap">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded opacity-50" style={{ background: accentColor[s.structure] }} /> Tax</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded opacity-80" style={{ background: accentColor[s.structure] }} /> Cash to Bank</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded" style={{ background: accentColor[s.structure] }} /> True Net Profit</div>
          </div>
        </div>
      </div>

      {/* ── INVESTOR METRICS ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Investor Metrics</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "Gross Capital Gain",    value: mv($(grossGain)),                                         color: grossGain >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" },
            { label: "Net Profit After Tax",  value: mv($(grossGain - res.totalTax)),                          color: "hsl(43,85%,55%)" },
            { label: "True Net Profit",       value: mv($(res.trueNetProfit)),                                  color: res.trueNetProfit >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" },
            { label: "True ROI",              value: `${res.trueROI >= 0 ? "+" : ""}${pct(res.trueROI)}`,      color: res.trueROI >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" },
            { label: "True Ann. Return",      value: `${res.trueAnnualisedReturn >= 0 ? "+" : ""}${pct(res.trueAnnualisedReturn)}`, color: res.trueAnnualisedReturn >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" },
            { label: "Cash-on-Cash Return",   value: `${cashOnCash >= 0 ? "+" : ""}${pct(cashOnCash)}`,        color: cashOnCash >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" },
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

      {/* ── PERSON-BY-PERSON TAX BREAKDOWN ───────────────────────────────── */}
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
                <div className="rounded-xl border border-emerald-500/30 p-4" style={{ background: "hsl(142,55%,6%)" }}>
                  <div className="text-[10px] text-muted-foreground uppercase">Wait {mthsToGo} Months</div>
                  <div className="text-base font-bold mt-1" style={{ color: "hsl(142,60%,52%)" }}>{mv($(sellWaitResult.totalTax))} tax</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{mv($(sellWaitResult.cashToBank))} to bank</div>
                </div>
                <div className={`rounded-xl border p-4 ${netBenefitWait > 0 ? "border-amber-500/30" : "border-border/40"}`}
                  style={netBenefitWait > 0 ? { background: "hsl(43,60%,8%)" } : {}}>
                  <div className="text-[10px] text-muted-foreground uppercase">Net Benefit Waiting</div>
                  <div className="text-base font-bold mt-1"
                    style={{ color: netBenefitWait > 0 ? "hsl(43,90%,60%)" : "hsl(215,12%,50%)" }}>
                    {netBenefitWait > 0 ? "+" : ""}{mv($(netBenefitWait))}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {mv($(taxSavedWaiting))} saved − {mv($(holdingCostWait))} costs
                  </div>
                </div>
              </div>
              <div className="rounded-xl px-4 py-3 flex items-start gap-2"
                style={{
                  background: netBenefitWait > 0 ? "hsl(43,60%,8%)" : "hsl(222,20%,9%)",
                  border: `1px solid ${netBenefitWait > 0 ? "hsl(43,55%,22%)" : "hsl(222,15%,20%)"}`,
                }}>
                <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5"
                  style={{ color: netBenefitWait > 0 ? "hsl(43,90%,60%)" : "hsl(215,12%,55%)" }} />
                <div>
                  <p className="text-xs font-bold"
                    style={{ color: netBenefitWait > 0 ? "hsl(43,90%,60%)" : "hsl(215,12%,65%)" }}>
                    {netBenefitWait > 5000
                      ? `Recommendation: WAIT ${mthsToGo} months`
                      : netBenefitWait > 0
                      ? "Marginal benefit — consider market timing"
                      : "Holding costs exceed tax saving — SELL NOW if market is right"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Waiting {mthsToGo} months saves {mv($(taxSavedWaiting))} in tax.
                    {" "}Holding cost for {mthsToGo} months ≈ {mv($(holdingCostWait))}.
                    {" "}Net benefit = {mv($(netBenefitWait))}.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FULL WATERFALL ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <button onClick={() => setShowBreakdown(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/20 transition-all">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Full Calculation Breakdown</span>
          </div>
          {showBreakdown ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {showBreakdown && (
          <div className="px-5 pb-5 border-t border-border/40 pt-4 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">At Settlement</p>
            <WRow label="Sale Price"                value={mv($(s.salePrice))}                              color="hsl(210,80%,65%)" />
            <WRow label="− Selling Costs"           value={mv(`−${$(s.sellingCosts, true)}`)}               color="hsl(0,65%,52%)" />
            <WRow label="= Net Proceeds"            value={mv($(s.salePrice - s.sellingCosts))}             color="hsl(215,12%,75%)" />
            <WRow label="− Cost Base"               value={mv(`−${$(s.purchasePrice + s.buyingCosts, true)}`)} color="hsl(0,65%,52%)"
              sub={`Purchase ${$(s.purchasePrice)} + Buying costs ${$(s.buyingCosts)}`} />
            <WRow label="= Gross Capital Gain"      value={mv($(grossGain))}                               color="hsl(43,90%,60%)" />
            {res.discountApplied && (
              <WRow label="× 50% CGT Discount" value={mv($(grossGain * 0.5))} color="hsl(142,60%,52%)"
                sub="ATO s.115-A: 50% discount for individuals/trusts > 12 months" />
            )}
            {s.structure === "company" && (
              <WRow label={`× Company Tax Rate ${s.companyTaxRate}%`} value={mv(`−${$(res.totalTax, true)}`)} color="hsl(0,65%,52%)" />
            )}
            {s.structure !== "company" && res.persons.map((p, i) => (
              <WRow key={i} label={`${p.name}'s Tax (${Math.round(p.marginalRate * 100)}% marginal)`}
                value={mv(`−${$(p.tax, true)}`)} color="hsl(0,65%,52%)" />
            ))}
            <div className="border-t border-border/50 mt-1 pt-1" />
            <WRow label="− Loan Payout at Settlement" value={mv(`−${$(holding.loan.remainingBalance, true)}`)} color="hsl(20,75%,55%)" big />
            <WRow label="= CASH TO BANK"               value={mv($(res.cashToBank))}               color="hsl(142,60%,52%)" big />
            <div className="border-t border-border/50 mt-3 pt-3" />
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">True Net Profit Calculation</p>
            <WRow label="Cash to Bank (above)"        value={mv($(res.cashToBank))}               color="hsl(142,60%,52%)" />
            <WRow label="− Initial Deposit"           value={mv(`−${$(s.deposit, true)}`)}        color="hsl(0,65%,52%)" />
            <WRow label="− Buying Costs"              value={mv(`−${$(s.buyingCosts, true)}`)}    color="hsl(0,65%,52%)" />
            <WRow label="− Out-of-Pocket During Hold" value={mv(`−${$(Math.max(0, holding.totalOutOfPocket), true)}`)} color="hsl(0,65%,52%)"
              sub={`Repayments + Costs − Rental − NG Benefit`} />
            <WRow label="= TRUE NET PROFIT"            value={mv($(res.trueNetProfit))}
              color={res.trueNetProfit >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)"} big />
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
          Push all cashflow events — deposit, loan repayments, rental income, holding costs, NG refunds, sale proceeds, tax — into your central ledger.
          Cashflow, Net Worth, FIRE Timeline and Reports all update automatically.
        </p>
        <div className="rounded-xl border border-border/40 overflow-hidden text-xs bg-card/50">
          {[
            { label: `${s.purchaseDate.slice(0, 7)} Initial Deposit + Buying Costs`, value: `−${mv($(s.deposit + s.buyingCosts, true))}`, color: "hsl(0,65%,52%)" },
            { label: `Each month (${Math.floor(holding.holdMonths)}mo) Loan Repayment`, value: `−${mv($(holding.loan.monthlyRepayment, true))}/mo`, color: "hsl(20,75%,55%)" },
            { label: `Each month Rental Income (net)`, value: `+${mv($(holding.netRentalIncome / Math.max(holding.holdMonths, 1), true))}/mo`, color: "hsl(142,60%,52%)" },
            { label: `Annual NG Tax Refund`, value: holding.ngBenefitPerYear > 0 ? `+${mv($(holding.ngBenefitPerYear, true))}/yr` : "N/A (positively geared)", color: "hsl(142,60%,52%)" },
            { label: `${s.saleDate.slice(0, 7)} Sale Proceeds`, value: `+${mv($(s.salePrice - s.sellingCosts, true))}`, color: "hsl(142,60%,52%)" },
            { label: `${s.saleDate.slice(0, 7)} Loan Payout`, value: `−${mv($(holding.loan.remainingBalance, true))}`, color: "hsl(0,65%,52%)" },
            { label: `${s.saleDate.slice(0, 7)} Tax Payment (${res.label})`, value: `−${mv($(res.totalTax, true))}`, color: "hsl(0,65%,52%)" },
            { label: `${s.saleDate.slice(0, 7)} Net Cash to Bank`, value: `+${mv($(res.cashToBank, true))}`, color: "hsl(43,90%,60%)" },
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
            <><Zap className="w-3 h-3 mr-1.5" />Push All Events to Forecast Ledger</>
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
    const id     = `s-${Date.now()}`;
    const base   = scenarios[scenarios.length - 1];
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
      const h = result.holding;
      const event = {
        type:              "property_exit_full",
        id:                `${active.propertyName}-${active.saleDate}`,
        propertyName:      active.propertyName,
        purchaseDate:      active.purchaseDate,
        saleDate:          active.saleDate,
        salePrice:         active.salePrice,
        sellingCosts:      active.sellingCosts,
        buyingCosts:       active.buyingCosts,
        deposit:           active.deposit,
        loanType:          active.loan.loanType,
        loanAmount:        active.loan.loanAmount,
        interestRate:      active.loan.interestRate,
        monthlyRepayment:  h.loan.monthlyRepayment,
        totalRepayments:   h.loan.totalRepayments,
        totalInterestPaid: h.loan.totalInterestPaid,
        loanPayout:        h.loan.remainingBalance,
        netRentalIncome:   h.netRentalIncome,
        totalOtherCosts:   h.totalOtherHoldingCosts,
        ngBenefit:         h.totalNgBenefit,
        totalOutOfPocket:  h.totalOutOfPocket,
        taxPayable:        result.totalTax,
        structure:         active.structure,
        cashToBank:        result.cashToBank,
        trueNetProfit:     result.trueNetProfit,
        trueROI:           result.trueROI,
        scenario:          active.name,
        pushedAt:          new Date().toISOString(),
      };
      const { data: existing } = await supabase
        .from("financial_plans")
        .select("data")
        .eq("id", "shahrokh-family-main")
        .single();
      if (existing?.data) {
        const planData  = typeof existing.data === "string" ? JSON.parse(existing.data) : existing.data;
        const cgtEvents = planData.cgtEvents ?? [];
        const idx       = cgtEvents.findIndex((e: any) => e.id === event.id);
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
        description: `${active.propertyName} — True Net Profit: ${$(result.trueNetProfit)} | Cash to Bank: ${$(result.cashToBank)}`,
      });
    } catch {
      toast({ title: "Saved Locally", description: "Could not reach Supabase.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const allSummary = useMemo(() =>
    scenarios.map(s => ({
      s,
      res:      calcStructure(s, s.structure),
      holdDays: Math.max(0, Math.round((new Date(s.saleDate).getTime() - new Date(s.purchaseDate).getTime()) / 86400000)),
    })),
  [scenarios]);

  const bestTrueScenario = allSummary.reduce((a, b) => b.res.trueNetProfit > a.res.trueNetProfit ? b : a, allSummary[0]);

  return (
    <div className="min-h-screen pb-20 bg-background">

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-3 border-b border-border/50 bg-background/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "hsl(262,60%,18%)" }}>
              <BarChart3 className="w-4 h-4" style={{ color: "hsl(262,70%,65%)" }} />
            </div>
            <div>
              <h1 className="text-base font-bold">Property Exit Decision Engine</h1>
              <p className="text-[11px] text-muted-foreground">Personal · Trust · Company · Loan · Holding Costs · True Net Profit</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {scenarios.map(sc => (
              <div key={sc.id} className="flex items-center gap-0.5">
                <button onClick={() => setActiveId(sc.id)} data-testid={`scenario-tab-${sc.id}`}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeId === sc.id
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : "text-muted-foreground border border-border/50 hover:text-foreground"
                  }`}>
                  {sc.name.split("—")[0].trim()}
                  {sc.useInForecast && <span className="ml-1 text-[8px]" style={{ color: "hsl(142,65%,55%)" }}>✓</span>}
                </button>
                {scenarios.length > 1 && (
                  <button onClick={() => removeScenario(sc.id)}
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
            <strong>Indicative estimate only. Not tax advice.</strong> Uses ATO 2025-26 rates. Holding costs and loan estimates are projections only. Negative gearing benefit uses Owner 1's marginal rate — actual benefit depends on individual tax position. Does not account for depreciation schedules, HELP debt, complex trust distributions, or CGT rollovers. Verify all figures with a qualified accountant and mortgage broker before making property decisions.
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
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-5">
              <Building2 className="w-4 h-4" style={{ color: "hsl(262,70%,65%)" }} />
              <h2 className="text-sm font-bold">Property, Loan & Holding Costs</h2>
            </div>
            <InputPanel s={active} upd={upd} />
          </div>
          <ResultsPanel s={active} res={result} mv={mv} onForecast={handleForecast} saving={saving} />
        </div>

        {/* All-scenarios cross comparison */}
        {scenarios.length > 1 && (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 pt-4 pb-3 flex items-center gap-2 border-b border-border/40">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">All Scenarios — Cross Comparison</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ minWidth: 780 }}>
                <thead>
                  <tr className="border-b border-border/50 bg-secondary/20">
                    {["Scenario", "Structure", "Holding", "Gross Gain", "Tax", "Cash to Bank", "Out-of-Pocket", "True Net Profit", "True ROI", "Ann. Return"].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-muted-foreground font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allSummary.map(({ s: sc, res: r, holdDays }) => {
                    const isBest = sc.id === bestTrueScenario?.s.id;
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
                          <span className="text-[10px] font-semibold capitalize"
                            style={{ color: { personal: "hsl(210,80%,55%)", trust: "hsl(142,55%,48%)", company: "hsl(262,65%,60%)" }[sc.structure] }}>
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
                        <td className="px-4 py-3 font-bold font-mono" style={{ color: "hsl(43,85%,55%)" }}>{mv($(r.cashToBank))}</td>
                        <td className="px-4 py-3 font-mono" style={{ color: "hsl(20,75%,55%)" }}>{mv($(r.holding.totalOutOfPocket))}</td>
                        <td className="px-4 py-3 font-bold font-mono"
                          style={{ color: isBest ? "hsl(142,60%,52%)" : (r.trueNetProfit >= 0 ? "hsl(43,85%,55%)" : "hsl(0,65%,52%)") }}>
                          {mv($(r.trueNetProfit))}
                        </td>
                        <td className="px-4 py-3" style={{ color: r.trueROI >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" }}>
                          {r.trueROI >= 0 ? "+" : ""}{pct(r.trueROI)}
                        </td>
                        <td className="px-4 py-3" style={{ color: r.trueAnnualisedReturn >= 0 ? "hsl(142,60%,52%)" : "hsl(0,65%,52%)" }}>
                          {r.trueAnnualisedReturn >= 0 ? "+" : ""}{pct(r.trueAnnualisedReturn)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {bestTrueScenario && (
              <div className="px-5 pb-4 pt-3 border-t border-border/30">
                <div className="rounded-xl px-4 py-2.5 flex items-center gap-2"
                  style={{ background: "hsl(142,55%,8%)", border: "1px solid hsl(142,45%,20%)" }}>
                  <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: "hsl(142,65%,55%)" }} />
                  <span className="text-xs" style={{ color: "hsl(142,65%,55%)" }}>
                    Best true net profit: <strong>{bestTrueScenario.s.name}</strong> ({bestTrueScenario.s.structure}) — {mv($(bestTrueScenario.res.trueNetProfit))} after all costs
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ATO reference */}
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
                  ["$0 – $18,200",        "0%",  "Tax-free threshold"],
                  ["$18,201 – $45,000",   "16%", "Stage 3"],
                  ["$45,001 – $135,000",  "30%", "Middle bracket"],
                  ["$135,001 – $190,000", "37%", "Upper"],
                  ["$190,001+",           "45%", "Top marginal"],
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
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">CGT Rules</p>
                <div className="space-y-1 text-[11px]">
                  {[
                    [CheckCircle, "hsl(142,65%,55%)", "Personal / Trust: 50% CGT discount if held >12 months"],
                    [CheckCircle, "hsl(142,65%,55%)", "Trust passes 50% discount through to individual beneficiaries"],
                    [AlertTriangle, "hsl(43,90%,60%)", "Company: No CGT discount — 25% or 30% flat on full gain"],
                    [Info, "hsl(210,80%,65%)", "Medicare Levy: 2% on taxable income (toggle on/off)"],
                  ].map(([Icon, color, text], i) => (
                    <div key={i} className="flex items-start gap-2">
                      {/* @ts-ignore */}
                      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color }} />
                      <span className="text-muted-foreground">{text as string}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

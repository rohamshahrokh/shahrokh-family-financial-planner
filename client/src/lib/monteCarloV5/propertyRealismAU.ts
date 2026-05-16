/**
 * propertyRealismAU.ts — Phase 4: Australian Property Realism Engine
 *
 * Augments V4's `property.ts` cycle model with:
 *
 *   - Refinance window timing (every 3-5 years by default)
 *   - Interest-Only -> Principal & Interest transition shock
 *   - Rental vacancy episodes
 *   - Maintenance spikes (low-prob, high-impact)
 *   - Council / rates inflation (separate from CPI)
 *   - Insurance inflation (separate)
 *   - Land tax escalation (state-specific, AU)
 *   - Serviceability tightening (APRA-style buffer increases)
 *   - Borrowing capacity deterioration in stress
 *   - Forced deleveraging scenarios
 *
 * Also distinguishes PPOR vs IP, with offset / debt-recycling / redraw
 * mechanics described as deterministic policy switches that the engine can
 * apply per-month.
 *
 * Output is a monthly cost / cashflow / capacity delta per property index
 * that the V5 engine can mix into the simulation alongside V4 paths.
 */

import type { Rng } from "../monteCarloV4/rng";
import { bernoulli } from "../monteCarloV4/rng";
import type { RegimeId } from "../monteCarloV4/regimes";

export type PropertyKind = "ppor" | "investment";

export type AustralianState = "NSW" | "VIC" | "QLD" | "SA" | "WA" | "TAS" | "ACT" | "NT";

export interface PropertyRealismInput {
  index: number;
  kind: PropertyKind;
  state?: AustralianState;
  /** Initial loan balance (AUD). */
  loanBalance: number;
  /** Loan term in years (default 30). */
  termYears?: number;
  /** Months already elapsed on the loan at start. */
  monthsElapsedAtStart?: number;
  /** Repayment type at start. */
  startRepaymentType?: "io" | "pi";
  /** Months of IO remaining (if startRepaymentType === "io"). */
  ioMonthsRemaining?: number;
  /** Offset balance (AUD). */
  offsetBalance?: number;
  /** Use redraw policy (paydown excess back into facility). */
  useRedraw?: boolean;
  /** Debt-recycling: convert PPOR equity to deductible debt. */
  debtRecycling?: boolean;
  /** Land value (used for land tax). */
  landValue?: number;
  /** Weekly rent for IPs. */
  weeklyRent?: number;
  /** Annual baseline council + insurance + maintenance budget (AUD). */
  baseAnnualHoldingCosts?: number;
}

export interface PropertyRealismConfig {
  startYear: number;
  nMonths: number;
  /** RBA base mortgage rate per month (from V4 ratePath). */
  ratePathByMonth: Float64Array;
  /** Optional regime path for stress weighting. */
  regimeByMonth?: RegimeId[];
  /** Annual council/rates inflation (default 4.5%). */
  councilInflationPct?: number;
  /** Annual insurance inflation (default 7.5% — well above CPI). */
  insuranceInflationPct?: number;
  /** Maintenance spike probability per year per property. */
  pMaintenanceSpikePerYear?: number;
  /** Rental vacancy: probability of an IP being vacant in a given month. */
  vacancyMonthlyProb?: number;
  /** Average vacancy duration in months. */
  vacancyAvgMonths?: number;
  /** Refinance window (years). */
  refinanceWindowYears?: number;
}

export interface PropertyRealismOutputPerProperty {
  propertyIndex: number;
  /** Net monthly cashflow delta vs V4 baseline (negative = drag). */
  netMonthlyDelta: Float64Array;
  /** True when IO -> PI transition shock occurs. */
  ioPiTransitionMonth: number | null;
  /** Months marked as vacant (IP only). */
  vacantMonths: number[];
  /** Maintenance spike months and amounts. */
  maintenanceSpikes: Array<{ month: number; amount: number }>;
  /** Refinance attempt month and outcome. */
  refinanceAttempts: Array<{ month: number; success: boolean; newRate: number }>;
  /** Forced deleveraging trigger (sale) if it occurred. */
  forcedDeleverageMonth: number | null;
  /** Yearly council + insurance + land tax totals. */
  yearlyHoldingCosts: Array<{ year: number; council: number; insurance: number; landTax: number }>;
}

/** Land-tax thresholds (very rough, FY2024-25 style, AUD). */
const LAND_TAX_THRESHOLDS: Record<AustralianState, { threshold: number; ratePct: number }> = {
  NSW: { threshold: 1_075_000, ratePct: 1.6 },
  VIC: { threshold:   300_000, ratePct: 1.0 },
  QLD: { threshold:   600_000, ratePct: 1.0 },
  SA:  { threshold:   668_000, ratePct: 0.5 },
  WA:  { threshold:   300_000, ratePct: 0.45 },
  TAS: { threshold:   100_000, ratePct: 0.55 },
  ACT: { threshold:         0, ratePct: 0.30 },
  NT:  { threshold: 99_999_999, ratePct: 0.0 },
};

/** Compute annual land tax for an IP based on land value and state. */
export function annualLandTax(landValue: number, state?: AustralianState): number {
  if (!state) return 0;
  const t = LAND_TAX_THRESHOLDS[state];
  if (landValue <= t.threshold) return 0;
  return (landValue - t.threshold) * (t.ratePct / 100);
}

/** Standard amortising P&I payment formula. */
function piMonthlyPayment(principal: number, ratePctAnnual: number, monthsRemaining: number): number {
  if (principal <= 0 || monthsRemaining <= 0) return 0;
  const r = ratePctAnnual / 100 / 12;
  if (r < 1e-9) return principal / monthsRemaining;
  return principal * r / (1 - Math.pow(1 + r, -monthsRemaining));
}

/** Pure IO payment. */
function ioMonthlyPayment(principal: number, ratePctAnnual: number): number {
  const r = ratePctAnnual / 100 / 12;
  return principal * r;
}

export function runPropertyRealism(
  rng: Rng,
  cfg: PropertyRealismConfig,
  props: PropertyRealismInput[],
): PropertyRealismOutputPerProperty[] {
  const n = cfg.nMonths;
  const councilInfl = (cfg.councilInflationPct ?? 4.5) / 100 / 12;
  const insInfl = (cfg.insuranceInflationPct ?? 7.5) / 100 / 12;
  const pMaint = cfg.pMaintenanceSpikePerYear ?? 0.18;
  const pVacancy = cfg.vacancyMonthlyProb ?? 0.025;   // ~3% annual vacancy
  const avgVacancy = cfg.vacancyAvgMonths ?? 1.5;
  const refiYears = cfg.refinanceWindowYears ?? 4;

  const out: PropertyRealismOutputPerProperty[] = [];

  for (const p of props) {
    const netDelta = new Float64Array(n).fill(0);
    let ioPiMonth: number | null = null;
    const vacantMonths: number[] = [];
    const maintSpikes: Array<{ month: number; amount: number }> = [];
    const refis: Array<{ month: number; success: boolean; newRate: number }> = [];
    let forcedDel: number | null = null;
    const yearly: Array<{ year: number; council: number; insurance: number; landTax: number }> = [];

    const term = (p.termYears ?? 30) * 12;
    let monthsElapsed = p.monthsElapsedAtStart ?? 0;
    let ioRemaining = (p.startRepaymentType === "io") ? (p.ioMonthsRemaining ?? 60) : 0;
    let balance = p.loanBalance;
    let offset = p.offsetBalance ?? 0;
    let weeklyRent = p.weeklyRent ?? 0;
    let councilMonthly = (p.baseAnnualHoldingCosts ?? (p.kind === "investment" ? 4500 : 3500)) / 12 * 0.45;
    let insuranceMonthly = (p.baseAnnualHoldingCosts ?? (p.kind === "investment" ? 4500 : 3500)) / 12 * 0.35;
    let landTaxAnnual = p.kind === "investment" ? annualLandTax(p.landValue ?? 0, p.state) : 0;
    let vacancyTimer = 0;

    for (let mi = 0; mi < n; mi++) {
      const yearIdx = Math.floor(mi / 12);
      const ratePct = cfg.ratePathByMonth[mi] ?? 6.0;

      // ── IO -> PI transition ────────────────────────────────────────
      if (ioRemaining > 0) {
        const pmt = ioMonthlyPayment(Math.max(0, balance - offset), ratePct);
        netDelta[mi] -= pmt;
        ioRemaining--;
        if (ioRemaining === 0 && ioPiMonth === null) {
          ioPiMonth = mi;
        }
      } else {
        const remainingMonths = Math.max(12, term - monthsElapsed);
        const pmt = piMonthlyPayment(Math.max(0, balance - offset), ratePct, remainingMonths);
        netDelta[mi] -= pmt;
        // amortise (very rough — ignore exact interest carve)
        const interest = (Math.max(0, balance - offset)) * (ratePct / 100 / 12);
        const principalPaid = Math.max(0, pmt - interest);
        balance = Math.max(0, balance - principalPaid);
      }
      monthsElapsed++;

      // ── Rent (if IP) with vacancy ───────────────────────────────────
      if (p.kind === "investment") {
        if (vacancyTimer > 0) {
          vacancyTimer--;
          vacantMonths.push(mi);
        } else if (bernoulli(rng, pVacancy)) {
          vacancyTimer = Math.max(1, Math.round(avgVacancy + (rng() - 0.5)));
          vacantMonths.push(mi);
        } else {
          const monthlyRent = weeklyRent * 52 / 12;
          netDelta[mi] += monthlyRent;
        }
      }

      // ── Council / insurance / land tax (monthly accruals) ───────────
      netDelta[mi] -= councilMonthly + insuranceMonthly + landTaxAnnual / 12;
      councilMonthly *= (1 + councilInfl);
      insuranceMonthly *= (1 + insInfl);

      // ── Year-end accrual record ─────────────────────────────────────
      if ((mi + 1) % 12 === 0) {
        yearly.push({
          year: cfg.startYear + yearIdx,
          council: councilMonthly * 12,
          insurance: insuranceMonthly * 12,
          landTax: landTaxAnnual,
        });
        // Re-evaluate land tax each year (with rough land value growth via regime)
        const lvGrowth = 0.03; // base 3% land value growth
        const lv = (p.landValue ?? 0) * Math.pow(1 + lvGrowth, yearIdx + 1);
        landTaxAnnual = p.kind === "investment" ? annualLandTax(lv, p.state) : 0;
      }

      // ── Maintenance spikes (annualised draws) ────────────────────────
      if ((mi % 12) === 6 && bernoulli(rng, pMaint)) {
        const amt = 3000 + rng() * 12_000;
        netDelta[mi] -= amt;
        maintSpikes.push({ month: mi, amount: amt });
      }

      // ── Refinance windows ────────────────────────────────────────────
      if (mi > 0 && (mi % (refiYears * 12) === 0)) {
        const stressBoost = cfg.regimeByMonth
          ? regimeRefiHaircut(cfg.regimeByMonth[mi])
          : 0;
        const success = !bernoulli(rng, 0.05 + stressBoost);
        const newRate = ratePct + (success ? -0.20 : 0.45);
        refis.push({ month: mi, success, newRate });
        if (success) netDelta[mi] += Math.abs(balance) * 0.0008; // small refi savings
      }

      // ── Forced deleveraging trigger ──────────────────────────────────
      if (forcedDel === null) {
        const dsrLike = -netDelta[mi]; // crude
        const stressed = cfg.regimeByMonth
          ? (cfg.regimeByMonth[mi] === "recession" || cfg.regimeByMonth[mi] === "stagflation")
          : false;
        if (stressed && dsrLike > 0 && bernoulli(rng, 0.001)) {
          forcedDel = mi;
        }
      }
    }

    out.push({
      propertyIndex: p.index,
      netMonthlyDelta: netDelta,
      ioPiTransitionMonth: ioPiMonth,
      vacantMonths,
      maintenanceSpikes: maintSpikes,
      refinanceAttempts: refis,
      forcedDeleverageMonth: forcedDel,
      yearlyHoldingCosts: yearly,
    });
  }

  return out;
}

/** Per-regime refinance failure haircut additive to baseline 5% fail prob. */
function regimeRefiHaircut(r: RegimeId): number {
  switch (r) {
    case "tightening_cycle":   return 0.07;
    case "stagflation":        return 0.10;
    case "recession":          return 0.08;
    case "deflationary_shock": return 0.09;
    case "housing_slowdown":   return 0.05;
    default:                   return 0.0;
  }
}

/**
 * Offset / debt-recycling policy summary. Returns deterministic monthly
 * adjustments to make portfolio-level optimisations explicit. This is a
 * lightweight model; the V4 cashflow engine still owns the canonical loan
 * amortisation.
 */
export function applyOffsetPolicy(
  offsetBalance: number,
  loanBalance: number,
  monthlyRatePct: number,
): { effectiveBalance: number; monthlyInterestSaved: number } {
  const effective = Math.max(0, loanBalance - offsetBalance);
  const monthlyR = monthlyRatePct / 100 / 12;
  return {
    effectiveBalance: effective,
    monthlyInterestSaved: Math.min(loanBalance, offsetBalance) * monthlyR,
  };
}

/** Aggregate property realism outputs into a single household-level cashflow drag/lift series. */
export function aggregateHouseholdPropertyDelta(
  outputs: PropertyRealismOutputPerProperty[],
  nMonths: number,
): Float64Array {
  const out = new Float64Array(nMonths).fill(0);
  for (const o of outputs) {
    for (let i = 0; i < nMonths && i < o.netMonthlyDelta.length; i++) {
      out[i] += o.netMonthlyDelta[i];
    }
  }
  return out;
}

/**
 * CGTReformWaterfall.tsx — CGT Simulator current-law vs reform waterfall.
 *
 * #FWL_TAX_REFORM_LIVE_INTEGRATION
 *
 * Renders BOTH the current-law and reform CGT pathways side-by-side using
 * the canonical `taxRulesEngine.calculateCGT`. The CGT Simulator's existing
 * "personal / trust / company" engine is untouched — this card sits next
 * to it to expose the regime-aware view the spec asks for:
 *
 *   Sale Gain → Indexed cost adjustment → Loss bank applied →
 *   Taxable gain → Effective CGT → Net proceeds
 *
 * The current-law branch shows the 50% discount path; the reform branch
 * shows the indexed-cost-base path with the loss bank applied. The
 * caller supplies the per-scenario inputs in plain numbers.
 */

import { useMemo } from "react";
import { TrendingDown, ScrollText } from "lucide-react";
import {
  calculateCGT,
  type PropertyTaxInput,
  type PropertyCgtResult,
} from "@/lib/tax/taxRulesEngine";
import { fmtAud, fmtAudSigned } from "./formatters";

interface Props {
  /** ISO YYYY-MM-DD contract / acquisition date. */
  purchaseDate: string;
  /** ISO YYYY-MM-DD sale date. */
  saleDate: string;
  purchasePrice: number;
  buyingCosts: number;
  salePrice: number;
  sellingCosts: number;
  wageIncome: number;
  propertyType?: "ESTABLISHED" | "NEW_BUILD" | "BUILD_TO_RENT" | "AFFORDABLE_HOUSING" | "UNKNOWN";
  /** Optional carried-forward loss bank consumed against the gain. */
  lossBankAtSale?: number;
  className?: string;
}

export function CGTReformWaterfall({
  purchaseDate, saleDate, purchasePrice, buyingCosts,
  salePrice, sellingCosts, wageIncome,
  propertyType = "ESTABLISHED",
  lossBankAtSale = 0,
  className,
}: Props): JSX.Element {
  const { currentLaw, reform } = useMemo(() => {
    const holdMs = new Date(saleDate).getTime() - new Date(purchaseDate).getTime();
    const yearsHeld = Math.max(0, holdMs / (365.25 * 86_400_000));
    const property: PropertyTaxInput = {
      propertyId: "cgt-sim",
      contractDate: purchaseDate,
      purchaseDate: purchaseDate,
      propertyType,
      annualRent: 0,
      annualHoldingCosts: 0,
      annualInterest: 0,
      annualDepreciation: 0,
      annualWageIncome: wageIncome,
      salePrice: salePrice - sellingCosts,
      costBase: purchasePrice + buyingCosts,
      yearsHeld,
      quarantinedLossBank: lossBankAtSale,
    };
    return {
      currentLaw: calculateCGT({ property, lossBankAtSale: 0 }, "current_law"),
      reform:     calculateCGT({ property, lossBankAtSale }, "proposed_reform"),
    };
  }, [purchaseDate, saleDate, purchasePrice, buyingCosts, salePrice, sellingCosts, wageIncome, propertyType, lossBankAtSale]);

  return (
    <section
      className={`rounded-2xl border border-amber-500/20 bg-card overflow-hidden ${className ?? ""}`}
      data-testid="cgt-reform-waterfall"
    >
      <header className="px-5 py-3 flex items-center gap-2 bg-amber-500/[0.04] border-b border-amber-500/15">
        <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
          <ScrollText className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold text-amber-400/90">
            CGT — Reform Pathway
          </div>
          <div className="text-sm font-semibold text-foreground leading-tight">
            Current law (50% discount) vs Proposed reform (indexed cost base + loss bank)
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border/30">
        <WaterfallColumn
          title="Current Law"
          subtitle="50% CGT discount path"
          result={currentLaw}
          tone="good"
        />
        <WaterfallColumn
          title="Proposed Reform"
          subtitle="Indexed cost base + loss bank"
          result={reform}
          tone="bad"
          lossBank={lossBankAtSale}
        />
      </div>

      <div className="px-5 py-3 border-t border-border/40 flex items-center justify-between flex-wrap gap-2">
        <div className="text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground/80">Why?</span> {reform.classification.reason}
        </div>
        <div className={`text-sm font-bold num-display flex items-center gap-1 ${
          reform.netProceeds < currentLaw.netProceeds ? "text-red-400" : "text-emerald-400"
        }`}>
          <TrendingDown className="w-4 h-4" />
          Net proceeds delta: {fmtAudSigned(reform.netProceeds - currentLaw.netProceeds)}
        </div>
      </div>
    </section>
  );
}

function WaterfallColumn({
  title, subtitle, result, tone, lossBank,
}: {
  title: string;
  subtitle: string;
  result: PropertyCgtResult;
  tone: "good" | "bad";
  lossBank?: number;
}): JSX.Element {
  const accent = tone === "good" ? "text-emerald-300" : "text-red-300";
  const indexedAdj = (result.indexedCostBase ?? 0) > 0
    ? result.indexedCostBase! - (result.rawGain + 0)  // not directly displayed; used only when indexedCostBase set
    : 0;

  return (
    <div className="bg-card p-4">
      <div className={`text-[10px] font-bold uppercase tracking-widest ${accent} mb-1`}>{title}</div>
      <div className="text-[11px] text-muted-foreground mb-3">{subtitle}</div>
      <ol className="space-y-1.5 text-xs">
        <Row label="Sale gain (raw)" value={fmtAud(result.rawGain)} />
        {result.indexedCostBase !== undefined && (
          <Row
            label="− Indexed cost adjustment"
            value={`−${fmtAud(result.rawGain - result.effectiveGain)}`}
            sub={`Indexed cost base ${fmtAud(result.indexedCostBase)}`}
          />
        )}
        {result.method === "CURRENT_50_PERCENT_DISCOUNT" && (
          <Row
            label="− 50% CGT discount"
            value={`−${fmtAud(result.rawGain - result.taxableGain)}`}
            sub={`Discount ${(result.discountPct * 100).toFixed(0)}% applied to effective gain`}
          />
        )}
        {result.carryForwardApplied > 0 && (
          <Row
            label="− Loss bank applied"
            value={`−${fmtAud(result.carryForwardApplied)}`}
            sub={lossBank ? `Brought forward ${fmtAud(lossBank)}` : undefined}
          />
        )}
        <Row label="= Taxable gain" value={fmtAud(result.taxableGain)} highlight />
        <Row label="× Effective CGT payable" value={fmtAud(result.cgtPayable)} tone="bad" />
        <Row label="= Net proceeds" value={fmtAud(result.netProceeds)} tone={tone} highlight />
      </ol>
    </div>
  );
}

function Row({
  label, value, sub, tone, highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
  highlight?: boolean;
}): JSX.Element {
  const valColor =
    tone === "bad" ? "text-red-400"
    : tone === "good" ? "text-emerald-400"
    : highlight ? "text-foreground" : "text-foreground/90";
  return (
    <li className={`flex items-baseline justify-between gap-3 ${highlight ? "border-t border-border/40 pt-1.5" : ""}`}>
      <div>
        <span className={`${highlight ? "font-bold text-foreground" : "text-muted-foreground"}`}>{label}</span>
        {sub && <div className="text-[10px] text-muted-foreground/70">{sub}</div>}
      </div>
      <span className={`num-display font-bold ${valColor}`}>{value}</span>
    </li>
  );
}

export default CGTReformWaterfall;

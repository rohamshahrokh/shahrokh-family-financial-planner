/**
 * TaxStrategyAuditTable.tsx — Master audit table for /tax-alpha.
 *
 * #FWL_TAX_REFORM_LIVE_INTEGRATION
 *
 * Rows: every investment property in the portfolio.
 * Columns: Property | Purchase | Type | Current Law | Reform | Loss Bank | Annual Impact
 *
 * All values live from `taxRulesEngine` via `computePortfolioTaxImpact`.
 * No local tax math — this component is purely presentational.
 */

import { useMemo } from "react";
import {
  computePortfolioTaxImpact,
  type PortfolioPropertyRow,
} from "@/lib/tax/propertyPortfolioTaxImpact";
import { fmtAud, fmtAudSigned } from "./formatters";

interface Props {
  properties: PortfolioPropertyRow[];
  wageIncome: number;
  className?: string;
}

export function TaxStrategyAuditTable({
  properties, wageIncome, className,
}: Props): JSX.Element | null {
  const impact = useMemo(
    () => computePortfolioTaxImpact(properties ?? [], wageIncome),
    [properties, wageIncome],
  );
  if (impact.rows.length === 0) return null;

  return (
    <section
      className={`rounded-2xl border border-border bg-card overflow-hidden ${className ?? ""}`}
      data-testid="tax-strategy-audit-table"
    >
      <header className="px-5 pt-4 pb-2 flex items-center gap-2">
        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Property Tax Reform — Master Audit
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 720 }}>
          <thead>
            <tr className="border-b border-border/50 bg-secondary/20 text-muted-foreground">
              <th className="text-left px-4 py-2 font-semibold">Property</th>
              <th className="text-left px-4 py-2 font-semibold">Purchase</th>
              <th className="text-left px-4 py-2 font-semibold">Type</th>
              <th className="text-right px-4 py-2 font-semibold">Current Law</th>
              <th className="text-right px-4 py-2 font-semibold">Reform</th>
              <th className="text-right px-4 py-2 font-semibold">Loss Bank</th>
              <th className="text-right px-4 py-2 font-semibold">Annual Impact</th>
            </tr>
          </thead>
          <tbody>
            {impact.rows.map(r => {
              const s = r.classification.status;
              const typeLabel =
                s.isGrandfathered ? "Grandfathered"
                : s.isPostReformCarveOut ? "Carve-out"
                : s.isPostReformEstablished ? "Reform affected"
                : "Unknown";
              const typeTone =
                s.isGrandfathered ? "text-emerald-400"
                : s.isPostReformCarveOut ? "text-amber-300"
                : s.isPostReformEstablished ? "text-red-300"
                : "text-muted-foreground";
              const cl = r.currentLaw.paygRefundThisYear;
              const rf = r.proposedReform.paygRefundThisYear;
              const delta = r.cashflowDelta;
              return (
                <tr key={r.id} className="border-b border-border/30 hover:bg-secondary/10">
                  <td className="px-4 py-2 font-semibold text-foreground">{r.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {r.contractDate ?? "—"}
                  </td>
                  <td className={`px-4 py-2 font-semibold ${typeTone}`}>{typeLabel}</td>
                  <td className="px-4 py-2 text-right num-display text-emerald-400">
                    {fmtAud(cl)}
                  </td>
                  <td className={`px-4 py-2 text-right num-display ${
                    rf === 0 && cl > 0 ? "text-red-400" : "text-foreground"
                  }`}>
                    {fmtAud(rf)}
                  </td>
                  <td className={`px-4 py-2 text-right num-display ${
                    r.proposedReform.lossAccumulatedThisYear > 0 ? "text-amber-300" : "text-muted-foreground"
                  }`}>
                    {fmtAud(r.proposedReform.lossAccumulatedThisYear)}
                  </td>
                  <td className={`px-4 py-2 text-right num-display ${
                    delta < 0 ? "text-red-400" : delta > 0 ? "text-emerald-400" : "text-muted-foreground"
                  }`}>
                    {fmtAudSigned(delta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-secondary/20 font-semibold">
              <td className="px-4 py-2" colSpan={3}>Portfolio total</td>
              <td className="px-4 py-2 text-right num-display text-emerald-400">
                {fmtAud(impact.totals.currentLawRefund)}
              </td>
              <td className="px-4 py-2 text-right num-display">
                {fmtAud(impact.totals.reformRefund)}
              </td>
              <td className="px-4 py-2 text-right num-display text-amber-300">
                {fmtAud(impact.totals.annualLossBankGrowth)}
              </td>
              <td className={`px-4 py-2 text-right num-display ${
                impact.totals.cashflowDelta < 0 ? "text-red-400" : "text-emerald-400"
              }`}>
                {fmtAudSigned(impact.totals.cashflowDelta)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="px-5 py-2 text-[10px] text-muted-foreground border-t border-border/40">
        Source: <code>taxRulesEngine</code> · 12 May 2026 7:30pm AEST cutoff. Modelling only — not personal tax advice.
      </div>
    </section>
  );
}

export default TaxStrategyAuditTable;

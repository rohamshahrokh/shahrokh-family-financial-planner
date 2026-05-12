/**
 * AssumptionsPanel (audit fix P1.4)
 *
 * Single React surface for every assumption the engine touches — rails,
 * MC constants, regulatory thresholds. Used on /decision, /wealth-strategy,
 * /financial-plan, and as an appendix in the PDF.
 *
 * Why: audit defect AS-1 surfaced that Monte Carlo constants were invisible
 * to users (correlations, jump intensity, Vasicek, APRA buffer, liquidity
 * floor, concentration cap). This panel makes them auditable in one place.
 */

import { useMemo, useState } from "react";
import {
  collectAssumptionsUsed,
  type AssumptionRow,
  type BasePlanAssumptions,
} from "@/lib/scenarioV2";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { MODELLING_DISCLAIMER } from "@/lib/taxPolicyEngine";

export interface AssumptionsPanelProps {
  /** Override the rails portion of the inventory; otherwise defaults are used. */
  assumptions?: BasePlanAssumptions;
  /**
   * "compact" hides regulatory rows behind a disclosure; "full" shows every row
   * inline (used by the PDF appendix and /data-health diagnostic surface).
   */
  mode?: "compact" | "full";
}

export default function AssumptionsPanel({
  assumptions,
  mode = "compact",
}: AssumptionsPanelProps) {
  const rows = useMemo(() => collectAssumptionsUsed(assumptions), [assumptions]);
  const [open, setOpen] = useState(mode === "full");

  const grouped = useMemo(() => groupByCategory(rows), [rows]);

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <div>
          <div className="text-sm font-bold text-foreground">Assumptions used</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {rows.length} entries spanning macro rails, asset returns, tax, super, Monte Carlo and risk thresholds.
          </div>
        </div>
        {mode === "compact" && (
          open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> :
                 <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {(open || mode === "full") && (
        <div className="mt-3 overflow-x-auto">
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
            <AlertTriangle className="w-3.5 h-3.5 mt-[1px] shrink-0" />
            <div>
              <span className="font-semibold">Modelling disclaimer:</span>{" "}
              {MODELLING_DISCLAIMER} The “TaxPolicy” and “DecisionEngine” categories
              below are user-editable rails that simulate the proposed 2027 reform
              — they do not represent enacted Australian law. The existing Current
              Rules engine is preserved unchanged and runs alongside the new regime layer;
              every output can be viewed under Current Rules, Proposed Reform, or both.
            </div>
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="px-2 py-1 font-semibold">Category</th>
                <th className="px-2 py-1 font-semibold">Assumption</th>
                <th className="px-2 py-1 font-semibold">Value</th>
                <th className="px-2 py-1 font-semibold">Source</th>
                <th className="px-2 py-1 font-semibold">Editable</th>
                <th className="px-2 py-1 font-semibold">Impacts</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(g => (
                <tbody key={g.category}>
                  <tr>
                    <td colSpan={6} className="px-2 pt-3 pb-1 text-[10px] uppercase tracking-wider font-bold text-primary">
                      {g.category}
                    </td>
                  </tr>
                  {g.rows.map(r => (
                    <tr key={`${r.category}-${r.label}`} className="border-t border-border/30">
                      <td className="px-2 py-1 text-muted-foreground">{r.category}</td>
                      <td className="px-2 py-1 font-medium">{r.label}</td>
                      <td className="px-2 py-1 font-mono">{r.value}</td>
                      <td className="px-2 py-1 text-muted-foreground">{r.source}</td>
                      <td className="px-2 py-1">{r.editable ? "Yes" : "No"}</td>
                      <td className="px-2 py-1 text-muted-foreground">{r.impacts}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function groupByCategory(rows: AssumptionRow[]) {
  const order: AssumptionRow["category"][] =
    ["Macro", "Property", "Stocks", "Crypto", "Cash", "Debt", "Tax", "Super", "CGT", "TaxPolicy", "DecisionEngine", "MC", "Risk"];
  const map: Map<string, AssumptionRow[]> = new Map();
  for (const r of rows) {
    if (!map.has(r.category)) map.set(r.category, []);
    map.get(r.category)!.push(r);
  }
  return order
    .filter(c => map.has(c))
    .map(c => ({ category: c, rows: map.get(c)! }));
}

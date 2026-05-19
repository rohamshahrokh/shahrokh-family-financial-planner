/**
 * FutureReformImpactCard.tsx — Dashboard "Future Reform Impact" tile.
 *
 * #FWL_TAX_REFORM_LIVE_INTEGRATION
 *
 * Compact card surfaced on the Executive Overview / Dashboard. Renders
 * live current-law vs proposed-reform deltas computed by the canonical
 * `taxRulesEngine` (via the `computePortfolioTaxImpact` adapter). This
 * component owns NO tax math — it is a pure presentational shell.
 *
 * Spec fields (rendered when data is available, hidden otherwise):
 *   - Tax refunds reduced: -$X/year
 *   - Loss bank accumulated by {horizon year}: $X
 *   - Annual after-tax cashflow delta: -$X
 *   - Reform-affected property count
 *   - Best move changed: (only when caller provides bestMoveChanged)
 *
 * The card is hidden entirely when the portfolio has no investment
 * properties OR when the reform produces no delta against current law
 * (so the dashboard does not gain a "$0 impact" tile for households
 * who only own a PPOR).
 */

import { useMemo } from "react";
import { ScrollText, AlertCircle, ShieldCheck, TrendingDown } from "lucide-react";
import {
  computePortfolioTaxImpact,
  type PortfolioPropertyRow,
} from "@/lib/tax/propertyPortfolioTaxImpact";
import { fmtAud, fmtAudSigned } from "./formatters";

interface Props {
  properties: PortfolioPropertyRow[];
  /** Combined wage income used by the engine to compute PAYG refunds. */
  wageIncome: number;
  /**
   * Optional override of the loss-bank projection horizon (years).
   * Default 10 (matches the spec's "by 2035" framing — current year +10).
   */
  horizonYears?: number;
  /** Optional plain-English best-move delta surfaced by the caller. */
  bestMoveChanged?: string | null;
  className?: string;
}

export function FutureReformImpactCard({
  properties,
  wageIncome,
  horizonYears = 10,
  bestMoveChanged,
  className,
}: Props): JSX.Element | null {
  const impact = useMemo(
    () => computePortfolioTaxImpact(properties ?? [], wageIncome, horizonYears),
    [properties, wageIncome, horizonYears],
  );

  // Hide entirely when there's no investment portfolio OR no delta.
  if (impact.rows.length === 0) return null;
  const t = impact.totals;
  const hasDelta =
    t.refundsReduced > 0 ||
    t.annualLossBankGrowth > 0 ||
    Math.abs(t.cashflowDelta) > 0.5 ||
    t.reformAffectedCount > 0;
  if (!hasDelta) return null;

  const horizonYear = new Date().getFullYear() + horizonYears;

  return (
    <section
      className={`rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4 ${className ?? ""}`}
      data-testid="future-reform-impact-card"
    >
      <header className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
          <ScrollText className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-400/90">
            Future Reform Impact
          </div>
          <div className="text-sm font-semibold text-foreground leading-tight">
            Live current-law vs proposed-reform delta
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {t.refundsReduced > 0 && (
          <Tile
            icon={<TrendingDown className="w-3.5 h-3.5" />}
            label="Tax refunds reduced"
            value={`−${fmtAud(t.refundsReduced)}/yr`}
            tone="bad"
            testId="tile-refunds-reduced"
          />
        )}
        {t.annualLossBankGrowth > 0 && (
          <Tile
            icon={<AlertCircle className="w-3.5 h-3.5" />}
            label={`Loss bank by ${horizonYear}`}
            value={fmtAud(t.projectedLossBank2035)}
            tone="warn"
            testId="tile-loss-bank"
          />
        )}
        {Math.abs(t.cashflowDelta) > 0.5 && (
          <Tile
            icon={<TrendingDown className="w-3.5 h-3.5" />}
            label="After-tax cashflow delta"
            value={fmtAudSigned(t.cashflowDelta)}
            tone={t.cashflowDelta < 0 ? "bad" : "good"}
            testId="tile-cashflow-delta"
          />
        )}
        {t.reformAffectedCount > 0 && (
          <Tile
            icon={<AlertCircle className="w-3.5 h-3.5" />}
            label="Reform-affected properties"
            value={String(t.reformAffectedCount)}
            tone="warn"
            testId="tile-reform-affected"
          />
        )}
        {t.grandfatheredCount > 0 && (
          <Tile
            icon={<ShieldCheck className="w-3.5 h-3.5" />}
            label="Grandfathered"
            value={String(t.grandfatheredCount)}
            tone="good"
            testId="tile-grandfathered"
          />
        )}
        {bestMoveChanged && (
          <Tile
            icon={<AlertCircle className="w-3.5 h-3.5" />}
            label="Best move changed"
            value={bestMoveChanged}
            tone="warn"
            testId="tile-best-move-changed"
          />
        )}
      </div>

      <p className="text-[10px] text-muted-foreground/80 mt-3 leading-snug">
        Reform model: established dwellings acquired after 12 May 2026 7:30pm AEST lose
        PAYG offset; losses accrue in a per-property loss bank; CGT switches to indexed
        cost base. Modelling only — not personal tax advice.
      </p>
    </section>
  );
}

function Tile({
  icon, label, value, tone, testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "bad" | "good" | "warn" | "soft";
  testId?: string;
}): JSX.Element {
  const toneClass =
    tone === "bad"  ? "text-red-400"
    : tone === "good" ? "text-emerald-400"
    : tone === "warn" ? "text-amber-300"
    : "text-foreground";
  return (
    <div className="bg-card/60 rounded-xl p-2.5" data-testid={testId}>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
        <span className="opacity-70">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-sm font-bold num-display ${toneClass}`}>{value}</div>
    </div>
  );
}

export default FutureReformImpactCard;

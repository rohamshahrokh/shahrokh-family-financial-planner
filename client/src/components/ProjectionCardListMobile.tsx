/**
 * ProjectionCardListMobile.tsx
 *
 * Dedicated mobile-only experience for the Strategic Wealth Projection
 * (Deterministic Projection — Assumption-Based) section. Renders one
 * premium expandable card per projection year. NOT a compressed table —
 * this is a separate, mobile-native UI surface.
 *
 * Data contract:
 *   - Consumes the canonical projection rows produced upstream in
 *     `dashboard.tsx` (passed in via the `rows` prop).
 *   - Consumes the canonical WealthLayers also produced upstream (passed in
 *     via the `layers` prop).
 *   - Pure presentation. No projection engine, forecast store, regime
 *     calculator, or canonical-risk builder is invoked here. FIRE Capital
 *     and Liquidatable Wealth per year are derived display values by
 *     applying today's canonical layer ratio
 *     (`layers.fireCapital / layers.grossNetWorth`,
 *      `layers.liquidatableWealth / layers.grossNetWorth`) to each row's
 *     `totalNetWorth`. These ratios already come from the canonical
 *     wealth-layers strip — no parallel maths.
 *
 * Visibility:
 *   - The component itself is layout-agnostic. The host container in
 *     `ExecutiveDashboard.tsx` gates it with `block md:hidden` so it only
 *     renders on mobile (<768px). On md+ the original desktop table runs
 *     untouched.
 *
 * Collapsed card header surfaces:
 *   Year · Total NW · Accessible NW · CAGR · Annual Growth
 *
 * Expanded card body surfaces:
 *   Cash · Liabilities · Property Equity · Stocks · Crypto · Super ·
 *   FIRE Capital · Liquidatable Wealth
 *
 * Smooth expand/collapse: grid-template-rows 0fr → 1fr transition. No JS
 * height measurement, no Radix dep, no layout thrash. Chevron rotates 90°
 * on the same 200ms transform transition.
 */
import { useState } from "react";
import type { WealthProjectionRow } from "@/components/ExecutiveDashboard";
import type { WealthLayers } from "@/lib/canonicalWealth";
import { formatCurrency } from "@/lib/finance";
import { useAppStore } from "@/lib/store";
import { maskValue } from "@/components/PrivacyMask";

export interface ProjectionCardListMobileProps {
  /** Canonical projection rows produced upstream (passed through props). */
  rows: WealthProjectionRow[];
  /** Canonical wealth layers produced upstream (passed through props). */
  layers: WealthLayers | null;
  /** Today's starting net worth — used for CAGR fallback on the collapsed header. */
  startNW: number;
}

export default function ProjectionCardListMobile({
  rows,
  layers,
  startNW,
}: ProjectionCardListMobileProps) {
  const { privacyMode } = useAppStore();
  const mv = (v: string) => maskValue(v, privacyMode);

  if (!rows || rows.length === 0) return null;

  const liqRatio =
    layers && layers.grossNetWorth > 0
      ? layers.liquidatableWealth / layers.grossNetWorth
      : 1;
  const fireRatio =
    layers && layers.grossNetWorth > 0
      ? layers.fireCapital / layers.grossNetWorth
      : 1;

  return (
    <div
      className="divide-y divide-border/30"
      data-testid="wealth-projection-mobile"
    >
      {rows.map((row, idx) => (
        <ProjectionCardMobile
          key={row.year}
          row={row}
          isFirst={idx === 0}
          startNW={startNW}
          liqRatio={liqRatio}
          fireRatio={fireRatio}
          mv={mv}
        />
      ))}
    </div>
  );
}

function ProjectionCardMobile({
  row,
  isFirst,
  startNW,
  liqRatio,
  fireRatio,
  mv,
}: {
  row: WealthProjectionRow;
  isFirst: boolean;
  startNW: number;
  liqRatio: number;
  fireRatio: number;
  mv: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);

  const rowLiquidatable = row.totalNetWorth * liqRatio;
  const rowFire = row.totalNetWorth * fireRatio;

  const yearsFromNow = row.year - new Date().getFullYear();
  const cagrPct =
    Number.isFinite(row.cagrPct) && row.cagrPct !== 0
      ? row.cagrPct
      : startNW > 0 && yearsFromNow > 0
        ? (Math.pow(row.totalNetWorth / startNW, 1 / yearsFromNow) - 1) * 100
        : 0;

  return (
    <div
      className={`px-4 py-2.5 ${isFirst ? "bg-amber-500/[0.03]" : ""}`}
      data-testid={`wealth-projection-mobile-row-${row.year}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-left flex items-center justify-between gap-2"
        data-testid={`wealth-projection-mobile-summary-${row.year}`}
      >
        <span className="font-bold text-foreground tabular-nums text-[12px] shrink-0">
          {row.year}
          {isFirst ? " ★" : ""}
        </span>
        <span className="flex items-center gap-2.5 text-[10.5px] flex-wrap justify-end">
          <span
            className="tabular-nums font-mono"
            style={{ color: "hsl(43,90%,62%)" }}
            data-testid="mobile-summary-total-nw"
            title="Total NW"
          >
            {mv(formatCurrency(row.totalNetWorth, true))}
          </span>
          <span
            className="tabular-nums font-mono"
            style={{ color: "hsl(195,80%,68%)" }}
            data-testid="mobile-summary-accessible-nw"
            title="Accessible NW"
          >
            {mv(formatCurrency(row.accessibleNetWorth, true))}
          </span>
          <span
            className="tabular-nums font-mono"
            style={{
              color: cagrPct >= 0 ? "hsl(142,60%,55%)" : "hsl(0,72%,60%)",
            }}
            data-testid="mobile-summary-cagr"
            title="CAGR"
          >
            {cagrPct.toFixed(1)}%
          </span>
          <span
            className="tabular-nums font-mono"
            style={{
              color: row.growth >= 0 ? "hsl(142,60%,55%)" : "hsl(0,72%,60%)",
            }}
            data-testid="mobile-summary-growth"
            title="Annual Growth"
          >
            {row.growth >= 0 ? "+" : ""}
            {mv(formatCurrency(row.growth, true))}
          </span>
          <span
            className={`text-muted-foreground transition-transform duration-200 ${
              open ? "rotate-90" : ""
            }`}
            aria-hidden="true"
          >
            ▸
          </span>
        </span>
      </button>
      {/* Grid-rows 0fr→1fr trick: smooth height transition with no JS measure. */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        data-testid={`wealth-projection-mobile-expand-${row.year}`}
      >
        <div className="overflow-hidden">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[10.5px]">
            <dt className="text-muted-foreground">Cash</dt>
            <dd className="text-right tabular-nums font-mono text-foreground">
              {mv(formatCurrency(row.cash, true))}
            </dd>
            <dt className="text-muted-foreground">Liabilities</dt>
            <dd
              className="text-right tabular-nums font-mono"
              style={{ color: "hsl(0,72%,60%)" }}
            >
              −{mv(formatCurrency(Math.abs(row.liabilities), true))}
            </dd>
            <dt className="text-muted-foreground">Property Equity</dt>
            <dd className="text-right tabular-nums font-mono text-foreground">
              {mv(formatCurrency(row.propertyEquity, true))}
            </dd>
            <dt className="text-muted-foreground">Stocks</dt>
            <dd className="text-right tabular-nums font-mono text-foreground">
              {mv(formatCurrency(row.stocks, true))}
            </dd>
            <dt className="text-muted-foreground">Crypto</dt>
            <dd className="text-right tabular-nums font-mono text-foreground">
              {mv(formatCurrency(row.crypto, true))}
            </dd>
            <dt className="text-muted-foreground">Super</dt>
            <dd className="text-right tabular-nums font-mono text-foreground">
              {mv(formatCurrency(row.superTotal, true))}
            </dd>
            <dt className="text-muted-foreground">FIRE Capital</dt>
            <dd
              className="text-right tabular-nums font-mono"
              style={{ color: "hsl(var(--gold))" }}
            >
              {mv(formatCurrency(rowFire, true))}
            </dd>
            <dt className="text-muted-foreground">Liquidatable Wealth</dt>
            <dd
              className="text-right tabular-nums font-mono"
              style={{ color: "hsl(var(--gold))" }}
            >
              {mv(formatCurrency(rowLiquidatable, true))}
            </dd>
          </dl>
        </div>
      </div>
    </div>
  );
}

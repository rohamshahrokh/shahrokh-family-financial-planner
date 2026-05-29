/**
 * NetWorthAttribution — Action Roadmap S4 (Sprint 28B + Sprint 29 §9 / §3.4).
 *
 * Sprint 29 rewrite. When reconciliation FAILS the section renders a
 * blocking error card (per §3.4). When reconciliation passes it renders:
 *   - 3 KPI tiles (Current NW, Projected NW, Delta $/%)
 *   - stacked horizontal bar showing component shares
 *   - per-row table with Contribution $, Contribution %, Growth $
 *   - largest growth contributor callout
 */
import * as React from "react";
import { PieChart, AlertTriangle, ArrowUpRight } from "lucide-react";
import { SourceChip } from "@/components/SourceChip";
import type { RoadmapSectionProps } from "./roadmapContext";
import type { NetWorthCategory, NetWorthComponent } from "@/lib/actionRoadmap/netWorthAttribution";
import { isBlocked } from "@/lib/actionRoadmap/financialReconciliation";

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "Not modelled yet";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}

function fmtMoneySigned(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString("en-AU")}`;
}

const CATEGORY_COLOR: Record<NetWorthCategory, string> = {
  ppor:                "bg-violet-500",
  investment_property: "bg-blue-500",
  etf:                 "bg-emerald-500",
  super:               "bg-teal-500",
  cash:                "bg-amber-500",
  crypto:              "bg-fuchsia-500",
  other:               "bg-neutral-500",
};

function SectionHeader() {
  return (
    <div className="flex items-start gap-2">
      <PieChart className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Net worth attribution</div>
        <h2 id="ar-s4-heading" className="text-base font-semibold text-foreground">Where the projected wealth comes from</h2>
      </div>
    </div>
  );
}

export function NetWorthAttribution(props: RoadmapSectionProps) {
  const { attribution, reconciliation, recommended, currentNetWorth, auditMode } = props;

  // Sprint 30A §D8 — block ONLY when `attribution_chart` is in the gate's
  // blockedFields list. Other sections continue to render.
  if (isBlocked(reconciliation, "attribution_chart")) {
    return (
      <section
        data-testid="ar-s4-nw-attribution"
        aria-labelledby="ar-s4-heading"
        className="rounded-2xl border border-rose-300/60 bg-rose-50/40 p-5 shadow-sm dark:border-rose-400/30 dark:bg-rose-950/20"
      >
        <SectionHeader />
        <div
          data-testid="ar-s4-reconciliation-error"
          className="mt-3 rounded-lg border border-rose-400/60 bg-background/70 p-4"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-rose-700 dark:text-rose-300" aria-hidden />
            <div>
              <div className="text-sm font-semibold text-rose-700 dark:text-rose-300">Financial reconciliation failed.</div>
              <div className="text-sm text-foreground">Roadmap output blocked pending engine consistency.</div>
              {reconciliation.message && (
                <p className="mt-2 text-[12px] text-muted-foreground">{reconciliation.message}</p>
              )}
            </div>
          </div>
          {auditMode && (
            <div className="mt-3 overflow-x-auto rounded-md border border-border/60 bg-card p-3" data-testid="ar-s4-reconciliation-audit">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Audit · reconciliation breakdown</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="px-1.5 py-1">Component</th>
                    <th className="px-1.5 py-1 text-right">Value</th>
                    <th className="px-1.5 py-1">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(reconciliation.breakdown).map(([k, v]) => (
                    <tr key={k} className="border-t border-border/60">
                      <td className="px-1.5 py-1 text-foreground">{k}</td>
                      <td className="px-1.5 py-1 text-right text-foreground">{fmtMoney(v)}</td>
                      <td className="px-1.5 py-1 text-muted-foreground">medianFinalState.{k}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border/80 font-semibold">
                    <td className="px-1.5 py-1 text-foreground">componentsSum</td>
                    <td className="px-1.5 py-1 text-right text-foreground">{fmtMoney(reconciliation.componentsSum)}</td>
                    <td className="px-1.5 py-1 text-muted-foreground">derived</td>
                  </tr>
                  <tr>
                    <td className="px-1.5 py-1 text-foreground">headlineNW</td>
                    <td className="px-1.5 py-1 text-right text-foreground">{fmtMoney(reconciliation.headlineNW)}</td>
                    <td className="px-1.5 py-1 text-muted-foreground">netWorthFan[-1].p50</td>
                  </tr>
                  <tr>
                    <td className="px-1.5 py-1 text-foreground">deltaPct</td>
                    <td className="px-1.5 py-1 text-right text-foreground">{(reconciliation.deltaPct * 100).toFixed(2)}%</td>
                    <td className="px-1.5 py-1 text-muted-foreground">|sum − headline| / headline</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3">
            <SourceChip
              attribution={{ source: "actionRoadmap.reconciliation", note: reconciliation.status }}
              auditMode={auditMode}
            />
          </div>
        </div>
      </section>
    );
  }

  // Empty attribution after PASS reconciliation — shouldn't happen in
  // practice but keep the fallback honest.
  if (!attribution) {
    return (
      <section
        data-testid="ar-s4-nw-attribution"
        aria-labelledby="ar-s4-heading"
        className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
      >
        <SectionHeader />
        <p className="mt-3 text-sm text-muted-foreground" data-testid="ar-s4-empty">Not modelled yet.</p>
      </section>
    );
  }

  const { components, total } = attribution;
  const initialBreakdown = readInitialBreakdown(recommended);
  const initialTotal = initialBreakdown
    ? Object.values(initialBreakdown).reduce((s, v) => s + v, 0)
    : null;

  const delta = currentNetWorth != null ? total - currentNetWorth : null;
  const deltaPct = currentNetWorth != null && Math.abs(currentNetWorth) > 0
    ? delta != null ? delta / Math.abs(currentNetWorth) : null
    : null;

  // Growth per component = component.value − initial allocation.
  const rows = components.map((c) => {
    const initialAlloc = initialBreakdown ? initialBreakdown[c.category] ?? null : null;
    const growth = initialAlloc != null ? c.value - initialAlloc : null;
    return { ...c, initialAlloc, growth };
  });

  const largestGrowth = rows
    .filter((r) => r.growth != null)
    .sort((a, b) => (b.growth as number) - (a.growth as number))[0] ?? null;

  return (
    <section
      data-testid="ar-s4-nw-attribution"
      aria-labelledby="ar-s4-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <SectionHeader />

      {/* KPI tiles */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile label="Current NW" value={fmtMoney(currentNetWorth)} source={currentNetWorth == null ? "notModelled" : "canonicalLedger"} auditMode={auditMode} testId="ar-s4-kpi-current" />
        <KpiTile label="Projected NW" value={fmtMoney(total)} source="scenarioV2.monteCarlo" percentile="p50" auditMode={auditMode} testId="ar-s4-kpi-projected" />
        <KpiTile
          label="Delta vs today"
          value={delta == null
            ? "Not modelled yet"
            : `${fmtMoneySigned(delta)}${deltaPct != null ? ` (${(deltaPct * 100).toFixed(1)}%)` : ""}`}
          source={delta == null ? "notModelled" : "actionRoadmap.reconciliation"}
          auditMode={auditMode}
          testId="ar-s4-kpi-delta"
        />
      </div>

      {/* Stacked bar */}
      <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="flex h-full w-full">
          {components.map((c) => (
            <div
              key={c.category}
              className={CATEGORY_COLOR[c.category]}
              style={{ width: `${Math.max(0, c.share * 100)}%` }}
              title={`${c.label} (${(c.share * 100).toFixed(0)}%)`}
            />
          ))}
        </div>
      </div>

      {/* Table */}
      <table className="mt-4 w-full text-sm" data-testid="ar-s4-table">
        <thead>
          <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-1.5">Component</th>
            <th className="px-2 py-1.5 text-right">Contribution $</th>
            <th className="px-2 py-1.5 text-right">Contribution %</th>
            <th className="px-2 py-1.5 text-right">Growth $</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.category} className="border-t border-border/60" data-testid={`ar-s4-row-${r.category}`}>
              <td className="px-2 py-2">
                <span className={`mr-2 inline-block h-2 w-2 rounded-full ${CATEGORY_COLOR[r.category]}`} aria-hidden />
                <span className="text-foreground">{r.label}</span>
              </td>
              <td className="px-2 py-2 text-right text-foreground">{fmtMoney(r.value)}</td>
              <td className="px-2 py-2 text-right text-foreground">{(r.share * 100).toFixed(0)}%</td>
              <td className="px-2 py-2 text-right text-foreground">
                {r.growth != null ? fmtMoneySigned(r.growth) : <span className="text-muted-foreground">Not modelled yet</span>}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-border/80 font-semibold">
            <td className="px-2 py-2 text-foreground" data-testid="ar-s4-total-label">TOTAL</td>
            <td className="px-2 py-2 text-right text-foreground" data-testid="ar-s4-total-value">{fmtMoney(total)}</td>
            <td className="px-2 py-2 text-right text-foreground">100%</td>
            <td className="px-2 py-2 text-right text-foreground">{initialTotal != null ? fmtMoneySigned(total - initialTotal) : <span className="text-muted-foreground">Not modelled yet</span>}</td>
          </tr>
        </tbody>
      </table>

      {largestGrowth && largestGrowth.growth != null && largestGrowth.growth > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-300/60 bg-emerald-50/40 px-3 py-2 text-xs dark:border-emerald-400/30 dark:bg-emerald-950/20" data-testid="ar-s4-largest-growth">
          <ArrowUpRight className="h-4 w-4 text-emerald-700 dark:text-emerald-300" aria-hidden />
          <span className="text-foreground">
            Largest growth contributor: <span className="font-semibold">{largestGrowth.label}</span>
            {" "}
            ({fmtMoneySigned(largestGrowth.growth)})
          </span>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <SourceChip
          attribution={{ source: "scenarioV2.monteCarlo", percentile: "p50", note: "Terminal medianFinalState" }}
          auditMode={auditMode}
        />
      </div>
    </section>
  );
}

function KpiTile({
  label, value, source, percentile, auditMode, testId,
}: {
  label: string;
  value: string;
  source: import("@/lib/actionRoadmap/metricSourceAttribution").MetricSource;
  percentile?: "p25" | "p50" | "p75";
  auditMode: boolean;
  testId: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3" data-testid={testId}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
      <div className="mt-1.5"><SourceChip attribution={{ source, percentile }} auditMode={auditMode} /></div>
    </div>
  );
}

/**
 * Try to derive an initial breakdown that matches the same categories as
 * `attribution.components`. We read `canonicalNetWorth` from the
 * recommended winner's result (Sprint 28B exposed it already on
 * ExtendedScenarioResult). When the breakdown is missing entirely, growth
 * columns render "Not modelled yet" per §9.2 — never fabricated.
 */
function readInitialBreakdown(
  recommended: RoadmapSectionProps["recommended"],
): Partial<Record<NetWorthComponent["category"], number>> | null {
  const result = recommended?.winner?.result as unknown as { canonicalNetWorth?: {
    assets?: Record<string, number>;
    liabilities?: Record<string, number>;
  } } | undefined;
  const cn = result?.canonicalNetWorth;
  if (!cn || !cn.assets) return null;
  const assets = cn.assets;
  const liabilities = cn.liabilities ?? {};
  const ppoEquity = (assets.ppor ?? 0) - (liabilities.ppoMortgage ?? 0);
  const ipEquity = (assets.settledIpValue ?? 0) - (liabilities.settledIpLoans ?? 0);
  return {
    ppor: ppoEquity,
    investment_property: ipEquity,
    etf: assets.stocks ?? 0,
    super: assets.super ?? 0,
    cash: assets.cashOffset ?? 0,
    crypto: assets.crypto ?? 0,
    other: (assets.cars ?? 0) + (assets.iranProperty ?? 0) + (assets.otherAssets ?? 0) - (liabilities.otherDebts ?? 0),
  };
}

export default NetWorthAttribution;

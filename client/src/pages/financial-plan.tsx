import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useHashLocation } from "wouter/use-hash-location";
import { formatCurrency } from "@/lib/finance";
import {
  ClipboardList,
  Home,
  TrendingUp,
  Bitcoin,
  Calendar,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  DollarSign,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function dcaMonthlyEquiv(amount: number, frequency: string): number {
  switch (frequency) {
    case "weekly":
      return amount * (52 / 12);
    case "fortnightly":
      return amount * (26 / 12);
    case "monthly":
      return amount;
    case "quarterly":
      return amount / 3;
    default:
      return amount;
  }
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-muted rounded ${className}`} />
  );
}

function Badge({
  label,
  variant,
}: {
  label: string;
  variant: "green" | "red" | "amber" | "blue" | "muted";
}) {
  const cls = {
    green: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    red: "bg-red-500/15 text-red-400 border border-red-500/30",
    amber: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    blue: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    muted: "bg-muted text-muted-foreground border border-border",
  }[variant];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
}: {
  title: string;
  value: string | React.ReactNode;
  icon: React.ElementType;
  loading?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="w-4 h-4" />
        <span className="text-sm">{title}</span>
      </div>
      {loading ? (
        <Skeleton className="h-7 w-28" />
      ) : (
        <div className="text-2xl font-semibold text-foreground">{value}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function MyFinancialPlan() {
  const [, navigate] = useHashLocation();

  // ---- Data queries --------------------------------------------------------
  const { data: properties, isLoading: loadingProps } = useQuery<any[]>({
    queryKey: ["/api/properties"],
  });
  const { data: stockDCA, isLoading: loadingStockDCA } = useQuery<any[]>({
    queryKey: ["/api/stock-dca"],
  });
  const { data: cryptoDCA, isLoading: loadingCryptoDCA } = useQuery<any[]>({
    queryKey: ["/api/crypto-dca"],
  });
  const { data: plannedStock, isLoading: loadingPlannedStock } = useQuery<
    any[]
  >({ queryKey: ["/api/planned-investments?module=stock"] });
  const { data: plannedCrypto, isLoading: loadingPlannedCrypto } = useQuery<
    any[]
  >({ queryKey: ["/api/planned-investments?module=crypto"] });
  const { data: snapshot } = useQuery<any>({
    queryKey: ["/api/snapshot"],
  });

  const isLoading =
    loadingProps ||
    loadingStockDCA ||
    loadingCryptoDCA ||
    loadingPlannedStock ||
    loadingPlannedCrypto;

  // ---- Derived values -------------------------------------------------------
  const investmentProperties = useMemo(
    () => (properties ?? []).filter((p: any) => p.type === "investment"),
    [properties]
  );

  const totalMonthlyDCA = useMemo(() => {
    const stockTotal = (stockDCA ?? [])
      .filter((d: any) => d.enabled || d.status === "active")
      .reduce(
        (sum: number, d: any) =>
          sum + dcaMonthlyEquiv(Number(d.amount ?? 0), d.frequency ?? "monthly"),
        0
      );
    const cryptoTotal = (cryptoDCA ?? [])
      .filter((d: any) => d.enabled || d.status === "active")
      .reduce(
        (sum: number, d: any) =>
          sum + dcaMonthlyEquiv(Number(d.amount ?? 0), d.frequency ?? "monthly"),
        0
      );
    return stockTotal + cryptoTotal;
  }, [stockDCA, cryptoDCA]);

  const totalLumpSum = useMemo(() => {
    const stockBuys = (plannedStock ?? [])
      .filter(
        (p: any) =>
          (p.status === "planned" || p.status === "pending") &&
          p.action === "buy"
      )
      .reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);
    const cryptoBuys = (plannedCrypto ?? [])
      .filter(
        (p: any) =>
          (p.status === "planned" || p.status === "pending") &&
          p.action === "buy"
      )
      .reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);
    return stockBuys + cryptoBuys;
  }, [plannedStock, plannedCrypto]);

  const activeStockDCA = useMemo(
    () =>
      (stockDCA ?? []).filter((d: any) => d.enabled || d.status === "active"),
    [stockDCA]
  );
  const activeCryptoDCA = useMemo(
    () =>
      (cryptoDCA ?? []).filter((d: any) => d.enabled || d.status === "active"),
    [cryptoDCA]
  );

  const plannedStockBuys = useMemo(
    () =>
      (plannedStock ?? []).filter(
        (p: any) =>
          p.status === "planned" || p.status === "pending"
      ),
    [plannedStock]
  );
  const plannedCryptoBuys = useMemo(
    () =>
      (plannedCrypto ?? []).filter(
        (p: any) =>
          p.status === "planned" || p.status === "pending"
      ),
    [plannedCrypto]
  );

  // ---- Timeline events -------------------------------------------------------
  type TimelineEvent = {
    date: Date;
    label: string;
    amount: number | null;
    type: "property" | "stock" | "crypto" | "dca-start" | "dca-end";
  };

  const timelineEvents: TimelineEvent[] = useMemo(() => {
    const events: TimelineEvent[] = [];

    // Property settlements
    for (const p of investmentProperties) {
      if (p.settlement_date) {
        events.push({
          date: new Date(p.settlement_date),
          label: `${p.address ?? p.name ?? "Property"} — Settlement`,
          amount: Number(p.purchase_price ?? 0),
          type: "property",
        });
      }
    }

    // Planned stock orders
    for (const s of plannedStock ?? []) {
      if (s.planned_date) {
        events.push({
          date: new Date(s.planned_date),
          label: `${s.ticker ?? s.name ?? "Stock"} — ${s.action?.toUpperCase() ?? "ORDER"}`,
          amount: Number(s.amount ?? 0),
          type: "stock",
        });
      }
    }

    // Planned crypto orders
    for (const c of plannedCrypto ?? []) {
      if (c.planned_date) {
        events.push({
          date: new Date(c.planned_date),
          label: `${c.symbol ?? c.name ?? "Crypto"} — ${c.action?.toUpperCase() ?? "ORDER"}`,
          amount: Number(c.amount ?? 0),
          type: "crypto",
        });
      }
    }

    // DCA start/end dates
    for (const d of stockDCA ?? []) {
      if (d.start_date) {
        events.push({
          date: new Date(d.start_date),
          label: `${d.ticker ?? d.symbol ?? "Stock DCA"} — DCA Start (${d.frequency ?? ""})`,
          amount: Number(d.amount ?? 0),
          type: "dca-start",
        });
      }
      if (d.end_date) {
        events.push({
          date: new Date(d.end_date),
          label: `${d.ticker ?? d.symbol ?? "Stock DCA"} — DCA End`,
          amount: null,
          type: "dca-end",
        });
      }
    }
    for (const d of cryptoDCA ?? []) {
      if (d.start_date) {
        events.push({
          date: new Date(d.start_date),
          label: `${d.symbol ?? d.ticker ?? "Crypto DCA"} — DCA Start (${d.frequency ?? ""})`,
          amount: Number(d.amount ?? 0),
          type: "dca-start",
        });
      }
      if (d.end_date) {
        events.push({
          date: new Date(d.end_date),
          label: `${d.symbol ?? d.ticker ?? "Crypto DCA"} — DCA End`,
          amount: null,
          type: "dca-end",
        });
      }
    }

    return events.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [investmentProperties, plannedStock, plannedCrypto, stockDCA, cryptoDCA]);

  // ---- Validation status helpers -------------------------------------------
  function statusColor(count: number, threshold = 1): "green" | "amber" | "muted" {
    return count >= threshold ? "green" : count === 0 ? "amber" : "muted";
  }

  const timelineDotColor: Record<TimelineEvent["type"], string> = {
    property: "bg-blue-500",
    stock: "bg-emerald-500",
    crypto: "bg-amber-500",
    "dca-start": "bg-purple-500",
    "dca-end": "bg-red-400",
  };

  // ---- Render ----------------------------------------------------------------
  return (
    <div className="space-y-8 pb-16">
      {/* ================================================================
          SECTION 1 — Plan Overview Header
      ================================================================ */}
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-7 h-7 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">
            My Financial Plan
          </h1>
        </div>
        <p className="text-muted-foreground text-sm pl-10">
          All future financial events — properties, investments, DCA schedules
        </p>
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Properties Planned"
          icon={Home}
          loading={loadingProps}
          value={String(investmentProperties.length)}
        />
        <StatCard
          title="Monthly DCA"
          icon={RefreshCw}
          loading={loadingStockDCA || loadingCryptoDCA}
          value={formatCurrency(totalMonthlyDCA)}
        />
        <StatCard
          title="Lump Sum Buys"
          icon={DollarSign}
          loading={loadingPlannedStock || loadingPlannedCrypto}
          value={formatCurrency(totalLumpSum)}
        />
        <StatCard
          title="FIRE Target"
          icon={TrendingUp}
          value="Age 55 · $20k/mo"
        />
      </div>

      {/* ================================================================
          SECTION 2 — Validation Panel
      ================================================================ */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            Monte Carlo Inputs — Validation
          </h2>
          <Button
            size="sm"
            onClick={() => navigate("/wealth-strategy")}
            className="flex items-center gap-1"
          >
            Run Monte Carlo
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {/* Properties */}
            <div className="rounded-lg border border-border bg-background p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Properties</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-foreground">
                  {investmentProperties.length}
                </span>
                <Badge
                  label={investmentProperties.length >= 1 ? "Ready" : "None"}
                  variant={statusColor(investmentProperties.length)}
                />
              </div>
            </div>

            {/* Stock DCA */}
            <div className="rounded-lg border border-border bg-background p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Stock DCA schedules</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-foreground">
                  {activeStockDCA.length}
                </span>
                <Badge
                  label={activeStockDCA.length >= 1 ? "Active" : "None"}
                  variant={statusColor(activeStockDCA.length)}
                />
              </div>
            </div>

            {/* Crypto DCA */}
            <div className="rounded-lg border border-border bg-background p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Crypto DCA schedules</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-foreground">
                  {activeCryptoDCA.length}
                </span>
                <Badge
                  label={activeCryptoDCA.length >= 1 ? "Active" : "None"}
                  variant={statusColor(activeCryptoDCA.length)}
                />
              </div>
            </div>

            {/* Planned stock orders */}
            <div className="rounded-lg border border-border bg-background p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Planned stock orders</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-foreground">
                  {plannedStockBuys.length}
                </span>
                <Badge
                  label={String(plannedStockBuys.length)}
                  variant={plannedStockBuys.length > 0 ? "green" : "muted"}
                />
              </div>
            </div>

            {/* Planned crypto orders */}
            <div className="rounded-lg border border-border bg-background p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Planned crypto orders</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-foreground">
                  {plannedCryptoBuys.length}
                </span>
                <Badge
                  label={String(plannedCryptoBuys.length)}
                  variant={plannedCryptoBuys.length > 0 ? "green" : "muted"}
                />
              </div>
            </div>

            {/* Total monthly DCA */}
            <div className="rounded-lg border border-border bg-background p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Total monthly DCA</p>
              <span className="text-xl font-bold text-foreground">
                {formatCurrency(totalMonthlyDCA)}
              </span>
            </div>

            {/* Total lump sum */}
            <div className="rounded-lg border border-border bg-background p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Total lump sum investments</p>
              <span className="text-xl font-bold text-foreground">
                {formatCurrency(totalLumpSum)}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 pt-1">
          {!isLoading &&
          investmentProperties.length === 0 &&
          activeStockDCA.length === 0 &&
          activeCryptoDCA.length === 0 ? (
            <div className="flex items-center gap-2 text-amber-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                No events are configured yet. Add properties, DCA schedules, or
                planned investments to build your plan.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                Plan data loaded — ready to run Monte Carlo simulation.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================
          SECTION 3 — Investment Properties Timeline
      ================================================================ */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Home className="w-5 h-5 text-blue-400" />
          <h2 className="text-base font-semibold text-foreground">
            Investment Properties
          </h2>
          <Badge
            label={String(investmentProperties.length)}
            variant={investmentProperties.length >= 1 ? "blue" : "muted"}
          />
        </div>

        {loadingProps ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : investmentProperties.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
            No investment properties planned yet — add one in the Property page
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Property</th>
                  <th className="pb-2 pr-4 font-medium whitespace-nowrap">
                    Settlement Date
                  </th>
                  <th className="pb-2 pr-4 font-medium whitespace-nowrap">
                    Purchase Price
                  </th>
                  <th className="pb-2 pr-4 font-medium">Deposit</th>
                  <th className="pb-2 pr-4 font-medium whitespace-nowrap">
                    Stamp Duty
                  </th>
                  <th className="pb-2 pr-4 font-medium whitespace-nowrap">
                    Loan Amount
                  </th>
                  <th className="pb-2 pr-4 font-medium">Rate</th>
                  <th className="pb-2 pr-4 font-medium whitespace-nowrap">
                    Weekly Rent
                  </th>
                  <th className="pb-2 font-medium whitespace-nowrap">
                    Proj. Growth
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {investmentProperties.map((p: any, idx: number) => (
                  <tr key={p.id ?? idx} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-foreground">
                        {p.address ?? p.name ?? `Property ${idx + 1}`}
                      </div>
                      {p.suburb && (
                        <div className="text-xs text-muted-foreground">
                          {p.suburb}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                      {fmtDate(p.settlement_date)}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap font-medium text-foreground">
                      {p.purchase_price
                        ? formatCurrency(Number(p.purchase_price))
                        : "—"}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                      {p.deposit ? formatCurrency(Number(p.deposit)) : "—"}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                      {p.stamp_duty
                        ? formatCurrency(Number(p.stamp_duty))
                        : "—"}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                      {p.loan_amount
                        ? formatCurrency(Number(p.loan_amount))
                        : "—"}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {p.interest_rate != null ? (
                        <Badge
                          label={`${Number(p.interest_rate).toFixed(2)}%`}
                          variant="blue"
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                      {p.weekly_rent
                        ? formatCurrency(Number(p.weekly_rent))
                        : "—"}
                    </td>
                    <td className="py-3 whitespace-nowrap">
                      {p.projected_growth != null ? (
                        <Badge
                          label={`${Number(p.projected_growth).toFixed(1)}% p.a.`}
                          variant="green"
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================================================================
          SECTION 4 — DCA Schedules
      ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Stock DCA */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-foreground">
              Stock DCA Schedules
            </h2>
            <Badge
              label={String((stockDCA ?? []).length)}
              variant={(stockDCA ?? []).length > 0 ? "green" : "muted"}
            />
          </div>

          {loadingStockDCA ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (stockDCA ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
              No stock DCA schedules configured
            </div>
          ) : (
            <div className="space-y-2">
              {(stockDCA ?? []).map((d: any, idx: number) => {
                const isActive = d.enabled || d.status === "active";
                const monthly = dcaMonthlyEquiv(
                  Number(d.amount ?? 0),
                  d.frequency ?? "monthly"
                );
                return (
                  <div
                    key={d.id ?? idx}
                    className="rounded-lg border border-border bg-background p-3 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground">
                          {d.ticker ?? d.symbol ?? d.name ?? "Unknown"}
                        </span>
                        <Badge
                          label={isActive ? "Active" : "Inactive"}
                          variant={isActive ? "green" : "muted"}
                        />
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatCurrency(Number(d.amount ?? 0))} /{" "}
                        {d.frequency ?? "monthly"}
                        <span className="ml-2 text-xs">
                          ≈ {formatCurrency(monthly)}/mo
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {fmtDate(d.start_date)} → {fmtDate(d.end_date)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Crypto DCA */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Bitcoin className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-semibold text-foreground">
              Crypto DCA Schedules
            </h2>
            <Badge
              label={String((cryptoDCA ?? []).length)}
              variant={(cryptoDCA ?? []).length > 0 ? "amber" : "muted"}
            />
          </div>

          {loadingCryptoDCA ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (cryptoDCA ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
              No crypto DCA schedules configured
            </div>
          ) : (
            <div className="space-y-2">
              {(cryptoDCA ?? []).map((d: any, idx: number) => {
                const isActive = d.enabled || d.status === "active";
                const monthly = dcaMonthlyEquiv(
                  Number(d.amount ?? 0),
                  d.frequency ?? "monthly"
                );
                return (
                  <div
                    key={d.id ?? idx}
                    className="rounded-lg border border-border bg-background p-3 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground">
                          {d.symbol ?? d.ticker ?? d.name ?? "Unknown"}
                        </span>
                        <Badge
                          label={isActive ? "Active" : "Inactive"}
                          variant={isActive ? "green" : "muted"}
                        />
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatCurrency(Number(d.amount ?? 0))} /{" "}
                        {d.frequency ?? "monthly"}
                        <span className="ml-2 text-xs">
                          ≈ {formatCurrency(monthly)}/mo
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {fmtDate(d.start_date)} → {fmtDate(d.end_date)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================
          SECTION 5 — Planned One-Time Investments
      ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Planned Stocks */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-foreground">
              Planned Stock Orders
            </h2>
            <Badge
              label={String((plannedStock ?? []).length)}
              variant={(plannedStock ?? []).length > 0 ? "green" : "muted"}
            />
          </div>

          {loadingPlannedStock ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (plannedStock ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
              No planned stock orders yet
            </div>
          ) : (
            <div className="space-y-2">
              {[...(plannedStock ?? [])]
                .sort(
                  (a: any, b: any) =>
                    new Date(a.planned_date ?? 0).getTime() -
                    new Date(b.planned_date ?? 0).getTime()
                )
                .map((p: any, idx: number) => {
                  const isBuy =
                    (p.action ?? "buy").toLowerCase() === "buy";
                  const statusVariant: "green" | "amber" | "muted" =
                    p.status === "completed"
                      ? "green"
                      : p.status === "planned" || p.status === "pending"
                      ? "amber"
                      : "muted";
                  return (
                    <div
                      key={p.id ?? idx}
                      className="rounded-lg border border-border bg-background p-3 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-medium text-foreground">
                          {p.ticker ?? p.name ?? "Unknown"}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            label={isBuy ? "BUY" : "SELL"}
                            variant={isBuy ? "green" : "red"}
                          />
                          <Badge
                            label={p.status ?? "planned"}
                            variant={statusVariant}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{formatCurrency(Number(p.amount ?? 0))} AUD</span>
                        <span className="flex items-center gap-1 text-xs">
                          <Calendar className="w-3 h-3" />
                          {fmtDate(p.planned_date)}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Planned Crypto */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Bitcoin className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-semibold text-foreground">
              Planned Crypto Orders
            </h2>
            <Badge
              label={String((plannedCrypto ?? []).length)}
              variant={(plannedCrypto ?? []).length > 0 ? "amber" : "muted"}
            />
          </div>

          {loadingPlannedCrypto ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (plannedCrypto ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-lg">
              No planned crypto orders yet
            </div>
          ) : (
            <div className="space-y-2">
              {[...(plannedCrypto ?? [])]
                .sort(
                  (a: any, b: any) =>
                    new Date(a.planned_date ?? 0).getTime() -
                    new Date(b.planned_date ?? 0).getTime()
                )
                .map((p: any, idx: number) => {
                  const isBuy =
                    (p.action ?? "buy").toLowerCase() === "buy";
                  const statusVariant: "green" | "amber" | "muted" =
                    p.status === "completed"
                      ? "green"
                      : p.status === "planned" || p.status === "pending"
                      ? "amber"
                      : "muted";
                  return (
                    <div
                      key={p.id ?? idx}
                      className="rounded-lg border border-border bg-background p-3 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-medium text-foreground">
                          {p.symbol ?? p.ticker ?? p.name ?? "Unknown"}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge
                            label={isBuy ? "BUY" : "SELL"}
                            variant={isBuy ? "green" : "red"}
                          />
                          <Badge
                            label={p.status ?? "planned"}
                            variant={statusVariant}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{formatCurrency(Number(p.amount ?? 0))} AUD</span>
                        <span className="flex items-center gap-1 text-xs">
                          <Calendar className="w-3 h-3" />
                          {fmtDate(p.planned_date)}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================
          SECTION 6 — Timeline View
      ================================================================ */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-purple-400" />
          <h2 className="text-base font-semibold text-foreground">
            Chronological Timeline
          </h2>
          <Badge
            label={`${timelineEvents.length} events`}
            variant={timelineEvents.length > 0 ? "blue" : "muted"}
          />
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <Skeleton className="h-3 w-3 rounded-full" />
                  <Skeleton className="h-10 w-0.5 mt-1" />
                </div>
                <Skeleton className="h-14 flex-1" />
              </div>
            ))}
          </div>
        ) : timelineEvents.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-lg">
            No future events found — add properties, DCA schedules, or planned
            investments to see them here
          </div>
        ) : (
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-0 bottom-0 w-px bg-border" />

            <div className="space-y-1">
              {timelineEvents.map((ev, idx) => {
                const dotColor = timelineDotColor[ev.type] ?? "bg-muted";
                const isLast = idx === timelineEvents.length - 1;
                return (
                  <div key={idx} className="flex gap-4">
                    {/* Dot + line column */}
                    <div className="flex flex-col items-center pt-1 z-10">
                      <div
                        className={`w-3.5 h-3.5 rounded-full border-2 border-background ${dotColor} flex-shrink-0`}
                      />
                      {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
                    </div>

                    {/* Content */}
                    <div
                      className={`pb-5 flex-1 min-w-0 ${isLast ? "pb-0" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-sm font-medium text-foreground leading-snug">
                            {ev.label}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {ev.date.toLocaleDateString("en-AU", {
                              weekday: "short",
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                        {ev.amount != null && ev.amount > 0 && (
                          <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                            {formatCurrency(ev.amount)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ================================================================
          Bottom CTA
      ================================================================ */}
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={() => navigate("/wealth-strategy")}
          className="flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Run Monte Carlo with this plan
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

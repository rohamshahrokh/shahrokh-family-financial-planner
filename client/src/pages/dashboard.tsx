import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  formatCurrency,
  safeNum,
  calcSavingsRate,
  projectNetWorth,
  buildCashFlowSeries,
  aggregateCashFlowToAnnual,
  calcNegativeGearing,
  type NGSummary,
} from "@/lib/finance";
import { runCashEngine, getCashKPICards, type CashEvent } from "@/lib/cashEngine";
import { syncFromCloud, getLastSync } from "@/lib/localStore";
import { useAppStore } from "@/lib/store";
import { calcDepositPower, projectEquityTimeline } from "@/lib/equityEngine";
// Authoritative dashboard source-of-truth bindings + selectors. See
// docs/DASHBOARD_DATA_CONTRACT.md and client/src/lib/dashboardDataContract.ts.
// The regression check (`npm run test:dashboard-contract`) fails the build
// if these selectors stop binding to the documented Supabase fields.
import {
  selectStocksTotal as contractStocksTotal,
  selectCryptoTotal as contractCryptoTotal,
  selectIpCurrentValueSettled,
  selectIpLoanBalanceSettled,
  selectIpCurrentValuePlanned,
  selectIpLoanBalancePlanned,
  selectSettledIPs,
  selectPlannedIPs,
  selectTotalInvestments,
  selectPropertyEquity,
  selectDebtBalance,
  selectPassiveIncome,
  selectMonthlyIncome,
  selectMonthlyExpensesLedger,
  selectMortgageRepayment,
  selectOtherDebtRepayment,
  selectSettledIpDebtService,
  selectMonthlyDebtService,
  selectExpensesIncludesDebt,
  selectMonthlySurplus,
  evaluateDataAvailability,
  selectCanonicalNetWorth,
  reconcileNetWorth,
  type DashboardInputs,
  type CanonicalNetWorth,
} from "@/lib/dashboardDataContract";
import { maskValue } from "@/components/PrivacyMask";
import SaveButton, { useSaveOnEnter } from "@/components/SaveButton";
import { useState, useMemo, useCallback, useRef, useEffect, Fragment } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ComposedChart,
  type TooltipProps,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  Home,
  CreditCard,
  PiggyBank,
  Target,
  Edit2,
  RefreshCw,
  Eye,
  EyeOff,
  Flame,
  Shield,
  Building2,
  Clock,
  AlertTriangle,
  Receipt,
  ChevronRight,
  Zap,
  Maximize2,
  ArrowUpRight,
  ArrowDownRight,
  BarChart2,
  Layers,
  Briefcase,
  Calendar,
  Landmark,
  TrendingDown,
  Star,
  Activity,
  Info,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Unlock,
  Lock,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import AIInsightsCard from "@/components/AIInsightsCard";
import PortfolioLiveReturn from "@/components/PortfolioLiveReturn";
import CFODashboardWidget from "@/components/CFODashboardWidget";
import BestMoveCard from "@/components/BestMoveCard";
import ActionCentre from "@/components/ActionCentre";
import FinancialOSCentre from "@/components/FinancialOSCentre";
import FamilyOfficeMode from "@/components/FamilyOfficeMode";
import FutureWorldsPanel from "@/components/FutureWorldsPanel";
import { getBestMoveRecommendation, type BestMoveLedger } from "@/lib/bestMoveEngine";
import DepositPowerCard from "@/components/DepositPowerCard";
import FIREPathCard from "@/components/FIREPathCard";
import TaxAlphaCard from "@/components/TaxAlphaCard";
import RiskRadarCard from "@/components/RiskRadarCard";
import KpiCard from "@/components/KpiCard";
import WealthFlowBanner from "@/components/WealthFlowBanner";
import ExecutiveDashboard from "@/components/ExecutiveDashboard";
import DeepDiveSection from "@/components/DeepDiveSection";
import { Link, useLocation } from "wouter";
import { useForecastStore } from "@/lib/forecastStore";
import { useForecastAssumptions } from "@/lib/useForecastAssumptions";
import familyImg from "@assets/family.jpeg";

// ─── Chart tooltips ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="db-tooltip">
        <p className="db-tooltip-label">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }} className="db-tooltip-row">
            {p.name}: {formatCurrency(p.value, true)}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// ─── Shared cashflow tooltip data builder ─────────────────────────────────────
// Used by both CashflowTooltip (desktop) and MobileChartSheet (mobile)
const buildCFTooltipRows = (d: any) => {
  const mainRows = [
    { label: "Opening Cash",        value: d.openingBalance ?? 0,    color: "hsl(215,15%,55%)" },
    { label: "Income",              value: d.income    ?? 0,         color: "hsl(142,60%,52%)" },
    { label: "Expenses",            value: -(d.expenses ?? 0),       color: "hsl(0,72%,58%)" },
    { label: "Debt Payments",       value: -(d.mortgage ?? 0),       color: "hsl(20,75%,58%)" },
    { label: "Property Purchases",  value: -(d.propPurchases ?? 0),  color: "hsl(188,60%,48%)" },
    { label: "Stock Purchases",     value: -(d.stockPurchases ?? 0), color: "hsl(210,80%,65%)" },
    { label: "Crypto Purchases",    value: -(d.cryptoPurchases ?? 0),color: "hsl(262,60%,65%)" },
    { label: "Tax Refund",          value: d.ngRefund  ?? 0,         color: "hsl(43,90%,58%)" },
    { label: "Net Cashflow",        value: d.netCF     ?? 0,         color: (d.netCF ?? 0) >= 0 ? "hsl(142,60%,52%)" : "hsl(0,72%,58%)", bold: true },
    { label: "Closing Cash",        value: d.balance   ?? 0,         color: (d.balance ?? 0) >= 0 ? "hsl(210,80%,65%)" : "hsl(0,65%,58%)",  bold: true },
  ].filter((r: any) => Math.abs(r.value) > 0);

  // closingCashForDP = same Closing Cash figure from cashEngine (includes all purchases/events).
  // This is the ONLY cash figure used in deposit power — no separate "projected cash" accumulation.
  const closingCash = d.closingCashForDP ?? d.balance ?? 0;
  const pporEq      = d.pporUsableEquity ?? 0;
  const ipEq        = d.ipUsableEquity   ?? 0;
  const eBuf        = d.emergencyBufferAmt ?? 0;
  // Show deposit power section whenever we have equity data (cash can be negative — that's valid)
  const hasEquityData = (pporEq > 0 || ipEq > 0);
  // rawTotal can be negative when closing cash is very negative — shows the real picture
  const rawTotal    = closingCash + pporEq + ipEq;
  const finalDP     = d.totalDepositPower ?? 0;
  const cashIsNegative = closingCash < 0;
  const milestones: { icon: string; text: string }[] = d._milestones ?? [];
  // Expose closingCash as projCash for legacy display references
  const projCash = closingCash;
  return { mainRows, hasEquityData, projCash, closingCash, pporEq, ipEq, eBuf, rawTotal, finalDP, cashIsNegative, milestones };
};

// ─── Executive Cashflow Tooltip (DESKTOP ONLY) ────────────────────────────────
const CashflowTooltip = ({ active, payload, label }: any) => {
  // On mobile, suppress desktop tooltip — MobileChartSheet handles it instead
  if (typeof window !== "undefined" && window.innerWidth < 768) return null;
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload ?? {};
  const { mainRows, hasEquityData, projCash, closingCash, pporEq, ipEq, eBuf, rawTotal, finalDP, cashIsNegative, milestones } = buildCFTooltipRows(d);
  return (
    <div className="db-cf-tooltip">
      <p style={{ fontSize: 12, fontWeight: 700, color: "hsl(var(--foreground))", marginBottom: 8, letterSpacing: "0.03em" }}>{label}</p>
      {mainRows.map((r: any, i: number) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 3, color: r.color, fontWeight: r.bold ? 700 : 400, fontSize: r.bold ? 12 : 11 }}>
          <span style={{ opacity: r.bold ? 1 : 0.85 }}>{r.label}</span>
          <span style={{ fontFamily: "monospace" }}>{r.value >= 0 ? "+" : ""}{formatCurrency(r.value, true)}</span>
        </div>
      ))}
      {hasEquityData && (
        <div className="db-cf-divider" style={{ marginTop: 10, paddingTop: 10 }}>
          <div style={{ fontSize: 10, color: "hsl(188,60%,52%)", marginBottom: 6, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
            Deposit Power Build-up ({label})
          </div>
          {/* Closing cash — always shown, can be negative (this IS the reconciled cashEngine figure) */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3, color: closingCash >= 0 ? "hsl(210,80%,65%)" : "hsl(0,65%,58%)", fontSize: 11 }}>
            <span style={{ opacity: 0.90 }}>+ Closing Cash (after all events)</span>
            <span style={{ fontFamily: "monospace" }}>{closingCash >= 0 ? "" : ""}{formatCurrency(closingCash, true)}</span>
          </div>
          {[
            pporEq > 0 ? { label: "PPOR Usable Equity (80%)", value: pporEq, color: "hsl(188,60%,52%)" } : null,
            ipEq   > 0 ? { label: "IP Usable Equity (80%)",   value: ipEq,   color: "hsl(145,55%,42%)" } : null,
          ].filter(Boolean).map((r: any, i: number) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3, color: r.color, fontSize: 11 }}>
              <span style={{ opacity: 0.90 }}>+ {r.label}</span>
              <span style={{ fontFamily: "monospace" }}>{formatCurrency(r.value, true)}</span>
            </div>
          ))}
          <div className="db-cf-divider-dashed" style={{ margin: "5px 0 4px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3, color: "hsl(215,15%,65%)", fontSize: 11 }}>
            <span>= Gross total (cash + equity)</span>
            <span style={{ fontFamily: "monospace" }}>{formatCurrency(rawTotal, true)}</span>
          </div>
          {eBuf > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3, color: "hsl(0,65%,58%)", fontSize: 11 }}>
              <span>&#8722; Emergency Buffer</span>
              <span style={{ fontFamily: "monospace" }}>&#8722;{formatCurrency(eBuf, true)}</span>
            </div>
          )}
          <div className="db-cf-dp-total" style={{ display: "flex", justifyContent: "space-between", gap: 16, marginTop: 5 }}>
            <span style={{ color: "hsl(43,90%,62%)", fontWeight: 700, fontSize: 12 }}>= Total Deposit Power</span>
            <span style={{ fontFamily: "monospace", color: "hsl(43,90%,62%)", fontWeight: 700, fontSize: 12 }}>{formatCurrency(finalDP, true)}</span>
          </div>
          {cashIsNegative && finalDP > 0 && (
            <div className="db-cf-dp-warning" style={{ marginTop: 6, padding: "5px 8px", fontSize: 10, color: "hsl(var(--gold-light))", lineHeight: 1.5 }}>
              &#9888; Cash is negative after events this year. Deposit Power is still positive because refinanceable equity covers the shortfall &#8212; drawing it down requires a loan top-up or refinance.
            </div>
          )}
        </div>
      )}
      {milestones.length > 0 && (
        <div className="db-cf-divider" style={{ marginTop: 8, paddingTop: 8 }}>
          {milestones.map((m: any, i: number) => (
            <div key={i} style={{ fontSize: 11, color: "hsl(43,90%,62%)", marginTop: 3 }}>{m.icon} {m.text}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Mobile Bottom Sheet ─────────────────────────────────────────────────────
// Renders a native-app-feel fixed bottom-sheet when user taps a chart point on mobile.
// Completely outside the chart container — never overflows, always in viewport.
const MobileChartSheet = ({
  data, onClose,
}: { data: { label: string; payload: any } | null; onClose: () => void }) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const [dragY, setDragY] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") triggerClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [data]);

  useEffect(() => {
    if (data) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [data]);

  const triggerClose = () => {
    setLeaving(true);
    setTimeout(() => { setLeaving(false); setDragY(0); onClose(); }, 270);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0) setDragY(delta);
  };
  const handleTouchEnd = () => {
    if (dragY > 72) { triggerClose(); } else { setDragY(0); }
  };

  if (!data) return null;
  const d = data.payload ?? {};
  const label = data.label ?? "—";

  // Guard: if payload is completely empty (no balance, no income, no equity) flag as broken
  const payloadOk = (
    d.balance !== undefined ||
    d.income  !== undefined ||
    d.pporUsableEquity !== undefined ||
    d.closingCashForDP !== undefined
  );

  const { mainRows, hasEquityData, projCash, closingCash, pporEq, ipEq, eBuf, rawTotal, finalDP, cashIsNegative, milestones } =
    payloadOk ? buildCFTooltipRows(d) : { mainRows: [], hasEquityData: false, projCash: 0, closingCash: 0, pporEq: 0, ipEq: 0, eBuf: 0, rawTotal: 0, finalDP: 0, cashIsNegative: false, milestones: [] };

  const translateY = leaving ? "100%" : dragY > 0 ? `${dragY}px` : "0";
  const transition = dragY > 0 ? "none" : "transform 0.27s cubic-bezier(0.32,0.72,0,1)";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={triggerClose}
        className="db-cf-backdrop"
        style={{ opacity: leaving ? 0 : 1 }}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="db-cf-sheet"
        style={{
          position: "fixed",
          left: 0, right: 0, bottom: 0,
          zIndex: 9999,
          transform: `translateY(${translateY})`,
          transition,
          borderRadius: "20px 20px 0 0",
          maxHeight: "72vh",
          display: "flex",
          flexDirection: "column",
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          boxShadow: "0 -8px 32px rgba(0,0,0,0.25)",
        }}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 6px", flexShrink: 0 }}>
          <div className="db-cf-sheet-drag" style={{ width: 40, height: 4, borderRadius: 2 }} />
        </div>

        {/* Header */}
        <div className="db-cf-sheet-header" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "2px 20px 12px",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "hsl(var(--foreground))", letterSpacing: "-0.02em" }}>{label}</span>
          <button onClick={triggerClose} className="db-cf-sheet-close">&#xd7;</button>
        </div>

        {/* Scrollable content */}
        <div style={{ overflowY: "auto", flex: 1, padding: "14px 20px 4px", WebkitOverflowScrolling: "touch" as any }}>

          {/* Empty state — payload failed to load */}
          {!payloadOk && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 0", gap: 10 }}>
              <div style={{ fontSize: 28 }}>⚠️</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "hsl(43,90%,62%)" }}>No data for {label}</div>
              <div style={{ fontSize: 12, color: "hsl(215,12%,50%)", textAlign: "center", lineHeight: 1.5 }}>
                Chart data for this year hasn't loaded yet.<br/>Try scrolling back and tapping again.
              </div>
            </div>
          )}

          {/* Cashflow section */}
          {payloadOk && (
            <div style={{ marginBottom: 6 }}>
              <div className="db-cf-section-label">Cashflow</div>
              {mainRows.map((r: any, i: number) => (
                <div key={i} className={i < mainRows.length - 1 ? "db-cf-row" : ""} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "7px 0", color: r.color,
                }}>
                  <span style={{ fontSize: 14, fontWeight: r.bold ? 700 : 400, opacity: r.bold ? 1 : 0.88 }}>{r.label}</span>
                  <span style={{ fontSize: r.bold ? 15 : 14, fontFamily: "monospace", fontWeight: r.bold ? 700 : 500 }}>
                    {r.value >= 0 ? "+" : ""}{formatCurrency(r.value, true)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Deposit Power waterfall */}
          {hasEquityData && (
            <div className="db-cf-divider" style={{ marginTop: 16, paddingTop: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(188,60%,52%)", marginBottom: 8 }}>
                Deposit Power Build-up
              </div>

              {/* Closing cash */}
              <div className="db-cf-row" style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "6px 0",
                color: closingCash >= 0 ? "hsl(210,80%,65%)" : "hsl(0,65%,58%)",
              }}>
                <span style={{ fontSize: 14, opacity: 0.9 }}>+ Closing Cash (after events)</span>
                <span style={{ fontSize: 14, fontFamily: "monospace" }}>{formatCurrency(closingCash, true)}</span>
              </div>

              {[
                pporEq > 0 ? { label: "PPOR Usable Equity (80%)", value: pporEq, color: "hsl(188,60%,52%)" } : null,
                ipEq   > 0 ? { label: "IP Equity (80%)",            value: ipEq,   color: "hsl(145,55%,42%)" } : null,
              ].filter(Boolean).map((r: any, i: number) => (
                <div key={i} className="db-cf-row" style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "6px 0", color: r.color,
                }}>
                  <span style={{ fontSize: 14, opacity: 0.9 }}>+ {r.label}</span>
                  <span style={{ fontSize: 14, fontFamily: "monospace" }}>{formatCurrency(r.value, true)}</span>
                </div>
              ))}

              <div className="db-cf-row" style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", color: "hsl(var(--muted-foreground))" }}>
                <span style={{ fontSize: 13 }}>= Gross total (cash + equity)</span>
                <span style={{ fontSize: 13, fontFamily: "monospace" }}>{formatCurrency(rawTotal, true)}</span>
              </div>
              {eBuf > 0 && (
                <div className="db-cf-row" style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", color: "hsl(0,65%,58%)" }}>
                  <span style={{ fontSize: 13 }}>&#8722; Emergency Buffer</span>
                  <span style={{ fontSize: 13, fontFamily: "monospace" }}>&#8722;{formatCurrency(eBuf, true)}</span>
                </div>
              )}
              <div className="db-cf-dp-total" style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginTop: 10, padding: "10px 14px", borderRadius: 12,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--gold-light))" }}>= Total Deposit Power</span>
                <span style={{ fontSize: 16, fontFamily: "monospace", fontWeight: 800, color: "hsl(var(--gold-light))" }}>{formatCurrency(finalDP, true)}</span>
              </div>
              {cashIsNegative && finalDP > 0 && (
                <div className="db-cf-dp-warning" style={{
                  marginTop: 8, padding: "9px 12px", borderRadius: 10,
                  fontSize: 12, color: "hsl(var(--gold-light))", lineHeight: 1.65,
                }}>
                  &#9888; Cash is negative after this year&#39;s events (property/stock purchases). Deposit Power is still positive because refinanceable equity covers the gap &#8212; drawing it down requires a loan top-up or refinance.
                </div>
              )}
            </div>
          )}

          {/* Milestones */}
          {milestones.length > 0 && (
            <div className="db-cf-divider" style={{ marginTop: 16, paddingTop: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "hsl(43,90%,55%)", marginBottom: 8 }}>
                Events this period
              </div>
              {milestones.map((m: any, i: number) => (
                <div key={i} style={{ fontSize: 14, color: "hsl(43,90%,62%)", marginBottom: 6, lineHeight: 1.4 }}>{m.icon} {m.text}</div>
              ))}
            </div>
          )}

          <div style={{ height: 12 }} />
        </div>
      </div>
    </>
  );
};


const DonutTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="db-tooltip">
      <p className="db-tooltip-label">{payload[0].name}</p>
      <p style={{ color: payload[0].payload.fill }} className="db-tooltip-row">
        {formatCurrency(payload[0].value, true)} ({payload[0].payload.pct?.toFixed(1)}%)
      </p>
    </div>
  );
};

// ─── Milestone dot for executive CF chart ─────────────────────────────────────
const MilestoneDot = (props: any) => {
  const { cx, cy, payload } = props;
  const ms: any[] = payload?._milestones ?? [];
  if (!ms.length) return null;
  const isIP     = ms.some((m: any) => m.type === "property");
  const isStock  = ms.some((m: any) => m.type === "stock");
  const isCrypto = ms.some((m: any) => m.type === "crypto");
  const isTax    = ms.some((m: any) => m.type === "tax");
  const isDebt   = ms.some((m: any) => m.type === "debt");
  const color = isIP ? "hsl(188,65%,52%)" : isStock ? "hsl(210,80%,65%)" : isCrypto ? "hsl(262,70%,65%)" : isTax ? "hsl(43,90%,58%)" : isDebt ? "hsl(142,60%,52%)" : "hsl(42,80%,52%)";
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={color} fillOpacity={0.18} stroke={color} strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={3.5} fill={color} />
    </g>
  );
};

// ─── Year-by-Year Reconciliation Detail Panel ─────────────────────────────
const YearDetailPanel = ({ row, privacyMode, checkDelta, checkOk }: {
  row: any;
  privacyMode: boolean;
  checkDelta: number;
  checkOk: boolean;
}) => {
  const cb = row.cashBridge;
  const pb = row.propertyBridge;
  const lb = row.liabilityBridge;
  const pi = row.passiveIncomeBreakdown;
  const fmt  = (n: number | undefined) => maskValue(formatCurrency(n ?? 0, true), privacyMode);
  const sign = (n: number | undefined) => (n ?? 0) >= 0 ? "+" : "−";
  const abs  = (n: number | undefined) => Math.abs(n ?? 0);
  const cellRow = "flex items-center justify-between border-b border-border/30 py-1";
  const muted   = "text-muted-foreground";
  const card    = "rounded-lg border border-border bg-background/40 p-3";
  const heading = "text-[11px] font-bold uppercase tracking-wide mb-2 text-foreground flex items-center gap-1.5";

  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      {/* CASH BRIDGE */}
      <div className={card}>
        <div className={heading}><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Cash Bridge</div>
        {cb ? (
          <div className="text-[11px] font-mono">
            <div className={cellRow}><span className={muted}>Start cash</span><span>{fmt(cb.startCash)}</span></div>
            <div className={cellRow}><span className={muted}>+ Salary income</span><span className="text-emerald-400">{fmt(cb.income)}</span></div>
            <div className={cellRow}><span className={muted}>+ Rental income</span><span className="text-emerald-400">{fmt(cb.rentalIncome)}</span></div>
            <div className={cellRow}><span className={muted}>+ Tax refund (NG)</span><span className="text-emerald-400">{fmt(cb.taxRefundOrPayment)}</span></div>
            <div className={cellRow}><span className={muted}>− Living expenses</span><span className="text-red-400">{fmt(cb.livingExpenses)}</span></div>
            <div className={cellRow}><span className={muted}>− Recurring bills</span><span className="text-red-400">{fmt((cb as any).billsOutflow ?? 0)}</span></div>
            <div className={cellRow}><span className={muted}>− PPOR repayments</span><span className="text-red-400">{fmt(cb.pporRepayments)}</span></div>
            <div className={cellRow}><span className={muted}>− Investment loan repayments</span><span className="text-red-400">{fmt(cb.investmentRepayments)}</span></div>
            <div className={cellRow}><span className={muted}>− Property deposits</span><span className="text-red-400">{fmt(cb.propertyDeposits)}</span></div>
            <div className={cellRow}><span className={muted}>− Stamp duty / buying costs</span><span className="text-red-400">{fmt(cb.buyingCosts)}</span></div>
            <div className={cellRow}><span className={muted}>− Stock buys (planned)</span><span className="text-red-400">{fmt(cb.plannedStockBuys)}</span></div>
            <div className={cellRow}><span className={muted}>− Crypto buys (planned)</span><span className="text-red-400">{fmt(cb.plannedCryptoBuys)}</span></div>
            <div className={cellRow}><span className={muted}>− DCA outflows</span><span className="text-red-400">{fmt(cb.dcaOutflows)}</span></div>
            {(cb.other ?? 0) !== 0 && (
              <div className={cellRow}><span className={muted}>{sign(cb.other)} Other / unmodeled</span><span className="text-amber-400">{fmt(abs(cb.other))}</span></div>
            )}
            <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-border">
              <span className="font-bold text-foreground">End cash</span>
              <span className="font-bold text-amber-400">{fmt(cb.endCash)}</span>
            </div>
          </div>
        ) : <div className="text-[11px] text-muted-foreground">No cash bridge data.</div>}
      </div>

      {/* PROPERTY BRIDGE */}
      <div className={card}>
        <div className={heading}><span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />Property Value Bridge</div>
        {pb ? (
          <div className="text-[11px] font-mono">
            <div className={cellRow}><span className={muted}>Start value (PPOR + IP)</span><span>{fmt(pb.startValue)}</span></div>
            <div className={cellRow}><span className={muted}>+ Market growth</span><span className="text-emerald-400">{fmt(pb.marketGrowth)}</span></div>
            <div className={cellRow}><span className={muted}>+ New purchases</span><span className="text-blue-400">{fmt(pb.newPurchases)}</span></div>
            <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-border">
              <span className="font-bold text-foreground">End value</span>
              <span className="font-bold text-cyan-400">{fmt(pb.endValue)}</span>
            </div>
          </div>
        ) : <div className="text-[11px] text-muted-foreground">No property bridge data.</div>}
      </div>

      {/* LIABILITY BRIDGE */}
      <div className={card}>
        <div className={heading}><span className="w-1.5 h-1.5 rounded-full bg-red-400" />Liability Bridge</div>
        {lb ? (
          <div className="text-[11px] font-mono">
            <div className={cellRow}><span className={muted}>Opening debt</span><span>{fmt(lb.openingDebt)}</span></div>
            <div className={cellRow}><span className={muted}>+ New loans drawn</span><span className="text-red-400">{fmt(lb.newLoans)}</span></div>
            <div className={cellRow}><span className={muted}>− Principal repayments</span><span className="text-emerald-400">{fmt(lb.repayments)}</span></div>
            <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-border">
              <span className="font-bold text-foreground">Closing debt</span>
              <span className="font-bold text-red-400">{fmt(lb.closingDebt)}</span>
            </div>
          </div>
        ) : <div className="text-[11px] text-muted-foreground">No liability bridge data.</div>}
      </div>

      {/* PASSIVE INCOME + RECONCILIATION */}
      <div className={card}>
        <div className={heading}><span className="w-1.5 h-1.5 rounded-full bg-purple-400" />Passive Income (annual)</div>
        {pi ? (
          <div className="text-[11px] font-mono mb-3">
            <div className={cellRow}><span className={muted}>Net rent (after vacancy + mgmt)</span><span>{fmt(pi.netRent)}</span></div>
            <div className={cellRow}><span className={muted}>Dividends (≈2% of stocks)</span><span>{fmt(pi.dividends)}</span></div>
            <div className={cellRow}><span className={muted}>Crypto yield (≈1%)</span><span>{fmt(pi.cryptoYield)}</span></div>
            <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-border">
              <span className="font-bold text-foreground">Total passive / yr</span>
              <span className="font-bold text-purple-400">{fmt(pi.total)}</span>
            </div>
          </div>
        ) : <div className="text-[11px] text-muted-foreground mb-3">No passive income breakdown.</div>}

        <div className={`text-[10.5px] font-mono p-2 rounded border ${checkOk ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" : "border-amber-500/40 bg-amber-500/10 text-amber-400"}`}>
          <div className="font-bold mb-0.5">{checkOk ? "✓ Reconciled" : "⚠ Mismatch"}</div>
          <div>Total Assets − Liabilities = End NW</div>
          <div className="opacity-80">delta = {fmt(checkDelta)}</div>
        </div>
      </div>
    </div>
  );
};

export default function DashboardPage() {
  const qc = useQueryClient();
  const { chartView, setChartView, privacyMode, togglePrivacy, currentUser } = useAppStore();
  const { forecastMode, profile, monteCarloResult } = useForecastStore();
  const loadForecastFromSupabase = useForecastStore(s => s.loadFromSupabase);
  const fa = useForecastAssumptions();
  const [, navigate] = useLocation();

  // Pull latest forecast settings from Supabase on dashboard mount so values are
  // in sync across devices / fresh sessions.
  useEffect(() => {
    loadForecastFromSupabase().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [editSnap, setEditSnap] = useState(false);
  const [snapDraft, setSnapDraft] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(getLastSync);
  const [ngRefundMode, setNgRefundMode] = useState<"lump-sum" | "payg">("lump-sum");
  const [chartRange, setChartRange] = useState<"1Y" | "3Y" | "10Y" | "Scenario">("10Y");
  const [mainChartMode, setMainChartMode] = useState<"networth" | "cashflow">("cashflow");
  const [cfChartAnnotations, setCfChartAnnotations] = useState(true);
  const [wdcTab, setWdcTab] = useState<"CASH" | "EVENTS" | "WEALTH" | "RISK">("CASH");
  const [expandedYear, setExpandedYear] = useState<number | null>(null);
  const [wdcChartType, setWdcChartType] = useState<"combo" | "line" | "candlestick">("combo");
  const [cfViewMode, setCfViewMode] = useState<"cash" | "equity" | "deposit">("cash");
  // Mobile chart bottom-sheet tooltip state
  const [mobileTooltipData, setMobileTooltipData] = useState<{ label: string; payload: any } | null>(null);

  // Shared tap handler for ALL chart variants on mobile.
  // chartData = Recharts SyntheticEvent from onClick prop.
  // On candlestick the data is an inline-mapped array — payload still has all ...d fields spread in.
  const handleChartTap = (chartData: any) => {
    if (typeof window === "undefined" || window.innerWidth >= 768) return;
    if (!chartData?.activePayload?.length) return;
    const raw = chartData.activePayload[0]?.payload ?? {};
    // Guard: at minimum we need a label. Fall back to activeLabel.
    const label = raw.label ?? chartData.activeLabel ?? "";
    if (!label && !raw.balance && !raw.income) return; // truly empty — ignore
    setMobileTooltipData({ label, payload: raw });
  };
  const [maxRefinanceLVR, setMaxRefinanceLVR] = useState<number>(0.80);
  const [emergencyBuffer, setEmergencyBuffer] = useState<number>(30000);
  const [showLedgerAudit, setShowLedgerAudit] = useState(false);
  // Deterministic year-by-year table is a secondary baseline view. It is
  // collapsed by default so it does not visually compete with the canonical
  // Monte Carlo projection above it. See PR: dashboard projection
  // single-source-of-truth fix.
  const [showDeterministicProjection, setShowDeterministicProjection] = useState(false);
  const cashFlowView = chartView;

  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSaveSnapCallback = useCallback(async () => {
    if (!snapDraft) return;
    if (saveDebounceRef.current) return;
    saveDebounceRef.current = setTimeout(() => { saveDebounceRef.current = null; }, 300);
    await updateSnap.mutateAsync(snapDraft);
    setEditSnap(false);
    setSnapDraft(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapDraft]);

  const snapContainerRef = useSaveOnEnter(handleSaveSnapCallback, editSnap);

  // ─── Data fetching ────────────────────────────────────────────────────────
  const handleSyncFromCloud = useCallback(async () => {
    setSyncing(true);
    try {
      await syncFromCloud();
      await qc.invalidateQueries();
      setLastSync(getLastSync());
    } finally {
      setSyncing(false);
    }
  }, [qc]);

  const { data: snapshot, isLoading: snapLoading } = useQuery({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot").then((r) => r.json()),
  });
  const { data: properties = [] } = useQuery({
    queryKey: ["/api/properties"],
    queryFn: () => apiRequest("GET", "/api/properties").then((r) => r.json()),
  });
  const { data: stocks = [] } = useQuery({
    queryKey: ["/api/stocks"],
    queryFn: () => apiRequest("GET", "/api/stocks").then((r) => r.json()),
  });
  const { data: cryptos = [] } = useQuery({
    queryKey: ["/api/crypto"],
    queryFn: () => apiRequest("GET", "/api/crypto").then((r) => r.json()),
  });
  const { data: expenses = [] } = useQuery({
    queryKey: ["/api/expenses"],
    queryFn: () => apiRequest("GET", "/api/expenses").then((r) => r.json()),
  });
  const { data: incomeRecords = [] } = useQuery<any[]>({
    queryKey: ["/api/income"],
    queryFn: () => apiRequest("GET", "/api/income").then((r) => r.json()),
  });
  const { data: billsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/bills"],
    queryFn: () => apiRequest("GET", "/api/bills").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: budgetsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/budgets"],
    queryFn: () => apiRequest("GET", "/api/budgets").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: alertLogsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/alert-logs"],
    queryFn: () => apiRequest("GET", "/api/alert-logs").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: stockTransactionsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/stock-transactions"],
    queryFn: () => apiRequest("GET", "/api/stock-transactions").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: cryptoTransactionsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto-transactions"],
    queryFn: () => apiRequest("GET", "/api/crypto-transactions").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: stockDCASchedules = [] } = useQuery<any[]>({
    queryKey: ["/api/stock-dca"],
    queryFn: () => apiRequest("GET", "/api/stock-dca").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: cryptoDCASchedules = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto-dca"],
    queryFn: () => apiRequest("GET", "/api/crypto-dca").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: ordersRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/planned-investments", "stock"],
    queryFn: () => apiRequest("GET", "/api/planned-investments?module=stock").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: cryptoOrdersRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/planned-investments", "crypto"],
    queryFn: () => apiRequest("GET", "/api/planned-investments?module=crypto").then((r) => r.json()),
    staleTime: 0,
  });
  const { data: holdingsRaw = [] } = useQuery<any[]>({
    queryKey: ["/api/holdings"],
    queryFn: () => apiRequest("GET", "/api/holdings").then((r) => r.json()),
    staleTime: 0,
  });

  const updateSnap = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/snapshot", data).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/snapshot"] }),
  });

  // ─── Derived data ─────────────────────────────────────────────────────────
  const plannedStockTx = useMemo(() => (stockTransactionsRaw ?? []).filter((t: any) => t.status === "planned"), [stockTransactionsRaw]);
  const plannedCryptoTx = useMemo(() => (cryptoTransactionsRaw ?? []).filter((t: any) => t.status === "planned"), [cryptoTransactionsRaw]);
  const plannedStockOrders = useMemo(() => (ordersRaw ?? []).filter((o: any) => o.status !== "cancelled"), [ordersRaw]);
  const plannedCryptoOrders = useMemo(() => (cryptoOrdersRaw ?? []).filter((o: any) => o.status !== "cancelled"), [cryptoOrdersRaw]);

  const SNAP_ZERO = {
    ppor: 0, cash: 0, offset_balance: 0, savings_cash: 0, emergency_cash: 0, other_cash: 0,
    super_balance: 0, super_roham: 0, super_fara: 0, cars: 0, iran_property: 0,
    mortgage: 0, other_debts: 0, monthly_income: 0, monthly_expenses: 0,
    mortgage_rate: 6.5, mortgage_term_years: 30,
  };

  const snap = useMemo(() => {
    if (!snapshot) return SNAP_ZERO;
    const s: any = snapshot;

    // ── Super: schema columns are roham_super_balance / fara_super_balance ──
    // Legacy code referenced super_roham / super_fara which no longer exist on
    // sf_snapshot. Read the per-person balances and fall back to the legacy
    // names + the aggregate super_balance for backward compatibility.
    const superRoham = safeNum(
      s.roham_super_balance ?? s.super_roham ?? 0
    );
    const superFara  = safeNum(
      s.fara_super_balance  ?? s.super_fara  ?? 0
    );
    // If master super_balance is 0 but per-person balances exist, surface the sum.
    const superMaster = safeNum(s.super_balance);
    const superTotal  = superMaster > 0 ? superMaster : (superRoham + superFara);

    // ── Income: master monthly_income may be 0 while sub-fields hold the truth ──
    // Order of precedence: master snapshot field → sum of sub-fields → derived
    // from the last 6 months of sf_income transactions (handled below).
    const masterIncome = safeNum(s.monthly_income);
    const subIncomeMonthly =
      safeNum(s.roham_monthly_income) +
      safeNum(s.fara_monthly_income) +
      safeNum(s.rental_income_total) +
      safeNum(s.other_income);
    let monthlyIncome = masterIncome > 0 ? masterIncome : subIncomeMonthly;

    // Fallback: derive from sf_income transactions in the last 6 months.
    // Only used if both master + sub-fields are zero so user-entered values
    // always take precedence.
    if (monthlyIncome === 0 && Array.isArray(incomeRecords) && incomeRecords.length > 0) {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const cutoff = sixMonthsAgo.toISOString().split('T')[0];
      const recent = incomeRecords.filter((r: any) => (r.date ?? '') >= cutoff);
      const total  = recent.reduce((sum: number, r: any) => sum + safeNum(r.amount), 0);
      if (total > 0) monthlyIncome = Math.round(total / 6);
    }

    // ── Expenses: master monthly_expenses may be 0; derive from sf_expenses ──
    const masterExpenses = safeNum(s.monthly_expenses);
    let monthlyExpenses = masterExpenses;
    if (monthlyExpenses === 0 && Array.isArray(expenses) && expenses.length > 0) {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const cutoff = sixMonthsAgo.toISOString().split('T')[0];
      const recent = expenses.filter((e: any) => (e.date ?? '') >= cutoff);
      const total  = recent.reduce((sum: number, e: any) => sum + safeNum(e.amount), 0);
      if (total > 0) monthlyExpenses = Math.round(total / 6);
    }

    return {
      ppor:             safeNum(s.ppor),
      // Everyday cash (transaction/chequing account)
      cash:             safeNum(s.cash),
      // Cash split buckets — stored separately in the ledger
      offset_balance:   safeNum(s.offset_balance),
      savings_cash:     safeNum(s.savings_cash),
      emergency_cash:   safeNum(s.emergency_cash),
      other_cash:       safeNum(s.other_cash),
      super_balance:    superTotal,
      super_roham:      superRoham,
      super_fara:       superFara,
      cars:             safeNum(s.cars),
      iran_property:    safeNum(s.iran_property),
      // Manual portfolio totals on the snapshot itself — these are user-entered
      // aggregates (e.g. “I have \$50k in stocks”) that should be surfaced when
      // the per-ticker holdings tables are empty.
      stocks:           safeNum(s.stocks),
      crypto:           safeNum(s.crypto),
      other_assets:     safeNum(s.other_assets),
      mortgage:         safeNum(s.mortgage),
      other_debts:      safeNum(s.other_debts),
      monthly_income:   monthlyIncome,
      monthly_expenses: monthlyExpenses,
      mortgage_rate:    safeNum(s.mortgage_rate) || 6.5,
      mortgage_term_years: safeNum(s.mortgage_term_years) || 30,
    };
  }, [snapshot, incomeRecords, expenses]);

  // ─── Dashboard data-contract inputs ──────────────────────────────────────
  // SOURCE-OF-TRUTH: docs/DASHBOARD_DATA_CONTRACT.md +
  //                  client/src/lib/dashboardDataContract.ts
  // Every KPI card derived below MUST go through a selector imported from
  // the contract module. The regression script
  // (`script/test-dashboard-contract.ts`) fails the build if any selector
  // stops binding to the documented Supabase fields. Do not bypass the
  // selectors with inline calculations — that is exactly the class of bug
  // that produced silent $0 cards in production.
  const _contractInputs: DashboardInputs = useMemo(() => ({
    snapshot, properties, stocks, cryptos,
    holdingsRaw, incomeRecords, expenses,
  }), [snapshot, properties, stocks, cryptos, holdingsRaw, incomeRecords, expenses]);

  // ─── Live stocks / crypto value (delegates to data contract) ────────────
  // Bug pre-fix: the dashboard only summed the unified holdings API and a
  // non-existent `current_value` column on sf_stocks, producing 0 for users
  // who entered values via the manual snapshot form. The selector now reads
  // all three sources (unified holdings → per-ticker market value → manual
  // snapshot aggregate) and returns the highest available, so manual
  // entries are never silently overridden by an empty live feed.
  const stocksTotal = contractStocksTotal(_contractInputs);
  const cryptoTotal = contractCryptoTotal(_contractInputs);

  const _totalSuperNow = snap.super_roham + snap.super_fara;

  // ─── Core financials ──────────────────────────────────────────────────────
  // Total liquid cash = all cash buckets from the ledger (no forecast, no fallback)
  // Formula: Everyday Cash + Savings Cash + Emergency Cash + Other Cash + Offset Balance
  // Dedup guard: if other_cash === offset_balance it was contaminated by old data — zero it
  const _safeOtherCash = (snap.other_cash > 0 && snap.other_cash === snap.offset_balance) ? 0 : snap.other_cash;
  const totalLiquidCash = snap.cash + snap.savings_cash + snap.emergency_cash + _safeOtherCash + snap.offset_balance;

  // ─── Investment property aggregates (delegates to data contract) ─────────
  // SOURCE-OF-TRUTH: docs/DASHBOARD_DATA_CONTRACT.md →
  //   property_equity / debt_balance / total_investments
  // All IP/stocks/crypto/property-equity logic lives in the contract module.
  const _settledIPs           = useMemo(() => selectSettledIPs(_contractInputs), [_contractInputs]);
  const _plannedIPs           = useMemo(() => selectPlannedIPs(_contractInputs), [_contractInputs]);
  const ipCurrentValueSettled = selectIpCurrentValueSettled(_contractInputs);
  const ipLoanBalanceSettled  = selectIpLoanBalanceSettled(_contractInputs);
  const ipEquitySettled       = ipCurrentValueSettled - ipLoanBalanceSettled;
  const ipCurrentValuePlanned = selectIpCurrentValuePlanned(_contractInputs);
  const ipLoanBalancePlanned  = selectIpLoanBalancePlanned(_contractInputs);

  // PPOR equity from snapshot (separate from IP equity)
  const _ppoEquity = snap.ppor - snap.mortgage;

  // Audit fix P1.1: NW now flows through the canonical selector so the
  // dashboard, engine, and PDF all read from the same single source of truth.
  // Previously the inline math here silently diverged from the decision engine
  // (which excluded cars/iran_property/other_debts).
  const canonicalNw: CanonicalNetWorth = selectCanonicalNetWorth(_contractInputs);
  const totalAssets   = canonicalNw.totalAssets;
  const totalLiab     = canonicalNw.totalLiabilities;
  const netWorth      = canonicalNw.netWorth;
  // Combined property equity = PPOR equity + settled-IP equity (matches Total Assets / Liab)
  const propertyEquity = selectPropertyEquity(_contractInputs);

  // Data-availability flags drive the "actual balances missing" banner below.
  const dataAvailability = useMemo(() =>
    evaluateDataAvailability(_contractInputs),
  [_contractInputs]);

  // ─── [Dashboard] Diagnostic logs (TEMPORARY) ───────────────────────────────
  // Surface every input that drives the four KPI cards so the user can verify
  // exactly what the dashboard is reading. Remove once the source-of-truth for
  // current balances is confirmed and stable.
  if (typeof window !== 'undefined' && snapshot) {
    /* eslint-disable no-console */
    // Per-source breakdowns are computed locally for the diagnostic log only;
    // the headline figures above are the contract selectors' results.
    const _diagLiveStocks  = (holdingsRaw ?? []).filter((h: any) => h.asset_type === 'stock').reduce((s: number, h: any) => s + safeNum(h.current_value), 0);
    const _diagLiveCrypto  = (holdingsRaw ?? []).filter((h: any) => h.asset_type === 'crypto').reduce((s: number, h: any) => s + safeNum(h.current_value), 0);
    const _diagTickerStocks = (stocks ?? []).reduce((s: number, x: any) => s + safeNum(x.current_value ?? safeNum(x.current_price) * safeNum(x.current_holding)), 0);
    const _diagTickerCrypto = (cryptos ?? []).reduce((s: number, x: any) => s + safeNum(x.current_value ?? safeNum(x.current_price) * safeNum(x.current_holding)), 0);
    console.groupCollapsed('[Dashboard] KPI calculation inputs');
    console.log('TOTAL INVESTMENTS', {
      result_value: stocksTotal + cryptoTotal + ipCurrentValueSettled,
      stocksTotal, cryptoTotal, ipCurrentValueSettled,
      sources: {
        liveStocks: _diagLiveStocks, tickerStocksValue: _diagTickerStocks, snap_stocks: snap.stocks,
        liveCrypto: _diagLiveCrypto, tickerCryptoValue: _diagTickerCrypto, snap_crypto: snap.crypto,
        settled_ip_count: _settledIPs.length,
        planned_ip_count: _plannedIPs.length,
        planned_ip_value: ipCurrentValuePlanned,
      },
    });
    console.log('PROPERTY EQUITY', {
      result_value: propertyEquity,
      ppor_equity: _ppoEquity,
      ip_equity_settled: ipEquitySettled,
      sources: {
        ppor: snap.ppor, mortgage: snap.mortgage,
        ipCurrentValueSettled, ipLoanBalanceSettled,
        ipCurrentValuePlanned, ipLoanBalancePlanned,
      },
    });
    console.log('DEBT BALANCE', {
      result_value: totalLiab,
      sources: {
        snap_mortgage: snap.mortgage,
        snap_other_debts: snap.other_debts,
        ipLoanBalanceSettled, ipLoanBalancePlanned,
      },
    });
    console.log('SNAPSHOT_RAW (key fields)', {
      ppor: (snapshot as any)?.ppor, mortgage: (snapshot as any)?.mortgage,
      stocks: (snapshot as any)?.stocks, crypto: (snapshot as any)?.crypto,
      other_assets: (snapshot as any)?.other_assets,
      other_debts: (snapshot as any)?.other_debts,
      super_balance: (snapshot as any)?.super_balance,
      roham_super_balance: (snapshot as any)?.roham_super_balance,
      fara_super_balance: (snapshot as any)?.fara_super_balance,
    });
    console.log('PROPERTIES_RAW', (properties as any[] ?? []).map((p: any) => ({
      id: p.id, name: p.name, type: p.type,
      current_value: p.current_value, loan_amount: p.loan_amount,
      settlement_date: p.settlement_date, weekly_rent: p.weekly_rent,
    })));
    console.log('STOCKS_RAW', (stocks ?? []).map((x: any) => ({
      ticker: x.ticker, current_price: x.current_price,
      current_holding: x.current_holding,
      mv: safeNum(x.current_price) * safeNum(x.current_holding),
    })));
    console.log('CRYPTO_RAW', (cryptos ?? []).map((x: any) => ({
      symbol: x.symbol, current_price: x.current_price,
      current_holding: x.current_holding,
      mv: safeNum(x.current_price) * safeNum(x.current_holding),
    })));
    console.log('HOLDINGS_RAW (unified API)', (holdingsRaw ?? []));
    console.groupEnd();
    /* eslint-enable no-console */
  }
  // ─── MONTHLY SURPLUS — single-source-of-truth derivation ────────────────
  // SOURCE-OF-TRUTH: docs/DASHBOARD_DATA_CONTRACT.md → monthly_surplus +
  //                  client/src/lib/dashboardDataContract.ts SOURCE_OF_TRUTH map.
  //
  // Prior bug (May 2026 "$17K surplus"):
  //   const surplus = snap.monthly_income - snap.monthly_expenses;
  //   const monthlyMortgageRepay = 0;
  // This silently:
  //   1. ate the manual sf_snapshot.monthly_expenses override (\$4,500) and
  //      ignored the \~\$15K/mo ledger truth; and
  //   2. assumed mortgage was already in `expenses`, which is false —
  //      sf_expenses categories never include mortgage P&I.
  //
  // New formula (enforced by selectors):
  //   surplus = monthlyIncome (ledger → sub-fields → master)
  //           − monthlyExpensesLedger (ledger → manual)
  //           − mortgageRepayment (PMT from debt module)
  //           − otherDebtRepayment (cards/personal loans)
  //           − settledIpDebtService (each IP loan amortised separately)
  const monthlyIncomeSOT       = selectMonthlyIncome(_contractInputs);
  const monthlyExpensesSOT     = selectMonthlyExpensesLedger(_contractInputs);
  const monthlyMortgageRepay   = selectMortgageRepayment(_contractInputs);
  const monthlyOtherDebtRepay  = selectOtherDebtRepayment(_contractInputs);
  const monthlyIpDebtService   = selectSettledIpDebtService(_contractInputs);
  const monthlyDebtServiceSOT  = selectMonthlyDebtService(_contractInputs);
  // True when expenses already include mortgage/debt rows (ledger has
  // "Housing / Mortgage", "Debt Repayment", etc.). In that case we MUST NOT
  // subtract debt again — doing so double-counts.
  const expensesIncludesDebt   = selectExpensesIncludesDebt(_contractInputs);
  // For downstream cards/charts that need the household's true monthly
  // outflow: when debt is already in expenses, outgoings == expenses;
  // otherwise add debt service.
  const totalMonthlyOutgoings  = expensesIncludesDebt
    ? monthlyExpensesSOT
    : monthlyExpensesSOT + monthlyDebtServiceSOT;
  const surplus                = selectMonthlySurplus(_contractInputs);
  const savingsRate            = calcSavingsRate(monthlyIncomeSOT, totalMonthlyOutgoings);

  // Down-stream forecasts/projections still reference snap.monthly_income
  // and snap.monthly_expenses. Rebind the surface of `snap` to the SOT values
  // so the entire page reads from the same single source. The original `snap`
  // memo still exposes the raw snapshot fields for any caller that needs
  // them explicitly (none below currently do).
  snap.monthly_income   = monthlyIncomeSOT;
  snap.monthly_expenses = monthlyExpensesSOT;

  // ─── NG Summary ───────────────────────────────────────────────────────────
  const ngSummary = useMemo<NGSummary>(() => {
    if (!snapshot) return { totalAnnualTaxBenefit: 0, perProperty: [] } as NGSummary;
    return calcNegativeGearing({ properties, annualSalaryIncome: snap.monthly_income * 12, refundMode: ngRefundMode });
  }, [snapshot, properties, snap.monthly_income, ngRefundMode]);

  // ─── Projection ───────────────────────────────────────────────────────────
  // BUG FIX: previously did NOT pass forecast assumptions → dashboard ignored
  // Conservative/Base/Aggressive/MonteCarlo selection. Now reads `fa` from
  // useForecastAssumptions() so changes in Forecast Engine flow through everywhere.
  const projection = useMemo(() => {
    if (!snapshot) return [];
    return projectNetWorth({
      snapshot: { ...snap, offset_balance: snap.offset_balance },
      expenses, properties,
      stocks: stocks ?? [],
      cryptos: cryptos ?? [],
      liveStocksValue: stocksTotal,
      liveCryptoValue: cryptoTotal,
      stockTransactions:  plannedStockTx,
      cryptoTransactions: plannedCryptoTx,
      stockDCASchedules, cryptoDCASchedules,
      plannedStockOrders, plannedCryptoOrders,
      bills: billsRaw as any[],
      ngRefundMode,
      ngAnnualBenefit: ngSummary.totalAnnualTaxBenefit,
      annualSalaryIncome: snap.monthly_income * 12,
      // Forecast assumptions — reactive to Forecast Engine selection
      years:             10,
      inflation:         fa.flat.inflation,
      ppor_growth:       fa.flat.property_growth,
      yearlyAssumptions: fa.yearly,
    });
  }, [snapshot, snap, properties, stocks, cryptos, plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders, fa, expenses, billsRaw, ngRefundMode, ngSummary.totalAnnualTaxBenefit]);
  const year10NW      = projection[9]?.endNetWorth || netWorth;
  // Passive income: rental from settled IPs + snapshot-level rental_income_total
  // + estimated dividends from current stock / crypto holdings.
  // "Settled" = settlement_date ≤ today (planned IPs still in the future are
  // surfaced in the card sub-text, never added to current passive income).
  const todayStr = new Date().toISOString().split('T')[0];
  const passiveIncome = useMemo(() => {
    const settledProperties = (properties ?? []).filter((p: any) =>
      p.type !== 'ppor' && p.type !== 'owner_occupied' &&
      (!p.settlement_date || p.settlement_date <= todayStr)
    );
    const annualRentalFromIPs = settledProperties.reduce((sum: number, p: any) => {
      const wRent = safeNum(p.weekly_rent);
      const vacancy = safeNum(p.vacancy_rate) || 0;
      const mgmt = safeNum(p.management_fee) || 0;
      return sum + wRent * 52 * (1 - vacancy / 100) * (1 - mgmt / 100);
    }, 0);
    // Manual rental override on the snapshot (annualises monthly rental_income_total)
    const annualRentalManual = safeNum((snapshot as any)?.rental_income_total) * 12;
    const annualRental = Math.max(annualRentalFromIPs, annualRentalManual);
    // Manual other-income override (treat as passive too)
    const annualOtherPassive = safeNum((snapshot as any)?.other_income) * 12;
    const annualDividends = stocksTotal * 0.02 + cryptoTotal * 0.01;
    const total = Math.round(annualRental + annualOtherPassive + annualDividends);
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('[Dashboard] PASSIVE INCOME', {
        result_value: total,
        annualRentalFromIPs, annualRentalManual,
        annualOtherPassive, annualDividends,
        sources: {
          settled_ip_count: settledProperties.length,
          rental_income_total_monthly: (snapshot as any)?.rental_income_total,
          other_income_monthly: (snapshot as any)?.other_income,
          stocksTotal, cryptoTotal,
        },
      });
    }
    return total;
  }, [properties, stocksTotal, cryptoTotal, todayStr, snapshot]);

  // ─── Equity Engine ─────────────────────────────────────────────────────────
  // Investment properties (all non-PPOR from /api/properties)
  // Used for FORECAST / equityTimeline — includes future planned IPs
  const ipPropertiesForEquity = useMemo(() =>
    (properties as any[]).filter((p: any) => p.type !== 'ppor' && p.type !== 'owner_occupied'),
  [properties]);

  // Current (settled/active) IPs only — used for TODAY SNAPSHOT deposit power
  // Excludes any IP whose settlement_date is in the future (planned but not yet owned)
  const currentIpProperties = useMemo(() =>
    (properties as any[]).filter((p: any) =>
      p.type !== 'ppor' &&
      p.type !== 'owner_occupied' &&
      (!(p as any).settlement_date || (p as any).settlement_date <= todayStr)
    ),
  [properties, todayStr]);

  const depositPowerResult = useMemo(() => {
    if (!snapshot) return null;
    return calcDepositPower({
      cash:            snap.cash,
      offset_balance:  snap.offset_balance,
      ppor_value:      snap.ppor,
      ppor_loan:       snap.mortgage,
      // Use currentIpProperties (settled only) so future planned IPs
      // do NOT inflate today's snapshot (IPs Held, IP Equity, Deposit Power)
      ipProperties:    currentIpProperties.map((p: any) => ({
        id:             p.id ?? p.address ?? 'ip',
        label:          p.label ?? (p.address ?? '').split(',')[0] ?? 'IP',
        current_value:  safeNum(p.current_value ?? p.purchase_price),
        loan_amount:    safeNum(p.loan_amount),
        max_refinance_lvr: maxRefinanceLVR,
      })),
      maxRefinanceLVR,
      emergencyBuffer,
      monthlySurplus:  Math.max(0, surplus),
      // Next property assumptions — use the first unconfirmed IP plan, or defaults
      nextPropertyPrice: (() => {
        const nextIP = (properties as any[]).find((p: any) =>
          p.type !== 'ppor' && (!p.settlement_date || p.settlement_date > new Date().toISOString().split('T')[0])
        );
        return safeNum(nextIP?.purchase_price) || 900000;
      })(),
    });
  }, [snapshot, snap, currentIpProperties, maxRefinanceLVR, emergencyBuffer, surplus, properties]);

  // Equity timeline (10 years)
  const equityTimeline = useMemo(() => {
    if (!snapshot) return [];
    return projectEquityTimeline({
      cash:            snap.cash,
      offset_balance:  snap.offset_balance,
      ppor_value:      snap.ppor,
      ppor_loan:       snap.mortgage,
      ppor_growth_rate:    (fa.flat.property_growth ?? 6) / 100,
      ppor_mortgage_rate:  (snap.mortgage_rate ?? 6.5) / 100,
      ppor_term_years:     snap.mortgage_term_years ?? 30,
      ipProperties: ipPropertiesForEquity.map((p: any) => ({
        current_value: safeNum(p.current_value ?? p.purchase_price),
        loan_amount:   safeNum(p.loan_amount),
        growth_rate:   (fa.flat.property_growth ?? 6) / 100,
        mortgage_rate: (snap.mortgage_rate ?? 6.5) / 100,
      })),
      monthly_surplus:  Math.max(0, surplus),
      maxRefinanceLVR,
      emergencyBuffer,
      years: 10,
    });
  }, [snapshot, snap, ipPropertiesForEquity, fa.flat.property_growth, surplus, maxRefinanceLVR, emergencyBuffer]);

  // Planned investment grouped totals (fix $0 bug)
  const plannedStockTotal = useMemo(() => {
    const now = new Date();
    return (ordersRaw as any[]).filter((o: any) =>
      (o.status === 'planned' || o.status === 'pending') && o.planned_date
    ).reduce((s: number, o: any) => s + safeNum(o.total_cost ?? o.amount), 0);
  }, [ordersRaw]);

  const plannedCryptoTotal = useMemo(() => {
    return (cryptoOrdersRaw as any[]).filter((o: any) =>
      (o.status === 'planned' || o.status === 'pending') && o.planned_date
    ).reduce((s: number, o: any) => s + safeNum(o.total_cost ?? o.amount), 0);
  }, [cryptoOrdersRaw]);

  // Upcoming planned investments (for tooltip & events) — also include DCA
  const plannedStockTxTotal = useMemo(() =>
    (plannedStockTx as any[]).reduce((s: number, t: any) => s + safeNum(t.total_cost ?? t.amount), 0),
  [plannedStockTx]);
  const plannedCryptoTxTotal = useMemo(() =>
    (plannedCryptoTx as any[]).reduce((s: number, t: any) => s + safeNum(t.total_cost ?? t.amount), 0),
  [plannedCryptoTx]);

  // ─── Cash engine with events ──────────────────────────────────────────────
  const cashEngineResult = useMemo(() => {
    if (!snapshot) return null;
    try {
      return runCashEngine({
        snapshot: {
          cash:             totalLiquidCash,  // all 4 buckets + offset (canonical)
          offset_balance:   0,               // already folded into totalLiquidCash above
          monthly_income:   snap.monthly_income,
          monthly_expenses: snap.monthly_expenses,
          mortgage:         snap.mortgage,
          other_debts:      snap.other_debts,
        },
        expenses, properties,
        stockTransactions:  plannedStockTx,
        cryptoTransactions: plannedCryptoTx,
        stockDCASchedules, cryptoDCASchedules,
        plannedStockOrders, plannedCryptoOrders,
        bills: billsRaw as any[],
        ngRefundMode,
        ngAnnualBenefit:    ngSummary.totalAnnualTaxBenefit,
        annualSalaryIncome: snap.monthly_income * 12,
        // Forecast assumptions
        inflationRate:    fa.flat.inflation,
        incomeGrowthRate: fa.flat.income_growth,
      });
    } catch { return null; }
  }, [snapshot, snap, expenses, properties, plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders, fa, ngRefundMode, ngSummary.totalAnnualTaxBenefit]);

  // ─── NW chart data ────────────────────────────────────────────────────────
  const nwGrowthData = useMemo(() => {
    const now = new Date().getFullYear();
    return projection.map((p: any, i: number) => ({
      year: String(now + i),
      netWorth: p.endNetWorth,
      assets: p.endAssets ?? (p.endNetWorth + snap.mortgage),
    }));
  }, [projection, snap.mortgage]);

  const filteredNWData = useMemo(() => {
    const now = new Date().getFullYear();
    if (chartRange === "1Y") return nwGrowthData.filter((d: any) => parseInt(d.year) <= now + 1);
    if (chartRange === "3Y") return nwGrowthData.filter((d: any) => parseInt(d.year) <= now + 3);
    return nwGrowthData;
  }, [nwGrowthData, chartRange]);

  // ─── Cashflow series ──────────────────────────────────────────────────────
  const cashFlowSeries = useMemo(() => {
    if (!snapshot) return [];
    return buildCashFlowSeries({
      snapshot: {
        monthly_income:   snap.monthly_income,
        monthly_expenses: snap.monthly_expenses,
        mortgage:         snap.mortgage,
        other_debts:      snap.other_debts,
        cash:             totalLiquidCash,
      },
      expenses, properties,
      stockTransactions:  plannedStockTx,
      cryptoTransactions: plannedCryptoTx,
      stockDCASchedules, cryptoDCASchedules,
      plannedStockOrders, plannedCryptoOrders,
      bills: billsRaw as any[],
      ngRefundMode, ngAnnualBenefit: ngSummary.totalAnnualTaxBenefit,
      annualSalaryIncome: snap.monthly_income * 12,
      // Forecast assumptions
      inflationRate:    fa.flat.inflation,
      incomeGrowthRate: fa.flat.income_growth,
    });
  }, [snapshot, snap, expenses, properties, plannedStockTx, plannedCryptoTx, stockDCASchedules, cryptoDCASchedules, plannedStockOrders, plannedCryptoOrders, fa, ngRefundMode, ngSummary.totalAnnualTaxBenefit]);
  const cashFlowAnnual = useMemo(() => aggregateCashFlowToAnnual(cashFlowSeries), [cashFlowSeries]);

  // ─── Master CF data with event markers ───────────────────────────────────
  const eventsByMonthKey = useMemo<Record<string, string[]>>(() => {
    const events: CashEvent[] = cashEngineResult?.events ?? [];
    const lookup: Record<string, string[]> = {};
    const SHOW_TYPES = new Set(["property_purchase", "tax_refund", "rental_income"]);
    for (const ev of events) {
      if (!SHOW_TYPES.has(ev.type)) continue;
      if (!lookup[ev.monthKey]) lookup[ev.monthKey] = [];
      lookup[ev.monthKey].push(ev.label);
    }
    return lookup;
  }, [cashEngineResult]);

  // ─── Build milestone map keyed by year (for annual chart) ──────────────────
  const milestonesPerYear = useMemo(() => {
    const map = new Map<number, Array<{ icon: string; text: string; type: string }>>();
    const add = (year: number, m: { icon: string; text: string; type: string }) => {
      if (!map.has(year)) map.set(year, []);
      map.get(year)!.push(m);
    };
    // Investment properties
    (properties as any[]).forEach((p: any) => {
      if (p.type === "ppor" || !p.settlement_date) return;
      const yr = new Date(p.settlement_date).getFullYear();
      const name = p.address?.split(" ").slice(-2).join(" ") || p.label || "IP";
      add(yr, { icon: "🏠", text: `${name} Settlement`, type: "property" });
    });
    // Planned stock orders — collapse per year (Fix 3: no duplicate labels)
    const stockByYear = new Map<number, { count: number; totalAmt: number }>();
    (ordersRaw as any[]).filter((o: any) => o.status === "planned" && o.planned_date).forEach((o: any) => {
      const yr = new Date(o.planned_date).getFullYear();
      const amt = safeNum(o.amount_aud);
      const existing = stockByYear.get(yr) ?? { count: 0, totalAmt: 0 };
      stockByYear.set(yr, { count: existing.count + 1, totalAmt: existing.totalAmt + amt });
    });
    stockByYear.forEach(({ count, totalAmt }, yr) => {
      const label = count > 1
        ? `📈 Multiple Stock Buys ($${Math.round(totalAmt / 1000)}k)`
        : `📈 Stock Buy ($${Math.round(totalAmt / 1000)}k)`;
      add(yr, { icon: "📈", text: label.replace("📈 ", ""), type: "stock" });
    });
    // Planned crypto orders — collapse per year (Fix 3)
    const cryptoByYear = new Map<number, { count: number; totalAmt: number }>();
    (cryptoOrdersRaw as any[]).filter((o: any) => o.status === "planned" && o.planned_date).forEach((o: any) => {
      const yr = new Date(o.planned_date).getFullYear();
      const amt = safeNum(o.amount_aud);
      const existing = cryptoByYear.get(yr) ?? { count: 0, totalAmt: 0 };
      cryptoByYear.set(yr, { count: existing.count + 1, totalAmt: existing.totalAmt + amt });
    });
    cryptoByYear.forEach(({ count, totalAmt }, yr) => {
      const label = count > 1
        ? `Multiple Crypto Buys ($${Math.round(totalAmt / 1000)}k)`
        : `Crypto Buy ($${Math.round(totalAmt / 1000)}k)`;
      add(yr, { icon: "₿", text: label, type: "crypto" });
    });
    // NG tax refund years (any year that has negatively geared properties settled)
    if (ngSummary.totalAnnualTaxBenefit > 0) {
      const currentYear = new Date().getFullYear();
      for (let y = currentYear; y <= currentYear + 9; y++) {
        add(y, { icon: "💰", text: `Tax Refund ~$${Math.round(ngSummary.totalAnnualTaxBenefit / 1000)}k`, type: "tax" });
      }
    }
    return map;
  }, [properties, ordersRaw, cryptoOrdersRaw, ngSummary]);

  const masterCFData = useMemo(() => {
    // Build equity lookup by year from equityTimeline (EquityTimelinePoint uses snake_case)
    const equityByYear = new Map<number, {
      pporUsableEquity: number;
      ipUsableEquity: number;
      emergencyBufferAmt: number;
    }>();
    (equityTimeline ?? []).forEach((pt: any) => {
      equityByYear.set(pt.year, {
        pporUsableEquity:   pt.ppor_usable_equity  ?? 0,
        ipUsableEquity:     pt.ip_usable_equity    ?? 0,
        emergencyBufferAmt: emergencyBuffer,
      });
    });
    // Build stock/crypto purchase lookup by year from planned orders
    const stockPurchByYear = new Map<number, number>();
    const cryptoPurchByYear = new Map<number, number>();
    (ordersRaw as any[]).filter((o: any) => (o.status === 'planned' || o.status === 'pending') && o.planned_date).forEach((o: any) => {
      const yr = new Date(o.planned_date).getFullYear();
      stockPurchByYear.set(yr, (stockPurchByYear.get(yr) ?? 0) + safeNum(o.total_cost ?? o.amount));
    });
    (cryptoOrdersRaw as any[]).filter((o: any) => (o.status === 'planned' || o.status === 'pending') && o.planned_date).forEach((o: any) => {
      const yr = new Date(o.planned_date).getFullYear();
      cryptoPurchByYear.set(yr, (cryptoPurchByYear.get(yr) ?? 0) + safeNum(o.total_cost ?? o.amount));
    });
    // Property purchases by year
    const propPurchByYear = new Map<number, number>();
    (properties as any[]).filter((p: any) => p.type !== 'ppor' && p.settlement_date).forEach((p: any) => {
      const yr = new Date(p.settlement_date).getFullYear();
      propPurchByYear.set(yr, (propPurchByYear.get(yr) ?? 0) + safeNum(p.purchase_price ?? p.value));
    });

    if (cashFlowView === "monthly") {
      // ── MONTHLY mode ──────────────────────────────────────────────────────
      return cashFlowSeries.map((m: any, idx: number) => {
        const isJan = m.month === 1;
        const ms = isJan ? (milestonesPerYear.get(m.year) ?? []) : [];
        // For the first month: Opening Cash = real ledger totalLiquidCash.
        // For subsequent months: Opening Cash = prior month's cumulative balance.
        const prevBal = idx > 0 ? (cashFlowSeries[idx - 1]?.cumulativeBalance ?? 0) : totalLiquidCash;
        const eq = equityByYear.get(m.year) ?? { pporUsableEquity: 0, ipUsableEquity: 0, emergencyBufferAmt: emergencyBuffer };
        // Property purchase breakdown for tooltip — Issue 3 fix
        const mpurchEvent = (cashEngineResult?.events ?? []).find(
          (ev: any) => ev.type === 'property_purchase' && ev.monthKey === `${m.year}-${String(m.month).padStart(2,'0')}`
        );
        const mBalance = m.cumulativeBalance ?? 0;
        const mPporEq = eq.pporUsableEquity ?? 0;
        const mIpEq   = eq.ipUsableEquity   ?? 0;
        const mEBuf   = eq.emergencyBufferAmt ?? emergencyBuffer;
        // Deposit power uses the REAL closing cash from cashEngine (not equity-timeline accumulation)
        const mDpTotal = Math.max(0, mBalance + mPporEq + mIpEq - mEBuf);
        return {
          label:            m.label,
          openingBalance:   prevBal,
          income:           m.income ?? 0,
          expenses:         m.totalExpenses ?? 0,
          mortgage:         m.mortgageRepayment ?? 0,
          rental:           m.rentalIncome ?? 0,
          ngRefund:         m.ngTaxBenefit ?? 0,
          netCF:            m.netCashFlow ?? 0,
          balance:          mBalance,
          investments:      0,
          propPurchases:    isJan ? (propPurchByYear.get(m.year) ?? 0) : 0,
          stockPurchases:   isJan ? (stockPurchByYear.get(m.year) ?? 0) : 0,
          cryptoPurchases:  isJan ? (cryptoPurchByYear.get(m.year) ?? 0) : 0,
          pporUsableEquity:    mPporEq,
          ipUsableEquity:      mIpEq,
          totalDepositPower:   mDpTotal,
          // closingCashForDP: the actual post-event closing cash used in deposit power calc
          closingCashForDP:    mBalance,
          emergencyBufferAmt:  mEBuf,
          usableEquity:        mPporEq + mIpEq,
          _milestones:         ms,
          _purchaseBreakdown:  mpurchEvent?.purchaseBreakdown ?? null,
        };
      });
    }
    // ── ANNUAL mode (default) ─────────────────────────────────────────────
    return cashFlowAnnual.map((a: any, idx: number) => {
      const yr = a.year as number;
      const ms = milestonesPerYear.get(yr) ?? [];
      const seen = new Set<string>();
      const dedupMs = ms.filter(m => {
        if (m.type === "tax") { if (seen.has("tax")) return false; seen.add("tax"); }
        return true;
      });
      // For the first year (2026/today): Opening Cash = real ledger totalLiquidCash.
      // For subsequent years: Opening Cash = prior year's ending balance.
      // NEVER use a.endingBalance as the opening for the first year — that's the year-END figure.
      const prevBal = idx > 0 ? (cashFlowAnnual[idx - 1]?.endingBalance ?? 0) : totalLiquidCash;
      const eq = equityByYear.get(yr) ?? { pporUsableEquity: 0, ipUsableEquity: 0, emergencyBufferAmt: emergencyBuffer };
      // Property purchase breakdown for tooltip — Issue 3 fix
      const ppurchEvent = (cashEngineResult?.events ?? []).find(
        (ev: any) => ev.type === 'property_purchase' && ev.year === yr
      );
      const aBalance = a.endingBalance ?? 0;
      const aPporEq  = eq.pporUsableEquity ?? 0;
      const aIpEq    = eq.ipUsableEquity   ?? 0;
      const aEBuf    = eq.emergencyBufferAmt ?? emergencyBuffer;
      // Deposit power uses the REAL cashEngine closing balance (after all purchases, expenses, etc.)
      const aDpTotal = Math.max(0, aBalance + aPporEq + aIpEq - aEBuf);
      return {
        label:            String(yr),
        openingBalance:   prevBal,
        income:           a.income ?? 0,
        expenses:         a.totalExpenses ?? 0,
        mortgage:         a.mortgageRepayment ?? 0,
        rental:           a.rentalIncome ?? 0,
        ngRefund:         a.ngTaxBenefit ?? 0,
        netCF:            a.netCashFlow ?? 0,
        balance:          aBalance,
        investments:      0,
        propPurchases:    propPurchByYear.get(yr) ?? 0,
        stockPurchases:   stockPurchByYear.get(yr) ?? 0,
        cryptoPurchases:  cryptoPurchByYear.get(yr) ?? 0,
        pporUsableEquity:    aPporEq,
        ipUsableEquity:      aIpEq,
        totalDepositPower:   aDpTotal,
        // closingCashForDP: the actual post-event closing cash used in deposit power calc
        closingCashForDP:    aBalance,
        emergencyBufferAmt:  aEBuf,
        usableEquity:        aPporEq + aIpEq,
        _milestones:         dedupMs,
        _purchaseBreakdown:  ppurchEvent?.purchaseBreakdown ?? null,
      };
    });
  }, [cashFlowView, cashFlowSeries, cashFlowAnnual, milestonesPerYear, equityTimeline, ordersRaw, cryptoOrdersRaw, properties, cashEngineResult]);

  // ─── Property purchase event reference lines ──────────────────────────────
  const propertyEventLines = useMemo(() => {
    if (cashFlowView === "annual" || !cfChartAnnotations) return [];
    const lines: Array<{ index: number; label: string; color: string }> = [];
    masterCFData.forEach((d: any, i: number) => {
      if (d._hasEvent) {
        const isIP = d._events.some((e: string) => e.toLowerCase().includes("purchase") || e.toLowerCase().includes("ip") || e.toLowerCase().includes("settlement"));
        const isTax = d._events.some((e: string) => e.toLowerCase().includes("tax") || e.toLowerCase().includes("refund"));
        const isRental = d._events.some((e: string) => e.toLowerCase().includes("rental") || e.toLowerCase().includes("rent"));
        lines.push({
          index: i,
          label: d._events[0],
          color: isIP ? "hsl(188,60%,48%)" : isTax ? "hsl(43,85%,55%)" : isRental ? "hsl(145,55%,42%)" : "hsl(260,60%,58%)",
        });
      }
    });
    return lines.slice(0, 8);
  }, [masterCFData, cashFlowView, cfChartAnnotations]);

  // ─── Wealth cards ─────────────────────────────────────────────────────────
  const wealthCards = useMemo(() => {
    if (!snapshot) return [];
    const currentInvestable = totalLiquidCash + _totalSuperNow + stocksTotal + cryptoTotal;
    const requiredFIRE = (10000 * 12) / 0.04;
    const fireProgress = Math.min(100, Math.round((currentInvestable / requiredFIRE) * 100));
    // Use canonical totalMonthlyOutgoings so emergency-fund coverage matches the surplus formula.
    const totalMonthly = totalMonthlyOutgoings;
    const monthsCovered = (totalLiquidCash) / totalMonthly;
    const emergencyScore = Math.min(100, Math.round((monthsCovered / 6) * 100));
    const totalDebt = snap.mortgage + snap.other_debts;
    const debtToIncome = totalDebt / (snap.monthly_income * 12);
    // IP Readiness: use depositPowerResult.readinessPct if available, else fallback calc
    const depositReady = depositPowerResult
      ? Math.min(100, Math.round(depositPowerResult.readinessPct))
      : (() => {
          const targetIP = 750000;
          const depositNeeded = targetIP * 0.2 + targetIP * 0.035;
          return Math.min(100, Math.round(((totalLiquidCash) * 0.7 / depositNeeded) * 100));
        })();
    const currentInvestable2 = totalLiquidCash + _totalSuperNow + stocksTotal + cryptoTotal;
    const targetFIRE = (8000 * 12) / 0.04;
    const monthlySaving = Math.max(surplus, 100);
    const r = 0.07 / 12;
    let months = 0;
    let accum = currentInvestable2;
    while (accum < targetFIRE && months < 600) { accum = accum * (1 + r) + monthlySaving; months++; }
    const fireAge = 36 + Math.round(months / 12);
    const hiddenMonthly = Math.round(snap.other_debts * 0.15 / 12 + Math.max(0, snap.cash - snap.monthly_expenses * 6) * 0.04 / 12);
    return [
      { label: "FIRE Progress", value: `${fireProgress}%`, sub: "of target capital", Icon: Flame, alert: fireProgress < 20, _pct: fireProgress },
      { label: "Emergency",     value: `${emergencyScore}/100`, sub: `${Math.round(monthsCovered)}mo covered`, Icon: Shield, alert: emergencyScore < 50 },
      { label: "IP Readiness",  value: `${depositReady}%`, sub: "deposit ready", Icon: Building2, alert: depositReady < 30, _pct: depositReady },
      { label: "FIRE Age",      value: `~${fireAge}`, sub: "est. financial freedom", Icon: Clock, alert: fireAge > 60 },
      { label: "Hidden Money",  value: `${maskValue(formatCurrency(hiddenMonthly * 12, true), privacyMode)}/yr`, sub: "potential savings", Icon: Eye, alert: hiddenMonthly > 500 },
    ];
  }, [snap, surplus, savingsRate, stocksTotal, cryptoTotal, depositPowerResult, privacyMode]);

  const fireCard        = wealthCards.find(c => c.label === "FIRE Age");
  const fireProgress    = wealthCards.find(c => c.label === "FIRE Progress");
  const emergencyCard   = wealthCards.find(c => c.label === "Emergency");
  const ipCard          = wealthCards.find(c => c.label === "IP Readiness");
  const depositPct      = parseInt(ipCard?.value ?? "0");
  const firePct         = parseInt(String((fireProgress as any)?._pct ?? "0"));

  // ─── Mission ──────────────────────────────────────────────────────────────
  const missionLabel    = depositPct >= 80 ? "Prepare for IP #2 Settlement" : depositPct >= 50 ? "Build deposit for next IP" : "Grow wealth base & cashflow";
  const missionMonths   = Math.max(1, Math.round((100 - depositPct) * 1.8));
  const missionContrib  = Math.round(surplus * 0.7);

  // ─── Best move V2 — uses getBestMoveRecommendation(ledger) ─────────────────
  // Build once per snapshot change. Uses data already in component state — no extra Supabase fetch.
  const offsetBalance        = snap.offset_balance;
  const totalUsableEquity    = depositPowerResult?.totalUsableEquity ?? 0;
  const dpReady              = depositPowerResult?.isReady ?? false;
  const dpTotal           = depositPowerResult?.totalDepositPower ?? 0;
  const dpReadiness       = depositPowerResult?.readinessPct ?? 0;


  // ─── Risk score ───────────────────────────────────────────────────────────
  const riskScore = Math.min(100, Math.max(0, Math.round(
    50 + (savingsRate - 20) * 1.5 - (snap.other_debts > 50000 ? 15 : 0) + (firePct - 20) * 0.5
  )));
  const riskLabel = riskScore >= 70 ? "Strong" : riskScore >= 50 ? "Moderate" : "Watch";

  // ─── Module tiles ─────────────────────────────────────────────────────────
  const deepModules = [
    { label: "Property",  href: "/property",         color: "hsl(188,60%,48%)", icon: "🏠" },
    { label: "Stocks",    href: "/stocks",            color: "hsl(43,85%,55%)",  icon: "📈" },
    { label: "Crypto",    href: "/crypto",            color: "hsl(260,60%,58%)", icon: "₿"  },
    { label: "Tax",       href: "/tax",               color: "hsl(145,55%,42%)", icon: "🧾" },
    { label: "Reports",   href: "/reports",           color: "hsl(210,75%,52%)", icon: "📊" },
    { label: "Scenarios", href: "/wealth-strategy",   color: "hsl(260,60%,58%)", icon: "🔮" },
    { label: "Expenses",  href: "/expenses",          color: "hsl(188,60%,48%)", icon: "💳" },
    { label: "Bills",     href: "/recurring-bills",   color: "hsl(5,70%,52%)",   icon: "📅" },
    { label: "AI Coach",  href: "/ai-insights",       color: "hsl(42,80%,52%)",  icon: "🤖" },
  ];

  // ─── Balance Sheet fields ─────────────────────────────────────────────────
  const snapFields = [
    { label: "PPOR",             key: "ppor",             group: "asset" },
    { label: "Cash (Everyday)",  key: "cash",             group: "asset" },
    { label: "Offset Balance",   key: "offset_balance",   group: "asset" },
    { label: "Super",            key: "super_balance",    group: "asset" },
    { label: "Cars",             key: "cars",             group: "asset" },
    { label: "Iran Property",    key: "iran_property",    group: "asset" },
    { label: "Mortgage",         key: "mortgage",         group: "liability" },
    { label: "Other Debts",      key: "other_debts",      group: "liability" },
    { label: "Monthly Income",   key: "monthly_income",   group: "income" },
    { label: "Monthly Expenses", key: "monthly_expenses", group: "expense" },
  ] as const;

  // ─── Asset allocation donut data ──────────────────────────────────────────
  const assetAllocData = useMemo(() => {
    if (!snapshot) return [];
    const items = [
      { name: "PPOR",    value: snap.ppor,            fill: "hsl(188,60%,48%)" },
      { name: "Cash",    value: totalLiquidCash, fill: "hsl(210,75%,52%)" },
      { name: "Super",   value: _totalSuperNow,       fill: "hsl(43,85%,55%)" },
      { name: "Stocks",  value: stocksTotal,          fill: "hsl(145,55%,42%)" },
      { name: "Crypto",  value: cryptoTotal,          fill: "hsl(260,60%,58%)" },
      { name: "Other",   value: snap.cars + snap.iran_property, fill: "hsl(222,15%,40%)" },
    ].filter(x => x.value > 0);
    return items.map(x => ({ ...x, pct: (x.value / (totalAssets || 1)) * 100 }));
  }, [snap, _totalSuperNow, stocksTotal, cryptoTotal, totalAssets]);

  // ─── Expense breakdown data ───────────────────────────────────────────────
  const expenseBreakdown = useMemo(() => {
    if (!snapshot) return [];
    const cats: Record<string, number> = {};
    (expenses ?? []).forEach((e: any) => {
      const cat = e.category || "Other";
      cats[cat] = (cats[cat] || 0) + safeNum(e.monthly_amount || e.amount);
    });
    // Only add a separate "Mortgage" slice if expenses DO NOT already include
    // mortgage rows — otherwise the pie double-counts the same dollars.
    if (!expensesIncludesDebt && snap.mortgage > 0) {
      cats["Mortgage"] = (cats["Mortgage"] || 0) + monthlyMortgageRepay;
    }
    return Object.entries(cats).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [expenses, snap.mortgage, expensesIncludesDebt, monthlyMortgageRepay]);

  // ─── NG per-property display ──────────────────────────────────────────────
  const ngProperties = useMemo(() => {
    return (ngSummary.perProperty ?? []).map((p: any) => ({
      name: p.name || "Property",
      annualBenefit: p.annualTaxBenefit ?? 0,
      monthlyHolding: p.monthlyAfterTaxCost ?? 0,
      rentalYield: p.grossRentalYield ?? 0,
    }));
  }, [ngSummary]);

  // ─── FIRE calc ────────────────────────────────────────────────────────────
  const fireTargetAmt = (8000 * 12) / 0.04;
  const fireCurrentAmt = totalLiquidCash + _totalSuperNow + stocksTotal + cryptoTotal;
  const fireProgressPct = Math.min(100, (fireCurrentAmt / fireTargetAmt) * 100);
  const fireGap = Math.max(0, fireTargetAmt - fireCurrentAmt);
  const fireMonthlyNeeded = fireGap > 0 ? Math.round(fireGap * 0.07 / 12 / ((Math.pow(1.07 / 12 + 1, Math.max(1, (parseInt(fireCard?.value?.replace("~", "") ?? "55")) * 12 - 36 * 12)) - 1) / (0.07 / 12))) : 0;

  // ─── Year-by-year table ───────────────────────────────────────────────────
  const yrRows = useMemo(() => {
    if (!snapshot) return [];
    const now = new Date().getFullYear();
    return projection.slice(0, 10).map((p: any, i: number) => ({
      year: now + i,
      nw:   p.endNetWorth,
      assets: p.endAssets ?? (p.endNetWorth + snap.mortgage * Math.pow(0.97, i)),
      liab:  p.endLiabilities ?? (snap.mortgage * Math.pow(0.97, i)),
      passive: p.passiveIncome ?? 0,
      surplus:  p.yearlySurplus ?? (surplus * 12),
    }));
  }, [projection, snap.mortgage, surplus]);

  // ─── Full year-by-year rows ───────────────────────────────────────────────
  const yrRowsFull = useMemo(() => {
    if (!snapshot) return [];
    // Build equity lookup by year from equityTimeline
    const eqByYr = new Map<number, { usableEquity: number; depositPower: number }>();
    (equityTimeline ?? []).forEach((pt: any) => {
      eqByYr.set(pt.year, {
        usableEquity: (pt.ppor_usable_equity ?? 0) + (pt.ip_usable_equity ?? 0),
        depositPower: pt.deposit_power ?? 0,
      });
    });
    return projection.slice(0, 10).map((p: any) => {
      const startNW = p.startNetWorth ?? 0;
      const endNW   = p.endNetWorth ?? 0;
      // Fix growth %: (endNW - startNW) / |startNW| × 100 (correct reconciliation formula)
      const growth = startNW !== 0 ? (endNW - startNW) / Math.abs(startNW) : 0;
      const growthPct = growth * 100;
      const eq = eqByYr.get(p.year) ?? { usableEquity: 0, depositPower: 0 };
      return {
        year: p.year,
        startNW,
        income: p.income,
        expenses: p.expenses,
        propValue: p.propertyValue,
        propLoans: p.propertyLoans,
        equity: p.propertyEquity,
        usableEquity: eq.usableEquity,
        depositPower: eq.depositPower,
        stocks: p.stockValue,
        crypto: p.cryptoValue,
        cash: p.cash,
        totalAssets: p.totalAssets,
        liab: p.totalLiabilities,
        endNW,
        growth,
        growthPct,
        passive: p.passiveIncome,
        monthlyCF: p.monthlyCashFlow,
        cashBridge: p.cashBridge,
        propertyBridge: p.propertyBridge,
        liabilityBridge: p.liabilityBridge,
        passiveIncomeBreakdown: p.passiveIncomeBreakdown,
      };
    });
  }, [projection, snapshot, equityTimeline]);

  // ─── Loading guard (MUST come after ALL hooks) ───────────────────────────

  // ─── Pre-guard computed values — used by inlineBestMove_hook useMemo ──────────────
  // These MUST live before the early return so the useMemo hook is never conditionally skipped.
  const _allFutureCash      = projection.map((p: any) => p.cash);
  const _lowestFutureCash   = _allFutureCash.length > 0 ? Math.min(..._allFutureCash) : 0;
  const _negativeCashMonths = (cashEngineResult?.ledger ?? [])
    .filter((m: any) => m.closingCash < 0)
    .slice(0, 5)
    .map((m: any) => m.label || m.monthKey);

  // ─── Best Move V2 useMemo — MUST be before loading guard (Rules of Hooks) ──────────
  const inlineBestMove_hook = useMemo(() => {
    if (!snapshot) return null;
    const _ledger: BestMoveLedger = {
      cash:                 snap.cash,
      offsetBalance:        snap.offset_balance,
      mortgage:             snap.mortgage,
      otherDebts:           snap.other_debts,
      monthlyIncome:        snap.monthly_income,
      monthlyExpenses:      snap.monthly_expenses,
      ppor:                 snap.ppor,
      plannedStockTotal:    plannedStockTotal + plannedStockTxTotal,
      plannedCryptoTotal:   plannedCryptoTotal + plannedCryptoTxTotal,
      billsRaw:             billsRaw as any[],
      properties:           properties as any[],
      emergencyBuffer,
      maxRefinanceLVR,
      mortgageRate:         (snap.mortgage_rate ?? 6.5) / 100,
      etfExpectedReturn:    (fa.flat.stocks_return ?? 9.5) / 100,
      cryptoExpectedReturn: (fa.flat.crypto_return ?? 20) / 100,
      lowestFutureCash:     _lowestFutureCash,
      negativeCashMonths:   _negativeCashMonths,
      rohamGrossAnnual:     snap.monthly_income * 12,
      superContribAnnual:   safeNum((snapshot as any).roham_salary_sacrifice) * 12
                              + snap.monthly_income * 12 * 0.115,
      stocksValue:          stocksTotal,
      cryptoValue:          cryptoTotal,
      depositPowerResult:   depositPowerResult ? {
        totalDepositPower:  depositPowerResult.totalDepositPower,
        readinessPct:       depositPowerResult.readinessPct,
        isReady:            depositPowerResult.isReady,
        totalUsableEquity:  depositPowerResult.totalUsableEquity,
        deployableCash:     Math.max(0, depositPowerResult.totalDepositPower - (depositPowerResult.totalUsableEquity ?? 0)),
        fundingSources:     depositPowerResult.fundingSources ?? [],
      } : null,
    };
    return getBestMoveRecommendation(_ledger);
  }, [
    snapshot, snap, plannedStockTotal, plannedStockTxTotal, plannedCryptoTotal, plannedCryptoTxTotal,
    billsRaw, properties, emergencyBuffer, maxRefinanceLVR, _lowestFutureCash, _negativeCashMonths,
    stocksTotal, cryptoTotal, depositPowerResult, fa.flat.stocks_return, fa.flat.crypto_return,
  ]);

  // ─── Smart actions — sourced from bestMoveEngine (same engine as Best Move Now card) ──
  // MUST be after inlineBestMove_hook and before loading guard (Rules of Hooks).
  const smartActions = useMemo(() => {
    if (!inlineBestMove_hook) return [];
    const riskToDifficulty = (risk: string) =>
      risk === 'Low' ? 'Easy' : risk === 'Med' ? 'Moderate' : 'Advanced';
    const riskToPriority = (_risk: string, rank: number): string => {
      if (rank === 1) return 'high';
      if (_risk === 'High') return 'strategic';
      return 'medium';
    };
    const benefitToTime = (id: string) => {
      if (id === 'move_to_offset' || id === 'setup_hisa') return '1 day';
      if (id === 'paydown_personal_debt') return '1 week';
      if (id === 'property_deposit') return '2–4 weeks';
      if (id === 'super_sacrifice') return '1–2 weeks';
      if (id === 'build_buffer') return '3–6 months';
      if (id === 'dca_etf_surplus' || id === 'invest_etf') return 'Ongoing';
      return 'Ongoing';
    };
    const all = [inlineBestMove_hook.best, ...inlineBestMove_hook.alternatives];
    return all.map((opt, i) => ({
      rank:       i + 1,
      title:      opt.action,
      impact:     opt.benefit_label,
      difficulty: riskToDifficulty(opt.risk),
      time:       benefitToTime(opt.id),
      href:       opt.cta_route,
      priority:   riskToPriority(opt.risk, i + 1),
    }));
  }, [inlineBestMove_hook]);

  if (snapLoading || !snapshot) {
    return (
      <div className="db-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
        <div style={{ textAlign: "center", color: "hsl(215 12% 48%)" }}>
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3" style={{ color: "hsl(var(--gold))" }} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Loading your wealth data…</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Connecting to Supabase</div>
        </div>
      </div>
    );
  }

  const handleSaveSnap = async () => {
    if (snapDraft) {
      await updateSnap.mutateAsync(snapDraft);
      setEditSnap(false);
      setSnapDraft(null);
    }
  };

  // ─── Computed values for new layout ──────────────────────────────────────
  const accessibleNW = netWorth - _totalSuperNow;
  const lockedNW = _totalSuperNow;
  const allFutureCash = projection.map((p: any) => p.cash);
  const lowestFutureCash = allFutureCash.length > 0 ? Math.min(...allFutureCash) : 0;
  const nextPropEvent = (cashEngineResult?.events ?? []).find((e: any) => e.type === "property_purchase" || e.type === "settlement");

  const negativeCashMonths = (cashEngineResult?.ledger ?? [])
    .filter((m: any) => m.closingCash < 0)
    .slice(0, 5)
    .map((m: any) => m.label || m.monthKey);
  const hasLiquidityStress = negativeCashMonths.length > 0;

  // Derived labels for inline mini-card (sourced from inlineBestMove_hook above loading guard)
  const bestMoveTitle   = inlineBestMove_hook?.best.action       ?? "Analysing…";
  const bestMoveImpact  = inlineBestMove_hook?.best.benefit_label ?? "";
  const bestMoveHref    = inlineBestMove_hook?.best.cta_route     ?? "/dashboard";

  const upcomingBillsCount = (billsRaw ?? []).filter((b: any) => {
    if (!b.next_due_date) return false;
    const due = new Date(b.next_due_date);
    const today = new Date();
    const diff = (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  }).length;

  const budgetsSetCount = (budgetsRaw ?? []).length;
  const alertsSent24h = (alertLogsRaw ?? []).filter((a: any) => {
    const ts = new Date(a.sent_at || a.created_at).getTime();
    return Date.now() - ts < 24 * 60 * 60 * 1000;
  }).length;

  const cashAfterBills = (totalLiquidCash) - (billsRaw ?? [])
    .filter((b: any) => {
      if (!b.next_due_date) return false;
      const due = new Date(b.next_due_date);
      const today = new Date();
      return (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24) <= 7;
    })
    .reduce((sum: number, b: any) => sum + safeNum(b.amount), 0);

  const monthlyCFBarData = [
    { name: "Income", value: snap.monthly_income },
    { name: "Expenses", value: totalMonthlyOutgoings },
    { name: "Surplus", value: Math.max(0, surplus) },
  ];
  const MONTHLY_CF_COLORS = ["hsl(142,60%,45%)", "hsl(0,72%,51%)", "hsl(43,85%,55%)"];

  const cfFirst = masterCFData.find((d: any) => d.label && d.label.includes("2026")) ?? masterCFData[0] ?? {};
  const cfLast = masterCFData[masterCFData.length - 1] ?? {};

  // Active income sources count
  const activeIncomeSources = (incomeRecords ?? []).filter((r: any) => r.is_active !== false).length;

  // ─── Render ───────────────────────────────────────────────────────────────
  // ─── Phase 7 — Executive Dashboard props ─────────────────────────────────
  // Single composable surface that introduces narrative-first hierarchy at
  // the top of the dashboard. All values feed from the existing data
  // contract — no new sources, no architectural change.
  // ── Canonical 10y trajectory source ────────────────────────────────────
  // Executive Overview MUST present the SAME P50 value the Wealth Projection
  // (Monte Carlo) table shows. We resolve the year-10 row (or the final fan
  // point if the engine produced fewer rows) from `monteCarloResult.fan_data`
  // and pass it through as `trajectoryP50`. When MC has not been run the
  // header falls back to the deterministic `year10NW` and is clearly
  // labelled as deterministic.
  const trajectoryHorizonYear = new Date().getFullYear() + 9;
  const mcTrajectoryRow = monteCarloResult?.fan_data?.length
    ? (
        monteCarloResult.fan_data.find(r => r.year === trajectoryHorizonYear)
        ?? monteCarloResult.fan_data[monteCarloResult.fan_data.length - 1]
      )
    : null;
  const trajectoryP50: number | null = mcTrajectoryRow ? mcTrajectoryRow.median : null;
  const trajectoryYear: number | null = mcTrajectoryRow ? mcTrajectoryRow.year : null;

  // ── Annual cashflow / deposit-power trajectory (Final Reconciliation Pass) ─
  // Build a calm 10-year annual series for the Deposit Power & Cashflow panel
  // on the Executive Overview. We reuse `cashFlowAnnual` and the canonical
  // equityTimeline already computed above — no parallel engine, no duplicated
  // recommendation system.
  const cashflowTrajectory = useMemo(() => {
    if (!Array.isArray(cashFlowAnnual) || cashFlowAnnual.length === 0) return null;
    const equityByYear = new Map<number, number>();
    (equityTimeline ?? []).forEach((pt: any) => {
      equityByYear.set(pt.year, (pt.ppor_usable_equity ?? 0) + (pt.ip_usable_equity ?? 0));
    });
    return cashFlowAnnual.slice(0, 10).map((a: any, idx: number) => {
      const yr = a.year as number;
      const cash = a.endingBalance ?? 0;
      const usableEquity = equityByYear.get(yr) ?? 0;
      const dp = Math.max(0, cash + usableEquity - emergencyBuffer);
      return {
        label: String(yr),
        cashBalance: cash,
        netCashflow: a.netCashFlow ?? 0,
        taxRefund: a.ngTaxBenefit ?? 0,
        usableEquity,
        totalDepositPower: dp,
      };
    });
  }, [cashFlowAnnual, equityTimeline, emergencyBuffer]);

  const phase7ExecProps = {
    netWorth,
    surplus,
    totalLiquidCash,
    totalLiab,
    monthlyExpenses: monthlyExpensesSOT,
    passiveIncome,
    year10NW,
    trajectoryP50,
    trajectoryYear,
    fireProgressPct,
    fireCurrentAmt,
    fireTargetAmt,
    riskScore,
    riskLabel,
    monthlyDebtService: monthlyDebtServiceSOT,
    totalMortgage: snap.mortgage,
    totalPropertyValue: snap.ppor + ipCurrentValueSettled,
    totalAssets,
    // Live PPOR mortgage rate (TODAY snapshot — NOT a forecast / blended rate).
    // The dashboard reads `sf_snapshot.mortgage_rate` directly via the snap
    // memo above, so the Hero "today" caption shows the actual current rate.
    livePporRate: snap.mortgage_rate ?? null,
    // Canonical Monte Carlo trajectory data — single source for the homepage
    // wealth trajectory panel.
    monteCarloFanData: monteCarloResult?.fan_data ?? null,
    monteCarloSimulations: monteCarloResult?.simulations ?? null,
    // Annual cashflow trajectory for the Deposit Power & Cashflow panel.
    cashflowTrajectory,
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">

      {/* ══════════════════════════════════════════════════════════════════
          EXECUTIVE OVERVIEW REBUILD V2 — calm Family Office Cockpit
          The homepage shows ONLY:
            (a) a global Smart-Assumptions chip (forecast mode chrome)
            (b) the Executive Overview cockpit (hero / trajectory / health
                / action queue)
          followed by a non-blocking data-availability banner, a slim
          Explore nav strip, and the contextual AI Insights card. The
          legacy welcome / journey / KPI / Accessible-Locked / Wealth
          Health stacks were removed from the render path — they
          duplicated cockpit signals and reintroduced
          dashboard-inside-dashboard density.
          ═════════════════════════════════════════════════════════════════ */}

      {/* Smart-Assumptions / Forecast pill — global chrome only. */}
      <div className="px-4 pt-3 pb-1 db-section-smart-assumptions">
        <Link href="/ai-forecast-engine">
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer transition-all hover:brightness-110 ${
              forecastMode === "monte-carlo"
                ? "bg-purple-500/10 border border-purple-500/30 text-purple-300"
                : forecastMode === "year-by-year"
                ? "bg-sky-500/10 border border-sky-500/30 text-sky-300"
                : profile === "aggressive"
                ? "bg-rose-500/10 border border-rose-500/30 text-rose-300"
                : profile === "conservative"
                ? "bg-amber-500/10 border border-amber-500/30 text-amber-300"
                : "bg-blue-500/10 border border-blue-500/30 text-blue-300"
            }`}
            data-testid="badge-smart-assumptions"
          >
            <Sparkles className="w-3 h-3" />
            <span className="opacity-70">Smart assumptions ·</span>{" "}
            {
              forecastMode === "monte-carlo"
                ? `Monte Carlo${monteCarloResult ? " (median)" : ""}`
                : forecastMode === "year-by-year"
                ? "Year-by-Year"
                : profile === "aggressive"
                ? "Aggressive"
                : profile === "conservative"
                ? "Conservative"
                : "Base (Moderate)"
            }
            <ChevronRight className="w-3 h-3 opacity-70" />
          </span>
        </Link>
      </div>

      {/* Executive Overview cockpit — the only content surface on the homepage. */}
      <div
        className="px-4 pt-4 pb-2"
        data-testid="dashboard-executive-section"
      >
        <ExecutiveDashboard {...phase7ExecProps} />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          DATA-AVAILABILITY BANNER
          Non-blocking advisory shown when every actual-balance source is
          empty so users see WHY cards read $0 instead of silently looking
          broken. Backed by `evaluateDataAvailability` from the data contract.
          ═════════════════════════════════════════════════════════════════ */}
      {dataAvailability.allActualEmpty && (
        <div className="px-4 pb-2" data-testid="banner-no-actuals">
          {/* Audit P1-8: warning banner must stay legible in BOTH themes.
              In light mode the previous amber-200 text on amber-500/10 bg
              was ~2.4:1 (well below AA). We use Tailwind's dark: prefix to
              keep the dark experience and route light mode through a high-
              contrast amber-900 foreground. */}
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <div className="font-semibold text-amber-900 dark:text-amber-200">
              No actual balances entered yet
            </div>
            <div className="text-amber-900/80 dark:text-amber-100/80 text-xs mt-1">
              The cards below show $0 because these sections are empty:{" "}
              {dataAvailability.emptySections.join(", ")}.
              {" "}Open the snapshot form, or the Properties / Stocks / Crypto
              pages, to record current balances. Forecast and planned values
              are not used for these headline cards.
            </div>
          </div>
        </div>
      )}


      {/* Deep Analysis surfaces are now rendered inside the cockpit as a
          dedicated DeepAnalysisCards section (four premium cards). The
          previous weak filter-chip strip was removed per the Executive
          Overview Final Reconciliation Pass. Routes for Risk Radar & Tax
          Strategy are now registered in App.tsx so the cards never lead to
          router-not-found errors. */}

      {/* AI Insights body module relocated off the homepage — it surfaced
          deep-analysis labels (Future Worlds, Ledger Audit, AI Insights)
          and felt like a content module rather than orientation. The
          Explore strip above already points users to the dedicated
          insights surfaces. */}

      {/* Mobile bottom-sheet tooltip — renders on tap for screens < 768px */}
      <MobileChartSheet data={mobileTooltipData} onClose={() => setMobileTooltipData(null)} />

    </div>
  );
}

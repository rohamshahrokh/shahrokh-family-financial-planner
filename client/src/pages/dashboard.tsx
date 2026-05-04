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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import AIInsightsCard from "@/components/AIInsightsCard";
import PortfolioLiveReturn from "@/components/PortfolioLiveReturn";
import CFODashboardWidget from "@/components/CFODashboardWidget";
import BestMoveCard from "@/components/BestMoveCard";
import { getBestMoveRecommendation, type BestMoveLedger } from "@/lib/bestMoveEngine";
import DepositPowerCard from "@/components/DepositPowerCard";
import FIREPathCard from "@/components/FIREPathCard";
import TaxAlphaCard from "@/components/TaxAlphaCard";
import RiskRadarCard from "@/components/RiskRadarCard";
import KpiCard from "@/components/KpiCard";
import WealthFlowBanner from "@/components/WealthFlowBanner";
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
    const s = snapshot;
    return {
      ppor:             safeNum(s.ppor),
      // Everyday cash (transaction/chequing account)
      cash:             safeNum(s.cash),
      // Cash split buckets — stored separately in the ledger
      offset_balance:   safeNum(s.offset_balance),
      savings_cash:     safeNum(s.savings_cash),
      emergency_cash:   safeNum(s.emergency_cash),
      other_cash:       safeNum(s.other_cash),
      super_balance:    safeNum(s.super_balance),
      super_roham:      safeNum(s.super_roham ?? s.super_balance),
      super_fara:       safeNum(s.super_fara),
      cars:             safeNum(s.cars),
      iran_property:    safeNum(s.iran_property),
      mortgage:         safeNum(s.mortgage),
      other_debts:      safeNum(s.other_debts),
      monthly_income:   safeNum(s.monthly_income),
      monthly_expenses: safeNum(s.monthly_expenses),
      mortgage_rate:    safeNum(s.mortgage_rate) || 6.5,
      mortgage_term_years: safeNum(s.mortgage_term_years) || 30,
    };
  }, [snapshot]);

  // Live stocks / crypto from holdings
  const liveStocks = useMemo(() =>
    (holdingsRaw ?? []).filter((h: any) => h.asset_type === "stock").reduce((sum: number, h: any) => sum + safeNum(h.current_value), 0),
    [holdingsRaw]);
  const liveCrypto = useMemo(() =>
    (holdingsRaw ?? []).filter((h: any) => h.asset_type === "crypto").reduce((sum: number, h: any) => sum + safeNum(h.current_value), 0),
    [holdingsRaw]);
  const stocksTotal = liveStocks || (stocks ?? []).reduce((s: number, x: any) => s + safeNum(x.current_value), 0);
  const cryptoTotal = liveCrypto || (cryptos ?? []).reduce((s: number, x: any) => s + safeNum(x.current_value), 0);

  const _totalSuperNow = snap.super_roham + snap.super_fara;

  // ─── Core financials ──────────────────────────────────────────────────────
  // Total liquid cash = all cash buckets from the ledger (no forecast, no fallback)
  // Formula: Everyday Cash + Savings Cash + Emergency Cash + Other Cash + Offset Balance
  // Dedup guard: if other_cash === offset_balance it was contaminated by old data — zero it
  const _safeOtherCash = (snap.other_cash > 0 && snap.other_cash === snap.offset_balance) ? 0 : snap.other_cash;
  const totalLiquidCash = snap.cash + snap.savings_cash + snap.emergency_cash + _safeOtherCash + snap.offset_balance;

  const totalAssets   = snap.ppor + totalLiquidCash + _totalSuperNow + stocksTotal + cryptoTotal + snap.cars + snap.iran_property;
  const totalLiab     = snap.mortgage + snap.other_debts;
  const netWorth      = totalAssets - totalLiab;
  const propertyEquity = snap.ppor - snap.mortgage;
  // Mortgage is already included in monthly_expenses — do not deduct again
  const monthlyMortgageRepay = 0;
  const surplus       = snap.monthly_income - snap.monthly_expenses;
  const totalMonthlyOutgoings = snap.monthly_expenses;
  const savingsRate   = calcSavingsRate(snap.monthly_income, snap.monthly_expenses);

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
  // Passive income: only count properties already settled + actual stock/crypto dividends today
  // projection[0] includes future planned properties (e.g. July IP) which inflates today's figure
  const todayStr = new Date().toISOString().split('T')[0];
  const passiveIncome = useMemo(() => {
    const settledProperties = (properties ?? []).filter((p: any) =>
      p.type !== 'ppor' && p.settlement_date && p.settlement_date <= todayStr
    );
    const annualRental = settledProperties.reduce((sum: number, p: any) => {
      const wRent = safeNum(p.weekly_rent);
      const vacancy = safeNum(p.vacancy_rate) || 0;
      const mgmt = safeNum(p.management_fee) || 0;
      return sum + wRent * 52 * (1 - vacancy / 100) * (1 - mgmt / 100);
    }, 0);
    const annualDividends = stocksTotal * 0.02 + cryptoTotal * 0.01;
    return Math.round(annualRental + annualDividends);
  }, [properties, stocksTotal, cryptoTotal, todayStr]);

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
    const totalMonthly = snap.monthly_expenses + monthlyMortgageRepay;
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
      { label: "Hidden Money",  value: `${formatCurrency(hiddenMonthly * 12, true)}/yr`, sub: "potential savings", Icon: Eye, alert: hiddenMonthly > 500 },
    ];
  }, [snap, surplus, savingsRate, stocksTotal, cryptoTotal, depositPowerResult]);

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
    if (snap.mortgage > 0) cats["Mortgage"] = (cats["Mortgage"] || 0) + monthlyMortgageRepay;
    return Object.entries(cats).map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
  }, [expenses, snap.mortgage]);

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
    { name: "Expenses", value: snap.monthly_expenses + monthlyMortgageRepay },
    { name: "Surplus", value: Math.max(0, surplus) },
  ];
  const MONTHLY_CF_COLORS = ["hsl(142,60%,45%)", "hsl(0,72%,51%)", "hsl(43,85%,55%)"];

  const cfFirst = masterCFData.find((d: any) => d.label && d.label.includes("2026")) ?? masterCFData[0] ?? {};
  const cfLast = masterCFData[masterCFData.length - 1] ?? {};

  // Active income sources count
  const activeIncomeSources = (incomeRecords ?? []).filter((r: any) => r.is_active !== false).length;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground pb-16">

      {/* ══════════════════════════════════════════════════════════════════
          ABOVE-FOLD KPI STRIP (mobile: order 1 — first thing on screen)
          4 cards: Net Worth / Cash Today / Monthly Surplus / Deposit Power
          + Forecast selector badge
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pt-3 pb-2 db-section-hero-kpis">
        <div className="grid grid-cols-2 gap-2 mb-2">
          {/* Net Worth */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70 mb-0.5">Net Worth</div>
            <div className="text-base font-extrabold tabular-nums text-amber-400 leading-tight">{maskValue(formatCurrency(netWorth, true), privacyMode)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Total · Brisbane QLD</div>
          </div>
          {/* Cash Today */}
          <div className="rounded-xl border border-border bg-card px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Cash Today</div>
            <div className="text-base font-extrabold tabular-nums leading-tight" style={{ color: "hsl(210,80%,65%)" }}>{maskValue(formatCurrency(totalLiquidCash, true), privacyMode)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">All liquid cash + offset</div>
          </div>
          {/* Monthly Surplus */}
          <div className="rounded-xl border border-border bg-card px-3 py-2.5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-0.5">Monthly Surplus</div>
            <div className="text-base font-extrabold tabular-nums leading-tight" style={{ color: surplus >= 0 ? "hsl(142,60%,52%)" : "hsl(0,72%,58%)" }}>{maskValue(formatCurrency(surplus, true), privacyMode)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">{maskValue(formatCurrency(surplus * 12, true), privacyMode)}/yr</div>
          </div>
          {/* Deposit Power */}
          <div className="rounded-xl border px-3 py-2.5" style={{ borderColor: "hsl(43,90%,30%)", background: "hsl(43,90%,6%)" }}>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-0.5" style={{ color: "hsl(43,90%,50%)" }}>Deposit Power</div>
            <div className="text-base font-extrabold tabular-nums leading-tight" style={{ color: "hsl(43,90%,62%)" }}>{maskValue(formatCurrency(dpTotal, true), privacyMode)}</div>
            <div className="text-[10px] mt-0.5" style={{ color: "hsl(43,70%,45%)" }}>{Math.round(dpReadiness)}% IP ready</div>
          </div>
        </div>
        {/* Forecast selector badge — always visible */}
        <Link href="/ai-forecast-engine">
          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all hover:brightness-110 ${
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
            title="Tap to change forecast mode"
          >
            <Activity className="w-3 h-3" />
            Forecast: {
              forecastMode === "monte-carlo"
                ? `Monte Carlo${monteCarloResult ? " (median)" : " (not run)"}`
                : forecastMode === "year-by-year"
                ? "Year-by-Year (custom)"
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

      {/* ══════════════════════════════════════════════════════════════════
          WEALTH FLOW BANNER
          ═════════════════════════════════════════════════════════════════ */}
      <div className="db-section-networth"><WealthFlowBanner /></div>

      {/* ══════════════════════════════════════════════════════════════════
          HERO SECTION
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pt-4 pb-4 db-section-networth">
        <div className="flex flex-col lg:flex-row gap-4 items-stretch">

          {/* Left — Family welcome card */}
          <div className="flex-1 rounded-2xl border border-border bg-card p-5 flex gap-4 items-center min-w-0">
            {/* Family photo */}
            <div className="shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 border-amber-500/30">
              <img src={familyImg} alt="Family" className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-0.5">Welcome Back</div>
              <div className="text-2xl font-extrabold tracking-tight text-foreground leading-tight">Fara &amp; Roham</div>
              <div className="text-sm font-semibold text-muted-foreground mt-0.5">Family Net Worth Command Center</div>
              <div className="text-xs text-muted-foreground/70 mt-0.5">Building Wealth for the Kids</div>
            </div>
          </div>

          {/* Right — Net worth + controls */}
          <div className="rounded-2xl border border-border bg-card p-5 flex flex-col justify-between min-w-[260px]">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Estimated Net Worth</div>
              <div className="text-4xl font-extrabold text-amber-400 tabular-nums leading-none mb-1">
                {maskValue(formatCurrency(netWorth, true), privacyMode)}
              </div>
              <div className="text-xs text-muted-foreground">Brisbane, QLD · AUD</div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={togglePrivacy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
              >
                {privacyMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {privacyMode ? "Show Values" : "Hide Values"}
              </button>
              <button
                onClick={handleSyncFromCloud}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
                Sync From Cloud
              </button>
            </div>
          </div>
        </div>

        {/* Income source + Forecast Mode badges — hidden on mobile (shown in hero-kpis strip instead) */}
        <div className="mt-3 flex flex-wrap gap-2 db-hero-badges">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Income source: Income Tracker ({activeIncomeSources > 0 ? activeIncomeSources : 3} active sources · {formatCurrency(snap.monthly_income, true)}/mo)
          </span>
          <Link href="/ai-forecast-engine">
            <span
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all hover:brightness-110 ${
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
              data-testid="badge-forecast-mode"
              title="Click to open Forecast Engine"
            >
              <Activity className="w-3 h-3" />
              Forecast: {
                forecastMode === "monte-carlo"
                  ? `Monte Carlo${monteCarloResult ? " (median)" : " (not run)"}`
                  : forecastMode === "year-by-year"
                  ? "Year-by-Year (custom)"
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
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          KPI CARDS
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-2 db-section-keycards">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="MONTHLY SURPLUS"
            value={maskValue(formatCurrency(surplus, true), privacyMode)}
            subValue={`${maskValue(formatCurrency(surplus * 12, true), privacyMode)} / year`}
            trend={surplus >= 0 ? 1 : -1}
            icon={<PiggyBank />}
            accent="hsl(142,60%,45%)"
          />
          <KpiCard
            label="TOTAL INVESTMENTS"
            value={maskValue(formatCurrency(stocksTotal + cryptoTotal, true), privacyMode)}
            subValue={stocksTotal + cryptoTotal === 0 ? "— Stocks + Crypto" : `Stocks: ${formatCurrency(stocksTotal, true)}`}
            icon={<BarChart2 />}
            accent="hsl(210,75%,52%)"
          />
          <KpiCard
            label="PROPERTY EQUITY"
            value={maskValue(formatCurrency(propertyEquity, true), privacyMode)}
            subValue={`${Math.round((propertyEquity / (snap.ppor || 1)) * 100)}% LVR met`}
            icon={<Home />}
            accent="hsl(188,60%,48%)"
          />
          <KpiCard
            label="DEBT BALANCE"
            value={maskValue(formatCurrency(totalLiab, true), privacyMode)}
            subValue="Mortgage + Debts"
            trend={-1}
            icon={<CreditCard />}
            accent="hsl(5,70%,52%)"
          />
          <KpiCard
            label="PASSIVE INCOME"
            value={maskValue(formatCurrency(passiveIncome, true), privacyMode)}
            subValue="Rental + Dividends"
            icon={<Landmark />}
            accent="hsl(145,55%,42%)"
          />
          <KpiCard
            label="SUPER (COMBINED)"
            value={maskValue(formatCurrency(_totalSuperNow, true), privacyMode)}
            subValue={`At 60: ${maskValue(formatCurrency(_totalSuperNow * Math.pow(1.07, 24), true), privacyMode)}`}
            icon={<Briefcase />}
            accent="hsl(43,85%,55%)"
          />
        </div>

      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ACCESSIBLE / LOCKED / TOTAL NET WORTH + CASH PROJECTIONS
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pt-4 pb-2 db-section-keycards">
        {/* 3 wealth split cards */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Accessible Wealth</div>
            <div className="text-xl font-bold text-foreground tabular-nums">{maskValue(formatCurrency(accessibleNW, true), privacyMode)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Available now ex-super</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Locked Retirement Wealth</div>
            <div className="text-xl font-bold text-amber-400 tabular-nums">{maskValue(formatCurrency(lockedNW, true), privacyMode)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Superannuation — access at 60</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Total Net Worth</div>
            <div className="text-xl font-bold text-emerald-400 tabular-nums">{maskValue(formatCurrency(netWorth, true), privacyMode)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Accessible + Super combined</div>
          </div>
        </div>

        {/* cash projection cards */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Cash Today</div>
            <div className="text-lg font-bold tabular-nums mb-2" style={{ color: "hsl(210,80%,65%)" }}>{maskValue(formatCurrency(totalLiquidCash, true), privacyMode)}</div>
            {/* Audit breakdown — reads directly from ledger, no forecast */}
            <div className="space-y-0.5 border-t border-border/40 pt-2">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Everyday Cash</span>
                <span className="tabular-nums text-foreground">{maskValue(formatCurrency(snap.cash, true), privacyMode)}</span>
              </div>
              {snap.savings_cash > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Savings</span>
                  <span className="tabular-nums text-foreground">{maskValue(formatCurrency(snap.savings_cash, true), privacyMode)}</span>
                </div>
              )}
              {snap.emergency_cash > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Emergency Cash</span>
                  <span className="tabular-nums text-foreground">{maskValue(formatCurrency(snap.emergency_cash, true), privacyMode)}</span>
                </div>
              )}
              {_safeOtherCash > 0 && (
                <div className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">Other Cash</span>
                  <span className="tabular-nums text-foreground">{maskValue(formatCurrency(_safeOtherCash, true), privacyMode)}</span>
                </div>
              )}
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Offset Balance</span>
                <span className="tabular-nums text-foreground">{maskValue(formatCurrency(snap.offset_balance, true), privacyMode)}</span>
              </div>
              <div className="flex justify-between text-[11px] font-semibold border-t border-border/40 pt-0.5 mt-0.5">
                <span style={{ color: "hsl(210,80%,65%)" }}>Total Liquid</span>
                <span className="tabular-nums" style={{ color: "hsl(210,80%,65%)" }}>{maskValue(formatCurrency(totalLiquidCash, true), privacyMode)}</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Next Major Event</div>
            <div className="text-sm font-bold text-amber-400 truncate">
              {nextPropEvent ? nextPropEvent.label : "No events scheduled"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {nextPropEvent ? nextPropEvent.monthKey : "—"}
            </div>
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════════════════════════════════
          WEALTH HEALTH CARDS (6 cards — paired evenly on mobile & desktop)
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4 db-section-keycards">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {wealthCards.map((card) => (
            <div
              key={card.label}
              className={`rounded-xl border p-4 bg-card ${card.alert ? "border-red-500/30" : "border-border"}`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</span>
                <card.Icon className={`w-3.5 h-3.5 ${card.alert ? "text-red-400" : "text-muted-foreground"}`} />
              </div>
              <div className={`text-lg font-bold tabular-nums ${card.alert ? "text-red-400" : "text-foreground"}`}>
                {card.value}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{card.sub}</div>
            </div>
          ))}
          {/* Emergency Buffer — moved here so it pairs with Hidden Money on mobile */}
          <div className={`rounded-xl border p-4 bg-card ${(totalLiquidCash) < snap.monthly_expenses * 3 ? "border-red-500/30" : "border-border"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Emergency Buffer</span>
              <Shield className={`w-3.5 h-3.5 ${(totalLiquidCash) < snap.monthly_expenses * 3 ? "text-red-400" : "text-muted-foreground"}`} />
            </div>
            <div className={`text-lg font-bold ${(totalLiquidCash) >= snap.monthly_expenses * 3 ? "text-emerald-400" : "text-red-400"}`}>
              {(totalLiquidCash) >= snap.monthly_expenses * 3 ? "Healthy" : "Low"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">${Math.round(snap.monthly_expenses * 3 / 1000)}k reserve target</div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ALERTS / WARNINGS — bills, liquidity stress, quick stats
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-2 db-section-keycards">
        {hasLiquidityStress && (
          <div className="mb-2 rounded-xl border border-red-500/40 bg-red-500/8 px-4 py-3 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-bold text-red-400">Liquidity Stress Detected</div>
              <div className="text-xs text-muted-foreground mt-0.5">Cash goes negative in: {negativeCashMonths.join(", ")}</div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="rounded-xl border border-border bg-card px-3 py-2 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground tabular-nums">{upcomingBillsCount}</div>
              <div className="text-[10px] text-muted-foreground">Upcoming Bills</div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-2 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Target className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground tabular-nums">{budgetsSetCount}</div>
              <div className="text-[10px] text-muted-foreground">Budget Status</div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-2 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-foreground tabular-nums">{alertsSent24h}</div>
              <div className="text-[10px] text-muted-foreground">Alerts Sent</div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-2 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div>
              <div className="text-xs font-bold text-foreground tabular-nums">{maskValue(formatCurrency(cashAfterBills, true), privacyMode)}</div>
              <div className="text-[10px] text-muted-foreground">Cash After Bills</div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          WEALTH DECISION CENTER
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4 db-section-cashflow">
        {/* Section header */}
        <div className="mb-4">
          <div className="text-lg font-bold text-foreground tracking-tight">Wealth Decision Center</div>
          <div className="text-xs text-muted-foreground mt-0.5">Your money today, future path, and next best moves.</div>
        </div>

        {/* Main layout: 70% chart + 30% panel */}
        <div className="flex flex-col lg:flex-row gap-4">

          {/* LEFT: Interactive Smart Chart — Fix 7: overflow-hidden prevents mobile bleed */}
          <div className="flex-[7] min-w-0 rounded-2xl border border-border bg-card p-5 overflow-hidden">

            {/* Tab bar */}
            <div className="flex gap-1 mb-4 flex-wrap">
              {(["CASH","EVENTS","WEALTH","RISK"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setWdcTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                    wdcTab === tab
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "text-muted-foreground border border-transparent hover:text-foreground hover:border-border"
                  }`}
                >
                  {tab}
                </button>
              ))}
              {wdcTab === "CASH" && (
                <div className="ml-auto flex gap-1.5 items-center flex-wrap">
                  {/* Monthly / Annual toggle — Fix 2: drives masterCFData switch */}
                  <div className="flex gap-0.5 rounded-lg border border-border/60 p-0.5 bg-background/40">
                    <button
                      className={`px-2 py-0.5 rounded text-xs font-semibold transition-all ${
                        cashFlowView === "annual"
                          ? "bg-primary/20 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setChartView("annual")}
                    >Annual</button>
                    <button
                      className={`px-2 py-0.5 rounded text-xs font-semibold transition-all ${
                        cashFlowView === "monthly"
                          ? "bg-primary/20 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setChartView("monthly")}
                    >Monthly</button>
                  </div>
                  <div className="w-px h-4 bg-border/60" />
                  <button
                    className={`px-2 py-1 rounded text-xs font-medium transition-all ${ngRefundMode === "lump-sum" ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground border border-border hover:text-foreground"}`}
                    onClick={() => setNgRefundMode("lump-sum")}
                  >Lump-sum</button>
                  <button
                    className={`px-2 py-1 rounded text-xs font-medium transition-all ${ngRefundMode === "payg" ? "bg-primary/20 text-primary border border-primary/30" : "text-muted-foreground border border-border hover:text-foreground"}`}
                    onClick={() => setNgRefundMode("payg")}
                  >PAYG</button>
                  <div className="w-px h-4 bg-border/60" />
                  {/* View mode: Cash / Cash+Equity / Deposit Power */}
                  <div className="flex gap-0.5 rounded-lg border border-border/60 p-0.5 bg-background/40">
                    {([["cash","Cash"],["equity","+ Equity"],["deposit","Dep. Power"]] as const).map(([mode, lbl]) => (
                      <button key={mode} onClick={() => setCfViewMode(mode as any)}
                        className={`px-2 py-0.5 rounded text-xs font-semibold transition-all ${cfViewMode === mode ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                      >{lbl}</button>
                    ))}
                  </div>
                </div>
              )}
              {wdcTab === "WEALTH" && (
                <div className="ml-auto flex gap-1">
                  {(["1Y","3Y","10Y"] as const).map(r => (
                    <button key={r} onClick={() => setChartRange(r)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-all ${chartRange === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground border border-border"}`}
                    >{r}</button>
                  ))}
                </div>
              )}
            </div>

            {/* TAB: CASH */}
            {wdcTab === "CASH" && (
              <>
                {/* Deposit Power — Full Waterfall Breakdown */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Unlock className="w-3.5 h-3.5" style={{ color: "hsl(188,60%,52%)" }} />
                    <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "hsl(188,60%,52%)" }}>Deposit Power &amp; Usable Equity</span>
                    <span className="text-xs ml-auto" style={{ color: "hsl(215,12%,45%)" }}>Today's snapshot</span>
                  </div>

                  {/* Waterfall formula card */}
                  <div className="rounded-xl border border-border overflow-hidden mb-2" style={{ background: "hsl(220,18%,10%)" }}>
                    {/* +  Cash + Offset */}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold w-3" style={{ color: "hsl(210,80%,65%)" }}>+</span>
                        <span className="text-xs text-muted-foreground">Cash + Offset</span>
                      </div>
                      <span className="text-xs font-bold tabular-nums" style={{ color: "hsl(210,80%,65%)" }}>
                        {maskValue(formatCurrency(depositPowerResult?.cashAndOffset ?? (totalLiquidCash), true), privacyMode)}
                      </span>
                    </div>

                    {/* +  PPOR Usable Equity */}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold w-3" style={{ color: "hsl(188,60%,52%)" }}>+</span>
                        <span className="text-xs text-muted-foreground">
                          PPOR Usable Equity (80%)
                          {depositPowerResult?.pporEquity && (
                            <span className="ml-1" style={{ color: "hsl(215,12%,45%)" }}>
                              LVR {(depositPowerResult.pporEquity.currentLVR * 100).toFixed(0)}%
                            </span>
                          )}
                        </span>
                      </div>
                      <span className="text-xs font-bold tabular-nums" style={{ color: "hsl(188,60%,52%)" }}>
                        {maskValue(formatCurrency(depositPowerResult?.pporEquity?.usableEquity ?? 0, true), privacyMode)}
                      </span>
                    </div>

                    {/* +  IP Usable Equity */}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold w-3" style={{ color: "hsl(145,55%,45%)" }}>+</span>
                        <span className="text-xs text-muted-foreground">
                          IP Usable Equity (80%)
                          <span className="ml-1" style={{ color: "hsl(215,12%,45%)" }}>
                            {depositPowerResult?.ipEquityList?.length ?? 0} IP{(depositPowerResult?.ipEquityList?.length ?? 0) !== 1 ? "s" : ""}
                          </span>
                        </span>
                      </div>
                      <span className="text-xs font-bold tabular-nums" style={{ color: "hsl(145,55%,45%)" }}>
                        {maskValue(formatCurrency((depositPowerResult?.ipEquityList ?? []).reduce((s: number, p: any) => s + p.usableEquity, 0), true), privacyMode)}
                      </span>
                    </div>

                    {/* =  Gross Total (subtotal line) */}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border/50" style={{ background: "hsl(220,18%,13%)" }}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold w-3" style={{ color: "hsl(215,12%,55%)" }}>=</span>
                        <span className="text-xs" style={{ color: "hsl(215,12%,55%)" }}>Gross Total</span>
                      </div>
                      <span className="text-xs tabular-nums" style={{ color: "hsl(215,12%,65%)" }}>
                        {maskValue(formatCurrency(depositPowerResult?.totalDepositPowerRaw ?? 0, true), privacyMode)}
                      </span>
                    </div>

                    {/* −  Emergency Buffer */}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold w-3" style={{ color: "hsl(0,72%,58%)" }}>−</span>
                        <span className="text-xs text-muted-foreground">Emergency Buffer</span>
                      </div>
                      <span className="text-xs font-bold tabular-nums" style={{ color: "hsl(0,72%,58%)" }}>
                        {maskValue(formatCurrency(emergencyBuffer, true), privacyMode)}
                      </span>
                    </div>

                    {/* =  Total Deposit Power (highlight) */}
                    <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "hsl(43,90%,10%)", borderTop: "1px solid hsl(43,90%,28%)" }}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold w-3" style={{ color: "hsl(43,90%,62%)" }}>=</span>
                        <span className="text-xs font-bold" style={{ color: "hsl(43,90%,62%)" }}>Total Deposit Power</span>
                      </div>
                      <span className="text-sm font-bold tabular-nums" style={{ color: "hsl(43,90%,62%)" }}>
                        {maskValue(formatCurrency(depositPowerResult?.totalDepositPower ?? 0, true), privacyMode)}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Readiness metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                    {/* PPOR LVR */}
                    <div className="rounded-xl bg-background/60 border border-border px-3 py-2">
                      <div className="text-xs text-muted-foreground mb-0.5">PPOR LVR</div>
                      <div className="text-sm font-bold tabular-nums" style={{ color: "hsl(188,60%,52%)" }}>
                        {depositPowerResult?.pporEquity
                          ? `${(depositPowerResult.pporEquity.currentLVR * 100).toFixed(0)}%`
                          : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {depositPowerResult?.pporEquity ? "Current LVR" : "No PPOR"}
                      </div>
                    </div>
                    {/* IP count */}
                    <div className="rounded-xl bg-background/60 border border-border px-3 py-2">
                      <div className="text-xs text-muted-foreground mb-0.5">IPs Held</div>
                      <div className="text-sm font-bold tabular-nums" style={{ color: "hsl(145,55%,45%)" }}>
                        {depositPowerResult?.ipEquityList?.length ?? 0}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">Investment propert{(depositPowerResult?.ipEquityList?.length ?? 0) === 1 ? "y" : "ies"}</div>
                    </div>
                    {/* Readiness % */}
                    <div className="rounded-xl bg-background/60 border border-border px-3 py-2">
                      <div className="text-xs text-muted-foreground mb-0.5">IP Readiness</div>
                      <div className="text-sm font-bold tabular-nums" style={{ color: (depositPowerResult?.readinessPct ?? 0) >= 100 ? "hsl(142,60%,52%)" : "hsl(43,90%,58%)" }}>
                        {Math.round(depositPowerResult?.readinessPct ?? 0)}%
                      </div>
                      <div className="h-1 rounded-full bg-border mt-1.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, depositPowerResult?.readinessPct ?? 0)}%`, background: (depositPowerResult?.readinessPct ?? 0) >= 100 ? "hsl(142,55%,42%)" : "hsl(43,85%,52%)" }} />
                      </div>
                    </div>
                    {/* Est. Ready Date */}
                    <div className="rounded-xl bg-background/60 border border-border px-3 py-2">
                      <div className="text-xs text-muted-foreground mb-0.5">Est. Ready Date</div>
                      <div className="text-sm font-bold tabular-nums" style={{ color: depositPowerResult?.isEquityRichCashPoor ? "hsl(43,90%,62%)" : depositPowerResult?.isReady ? "hsl(142,60%,52%)" : "hsl(215,15%,65%)" }}>
                        {depositPowerResult?.isEquityRichCashPoor
                          ? "⚠ Equity Rich"
                          : depositPowerResult?.isReady
                            ? "Ready Now"
                            : depositPowerResult?.estimatedReadyDate
                              ? new Date(depositPowerResult.estimatedReadyDate).toLocaleDateString("en-AU", { month: "short", year: "numeric" })
                              : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {depositPowerResult?.isEquityRichCashPoor ? "/ Cash Poor" : depositPowerResult?.isReady ? "Deposit ready" : "Projected"}
                      </div>
                    </div>
                  </div>

                  {/* Equity-rich / Cash-poor warning banner */}
                  {depositPowerResult?.isEquityRichCashPoor && (
                    <div className="mb-2 rounded-xl px-4 py-2.5 flex items-start gap-2.5"
                      style={{ background: "hsl(43,90%,10%)", border: "1px solid hsl(43,90%,35%)" }}>
                      <span style={{ fontSize: 16, lineHeight: 1.4 }}>⚠</span>
                      <div>
                        <div className="text-xs font-bold" style={{ color: "hsl(43,90%,62%)" }}>Equity Rich / Cash Poor</div>
                        <div className="text-xs mt-0.5" style={{ color: "hsl(43,70%,52%)" }}>
                          Your equity covers the deposit requirement, but your closing cash would fall below the emergency buffer after settlement.
                          Consider refinancing to release equity as cash before purchasing, or building more liquid savings first.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Funding sources chips */}
                  {(depositPowerResult?.fundingSources ?? []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {depositPowerResult!.fundingSources.map((fs: any, i: number) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg" style={{ background: `${fs.color}18`, border: `1px solid ${fs.color}40`, color: fs.color }}>
                          {fs.type === "cash" ? <DollarSign className="w-3 h-3" /> : fs.type === "equity" ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                          {fs.label}: {formatCurrency(fs.amount, true)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* CF KPI row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                  {[
                    // Cash Today MUST read from ledger (totalLiquidCash), never from forecast/chart data
                    { label: "Cash Today",                                                                                                   val: formatCurrency(totalLiquidCash, true), color: "hsl(210,80%,65%)" },
                    { label: cashFlowView === "monthly" ? `${cashFlowSeries[cashFlowSeries.length-1]?.label ?? "Future"} Cash` : `${new Date().getFullYear()+9} Cash`, val: formatCurrency(cfLast.balance ?? 0, true), color: "hsl(142,60%,52%)" },
                    { label: cashFlowView === "monthly" ? "Monthly Net CF" : "Annual Net CF",                                                val: formatCurrency(cfFirst.netCF ?? 0, true), color: (cfFirst.netCF??0)>=0?"hsl(142,60%,52%)":"hsl(0,72%,58%)" },
                    { label: "Tax Refund/yr",                                                                                                val: `+${formatCurrency(ngSummary.totalAnnualTaxBenefit, true)}`, color: "hsl(43,90%,58%)" },
                  ].map(k => (
                    <div key={k.label} className="rounded-xl bg-background/60 border border-border px-3 py-2">
                      <div className="text-xs text-muted-foreground mb-0.5">{k.label}</div>
                      <div className="text-sm font-bold tabular-nums" style={{ color: k.color }}>{maskValue(k.val, privacyMode)}</div>
                    </div>
                  ))}
                </div>

                {/* Chart type toggle — Fix 5 */}
                <div className="flex items-center gap-1 mb-3">
                  {(["combo", "line", "candlestick"] as const).map(ct => (
                    <button
                      key={ct}
                      onClick={() => setWdcChartType(ct)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                        wdcChartType === ct
                          ? "bg-primary/20 text-primary border border-primary/30"
                          : "text-muted-foreground border border-border/50 hover:text-foreground"
                      }`}
                    >
                      {ct === "combo" ? "Combo" : ct === "line" ? "Line" : "Candlestick"}
                    </button>
                  ))}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {wdcChartType === "combo" ? "Balance line + Net CF bars" : wdcChartType === "line" ? "Cash balance only" : "OHLC balance movement"}
                  </span>
                </div>

                {/* Chart — Fix 1: increased height to 360px, Fix 7: responsive */}
                <div className="w-full" style={{ height: 360, touchAction: "none", userSelect: "none" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    {wdcChartType === "line" ? (
                      <LineChart
                        data={masterCFData}
                        margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
                        onClick={handleChartTap}
                      >
                        <defs>
                          <linearGradient id="wdcBalGradLine" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="hsl(210,80%,62%)" stopOpacity={0.20} />
                            <stop offset="100%" stopColor="hsl(210,80%,62%)" stopOpacity={0.01} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,15%,17%)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(215,12%,45%)", fontWeight: 600 }} axisLine={false} tickLine={false}
                          interval={cashFlowView === "monthly" ? Math.floor(masterCFData.length / 8) : 0} />
                        <YAxis yAxisId="bal" orientation="left" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 9, fill: "hsl(215,12%,38%)" }} axisLine={false} tickLine={false} width={50} />
                        <Tooltip content={<CashflowTooltip />} cursor={{ stroke: "hsl(215,12%,40%)", strokeWidth: 1 }} />
                        {masterCFData.map((d: any) =>
                          d._milestones?.length > 0 ? (
                            <ReferenceLine key={d.label} yAxisId="bal" x={d.label}
                              stroke="hsl(43,80%,50%)" strokeDasharray="4 3" strokeOpacity={0.45} strokeWidth={1} />
                          ) : null
                        )}
                        <Line yAxisId="bal" type="monotone" dataKey="balance" name="Cash Balance"
                          stroke="hsl(210,80%,65%)" strokeWidth={2.5}
                          dot={<MilestoneDot />} activeDot={{ r: 5, fill: "hsl(210,80%,65%)", strokeWidth: 0 }} />
                        {cfViewMode !== "cash" && (
                          <Line yAxisId="bal" type="monotone" dataKey="usableEquity" name="Usable Equity"
                            stroke="hsl(188,60%,52%)" strokeWidth={1.8} dot={false} strokeDasharray="5 3" />
                        )}
                        {cfViewMode === "deposit" && (
                          <Line yAxisId="bal" type="monotone" dataKey="totalDepositPower" name="Deposit Power"
                            stroke="hsl(43,90%,58%)" strokeWidth={2} dot={false} />
                        )}
                      </LineChart>
                    ) : wdcChartType === "candlestick" ? (
                      // Candlestick — use ComposedChart with a custom Bar showing OHLC-style balance movement
                      // open = prev year balance, close = this year balance, bar height = |close-open|
                      <ComposedChart
                        onClick={handleChartTap}
                        data={masterCFData.map((d: any, i: number) => ({
                          ...d,
                          open:   i === 0 ? d.balance : (masterCFData[i-1] as any).balance,
                          close:  d.balance,
                          high:   Math.max(d.balance, i === 0 ? d.balance : (masterCFData[i-1] as any).balance),
                          low:    Math.min(d.balance, i === 0 ? d.balance : (masterCFData[i-1] as any).balance),
                          barY:   Math.min(d.balance, i === 0 ? d.balance : (masterCFData[i-1] as any).balance),
                          barH:   Math.abs(d.balance - (i === 0 ? d.balance : (masterCFData[i-1] as any).balance)),
                          isUp:   d.balance >= (i === 0 ? d.balance : (masterCFData[i-1] as any).balance),
                        }))}
                        margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,15%,17%)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(215,12%,45%)", fontWeight: 600 }} axisLine={false} tickLine={false}
                          interval={cashFlowView === "monthly" ? Math.floor(masterCFData.length / 8) : 0} />
                        <YAxis yAxisId="bal" orientation="left" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 9, fill: "hsl(215,12%,38%)" }} axisLine={false} tickLine={false} width={50} />
                        <Tooltip content={<CashflowTooltip />} cursor={{ fill: "hsl(222,15%,16%)", fillOpacity: 0.5 }} />
                        {masterCFData.map((d: any) =>
                          d._milestones?.length > 0 ? (
                            <ReferenceLine key={d.label} yAxisId="bal" x={d.label}
                              stroke="hsl(43,80%,50%)" strokeDasharray="4 3" strokeOpacity={0.45} strokeWidth={1} />
                          ) : null
                        )}
                        {/* Candlestick body bar */}
                        <Bar yAxisId="bal" dataKey="balance" name="Cash Balance" radius={[3,3,0,0]} maxBarSize={28}>
                          {masterCFData.map((d: any, i: number) => {
                            const prevBal = i === 0 ? d.balance : (masterCFData[i-1] as any).balance;
                            const isUp = d.balance >= prevBal;
                            return <Cell key={i} fill={isUp ? "hsl(142,55%,40%)" : "hsl(0,65%,50%)"} fillOpacity={0.85} />;
                          })}
                        </Bar>
                        {/* Wick line rendered as an Area with near-zero width */}
                        <Line yAxisId="bal" type="monotone" dataKey="balance" name="Trend"
                          stroke="hsl(210,80%,65%)" strokeWidth={1.5} dot={false} strokeDasharray="3 3" strokeOpacity={0.4} />
                      </ComposedChart>
                    ) : (
                      // DEFAULT: Combo — Balance area + Net CF bars
                      <ComposedChart
                        data={masterCFData}
                        margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
                        onClick={handleChartTap}
                      >
                        <defs>
                          <linearGradient id="wdcBalGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="hsl(210,80%,62%)" stopOpacity={0.20} />
                            <stop offset="100%" stopColor="hsl(210,80%,62%)" stopOpacity={0.01} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,15%,17%)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(215,12%,45%)", fontWeight: 600 }} axisLine={false} tickLine={false}
                          interval={cashFlowView === "monthly" ? Math.floor(masterCFData.length / 8) : 0} />
                        <YAxis yAxisId="bal" orientation="left" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 9, fill: "hsl(215,12%,38%)" }} axisLine={false} tickLine={false} width={50} />
                        <YAxis yAxisId="cf" orientation="right" tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 9, fill: "hsl(215,12%,38%)" }} axisLine={false} tickLine={false} width={44} />
                        <Tooltip content={<CashflowTooltip />} cursor={{ fill: "hsl(222,15%,16%)", fillOpacity: 0.6 }} />
                        <ReferenceLine yAxisId="cf" y={0} stroke="hsl(222,15%,26%)" strokeDasharray="3 3" />
                        {masterCFData.map((d: any) =>
                          d._milestones?.length > 0 ? (
                            <ReferenceLine key={d.label} yAxisId="bal" x={d.label}
                              stroke="hsl(43,80%,50%)" strokeDasharray="4 3" strokeOpacity={0.45} strokeWidth={1} />
                          ) : null
                        )}
                        <Bar yAxisId="cf" dataKey="netCF" name="Net Cashflow" radius={[3,3,0,0]} maxBarSize={32}>
                          {masterCFData.map((d: any, i: number) => (
                            <Cell key={i} fill={(d.netCF??0)>=0 ? "hsl(142,55%,40%)" : "hsl(0,65%,50%)"} fillOpacity={0.7} />
                          ))}
                        </Bar>
                        <Area yAxisId="bal" type="monotone" dataKey="balance" name="Cash Balance"
                          stroke="hsl(210,80%,65%)" strokeWidth={2.5} fill="url(#wdcBalGrad)"
                          dot={<MilestoneDot />} activeDot={{ r: 5, fill: "hsl(210,80%,65%)", strokeWidth: 0 }} />
                        {/* Equity overlay lines */}
                        {cfViewMode !== "cash" && (
                          <Line yAxisId="bal" type="monotone" dataKey="usableEquity" name="Usable Equity"
                            stroke="hsl(188,60%,52%)" strokeWidth={1.8} dot={false} strokeDasharray="5 3"
                            activeDot={{ r: 4, fill: "hsl(188,60%,52%)", strokeWidth: 0 }} />
                        )}
                        {cfViewMode === "deposit" && (
                          <Line yAxisId="bal" type="monotone" dataKey="totalDepositPower" name="Deposit Power"
                            stroke="hsl(43,90%,58%)" strokeWidth={2} dot={false}
                            activeDot={{ r: 4, fill: "hsl(43,90%,58%)", strokeWidth: 0 }} />
                        )}
                      </ComposedChart>
                    )}
                  </ResponsiveContainer>
                </div>

                {/* Legend row */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-3 pt-3 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-block w-6 h-0.5 rounded" style={{ background: "hsl(210,80%,65%)" }} />Cash Balance
                  </div>
                  {cfViewMode !== "cash" && (
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: "hsl(188,60%,52%)" }}>
                      <span className="inline-block w-6 h-0.5 rounded border border-current" style={{ borderStyle: "dashed" }} />Usable Equity
                    </div>
                  )}
                  {cfViewMode === "deposit" && (
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: "hsl(43,90%,58%)" }}>
                      <span className="inline-block w-6 h-0.5 rounded" style={{ background: "hsl(43,90%,58%)" }} />Deposit Power
                    </div>
                  )}
                  {wdcChartType !== "line" && (
                    <>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsl(142,55%,40%)", opacity: 0.8 }} />{wdcChartType === "candlestick" ? "Up" : "Net CF +"}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "hsl(0,65%,50%)", opacity: 0.8 }} />{wdcChartType === "candlestick" ? "Down" : "Net CF −"}
                      </div>
                    </>
                  )}
                  <div className="ml-auto flex flex-wrap gap-x-4 gap-y-1">
                    {[
                      { icon: "🏠", label: "Property",   color: "hsl(188,65%,52%)" },
                      { icon: "📈", label: "Stocks",     color: "hsl(210,80%,65%)" },
                      { icon: "₿",  label: "Crypto",     color: "hsl(262,70%,65%)" },
                      { icon: "💰", label: "Tax Refund", color: "hsl(43,90%,58%)"  },
                    ].map(m => (
                      <div key={m.label} className="flex items-center gap-1 text-xs" style={{ color: m.color }}>
                        <span>{m.icon}</span><span style={{ opacity: 0.8 }}>{m.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* TAB: EVENTS */}
            {wdcTab === "EVENTS" && (
              <div className="py-1">
                <div className="text-xs text-muted-foreground mb-5">Milestone timeline — your wealth journey mapped out</div>
                <div className="relative">
                  <div className="absolute left-[18px] top-0 bottom-0 w-px bg-border" />
                  <div className="space-y-0">
                    {[
                      { year: new Date().getFullYear(), icon: "📍", label: "Deposit Build", sub: `${maskValue(formatCurrency(totalLiquidCash, true), privacyMode)} liquid today`, color: "hsl(210,80%,65%)", active: true },
                      ...((properties as any[]).filter((p: any) => p.type !== "ppor" && p.settlement_date).map((p: any) => ({
                        year: new Date(p.settlement_date).getFullYear(),
                        icon: "🏠",
                        label: `Buy IP — ${p.label || (p.address ?? "").split(",")[0] || "Investment Property"}`,
                        sub: `Deposit ~${maskValue(formatCurrency(p.deposit ?? 0, true), privacyMode)} · Loan ${maskValue(formatCurrency(p.loan_amount ?? 0, true), privacyMode)}`,
                        color: "hsl(188,65%,52%)",
                        active: false,
                      }))),
                      ...(() => {
                        // Group planned stock orders by month — collapses 8 tickers in Nov 2026 into single "Stocks — $30,000" row
                        const stockByMonth = new Map<string, { date: Date; total: number; count: number }>();
                        (ordersRaw as any[]).filter((o: any) => o.status === "planned" && o.planned_date && o.action === "buy").forEach((o: any) => {
                          const d = new Date(o.planned_date);
                          const key = `${d.getFullYear()}-${d.getMonth()}`;
                          const cur = stockByMonth.get(key) ?? { date: new Date(d.getFullYear(), d.getMonth(), 1), total: 0, count: 0 };
                          cur.total += safeNum(o.amount_aud);
                          cur.count += 1;
                          stockByMonth.set(key, cur);
                        });
                        return Array.from(stockByMonth.values()).map(({ date, total, count }) => ({
                          year: date.getFullYear(),
                          icon: "📈",
                          label: `Stocks — ${maskValue(formatCurrency(total, true), privacyMode)}`,
                          sub: `${date.toLocaleDateString("en-AU", { month: "short", year: "numeric" })}${count > 1 ? ` · ${count} orders` : ""}`,
                          color: "hsl(210,80%,65%)",
                          active: false,
                        }));
                      })(),
                      ...(() => {
                        // Group planned crypto orders by month
                        const cryptoByMonth = new Map<string, { date: Date; total: number; count: number }>();
                        (cryptoOrdersRaw as any[]).filter((o: any) => o.status === "planned" && o.planned_date && o.action === "buy").forEach((o: any) => {
                          const d = new Date(o.planned_date);
                          const key = `${d.getFullYear()}-${d.getMonth()}`;
                          const cur = cryptoByMonth.get(key) ?? { date: new Date(d.getFullYear(), d.getMonth(), 1), total: 0, count: 0 };
                          cur.total += safeNum(o.amount_aud);
                          cur.count += 1;
                          cryptoByMonth.set(key, cur);
                        });
                        return Array.from(cryptoByMonth.values()).map(({ date, total, count }) => ({
                          year: date.getFullYear(),
                          icon: "₿",
                          label: `Crypto — ${maskValue(formatCurrency(total, true), privacyMode)}`,
                          sub: `${date.toLocaleDateString("en-AU", { month: "short", year: "numeric" })}${count > 1 ? ` · ${count} orders` : ""}`,
                          color: "hsl(262,70%,65%)",
                          active: false,
                        }));
                      })(),
                      { year: new Date().getFullYear()+4, icon: "🔄", label: "Refinance", sub: "Review loan structure", color: "hsl(43,90%,58%)", active: false },
                      { year: new Date().getFullYear()+6, icon: "✅", label: "Debt Reduction", sub: "Aggressive paydown begins", color: "hsl(142,60%,52%)", active: false },
                      { year: parseInt(fireCard?.value?.replace("~","") ?? String(new Date().getFullYear()+9)), icon: "🔥", label: "FIRE Ready", sub: `Target age ${fireCard?.value ?? "—"} · ${maskValue(formatCurrency(fireTargetAmt, true), privacyMode)} portfolio`, color: "hsl(20,90%,60%)", active: false },
                    ]
                    .sort((a, b) => a.year - b.year)
                    .map((ev, i) => (
                      <div key={i} className="flex items-start gap-4 pb-6 last:pb-0 relative">
                        <div className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 border-2 ${ev.active ? "border-primary bg-primary/10" : "border-border bg-background"}`}>
                          {ev.icon}
                        </div>
                        <div className="pt-1.5 flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-bold tabular-nums" style={{ color: ev.color }}>{ev.year}</span>
                            <span className="text-sm font-semibold text-foreground truncate">{ev.label}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{ev.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: WEALTH */}
            {wdcTab === "WEALTH" && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                  {[
                    { label: "Net Worth Now",   val: formatCurrency(netWorth, true),    color: "hsl(210,80%,65%)" },
                    { label: "Total Assets",    val: formatCurrency(totalAssets, true), color: "hsl(142,60%,52%)" },
                    { label: "Total Debt",      val: formatCurrency(totalLiab, true),   color: "hsl(0,72%,58%)"   },
                    { label: `${new Date().getFullYear()+9} NW`, val: formatCurrency(year10NW, true), color: "hsl(43,90%,58%)" },
                  ].map(k => (
                    <div key={k.label} className="rounded-xl bg-background/60 border border-border px-3 py-2">
                      <div className="text-xs text-muted-foreground mb-0.5">{k.label}</div>
                      <div className="text-sm font-bold tabular-nums" style={{ color: k.color }}>{maskValue(k.val, privacyMode)}</div>
                    </div>
                  ))}
                </div>
                <div style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={filteredNWData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="wdcNWGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="hsl(210,75%,55%)" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="hsl(210,75%,55%)" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="wdcAssetGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor="hsl(142,55%,42%)" stopOpacity={0.18} />
                          <stop offset="100%" stopColor="hsl(142,55%,42%)" stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,15%,17%)" vertical={false} />
                      <XAxis dataKey="year" tick={{ fontSize: 10, fill: "hsl(215,12%,45%)" }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="nw" orientation="left" tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} tick={{ fontSize: 9, fill: "hsl(215,12%,38%)" }} axisLine={false} tickLine={false} width={50} />
                      <YAxis yAxisId="debt" orientation="right" tickFormatter={(v) => `$${(v/1000000).toFixed(1)}M`} tick={{ fontSize: 9, fill: "hsl(215,12%,38%)" }} axisLine={false} tickLine={false} width={44} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar yAxisId="debt" dataKey="liabilities" name="Debt" fill="hsl(0,65%,50%)" fillOpacity={0.45} radius={[2,2,0,0]} maxBarSize={20} />
                      <Area yAxisId="nw" type="monotone" dataKey="assets" name="Total Assets" stroke="hsl(142,55%,42%)" strokeWidth={1.5} fill="url(#wdcAssetGrad)" dot={false} />
                      <Area yAxisId="nw" type="monotone" dataKey="netWorth" name="Net Worth" stroke="hsl(210,75%,60%)" strokeWidth={2.5} fill="url(#wdcNWGrad)" dot={false} activeDot={{ r: 5, fill: "hsl(210,75%,60%)", strokeWidth: 0 }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border">
                  {assetAllocData.map((d: any) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.fill }} />
                      {d.name} <span className="font-semibold text-foreground">{d.pct.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* TAB: RISK */}
            {wdcTab === "RISK" && (() => {
              const liquidCash = totalLiquidCash;
              const totalMonthlyOut = snap.monthly_expenses + monthlyMortgageRepay;
              const monthsCov = totalMonthlyOut > 0 ? liquidCash / totalMonthlyOut : 0;
              const debtRatio = snap.monthly_income > 0 ? totalLiab / (snap.monthly_income * 12) : 0;
              const propPct = totalAssets > 0 ? (snap.ppor / totalAssets) * 100 : 0;
              const mktPct = totalAssets > 0 ? ((stocksTotal + cryptoTotal) / totalAssets) * 100 : 0;
              const risks = [
                { label: "Liquidity Risk",         score: monthsCov >= 6 ? 10 : monthsCov >= 3 ? 40 : monthsCov >= 1 ? 70 : 95, detail: `${monthsCov.toFixed(1)} months covered`,         color: monthsCov >= 6 ? "hsl(142,55%,45%)" : monthsCov >= 3 ? "hsl(43,90%,52%)" : "hsl(0,72%,55%)",   rating: monthsCov >= 6 ? "Low" : monthsCov >= 3 ? "Moderate" : "High" },
                { label: "Debt Risk",               score: debtRatio <= 3 ? 15 : debtRatio <= 5 ? 40 : debtRatio <= 8 ? 65 : 90, detail: `Debt/income: ${debtRatio.toFixed(1)}×`,         color: debtRatio <= 3 ? "hsl(142,55%,45%)" : debtRatio <= 5 ? "hsl(43,90%,52%)" : "hsl(0,72%,55%)",    rating: debtRatio <= 3 ? "Low" : debtRatio <= 5 ? "Moderate" : "High" },
                { label: "Income Dependency",       score: 65,                                                                    detail: "Single primary income source",                  color: "hsl(43,90%,52%)",                                                                                 rating: "Moderate" },
                { label: "Property Concentration",  score: propPct >= 70 ? 75 : propPct >= 50 ? 50 : 20,                         detail: `${propPct.toFixed(0)}% of assets in property`,  color: propPct >= 70 ? "hsl(0,72%,55%)" : propPct >= 50 ? "hsl(43,90%,52%)" : "hsl(142,55%,45%)",       rating: propPct >= 70 ? "High" : propPct >= 50 ? "Moderate" : "Low" },
                { label: "Market Risk",             score: mktPct >= 30 ? 60 : mktPct >= 15 ? 35 : 15,                          detail: `${mktPct.toFixed(0)}% in stocks & crypto`,      color: mktPct >= 30 ? "hsl(43,90%,52%)" : "hsl(142,55%,45%)",                                            rating: mktPct >= 30 ? "Moderate" : "Low" },
              ];
              const overallScore = Math.round(risks.reduce((s, r) => s + r.score, 0) / risks.length);
              const overallColor = overallScore >= 60 ? "hsl(0,72%,55%)" : overallScore >= 35 ? "hsl(43,90%,52%)" : "hsl(142,55%,45%)";
              const overallRating = overallScore >= 60 ? "High" : overallScore >= 35 ? "Moderate" : "Low";
              return (
                <>
                  <div className="flex items-center gap-4 mb-5 px-4 py-3 rounded-xl border border-border bg-background/60">
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Overall Risk Score</div>
                      <div className="text-2xl font-bold tabular-nums" style={{ color: overallColor }}>{overallScore}<span className="text-sm font-normal text-muted-foreground ml-0.5">/100</span></div>
                    </div>
                    <div className="h-8 w-px bg-border" />
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">Rating</div>
                      <div className="text-base font-bold" style={{ color: overallColor }}>{overallRating} Risk</div>
                    </div>
                    <div className="ml-auto flex-1 max-w-[160px]">
                      <div className="h-2 rounded-full bg-border overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${overallScore}%`, background: overallColor }} />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {risks.map(r => (
                      <div key={r.label}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-foreground">{r.label}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ background: `${r.color}22`, color: r.color }}>{r.rating}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{r.detail}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-border overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${r.score}%`, background: r.color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

          </div>

          {/* RIGHT: Decision Cards */}
          <div className="flex-[3] min-w-0 flex flex-col gap-3 db-section-bestmove">

            {/* 1. BEST MOVE NOW */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-amber-400">Best Move Now</span>
              </div>
              <div className="text-sm font-semibold text-foreground leading-snug mb-1">{bestMoveTitle}</div>
              <div className="text-xs text-muted-foreground">{bestMoveImpact}</div>
              <div className="mt-2.5 flex items-center justify-between">
                <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${
                  inlineBestMove_hook?.best.risk === "High" ? "bg-red-500/15 text-red-400" :
                  inlineBestMove_hook?.best.risk === "Low"  ? "bg-emerald-500/15 text-emerald-400" :
                  "bg-amber-500/15 text-amber-400"
                }`}>{inlineBestMove_hook?.best.risk ?? ""} Risk</span>
                <Link href={bestMoveHref}><span className="text-xs text-primary hover:underline">Take Action →</span></Link>
              </div>
            </div>

            {/* 2. NEXT MAJOR EVENT */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-sky-500/15 flex items-center justify-center">
                  <Calendar className="w-3.5 h-3.5 text-sky-400" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-sky-400">Next Major Event</span>
              </div>
              {nextPropEvent ? (
                <>
                  <div className="text-sm font-semibold text-foreground mb-0.5">{nextPropEvent.label}</div>
                  <div className="text-xs text-muted-foreground">{nextPropEvent.monthKey}</div>
                  <div className="mt-2.5"><Link href="/financial-plan"><span className="text-xs text-primary hover:underline">View Plan →</span></Link></div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground">No upcoming events scheduled</div>
              )}
            </div>

            {/* 3. CASH WARNING — equity-aware */}
            {(() => {
              // Equity-aware: if usable equity covers the shortfall, downgrade from Critical to Manageable
              const shortfall = Math.max(0, 20000 - lowestFutureCash);
              const equityCoversShortfall = totalUsableEquity >= shortfall && shortfall > 0;
              const isCritical = lowestFutureCash < 5000 && !equityCoversShortfall;
              const isWarning  = lowestFutureCash < 20000 && !isCritical;
              const borderCls  = isCritical ? "border-red-500/30 bg-red-500/5" : isWarning ? "border-amber-500/30 bg-amber-500/5" : "border-border bg-card";
              const iconCls    = isCritical ? "bg-red-500/15" : isWarning ? "bg-amber-500/15" : "bg-emerald-500/15";
              const iconColor  = isCritical ? "text-red-400" : isWarning ? "text-amber-400" : "text-emerald-400";
              const label      = isCritical ? "Cash Warning" : isWarning ? "Cash Watch" : "Cash Health";
              const detail     = isCritical
                ? "⚠️ Critical — review purchase timing"
                : equityCoversShortfall
                ? `Manageable — $${Math.round(totalUsableEquity / 1000)}k usable equity covers shortfall`
                : isWarning
                ? "Monitor closely around major purchases"
                : "Comfortable buffer maintained";
              return (
                <div className={`rounded-2xl border p-4 ${borderCls}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${iconCls}`}>
                      <AlertTriangle className={`w-3.5 h-3.5 ${iconColor}`} />
                    </div>
                    <span className={`text-xs font-bold uppercase tracking-widest ${iconColor}`}>{label}</span>
                  </div>
                  <div className="text-sm font-semibold text-foreground mb-0.5">Lowest projected: {maskValue(formatCurrency(lowestFutureCash, true), privacyMode)}</div>
                  <div className="text-xs text-muted-foreground">{detail}</div>
                  {equityCoversShortfall && (
                    <div className="mt-2 text-xs" style={{ color: "hsl(188,60%,48%)" }}>
                      Equity buffer: {maskValue(formatCurrency(totalUsableEquity, true), privacyMode)} available
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 4. OPPORTUNITY */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Opportunity</span>
              </div>
              <div className="text-sm font-semibold text-foreground mb-0.5">Tax refund: {maskValue(`+${formatCurrency(ngSummary.totalAnnualTaxBenefit, true)}/yr`, privacyMode)}</div>
              <div className="text-xs text-muted-foreground">{ngProperties.length > 0 ? `${ngProperties.length} negatively geared ${ngProperties.length === 1 ? "property" : "properties"} active` : "Add IPs to unlock NG benefits"}</div>
              <div className="mt-2.5"><Link href="/tax-strategy"><span className="text-xs text-primary hover:underline">Tax Strategy →</span></Link></div>
            </div>

            {/* 5. FIRE TRACKER */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-lg bg-orange-500/15 flex items-center justify-center">
                  <Flame className="w-3.5 h-3.5 text-orange-400" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-orange-400">FIRE Tracker</span>
              </div>
              <div className="text-sm font-semibold text-foreground mb-0.5">Target age: {fireCard?.value ?? "—"}</div>
              <div className="text-xs text-muted-foreground mb-2">{maskValue(formatCurrency(fireCurrentAmt, true), privacyMode)} of {maskValue(formatCurrency(fireTargetAmt, true), privacyMode)} target</div>
              <div className="h-1.5 rounded-full bg-border overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400" style={{ width: `${Math.min(100, fireProgressPct)}%` }} />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-xs text-muted-foreground">{fireProgressPct.toFixed(0)}% funded</span>
                <Link href="/wealth-strategy"><span className="text-xs text-primary hover:underline">FIRE Plan →</span></Link>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          YEAR-BY-YEAR TABLE
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4 db-section-year">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-foreground">Year-by-Year Projection</h2>
          <Link href="/timeline"><span className="text-xs text-primary hover:underline">Full Timeline →</span></Link>
        </div>
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="db-action-table-wrap overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["","Year","Start NW","Income","Expenses","Prop. Value","Prop. Loans","Equity","Usable Eq.","Dep. Power","Stocks","Crypto","Cash","Total Assets","Liabilities","End NW","Growth %","Passive Income","Mthly CF"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {yrRowsFull.map((r, idx) => {
                  const isOpen = expandedYear === r.year;
                  const growthPct = r.growthPct ?? 0;
                  const checkDelta = (r.totalAssets ?? 0) - (r.liab ?? 0) - (r.endNW ?? 0);
                  const checkOk = Math.abs(checkDelta) <= 1;
                  return (
                    <Fragment key={r.year}>
                      <tr
                        className={`border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer ${idx === 0 ? "bg-amber-500/5" : ""}`}
                        onClick={() => setExpandedYear(isOpen ? null : r.year)}
                      >
                        <td className="px-2 py-2 text-muted-foreground whitespace-nowrap select-none" style={{ width: 18 }}>{isOpen ? "▾" : "▸"}</td>
                        <td className="px-3 py-2 font-bold text-foreground whitespace-nowrap">{r.year}{idx === 0 ? " ★" : ""}</td>
                        <td className="px-3 py-2 font-mono text-foreground tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.startNW ?? 0, true), privacyMode)}</td>
                        <td className="px-3 py-2 font-mono text-emerald-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.income ?? 0, true), privacyMode)}</td>
                        <td className="px-3 py-2 font-mono text-red-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.expenses ?? 0, true), privacyMode)}</td>
                        <td className="px-3 py-2 font-mono text-foreground tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.propValue ?? 0, true), privacyMode)}</td>
                        <td className="px-3 py-2 font-mono text-red-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.propLoans ?? 0, true), privacyMode)}</td>
                        <td className="px-3 py-2 font-mono text-emerald-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.equity ?? 0, true), privacyMode)}</td>
                        <td className="px-3 py-2 font-mono text-cyan-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.usableEquity ?? 0, true), privacyMode)}</td>
                        <td className="px-3 py-2 font-mono text-amber-300 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.depositPower ?? 0, true), privacyMode)}</td>
                        <td className="px-3 py-2 font-mono text-blue-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.stocks ?? 0, true), privacyMode)}</td>
                        <td className="px-3 py-2 font-mono text-purple-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.crypto ?? 0, true), privacyMode)}</td>
                        <td className="px-3 py-2 font-mono text-foreground tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.cash ?? 0, true), privacyMode)}</td>
                        <td className="px-3 py-2 font-mono text-emerald-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.totalAssets ?? 0, true), privacyMode)}</td>
                        <td className="px-3 py-2 font-mono text-red-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.liab ?? 0, true), privacyMode)}</td>
                        <td className="px-3 py-2 font-mono text-amber-400 font-bold tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.endNW ?? 0, true), privacyMode)}</td>
                        <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap" style={{ color: growthPct >= 0 ? "hsl(142,60%,45%)" : "hsl(5,70%,52%)" }}>
                          {growthPct >= 0 ? "+" : ""}{growthPct.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 font-mono text-purple-400 tabular-nums whitespace-nowrap">{maskValue(formatCurrency(r.passive ?? 0, true), privacyMode)}/yr</td>
                        <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap" style={{ color: (r.monthlyCF ?? 0) >= 0 ? "hsl(142,60%,45%)" : "hsl(5,70%,52%)" }}>
                          {maskValue(formatCurrency(r.monthlyCF ?? 0, true), privacyMode)}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-muted/10 border-b border-border">
                          <td colSpan={19} className="px-4 py-4">
                            <YearDetailPanel row={r} privacyMode={privacyMode} checkDelta={checkDelta} checkOk={checkOk} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-[10px] text-muted-foreground border-t border-border bg-muted/5">
            Click any row to view its full reconciliation bridge (cash → property → liabilities → passive income).
            Growth % uses (End NW − Start NW) / Start NW × 100. Sanity check: Total Assets − Liabilities = End NW.
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          LEDGER AUDIT SECTION
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4 db-section-ledger">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4" style={{ color: "hsl(210,80%,65%)" }} />
            <h2 className="text-base font-bold text-foreground">Ledger Audit</h2>
          </div>
          <button
            onClick={() => setShowLedgerAudit(v => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showLedgerAudit ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showLedgerAudit ? "Hide" : "Show"} Audit
          </button>
        </div>
        {showLedgerAudit && (() => {
          const totalCash     = totalLiquidCash;
          const totalEquity   = depositPowerResult?.totalUsableEquity ?? 0;
          const propEq        = propertyEquity;
          const auditRows = [
            { label: "Cash (Everyday Account)",    value: snap.cash,              color: "hsl(210,80%,65%)",  category: "Liquid" },
            { label: "Offset Balance",             value: snap.offset_balance,    color: "hsl(210,80%,65%)",  category: "Liquid" },
            { label: "Total Cash + Offset",        value: totalCash,              color: "hsl(210,80%,65%)",  category: "Liquid",   bold: true },
            { label: "PPOR Value",                 value: snap.ppor,              color: "hsl(188,60%,48%)",  category: "Property" },
            { label: "Mortgage Balance",           value: -snap.mortgage,         color: "hsl(0,72%,58%)",    category: "Property" },
            { label: "PPOR Usable Equity (80%)",   value: depositPowerResult?.pporEquity?.usableEquity ?? 0, color: "hsl(188,60%,52%)", category: "Property", bold: true },
            { label: "IP Usable Equity (Total)",   value: (depositPowerResult?.ipEquityList ?? []).reduce((s: number, p: any) => s + p.usableEquity, 0), color: "hsl(145,55%,42%)", category: "Property" },
            { label: "Stocks (Market Value)",      value: stocksTotal,            color: "hsl(210,80%,65%)",  category: "Investments" },
            { label: "Crypto (Market Value)",      value: cryptoTotal,            color: "hsl(262,60%,65%)",  category: "Investments" },
            { label: "Superannuation",             value: _totalSuperNow,         color: "hsl(43,85%,55%)",   category: "Super" },
            { label: "Other Debts",                value: -snap.other_debts,      color: "hsl(0,72%,58%)",    category: "Liabilities" },
            { label: "Total Deposit Power",        value: depositPowerResult?.totalDepositPower ?? 0, color: "hsl(43,90%,62%)", category: "Summary", bold: true },
            { label: "Net Worth",                  value: netWorth,               color: "hsl(210,80%,65%)",  category: "Summary", bold: true },
          ];
          const categories = ["Liquid","Property","Investments","Super","Liabilities","Summary"];
          return (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              {/* Equity Settings row */}
              <div className="flex flex-wrap items-center gap-4 px-5 py-3 border-b border-border bg-background/40">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Max Refinance LVR:</span>
                  <input
                    type="number" min={0.5} max={0.9} step={0.01}
                    value={(maxRefinanceLVR * 100).toFixed(0)}
                    onChange={e => setMaxRefinanceLVR(Math.min(0.9, Math.max(0.5, Number(e.target.value) / 100)))}
                    className="w-16 px-2 py-0.5 rounded border border-border bg-background text-xs text-center font-bold"
                    style={{ color: "hsl(188,60%,52%)" }}
                  />
                  <span>%</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Emergency Buffer:</span>
                  <input
                    type="number" min={0} max={200000} step={5000}
                    value={emergencyBuffer}
                    onChange={e => setEmergencyBuffer(Math.max(0, Number(e.target.value)))}
                    className="w-24 px-2 py-0.5 rounded border border-border bg-background text-xs text-center font-bold"
                    style={{ color: "hsl(0,72%,58%)" }}
                  />
                </div>
                <div className="ml-auto text-xs text-muted-foreground">One ledger · One truth · All modules synced</div>
              </div>
              {/* Audit table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {["Category","Item","Value"].map(h => (
                        <th key={h} className="px-4 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.map((r, i) => (
                      <tr key={i} className={`border-b border-border/40 hover:bg-muted/10 transition-colors ${r.bold ? "bg-background/60" : ""}`}>
                        <td className="px-4 py-1.5 text-muted-foreground whitespace-nowrap">{r.category}</td>
                        <td className="px-4 py-1.5 text-foreground whitespace-nowrap" style={{ fontWeight: r.bold ? 700 : 400 }}>{r.label}</td>
                        <td className="px-4 py-1.5 font-mono tabular-nums whitespace-nowrap" style={{ color: r.color, fontWeight: r.bold ? 700 : 400 }}>
                          {r.value >= 0 ? "" : "−"}{maskValue(formatCurrency(Math.abs(r.value), true), privacyMode)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Reconciliation check */}
              <div className="px-5 py-3 border-t border-border bg-background/40 flex flex-wrap gap-6 text-xs">
                <div>
                  <span className="text-muted-foreground">Assets: </span>
                  <span className="font-bold tabular-nums" style={{ color: "hsl(142,60%,52%)" }}>{maskValue(formatCurrency(totalAssets, true), privacyMode)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Liabilities: </span>
                  <span className="font-bold tabular-nums" style={{ color: "hsl(0,72%,58%)" }}>{maskValue(formatCurrency(totalLiab, true), privacyMode)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Net Worth (A−L): </span>
                  <span className="font-bold tabular-nums" style={{ color: "hsl(43,90%,62%)" }}>{maskValue(formatCurrency(netWorth, true), privacyMode)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Deposit Power: </span>
                  <span className="font-bold tabular-nums" style={{ color: "hsl(188,60%,52%)" }}>{maskValue(formatCurrency(depositPowerResult?.totalDepositPower ?? 0, true), privacyMode)}</span>
                </div>
                <div className="ml-auto">
                  <span className={`px-2 py-0.5 rounded font-semibold ${Math.abs(totalAssets - totalLiab - netWorth) < 100 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>
                    {Math.abs(totalAssets - totalLiab - netWorth) < 100 ? "✓ Balanced" : "⚠ Reconciliation Gap"}
                  </span>
                </div>
              </div>

              {/* ────────────────────────────────────────────────────────────
                  RECOMMENDATION INPUTS VALIDATION
                  ─────────────────────────────────────────────────────────── */}
              {inlineBestMove_hook?.ledgerInputs && (() => {
                const li = inlineBestMove_hook.ledgerInputs;
                const recRows = [
                  { label: "Cash (everyday)",           value: li.cashOutsideOffset,          color: "hsl(210,80%,65%)",  note: "" },
                  { label: "Offset balance",            value: li.offsetBalance,              color: "hsl(210,80%,65%)",  note: "" },
                  { label: "Emergency buffer",          value: -li.emergencyBuffer,           color: "hsl(0,72%,58%)",    note: "Reserved" },
                  { label: "Upcoming bills (12mo)",     value: -li.upcomingBills12mo,         color: "hsl(0,72%,58%)",    note: "Reserved" },
                  { label: "Planned investments",       value: -li.plannedInvestmentsTotal,   color: "hsl(0,72%,58%)",    note: "Reserved" },
                  { label: "Property deposit reserve", value: -li.propertyDepositReserve,    color: "hsl(0,72%,58%)",    note: "Reserved" },
                  { label: "Tax reserve",              value: -li.taxReserve,                color: "hsl(0,72%,58%)",    note: "Reserved" },
                  { label: "Forecast shortfall reserve",value: -li.forecastShortfallReserve, color: "hsl(0,72%,58%)",    note: "Reserved" },
                  { label: "Free cash for offset",     value: li.freeCashForOffset,          color: li.freeCashForOffset > 0 ? "hsl(142,60%,52%)" : "hsl(0,72%,58%)", note: li.freeCashForOffset > 0 ? "✓ Available" : "✕ Fully committed", bold: true },
                  { label: "Monthly surplus",          value: li.surplus,                    color: li.surplus >= 0 ? "hsl(142,60%,52%)" : "hsl(0,72%,58%)", note: "" },
                  { label: "Deposit power",            value: li.depositPower,               color: "hsl(43,90%,62%)",   note: `${Math.round(li.depositReadinessPct)}% ready` },
                ];
                return (
                  <div className="border-t border-border">
                    <div className="px-5 py-2 bg-background/30 flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "hsl(43,90%,62%)" }}>Recommendation Inputs</span>
                      <span className="text-[10px] text-muted-foreground">— all values used by Best Move V2 engine</span>
                      <span className={`ml-auto text-[10px] px-2 py-0.5 rounded font-semibold ${
                        li.freeCashForOffset > 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                      }`}>
                        {li.freeCashForOffset > 0 ? `✓ ${formatCurrency(li.freeCashForOffset, true)} free` : "⚠ No idle cash"}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px]">
                        <thead>
                          <tr className="border-b border-border">
                            {["Input", "Value", "Status"].map(h => (
                              <th key={h} className="px-4 py-1.5 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {recRows.map((r: any, i: number) => (
                            <tr key={i} className={`border-b border-border/30 ${r.bold ? "bg-background/60" : "hover:bg-muted/10"}`}>
                              <td className={`px-4 py-1 whitespace-nowrap ${r.bold ? "font-semibold text-foreground/90" : "text-muted-foreground"}`}>{r.label}</td>
                              <td className="px-4 py-1 font-mono tabular-nums whitespace-nowrap" style={{ color: r.color, fontWeight: r.bold ? 700 : 400 }}>
                                {r.value < 0 ? "−" : ""}{maskValue(formatCurrency(Math.abs(r.value), true), privacyMode)}
                              </td>
                              <td className="px-4 py-1 text-muted-foreground whitespace-nowrap">{r.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

            </div>
          );
        })()}
      </div>

      {/* BEST MOVE CARD */}
      <div className="px-4 pb-4 db-section-bestmove-card">
        <BestMoveCard />
      </div>

      {/* DEPOSIT POWER — cash + offset + usable equity across all properties */}
      <div className="px-4 pb-4 db-section-deposit-card">
        <DepositPowerCard compact />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          FIRE PATH OPTIMIZER + PORTFOLIO LIVE RETURN
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4 db-section-fire">
        <FIREPathCard />
      </div>

      <div className="px-4 pb-4 db-section-fire">
        <PortfolioLiveReturn />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ACTION CENTER (smart actions table)
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4 db-section-fire">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-base font-bold text-foreground">Action Center</div>
              <div className="text-xs text-muted-foreground mt-0.5">Top opportunities ranked by ROI</div>
            </div>
            <Link href="/ai-insights"><span className="text-xs text-primary hover:underline">AI Insights →</span></Link>
          </div>
          <div className="db-action-table-wrap overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">#</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Action</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Impact</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Difficulty</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Time</th>
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Priority</th>
                </tr>
              </thead>
              <tbody>
                {smartActions.map((action, idx) => (
                  <tr
                    key={idx}
                    className={`db-action-row priority-${action.priority} border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer`}
                    onClick={() => navigate(action.href)}
                  >
                    <td className="px-3 py-2 font-bold text-muted-foreground">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-foreground">{action.title}</td>
                    <td className="px-3 py-2 text-emerald-400">{action.impact}</td>
                    <td className="px-3 py-2 text-muted-foreground">{action.difficulty}</td>
                    <td className="px-3 py-2 text-muted-foreground">{action.time}</td>
                    <td className="px-3 py-2">
                      <span className={`db-priority-badge priority-badge-${action.priority} inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                        action.priority === "high" ? "bg-red-500/15 text-red-400" :
                        action.priority === "medium" ? "bg-amber-500/15 text-amber-400" :
                        action.priority === "strategic" ? "bg-blue-500/15 text-blue-400" :
                        "bg-muted text-muted-foreground"
                      }`}>{action.priority}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          AI INSIGHTS
          ═════════════════════════════════════════════════════════════════ */}
      <div className="px-4 pb-4 db-section-ai">
        <AIInsightsCard
          pageKey="dashboard"
          pageLabel="Dashboard Overview"
          getData={() => ({
            netWorth, surplus, savingsRate, propertyEquity,
            totalDebt: totalLiab, passiveIncome,
            fireProgress: fireProgressPct.toFixed(0),
            year10NW, ngAnnualBenefit: ngSummary.totalAnnualTaxBenefit,
            riskScore, riskLabel,
          })}
        />
      </div>

      {/* Mobile bottom-sheet tooltip — renders on tap for screens < 768px */}
      <MobileChartSheet data={mobileTooltipData} onClose={() => setMobileTooltipData(null)} />

    </div>
  );
}

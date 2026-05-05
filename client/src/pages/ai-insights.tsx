/**
 * pages/ai-insights.tsx
 * Dedicated AI Insights hub — /ai-insights
 * Shows insights for all financial areas on one page.
 */

import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import AIInsightsCard from "@/components/AIInsightsCard";
import { useAppStore } from "@/lib/store";
import {
  Sparkles, LayoutDashboard, Receipt, Home,
  TrendingUp, Bitcoin, Clock, Info, Lock,
} from "lucide-react";

// ─── Data summarisers ─────────────────────────────────────────────────────────
// These trim the raw data to only what AI needs — keeps tokens low and cost minimal.

function summariseSnapshot(snap: any) {
  if (!snap) return {};
  return {
    netWorth: snap.net_worth,
    monthlyIncome: snap.monthly_income,
    monthlyExpenses: snap.monthly_expenses,
    monthlySurplus: snap.monthly_surplus,
    savingsRate: snap.savings_rate,
    totalDebt: snap.total_debt,
    totalAssets: snap.total_assets,
    totalLiabilities: snap.total_liabilities,
    cashFlow: snap.cash_flow,
    forecast10yr: snap.forecast_10yr,
  };
}

function summariseExpenses(expenses: any[]) {
  if (!expenses?.length) return { count: 0 };
  const byCategory: Record<string, number> = {};
  let totalMonthly = 0;
  const now = new Date();
  expenses.forEach((e: any) => {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    const d = new Date(e.date);
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
      totalMonthly += e.amount;
    }
  });
  const topCategories = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([cat, amt]) => ({ cat, amt: Math.round(amt) }));
  return { count: expenses.length, totalMonthly: Math.round(totalMonthly), topCategories };
}

function summariseProperties(props: any[]) {
  if (!props?.length) return { count: 0 };
  return props.map(p => ({
    name: p.name,
    value: p.value,
    loan: p.loan_balance,
    lvr: p.lvr,
    rentalYield: p.rental_yield,
    weeklyRent: p.weekly_rent,
    type: p.property_type,
  }));
}

function summariseStocks(stocks: any[]) {
  if (!stocks?.length) return { count: 0 };
  return stocks.map(s => ({
    ticker: s.ticker,
    shares: s.shares,
    avgBuy: s.avg_buy_price,
    current: s.current_price,
    pnl: ((s.current_price - s.avg_buy_price) * s.shares).toFixed(2),
    sector: s.sector,
  }));
}

function summariseCrypto(crypto: any[]) {
  if (!crypto?.length) return { count: 0 };
  return crypto.map(c => ({
    symbol: c.symbol,
    qty: c.quantity,
    avgBuy: c.avg_buy_price,
    current: c.current_price,
    pnl: ((c.current_price - c.avg_buy_price) * c.quantity).toFixed(2),
  }));
}

function summariseTimeline(events: any[], snap: any) {
  return {
    netWorth: snap?.net_worth,
    totalAssets: snap?.total_assets,
    totalLiabilities: snap?.total_liabilities,
    monthlyIncome: snap?.monthly_income,
    monthlyExpenses: snap?.monthly_expenses,
    milestones: (events || []).slice(0, 10).map((e: any) => ({
      date: e.date,
      label: e.label,
      amount: e.amount,
    })),
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AIInsightsPage() {
  const hasPermission = useAppStore((s: any) => s.hasPermission);
  const canView = hasPermission('view_ai_insights');

  // Access denied — clean fallback for non-permitted roles
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-secondary/40 flex items-center justify-center">
          <Lock className="w-7 h-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-base font-semibold mb-1">AI Insights not enabled</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            This section is managed by the household owner.
            Ask Roham to enable AI Insights access for your account in Settings → Family Access.
          </p>
        </div>
      </div>
    );
  }

  const { data: snapshot } = useQuery<any>({
    queryKey: ["/api/snapshot"],
    queryFn: () => apiRequest("GET", "/api/snapshot").then(r => r.json()),
  });
  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ["/api/expenses"],
    queryFn: () => apiRequest("GET", "/api/expenses").then(r => r.json()),
  });
  const { data: properties = [] } = useQuery<any[]>({
    queryKey: ["/api/properties"],
    queryFn: () => apiRequest("GET", "/api/properties").then(r => r.json()),
  });
  const { data: stocks = [] } = useQuery<any[]>({
    queryKey: ["/api/stocks"],
    queryFn: () => apiRequest("GET", "/api/stocks").then(r => r.json()),
  });
  const { data: crypto = [] } = useQuery<any[]>({
    queryKey: ["/api/crypto"],
    queryFn: () => apiRequest("GET", "/api/crypto").then(r => r.json()),
  });
  const { data: timeline = [] } = useQuery<any[]>({
    queryKey: ["/api/timeline"],
    queryFn: () => apiRequest("GET", "/api/timeline").then(r => r.json()),
  });

  const panels = [
    {
      pageKey: "dashboard",
      pageLabel: "Dashboard — Overall Financial Health",
      icon: <LayoutDashboard className="w-4 h-4" />,
      getData: () => summariseSnapshot(snapshot),
    },
    {
      pageKey: "expenses",
      pageLabel: "Expenses — Spending Analysis",
      icon: <Receipt className="w-4 h-4" />,
      getData: () => summariseExpenses(expenses),
    },
    {
      pageKey: "property",
      pageLabel: "Property — Portfolio Analysis",
      icon: <Home className="w-4 h-4" />,
      getData: () => ({ properties: summariseProperties(properties) }),
    },
    {
      pageKey: "stocks",
      pageLabel: "Stocks — Portfolio Review",
      icon: <TrendingUp className="w-4 h-4" />,
      getData: () => ({ stocks: summariseStocks(stocks) }),
    },
    {
      pageKey: "crypto",
      pageLabel: "Crypto — Portfolio Risk",
      icon: <Bitcoin className="w-4 h-4" />,
      getData: () => ({ crypto: summariseCrypto(crypto) }),
    },
    {
      pageKey: "timeline",
      pageLabel: "Net Worth Timeline — Projections",
      icon: <Clock className="w-4 h-4" />,
      getData: () => summariseTimeline(timeline, snapshot),
    },
  ];

  return (
    <div className="space-y-5 pb-8">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, hsl(270,60%,40%), hsl(240,80%,55%))" }}
          >
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">AI Insights</h1>
            <p className="text-xs text-muted-foreground">Powered by GPT-4o mini · Cached 24 hours</p>
          </div>
        </div>

        {/* Info callout */}
        <div className="flex items-start gap-2 bg-secondary/40 border border-border rounded-xl px-4 py-3 mt-3">
          <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Click "Generate Insights" on any section below. Your financial data is summarised and sent securely to OpenAI — raw records are never sent. Results are cached for 24 hours to minimise cost.
            <span className="block mt-1 text-muted-foreground/60">
              This is general information only and not financial advice.
            </span>
          </p>
        </div>
      </div>

      {/* ─── Section cards ──────────────────────────────────────── */}
      <div className="space-y-4">
        {panels.map(panel => (
          <div key={panel.pageKey}>
            {/* Section header */}
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="text-muted-foreground">{panel.icon}</span>
              <span className="text-sm font-semibold">{panel.pageLabel}</span>
            </div>
            <AIInsightsCard
              pageKey={panel.pageKey}
              pageLabel={panel.pageLabel}
              getData={panel.getData}
            />
          </div>
        ))}
      </div>

      {/* ─── Cost note ──────────────────────────────────────────── */}
      <div className="text-center text-xs text-muted-foreground/50 pt-2">
        GPT-4o mini costs ~$0.002 per 1,000 tokens. A typical analysis uses 400–600 tokens ≈ $0.001 per insight.
      </div>
    </div>
  );
}

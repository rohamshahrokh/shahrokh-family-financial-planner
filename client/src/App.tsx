/**
 * App.tsx — Root application with hash-based SPA routing.
 *
 * Hash routing (/#/dashboard, /#/property …) is used so that:
 *   1. Vercel static hosting needs only one rewrite rule: * → index.html
 *   2. Page refreshes never result in a 404 — the server always serves index.html
 *      and the client reads the hash to render the correct page.
 *
 * Auth flow:
 *   - Unauthenticated users always see /login (hash /#/login)
 *   - After login, redirect to /#/dashboard
 *   - Protected routes redirect to /#/login when not authenticated
 *   - Logout clears auth and returns to /#/login
 */

import { Switch, Route, Router, Redirect } from "wouter";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useAppStore } from "./lib/store";
import { useEffect } from "react";

import LoginPage          from "./pages/login";
import DashboardPage      from "./pages/dashboard";
import PropertyPage       from "./pages/property";
import StocksPage         from "./pages/stocks";
import CryptoPage         from "./pages/crypto";
import ExpensesPage       from "./pages/expenses";
import ReportsPage        from "./pages/reports";
import SettingsPage       from "./pages/settings";
import TaxPage            from "./pages/tax";
import TimelinePage       from "./pages/timeline";
import DataHealthPage     from "./pages/data-health";
import HelpPage           from "./pages/help";
import AIInsightsPage     from "./pages/ai-insights";
import WealthStrategyPage   from "./pages/wealth-strategy";
import DebtStrategyPage     from "./pages/debt-strategy";
import RecurringBillsPage   from "./pages/recurring-bills";
import BudgetPage           from "./pages/budget";
import MarketNewsPage       from "./pages/market-news";
import AIForecastEnginePage from "./pages/ai-forecast-engine";
import AIWeeklyCFOPage      from "./pages/ai-weekly-cfo";
import Layout               from "./components/Layout";
import NotFound           from "./pages/not-found";

// ─── Page title hook ──────────────────────────────────────────────────────────

function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} | Family Wealth Lab` : "Family Wealth Lab";
  }, [title]);
}

// ─── Titled page wrapper ──────────────────────────────────────────────────────

function TitledPage({
  title,
  component: Component,
}: {
  title: string;
  component: React.ComponentType;
}) {
  usePageTitle(title);
  return <Component />;
}

// ─── Protected route wrapper ──────────────────────────────────────────────────

function ProtectedRoute({
  component: Component,
  title,
}: {
  component: React.ComponentType;
  title: string;
}) {
  const { isAuthenticated } = useAppStore();
  if (!isAuthenticated) return <Redirect to="/login" />;
  return (
    <Layout>
      <TitledPage title={title} component={Component} />
    </Layout>
  );
}

// ─── Login wrapper ────────────────────────────────────────────────────────────

function LoginWrapper() {
  const { isAuthenticated } = useAppStore();
  usePageTitle("Login");
  return isAuthenticated ? <Redirect to="/dashboard" /> : <LoginPage />;
}

// ─── App router ───────────────────────────────────────────────────────────────

function AppRouter() {
  const { isAuthenticated } = useAppStore();

  return (
    <Router hook={useHashLocation}>
      <Switch>
        {/* Login */}
        <Route path="/login" component={LoginWrapper} />

        {/* Root redirect */}
        <Route path="/">
          <Redirect to={isAuthenticated ? "/dashboard" : "/login"} />
        </Route>

        {/* Protected routes */}
        <Route path="/dashboard">
          <ProtectedRoute component={DashboardPage} title="Dashboard" />
        </Route>
        <Route path="/expenses">
          <ProtectedRoute component={ExpensesPage} title="Expenses" />
        </Route>
        <Route path="/property">
          <ProtectedRoute component={PropertyPage} title="Property" />
        </Route>
        <Route path="/stocks">
          <ProtectedRoute component={StocksPage} title="Stocks" />
        </Route>
        <Route path="/crypto">
          <ProtectedRoute component={CryptoPage} title="Crypto" />
        </Route>
        <Route path="/reports">
          <ProtectedRoute component={ReportsPage} title="Reports" />
        </Route>
        <Route path="/settings">
          <ProtectedRoute component={SettingsPage} title="Settings" />
        </Route>
        <Route path="/tax">
          <ProtectedRoute component={TaxPage} title="Tax Calculator" />
        </Route>
        <Route path="/timeline">
          <ProtectedRoute component={TimelinePage} title="Net Worth Timeline" />
        </Route>
        <Route path="/data-health">
          <ProtectedRoute component={DataHealthPage} title="Data Health" />
        </Route>
        <Route path="/help">
          <ProtectedRoute component={HelpPage} title="Help" />
        </Route>
        <Route path="/ai-insights">
          <ProtectedRoute component={AIInsightsPage} title="AI Insights" />
        </Route>
        <Route path="/wealth-strategy">
          <ProtectedRoute component={WealthStrategyPage} title="Wealth Strategy" />
        </Route>
        <Route path="/debt-strategy">
          <ProtectedRoute component={DebtStrategyPage} title="Debt Strategy" />
        </Route>
        <Route path="/recurring-bills">
          <ProtectedRoute component={RecurringBillsPage} title="Recurring Bills" />
        </Route>
        <Route path="/budget">
          <ProtectedRoute component={BudgetPage} title="Monthly Budget" />
        </Route>
        <Route path="/market-news">
          <ProtectedRoute component={MarketNewsPage} title="Market News" />
        </Route>
        <Route path="/ai-forecast-engine">
          <ProtectedRoute component={AIForecastEnginePage} title="AI Forecast Engine" />
        </Route>
        <Route path="/ai-weekly-cfo">
          <ProtectedRoute component={AIWeeklyCFOPage} title="AI Weekly CFO" />
        </Route>

        {/* 404 */}
        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const { theme } = useAppStore();

  // Apply theme class on mount and whenever it changes
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  // ─── Notification scheduler ─────────────────────────────────────────────────────────────
  // Runs once on mount + every 5 minutes while the tab is visible.
  // Dedup is server-side (Supabase last_sent_at columns) so repeated calls are
  // safe: dispatchFamilyMessages() only sends if the slot has NOT been sent in
  // the last 20 hours — regardless of how many times this fires or on how many
  // devices/browsers the app is open on simultaneously.
  useEffect(() => {
    const SB_URL = 'https://uoraduyyxhtzixcsaidg.supabase.co';
    const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c';

    const runChecks = () => {
      // Only run when tab is visible — prevents firing on hidden background tabs.
      if (document.hidden) return;
      import("./lib/notifications").then(async ({ dispatchFamilyMessages, checkUpcomingBills }) => {
        // 1. Family motivational messages (Supabase-deduped, 20hr cooldown)
        dispatchFamilyMessages().catch(() => {/* silent */});
        // 2. Bill due reminders
        try {
          const res = await fetch(
            `${SB_URL}/rest/v1/sf_recurring_bills?active=eq.true&select=bill_name,amount,next_due_date,reminder_days_before,active`,
            { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
          );
          if (res.ok) {
            const bills = await res.json();
            checkUpcomingBills(bills).catch(() => {/* silent */});
          }
        } catch {/* silent */}
      }).catch(() => {/* silent */});
    };

    runChecks(); // Run once immediately on mount
    // Re-check every 5 minutes (safe — server dedup prevents duplicate sends)
    const interval = setInterval(runChecks, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // ─── AI Weekly CFO scheduler ───────────────────────────────────────────────
  // Runs every 30 minutes. The engine itself checks:
  //   1. Is it the right day + time? (Saturday 8:00 AM AEST)
  //   2. Has it already run this week? (6-day cooldown in Supabase)
  // Only fires when both conditions are true, so running every 30min is safe.
  useEffect(() => {
    const runCFO = () => {
      if (document.hidden) return;
      import('./lib/notifications').then(({ dispatchWeeklyCFO }) => {
        dispatchWeeklyCFO().catch(() => {/* silent */});
      }).catch(() => {/* silent */});
    };
    runCFO();
    const cfoInterval = setInterval(runCFO, 30 * 60 * 1000);
    return () => clearInterval(cfoInterval);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
      <Toaster />
      <PwaInstallBanner />
    </QueryClientProvider>
  );
}

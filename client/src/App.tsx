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
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useAppStore } from "./lib/store";
import { useEffect } from "react";

import LoginPage      from "./pages/login";
import DashboardPage  from "./pages/dashboard";
import PropertyPage   from "./pages/property";
import StocksPage     from "./pages/stocks";
import CryptoPage     from "./pages/crypto";
import ExpensesPage   from "./pages/expenses";
import ReportsPage    from "./pages/reports";
import SettingsPage   from "./pages/settings";
import TaxPage        from "./pages/tax";
import TimelinePage   from "./pages/timeline";
import DataHealthPage from "./pages/data-health";
import HelpPage       from "./pages/help";
import AIInsightsPage from "./pages/ai-insights";
import Layout         from "./components/Layout";
import NotFound       from "./pages/not-found";

// ─── Protected route wrapper ──────────────────────────────────────────────────

function ProtectedRoute({
  component: Component,
}: {
  component: React.ComponentType;
}) {
  const { isAuthenticated } = useAppStore();
  if (!isAuthenticated) return <Redirect to="/login" />;
  return <Component />;
}

// ─── App router ───────────────────────────────────────────────────────────────

function AppRouter() {
  const { isAuthenticated } = useAppStore();

  return (
    <Router hook={useHashLocation}>
      <Switch>
        {/* Login — redirect to dashboard if already authenticated */}
        <Route path="/login">
          {isAuthenticated ? <Redirect to="/dashboard" /> : <LoginPage />}
        </Route>

        {/* Root — redirect to dashboard or login */}
        <Route path="/">
          <Redirect to={isAuthenticated ? "/dashboard" : "/login"} />
        </Route>

        {/* Protected routes — all wrapped in the shared Layout */}
        <Route path="/dashboard">
          {isAuthenticated ? (
            <Layout><DashboardPage /></Layout>
          ) : (
            <Redirect to="/login" />
          )}
        </Route>
        <Route path="/property">
          {isAuthenticated ? (
            <Layout><PropertyPage /></Layout>
          ) : (
            <Redirect to="/login" />
          )}
        </Route>
        <Route path="/stocks">
          {isAuthenticated ? (
            <Layout><StocksPage /></Layout>
          ) : (
            <Redirect to="/login" />
          )}
        </Route>
        <Route path="/crypto">
          {isAuthenticated ? (
            <Layout><CryptoPage /></Layout>
          ) : (
            <Redirect to="/login" />
          )}
        </Route>
        <Route path="/expenses">
          {isAuthenticated ? (
            <Layout><ExpensesPage /></Layout>
          ) : (
            <Redirect to="/login" />
          )}
        </Route>
        <Route path="/reports">
          {isAuthenticated ? (
            <Layout><ReportsPage /></Layout>
          ) : (
            <Redirect to="/login" />
          )}
        </Route>
        <Route path="/settings">
          {isAuthenticated ? (
            <Layout><SettingsPage /></Layout>
          ) : (
            <Redirect to="/login" />
          )}
        </Route>
        <Route path="/tax">
          {isAuthenticated ? (
            <Layout><TaxPage /></Layout>
          ) : (
            <Redirect to="/login" />
          )}
        </Route>
        <Route path="/timeline">
          {isAuthenticated ? (
            <Layout><TimelinePage /></Layout>
          ) : (
            <Redirect to="/login" />
          )}
        </Route>
        <Route path="/data-health">
          {isAuthenticated ? (
            <Layout><DataHealthPage /></Layout>
          ) : (
            <Redirect to="/login" />
          )}
        </Route>
        <Route path="/help">
          {isAuthenticated ? (
            <Layout><HelpPage /></Layout>
          ) : (
            <Redirect to="/login" />
          )}
        </Route>
        <Route path="/ai-insights">
          {isAuthenticated ? (
            <Layout><AIInsightsPage /></Layout>
          ) : (
            <Redirect to="/login" />
          )}
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

  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
      <Toaster />
    </QueryClientProvider>
  );
}

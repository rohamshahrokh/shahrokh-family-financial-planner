import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useAppStore } from "./lib/store";
import { useEffect } from "react";

import LoginPage from "./pages/login";
import DashboardPage from "./pages/dashboard";
import PropertyPage from "./pages/property";
import StocksPage from "./pages/stocks";
import CryptoPage from "./pages/crypto";
import ExpensesPage from "./pages/expenses";
import ReportsPage from "./pages/reports";
import SettingsPage from "./pages/settings";
import Layout from "./components/Layout";
import NotFound from "./pages/not-found";

function AppRouter() {
  const { isAuthenticated } = useAppStore();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <Router hook={useHashLocation}>
      <Layout>
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/dashboard" component={DashboardPage} />
          <Route path="/property" component={PropertyPage} />
          <Route path="/stocks" component={StocksPage} />
          <Route path="/crypto" component={CryptoPage} />
          <Route path="/expenses" component={ExpensesPage} />
          <Route path="/reports" component={ReportsPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route component={NotFound} />
        </Switch>
      </Layout>
    </Router>
  );
}

export default function App() {
  const { theme } = useAppStore();

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
      <Toaster />
    </QueryClientProvider>
  );
}

import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Home, TrendingUp, Bitcoin, FileText,
  Settings, LogOut, Sun, Moon, Menu, X, Bell,
  ChevronRight, DollarSign, Receipt, Clock,
  Eye, EyeOff, Calculator, Activity, HelpCircle, Sparkles, Briefcase, CreditCard, Target, Newspaper,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/property", label: "Property", icon: Home },
  { href: "/stocks", label: "Stocks", icon: TrendingUp },
  { href: "/crypto", label: "Crypto", icon: Bitcoin },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/tax", label: "Tax Calculator", icon: Calculator },
  { href: "/timeline", label: "Net Worth Timeline", icon: TrendingUp },
  { href: "/data-health", label: "Data Health", icon: Activity },
  { href: "/wealth-strategy", label: "Wealth Strategy", icon: Briefcase },
  { href: "/debt-strategy", label: "Debt Strategy", icon: CreditCard },
  { href: "/recurring-bills", label: "Recurring Bills", icon: Receipt },
  { href: "/budget", label: "Monthly Budget", icon: Target },
  { href: "/market-news", label: "Market News", icon: Newspaper },
  { href: "/ai-insights", label: "AI Insights", icon: Sparkles },
  { href: "/help", label: "Help", icon: HelpCircle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [, navigate] = useHashLocation();
  const { theme, toggleTheme, logout, lastSaved, currentUser, privacyMode, togglePrivacy } = useAppStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isActive = (href: string) => {
    if (href === "/" || href === "/dashboard") return location === "/" || location === "/dashboard";
    return location.startsWith(href);
  };

  // Avatar letter and label derived from currentUser
  const avatarLetter = currentUser === "Fara" ? "F" : "R";
  const avatarLabel = currentUser === "Fara" ? "Logged in as Fara" : "Logged in as Roham";

  const Logo = () => (
    <div className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
        <rect width="36" height="36" rx="8" fill="hsl(43,85%,55%)" />
        <path d="M10 24 L18 12 L26 24" stroke="hsl(224,40%,12%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        <path d="M10 24 L26 24" stroke="hsl(224,40%,12%)" strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx="18" cy="12" r="2" fill="hsl(224,40%,12%)"/>
      </svg>
      <div>
        <div className="text-xs font-bold leading-none">SHAHROKH</div>
        <div className="text-xs text-muted-foreground leading-none font-medium">Wealth Planner</div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 flex flex-col w-56 border-r border-border bg-card
        transform transition-transform duration-200
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <Logo />
          <Button variant="ghost" size="icon" className="lg:hidden w-7 h-7" onClick={() => setMobileOpen(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Family badge */}
        <div className="mx-3 mt-3 mb-1 px-3 py-2 rounded-lg" style={{ background: 'rgba(196,165,90,0.08)', border: '1px solid rgba(196,165,90,0.15)' }}>
          <p className="text-xs font-semibold" style={{ color: 'hsl(43,85%,65%)' }}>Roham &amp; Fara</p>
          <p className="text-xs text-muted-foreground">Yara · Jana · Brisbane</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={`sidebar-link ${isActive(href) ? 'active' : ''}`}
              data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{label}</span>
              {isActive(href) && <ChevronRight className="w-3 h-3 ml-auto text-primary" />}
            </Link>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-3 border-t border-border space-y-0.5">
          {lastSaved && (
            <div className="px-3 py-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3 h-3 shrink-0" />
              <span className="truncate">Saved {lastSaved}</span>
            </div>
          )}
          <button className="sidebar-link w-full" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          <button
            className="sidebar-link w-full text-red-400 hover:text-red-300 hover:bg-red-950/30"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-13 border-b border-border bg-card/80 backdrop-blur-sm flex items-center px-4 gap-3 sticky top-0 z-30">
          <Button variant="ghost" size="icon" className="lg:hidden w-8 h-8" onClick={() => setMobileOpen(true)}>
            <Menu className="w-4 h-4" />
          </Button>

          {/* Page title */}
          <div className="flex-1">
            <p className="text-xs font-semibold text-muted-foreground hidden sm:block">
              {navItems.find(n => isActive(n.href))?.label || 'Dashboard'}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Live clock */}
            <LiveClock />
            {/* Chart view toggle */}
            <ChartViewToggle />

            {/* Privacy Toggle — "Show Values" when hidden, "Hide Values" when visible */}
            <Button
              variant="outline"
              size="sm"
              onClick={togglePrivacy}
              className="h-8 text-xs gap-1.5 px-2 sm:px-3"
              style={{ borderColor: 'rgba(196,165,90,0.35)', color: 'hsl(43,85%,65%)' }}
              data-testid="button-privacy-toggle"
              title={privacyMode ? 'Show Values' : 'Hide Values'}
            >
              {privacyMode ? <Eye className="w-3.5 h-3.5 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 shrink-0" />}
              <span className="hidden sm:inline">
                {privacyMode ? 'Show Values' : 'Hide Values'}
              </span>
            </Button>

            <Button variant="ghost" size="icon" className="w-8 h-8 relative" data-testid="button-notifications">
              <Bell className="w-4 h-4" />
            </Button>

            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            {/* User avatar — letter + name reflect currentUser */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-secondary">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: 'hsl(43,85%,55%)', color: 'hsl(224,40%,8%)' }}
                aria-label={avatarLabel}
              >
                {avatarLetter}
              </div>
              <span className="text-xs font-medium hidden sm:block">{avatarLabel}</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function ChartViewToggle() {
  const { chartView, setChartView } = useAppStore();
  return (
    <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5">
      <button
        className={`px-2.5 py-1 text-xs rounded font-medium transition-all ${chartView === 'monthly' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        onClick={() => setChartView('monthly')}
      >Monthly</button>
      <button
        className={`px-2.5 py-1 text-xs rounded font-medium transition-all ${chartView === 'annual' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        onClick={() => setChartView('annual')}
      >Annual</button>
    </div>
  );
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div className="hidden md:flex flex-col items-end leading-none select-none">
      <span className="text-xs font-bold num-display" style={{ color: 'hsl(43,85%,65%)' }}>{timeStr}</span>
      <span className="text-[10px] text-muted-foreground mt-0.5">{dateStr}</span>
    </div>
  );
}

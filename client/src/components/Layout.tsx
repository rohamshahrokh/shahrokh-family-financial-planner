/**
 * Layout.tsx — Wealth OS Premium Layout
 *
 * 4-step accordion sidebar: Snapshot → Strategy → Forecast → Action
 * Every page is mapped to one of the four master wealth-building steps.
 * Clean, calm, premium fintech aesthetic.
 */

import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAppStore } from "@/lib/store";
import { applyTheme, resolveAutoTheme } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  // Step 1 — Snapshot
  LayoutDashboard, TrendingUp, DollarSign, Receipt, PiggyBank,
  HeartPulse, Landmark,
  // Step 2 — Strategy
  Home, Bitcoin, CreditCard, Calculator, Target, ClipboardList, Briefcase,
  // Step 3 — Forecast
  BarChart2, Activity, Sigma, Zap, Map, FlaskConical, FileText,
  // Step 4 — Action
  Lightbulb, Bell, Calendar, BrainCircuit,
  // Support / System
  HelpCircle, Settings,
  // UI chrome
  LogOut, Sun, Moon, SunMoon, Menu, X, Clock, Eye, EyeOff,
  ChevronDown, ChevronRight, Database, Newspaper,
} from "lucide-react";

// ─── Navigation Structure ─────────────────────────────────────────────────────
// Each step maps to a life stage in the wealth-building journey.

const NAV_STEPS = [
  {
    id: "snapshot",
    step: 1,
    label: "Snapshot",
    sublabel: "Input Today",
    badgeClass: "step-1",
    items: [
      { href: "/dashboard",       label: "Overview",            icon: LayoutDashboard, adminOnly: false },
      { href: "/expenses",        label: "Income & Expenses",   icon: DollarSign,      adminOnly: false },
      { href: "/recurring-bills", label: "Recurring Bills",     icon: Receipt,         adminOnly: false },
      { href: "/budget",          label: "Monthly Budget",      icon: Target,          adminOnly: false },
      { href: "/timeline",        label: "Net Worth Timeline",  icon: TrendingUp,      adminOnly: false },
      { href: "/data-health",     label: "Data Health",         icon: HeartPulse,      adminOnly: true  },
      { href: "/ledger-audit",    label: "Ledger Audit",        icon: Database,        adminOnly: true  },
    ],
  },
  {
    id: "strategy",
    step: 2,
    label: "Strategy",
    sublabel: "Plan the Future",
    badgeClass: "step-2",
    items: [
      { href: "/financial-plan",  label: "My Financial Plan",   icon: ClipboardList,   adminOnly: false },
      { href: "/property",        label: "Property Plan",       icon: Home,            adminOnly: false },
      { href: "/stocks",          label: "Stocks Plan",         icon: BarChart2,       adminOnly: false },
      { href: "/crypto",          label: "Crypto Plan",         icon: Bitcoin,         adminOnly: false },
      { href: "/debt-strategy",   label: "Debt Strategy",       icon: CreditCard,      adminOnly: false },
      { href: "/tax",             label: "Tax Strategy",        icon: Calculator,      adminOnly: false },
      { href: "/cgt-simulator",    label: "CGT Simulator",       icon: BarChart2,       adminOnly: false },
      { href: "/wealth-strategy", label: "Wealth Strategy",     icon: Briefcase,       adminOnly: false },
    ],
  },
  {
    id: "forecast",
    step: 3,
    label: "Forecast",
    sublabel: "Model & Project",
    badgeClass: "step-3",
    items: [
      { href: "/ai-forecast-engine", label: "Forecast Engine",      icon: Sigma,         adminOnly: true  },
      { href: "/scenario-compare",   label: "Scenario Compare Lab",   icon: FlaskConical,  adminOnly: false },
      { href: "/market-news",        label: "Market News",            icon: Newspaper,     adminOnly: false },
      { href: "/reports",            label: "Reports",                icon: FileText,      adminOnly: false },
    ],
  },
  {
    id: "action",
    step: 4,
    label: "Action",
    sublabel: "Take Action",
    badgeClass: "step-4",
    items: [
      { href: "/ai-weekly-cfo",  label: "Sat. Bulletin",       icon: BrainCircuit,    adminOnly: true  },
      { href: "/ai-insights",    label: "AI Insights",         icon: Lightbulb,       adminOnly: true  },
    ],
  },
];

// ─── Support / System links (outside the four workflow steps) ─────────────────

const SUPPORT_LINKS = [
  { href: "/help",     label: "Help",     icon: HelpCircle, adminOnly: false },
  { href: "/settings", label: "Settings", icon: Settings,   adminOnly: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPathActive(href: string, location: string): boolean {
  if (href === "/" || href === "/dashboard") return location === "/" || location === "/dashboard";
  return location.startsWith(href);
}

// Which step is currently active based on current route?
function getActiveStep(location: string, isAdmin: boolean): string {
  for (const step of NAV_STEPS) {
    const visibleItems = step.items.filter(i => !i.adminOnly || isAdmin);
    if (visibleItems.some(i => isPathActive(i.href, location))) {
      return step.id;
    }
  }
  return "snapshot"; // default open
}

// Is the current route a support page?
function isSupportActive(location: string): boolean {
  return SUPPORT_LINKS.some(l => isPathActive(l.href, location));
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function WealthOSLogo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        width="30"
        height="30"
        viewBox="0 0 36 36"
        fill="none"
        aria-label="Family Wealth Lab"
      >
        <rect width="36" height="36" rx="9" fill="hsl(42,80%,52%)" />
        {/* W shape */}
        <path
          d="M7 11 L12 25 L18 16 L24 25 L29 11"
          stroke="hsl(222,22%,7%)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Dot at center peak */}
        <circle cx="18" cy="16" r="1.5" fill="hsl(222,22%,7%)" />
      </svg>
      <div className="leading-none">
        <div className="text-[11px] font-bold tracking-wider text-foreground uppercase">
          FamilyWealth
        </div>
        <div
          className="text-[10px] font-medium tracking-widest uppercase"
          style={{ color: "hsl(var(--gold))" }}
        >
          Lab
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { theme, toggleTheme, setTheme, logout, lastSaved, currentUser, privacyMode, togglePrivacy, role } =
    useAppStore();

  // Auto-theme: re-evaluate every minute when mode is "auto"
  useEffect(() => {
    if (theme !== "auto") return;
    const id = setInterval(() => applyTheme("auto"), 60_000);
    return () => clearInterval(id);
  }, [theme]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = role === "admin";

  // Track which accordion sections are open — all open by default for discoverability
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    snapshot: true,
    strategy: true,
    forecast: false,
    action: false,
  });

  // Auto-open the section that contains the active route
  useEffect(() => {
    const activeStep = getActiveStep(location, isAdmin);
    setOpenSections(prev => ({ ...prev, [activeStep]: true }));
  }, [location, isAdmin]);

  const toggleSection = (id: string) => {
    setOpenSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const avatarLetter = currentUser === "Fara" ? "F" : "R";
  const roleLabel = isAdmin ? "Admin" : "Family";

  // Step accent colors for active section headers
  const stepColors: Record<string, string> = {
    snapshot: "hsl(var(--intelligence-light))",
    strategy: "hsl(var(--gold-light))",
    forecast: "hsl(var(--forecast-light))",
    action:   "hsl(var(--success-light))",
  };
  const stepBorderColors: Record<string, string> = {
    snapshot: "hsl(var(--intelligence))",
    strategy: "hsl(var(--gold))",
    forecast: "hsl(var(--forecast))",
    action:   "hsl(var(--success))",
  };

  // ─── Sidebar scroll preservation ───────────────────────────────────────────
  // Root cause was SidebarContent being a nested component (remounted on every
  // render). Fixed by inlining. This effect now just saves on scroll events and
  // restores after location changes (belt-and-suspenders).
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const savedScrollPos = useRef<number>(0);

  // Continuously save scrollTop via scroll event — most reliable approach
  useEffect(() => {
    const el = sidebarScrollRef.current;
    if (!el) return;
    const onScroll = () => { savedScrollPos.current = el.scrollTop; };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []); // mount once

  // On location change, restore the saved scroll position
  useEffect(() => {
    const el = sidebarScrollRef.current;
    if (!el) return;
    // Use rAF to ensure DOM has settled before restoring
    const raf = requestAnimationFrame(() => {
      el.scrollTop = savedScrollPos.current;
    });
    return () => cancelAnimationFrame(raf);
  }, [location]);

  // ─── Sidebar JSX (inlined — NOT a nested component to avoid remount on nav) ──
  const sidebarJsx = (
    <>
      {/* Logo + close (mobile) */}
      <div
        className="flex items-center justify-between px-4 py-4"
        style={{ borderBottom: "1px solid hsl(var(--border))" }}
      >
        <WealthOSLogo />
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden w-7 h-7"
          onClick={() => setMobileOpen(false)}
          data-testid="button-close-mobile-nav"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* User badge */}
      <div
        className="mx-3 mt-3 mb-2 px-3 py-2 rounded-lg"
        style={{
          background: "hsl(var(--gold-surface))",
          border: "1px solid hsl(var(--gold-dim) / 0.3)",
        }}
      >
        <p className="text-xs font-semibold text-gold">Roham &amp; Fara</p>
        <p className="text-[10px] text-muted-foreground">Kids · Brisbane</p>
      </div>

      {/* ACCORDION NAV — ref attached here for scroll preservation */}
      <nav ref={sidebarScrollRef} className="flex-1 px-3 py-2 overflow-y-auto space-y-1 pb-2">
        {NAV_STEPS.map((stepDef) => {
          const visibleItems = stepDef.items.filter(i => !i.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;

          const isOpen = !!openSections[stepDef.id];
          const isActiveSection = visibleItems.some(i => isPathActive(i.href, location));
          const accentColor = stepColors[stepDef.id];
          const borderColor = stepBorderColors[stepDef.id];

          return (
            <div key={stepDef.id} className="relative">
              {/* Section header */}
              <button
                className="nav-section-header"
                style={isActiveSection ? { color: accentColor } : {}}
                onClick={() => toggleSection(stepDef.id)}
                data-testid={`nav-section-${stepDef.id}`}
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-2">
                  {/* Step number badge */}
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{
                      background: isActiveSection
                        ? `hsl(var(--${stepDef.id === "snapshot" ? "intelligence" : stepDef.id === "strategy" ? "gold" : stepDef.id === "forecast" ? "forecast" : "success"}-surface))`
                        : "hsl(var(--muted))",
                      color: isActiveSection ? accentColor : "hsl(var(--muted-foreground))",
                    }}
                  >
                    {stepDef.step}
                  </span>
                  <div className="text-left leading-none">
                    <span className="block text-[11px] font-bold uppercase tracking-widest">
                      {stepDef.label}
                    </span>
                    {isActiveSection && (
                      <span className="block text-[9px] font-medium opacity-70 mt-0.5">
                        {stepDef.sublabel}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronDown
                  className="w-3 h-3 shrink-0 transition-transform duration-200"
                  style={{
                    transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                    color: isActiveSection ? accentColor : "hsl(var(--muted-foreground))",
                  }}
                />
              </button>

              {/* Section items */}
              {isOpen && (
                <div className="mt-0.5 space-y-0.5 pb-1">
                  {/* Vertical step line */}
                  <div
                    className="absolute left-[18px] top-9 w-px"
                    style={{
                      bottom: "8px",
                      background: isActiveSection
                        ? `${borderColor}40`
                        : "hsl(var(--border))",
                    }}
                  />
                  {visibleItems.map(({ href, label, icon: Icon }) => {
                    const active = isPathActive(href, location);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMobileOpen(false)}
                        data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                        className={`nav-item${active ? " active" : ""}`}
                      >
                        <Icon
                          className="nav-item-icon"
                          style={
                            active
                              ? { color: accentColor }
                              : {}
                          }
                        />
                        <span className="text-[13px]">{label}</span>
                        {active && (
                          <ChevronRight
                            className="w-3 h-3 ml-auto shrink-0"
                            style={{ color: accentColor }}
                          />
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* ─── SUPPORT / SYSTEM ─────────────────────────────────────────── */}
        <div
          className="mt-3 pt-3"
          style={{ borderTop: "1px solid hsl(var(--border) / 0.5)" }}
        >
          <p className="px-3 mb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 select-none">
            Support
          </p>
          {SUPPORT_LINKS.filter(l => !l.adminOnly || isAdmin).map(({ href, label, icon: Icon }) => {
            const active = isPathActive(href, location);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                data-testid={`nav-${label.toLowerCase()}`}
                className={`nav-item${active ? " active" : ""}`}
              >
                <Icon
                  className="nav-item-icon"
                  style={active ? { color: "hsl(var(--muted-foreground))" } : {}}
                />
                <span className="text-[13px]">{label}</span>
                {active && (
                  <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-muted-foreground" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom bar */}
      <div
        className="px-3 py-3 space-y-0.5"
        style={{ borderTop: "1px solid hsl(var(--border))" }}
      >
        {lastSaved && (
          <div className="px-3 py-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3 shrink-0" />
            <span className="truncate">Saved {lastSaved}</span>
          </div>
        )}
        <button className="sidebar-link w-full" onClick={toggleTheme} data-testid="button-theme-toggle">
          {theme === "dark"  ? <Sun className="w-4 h-4" /> :
           theme === "light" ? <Moon className="w-4 h-4" /> :
           <SunMoon className="w-4 h-4" />}
          <span>
            {theme === "dark"  ? "Light Mode" :
             theme === "light" ? "Auto Mode"  : "Dark Mode"}
          </span>
        </button>
        <button
          className="sidebar-link w-full"
          onClick={handleLogout}
          data-testid="button-logout"
          style={{ color: "hsl(var(--danger))" }}
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── SIDEBAR ─────────────────────────────────────────── */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          flex flex-col w-52 shrink-0 bg-background
          transform transition-transform duration-200
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
        style={{
          borderRight: "1px solid hsl(var(--border) / 0.7)",
        }}
      >
        {sidebarJsx}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── MAIN CONTENT ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header
          className="flex items-center px-4 gap-3 shrink-0"
          style={{
            borderBottom: "1px solid hsl(var(--border))",
            background: "hsl(var(--card) / 0.8)",
            backdropFilter: "blur(12px)",
            paddingTop: "max(env(safe-area-inset-top), 0px)",
            minHeight: "calc(3rem + env(safe-area-inset-top))",
            position: "sticky",
            top: 0,
            zIndex: 30,
          }}
        >
          {/* Mobile hamburger */}
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden w-8 h-8"
            onClick={() => setMobileOpen(true)}
            data-testid="button-mobile-menu"
          >
            <Menu className="w-4 h-4" />
          </Button>

          {/* Breadcrumb: shows which step + page */}
          <TopBarBreadcrumb location={location} isAdmin={isAdmin} />

          <div className="ml-auto flex items-center gap-2">
            <LiveClock />
            <ChartViewToggle />

            {/* Privacy toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={togglePrivacy}
              className="h-7 text-xs gap-1.5 px-2 sm:px-2.5"
              style={{
                borderColor: "hsl(var(--gold-dim) / 0.4)",
                color: "hsl(var(--gold))",
              }}
              data-testid="button-privacy-toggle"
              title={privacyMode ? "Show Values" : "Hide Values"}
            >
              {privacyMode
                ? <Eye className="w-3 h-3 shrink-0" />
                : <EyeOff className="w-3 h-3 shrink-0" />
              }
              <span className="hidden sm:inline">
                {privacyMode ? "Show" : "Hide"}
              </span>
            </Button>

            {/* Theme */}
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7"
              onClick={toggleTheme}
              data-testid="button-theme-header"
              title={theme === "dark" ? "Switch to Light" : theme === "light" ? "Switch to Auto" : "Switch to Dark"}
            >
              {theme === "dark"  ? <Sun className="w-3.5 h-3.5" /> :
               theme === "light" ? <Moon className="w-3.5 h-3.5" /> :
               <SunMoon className="w-3.5 h-3.5" />}
            </Button>

            {/* User avatar */}
            <div
              className="flex items-center gap-2 px-2.5 py-1 rounded-lg"
              style={{ background: "hsl(var(--secondary))" }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  background: "hsl(var(--gold))",
                  color: "hsl(var(--primary-foreground))",
                }}
                aria-label={`${currentUser} · ${roleLabel}`}
              >
                {avatarLetter}
              </div>
              <span className="text-xs font-medium hidden sm:block">
                {currentUser}
                <span className="text-muted-foreground"> · {roleLabel}</span>
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

// ─── Top Bar Breadcrumb ───────────────────────────────────────────────────────

function TopBarBreadcrumb({ location, isAdmin }: { location: string; isAdmin: boolean }) {
  let stepLabel = "";
  let pageLabel = "";

  for (const step of NAV_STEPS) {
    const visibleItems = step.items.filter(i => !i.adminOnly || isAdmin);
    const match = visibleItems.find(i => isPathActive(i.href, location));
    if (match) {
      stepLabel = step.label;
      pageLabel = match.label;
      break;
    }
  }

  // Check support links if not found in workflow steps
  if (!pageLabel) {
    const supportMatch = SUPPORT_LINKS.find(l => isPathActive(l.href, location));
    if (supportMatch) {
      stepLabel = "Support";
      pageLabel = supportMatch.label;
    } else {
      stepLabel = "Snapshot";
      pageLabel = "Overview";
    }
  }

  const stepColorMap: Record<string, string> = {
    Snapshot: "hsl(var(--intelligence-light))",
    Strategy: "hsl(var(--gold-light))",
    Forecast: "hsl(var(--forecast-light))",
    Action:   "hsl(var(--success-light))",
    Support:  "hsl(var(--muted-foreground))",
  };

  return (
    <div className="flex items-center gap-1.5 text-xs hidden sm:flex">
      <span
        className="font-semibold uppercase tracking-widest text-[10px]"
        style={{ color: stepColorMap[stepLabel] || "hsl(var(--muted-foreground))" }}
      >
        {stepLabel}
      </span>
      <ChevronRight className="w-3 h-3 text-muted-foreground" />
      <span className="text-muted-foreground font-medium">{pageLabel}</span>
    </div>
  );
}

// ─── Chart View Toggle ────────────────────────────────────────────────────────

function ChartViewToggle() {
  const { chartView, setChartView } = useAppStore();
  return (
    <div
      className="hidden md:flex items-center gap-0.5 rounded-lg p-0.5"
      style={{ background: "hsl(var(--secondary))" }}
    >
      {(["monthly", "annual"] as const).map((v) => (
        <button
          key={v}
          className={`px-2 py-1 text-xs rounded font-medium transition-all ${
            chartView === v
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setChartView(v)}
          data-testid={`button-chart-view-${v}`}
        >
          {v.charAt(0).toUpperCase() + v.slice(1)}
        </button>
      ))}
    </div>
  );
}

// ─── Live Clock ───────────────────────────────────────────────────────────────

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });

  return (
    <div className="hidden md:flex flex-col items-end leading-none select-none">
      <span className="text-xs font-bold num-display text-gold">{timeStr}</span>
      <span className="text-[10px] text-muted-foreground mt-0.5">{dateStr}</span>
    </div>
  );
}

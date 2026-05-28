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
import { usePwaBannerVisible } from "@/components/PwaInstallBanner";
import { applyTheme } from "@/lib/store";
import type { Permission } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { AuditModeToggle } from "@/components/auditMode/AuditModeToggle";
import { useAuditMode } from "@/lib/auditMode/AuditModeContext";
// FWL P1b: Global tax-regime selector strip (route-scoped, additive).
import {
  // Step 1 — Today
  LayoutDashboard, TrendingUp, DollarSign, Receipt,
  // Step 2 — Plan
  Home, Bitcoin, CreditCard, Calculator, Target, ClipboardList, Briefcase, Sparkles,
  // Step 3 — Future
  BarChart2, Sigma, FlaskConical, FileText,
  // Step 4 — Move
  Lightbulb, BrainCircuit, ClipboardCheck, Beaker,
  // Support / System
  HelpCircle, Settings, Microscope,
  // UI chrome
  LogOut, Sun, Moon, SunMoon, Menu, X, Clock, Eye, EyeOff,
  ChevronDown, ChevronRight, Database, Newspaper, HeartPulse,
} from "lucide-react";

// ─── Navigation Structure ─────────────────────────────────────────────────────
// Sprint 20 PR-H — Sidebar flattened to exactly 4 top-level expandable groups:
// TODAY, PLAN, FORECAST, MOVE. No nested accordion parents anywhere. Every
// child is a direct <Link>; clicking a child navigates only, never toggles.
// The 4 top-level groups are the ONLY expandable items in the sidebar.
type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly: boolean;
  requiredPermission?: Permission;
  /** Visual indent (0 = top-level, 1 = child). Used only in SECONDARY/SYSTEM
   *  to nest sub-rows under their parent surface. The 4 top-level workflow
   *  groups are flat — no child here ever sets depth > 0. */
  depth?: 0 | 1;
};

const NAV_STEPS: Array<{
  id: string;
  step: number;
  label: string;
  items: NavItem[];
}> = [
  {
    id: "today",
    step: 1,
    label: "TODAY",
    items: [
      { href: "/dashboard",       label: "Executive Overview",  icon: LayoutDashboard, adminOnly: false },
      { href: "/expenses",        label: "Income & Expenses",   icon: DollarSign,      adminOnly: false },
      { href: "/budget",          label: "Monthly Budget",      icon: Target,          adminOnly: false },
      { href: "/recurring-bills", label: "Recurring Bills",     icon: Receipt,         adminOnly: false },
    ],
  },
  {
    id: "plan",
    step: 2,
    label: "PLAN",
    items: [
      { href: "/financial-plan",  label: "Family Plan",         icon: ClipboardList,   adminOnly: false },
      { href: "/wealth-strategy", label: "Wealth Strategy",     icon: Briefcase,       adminOnly: false },
      { href: "/property",        label: "Property",            icon: Home,            adminOnly: false },
      { href: "/stocks",          label: "Stocks",              icon: BarChart2,       adminOnly: false },
      { href: "/crypto",          label: "Crypto",              icon: Bitcoin,         adminOnly: false },
      { href: "/debt-strategy",   label: "Debt Strategy",       icon: CreditCard,      adminOnly: false },
      { href: "/tax-strategy",    label: "Tax Strategy",        icon: Calculator,      adminOnly: false },
      { href: "/cgt-simulator",   label: "CGT Simulator",       icon: BarChart2,       adminOnly: false },
    ],
  },
  {
    id: "forecast",
    step: 3,
    label: "FORECAST",
    items: [
      { href: "/timeline",            label: "Net Worth Timeline", icon: TrendingUp,   adminOnly: false },
      { href: "/ai-forecast-engine",  label: "Forecast Engine",    icon: Sigma,        adminOnly: false },
      { href: "/scenario-compare",    label: "Scenario Compare",   icon: FlaskConical, adminOnly: false },
    ],
  },
  {
    id: "move",
    step: 4,
    label: "MOVE",
    items: [
      { href: "/goal-lab",     label: "Goal Lab",       icon: Sparkles,       adminOnly: false },
      { href: "/decision-lab", label: "Decision Lab",   icon: Beaker,         adminOnly: false },
      { href: "/action-plan",  label: "Action Roadmap", icon: ClipboardCheck, adminOnly: false },
    ],
  },
];

// ─── Secondary / System links (outside the four workflow steps) ───────────────
// Sprint 14: SUPPORT_LINKS split into SECONDARY (information / reports) and
// SYSTEM (settings / admin tooling). Renderer below preserves the old slot.

const SECONDARY_LINKS: NavItem[] = [
  { href: "/ai-insights",   label: "AI Insights",   icon: Lightbulb,   adminOnly: false, requiredPermission: 'view_ai_insights' as Permission },
  { href: "/market-news",   label: "Market News",   icon: Newspaper,   adminOnly: false },
  { href: "/reports",       label: "Reports",       icon: FileText,    adminOnly: false },
  { href: "/ai-weekly-cfo", label: "Sat. Bulletin", icon: BrainCircuit, adminOnly: false, requiredPermission: 'view_bulletin' as Permission, depth: 1 },
];

const SYSTEM_LINKS: NavItem[] = [
  { href: "/settings",    label: "Settings",    icon: Settings,   adminOnly: false },
  { href: "/help",        label: "Help",        icon: HelpCircle, adminOnly: false },
  { href: "/data-health", label: "Data Health", icon: HeartPulse, adminOnly: true  },
];

// Combined alias preserved so existing helpers (getActiveStep,
// isSupportActive, TopBarBreadcrumb) keep matching all non-workflow routes
// without a wider rewrite.
const SUPPORT_LINKS: NavItem[] = [...SECONDARY_LINKS, ...SYSTEM_LINKS];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPathActive(href: string, location: string): boolean {
  // Sprint 20 PR-E — pure group-header nav items carry href: "". They are
  // not routes and must never match the current location.
  if (!href) return false;
  if (href === "/" || href === "/dashboard") return location === "/" || location === "/dashboard";
  return location.startsWith(href);
}

/** Module-level helper — pass isAdmin + hasPermission explicitly */
function canSeeItem(
  item: { adminOnly: boolean; requiredPermission?: Permission },
  isAdmin: boolean,
  hasPermission: (perm: Permission) => boolean,
): boolean {
  if (item.adminOnly && !isAdmin) return false;
  if (item.requiredPermission) return hasPermission(item.requiredPermission);
  return true;
}

// Which step is currently active based on current route?
function getActiveStep(
  location: string,
  isAdmin: boolean,
  hasPermission: (perm: Permission) => boolean,
): string {
  for (const step of NAV_STEPS) {
    const visibleItems = step.items.filter(i => canSeeItem(i, isAdmin, hasPermission));
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
    <div className="flex items-center gap-2.5 min-w-0">
      <svg
        width="30"
        height="30"
        viewBox="0 0 36 36"
        fill="none"
        aria-label="Family Wealth Lab"
        className="shrink-0"
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
      {/* FWL Phase 7 polish — wordmark stays on a single line and shrinks
          letter-spacing slightly on narrow screens so it never wraps into
          the close button on mobile. */}
      <div className="leading-none min-w-0">
        <div className="text-[11px] font-bold tracking-wider text-foreground uppercase whitespace-nowrap">
          FamilyWealth
        </div>
        <div
          className="text-[10px] font-medium tracking-widest uppercase whitespace-nowrap"
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
  const { theme, toggleTheme, setTheme, logout, lastSaved, currentUser, privacyMode, togglePrivacy, role, isDemo, householdRole, permissions, hasPermission } =
    useAppStore();
  // Audit Mode — drives visibility of the developer "Audit Coverage" nav entry.
  const { auditMode } = useAuditMode();
  // Reserve bottom padding when the PWA install banner is showing (audit P1-5).
  const pwaVisible = usePwaBannerVisible();

  // Apply theme whenever it changes (dark/light only, no auto)
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdmin = role === "admin";

  /** Bound convenience wrapper for use inside Layout component */
  const seeItem = (item: { adminOnly: boolean; requiredPermission?: Permission }) =>
    canSeeItem(item, isAdmin, hasPermission);

  // Sprint 20 PR-H — Sidebar IA flatten. All 4 top-level groups start
  // COLLAPSED on a fresh load (including TODAY, even though Executive Overview
  // is the landing page — this is explicit per the user). Persisted to
  // localStorage so user toggles survive refresh. The 4 groups are the ONLY
  // expandable items in the sidebar; no nested accordion parents remain.
  const SECTION_NAV_KEY = "fwl.nav.sections.open";
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {
      today: false,
      plan: false,
      forecast: false,
      move: false,
    };
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(SECTION_NAV_KEY);
      if (raw === null) return initial;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      return { ...initial, ...parsed };
    } catch {
      return initial;
    }
  });

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = { ...prev, [id]: !prev[id] };
      if (typeof window !== "undefined") {
        try { window.localStorage.setItem(SECTION_NAV_KEY, JSON.stringify(next)); } catch { /* no-op */ }
      }
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const avatarLetter = currentUser === "Fara" ? "F" : "R";
  const roleLabel = householdRole === 'owner' ? 'Owner'
    : householdRole === 'partner' ? 'Partner'
    : householdRole === 'viewer' ? 'Viewer'
    : isAdmin ? 'Admin'
    : 'Family';

  // Step accent colors for active section headers
  const stepColors: Record<string, string> = {
    today:    "hsl(var(--intelligence-light))",
    plan:     "hsl(var(--gold-light))",
    forecast: "hsl(var(--forecast-light))",
    move:     "hsl(var(--success-light))",
  };
  const stepBorderColors: Record<string, string> = {
    today:    "hsl(var(--intelligence))",
    plan:     "hsl(var(--gold))",
    forecast: "hsl(var(--forecast))",
    move:     "hsl(var(--success))",
  };
  const stepSurfaceVar: Record<string, string> = {
    today:    "intelligence",
    plan:     "gold",
    forecast: "forecast",
    move:     "success",
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
      {/* Logo + close (mobile)
          FWL Phase 7 polish — mobile-safe header:
            • Reserves env(safe-area-inset-top) so the wordmark/close button
              clear the iOS status bar / notch.
            • Slightly taller (min-h on mobile) so wordmark doesn't crowd the
              close affordance.
            • The logo gets min-w-0 so the wordmark can shrink/wrap safely
              on very narrow devices instead of overlapping the close icon. */}
      <div
        className="flex items-center justify-between gap-3 px-4 sidebar-mobile-safe-header"
        style={{ borderBottom: "1px solid hsl(var(--border))" }}
      >
        <div className="min-w-0 flex-1">
          <WealthOSLogo />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden w-8 h-8 shrink-0"
          onClick={() => setMobileOpen(false)}
          data-testid="button-close-mobile-nav"
          aria-label="Close navigation"
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
          const visibleItems = stepDef.items.filter(i => seeItem(i));
          if (visibleItems.length === 0) return null;

          const isOpen = !!openSections[stepDef.id];
          const isActiveSection = visibleItems.some(i => isPathActive(i.href, location));
          const accentColor = stepColors[stepDef.id];
          const borderColor = stepBorderColors[stepDef.id];

          return (
            <div key={stepDef.id} className="relative">
              {/* Group header — toggles expand/collapse only; never navigates.
                  Sprint 20 PR-H: the 4 top-level groups (TODAY / PLAN /
                  FORECAST / MOVE) are the only expandable items in the
                  sidebar; all children are direct links. */}
              <button
                className="nav-section-header"
                style={isActiveSection ? { color: accentColor } : {}}
                onClick={() => toggleSection(stepDef.id)}
                data-testid={`nav-section-${stepDef.id}`}
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{
                      background: isActiveSection
                        ? `hsl(var(--${stepSurfaceVar[stepDef.id]}-surface))`
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

              {/* Direct-link children — no nested toggles. */}
              {isOpen && (
                <div className="mt-0.5 space-y-0.5 pb-1">
                  <div
                    className="absolute left-[18px] top-9 w-px"
                    style={{
                      bottom: "8px",
                      background: isActiveSection
                        ? `${borderColor}40`
                        : "hsl(var(--border))",
                    }}
                  />
                  {visibleItems.map((item) => {
                    const { href, label, icon: Icon } = item;
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
                          style={active ? { color: accentColor } : {}}
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

        {/* ─── SECONDARY / SYSTEM ───────────────────────────────────────────
            Sprint 14 IA — Secondary surfaces (insights / news / reports)
            sit above SYSTEM (settings / admin). Both share the same render
            shape as workflow items and honour `depth` for visual indent. */}
        {(() => {
          const renderLink = (item: NavItem) => {
            const { href, label, icon: Icon } = item;
            const depth = item.depth ?? 0;
            const active = isPathActive(href, location);
            const isChild = depth > 0;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
                className={`nav-item${active ? " active" : ""}`}
                style={isChild ? { paddingLeft: `${0.75 + depth * 1.5}rem` } : undefined}
              >
                <Icon
                  className="nav-item-icon"
                  style={{
                    ...(active ? { color: "hsl(var(--muted-foreground))" } : {}),
                    ...(isChild && !active ? { opacity: 0.7 } : {}),
                  }}
                />
                <span className={isChild ? "text-[12px]" : "text-[13px]"}>{label}</span>
                {active && (
                  <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-muted-foreground" />
                )}
              </Link>
            );
          };

          // Sprint 14 visual-hierarchy refinement — wrap contiguous depth>=1
          // runs in a left-border element so child links read as nested
          // beneath their preceding parent (matches the workflow nav).
          const renderList = (items: NavItem[]) => {
            const out: React.ReactNode[] = [];
            let i = 0;
            while (i < items.length) {
              const item = items[i];
              const depth = item.depth ?? 0;
              if (depth === 0) {
                out.push(renderLink(item));
                i++;
              } else {
                const group: NavItem[] = [];
                while (i < items.length && (items[i].depth ?? 0) > 0) {
                  group.push(items[i]);
                  i++;
                }
                out.push(
                  <div
                    key={`child-group-${group[0].href}`}
                    className="my-1 ml-4 pl-1 space-y-0.5"
                    style={{ borderLeft: "1px solid hsl(var(--border))" }}
                  >
                    {group.map(renderLink)}
                  </div>,
                );
              }
            }
            return out;
          };

          const visibleSecondary = SECONDARY_LINKS.filter(l => seeItem(l));
          const visibleSystem = SYSTEM_LINKS.filter(l => seeItem(l));
          return (
            <>
              {visibleSecondary.length > 0 && (
                <div
                  className="mt-3 pt-3"
                  style={{ borderTop: "1px solid hsl(var(--border) / 0.5)" }}
                  data-testid="nav-section-secondary"
                >
                  <p className="px-3 mb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 select-none">
                    Secondary
                  </p>
                  {renderList(visibleSecondary)}
                </div>
              )}
              {visibleSystem.length > 0 && (
                <div
                  className="mt-3 pt-3"
                  style={{ borderTop: "1px solid hsl(var(--border) / 0.5)" }}
                  data-testid="nav-section-system"
                >
                  <p className="px-3 mb-1 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 select-none">
                    System
                  </p>
                  {renderList(visibleSystem)}
                </div>
              )}
            </>
          );
        })()}

        {/* ─── ADMIN / DEVELOPER TOOLS ───────────────────────────────────────
            Audit Coverage report is the entry-point for the global Audit Mode
            inventory. We intentionally hide the whole section when Audit Mode
            is OFF — the report only makes sense in the context of the audit
            workflow, and the rest of the platform should stay calm. */}
        {auditMode && (
          <div
            className="mt-3 pt-3"
            style={{ borderTop: "1px solid hsl(var(--gold-dim) / 0.35)" }}
            data-testid="nav-section-admin-tools"
          >
            <p
              className="px-3 mb-1 text-[9px] font-bold uppercase tracking-widest select-none"
              style={{ color: "hsl(var(--gold) / 0.85)" }}
            >
              Admin · Developer Tools
            </p>
            {(() => {
              const href = "/audit-coverage";
              const label = "Audit Coverage";
              const active = isPathActive(href, location);
              return (
                <Link
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  data-testid="nav-audit-coverage"
                  className={`nav-item${active ? " active" : ""}`}
                >
                  <Microscope
                    className="nav-item-icon"
                    style={{ color: active ? "hsl(var(--gold))" : "hsl(var(--gold) / 0.75)" }}
                  />
                  <span className="text-[13px]">{label}</span>
                  {active && (
                    <ChevronRight
                      className="w-3 h-3 ml-auto shrink-0"
                      style={{ color: "hsl(var(--gold))" }}
                    />
                  )}
                </Link>
              );
            })()}
          </div>
        )}
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
        {/* Top bar — ONE safe-area source: header owns padding-top */}
        <header
          className="mobile-header flex items-center px-3 lg:px-4 gap-2 lg:gap-3 shrink-0"
          style={{
            borderBottom: "1px solid hsl(var(--border))",
            background: "hsl(var(--card) / 0.90)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
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

          {/* FWL_TAX_REFORM_ENGINE: global tax/policy selector removed
              from the top navbar. The selector is now surfaced contextually
              on the Tax Strategy, Property modelling, and Assumptions
              Centre surfaces (where it is meaningful). */}

          <div className="ml-auto flex items-center gap-2">
            <span className="live-clock-display"><LiveClock /></span>
            <span className="chart-view-toggle-header"><ChartViewToggle /></span>

            {/* Audit Mode toggle — global header chip */}
            <AuditModeToggle />

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

        {/* DEMO MODE banner — compact one-line on mobile, fuller on desktop */}
        {isDemo && (
          <div
            className="flex items-center gap-2 px-3 lg:px-4 shrink-0"
            style={{
              background: "linear-gradient(90deg, rgba(139,92,246,0.22), rgba(139,92,246,0.10))",
              borderBottom: "1px solid rgba(139,92,246,0.35)",
              color: "hsl(262,80%,78%)",
              minHeight: 36,
              maxHeight: 44,
              paddingTop: 6,
              paddingBottom: 6,
            }}
          >
            {/* Dot badge — always visible */}
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest shrink-0"
              style={{ background: "rgba(139,92,246,0.30)", border: "1px solid rgba(139,92,246,0.50)" }}
            >
              <svg width="6" height="6" viewBox="0 0 8 8" fill="none">
                <circle cx="4" cy="4" r="4" fill="hsl(262,80%,72%)" />
              </svg>
              DEMO
            </span>

            {/* Full text — desktop only */}
            <span className="demo-banner-text opacity-80 text-xs font-medium">
              Alex &amp; Sara Johnson — dummy data · nothing is real
            </span>

            {/* Compact text — mobile only */}
            <span className="demo-banner-compact hidden text-[11px] font-medium opacity-80">
              Dummy data · Exit
            </span>

            <button
              onClick={() => { logout(); }}
              className="ml-auto text-[10px] lg:text-[11px] px-2 lg:px-3 py-0.5 lg:py-1 rounded font-semibold transition-all shrink-0"
              style={{ background: "rgba(139,92,246,0.20)", border: "1px solid rgba(139,92,246,0.40)", color: "hsl(262,80%,80%)", cursor: "pointer" }}
            >
              Exit
            </button>
          </div>
        )}

        {/* Page content — reserves bottom padding when the PWA banner is
            shown so financial data (projection cards, dashboard rows) is
            never hidden behind the banner. The banner itself anchors to
            `env(safe-area-inset-bottom)`; here we add an equivalent
            extra-tall spacer that wins against iOS Safari's home-indicator
            inset. The reserved space is gated on `usePwaBannerVisible()`
            which now subscribes to a `fwl-pwa-banner-visibility` event so
            it flips in lockstep with the banner's actual DOM presence
            (covers the prior race where the banner showed but the spacer
            stayed collapsed). */}
        <main
          className={`pwa-main-scroll flex-1 overflow-y-auto overflow-x-hidden p-4 md:px-6 lg:p-6 ${pwaVisible ? "pb-[calc(8rem+env(safe-area-inset-bottom,0px))]" : ""}`}
          data-pwa-banner-active={pwaVisible ? "true" : "false"}
          data-testid="pwa-main-scroll"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

// ─── Top Bar Breadcrumb ───────────────────────────────────────────────────────

function TopBarBreadcrumb({ location, isAdmin }: { location: string; isAdmin: boolean }) {
  const hasPermission = useAppStore((s: any) => s.hasPermission);
  let stepLabel = "";
  let pageLabel = "";

  for (const step of NAV_STEPS) {
    const visibleItems = step.items.filter(i => canSeeItem(i, isAdmin, hasPermission));
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
      stepLabel = "TODAY";
      pageLabel = "Overview";
    }
  }

  // Sprint 20 PR-H — keyed by the flat 4-group uppercase labels.
  const stepColorMap: Record<string, string> = {
    TODAY:    "hsl(var(--intelligence-light))",
    PLAN:     "hsl(var(--gold-light))",
    FORECAST: "hsl(var(--forecast-light))",
    MOVE:     "hsl(var(--success-light))",
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

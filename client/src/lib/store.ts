/**
 * store.ts — Zustand global store
 * Auth state + user + privacy mode are all persisted to localStorage
 * so login and preferences survive page refresh.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type CurrentUser = "Roham" | "Fara" | "Demo";
export type UserRole = "admin" | "family_user" | "demo";
export type HouseholdRole = "owner" | "partner" | "viewer" | "demo";

/**
 * Permission strings used for feature-level access control.
 * household_role drives defaults; individual permissions can be toggled by owner.
 */
export type Permission =
  | "view_bulletin"
  | "run_bulletin"
  | "view_ai_insights"
  | "receive_telegram_alerts"
  | "edit_financial_plan"
  | "edit_expenses"
  | "edit_bills"
  | "manage_users"
  | "manage_settings";

/** Derive default permissions from household_role */
export function defaultPermissionsForRole(role: HouseholdRole): Permission[] {
  switch (role) {
    case 'owner':   return ['view_bulletin','run_bulletin','view_ai_insights','receive_telegram_alerts','edit_financial_plan','edit_expenses','edit_bills','manage_users','manage_settings'];
    case 'partner': return ['view_bulletin','run_bulletin','view_ai_insights','receive_telegram_alerts'];
    case 'viewer':  return ['view_bulletin','view_ai_insights'];
    case 'demo':    return [];
    default:        return [];
  }
}
export type ThemeMode = "dark" | "light";

/** Apply the resolved theme class to <html>. */
export function applyTheme(mode: ThemeMode) {
  const html = document.documentElement;
  html.classList.toggle("light", mode === "light");
  html.dataset.theme = mode;
}

interface AppState {
  isAuthenticated: boolean;
  isDemo: boolean;               // true = guest/demo mode — no real data
  theme: ThemeMode;
  lastSaved: string | null;
  chartView: "monthly" | "annual";
  privacyMode: boolean;          // true = numbers hidden (default for new users)
  currentUser: CurrentUser;      // which family member is logged in
  role: UserRole;                // admin = full access, family_user = restricted, demo = read-only fake
  householdRole: HouseholdRole;  // owner | partner | viewer | demo
  permissions: Permission[];     // fine-grained feature permissions from Supabase + household config
  login: () => void;
  loginAsDemo: () => void;
  logout: () => void;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
  setLastSaved: (time: string) => void;
  setChartView: (view: "monthly" | "annual") => void;
  togglePrivacy: () => void;
  setCurrentUser: (user: CurrentUser) => void;
  setRole: (role: UserRole) => void;
  setHouseholdRole: (role: HouseholdRole) => void;
  setPermissions: (perms: Permission[]) => void;
  /** True if the current user has the given permission */
  hasPermission: (perm: Permission) => boolean;
}

// Re-export forecast mode type for convenience
export type { ForecastMode, ForecastProfile } from './forecastStore';

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      isDemo: false,
      theme: "dark",
      lastSaved: null,
      chartView: "annual",
      privacyMode: true,                     // hidden by default
      currentUser: "Roham",                  // default user
      role: "admin",                         // default role
      householdRole: "owner",                // default household role
      permissions: defaultPermissionsForRole('owner'),

      login: () => set({ isAuthenticated: true, isDemo: false }),

      loginAsDemo: () => set({
        isAuthenticated: true,
        isDemo: true,
        currentUser: "Demo",
        role: "demo",
        householdRole: "demo",
        permissions: [],
        privacyMode: false,
      }),

      logout: () => set({
        isAuthenticated: false,
        isDemo: false,
        role: "admin",
        householdRole: "owner",
        permissions: defaultPermissionsForRole('owner'),
        currentUser: "Roham",
        privacyMode: true,
      }),

      togglePrivacy: () => set((state) => ({ privacyMode: !state.privacyMode })),

      toggleTheme: () =>
        set((state) => {
          // Toggle: dark → light → dark (no auto)
          const next: ThemeMode = state.theme === "dark" ? "light" : "dark";
          applyTheme(next);
          return { theme: next };
        }),

      setTheme: (mode: ThemeMode) =>
        set(() => {
          applyTheme(mode);
          return { theme: mode };
        }),

      setLastSaved: (time: string) => set({ lastSaved: time }),

      setChartView: (view) => set({ chartView: view }),

      setCurrentUser: (user: CurrentUser) => set({ currentUser: user }),

      setRole: (role: UserRole) => set({ role }),

      setHouseholdRole: (role: HouseholdRole) => set({ householdRole: role }),

      setPermissions: (perms: Permission[]) => set({ permissions: perms }),

      hasPermission: (perm: Permission) => {
        const state = useAppStore.getState();
        // owner always has all permissions regardless of stored array
        if (state.householdRole === 'owner' || state.role === 'admin') return true;
        return Array.isArray(state.permissions) && state.permissions.includes(perm);
      },
    }),
    {
      name: "shahrokh-app-state",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        isDemo: state.isDemo,
        theme: state.theme,
        chartView: state.chartView,
        privacyMode: state.privacyMode,
        currentUser: state.currentUser,
        role: state.role,
        householdRole: state.householdRole,
        permissions: state.permissions,
      }),
    }
  )
);

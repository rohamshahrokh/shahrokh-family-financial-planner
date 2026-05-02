/**
 * store.ts — Zustand global store
 * Auth state + user + privacy mode are all persisted to localStorage
 * so login and preferences survive page refresh.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type CurrentUser = "Roham" | "Fara";
export type UserRole = "admin" | "family_user";
export type ThemeMode = "dark" | "light" | "auto";

/** Apply the resolved theme class to <html>. Auto resolves by local time. */
export function applyTheme(mode: ThemeMode) {
  const resolved = mode === "auto" ? resolveAutoTheme() : mode;
  const html = document.documentElement;
  html.classList.toggle("light", resolved === "light");
  html.dataset.theme = mode; // store raw mode for UI display
}

/** Auto theme: light 7 AM – 6 PM, dark otherwise (local time) */
export function resolveAutoTheme(): "dark" | "light" {
  const h = new Date().getHours();
  return h >= 7 && h < 18 ? "light" : "dark";
}

interface AppState {
  isAuthenticated: boolean;
  theme: ThemeMode;
  lastSaved: string | null;
  chartView: "monthly" | "annual";
  privacyMode: boolean;       // true = numbers hidden (default for new users)
  currentUser: CurrentUser;   // which family member is logged in
  role: UserRole;             // admin = full access, family_user = restricted
  login: () => void;
  logout: () => void;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
  setLastSaved: (time: string) => void;
  setChartView: (view: "monthly" | "annual") => void;
  togglePrivacy: () => void;
  setCurrentUser: (user: CurrentUser) => void;
  setRole: (role: UserRole) => void;
}

// Re-export forecast mode type for convenience
export type { ForecastMode, ForecastProfile } from './forecastStore';

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      theme: "dark",
      lastSaved: null,
      chartView: "annual",
      privacyMode: true,       // hidden by default
      currentUser: "Roham",    // default user
      role: "admin",           // default role

      login: () => set({ isAuthenticated: true }),

      logout: () => set({ isAuthenticated: false, role: "admin", currentUser: "Roham" }),

      togglePrivacy: () => set((state) => ({ privacyMode: !state.privacyMode })),

      toggleTheme: () =>
        set((state) => {
          // Cycle: dark → light → auto → dark
          const next: ThemeMode =
            state.theme === "dark"  ? "light" :
            state.theme === "light" ? "auto"  : "dark";
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
    }),
    {
      name: "shahrokh-app-state",           // localStorage key
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        theme: state.theme,
        chartView: state.chartView,
        privacyMode: state.privacyMode,
        currentUser: state.currentUser,
        role: state.role,
      }),
    }
  )
);

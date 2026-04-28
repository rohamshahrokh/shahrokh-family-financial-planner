/**
 * store.ts — Zustand global store
 * Auth state + user + privacy mode are all persisted to localStorage
 * so login and preferences survive page refresh.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type CurrentUser = "Roham" | "Fara";
export type UserRole = "admin" | "family_user";

interface AppState {
  isAuthenticated: boolean;
  theme: "dark" | "light";
  lastSaved: string | null;
  chartView: "monthly" | "annual";
  privacyMode: boolean;       // true = numbers hidden (default for new users)
  currentUser: CurrentUser;   // which family member is logged in
  role: UserRole;             // admin = full access, family_user = restricted
  login: () => void;
  logout: () => void;
  toggleTheme: () => void;
  setLastSaved: (time: string) => void;
  setChartView: (view: "monthly" | "annual") => void;
  togglePrivacy: () => void;
  setCurrentUser: (user: CurrentUser) => void;
  setRole: (role: UserRole) => void;
}

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
          const newTheme = state.theme === "dark" ? "light" : "dark";
          document.documentElement.classList.toggle("light", newTheme === "light");
          return { theme: newTheme };
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

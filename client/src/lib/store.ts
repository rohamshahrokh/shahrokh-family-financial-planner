/**
 * store.ts — Zustand global store
 * Auth state is persisted to localStorage so login survives page refresh.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface AppState {
  isAuthenticated: boolean;
  theme: "dark" | "light";
  lastSaved: string | null;
  chartView: "monthly" | "annual";
  login: () => void;
  logout: () => void;
  toggleTheme: () => void;
  setLastSaved: (time: string) => void;
  setChartView: (view: "monthly" | "annual") => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      theme: "dark",
      lastSaved: null,
      chartView: "annual",

      login: () => set({ isAuthenticated: true }),

      logout: () => set({ isAuthenticated: false }),

      toggleTheme: () =>
        set((state) => {
          const newTheme = state.theme === "dark" ? "light" : "dark";
          document.documentElement.classList.toggle("light", newTheme === "light");
          return { theme: newTheme };
        }),

      setLastSaved: (time: string) => set({ lastSaved: time }),

      setChartView: (view) => set({ chartView: view }),
    }),
    {
      name: "shahrokh-app-state",           // localStorage key
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        theme: state.theme,
        chartView: state.chartView,
      }),
    }
  )
);

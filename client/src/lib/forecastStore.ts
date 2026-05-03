/**
 * forecastStore.ts — Global Forecast Mode + Year-by-Year Assumptions
 *
 * Zustand store persisted to localStorage (cache) + synced to Supabase.
 * Single source of truth for:
 *   - forecast_mode: 'profile' | 'year-by-year' | 'monte-carlo'
 *   - profile: 'conservative' | 'moderate' | 'aggressive'
 *   - yearlyAssumptions: per-year overrides 2026–2035
 *   - monteCarloResult: cached simulation output
 *
 * All pages import useForecastStore() to get active assumptions.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ForecastMode = 'profile' | 'year-by-year' | 'monte-carlo';
export type ForecastProfile = 'conservative' | 'moderate' | 'aggressive';

export interface YearAssumptions {
  year: number;
  property_growth: number;
  stocks_return: number;
  crypto_return: number;
  super_return: number;
  cash_return: number;
  inflation: number;
  income_growth: number;
  expense_growth: number;
  interest_rate: number;
  rent_growth: number;
}

export interface MonteCarloFanPoint {
  year: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
}

export interface MonteCarloResult {
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  prob_ff: number;       // % probability of financial freedom (passive income > expenses)
  prob_3m: number;
  prob_5m: number;
  prob_10m: number;
  prob_neg_cf: number;   // % probability of at least one year with negative cashflow
  prob_cash_shortfall: number; // % probability cash ever drops below emergency buffer
  lowest_cash_median: number;  // median of lowest cash balance across all sims
  highest_risk_year: number;   // year where most sims had negative cashflow
  biggest_risk_driver: string; // top risk driver label
  fan_data: MonteCarloFanPoint[];
  key_risks: string[];
  recommended_actions: string[];
  ran_at: string;        // ISO timestamp
  simulations: number;
}

// ─── Per-asset MC volatility assumptions ──────────────────────────────────────
// User-editable parameters that feed directly into the Monte Carlo engine.

export interface MCVolatilityParams {
  // Property
  prop_volatility:       number;  // annual std dev % (default 5)
  prop_vacancy_rate:     number;  // % of time vacant (default 3)
  prop_maintenance_pct:  number;  // % of value per year (default 1)
  prop_purchase_cost_pct: number; // stamp duty + legal as % of price (default 4)
  // Stocks
  stock_volatility:      number;  // annual std dev % (default 18)
  stock_correction_prob: number;  // probability of ≥20% correction in any year (default 15)
  stock_correction_size: number;  // median correction size % (default 30)
  // Crypto
  crypto_volatility:     number;  // annual std dev % (default 60)
  crypto_crash_prob:     number;  // probability of ≥50% crash in any year (default 25)
  crypto_crash_size:     number;  // median crash size % (default 65)
  crypto_bull_prob:      number;  // probability of ≥100% bull run in any year (default 20)
  crypto_bull_upside:    number;  // median bull run upside % (default 150)
  // Cash
  cash_interest_rate:    number;  // savings account rate % (default 4.5)
  emergency_buffer:      number;  // target minimum cash $ (default 30000)
  // Debt
  rate_shock_prob:       number;  // probability of 1%+ rate rise in any year (default 30)
  rate_shock_size:       number;  // shock size % (default 1.5)
  // General
  inflation_volatility:  number;  // std dev of inflation (default 0.5)
}

export const DEFAULT_MC_VOLATILITY: MCVolatilityParams = {
  prop_volatility:        5,
  prop_vacancy_rate:      3,
  prop_maintenance_pct:   1,
  prop_purchase_cost_pct: 4,
  stock_volatility:       18,
  stock_correction_prob:  15,
  stock_correction_size:  30,
  crypto_volatility:      60,
  crypto_crash_prob:      25,
  crypto_crash_size:      65,
  crypto_bull_prob:       20,
  crypto_bull_upside:     150,
  cash_interest_rate:     4.5,
  emergency_buffer:       30_000,
  rate_shock_prob:        30,
  rate_shock_size:        1.5,
  inflation_volatility:   0.5,
};

// ─── Profile presets ─────────────────────────────────────────────────────────

const PROFILE_PRESETS: Record<ForecastProfile, Omit<YearAssumptions, 'year'>> = {
  conservative: {
    property_growth: 4.0,
    stocks_return:   6.0,
    crypto_return:   5.0,
    super_return:    7.0,
    cash_return:     4.0,
    inflation:       3.5,
    income_growth:   2.5,
    expense_growth:  3.5,
    interest_rate:   7.0,
    rent_growth:     2.0,
  },
  moderate: {
    property_growth: 6.0,
    stocks_return:  10.0,
    crypto_return:  20.0,
    super_return:   10.0,
    cash_return:     4.5,
    inflation:       3.0,
    income_growth:   3.5,
    expense_growth:  3.0,
    interest_rate:   6.5,
    rent_growth:     3.0,
  },
  aggressive: {
    property_growth: 9.0,
    stocks_return:  15.0,
    crypto_return:  40.0,
    super_return:   13.0,
    cash_return:     5.0,
    inflation:       2.5,
    income_growth:   5.0,
    expense_growth:  2.5,
    interest_rate:   6.0,
    rent_growth:     4.0,
  },
};

export const PROFILE_DEFAULTS = PROFILE_PRESETS;

export function generateYearlyFromProfile(profile: ForecastProfile): YearAssumptions[] {
  const base = PROFILE_PRESETS[profile];
  return Array.from({ length: 10 }, (_, i) => ({ year: 2026 + i, ...base }));
}

// ─── Supabase helpers (direct fetch — no npm package) ─────────────────────────

const SB_URL  = 'https://uoraduyyxhtzixcsaidg.supabase.co';
const SB_KEY  = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvcmFkdXl5eGh0eml4Y3NhaWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMjEwMTgsImV4cCI6MjA5MjY5NzAxOH0.qNrqDlG4j0lfGKDsmGyywP8DZeMurB02UWv4bdevW7c';
const OWNER   = 'shahrokh-family-main';
const HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

export async function sbLoadAssumptions(): Promise<YearAssumptions[]> {
  const res = await fetch(
    `${SB_URL}/rest/v1/sf_forecast_assumptions?owner_id=eq.${OWNER}&order=year.asc`,
    { headers: HEADERS }
  );
  if (!res.ok) return [];
  return res.json();
}

export async function sbSaveAssumptions(rows: YearAssumptions[]): Promise<void> {
  const payload = rows.map(r => ({ ...r, owner_id: OWNER, updated_at: new Date().toISOString() }));
  await fetch(
    `${SB_URL}/rest/v1/sf_forecast_assumptions?on_conflict=owner_id,year`,
    {
      method: 'POST',
      headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload),
    }
  );
}

export async function sbLoadSettings(): Promise<{ forecast_mode: ForecastMode; profile: ForecastProfile; max_lvr?: number } | null> {
  const res = await fetch(
    `${SB_URL}/rest/v1/sf_forecast_settings?owner_id=eq.${OWNER}&limit=1`,
    { headers: HEADERS }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ?? null;
}

export async function sbSaveSettings(mode: ForecastMode, profile: ForecastProfile, maxLvr: number = 80): Promise<void> {
  await fetch(
    `${SB_URL}/rest/v1/sf_forecast_settings?on_conflict=owner_id`,
    {
      method: 'POST',
      headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ owner_id: OWNER, forecast_mode: mode, profile, max_lvr: maxLvr, updated_at: new Date().toISOString() }),
    }
  );
}

export async function sbSaveMCResult(result: MonteCarloResult): Promise<void> {
  await fetch(
    `${SB_URL}/rest/v1/sf_forecast_settings?on_conflict=owner_id`,
    {
      method: 'POST',
      headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        owner_id: OWNER,
        mc_last_run:    result.ran_at,
        mc_p10:         result.p10,
        mc_p25:         result.p25,
        mc_median:      result.median,
        mc_p75:         result.p75,
        mc_p90:         result.p90,
        mc_prob_ff:     result.prob_ff,
        mc_prob_3m:     result.prob_3m,
        mc_prob_5m:     result.prob_5m,
        mc_prob_10m:    result.prob_10m,
        mc_prob_neg_cf: result.prob_neg_cf,
        mc_fan_data:    result.fan_data,
        mc_key_risks:   result.key_risks,
        mc_actions:     result.recommended_actions,
        updated_at:     new Date().toISOString(),
      }),
    }
  );
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface ForecastStoreState {
  forecastMode: ForecastMode;
  profile: ForecastProfile;
  yearlyAssumptions: YearAssumptions[];  // 2026–2035
  monteCarloResult: MonteCarloResult | null;
  mcVolatility: MCVolatilityParams;      // per-asset volatility + event params
  /** Max LVR % used to compute usable equity / deposit power. Default 80. */
  maxLvr: number;
  isRunningMC: boolean;
  isSaving: boolean;

  // Actions
  setForecastMode: (mode: ForecastMode) => void;
  setProfile: (profile: ForecastProfile) => void;
  setMaxLvr: (lvr: number) => void;
  setYearAssumption: (year: number, field: keyof Omit<YearAssumptions, 'year'>, value: number) => void;
  setAllYearlyAssumptions: (rows: YearAssumptions[]) => void;
  generateFromProfile: (profile: ForecastProfile) => void;
  setMonteCarloResult: (result: MonteCarloResult) => void;
  setIsRunningMC: (v: boolean) => void;
  setMCVolatility: (params: Partial<MCVolatilityParams>) => void;
  resetMCVolatility: () => void;

  // Persistence
  saveToSupabase: () => Promise<void>;
  loadFromSupabase: () => Promise<void>;

  // Derived helper — get effective assumptions for a given year
  getYearAssumptions: (year: number) => YearAssumptions;
  getActiveAssumptionsForEngine: () => {
    inflation: number;
    ppor_growth: number;
    income_growth: number;
    expense_growth: number;
    interest_rate: number;
    stocks_return: number;
    crypto_return: number;
    super_return: number;
    rent_growth: number;
  };
}

const DEFAULT_YEARLY = generateYearlyFromProfile('moderate');

export const useForecastStore = create<ForecastStoreState>()(
  persist(
    (set, get) => ({
      forecastMode: 'profile',
      profile: 'moderate',
      yearlyAssumptions: DEFAULT_YEARLY,
      monteCarloResult: null,
      mcVolatility: { ...DEFAULT_MC_VOLATILITY },
      maxLvr: 80,
      isRunningMC: false,
      isSaving: false,

      setForecastMode: (mode) => {
        set({ forecastMode: mode });
        sbSaveSettings(mode, get().profile, get().maxLvr).catch(() => {});
      },

      setProfile: (profile) => {
        set({ profile });
        sbSaveSettings(get().forecastMode, profile, get().maxLvr).catch(() => {});
      },

      setMaxLvr: (lvr) => {
        // Clamp 0–95; LMI starts >80, hard cap is ~95.
        const clamped = Math.max(0, Math.min(95, Math.round(lvr * 100) / 100));
        set({ maxLvr: clamped });
        sbSaveSettings(get().forecastMode, get().profile, clamped).catch(() => {});
      },

      setYearAssumption: (year, field, value) => {
        set(state => ({
          yearlyAssumptions: state.yearlyAssumptions.map(r =>
            r.year === year ? { ...r, [field]: value } : r
          ),
        }));
      },

      setAllYearlyAssumptions: (rows) => set({ yearlyAssumptions: rows }),

      generateFromProfile: (profile) => {
        set({ yearlyAssumptions: generateYearlyFromProfile(profile) });
      },

      setMonteCarloResult: (result) => set({ monteCarloResult: result }),
      setIsRunningMC: (v) => set({ isRunningMC: v }),

      setMCVolatility: (params) => set(state => ({
        mcVolatility: { ...state.mcVolatility, ...params },
      })),
      resetMCVolatility: () => set({ mcVolatility: { ...DEFAULT_MC_VOLATILITY } }),

      saveToSupabase: async () => {
        const { yearlyAssumptions, forecastMode, profile, maxLvr } = get();
        set({ isSaving: true });
        try {
          await Promise.all([
            sbSaveAssumptions(yearlyAssumptions),
            sbSaveSettings(forecastMode, profile, maxLvr),
          ]);
        } finally {
          set({ isSaving: false });
        }
      },

      loadFromSupabase: async () => {
        try {
          const [rows, settings] = await Promise.all([
            sbLoadAssumptions(),
            sbLoadSettings(),
          ]);
          if (rows && rows.length > 0) {
            set({ yearlyAssumptions: rows });
          }
          if (settings) {
            set({
              forecastMode: settings.forecast_mode,
              profile: settings.profile,
              maxLvr: typeof settings.max_lvr === 'number' ? settings.max_lvr : 80,
            });
          }
        } catch { /* silent — localStorage cache used as fallback */ }
      },

      getYearAssumptions: (year) => {
        const { yearlyAssumptions, profile } = get();
        return yearlyAssumptions.find(r => r.year === year)
          ?? { year, ...PROFILE_PRESETS[profile] };
      },

      getActiveAssumptionsForEngine: () => {
        const { forecastMode, profile, yearlyAssumptions, monteCarloResult } = get();
        // For engine compatibility — returns 2026 row (first year) or profile defaults
        // Pages that need per-year should call getYearAssumptions per year
        const base = forecastMode === 'year-by-year' && yearlyAssumptions.length > 0
          ? yearlyAssumptions[0]
          : { ...PROFILE_PRESETS[profile], year: 2026 };

        return {
          inflation:      base.inflation,
          ppor_growth:    base.property_growth,
          income_growth:  base.income_growth,
          expense_growth: base.expense_growth,
          interest_rate:  base.interest_rate,
          stocks_return:  base.stocks_return,
          crypto_return:  base.crypto_return,
          super_return:   base.super_return,
          rent_growth:    base.rent_growth,
        };
      },
    }),
    {
      name: 'shahrokh-forecast-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        forecastMode:       state.forecastMode,
        profile:            state.profile,
        yearlyAssumptions:  state.yearlyAssumptions,
        monteCarloResult:   state.monteCarloResult,
        mcVolatility:       state.mcVolatility,
        maxLvr:             state.maxLvr,
      }),
    }
  )
);

/**
 * Scenario Engine V2 — Persistence Layer
 * ────────────────────────────────────────────────────────────────────────────
 * Save / load / list / clone / delete scenarios and assumption presets.
 *
 * Multi-user clean:
 *   Every row carries owner_id (DB-set to 'shahrokh-family-main' for now).
 *   Future auth migration: change V2_OWNER in supabaseClient to user.id.
 *
 * Determinism + audit trail:
 *   Each saved scenario stores
 *     - seed                 (the Mulberry32 seed)
 *     - snapshot_hash        (stableHash of engine-relevant snapshot fields)
 *     - assumptions_hash     (stableHash of overrides + capital + deltas)
 *     - last_result          (full ExtendedScenarioResult[] of last run)
 *     - last_run_at, last_run_ms
 *   This lets the UI flag "stale" results and reproduce any run byte-for-byte.
 *
 * Local fallback:
 *   If Supabase calls fail (offline, network blip), we cache the most recent
 *   ten scenarios + last preset in localStorage so the user never loses work.
 */

import {
  sbV2Scenarios,
  sbV2AssumptionsPreset,
  type V2ScenarioRow,
  type V2AssumptionsPresetRow,
} from "@/lib/supabaseClient";
import { stableHash } from "./determinism";
import type { ScenarioDelta, BasePlanAssumptions } from "./types";

// ─── localStorage fallback ────────────────────────────────────────────────────

const LS_SCENARIOS_KEY = "fwl_v2_scenarios_cache";
const LS_PRESETS_KEY = "fwl_v2_presets_cache";
const LS_LAST_ASSUMPTIONS_KEY = "fwl_v2_last_assumptions";

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or disabled — silent */
  }
}

// ─── Scenario CRUD ────────────────────────────────────────────────────────────

export interface SavedScenario extends V2ScenarioRow {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface ScenarioSavePayload {
  name: string;
  description?: string | null;
  assumptions: Record<string, unknown>;
  deltas: ScenarioDelta[];
  horizonMonths: number;
  simulationCount: number;
  startMonth: string;
  seed?: number;
  snapshotHash?: string;
  lastResult?: Record<string, unknown> | null;
  lastRunAt?: string | null;
  lastRunMs?: number | null;
}

export function deriveAssumptionsHash(input: {
  assumptions: Record<string, unknown>;
  deltas: ScenarioDelta[];
  horizonMonths: number;
  simulationCount: number;
  startMonth: string;
}): string {
  return stableHash({
    a: input.assumptions,
    d: input.deltas,
    h: input.horizonMonths,
    s: input.simulationCount,
    m: input.startMonth,
  });
}

function toRow(p: ScenarioSavePayload): Omit<V2ScenarioRow, "id"> {
  return {
    name: p.name,
    description: p.description ?? null,
    status: "saved",
    assumptions: p.assumptions,
    deltas: p.deltas as unknown as any[],
    horizon_months: p.horizonMonths,
    simulation_count: p.simulationCount,
    start_month: p.startMonth,
    seed: p.seed ?? null,
    snapshot_hash: p.snapshotHash ?? null,
    assumptions_hash: deriveAssumptionsHash({
      assumptions: p.assumptions,
      deltas: p.deltas,
      horizonMonths: p.horizonMonths,
      simulationCount: p.simulationCount,
      startMonth: p.startMonth,
    }),
    last_result: p.lastResult ?? null,
    last_run_at: p.lastRunAt ?? null,
    last_run_ms: p.lastRunMs ?? null,
  };
}

export const v2Persistence = {
  /** List all saved scenarios (Supabase first, falls back to localStorage). */
  async list(): Promise<SavedScenario[]> {
    try {
      const rows = await sbV2Scenarios.getAll();
      // Cache last 10 for offline
      lsSet(LS_SCENARIOS_KEY, rows.slice(0, 10));
      return rows as SavedScenario[];
    } catch (err) {
      console.warn("[v2Persistence] list failed, using cache:", err);
      return lsGet<SavedScenario[]>(LS_SCENARIOS_KEY, []);
    }
  },

  async getById(id: string): Promise<SavedScenario | null> {
    try {
      const row = await sbV2Scenarios.getById(id);
      return row as SavedScenario | null;
    } catch {
      const cached = lsGet<SavedScenario[]>(LS_SCENARIOS_KEY, []);
      return cached.find(s => s.id === id) ?? null;
    }
  },

  /** Create a new scenario row. Returns the persisted row (with id). */
  async create(payload: ScenarioSavePayload): Promise<SavedScenario> {
    const row = toRow(payload);
    try {
      const saved = await sbV2Scenarios.create(row as V2ScenarioRow);
      // Refresh cache
      this.list().catch(() => {});
      return saved as SavedScenario;
    } catch (err) {
      console.error("[v2Persistence] create failed:", err);
      // Stash locally so user doesn't lose work
      const local: SavedScenario = {
        ...row,
        id: `local-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as SavedScenario;
      const cached = lsGet<SavedScenario[]>(LS_SCENARIOS_KEY, []);
      lsSet(LS_SCENARIOS_KEY, [local, ...cached].slice(0, 10));
      throw err;
    }
  },

  /** Update an existing scenario in place. */
  async update(id: string, payload: ScenarioSavePayload): Promise<SavedScenario> {
    const row = toRow(payload);
    const saved = await sbV2Scenarios.update(id, row);
    this.list().catch(() => {});
    return saved as SavedScenario;
  },

  /** Update only the last_result + run timestamps (lighter than full update). */
  async updateLastRun(
    id: string,
    lastResult: Record<string, unknown> | null,
    lastRunMs: number,
  ): Promise<SavedScenario> {
    const saved = await sbV2Scenarios.update(id, {
      last_result: lastResult,
      last_run_at: new Date().toISOString(),
      last_run_ms: lastRunMs,
    });
    this.list().catch(() => {});
    return saved as SavedScenario;
  },

  async clone(id: string, newName: string): Promise<SavedScenario> {
    const src = await this.getById(id);
    if (!src) throw new Error(`Scenario ${id} not found`);
    return this.create({
      name: newName,
      description: src.description,
      assumptions: src.assumptions,
      deltas: src.deltas as ScenarioDelta[],
      horizonMonths: src.horizon_months,
      simulationCount: src.simulation_count,
      startMonth: src.start_month,
      seed: src.seed ?? undefined,
      snapshotHash: src.snapshot_hash ?? undefined,
    });
  },

  async delete(id: string): Promise<void> {
    await sbV2Scenarios.delete(id);
    const cached = lsGet<SavedScenario[]>(LS_SCENARIOS_KEY, []);
    lsSet(LS_SCENARIOS_KEY, cached.filter(s => s.id !== id));
  },
};

// ─── Assumption preset CRUD ───────────────────────────────────────────────────

export interface AssumptionPreset extends V2AssumptionsPresetRow {
  id: string;
  created_at: string;
  updated_at: string;
}

export const v2Presets = {
  async list(): Promise<AssumptionPreset[]> {
    try {
      const rows = await sbV2AssumptionsPreset.getAll();
      lsSet(LS_PRESETS_KEY, rows);
      return rows as AssumptionPreset[];
    } catch {
      return lsGet<AssumptionPreset[]>(LS_PRESETS_KEY, []);
    }
  },

  async getDefault(): Promise<AssumptionPreset | null> {
    try {
      const row = await sbV2AssumptionsPreset.getDefault();
      return row as AssumptionPreset | null;
    } catch {
      return null;
    }
  },

  async create(name: string, payload: Record<string, unknown>, makeDefault = false): Promise<AssumptionPreset> {
    const saved = await sbV2AssumptionsPreset.create({
      name,
      is_default: makeDefault,
      payload,
    });
    if (makeDefault && saved?.id) {
      await sbV2AssumptionsPreset.setDefault(saved.id);
    }
    return saved as AssumptionPreset;
  },

  async update(id: string, name: string, payload: Record<string, unknown>): Promise<AssumptionPreset> {
    return (await sbV2AssumptionsPreset.update(id, { name, payload })) as AssumptionPreset;
  },

  async setDefault(id: string): Promise<void> {
    await sbV2AssumptionsPreset.setDefault(id);
  },

  async delete(id: string): Promise<void> {
    await sbV2AssumptionsPreset.delete(id);
  },
};

// ─── Last-used assumptions (auto-restore on page load) ────────────────────────

export const v2LastAssumptions = {
  save(payload: Record<string, unknown> | object): void {
    lsSet(LS_LAST_ASSUMPTIONS_KEY, payload);
  },
  load<T = Record<string, unknown>>(): T | null {
    return lsGet<T | null>(LS_LAST_ASSUMPTIONS_KEY, null);
  },
};

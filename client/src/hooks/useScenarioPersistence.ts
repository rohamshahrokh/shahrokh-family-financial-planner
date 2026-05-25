/**
 * useScenarioPersistence.ts — Sprint 6 Phase 3.
 *
 * Thin client-side hook that wraps `apiRequest("/api/scenario-records", …)`
 * with graceful fallback when the backing store is unavailable or when the
 * app is running in demo mode.
 *
 * Responsibilities
 * ----------------
 *   - Auto-load saved scenario records on mount.
 *   - Expose imperative actions for the workspace: saveScenario, saveAll,
 *     snapshotScenario, archiveScenario, restoreScenario, refresh.
 *   - Track persistence status ("idle" | "loading" | "saving" | "error" |
 *     "fallback") so the UI can render a status badge.
 *
 * Strict separation
 * -----------------
 *   - No financial calculations.
 *   - No household values. Snapshot metric arrays are pulled straight from
 *     the engine output bundle the caller passes in.
 *   - When persistence fails, the workspace continues operating with
 *     local-only state — Phase 2 behaviour is fully preserved.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import type {
  BuilderScenario,
  BuilderState,
  BuilderCompareResult,
  BuilderScenarioResult,
} from "@/lib/scenarioBuilderWorkspace";
import {
  appendSnapshot,
  archiveScenarioRecord as archiveRecord,
  buildAssumptionsSummary,
  captureSnapshot,
  commitVersion,
  createScenarioRecord,
  fromScenarioPayload,
  getLatestVersionPayload,
  mergeRecordsIntoState,
  payloadsEqual,
  toScenarioPayload,
  type ScenarioRecord,
  type ScenarioRecordsBundle,
  type ScenarioSnapshot,
  type ScenarioTag,
  type ScenarioSnapshotAssumption,
} from "@/lib/scenarioPersistence";

export type PersistenceStatus =
  | "idle"
  | "loading"
  | "saving"
  | "saved"
  | "fallback"
  | "error";

export interface UseScenarioPersistenceOptions {
  /** Optional override for "now" — pass a fixed value in tests for determinism. */
  now?: () => string;
  /** Optional override for record id generation. */
  recordIdGenerator?: (scenario: BuilderScenario) => string;
  /** Optional override for version id generation. */
  versionIdGenerator?: (record: ScenarioRecord, nextVersionNumber: number) => string;
  /** Optional override for snapshot id generation. */
  snapshotIdGenerator?: (record: ScenarioRecord, version: number, label: string) => string;
  /** Skip auto-load on mount (useful in tests / SSR). */
  skipAutoLoad?: boolean;
}

export interface SaveScenarioOptions {
  tags?: ScenarioTag[];
  notes?: string;
  comment?: string | null;
  isBaseline?: boolean;
}

export interface SnapshotScenarioOptions {
  label?: string;
  comment?: string | null;
  assumptions?: ScenarioSnapshotAssumption[];
}

export interface UseScenarioPersistenceResult {
  status: PersistenceStatus;
  errorMessage: string | null;
  records: ScenarioRecord[];
  bundle: ScenarioRecordsBundle;
  /** True when the records came from a real backend (server or Supabase). */
  hasRemote: boolean;
  /** True when the workspace is running in demo / local-only mode. */
  fallback: boolean;
  refresh: () => Promise<void>;
  /** Save a scenario to the backing store. Creates v1 on first save, vN+1 on
   *  subsequent saves when the payload differs from the latest version. */
  saveScenario: (
    scenario: BuilderScenario,
    options?: SaveScenarioOptions,
  ) => Promise<ScenarioRecord | null>;
  /** Capture a snapshot from an already-computed engine output entry. */
  snapshotScenario: (
    scenario: BuilderScenario,
    entry: BuilderScenarioResult,
    options?: SnapshotScenarioOptions,
  ) => Promise<ScenarioSnapshot | null>;
  /** Soft-delete a record. */
  archiveScenario: (recordId: string, reason?: string | null) => Promise<ScenarioRecord | null>;
  /** Restore a previously archived record. */
  restoreScenario: (recordId: string) => Promise<ScenarioRecord | null>;
  /** Merge persisted records into a builder state — used to hydrate the
   *  workspace from server state on first load. */
  hydrateState: (state: BuilderState) => BuilderState;
  /** Build the assumptions summary for a scenario (presentation only). */
  buildAssumptions: (scenario: BuilderScenario) => ScenarioSnapshotAssumption[];
}

const DEFAULT_NOW = () => new Date().toISOString();

function defaultRecordId(scenario: BuilderScenario): string {
  return `record-${scenario.id}`;
}

async function safeFetchJSON(method: string, path: string, body?: unknown): Promise<any | null> {
  try {
    const res = await apiRequest(method, path, body);
    return await res.json();
  } catch (err) {
    console.warn(`[useScenarioPersistence] ${method} ${path} failed`, err);
    return null;
  }
}

/**
 * useScenarioPersistence — main hook used by ScenarioBuilderWorkspace.
 */
export function useScenarioPersistence(
  options: UseScenarioPersistenceOptions = {},
): UseScenarioPersistenceResult {
  const now = options.now ?? DEFAULT_NOW;
  const recordIdGenerator = options.recordIdGenerator ?? defaultRecordId;

  const [records, setRecords] = useState<ScenarioRecord[]>([]);
  const [status, setStatus] = useState<PersistenceStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasRemote, setHasRemote] = useState<boolean>(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (!isMounted.current) return;
    setStatus("loading");
    setErrorMessage(null);
    const data = await safeFetchJSON("GET", "/api/scenario-records");
    if (!isMounted.current) return;
    if (Array.isArray(data)) {
      setRecords(data as ScenarioRecord[]);
      setHasRemote(true);
      setStatus(data.length === 0 ? "idle" : "saved");
    } else if (data === null) {
      setHasRemote(false);
      setStatus("fallback");
    } else {
      setHasRemote(false);
      setStatus("fallback");
    }
  }, []);

  useEffect(() => {
    if (options.skipAutoLoad) return;
    void refresh();
  }, [refresh, options.skipAutoLoad]);

  const persistRecord = useCallback(async (record: ScenarioRecord): Promise<ScenarioRecord | null> => {
    setStatus("saving");
    setErrorMessage(null);
    const saved = await safeFetchJSON("POST", "/api/scenario-records", record);
    if (!isMounted.current) return saved ?? record;
    if (saved && typeof saved === "object" && (saved as any).recordId) {
      const sav = saved as ScenarioRecord;
      setRecords(prev => {
        const idx = prev.findIndex(r => r.recordId === sav.recordId);
        if (idx >= 0) {
          const next = prev.slice();
          next[idx] = sav;
          return next;
        }
        return [...prev, sav];
      });
      setHasRemote(true);
      setStatus("saved");
      return sav;
    }
    setRecords(prev => {
      const idx = prev.findIndex(r => r.recordId === record.recordId);
      if (idx >= 0) {
        const next = prev.slice();
        next[idx] = record;
        return next;
      }
      return [...prev, record];
    });
    setHasRemote(false);
    setStatus("fallback");
    return record;
  }, []);

  const saveScenario = useCallback(async (
    scenario: BuilderScenario,
    saveOpts: SaveScenarioOptions = {},
  ): Promise<ScenarioRecord | null> => {
    const ts = now();
    const recordId = recordIdGenerator(scenario);
    const payload = toScenarioPayload(scenario, {
      ...(saveOpts.tags !== undefined ? { tags: saveOpts.tags } : {}),
      ...(saveOpts.notes !== undefined ? { notes: saveOpts.notes } : {}),
    });
    const existing = records.find(r => r.recordId === recordId);
    let next: ScenarioRecord;
    if (!existing) {
      next = createScenarioRecord({
        scenario,
        ...(saveOpts.tags !== undefined ? { tags: saveOpts.tags } : {}),
        ...(saveOpts.notes !== undefined ? { notes: saveOpts.notes } : {}),
        isBaseline: !!saveOpts.isBaseline,
        now: ts,
        recordId,
        comment: saveOpts.comment ?? "Initial save",
        ...(options.versionIdGenerator !== undefined ? { versionIdGenerator: options.versionIdGenerator } : {}),
      });
    } else {
      const last = getLatestVersionPayload(existing);
      if (last && payloadsEqual(last, payload)) {
        // No change — update tags/notes/isBaseline only.
        next = {
          ...existing,
          tags: payload.tags,
          notes: payload.notes,
          isBaseline: !!saveOpts.isBaseline,
          updatedAt: ts,
        };
      } else {
        next = commitVersion({
          record: existing,
          payload,
          now: ts,
          comment: saveOpts.comment ?? null,
          ...(options.versionIdGenerator !== undefined ? { versionIdGenerator: options.versionIdGenerator } : {}),
        });
        next = { ...next, isBaseline: !!saveOpts.isBaseline };
      }
    }
    return persistRecord(next);
  }, [now, recordIdGenerator, records, persistRecord, options.versionIdGenerator]);

  const snapshotScenario = useCallback(async (
    scenario: BuilderScenario,
    entry: BuilderScenarioResult,
    snapOpts: SnapshotScenarioOptions = {},
  ): Promise<ScenarioSnapshot | null> => {
    const ts = now();
    const recordId = recordIdGenerator(scenario);
    let record = records.find(r => r.recordId === recordId);
    if (!record) {
      record = createScenarioRecord({
        scenario,
        isBaseline: false,
        now: ts,
        recordId,
        comment: "Auto-created before snapshot",
        ...(options.versionIdGenerator !== undefined ? { versionIdGenerator: options.versionIdGenerator } : {}),
      });
    }
    const snapshot = captureSnapshot({
      record,
      builderResult: entry,
      assumptions: snapOpts.assumptions ?? buildAssumptionsSummary({ scenario }),
      ...(snapOpts.label !== undefined ? { label: snapOpts.label } : {}),
      comment: snapOpts.comment ?? null,
      now: ts,
      ...(options.snapshotIdGenerator !== undefined ? { snapshotIdGenerator: options.snapshotIdGenerator } : {}),
    });
    const next = appendSnapshot(record, snapshot, ts);
    const saved = await persistRecord(next);
    return saved?.snapshots[saved.snapshots.length - 1] ?? snapshot;
  }, [now, recordIdGenerator, records, persistRecord, options.snapshotIdGenerator, options.versionIdGenerator]);

  const archiveScenario = useCallback(async (recordId: string, reason: string | null = null): Promise<ScenarioRecord | null> => {
    const existing = records.find(r => r.recordId === recordId);
    if (!existing) return null;
    setStatus("saving");
    const ts = now();
    const archived = archiveRecord(existing, ts, reason);
    const saved = await safeFetchJSON("POST", `/api/scenario-records/${encodeURIComponent(recordId)}/archive`, { reason });
    if (!isMounted.current) return saved ?? archived;
    const finalRec = (saved && (saved as any).recordId) ? (saved as ScenarioRecord) : archived;
    setRecords(prev => prev.filter(r => r.recordId !== recordId));
    setStatus(saved ? "saved" : "fallback");
    return finalRec;
  }, [records, now]);

  const restoreScenario = useCallback(async (recordId: string): Promise<ScenarioRecord | null> => {
    setStatus("saving");
    const saved = await safeFetchJSON("POST", `/api/scenario-records/${encodeURIComponent(recordId)}/restore`, {});
    if (!isMounted.current) return saved;
    if (saved && (saved as any).recordId) {
      const sav = saved as ScenarioRecord;
      setRecords(prev => {
        const idx = prev.findIndex(r => r.recordId === sav.recordId);
        if (idx >= 0) {
          const next = prev.slice();
          next[idx] = sav;
          return next;
        }
        return [...prev, sav];
      });
      setStatus("saved");
      return sav;
    }
    setStatus("fallback");
    return null;
  }, []);

  const bundle: ScenarioRecordsBundle = useMemo(() => ({
    records,
    fallback: !hasRemote,
    errorReason: errorMessage,
  }), [records, hasRemote, errorMessage]);

  const hydrateState = useCallback((state: BuilderState) => mergeRecordsIntoState(state, bundle), [bundle]);

  const buildAssumptions = useCallback(
    (scenario: BuilderScenario) => buildAssumptionsSummary({ scenario }),
    [],
  );

  return {
    status,
    errorMessage,
    records,
    bundle,
    hasRemote,
    fallback: !hasRemote,
    refresh,
    saveScenario,
    snapshotScenario,
    archiveScenario,
    restoreScenario,
    hydrateState,
    buildAssumptions,
  };
}

/** Helper used by the workspace to deserialize a record into a BuilderScenario.
 *  Re-exported so consumers don't need to import scenarioPersistence directly. */
export function loadScenarioFromRecord(record: ScenarioRecord): BuilderScenario | null {
  const latest = getLatestVersionPayload(record);
  if (!latest) return null;
  return fromScenarioPayload(latest);
}

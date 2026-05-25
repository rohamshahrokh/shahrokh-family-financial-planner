/**
 * scenarioPersistence.ts — Sprint 6 Phase 3.
 *
 * Pure orchestration layer for persisting Scenario Builder state to Supabase
 * (or any backing store that speaks `/api/scenario-records`). Every numeric
 * value referenced here continues to come from the canonical engines via
 * `scenarioBuilderWorkspace.ts`; this file contains zero financial formulas.
 *
 * Responsibilities
 * ----------------
 *   1. Serialize / deserialize a BuilderScenario into a transport-safe record.
 *   2. Validate scenario records (tags whitelist, notes length, version int).
 *   3. Wrap a versioned record (`ScenarioRecord` + `ScenarioRecordVersion[]`).
 *   4. Build snapshots from an already-computed engine output bundle — never
 *      recompute finance.
 *   5. Merge persisted scenarios back into a `BuilderState` so the workspace
 *      auto-loads them.
 *
 * Strict separation
 * -----------------
 *   - No fetch calls. The HTTP / Supabase boundary lives in the hook.
 *   - No use of `Date.now()` for deterministic logic — timestamps are passed
 *     in by the caller so tests stay byte-equal.
 *   - No household values or hardcoded numbers.
 *   - All snapshot summary metrics are copied from existing
 *     `BuilderCompareResult` objects.
 */

import type {
  BuilderScenario,
  BuilderState,
  ScenarioInputs,
  BuilderCompareResult,
  BuilderScenarioResult,
  ScenarioMetricKey,
} from "./scenarioBuilderWorkspace";
import {
  EMPTY_INPUTS,
  hasEngineLimitedEdits,
  listMetricKeys,
  makeInitialBuilderState,
  makeSeedScenarios,
} from "./scenarioBuilderWorkspace";
import type { ScenarioMetric } from "./scenarioCompareWorkspace";

/* ─── Tags ─────────────────────────────────────────────────────────────── */

export const SCENARIO_TAGS = [
  "Property",
  "ETF",
  "Crypto",
  "FIRE",
  "Debt",
  "Hybrid",
] as const;

export type ScenarioTag = (typeof SCENARIO_TAGS)[number];

/* ─── Persistence record types ────────────────────────────────────────── */

export const NOTES_MAX_LENGTH = 2000;
export const SCENARIO_RECORD_SCHEMA_VERSION = 1;

/**
 * Frozen scenario configuration as stored in the persistence layer. This is
 * the JSON-serializable view of a `BuilderScenario` plus metadata.
 */
export interface ScenarioRecordPayload {
  /** Stable id — the workspace `BuilderScenario.id`. */
  scenarioId: string;
  /** Display label. */
  label: string;
  /** Description (free text). */
  description: string;
  /** Phase 1 catalogue id for seeds; null for user-created scenarios. */
  seedScenarioId: string | null;
  /** Whether this scenario was a seed at creation time. */
  isSeed: boolean;
  /** Sprint 5 candidate kind mapping (null = baseline / hold-current). */
  candidateKind: string | null;
  /** Editable scenario inputs (validated by app code). */
  inputs: ScenarioInputs;
  /** User-selected tags (whitelist enforced). */
  tags: ScenarioTag[];
  /** User notes (validated by app code, length <= NOTES_MAX_LENGTH). */
  notes: string;
  /** Schema version — increments only when the on-the-wire shape changes. */
  schemaVersion: number;
}

/**
 * A single persisted version of a scenario. Records always carry at least one
 * version (v1 created at save time); each Save creates v2, v3, … with the
 * latest payload. Versions are immutable.
 */
export interface ScenarioRecordVersion {
  versionId: string;
  scenarioRecordId: string;
  versionNumber: number;
  payload: ScenarioRecordPayload;
  createdAt: string;
  /** Optional comment captured when the version was committed. */
  comment: string | null;
}

/**
 * A persisted scenario — the top-level row plus its history. The "current
 * version number" reflects the latest version pushed. Soft-delete is handled
 * via `archivedAt` / `archivedReason`.
 */
export interface ScenarioRecord {
  recordId: string;
  scenarioId: string;
  label: string;
  description: string;
  seedScenarioId: string | null;
  isSeed: boolean;
  isBaseline: boolean;
  tags: ScenarioTag[];
  notes: string;
  currentVersion: number;
  versions: ScenarioRecordVersion[];
  snapshots: ScenarioSnapshot[];
  archivedAt: string | null;
  archivedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ─── Snapshots ───────────────────────────────────────────────────────── */

/**
 * Engine output summary captured by a snapshot. These come from the existing
 * Builder compare result; no recalculation happens here.
 */
export interface ScenarioSnapshotMetric {
  key: ScenarioMetricKey;
  label: string;
  /** Numeric value, copied straight from the engine output. */
  value: number | null;
  /** Optional text override (used by `recommendedAction`). */
  textOverride: string | null;
  format: ScenarioMetric["format"];
  source: string;
  incomplete: boolean;
}

export interface ScenarioSnapshotAssumption {
  key: string;
  label: string;
  /** Value as it was when the snapshot was taken (number | string | null). */
  value: number | string | null;
}

export interface ScenarioSnapshot {
  snapshotId: string;
  scenarioRecordId: string;
  /** Builder version that produced this snapshot, if known. */
  versionNumber: number | null;
  label: string;
  comment: string | null;
  createdAt: string;
  /** Frozen scenario payload. */
  payload: ScenarioRecordPayload;
  /** Engine output summary. Each entry copied from a ScenarioMetric. */
  metrics: ScenarioSnapshotMetric[];
  /** Captured assumptions (property growth, ETF return, etc.) — exact set
   *  depends on what the caller passes in. */
  assumptions: ScenarioSnapshotAssumption[];
  /** True when the scenario had inputs the engines do not recompute. */
  engineLimited: boolean;
}

/* ─── Validation ──────────────────────────────────────────────────────── */

export interface ScenarioValidationResult {
  ok: boolean;
  errors: string[];
}

export function isScenarioTag(value: unknown): value is ScenarioTag {
  return typeof value === "string" && (SCENARIO_TAGS as readonly string[]).includes(value);
}

/** Coerce arbitrary input into a clean, deduped tag list. Unknown values are dropped. */
export function normalizeTags(raw: unknown): ScenarioTag[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<ScenarioTag>();
  const out: ScenarioTag[] = [];
  for (const v of raw) {
    if (isScenarioTag(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Coerce notes into a trimmed string capped at NOTES_MAX_LENGTH. */
export function normalizeNotes(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.replace(/\s+$/, "");
  if (trimmed.length <= NOTES_MAX_LENGTH) return trimmed;
  return trimmed.slice(0, NOTES_MAX_LENGTH);
}

/** Validate a scenario payload. Returns the list of human-readable errors. */
export function validateScenarioPayload(payload: ScenarioRecordPayload): ScenarioValidationResult {
  const errors: string[] = [];
  if (!payload.scenarioId || typeof payload.scenarioId !== "string") {
    errors.push("scenarioId is required");
  }
  if (!payload.label || typeof payload.label !== "string" || payload.label.trim() === "") {
    errors.push("label is required");
  }
  if (typeof payload.description !== "string") {
    errors.push("description must be a string");
  }
  if (payload.schemaVersion !== SCENARIO_RECORD_SCHEMA_VERSION) {
    errors.push(`schemaVersion must equal ${SCENARIO_RECORD_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(payload.tags) || payload.tags.some(t => !isScenarioTag(t))) {
    errors.push("tags must only contain known scenario tags");
  }
  if (typeof payload.notes !== "string" || payload.notes.length > NOTES_MAX_LENGTH) {
    errors.push(`notes must be a string under ${NOTES_MAX_LENGTH} chars`);
  }
  if (!payload.inputs || typeof payload.inputs !== "object") {
    errors.push("inputs object is required");
  }
  return { ok: errors.length === 0, errors };
}

/* ─── Serialization ───────────────────────────────────────────────────── */

/** Build a fresh persistence payload from a BuilderScenario + tags/notes. */
export function toScenarioPayload(
  scenario: BuilderScenario,
  options: { tags?: ScenarioTag[]; notes?: string } = {},
): ScenarioRecordPayload {
  return {
    scenarioId: scenario.id,
    label: scenario.label,
    description: scenario.description,
    seedScenarioId: scenario.seedScenarioId,
    isSeed: scenario.isSeed,
    candidateKind: scenario.candidateKind,
    inputs: {
      property: { ...(scenario.inputs.property ?? {}) },
      investments: { ...(scenario.inputs.investments ?? {}) },
      cashflow: { ...(scenario.inputs.cashflow ?? {}) },
      goals: { ...(scenario.inputs.goals ?? {}) },
    },
    tags: normalizeTags(options.tags ?? []),
    notes: normalizeNotes(options.notes ?? ""),
    schemaVersion: SCENARIO_RECORD_SCHEMA_VERSION,
  };
}

/** Restore a BuilderScenario from a persisted payload. */
export function fromScenarioPayload(payload: ScenarioRecordPayload): BuilderScenario {
  return {
    id: payload.scenarioId,
    label: payload.label,
    description: payload.description,
    candidateKind: (payload.candidateKind ?? null) as BuilderScenario["candidateKind"],
    inputs: payload.inputs ?? { ...EMPTY_INPUTS },
    isSeed: !!payload.isSeed,
    seedScenarioId: (payload.seedScenarioId ?? null) as BuilderScenario["seedScenarioId"],
  };
}

/** Two payloads are equal iff their JSON serializations match exactly. */
export function payloadsEqual(a: ScenarioRecordPayload, b: ScenarioRecordPayload): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/* ─── Version bookkeeping (pure reducers) ─────────────────────────────── */

export interface CommitVersionInput {
  record: ScenarioRecord;
  payload: ScenarioRecordPayload;
  now: string;
  versionIdGenerator?: (record: ScenarioRecord, nextVersionNumber: number) => string;
  comment?: string | null;
}

/**
 * Append a new version to a record when the payload differs from the
 * current version, otherwise return the record unchanged.
 *
 * Version numbers are strictly monotonic integers starting at 1. The first
 * call against a freshly created record (no versions yet) produces v1.
 */
export function commitVersion(input: CommitVersionInput): ScenarioRecord {
  const { record, payload, now, comment } = input;
  const validate = validateScenarioPayload(payload);
  if (!validate.ok) {
    throw new Error(`Invalid payload: ${validate.errors.join("; ")}`);
  }
  const last = record.versions[record.versions.length - 1];
  if (last && payloadsEqual(last.payload, payload)) {
    // No-op — payload hasn't changed.
    return record;
  }
  const nextVersionNumber = (record.currentVersion ?? 0) + 1;
  const versionIdGenerator = input.versionIdGenerator ?? defaultVersionIdGenerator;
  const newVersion: ScenarioRecordVersion = {
    versionId: versionIdGenerator(record, nextVersionNumber),
    scenarioRecordId: record.recordId,
    versionNumber: nextVersionNumber,
    payload,
    createdAt: now,
    comment: comment ?? null,
  };
  return {
    ...record,
    label: payload.label,
    description: payload.description,
    tags: payload.tags,
    notes: payload.notes,
    seedScenarioId: payload.seedScenarioId,
    isSeed: payload.isSeed,
    currentVersion: nextVersionNumber,
    versions: [...record.versions, newVersion],
    updatedAt: now,
  };
}

function defaultVersionIdGenerator(record: ScenarioRecord, n: number): string {
  return `${record.recordId}-v${n}`;
}

/* ─── Record creation ─────────────────────────────────────────────────── */

export interface CreateRecordInput {
  scenario: BuilderScenario;
  tags?: ScenarioTag[];
  notes?: string;
  isBaseline?: boolean;
  now: string;
  recordId?: string;
  comment?: string | null;
  versionIdGenerator?: (record: ScenarioRecord, nextVersionNumber: number) => string;
}

/** Build an empty record + v1 from a BuilderScenario. */
export function createScenarioRecord(input: CreateRecordInput): ScenarioRecord {
  const payload = toScenarioPayload(input.scenario, {
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  });
  const recordId = input.recordId ?? `record-${input.scenario.id}`;
  const seed: ScenarioRecord = {
    recordId,
    scenarioId: payload.scenarioId,
    label: payload.label,
    description: payload.description,
    seedScenarioId: payload.seedScenarioId,
    isSeed: payload.isSeed,
    isBaseline: !!input.isBaseline,
    tags: payload.tags,
    notes: payload.notes,
    currentVersion: 0,
    versions: [],
    snapshots: [],
    archivedAt: null,
    archivedReason: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
  const committed = commitVersion({
    record: seed,
    payload,
    now: input.now,
    ...(input.versionIdGenerator !== undefined ? { versionIdGenerator: input.versionIdGenerator } : {}),
    comment: input.comment ?? "Initial save",
  });
  return committed;
}

/* ─── Soft delete ─────────────────────────────────────────────────────── */

export function archiveScenarioRecord(record: ScenarioRecord, now: string, reason: string | null = null): ScenarioRecord {
  if (record.archivedAt) return record;
  return {
    ...record,
    archivedAt: now,
    archivedReason: reason,
    updatedAt: now,
  };
}

export function restoreScenarioRecord(record: ScenarioRecord, now: string): ScenarioRecord {
  if (!record.archivedAt) return record;
  return {
    ...record,
    archivedAt: null,
    archivedReason: null,
    updatedAt: now,
  };
}

/* ─── Snapshots from existing engine output ───────────────────────────── */

export interface CaptureSnapshotInput {
  record: ScenarioRecord;
  builderResult: BuilderResultEntryLike;
  assumptions?: ScenarioSnapshotAssumption[];
  label?: string;
  comment?: string | null;
  now: string;
  snapshotIdGenerator?: (record: ScenarioRecord, version: number, label: string) => string;
}

/** Minimal shape of a `BuilderScenarioResult` row — accepts the real type and
 *  test doubles. We deliberately do NOT widen to `any`. */
export interface BuilderResultEntryLike {
  row: {
    metrics: BuilderScenarioResult["row"]["metrics"];
  };
  engineLimited: boolean;
}

/**
 * Build a snapshot from an already-computed engine output entry. The metrics
 * are copied verbatim — `value`, `textOverride`, `format`, `source`, and
 * `incomplete` all come from the engine.
 */
export function captureSnapshot(input: CaptureSnapshotInput): ScenarioSnapshot {
  const metrics: ScenarioSnapshotMetric[] = listMetricKeys().map(key => {
    const m = input.builderResult.row.metrics[key];
    return {
      key,
      label: m.label,
      value: typeof m.value === "number" && Number.isFinite(m.value) ? m.value : null,
      textOverride: m.textOverride ?? null,
      format: m.format,
      source: m.source,
      incomplete: !!m.incomplete,
    };
  });
  const latestPayload = input.record.versions[input.record.versions.length - 1]?.payload;
  const payload: ScenarioRecordPayload = latestPayload ?? {
    scenarioId: input.record.scenarioId,
    label: input.record.label,
    description: input.record.description,
    seedScenarioId: input.record.seedScenarioId,
    isSeed: input.record.isSeed,
    candidateKind: null,
    inputs: { property: {}, investments: {}, cashflow: {}, goals: {} },
    tags: input.record.tags,
    notes: input.record.notes,
    schemaVersion: SCENARIO_RECORD_SCHEMA_VERSION,
  };
  const versionNumber = input.record.currentVersion || null;
  const label = input.label ?? `Snapshot v${versionNumber ?? "—"}`;
  const generator = input.snapshotIdGenerator ?? defaultSnapshotIdGenerator;
  return {
    snapshotId: generator(input.record, versionNumber ?? 0, label),
    scenarioRecordId: input.record.recordId,
    versionNumber,
    label,
    comment: input.comment ?? null,
    createdAt: input.now,
    payload,
    metrics,
    assumptions: (input.assumptions ?? []).map(a => ({ ...a })),
    engineLimited: !!input.builderResult.engineLimited,
  };
}

function defaultSnapshotIdGenerator(record: ScenarioRecord, version: number, label: string): string {
  const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${record.recordId}-snap-v${version}-${safe || "snap"}`;
}

/** Append a snapshot to a record (returns a new record). */
export function appendSnapshot(record: ScenarioRecord, snapshot: ScenarioSnapshot, now: string): ScenarioRecord {
  return {
    ...record,
    snapshots: [...record.snapshots, snapshot],
    updatedAt: now,
  };
}

/* ─── Assumptions summary helpers ─────────────────────────────────────── */

export interface BuildAssumptionsInput {
  scenario: BuilderScenario;
  /** Optional risk profile / regime info, kept out-of-band so this function
   *  remains pure. Callers can pass anything that maps to a label/value pair. */
  extra?: ScenarioSnapshotAssumption[];
}

/**
 * Build a human-readable assumptions summary from a scenario's input bundle.
 * Each row is just a label + value pair — no computation.
 */
export function buildAssumptionsSummary(input: BuildAssumptionsInput): ScenarioSnapshotAssumption[] {
  const out: ScenarioSnapshotAssumption[] = [];
  const p = input.scenario.inputs.property ?? {};
  const i = input.scenario.inputs.investments ?? {};
  const c = input.scenario.inputs.cashflow ?? {};
  const g = input.scenario.inputs.goals ?? {};

  function push(key: string, label: string, value: number | string | null | undefined) {
    if (value === undefined || value === null) return;
    out.push({ key, label, value: value as number | string | null });
  }

  push("property.purchaseYear",   "Property purchase year",  p.purchaseYear);
  push("property.purchasePrice",  "Property purchase price", p.purchasePrice);
  push("property.deposit",        "Property deposit",        p.deposit);
  push("property.interestRate",   "Mortgage interest rate",  p.interestRate);
  push("property.growthRate",     "Property growth rate",    p.growthRate);
  push("property.rentalYield",    "Rental yield",            p.rentalYield);
  push("property.loanType",       "Loan type",               p.loanType);

  push("investments.etfContribution",    "ETF /mo",    i.etfContribution);
  push("investments.stockContribution",  "Stock /mo",  i.stockContribution);
  push("investments.cryptoContribution", "Crypto /mo", i.cryptoContribution);

  push("cashflow.surplusAllocation",       "Surplus → invest", c.surplusAllocation);
  push("cashflow.offsetAllocation",        "Surplus → offset", c.offsetAllocation);
  push("cashflow.debtRepaymentAllocation", "Surplus → debt",   c.debtRepaymentAllocation);

  push("goals.fireTarget",          "FIRE target",          g.fireTarget);
  push("goals.passiveIncomeTarget", "Passive income /yr",   g.passiveIncomeTarget);
  push("goals.targetYear",          "Target year",          g.targetYear);

  if (input.extra) {
    for (const ex of input.extra) out.push({ ...ex });
  }
  return out;
}

/* ─── Builder state ↔ persistence bridge ──────────────────────────────── */

export interface ScenarioRecordsBundle {
  records: ScenarioRecord[];
  /** True when the workspace is operating without a backing store. */
  fallback: boolean;
  /** Last error message from the persistence layer, if any. */
  errorReason: string | null;
}

export const EMPTY_RECORDS_BUNDLE: ScenarioRecordsBundle = {
  records: [],
  fallback: true,
  errorReason: null,
};

export interface MergeRecordsIntoStateOptions {
  /** When true (default), the seed scenarios are kept even if not in records. */
  preserveSeeds?: boolean;
}

/**
 * Merge persisted scenarios into the builder state. The function never
 * fabricates ids — every record must carry an existing scenario.id.
 *
 *   - Records replace existing scenarios when ids match.
 *   - Records with a new id are appended.
 *   - Seeds not represented in records are preserved when `preserveSeeds`.
 *   - Archived (soft-deleted) records are excluded.
 *   - If any record carries `isBaseline=true`, it becomes the new baseline.
 *     Otherwise the previous baseline (if still present) is retained, falling
 *     back to seed-baseline.
 */
export function mergeRecordsIntoState(
  state: BuilderState,
  bundle: ScenarioRecordsBundle,
  options: MergeRecordsIntoStateOptions = {},
): BuilderState {
  const preserveSeeds = options.preserveSeeds ?? true;
  const active = bundle.records.filter(r => !r.archivedAt);
  if (active.length === 0) {
    return state;
  }

  const byScenarioId = new Map<string, ScenarioRecord>();
  for (const r of active) {
    byScenarioId.set(r.scenarioId, r);
  }

  const merged: BuilderScenario[] = [];
  const seenIds = new Set<string>();

  // Walk existing state — replace where a record exists, otherwise keep.
  for (const s of state.scenarios) {
    const record = byScenarioId.get(s.id);
    if (record) {
      const latest = record.versions[record.versions.length - 1]?.payload;
      if (latest) {
        merged.push(fromScenarioPayload(latest));
      } else {
        merged.push(s);
      }
      seenIds.add(s.id);
    } else if (s.isSeed && preserveSeeds) {
      merged.push(s);
      seenIds.add(s.id);
    }
  }

  // Append records that didn't match any existing scenario.
  for (const r of active) {
    if (seenIds.has(r.scenarioId)) continue;
    const latest = r.versions[r.versions.length - 1]?.payload;
    if (!latest) continue;
    merged.push(fromScenarioPayload(latest));
    seenIds.add(r.scenarioId);
  }

  // Baseline resolution.
  const baselineRecord = active.find(r => r.isBaseline);
  let baselineId = state.baselineScenarioId;
  if (baselineRecord) {
    baselineId = baselineRecord.scenarioId;
  } else if (!merged.some(s => s.id === baselineId)) {
    const seedBaseline = merged.find(s => s.seedScenarioId === "baseline") ?? merged[0];
    baselineId = seedBaseline?.id ?? state.baselineScenarioId;
  }

  return {
    ...state,
    scenarios: merged,
    baselineScenarioId: baselineId,
  };
}

/** Build a hydrated initial state from records, or fall back to seeds. */
export function makeStateFromRecords(bundle: ScenarioRecordsBundle): BuilderState {
  const seeded = makeInitialBuilderState();
  if (!bundle.records.length) return seeded;
  return mergeRecordsIntoState(seeded, bundle, { preserveSeeds: true });
}

/* ─── Helpers exposed for tests / UI ──────────────────────────────────── */

export function isEngineLimitedScenario(scenario: BuilderScenario): boolean {
  return hasEngineLimitedEdits(scenario);
}

export function makeEmptySeedRecords(now: string): ScenarioRecord[] {
  return makeSeedScenarios().map(seed =>
    createScenarioRecord({
      scenario: seed,
      isBaseline: seed.seedScenarioId === "baseline",
      now,
      tags: [],
      notes: "",
      comment: "Seed",
    }),
  );
}

/** Pure list helper — sort records for the UI: baselines first, then label. */
export function sortRecordsForDisplay(records: ScenarioRecord[]): ScenarioRecord[] {
  return [...records].sort((a, b) => {
    if (a.isBaseline !== b.isBaseline) return a.isBaseline ? -1 : 1;
    if (a.isSeed !== b.isSeed) return a.isSeed ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

/** Latest version payload accessor — returns null when no versions exist. */
export function getLatestVersionPayload(record: ScenarioRecord): ScenarioRecordPayload | null {
  return record.versions[record.versions.length - 1]?.payload ?? null;
}

/** Latest snapshot accessor. */
export function getLatestSnapshot(record: ScenarioRecord): ScenarioSnapshot | null {
  return record.snapshots[record.snapshots.length - 1] ?? null;
}

/** Tag union with any extra unknown tags filtered out — handy in inputs. */
export function applyTagPatch(current: ScenarioTag[], next: unknown): ScenarioTag[] {
  return normalizeTags(next ?? current);
}

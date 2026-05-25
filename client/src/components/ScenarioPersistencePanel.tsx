/**
 * ScenarioPersistencePanel.tsx — Sprint 6 Phase 3.
 *
 * Persistence UI for the Scenario Builder workspace. Surfaces save/load
 * status, tag selector, notes field, assumptions summary, version history,
 * and the snapshot creation action. The panel is intentionally compact and
 * lives inside `ScenarioBuilderWorkspace`.
 *
 * Strict separation
 * -----------------
 *   - This component never recomputes finance. Every metric it shows comes
 *     from a snapshot that was captured by the engines.
 *   - It only consumes the persistence hook + the existing BuilderCompareResult.
 *   - All controls carry stable data-testids.
 */

import * as React from "react";
import { useMemo, useState } from "react";
import type {
  BuilderScenario,
  BuilderCompareResult,
} from "@/lib/scenarioBuilderWorkspace";
import {
  SCENARIO_TAGS,
  type ScenarioRecord,
  type ScenarioTag,
  type ScenarioSnapshot,
  type ScenarioSnapshotAssumption,
  NOTES_MAX_LENGTH,
} from "@/lib/scenarioPersistence";
import type { UseScenarioPersistenceResult, PersistenceStatus } from "@/hooks/useScenarioPersistence";

export interface ScenarioPersistencePanelProps {
  scenario: BuilderScenario;
  /** The engine result row for the scenario being edited (drives snapshot summary). */
  entry: BuilderCompareResult["scenarios"][number] | null;
  persistence: UseScenarioPersistenceResult;
  isBaseline: boolean;
  className?: string;
}

const STATUS_LABEL: Record<PersistenceStatus, string> = {
  idle: "Ready",
  loading: "Loading…",
  saving: "Saving…",
  saved: "Saved",
  fallback: "Local-only",
  error: "Error",
};

function statusClasses(status: PersistenceStatus): string {
  switch (status) {
    case "saved":    return "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400";
    case "saving":   return "bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400";
    case "loading":  return "bg-sky-500/10 border-sky-500/40 text-sky-600 dark:text-sky-400";
    case "fallback": return "bg-amber-500/10 border-amber-500/40 text-amber-600 dark:text-amber-400";
    case "error":    return "bg-rose-500/10 border-rose-500/40 text-rose-600 dark:text-rose-400";
    case "idle":
    default:         return "bg-muted/40 border-border text-muted-foreground";
  }
}

export function ScenarioPersistencePanel(props: ScenarioPersistencePanelProps) {
  const { scenario, entry, persistence, isBaseline } = props;
  const recordId = `record-${scenario.id}`;
  const record: ScenarioRecord | undefined = persistence.records.find(r => r.recordId === recordId);

  const initialTags: ScenarioTag[] = record?.tags ?? [];
  const initialNotes: string = record?.notes ?? "";

  const [tags, setTags] = useState<ScenarioTag[]>(initialTags);
  const [notes, setNotes] = useState<string>(initialNotes);
  const [comment, setComment] = useState<string>("");

  // Keep local controlled state in sync when the underlying record changes
  // (e.g. external refresh).
  React.useEffect(() => {
    setTags(record?.tags ?? []);
    setNotes(record?.notes ?? "");
  }, [record?.recordId, record?.currentVersion]);

  const assumptions: ScenarioSnapshotAssumption[] = useMemo(
    () => persistence.buildAssumptions(scenario),
    [persistence, scenario],
  );

  const toggleTag = (tag: ScenarioTag) => {
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const onSave = async () => {
    await persistence.saveScenario(scenario, {
      tags,
      notes,
      isBaseline,
      comment: comment.trim() || null,
    });
    setComment("");
  };

  const onSnapshot = async () => {
    if (!entry) return;
    await persistence.snapshotScenario(scenario, entry, {
      label: comment.trim() || `Snapshot ${(record?.snapshots.length ?? 0) + 1}`,
      comment: comment.trim() || null,
      assumptions,
    });
    setComment("");
  };

  const versions = record?.versions ?? [];
  const snapshots = record?.snapshots ?? [];
  const latestSnapshot: ScenarioSnapshot | null = snapshots[snapshots.length - 1] ?? null;

  const tid = `scenario-persistence-${scenario.id}`;
  return (
    <div
      className={`rounded-lg border border-border bg-card p-3 flex flex-col gap-3 ${props.className ?? ""}`}
      data-testid={tid}
      data-scenario-id={scenario.id}
      data-record-id={record?.recordId ?? ""}
      data-fallback={persistence.fallback ? "true" : "false"}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground" data-testid={`${tid}-title`}>
          Persistence
        </h4>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded border ${statusClasses(persistence.status)}`}
          data-testid={`${tid}-status`}
          data-status={persistence.status}
        >
          {STATUS_LABEL[persistence.status] ?? persistence.status}
        </span>
      </div>

      {persistence.fallback ? (
        <div
          className="text-[10px] text-amber-600 dark:text-amber-400"
          data-testid={`${tid}-fallback-notice`}
        >
          Supabase unavailable — using local fallback. Changes persist to the
          browser cache and re-sync on next successful save.
        </div>
      ) : null}

      {/* Tags */}
      <div className="flex flex-col gap-1" data-testid={`${tid}-tags`}>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Tags</span>
        <div className="flex flex-wrap gap-1.5">
          {SCENARIO_TAGS.map(tag => {
            const active = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                aria-pressed={active}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${active
                  ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted/40 border-border text-muted-foreground hover:bg-muted"}`}
                data-testid={`${tid}-tag-${tag}`}
                data-active={active ? "true" : "false"}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <label className="flex flex-col gap-1" data-testid={`${tid}-notes-field`}>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</span>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value.slice(0, NOTES_MAX_LENGTH))}
          rows={3}
          maxLength={NOTES_MAX_LENGTH}
          placeholder="Why is this scenario useful? Add context for future-you."
          className="bg-background border border-border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
          data-testid={`${tid}-notes`}
        />
        <span className="text-[10px] text-muted-foreground self-end" data-testid={`${tid}-notes-count`}>
          {notes.length}/{NOTES_MAX_LENGTH}
        </span>
      </label>

      {/* Save / Snapshot */}
      <div className="flex flex-col gap-2" data-testid={`${tid}-actions`}>
        <input
          type="text"
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Optional version comment (e.g. 'After mortgage refinance')"
          className="bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
          data-testid={`${tid}-comment`}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={persistence.status === "saving"}
            className="text-xs px-3 py-1.5 rounded border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50"
            data-testid={`${tid}-save`}
          >
            Save scenario
          </button>
          <button
            type="button"
            onClick={onSnapshot}
            disabled={!entry || persistence.status === "saving"}
            className="text-xs px-3 py-1.5 rounded border border-sky-500/40 text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 disabled:opacity-50"
            data-testid={`${tid}-snapshot`}
            title={entry ? "Capture engine output as a snapshot" : "Snapshot disabled — no engine output available"}
          >
            Snapshot now
          </button>
        </div>
      </div>

      {/* Assumptions summary */}
      <details className="text-xs" data-testid={`${tid}-assumptions`}>
        <summary className="cursor-pointer text-muted-foreground">
          Assumptions ({assumptions.length})
        </summary>
        {assumptions.length === 0 ? (
          <div className="text-[11px] text-muted-foreground mt-1" data-testid={`${tid}-assumptions-empty`}>
            No overrides — scenario inherits ledger defaults.
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-1 mt-2">
            {assumptions.map(a => (
              <li key={a.key} className="flex items-center justify-between gap-2" data-testid={`${tid}-assumption-${a.key}`}>
                <span className="text-muted-foreground">{a.label}</span>
                <span className="tabular-nums text-foreground">{a.value as React.ReactNode}</span>
              </li>
            ))}
          </ul>
        )}
      </details>

      {/* Versions */}
      <details className="text-xs" open data-testid={`${tid}-versions`}>
        <summary className="cursor-pointer text-muted-foreground">
          Versions ({record?.currentVersion ?? 0})
        </summary>
        {versions.length === 0 ? (
          <div className="text-[11px] text-muted-foreground mt-1" data-testid={`${tid}-versions-empty`}>
            No versions yet — click "Save scenario" to commit v1.
          </div>
        ) : (
          <ul className="flex flex-col gap-1 mt-2">
            {versions.map(v => (
              <li
                key={v.versionId}
                className={`flex items-center justify-between gap-2 px-1.5 py-1 rounded ${
                  v.versionNumber === record?.currentVersion ? "bg-emerald-500/5 border border-emerald-500/30" : ""
                }`}
                data-testid={`${tid}-version-${v.versionNumber}`}
                data-current={v.versionNumber === record?.currentVersion ? "true" : "false"}
              >
                <span className="font-medium text-foreground">v{v.versionNumber}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">{v.createdAt.slice(0, 19).replace("T", " ")}</span>
                <span className="text-[10px] text-muted-foreground truncate flex-1 text-right" title={v.comment ?? undefined}>
                  {v.comment ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>

      {/* Snapshots */}
      <details className="text-xs" data-testid={`${tid}-snapshots`}>
        <summary className="cursor-pointer text-muted-foreground">
          Snapshots ({snapshots.length})
        </summary>
        {snapshots.length === 0 ? (
          <div className="text-[11px] text-muted-foreground mt-1" data-testid={`${tid}-snapshots-empty`}>
            No snapshots yet — click "Snapshot now" to freeze the current engine output.
          </div>
        ) : (
          <ul className="flex flex-col gap-2 mt-2">
            {snapshots.map(snap => (
              <li
                key={snap.snapshotId}
                className="rounded border border-border p-2 flex flex-col gap-1"
                data-testid={`${tid}-snapshot-${snap.snapshotId}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground" data-testid={`${tid}-snapshot-${snap.snapshotId}-label`}>{snap.label}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">v{snap.versionNumber ?? "—"} · {snap.createdAt.slice(0, 10)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {snap.metrics.map(m => (
                    <div key={m.key} className="flex items-center justify-between" data-testid={`${tid}-snapshot-${snap.snapshotId}-metric-${m.key}`}>
                      <span className="text-[10px] text-muted-foreground">{m.label}</span>
                      <span className="text-[10px] tabular-nums text-foreground">
                        {m.textOverride ?? (m.value == null ? "—" : m.value.toString())}
                      </span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </details>

      {latestSnapshot ? (
        <div className="text-[10px] text-muted-foreground" data-testid={`${tid}-latest-snapshot`}>
          Latest snapshot: <span className="text-foreground">{latestSnapshot.label}</span> ({latestSnapshot.createdAt.slice(0, 10)})
        </div>
      ) : null}
    </div>
  );
}

export default ScenarioPersistencePanel;

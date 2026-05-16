/**
 * Autonomous Financial OS — in-memory Strategic Memory + Ledger History.
 *
 * IMPORTANT — runtime constraints:
 *   • No localStorage / sessionStorage / indexedDB / cookies. These can be
 *     blocked in the deployed iframe environment and would crash the page.
 *   • No production DB writes (Phase 3 explicitly forbids schema changes).
 *
 * What this module is:
 *   A small module-level singleton holding the current session's strategic
 *   memory + ledger history. Nothing persists across reloads — the UI is
 *   explicit about that. Subscribers are notified on update so React
 *   components can re-render without external state libraries.
 *
 * What this module is NOT:
 *   • Not persisted to disk, cookies, or any storage API.
 *   • Not a substitute for a real longitudinal history feed — that would
 *     require server-side schema support which is out of scope for Phase 3.
 *
 * Future replacement:
 *   When schema-aware persistence arrives, swap the in-memory ref with a
 *   query against the new table — the shape of `StrategicMemoryInput` and
 *   `LedgerSnapshot[]` is stable.
 */

import { useEffect, useState } from "react";
import type {
  LedgerSnapshot,
  StrategicMemoryInput,
} from "./scenarioV2/autonomous/types";

type Listener = () => void;

interface AutonomousState {
  memory: StrategicMemoryInput | null;
  history: LedgerSnapshot[];
}

const state: AutonomousState = {
  memory: null,
  history: [],
};

const listeners: Listener[] = [];

function notify(): void {
  // Snapshot to avoid mutation-during-iteration if a listener unsubscribes.
  const snapshot = listeners.slice();
  for (let i = 0; i < snapshot.length; i++) snapshot[i]();
}

function subscribe(l: Listener): () => void {
  listeners.push(l);
  return () => {
    const idx = listeners.indexOf(l);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

// ─── Strategic memory ────────────────────────────────────────────────────────

export function readStrategicMemory(): StrategicMemoryInput | null {
  return state.memory;
}

export function writeStrategicMemory(memory: StrategicMemoryInput): void {
  state.memory = { ...memory };
  notify();
}

export function clearStrategicMemory(): void {
  state.memory = null;
  notify();
}

// ─── Ledger history ──────────────────────────────────────────────────────────

export function readLedgerHistory(): LedgerSnapshot[] {
  // Return a defensive shallow copy so consumers can't mutate the source.
  return state.history.slice();
}

export function writeLedgerHistory(history: LedgerSnapshot[]): void {
  const map = new Map<string, LedgerSnapshot>();
  for (const h of history) map.set(h.month, h);
  state.history = Array.from(map.values()).sort((a, b) =>
    a.month.localeCompare(b.month),
  );
  notify();
}

export function appendLedgerSnapshot(snapshot: LedgerSnapshot): LedgerSnapshot[] {
  const next = [
    ...state.history.filter((s) => s.month !== snapshot.month),
    snapshot,
  ];
  writeLedgerHistory(next);
  return readLedgerHistory();
}

export function clearLedgerHistory(): void {
  state.history = [];
  notify();
}

// ─── React hooks (no external state lib needed) ──────────────────────────────

export function useStrategicMemory(): StrategicMemoryInput | null {
  const [value, setValue] = useState<StrategicMemoryInput | null>(() => readStrategicMemory());
  useEffect(() => subscribe(() => setValue(readStrategicMemory())), []);
  return value;
}

export function useLedgerHistory(): LedgerSnapshot[] {
  const [value, setValue] = useState<LedgerSnapshot[]>(() => readLedgerHistory());
  useEffect(() => subscribe(() => setValue(readLedgerHistory())), []);
  return value;
}

/**
 * Test-only: reset the in-memory state. Exported deliberately for tests and
 * any "clear strategic memory" UI affordance. Not connected to any storage.
 */
export function __resetAutonomousMemoryForTests(): void {
  state.memory = null;
  state.history = [];
  notify();
}

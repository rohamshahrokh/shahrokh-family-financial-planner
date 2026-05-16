/**
 * Autonomous Financial OS — Strategic Memory + Ledger History store.
 *
 * Pure client-side persistence so the Autonomous Layer can be deterministic
 * across sessions WITHOUT touching the production database. When schema
 * support arrives, the same shape can move to Supabase without UI changes.
 *
 * Two namespaces:
 *   • fwl.autonomous.memory.v1   — StrategicMemoryInput
 *   • fwl.autonomous.history.v1  — LedgerSnapshot[]
 */

import type { LedgerSnapshot, StrategicMemoryInput } from "./scenarioV2/autonomous/types";

const MEMORY_KEY = "fwl.autonomous.memory.v1";
const HISTORY_KEY = "fwl.autonomous.history.v1";

function safeRead<T>(key: string): T | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeWrite<T>(key: string, value: T): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

export function readStrategicMemory(): StrategicMemoryInput | null {
  return safeRead<StrategicMemoryInput>(MEMORY_KEY);
}

export function writeStrategicMemory(memory: StrategicMemoryInput): void {
  safeWrite(MEMORY_KEY, memory);
}

export function clearStrategicMemory(): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.removeItem(MEMORY_KEY);
  } catch {
    /* noop */
  }
}

export function readLedgerHistory(): LedgerSnapshot[] {
  return safeRead<LedgerSnapshot[]>(HISTORY_KEY) ?? [];
}

export function writeLedgerHistory(history: LedgerSnapshot[]): void {
  // Sort chronologically and dedupe by month (latest wins).
  const map = new Map<string, LedgerSnapshot>();
  for (const h of history) map.set(h.month, h);
  const cleaned = Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  safeWrite(HISTORY_KEY, cleaned);
}

export function appendLedgerSnapshot(snapshot: LedgerSnapshot): LedgerSnapshot[] {
  const existing = readLedgerHistory();
  const next = [...existing.filter((s) => s.month !== snapshot.month), snapshot];
  writeLedgerHistory(next);
  return readLedgerHistory();
}

/**
 * AuditModeContext — global Audit Mode provider.
 *
 * Audit Mode is a user-facing product feature, not a dev flag: when ON, every
 * key metric across the platform becomes clickable; clicking opens the
 * CalculationTracePanel for that metric. This module owns:
 *
 *   • `auditMode`           — boolean toggle, persisted to a safe app-state
 *                              channel (sessionStorage, not localStorage,
 *                              since the existing app constraints prohibit
 *                              committing more product flags to localStorage).
 *   • `activeTraceId`       — when set, the trace panel is open.
 *   • `openTrace(id)` / `closeTrace()` — UI navigation helpers.
 *   • `toggleAuditMode()` / `setAuditMode(bool)` — header toggle wires here.
 *
 * No engine logic lives here — this is purely the UI-state layer for the
 * audit feature. Trace data is resolved at click-time from the registry.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const SESSION_KEY = 'fwl-audit-mode';

export interface AuditModeContextValue {
  /** True when Audit Mode is ON globally. */
  auditMode: boolean;
  /** Currently-open metric trace id (or null). */
  activeTraceId: string | null;
  /** Flip the global toggle. */
  toggleAuditMode: () => void;
  /** Set the toggle to a specific state — used by tests and shortcut keys. */
  setAuditMode: (next: boolean) => void;
  /** Open the trace panel for a given metric id. */
  openTrace: (id: string) => void;
  /** Close the trace panel. */
  closeTrace: () => void;
}

const AuditModeContext = createContext<AuditModeContextValue | null>(null);

/** Read the persisted toggle from sessionStorage (safe, browser-only). */
function readInitial(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function AuditModeProvider({ children }: { children: React.ReactNode }) {
  const [auditMode, setAuditModeState] = useState<boolean>(() => readInitial());
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);

  // Persist across navigation within the tab (but not across browser sessions).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(SESSION_KEY, auditMode ? '1' : '0');
    } catch {
      /* ignore (private mode etc.) */
    }
  }, [auditMode]);

  // When Audit Mode is toggled OFF, also close any open trace panel.
  useEffect(() => {
    if (!auditMode && activeTraceId !== null) setActiveTraceId(null);
  }, [auditMode, activeTraceId]);

  const setAuditMode = useCallback((next: boolean) => {
    setAuditModeState(next);
  }, []);

  const toggleAuditMode = useCallback(() => {
    setAuditModeState(prev => !prev);
  }, []);

  const openTrace = useCallback((id: string) => {
    setActiveTraceId(id);
  }, []);

  const closeTrace = useCallback(() => {
    setActiveTraceId(null);
  }, []);

  const value = useMemo<AuditModeContextValue>(
    () => ({
      auditMode,
      activeTraceId,
      toggleAuditMode,
      setAuditMode,
      openTrace,
      closeTrace,
    }),
    [auditMode, activeTraceId, toggleAuditMode, setAuditMode, openTrace, closeTrace],
  );

  return (
    <AuditModeContext.Provider value={value}>{children}</AuditModeContext.Provider>
  );
}

/**
 * Read the Audit Mode context. Returns a safe fallback when called outside
 * the provider so legacy unwrapped tests / Storybook surfaces don't crash —
 * audit mode is simply always OFF and the open/close handlers are no-ops.
 */
export function useAuditMode(): AuditModeContextValue {
  const ctx = useContext(AuditModeContext);
  if (ctx) return ctx;
  return {
    auditMode: false,
    activeTraceId: null,
    toggleAuditMode: () => {},
    setAuditMode: () => {},
    openTrace: () => {},
    closeTrace: () => {},
  };
}

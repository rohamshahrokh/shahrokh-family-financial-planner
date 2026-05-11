/**
 * PrivacyContext — global privacy-mode provider.
 *
 * Why this file exists
 * --------------------
 * The May-2026 UX audit found privacy state was per-component: dashboard
 * header toggled it via the zustand store, but several card SUBLABELS
 * (e.g. "$1.50M planned IP", "$58K/yr once IPs settle") used hardcoded
 * formatCurrency() without checking. The result was values un-masking
 * when a re-render happened, or sublabels leaking even when the headline
 * was masked.
 *
 * This context centralises three things:
 *
 *   1. `isPrivate` — the single boolean every renderer reads
 *   2. `toggle()` — used by the header chip and keyboard shortcut
 *   3. `mask(value, kind)` — canonical masks for every numeric kind
 *
 * The state itself still lives in the zustand store (so existing call-sites
 * via `useAppStore().privacyMode` keep working) — the context is a
 * convenience wrapper plus the canonical `mask()` helper. The persistence
 * layer is the zustand `persist` middleware writing to localStorage; the
 * context adds the documented key `fwl-privacy-mode` as a mirror so a
 * non-React surface (e.g. a service worker) can also read it.
 */
import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { useAppStore } from "@/lib/store";

const MIRROR_KEY = "fwl-privacy-mode";

export type MoneyKind = "currency" | "percent" | "count";

/** Canonical mask strings. Match these exactly anywhere outside the context too. */
export const PRIVACY_MASKS: Record<MoneyKind, string> = {
  currency: "$•••••",
  percent:  "••.•%",
  count:    "•••",
};

export interface PrivacyContextValue {
  isPrivate: boolean;
  toggle: () => void;
  /** Mask a value when `isPrivate` is true; otherwise return `value` as a string. */
  mask: (value: string | number, kind?: MoneyKind) => string;
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null);

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const isPrivate = useAppStore(s => s.privacyMode);
  const togglePrivacy = useAppStore(s => s.togglePrivacy);

  // Mirror to localStorage under the documented key so PWA/service-worker
  // surfaces can read it without bundling the zustand store.
  useEffect(() => {
    try { localStorage.setItem(MIRROR_KEY, isPrivate ? "1" : "0"); } catch { /* ignore */ }
  }, [isPrivate]);

  const mask = useCallback((value: string | number, kind: MoneyKind = "currency"): string => {
    if (isPrivate) return PRIVACY_MASKS[kind];
    return typeof value === "string" ? value : String(value);
  }, [isPrivate]);

  const value = useMemo<PrivacyContextValue>(
    () => ({ isPrivate, toggle: togglePrivacy, mask }),
    [isPrivate, togglePrivacy, mask],
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

/**
 * Read the privacy context. Returns the zustand-backed value when wrapped
 * by `<PrivacyProvider>`; otherwise falls back to a direct zustand read so
 * legacy un-wrapped tests keep working.
 */
export function usePrivacy(): PrivacyContextValue {
  const ctx = useContext(PrivacyContext);
  // Fallback so call-sites outside the provider don't crash (e.g. in tests).
  const storeIsPrivate = useAppStore(s => s.privacyMode);
  const storeToggle = useAppStore(s => s.togglePrivacy);
  if (ctx) return ctx;
  return {
    isPrivate: storeIsPrivate,
    toggle: storeToggle,
    mask: (value, kind = "currency") =>
      storeIsPrivate ? PRIVACY_MASKS[kind] : (typeof value === "string" ? value : String(value)),
  };
}

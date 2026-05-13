/**
 * useActiveRegime.ts — P1b React adapter for the headless activeRegimeStore.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform
 *
 * Wraps the framework-free `activeRegimeStore` in `useSyncExternalStore`
 * so every UI surface (selector, dashboard cards, comparison panels)
 * can read the active regime reactively without prop-drilling.
 *
 * The store itself is untouched. This file is the only React coupling.
 *
 * Persistence: when the hook mounts in a browser, it rehydrates the
 * selector from `localStorage["fwl.activeRegime"]` (a 4-value enum string).
 * Custom-regime objects are NOT persisted — they are too large/structural;
 * P1b sticks to the spec default for CUSTOM_STRESS_TEST.
 */

import { useEffect, useSyncExternalStore } from "react";
import {
  getActiveRegime,
  setActiveRegime,
  subscribeActiveRegime,
  type ActiveRegimeState,
} from "@/lib/activeRegimeStore";
import type { TaxPolicyRegimeKind } from "@/lib/taxPolicyEngine";

const LS_KEY = "fwl.activeRegime";

const VALID_KINDS: TaxPolicyRegimeKind[] = [
  "AUTO_DETECT",
  "CURRENT_RULES",
  "PROPOSED_2027_REFORM",
  "CUSTOM_STRESS_TEST",
];

function readPersisted(): TaxPolicyRegimeKind | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return VALID_KINDS.includes(raw as TaxPolicyRegimeKind)
      ? (raw as TaxPolicyRegimeKind)
      : null;
  } catch {
    return null;
  }
}

function writePersisted(kind: TaxPolicyRegimeKind): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, kind);
  } catch {
    // Storage quota / privacy mode — silently ignore.
  }
}

/**
 * Subscribe to the active regime state. Returns the full state plus a
 * setter for the selector kind. The setter persists to localStorage.
 *
 * The hook never throws. Server-side renders return the in-memory default.
 */
export function useActiveRegime(): {
  state: ActiveRegimeState;
  selector: TaxPolicyRegimeKind;
  setSelector: (kind: TaxPolicyRegimeKind) => void;
} {
  // One-time rehydration on first mount in the browser.
  useEffect(() => {
    const persisted = readPersisted();
    if (persisted && persisted !== getActiveRegime().selector) {
      setActiveRegime({ selector: persisted });
    }
    // Intentionally only runs once — the user's stored choice wins on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const state = useSyncExternalStore(
    subscribeActiveRegime,
    getActiveRegime,
    getActiveRegime,
  );

  const setSelector = (kind: TaxPolicyRegimeKind): void => {
    setActiveRegime({ selector: kind });
    writePersisted(kind);
  };

  return { state, selector: state.selector, setSelector };
}

/** Human-friendly label for a regime kind. */
export function regimeKindLabel(kind: TaxPolicyRegimeKind): string {
  switch (kind) {
    case "AUTO_DETECT":         return "Auto Detect";
    case "CURRENT_RULES":       return "Current Rules";
    case "PROPOSED_2027_REFORM": return "Proposed 2027 Reform";
    case "CUSTOM_STRESS_TEST":  return "Custom Stress Test";
  }
}

/** Short description for a regime kind (used in tooltips and rationale cards). */
export function regimeKindDescription(kind: TaxPolicyRegimeKind): string {
  switch (kind) {
    case "AUTO_DETECT":
      return "Resolves per-property using purchase date, contract date and property type. Grandfathered properties keep current rules; post-cutoff established properties use reform.";
    case "CURRENT_RULES":
      return "Today's rules — negative gearing offsets wage income immediately, 50% CGT discount after 12 months.";
    case "PROPOSED_2027_REFORM":
      return "Hypothetical reform from 1 July 2027 — negative-gearing losses on established properties quarantined, no CGT discount on disposal.";
    case "CUSTOM_STRESS_TEST":
      return "Custom regime overrides defined by the spec for stress-testing edge cases.";
  }
}

export const ACTIVE_REGIME_LS_KEY = LS_KEY;

/**
 * activeRegimeStore.ts — Engine-Side Active Regime Store (P1, headless)
 *
 * #FWL_TaxReform_P1_P2_Integration_NoOverride
 *
 * Tiny, framework-free observable store that exposes the *active* tax
 * policy regime selection to every engine overlay (Tax Alpha, Forecast,
 * FIRE, Property Buy, scenarioV2 wrapper). UI plumbing — selectors,
 * comparison panels, persistence — is deferred to P1b.
 *
 * Why headless?
 *   The rule for this session is "engines only — no UI components". A
 *   plain TypeScript module with subscribe/get/set semantics lets the
 *   engine overlays default to AUTO_DETECT while still supporting an
 *   explicit override that P1b can wire to a React component without
 *   touching any engine.
 *
 * Why a singleton + subscribe pattern (not a context)?
 *   - Zero React coupling so headless tests + non-React callers
 *     (PDF generators, persistence layer, scheduled jobs) can read it.
 *   - Subscription contract identical to React's `useSyncExternalStore`
 *     so a P1b adapter is a 5-line wrapper.
 *
 * IMPORTANT — invariants:
 *   1. Default state = { selector: "AUTO_DETECT", customRegime: undefined }.
 *      Every overlay must continue to work when nothing has ever called
 *      setActiveRegime.
 *   2. The store NEVER imports React.
 *   3. The store NEVER persists anything to disk — P1b persistence is a
 *      separate concern.
 *   4. Setting the selector to CUSTOM_STRESS_TEST without supplying a
 *      customRegime falls back to REGIMES_BY_KIND.CUSTOM_STRESS_TEST
 *      (the spec default).
 *
 * Modelling disclaimer (must surface on any UI rendered against these
 * outputs): "This is modelling only and not personal tax advice."
 */

import {
  PROPOSED_2027_REFORM_REGIME,
  REGIMES_BY_KIND,
  type TaxPolicyRegime,
  type TaxPolicyRegimeKind,
} from "./taxPolicyEngine";

// ─── State ───────────────────────────────────────────────────────────────────

export interface ActiveRegimeState {
  /** User's selected regime kind. Default AUTO_DETECT. */
  selector: TaxPolicyRegimeKind;
  /** Custom regime override (only meaningful when selector = CUSTOM_STRESS_TEST). */
  customRegime?: TaxPolicyRegime;
  /** Optional reform regime override (defaults to PROPOSED_2027_REFORM_REGIME). */
  reformRegime?: TaxPolicyRegime;
}

const DEFAULT_STATE: ActiveRegimeState = {
  selector: "AUTO_DETECT",
  customRegime: undefined,
  reformRegime: undefined,
};

// ─── Internal storage ────────────────────────────────────────────────────────

let _state: ActiveRegimeState = { ...DEFAULT_STATE };
const _listeners = new Set<() => void>();

function notify(): void {
  _listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Listeners must not throw into the store. Swallow.
    }
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Read the current active regime state. Pure getter. */
export function getActiveRegime(): ActiveRegimeState {
  return _state;
}

/**
 * Read the *concrete* reform regime that should be used by overlays.
 * Falls back to PROPOSED_2027_REFORM_REGIME when no override is set.
 */
export function getActiveReformRegime(): TaxPolicyRegime {
  return _state.reformRegime ?? PROPOSED_2027_REFORM_REGIME;
}

/**
 * Read the *concrete* custom regime that should be used by overlays
 * when selector = CUSTOM_STRESS_TEST. Falls back to the spec default.
 */
export function getActiveCustomRegime(): TaxPolicyRegime {
  return _state.customRegime ?? REGIMES_BY_KIND.CUSTOM_STRESS_TEST;
}

/**
 * Replace the active regime state. The change notification fires
 * synchronously to every subscriber. Pure setter — no side-effects
 * beyond the listener notification.
 */
export function setActiveRegime(next: Partial<ActiveRegimeState>): void {
  _state = {
    selector:     next.selector     ?? _state.selector,
    customRegime: "customRegime" in next ? next.customRegime : _state.customRegime,
    reformRegime: "reformRegime" in next ? next.reformRegime : _state.reformRegime,
  };
  notify();
}

/** Reset to defaults. Primarily for tests. */
export function resetActiveRegime(): void {
  _state = { ...DEFAULT_STATE };
  notify();
}

/**
 * Subscribe to state changes. Returns an unsubscribe function.
 * Contract matches React's useSyncExternalStore so P1b can wrap this
 * without modification.
 */
export function subscribeActiveRegime(listener: () => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

// ─── Convenience selectors ──────────────────────────────────────────────────

/**
 * Composite "engine args" — what every overlay needs to know in one shot.
 * Overlays can call this instead of plumbing three separate accessors.
 */
export interface ActiveRegimeEngineArgs {
  regimeSelector: TaxPolicyRegimeKind;
  customRegime?: TaxPolicyRegime;
  reformRegime?: TaxPolicyRegime;
}

export function getActiveRegimeEngineArgs(): ActiveRegimeEngineArgs {
  return {
    regimeSelector: _state.selector,
    customRegime:   _state.customRegime,
    reformRegime:   _state.reformRegime,
  };
}

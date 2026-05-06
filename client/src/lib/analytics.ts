/**
 * analytics.ts — Google Analytics 4 helpers for Vite + React + Wouter SPA.
 *
 * - All functions are no-ops unless window.gtag is initialised (production only).
 * - Never throws — wrapped in try/catch so a blocked GA script won't break the app.
 */

const GA_ID = "G-066ZTF7MH1";

// ─── Type declaration ─────────────────────────────────────────────────────────

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

// ─── Core gtag wrapper ────────────────────────────────────────────────────────

/** Safe gtag() call — silently no-ops if GA is not loaded */
export function gtag(...args: unknown[]): void {
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag(...args);
    }
  } catch {
    // Never throw — GA must not break the app
  }
}

// ─── Page view ────────────────────────────────────────────────────────────────

/** Fire a GA4 page_view event. Call this on every route change. */
export function trackPageView(path: string): void {
  gtag("event", "page_view", {
    page_path: path,
    page_title: document.title,
    page_location: window.location.href,
    send_to: GA_ID,
  });
}

// ─── Custom events ────────────────────────────────────────────────────────────

/** Fire any GA4 custom event */
export function trackEvent(
  eventName: string,
  params?: Record<string, unknown>,
): void {
  gtag("event", eventName, { send_to: GA_ID, ...params });
}

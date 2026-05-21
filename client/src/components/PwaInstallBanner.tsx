/**
 * PwaInstallBanner — install-prompt banner with audit-driven guardrails.
 *
 * Behaviour (audit fix P1-5):
 *   • Dismissible — `localStorage["fwl-pwa-dismissed-at"]` holds an ISO ts.
 *   • After dismiss, hide for 30 days, then re-show.
 *   • Only show after the user's 3rd visit (tracked in
 *     `localStorage["fwl-visit-count"]`, incremented on mount).
 *   • Theme-aware — uses `bg-card / text-card-foreground / border-border`
 *     instead of hardcoded dark colors.
 *   • Reserves bottom-padding on `<main>` via the `usePwaBannerVisible()`
 *     hook so content does not get hidden behind the banner.
 *   • Honours `env(safe-area-inset-bottom)` for iOS notches.
 *   • Suppressed on the anchor screens `/decision`, `/scenario-compare`,
 *     `/reports` where the banner stomps on critical UI.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { X, Download } from "lucide-react";

const DISMISS_KEY = "fwl-pwa-dismissed-at";
const VISIT_KEY = "fwl-visit-count";
const MIN_VISITS = 3;
const REDISPLAY_AFTER_DAYS = 30;

const SUPPRESSED_PATHS = [
  "/decision",
  "/scenario-compare",
  "/scenario-compare-v2",
  "/reports",
];

function readDismissedIso(): string | null {
  try { return localStorage.getItem(DISMISS_KEY); } catch { return null; }
}

function dismissedRecently(): boolean {
  const iso = readDismissedIso();
  if (!iso) return false;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return false;
  const ageDays = (Date.now() - at) / 86_400_000;
  return ageDays < REDISPLAY_AFTER_DAYS;
}

function readVisitCount(): number {
  try {
    const raw = localStorage.getItem(VISIT_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch { return 0; }
}

function bumpVisitCount(): number {
  const next = readVisitCount() + 1;
  try { localStorage.setItem(VISIT_KEY, String(next)); } catch { /* ignore */ }
  return next;
}

function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua);
  return isIos && isSafari;
}

function isInStandaloneMode(): boolean {
  return (
    ("standalone" in window.navigator && (window.navigator as any).standalone === true) ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

/**
 * Custom event the banner dispatches whenever its actual visibility flips.
 * Layout listens for this so the reserved bottom-spacer stays in sync with
 * the banner — eliminating the race where the banner showed (e.g. on the
 * 3rd visit, via `beforeinstallprompt`, or on iOS Safari) but Layout's
 * cached gating still read "hidden", letting the banner overlay financial
 * data.
 */
const VISIBILITY_EVENT = "fwl-pwa-banner-visibility";

/**
 * Hook other components (e.g. Layout / <main>) can use to reserve bottom
 * padding when the banner is visible. Re-evaluates on:
 *   • route change (location)
 *   • a `fwl-pwa-banner-visibility` custom event dispatched by the banner
 *     whenever it shows or hides (covers beforeinstallprompt, iOS Safari
 *     detection, dismiss, and the 3rd-visit bump race).
 * Returns `false` until the banner is *actually* in the DOM, but `true`
 * the moment it appears — guaranteeing the layout reserves space before
 * the user can scroll the projection cards underneath it.
 */
export function usePwaBannerVisible(): boolean {
  const [location] = useLocation();
  const [active, setActive] = useState(false);

  useEffect(() => {
    function evaluate() {
      if (isInStandaloneMode()) { setActive(false); return; }
      if (dismissedRecently()) { setActive(false); return; }
      if (SUPPRESSED_PATHS.includes(location)) { setActive(false); return; }
      if (readVisitCount() < MIN_VISITS) { setActive(false); return; }
      setActive(true);
    }
    evaluate();
    function onVisibility(e: Event) {
      const detail = (e as CustomEvent<{ visible: boolean }>).detail;
      if (detail && typeof detail.visible === "boolean") {
        setActive(detail.visible);
      } else {
        evaluate();
      }
    }
    window.addEventListener(VISIBILITY_EVENT, onVisibility);
    return () => window.removeEventListener(VISIBILITY_EVENT, onVisibility);
  }, [location]);

  return active;
}

export default function PwaInstallBanner() {
  const [location] = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIos, setShowIos] = useState(false);
  const [visible, setVisible] = useState(false);

  // Bump visit count once per session-mount so refreshes don't game it.
  // The bump is deliberate before the gating logic so a returning user who
  // would qualify on this very visit gets the banner.
  useEffect(() => {
    if (isInStandaloneMode()) return;
    bumpVisitCount();
  }, []);

  // Whenever our visibility flips, broadcast it so `usePwaBannerVisible`
  // listeners (Layout) can reserve / release the bottom-spacer in lockstep.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("fwl-pwa-banner-visibility", { detail: { visible } }),
    );
  }, [visible]);

  useEffect(() => {
    if (isInStandaloneMode()) { setVisible(false); return; }
    if (dismissedRecently()) { setVisible(false); return; }
    if (SUPPRESSED_PATHS.includes(location)) { setVisible(false); return; }
    if (readVisitCount() < MIN_VISITS) { setVisible(false); return; }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    if (isIosSafari()) {
      setShowIos(true);
      setVisible(true);
    }
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [location]);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, new Date().toISOString()); } catch { /* ignore */ }
    setVisible(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setVisible(false);
    setDeferredPrompt(null);
  }

  // Anchor to the bottom-left corner so the banner cannot overlap the
  // primary content column on narrow iPhone widths. The `max()` honours
  // the iOS Safari home-indicator safe area without floating too high.
  const bottomStyle = useMemo<React.CSSProperties>(() => ({
    bottom: "max(0.75rem, env(safe-area-inset-bottom, 0.75rem))",
  }), []);

  if (!visible) return null;

  return (
    <div
      className="fixed left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-border bg-card text-card-foreground shadow-2xl shadow-black/40 px-4 py-3"
      style={bottomStyle}
      role="banner"
      aria-label="Install Family Wealth Lab"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5 rounded-xl bg-primary/15 p-2">
          <Download className="w-5 h-5 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">
            Install Family Wealth Lab
          </p>
          {showIos ? (
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Tap the <strong className="text-foreground">Share</strong> button in Safari,
              then <strong className="text-foreground">Add to Home Screen</strong> for the
              full app experience.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
              Add to your home screen for instant access — works offline too.
            </p>
          )}

          {!showIos && deferredPrompt && (
            <button
              onClick={install}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary hover:opacity-90 active:opacity-80 px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity"
            >
              <Download className="w-3.5 h-3.5" />
              Install App
            </button>
          )}
        </div>

        <button
          onClick={dismiss}
          className="shrink-0 mt-0.5 rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          aria-label="Dismiss for 30 days"
          title="Dismiss for 30 days"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

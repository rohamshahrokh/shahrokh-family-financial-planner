/**
 * PwaInstallBanner — shows a "Add to Home Screen" prompt on supported browsers.
 * Listens for the `beforeinstallprompt` event (Chrome/Android/Edge).
 * On iOS Safari it shows manual instructions since iOS doesn't fire the event.
 * Dismissible — remembers dismissal in localStorage for 30 days.
 */
import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";

const DISMISS_KEY = "fwl_pwa_banner_dismissed";
const DISMISS_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    return Date.now() - ts < DISMISS_TTL;
  } catch {
    return false;
  }
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

export default function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIos, setShowIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Already installed or dismissed — don't show
    if (isInStandaloneMode() || isDismissed()) return;

    // Chrome / Android / Edge — capture beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS Safari — show manual instructions
    if (isIosSafari()) {
      setShowIos(true);
      setVisible(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setVisible(false);
    setDeferredPrompt(null);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl border border-blue-800/60 bg-[#0d1630] shadow-2xl shadow-black/60 px-4 py-3"
      role="banner"
      aria-label="Install Family Wealth Lab"
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="shrink-0 mt-0.5 rounded-xl bg-blue-900/50 p-2">
          <Download className="w-5 h-5 text-blue-300" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white leading-tight">
            Install Family Wealth Lab
          </p>
          {showIos ? (
            <p className="text-xs text-zinc-400 mt-0.5 leading-snug">
              Tap the <strong className="text-zinc-200">Share</strong> button in Safari,
              then <strong className="text-zinc-200">Add to Home Screen</strong> for the
              full app experience.
            </p>
          ) : (
            <p className="text-xs text-zinc-400 mt-0.5 leading-snug">
              Add to your home screen for instant access — works offline too.
            </p>
          )}

          {/* Install button — only for non-iOS (iOS is manual) */}
          {!showIos && deferredPrompt && (
            <button
              onClick={install}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Install App
            </button>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={dismiss}
          className="shrink-0 mt-0.5 rounded-lg p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

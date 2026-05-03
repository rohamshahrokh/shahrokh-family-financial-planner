import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyTheme, resolveAutoTheme } from "./lib/store";
import type { ThemeMode } from "./lib/store";

// ── Apply saved theme BEFORE first render (no flash) ──────────────────────
try {
  const stored = JSON.parse(localStorage.getItem("shahrokh-app-state") ?? "{}");
  const mode: ThemeMode = ["dark", "light", "auto"].includes(stored.theme)
    ? stored.theme : "dark";
  applyTheme(mode);
} catch {
  // default dark if nothing stored
}

// One-time migration: if we land on a hash-routed URL (legacy bookmarks, old
// PWA installs, push notifications), rewrite it to a clean path before React
// boots so wouter’s browser-history hook sees the right pathname.
if (window.location.hash.startsWith("#/")) {
  const cleanPath = window.location.hash.slice(1) || "/";
  window.history.replaceState(null, "", cleanPath);
}

// NOTE: Numeric input select-all / leading-zero handling is done inside
// SmartNumInput (touchstart + rAF focus trick) which is iOS-safe.
// Global listeners are NOT used — they conflict with React synthetic events
// and cause double-fire on iOS Safari PWA.

createRoot(document.getElementById("root")!).render(<App />);

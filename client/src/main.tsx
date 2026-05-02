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

if (!window.location.hash) {
  window.location.hash = "#/";
}

createRoot(document.getElementById("root")!).render(<App />);

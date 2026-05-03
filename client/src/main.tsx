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

// ── Global: numeric inputs select-all on focus, strip leading zeros on change ─
// This covers every <input type="number"> and inputMode="decimal" in the app.
document.addEventListener("focusin", (e) => {
  const el = e.target as HTMLInputElement;
  if (!el || el.tagName !== "INPUT") return;
  if (el.type !== "number" && el.inputMode !== "decimal") return;
  // Select all so typing replaces current value
  el.select();
  setTimeout(() => {
    try { el.setSelectionRange(0, el.value.length); } catch {}
  }, 0);
});

// Strip leading zeros on input (e.g. 0600000 → 600000)
document.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (!el || el.tagName !== "INPUT") return;
  if (el.type !== "number" && el.inputMode !== "decimal") return;
  // Only strip if not a decimal being entered ("0." is fine)
  const v = el.value;
  if (/^0[0-9]/.test(v)) {
    const stripped = v.replace(/^0+([0-9])/, "$1");
    // Use nativeInputValueSetter to avoid React synthetic event issues
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, stripped);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      el.value = stripped;
    }
  }
});

createRoot(document.getElementById("root")!).render(<App />);

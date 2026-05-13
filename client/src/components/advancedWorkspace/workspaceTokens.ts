/**
 * Advanced Workspace — Analytical Visual Language Tokens
 *
 * Purpose: a deliberately denser, more analytical visual system that
 * differentiates the institutional Advanced Workspace from the consumer
 * Quick Decision UI. NOT to be used in Quick Decision.
 *
 * Design principles:
 *  - Tabular numerics everywhere (no kerning shift on hover/sort)
 *  - Tighter line-height + spacing
 *  - Stronger borders, subtle grid lines
 *  - High-contrast semantic colours that pass WCAG AA in both themes
 *  - No emoji, no gradients, no rounded-full chrome — analytical, not playful
 */

// ─── Typography ──────────────────────────────────────────────────────────────

/** Metric numbers — tabular, dense, used in tables/rails. */
export const NUM_CLS =
  "font-mono tabular-nums tracking-tight";

/** Compact metric label (left-rail / table header style). */
export const LABEL_CLS =
  "text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted-foreground";

/** Section heading inside a workspace panel. */
export const PANEL_HEADING_CLS =
  "text-xs font-semibold tracking-tight uppercase text-foreground/80";

/** Body micro-text for analytical context lines. */
export const MICRO_CLS = "text-[11px] leading-snug text-muted-foreground";

// ─── Layout ──────────────────────────────────────────────────────────────────

/** Panel chrome — used by Control Tower / Risk Rail / each tab card. */
export const PANEL_CLS =
  "rounded-md border border-border bg-card/95 dark:bg-card/70 shadow-sm";

/** Compact panel padding (denser than consumer cards). */
export const PANEL_PAD = "p-3";

/** Divider between sub-blocks inside a panel. */
export const PANEL_DIVIDER = "border-t border-border/60";

// ─── Semantic colours (WCAG AA verified against bg-card in both modes) ──────

/** Positive / winner / "wealth up". */
export const POS_TEXT =
  "text-emerald-700 dark:text-emerald-300";
export const POS_BG =
  "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/70 dark:border-emerald-800/60";

/** Negative / loss / "risk fired". */
export const NEG_TEXT =
  "text-rose-700 dark:text-rose-300";
export const NEG_BG =
  "bg-rose-50 dark:bg-rose-950/40 border-rose-200/70 dark:border-rose-800/60";

/** Warning / caution / "watch this". */
export const WARN_TEXT =
  "text-amber-700 dark:text-amber-300";
export const WARN_BG =
  "bg-amber-50 dark:bg-amber-950/40 border-amber-200/70 dark:border-amber-800/60";

/** Informational / neutral. */
export const INFO_TEXT =
  "text-sky-700 dark:text-sky-300";
export const INFO_BG =
  "bg-sky-50 dark:bg-sky-950/40 border-sky-200/70 dark:border-sky-800/60";

/** Muted / "no data" / "baseline". */
export const MUTED_TEXT = "text-muted-foreground";

// ─── Delta-coloring helper ───────────────────────────────────────────────────

/**
 * Pick a text colour given a delta vs baseline.
 * Returns positive for `betterIsHigher && delta > 0` (and vice versa).
 */
export function deltaColor(
  delta: number,
  betterIsHigher: boolean,
  thresholdPct = 0.005,
): string {
  if (!Number.isFinite(delta) || Math.abs(delta) < thresholdPct) {
    return MUTED_TEXT;
  }
  const good = betterIsHigher ? delta > 0 : delta < 0;
  return good ? POS_TEXT : NEG_TEXT;
}

/** Format a delta string like "+12.4%" or "−$45k". */
export function fmtDeltaPct(delta: number, d = 1): string {
  if (!Number.isFinite(delta)) return "—";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return `${sign}${Math.abs(delta * 100).toFixed(d)}%`;
}

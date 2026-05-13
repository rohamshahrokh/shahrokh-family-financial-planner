/**
 * uxTokens.ts — Presentation tokens for the P1c UX refinement pass.
 *
 * #FWL_P1C_UX_Refinement
 *
 * Centralised typography scale, spacing rhythm, surface tiers, and motion
 * timing for the regime UI. Pure presentation tokens — no engine coupling.
 *
 * Design philosophy (Apple-like fintech, Linear-grade calm):
 *   - Depth via elevation (shadow + surface tier), not 1px borders.
 *   - Two text weights — strong (numbers/headlines) + soft (labels/captions).
 *   - One accent at a time on any given card; mute everything else.
 *   - Progressive disclosure: headline first, detail behind a toggle.
 *
 * NOTE: All values are Tailwind class strings, not raw CSS, so consumers
 * can `cn(s.card.base, s.card.hero)` without touching globals.
 */

/** Surface tiers — leverages the app's existing 3-tier depth system. */
export const surface = {
  /** Resting card on the page background. Soft shadow, no border. */
  card: "rounded-2xl bg-[hsl(var(--surface-1))] shadow-[var(--shadow-sm)]",
  /** Elevated card — used inside another card or for primary KPIs. */
  cardElevated: "rounded-2xl bg-[hsl(var(--surface-2))] shadow-[var(--shadow-md)]",
  /** Inline well — table rows, expandable detail sections. */
  well: "rounded-xl bg-[hsl(var(--muted)/0.6)]",
  /** Hairline divider — used sparingly, only between logical groups. */
  divider: "border-t border-[hsl(var(--border)/0.5)]",
} as const;

/** Spacing rhythm — based on 4px grid, slightly generous for premium feel. */
export const spacing = {
  cardPadMobile: "p-4",
  cardPadDesktop: "sm:p-5",
  cardPad: "p-4 sm:p-5",
  cardPadLg: "p-5 sm:p-6",
  /** Gap between stacked sections inside a card. */
  stackTight: "space-y-1",
  stackBase: "space-y-2",
  stackRelaxed: "space-y-3",
  stackLoose: "space-y-4",
  /** Outer grid gaps — mobile breathes wider than desktop tight. */
  gridGap: "gap-3 sm:gap-4",
} as const;

/** Typography scale — hero numbers prominent, secondary labels soft. */
export const type = {
  /** Page section heading. Restrained, never shouts. */
  sectionTitle: "text-base font-semibold tracking-tight text-foreground",
  /** Tiny label above a hero number. Soft uppercase, tracked. */
  eyebrow: "text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground",
  /** Plain caption / supporting text under a hero number. */
  caption: "text-xs leading-relaxed text-muted-foreground",
  /** Inline secondary text within a card body. */
  body: "text-sm leading-relaxed text-foreground/90",
  /** Soft body — for explanatory paragraphs that should not compete. */
  bodySoft: "text-sm leading-relaxed text-muted-foreground",
  /** Hero number — the single most important value on a card. */
  hero: "text-2xl sm:text-3xl font-semibold tracking-tight tabular-nums text-foreground",
  /** Secondary number — paired comparisons (Current vs Reform). */
  number: "text-lg sm:text-xl font-semibold tracking-tight tabular-nums text-foreground",
  /** Tertiary number — for table rows, supplementary readouts. */
  numberSm: "text-sm font-medium tabular-nums",
} as const;

/** Accent tones — restrained, single accent per card. */
export const tone = {
  /** Positive / good. */
  good: "text-emerald-600 dark:text-emerald-400",
  /** Adverse / warning. */
  warn: "text-amber-600 dark:text-amber-400",
  /** Critical / loss. */
  bad: "text-rose-600 dark:text-rose-400",
  /** Informational / interactive (matches --primary). */
  info: "text-sky-600 dark:text-sky-400",
  /** Premium / brand accent. */
  brand: "text-[hsl(var(--gold))]",
  /** Soft neutral — never compete with primary tone on the same card. */
  soft: "text-muted-foreground",
} as const;

/** Soft tint backgrounds — used for KPI tiles that need a hint of colour. */
export const tint = {
  good: "bg-emerald-500/[0.06] dark:bg-emerald-500/[0.08]",
  warn: "bg-amber-500/[0.06] dark:bg-amber-500/[0.08]",
  bad: "bg-rose-500/[0.06] dark:bg-rose-500/[0.08]",
  info: "bg-sky-500/[0.06] dark:bg-sky-500/[0.08]",
  brand: "bg-[hsl(var(--gold)/0.06)]",
  none: "",
} as const;

/** Grid recipes — mobile-first, breathe at scale. */
export const gridRecipe = {
  /** KPI tile row — 1 col mobile, 2 col tablet, 3 col desktop. */
  kpi: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  /** Dense KPI row — 2 col mobile, 3 col tablet, 6 col desktop. */
  kpiDense: "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
  /** Three-up comparison — stacked mobile, side-by-side desktop. */
  compare3: "grid grid-cols-1 md:grid-cols-3",
  /** Two-up comparison. */
  compare2: "grid grid-cols-1 md:grid-cols-2",
} as const;

/** Human-friendly plain-English label dictionary.
 *  Replaces internal/engine jargon with consumer-facing copy. */
export const PLAIN_LABEL = {
  // Regime kinds
  AUTO_DETECT: "Smart auto-detect",
  CURRENT_RULES: "Today's rules",
  PROPOSED_2027_REFORM: "Proposed 2027 reform",
  CUSTOM_STRESS_TEST: "Custom what-if",

  // Dashboard tile labels (old → new)
  TAX_REGIME_ACTIVE: "Active rules",
  DEFERRED_LOSS_BALANCE: "Locked-in losses",
  TAX_TIMING_DRAG: "Tax friction",
  REFORM_SENSITIVITY: "Reform exposure",
  TAX_ADJUSTED_NW: "Wealth impact",
  FIRE_DELAY: "Retirement shift",

  // Comparison column labels
  CURRENT: "Today's rules",
  REFORM: "Proposed reform",
  DELTA: "Difference",
  STRESS: "Stress scenario",
} as const;

/** Hint text — soft secondary captions written in plain English. */
export const PLAIN_HINT = {
  ACTIVE_REGIME: "Which rules we're modelling against",
  DEFERRED_LOSSES: "Losses you'd carry forward to a future sale",
  TAX_FRICTION: "Extra tax you'd pay this year",
  REFORM_EXPOSURE: "How much the proposed reform changes your plan",
  WEALTH_IMPACT: "Change in your projected wealth at year 10",
  RETIREMENT_SHIFT: "How much sooner or later you could retire",
} as const;

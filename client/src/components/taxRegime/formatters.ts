/**
 * formatters.ts — Shared display formatters for the P1b regime UI.
 *
 * #FWL_P1B_UI_Finalisation_TaxReform
 *
 * Tiny, side-effect-free helpers used by the regime selector, comparison
 * panels, deferred-loss card, and policy-shock simulator. AUD/Brisbane
 * locale by spec.
 */

const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});
const AUD_2DP = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 2,
});
const PCT = new Intl.NumberFormat("en-AU", {
  style: "percent",
  maximumFractionDigits: 2,
});

export function fmtAud(n: number | null | undefined, opts?: { dp2?: boolean }): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return (opts?.dp2 ? AUD_2DP : AUD).format(n);
}

export function fmtAudSigned(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const s = fmtAud(Math.abs(n));
  if (n === 0) return s;
  return (n > 0 ? "+" : "−") + s;
}

export function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return PCT.format(n);
}

export function fmtPctPoints(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n * 100).toFixed(2)}pp`;
}

export function fmtYears(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n === 0) return "0 yrs";
  const sign = n > 0 ? "+" : "−";
  return `${sign}${Math.abs(n).toFixed(1)} yrs`;
}

export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(n);
}

/**
 * Direction colour for delta values. "favorable" = reform looks better;
 * "adverse" = reform looks worse; "neutral" = unchanged.
 *
 * NOTE: the sign convention is up to the caller. For NG savings, a more
 * negative delta is adverse. For FIRE-year delta, a positive delta (later
 * FIRE) is adverse.
 */
export function deltaTone(direction: "favorable" | "adverse" | "neutral"): string {
  switch (direction) {
    case "favorable": return "text-emerald-600 dark:text-emerald-400";
    case "adverse":   return "text-rose-600 dark:text-rose-400";
    case "neutral":   return "text-muted-foreground";
  }
}

/**
 * Convenience helper — given a raw delta (in $ or in years) and a sense
 * ("more is better" vs "less is better"), returns the tone class.
 */
export function senseTone(
  delta: number | null | undefined,
  sense: "more-better" | "less-better",
): string {
  if (delta === null || delta === undefined || !Number.isFinite(delta) || delta === 0) {
    return deltaTone("neutral");
  }
  const favorable = sense === "more-better" ? delta > 0 : delta < 0;
  return deltaTone(favorable ? "favorable" : "adverse");
}

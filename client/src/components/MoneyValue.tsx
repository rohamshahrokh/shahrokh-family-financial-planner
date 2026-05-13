/**
 * MoneyValue — single component every numeric KPI / sublabel renders through.
 *
 * Why this exists
 * --------------------
 * The audit found dashboard cards leaking unmasked dollar amounts in their
 * sub-labels even when the headline figure obeyed privacy mode. Every span
 * that displays money / percent / count now should route through this
 * component, which reads `usePrivacy()` and applies the canonical mask.
 *
 * Usage:
 *   <MoneyValue value={856_000} kind="currency" />          // "$856,000" or "$•••••"
 *   <MoneyValue value={0.236} kind="percent" />              // "23.6%" or "••.•%"
 *   <MoneyValue value={27} kind="count" />                   // "27" or "•••"
 *
 * Pass `formatted` when you already have a formatted string (e.g. from a
 * shared formatter) — saves the component from re-running Intl.NumberFormat.
 */
import { type CSSProperties } from "react";
import { PRIVACY_MASKS, usePrivacy, type MoneyKind } from "@/contexts/PrivacyContext";

const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

function formatDefault(value: number, kind: MoneyKind): string {
  if (kind === "currency") return AUD.format(Math.round(value));
  if (kind === "percent")  return `${(value * 100).toFixed(1)}%`;
  return value.toLocaleString("en-AU");
}

export interface MoneyValueProps {
  /** Numeric value (mandatory unless `formatted` is supplied). */
  value?: number | null;
  /** Mask kind. Default "currency". */
  kind?: MoneyKind;
  /** Pre-formatted string — overrides default formatting when present. */
  formatted?: string;
  /** Fallback render when value is null/undefined (and `formatted` is missing). Default "—". */
  fallback?: string;
  /** Optional CSS class on the wrapping <span>. */
  className?: string;
  /** Optional inline style. */
  style?: CSSProperties;
  /** When true, render mask in muted color so visual hierarchy is preserved. */
  mutedWhenMasked?: boolean;
}

/**
 * Privacy-aware numeric renderer.
 *
 * Rules:
 *   - value null/undefined → renders `fallback` (default "—") regardless of mode
 *   - private mode → renders PRIVACY_MASKS[kind]
 *   - public mode  → renders `formatted` if given, else default-formats `value`
 */
export default function MoneyValue({
  value,
  kind = "currency",
  formatted,
  fallback = "—",
  className,
  style,
  mutedWhenMasked = true,
}: MoneyValueProps) {
  const { isPrivate } = usePrivacy();

  let display: string;
  if (isPrivate) {
    display = PRIVACY_MASKS[kind];
  } else if (formatted != null) {
    display = formatted;
  } else if (value == null || !Number.isFinite(value)) {
    display = fallback;
  } else {
    display = formatDefault(value, kind);
  }

  const mutedClass = isPrivate && mutedWhenMasked ? "text-muted-foreground" : "";
  return (
    <span className={[mutedClass, className].filter(Boolean).join(" ")} style={style}>
      {display}
    </span>
  );
}

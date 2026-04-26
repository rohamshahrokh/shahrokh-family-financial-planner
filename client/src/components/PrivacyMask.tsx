/**
 * PrivacyMask.tsx
 *
 * Exports:
 *   maskValue(value, hidden, type?) — pure helper function
 *   MaskedValue                     — React component
 */

/**
 * maskValue — returns a privacy-masked string when hidden=true.
 *
 * @param value  The real value to display
 * @param hidden Whether privacy mode is active
 * @param type   'currency' → '$••••••'
 *               'pct'      → '•••%'
 *               'text'     → '••••••'
 *               undefined  → same as 'currency'
 */
export function maskValue(
  value: string,
  hidden: boolean,
  type: "currency" | "pct" | "text" = "currency"
): string {
  if (!hidden) return value;
  if (type === "pct") return "•••%";
  if (type === "text") return "••••••";
  return "$••••••"; // currency (default)
}

interface MaskedValueProps {
  /** The real value string to show when not hidden */
  value: string;
  /** Whether privacy mode is active */
  hidden: boolean;
  /** Mask type: 'currency' (default), 'pct', or 'text' */
  type?: "currency" | "pct" | "text";
  /** Optional extra className applied to the span */
  className?: string;
}

/**
 * MaskedValue — renders a <span> that shows either the real value or
 * a bullet mask depending on the `hidden` prop.
 *
 * Usage:
 *   <MaskedValue value="$1,234" hidden={privacyMode} type="currency" />
 */
export function MaskedValue({ value, hidden, type = "currency", className = "" }: MaskedValueProps) {
  const display = maskValue(value, hidden, type);
  return (
    <span className={`${hidden ? "text-muted-foreground" : ""} ${className}`.trim()}>
      {display}
    </span>
  );
}

export default MaskedValue;

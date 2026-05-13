/**
 * PrivacyMask.tsx
 *
 * Exports:
 *   maskValue(value, hidden, type?) — pure helper function (legacy callers)
 *   MaskedValue                     — React component (legacy callers)
 *
 * NOTE: New code should prefer <MoneyValue> + usePrivacy() from
 * `@/contexts/PrivacyContext`. This file is kept so the ~30 existing
 * call-sites keep compiling while we migrate; the masks below are kept in
 * sync with `PRIVACY_MASKS` in PrivacyContext to avoid two truths.
 */

import { PRIVACY_MASKS, usePrivacy } from "@/contexts/PrivacyContext";

/**
 * maskValue — returns a privacy-masked string when hidden=true.
 *
 * @param value  The real value to display
 * @param hidden Whether privacy mode is active
 * @param type   'currency' → '$•••••'
 *               'pct'      → '••.•%'
 *               'text'     → '••••••'
 *               undefined  → same as 'currency'
 */
export function maskValue(
  value: string,
  hidden: boolean,
  type: "currency" | "pct" | "text" = "currency"
): string {
  if (!hidden) return value;
  if (type === "pct") return PRIVACY_MASKS.percent;
  if (type === "text") return "••••••";
  return PRIVACY_MASKS.currency;
}

interface MaskedValueProps {
  /** The real value string to show when not hidden */
  value: string;
  /**
   * Whether privacy mode is active. Pass `undefined` to read from the
   * PrivacyContext directly (new pattern; preferred).
   */
  hidden?: boolean;
  /** Mask type: 'currency' (default), 'pct', or 'text' */
  type?: "currency" | "pct" | "text";
  /** Optional extra className applied to the span */
  className?: string;
}

/**
 * MaskedValue — renders a <span> that shows either the real value or
 * a bullet mask depending on the `hidden` prop OR the PrivacyContext.
 *
 * Usage (legacy):
 *   <MaskedValue value="$1,234" hidden={privacyMode} type="currency" />
 *
 * Usage (preferred — privacy comes from context):
 *   <MaskedValue value="$1,234" type="currency" />
 */
export function MaskedValue({ value, hidden, type = "currency", className = "" }: MaskedValueProps) {
  const { isPrivate } = usePrivacy();
  const effectiveHidden = hidden ?? isPrivate;
  const display = maskValue(value, effectiveHidden, type);
  return (
    <span className={`${effectiveHidden ? "text-muted-foreground" : ""} ${className}`.trim()}>
      {display}
    </span>
  );
}

export default MaskedValue;

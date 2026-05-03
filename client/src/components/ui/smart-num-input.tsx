/**
 * SmartNumInput — iOS-safe numeric input for currency / percentage / count fields.
 *
 * iOS Safari PWA behaviour that breaks naive approaches:
 *  1. input.select() called from onFocus does NOT select text when triggered by touch
 *  2. type="number" on iOS shows a numpad without decimal on some regions
 *  3. The "readOnly trick": setting readOnly=true briefly, then removing it on
 *     touchstart forces iOS to pop up the keyboard fresh without pre-selecting
 *     the existing value, BUT combined with clearing/selecting the value in
 *     the touchend handler, this gives us reliable zero-replace behaviour.
 *
 * Correct iOS-safe approach used here:
 *  - type="text" with inputMode="decimal" (shows numeric keyboard + decimal on iOS)
 *  - Store raw string state; display "" when value is 0 (shows placeholder "0")
 *  - onTouchStart: if current value is 0 or empty, set raw="" so field is empty
 *    when keyboard opens — user types fresh digits
 *  - onFocus: select() + setSelectionRange(0, len) in rAF (not setTimeout, rAF
 *    fires after paint which is when iOS actually moves focus)
 *  - onChange: strip leading zeros immediately
 *  - onBlur: if empty → restore 0
 *  - Works: iPhone PWA, iOS Safari, Android Chrome, desktop Chrome/Edge/Safari
 */

import { useRef, useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";

interface SmartNumInputProps {
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Height class override, default "h-9" */
  heightClass?: string;
}

export function SmartNumInput({
  value,
  onChange,
  prefix,
  suffix,
  step = 1,
  min = 0,
  max,
  className = "",
  placeholder = "0",
  disabled = false,
  heightClass = "h-9",
}: SmartNumInputProps) {
  // Raw string the user is editing. We show "" for 0 so the placeholder "0" is visible.
  const toRaw = (n: number) => (n === 0 ? "" : String(n));
  const [raw, setRaw] = useState<string>(toRaw(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const lastExternalValue = useRef<number>(value);

  // Sync when value changes externally (scenario switch, form reset, etc.)
  useEffect(() => {
    if (value !== lastExternalValue.current) {
      lastExternalValue.current = value;
      setRaw(toRaw(value));
    }
  }, [value]);

  // Commit a clean numeric value back to parent
  const commit = useCallback((str: string) => {
    // Strip leading zeros (but keep "0." for decimals in progress)
    let clean = str.replace(/^(-?)0+([0-9])/, "$1$2");
    const num = parseFloat(clean);
    if (isNaN(num) || clean === "" || clean === "-") {
      const fallback = min ?? 0;
      lastExternalValue.current = fallback;
      onChange(fallback);
      return fallback;
    }
    const bounded = Math.max(
      min ?? -Infinity,
      max !== undefined ? Math.min(max, num) : num,
    );
    lastExternalValue.current = bounded;
    onChange(bounded);
    return bounded;
  }, [min, max, onChange]);

  // ── iOS Safari: touchstart clears the field if it shows zero ──────────────
  // This fires BEFORE focus, so when iOS opens the keyboard the field is already
  // empty, and the user's first keystroke fills it correctly.
  const handleTouchStart = useCallback(() => {
    if (raw === "" || parseFloat(raw) === 0) {
      setRaw("");
    }
  }, [raw]);

  // ── Focus: select all on desktop / non-touch (iOS handled via touchstart) ──
  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    // Use requestAnimationFrame — fires after iOS repositions the caret,
    // giving select() a chance to actually work.
    requestAnimationFrame(() => {
      try {
        el.select();
        el.setSelectionRange(0, el.value.length);
      } catch {}
    });
  }, []);

  // ── Change: strip leading zeros, validate ──────────────────────────────────
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let str = e.target.value;

    // Allow empty or in-progress negation
    if (str === "" || str === "-") {
      setRaw(str);
      return;
    }

    // Strip leading zeros (e.g. "0600000" → "600000", but allow "0.5")
    str = str.replace(/^(-?)0+([0-9])/, "$1$2");

    // Block non-numeric characters (allow one decimal point, optional leading minus)
    if (!/^-?[0-9]*\.?[0-9]*$/.test(str)) return;

    setRaw(str);

    // Commit to parent if we have a complete number
    const num = parseFloat(str);
    if (!isNaN(num)) {
      const bounded = Math.max(
        min ?? -Infinity,
        max !== undefined ? Math.min(max, num) : num,
      );
      lastExternalValue.current = bounded;
      onChange(bounded);
    }
  }, [min, max, onChange]);

  // ── Blur: normalise display, restore 0 if empty ───────────────────────────
  const handleBlur = useCallback(() => {
    if (raw === "" || raw === "-" || isNaN(parseFloat(raw))) {
      const fallback = min ?? 0;
      setRaw(toRaw(fallback));
      lastExternalValue.current = fallback;
      onChange(fallback);
    } else {
      const committed = commit(raw);
      setRaw(toRaw(committed));
    }
  }, [raw, min, commit, onChange]);

  const hasPadding = prefix || suffix;

  return (
    <div className="relative w-full">
      {prefix && (
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none select-none z-10"
          aria-hidden="true"
        >
          {prefix}
        </span>
      )}
      <Input
        ref={inputRef}
        // CRITICAL for iOS: type="text" + inputMode="decimal" shows the numeric
        // keyboard with decimal point. type="number" causes all the iOS quirks.
        type="text"
        inputMode="decimal"
        pattern="[0-9]*\.?[0-9]*"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        value={raw}
        placeholder={placeholder}
        disabled={disabled}
        onTouchStart={handleTouchStart}
        onFocus={handleFocus}
        onChange={handleChange}
        onBlur={handleBlur}
        className={[
          "bg-background/50 border-border text-sm w-full",
          heightClass,
          prefix ? "pl-7" : "",
          suffix ? "pr-8" : "",
          className,
        ].filter(Boolean).join(" ")}
      />
      {suffix && (
        <span
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none select-none z-10"
          aria-hidden="true"
        >
          {suffix}
        </span>
      )}
    </div>
  );
}

/**
 * SmartNumInput — polished numeric input for currency / percentage / count fields.
 *
 * Behaviour:
 *  • On focus: if value is 0 or "0", select all text (so typing replaces the zero)
 *  • On change: strip leading zeros (01800 → 1800), allow decimal values
 *  • On blur: if field is empty or NaN, restore the previous valid value (default: 0)
 *  • Works on iOS Safari, Android Chrome, desktop Chrome/Edge/Safari
 *
 * Usage:
 *   <SmartNumInput value={amount} onChange={v => setAmount(v)} prefix="$" />
 *   <SmartNumInput value={rate} onChange={v => setRate(v)} prefix="%" step={0.1} />
 */

import { useRef, useState, useEffect } from "react";
import { Input } from "@/components/ui/input";

interface SmartNumInputProps {
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  step?: number;
  min?: number;
  max?: number;
  decimals?: number;   // 0 = integer, 2 = currency, etc.
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function SmartNumInput({
  value,
  onChange,
  prefix,
  step = 1,
  min = 0,
  max,
  decimals,
  className = "",
  placeholder = "0",
  disabled = false,
}: SmartNumInputProps) {
  // We track the raw string the user is typing so we don't lose trailing dots/zeros
  const [raw, setRaw] = useState<string>(value === 0 ? "" : String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const prevValue = useRef<number>(value);

  // Keep raw in sync when value changes externally (e.g. scenario switch)
  useEffect(() => {
    if (value !== prevValue.current) {
      prevValue.current = value;
      setRaw(value === 0 ? "" : String(value));
    }
  }, [value]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Select all on focus so typing replaces the value
    e.target.select();
    // On iOS Safari, select() doesn't always fire — use setSelectionRange as fallback
    setTimeout(() => {
      try { e.target.setSelectionRange(0, e.target.value.length); } catch {}
    }, 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let str = e.target.value;

    // Allow empty (user cleared the field)
    if (str === "" || str === "-") {
      setRaw(str);
      return;
    }

    // Strip leading zeros (except "0." for decimals)
    str = str.replace(/^(-?)0+([0-9])/, "$1$2");

    // Only allow valid numeric characters
    const valid = /^-?[0-9]*\.?[0-9]*$/.test(str);
    if (!valid) return;

    setRaw(str);

    const num = parseFloat(str);
    if (!isNaN(num)) {
      const bounded = max !== undefined ? Math.min(max, num) : num;
      const floored = min !== undefined ? Math.max(min, bounded) : bounded;
      prevValue.current = floored;
      onChange(floored);
    }
  };

  const handleBlur = () => {
    const num = parseFloat(raw);
    if (raw === "" || raw === "-" || isNaN(num)) {
      // Restore to 0 (or min if specified)
      const fallback = min ?? 0;
      setRaw(fallback === 0 ? "" : String(fallback));
      prevValue.current = fallback;
      onChange(fallback);
    } else {
      // Normalise display (remove trailing dot)
      const clean = String(num);
      setRaw(clean === "0" ? "" : clean);
    }
  };

  // Display value: show empty string when 0 (so placeholder shows), or the raw string being typed
  const displayValue = raw;

  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none select-none z-10">
          {prefix}
        </span>
      )}
      <Input
        ref={inputRef}
        inputMode="decimal"
        type="text"
        pattern="[0-9]*\.?[0-9]*"
        value={displayValue}
        placeholder={placeholder}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        disabled={disabled}
        className={`bg-background/50 border-border text-sm h-9 ${prefix ? "pl-7" : ""} ${className}`}
      />
    </div>
  );
}

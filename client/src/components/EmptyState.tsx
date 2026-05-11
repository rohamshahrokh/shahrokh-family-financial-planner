/**
 * EmptyState — single component every "no data yet" surface should use.
 *
 * Why this exists (audit P1-9)
 * ----------------------------
 * The audit found "Portfolio Growth (10Y)" charts rendering as flat-zero
 * lines when the user had no holdings, instead of explicit empty states.
 * Same for the Reports "FIRE Estimate" / "Savings Rate" tiles which were
 * showing "0.0%" / "100.0%" / "NaN%" depending on which divide-by-zero
 * landed first. This component standardises the message: an icon, a
 * one-line title, a one-line description, and an optional CTA.
 */
import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** Lucide icon (or any node) rendered inside the circle. */
  icon: ReactNode;
  /** Short, sentence-cased headline ("No holdings yet"). */
  title: string;
  /** Single helper line explaining what to do next. */
  description?: string;
  /** Optional CTA — typically a `<Button>` or `<Link>`. */
  action?: ReactNode;
  /** Layout: "inline" for chart slots, "block" for tile slots. */
  variant?: "inline" | "block";
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
  variant = "block",
  className = "",
}: EmptyStateProps) {
  const padding = variant === "inline" ? "py-10" : "py-8";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center text-center ${padding} px-4 ${className}`.trim()}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-[hsl(var(--surface-2,222_18%_14%))] text-muted-foreground">
        {icon}
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-muted-foreground max-w-xs">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

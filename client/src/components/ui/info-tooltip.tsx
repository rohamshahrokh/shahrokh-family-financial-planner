/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  <InfoTooltip term="…" />
 *
 *  Small "i" icon that opens a short, plain-English explanation of a technical
 *  term. Uses Radix Popover so it works on touch (tap to open, tap outside to
 *  close) and on desktop. Mobile-first sizing.
 *
 *  Reads definitions from the central glossary at @/lib/glossary.
 *  Accessible: button with aria-label, focusable, ESC closes.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as React from "react";
import { Info } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { lookupGlossary } from "@/lib/glossary";

type Side = "top" | "right" | "bottom" | "left";

interface InfoTooltipProps {
  /** Glossary key (case-insensitive). e.g. "CVaR", "LVR", "P50". */
  term: string;
  /** Override the auto-resolved title. */
  title?: string;
  /** Override the auto-resolved short description (or supply if term is unknown). */
  description?: string;
  /** Override example text. */
  example?: string;
  /** Icon size in px. Default 14. */
  size?: number;
  /** Popover side. Default "top". */
  side?: Side;
  /** Extra class on the trigger button. */
  className?: string;
}

export function InfoTooltip({
  term,
  title,
  description,
  example,
  size = 14,
  side = "top",
  className,
}: InfoTooltipProps) {
  const entry = lookupGlossary(term);
  const resolvedTitle = title ?? entry?.title ?? term;
  const resolvedShort = description ?? entry?.short;
  const resolvedExample = example ?? entry?.example;

  // If we have nothing to show, render nothing (don't pollute the UI with an
  // empty popover button).
  if (!resolvedShort && !resolvedExample) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What does ${term} mean?`}
          className={cn(
            // Tap target: 24x24 (mobile-friendly) but icon stays small
            "inline-flex items-center justify-center align-middle",
            "h-6 w-6 rounded-full",
            "text-muted-foreground hover:text-foreground",
            "hover:bg-muted/60 focus-visible:bg-muted/60",
            "transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "-my-1", // visually neutral inline
            className,
          )}
        >
          <Info width={size} height={size} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="center"
        sideOffset={6}
        collisionPadding={12}
        className={cn(
          // Smaller, mobile-friendly width; uses semantic popover tokens so it
          // reads correctly in both light and dark mode.
          "w-[min(20rem,calc(100vw-2rem))] p-3",
          "bg-popover text-popover-foreground border-border",
          "shadow-lg",
        )}
        // Stop click-through on the underlying card (selected state, etc.)
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/90">
            {resolvedTitle}
          </div>
          {resolvedShort && (
            <p className="text-xs leading-relaxed text-foreground/85">
              {resolvedShort}
            </p>
          )}
          {resolvedExample && (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground/70">Example: </span>
              {resolvedExample}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default InfoTooltip;

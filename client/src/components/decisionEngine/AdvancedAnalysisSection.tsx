/**
 * AdvancedAnalysisSection.tsx — Progressive disclosure wrapper.
 *
 * The Decision Engine surfaces dense charts and quant-grade analytics
 * (score waterfall, tail-risk profile, terminal NW distribution,
 * invalidation engine, etc.). These are valuable for power users but
 * overwhelming as defaults. This component wraps them in a calm,
 * collapsible "Advanced analysis" section that defaults to closed.
 *
 * Pure UI primitive — no engine logic involved.
 */

import { ReactNode, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { HelpLink } from "@/components/help";

interface Props {
  /** Card title — e.g., "Advanced analysis" or "Deep dive". */
  title?: string;
  /** Optional short helper line shown next to the title. */
  hint?: string;
  /** Optional Help Center topic id for the "Learn more" icon link. */
  helpTopic?: string;
  /** Defaults to false (closed). */
  defaultOpen?: boolean;
  /** Data-testid for QA. */
  dataTestid?: string;
  /** Children render when expanded. */
  children: ReactNode;
}

export function AdvancedAnalysisSection({
  title = "Advanced analysis",
  hint = "More detail for power users — optional",
  helpTopic,
  defaultOpen = false,
  dataTestid,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-lg border border-border bg-card/60 dark:bg-card/40 overflow-hidden transition-colors"
      data-testid={dataTestid}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3 text-left hover:bg-muted/30 transition-colors min-h-[48px]"
      >
        <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--intelligence-light))] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs sm:text-sm font-semibold text-foreground">{title}</span>
            {helpTopic && (
              <HelpLink
                topic={helpTopic}
                variant="icon"
                ariaLabel="Learn more"
                className="opacity-60 hover:opacity-100 transition-opacity"
              />
            )}
          </div>
          <div className="text-[10px] sm:text-[11px] text-muted-foreground leading-snug truncate">
            {hint}
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-1 space-y-3 border-t border-border/50">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * DecisionFrame — Sprint 12 universal 6-dimension decision card.
 *
 * Renders the standard advisor frame:
 *   1. Current Position   | 2. Target Position
 *   3. Gap (spans)
 *   4. Recommended Action | 5. Expected Outcome
 *   6. Do Nothing Outcome (spans)
 *
 * Empty-field rule: if a slot's value is empty (per `isEmptyValue`), the slot
 * collapses entirely — we NEVER render "—" or "Incomplete" copy.
 */

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isEmptyValue } from "@/lib/uiEmptyField";

export type DecisionStatus = "on-track" | "at-risk" | "off-track";

export interface DecisionSlot {
  label: string;
  value: string | number | null | undefined;
  subtitle?: string;
  status?: DecisionStatus;
  ctaHref?: string;
  ctaLabel?: string;
}

export interface DecisionFrameProps {
  currentPosition?: DecisionSlot;
  targetPosition?: DecisionSlot;
  gap?: DecisionSlot & { direction?: "positive" | "negative" | "neutral" };
  recommendedAction?: DecisionSlot;
  expectedOutcome?: DecisionSlot;
  doNothingOutcome?: DecisionSlot;
  testidPrefix: string;
  title?: string;
  subtitle?: string;
  className?: string;
}

function statusTone(status?: DecisionStatus): string {
  if (status === "on-track")
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40";
  if (status === "at-risk")
    return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40";
  if (status === "off-track")
    return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40";
  return "";
}

function slotHasContent(slot: DecisionSlot | undefined): slot is DecisionSlot {
  if (!slot) return false;
  return !isEmptyValue(slot.value);
}

interface SlotCardProps {
  slot: DecisionSlot;
  testid: string;
  span?: boolean;
  emphasize?: "primary" | "muted" | "warn";
  direction?: "positive" | "negative" | "neutral";
}

function SlotCard({ slot, testid, span, emphasize, direction }: SlotCardProps) {
  const valueClass = cn(
    "text-2xl font-semibold tabular-nums leading-tight",
    direction === "positive" && "text-emerald-700 dark:text-emerald-300",
    direction === "negative" && "text-rose-700 dark:text-rose-300",
  );
  const border = cn(
    "rounded-lg border bg-card/70 p-4",
    emphasize === "primary" && "border-emerald-500/30 bg-emerald-500/5",
    emphasize === "muted" && "border-border bg-muted/30",
    emphasize === "warn" && "border-amber-500/30 bg-amber-500/5",
    !emphasize && "border-border",
    span && "sm:col-span-2",
  );
  return (
    <div className={border} data-testid={testid}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {slot.label}
        </div>
        {slot.status ? (
          <span
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full border font-medium",
              statusTone(slot.status),
            )}
            data-testid={`${testid}-status`}
          >
            {slot.status.replace(/-/g, " ")}
          </span>
        ) : null}
      </div>
      <div className={valueClass} data-testid={`${testid}-value`}>
        {slot.value}
      </div>
      {slot.subtitle && !isEmptyValue(slot.subtitle) ? (
        <div
          className="text-[11px] text-muted-foreground mt-1 leading-relaxed"
          data-testid={`${testid}-subtitle`}
        >
          {slot.subtitle}
        </div>
      ) : null}
      {slot.ctaHref && slot.ctaLabel ? (
        <div className="mt-3">
          <a href={slot.ctaHref} data-testid={`${testid}-cta`}>
            <Button size="sm" variant="default" className="gap-1">
              {slot.ctaLabel}
              <ArrowRight className="h-3 w-3" />
            </Button>
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function DecisionFrame({
  currentPosition,
  targetPosition,
  gap,
  recommendedAction,
  expectedOutcome,
  doNothingOutcome,
  testidPrefix,
  title,
  subtitle,
  className,
}: DecisionFrameProps) {
  const hasCurrent = slotHasContent(currentPosition);
  const hasTarget = slotHasContent(targetPosition);
  const hasGap = slotHasContent(gap);
  const hasAction = slotHasContent(recommendedAction);
  const hasExpected = slotHasContent(expectedOutcome);
  const hasDoNothing = slotHasContent(doNothingOutcome);

  const anyContent = hasCurrent || hasTarget || hasGap || hasAction || hasExpected || hasDoNothing;
  if (!anyContent) return null;

  return (
    <Card
      className={cn("p-4 sm:p-5 border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-card to-card", className)}
      data-testid={testidPrefix}
    >
      {(title || subtitle) && (
        <header className="mb-3">
          {title && (
            <h2 className="text-lg sm:text-xl font-semibold text-foreground" data-testid={`${testidPrefix}-title`}>
              {title}
            </h2>
          )}
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">{subtitle}</p>
          )}
        </header>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {hasCurrent && (
          <SlotCard slot={currentPosition!} testid={`${testidPrefix}-current`} />
        )}
        {hasTarget && (
          <SlotCard slot={targetPosition!} testid={`${testidPrefix}-target`} />
        )}
        {hasGap && (
          <SlotCard
            slot={gap!}
            testid={`${testidPrefix}-gap`}
            span
            emphasize="warn"
            direction={gap?.direction}
          />
        )}
        {hasAction && (
          <SlotCard
            slot={recommendedAction!}
            testid={`${testidPrefix}-recommended-action`}
            emphasize="primary"
          />
        )}
        {hasExpected && (
          <SlotCard
            slot={expectedOutcome!}
            testid={`${testidPrefix}-expected-outcome`}
          />
        )}
        {hasDoNothing && (
          <SlotCard
            slot={doNothingOutcome!}
            testid={`${testidPrefix}-do-nothing`}
            span
            emphasize="muted"
          />
        )}
      </div>
    </Card>
  );
}

export default DecisionFrame;

/**
 * YearByYearRoadmap — Action Roadmap Sprint 30C.
 *
 * Renders 7 calendar-year cards (current year .. +6). Each card shows:
 *   • Year header
 *   • EOY net worth (P50 from MC fan)
 *   • EOY monthly passive income at SWR
 *   • FIRE progress (% of target NW)
 *   • Milestone bullet list per category with reason
 *
 * Honesty:
 *   • `years.length === 0` → "Not modelled yet" banner
 *   • Year with no milestones → renders "Background growth only — no
 *     engine-modelled milestones in this year."
 *   • All $ figures pulled from `delta.params`, no fabrication.
 */
import * as React from "react";
import { Calendar, Home, RefreshCw, ArrowUpRight, TrendingDown, LineChart, Flag, Coins, Sparkles } from "lucide-react";
import type { RoadmapSectionProps } from "./roadmapContext";
import type { YearCard, YearMilestone, YearMilestoneCategory, YearByYearRoadmap as YearByYearRoadmapData } from "@/lib/actionRoadmap/yearByYearRoadmap";

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

const CATEGORY_LABEL: Record<YearMilestoneCategory, string> = {
  acquisition: "Acquisition",
  refinance: "Refinance",
  equity_release: "Equity release",
  debt: "Debt",
  investment: "Investment",
  fire: "FIRE",
  passive: "Passive income",
};

const CATEGORY_TONE: Record<YearMilestoneCategory, string> = {
  acquisition:    "bg-blue-100 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/25",
  refinance:      "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25",
  equity_release: "bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-400/25",
  debt:           "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25",
  investment:     "bg-indigo-100 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/25",
  fire:           "bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/25",
  passive:        "bg-teal-100 text-teal-700 ring-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-400/25",
};

function categoryIcon(c: YearMilestoneCategory): React.ReactNode {
  const cls = "h-3.5 w-3.5";
  switch (c) {
    case "acquisition":    return <Home className={cls} aria-hidden />;
    case "refinance":      return <RefreshCw className={cls} aria-hidden />;
    case "equity_release": return <ArrowUpRight className={cls} aria-hidden />;
    case "debt":           return <TrendingDown className={cls} aria-hidden />;
    case "investment":     return <LineChart className={cls} aria-hidden />;
    case "fire":           return <Flag className={cls} aria-hidden />;
    case "passive":        return <Coins className={cls} aria-hidden />;
  }
}

function MilestoneRow({ m }: { m: YearMilestone }): JSX.Element {
  const tone = CATEGORY_TONE[m.category];
  const label = CATEGORY_LABEL[m.category];
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border/50 bg-card/40 p-3" data-testid={`ar-year-milestone-${m.category}`}>
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${tone}`}>
        {categoryIcon(m.category)}
        {label}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{m.label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{m.reason}</div>
      </div>
    </li>
  );
}

function YearCardView({ card }: { card: YearCard }): JSX.Element {
  const highlight = card.isFireYear;
  return (
    <article
      data-testid={`ar-year-card-${card.year}`}
      className={
        highlight
          ? "rounded-2xl border border-violet-300/70 bg-violet-50/50 p-4 shadow-sm dark:border-violet-400/30 dark:bg-violet-950/20"
          : "rounded-2xl border border-border/70 bg-card p-4 shadow-sm"
      }
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h3 className="text-base font-semibold text-foreground">{card.year}</h3>
          {highlight && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-700 ring-1 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/25">
              <Sparkles className="h-3 w-3" aria-hidden /> FIRE year
            </span>
          )}
        </div>
        <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <div className="flex items-baseline gap-1">
            <dt>EOY NW</dt>
            <dd className="font-semibold text-foreground">{fmtMoney(card.netWorthEoy)}</dd>
          </div>
          <div className="flex items-baseline gap-1">
            <dt>Passive/mo</dt>
            <dd className="font-semibold text-foreground">{fmtMoney(card.passiveIncomeMonthlyEoy)}</dd>
          </div>
          <div className="flex items-baseline gap-1">
            <dt>FIRE</dt>
            <dd className="font-semibold text-foreground">{fmtPct(card.fireProgress)}</dd>
          </div>
        </dl>
      </header>

      {card.noMilestones ? (
        <p className="mt-3 text-sm text-muted-foreground" data-testid={`ar-year-card-${card.year}-empty`}>
          Background growth only — no engine-modelled milestones land in this year.
        </p>
      ) : (
        <ul className="mt-3 space-y-2" data-testid={`ar-year-card-${card.year}-milestones`}>
          {card.milestones.map((m) => (
            <MilestoneRow key={m.id} m={m} />
          ))}
        </ul>
      )}
    </article>
  );
}

export function YearByYearRoadmap(props: RoadmapSectionProps & { yearByYear: YearByYearRoadmapData }): JSX.Element {
  const { yearByYear } = props;

  return (
    <section
      data-testid="ar-year-by-year"
      aria-labelledby="ar-yby-heading"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <header>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Year-by-year roadmap</div>
        <h2 id="ar-yby-heading" className="text-base font-semibold text-foreground">What happens each year</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Every acquisition, refinance, equity release, debt move, FIRE crossing, and passive-income milestone derived from the recommended path — with the reason each one fires.
        </p>
      </header>

      {yearByYear.years.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground" data-testid="ar-year-by-year-empty">
          {yearByYear.reason ?? "Not modelled yet."}
        </p>
      ) : (
        <div className="mt-4 space-y-3" data-testid="ar-year-by-year-list">
          {yearByYear.years.map((y) => (
            <YearCardView key={y.year} card={y} />
          ))}
        </div>
      )}
    </section>
  );
}

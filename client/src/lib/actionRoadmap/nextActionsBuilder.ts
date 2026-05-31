/**
 * actionRoadmap/nextActionsBuilder.ts — Sprint 28B.
 *
 * Turns the engine-derived `RoadmapMilestone[]` into a partitioned
 * checklist (THIS MONTH / NEXT 90 DAYS / NEXT 12 MONTHS). Each item is
 * a verb-led prep action tied back to its source milestone.
 *
 * THIS MODULE INVENTS NO MILESTONES. It expands each milestone label into
 * 1–3 prep actions via a small lookup table keyed by substring; when no
 * match, a single fallback "Review milestone: <label>" entry is emitted.
 *
 * Honesty rules:
 *   - Buckets derive from `milestone.month` vs `today`. Past milestones are
 *     dropped (they don't belong to "next" actions).
 *   - Beyond 365 days → not included in any bucket.
 *   - Empty bucket → the UI renders "Nothing scheduled" itself; the
 *     selector simply returns an empty array for that bucket.
 */
import type { RoadmapMilestone } from "./types";

// Sprint 29 §11.1 — bucket renamed from "this_month" → "next_30_days".
export type NextActionsBucket = "next_30_days" | "next_90_days" | "next_12_months" | "later";

export interface NextActionItem {
  id: string;
  title: string;
  due: string; // 'YYYY-MM' (echoes milestone.month) or 'YYYY-MM-DD'
  sourceMilestoneId: string;
  bucket: NextActionsBucket;
}

export interface NextActionsBuckets {
  /** Sprint 29 §11.1 — renamed from `thisMonth`. UI label is "NEXT 30 DAYS". */
  next30Days: NextActionItem[];
  next90Days: NextActionItem[];
  next12Months: NextActionItem[];
}

export interface BuildInput {
  milestones: RoadmapMilestone[];
  today: Date;
}

interface ActionTemplate {
  matcher: RegExp;
  actions: string[];
}

// Small lookup table — keyed by milestone-label substring. Each entry maps
// to 1–3 verb-led prep actions. Add entries here as new templates land in
// the engine; never invent generic actions.
const ACTION_TEMPLATES: ActionTemplate[] = [
  // FWL-079 — the action-roadmap builder now produces labels like
  // "Acquire investment property in 6 months" / "Acquire investment property
  // (equity-funded)" / "Acquire second investment property (equity-funded)".
  // The broader regex still catches the legacy "Buy property" wording from
  // the Wealth Timeline Gantt path so both surfaces stay in sync.
  { matcher: /\b(buy|acquire)\b.*property/i, actions: [
      "Speak with mortgage broker",
      "Validate borrowing capacity",
      "Build deposit structure",
  ]},
  // Genuine deposit top-up (only emitted for the rare deposit-only case after
  // a multi-IP-ladder mid-phase). We keep a dedicated entry so it surfaces a
  // verb-led prep step rather than the generic fallback.
  { matcher: /deposit top-?up/i, actions: [
      "Confirm offset / savings transfer",
      "Update broker on additional deposit",
  ]},
  { matcher: /sell.*property/i, actions: [
      "Engage a sales agent",
      "Order independent valuation",
  ]},
  { matcher: /etf.*lump|lump.*sum.*etf|ETF lump-sum/i, actions: [
      "Confirm brokerage account is funded",
      "Review target ETF allocation",
  ]},
  { matcher: /etf.*dca|dollar-cost averaging/i, actions: [
      "Schedule monthly transfer",
      "Set up rebalancing reminder",
  ]},
  { matcher: /offset.*deposit/i, actions: [
      "Move surplus into offset",
      "Reduce idle cash position",
  ]},
  { matcher: /super.*contribution|salary sacrifice|concessional/i, actions: [
      "Update salary-sacrifice election",
      "Confirm concessional cap headroom",
  ]},
  { matcher: /refinance/i, actions: [
      "Request 3 refinance quotes",
      "Compare break costs vs rate savings",
  ]},
  { matcher: /extra.*repayment|mortgage.*repayment/i, actions: [
      "Set up additional repayment",
      "Confirm redraw access if needed",
  ]},
  { matcher: /career break/i, actions: [
      "Build 12-month liquidity buffer",
      "Confirm insurance cover continues",
  ]},
  { matcher: /salary change/i, actions: [
      "Update household cashflow model",
  ]},
  { matcher: /rentvest/i, actions: [
      "Engage rentvest-friendly broker",
      "Review tax outcome with accountant",
  ]},
  { matcher: /crypto/i, actions: [
      "Confirm exchange security setup",
  ]},
];

function actionsFor(label: string): string[] {
  for (const t of ACTION_TEMPLATES) {
    if (t.matcher.test(label)) return t.actions;
  }
  return [`Review milestone: ${label}`];
}

function bucketFor(due: Date, today: Date): NextActionsBucket {
  const ms = due.getTime() - today.getTime();
  const days = ms / (1000 * 60 * 60 * 24);
  if (days <= 30) return "next_30_days";
  if (days <= 90) return "next_90_days";
  if (days <= 365) return "next_12_months";
  return "later";
}

function monthKeyToDate(mk: string): Date | null {
  // Accept 'YYYY-MM' or 'YYYY-MM-DD'. We anchor 'YYYY-MM' to day 1.
  const parts = mk.split("-");
  if (parts.length < 2) return null;
  const y = parseInt(parts[0] ?? "0", 10);
  const m = parseInt(parts[1] ?? "0", 10);
  const d = parts.length >= 3 ? parseInt(parts[2] ?? "1", 10) : 1;
  if (![y, m, d].every((v) => Number.isFinite(v))) return null;
  return new Date(y, m - 1, d);
}

export function buildNextActions(input: BuildInput): NextActionsBuckets {
  const { milestones, today } = input;
  const out: NextActionsBuckets = { next30Days: [], next90Days: [], next12Months: [] };
  if (!Array.isArray(milestones) || milestones.length === 0) return out;

  // Sprint 29 §11.2 — dedup by (title, sourceMilestoneId). Same title across
  // different milestones is kept (still a distinct action); same title +
  // same milestone is collapsed to one entry.
  const seen = new Set<string>();
  const key = (title: string, sourceMilestoneId: string) => `${title}::${sourceMilestoneId}`;

  for (const m of milestones) {
    if (m.status === "completed" || m.status === "fire") continue; // skip past + terminal
    const due = monthKeyToDate(m.month);
    if (!due) continue;
    const bucket = bucketFor(due, today);
    if (bucket === "later") continue;

    const titles = actionsFor(m.label);
    for (let i = 0; i < titles.length; i++) {
      const title = titles[i]!;
      const k = key(title, m.id);
      if (seen.has(k)) continue;
      seen.add(k);

      const item: NextActionItem = {
        id: `${m.id}-${i}`,
        title,
        due: m.month,
        sourceMilestoneId: m.id,
        bucket,
      };
      if (bucket === "next_30_days")   out.next30Days.push(item);
      if (bucket === "next_90_days")   out.next90Days.push(item);
      if (bucket === "next_12_months") out.next12Months.push(item);
    }
  }

  return out;
}

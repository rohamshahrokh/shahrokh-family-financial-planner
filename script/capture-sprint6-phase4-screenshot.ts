/**
 * capture-sprint6-phase4-screenshot.ts
 *
 * Sprint 6 Phase 4 — render the Goal Closure Lab as SSR HTML so the
 * structure can be inspected without a running dev server. Used as a
 * screenshot substitute when local dev/production build is blocked.
 *
 * Outputs:
 *   /tmp/sprint6-phase4-goal-closure-lab.html         (desktop preview)
 *   /tmp/sprint6-phase4-goal-closure-lab-mobile.html  (mobile preview)
 *   /tmp/sprint6-phase4-goal-closure-lab-empty.html   (empty-state preview)
 *   screenshots/sprint6-phase4-goal-closure-lab.html  (committed for the PR)
 *   screenshots/sprint6-phase4-goal-closure-lab-mobile.html
 */

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";

import { GoalClosureLab } from "../client/src/components/GoalClosureLab";
import type { DashboardInputs } from "../client/src/lib/dashboardDataContract";

const SNAPSHOT_RICH = {
  ppor: 1_510_000,
  cash: 40_000,
  offset_balance: 222_000,
  super_balance: 88_000,
  stocks: 0,
  crypto: 0,
  cars: 65_000,
  iran_property: 150_000,
  mortgage: 1_200_000,
  mortgage_rate: 5.85,
  mortgage_term_years: 28,
  mortgage_loan_type: "PI",
  other_debts: 19_000,
  roham_monthly_income: 15_466.67,
  fara_monthly_income: 15_166.67,
  monthly_expenses: 15_000,
  expenses_includes_debt: true,
  rental_income_total: 0,
  fire_target_monthly_income: 8_000,
  safe_withdrawal_rate: 4,
};

const FIXTURE: DashboardInputs = {
  snapshot: SNAPSHOT_RICH,
  properties: [],
  stocks: [],
  cryptos: [],
  holdingsRaw: [],
  incomeRecords: [],
  expenses: [],
  todayIso: "2026-05-25",
};

const EMPTY_LEDGER: DashboardInputs = {
  snapshot: null,
  properties: [],
  stocks: [],
  cryptos: [],
  holdingsRaw: [],
  incomeRecords: [],
  expenses: [],
  todayIso: "2026-05-25",
};

const TAILWIND_CDN = '<script src="https://cdn.tailwindcss.com"></script>';

function wrap(title: string, body: string, mobile: boolean) {
  const viewport = mobile
    ? '<meta name="viewport" content="width=375,initial-scale=1">'
    : '<meta name="viewport" content="width=1280,initial-scale=1">';
  const containerWidth = mobile ? "max-width:375px;" : "max-width:1280px;";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${viewport}
<title>${title}</title>
${TAILWIND_CDN}
<style>
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --border: 214.3 31.8% 91.4%;
  }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         background: hsl(var(--muted)); color: hsl(var(--foreground)); margin: 0; padding: 24px 0; }
  .bg-card { background: hsl(var(--card)); }
  .bg-muted\\/40 { background: hsl(var(--muted) / 0.4); }
  .bg-muted\\/30 { background: hsl(var(--muted) / 0.3); }
  .bg-muted\\/20 { background: hsl(var(--muted) / 0.2); }
  .bg-muted\\/10 { background: hsl(var(--muted) / 0.1); }
  .text-foreground { color: hsl(var(--foreground)); }
  .text-muted-foreground { color: hsl(var(--muted-foreground)); }
  .border-border { border-color: hsl(var(--border)); }
  .ring-border { --tw-ring-color: hsl(var(--border)); box-shadow: 0 0 0 1px hsl(var(--border)); }
  .ring-1 { --tw-ring-shadow: 0 0 0 1px hsl(var(--border)); box-shadow: var(--tw-ring-shadow); }
  .ring-emerald-500\\/50, .ring-emerald-500\\/60 { box-shadow: 0 0 0 2px rgba(16,185,129,0.5); }
  .tabular-nums { font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<div style="${containerWidth}margin:0 auto;padding:0 16px;">
  <h1 style="font-size:1.5rem;font-weight:600;margin-bottom:8px;">Goal Closure Lab</h1>
  <p style="font-size:0.875rem;color:#475569;margin-bottom:24px;">
    The primary decision-making workspace of Family Wealth Lab. Sprint 6 Phase 4 SSR preview.
  </p>
  ${body}
</div>
</body>
</html>`;
}

function render(ledger: DashboardInputs, mobile: boolean): string {
  return renderToStaticMarkup(
    React.createElement(GoalClosureLab, { canonicalLedger: ledger }),
  );
}

function writeOut(path: string, html: string) {
  if (!existsSync(dirname(path))) {
    mkdirSync(dirname(path), { recursive: true });
  }
  writeFileSync(path, html);
  console.log(`wrote ${path} (${html.length} bytes)`);
}

const desktopBody = render(FIXTURE, false);
const desktopHtml = wrap("Goal Closure Lab — Desktop", desktopBody, false);
writeOut("/tmp/sprint6-phase4-goal-closure-lab.html", desktopHtml);
writeOut("screenshots/sprint6-phase4-goal-closure-lab.html", desktopHtml);

const mobileBody = render(FIXTURE, true);
const mobileHtml = wrap("Goal Closure Lab — Mobile", mobileBody, true);
writeOut("/tmp/sprint6-phase4-goal-closure-lab-mobile.html", mobileHtml);
writeOut("screenshots/sprint6-phase4-goal-closure-lab-mobile.html", mobileHtml);

const emptyBody = render(EMPTY_LEDGER, false);
const emptyHtml = wrap("Goal Closure Lab — Empty", emptyBody, false);
writeOut("/tmp/sprint6-phase4-goal-closure-lab-empty.html", emptyHtml);

console.log("Sprint 6 Phase 4 SSR previews written.");
